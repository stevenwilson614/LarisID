-- On-demand shop scrape jobs for Alat My Toko (Mac poller, not public listings).
--
-- WHY. Sellers paste a Shopee URL first, then fill kabar/kontak while Steven's
-- Mac drains this queue (~1 min budget). Result lands in ext_shop_claim_snapshots
-- (same private snap as the extension). Extension stays the backup if the job
-- fails or times out. Never merges into public.listings.
--
-- PATTERN. Contabo queue + Mac poll (same house style as item_detail_queue /
-- scrape_keywords). No HTTP webhook to the laptop.

begin;
set local statement_timeout to '600s';

create table if not exists public.ext_shop_scrape_jobs (
  id           uuid        primary key default gen_random_uuid(),
  client_id    uuid        not null,
  source_url   text        not null,
  shop_id      bigint,
  store_name   text        not null default '',
  status       text        not null default 'pending'
               check (status in ('pending', 'claimed', 'done', 'failed')),
  snap_id      uuid        references public.ext_shop_claim_snapshots(id),
  claimed_by   text,
  claimed_at   timestamptz,
  finished_at  timestamptz,
  error        text,
  created_at   timestamptz not null default now()
);

comment on table public.ext_shop_scrape_jobs is
  'Alat paste-URL → Mac shop scrape. SPA polls by (id, client_id). '
  'Done jobs point at ext_shop_claim_snapshots; never public.listings.';

create index if not exists ext_shop_scrape_jobs_pending_idx
  on public.ext_shop_scrape_jobs (created_at)
  where status in ('pending', 'claimed');

create index if not exists ext_shop_scrape_jobs_client_idx
  on public.ext_shop_scrape_jobs (client_id, created_at desc);

alter table public.ext_shop_scrape_jobs enable row level security;
revoke all on table public.ext_shop_scrape_jobs from public, anon, authenticated;
grant select, insert, update on table public.ext_shop_scrape_jobs to service_role;

-- Well-known install_id for Mac-written claim snapshots (rate-limit subject).
-- Not a Chrome install; still goes through ext_claim_shop_snapshot shape via
-- complete_shop_scrape inserting the snap row directly.
-- Fixed uuid kept in sync with shop_claim_worker.py.

-- ── request (SPA / anon) ────────────────────────────────────────────────────
drop function if exists public.request_shop_scrape(uuid, text, bigint, text);
create function public.request_shop_scrape(
  p_client     uuid,
  p_source_url text,
  p_shop_id    bigint default null,
  p_store_name text default null
) returns json
language plpgsql
security definer
set search_path = public
set statement_timeout = '8s'
as $$
declare
  v_url   text := left(nullif(btrim(coalesce(p_source_url, '')), ''), 600);
  v_name  text := left(coalesce(btrim(p_store_name), ''), 200);
  v_n     int;
  v_id    uuid;
  v_exist public.ext_shop_scrape_jobs%rowtype;
begin
  if p_client is null or v_url is null then
    return json_build_object('ok', false, 'reason', 'bad_args');
  end if;
  if v_url !~* 'shopee\.(co\.id|sg|com)' and v_url !~* '^https?://' then
    -- Allow bare shopee.co.id/... paths the SPA normalizes.
    if v_url !~* 'shopee\.' then
      return json_build_object('ok', false, 'reason', 'bad_url');
    end if;
  end if;

  -- Reuse a fresh open job for the same client+url (idempotent double-submit).
  select * into v_exist
    from public.ext_shop_scrape_jobs j
   where j.client_id = p_client
     and j.source_url = v_url
     and j.status in ('pending', 'claimed')
     and j.created_at > now() - interval '30 minutes'
   order by j.created_at desc
   limit 1;
  if found then
    return json_build_object(
      'ok', true,
      'job_id', v_exist.id,
      'status', v_exist.status,
      'reused', true
    );
  end if;

  select count(*)::int into v_n
    from public.ext_shop_scrape_jobs j
   where j.client_id = p_client
     and j.created_at > now() - interval '1 day';
  if v_n >= 15 then
    return json_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  insert into public.ext_shop_scrape_jobs
    (client_id, source_url, shop_id, store_name, status)
  values (
    p_client,
    v_url,
    case when p_shop_id is not null and p_shop_id > 0 then p_shop_id else null end,
    v_name,
    'pending'
  )
  returning id into v_id;

  return json_build_object('ok', true, 'job_id', v_id, 'status', 'pending');
end $$;

