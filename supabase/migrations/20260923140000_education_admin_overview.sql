-- Edukasi admin overview: who opened the page, who said yes.
--
-- Page opens are activity_events.event_type = 'edu_page_view' (once per
-- session from gpt-app). Interest rows live in education_interests.
-- Platform admins only.

begin;

create or replace function public.education_admin_overview()
returns json
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_visitors int := 0;
  v_views int := 0;
  v_interested int := 0;
  v_rows json := '[]'::json;
begin
  if not public.is_platform_admin() then
    return json_build_object('ok', false, 'error', 'forbidden');
  end if;

  select
    count(distinct e.user_id)::int,
    count(*)::int
    into v_visitors, v_views
  from public.activity_events e
  where e.event_type = 'edu_page_view'
    and e.user_id is not null;

  select count(*)::int into v_interested
  from public.education_interests;

  with visits as (
    select
      e.user_id,
      min(e.created_at) as first_seen,
      max(e.created_at) as last_seen,
      count(*)::int as views
    from public.activity_events e
    where e.event_type = 'edu_page_view'
      and e.user_id is not null
    group by e.user_id
  ),
  people as (
    select
      coalesce(v.user_id, i.user_id) as user_id,
      v.first_seen,
      v.last_seen,
      coalesce(v.views, 0) as views,
      (i.user_id is not null) as interested,
      i.display_name as interest_name,
      i.email as interest_email,
      i.whatsapp as interest_wa,
      i.created_at as interested_at
    from visits v
    full outer join public.education_interests i on i.user_id = v.user_id
  )
  select coalesce(json_agg(row_to_json(x) order by x.sort_at desc nulls last), '[]'::json)
    into v_rows
  from (
    select
      p.user_id,
      coalesce(
        nullif(btrim(p.interest_name), ''),
        nullif(btrim(up.display_name), ''),
        nullif(btrim(up.first_name), ''),
        nullif(btrim(u.email), ''),
        left(p.user_id::text, 8)
      ) as display_name,
      coalesce(
        nullif(btrim(p.interest_email), ''),
        nullif(btrim(up.contact_email), ''),
        case when u.email ilike '%@wa.larisid.com' then null else nullif(btrim(u.email), '') end
      ) as email,
      coalesce(
        nullif(btrim(p.interest_wa), ''),
        public.normalise_wa_phone(coalesce(nullif(btrim(up.wa_number), ''), nullif(btrim(up.public_whatsapp), '')))
      ) as whatsapp,
      p.views,
      p.first_seen,
      p.last_seen,
      p.interested,
      p.interested_at,
      coalesce(p.last_seen, p.interested_at, p.first_seen) as sort_at
    from people p
    left join auth.users u on u.id = p.user_id
    left join public.user_profiles up on up.user_id = p.user_id
  ) x;

  return json_build_object(
    'ok', true,
    'visitors', v_visitors,
    'views', v_views,
    'interested', v_interested,
    'rows', v_rows
  );
end;
$$;

revoke all on function public.education_admin_overview() from public, anon, authenticated;
grant execute on function public.education_admin_overview() to authenticated;

comment on function public.education_admin_overview() is
  'Platform-admin Edukasi funnel: unique page openers (edu_page_view), interest count, and merged visitor/interest rows.';

commit;
