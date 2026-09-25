-- Standard Steven follow-up when someone says data is incomplete
-- ("Datanya kurang lengkap" chip / free text). Same ask for everyone:
-- what specifically are they looking for? They reply in #sfb-card.
--
-- Client calls enqueue_sfb_kurang_lengkap_followup() right after a
-- superuser_prompt answer that matches, so the ask opens in the same session.
-- The INSERT below backfills people who already answered and still have no
-- open follow-up.

create or replace function public.enqueue_sfb_kurang_lengkap_followup()
returns json
language plpgsql
security definer
set search_path = public, auth
set statement_timeout = '5s'
as $function$
declare
  v_me uuid := auth.uid();
  v_id uuid;
  v_lead text :=
    'Hai! Makasih sudah jawab. Kamu bilang datanya kurang lengkap — informasi apa lagi yang paling ingin kamu lihat di LarisID? Ceritain di sini ya, aku baca.';
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  select n.id into v_id
    from public.user_notices n
   where n.user_id = v_me
     and n.kind = 'steven_followup'
     and n.dismissed_at is null
     and n.payload->>'lead' like '%kurang lengkap%'
   order by n.created_at desc
   limit 1;

  if v_id is null then
    insert into public.user_notices (user_id, kind, payload)
    values (v_me, 'steven_followup', jsonb_build_object('lead', v_lead))
    returning id into v_id;
  end if;

  return json_build_object(
    'id', v_id,
    'kind', 'steven_followup',
    'payload', jsonb_build_object('lead', v_lead)
  );
end;
$function$;

revoke all on function public.enqueue_sfb_kurang_lengkap_followup() from public;
grant execute on function public.enqueue_sfb_kurang_lengkap_followup() to authenticated, service_role;

-- Backfill: anyone who already said kurang lengkap and has no open follow-up.
insert into public.user_notices (user_id, kind, payload)
select distinct f.user_id, 'steven_followup', jsonb_build_object(
  'lead',
  'Hai! Makasih sudah jawab. Kamu bilang datanya kurang lengkap — informasi apa lagi yang paling ingin kamu lihat di LarisID? Ceritain di sini ya, aku baca.'
)
from public.feedback f
where f.user_id is not null
  and (
    f.element_context->>'chip' = 'Datanya kurang lengkap'
    or f.message ilike '%kurang lengkap%'
  )
  and coalesce(f.status, 'new') in ('new', 'reviewing')
  and not exists (
    select 1 from public.user_notices n
     where n.user_id = f.user_id
       and n.kind = 'steven_followup'
       and n.dismissed_at is null
  );

update public.feedback f
   set status = 'reviewing'
 where coalesce(f.status, 'new') = 'new'
   and (
     f.element_context->>'chip' = 'Datanya kurang lengkap'
     or f.message ilike '%kurang lengkap%'
   )
   and exists (
     select 1 from public.user_notices n
      where n.user_id = f.user_id
        and n.kind = 'steven_followup'
        and n.dismissed_at is null
        and n.payload->>'lead' like '%kurang lengkap%'
   );
