# Tenant Shield UI implementation handoff

## Branch and scope

All work is on `feature/ui-ux-design`. No main commits, merges, rebases, force pushes,
or pull requests were used. Each requested screen has its own commit and production
build check. The design follows UI/UX Pro Max's verified searches recorded in MASTER.md.

## Run and demo

Use Node 24, then `npm ci` and `npm run dev`. Open `/` or go directly to `/case/demo`.
For a wizard walkthrough, open `/case/new`, choose **Use example documents**, and
continue through Details, Photos, and Review. Run audit opens the six-charge case.

The example includes two Fair, two Disputable, one Likely not allowed, and one Need
more info charge. Its illustrative owed range is $650–$900. All claims have visible
source controls. Photo assets are explicitly labeled sample illustrations, not real
inspection photographs. Rule topics are illustrative and verification is pending.

Letter drafts are editable, persist locally, copy as text, download as `.txt`, and
support the browser's Print / save PDF flow. Replies quote supplied landlord text
and use a local editable template. Neither sends a message. The user's reply-by
date is separate from the labeled demo accounting-deadline example.

## Storage and backend integration

This is a frontend MVP. Real uploads are retained as originals in IndexedDB, with
case metadata and edits in localStorage in the same browser. Clearing browser site
data removes that local persistence. Uploaded content is not sent to an AI service.
Real cases get Need more info instead of inheriting fixture verdicts or estimates.
Edits to evidence mark the audit for review and suppress its earlier conclusions.

Search for `TODO(api)` to find the swap points:

- `lib/cases.ts`: authenticated case persistence and private evidence storage.
- `components/case-wizard.tsx`: extraction/confirmed facts and audit submission.
- `lib/fixtures/demo-case.ts`: reviewed versioned CA rules, sources, effective dates.
- `lib/estimate.ts`: server-provided evidence-supported recovery ranges.
- `components/photos-tab.tsx`: persisted pairing and vision comparison results.
- `components/letter-tab.tsx`: cited letter generation preserving user edits.
- `components/replies-tab.tsx`: response interpretation and cited reply generation.

Retain the frontend `types/case.ts` adapter types; agree on real response formats
before connecting APIs. No database migration or server API was modified.

## Tooling and verification

Tailwind 4 uses CSS-first tokens in `app/globals.css` and PostCSS configuration in
`postcss.config.mjs`. Shared shadcn-style components use Radix primitives for Sheet
focus/dismissal and Slot/CVA for Button composition; `components.json` supplies
shadcn aliases. Icons are Lucide SVGs.

The original experimental Turbopack CSS loader failed to start its worker even
outside the sandbox. Both dev and production scripts now use webpack with Tailwind's
standard PostCSS integration; package versions for Next/React were retained.

Checks: `npm run build`, `npm run lint`, `npm test`. Calculation tests cover the
fixture range, excluded verdicts, missing evidence, invalid ranges, deposit cap,
stale/real/unaudited cases, and date-only countdown behavior.

Final verification passed: production build, lint with no warnings, four calculation
tests, and a production Chrome workflow at widths 320–1920px. Browser checks include
real multi-file upload retention, IndexedDB reload, saved photo pairing, no fixture
estimate for real uploads, missing-case recovery, and 16px mobile inputs. Desktop
and mobile screenshots were inspected for the landing, audit, wizard, letter,
photos, and replies. Browser keyboard/interaction checks cover filter operation
and sheet dismissal with focus return. A full assistive-technology audit remains
outside these automated checks.

The browser print export produced a one-page PDF with the complete demand letter;
its text and rendered page were inspected. This is a print/save-PDF flow, while
the primary Export action downloads an editable text file.

`scripts/verify-ui.mjs` uses an existing Playwright installation. Set
`PLAYWRIGHT_PACKAGE` to its package directory if not locally installed, `CHROME_PATH`
to an available Chrome executable if needed, and optionally `TEST_ORIGIN`. Run
`node scripts/verify-ui.mjs` against the running app. Screenshots go to ignored
`output/ui-qa/`. The script checks responsive overflow, range, filters, sheet
focus return, draft persistence/export, photo/reply navigation, and the wizard.

The browser test caught a real bug: changing the action tray position on input
blur could move the target before mouse-up. The tray now stays stable during
focus changes. Fixed bars reserve scroll clearance and small-landscape layouts
put actions in normal flow. Reduced motion removes nonessential animation.

Next's dev runtime automatically appended its agent guidance to AGENTS.md;
the existing team rules were preserved. No unrelated backend contracts changed.

## Files added or changed in Phase 2

- App: `app/page.tsx`, `app/layout.tsx`, `app/globals.css`,
  `app/case/new/page.tsx`, `app/case/[id]/page.tsx`, `app/case/loading.tsx`,
  `app/case/error.tsx`.
- Screens: `components/landing.tsx`, `components/case-wizard.tsx`,
  `components/case-file.tsx`, `components/owed-card.tsx`,
  `components/letter-tab.tsx`, `components/photos-tab.tsx`,
  `components/replies-tab.tsx`.
- Shared: `components/shell.tsx`, `components/evidence.tsx`,
  `components/upload-zone.tsx`, `components/ui/button.tsx`,
  `components/ui/card.tsx`, `components/ui/sheet.tsx`, `components.json`.
- Case model/data: `types/case.ts`, `lib/cases.ts`, `lib/estimate.ts`,
  `lib/fixtures/demo-case.ts`, `lib/utils.ts`.
- Illustrations: `public/demo/before.svg`, `public/demo/after.svg`.
- Tooling/checks: `next.config.ts`, `postcss.config.mjs`, `package.json`,
  `package-lock.json`, `.gitignore`, `tests/estimate.test.mjs`,
  `scripts/verify-ui.mjs`, auto-generated `AGENTS.md` additions.
- Handoff: `design-system/IMPLEMENTATION.md`.
