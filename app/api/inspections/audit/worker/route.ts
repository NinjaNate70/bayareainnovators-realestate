import { timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { assessInspectionPair } from '@/lib/gemini-inspection';
import { validateComparisonPair } from '@/lib/inspection-comparison';
import { resolveAuditFinding, type AuditFinding, type AuditRoom } from '@/lib/move-out-audit';

export const runtime = 'nodejs';
export const maxDuration = 60;

type Claim = AuditRoom & { user_id: string; attempts: number; worker_token: string };

export async function POST(request: Request) {
  const configuredSecret = process.env.AUDIT_WORKER_SECRET;
  if (!configuredSecret) return Response.json({ error: 'Audit worker is disabled.' }, { status: 503 });
  const expected = Buffer.from(`Bearer ${configuredSecret}`);
  const received = Buffer.from(request.headers.get('authorization') ?? '');
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return Response.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SECRET_KEY;
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  if (!url || !supabaseKey || !apiKey) return Response.json({ error: 'Audit services are unavailable.' }, { status: 503 });

  const supabase = createClient(url, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const claim = await supabase.rpc('claim_move_out_audit_room').maybeSingle<Claim>();
  if (claim.error) return Response.json({ error: 'Could not claim an audit room.' }, { status: 503 });
  const job = claim.data;
  if (!job) return new Response(null, { status: 204 });

  const save = async (values: Record<string, unknown>) => supabase.from('move_out_audit_rooms')
    .update({ ...values, worker_token: null, locked_until: null })
    .eq('id', job.id).eq('worker_token', job.worker_token);
  const checkingEvidence = job.status === 'reviewing';

  try {
    if (!job.before_id || !job.after_id) {
      const result = await save({ status: 'awaiting_photos' });
      if (result.error) throw new Error('Failed to request evidence.');
      return Response.json({ processed: true });
    }
    const photos = await supabase.from('inspection_photos')
      .select('id, room_id, phase, uploaded_at, storage_path, content_type')
      .eq('room_id', job.room_id).eq('user_id', job.user_id).in('id', [job.before_id, job.after_id]);
    if (photos.error) throw new Error('Could not read audit photos.');
    if (photos.data.length !== 2) {
      const result = await save({ status: 'awaiting_photos' });
      if (result.error) throw new Error('Failed to request replacement photos.');
      return Response.json({ processed: true });
    }
    const [before, after] = validateComparisonPair(photos.data, job.before_id, job.after_id);
    const bucket = supabase.storage.from('inspection-photos');
    const [first, second] = await Promise.all([bucket.download(before.storage_path), bucket.download(after.storage_path)]);
    if (first.error || second.error || !first.data || !second.data) throw new Error('Could not download audit photos.');
    const { assessment } = await assessInspectionPair({
      apiKey, model, bands: [], evidenceReview: checkingEvidence,
      before: { data: first.data, contentType: before.content_type },
      after: { data: second.data, contentType: after.content_type },
    });
    const finding: AuditFinding = { status: assessment.status, category: assessment.category, summary: assessment.summary };

    if (checkingEvidence && !job.condition_finding) throw new Error('Audit room has no condition finding.');
    const result = checkingEvidence && job.condition_finding
      ? await save({ ...resolveAuditFinding(job.condition_finding, finding), evidence_finding: finding })
      : await save({ status: 'review_queued', condition_finding: finding, attempts: 0, available_at: new Date().toISOString() });
    if (result.error) throw new Error('Could not save audit finding.');
    return Response.json({ processed: true });
  } catch (error) {
    console.warn('Move-out audit job failed:', error instanceof Error ? error.message : 'Unknown error');
    const retry = await save({
      status: job.attempts >= 3 ? 'failed' : checkingEvidence ? 'review_queued' : 'queued',
      available_at: new Date(Date.now() + 15_000 * job.attempts).toISOString(),
    });
    if (retry.error) return Response.json({ error: 'Could not retry the audit room.' }, { status: 503 });
    return Response.json({ processed: true });
  }
}
