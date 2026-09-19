-- Shop-claim snapshots from the Chrome extension.
--
-- WHY. "Ini toko saya" used to open ?claim_shop= without writing anything.
-- My Toko then looked up mv_shops / listings_deduped and stalled when the
-- shop had never appeared in a keyword scrape. This path stores the products
-- already loaded on the seller's Shopee tab so Alat can paint My Toko in
-- seconds. It does NOT merge into public.listings (unknown_pair stays blocked).
--
-- SHAPE. Same house pattern as 20260913120000: staging table with NO anon
-- grant, SECURITY DEFINER RPCs that anon may execute. install_id is the
-- rate-limit subject (same as ext_ingest_listings). The SPA reads by snap
-- uuid because it cannot see chrome.storage.

begin;
set local statement_timeout to '600s';

create table if not exists public.ext_shop_claim_snapshots (
  id          uuid        primary key default gen_random_uuid(),
  install_id  uuid        not null,
  shop_id     bigint      not null,
  store_name  text        not null default '',
  listings    jsonb       not null default '[]'::jsonb,
  source_url  text,
  created_at  timestamptz not null default now()
);

comment on table public.ext_shop_claim_snapshots is
  'Private shop snapshots from the Chrome extension claim CTA. Read only via '
  'get_shop_claim_snapshot(). Never merged into public.listings. Rows older '
  'than 7 days are treated as expired by the getter.';

create index if not exists ext_shop_claim_snapshots_install_idx
  on public.ext_shop_claim_snapshots (install_id, created_at desc);
create index if not exists ext_shop_claim_snapshots_shop_idx
  on public.ext_shop_claim_snapshots (shop_id, created_at desc);

alter table public.ext_shop_claim_snapshots enable row level security;
revoke all on table public.ext_shop_claim_snapshots from public, anon, authenticated;
grant select, insert on table public.ext_shop_claim_snapshots to service_role;

-- ── write ───────────────────────────────────────────────────────────────────
drop function if exists public.ext_claim_shop_snapshot(uuid, bigint, text, jsonb, text);
create function public.ext_claim_shop_snapshot(
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
  if v_n > 40 then
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
       limit 40
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

comment on function public.ext_claim_shop_snapshot(uuid, bigint, text, jsonb, text) is
  'Chrome extension shop-claim write. Stages visible listings for My Toko. '
  'anon may execute; anon may NOT insert into the table. 20 claims / install / day.';

revoke all on function public.ext_claim_shop_snapshot(uuid, bigint, text, jsonb, text)
  from public;
grant execute on function public.ext_claim_shop_snapshot(uuid, bigint, text, jsonb, text)
  to anon, authenticated, service_role;

-- ── read ────────────────────────────────────────────────────────────────────
drop function if exists public.get_shop_claim_snapshot(uuid);
create function public.get_shop_claim_snapshot(p_snap_id uuid)
returns json
language plpgsql
stable
security definer
set search_path = public
set statement_timeout = '8s'
as $$
declare
  v public.ext_shop_claim_snapshots%rowtype;
begin
  if p_snap_id is null then
    return json_build_object('ok', false, 'reason', 'bad_args');
  end if;

  select * into v
    from public.ext_shop_claim_snapshots
   where id = p_snap_id
     and created_at > now() - interval '7 days';

  if not found then
    return json_build_object('ok', false, 'reason', 'expired');
  end if;

  return json_build_object(
    'ok', true,
    'snap_id', v.id,
    'shop_id', v.shop_id,
    'store_name', v.store_name,
    'listings', v.listings,
    'source_url', v.source_url,
    'created_at', v.created_at
  );
end $$;

comment on function public.get_shop_claim_snapshot(uuid) is
  'SPA read for a shop-claim snapshot. Capability is the uuid; expired after 7 days.';

revoke all on function public.get_shop_claim_snapshot(uuid) from public;
grant execute on function public.get_shop_claim_snapshot(uuid)
  to anon, authenticated, service_role;

-- ── keyword bridge ──────────────────────────────────────────────────────────
-- Snapshot rows often have no scrape keyword. Match titles (+ optional
-- category) against mv_keyword_weekly so Kompetitor / Analisa can use
-- listings_deduped peers.
drop function if exists public.match_titles_to_keywords(jsonb);
create function public.match_titles_to_keywords(p_titles jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
set statement_timeout = '8s'
as $$
  with titles as (
    select (e->>'item_id')::bigint as item_id,
           lower(left(btrim(coalesce(e->>'product_name', '')), 240)) as name,
           lower(left(btrim(coalesce(e->>'category', '')), 80)) as category
      from jsonb_array_elements(
             case
               when p_titles is null or jsonb_typeof(p_titles) <> 'array' then '[]'::jsonb
               when jsonb_array_length(p_titles) > 40
                 then jsonb_path_query_array(p_titles, '$[0 to 39]')
               else p_titles
             end
           ) e
     where (e->>'item_id') ~ '^[0-9]+$'
       and (e->>'item_id')::bigint > 0
       and length(btrim(coalesce(e->>'product_name', ''))) >= 4
  ),
  tok as (
    select distinct t.item_id, w as tok
      from titles t,
           unnest(regexp_split_to_array(t.name, '[^a-z0-9]+')) w
     where length(w) >= 4
  ),
  cands as (
    select k.keyword, lower(k.keyword) as kw_low, k.wk_units
      from public.mv_keyword_weekly k
     where exists (
             select 1 from tok t
              where position(t.tok in lower(k.keyword)) > 0
           )
     order by k.wk_units desc nulls last
     limit 800
  ),
  scored as (
    select t.item_id,
           c.keyword,
           (
             select count(*)::float
               from unnest(string_to_array(c.kw_low, ' ')) w
              where length(w) >= 2
                and position(w in t.name) > 0
           ) / greatest(cardinality(string_to_array(c.kw_low, ' ')), 1) as score,
           length(c.keyword) as kw_len,
           c.wk_units
      from titles t
      join cands c
        on position(split_part(c.kw_low, ' ', 1) in t.name) > 0
        or (t.category <> '' and position(split_part(c.kw_low, ' ', 1) in t.category) > 0)
  ),
  best as (
    select distinct on (item_id) item_id, keyword
      from scored
     where score >= 0.5
     order by item_id, score desc, kw_len desc, wk_units desc nulls last
  )
  select coalesce(jsonb_object_agg(item_id::text, keyword), '{}'::jsonb)
    from best
$$;

comment on function public.match_titles_to_keywords(jsonb) is
  'Map snapshot titles to scraped keywords for Kompetitor/Analisa. '
  'Input [{item_id, product_name, category?}]. Returns {item_id: keyword}.';

revoke all on function public.match_titles_to_keywords(jsonb) from public;
grant execute on function public.match_titles_to_keywords(jsonb)
  to anon, authenticated, service_role;

notify pgrst, 'reload schema';
commit;
