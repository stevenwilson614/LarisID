-- Inbox list needs the sender's display name/city/avatar, not just their
-- user_id — same pre-joined-view pattern as feature_requests_feed. The join
-- naturally degrades if the sender's own profile isn't public (RLS still
-- applies to the user_profiles side): falls back to "Pengguna LarisID" with
-- no city/avatar, rather than failing the whole row.
create or replace view public.user_messages_inbox as
select
  m.id, m.from_user_id, m.to_user_id, m.body, m.created_at, m.read_at,
  coalesce(nullif(trim(p.first_name), ''), 'Pengguna LarisID') as from_first_name,
  p.city as from_city,
  p.headshot_url as from_headshot_url
from public.user_messages m
left join public.user_profiles p on p.user_id = m.from_user_id
where m.to_user_id = auth.uid();

revoke all on public.user_messages_inbox from public;
revoke all on public.user_messages_inbox from anon;
grant select on public.user_messages_inbox to authenticated;