comment on function public.request_shop_scrape(uuid, text, bigint, text) is
  'Alat: enqueue shop URL scrape for Mac poller. Capability = client_id. '
  '15 jobs / client / day. Does not write public.listings.';

revoke all on function public.request_shop_scrape(uuid, text, bigint, text) from public;
grant execute on function public.request_shop_scrape(uuid, text, bigint, text)
  to anon, authenticated, service_role;

-- ── poll (SPA) ──────────────────────────────────────────────────────────────
drop function if exists public.get_shop_scrape_job(uuid, uuid);
create function public.get_shop_scrape_job(
  p_job_id  uuid,
  p_client  uuid
) returns json
language plpgsql
stable
security definer
set search_path = public
set statement_timeout = '5s'
as $$
declare
  v public.ext_shop_scrape_jobs%rowtype;
begin
  if p_job_id is null or p_client is null then
    return json_build_object('ok', false, 'reason', 'bad_args');
  end if;

  select * into v
    from public.ext_shop_scrape_jobs
   where id = p_job_id
     and client_id = p_client;

  if not found then
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;

  return json_build_object(
    'ok', true,
    'job_id', v.id,
    'status', v.status,
    'shop_id', v.shop_id,
    'store_name', v.store_name,
    'snap_id', v.snap_id,
    'error', v.error,
    'created_at', v.created_at,
    'finished_at', v.finished_at
  );
end $$;

comment on function public.get_shop_scrape_job(uuid, uuid) is
  'SPA poll for on-demand shop scrape. Requires matching client_id.';

revoke all on function public.get_shop_scrape_job(uuid, uuid) from public;
grant execute on function public.get_shop_scrape_job(uuid, uuid)
  to anon, authenticated, service_role;

-- ── claim (Mac / service_role) ──────────────────────────────────────────────
drop function if exists public.claim_shop_scrape_jobs(text, int);
create function public.claim_shop_scrape_jobs(
  p_host  text,
  p_limit int default 1
) returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '10s'
as $$
declare
  v_host text := left(nullif(btrim(coalesce(p_host, '')), ''), 80);
  v_lim  int := greatest(1, least(coalesce(p_limit, 1), 5));
  v_out  jsonb;
begin
  if v_host is null then
    return '[]'::jsonb;
  end if;

  update public.ext_shop_scrape_jobs
     set status = 'pending',
         claimed_by = null,
         claimed_at = null
   where status = 'claimed'
     and claimed_at < now() - interval '8 minutes';

  with next as (
    select j.id
      from public.ext_shop_scrape_jobs j
     where j.status = 'pending'
     order by j.created_at
     limit v_lim
     for update skip locked
  ),
  claimed as (
    update public.ext_shop_scrape_jobs j
       set status = 'claimed',
           claimed_by = v_host,
           claimed_at = now()
      from next n
     where j.id = n.id
     returning j.id, j.source_url, j.shop_id, j.store_name, j.client_id, j.created_at
  )
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'id', c.id,
             'source_url', c.source_url,
             'shop_id', c.shop_id,
             'store_name', c.store_name,
             'client_id', c.client_id,
             'created_at', c.created_at
           )
         ), '[]'::jsonb)
    into v_out
    from claimed c;

  return coalesce(v_out, '[]'::jsonb);
end $$;

comment on function public.claim_shop_scrape_jobs(text, int) is
  'Mac poller: lease pending shop-scrape jobs. service_role only.';

revoke all on function public.claim_shop_scrape_jobs(text, int) from public, anon, authenticated;
grant execute on function public.claim_shop_scrape_jobs(text, int) to service_role;

-- ── complete (Mac) → private snapshot ───────────────────────────────────────
drop function if exists public.complete_shop_scrape(uuid, text, boolean, bigint, text, jsonb, text);
create function public.complete_shop_scrape(
  p_job_id     uuid,
  p_host       text,
  p_ok         boolean,
  p_shop_id    bigint default null,
  p_store_name text default null,
  p_listings   jsonb default '[]'::jsonb,
  p_error      text default null
) returns json
language plpgsql
security definer
set search_path = public
set statement_timeout = '15s'
as $$
declare
  v_job     public.ext_shop_scrape_jobs%rowtype;
  v_host    text := left(nullif(btrim(coalesce(p_host, '')), ''), 80);
  v_clean   jsonb;
  v_snap    uuid;
  v_install uuid := 'a1111111-1111-4111-8111-111111111111'::uuid;
  v_shop    bigint;
  v_name    text;
