"use client";
import {
  BookOpen,
  FileText,
  ImageIcon,
  CircleCheck,
  Scale,
  ShieldAlert,
  CircleHelp,
  ExternalLink,
} from "lucide-react";
import type { Charge, RentalCase, Verdict } from "@/types/case";
import { rules } from "@/lib/fixtures/demo-case";
import { Sheet } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { money, getFile } from "@/lib/cases";
import { useEffect, useState } from "react";
import Image from "next/image";

export const verdicts = {
  fair: { label: "Fair", icon: CircleCheck },
  disputable: { label: "Disputable", icon: Scale },
  "not-allowed": { label: "Likely not allowed", icon: ShieldAlert },
  info: { label: "Need more info", icon: CircleHelp },
};
export function VerdictChip({ verdict }: { verdict: Verdict }) {
  const { label, icon: Icon } = verdicts[verdict];
  return (
    <span className={`verdict verdict-${verdict}`}>
      <Icon size={17} aria-hidden="true" />
      {label}
    </span>
  );
}
export function SourceChip({ id, data }: { id: string; data: RentalCase }) {
  const rule = rules[id];
  const file = data.evidence.find((e) => e.id === id);
  const Icon = rule
    ? BookOpen
    : file?.kind === "before" || file?.kind === "after"
      ? ImageIcon
      : FileText;
  return (
    <Sheet
      title={rule ? rule.title : (file?.name ?? id)}
      description={`${id} · ${data.demo ? "Illustrative demo evidence" : "Your case evidence"}`}
      trigger={
        <button className="source-chip">
          <Icon size={15} aria-hidden="true" />
          {id}
          {rule && <span> · {rule.title}</span>}
        </button>
      }
    >
      {rule ? (
        <>
          <p>{rule.description}</p>
          <div className="notice">
            Rule pack verification pending. This example rule ID is not a legal
            citation.
          </div>
          <a
            className="text-link"
            href="https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?sectionNum=1950.5.&lawCode=CIV"
            target="_blank"
            rel="noreferrer"
          >
            Read California Civil Code §1950.5{" "}
            <ExternalLink size={16} aria-hidden="true" />
          </a>
        </>
      ) : file ? (
        <>
          <EvidencePreview data={data} evidenceId={id} />
          {data.demo && !file.url && (
            <div className="fixture-document">
              <p className="eyebrow">ILLUSTRATIVE DOCUMENT · {id}</p>
              <h3>
                {file.kind === "lease"
                  ? "Cedar Street lease"
                  : "Security deposit itemization"}
              </h3>
              {file.kind === "lease" ? (
                <p>
                  Alex Morgan · Cedar Street Property Management
                  <br />
                  Deposit paid: {money(data.deposit)}
                  <br />
                  Property: {data.address}
                </p>
              ) : (
                <>
                  <p>
                    Deposit: {money(data.deposit)} · Returned:{" "}
                    {money(data.returned)}
                  </p>
                  {data.charges.map((c) => (
                    <p className="split-row" key={c.id}>
                      <span>{c.name}</span>
                      <strong>{money(c.amount)}</strong>
                    </p>
                  ))}
                  <p>
                    Fixture includes a $75 key replacement record and $125 oven
                    repair receipt. Other supporting records are missing.
                  </p>
                </>
              )}
            </div>
          )}
        </>
      ) : (
        <p>
          This source is unavailable. Add the original evidence before relying
          on it.
        </p>
      )}
    </Sheet>
  );
}
export function EvidencePreview({
  data,
  evidenceId,
}: {
  data: RentalCase;
  evidenceId: string;
}) {
  const file = data.evidence.find((e) => e.id === evidenceId);
  const [url, setUrl] = useState(file?.url ?? "");
  const [error, setError] = useState("");
  useEffect(() => {
    if (!file || file.url) return;
    let alive = true;
    let objectUrl = "";
    getFile(data.id, file)
      .then((signedUrl) => {
        objectUrl = signedUrl;
        if (alive) setUrl(objectUrl);
      })
      .catch((e) => {
        if (alive) setError(e.message);
      });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [data.id, data.demo, evidenceId, file]);
  return (
    <>
      {error && (
        <p role="alert" className="notice">
          {error}
        </p>
      )}
      {url &&
        (file?.type.startsWith("image/") ? (
          <Image
            unoptimized
            width={800}
            height={600}
            className="evidence-image"
            src={url}
            alt={`${file.name} · ${evidenceId}`}
          />
        ) : (
          <a className="text-link" href={url} target="_blank" rel="noreferrer">
            Open original document <ExternalLink size={16} aria-hidden="true" />
          </a>
        ))}
    </>
  );
}
export function ChargeDetails({
  charge,
  data,
}: {
  charge: Charge;
  data: RentalCase;
}) {
  return (
    <Sheet
      title={charge.name}
      description={`${charge.id} · ${charge.room} · ${money(charge.amount)}`}
      trigger={
        <Button variant="ghost">
          View details <span aria-hidden="true">↗</span>
        </Button>
      }
    >
      <VerdictChip verdict={charge.verdict} />
      <h3>Why this was flagged</h3>
      <p>{charge.reason}</p>
      <div className="source-list">
        {charge.sources.map((id) => (
          <SourceChip key={id} id={id} data={data} />
        ))}
      </div>
      <h3>Included in the estimate</h3>
      <p>
        {charge.high
          ? `${money(charge.low)}–${money(charge.high)} · illustrative, subject to evidence review.`
          : "Not included in the estimated recovery."}
      </p>
      {charge.verdict === "info" && (
        <p>
          Add comparable photos or the repair receipt to clarify this charge.
        </p>
      )}
    </Sheet>
  );
}
