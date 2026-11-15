# Tenant Shield Local Data and Supabase Migration Plan

Approved architecture, now implemented with Dexie and the three local clients.
Prepared SQL remains unapplied; Supabase is not connected. See
AUTH-IMPLEMENTATION.md for actual adapter details, verification and setup.
AUTH.md is the screen/flow contract. MASTER.md supplies all UI tokens.

## Current state and intended boundary

Inspected types/case.ts and lib/cases.ts. Today the app has synchronous readCase/
saveCase using localStorage, a separate raw IndexedDB files store, timestamp case
IDs, source-label file IDs, and a public fixture fallback for "demo". There is no
existing CaseStore class, authenticated owner, or auth provider to preserve.

Phase 2 introduces three async clients and an adapter for the existing RentalCase
view model. Components never import Dexie or indexedDB directly. Replace synchronous
render/save assumptions with awaited operations, typed loading/error states and
a provider-owned draft buffer. Keep the case screens and their evidence semantics.

```text
Screens / provider / case view-model adapter
              |
       lib/backend.ts
       /      |       \
 AuthClient DataClient StorageClient
       \      |       /
         local adapters
              |
     private Dexie database
              |
 users sessions cases files + helper stores
```

NEXT_PUBLIC_BACKEND=local selects these adapters. NEXT_PUBLIC_BACKEND=supabase
selects a stub that throws "not implemented" with // TODO(supabase); fail clearly,
never silently fall back to local data. Unknown values also fail configuration.
The OAuth button additionally needs NEXT_PUBLIC_ENABLE_OAUTH=true AND a supported
backend capability; its default remains false.

## Local auth scope

Required implementation comment, in the local auth module:
"Local auth is for development/demo only. It is not real security: passwords,
sessions and account data live in the browser and can be inspected or changed
by someone with access to it."

Ownership checks prevent accidental cross-account access through the application,
not hostile control of browser storage. Client guards are not a server trust
boundary. Local sessions are opaque tokens, not Supabase JWTs. Do not ship this
as a production tenant-data security system or claim encryption by adding a login.

Use Web Crypto PBKDF2-HMAC-SHA-256, 310,000 iterations (never below 100,000), a fresh
16-byte CSPRNG salt per password, and a 32-byte derived hash. Store encoded salt,
hash, algorithm, iteration count and password version. Never store/log passwords
or compare plaintext. Rehash with a new salt on change/reset. Do not normalize
or trim passwords; keep UI/local-client length rules consistent.

Hash work happens outside short Dexie transactions; re-read user password version,
session/token validity and lockout state in the final transaction before commit.
Concurrent reset/sign-in and double-clicks must not revive an old password.

## Database schema and indexes

New Dexie database tenant-shield-local, versioned explicitly. IDs use
crypto.randomUUID(); timestamps are ISO UTC strings. Date-only case facts remain
YYYY-MM-DD or null, not timezone-shifted timestamps. Session access_token and token
hashes are opaque cryptographic strings, not entity IDs. Fields use snake_case.

| Store | Required columns and additions | Primary key / important indexes |
| --- | --- | --- |
| users | id, email (normalized unique), password_hash, salt, name, email_verified_at nullable, created_at; password_algorithm, password_iterations, password_version, updated_at, pending_email nullable, terms_version, privacy_version, consented_at | id; unique email; created_at |
| sessions | access_token, user_id, expires_at; created_at, password_version, mode (normal/recovery) | access_token; user_id; expires_at |
| cases | id, user_id, existing case fields mapped below, created_at, updated_at; revision | id; [user_id+updated_at]; user_id |
| files | id, user_id, case_id, bucket (documents/photos), path, mime_type, size, blob, created_at; original_name, evidence_kind, source_id | id; unique [bucket+path]; [user_id+case_id]; user_id |
| auth_tokens | id, user_id, purpose (verify/reset/email_change), token_hash, email_to, expires_at, used_at nullable, created_at, flow_id | id; unique token_hash; [user_id+purpose]; expires_at |
| auth_flows | id, entered_email, entered_name nullable, purpose, return_to, retry_after_at, expires_at, created_at; pending_user_id private/nullable | id; expires_at |
| rate_limits | id, email_key (hash of normalized email), operation, failed_count, window_started_at, locked_until nullable, updated_at | id; unique [email_key+operation] |
| drafts | id, user_id, draft_key (case UUID or account-profile key), case_id nullable, payload, route, step_or_tab, scroll_y, focus_id nullable, revision, updated_at | id; unique [user_id+draft_key]; user_id |
| outbox | id, flow_id, user_id nullable, purpose, email_to, link, expires_at, created_at | id; flow_id; user_id; expires_at (development only) |
| app_meta | id, meta_key, value, updated_at | id (UUID); unique meta_key |
| legacy_archive | id, migration_key, payload, original_blob_records, owner_user_id nullable, imported_case_ids, created_at | id; unique migration_key; owner_user_id |

