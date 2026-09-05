-- Audience for one-off repeat-user feedback email (Sep 2026).
-- Signed-up Laris users who came back at least once (2+ user_sessions rows)
-- and opened at least one Deep Dive — engaged enough to ask for product feedback.

create or replace function public.feedback_repeat_audience()
returns table (
  user_id uuid,
  email text,
  display_name text,
  sessions bigint,
  suppressed boolean,
  already_sent boolean
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is not null and not public.is_platform_admin() then
    raise exception 'forbidden';
  end if;

  return query
  with sess as (
    select s.user_id, count(*)::bigint as sessions
    from public.user_sessions s
    group by s.user_id
    having count(*) >= 2
  ),
  engaged as (
    select distinct e.user_id
    from public.activity_events e
    where e.event_type = 'deepdive_open'
  )
  select
    u.id,
    u.email::text,
    coalesce(
      nullif(trim(both from coalesce(u.raw_user_meta_data ->> 'full_name', '')), ''),
      nullif(trim(both from coalesce(up.display_name, up.first_name || ' ' || up.last_name, '')), ''),
      split_part(u.email, '@', 1)
    )::text,
    sess.sessions,
    exists (
      select 1 from public.email_suppressions s
      where lower(s.email) = lower(u.email)
    ),
    exists (
      select 1 from public.email_sends e
      where e.campaign = 'feedback_repeat_2026_09'
        and lower(e.email) = lower(u.email)
        and e.status = 'sent'
    )
  from auth.users u
  join sess on sess.user_id = u.id
  join engaged on engaged.user_id = u.id
  left join public.user_profiles up on up.user_id = u.id
  where u.email is not null
    and length(trim(u.email)) > 0
    and u.email !~* '@wa\.larisid\.com$'
    and not public.is_dapur_side_account(u.email::text);
end;
$$;

revoke all on function public.feedback_repeat_audience() from public;
grant execute on function public.feedback_repeat_audience() to authenticated, service_role;

notify pgrst, 'reload schema';
