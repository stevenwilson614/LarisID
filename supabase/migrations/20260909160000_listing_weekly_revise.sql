-- ============================================================================
-- listing_weekly: revise gap weeks from listing_deltas, and stop fabricating
-- weeks from before a product was ever scraped.
--
-- Canonical copies of these functions live in ~/shopee_scraper/listing_weekly.sql.
-- Keep both in step, or the next SSH apply of that file silently reverts this.
--
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20260909160000_listing_weekly_revise.sql
-- Then:  bash refresh_listing_weekly.sh    (refresh → backfill → revise → matviews)
-- Never `supabase db push`. Never over PostgREST — Kong 504s on work this size.
--
-- THE BUG (verified 2026-09-08)
-- ----------------------------
-- refresh_listing_weekly() only ever writes the current WIB week and the next
-- one. backfill_listing_weekly_estimates() fills the Mondays in between, but
-- ends in `WHERE NOT EXISTS (... week_start = w)` — so a week filled while a
-- product had exactly one observation is never revisited once a later scrape
-- reveals what actually happened.
--
--   item 57355613815 / shop 1474463822, scraped 2026-07-27 (3 749 sold) and
--   2026-08-29 (4 086). listing_deltas holds 337 units over 33.1 days,
--   estimation_method 'exact', confidence 'high' → 10.174 units/day.
--
--   Weeks 2026-08-03 / 08-10 / 08-17 sat at 'peer'/low ≈72 and 'estimated'/low
--   69.3, while product_daily_series — the estimator the deep-dive chart and
--   the XLSX export already use — returned 10.174/day 'measured' for every one
--   of those days. Two surfaces, two answers, and Peta Peluang / Jejak Waktu
--   read the wrong one.
--
-- Second defect: the backfill wrote weeks from BEFORE the product's first
-- scrape (Jun 22 – Jul 20 at a flat 69.3/wk for a product first seen Jul 27)
-- under the same 'estimated' label as a real gap week. 4 938 207 rows — 42% of
-- the whole table — were weeks for listings we had not yet seen.
--
-- THE FIX
-- -------
-- 1. revise_listing_weekly_measured() — the revising pass this table never
--    had. Every (item, shop, week) whose seven days are fully covered by
--    listing_deltas intervals is rewritten from those intervals'
--    span-normalised rate.
--
--    Immutability is unchanged: a 'measured' week is never rewritten, and
--    'zero' (lifetime sold = 0) stays ground truth. This pass only upgrades
--    peer / estimated / nowcast / forecast / prior rows, never the reverse.
--
-- 2. backfill_listing_weekly_estimates() learns each listing's first scrape.
--    Weeks ending before it are written 'prior' at the peer rate — the same
--    word and the same number product_daily_series uses for those days —
--    instead of a nowcast decay wearing the 'estimated' label. Section 4
--    relabels the 4.94M rows already written, and the function re-checks the
--    boundary in both directions on every run so a later historical listings
--    push cannot strand a row on either side.
--
-- WHAT COUNTS AS 'measured'
-- -------------------------
-- product_daily_series calls a day 'measured' only when its covering interval
-- has estimation_method = 'exact'; review_model / threshold intervals are
-- 'estimated'. This pass uses the same rule, so a week here and the same week
-- in the export agree on both the number and the label. A week covered by a
-- non-exact interval still takes the interval's rate — a real measurement of
-- that span beats a decayed nowcast — but keeps the perkiraan label.
--
-- A partially covered week (the scrape landed mid-week) is deliberately left
-- alone. Blending a measured stretch with a modelled remainder would be a
-- second estimator, and it would not be idempotent — each run would re-blend
-- its own previous output. The export makes the same call: only a week where
-- bool_and(source = 'measured') holds is 'terukur'.
--
-- COST, measured on the live box 2026-09-08 (11 766 237 rows / 1.02M products)
-- ---------------------------------------------------------------------------
--   coverage build (12 weeks, 828k deltas → 1.22M covered weeks)   ~21 s
--   the UPDATE against listing_weekly (one pass over 2.8 GB)       ~3 min
--   first/last scrape per listing (3.7M listings rows)             ~24 s
--   the one-time 'prior' relabel in section 4                      ~5 min
-- Every write is guarded by an IS DISTINCT FROM check, so a second run in a
-- row updates ~0 rows.
-- ============================================================================

set statement_timeout to '3600s';

begin;

