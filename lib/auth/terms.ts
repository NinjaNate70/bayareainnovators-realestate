export const TERMS_VERSION = "2026-11-14";
export const PRIVACY_VERSION = "review-draft-v1";

type TermsMetadata = {
  terms_version?: unknown;
  terms_accepted_at?: unknown;
} | null;

// Signed-in users must have accepted this exact Terms version before they can
// open cases or My Inspections.
export function termsAccepted(metadata: TermsMetadata | undefined) {
  return (
    metadata?.terms_version === TERMS_VERSION &&
    typeof metadata.terms_accepted_at === "string" &&
    metadata.terms_accepted_at.length > 0
  );
}

export function termsMetadata(now = new Date()) {
  const acceptedAt = now.toISOString();
  return {
    terms_version: TERMS_VERSION,
    terms_accepted_at: acceptedAt,
    privacy_version: PRIVACY_VERSION,
    consented_at: acceptedAt,
  };
}

export function termsGatePath(returnTo?: string | null) {
  return returnTo
    ? `/accept-terms?returnTo=${encodeURIComponent(returnTo)}`
    : "/accept-terms";
}

// Google sign-in needs Supabase Auth and an explicit opt-in flag.
export function oauthEnabled(
  backend: string | undefined,
  flag: string | undefined,
) {
  return backend === "supabase" && flag === "true";
}
