-- pasar_kota — what shops in ONE city actually sell.
--
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20260901120000_pasar_kota.sql
--
-- WHY THIS EXISTS
-- ---------------
-- "Aku di Bau-Bau, aku harus jual apa?" used to be answered by filtering the
-- user's ONBOARDING interest (Olahraga) and ignoring the city entirely — the
-- category defined the search instead of merely colouring it. The agent had no
-- tool that could read a city, so it reached for the one filter it had.
--
-- This is that missing read: group the seller side by keyword for the locations
-- that match a typed city name, and hand back honest counts alongside.
--
-- TWO MEASUREMENT RULES ARE BAKED IN HERE, NOT LEFT TO THE CALLER
-- --------------------------------------------------------------
-- R1. `location` is the SELLER's location, never the buyer's. Everything here
--     answers "who ships FROM here", not "who buys here".
--
-- R2. THIN IS THE NORMAL CASE, AND IT IS NOT THE SAME AS EMPTY. The scraper
--     sweeps keywords nationally (scenario=PAGE_GLOBAL_SEARCH, no location
--     facet), so a city with few shops means our sweep never surfaced them, not
--     that nobody there sells. Every return therefore carries `catatan` stating
--     the real counts and what they do and do not license — a confident "pasar
--     di kotamu" built on six shops is exactly the hidden-uncertainty failure
--     MISSION.md forbids. Bau-Bau today: 6 shops, 119 items, 9 keywords.

begin;

-- ---------------------------------------------------------------------------
-- 1. norm_loc — one spelling rule for Indonesian place names.
-- ---------------------------------------------------------------------------
-- "bau bau", "Bau-Bau", "Kota Baubau" and "kab. bau bau" all have to land on
-- the same key: Shopee's strings are hyphenated and prefixed, what users type
-- is neither.

create or replace function public.norm_loc(t text)
returns text
language sql
immutable
parallel safe
as $$
  select regexp_replace(
           lower(regexp_replace(btrim(coalesce(t, '')), '^(kota|kab\.?|kabupaten)\s+', '', 'i')),
           '[^a-z0-9]', '', 'g')
$$;

-- ---------------------------------------------------------------------------
-- 2. mv_seller_locations — the 400-odd distinct seller locations, once.
-- ---------------------------------------------------------------------------
-- Name resolution has to be fuzzy (exact, then prefix, then contains), and
-- fuzzy matching cannot use an index. Doing it against 1.26M listing rows costs
-- ~3s per call and would eat the agent's 8s per-tool timeout; doing it against
-- this 400-row rollup is free. The resolved strings then go back to
-- listings_deduped as an equality filter, which does hit the location index.

drop materialized view if exists public.mv_seller_locations cascade;

create materialized view public.mv_seller_locations as
select
  l.location,
  public.norm_loc(l.location)   as loc_norm,
  count(distinct l.shop_id)::int as n_toko,
  count(distinct l.item_id)::int as n_item,
  count(*)::int                  as n_baris
from public.listings_deduped l
where l.is_offtopic = false
  and l.location is not null
  and btrim(l.location) <> ''
group by 1, 2;

create unique index mv_seller_locations_location_idx on public.mv_seller_locations (location);
create index mv_seller_locations_norm_idx on public.mv_seller_locations (loc_norm text_pattern_ops);

grant select on public.mv_seller_locations to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. pasar_kota — the RPC the AI tool calls.
-- ---------------------------------------------------------------------------
-- security definer + granted to anon/authenticated, same as the Rencana Jualan
-- trio: market aggregates, no PII, and nothing here reads auth.uid().

create or replace function public.pasar_kota(p_kota text, p_limit int default 12)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_key      text   := public.norm_loc(p_kota);
  v_limit    int    := least(greatest(coalesce(p_limit, 12), 3), 25);
  v_locs     text[];
  v_cocok    text   := 'tepat';
  v_toko     int    := 0;
  v_item     int    := 0;
  v_pasar_n  int    := 0;
  v_sold     bigint := 0;
  v_toko_nas int    := 0;
  v_pasar    jsonb  := '[]'::jsonb;
  v_kat      jsonb  := '[]'::jsonb;
  v_toko_l   jsonb  := '[]'::jsonb;
  v_catatan  text;
