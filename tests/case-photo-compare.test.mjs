import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { test } from 'node:test';
import sharp from 'sharp';
import { compareCasePhotos, normalizeComparison } from '../lib/case-photo-compare.ts';

// Resolve the app's TypeScript aliases when loading a route directly in Node.
const hooks = registerHooks({
  resolve(specifier, context, next) {
    if (specifier.startsWith('@/')) return next(new URL(`../${specifier.slice(2)}.ts`, import.meta.url).href, context);
    return next(specifier, context);
  },
});
const { POST } = await import('../app/api/cases/compare-photos/route.ts');
const audit = await import('../app/api/cases/audit/route.ts');
hooks.deregister();

const ids = { before: 'P1', after: 'P2' };
const good = {
  same_view: true, finding: 'new_damage', charge_link: 'shows_damage',
  summary: 'The move-out photo shows a hole in the wall beside the door that the move-in photo does not show.',
  differences: [{ what: 'Hole in drywall', where: 'Left of the door, waist height', before: 'Wall intact', after: 'Fist-sized hole', kind: 'damage', box: [120, 400, 260, 520] }],
  retake: '',
};

test('a comparison is checked before it is shown', () => {
  const ok = normalizeComparison(good, ids, 'claude', '2026-11-15T10:00:00.000Z');
  assert.deepEqual(ok, {
    before: 'P1', after: 'P2', checkedAt: '2026-11-15T10:00:00.000Z', by: 'claude', sameView: true,
    finding: 'new_damage', chargeLink: 'shows_damage', summary: good.summary,
    differences: [{ what: 'Hole in drywall', where: 'Left of the door, waist height', before: 'Wall intact', after: 'Fist-sized hole', kind: 'damage', box: [120, 400, 260, 520] }],
    retake: '',
  });

  // Unknown labels fall back to the cautious ones; boxes must be four numbers
  // that make a real area, clamped to the photo; empty items are dropped.
  const odd = normalizeComparison({
    ...good, finding: 'obviously the tenant', charge_link: 'yes',
    differences: [
      { what: 'Scuff', kind: 'graffiti', box: [-50, 10, 2000, 900] },
      { what: 'Stain', kind: 'cleanliness', box: [10, 10, 12, 12] },
      { what: 'Mark', kind: 'wear', box: ['a', 1, 2, 3] },
      { what: '', kind: 'damage', box: [] },
    ],
  }, ids, 'gemini', 'now');
  assert.equal(odd.finding, 'unclear');
  assert.equal(odd.chargeLink, 'unclear');
  assert.deepEqual(odd.differences.map((item) => [item.kind, item.box]), [['angle_or_lighting', [0, 10, 1000, 900]], ['cleanliness', null], ['wear', null]]);

  // Photos of different spots cannot show a change, whatever the model claims.
  const elsewhere = normalizeComparison({ ...good, same_view: false, retake: 'Take the move-out photo from the doorway.' }, ids, 'claude', 'now');
  assert.deepEqual([elsewhere.sameView, elsewhere.finding, elsewhere.chargeLink, elsewhere.differences[0].box], [false, 'unclear', 'unclear', null]);
  assert.equal(elsewhere.retake, 'Take the move-out photo from the doorway.');

  // No prices, ever: a sentence with one is removed.
  const priced = normalizeComparison({ ...good, summary: 'There is a hole by the door. Fixing it costs about $250.' }, ids, 'claude', 'now');
  assert.equal(priced.summary, 'There is a hole by the door.');
  assert.throws(() => normalizeComparison({ ...good, summary: '  ' }, ids, 'claude', 'now'), /empty/);
});

const claude = (value, status = 200) => new Response(JSON.stringify(status === 200 ? {
  id: 'msg', type: 'message', role: 'assistant', model: 'claude-test', content: [{ type: 'text', text: JSON.stringify(value) }],
  stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 },
} : { type: 'error', error: { type: 'overloaded_error', message: 'busy' } }), { status, headers: { 'content-type': 'application/json' } });
const photo = (id) => ({ id, name: `${id}.jpg`, mime: 'image/jpeg', data: Buffer.from(id).toString('base64') });

