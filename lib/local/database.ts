import Dexie, { type Table } from "dexie";
import type {
  AuthFlow,
  CaseRow,
  Checkpoint,
  FileMetadata,
  OutboxMessage,
} from "../../types/backend";
export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  salt: string;
  password_iterations: number;
  password_version: number;
  name: string;
  email_verified_at: string | null;
  created_at: string;
  updated_at: string;
  pending_email?: string;
  terms_version: string;
  terms_accepted_at?: string;
  privacy_version: string;
  consented_at: string;
}
export interface SessionRow {
  access_token: string;
  user_id: string;
  expires_at: string;
  created_at: string;
  password_version: number;
  mode: "normal" | "recovery";
}
export interface TokenRow {
  id: string;
  user_id: string;
  purpose: "verify" | "reset" | "email_change";
  token_hash: string;
  email_to: string;
  expires_at: string;
  used_at: string | null;
  created_at: string;
  flow_id: string;
}
export interface FlowRow extends AuthFlow {
  pending_user_id?: string;
}
export interface RateRow {
  id: string;
  email_key: string;
  operation: string;
  failed_count: number;
  window_started_at: string;
  locked_until: string | null;
  updated_at: string;
}
export interface FileRow extends FileMetadata {
  blob: Blob;
}
export interface OutboxRow extends OutboxMessage {
  flow_id: string;
  user_id: string;
  created_at: string;
}
export interface LegacyRow {
  id: string;
  migration_key: string;
  payload: unknown;
  original_blob_records: { key: string; blob: Blob }[];
  owner_user_id?: string;
  imported_case_ids: string[];
  created_at: string;
}
export class LocalDatabase extends Dexie {
  users!: Table<UserRow, string>;
  sessions!: Table<SessionRow, string>;
  cases!: Table<CaseRow, string>;
  files!: Table<FileRow, string>;
  auth_tokens!: Table<TokenRow, string>;
  auth_flows!: Table<FlowRow, string>;
  rate_limits!: Table<RateRow, string>;
  drafts!: Table<Checkpoint, string>;
  outbox!: Table<OutboxRow, string>;
  app_meta!: Table<
    { id: string; meta_key: string; value: string; updated_at: string },
    string
  >;
  legacy_archive!: Table<LegacyRow, string>;
  constructor() {
    super("tenant-shield-local");
    this.version(1).stores({
      users: "id,&email,created_at",
      sessions: "access_token,user_id,expires_at",
      cases: "id,user_id,[user_id+updated_at]",
      files: "id,&[bucket+path],[user_id+case_id],user_id",
      auth_tokens: "id,&token_hash,[user_id+purpose],expires_at",
      auth_flows: "id,expires_at",
      rate_limits: "id,&[email_key+operation]",
      drafts: "id,&[user_id+draft_key],user_id",
      outbox: "id,flow_id,user_id,expires_at",
      app_meta: "id,&meta_key",
      legacy_archive: "id,&migration_key,owner_user_id",
    });
  }
}
export const db = new LocalDatabase();
export const now = () => new Date().toISOString();
