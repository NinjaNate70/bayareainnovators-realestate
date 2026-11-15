"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ChevronDown,
  FolderOpen,
  LoaderCircle,
  LogOut,
  Plus,
  Settings,
} from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useAuth } from "./provider";
import { FormError } from "./form";
import { getBackend, hosted } from "@/lib/backend";
import { flushCases } from "@/lib/cases";
import type { CaseRow } from "@/types/backend";
export function AccountMenu({ compact = false }: { compact?: boolean }) {
  const { session, signOut } = useAuth(),
    [open, setOpen] = useState(false),
    [mode, setMode] = useState<"menu" | "cases">("menu"),
    [cases, setCases] = useState<CaseRow[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const latch = useRef(false);
  useEffect(() => {
    let alive = true;
    if (open && mode === "cases") {
      void getBackend()
        .data.listCases()
        .then((r) => {
          if (alive) {
            setCases(r.data ?? []);
            setError(r.error?.message ?? "");
            setLoading(false);
          }
        });
    }
    return () => {
      alive = false;
    };
  }, [open, mode]);
  if (!session)
    return (
      <Link href="/login" className="auth-text-link">
        Sign in
      </Link>
    );
  const name = session.user.user_metadata.name,
    initials =
      name
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((s) => s[0])
        .join("")
        .toUpperCase() || "TS";
  async function leave() {
    if (latch.current) return;
    latch.current = true;
    setBusy(true);
    setError("");
    try {
      await flushCases();
      await signOut();
      setOpen(false);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "We couldn't sign you out. Keep this tab open and try again.",
      );
    } finally {
      setBusy(false);
      latch.current = false;
    }
  }
  return (
    <Sheet
      title={mode === "cases" ? "My cases" : "Your account"}
      description={
        mode === "cases"
          ? "Your evidence and next steps, together."
          : session.user.email
      }
      open={open}
      onOpenChange={(value) => {
        setOpen(value);
        if (!value) setMode("menu");
      }}
      trigger={
        <button
          type="button"
          className={`account-trigger ${compact ? "compact" : ""}`}
          aria-label={`Open account menu for ${name}`}
        >
          <span className="account-avatar" aria-hidden="true">
            {initials}
          </span>
          {!compact && (
            <>
              <span className="account-name">
                {name}
                <small>My account</small>
              </span>
              <ChevronDown size={17} aria-hidden="true" />
            </>
          )}
        </button>
      }
    >
      <FormError message={error} />
      {mode === "menu" ? (
        <div className="account-menu-items">
          <button
            type="button"
            onClick={() => {
              setLoading(true);
              setMode("cases");
            }}
          >
            <FolderOpen size={20} aria-hidden="true" />
            My cases
            <ArrowRight size={17} aria-hidden="true" />
          </button>
          <Link href="/account" onClick={() => setOpen(false)}>
            <Settings size={20} aria-hidden="true" />
            Account settings
            <ArrowRight size={17} aria-hidden="true" />
          </Link>
          <button type="button" disabled={busy} onClick={() => void leave()}>
            {busy ? (
              <LoaderCircle size={20} className="spin" aria-hidden="true" />
            ) : (
              <LogOut size={20} aria-hidden="true" />
            )}
            {busy ? "Signing out…" : "Sign out"}
          </button>
          <p className="small muted">
            {hosted
              ? "Saved to your account."
              : "Local demo: saved in this browser."}{" "}
            Your files aren’t shared with your landlord.
          </p>
        </div>
      ) : (
        <div className="stack">
          {loading ? (
            <p role="status">
              <LoaderCircle className="spin" size={20} aria-hidden="true" />{" "}
              Opening your cases…
            </p>
          ) : cases.length ? (
            <ul className="account-case-list">
              {cases.map((row) => (
                <li key={row.id}>
                  <Link
                    href={
                      row.audited
                        ? `/case/${row.id}`
                        : `/case/new?edit=${row.id}`
                    }
                    onClick={() => setOpen(false)}
                  >
                    <FolderOpen size={20} aria-hidden="true" />
                    <span>
                      <strong>{row.address || "Your draft case"}</strong>
                      <small>
                        {row.is_demo
                          ? "Illustrative example"
                          : row.audited
                            ? "Ready to review"
                            : "Draft in progress"}
                      </small>
                    </span>
                    <ArrowRight size={18} aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p>No cases yet. Start with your deduction letter.</p>
          )}
          <Button asChild>
            <Link href="/case/new" onClick={() => setOpen(false)}>
              <Plus size={18} aria-hidden="true" />
              Start a case
            </Link>
          </Button>
          <Button variant="ghost" onClick={() => setMode("menu")}>
            Back to account
          </Button>
        </div>
      )}
    </Sheet>
  );
}
