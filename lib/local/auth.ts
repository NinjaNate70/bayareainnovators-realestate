import type { AuthClient } from "../auth/client";
import type { AuthFlow, Checkpoint, Session } from "../../types/backend";
import {
  normalizeEmail,
  passwordError,
  safeReturnTo,
  validEmail,
} from "../auth/validation";
import { db, now, type UserRow, type TokenRow, type FlowRow } from "./database";
import {
  hashPassword,
  hashToken,
  iterations,
  randomSalt,
  randomToken,
} from "./crypto";
import {
  emit,
  fail,
  listeners,
  publicSession,
  publicUser,
  requireSession,
  result,
  sessionKey,
} from "./core";

// Local auth is for development/demo only. It is not real security: passwords,
// sessions and account data live in the browser and can be inspected or changed
// by someone with access to it. TODO(supabase): replace this adapter with real Auth.
const development = process.env.NODE_ENV === "development";
const neutral = "If an account exists for that email, we sent a link.";
const generic = "Email or password is incorrect.";
function emailInput(email: string) {
  const normalized = normalizeEmail(email);
  if (!validEmail(normalized))
    fail("email", "Enter a valid email address, such as you@example.com.");
  return normalized;
}
function ensureSending() {
  if (!development)
    fail(
      "email_unavailable",
      "Email delivery isn't connected in this local demo. Please ask the team for the demo sign-in.",
    );
}
async function limit(email: string, operation: string, failed = false) {
  const email_key = await hashToken(email);
  const wait = await db.transaction("rw", db.rate_limits, async () => {
    let row = await db.rate_limits
      .where("[email_key+operation]")
      .equals([email_key, operation])
      .first();
    if (row?.locked_until && row.locked_until > now())
      return Math.ceil((Date.parse(row.locked_until) - Date.now()) / 1000);
    if (!row || Date.now() - Date.parse(row.window_started_at) >= 300_000)
      row = {
        id: row?.id ?? crypto.randomUUID(),
        email_key,
        operation,
        failed_count: 0,
        window_started_at: now(),
        locked_until: null,
        updated_at: now(),
      };
    if (failed) {
      row.failed_count++;
      row.updated_at = now();
      if (row.failed_count >= (operation === "send" ? 6 : 5))
        row.locked_until = new Date(Date.now() + 300_000).toISOString();
      await db.rate_limits.put(row);
      return row.locked_until ? 300 : 0;
    }
    return 0;
  });
  if (wait)
    fail(
      "rate_limited",
      `Too many attempts. Try again in ${Math.max(1, Math.ceil(wait / 60))} min.`,
      wait,
    );
}
async function requestLimit(email: string) {
  await limit(email, "send");
  const recent = await db.auth_flows
    .where("expires_at")
    .above(now())
    .filter((f) => f.entered_email === email && f.retry_after_at > now())
    .first();
  if (recent)
    fail(
      "rate_limited",
      "Please wait before requesting another link.",
      Math.ceil((Date.parse(recent.retry_after_at) - Date.now()) / 1000),
    );
  await limit(email, "send", true);
}
function flowFor(
  email: string,
  purpose: string,
  returnTo?: string,
  name?: string,
): FlowRow {
  return {
    id: crypto.randomUUID(),
    entered_email: email,
    entered_name: name,
    purpose,
    return_to: safeReturnTo(returnTo) ?? "",
    retry_after_at: new Date(Date.now() + 60_000).toISOString(),
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  };
}
async function issue(
  row: UserRow | undefined,
  purpose: TokenRow["purpose"],
  flow: FlowRow,
  email = flow.entered_email,
) {
  const raw = randomToken(),
    token_hash = await hashToken(raw),
    expires_at = new Date(
      Date.now() + (purpose === "reset" ? 3_600_000 : 86_400_000),
    ).toISOString();
  await db.transaction(
    "rw",
    db.auth_flows,
    db.auth_tokens,
    db.outbox,
    async () => {
      await db.auth_flows.put({ ...flow, pending_user_id: row?.id });
      if (!row) return;
      await db.auth_tokens
        .where("[user_id+purpose]")
        .equals([row.id, purpose])
        .modify({ used_at: now() });
      await db.auth_tokens.add({
        id: crypto.randomUUID(),
        user_id: row.id,
        purpose,
        token_hash,
        email_to: email,
        expires_at,
        used_at: null,
        created_at: now(),
        flow_id: flow.id,
      });
      if (development) {
        const route = purpose === "reset" ? "/reset-password" : "/verify-email";
        const link = `${route}?token=${raw}&type=${purpose}&flow=${flow.id}`;
        await db.outbox.add({
          id: crypto.randomUUID(),
          flow_id: flow.id,
          user_id: row.id,
          email_to: email,
          purpose,
          link,
          expires_at,
          created_at: now(),
        });
        console.info("[Local demo Outbox]", email, link);
      }
    },
  );
}
async function createSession(user: UserRow): Promise<Session> {
  const row = {
    access_token: randomToken(),
    user_id: user.id,
    expires_at: new Date(Date.now() + 3_600_000).toISOString(),
    created_at: now(),
    password_version: user.password_version,
    mode: "normal" as const,
  };
  await db.sessions.add(row);
  localStorage.setItem(sessionKey, row.access_token);
  const session = publicSession(row, user);
  emit("SIGNED_IN", session);
  return session;
}
async function validToken(raw: string, purpose: TokenRow["purpose"]) {
  if (!/^[a-f0-9]{64}$/.test(raw))
    return fail(
      "invalid_token",
      "This link has expired or can't be used. Request a new one.",
    );
  const token = await db.auth_tokens
    .where("token_hash")
    .equals(await hashToken(raw))
    .first();
  if (
    !token ||
    token.purpose !== purpose ||
    token.used_at ||
    token.expires_at <= now()
  )
    return fail(
      "invalid_token",
      "This link has expired or can't be used. Request a new one.",
    );
  return token;
}
async function reauthenticate(user: UserRow, password?: string) {
  await limit(user.email, "sign_in");
  if (
    !password ||
    (await hashPassword(password, user.salt, user.password_iterations)) !==
      user.password_hash
  ) {
    await limit(user.email, "sign_in", true);
    fail("current_password", "Your current password is incorrect. Try again.");
  }
}
export const localAuth: AuthClient = {
  initialize: () =>
    result(async () => {
      const { initializeLocal } = await import("./initialize");
      await initializeLocal();
      return null;
    }),
  signUp: (input) =>
    result(async () => {
      ensureSending();
      const email = emailInput(input.email),
        error = passwordError(input.password),
        name = input.options.data.name.trim();
      if (error) fail("password", error);
      if (!name || name.length > 100)
        fail("name", "Enter your name using no more than 100 characters.");
      if (
        !input.options.data.terms_version ||
        !input.options.data.terms_accepted_at ||
        !input.options.data.privacy_version ||
        !input.options.data.consented_at
      )
        fail(
          "consent",
          "Agree to the Terms and Privacy to create your account.",
        );
      await requestLimit(email);
      const salt = randomSalt(),
        password_hash = await hashPassword(input.password, salt),
        flow = flowFor(email, "verify", input.options.emailRedirectTo, name);
      let created: UserRow | undefined;
      await db.transaction("rw", db.users, async () => {
        if (await db.users.where("email").equals(email).count()) return;
        created = {
          id: crypto.randomUUID(),
          email,
          password_hash,
          salt,
          password_iterations: iterations,
          password_version: 1,
          name,
          email_verified_at: null,
          created_at: now(),
          updated_at: now(),
          terms_version: input.options.data.terms_version,
          terms_accepted_at: input.options.data.terms_accepted_at,
          privacy_version: input.options.data.privacy_version,
          consented_at: input.options.data.consented_at,
        };
        await db.users.add(created);
      });
      // Existing accounts get the same UI but no replacement password or leaked user.
      await issue(created, "verify", flow);
      return { user: null, session: null, flow_id: flow.id };
    }),
  signInWithPassword: ({ email: input, password }) =>
    result(async () => {
      const email = emailInput(input);
      await limit(email, "sign_in");
      const user = await db.users.where("email").equals(email).first();
      const hash = await hashPassword(
        password,
        user?.salt ?? "missing-account-dummy-salt",
        user?.password_iterations ?? iterations,
      );
      if (!user || hash !== user.password_hash) {
        await limit(email, "sign_in", true);
        return fail("invalid_credentials", generic);
      }
      // Recheck after expensive hashing; an intervening reset invalidates this attempt.
      const email_key = await hashToken(email);
      const session = await db.transaction(
        "rw",
        db.users,
        db.sessions,
        db.rate_limits,
        async () => {
          const current = await db.users.get(user.id);
          if (
            !current ||
            current.password_version !== user.password_version ||
            current.email !== email
          )
            return fail("invalid_credentials", generic);
          const locked = await db.rate_limits
            .where("[email_key+operation]")
            .equals([email_key, "sign_in"])
            .first();
          if (locked?.locked_until && locked.locked_until > now())
            fail("rate_limited", "Too many attempts. Try again in 5 min.", 300);
          await db.rate_limits
            .where("[email_key+operation]")
            .equals([email_key, "sign_in"])
            .delete();
          return current.email_verified_at ? createSession(current) : null;
        },
      );
      if (!session) {
        const flow = flowFor(email, "verify");
        await db.auth_flows.put({ ...flow, pending_user_id: user.id });
        return { user: publicUser(user), session: null, flow_id: flow.id };
      }
      return { user: publicUser(user), session };
    }),
  getSession: () =>
    result(async () => {
      const token = localStorage.getItem(sessionKey);
      if (!token) return { session: null };
      try {
        const { row, user } = await requireSession(token);
        return { session: publicSession(row, user) };
      } catch (e) {
        if (
          e instanceof Error &&
          "code" in e &&
          (e.code === "session_expired" || e.code === "signed_out")
        )
          return { session: null };
        throw e;
      }
    }),
  getUser: () =>
    result(async () => {
      const s = await localAuth.getSession();
      if (s.error) fail(s.error.code, s.error.message);
      return { user: s.data?.session?.user ?? null };
    }),
  onAuthStateChange(callback) {
    listeners.add(callback);
    void localAuth.getSession().then((response) => {
      if (listeners.has(callback))
        callback("INITIAL_SESSION", response.data?.session ?? null);
    });
    return {
      data: { subscription: { unsubscribe: () => listeners.delete(callback) } },
      error: null,
    };
  },
  signOut: (options) =>
    result(async () => {
      const token = localStorage.getItem(sessionKey),
        row = token ? await db.sessions.get(token) : null;
      if (options?.scope === "local") {
        if (token) await db.sessions.delete(token);
      } else if (row)
        await db.sessions.where("user_id").equals(row.user_id).delete();
      localStorage.removeItem(sessionKey);
      emit("SIGNED_OUT", null);
      return null;
    }),
  resetPasswordForEmail: (input, options) =>
    result(async () => {
      ensureSending();
      const email = emailInput(input);
      await requestLimit(email);
      const flow = flowFor(email, "reset", options?.redirectTo);
      await issue(
        await db.users.where("email").equals(email).first(),
        "reset",
        flow,
      );
      return { flow_id: flow.id };
    }),
  resend: (input) =>
    result(async () => {
      ensureSending();
      const email = emailInput(input.email);
      await requestLimit(email);
      const user =
        input.type === "email_change"
          ? (await requireSession()).user
          : await db.users.where("email").equals(email).first();
      const recipient =
        input.type === "email_change" ? user?.pending_email : email;
      const flow = flowFor(
        email,
        input.type === "signup" ? "verify" : "email_change",
        input.options?.emailRedirectTo,
      );
      await issue(
        input.type === "signup" && user?.email_verified_at ? undefined : user,
        input.type === "signup" ? "verify" : "email_change",
        flow,
        recipient ?? email,
      );
      return { flow_id: flow.id };
    }),
  verifyEmail: (input) =>
    result(async () => {
      const purpose = input.type === "recovery" ? "reset" : input.type;
      const candidate = await validToken(input.token, purpose);
      if (input.type === "recovery") return { user: null, session: null }; // Validation only; reset consumes the token with the new hash.
      const user = await db.transaction(
        "rw",
        db.users,
        db.auth_tokens,
        db.outbox,
        async () => {
          const token = await db.auth_tokens.get(candidate.id);
          if (!token || token.used_at || token.expires_at <= now())
            return fail(
              "invalid_token",
              "This link has expired or can't be used. Request a new one.",
            );
          const row = await db.users.get(token.user_id);
          if (!row)
            return fail(
              "invalid_token",
              "This link has expired or can't be used. Request a new one.",
            );
          if (input.type === "email_change") {
            if (
              row.pending_email !== token.email_to ||
              (await db.users.where("email").equals(token.email_to).count())
            )
              return fail(
                "invalid_token",
                "This link has expired or can't be used. Request a new one.",
              );
            row.email = token.email_to;
            delete row.pending_email;
          }
          row.email_verified_at = now();
          row.updated_at = now();
          await db.users.put(row);
          await db.auth_tokens.update(token.id, { used_at: now() });
          await db.outbox.where("flow_id").equals(token.flow_id).delete();
          return row;
        },
      );
      return { user: publicUser(user), session: await createSession(user) };
    }),
  updateUser: (input, options) =>
    result(async () => {
      if (options?.token) {
        const error = passwordError(input.password ?? "");
        if (error) fail("password", error);
        const candidate = await validToken(options.token, "reset"),
          salt = randomSalt(),
          password_hash = await hashPassword(input.password!, salt);
        const user = await db.transaction(
          "rw",
          db.users,
          db.sessions,
          db.auth_tokens,
          db.outbox,
          async () => {
            const token = await db.auth_tokens.get(candidate.id);
            if (!token || token.used_at || token.expires_at <= now())
              return fail(
                "invalid_token",
                "This link has expired or can't be used. Request a new one.",
              );
            const row = await db.users.get(token.user_id);
            if (!row)
              return fail(
                "invalid_token",
                "This link has expired or can't be used. Request a new one.",
              );
            row.salt = salt;
            row.password_hash = password_hash;
            row.password_iterations = iterations;
            row.password_version++;
            row.updated_at = now();
            await db.users.put(row);
            await db.sessions.where("user_id").equals(row.id).delete();
            await db.auth_tokens
              .filter((t) => t.user_id === row.id)
              .modify({ used_at: now() });
            await db.outbox.where("user_id").equals(row.id).delete();
            return row;
          },
        );
        emit("SIGNED_OUT", null);
        return { user: publicUser(user) };
      }
      const initial = await requireSession();
      let user = initial.user;
      let flow_id: string | undefined;
      if (input.email || input.password)
        await reauthenticate(user, options?.currentPassword);
      const name = input.data?.name.trim();
      if (input.data && (!name || name.length > 100))
        fail("name", "Enter your name using no more than 100 characters.");
      if (input.password) {
        const error = passwordError(input.password);
        if (error) fail("password", error);
        const salt = randomSalt(),
          password_hash = await hashPassword(input.password, salt);
        await db.transaction("rw", db.users, db.sessions, async () => {
          await requireSession(initial.row.access_token);
          const latest = await db.users.get(user.id);
          if (!latest || latest.password_version !== user.password_version)
            fail("current_password", "Your password changed. Sign in again.");
          await db.users.update(user.id, {
            salt,
            password_hash,
            password_iterations: iterations,
            password_version: user.password_version + 1,
            updated_at: now(),
          });
          await db.sessions.where("user_id").equals(user.id).delete();
        });
        localStorage.removeItem(sessionKey);
        emit("SIGNED_OUT", null);
      } else if (input.email) {
        ensureSending();
        const email = emailInput(input.email);
        await requestLimit(email);
        const exists = await db.users.where("email").equals(email).count();
        const flow = flowFor(email, "email_change");
        // Identical response if the proposed email is already in use.
        if (!exists) {
          await db.transaction("rw", db.users, db.sessions, async () => {
            const current = await requireSession(initial.row.access_token);
            if (current.user.password_version !== user.password_version)
              fail("current_password", "Your password changed. Sign in again.");
            await db.users.update(user.id, { pending_email: email });
          });
          user = { ...user, pending_email: email };
        }
        await issue(exists ? undefined : user, "email_change", flow);
        flow_id = flow.id;
      } else if (name) {
        await db.transaction("rw", db.users, db.sessions, async () => {
          await requireSession(initial.row.access_token);
          await db.users.update(user.id, { name, updated_at: now() });
        });
      }
      user = (await db.users.get(user.id))!;
      const session = await localAuth.getSession();
      emit("USER_UPDATED", session.data?.session ?? null);
      return { user: publicUser(user), flow_id };
    }),
  deleteUser: (input) =>
    result(async () => {
      const { row, user } = await requireSession();
      if (input.confirmation !== "DELETE")
        fail("confirmation", "Type DELETE exactly to confirm.");
      await reauthenticate(user, input.currentPassword);
      await db.transaction(
        "rw",
        [
          db.users,
          db.sessions,
          db.cases,
          db.files,
          db.drafts,
          db.auth_tokens,
          db.auth_flows,
          db.outbox,
          db.legacy_archive,
        ],
        async () => {
          const current = await requireSession(row.access_token);
          if (current.user.password_version !== user.password_version)
            fail("current_password", "Your password changed. Sign in again.");
          await db.cases.where("user_id").equals(user.id).delete();
          await db.files.where("user_id").equals(user.id).delete();
          await db.drafts.where("user_id").equals(user.id).delete();
          await db.sessions.where("user_id").equals(user.id).delete();
          await db.auth_tokens.filter((t) => t.user_id === user.id).delete();
          await db.auth_flows
            .filter((f) => f.pending_user_id === user.id)
            .delete();
          await db.outbox.where("user_id").equals(user.id).delete();
          await db.legacy_archive
            .where("owner_user_id")
            .equals(user.id)
            .delete();
          await db.users.delete(user.id);
        },
      );
      localStorage.removeItem(sessionKey);
      emit("SIGNED_OUT", null);
      return null;
    }),
  getFlow: (id) =>
    result(async () => {
      const row = await db.auth_flows.get(id);
      if (!row || row.expires_at <= now()) return null;
      const { pending_user_id: _, ...visible } = row;
      void _;
      return visible as AuthFlow;
    }),
  getOutbox: () =>
    result(async () => {
      if (!development) return [];
      await db.outbox.where("expires_at").belowOrEqual(now()).delete();
      return db.outbox.toArray();
    }),
  retainDraft: (checkpoint: Checkpoint, expiredToken: string) =>
    result(async () => {
      await db.transaction(
        "rw",
        db.users,
        db.sessions,
        db.drafts,
        db.cases,
        async () => {
          const { user } = await requireSession(expiredToken, true);
          if (checkpoint.user_id !== user.id)
            fail("forbidden", "This draft belongs to a different account.");
          if (checkpoint.case_id) {
            const c = await db.cases.get(checkpoint.case_id);
            if (!c || c.user_id !== user.id)
              fail("forbidden", "This case is unavailable.");
          }
          await db.drafts.put(checkpoint);
        },
      );
      return null;
    }),
};
export { neutral };
