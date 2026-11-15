export type Verdict = "fair" | "disputable" | "not-allowed" | "info";
export type CaseTab = "audit" | "photos" | "letter" | "replies";
export interface Evidence {
  fileId?: string;
  path?: string;
  bucket?: "documents" | "photos";
  id: string;
  name: string;
  // "other" is any further document that supports the case: receipts, a
  // move-in checklist, messages with the landlord, invoices.
  kind: "letter" | "lease" | "other" | "before" | "after";
  type: string;
  size: number;
  url?: string;
}
export interface Charge {
  id: string;
  name: string;
  room: string;
  amount: number;
  verdict: Verdict;
  reason: string;
  sources: string[];
  low: number;
  high: number;
  // Set by the automated audit: what the renter could add or check to settle
  // this charge. Present (possibly empty) only on charges the audit reviewed.
  requests?: string[];
}
export interface RentalCase {
  photoPairs?: Record<string, { before: string; after: string }>;
  id: string;
  demo: boolean;
  address: string;
  renter: string;
  landlord: string;
  moveOut: string;
  received: string;
  deposit: number;
  returned: number;
  charges: Charge[];
  evidence: Evidence[];
  completedStep: number;
  audited: boolean;
  stale: boolean;
  letter: string;
  replyBy: string;
  incoming: string;
  reply: string;
}
