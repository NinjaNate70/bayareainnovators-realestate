"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import {
  Download,
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
import { getFile, unwrap } from "@/lib/cases";
import { fromRow } from "@/lib/db/mapping";
import { supabase } from "@/lib/supabase/client";
import {
  displayName,
  fileSize,
  libraryBucket,
  libraryFileError,
  libraryFolder,
  storedName,
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
      else setError("We couldn’t load your documents. Refresh to try again.");
      setSaved([]);
      return;
    }
    setSetup(false);
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
    if (!list || !supabase || !userId || latch.current) return;
    latch.current = true;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      let count = 0;
      for (const file of Array.from(list)) {
        const problem = libraryFileError(file);
        if (problem) throw new Error(problem);
        const { error } = await supabase.storage
          .from(libraryBucket)
          .upload(`${libraryFolder(userId)}/${storedName(file.name)}`, file, {
            contentType: file.type,
          });
        if (error)
          throw new Error(
            /bucket/i.test(error.message)
              ? "Your document library isn’t set up yet."
              : `${file.name} couldn’t be saved. Try again.`,
          );
        count += 1;
      }
      setStatus(`${count} document${count === 1 ? "" : "s"} saved.`);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The file couldn’t be saved.",
      );
    } finally {
      await loadSaved();
      setBusy(false);
      latch.current = false;
    }
  }
  async function open(path: string) {
    if (!supabase) return;
    setError("");
    // Open the tab first so the browser treats it as the renter's own click.
    const tab = window.open("", "_blank", "noopener=no");
    const { data, error } = await supabase.storage
      .from(libraryBucket)
      .createSignedUrl(path, 300);
    if (error || !data) {
      tab?.close();
      setError("We couldn’t open that document. Try again.");
      return;
    }
    if (tab) tab.location.replace(data.signedUrl);
    else window.location.assign(data.signedUrl);
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
  async function openCaseFile(file: CaseFile) {
    setError("");
    const tab = window.open("", "_blank", "noopener=no");
    try {
      const url = await getFile(file.caseId, file.evidence);
      if (tab) tab.location.replace(url);
      else window.location.assign(url);
    } catch {
      tab?.close();
      setError(`We couldn’t open ${file.evidence.name}. Try again.`);
    }
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
      <p className="sr-only" role="status">
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
        ) : setup ? (
          <p className="notice">
            Your document library isn’t set up yet. Ask your project admin to
            run the document library migration in Supabase.
          </p>
        ) : (
          <>
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
                  PDF, JPG or PNG · up to 10MB each
                </span>
                <input
                  id={inputId}
                  type="file"
                  multiple
                  disabled={busy}
                  accept="application/pdf,image/jpeg,image/png"
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
                    <button
                      type="button"
                      className="icon-button"
                      aria-label={`Open ${file.name}`}
                      onClick={() => void open(file.path)}
                    >
                      <Download size={18} aria-hidden="true" />
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
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Open ${file.evidence.name}`}
                  onClick={() => void openCaseFile(file)}
                >
                  <Download size={18} aria-hidden="true" />
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
