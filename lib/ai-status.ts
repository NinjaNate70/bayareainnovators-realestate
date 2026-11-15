// A connection check for the two AI services, run on the server with the
// site's own keys. It answers "is the key accepted, does the configured model
// exist for this key, and does a tiny request come back in time" so a setup
// problem can be told apart from a slow or overloaded service.
//
// It reports status codes, model names and timings only. Keys and response
// text never leave the server.

import Anthropic from '@anthropic-ai/sdk';
import { claudeClient } from './claude-json.ts';

type Fetch = typeof fetch;

export type ServiceStatus = {
  service: 'Gemini' | 'Claude';
  // What each service does in the app.
  used_for: string;
  key_set: boolean;
  model: string;
  ok: boolean;
  // Milliseconds for the test request, when it completed.
  answered_in_ms: number | null;
  problem: string;
  fix: string;
  // Models this key can use, when the configured one is not among them.
  available_models: string[];
};

const timedOut = (error: unknown) => error instanceof Error && error.name === 'TimeoutError';

function explain(service: 'Gemini' | 'Claude', status: number, variable: string): Pick<ServiceStatus, 'problem' | 'fix'> {
  if (status === 400 || status === 401 || status === 403) {
    return { problem: `${service} rejected the API key (${status}).`, fix: `Check ${variable} in Vercel for a typo or a deleted key, then redeploy.` };
  }
  if (status === 404) return { problem: `${service} does not have this model for your key (404).`, fix: 'Choose one of the available models below.' };
  if (status === 429) {
    return service === 'Claude'
      ? { problem: 'Claude refused the request (429): the key’s rate limit is used up.', fix: 'Wait a minute and retry. Limits rise with the account’s usage tier in the Claude Console.' }
      : { problem: 'Gemini refused the request (429): the key’s rate limit or daily quota is used up.', fix: 'Wait a minute and retry. Free-tier keys have low limits; attach billing in Google AI Studio for more.' };
  }
  if (status >= 500) return { problem: `${service} is overloaded or down right now (${status}).`, fix: 'This is on the provider’s side. Retry shortly, or switch to a less busy model.' };
  return { problem: `${service} answered with an unexpected status (${status}).`, fix: 'Retry, and check the provider’s status page.' };
}

