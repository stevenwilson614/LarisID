# LMS

Two URLs, one product:

| URL | Role |
| --- | --- |
| [`https://larisid.com/lms/`](https://larisid.com/lms/) | Mentor **landing + signup/login** (Contabo marketing shell in `lms/`) |
| [`https://larisid.com/obrolan.marketing/`](https://larisid.com/obrolan.marketing/) | Mentor **class app** (left-rail UI: Dashboard, Students, Kurikulum, Otomasi, …) |
| [`https://larisid.com/s/{slug}/`](https://larisid.com/s/test-1/) | Student (and mentor school) class app |

After Contabo login/daftar succeeds, mentors are claimed into a disk school (`POST /obrolan.marketing/api/owners/claim`) and opened at `/s/{org_slug}/` in **mentor** chrome (left rail). Students open `/s/{org_slug}/` as students. Do not show the Contabo sidebar “Kelas / Edit kurikulum” shell as the live class UI. Do not dump new mentors into `/s/obrolan.marketing`.

Class app source: `obrolan.marketing/`. Contabo `anton-school` serves `/obrolan.marketing/api/*` and `/api/*` from disk (`docker/volumes/anton-school`).

Editing kurikulum in that app: **Preview** on the publikasi step opens the student view with **Publikasikan** on that screen. A video file uploads in the background with a sticky progress strip under the header (`Mengunggah N%`, with × to cancel) that stays while the mentor fills cover, deskripsi, poin penting, or opens Publikasikan / Preview. Left-rail tabs stay locked on Kurikulum until the upload finishes or they cancel with ×. Publish waits until that upload finishes.

```bash
bash scripts/deploy-static.sh
```

Do not revive `js/lms-join.js` or public invite-code file downloads as the share model.

### Student app notes (current)

- **Paywall off** (`PAYWALL_DISABLED` in `obrolan.marketing/js/app.js`): kurikulum is open; mentor “Pengaturan bayar” stays hidden (`SHOW_PENGATURAN_BAYAR`) until a fuller mentor billing UI exists.
- **WA pill**: mentors toggle number + on/off under Account settings → WhatsApp. Students see `WA (Nama)` bottom-right when enabled.
- Student Home always shows **Jadwal** (Minggu / Bulan). Diskusi dock/tab shows an unread count badge.
- **Join persistence**: `POST /join` writes `liveStudents` + `applications` + `crm` + `billing` on disk so mentors see the student in Pipa/daftar immediately, and the student does not re-enter the onboarding wizard after leaving the URL. Student cookie `lms_student` is Path=/ with Max-Age ~180 days; visitor id is per-school (`anton-visitor:{slug}`).
- **Roster wipe guard**: mentor chrome on `/s/{slug}/` must not strip `liveStudents` in `stripHeldRoster`. Staff `PUT /state` also `preserveJoinedRoster` so a stale mentor save cannot erase students who joined after the mentor’s last pull.

### Mentor profile / Perpustakaan / Diskusi / Kurikulum / Otomasi

- Profile picture tab: cover banner can be panned (object-position) after upload.
- Social icons use official brand glyphs (Simple Icons paths).
- Top-left chrome is a single avatar circle (no caret badge).
- **Perpustakaan** is per-school catalog — never falls back to Anton’s lynk/photo for other coaches.
- **Kurikulum** (mentor): landing shows the whole curriculum overview; click a materi to edit that module, or “Atur kurikulum” for the wizard.
- **Otomasi**: compact builder (~half previous card size).
- **Diskusi**: chat list with search + red “+ Chat baru”; thread title + anggota; soft post bubble with reactions; nested comments; bottom composer with file / foto / poll + red send.

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
