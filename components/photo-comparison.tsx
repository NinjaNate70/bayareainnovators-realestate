"use client";
import type { PhotoComparison } from "@/types/case";

export const findingLabels: Record<PhotoComparison["finding"], string> = {
  no_change: "No visible change",
  ordinary_wear: "Looks like ordinary wear",
  new_damage: "New damage visible at move-out",
  already_there: "Already visible at move-in",
  unclear: "These photos can’t be compared",
};
const linkLabels: Record<PhotoComparison["chargeLink"], string> = {
  shows_damage: "The charged item is in these photos and looks damaged or dirty at move-out.",
  shows_no_damage: "The charged item is in these photos and looks sound, or only worn, at move-out.",
  not_shown: "The charged item isn’t in these photos. Choose photos that show it.",
  unclear: "It isn’t clear whether these photos show the charged item.",
};
const kindLabels: Record<PhotoComparison["differences"][number]["kind"], string> = {
  damage: "Damage",
  wear: "Wear",
  cleanliness: "Cleanliness",
  already_there: "Already there",
  moved_or_missing: "Moved or missing",
  angle_or_lighting: "Angle or lighting",
};

// The results of one comparison: the overall finding, each difference, and
// what would help when the photos can't be compared.
export function ComparisonResult({
  analysis,
  onShowMark,
}: {
  analysis: PhotoComparison;
  onShowMark?: (index: number) => void;
}) {
  return (
    <div className="comparison-result">
      <h3>{findingLabels[analysis.finding]}</h3>
      <p>{analysis.summary}</p>
      <p>
        <strong>About this charge:</strong> {linkLabels[analysis.chargeLink]}
      </p>
      {analysis.differences.length > 0 && (
        <>
          <h4>What changed</h4>
          <ol className="comparison-list">
            {analysis.differences.map((item, i) => (
              <li key={i}>
                <div className="comparison-item-head">
                  <strong>{item.what}</strong>
                  <span className={`badge comparison-kind kind-${item.kind}`}>
                    {kindLabels[item.kind]}
                  </span>
                </div>
                {item.where && <span className="small muted">{item.where}</span>}
                <dl className="comparison-sides">
                  <div>
                    <dt>Move-in</dt>
                    <dd>{item.before || "Not described"}</dd>
                  </div>
                  <div>
                    <dt>Move-out</dt>
                    <dd>{item.after || "Not described"}</dd>
                  </div>
                </dl>
                {item.box && onShowMark && (
                  <button
                    type="button"
                    className="text-link comparison-locate"
                    onClick={() => onShowMark(i)}
                  >
                    Show on photo
                  </button>
                )}
              </li>
            ))}
          </ol>
        </>
      )}
      {analysis.retake && (
        <p className="notice">
          <strong>To compare better:</strong> {analysis.retake}
        </p>
      )}
      <p className="small muted">
        Compared by {analysis.by === "claude" ? "Claude" : "Gemini"} on{" "}
        {new Date(analysis.checkedAt).toLocaleString()}. An AI description of
        what is visible: it doesn’t decide who caused a change, whether the
        charge is allowed, or what a repair costs. Marked areas are approximate.
      </p>
    </div>
  );
}

// Numbered outlines over the move-out photo, placed where the photo is drawn
// inside its frame (the frame keeps a 4:3 shape and the photo is letterboxed).
export function ComparisonMarks({
  analysis,
  size,
  active,
}: {
  analysis: PhotoComparison;
  size: { width: number; height: number } | null;
  active: number | null;
}) {
  if (!size || !size.width || !size.height) return null;
  const ratio = size.width / size.height;
  const frame = 4 / 3;
  const drawn =
    ratio > frame
      ? { left: 0, top: (100 - (frame / ratio) * 100) / 2, width: 100, height: (frame / ratio) * 100 }
      : { left: (100 - (ratio / frame) * 100) / 2, top: 0, width: (ratio / frame) * 100, height: 100 };
  return (
    <>
      {analysis.differences.map((item, i) => {
        if (!item.box) return null;
        const [x0, y0, x1, y1] = item.box;
        return (
          <span
            key={i}
            className={`photo-box kind-${item.kind}${active === i ? " active" : ""}`}
            style={{
              left: `${drawn.left + (x0 / 1000) * drawn.width}%`,
              top: `${drawn.top + (y0 / 1000) * drawn.height}%`,
              width: `${((x1 - x0) / 1000) * drawn.width}%`,
              height: `${((y1 - y0) / 1000) * drawn.height}%`,
            }}
            role="img"
            aria-label={`Change ${i + 1}: ${item.what}`}
          >
            <span className="photo-box-number" aria-hidden="true">
              {i + 1}
            </span>
          </span>
        );
      })}
    </>
  );
}
