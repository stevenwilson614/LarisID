-- user_profiles: profile info collected during post-login onboarding.
-- One row per user; required before they can access the dashboard.

create table if not exists public.user_profiles (
  user_id           uuid primary key references auth.users (id) on delete cascade,
  first_name        text not null default '',
  last_name         text not null default '',
  wa_number         text,            -- collected from email/Google users
  contact_email     text,            -- collected from WhatsApp OTP users
  seller_status     text check (seller_status in ('first_time', 'existing')),
  shopee_store_name text,
  shopee_store_url  text,
  completed_at      timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists idx_user_profiles_user_id
  on public.user_profiles (user_id);

alter table public.user_profiles enable row level security;

drop policy if exists user_profiles_own on public.user_profiles;
create policy user_profiles_own on public.user_profiles
  for all to authenticated
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);
