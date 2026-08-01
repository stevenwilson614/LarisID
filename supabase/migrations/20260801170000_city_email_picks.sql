-- ==========================================================================
-- mv_city_email_picks -- the top-5 rows the win-back city email sends.
--
-- Why a matview: the persuasive column in that email is "how many sellers are
-- already in this market", and counting distinct shops per keyword against
-- listings_latest takes ~5s. Doing that per recipient would be both slow and
-- inconsistent between sends, so it is precomputed once per refresh and the
-- sender does a single trivial select.
--
-- Cities come from mv_city_weekly_recs (14 cities). Users whose city we do not
-- know get the '(nasional)' pseudo-city: the strongest markets across every
-- city, deduplicated to one row per keyword.
-- ==========================================================================

drop materialized view if exists public.mv_city_email_picks;

create materialized view public.mv_city_email_picks as
with picks as (
  select city, rn, keyword, product_name, price, total_sold, week_start
  from public.mv_city_weekly_recs
  where rn <= 5
),
national as (
  -- One row per keyword nationally, the best-selling listing for it, top 5.
  select
    '(nasional)'::text as city,
    (row_number() over (order by total_sold desc))::bigint as rn,
    keyword, product_name, price, total_sold, week_start
  from (
    select distinct on (keyword)
      keyword, product_name, price, total_sold, week_start
    from public.mv_city_weekly_recs
    order by keyword, total_sold desc
  ) d
  order by total_sold desc
  limit 5
),
combined as (
  select * from picks
  union all
  select * from national
),
sellers as (
  select l.keyword, count(distinct l.shop_id)::int as sellers
  from public.listings_latest l
  where l.keyword in (select keyword from combined)
  group by l.keyword
)
select
  c.city,
  c.rn,
  c.keyword,
  c.product_name,
  c.price,
  c.total_sold,
  coalesce(s.sellers, 0) as sellers,
  c.week_start,
  now() as refreshed_at
from combined c
left join sellers s on s.keyword = c.keyword;

-- Unique index is required for REFRESH ... CONCURRENTLY.
create unique index if not exists uq_mv_city_email_picks
  on public.mv_city_email_picks (city, rn);

-- Read path is the service-role sender only. No anon grant on purpose: this is
-- campaign content, not public site data.
revoke all privileges on public.mv_city_email_picks from anon, authenticated;

create or replace function public.refresh_city_email_picks()
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $$
begin
  -- CONCURRENTLY so a send in flight never reads an empty view. Falls back to a
  -- plain refresh when the view has never been populated, matching the pattern
  -- already used by refresh_city_weekly_recs().
  begin
    refresh materialized view concurrently public.mv_city_email_picks;
  exception when others then
    refresh materialized view public.mv_city_email_picks;
  end;
end;
$$;

revoke execute on function public.refresh_city_email_picks() from anon, authenticated;
