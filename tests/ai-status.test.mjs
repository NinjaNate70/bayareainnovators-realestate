import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkAiServices } from '../lib/ai-status.ts';

const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const geminiModels = { models: [
  { name: 'models/gemini-flash-a', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-pro-x', supportedGenerationMethods: ['generateContent'] },
  { name: 'models/gemini-flash-embedding', supportedGenerationMethods: ['embedContent'] },
] };
const model = (id) => ({ id, type: 'model', display_name: id, created_at: '2026-01-01T00:00:00Z' });
const claudeModels = { data: [model('claude-a'), model('claude-b')], has_more: false, first_id: 'claude-a', last_id: 'claude-b' };
const claudeMessage = { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-a', content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } };
const claudeError = (status, type) => json({ type: 'error', error: { type, message: 'detail that must not be shown' } }, status);
const base = { geminiKey: 'g-secret', geminiModel: 'gemini-flash-a', claudeKey: 'c-secret', claudeModel: 'claude-a' };
const working = async (url, init) => {
  const address = String(url);
  if (address.includes('googleapis.com')) {
    assert.equal(init.headers['x-goog-api-key'], 'g-secret');
    return address.includes(':generateContent') ? json({ candidates: [] }) : json(geminiModels);
  }
  assert.equal(new Headers(init.headers).get('authorization'), 'Bearer c-secret');
  return address.includes('/v1/models') ? json(claudeModels) : json(claudeMessage);
};

test('reports both services working, without leaking keys', async () => {
  const [gemini, claude] = await checkAiServices({ ...base, fetch: working });
  assert.deepEqual([gemini.service, gemini.ok, gemini.key_set, gemini.model], ['Gemini', true, true, 'gemini-flash-a']);
  assert.deepEqual([claude.service, claude.ok, claude.model], ['Claude', true, 'claude-a']);
  assert.ok(gemini.answered_in_ms >= 0 && claude.answered_in_ms >= 0);
  assert.ok(!JSON.stringify([gemini, claude]).includes('secret'));
});

test('a missing key is reported without calling the service', async () => {
  let calls = 0;
  const [gemini, claude] = await checkAiServices({ geminiModel: 'gemini-flash-a', claudeModel: 'claude-a', fetch: async () => { calls += 1; return json({}); } });
  assert.equal(calls, 0);
  assert.deepEqual([gemini.ok, gemini.key_set, claude.ok, claude.key_set], [false, false, false, false]);
  assert.match(gemini.problem, /GEMINI_API_KEY is not set/);
  assert.match(claude.fix, /Add ANTHROPIC_API_KEY in Vercel/);
});

test('a rejected key, an unknown model and no credit each get their own explanation', async () => {
  const [badKey] = await checkAiServices({ ...base, fetch: async (url) => (String(url).includes('googleapis.com') ? json({ error: { message: 'API key not valid g-secret' } }, 400) : working(url, { headers: { authorization: 'Bearer c-secret' } })) });
  assert.match(badKey.problem, /rejected the API key \(400\)/);
  // Provider error text is never passed on.
  assert.ok(!JSON.stringify(badKey).includes('not valid'));

  const [wrongGemini, wrongClaude] = await checkAiServices({ ...base, geminiModel: 'gemini-9-ultra', claudeModel: 'claude-missing', fetch: working });
  assert.match(wrongGemini.problem, /“gemini-9-ultra” is not available to this key/);
  assert.deepEqual(wrongGemini.available_models, ['gemini-flash-a', 'gemini-pro-x']);
  assert.deepEqual(wrongClaude.available_models, ['claude-a', 'claude-b']);
  assert.match(wrongClaude.fix, /Set ANTHROPIC_MODEL/);

  const onClaude = (respond) => async (url, init) => (String(url).includes('anthropic.com') ? respond(String(url)) : working(url, init));
  const [, badClaudeKey] = await checkAiServices({ ...base, fetch: onClaude(() => claudeError(401, 'authentication_error')) });
  assert.match(badClaudeKey.problem, /Claude rejected the API key \(401\)/);
  const [, noCredit] = await checkAiServices({ ...base, fetch: onClaude((url) => (url.includes('/v1/models') ? json(claudeModels) : claudeError(400, 'invalid_request_error'))) });
  assert.equal(noCredit.ok, false);
  assert.match(noCredit.problem, /accepted the key but refused a test message \(400\)/);
  assert.match(noCredit.fix, /Billing in the Claude Console/);
  const [, limited] = await checkAiServices({ ...base, fetch: onClaude((url) => (url.includes('/v1/models') ? json(claudeModels) : claudeError(429, 'rate_limit_error'))) });
  assert.match(limited.problem, /rate limit is used up/);
  const [, busy] = await checkAiServices({ ...base, fetch: onClaude((url) => (url.includes('/v1/models') ? json(claudeModels) : claudeError(529, 'overloaded_error'))) });
  assert.match(busy.problem, /overloaded or down right now \(529\)/);
  // Provider error text is never passed on.
  assert.ok(!JSON.stringify([badClaudeKey, noCredit, limited, busy]).includes('must not be shown'));
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
