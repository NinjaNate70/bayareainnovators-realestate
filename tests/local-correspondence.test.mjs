import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoCase } from '../lib/fixtures/demo-case.ts';
import { draftLocalLetter, draftLocalReply } from '../lib/local-correspondence.ts';

test('local letter ties each reviewed dispute to its finding and requests a correction or support', () => {
  const draft = draftLocalLetter({ ...demoCase, replyBy: '2026-11-25' });
  assert.match(draft, /Full bedroom repaint \(\$400\).*small surface marks/);
  assert.match(draft, /Professional cleaning \(\$150\).*flat cleaning fee/);
  assert.match(draft, /revised itemized statement.*return/s);
  assert.match(draft, /respond by November 25, 2026/);
  assert.doesNotMatch(draft, /Missing mailbox key|estimated disputed range|\bP01\b/);
});

test('a stale local review uses recorded charges without making its findings sound current', () => {
  const draft = draftLocalLetter({ ...demoCase, demo: false, stale: true });
  assert.match(draft, /Full bedroom repaint \(\$400\)/);
  assert.match(draft, /basis for/);
  assert.doesNotMatch(draft, /small surface marks|I dispute|have not received an itemized/);
});

test('local reply focuses on a charge the landlord named without repeating their message or assuming the balance', () => {
  const draft = draftLocalReply({ ...demoCase, incoming: 'I lowered the full bedroom repaint deduction; see my updated statement.' });
  assert.match(draft, /if .* still .*Full bedroom repaint/i);
  assert.match(draft, /move-in and move-out photos/);
  assert.doesNotMatch(draft, /I lowered|\$400|Professional cleaning|earlier letter|\bR01\b/);
});

test('when no deductions are listed, a local draft asks what was withheld without claiming the statement never arrived', () => {
  const data = { ...demoCase, demo: false, charges: [], deposit: 800.50, returned: 300.25 };
  assert.match(draftLocalLetter(data), /\$500\.25.*itemized statement/s);
  assert.doesNotMatch(draftLocalLetter(data), /have not received/);
  assert.match(draftLocalReply(data), /If any deductions remain/);
});


test('local reply acknowledges only an explicit, charge-specific reduction', () => {
  const data = { ...demoCase, incoming: 'I reduced the full bedroom repaint deduction from $400 to $150.' };
  const draft = draftLocalReply(data);
  assert.match(draft, /reducing .* to \$150/i);
  assert.match(draft, /remaining \$150.*move-in and move-out photos/i);
  assert.doesNotMatch(draft, /\$400|Professional cleaning/);

  const offered = draftLocalReply({ ...data, incoming: 'I could reduce the full bedroom repaint deduction from $400 to $150.' });
  assert.doesNotMatch(offered, /Thank you for reducing|\$150/);

  const removed = draftLocalReply({ ...data, incoming: 'I reduced the full bedroom repaint deduction from $400 to $0.' });
  assert.match(removed, /Thank you for removing/i);
  assert.doesNotMatch(removed, /still withholding|adjustment is still pending/);
});
