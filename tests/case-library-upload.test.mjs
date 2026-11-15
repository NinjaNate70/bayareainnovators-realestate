import assert from "node:assert/strict";
import { test } from "node:test";
import * as library from "../lib/document-library.ts";

const id = "df2d7dbd-1b1d-4f0e-bf9b-5f4a90f87d01";
const maxBytes = 10 * 1024 * 1024;
const object = (filename, mimetype, size = 1024) => ({
  id,
  name: `${id}-${filename}`,
  metadata: { mimetype, size },
});

test("case photo pickers only offer compatible originals", () => {
  assert.equal(typeof library.caseLibraryFile, "function");
  for (const kind of ["before", "after"]) {
    assert.deepEqual(library.caseLibraryFile(object("wall.jpg", "image/jpeg"), kind), {
      id,
      objectName: `${id}-wall.jpg`,
      name: "wall.jpg",
      type: "image/jpeg",
      size: 1024,
    });
    assert.equal(library.caseLibraryFile(object("lease.pdf", "application/pdf"), kind), null);
    assert.equal(library.caseLibraryFile(object("wall.heic", "image/heic"), kind), null);
  }
});

test("case document pickers accept PDFs and images within the case limit", () => {
  assert.equal(library.caseLibraryFile(object("lease.pdf", "application/pdf", maxBytes), "lease")?.name, "lease.pdf");
  assert.equal(library.caseLibraryFile(object("deductions.png", "image/png"), "letter")?.type, "image/png");
  assert.equal(library.caseLibraryFile(object("receipt.pdf", "application/octet-stream"), "other")?.type, "application/pdf");
  assert.equal(library.caseLibraryFile(object("big.pdf", "application/pdf", maxBytes + 1), "other"), null);
  assert.equal(library.caseLibraryFile(object("empty.pdf", "application/pdf", 0), "other"), null);
});

test("library placeholders and names outside the current folder are not selectable", () => {
  assert.equal(library.caseLibraryFile({ ...object("wall.png", "image/png"), id: null }, "before"), null);
  assert.equal(library.caseLibraryFile({ ...object("wall.png", "image/png"), name: "../wall.png" }, "before"), null);
  assert.equal(library.caseLibraryFile({ ...object("wall.png", "image/png"), name: ".emptyFolderPlaceholder" }, "before"), null);
});

test("a stale case save preserves concurrent library copies and respects explicit removal", () => {
  const local = { id: "D-local" };
  const existing = { id: "D-existing", libraryFileId: "existing" };
  const concurrent = { id: "D-concurrent", libraryFileId: "concurrent" };
  const removed = { id: "D-removed", libraryFileId: "removed" };
  assert.deepEqual(
    library.mergeCaseLibraryEvidence([local, existing, removed], [existing, concurrent, removed], new Set([removed.id])),
    { evidence: [local, existing, concurrent], addedSinceSnapshot: true },
  );
  assert.deepEqual(
    library.mergeCaseLibraryEvidence([removed], [], new Set()),
    { evidence: [], addedSinceSnapshot: false },
  );
});
