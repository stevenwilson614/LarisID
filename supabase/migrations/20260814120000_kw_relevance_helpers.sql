-- Keyword↔product-name relevance helpers for product-type cleanup.
-- Stopword list lives here so it is tunable in one place.

create or replace function public._lid_kw_tokens(kw text)
returns text[]
language sql
immutable
parallel safe
as $$
  select coalesce(array_agg(t), '{}'::text[])
  from (
    select unnest(string_to_array(
      btrim(regexp_replace(lower(coalesce(kw, '')), '[^a-z0-9]+', ' ', 'g')),
      ' '
    )) as t
  ) s
  where length(t) >= 4
    and t not in (
      'untuk','dengan','murah','model','bahan','ukuran',
      'terbaru','original','import','satuan'
    );
$$;

create or replace function public._lid_kw_hits(p_keyword text, p_name text)
returns smallint
language sql
immutable
parallel safe
as $$
  select count(*)::smallint
  from unnest(public._lid_kw_tokens(p_keyword)) tok
  where strpos(lower(coalesce(p_name, '')), tok) > 0;
$$;

comment on function public._lid_kw_tokens(text) is
  'Significant tokens of a scrape keyword: lowercased, non-alnum split, length >= 4, minus stopwords.';
comment on function public._lid_kw_hits(text, text) is
  'Count of _lid_kw_tokens(keyword) that appear as substrings of lower(product_name).';
