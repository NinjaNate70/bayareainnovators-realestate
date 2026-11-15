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
    { id: 'D1', kind: 'other', name: 'move-in checklist.pdf', mime: 'application/pdf', data: 'Q0hFQ0s=' },
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
const claude = (value, extra = {}) => new Response(JSON.stringify({
  id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-test',
  content: [{ type: 'text', text: JSON.stringify(value) }],
  stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 }, ...extra,
}), { headers: { 'content-type': 'application/json' } });
const down = (status) => new Response('{}', { status, headers: { 'content-type': 'application/json' } });
const onClaude = (url) => String(url).includes('anthropic.com');

const reading = { documents: [], charges: [{ charge_id: 'C2', appears_in_letter: true, amount_in_letter: 150.5, landlord_reason: 'Cleaning', receipt_or_invoice: 'not_attached', work_details: '', supporting_evidence: '', file_ids: ['L1'] }], itemized_statement: true, supporting_documents: [], lease_terms: [], notes: '' };
const support = { ...reading, charges: [], supporting_documents: [{ file_id: 'D1', what_it_is: 'Move-in checklist', dated: '2025-09-01', relevant_facts: 'Notes "scuffs on bedroom walls" at move-in.' }] };
const seen = { charges: [{ charge_id: 'C1', finding: 'wear_and_tear', description: 'Light scuffs.', photo_ids: ['P1', 'P2'] }] };
const verdict = { charges: [
  { charge_id: 'C1', status: 'not-allowed', reason: 'Only light scuffs are visible.', evidence_ids: ['P1', 'P2'], guide_sections: ['G6'], requests: [] },
  { charge_id: 'C2', status: 'disputable', reason: 'No receipt is attached.', evidence_ids: ['L1'], guide_sections: ['G4'], requests: ['Ask for the cleaning invoice'] },
  { charge_id: 'C3', status: 'info', reason: 'The key is not mentioned.', evidence_ids: [], guide_sections: [], requests: ['The key return receipt'] },
] };
const keys = { guide, geminiKey: 'g-key', geminiModel: 'gemini-test', claudeKey: 'c-key', claudeModel: 'claude-test', retryDelay: 0 };

// Which job a request is doing, from what it carries. Works for both services.
function job(url, init) {
  const body = JSON.parse(init.body);
  const parts = onClaude(url)
    ? body.messages[0].content.map((part) => ({ text: part.text, data: part.source?.data, mime: part.source?.media_type }))
    : body.contents[0].parts.map((part) => ({ text: part.text, data: part.inline_data?.data, mime: part.inline_data?.mime_type }));
  const files = parts.filter((part) => part.data).map((part) => part.data);
  const name = !files.length ? 'auditor' : files.includes('QkVGT1JF') ? 'photos' : files.includes('UERG') ? 'core' : 'support';
  return { name, body, parts, files, text: parts.map((part) => part.text ?? '').join('\n') };
}
const answer = { core: reading, support, photos: seen, auditor: verdict };

