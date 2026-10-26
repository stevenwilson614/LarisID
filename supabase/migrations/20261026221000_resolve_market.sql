-- resolve_market: one search path. Spell-corrects against market_vocab, detects
-- brands, and returns a tier so the client can admit a miss instead of painting
-- cat food for "ayam grepuk" or tents for "sorel boots".
--
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20261026221000_resolve_market.sql

begin;

alter function public._market_correct_token(text) set search_path = public, extensions;

create or replace function public._market_token_hit(p_tokens text[], p_tok text)
returns boolean
language sql
immutable
as $$
  select p_tok = any(coalesce(p_tokens, '{}'))
      or (length(p_tok) > 4 and right(p_tok, 1) = 's' and left(p_tok, -1) = any(coalesce(p_tokens, '{}')))
      or (length(p_tok) >= 4 and (p_tok || 's') = any(coalesce(p_tokens, '{}')))
      or (length(p_tok) > 5 and right(p_tok, 2) = 'es' and left(p_tok, -2) = any(coalesce(p_tokens, '{}')))
$$;

create or replace function public.resolve_market(
  p_q text,
  p_city text default 'ALL',
  p_limit int default 12
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
set statement_timeout = '5000ms'
as $$
declare
  v_norm text;
  v_phrase text;
  v_corrected text;
  v_tok text;
  v_fix text;
  v_raw text[] := '{}';
  v_toks text[] := '{}';
  v_product text[] := '{}';
  v_brand text;
  v_brand_src text;
  v_brand_missing boolean := false;
  v_stop text[] := array[
    'cari','carikan','tolong','coba','tunjukkan','tampilkan','produk','barang','buat','untuk',
    'dijual','jual','jualan','yang','dong','aku','saya','mau','bisa','lagi','dan','apa','the',
    'terlaris','laris','trending','bagus','laku','how','about','what','show','me','find',
    'looking','for','any','some','please','with','and','or','ini','itu','dari','ke','di'
  ];
  v_filler text[] := array[
    'murah','original','import','kekinian','official','premium','ori',
    'asli','branded','new','hot','sale','cod','ready','stock','size','ukuran','warna','motif',
    'resmi','kw','super','best','seller','termurah'
  ];
  v_limit int := least(greatest(coalesce(p_limit, 12), 1), 24);
  v_city text := coalesce(nullif(btrim(p_city), ''), 'ALL');
  v_tier text := 'none';
  v_conf numeric := 0.1;
  v_chooser boolean := false;
  v_rare text;
  v_rare_df int := 1000000;
  v_df int;
  v_generic boolean;
  v_all_hit boolean;
  v_n int;
  v_markets jsonb := '[]'::jsonb;
  v_corrections jsonb := '[]'::jsonb;
  v_re text;
  v_head text[] := array[
    'ayam','ikan','daging','beras','air','kain','plastik','kertas','set','mini','jumbo',
    'wanita','pria','anak','bayi','original','import'
  ];
  v_hits text[] := '{}';
begin
  v_norm := btrim(regexp_replace(regexp_replace(lower(coalesce(p_q, '')), '[^a-z0-9 ]', ' ', 'g'), '\s+', ' ', 'g'));
  if length(v_norm) < 2 then
    return jsonb_build_object('tier','none','confidence',0,'query_norm',v_norm,'corrected_query',v_norm,
      'corrections','[]'::jsonb,'brand',null,'brand_missing',false,'chooser',false,'markets','[]'::jsonb);
  end if;

  select canonical into v_phrase
    from public.market_aliases
   where alias = v_norm and kind in ('phrase', 'synonym')
   limit 1;

  for v_tok in select w from regexp_split_to_table(v_norm, ' ') w loop
    if v_tok = any(v_stop) or length(v_tok) < 2 then continue; end if;
    if exists (
      select 1 from public.market_brand_names b
       where b.brand = v_tok or v_tok = any(b.aliases)
    ) then
      select b.brand into v_fix
        from public.market_brand_names b
       where b.brand = v_tok or v_tok = any(b.aliases)
       limit 1;
    else
      v_fix := public._market_correct_token(v_tok);
    end if;
    v_raw := v_raw || v_tok;
    v_toks := v_toks || v_fix;
    if v_fix is distinct from v_tok then
      v_corrections := v_corrections || jsonb_build_array(jsonb_build_object('from', v_tok, 'to', v_fix));
    end if;
  end loop;

  if v_phrase is not null then
    -- Search the canonical phrase (cross stitch → kristik), not the English tokens.
    v_toks := '{}';
    v_corrected := v_phrase;
    for v_tok in select w from regexp_split_to_table(v_phrase, ' ') w loop
      if length(v_tok) >= 2 and v_tok <> all(v_stop) then
        v_toks := v_toks || v_tok;
      end if;
    end loop;
  else
    v_corrected := array_to_string(v_toks, ' ');
    if v_corrected = '' then v_corrected := v_norm; end if;
  end if;

  -- Brand: a seeded/PDP brand token, or an unknown token sitting next to a real product word.
  foreach v_tok in array v_toks loop
    select b.brand into v_brand_src
      from public.market_brand_names b
     where b.brand = v_tok or v_tok = any(b.aliases)
     limit 1;
    if v_brand_src is not null then
      v_brand := v_brand_src;
      exit;
    end if;
  end loop;

  if v_brand is null then
    select b.brand into v_brand
      from public.market_brand_names b
     where b.brand in (v_norm, v_corrected)
        or v_norm = any(b.aliases)
        or v_corrected = any(b.aliases)
     limit 1;
  end if;

  if v_brand is null and cardinality(v_toks) >= 2 then
    -- Brand-first ("sorel boots"): the first token is unknown and a later token
    -- is a real product word. A trailing unknown word ("perlengkapan mendaki")
    -- is a product phrase, not a brand.
    v_tok := v_toks[1];
    if length(v_tok) >= 5
       and v_tok <> all(v_filler)
       and not exists (select 1 from public.market_vocab v where v.token = v_tok)
       and exists (
         select 1 from unnest(v_toks[2:cardinality(v_toks)]) u(t)
          where exists (select 1 from public.market_vocab v where v.token = t)
       ) then
      v_brand := v_tok;
    end if;
  end if;

  if v_brand is not null then
    v_brand_missing := not exists (
      select 1 from public.market_brands mb where mb.brand = v_brand
    );
  end if;

  foreach v_tok in array v_toks loop
    if v_tok = any(v_filler) then continue; end if;
    if v_brand is not null and (v_tok = v_brand or exists (
      select 1 from public.market_brand_names b
       where b.brand = v_brand and (v_tok = b.brand or v_tok = any(b.aliases))
    )) then continue; end if;
    if not (v_tok = any(v_product)) then
      v_product := v_product || v_tok;
    end if;
  end loop;

  -- Rarest product token. A lone generic noun (ayam, sandal) must not crown a market.
  foreach v_tok in array v_product loop
    select df into v_df from public.market_vocab where token = v_tok;
    v_df := coalesce(v_df, 0);
    if v_df < v_rare_df then
      v_rare_df := v_df;
      v_rare := v_tok;
    end if;
  end loop;
  v_generic := v_rare is not null and v_rare = any(v_head);

  if exists (
    select 1 from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname like 'pg_temp%' and c.relname = '_rm'
  ) then
    drop table pg_temp._rm;
  end if;
  create temp table _rm on commit drop as
  select mi.keyword, mi.kind, mi.parent_keyword, mi.n_listings, mi.omset_top15,
         0::numeric as score, false as exact_hit
    from public.market_index mi
   where false;

  -- Exact keyword or phrase bridge.
  insert into _rm (keyword, kind, parent_keyword, n_listings, omset_top15, score, exact_hit)
  select mi.keyword, mi.kind, mi.parent_keyword, mi.n_listings, mi.omset_top15, 100, true
    from public.market_index mi
   where mi.keyword in (v_norm, v_corrected)
      or v_norm = any(mi.aliases)
      or v_corrected = any(mi.aliases)
      or (v_phrase is not null and mi.keyword = v_phrase);

  -- Strong: every product token is a whole word of the keyword.
  if cardinality(v_product) >= 1 then
    insert into _rm (keyword, kind, parent_keyword, n_listings, omset_top15, score, exact_hit)
    select mi.keyword, mi.kind, mi.parent_keyword, mi.n_listings, mi.omset_top15,
           70 + least(coalesce(mi.n_listings, 0), 400) / 80.0, false
      from public.market_index mi
     where not exists (
             select 1 from unnest(v_product) u(t)
              where not public._market_token_hit(mi.tokens, t)
           )
       and mi.keyword not in (select keyword from _rm);
  end if;

  select count(*) into v_n from _rm where exact_hit;
  if v_n > 0 and (v_brand is null or exists (select 1 from _rm where exact_hit and kind = 'product'))
     and cardinality(v_product) >= 1 then
    v_tier := 'exact';
    v_conf := 0.95;
  elsif (select count(*) from _rm where not exact_hit) > 0
        and cardinality(v_product) >= 1
        and (cardinality(v_product) >= 2 or not v_generic or v_brand is null) then
    -- A single very common noun still matches, but as a chooser, not a confident exact.
    v_tier := 'strong';
    v_conf := case when cardinality(v_product) >= 2 then 0.82 else 0.7 end;
  end if;

  -- Brand tier wins when a brand was named and we did not land on an exact product keyword.
  if v_brand is not null and v_tier is distinct from 'exact' then
    delete from _rm where true;
    insert into _rm (keyword, kind, parent_keyword, n_listings, omset_top15, score, exact_hit)
    select mi.keyword, mi.kind, mi.parent_keyword, mi.n_listings, mi.omset_top15,
           mb.n_titles
             + case
                 when mi.keyword = v_brand
                   or v_brand = any(mi.aliases)
                   or exists (
                     select 1 from public.market_brand_names b
                      where b.brand = v_brand and mi.keyword = any(b.aliases)
                   ) then 5000
                 else 0
               end
             + case when public._market_token_hit(mi.tokens, v_brand) then 2000 else 0 end
             + case when cardinality(v_product) = 0 then 0
                    when not exists (
                      select 1 from unnest(v_product) u(t)
                       where not public._market_token_hit(mi.tokens, t)
                    ) then 400 else 0 end,
           false
      from public.market_brands mb
      join public.market_index mi on mi.keyword = mb.keyword
     where mb.brand = v_brand
       and mi.kind in ('product', 'brand', 'unknown')
     order by 6 desc
     limit v_limit;

    if not exists (select 1 from _rm) and cardinality(v_product) >= 1 then
      -- Brand has no titles (Sorel). Show the product-noun markets, not a substring accident.
      insert into _rm (keyword, kind, parent_keyword, n_listings, omset_top15, score, exact_hit)
      select mi.keyword, mi.kind, mi.parent_keyword, mi.n_listings, mi.omset_top15,
             50 + least(coalesce(mi.omset_top15, 0), 1000000000) / 100000000.0, false
        from public.market_index mi
       where mi.kind = 'product'
         and not exists (
           select 1 from unnest(v_product) u(t)
            where not public._market_token_hit(mi.tokens, t)
         )
       order by mi.omset_top15 desc nulls last
       limit v_limit;
    end if;

    if exists (select 1 from _rm) then
      v_tier := 'brand';
      v_conf := case when v_brand_missing then 0.55 else 0.78 end;
    end if;
  end if;

  -- Nearby: some real product tokens hit a market and some did not (hijab dinas
  -- → hijab). A hit that is only a head noun (ayam) does not count — that is how
  -- "ayam grepuk" became cat food. Those fall through to a title lift of the
  -- distinctive token (geprek → sambal kemasan).
  if v_tier = 'none' and cardinality(v_product) >= 1 then
    select coalesce(array_agg(t), '{}') into v_hits
      from unnest(v_product) t
     where t <> all(v_head)
       and exists (
         select 1 from public.market_index mi
          where mi.kind in ('product', 'unknown')
            and public._market_token_hit(mi.tokens, t)
       );
    if cardinality(v_hits) >= 1
       and cardinality(v_hits) < cardinality(v_product)
       and not exists (
         select 1 from unnest(v_product) m(t)
          where t <> all(v_hits)
            and length(t) >= 5
            and coalesce((select df from public.market_vocab v where v.token = t), 0) < 500
       ) then
      insert into _rm (keyword, kind, parent_keyword, n_listings, omset_top15, score, exact_hit)
      select mi.keyword, mi.kind, mi.parent_keyword, mi.n_listings, mi.omset_top15,
             30 + least(coalesce(mi.omset_top15, 0), 1000000000) / 100000000.0, false
        from public.market_index mi
       where mi.kind in ('product', 'unknown')
         and not exists (
           select 1 from unnest(v_hits) u(t)
            where not public._market_token_hit(mi.tokens, t)
         )
       order by mi.omset_top15 desc nulls last
       limit v_limit;
      if exists (select 1 from _rm) then
        v_tier := 'nearby';
        v_conf := 0.35;
      end if;
    end if;
  end if;

  -- Anchor for title scans: the distinctive token, never a head noun like "ayam".
  if v_tier = 'none' then
    select t into v_rare
      from unnest(v_product) t
     where t <> all(v_head) and length(t) >= 4
     order by coalesce((select df from public.market_vocab v where v.token = t), 0), length(t) desc
     limit 1;
    select coalesce(df, 0) into v_rare_df from public.market_vocab where token = v_rare;
    v_rare_df := coalesce(v_rare_df, 0);
  end if;

  -- Every product token in one title (aksesoris + motor) before a one-word lift.
  if v_tier = 'none' and cardinality(v_product) >= 2 and v_rare is not null then
    begin
      insert into _rm (keyword, kind, parent_keyword, n_listings, omset_top15, score, exact_hit)
      select mi.keyword, mi.kind, mi.parent_keyword, mi.n_listings, mi.omset_top15, s.n, false
        from (
          select d.keyword, count(*)::numeric as n
            from public.listings_deduped d
           where d.product_name ilike '%' || v_rare || '%'
             and not d.is_offtopic
             and d.total_sold > 0
             and not exists (
               select 1 from unnest(v_product) u(t)
                where length(t) >= 3
                  and d.product_name !~* public._market_word_re(t)
                  and d.keyword !~* public._market_word_re(t)
             )
           group by d.keyword
           order by count(*) desc
           limit 8
        ) s
        join public.market_index mi on mi.keyword = s.keyword
       where mi.kind in ('product', 'unknown');
    exception when others then
      null;
    end;
    if exists (select 1 from _rm) then
      v_tier := 'title';
      v_conf := 0.6;
    end if;
  end if;

  -- One-word title lift only when the words never appear together. Never scan on "ayam".
  if v_tier = 'none' and v_rare is not null and v_rare <> all(v_head) and v_rare_df < 1200 then
    v_re := public._market_word_re(v_rare);
    begin
      insert into _rm (keyword, kind, parent_keyword, n_listings, omset_top15, score, exact_hit)
      select mi.keyword, mi.kind, mi.parent_keyword, mi.n_listings, mi.omset_top15, s.n, false
        from (
          select d.keyword, count(*)::numeric as n
            from public.listings_deduped d
           where d.product_name ilike '%' || v_rare || '%'
             and d.product_name ~* v_re
             and not d.is_offtopic
             and d.total_sold > 0
           group by d.keyword
           order by count(*) desc
           limit 8
        ) s
        join public.market_index mi on mi.keyword = s.keyword
       where mi.kind in ('product', 'unknown')
         and mi.keyword !~* '\mbooth\M';
    exception when others then
      null;
    end;
    if exists (select 1 from _rm) then
      v_tier := 'nearby';
      v_conf := 0.35;
    end if;
  end if;

  -- Sense rules (wine vs celana wine, olive oil vs oli motor).
  delete from _rm r
   using public.search_sense_rules s
   where v_norm ~* s.query_re
     and r.keyword ~* s.drop_re
     and (s.keep_re is null or r.keyword !~* s.keep_re);

  if v_tier in ('exact', 'strong') and (select count(*) from _rm) >= 2
     and not exists (select 1 from _rm where keyword = v_norm or keyword = v_corrected) then
    v_chooser := true;
  end if;
  if v_tier = 'strong' and cardinality(v_product) = 1 and (select count(*) from _rm) >= 2 then
    v_chooser := true;
  end if;

  -- Exact keyword (gelang manik) keeps a few siblings that share the rare token
  -- (kalung manik) without becoming a chooser. Head nouns do not pull siblings.
  if v_tier = 'exact' and v_rare is not null and v_rare <> all(v_head)
     and cardinality(v_product) <= 2
     and (select count(*) from _rm) < 5 then
    insert into _rm (keyword, kind, parent_keyword, n_listings, omset_top15, score, exact_hit)
    select mi.keyword, mi.kind, mi.parent_keyword, mi.n_listings, mi.omset_top15, 10, false
      from public.market_index mi
     where mi.kind = 'product'
       and public._market_token_hit(mi.tokens, v_rare)
       and mi.keyword not in (select keyword from _rm)
     order by mi.omset_top15 desc nulls last
     limit 4;
  end if;

  -- Fresh: scraped in the last two days, not yet a market row. Checked after the
  -- index match so an established keyword never looks "just measured".
  if v_tier = 'none' and exists (
    select 1 from public.scrape_keywords sk
     where sk.keyword in (v_norm, v_corrected)
       and sk.last_success_at > now() - interval '48 hours'
  ) and not exists (
    select 1 from public.product_types_v p
     where p.keyword in (v_norm, v_corrected) and p.city = 'ALL' and p.n_listings >= 3
  ) then
    v_tier := 'fresh';
    v_conf := 0.7;
    insert into _rm (keyword, kind, parent_keyword, n_listings, omset_top15, score, exact_hit)
    select sk.keyword, 'product', null, sk.last_listings, null, 1, true
      from public.scrape_keywords sk
     where sk.keyword in (v_norm, v_corrected)
     limit 1;
  end if;

  if not exists (select 1 from _rm) then
    v_tier := 'none';
    v_conf := 0.1;
  end if;

  select coalesce(jsonb_agg(
           jsonb_build_object(
             'keyword', keyword,
             'kind', kind,
             'parent', parent_keyword,
             'score', score,
             'n_listings', n_listings,
             'omset_top15', omset_top15
           )
           order by score desc, omset_top15 desc nulls last
         ), '[]'::jsonb)
    into v_markets
    from (
      select keyword, kind, parent_keyword, n_listings, omset_top15, score
        from (
          select distinct on (keyword)
                 keyword, kind, parent_keyword, n_listings, omset_top15, score
            from _rm
           order by keyword, score desc
        ) deduped
       order by score desc, omset_top15 desc nulls last
       limit v_limit
    ) d;

  return jsonb_build_object(
    'tier', v_tier,
    'confidence', v_conf,
    'query_norm', v_norm,
    'corrected_query', v_corrected,
    'corrections', v_corrections,
    'brand', v_brand,
    'brand_missing', v_brand_missing,
    'chooser', v_chooser,
    'markets', v_markets
  );
end $$;

revoke all on function public.resolve_market(text, text, int) from public;
grant execute on function public.resolve_market(text, text, int) to anon, authenticated;

comment on function public.resolve_market(text, text, int) is
  'Spell-correct and tier a product search. exact/strong/brand/nearby/title/fresh/none. '
  'nearby confidence is capped under 0.4. brand_missing means the brand has no titles.';

-- Brand-titled rows first, then the rest of those markets. Same columns as
-- listings_for_keywords so the client can map either.
create or replace function public.listings_for_brand(
  p_brand text,
  p_keywords text[],
  p_per_kw int default 20,
  p_max int default 240
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
set statement_timeout = '2500ms'
as $$
  with kws as (
    select distinct btrim(k) as kw
      from unnest(coalesce(p_keywords, '{}'::text[])) k
     where btrim(k) <> ''
     limit 16
  ),
  ranked as (
    select l.*,
           (l.product_name ~* public._market_word_re(lower(btrim(coalesce(p_brand, ''))))) as brand_hit
      from kws
      cross join lateral (
        select d.item_id, d.shop_id, d.product_name, d.store_name, d.price, d.original_price,
               d.total_sold, d.reviews, d.rating, d.location, d.image_url, d.url,
               d.keyword, d.category, d.listing_date, d.nowcast_velocity_daily,
               d.nowcast_omset_monthly, d.nowcast_confidence, d.nowcast_method,
               d.is_ad, d.search_rank, d.in_stock, d.wishlist, d.product_name as pname
          from public.listings_deduped d
         where d.keyword = kws.kw
           and not d.is_offtopic
           and d.total_sold > 0
         order by d.total_sold desc
         limit greatest(1, least(coalesce(p_per_kw, 20), 40)) * 3
      ) l
  )
  select item_id, shop_id, product_name, store_name, price, original_price,
         total_sold, reviews, rating, location, image_url, url, keyword, category,
         listing_date, nowcast_velocity_daily, nowcast_omset_monthly, nowcast_confidence,
         nowcast_method, is_ad, search_rank, in_stock, wishlist
    from (
      select distinct on (item_id, shop_id) *
        from ranked
       order by item_id, shop_id, brand_hit desc, total_sold desc
    ) u
   order by brand_hit desc, total_sold desc
   limit greatest(1, least(coalesce(p_max, 240), 400));
$$;

revoke all on function public.listings_for_brand(text, text[], int, int) from public;
grant execute on function public.listings_for_brand(text, text[], int, int) to anon, authenticated;

create or replace function public.suggest_markets(
  p_prefix text,
  p_city text default 'ALL',
  p_limit int default 8
)
returns jsonb
language sql
stable
security invoker
set search_path = public, extensions
set statement_timeout = '1500ms'
as $$
  with needle as (
    select btrim(lower(coalesce(p_prefix, ''))) as q
  ),
  hits as (
    select p.keyword,
           p.category_canonical,
           p.omset_top15,
           case
             when p.keyword ilike (select q from needle) || '%' then 0
             when p.keyword ilike '% ' || (select q from needle) || '%' then 1
             when exists (
               select 1 from public.market_index mi
                where mi.keyword = p.keyword
                  and exists (select 1 from unnest(mi.aliases) a where a ilike (select q from needle) || '%')
             ) then 2
             else 3
           end as rank
      from public.product_types_v p, needle n
     where p.city = case when coalesce(btrim(p_city), '') = '' then 'ALL' else btrim(p_city) end
       and p.n_listings >= 3
       and length(n.q) >= 2
       and (
         p.keyword ilike n.q || '%'
         or p.keyword ilike '% ' || n.q || '%'
         or (length(n.q) >= 4 and p.keyword % n.q and similarity(p.keyword, n.q) >= 0.45)
       )
     order by rank, p.omset_top15 desc nulls last
     limit least(greatest(coalesce(p_limit, 8), 1), 16)
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'keyword', keyword,
           'category', category_canonical,
           'omset_top15', omset_top15
         ) order by rank, omset_top15 desc nulls last), '[]'::jsonb)
    from hits;
