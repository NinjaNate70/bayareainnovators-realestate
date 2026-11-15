"use client";
import { useEffect, useRef, useState } from "react";
import { FileText, ImageIcon, X, LoaderCircle } from "lucide-react";
import type { Evidence } from "@/types/case";
import { useAuth } from "@/components/auth/provider";
import { CaseLibraryPicker } from "@/components/case-library-picker";
import { FileDrop } from "@/components/file-drop";
import { removeLibraryAttachment, storeFile } from "@/lib/cases";
import { hosted } from "@/lib/backend";
import { caseUploadMaxBytes, caseUploadTypes } from "@/lib/document-library";

type Pending = {
  key: string;
  name: string;
  size: number;
  preview?: string;
  error?: string;
};

const isPhoto = (kind: Evidence["kind"]) => kind === "before" || kind === "after";

export function UploadZone({
  caseId,
  kind,
  files,
  onAdd,
  onRemove,
  title,
  note,
}: {
  caseId: string;
  kind: Evidence["kind"];
  files: Evidence[];
  onAdd: (file: Evidence, caseId: string) => void;
  onRemove: (id: string) => void;
  title: string;
  // Optional line under the title saying what belongs here.
  note?: string;
}) {
  const { session } = useAuth();
  const [error, setError] = useState("");
  // Files being stored right now. Each shows at once with an Uploading badge,
  // and turns into a saved file as soon as it is stored.
  const [pending, setPending] = useState<Pending[]>([]);
  // Thumbnails for images added in this visit, by saved file id.
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const urls = useRef(new Set<string>());
  const active = useRef(false);
  useEffect(() => {
    active.current = true;
    const open = urls.current;
    return () => {
      active.current = false;
      for (const url of open) URL.revokeObjectURL(url);
      open.clear();
    };
  }, []);

  const accepted = caseUploadTypes(kind);
  function fileProblem(file: File) {
    if (!accepted.includes(file.type))
      return isPhoto(kind) ? "Choose a JPG or PNG photo." : "Choose a PDF, JPG or PNG file.";
    if (file.size === 0) return `${file.name} is empty.`;
    if (file.size > caseUploadMaxBytes)
      return `${file.name} is larger than 10MB. Choose a smaller file.`;
    return "";
  }

  async function save(file: File, source?: { id: string; owner: string }) {
    const key = source ? `library-${source.id}` : crypto.randomUUID();
    const preview = active.current && file.type.startsWith("image/")
      ? URL.createObjectURL(file)
      : undefined;
    if (preview) urls.current.add(preview);
    setPending((previous) => [
      ...previous.filter((item) => item.key !== key),
      { key, name: file.name, size: file.size, preview },
    ]);
    try {
      const fid = `${isPhoto(kind) ? "P" : "D"}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const evidence = await storeFile(caseId, fid, file, kind, source);
      if (preview) setPreviews((all) => ({ ...all, [evidence.id]: preview }));
      onAdd(evidence, caseId);
      setPending((previous) => previous.filter((item) => item.key !== key));
      return true;
    } catch (e) {
      const message = e instanceof Error ? e.message : "File could not be saved. Try again.";
      setPending((previous) => previous.map((item) =>
        item.key === key ? { ...item, error: message } : item,
      ));
      return false;
    }
  }

  function add(list: File[]) {
    const problems: string[] = [];
    for (const file of list) {
      const problem = fileProblem(file);
      if (problem) problems.push(problem);
      else void save(file);
    }
    setError(problems[0] ?? "");
  }

  const saving = pending.filter((p) => !p.error).length;
  const saved = files.filter((f) => f.kind === kind);
  return (
    <FileDrop
      label={title}
      description={note}
      multiple
      accept={accepted.join(",")}
      hint={`${isPhoto(kind) ? "JPG or PNG" : "PDF, JPG or PNG"} · up to 10MB each`}
      note={
        hosted
          ? "Stored privately in your account. Only you can open the originals."
          : "Stored in this browser. Originals are not sent to a server."
      }
      onFiles={add}
    >
      {hosted && session && (
        <CaseLibraryPicker
          key={`${session.user.id}/${caseId}/${kind}`}
          userId={session.user.id}
          kind={kind}
          evidence={files}
          onCopy={async (file, source) => {
            const problem = fileProblem(file);
            setError(problem);
            return !problem && save(file, source);
          }}
        />
      )}
      <p role="status" className="small muted upload-status">
        {saving > 0 && (
          <>
            <LoaderCircle className="spin" size={16} aria-hidden="true" />{" "}
            Saving {saving === 1 ? "1 file" : `${saving} files`}…
          </>
        )}
      </p>
      {error && (
        <p role="alert" className="notice">
          Fix this: {error}
        </p>
      )}
      <ul className="file-list">
        {saved.map((f) => (
          <li key={f.id}>
            <Thumb preview={previews[f.id]} photo={isPhoto(kind)} />
            <span>
              {f.name}
              <small>
                {f.libraryFileId
                  ? "Copied from My Documents"
                  : f.size
                  ? `${Math.ceil(f.size / 1024)} KB · saved ${hosted ? "to your account" : "in this browser"}`
                  : "Example file"}
              </small>
            </span>
            <button
              type="button"
              className="icon-button"
              aria-label={`Remove ${f.name}`}
              onClick={() => {
                if (f.libraryFileId) removeLibraryAttachment(caseId, f.id);
                onRemove(f.id);
              }}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </li>
        ))}
        {pending.map((p) => (
          <li key={p.key} data-state={p.error ? "failed" : "uploading"}>
            <Thumb preview={p.preview} photo={isPhoto(kind)} />
            <span>
              {p.name}
              <small>
                {p.error
                  ? `Not saved: ${p.error}`
                  : `${Math.ceil(p.size / 1024)} KB`}
              </small>
            </span>
            {p.error ? (
              <button
                type="button"
                className="icon-button"
                aria-label={`Dismiss ${p.name}`}
                onClick={() => setPending((all) => all.filter((x) => x.key !== p.key))}
              >
                <X size={18} aria-hidden="true" />
              </button>
            ) : (
              <span className="badge upload-badge">
                <LoaderCircle className="spin" size={14} aria-hidden="true" />{" "}
                Uploading
              </span>
            )}
          </li>
        ))}
      </ul>
    </FileDrop>
  );
}

function Thumb({ preview, photo }: { preview?: string; photo: boolean }) {
  return preview ? (
    // A blob URL of a file the renter just chose; there is nothing to optimize.
    // eslint-disable-next-line @next/next/no-img-element
    <img className="file-thumb" src={preview} alt="" />
  ) : (
    <span className="file-thumb file-thumb-icon" aria-hidden="true">
      {photo ? <ImageIcon size={20} /> : <FileText size={20} />}
    </span>
  );
}
