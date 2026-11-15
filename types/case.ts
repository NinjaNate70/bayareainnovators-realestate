export type Verdict = "fair" | "disputable" | "not-allowed" | "info";
export type CaseTab = "audit" | "photos" | "letter" | "replies";
export interface Evidence {
  libraryFileId?: string;
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
// What the AI saw when comparing one move-in and one move-out photo for a
// charge. It describes visible changes only: never who caused them, whether a
// charge is allowed, or a cost. Boxes are approximate, on a 0-1000 scale of the
// move-out photo: [x_min, y_min, x_max, y_max].
export interface PhotoComparison {
  before: string;
  after: string;
  checkedAt: string;
  by: "claude" | "gemini";
  sameView: boolean;
  finding: "no_change" | "ordinary_wear" | "new_damage" | "already_there" | "unclear";
  chargeLink: "shows_damage" | "shows_no_damage" | "not_shown" | "unclear";
  summary: string;
  differences: {
    what: string;
    where: string;
    before: string;
    after: string;
    kind: "damage" | "wear" | "cleanliness" | "already_there" | "moved_or_missing" | "angle_or_lighting";
    box: [number, number, number, number] | null;
  }[];
  retake: string;
}
export interface RentalCase {
  photoPairs?: Record<string, { before: string; after: string; analysis?: PhotoComparison }>;
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
  // The renter's own account of anything the documents don't show: roommates,
  // agreements with the landlord, special circumstances. Up to 4,000 characters.
  notes?: string;
}
