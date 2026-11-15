-- Document library: a private place for a renter's files that don't belong to
-- any case. The My documents page stores them under <user id>/files/<file>.
--
-- Run once in the Supabase SQL Editor. It is safe to run again.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('library', 'library', false, 10485760, array['application/pdf', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

-- A renter reaches only files under their own user id in this bucket.
drop policy if exists library_owner on storage.objects;
create policy library_owner on storage.objects for all to authenticated
  using (
    bucket_id = 'library'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'library'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
