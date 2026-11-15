import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import sharp from 'sharp';
import { runCaseAudit } from '../lib/case-audit.ts';
import { defaultClaudeModel } from '../lib/claude-json.ts';
import { depositGuide } from '../lib/deposit-guide.ts';

const charges = [
  { id: 'C1', name: 'Replace broken bedroom door', room: 'Bedroom', amount: 285 },
  { id: 'C2', name: 'Flat move-out cleaning fee', room: 'Whole unit', amount: 240 },
  { id: 'C3', name: 'Routine wall repainting', room: 'Living room', amount: 360 },
  { id: 'C4', name: 'Possible mailbox key fee', room: 'Entry', amount: 45 },
];
const expected = ['fair', 'disputable', 'not-allowed', 'info'];

// These fictional records are images so the live document reader has to read
// the evidence, just as it would for a document photographed by a renter.
const documents = [
  {
    id: 'L1', kind: 'letter', name: 'sample-deduction-statement.png',
    title: 'Final security deposit statement',
    lines: [
      'Fictional sample | 100 Example Lane, Sacramento, CA',
      'Move-out: October 31, 2026 | Statement: November 10, 2026',
      'Deposit received: $1,800.00 | Refund enclosed: $915.00',
      '',
      '$285.00 - Replace broken bedroom door. See paid invoice #104.',
      '$240.00 - Flat move-out cleaning fee.',
      'Cleaning is complete. No cleaning receipt, invoice, or work breakdown',
      'was provided. This is a final charge, not an estimate.',
      '$360.00 - Routine repainting of living room walls between tenants.',
      'There was no wall damage. The charge is for normal fading only.',
      '',
      'Total deductions: $885.00',
      'Signed: Avery Chen, property manager',
    ],
  },
  {
    id: 'D1', kind: 'other', name: 'sample-paid-door-invoice.png',
    title: 'Paid invoice #104',
    lines: [
      'Fictional sample | Example Door Repair',
      '100 Example Lane, Sacramento, CA | November 4, 2026',
      'Replaced one interior bedroom door with a split panel.',
      'Like-for-like door and hardware: $160.00',
      'Labor, one hour: $125.00',
      'Total paid by property manager: $285.00',
    ],
  },
  {
    id: 'D2', kind: 'other', name: 'sample-signed-walkthrough.png',
    title: 'Signed move-out walkthrough',
    lines: [
      'Fictional sample | 100 Example Lane, Sacramento, CA',
      'October 31, 2026',
      '',
      'Bedroom door: Undamaged at move-in. The renter confirmed their guest',
      'caused the split panel on October 24. The door would no longer close.',
      'Living room walls: No damage. Only uniform fading from regular use.',
      '',
      'Signed: Jamie Ruiz, renter | Avery Chen, property manager',
    ],
  },
];

const escapeXml = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

async function renderDocument({ title, lines }) {
  const body = lines.map((line, i) => (
    `<text x="58" y="${125 + 37 * i}">${escapeXml(line)}</text>`
  )).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1100" height="${165 + lines.length * 37}">
    <rect width="100%" height="100%" fill="white"/>
    <g fill="#141414" font-family="Arial, sans-serif" font-size="25">
      <text x="58" y="67" font-size="34" font-weight="bold">${escapeXml(title)}</text>
      ${body}
    </g>
  </svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function main() {
  const args = process.argv.slice(2);
  const sampleFolder = args[0] === '--write-samples' && args.length === 2 ? resolve(args[1]) : null;
  if (args.length && !sampleFolder) {
    throw new Error('Usage: node scripts/check-case-audit.mjs [--write-samples folder]');
  }
  const claudeKey = process.env.ANTHROPIC_API_KEY;
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!sampleFolder && !claudeKey && !geminiKey) {
    throw new Error('Set ANTHROPIC_API_KEY or GEMINI_API_KEY in the environment to run the live audit.');
  }

  const files = await Promise.all(documents.map(async ({ id, kind, name, ...document }) => ({
    id, kind, name, mime: 'image/png', data: (await renderDocument(document)).toString('base64'),
  })));

  if (sampleFolder) {
    await mkdir(sampleFolder, { recursive: true });
    await Promise.all(files.map(({ name, data }) =>
      writeFile(resolve(sampleFolder, name), data, { encoding: 'base64', flag: 'wx' })));
    console.log(`Wrote three fictional evidence files to ${sampleFolder}`);
    return;
  }

  const facts = {
    today: '2026-11-15',
    address: '100 Example Lane, Sacramento, CA',
    move_out_date: '2026-10-31',
    letter_received_date: '2026-11-10',
    deposit_paid: 1800,
    amount_returned: 915,
    renter_account: '',
  };
  const options = {
    guide: [...depositGuide],
    claudeKey,
    claudeModel: process.env.ANTHROPIC_MODEL || defaultClaudeModel,
    geminiKey,
    geminiModel: process.env.GEMINI_MODEL || 'gemini-3.8-flash',
  };
  const [supported, noEvidence] = await Promise.all([
    runCaseAudit({
      ...options,
      input: {
        facts,
        charges: charges.slice(0, 3),
        files,
        skipped: [],
        photoPairs: {},
        inspections: [],
      },
    }),
    // A separate case keeps the unverified fee out of the itemized case's
    // balance, where it would look like a documented shortfall.
    runCaseAudit({
      ...options,
      input: {
        facts: {
          ...facts,
          letter_received_date: null,
          amount_returned: 1755,
          renter_account: 'I vaguely remember a mailbox key fee being mentioned, but I have no record of it.',
        },
        charges: charges.slice(3),
        files: [],
        skipped: [],
        photoPairs: {},
        inspections: [],
      },
    }),
  ]);

  const findings = [...supported.charges, ...noEvidence.charges];
  console.log(`Documents read: ${supported.documents_read}/${files.length} (${supported.documents_read_by})`);
  console.table(findings.map(({ id, verdict, sources }, i) => ({
    charge: charges.find((charge) => charge.id === id)?.name ?? id,
    expected: expected[i],
    actual: verdict,
    sources: sources.join(', '),
  })));
  for (const { id, reason, requests } of findings) {
    console.log(`${id}: ${reason}`);
    if (requests.length) console.log(`  Follow-up: ${requests.join(' ')}`);
  }
  assert.equal(supported.documents_read, files.length, 'All sample documents must be analyzed.');
  assert.deepEqual(findings.map(({ id, verdict }) => [id, verdict]),
    charges.map(({ id }, i) => [id, expected[i]]));
  assert.ok(findings[1].sources.includes('G4'), 'The cleaning finding should cite the documentation rule.');
  assert.ok(findings[2].sources.includes('G6'), 'The repainting finding should cite the ordinary wear rule.');
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
