import { createClient } from '@supabase/supabase-js';
import { defaultClaudeModel } from '@/lib/claude-json';
import { neutralService } from '@/lib/neutral-copy';
import { extractLetter, type LetterFile } from '@/lib/letter-extract';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const authOptions = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
const respond = (error: string, status: number, code = 'extract_failed') =>
  Response.json({ error, code }, { status, headers: { 'Cache-Control': 'no-store' } });

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const mimes = ['application/pdf', 'image/png', 'image/jpeg'];
const limit = { count: 4, bytes: 12 * 1024 * 1024 };

// Each reading sends the renter's documents to a model, so it is rationed.
const recent = new Map<string, number[]>();
function allow(userId: string) {
  const now = Date.now();
  const times = (recent.get(userId) ?? []).filter((time) => now - time < 60_000);
  if (times.length >= 4) return false;
  times.push(now);
  recent.set(userId, times);
  if (recent.size > 5000) recent.clear();
  return true;
}

// Names the service and status only, never keys or provider response text.
function failure(error: unknown) {
  if (error instanceof Error && error.name === 'TimeoutError') return 'the AI service took too long';
  const message = error instanceof Error ? error.message : '';
  if (error instanceof Error && error.name === 'AiServiceError') return message.slice(0, -1);
  return /^(Gemini|Claude) (request failed \(\d{3}\)|did not return a complete \w+|declined the request|could not be reached)\.$/.test(message)
    ? message.slice(0, -1)
    : 'unexpected error';
}

type StoredCase = { evidence: { source_id?: string; name?: string; kind?: string; type?: string; path?: string; bucket?: string }[] };

// Reads the charges out of the renter's uploaded deduction letter so the
// wizard can fill them in for the renter to confirm.
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  const claudeKey = process.env.ANTHROPIC_API_KEY;
  if (!url || !publishableKey || (!claudeKey && !geminiKey)) {
    return respond('Reading letters automatically isn’t set up yet. Enter the charges by hand.', 503, 'setup');
  }
  const accessToken = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!accessToken) return respond('Sign in to keep going.', 401, 'signed_out');

  let caseId: unknown;
  let consent: unknown;
  try {
    ({ caseId, consent } = (await request.json()) as Record<string, unknown>);
  } catch {
    return respond('Invalid request.', 400, 'validation');
  }
  if (typeof caseId !== 'string' || !uuid.test(caseId)) return respond('Invalid case.', 400, 'validation');
  if (consent !== true) return respond('Confirm that your letter can be sent for reading.', 400, 'consent');

  // Read with the renter's own session: row-level security and the storage
  // policies decide which case and files this request can open.
  const renter = createClient(url, publishableKey, {
    auth: authOptions,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const auth = await renter.auth.getUser(accessToken);
  if (auth.error || !auth.data.user) return respond('Your session expired. Sign in again.', 401, 'signed_out');
  const userId = auth.data.user.id;
  if (!allow(userId)) return respond('The letter was just read. Wait a minute, then try again.', 429, 'rate_limited');

  const found = await renter.from('cases').select('evidence').eq('id', caseId).eq('user_id', userId).maybeSingle<StoredCase>();
  if (found.error) return respond('Could not open your case. Try again in a moment.', 503);
  if (!found.data) return respond('This case is unavailable.', 404, 'not_found');

  // Letters first; the lease only adds context such as the deposit amount.
  const documents = (Array.isArray(found.data.evidence) ? found.data.evidence : [])
    .filter((file) => typeof file.source_id === 'string' && (file.kind === 'letter' || file.kind === 'lease'))
    .sort((a, b) => Number(b.kind === 'letter') - Number(a.kind === 'letter'));
  const chosen = documents
    .flatMap((file) => (file.path && file.bucket === 'documents' && file.path.startsWith(`${userId}/${caseId}/`) ? [{ ...file, path: file.path }] : []))
    .slice(0, limit.count);
  // Fetch the files all at once.
  const downloads = await Promise.all(chosen.map((file) => renter.storage.from('documents').download(file.path)));
  const files: LetterFile[] = [];
  let bytes = 0;
  for (const [index, file] of chosen.entries()) {
    const download = downloads[index];
    if (download.error || !download.data) continue;
    const mime = mimes.includes(download.data.type) ? download.data.type : String(file.type);
    if (!mimes.includes(mime) || bytes + download.data.size > limit.bytes) continue;
    bytes += download.data.size;
    files.push({
      id: file.source_id!, kind: file.kind as LetterFile['kind'], name: String(file.name ?? file.source_id).slice(0, 160),
      mime, data: Buffer.from(await download.data.arrayBuffer()).toString('base64'),
    });
  }
  if (!files.some((file) => file.kind === 'letter')) {
    return respond('We couldn’t open your deduction letter. Add it again as a PDF, JPG or PNG, or enter the charges by hand.', 400, 'no_letter');
  }

  try {
    const extraction = await extractLetter({
      files, geminiKey, claudeKey,
      geminiModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
      claudeModel: process.env.ANTHROPIC_MODEL || defaultClaudeModel,
    });
    return Response.json(extraction, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const detail = failure(error);
    console.warn('Letter reading failed:', detail);
    return respond(`We couldn’t read your letter (${neutralService(detail)}). Enter the charges by hand, or try again.`, 502);
  }
}
