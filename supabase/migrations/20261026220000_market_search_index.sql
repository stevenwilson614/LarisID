-- Market search index: vocabulary, keyword rows, brand names, sense rules.
-- resolve_market (next migration) is the only search path the app should call.
--
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20261026220000_market_search_index.sql
-- Then:  select public.rebuild_market_search(false);  -- keywords + brands, no title scan
--        select public.rebuild_market_vocab(true);    -- optional title-token pass

begin;

create extension if not exists pg_trgm;

-- ── vocabulary (spell-correct against words we actually stock) ──────────────
create table if not exists public.market_vocab (
  token     text primary key,
  df        int  not null default 0,
  in_keyword boolean not null default false,
  in_title   boolean not null default false,
  skeleton  text not null default ''
);

create index if not exists market_vocab_trgm_idx
  on public.market_vocab using gin (token gin_trgm_ops);
create index if not exists market_vocab_skeleton_idx
  on public.market_vocab (skeleton);

-- ── one row per scrape keyword ──────────────────────────────────────────────
create table if not exists public.market_index (
  keyword        text primary key,
  kind           text not null default 'unknown'
                   check (kind in ('product', 'brand', 'shop', 'modifier', 'unknown')),
  parent_keyword text,
  brand          text,
  aliases        text[] not null default '{}',
  tokens         text[] not null default '{}',
  canonical      text,
  n_listings     int,
  omset_top15    bigint,
  source         text not null default 'rule'
                   check (source in ('rule', 'ai', 'manual')),
  updated_at     timestamptz not null default now()
);

create index if not exists market_index_tokens_idx
  on public.market_index using gin (tokens);
create index if not exists market_index_kind_idx
  on public.market_index (kind);

-- Manual / AI edits win over the rule rebuild.
create table if not exists public.market_index_overrides (
  keyword        text primary key,
  kind           text,
  parent_keyword text,
  brand          text,
  aliases        text[],
  note           text,
  updated_at     timestamptz not null default now()
);

-- ── alias → canonical (typo, synonym, phrase, brand spelling) ───────────────
create table if not exists public.market_aliases (
  alias     text primary key,
  canonical text not null,
  kind      text not null check (kind in ('typo', 'synonym', 'phrase', 'brand')),
  source    text not null default 'seed'
);

-- ── brands we can name even when Shopee has zero listings ───────────────────
create table if not exists public.market_brand_names (
  brand    text primary key,
  aliases  text[] not null default '{}',
  n_titles int not null default 0,
  source   text not null default 'seed'
);

create table if not exists public.market_brands (
  brand    text not null,
  keyword  text not null,
  n_titles int  not null,
  primary key (brand, keyword)
);

create index if not exists market_brands_brand_idx on public.market_brands (brand);

-- Known false-friend clashes. resolve_market drops a market whose keyword
-- matches drop_re unless it also matches keep_re, when the query matches query_re.
create table if not exists public.search_sense_rules (
  id       text primary key,
  query_re text not null,
  drop_re  text not null,
  keep_re  text
);

insert into public.search_sense_rules (id, query_re, drop_re, keep_re) values
  ('bare_wine', '(^| )wine( |$)', '(celana|dress|gaun|hijab|blouse|rok|kemeja|pants)', '(anggur|gelas|botol|opener|decanter)'),
  ('olive_oil', '(olive oil|minyak zaitun|minyak olive|cooking oil)', '(oli motor|oli mesin|oli gardan|^oli |celana|dress|gaun|hijab|kemeja|rok|blouse)', '(minyak|zaitun)'),
  ('rayban', '(ray ?ban)', '(kaca film|raben|riben)', '(kacamata|sunglasses|ray)')
on conflict (id) do nothing;

-- Typos and phrase bridges. Topical expansions (ayam → pakan ayam) are NOT
-- here: those used to turn a dish search into cat food.
insert into public.market_aliases (alias, canonical, kind) values
  ('grepuk', 'geprek', 'typo'),
  ('geprekk', 'geprek', 'typo'),
  ('sandel', 'sandal', 'typo'),
  ('sendal', 'sandal', 'typo'),
  ('galang', 'gelang', 'typo'),
  ('choper', 'chopper', 'typo'),
  ('kristick', 'kristik', 'typo'),
  ('futsol', 'futsal', 'typo'),
  ('futsal', 'futsal', 'synonym'),
  ('cross stitch', 'kristik', 'phrase'),
  ('crosstitch', 'kristik', 'phrase'),
  ('tusuk silang', 'kristik', 'phrase'),
  ('setik silang', 'kristik', 'phrase'),
  ('beads bracelet', 'gelang manik', 'phrase'),
  ('bead bracelet', 'gelang manik', 'phrase'),
  ('galang manik', 'gelang manik', 'phrase'),
  ('choper elektrik', 'chopper elektrik', 'phrase'),
  ('choper electric', 'chopper elektrik', 'phrase'),
  ('chopper electric', 'chopper elektrik', 'phrase'),
  ('olive oil', 'minyak zaitun', 'phrase'),
  ('minyak olive', 'minyak zaitun', 'phrase'),
  ('dresses', 'dress', 'synonym'),
  ('gaun', 'dress', 'synonym'),
  ('backpack', 'tas ransel', 'synonym'),
  ('women clothes', 'baju wanita', 'phrase')
