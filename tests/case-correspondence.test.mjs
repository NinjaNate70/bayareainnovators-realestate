import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildMailto, normalizeCorrespondenceReview, parseDraftRequest, threadForDraft } from '../lib/case-correspondence.ts';
import { draftCaseCorrespondence } from '../lib/case-correspondence-ai.ts';

const id = 'c8bfca48-fb8b-447f-8083-5b278c127d81';

test('draft generation requires a valid case and consent to analysis', () => {
  assert.deepEqual(parseDraftRequest({ caseId: id, kind: 'reply', goal: '  Ask about the paint invoice  ', consent: true }), {
    caseId: id, kind: 'reply', goal: 'Ask about the paint invoice',
  });
  assert.throws(() => parseDraftRequest({ caseId: id, kind: 'reply', consent: false }), /confirm/i);
  assert.throws(() => parseDraftRequest({ caseId: 'not-a-case', kind: 'letter', consent: true }), /case/i);
});

test('AI history keeps sent and received messages in chronological order and excludes drafts', () => {
  const row = (status, body) => ({ status, body, subject: 'Deposit' });
  const result = threadForDraft([
    row('received', 'Here is the invoice.'), row('draft', 'I accept the charge.'),
    row('sent', 'Please explain the repainting.'),
  ]);
  assert.deepEqual(result.map(({ body }) => body), ['Please explain the repainting.', 'Here is the invoice.']);
});

test('retains the latest received email even when newer sent messages fill the history window', () => {
  const sent = Array.from({ length: 20 }, (_, index) => ({ status: 'sent', subject: '', body: `Follow-up ${index}` }));
  const latestReceived = { status: 'received', subject: '', body: 'The repairs are complete. '.padEnd(3500, '.') };
  const result = threadForDraft([...sent, latestReceived]);
  assert.equal(result.length, 16);
  assert.equal(result[0].body, latestReceived.body);
  assert.equal(result.at(-1).body, 'Follow-up 0');
});

test('both writing passes see the case, actual evidence, and earlier replies before saving the correction', async () => {
  const correction = {
    subject: 'Re: Repaint estimate',
    body: 'Thanks for lowering the paint charge to $85. Could you send the reason for the $45 labor charge?',
    source_ids: ['D01'],
  };
  const requests = [];
  const result = await draftCaseCorrespondence({
    kind: 'reply', geminiKey: 'test', geminiModel: 'test', claudeModel: 'test',
    deadline: Date.now() + 30_000, groundedIds: [],
    context: { case_facts: { deposit_cents: 100000 }, thread: [{ body: 'I lowered the paint charge to $85.' }] },
    files: [{ id: 'D01', name: 'Estimate.pdf', kind: 'letter', mime: 'application/pdf', data: 'cGRm' }],
    fetch: async (_url, init) => {
      const request = JSON.parse(init.body);
      requests.push(request);
      const parts = request.contents[0].parts;
      assert.match(parts[0].text, /I lowered the paint charge to \$85/);
      assert.match(parts[0].text, /"deposit_cents":100000/);
      assert.deepEqual(parts[2].inline_data, { mime_type: 'application/pdf', data: 'cGRm' });
      const answer = requests.length === 1
        ? { subject: 'Re: Repaint estimate', body: 'Please reconsider the paint charge.', source_ids: [] }
        : { ...correction, approved: false, review_note: 'The landlord already lowered the paint charge.' };
      return Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(answer) }] } }] });
    },
  });
  assert.equal(requests.length, 2);
  assert.match(requests[1].contents[0].parts[0].text, /Please reconsider the paint charge/);
  assert.deepEqual(result, { ...correction, review_note: 'The landlord already lowered the paint charge.' });
});

test('uses the reviewer correction and drops source IDs outside the case', () => {
  const draft = { subject: 'Checking in', body: 'Please send the receipt.', source_ids: ['D01'] };
  const result = normalizeCorrespondenceReview({
    approved: false, subject: 'Re: Bedroom invoice', body: 'Thanks for the invoice. Could you clarify the labor charge?',
    source_ids: ['D02', 'invented', 'D02'], review_note: 'The invoice has already been supplied.',
  }, draft, ['D01', 'D02']);
  assert.deepEqual(result, { subject: 'Re: Bedroom invoice', body: 'Thanks for the invoice. Could you clarify the labor charge?', source_ids: ['D02'], review_note: 'The invoice has already been supplied.' });
  assert.throws(() => normalizeCorrespondenceReview({ approved: false, body: '' }, draft, ['D01']), /draft/i);
});

test('encodes a reviewed message for the email client and rejects recipient or subject header injection', () => {
  const mailto = buildMailto('manager+one@example.com', 'Re: Paint & labor', 'First line\nSecond line');
  assert.equal(mailto, 'mailto:manager%2Bone@example.com?subject=Re%3A%20Paint%20%26%20labor&body=First%20line%0ASecond%20line');
  assert.equal(buildMailto('manager@example.com?bcc=other@example.com', 'Subject', 'Body'), null);
  assert.equal(buildMailto('manager@example.com', 'Hi\r\nBcc: other@example.com', 'Body'), null);
});
