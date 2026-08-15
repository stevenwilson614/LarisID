-- Persist the profit-calculator inputs/outputs against a tracked product so
-- students and mentors can revisit unit economics over time (the "lasts and
-- grows" feedback loop). Stored as jsonb on the existing tracked-product row.
-- Already applied. New SQL: bash scripts/apply-selfhost.sh (docs/self-host.md). Do not supabase db push.

alter table public.user_tracked_products
  add column if not exists calc_scenario jsonb;

alter table public.user_tracked_products
  add column if not exists calc_updated_at timestamptz;
