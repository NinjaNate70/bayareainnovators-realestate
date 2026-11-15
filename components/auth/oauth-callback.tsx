"use client";
import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LoaderCircle, ShieldCheck } from "lucide-react";
import { getBackend } from "@/lib/backend";
import { emailLink } from "@/lib/supabase/client";
import { recoveryDestination } from "@/lib/auth/drafts";
import { safeReturnTo } from "@/lib/auth/validation";
import { termsAccepted, termsGatePath } from "@/lib/auth/terms";

const failed = "/login?error=oauth";

// Google sends the renter back here. The Supabase client reads the sign-in
// result from the URL as it starts; this page waits for that session and then
// continues to where the renter was going.
export function OAuthCallback() {
  const router = useRouter(),
    search = useSearchParams();
  useEffect(() => {
    let alive = true;
    const go = (path: string) => {
      if (alive) router.replace(path);
    };
    // A cancelled or refused Google sign-in comes back with an error instead.
    if (emailLink.failed || search.has("error") || search.has("error_code")) {
      emailLink.failed = false;
      go(failed);
      return;
    }
    void (async () => {
      const r = await getBackend().auth.getSession();
      const session = r.data?.session;
      if (!session) return go(failed);
      const returnTo = safeReturnTo(search.get("returnTo"));
      if (returnTo === "/inspections")
        return go(
          termsAccepted(session.user.user_metadata)
            ? returnTo
            : termsGatePath(returnTo),
        );
      go(await recoveryDestination(session, returnTo));
    })().catch(() => go(failed));
    return () => {
      alive = false;
    };
  }, [router, search]);
  return (
    <main className="protected-screen">
      <div className="auth-status-icon">
        <ShieldCheck aria-hidden="true" />
      </div>
      <h1>Finishing sign-in…</h1>
      <LoaderCircle className="spin" aria-label="Finishing sign-in" />
    </main>
  );
}
