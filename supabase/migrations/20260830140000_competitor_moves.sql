-- "A competitor ran a promo and their sales jumped" -- the daily-rec signal.
--
-- WHY DISCOUNT *DEPTH CHANGE*, NOT DISCOUNT DEPTH
-- -----------------------------------------------
-- Measured 2026-08-29: 460,057 of 711,894 listings scraped in the preceding week
-- carried original_price > price -- 64.6%. A struck-through price is the resting
-- state of the Shopee catalogue, not an event. Flagging "is discounted" would page
-- a student about two thirds of every market, every day, and a tracker that pings
-- on noise gets muted once and never works again.
--
-- So the trigger is a CHANGE between an item's last two observations: depth up at
-- least 10 percentage points, or price down at least 5%. And it must be paired with
-- units actually moving -- a discount nobody responded to is not news.
--
-- WHAT THIS IS NOT
-- ----------------
-- It is not causal. We observe a price move and a unit move in the same window on
-- the same listing; we cannot see whether the discount caused the sales, whether
-- both followed a campaign, or whether the seller discounted BECAUSE demand rose.
-- Everything downstream must phrase it as an observation and pair it with the
-- reader's own margin. Never "they discounted, so discount."
--
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20260830140000_competitor_moves.sql

begin;

drop materialized view if exists public.mv_competitor_moves cascade;

create materialized view public.mv_competitor_moves as
with recent as (
  -- Bounded to 21 days: tracked keywords are on the 1-day lane now, so two
  -- observations inside that window is the normal case, and the window keeps
  -- this off the full 2.8M-row table.
  select
    l.item_id, l.shop_id, l.keyword, l.product_name, l.store_name, l.location,
    l.price, l.original_price, l.total_sold, l.scraped_at, l.url, l.image_url,
    row_number() over (partition by l.item_id, l.keyword order by l.scraped_at desc) as rn
  from public.listings l
  where l.scraped_at >= now() - interval '21 days'
    and l.price is not null
),
paired as (
  select
    c.keyword, c.item_id, c.shop_id, c.product_name, c.store_name, c.location,
    c.url, c.image_url,
    c.price                                       as price_now,
    p.price                                       as price_prev,
    c.total_sold                                  as sold_now,
    p.total_sold                                  as sold_prev,
    c.total_sold - p.total_sold                   as sold_delta,
    c.scraped_at                                  as seen_at,
    p.scraped_at                                  as prev_seen_at,
    case when c.original_price > c.price
         then (c.original_price - c.price) / nullif(c.original_price, 0) else 0 end as disc_now,
    case when p.original_price > p.price
         then (p.original_price - p.price) / nullif(p.original_price, 0) else 0 end as disc_prev
  from recent c
  join recent p
    on p.item_id = c.item_id and p.keyword = c.keyword and p.rn = 2
  where c.rn = 1
)
select
  keyword, item_id, shop_id, product_name, store_name, location, url, image_url,
  round(price_prev::numeric)                              as price_prev,
  round(price_now::numeric)                               as price_now,
  round(100.0 * disc_prev::numeric, 1)                    as disc_prev_pct,
  round(100.0 * disc_now::numeric, 1)                     as disc_now_pct,
  round(100.0 * (disc_now - disc_prev)::numeric, 1)       as disc_change_pp,
  -- price is real, so the whole expression is double precision until cast.
  round((100.0 * (price_prev - price_now) / nullif(price_prev, 0))::numeric, 1) as price_drop_pct,
  sold_prev, sold_now, sold_delta,
  seen_at, prev_seen_at,
  seen_at::date                                           as data_day,
  now()                                                   as refreshed_at
from paired
where sold_delta > 0
  and (
    (disc_now - disc_prev) >= 0.10                                    -- deeper discount
    or (price_prev - price_now) / nullif(price_prev, 0) >= 0.05       -- or a real price cut
  );

create unique index mv_competitor_moves_pk on public.mv_competitor_moves (keyword, item_id);
create index mv_competitor_moves_kw on public.mv_competitor_moves (keyword, sold_delta desc);
create index mv_competitor_moves_day on public.mv_competitor_moves (data_day);

comment on materialized view public.mv_competitor_moves is
  'Listings whose discount deepened >=10pp or price fell >=5% between their last two '
  'observations WHILE units moved. Observation, not causation -- see the file header.';

grant select on public.mv_competitor_moves to anon, authenticated;

commit;

begin;

-- ---------------------------------------------------------------------------
-- Service-role read for the notifier, plus a user-facing read for the panel.
-- ---------------------------------------------------------------------------

create or replace function public.competitor_moves_for_keyword(p_keyword text, p_limit int default 5)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kw text := btrim(coalesce(p_keyword, ''));
begin
  if v_kw = '' then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(x order by (x->>'lonjakan_unit')::int desc)
    from (
      select jsonb_build_object(
        'produk', left(m.product_name, 80),
        'toko', m.store_name,
        'lokasi', m.location,
        'harga_sebelum', m.price_prev,
        'harga_sekarang', m.price_now,
        'turun_pct', m.price_drop_pct,
        'diskon_sebelum_pct', m.disc_prev_pct,
        'diskon_sekarang_pct', m.disc_now_pct,
        'diskon_naik_pp', m.disc_change_pp,
        'lonjakan_unit', m.sold_delta,
        'terakhir_dilihat', m.seen_at
      ) as x
      from public.mv_competitor_moves m
      where m.keyword = v_kw
      order by m.sold_delta desc
      limit least(greatest(coalesce(p_limit, 5), 1), 20)
    ) s
  ), '[]'::jsonb);
end;
$$;

comment on function public.competitor_moves_for_keyword(text, int) is
  'Competitor price/discount moves that coincided with unit movement, for one market.';

grant execute on function public.competitor_moves_for_keyword(text, int) to anon, authenticated;

commit;

begin;

-- Add to the daily refresh chain. Placed after listings_deduped like the rest,
-- though it reads `listings` directly -- it needs the raw per-scrape history that
-- the deduped view collapses away.
create or replace function public.refresh_breakout_matviews()
returns void
language plpgsql
security definer
set search_path = public
set statement_timeout = '3600s'
as $$
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
  -- Rencana Jualan playbook. mv_shop_cohort first: the other four join to it.
  refresh materialized view public.mv_shop_cohort;
  refresh materialized view public.mv_new_seller_market;
  refresh materialized view public.mv_new_shop_items;
  refresh materialized view public.mv_new_shop_traits;
  refresh materialized view public.mv_new_shop_pricemove;
  refresh materialized view public.mv_new_shop_speed;
  refresh materialized view public.mv_competitor_moves;
  perform public.rebuild_keyword_subgroups();
end; $$;

commit;

notify pgrst, 'reload schema';
