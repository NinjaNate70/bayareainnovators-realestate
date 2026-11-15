# Auth implementation and local demo guide

Implemented on `feature/auth-ui`, based on the unmerged `feature/ui-ux-design`
branch. No changes, commits or pushes target main. No PR is opened.

## Supabase backend

`NEXT_PUBLIC_BACKEND=supabase` selects the adapters in `lib/auth/supabase.ts`,
`lib/db/supabase.ts` and `lib/storage/supabase.ts`, which share the browser client in
`lib/supabase/client.ts` with My Inspections. Setup steps are in the README under
"Connect sign-in and cases to Supabase". The rest of this guide describes the local
demo backend, which stays the default.

- Email links use Supabase's default templates. Confirmation returns to `/login`,
  reset to `/reset-password` and email change to `/account`, each already signed in.
- A reset link's session is held back until the new password is saved, then every
  session ends and the renter signs in again.
- Drafts stay in the browser (Dexie `drafts`), filed under the Supabase user id.
- Account deletion goes through `POST /api/account/delete`, which checks the session
  and current password, removes the renter's files, then deletes the Auth user.

## Run the demo

1. Install the branch's dependencies with `npm ci`.
2. Configure an ignored `.env.local` before the first browser load:

   ```dotenv
   NEXT_PUBLIC_BACKEND=local
   NEXT_PUBLIC_ENABLE_OAUTH=false
   DEMO_PASSWORD=choose-a-long-demo-password
   ```

3. Run `npm run dev` and open `/login`. The development credential panel contains
   `demo@tenantshield.app` and the configured password. **Use demo account** fills
   the fields; **Sign in** opens the owned six-charge example case.
4. For a new account, open `/signup`. The **Outbox · local demo** panel on Check
   your email contains a **Verify email** link. Open it and press **Verify email**,
   then **Continue to your case**. No real email is sent. Reset and email-change
   messages use the same panel. Links only work in the originating browser.
5. To run browser tests against a separate local server:

   ```text
   npm run dev -- --hostname 127.0.0.1 --port 3012
   npm run test:e2e
   ```

   In another terminal, run `npm test` and `npm run test:auth`. Install the browser
   once with `npx playwright install chromium` if it is not present.

The workspace's `.env.local` was created with a generated password when no file
existed. It is ignored and never committed. Other machines need their own file.
The seed runs once per browser database; changing the environment password does
not overwrite an existing account, and deletion does not recreate the seed.

Production/local builds hide both credentials and Outbox and reject signup/reset/
resend sending with an explicit delivery-not-connected message. A previously
verified demo account can sign in with the operator-supplied password. Supabase
is intentionally not connected; selecting `supabase` throws `not implemented`.

## What is implemented

- Sign in, sign up with a live requirements checklist, check email/resend/change
  address, explicit verification, forgot/reset, invalid/expired links, account
  menu, owned case list, settings and typed account deletion.
- Verified accounts are required for every `/case/*` path, including `/case/demo`,
  and `/account`. The provider masks protected content while resolving identity.
  Each data/file operation also checks the current session and ownership.
- Safe `returnTo` handling preserves path/query/fragment, rejects external and
  disguised redirects, and checks ownership after login. Otherwise the user gets
  their most recent case or `/case/new`; there is no empty dashboard.
- Desktop sidebar and mobile-header account controls reuse the existing Sheet.
  OAuth remains absent from the DOM until both the flag and a future adapter
  capability support it.
- Dexie stores users, sessions, case records, original Blob files, single-use
  token hashes, flows, rate limits, owner-bound drafts, seed state and legacy
  archives. Only the active session token is written to localStorage.
- Passwords use PBKDF2-HMAC-SHA-256, 310,000 iterations and random salts. Verify
  links expire in 24 hours; reset links in one hour. Reset consumes the token
  with the password write and revokes prior sessions. Five failed sign-ins lock
  the email for five minutes, including nonexistent emails.
- Case screens keep their existing view models through an async mapping adapter;
  durable fields are snake_case, entity IDs are UUIDs and money is integer cents.
  Evidence display IDs remain separate from internal file/charge UUIDs.
- Expiry retains edits and position in an owner-bound checkpoint and a root memory
  buffer. Selected files stay in memory during an interrupted upload and resume
  only after the same user signs in. Another account cannot inherit the draft.
  Storage failures explicitly ask the user to keep the tab open; crash survival
  is not promised when the browser refuses storage.
- Legacy records and original bytes are copied to a durable unassigned archive
  before exact legacy duplicates are cleaned. Import requires an explicit choice
  in Account settings and is idempotent. Imported originals remain preserved;
  deleting the owning account removes its imported case/archive copies.
- Typed `DELETE` plus the current password removes the account's new database
  records in one transaction, ends its sessions and revokes tracked Blob URLs.

## Actual client boundary

UI components import AuthClient/DataClient/StorageClient through `lib/backend.ts`
and the case view-model adapter. They do not import Dexie or IndexedDB.

The public User/Session shapes and `{ data, error }` responses follow Supabase's
useful fields. `flow_id`, resend/flow/Outbox helpers, checkpoint retention and
initialization are explicit local workflow extensions. Local reset validation
returns no normal session; `updateUser` accepts a token option and consumes it
atomically with the new hash. The Supabase adapter must map that recovery flow
to Auth callbacks while preventing case access until recovery is complete.
`deleteUser` is a custom self-delete extension requiring a future server endpoint.

