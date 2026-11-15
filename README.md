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

## Enable Compare photos with Gemini

1. Run the [comparison migration](supabase/migrations/20261114000200_inspection_comparisons.sql) in the Supabase SQL Editor after the inspection migration. It creates `inspection_comparisons` and `repair_price_bands`. Renters can read their own completed comparisons. The Vercel API writes comparison results after verifying the renter's session and ownership of both photo records.
2. In [Google AI Studio](https://aistudio.google.com/apikey), create a Gemini API key for the Google Cloud project you want to use. Use a billing-enabled Google Cloud project for real renter photos. Google may use submitted data from unpaid services to improve its products. Test with non-sensitive sample photos if you're using unpaid quota. [Gemini API keys](https://ai.google.dev/gemini-api/docs/api-key) · [Google's data-use terms](https://ai.google.dev/gemini-api/docs/terms)
3. In **Vercel → Project Settings → Environment Variables**, add these values to **Preview**, then redeploy `codex/my-inspections`. Add them to **Production** when you deploy the feature there.

   | Variable | Value |
   |---|---|
   | `GEMINI_API_KEY` | The key from Google AI Studio |
   | `SUPABASE_SECRET_KEY` | The `sb_secret_` key from **Supabase → Settings → API Keys** for the same project as your project URL |
   | `GEMINI_MODEL` (optional) | Model override. The default is `gemini-3.8-flash`. |

   Keep both keys server-side. Their names have no `NEXT_PUBLIC_` prefix. Keep the two existing `NEXT_PUBLIC_SUPABASE_` variables. [Vercel environment variables](https://vercel.com/docs/environment-variables)
4. Open **My Inspections**, upload a move-in and move-out photo to the same room, then select **Compare photos**. Pick the two photos, name the spot, and confirm that the photos can be sent to Gemini. The app saves the result in Supabase. Open the room on another device and select the same pair to see it again.

The app reuses the saved result for the same two photo IDs, including the spot and price snapshot submitted with that pair. For pairs too large for the inline Gemini request, the API uploads temporary files to Gemini and requests deletion after processing. Google expires undeleted API files automatically. [Gemini Files API](https://ai.google.dev/gemini-api/docs/files)

### Set up repair price ranges

Add sourced entries to `repair_price_bands` in Supabase. Use a lowercase region such as `san luis obispo, ca`, a stable code such as `patch_small_drywall_hole`, a short repair title, a low and high amount in cents, a three-letter currency code, a pricing unit, the source, and the effective date. Use currencies with two decimal places. The optional pricing region on the comparison form must match the catalog region. If there is no matching entry, the app saves the repair assessment and shows that a price is unavailable. A comparison keeps a snapshot of the price shown at the time it ran.

## Run a live move-out audit

The audit queues one selected photo pair per room when it starts. One Gemini pass assesses the room's condition and a second pass independently checks the same photos. The audit saves both findings. If the passes disagree or a photo is unclear, the room shows **Needs review**. Other rooms keep running while you capture a replacement photo and confirm the new pair. The audit keeps progress in Supabase and workers can continue after the renter closes the browser.

1. After applying both earlier migrations, run the [audit migration](supabase/migrations/20261114000300_move_out_audits.sql) in Supabase SQL Editor. It adds the audit records, owner access policies, and a queue that hands each job to one worker at a time. The live view subscribes to Supabase Realtime and also checks for missed changes periodically.
2. In Vercel, add `AUDIT_WORKER_SECRET` as a sensitive **Preview** variable next to the existing Gemini and Supabase keys. Generate a new random value for it, for example with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`. Redeploy the branch.
3. Run `node scripts/audit-worker.mjs` with Node.js 24 in a persistent process. For a demo, use a terminal on your computer. To keep it running after your computer disconnects, use the same command on a Node worker host with the repository checked out. Set these environment variables on that machine:

   | Worker variable | Value |
   |---|---|
   | `AUDIT_APP_URL` | The origin of the project deployment, such as `https://your-vercel-preview.vercel.app` |
   | `AUDIT_WORKER_SECRET` | The same secret set in Vercel |
   | `VERCEL_AUTOMATION_BYPASS_SECRET` | Optional. Use the project's [Protection Bypass for Automation](https://vercel.com/docs/deployment-protection/methods-to-bypass-deployment-protection/protection-bypass-automation) secret for a protected preview. |

   You can put these in a local `.env.audit` file and run `node --env-file=.env.audit scripts/audit-worker.mjs`. Keep that file private. The worker reaches only the audit endpoint; the Gemini and Supabase secret keys stay on Vercel. Stop your local worker with Ctrl+C when you finish the demo.
4. Open **My Inspections → Live move-out audit** on a lease with photos for at least two rooms. Select and confirm the pairs, and leave one room's move-out photo missing. Start the audit. The other rooms should show both review stages. Take the missing photo on your phone, then open **Choose photos and resume this room** and confirm the pair. The room should finish alongside the other results. Try reopening the audit on a second device and verify that a second account cannot see it.

For local development, put the relevant variables in `.env.local`, then run `npm ci` and `npm run dev`. Add `http://localhost:3000/inspections` to the Supabase redirect allowlist if you test local sign-up. Run `node --test tests/*.test.mjs` with Node.js 24 to check the inspection and audit logic.
