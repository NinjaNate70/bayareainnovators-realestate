import Link from "next/link";
// Describe where data really lives for the backend this site was built with.
const hosted = process.env.NEXT_PUBLIC_BACKEND === "supabase";
export default function Privacy() {
  return (
    <main className="policy-page">
      <Link className="auth-text-link" href="/">
        Tenant Shield
      </Link>
      <p className="eyebrow">POLICY DRAFT — TEAM REVIEW NEEDED</p>
      <h1>Privacy</h1>
      <p>
        Approved privacy wording has not yet been supplied. This page is a
        review placeholder, not a published privacy policy.
      </p>
      {hosted ? (
        <>
          <p>
            Your account, case details and original files are stored with our
            hosting provider, Supabase. Sign-in is handled by Supabase Auth,
            which sends verification and password-reset emails to the address
            you enter. Access rules limit each account to its own cases and
            files.
          </p>
          <p>
            When you use document reading, photo comparison, case audits, or the
            assistant, the information needed for that feature is
            sent to an external service. The feature tells you which information
            it sends before you use it.
          </p>
          <p>
            Unsaved edits are kept in this browser until they are saved to your
            account. Deleting your account from the account page removes its
            cases, files and sign-in. The team must review the privacy promise
            beside forms before release.
          </p>
        </>
      ) : (
        <>
          <p>
            In the current local demo, account records, passwords derived with
            PBKDF2, case details and original files are stored in this browser.
            No real verification or reset email is sent. Development links work
            in the browser where they were requested.
          </p>
          <p>
            Local sign-in is a demonstration and does not protect against
            someone who can inspect or modify browser storage. Clearing site
            storage removes local records. The team must review the privacy
            promise beside forms before release.
          </p>
        </>
      )}
      <Link className="auth-text-link" href="/terms">
        Terms draft
      </Link>
    </main>
  );
}
