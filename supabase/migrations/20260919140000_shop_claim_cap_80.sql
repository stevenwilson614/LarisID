-- Raise shop-claim snapshot listing cap 40 → 80 (shops like Originote ~54 SKUs).
begin;
set local statement_timeout to '120s';

create or replace function public.complete_shop_scrape(
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

-- Also raise extension claim batch cap for consistency.
create or replace function public.ext_claim_shop_snapshot(
  p_install    uuid,
  p_shop_id    bigint,
  p_store_name text,
  p_listings   jsonb,
  p_source_url text default null
) returns json
language plpgsql
security definer
set search_path = public
set statement_timeout = '10s'
as $$
declare
  v_day     date := public._usage_day();
  v_n       int;
  v_claims  int;
  v_clean   jsonb;
  v_id      uuid;
  v_inst    public.ext_installs%rowtype;
begin
  if p_install is null or p_shop_id is null or p_shop_id <= 0 then
    return json_build_object('ok', false, 'reason', 'bad_args');
  end if;

  v_n := coalesce(jsonb_array_length(p_listings), 0);
  if v_n > 80 then
    return json_build_object('ok', false, 'reason', 'bad_batch_size', 'n', v_n);
  end if;

  insert into public.ext_installs (install_id, day, version)
       values (p_install, v_day, 'claim')
  on conflict (install_id) do update
    set last_seen_at = now(),
        day          = v_day,
        rows_today   = case when public.ext_installs.day = v_day
                            then public.ext_installs.rows_today else 0 end,
        pages_today  = case when public.ext_installs.day = v_day
                            then public.ext_installs.pages_today else 0 end
  returning * into v_inst;

  if v_inst.blocked then
    return json_build_object('ok', false, 'reason', 'blocked');
  end if;

  select count(*)::int into v_claims
    from public.ext_shop_claim_snapshots s
   where s.install_id = p_install
     and s.created_at > now() - interval '1 day';
  if v_claims >= 20 then
    return json_build_object('ok', false, 'reason', 'rate_limited');
  end if;

  select coalesce(jsonb_agg(x.row order by x.ord), '[]'::jsonb)
    into v_clean
    from (
      select e.ord,
             jsonb_build_object(
               'item_id',      (e.el->>'item_id')::bigint,
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

  insert into public.ext_shop_claim_snapshots
    (install_id, shop_id, store_name, listings, source_url)
  values (
    p_install,
    p_shop_id,
    left(coalesce(btrim(p_store_name), ''), 200),
    coalesce(v_clean, '[]'::jsonb),
    left(nullif(p_source_url, ''), 600)
  )
  returning id into v_id;

  return json_build_object(
    'ok', true,
    'snap_id', v_id,
    'n', coalesce(jsonb_array_length(v_clean), 0)
  );
end $$;

notify pgrst, 'reload schema';
commit;
