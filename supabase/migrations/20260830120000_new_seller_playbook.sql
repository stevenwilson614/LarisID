-- Rencana Jualan — the new-seller playbook data layer.
--
-- Answers three questions the existing matviews cannot:
--   1. In THIS market, what did other NEW shops do — price, and did it work?
--   2. Across all markets, what separates a new shop that wins from one that stalls?
--   3. How long does 1 -> 10 -> 100 units actually take?
--
-- Plan: ~/.claude/plans/im-starting-a-new-wild-blossom.md
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20260830120000_new_seller_playbook.sql
--
-- THREE MEASUREMENT RULES ARE BAKED IN HERE, NOT LEFT TO THE CALLER
-- -----------------------------------------------------------------
-- R1. SHOP AGE IS A LOWER BOUND. We have no shop-creation date. `first_listing_date`
--     is min(listing_date) over the listings WE happened to scrape, so a shop is at
--     least that old and may be older. Every consumer must render it as a perkiraan.
--
-- R2. OBSERVATION BIAS IS REAL. Winners rank higher, so they get scraped more often,
--     so they mechanically accrue more price-changes and more reviews. Measured on
--     this corpus: at 2 observations 1.9% of items had ever changed price and 7.9%
--     reached 100 units; at 6 observations it is 41.9% and 26.0%. Comparing raw
--     shares across outcome bands would therefore "discover" that winners change
--     price -- an artifact of how often we looked at them.
--
--     So mv_new_shop_traits is keyed BY obs_bucket and must only ever be read within
--     a bucket. The price-movement signal survives that control (10.8% -> 25.1% at
--     3 obs, 18.9% -> 35.9% at 6), which is why it is worth showing at all. Any trait
--     added here later must clear the same bar before it reaches a student.
--
-- R3. DAYS-TO-N IS CENSORED BEFORE 2026-04-15. Scraping began 2026-04-08; an item
--     listed before that may have crossed 100 units while we were not watching, which
--     would score as an implausibly fast climb. mv_new_shop_speed therefore counts
--     only items born on or after 2026-04-15 (~137k of them -- no shortage).

begin;

-- ---------------------------------------------------------------------------
-- 1. mv_shop_cohort -- shop age, the join key everything else needs.
-- ---------------------------------------------------------------------------
-- Built from listings_deduped rather than raw listings: listing_date is a property
-- of the item, so the deduped view carries every distinct item at ~1/3 the rows.

drop materialized view if exists public.mv_shop_cohort cascade;

create materialized view public.mv_shop_cohort as
with per_item as (
  select distinct on (item_id, shop_id)
         item_id, shop_id, listing_date, total_sold, location, category, price
  from public.listings_deduped
  where shop_id is not null
    and is_offtopic = false
  order by item_id, shop_id, scraped_at desc
)
select
  i.shop_id,
  min(i.listing_date)                                          as first_listing_date,
  max(i.listing_date)                                          as last_listing_date,
  -- R1: a lower bound on shop age, never an origin date.
  (current_date - min(i.listing_date)::date)                   as shop_age_days_min,
  case
    when min(i.listing_date) >= (current_date - 180) then 'baru'
    when min(i.listing_date) >= (current_date - 540) then 'menengah'
    else 'lama'
  end                                                          as age_band,
  count(*)::integer                                            as n_listings,
  coalesce(sum(i.total_sold), 0)::bigint                       as total_sold,
  percentile_cont(0.5) within group (order by i.price)::numeric(18,2) as median_price,
  mode() within group (order by i.location)                    as location,
  mode() within group (order by coalesce(cm.canonical, i.category)) as canonical_category,
  now()                                                        as refreshed_at
from per_item i
left join public.category_map cm on cm.raw_category = i.category
group by i.shop_id;

create unique index mv_shop_cohort_pk on public.mv_shop_cohort (shop_id);
create index mv_shop_cohort_band on public.mv_shop_cohort (age_band);
create index mv_shop_cohort_first on public.mv_shop_cohort (first_listing_date);

comment on materialized view public.mv_shop_cohort is
  'Shop age cohort. first_listing_date is min(listing_date) over SCRAPED listings only -- '
  'a LOWER bound on shop age (R1), never a shop-creation date. Render as perkiraan.';

-- ---------------------------------------------------------------------------
-- 2. mv_new_seller_market -- per keyword: what new shops did vs established ones.
-- ---------------------------------------------------------------------------
-- The "what other new stores did pricing-wise" table. One row per
-- (keyword, segment) so a market's new-seller price band sits next to the
-- incumbent one and the gap is a subtraction, not a second query.

