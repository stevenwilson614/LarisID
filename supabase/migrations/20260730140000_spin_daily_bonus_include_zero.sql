-- spin_daily_bonus: include 0 award; weights 15% 0 · 40% +1 · 30% +2 · 15% +5
-- spun_at still set on a 0 roll so once-per-WIB-day holds.

create or replace function public.spin_daily_bonus()
returns json
language plpgsql security definer
set search_path = public
as $$
declare
  v_me     uuid := auth.uid();
  v_roll   double precision;
  v_award  integer;
  v_bonus  integer;
  v_used   integer;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  if public._usage_is_privileged() then
    return json_build_object('allowed', false, 'reason', 'unlimited');
  end if;

  -- 15% 0 · 40% +1 · 30% +2 · 15% +5
  v_roll := random();
  v_award := case
    when v_roll < 0.15 then 0
    when v_roll < 0.55 then 1
    when v_roll < 0.85 then 2
    else 5
  end;

  insert into public.daily_usage (user_id, day)
  values (v_me, public._usage_day())
  on conflict (user_id, day) do nothing;

  update public.daily_usage
     set bonus_dives = bonus_dives + v_award,
         spun_at     = now(),
         updated_at  = now()
   where user_id = v_me
     and day = public._usage_day()
     and spun_at is null
  returning bonus_dives, dives_used into v_bonus, v_used;

  if not found then
    return json_build_object(
      'allowed', false,
      'reason', 'already_spun',
      'dives_used', coalesce((select dives_used from public.daily_usage
                               where user_id = v_me and day = public._usage_day()), 0),
      'dive_limit', public._dive_limit(v_me),
      'seconds_until_reset', public._usage_seconds_until_reset()
    );
  end if;

  return json_build_object(
    'allowed', true,
    'award', v_award,
    'bonus_dives', v_bonus,
    'dives_used', v_used,
    'dive_limit', public._dive_limit(v_me),
    'seconds_until_reset', public._usage_seconds_until_reset()
  );
end;
$$;

revoke all on function public.spin_daily_bonus() from public;
grant execute on function public.spin_daily_bonus() to authenticated;