$$;

revoke all on function public.suggest_markets(text, text, int) from public;
grant execute on function public.suggest_markets(text, text, int) to anon, authenticated;

-- Title/keyword search with word boundaries. "boot" does not match "booth".
-- Same signature the client already calls.
create or replace function public.search_listings(
  q text,
  lim integer default 400,
  off integer default 0,
  cats text[] default null,
  price_min real default null,
  price_max real default null
)
returns table(
  item_id bigint,
  shop_id bigint,
  product_name text,
  store_name text,
  price real,
  total_sold integer,
  category text,
  image_url text,
  url text,
  scraped_at timestamptz,
  keyword text,
  location text,
  rating real,
  reviews integer
)
language plpgsql
stable
security definer
set search_path = public
set statement_timeout = '8s'
as $$
declare
  v_q text := btrim(lower(coalesce(q, '')));
  v_toks text[];
  v_anchor text;
  v_lim int := least(greatest(coalesce(lim, 40), 1), 200);
  v_off int := greatest(coalesce(off, 0), 0);
begin
  if v_q = '' then return; end if;
  select coalesce(array_agg(w), '{}') into v_toks
    from regexp_split_to_table(regexp_replace(v_q, '[^a-z0-9 ]', ' ', 'g'), ' ') w
   where length(w) >= 3;
  if cardinality(v_toks) = 0 then return; end if;
  -- Prefer the longer token as the trigram anchor so "boot" is not the scan key
  -- when a rarer word is also present.
  select t into v_anchor from unnest(v_toks) t order by length(t) desc, t limit 1;

  return query
  select d.item_id, d.shop_id, d.product_name, d.store_name, d.price, d.total_sold,
         d.category, d.image_url, d.url, d.scraped_at, d.keyword, d.location, d.rating, d.reviews
    from public.listings_deduped d
   where d.total_sold > 0
     and not d.is_offtopic
     and (cats is null or d.category = any(cats))
     and (price_min is null or d.price >= price_min)
     and (price_max is null or d.price <= price_max)
     and (d.keyword ilike '%' || v_anchor || '%' or d.product_name ilike '%' || v_anchor || '%')
     and not exists (
       select 1 from unnest(v_toks) u(t)
        where d.keyword !~* public._market_word_re(t)
          and d.product_name !~* public._market_word_re(t)
          and d.keyword !~* public._market_word_re(case when right(t, 1) = 's' then left(t, -1) else t || 's' end)
          and d.product_name !~* public._market_word_re(case when right(t, 1) = 's' then left(t, -1) else t || 's' end)
     )
   order by
     case when lower(d.keyword) = v_q then 0
          when d.keyword ilike v_q || '%' then 1
          when d.keyword ilike '%' || v_q || '%' then 2
          else 3 end,
     d.total_sold desc
   limit v_lim
   offset v_off;
end $$;

revoke all on function public.search_listings(text, integer, integer, text[], real, real) from public;
grant execute on function public.search_listings(text, integer, integer, text[], real, real) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