drop materialized view if exists public.mv_new_seller_market cascade;

create materialized view public.mv_new_seller_market as
with per_item as (
  select distinct on (d.item_id, d.shop_id, d.keyword)
         d.keyword, d.item_id, d.shop_id, d.price, d.total_sold,
         d.location, d.listing_date, d.rating, d.reviews, d.category
  from public.listings_deduped d
  where d.shop_id is not null
    and d.is_offtopic = false          -- mandatory on every listings_deduped read
    and d.keyword is not null
  order by d.item_id, d.shop_id, d.keyword, d.scraped_at desc
)
select
  i.keyword,
  case when c.age_band = 'baru' then 'toko_baru' else 'toko_lama' end as segment,
  count(*)::integer                                                as n_listings,
  count(distinct i.shop_id)::integer                               as n_shops,
  percentile_cont(0.25) within group (order by i.price)::numeric(18,2) as price_p25,
  percentile_cont(0.50) within group (order by i.price)::numeric(18,2) as price_median,
  percentile_cont(0.75) within group (order by i.price)::numeric(18,2) as price_p75,
  round(avg(i.total_sold)::numeric, 1)                             as avg_sold,
  percentile_cont(0.50) within group (order by i.total_sold)::numeric(12,1) as median_sold,
  count(*) filter (where i.total_sold >= 10)::integer              as n_reached_10,
  count(*) filter (where i.total_sold >= 100)::integer             as n_reached_100,
  round(100.0 * count(*) filter (where i.total_sold >= 10) / nullif(count(*), 0), 1)  as pct_reached_10,
  round(100.0 * count(*) filter (where i.total_sold >= 100) / nullif(count(*), 0), 1) as pct_reached_100,
  percentile_cont(0.50) within group (order by (current_date - i.listing_date::date))::int as median_age_days,
  round(avg(i.rating)::numeric, 2)                                 as avg_rating,
  mode() within group (order by i.location)                        as top_location,
  now()                                                            as refreshed_at
from per_item i
join public.mv_shop_cohort c on c.shop_id = i.shop_id
group by i.keyword, 2;

create unique index mv_new_seller_market_pk on public.mv_new_seller_market (keyword, segment);
create index mv_new_seller_market_kw on public.mv_new_seller_market (keyword);

comment on materialized view public.mv_new_seller_market is
  'Per keyword: new-shop vs established-shop price band and hit rate. Small n is common -- '
  'callers must fall back to category level below n_listings 30 (pemain_baru_pasar does).';

commit;


begin;

-- ---------------------------------------------------------------------------
-- 3. mv_new_shop_items -- the study base. ONE pass over listings; 4 and 5 derive.
-- ---------------------------------------------------------------------------
-- Population: items BORN on or after 2026-04-15 (R3) belonging to shops first seen
-- in 2026 (R1). ~81k listings with a full outcome spread -- 36k that never sold sit
-- alongside 9k that passed 100 units, so failure is measured, not inferred from the
-- winners' absence.
--
-- Traits and speed both need each item's whole scrape history. Materialising that
-- collapse once turns three seq scans of a 2.8M-row table into one.

drop materialized view if exists public.mv_new_shop_items cascade;

create materialized view public.mv_new_shop_items as
with study_items as (
  select distinct on (d.item_id)
         d.item_id, d.shop_id, d.listing_date,
         coalesce(cm.canonical, d.category) as canonical_category
  from public.listings_deduped d
  join public.mv_shop_cohort c on c.shop_id = d.shop_id
  left join public.category_map cm on cm.raw_category = d.category
  where d.is_offtopic = false                    -- mandatory on listings_deduped
    and d.listing_date >= date '2026-04-15'      -- R3
    and c.first_listing_date >= date '2026-01-01'
  order by d.item_id, d.scraped_at desc
)
select
  s.item_id,
  s.shop_id,
  s.canonical_category,
  s.listing_date,
  count(*)::int                                              as n_obs,
  max(l.total_sold)                                          as peak_sold,
  min(l.price)                                               as min_price,
  max(l.price)                                               as max_price,
  (max(l.price) > min(l.price))::int                         as price_moved,
  max(case when l.original_price > l.price
           then (l.original_price - l.price) / nullif(l.original_price, 0)
           else 0 end)::numeric                              as max_discount,
  avg(length(l.product_name))::numeric                       as title_len,
  max(l.reviews)                                             as reviews,
  max(l.rating)                                              as rating,
  bool_or(l.is_ad = 1)::int                                  as ever_ad,
  -- Crossings are an UPPER bound: we see >= N at the next scrape, not at the
  -- moment it happened. Paired with R3 that makes them an honest "no faster than".
  extract(epoch from (min(l.scraped_at) filter (where l.total_sold >= 1)
                      - s.listing_date)) / 86400             as days_to_1,
  extract(epoch from (min(l.scraped_at) filter (where l.total_sold >= 10)
                      - s.listing_date)) / 86400             as days_to_10,
  extract(epoch from (min(l.scraped_at) filter (where l.total_sold >= 100)
                      - s.listing_date)) / 86400             as days_to_100,
  now()                                                      as refreshed_at
