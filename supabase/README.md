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