Helper stores are necessary for single-use links, lockouts across reload, email
confirmation context, draft restoration, one-time seeding and safe legacy import.
They are internal local infrastructure, not automatic future public Supabase tables.
No boolean, blob, password hash, long case text or large JSON payload is indexed.
Outbox raw links are a development diagnostic exception, removed on use/expiry;
they are never present as a production store payload or console output.

LocalStorage contains only the active session's access_token under a namespaced
key. No users, case JSON, email address, forms, file content, reset/verification
tokens or demo password go there. Browser storage events notify other tabs of
sign-out/session changes; BroadcastChannel may supplement them. Authoritative
expiry and user lookup still happen in the session store before operations.

## Case and evidence field mapping

Retain current interfaces at the UI adapter boundary while moving durable rows
to snake_case. Amounts use integer cents in durable data to avoid floating-point
drift; the existing dollar-valued UI model converts explicitly both ways.

| Current RentalCase field | Durable cases field / relation |
| --- | --- |
| id (demo / case-timestamp) | id UUID; migration map preserves legacy route alias privately |
| no owner | user_id UUID from AuthClient, never from an untrusted UI payload |
| demo | is_demo boolean |
| address, renter, landlord | address, renter_name, landlord_name |
| moveOut, received | move_out_date, letter_received_date nullable date-only |
| deposit, returned | deposit_cents, returned_cents integer |
| charges | charges JSON with stable UUID id + source_id display label, name, room, amount_cents, verdict, reason, source_ids, low_cents, high_cents |
| evidence | evidence JSON references files.id UUID, source_id display label, evidence_kind and original_name; bytes only in files.blob |
| completedStep | completed_step integer |
| audited, stale | audited, needs_review booleans |
| letter, replyBy | letter_text, reply_by_date nullable date-only |
| incoming, reply | incoming_text, reply_text |
| photoPairs | photo_pairs JSON keyed by stable charge UUID, values before_file_id / after_file_id UUID nullable |
| no timestamps/revision | created_at, updated_at, revision |

Existing human references C01/P01/CA-R01 remain display source IDs. They are not
database ownership IDs. The mapper resolves file UUIDs and display labels without
rewriting the text of original evidence. Old generated source references remain
reviewable; never fabricate a statute. Demo rules remain clearly illustrative.

Most recent = owned cases ordered updated_at descending, then id for stable ties;
reading/navigating alone does not change updated_at. An in-progress owned wizard
case counts as a case. New case records are created only after a deliberate
authenticated start, not during auth route rendering.

## Client contracts

These are proposed interfaces, not executable implementation. All UI-facing
responses use { data, error }; error is null or a sanitized object with code,
message, optional status and retry_after_seconds. An error never contains raw
database errors, secrets, another user's metadata or password hashes.

Public User mirrors the Supabase shape: id UUID, email, aud, role, created_at,
updated_at, email_confirmed_at, confirmed_at, user_metadata.name, app_metadata
(provider email). No internal hash, salt, lock state or pending token is returned.
User metadata is for display, not authorization.

Public Session mirrors the useful Supabase fields: access_token, token_type=bearer,
expires_at (epoch seconds), expires_in (seconds), refresh_token, user. Local
refresh_token is an empty string; local mode deliberately has no automatic
refresh. Durable sessions.expires_at is ISO and is converted at the boundary.
A normal session lasts one hour by draft default. Session mode/password_version
remain private; recovery-only sessions cannot pass the normal guard.

### lib/auth/client.ts — AuthClient

