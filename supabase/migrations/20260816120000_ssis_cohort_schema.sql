-- SSIS (Student Success Intelligence System) — core capture schema for the
-- Sep 2026 Bau-Bau cohort. Plan: ~/.claude/plans/you-are-helping-design-playful-clover.md
--
-- Design notes that are load-bearing:
--   * cohort_events is the append-only spine. Everything else is a projection.
--   * Raw payloads are split two-tier (C4): successful parses are redacted
--     IMMEDIATELY; only FAILED parses retain full MIME, for 7 days, for parser
--     repair. Students consented — their customers did not. UU PDP 27/2022.
--   * `orders` is deliberately NOT in this migration. It is gated on the
--     test-order finding (is buyer district visible per platform?), which
--     decides whether out_of_region is a real passive outcome or a
--     screenshot-derived confidence-0.4 one. Ships in a follow-up.
--
-- New SQL: bash scripts/apply-selfhost.sh (docs/self-host.md). Do not supabase db push.

-- ── Controlled event vocabulary ─────────────────────────────────────────────
-- A lookup table rather than an enum: extendable without DDL, self-documenting,
-- and still a hard FK so a typo cannot silently create a new verb. Free-text
-- event_type is how event streams rot.

create table if not exists public.cohort_event_type (
  event_type  text primary key,
  category    text not null,
  description text not null,
  added_at    timestamptz not null default now()
);

insert into public.cohort_event_type (event_type, category, description) values
  ('consent_granted',          'admin',   'Student replied SETUJU to the consent message'),
  ('intake_completed',         'admin',   'Day-0 baseline intake finished'),
  ('shop_linked',              'admin',   'A platform shop URL was registered for this student'),

  ('laris_search',             'laris',   'Keyword search inside LarisID'),
  ('laris_deepdive',           'laris',   'Deep dive opened on a product'),
  ('laris_session',            'laris',   'Derived session boundary from activity_events'),

  ('listing_created',          'listing', 'Listing observed for the first time by the crawler'),
  ('listing_price_changed',    'listing', 'Price differs from previous snapshot'),
  ('listing_title_changed',    'listing', 'Title differs from previous snapshot'),
  ('listing_photos_changed',   'listing', 'Photo count differs from previous snapshot'),
  ('listing_stock_changed',    'listing', 'Stock differs from previous snapshot'),
  ('listing_out_of_stock',     'listing', 'Stock reached zero while listing still live'),
  ('listing_restocked',        'listing', 'Stock returned above zero'),
  ('listing_sold_increased',   'listing', 'Sold counter rose (revenue proxy)'),
  ('listing_delisted',         'listing', 'Listing disappeared from the shop catalog = kill decision'),

  ('order_placed',             'order',   'Order notification parsed from platform email'),
  ('order_cancelled',          'order',   'Cancellation notification'),
  ('order_returned',           'order',   'Return notification'),
  ('review_received',          'order',   'Buyer review notification'),
  ('payout_received',          'order',   'Settlement or payout notification'),
  ('ad_charge',                'order',   'Advertising billing notification'),

  ('content_published',        'content', 'New social post detected'),
  ('content_snapshot',         'content', 'Engagement metrics captured for a post'),

  ('mentor_interaction',       'mentor',  'Mentor spoke with the student'),
  ('mentor_recommendation',    'mentor',  'Structured advice logged with a deadline'),
  ('recommendation_complied',  'mentor',  'Advice verified as acted on, from listing_snapshot'),

  ('checkin_submitted',        'student', 'Weekly WhatsApp check-in reply received'),
  ('screenshot_submitted',     'student', 'Seller Centre screenshot received'),

  ('sensor_gap',               'ops',     'A sensor produced no data when data was expected')
on conflict (event_type) do nothing;

-- ── Raw ingest, tier 1: successful parses, already redacted ────────────────

create table if not exists public.cohort_raw_ok (
  id               uuid primary key default gen_random_uuid(),
  source           text not null,          -- email | shop_crawl | social_crawl | whatsapp | laris
  student_id       uuid references auth.users (id) on delete cascade,
  received_at      timestamptz not null default now(),
  payload_redacted jsonb not null,
  parser_version   text not null
);

create index if not exists idx_raw_ok_student_time
  on public.cohort_raw_ok (student_id, received_at desc);
create index if not exists idx_raw_ok_source_time
  on public.cohort_raw_ok (source, received_at desc);

comment on column public.cohort_raw_ok.payload_redacted is
  'Buyer name/phone hashed, street address dropped, district retained. Never store raw PII here — the weekly redaction audit asserts this.';

-- ── Raw ingest, tier 2: failed parses only, full MIME, 7-day TTL ───────────
-- The failure corpus is what parser repair actually needs. The success corpus
-- adds nothing but liability, so it never lands here.

