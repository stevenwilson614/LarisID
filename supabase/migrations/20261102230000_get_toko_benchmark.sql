-- One read for the connected My Toko benchmark.
--
-- Own listings: latest row per item (cap 200) plus product_velocity.
-- Markets: up to 25 keywords. For each keyword, one pass over rows that have
-- search_rank (a keyword-search hit, not a shop-page observation). The cohort
-- is that keyword's latest scrape, kept in a 6-hour window — the same window
-- as listings_fresh_for_keyword. Index scans are turned off for that pass so
-- the planner uses the keyword bitmap instead of walking listings by time.
--
-- Omzet is product_velocity only. Null means we have no nowcast.

create or replace function public.get_toko_benchmark(
  p_shop_id bigint,
  p_extra_keywords text[] default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
set statement_timeout = '15s'
as $$
declare
  v_shop jsonb;
  v_listings jsonb := '[]'::jsonb;
  v_markets jsonb := '[]'::jsonb;
  v_rivals jsonb := '[]'::jsonb;
  v_kws text[];
  v_kw text;
  v_one jsonb;
  v_map jsonb := '{}'::jsonb;
  v_peers jsonb;
  v_peer jsonb;
  v_out jsonb;
  v_i int;
  v_j int;
  v_key text;
begin
  if p_shop_id is null then
    return jsonb_build_object('ok', false, 'reason', 'shop');
  end if;

  with shop_top as (
    select *
    from (
      select distinct on (l.item_id)
        l.item_id,
        l.product_name::text as product_name,
        l.price,
        l.total_sold,
        l.rating,
        l.reviews,
        l.image_url::text as image_url,
        l.category::text as category,
        nullif(l.keyword, '') as keyword,
        l.listing_date,
        l.store_name::text as store_name,
        l.location::text as location
      from listings l
      where l.shop_id = p_shop_id
      order by l.item_id, l.scraped_at desc
    ) d
    order by total_sold desc nulls last
    limit 200
  ),
  shop_items as (
    select
      t.*,
      pv.omset_monthly as nowcast_omset_monthly,
      pv.method as nowcast_method,
      pv.v_daily as nowcast_velocity_daily
    from shop_top t
    left join product_velocity pv
      on pv.item_id = t.item_id
     and pv.shop_id = p_shop_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'item_id', item_id,
    'product_name', product_name,
    'price', price,
    'total_sold', total_sold,
    'rating', rating,
    'reviews', reviews,
    'image_url', image_url,
    'category', category,
    'keyword', keyword,
    'listing_date', listing_date,
    'nowcast_omset_monthly', nowcast_omset_monthly,
    'nowcast_method', nowcast_method,
    'nowcast_velocity_daily', nowcast_velocity_daily
  ) order by total_sold desc nulls last), '[]'::jsonb)
  into v_listings
  from shop_items;

  select jsonb_build_object(
    'shop_id', p_shop_id,
    'store_name', ms.store_name,
    'location', ms.location,
    'n_listings', ms.n_listings,
    'oldest_listing_date', (
      select min((x->>'listing_date')::timestamptz)
      from jsonb_array_elements(v_listings) x
      where x->>'listing_date' is not null
    )
  )
  into v_shop
  from mv_shops ms
  where ms.shop_id = p_shop_id;

  if v_shop is null then
    v_shop := jsonb_build_object('shop_id', p_shop_id);
  end if;

  select coalesce(array_agg(keyword order by src, pri desc nulls last), '{}')
  into v_kws
  from (
    select keyword, pri, src
    from (
      select distinct on (keyword) keyword, pri, src
      from (
        select
          x->>'keyword' as keyword,
          max((x->>'total_sold')::bigint) as pri,
          0 as src
        from jsonb_array_elements(v_listings) x
        where coalesce(btrim(x->>'keyword'), '') <> ''
        group by x->>'keyword'
        union all
        select btrim(k), 0::bigint, 1
        from unnest(coalesce(p_extra_keywords, '{}'::text[])) k
        where btrim(coalesce(k, '')) <> ''
      ) srcs
      where coalesce(keyword, '') <> ''
      order by keyword, src, pri desc nulls last
    ) deduped
    order by src, pri desc nulls last
    limit 25
  ) capped;

  -- Keyword bitmap, not a backward scan of every scrape by time.
  perform set_config('enable_indexscan', 'off', true);

  begin
    foreach v_kw in array v_kws loop
      with rows as (
        select
          l.item_id,
          l.shop_id,
          l.store_name::text as store_name,
          l.product_name::text as product_name,
          l.price::numeric as price,
          l.total_sold,
          l.rating,
          l.reviews,
          l.image_url::text as image_url,
          l.location::text as location,
          l.scraped_at,
          max(l.scraped_at) over () as ts
        from listings l
        where l.keyword = v_kw
          and l.search_rank is not null
      ),
      cohort as (
        select distinct on (item_id, shop_id)
          item_id, shop_id, store_name, product_name, price, total_sold,
          rating, reviews, image_url, location
        from rows
        where scraped_at >= ts - interval '6 hours'
          and coalesce(total_sold, 0) > 0
        order by item_id, shop_id, scraped_at desc
      ),
      ranked as (
        select
          c.*,
          row_number() over (
            order by c.total_sold desc nulls last, c.item_id
          ) as rnk
        from cohort c
      )
      select case when count(*) = 0 then null else jsonb_build_object(
        'keyword', v_kw,
        'median_price', round((percentile_cont(0.5) within group (order by price) filter (where price is not null))::numeric),
        'total_sellers', count(*)::int,
        'peer_count', count(*) filter (where shop_id <> p_shop_id)::int,
        'top3_reviews', round((avg(reviews) filter (where rnk <= 3))::numeric),
        'mine', coalesce((
          select jsonb_agg(jsonb_build_object(
            'item_id', item_id,
            'rank', rnk,
            'price', price,
            'total_sold', total_sold,
            'reviews', reviews,
            'rating', rating
          ) order by rnk)
          from ranked
          where shop_id = p_shop_id
        ), '[]'::jsonb),
        'peers', coalesce((
          select jsonb_agg(jsonb_build_object(
            'shop_id', shop_id,
            'store_name', store_name,
            'item_id', item_id,
            'product_name', product_name,
            'price', price,
            'total_sold', total_sold,
            'rating', rating,
            'reviews', reviews,
            'image_url', image_url,
            'location', location,
            'nowcast_omset_monthly', null,
            'nowcast_method', null
          ) order by rnk)
          from (
            select *
            from (
              select distinct on (shop_id)
                shop_id, store_name, item_id, product_name, price, total_sold,
                rating, reviews, image_url, location, rnk
              from ranked
              where shop_id <> p_shop_id
              order by shop_id, rnk
            ) one_shop
            order by rnk
            limit 6
          ) top_peers
        ), '[]'::jsonb)
      ) end
      into v_one
      from ranked;

      if v_one is not null then
        v_markets := v_markets || jsonb_build_array(v_one);
      end if;
    end loop;
  exception when others then
    perform set_config('enable_indexscan', 'on', true);
    raise;
  end;

  perform set_config('enable_indexscan', 'on', true);

  select coalesce(jsonb_object_agg(
    item_id::text || ':' || shop_id::text,
    jsonb_build_object('omset', omset_monthly, 'method', method)
  ), '{}'::jsonb)
  into v_map
  from product_velocity pv
  where (pv.item_id, pv.shop_id) in (
    select (p->>'item_id')::bigint, (p->>'shop_id')::bigint
    from jsonb_array_elements(v_markets) m
    cross join lateral jsonb_array_elements(coalesce(m->'peers', '[]'::jsonb)) p
    where p->>'item_id' is not null and p->>'shop_id' is not null
  );

  for v_i in 0 .. coalesce(jsonb_array_length(v_markets), 0) - 1 loop
    v_peers := '[]'::jsonb;
    for v_j in 0 .. coalesce(jsonb_array_length(v_markets->v_i->'peers'), 0) - 1 loop
      v_peer := v_markets->v_i->'peers'->v_j;
      v_key := (v_peer->>'item_id') || ':' || (v_peer->>'shop_id');
      if v_map ? v_key then
        v_peer := v_peer || jsonb_build_object(
          'nowcast_omset_monthly', v_map->v_key->'omset',
          'nowcast_method', v_map->v_key->'method'
        );
      end if;
      v_peers := v_peers || jsonb_build_array(v_peer);
    end loop;
    v_markets := jsonb_set(v_markets, array[v_i::text, 'peers'], v_peers);
  end loop;

  with peers as (
    select
      (p->>'shop_id')::bigint as shop_id,
      p->>'store_name' as store_name,
      (p->>'item_id')::bigint as item_id,
      p->>'product_name' as product_name,
      (p->>'price')::numeric as price,
      (p->>'total_sold')::bigint as total_sold,
      (p->>'rating')::numeric as rating,
      (p->>'reviews')::bigint as reviews,
      p->>'image_url' as image_url,
      m->>'keyword' as keyword,
      case
        when p->>'nowcast_omset_monthly' is null or p->>'nowcast_omset_monthly' = 'null'
          then null
        else (p->>'nowcast_omset_monthly')::numeric
      end as omset
    from jsonb_array_elements(v_markets) m
    cross join lateral jsonb_array_elements(coalesce(m->'peers', '[]'::jsonb)) p
  ),
  rival_rank as (
    select
      shop_id,
      count(distinct keyword)::int as overlap,
      max(total_sold) as best_sold,
      case when count(omset) = 0 then null else sum(omset) end as overlap_omzet
    from peers
    group by shop_id
  ),
  featured as (
    select distinct on (shop_id)
      shop_id, item_id, store_name, product_name, price, total_sold, rating,
      reviews, image_url, keyword, omset
    from peers
    order by shop_id, total_sold desc nulls last, item_id
  )
  select coalesce(jsonb_agg(j order by overlap desc, best_sold desc nulls last), '[]'::jsonb)
  into v_rivals
  from (
    select
      r.overlap,
      r.best_sold,
      jsonb_build_object(
        'shop_id', r.shop_id,
        'store_name', coalesce(ms.store_name, f.store_name),
        'location', ms.location,
        'n_listings', ms.n_listings,
        'overlap', r.overlap,
        'overlap_omzet', r.overlap_omzet,
        'featured', jsonb_build_object(
          'item_id', f.item_id,
          'product_name', f.product_name,
          'price', f.price,
          'total_sold', f.total_sold,
          'rating', f.rating,
          'reviews', f.reviews,
          'image_url', f.image_url,
          'keyword', f.keyword,
          'nowcast_omset_monthly', f.omset
        )
      ) as j
    from rival_rank r
    join featured f on f.shop_id = r.shop_id
    left join mv_shops ms on ms.shop_id = r.shop_id
    order by r.overlap desc, r.best_sold desc nulls last
    limit 6
  ) top;

  v_out := jsonb_build_object(
    'ok', true,
    'shop', v_shop,
    'listings', coalesce(v_listings, '[]'::jsonb),
    'markets', coalesce(v_markets, '[]'::jsonb),
    'rivals', coalesce(v_rivals, '[]'::jsonb)
  );
  return v_out;
end;
$$;

revoke all on function public.get_toko_benchmark(bigint, text[]) from public;
grant execute on function public.get_toko_benchmark(bigint, text[]) to authenticated;

comment on function public.get_toko_benchmark(bigint, text[]) is
  'My Toko benchmark. Markets are the latest keyword-search scrape (search_rank set, 6-hour window). Omzet is product_velocity only.';

notify pgrst, 'reload schema';
