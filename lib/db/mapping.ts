import type { RentalCase } from "../../types/case";
import type { CaseRow } from "../../types/backend";
import type { CaseInput } from "./client";
const cents = (n: number) => Math.round(n * 100);
export function toRow(value: RentalCase, previous?: CaseRow): CaseInput {
  return {
    id: value.id,
    is_demo: value.demo,
    address: value.address,
    renter_name: value.renter,
    landlord_name: value.landlord,
    move_out_date: value.moveOut,
    letter_received_date: value.received,
    deposit_cents: cents(value.deposit),
    returned_cents: cents(value.returned),
    completed_step: value.completedStep,
    audited: value.audited,
    needs_review: value.stale,
    letter_text: value.letter,
    reply_by_date: value.replyBy,
    incoming_text: value.incoming,
    reply_text: value.reply,
    charges: value.charges.map(({ id, amount, low, high, sources, ...c }) => ({
      ...c,
      id:
        previous?.charges.find((x) => x.source_id === id)?.id ??
        crypto.randomUUID(),
      source_id: id,
      amount_cents: cents(amount),
      low_cents: cents(low),
      high_cents: cents(high),
      source_ids: sources,
    })),
    evidence: value.evidence.map(({ id, url, ...e }) => {
      void url;
      return {
        ...e,
        id:
          e.fileId ??
          previous?.evidence.find((x) => x.source_id === id)?.id ??
          crypto.randomUUID(),
        source_id: id,
      };
    }),
    photo_pairs: value.photoPairs,
  };
}
export function fromRow(row: CaseRow): RentalCase {
  return {
    id: row.id,
    demo: row.is_demo,
    address: row.address,
    renter: row.renter_name,
    landlord: row.landlord_name,
    moveOut: row.move_out_date,
    received: row.letter_received_date,
    deposit: row.deposit_cents / 100,
    returned: row.returned_cents / 100,
    completedStep: row.completed_step,
    audited: row.audited,
    stale: row.needs_review,
    letter: row.letter_text,
    replyBy: row.reply_by_date,
    incoming: row.incoming_text,
    reply: row.reply_text,
    charges: row.charges.map(
      ({
        id,
        source_id,
        amount_cents,
        low_cents,
        high_cents,
        source_ids,
        ...c
      }) => {
        void id;
        return {
          ...c,
          id: source_id,
          amount: amount_cents / 100,
          low: low_cents / 100,
          high: high_cents / 100,
          sources: source_ids,
        };
      },
    ),
    evidence: row.evidence.map(({ id, source_id, ...e }) => ({
      ...e,
      id: source_id,
      fileId: id,
    })),
    photoPairs: row.photo_pairs,
  };
}
