-- Internal WA OTP smoke accounts were counting as real signups in admin KPIs.
-- Keep *@dapur.local exclusion; add the smoke prefixes used in OTP tests.
-- Real @wa.larisid.com sellers stay counted.

create or replace function public.is_dapur_side_account(p_email text)
returns boolean
language sql
immutable
parallel safe
as $$
  select
    coalesce(lower(p_email), '') like '%@dapur.local'
    or coalesce(lower(p_email), '') like 'smoke_wa_otp_test@%'
    or coalesce(lower(p_email), '') like 'smoke_%@wa.larisid.com';
$$;

comment on function public.is_dapur_side_account(text) is
  'True for Dapur kitchen emails (*@dapur.local) and internal WA OTP smoke accounts. Not a Laris signup.';
