# Tenant Shield

My Inspections lets renters save move-in and move-out photos by lease and room. Vercel hosts the Next.js website. Supabase Auth, Postgres, and private Storage provide the shared account and data for the phone and desktop browsers.

Sign-in, cases and uploaded evidence can use the same Supabase project. Set `NEXT_PUBLIC_BACKEND=supabase` to store accounts in Supabase Auth, cases in Postgres and files in private Storage. One sign-in then covers the case screens and My Inspections. See [Connect sign-in and cases to Supabase](#connect-sign-in-and-cases-to-supabase).

Leave `NEXT_PUBLIC_BACKEND` unset or set to `local` to keep the browser-only demo accounts for the case screens. My Inspections uses Supabase with either setting. See the [case auth guide](design-system/AUTH-IMPLEMENTATION.md) for the local demo setup.

## Set up Supabase

1. Create a Supabase project and open its **SQL Editor**. Run the full [inspection migration](supabase/migrations/20261114000100_inspections.sql) once. It creates the lease, room, and photo tables, the private `inspection-photos` bucket, and renter access policies.
2. In **Authentication → Sign In / Providers**, enable email and password sign-in and keep **Confirm email** enabled. For an initial smoke test, you can create and confirm a test user directly in the **Authentication → Users** dashboard. Set up [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp) before inviting renters to register using their own email addresses.
3. In **Authentication → URL Configuration**, set **Site URL** to your production website origin, such as `https://tenant-shield.vercel.app`. Add `https://tenant-shield.vercel.app/inspections` under **Redirect URLs**, using your actual hostname. If you test sign-up on a Vercel preview, add that preview's full `/inspections` URL to the list. [Supabase redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)
4. Copy the **Project URL** and **Publishable key** from the project's **Connect** dialog. [Supabase API keys](https://supabase.com/docs/guides/getting-started/api-keys)

## Connect sign-in and cases to Supabase

1. In the Supabase **SQL Editor**, run the full [case workspace migration](supabase/migrations/20261115000100_case_workspace.sql) once. It creates the `cases` and `files` tables, the private `documents` and `photos` buckets, and policies that limit each renter to their own rows and files. You can run it again safely. It replaces the draft `supabase/schema.sql` and `supabase/storage.sql`, and also works in a project where those two were already applied.
2. In **Authentication → URL Configuration**, set **Site URL** to your website origin and add these **Redirect URLs**, using your actual hostname. Add the same three for `http://localhost:3000` if you test locally.

   ```text
   https://tenant-shield.vercel.app/login
   https://tenant-shield.vercel.app/reset-password
   https://tenant-shield.vercel.app/account
   ```

   Confirmation, password-reset and email-change links return to these pages. A link to a URL that isn't listed goes to the Site URL instead.
3. Copy [`.env.example`](.env.example) to `.env.local` and fill in the values from the Supabase **Connect** dialog. Add the same four names in **Vercel → Settings → Environment Variables**, then redeploy. `NEXT_PUBLIC_` values are fixed when the site is built, so a change needs a new build.

   ```dotenv
   NEXT_PUBLIC_BACKEND=supabase
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
   SUPABASE_SECRET_KEY=sb_secret_YOUR_KEY
   ```

   The URL and publishable key are bundled into the website. `SUPABASE_SECRET_KEY` stays on the server and is used to delete an account at the renter's request. Never give it a `NEXT_PUBLIC_` name or commit it.
4. Open `/signup`, create an account and follow the emailed link. You should land in a new case. Check **Authentication → Users** and **Table Editor → cases** in Supabase to see the account and the case.

Supabase's built-in email sender is limited to a few messages an hour and to your project's team addresses. Set up [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp) before renters sign up with their own email. With **Confirm email** turned off, a new account is signed in immediately with no email step.

Accounts and cases created with the browser-only demo backend are not copied to Supabase. Renters create a new account after the switch. Unsaved edits are still buffered in the browser under the signed-in account and are written to Supabase on the next save. The example case from the local demo account is not created for Supabase accounts.

If an inspection upload reports `permission denied for table cases`, run the case workspace migration above. It grants signed-in renters access to their own cases.

## Connect Vercel

1. Import this GitHub repository into Vercel or open its existing Vercel project. Use the Next.js framework preset.
2. Open **Settings → Environment Variables** and add the two values below to **Production** and, if you are testing a feature branch, **Preview**. Use a separate Supabase project for previews that should be isolated from production data.

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_YOUR_KEY
   ```

   These values identify the Supabase project and are bundled into the website. The renter's sign-in and database policies control access. Keep Supabase secret and service-role keys out of all `NEXT_PUBLIC_` variables. This feature needs only the two values above. [Vercel environment variables](https://vercel.com/docs/environment-variables)
3. Redeploy the branch with My Inspections after saving the variables. Open `/inspections` on the deployment or follow **My Inspections** from the homepage.

## Test phone-to-desktop photos

1. Open the deployment on a phone, sign in, and add a lease and a room such as **Kitchen**.
2. Pick **Move-in**, use **Take a photo**, and choose **Upload photo**. Wait for **Photo saved**. Repeat with **Move-out**.
3. Open the same deployment on a desktop and sign in with the same account. Select the lease and check that both phases appear under Kitchen. Use **Refresh photos** if the gallery was already open.
4. Sign in with a second account in a separate browser session. Confirm it cannot see the first renter's lease or photos.

Uploads go directly to Supabase. The app keeps the original file and supports JPEG, PNG, WebP, HEIC and HEIF up to 20 MB each. The gallery tries to create a JPEG preview in the browser when it cannot display an HEIC or HEIF original. You can download the original even if preview generation fails. If a connection drops, retry **Upload photo** with the same file, room, and phase while the form is open.

## Compare inspection photos

1. Run the [comparison migration](supabase/migrations/20261114000200_inspection_comparisons.sql) in the Supabase SQL Editor after the inspection migration. It creates `inspection_comparisons` and `repair_price_bands`. Renters can read their own completed comparisons. The Vercel API writes comparison results after verifying the renter's session and ownership of both photo records.
2. Set the primary service credentials listed in [.env.example](.env.example), along with the `SUPABASE_SECRET_KEY` for the same Supabase project. Keep these values on the server and redeploy after setting them.
3. Open **My Inspections** and upload a move-in and move-out photo of the same spot to the same room. Select **Compare photos** to send the pair to an external service for comparison. Enable **Automatically compare photos** to send the newest pair in each room whenever both phases have photos. This choice is saved for your account in the current browser. Use the photo menus to compare a different pair when a phase has multiple photos. The saved result explains whether the views match, what each photo shows, what changed, and what to do next.

The app reuses a current comparison for the same two photo IDs. To refresh an older comparison, select the same photos again. The app prepares smaller image copies for analysis and keeps the private originals in Supabase. If the server cannot decode a photo, upload a JPEG, PNG, or WebP copy for comparison.

## Fill in charges from the deduction letter

With `NEXT_PUBLIC_BACKEND=supabase`, the renter no longer types the itemized charges. After they upload the landlord's letter and choose **Continue**, the server sends the letter (and the lease, if there is one) to an external service to copy out each charge with its amount, plus the address, names, move-out date, letter date, deposit and refund where the documents state them.

The wizard then opens the Details step with those filled in and asks the renter to check each one against the letter. Everything stays editable. Details the renter already entered are kept, and **Read the letter again** replaces the charge list on request. The reader only transcribes; it leaves out totals and anything it can't read, and never judges a charge. If it can't read the letter, the renter enters the charges by hand as before, and **No letter / enter manually** skips reading altogether.

It reads up to four documents (about 12 MB, PDF, JPG or PNG), and usually takes 10 to 30 seconds.

## My documents

**Documents** in the workspace navigation opens `/documents`, one place for everything a renter has uploaded.

- **Saved documents** are files kept outside any case: leases, receipts, letters, photos. It works like adding a photo in My Inspections: **Choose files** (several at once) or **Take a photo** on a phone, check the selection, then press **Upload**. It accepts PDF, Word, Excel, text, CSV, JPG, PNG, WebP and HEIC, up to 20 MB each. Each saved file can be **downloaded** under its original name, **opened** in a new tab if it is a PDF, image or text file, or deleted. These files are not read by the audit or the assistant.
- **From your cases** lists every file attached to a case, with a link to that case. These can be opened and downloaded the same way.

Run the [document library migration](supabase/migrations/20261115000300_document_library.sql) once in the Supabase SQL Editor. It creates the private `library` bucket and a policy that limits each renter to files under their own user id. Run it again after an update to this file: it brings an existing library up to the current file types and size limit. Until then the page shows the case files, and trying to add a file explains that this migration is needed. Deleting an account removes its library files too. Saving documents outside a case needs `NEXT_PUBLIC_BACKEND=supabase`; the browser-only demo lists case files only.

## Let renters explain their situation

The wizard's Details step ends with a text box, **Anything else about your situation?**, for what the documents don't show: roommates and who paid the deposit, anything agreed with the landlord, repairs requested, the condition at move-in. It holds up to 4,000 characters and appears again on the Review step.

Run the [case situation migration](supabase/migrations/20261115000200_case_situation.sql) once in the Supabase SQL Editor to add the column that stores it. Until then cases still save, and the box tells the renter their notes can't be kept yet.

The audit and the case assistant read the notes as the renter's own account. They use them to understand the case and to ask for the right proof, such as the text message a renter says their landlord sent. They are told the notes are unverified: a charge's status never changes on the renter's word alone, and the app's own check still turns any finding with no evidence file behind it into **Need more info**. Changing the notes on an audited case marks it for a fresh audit.

## Run the charge-by-charge audit

With `NEXT_PUBLIC_BACKEND=supabase`, **Run audit** on the wizard's Review step reads the renter's evidence instead of only recording the charges. It uses the same key as the case assistant.

1. The document review reads the deduction letter and lease in one request and the supporting documents two at a time in others: each charge's amount, the landlord's reason, whether a receipt or invoice is attached, lease terms about the deposit, and what each supporting document shows for or against a charge.
2. The photo review checks the move-in and move-out photos and reports what is visible for each charge. Every reader in steps 1 and 2 runs at the same time, and the server fetches the files together, so adding documents does not add to the wait.
3. The audit weighs each charge against those findings, saved comparisons from My Inspections, and the California Courts guide.

Set the primary service credentials in [.env.example](.env.example). You can also configure a backup service.

Each charge gets a status (Fair, Disputable, Likely not allowed, or Need more info), a plain explanation, the evidence files and guide sections behind it, and a list of what to add or check. The app then checks the auditor's answer in code. A finding with no evidence file behind it, or a finding against the landlord with no guide section, is changed to **Need more info**. The dollar range in **You may be owed** comes from the charge amounts: a disputable charge counts from $0 up to its amount, and a likely-not-allowed charge counts in full.

### Adding more documents

The wizard's first step has a third upload area, **More documents that help your case**, for receipts, a move-in checklist, emails or texts with the landlord, repair invoices and the like. On a saved case, **Add more documents** on the Audit and Letter tabs opens that step. New files mark the case as needing review, and the next **Run audit** reads them with everything else. A finding may cite a supporting document only if the document reader actually read it.

Limits to know about:

- One audit reviews up to 10 documents and 8 photos, with a separate 12 MiB budget for each. The photo budget counts the JPEG copies resized for analysis to a maximum of 1,568 pixels on the long edge. Supabase keeps the originals. The charge's request list names files left out of the audit.
- Files must be PDF, PNG or JPEG. Photos from My Inspections are not read directly; only their saved comparison results are used.
- The audit can take up to a minute. If it fails, nothing is changed and the renter can run it again.
- If neither service is configured, charges are recorded as **Need more info**, as before. The example case and the browser-only demo never use the audit.
- The audit sends the letter, lease, other documents, photos, and case details to an external service. The Review step explains this before the renter runs it.

The result is information to help a renter organise their case, not legal advice.

## Enable the case assistant

The case screens show **Ask the assistant** when `NEXT_PUBLIC_BACKEND=supabase`. Each answer is drafted and checked in two steps.

1. The assistant drafts an answer based on the question: how to proceed, what evidence to collect, how the deposit rules apply, or what to include in a letter.
2. A separate review checks the draft against the case facts and the guide. The assistant shows the answer only after that review.

Set the primary service credentials in [.env.example](.env.example). You can also configure a backup service.

### Fast mode

The primary service requests fast mode where supported. Fast mode speeds up response writing and can raise costs. If fast mode is unavailable, the request can retry at standard speed. Use the speed setting in [.env.example](.env.example) to select standard speed and pricing.

### If answers don't come through

In development, open the assistant and choose **Not getting answers? Check the connection**. The panel shows whether the primary and optional backup services answer and how long each took. The team can enable the panel on a deployment using the setting in [.env.example](.env.example).

An answer usually takes 10 to 30 seconds. If the check keeps failing, verify the service configuration for the deployment.

California rules come only from the [California Courts guide to security deposits](https://selfhelp.courts.ca.gov/guide-security-deposits-california), stored as numbered sections in `lib/case-assistant.ts`. The assistant is told to say so when the guide doesn't cover a question, and each answer lists the sections it relied on. Update those sections when the guide changes. The assistant gives information, not legal advice.

The server reads the renter's case with their own session, so the assistant sees only that renter's case. The question, recent conversation and case details (names, address, dates, amounts, charges, file names and letter text) are sent to an external service for each answer. The assistant does not send uploaded files or photos. The conversation is kept in the open page and is not saved. Each renter is limited to about ten questions a minute.

## Live move-out audit backend

The audit queues one selected photo pair per room when it starts. One pass assesses the room's condition and a second pass checks the same photos. The audit saves both findings. If the passes disagree or a photo is unclear, the room shows **Needs review**. Other rooms keep running while you capture a replacement photo and confirm the new pair. The audit keeps progress in Supabase and workers can continue after the renter closes the browser.

1. After applying both earlier migrations, run the [audit migration](supabase/migrations/20261114000300_move_out_audits.sql) in Supabase SQL Editor. It adds the audit records, owner access policies, and a queue that hands each job to one worker at a time. The live view subscribes to Supabase Realtime and also checks for missed changes periodically.
2. In Vercel, add `AUDIT_WORKER_SECRET` as a sensitive **Preview** variable next to the existing service and Supabase keys. Generate a new random value for it, for example with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Redeploy the branch.
3. Run `node scripts/audit-worker.mjs` with Node.js 24 in a persistent process. For a demo, use a terminal on your computer. To keep it running after your computer disconnects, use the same command on a Node worker host with the repository checked out. Set these environment variables on that machine:

   | Worker variable | Value |
   |---|---|
   | `AUDIT_APP_URL` | The origin of the project deployment, such as `https://your-vercel-preview.vercel.app` |
   | `AUDIT_WORKER_SECRET` | The same secret set in Vercel |
   | `VERCEL_AUTOMATION_BYPASS_SECRET` | Optional. Use the project's [Protection Bypass for Automation](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation) secret for a protected preview. |

   You can put these in a local `.env.audit` file and run `node --env-file=.env.audit scripts/audit-worker.mjs`. Keep that file private. The worker reaches only the audit endpoint; the service and Supabase secret keys stay on Vercel. Stop your local worker with Ctrl+C when you finish the demo.
   The worker can still process existing audit jobs. My Inspections now shows photo comparisons by room.

For local development, put the relevant variables in `.env.local`, then run `npm ci` and `npm run dev`. Add `http://localhost:3000/inspections` to the Supabase redirect allowlist if you test local sign-up. Run `node --test tests/*.test.mjs` with Node.js 24 to check the inspection and audit logic.
