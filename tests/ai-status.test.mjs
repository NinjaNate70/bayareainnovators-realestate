import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkAiServices } from '../lib/ai-status.ts';

const json = (value, status = 200) => new Response(JSON.stringify(value), { status });
const geminiModels = { models: [
  { name: 'models/gemini-flash-a', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-pro-x', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-flash-embedding', supportedGenerationMethods: ['embedContent'] },
] };
const openAiModels = { data: [{ id: 'gpt-small' }, { id: 'gpt-audio-x' }, { id: 'whisper-1' }] };
const base = { geminiKey: 'g-secret', geminiModel: 'gemini-flash-a', openAiKey: 'o-secret', openAiModel: 'gpt-small' };
const working = async (url, init) => {
  const address = String(url);
  if (address.includes('googleapis.com')) {
    assert.equal(init.headers['x-goog-api-key'], 'g-secret');
    return address.includes(':generateContent') ? json({ candidates: [] }) : json(geminiModels);
  }
  assert.equal(init.headers.Authorization, 'Bearer o-secret');
  return address.endsWith('/models') ? json(openAiModels) : json({ choices: [] });
};

test('reports both services working, without leaking keys', async () => {
  const [gemini, openai] = await checkAiServices({ ...base, fetch: working });
  assert.deepEqual([gemini.service, gemini.ok, gemini.key_set, gemini.model], ['Gemini', true, true, 'gemini-flash-a']);
  assert.deepEqual([openai.service, openai.ok, openai.model], ['OpenAI', true, 'gpt-small']);
  assert.ok(gemini.answered_in_ms >= 0 && openai.answered_in_ms >= 0);
  assert.ok(!JSON.stringify([gemini, openai]).includes('secret'));
});

test('a missing key is reported without calling the service', async () => {
  let calls = 0;
  const [gemini, openai] = await checkAiServices({ geminiModel: 'gemini-flash-a', openAiModel: 'gpt-small', fetch: async () => { calls += 1; return json({}); } });
  assert.equal(calls, 0);
  assert.deepEqual([gemini.ok, gemini.key_set, openai.ok, openai.key_set], [false, false, false, false]);
  assert.match(gemini.problem, /GEMINI_API_KEY is not set/);
  assert.match(openai.fix, /Add OPENAI_API_KEY in Vercel/);
});

test('a rejected key, an unknown model and no credit each get their own explanation', async () => {
  const [badKey] = await checkAiServices({ ...base, fetch: async (url) => (String(url).includes('googleapis.com') ? json({ error: { message: 'API key not valid g-secret' } }, 400) : working(url, { headers: { Authorization: 'Bearer o-secret' } })) });
  assert.match(badKey.problem, /rejected the API key \(400\)/);
  // Provider error text is never passed on.
  assert.ok(!JSON.stringify(badKey).includes('not valid'));

  const [wrongGemini, wrongOpenAi] = await checkAiServices({ ...base, geminiModel: 'gemini-9-ultra', openAiModel: 'gpt-missing', fetch: working });
  assert.match(wrongGemini.problem, /“gemini-9-ultra” is not available to this key/);
  assert.deepEqual(wrongGemini.available_models, ['gemini-flash-a', 'gemini-pro-x']);
  assert.deepEqual(wrongOpenAi.available_models, ['gpt-small']);
  assert.match(wrongOpenAi.fix, /Set OPENAI_MODEL/);

  const [, noCredit] = await checkAiServices({ ...base, fetch: async (url, init) => (String(url).includes('chat/completions') ? json({ error: { code: 'insufficient_quota' } }, 429) : working(url, init)) });
  assert.equal(noCredit.ok, false);
  assert.match(noCredit.problem, /no credit left/);
  assert.match(noCredit.fix, /Billing on platform\.openai\.com/);
});

test('overload and slowness are told apart from setup problems', async () => {
  const [busy] = await checkAiServices({ ...base, fetch: async (url, init) => (String(url).includes(':generateContent') ? json({}, 503) : working(url, init)) });
  assert.match(busy.problem, /overloaded or down right now \(503\)/);
  const [slow] = await checkAiServices({ ...base, fetch: async (url, init) => {
    if (String(url).includes(':generateContent')) throw Object.assign(new Error('aborted'), { name: 'TimeoutError' });
    return working(url, init);
  } });
  assert.match(slow.problem, /did not answer a one-word test within 15 seconds/);
  const [unreachable] = await checkAiServices({ ...base, fetch: async (url, init) => { if (String(url).includes('googleapis.com')) throw new TypeError('fetch failed'); return working(url, init); } });
  assert.match(unreachable.problem, /could not reach Gemini/);
});
