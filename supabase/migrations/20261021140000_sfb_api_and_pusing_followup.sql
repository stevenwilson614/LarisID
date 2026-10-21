-- Pesan Steven: API asks → halaman API; also refresh bingung copy for "pusing".
-- Client calls enqueue_sfb_api_followup() after a reply that mentions API.
-- go=api opens the API page (interest capture). Re-running does not stack a
-- second open steven_followup on the same person.

create or replace function public.enqueue_sfb_api_followup()
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
    'Hai! Kalau kamu nanya soal API, buka halaman API di menu kiri ya. Di situ bisa catat minat dan WhatsApp-mu — belum ada jadwal rilis, tapi kami catat siapa yang butuh.';
  v_payload jsonb;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  select n.id into v_id
    from public.user_notices n
   where n.user_id = v_me
     and n.kind = 'steven_followup'
     and n.dismissed_at is null
     and n.payload->>'go' = 'api'
   order by n.created_at desc
   limit 1;

  -- Another open Steven chat is already waiting. Don't cover it.
  if v_id is null and exists (
    select 1 from public.user_notices n
     where n.user_id = v_me
       and n.kind = 'steven_followup'
       and n.dismissed_at is null
  ) then
    return null;
  end if;

  v_payload := jsonb_build_object(
    'lead', v_lead,
    'go', 'api',
    'cta', 'Buka halaman API'
  );

  if v_id is null then
    insert into public.user_notices (user_id, kind, payload)
    values (v_me, 'steven_followup', v_payload)
    returning id into v_id;
  end if;

  return json_build_object(
    'id', v_id,
    'kind', 'steven_followup',
    'payload', v_payload
  );
end;
$function$;

revoke all on function public.enqueue_sfb_api_followup() from public;
grant execute on function public.enqueue_sfb_api_followup() to authenticated, service_role;

-- Keep bingung/pusing copy aligned with the client.
create or replace function public.enqueue_sfb_bingung_followup()
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
    'Hai! Kalau masih bingung atau pusing cara pakainya, buka halaman Belajar di menu kiri ya. Langkahnya pelan-pelan, dari cari produk sampai pantau toko.';
  v_payload jsonb;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  select n.id into v_id
    from public.user_notices n
   where n.user_id = v_me
     and n.kind = 'steven_followup'
     and n.dismissed_at is null
     and (
       n.payload->>'go' = 'edukasi'
       or n.payload->>'lead' ilike '%halaman Belajar%'
     )
   order by n.created_at desc
   limit 1;

  if v_id is null and exists (
    select 1 from public.user_notices n
     where n.user_id = v_me
       and n.kind = 'steven_followup'
       and n.dismissed_at is null
  ) then
    return null;
  end if;

  v_payload := jsonb_build_object(
    'lead', v_lead,
    'go', 'edukasi',
    'cta', 'Buka Belajar'
  );

  if v_id is null then
    insert into public.user_notices (user_id, kind, payload)
    values (v_me, 'steven_followup', v_payload)
    returning id into v_id;
  end if;

  return json_build_object(
    'id', v_id,
    'kind', 'steven_followup',
    'payload', v_payload
  );
end;
$function$;

revoke all on function public.enqueue_sfb_bingung_followup() from public;
grant execute on function public.enqueue_sfb_bingung_followup() to authenticated, service_role;
