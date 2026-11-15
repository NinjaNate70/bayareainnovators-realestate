"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  FileSearch,
  LoaderCircle,
  FolderOpen,
  Clock3,
} from "lucide-react";
import { Shell, ActionBar } from "@/components/shell";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  ChargeDetails,
  SourceChip,
  VerdictChip,
  verdicts,
} from "@/components/evidence";
import { money, readCase, saveCase } from "@/lib/cases";
import type { RentalCase, CaseTab, Verdict } from "@/types/case";
import { CountdownBadge, OwedCard } from "@/components/owed-card";
import { LetterTab } from "@/components/letter-tab";
import { PhotosTab } from "@/components/photos-tab";
import { RepliesTab } from "@/components/replies-tab";

export function CaseFile({ id }: { id: string }) {
  const search = useSearchParams();
  const requested = search.get("tab");
  const tab: CaseTab =
    requested === "photos" || requested === "letter" || requested === "replies"
      ? requested
      : "audit";
  const [data, setData] = useState<RentalCase | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const current = useRef<RentalCase | null>(null);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(async () => {
      if (!active) return;
      try {
        const loaded = await readCase(id);
        if (!active) return;
        current.current = loaded;
        setData(loaded);
        setError("");
      } catch {
        setError(
          "We could not read this saved case. Browser storage may be unavailable or the record may be damaged.",
        );
      } finally {
        setLoading(false);
      }
    });
    return () => {
      active = false;
    };
  }, [id, retry]);
  function update(
    changes:
      Partial<RentalCase> | ((previous: RentalCase) => Partial<RentalCase>),
  ) {
    const previous = current.current;
    if (!previous) return;
    const next = {
      ...previous,
      ...(typeof changes === "function" ? changes(previous) : changes),
    };
    current.current = next;
    setData(next);
    void saveCase(next)
      .then(() => setError(""))
      .catch(() => {
        setError(
          "Your edits are on this page but could not be saved. Keep this tab open and retry.",
        );
      });
  }
  if (loading)
    return (
      <Shell caseId={id} tab={tab}>
        <div role="status" className="loading-state">
          <LoaderCircle className="spin" /> Opening your case file…
        </div>
      </Shell>
    );
  if (!data)
    return (
      <Shell>
        <div className="empty-block">
          <FolderOpen size={36} aria-hidden="true" />
          <h1>
            {error
              ? "Your saved case is unavailable"
              : "We couldn’t find that case."}
          </h1>
          <p>
            {error ||
              "Cases are stored in the browser where you created them. You can start a case or explore the example."}
          </p>
          <div className="split-row wrap">
            <Button asChild>
              <Link href="/case/new">Start a case</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/case/demo">Open demo case</Link>
            </Button>
            {error && (
              <Button variant="outline" onClick={() => setRetry((n) => n + 1)}>
                Try again
              </Button>
            )}
          </div>
        </div>
      </Shell>
    );
  return (
    <Shell caseId={id} tab={tab}>
      <div className="case-back">
        <Link href="/" className="text-link">
          <ArrowLeft size={16} aria-hidden="true" />
          Home
        </Link>
        <span>/</span>
        <span>Case file</span>
      </div>
      <div className="page-heading">
        <div>
          <div
            className="split-row wrap"
            style={{ justifyContent: "flex-start", gap: 10 }}
          >
            <p className="eyebrow" style={{ margin: 0 }}>
              YOUR DEPOSIT, IN FOCUS
            </p>
            {data.demo && <span className="badge">DEMO CASE</span>}
          </div>
          <h1>{data.address.split(",")[0] || "Your rental case"}</h1>
          <p>
            {data.address.split(",").slice(1).join(",").trim() ||
              "California rental"}{" "}
            ·{" "}
            {data.moveOut
              ? `Moved out ${data.moveOut}`
              : "Move-out date unconfirmed"}
          </p>
        </div>
        <Button asChild variant="outline">
          <Link href={`/case/new?edit=${data.id}`}>Edit evidence</Link>
        </Button>
      </div>
      {data.demo && (
        <div className="demo-banner">
          <span className="demo-dot" />
          <span>
            Illustrative example · prewritten findings and rule topics, not live
            legal analysis.
          </span>
        </div>
      )}
      {error && (
        <div role="alert" className="notice">
          <p>{error}</p>
          <Button variant="outline" onClick={() => update({})}>
            Retry save
          </Button>
        </div>
      )}
      {data.stale && (
        <div className="notice">
          <strong>Needs review</strong>
          <p>
            Your evidence changed. Review the details before relying on the
            earlier analysis.
          </p>
          <Button asChild variant="outline">
            <Link href={`/case/new?step=review&edit=${id}`}>
              Review and run audit
            </Link>
          </Button>
        </div>
      )}
      {tab === "audit" ? (
        <AuditTab data={data} />
      ) : tab === "letter" ? (
        <LetterTab data={data} onUpdate={update} />
      ) : tab === "photos" ? (
        <PhotosTab data={data} onUpdate={update} />
      ) : (
        <RepliesTab data={data} onUpdate={update} />
      )}
    </Shell>
  );
}