create table if not exists public.cohort_raw_failed (
  id           uuid primary key default gen_random_uuid(),
  source       text not null,
  student_id   uuid references auth.users (id) on delete cascade,
  received_at  timestamptz not null default now(),
  payload_full bytea not null,
  parse_error  text,
  expires_at   timestamptz not null default (now() + interval '7 days')
);

create index if not exists idx_raw_failed_expiry on public.cohort_raw_failed (expires_at);

-- ── The spine ──────────────────────────────────────────────────────────────

create table if not exists public.cohort_events (
  id          uuid primary key default gen_random_uuid(),
  student_id  uuid not null references auth.users (id) on delete cascade,
  ts          timestamptz not null,
  ingested_at timestamptz not null default now(),
  source      text not null,
  platform    text,                        -- shopee | tiktok_shop | tokopedia | tiktok | instagram | laris | null
  event_type  text not null references public.cohort_event_type (event_type),
  listing_id  uuid,                        -- FK added after listing table below
  content_id  uuid,
  value_idr   bigint,                      -- integer rupiah; never float
  quantity    integer,
  confidence  numeric(2,1) not null default 1.0
                check (confidence in (1.0, 0.7, 0.4)),
  raw_id      uuid references public.cohort_raw_ok (id) on delete set null,
  metadata    jsonb not null default '{}'::jsonb
);

comment on column public.cohort_events.confidence is
  '1.0 sensor-observed, 0.7 derived, 0.4 self-reported. Never mix in a single reported figure.';

create index if not exists idx_cohort_events_student_time
  on public.cohort_events (student_id, ts desc);
create index if not exists idx_cohort_events_type_time
  on public.cohort_events (event_type, ts desc);
create index if not exists idx_cohort_events_listing
  on public.cohort_events (listing_id, ts desc) where listing_id is not null;

-- ── Observed listings (the primitive the crawler actually sees) ─────────────
-- product_attempt is deliberately NOT a table. An attempt is an inference, not
-- an observation — beginners drift between ideas without ever "deciding". The
-- grouping is set later, human-confirmed via the weekly check-in.

create table if not exists public.listing (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references auth.users (id) on delete cascade,
  platform         text not null,
  platform_item_id text not null,
  title            text,
  first_seen       timestamptz not null default now(),
  last_seen        timestamptz not null default now(),
  delisted_at      timestamptz,
  attempt_group_id uuid,                   -- derived grouping, confirmed in check-in
  created_at       timestamptz not null default now(),
  unique (student_id, platform, platform_item_id)
);

create index if not exists idx_listing_student on public.listing (student_id, first_seen desc);
create index if not exists idx_listing_attempt on public.listing (attempt_group_id)
  where attempt_group_id is not null;
create index if not exists idx_listing_live on public.listing (student_id)
  where delisted_at is null;

alter table public.cohort_events
  drop constraint if exists cohort_events_listing_id_fkey;
alter table public.cohort_events
  add constraint cohort_events_listing_id_fkey
  foreign key (listing_id) references public.listing (id) on delete set null;

create table if not exists public.listing_snapshot (
  listing_id uuid not null references public.listing (id) on delete cascade,
  day        date not null,
  captured_at timestamptz not null default now(),
  price_idr  bigint,
  stock      integer,
  sold       integer,
  rating     numeric(2,1),
  reviews    integer,
  photos     integer,
  position   integer,
  primary key (listing_id, day)
);

-- ── Operational: is each sensor actually producing data for each student? ───
-- A silently broken sensor is a week of unrecoverable data. This table backs
-- the daily coverage email.

create table if not exists public.sensor_health (
  student_id  uuid not null references auth.users (id) on delete cascade,
  sensor      text not null,               -- shop_crawl | email | social_crawl | laris | checkin
  day         date not null,
  events_seen integer not null default 0,
  expected    integer not null default 0,
  status      text not null default 'ok' check (status in ('ok', 'degraded', 'dark')),
  primary key (student_id, sensor, day)
);

create index if not exists idx_sensor_health_day_status
  on public.sensor_health (day desc, status) where status <> 'ok';

-- ── Mentor interventions: the causal backbone ──────────────────────────────
-- Compliance is measured from listing_snapshot, never asked. The gap between
-- stated and observed compliance is itself one of the study's variables.

create table if not exists public.intervention (
  id                uuid primary key default gen_random_uuid(),
  student_id        uuid not null references auth.users (id) on delete cascade,
  mentor_user_id    uuid not null references auth.users (id) on delete cascade,
  ts                timestamptz not null default now(),
  advice_type       text not null,
  advice_text       text,
  target_listing_id uuid references public.listing (id) on delete set null,
  due_at            timestamptz,
  complied          boolean,
  complied_ts       timestamptz,
  created_at        timestamptz not null default now()
);