-- ---------------------------------------------------------------------------
-- 1. 'prior' joins the source vocabulary
-- ---------------------------------------------------------------------------
-- The same word product_daily_series uses for days before the first
-- observation. js/peta-peluang.js REAL_SRC = {measured, estimated, nowcast} —
-- 'prior' is deliberately absent from it, so a prior week draws faded and never
-- counts as the evidence that lets Jejak Waktu claim a trend.
alter table public.listing_weekly drop constraint if exists listing_weekly_source_chk;
alter table public.listing_weekly add constraint listing_weekly_source_chk
  check (source in ('measured', 'nowcast', 'forecast', 'peer', 'zero',
                    'estimated', 'prior'));

comment on column public.listing_weekly.source is
  'measured | nowcast | forecast | peer | zero | estimated | prior. '
  'measured = every day of the week falls inside an exact listing_deltas '
  'interval. estimated = a modelled gap week, or a week covered by a non-exact '
  'interval. prior = the week ended before this listing was first scraped; the '
  'peer rate, not a claim about this product. The UI must label everything '
  'that is not measured as perkiraan (hollow/dashed).';

comment on column public.listing_weekly.delta_units is
  'Audit: units of the listing_deltas interval this week''s rate came from — '
  'for a week covered by more than one interval, the one covering the most '
  'days. NULL for modelled weeks.';
comment on column public.listing_weekly.span_days is
  'Audit: that interval''s full span in days. units_wk / 7 should equal '
  'delta_units / span_days. Scrapes land 12-17 days apart, so this pair is '
  'what proves the week is span-normalised and not a raw two-snapshot delta.';

-- ---------------------------------------------------------------------------
-- 2. revise_listing_weekly_measured
-- ---------------------------------------------------------------------------
drop function if exists public.revise_listing_weekly_measured(int);
create function public.revise_listing_weekly_measured(p_weeks int default 12)
returns table(
    weeks_covered  bigint,   -- (item, shop, week) fully covered in the window
    rows_measured  bigint,   -- upgraded to source='measured'
    rows_estimated bigint)   -- re-rated from a non-exact interval, still perkiraan
language plpgsql
set search_path to 'public'
as $$
declare
    week0 date := listing_week_start(current_date);
    w_lo  date;
    w_hi  date;
    n_cov bigint;
    n_m   bigint;
    n_e   bigint;
