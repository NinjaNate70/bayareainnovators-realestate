import { createClient } from '@supabase/supabase-js';
import { parseAssistantRequest, runAssistant, type CaseRecord } from '@/lib/case-assistant';
import { defaultClaudeModel } from '@/lib/claude-json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const authOptions = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false };
const respond = (error: string, status: number) =>
  Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });

// A per-renter brake on model spend. It is per server instance, so it limits
// bursts rather than enforcing an exact quota.
const recent = new Map<string, number[]>();
function allow(userId: string) {
  const now = Date.now();
  const times = (recent.get(userId) ?? []).filter((time) => now - time < 60_000);
  if (times.length >= 10) return false;
  times.push(now);
  recent.set(userId, times);
  if (recent.size > 5000) recent.clear();
  return true;
}

const caseColumns = 'address, renter_name, landlord_name, move_out_date, letter_received_date, deposit_cents, returned_cents, completed_step, audited, letter_text, reply_by_date, incoming_text, reply_text, charges, evidence';

// Names the service and status only (for example "Gemini request failed (404)"),
// so a setup problem can be told apart from a slow answer. Never includes keys.
function failure(error: unknown) {
  if (error instanceof Error && error.name === 'TimeoutError') return 'the AI service took too long';
  const message = error instanceof Error ? error.message : '';
  // Raised when a service and its stand-in both failed; it names each one.
  if (error instanceof Error && error.name === 'AiServiceError') return message.slice(0, -1);
  return /^(Gemini|Claude) (request failed \(\d{3}\)|did not return a complete \w+|declined the request|could not be reached)\.$/.test(message)
    ? message.slice(0, -1)
    : 'unexpected error';
}

export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  // Claude answers. Gemini is optional and only stands in if Claude fails.
  const claudeKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!url || !publishableKey || (!claudeKey && !geminiKey)) {
    return respond('The case assistant is unavailable. Ask your project admin to add the Claude API key.', 503);
  }

  const accessToken = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!accessToken) return respond('Sign in to use the case assistant.', 401);

  let input: ReturnType<typeof parseAssistantRequest>;
  try {
    input = parseAssistantRequest(await request.json());
  } catch (error) {
    return respond(error instanceof Error && !(error instanceof SyntaxError) ? error.message : 'Invalid request.', 400);
  }

  // The case is read with the renter's own session, so row-level security
  // decides what the assistant can see. Nothing is trusted from the browser.
  const renter = createClient(url, publishableKey, {
    auth: authOptions,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const auth = await renter.auth.getUser(accessToken);
  if (auth.error || !auth.data.user) return respond('Your session expired. Sign in again.', 401);
  const userId = auth.data.user.id;
  if (!allow(userId)) return respond('You’re asking quickly. Wait a minute, then try again.', 429);

  let caseRow: CaseRecord | null = null;
  if (input.caseId) {
    const found = await renter.from('cases').select(caseColumns)
      .eq('id', input.caseId).eq('user_id', userId).maybeSingle<CaseRecord>();
    if (found.error) return respond('Could not open your case. Try again in a moment.', 503);
    caseRow = found.data;
  }

  try {
    const reply = await runAssistant({
      request: input,
      caseRow,
      today: new Date().toISOString().slice(0, 10),
      geminiKey,
      geminiModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
      claudeKey,
      claudeModel: process.env.ANTHROPIC_MODEL || defaultClaudeModel,
    });
    return Response.json(reply, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    const detail = failure(error);
    console.warn('Case assistant failed:', detail);
    return respond(`The assistant couldn’t finish that answer (${detail}). Try again in a moment.`, 502);
  }
}
