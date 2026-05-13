-- Assign cohort mentor (leader) by email. Platform "admin" for the app UI is controlled in
-- index.html → PLATFORM_ADMIN_EMAILS (stevenwilson614@gmail.com). This SQL only sets who leads a cohort in the database.

-- Prerequisites:
-- 1) Run migrations/20260213120000_cohort_community.sql first.
-- 2) stevenfwilson1@gmail.com must exist under Authentication → Users (sign up once in the app).
-- 3) A row in public.cohorts must exist (use your slug or the demo from README).

-- Set mentor (cohort leader) to stevenfwilson1@gmail.com for the demo cohort slug:
update public.cohorts c
set mentor_user_id = u.id
from auth.users u
where u.email = 'stevenfwilson1@gmail.com'
  and c.slug = 'demo';

-- If you used a different cohort slug, change 'demo' above, or target by invite_code:
-- update public.cohorts c
-- set mentor_user_id = (select id from auth.users where email = 'stevenfwilson1@gmail.com' limit 1)
-- where c.invite_code = 'LARIS2026';

-- Verify:
-- select c.name, c.slug, c.invite_code, c.mentor_user_id, u.email as mentor_email
-- from public.cohorts c
-- left join auth.users u on u.id = c.mentor_user_id;