test('Claude reads the documents in parallel batches, examines the photos and audits', async () => {
  const calls = [];
  const result = await runCaseAudit({ ...keys, input, fetch: async (url, init) => {
    const call = job(url, init);
    calls.push({ ...call, url: String(url), headers: new Headers(init.headers) });
    return claude(answer[call.name]);
  } });
  // Four requests, all to Claude: letter and lease, the supporting document, the photos, then the auditor.
  assert.deepEqual(calls.map((call) => call.name).sort(), ['auditor', 'core', 'photos', 'support']);
  assert.ok(calls.every((call) => onClaude(call.url) && call.headers.get('authorization') === 'Bearer c-key'));
  assert.equal(calls.at(-1).name, 'auditor');
  assert.equal(result.documents_read_by, 'claude');
  assert.deepEqual([result.documents_read, result.photos_read], [3, 2]);
  assert.deepEqual(result.charges.map((c) => [c.id, c.verdict, c.high]), [['C1', 'not-allowed', 400], ['C2', 'disputable', 150.5], ['C3', 'info', 0]]);

  const core = calls.find((call) => call.name === 'core');
  const sent = core.body.messages[0].content;
  // The PDF goes as a document block and the scanned lease as an image, each after its label.
  assert.deepEqual(sent.find((part) => part.type === 'document').source, { type: 'base64', media_type: 'application/pdf', data: 'UERG' });
  assert.deepEqual(sent.find((part) => part.type === 'image').source, { type: 'base64', media_type: 'image/png', data: 'TEVBU0U=' });
  assert.equal(sent[sent.findIndex((part) => part.type === 'document') - 1].text, 'File L1 (letter): letter.pdf');
  // Each batch holds only its own files.
  assert.deepEqual(core.files, ['UERG', 'TEVBU0U=']);
  const extra = calls.find((call) => call.name === 'support');
  assert.deepEqual(extra.files, ['Q0hFQ0s=']);
  assert.match(extra.text, /File D1 \(supporting document\): move-in checklist\.pdf/);
  assert.match(extra.text, /supporting documents only/);
  assert.deepEqual(calls.find((call) => call.name === 'photos').files, ['QkVGT1JF', 'QUZURVI=']);
  // Nullable and nested fields are closed off the way structured outputs require.
  const item = core.body.output_config.format.schema.properties.charges.items;
  assert.equal(item.additionalProperties, false);
  assert.deepEqual(item.properties.amount_in_letter, { anyOf: [{ type: 'number' }, { type: 'null' }] });

  // The auditor gets every reader's findings, not the files, and thinks harder than the readers.
  const auditor = calls.find((call) => call.name === 'auditor');
  for (const expected of ['"receipt_or_invoice":"not_attached"', 'scuffs on bedroom walls', '"file_ids":["D1"]', '"finding":"wear_and_tear"', '"spot":"Sink"', '"move_out_date":"2026-10-31"']) assert.ok(auditor.text.includes(expected), expected);
  assert.ok(guide.every((section) => auditor.body.system.includes(`[${section.id}]`)));
  assert.match(auditor.body.system, /move-in checklist or dated message/);
  assert.equal(auditor.body.output_config.effort, 'medium');
  assert.equal(core.body.output_config.effort, 'low');
  assert.ok(!auditor.text.includes('UERG') && !JSON.stringify(calls.map((call) => call.body)).includes('-key'));
});

test('supporting documents are read two at a time, at the same time as everything else', async () => {
  const many = { ...input, files: [...input.files, ...['D2', 'D3', 'D4', 'D5'].map((id) => ({ id, kind: 'other', name: `${id}.pdf`, mime: 'application/pdf', data: `RE9D${id}` }))] };
  let open = 0, most = 0;
  const batches = [];
  const result = await runCaseAudit({ ...keys, input: many, fetch: async (url, init) => {
    const call = job(url, init);
    if (call.name !== 'auditor') { open += 1; most = Math.max(most, open); batches.push(call.files.length); await new Promise((resolve) => setTimeout(resolve, 20)); open -= 1; }
    return claude(answer[call.name]);
  } });
  // Letter+lease, three pairs of supporting documents (one short), and the photos: five readers at once.
  assert.deepEqual(batches.sort(), [1, 2, 2, 2, 2]);
  assert.equal(most, 5);
  assert.equal(result.documents_read, 7);
});

test('it runs on Claude alone, with no Gemini key', async () => {
  const result = await runCaseAudit({ ...keys, geminiKey: undefined, input, fetch: async (url, init) => {
    assert.ok(onClaude(url));
    return claude(answer[job(url, init).name]);
  } });
  assert.deepEqual(result.charges.map((c) => c.verdict), ['not-allowed', 'disputable', 'info']);
  await assert.rejects(runCaseAudit({ ...keys, geminiKey: undefined, input, fetch: async () => down(529) }), /^Error: Claude request failed \(529\)\.$/);
  await assert.rejects(runCaseAudit({ ...keys, geminiKey: undefined, claudeKey: undefined, input, fetch: async () => down(500) }), /No AI service is configured/);
});

test('Gemini stands in for any step Claude fails', async () => {
  for (const failing of ['core', 'photos', 'auditor', 'all']) {
    const standIns = [];
    const result = await runCaseAudit({ ...keys, input, fetch: async (url, init) => {
      const call = job(url, init);
      if (onClaude(url)) return failing === 'all' || failing === call.name ? down(529) : claude(answer[call.name]);
      standIns.push(call.name);
      return gemini(answer[call.name]);
    } });
    assert.deepEqual(standIns.sort(), failing === 'all' ? ['auditor', 'core', 'photos', 'support'] : [failing], failing);
    assert.deepEqual(result.charges.map((c) => c.verdict), ['not-allowed', 'disputable', 'info'], failing);
    assert.equal(result.documents_read_by, failing === 'all' ? 'gemini' : 'claude');
  }
  // A refusal or a cut-off answer from Claude counts as a failure too.
  for (const extra of [{ stop_reason: 'refusal', content: [] }, { stop_reason: 'max_tokens' }]) {
    const result = await runCaseAudit({ ...keys, input, fetch: async (url, init) => {
      const call = job(url, init);
      return onClaude(url) ? claude(answer[call.name], call.name === 'auditor' ? extra : {}) : gemini(answer[call.name]);
    } });
    assert.equal(result.charges[1].verdict, 'disputable');
  }
});

