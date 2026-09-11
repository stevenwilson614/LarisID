-- Tell people who received the 1000-row download gift via the in-app bell.
--
-- WHY. claim_feedback_export_grant() already banks 1000 export rows, and the
-- "pesan dari Steven" card says so for ~1.6s after they answer. That card
-- never comes back, so a returning visit has no reminder. The header bell
-- (user_notices) is the durable inbox; this writes one export_grant row per
-- gifted account — backfill for anyone already granted, and on every future
-- claim. The bell is the inbox; the founder card may also render the same
-- row because it is a message from Steven.
--
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20260911190000_export_grant_notices.sql

begin;

create unique index if not exists user_notices_export_grant_once
  on public.user_notices (user_id)
  where kind = 'export_grant';

-- ── Future claims write the notice in the same transaction as the bank ───────
create or replace function public.claim_feedback_export_grant(p_feedback_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_me uuid := auth.uid();
  v_ok boolean;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  if exists (
    select 1 from public.user_export_grants
     where user_id = v_me and source = 'superuser_feedback'
  ) then
    return json_build_object('granted', false, 'reason', 'already_claimed');
  end if;

  select exists (
    select 1 from public.feedback f
     where f.id = p_feedback_id
       and f.user_id = v_me
       and f.page = 'superuser_prompt'
       and length(coalesce(trim(f.message), '')) >= 25
  ) into v_ok;

  if not v_ok then
    return json_build_object('granted', false, 'reason', 'invalid_feedback');
  end if;

  insert into public.user_export_grants (user_id, rows_granted, source)
  values (v_me, 1000, 'superuser_feedback');

  insert into public.user_notices (user_id, kind, payload)
  values (v_me, 'export_grant', jsonb_build_object(
    'lead', 'Aku tambahin 1.000 baris unduhan ke akun kamu — dipakai kapan saja, dari Cari Produk atau Deep Dive.',
    'rows', 1000,
    'source', 'superuser_feedback',
    'go', 'directory'
  ))
  on conflict (user_id) where kind = 'export_grant' do nothing;

  return json_build_object(
    'granted',   true,
    'rows',      1000,
    'remaining', public._export_row_grant_remaining(v_me)
  );
end;
$function$;

-- create or replace keeps the existing ACL (authenticated + service_role).

-- ── Anyone already gifted, once ──────────────────────────────────────────────
insert into public.user_notices (user_id, kind, payload)
select distinct on (g.user_id)
  g.user_id,
  'export_grant',
  jsonb_build_object(
    'lead', 'Aku tambahin 1.000 baris unduhan ke akun kamu — dipakai kapan saja, dari Cari Produk atau Deep Dive.',
    'rows', g.rows_granted,
    'source', g.source,
    'go', 'directory'
  )
from public.user_export_grants g
where g.rows_granted >= 1000
  and not exists (
    select 1 from public.user_notices n
     where n.user_id = g.user_id and n.kind = 'export_grant'
  )
order by g.user_id, g.granted_at desc
on conflict (user_id) where kind = 'export_grant' do nothing;

notify pgrst, 'reload schema';

commit;
