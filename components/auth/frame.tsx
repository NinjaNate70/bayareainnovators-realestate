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
        <AuthFooter />
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
export function AuthFooter() {
  return (
    <footer className="auth-footer">
      <Link href="/terms" target="_blank" rel="noreferrer">
        Terms
      </Link>
      <span aria-hidden="true">·</span>
      <Link href="/privacy" target="_blank" rel="noreferrer">
        Privacy
      </Link>
      <span aria-hidden="true">·</span>
      <span>Not legal advice.</span>
    </footer>
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
        className="auth-submit"
        disabled={busy}
        onClick={() => void start()}
      >
        {busy && <LoaderCircle size={19} className="spin" aria-hidden="true" />}
        {busy ? "Opening Google…" : "Continue with Google"}
      </Button>
      <FormError message={error} />
    </div>
  );
}