from study_items s
join public.listings l on l.item_id = s.item_id
group by s.item_id, s.shop_id, s.canonical_category, s.listing_date;

create unique index mv_new_shop_items_pk on public.mv_new_shop_items (item_id);
create index mv_new_shop_items_cat on public.mv_new_shop_items (canonical_category);
create index mv_new_shop_items_obs on public.mv_new_shop_items (n_obs);

comment on materialized view public.mv_new_shop_items is
  'Per-item study base for the new-shop playbook: one row per item born after '
  '2026-04-15 on a shop first seen in 2026, with its full scrape history collapsed.';

-- ---------------------------------------------------------------------------
-- 4. mv_new_shop_traits -- traits by outcome, stratified by observation count.
-- ---------------------------------------------------------------------------

drop materialized view if exists public.mv_new_shop_traits cascade;

create materialized view public.mv_new_shop_traits as
select
  canonical_category,
  case
    when peak_sold >= 100 then 'menang_100plus'
    when peak_sold >= 10  then 'jalan_10_99'
    when peak_sold >= 1   then 'lambat_1_9'
    else 'belum_terjual'
  end                                                        as outcome_band,
  least(n_obs, 8)                                            as obs_bucket,
  count(*)::integer                                          as n_items,
  round(100.0 * avg(price_moved), 1)                         as pct_price_moved,
  round(100.0 * avg(max_discount), 1)                        as avg_max_discount_pct,
  round(avg(title_len), 1)                                   as avg_title_len,
  round(avg(reviews)::numeric, 1)                            as avg_reviews,
  round(avg(rating)::numeric, 2)                             as avg_rating,
  round(100.0 * avg(ever_ad), 1)                             as pct_ever_ad,
  round(avg(min_price)::numeric)                             as avg_min_price,
  now()                                                      as refreshed_at
from public.mv_new_shop_items
group by 1, 2, 3;

create unique index mv_new_shop_traits_pk
  on public.mv_new_shop_traits (canonical_category, outcome_band, obs_bucket);
create index mv_new_shop_traits_cat on public.mv_new_shop_traits (canonical_category);

comment on materialized view public.mv_new_shop_traits is
  'New-shop traits by outcome band, STRATIFIED BY obs_bucket (R2). Summing across '
  'buckets re-creates the observation bias the bucketing exists to remove.';

-- ---------------------------------------------------------------------------
-- 5. mv_new_shop_pricemove -- the headline finding, in its actionable direction.
-- ---------------------------------------------------------------------------
-- mv_new_shop_traits answers "given a winner, did it move price?". A student needs
-- the flip: "given I move price, how much better do I do?". Same rows, grouped the
-- other way, still inside an obs bucket so the comparison stays honest.
--
-- Measured on the corpus at build time: within every bucket, items whose price ever
-- moved reached 100 units at roughly twice the rate of items whose price never did
-- (3 obs: 10.8% vs 25.1%; 6 obs: 18.9% vs 35.9%). It is a correlation, not a lever
-- -- see the report in docs/riset-toko-baru.md.

drop materialized view if exists public.mv_new_shop_pricemove cascade;

create materialized view public.mv_new_shop_pricemove as
select
  canonical_category,
  least(n_obs, 8)                                                       as obs_bucket,
  price_moved,
  count(*)::integer                                                     as n_items,
  round(100.0 * avg((peak_sold >= 10)::int), 1)                         as pct_reached_10,
  round(100.0 * avg((peak_sold >= 100)::int), 1)                        as pct_reached_100,
  round(avg(max_discount) * 100, 1)                                     as avg_max_discount_pct,
  now()                                                                 as refreshed_at
from public.mv_new_shop_items
group by 1, 2, 3;

