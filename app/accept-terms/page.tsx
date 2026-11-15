import { Suspense } from "react";
import { AcceptTerms } from "@/components/auth/accept-terms";
export default function AcceptTermsPage() {
  return (
    <Suspense
      fallback={<main className="protected-screen">Opening your account…</main>}
    >
      <AcceptTerms />
    </Suspense>
  );
}
