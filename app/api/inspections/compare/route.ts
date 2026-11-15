import { createClient } from '@supabase/supabase-js';
import { assessInspectionPair, InspectionPhotoError } from '@/lib/claude-inspection';
import { defaultClaudeModel } from '@/lib/claude-json';
import {
  comparisonColumns,
  parseComparisonRequest,
  validateComparisonPair,
  type PriceBand,
  type SavedComparison,
} from '@/lib/inspection-comparison';

export const runtime = 'nodejs';
export const maxDuration = 60;

const table = 'inspection_comparisons';
const authOptions = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };

const respond = (error: string, status: number) => Response.json({ error }, { status });

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const model = process.env.ANTHROPIC_MODEL || defaultClaudeModel;
  if (!url || !publishableKey || !secretKey || !apiKey) {
    return respond('Photo comparison is unavailable. Ask your project admin to finish the setup.', 503);
  }

  const accessToken = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!accessToken) return respond('Sign in to compare photos.', 401);

  let input: ReturnType<typeof parseComparisonRequest>;
  try {
    input = parseComparisonRequest(await request.json());
  } catch (error) {
    return respond(error instanceof Error && !(error instanceof SyntaxError) ? error.message : 'Invalid comparison request.', 400);
  }

  const renter = createClient(url, publishableKey, {
    auth: authOptions,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const auth = await renter.auth.getUser(accessToken);
  if (auth.error || !auth.data.user) return respond('Your session expired. Sign in again.', 401);
  const userId = auth.data.user.id;

  const photos = await renter.from('inspection_photos')
    .select('id, room_id, phase, uploaded_at, storage_path, content_type')
    .eq('user_id', userId)
    .in('id', [input.moveInPhotoId, input.moveOutPhotoId]);
  if (photos.error) return respond('Could not load the selected photos.', 503);
  if (photos.data.length !== 2) return respond('Could not find both photos in your account.', 404);

  let pair: ReturnType<typeof validateComparisonPair<(typeof photos.data)[number]>>;
  try {
    pair = validateComparisonPair(photos.data, input.moveInPhotoId, input.moveOutPhotoId);
  } catch {
    return respond('Choose completed move-in and move-out photos from the same room.', 400);
  }

  // All file reads stay under the renter's RLS session. The server key is used for result writes and catalog reads.
  const admin = createClient(url, secretKey, { auth: authOptions });
  const match = { user_id: userId, move_in_photo_id: pair[0].id, move_out_photo_id: pair[1].id };
  const staleBefore = new Date(Date.now() - 5 * 60_000).toISOString();
  const cleared = await admin.from(table).delete().match(match).eq('status', 'processing').lt('created_at', staleBefore);
  if (cleared.error) return respond('Could not open comparison storage. Ask your project admin to check the Supabase migration.', 503);

  const claim = await admin.from(table).insert({
    ...match, room_id: pair[0].room_id, spot: input.spot, region: input.region, model,
  }).select('id').single();
  let legacy: { id: string; model: string } | undefined;
  if (claim.error?.code === '23505') {
    const existing = await renter.from(table).select(`${comparisonColumns}, model`).match(match).maybeSingle<SavedComparison & { model: string }>();
    if (existing.error) return respond('Could not load the saved comparison.', 503);
    if (!existing.data) return respond('This pair is being compared. Try again shortly.', 409);
    const { model: savedModel, ...comparison } = existing.data;
    if (savedModel.startsWith('claude-')) return Response.json({ comparison });
    legacy = { id: comparison.id, model: savedModel };
  }
  const claimId = legacy?.id ?? claim.data?.id;
  if (!claimId) return respond('Could not start the comparison.', 503);

  try {
    const bucket = renter.storage.from('inspection-photos');
    const [before, after, prices] = await Promise.all([
      bucket.download(pair[0].storage_path),
      bucket.download(pair[1].storage_path),
      input.region ? admin.from('repair_price_bands')
        .select('code, title, low_cents, high_cents, currency, unit, source, effective_on')
        .eq('region', input.region)
        .lte('effective_on', new Date().toISOString().slice(0, 10))
        .order('code').limit(100).returns<PriceBand[]>() : Promise.resolve({ data: [], error: null }),
    ]);
    if (before.error || after.error || !before.data || !after.data) throw new Error('Failed to read a photo.');
    if (prices.error) throw new Error('Failed to load repair prices.');

    const result = await assessInspectionPair({
      apiKey, model, spot: input.spot, bands: prices.data ?? [], before: before.data, after: after.data,
    });
    const write = admin.from(table).update({ ...result.assessment, spot: input.spot, region: input.region, model: result.model })
      .eq('id', claimId).eq('user_id', userId);
    const saved = await (legacy ? write.eq('model', legacy.model) : write.eq('status', 'processing'))
      .select(comparisonColumns).maybeSingle<SavedComparison>();
    if (saved.error) throw new Error('Failed to save a comparison.');
    if (saved.data) return Response.json({ comparison: saved.data });
    return respond('This comparison changed while it was being reviewed. Open it again.', 409);
  } catch (error) {
    console.warn('Photo comparison failed:', error instanceof Error ? error.message : 'Unknown error');
    if (!legacy) await admin.from(table).delete().eq('id', claimId).eq('user_id', userId).eq('status', 'processing');
    if (error instanceof InspectionPhotoError) return respond(error.message, 422);
    return respond('Could not complete the comparison. Try again in a moment.', 502);
  }
}
