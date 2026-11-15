import type { Evidence, PhotoComparison, RentalCase } from "@/types/case";
import { mergeCaseLibraryEvidence } from "@/lib/document-library";
import { getBackend } from "@/lib/backend";
import { fromRow, toRow } from "@/lib/db/mapping";
import {
  bufferedCase,
  markSaved,
  rememberCase,
  restorePosition,
  draftIdentity,
} from "@/lib/auth/drafts";
import type { Result } from "@/types/backend";
export const money = (n: number) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
export function freshCase(): RentalCase {
  return {
    id: crypto.randomUUID(),
    demo: false,
    address: "",
    renter: "",
    landlord: "",
    moveOut: "",
    received: "",
    deposit: 0,
    returned: 0,
    charges: [],
    evidence: [],
    completedStep: 0,
    audited: false,
    stale: false,
    letter: "",
    replyBy: "",
    incoming: "",
    reply: "",
    notes: "",
  };
}
export function unwrap<T>(response: Result<T>): T {
  if (response.error)
    throw Object.assign(new Error(response.error.message), {
      code: response.error.code,
    });
  return response.data as T;
}
const queues = new Map<string, Promise<unknown>>();
const libraryRemovals = new Map<string, Set<string>>();

export function removeLibraryAttachment(caseId: string, id: string) {
  const removed = libraryRemovals.get(caseId) ?? new Set<string>();
  removed.add(id);
  libraryRemovals.set(caseId, removed);
}
export async function readCase(id: string): Promise<RentalCase | null> {
  const backend = getBackend(),
    row = unwrap(await backend.data.getCase(id));
  if (!row) return null;
  const checkpoint =
    bufferedCase(row.id, row.user_id) ??
    unwrap(await backend.data.getDraft(row.id));
  if (checkpoint && "charges" in checkpoint.payload) {
    await saveCase(checkpoint.payload);
    restorePosition(checkpoint);
    return structuredClone(checkpoint.payload);
  }
  const value = fromRow(row);
  rememberCase(value);
  markSaved(row.id, row.user_id);
  return value;
}
export function saveCase(
  value: RentalCase,
  copy?: { evidence: Evidence; revision: number },
): Promise<void> {
  rememberCase(value);
  const owner = draftIdentity()?.user.id;
  const snapshot = structuredClone(value);
  const previous = queues.get(value.id) ?? Promise.resolve();
  const next = previous
    .catch(() => {})
    .then(async () => {
      const session = unwrap(await getBackend().auth.getSession()).session;
      if (!session || session.user.id !== owner)
        throw new Error("Sign in to keep going. Your draft is still here.");
      const backend = getBackend();
      const old = unwrap(await backend.data.getCase(snapshot.id));
      if (copy && old?.revision !== copy.revision)
        throw Object.assign(new Error("The case changed while the file was being added."), { code: "conflict" });
      const removed = new Set(libraryRemovals.get(snapshot.id));
      const persisted = old ? fromRow(old).evidence : snapshot.evidence;
      // Library attachments may have changed in another tab since this view loaded.
      const merged = mergeCaseLibraryEvidence(
        snapshot.evidence,
        copy ? [...persisted, copy.evidence] : persisted,
        removed,
      );
      const input = toRow({
        ...snapshot,
        evidence: merged.evidence,
        stale: snapshot.stale || merged.addedSinceSnapshot,
      }, old ?? undefined);
      const row = old
        ? unwrap(
            await backend.data.updateCase(snapshot.id, input, old.revision),
          )
        : unwrap(await backend.data.createCase(input));
      const pendingRemovals = libraryRemovals.get(snapshot.id);
      for (const id of removed) pendingRemovals?.delete(id);
      if (!pendingRemovals?.size) libraryRemovals.delete(snapshot.id);
      const buffer = bufferedCase(snapshot.id, row.user_id);
      if (
        buffer &&
        JSON.stringify(buffer.payload) === JSON.stringify(snapshot)
      ) {
        markSaved(snapshot.id, row.user_id);
        unwrap(await backend.data.clearDraft(snapshot.id));
      }
    });
  queues.set(value.id, next);
  void next
    .finally(() => {
      if (queues.get(value.id) === next) queues.delete(value.id);
    })
    .catch(() => {});
  return next;
}
export async function flushCases() {
  await Promise.all([...queues.values()]);
}
export async function storeFile(
  caseId: string,
  sourceId: string,
  file: File,
  kind: Evidence["kind"],
  librarySource?: { id: string; owner: string },
): Promise<Evidence> {
  const owner = draftIdentity()?.user.id;
  if (!owner || (librarySource && librarySource.owner !== owner))
    throw new Error("Sign in to keep going.");
  const previous = librarySource && [...pendingUploads.values()].find(
    (item) => item.owner === owner && item.caseId === caseId &&
      item.kind === kind && item.libraryFileId === librarySource.id,
  );
  const bucket = kind === "before" || kind === "after" ? "photos" : "documents";
  const filename =
    file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "original";
  const upload: PendingUpload = previous || {
    owner,
    caseId,
    sourceId,
    file,
    kind,
    bucket,
    path: `${owner}/${caseId}/${crypto.randomUUID()}-${filename}`,
    libraryFileId: librarySource?.id,
  };
  pendingUploads.set(upload.path, upload);
  try {
    return await finishUpload(upload);
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      ["file_type", "file_size"].includes(String(error.code))
    )
      pendingUploads.delete(upload.path);
    throw error;
  }
}
type PendingUpload = {
  owner: string;
  caseId: string;
  sourceId: string;
  file: File;
  kind: Evidence["kind"];
  bucket: "documents" | "photos";
  path: string;
  libraryFileId?: string;
};
const pendingUploads = new Map<string, PendingUpload>();
const uploadQueues = new Map<string, Promise<Evidence>>();
export function forgetUploads(owner: string) {
  for (const [key, value] of pendingUploads)
    if (value.owner === owner) pendingUploads.delete(key);
}
export async function recoverUploads(owner: string) {
  for (const upload of pendingUploads.values())
    if (upload.owner === owner) await finishUpload(upload);
}
function finishUpload(upload: PendingUpload): Promise<Evidence> {
  // Upload fields on the same case can be active at the same time.
  const { caseId } = upload;
  const previous = uploadQueues.get(caseId) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(() => persistUpload(upload));
  uploadQueues.set(caseId, next);
  void next.finally(() => {
    if (uploadQueues.get(caseId) === next) uploadQueues.delete(caseId);
  }).catch(() => {});
  return next;
}
async function persistUpload(upload: PendingUpload): Promise<Evidence> {
  const backend = getBackend(),
    session = unwrap(await backend.auth.getSession()).session;
  if (!session || session.user.id !== upload.owner)
    throw new Error(
      "Sign in to keep going. Keep this tab open to retain the selected file.",
    );
  const { bucket, path, file, caseId, sourceId, kind, libraryFileId } = upload;
  const readRow = async () => {
    const row = unwrap(await backend.data.getCase(caseId));
    if (!row)
      throw new Error("This case is unavailable. Your selected file is retained in this tab.");
    return row;
  };
  const findCopy = (value: RentalCase) => libraryFileId && value.evidence.find(
    (e) => e.kind === kind && e.libraryFileId === libraryFileId,
  );
  const checkCapacity = (value: RentalCase) => {
    if (value.evidence.length >= 200 && !value.evidence.some((e) => e.id === sourceId))
      throw new Error("This case already has 200 files. Remove a case attachment to make room.");
  };
  if (libraryFileId) {
    await flushCases();
    const current = fromRow(await readRow());
    const existing = findCopy(current);
    if (existing) {
      pendingUploads.delete(path);
      return existing;
    }
    checkCapacity(current);
  }
  // The file bytes are the slow part, so send them while any case saves still
  // queued from autosave finish, instead of waiting for those first. The case
  // row already exists by now, which is all the upload needs.
  const [, stored] = await Promise.all([
    flushCases(),
    backend.storage.from(bucket).upload(path, file, { upsert: true }),
  ]);
  const metadata = unwrap(stored);
  const evidence: Evidence = {
    id: sourceId,
    fileId: metadata.id,
    path,
    bucket,
    kind,
    name: file.name,
    type: file.type,
    size: file.size,
    ...(libraryFileId ? { libraryFileId } : {}),
  };
  for (let attempt = 0; ; attempt++) {
    const row = await readRow();
    const persisted = fromRow(row);
    const existing = findCopy(persisted);
    if (existing) {
      if (existing.path !== path) await backend.storage.from(bucket).remove([path]);
      pendingUploads.delete(path);
      return existing;
    }
    checkCapacity(persisted);
    const buffered = bufferedCase(caseId, upload.owner);
    const value = buffered && "charges" in buffered.payload
      ? structuredClone(buffered.payload)
      : persisted;
    checkCapacity(value);
    value.evidence = [...value.evidence.filter((e) => e.id !== sourceId), evidence];
    value.stale = true;
    value.demo = false;
    try {
      await saveCase(value, libraryFileId ? { evidence, revision: row.revision } : undefined);
      pendingUploads.delete(path);
      return evidence;
    } catch (error) {
      if (!libraryFileId || attempt >= 2 || !(error instanceof Error) ||
          !("code" in error) || error.code !== "conflict") throw error;
    }
  }
}
export async function getFile(
  caseId: string,
  evidence: Evidence,
): Promise<string> {
  if (!evidence.path || !evidence.bucket)
    throw new Error(
      "Original unavailable in this browser. Please add the file again.",
    );
  const backend = getBackend();
  unwrap(await backend.data.getCase(caseId));
  return unwrap(
    await backend.storage
      .from(evidence.bucket)
      .createSignedUrl(evidence.path, 300),
  ).signedUrl;
}

