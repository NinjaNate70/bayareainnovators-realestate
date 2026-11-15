import assert from 'node:assert/strict';
import { test } from 'node:test';
import { askClaude, fastMode } from '../lib/claude-json.ts';
import { checkAiServices } from '../lib/ai-status.ts';

const message = (value, speed) => new Response(JSON.stringify({
  id: 'msg', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [{ type: 'text', text: JSON.stringify(value) }],
  stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1, speed },
}), { headers: { 'content-type': 'application/json' } });
const down = (status) => new Response(JSON.stringify({ type: 'error', error: { type: 'x', message: 'detail' } }), { status, headers: { 'content-type': 'application/json' } });
const ask = (fetch, extra = {}) => askClaude({ apiKey: 'c-key', model: 'claude-opus-5-5', system: 's', content: 'q', schema: { type: 'object', properties: { a: { type: 'string' } } }, timeout: 20_000, fetch, ...extra });

test('fast mode is on for the models that offer it, unless switched off', () => {
  assert.equal(fastMode('claude-opus-5-5', undefined), true);
  assert.equal(fastMode('claude-fable-5-2', ''), true);
  assert.equal(fastMode('claude-opus-5-5', 'off'), false);
  assert.equal(fastMode('claude-opus-5-5', ' OFF '), false);
  // A model without fast mode is never sent the setting, whatever the switch says.
  assert.equal(fastMode('claude-haiku-5-5', undefined), false);
  assert.equal(fastMode('claude-opus-5', 'on'), false);
});

test('requests ask for fast speed and keep every other setting', async () => {
  const bodies = [];
  const result = await ask(async (url, init) => { bodies.push(JSON.parse(init.body)); return message({ a: 'ok' }, 'fast'); });
  assert.deepEqual(result, { a: 'ok' });
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].speed, 'fast');
  assert.equal(bodies[0].fallbacks, 'default');
  assert.equal(bodies[0].output_config.format.type, 'json_schema');
  // Switched off, or on a model without it, the request carries no speed at all.
  for (const extra of [{ fast: false }, { model: 'claude-haiku-5-5' }]) {
    const sent = [];
    await ask(async (url, init) => { sent.push(JSON.parse(init.body)); return message({ a: 'ok' }); }, extra);
    assert.ok(!('speed' in sent[0]), JSON.stringify(extra));
  }
});

test('when fast mode is turned away, the request is retried once at standard speed', async () => {
  for (const status of [429, 400, 529]) {
    const speeds = [];
    const result = await ask(async (url, init) => {
      const body = JSON.parse(init.body);
      speeds.push(body.speed ?? 'standard');
      return body.speed === 'fast' ? down(status) : message({ a: 'ok' }, 'standard');
    });
    assert.deepEqual(result, { a: 'ok' }, String(status));
    assert.deepEqual(speeds, ['fast', 'standard'], String(status));
  }
});

test('a failure that is not about speed is reported as it is, without a second try', async () => {
  let calls = 0;
  await assert.rejects(ask(async () => { calls += 1; return down(401); }), /^Error: Claude request failed \(401\)\.$/);
  assert.equal(calls, 1);
  // Standard speed failing too reports the standard attempt's status.
  await assert.rejects(ask(async (url, init) => down(JSON.parse(init.body).speed === 'fast' ? 429 : 529)), /Claude request failed \(529\)/);
  // With no time left for a second try, the first failure stands.
  let tries = 0;
  await assert.rejects(ask(async () => { tries += 1; return down(429); }, { timeout: 2_000 }), /Claude request failed \(429\)/);
  assert.equal(tries, 1);
});

const models = { data: [{ id: 'claude-opus-5-5', type: 'model', display_name: 'x', created_at: '2026-01-01T00:00:00Z' }], has_more: false, first_id: 'claude-opus-5-5', last_id: 'claude-opus-5-5' };
const json = (value) => new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
const check = async (fetch) => (await checkAiServices({ geminiModel: 'g', claudeKey: 'c-key', claudeModel: 'claude-opus-5-5', fetch })).find((item) => item.service === 'Claude');

test('the connection check says whether fast mode is really in use', async () => {
  const on = await check(async (url, init) => (String(url).includes('/v1/models') ? json(models) : message('ok', 'fast')));
  assert.equal(on.ok, true);
  assert.match(on.note, /^Fast mode is on/);
  const refused = await check(async (url, init) => {
    if (String(url).includes('/v1/models')) return json(models);
    return JSON.parse(init.body).speed === 'fast' ? down(429) : message('ok', 'standard');
  });
  assert.equal(refused.ok, true);
  assert.match(refused.note, /Fast mode isn’t available to this key right now \(429\), so requests run at standard speed/);
  // A key that fails either way is still reported as not working.
  const broken = await check(async (url) => (String(url).includes('/v1/models') ? json(models) : down(400)));
  assert.equal(broken.ok, false);
});
