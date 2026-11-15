"use client";
import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  FileText,
  FolderCheck,
  LoaderCircle,
  LockKeyhole,
  ShieldCheck,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { backendName, getBackend, hosted } from "@/lib/backend";
import { oauthEnabled } from "@/lib/auth/terms";
import { Button } from "@/components/ui/button";
import { FormError } from "./form";
export function AuthFrame({
  children,
  title,
  description,
  eyebrow = "YOUR CASE, IN GOOD ORDER",
}: {
  children: ReactNode;
  title: string;
  description: string;
  eyebrow?: string;
}) {
  return (
    <div className="auth-layout">
      <a href="#auth-main" className="skip-link">
        Skip to form
      </a>
      <aside className="auth-story">
        <Link href="/" className="auth-brand">
          <ShieldCheck size={29} aria-hidden="true" />
          <span>
            Tenant<span>Shield</span>
          </span>
        </Link>
        <div className="auth-story-content">
          <span className="auth-story-kicker">A CLEARER PATH FORWARD</span>
          <h2>
            Your evidence.
            <br />
            Your next step.
            <br />
            <span>A fair return.</span>
          </h2>
          <p>
            A place to make sense of your deposit, one clear step at a time.
          </p>
          <div className="auth-story-record">
            <div className="split-row">
              <span className="auth-record-icon">
                <FolderCheck size={23} aria-hidden="true" />
              </span>
              <span className="auth-record-tag">YOUR CASE FILE</span>
            </div>
            <h3>
              From deductions
              <br />
              to a considered response.
            </h3>
            <div className="auth-record-line">
              <FileText size={18} aria-hidden="true" />
              <span>Documents together</span>
              <Check size={17} aria-hidden="true" />
            </div>
            <div className="auth-record-line">
              <ShieldCheck size={18} aria-hidden="true" />
              <span>Evidence in view</span>
              <Check size={17} aria-hidden="true" />
            </div>
            <div className="auth-record-line">
              <ArrowUpRight size={18} aria-hidden="true" />
              <span>A next step you choose</span>
            </div>
          </div>
        </div>
        <p className="auth-story-foot">
          California renters. Tenant-first, but fair.
        </p>
      </aside>
      <section className="auth-form-side">
        <header className="auth-mobile-header">
          <Link href="/" className="brand-lockup">
            <ShieldCheck size={25} aria-hidden="true" />
            Tenant Shield
          </Link>
          <Link className="auth-text-link" href="/">
            Back home
          </Link>
        </header>
        <main id="auth-main" tabIndex={-1} className="auth-main">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="auth-description">{description}</p>
          {children}
          <TrustLine />
        </main>
      </section>
    </div>
  );
}
export function TrustLine() {
  // TODO(legal): confirm wording matches the privacy policy
  return (
    <div className="auth-trust">
      <LockKeyhole size={18} aria-hidden="true" />
      <div>
        <p>
          Your documents stay private. We never share them with your landlord.
        </p>
        <small>
          {hosted
            ? "Your account and files are stored privately in your account."
            : "Local demo: your account and files stay in this browser."}
        </small>
      </div>
    </div>
  );
}
function GoogleLogo() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}
export function OAuthButton({ returnTo }: { returnTo?: string | null }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (!oauthEnabled(backendName, process.env.NEXT_PUBLIC_ENABLE_OAUTH))
    return null;
  async function start() {
    setBusy(true);
    setError("");
    const r = await getBackend().auth.signInWithGoogle(returnTo);
    // On success the browser is already leaving for Google.
    if (r.error) {
      setError(r.error.message);
      setBusy(false);
    }
  }
  return (
    <div className="auth-oauth">
      <Button
        type="button"
        variant="outline"
        className="auth-submit google-button"
        disabled={busy}
        aria-busy={busy}
        onClick={() => void start()}
      >
        {busy ? (
          <LoaderCircle size={20} className="spin" aria-hidden="true" />
        ) : (
          <GoogleLogo />
        )}
        {busy ? "Opening Google…" : "Continue with Google"}
      </Button>
      <FormError message={error} />
      <div className="auth-or" role="separator" aria-label="or">
        <span aria-hidden="true">or</span>
      </div>
    </div>
  );
}
