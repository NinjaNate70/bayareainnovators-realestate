// A connection check for the two AI services, run on the server with the
// site's own keys. It answers "is the key accepted, does the configured model
// exist for this key, and does a tiny request come back in time" so a setup
// problem can be told apart from a slow or overloaded service.
//
// It reports status codes, model names and timings only. Keys and response
// text never leave the server. No local imports, so tests can load it directly.

type Fetch = typeof fetch;

export type ServiceStatus = {
  service: 'Gemini' | 'OpenAI';
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

function explain(service: 'Gemini' | 'OpenAI', status: number, variable: string): Pick<ServiceStatus, 'problem' | 'fix'> {
  if (status === 400 || status === 401 || status === 403) {
    return { problem: `${service} rejected the API key (${status}).`, fix: `Check ${variable} in Vercel for a typo or a deleted key, then redeploy.` };
  }
  if (status === 404) return { problem: `${service} does not have this model for your key (404).`, fix: 'Choose one of the available models below.' };
  if (status === 429) {
    return service === 'OpenAI'
      ? { problem: 'OpenAI refused the request (429): no credit left, or too many requests.', fix: 'Add a payment method or credit under Billing on platform.openai.com. A new account has none.' }
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

async function checkOpenAi(apiKey: string | undefined, model: string, call: Fetch): Promise<ServiceStatus> {
  const base: ServiceStatus = {
    service: 'OpenAI', used_for: 'Reading the letter and lease, reviewing assistant answers, and standing in when Gemini is busy',
    key_set: Boolean(apiKey), model, ok: false, answered_in_ms: null, problem: '', fix: '', available_models: [],
  };
  if (!apiKey) return { ...base, problem: 'OPENAI_API_KEY is not set for this deployment.', fix: 'Add OPENAI_API_KEY in Vercel for this environment, then redeploy. Without it there is no stand-in when Gemini is busy.' };
  const headers = { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
  try {
    const listed = await call('https://api.openai.com/v1/models', { headers, cache: 'no-store', signal: AbortSignal.timeout(8000) });
    if (!listed.ok) return { ...base, ...explain('OpenAI', listed.status, 'OPENAI_API_KEY') };
    const body: { data?: { id?: string }[] } = await listed.json();
    const usable = (body.data ?? []).map((item) => String(item.id ?? '')).filter(Boolean);
    if (!usable.includes(model)) {
      return {
        ...base,
        problem: `The model “${model}” is not available to this key.`,
        fix: 'Set OPENAI_MODEL in Vercel to one of the available models below, then redeploy.',
        available_models: usable.filter((name) => /^(gpt|o\d)/.test(name) && !/audio|realtime|tts|transcribe|image|embedding|search|instruct/.test(name)).sort().slice(0, 12),
      };
    }
    const started = Date.now();
    const answered = await call('https://api.openai.com/v1/chat/completions', {
      method: 'POST', headers, cache: 'no-store', signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'Reply with the single word: ok' }] }),
    });
    if (!answered.ok) return { ...base, ...explain('OpenAI', answered.status, 'OPENAI_API_KEY') };
    await answered.json();
    return { ...base, ok: true, answered_in_ms: Date.now() - started };
  } catch (error) {
    return timedOut(error)
      ? { ...base, problem: 'OpenAI did not answer a one-word test within 15 seconds.', fix: 'Retry shortly, or choose a faster model in OPENAI_MODEL.' }
      : { ...base, problem: 'The server could not reach OpenAI.', fix: 'Retry. If it persists, check OpenAI’s status page.' };
  }
}

export async function checkAiServices(options: {
  geminiKey?: string;
  geminiModel: string;
  openAiKey?: string;
  openAiModel: string;
  fetch?: Fetch;
}): Promise<ServiceStatus[]> {
  const call = options.fetch ?? fetch;
  return Promise.all([
    checkGemini(options.geminiKey, options.geminiModel, call),
    checkOpenAi(options.openAiKey, options.openAiModel, call),
  ]);
}
