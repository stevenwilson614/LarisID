-- Anton creator-mentor school schema (DRAFT).
--
-- DO NOT APPLY on Contabo. Do not run:
--   bash scripts/apply-selfhost.sh school/sql/20260915120000_anton_school_schema.sql
-- Production Kohort Pertama / Hendra / Afryian stay untouched until an explicit
-- go/no-go lifts the offline lock. This file is the contract the localhost
-- prototype in /school/ is written against.
--
-- Adds:
--   schools, school_members (owner | mentor | asisten)
--   cohorts.school_id + cohorts.school_kind
--   milestone_content.content_type + 'tool' (+ iframe_src / tool_origin)
--   cohort_member_billing
--   cohort_threads + cohort_thread_replies (per-lesson Tanya)
--
-- Does not: payments processing, TikTok sends, Kalodata scrape, DMs.

begin;

-- ── schools ──────────────────────────────────────────────────────────────────

create table if not exists public.schools (
  id              uuid primary key default gen_random_uuid(),
  owner_user_id   uuid not null references auth.users (id) on delete restrict,
  name            text not null check (char_length(trim(name)) > 0),
  slug            text not null unique,
  kind            text not null default 'creator'
                    check (kind in ('creator', 'rise')),
  slogan          text,
  theme_primary   text,
  wa_group_url    text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists idx_schools_owner on public.schools (owner_user_id);

comment on table public.schools is
  'One mentor business. Anton owns a creator school; Kohort Pertama would seed as kind=rise.';

create table if not exists public.school_members (
  school_id   uuid not null references public.schools (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  role        text not null check (role in ('owner', 'mentor', 'asisten')),
  status      text not null default 'active' check (status in ('active', 'paused', 'left')),
  created_at  timestamptz not null default now(),
  primary key (school_id, user_id)
);

create index if not exists idx_school_members_user on public.school_members (user_id);

-- ── helper functions (security definer, avoid RLS recursion) ─────────────────

create or replace function public.is_school_owner(p_school uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
    or exists (
      select 1 from public.schools s
      where s.id = p_school and s.owner_user_id = auth.uid()
    )
    or exists (
      select 1 from public.school_members m
      where m.school_id = p_school
        and m.user_id = auth.uid()
        and m.role = 'owner'
        and m.status = 'active'
    );
$$;

create or replace function public.school_staff_role(p_school uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when public.is_school_owner(p_school) then 'owner'
    else (
      select m.role
      from public.school_members m
      where m.school_id = p_school
        and m.user_id = auth.uid()
        and m.status = 'active'
      limit 1
    )
  end;
$$;

create or replace function public.is_school_staff(p_school uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.school_staff_role(p_school) is not null;
$$;

create or replace function public.can_see_school_billing(p_school uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  -- Asisten may not see ledgers. Mentors see only assigned cohorts (enforced
  -- at cohort grain below); owners see the whole school.
  select public.school_staff_role(p_school) in ('owner', 'mentor');
$$;

revoke all on function public.is_school_owner(uuid) from public;
revoke all on function public.school_staff_role(uuid) from public;
revoke all on function public.is_school_staff(uuid) from public;
revoke all on function public.can_see_school_billing(uuid) from public;
grant execute on function public.is_school_owner(uuid) to authenticated;
grant execute on function public.school_staff_role(uuid) to authenticated;
grant execute on function public.is_school_staff(uuid) to authenticated;
grant execute on function public.can_see_school_billing(uuid) to authenticated;

-- ── cohorts: attach to a school without breaking existing rows ───────────────

alter table public.cohorts
  add column if not exists school_id uuid references public.schools (id) on delete set null;

alter table public.cohorts
  add column if not exists school_kind text
    check (school_kind is null or school_kind in ('creator', 'rise'));

create index if not exists idx_cohorts_school on public.cohorts (school_id);

comment on column public.cohorts.school_kind is
  'creator = hide Rise chrome (Toko Saya, applicants, scrape boards). rise = Kohort Pertama.';

-- Owner of the school can manage every cohort in it. Mentors still use
-- can_manage_cohort (mentor_user_id or cohort_members.role = mentor).
create or replace function public.can_manage_cohort(p_cohort uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin()
    or exists (
      select 1 from public.cohorts c
      where c.id = p_cohort and c.mentor_user_id = auth.uid()
    )
    or exists (
      select 1 from public.cohort_members m
      where m.cohort_id = p_cohort
        and m.user_id = auth.uid()
        and m.role = 'mentor'
        and m.status = 'active'
    )
    or exists (
      select 1
      from public.cohorts c
      join public.school_members sm on sm.school_id = c.school_id
      where c.id = p_cohort
        and sm.user_id = auth.uid()
        and sm.status = 'active'
        and sm.role in ('owner', 'mentor')
    );
$$;

-- Asisten: threads + attendance only (not kurikulum write, not billing).
create or replace function public.can_moderate_cohort(p_cohort uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.can_manage_cohort(p_cohort)
    or exists (
      select 1
      from public.cohorts c
      join public.school_members sm on sm.school_id = c.school_id
      where c.id = p_cohort
        and sm.user_id = auth.uid()
        and sm.status = 'active'
        and sm.role = 'asisten'
    );
$$;

revoke all on function public.can_manage_cohort(uuid) from public;
revoke all on function public.can_moderate_cohort(uuid) from public;
grant execute on function public.can_manage_cohort(uuid) to authenticated;
grant execute on function public.can_moderate_cohort(uuid) to authenticated;

-- ── tool content type ────────────────────────────────────────────────────────

alter table public.milestone_content
  drop constraint if exists milestone_content_content_type_check;

alter table public.milestone_content
  add constraint milestone_content_content_type_check
  check (content_type in ('video', 'document', 'text', 'tool'));

alter table public.milestone_content
  add column if not exists iframe_src text;

alter table public.milestone_content
  add column if not exists tool_origin text;

comment on column public.milestone_content.iframe_src is
  'Allowlisted URL for content_type=tool. Render in iframe sandbox. Never eval.';
comment on column public.milestone_content.tool_origin is
  'Origin allowlist entry, e.g. https://tools.anton.example';

-- ── billing ledger (mentor is merchant; LarisID never holds money) ───────────

create table if not exists public.cohort_member_billing (
  id           uuid primary key default gen_random_uuid(),
  cohort_id    uuid not null references public.cohorts (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  plan_name    text,
  amount_idr   integer,
  status       text not null default 'belum'
                 check (status in ('lunas', 'cicilan', 'belum', 'gratis')),
  source       text not null default 'manual'
                 check (source in ('mayar', 'lynk', 'manual')),
  paid_at      timestamptz,
  note         text,
  external_id  text,
  updated_by   uuid references auth.users (id),
  updated_at   timestamptz not null default now(),
  unique (cohort_id, user_id)
);

create index if not exists idx_cmb_cohort_status
  on public.cohort_member_billing (cohort_id, status);

comment on table public.cohort_member_billing is
  'Per-student ledger. v1 mentor marks by hand. v2 Mayar payment.received webhook. gratis = beasiswa.';
comment on column public.cohort_member_billing.external_id is
  'Mayar transaction id or lynk order id. Used for webhook idempotency.';

-- ── per-lesson Tanya (not DMs; WhatsApp stays real-time) ─────────────────────

create table if not exists public.cohort_threads (
  id            uuid primary key default gen_random_uuid(),
  cohort_id     uuid not null references public.cohorts (id) on delete cascade,
  content_id    uuid references public.milestone_content (id) on delete cascade,
  author_id     uuid not null references auth.users (id) on delete cascade,
  title         text not null check (char_length(trim(title)) between 1 and 140),
  body          text not null check (char_length(trim(body)) between 1 and 4000),
  answered      boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists idx_cohort_threads_unanswered
  on public.cohort_threads (cohort_id, answered, created_at desc);

create index if not exists idx_cohort_threads_content
  on public.cohort_threads (content_id, created_at desc);

create table if not exists public.cohort_thread_replies (
  id          uuid primary key default gen_random_uuid(),
  thread_id   uuid not null references public.cohort_threads (id) on delete cascade,
  author_id   uuid not null references auth.users (id) on delete cascade,
  body        text not null check (char_length(trim(body)) between 1 and 4000),
  is_staff    boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists idx_ctr_thread
  on public.cohort_thread_replies (thread_id, created_at);

-- ── RLS: schools ─────────────────────────────────────────────────────────────

alter table public.schools enable row level security;
alter table public.school_members enable row level security;
alter table public.cohort_member_billing enable row level security;
alter table public.cohort_threads enable row level security;
alter table public.cohort_thread_replies enable row level security;

drop policy if exists schools_select on public.schools;
create policy schools_select on public.schools
  for select using (
    public.is_school_staff(id)
    or exists (
      select 1
      from public.cohorts c
      join public.cohort_members m on m.cohort_id = c.id
      where c.school_id = schools.id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );

drop policy if exists schools_update_owner on public.schools;
create policy schools_update_owner on public.schools
  for update using (public.is_school_owner(id));

drop policy if exists school_members_select on public.school_members;
create policy school_members_select on public.school_members
  for select using (public.is_school_staff(school_id) or user_id = auth.uid());

drop policy if exists school_members_write_owner on public.school_members;
create policy school_members_write_owner on public.school_members
  for all using (public.is_school_owner(school_id))
  with check (public.is_school_owner(school_id));

-- Billing: owners see school-wide; mentors see only cohorts they manage;
-- students see their own row; asisten see nothing.
drop policy if exists cmb_select on public.cohort_member_billing;
create policy cmb_select on public.cohort_member_billing
  for select using (
    user_id = auth.uid()
    or (
      public.can_manage_cohort(cohort_id)
      and exists (
        select 1 from public.cohorts c
        where c.id = cohort_member_billing.cohort_id
          and public.can_see_school_billing(c.school_id)
      )
    )
  );

drop policy if exists cmb_write on public.cohort_member_billing;
create policy cmb_write on public.cohort_member_billing
  for all using (
    public.can_manage_cohort(cohort_id)
    and exists (
      select 1 from public.cohorts c
      where c.id = cohort_member_billing.cohort_id
        and public.school_staff_role(c.school_id) in ('owner', 'mentor')
    )
  )
  with check (
    public.can_manage_cohort(cohort_id)
    and exists (
      select 1 from public.cohorts c
      where c.id = cohort_member_billing.cohort_id
        and public.school_staff_role(c.school_id) in ('owner', 'mentor')
    )
  );

drop policy if exists ct_select on public.cohort_threads;
create policy ct_select on public.cohort_threads
  for select using (
    public.can_moderate_cohort(cohort_id)
    or exists (
      select 1 from public.cohort_members m
      where m.cohort_id = cohort_threads.cohort_id
        and m.user_id = auth.uid()
        and m.status = 'active'
    )
  );

drop policy if exists ct_insert on public.cohort_threads;
create policy ct_insert on public.cohort_threads
  for insert with check (
    author_id = auth.uid()
    and (
      public.can_moderate_cohort(cohort_id)
      or exists (
        select 1 from public.cohort_members m
        where m.cohort_id = cohort_threads.cohort_id
          and m.user_id = auth.uid()
          and m.status = 'active'
      )
    )
  );

drop policy if exists ct_update_staff on public.cohort_threads;
create policy ct_update_staff on public.cohort_threads
  for update using (public.can_moderate_cohort(cohort_id));

drop policy if exists ctr_select on public.cohort_thread_replies;
create policy ctr_select on public.cohort_thread_replies
  for select using (
    exists (
      select 1 from public.cohort_threads t
      where t.id = thread_id
        and (
          public.can_moderate_cohort(t.cohort_id)
          or exists (
            select 1 from public.cohort_members m
            where m.cohort_id = t.cohort_id
              and m.user_id = auth.uid()
              and m.status = 'active'
          )
        )
    )
  );

drop policy if exists ctr_insert on public.cohort_thread_replies;
create policy ctr_insert on public.cohort_thread_replies
  for insert with check (
    author_id = auth.uid()
    and exists (
      select 1 from public.cohort_threads t
      where t.id = thread_id
        and (
          public.can_moderate_cohort(t.cohort_id)
          or exists (
            select 1 from public.cohort_members m
            where m.cohort_id = t.cohort_id
              and m.user_id = auth.uid()
              and m.status = 'active'
          )
        )
    )
  );

grant select, insert, update, delete on public.schools to authenticated;
grant select, insert, update, delete on public.school_members to authenticated;
grant select, insert, update, delete on public.cohort_member_billing to authenticated;
grant select, insert, update, delete on public.cohort_threads to authenticated;
grant select, insert, update, delete on public.cohort_thread_replies to authenticated;

-- Optional later (commented): wrap Kohort Pertama as a Rise school so pick
-- logic becomes school-scoped without changing student UX.
--
-- insert into public.schools (owner_user_id, name, slug, kind)
-- select mentor_user_id, 'Kohort Pertama', 'kohort-pertama-school', 'rise'
-- from public.cohorts where slug = 'kohort-pertama' limit 1;
-- update public.cohorts set school_id = ..., school_kind = 'rise'
-- where slug = 'kohort-pertama';

commit;
