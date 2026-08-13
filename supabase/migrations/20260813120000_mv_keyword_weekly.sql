-- Weekly sales per PRODUCT TYPE, for the "Terlaris Minggu Ini" card badge.
--
-- WHY NOT mv_trending
-- mv_trending already computes bucket-safe 7d deltas, but it ends with
-- `order by d7 desc limit 500` across ALL categories. Fine for the global
-- Trending panel, useless for a per-category badge: measured 2026-08-13, only
-- 24 of 292 `Olahraga & Outdoor` keywords have any mv_trending row at all, and
-- just 2 of 25 camping keywords. A quiet category would never earn a badge.
-- Same bucket-safe math here, grouped by keyword, uncapped.
--
-- WHY WE NORMALISE INSTEAD OF SUBTRACTING TWO SNAPSHOTS
-- Our scrape cadence is not weekly. Real example (anchor 2026-08-11):
--   kursi lipat camping        -> 2026-08-11, 2026-07-29, 2026-07-24
--   kompor portable camping    -> 2026-08-11, 2026-07-29, 2026-07-24
-- The newest baseline at least 7 days old is 13 days back, not 7. Calling that
-- raw delta "terjual minggu ini" would overstate a week by ~2x, which is the
-- fabricated-delta failure AGENTS.md and MISSION.md forbid. So per listing we
-- record the ACTUAL measured span and convert to a 7-day-equivalent rate:
--
--   wk_units = sum( corrected_delta * 7 / span_days )
--
-- and publish `wk_span_days` so the UI can say what window it really measured.
-- Listings whose usable span falls outside 7..21 days are dropped rather than
-- extrapolated — a 35-day gap (lampu camping LED rechargeable) says nothing
-- trustworthy about this week.
--
-- Keyword-grained, not (keyword, city) — same as how mv_product_types attaches
-- trend_delta_30d. Weekly deltas split by city would be far too sparse.
--
-- A keyword is PRESENT here only when at least one of its listings has a usable
-- snapshot pair. So:
--   row missing    -> no weekly reading, the UI says nothing
--   row present, 0 -> we looked, it genuinely did not move
-- The client depends on that distinction; do not add `having wk_units > 0`.
--
-- No wk_units_prev column: with per-listing variable spans a "previous week"
-- bucket is not well defined, and nothing consumes it. The growth % is computed
-- against the cumulative baseline (wk_base), matching trendGrowthPct() in
-- js/gpt-app.js so both surfaces agree.

set statement_timeout to '900s';

-- product_types_v is recreated at the bottom to expose the wk_* columns.
-- Dropping it first keeps this migration re-runnable once the view references
-- mv_keyword_weekly; grants are reapplied below.
drop view if exists public.product_types_v;
drop materialized view if exists public.mv_keyword_weekly;

