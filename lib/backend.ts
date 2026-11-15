import type { AuthClient } from "./auth/client";
import type { DataClient } from "./db/client";
import type { StorageClient } from "./storage/client";
import { localAuth } from "./local/auth";
import { localData } from "./local/data";
import { localStorageClient } from "./local/storage";
type Backend = { auth: AuthClient; data: DataClient; storage: StorageClient };
let instance: Backend | undefined;
export function getBackend(): Backend {
  if (instance) return instance;
  const selection = process.env.NEXT_PUBLIC_BACKEND ?? "local";
  if (selection === "supabase") throw new Error("not implemented"); // TODO(supabase): supply the three Supabase adapters here.
  if (selection !== "local") throw new Error("Unknown backend configuration.");
  instance = { auth: localAuth, data: localData, storage: localStorageClient };
  return instance;
}
