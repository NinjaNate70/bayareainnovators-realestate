import { test, expect } from "@playwright/test";
import "fake-indexeddb/auto";
import { db, now } from "../lib/local/database";
import { localData } from "../lib/local/data";
import { localStorageClient } from "../lib/local/storage";
import { hashPassword, iterations, randomSalt } from "../lib/local/crypto";
import { sessionKey } from "../lib/local/core";
import { safeReturnTo } from "../lib/auth/validation";
import { toRow, fromRow } from "../lib/db/mapping";
import type { RentalCase } from "../types/case";
const memory = new Map<string, string>();
Object.defineProperty(globalThis, "localStorage", {
  value: new Proxy(
    {
      getItem: (k: string) => memory.get(k) ?? null,
      setItem: (k: string, v: string) => memory.set(k, v),
      removeItem: (k: string) => memory.delete(k),
    },
    {
      ownKeys: () => [...memory.keys()],
      getOwnPropertyDescriptor: () => ({
        enumerable: true,
        configurable: true,
      }),
    },
  ),
  configurable: true,
});
Object.assign(process.env, { NODE_ENV: "development" });
test.describe.configure({ mode: "serial" });
test.beforeEach(async () => {
  await db.delete();
  await db.open();
  memory.clear();
});
test.afterAll(async () => {
  localStorageClient.revokeUrls();
  await db.delete();
});
async function account(email: string) {
  const salt = randomSalt(),
    password = "a long test passphrase",
    id = crypto.randomUUID();
  await db.users.add({
    id,
    email,
    name: "Test renter",
    salt,
    password_hash: await hashPassword(password, salt),
    password_iterations: iterations,
    password_version: 1,
    email_verified_at: now(),
    created_at: now(),
    updated_at: now(),
    terms_version: "draft",
    privacy_version: "draft",
    consented_at: now(),
  });
  return { id, password };
}
function blank(): RentalCase {
  return {
    id: crypto.randomUUID(),
    demo: false,
    address: "Apt 4, CA",
    renter: "Test renter",
    landlord: "Owner",
    moveOut: "",
    received: "",
    deposit: 1000,
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
  };
}
test("ownership survives sign-out, blocks account B and keeps original bytes", async () => {
  const { localAuth } = await import("../lib/local/auth");
  const a = await account("a@example.test"),
    b = await account("b@example.test");
  expect(
    (
      await localAuth.signInWithPassword({
        email: "a@example.test",
        password: a.password,
      })
    ).error,
  ).toBeNull();
  const input = toRow(blank());
  const created = await localData.createCase(input);
  expect(created.error).toBeNull();
  const blob = new Blob(
    [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])],
    { type: "image/png" },
  );
  const path = `${a.id}/${input.id}/${crypto.randomUUID()}-photo.png`;
  expect(
    (await localStorageClient.from("photos").upload(path, blob)).error,
  ).toBeNull();
  await localAuth.signOut({ scope: "local" });
  await localAuth.signInWithPassword({
    email: "b@example.test",
    password: b.password,
  });
  expect((await localData.listCases()).data).toEqual([]);
  expect((await localData.getCase(input.id)).data).toBeNull();
  expect(
    (await localStorageClient.from("photos").download(path)).error?.code,
  ).toBe("not_found");
  expect((await localData.updateCase(input.id, input)).error?.code).toBe(
    "not_found",
  );
  await localAuth.signOut({ scope: "local" });
  await localAuth.signInWithPassword({
    email: "a@example.test",
    password: a.password,
  });
  expect((await localData.getCase(input.id)).data?.user_id).toBe(a.id);
  expect(
    await (
      await localStorageClient.from("photos").download(path)
    ).data?.arrayBuffer(),
  ).toEqual(await blob.arrayBuffer());
  expect(fromRow((await localData.getCase(input.id)).data!).address).toBe(
    "Apt 4, CA",
  );
  // Expiry denies reads, but permits a checkpoint only for the original owner.
  const token = localStorage.getItem(sessionKey)!;
  await db.sessions.update(token, { expires_at: "2000-01-01T00:00:00.000Z" });
  expect((await localData.getCase(input.id)).error?.code).toBe(
    "session_expired",
  );
  const checkpoint = {
    id: crypto.randomUUID(),
    user_id: a.id,
    draft_key: input.id,
    case_id: input.id,
    payload: blank(),
    route: `/case/${input.id}?tab=letter`,
    scroll_y: 80,
    focus_id: "letter-draft",
    updated_at: now(),
  };
  expect((await localAuth.retainDraft(checkpoint, token)).error).toBeNull();
  expect(
    (await localAuth.retainDraft({ ...checkpoint, user_id: b.id }, token)).error
      ?.code,
  ).toBe("forbidden");
});
test("five wrong passwords lock sign-in, reload cannot reset lockout", async () => {
  const { localAuth } = await import("../lib/local/auth");
  const a = await account("a@example.test");
  for (let n = 0; n < 4; n++)
    expect(
      (
        await localAuth.signInWithPassword({
          email: "a@example.test",
          password: "wrong",
        })
      ).error?.message,
    ).toBe("Email or password is incorrect.");
  expect(
    (
      await localAuth.signInWithPassword({
        email: "a@example.test",
        password: "wrong",
      })
    ).error?.code,
  ).toBe("rate_limited");
  memory.clear();
  expect(
    (
      await localAuth.signInWithPassword({
        email: "a@example.test",
        password: a.password,
      })
    ).error?.retry_after_seconds,
  ).toBeGreaterThan(0);
});
test("verification and reset tokens are single-use; typed deletion is scoped", async () => {
  const { localAuth } = await import("../lib/local/auth");
  const signup = await localAuth.signUp({
    email: "new@example.test",
    password: "a new long passphrase",
    options: {
      data: {
        name: "New renter",
        terms_version: "draft",
        privacy_version: "draft",
        consented_at: now(),
      },
    },
  });
  expect(signup.error).toBeNull();
  const outbox = (await localAuth.getOutbox()).data!;
  const link = new URL(outbox[0].link, "https://test.invalid");
  const token = link.searchParams.get("token")!;
  expect(
    (await localAuth.verifyEmail({ token, type: "verify" })).data?.session,
  ).toBeTruthy();
  expect(
    (await localAuth.verifyEmail({ token, type: "verify" })).error?.code,
  ).toBe("invalid_token");
  const b = await account("other@example.test");
  // Expired reset never mutates a password; a valid reset consumes on password write.
  await db.auth_flows.clear();
  await db.rate_limits.clear();
  await localAuth.resetPasswordForEmail("new@example.test");
  const reset = new URL(
    (await localAuth.getOutbox()).data![0].link,
    "https://test.invalid",
  ).searchParams.get("token")!;
  const resetRow = await db.auth_tokens
    .filter((t) => t.purpose === "reset" && !t.used_at)
    .first();
  expect(resetRow?.token_hash).not.toBe(reset);
  await db.auth_tokens.update(resetRow!.id, {
    expires_at: "2000-01-01T00:00:00.000Z",
  });
  expect(
    (await localAuth.verifyEmail({ token: reset, type: "recovery" })).error
      ?.code,
  ).toBe("invalid_token");
  await db.auth_tokens.update(resetRow!.id, {
    expires_at: new Date(Date.now() + 3600000).toISOString(),
  });
  expect(
    (await localAuth.verifyEmail({ token: reset, type: "recovery" })).error,
  ).toBeNull();
  expect(
    (
      await localAuth.updateUser(
        { password: "my replacement passphrase" },
        { token: reset },
      )
    ).error,
  ).toBeNull();
  expect(
    (
      await localAuth.updateUser(
        { password: "my replacement passphrase" },
        { token: reset },
      )
    ).error?.code,
  ).toBe("invalid_token");
  await localAuth.signInWithPassword({
    email: "new@example.test",
    password: "my replacement passphrase",
  });
  const owner = (await localAuth.getUser()).data!.user!;
  const caseInput = toRow(blank());
  expect((await localData.createCase(caseInput)).error).toBeNull();
  const uploadPath = `${owner.id}/${caseInput.id}/${crypto.randomUUID()}-original.png`;
  expect(
    (
      await localStorageClient
        .from("photos")
        .upload(
          uploadPath,
          new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])], {
            type: "image/png",
          }),
        )
    ).error,
  ).toBeNull();
  expect(
    (
      await localAuth.deleteUser({
        confirmation: "delete",
        currentPassword: "my replacement passphrase",
      })
    ).error?.code,
  ).toBe("confirmation");
  expect(
    (
      await localAuth.deleteUser({
        confirmation: "DELETE",
        currentPassword: "my replacement passphrase",
      })
    ).error,
  ).toBeNull();
  expect(await db.users.get(b.id)).toBeTruthy();
  expect(await db.cases.where("user_id").equals(owner.id).count()).toBe(0);
  expect(await db.files.where("user_id").equals(owner.id).count()).toBe(0);
  expect(await db.sessions.where("user_id").equals(owner.id).count()).toBe(0);
  expect(
    await db.auth_tokens.filter((t) => t.user_id === owner.id).count(),
  ).toBe(0);
});
test("legacy migration preserves original bytes, needs explicit ownership and is idempotent", async () => {
  const { archiveLegacy } = await import("../lib/local/legacy");
  const { localAuth } = await import("../lib/local/auth");
  const value = blank();
  value.id = "case-legacy";
  value.evidence = [
    {
      id: "P01",
      name: "original.png",
      kind: "before",
      type: "image/png",
      size: 8,
    },
  ];
  const original = new Blob(
    [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])],
    { type: "image/png" },
  );
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("tenant-shield-evidence", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("files");
    request.onsuccess = () => {
      const old = request.result,
        tx = old.transaction("files", "readwrite");
      tx.objectStore("files").put(original, "case-legacy:P01");
      tx.oncomplete = () => {
        old.close();
        resolve();
      };
      tx.onerror = () => reject(tx.error);
    };
  });
  localStorage.setItem("tenant-shield:case-legacy", JSON.stringify(value));
  await archiveLegacy();
  await archiveLegacy();
  expect(await db.legacy_archive.count()).toBe(1);
  expect(await db.cases.count()).toBe(0);
  expect(localStorage.getItem("tenant-shield:case-legacy")).toBeNull();
  expect(
    await (
      await db.legacy_archive.toArray()
    )[0].original_blob_records[0].blob.arrayBuffer(),
  ).toEqual(await original.arrayBuffer());
  const a = await account("legacy-owner@example.test");
  await localAuth.signInWithPassword({
    email: "legacy-owner@example.test",
    password: a.password,
  });
  expect((await localData.importLegacy()).data).toBe(1);
  expect((await localData.importLegacy()).data).toBe(0);
  const cases = (await localData.listCases()).data!;
  expect(cases[0].user_id).toBe(a.id);
  expect(cases[0].id).not.toBe(value.id);
  expect(await (await db.files.toArray())[0].blob.arrayBuffer()).toEqual(
    await original.arrayBuffer(),
  );
  await localAuth.deleteUser({
    confirmation: "DELETE",
    currentPassword: a.password,
  });
  await archiveLegacy();
  expect(await db.legacy_archive.count()).toBe(0);
  expect(await db.files.count()).toBe(0);
});
test("return paths reject cross-origin, encoded redirects and auth loops", () => {
  for (const path of [
    "//evil.test/case/a",
    "https://evil.test/case/a",
    "/%2f%2fevil.test/case/a",
    "/case/../../login",
    "/login",
    "/case/\\evil",
    "/case/%00bad",
  ])
    expect(safeReturnTo(path)).toBeNull();
  expect(safeReturnTo("/case/a?tab=letter#draft")).toBe(
    "/case/a?tab=letter#draft",
  );
});
