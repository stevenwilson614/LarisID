-- LARISgpt free-text search hits listings_deduped with product_name/keyword
-- ILIKE + location IN + ORDER BY total_sold; without indexes the 300k-row
-- matview seq-scans past the anon statement timeout (57014). Indexes are
-- rebuilt automatically on REFRESH MATERIALIZED VIEW.
-- (Applied live 2026-07-17 via MCP.)
create extension if not exists pg_trgm;

create index if not exists listings_deduped_location_idx
  on public.listings_deduped (location);

create index if not exists listings_deduped_total_sold_idx
  on public.listings_deduped (total_sold desc);

create index if not exists listings_deduped_pname_trgm_idx
  on public.listings_deduped using gin (product_name gin_trgm_ops);

create index if not exists listings_deduped_keyword_trgm_idx
  on public.listings_deduped using gin (keyword gin_trgm_ops);
