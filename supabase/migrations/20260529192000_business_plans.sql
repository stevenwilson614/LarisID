-- Rencana Bisnis: a lightweight one-page business plan per student. The artifact
-- that makes mentor coaching concrete and ties to the business-skill track.
-- Apply in Supabase SQL Editor or: supabase db push

create table if not exists public.business_plans (
  user_id       uuid primary key references auth.users (id) on delete cascade,
  item_id       bigint,        -- chosen product from user_tracked_products (optional)
  shop_id       bigint,
  product_name  text,
  niche         text,
  target_market text,
  unit_goal_90d int,
  price_target  numeric,
  notes         text,
  updated_at    timestamptz not null default now()
);

alter table public.business_plans enable row level security;

-- Owner: full access to their own plan.
drop policy if exists business_plans_owner on public.business_plans;
create policy business_plans_owner on public.business_plans
  for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- A cohort's mentor may read the plans of students in their cohort.
drop policy if exists business_plans_mentor_select on public.business_plans;
create policy business_plans_mentor_select on public.business_plans
  for select using (
    exists (
      select 1
      from public.cohort_members m
      join public.cohorts c on c.id = m.cohort_id
      where m.user_id = business_plans.user_id
        and c.mentor_user_id = auth.uid()
    )
  );
