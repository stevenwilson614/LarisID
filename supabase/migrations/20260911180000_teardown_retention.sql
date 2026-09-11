-- Retention surfaces from the DataPinter teardown: export archive payload,
-- richer weekly history snapshots, saved search criteria, in-app notices,
-- two-sided supplier listings (our shops + self-serve, never a competitor catalog).
--
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20260911180000_teardown_retention.sql

begin;

-- ── Export archive ───────────────────────────────────────────────────────────
alter table public.export_jobs
  add column if not exists payload jsonb not null default '{}'::jsonb;

comment on column public.export_jobs.payload is
  'Replay keys for Arsip Unduhan: item_ids, shop_ids, keywords, query, shape, weeks, source.';

drop function if exists public.export_stamp_payload(uuid, jsonb);
create function public.export_stamp_payload(p_request_id uuid, p_payload jsonb)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'auth required' using errcode = '42501';
  end if;
  update public.export_jobs
     set payload = coalesce(p_payload, '{}'::jsonb)
   where user_id = auth.uid()
     and request_id = p_request_id
     and (payload = '{}'::jsonb or payload is null);
  return found;
end $$;

revoke all on function public.export_stamp_payload(uuid, jsonb) from public, anon;
grant execute on function public.export_stamp_payload(uuid, jsonb) to authenticated;

