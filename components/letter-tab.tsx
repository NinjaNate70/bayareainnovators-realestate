"use client";
import { useState } from "react";
import Link from "next/link";
import {
  Copy,
  Download,
  FilePenLine,
  LoaderCircle,
  Printer,
  BookOpen,
  FilePlus2,
} from "lucide-react";
import type { RentalCase } from "@/types/case";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ActionBar } from "@/components/shell";
import { SourceChip } from "@/components/evidence";
import { CountdownBadge } from "@/components/owed-card";
import { estimateRecovery } from "@/lib/estimate";
import { draftLocalLetter } from "@/lib/local-correspondence";
import { plural } from "@/lib/neutral-copy";
import { hosted } from "@/lib/backend";
import { useAuth } from "@/components/auth/provider";

export function LetterTab({
  data,
  onUpdate,
  temporary = false,
}: {
  data: RentalCase;
  temporary?: boolean;
  onUpdate: (changes: Partial<RentalCase>) => void;
}) {
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const estimate = estimateRecovery(data);
  const included = estimate?.included ?? [];
  async function generate() {
    if (data.letter.trim() && !window.confirm("Replace the current letter with a new draft?")) return;
    setBusy(true);
    setError("");
    try {
      await Promise.resolve();
      onUpdate({ letter: draftLocalLetter(data, session?.user.user_metadata.name) });
      setStatus("Draft prepared. Review and edit it before using it.");
    } catch {
      setError(
        "We could not prepare the draft. Your existing text is unchanged. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(data.letter);
      setStatus("Letter copied.");
      setError("");
    } catch {
      setError(
        "Copy was unavailable. Select the letter text and copy it, or download the text file.",
      );
    }
  }
  function download() {
    try {
      const url = URL.createObjectURL(
        new Blob([data.letter], { type: "text/plain;charset=utf-8" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = "tenant-shield-demand-letter.txt";
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus("Text download started.");
    } catch {
      setError("Download could not start. Try Copy text or Print / save PDF.");
    }
  }
  return (
    <>
      <div className="section-title">
        <h2>A clear letter. In your words.</h2>
        <p>
          Your evidence is the starting point. You’re in control of the final
          draft.
        </p>
      </div>
      {error && (
        <div className="notice" role="alert">
          {error}
        </div>
      )}
      <div className="letter-layout no-print">
        <Card className="letter-editor">
          <div className="split-row wrap">
            <div>
              <span className="eyebrow">DEMAND LETTER</span>
              <h3>
                {data.letter ? "Your editable draft" : "Ready when you are"}
              </h3>
            </div>
            <span className="badge">
              {data.demo ? "EXAMPLE TEMPLATE" : "LOCAL DRAFT"}
            </span>
            {data.letter && (
              <Button variant="outline" onClick={() => void generate()} disabled={busy || data.stale}>
                <FilePenLine size={18} aria-hidden="true" />
                {busy ? "Preparing…" : "Regenerate draft"}
              </Button>
            )}
          </div>
          {!data.letter ? (
            <div className="empty-letter">
              <FilePenLine size={38} aria-hidden="true" />
              <h3>Turn your evidence into a next step.</h3>
              <p>
                {estimate
                  ? `${plural(included.length, "charge")} will be included, with the supporting example references.`
                  : "Start with a request for supporting records. No unsupported monetary claim will be included."}
              </p>
              <p className="small muted">
                This draft uses a template. You can review it before sending it yourself.
              </p>
            </div>
          ) : (
            <>
              <label className="sr-only" htmlFor="letter-body">
                Edit demand letter
              </label>
              <textarea
                id="letter-body"
                className="letter-text"
                rows={24}
                value={data.letter}
                onChange={(e) => {
                  onUpdate({ letter: e.target.value });
                  setStatus("Draft updated.");
                }}
              />
              <div className="split-row wrap small muted">
                <span>
                  {temporary ? "Editable · resets on reload" : `Editable · stored in ${hosted ? "your account" : "this browser"}`}
                </span>
                <span>
                  {data.letter.split(/\s+/).filter(Boolean).length} words
                </span>
              </div>
            </>
          )}
          {busy && (
            <p role="status">
              <LoaderCircle size={18} className="spin" /> Preparing your draft…
            </p>
          )}
        </Card>
        <aside className="stack">
          <Card>
            <BookOpen
              size={23}
              aria-hidden="true"
              style={{ color: "var(--green)" }}
            />
            <h3 style={{ marginTop: 12 }}>Keep the evidence close.</h3>
            <p className="small muted">
              Review the source behind each included charge before using the
              letter.
            </p>
            <div className="source-list">
              {Array.from(new Set(included.flatMap((c) => c.sources))).map(
                (id) => (
                  <SourceChip key={id} id={id} data={data} />
                ),
              )}
              {!included.length && (
                <p className="small muted">
                  Your letter will ask for supporting records.
                </p>
              )}
            </div>
          </Card>
          <Card>
            <label htmlFor="reply-by" className="field-label">
              Choose your reply-by date
            </label>
            <input
              id="reply-by"
              type="date"
              value={data.replyBy}
              onChange={(e) => onUpdate({ replyBy: e.target.value })}
            />
            <p className="field-hint">
              A date you request from the landlord. This is separate from any
              statutory deposit deadline. Update the date in your draft if you
              change it here.
            </p>
            <CountdownBadge date={data.replyBy} />
            <p className="small muted" style={{ marginTop: 16 }}>
              Accounting deadline: needs confirmation against the reviewed CA
              rules pack.
            </p>
          </Card>
          {data.letter && (
            <Card>
              <h3>Your next step</h3>
              <p className="small muted">
                Read the whole letter, confirm the dates, and keep a copy. You
                choose how and when to send it.
              </p>
              <div className="stack-sm">
                <Button variant="outline" onClick={copy}>
                  <Copy size={17} aria-hidden="true" />
                  Copy text
                </Button>
                <Button variant="outline" onClick={() => window.print()}>
                  <Printer size={17} aria-hidden="true" />
                  Print / save PDF
                </Button>
              </div>
            </Card>
          )}
        </aside>
      </div>
      <p role="status" className="small muted" style={{ marginTop: 16 }}>
        {status}
      </p>
      <ActionBar>
        {!data.demo && (
          <Button asChild variant="outline">
            <Link href={`/case/new?edit=${data.id}&step=letter`}>
              <FilePlus2 size={18} aria-hidden="true" />
              Add more documents
            </Link>
          </Button>
        )}
        {data.letter ? (
          <Button onClick={download}>
            <Download size={18} aria-hidden="true" />
            Export letter (.txt)
          </Button>
        ) : (
          <Button onClick={() => void generate()} disabled={busy || data.stale}>
            {busy ? "Preparing…" : "Generate draft"}
            <FilePenLine size={18} aria-hidden="true" />
          </Button>
        )}
      </ActionBar>
      <article className="print-letter">{data.letter}</article>
    </>
  );
}