begin
  if v_key is null or v_key = '' then
    return jsonb_build_object('error', 'kota wajib diisi');
  end if;

  -- Exact first. Prefix only as a fallback, so "solo" cannot silently swallow
  -- "Solok", and "jakarta" still widens to Jakarta Barat/Selatan/... when there
  -- is no bare "Jakarta" row.
  select array_agg(location order by n_item desc) into v_locs
  from public.mv_seller_locations where loc_norm = v_key;

  if v_locs is null then
    v_cocok := 'awalan';
    select array_agg(location order by n_item desc) into v_locs
    from public.mv_seller_locations where loc_norm like v_key || '%';
  end if;

  if v_locs is null then
    v_cocok := 'mengandung';
    select array_agg(location order by n_item desc) into v_locs
    from public.mv_seller_locations where loc_norm like '%' || v_key || '%';
  end if;

  -- R2: no rows is a statement about our coverage, not about the city.
  if v_locs is null then
    return jsonb_build_object(
      'kota', p_kota,
      'cocok', 'nihil',
      'kota_cocok', '[]'::jsonb,
      'n_toko', 0, 'n_item', 0, 'n_pasar', 0,
      'pasar', '[]'::jsonb, 'kategori', '[]'::jsonb, 'toko', '[]'::jsonb,
      'catatan', 'Tidak ada satu pun seller dengan lokasi ini di data LarisID. '
              || 'Scraper kami menyapu kata kunci secara NASIONAL, bukan per kota, jadi ini '
              || 'berarti sapuan kami belum pernah memunculkan toko dari sana — BUKAN berarti '
              || 'tidak ada penjual di kota itu. Katakan apa adanya, jangan menyimpulkan '
              || '"pasarnya kosong", lalu lanjutkan dengan pasar nasional yang relevan.'
    );
  end if;

  select coalesce(sum(n_toko), 0)::int into v_toko_nas from public.mv_seller_locations;

  -- ONE scan, not four. `as materialized` is load-bearing: inlined, each of the
  -- four rollups below re-reads listings_deduped, and on a Jakarta-sized match
  -- (~400k rows) that took 7.4s — past the agent's 8s per-tool timeout.
  --
  -- count(*) rather than count(distinct item_id) inside a keyword group is safe
  -- and much cheaper: listings_deduped is UNIQUE on (item_id, shop_id, keyword),
  -- so within one keyword the rows already are the distinct items. The top-level
  -- item count keeps its distinct — there an item recurs once per keyword.
  with src as materialized (
    select item_id, shop_id, store_name, keyword, category, location,
           price, total_sold, nowcast_omset_monthly, nowcast_confidence
    from public.listings_deduped
    where location = any(v_locs) and is_offtopic = false
  ),
  tot as (
    select count(distinct shop_id)::int    as n_toko,
           count(distinct item_id)::int    as n_item,
           count(distinct keyword)::int    as n_pasar,
           coalesce(sum(total_sold), 0)::bigint as terjual
    from src
  ),
  -- Two phase, on purpose. Ranking is a cheap hash aggregate; mode(),
  -- percentile_cont() and count(distinct) all sort within each group, so they
  -- run only over the rows of the <=25 keywords that survived the ranking.
  -- Doing them over every keyword in a Jakarta-sized match was most of the
  -- 4.4s this used to cost.
  kw_rank as (
    select keyword,
           coalesce(sum(total_sold), 0)::bigint as terjual_total,
           count(*)::int                        as n_item
    from src
    group by keyword
    order by 2 desc, 3 desc
    limit v_limit
  ),
  kw as (
    select r.keyword                                                        as pasar,
           mode() within group (order by s.category)                        as kategori_raw,
           r.n_item                                                         as n_item,
           count(distinct s.shop_id)::int                                   as n_toko,
           r.terjual_total                                                  as terjual_total,
           round(percentile_cont(0.5) within group (order by s.price::numeric))::bigint
                                                                            as harga_median,
           -- Modelled, never measured: the nowcast is an estimate for every row
           -- in this corpus, which is why the field name says so and `catatan`
           -- repeats it. Confidence mix rides along so a thin market cannot be
           -- quoted as confidently as a thick one.
           coalesce(sum(s.nowcast_omset_monthly), 0)::bigint                as omset_bln_perkiraan,
           count(*) filter (where s.nowcast_confidence = 'high')::int       as n_conf_tinggi
    from kw_rank r join src s on s.keyword = r.keyword
    group by r.keyword, r.n_item, r.terjual_total
  ),
  -- Raw scrape categories (the 85-string vocabulary), NOT the canonical buckets
  -- pasar_kategori takes — flagged in the field name so nobody feeds one to the
  -- other and gets zero rows back.
  kat as (
    select coalesce(category, '(tanpa kategori)') as kategori_raw,
           count(distinct item_id)::int           as n_item,
           count(distinct shop_id)::int           as n_toko
    from src
    group by 1
    order by 2 desc
    limit 10
  ),
  -- The shops themselves. Grouped by shop_id, not store_name: two different
  -- shops can carry the same display name. Same two-phase shape as kw.
  toko_rank as (
    select shop_id,
           count(distinct item_id)::int         as n_item,
           coalesce(sum(total_sold), 0)::bigint as terjual_total
    from src
    group by shop_id
    order by 3 desc
    limit 10
  ),
  -- Aliased `shop`, not `toko`: the CTE also has a COLUMN named toko, and
  -- to_jsonb(toko) then resolves to the column, shipping an array of bare
  -- store-name strings instead of the rows.
  shop as (
    select max(s.store_name)                          as toko,
           r.n_item                                   as n_item,
           r.terjual_total                            as terjual_total,
           mode() within group (order by s.keyword)   as pasar_utama,
           mode() within group (order by s.location)  as lokasi
    from toko_rank r join src s on s.shop_id = r.shop_id
    group by r.shop_id, r.n_item, r.terjual_total
  )
  select t.n_toko, t.n_item, t.n_pasar, t.terjual,
         coalesce((select jsonb_agg(to_jsonb(kw) order by kw.terjual_total desc, kw.n_item desc) from kw), '[]'::jsonb),
         coalesce((select jsonb_agg(to_jsonb(kat) order by kat.n_item desc) from kat), '[]'::jsonb),
         coalesce((select jsonb_agg(to_jsonb(shop) order by shop.terjual_total desc) from shop), '[]'::jsonb)
    into v_toko, v_item, v_pasar_n, v_sold, v_pasar, v_kat, v_toko_l
  from tot t;

  v_catatan := format(
    'Angka di sini berasal dari %s toko / %s item yang lokasi SELLER-nya %s. ',
    v_toko, v_item, array_to_string(v_locs, ', '))
    || 'Kolom lokasi adalah lokasi PENJUAL, bukan pembeli — jadi ini "apa yang dikirim dari sana", bukan "apa yang dibeli orang sana". '
    || 'omset_bln_perkiraan adalah hasil model (nowcast), bukan angka terukur — sebut sebagai perkiraan. '
    || case
         when v_toko <= 15 then
           format('Jumlah toko ini KECIL (%s dari ~%s toko yang pernah kami rekam se-Indonesia): perlakukan sebagai contoh, bukan sensus pasar. ', v_toko, v_toko_nas)
           || 'Sebut angka tokonya apa adanya di jawaban, dan jelaskan sekali bahwa sapuan kami nasional per kata kunci sehingga toko kecil di kota ini bisa saja belum terekam.'
         else
           'Jumlah toko cukup untuk dibaca sebagai pola kota, tapi tetap sebut angkanya.'
       end;

  return jsonb_build_object(
    'kota', p_kota,
    'cocok', v_cocok,
    'kota_cocok', to_jsonb(v_locs),
    'n_toko', v_toko,
    'n_item', v_item,
    'n_pasar', v_pasar_n,
    'terjual_total', v_sold,
    'n_toko_nasional', v_toko_nas,
    'pasar', v_pasar,
    'kategori', v_kat,
    'toko', v_toko_l,
    'catatan', v_catatan
  );
end; $$;

grant execute on function public.norm_loc(text) to anon, authenticated;
grant execute on function public.pasar_kota(text, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Wire the new matview into the daily refresh chain.
-- ---------------------------------------------------------------------------
-- It reads listings_deduped, so it must run after that is rebuilt. Appended
-- rather than reordered: everything above it already depends on that order.

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
  -- Seller-location rollup for pasar_kota.
  refresh materialized view public.mv_seller_locations;
  perform public.rebuild_keyword_subgroups();
end; $$;

commit;