test('Claude sees the move-in photo first, then the move-out photo, with the charge', async () => {
  let body;
  const result = await compareCasePhotos({
    claudeKey: 'c-key', claudeModel: 'claude-test', geminiModel: 'g',
    charge: { id: 'C1', name: 'Wall repair', room: 'Bedroom' }, before: photo('P1'), after: photo('P2'),
    fetch: async (url, init) => {
      body = JSON.parse(init.body);
      return claude(good);
    },
  });
  const content = body.messages[0].content;
  assert.match(content[0].text, /"name":"Wall repair","room":"Bedroom"/);
  assert.deepEqual(content.filter((part) => part.type === 'text').slice(1).map((part) => part.text), ['Photo P1 (move-in): P1.jpg', 'Photo P2 (move-out): P2.jpg']);
  assert.deepEqual(content.filter((part) => part.type === 'image').map((part) => part.source.data), [photo('P1').data, photo('P2').data]);
  assert.match(body.system, /Do not report angle, lighting or colour shifts as damage/);
  assert.match(body.system, /Never say who caused a change, .* or what anything costs/);
  assert.deepEqual([result.by, result.finding, result.before, result.after], ['claude', 'new_damage', 'P1', 'P2']);
});

test('Gemini stands in when Claude fails', async () => {
  const urls = [];
  const result = await compareCasePhotos({
    claudeKey: 'c-key', claudeModel: 'claude-test', geminiKey: 'g-key', geminiModel: 'gemini-test', retryDelay: 0,
    charge: { id: 'C1', name: 'Wall repair', room: 'Bedroom' }, before: photo('P1'), after: photo('P2'),
    fetch: async (url) => {
      urls.push(String(url));
      if (String(url).includes('anthropic.com')) return claude(null, 529);
      return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(good) }] } }] });
    },
  });
  assert.equal(result.by, 'gemini');
  assert.ok(urls.some((url) => url.includes('generativelanguage.googleapis.com')));
});

// --- the route --------------------------------------------------------------

const userId = 'photo-test-user';
const caseId = '20646de5-2bd9-42a5-86d1-f9600f950a1b';
const supabase = 'https://supabase.example';

async function setup(t, { row, model }) {
  const env = { NEXT_PUBLIC_SUPABASE_URL: supabase, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'pk', ANTHROPIC_API_KEY: 'c-key', GEMINI_API_KEY: '', ANTHROPIC_FAST_MODE: 'off' };
  for (const [name, value] of Object.entries(env)) {
    const previous = process.env[name];
    process.env[name] = value;
    t.after(() => (previous === undefined ? delete process.env[name] : (process.env[name] = previous)));
  }
  const big = await sharp({ create: { width: 3000, height: 2000, channels: 3, background: '#9a8f80' } }).jpeg().toBuffer();
  const calls = { model: [], supabase: [] };
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    const url = new URL(input);
    if (url.origin === supabase) {
      calls.supabase.push({ method: options?.method ?? 'GET', path: url.pathname, auth: new Headers(options?.headers).get('authorization') });
      if (url.pathname === '/auth/v1/user') return Response.json({ id: userId, aud: 'authenticated' });
      if (url.pathname === '/rest/v1/cases') return Response.json([row]);
      if (url.pathname === '/rest/v1/inspection_comparisons') return Response.json([]);
      if (url.pathname.startsWith('/storage/v1/object/')) return new Response(big, { headers: { 'content-type': 'image/jpeg' } });
      return new Response('{}', { status: 404 });
    }
    const body = JSON.parse(options.body);
    calls.model.push(body);
    return claude(model(body));
  });
  return calls;
}
const evidence = [
  { source_id: 'P1', name: 'in.jpg', kind: 'before', type: 'image/jpeg', bucket: 'photos', path: `${userId}/${caseId}/in.jpg` },
  { source_id: 'P2', name: 'out.jpg', kind: 'after', type: 'image/jpeg', bucket: 'photos', path: `${userId}/${caseId}/out.jpg` },
  { source_id: 'D1', name: 'letter.pdf', kind: 'letter', type: 'application/pdf', bucket: 'documents', path: `${userId}/${caseId}/letter.pdf` },
];
const row = { charges: [{ source_id: 'C1', name: 'Wall repair', room: 'Bedroom', amount_cents: 25000 }], evidence };
const post = (body, token = 'renter-token') => POST(new Request('http://app/api/cases/compare-photos', {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body),
}));

