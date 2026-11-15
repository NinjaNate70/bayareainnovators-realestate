"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  Download,
  ExternalLink,
  FileText,
  FileUp,
  FolderOpen,
  ImageIcon,
  LoaderCircle,
  Trash2,
} from "lucide-react";
import type { Evidence } from "@/types/case";
import { Shell } from "@/components/shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth/provider";
import { getBackend, hosted } from "@/lib/backend";
import { unwrap } from "@/lib/cases";
import { fromRow } from "@/lib/db/mapping";
import { supabase } from "@/lib/supabase/client";
import {
  displayName,
  fileSize,
  libraryAccept,
  libraryBucket,
  libraryFileError,
  libraryFolder,
  libraryKinds,
  libraryType,
  storedName,
  uploadProblem,
  viewable,
} from "@/lib/document-library";

type Saved = { path: string; name: string; size: string; added: string; image: boolean };
type CaseFile = { caseId: string; address: string; evidence: Evidence };
const kinds: Record<Evidence["kind"], string> = {
  letter: "Deduction letter",
  lease: "Lease",
  other: "Supporting document",
  before: "Move-in photo",
  after: "Move-out photo",
};
const day = (value: string | undefined) =>
  value && !Number.isNaN(Date.parse(value))
    ? new Date(value).toLocaleDateString()
    : "";