create index if not exists idx_intervention_student on public.intervention (student_id, ts desc);
create index if not exists idx_intervention_due on public.intervention (due_at)
  where complied is null and due_at is not null;

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Trap on this box: RLS is auto-enabled on new tables AND default privileges
-- re-grant anon. Both are handled explicitly below. auth.uid() is wrapped in a
-- SELECT so it is evaluated once per query rather than once per row.

create or replace function public.ssis_can_view_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    public.is_platform_admin()
    or p_student_id = (select auth.uid())
    or exists (
      select 1
      from public.cohort_members m
      join public.cohorts c on c.id = m.cohort_id
      where m.user_id = p_student_id
        and m.status  = 'active'
        and (
          c.mentor_user_id = (select auth.uid())
          or exists (
            select 1 from public.cohort_members mm
            where mm.cohort_id = c.id
              and mm.user_id   = (select auth.uid())
              and mm.role      = 'mentor'
              and mm.status    = 'active'
          )
        )
    );
$$;

revoke execute on function public.ssis_can_view_student(uuid) from public, anon;

alter table public.cohort_event_type  enable row level security;
alter table public.cohort_raw_ok      enable row level security;
alter table public.cohort_raw_failed  enable row level security;
alter table public.cohort_events      enable row level security;
alter table public.listing            enable row level security;
alter table public.listing_snapshot   enable row level security;
alter table public.sensor_health      enable row level security;
alter table public.intervention       enable row level security;

-- Vocabulary is public reference data to signed-in users; nobody writes it but service_role.
drop policy if exists cet_select on public.cohort_event_type;
create policy cet_select on public.cohort_event_type
  for select to authenticated using (true);

-- Raw payloads: admin only. Not students, not mentors. These contain other
-- people's data even after redaction, and nothing in the product needs them.
drop policy if exists raw_ok_select on public.cohort_raw_ok;
create policy raw_ok_select on public.cohort_raw_ok
  for select using (public.is_platform_admin());

drop policy if exists raw_failed_select on public.cohort_raw_failed;
create policy raw_failed_select on public.cohort_raw_failed
  for select using (public.is_platform_admin());

drop policy if exists cohort_events_select on public.cohort_events;
create policy cohort_events_select on public.cohort_events
  for select using (public.ssis_can_view_student(student_id));

drop policy if exists listing_select on public.listing;
create policy listing_select on public.listing
  for select using (public.ssis_can_view_student(student_id));

drop policy if exists listing_snapshot_select on public.listing_snapshot;
create policy listing_snapshot_select on public.listing_snapshot
  for select using (
    exists (
      select 1 from public.listing l
      where l.id = listing_snapshot.listing_id
        and public.ssis_can_view_student(l.student_id)
    )
  );

drop policy if exists sensor_health_select on public.sensor_health;
create policy sensor_health_select on public.sensor_health
  for select using (public.ssis_can_view_student(student_id));

-- Interventions are mentor + admin only, matching the cohort_student_notes
-- precedent. The student already heard the advice; this record exists to
-- measure whether it worked, not to grade them.
drop policy if exists intervention_select on public.intervention;
create policy intervention_select on public.intervention
  for select using (
    public.is_platform_admin() or mentor_user_id = (select auth.uid())
  );

drop policy if exists intervention_insert on public.intervention;
create policy intervention_insert on public.intervention
  for insert with check (mentor_user_id = (select auth.uid()));

drop policy if exists intervention_update on public.intervention;
create policy intervention_update on public.intervention
  for update using (
    public.is_platform_admin() or mentor_user_id = (select auth.uid())
  );

-- All writes come from service-role collectors. anon must see nothing: default
-- privileges on this box re-grant anon, so revoke explicitly after each DDL.
revoke all on public.cohort_raw_ok, public.cohort_raw_failed, public.cohort_events,
                public.listing, public.listing_snapshot, public.sensor_health,
                public.intervention, public.cohort_event_type
  from anon;

grant select on public.cohort_event_type to authenticated;
grant select on public.cohort_events, public.listing, public.listing_snapshot,
                public.sensor_health to authenticated;
grant select, insert, update on public.intervention to authenticated;

-- ── 7-day purge of the failed-parse corpus ─────────────────────────────────

create or replace function public.ssis_purge_expired_raw()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  delete from public.cohort_raw_failed where expires_at < now();
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.ssis_purge_expired_raw() from public, anon, authenticated;

select cron.schedule(
  'ssis-purge-expired-raw',
  '17 3 * * *',                            -- 10:17 WIB daily
  $$select public.ssis_purge_expired_raw();$$
)
where not exists (select 1 from cron.job where jobname = 'ssis-purge-expired-raw');

-- PostgREST caches the schema; without this the new tables 404 from the API.
notify pgrst, 'reload schema';
