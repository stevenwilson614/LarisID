-- LarisExpor Amazon US listings (Cari Produk twin).
-- Keywords are the curated Indonesian-export corpus. Listings are Amazon US
-- search results for the mapped English keyword — not "proven made-in-ID".
-- Omset is price_usd * bought_past_month (Amazon's own badge floor), always
-- perkiraan. Apply: bash scripts/apply-selfhost.sh supabase/migrations/20260914180000_amazon_listings.sql

begin;

create table if not exists public.amazon_keywords (
  slug       text primary key,
  kw_en      text not null,
  nama_id    text not null,
  kategori   text not null,
  hs         text,
  wilayah    text,
  updated_at timestamptz not null default now()
);

create index if not exists amazon_keywords_kategori_idx
  on public.amazon_keywords (kategori);
create index if not exists amazon_keywords_kw_en_idx
  on public.amazon_keywords (lower(kw_en));

create table if not exists public.amazon_listings (
  asin               text not null,
  keyword            text not null,
  slug               text,
  title              text,
  image_url          text,
  url                text,
  price_usd          numeric,
  rating             numeric,
  reviews            integer,
  bought_past_month  integer,
  is_amazon_choice   boolean,
  is_best_seller     boolean,
  search_rank        integer,
  fetched_at         timestamptz not null default now(),
  primary key (asin, keyword)
);

create index if not exists amazon_listings_kw_omset_idx
  on public.amazon_listings (
    keyword,
    (price_usd * bought_past_month) desc nulls last
  );
create index if not exists amazon_listings_slug_idx
  on public.amazon_listings (slug);
create index if not exists amazon_listings_asin_idx
  on public.amazon_listings (asin);

create table if not exists public.amazon_listing_snapshots (
  asin               text not null,
  keyword            text not null,
  fetched_at         timestamptz not null,
  price_usd          numeric,
  rating             numeric,
  reviews            integer,
  bought_past_month  integer,
  search_rank        integer,
  primary key (asin, keyword, fetched_at)
);

alter table public.amazon_keywords enable row level security;
alter table public.amazon_listings enable row level security;
alter table public.amazon_listing_snapshots enable row level security;

drop policy if exists amazon_keywords_read on public.amazon_keywords;
create policy amazon_keywords_read on public.amazon_keywords
  for select to anon, authenticated
  using (true);

drop policy if exists amazon_listings_read on public.amazon_listings;
create policy amazon_listings_read on public.amazon_listings
  for select to anon, authenticated
  using (true);

drop policy if exists amazon_listing_snapshots_read on public.amazon_listing_snapshots;
create policy amazon_listing_snapshots_read on public.amazon_listing_snapshots
  for select to anon, authenticated
  using (true);

grant select on public.amazon_keywords to anon, authenticated;
grant select on public.amazon_listings to anon, authenticated;
grant select on public.amazon_listing_snapshots to anon, authenticated;

create or replace function public.amazon_search_keywords(
  p_q text,
  p_limit int default 24
)
returns setof public.amazon_keywords
language sql
stable
security invoker
set search_path = public
as $$
  with q as (
    select lower(btrim(coalesce(p_q, ''))) as raw
  ),
  toks as (
    select t.tok
    from q, unnest(regexp_split_to_array(q.raw, '\s+')) as t(tok)
    where length(t.tok) >= 2
  )
  select k.*
  from public.amazon_keywords k, q
  where q.raw = ''
     or lower(k.nama_id) like '%' || q.raw || '%'
     or lower(k.kw_en) like '%' || q.raw || '%'
     or lower(k.slug) like '%' || replace(q.raw, ' ', '-') || '%'
     or (
       exists (select 1 from toks)
       and not exists (
         select 1 from toks t
         where position(t.tok in lower(k.nama_id || ' ' || k.kw_en)) = 0
       )
     )
  order by
    case
      when lower(k.nama_id) = q.raw then 0
      when lower(k.kw_en) = q.raw then 1
      when lower(k.nama_id) like q.raw || '%' then 2
      else 3
    end,
    k.nama_id
  limit greatest(1, least(coalesce(p_limit, 24), 40));
$$;

comment on function public.amazon_search_keywords(text, int) is
  'LarisExpor keyword typeahead: Indonesian nama, English Amazon kw, or slug.';

-- LATERAL top-N per English keyword. Omset = price * bought_past_month (nullable).
create or replace function public.amazon_listings_for_keywords(
  p_keywords text[],
  p_per_kw int default 20,
  p_max int default 300
)
returns table (
  asin text,
  keyword text,
  slug text,
  title text,
  image_url text,
  url text,
  price_usd numeric,
  rating numeric,
  reviews integer,
  bought_past_month integer,
  is_amazon_choice boolean,
  is_best_seller boolean,
  search_rank integer,
  fetched_at timestamptz,
  omset_usd numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    l.asin, l.keyword, l.slug, l.title, l.image_url, l.url,
    l.price_usd, l.rating, l.reviews, l.bought_past_month,
    l.is_amazon_choice, l.is_best_seller, l.search_rank, l.fetched_at,
    case
      when l.price_usd is not null and l.bought_past_month is not null
      then l.price_usd * l.bought_past_month
      else null
    end as omset_usd
  from (
    select distinct btrim(k) as kw
    from unnest(coalesce(p_keywords, '{}'::text[])) as k
    where btrim(k) <> ''
  ) k
  cross join lateral (
    select d.*
    from public.amazon_listings d
    where d.keyword = k.kw
    order by
      (d.price_usd * d.bought_past_month) desc nulls last,
      d.search_rank asc nulls last,
      d.reviews desc nulls last
    limit greatest(1, least(coalesce(p_per_kw, 20), 80))
  ) l
  order by
    (l.price_usd * l.bought_past_month) desc nulls last,
    l.search_rank asc nulls last
  limit greatest(1, least(coalesce(p_max, 300), 400));
$$;

comment on function public.amazon_listings_for_keywords(text[], int, int) is
  'Top Amazon US listings per English keyword. omset_usd is price × bought_past_month (Amazon badge floor), nullable.';

create or replace function public.amazon_listings_home(p_max int default 80)
returns table (
  asin text,
  keyword text,
  slug text,
  title text,
  image_url text,
  url text,
  price_usd numeric,
  rating numeric,
  reviews integer,
  bought_past_month integer,
  is_amazon_choice boolean,
  is_best_seller boolean,
  search_rank integer,
  fetched_at timestamptz,
  omset_usd numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    l.asin, l.keyword, l.slug, l.title, l.image_url, l.url,
    l.price_usd, l.rating, l.reviews, l.bought_past_month,
    l.is_amazon_choice, l.is_best_seller, l.search_rank, l.fetched_at,
    case
      when l.price_usd is not null and l.bought_past_month is not null
      then l.price_usd * l.bought_past_month
      else null
    end as omset_usd
  from public.amazon_listings l
  order by
    (l.price_usd * l.bought_past_month) desc nulls last,
    l.reviews desc nulls last
  limit greatest(1, least(coalesce(p_max, 80), 200));
$$;

create or replace function public.amazon_listing_by_asin(p_asin text)
returns table (
  asin text,
  keyword text,
  slug text,
  title text,
  image_url text,
  url text,
  price_usd numeric,
  rating numeric,
  reviews integer,
  bought_past_month integer,
  is_amazon_choice boolean,
  is_best_seller boolean,
  search_rank integer,
  fetched_at timestamptz,
  omset_usd numeric,
  nama_id text,
  kategori text
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    l.asin, l.keyword, l.slug, l.title, l.image_url, l.url,
    l.price_usd, l.rating, l.reviews, l.bought_past_month,
    l.is_amazon_choice, l.is_best_seller, l.search_rank, l.fetched_at,
    case
      when l.price_usd is not null and l.bought_past_month is not null
      then l.price_usd * l.bought_past_month
      else null
    end as omset_usd,
    k.nama_id,
    k.kategori
  from public.amazon_listings l
  left join public.amazon_keywords k on k.slug = l.slug or lower(k.kw_en) = lower(l.keyword)
  where l.asin = btrim(p_asin)
  order by (l.price_usd * l.bought_past_month) desc nulls last
  limit 1;
$$;

revoke all on function public.amazon_search_keywords(text, int) from public;
revoke all on function public.amazon_listings_for_keywords(text[], int, int) from public;
revoke all on function public.amazon_listings_home(int) from public;
revoke all on function public.amazon_listing_by_asin(text) from public;

grant execute on function public.amazon_search_keywords(text, int) to anon, authenticated;
grant execute on function public.amazon_listings_for_keywords(text[], int, int) to anon, authenticated;
grant execute on function public.amazon_listings_home(int) to anon, authenticated;
grant execute on function public.amazon_listing_by_asin(text) to anon, authenticated;

notify pgrst, 'reload schema';

commit;
