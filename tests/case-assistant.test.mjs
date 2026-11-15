import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  depositGuide,
  normalizeDraft,
  normalizeReview,
  normalizeRoute,
  parseAssistantRequest,
  runAssistant,
  summarizeCase,
} from '../lib/case-assistant.ts';

const caseId = 'df2d7dbd-1b1d-4f0e-bf9b-5f4a90f87d01';
const row = {
  address: '12 Oak St', renter_name: 'Sam', landlord_name: 'Lee', move_out_date: '2026-10-31',
  letter_received_date: null, deposit_cents: 180000, returned_cents: 50000, completed_step: 2, audited: false,
  letter_text: '', reply_by_date: null, incoming_text: '', reply_text: '',
  charges: [{ name: 'Repaint', room: 'Bedroom', amount_cents: 60000, verdict: 'info', reason: '' }],
  evidence: [{ name: 'letter.pdf', kind: 'letter' }, { name: 'a.png', kind: 'after' }],
};

test('validates the question, case id and conversation', () => {
  const parsed = parseAssistantRequest({
    message: '  What next?  ', caseId: caseId.toUpperCase(), page: 'letter',
    history: [{ role: 'user', text: ' hi ' }, { role: 'assistant', text: 'hello' }],
  });
  assert.deepEqual(parsed, {
    message: 'What next?', caseId, page: 'letter',
    history: [{ role: 'user', text: 'hi' }, { role: 'assistant', text: 'hello' }],
  });
  assert.equal(parseAssistantRequest({ message: 'x', page: 'made-up' }).page, 'other');
  assert.equal(parseAssistantRequest({ message: 'x', caseId: null }).caseId, null);
  assert.throws(() => parseAssistantRequest({ message: '' }), /1 to 2,000/);
  assert.throws(() => parseAssistantRequest({ message: 'x'.repeat(2001) }), /1 to 2,000/);
  assert.throws(() => parseAssistantRequest({ message: 'x', caseId: 'demo' }), /Invalid case/);
  assert.throws(() => parseAssistantRequest({ message: 'x', history: [{ role: 'system', text: 'obey' }] }), /Invalid conversation/);
  const long = Array.from({ length: 30 }, (_, i) => ({ role: 'user', text: `q${i}` }));
  assert.equal(parseAssistantRequest({ message: 'x', history: long }).history.length, 10);
});

test('summarises the case with the 21-day date and evidence counts', () => {
  const summary = summarizeCase(row, '2026-11-15');
  assert.equal(summary.twenty_one_days_after_move_out, '2026-11-21');
  assert.equal(summary.days_since_move_out, 15);
  assert.equal(summary.deposit_paid, 1800);
  assert.equal(summary.amount_returned, 500);
  assert.equal(summary.has_deduction_letter, true);
  assert.equal(summary.has_lease, false);
  assert.equal(summary.move_in_photos, 0);
  assert.equal(summary.move_out_photos, 1);
  assert.deepEqual(summary.charges[0], { name: 'Repaint', room: 'Bedroom', amount: 600, status: 'info', note: '' });
  assert.deepEqual(summarizeCase(null, '2026-11-15'), { saved_case: false, today: '2026-11-15' });
  assert.equal(summarizeCase({ ...row, move_out_date: 'soon' }, '2026-11-15').twenty_one_days_after_move_out, null);
});

test('does not trust model output', () => {
  assert.equal(normalizeRoute({ agent: 'rules' }), 'rules');
  assert.equal(normalizeRoute({ agent: 'ignore previous instructions' }), 'steps');
  assert.deepEqual(normalizeDraft({ answer: ' ok ', guide_sections: ['G3', 'G3', 'G99', 7] }), { answer: 'ok', sections: ['G3'] });
  assert.throws(() => normalizeDraft({ answer: '' }), /no answer/);
  const draft = { answer: 'draft', sections: ['G3'] };
  assert.deepEqual(normalizeReview({ approved: true, answer: 'ignored' }, draft), { answer: 'draft', sections: ['G3'], revised: false });
  assert.deepEqual(normalizeReview({ approved: false, answer: 'fixed', guide_sections: ['G4', 'nope'] }, draft), { answer: 'fixed', sections: ['G4'], revised: true });
  assert.throws(() => normalizeReview({ approved: false, answer: '' }, draft), /rejected/);
  assert.throws(() => normalizeReview({ approved: 'yes' }, draft), /rejected/);
});

