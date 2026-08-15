-- HUT RI ke-81: lift the Deep Dive Search 10/day cap
-- from Minggu 16 Agustus 2026 08:00 WIB through Senin 17 Agustus 2026 23:59 WIB.
--
-- Viewing a product was already never walled. This lifts the *search/chat*
-- meter (gpt_new_chat + gpt_chats insert RLS) so signed-in sellers can open
-- as many Deep Dive searches as they want for the holiday. AI-point spend
-- stays metered — those calls cost real money.
--
-- After 18 Agustus 00:00 WIB the helper returns false and the 10/day cap
-- resumes on the new WIB day (counters reset at midnight, so nobody inherits
-- a 50-search Sunday into Monday).

create or replace function public._merdeka_unlimited()
returns boolean
language sql
stable
as $$
  select now() >= timestamptz '2026-08-16 08:00:00+07'
     and now() <  timestamptz '2026-08-18 00:00:00+07'
$$;

revoke all on function public._merdeka_unlimited() from public;
grant execute on function public._merdeka_unlimited() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- gpt_new_chat: treat the holiday window like privileged (unlimited searches)
-- ---------------------------------------------------------------------------

create or replace function public.gpt_new_chat(p_title text, p_context jsonb default '{}'::jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me         uuid := auth.uid();
  v_day        date;
  v_count      integer;
  v_limit      integer;
  v_reset_at   timestamptz;
  v_chat       public.gpt_chats%rowtype;
  v_privileged boolean;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;

  v_day := (now() at time zone 'Asia/Jakarta')::date;
  v_reset_at := ((v_day + 1)::timestamp at time zone 'Asia/Jakarta');
  v_privileged := public._usage_is_privileged() or public._merdeka_unlimited();
  v_limit := public._gpt_chat_limit(v_me);

  select count(*)::integer into v_count
  from public.gpt_chats
  where user_id = v_me
    and (created_at at time zone 'Asia/Jakarta')::date = v_day;

  if not v_privileged and v_count >= v_limit then
    return json_build_object(
      'allowed', false,
      'reason', 'limit_reached',
      'used', v_count,
      'limit', v_limit,
      'reset_at', v_reset_at,
      'seconds_until_reset', greatest(1, extract(epoch from (v_reset_at - now()))::int)
    );
  end if;

  insert into public.gpt_chats (user_id, title, context)
  values (
    v_me,
    coalesce(nullif(trim(p_title), ''), 'Chat baru'),
    coalesce(p_context, '{}'::jsonb)
  )
  returning * into v_chat;

  return json_build_object(
    'allowed', true,
    'unlimited', v_privileged,
    'merdeka', public._merdeka_unlimited(),
    'used', v_count + 1,
    'limit', case when v_privileged then null else v_limit end,
    'reset_at', v_reset_at,
    'seconds_until_reset', greatest(1, extract(epoch from (v_reset_at - now()))::int),
    'chat', json_build_object(
      'id', v_chat.id,
      'title', v_chat.title,
      'context', v_chat.context,
      'created_at', v_chat.created_at
    )
  );
end;
$$;

-- RLS insert path must use the same holiday bypass, or it rejects what the RPC allowed.
drop policy if exists gpt_chats_insert_capped on public.gpt_chats;

create policy gpt_chats_insert_capped on public.gpt_chats
  for insert with check (
    auth.uid() = user_id
    and (
      public._usage_is_privileged()
      or public._merdeka_unlimited()
      or (
        select count(*) from public.gpt_chats c2
        where c2.user_id = auth.uid()
          and (c2.created_at at time zone 'Asia/Jakarta')::date
              = (now() at time zone 'Asia/Jakarta')::date
      ) < public._gpt_chat_limit(auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- get_my_usage: so the usage pill shows ∞ during the window (dives only;
-- AI points stay in the payload so callers that still meter AI can).
-- ---------------------------------------------------------------------------

create or replace function public.get_my_usage()
 returns json
 language plpgsql
 stable
 SECURITY DEFINER
 SET search_path TO 'public'
as $$
declare
  v_me    uuid := auth.uid();
  v_row   public.daily_usage%rowtype;
  v_limit integer;
  v_ext   boolean;
  v_ref   integer;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  if public._usage_is_privileged() then
    return json_build_object(
      'unlimited', true,
      'dives_used', 0,
      'dive_limit', null,
      'ai_used', 0,
      'ai_limit', null,
      'extension_bonus', 0,
      'referral_bonus', 0,
      'bonus_dives', 0,
      'can_spin', false,
      'can_claim_feedback', false,
      'seconds_until_reset', public._usage_seconds_until_reset(),
      'pass_expires_at', null,
      'merdeka', public._merdeka_unlimited()
    );
  end if;

  if public._merdeka_unlimited() then
    select * into v_row from public.daily_usage
     where user_id = v_me and day = public._usage_day();

    v_ext := exists (select 1 from public.extension_codes where user_id = v_me and used = true);
    v_ref := least(5, coalesce((select count(*)::int from public.referrals
                                 where referrer_id = v_me and credited = true), 0));

    return json_build_object(
      'unlimited', true,
      'merdeka', true,
      'dives_used', coalesce(v_row.dives_used, 0),
      'dive_limit', null,
      'ai_used', coalesce(v_row.ai_used, 0),
      'ai_limit', 5,
      'extension_bonus', case when v_ext then 3 else 0 end,
      'referral_bonus', v_ref,
      'bonus_dives', coalesce(v_row.bonus_dives, 0),
      'can_spin', false,
      'can_claim_feedback', false,
      'seconds_until_reset', public._usage_seconds_until_reset(),
      'pass_expires_at', null
    );
  end if;

  if public._has_comeback_pass(v_me) then
    select * into v_row from public.daily_usage
     where user_id = v_me and day = public._usage_day();

    v_ext := exists (select 1 from public.extension_codes where user_id = v_me and used = true);
    v_ref := least(5, coalesce((select count(*)::int from public.referrals
                                 where referrer_id = v_me and credited = true), 0));

    return json_build_object(
      'unlimited', true,
      'dives_used', coalesce(v_row.dives_used, 0),
      'dive_limit', 60,
      'ai_used', coalesce(v_row.ai_used, 0),
      'ai_limit', 5,
      'extension_bonus', case when v_ext then 3 else 0 end,
      'referral_bonus', v_ref,
      'bonus_dives', coalesce(v_row.bonus_dives, 0),
      'can_spin', v_row.spun_at is null,
      'can_claim_feedback', v_row.feedback_bonus_at is null,
      'seconds_until_reset', public._usage_seconds_until_reset(),
      'pass_expires_at', public._comeback_pass_expiry(v_me)
    );
  end if;

  select * into v_row from public.daily_usage
   where user_id = v_me and day = public._usage_day();

  v_ext := exists (select 1 from public.extension_codes where user_id = v_me and used = true);
  v_ref := least(5, coalesce((select count(*)::int from public.referrals
                               where referrer_id = v_me and credited = true), 0));
  v_limit := public._dive_limit(v_me);

  return json_build_object(
    'unlimited', false,
    'dives_used', coalesce(v_row.dives_used, 0),
    'dive_limit', v_limit,
    'ai_used', coalesce(v_row.ai_used, 0),
    'ai_limit', 5,
    'extension_bonus', case when v_ext then 3 else 0 end,
    'referral_bonus', v_ref,
    'bonus_dives', coalesce(v_row.bonus_dives, 0),
    'can_spin', v_row.spun_at is null,
    'can_claim_feedback', v_row.feedback_bonus_at is null,
    'seconds_until_reset', public._usage_seconds_until_reset(),
    'pass_expires_at', null
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Audience for the holiday email: everyone who has ever signed up, minus
-- suppressions. service_role (cron) or platform admin may call it.
-- ---------------------------------------------------------------------------

create or replace function public.merdeka_audience()
returns table (
  user_id uuid,
  email text,
  display_name text,
  suppressed boolean,
  already_sent boolean
)
language plpgsql
stable
security definer
set search_path = public, auth
as $$
begin
  -- service_role / postgres: auth.uid() is null. Admins pass is_platform_admin().
  if auth.uid() is not null and not public.is_platform_admin() then
    raise exception 'forbidden';
  end if;

  return query
  select
    u.id,
    u.email::text,
    coalesce(
      nullif(trim(both from coalesce(u.raw_user_meta_data ->> 'full_name', '')), ''),
      split_part(u.email, '@', 1)
    )::text,
    exists (
      select 1 from public.email_suppressions s
      where lower(s.email) = lower(u.email)
    ),
    exists (
      select 1 from public.email_sends e
      where e.campaign = 'merdeka_2026'
        and lower(e.email) = lower(u.email)
        and e.status = 'sent'
    )
  from auth.users u
  where u.email is not null
    and length(trim(u.email)) > 0;
end;
$$;

revoke all on function public.merdeka_audience() from public;
grant execute on function public.merdeka_audience() to authenticated, service_role;

-- One-shot cron: 16 Aug 01:00 UTC = 08:00 WIB. Reuses the weekly-digest job's
-- Authorization header so this file never embeds a bearer token.
do $$
declare
  v_cmd text;
begin
  select command into v_cmd
    from cron.job
   where jobname = 'weekly-digest'
   limit 1;

  if v_cmd is null then
    raise notice 'weekly-digest cron missing; schedule send-merdeka-2026 manually';
    return;
  end if;

  v_cmd := replace(v_cmd, '/functions/v1/weekly-digest', '/functions/v1/send-merdeka');

  if exists (select 1 from cron.job where jobname = 'send-merdeka-2026') then
    perform cron.unschedule('send-merdeka-2026');
  end if;

  perform cron.schedule('send-merdeka-2026', '0 1 16 8 *', v_cmd);
end $$;

notify pgrst, 'reload schema';
