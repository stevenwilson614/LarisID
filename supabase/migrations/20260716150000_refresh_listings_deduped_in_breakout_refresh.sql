-- listings_deduped froze at 2026-04-30 because nothing refreshed it; LARISgpt's
-- city+category recommendations read it. Fold it into the existing ~daily
-- post-scrape refresher so it stays as fresh as the breakout matviews.
-- (Applied live 2026-07-16 via MCP; one-off REFRESH run the same day.)
create or replace function public.refresh_breakout_matviews()
returns void
language plpgsql
security definer
set search_path to 'public'
set statement_timeout to '300s'
as $function$
begin
  refresh materialized view public.listings_deduped;
  refresh materialized view public.mv_niche_breakout;
  refresh materialized view public.mv_region_category;
  refresh materialized view public.mv_supplier_leaderboard;
  refresh materialized view public.mv_naik_daun;
end; $function$;
