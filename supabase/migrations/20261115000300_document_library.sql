-- Document library: a private place for a renter's files that don't belong to
-- any case. The My documents page stores them under <user id>/files/<file>.
--
-- Run once in the Supabase SQL Editor. It is safe to run again, and running it
-- again updates an existing library to the current file types and size limit.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'library', 'library', false, 20971520,
  array[
    'application/pdf',
    'image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif',
    'text/plain', 'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

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
