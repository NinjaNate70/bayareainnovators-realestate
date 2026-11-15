# Tenant Shield Screen Specifications

Phase 1 review draft. Read MASTER.md first. ASCII drawings show hierarchy, not
fixed pixel widths. Desktop starts at 1024px; mobile includes tablet below it.
Every example amount, rule ID, date and photo is fixture content. "CA-R01" is
a placeholder ID, not a verified statute citation.

## Shared behavior

One main heading and main landmark, skip link, visible focus, semantic controls,
>=44px targets, 16px inputs, zoom enabled. Source-order reading matches layout.
Route changes focus the main heading; tab navigation preserves its link focus.
Error summary focuses only after failed submit, and links to inline errors.
Draft edits survive back/step changes; announce save success/failure honestly.
Never claim persistence before an actual draft-save result.

Global mobile bar: Home | New case | Current case (only once available).
Case mobile bar: Audit | Photos | Letter | Replies, with Home in case header.
Desktop shows these as grouped sidebar links. URLs: /, /case/new?step=letter
(details/photos/review), /case/[id]?tab=audit (photos/letter/replies).
Only completed wizard steps can be jumped to. A direct URL to a locked step
returns to the first incomplete step with an explanation and preserved inputs.
No auth, payment, roommate, multi-state, or landlord portal screens.

Every empty/loading/error spec below inherits a stable shell and a visible escape
path. Analysis statuses describe real work; show indeterminate feedback without a
fake percent. A timed-out operation shows Retry with retained inputs. Failed
read requests retain the last loaded content with a stale-data label. Distinguish
route fetch skeletons from analysis. Fixture mode visibly says "Demo case".

## 1. Landing — /

Purpose: renter understands outcome and starts one case. Title: "Understand your
deposit deductions." Supporting copy describes evidence, four verdicts, and a
draft letter. Primary Start my case. Secondary View demo case. Show three steps
and a small example charge with a source chip. Only publish genuine claims.
Returning user sees Resume case. Footer has scope, Not legal advice, and help.

Mobile:
```text
+----------------------------------+
| Tenant Shield              Help  |
| Understand your deposit          |
| deductions.                      |
| Review charges with your evidence|
| and California rule references.  |
| [Example: Disputable / Scale]    |
| Cleaning $150   [CA-R01 source]   |
| 1 Upload  2 Review  3 Draft       |
| California / Move-out only       |
| Not legal advice                 |
| [View demo case]                 |
|----------------------------------|
| [        Start my case        ]  | <- pinned action
| Home       New case              | <- global nav
+----------------------------------+
```

Desktop:
```text
+---------------+------------------------------------------------------+
| Tenant Shield | Home                                      Help       |
| > Home        | Understand your deposit | Example charge             |
| New case      | deductions.             | Scale / Disputable         |
|               | Supporting copy         | $150 [CA-R01 source]       |
|               | [Start my case] [Demo]  | [View basis]               |
|               | Upload -> Review -> Draft                            |
|               | California / Move-out / Not legal advice             |
+---------------+------------------------------------------------------+
```

States:
- Empty: first visit is the populated explanatory landing; no empty dashboard.
  Resume area says "Your first case starts here" when there is no case.
- Loading: reserve resume card space while retrieving draft; static explanation
  and Start remain usable. Analysis is never initiated from the landing.
- Error: "We couldn't load your saved case. Try again." Retry in resume area;
  Start and demo remain available. Do not imply the case was deleted.

## 2. Case wizard — /case/new

Purpose: collect minimum evidence, then let renter confirm facts before analysis.
Lease is supported in Letter step alongside the deduction letter. Photos optional.
No duplicate date/charge entry when extraction succeeded. Letter missing path
allows manual deduction entry or "No deduction letter received"; absent sources
must later produce Need more info. Details collects lease optionally, confirmed
California address, move-out date, deposit paid, deductions/amount returned,
date letter received (or unknown), and extracted charge names/amounts.
Date ambiguities are visible; no deadline based on guessed facts.

Mobile — same frame through all four steps:
```text
+----------------------------------+
| [Home] New case       Save & exit |
| Step 1 of 4: Letter              |
| 1 Letter > 2 Details > 3 Photos   |
|                          >4 Review|
| [ active step content below ]    |
| Help: You can come back to this.  |
| Not legal advice                 |
|----------------------------------|
| [Back]        [Continue]         | <- pinned
| Home       New case              |
+----------------------------------+
```

