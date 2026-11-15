import type {
  AuthError,
  Session as RemoteSession,
  User as RemoteUser,
} from "@supabase/supabase-js";
import type { AuthClient } from "./client";
import type { AuthFlow, Session, User } from "../../types/backend";
import {
  normalizeEmail,
  passwordError,
  safeReturnTo,
  validEmail,
} from "./validation";
import { fail } from "../local/core";
import { db } from "../local/database";
import {
  emailLink,
  isUuid,
  remote,
  requireSupabase,
  supabase,
} from "../supabase/client";

// Supabase Auth owns accounts, passwords, email delivery and sessions. This
// adapter only maps it onto the app's AuthClient contract.
const generic = "Email or password is incorrect.";
const badLink = "This link has expired or can't be used. Request a new one.";
const signedOut = "Sign in to keep going.";

// A password-reset link signs the browser in before the new password exists.
// Until it is saved, that session is used only to set the password.
const recoveryKey = "tenant-shield:recovery";
if (emailLink.recovery) localStorage.setItem(recoveryKey, "1");
const recovering = () => localStorage.getItem(recoveryKey) === "1";
const endRecovery = () => localStorage.removeItem(recoveryKey);

let explicitSignOut = false;
let lastUserId: string | null = null;

const metadataText = (user: RemoteUser, key: string) =>
  typeof user.user_metadata?.[key] === "string"
    ? (user.user_metadata[key] as string)
    : undefined;
function toUser(user: RemoteUser): User {
  return {
    id: user.id,
    email: user.email ?? "",
    aud: user.aud,
    role: user.role ?? "authenticated",
    created_at: user.created_at,
    updated_at: user.updated_at ?? user.created_at,
    email_confirmed_at: user.email_confirmed_at,
    confirmed_at: user.confirmed_at,
    user_metadata: {
      name: metadataText(user, "name") ?? "",
      terms_version: metadataText(user, "terms_version"),
      terms_accepted_at: metadataText(user, "terms_accepted_at"),
      privacy_version: metadataText(user, "privacy_version"),
      consented_at: metadataText(user, "consented_at"),
    },
    app_metadata: { provider: user.app_metadata?.provider ?? "email" },
  };
}
function toSession(session: RemoteSession): Session {
  lastUserId = session.user.id;
  return {
    access_token: session.access_token,
    token_type: "bearer",
    expires_at:
      session.expires_at ?? Math.floor(Date.now() / 1000) + session.expires_in,
    expires_in: session.expires_in,
    refresh_token: session.refresh_token,
    user: toUser(session.user),
  };
}
function authFail(error: AuthError): never {
  const code = error.code ?? "";
  if (error.status === 429 || code.startsWith("over_"))
    return fail(
      "rate_limited",
      "Too many attempts. Wait a minute, then try again.",
      60,
    );
  if (code === "invalid_credentials") return fail(code, generic);
  if (code === "weak_password" || code === "same_password")
    return fail(
      "password",
      code === "same_password"
        ? "Choose a password you aren't already using for this account."
        : error.message,
    );
  if (code === "email_address_invalid" || code === "email_address_not_authorized")
    return fail(
      "email",
      "We can't send email to that address. Check it or use a different one.",
    );
  if (
    ["session_not_found", "session_expired", "refresh_token_not_found"].includes(
      code,
    ) ||
    error.name === "AuthSessionMissingError"
  )
    return fail("signed_out", signedOut);
  if (!error.status || error.name === "AuthRetryableFetchError")
    return fail(
      "network",
      "We couldn't reach the sign-in service. Check your connection and try again.",
    );
  return fail(code || "auth_error", error.message);
}
function emailInput(email: string) {
  const normalized = normalizeEmail(email);
  if (!validEmail(normalized))
    fail("email", "Enter a valid email address, such as you@example.com.");
  return normalized;
}

// Email-confirmation screens need the entered address and return path. That
// context is not secret and only matters in the browser that asked for the link.
const flowsKey = "tenant-shield:flows";
function readFlows(): Record<string, AuthFlow> {
  try {
    const all = JSON.parse(localStorage.getItem(flowsKey) ?? "{}");
    const now = new Date().toISOString();
    return Object.fromEntries(
      Object.entries(all as Record<string, AuthFlow>).filter(
        ([, flow]) => flow.expires_at > now,
      ),
    );
  } catch {
    return {};
  }
}
function startFlow(
  email: string,
  purpose: string,
  returnTo?: string,
  name?: string,
) {
  const flow: AuthFlow = {
    id: crypto.randomUUID(),
    entered_email: email,
    entered_name: name,
    purpose,
    return_to: safeReturnTo(returnTo) ?? "",
    retry_after_at: new Date(Date.now() + 60_000).toISOString(),
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
  };
  localStorage.setItem(
    flowsKey,
    JSON.stringify({ ...readFlows(), [flow.id]: flow }),
  );
  return flow;
}
// Confirmation links land on the sign-in page already signed in; that page then
// opens the renter's case. The origin must be in Supabase's redirect allowlist.
const landing = (path: string, returnTo = "") =>
  `${window.location.origin}${path}${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`;

