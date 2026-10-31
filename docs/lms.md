# LMS

**Product name:** LMS. **Entry:** [https://larisid.com/lms/](https://larisid.com/lms/).

Formerly referred to in this repo as Anton’s app, Anton’s school, or Obrolan Marketing. Use **LMS** in docs and agent talk. Keep legacy path/service names (`obrolan.marketing/`, Contabo `anton-school`) only when pointing at code or infra.

Cursor home for LMS agent notes: [`.cursor/lms/`](../.cursor/lms/README.md).

Two URLs, one product:

| URL | Role |
| --- | --- |
| [`https://larisid.com/lms/`](https://larisid.com/lms/) | Mentor **landing + signup/login** (Contabo marketing shell in `lms/`) |
| [`https://larisid.com/s/{slug}/`](https://larisid.com/s/test-1/) | **The class.** Every new mentor from `/lms/` lands here in the left-rail UI (Dashboard, Students, Kurikulum, Otomasi, …). Students use the same link. |
| [`https://larisid.com/obrolan.marketing/`](https://larisid.com/obrolan.marketing/) | Legacy hub for the founding tenant slug only. Not the signup destination. |

After Contabo login/daftar succeeds, mentors are claimed into a disk school (`POST /obrolan.marketing/api/owners/claim`) and opened at `/s/{org_slug}/` in **mentor** chrome (left rail). Students open `/s/{org_slug}/` as students. Do not show the Contabo sidebar “Kelas / Edit kurikulum” shell as the live class UI. Do not dump new mentors into `/s/obrolan.marketing`.

Class app source: `obrolan.marketing/`. Contabo `anton-school` serves `/obrolan.marketing/api/*` and `/api/*` from disk (`docker/volumes/anton-school`). Disk is the class source of truth (kurikulum, roster, video bytes). Postgres `lms_*` is auth, org name, and slug.

A logged-out `GET /state/{slug}` is the public card (name, profile photo, headline). Lectures and file keys are not in that payload. A draft (`kurikulum.published === false`) stays off the student payload. The founding tenant (`obrolan.marketing`) stays open for students already on that roster.

The invite code on `/s/{slug}/?invite=` admits a new student. It is not a media password. WhatsApp / social crawlers hitting `/s/{slug}/` get `GET /obrolan.marketing/api/share-card?slug=…` (org `og:title` + photo) via Caddy UA routing — the static SPA title stays `Kelas` for humans until JS loads, then the tab title is `LMS {org}` (for example `LMS Mastermind`) and the tab icon is the LarisID bird (`/images/brand/appicon-bird-48.png`). Homescreen / apple-touch name stays the org, not the `LMS` prefix. New schools get a random code. A school still on a name-derived code gets a random one the next time the owner loads it. Video and files stay on the Contabo volume (`media/{slug}/…`, up to 5 GB). Staff playback uses a short-lived HttpOnly `lms_media` cookie because `<video>` cannot send a bearer token. Students use `lms_student`. `?k=` does not authorize a download. Profile photos stay public: signup `{slug}/profile.*` and Profile-tab uploads `{slug}/photo-school/{hex}` (both served without a media cookie). The PWA manifest is per school (`GET /obrolan.marketing/api/manifest?slug=…`, also inlined as a data-URL in the class HTML head) so Add to Home Screen opens `/s/{slug}/` with that org’s name and photo — never mentor `/lms/` and not Anton’s founding tenant. Students who open the installed app stay on the class; coach re-login to `/lms/` only runs from the mentor hub paths. Kurikulum video does not use a stable file URL: the player calls `GET /media/play-token` and gets a signed URL (about 90 minutes) bound to that file and the current student or staff cookie, then plays it with `GET /media/file` Range requests. A video response requires that token plus the cookie, and sends `Content-Disposition: inline` and `Cache-Control: private, no-store`. The player hides the browser download control and blocks the video right-click menu. Lembar kerja and other non-video files stay downloadable with the cookie only. This does not stop screen recording.

```bash
bash scripts/deploy-static.sh          # class UI and /lms (production)
bash scripts/deploy-school-api.sh      # LMS class API (obrolan.marketing/server/server.mjs)
```

### Staging (`stage.larisid.com`)

Separate static tree and disk so a tab, button, or bad save can be tried without touching live kurikulum or students. Production CI (`deploy-pages.yml` on `main`) does **not** deploy staging.

| | Production | Staging |
| --- | --- | --- |
| URL | `https://larisid.com` | `https://stage.larisid.com` |
| Static | `docker/volumes/www/larisid` | `docker/volumes/www/stage` |
| API container | `anton-school` | `anton-school-stage` |
| Disk | `docker/volumes/anton-school` | `docker/volumes/anton-school-stage` (empty sandbox; do not copy prod `{slug}.json` or media) |

```bash
bash scripts/deploy-static-stage.sh      # UI only
bash scripts/deploy-school-api-stage.sh  # stage API only
```

DNS: Namecheap A record `stage` → `84.247.147.205` (same box as `@` / `www`). Caddy serves that host from the stage volume and proxies `/obrolan.marketing/api/*` to `anton-school-stage`. The class and `/lms/` show a **STAGING** bar only on that hostname. Mentor Google/email redirect stays on `https://stage.larisid.com` (`siteOrigin` in `lms/js/auth.js`); GoTrue allow-list includes `https://stage.larisid.com/**`.

Hotfix: change the UI on a branch, `deploy-static-stage.sh`, check the sandbox school, then `deploy-static.sh`. Adding a left-rail tab is UI-only (`mentorTabs` in `obrolan.marketing/js/app.js`). Kurikulum on disk stays `weeks` + `lectures` + `kurikulum` meta — do not rename those keys.

Rollback UI: re-rsync a known-good `_site` with `deploy-static.sh` (or the stage script). Rollback one school’s JSON: on the volume, copy `state/{slug}.json.bak.1` (newest) … `.bak.5` over `state/{slug}.json`. The next GET reads the file; no API restart. A staff `PUT /state` that sends empty `lectures` / `weeks`, or an empty `kurikulum` object, keeps the disk outline unless `body.reset` is true.



### Analytics (Clarity)

Same Microsoft Clarity project as the main site (`vykppujn5k`). Snippets load on `/lms/` (landing) and `/s/{slug}/` (class UI). Mentor signup landing also loads the shared Google Ads gtag (`AW-862519971`).

In Clarity → Filters → Custom tags:

| Tag | Values | Use |
| --- | --- | --- |
| `lms_surface` | `landing` \| `class` | Mentor door vs live class |
| `lms_role` | `mentor` \| `admin` \| `student` \| `visitor` \| `preview` | Who is using the UI |
| `lms_slug` | school slug | One coach’s class |
| `lms_tab` | e.g. `siswa`, `kurikulum`, `home`, `belajar` | Where they are in the left rail / dock |

Useful events: `lms_landing_view`, `lms_cta_daftar`, `lms_cta_login`, `lms_mentor_enter_class`, `lms_student_login`, `lms_class_view`, `lms_tab`, plus student disk events mirrored as `lms_join` / `lms_lesson_*` (no name / WA / email in Clarity tags). Identify uses hashed `lms:{authUserId}`.

`server.mjs` is not in the static rsync. The API script restarts Contabo `anton-school`. `LMS_SESSION_SECRET` or `ANTON_ADMIN_KEY` must be set on that service so student cookies survive a restart.

Editing kurikulum in that app: **Preview** on the publikasi step opens the student view with **Publikasikan** on that screen. Choosing or dropping a video starts the upload immediately, before **Simpan materi**. If that already created the materi, Simpan materi only saves the title and text. Progress shows on the materi card, on the same row as that materi’s cover when a cover is attached. On the publikasi step the same meter sits beside the class cover, not in the full-width strip under the header. The header strip (`Mengunggah N%`, with × to cancel) stays on the other kurikulum steps and on Preview siswa. Left-rail tabs stay locked on Kurikulum until the upload finishes or they cancel with ×. Publish waits until that upload finishes. **Hapus bagian** asks once, then deletes that bagian and every materi in it (video, cover, files, and any in-flight upload), including an empty bagian and the last remaining bagian. A cover sits on the video with no `src` and no controls until the cover is clicked. Clicking play removes `.has-poster` and the cover button (CSS also hides `.lec-poster-hit` once `.has-poster` is gone — author `display:block` otherwise beats the UA `[hidden]` rule).

```bash
bash scripts/deploy-static.sh
```

`obrolan.marketing/server/server.mjs` is excluded from that rsync. Directory cards include `photoUrl`, and a new student is not assigned the founding owner’s id on another school. Kurikulum file cap (200 MB), the Google email backfill, and pending-admin permission updates live in that process. Install it with `bash scripts/deploy-school-api.sh`.

Do not revive `js/lms-join.js` or public invite-code file downloads as the share model.

### Student app notes (current)

- **Payments:** profile menu → Payment settings. A school stays open until the mentor clicks **Aktifkan pembayaran**. Packages are editable (months + price). One checkout (Lynk, Mayar, or Xendit) creates a QRIS payment. Webhooks are `/obrolan.marketing/api/webhooks/{lynk|mayar|xendit}/{slug}`. Mayar and Xendit invoices use the package price in Laris. Lynk products must match that title and price on lynk.id. Paid access ends at `accessUntil` plus the 1-day grace; the API revokes it. **Beri akses** on a student (tunai / transfer, or tanpa batas) is the manual grant. Cash and transfer do not webhook: the mentor must grant access and log each later payment, or the student is revoked when the package ends. Tanpa batas does not expire. **Cabut akses** locks them again.
- **Onboarding Bayar:** Account settings → Onboarding can add a **Bayar** page (Beli mentoring). Students see it only when pembayaran is on. Adding it while payments are off asks to turn payments on; declining does not keep the page. Turning payments on adds the page if it is missing. After QRIS, the provider returns to `?bayar=ok` and the student opens Belajar once the webhook has granted access. The return URL itself does not grant access.
- **WA pill**: mentors toggle number + on/off under Account settings → WhatsApp. Students see `WA (Nama)` bottom-right when enabled.
- Student Home always shows **Jadwal** (Minggu / Bulan). Diskusi dock/tab shows an unread count badge.
- **Student login before the wizard**: on a live school URL, a visitor who is not the school owner signs up or signs in first (Google, email + password, or SMS OTP via `send-whatsapp-otp` / `verify-whatsapp-otp` on `https://api.larisid.com`). Session storage key is `lms_student_auth_v1`. This does not insert `lms_accounts`. `POST /session` with that bearer looks up the disk row by `authUserId`, then verified email or phone, then a cookie row that has no login yet. A new `stu_…` row is created only when the body `invite` matches that school’s code (the `?invite=` already on the share link). A returning student does not need the code again. It sets `lms_student` and does not write a finished application. The wizard runs only when that login has no `applications[id].at`. Each wizard step saves `people[id].wizDraft`, so a refresh is not a blank form. A finished form lands on Home after leave and return. A cookie student with no login sees the gate once; that login attaches to the existing row.
- **Join persistence**: finishing the wizard always `POST /join` (also when already signed in) so `applications` (with `at`), live roster, and CRM stage land on disk immediately — mentor daftar/pipa must not wait on a later student PUT. `/join` attaches to the cookie/auth row before minting a new `stu_…`. Student cookie `lms_student` is Path=/ with Max-Age ~180 days; visitor id is per-school (`anton-visitor:{slug}`). Do not mint a `live-*` person at the class door. Mentor sync polls every ~2s on Siswa (queues a pull if a PUT is in flight) so new joins appear without a manual refresh.
- **Roster wipe guard**: mentor chrome on `/s/{slug}/` must not strip `liveStudents` in `stripHeldRoster`. Staff `PUT /state` also `preserveJoinedRoster` so a stale mentor save cannot erase students who joined after the mentor’s last pull. `preserveCurriculumOutline` keeps disk `lectures` / `weeks` / `kurikulum` when a staff save sends those empty or missing (unless `body.reset`). A normal save can still edit or remove individual materi; it cannot replace a non-empty outline with nothing.

### Mentor profile / Perpustakaan / Diskusi / Kurikulum / Otomasi

- Profile picture tab: cover banner can be panned (object-position) after upload.
- Social icons use official brand glyphs (Simple Icons paths).
- Top-left chrome is one circle: the school profile photo when it loads, otherwise initials. `[hidden]` on `.brand img` and `.brand-fallback` is `display: none`. No second initials badge and no seed mark beside that circle. Mentors open the profile menu from that circle. Students who tap it open the mentor’s public profile (`viewSchoolPublic`, tab `mentor`) — not their own me page (`btn-me` / tab `profil`).
- **Perpustakaan** is per-school catalog — never falls back to another coach’s lynk/photo. New schools (and existing non-Anton schools on next state load) auto-receive the platform **TikTok Seller Profit Calculator** (`calc`) in `catalog` so mentors can grant it under student SKU checkboxes. Other Anton lynk SKUs stay Anton-only unless the mentor adds their own. Mentors can **Edit** any item (including `calc`): cover, file, recording, list price, strike (`coret`), and **harga mentoring** (`mentorPrice`: `0` = gratis, empty = global tool % discount). Media picks stage in `ui.pustakaPending` until **Simpan** / **Tambah**; **Batal** discards them without uploading. Custom `sku-*` rows can be deleted; platform `calc` cannot.
- **Platform calc**: engine in `obrolan.marketing/js/calc-engine.js`, fee table in `obrolan.marketing/data/tiktok-kategori-fees.json`. Seeded via `SEED.platformCatalog` (client) and `platformCalcSku()` in `obrolan.marketing/server/server.mjs` on claim / state GET·PUT.
- **Kurikulum** (mentor): landing shows the whole curriculum overview; click a materi to edit that module, or “Atur kurikulum” for the wizard.
- **Otomasi**: left column lists every automation (name, hook, step count); the builder stays open on the right. Archived rows show only while “Lihat arsip” is on. Perpanjangan settings sit under the list. Automation copy is per mentor. Other schools use `{mentor}` and `{org}` (`Halo {name}, ini {mentor} dari {org}.`). The founding tenant may keep its own seed text. Do not copy founding-tenant seed phrases onto another coach.
- **Assigned** on a student profile is this mentor plus admins they added (`staffAdmins`, not revoked). It does not list pipeline “Mentor” students or seed staff from another school.
- **Grup diskusi** on a student profile lists every chat they are in. A mentor who can edit students can remove them, add them to an existing chat, or create a named group and add them. A month batch they are removed from stays removed (`chats.removed`) so the paid-month default does not put them back.
- **Kurikulum files** (lembar kerja / document upload) cap at 200 MB. Diskusi attachments stay at 20 MB. Covers stay at 5 MB. Video stays at 5 GB. The higher cap is `kurikulum: true` on `/media/init` only.
- **Siswa view** (profile menu) is a phone-sized read-only student app (`?present=1&pane=student&readonly=1`). It skips login and the join wizard, can open Home, Belajar, Alat, and Diskusi, and does not PUT state or send the mentor bearer. Desktop toggle remains. **Perpustakaan** tiles have a **Student view** button under each alat that opens the same preview deep-linked to that tool (`&sku={id}`).
- **Google signup email** is written to `accountSettings.email` and `ownerContact.email` when those fields are still empty (claim, new school, owner GET/PUT). A saved address is not replaced. The mentor Profile card shows it.
- **Two-factor**: authenticator TOTP via GoTrue on Account security, and a code step on `/lms/` login only when a **verified** factor exists and the session is still aal1. Enroll is not done until **Confirm & turn on** succeeds (unverified factors do not gate login). Stale `refreshMfa` must not clobber an in-progress enroll UI. List factors from `GET /auth/v1/user` (`user.factors`) — current GoTrue returns **405** on `GET /factors` (enroll stays `POST /factors`). Enroll QR is a crisp PNG from `totp.uri` (`js/vendor/qrcode.min.js`) so iPhone Camera / Authenticator can scan it; GoTrue’s SVG `qr_code` is fallback only. Issuer is `Laris LMS` (not a URL). Cancel deletes the unverified factor. Mentors who open `/s/{slug}/` with a verified factor at aal1 are sent back to `/lms/?login=1` for the code step. If enroll is disabled or there is no mentor session, the control stays hidden and login is not blocked. There is no mock 2FA checkbox.
- **Admin** lives on Account settings, not Profile. Invite link (`/s/{slug}/?staff_invite=…`): name, then email + password (`POST /staff/accept`). After accept they get **mentor chrome** on the same `/s/{slug}/` URL (`role=asisten`), limited by the eight permission switches — not the student app. Cookie `lms_staff` restores that session via `/staff/me` on reload. `editStudents` off means view-only student profiles (`canEditPerson` / `staffCan`); the server also blocks roster writes via `guardStaffWrite`. The owner can change switches, revoke, and restore anytime. Revoked admins cannot log in.
- **Platform Admin** (left-rail **Admin** tab): only for allow-listed mentor emails (`LMS_PLATFORM_ADMIN_EMAILS`, default `stevenwilson614@gmail.com`). After Contabo login into their class, that account sees mentor count and students per mentor (`GET /platform/me`, `GET /platform/summary`). Click a mentor name for a detail view (`GET /platform/mentor?slug=…`): profile, student roster, payment ledger, and media stats (video/doc counts + total bytes under `media/{slug}/`). Student counts come from disk `liveStudents` (+ finished `applications`), not Postgres. Other mentors never see the tab.
- **Diskusi**: chat list with search + red “+ Chat baru”; thread title + anggota; soft post bubble; like is the word Suka (no emoji); comments are flat (avatar, name, `20h`/`1d`) with replies indented one level under the parent. The chevron or Balas opens an inline reply composer; the comment field at the bottom is only for a new top-level comment. Post composer still has file / foto / poll + red send. Posted photos stay small and use `object-fit: contain` so they are not cropped. File attachments stay at 20 MB. A comment or post stores `authorPhoto` when the author has a shared photo URL. The school profile photo uploads to class media the same way as the banner. Other viewers get that URL on the public directory card (`photoUrl`). Another coach’s photo and name are not the fallback on a different school.

---

## Contabo landing + auth (`/lms`)

Marketing landing, Google/email auth, and “Buat kelas” live in `lms/index.html` + `lms/js/*`. Session key: `lms_auth_v1` (not `sb-*-auth-token`).

`/lms/{org_slug}/` stays a Contabo gate for invite/return links (rewritten to `lms/index.html`). Prefer sharing `/s/{slug}/` for the live class once the student is in.

Invite preview card: `/lms/card/?invite=…` → `lms-invite-card`.

Belajar and LarisRise are separate products — do not fold them into LMS.

### Postgres schema (auth LMS)

Tables: `lms_accounts`, `lms_invites`, `lms_modules`, `lms_lessons`, `lms_materials`, `lms_sessions`.

```bash
bash scripts/apply-selfhost.sh supabase/migrations/20261029120000_lms_schools.sql
```

Never `supabase db push --linked`.
