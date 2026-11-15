"use client";
import { useRef, useState } from "react";
import {
  MessageSquareText,
  Sparkles,
  Copy,
  FileText,
  ArrowRight,
  LoaderCircle,
  Quote,
} from "lucide-react";
import type { RentalCase } from "@/types/case";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Sheet } from "@/components/ui/sheet";
import { ActionBar } from "@/components/shell";
import { FileDrop } from "@/components/file-drop";
import { SourceChip } from "@/components/evidence";
import { estimateRecovery } from "@/lib/estimate";
import { hosted } from "@/lib/backend";

export function RepliesTab({
  data,
  onUpdate,
}: {
  data: RentalCase;
  onUpdate: (changes: Partial<RentalCase>) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const input = useRef<HTMLTextAreaElement>(null);
  const estimate = estimateRecovery(data);
  const sourceIds = Array.from(
    new Set(estimate?.included.flatMap((c) => c.sources) ?? []),
  );
  async function prepare() {
    if (!data.incoming.trim()) {
      setError("Add the landlord’s response before preparing a reply.");
      input.current?.focus();
      return;
    }
    setError("");
    setBusy(true);
    try {
      // TODO(api): Send the reviewed landlord response and case evidence to the reply service, requiring response/rule/photo citations.
      await Promise.resolve();
      const text = `Dear ${data.landlord || "Property Manager"},\n\nThank you for your response. I understand your message to say:\n“${data.incoming.trim().slice(0, 1000)}${data.incoming.length > 1000 ? "…" : ""}” [R01]\n\nI would like to clarify the deductions for ${data.address}. ${estimate ? `My request concerns ${estimate.included.map((c) => c.name.toLowerCase()).join(", ")}. Please review the supporting records referenced in my earlier letter. [${sourceIds.join(", ")}]` : "Please share the itemized records and supporting evidence for the deductions so I can review them."}\n\nCould you provide the relevant receipts, dates of work, and any move-in and move-out records that support those charges? I am happy to review the evidence together to resolve this fairly.\n\nThank you,\n${data.renter || "[Your name]"}${data.demo ? "\n\nDEMO TEMPLATE: Review all example references before using." : ""}`;
      onUpdate({ reply: text });
      setStatus(
        "Reply template prepared. Review the quoted response and edit the draft.",
      );
    } catch {
      setError(
        "We could not prepare a reply. Your response and previous draft are still here. Try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(data.reply);
      setStatus("Reply copied. You choose how and when to send it.");
      setError("");
    } catch {
      setError(
        "Copy is unavailable. Select the reply text and copy it manually.",
      );
    }
  }
  return (
    <>
      <div className="section-title">
        <h2>Keep the conversation moving.</h2>
        <p>Bring their response. Leave with a thoughtful next step.</p>
      </div>
      {error && (
        <div role="alert" className="notice">
          {error}
        </div>
      )}
      <div className="reply-layout">
        <div className="stack">
          <Card>
            <div className="split-row">
              <h3>
                <MessageSquareText size={21} aria-hidden="true" /> Their
                response
              </h3>
              <span className="badge">R01</span>
            </div>
            <p className="small muted">
              Paste the message exactly as received. This becomes a source in
              your reply.
            </p>
            {/* Kept above the text box so it is on screen without scrolling. */}
            {data.reply ? (
              <Button
                variant="outline"
                style={{ margin: "4px 0 16px" }}
                onClick={() => {
                  if (
                    window.confirm(
                      "Replace your edited reply with a new template?",
                    )
                  )
                    void prepare();
                }}
                disabled={busy}
              >
                Prepare a new draft
              </Button>
            ) : (
              <Button
                style={{ margin: "4px 0 16px" }}
                disabled={busy || data.stale}
                onClick={() => void prepare()}
              >
                {busy ? (
                  <LoaderCircle
                    className="spin"
                    size={18}
                    aria-hidden="true"
                  />
                ) : (
                  <Sparkles size={18} aria-hidden="true" />
                )}
                {busy ? "Preparing…" : "Prepare reply"}
                <ArrowRight size={18} aria-hidden="true" />
              </Button>
            )}
            <label htmlFor="incoming" className="field-label">
              Landlord response
            </label>
            <textarea
              ref={input}
              id="incoming"
              rows={8}
              placeholder="Paste their email or message here…"
              value={data.incoming}
              onChange={(e) => {
                onUpdate({ incoming: e.target.value, reply: "" });
                setStatus(
                  "Response changed. Prepare a new reply to use this version.",
                );
              }}
              aria-invalid={!!error && !data.incoming.trim()}
              aria-describedby="response-hint"
            />
            <p id="response-hint" className="field-hint">
              Saved in {hosted ? "your account" : "this browser"}. Changing the
              response clears the earlier
              suggestion.
            </p>
            <div style={{ marginTop: 20 }}>
              <FileDrop
                label="Or import a text file (.txt, up to 1MB)"
                accept="text/plain,.txt"
                hint=".txt only · up to 1MB"
                onFiles={async ([file]) => {
                  if (
                    !file.name.toLowerCase().endsWith(".txt") ||
                    file.size > 1024 * 1024
                  ) {
                    setError(
                      "Choose a .txt response under 1MB. For PDFs or images, paste the response text above.",
                    );
                    return;
                  }
                  try {
                    onUpdate({ incoming: await file.text(), reply: "" });
                    setStatus(
                      "Text imported. Review it before preparing a reply.",
                    );
                    setError("");
                  } catch {
                    setError(
                      "The file could not be read. Paste the text instead.",
                    );
                  }
                }}
              />
            </div>
          </Card>
          <Card className="reply-guidance">
            <Quote size={24} aria-hidden="true" />
            <h3>Calm, clear, and specific.</h3>
            <p>
              Ask for records, refer to your evidence, and give the other person
              room to respond.
            </p>
            <p className="small muted">
              This MVP prepares a local template. It does not interpret the
              message with live AI or send anything.
            </p>
          </Card>
        </div>
        <Card className="suggested-reply">
          <div className="split-row wrap">
            <h3>
              <FileText size={21} aria-hidden="true" /> Your reply draft
            </h3>
            <span className="badge">EDITABLE</span>
          </div>
          {!data.reply ? (
            <div className="empty-letter">
              <MessageSquareText size={38} aria-hidden="true" />
              <h3>A considered response starts here.</h3>
              <p>
                Add their message, then prepare a reply that keeps the
                conversation focused on evidence.
              </p>
            </div>
          ) : (
            <>
              <label htmlFor="reply-draft" className="sr-only">
                Edit suggested reply
              </label>
              <textarea
                id="reply-draft"
                className="letter-text"
                rows={18}
                value={data.reply}
                onChange={(e) => onUpdate({ reply: e.target.value })}
              />
              <div className="source-list">
                <Sheet
                  title="Landlord response · R01"
                  description="Verbatim response you supplied"
                  trigger={
                    <button className="source-chip">
                      <MessageSquareText size={16} aria-hidden="true" />
                      R01 · Response
                    </button>
                  }
                >
                  <p style={{ whiteSpace: "pre-wrap" }}>{data.incoming}</p>
                </Sheet>
                {sourceIds.map((id) => (
                  <SourceChip key={id} id={id} data={data} />
                ))}
              </div>
              <p className="field-hint">
                References connect this template to the response and case
                evidence. Review them before sending.
              </p>
            </>
          )}
          {busy && (
            <p role="status">
              <LoaderCircle className="spin" size={18} /> Preparing reply…
            </p>
          )}
        </Card>
      </div>
      <p className="small muted" role="status" style={{ marginTop: 16 }}>
        {status}
      </p>
      {data.reply && (
        <ActionBar>
          <Button onClick={copy}>
            <Copy size={18} aria-hidden="true" />
            Copy reply
          </Button>
        </ActionBar>
      )}
    </>
  );
}