test('evidence a reader could not open cannot support a finding', async () => {
  // Photos fail on both services; documents are read.
  const noPhotos = await runCaseAudit({ ...keys, input, fetch: async (url, init) => {
    const call = job(url, init);
    if (call.name === 'photos') return down(503);
    if (call.name === 'auditor') assert.match(call.text, /photos could not be examined/);
    return claude(answer[call.name]);
  } });
  assert.equal(noPhotos.photos_read, 0);
  // C1 leaned on photos nobody examined, so it is left open. C2 stands on the letter.
  assert.deepEqual(noPhotos.charges.map((c) => c.verdict), ['info', 'disputable', 'info']);

  // The supporting batch fails; a finding that cites it is left open, while the letter still counts.
  const cites = { charges: [
    { charge_id: 'C1', status: 'disputable', reason: 'The checklist notes scuffs.', evidence_ids: ['D1'], guide_sections: ['G6'], requests: [] },
    { charge_id: 'C2', status: 'disputable', reason: 'No receipt is attached.', evidence_ids: ['L1'], guide_sections: ['G4'], requests: [] },
  ] };
  const noSupport = await runCaseAudit({ ...keys, input, fetch: async (url, init) => {
    const call = job(url, init);
    if (call.name === 'support') return down(500);
    if (call.name === 'auditor') { assert.match(call.text, /Documents that could not be read, by file id\. Treat them as unavailable: \["D1"\]/); return claude(cites); }
    return claude(answer[call.name]);
  } });
  assert.equal(noSupport.documents_read, 2);
  assert.deepEqual(noSupport.charges.map((c) => c.verdict), ['info', 'disputable', 'info']);

  // When that batch is read, the same finding stands.
  const withSupport = await runCaseAudit({ ...keys, input, fetch: async (url, init) => {
    const call = job(url, init);
    return claude(call.name === 'auditor' ? cites : answer[call.name]);
  } });
  assert.deepEqual([withSupport.charges[0].verdict, withSupport.charges[0].sources], ['disputable', ['G6', 'D1']]);
});

test('a case with no files is audited without the readers and stays open', async () => {
  let n = 0;
  const result = await runCaseAudit({ ...keys, input: { ...input, files: [], photoPairs: {} }, fetch: async (url, init) => {
    n += 1;
    assert.match(job(url, init).text, /No deduction letter, lease or supporting document was uploaded/);
    return claude(verdict);
  } });
  assert.equal(n, 1);
  assert.equal(result.documents_read_by, 'none');
  assert.deepEqual(result.charges.map((c) => c.verdict), ['info', 'info', 'info']);
});

test('the audit fails as a whole, naming each service, if no auditor answers', async () => {
  await assert.rejects(runCaseAudit({ ...keys, input, fetch: async (url, init) => {
    const call = job(url, init);
    if (call.name !== 'auditor') return claude(answer[call.name]);
    return down(onClaude(url) ? 529 : 503);
  } }), { name: 'AiServiceError', message: 'Claude request failed (529); Gemini request failed (503).' });
});

test('with little time left the auditor thinks less, and with none the audit stops', async () => {
  const efforts = [];
  const fetch = async (url, init) => {
    const call = job(url, init);
    if (call.name === 'auditor') efforts.push(call.body.output_config.effort);
    return claude(answer[call.name]);
  };
  // 40 seconds already spent fetching files: under 26 seconds remain for the auditor.
  await runCaseAudit({ ...keys, geminiKey: undefined, input, startedAt: Date.now() - 40_000, fetch });
  assert.deepEqual(efforts, ['low']);
  await assert.rejects(runCaseAudit({ ...keys, geminiKey: undefined, input, startedAt: Date.now() - 58_000, fetch }), { name: 'TimeoutError' });
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
