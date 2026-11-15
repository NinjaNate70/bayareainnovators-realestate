import { createClient } from '@supabase/supabase-js';
import { draftCaseCorrespondence } from '@/lib/case-correspondence-ai';
import { correspondenceTable, messageColumns, parseDraftRequest, threadForDraft, type CaseMessage } from '@/lib/case-correspondence';
import type { AuditFile } from '@/lib/case-audit';
import { defaultClaudeModel } from '@/lib/claude-json';
import type { CaseRow } from '@/types/backend';

export const runtime = 'nodejs';
export const maxDuration = 60;

const recent = new Map<string, number[]>();
const mimes = ['application/pdf', 'image/png', 'image/jpeg'];
const bytesLimit = 6 * 1024 * 1024;
const noCache = { 'Cache-Control': 'no-store' };
const errorResponse = (error: string, status: number) => Response.json({ error }, { status, headers: noCache });

function allow(userId: string) {
  const now = Date.now();
  const times = (recent.get(userId) ?? []).filter((time) => now - time < 60_000);
  if (times.length >= 4) return false;
  if (recent.size >= 5000) for (const [id, entries] of recent) if ((entries.at(-1) ?? 0) < now - 60_000) recent.delete(id);
  if (recent.size >= 5000 && !recent.has(userId)) return false;
  recent.set(userId, [...times, now]);
  return true;
}

export async function POST(request: Request) {
  const deadline = Date.now() + 54_000;
  const token = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!token) return errorResponse('Sign in to draft a message.', 401);
  let input: ReturnType<typeof parseDraftRequest>;
  try {
    input = parseDraftRequest(await request.json());
  } catch (error) {
    return errorResponse(error instanceof Error && !(error instanceof SyntaxError) ? error.message : 'Invalid draft request.', 400);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const claudeKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!url || !key || (!claudeKey && !geminiKey)) return errorResponse('AI drafting needs Supabase and an AI key. Ask the project admin to finish setup.', 503);
  const renter = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  const auth = await renter.auth.getUser(token);
  if (auth.error || !auth.data.user) return errorResponse('Your session expired. Sign in again.', 401);
  const owner = auth.data.user.id;
  const found = await renter.from('cases').select('*').eq('id', input.caseId).eq('user_id', owner).maybeSingle<CaseRow>();
  if (found.error) return errorResponse('Could not load your case. Try again.', 503);
  if (!found.data || found.data.is_demo) return errorResponse('Open your own saved case to draft a message.', 404);
  const row = found.data;

  const orderedHistory = () => renter.from(correspondenceTable).select(messageColumns)
    .eq('case_id', input.caseId).eq('user_id', owner)
    .order('occurred_at', { ascending: false }).order('id', { ascending: false });
  const readHistory = async () => {
    const [recent, inbound] = await Promise.all([
      orderedHistory().in('status', ['received', 'sent']).limit(16).returns<CaseMessage[]>(),
      orderedHistory().eq('status', 'received').limit(1).maybeSingle<CaseMessage>(),
    ]);
    const data = recent.data ?? [];
    if (inbound.data && !data.some(({ id }) => id === inbound.data?.id)) data.push(inbound.data);
    return { data, error: recent.error ?? inbound.error };
  };
  const history = await readHistory();
  if (history.error) return errorResponse('Could not open the email history. Check that the correspondence migration was applied.', 503);
  if (input.kind === 'reply' && !history.data.some(({ status }) => status === 'received')) {
    return errorResponse('Add a received email to the case history first.', 400);
  }
  if (!allow(owner)) return errorResponse('Too many draft requests. Try again in a minute.', 429);

  const evidence = (Array.isArray(row.evidence) ? row.evidence : []).slice(0, 60);
  const factsAreCurrent = row.audited && !row.needs_review;
  const charges = (Array.isArray(row.charges) ? row.charges : []).slice(0, 40).map((charge) => ({
    id: charge.source_id, name: charge.name, room: charge.room, amount_cents: charge.amount_cents,
    finding: factsAreCurrent ? { verdict: charge.verdict, reason: charge.reason, sources: charge.source_ids } : null,
  }));
  const cited = new Set(charges.flatMap(({ finding }) => finding?.sources ?? []));
  const priority = (file: (typeof evidence)[number]) => file.kind === 'letter' ? 0 : cited.has(file.source_id) ? 1 : file.kind === 'lease' ? 2 : 3;
  const chosen = evidence.filter((file) => file.path?.startsWith(`${owner}/${input.caseId}/`) &&
    (file.bucket === 'documents' || file.bucket === 'photos') && mimes.includes(file.type) && file.size > 0 && file.size <= bytesLimit)
    .sort((a, b) => priority(a) - priority(b)).slice(0, 4);

  try {
    const downloads = await Promise.all(chosen.map(({ bucket, path }) => renter.storage.from(bucket!).download(path!)));
    let readBytes = 0;
    const files: AuditFile[] = [];
    for (let i = 0; i < chosen.length; i++) {
      const file = chosen[i];
      const download = downloads[i];
      if (download.error || !download.data || readBytes + download.data.size > bytesLimit) continue;
      const mime = download.data.type || file.type;
      if (!mimes.includes(mime)) continue;
      readBytes += download.data.size;
      files.push({ id: file.source_id, name: file.name, kind: file.kind, mime, data: Buffer.from(await download.data.arrayBuffer()).toString('base64') });
    }

    const draft = await draftCaseCorrespondence({
      kind: input.kind, deadline, claudeKey, claudeModel: process.env.ANTHROPIC_MODEL || defaultClaudeModel,
      geminiKey, geminiModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash', files,
      groundedIds: evidence.filter(({ source_id }) => cited.has(source_id)).map(({ source_id }) => source_id),
      context: {
        case_facts: {
          renter: row.renter_name, landlord: row.landlord_name, address: row.address,
          move_out_date: row.move_out_date, letter_received_date: row.letter_received_date,
          deposit_cents: row.deposit_cents, returned_cents: row.returned_cents,
          renter_requested_reply_date: row.reply_by_date,
          renter_account_unverified: row.situation_text ?? '',
        },
        goal: input.goal, thread: threadForDraft(history.data), charges,
        evidence_catalog: evidence.map(({ source_id, kind, name }) => ({ id: source_id, kind, name })),
        evidence_opened: files.map(({ id }) => id),
      },
    });

    const [current, latest] = await Promise.all([
      renter.from('cases').select('revision').eq('id', input.caseId).eq('user_id', owner).maybeSingle(),
      readHistory(),
    ]);
    if (current.error || latest.error) return errorResponse('Could not confirm that the case and thread are current. Try again.', 503);
    if (current.data?.revision !== row.revision || latest.data.map(({ id }) => id).join(',') !== history.data.map(({ id }) => id).join(',')) {
      return errorResponse('The case or email history changed during drafting. Run it again to use the latest details.', 409);
    }
    const saved = await renter.from(correspondenceTable)
      .insert({ ...draft, kind: input.kind, case_id: input.caseId, status: 'draft' })
      .select(messageColumns).single<CaseMessage>();
    if (saved.error) return errorResponse('Could not save the new draft. Your earlier drafts are available in the case.', 503);
    return Response.json({ draft: saved.data }, { headers: noCache });
  } catch {
    return errorResponse('The writing service could not finish a reviewed draft. Try again in a moment.', 502);
  }
}
