-- Express scrape lane. A real miss can jump the 7-day keyword queue.
-- The Mac worker claims one job, scrapes two pages, and reports back.
-- A first scrape has no second measurement, so listings_fresh_for_keyword
-- returns sold/price only. The client must not invent monthly omset.
--
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20261026223000_express_scrape.sql

begin;

create table if not exists public.express_scrape_jobs (
  id            uuid        primary key default gen_random_uuid(),
  keyword_norm  text        not null,
  user_id       uuid,
  client_id     uuid,
  status        text        not null default 'pending'
                check (status in ('pending', 'claimed', 'done', 'failed')),
  claimed_by    text,
  claimed_at    timestamptz,
  finished_at   timestamptz,
  n_listings    int,
  error         text,
  created_at    timestamptz not null default now()
);

create index if not exists express_scrape_jobs_pending_idx
  on public.express_scrape_jobs (created_at)
  where status in ('pending', 'claimed');

create index if not exists express_scrape_jobs_keyword_idx
  on public.express_scrape_jobs (keyword_norm, created_at desc);

comment on table public.express_scrape_jobs is
  'On-demand keyword scrape for a search miss. Mac express worker claims these. '
  'Also upserted into scrape_keywords (sla_days=1) so the keyword joins the normal cycle.';

create table if not exists public.express_worker_heartbeat (
  host    text primary key,
  seen_at timestamptz not null default now()
);

alter table public.express_scrape_jobs enable row level security;
alter table public.express_worker_heartbeat enable row level security;
revoke all on public.express_scrape_jobs, public.express_worker_heartbeat
  from public, anon, authenticated;
grant select, insert, update on public.express_scrape_jobs to service_role;
grant select, insert, update on public.express_worker_heartbeat to service_role;

-- 60 successful express scrapes per rolling day, shared across hosts.
create or replace function public.claim_express_scrape_jobs(
  p_host text,
  p_limit int default 1
) returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '10s'
as $$
declare
  v_host text := left(nullif(btrim(coalesce(p_host, '')), ''), 80);
  v_lim  int := greatest(1, least(coalesce(p_limit, 1), 3));
  v_done int;
  v_out  jsonb;
begin
  if v_host is null then
    return '[]'::jsonb;
  end if;

  insert into public.express_worker_heartbeat (host, seen_at)
  values (v_host, now())
  on conflict (host) do update set seen_at = now();

  select count(*)::int into v_done
    from public.express_scrape_jobs
   where status = 'done'
     and finished_at > now() - interval '1 day';
  if v_done >= 60 then
    return '[]'::jsonb;
  end if;

  update public.express_scrape_jobs
     set status = 'pending', claimed_by = null, claimed_at = null
   where status = 'claimed'
     and claimed_at < now() - interval '8 minutes';

  with next as (
    select j.id
      from public.express_scrape_jobs j
     where j.status = 'pending'
     order by j.created_at
     limit v_lim
     for update skip locked
  ),
  claimed as (
    update public.express_scrape_jobs j
       set status = 'claimed', claimed_by = v_host, claimed_at = now()
      from next n
     where j.id = n.id
     returning j.id, j.keyword_norm, j.user_id, j.created_at
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'keyword', keyword_norm, 'user_id', user_id, 'created_at', created_at
         )), '[]'::jsonb)
    into v_out
    from claimed;

  return v_out;
end $$;

