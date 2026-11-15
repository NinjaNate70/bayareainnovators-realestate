"use client";
import {
  ArrowUpRight,
  ShieldCheck,
  Info,
  Clock3,
  ArrowRight,
} from "lucide-react";
import { Sheet } from "@/components/ui/sheet";
import { SourceChip } from "@/components/evidence";
import { estimateRecovery, daysUntil } from "@/lib/estimate";
import { money } from "@/lib/cases";
import type { RentalCase } from "@/types/case";

export function OwedCard({ data }: { data: RentalCase }) {
  const estimate = estimateRecovery(data);
  return (
    <section className="owed-card dark-surface" aria-labelledby="owed-title">
      <div className="owed-top">
        <span className="owed-kicker">
          <span className="owed-icon">
            <ShieldCheck size={18} aria-hidden="true" />
          </span>
          YOUR DEPOSIT DESERVES A SECOND LOOK
        </span>
        <span className="owed-example">
          {data.demo ? "EXAMPLE ESTIMATE" : "CASE REVIEW"}
        </span>
      </div>
      <div className="owed-main">
        <div>
          <h2 id="owed-title">
            {estimate
              ? "You may be owed"
              : data.stale
                ? "Your estimate needs review"
                : "More evidence, more clarity."}
          </h2>
          {estimate ? (
            <p className="owed-amount numeral">
              {money(estimate.low)}
              <span className="range-dash">–</span>
              {money(estimate.high)}
            </p>
          ) : (
            <p className="owed-unavailable">
              {data.stale
                ? "Review your updated evidence before using an amount."
                : "A supported recovery estimate isn’t available yet."}
            </p>
          )}
          <p className="owed-support">
            {estimate
              ? `${estimate.included.length === 1 ? "Across 1 charge" : `Across ${estimate.included.length} charges`} worth a closer look. A range, never a guarantee.`
              : !data.charges.length
                ? "No itemized charges were entered, so there is nothing to estimate yet. Ask your landlord for an itemized statement."
                : data.charges.some((c) => c.requests !== undefined)
                ? "Your evidence was reviewed. No charge is in question on what you’ve added so far; see what each charge still needs below."
                : `${data.charges.length === 1 ? "Your charge is" : "Your charges are"} recorded. A connected evidence review is needed before estimating recovery.`}
          </p>
        </div>
        <div className="owed-seal" aria-hidden="true">
          <ShieldCheck size={56} />
          <span>EVIDENCE FIRST</span>
        </div>
      </div>
      {estimate && (
        <div
          className="source-list owed-evidence"
          aria-label="Estimate source topics"
        >
          {Array.from(
            new Set(estimate.included.flatMap((charge) => charge.sources)),
          )
            .filter((id) => id.startsWith("CA-"))
            .map((id) => (
              <SourceChip key={id} id={id} data={data} />
            ))}
        </div>
      )}
      <div className="owed-bottom">
        <Sheet
          title="How this range is estimated"
          description="Illustrative case calculation · not a promised recovery"
          trigger={
            <button className="owed-method">
              How this is estimated{" "}
              <ArrowUpRight size={17} aria-hidden="true" />
            </button>
          }
        >
          <p>
            Only supported example charges marked Disputable or Likely not
            allowed are included. Fair and Need more info charges are excluded.
          </p>
          {estimate ? (
            estimate.included.map((c) => (
              <div className="estimate-line" key={c.id}>
                <div className="split-row">
                  <strong>{c.name}</strong>
                  <span className="numeral">
                    {money(c.low)}–{money(c.high)}
                  </span>
                </div>
                <p className="small muted">{c.reason}</p>
                <div className="source-list">
                  {c.sources.map((s) => (
                    <SourceChip key={s} id={s} data={data} />
                  ))}
                </div>
              </div>
            ))
          ) : (
            <p className="notice">
              There is no supported estimate for this case yet.
            </p>
          )}
          <p className="small muted">
            Example ranges reflect assumed uncertainty, not an algorithmic
            probability or legal assessment. The range is capped at the
            unreturned deposit. A reviewed rules pack and real evidence are
            required for a real case.
          </p>
        </Sheet>
        <span>
          <Info size={14} aria-hidden="true" />{" "}
          {data.demo
            ? "Illustrative findings · not legal advice"
            : "Evidence review required"}
        </span>
      </div>
    </section>
  );
}
export function CountdownBadge({
  date,
  label = "Your reply-by date",
}: {
  date: string;
  label?: string;
}) {
  const days = daysUntil(date);
  return (
    <div className="countdown-badge">
      <Clock3 size={18} aria-hidden="true" />
      <div>
        <strong>{label}</strong>
        <span>
          {days === null
            ? "Confirm date"
            : `${date} · ${days > 0 ? `${days} days remaining` : days === 0 ? "Today" : "Date passed"}`}
          <span className="small"> · California time</span>
        </span>
      </div>
      <ArrowRight size={16} aria-hidden="true" />
    </div>
  );
}
