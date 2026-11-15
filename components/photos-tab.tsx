"use client";
import { useState } from "react";
import { Camera, Plus, ArrowLeft, ArrowRight, ScanSearch, LoaderCircle } from "lucide-react";
import type { PhotoComparison, RentalCase } from "@/types/case";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ActionBar } from "@/components/shell";
import { SourceChip, EvidencePreview } from "@/components/evidence";
import { UploadZone } from "@/components/upload-zone";
import { ComparisonMarks, ComparisonResult } from "@/components/photo-comparison";
import { comparePhotos } from "@/lib/cases";
import { hosted } from "@/lib/backend";

export function PhotosTab({
  data,
  onUpdate,
  allowUpload = true,
}: {
  data: RentalCase;
  allowUpload?: boolean;
  onUpdate: (
    changes:
      Partial<RentalCase> | ((previous: RentalCase) => Partial<RentalCase>),
    persist?: boolean,
  ) => void;
}) {
  const [chargeIndex, setChargeIndex] = useState(0);
  const [adding, setAdding] = useState(false);
  const [marks, setMarks] = useState(false);
  // Comparison of the chosen pair: which charge is being compared, the
  // last error, whether the changes are outlined, and the move-out photo size.
  const [comparing, setComparing] = useState<string | null>(null);
  const [compareError, setCompareError] = useState("");
  const [outlines, setOutlines] = useState(true);
  const [activeMark, setActiveMark] = useState<number | null>(null);
  const [afterSize, setAfterSize] = useState<{ width: number; height: number } | null>(null);
  const photos = data.evidence.filter(
    (e) => e.kind === "before" || e.kind === "after",
  );
  const charge = data.charges[chargeIndex];
  const pair = data.photoPairs?.[charge?.id];
  const before = pair?.before ?? (chargeIndex === 0 ? photos.find((file) => file.kind === "before")?.id ?? "" : "");
  const after = pair?.after ?? (chargeIndex === 0 ? photos.find((file) => file.kind === "after")?.id ?? "" : "");
  const isExamplePair =
    data.demo &&
    !data.stale &&
    charge?.id === "C01" &&
    before === "P01" &&
    after === "P02";
  // A saved comparison counts only while the same two photos are chosen.
  const analysis =
    pair?.analysis && pair.analysis.before === before && pair.analysis.after === after
      ? pair.analysis
      : null;
  const canCompare = hosted && !data.demo;
  async function compare() {
    if (!charge || !before || !after) return;
    const chargeId = charge.id;
    setComparing(chargeId);
    setCompareError("");
    try {
      const result: PhotoComparison = await comparePhotos(data, chargeId, before, after);
      onUpdate((previous) => ({
        photoPairs: {
          ...previous.photoPairs,
          [chargeId]: { before: result.before, after: result.after, analysis: result },
        },
        stale: true,
      }));
      setOutlines(true);
      setActiveMark(null);
    } catch (e) {
      setCompareError(e instanceof Error ? e.message : "The photo comparison couldn’t finish. Try again.");
    } finally {
      setComparing(null);
    }
  }
  function changeCharge(i: number) {
    setChargeIndex(i);
    setMarks(false);
    setCompareError("");
    setActiveMark(null);
  }
  return (
    <>
      <div className="section-title">
        <h2>Before. After. In context.</h2>
        <p>Compare the evidence behind a charge, one view at a time.</p>
      </div>
      {allowUpload && adding && (
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
              onAdd={(file, caseId) =>
                onUpdate((previous) => previous.id === caseId
                  ? {
                      evidence: [...previous.evidence.filter((e) => e.id !== file.id), file],
                      demo: false,
                      stale: true,
                    }
                  : {}, false)
              }
              onRemove={(id) =>
                onUpdate((previous) => ({
                  evidence: previous.evidence.filter((f) => f.id !== id),
                  photoPairs: previous.photoPairs && Object.fromEntries(
                    Object.entries(previous.photoPairs).map(([chargeId, pair]) => [
                      chargeId,
                      { before: pair.before === id ? "" : pair.before, after: pair.after === id ? "" : pair.after },
                    ]),
                  ),
                  demo: false,
                  stale: true,
                }))
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
          {allowUpload && <Button onClick={() => setAdding(true)}>
            <Plus size={18} aria-hidden="true" />
            Add photos
          </Button>}
        </div>
      ) : !photos.length ? (
        <div className="empty-block">
          <Camera size={38} aria-hidden="true" />
          <h3>No photos added yet.</h3>
          <p>
            Your document review is still available. Photos can help clarify a
            charge.
          </p>
          {allowUpload && <Button onClick={() => setAdding(true)}>
            <Plus size={18} aria-hidden="true" />
            Add photos
          </Button>}
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
                },
                {
                  kind: "after",
                  title: "Move-out",
                  selected: after,
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
                    setCompareError("");
                    setActiveMark(null);
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
                      onImageSize={
                        side.kind === "after"
                          ? (width, height) =>
                              // Only a new size re-renders; the same one is ignored.
                              setAfterSize((size) =>
                                size?.width === width && size.height === height
                                  ? size
                                  : { width, height },
                              )
                          : undefined
                      }
                    />
                  ) : (
                    <div className="photo-missing">
                      <Camera size={36} aria-hidden="true" />
                      <p>{side.title} photo missing</p>
                      <span className="small muted">
                        {allowUpload ? "Choose a photo above or add one." : "Choose a sample photo above."}
                      </span>
                    </div>
                  )}
                  {side.kind === "after" && analysis && outlines && side.selected && (
                    <ComparisonMarks
                      analysis={analysis}
                      size={afterSize}
                      active={activeMark}
                    />
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
          {isExamplePair ? (
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
          ) : (
            <Card className="photo-observation" aria-busy={comparing === charge?.id}>
              <span className="observation-icon">
                <ScanSearch size={24} aria-hidden="true" />
              </span>
              <div>
                <p className="eyebrow">PHOTO COMPARISON</p>
                {analysis ? (
                  <ComparisonResult
                    analysis={analysis}
                    onShowMark={(i) => {
                      setOutlines(true);
                      setActiveMark(i);
                    }}
                  />
                ) : (
                  <>
                    <h3>See what changed</h3>
                    <p>
                      {!before || !after
                        ? "Choose a move-in and a move-out photo of the same spot for this charge, then compare them."
                        : canCompare
                          ? "The comparison lists visible differences and marks their locations on the move-out photo."
                          : "Photo analysis runs in the hosted app with a signed-in account. No conclusion or repair estimate is shown here."}
                    </p>
                  </>
                )}
                <div className="source-list">
                  {[before, after].filter(Boolean).map((id) => (
                    <SourceChip key={id} id={id} data={data} />
                  ))}
                </div>
                {compareError && (
                  <p role="alert" className="inline-error">
                    {compareError}
                  </p>
                )}
                {canCompare && (
                  <div className="comparison-actions">
                    <Button
                      variant={analysis ? "outline" : undefined}
                      disabled={!before || !after || comparing !== null}
                      onClick={compare}
                    >
                      {comparing === charge?.id ? (
                        <>
                          <LoaderCircle size={18} className="spin" aria-hidden="true" />
                          Comparing… up to a minute
                        </>
                      ) : (
                        <>
                          <ScanSearch size={18} aria-hidden="true" />
                          {analysis ? "Compare again" : "Compare these photos"}
                        </>
                      )}
                    </Button>
                    {analysis?.differences.some((item) => item.box) && (
                      <Button
                        variant="ghost"
                        aria-pressed={outlines}
                        onClick={() => {
                          setOutlines(!outlines);
                          setActiveMark(null);
                        }}
                      >
                        {outlines ? "Hide marked areas" : "Show marked areas"}
                      </Button>
                    )}
                  </div>
                )}
                {canCompare && !analysis && before && after && (
                  <p className="small muted">
                    The two photos are sent to an external service for comparison.
                  </p>
                )}
              </div>
            </Card>
          )}
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
      {allowUpload && (
        <ActionBar>
          <Button onClick={() => setAdding(!adding)}>
            <Plus size={18} aria-hidden="true" />
            {adding ? "Finish adding photos" : "Add photos"}
          </Button>
        </ActionBar>
      )}
    </>
  );
}