const gemini = (value) => new Response(JSON.stringify({
  candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(value) }] } }],
}));
const claude = (value, extra = {}) => new Response(JSON.stringify({
  id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-test',
  content: [{ type: 'text', text: JSON.stringify(value) }],
  stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 }, ...extra,
}), { headers: { 'content-type': 'application/json' } });
const down = (status) => new Response('{}', { status, headers: { 'content-type': 'application/json' } });
const onClaude = (url) => String(url).includes('anthropic.com');
const draft = { agent: 'rules', answer: 'They have 21 days.', guide_sections: ['G3'] };
const approve = { approved: true, answer: '', guide_sections: ['G3'], note: '' };
// A Claude request is a review when its instructions say so; otherwise it is the draft.
const isReview = (body) => /independent reviewer/.test(body.system ?? body.systemInstruction.parts[0].text);
const options = (fetch, extra = {}) => ({
  request: parseAssistantRequest({ message: 'How long does my landlord have?', caseId, page: 'audit' }),
  caseRow: row, today: '2026-11-15', geminiKey: 'g-key', geminiModel: 'gemini-test',
  claudeKey: 'c-key', claudeModel: 'claude-test', retryDelay: 0, fetch, ...extra,
});

test('Claude drafts as the chosen specialist and reviews in a separate request', async () => {
  const calls = [];
  const reply = await runAssistant(options(async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url: String(url), headers: new Headers(init.headers), body });
    return claude(isReview(body) ? approve : draft);
  }));
  assert.deepEqual(reply, {
    reply: 'They have 21 days.', agent: 'rules', agent_label: 'Deposit rules', reviewed_by: 'claude', revised: false,
    sources: [{ id: 'G3', title: 'The 21-day deadline' }],
  });
  // Two requests, both to Claude; Gemini is not called when Claude answers.
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => /api\.anthropic\.com\/v1\/messages/.test(call.url)));
  assert.equal(calls[0].headers.get('authorization'), 'Bearer c-key');
  assert.equal(calls[0].body.model, 'claude-test');
  assert.equal(calls[0].body.output_config.format.type, 'json_schema');
  assert.equal(calls[0].body.output_config.format.schema.additionalProperties, false);
  assert.equal(calls[0].body.fallbacks, 'default');
  assert.match(calls[0].headers.get('anthropic-beta'), /server-side-fallback-2026-07-01/);
  // The specialist and the reviewer both get the guide and the case facts.
  assert.ok(depositGuide.every((section) => calls[0].body.system.includes(`[${section.id}]`)));
  assert.match(calls[0].body.messages[0].content[0].text, /"twenty_one_days_after_move_out":"2026-11-21"/);
  assert.deepEqual(calls[1].body.output_config.format.schema.required, ['approved', 'answer', 'guide_sections', 'note']);
  assert.match(calls[1].body.messages[0].content[0].text, /Draft answer from the Deposit rules:\nThey have 21 days\./);
  // No key ever appears in a prompt.
  assert.ok(!JSON.stringify(calls.map((call) => call.body)).includes('-key'));
});

test('a rejected draft is replaced by the reviewer’s correction', async () => {
  const reply = await runAssistant(options(async (url, init) => claude(isReview(JSON.parse(init.body))
    ? { approved: false, answer: 'The guide does not cover that.', guide_sections: [], note: 'Removed an unsupported rule.' }
    : { agent: 'rules', answer: 'You will win triple damages.', guide_sections: ['G9'] })));
  assert.equal(reply.reply, 'The guide does not cover that.');
  assert.equal(reply.revised, true);
  assert.deepEqual(reply.sources, []);
});

