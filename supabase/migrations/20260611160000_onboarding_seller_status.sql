-- seller_status on first-login onboarding prefs (step 3: new vs existing seller)

alter table public.user_onboarding_prefs
  add column if not exists seller_status text
  check (seller_status is null or seller_status in ('first_time', 'existing'));
