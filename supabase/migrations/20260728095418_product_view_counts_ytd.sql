-- Unique Laris users who opened a product Deep Dive this calendar year.
-- Aggregates only (no user ids) so authenticated clients can read counts
-- despite activity_events RLS (users only see their own rows).

create index if not exists idx_activity_deepdive_open_created
  on public.activity_events (created_at desc)
  where event_type = 'deepdive_open';

create index if not exists idx_activity_deepdive_open_item_shop
  on public.activity_events (
    (metadata->>'item_id'),
    (metadata->>'shop_id')
  )
  where event_type = 'deepdive_open';

create or replace function public.product_view_counts_ytd(pairs jsonb)
returns table (item_id text, shop_id text, viewers bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Empty / null → no rows (avoid scanning all deepdive_open events).
  if pairs is null or jsonb_typeof(pairs) <> 'array' or jsonb_array_length(pairs) = 0 then
    return;
  end if;
  -- Cap batch size to keep the RPC cheap for Discover grids.
  if jsonb_array_length(pairs) > 200 then
    raise exception 'product_view_counts_ytd: max 200 pairs';
  end if;

  return query
  with req as (
    select distinct
      nullif(trim(coalesce(e.item_id, '')), '') as item_id,
      nullif(trim(coalesce(e.shop_id, '')), '') as shop_id
    from jsonb_to_recordset(pairs) as e(item_id text, shop_id text)
  )
  select
    a.metadata->>'item_id' as item_id,
    a.metadata->>'shop_id' as shop_id,
    count(distinct a.user_id)::bigint as viewers
  from public.activity_events a
  inner join req r
    on a.metadata->>'item_id' = r.item_id
   and a.metadata->>'shop_id' = r.shop_id
  where a.event_type = 'deepdive_open'
    and a.created_at >= date_trunc('year', now())
    and r.item_id is not null
    and r.shop_id is not null
  group by 1, 2;
end;
$$;

revoke all on function public.product_view_counts_ytd(jsonb) from public;
grant execute on function public.product_view_counts_ytd(jsonb) to authenticated;
