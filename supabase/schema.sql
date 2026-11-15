-- Prepared for review; not applied. Supabase Auth replaces local users/sessions.
create table public.cases (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  is_demo boolean not null default false, address text not null default '', renter_name text not null default '', landlord_name text not null default '',
  move_out_date date, letter_received_date date, deposit_cents bigint not null default 0 check(deposit_cents>=0), returned_cents bigint not null default 0 check(returned_cents>=0),
  completed_step integer not null default 0 check(completed_step between 0 and 4), audited boolean not null default false, needs_review boolean not null default false,
  letter_text text not null default '', reply_by_date date, incoming_text text not null default '', reply_text text not null default '',
  charges jsonb not null default '[]', evidence jsonb not null default '[]', photo_pairs jsonb,
  revision integer not null default 1, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(id,user_id)
);
create index cases_owner_recent on public.cases(user_id,updated_at desc);
create table public.files (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid not null, bucket text not null check(bucket in ('documents','photos')), path text not null,
  mime_type text not null, size bigint not null check(size>0 and size<=10485760), original_name text not null,
  created_at timestamptz not null default now(), unique(bucket,path),
  foreign key(case_id,user_id) references public.cases(id,user_id) on delete cascade,
  check(split_part(path,'/',1)=user_id::text and split_part(path,'/',2)=case_id::text)
);
alter table public.cases enable row level security;
alter table public.files enable row level security;
create policy cases_owner on public.cases for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
create policy files_owner on public.files for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
-- No blob column remotely: bytes go to private Storage. Updated_at/revision must
-- be enforced by a reviewed trigger/RPC adapter with optimistic concurrency.
-- Self-delete needs a server endpoint that clears Storage and Auth, with retries;
-- never expose a service_role key to the browser. Consent metadata needs review.
