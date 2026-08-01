-- winback_audience.campaigns_sent must count only DELIVERED sends.
--
-- The sender skips anyone whose campaigns_sent already contains the campaign,
-- so aggregating failed rows too would permanently exclude an address that
-- bounced once from ever being retried.

create or replace function public.winback_audience(
  p_before timestamptz default '2026-07-16'
)
 returns table(
   user_id            uuid,
   email              text,
   display_name       text,
   created_at         timestamptz,
   segment            text,
   dormancy_days      integer,
   region             text,
   city               text,
   categories         text[],
   deepdive_count     integer,
   last_activity_at   timestamptz,
   suppressed         boolean,
   pass_token         uuid,
   campaigns_sent     text[]
 )
 language plpgsql
 stable
 SECURITY DEFINER
 SET search_path TO 'public'
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden';
  end if;

  return query
  select
    u.id,
    u.email::text,
    -- Same chain as admin_user_directory(): nullif(trim(...)) at every step so
    -- an empty-string name falls through instead of rendering "Halo ,".
    coalesce(
      nullif(trim(both from coalesce(u.raw_user_meta_data ->> 'full_name', '')), ''),
      nullif(trim(both from coalesce(up.display_name, up.first_name || ' ' || up.last_name, '')), ''),
      split_part(u.email, '@', 1),
      'User'
    )::text as display_name,
    u.created_at,
    case
      when coalesce(dcnt.deepdive_count,0) >= 5 then 'C'
      when coalesce(dcnt.deepdive_count,0) between 1 and 4 then 'B'
      else 'A'
    end as segment,
    greatest(0,
      (extract(epoch from now() - coalesce(act.last_activity_at, u.created_at)) / 86400)::int
    ) as dormancy_days,
    uop.region,
    up.city,
    uop.categories,
    coalesce(dcnt.deepdive_count, 0)::int as deepdive_count,
    act.last_activity_at,
    exists (
      select 1
      from public.email_suppressions es
      where lower(es.email) = lower(u.email)
    ) as suppressed,
    cb.token as pass_token,
    coalesce(ec.campaigns, array[]::text[]) as campaigns_sent
  from auth.users u
  left join public.user_profiles up on up.user_id = u.id
  left join public.user_onboarding_prefs uop on uop.user_id = u.id
  left join lateral (
    select count(*) as deepdive_count
    from public.activity_events ae
    where ae.user_id = u.id
      and ae.event_type = 'deepdive_open'
  ) dcnt on true
  left join lateral (
    select max(ae.created_at) as last_activity_at
    from public.activity_events ae
    where ae.user_id = u.id
  ) act on true
  left join public.comeback_passes cb
    on cb.user_id = u.id
   and cb.campaign = 'winback'
  left join lateral (
    select array_agg(distinct es.campaign) as campaigns
    from public.email_sends es
    where es.user_id = u.id
      and es.status = 'sent'
  ) ec on true
  where u.created_at < p_before
    and u.email not like '%stevenwilson614%'
    and u.email_confirmed_at is not null
  -- Warmest first: segment C leads the ramp so early positive engagement
  -- builds sender reputation before the coldest names go out.
  order by case
             when coalesce(dcnt.deepdive_count, 0) >= 5 then 0
             when coalesce(dcnt.deepdive_count, 0) between 1 and 4 then 1
             else 2
           end,
           dormancy_days asc;
end;
$$;

revoke execute on function public.winback_audience(timestamptz) from anon;
grant execute on function public.winback_audience(timestamptz) to authenticated;
