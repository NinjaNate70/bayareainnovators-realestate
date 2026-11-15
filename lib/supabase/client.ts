import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Result } from "../../types/backend";
import { LocalError, fail } from "../local/core";

// One browser client for the whole app. The case screens and My Inspections
// share it, so a single Supabase sign-in covers both. Only the project URL and
// the publishable key belong here; RLS policies decide what a renter can reach.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

// Supabase email links come back with their result in the URL fragment, and the
// client clears it while it starts up. Read it first.
const fragment = new URLSearchParams(
  typeof window === "undefined" ? "" : window.location.hash.slice(1),
);
export const emailLink = {
  recovery: fragment.get("type") === "recovery" && fragment.has("access_token"),
  failed: fragment.has("error") || fragment.has("error_code"),
};

export const supabase: SupabaseClient | null =
  url && key ? createClient(url, key) : null;

export function requireSupabase(): SupabaseClient {
  return (
    supabase ??
    fail(
      "setup",
      "Supabase isn't connected. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, then restart or redeploy.",
    )
  );
}

export async function remote<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { data: await fn(), error: null };
  } catch (e) {
    if (e instanceof LocalError)
      return {
        data: null,
        error: {
          code: e.code,
          message: e.message,
          retry_after_seconds: e.retry_after_seconds,
        },
      };
    return {
      data: null,
      error: {
        code: "network",
        message:
          "We couldn't reach your account. Check your connection and try again. Keep this tab open.",
      },
    };
  }
}

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (value: string) => uuid.test(value);