async function checkGemini(apiKey: string | undefined, model: string, call: Fetch): Promise<ServiceStatus> {
  const base: ServiceStatus = {
    service: 'Gemini', used_for: 'Photo analysis, the audit and drafting assistant answers',
    key_set: Boolean(apiKey), model, ok: false, answered_in_ms: null, problem: '', fix: '', available_models: [],
  };
  if (!apiKey) return { ...base, problem: 'GEMINI_API_KEY is not set for this deployment.', fix: 'Add GEMINI_API_KEY in Vercel for this environment (Production or Preview), then redeploy.' };
  const headers = { 'x-goog-api-key': apiKey, 'Content-Type': 'application/json' };
  const root = 'https://generativelanguage.googleapis.com/v1beta/models';
  try {
    const listed = await call(`${root}?pageSize=200`, { headers, cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!listed.ok) return { ...base, ...explain('Gemini', listed.status, 'GEMINI_API_KEY') };
    const body: { models?: { name?: string; supportedGenerationMethods?: string[] }[] } = await listed.json();
    const usable = (body.models ?? [])
      .filter((item) => item.supportedGenerationMethods?.includes('generateContent'))
      .map((item) => String(item.name ?? '').replace(/^models\//, ''))
      .filter(Boolean);
    if (!usable.includes(model)) {
      return {
        ...base,
        problem: `The model “${model}” is not available to this key.`,
        fix: 'Set GEMINI_MODEL in Vercel to one of the available models below, then redeploy.',
        available_models: usable.filter((name) => /flash|pro/.test(name) && !/embedding|image|tts|audio|live/.test(name)).slice(0, 12),
      };
    }
    const started = Date.now();
    const answered = await call(`${root}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST', headers, cache: 'no-store', signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with the single word: ok' }] }] }),
    });
    if (!answered.ok) return { ...base, ...explain('Gemini', answered.status, 'GEMINI_API_KEY') };
    await answered.json();
    return { ...base, ok: true, answered_in_ms: Date.now() - started };
  } catch (error) {
    return timedOut(error)
      ? { ...base, problem: 'Gemini did not answer a one-word test within 15 seconds.', fix: 'The model is slow or overloaded for this key. Try a different model in GEMINI_MODEL, or attach billing for higher priority.' }
      : { ...base, problem: 'The server could not reach Gemini.', fix: 'Retry. If it persists, check Google’s status page.' };
  }
}

async function checkClaude(apiKey: string | undefined, model: string, call: Fetch): Promise<ServiceStatus> {
  const base: ServiceStatus = {
    service: 'Claude', used_for: 'Reading the letter and lease, reviewing assistant answers, and standing in when Gemini is busy',
    key_set: Boolean(apiKey), model, ok: false, answered_in_ms: null, problem: '', fix: '', available_models: [],
  };
  if (!apiKey) return { ...base, problem: 'ANTHROPIC_API_KEY is not set for this deployment.', fix: 'Add ANTHROPIC_API_KEY in Vercel for this environment, then redeploy. Without it there is no stand-in when Gemini is busy.' };
  const client = claudeClient(apiKey, call);
  // A typed error says which step failed; only its status is reported.
  const status = (error: unknown) => (error instanceof Anthropic.APIError && error.status ? error.status : null);
  const unreachable = { ...base, problem: 'The server could not reach Claude.', fix: 'Retry. If it persists, check Anthropic’s status page.' };
  let usable: string[];
  try {
    usable = [];
    for await (const item of client.models.list({ limit: 100 }, { timeout: 8000 })) usable.push(item.id);
  } catch (error) {
    if (error instanceof Anthropic.APIConnectionTimeoutError) return { ...base, problem: 'Claude did not list its models within 8 seconds.', fix: 'Retry shortly.' };
    const code = status(error);
    return code ? { ...base, ...explain('Claude', code, 'ANTHROPIC_API_KEY') } : unreachable;
  }
  if (!usable.includes(model)) {
    return {
      ...base,
      problem: `The model “${model}” is not available to this key.`,
      fix: 'Set ANTHROPIC_MODEL in Vercel to one of the available models below, or remove it to use the default, then redeploy.',
      available_models: usable.slice(0, 12),
    };
  }
  try {
    const started = Date.now();
    await client.messages.create({
      model, max_tokens: 2000,
      messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
    }, { timeout: 15_000 });
    return { ...base, ok: true, answered_in_ms: Date.now() - started };
  } catch (error) {
    if (error instanceof Anthropic.APIConnectionTimeoutError) {
      return { ...base, problem: 'Claude did not answer a one-word test within 15 seconds.', fix: 'Retry shortly, or choose a faster model in ANTHROPIC_MODEL.' };
    }
    const code = status(error);
    if (code === 400) {
      // The key listed models, so it is valid; a refused first message is most often billing.
      return { ...base, problem: 'Claude accepted the key but refused a test message (400).', fix: 'This usually means the account has no credit. Check Billing in the Claude Console (platform.claude.com) and add credit.' };
    }
    return code ? { ...base, ...explain('Claude', code, 'ANTHROPIC_API_KEY') } : unreachable;
  }
}

export async function checkAiServices(options: {
  geminiKey?: string;
  geminiModel: string;
  claudeKey?: string;
  claudeModel: string;
  fetch?: Fetch;
}): Promise<ServiceStatus[]> {
  const call = options.fetch ?? fetch;
  return Promise.all([
    checkGemini(options.geminiKey, options.geminiModel, call),
    checkClaude(options.claudeKey, options.claudeModel, call),
  ]);
}
