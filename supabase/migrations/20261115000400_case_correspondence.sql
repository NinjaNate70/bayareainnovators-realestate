begin;

create table if not exists public.case_messages (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null check (kind in ('letter', 'reply')),
  status text not null check (status in ('received', 'draft', 'sent')),
  subject text not null default '' check (char_length(subject) <= 200 and subject !~ '[\r\n]'),
  body text not null check (char_length(btrim(body)) between 1 and 20000),
  email text not null default '' check (char_length(email) <= 254 and email !~ '[\r\n]'),
  source_ids text[] not null default '{}' check (cardinality(source_ids) <= 32),
  review_note text not null default '' check (char_length(review_note) <= 300),
  created_at timestamptz not null default now(),
  occurred_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (status <> 'received' or kind = 'reply'),
  foreign key (case_id, user_id) references public.cases (id, user_id) on delete cascade
);

create index if not exists case_messages_thread_idx on public.case_messages (case_id, occurred_at desc, id desc);
create index if not exists case_messages_owner_idx on public.case_messages (user_id);

create or replace function public.touch_case_message()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := clock_timestamp();
  if old.status = 'draft' and new.status = 'sent' then
    new.occurred_at := new.updated_at;
  end if;
  return new;
end;
$$;
revoke all on function public.touch_case_message() from public, anon, authenticated;
drop trigger if exists touch_case_message on public.case_messages;
create trigger touch_case_message before update on public.case_messages
  for each row execute function public.touch_case_message();

alter table public.case_messages enable row level security;
revoke all on public.case_messages from public, anon, authenticated;
grant select on public.case_messages to authenticated;
grant insert (case_id, kind, status, subject, body, email, source_ids, review_note, occurred_at) on public.case_messages to authenticated;
grant update (status, subject, body, email) on public.case_messages to authenticated;

drop policy if exists case_messages_read on public.case_messages;
create policy case_messages_read on public.case_messages for select to authenticated
  using (user_id = (select auth.uid()));
drop policy if exists case_messages_insert on public.case_messages;
create policy case_messages_insert on public.case_messages for insert to authenticated
  with check (user_id = (select auth.uid()));
drop policy if exists case_messages_edit_draft on public.case_messages;
create policy case_messages_edit_draft on public.case_messages for update to authenticated
  using (user_id = (select auth.uid()) and status = 'draft')
  with check (user_id = (select auth.uid()) and status in ('draft', 'sent'));

notify pgrst, 'reload schema';
commit;
