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

## Cohort theme & leader branding (`migrations/20260215120000_cohort_theme_leader_branding.sql`)

Adds to `cohorts`: `theme_primary`, `theme_secondary`, `theme_json`, `badge_icon`, `slogan` (all readable by members; **writes only** via `cohort_leader_update_branding` RPC by `mentor_user_id`).

Adds to `community_posts`: `kind`, `metadata`, `hidden_at`, `hidden_by` for structured feed + moderation (RLS: students do not see hidden posts from others).

After applying, cohort leaders set the cohort name, colors (hex `#RRGGBB`), emblem/badge icon, and slogan in the app under **Kohort → Leader → Branding & tema kohort**.

### Ocean Blue starter cohort

The starter cohort is created by `migrations/20260513153000_ocean_blue_role_invites.sql`.

```text
Student invite code: OCEANBLUE-STUDENT
Leader invite code:  OCEANBLUE-LEADER
Student invite link: https://larisid.com/?invite=OCEANBLUE-STUDENT
Leader invite link:  https://larisid.com/?invite=OCEANBLUE-LEADER
```

Share the leader code only with the cohort leader because it grants leader access for Ocean Blue. After joining, leaders can update the cohort name, colors, badge/emblem, and motto in **Kohort → Leader → Branding & tema kohort**.

### Seed example with ocean / sand theme

```sql
update public.cohorts
set theme_primary = '#0c4a6e',
    theme_secondary = '#d4b896',
    badge_icon = '🌊',
    slogan = 'Cohort Ocean Blue — fokus & akuntabilitas'
where slug = 'demo';
```

### Roles: platform admin vs cohort leader vs student

- **Platform admin**: managed in `public.app_role_assignments` with `role = 'admin'`, with `stevenwilson614@gmail.com` bootstrapped as the first admin. Admins can open the Admin tab, view all users, assign app roles, preview cohort shells, and manage cohort leader/student access through RPCs.
- **Cohort leader**: either assigned as `cohorts.mentor_user_id` or given `role = 'leader'`. Leaders see only their cohorts, student directory, recent activity, feed moderation, announcements, milestones, branding, and student status controls.
- **Student / normal user**: default role. Students use the regular UI and can see classmates' feed/activity inside their active cohort.

The role infrastructure lives in `migrations/20260513150000_roles_admin_leader_infra.sql`. Starter accounts:

```text
Admin:          stevenwilson614@gmail.com
Cohort leader:  stevenfwilson1@gmail.com
Student:        olivia.melia.park@gmail.com
```

After those users exist in **Authentication**, run `supabase/seed_admin_and_leader.sql` in the SQL Editor or apply the migrations so Ocean Blue gets the leader/student assignments.

### Invite links for signup (no extra SQL)

Mentors can share a link so the code is saved when the student opens the site, then applied automatically after they log in or sign up (email or Google):

```text
https://larisid.com/?invite=OCEANBLUE-STUDENT
```

The `invite` query parameter is read on first load, stored in `sessionStorage`, and removed from the URL. After authentication, the app calls `join_cohort` with that code.

Optional: students can also paste the same code in the auth modal under **Kode kohort (opsional)** before **Daftar** / **Masuk** / **Google**.
