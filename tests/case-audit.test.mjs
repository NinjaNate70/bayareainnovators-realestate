import assert from 'node:assert/strict';
import { test } from 'node:test';
import { depositGuide } from '../lib/case-assistant.ts';
import { normalizeFindings, runCaseAudit } from '../lib/case-audit.ts';
import { estimateRecovery } from '../lib/estimate.ts';

const guide = [...depositGuide];
const charges = [
  { id: 'C1', name: 'Full repaint', room: 'Bedroom', amount: 400 },
  { id: 'C2', name: 'Cleaning', room: 'Whole home', amount: 150.5 },
  { id: 'C3', name: 'Key', room: 'Entry', amount: 75 },
];
const input = {
  facts: { today: '2026-11-15', address: '12 Oak St, CA', move_out_date: '2026-10-31', letter_received_date: null, deposit_paid: 1800, amount_returned: 1174.5 },
  charges,
  files: [
    { id: 'L1', kind: 'letter', name: 'letter.pdf', mime: 'application/pdf', data: 'UERG' },
    { id: 'L2', kind: 'lease', name: 'lease.png', mime: 'image/png', data: 'TEVBU0U=' },
    { id: 'P1', kind: 'before', name: 'bedroom in.jpg', mime: 'image/jpeg', data: 'QkVGT1JF' },
    { id: 'P2', kind: 'after', name: 'bedroom out.jpg', mime: 'image/jpeg', data: 'QUZURVI=' },
  ],
  skipped: [],
  photoPairs: { C1: { before: 'P1', after: 'P2' } },
  inspections: [{ room: 'Kitchen', spot: 'Sink', category: 'no_damage', summary: 'No change.' }],
};

test('findings must rest on the renter’s evidence and the guide', () => {
  const found = normalizeFindings({ charges: [
    { charge_id: 'C1', status: 'not-allowed', reason: 'Photos show only light marks.', evidence_ids: ['P1', 'P2', 'P9'], guide_sections: ['G6', 'G99'], requests: [] },
    // Against the landlord, but citing no guide section.
    { charge_id: 'C2', status: 'disputable', reason: 'No receipt.', evidence_ids: ['L1'], guide_sections: [], requests: ['Ask for the invoice'] },
    // "Fair" with nothing to point to.
    { charge_id: 'C3', status: 'fair', reason: 'Looks right.', evidence_ids: ['made-up'], guide_sections: ['G6'], requests: [] },
    { charge_id: 'C9', status: 'fair', reason: 'Not a real charge.', evidence_ids: ['L1'], guide_sections: [], requests: [] },
  ] }, { charges, skipped: [] }, ['L1', 'L2', 'P1', 'P2'], guide);
  assert.deepEqual(found.map(({ id, verdict }) => [id, verdict]), [['C1', 'not-allowed'], ['C2', 'info'], ['C3', 'info']]);
  assert.deepEqual(found[0].sources, ['G6', 'P1', 'P2']);
  // The amount in question is the charge, never a model's number.
  assert.deepEqual([found[0].low, found[0].high], [400, 400]);
  assert.deepEqual([found[1].low, found[1].high], [0, 0]);
  assert.match(found[1].reason, /^No receipt\. This is not yet backed/);
  assert.deepEqual(found[1].requests, ['Ask for the invoice']);
  assert.ok(found[2].requests.length > 0);
});

test('a disputed charge is counted up to its amount; missing and bad output stays open', () => {
  const found = normalizeFindings({ charges: [
    { charge_id: 'C2', status: 'disputable', reason: 'Flat fee, no receipt.', evidence_ids: ['L1'], guide_sections: ['G4'], requests: [] },
    { charge_id: 'C3', status: 'guilty', reason: 'x', evidence_ids: ['L1'], guide_sections: ['G4'], requests: 'none' },
  ] }, { charges, skipped: [{ id: 'P3', name: 'big.jpg', reason: 'too large.' }] }, ['L1'], guide);
  assert.equal(found[0].verdict, 'info');
  assert.match(found[0].reason, /could not connect this charge/);
  assert.deepEqual([found[1].verdict, found[1].low, found[1].high], ['disputable', 0, 150.5]);
  assert.ok(found[1].requests.some((request) => request.includes('big.jpg')));
  assert.equal(found[2].verdict, 'info');
  assert.deepEqual(normalizeFindings({}, { charges, skipped: [] }, [], guide).map((c) => c.verdict), ['info', 'info', 'info']);
});

