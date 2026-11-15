import type { Checkpoint, Session, User } from "../../types/backend";
import type { RentalCase } from "../../types/case";
import { getBackend, hosted } from "../backend";
import { termsAccepted, termsGatePath } from "./terms";
const buffers = new Map<string, Checkpoint>();
const snapshots = new Map<string, Checkpoint>();
let identity: Session | null = null;
export function setDraftIdentity(session: Session | null) {
  identity = session;
}
export function rememberCase(value: RentalCase) {
  if (!identity) return;
  const key = `${identity.user.id}:${value.id}`,
    existing = buffers.get(key);
  const checkpoint: Checkpoint = {
    id: existing?.id ?? crypto.randomUUID(),
    user_id: identity.user.id,
    draft_key: value.id,
    case_id: value.id,
    payload: structuredClone(value),
    route: location.pathname + location.search + location.hash,
    scroll_y: window.scrollY,
    focus_id: (document.activeElement as HTMLElement | null)?.id ?? "",
    updated_at: new Date().toISOString(),
  };
  buffers.set(key, checkpoint);
  snapshots.set(identity.user.id, checkpoint);
}
export function draftIdentity() {
  return identity;
}
export function forgetOwner(userId: string) {
  snapshots.delete(userId);
  for (const [key, value] of buffers)
    if (value.user_id === userId) buffers.delete(key);
}
export function rememberProfile(changes: { name?: string; email?: string }) {
  if (!identity) return;
  const key = `${identity.user.id}:account-profile`,
    old = buffers.get(key);
  const previous =
    old?.payload && "name" in old.payload
      ? old.payload
      : { name: identity.user.user_metadata.name, email: identity.user.email };
  const checkpoint: Checkpoint = {
    id: old?.id ?? crypto.randomUUID(),
    user_id: identity.user.id,
    draft_key: "account-profile",
    case_id: null,
    payload: { ...previous, ...changes },
    route: "/account",
    scroll_y: window.scrollY,
    focus_id: (document.activeElement as HTMLElement | null)?.id ?? "",
    updated_at: new Date().toISOString(),
  };
  buffers.set(key, checkpoint);
  snapshots.set(identity.user.id, checkpoint);
}
export function bufferedCase(id: string, userId: string) {
  return buffers.get(`${userId}:${id}`);
}
export function markSaved(id: string, userId: string) {
  buffers.delete(`${userId}:${id}`);
}
export async function retainBuffers(session: Session) {
  const drafts = [...buffers.values()].filter(
    (d) => d.user_id === session.user.id,
  );
  const latest = snapshots.get(session.user.id);
  if (latest && !drafts.some((d) => d.draft_key === latest.draft_key))
    drafts.push(latest);
  for (const draft of drafts) {
    const active =
      draft === latest &&
      (draft.case_id
        ? location.pathname.startsWith("/case/")
        : location.pathname === "/account");
    if (active) {
      draft.route = location.pathname + location.search + location.hash;
      draft.scroll_y = window.scrollY;
      draft.focus_id =
        (document.activeElement as HTMLElement | null)?.id ?? draft.focus_id;
    }
    const r = await getBackend().auth.retainDraft(draft, session.access_token);
    if (r.error) throw new Error(r.error.message);
  }
  return drafts;
}
export async function settleProfile(user: User) {
  const key = `${user.id}:account-profile`,
    memory = buffers.get(key),
    stored = await getBackend().data.getDraft("account-profile");
  if (stored.error) throw new Error(stored.error.message);
  const checkpoint = memory ?? stored.data;
  if (
    checkpoint &&
    "name" in checkpoint.payload &&
    checkpoint.payload.name === user.user_metadata.name &&
    checkpoint.payload.email === user.email
  ) {
    buffers.delete(key);
    if (snapshots.get(user.id)?.draft_key === "account-profile")
      snapshots.delete(user.id);
    const r = await getBackend().data.clearDraft("account-profile");
    if (r.error) throw new Error(r.error.message);
  }
}
export async function recoveryDestination(
  session: Session,
  returnTo?: string | null,
) {
  const path = await resumePath(session, returnTo);
  return hosted && !termsAccepted(session.user.user_metadata)
    ? termsGatePath(path)
    : path;
}
async function resumePath(session: Session, returnTo?: string | null) {
  const { safeReturnTo } = await import("./validation");
  await settleProfile(session.user);
  const { recoverUploads } = await import("../cases");
  await recoverUploads(session.user.id);
  const drafts = await getBackend().data.listDrafts();
  if (drafts.error) throw new Error(drafts.error.message);
  const memory = [...buffers.values()].filter(
    (d) => d.user_id === session.user.id,
  );
  const checkpoint = [...(drafts.data ?? []), ...memory].sort((a, b) =>
    b.updated_at.localeCompare(a.updated_at),
  )[0];
  if (checkpoint && safeReturnTo(checkpoint.route)) return checkpoint.route;
  const target = safeReturnTo(returnTo);
  if (target) return target;
  const recent = await getBackend().data.getMostRecentCase();
  if (recent.error) throw new Error(recent.error.message);
  return recent.data ? `/case/${recent.data.id}` : "/case/new";
}
export function restorePosition(checkpoint: Checkpoint) {
  setTimeout(() => {
    const field = checkpoint.focus_id
      ? document.getElementById(checkpoint.focus_id)
      : null;
    field?.focus({ preventScroll: true });
    window.scrollTo(0, checkpoint.scroll_y);
  }, 200);
}