| Method | Inputs | data shape and behavior |
| --- | --- | --- |
| signUp | { email, password, options: { data: { name, consent versions }, emailRedirectTo? } } | { user: User or null, session: null }; do not expose whether email existed; maintain opaque flow context separately |
| signInWithPassword | { email, password } | { user, session } only after password and verified-email checks; uniform incorrect-pair error |
| signOut | optional { scope } | null; flush draft first, revoke sessions per scope, broadcast; default global for SDK parity, UI explicitly selects local for ordinary sign-out |
| getSession | none | { session: Session or null }; check DB expiry, user existence and password version |
| getUser | none | { user: User or null }; verify session from the backing store, not just a token in localStorage |
| onAuthStateChange | synchronous callback(event, session) | { subscription: { unsubscribe() } }; useful Supabase-style subscription shape, not an async response |
| resetPasswordForEmail | email, optional { redirectTo } | null for known/unknown accepted request; token only for existing account; neutral UI |
| updateUser | { data?: { name }, email?, password? } | { user }; profile update, pending verified email change, or reauthenticated password change |
| verifyEmail | { token, type: verify/email_change/recovery } | { user, session }; application extension wrapping local token handling / future verifyOtp; recovery issues only a restricted session, not case access |
| deleteUser | { confirmation, currentPassword } | null; application extension for typed-confirmed self deletion, not Supabase's browser admin API |
| resend | { type: signup/email_change, email, options? } | null; added because the requested resend UX needs it; maps to Supabase resend later |

Flow metadata (flow ID, user-entered email, cooldown, return path) is accessed by a
small internal flow repository behind the AuthClient/provider module, not direct
Dexie reads in components. Creating a flow must not expose pending_user_id or
whether an email exists. A flow ID is not permission to modify an existing user.
Restarting signup for a corrected email does not silently update another account.
Do not persist password fields to carry them between steps.

verifyEmail and deleteUser are intentional application extensions. Supabase
integration will require adapter code, not only swapping an environment variable.
Subscription callbacks stay synchronous/lightweight; schedule case fetching after
the callback to avoid reentrant auth work.

For reset-link validation, verifyEmail with type=recovery checks the token without
consuming it and creates only a recovery-restricted local session bound to the
token. updateUser({ password }) completes the atomic reset transaction and consumes
that token. A Supabase recovery callback may consume its email token before the
password update, so the adapter must preserve the restricted recovery state until
the password is changed; do not assume identical internal token lifecycles.

Auth events used: INITIAL_SESSION, SIGNED_IN, SIGNED_OUT, USER_UPDATED,
PASSWORD_RECOVERY; application SESSION_EXPIRED maps a local expiry to a blocked
state and null session. INITIAL_SESSION is not a new interactive sign-in and
must not navigate a user away from their open case on every refresh.

### lib/db/client.ts — DataClient

Async case operations: listCases, getCase(id), createCase(input),
updateCase(id, patch, expectedRevision), deleteCase(id), getMostRecentCase,
saveDraft(checkpoint), getDraft(caseId), clearDraft(caseId).
Every method returns { data, error }; list returns a list, not undefined.

Derive user_id from a valid current session inside the adapter. Never accept it
as a trusted create/update field. Use the [user_id+...] indexes and include the
owner predicate for every read, update, delete and count. Recheck the session
within a write transaction. A provided UUID belonging to another user yields
the same not-found result as an absent UUID. Lists contain only the current user.

The provider's in-memory recovery buffer is independent of component unmount.
An internal checkpoint writer may retain already-owned edited fields on expiry;
it can write only the captured owner's draft and cannot read/return other data
or grant a general expired-session CRUD capability. Reauthentication is required
before that checkpoint can be read by UI code or applied to a case.

Compare expectedRevision on writes. Concurrent-tab conflicts return a reviewable
conflict with retained local edits; do not blindly replace newer saved data.
Changing evidence invalidates dependent findings and estimates as in MASTER.md.

### lib/storage/client.ts — StorageClient

StorageClient.from(bucket), bucket strictly documents or photos:

| Method | Response data | Required checks |
| --- | --- | --- |
| upload(path, file, options?) | { id, path, fullPath } | signed-in verified owner, owned case, size/MIME, safe normalized path; no overwrite unless explicitly requested |
| download(path) | Blob | active owner and exact bucket/path/owned-case relation |
| remove(paths) | array of removed object metadata | all objects owned; transaction fails without partial deletion if any is invalid |
| list(prefix) | metadata list (no blobs) | prefix constrained to current user; never list all users |
| createSignedUrl(path, expiresIn=60) | { signedUrl } | recheck ownership and return tracked object URL; no persisted URL |

