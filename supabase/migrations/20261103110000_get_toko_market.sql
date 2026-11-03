-- One keyword market for the connected My Toko page.
--
-- Cohort matches get_toko_benchmark: search_rank hits, latest scrape, 6-hour
-- window. Shop penjualan is the sum of product_velocity nowcast for listings
-- in that scrape, not the shop's whole GMV. Weekly lines come from
-- listing_weekly and are omitted unless a listing has a second measured scrape.

create table if not exists public.user_toko_manual_omzet (
  user_id uuid not null references auth.users(id) on delete cascade,
  shop_id bigint not null,
  item_id bigint not null default 0,
  window_days integer not null default 30,
  omzet_rp bigint not null,
  updated_at timestamptz not null default now(),
  primary key (user_id, shop_id, item_id, window_days),
  constraint user_toko_manual_omzet_window check (window_days = 30),
  constraint user_toko_manual_omzet_amount check (omzet_rp >= 0 and omzet_rp < 1000000000000)
);

create table if not exists public.user_toko_hidden_shops (
  user_id uuid not null references auth.users(id) on delete cascade,
  shop_id bigint not null,
  rival_shop_id bigint not null,
  created_at timestamptz not null default now(),
  primary key (user_id, shop_id, rival_shop_id)
);

create table if not exists public.user_toko_hidden_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  shop_id bigint not null,
  item_id bigint not null,
  created_at timestamptz not null default now(),
  primary key (user_id, shop_id, item_id)
);

create table if not exists public.user_toko_added_shops (
  user_id uuid not null references auth.users(id) on delete cascade,
  shop_id bigint not null,
  rival_shop_id bigint not null,
  store_name text not null default '',
  location text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, shop_id, rival_shop_id)
);

alter table public.user_toko_manual_omzet enable row level security;
alter table public.user_toko_hidden_shops enable row level security;
alter table public.user_toko_hidden_items enable row level security;
alter table public.user_toko_added_shops enable row level security;

drop policy if exists p_utmo_own on public.user_toko_manual_omzet;
create policy p_utmo_own on public.user_toko_manual_omzet
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists p_uths_own on public.user_toko_hidden_shops;
create policy p_uths_own on public.user_toko_hidden_shops
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists p_uthi_own on public.user_toko_hidden_items;
create policy p_uthi_own on public.user_toko_hidden_items
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists p_utas_own on public.user_toko_added_shops;
create policy p_utas_own on public.user_toko_added_shops
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

revoke all on public.user_toko_manual_omzet,
              public.user_toko_hidden_shops,
              public.user_toko_hidden_items,
              public.user_toko_added_shops from public, anon;
grant select, insert, update, delete
  on public.user_toko_manual_omzet,
     public.user_toko_hidden_shops,
     public.user_toko_hidden_items,
     public.user_toko_added_shops
  to authenticated;

