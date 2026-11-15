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
import { money } from "@/lib/cases";
import { useAuth } from "@/components/auth/provider";
import { getBackend } from "@/lib/backend";
import { fromRow } from "@/lib/db/mapping";
import type { RentalCase } from "@/types/case";

export function Landing() {
  const {session}=useAuth();
  const [recent, setRecent] = useState<RentalCase | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      try {
        if(!session){setRecent(null);return;}
        const result=await getBackend().data.getMostRecentCase();
        if(result.error)throw new Error(result.error.message);
        if(active)setRecent(result.data?fromRow(result.data):null);
      } catch {
        setError(
          "We couldn’t load your saved case. You can still start a case or explore the demo.",
        );
      }
    });
    return () => {
      active = false;
    };
  }, [session]);
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
              <Link href="/signup">
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
        {error && (
          <p role="alert" className="notice">
            {error}
          </p>
        )}
        {recent ? (
          <Link
            className="recent-case-card"
            href={
              recent.audited
                ? `/case/${recent.id}`
                : `/case/new?edit=${recent.id}`
            }
          >
            <span className="journey-icon">
              <FolderOpen size={25} aria-hidden="true" />
            </span>
            <div>
              <strong>{recent.address || "Your draft case"}</strong>
              <span className="small muted">
                {recent.demo ? "Example case" : "Saved in this browser"} ·{" "}
                {recent.audited ? "Ready to review" : "Draft in progress"} ·{" "}
                {money(recent.deposit)} deposit
              </span>
            </div>
            <span className="recent-cta">
              Resume case
              <ArrowRight size={18} aria-hidden="true" />
            </span>
          </Link>
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
            The complete example uses six prewritten charges and illustrative
            photo comparisons. You can also upload your own evidence and enter
            facts locally. Live extraction, AI review, and verified rule checks
            are future API connections.
          </p>
        </details>
      </section>
      <ActionBar>
        <Button asChild>
          <Link href="/signup">
            Start your case
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </Button>
      </ActionBar>
    </Shell>
  );
}
