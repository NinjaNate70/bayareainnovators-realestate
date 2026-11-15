import { Suspense } from "react";
import { CheckEmail } from "@/components/auth/email";
export default function CheckEmailPage() {
  return (
    <Suspense
      fallback={<main className="protected-screen">Opening your request…</main>}
    >
      <CheckEmail />
    </Suspense>
  );
}
