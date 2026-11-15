-- Prepared only; apply after schema.sql in a coordinated Supabase migration.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
('documents','documents',false,10485760,array['application/pdf','image/png','image/jpeg']),
('photos','photos',false,10485760,array['image/png','image/jpeg']) on conflict(id) do nothing;
create policy evidence_owner on storage.objects for all to authenticated
using(bucket_id in ('documents','photos') and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.cases c where c.user_id=(select auth.uid()) and c.id::text=(storage.foldername(name))[2]))
with check(bucket_id in ('documents','photos') and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.cases c where c.user_id=(select auth.uid()) and c.id::text=(storage.foldername(name))[2]));
