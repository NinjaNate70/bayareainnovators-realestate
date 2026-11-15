# Tenant Shield

Tenant Shield helps California renters organize evidence about their security deposit, understand their landlord’s deductions, and prepare a response. It brings inspection photos, leases, letters, and receipts into one workspace so renters can see what supports each finding and what evidence they still need. It provides information and editable drafts, not legal advice.

## What renters can do

1. **Document the rental.** In My Inspections (`/inspections`), save move-in and move-out photos by lease and room. Compare photos of the same spot and keep the originals. In the case’s Photos tab, compare uploaded evidence for a specific charge.
2. **Build a case.** Start at `/case/new` with the landlord’s itemized deduction letter, a lease, or other supporting files. Enter charges manually or, with hosted analysis configured, review and correct the charges read from the letter. Add context about roommates, shared costs, or agreements.
3. **Review charges.** The Audit tab in `/case/<id>` shows findings for each deduction, links to supporting evidence, and flags what needs more information. The hosted case assistant can answer questions using the case and the [California Courts guide summarized in the app](lib/deposit-guide.ts).
4. **Prepare a response.** The Letter and Replies tabs build editable drafts from the case. Renters review the text, then copy it into their own email app.
5. **Keep records handy.** My Documents (`/documents`) lists case attachments and, in hosted mode, lets renters keep a private library and reuse saved files in a case.

## Run it locally

Use **Node.js 24** and npm. From the repository root:

```bash
npm ci
npm run dev
```

