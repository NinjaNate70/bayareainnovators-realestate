import Link from "next/link";
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
        The current local demo keeps accounts and files in your browser. It
        provides information, not legal advice. Do not rely on illustrative case
        findings as a legal determination.
      </p>
      <p>
        Before a public release, the team must supply approved terms and review
        the signup consent wording.
      </p>
      <Link className="auth-text-link" href="/privacy">
        Privacy draft
      </Link>
    </main>
  );
}
