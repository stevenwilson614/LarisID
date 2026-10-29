# LMS

**Canonical product UI** is the left-rail class app (profile top-left; Dashboard / Students / Kurikulum / Otomasi / Perpustakaan / Jadwal / Diskusi / …).

| URL | Who |
| --- | --- |
| [`https://larisid.com/lms/`](https://larisid.com/lms/) | Mentor hub |
| [`https://larisid.com/s/{slug}/`](https://larisid.com/s/test-1/) | Student school (e.g. `test-1`) |

Source tree: `obrolan.marketing/` (HTML/CSS/JS assembled into the static site; `server/` excluded). Assets and API stay under `/obrolan.marketing/…`. Contabo `anton-school` serves `/obrolan.marketing/api/*` and `/api/*` from disk (`docker/volumes/anton-school`, e.g. `state/test-1.json`).

Legacy `/obrolan.marketing/` redirects to `/lms/`. `/lms/{slug}/` (except `/lms/card`) redirects to `/s/{slug}/`.

```bash
bash scripts/deploy-static.sh
# After server.mjs changes, rsync to Contabo docker/anton-school/ and:
#   docker compose -f docker-compose.yml -f docker-compose.caddy.yml -f docker-compose.larisid.yml up -d anton-school
```

Do not revive `js/lms-join.js` or public invite-code file downloads as the share model.

---

## Contabo Postgres auth LMS (secondary)

A separate experiment lives in `lms/` (`lms/index.html`, `lms/js/*`, `lms_*` tables). It is **not** the live class UI. Caddy does not serve that shell at `/lms/` anymore. Invite-card HTML may still use `/lms/card` → `lms-invite-card`.

Session key for that experiment is `lms_auth_v1`. It must not use a `sb-*-auth-token` key, because the seller app deletes those on boot.

Belajar (`js/gpt-belajar.js`) and LarisRise (`js/laris-cohort.js`, `cohorts`) are different products. Do not fold them into the class app, and do not drop their tables.

### Who can see what (Postgres LMS)

One auth user has one LMS role, `mentor` or `student`. Mentor daftar creates the mentor row. A student row is created only by `lms_accept_invite`. The same user cannot be both.

A mentor reads and edits only their account, their students, and their modules, lessons, and materials, including drafts. A student reads only their own account row, plus lessons and materials whose `mentor_id` is theirs and whose lesson is published. Students do not get a classmate list. Another mentor cannot see those students or files.

There is no platform-admin bypass and no invite string that opens a file. The raw invite token is returned once, stored only as a SHA-256 hash, and works for one student for 14 days.

### Files (Postgres LMS)

Bucket `lms-materials` is private. Object name is `{mentor_id}/{material_id}`.

- A mentor can upload, replace, and delete only inside their own folder.
- A student can read an object only when a published lesson of their mentor points at that exact path.
- Draft files stay with the mentor.
- The client downloads the file with the LMS session and never publishes a URL.

Allowed types: PDF, JPEG, PNG, WebP, plain text, DOCX, PPTX, MP4, or `application/octet-stream`. Cap is 50 MB. One file per lesson.

### Schema

Tables: `lms_accounts`, `lms_invites`, `lms_modules`, `lms_lessons`, `lms_materials`, `lms_sessions`.

Writes that create a role go through `lms_register_mentor`, `lms_create_invite`, and `lms_accept_invite`. Triggers stamp `mentor_id` from `auth.uid()` so a mentor cannot insert a row as someone else, and they reject a storage path that is not `{mentor_id}/{material_id}`.

```bash
bash scripts/apply-selfhost.sh supabase/migrations/20261029120000_lms_schools.sql
```

Never `supabase db push --linked`.

### Browser tab + invite share brand

Each mentor has `org_name`, unique `org_slug`, and optional `avatar_url` (public bucket `lms-avatars`). The invite a mentor copies is `https://larisid.com/lms/card/?invite=…`. Caddy serves that from the `lms-invite-card` function. Prefer pointing students at `/s/{slug}/` for the live class app.

### Jadwal (Postgres LMS)

Mentors add sessions on the Jadwal tab. Calendar subscribe:

`https://api.larisid.com/functions/v1/lms-calendar-ics?mentor=<mentor uuid>&token=<calendar_token>`

```bash
bash scripts/apply-selfhost.sh supabase/migrations/20261029180000_lms_sessions.sql
bash scripts/deploy-function-selfhost.sh lms-calendar-ics
```

`lms-calendar-ics` is listed in `NO_VERIFY_JWT_FUNCTIONS`. Recreate the functions container after that env change so it is actually loaded.
