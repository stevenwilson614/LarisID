-- Extend user_profiles for public identity and contact channels.
-- Also prepare storage bucket + policies for profile headshots.

alter table public.user_profiles
  add column if not exists display_name      text,
  add column if not exists bio              text,
  add column if not exists headshot_url     text,
  add column if not exists public_email     text,
  add column if not exists public_whatsapp  text,
  add column if not exists public_shopee_url text,
  add column if not exists is_public        boolean not null default true;

-- Keep existing owner-only write policy, but allow public read of public profiles
-- via a dedicated read policy that still respects is_public.

drop policy if exists user_profiles_public_read on public.user_profiles;
create policy user_profiles_public_read on public.user_profiles
  for select
  using (
    is_public is true
  );

-- Storage bucket for profile headshots. This assumes the Storage extension is enabled.

insert into storage.buckets (id, name, public)
values ('profile-headshots', 'profile-headshots', true)
on conflict (id) do nothing;

-- Allow anyone to read objects from the public headshot bucket.

drop policy if exists "Public read profile headshots" on storage.objects;
create policy "Public read profile headshots" on storage.objects
  for select
  using (bucket_id = 'profile-headshots');

-- Allow authenticated users to manage their own headshot files under headshots/<user_id>/...
-- We scope by checking the first path segment in the object name.

drop policy if exists "Users manage own profile headshots" on storage.objects;
create policy "Users manage own profile headshots" on storage.objects
  for all
  to authenticated
  using (
    bucket_id = 'profile-headshots'
    and (split_part(name, '/', 2))::uuid = auth.uid()
  )
  with check (
    bucket_id = 'profile-headshots'
    and (split_part(name, '/', 2))::uuid = auth.uid()
  );