on conflict (alias) do update set canonical = excluded.canonical, kind = excluded.kind;

insert into public.market_brand_names (brand, aliases, source) values
  ('birkenstock', array['birkenstok','birken','birkenstocks'], 'seed'),
  ('sorel',       array['sorel'], 'seed'),
  ('rayban',      array['ray-ban','ray ban','rayban'], 'seed'),
  ('crocs',       array['crocs','croc'], 'seed'),
  ('nike',        array['nike'], 'seed'),
  ('adidas',      array['adidas'], 'seed'),
  ('skechers',    array['skechers','skecher'], 'seed'),
  ('converse',    array['converse'], 'seed'),
  ('puma',        array['puma'], 'seed'),
  ('wardah',      array['wardah'], 'seed'),
  ('emina',       array['emina'], 'seed'),
  ('somethinc',   array['somethinc','somethinginc'], 'seed'),
  ('scarlett',    array['scarlett'], 'seed'),
  ('logitech',    array['logitech'], 'seed'),
  ('philips',     array['philips'], 'seed'),
  ('samsung',     array['samsung'], 'seed'),
  ('xiaomi',      array['xiaomi'], 'seed'),
  ('miniso',      array['miniso'], 'seed'),
  ('yupi',        array['yupi'], 'seed')
on conflict (brand) do update
  set aliases = (select array(select distinct x from unnest(market_brand_names.aliases || excluded.aliases) x));

alter table public.market_vocab          enable row level security;
alter table public.market_index          enable row level security;
alter table public.market_index_overrides enable row level security;
alter table public.market_aliases        enable row level security;
alter table public.market_brand_names    enable row level security;
alter table public.market_brands         enable row level security;
alter table public.search_sense_rules    enable row level security;

-- Read-only for the app. Writes go through security-definer rebuild / admin RPCs.
drop policy if exists market_vocab_read on public.market_vocab;
create policy market_vocab_read on public.market_vocab for select to anon, authenticated using (true);
drop policy if exists market_index_read on public.market_index;
create policy market_index_read on public.market_index for select to anon, authenticated using (true);
drop policy if exists market_aliases_read on public.market_aliases;
create policy market_aliases_read on public.market_aliases for select to anon, authenticated using (true);
drop policy if exists market_brand_names_read on public.market_brand_names;
create policy market_brand_names_read on public.market_brand_names for select to anon, authenticated using (true);
drop policy if exists market_brands_read on public.market_brands;
create policy market_brands_read on public.market_brands for select to anon, authenticated using (true);
drop policy if exists search_sense_read on public.search_sense_rules;
create policy search_sense_read on public.search_sense_rules for select to anon, authenticated using (true);

grant select on public.market_vocab, public.market_index, public.market_aliases,
  public.market_brand_names, public.market_brands, public.search_sense_rules
  to anon, authenticated;

-- ── helpers ─────────────────────────────────────────────────────────────────
create or replace function public._market_skeleton(p text)
returns text
language sql
immutable
as $$
  select coalesce((
    select string_agg(ch, '' order by ch)
    from regexp_split_to_table(
           regexp_replace(lower(coalesce(p, '')), '[aeiou]', '', 'g'), ''
         ) ch
    where ch ~ '^[a-z0-9]$'
  ), '');
$$;

create or replace function public._market_levenshtein(a text, b text)
returns int
language plpgsql
immutable
as $$
declare
  la int := length(a);
  lb int := length(b);
  prev int[];
  curr int[];
  i int;
  j int;
  cost int;
