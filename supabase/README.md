# Supabase migrations (LarisID)

Apply cohort community tables and policies in the Supabase SQL Editor, or with the Supabase CLI from this repo root:

```bash
supabase db push
```

## Cohort MVP (`migrations/20260213120000_cohort_community.sql`)

Creates:

- `cohorts`, `cohort_members`, `milestones`, `user_milestone_progress`
- `community_posts`, `cohort_announcements`, `activity_events`
- RLS policies for students and mentors
- `join_cohort(p_invite text)` — students join with invite code
- `cohort_leaderboard(p_cohort uuid, p_days int)` — aggregated points for the leaderboard UI

### Seed a demo cohort (SQL Editor)

Replace `YOUR_AUTH_USER_UUID` with your user id from **Authentication → Users**.

```sql
insert into public.cohorts (name, slug, invite_code, whatsapp_invite_url, mentor_user_id)
values (
  'Demo Cohort',
  'demo',
  'LARIS2026',
  'https://chat.whatsapp.com/REPLACE_WITH_YOUR_GROUP_LINK',
  'YOUR_AUTH_USER_UUID'::uuid
)
on conflict (slug) do nothing;
```

Students join in the app via **Kohort → Gabung** with invite code `LARIS2026` (or whatever you set).

### Roles: platform admin vs cohort leader

- **Platform admin** (Analytics tab, cohort Student|Leader preview): emails listed in the site code as `PLATFORM_ADMIN_EMAILS` in `index.html` (default: `stevenwilson614@gmail.com`). To add more admins later, add their emails to that array and redeploy.
- **Cohort leader (mentor)** for a cohort: the `mentor_user_id` column on that row in `public.cohorts` must be the Auth user id of the leader (e.g. `stevenfwilson1@gmail.com`). After both users exist in **Authentication**, run `supabase/seed_admin_and_leader.sql` in the SQL Editor (adjust `slug` / `invite_code` if needed).

### Invite links for signup (no extra SQL)

Mentors can share a link so the code is saved when the student opens the site, then applied automatically after they log in or sign up (email or Google):

```text
https://larisid.com/?invite=LARIS2026
```

The `invite` query parameter is read on first load, stored in `sessionStorage`, and removed from the URL. After authentication, the app calls `join_cohort` with that code.

Optional: students can also paste the same code in the auth modal under **Kode kohort (opsional)** before **Daftar** / **Masuk** / **Google**.
