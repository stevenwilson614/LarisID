# LMS — mentor schools at /lms

A separate app from the seller product. Login lives only at `/lms` (`lms/index.html`, `lms/js/auth.js`, `lms/js/api.js`, `lms/js/app.js`). The session key is `lms_auth_v1`. It must not use a `sb-*-auth-token` key, because the seller app deletes those on boot.

Belajar (`js/gpt-belajar.js`) and LarisRise (`js/laris-cohort.js`, `cohorts`) are different products. Do not fold them into this app, and do not drop their tables.

## Who can see what

One auth user has one LMS role, `mentor` or `student`. Mentor daftar creates the mentor row. A student row is created only by `lms_accept_invite`. The same user cannot be both.

A mentor reads and edits only their account, their students, and their modules, lessons, and materials, including drafts. A student reads only their own account row, plus lessons and materials whose `mentor_id` is theirs and whose lesson is published. Students do not get a classmate list. Another mentor cannot see those students or files.

There is no platform-admin bypass and no invite string that opens a file. The raw invite token is returned once, stored only as a SHA-256 hash, and works for one student for 14 days.

## Files

Bucket `lms-materials` is private. Object name is `{mentor_id}/{material_id}`.

- A mentor can upload, replace, and delete only inside their own folder.
- A student can read an object only when a published lesson of their mentor points at that exact path.
- Draft files stay with the mentor.
- The client downloads the file with the LMS session and never publishes a URL.

Allowed types: PDF, JPEG, PNG, WebP, plain text, DOCX, PPTX, MP4, or `application/octet-stream`. Cap is 50 MB. One file per lesson.

## Schema

Tables: `lms_accounts`, `lms_invites`, `lms_modules`, `lms_lessons`, `lms_materials`, `lms_sessions`.

Writes that create a role go through `lms_register_mentor`, `lms_create_invite`, and `lms_accept_invite`. Triggers stamp `mentor_id` from `auth.uid()` so a mentor cannot insert a row as someone else, and they reject a storage path that is not `{mentor_id}/{material_id}`.

```bash
bash scripts/apply-selfhost.sh supabase/migrations/20261029120000_lms_schools.sql
```

Never `supabase db push --linked`.

## Browser tab + invite share brand

Each mentor has `org_name`, unique `org_slug`, and optional `avatar_url` (public bucket `lms-avatars`). The in-app tab title is `LMS (org_name)` and the favicon is the mentor photo when set. The stable student gate is `/lms/{org_slug}/` — sign-in only, so a returning student can pick up after logout without a new invite. Brand for that path is `lms_org_brand` (title + avatar only).

The invite a mentor copies is `https://larisid.com/lms/card/?invite=…`. Caddy serves that from the `lms-invite-card` function, which returns HTML with `og:title`, `og:image`, and a favicon for WhatsApp and browser previews, then sends the person to `/lms/{org_slug}/?invite=…`. Brand lookup is `lms_invite_brand` — title, slug, and avatar only, never curriculum. The function is public (`NO_VERIFY_JWT_FUNCTIONS`) because link previews have no login.

LMS auth uses `localStorage` key `lms_auth_v1` with `persistSession` + `autoRefreshToken`, so a refresh on `/lms/` or `/lms/{slug}/` keeps the same session. Invite / school slug helpers use the same storage, not `sessionStorage`.

Google sign-in returns to `https://larisid.com` (not `www`). A mentor login started on `/lms/` comes back to `/lms/` even if another school's slug is still stored. While `?code=` is in the URL the page stays on the sign-in panel until that code becomes a session; it does not fall through to the marketing landing. `www.larisid.com/lms` is sent to the apex host first so the login verifier and the return URL share one site. The client exchanges `?code=` once (`detectSessionInUrl: false`); a second exchange races the first and can show “Login Google terputus” after a successful Google callback. A signed-in Google user with no `lms_accounts` row sees **Buat kelas**, not the curriculum — this schema starts empty (the old disk school is not restored).

## Jadwal

Mentors add sessions (title, WIB date and time, duration, Meet link, notes) on the Jadwal tab. Students see that list above the curriculum. Calendars are not connected with Google or Apple OAuth. One subscribe URL keeps both apps updated:

`https://api.larisid.com/functions/v1/lms-calendar-ics?mentor=<mentor uuid>&token=<calendar_token>`

`webcal://` is the same path for Apple Calendar. The token is `lms_accounts.calendar_token` on the mentor row. `lms_calendar_link` returns the URL to that mentor and their students only. The feed is session title, time, place, and meet link — not curriculum and not student names. One event can also open in Google Calendar via a template link, or download as a single `.ics` file.

```bash
bash scripts/apply-selfhost.sh supabase/migrations/20261029180000_lms_sessions.sql
bash scripts/deploy-function-selfhost.sh lms-calendar-ics
```

`lms-calendar-ics` is listed in `NO_VERIFY_JWT_FUNCTIONS` (same reason as `cohort-calendar-ics`: calendar apps send no login header). Recreate the functions container after that env change so it is actually loaded.

Mentors get a phone-sized **tampilan siswa** under the class photo (Kurikulum / Alat / Progres) plus an Edit kurikulum / Jadwal / Tampilan siswa toggle on the main column. Preview shows only published lessons — the same set a student would see — not the seller homepage.

Caddy must rewrite `/lms/{slug}/` to `/lms/index.html` (except `/lms/card`). Without that rewrite, unknown paths fall through to the seller SPA at `/`.

```bash
bash scripts/apply-selfhost.sh supabase/migrations/20261029140000_lms_mentor_brand.sql
bash scripts/apply-selfhost.sh supabase/migrations/20261029150000_lms_org_slug.sql
bash scripts/deploy-function-selfhost.sh lms-invite-card
bash scripts/deploy-static.sh
```

## Do not bring back

The old class was a JSON file per slug, a browser copy (`lms-school-v1`, `anton-school-v3`), and an invite code that could read uploads (`?k=` on `/obrolan.marketing/api/media/file`). That app, `js/lms-join.js`, and the `anton-school` process are gone. Disk data may still sit on the VPS volume; it is not served. Do not route `/{slug}` or `/s/{slug}` at a school again — school URLs live only under `/lms/{org_slug}/`.