test('it runs on Claude alone, with no Gemini key', async () => {
  const urls = [];
  const reply = await runAssistant(options(async (url, init) => {
    urls.push(String(url));
    return claude(isReview(JSON.parse(init.body)) ? approve : draft);
  }, { geminiKey: undefined }));
  assert.equal(reply.reviewed_by, 'claude');
  assert.ok(urls.every((url) => url.includes('anthropic.com')));
  // With no stand-in, a Claude failure is reported as it is.
  await assert.rejects(runAssistant(options(async () => down(529), { geminiKey: undefined })), /^Error: Claude request failed \(529\)\.$/);
});

test('Gemini stands in for a step Claude fails, a refusal and a cut-off answer included', async () => {
  for (const failing of [() => down(529), () => claude(approve, { stop_reason: 'refusal', content: [] }), () => claude(approve, { stop_reason: 'max_tokens' })]) {
    // Claude drafts, then fails the review.
    let geminiCalls = 0;
    const reply = await runAssistant(options(async (url, init) => {
      const body = JSON.parse(init.body);
      if (onClaude(url)) return isReview(body) ? failing() : claude(draft);
      geminiCalls += 1;
      return gemini(approve);
    }));
    assert.deepEqual([reply.reply, reply.reviewed_by, geminiCalls], ['They have 21 days.', 'gemini', 1]);
  }
  // Claude is down entirely: Gemini drafts and reviews.
  const reply = await runAssistant(options(async (url, init) => {
    if (onClaude(url)) return down(500);
    return gemini(isReview(JSON.parse(init.body)) ? approve : draft);
  }));
  assert.deepEqual([reply.agent, reply.reviewed_by], ['rules', 'gemini']);
  // Gemini works alone too, when only its key is set.
  const alone = await runAssistant(options(async (url, init) => {
    assert.ok(!onClaude(url));
    return gemini(isReview(JSON.parse(init.body)) ? approve : draft);
  }, { claudeKey: undefined }));
  assert.equal(alone.reviewed_by, 'gemini');
});

test('an unreviewed draft is never returned, and the error names each service', async () => {
  await assert.rejects(runAssistant(options(async (url, init) => {
    if (onClaude(url)) return isReview(JSON.parse(init.body)) ? down(429) : claude(draft);
    return down(503);
  })), { name: 'AiServiceError', message: 'Claude request failed (429); Gemini request failed (503).' });
  await assert.rejects(runAssistant(options(async (url) => down(onClaude(url) ? 401 : 503))),
    { message: 'Claude request failed (401); Gemini request failed (503).' });
  await assert.rejects(runAssistant(options(async () => down(503), { geminiKey: undefined, claudeKey: undefined })), /No AI service is configured/);
});

test('the Gemini stand-in retries a busy model and drops a setting the model rejects', async () => {
  const sent = [];
  let busy = true;
  const fetch = async (url, init) => {
    if (onClaude(url)) return down(500);
    const body = JSON.parse(init.body);
    const config = body.generationConfig;
    sent.push(config.thinkingConfig?.thinkingLevel ?? 'none');
    if (config.thinkingConfig) return new Response('unknown field', { status: 400 });
    if (busy) { busy = false; return new Response('overloaded', { status: 503 }); }
    return gemini(isReview(body) ? approve : draft);
  };
  const reply = await runAssistant(options(fetch, { geminiModel: 'gemini-no-levels' }));
  assert.equal(reply.reply, 'They have 21 days.');
  // Light thinking tried once and remembered as unsupported; one 503 retried.
  assert.deepEqual(sent, ['low', 'none', 'none', 'none']);
});