Path convention: {user_id}/{case_id}/{filename}; case/user segments are UUIDs.
Use a UUID-prefixed sanitized filename to avoid collisions; original_name preserves
the exact display name. Reject slash/backslash traversal, empty segments and a
different owner prefix. Check case ownership as well as prefix text. File bucket
matches type: photos for accepted image files; documents for PDF or document images.

Keep the current 10MB-per-file limit and JPG/PNG/PDF upload policy unless changed
at review. Validate byte size and detectable MIME/signature, not just filename;
do not execute uploaded HTML/SVG. Trusted bundled demo SVG illustrations can be
rendered to PNG for the internal seed; this is not permission for arbitrary SVG
uploads. Do not mutate original user evidence.

Blobs, file metadata and parent case evidence references commit together locally.
If a transaction fails, preserve the previous state and report a useful storage
error; never claim an original was saved after an aborted transaction. Generate
previews from tracked Blob URLs only after authorization. Revoke on unmount,
expiry timer, logout, user switch and account deletion. Locally a Blob URL is not
a true server-signed URL: it can be copied and has no server-enforced TTL. The
adapter revokes it after expiresIn, but Supabase provides the real URL signing.

## Proposed TypeScript surface

The signatures below are design contracts, not new source files. User/Session are
the public shapes above; CaseRow, CaseInput, CasePatch, Checkpoint and FileMetadata
are the mapped row/input shapes in this document. Client implementations own their
validation, error mapping, transaction boundaries and session checks.

```typescript
type ClientError = { code: string; message: string; status?: number; retry_after_seconds?: number };
type Result<T> = { data: T | null; error: ClientError | null };
type AuthData = { user: User | null; session: Session | null };
type SignUpInput = {
  email: string; password: string;
  options: { data: { name: string; terms_version: string; privacy_version: string; consented_at: string }; emailRedirectTo?: string };
};
type UserAttributes = { data?: { name: string }; email?: string; password?: string };
interface AuthClient {
  signUp(input: SignUpInput): Promise<Result<AuthData>>;
  signInWithPassword(input: { email: string; password: string }): Promise<Result<AuthData>>;
  signOut(options?: { scope: 'local' | 'global' }): Promise<Result<null>>;
  getSession(): Promise<Result<{ session: Session | null }>>;
  getUser(): Promise<Result<{ user: User | null }>>;
  onAuthStateChange(callback: (event: AuthEvent, session: Session | null) => void): {
    data: { subscription: { unsubscribe(): void } }; error: null;
  };
  resetPasswordForEmail(email: string, options?: { redirectTo?: string }): Promise<Result<null>>;
  updateUser(input: UserAttributes): Promise<Result<{ user: User }>>;
  verifyEmail(input: { token: string; type: 'verify' | 'email_change' | 'recovery' }): Promise<Result<AuthData>>;
  deleteUser(input: { confirmation: 'DELETE'; currentPassword: string }): Promise<Result<null>>;
  resend(input: { type: 'signup' | 'email_change'; email: string; options?: { emailRedirectTo?: string } }): Promise<Result<null>>;
}
interface DataClient {
  listCases(): Promise<Result<CaseRow[]>>;
  getCase(id: string): Promise<Result<CaseRow>>;
  getMostRecentCase(): Promise<Result<CaseRow | null>>;
  createCase(input: CaseInput): Promise<Result<CaseRow>>;
  updateCase(id: string, patch: CasePatch, expectedRevision: number): Promise<Result<CaseRow>>;
  deleteCase(id: string): Promise<Result<null>>;
  saveDraft(checkpoint: Checkpoint): Promise<Result<Checkpoint>>;
  getDraft(draftKey: string): Promise<Result<Checkpoint | null>>;
  clearDraft(draftKey: string): Promise<Result<null>>;
}
interface StorageBucketClient {
  upload(path: string, file: File | Blob, options?: { upsert?: boolean }): Promise<Result<{ id: string; path: string; fullPath: string }>>;
  download(path: string): Promise<Result<Blob>>;
  remove(paths: string[]): Promise<Result<FileMetadata[]>>;
  list(prefix: string): Promise<Result<FileMetadata[]>>;
  createSignedUrl(path: string, expiresIn?: number): Promise<Result<{ signedUrl: string }>>;
}
interface StorageClient { from(bucket: 'documents' | 'photos'): StorageBucketClient; }
```

