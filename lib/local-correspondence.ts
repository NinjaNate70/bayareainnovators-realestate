import type { Charge, RentalCase } from '../types/case';
import { estimateRecovery } from './estimate.ts';

const dollars = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const dateFormat = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' });
const validAmount = (value: number) => Number.isFinite(value) && value >= 0;
const location = (data: RentalCase) => data.address.trim() ? ` for ${data.address.trim()}` : '';
const words = (value: string) => ` ${value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;

function dated(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value))) return '';
  return new Date(value).toISOString().slice(0, 10) === value ? dateFormat.format(new Date(value)) : '';
}

function wrap(data: RentalCase, paragraphs: string[]) {
  return [
    `Dear ${data.landlord.trim() || 'Property Manager'},`,
    ...paragraphs.filter(Boolean),
    `Thank you,\n${data.renter.trim() || '[Your name]'}`,
    ...(data.demo ? ['DEMO DRAFT: Review all example findings before use.'] : []),
  ].join('\n\n');
}

function recordedCharges(data: RentalCase) {
  return data.charges.filter((charge) => charge.name.trim() && (data.stale || !data.audited || charge.verdict !== 'fair'));
}

function chargeLine(charge: Charge) {
  return `${charge.name.trim()}${validAmount(charge.amount) ? ` (${dollars.format(charge.amount)})` : ''}`;
}

export function draftLocalLetter(data: RentalCase) {
  const estimate = estimateRecovery(data);
  const charges = recordedCharges(data);
  const moveOut = dated(data.moveOut);
  const replyBy = dated(data.replyBy);
  const balance = validAmount(data.deposit) && validAmount(data.returned) && data.deposit > data.returned
    ? ` My records show a deposit of ${dollars.format(data.deposit)} and ${dollars.format(data.returned)} returned, leaving ${dollars.format(data.deposit - data.returned)} withheld.`
    : '';
  const details = estimate
    ? `I dispute the following deductions based on my review of the records:\n\n${estimate.included.map((charge) => `• ${chargeLine(charge)}: ${charge.reason}`).join('\n')}`
    : charges.length
      ? `Please explain the basis for these deductions and provide the itemization or records supporting the work and the amount charged:\n\n${charges.map((charge) => `• ${chargeLine(charge)}`).join('\n')}`
      : 'Please send the itemized statement for any amount still withheld, with the records showing what was charged and why.';

  return `Subject: ${estimate ? 'Request to correct security deposit deductions' : 'Request for security deposit itemization'}\n\n${wrap(data, [
    `I’m writing about the security deposit${location(data)}${moveOut ? ` after my move-out on ${moveOut}` : ''}.${balance}`,
    details,
    estimate
      ? 'Please send a revised itemized statement and return any amount you can’t substantiate. For each deduction you maintain, please identify the records showing why the work was needed and how the cost was calculated.'
      : 'Please confirm the remaining balance and when any refund will be sent.',
    replyBy ? `Please respond by ${replyBy}.` : '',
  ])}`;
}

function supportingRecords(data: RentalCase, charge: Charge) {
  const kinds = new Set(data.evidence.filter(({ id }) => charge.sources.includes(id)).map(({ kind }) => kind));
  return [
    kinds.has('before') && kinds.has('after') ? 'the move-in and move-out photos' : kinds.has('before') ? 'the move-in photos' : kinds.has('after') ? 'the move-out photos' : '',
    kinds.has('letter') ? 'the itemized statement' : '',
    kinds.has('lease') ? 'the lease' : '',
    kinds.has('other') ? 'the other supporting records' : '',
  ].filter(Boolean).join(' and ');
}

const currency = String.raw`\$((?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{2})?)`;
const reduction = new RegExp(
  `^(?:I|We)\\s+(?:have\\s+)?(?:reduced|lowered)\\s+(?:the\\s+)?(.+?)\\s+from\\s+${currency}\\s+to\\s+${currency}[.!]?$`,
  'i',
);

function confirmedReduction(charge: Charge, sentences: string[]) {
  const chargeName = words(charge.name);
  const amounts: number[] = [];
  for (const sentence of sentences) {
    const match = reduction.exec(sentence.trim());
    if (!match) continue;
    const [, label, prior, current] = match;
    if (words(label) !== chargeName && words(label.replace(/\s+(?:charge|deduction)$/i, '')) !== chargeName) continue;
    if (Number(prior.replaceAll(',', '')) !== charge.amount) continue;
    const amount = Number(current.replaceAll(',', ''));
    if (!validAmount(amount) || amount >= charge.amount) continue;
    amounts.push(amount);
  }
  return amounts.length === 1 ? amounts[0] : undefined;
}

export function draftLocalReply(data: RentalCase) {
  const reviewed = estimateRecovery(data)?.included ?? [];
  const charges = recordedCharges(data);
  const message = words(data.incoming);
  const mentioned = charges.filter(({ name }) => words(name).trim() && message.includes(words(name)));
  const relevant = (mentioned.length ? mentioned : reviewed.length ? reviewed : charges).slice(0, 2);
  const sentences = data.incoming.split(/(?<=[.!?])\s+|\r?\n/);
  const items = relevant.map((charge) => ({ charge, amount: confirmedReduction(charge, sentences) }));

  return wrap(data, [
    `Thanks for getting back to me about the security deposit${location(data)}.`,
    ...items.map(({ charge, amount }) => {
      const name = charge.name.trim();
      const records = reviewed.includes(charge) ? supportingRecords(data, charge) : '';
      if (amount === 0) return `Thank you for removing the ${name} deduction.`;
      if (amount !== undefined) {
        const remaining = dollars.format(amount);
        const evidence = records ? ` and how you accounted for ${records}` : '';
        return `Thank you for reducing the ${name} deduction to ${remaining}. Please explain what the remaining ${remaining} covers${evidence}.`;
      }
      return `If you’re still withholding an amount for ${name}, please ${records ? `explain how you accounted for ${records}` : 'explain the basis for the remaining charge'}.`;
    }),
    !items.length
      ? 'If any deductions remain, please clarify the items and amounts that are still outstanding. If the balance has been adjusted, please confirm the updated amount and when any refund will be sent.'
      : items.some(({ amount }) => amount !== 0)
        ? 'If an adjustment is still pending, please confirm the updated balance and when any additional refund will be sent.'
        : '',
  ]);
}
