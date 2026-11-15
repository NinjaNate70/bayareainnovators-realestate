import type { AuthClient } from "./auth/client";
import type { DataClient } from "./db/client";
import type { StorageClient } from "./storage/client";
import { localAuth } from "./local/auth";
import { localData } from "./local/data";
import { localStorageClient } from "./local/storage";
import { supabaseAuth } from "./auth/supabase";
import { supabaseData } from "./db/supabase";
import { supabaseStorage } from "./storage/supabase";
type Backend = { auth: AuthClient; data: DataClient; storage: StorageClient };
// NEXT_PUBLIC_BACKEND=supabase puts accounts, cases and files in the Supabase
// project. Unset or "local" keeps the browser-only demo backend.
export const backendName = process.env.NEXT_PUBLIC_BACKEND ?? "local";
// True when account and case data live in the hosted project, not this browser.
export const hosted = backendName === "supabase";
let instance: Backend | undefined;
export function getBackend(): Backend {
  if (instance) return instance;
  if (backendName === "supabase")
    instance = {
      auth: supabaseAuth,
      data: supabaseData,
      storage: supabaseStorage,
    };
  else if (backendName === "local")
    instance = { auth: localAuth, data: localData, storage: localStorageClient };
  else throw new Error("Unknown backend configuration.");
  return instance;
}