create unique index mv_new_shop_pricemove_pk
  on public.mv_new_shop_pricemove (canonical_category, obs_bucket, price_moved);

comment on materialized view public.mv_new_shop_pricemove is
  'Hit rate given whether the price ever moved, within an observation bucket (R2). '
  'The actionable direction of the headline finding.';

-- ---------------------------------------------------------------------------
-- 6. mv_new_shop_speed -- how long 1 -> 10 -> 100 units actually takes.
-- ---------------------------------------------------------------------------

drop materialized view if exists public.mv_new_shop_speed cascade;

create materialized view public.mv_new_shop_speed as
select
  canonical_category,
  count(*)::integer                                                  as n_items,
  count(days_to_1)::integer                                          as n_reached_1,
  count(days_to_10)::integer                                         as n_reached_10,
  count(days_to_100)::integer                                        as n_reached_100,
  round(100.0 * count(days_to_100) / nullif(count(*), 0), 1)         as pct_reached_100,
  percentile_cont(0.5) within group (order by days_to_1)::numeric(8,1)   as med_days_to_1,
  percentile_cont(0.5) within group (order by days_to_10)::numeric(8,1)  as med_days_to_10,
  percentile_cont(0.5) within group (order by days_to_100)::numeric(8,1) as med_days_to_100,
  -- The fast tail: "quickest 1 -> 100" as a realistic best case, not the median.
  percentile_cont(0.1) within group (order by days_to_100)::numeric(8,1) as p10_days_to_100,
  now()                                                              as refreshed_at
from public.mv_new_shop_items
group by 1;

create unique index mv_new_shop_speed_pk on public.mv_new_shop_speed (canonical_category);

comment on materialized view public.mv_new_shop_speed is
  'Days from listing_date to first OBSERVED crossing of 1/10/100 units, new shops only. '
  'An upper bound -- the crossing is seen at the next scrape, not when it happened.';

commit;

begin;

-- ---------------------------------------------------------------------------
-- 7. RPCs -- the read surface the AI tools call.
-- ---------------------------------------------------------------------------
-- These aggregate over millions of rows, which is why they are RPCs and not
-- PostgREST filters. None reads auth.uid(), so the frontend's detached-session
-- trap (_supabase.rpc() sends the anon key, so auth.uid() is null) cannot bite.
--
-- Granted to anon+authenticated: market analytics, no PII. The cohort gate for
-- Rencana Jualan sits in the UI, so widening the audience later needs no migration.

-- 7a. pemain_baru_pasar -- what NEW shops did in one market, with category fallback.

create or replace function public.pemain_baru_pasar(p_keyword text, p_kota text default '')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kw    text := btrim(coalesce(p_keyword, ''));
  v_kota  text := btrim(coalesce(p_kota, ''));
  v_cat   text;
  v_baru  record;
  v_lama  record;
  v_level text := 'pasar';
  v_kota_n int := 0;
  v_lokasi jsonb;