const gemini = (value) => new Response(JSON.stringify({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }] }));
const openai = (value) => new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }] }));
const reading = { documents: [], charges: [{ charge_id: 'C2', appears_in_letter: true, amount_in_letter: 150.5, landlord_reason: 'Cleaning', receipt_or_invoice: 'not_attached', work_details: '', file_ids: ['L1'] }], itemized_statement: true, lease_terms: [], notes: '' };
const seen = { charges: [{ charge_id: 'C1', finding: 'wear_and_tear', description: 'Light scuffs.', photo_ids: ['P1', 'P2'] }] };
const verdict = { charges: [
  { charge_id: 'C1', status: 'not-allowed', reason: 'Only light scuffs are visible.', evidence_ids: ['P1', 'P2'], guide_sections: ['G6'], requests: [] },
  { charge_id: 'C2', status: 'disputable', reason: 'No receipt is attached.', evidence_ids: ['L1'], guide_sections: ['G4'], requests: ['Ask for the cleaning invoice'] },
  { charge_id: 'C3', status: 'info', reason: 'The key is not mentioned.', evidence_ids: [], guide_sections: [], requests: ['The key return receipt'] },
] };
const keys = { guide, geminiKey: 'g-key', geminiModel: 'gemini-test', openAiKey: 'o-key', openAiModel: 'openai-test', retryDelay: 0 };
// Which job an OpenAI request is doing, from what it carries.
const openAiRole = (body) => {
  const parts = body.messages[1].content;
  if (parts.some((part) => part.type === 'file' || part.image_url?.url.startsWith('data:image/png'))) return 'documents';
  return parts.some((part) => part.type === 'image_url') ? 'photos' : 'auditor';
};
const role = (body) => (body.contents?.[0].parts.some((part) => part.inline_data) ? 'photos' : body.contents ? 'auditor' : 'documents');

test('OpenAI reads the documents, Gemini the photos, and the auditor sees both', async () => {
  const calls = [];
  const result = await runCaseAudit({ ...keys, input, fetch: async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url: String(url), body, headers: init.headers });
    if (String(url).includes('openai.com')) return openai(reading);
    return gemini(role(body) === 'photos' ? seen : verdict);
  } });
  assert.equal(result.documents_read_by, 'openai');
  assert.deepEqual([result.documents_read, result.photos_read], [2, 2]);
  assert.deepEqual(result.charges.map((c) => [c.id, c.verdict, c.high]), [['C1', 'not-allowed', 400], ['C2', 'disputable', 150.5], ['C3', 'info', 0]]);

  const docs = calls.find((call) => call.url.includes('openai.com'));
  assert.equal(docs.headers.Authorization, 'Bearer o-key');
  const sent = docs.body.messages[1].content;
  assert.deepEqual(sent.find((part) => part.type === 'file').file, { filename: 'letter.pdf', file_data: 'data:application/pdf;base64,UERG' });
  assert.equal(sent.find((part) => part.type === 'image_url').image_url.url, 'data:image/png;base64,TEVBU0U=');
  // Documents go only to the document reader; photos only to the photo analyst.
  assert.ok(!JSON.stringify(docs.body).includes('QkVGT1JF'));
  const photos = calls.find((call) => !call.url.includes('openai.com') && role(call.body) === 'photos');
  assert.deepEqual(photos.body.contents[0].parts.filter((part) => part.inline_data).map((part) => part.inline_data.data), ['QkVGT1JF', 'QUZURVI=']);
  const auditor = calls.find((call) => !call.url.includes('openai.com') && role(call.body) === 'auditor');
  const context = auditor.body.contents[0].parts[0].text;
  for (const expected of ['"receipt_or_invoice":"not_attached"', '"finding":"wear_and_tear"', '"spot":"Sink"', '"move_out_date":"2026-10-31"']) assert.ok(context.includes(expected), expected);
  assert.ok(guide.every((section) => auditor.body.systemInstruction.parts[0].text.includes(`[${section.id}]`)));
  // The auditor gets findings, not files, and no key reaches any prompt.
  assert.ok(!context.includes('UERG') && !JSON.stringify(calls.map((call) => call.body)).includes('-key'));
});

test('Gemini reads the documents when OpenAI is missing or failing', async () => {
  for (const extra of [{ openAiKey: undefined }, {}]) {
    const result = await runCaseAudit({ ...keys, ...extra, input, fetch: async (url, init) => {
      if (String(url).includes('openai.com')) return new Response('no', { status: 400 });
      const body = JSON.parse(init.body);
      const parts = body.contents[0].parts;
      if (parts.some((part) => part.inline_data?.mime_type === 'application/pdf')) return gemini(reading);
      return gemini(role(body) === 'photos' ? seen : verdict);
    } });
    assert.equal(result.documents_read_by, 'gemini');
    assert.equal(result.charges[1].verdict, 'disputable');
  }
});

