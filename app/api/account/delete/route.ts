import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const authOptions = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
};
const buckets = ["documents", "photos", "inspection-photos"];
const respond = (error: string, status: number, code = "delete_failed") =>
  Response.json(
    { error, code },
    { status, headers: { "Cache-Control": "no-store" } },
  );

// Every renter file sits under <user id>/<case or room id>/<file>.
async function ownedPaths(
  admin: SupabaseClient,
  bucket: string,
  userId: string,
) {
  const list = async (prefix: string) => {
    const names: string[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await admin.storage
        .from(bucket)
        .list(prefix, { limit: 1000, offset });
      if (error) throw error;
      names.push(...data.map((entry) => `${prefix}/${entry.name}`));
      if (data.length < 1000) return names;
    }
  };
  const paths: string[] = [];
  for (const folder of await list(userId)) paths.push(...(await list(folder)));
  return paths;
}

// Self-service account deletion. The secret key never leaves the server; the
// caller proves who they are with their session and their current password.
export async function POST(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!url || !publishableKey || !secretKey)
    return respond(
      "Account deletion isn't set up yet. Ask your project admin to add SUPABASE_SECRET_KEY on the server. Nothing was removed.",
      503,
      "setup",
    );

  const accessToken = request.headers
    .get("Authorization")
    ?.match(/^Bearer (\S+)$/i)?.[1];
  if (!accessToken) return respond("Sign in to keep going.", 401, "signed_out");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return respond("Invalid request.", 400, "validation");
  }
  const { confirmation, password } = (body ?? {}) as Record<string, unknown>;
  if (confirmation !== "DELETE")
    return respond("Type DELETE exactly to confirm.", 400, "confirmation");
  if (typeof password !== "string" || !password || password.length > 1024)
    return respond(
      "Your current password is incorrect. Try again.",
      403,
      "current_password",
    );

  const renter = createClient(url, publishableKey, { auth: authOptions });
  const auth = await renter.auth.getUser(accessToken);
  const user = auth.data.user;
  if (auth.error || !user?.email)
    return respond("Sign in to keep going.", 401, "signed_out");
  const check = await renter.auth.signInWithPassword({
    email: user.email,
    password,
  });
  if (check.error || check.data.user?.id !== user.id)
    return check.error?.status === 429
      ? respond(
          "Too many attempts. Wait a minute, then try again.",
          429,
          "rate_limited",
        )
      : respond(
          "Your current password is incorrect. Try again.",
          403,
          "current_password",
        );

  const admin = createClient(url, secretKey, { auth: authOptions });
  try {
    for (const bucket of buckets) {
      const paths = await ownedPaths(admin, bucket, user.id);
      for (let i = 0; i < paths.length; i += 100) {
        const { error } = await admin.storage
          .from(bucket)
          .remove(paths.slice(i, i + 100));
        if (error) throw error;
      }
    }
  } catch {
    return respond(
      "We couldn't remove all of your files, so your account was kept. Some files may already be gone. Try again to finish.",
      502,
    );
  }
  // Cases, file records and inspection records follow the user row by cascade.
  const removed = await admin.auth.admin.deleteUser(user.id);
  if (removed.error)
    return respond(
      "Your files were removed, but we couldn't finish deleting the account. Try again to finish.",
      502,
    );
  return Response.json(
    { deleted: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
