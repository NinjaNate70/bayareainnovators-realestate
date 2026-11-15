import type { StorageClient } from "./client";
import type { FileMetadata } from "../../types/backend";
import { requireUser } from "../auth/supabase";
import { dbFail } from "../db/supabase";
import { fail } from "../local/core";
import { validateBlob } from "../local/storage";
import { isUuid, remote, requireSupabase } from "../supabase/client";

// Original files go to the private documents/photos buckets under
// <user id>/<case id>/<file>. public.files records each one. Storage policies
// and RLS enforce the same ownership the path check does here.
const missing = "This file is unavailable.";
async function authorize(path: string) {
  const user = await requireUser(),
    parts = path.split("/");
  if (
    parts.length !== 3 ||
    parts.some(
      (p) => !p || p === "." || p === ".." || /[\\%\u0000-\u001f]/.test(p),
    ) ||
    parts[0] !== user.id ||
    !isUuid(parts[1])
  )
    fail("not_found", missing);
  return { user, caseId: parts[1] };
}
const columns =
  "id, user_id, case_id, bucket, path, mime_type, size, original_name, created_at";

export const supabaseStorage: StorageClient = {
  // Signed URLs expire on their own; there are no object URLs to revoke.
  revokeUrls() {},
  from(bucket) {
    const objects = () => requireSupabase().storage.from(bucket);
    const records = () => requireSupabase().from("files");
    return {
      upload: (path, file, options) =>
        remote(async () => {
          const { user, caseId } = await authorize(path);
          await validateBlob(file, bucket);
          const uploaded = await objects().upload(path, file, {
            contentType: file.type,
            upsert: options?.upsert ?? false,
          });
          if (uploaded.error)
            fail(
              /exists|duplicate/i.test(uploaded.error.message)
                ? "exists"
                : "storage",
              /exists|duplicate/i.test(uploaded.error.message)
                ? "A file already uses this name. Choose a different name."
                : "We couldn't upload this file. Your selection is kept in this tab. Try again.",
            );
          const { data, error } = await records()
            .upsert(
              {
                user_id: user.id,
                case_id: caseId,
                bucket,
                path,
                mime_type: file.type,
                size: file.size,
                original_name:
                  "name" in file ? String(file.name) : path.split("/").pop()!,
              },
              { onConflict: "bucket,path" },
            )
            .select("id")
            .single<{ id: string }>();
          if (error) {
            // Never leave bytes in Storage that the case has no record of.
            await objects().remove([path]);
            dbFail(error);
          }
          return { id: data!.id, path, fullPath: `${bucket}/${path}` };
        }),
      download: (path) =>
        remote(async () => {
          await authorize(path);
          const { data, error } = await objects().download(path);
          if (error || !data) return fail("not_found", missing);
          return data;
        }),
      remove: (paths) =>
        remote(async () => {
          for (const path of paths) await authorize(path);
          if (!paths.length) return [];
          const found = await records()
            .select(columns)
            .eq("bucket", bucket)
            .in("path", paths)
            .returns<FileMetadata[]>();
          if (found.error) dbFail(found.error);
          const removed = await objects().remove(paths);
          if (removed.error)
            fail("storage", "We couldn't remove this file. Try again.");
          const { error } = await records()
            .delete()
            .eq("bucket", bucket)
            .in("path", paths);
          if (error) dbFail(error);
          return found.data ?? [];
        }),
      list: (prefix) =>
        remote(async () => {
          const user = await requireUser();
          if (!prefix.startsWith(`${user.id}/`) || /[%_\\]/.test(prefix))
            fail("not_found", missing);
          const { data, error } = await records()
            .select(columns)
            .eq("bucket", bucket)
            .eq("user_id", user.id)
            .like("path", `${prefix}%`)
            .returns<FileMetadata[]>();
          if (error) dbFail(error);
          return data ?? [];
        }),
      createSignedUrl: (path, expiresIn = 60) =>
        remote(async () => {
          await authorize(path);
          const { data, error } = await objects().createSignedUrl(
            path,
            Math.min(3600, Math.max(1, expiresIn)),
          );
          if (error || !data) return fail("not_found", missing);
          return { signedUrl: data.signedUrl };
        }),
    };
  },
};
