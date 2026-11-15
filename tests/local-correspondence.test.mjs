import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoCase } from '../lib/fixtures/demo-case.ts';
import { draftLocalLetter, draftLocalReply } from '../lib/local-correspondence.ts';

test('regenerating a letter changes its wording and keeps case evidence and the reply date', () => {
  const data = { ...demoCase, replyBy: '2026-11-25' };
  const letter = draftLocalLetter(data);
  const alternate = draftLocalLetter({ ...data, letter });
  assert.notEqual(alternate, letter);
  assert.match(alternate, /Full bedroom repaint \(\$400\).*small surface marks/);
  assert.match(alternate, /November 25, 2026/);
  assert.notEqual(draftLocalLetter({ ...data, letter: alternate }), alternate);
});

test('regenerating a reply keeps a confirmed reduction and changes the wording', () => {
  const data = { ...demoCase, incoming: 'I reduced the full bedroom repaint deduction from $400 to $150.' };
  const reply = draftLocalReply(data);
  const alternate = draftLocalReply({ ...data, reply });
  assert.notEqual(alternate, reply);
  assert.match(alternate, /reducing the Full bedroom repaint deduction to \$150/);
  assert.doesNotMatch(alternate, /\$400|Professional cleaning/);
  assert.notEqual(draftLocalReply({ ...data, reply: alternate }), alternate);
});

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

test('local letter keeps the evidence and signs with the account name when audit findings refer to the guide', () => {
  const statement = { id: 'L01', name: 'Itemized statement.pdf', kind: 'letter' };
  const walkthrough = { id: 'D-C0E5C825', name: 'Signed move-out walkthrough.pdf', kind: 'other' };
  const charges = [
    {
      ...demoCase.charges[1], name: 'Flat move-out cleaning fee', amount: 240,
      reason: 'The itemized statement lists a $240 flat move-out cleaning fee and says no receipt, invoice or work breakdown was provided. Because total deductions are over $125, the guide says the landlord must attach invoices. The guide also limits cleaning to the original condition, and the signed walkthrough (D-C0E5C825) notes nothing about cleaning. No photos were uploaded to show the unit’s condition.',
      sources: ['G4', statement.id, walkthrough.id], requests: [],
    },
    {
      ...demoCase.charges[0], name: 'Routine repainting of walls between tenants', amount: 360, high: 360,
      reason: 'The itemized statement says the charge is for normal fading only. The move-out walkthrough signed by you and the property manager (D-C0E5C825) also records no wall damage. The guide says a landlord can deduct for damage other than normal wear and tear.',
      sources: ['G6', statement.id, walkthrough.id], requests: [],
    },
    {
      ...demoCase.charges[2], reason: 'The guide says this can be disputed.', sources: ['G6', walkthrough.id], requests: [],
    },
  ];
  const data = { ...demoCase, demo: false, charges, evidence: [statement, walkthrough] };
  const draft = draftLocalLetter(data, '  Jamie Ruiz  ');
  assert.match(draft, /Flat move-out cleaning fee \(\$240\).*itemized statement.*no receipt, invoice or work breakdown/);
  assert.match(draft, /Routine repainting of walls between tenants \(\$360\).*walkthrough signed by both parties also records no wall damage/);
  assert.match(draft, /Carpet replacement.*Signed move-out walkthrough/);
  assert.doesNotMatch(draft, /the guide|D-C0E5C825|were uploaded/i);
  assert.match(draft, /Thank you,\nJamie Ruiz$/);
  assert.match(draftLocalLetter(data, ' '), /Thank you,\nAlex Morgan$/);
  assert.match(draftLocalLetter(demoCase, 'Jamie Ruiz'), /Thank you,\nAlex Morgan\n/);
});

test('local reply uses the account name for a real case', () => {
  assert.match(draftLocalReply({ ...demoCase, demo: false }, 'Jamie Ruiz'), /Thank you,\nJamie Ruiz$/);
  assert.match(draftLocalReply({ ...demoCase, demo: false, renter: '' }), /Thank you,\n\[Your name\]$/);
});
