import { demoCase } from "../fixtures/demo-case";
import { toRow } from "../db/mapping";
import { db, now, type FileRow } from "./database";
import { archiveLegacy } from "./legacy";
let pending: Promise<void> | undefined;
async function png(url: string) {
  const image = new Image();
  image.src = url;
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = 800;
  canvas.height = 600;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Image preview unavailable.");
  context.drawImage(image, 0, 0, 800, 600);
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Image preview unavailable."))),
      "image/png",
    ),
  );
}
function examplePdf(title: string, lines: string[]) {
  const escapePdf = (line: string) =>
    line.replace(/[^\x20-\x7e]/g, "-").replace(/[\\()]/g, "\\$&");
  const content =
    "BT /F1 16 Tf 50 740 Td (" +
    escapePdf(title) +
    ") Tj /F1 11 Tf " +
    lines.map((line) => "0 -24 Td (" + escapePdf(line) + ") Tj").join(" ") +
    " ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let text = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((o, i) => {
    offsets.push(text.length);
    text += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const start = text.length;
  text += `xref\n0 6\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => String(n).padStart(10, "0") + " 00000 n \n")
    .join("")}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
  return new Blob([text], { type: "application/pdf" });
}
export function initializeLocal() {
  pending ??= (async () => {
    await db.open();
    await archiveLegacy();
    if (await db.app_meta.where("meta_key").equals("demo_seed_v1").count())
      return;
    const response = await fetch("/api/local-bootstrap", { cache: "no-store" });
    if (!response.ok) return; // Sign-up still works if the operator has not configured demo seeding.
    const bootstrap = await response.json();
    if (!bootstrap.password_hash || !bootstrap.salt) return;
    const id = crypto.randomUUID(),
      caseId = crypto.randomUUID(),
      created_at = now();
    const value = structuredClone(demoCase);
    value.id = caseId;
    const blobs = [
      examplePdf("Itemized deductions - illustrative example", [
        "Tenant Shield demo evidence only. This is not a real landlord letter.",
        `Renter: ${value.renter} | Manager: ${value.landlord}`,
        value.address,
        `Move-out: ${value.moveOut} | Letter received: ${value.received}`,
        `Deposit paid: $${value.deposit.toFixed(2)} | Returned: $${value.returned.toFixed(2)}`,
        ...value.charges.map(
          (c) => `${c.id} ${c.name}: $${c.amount.toFixed(2)}`,
        ),
        "C01: Full repaint charged; compare illustrative bedroom photos P01/P02.",
        "C02: Flat cleaning fee; no receipt or work description attached.",
        "C03: Carpet age and replacement basis are not provided.",
        "C04: Demo check-out record notes an unreturned key; replacement $75.",
        "C05: Demo record acknowledges a broken handle; repair receipt $125.",
        "C06: Blind repair has no comparable photos or supporting receipt.",
        "Illustrative facts for testing only. Not a verified legal finding.",
      ]),
      examplePdf("Cedar Street lease - illustrative extract", [
        "Tenant Shield demo evidence only. This is not a real lease.",
        `Renter: ${value.renter}`,
        `Manager: ${value.landlord}`,
        `Rental: ${value.address}`,
        `Security deposit recorded for this example: $${value.deposit.toFixed(2)}`,
        "This extract supports the sample names, address and deposit amount.",
        "P01/P02 are illustrative bedroom views, not original tenant photos.",
        "A real lease and the reviewed rules pack must be checked separately.",
        "Illustrative facts for testing only. Not legal advice.",
      ]),
      await png("/demo/before.svg"),
      await png("/demo/after.svg"),
    ];
    const files: FileRow[] = value.evidence.map((e, i) => {
      const fileId = crypto.randomUUID(),
        bucket = i < 2 ? ("documents" as const) : ("photos" as const),
        path = `${id}/${caseId}/${fileId}-${i < 2 ? "document.pdf" : "photo.png"}`;
      delete e.url;
      e.type = blobs[i].type;
      e.size = blobs[i].size;
      e.fileId = fileId;
      e.path = path;
      e.bucket = bucket;
      return {
        id: fileId,
        user_id: id,
        case_id: caseId,
        bucket,
        path,
        mime_type: e.type,
        size: e.size,
        blob: blobs[i],
        original_name: e.name,
        created_at,
      };
    });
    await db.transaction(
      "rw",
      db.users,
      db.cases,
      db.files,
      db.app_meta,
      async () => {
        if (await db.app_meta.where("meta_key").equals("demo_seed_v1").count())
          return;
        if (!(await db.users.where("email").equals(bootstrap.email).count())) {
          await db.users.add({
            id,
            email: bootstrap.email,
            password_hash: bootstrap.password_hash,
            salt: bootstrap.salt,
            password_iterations: bootstrap.iterations,
            password_version: 1,
            name: "Alex Morgan",
            email_verified_at: created_at,
            created_at,
            updated_at: created_at,
            terms_version: "demo",
            privacy_version: "demo",
            consented_at: created_at,
          });
          await db.cases.add({
            ...toRow(value),
            user_id: id,
            created_at,
            updated_at: created_at,
            revision: 1,
          });
          await db.files.bulkAdd(files);
        }
        await db.app_meta.add({
          id: crypto.randomUUID(),
          meta_key: "demo_seed_v1",
          value: "seeded",
          updated_at: created_at,
        });
      },
    );
  })().catch((e) => {
    pending = undefined;
    throw e;
  });
  return pending;
}
