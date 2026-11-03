-- Shop portraits: Contabo get-shop-logo can no longer call Shopee (403 / 90309999).
-- Mac shop scrapes already see get_shop_base; persist account.portrait into shop_logo_cache.

begin;
set local statement_timeout to '120s';

create or replace function public.complete_shop_scrape(
  p_job_id     uuid,
  p_host       text,
  p_ok         boolean,
  p_shop_id    bigint default null,
  p_store_name text default null,
  p_listings   jsonb default '[]'::jsonb,
  p_error      text default null,
  p_logo_url   text default null
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
  v_logo    text;
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

  v_logo := nullif(btrim(p_logo_url), '');
  if v_logo is not null
     and v_logo !~* '^https://(cf\.shopee\.co\.id|down-id\.img\.susercontent\.com)/file/[\w.-]+$' then
    v_logo := null;
  end if;
  if v_logo is not null then
    v_logo := left(v_logo, 400);
  end if;

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
       limit 80
    ) x;

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

  if v_logo is not null then
    insert into public.shop_logo_cache (shop_id, logo_url, fetched_at)
    values (v_shop, v_logo, now())
    on conflict (shop_id) do update
      set logo_url = excluded.logo_url,
          fetched_at = excluded.fetched_at;
  end if;

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
    'n', coalesce(jsonb_array_length(v_clean), 0),
    'logo', v_logo is not null
  );
end $$;

comment on function public.complete_shop_scrape(uuid, text, boolean, bigint, text, jsonb, text, text) is
  'Mac: finish shop scrape → private claim snapshot + optional shop_logo_cache. service_role only.';

revoke all on function public.complete_shop_scrape(uuid, text, boolean, bigint, text, jsonb, text, text)
  from public, anon, authenticated;
grant execute on function public.complete_shop_scrape(uuid, text, boolean, bigint, text, jsonb, text, text)
  to service_role;

-- Keep the prior 7-arg name callable (PostgREST may still bind old clients).
-- Dropping the old overload avoids ambiguity once the 8-arg form exists with defaults.
drop function if exists public.complete_shop_scrape(uuid, text, boolean, bigint, text, jsonb, text);

notify pgrst, 'reload schema';
commit;
