"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  ArrowLeft,
  Check,
  CircleHelp,
  Plus,
  Trash2,
  LoaderCircle,
  FileCheck2,
} from "lucide-react";
import { Shell, ActionBar } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { UploadZone } from "@/components/upload-zone";
import {
  auditCase,
  freshCase,
  money,
  readCase,
  readLetter,
  saveCase,
} from "@/lib/cases";
import { getBackend, hosted } from "@/lib/backend";
import { fromRow } from "@/lib/db/mapping";
import { notesUnavailable } from "@/lib/db/supabase";
import { unwrap } from "@/lib/cases";
import { plural } from "@/lib/neutral-copy";
import { MoneyInput } from "@/components/money-input";
import { rememberCase } from "@/lib/auth/drafts";
import type { Evidence, RentalCase } from "@/types/case";

const steps = ["Letter", "Details", "Photos", "Review"];
export function CaseWizard() {
  const router = useRouter();
  const [data, setData] = useState<RentalCase | null>(null);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [invalid, setInvalid] = useState<
    "address" | "charges" | "money" | "dates" | "letter" | null
  >(null);
  const [busy, setBusy] = useState(false);
  const [saveStatus, setSaveStatus] = useState("");
  const [manual, setManual] = useState(false);
  // Reading the uploaded letter to fill in the charges.
  const [reading, setReading] = useState(false);
  const [letterNote, setLetterNote] = useState("");
  const summary = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      try {
        const params = new URLSearchParams(location.search);
        const edit = params.get("edit");
        const recent = unwrap(await getBackend().data.listCases()).find(
          (c) => !c.audited,
        );
        const existing = edit
          ? await readCase(edit)
          : recent
            ? await readCase(recent.id)
            : null;
        if (edit && !existing) throw new Error("This case is unavailable.");
        const value = existing ?? freshCase();
        if (!existing) await saveCase(value);
        if (!active) return;
        setData(value);
        const requested = steps.findIndex(
          (s) => s.toLowerCase() === params.get("step"),
        );
        setStep(requested >= 0 ? Math.min(requested, value.completedStep) : 0);
        setManual(value.charges.length > 0 && !value.demo);
      } catch {
        setError(
          "We could not restore your draft. Your saved records have not been changed. Reload to try again.",
        );
      }
    });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!data) return;
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      try {
        await saveCase(data);
        if (active) setSaveStatus(
            hosted ? "Draft saved to your account" : "Draft saved in this browser",
          );
      } catch {
        if (active)
          setSaveStatus(
            "Draft not saved. Keep this page open and retry when browser storage is available.",
          );
      }
    });
    return () => {
      active = false;
    };
  }, [data]);
  useEffect(() => {
    if (error) summary.current?.focus();
  }, [error]);
  if (!data)
    return (
      <Shell>
        <div className="loading-state" role="status">
          {error ? (
            <>
              <p role="alert">{error}</p>
              <Button onClick={() => location.reload()}>Try again</Button>
            </>
          ) : (
            <>
              <LoaderCircle className="spin" /> Loading your draft…
            </>
          )}
        </div>
      </Shell>
    );
  function patch(value: Partial<RentalCase>) {
    const changesFacts = Object.keys(value).some((key) =>
      [
        "address",
        "renter",
        "landlord",
        "moveOut",
        "received",
        "deposit",
        "returned",
        "charges",
        "evidence",
        "notes",
      ].includes(key),
    );
    setData((d) => {
      const next = d
        ? {
            ...d,
            ...value,
            demo: changesFacts ? false : (value.demo ?? d.demo),
            stale: changesFacts && d.audited ? true : d.stale,
          }
        : d;
      if (next) rememberCase(next);
      return next;
    });
  }
  function navigate(next: number) {
    if (!data) return;
    setStep(next);
    setError("");
    setInvalid(null);
    const url = `/case/new?step=${steps[next].toLowerCase()}${new URLSearchParams(location.search).has("edit") ? `&edit=${data.id}` : ""}`;
    history.replaceState(null, "", url);
    requestAnimationFrame(() => {
      heading.current?.focus();
      window.scrollTo(0, 0);
    });
  }
  // Reads the uploaded letter and fills in what it says. The renter's own
  // entries are kept: only empty details are filled, and the charge list is
  // replaced only when it is empty or the renter asks to read the letter again.
  async function scanLetter(current: RentalCase) {
    setReading(true);
    setError("");
    setLetterNote("");
    try {
      const found = await readLetter(current);
      if (!found.readable) {
        setLetterNote(
          `We couldn’t read itemized charges from your letter. ${found.notes} Enter them below.`,
        );
        return;
      }
      patch({
        demo: false,
        charges: found.charges.map((c) => ({
          id: crypto.randomUUID(),
          name: c.name,
          room: c.room,
          amount: c.amount,
          verdict: "info" as const,
          sources: [],
          low: 0,
          high: 0,
          reason: "Review needed.",
        })),
        address: current.address || found.address,
        landlord: current.landlord || found.landlord,
        renter: current.renter || found.renter,
        moveOut: current.moveOut || found.move_out_date,
        received: current.received || found.letter_date,
        deposit: current.deposit || found.deposit || 0,
        returned: current.returned || found.returned || 0,
      });
      setLetterNote(
        `We read ${found.charges.length} charge${found.charges.length === 1 ? "" : "s"} from your letter and filled in the details we could find. Check every description, amount and date against the letter before you continue. ${found.notes}`,
      );
    } catch (cause) {
      setLetterNote(
        cause instanceof Error
          ? cause.message
          : "We couldn’t read your letter. Enter the charges below.",
      );
    } finally {
      setReading(false);
    }
  }
  const canScan =
    hosted &&
    !!data &&
    !data.demo &&
    data.evidence.some((f) => f.kind === "letter");
  function next() {
    if (!data) return;
    if (
      step === 0 &&
      !manual &&
      !data.evidence.some((f) => f.kind === "letter")
    ) {
      setInvalid("letter");
      setError(
        "Choose a deduction letter, or select “No letter / enter manually” to continue.",
      );
      return;
    }
    if (step === 0 && canScan && !manual && data.charges.length === 0) {
      // Fill in the charges from the letter, then show them for checking.
      const completedStep = Math.max(data.completedStep, 1);
      patch({ completedStep });
      navigate(1);
      void scanLetter({ ...data, completedStep });
      return;
    }
    if (step === 1) {
      if (!data.address.trim() || !data.address.match(/\bCA\b|california/i)) {
        setInvalid("address");
        setError(
          "Enter the California rental address, including CA, in Property address.",
        );
        return;
      }
      // Itemized charges are optional (a landlord may never send a list).
      // An untouched blank row is dropped; any other row must be complete.
      const entered = data.charges.filter((c) => c.name.trim() || c.amount);
      if (
        entered.some(
          (c) => !c.name.trim() || !Number.isFinite(c.amount) || c.amount <= 0,
        )
      ) {
        setInvalid("charges");
        setError(
          "Give each charge a description and an amount greater than zero, or remove it.",
        );
        return;
      }
      if (
        data.deposit < 0 ||
        data.returned < 0 ||
        data.returned > data.deposit
      ) {
        setInvalid("money");
        setError(
          "Check the deposit and returned amount. Returned money cannot exceed the deposit.",
        );
        return;
      }
      if (
        entered.length > 0 &&
        Math.abs(
          data.deposit -
            data.returned -
            entered.reduce((n, c) => n + c.amount, 0),
        ) > 0.01
      ) {
        setInvalid("money");
        setError(
          "The charges must add up to deposit paid minus amount returned. Check the amounts below.",
        );
        return;
      }
      if (data.moveOut && data.received && data.received < data.moveOut) {
        setInvalid("dates");
        setError(
          "Check the received date: this move-out case has a letter dated before move-out.",
        );
        return;
      }
      if (entered.length !== data.charges.length) patch({ charges: entered });
    }
    patch({ completedStep: Math.max(data.completedStep, step + 1) });
    navigate(step + 1);
  }
  async function run() {
    if (!data) return;
    setBusy(true);
    setError("");
    // Without the audit service, charges are recorded and left open.
    const recordedLead =
      data.charges.length === 1
        ? "Your charge is recorded."
        : "Your charges are recorded.";
    const recorded = (reason: string): RentalCase => ({
      ...data,
      audited: true,
      stale: false,
      charges: data.demo
        ? data.charges
        : data.charges.map(({ requests, ...c }) => {
            void requests;
            return {
              ...c,
              verdict: "info" as const,
              sources: data.evidence
                .filter((e) => e.kind === "letter")
                .map((e) => e.id),
              low: 0,
              high: 0,
              reason,
            };
          }),
    });
    try {
      let value: RentalCase;
      // No itemized charges (the landlord may never have sent a list): there
      // is nothing to audit, so the case is saved as reviewed without one.
      if (!data.charges.length) value = { ...data, audited: true, stale: false };
      else if (data.demo || !hosted)
        // Demo findings are never applied to a renter's own uploads.
        value = recorded(
          `${recordedLead} Automated evidence review needs a signed-in account on the hosted service. Add supporting records and review ${data.charges.length === 1 ? "the charge" : "the charges"} before drawing a conclusion.`,
        );
      else
        try {
          value = await auditCase(data);
        } catch (cause) {
          if (!(cause instanceof Error && "code" in cause && cause.code === "setup"))
            throw cause;
          value = recorded(
            `${recordedLead} The automated audit isn’t set up on this site yet. Add supporting records and review ${data.charges.length === 1 ? "the charge" : "the charges"} before drawing a conclusion.`,
          );
        }
      await saveCase(value);
      router.push(`/case/${value.id}`);
    } catch (cause) {
      setError(
        cause instanceof Error && "code" in cause
          ? `${cause.message} Your details are still on this page.`
          : "The case could not be saved. Your details are still on this page. Retry in a moment.",
      );
      setBusy(false);
    }
  }
  // TODO(api): Extract letter/lease fields from saved originals and ask the renter to confirm them before analysis.
  const addFile = (e: Evidence, caseId: string) =>
    setData((d) =>
      d?.id === caseId
        ? {
            ...d,
            demo: false,
            audited: false,
            stale: true,
            evidence: [...d.evidence.filter((file) => file.id !== e.id), e],
          }
        : d,
    );
  const removeFile = (id: string) =>
    patch({ evidence: data.evidence.filter((e) => e.id !== id), demo: false });
  return (
    <Shell draftCaseId={data.id}>
      <div className="page-heading">
        <div>
          <p className="eyebrow">A CLEARER NEXT STEP</p>
          <h1 ref={heading} tabIndex={-1}>
            Let’s put your case together.
          </h1>
          <p>A few details. Your evidence. One organized case.</p>
        </div>
        <Button asChild variant="outline">
          <Link href="/">Save & exit</Link>
        </Button>
      </div>
      <div className="wizard-layout">
        <div>
          <ol className="stepper" aria-label="Case progress">
            {steps.map((label, i) => (
              <li key={label}>
                <button
                  type="button"
                  disabled={i > data.completedStep || busy}
                  onClick={() => navigate(i)}
                  aria-current={step === i ? "step" : undefined}
                >
                  <span className="step-number">
                    {i < step ? <Check size={15} aria-hidden="true" /> : i + 1}
                  </span>
                  {label}
                </button>
              </li>
            ))}
          </ol>
          {error && (
            <div ref={summary} tabIndex={-1} className="notice" role="alert">
              <strong>Fix this to continue</strong>
              <p>{error}</p>
              <a
                className="text-link"
                href={
                  invalid === "address"
                    ? "#address"
                    : invalid === "charges"
                      ? "#charges"
                      : invalid === "money"
                        ? "#deposit"
                        : invalid === "dates"
                          ? "#received"
                          : "#step-content"
                }
              >
                Review {steps[step].toLowerCase()}
              </a>
            </div>
          )}
          <Card id="step-content">
            <p className="eyebrow">STEP {step + 1} OF 4</p>
            <h2>
              {
                [
                  "Start with the deduction letter",
                  "Confirm the details",
                  "Let your photos tell the story",
                  "You’re ready for the next step",
                ][step]
              }
            </h2>
            <p className="muted">
              {
                [
                  "A clear record of what was charged is the best place to start.",
                  "Review extracted facts or enter the details from your letter.",
                  "Optional, but helpful. Add matching views from move-in and move-out.",
                  "Review your evidence and case details before continuing.",
                ][step]
              }
            </p>
            {reading ? (
              <div className="loading-state" role="status" aria-busy="true">
                <LoaderCircle className="spin" size={32} />
                <h3>Reading your letter</h3>
                <p>
                  Finding each charge, the dates and the deposit amounts. This
                  usually takes 10 to 30 seconds. You’ll check everything next.
                </p>
              </div>
            ) : busy ? (
              <div className="loading-state" role="status" aria-busy="true">
                <LoaderCircle className="spin" size={32} />
                <h3>Preparing your case file</h3>
                <p>
                  {data.demo
                    ? "Opening the illustrative audit."
                    : hosted
                      ? "Reading your letter, lease and photos, then checking each charge. This usually takes 20 to 50 seconds. If it can’t finish within a minute, you’ll see why and can try again."
                      : "Saving your confirmed details for review."}
                </p>
              </div>
            ) : (
              <>
                {step === 0 && (
                  <div className="stack">
                    <div className="notice">
                      <strong>Try the complete demo</strong>
                      <p>
                        Use an illustrative six-charge case to explore the full
                        audit, evidence, and letter flow.
                      </p>
                      <Button
                        variant="outline"
                        onClick={async () => {
                          const owned = await getBackend().data.getCase("demo");
                          if (!owned.data) {
                            setError(
                              "The example belongs to the demo account. Sign in with demo@tenantshield.app to explore it.",
                            );
                            return;
                          }
                          const value = fromRow(owned.data);
                          value.audited = false;
                          setData(value);
                          setManual(false);
                          setError("");
                        }}
                      >
                        Use example documents
                      </Button>
                    </div>
                    <UploadZone
                      title="Landlord’s deduction letter"
                      caseId={data.id}
                      kind="letter"
                      files={data.evidence}
                      onAdd={addFile}
                      onRemove={removeFile}
                    />
                    <UploadZone
                      title="Lease (optional)"
                      caseId={data.id}
                      kind="lease"
                      files={data.evidence}
                      onAdd={addFile}
                      onRemove={removeFile}
                    />
                    <UploadZone
                      title="More documents that help your case (optional)"
                      note={
                        hosted
                          ? "Receipts, your move-in checklist, emails or texts with your landlord, repair invoices, cleaning receipts. The audit reads these alongside your letter and lease."
                          : "Receipts, your move-in checklist, emails or texts with your landlord, repair invoices, cleaning receipts."
                      }
                      caseId={data.id}
                      kind="other"
                      files={data.evidence}
                      onAdd={addFile}
                      onRemove={removeFile}
                    />
                    <label className="checkbox-row">
                      <input
                        type="checkbox"
                        checked={manual}
                        onChange={(e) => setManual(e.target.checked)}
                      />
                      No letter / enter manually
                    </label>
                    <p className="small muted">
                      {hosted
                        ? "When you continue, our system reads your letter and lease to find the charges, dates and amounts. You’ll check and correct them on the next step. Tick “No letter / enter manually” to type them yourself instead."
                        : "Automatic extraction is not connected. For your own documents, you’ll enter and confirm charges in the next step."}
                    </p>
                  </div>
                )}
                {step === 1 && (
                  <div className="stack">
                    <div className="fields-grid">
                      <label className="field-full" htmlFor="address">
                        <span className="field-label">
                          Property address (required, California)
                        </span>
                        <input
                          id="address"
                          aria-invalid={invalid === "address"}
                          aria-describedby={
                            invalid === "address" ? "address-error" : undefined
                          }
                          autoComplete="street-address"
                          value={data.address}
                          onChange={(e) => patch({ address: e.target.value })}
                        />
                        {invalid === "address" && (
                          <span id="address-error" className="inline-error">
                            {error}
                          </span>
                        )}
                      </label>
                      <label>
                        <span className="field-label">
                          Your name (optional)
                        </span>
                        <input
                          autoComplete="name"
                          value={data.renter}
                          onChange={(e) => patch({ renter: e.target.value })}
                        />
                      </label>
                      <label>
                        <span className="field-label">
                          Landlord / manager (optional)
                        </span>
                        <input
                          value={data.landlord}
                          onChange={(e) => patch({ landlord: e.target.value })}
                        />
                      </label>
                      <label>
                        <span className="field-label">
                          Move-out date (or leave unknown)
                        </span>
                        <input
                          type="date"
                          value={data.moveOut}
                          onChange={(e) => patch({ moveOut: e.target.value })}
                        />
                      </label>
                      <label>
                        <span className="field-label">
                          Letter received (or leave unknown)
                        </span>
                        <input
                          type="date"
                          value={data.received}
                          id="received"
                          aria-invalid={invalid === "dates"}
                          aria-describedby={
                            invalid === "dates" ? "dates-error" : undefined
                          }
                          onChange={(e) => patch({ received: e.target.value })}
                        />
                        {invalid === "dates" && (
                          <span id="dates-error" className="inline-error">
                            {error}
                          </span>
                        )}
                      </label>
                      <label>
                        <span className="field-label">Deposit paid ($)</span>
                        <MoneyInput
                          value={data.deposit}
                          id="deposit"
                          aria-invalid={invalid === "money"}
                          aria-describedby={
                            invalid === "money" ? "money-error" : undefined
                          }
                          onValueChange={(deposit) => patch({ deposit })}
                        />
                      </label>
                      <label>
                        <span className="field-label">Amount returned ($)</span>
                        <MoneyInput
                          value={data.returned}
                          onValueChange={(returned) => patch({ returned })}
                        />
                      </label>
                    </div>
                    <div id="charges" tabIndex={-1}>
                      <h3>Itemized charges</h3>
                      {letterNote && (
                        <p className="notice" role="status">
                          {letterNote}
                        </p>
                      )}
                      {canScan && (
                        <Button
                          variant="outline"
                          onClick={() => void scanLetter(data)}
                        >
                          {data.charges.length
                            ? "Read the letter again (replaces these charges)"
                            : "Read the charges from my letter"}
                        </Button>
                      )}
                      {invalid === "charges" && (
                        <p className="inline-error">{error}</p>
                      )}
                      {invalid === "money" && (
                        <p id="money-error" className="inline-error">
                          {error}
                        </p>
                      )}
                      <p className="small muted">
                        {data.charges.length
                          ? `From ${data.demo ? "L01 · example letter" : "your deduction letter"}. Confirm each description and amount.`
                          : "Optional. If your landlord didn’t send an itemized list, you can continue without adding any charges."}
                      </p>
                      {data.charges.map((c, i) => (
                        <div className="charge-entry" key={c.id}>
                          <label>
                            Charge {i + 1}
                            <input
                              aria-label={`Charge ${i + 1} description`}
                              value={c.name}
                              onChange={(e) =>
                                patch({
                                  demo: false,
                                  charges: data.charges.map((x, j) =>
                                    j === i
                                      ? { ...x, name: e.target.value }
                                      : x,
                                  ),
                                })
                              }
                            />
                          </label>
                          <label>
                            Amount ($)
                            <MoneyInput
                              aria-label={`Charge ${i + 1} amount`}
                              value={c.amount}
                              onValueChange={(amount) =>
                                patch({
                                  demo: false,
                                  charges: data.charges.map((x, j) =>
                                    j === i ? { ...x, amount } : x,
                                  ),
                                })
                              }
                            />
                          </label>
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`Remove charge ${i + 1}`}
                            onClick={() =>
                              patch({
                                demo: false,
                                charges: data.charges.filter((_, j) => j !== i),
                              })
                            }
                          >
                            <Trash2 size={18} aria-hidden="true" />
                          </button>
                        </div>
                      ))}
                      <Button
                        variant="ghost"
                        onClick={() =>
                          patch({
                            demo: false,
                            charges: [
                              ...data.charges,
                              {
                                id: crypto.randomUUID(),
                                name: "",
                                room: "Unspecified",
                                amount: 0,
                                verdict: "info",
                                sources: [],
                                low: 0,
                                high: 0,
                                reason: "Review needed.",
                              },
                            ],
                          })
                        }
                      >
                        <Plus size={18} aria-hidden="true" />
                        Add charge
                      </Button>
                    </div>
                    <label className="field-full notes-field" htmlFor="situation">
                      <span className="field-label">
                        Anything else about your situation? (optional)
                      </span>
                      <span id="situation-hint" className="small muted">
                        Explain what the documents don’t show. For example:
                        roommates and who paid the deposit, anything you agreed
                        with your landlord, repairs you asked for, or the
                        condition at move-in.
                        {hosted
                          ? " The audit and the assistant take this into account as your own account of events."
                          : ""}
                      </span>
                      <textarea
                        id="situation"
                        rows={5}
                        maxLength={4000}
                        aria-describedby="situation-hint situation-count"
                        value={data.notes ?? ""}
                        onChange={(e) => patch({ notes: e.target.value })}
                      />
                      <span id="situation-count" className="small muted">
                        {(data.notes ?? "").length.toLocaleString()} of 4,000
                        characters
                      </span>
                      {hosted && !!data.notes && notesUnavailable() && (
                        <span className="inline-error" role="status">
                          These notes can’t be saved yet. Your project admin
                          needs to run the case situation migration in Supabase.
                          The rest of your case is saved.
                        </span>
                      )}
                    </label>
                  </div>
                )}
                {step === 2 && (
                  <div className="stack">
                    <div className="notice">
                      No photos? You can still organize and review your document
                      evidence.
                    </div>
                    <UploadZone
                      title="Move-in photos (optional)"
                      caseId={data.id}
                      kind="before"
                      files={data.evidence}
                      onAdd={addFile}
                      onRemove={removeFile}
                    />
                    <UploadZone
                      title="Move-out photos (optional)"
                      caseId={data.id}
                      kind="after"
                      files={data.evidence}
                      onAdd={addFile}
                      onRemove={removeFile}
                    />
                    <p className="small muted">
                      Pair matching views in the Photos tab after creating your
                      case.
                    </p>
                  </div>
                )}
                {step === 3 && (
                  <div>
                    <div className="review-item split-row">
                      <div>
                        <strong>{data.address}</strong>
                        <p className="small muted">
                          {data.moveOut
                            ? `Moved out ${data.moveOut}`
                            : "Move-out date unknown"}
                        </p>
                      </div>
                      <Button variant="ghost" onClick={() => navigate(1)}>
                        Edit details
                      </Button>
                    </div>
                    <div className="review-item split-row">
                      <div>
                        <strong>
                          {data.charges.length
                            ? `${plural(data.charges.length, "charge")} · ${money(
                                data.charges.reduce((n, c) => n + c.amount, 0),
                              )}`
                            : "No charges entered yet"}
                        </strong>
                        <p className="small muted">
                          Deposit {money(data.deposit)} · Returned{" "}
                          {money(data.returned)}
                        </p>
                      </div>
                      <FileCheck2 size={24} aria-hidden="true" />
                    </div>
                    {!!data.notes?.trim() && (
                      <div className="review-item split-row">
                        <div>
                          <strong>Your notes</strong>
                          <p className="small muted break-text">
                            {data.notes.trim().slice(0, 240)}
                            {data.notes.trim().length > 240 ? "…" : ""}
                          </p>
                        </div>
                        <Button variant="ghost" onClick={() => navigate(1)}>
                          Edit notes
                        </Button>
                      </div>
                    )}
                    <div className="review-item">
                      <strong>{plural(data.evidence.length, "evidence file")}</strong>
                      <ul>
                        {data.evidence.map((f) => (
                          <li key={f.id}>{f.name}</li>
                        ))}
                      </ul>
                      <Button variant="ghost" onClick={() => navigate(2)}>
                        Edit photos
                      </Button>
                    </div>
                    <div className="notice">
                      <strong>
                        {data.demo
                          ? "Illustrative demo audit"
                          : "Your case, ready for review"}
                      </strong>
                      <p>
                        {data.demo
                          ? "This example includes prewritten findings and illustrative rule references. No live AI analysis is performed."
                          : !data.charges.length
                            ? "No itemized charges were entered, so there is no charge-by-charge audit. Your case will be saved with your documents and photos, and you can add charges later if your landlord sends a list. The result is information, not legal advice."
                            : hosted
                            ? "Our system reads your deduction letter, lease, other documents, photos and case details to build your audit, and each charge is checked against the California Courts deposit guide. It can take up to a minute. The result is information, not legal advice."
                            : "Your documents stay in this browser. Live analysis is not connected, so your charges will be marked Need more info. No legal conclusions will be generated."}
                      </p>
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>
          <p className="small muted" role="status" style={{ marginTop: 16 }}>
            {saveStatus} · Not legal advice.
          </p>
          <ActionBar>
            {step > 0 && (
              <Button
                variant="outline"
                disabled={busy || reading}
                onClick={() => navigate(step - 1)}
              >
                <ArrowLeft size={18} aria-hidden="true" />
                Back
              </Button>
            )}
            <Button
              disabled={busy || reading}
              onClick={() => (step === 3 ? void run() : next())}
            >
              {busy
                ? step === 3 && hosted && !data.demo
                  ? "Reading your evidence…"
                  : "Preparing…"
                : step === 3
                  ? data.charges.length
                    ? "Run audit"
                    : "Save case"
                  : step === 2
                    ? "Continue to review"
                    : "Continue"}
              {!busy && <ArrowRight size={18} aria-hidden="true" />}
            </Button>
          </ActionBar>
        </div>
        <aside className="card wizard-help">
          <CircleHelp size={24} aria-hidden="true" />
          <h3 style={{ marginTop: 16 }}>You don’t need to know the law.</h3>
          <p>
            Start with what you have. Clear records make it easier to understand
            what happened.
          </p>
          <hr />
          <p>
            We’ll keep fair charges visible and show where more information is
            needed.
          </p>
          <p className="small">
            California · Move-out only
            <br />
            Information, not legal advice.
          </p>
        </aside>
      </div>
    </Shell>
  );
}