async function currentSession(): Promise<RemoteSession | null> {
  const { data, error } = await requireSupabase().auth.getSession();
  if (error) authFail(error);
  return data.session;
}
export async function requireUser() {
  const session = recovering() ? null : await currentSession();
  if (!session) return fail("signed_out", signedOut);
  return session.user;
}
async function reauthenticate(email: string, password?: string) {
  if (!password)
    fail("current_password", "Your current password is incorrect. Try again.");
  const { error } = await requireSupabase().auth.signInWithPassword({
    email,
    password: password!,
  });
  if (error?.code === "invalid_credentials")
    fail("current_password", "Your current password is incorrect. Try again.");
  if (error) authFail(error);
}
async function endSessions(scope: "local" | "global") {
  explicitSignOut = true;
  try {
    const { error } = await requireSupabase().auth.signOut({ scope });
    if (error && error.name !== "AuthSessionMissingError") authFail(error);
  } finally {
    explicitSignOut = false;
    endRecovery();
  }
}

export const supabaseAuth: AuthClient = {
  initialize: () =>
    remote(async () => {
      await requireSupabase().auth.initialize();
      // An expired or reused confirmation link lands on the sign-in page with
      // an error. Show the app's own "request a new link" screen instead.
      if (emailLink.failed && window.location.pathname === "/login") {
        emailLink.failed = false;
        window.location.replace("/verify-email");
      }
      return null;
    }),
  signUp: (input) =>
    remote(async () => {
      const email = emailInput(input.email),
        error = passwordError(input.password),
        data = input.options.data,
        name = data.name.trim();
      if (error) fail("password", error);
      if (!name || name.length > 100)
        fail("name", "Enter your name using no more than 100 characters.");
      if (
        !data.terms_version ||
        !data.terms_accepted_at ||
        !data.privacy_version ||
        !data.consented_at
      )
        fail(
          "consent",
          "Agree to the Terms and Privacy to create your account.",
        );
      const flow = startFlow(
        email,
        "verify",
        input.options.emailRedirectTo,
        name,
      );
      const response = await requireSupabase().auth.signUp({
        email,
        password: input.password,
        options: {
          data: { ...data, name },
          emailRedirectTo: landing("/login", flow.return_to),
        },
      });
      if (response.error?.code === "user_already_exists")
        fail(
          "email",
          "We couldn't create an account with that email. Try signing in or resetting your password.",
        );
      if (response.error) authFail(response.error);
      if (response.data.session) endRecovery();
      return {
        user: null,
        session: response.data.session
          ? toSession(response.data.session)
          : null,
        flow_id: flow.id,
      };
    }),
  signInWithPassword: ({ email: input, password }) =>
    remote(async () => {
      const email = emailInput(input);
      const { data, error } = await requireSupabase().auth.signInWithPassword({
        email,
        password,
      });
      if (error?.code === "email_not_confirmed") {
        const now = new Date().toISOString();
        return {
          user: {
            id: "",
            email,
            aud: "authenticated",
            role: "authenticated",
            created_at: now,
            updated_at: now,
            user_metadata: { name: "" },
            app_metadata: { provider: "email" },
          },
          session: null,
          flow_id: startFlow(email, "verify").id,
        };
      }
      if (error) authFail(error);
      if (!data.session || !data.user)
        return fail("invalid_credentials", generic);
      endRecovery();
      return { user: toUser(data.user), session: toSession(data.session) };
    }),
  signInWithGoogle: (returnTo) =>
    remote(async () => {
      // Google returns to /auth/callback, which finishes the sign-in and
      // continues to returnTo. The URL must be in Supabase's redirect allowlist.
      const { error } = await requireSupabase().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: landing("/auth/callback", safeReturnTo(returnTo) ?? ""),
        },
      });
      if (error) authFail(error);
      return null;
    }),
  signOut: (options) =>
    remote(async () => {
      await endSessions(options?.scope ?? "global");
      return null;
    }),
  getSession: () =>
    remote(async () => {
      const session = recovering() ? null : await currentSession();
      return { session: session ? toSession(session) : null };
    }),
  getUser: () =>
    remote(async () => {
      const session = recovering() ? null : await currentSession();
      return { user: session ? toUser(session.user) : null };
    }),
  onAuthStateChange(callback) {
    const client = supabase;
    if (!client)
      return {
        data: { subscription: { unsubscribe() {} } },
        error: null,
      };
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        const expired = !explicitSignOut && lastUserId !== null;
        lastUserId = null;
        callback(expired ? "SESSION_EXPIRED" : "SIGNED_OUT", null);
      } else if (!session || recovering()) {
        if (event === "INITIAL_SESSION") callback(event, null);
      } else if (event === "INITIAL_SESSION" || event === "SIGNED_IN")
        callback(event, toSession(session));
      else if (event === "USER_UPDATED" || event === "TOKEN_REFRESHED")
        callback("USER_UPDATED", toSession(session));
    });
    return { data: { subscription: data.subscription }, error: null };
  },
  resetPasswordForEmail: (input, options) =>
    remote(async () => {
      const email = emailInput(input);
      const flow = startFlow(email, "reset", options?.redirectTo);
      const { error } = await requireSupabase().auth.resetPasswordForEmail(
        email,
        { redirectTo: landing("/reset-password") },
      );
      if (error) authFail(error);
      return { flow_id: flow.id };
    }),
  resend: (input) =>
    remote(async () => {
      const email = emailInput(input.email);
      const flow = startFlow(
        email,
        input.type === "signup" ? "verify" : "email_change",
        input.options?.emailRedirectTo,
      );
      const { error } = await requireSupabase().auth.resend({
        type: input.type,
        email,
        options: {
          emailRedirectTo:
            input.type === "signup"
              ? landing("/login", flow.return_to)
              : landing("/account"),
        },
      });
      if (error) authFail(error);
      return { flow_id: flow.id };
    }),
  verifyEmail: (input) =>
    remote(async () => {
      const client = requireSupabase();
      if (input.type === "recovery") {
        // Supabase already checked the emailed token and opened a session that
        // is held back until the new password is saved.
        await client.auth.initialize();
        if (!recovering() || !(await currentSession()))
          fail("invalid_token", badLink);
        return { user: null, session: null };
      }
      // For email templates that link straight to /verify-email with a token hash.
      const { data, error } = await client.auth.verifyOtp({
        token_hash: input.token,
        type: input.type === "verify" ? "email" : "email_change",
      });
      if (error || !data.session || !data.user)
        return fail("invalid_token", badLink);
      endRecovery();
      return { user: toUser(data.user), session: toSession(data.session) };
    }),
  updateUser: (input, options) =>
    remote(async () => {
      const client = requireSupabase();
      if (options && "token" in options) {
        const error = passwordError(input.password ?? "");
        if (error) fail("password", error);
        if (!recovering() || !(await currentSession()))
          fail("invalid_token", badLink);
        const response = await client.auth.updateUser({
          password: input.password,
        });
        if (response.error?.name === "AuthSessionMissingError")
          fail("invalid_token", badLink);
        if (response.error) authFail(response.error);
        // The reset ends every session; the renter signs in with the new password.
        await endSessions("global");
        return { user: toUser(response.data.user!) };
      }
      const current = await requireUser();
      const name = input.data?.name.trim();
      if (input.data && (!name || name.length > 100))
        fail("name", "Enter your name using no more than 100 characters.");
      if (input.password) {
        const error = passwordError(input.password);
        if (error) fail("password", error);
        await reauthenticate(current.email ?? "", options?.currentPassword);
        const response = await client.auth.updateUser({
          password: input.password,
        });
        if (response.error) authFail(response.error);
        await endSessions("global");
        return { user: toUser(response.data.user!) };
      }
      if (input.email) {
        const email = emailInput(input.email);
        await reauthenticate(current.email ?? "", options?.currentPassword);
        const flow = startFlow(email, "email_change");
        const response = await client.auth.updateUser(
          { email },
          { emailRedirectTo: landing("/account") },
        );
        // Same response whether or not the proposed address is already in use.
        if (response.error && response.error.code !== "email_exists")
          authFail(response.error);
        return {
          user: toUser(response.data.user ?? current),
          flow_id: flow.id,
        };
      }
      if (!name) return { user: toUser(current) };
      const response = await client.auth.updateUser({ data: { name } });
      if (response.error) authFail(response.error);
      return { user: toUser(response.data.user!) };
    }),
  deleteUser: (input) =>
    remote(async () => {
      if (input.confirmation !== "DELETE")
        fail("confirmation", "Type DELETE exactly to confirm.");
      const session = recovering() ? null : await currentSession();
      if (!session) return fail("signed_out", signedOut);
      // Deleting an Auth user needs the secret key, so the server does it after
      // checking this session and the current password itself.
      const response = await fetch("/api/account/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          confirmation: input.confirmation,
          password: input.currentPassword,
        }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          code?: string;
          error?: string;
        } | null;
        fail(
          body?.code ?? "delete_failed",
          body?.error ??
            "We couldn't delete your account. Nothing was removed. Try again.",
        );
      }
      await db.drafts.where("user_id").equals(session.user.id).delete();
      await endSessions("local");
      return null;
    }),
  getFlow: (id) => remote(async () => readFlows()[id] ?? null),
  // Supabase delivers real email, so there is no simulated outbox.
  getOutbox: () => remote(async () => []),
  retainDraft: (checkpoint) =>
    remote(async () => {
      // Keeps unsaved work in this browser after a session ends. It is filed
      // under its owner and is only read back once that owner signs in again.
      if (!isUuid(checkpoint.user_id))
        fail("forbidden", "This draft belongs to a different account.");
      await db.transaction("rw", db.drafts, async () => {
        const previous = await db.drafts
          .where("[user_id+draft_key]")
          .equals([checkpoint.user_id, checkpoint.draft_key])
          .first();
        await db.drafts.put({
          ...checkpoint,
          id: previous?.id ?? checkpoint.id,
        });
      });
      return null;
    }),
};