begin
  if a is null or b is null then return 99; end if;
  if la > 32 or lb > 32 then return 99; end if;
  if a = b then return 0; end if;
  prev := array(select g from generate_series(0, lb) g);
  for i in 1..la loop
    curr := array_fill(0, array[lb + 1]);
    curr[1] := i;
    for j in 1..lb loop
      cost := case when substr(a, i, 1) = substr(b, j, 1) then 0 else 1 end;
      curr[j + 1] := least(curr[j] + 1, prev[j + 1] + 1, prev[j] + cost);
    end loop;
    prev := curr;
  end loop;
  return prev[lb + 1];
end $$;

create or replace function public._market_word_re(p_tok text)
returns text
language sql
immutable
as $$
  select '(^|[^a-z0-9])'
      || regexp_replace(lower(coalesce(p_tok, '')), '([^a-z0-9])', '\\\1', 'g')
      || '([^a-z0-9]|$)';
$$;

-- Spell-correct one token against market_vocab. In-vocab tokens are kept,
-- so "boots" never becomes "booth" and "birkenstok" (a real keyword) stays.
create or replace function public._market_correct_token(p_tok text)
returns text
language plpgsql
stable
as $$
declare
  v_alias text;
  v_best text;
  v_best_sim real;
  v_best_df int;
  v_sk text;
  r record;
  v_dist int;
  v_second int := 99;
begin
  if p_tok is null or length(p_tok) < 5 then return p_tok; end if;

  select canonical into v_alias
    from public.market_aliases
   where alias = p_tok and kind in ('typo', 'synonym')
   limit 1;
  if v_alias is not null and position(' ' in v_alias) = 0 then
    return v_alias;
  end if;

  if exists (select 1 from public.market_vocab where token = p_tok) then
    return p_tok;
  end if;

  -- Plural fold: dresses → dress, when the stem is a real word.
  if right(p_tok, 2) = 'es'
     and exists (select 1 from public.market_vocab where token = left(p_tok, -2)) then
    return left(p_tok, -2);
  end if;
  if right(p_tok, 1) = 's' and length(p_tok) > 4
     and exists (select 1 from public.market_vocab where token = left(p_tok, -1)) then
    return left(p_tok, -1);
  end if;

  select v.token, similarity(v.token, p_tok), v.df
    into v_best, v_best_sim, v_best_df
    from public.market_vocab v
   where v.token % p_tok
     and left(v.token, 1) = left(p_tok, 1)
     and left(v.token, least(3, length(p_tok))) = left(p_tok, least(3, length(p_tok)))
     and abs(length(v.token) - length(p_tok)) <= 2
   order by similarity(v.token, p_tok) desc, v.df desc
   limit 1;
  if v_best is not null and v_best_sim >= 0.45
     and not (p_tok in ('boot', 'boots') and v_best = 'booth')
     and not (p_tok = 'booth' and v_best in ('boot', 'boots')) then
    return v_best;
  end if;

  v_best := null;
  v_best_df := -1;
  for r in
    select token, df from public.market_vocab
     where left(token, 1) = left(p_tok, 1)
       and left(token, least(3, length(p_tok))) = left(p_tok, least(3, length(p_tok)))
       and abs(length(token) - length(p_tok)) <= 1
       and length(token) between 4 and 24
     order by df desc
     limit 300
  loop
    v_dist := public._market_levenshtein(p_tok, r.token);
    if v_dist <= 1 and r.df > v_best_df
       and not (p_tok in ('boot', 'boots') and r.token = 'booth')
       and not (p_tok = 'booth' and r.token in ('boot', 'boots')) then
      if v_best is not null and v_dist = 1 then v_second := 1; end if;
      v_best := r.token;
      v_best_df := r.df;
    end if;
  end loop;
  if v_best is not null then return v_best; end if;

  -- Consonant skeleton: grepuk / geprek share gkpr and levenshtein 3.
  v_sk := public._market_skeleton(p_tok);
  if length(p_tok) >= 5 and length(v_sk) >= 3 then
    v_best := null;
    v_best_df := -1;
    v_second := 99;
    for r in
      select token, df from public.market_vocab
       where skeleton = v_sk
         and abs(length(token) - length(p_tok)) <= 2
         and left(token, least(3, length(p_tok))) = left(p_tok, least(3, length(p_tok)))
       order by df desc
       limit 8
    loop
      v_dist := public._market_levenshtein(p_tok, r.token);
      if v_dist <= 3 and r.df > v_best_df then
        v_second := case when v_best is null then 99 else 0 end;
        v_best := r.token;
        v_best_df := r.df;
      end if;
    end loop;
    if v_best is not null and v_second > 0 then return v_best; end if;
  end if;

  return p_tok;
