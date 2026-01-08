-- Enable storage extension if not already enabled (usually enabled by default)
-- Create a new public bucket called 'delivery-notes'
insert into storage.buckets (id, name, public)
values ('delivery-notes', 'delivery-notes', true);

-- Policy to allow anyone (authenticated) to upload files
create policy "Allow authenticated uploads"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'delivery-notes' );

-- Policy to allow anyone to view files (since it's a public link for email)
create policy "Allow public viewing"
on storage.objects for select
to public
using ( bucket_id = 'delivery-notes' );
