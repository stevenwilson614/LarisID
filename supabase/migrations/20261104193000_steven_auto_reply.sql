-- Steven auto-reply bookkeeping + fast product lookup for the bot.
-- The insert trigger (service-role JWT) is installed by
-- scripts/install-steven-auto-reply-trigger.sh — do not commit the key.

alter table public.feedback
  add column if not exists auto_replied_at timestamptz;

comment on column public.feedback.auto_replied_at is
  'Set when steven-auto-reply wrote a steven_followup notice for this row.';

create or replace function public.steven_auto_reply_research(
  p_keywords text[],
  p_queue boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
set statement_timeout = '8s'
as $$
declare
  v_raw text;
  v_norm text;
  v_token text;
  v_resolved text;
  v_picks jsonb := '[]'::jsonb;
  v_closest text;
  v_queued text;
begin
  if p_keywords is null then
    return jsonb_build_object('picks', '[]'::jsonb, 'closest', null, 'queued', null);
  end if;

  foreach v_raw in array p_keywords loop
    exit when jsonb_array_length(v_picks) >= 2;
    v_norm := btrim(regexp_replace(
      regexp_replace(lower(coalesce(v_raw, '')), '[^a-z0-9 ]', ' ', 'g'),
      '\s+', ' ', 'g'));
    if char_length(v_norm) < 3 or char_length(v_norm) > 80 then
      continue;
    end if;

    select tok into v_token
      from unnest(regexp_split_to_array(v_norm, ' ')) as tok
     where char_length(tok) >= 4
     order by char_length(tok) desc
     limit 1;

    select w.keyword into v_resolved
      from public.mv_keyword_weekly w
     where w.keyword = v_norm
        or w.keyword ilike v_norm || '%'
        or (v_token is not null and w.keyword ilike '%' || v_token || '%')
     order by case when w.keyword = v_norm then 0
                   when w.keyword ilike v_norm || '%' then 1
                   else 2 end,
              w.wk_units desc nulls last
     limit 1;

    if v_resolved is null then
      select sk.keyword into v_resolved
        from public.scrape_keywords sk
       where sk.active
         and (sk.keyword = v_norm or sk.keyword ilike v_norm || '%')
       order by case when sk.keyword = v_norm then 0 else 1 end,
                sk.last_listings desc nulls last
       limit 1;
    end if;

    if v_closest is null and v_resolved is not null and v_resolved <> v_norm then
      v_closest := v_resolved;
    end if;

    if v_resolved is not null then
      v_picks := v_picks || coalesce((
        select jsonb_agg(jsonb_build_object(
                 'keyword', d.keyword,
                 'name', d.name,
                 'price', d.price,
                 'omset', d.omset))
          from (
            select s.keyword, s.name, s.price, s.omset
              from (
                select distinct on (l.item_id)
                       l.keyword,
                       left(l.product_name, 90) as name,
                       round(l.price)::bigint as price,
                       round(coalesce(l.est_omset_monthly, 0))::bigint as omset
                  from public.listings l
                 where l.keyword = v_resolved
                   and l.price between 1000 and 2000000
                   and (
                     v_token is null
                     or exists (
                       select 1
                         from unnest(regexp_split_to_array(v_norm, ' ')) tok
                        where char_length(tok) >= 4
                          and l.product_name ilike '%' || tok || '%'
                     )
                   )
                 order by l.item_id, l.est_omset_monthly desc nulls last
              ) s
             where s.omset between 100000 and 500000000
             order by s.omset desc
             limit 2
          ) d
      ), '[]'::jsonb);
    end if;

    if p_queue and v_queued is null and jsonb_array_length(v_picks) = 0 then
      insert into public.scrape_keywords (keyword, category, source_set, sla_days)
      values (v_norm, '', 'request', 1)
      on conflict (keyword) do update
        set active = true,
            source_set = case
              when public.scrape_keywords.source_set = '' then 'request'
              else public.scrape_keywords.source_set
            end,
            sla_days = least(public.scrape_keywords.sla_days, 1);
      v_queued := v_norm;
      if v_closest is null then
        v_closest := v_resolved;
      end if;
    end if;
  end loop;

  return jsonb_build_object(
    'picks', v_picks,
    'closest', v_closest,
    'queued', v_queued
  );
end;
$$;

revoke all on function public.steven_auto_reply_research(text[], boolean) from public, anon, authenticated;
grant execute on function public.steven_auto_reply_research(text[], boolean) to service_role;
