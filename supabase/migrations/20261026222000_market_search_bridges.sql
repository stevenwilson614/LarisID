-- Bridges: title→keyword matching and Minta Produk both go through resolve_market.
-- uncovered_searches records the tier so a "nearby" miss is visible, not only a zero.
--
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20261026222000_market_search_bridges.sql

begin;

alter table public.uncovered_searches
  add column if not exists tier text,
  add column if not exists confidence numeric,
  add column if not exists corrected_query text,
  add column if not exists top_keyword text;

comment on column public.uncovered_searches.tier is
  'resolve_market tier when the search was not exact/strong/fresh. none, nearby, title, brand.';

-- Map shop-snapshot titles onto product markets. Brand and shop keywords
-- resolve to their parent when one has been set, so Kompetitor is not a
-- brand-grain list of one reseller.
create or replace function public.match_titles_to_keywords(p_titles jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
set statement_timeout = '8s'
as $$
  with titles as (
    select (e->>'item_id')::bigint as item_id,
           lower(left(btrim(coalesce(e->>'product_name', '')), 240)) as name
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
  toks as (
    select t.item_id, t.name,
           array_agg(distinct w) as toks
      from titles t,
           regexp_split_to_table(t.name, '[^a-z0-9]+') w
     where length(w) >= 3
     group by t.item_id, t.name
  ),
  scored as (
    select tk.item_id,
           case
             when mi.kind in ('brand', 'shop') and mi.parent_keyword is not null
               then mi.parent_keyword
             else mi.keyword
           end as keyword,
           (
             select count(*)::numeric
               from unnest(mi.tokens) tok
              where length(tok) >= 3 and tok = any(tk.toks)
           ) / greatest((
             select count(*) from unnest(mi.tokens) tok where length(tok) >= 3
           ), 1) as coverage,
           (split_part(mi.keyword, ' ', 1) = any(tk.toks)) as head_hit,
           mi.kind,
           coalesce(mi.n_listings, 0) as n_listings
      from toks tk
      join public.market_index mi
        on mi.tokens && tk.toks
     where mi.kind in ('product', 'unknown', 'brand', 'shop')
  ),
  best as (
    select distinct on (item_id) item_id, keyword
      from scored
     where coverage >= 0.6
       and head_hit
     order by item_id,
              case when kind = 'product' then 0 else 1 end,
              coverage desc,
              n_listings desc
  )
  select coalesce(jsonb_object_agg(item_id::text, keyword), '{}'::jsonb)
    from best
$$;

comment on function public.match_titles_to_keywords(jsonb) is
  'Map snapshot titles to product markets via market_index tokens. '
  'Coverage >= 0.6 and the keyword head token must be in the title. '
  'Brand/shop hits return parent_keyword when set.';

-- Minta Produk. Verdicts:
--   already_live        exact / strong / fresh market
--   already_live_brand  the brand has titles; open those markets
--   queued              not in the corpus; scrape it (express job id when the lane exists)
--   already_queued      already on the scrape list
--   rejected_brand      no product word we know, and not a brand we can place
--   rejected_length / rate_limited
create or replace function public.request_scrape_keywords(
  p_keywords text[],
  p_wa       text default null,
  p_source   text default 'chat',
  p_category text default ''
) returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '8s'
as $$
declare
  v_uid      uuid := auth.uid();
  v_kw       text;
  v_norm     text;
  v_verdict  text;
  v_out      jsonb := '[]'::jsonb;
  v_recent   int;
  v_accepted int := 0;
  v_wa       text := nullif(btrim(coalesce(p_wa, '')), '');
  v_cat      text := coalesce(nullif(btrim(p_category), ''), '');
  v_res      jsonb;
  v_tier     text;
  v_corrected text;
  v_nearest  text;
  v_brand_missing boolean;
  v_queue    text;
  v_job      uuid;
  v_known    boolean;
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '42501';
  end if;
  if p_keywords is null or cardinality(p_keywords) = 0 then
    return v_out;
  end if;

  select count(*) into v_recent
    from public.keyword_scrape_requests
   where user_id = v_uid and created_at > now() - interval '24 hours';

  foreach v_kw in array p_keywords[1:10] loop
    v_norm := btrim(regexp_replace(
               regexp_replace(lower(btrim(coalesce(v_kw, ''))), '[^a-z0-9 ]', ' ', 'g'),
               '\s+', ' ', 'g'));
    v_verdict := null;
    v_job := null;
    v_res := null;
    v_queue := v_norm;
    v_corrected := v_norm;
    v_nearest := null;
    v_brand_missing := false;

    if char_length(v_norm) < 3 or char_length(v_norm) > 60 then
      v_verdict := 'rejected_length';
    else
      v_res := public.resolve_market(v_norm, 'ALL', 6);
      v_tier := v_res->>'tier';
      v_corrected := coalesce(nullif(v_res->>'corrected_query', ''), v_norm);
      v_nearest := v_res->'markets'->0->>'keyword';
      v_brand_missing := coalesce((v_res->>'brand_missing')::boolean, false);

      if v_tier in ('exact', 'strong', 'fresh') then
        v_verdict := 'already_live';
      elsif v_tier = 'brand' and not v_brand_missing then
        v_verdict := 'already_live_brand';
      else
        select exists (
          select 1
            from unnest(string_to_array(v_corrected, ' ')) t(tok)
           where length(t.tok) >= 3
             and exists (select 1 from public.market_vocab v where v.token = t.tok)
        ) into v_known;

        v_queue := v_corrected;
        if v_tier = 'none' and not v_known and v_res->>'brand' is null then
          v_verdict := 'rejected_brand';
        elsif exists (select 1 from public.scrape_keywords sk where sk.keyword = v_queue)
           or exists (select 1 from public.product_types_v p
                       where p.keyword = v_queue and p.city = 'ALL' and p.n_listings >= 3) then
          if exists (select 1 from public.product_types_v p
                      where p.keyword = v_queue and p.city = 'ALL' and p.n_listings >= 3) then
            v_verdict := 'already_live';
            v_nearest := coalesce(v_nearest, v_queue);
          else
            insert into public.keyword_scrape_requests
                   (user_id, keyword, result_count_at_request, notify_when_ready, notify_wa, source)
            values (v_uid, v_queue, 0, v_wa is not null, v_wa, p_source)
            on conflict do nothing;
            v_verdict := 'already_queued';
          end if;
        elsif v_recent + v_accepted >= 3 then
          v_verdict := 'rate_limited';
        else
          insert into public.scrape_keywords (keyword, category, source_set, sla_days)
          values (v_queue, v_cat, 'request', 1)
          on conflict (keyword) do nothing;

          insert into public.keyword_scrape_requests
                 (user_id, keyword, result_count_at_request, notify_when_ready, notify_wa, source)
          values (v_uid, v_queue, 0, v_wa is not null, v_wa, p_source)
          on conflict do nothing;

          v_accepted := v_accepted + 1;
          v_verdict := 'queued';

          if to_regclass('public.express_scrape_jobs') is not null then
            execute $job$
              insert into public.express_scrape_jobs (keyword_norm, user_id, status)
              select $1, $2, 'pending'
               where not exists (
                 select 1 from public.express_scrape_jobs j
                  where j.keyword_norm = $1
                    and j.created_at > now() - interval '24 hours'
                    and j.status in ('pending', 'claimed', 'done')
               )
              returning id
            $job$
            into v_job
            using v_queue, v_uid;
          end if;
        end if;
      end if;
    end if;

    v_out := v_out || jsonb_build_object(
      'keyword', case when v_verdict in ('already_live', 'already_live_brand')
                      then coalesce(v_nearest, v_corrected) else coalesce(v_queue, v_norm) end,
      'input', v_kw,
      'verdict', v_verdict,
      'corrected', v_corrected,
      'nearest', v_nearest,
      'job_id', v_job
    );
  end loop;

  return v_out;
end $$;

revoke all on function public.request_scrape_keywords(text[], text, text, text) from public, anon;
grant execute on function public.request_scrape_keywords(text[], text, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
