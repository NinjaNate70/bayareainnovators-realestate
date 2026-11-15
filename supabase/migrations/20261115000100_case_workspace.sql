-- Case workspace for NEXT_PUBLIC_BACKEND=supabase: renter cases, their file
-- records and the private documents/photos buckets. Accounts and sessions are
-- Supabase Auth's own; there is no users table here.
--
-- Run once in the Supabase SQL Editor. It is safe to run again, and safe to
-- run in a project where supabase/schema.sql and supabase/storage.sql were
-- already applied: it creates the same tables and then brings policies,
-- grants and the revision trigger up to date.

create table if not exists public.cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  is_demo boolean not null default false,
  address text not null default '',
  renter_name text not null default '',
  landlord_name text not null default '',
  move_out_date date,
  letter_received_date date,
  deposit_cents bigint not null default 0 check (deposit_cents >= 0),
  returned_cents bigint not null default 0 check (returned_cents >= 0),
  completed_step integer not null default 0 check (completed_step between 0 and 4),
  audited boolean not null default false,
  needs_review boolean not null default false,
  letter_text text not null default '',
  reply_by_date date,
  incoming_text text not null default '',
  reply_text text not null default '',
  charges jsonb not null default '[]',
  evidence jsonb not null default '[]',
  photo_pairs jsonb,
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index if not exists cases_owner_recent on public.cases (user_id, updated_at desc);

create table if not exists public.files (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  case_id uuid not null,
  bucket text not null check (bucket in ('documents', 'photos')),
  path text not null,
  mime_type text not null,
  size bigint not null check (size > 0 and size <= 10485760),
  original_name text not null,
  created_at timestamptz not null default now(),
  unique (bucket, path),
  foreign key (case_id, user_id) references public.cases (id, user_id) on delete cascade,
  check (split_part(path, '/', 1) = user_id::text and split_part(path, '/', 2) = case_id::text)
);

-- Every update gets a new revision and timestamp from the database, and can
-- never move a case to another owner. The app matches on the revision it read,
-- so a stale tab's write changes nothing instead of overwriting newer work.
create or replace function public.touch_case()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.id := old.id;
  new.user_id := old.user_id;
  new.created_at := old.created_at;
  new.revision := old.revision + 1;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists touch_case on public.cases;
create trigger touch_case before update on public.cases
  for each row execute function public.touch_case();

alter table public.cases enable row level security;
alter table public.files enable row level security;

revoke all on public.cases, public.files from anon;
grant select, insert, update, delete on public.cases, public.files to authenticated;

drop policy if exists cases_owner on public.cases;
create policy cases_owner on public.cases for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists files_owner on public.files;
create policy files_owner on public.files for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('documents', 'documents', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg']),
  ('photos', 'photos', false, 10485760, array['image/png', 'image/jpeg'])
on conflict (id) do nothing;

-- A renter reaches only <their user id>/<one of their case ids>/... in these
-- two buckets. The inspection-photos bucket keeps its own policies.
drop policy if exists evidence_owner on storage.objects;
create policy evidence_owner on storage.objects for all to authenticated
  using (
    bucket_id in ('documents', 'photos')
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.cases c
      where c.user_id = (select auth.uid()) and c.id::text = (storage.foldername(name))[2]
    )
  )
  with check (
    bucket_id in ('documents', 'photos')
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and exists (
      select 1 from public.cases c
      where c.user_id = (select auth.uid()) and c.id::text = (storage.foldername(name))[2]
    )
  );