create or replace function public.get_toko_market(
  p_shop_id bigint,
  p_keyword text,
  p_item_id bigint default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
set statement_timeout = '15s'
as $$
declare
  v_kw text := btrim(coalesce(p_keyword, ''));
  v_shops jsonb := '[]'::jsonb;
  v_points jsonb := '[]'::jsonb;
  v_weeks jsonb := '[]'::jsonb;
  v_item_weeks jsonb := '[]'::jsonb;
  v_mine jsonb := null;
  v_item jsonb := null;
  v_avg jsonb := '{}'::jsonb;
  v_listing_avg jsonb := '{}'::jsonb;
  v_peer_count int := 0;
  v_shop_count int := 0;
  v_listing_count int := 0;
  v_ranked_listings int := 0;
  v_ranked_shops int := 0;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;
  if p_shop_id is null or v_kw = '' then
    return jsonb_build_object('ok', false, 'reason', 'shop');
  end if;

  perform set_config('enable_indexscan', 'off', true);

  begin
    create temp table if not exists pg_temp.toko_mkt (
      item_id bigint,
      shop_id bigint,
      store_name text,
      product_name text,
      price numeric,
      total_sold bigint,
      rating numeric,
      reviews bigint,
      image_url text,
      nowcast numeric
    ) on commit drop;
    truncate pg_temp.toko_mkt;

    insert into pg_temp.toko_mkt (
      item_id, shop_id, store_name, product_name, price, total_sold, rating, reviews, image_url
    )
    select item_id, shop_id, store_name, product_name, price, total_sold, rating, reviews, image_url
    from (
      select distinct on (item_id, shop_id)
        item_id, shop_id, store_name, product_name, price, total_sold, rating, reviews, image_url
      from (
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
          l.scraped_at,
          max(l.scraped_at) over () as ts
        from listings l
        where l.keyword = v_kw
          and l.search_rank is not null
      ) rows
      where scraped_at >= ts - interval '6 hours'
        and coalesce(total_sold, 0) > 0
      order by item_id, shop_id, scraped_at desc
    ) cohort;

    perform set_config('enable_indexscan', 'on', true);

    update pg_temp.toko_mkt c
       set nowcast = pv.omset_monthly
      from product_velocity pv
     where pv.item_id = c.item_id
       and pv.shop_id = c.shop_id
       and pv.omset_monthly > 0;

    select count(*)::int,
           count(*) filter (where shop_id <> p_shop_id)::int,
           count(distinct shop_id)::int
      into v_listing_count, v_peer_count, v_shop_count
      from pg_temp.toko_mkt;
    -- peer_count above counted listings. Sellers are what the page ranks.
    select count(*)::int
      into v_peer_count
      from (select shop_id from pg_temp.toko_mkt where shop_id <> p_shop_id group by shop_id) s;

    select count(*)::int
      into v_ranked_shops
      from (
        select shop_id
        from pg_temp.toko_mkt
        group by shop_id
        having count(nowcast) > 0
      ) ranked_shops;

    with shop_agg as (
      select
        c.shop_id,
        max(c.store_name) as store_name,
        count(*)::int as n_listings,
        case when count(c.nowcast) = 0 then null else sum(c.nowcast) end as omzet,
        avg(c.rating) filter (where c.rating > 0) as rating,
        sum(coalesce(c.reviews, 0))::bigint as reviews,
        avg(c.price) filter (where c.price > 0) as avg_price,
        (array_agg(c.image_url order by c.total_sold desc nulls last))[1] as image_url
      from pg_temp.toko_mkt c
      group by c.shop_id
    ),
    ranked as (
      select
        s.*,
        ms.store_name as mv_name,
        ms.location,
        case when s.omzet is null then null
             else rank() over (order by s.omzet desc nulls last) end as rnk
      from shop_agg s
      left join mv_shops ms on ms.shop_id = s.shop_id
    )
    select
      (select jsonb_build_object(
         'rank', rnk,
         'omzet', omzet,
         'n_listings', n_listings,
         'rating', rating,
         'reviews', reviews,
         'avg_price', avg_price,
         'store_name', coalesce(mv_name, store_name)
       ) from ranked where shop_id = p_shop_id),
      (select jsonb_build_object(
         'omzet', avg(omzet),
         'n_listings', avg(n_listings),
         'rating', avg(rating),
         'reviews', avg(reviews),
         'avg_price', avg(avg_price),
         'n_shops', count(*)
       ) from ranked where shop_id <> p_shop_id),
      coalesce((
        select jsonb_agg(j order by ord)
        from (
          select
            case when rnk is null then 100000 else rnk end as ord,
            jsonb_build_object(
              'shop_id', shop_id,
              'store_name', coalesce(mv_name, store_name),
              'location', location,
              'image_url', image_url,
              'n_listings', n_listings,
              'omzet', omzet,
              'rating', rating,
              'reviews', reviews,
              'avg_price', avg_price,
              'rank', rnk,
              'is_mine', shop_id = p_shop_id
            ) as j
          from ranked
          where rnk is not null and rnk <= 100
          union all
          select
            100001,
            jsonb_build_object(
              'shop_id', shop_id,
              'store_name', coalesce(mv_name, store_name),
              'location', location,
              'image_url', image_url,
              'n_listings', n_listings,
              'omzet', omzet,
              'rating', rating,
              'reviews', reviews,
              'avg_price', avg_price,
              'rank', rnk,
              'is_mine', true
            )
          from ranked
          where shop_id = p_shop_id
            and (rnk is null or rnk > 100)
        ) u
      ), '[]'::jsonb)
    into v_mine, v_avg, v_shops;

    with listed as (
      select
        c.*,
        case when c.nowcast is null then null
             else rank() over (order by c.nowcast desc nulls last) end as omzet_rank,
        row_number() over (order by c.total_sold desc nulls last, c.item_id) as sold_rank
      from pg_temp.toko_mkt c
    )
    select
      (select count(*)::int from listed where nowcast is not null),
      case when p_item_id is null then null else (
        select jsonb_build_object(
          'item_id', item_id,
          'shop_id', shop_id,
          'product_name', product_name,
          'price', price,
          'total_sold', total_sold,
          'rating', rating,
          'reviews', reviews,
          'image_url', image_url,
          'nowcast', nowcast,
          'rank', omzet_rank,
          'sold_rank', sold_rank
        )
        from listed
        where item_id = p_item_id and shop_id = p_shop_id
      ) end,
      (select jsonb_build_object(
         'omzet', avg(nowcast),
         'price', avg(price) filter (where price > 0),
         'rating', avg(rating) filter (where rating > 0),
         'reviews', avg(reviews),
         'n', count(*)
       ) from listed where shop_id <> p_shop_id),
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'item_id', item_id,
          'shop_id', shop_id,
          'product_name', product_name,
          'price', price,
          'total_sold', total_sold,
          'rating', rating,
          'reviews', reviews,
          'image_url', image_url,
          'nowcast', nowcast,
          'rank', omzet_rank,
          'sold_rank', sold_rank
        ) order by sold_rank)
        from listed
        where sold_rank <= 80
           or (item_id = p_item_id and shop_id = p_shop_id)
      ), '[]'::jsonb)
    into v_ranked_listings, v_item, v_listing_avg, v_points;

    v_listing_avg := coalesce(v_listing_avg, '{}'::jsonb) || jsonb_build_object(
      'median_price', (
        select round((percentile_cont(0.5) within group (order by price) filter (where price > 0))::numeric)
        from pg_temp.toko_mkt
        where shop_id <> p_shop_id
      ),
      'ranked', v_ranked_listings
    );

    with focus as (
      select shop_id
      from (
        select shop_id, omzet
        from (
          select shop_id,
                 case when count(nowcast) = 0 then null else sum(nowcast) end as omzet
          from pg_temp.toko_mkt
          group by shop_id
        ) s
        where omzet is not null
        order by omzet desc
        limit 5
      ) top5
      union
      select p_shop_id
    ),
    eligible as (
      select f.shop_id
      from focus f
      where exists (
        select 1
        from pg_temp.toko_mkt c
        join listing_weekly lw
          on lw.item_id = c.item_id and lw.shop_id = c.shop_id
        where c.shop_id = f.shop_id
          and lw.source = 'measured'
          and coalesce(lw.span_days, 0) >= 2
      )
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'shop_id', shop_id,
      'week_start', week_start,
      'omzet', omzet,
      'measured', measured
    ) order by shop_id, week_start), '[]'::jsonb)
    into v_weeks
    from (
      select
        e.shop_id,
        lw.week_start,
        sum(lw.omset_wk)::bigint as omzet,
        bool_and(lw.source = 'measured') as measured
      from eligible e
      join pg_temp.toko_mkt c on c.shop_id = e.shop_id
      join listing_weekly lw
        on lw.item_id = c.item_id and lw.shop_id = c.shop_id
      where lw.week_start >= public.listing_week_start(current_date) - 35
        and lw.source <> 'prior'
      group by e.shop_id, lw.week_start
    ) w;

    if p_item_id is not null and exists (
      select 1 from listing_weekly lw
      where lw.item_id = p_item_id and lw.shop_id = p_shop_id
        and lw.source = 'measured' and coalesce(lw.span_days, 0) >= 2
    ) then
      select coalesce(jsonb_agg(jsonb_build_object(
        'week_start', week_start,
        'omzet', omzet,
        'measured', measured
      ) order by week_start), '[]'::jsonb)
      into v_item_weeks
      from (
        select
          lw.week_start,
          sum(lw.omset_wk)::bigint as omzet,
          bool_and(lw.source = 'measured') as measured
        from listing_weekly lw
        where lw.item_id = p_item_id
          and lw.shop_id = p_shop_id
          and lw.week_start >= public.listing_week_start(current_date) - 35
          and lw.source <> 'prior'
        group by lw.week_start
      ) iw;
    end if;

  exception when others then
    perform set_config('enable_indexscan', 'on', true);
    raise;
  end;

  return jsonb_build_object(
    'ok', true,
    'keyword', v_kw,
    'peer_count', v_peer_count,
    'shop_count', v_shop_count,
    'listing_count', v_listing_count,
    'ranked_listings', v_ranked_listings,
    'ranked_shops', v_ranked_shops,
    'mine', v_mine,
    'averages', coalesce(v_avg, '{}'::jsonb),
    'shops', coalesce(v_shops, '[]'::jsonb),
    'points', coalesce(v_points, '[]'::jsonb),
    'listing_avg', coalesce(v_listing_avg, '{}'::jsonb),
    'item', v_item,
    'weeks', coalesce(v_weeks, '[]'::jsonb),
    'item_weeks', coalesce(v_item_weeks, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_toko_market(bigint, text, bigint) from public, anon;
grant execute on function public.get_toko_market(bigint, text, bigint) to authenticated;

comment on function public.get_toko_market(bigint, text, bigint) is
  'One keyword market for My Toko. Penjualan is the nowcast sum of listings in that scrape. Weekly series only when a second measured scrape exists.';

notify pgrst, 'reload schema';
