"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowRight, LoaderCircle, ShieldCheck } from "lucide-react";
import { AuthFrame } from "./frame";
import { FormError, SubmitButton } from "./form";
import { useAuth } from "./provider";
import { TermsAgreementText } from "./terms-agreement";
import { Button } from "@/components/ui/button";
import { hosted } from "@/lib/backend";
import { supabase } from "@/lib/supabase/client";
import { safeReturnTo } from "@/lib/auth/validation";
import { termsAccepted, termsMetadata } from "@/lib/auth/terms";

// Accounts created with Google never see the signup checkbox, and earlier
// accounts may have accepted an older version. Both agree here before their
// cases or My Inspections open. This reads the shared Supabase session directly
// so it also serves My Inspections when cases use the local backend.
export function AcceptTerms() {
  const router = useRouter(),
    search = useSearchParams(),
    { signOut } = useAuth();
  const returnTo = safeReturnTo(search.get("returnTo"));
  const destination = returnTo ?? "/case/new";
  const [ready, setReady] = useState(false),
    [agreed, setAgreed] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const signIn =
      returnTo === "/inspections"
        ? "/inspections"
        : `/login${returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : ""}`;
    if (!supabase) {
      router.replace(signIn);
      return;
    }
    let alive = true;
    void supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      const user = data.session?.user;
      if (error) {
        setError(
          "We couldn't reach your account. Check your connection and try again.",
        );
        setReady(true);
      } else if (!user) router.replace(signIn);
      else if (termsAccepted(user.user_metadata)) router.replace(destination);
      else setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [router, returnTo, destination]);
  async function accept(event: FormEvent) {
    event.preventDefault();
    if (!agreed || !supabase || busy) return;
    setBusy(true);
    setError("");
    const { error } = await supabase.auth.updateUser({
      data: termsMetadata(),
    });
    if (error) {
      setError(
        "We couldn't save your agreement. Check your connection and try again.",
      );
      setBusy(false);
      return;
    }
    router.replace(destination);
  }
  async function decline() {
    setBusy(true);
    try {
      if (hosted) await signOut();
      else {
        await supabase?.auth.signOut({ scope: "local" });
        router.replace(returnTo === "/inspections" ? "/inspections" : "/login");
      }
    } catch {
      setError("We couldn't sign you out. Try again.");
      setBusy(false);
    }
  }
  if (!ready)
    return (
      <main className="protected-screen">
        <div className="auth-status-icon">
          <ShieldCheck aria-hidden="true" />
        </div>
        <h1>Opening your account…</h1>
        <LoaderCircle className="spin" aria-label="Opening your account" />
      </main>
    );
  return (
    <AuthFrame
      title="One more step."
      description="Agree to the Terms of Service and Privacy Policy to open your account."
    >
      <form
        className="auth-form"
        noValidate
        aria-busy={busy}
        onSubmit={(e) => void accept(e)}
      >
        <FormError message={error} />
        <label className="auth-consent" htmlFor="terms">
          <input
            id="terms"
            name="terms"
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <span>
            <TermsAgreementText />
          </span>
        </label>
        <SubmitButton busy={busy} loading="Saving…" disabled={!agreed}>
          Continue <ArrowRight size={18} aria-hidden="true" />
        </SubmitButton>
      </form>
      <p className="auth-switch">
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => void decline()}
        >
          Not now, sign out
        </Button>
      </p>
    </AuthFrame>
  );
}
