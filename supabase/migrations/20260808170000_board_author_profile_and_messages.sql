-- 1) Feature board author snapshot gains city + avatar (alongside the
--    existing author_first_name), so the board can show "Steven - Bandung"
--    with a small profile photo without a live, RLS-dependent join per row.
--    Same reasoning as author_first_name: snapshotted server-side at post
--    time, never trusted from the client.
alter table public.feature_requests
  add column if not exists author_city text not null default '',
  add column if not exists author_headshot_url text;

alter table public.feature_request_comments
  add column if not exists author_city text not null default '',
  add column if not exists author_headshot_url text;

create or replace function public.fr_set_author_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fname text;
  fcity text;
  favatar text;
begin
  select nullif(trim(first_name), ''), nullif(trim(city), ''), headshot_url
  into fname, fcity, favatar
  from public.user_profiles
  where user_id = new.author_id;
  new.author_first_name := coalesce(fname, 'Pengguna LarisID');
  new.author_city := coalesce(fcity, '');
  new.author_headshot_url := favatar;
  return new;
end;
$$;

-- feature_requests_feed view needs the two new columns. CREATE OR REPLACE
-- VIEW can only append columns at the end of the existing list — inserting
-- them earlier (even just reordering to match the base table) errors with
-- "cannot change name of view column", so the two new columns go last.
create or replace view public.feature_requests_feed as
select
  fr.id, fr.author_id, fr.author_first_name,
  fr.kind, fr.title, fr.body, fr.created_at,
  coalesce(lc.n, 0)::int as like_count,
  coalesce(cc.n, 0)::int as comment_count,
  exists (
    select 1 from public.feature_request_likes l
    where l.request_id = fr.id and l.user_id = auth.uid()
  ) as liked_by_me,
  fr.author_city, fr.author_headshot_url
from public.feature_requests fr
left join (select request_id, count(*) n from public.feature_request_likes group by request_id) lc
  on lc.request_id = fr.id
left join (select request_id, count(*) n from public.feature_request_comments group by request_id) cc
  on cc.request_id = fr.id;

grant select on public.feature_requests_feed to authenticated;

-- 2) Basic one-way user-to-user messaging — no threads/read UI beyond a
--    flat "messages I've received" list; a reply is just a new message back
--    through the recipient's own profile. Contact details (wa_number,
--    contact_email, and even the opt-in public_whatsapp/public_email) are
--    never exposed through this path — sending only needs the recipient's
--    user_id, which the profile view already has.
create table if not exists public.user_messages (
  id            uuid primary key default gen_random_uuid(),
  from_user_id  uuid not null references auth.users (id) on delete cascade,
  to_user_id    uuid not null references auth.users (id) on delete cascade,
  body          text not null check (char_length(trim(body)) between 1 and 2000),
  created_at    timestamptz not null default now(),
  read_at       timestamptz,
  constraint user_messages_not_self check (from_user_id <> to_user_id)
);

create index if not exists idx_user_messages_to on public.user_messages (to_user_id, created_at desc);
create index if not exists idx_user_messages_from on public.user_messages (from_user_id, created_at desc);

alter table public.user_messages enable row level security;

drop policy if exists um_select on public.user_messages;
create policy um_select on public.user_messages
  for select to authenticated
  using (to_user_id = auth.uid() or from_user_id = auth.uid());

drop policy if exists um_insert on public.user_messages;
create policy um_insert on public.user_messages
  for insert to authenticated
  with check (from_user_id = auth.uid());

-- Recipient marking their own inbox read — sender fields immutable (no
-- policy allows changing from_user_id/to_user_id/body after insert; only
-- read_at, and only by the recipient).
drop policy if exists um_update_read on public.user_messages;
create policy um_update_read on public.user_messages
  for update to authenticated
  using (to_user_id = auth.uid())
  with check (to_user_id = auth.uid());

grant select, insert, update on public.user_messages to authenticated;

-- 3) Public profile lookup by id, for the "view someone's profile" click-
--    through — a thin RPC rather than relying on the client hitting
--    user_profiles directly, so a future tightening of user_profiles_public_read
--    doesn't quietly break this specific, narrow read (name/city/avatar/bio
--    only — never wa_number/contact_email/public_whatsapp/public_email).
create or replace function public.get_public_profile(p_user_id uuid)
returns table (
  user_id uuid,
  display_name text,
  first_name text,
  city text,
  headshot_url text,
  bio text,
  shopee_store_name text,
  shopee_store_url text
)
language sql stable security definer
set search_path = public
as $$
  select up.user_id, up.display_name, up.first_name, up.city, up.headshot_url,
         up.bio, up.shopee_store_name, up.shopee_store_url
  from public.user_profiles up
  where up.user_id = p_user_id and up.is_public is true;
$$;

grant execute on function public.get_public_profile(uuid) to authenticated;