Desktop — all steps use this frame:
```text
+---------------+------------------------------------------------------+
| Tenant Shield | New case                                Save & exit  |
| Home          | 1 Letter -- 2 Details -- 3 Photos -- 4 Review          |
| > New case    | +----------------------------------+ +-------------+ |
|               | | Active step content              | | Why we ask  | |
|               | | Form, evidence, or review        | | Help        | |
|               | +----------------------------------+ +-------------+ |
|               | [Back]                         [Continue / Run audit]|
+---------------+------------------------------------------------------+
```

### 2.1 Letter

Short spec: choose deduction letter (PDF/JPG/PNG, provisional 10MB per file),
optional lease PDF/image. Explain provisional limits before file selection.
Separate file rows show filename, size, type, upload/extraction state, Remove,
and retry. Extraction is previewed before acceptance; original stays intact.

Active content — mobile / desktop:
```text
MOBILE                           DESKTOP
+---------------------------+    +--------------------------------------+
| Upload deduction letter   |    | Deduction letter | Optional lease    |
| [FileUp]                  |    | [Choose file]    | [Choose file]     |
| [Choose file] or drop     |    | file.pdf / Ready | lease.pdf / Ready |
| PDF/JPG/PNG, up to 10MB    |    | [Preview] [Remove]                  |
| Add lease (optional)      |    | [No deduction letter received]       |
| [Choose lease]            |    +--------------------------------------+
| [No letter received]      |
+---------------------------+
```

States:
- Empty: upload prompt plus no-letter/manual alternative; Continue explains
  required evidence or selection rather than silently doing nothing.
- Loading: real upload progress if known; then "Reading your deduction letter"
  in a polite status. Continue waits for extraction or offers manual entry after
  failure; no fabricated charges.
- Error: identify file and cause (unsupported format/too large/unreadable/network);
  Choose another, Retry, or Enter manually. Retain successful files.

### 2.2 Details

Short spec: confirm extracted charge rows and dates, show source page beside each
extracted field, mark unconfirmed values. Missing fields remain empty/Unknown,
not guessed. Editable rows have named controls; totals reconcile before Review.
Use explicit received vs sent vs move-out labels. A second photo of the letter
must not create duplicate deductions.

```text
MOBILE                           DESKTOP
+---------------------------+    +--------------------------------------+
| Confirm the details       |    | Confirm details      | Source preview|
| Move-out [date] [source]  |    | dates, deposit       | letter page 1 |
| Deposit [$]               |    | charge rows/amounts  | [Enlarge]     |
| Received [date / Unknown] |    | [source per field]   |               |
| Cleaning [$150] [p1]      |    | [Add charge]         |               |
| [Edit] [Add charge]       |    +--------------------------------------+
| Unconfirmed: 2 fields     |
+---------------------------+
```

States:
- Empty: manual fields and Add charge after no-letter path. Clearly indicate
  which missing facts prevent money/deadline estimates and allow Unknown where safe.
- Loading: reserved field rows during extraction; already entered fields stay
  usable and must not be overwritten by late extraction without review.