`supabase/schema.sql` and `supabase/storage.sql` are prepared for coordinated
review, not applied. They define owned cases/files, RLS and private buckets with
owner/case prefixes. Remote Storage cleanup, account deletion, session validation,
revision enforcement and actual email delivery still need the Supabase adapter
and backend integration described in DATA.md.

## Verification

Final validation passed:

- `npm run build`, `npm run lint` and `npx tsc --noEmit`.
- `npm test`: four existing case/estimate tests.
- `npm run test:auth`: five data/client tests covering ownership, original bytes,
  lockouts, expiring/single-use tokens, deletion and idempotent legacy migration.
- `npm run test:e2e`: five Chromium journeys, followed by targeted reruns after
  the final changes. They cover signup/verification, case/photo persistence,
  interrupted uploads, unsaved-letter recovery, account isolation, cancellation
  and typed deletion, recovery links, demo seed idempotence, name/email/password
  changes, per-email lockout behavior and success feedback.
- Axe WCAG A/AA checks returned no violations on login, signup, forgot password,
  invalid reset, verification-link request, account settings and deletion dialog.
- Reflow at 320/375/390/768/1440 CSS px, 812x375 landscape, reduced motion and a
  720 CSS px / DPR 2 equivalent of a 1440px viewport at 200% zoom. Native browser
  zoom and manual assistive-technology checks remain manual review items.
- Production smoke check: protected redirect and return path, verified demo
  sign-in, development controls absent, no demo password in the bootstrap response,
  zero password matches in generated client JavaScript, and complete example PDFs
  containing the six fixture charge IDs/descriptions.
- Repeated Windows production builds passed with the guarded cleanup hook.

The tests exercise real Chromium interactions and fake IndexedDB adapter tests;
they are not a claim of manual screen-reader certification.

Skill checklist fixes implemented: associated labels/errors, blur validation,
first-invalid-field focus after error rendering, reserved feedback space so blur
errors cannot move a submit target during a click, native Enter submission,
latched requests, password-manager/paste support, show/hide labels, non-color
status cues, 44px targets, 16px inputs, responsive reflow and reduced motion.
Existing navy/green tokens and DM Sans/Manrope remain in use. Red stays exclusive
to the existing Likely not allowed verdict.

On this Windows synced workspace, repeated Next build cleanup hit EPERM on
generated directory reparse points. `prebuild` now verifies the exact generated
`.next` path and uses native PowerShell cleanup on Windows. It does not touch
source or browser data. Stop the development server before `npm run build`.
Other platforms retain Next's normal cleanup. Stop any running Next server before
building; generated output is owned by the build.

## Review and integration limits

- Browser-local auth is a development/demo workflow, not real account security.
  Someone controlling browser storage can inspect or modify it.
- Terms and Privacy are clearly labeled review drafts. The requested trust copy
  keeps its `TODO(legal)` annotation and needs approved policy wording.
- No live extraction/legal analysis, email provider, OAuth or Supabase connection
  was added. Existing case findings remain illustrative or evidence-review-needed.
- A denied/quota-exhausted storage environment requires recovery while the tab
  remains open. Browser/site-data deletion naturally removes local records.

## Changed files

Auth routes and application integration:
`app/account/page.tsx`, `app/api/local-bootstrap/route.ts`, `app/case/layout.tsx`,
`app/check-email/page.tsx`, `app/forgot-password/page.tsx`, `app/login/page.tsx`,
`app/reset-password/page.tsx`, `app/signup/page.tsx`, `app/verify-email/page.tsx`,
`app/privacy/page.tsx`, `app/terms/page.tsx`, `app/layout.tsx`, `app/globals.css`.

Shared auth UI:
`components/auth/account-menu.tsx`, `account.tsx`, `email.tsx`, `form.tsx`,
`frame.tsx`, `login.tsx`, `provider.tsx`, `recovery.tsx`, `signup.tsx`.

Existing UI integration:
`components/case-file.tsx`, `case-wizard.tsx`, `evidence.tsx`, `landing.tsx`,
`shell.tsx`, `upload-zone.tsx`, `components/ui/sheet.tsx`.

Interfaces/adapters:
`lib/auth/client.ts`, `drafts.ts`, `validation.ts`, `lib/backend.ts`, `lib/cases.ts`,
`lib/db/client.ts`, `mapping.ts`, `lib/storage/client.ts`, `types/backend.ts`,
`types/case.ts`.

Local backend:
`lib/local/auth.ts`, `core.ts`, `crypto.ts`, `data.ts`, `database.ts`,
`initialize.ts`, `legacy.ts`, `storage.ts`.

Prepared migration files:
`supabase/schema.sql`, `supabase/storage.sql`.

Tests/tooling/docs:
`tests/backend.spec.ts`, `tests/auth-ui.spec.ts`, `playwright.config.ts`,
`scripts/prepare-build.mjs`, `package.json`, `package-lock.json`, `.gitignore`,
`design-system/AUTH.md`, `DATA.md`, `MASTER.md`, `AUTH-IMPLEMENTATION.md`.
Local credentials, screenshots, traces and generated build output are not committed.
