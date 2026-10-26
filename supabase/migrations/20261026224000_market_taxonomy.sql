-- Market kind and parent. Unknown stays visible. Shop and brand drop off the
-- default product surfaces (home, category summary) until a parent is set;
-- the search resolver still returns them when someone names that brand.
--
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20261026224000_market_taxonomy.sql

begin;

create or replace function public.admin_market_review()
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '8s'
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(j)
      from (
        select jsonb_build_object(
                 'keyword', keyword,
                 'kind', kind,
                 'parent_keyword', parent_keyword,
                 'brand', brand,
                 'n_listings', n_listings,
                 'source', source
               ) as j
          from public.market_index
         where kind = 'unknown'
            or (kind in ('brand', 'shop') and parent_keyword is null)
         order by coalesce(n_listings, 0) desc, keyword
         limit 60
      ) s
  ), '[]'::jsonb);
end $$;

create or replace function public.admin_set_market_index(
  p_keyword text,
  p_kind text,
  p_parent text default null,
  p_brand text default null,
  p_aliases text[] default null,
  p_note text default null
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kw text := btrim(lower(coalesce(p_keyword, '')));
  v_kind text := btrim(lower(coalesce(p_kind, '')));
begin
  if not public.is_platform_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  if v_kind not in ('product', 'brand', 'shop', 'modifier', 'unknown') then
    return false;
  end if;
  if v_kw = '' then return false; end if;

  insert into public.market_index_overrides
    (keyword, kind, parent_keyword, brand, aliases, note, updated_at)
  values (
    v_kw, v_kind, nullif(btrim(coalesce(p_parent, '')), ''),
    nullif(btrim(coalesce(p_brand, '')), ''), p_aliases, left(coalesce(p_note, ''), 200), now()
  )
  on conflict (keyword) do update set
    kind = excluded.kind,
    parent_keyword = excluded.parent_keyword,
    brand = excluded.brand,
    aliases = coalesce(excluded.aliases, public.market_index_overrides.aliases),
    note = excluded.note,
    updated_at = now();

  update public.market_index
     set kind = v_kind,
         parent_keyword = nullif(btrim(coalesce(p_parent, '')), ''),
         brand = coalesce(nullif(btrim(coalesce(p_brand, '')), ''), brand),
         aliases = coalesce(p_aliases, aliases),
         source = 'manual',
         updated_at = now()
   where keyword = v_kw;
  return true;
end $$;

revoke all on function public.admin_market_review() from public, anon;
revoke all on function public.admin_set_market_index(text, text, text, text, text[], text) from public, anon;
grant execute on function public.admin_market_review() to authenticated;
grant execute on function public.admin_set_market_index(text, text, text, text, text[], text) to authenticated;

-- Append kind + parent onto the live view. CREATE OR REPLACE may only add
-- columns at the end, which is what this wrap does. Skip if already applied.
do $view$
declare
  def text;
begin
  select pg_get_viewdef('public.product_types_v'::regclass, true) into def;
  def := rtrim(btrim(coalesce(def, '')), ';');
  if def <> ''
     and def not ilike '%mi.kind%'
     and def not ilike '%market_index mi%' then
    execute
      'create or replace view public.product_types_v as '
      || 'select base.*, mi.kind, mi.parent_keyword '
      || 'from (' || def || ') base '
      || 'left join public.market_index mi on mi.keyword = base.keyword';
    raise notice 'product_types_v wrapped with kind, parent_keyword';
  else
    raise notice 'product_types_v wrap skipped';
  end if;
end
$view$;

-- Home top-15 and the category summary skip shop/brand markets. Unclassified
-- (unknown / no row yet) stays, so the homepage does not go blank before classify.
do $home$
declare
  src text;
  extra text := 'and coalesce((select mi.kind from public.market_index mi where mi.keyword = t.keyword), ''product'') in (''product'', ''unknown'')';
begin
  select pg_get_functiondef('public.listings_home(integer)'::regprocedure) into src;
  if src is not null and position('market_index mi' in src) = 0
     and position('t.wk_pct > 0' in src) > 0 then
    src := replace(src, 't.wk_pct > 0', 't.wk_pct > 0 ' || extra);
    execute src;
    raise notice 'listings_home filters shop/brand markets';
  else
    raise notice 'listings_home kind filter skipped';
  end if;
exception when undefined_function then
  null;
end
$home$;

do $ring$
declare
  src text;
  extra text := 'and coalesce((select mi.kind from public.market_index mi where mi.keyword = product_types_v.keyword), ''product'') in (''product'', ''unknown'')';
begin
  select pg_get_functiondef('public.ringkasan_kategori(integer)'::regprocedure) into src;
  if src is not null and position('market_index mi' in src) = 0
     and position('n_listings >= 3' in src) > 0 then
    src := replace(src, 'n_listings >= 3', 'n_listings >= 3 ' || extra);
    execute src;
    raise notice 'ringkasan_kategori filters shop/brand markets';
  else
    raise notice 'ringkasan_kategori kind filter skipped';
  end if;
exception when undefined_function then
  null;
end
$ring$;

notify pgrst, 'reload schema';

commit;
