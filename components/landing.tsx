"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ShieldCheck,
  FileUp,
  ScanSearch,
  FilePenLine,
  FolderOpen,
  BookOpen,
  CircleCheck,
  Check,
  FileText,
  Scale,
} from "lucide-react";
import { Shell, ActionBar } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SourceChip, VerdictChip } from "@/components/evidence";
import { demoCase } from "@/lib/fixtures/demo-case";
import { flushCases, money, unwrap } from "@/lib/cases";
import { useAuth } from "@/components/auth/provider";
import { getBackend, hosted } from "@/lib/backend";
import { fromRow } from "@/lib/db/mapping";
import type { RentalCase } from "@/types/case";

export function Landing() {
  const ownerId = useAuth().session?.user.id;
  const [workspace, setWorkspace] = useState<{
    ownerId: string;
    cases: RentalCase[];
    error: string;
  } | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const current = workspace?.ownerId === ownerId ? workspace : null;
  useEffect(() => {
    if (!ownerId) return;
    let active = true;
    async function loadCases(userId: string) {
      try {
        const cases = unwrap(await getBackend().data.listCases()).map(fromRow);
        if (active) setWorkspace({ ownerId: userId, cases, error: "" });
      } catch {
        if (active) setWorkspace({ ownerId: userId, cases: [], error: "We couldn’t load your saved cases." });
      }
    }
    void loadCases(ownerId);
    return () => {
      active = false;
    };
  }, [ownerId]);

  async function removeCase(id: string, name: string) {
    if (!current || deleting || !window.confirm(`Delete “${name}” and its saved files? This can’t be undone.`)) return;
    setDeleting(id);
    setWorkspace({ ...current, error: "" });
    try {
      await flushCases();
      const result = await getBackend().data.deleteCase(id);
      if (result.error && result.error.code !== "not_found") unwrap(result);
      setWorkspace((value) => value?.ownerId === current.ownerId
        ? { ...value, cases: value.cases.filter((saved) => saved.id !== id) }
        : value);
    } catch (error) {
      setWorkspace((value) => value?.ownerId === current.ownerId
        ? { ...value, error: error instanceof Error ? error.message : "We couldn’t delete this case. Try again." }
        : value);
    } finally {
      setDeleting(null);
    }
  }
  return (
    <Shell>
      <div className="landing-heading">
        <p className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</p>
        <h2>A little clarity. A lot more confidence.</h2>
      </div>
      <section className="landing-hero">
        <div className="landing-hero-copy">
          <span className="hero-overline">
            <ShieldCheck size={17} aria-hidden="true" />
            BUILT FOR CALIFORNIA RENTERS
          </span>
          <h1>
            Your deposit deserves
            <br /> a <span>fair return.</span>
          </h1>
          <p>
            Make sense of deductions. Bring your evidence together. Take your
            next step with a clear, considered letter.
          </p>
          <div className="hero-actions">
            <Button asChild className="desktop-start">
              <Link href="/case/new">
                Start your case
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/case/demo">
                Explore the example
                <ArrowUpRight size={17} aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/inspections">My Inspections</Link>
            </Button>
          </div>
          <div className="hero-assurance">
            <span>
              <Check size={15} aria-hidden="true" />
              Tenant-first, but fair
            </span>
            <span>
              <Check size={15} aria-hidden="true" />
              Evidence with every finding
            </span>
          </div>
        </div>
        <div className="hero-case-preview">
          <div className="preview-top">
            <span className="mini-document">
              <FileText size={21} aria-hidden="true" />
            </span>
            <div>
              <strong>Cedar Street</strong>
              <span>AN ILLUSTRATIVE CASE</span>
            </div>
            <span className="badge">6 CHARGES</span>
          </div>
          <div className="preview-range">
            <p>A second look can make a difference.</p>
            <strong className="numeral">
              $650<span>–</span>$900
            </strong>
            <span>Example disputed range · not a guarantee</span>
          </div>
          <div className="preview-charge">
            <div>
              <span>Full bedroom repaint</span>
              <strong>$400</strong>
            </div>
            <VerdictChip verdict="not-allowed" />
            <div className="source-list">
              <SourceChip id="CA-R01" data={demoCase} />
              <SourceChip id="P01" data={demoCase} />
            </div>
          </div>
          <div className="preview-footer">
            <ShieldCheck size={16} aria-hidden="true" />
            Every charge has a story. See the evidence.
          </div>
        </div>
      </section>
      <section className="landing-section">
        <div className="section-title">
          <p className="eyebrow">FROM OVERWHELMED TO ORGANIZED</p>
          <h2>One case. A clearer way forward.</h2>
          <p>You bring the documents. We help you see the full picture.</p>
        </div>
        <div className="journey-grid">
          {[
            {
              icon: FileUp,
              title: "Bring your evidence",
              text: "Add your deduction letter, lease, and optional move-in and move-out photos.",
              number: "01",
            },
            {
              icon: ScanSearch,
              title: "Understand each charge",
              text: "Review the verdict, the explanation, and the records behind every deduction.",
              number: "02",
            },
            {
              icon: FilePenLine,
              title: "Find your next words",
              text: "Edit a demand letter, choose a reply date, and prepare a thoughtful response.",
              number: "03",
            },
          ].map(({ icon: Icon, title, text, number }) => (
            <Card key={title} className="journey-card">
              <div className="split-row">
                <span className="journey-icon">
                  <Icon size={25} aria-hidden="true" />
                </span>
                <span className="journey-number">{number}</span>
              </div>
              <h3>{title}</h3>
              <p>{text}</p>
            </Card>
          ))}
        </div>
      </section>
      <section className="landing-section">
        <div className="section-title split-row wrap">
          <div>
            <h2>Your workspace</h2>
            <p>
              Keep the details together, so you can focus on what comes next.
            </p>
          </div>
          <Button asChild variant="ghost">
            <Link href="/case/new">
              New case
              <ArrowRight size={16} aria-hidden="true" />
            </Link>
          </Button>
        </div>
        {current?.error && (
          <p role="alert" className="notice">
            {current.error}
          </p>
        )}
        {ownerId && !current ? (
          <p role="status">Loading your saved cases…</p>
        ) : current?.cases.length ? (
          <ul className="workspace-case-list stack">
            {current.cases.map((saved) => {
              const name = saved.address || "Your draft case";
              return (
                <li className="workspace-case-row" key={saved.id}>
                  <Link
                    className="recent-case-card"
                    href={saved.audited ? `/case/${saved.id}` : `/case/new?edit=${saved.id}`}
                  >
                    <span className="journey-icon">
                      <FolderOpen size={25} aria-hidden="true" />
                    </span>
                    <div>
                      <strong>{name}</strong>
                      <span className="small muted">
                        {saved.demo ? "Example case" : hosted ? "Saved to your account" : "Saved in this browser"}
                        {" · "}
                        {saved.audited ? "Ready to review" : "Draft in progress"} · {money(saved.deposit)} deposit
                      </span>
                    </div>
                    <span className="recent-cta">
                      Resume case
                      <ArrowRight size={18} aria-hidden="true" />
                    </span>
                  </Link>
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`Delete case ${name}`}
                    disabled={deleting !== null}
                    onClick={() => void removeCase(saved.id, name)}
                  >
                    {deleting === saved.id ? "Deleting…" : "Delete case"}
                  </Button>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="workspace-empty">
            <FolderOpen size={28} aria-hidden="true" />
            <div>
              <h3>A fresh start for your deposit.</h3>
              <p>Your case will appear here once you get started.</p>
            </div>
            <Button asChild variant="outline">
              <Link href="/case/new">
                Create your first case
                <ArrowRight size={17} aria-hidden="true" />
              </Link>
            </Button>
          </div>
        )}
      </section>
      <section className="fairness-band">
        <div>
          <p className="eyebrow">TENANT-FIRST. EVIDENCE-LED.</p>
          <h2>A fair review goes both ways.</h2>
          <p>
            Some charges are fair. Some deserve another look. We keep both in
            view, and make it clear when more information is needed.
          </p>
        </div>
        <div className="fairness-points">
          <span>
            <CircleCheck size={21} aria-hidden="true" />
            Fair charges stay visible
          </span>
          <span>
            <BookOpen size={21} aria-hidden="true" />
            Sources stay within reach
          </span>
          <span>
            <Scale size={21} aria-hidden="true" />
            You decide what comes next
          </span>
        </div>
      </section>
      <section className="landing-section faq-section">
        <h2>A couple of things to know.</h2>
        <details>
          <summary>Do I need move-in photos?</summary>
          <p>
            No. You can start with your deduction letter and lease. Photos help
            strengthen a case, but missing evidence should be acknowledged,
            never guessed.
          </p>
        </details>
        <details>
          <summary>Is this legal advice?</summary>
          <p>
            No. Tenant Shield organizes evidence and helps prepare drafts. It
            does not guarantee recovery or replace advice from a qualified legal
            professional.
          </p>
        </details>
        <details>
          <summary>What does the hackathon demo do?</summary>
          <p>
            Explore six sample deductions, open the supporting documents,
            compare move-in and move-out images, and practice drafting a letter
            and a reply. The example opens without an account.
          </p>
        </details>
      </section>
      <ActionBar>
        <Button asChild>
          <Link href="/case/new">
            Start your case
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </Button>
      </ActionBar>
    </Shell>
  );
}