drop function if exists public.notice_self(text, jsonb);
create function public.notice_self(p_kind text, p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'auth required' using errcode = '42501';
  end if;
  if p_kind not in ('export_done', 'quota_reset') then
    raise exception 'kind not allowed' using errcode = '22023';
  end if;
  insert into public.user_notices (user_id, kind, payload)
  values (auth.uid(), p_kind, coalesce(p_payload, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end $$;

revoke all on function public.notice_self(text, jsonb) from public, anon;
grant execute on function public.notice_self(text, jsonb) to authenticated;

drop function if exists public.dismiss_notices_open();
create function public.dismiss_notices_open()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n int;
begin
  if auth.uid() is null then
    raise exception 'auth required' using errcode = '42501';
  end if;
  update public.user_notices
     set dismissed_at = now()
   where user_id = auth.uid() and dismissed_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.dismiss_notices_open() from public, anon;
grant execute on function public.dismiss_notices_open() to authenticated;

alter table public.user_profiles
  add column if not exists ui_prefs jsonb not null default '{}'::jsonb;

-- ── Weekly history: harga already on the week row; add scrape snapshot extras ─
drop function if exists public._product_weeks_batch(bigint[], bigint[], int);
create function public._product_weeks_batch(
  p_item_ids bigint[],
  p_shop_ids bigint[],
  p_weeks    int default 12
)
returns table (
  ord            int,
  item_id        bigint,
  shop_id        bigint,
  week_start     date,
  units_wk       real,
  omset_wk       bigint,
  price          real,
  sumber         text,
  hari_terukur   int,
  hari_data      int,
  billable       boolean,
  snap_reviews   bigint,
  snap_rating    numeric,
  snap_sold      bigint,
  snap_harga_asli numeric,
  snap_at        timestamptz
)
language sql
stable
set search_path = public
set statement_timeout = '25s'
as $$
  with lim as (
    select greatest(1, least(coalesce(p_weeks, 12), 26)) as n
  ),
  bounds as (
    select public.listing_week_start(current_date) - ((l.n - 1) * 7) as d0,
           public.listing_week_start(current_date) + 13              as d1
    from lim l
  ),
  keys as materialized (
    select i::int as ord, p_item_ids[i] as item_id, p_shop_ids[i] as shop_id
    from generate_subscripts(p_item_ids, 1) as i
    where p_item_ids[i] is not null and p_shop_ids[i] is not null
  ),
  raw as (
    select k.ord, k.item_id, k.shop_id, s.d, s.units, s.omset, s.price, s.source
    from keys k
    cross join bounds b
    left join lateral public.product_daily_series(k.item_id, k.shop_id, b.d0, b.d1) s
      on true
  ),
  weeks as (
    select
      r.ord,
      r.item_id,
      r.shop_id,
      public.listing_week_start(r.d)                                   as week_start,
      (sum(r.units) * 7.0 / nullif(count(*), 0))::real                 as units_wk,
      round(sum(r.omset) * 7.0 / nullif(count(*), 0))::bigint          as omset_wk,
      avg(r.price)::real                                               as price,
      case
        when bool_and(r.source = 'measured')                     then 'terukur'
        when count(*) filter (where r.source = 'measured') > 0   then 'perkiraan'
        when bool_or(r.source = 'forecast')                      then 'proyeksi'
        else 'perkiraan'
      end                                                              as sumber,
      count(*) filter (where r.source = 'measured')::int               as hari_terukur,
      count(*)::int                                                    as hari_data,
      bool_and(r.source = 'measured')                                  as billable
    from raw r
    where r.d is not null
    group by r.ord, r.item_id, r.shop_id, public.listing_week_start(r.d)
  )
  select
    w.ord, w.item_id, w.shop_id, w.week_start, w.units_wk, w.omset_wk, w.price,
    w.sumber, w.hari_terukur, w.hari_data, w.billable,
    snap.reviews, snap.rating, snap.total_sold, snap.original_price, snap.scraped_at
  from weeks w
  left join lateral (
    -- In-week scrape only. Earlier weeks are a different row; never interpolate.
    select l.reviews, l.rating, l.total_sold, l.original_price, l.scraped_at
      from public.listings l
     where l.item_id = w.item_id and l.shop_id = w.shop_id
       and (l.scraped_at at time zone 'Asia/Jakarta')::date >= w.week_start
       and (l.scraped_at at time zone 'Asia/Jakarta')::date <= (w.week_start + 6)
     order by l.scraped_at desc
     limit 1
  ) snap on true
  order by w.ord, w.week_start;
$$;

comment on function public._product_weeks_batch(bigint[], bigint[], int) is
  'Weekly export grain from product_daily_series plus nearest listings snapshot in that WIB week. NOT GRANTED.';

revoke all on function public._product_weeks_batch(bigint[], bigint[], int)
  from public, anon, authenticated;

-- ── Saved search criteria (Sonar-shaped) ─────────────────────────────────────
create table if not exists public.user_saved_criteria (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  name          text not null default '',
  query         text not null default '',
  category      text not null default '',
  city          text not null default '',
  budget_min    integer,
  budget_max    integer,
  omset_min     bigint,
  trend_min     numeric,
  last_notified_at timestamptz,
  last_hit_count   integer not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists user_saved_criteria_user_idx
  on public.user_saved_criteria (user_id, created_at desc);

alter table public.user_saved_criteria enable row level security;
drop policy if exists user_saved_criteria_own on public.user_saved_criteria;
create policy user_saved_criteria_own on public.user_saved_criteria
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on public.user_saved_criteria to authenticated;

-- Count new matching listings since last notify. Honest: listing_date lower bound.
create or replace function public.saved_criteria_new_count(p_id uuid)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_row public.user_saved_criteria%rowtype;
  v_n   integer := 0;
  v_since timestamptz;
begin
  select * into v_row from public.user_saved_criteria where id = p_id;
  if not found then return 0; end if;
  v_since := coalesce(v_row.last_notified_at, v_row.created_at, now() - interval '7 days');
  select count(*)::int into v_n
    from public.listings_deduped d
   where not d.is_offtopic
     and d.total_sold > 0
     and d.scraped_at > v_since
     and (v_row.query = '' or d.keyword ilike '%' || v_row.query || '%')
     and (v_row.category = '' or d.category ilike '%' || v_row.category || '%')
     and (v_row.city = '' or v_row.city in ('ALL', 'Nasional') or d.location ilike '%' || v_row.city || '%')
     and (v_row.budget_min is null or d.price >= v_row.budget_min)
     and (v_row.budget_max is null or d.price <= v_row.budget_max)
     and (v_row.omset_min is null or coalesce(d.nowcast_omset_monthly, 0) >= v_row.omset_min);
  return coalesce(v_n, 0);
end $$;

revoke all on function public.saved_criteria_new_count(uuid) from public, anon;
grant execute on function public.saved_criteria_new_count(uuid) to authenticated;

-- Monday notice insert (email is the criteria-notify edge function).
create or replace function public.notify_saved_criteria()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_n int := 0;
  v_hits int;
begin
  for r in select * from public.user_saved_criteria loop
    v_hits := public.saved_criteria_new_count(r.id);
    if v_hits <= 0 then
      continue;
    end if;
    insert into public.user_notices (user_id, kind, payload)
    values (
      r.user_id,
      'criteria_hit',
      jsonb_build_object(
        'criteria_id', r.id,
        'name', coalesce(nullif(r.name, ''), r.query, r.category, 'pencarian tersimpan'),
        'query', r.query,
        'n', v_hits,
        'lead', v_hits::text || ' produk baru cocok kriteriamu'
      )
    );
    update public.user_saved_criteria
       set last_notified_at = now(), last_hit_count = v_hits
     where id = r.id;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

revoke all on function public.notify_saved_criteria() from public, anon, authenticated;

drop function if exists public.criteria_notify_audience();
create function public.criteria_notify_audience()
returns table (
  user_id uuid, email text, email_ok boolean, notify_channels text[],
  criteria_id uuid, name text, query text, n int
)
language sql
stable
security definer
set search_path to 'public, auth'
as $$
  select
    c.user_id,
    u.email::text,
    (u.email is not null
       and u.email not like '%@wa.larisid.com'
       and not exists (select 1 from public.email_suppressions s
                        where lower(s.email) = lower(u.email))) as email_ok,
    coalesce(st.notify_channels, array['email']::text[]),
    c.id, coalesce(nullif(c.name, ''), c.query, c.category, 'pencarian tersimpan'),
    c.query, c.last_hit_count
  from public.user_saved_criteria c
  join auth.users u on u.id = c.user_id
  left join public.user_tracker_state st on st.user_id = c.user_id
  where c.last_hit_count > 0
    and c.last_notified_at is not null
    and c.last_notified_at > now() - interval '36 hours';
$$;

revoke all on function public.criteria_notify_audience() from public, anon;
grant execute on function public.criteria_notify_audience() to service_role;

select cron.unschedule('notify-saved-criteria')
 where exists (select 1 from cron.job where jobname = 'notify-saved-criteria');
-- Monday 01:00 WIB = Sunday 18:00 UTC
select cron.schedule('notify-saved-criteria', '0 18 * * 0',
                     $cron$select public.notify_saved_criteria();$cron$);
-- Email: after deploying criteria-notify, schedule (copy Authorization from
-- tracker-favorite-weekly):
--   select cron.schedule('criteria-notify-email', '15 18 * * 0', $$
--     select net.http_post(
--       url := 'http://kong:8000/functions/v1/criteria-notify',
--       headers := '{"Content-Type":"application/json","Authorization":"Bearer …"}'::jsonb,
--       body := '{}'::jsonb); $$);

-- Close the minta-produk loop: in-app notice when a request becomes ready.
create or replace function public.fulfill_scrape_requests()
returns integer
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  with flipped as (
    update public.keyword_scrape_requests r
       set status = 'ready', fulfilled_at = now()
     where r.status = 'pending'
       and exists (select 1 from public.product_types_v p
                    where p.keyword = r.keyword_norm and p.city = 'ALL' and p.n_listings >= 3)
    returning r.user_id, r.id, r.keyword
  )
  insert into public.user_notices (user_id, kind, payload)
  select user_id, 'keyword_ready',
         jsonb_build_object('request_id', id, 'keyword', keyword,
                            'lead', 'Kata kunci yang kamu minta sudah siap')
    from flipped;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.fulfill_scrape_requests() from public, anon, authenticated;

-- ── Two-sided suppliers (our grosir seed + self-listing) ─────────────────────
create table if not exists public.supplier_listings (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references auth.users(id) on delete set null,
  source        text not null default 'self'
                  check (source in ('self', 'curated', 'grosir_seed')),
  name          text not null,
  shop_id       bigint,
  city          text not null default '',
  url           text not null default '',
  category      text not null default '',
  jenis         text not null default ''
                  check (jenis in ('', 'Manufaktur', 'Penjual Grosir', 'Agen',
                                   'Distributor', 'Pemilik Merek', 'Lainnya',
                                   'grosir', 'pabrik', 'konveksi', 'import')),
  contact       text not null default '',
  contact_consent boolean not null default false,
  published     boolean not null default false,
  created_at    timestamptz not null default now()
);

create index if not exists supplier_listings_pub_idx
  on public.supplier_listings (published, category)
  where published;

alter table public.supplier_listings enable row level security;
drop policy if exists supplier_listings_select_pub on public.supplier_listings;
create policy supplier_listings_select_pub on public.supplier_listings
  for select to anon, authenticated
  using (published or user_id = auth.uid());

drop policy if exists supplier_listings_own_write on public.supplier_listings;
create policy supplier_listings_own_write on public.supplier_listings
  for insert to authenticated
  with check (user_id = auth.uid() and source = 'self');

drop policy if exists supplier_listings_own_update on public.supplier_listings;
create policy supplier_listings_own_update on public.supplier_listings
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and source = 'self');

grant select on public.supplier_listings to anon, authenticated;
grant insert, update on public.supplier_listings to authenticated;

set local statement_timeout = '120s';

create unique index if not exists supplier_listings_seed_shop_uidx
  on public.supplier_listings (shop_id)
  where source = 'grosir_seed' and shop_id is not null;

-- Seed from OUR Shopee grosir shops (store name contains grosir). Cap 80.
insert into public.supplier_listings
  (source, name, shop_id, city, url, category, jenis, published, contact_consent)
select distinct on (d.shop_id)
  'grosir_seed',
  d.store_name,
  d.shop_id,
  coalesce(d.location, ''),
  coalesce(d.url, 'https://shopee.co.id/shop/' || d.shop_id::text),
  coalesce(d.category, ''),
  'Penjual Grosir',
  true,
  false
from public.listings_deduped d
where d.store_name ilike '%grosir%'
  and d.shop_id is not null
  and not d.is_offtopic
  and d.total_sold > 50
  and not exists (
    select 1 from public.supplier_listings s
     where s.source = 'grosir_seed' and s.shop_id = d.shop_id
  )
order by d.shop_id, d.total_sold desc nulls last
limit 80;

notify pgrst, 'reload schema';

commit;
