import { useRef, useState } from "react";
import { ChevronDown, FolderOpen, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  caseLibraryFile,
  fileSize,
  libraryBucket,
  libraryFolder,
  type CaseLibraryFile,
} from "@/lib/document-library";
import { requireSupabase } from "@/lib/supabase/client";
import type { Evidence } from "@/types/case";

const pageSize = 100;

export function CaseLibraryPicker({
  userId,
  kind,
  evidence,
  onCopy,
}: {
  userId: string;
  kind: Evidence["kind"];
  evidence: Evidence[];
  onCopy: (file: File, source: { id: string; owner: string }) => Promise<boolean>;
}) {
  const [files, setFiles] = useState<CaseLibraryFile[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState("");
  const details = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  const loadingRef = useRef(false);
  const copyingRef = useRef(false);
  const folder = libraryFolder(userId);
  const used = new Set(evidence.filter((file) => file.kind === kind).map((file) => file.libraryFileId));
  const choices = files.filter((file) => selected.includes(file.id) && !used.has(file.id));

  async function load() {
    if (loadingRef.current || copyingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setLoadError(false);
    setCopyError("");
    setSelected([]);
    try {
      const bucket = requireSupabase().storage.from(libraryBucket);
      const available: CaseLibraryFile[] = [];
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await bucket.list(folder, {
          limit: pageSize,
          offset,
          sortBy: { column: "name", order: "asc" },
        });
        if (error) throw error;
        for (const item of data) {
          const file = caseLibraryFile(item, kind);
          if (file) available.push(file);
        }
        if (data.length < pageSize) break;
      }
      setFiles(available);
    } catch {
      setLoadError(true);
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }

  async function copy() {
    if (copyingRef.current || !choices.length) return;
    copyingRef.current = true;
    setCopying(true);
    setCopyError("");
    const failed: string[] = [];
    try {
      const bucket = requireSupabase().storage.from(libraryBucket);
      for (const file of choices) {
        try {
          const { data, error } = await bucket.download(`${folder}/${file.objectName}`);
          if (error || !data) throw error ?? new Error("This file is unavailable.");
          const mime = data.type.split(";")[0].trim();
          const original = new File([data], file.name, {
            type: mime && mime !== "application/octet-stream" ? mime : file.type,
          });
          if (!(await onCopy(original, { id: file.id, owner: userId }))) failed.push(file.id);
        } catch {
          failed.push(file.id);
        }
      }
    } finally {
      copyingRef.current = false;
      setCopying(false);
    }
    setSelected(failed);
    if (failed.length) {
      const first = choices.find((file) => file.id === failed[0]);
      setCopyError(failed.length === 1
        ? `${first?.name} couldn’t be added. Try again.`
        : `${failed.length} files couldn’t be added. Try again.`);
    } else if (details.current) {
      details.current.open = false;
      summary.current?.focus();
    }
  }

  return (
    <details
      className="case-library-picker"
      ref={details}
      onToggle={(event) => {
        if (event.currentTarget.open) void load();
      }}
    >
      <summary ref={summary}>
        <FolderOpen size={17} aria-hidden="true" />
        Use a file from My Documents
        <ChevronDown className="case-library-chevron" size={17} aria-hidden="true" />
      </summary>
      <fieldset disabled={copying}>
        <legend>My Documents</legend>
        <p className="small muted">A copy goes in this case. The original stays in My Documents.</p>
        {loading ? (
          <p className="small muted" role="status">Loading your documents…</p>
        ) : loadError ? (
          <>
            <p className="small notice" role="alert">Your documents couldn’t be loaded.</p>
            <Button type="button" variant="outline" onClick={() => void load()}>Try again</Button>
          </>
        ) : files.length ? (
          <>
            <ul className="case-library-options">
              {files.map((file) => {
                const added = used.has(file.id);
                return (
                  <li key={file.id}>
                    <label>
                      <input
                        type="checkbox"
                        checked={selected.includes(file.id) && !added}
                        disabled={added}
                        onChange={(event) => {
                          const checked = event.currentTarget.checked;
                          setSelected((previous) => checked
                            ? [...previous, file.id]
                            : previous.filter((id) => id !== file.id));
                        }}
                      />
                      <span>
                        {file.name}
                        <small>{fileSize(file.size)}{added ? " · Already added" : ""}</small>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {copyError && <p className="small notice" role="alert">{copyError}</p>}
            <Button type="button" disabled={!choices.length || copying} onClick={() => void copy()}>
              {copying && <LoaderCircle className="spin" size={16} aria-hidden="true" />}
              {copying ? "Adding…" : "Add to case"}
            </Button>
          </>
        ) : (
          <p className="small muted">There are no files in My Documents that match this upload’s file types and size limit.</p>
        )}
      </fieldset>
    </details>
  );
}
