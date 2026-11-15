import { Suspense } from "react";
import { VerifyEmail } from "@/components/auth/email";
export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={<main className="protected-screen">Opening verification…</main>}
    >
      <VerifyEmail />
    </Suspense>
  );
}
