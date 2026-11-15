import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { compareCasePhotos } from '@/lib/case-photo-compare';
import { defaultClaudeModel } from '@/lib/claude-json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// Compares the move-in and move-out photo the renter chose for one charge on
// the case's Photos tab. Files are read with the renter's own session, so
// row-level security and the storage policies decide what can be compared.

const authOptions = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
const respond = (error: string, status: number) =>
  Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const shortId = /^[A-Za-z0-9_-]{1,64}$/;
const photoLongEdge = 1568;
const maxPhotoPixels = 64_000_000;

// Each comparison sends two photos to a model. Per server instance: it limits bursts.
const recent = new Map<string, number[]>();
function allow(userId: string) {
  const now = Date.now();
  const times = (recent.get(userId) ?? []).filter((time) => now - time < 60_000);
  if (times.length >= 6) return false;
  times.push(now);
  recent.set(userId, times);
  if (recent.size > 5000) recent.clear();
  return true;
}

type StoredCase = {
  charges: { source_id?: string; name?: string; room?: string }[];
  evidence: { source_id?: string; name?: string; kind?: string; path?: string; bucket?: string }[];
};

// Names the service and status only, never response text or keys.
function failure(error: unknown) {
  if (error instanceof Error && error.name === 'TimeoutError') return 'the AI service took too long';
  const message = error instanceof Error ? error.message : '';
  if (error instanceof Error && error.name === 'AiServiceError') return message.slice(0, -1);
  return /^(Gemini|Claude) (request failed \(\d{3}\)|did not return a complete \w+|declined the request|could not be reached)\.$/.test(message)
    ? message.slice(0, -1)
    : 'unexpected error';
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const claudeKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!url || !publishableKey || (!claudeKey && !geminiKey)) {
    return respond('Photo analysis isn’t set up yet. Ask your project admin to add the Claude API key.', 503);
  }
  const startedAt = Date.now();

  const accessToken = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!accessToken) return respond('Sign in to compare photos.', 401);

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return respond('Invalid request.', 400);
  }
  const { caseId, chargeId, beforeId, afterId, consent } = body ?? {};
  if (typeof caseId !== 'string' || !uuid.test(caseId)) return respond('Invalid case.', 400);
  if ([chargeId, beforeId, afterId].some((id) => typeof id !== 'string' || !shortId.test(id))) {
    return respond('Choose a move-in and a move-out photo for this charge.', 400);
  }
  if (consent !== true) return respond('Confirm that these two photos can be sent for analysis.', 400);

  const renter = createClient(url, publishableKey, {
    auth: authOptions,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const auth = await renter.auth.getUser(accessToken);
  if (auth.error || !auth.data.user) return respond('Your session expired. Sign in again.', 401);
  const userId = auth.data.user.id;
  if (!allow(userId)) return respond('Several comparisons were just run. Wait a minute, then try again.', 429);

  const found = await renter.from('cases').select('charges, evidence')
    .eq('id', caseId).eq('user_id', userId).maybeSingle<StoredCase>();
  if (found.error) return respond('Could not open your case. Try again in a moment.', 503);
  if (!found.data) return respond('This case is unavailable.', 404);

  const charge = (Array.isArray(found.data.charges) ? found.data.charges : []).find((item) => item.source_id === chargeId);
  if (!charge || typeof charge.name !== 'string') return respond('Save the case, then try again: this charge isn’t saved yet.', 409);
  const evidence = Array.isArray(found.data.evidence) ? found.data.evidence : [];
  const side = (id: string, kind: 'before' | 'after') => evidence.find((file) => file.source_id === id && file.kind === kind);
  const files = [side(beforeId as string, 'before'), side(afterId as string, 'after')];
  if (files.some((file) => !file)) return respond('Choose one move-in photo and one move-out photo saved with this case.', 400);
  if (files.some((file) => file!.bucket !== 'photos' || !file!.path?.startsWith(`${userId}/${caseId}/`))) {
    return respond('One of these photos isn’t stored with this case. Add it again.', 409);
  }

  // Only the copy sent to the model is resized; the originals are untouched.
  const prepared: { id: string; name: string; mime: string; data: string }[] = [];
  for (const file of files) {
    const download = await renter.storage.from('photos').download(file!.path!);
    if (download.error || !download.data) return respond(`“${file!.name ?? file!.source_id}” could not be opened. Try again.`, 503);
    try {
      const image = sharp(Buffer.from(await download.data.arrayBuffer()), { limitInputPixels: maxPhotoPixels });
      const { format } = await image.metadata();
      if (format !== 'jpeg' && format !== 'png' && format !== 'webp' && format !== 'heif') throw new Error('format');
      const data = await image.autoOrient()
        .resize(photoLongEdge, photoLongEdge, { fit: 'inside', withoutEnlargement: true })
        .flatten({ background: '#fff' }).jpeg({ quality: 85 }).toBuffer();
      prepared.push({ id: file!.source_id!, name: String(file!.name ?? file!.source_id).slice(0, 160), mime: 'image/jpeg', data: data.toString('base64') });
    } catch {
      return respond(`“${file!.name ?? file!.source_id}” can’t be analyzed. Use a JPG or PNG photo.`, 400);
    }
  }

  try {
    const comparison = await compareCasePhotos({
      charge: { id: chargeId as string, name: charge.name.slice(0, 160), room: String(charge.room ?? '').slice(0, 80) },
      before: prepared[0],
      after: prepared[1],
      claudeKey,
      claudeModel: process.env.ANTHROPIC_MODEL || defaultClaudeModel,
      geminiKey,
      geminiModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
      startedAt,
    });
    return Response.json({ comparison }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const reason = failure(error);
    console.warn('Case photo comparison failed:', reason);
    return respond(`The photo comparison couldn’t finish (${reason}). Try again in a moment.`, 502);
  }
}