- Error: focus linked summary ("Confirm move-out date", "Charge total doesn't
  match deductions") and retain inline errors. No red styling.

### 2.3 Photos

Short spec: optional before/after pairs by room or charge. Pair selectors and
Move up/down buttons substitute for drag; each evidence ID is stable. Date/source
labels distinguish user-provided dates from metadata. Support missing before
or after image; don't imply comparable photos exist.

```text
MOBILE                           DESKTOP
+---------------------------+    +--------------------------------------+
| Add photos (optional)     |    | Room/charge [select]                 |
| Room/charge [select]      |    | Move-in          | Move-out          |
| Move-in [Choose photos]   |    | [Choose photos]  | [Choose photos]   |
| Move-out [Choose photos]  |    | P01 [thumbnail]  | P02 [thumbnail]   |
| P01 / P02 [Change pair]   |    | [Change pair] [Remove]               |
| [Skip photos for now]     |    +--------------------------------------+
+---------------------------+
```

States:
- Empty: explicit "You can run an audit without photos" plus Skip photos for now.
- Loading: per-file progress and reserved thumbnail slots; finished pairs remain.
  No photo analysis conclusion in an upload indicator.
- Error: failed thumbnail/file shows reason + retry/remove; retain other photos,
  continue without failed file after explicit acknowledgement.

### 2.4 Review / Run audit

Short spec: readable recap of evidence, confirmed money/dates and missing items.
Edit links return to respective steps. Explain files will be analyzed and results
are informational; preserve original evidence. Run audit is the only primary CTA.
No demand-letter generation automatically.

```text
MOBILE                           DESKTOP
+---------------------------+    +--------------------------------------+
| Ready to review charges?  |    | Case details [Edit] | Evidence [Edit] |
| Letter 1 / Lease 1 [Edit] |    | deposit, dates      | file inventory  |
| 6 charges [Edit]          |    | 6 charge summary    | 2 photo pairs   |
| 2 photo pairs [Edit]      |    | Missing evidence / analysis scope    |
| Missing: receipt         |    | Not legal advice                     |
| Files used in analysis   |    | [Back]                  [Run audit]  |
+---------------------------+    +--------------------------------------+
```

States:
- Empty: incomplete recap identifies missing step; action Return to details.
  A case with no charges/evidence cannot produce a completed audit.
- Loading: on submit replace review body with reserved results structure and
  "Analyzing your evidence"; phases Reading charges / Checking cited rules /
  Comparing available photos / Preparing summary, updated only by actual state.
  Disable duplicate submit; allow safe Home with case status preserved. On
  completion navigate to /case/[id] and focus Audit heading.
- Error: "We couldn't finish the audit. Your case details are still here."
  Retry audit / Edit details. Never reveal an owed number from a failed run.
  Partial results are labeled incomplete and excluded from final range.

## 3. Case file — /case/[id]

Shared header: Home, case title/address, Demo badge when applicable, case status,
last analysis time, "Edit evidence". Editing creates Needs review state.
Audit is default; four destinations stay in the same order across device sizes.
Each claim opens the shared sheet/right panel with source-level detail.

### 3.1 Audit (default)

Spec: dominant owed range, method link, informational deadline badge, verdict
counts, then all charge cards (including Fair). Filters show count and a Clear
filters control. Each card: name, exact charge, icon + verdict, short rationale,
rule/photo evidence, View details. Charge detail: original deduction, basis,
missing evidence, paired photos, source citations and estimate contribution.
Primary Draft demand letter opens Letter with preview; no sending.

Mobile:
```text
+----------------------------------+
| [Home] Case: Cedar St   [Demo]    |
| Audit       [Edit evidence]      |
| +------------------------------+ |
| | YOU MAY BE OWED              | |
| | $650 - $900                  | | <- strongest hierarchy
| | Based on 3 disputed charges  | |
| | [How this is estimated]      | |
| +------------------------------+ |
| [Clock: Accounting date ...]    |
| All 6 | Fair 2 | ... (wrap)      |
| Cleaning $150                    |
| Scale / Disputable               |
| Reason [CA-R01] [P01 thumbnail]  |
| [View details]                   |
| ... other charges ...            |
|----------------------------------|
| [      Draft demand letter    ]  |
| Audit    Photos   Letter Replies |
+----------------------------------+
```

Desktop:
```text
+-------------+-------------------------------------------------------+
| Home        | Cedar St / Audit                         Edit evidence|
| New case    | +---------------------------------------------------+ |
| CASE        | | You may be owed $650 - $900 [How estimated]        | |
| > Audit     | | 3 included charges / informational range          | |
| Photos      | +---------------------------------------------------+ |
| Letter      | [Accounting deadline]    [Draft demand letter]        |
| Replies     | Filters                                                |
|             | charge cards + sources     | detail side panel (open)|
|             | Fair items remain visible  | source / photo / scope  |
+-------------+-------------------------------------------------------+
```

States:
- Empty: case exists but unaudited -> "Your evidence is ready. Run an audit."
  No cases/not found -> explanation and Start case/Home. Zero filter matches ->
  Clear filters. Zero disputed amount -> no range, evidence summary.
- Loading: skeleton owed area WITHOUT amount; phase status and progress
  indicators with actual information only. Reserve charge list height. If rerun,
  mark old estimate out of date; do not present it as the new result.
- Error: failed audit -> retained case and Retry audit. Failure loading source
  -> localized source error and Retry source, no new conclusion. Missing support
  -> Need more info; unknown monetary estimate -> "More evidence needed".

### 3.2 Photos

Spec: charge/room filter, labeled before/after pairs, evidence IDs and captions.
Side-by-side where space permits; vertically stacked on narrow screens. Explicit
Previous/Next buttons and Pair selector. Optional compare slider cannot be the
only inspection method. Comparison findings use three labels: No visible change,
Possible ordinary wear, Possible repair; uncertainty remains explicit and each
observation cites the pair. Cost estimate only if sourced, otherwise unavailable.
Primary Add photos opens case evidence editor using the wizard photo controls;
unsaved replacements require review and mark the audit Needs review.

Mobile:
```text
+----------------------------------+
| [Home] Cedar St / Photos          |
| Charge [select]  [Pair 1 of 2]    |
| BEFORE - P01 / Bedroom           |
| [        full image          ]   |
| AFTER - P02 / Bedroom            |
| [        full image          ]   |
| Possible ordinary wear [P01/P02] |
| [View observation basis]         |
| [Previous]               [Next]  |
|----------------------------------|
| [           Add photos        ]  |
| Audit    Photos   Letter Replies |
+----------------------------------+
```

Desktop:
```text
+-------------+-------------------------------------------------------+
| Home        | Photos                          [Add photos]          |
| New case    | Charge [select] / Pair 1 of 2                          |
| Audit       | Before P01             | After P02                    |
| > Photos    | [image]                | [image]                      |
| Letter      | Observation + source pair | [View basis -> panel]     |
| Replies     | [Previous]                                  [Next]    |
+-------------+-------------------------------------------------------+
```

States:
- Empty: "No photos added. Your document audit is still available." Add photos.
  A one-sided pair labels "Move-in photo missing", never duplicates the after photo.
- Loading: stable image aspect-ratio and "Comparing this pair" status for a
  real comparison; photos can still be inspected. No synthesized difference.
- Error: image retry/reselect; comparison failure says analysis unavailable while
  originals remain viewable. Missing sources remove the observation claim.

### 3.3 Letter

Spec: editable demand draft with renter/landlord/address fields reused from case,
selected disputes, referenced sources, requested range and reply-by date.
Separate landlord accounting deadline from chosen reply date. Draft generation
requires reviewed audit; source links in preview open evidence panel. Renter
can edit wording and amounts. Changes are preserved; stale audit warns to review.
Primary Generate draft when empty, then Export letter when draft exists.
Secondary Copy text, print preview; keep original evidence unchanged.

Mobile:
```text
+----------------------------------+
| [Home] Cedar St / Letter          |
| [Accounting date: ...]           |
| Your reply-by date [Choose date] |
| Editable demand letter           |
| +------------------------------+ |
| | Dear ...                     | |
| | I am requesting ...          | |
| | [CA-R01] [P01/P02]            | |
| +------------------------------+ |
| Draft / Saved at ... (if saved)  |
| [Copy text] [Preview]            |
|----------------------------------|
| [         Export letter       ]  |
| Audit    Photos   Letter Replies |
+----------------------------------+
```

Desktop:
```text
+-------------+-------------------------------------------------------+
| Home        | Letter                      [Copy] [Export letter]    |
| New case    | Editable letter             | Preview / source panel |
| Audit       | Dear ...                    | refs and dates         |
| Photos      | requested amount...         | accounting deadline    |
| > Letter    | [source chips]              | reply-by date [Edit]   |
| Replies     | Saved status / Not legal advice                       |
+-------------+-------------------------------------------------------+
```

States:
- Empty: "Create a draft from the charges you reviewed" with included charges and
  Generate draft. Audit missing -> Review audit action; no guaranteed outcome.
- Loading: "Preparing a draft using your selected charges" status with reserved
  editor; do not overwrite existing edits until user chooses Replace draft.
- Error: generation retry retains previous draft and edits; failed export offers
  Retry export / Copy text. Save failure keeps editor content and shows unsaved
  status persistently. No success toast until export/copy actually succeeds.

### 3.4 Replies

Spec: paste landlord response or add supported response file, date received
(optional/unknown), and review extracted text. Generate reply using case and
reviewed response. Show Incoming response, Key points (each cited), Suggested
reply (editable) with rule/photo/response IDs adjacent to its claims.
Response excerpts cite response ID e.g. R01 + paragraph. The suggestion never
fabricates landlord promises. This screen is a drafting tool, not messaging.
Primary Prepare reply, then Copy reply. Sending happens outside the app.

Mobile:
```text
+----------------------------------+
| [Home] Cedar St / Replies         |
| Landlord response                |
| [Paste response text          ]  |
| [or Choose file]                 |
| Received on [date / Unknown]     |
| Key points [R01 paragraph 2]     |
| Editable suggested reply         |
| [Text... [CA-R01] [P01]        ]  |
|----------------------------------|
| [          Copy reply         ]  |
| Audit    Photos   Letter Replies |
+----------------------------------+
```

Desktop:
```text
+-------------+-------------------------------------------------------+
| Home        | Replies                           [Copy reply]        |
| New case    | Incoming R01            | Suggested reply (editable)  |
| Audit       | response text           | rationale [CA-R01] [P01]    |
| Photos      | Received date           | [Review evidence -> panel]  |
| Letter      | [Prepare reply]         | saved state                 |
| > Replies   | Response history (only existing items)                |
+-------------+-------------------------------------------------------+
```

States:
- Empty: "When your landlord responds, add their message here." Paste or upload;
  Prepare reply explains why response text is needed. No fake conversation.
- Loading: "Preparing a reply from this response and your case evidence";
  retain incoming text, prevent duplicate generation, allow reviewing sources.
- Error: extraction or generation retry preserves incoming response and edited
  reply. Unsupported claims become Need more info prompts; never invent legal
  conclusions. Copy failure leaves selectable draft and Retry copy.

## UX and accessibility review of these specifications

This is a specification audit, not a claim of tested browser behavior.
Source: skill quick-reference.md categories 1–10, generator checklist, searches
for error summary, unobscured focus, dragging alternatives, and shadcn focus.

| Check | Finding / fix incorporated | Phase 2 verification |
| --- | --- | --- |
| Text contrast | Replaced pale muted labels with #52656D; measured pair ratios in MASTER | Check rendered text on final surfaces |
| Verdict meaning | Four unique text labels and icons, full wrap | Grayscale/color-vision review |
| Targets and inputs | 44px minimum targets, 48px buttons/fields, 16px input text | Measure touch bounds at 360px |
| Focus visibility | Dual light/dark rings, skip link, ordered landmarks | Keyboard through each route |
| Fixed bars | CTA above nav, reserved measured offset, viewport keyboard policy | Small phone, landscape, editor focus |
| Error handling | Linked summary + inline errors, preserved data, recovery | Trigger all form and request failures |
| Photo interaction | Picker, pair selector and buttons replace drag/swipe-only use | Keyboard/native file picker |
| Evidence trust | Source beside every claim; missing source -> Need more info | Test missing/failed source fixtures |
| Loading honesty | No money placeholder, fake %, or timed legal finding | Slow and failed analysis simulation |
| Navigation | One adaptive hierarchy; case context replaces global mobile tabs | Back/forward, direct query URLs |
| Modal semantics | One responsive Sheet, explicit Close/Escape, trap + return | Keyboard + screen reader, dirty editor |
| Text resizing | Wrap labels and IDs; no fixed text container heights | 200% zoom; 320 CSS px reflow |
| Motion | Reduced motion removes slide/shimmer/count-up | OS preference and rapid interaction |
| Performance | Reserved image/card dimensions, lazy below-fold images, font swap | Build + layout-shift inspection |
| Draft safety | Preserve edits on step/tab/back; dirty confirmation on replacement | Navigate away and retry/save failure |
| Deadline clarity | Accounting vs letter reply date separated; unknown facts visible | Unknown/elapsed/timezone fixtures |
| Theme | Light theme MVP; no untested theme switch | Verify every state in light theme |
| Content | Calm wording, no guarantees, no fake reviews/security claims | Copy and fixture review |
| Data visualization | Simple counts and itemized breakdown; no decorative chart | Text summary always available |
| Help/auth | Help stays in header; auth outside requested MVP | No hidden required login for demo |

Runtime checks pending approval and implementation: 360/375/390/768/1024/1440/1920px,
landscape, keyboard-only, screen reader status/focus, 200% zoom, reduced motion,
offline/retry, and real build. Do not mark these passed from a markdown review.

## Open questions for review

1. Confirm the final visible name: Tenant Shield (requested) versus existing
   Deposit Defense metadata and RenterShield repository notes. Draft uses Tenant Shield.
2. Confirm backend source schema and draft persistence capability before wiring;
   until then Phase 2 uses the explicitly labeled fixture case.
3. Who supplies the reviewed CA rules pack and accounting-deadline semantics?
   This design contains no verified statute or arbitrary legal reply deadline.
4. Confirm actual upload formats/limits; 10MB PDF/JPG/PNG is provisional UX copy.
5. PDF export versus print-to-PDF: draft assumes an accessible export path; use
   Copy text as recovery. No automatic sending or payment gate is specified.

## Phase 1 validation record

The specification checklist above was applied and its fixes incorporated. Palette
ratios were calculated from sRGB relative luminance. Runtime UI/accessibility
testing remains pending Phase 2. A baseline `npm run build` was attempted; it
could not start because dependencies are not installed (`next` not recognized).
No application source or dependency manifest was changed to resolve this during
the documentation phase.
