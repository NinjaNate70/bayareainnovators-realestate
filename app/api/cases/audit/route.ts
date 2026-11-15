import { createClient } from '@supabase/supabase-js';
import { depositGuide } from '@/lib/case-assistant';
import { runCaseAudit, type AuditFile, type AuditInput, type InspectionNote } from '@/lib/case-audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const authOptions = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
const respond = (error: string, status: number, code = 'audit_failed') =>
  Response.json({ error, code }, { status, headers: { 'Cache-Control': 'no-store' } });

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const day = /^\d{4}-\d{2}-\d{2}$/;
const kinds = ['letter', 'lease', 'before', 'after'] as const;
const mimes = ['application/pdf', 'image/png', 'image/jpeg'];
// What one audit sends to each model: a few files, within the models' inline limits.
const limits = { documents: { count: 4, bytes: 12 * 1024 * 1024 }, photos: { count: 8, bytes: 12 * 1024 * 1024 } };

// An audit makes several model calls with files attached, so it is rationed
// more tightly than chat. Per server instance: it limits bursts.
const recent = new Map<string, number[]>();
function allow(userId: string) {
  const now = Date.now();
  const times = (recent.get(userId) ?? []).filter((time) => now - time < 60_000);
  if (times.length >= 3) return false;
  times.push(now);
  recent.set(userId, times);
  if (recent.size > 5000) recent.clear();
  return true;
}