Open [localhost:3000](http://localhost:3000) and choose **Explore the example case** to see the workflow without signing in. By default, accounts, cases, and attachments use IndexedDB in the current browser. To try the case wizard without external services, sign up with a test email and open the verification link in the local **Outbox**. No email is sent. You can enter charges and try the letter and reply templates locally.

To seed the sample case, set `DEMO_PASSWORD` to a long test password in an ignored `.env.local` before opening the app. On `/login`, choose **Use demo account** and sign in. See the [local auth guide](design-system/AUTH-IMPLEMENTATION.md) for more on demo accounts and browser storage.

My Inspections uses Supabase even when cases are in local mode. To share one sign-in across inspections, cases, and documents, use hosted mode below. Local demo data stays in the browser when switching modes.

## Connect sign-in and cases to Supabase

1. Create a Supabase project and apply the migrations in [`supabase/migrations/`](supabase/migrations/) in filename order. On an existing project, apply only the migrations it still needs. The migrations are the source of truth for setup.
2. Enable email and password sign-in in Supabase Auth. Set **Site URL** to the deployed app’s origin. Allow the following redirect paths for each origin you test, including `http://localhost:3000` for local development: `/login`, `/reset-password`, `/account`, and `/inspections`. For optional Google sign-in, enable the Google provider, allow `/auth/callback`, and set `NEXT_PUBLIC_ENABLE_OAUTH=true`. Configure custom SMTP before relying on confirmation or recovery emails for real renters.
3. Copy [`.env.example`](.env.example) to `.env.local`. Set `NEXT_PUBLIC_BACKEND=supabase` and replace the placeholders with the Supabase project URL and publishable key. Set `SUPABASE_SECRET_KEY` for account deletion and inspection comparisons.
4. For automated analysis, set `ANTHROPIC_API_KEY`. Selected case tools can use `GEMINI_API_KEY` as a fallback. Inspection comparisons require the Anthropic key. Set `ANTHROPIC_FAST_MODE=off` if you prefer standard speed and pricing. Keep model keys and the Supabase secret on the server. The Supabase URL and publishable key are safe to expose.
5. For Vercel, use the Next.js framework preset, add the same applicable variables to the intended environment, and redeploy. Use a separate Supabase project for previews that need isolation from production data.

The inspection migrations add leases, rooms, private photos, comparison results, and the older move-out audit queue. The case migrations add cases, private evidence, situation notes, and the document library. Repair price ranges are optional and come from matching, sourced entries in `repair_price_bands`.

The current Inspections page compares individual photo pairs without a worker. To process existing queued audits, run `node scripts/audit-worker.mjs` with `AUDIT_APP_URL` set to the app’s origin and `AUDIT_WORKER_SECRET` set to the same secret as the [server endpoint](app/api/inspections/audit/worker/route.ts). A protected Vercel preview may also require `VERCEL_AUTOMATION_BYPASS_SECRET` on the worker.

Original inspection photos stay in private storage; comparisons use prepared copies. Hosted analysis can send relevant case details, documents, or photos to an external model service. Use sample evidence when testing that flow.

## Where to find the code

The app uses Next.js App Router, React, and TypeScript. Supabase provides hosted authentication, Postgres, and private file storage. The local backend uses Dexie over IndexedDB.

| If you’re changing… | Start here |
| --- | --- |
| Homepage and workspace navigation | [`app/page.tsx`](app/page.tsx), [`components/landing.tsx`](components/landing.tsx), and [`components/shell.tsx`](components/shell.tsx) |
| Case intake, evidence uploads, or charge results | [`app/case/`](app/case/), [`components/case-wizard.tsx`](components/case-wizard.tsx), [`components/case-file.tsx`](components/case-file.tsx), and [`lib/cases.ts`](lib/cases.ts) |
| Case analysis or letter and reply drafts | [`app/api/cases/`](app/api/cases/) handles hosted requests. [`lib/case-audit.ts`](lib/case-audit.ts) reviews deductions, [`lib/letter-extract.ts`](lib/letter-extract.ts) reads deduction letters, and [`lib/local-correspondence.ts`](lib/local-correspondence.ts) builds drafts. The case assistant has a [separate route](app/api/assistant/route.ts). |
| Inspections or case photos | [`app/inspections/`](app/inspections/) contains the inspection gallery and upload UI. [`app/api/inspections/compare/route.ts`](app/api/inspections/compare/route.ts) compares inspection photos, and [`app/api/cases/compare-photos/route.ts`](app/api/cases/compare-photos/route.ts) compares case photos. |
| Document library | [`components/documents-library.tsx`](components/documents-library.tsx) renders the library. [`components/case-library-picker.tsx`](components/case-library-picker.tsx) attaches saved files. [`lib/document-library.ts`](lib/document-library.ts) defines file rules. |
| Accounts, data, or storage | [`components/auth/`](components/auth/) contains the account screens and route guard; [`lib/backend.ts`](lib/backend.ts) selects adapters under [`lib/auth/`](lib/auth/), [`lib/db/`](lib/db/), [`lib/storage/`](lib/storage/), and [`lib/local/`](lib/local/). |
| Shared data models or database setup | [`types/case.ts`](types/case.ts) defines cases, charges, and evidence; [`types/backend.ts`](types/backend.ts) defines backend data contracts; [`supabase/migrations/`](supabase/migrations/) contains schema and access policies. |
| Styling, design notes, or tests | [`app/globals.css`](app/globals.css), [`components/ui/`](components/ui/), [`design-system/`](design-system/), and [`tests/`](tests/) |

## Verify changes

```bash
npm test
npm run test:auth
npm run lint
npm run build
```

Stop the dev server before building in the same checkout. For end-to-end browser tests, install Chromium with `npx playwright install chromium`, set `DEMO_PASSWORD` for the seeded case, and start a local-mode server with `npm run dev -- --hostname 127.0.0.1 --port 3012`. Run `npm run test:e2e` in a second terminal.

For a hosted smoke test, sign in, create a case with sample evidence, and try the audit and a letter draft. Upload a move-in and move-out photo from a phone, then sign in on a desktop with the same account and verify both originals are available. Use a separate account to check that it cannot see the first renter’s case or photos.

Before contributing, read [`AGENTS.md`](AGENTS.md) for the team’s development rules.
