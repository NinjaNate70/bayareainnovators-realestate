export const correspondenceTable = 'case_messages';
export const messageColumns = 'id, kind, status, subject, body, email, source_ids, review_note, occurred_at, updated_at';
export const maxMessageLength = 20_000;

export type DraftKind = 'letter' | 'reply';
export type MessageStatus = 'received' | 'draft' | 'sent';
export type CaseMessage = {
  id: string;
  kind: DraftKind;
  status: MessageStatus;
  subject: string;
  body: string;
  email: string;
  source_ids: string[];
  review_note: string;
  occurred_at: string;
  updated_at: string;
};

export function parseDraftRequest(value: unknown): { caseId: string; kind: DraftKind; goal: string } {
  if (!value || typeof value !== 'object') throw new Error('Invalid draft request.');
  const { caseId, kind, goal, consent } = value as Record<string, unknown>;
  if (typeof caseId !== 'string' || !/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(caseId)) throw new Error('Invalid case.');
  if (kind !== 'letter' && kind !== 'reply') throw new Error('Select a letter or reply.');
  if (consent !== true) throw new Error('Confirm that the case, selected evidence, and email history can be sent for drafting.');
  if (goal !== undefined && (typeof goal !== 'string' || goal.length > 600)) throw new Error('Keep the reply goal within 600 characters.');
  return { caseId, kind, goal: typeof goal === 'string' ? goal.trim() : '' };
}

export function threadForDraft(messages: Pick<CaseMessage, 'status' | 'subject' | 'body'>[]) {
  const confirmed = messages.filter(({ status }) => status === 'sent' || status === 'received');
  const window = confirmed.slice(0, 16);
  const lastReceived = confirmed.find(({ status }) => status === 'received');
  if (lastReceived && !window.includes(lastReceived)) window.splice(15, 1, lastReceived);
  return window.map((message, index) => {
    const { status, subject, body } = message;
    const limit = index === 0 || message === lastReceived ? 8000 : 2400;
    return {
      speaker: status === 'sent' ? 'renter (marked sent)' : 'landlord (pasted by renter)',
      subject: subject.slice(0, 200),
      body: body.length > limit ? `${body.slice(0, limit)}\n[Message truncated]` : body,
    };
  }).reverse();
}

type Json = Record<string, unknown>;
type Draft = { subject: string; body: string; source_ids: string[] };

export function normalizeEmailDraft(value: Json, allowedIds: string[]): Draft {
  const { subject, body, source_ids } = value;
  if (typeof subject !== 'string' || !subject.trim() || subject.length > 200 || /[\r\n]/.test(subject) ||
      typeof body !== 'string' || !body.trim() || body.length > maxMessageLength) throw new Error('The draft is incomplete. Try again.');
  const sources = Array.isArray(source_ids) ? source_ids.filter((id): id is string => typeof id === 'string' && allowedIds.includes(id)) : [];
  return { subject: subject.trim(), body: body.trim(), source_ids: [...new Set(sources)].slice(0, 32) };
}

export function normalizeCorrespondenceReview(value: Json, draft: Draft, allowedIds: string[]) {
  if (typeof value.approved !== 'boolean') throw new Error('The draft review did not finish. Try again.');
  return {
    ...(value.approved ? draft : normalizeEmailDraft(value, allowedIds)),
    review_note: typeof value.review_note === 'string' ? value.review_note.trim().slice(0, 300) : '',
  };
}

export function buildMailto(email: string, subject: string, body: string) {
  const recipient = email.trim();
  if (recipient.length > 254 || !/^[a-z0-9.!#$%&'*+\/=_`{|}~^-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(recipient) ||
      !subject.trim() || /[\r\n]/.test(subject) || !body.trim()) return null;
  try {
    const to = recipient.split('@').map(encodeURIComponent).join('@');
    return `mailto:${to}?subject=${encodeURIComponent(subject.trim())}&body=${encodeURIComponent(body)}`;
  } catch {
    return null;
  }
}