end $$;

-- ── rebuilds ────────────────────────────────────────────────────────────────
create or replace function public.rebuild_market_vocab(p_titles boolean default false)
returns int
language plpgsql
security definer
set search_path = public
set statement_timeout = '1800s'
as $$
declare
  v_n int;
begin
  delete from public.market_vocab;

  insert into public.market_vocab (token, df, in_keyword, in_title, skeleton)
  select tok, count(*)::int, true, false, public._market_skeleton(tok)
    from (
      select distinct lower(k.keyword) as keyword,
             w as tok
        from (
          select keyword from public.product_types_v where city = 'ALL'
          union
          select keyword from public.scrape_keywords where active
        ) k,
        lateral regexp_split_to_table(lower(k.keyword), '[^a-z0-9]+') w
       where length(w) between 3 and 24
    ) s
   group by tok;

  -- Words that are not keywords but must be correctable (dish names, etc.).
  insert into public.market_vocab (token, df, in_keyword, in_title, skeleton) values
    ('geprek', 400, false, true, public._market_skeleton('geprek')),
    ('futsal', 200, false, true, public._market_skeleton('futsal')),
    ('chopper', 200, false, true, public._market_skeleton('chopper')),
    ('birkenstock', 200, false, true, public._market_skeleton('birkenstock')),
    ('sandal', 2000, true, true, public._market_skeleton('sandal')),
    ('sepatu', 2000, true, true, public._market_skeleton('sepatu')),
    ('boots', 800, true, true, public._market_skeleton('boots')),
    ('boot', 800, true, true, public._market_skeleton('boot')),
    ('kacamata', 400, true, true, public._market_skeleton('kacamata')),
    ('kristik', 200, true, true, public._market_skeleton('kristik')),
    ('gelang', 400, true, true, public._market_skeleton('gelang')),
    ('hijab', 400, true, true, public._market_skeleton('hijab')),
    ('tumbler', 200, true, true, public._market_skeleton('tumbler')),
    ('minyak', 400, true, true, public._market_skeleton('minyak')),
    ('zaitun', 80, false, true, public._market_skeleton('zaitun'))
  on conflict (token) do update
    set df = greatest(public.market_vocab.df, excluded.df),
        in_title = public.market_vocab.in_title or excluded.in_title,
        skeleton = excluded.skeleton;

  if p_titles then
    insert into public.market_vocab (token, df, in_keyword, in_title, skeleton)
    select tok, count(*)::int, false, true, public._market_skeleton(tok)
      from (
        select w as tok
          from (
            select product_name
              from public.listings_deduped
             where not is_offtopic and total_sold > 0 and product_name is not null
             order by total_sold desc
             limit 80000
          ) names,
          lateral regexp_split_to_table(lower(left(names.product_name, 80)), '[^a-z0-9]+') w
         where length(w) between 4 and 24
      ) s
     group by tok
    having count(*) >= 25
    on conflict (token) do update
      set df = greatest(public.market_vocab.df, excluded.df),
          in_title = true,
          skeleton = excluded.skeleton;
  end if;

  select count(*) into v_n from public.market_vocab;
  return v_n;
end $$;

create or replace function public.rebuild_market_index()
returns int
language plpgsql
security definer
set search_path = public
set statement_timeout = '600s'
as $$
declare v_n int;
begin
  insert into public.market_index as mi
    (keyword, kind, parent_keyword, brand, tokens, canonical, n_listings, omset_top15, source, updated_at)
  select
    p.keyword,
    case
      when p.keyword ~* '(official( store)?|olshop)$' then 'shop'
      when p.keyword ~* '\mofficial\M' then 'shop'
      when exists (
        select 1 from public.market_brand_names b
         where b.brand = lower(p.keyword) or lower(p.keyword) = any(b.aliases)
      ) then 'brand'
      else 'product'
    end,
    null,
    (select b.brand from public.market_brand_names b
      where b.brand = lower(p.keyword) or lower(p.keyword) = any(b.aliases)
      limit 1),
    coalesce((
      select array_agg(distinct w)
        from regexp_split_to_table(lower(p.keyword), '[^a-z0-9]+') w
       where length(w) >= 2
    ), '{}'),
    p.category_canonical,
    p.n_listings,
    p.omset_top15,
    'rule',
    now()
  from public.product_types_v p
  where p.city = 'ALL'
  on conflict (keyword) do update set
    tokens = excluded.tokens,
    canonical = excluded.canonical,
    n_listings = excluded.n_listings,
    omset_top15 = excluded.omset_top15,
    updated_at = now(),
    kind = case when mi.source in ('ai', 'manual') then mi.kind else excluded.kind end,
    brand = case when mi.source in ('ai', 'manual') then mi.brand else excluded.brand end,
    parent_keyword = case when mi.source in ('ai', 'manual') then mi.parent_keyword else mi.parent_keyword end;

  -- Overrides always win, including over a later AI pass.
  update public.market_index mi
     set kind = coalesce(o.kind, mi.kind),
         parent_keyword = coalesce(o.parent_keyword, mi.parent_keyword),
         brand = coalesce(o.brand, mi.brand),
         aliases = coalesce(o.aliases, mi.aliases),
         source = 'manual',
         updated_at = now()
    from public.market_index_overrides o
   where o.keyword = mi.keyword;

  select count(*) into v_n from public.market_index;
  return v_n;
