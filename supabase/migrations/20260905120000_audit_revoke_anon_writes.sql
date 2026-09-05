-- Revoke default write grants on scraper/catalog tables from anon + authenticated.
-- Scraper uses service_role. RLS stays the user-data gate.
-- Leave feedback / uncovered_searches anon-insert (intentional public intake).

do $$
declare
  t text;
  tables text[] := array[
    'listings', 'listing_deltas', 'listing_weekly', 'keyword_weekly',
    'product_velocity', 'velocity_cohort', 'velocity_model_params',
    'product_details', 'keyword_intelligence', 'keyword_library',
    'keyword_rankings', 'category_map', 'keyword_subgroup',
    'seo_city_data', 'city_location_map', 'weekly_snapshots',
    'listings_pre_dedupe_20260727', '_listings_dedupe_keep',
    'scrape_runs', 'item_snapshots', 'omset_category_crosswalk'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is not null then
      execute format('revoke insert, update, delete on table public.%I from anon, authenticated', t);
    end if;
  end loop;
end $$;

alter default privileges in schema public revoke insert, update, delete on tables from anon;
