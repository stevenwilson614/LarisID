-- Funnel/data hygiene follow-ups to the discover-first launch.
--
-- 1) Secure public.keyword_intelligence. It had RLS disabled, leaving every row
--    readable/writable by anyone holding the anon key. The client app never
--    queries this table (it is populated/read server-side via the service role,
--    which bypasses RLS), so enabling RLS with no policies locks it down to
--    backend access only without breaking any user-facing feature.
alter table public.keyword_intelligence enable row level security;

-- 2) Backfill user_profiles.display_name from the signup full_name held in
--    auth.users metadata. Names were always captured at signup, but the profile
--    column stayed null, so cohort/mentor views fell back to email. Only fills
--    blanks — never overwrites a name a user set themselves.
update public.user_profiles p
set display_name = nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
    updated_at   = now()
from auth.users u
where u.id = p.user_id
  and (p.display_name is null or p.display_name = '')
  and coalesce(trim(u.raw_user_meta_data->>'full_name'), '') <> '';

-- (The legacy first_name/last_name columns are NOT NULL and unused by the app;
--  left as-is. Name display is driven by display_name + auth metadata full_name.)