end $$;

create or replace function public.rebuild_market_brands()
returns int
language plpgsql
security definer
set search_path = public
set statement_timeout = '1800s'
as $$
declare
  r record;
  a text;
  v_re text;
  v_n int;
begin
  -- PDP brands with enough mass, without dropping curated seeds.
  insert into public.market_brand_names (brand, n_titles, source)
  select lower(btrim(brand)), count(*)::int, 'pdp'
    from public.product_details
   where brand is not null
     and length(btrim(brand)) between 3 and 32
     and btrim(brand) ~ '^[A-Za-z0-9][A-Za-z0-9 .&+-]{2,31}$'
   group by 1
  having count(*) >= 20
  on conflict (brand) do update
    set n_titles = greatest(public.market_brand_names.n_titles, excluded.n_titles);

  delete from public.market_brands;

  for r in select brand, aliases from public.market_brand_names loop
    foreach a in array (array[r.brand] || coalesce(r.aliases, '{}')) loop
      a := lower(btrim(a));
      if length(a) < 4 then continue; end if;
      v_re := public._market_word_re(a);
      insert into public.market_brands (brand, keyword, n_titles)
      select r.brand, d.keyword, count(*)::int
        from public.listings_deduped d
       where d.product_name ilike '%' || a || '%'
         and d.product_name ~* v_re
         and not d.is_offtopic
         and d.total_sold > 0
         and d.keyword is not null
       group by d.keyword
      having count(*) >= 2
      on conflict (brand, keyword) do update
        set n_titles = public.market_brands.n_titles + excluded.n_titles;
    end loop;

    update public.market_brand_names
       set n_titles = coalesce((
         select sum(n_titles)::int from public.market_brands mb where mb.brand = r.brand
       ), n_titles)
     where brand = r.brand;
  end loop;

  select count(*) into v_n from public.market_brands;
  return v_n;
end $$;

create or replace function public.rebuild_market_search(p_titles boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '1800s'
as $$
declare
  v_vocab int;
  v_index int;
  v_brands int;
begin
  v_vocab := public.rebuild_market_vocab(p_titles);
  v_index := public.rebuild_market_index();
  v_brands := public.rebuild_market_brands();
  return jsonb_build_object('vocab', v_vocab, 'index', v_index, 'brand_rows', v_brands);
end $$;

revoke all on function public.rebuild_market_vocab(boolean) from public, anon, authenticated;
revoke all on function public.rebuild_market_index() from public, anon, authenticated;
revoke all on function public.rebuild_market_brands() from public, anon, authenticated;
revoke all on function public.rebuild_market_search(boolean) from public, anon, authenticated;
revoke all on function public._market_correct_token(text) from public;
grant execute on function public._market_correct_token(text) to anon, authenticated;
grant execute on function public._market_skeleton(text) to anon, authenticated;
grant execute on function public._market_levenshtein(text, text) to anon, authenticated;
grant execute on function public._market_word_re(text) to anon, authenticated;

-- Append the market rebuild to the live matview refresh without rewriting the
-- rest of that function (it has drifted across migrations).
do $patch$
declare
  src text;
  needle text := 'perform public.rebuild_keyword_subgroups();';
  extra text := E'perform public.rebuild_keyword_subgroups();\n  perform public.rebuild_market_search(false);';
begin
  select pg_get_functiondef('public.refresh_breakout_matviews()'::regprocedure) into src;
  if src is not null and position('rebuild_market_search' in src) = 0
     and position(needle in src) > 0 then
    src := replace(src, needle, extra);
    execute src;
  end if;
exception when undefined_function then
  null;
end
$patch$;

notify pgrst, 'reload schema';

commit;
