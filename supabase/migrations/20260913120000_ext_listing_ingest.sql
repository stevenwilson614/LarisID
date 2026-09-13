-- Chrome extension ingest + read path (extension v3.0, "omset-first").
--
-- WHY. The extension has never written a row. Its POSTs went straight at
-- public.listings and public.item_snapshots with the anon key, and
-- 20260905120000_audit_revoke_anon_writes.sql revoked insert from anon on both
-- by name ("Scraper uses service_role. RLS stays the user-data gate."), so
-- every batch 401'd and item_snapshots still holds 0 rows. Re-granting anon
-- insert would revert a named audit migration, so it does not happen here.
--
-- SHAPE. The house pattern for public intake (20260811130000_uncovered_searches)
-- plus the stricter posture of 20260912120000_item_detail_queue ("requests go
-- through request_item_detail()"): a staging table with NO anon grant, and one
-- validating SECURITY DEFINER RPC that anon may execute.
--
-- There is a second, independent reason not to let the extension write listings
-- directly. mv_listing_momentum (20260906150000) reads listings over 70 days,
-- takes one reading per listing-day and requires snapshots >= 7 days apart. A
-- client row landing on a day between two scraper rows moves at0, shortens the
-- interval, and silently changes every rate for that product. Staging plus a
-- corroboration-gated merge is the only safe path.
--
-- GRANTS ARE SPELLED OUT. This box's pg_default_acl still grants arwdDxtm in
-- public to BOTH anon and authenticated; 20260905120000 revoked the defaults
-- from anon only and never touched select or authenticated. A new table here
-- inherits privileges nobody asked for unless the migration revokes them by
-- name. Hence the explicit `revoke all` on both new tables.
--
-- UNITS. listings.price is RUPIAH (median 56000; an iPhone 15 128GB is
-- 13049000), and nowcast_omset_monthly = price * nowcast_velocity_daily * 30
-- exactly. Shopee's raw payload price is IDR * 100000, so the client divides by
-- 100000 and nothing here rescales.

begin;
set local statement_timeout to '600s';

-- ── 1. Anonymous install identity ───────────────────────────────────────────
-- The rate-limit subject. A random uuid minted in the browser, never tied to
-- an account: the extension needs no login (anon can already select
-- listings_deduped), so there is no user id to hang this off.
create table if not exists public.ext_installs (
  install_id    uuid        primary key,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  day           date        not null default public._usage_day(),
  rows_today    integer     not null default 0,
  pages_today   integer     not null default 0,
  rows_total    bigint      not null default 0,
  batches_total bigint      not null default 0,
  blocked       boolean     not null default false,
  version       text
);

comment on table public.ext_installs is
  'One row per Chrome extension install. Rate-limit subject for '
  'ext_ingest_listings(); deliberately carries no user id.';
comment on column public.ext_installs.blocked is
  'Kill switch for a single abusive install. Checked before every insert.';

alter table public.ext_installs enable row level security;
revoke all on table public.ext_installs from public, anon, authenticated;
grant select on table public.ext_installs to service_role;

-- ── 2. Staging ──────────────────────────────────────────────────────────────
-- Mirrors the listings columns the extension can fill honestly. price/rating
-- are numeric here (listings.price is real and loses digits above ~1e7) and
-- are cast down at merge time to match the target column.
create table if not exists public.ext_listing_ingest (
  id             bigint      generated always as identity primary key,
  install_id     uuid        not null,
  source         text        not null check (source in ('search', 'pdp')),
  item_id        bigint      not null,
  shop_id        bigint      not null,
  keyword        text,
  category       text,
  product_name   text,
  store_name     text,
  location       text,
  price          numeric,
  original_price numeric,
  total_sold     integer,
  -- Verbatim Shopee sold string ("10rb+ terjual"). Per
  -- 20260727180000_listings_search_rank_ad_capture this is what pins a bucket
  -- floor exactly, so it is stored as text and never re-derived.
  sold_text      text        not null default '',
  sold_tier      integer,
  sold_is_exact  boolean     not null default false,
  reviews        integer,
  rating         numeric,
  wishlist       integer,
  stock          integer,
  in_stock       boolean,
  search_rank    integer,
  is_ad          smallint    not null default 0,
  shop_tier      text        not null default '',
  listing_date   timestamptz,
  image_url      text,
  url            text,
  scraped_at     timestamptz not null,
  received_at    timestamptz not null default now(),
  merged_at      timestamptz,
  reject_reason  text
);

comment on table public.ext_listing_ingest is
  'Staging for rows the Chrome extension captured from Shopee pages the user '
  'browsed. Promoted into public.listings by merge_ext_ingest() only where the '
  '(item_id, shop_id) pair is already known. Never read by the frontend.';
comment on column public.ext_listing_ingest.sold_is_exact is
  'true when the payload carried historical_sold_count (search cards, ~80-95% '
  'while logged in). The PDP payload has no exact counter, so pdp rows are '
  'false by nature and carry only the display bucket.';

create index if not exists ext_listing_ingest_unmerged_idx
  on public.ext_listing_ingest (received_at)
  where merged_at is null and reject_reason is null;
create index if not exists ext_listing_ingest_item_idx
  on public.ext_listing_ingest (item_id, shop_id, scraped_at desc);
create index if not exists ext_listing_ingest_install_idx
  on public.ext_listing_ingest (install_id, received_at desc);

alter table public.ext_listing_ingest enable row level security;
revoke all on table public.ext_listing_ingest from public, anon, authenticated;
grant select on table public.ext_listing_ingest to service_role;

-- ── 3. Provenance on listings ───────────────────────────────────────────────
-- O(1) in PG11+: a non-volatile default is a catalog change, not a rewrite of
-- 4.4M rows. Lets calibration and momentum exclude client rows by name if they
-- ever prove noisy, without unpicking a merge.
alter table public.listings
  add column if not exists source text not null default 'scraper';
comment on column public.listings.source is
  'scraper | ext. Which collector produced the row.';

notify pgrst, 'reload schema';
commit;
