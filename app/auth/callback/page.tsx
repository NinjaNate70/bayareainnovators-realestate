import { Suspense } from "react";
import { OAuthCallback } from "@/components/auth/oauth-callback";
export default function OAuthCallbackPage() {
  return (
    <Suspense
      fallback={<main className="protected-screen">Finishing sign-in…</main>}
    >
      <OAuthCallback />
    </Suspense>
  );
}
