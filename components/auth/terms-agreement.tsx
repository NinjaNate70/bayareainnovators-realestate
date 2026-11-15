import Link from "next/link";

// The wording of the required signup agreement, shared by every signup form so
// the text and links cannot drift apart. Render it inside the checkbox's <label>.
export function TermsAgreementText() {
  return (
    <>
      I agree to the{" "}
      <Link href="/terms" target="_blank" rel="noreferrer">
        Terms of Service
      </Link>{" "}
      and{" "}
      <Link href="/privacy" target="_blank" rel="noreferrer">
        Privacy Policy
      </Link>
      , including a 10% success fee (max $75) only if Tenant Shield helps me
      recover money.
    </>
  );
}
