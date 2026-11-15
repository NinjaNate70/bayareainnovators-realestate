import Link from "next/link";
// Describe where data really lives for the backend this site was built with.
const hosted = process.env.NEXT_PUBLIC_BACKEND === "supabase";
export default function Terms() {
  return (
    <main className="policy-page">
      <Link className="auth-text-link" href="/">
        Tenant Shield
      </Link>
      <p className="eyebrow">POLICY DRAFT — TEAM REVIEW NEEDED</p>
      <h1>Terms</h1>
      <p>
        Tenant Shield is a hackathon demonstration. Approved terms have not yet
        been supplied. This page is a review placeholder, not a published legal
        agreement.
      </p>
      <p>
        {hosted
          ? "Accounts, case details and uploaded files are stored with our hosting provider, Supabase, and are private to each account."
          : "The current local demo keeps accounts and files in your browser."}{" "}
        It provides information, not legal advice. Do not rely on illustrative case
        findings as a legal determination.
      </p>
      <p>
        Before a public release, the team must supply approved terms and review
        the signup consent wording.
      </p>
      <h2>Fees</h2>
      <p>
        <strong>Free to start.</strong> Creating an account, running a deposit
        audit, and generating a demand letter are free.
      </p>
      <p>
        <strong>Success fee.</strong> If you recover money from your landlord
        after starting a case on Tenant Shield, you agree to pay Tenant Shield
        a success fee of 10% of the Recovered Amount, up to a maximum of $75
        per case.
      </p>
      <p>
        <strong>Recovered Amount</strong> means the money your landlord agrees
        to return or pays you after you start your case, minus any amount the
        landlord already returned or offered before you started the case, as
        entered at case intake.
      </p>
      <p>
        <strong>When the fee is earned.</strong> The fee is earned when your
        landlord agrees in writing to return money, including in a message you
        paste or upload into Tenant Shield, or when you mark your case as
        resolved with money recovered, whichever comes first. If your landlord
        does not follow through on a written agreement, contact us and we will
        adjust or refund the fee.
      </p>
      <p>
        <strong>No recovery, no fee.</strong> If you do not recover any money
        beyond the landlord’s original offer, you owe nothing.
      </p>
      <p>
        <strong>Accurate reporting.</strong> You agree to report the outcome of
        your case accurately.
      </p>
      <p>
        <strong>Not a law firm.</strong> Tenant Shield is a software tool, not
        a law firm. We do not provide legal advice or representation. The
        success fee is for use of the software.
      </p>
      <Link className="auth-text-link" href="/privacy">
        Privacy draft
      </Link>
    </main>
  );
}
