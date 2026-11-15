"use client";
import { useId, useRef, useState } from "react";
import { FileUp, FileText, X, LoaderCircle } from "lucide-react";
import type { Evidence } from "@/types/case";
import { storeFile } from "@/lib/cases";
export function UploadZone({
  caseId,
  kind,
  files,
  onAdd,
  onRemove,
  title,
}: {
  caseId: string;
  kind: Evidence["kind"];
  files: Evidence[];
  onAdd: (file: Evidence) => void;
  onRemove: (id: string) => void;
  title: string;
}) {
  const id = useId();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const latch = useRef(false);
  async function add(list: FileList | null) {
    if (!list || latch.current) return;
    latch.current = true;
    setError("");
    setBusy(true);
    try {
      for (const file of Array.from(list)) {
        if (
          !["application/pdf", "image/jpeg", "image/png"].includes(file.type) ||
          ((kind === "before" || kind === "after") &&
            file.type === "application/pdf")
        )
          throw new Error(
            "Choose a JPG or PNG photo, or a PDF for a document.",
          );
        if (file.size > 10 * 1024 * 1024)
          throw new Error(
            `${file.name} is larger than 10MB. Choose a smaller file.`,
          );
        const fid = `${kind === "before" || kind === "after" ? "P" : "D"}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
        const metadata = await storeFile(caseId, fid, file, kind);
        onAdd({
          ...metadata,
          id: fid,
          name: file.name,
          kind,
          size: file.size,
          type: file.type,
        });
      }
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "File could not be saved. Try again.",
      );
    } finally {
      latch.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="upload-group">
      <label className="field-label" htmlFor={id}>
        {title}
      </label>
      <div
        className="upload-zone"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          if (!busy) void add(e.dataTransfer.files);
        }}
      >
        <FileUp size={27} aria-hidden="true" />
        <strong>
          {busy ? "Saving original file…" : "Drop files here, or browse"}
        </strong>
        <span className="small muted">
          {kind === "before" || kind === "after"
            ? "JPG or PNG"
            : "PDF, JPG or PNG"}{" "}
          · up to 10MB each
        </span>
        <input
          id={id}
          type="file"
          multiple
          disabled={busy}
          accept={
            kind === "before" || kind === "after"
              ? "image/jpeg,image/png"
              : "application/pdf,image/jpeg,image/png"
          }
          onChange={(e) => {
            void add(e.target.files);
            e.target.value = "";
          }}
          aria-describedby={`${id}-hint`}
        />
      </div>
      <p id={`${id}-hint`} className="small muted">
        Stored in this browser. Originals are not sent to a server.
      </p>
      {busy && (
        <p role="status">
          <LoaderCircle className="spin" size={18} /> Saving file
        </p>
      )}
      {error && (
        <p role="alert" className="notice">
          Fix this: {error}
        </p>
      )}
      <ul className="file-list">
        {files
          .filter((f) => f.kind === kind)
          .map((f) => (
            <li key={f.id}>
              <FileText size={20} aria-hidden="true" />
              <span>
                {f.name}
                <small>
                  {f.size
                    ? `${Math.ceil(f.size / 1024)} KB · saved locally`
                    : "Example file"}
                </small>
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove ${f.name}`}
                onClick={() => onRemove(f.id)}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </li>
          ))}
      </ul>
    </div>
  );
}
