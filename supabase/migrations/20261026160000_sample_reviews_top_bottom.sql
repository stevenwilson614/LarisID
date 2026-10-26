-- Sample reviews: raise cap to 6 (3 best + 3 worst) and keep optional bucket tag.

begin;
set local statement_timeout to '60s';

create or replace function public._ext_slim_sample_reviews(p_reviews jsonb)
returns jsonb
language plpgsql immutable as $$
declare
  v_out jsonb := '[]'::jsonb;
  e jsonb;
  v_id text;
  v_comment text;
  v_author text;
  v_star int;
  v_bucket text;
  n int := 0;
begin
  if p_reviews is null or jsonb_typeof(p_reviews) <> 'array' then
    return null;
  end if;
  for e in select value from jsonb_array_elements(p_reviews)
  loop
    exit when n >= 6;
    if jsonb_typeof(e) <> 'object' then continue; end if;
    v_id := left(nullif(btrim(coalesce(e->>'review_id', '')), ''), 80);
    if v_id is null then continue; end if;
    v_comment := left(nullif(btrim(coalesce(e->>'comment', '')), ''), 500);
    v_author := left(nullif(btrim(coalesce(e->>'author', 'Pembeli')), ''), 40);
    v_star := least(greatest(coalesce((nullif(e->>'rating_star', ''))::int, 0), 0), 5);
    v_bucket := case lower(coalesce(e->>'bucket', ''))
      when 'top' then 'top'
      when 'bottom' then 'bottom'
      else null end;
    v_out := v_out || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
      'review_id', v_id,
      'rating_star', nullif(v_star, 0),
      'comment', coalesce(v_comment, ''),
      'author', coalesce(v_author, 'Pembeli'),
      'ctime', (nullif(e->>'ctime', ''))::bigint,
      'model_name', left(nullif(btrim(coalesce(e->>'model_name', '')), ''), 120),
      'image_count', least(greatest(coalesce((nullif(e->>'image_count', ''))::int, 0), 0), 20),
      'bucket', v_bucket
    )));
    n := n + 1;
  end loop;
  if n = 0 then return null; end if;
  return v_out;
end $$;

create or replace function public._ext_apply_sample_reviews(
  p_item_id bigint,
  p_shop_id bigint,
  p_reviews jsonb,
  p_source text default 'ext'
) returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_slim jsonb := public._ext_slim_sample_reviews(p_reviews);
  v_n int := 0;
  e jsonb;
begin
  if p_item_id is null or p_item_id <= 0 or v_slim is null then
    return 0;
  end if;
  v_n := jsonb_array_length(v_slim);

  update public.product_details
     set sample_reviews_json = v_slim,
         reviews_collected   = v_n,
         reviews_scraped_at  = now(),
         reviews_mode        = 'sample6_tb'
   where item_id = p_item_id;

  for e in select value from jsonb_array_elements(v_slim)
  loop
    insert into public.product_reviews (
      review_id, item_id, shop_id, rating_star, comment, ctime, model_name,
      image_count, is_anonymous, filter_used, type_used, scraped_at, source)
    values (
      e->>'review_id', p_item_id, nullif(p_shop_id, 0),
      (nullif(e->>'rating_star', ''))::int,
      nullif(e->>'comment', ''),
      (nullif(e->>'ctime', ''))::bigint,
      nullif(e->>'model_name', ''),
      coalesce((e->>'image_count')::int, 0),
      (coalesce(e->>'author', 'Pembeli') = 'Pembeli'),
      '0', coalesce(e->>'bucket', '0'), now(), left(coalesce(p_source, 'ext'), 20))
    on conflict (review_id) do update
      set comment      = excluded.comment,
          rating_star  = excluded.rating_star,
          scraped_at   = excluded.scraped_at,
          source       = excluded.source,
          shop_id      = coalesce(excluded.shop_id, product_reviews.shop_id),
          model_name   = coalesce(excluded.model_name, product_reviews.model_name),
          image_count  = excluded.image_count,
          type_used    = excluded.type_used;
  end loop;
  return v_n;
end $$;

-- Allow up to 12 in the wire payload (client sends ≤6); reject absurd batches.
create or replace function public.ext_ingest_sample_reviews(
  p_install  uuid,
  p_item_id  bigint,
  p_shop_id  bigint,
  p_reviews  jsonb,
  p_version  text default null
) returns json
language plpgsql
security definer
set search_path = public
set statement_timeout = '10s'
as $$
declare
  v_day  date := public._usage_day();
  v_inst public.ext_installs%rowtype;
  v_n    int;
begin
  if p_install is null or p_item_id is null or p_item_id <= 0 then
    return json_build_object('ok', false, 'reason', 'bad_args');
  end if;
  if p_reviews is null or jsonb_typeof(p_reviews) <> 'array'
     or jsonb_array_length(p_reviews) = 0
     or jsonb_array_length(p_reviews) > 12 then
    return json_build_object('ok', false, 'reason', 'bad_reviews');
  end if;

  insert into public.ext_installs (install_id, day, version)
       values (p_install, v_day, left(p_version, 20))
  on conflict (install_id) do update
    set last_seen_at = now(),
        day = v_day,
        version = coalesce(left(p_version, 20), public.ext_installs.version),
        rows_today = case when public.ext_installs.day = v_day
                          then public.ext_installs.rows_today else 0 end,
        pages_today = case when public.ext_installs.day = v_day
                           then public.ext_installs.pages_today else 0 end,
        details_today = case when public.ext_installs.day = v_day
                             then public.ext_installs.details_today else 0 end,
        batches_total = public.ext_installs.batches_total + 1
  returning * into v_inst;

  if v_inst.blocked then
    return json_build_object('ok', false, 'reason', 'blocked');
  end if;

  if exists (select 1 from public.product_details where item_id = p_item_id) then
    v_n := public._ext_apply_sample_reviews(p_item_id, p_shop_id, p_reviews, 'ext');
  else
    update public.ext_detail_ingest
       set sample_reviews_json = public._ext_slim_sample_reviews(p_reviews)
     where id = (
       select i.id from public.ext_detail_ingest i
        where i.item_id = p_item_id and i.merged_at is null and i.reject_reason is null
        order by i.detail_scraped_at desc, i.id desc limit 1);
    get diagnostics v_n = row_count;
    if v_n = 0 then
      return json_build_object('ok', false, 'reason', 'no_detail_yet');
    end if;
    v_n := jsonb_array_length(public._ext_slim_sample_reviews(p_reviews));
  end if;

  return json_build_object('ok', true, 'accepted', v_n);
end $$;

comment on column public.product_details.sample_reviews_json is
  'Up to 6 slim buyer reviews (3 top/5★ + 3 bottom/1★): '
  '[{review_id,rating_star,comment,author,ctime,model_name,image_count,bucket}]. '
  'Filled by the Chrome extension from get_ratings type=5 and type=1.';

notify pgrst, 'reload schema';
commit;
