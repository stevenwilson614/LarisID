-- Product catalog should reflect the latest complete scrape panel, not all-time max sold.

create or replace function public.get_latest_panel_date()
returns date
language sql
stable
set search_path = public
set statement_timeout = '10s'
as $$
  select coalesce(
    (
      select date(scraped_at)
      from listings
      where scraped_at >= (current_date - interval '14 days')
      group by date(scraped_at)
      having count(*) >= 10000
      order by date(scraped_at) desc
      limit 1
    ),
    (
      select date(scraped_at)
      from listings
      where scraped_at >= (current_date - interval '14 days')
      group by date(scraped_at)
      order by count(*) desc
      limit 1
    )
  );
$$;

create or replace function public.get_product_catalog()
returns table(
  keyword text,
  product_name text,
  price numeric,
  total_sold bigint,
  image_url text,
  category text,
  rating numeric,
  reviews integer,
  item_id bigint,
  shop_id bigint
)
language sql
stable
security definer
set search_path = public
set statement_timeout = '30s'
as $$
  select distinct on (keyword)
    keyword, product_name, price, total_sold,
    image_url, category, rating, reviews, item_id, shop_id
  from listings
  where keyword is not null
    and product_name is not null
    and date(scraped_at) = get_latest_panel_date()
  order by keyword, total_sold desc nulls last;
$$;

grant execute on function public.get_latest_panel_date() to anon, authenticated;
grant execute on function public.get_product_catalog() to anon, authenticated;
