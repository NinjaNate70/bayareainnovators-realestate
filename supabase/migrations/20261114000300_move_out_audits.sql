begin;

create table public.move_out_audits (
  id uuid primary key default gen_random_uuid(),
  lease_id uuid not null unique references public.leases(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table public.move_out_audit_rooms (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null,
  user_id uuid not null,
  room_id uuid not null references public.rooms(id) on delete cascade,
  before_id uuid references public.inspection_photos(id) on delete set null,
  after_id uuid references public.inspection_photos(id) on delete set null,
  status text not null check (status in ('awaiting_photos', 'queued', 'inspecting', 'review_queued', 'reviewing', 'completed', 'needs_review', 'failed')),
  category text check (category in ('no_damage', 'normal_wear_and_tear', 'repair')),
  condition_finding jsonb,
  evidence_finding jsonb,
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_until timestamptz,
  worker_token uuid,
  foreign key (audit_id, user_id) references public.move_out_audits(id, user_id) on delete cascade,
  unique (audit_id, room_id),
  check ((status = 'completed') = (category is not null))
);

create index move_out_audits_user_idx on public.move_out_audits (user_id);
create index move_out_audit_rooms_user_idx on public.move_out_audit_rooms (user_id);
create index move_out_audit_rooms_queue_idx on public.move_out_audit_rooms (available_at, locked_until)
  where status in ('queued', 'inspecting', 'review_queued', 'reviewing');

alter table public.move_out_audits enable row level security;
alter table public.move_out_audit_rooms enable row level security;
revoke all on public.move_out_audits, public.move_out_audit_rooms from public, anon, authenticated;
grant select on public.move_out_audits, public.move_out_audit_rooms to authenticated;
grant select, update on public.move_out_audit_rooms to service_role;
grant select (id, user_id, room_id, phase, uploaded_at, storage_path, content_type) on public.inspection_photos to service_role;

create policy "Read own audits" on public.move_out_audits for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Read own audit rooms" on public.move_out_audit_rooms for select to authenticated
  using (user_id = (select auth.uid()));

create function public.audit_photo_matches(p_photo uuid, p_room uuid, p_user uuid, p_phase text)
returns boolean language sql stable set search_path = '' as $$
  select p_photo is null or exists (
    select 1 from public.inspection_photos
    where id = p_photo and room_id = p_room and user_id = p_user and phase = p_phase and uploaded_at is not null
  );
$$;
revoke all on function public.audit_photo_matches(uuid, uuid, uuid, text) from public, anon, authenticated;

create function public.start_move_out_audit(p_lease uuid, p_pairs jsonb, p_consent boolean)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  audit_owner uuid := auth.uid();
  new_audit uuid;
  room_count integer;
  valid_pairs integer;
begin
  if p_consent is not true or audit_owner is null then
    raise exception 'Sign in and confirm that selected photos can be sent to Gemini.';
  end if;
  if not exists (select 1 from public.leases where id = p_lease and user_id = audit_owner) then
    raise exception 'Lease unavailable.';
  end if;
  select count(*) into room_count from public.rooms where lease_id = p_lease;
  if room_count = 0 or jsonb_typeof(p_pairs) is distinct from 'array' then
    raise exception 'Add rooms and select evidence before starting the audit.';
  end if;
  select count(distinct pair.room_id) into valid_pairs
  from jsonb_to_recordset(p_pairs) as pair(room_id uuid, before_id uuid, after_id uuid)
  join public.rooms as room on room.id = pair.room_id and room.lease_id = p_lease
  where public.audit_photo_matches(pair.before_id, room.id, audit_owner, 'move_in')
    and public.audit_photo_matches(pair.after_id, room.id, audit_owner, 'move_out');
  if valid_pairs <> room_count or jsonb_array_length(p_pairs) <> room_count then
    raise exception 'Select one valid move-in and move-out pair, or mark missing photos, for each room.';
  end if;

  insert into public.move_out_audits (lease_id, user_id) values (p_lease, audit_owner)
  on conflict (lease_id) do nothing returning id into new_audit;
  if new_audit is null then
    return (select id from public.move_out_audits where lease_id = p_lease and user_id = audit_owner);
  end if;
  insert into public.move_out_audit_rooms (audit_id, user_id, room_id, before_id, after_id, status)
  select new_audit, audit_owner, pair.room_id, pair.before_id, pair.after_id,
    case when pair.before_id is null or pair.after_id is null then 'awaiting_photos' else 'queued' end
  from jsonb_to_recordset(p_pairs) as pair(room_id uuid, before_id uuid, after_id uuid);
  return new_audit;
end;
$$;

create function public.resume_move_out_audit_room(p_job uuid, p_before uuid, p_after uuid, p_consent boolean)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  audit_owner uuid := auth.uid();
  target_room uuid;
begin
  if p_consent is not true or audit_owner is null or p_before is null or p_after is null then
    raise exception 'Select both photos and confirm that they can be sent to Gemini.';
  end if;
  select room_id into target_room from public.move_out_audit_rooms where id = p_job and user_id = audit_owner;
  if target_room is null or not public.audit_photo_matches(p_before, target_room, audit_owner, 'move_in')
    or not public.audit_photo_matches(p_after, target_room, audit_owner, 'move_out') then
    raise exception 'Select completed photos from the same room and the correct phases.';
  end if;
  update public.move_out_audit_rooms
  set before_id = p_before, after_id = p_after, status = 'queued', attempts = 0, available_at = now(),
      locked_until = null, worker_token = null, condition_finding = null, evidence_finding = null, category = null
  where id = p_job and user_id = audit_owner and status in ('awaiting_photos', 'needs_review', 'failed')
    and (status <> 'needs_review' or before_id is distinct from p_before or after_id is distinct from p_after);
  return found;
end;
$$;

create function public.claim_move_out_audit_room()
returns setof public.move_out_audit_rooms language plpgsql security definer set search_path = '' as $$
begin
  update public.move_out_audit_rooms set status = 'failed', locked_until = null, worker_token = null
  where status in ('inspecting', 'reviewing') and attempts >= 3 and locked_until <= now();

  return query
  with candidate as (
    select id from public.move_out_audit_rooms
    where attempts < 3 and available_at <= now()
      and (status in ('queued', 'review_queued') or (status in ('inspecting', 'reviewing') and locked_until <= now()))
    order by available_at, id limit 1 for update skip locked
  )
  update public.move_out_audit_rooms as job
  set status = case when job.status in ('queued', 'inspecting') then 'inspecting' else 'reviewing' end,
      attempts = job.attempts + 1, locked_until = now() + interval '3 minutes', worker_token = gen_random_uuid()
  from candidate where candidate.id = job.id returning job.*;
end;
$$;

revoke all on function public.start_move_out_audit(uuid, jsonb, boolean),
  public.resume_move_out_audit_room(uuid, uuid, uuid, boolean), public.claim_move_out_audit_room()
  from public, anon, authenticated;
grant execute on function public.start_move_out_audit(uuid, jsonb, boolean),
  public.resume_move_out_audit_room(uuid, uuid, uuid, boolean) to authenticated;
grant execute on function public.claim_move_out_audit_room() to service_role;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime' and not puballtables) then
    alter publication supabase_realtime add table public.move_out_audit_rooms;
  end if;
end;
$$;

commit;
