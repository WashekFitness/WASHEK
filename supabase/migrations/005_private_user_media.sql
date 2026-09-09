/*
 * ============================================================
 * PRIVATE USER MEDIA
 * ============================================================
 *
 * Creates/configures the user-media bucket and ensures
 * authenticated users can only access objects inside their
 * own user-id folder.
 */


/*
 * ------------------------------------------------------------
 * BUCKET
 * ------------------------------------------------------------
 *
 * Create the bucket if it does not exist.
 *
 * IMPORTANT:
 * This must happen before the storage policies are created.
 */

insert into storage.buckets (
  id,
  name,
  public
)
values (
  'user-media',
  'user-media',
  false
)
on conflict (id)
do update
set
  name = excluded.name,
  public = false;


/*
 * ------------------------------------------------------------
 * POLICIES
 * ------------------------------------------------------------
 */

drop policy if exists "user_media_select"
on storage.objects;

drop policy if exists "user_media_insert"
on storage.objects;

drop policy if exists "user_media_update"
on storage.objects;

drop policy if exists "user_media_delete"
on storage.objects;


/*
 * SELECT
 *
 * Allows users to read only their own files.
 */

create policy "user_media_select"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'user-media'
  and (storage.foldername(name))[1] =
      auth.uid()::text
);


/*
 * INSERT
 *
 * Allows users to upload only into their own folder.
 */

create policy "user_media_insert"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'user-media'
  and (storage.foldername(name))[1] =
      auth.uid()::text
);


/*
 * UPDATE
 *
 * Allows users to modify only their own files.
 */

create policy "user_media_update"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'user-media'
  and (storage.foldername(name))[1] =
      auth.uid()::text
)
with check (
  bucket_id = 'user-media'
  and (storage.foldername(name))[1] =
      auth.uid()::text
);


/*
 * DELETE
 *
 * Allows users to delete only their own files.
 */

create policy "user_media_delete"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'user-media'
  and (storage.foldername(name))[1] =
      auth.uid()::text
);