begin
  if v_kw = '' then
    return jsonb_build_object('error', 'keyword wajib diisi');
  end if;

  select coalesce(t.category_canonical, t.category) into v_cat
  from public.product_types_v t
  where t.keyword = v_kw and t.city = 'ALL'
  limit 1;

  select m.n_listings, m.n_shops, m.price_p25, m.price_median, m.price_p75,
         m.pct_reached_10, m.pct_reached_100, m.median_age_days
    into v_baru
  from public.mv_new_seller_market m
  where m.keyword = v_kw and m.segment = 'toko_baru';

  select m.n_listings, m.n_shops, m.price_p25, m.price_median, m.price_p75,
         m.pct_reached_10, m.pct_reached_100, m.median_age_days
    into v_lama
  from public.mv_new_seller_market m
  where m.keyword = v_kw and m.segment = 'toko_lama';

  -- Below 30 new-shop listings a median is a coin flip wearing a number's clothes.
  -- Fall back to the category and SAY SO, rather than quietly serving noise.
  if v_baru.n_listings is null or v_baru.n_listings < 30 then
    if v_cat is not null then
      v_level := 'kategori';
      -- Aliases are load-bearing: SELECT INTO a record names the fields from the
      -- output column names, so an unaliased sum()/round() list would silently
      -- reshape v_baru and every v_baru.n_listings below would fail at runtime.
      select
        sum(m.n_listings)::int             as n_listings,
        sum(m.n_shops)::int                as n_shops,
        round(avg(m.price_p25))            as price_p25,
        round(avg(m.price_median))         as price_median,
        round(avg(m.price_p75))            as price_p75,
        round(avg(m.pct_reached_10), 1)    as pct_reached_10,
        round(avg(m.pct_reached_100), 1)   as pct_reached_100,
        round(avg(m.median_age_days))      as median_age_days
      into v_baru
      from public.mv_new_seller_market m
      join public.product_types_v t on t.keyword = m.keyword and t.city = 'ALL'
      where m.segment = 'toko_baru'
        and coalesce(t.category_canonical, t.category) = v_cat;

      -- BOTH sides must move to the category together. Leaving toko_lama at the
      -- market level would put a category median next to a market median and call
      -- the gap between them a new-seller discount -- on 'kacang telur' that reads
      -- as new shops pricing 94% ABOVE incumbents, which is an artifact, not a fact.
      select
        sum(m.n_listings)::int             as n_listings,
        sum(m.n_shops)::int                as n_shops,
        round(avg(m.price_p25))            as price_p25,
        round(avg(m.price_median))         as price_median,
        round(avg(m.price_p75))            as price_p75,
        round(avg(m.pct_reached_10), 1)    as pct_reached_10,
        round(avg(m.pct_reached_100), 1)   as pct_reached_100,
        round(avg(m.median_age_days))      as median_age_days
      into v_lama
      from public.mv_new_seller_market m
      join public.product_types_v t on t.keyword = m.keyword and t.city = 'ALL'
      where m.segment = 'toko_lama'
        and coalesce(t.category_canonical, t.category) = v_cat;
    else
      v_level := 'tidak_cukup_data';
    end if;
  end if;

  -- The student's own city is context, not a filter: slicing an already-small
  -- new-seller set by city would leave nothing to reason from. Report how many
  -- new sellers share their city and let the answer weigh it.
  if v_kota <> '' then
    select count(*)::int into v_kota_n
    from public.listings_deduped d
    join public.mv_shop_cohort c on c.shop_id = d.shop_id
    where d.keyword = v_kw and d.is_offtopic = false and c.age_band = 'baru'
      and d.location ilike v_kota;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('lokasi', lokasi, 'n', n)), '[]'::jsonb)
    into v_lokasi
  from (
    select d.location as lokasi, count(*) as n
    from public.listings_deduped d
    join public.mv_shop_cohort c on c.shop_id = d.shop_id
    where d.keyword = v_kw and d.is_offtopic = false and c.age_band = 'baru'
      and d.location is not null
    group by d.location order by count(*) desc limit 8
  ) s;

  return jsonb_build_object(
    'pasar', v_kw,
    'kategori', v_cat,
    -- The caller MUST surface this: 'kategori' means these numbers are not this
    -- market's, they are its category's.
    'level', v_level,
    'catatan_level', case v_level
      when 'kategori' then 'Toko baru di pasar ini kurang dari 30 listing, jadi angka di bawah adalah rata-rata KATEGORI, bukan pasar ini sendiri.'
      when 'tidak_cukup_data' then 'Belum ada cukup toko baru di pasar ini untuk disimpulkan.'
      else 'Angka di bawah dari pasar ini sendiri.' end,
    'toko_baru', case when v_baru.n_listings is null then null else jsonb_build_object(
      'n_listing', v_baru.n_listings, 'n_toko', v_baru.n_shops,
      'harga_p25', v_baru.price_p25, 'harga_median', v_baru.price_median,
      'harga_p75', v_baru.price_p75,
      'pct_tembus_10', v_baru.pct_reached_10, 'pct_tembus_100', v_baru.pct_reached_100,
      'umur_listing_median_hari', v_baru.median_age_days) end,
    'toko_lama', case when v_lama.n_listings is null then null else jsonb_build_object(
      'n_listing', v_lama.n_listings, 'n_toko', v_lama.n_shops,
      'harga_p25', v_lama.price_p25, 'harga_median', v_lama.price_median,
      'harga_p75', v_lama.price_p75,
      'pct_tembus_10', v_lama.pct_reached_10, 'pct_tembus_100', v_lama.pct_reached_100) end,
    'selisih_harga_pct', case
      when v_baru.price_median is null or coalesce(v_lama.price_median, 0) = 0 then null
      else round(100.0 * (v_baru.price_median - v_lama.price_median) / v_lama.price_median, 1) end,
    'kota_user', nullif(v_kota, ''),
    'n_toko_baru_di_kota', v_kota_n,
    'lokasi_toko_baru', v_lokasi,
    'umur_toko_catatan', 'Umur toko adalah perkiraan minimum, dihitung dari listing tertua yang kami scrape -- bukan tanggal toko dibuka.'
  );
