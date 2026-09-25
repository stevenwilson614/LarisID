-- Anton school funnel + CRM (DRAFT).
--
-- DO NOT APPLY on Contabo. Do not run:
--   bash scripts/apply-selfhost.sh school/sql/20260918120000_anton_funnel_crm.sql
--
-- Companion to 20260915120000_anton_school_schema.sql.
-- Prototype in /school/ stores this in localStorage (anton-school-v3).
--
-- Adds: applications, offers/subscriptions, CRM pipeline, tasks, action plans,
-- WA queue, remittances (20% one-level licensing), exam attempts.
-- Does not: charge cards, process Mayar webhooks, or apply on Contabo.
-- WhatsApp live send is Fonnte + Pages Functions, not this file.

begin;

create table if not exists public.school_applications (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools (id) on delete cascade,
  user_id      uuid references auth.users (id) on delete set null,
  name         text not null,
  wa           text not null,
  experience   text not null,
  why          text not null,
  created_at   timestamptz not null default now()
);

create index if not exists idx_school_applications_school
  on public.school_applications (school_id, created_at desc);

comment on table public.school_applications is
  'Form before pay: who, experience, why. 24h offer clock starts here.';

create table if not exists public.school_subscriptions (
  id                 uuid primary key default gen_random_uuid(),
  school_id          uuid not null references public.schools (id) on delete cascade,
  user_id            uuid not null references auth.users (id) on delete cascade,
  status             text not null default 'trial'
                       check (status in ('trial', 'lunas', 'cicilan', 'belum', 'gratis', 'grace')),
  term               text check (term in ('month', 'year', 'autopay')),
  amount_idr         integer,
  source             text not null default 'transfer'
                       check (source in ('transfer', 'mayar', 'lynk', 'manual')),
  offer_started_at   timestamptz,
  offer_expires_at   timestamptz,
  paid_at            timestamptz,
  access_until       timestamptz,
  note               text,
  unique (school_id, user_id)
);

comment on table public.school_subscriptions is
  'Mentoring term. Trial = first lecture only. access_until + school dunning = grace.';

create table if not exists public.school_pipeline_stages (
  id         text not null,
  school_id  uuid not null references public.schools (id) on delete cascade,
  label      text not null,
  sort       integer not null default 0,
  primary key (school_id, id)
);

create table if not exists public.school_contacts (
  school_id    uuid not null references public.schools (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  stage        text not null default 'wa_baru',
  mentor_id    uuid references auth.users (id),
  kind         text not null default 'student' check (kind in ('student', 'mentor')),
  eligible_mentor boolean not null default false,
  accepted_override boolean not null default false,
  exam_score   integer,
  exam_at      timestamptz,
  cert_serial  text,
  flags        jsonb not null default '{}'::jsonb,
  primary key (school_id, user_id)
);

comment on column public.school_contacts.mentor_id is
  'Upline coach. Anton for direct students; certified mentor for their students. One level only.';
comment on column public.school_contacts.accepted_override is
  'Mentor accepted disclosed 20% licensing fee. Do not auto-enrol.';

create table if not exists public.school_timeline (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  kind        text not null,
  body        text not null,
  at          timestamptz not null default now()
);

create index if not exists idx_school_timeline_user
  on public.school_timeline (school_id, user_id, at desc);

create table if not exists public.school_tasks (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete cascade,
  person_id   uuid not null references auth.users (id) on delete cascade,
  assignee    uuid references auth.users (id),
  title       text not null,
  body        text,
  due_at      timestamptz,
  done        boolean not null default false,
  kind        text not null default 'wa',
  created_at  timestamptz not null default now()
);

create table if not exists public.school_action_plans (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete cascade,
  slug        text not null,
  name        text not null,
  unique (school_id, slug)
);

create table if not exists public.school_action_plan_steps (
  id          uuid primary key default gen_random_uuid(),
  plan_id     uuid not null references public.school_action_plans (id) on delete cascade,
  wait_hours  integer not null default 0,
  kind        text not null check (kind in ('wa', 'task', 'stage')),
  title       text not null,
  body        text,
  stage_to    text,
  sort        integer not null default 0
);

create table if not exists public.school_dunning (
  school_id      uuid primary key references public.schools (id) on delete cascade,
  warning_days   integer not null default 5,
  grace_days     integer not null default 1
);

create table if not exists public.school_wa_queue (
  id             uuid primary key default gen_random_uuid(),
  school_id      uuid not null references public.schools (id) on delete cascade,
  to_user_id     uuid not null references auth.users (id) on delete cascade,
  title          text not null,
  body           text not null,
  scheduled_at   timestamptz not null,
  status         text not null default 'queued'
                   check (status in ('queued', 'sent', 'cancelled')),
  created_at     timestamptz not null default now()
);

comment on table public.school_wa_queue is
  'Queued WhatsApp copy. CRM send uses school_wa_messages + Fonnte. Do not call send-cohort-whatsapp.';

create table if not exists public.school_wa_threads (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete cascade,
  person_id   uuid references auth.users (id) on delete set null,
  phone       text not null,
  updated_at  timestamptz not null default now(),
  unread      integer not null default 0,
  unique (school_id, phone)
);

create table if not exists public.school_wa_messages (
  id           uuid primary key default gen_random_uuid(),
  thread_id    uuid not null references public.school_wa_threads (id) on delete cascade,
  direction    text not null check (direction in ('in', 'out')),
  body         text not null,
  at           timestamptz not null default now(),
  status       text not null default 'sent',
  provider_id  text
);

comment on table public.school_wa_messages is
  '1:1 WhatsApp after the Fonnte device is connected. No history import. Draft only — do not apply on Contabo.';

create table if not exists public.school_remittances (
  id           uuid primary key default gen_random_uuid(),
  school_id    uuid not null references public.schools (id) on delete cascade,
  mentor_id    uuid not null references auth.users (id) on delete cascade,
  period       text not null,
  expected_idr integer not null default 0,
  received_idr integer not null default 0,
  note         text,
  unique (school_id, mentor_id, period)
);

comment on table public.school_remittances is
  'One-level 20% licensing from certified mentors. They collect; Anton records setoran.';

create table if not exists public.school_exam_attempts (
  id          uuid primary key default gen_random_uuid(),
  school_id   uuid not null references public.schools (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  score       integer not null,
  passed      boolean not null,
  taken_at    timestamptz not null default now()
);

alter table public.school_products
  add column if not exists included_in_mentoring boolean not null default true;

comment on column public.school_products.included_in_mentoring is
  'false = Laris Affiliate (and similar). Never unlocked by mentoring plan.';

-- RLS sketch: reuse is_school_staff / can_see_school_billing from the parent draft.
-- Students read own application, subscription, tasks about them, own exam.
-- Asisten: pipeline + tasks, not remittances or bank details.

commit;
