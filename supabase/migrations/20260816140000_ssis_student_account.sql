-- SSIS: the Day-0 registry. One row per platform identity per student.
--
-- Implicit in the plan but absent from the schema sketch, and both the email
-- Worker and the shop crawler are blocked without it: the Worker resolves
-- `student07@cohort.larisid.com` -> student_id + real forwarding address, and
-- the crawler reads the shop URL list from here.
--
-- New SQL: bash scripts/apply-selfhost.sh (docs/self-host.md). Do not supabase db push.

create table if not exists public.student_account (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references auth.users (id) on delete cascade,
  cohort_id      uuid references public.cohorts (id) on delete set null,
  kind           text not null check (kind in ('shop', 'social', 'email_alias')),
  platform       text not null,            -- shopee|tokopedia|tiktok_shop|tiktok|instagram|cohort_mail
  handle         text,                     -- @username, shop slug, or alias localpart
  url            text,
  platform_ref   text,                     -- resolved numeric shop_id once known
  forward_to     text,                     -- email_alias only: the student's real inbox
  verified_at    timestamptz,
  active         boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (student_id, platform, kind, handle)
);

create index if not exists idx_student_account_student
  on public.student_account (student_id) where active;
-- The crawler's work queue: every live shop, cheaply.
create index if not exists idx_student_account_crawl
  on public.student_account (platform, kind) where active and kind = 'shop';
-- The Worker's hot path: alias localpart -> student.
create unique index if not exists idx_student_account_alias
  on public.student_account (lower(handle)) where kind = 'email_alias' and active;

alter table public.student_account enable row level security;

drop policy if exists student_account_select on public.student_account;
create policy student_account_select on public.student_account
  for select using (public.ssis_can_view_student(student_id));

revoke all on public.student_account from anon;
grant select on public.student_account to authenticated;

comment on column public.student_account.forward_to is
  'Student real inbox. The Worker forwards every message here regardless of parse outcome — a student must never lose mail because our parser failed.';

notify pgrst, 'reload schema';