end;
$$;

comment on function public.pemain_baru_pasar(text, text) is
  'New-shop pricing and hit rate for one market. Falls back to the category below 30 '
  'new-shop listings and reports which level it used in `level`.';

grant execute on function public.pemain_baru_pasar(text, text) to anon, authenticated;

commit;

begin;

-- 7b. pola_toko_baru -- the cross-market study for one category.
--
-- Returns the price-movement comparison, the trait table, and the speed figures in
-- ONE call. The agent loop pays a round trip per tool call, and these three are
-- never useful apart -- speed without the caveat that the crossing is an upper
-- bound is a number a beginner will plan against too optimistically.
--
-- p_kategori null = all categories pooled.

create or replace function public.pola_toko_baru(p_kategori text default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cat   text := nullif(btrim(coalesce(p_kategori, '')), '');
  v_n     int;
  v_level text;
  v_move  jsonb;
  v_trait jsonb;
  v_speed jsonb;
  v_bucket int;
begin
  select count(*) into v_n from public.mv_new_shop_items
   where v_cat is null or canonical_category = v_cat;

  -- Under 500 items a category split says more about our scrape coverage than
  -- about sellers. Pool instead, and say which one the numbers came from.
  if v_cat is not null and v_n < 500 then
    v_cat := null;
    v_level := 'semua_kategori';
    select count(*) into v_n from public.mv_new_shop_items;
  else
    v_level := case when v_cat is null then 'semua_kategori' else 'kategori' end;
  end if;

  -- R2: every comparison below lives INSIDE an observation bucket. Buckets 3-6
  -- carry the bulk of the items; 2 is dominated by items we saw twice and know
  -- almost nothing about.
  select coalesce(jsonb_agg(x order by (x->>'obs')::int), '[]'::jsonb) into v_move
  from (
    select jsonb_build_object(
      'obs', obs_bucket,
      'n_harga_diam',   sum(n_items) filter (where price_moved = 0),
      'pct_tembus_100_harga_diam', max(pct_reached_100) filter (where price_moved = 0),
      'n_harga_bergerak', sum(n_items) filter (where price_moved = 1),
      'pct_tembus_100_harga_bergerak', max(pct_reached_100) filter (where price_moved = 1)
    ) as x
    from public.mv_new_shop_pricemove
    where (v_cat is null or canonical_category = v_cat)
      and obs_bucket between 3 and 6
    group by obs_bucket
  ) s;

  -- The trait table is reported at the single most populated bucket rather than
  -- averaged across them, because averaging across buckets is exactly the mistake
  -- the bucketing prevents.
  select obs_bucket into v_bucket
  from public.mv_new_shop_traits
  where (v_cat is null or canonical_category = v_cat) and obs_bucket between 3 and 8
  group by obs_bucket order by sum(n_items) desc limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
           'hasil', outcome_band,
           'n', n_items,
           'pct_harga_pernah_berubah', pct_price_moved,
           'diskon_terdalam_pct', avg_max_discount_pct,
           'panjang_judul', avg_title_len,
           'ulasan', avg_reviews,
           'rating', avg_rating,
           'pct_pernah_iklan', pct_ever_ad)
         order by n_items desc), '[]'::jsonb) into v_trait
  from (
    select outcome_band,
           sum(n_items)::int                                     as n_items,
           round(sum(pct_price_moved * n_items) / nullif(sum(n_items), 0), 1)      as pct_price_moved,
           round(sum(avg_max_discount_pct * n_items) / nullif(sum(n_items), 0), 1) as avg_max_discount_pct,
           round(sum(avg_title_len * n_items) / nullif(sum(n_items), 0), 1)        as avg_title_len,
           round(sum(avg_reviews * n_items) / nullif(sum(n_items), 0), 1)          as avg_reviews,
           round(sum(avg_rating * n_items) / nullif(sum(n_items), 0), 2)           as avg_rating,
           round(sum(pct_ever_ad * n_items) / nullif(sum(n_items), 0), 1)          as pct_ever_ad
    from public.mv_new_shop_traits
    where (v_cat is null or canonical_category = v_cat) and obs_bucket = v_bucket
    group by outcome_band
  ) t;

  -- Percentiles are computed over the ITEMS, not averaged across the per-category
  -- rows of mv_new_shop_speed. Averaging medians is not a median: pooled it gives
  -- 68.8 days to 100 units, the average-of-medians gives 70.7, and the report and
  -- the model would quote different numbers for the same thing.
  select jsonb_build_object(
    'n_item', count(*),
    'n_tembus_1', count(days_to_1),
    'n_tembus_10', count(days_to_10),
    'n_tembus_100', count(days_to_100),
    'pct_tembus_100', round(100.0 * count(days_to_100) / nullif(count(*), 0), 1),
    'median_hari_ke_1', round(percentile_cont(0.5) within group (order by days_to_1)::numeric, 1),
    'median_hari_ke_10', round(percentile_cont(0.5) within group (order by days_to_10)::numeric, 1),
    'median_hari_ke_100', round(percentile_cont(0.5) within group (order by days_to_100)::numeric, 1),
    'tercepat_10pct_hari_ke_100', round(percentile_cont(0.1) within group (order by days_to_100)::numeric, 1)
  ) into v_speed
  from public.mv_new_shop_items
  where v_cat is null or canonical_category = v_cat;

  return jsonb_build_object(
    'kategori', coalesce(v_cat, 'semua'),
    'level', v_level,
    'n_item_studi', v_n,
    'obs_bucket_dipakai', v_bucket,
    'harga_bergerak', v_move,
    'sifat_per_hasil', v_trait,
    'kecepatan', v_speed,
    'catatan', jsonb_build_array(
      'Semua perbandingan di sini dibaca DI DALAM satu obs_bucket (berapa kali listing itu kami amati). Listing yang laris muncul lebih sering di hasil pencarian, jadi ia otomatis terlihat lebih sering berubah harga -- membandingkan lintas bucket akan menemukan pola palsu.',
      'Harga bergerak berkorelasi dengan hasil, BUKAN terbukti menyebabkannya. Menurunkan harga tanpa hitung margin bisa merugikan.',
      'Panjang judul praktis sama di semua kelompok hasil -- jangan sarankan judul panjang atau pendek atas dasar data ini.',
      'Hari-ke-N adalah batas ATAS: kami melihat angka terjual saat scrape berikutnya, bukan saat penjualan terjadi.',
      'Hanya listing yang lahir setelah 2026-04-15 dihitung, supaya kenaikan yang terjadi sebelum kami mengamati tidak salah terbaca sebagai lonjakan cepat.'
    )
  );