CaseInput and CasePatch explicitly exclude user_id; callers cannot set ownership.
The adapter supplies it. Checkpoint UI writes cannot choose another user either.
The native Supabase responses are normalized at this boundary when shapes differ.

## Password, token and rate-limit lifecycle

- New registrations remain unverified. Consent versions/time are recorded.
- Wrong or unknown email/password pair -> one incorrect-pair message. Use equivalent
  password-hash work for a missing account to avoid an obvious fast failure path;
  do not claim constant-time browser authentication.
- rate_limits row per normalized email key and sign_in operation exists even for
  unknown emails. Five failed sign-ins -> five-minute lock. Re-read before every
  attempt, serialize concurrent attempts, and persist absolute locked_until.
  Successful sign-in clears that key's failed count. Blank/syntax-invalid input
  is a local validation failure, not a password attempt.
- Reset/resend/signup delivery: 60-second per-flow cooldown and at most five accepted
  requests per normalized email/purpose in five minutes; sixth gets five-minute
  request lock. Apply equally to known/unknown addresses. Counters survive reload.
- Generate single-use raw tokens from 32 random bytes. Store only SHA-256 token_hash
  in auth_tokens; verify expires in 24 hours, reset in one hour. Bind purpose,
  owner, target email and flow. Resend invalidates older tokens for that purpose.
- GET/preview does not consume a link. Explicit Verify or successful password
  update atomically checks token hash/purpose/expiry/unused flag, applies changes,
  marks used_at, and invalidates siblings. A race can succeed only once.
- Reset revokes all old sessions, clears the active pointer, broadcasts expiry,
  and returns the user to sign-in with the preserved allowed return path.
- Profile password changes require the current password and rotate other sessions.
  The active session is replaced deliberately; no old password-version token survives.
- Email change leaves the old email working until confirmation. Uniqueness is
  rechecked inside the verification transaction. A duplicate address gets a generic
  update failure, not someone else's profile. On success rotate session metadata.
- No tokens/passwords in analytics/error reports; no third-party auth-page scripts.
  Use no-referrer for verification/reset pages. Remove the raw token from the URL
  after successful use; don't store it in a case draft or general localStorage.
- In development only, simulated email stores the raw one-time link in the dev
  Outbox and logs it to console as explicitly requested. Production has neither.

## Session expiry and restoration

```text
valid session + edited case
    -> draft buffer (on every edit; durable writes debounced)
    -> expiry detected before operation
    -> stop new work / cancel or ignore late results
    -> flush checkpoint + file transaction if already in flight
    -> masked "Sign in to keep going"
    -> login with validated returnTo
    -> same owner? restore latest revision + step/tab/focus/scroll
       different owner? keep prior draft private; open new owner's destination
```

Store no passwords in checkpoints. Inputs, letter text, reply edits, file references
and wizard progress must be represented before a guard unmounts their screen.
The root provider survives client auth route navigation; a memory buffer protects
the interval before a durable write. If quota/storage denial prevents a checkpoint,
keep the screen blocked and tab open rather than redirect/unmount and lose edits.
Do not promise survival of a browser crash when storage is denied.

On explicit sign-out flush first; if it fails retain the session/draft and offer
Retry/Keep working. On involuntary expiry access is blocked even if saving fails.
A completed in-flight save must recheck ownership and cannot update a newly
signed-in different user's state. Cross-tab sign-out invalidates all relevant
caches and Blob URLs. Recheck on visibility return, not only a throttled timer.

## Demo seeding and environment

Planned env values, not written during Phase 1:
- NEXT_PUBLIC_BACKEND=local
- NEXT_PUBLIC_ENABLE_OAUTH=false
- DEMO_PASSWORD=<locally configured strong password>, server-only .env.local

Seed once per fresh database: demo@tenantshield.app, verified, one owned fixture
case with UUID ownership, real local file metadata/blobs, and all six existing
charges. Preserve its clearly labeled illustrative findings and rule topics.
Generate small bundled example PDFs and import/render known illustration assets
as safe photo blobs; don't leave virtual documents referencing another user's data.
No demo seed for newly registered accounts.

A server-only local-bootstrap route reads DEMO_PASSWORD and derives the seed
verifier using Web Crypto with the same PBKDF2 parameters. It returns only seed
hash/salt/parameters and nonsensitive fixture manifest in production/local mode;
the account remains only browser-local. This exposes a local verifier by design,
not a production authentication service. Never put DEMO_PASSWORD in a
NEXT_PUBLIC variable, client bundle, public manifest or production response.