begin
    set local statement_timeout to '3600s';
    set local max_parallel_workers_per_gather to 0;

    -- A caller that loops this in one transaction would collide on the temp
    -- tables: ON COMMIT DROP only fires at COMMIT. Same guard as
    -- refresh_listing_deltas().
    drop table if exists _rev_iv;
    drop table if exists _rev_cov;

    w_lo := week0 - (greatest(coalesce(p_weeks, 12), 1) * 7);
    -- Past weeks only. week0 and week0+7 belong to refresh_listing_weekly(),
    -- which rewrites them from the same v_latest rate on every run; competing
    -- for those two rows would just be two functions overwriting each other.
    w_hi := week0 - 7;

    -- Every delta interval that can reach into the window. The interval is
    -- (prev_scraped_at, scraped_at] — half-open at the start, because the day
    -- of the earlier scrape belongs to the interval before it.
    -- product_daily_series slices it identically (`dd.d > iv.start_d and
    -- dd.d <= iv.end_d`), which is what makes the two surfaces agree day for
    -- day. `scraped_at >= w_lo` is the whole filter and it is sargable on
    -- idx_ld_scraped: an interval ending before the window starts cannot
    -- overlap it.
    create temp table _rev_iv on commit drop as
    select ld.item_id, ld.shop_id,
           ld.prev_scraped_at::date as start_d,
           ld.scraped_at::date      as end_d,
           ld.estimated_sold_delta::double precision
             / greatest(extract(epoch from (ld.scraped_at - ld.prev_scraped_at))
                        / 86400.0, 0.5)                        as rate,
           ld.estimated_sold_delta                             as delta_units,
           (extract(epoch from (ld.scraped_at - ld.prev_scraped_at))
            / 86400.0)::real                                   as span_days,
           (ld.estimation_method = 'exact')                    as is_exact,
           case ld.confidence when 'high'   then 3
                              when 'medium' then 2
                              else 1 end                       as conf_rank
    from listing_deltas ld
    where ld.scraped_at >= w_lo::timestamptz
      and ld.estimated_sold_delta is not null
      and ld.estimation_method is distinct from 'counter_reset'
      and ld.scraped_at > ld.prev_scraped_at;

    -- Fan each interval out over the WIB Mondays it touches, counting the days
    -- it contributes to each. Intervals for one listing are contiguous and
    -- non-overlapping by construction (refresh_listing_deltas pairs each
    -- observation with its own immediate predecessor, one row per scrape day),
    -- so day counts add rather than double-count; dividing by the summed days
    -- absorbs an overlap if one ever appears anyway.
    create temp table _rev_cov on commit drop as
    with per_week as (
        select iv.item_id, iv.shop_id, wk.week_start,
               greatest(0, least(iv.end_d, wk.week_start + 6)
                           - greatest(iv.start_d + 1, wk.week_start) + 1) as days_cov,
               iv.rate, iv.delta_units, iv.span_days, iv.is_exact, iv.conf_rank
        from _rev_iv iv
        cross join lateral (
            select gs::date as week_start
            from generate_series(
                   greatest(listing_week_start(iv.start_d + 1), w_lo),
                   least(listing_week_start(iv.end_d), w_hi),
                   interval '7 days') gs
        ) wk
    ),
    agg as (
        select item_id, shop_id, week_start,
               sum(days_cov)::int   as days_cov,
               sum(days_cov * rate) as units_cov,
               bool_and(is_exact)   as all_exact,
               min(conf_rank)       as conf_rank,
               (array_agg(delta_units order by days_cov desc, span_days asc))[1]
                 as delta_units,
               (array_agg(span_days  order by days_cov desc, span_days asc))[1]
                 as span_days
        from per_week
        where days_cov > 0
        group by 1, 2, 3
        having sum(days_cov) >= 7          -- fully covered weeks only
    )
    select a.item_id, a.shop_id, a.week_start,
           -- Same clamp listing_week_units() applies: 5000 units/day.
           least(greatest(a.units_cov * 7.0 / a.days_cov, 0), 35000)::real as units_wk,
           case when a.all_exact then 'measured' else 'estimated' end       as new_source,
           case a.conf_rank when 3 then 'high'
                            when 2 then 'medium'
                            else 'low' end                                  as new_conf,
           a.delta_units, a.span_days
    from agg a;

    create index on _rev_cov (item_id, shop_id, week_start);
    analyze _rev_cov;

    select count(*) into n_cov from _rev_cov;

    -- One pass over listing_weekly. 'measured' is immutable and 'zero' is
    -- ground truth (product_velocity method='zero_sales'; product_daily_series
    -- hard-zeros those days too, so overwriting them here would put this table
    -- back out of step with the chart). Everything else is model output and
    -- may be upgraded.
    with upd as (
        update listing_weekly lw
           set units_wk    = c.units_wk,
               omset_wk    = greatest(0, round(coalesce(lw.price, 0)::numeric
                                               * c.units_wk::numeric))::bigint,
               v_daily     = (c.units_wk / 7.0)::real,
               source      = c.new_source,
               confidence  = c.new_conf,
               delta_units = c.delta_units,
               span_days   = c.span_days,
               revised_at  = now()
          from _rev_cov c
         where lw.item_id = c.item_id
           and lw.shop_id = c.shop_id
           and lw.week_start = c.week_start
           and lw.source in ('estimated', 'peer', 'nowcast', 'forecast', 'prior')
           -- Idempotence: real arithmetic is deterministic, so a second run in
           -- a row matches on every column and writes nothing.
           and (lw.source      is distinct from c.new_source
             or lw.units_wk    is distinct from c.units_wk
             or lw.confidence  is distinct from c.new_conf
             or lw.delta_units is distinct from c.delta_units
             or lw.span_days   is distinct from c.span_days)
        returning c.new_source as new_source
    )
    select count(*) filter (where new_source = 'measured'),
           count(*) filter (where new_source = 'estimated')
      into n_m, n_e
      from upd;

    -- weeks_covered - (rows_measured + rows_estimated) is the number of covered
    -- weeks left alone: already measured, 'zero', or already carrying exactly
    -- this number from an earlier run.
    return query select n_cov, coalesce(n_m, 0), coalesce(n_e, 0);
end;
$$;

comment on function public.revise_listing_weekly_measured(int) is
  'Rewrites every past listing_weekly week whose seven days are fully covered '
  'by listing_deltas intervals, from those intervals'' span-normalised rate. '
  'Upgrade-only: never touches source=measured (immutable) or zero (ground '
  'truth). Fixes the gap weeks backfill_listing_weekly_estimates cannot '
  'revisit. SSH+psql only — one full pass over listing_weekly, ~3 min.';

-- SSH+psql only, exactly like refresh_listing_weekly. Note that this box grants
-- EXECUTE on every new function to anon/authenticated by default
-- (pg_default_acl), so `revoke from public` alone would not be enough — see
-- TRAP 4 in 20260909120000_export_row_budget.sql.
revoke all on function public.revise_listing_weekly_measured(int)
  from public, anon, authenticated;