end;
$$;

comment on function public.pola_toko_baru(text) is
  'New-shop success/failure study for one category: price-movement comparison, trait '
  'table and speed. All comparisons are within an observation bucket (R2).';

grant execute on function public.pola_toko_baru(text) to anon, authenticated;

commit;

begin;

-- 7c. judul_menang -- which words appear in titles that sell, in ONE market.
--
-- Title RECS have to come from what actually ranks in this market, not from the
-- model's priors about good copy. So we split the market's listings at 10 units and
-- report the tokens whose share differs most between the two halves.
--
-- Deliberately reports `lift` (winner share minus rest share) rather than raw
-- frequency: "kacang" appears in every title in the kacang market and tells nobody
-- anything. Note that title LENGTH is not a differentiator anywhere in this corpus
-- (see pola_toko_baru's catatan) -- only word choice is worth advising on.

create or replace function public.judul_menang(p_keyword text, p_limit int default 15)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_kw text := btrim(coalesce(p_keyword, ''));
  v_lim int := least(greatest(coalesce(p_limit, 15), 5), 30);
  v_win int; v_rest int;
  v_tokens jsonb; v_examples jsonb;
  -- Function words plus the marketplace filler that appears everywhere and
  -- separates nothing.
  v_stop text[] := array[
    'dan','untuk','yang','dengan','atau','dari','pada','ini','itu','bisa','buat',
    'the','and','for','with','pcs','pack','isi','free','gratis','promo','murah',
    'termurah','terbaru','terlaris','best','seller','ready','stock','stok','new'];
begin
  if v_kw = '' then
    return jsonb_build_object('error', 'keyword wajib diisi');
  end if;

  with base as (
    select distinct on (d.item_id)
           d.item_id, d.product_name, d.total_sold, d.price, d.store_name
    from public.listings_deduped d
    where d.keyword = v_kw
      and d.is_offtopic = false          -- mandatory on every listings_deduped read
      and d.product_name is not null
    order by d.item_id, d.scraped_at desc
  ),
  split as (
    select item_id, product_name, total_sold, price, store_name,
           (total_sold >= 10) as is_win
    from base
  ),
  toks as (
    select distinct s.item_id, s.is_win, t.tok
    from split s,
         lateral regexp_split_to_table(lower(s.product_name), '[^a-z0-9]+') as t(tok)
    where length(t.tok) >= 3
      and not (t.tok = any (v_stop))
  ),
  counts as (
    select tok,
           count(*) filter (where is_win)     as n_win,
           count(*) filter (where not is_win) as n_rest
    from toks group by tok
  ),
  totals as (
    select count(*) filter (where is_win) as w, count(*) filter (where not is_win) as r
    from split
  )
  select
    (select w from totals), (select r from totals),
    coalesce((
      select jsonb_agg(x order by (x->>'lift')::numeric desc)
      from (
        select jsonb_build_object(
                 'kata', c.tok,
                 'pct_di_laris', round(100.0 * c.n_win / nullif(t.w, 0), 1),
                 'pct_di_sepi',  round(100.0 * c.n_rest / nullif(t.r, 0), 1),
                 'lift', round(100.0 * c.n_win / nullif(t.w, 0)
                             - 100.0 * c.n_rest / nullif(t.r, 0), 1)) as x
        from counts c cross join totals t
        -- A token seen in under 3 winning titles is an anecdote, not a pattern.
        where c.n_win >= 3 and t.w > 0 and t.r > 0
        order by (100.0 * c.n_win / nullif(t.w, 0) - 100.0 * c.n_rest / nullif(t.r, 0)) desc
        limit v_lim
      ) s
    ), '[]'::jsonb)
  into v_win, v_rest, v_tokens;

  -- The LIMIT has to live inside the subquery. Outside it applies to the
  -- single aggregate row and jsonb_agg happily packs every winning listing in
  -- the market -- measured at 107KB for one busy keyword, which would blow the
  -- tool payload before the model ever saw it.
  select coalesce(jsonb_agg(jsonb_build_object(
           'judul', product_name, 'terjual', total_sold,
           'harga', round(price::numeric), 'toko', store_name) order by total_sold desc), '[]'::jsonb)
  into v_examples
  from (
    select product_name, total_sold, price, store_name
    from (
      select distinct on (d.item_id) d.item_id, d.product_name, d.total_sold, d.price, d.store_name
      from public.listings_deduped d
      where d.keyword = v_kw and d.is_offtopic = false and d.total_sold >= 10
      order by d.item_id, d.scraped_at desc
    ) dedup
    order by total_sold desc
    limit 8
  ) e;

  return jsonb_build_object(
    'pasar', v_kw,
    'n_laris', v_win,
    'n_sepi', v_rest,
    'kata_pembeda', v_tokens,
    'contoh_judul_laris', v_examples,
    -- Both halves have to be big enough. With 19 stalled listings a 5.3% share is
    -- literally one title, and a lift computed against it is noise wearing a decimal.
    'catatan', case
      when coalesce(v_win, 0) < 10 then 'Kurang dari 10 listing laris di pasar ini -- kata pembeda di bawah lemah, pakai sebagai petunjuk saja.'
      when coalesce(v_rest, 0) < 20 then 'Pembanding listing sepi di pasar ini sedikit (' || coalesce(v_rest, 0) || '), jadi angka lift kasar. Pakai daftar kata sebagai petunjuk, jangan sebagai ukuran.'
      else 'Kata pembeda dihitung dari selisih porsi kata di listing laris (>=10 terjual) dan listing sepi. Korelasi, bukan resep.' end
  );
end;
$$;

comment on function public.judul_menang(text, int) is
  'Title tokens that separate selling listings from stalled ones in one market. '
  'Reports lift over the market baseline, not raw frequency.';

grant execute on function public.judul_menang(text, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Wire the new matviews into the existing daily refresh chain.
-- ---------------------------------------------------------------------------
-- daily_scrape.sh -> refresh_matviews.sh -> this function. Order matters:
-- mv_shop_cohort feeds mv_new_seller_market and mv_new_shop_items, which in turn
-- feed traits/pricemove/speed. All of them read listings_deduped, so they must run
-- after it is rebuilt.

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
  perform public.rebuild_keyword_subgroups();
end; $$;

-- Self-hosted re-grants anon on default privileges, so state the read grants
-- explicitly rather than relying on what the matviews inherited.
grant select on public.mv_shop_cohort, public.mv_new_seller_market,
                public.mv_new_shop_items, public.mv_new_shop_traits,
                public.mv_new_shop_pricemove, public.mv_new_shop_speed
  to anon, authenticated;

commit;

notify pgrst, 'reload schema';