Development-only config may provide the password to the dev credential panel,
strictly guarded server-side by NODE_ENV=development. Seeding is idempotent in a
transaction using app_meta; simultaneous tabs cannot create duplicates. Missing
DEMO_PASSWORD is a clear setup error, never a hardcoded fallback or regenerated
password on every load. A completed seed marker remains after account deletion
so deleting the demo account does not recreate it on the next navigation.

Local mode has no real email provider. Development uses same-browser Outbox links.
In production/local mode, do not claim a real email was sent: signup/reset/resend
that require delivery return an explicit configuration failure before mutating an
account. A configured verified demo account may still sign in with a password the
operator already knows. Confirm this development/demo boundary before deployment.

## Account deletion

UI requires current-password check and exact typed DELETE before calling self
delete. Resolve owner internally; never take an arbitrary target user_id.
One local transaction removes that user's users row, sessions, cases, file blobs
and references, drafts, owned token/flow/outbox records, consent data and owned
legacy archive entries. Revoke memory object URLs/caches after commit and route
to Landing. Any failure rolls back the local deletion and preserves the account.
App-level seed marker is not account data and remains to prevent resurrection.

For future Supabase, deleting Auth users alone is insufficient for a full private
storage cleanup. Use a server-owned self-deletion workflow with reauthentication,
owned-object removal and database cleanup, then Auth deletion. Handle retries and
partial remote failures explicitly; never reuse the local all-or-nothing message
for a partially completed remote deletion.

## Preserve and migrate existing browser cases

Do not silently assign unowned legacy cases to the first user. Local storage
cannot prove who created them. Do not erase previous inspection evidence.

1. Read legacy tenant-shield keys and tenant-shield-evidence blobs with an isolated
   migration module. Copy a complete raw snapshot into legacy_archive in IndexedDB.
2. Verify case/file counts and byte sizes before marking the archive durable.
   Remove only exact migrated legacy keys once the durable copy is verified; no
   broad localStorage.clear or deleting the old database during this phase.
3. After verified sign-in, offer "Import cases saved in this browser" with an
   explanation and explicit ownership confirmation. No signed-out preview.
4. Import selected records for that owner in a transaction, generate UUID mappings,
   remap source/file/charge relationships, retain original bytes, and update case
   aliases. Store import mapping for idempotence; reloading must not duplicate cases.
5. Preserve the original archive pending explicit cleanup. Its imported owner
   association is included in account-deletion scope.
6. /case/demo maps only to the signed-in demo owner's seeded UUID case. A different
   account does not get the fixture through a public readCase fallback.
   Legacy case-timestamp aliases resolve only after ownership/import validation.

After successful import, normal application code never reads/writes legacy case
JSON in localStorage. Archive access stays internal and guarded. Import to Supabase
is a separate explicit choice; it must not upload legacy private files automatically.

## Migrating to Supabase

This is an adapter migration plan, not a connection. Phase 2 writes draft
supabase/schema.sql and supabase/storage.sql; do not apply them automatically or
modify a teammate's existing migration without coordination.

Env: NEXT_PUBLIC_BACKEND=supabase; NEXT_PUBLIC_SUPABASE_URL;
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY (or the project's supported legacy anon-key
equivalent); NEXT_PUBLIC_ENABLE_OAUTH=false until configured. A service-role/admin
secret is server-only if required for self-deletion; never NEXT_PUBLIC.
Configure allowed redirect URLs, email templates/delivery and session behavior.

Implement:
- lib/auth/supabase.ts: wrap Supabase Auth methods and public User/Session mapping.
  verifyEmail maps to verifyOtp/email callback handling. resend maps to Auth resend.
  deleteUser invokes an authenticated server self-delete endpoint; browser code
  never calls Auth admin.deleteUser or contains an admin key.
- lib/db/supabase.ts: query cases/files with RLS and keep view-model conversions;
  use server-enforced revision checking for edits. Use a defined draft strategy.
- lib/storage/supabase.ts: private documents/photos buckets, owner/case prefixes,
  real signed URLs, metadata consistency and explicit cleanup on failures.
- lib/backend.ts: enable the implemented adapters; remove the throwing stub only
  after ownership/recovery tests pass.
