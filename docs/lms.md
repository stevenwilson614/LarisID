# LMS

Two URLs, one product:

| URL | Role |
| --- | --- |
| [`https://larisid.com/lms/`](https://larisid.com/lms/) | Mentor **landing + signup/login** (Contabo marketing shell in `lms/`) |
| [`https://larisid.com/obrolan.marketing/`](https://larisid.com/obrolan.marketing/) | Mentor **class app** (left-rail UI: Dashboard, Students, Kurikulum, Otomasi, …) |
| [`https://larisid.com/s/{slug}/`](https://larisid.com/s/test-1/) | Student (and mentor school) class app |

After Contabo login/daftar succeeds, mentors are claimed into a disk school (`POST /obrolan.marketing/api/owners/claim`) and opened at `/s/{org_slug}/` in **mentor** chrome (left rail). Students open `/s/{org_slug}/` as students. Do not show the Contabo sidebar “Kelas / Edit kurikulum” shell as the live class UI. Do not dump new mentors into `/s/obrolan.marketing`.

Class app source: `obrolan.marketing/`. Contabo `anton-school` serves `/obrolan.marketing/api/*` and `/api/*` from disk (`docker/volumes/anton-school`).

Editing kurikulum in that app: **Preview** on the publikasi step opens the student view with **Publikasikan** on that screen. Choosing or dropping a video starts the upload immediately, before **Simpan materi**. If that already created the materi, Simpan materi only saves the title and text. Progress shows on the materi card, on the same row as that materi’s cover when a cover is attached. On the publikasi step the same meter sits beside the class cover, not in the full-width strip under the header. The header strip (`Mengunggah N%`, with × to cancel) stays on the other kurikulum steps and on Preview siswa. Left-rail tabs stay locked on Kurikulum until the upload finishes or they cancel with ×. Publish waits until that upload finishes. **Hapus bagian** asks once, then deletes that bagian and every materi in it (video, cover, files, and any in-flight upload), including an empty bagian and the last remaining bagian. A cover sits on the video with no `src` and no controls until the cover is clicked.

```bash
bash scripts/deploy-static.sh
```

`obrolan.marketing/server/server.mjs` is excluded from that rsync. Directory cards include `photoUrl`, and a new student is not assigned Anton’s id on another school. Kurikulum file cap (200 MB), the Google email backfill, and pending-admin permission updates live in that process. Install the file on Contabo `anton-school` separately from the static deploy.

Do not revive `js/lms-join.js` or public invite-code file downloads as the share model.

### Student app notes (current)

- **Paywall off** (`PAYWALL_DISABLED` in `obrolan.marketing/js/app.js`): kurikulum is open; mentor “Pengaturan bayar” stays hidden (`SHOW_PENGATURAN_BAYAR`) until a fuller mentor billing UI exists.
- **WA pill**: mentors toggle number + on/off under Account settings → WhatsApp. Students see `WA (Nama)` bottom-right when enabled.
- Student Home always shows **Jadwal** (Minggu / Bulan). Diskusi dock/tab shows an unread count badge.
- **Student login before the wizard**: on a live school URL, a visitor who is not the school owner signs up or signs in first (Google, email + password, or SMS OTP via `send-whatsapp-otp` / `verify-whatsapp-otp` on `https://api.larisid.com`). Session storage key is `lms_student_auth_v1`. This does not insert `lms_accounts`. `POST /session` with that bearer looks up the disk row by `authUserId`, then verified email or phone, then a cookie row that has no login yet, and only then creates `stu_…`. It sets `lms_student` and does not write a finished application. The wizard runs only when that login has no `applications[id].at`. Each wizard step saves `people[id].wizDraft`, so a refresh is not a blank form. A finished form lands on Home after leave and return. A cookie student with no login sees the gate once; that login attaches to the existing row.
- **Join persistence**: finishing the wizard writes `applications` (with `at`) on that same student row. `POST /join` is only for a student who is not already signed in. Student cookie `lms_student` is Path=/ with Max-Age ~180 days; visitor id is per-school (`anton-visitor:{slug}`). Do not mint a `live-*` person at the class door.
- **Roster wipe guard**: mentor chrome on `/s/{slug}/` must not strip `liveStudents` in `stripHeldRoster`. Staff `PUT /state` also `preserveJoinedRoster` so a stale mentor save cannot erase students who joined after the mentor’s last pull.

### Mentor profile / Perpustakaan / Diskusi / Kurikulum / Otomasi

- Profile picture tab: cover banner can be panned (object-position) after upload.
- Social icons use official brand glyphs (Simple Icons paths).
- Top-left chrome is one circle: the school profile photo when it loads, otherwise initials. `[hidden]` on `.brand img` and `.brand-fallback` is `display: none`. No second initials badge and no seed mark beside that circle.
- **Perpustakaan** is per-school catalog — never falls back to Anton’s lynk/photo for other coaches.
- **Kurikulum** (mentor): landing shows the whole curriculum overview; click a materi to edit that module, or “Atur kurikulum” for the wizard.
- **Otomasi**: left column lists every automation (name, hook, step count); the builder stays open on the right. Archived rows show only while “Lihat arsip” is on. Perpanjangan settings sit under the list. Automation copy is per mentor. Other schools use `{mentor}` and `{org}` (`Halo {name}, ini {mentor} dari {org}.`). Anton’s school keeps his own seed text. Do not copy “MasterMind with Anton GC” or “Anton di sini” onto another coach.
- **Assigned** on a student profile is this mentor plus admins they added (`staffAdmins`, not revoked). It does not list pipeline “Mentor” students or Anton’s seed staff on another school.
- **Grup diskusi** on a student profile lists every chat they are in. A mentor who can edit students can remove them, add them to an existing chat, or create a named group and add them. A month batch they are removed from stays removed (`chats.removed`) so the paid-month default does not put them back.
- **Kurikulum files** (lembar kerja / document upload) cap at 200 MB. Diskusi attachments stay at 20 MB. Covers stay at 5 MB. Video stays at 5 GB. The higher cap is `kurikulum: true` on `/media/init` only.
- **Siswa view** (profile menu) is a phone-sized read-only student app (`?present=1&pane=student&readonly=1`). It skips login and the join wizard, can open Home, Belajar, Alat, and Diskusi, and does not PUT state or send the mentor bearer. Desktop toggle remains.
- **Google signup email** is written to `accountSettings.email` and `ownerContact.email` when those fields are still empty (claim, new school, owner GET/PUT). A saved address is not replaced. The mentor Profile card shows it.
- **Two-factor**: authenticator TOTP via GoTrue (`/auth/v1/factors`) on Account security, and a code step on `/lms/` login only when a verified factor exists and the session is still aal1. If enroll is disabled or there is no mentor session, the control stays hidden and login is not blocked. There is no mock 2FA checkbox.
- **Admin** lives on Account settings, not Profile. Invite link: name, then email + password (`POST /staff/accept`). Permission checkboxes persist on the pending invite. The owner can change the eight switches, revoke, and restore an accepted admin at any time. Revoked admins cannot log in.
- **Diskusi**: chat list with search + red “+ Chat baru”; thread title + anggota; soft post bubble; like is the word Suka (no emoji); nested comments; bottom composer with file / foto / poll + red send. Posted photos stay small and use `object-fit: contain` so they are not cropped. File attachments stay at 20 MB. A comment or post stores `authorPhoto` when the author has a shared photo URL. The school profile photo uploads to class media the same way as the banner. Other viewers get that URL on the public directory card (`photoUrl`). Anton’s photo and name are not the fallback on another school.

---

## Contabo landing + auth (`/lms`)

Marketing landing, Google/email auth, and “Buat kelas” live in `lms/index.html` + `lms/js/*`. Session key: `lms_auth_v1` (not `sb-*-auth-token`).

`/lms/{org_slug}/` stays a Contabo gate for invite/return links (rewritten to `lms/index.html`). Prefer sharing `/s/{slug}/` for the live class once the student is in.

Invite preview card: `/lms/card/?invite=…` → `lms-invite-card`.

Belajar and LarisRise are separate products — do not fold them into this app.

### Postgres schema (auth LMS)

Tables: `lms_accounts`, `lms_invites`, `lms_modules`, `lms_lessons`, `lms_materials`, `lms_sessions`.

```bash
bash scripts/apply-selfhost.sh supabase/migrations/20261029120000_lms_schools.sql
```

Never `supabase db push --linked`.