create or replace function public.complete_express_scrape(
  p_id uuid,
  p_host text,
  p_ok boolean,
  p_n int default 0,
  p_error text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kw text;
begin
  update public.express_scrape_jobs
     set status = case when p_ok then 'done' else 'failed' end,
         finished_at = now(),
         n_listings = greatest(coalesce(p_n, 0), 0),
         error = left(p_error, 400)
   where id = p_id
     and status in ('claimed', 'pending')
  returning keyword_norm into v_kw;
  if v_kw is null then return false; end if;

  if p_ok then
    update public.scrape_keywords
       set last_success_at = now(),
           last_scraped_at = now(),
           last_listings = greatest(coalesce(p_n, 0), coalesce(last_listings, 0))
     where keyword = v_kw;
    perform public.fulfill_scrape_requests();
  end if;
  return true;
end $$;

create or replace function public.express_heartbeat(p_host text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(btrim(coalesce(p_host, '')), '') is null then return; end if;
  insert into public.express_worker_heartbeat (host, seen_at)
  values (left(btrim(p_host), 80), now())
  on conflict (host) do update set seen_at = now();
end $$;

create or replace function public.get_express_scrape_job(
  p_job_id uuid,
  p_client uuid default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
set statement_timeout = '5s'
as $$
declare
  v public.express_scrape_jobs%rowtype;
  v_online boolean;
begin
  if p_job_id is null then
    return jsonb_build_object('ok', false, 'reason', 'bad_args');
  end if;

  select * into v
    from public.express_scrape_jobs
   where id = p_job_id
     and (
       user_id = auth.uid()
       or (p_client is not null and client_id = p_client)
     );
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  select exists (
    select 1 from public.express_worker_heartbeat
     where seen_at > now() - interval '90 seconds'
  ) into v_online;

  return jsonb_build_object(
    'ok', true,
    'job_id', v.id,
    'status', v.status,
    'keyword', v.keyword_norm,
    'n_listings', v.n_listings,
    'error', v.error,
    'worker_online', v_online,
    'finished_at', v.finished_at
  );
end $$;

-- Logged-in shortcut. The Minta Produk form already inserts a job via
-- request_scrape_keywords once this table exists. This RPC is the same
-- verdict for a single keyword, and it stores client_id for the poll.
create or replace function public.request_express_scrape(
  p_keyword text,
  p_client uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '8s'
as $$
declare
  v_rows jsonb;
  v_row jsonb;
  v_id uuid;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'auth');
  end if;
  v_rows := public.request_scrape_keywords(array[p_keyword], null, 'express', '');
  v_row := v_rows->0;
  v_id := nullif(v_row->>'job_id', '')::uuid;
  if v_id is not null and p_client is not null then
    update public.express_scrape_jobs set client_id = p_client where id = v_id;
  end if;
  return jsonb_build_object(
    'ok', true,
    'verdict', v_row->>'verdict',
    'keyword', v_row->>'keyword',
    'corrected', v_row->>'corrected',
    'nearest', v_row->>'nearest',
    'job_id', v_id
  );
end $$;

-- Rows from the keyword's latest scrape, before the matview refresh.
-- nowcast columns are null on purpose: one scrape is not a monthly omset.
create or replace function public.listings_fresh_for_keyword(
  p_keyword text,
  p_max int default 80
)
returns table (
  item_id bigint,
  shop_id bigint,
  product_name text,
  store_name text,
  price real,
  original_price real,
  total_sold integer,
  reviews integer,
  rating real,
  location text,
  image_url text,
  url text,
  keyword text,
  category text,
  listing_date timestamptz,
  nowcast_velocity_daily real,
  nowcast_omset_monthly bigint,
  nowcast_confidence text,
  nowcast_method text,
  is_ad smallint,
  search_rank integer,
  in_stock boolean,
  wishlist integer
)
language sql
stable
security definer
set search_path = public
set statement_timeout = '8s'
as $$
  with latest as (
    select max(l.scraped_at) as scraped_at
      from public.listings l
     where l.keyword = btrim(p_keyword)
  )
  select l.item_id, l.shop_id, l.product_name, l.store_name, l.price, l.original_price,
         l.total_sold, l.reviews, l.rating, l.location, l.image_url, l.url,
         l.keyword, l.category, l.listing_date,
         null::real, null::bigint, null::text, null::text,
         l.is_ad, l.search_rank, l.in_stock, l.wishlist
    from public.listings l, latest
   where l.keyword = btrim(p_keyword)
     and latest.scraped_at is not null
     and l.scraped_at >= latest.scraped_at - interval '6 hours'
     and l.total_sold > 0
   order by l.total_sold desc
   limit greatest(1, least(coalesce(p_max, 80), 120));
$$;

-- A finished express job is visible before the next matview refresh.
create or replace function public.fulfill_scrape_requests()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n int;
begin
  update public.keyword_scrape_requests r
     set status = 'ready', fulfilled_at = now()
   where r.status = 'pending'
     and (
       exists (select 1 from public.product_types_v p
                where p.keyword = r.keyword_norm and p.city = 'ALL' and p.n_listings >= 3)
       or exists (select 1 from public.express_scrape_jobs j
                   where j.keyword_norm = r.keyword_norm
                     and j.status = 'done'
                     and coalesce(j.n_listings, 0) >= 1)
     );
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.claim_express_scrape_jobs(text, int) from public, anon, authenticated;
revoke all on function public.complete_express_scrape(uuid, text, boolean, int, text) from public, anon, authenticated;
revoke all on function public.express_heartbeat(text) from public, anon, authenticated;
revoke all on function public.fulfill_scrape_requests() from public, anon, authenticated;
grant execute on function public.claim_express_scrape_jobs(text, int) to service_role;
grant execute on function public.complete_express_scrape(uuid, text, boolean, int, text) to service_role;
grant execute on function public.express_heartbeat(text) to service_role;
grant execute on function public.get_express_scrape_job(uuid, uuid) to anon, authenticated;
grant execute on function public.request_express_scrape(text, uuid) to authenticated;
grant execute on function public.listings_fresh_for_keyword(text, int) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
