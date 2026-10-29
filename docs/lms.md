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

Tables: `lms_accounts`, `lms_invites`, `lms_modules`, `lms_lessons`, `lms_materials`.

Writes that create a role go through `lms_register_mentor`, `lms_create_invite`, and `lms_accept_invite`. Triggers stamp `mentor_id` from `auth.uid()` so a mentor cannot insert a row as someone else, and they reject a storage path that is not `{mentor_id}/{material_id}`.

```bash
bash scripts/apply-selfhost.sh supabase/migrations/20261029120000_lms_schools.sql
```

Never `supabase db push --linked`.

## Browser tab + invite share brand

Each mentor has `org_name`, unique `org_slug`, and optional `avatar_url` (public bucket `lms-avatars`). The in-app tab title is `LMS (org_name)` and the favicon is the mentor photo when set. The stable student gate is `/lms/{org_slug}/` — sign-in only, so a returning student can pick up after logout without a new invite. Brand for that path is `lms_org_brand` (title + avatar only).

The invite a mentor copies is `https://larisid.com/lms/card/?invite=…`. Caddy serves that from the `lms-invite-card` function, which returns HTML with `og:title`, `og:image`, and a favicon for WhatsApp and browser previews, then sends the person to `/lms/{org_slug}/?invite=…`. Brand lookup is `lms_invite_brand` — title, slug, and avatar only, never curriculum. The function is public (`NO_VERIFY_JWT_FUNCTIONS`) because link previews have no login.

LMS auth uses `localStorage` key `lms_auth_v1` with `persistSession` + `autoRefreshToken`, so a refresh on `/lms/` or `/lms/{slug}/` keeps the same session. Invite / school slug helpers use the same storage, not `sessionStorage`.

Mentors get a phone-sized **tampilan siswa** under the class photo (Kurikulum / Alat / Progres) plus an Edit ↔ Tampilan siswa toggle on the main column. Preview shows only published lessons — the same set a student would see — not the seller homepage.

Caddy must rewrite `/lms/{slug}/` to `/lms/index.html` (except `/lms/card`). Without that rewrite, unknown paths fall through to the seller SPA at `/`.

```bash
bash scripts/apply-selfhost.sh supabase/migrations/20261029140000_lms_mentor_brand.sql
bash scripts/apply-selfhost.sh supabase/migrations/20261029150000_lms_org_slug.sql
bash scripts/deploy-function-selfhost.sh lms-invite-card
bash scripts/deploy-static.sh
```

## Do not bring back

The old class was a JSON file per slug, a browser copy (`lms-school-v1`, `anton-school-v3`), and an invite code that could read uploads (`?k=` on `/obrolan.marketing/api/media/file`). That app, `js/lms-join.js`, and the `anton-school` process are gone. Disk data may still sit on the VPS volume; it is not served. Do not route `/{slug}` or `/s/{slug}` at a school again — school URLs live only under `/lms/{org_slug}/`.