export function AuditTab({ data }: { data: RentalCase }) {
  const [filter, setFilter] = useState<Verdict | "all">("all");
  const reviewed = data.stale
    ? data.charges.map((charge) => ({
        ...charge,
        verdict: "info" as const,
        low: 0,
        high: 0,
        reason:
          "Evidence changed. Review the updated case before relying on the earlier finding.",
      }))
    : data.charges;
  const visible = reviewed.filter(
    (c) => filter === "all" || c.verdict === filter,
  );
  if (!data.audited)
    return (
      <div className="empty-block">
        <FileSearch size={36} aria-hidden="true" />
        <h2>Your case is ready to review.</h2>
        <p>
          Confirm your details and run the audit to see your charge-by-charge
          summary.
        </p>
        <Button asChild>
          <Link href={`/case/new?edit=${data.id}&step=review`}>
            Review case
          </Link>
        </Button>
      </div>
    );
  return (
    <>
      <div className="case-summary">
        <OwedCard data={data} />
        <Card className="metrics-card">
          <div>
            <span className="metric-label">DEPOSIT PAID</span>
            <strong className="metric-value numeral">
              {money(data.deposit)}
            </strong>
          </div>
          <div>
            <span className="metric-label">TOTAL DEDUCTED</span>
            <strong className="metric-value numeral">
              {money(data.charges.reduce((n, c) => n + c.amount, 0))}
            </strong>
          </div>
          <div className="metric-wide">
            {data.demo && (
              <CountdownBadge
                date="2026-11-21"
                label="21-day accounting example (demo)"
              />
            )}
            <span className="small muted">
              <Clock3 size={16} aria-hidden="true" /> Accounting deadline:
              confirm with reviewed CA rules
            </span>
          </div>
        </Card>
      </div>
      <div className="section-title split-row wrap">
        <div>
          <h2>Your charge-by-charge audit</h2>
          <p>Clear explanations. The evidence behind each one.</p>
        </div>
        <span className="small muted">
          {data.charges.length} itemized charges
        </span>
      </div>
      <div className="filters" aria-label="Filter charges">
        <button
          className="filter-button"
          aria-pressed={filter === "all"}
          onClick={() => setFilter("all")}
        >
          All charges<span className="filter-count">{data.charges.length}</span>
        </button>
        {(Object.keys(verdicts) as Verdict[]).map((v) => (
          <button
            key={v}
            className="filter-button"
            aria-pressed={filter === v}
            onClick={() => setFilter(v)}
          >
            {verdicts[v].label}
            <span className="filter-count">
              {reviewed.filter((c) => c.verdict === v).length}
            </span>
          </button>
        ))}
      </div>
      <p className="sr-only" role="status">
        Showing {visible.length} charges
      </p>
      <div className="charge-list">
        {visible.map((charge, i) => (
          <Card key={charge.id} className="charge-card">
            <div className="charge-top">
              <div className="charge-name">
                <span className="charge-number">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3>{charge.name}</h3>
                  <span className="small muted">
                    {charge.room} · {charge.id}
                  </span>
                </div>
              </div>
              <strong className="charge-price numeral">
                {money(charge.amount)}
              </strong>
            </div>
            <VerdictChip verdict={charge.verdict} />
            <p>{charge.reason}</p>
            <div className="charge-bottom">
              <div className="source-list">
                {charge.sources.map((source) => (
                  <SourceChip key={source} id={source} data={data} />
                ))}
                {!charge.sources.length && (
                  <span className="small muted">
                    Add source evidence to review this charge.
                  </span>
                )}
              </div>
              <ChargeDetails charge={charge} data={data} />
            </div>
          </Card>
        ))}
      </div>
      {!visible.length && (
        <div className="empty-block">
          <h3>No charges match this verdict.</h3>
          <Button variant="outline" onClick={() => setFilter("all")}>
            Clear filter
          </Button>
        </div>
      )}
      <ActionBar>
        <Button asChild>
          <Link href={`/case/${data.id}?tab=letter`}>
            Draft demand letter
            <ArrowRight size={18} aria-hidden="true" />
          </Link>
        </Button>
      </ActionBar>
    </>
  );
}
