import type { PostgrestError } from "@supabase/supabase-js";
import type { CaseInput, DataClient } from "./client";
import type { CaseRow } from "../../types/backend";
import { requireUser } from "../auth/supabase";
import { fail } from "../local/core";
import { validateCase } from "../local/data";
import { db } from "../local/database";
import { isUuid, remote, requireSupabase } from "../supabase/client";

// Cases live in Postgres (public.cases) behind row-level security. Drafts stay
// in this browser, filed under the signed-in Supabase user, as an offline buffer.
const unavailable = "This case is unavailable.";
const day = /^\d{4}-\d{2}-\d{2}$/;
type StoredCase = Omit<
  CaseRow,
  "move_out_date" | "letter_received_date" | "reply_by_date" | "photo_pairs"
> & {
  move_out_date: string | null;
  letter_received_date: string | null;
  reply_by_date: string | null;
  photo_pairs: CaseRow["photo_pairs"] | null;
};
const fromDb = (row: StoredCase): CaseRow => ({
  ...row,
  move_out_date: row.move_out_date ?? "",
  letter_received_date: row.letter_received_date ?? "",
  reply_by_date: row.reply_by_date ?? "",
  photo_pairs: row.photo_pairs ?? undefined,
});
const date = (value: string) => (day.test(value) ? value : null);
// The renter's notes need the situation_text column, added by a later
// migration. A project that hasn't run it yet must still save cases, so the
// field is left out there and the wizard says the notes can't be kept yet.
let notesColumnMissing = false;
export const notesUnavailable = () => notesColumnMissing;
const lacksNotesColumn = (error: PostgrestError | null) =>
  !!error &&
  ["PGRST204", "42703"].includes(error.code) &&
  error.message.includes("situation_text");
const toDb = ({ situation_text, ...input }: CaseInput) => ({
  ...input,
  ...(notesColumnMissing ? {} : { situation_text: situation_text ?? "" }),
  move_out_date: date(input.move_out_date),
  letter_received_date: date(input.letter_received_date),
  reply_by_date: date(input.reply_by_date),
  photo_pairs: input.photo_pairs ?? null,
});
export function dbFail(error: PostgrestError): never {
  if (error.code === "PGRST301" || /jwt/i.test(error.message))
    return fail("signed_out", "Sign in to keep going.");
  if (["42P01", "PGRST205", "42501"].includes(error.code))
    return fail(
      "setup",
      "The case database isn't ready. Ask your project admin to run the case workspace migration in Supabase.",
    );
  if (error.code === "23505")
    return fail(
      "conflict",
      "This case changed in another tab. Your draft is retained; reload to review both versions.",
    );
  return fail(
    "database",
    "We couldn't reach your saved cases. Check your connection and try again. Keep this tab open.",
  );
}
const cases = () => requireSupabase().from("cases");
async function resolveCase(id: string, userId: string) {
  if (id !== "demo" && !isUuid(id)) return null;
  const owned = cases().select().eq("user_id", userId);
  const { data, error } = await (
    id === "demo"
      ? owned.eq("is_demo", true).order("updated_at", { ascending: false })
      : owned.eq("id", id)
  )
    .limit(1)
    .maybeSingle<StoredCase>();
  if (error) dbFail(error);
  return data ? fromDb(data) : null;
}
const draft = (userId: string, key: string) =>
  db.drafts.where("[user_id+draft_key]").equals([userId, key]);

export const supabaseData: DataClient = {
  listCases: () =>
    remote(async () => {
      const user = await requireUser();
      const { data, error } = await cases()
        .select()
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .order("id")
        .returns<StoredCase[]>();
      if (error) dbFail(error);
      return (data ?? []).map(fromDb);
    }),
  getCase: (id) =>
    remote(async () => resolveCase(id, (await requireUser()).id)),
  getMostRecentCase: () =>
    remote(async () => {
      const user = await requireUser();
      const { data, error } = await cases()
        .select()
        .eq("user_id", user.id)
        .order("updated_at", { ascending: false })
        .order("id")
        .limit(1)
        .maybeSingle<StoredCase>();
      if (error) dbFail(error);
      return data ? fromDb(data) : null;
    }),
  createCase: (input) =>
    remote(async () => {
      validateCase(input);
      const user = await requireUser();
      const insert = () =>
        cases()
          .insert({ ...toDb(input), user_id: user.id })
          .select()
          .single<StoredCase>();
      let { data, error } = await insert();
      if (lacksNotesColumn(error)) {
        notesColumnMissing = true;
        ({ data, error } = await insert());
      }
      if (error) dbFail(error);
      return fromDb(data!);
    }),
  updateCase: (id, input, expectedRevision) =>
    remote(async () => {
      validateCase(input);
      const user = await requireUser();
      const row = await resolveCase(id, user.id);
      if (!row || input.id !== row.id) return fail("not_found", unavailable);
      // The database bumps revision and updated_at on every update, so matching
      // the revision here makes a stale write change nothing.
      const update = () =>
        cases()
          .update(toDb(input))
          .eq("id", row.id)
          .eq("user_id", user.id)
          .eq("revision", expectedRevision ?? row.revision)
          .select()
          .maybeSingle<StoredCase>();
      let { data, error } = await update();
      if (lacksNotesColumn(error)) {
        notesColumnMissing = true;
        ({ data, error } = await update());
      }
      if (error) dbFail(error);
      if (!data)
        return fail(
          "conflict",
          "This case changed in another tab. Your draft is retained; reload to review both versions.",
        );
      return fromDb(data);
    }),
  deleteCase: (id) =>
    remote(async () => {
      const client = requireSupabase(),
        user = await requireUser(),
        row = await resolveCase(id, user.id);
      if (!row) return fail("not_found", unavailable);
      const files = await client
        .from("files")
        .select("bucket, path")
        .eq("case_id", row.id)
        .returns<{ bucket: "documents" | "photos"; path: string }[]>();
      if (files.error) dbFail(files.error);
      for (const bucket of ["documents", "photos"] as const) {
        const paths = (files.data ?? [])
          .filter((f) => f.bucket === bucket)
          .map((f) => f.path);
        if (!paths.length) continue;
        const removed = await client.storage.from(bucket).remove(paths);
        if (removed.error)
          fail(
            "storage",
            "We couldn't remove this case's files, so the case was kept. Try again.",
          );
      }
      // File records go with the case through the foreign key.
      const { error } = await cases()
        .delete()
        .eq("id", row.id)
        .eq("user_id", user.id);
      if (error) dbFail(error);
      await draft(user.id, row.id).delete();
      return null;
    }),
  saveDraft: (checkpoint) =>
    remote(async () => {
      const user = await requireUser();
      if (checkpoint.user_id !== user.id)
        fail("forbidden", "This draft belongs to a different account.");
      return db.transaction("rw", db.drafts, async () => {
        const previous = await draft(user.id, checkpoint.draft_key).first();
        const row = { ...checkpoint, id: previous?.id ?? checkpoint.id };
        await db.drafts.put(row);
        return row;
      });
    }),
  getDraft: (key) =>
    remote(async () => {
      const user = await requireUser();
      return (await draft(user.id, key).first()) ?? null;
    }),
  clearDraft: (key) =>
    remote(async () => {
      const user = await requireUser();
      await draft(user.id, key).delete();
      return null;
    }),
  listDrafts: () =>
    remote(async () => {
      const user = await requireUser();
      return db.drafts.where("user_id").equals(user.id).toArray();
    }),
  // Cases from the earlier browser-only demo stay in that browser's archive.
  legacyStatus: () => remote(async () => 0),
  importLegacy: () => remote(async () => 0),
};