// Runs the automated audit on a saved case and returns the case with each
// charge's finding applied. The renter's letter, lease and photos are read on
// the server under their own session.
export async function auditCase(value: RentalCase): Promise<RentalCase> {
  await saveCase(value);
  const session = unwrap(await getBackend().auth.getSession()).session;
  if (!session) throw new Error("Sign in to keep going. Your draft is still here.");
  const response = await fetch("/api/cases/audit", {
    method: "POST",
    // The server answers within a minute; past that, stop waiting.
    signal: AbortSignal.timeout(75_000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ caseId: value.id, consent: true }),
  }).catch((cause) => {
    throw Object.assign(
      new Error(
        cause instanceof Error && cause.name === "TimeoutError"
          ? "The audit took too long. Your case is saved. Try again."
          : "We couldn’t reach the audit service. Check your connection and try again.",
      ),
      { code: "audit_failed" },
    );
  });
  const result = (await response.json().catch(() => ({}))) as {
    charges?: (Pick<
      RentalCase["charges"][number],
      "id" | "verdict" | "reason" | "sources" | "low" | "high"
    > & { requests: string[] })[];
    error?: string;
    code?: string;
  };
  if (!response.ok || !result.charges)
    throw Object.assign(
      new Error(result.error ?? "The audit couldn’t finish. Try again."),
      { code: result.code ?? "audit_failed" },
    );
  const findings = new Map(result.charges.map((c) => [c.id, c]));
  return {
    ...value,
    audited: true,
    stale: false,
    charges: value.charges.map((c) => ({ ...c, ...findings.get(c.id) })),
  };
}

