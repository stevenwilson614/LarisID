-- Quartiles for Site B product-type cards (Q1–Q3 price band).
-- Kept as an on-demand RPC so we don't rebuild mv_product_types just for two columns.

create or replace function public.product_type_quartiles(p_keywords text[])
returns table (keyword text, price_p25 bigint, price_p75 bigint)
language sql
stable
security definer
set search_path = public
as $$
  select
    btrim(l.keyword) as keyword,
    round((percentile_cont(0.25) within group (order by l.price::double precision))::numeric)::bigint as price_p25,
    round((percentile_cont(0.75) within group (order by l.price::double precision))::numeric)::bigint as price_p75
  from public.listings_deduped l
  where l.keyword = any (p_keywords)
    and l.total_sold > 0
    and l.price between 500 and 50000000
  group by 1;
$$;

revoke all on function public.product_type_quartiles(text[]) from public;
grant execute on function public.product_type_quartiles(text[]) to anon, authenticated;
