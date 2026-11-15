import type { RentalCase, Evidence, Charge } from "./case";

export type ClientError = {
  code: string;
  message: string;
  retry_after_seconds?: number;
};
export type Result<T> = { data: T | null; error: ClientError | null };
export interface User {
  id: string;
  email: string;
  aud: string;
  role: string;
  created_at: string;
  updated_at: string;
  email_confirmed_at?: string;
  confirmed_at?: string;
  user_metadata: {
    name: string;
    terms_version?: string;
    terms_accepted_at?: string;
    privacy_version?: string;
    consented_at?: string;
  };
  app_metadata: { provider: string };
}
export interface Session {
  access_token: string;
  token_type: "bearer";
  expires_at: number;
  expires_in: number;
  refresh_token: string;
  user: User;
}
export type AuthEvent =
  | "INITIAL_SESSION"
  | "SIGNED_IN"
  | "SIGNED_OUT"
  | "USER_UPDATED"
  | "PASSWORD_RECOVERY"
  | "SESSION_EXPIRED";
export interface SignUpInput {
  email: string;
  password: string;
  options: {
    data: {
      name: string;
      terms_version: string;
      terms_accepted_at: string;
      privacy_version: string;
      consented_at: string;
    };
    emailRedirectTo?: string;
  };
}
export interface AuthFlow {
  id: string;
  entered_email: string;
  entered_name?: string;
  purpose: string;
  return_to: string;
  retry_after_at: string;
  expires_at: string;
}
export interface OutboxMessage {
  id: string;
  email_to: string;
  purpose: string;
  link: string;
  expires_at: string;
}
export interface Checkpoint {
  id: string;
  user_id: string;
  draft_key: string;
  case_id: string | null;
  payload: RentalCase | { name: string; email: string };
  route: string;
  scroll_y: number;
  focus_id: string;
  updated_at: string;
}
export interface CaseRow {
  id: string;
  user_id: string;
  is_demo: boolean;
  address: string;
  renter_name: string;
  landlord_name: string;
  move_out_date: string;
  letter_received_date: string;
  deposit_cents: number;
  returned_cents: number;
  completed_step: number;
  audited: boolean;
  needs_review: boolean;
  letter_text: string;
  reply_by_date: string;
  incoming_text: string;
  reply_text: string;
  // Absent on rows saved before this field existed.
  situation_text?: string;
  created_at: string;
  updated_at: string;
  revision: number;
  charges: (Omit<Charge, "amount" | "low" | "high" | "sources"> & {
    source_id: string;
    amount_cents: number;
    low_cents: number;
    high_cents: number;
    source_ids: string[];
  })[];
  evidence: (Omit<Evidence, "url" | "id"> & {
    id: string;
    source_id: string;
  })[];
  photo_pairs?: RentalCase["photoPairs"];
}
export interface FileMetadata {
  id: string;
  user_id: string;
  case_id: string;
  bucket: "documents" | "photos";
  path: string;
  mime_type: string;
  size: number;
  original_name: string;
  created_at: string;
}
