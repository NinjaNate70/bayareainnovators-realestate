import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fromRow, toRow } from '../lib/db/mapping.ts';
import { summarizeCase } from '../lib/case-assistant.ts';
import { depositGuide } from '../lib/deposit-guide.ts';
import { runCaseAudit } from '../lib/case-audit.ts';

const base = {
  id: 'df2d7dbd-1b1d-4f0e-bf9b-5f4a90f87d01', demo: false, address: '12 Oak St, CA', renter: 'Sam', landlord: 'Lee',
  moveOut: '2026-10-31', received: '', deposit: 1800, returned: 1725, charges: [], evidence: [], completedStep: 1,
  audited: false, stale: false, letter: '', replyBy: '', incoming: '', reply: '',
};

test('the renter’s notes are saved with the case and survive a round trip', () => {
  const row = toRow({ ...base, notes: 'Two roommates; I paid the whole deposit.' });
  assert.equal(row.situation_text, 'Two roommates; I paid the whole deposit.');
  assert.equal(fromRow({ ...row, user_id: 'u', created_at: '', updated_at: '', revision: 1 }).notes, 'Two roommates; I paid the whole deposit.');
  // A case with no notes, and a row saved before the field existed, both read as empty.
  assert.equal(toRow(base).situation_text, '');
  const { situation_text, ...older } = row;
  assert.equal(situation_text, 'Two roommates; I paid the whole deposit.');
  assert.equal(fromRow({ ...older, user_id: 'u', created_at: '', updated_at: '', revision: 1 }).notes, '');
  assert.equal(toRow({ ...base, notes: 'x'.repeat(5000) }).situation_text.length, 4000);
});

test('the assistant sees the notes as the renter’s own account', () => {
  const stored = { address: '', renter_name: '', landlord_name: '', move_out_date: null, letter_received_date: null, deposit_cents: 0, returned_cents: 0, completed_step: 1, audited: false, letter_text: '', reply_by_date: null, incoming_text: '', reply_text: '', charges: [], evidence: [] };
  assert.equal(summarizeCase({ ...stored, situation_text: ' My roommate moved out in June. ' }, '2026-11-15').renter_account, 'My roommate moved out in June.');
  assert.equal(summarizeCase(stored, '2026-11-15').renter_account, '');
});

const claude = (value) => new Response(JSON.stringify({
  id: 'msg', type: 'message', role: 'assistant', model: 'claude-test', content: [{ type: 'text', text: JSON.stringify(value) }],
  stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 },
}), { headers: { 'content-type': 'application/json' } });

test('the audit gets the notes as context, and the renter’s word alone cannot settle a charge', async () => {
  let seen;
  const result = await runCaseAudit({
    guide: [...depositGuide], geminiModel: 'g', claudeKey: 'c-key', claudeModel: 'claude-test',
    input: {
      facts: { today: '2026-11-15', address: '12 Oak St, CA', move_out_date: '2026-10-31', letter_received_date: null, deposit_paid: 1800, amount_returned: 1725, renter_account: 'The landlord agreed by text that the carpet was already stained.' },
      charges: [{ id: 'C1', name: 'Carpet cleaning', room: 'Hall', amount: 75 }], files: [], skipped: [], photoPairs: {}, inspections: [],
    },
    fetch: async (url, init) => {
      seen = JSON.parse(init.body);
      // The model takes the renter's word and cites no file.
      return claude({ charges: [{ charge_id: 'C1', status: 'not-allowed', reason: 'You told us the landlord agreed the stain was already there.', evidence_ids: [], guide_sections: ['G6'], requests: ['The text message where your landlord agreed'] }] });
    },
  });
  assert.match(seen.messages[0].content[0].text, /"renter_account":"The landlord agreed by text that the carpet was already stained\."/);
  assert.match(seen.system, /It is not evidence: never raise or lower a status on the renter's word alone/);
  // Unbacked by any file, the finding stays open, and the request for proof is kept.
  assert.equal(result.charges[0].verdict, 'info');
  assert.deepEqual(result.charges[0].requests, ['The text message where your landlord agreed']);
});
