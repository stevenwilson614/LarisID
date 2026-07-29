-- Extend product_type_quartiles with monthly-omset P60–P100 for Site B cards.
-- Return type change requires drop + recreate.
-- Omset/mo matches mv_product_types: price × min(sold/age_days, 500) × 30.

drop function if exists public.product_type_quartiles(text[]);

create or replace function public.product_type_quartiles(p_keywords text[])
returns table (
  keyword text,
  price_p25 bigint,
  price_p75 bigint,
  omset_p60 bigint,
  omset_p100 bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with base as (
    select
      btrim(l.keyword) as keyword,
      l.price::double precision as price,
      case
        when l.listing_date is null
          or coalesce(l.price, 0) <= 0
          or coalesce(l.total_sold, 0) <= 0 then 0::double precision
        else least(
          l.total_sold::double precision
            / greatest(1.0, extract(epoch from (now() - l.listing_date)) / 86400.0),
          500.0
        ) * l.price::double precision * 30.0
      end as omset_mo
    from public.listings_deduped l
    where l.keyword = any (p_keywords)
      and l.total_sold > 0
      and l.price between 500 and 50000000
  )
  select
    b.keyword,
    round((percentile_cont(0.25) within group (order by b.price))::numeric)::bigint as price_p25,
    round((percentile_cont(0.75) within group (order by b.price))::numeric)::bigint as price_p75,
    round((percentile_cont(0.60) within group (order by nullif(b.omset_mo, 0)))::numeric)::bigint as omset_p60,
    round((max(b.omset_mo))::numeric)::bigint as omset_p100
  from base b
  group by 1;
$$;

revoke all on function public.product_type_quartiles(text[]) from public;
grant execute on function public.product_type_quartiles(text[]) to anon, authenticated;
