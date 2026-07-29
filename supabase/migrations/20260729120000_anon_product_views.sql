-- Count anonymous product views too.
--
-- product_view_counts_ytd counted distinct user_id on activity_events
-- 'deepdive_open', which RLS only ever lets signed-in users write. Most Site B
-- traffic is logged out, so the eyeball was counting a small minority: the
-- most-viewed product in the whole DB showed 7 viewers and the median was 1.
--
-- page_views cannot be reused — it records a path, not a product.

create table if not exists public.product_views (
  id         bigserial primary key,
  item_id    text not null,
  shop_id    text not null,
  visitor_id text not null,             -- _lid_vid from localStorage (anon identity)
  user_id    uuid,                      -- auth.uid() when signed in, else null
  created_at timestamptz not null default now(),
  -- Explicit WIB day: created_at::date is not IMMUTABLE so it cannot be
  -- indexed, and a generated column cannot use a timezone conversion either.
  view_day   date not null default ((now() at time zone 'Asia/Jakarta')::date)
);

create index if not exists idx_product_views_item_shop
  on public.product_views (item_id, shop_id, created_at desc);
create index if not exists idx_product_views_created
  on public.product_views (created_at desc);
-- One row per viewer per product per day: keeps counts honest (a refresh loop
-- cannot inflate a product) and keeps the table small.
create unique index if not exists uq_product_views_daily
  on public.product_views (item_id, shop_id, visitor_id, view_day);

alter table public.product_views enable row level security;
-- No direct grants: all writes go through log_product_view(), all reads
-- through product_view_counts_ytd(). Both are SECURITY DEFINER.

create or replace function public.log_product_view(
  p_item_id    text,
  p_shop_id    text,
  p_visitor_id text
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(btrim(p_item_id), '') = ''
     or coalesce(btrim(p_shop_id), '') = ''
     or coalesce(btrim(p_visitor_id), '') = '' then
    return;
  end if;
  insert into public.product_views (item_id, shop_id, visitor_id, user_id)
  values (btrim(p_item_id), btrim(p_shop_id), btrim(p_visitor_id), auth.uid())
  on conflict do nothing;   -- already counted this viewer/product today
end; $$;

revoke all on function public.log_product_view(text,text,text) from public;
grant execute on function public.log_product_view(text,text,text) to anon, authenticated;

-- Viewers = distinct identities across BOTH sources, year to date.
-- A signed-in viewer is keyed by user_id in both, so they are not counted
-- twice when they appear in activity_events and product_views alike.
create or replace function public.product_view_counts_ytd(pairs jsonb)
returns table (item_id text, shop_id text, viewers bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if pairs is null or jsonb_typeof(pairs) <> 'array' or jsonb_array_length(pairs) = 0 then
    return;
  end if;
  if jsonb_array_length(pairs) > 200 then
    raise exception 'product_view_counts_ytd: max 200 pairs';
  end if;

  return query
  with req as (
    select distinct
      nullif(btrim(coalesce(e.item_id, '')), '') as item_id,
      nullif(btrim(coalesce(e.shop_id, '')), '') as shop_id
    from jsonb_to_recordset(pairs) as e(item_id text, shop_id text)
  ),
  seen as (
    -- signed-in deep dives (historical source)
    select r.item_id, r.shop_id, a.user_id::text as viewer_key
    from req r
    join public.activity_events a
      on a.event_type = 'deepdive_open'
     and a.metadata->>'item_id' = r.item_id
     and a.metadata->>'shop_id' = r.shop_id
     and a.created_at >= date_trunc('year', now())
     and a.user_id is not null
    union all
    -- everyone, including anonymous
    select r.item_id, r.shop_id,
           coalesce(v.user_id::text, 'v:' || v.visitor_id) as viewer_key
    from req r
    join public.product_views v
      on v.item_id = r.item_id
     and v.shop_id = r.shop_id
     and v.created_at >= date_trunc('year', now())
  )
  select s.item_id, s.shop_id, count(distinct s.viewer_key)::bigint as viewers
  from seen s
  group by s.item_id, s.shop_id;
end; $$;

revoke all on function public.product_view_counts_ytd(jsonb) from public;
grant execute on function public.product_view_counts_ytd(jsonb) to anon, authenticated;
