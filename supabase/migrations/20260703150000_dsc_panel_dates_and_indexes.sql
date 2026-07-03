-- Discover filter fix (2026-07-03).
-- Problems: (1) the client picked its "panel date" via 7 exact-count queries
-- over 1.3M rows — slow, and chose the BIGGEST day in the window, so a fresh
-- but smaller scrape (Jul 2, 35k rows) lost to an older big one (Jun 29, 94k);
-- (2) category + day-window + ORDER BY total_sold had no covering index, so
-- filtered fetches blew the anon 3s statement timeout and returned nothing.

-- One cheap server-side call replaces the 7 client counts. Counts are capped
-- at 5000 via LIMIT subqueries so each day is an index range scan, not a full
-- count. Days are UTC to match the client's toISOString() date math.
create or replace function public.dsc_panel_dates()
returns table(day date, n integer)
language sql
stable
set search_path = public
as $$
  with days as (
    select (current_date - i)::date as day from generate_series(0, 6) i
  )
  select d.day,
         (select count(*) from (
            select 1 from public.listings l
            where l.scraped_at >= d.day::timestamptz
              and l.scraped_at < (d.day + 1)::timestamptz
            limit 5000
          ) t)::int as n
  from days d
  order by d.day desc;
$$;

grant execute on function public.dsc_panel_dates() to anon, authenticated;

-- Category + panel-day + top-sold pages (the filtered Discover fetch).
create index if not exists idx_listings_cat_day_sold
  on public.listings (category, scraped_at, total_sold desc);

-- Unfiltered panel-day + top-sold pages (default Discover fetch).
create index if not exists idx_listings_day_sold
  on public.listings (scraped_at, total_sold desc);
