-- Super-user feedback: mandatory re-ask for people who already saw the card
-- but never replied, plus two personal Steven follow-ups in-chat.
--
-- WHY mandatory. The first show is soft (minimize / outside-click ok). Once
-- asked_at is set, Chat +1 stays until they reply — but many still never open
-- it again. Next login for that cohort must answer before they move on.
--
-- WHY follow-ups as user_notices kind=steven_followup. Dana and Winer already
-- answered the original prompt; we need a second message in the same Steven
-- chat shell without clearing answered_at (that would re-offer the 1000-row
-- grant). The client opens #sfb-card with the notice payload.lead and dismisses
-- the notice when they reply.

-- ── 1. Status RPC: expose mandatory ──────────────────────────────────────────
create or replace function public.my_feedback_prompt_status()
returns json
language plpgsql
stable
security definer
set search_path = public, auth
set statement_timeout = '5s'
as $function$
declare
  v_me       uuid := auth.uid();
  v_email    text;
  v_sessions integer;
  v_dives    integer;
  v_row      public.feedback_prompts%rowtype;
  v_eligible boolean;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  select u.email::text into v_email from auth.users u where u.id = v_me;
  select * into v_row from public.feedback_prompts where user_id = v_me;

  select count(*)::int into v_sessions
    from public.user_sessions where user_id = v_me;

  select count(*)::int into v_dives
    from public.activity_events
   where user_id = v_me and event_type = 'deepdive_open';

  v_eligible :=
      v_row.answered_at is null
      and v_row.dismissed_at is null
      and v_sessions >= 2
      and v_dives >= 1
      and coalesce(v_email, '') !~* '@wa\.larisid\.com$'
      and not public.is_dapur_side_account(coalesce(v_email, ''))
      and not public.is_platform_admin();

  return json_build_object(
    'eligible',     v_eligible,
    -- Soft on first show; once the card has been shown (asked_at), the next
    -- sessions require a reply before the person can dismiss the chat.
    'mandatory',    v_eligible and v_row.asked_at is not null,
    'sessions',     v_sessions,
    'dives',        v_dives,
    'asked_at',     v_row.asked_at,
    'answered_at',  v_row.answered_at,
    'dismissed_at', v_row.dismissed_at
  );
end;
$function$;

revoke all on function public.my_feedback_prompt_status() from public;
grant execute on function public.my_feedback_prompt_status() to authenticated, service_role;

-- ── 2. Personal follow-ups (Dana + Winer) ────────────────────────────────────
insert into public.user_notices (user_id, kind, payload)
select u.id, 'steven_followup', jsonb_build_object(
  'lead',
  'Hai! Kamu bilang masih bingung cara pakainya. Mau ikut program edukasi seller baru, atau cukup dipandu belajar cara pakai softwarenya dulu? Balas di sini ya.'
)
from auth.users u
where u.email = 'danafernanda001@gmail.com'
  and not exists (
    select 1 from public.user_notices n
     where n.user_id = u.id
       and n.kind = 'steven_followup'
       and n.dismissed_at is null
       and n.payload->>'lead' like '%edukasi seller%'
  );

insert into public.user_notices (user_id, kind, payload)
select u.id, 'steven_followup', jsonb_build_object(
  'lead',
  'Hai! Makasih sudah jawab. Kamu bilang datanya kurang lengkap — informasi apa lagi yang paling ingin kamu lihat di LarisID? Ceritain di sini ya, aku baca.'
)
from auth.users u
where u.email = 'winerwinn567@gmail.com'
  and not exists (
    select 1 from public.user_notices n
     where n.user_id = u.id
       and n.kind = 'steven_followup'
       and n.dismissed_at is null
       and n.payload->>'lead' like '%kurang lengkap%'
  );
