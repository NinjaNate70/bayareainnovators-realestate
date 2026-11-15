begin;

create table public.leases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  lease_id uuid not null references public.leases(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  unique (lease_id, name)
);

create table public.inspection_photos (
  id uuid primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  phase text not null check (phase in ('move_in', 'move_out')),
  original_name text not null check (char_length(btrim(original_name)) between 1 and 255),
  content_type text not null check (content_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif')),
  storage_path text generated always as (user_id::text || '/' || room_id::text || '/' || id::text) stored unique,
  uploaded_at timestamptz
);

create index leases_user_id_idx on public.leases (user_id);
create index inspection_photos_room_id_idx on public.inspection_photos (room_id);

alter table public.leases enable row level security;
alter table public.rooms enable row level security;
alter table public.inspection_photos enable row level security;

revoke all on public.leases, public.rooms, public.inspection_photos from anon, authenticated;
grant select on public.leases, public.rooms, public.inspection_photos to authenticated;
grant insert (name) on public.leases to authenticated;
grant insert (lease_id, name) on public.rooms to authenticated;
grant insert (id, room_id, phase, original_name, content_type) on public.inspection_photos to authenticated;

create policy "Read own leases" on public.leases for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Create own leases" on public.leases for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy "Read rooms in own leases" on public.rooms for select to authenticated
  using (exists (select 1 from public.leases where leases.id = rooms.lease_id));
create policy "Add rooms to own leases" on public.rooms for insert to authenticated
  with check (exists (select 1 from public.leases where leases.id = rooms.lease_id));

create policy "Read own photo records" on public.inspection_photos for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Stage photos in own rooms" on public.inspection_photos for insert to authenticated
  with check (
    user_id = (select auth.uid()) and uploaded_at is null
    and exists (select 1 from public.rooms where rooms.id = inspection_photos.room_id)
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'inspection-photos', 'inspection-photos', false, 20971520,
  array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
);

create policy "Read objects for own inspection photos" on storage.objects for select to authenticated
  using (
    bucket_id = 'inspection-photos'
    and exists (select 1 from public.inspection_photos where storage_path = objects.name)
  );

create policy "Upload staged inspection photos" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'inspection-photos'
    and exists (
      select 1 from public.inspection_photos
      where storage_path = objects.name and uploaded_at is null
    )
  );

create function public.complete_inspection_photo(photo_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.inspection_photos as photo
  set uploaded_at = coalesce(photo.uploaded_at, now())
  where photo.id = photo_id
    and photo.user_id = (select auth.uid())
    and exists (
      select 1 from storage.objects as object
      where object.bucket_id = 'inspection-photos' and object.name = photo.storage_path
    );
  return found;
end;
$$;

revoke all on function public.complete_inspection_photo(uuid) from public, anon, authenticated;
grant execute on function public.complete_inspection_photo(uuid) to authenticated;

commit;
