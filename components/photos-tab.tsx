"use client";
import { useState } from "react";
import { Camera, Plus, ArrowLeft, ArrowRight, ScanSearch } from "lucide-react";
import type { RentalCase } from "@/types/case";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ActionBar } from "@/components/shell";
import { SourceChip, EvidencePreview } from "@/components/evidence";
import { UploadZone } from "@/components/upload-zone";

export function PhotosTab({
  data,
  onUpdate,
}: {
  data: RentalCase;
  onUpdate: (
    changes:
      Partial<RentalCase> | ((previous: RentalCase) => Partial<RentalCase>),
  ) => void;
}) {
  const [chargeIndex, setChargeIndex] = useState(0);
  const [adding, setAdding] = useState(false);
  const [before, setBefore] = useState(
    data.photoPairs?.[data.charges[0]?.id]?.before ??
      data.evidence.find((f) => f.kind === "before")?.id ??
      "",
  );
  const [after, setAfter] = useState(
    data.photoPairs?.[data.charges[0]?.id]?.after ??
      data.evidence.find((f) => f.kind === "after")?.id ??
      "",
  );
  const [marks, setMarks] = useState(false);
  const photos = data.evidence.filter(
    (e) => e.kind === "before" || e.kind === "after",
  );
  const charge = data.charges[chargeIndex];
  const isExamplePair =
    data.demo &&
    !data.stale &&
    charge?.id === "C01" &&
    before === "P01" &&
    after === "P02";
  // TODO(api): Load saved per-charge photo pairings and evidence-cited vision observations.
  function changeCharge(i: number) {
    setChargeIndex(i);
    setMarks(false);
    const pair = data.photoPairs?.[data.charges[i]?.id];
    if (pair) {
      setBefore(pair.before);
      setAfter(pair.after);
      return;
    }
    if (i !== 0) {
      setBefore("");
      setAfter("");
    } else {
      setBefore(data.evidence.find((f) => f.kind === "before")?.id ?? "");
      setAfter(data.evidence.find((f) => f.kind === "after")?.id ?? "");
    }
  }
  return (
    <>
      <div className="section-title">
        <h2>Before. After. In context.</h2>
        <p>Compare the evidence behind a charge, one view at a time.</p>
      </div>
      {adding && (
        <Card className="stack" style={{ marginBottom: 24 }}>
          <div className="split-row">
            <h3>Add your photos</h3>
            <Button variant="ghost" onClick={() => setAdding(false)}>
              Done
            </Button>
          </div>
          {(["before", "after"] as const).map((kind) => (
            <UploadZone
              key={kind}
              caseId={data.id}
              kind={kind}
              title={kind === "before" ? "Move-in photos" : "Move-out photos"}
              files={data.evidence}
              onAdd={(file) =>
                onUpdate((previous) => ({
                  evidence: [...previous.evidence, file],
                  demo: false,
                  stale: true,
                }))
              }
              onRemove={(id) =>
                onUpdate({
                  evidence: data.evidence.filter((f) => f.id !== id),
                  demo: false,
                  stale: true,
                })
              }
            />
          ))}
        </Card>
      )}
      {!data.charges.length ? (
        <div className="empty-block">
          <Camera size={38} aria-hidden="true" />
          <h3>No itemized charges to compare yet.</h3>
          <p>
            Photos are compared one charge at a time. Your photos stay with
            your case, and you can add charges if your landlord sends a list.
          </p>
          <Button onClick={() => setAdding(true)}>
            <Plus size={18} aria-hidden="true" />
            Add photos
          </Button>
        </div>
      ) : !photos.length ? (
        <div className="empty-block">
          <Camera size={38} aria-hidden="true" />
          <h3>No photos added yet.</h3>
          <p>
            Your document review is still available. Photos can help clarify a
            charge.
          </p>
          <Button onClick={() => setAdding(true)}>
            <Plus size={18} aria-hidden="true" />
            Add photos
          </Button>
        </div>
      ) : (
        <>
          <Card className="photo-toolbar">
            <label htmlFor="photo-charge">
              <span className="field-label">Charge to review</span>
              <select
                id="photo-charge"
                value={chargeIndex}
                onChange={(e) => changeCharge(Number(e.target.value))}
              >
                {data.charges.map((c, i) => (
                  <option key={c.id} value={i}>
                    {c.name} · {c.id}
                  </option>
                ))}
              </select>
            </label>
            <div className="photo-counter">
              Charge {chargeIndex + 1} of {data.charges.length}
              <span className="small muted">Match the same room and view</span>
            </div>
          </Card>
          <div className="photo-pair">
            {(
              [
                {
                  kind: "before",
                  title: "Move-in",
                  selected: before,
                  set: setBefore,
                },
                {
                  kind: "after",
                  title: "Move-out",
                  selected: after,
                  set: setAfter,
                },
              ] as const
            ).map((side) => (
              <Card className="photo-card" key={side.kind}>
                <div className="photo-card-heading">
                  <h3>{side.title}</h3>
                  <span className="badge">{side.selected || "NO PHOTO"}</span>
                </div>
                <label htmlFor={`select-${side.kind}`} className="sr-only">
                  {side.title} photo
                </label>
                <select
                  id={`select-${side.kind}`}
                  value={side.selected}
                  onChange={(e) => {
                    const selected = e.target.value;
                    side.set(selected);
                    if (charge)
                      onUpdate((previous) => ({
                        photoPairs: {
                          ...previous.photoPairs,
                          [charge.id]: {
                            before: side.kind === "before" ? selected : before,
                            after: side.kind === "after" ? selected : after,
                          },
                        },
                        stale: true,
                      }));
                    setMarks(false);
                  }}
                >
                  <option value="">Choose a matching photo</option>
                  {photos
                    .filter((f) => f.kind === side.kind)
                    .map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                </select>
                <div className="photo-frame">
                  {side.selected &&
                  data.evidence.some((f) => f.id === side.selected) ? (
                    <EvidencePreview
                      key={side.selected}
                      data={data}
                      evidenceId={side.selected}
                    />
                  ) : (
                    <div className="photo-missing">
                      <Camera size={36} aria-hidden="true" />
                      <p>{side.title} photo missing</p>
                      <span className="small muted">
                        Choose a photo above or add one.
                      </span>
                    </div>
                  )}
                  {marks && isExamplePair && side.kind === "after" && (
                    <span
                      className="photo-mark"
                      aria-label="Example surface marks at center of wall"
                    />
                  )}
                </div>
                <p className="small muted">
                  {data.demo
                    ? "Illustrative demo image · bedroom wall"
                    : "Original evidence · date not verified"}
                </p>
              </Card>
            ))}
          </div>
          <Card className="photo-observation">
            <span className="observation-icon">
              <ScanSearch size={24} aria-hidden="true" />
            </span>
            <div>
              <p className="eyebrow">
                {isExamplePair
                  ? "EXAMPLE PHOTO OBSERVATION"
                  : "COMPARISON NOTES"}
              </p>
              <h3>
                {isExamplePair
                  ? "Possible ordinary wear"
                  : "More information is needed"}
              </h3>
              <p>
                {isExamplePair
                  ? "Small surface marks appear in the move-out illustration. This example alone does not establish damage or a repair cost."
                  : "Choose comparable views for this charge. Automatic photo analysis is not connected, so no conclusion or repair estimate is shown."}
              </p>
              <div className="source-list">
                {[before, after].filter(Boolean).map((id) => (
                  <SourceChip key={id} id={id} data={data} />
                ))}
              </div>
              {isExamplePair && (
                <Button
                  variant="ghost"
                  aria-pressed={marks}
                  onClick={() => setMarks(!marks)}
                >
                  {marks ? "Hide example marks" : "Highlight example marks"}
                </Button>
              )}
            </div>
          </Card>
          <div className="split-row" style={{ marginTop: 24 }}>
            <Button
              variant="outline"
              disabled={chargeIndex === 0}
              onClick={() => changeCharge(chargeIndex - 1)}
            >
              <ArrowLeft size={18} aria-hidden="true" />
              Previous charge
            </Button>
            <Button
              variant="outline"
              disabled={chargeIndex >= data.charges.length - 1}
              onClick={() => changeCharge(chargeIndex + 1)}
            >
              Next charge
              <ArrowRight size={18} aria-hidden="true" />
            </Button>
          </div>
        </>
      )}
      <ActionBar>
        <Button onClick={() => setAdding(!adding)}>
          <Plus size={18} aria-hidden="true" />
          {adding ? "Finish adding photos" : "Add photos"}
        </Button>
      </ActionBar>
    </>
  );
}
