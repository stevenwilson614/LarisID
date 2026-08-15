# Database migrations (LarisID)

**Live backend is Contabo**, not Supabase Cloud. API: `https://api.larisid.com`.
How to apply SQL and edge functions: **[docs/self-host.md](../docs/self-host.md)**.

```bash
bash scripts/apply-selfhost.sh supabase/migrations/<file>.sql
bash scripts/deploy-function-selfhost.sh <slug>
```

Do **not** `supabase db push --linked`. The old cloud ref `bzmvlraziqevqdyotvgy`
was migrated off and removed. `supabase/.temp/linked-project.json` is a leftover
and must not be used.

**Scraper ingest:** [`docs/SCRAPER_TODO.md`](../docs/SCRAPER_TODO.md). Velocity /
weekly snapshot DDL is applied the same SSH+psql way from `~/shopee_scraper` —
see [docs/listing-weekly.md](../docs/listing-weekly.md).

One-off SQL: Studio at `https://api.larisid.com` (basic auth from the infra
`.env`) or `ssh` + `docker exec -it supabase-db psql -U postgres`.

Apply cohort community tables the same way (`bash scripts/apply-selfhost.sh …`):

## Cohort MVP (`migrations/20260213120000_cohort_community.sql`)

Creates:

- `cohorts`, `cohort_members`, `milestones`, `user_milestone_progress`
- `community_posts`, `cohort_announcements`, `activity_events`
- RLS policies for students and mentors
- `join_cohort(p_invite text)` — students join with invite code
- `cohort_leaderboard(p_cohort uuid, p_days int)` — aggregated points for the leaderboard UI

### Seed a demo cohort (psql on Contabo)

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

After those users exist in GoTrue (`auth.users` on Contabo), apply
`supabase/seed_admin_and_leader.sql` with `bash scripts/apply-selfhost.sh` so Ocean Blue gets the leader/student assignments.

### Invite links for signup (no extra SQL)

Mentors can share a link so the code is saved when the student opens the site, then applied automatically after they log in or sign up (email or Google):

```text
https://larisid.com/?invite=OCEANBLUE-STUDENT
```

The `invite` query parameter is read on first load, stored in `sessionStorage`, and removed from the URL. After authentication, the app calls `join_cohort` with that code.

Optional: students can also paste the same code in the auth modal under **Kode kohort (opsional)** before **Daftar** / **Masuk** / **Google**.

## Onboarding prefs (`migrations/20260611160000_onboarding_seller_status.sql`)

Adds `seller_status` to `public.user_onboarding_prefs`:

- `first_time` — user is new to selling
- `existing` — user already sells elsewhere

Written by the in-page Discover onboarding (step 3). See **[docs/journey-funnel.md](../docs/journey-funnel.md)**.

## User journey stats (`migrations/20260611170000_user_journey_stats.sql`)

Lightweight funnel counters synced from the client (`larisid_journey_v1` in localStorage):

| Column | Purpose |
|--------|---------|
| `deepdive_count` | Number of Deep Dive opens |
| `first_deepdive_at` | First open timestamp |
| `last_discover_at` | Last Discover view |
| `full_deepdive_unlocked` | User chose “Analisis lengkap” in beginner Deep Dive |

RLS: users read/write **own row only** (`auth.uid() = user_id`).

Product snapshots and Beranda return-loop timing (`seenProducts`, `lastBerandaAt`) stay **client-only** for now — not in this table.

## LARISgpt chat (`migrations/20260716140000_gpt_chats.sql`)

Chat sessions for the app: `gpt_chats`, `gpt_messages`, RPC `gpt_new_chat` (3 new chats/day, WIB midnight). The `gpt_`/`GptX` naming is a holdover from when this UI was the "B" arm of an A/B test — it is not a separate app anymore. There is only one site now: it lives at `https://larisid.com/`. `/gpt/` still resolves (see below) but is not the canonical address. Historical experiment analysis: **[docs/AB_TEST.sql](../docs/AB_TEST.sql)** (closed 2026-08-10, read the header before running).

### Auth redirect URLs

On the self-host box, keep these in `ADDITIONAL_REDIRECT_URLS` / GoTrue env
(`larisid-infra/docker/.env`), not the old cloud Dashboard:

- `https://larisid.com/` (canonical — where the app actually lives)
- `https://larisid.com/gpt/` (legacy path, still served; keep this or OAuth breaks for anyone with a stale `/gpt/` bookmark or in-flight session)
- `http://localhost:8000/gpt/` and `http://localhost:8000/` (local testing)