create materialized view public.mv_keyword_weekly as
with anchor as (
  select max(scraped_at) as t0 from public.listings
),
snap as (
  select l.item_id, l.shop_id,
         -- newest observation for this listing
         (array_agg(l.total_sold order by l.scraped_at desc))[1] as s1,
         (array_agg(l.reviews    order by l.scraped_at desc))[1] as r1,
         max(l.scraped_at)                                       as at1,
         -- newest observation at least 7 days older than the global anchor
         (array_agg(l.total_sold order by l.scraped_at desc)
            filter (where l.scraped_at <= a.t0 - interval '7 days'))[1] as s0,
         (array_agg(l.reviews order by l.scraped_at desc)
            filter (where l.scraped_at <= a.t0 - interval '7 days'))[1] as r0,
         max(l.scraped_at) filter (where l.scraped_at <= a.t0 - interval '7 days') as at0
  from public.listings l, anchor a
  where l.scraped_at > a.t0 - interval '45 days'
    and l.price between 1000 and 50000000
    and l.product_name is not null
    and l.item_id is not null
    and l.total_sold is not null
  group by l.item_id, l.shop_id
  having max(l.scraped_at) filter (where l.scraped_at <= a.t0 - interval '7 days') is not null
     -- the listing itself must be freshly seen, else "this week" is stale
     and max(l.scraped_at) > (select t0 from anchor) - interval '10 days'
),
spanned as (
  select s.*,
         (extract(epoch from (s.at1 - s.at0)) / 86400.0)::double precision as span_days
  from snap s
),
-- Same bucket-safe correction mv_trending uses: a Shopee display-bucket floor
-- jump (999 -> 10rb) must not read as 9000 real sales. The cap scales with the
-- measured span, so a 13-day window is allowed 13 days' worth of headroom.
corr as (
  select sp.item_id, sp.shop_id, sp.span_days,
         public._lid_corr_sold_delta(
           sp.s1, sp.s0, sp.r1, sp.r0, ceil(sp.span_days)::int
         ) as d_span
  from spanned sp
  where sp.span_days >= 7 and sp.span_days <= 21
),
-- Keyword comes from the newest row for the listing. btrim() to match
-- mv_product_types, which stores btrim(keyword) — an untrimmed join here would
-- drop exactly the keywords the scraper wrote with trailing whitespace.
latest as (
  select distinct on (l.item_id, l.shop_id)
         l.item_id, l.shop_id, btrim(l.keyword) as keyword, l.total_sold
  from public.listings l, anchor a
  where l.scraped_at > a.t0 - interval '10 days'
    and l.product_name is not null
    and l.item_id is not null
    and l.total_sold is not null
    and l.keyword is not null
    and btrim(l.keyword) <> ''
  order by l.item_id, l.shop_id, l.scraped_at desc
)
select l.keyword,
       -- 7-day-equivalent units, summed over the type's listings
       round(sum(c.d_span * 7.0 / c.span_days))::bigint      as wk_units,
       -- units sold before this window — the baseline the growth % divides by
       sum(greatest(0, l.total_sold - c.d_span))::bigint     as wk_base,
       count(*) filter (where c.d_span > 0)::int             as wk_items,
       -- what we actually measured, so the UI can be honest about the window
       round(percentile_cont(0.5) within group (order by c.span_days))::int
                                                             as wk_span_days,
       (select t0 from anchor)                               as wk_anchor_at,
       now()                                                 as refreshed_at
from latest l
join corr c using (item_id, shop_id)
group by l.keyword;

create unique index mv_keyword_weekly_kw_idx on public.mv_keyword_weekly (keyword);
create index mv_keyword_weekly_units_idx
  on public.mv_keyword_weekly (wk_units desc nulls last);

grant select on public.mv_keyword_weekly to anon, authenticated;

-- ── product_types_v: append the wk_* columns ───────────────────────────────
-- Same reasoning as 20260728150000: join onto mv_product_types rather than
-- regenerate its 187-line definition with the hand-maintained city_map CTE.
create view public.product_types_v as
select
  pt.*,
  coalesce(ks.canonical, 'Lainnya') as category_canonical,
  coalesce(ks.subgroup,  'Lainnya') as subgroup,
  kw.wk_units,
  kw.wk_base,
  kw.wk_items,
  kw.wk_span_days,
  kw.wk_anchor_at
from public.mv_product_types pt
left join public.keyword_subgroup ks on ks.keyword = pt.keyword
left join public.mv_keyword_weekly kw on kw.keyword = pt.keyword;

grant select on public.product_types_v to anon, authenticated;

-- ── fold into the shared post-scrape refresher ─────────────────────────────
-- After listings_deduped (reads fresh listings), before mv_product_types —
-- the slot mv_trending already occupies.
create or replace function public.refresh_breakout_matviews()
returns void
language plpgsql
security definer
set search_path = public
set statement_timeout = '900s'
as $function$
begin
  refresh materialized view public.listings_deduped;
  refresh materialized view public.mv_niche_breakout;
  refresh materialized view public.mv_region_category;
  refresh materialized view public.mv_supplier_leaderboard;
  refresh materialized view public.mv_naik_daun;
  refresh materialized view public.mv_trending;
  refresh materialized view public.mv_keyword_weekly;
  refresh materialized view public.mv_product_types;
  refresh materialized view public.mv_shops;
  refresh materialized view public.mv_keyword_daily;
  refresh materialized view public.mv_shop_daily;
  perform public.rebuild_keyword_subgroups();
end; $function$;