grant execute on function public.revise_listing_weekly_measured(int) to postgres;

-- ---------------------------------------------------------------------------
-- 3. backfill_listing_weekly_estimates — first-observation aware
-- ---------------------------------------------------------------------------
-- Same contract as before (fill the Mondays refresh_listing_weekly skips, never
-- overwrite a week that already exists), with three changes:
--   * a week ending before the listing's first scrape is 'prior' at the peer
--     rate, not 'estimated' at a nowcast decay;
--   * a listing product_velocity calls zero_sales gets 'zero' — what
--     refresh_listing_weekly already writes for the current week, and what
--     product_daily_series returns for every day of a dead product;
--   * the prior/estimated boundary is re-checked in both directions each run,
--     so a later historical listings push cannot strand a row on either side.
create or replace function public.backfill_listing_weekly_estimates(
    p_weeks int default 10)
returns bigint
language plpgsql
set search_path to 'public'
as $$
declare
    week0  date := listing_week_start(current_date);
    n_ins  bigint := 0;
    n_this bigint := 0;
    w      date;
    w_lo   date;
begin
    set local statement_timeout to '3600s';
    set local max_parallel_workers_per_gather to 0;

    drop table if exists _lw_span;

    w_lo := week0 - (greatest(coalesce(p_weeks, 10), 1) * 7);

    -- First and last scrape per listing, once for the whole run. last_d is the
    -- old `live` filter (a listing not seen since w_lo gets no new rows);
    -- first_d is what stops the fabrication of weeks from before we had ever
    -- seen it. ~24 s over 3.7M listings rows.
    create temp table _lw_span on commit drop as
    select l.item_id, l.shop_id,
           min(l.scraped_at)::date as first_d,
           max(l.scraped_at)::date as last_d
    from listings l
    where l.item_id is not null and l.shop_id is not null
    group by 1, 2;
    create index on _lw_span (item_id, shop_id);
    analyze _lw_span;

    for w in select gs::date
             from generate_series(w_lo, week0 - 7, interval '7 days') gs
    loop
        insert into listing_weekly (
            item_id, shop_id, week_start, units_wk, omset_wk, price, v_daily,
            source, confidence, peer_n, delta_units, span_days,
            computed_at, revised_at)
        select
            pv.item_id, pv.shop_id, w,
            coalesce(u.units_wk, 0),
            greatest(0, round(coalesce(pv.price, 0)::numeric
                              * coalesce(u.units_wk, 0)::numeric))::bigint,
            pv.price,
            case when k.mode = 'peer' then pv.v_peer else pv.v_daily end,
            -- k.mode picks the RATE; these are the labels that rate is honest
            -- under. 'nowcast' modelling of a past week has always been stored
            -- as 'estimated' (UI: perkiraan, hollow) — keep that.
            case k.mode when 'zero' then 'zero'
                        when 'peer' then 'prior'
                        else 'estimated' end,
            case when k.mode = 'zero' then 'high' else 'low' end,
            null, null, null, now(), now()
        from product_velocity pv
        join _lw_span sp on sp.item_id = pv.item_id and sp.shop_id = pv.shop_id
        cross join lateral (
            select case
                     when pv.method = 'zero_sales' then 'zero'
                     -- the whole week ended before we first saw this listing
                     when sp.first_d > w + 6       then 'peer'
                     else 'nowcast'
                   end as mode
        ) k
        cross join lateral (
            select listing_week_units(
                k.mode, pv.v_latest, pv.v_daily, pv.v_peer, pv.w_own,
                pv.tau_days, pv.last_obs_at::date, pv.computed_at::date, w
            ) as units_wk
        ) u
        where sp.last_d >= w_lo
          and not exists (
            select 1 from listing_weekly lw
            where lw.item_id = pv.item_id
              and lw.shop_id = pv.shop_id
              and lw.week_start = w
        );
        get diagnostics n_this = row_count;
        n_ins := n_ins + n_this;
    end loop;

    -- Boundary re-check, both directions, over the only two labels this
    -- function owns. 'measured', 'zero', 'peer', 'nowcast' and 'forecast' are
    -- written by other passes and are never touched here. The predicate is
    -- narrow — a row only qualifies when its label already disagrees with the
    -- first-scrape boundary — so in steady state this matches nothing.
    with tgt as (
        select lw.item_id, lw.shop_id, lw.week_start,
               case when sp.first_d > lw.week_start + 6 then 'prior'
                    else 'estimated' end as src,
               pv.v_peer, pv.v_daily, pv.v_latest, pv.w_own, pv.tau_days,
               pv.last_obs_at::date as last_obs, pv.computed_at::date as comp
        from listing_weekly lw
        join _lw_span sp on sp.item_id = lw.item_id and sp.shop_id = lw.shop_id
        join product_velocity pv
          on pv.item_id = lw.item_id and pv.shop_id = lw.shop_id
        where lw.week_start between w_lo and week0 - 7
          and lw.source in ('estimated', 'prior')
          and lw.source is distinct from
              (case when sp.first_d > lw.week_start + 6 then 'prior'
                    else 'estimated' end)
    ),
    calc as (
        select t.*,
               listing_week_units(
                   case when t.src = 'prior' then 'peer' else 'nowcast' end,
                   t.v_latest, t.v_daily, t.v_peer, t.w_own, t.tau_days,
                   t.last_obs, t.comp, t.week_start) as units_wk
        from tgt t
    )
    update listing_weekly lw
       set source     = c.src,
           units_wk   = coalesce(c.units_wk, 0),
           omset_wk   = greatest(0, round(coalesce(lw.price, 0)::numeric
                                          * coalesce(c.units_wk, 0)::numeric))::bigint,
           v_daily    = case when c.src = 'prior' then c.v_peer else c.v_daily end,
           confidence = 'low',
           revised_at = now()
      from calc c
     where lw.item_id = c.item_id
       and lw.shop_id = c.shop_id
       and lw.week_start = c.week_start
       and lw.source in ('estimated', 'prior');

    return n_ins;