test('the route compares the chosen pair under the renter’s own session', async (t) => {
  const calls = await setup(t, { row, model: () => good });
  const response = await post({ caseId, chargeId: 'C1', beforeId: 'P1', afterId: 'P2', consent: true });
  assert.equal(response.status, 200);
  const { comparison } = await response.json();
  assert.deepEqual([comparison.finding, comparison.before, comparison.after, comparison.by], ['new_damage', 'P1', 'P2', 'claude']);
  // Read-only, all with the renter's token: nothing is written to Supabase.
  assert.ok(calls.supabase.every((call) => call.method === 'GET' && call.auth === 'Bearer renter-token'));
  assert.deepEqual(calls.supabase.filter((call) => call.path.startsWith('/storage')).map((call) => call.path), [`/storage/v1/object/photos/${userId}/${caseId}/in.jpg`, `/storage/v1/object/photos/${userId}/${caseId}/out.jpg`]);
  // The copies sent are resized; the originals are not touched.
  const images = calls.model[0].messages[0].content.filter((part) => part.type === 'image');
  assert.equal(images.length, 2);
  for (const image of images) {
    const { width, height } = await sharp(Buffer.from(image.source.data, 'base64')).metadata();
    assert.equal(Math.max(width, height), 1568);
  }
  assert.ok(!JSON.stringify(calls.model).includes('c-key'));
});

test('the route refuses what it should not compare', async (t) => {
  const calls = await setup(t, { row, model: () => good });
  const cases = [
    [{ caseId, chargeId: 'C1', beforeId: 'P1', afterId: 'P2', consent: true }, null, 401],
    [{ caseId: 'nope', chargeId: 'C1', beforeId: 'P1', afterId: 'P2', consent: true }, 'renter-token', 400],
    [{ caseId, chargeId: 'C1', beforeId: 'P1', afterId: 'P2' }, 'renter-token', 400],
    // Reversed sides, a document, and an unknown charge.
    [{ caseId, chargeId: 'C1', beforeId: 'P2', afterId: 'P1', consent: true }, 'renter-token', 400],
    [{ caseId, chargeId: 'C1', beforeId: 'P1', afterId: 'D1', consent: true }, 'renter-token', 400],
    [{ caseId, chargeId: 'C9', beforeId: 'P1', afterId: 'P2', consent: true }, 'renter-token', 409],
  ];
  for (const [body, token, status] of cases) assert.equal((await post(body, token)).status, status, JSON.stringify(body));
  assert.equal(calls.model.length, 0);
});

test('a photo stored outside this case is not read', async (t) => {
  const moved = { ...row, evidence: [evidence[0], { ...evidence[1], path: `someone-else/${caseId}/out.jpg` }] };
  const calls = await setup(t, { row: moved, model: () => good });
  assert.equal((await post({ caseId, chargeId: 'C1', beforeId: 'P1', afterId: 'P2', consent: true })).status, 409);
  assert.ok(!calls.supabase.some((call) => call.path.startsWith('/storage')));
});

test('the audit takes a saved comparison into account, but only for the same pair', async (t) => {
  const analysis = { before: 'P1', after: 'P2', finding: 'already_there', summary: 'The crack is visible in both photos.' };
  const calls = await setup(t, {
    row: {
      ...row, address: '12 Oak St', deposit_cents: 100000, returned_cents: 75000,
      evidence: evidence.slice(0, 2),
      photo_pairs: { C1: { before: 'P1', after: 'P2', analysis }, C2: { before: 'P1', after: 'P9', analysis } },
    },
    model: () => ({ charges: [] }),
  });
  const response = await audit.POST(new Request('http://app/api/cases/audit', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer renter-token' }, body: JSON.stringify({ caseId, consent: true }),
  }));
  assert.equal(response.status, 200);
  const auditor = calls.model.find((body) => body.system.startsWith('You audit'));
  const text = auditor.messages[0].content[0].text;
  assert.match(text, /"spot":"Wall repair \(C1, photos P1 and P2\)","category":"already_there","summary":"The crack is visible in both photos\."/);
  assert.equal(text.match(/The crack is visible/g).length, 1);
});
