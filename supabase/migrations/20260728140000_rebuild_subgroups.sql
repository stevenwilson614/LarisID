-- Data-derived subgroups.
--
-- CAT_SUBGROUPS in js/gpt-app.js was hand-written against a snapshot of the
-- scrape keywords and had rotted: of 83 chips, 1 matched nothing and 12 matched
-- only 1-2 product types. Coverage inside a category was worse than the chip
-- count suggested — HP & Gadget had 105 types but its 3 subgroups reached 15,
-- Rumah had 174 and reached 81.
--
-- Subgroups are now derived from the keywords themselves and rebuilt on demand,
-- so a chip cannot outlive the products behind it. Clustering is by shared
-- significant token: within a canonical bucket, tokens carried by at least
-- MIN_KEYWORDS distinct keywords become subgroups (best few per bucket), and
-- each keyword joins the strongest subgroup whose token it contains.

create or replace function public.rebuild_keyword_subgroups(
  p_min_keywords int default 5,
  p_max_per_cat  int default 8
)
returns table (canonical text, subgroups int, assigned int, leftover int)
language plpgsql
security definer
set search_path = public
set statement_timeout = '600s'
as $$
#variable_conflict use_column
begin
  create temp table _kw_canon on commit drop as
  select btrim(l.keyword) as keyword,
         public._lid_canonical_category(
           nullif(btrim(mode() within group (order by nullif(btrim(l.category),''))),''),
           btrim(l.keyword)
         ) as canonical,
         count(*) as n_listings
  from public.listings_deduped l
  where l.keyword is not null and btrim(l.keyword) <> ''
  group by btrim(l.keyword);

  -- Tokenize, dropping noise words and anything too short to be a head noun.
  create temp table _kw_tok on commit drop as
  select k.keyword, k.canonical, t.tok
  from _kw_canon k,
       lateral unnest(string_to_array(lower(regexp_replace(k.keyword, '[^a-zA-Z0-9 ]', ' ', 'g')), ' ')) as t(tok)
  where length(t.tok) >= 4
    and t.tok !~ '^[0-9]+$'
    and t.tok not in (
      'untuk','dan','yang','dari','dengan','murah','terbaru','best','seller','baru',
      'set','pcs','buah','pack','isi','anti','multi','mini','besar','kecil','model',
      'bahan','warna','size','type','tipe','plus','pro','max','free','gratis','asli',
      'original','import','lokal','premium','grosir','ecer','termurah','terlaris',
      'kualitas','bagus','lucu','cantik','keren','simple','praktis','serbaguna',
      'portable','custom','motif','polos','tebal','tipis','panjang','pendek','made',
      'with','for','the','and','high','low','new','hot','sale','shop','store',
      -- pure modifiers: they cluster fine but do not name a product type
      'minimalis','lipat','otomatis','elektrik','manual','silikon','stainless',
      'plastik','kaca','logam','karet','katun','kulit','kayu','wood','slab',
      'pemula','dewasa','remaja','unisex','import','jumbo','super','ekstra',
      'gores','foil','emas','silver','hitam','putih','bening','transparan'
    );

  -- Candidate subgroups: frequent tokens per bucket, best few kept.
  create temp table _sg on commit drop as
  select canonical, tok, n_kw,
         row_number() over (partition by canonical order by n_kw desc, tok) as rnk
  from (
    select canonical, tok, count(distinct keyword) as n_kw
    from _kw_tok group by canonical, tok
  ) x
  where n_kw >= p_min_keywords;

  delete from _sg where rnk > p_max_per_cat;

  -- Assign, then prune. A keyword carrying two candidate tokens goes to the
  -- stronger one, which can starve the weaker below the threshold — so any
  -- subgroup that ends up too small is dropped and its keywords reassigned.
  -- Iterating to a fixed point is what guarantees no thin chips survive.
  for i in 1..4 loop
    delete from public.keyword_subgroup;
    insert into public.keyword_subgroup (keyword, canonical, subgroup, updated_at)
    select distinct on (k.keyword)
           k.keyword,
           k.canonical,
           coalesce(initcap(s.tok), 'Lainnya') as subgroup,
           now()
    from _kw_canon k
    left join _kw_tok t on t.keyword = k.keyword
    left join _sg    s on s.canonical = k.canonical and s.tok = t.tok
    order by k.keyword, (s.rnk is null), s.rnk;

    delete from _sg
    where (canonical, tok) in (
      select ks.canonical, lower(ks.subgroup)
      from public.keyword_subgroup ks
      where ks.subgroup <> 'Lainnya'
      group by ks.canonical, lower(ks.subgroup)
      having count(*) < p_min_keywords
    );
    exit when not found;
  end loop;

  return query
  select ks.canonical,
         count(distinct ks.subgroup) filter (where ks.subgroup <> 'Lainnya')::int,
         count(*) filter (where ks.subgroup <> 'Lainnya')::int,
         count(*) filter (where ks.subgroup =  'Lainnya')::int
  from public.keyword_subgroup ks
  group by ks.canonical
  order by ks.canonical;
end; $$;

grant execute on function public.rebuild_keyword_subgroups(int, int) to service_role;
