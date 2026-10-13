-- My Toko onboarding: keep the pasted shop URL and the private scrape
-- snapshot on the seller's store profile. Products they tick still go to
-- user_tracked_products. Does not touch student_account or the cohort LMS.

alter table public.user_store_profiles
  add column if not exists source_url text,
  add column if not exists snap_id uuid;

comment on column public.user_store_profiles.source_url is
  'Shopee shop URL pasted in My Toko onboarding.';
comment on column public.user_store_profiles.snap_id is
  'ext_shop_claim_snapshots id for that paste. Not a foreign key: the snap can expire.';

notify pgrst, 'reload schema';