begin
  if p_job_id is null or v_host is null then
    return json_build_object('ok', false, 'reason', 'bad_args');
  end if;

  select * into v_job
    from public.ext_shop_scrape_jobs
   where id = p_job_id
   for update;

  if not found then
    return json_build_object('ok', false, 'reason', 'not_found');
  end if;
  if v_job.status not in ('claimed', 'pending') then
    return json_build_object(
      'ok', true,
      'status', v_job.status,
      'snap_id', v_job.snap_id,
      'already', true
    );
  end if;
  if v_job.status = 'claimed' and v_job.claimed_by is distinct from v_host then
    return json_build_object('ok', false, 'reason', 'not_owner');
  end if;

  if not coalesce(p_ok, false) then
    update public.ext_shop_scrape_jobs
       set status = 'failed',
           finished_at = now(),
           error = left(coalesce(p_error, 'failed'), 400)
     where id = p_job_id;
    return json_build_object('ok', true, 'status', 'failed');
  end if;

  v_shop := coalesce(
    case when p_shop_id is not null and p_shop_id > 0 then p_shop_id end,
    v_job.shop_id
  );
  if v_shop is null or v_shop <= 0 then
    update public.ext_shop_scrape_jobs
       set status = 'failed',
           finished_at = now(),
           error = 'no_shop_id'
     where id = p_job_id;
    return json_build_object('ok', false, 'reason', 'no_shop_id');
  end if;

  v_name := left(coalesce(nullif(btrim(p_store_name), ''), nullif(btrim(v_job.store_name), ''),
                          'Toko ' || v_shop::text), 200);

  select coalesce(jsonb_agg(x.row order by x.ord), '[]'::jsonb)
    into v_clean
    from (
      select e.ord,
             jsonb_build_object(
               'item_id',      (e.el->>'item_id')::bigint,
               'shop_id',      v_shop,
               'product_name', left(nullif(btrim(e.el->>'product_name'), ''), 500),
               'price',        coalesce(nullif(e.el->>'price', '')::numeric, 0),
               'total_sold',   coalesce(nullif(e.el->>'total_sold', '')::int, 0),
               'reviews',      coalesce(nullif(e.el->>'reviews', '')::int, 0),
               'rating',       coalesce(nullif(e.el->>'rating', '')::numeric, 0),
               'image_url',    left(nullif(e.el->>'image_url', ''), 400),
               'category',     left(nullif(btrim(e.el->>'category'), ''), 120),
               'keyword',      left(nullif(btrim(e.el->>'keyword'), ''), 160)
             ) as row
        from jsonb_array_elements(coalesce(p_listings, '[]'::jsonb))
             with ordinality as e(el, ord)
       where (e.el->>'item_id') ~ '^[0-9]+$'
         and (e.el->>'item_id')::bigint > 0
         and coalesce(nullif(e.el->>'price', '')::numeric, 0) between 0 and 100000000
         and coalesce(nullif(e.el->>'total_sold', '')::int, 0) between 0 and 5000000
         and coalesce(nullif(e.el->>'rating', '')::numeric, 0) between 0 and 5
       limit 40
    ) x;

  -- Ensure ext_installs row exists for the Mac sentinel (FK-free but used by claim RPC).
  insert into public.ext_installs (install_id, day, version)
       values (v_install, public._usage_day(), 'mac_shop')
  on conflict (install_id) do update
    set last_seen_at = now(),
        day = public._usage_day(),
        version = 'mac_shop';

  insert into public.ext_shop_claim_snapshots
    (install_id, shop_id, store_name, listings, source_url)
  values (
    v_install,
    v_shop,
    v_name,
    coalesce(v_clean, '[]'::jsonb),
    v_job.source_url
  )
  returning id into v_snap;

  update public.ext_shop_scrape_jobs
     set status = 'done',
         shop_id = v_shop,
         store_name = v_name,
         snap_id = v_snap,
         finished_at = now(),
         error = null
   where id = p_job_id;

  return json_build_object(
    'ok', true,
    'status', 'done',
    'snap_id', v_snap,
    'shop_id', v_shop,
    'n', coalesce(jsonb_array_length(v_clean), 0)
  );
end $$;

comment on function public.complete_shop_scrape(uuid, text, boolean, bigint, text, jsonb, text) is
  'Mac: finish shop scrape → private claim snapshot. service_role only.';

revoke all on function public.complete_shop_scrape(uuid, text, boolean, bigint, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.complete_shop_scrape(uuid, text, boolean, bigint, text, jsonb, text)
  to service_role;

notify pgrst, 'reload schema';
commit;
