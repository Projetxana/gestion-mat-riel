-- 1. Create bucket (ignore if already exists)
insert into storage.buckets (id, name, public)
values ('delivery-notes', 'delivery-notes', true)
on conflict (id) do nothing;

-- 2. Allow PUBLIC uploads (Essential because we use custom login, not Supabase Auth)
drop policy if exists "Allow public uploads" on storage.objects;
create policy "Allow public uploads"
on storage.objects for insert
to public
with check ( bucket_id = 'delivery-notes' );

-- 3. Allow public viewing (so the link works in the email)
drop policy if exists "Allow public viewing" on storage.objects;
create policy "Allow public viewing"
on storage.objects for select
to public
using ( bucket_id = 'delivery-notes' );