- Next server/client session handling: validate trusted server sessions and RLS;
  a localStorage token string must never be treated as a valid Supabase user.

Schema plan:
- cases: id UUID PK, user_id UUID referencing auth.users, mapped fields above,
  created_at/updated_at timestamptz, revision. Index (user_id, updated_at).
- files: UUID PK, user_id, case_id, bucket/path/type/size/original-name/evidence
  metadata, created_at; unique(bucket,path). Omit blob; bytes live in Storage.
  Enforce that files.user_id owns files.case_id, including UPDATE reassignment.
- Enable RLS and ownership SELECT/DELETE USING and INSERT WITH CHECK policies.
  UPDATE needs both USING and WITH CHECK so user_id cannot be reassigned.
- storage.sql creates documents/photos with public=false. Policies constrain both
  bucket and first path segment to auth.uid(), and validate owned case segment.
  No anonymous access, broad authenticated-all policy, or public asset URL fallback.
- Local users/password_hash/salt/sessions stores do not become public SQL tables.
  Supabase Auth owns identities, credentials and sessions. Name maps to
  user.user_metadata.name; consent/profile fields needing independent retention
  require an agreed profile/consent schema, not an invented Auth password column.
- Helper token/rate/outbox stores are replaced by Auth/delivery behavior; browser
  drafts may remain an owner-scoped offline buffer. Durable cross-device drafts
  require a reviewed separate RLS table or dedicated cases draft fields.

Import plan: sign in/reverify to establish a real Supabase UID, explicitly select
cases, retain case/file UUIDs where possible, replace local user_id/path prefixes
with the authenticated remote UID, upload blobs, verify metadata and record an
idempotent mapping. Do not assume local PBKDF2 password hashes can be imported as
Supabase passwords; users create/reset credentials through Auth. Never trust a
browser-provided local UID as authorization for a remote account.

Primary references consulted for the adapter plan:
[Supabase signUp](https://supabase.com/docs/reference/javascript/auth-signup),
[verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp),
[getSession](https://supabase.com/docs/reference/javascript/auth-getsession),
[server-only admin deletion](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser),
[row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security),
[private Storage policies](https://supabase.com/docs/guides/storage/security/access-control).
Dexie indexes and non-indexed blob design follow
[Version.stores](https://dexie.org/docs/Version/Version.stores()).
These support interface mapping and policy mechanics, not the security of local auth.

## Phase 2 implementation and acceptance gates

Implement in the requested order: data/clients -> provider/guards -> login ->
signup -> check email/verify -> forgot/reset -> account menu -> settings ->
expiry recovery -> idempotent demo seed. No auth code is authorized in Phase 1.

After each meaningful build step, use whatever subset is available; once the
flow exists run signup -> verify -> create case -> upload photo -> sign out ->
sign in -> case and original photo still present. Use mocked client contract
tests early rather than pretending a missing auth screen is already testable.
Build after each screen and commit only on feature/auth-ui (or its chosen suffix).

Required final tests:
- Account A cannot read/list/update/delete/download/sign a URL for B's case/files,
  even with B's UUID, forged user_id or crafted path.
- Unverified, expired and recovery-only sessions cannot enter any /case/* or
  /account; initialization never flashes protected content.
- returnTo preserves valid owned step/tab and rejects external/protocol-relative/
  encoded malicious destinations. Failed login and rate-limit keep user entries.
- Password paste/autofill/toggle, blur errors, first-error focus, Enter submit,
  checklist announcements, 44px targets, 16px inputs, 200% zoom and reduced motion.
- Five failed attempts, reload/multi-tab persistence, exact five-minute expiry;
  identical ordinary messages for known/unknown email.
- Verification/reset expiry, purpose mismatch, single-use races, resend invalidation,
  wrong-email restart, and no protected access before verification.
- Expire during letter/reply typing and file write; same-owner restoration;
  different-owner isolation; quota-denial path retains memory without claiming saved.
- Typed deletion rolls back on local transaction failure, removes only A's account
  and all its case data, revokes URLs/sessions, and never recreates a deleted seed.
- Outbox/credential panel/logging absent in production; DEMO_PASSWORD never appears
  in public assets/production payloads; missing setup fails clearly.
- Fixture ownership and data survive reload/sign-out; legacy import is explicit,
  idempotent and preserves originals. No new localStorage case/file writes.