type StoredCase = {
  address: string;
  move_out_date: string | null;
  letter_received_date: string | null;
  deposit_cents: number;
  returned_cents: number;
  charges: { source_id?: string; name?: string; room?: string; amount_cents?: number }[];
  evidence: { source_id?: string; name?: string; kind?: string; type?: string; path?: string; bucket?: string }[];
  photo_pairs: Record<string, { before?: string; after?: string }> | null;
};

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!url || !publishableKey || !geminiKey) {
    return respond('The automated audit isn’t set up yet. Ask your project admin to add the Gemini key.', 503, 'setup');
  }

  const accessToken = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!accessToken) return respond('Sign in to run the audit.', 401, 'signed_out');

  let caseId: unknown;
  let consent: unknown;
  try {
    ({ caseId, consent } = (await request.json()) as Record<string, unknown>);
  } catch {
    return respond('Invalid request.', 400, 'validation');
  }
  if (typeof caseId !== 'string' || !uuid.test(caseId)) return respond('Invalid case.', 400, 'validation');
  if (consent !== true) return respond('Confirm that your documents and photos can be sent for analysis.', 400, 'consent');

  // Everything is read with the renter's own session, so row-level security
  // and the storage policies decide what this audit can see.
  const renter = createClient(url, publishableKey, {
    auth: authOptions,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const auth = await renter.auth.getUser(accessToken);
  if (auth.error || !auth.data.user) return respond('Your session expired. Sign in again.', 401, 'signed_out');
  const userId = auth.data.user.id;
  if (!allow(userId)) return respond('An audit was just run. Wait a minute, then try again.', 429, 'rate_limited');

  const found = await renter.from('cases')
    .select('address, move_out_date, letter_received_date, deposit_cents, returned_cents, charges, evidence, photo_pairs')
    .eq('id', caseId).eq('user_id', userId).maybeSingle<StoredCase>();
  if (found.error) return respond('Could not open your case. Try again in a moment.', 503);
  if (!found.data) return respond('This case is unavailable.', 404, 'not_found');
  const row = found.data;

  const charges = (Array.isArray(row.charges) ? row.charges : []).slice(0, 40).flatMap((charge) =>
    typeof charge.source_id === 'string' && typeof charge.name === 'string' && Number.isFinite(charge.amount_cents)
      ? [{ id: charge.source_id, name: charge.name.slice(0, 160), room: String(charge.room ?? '').slice(0, 80), amount: Math.round(charge.amount_cents!) / 100 }]
      : []);
  if (!charges.length) return respond('Add at least one charge before running the audit.', 400, 'validation');

  // Letters before leases, and photos the renter paired to a charge first.
  const paired = new Set(Object.values(row.photo_pairs ?? {}).flatMap((pair) => [pair?.before, pair?.after]));
  const evidence = (Array.isArray(row.evidence) ? row.evidence : [])
    .filter((file) => typeof file.source_id === 'string' && (kinds as readonly string[]).includes(String(file.kind)))
    .sort((a, b) => kinds.indexOf(a.kind as never) - kinds.indexOf(b.kind as never) || Number(paired.has(b.source_id)) - Number(paired.has(a.source_id)));

  const files: AuditFile[] = [];
  const skipped: AuditInput['skipped'] = [];
  const used = { documents: { count: 0, bytes: 0 }, photos: { count: 0, bytes: 0 } };
  for (const file of evidence) {
    const id = file.source_id!;
    const name = String(file.name ?? id).slice(0, 160);
    const kind = file.kind as AuditFile['kind'];
    const group = kind === 'letter' || kind === 'lease' ? 'documents' : 'photos';
    const skip = (reason: string) => skipped.push({ id, name, reason });
    if (!file.path || (file.bucket !== 'documents' && file.bucket !== 'photos') || !file.path.startsWith(`${userId}/${caseId}/`)) {
      skip('the original file is not stored with this case. Add it again.');
      continue;
    }
    if (used[group].count >= limits[group].count) { skip(`only the first ${limits[group].count} ${group} are reviewed in one audit.`); continue; }
    const download = await renter.storage.from(file.bucket).download(file.path);
    if (download.error || !download.data) { skip('the file could not be opened.'); continue; }
    const mime = mimes.includes(download.data.type) ? download.data.type : String(file.type);
    if (!mimes.includes(mime) || (group === 'photos' && mime === 'application/pdf')) { skip('this file type can’t be analysed.'); continue; }
    if (used[group].bytes + download.data.size > limits[group].bytes) { skip('the files together are too large for one audit. Use a smaller copy.'); continue; }
    used[group].count += 1;
    used[group].bytes += download.data.size;
    files.push({ id, kind, name, mime, data: Buffer.from(await download.data.arrayBuffer()).toString('base64') });
  }

  // Results the renter already has from Compare photos in My Inspections.
  let inspections: InspectionNote[] = [];
  const saved = await renter.from('inspection_comparisons')
    .select('spot, category, summary, rooms (name)')
    .eq('user_id', userId).eq('status', 'ready').order('created_at', { ascending: false }).limit(20)
    .returns<{ spot: string; category: string | null; summary: string; rooms: { name: string } | null }[]>();
  if (!saved.error && saved.data) {
    inspections = saved.data.map((item) => ({
      room: item.rooms?.name ?? '', spot: item.spot, category: item.category ?? 'needs_review', summary: String(item.summary ?? '').slice(0, 500),
    }));
  }

  const date = (value: string | null) => (value && day.test(value) ? value : null);
  const pairs: AuditInput['photoPairs'] = {};
  for (const [chargeId, pair] of Object.entries(row.photo_pairs ?? {})) {
    if (typeof pair?.before === 'string' && typeof pair?.after === 'string') pairs[chargeId] = { before: pair.before, after: pair.after };
  }

  try {
    const result = await runCaseAudit({
      input: {
        facts: {
          today: new Date().toISOString().slice(0, 10),
          address: String(row.address ?? '').slice(0, 200),
          move_out_date: date(row.move_out_date),
          letter_received_date: date(row.letter_received_date),
          deposit_paid: Math.round(row.deposit_cents) / 100,
          amount_returned: Math.round(row.returned_cents) / 100,
        },
        charges, files, skipped, photoPairs: pairs, inspections,
      },
      guide: [...depositGuide],
      geminiKey,
      geminiModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
      openAiKey: process.env.OPENAI_API_KEY,
      openAiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    });
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.warn('Case audit failed:', error instanceof Error ? error.message : 'Unknown error');
    return respond('The audit couldn’t finish. Your case is saved. Try again in a moment.', 502);
  }
}
