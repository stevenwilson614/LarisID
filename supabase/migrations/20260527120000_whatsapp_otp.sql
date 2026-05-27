create table if not exists public.whatsapp_otps (
  id          bigint generated always as identity primary key,
  phone       text        not null,
  otp_hash    text        not null,
  salt        text        not null,
  expires_at  timestamptz not null,
  used        boolean     not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists whatsapp_otps_phone_idx
  on public.whatsapp_otps (phone, expires_at);

-- Cleans up expired/used rows; called opportunistically on each send request
create or replace function public.cleanup_whatsapp_otps()
returns void language sql security definer set search_path = public as $$
  delete from public.whatsapp_otps
  where expires_at < now() - interval '1 hour' or used = true;
$$;

-- Rate limit check: how many OTP requests for this phone in the last hour
create or replace function public.whatsapp_otp_recent_count(p_phone text)
returns bigint language sql stable security definer set search_path = public as $$
  select count(*) from public.whatsapp_otps
  where phone = p_phone and created_at > now() - interval '1 hour';
$$;

-- Used by verify function to look up a Supabase auth user ID by synthetic email
-- when createUser returns "already registered"
create or replace function public.get_user_id_by_email(p_email text)
returns uuid language sql stable security definer set search_path = auth, public as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$$;
revoke all on function public.get_user_id_by_email(text) from public;

-- RLS enabled with no policies = anon/authenticated users cannot read or write.
-- All access is through service-role edge functions only.
alter table public.whatsapp_otps enable row level security;
