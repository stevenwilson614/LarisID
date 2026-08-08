-- Cache Shopee shop portraits fetched by the get-shop-logo edge function.
-- Tracker UI reads directly; writes are service-role only (no insert/update RLS).

create table if not exists public.shop_logo_cache (
  shop_id    bigint primary key,
  logo_url   text not null,
  fetched_at timestamptz not null default now()
);

alter table public.shop_logo_cache enable row level security;

drop policy if exists shop_logo_cache_select on public.shop_logo_cache;
create policy shop_logo_cache_select on public.shop_logo_cache
  for select to authenticated using (true);

grant select on public.shop_logo_cache to authenticated;