test('evidence a reader could not open cannot support a finding', async () => {
  const result = await runCaseAudit({ ...keys, input, fetch: async (url, init) => {
    const body = JSON.parse(init.body);
    if (String(url).includes('openai.com')) return openAiRole(body) === 'documents' ? openai(reading) : new Response('down', { status: 500 });
    if (role(body) === 'photos') return new Response('down', { status: 503 });
    assert.match(body.contents[0].parts[0].text, /photos could not be examined/);
    return gemini(verdict);
  } });
  assert.equal(result.photos_read, 0);
  // C1 leaned on photos nobody examined, so it is left open. C2 stands on the letter.
  assert.deepEqual(result.charges.map((c) => c.verdict), ['info', 'disputable', 'info']);
});

test('a case with no files is audited without the readers and stays open', async () => {
  let n = 0;
  const result = await runCaseAudit({ ...keys, input: { ...input, files: [], photoPairs: {} }, fetch: async (url, init) => {
    n += 1;
    assert.match(JSON.parse(init.body).contents[0].parts[0].text, /No deduction letter or lease was uploaded/);
    return gemini(verdict);
  } });
  assert.equal(n, 1);
  assert.equal(result.documents_read_by, 'none');
  assert.deepEqual(result.charges.map((c) => c.verdict), ['info', 'info', 'info']);
});

test('the audit fails as a whole, naming Gemini, if no auditor answers', async () => {
  await assert.rejects(runCaseAudit({ ...keys, input, fetch: async (url, init) => {
    const body = JSON.parse(init.body);
    if (String(url).includes('openai.com')) return openAiRole(body) === 'documents' ? openai(reading) : new Response('down', { status: 500 });
    return role(body) === 'photos' ? gemini(seen) : new Response('down', { status: 500 });
  } }), /Gemini request failed \(500\)/);
});

test('a busy Gemini model is retried once', async () => {
  const attempts = { photos: 0, auditor: 0 };
  const result = await runCaseAudit({ ...keys, input, fetch: async (url, init) => {
    const body = JSON.parse(init.body);
    if (String(url).includes('openai.com')) {
      assert.equal(openAiRole(body), 'documents');
      return openai(reading);
    }
    const job = role(body);
    attempts[job] += 1;
    if (attempts[job] === 1) return new Response('overloaded', { status: 503 });
    return gemini(job === 'photos' ? seen : verdict);
  } });
  assert.deepEqual(attempts, { photos: 2, auditor: 2 });
  assert.deepEqual(result.charges.map((c) => c.verdict), ['not-allowed', 'disputable', 'info']);
});

test('OpenAI examines the photos and audits when Gemini stays overloaded', async () => {
  const openAiJobs = [];
  let geminiCalls = 0;
  const result = await runCaseAudit({ ...keys, input, fetch: async (url, init) => {
    const body = JSON.parse(init.body);
    if (!String(url).includes('openai.com')) { geminiCalls += 1; return new Response('overloaded', { status: 503 }); }
    const job = openAiRole(body);
    openAiJobs.push(job);
    assert.match(body.messages[0].content, /Return JSON with/);
    return openai(job === 'documents' ? reading : job === 'photos' ? seen : verdict);
  } });
  assert.deepEqual(openAiJobs.sort(), ['auditor', 'documents', 'photos']);
  // Photos and auditor each tried Gemini twice before handing over.
  assert.equal(geminiCalls, 4);
  assert.deepEqual([result.documents_read, result.photos_read], [2, 2]);
  assert.deepEqual(result.charges.map((c) => c.verdict), ['not-allowed', 'disputable', 'info']);
});

test('an estimate needs audited findings', () => {
  const base = { id: 'x', demo: false, address: '', renter: '', landlord: '', moveOut: '', received: '', deposit: 1800, returned: 1174.5, evidence: [], completedStep: 4, audited: true, stale: false, letter: '', replyBy: '', incoming: '', reply: '' };
  const recorded = charges.map((c) => ({ ...c, verdict: 'disputable', reason: '', sources: ['L1'], low: 0, high: c.amount }));
  assert.equal(estimateRecovery({ ...base, charges: recorded }), null);
  const audited = recorded.map((c, i) => ({ ...c, requests: [], verdict: i === 0 ? 'not-allowed' : i === 1 ? 'disputable' : 'info', low: i === 0 ? 400 : 0, high: i === 2 ? 0 : c.amount }));
  const estimate = estimateRecovery({ ...base, charges: audited });
  assert.deepEqual([estimate.low, estimate.high, estimate.included.length], [400, 550.5, 2]);
  assert.equal(estimateRecovery({ ...base, stale: true, charges: audited }), null);
});