export type LetterReading = {
  read_by: "claude" | "gemini";
  readable: boolean;
  charges: { name: string; room: string; amount: number }[];
  address: string;
  landlord: string;
  renter: string;
  move_out_date: string;
  letter_date: string;
  deposit: number | null;
  returned: number | null;
  notes: string;
};
// Has the server read the uploaded deduction letter and return what it says,
// for the renter to confirm. Throws with a message fit to show the renter.
export async function readLetter(value: RentalCase): Promise<LetterReading> {
  await saveCase(value);
  const session = unwrap(await getBackend().auth.getSession()).session;
  if (!session) throw new Error("Sign in to keep going. Your draft is still here.");
  const response = await fetch("/api/cases/extract", {
    method: "POST",
    signal: AbortSignal.timeout(75_000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ caseId: value.id, consent: true }),
  }).catch((cause) => {
    throw new Error(
      cause instanceof Error && cause.name === "TimeoutError"
        ? "Reading your letter took too long. Enter the charges by hand, or try again."
        : "We couldn’t reach the letter reader. Check your connection and try again.",
    );
  });
  const result = (await response.json().catch(() => ({}))) as Partial<LetterReading> & {
    error?: string;
  };
  if (!response.ok || !Array.isArray(result.charges))
    throw new Error(
      result.error ?? "We couldn’t read your letter. Enter the charges by hand.",
    );
  return result as LetterReading;
}

// Has the server compare the move-in and move-out photo chosen for one charge
// and describe what visibly changed. Throws with a message fit to show the renter.
export async function comparePhotos(
  value: RentalCase,
  chargeId: string,
  beforeId: string,
  afterId: string,
): Promise<PhotoComparison> {
  await saveCase(value);
  const session = unwrap(await getBackend().auth.getSession()).session;
  if (!session) throw new Error("Sign in to keep going. Your case is saved.");
  const response = await fetch("/api/cases/compare-photos", {
    method: "POST",
    signal: AbortSignal.timeout(75_000),
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ caseId: value.id, chargeId, beforeId, afterId, consent: true }),
  }).catch((cause) => {
    throw new Error(
      cause instanceof Error && cause.name === "TimeoutError"
        ? "The comparison took too long. Try again."
        : "We couldn’t reach the photo analysis service. Check your connection and try again.",
    );
  });
  const result = (await response.json().catch(() => ({}))) as {
    comparison?: PhotoComparison;
    error?: string;
  };
  if (!response.ok || !result.comparison)
    throw new Error(result.error ?? "The photo comparison couldn’t finish. Try again.");
  return result.comparison;
}
