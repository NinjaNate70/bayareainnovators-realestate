import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fromRow, toRow } from '../lib/db/mapping.ts';
import { parseAssistantRequest, runAssistant, summarizeCase } from '../lib/case-assistant.ts';
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

test('a renter with roommates gets an answer for their situation, not a general guide', async () => {
  const account = 'Four roommates and I shared the unit. I paid the whole $2,400 deposit; only two of us are on the lease.';
  const caseRow = {
    address: '12 Oak St, CA', renter_name: 'Sam', landlord_name: 'Lee', move_out_date: '2026-10-31', letter_received_date: '2026-11-12',
    deposit_cents: 240000, returned_cents: 90000, completed_step: 4, audited: true, letter_text: '', reply_by_date: null, incoming_text: '', reply_text: '',
    situation_text: account, charges: [{ name: 'Carpet', room: 'Bedroom 3', amount_cents: 150000, verdict: 'disputable', reason: '' }], evidence: [{ name: 'letter.pdf', kind: 'letter' }],
  };
  const bodies = [];
  const reply = await runAssistant({
    request: parseAssistantRequest({ message: 'What should I do?', caseId: 'df2d7dbd-1b1d-4f0e-bf9b-5f4a90f87d01', page: 'audit' }),
    caseRow, today: '2026-11-15', geminiModel: 'g', claudeKey: 'c-key', claudeModel: 'claude-test',
    fetch: async (url, init) => {
      const body = JSON.parse(init.body);
      bodies.push(body);
      return claude(/independent reviewer/.test(body.system)
        ? { approved: true, answer: '', guide_sections: ['G3'], note: '' }
        : { agent: 'situation', answer: 'You told us you paid the whole deposit for five people.', guide_sections: ['G3'] });
    },
  });
  // The specialist is offered a situation advisor and told when to pick it.
  const [drafting, review] = bodies;
  assert.deepEqual(drafting.output_config.format.schema.properties.agent.enum, ['steps', 'evidence', 'rules', 'letter', 'situation']);
  assert.match(drafting.system, /Choose situation when the question is about the renter's own circumstances/);
  assert.match(drafting.system, /or when renter_account has text and the question is general/);
  // It must answer for the situation, and may not only point to a guide.
  assert.match(drafting.system, /answer for that situation, not in general/);
  assert.match(drafting.system, /Never answer only by pointing to the guide, the app or another service/);
  assert.ok(drafting.messages[0].content[0].text.includes(JSON.stringify(account).slice(1, -1)));
  // The reviewer rejects answers that ignore the account or only refer elsewhere,
  // and still rejects rules that are not in the guide.
  assert.match(review.system, /it ignores what the renter told you in renter_account/);
  assert.match(review.system, /it only points the renter to the guide, the app or another service/);
  assert.match(review.system, /it states a California rule that is not in the numbered guide/);
  assert.ok(review.messages[0].content[0].text.includes(JSON.stringify(account).slice(1, -1)));
  assert.deepEqual([reply.agent, reply.agent_label], ['situation', 'Your situation']);
});

test('the auditor ties the notes to the charges they concern', async () => {
  let system;
  await runCaseAudit({
    guide: [...depositGuide], geminiModel: 'g', claudeKey: 'c-key', claudeModel: 'claude-test',
    input: {
      facts: { today: '2026-11-15', address: '12 Oak St, CA', move_out_date: '2026-10-31', letter_received_date: null, deposit_paid: 2400, amount_returned: 900, renter_account: 'Four roommates. A roommate’s guest broke the closet door.' },
      charges: [{ id: 'C1', name: 'Closet door', room: 'Bedroom 2', amount: 300 }], files: [], skipped: [], photoPairs: {}, inspections: [],
    },
    fetch: async (url, init) => {
      system = JSON.parse(init.body).system;
      return claude({ charges: [] });
    },
  });
  assert.match(system, /When renter_account bears on a charge .* mention that in that charge's reason as "You told us/);
  assert.match(system, /When the renter shares the unit with roommates, a charge concerns the whole tenancy: do not split amounts/);
});
