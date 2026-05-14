-- Seed the starter LarisID roles:
-- - stevenwilson614@gmail.com = platform admin
-- - stevenfwilson1@gmail.com = cohort leader (Ocean Blue)
-- - olivia.melia.park@gmail.com = student
-- Run after migrations, and after the users have signed up at least once.

-- Prerequisites:
-- 1) Run migrations/20260213120000_cohort_community.sql first.
-- 2) stevenfwilson1@gmail.com must exist under Authentication → Users (sign up once in the app).
-- 3) Ocean Blue exists (created by migrations/20260513153000_ocean_blue_role_invites.sql).

insert into public.app_role_assignments (email, role, note)
values
  ('stevenwilson614@gmail.com', 'admin', 'Platform admin'),
  ('stevenfwilson1@gmail.com', 'leader', 'Cohort leader'),
  ('olivia.melia.park@gmail.com', 'student', 'Demo student')
on conflict (email) do update
set role = excluded.role,
    note = excluded.note,
    updated_at = now();

-- Set mentor (cohort leader) to stevenfwilson1@gmail.com for Ocean Blue.
update public.cohorts c
set mentor_user_id = u.id
from auth.users u
where lower(u.email) = 'stevenfwilson1@gmail.com'
  and c.slug = 'ocean-blue';

insert into public.cohort_members (cohort_id, user_id, role, status)
select c.id, u.id, 'mentor', 'active'
from public.cohorts c
join auth.users u on lower(u.email) = 'stevenfwilson1@gmail.com'
where c.slug = 'ocean-blue'
on conflict (cohort_id, user_id)
do update set role = 'mentor', status = 'active';

insert into public.cohort_members (cohort_id, user_id, role, status)
select c.id, u.id, 'student', 'active'
from public.cohorts c
join auth.users u on lower(u.email) = 'olivia.melia.park@gmail.com'
where c.slug = 'ocean-blue'
on conflict (cohort_id, user_id)
do update set role = 'student', status = 'active';

-- If you used a different cohort slug, change 'ocean-blue' above, or target by invite_code:
-- update public.cohorts c
-- set mentor_user_id = (select id from auth.users where email = 'stevenfwilson1@gmail.com' limit 1)
-- where c.invite_code = 'OCEANBLUE-STUDENT';

-- Verify:
-- select c.name, c.slug, c.invite_code, c.mentor_user_id, u.email as mentor_email
-- from public.cohorts c
-- left join auth.users u on u.id = c.mentor_user_id;