// Every document the renter has, in one place: files they keep here outside
// any case, and the files already attached to their cases.
export function DocumentsLibrary() {
  const { session } = useAuth();
  const userId = session?.user.id;
  const inputId = useId();
  const [saved, setSaved] = useState<Saved[] | null>(null);
  const [caseFiles, setCaseFiles] = useState<CaseFile[] | null>(null);
  const [error, setError] = useState("");
  const [setup, setSetup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  // The file being fetched, so its buttons can show progress.
  const [working, setWorking] = useState("");
  const latch = useRef(false);

  const loadSaved = useCallback(async () => {
    if (!supabase || !userId) return;
    const { data, error } = await supabase.storage
      .from(libraryBucket)
      .list(libraryFolder(userId), {
        limit: 500,
        sortBy: { column: "created_at", order: "desc" },
      });
    if (error) {
      // A missing bucket means the library's migration hasn't been run.
      if (/bucket/i.test(error.message)) setSetup(true);
      else
        setError(
          `We couldn’t load your documents (${error.message.slice(0, 120)}). Refresh to try again.`,
        );
      setSaved([]);
      return;
    }
    setSaved(
      data
        // Storage lists a placeholder for an empty folder; skip it.
        .filter((item) => item.id && !item.name.startsWith("."))
        .map((item) => ({
          path: `${libraryFolder(userId)}/${item.name}`,
          name: displayName(item.name),
          size: fileSize(item.metadata?.size),
          added: day(item.created_at ?? undefined),
          image: String(item.metadata?.mimetype ?? "").startsWith("image/"),
        })),
    );
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    let alive = true;
    void (async () => {
      if (hosted) await loadSaved();
      try {
        const rows = unwrap(await getBackend().data.listCases());
        if (!alive) return;
        setCaseFiles(
          rows.flatMap((row) => {
            const value = fromRow(row);
            return value.evidence
              .filter((evidence) => evidence.path && evidence.bucket)
              .map((evidence) => ({
                caseId: value.id,
                address: value.address.split(",")[0] || "Untitled case",
                evidence,
              }));
          }),
        );
      } catch {
        if (alive) setCaseFiles([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId, loadSaved]);

  async function add(list: FileList | null) {
    if (!list?.length || !supabase || !userId || latch.current) return;
    latch.current = true;
    setBusy(true);
    setError("");
    setStatus("");
    let count = 0;
    try {
      for (const file of Array.from(list)) {
        const problem = libraryFileError(file);
        if (problem) throw new Error(problem);
        const { error } = await supabase.storage
          .from(libraryBucket)
          .upload(`${libraryFolder(userId)}/${storedName(file.name)}`, file, {
            contentType: libraryType(file),
          });
        if (error) {
          const found = uploadProblem(file.name, error.message);
          if (found.setup) setSetup(true);
          throw new Error(found.text);
        }
        count += 1;
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The file couldn’t be saved.",
      );
    } finally {
      if (count)
        setStatus(`${count} document${count === 1 ? "" : "s"} saved.`);
      await loadSaved();
      setBusy(false);
      latch.current = false;
    }
  }
  // Files are fetched with the renter's own session and handed to the browser
  // from memory, so nothing depends on pop-ups or on a link that can expire.
  function hand(blob: Blob, name: string, inTab: boolean) {
    const url = URL.createObjectURL(blob);
    setTimeout(() => URL.revokeObjectURL(url), 120_000);
    if (inTab && window.open(url, "_blank")) return;
    // Save it instead when a new tab isn't wanted or the browser blocked it.
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.append(link);
    link.click();
    link.remove();
  }
  async function fetchSaved(file: Saved, inTab: boolean) {
    if (!supabase || working) return;
    setError("");
    setStatus("");
    setWorking(file.path);
    const { data, error } = await supabase.storage
      .from(libraryBucket)
      .download(file.path);
    setWorking("");
    if (error || !data) {
      setError(
        `We couldn’t open ${file.name}${error?.message ? ` (${error.message.slice(0, 120)})` : ""}. Try again.`,
      );
      return;
    }
    hand(data, file.name, inTab);
    if (!inTab) setStatus(`${file.name} downloaded.`);
  }
  async function remove(file: Saved) {
    if (!supabase) return;
    if (!window.confirm(`Delete ${file.name}? This can’t be undone.`)) return;
    setError("");
    const { error } = await supabase.storage
      .from(libraryBucket)
      .remove([file.path]);
    if (error) setError(`${file.name} couldn’t be deleted. Try again.`);
    else setStatus(`${file.name} deleted.`);
    await loadSaved();
  }
  async function fetchCaseFile(file: CaseFile, inTab: boolean) {
    const { path, bucket, name } = file.evidence;
    if (!path || !bucket || working) return;
    setError("");
    setStatus("");
    setWorking(`${file.caseId}/${file.evidence.id}`);
    const result = await getBackend().storage.from(bucket).download(path);
    setWorking("");
    if (result.error || !result.data) {
      setError(`We couldn’t open ${name}. Try again.`);
      return;
    }
    hand(result.data, name, inTab);
    if (!inTab) setStatus(`${name} downloaded.`);
  }

  return (
    <Shell>
      <div className="page-heading">
        <div>
          <p className="eyebrow">EVERYTHING IN ONE PLACE</p>
          <h1>My documents</h1>
          <p>
            Keep leases, receipts, letters and photos here, whether or not they
            belong to a case.
          </p>
        </div>
      </div>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <p className={status ? "notice" : "sr-only"} role="status">
        {status}
      </p>

      <Card className="library-section">
        <h2>
          <FolderOpen size={21} aria-hidden="true" /> Saved documents
        </h2>
        {!hosted ? (
          <p className="small muted">
            Saving documents outside a case needs a hosted account. Documents
            you add to a case are listed below.
          </p>
        ) : (
          <>
            {setup && (
              <p className="notice" role="alert">
                Your document library isn’t set up yet, so files can’t be saved
                here. Your project admin needs to run the document library
                migration (20261115000300_document_library.sql) in the Supabase
                SQL Editor, then reload this page.
              </p>
            )}
            <div className="upload-group">
              <label className="field-label" htmlFor={inputId}>
                Add documents
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
                  {busy ? "Saving…" : "Drop files here, or browse"}
                </strong>
                <span className="small muted">
                  {libraryKinds} · up to 20MB each
                </span>
                <input
                  id={inputId}
                  type="file"
                  multiple
                  disabled={busy}
                  accept={libraryAccept}
                  aria-describedby={`${inputId}-hint`}
                  onChange={(e) => {
                    void add(e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>
              <p id={`${inputId}-hint`} className="small muted">
                Stored privately in your account. Only you can open them. They
                aren’t part of any case or audit until you add them to one.
              </p>
            </div>
            {saved === null ? (
              <p role="status">
                <LoaderCircle className="spin" size={18} aria-hidden="true" />{" "}
                Loading your documents…
              </p>
            ) : saved.length === 0 ? (
              <p className="small muted">Nothing saved here yet.</p>
            ) : (
              <ul className="file-list library-list">
                {saved.map((file) => (
                  <li key={file.path}>
                    {file.image ? (
                      <ImageIcon size={20} aria-hidden="true" />
                    ) : (
                      <FileText size={20} aria-hidden="true" />
                    )}
                    <span>
                      {file.name}
                      <small>
                        {[file.size, file.added && `Added ${file.added}`]
                          .filter(Boolean)
                          .join(" · ")}
                      </small>
                    </span>
                    {viewable(file.name) && (
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Open ${file.name}`}
                        title="Open in a new tab"
                        disabled={working === file.path}
                        onClick={() => void fetchSaved(file, true)}
                      >
                        <ExternalLink size={18} aria-hidden="true" />
                      </button>
                    )}
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Download ${file.name}`}
                      title="Download"
                      disabled={working === file.path}
                      onClick={() => void fetchSaved(file, false)}
                    >
                      {working === file.path ? (
                        <LoaderCircle className="spin" size={18} aria-hidden="true" />
                      ) : (
                        <Download size={18} aria-hidden="true" />
                      )}
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Delete ${file.name}`}
                      onClick={() => void remove(file)}
                    >
                      <Trash2 size={18} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Card>

      <Card className="library-section">
        <h2>
          <FileText size={21} aria-hidden="true" /> From your cases
        </h2>
        <p className="small muted">
          Files you added to a case. To remove or replace one, edit that case’s
          evidence.
        </p>
        {caseFiles === null ? (
          <p role="status">
            <LoaderCircle className="spin" size={18} aria-hidden="true" />{" "}
            Loading case files…
          </p>
        ) : caseFiles.length === 0 ? (
          <p className="small muted">
            No case files yet.{" "}
            <Link className="text-link" href="/case/new">
              Start a case
            </Link>{" "}
            to add your deduction letter.
          </p>
        ) : (
          <ul className="file-list library-list">
            {caseFiles.map((file) => (
              <li key={`${file.caseId}/${file.evidence.id}`}>
                {file.evidence.kind === "before" ||
                file.evidence.kind === "after" ? (
                  <ImageIcon size={20} aria-hidden="true" />
                ) : (
                  <FileText size={20} aria-hidden="true" />
                )}
                <span>
                  {file.evidence.name}
                  <small>
                    {kinds[file.evidence.kind]} ·{" "}
                    <Link className="text-link" href={`/case/${file.caseId}`}>
                      {file.address}
                    </Link>
                    {fileSize(file.evidence.size) &&
                      ` · ${fileSize(file.evidence.size)}`}
                  </small>
                </span>
                {viewable(file.evidence.name) && (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Open ${file.evidence.name}`}
                    title="Open in a new tab"
                    disabled={working === `${file.caseId}/${file.evidence.id}`}
                    onClick={() => void fetchCaseFile(file, true)}
                  >
                    <ExternalLink size={18} aria-hidden="true" />
                  </button>
                )}
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Download ${file.evidence.name}`}
                  title="Download"
                  disabled={working === `${file.caseId}/${file.evidence.id}`}
                  onClick={() => void fetchCaseFile(file, false)}
                >
                  {working === `${file.caseId}/${file.evidence.id}` ? (
                    <LoaderCircle className="spin" size={18} aria-hidden="true" />
                  ) : (
                    <Download size={18} aria-hidden="true" />
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="small muted">
        <Button asChild variant="ghost">
          <Link href="/inspections">Inspection photos are in My Inspections</Link>
        </Button>
      </p>
    </Shell>
  );
}
