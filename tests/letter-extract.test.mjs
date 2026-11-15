import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractLetter, normalizeExtraction } from '../lib/letter-extract.ts';

const reading = {
  readable: true,
  charges: [
    { description: 'Full bedroom repaint', room: 'Bedroom', amount: 400 },
    { description: 'Professional cleaning', room: '', amount: 150.499 },
    { description: 'Carpet', room: 'Hall', amount: 0 },
    { description: '', room: 'Hall', amount: 20 },
    { description: 'Mystery', room: 'Hall', amount: 'lots' },
  ],
  property_address: ' 12 Oak St, San Luis Obispo, CA ', landlord_name: 'Cedar Mgmt', renter_name: 'Sam',
  move_out_date: '2026-10-31', letter_date: 'Nov 10', deposit_amount: 1800, amount_returned: -5, notes: 'Line 3 is hard to read.',
};

test('keeps only charges with a description and a real amount, and bounds every field', () => {
  const found = normalizeExtraction(reading, 'claude');
  assert.deepEqual(found.charges, [
    { name: 'Full bedroom repaint', room: 'Bedroom', amount: 400 },
    { name: 'Professional cleaning', room: 'Unspecified', amount: 150.5 },
  ]);
  assert.deepEqual([found.readable, found.read_by, found.address, found.landlord], [true, 'claude', '12 Oak St, San Luis Obispo, CA', 'Cedar Mgmt']);
  // A date that is not YYYY-MM-DD and a negative amount are dropped, not guessed.
  assert.deepEqual([found.move_out_date, found.letter_date, found.deposit, found.returned], ['2026-10-31', '', 1800, null]);
  assert.equal(normalizeExtraction({ ...reading, readable: false }, 'gemini').charges.length, 0);
  assert.equal(normalizeExtraction({ readable: true, charges: [] }, 'gemini').readable, false);
  assert.equal(normalizeExtraction({ readable: true, charges: 'x', deposit_amount: 5e9 }, 'gemini').deposit, null);
  const many = { ...reading, charges: Array.from({ length: 60 }, (_, i) => ({ description: `Item ${i}`, room: '', amount: 1 })) };
  assert.equal(normalizeExtraction(many, 'claude').charges.length, 40);
});

const files = [
  { id: 'L1', kind: 'letter', name: 'letter.pdf', mime: 'application/pdf', data: 'UERG' },
  { id: 'L2', kind: 'lease', name: 'lease.jpg', mime: 'image/jpeg', data: 'TEVBU0U=' },
];
const keys = { files, geminiKey: 'g-key', geminiModel: 'gemini-test', claudeKey: 'c-key', claudeModel: 'claude-test', retryDelay: 0 };
const claude = (value, extra = {}) => new Response(JSON.stringify({
  id: 'msg', type: 'message', role: 'assistant', model: 'claude-test', content: [{ type: 'text', text: JSON.stringify(value) }],
  stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 }, ...extra,
}), { headers: { 'content-type': 'application/json' } });
const gemini = (value) => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] }));

test('Claude reads the letter and lease', async () => {
  const calls = [];
  const found = await extractLetter({ ...keys, fetch: async (url, init) => { calls.push({ url: String(url), body: JSON.parse(init.body) }); return claude(reading); } });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /api\.anthropic\.com\/v1\/messages/);
  const content = calls[0].body.messages[0].content;
  assert.deepEqual(content.map((part) => part.type), ['text', 'document', 'text', 'image']);
  assert.equal(content[0].text, 'File L1 (deduction letter): letter.pdf');
  assert.deepEqual(content[1].source, { type: 'base64', media_type: 'application/pdf', data: 'UERG' });
  assert.match(calls[0].body.system, /Never guess/);
  assert.deepEqual([found.read_by, found.charges.length, found.deposit], ['claude', 2, 1800]);
});

test('Gemini reads the letter when Claude is missing, failing, or declines', async () => {
  for (const [extra, respond] of [
    [{ claudeKey: undefined }, () => { throw new Error('should not be called'); }],
    [{}, () => new Response('{}', { status: 529, headers: { 'content-type': 'application/json' } })],
    [{}, () => claude(reading, { stop_reason: 'refusal', content: [] })],
  ]) {
    const found = await extractLetter({ ...keys, ...extra, fetch: async (url, init) => {
      if (String(url).includes('anthropic.com')) return respond();
      const parts = JSON.parse(init.body).contents[0].parts;
      assert.deepEqual(parts.filter((part) => part.inline_data).map((part) => part.inline_data.mime_type), ['application/pdf', 'image/jpeg']);
      return gemini(reading);
    } });
    assert.deepEqual([found.read_by, found.charges.length], ['gemini', 2]);
  }
});

test('when neither service can read it, the error names both', async () => {
  await assert.rejects(extractLetter({ ...keys, fetch: async (url) =>
    new Response('{}', { status: String(url).includes('anthropic.com') ? 401 : 503, headers: { 'content-type': 'application/json' } }) }),
  { name: 'AiServiceError', message: 'Claude request failed (401); Gemini request failed (503).' });
  await assert.rejects(extractLetter({ ...keys, claudeKey: undefined, fetch: async () => new Response('{}', { status: 503 }) }), /Gemini request failed \(503\)/);
});