end;
$$;

comment on function public.backfill_listing_weekly_estimates(int) is
  'Fills the WIB Mondays refresh_listing_weekly() skips. A week ending before '
  'a listing''s first scrape is source=prior at the peer rate — not a claim '
  'about that product. zero_sales listings get source=zero. Never overwrites '
  'an existing week, so run revise_listing_weekly_measured() after it to '
  'upgrade the weeks a later scrape has since measured. SSH+psql only.';

revoke all on function public.backfill_listing_weekly_estimates(int)
  from public, anon, authenticated;
grant execute on function public.backfill_listing_weekly_estimates(int) to postgres;

commit;

-- ---------------------------------------------------------------------------
-- 4. One-time cleanup of what the old backfill already wrote
-- ---------------------------------------------------------------------------
-- 4 938 207 'estimated' rows (42% of the table) are weeks that ended before
-- their listing's first scrape. Relabel them 'prior' and re-rate them to the
-- peer prior, which is what product_daily_series returns for those days.
--
-- Outside the transaction above, and it COMMITs per week, so no single
-- statement holds five million row locks. That is also why _fix_span is a
-- plain temp table: ON COMMIT DROP would take it away at the first commit.
do $$
declare
    w       date;
    n_rows  bigint;
    n_total bigint := 0;
begin
    drop table if exists _fix_span;
    create temp table _fix_span as
    select l.item_id, l.shop_id, min(l.scraped_at)::date as first_d
    from listings l
    where l.item_id is not null and l.shop_id is not null
    group by 1, 2;
    create index on _fix_span (item_id, shop_id);
    analyze _fix_span;

    for w in select distinct week_start from listing_weekly order by week_start
    loop
        with calc as (
            select lw.item_id, lw.shop_id, lw.week_start, pv.v_peer,
                   listing_week_units('peer', pv.v_latest, pv.v_daily, pv.v_peer,
                                      pv.w_own, pv.tau_days, pv.last_obs_at::date,
                                      pv.computed_at::date, lw.week_start) as units_wk
            from listing_weekly lw
            join _fix_span sp on sp.item_id = lw.item_id and sp.shop_id = lw.shop_id
            join product_velocity pv
              on pv.item_id = lw.item_id and pv.shop_id = lw.shop_id
            where lw.week_start = w
              and lw.source = 'estimated'
              and sp.first_d > lw.week_start + 6
        )
        update listing_weekly lw
           set source     = 'prior',
               units_wk   = coalesce(c.units_wk, 0),
               omset_wk   = greatest(0, round(coalesce(lw.price, 0)::numeric
                                              * coalesce(c.units_wk, 0)::numeric))::bigint,
               v_daily    = c.v_peer,
               confidence = 'low',
               revised_at = now()
          from calc c
         where lw.item_id = c.item_id
           and lw.shop_id = c.shop_id
           and lw.week_start = c.week_start
           and lw.source = 'estimated';
        get diagnostics n_rows = row_count;
        n_total := n_total + n_rows;
        raise notice 'prior relabel %: % rows (running total %)', w, n_rows, n_total;
        commit;
    end loop;

    drop table if exists _fix_span;
end;
$$;

notify pgrst, 'reload schema';
