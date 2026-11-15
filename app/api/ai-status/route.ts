import { createClient } from '@supabase/supabase-js';
import { checkAiServices } from '@/lib/ai-status';
import { defaultClaudeModel } from '@/lib/claude-json';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const respond = (error: string, status: number) =>
  Response.json({ error }, { status, headers: { 'Cache-Control': 'no-store' } });

// Each check spends a little model quota, so it is rationed per renter.
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

// Tests the site's AI keys and models and says, in plain terms, what is wrong.
// Signed-in renters only. The reply has status codes, model names and timings;
// keys and provider response text stay on the server.
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return respond('Supabase isn’t connected on this deployment.', 503);
  const accessToken = request.headers.get('Authorization')?.match(/^Bearer (\S+)$/i)?.[1];
  if (!accessToken) return respond('Sign in to check the AI connection.', 401);
  const renter = createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const auth = await renter.auth.getUser(accessToken);
  if (auth.error || !auth.data.user) return respond('Your session expired. Sign in again.', 401);
  if (!allow(auth.data.user.id)) return respond('The check was just run. Wait a minute, then try again.', 429);

  const services = await checkAiServices({
    geminiKey: process.env.GEMINI_API_KEY,
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    claudeKey: process.env.ANTHROPIC_API_KEY,
    claudeModel: process.env.ANTHROPIC_MODEL || defaultClaudeModel,
  });
  return Response.json({ services }, { headers: { 'Cache-Control': 'no-store' } });
}
