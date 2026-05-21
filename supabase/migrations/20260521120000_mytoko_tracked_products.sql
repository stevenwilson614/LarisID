-- My Toko: user tracked products (replaces localStorage tracker)
-- and user store profiles (Shopee store connection)

-- ── user_store_profiles ──────────────────────────────────────
create table if not exists public.user_store_profiles (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references auth.users(id) on delete cascade not null unique,
  shopee_store_name text,
  shopee_shop_id  bigint,
  connected_at    timestamptz default now(),
  updated_at      timestamptz default now()
);

alter table public.user_store_profiles enable row level security;

create policy "Users manage their own store profile"
  on public.user_store_profiles for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── user_tracked_products ────────────────────────────────────
create table if not exists public.user_tracked_products (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid references auth.users(id) on delete cascade not null,
  item_id      bigint not null,
  shop_id      bigint not null,
  keyword      text,
  product_name text,
  category     text,
  image_url    text,
  price        numeric,
  total_sold   bigint,
  store_name   text,
  tracked_at   timestamptz default now(),
  is_selling   boolean default false,
  unique(user_id, item_id, shop_id)
);

alter table public.user_tracked_products enable row level security;

create policy "Users manage their own tracked products"
  on public.user_tracked_products for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Index for common queries
create index if not exists idx_utp_user_selling
  on public.user_tracked_products(user_id, is_selling);

create index if not exists idx_utp_user_tracked
  on public.user_tracked_products(user_id, tracked_at desc);

-- ── RPC: look up shop_id from store_name in listings ─────────
create or replace function public.find_shop_by_name(p_store_name text)
returns table(shop_id bigint, store_name text, match_count bigint)
language sql stable security definer
set statement_timeout = '10s'
as $$
  select shop_id, store_name, count(*) as match_count
  from listings
  where lower(store_name) = lower(trim(p_store_name))
  group by shop_id, store_name
  order by match_count desc
  limit 5;
$$;

-- ── RPC: competitive position for a product+keyword ──────────
create or replace function public.get_competitive_position(
  p_keyword   text,
  p_shop_id   bigint,
  p_item_id   bigint
)
returns json
language plpgsql stable security definer
set statement_timeout = '15s'
as $$
declare
  v_result json;
begin
  with latest_scrape as (
    select scraped_at
    from listings
    where lower(keyword) = lower(p_keyword)
    order by scraped_at desc
    limit 1
  ),
  market as (
    select
      item_id, shop_id, store_name, product_name,
      price, total_sold, rating, reviews,
      row_number() over (order by total_sold desc) as rank,
      count(*) over () as total_sellers,
      sum(total_sold) over () as market_total_sold,
      avg(price) over () as avg_price,
      percentile_cont(0.5) within group (order by price) over () as median_price
    from listings l
    join latest_scrape s on l.scraped_at = s.scraped_at
    where lower(l.keyword) = lower(p_keyword)
  ),
  mine as (
    select * from market
    where shop_id = p_shop_id
    limit 1
  ),
  top3 as (
    select avg(reviews) as top3_reviews, avg(price) as top3_price
    from market where rank <= 3
  )
  select json_build_object(
    'found',          (select count(*) > 0 from mine),
    'my_rank',        (select rank from mine),
    'total_sellers',  (select total_sellers from market limit 1),
    'my_sold',        (select total_sold from mine),
    'market_total',   (select market_total_sold from market limit 1),
    'market_share',   round((select total_sold::numeric / nullif(market_total_sold,0) * 100 from mine), 1),
    'my_price',       (select price from mine),
    'median_price',   round((select median_price from market limit 1)::numeric, 0),
    'my_reviews',     (select reviews from mine),
    'top3_reviews',   round((select top3_reviews from top3)::numeric, 0),
    'top3_price',     round((select top3_price from top3)::numeric, 0),
    'my_name',        (select product_name from mine)
  ) into v_result;

  return v_result;
end;
$$;

-- ── RPC: co-occurring categories (for suggestions) ───────────
create or replace function public.get_category_suggestions(
  p_categories text[],
  p_limit int default 6
)
returns table(category text, co_shop_count bigint, top_product_name text, top_score numeric)
language sql stable security definer
set statement_timeout = '20s'
as $$
  with user_cats as (
    select unnest(p_categories) as category
  ),
  co_shops as (
    select l2.category, count(distinct l1.shop_id) as co_shop_count
    from listings l1
    join listings l2
      on l1.shop_id = l2.shop_id
      and l1.category = any(p_categories)
      and l2.category <> all(p_categories)
    group by l2.category
    order by co_shop_count desc
    limit p_limit
  ),
  top_products as (
    select distinct on (l.category)
      l.category,
      l.product_name,
      round(
        (least(l.total_sold, 5000)::numeric / 5000 * 40) +
        (least(l.reviews, 1000)::numeric / 1000 * 30) +
        (least(l.rating, 5)::numeric / 5 * 30),
        0
      ) as score
    from listings l
    join co_shops cs on l.category = cs.category
    order by l.category, total_sold desc
  )
  select cs.category, cs.co_shop_count, tp.product_name, tp.score
  from co_shops cs
  left join top_products tp on tp.category = cs.category
  order by co_shop_count desc;
$$;
