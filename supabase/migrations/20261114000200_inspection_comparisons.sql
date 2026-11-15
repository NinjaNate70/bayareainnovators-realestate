begin;

create table public.repair_price_bands (
  region text not null check (region = lower(btrim(region)) and char_length(region) between 1 and 120),
  code text not null check (code ~ '^[a-z][a-z0-9_]{0,79}$'),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  low_cents integer not null check (low_cents >= 0),
  high_cents integer not null check (high_cents >= low_cents),
  currency text not null check (currency ~ '^[A-Z]{3}$'),
  unit text not null check (char_length(btrim(unit)) between 1 and 120),
  source text not null check (char_length(btrim(source)) between 1 and 500),
  effective_on date not null,
  primary key (region, code)
);

create table public.inspection_comparisons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  move_in_photo_id uuid not null references public.inspection_photos(id) on delete cascade,
  move_out_photo_id uuid not null references public.inspection_photos(id) on delete cascade,
  spot text not null check (char_length(btrim(spot)) between 1 and 120),
  region text check (region = lower(btrim(region)) and char_length(region) between 1 and 120),
  status text not null default 'processing' check (status in ('processing', 'ready', 'needs_review')),
  category text check (category in ('no_damage', 'normal_wear_and_tear', 'repair')),
  summary text check (char_length(btrim(summary)) between 1 and 2000),
  repair_code text,
  estimate jsonb,
  model text not null,
  created_at timestamptz not null default now(),
  check (move_in_photo_id <> move_out_photo_id),
  check (
    (status = 'processing' and category is null and summary is null)
    or (status = 'needs_review' and category is null and summary is not null)
    or (status = 'ready' and category is not null and summary is not null)
  ),
  check ((repair_code is null and estimate is null) or (category is not distinct from 'repair' and repair_code is not null and estimate is not null)),
  unique (move_in_photo_id, move_out_photo_id)
);

create index inspection_comparisons_user_room_idx on public.inspection_comparisons (user_id, room_id, created_at desc);
create index inspection_comparisons_move_out_idx on public.inspection_comparisons (move_out_photo_id);

alter table public.repair_price_bands enable row level security;
alter table public.inspection_comparisons enable row level security;
revoke all on public.repair_price_bands, public.inspection_comparisons from public, anon, authenticated;
grant select on public.inspection_comparisons to authenticated;
grant select on public.repair_price_bands to service_role;
grant select, insert, update, delete on public.inspection_comparisons to service_role;

create policy "Read own completed comparisons" on public.inspection_comparisons for select to authenticated
  using (user_id = (select auth.uid()) and status <> 'processing');

commit;
