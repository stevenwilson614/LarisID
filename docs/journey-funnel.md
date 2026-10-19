# User journey funnel (live gpt-app)

**Status:** live on `main` via `index.html` + `js/gpt-app.js`. `js/laris-app.js` is retired and not loaded.

Read **[MISSION.md](../MISSION.md)** first. Do not reintroduce a blocking onboarding popup. Do not fabricate price/sales deltas. Deep Dive next-week points come from `listing_weekly` and must stay labelled perkiraan — see [listing-weekly.md](./listing-weekly.md).

**QA checklist:** [journey-funnel-test.md](./journey-funnel-test.md)

**Laris AI replies:** [ask-laris.md](./ask-laris.md) — lookup / weekly / filter / refer / promo / judgment. Do not send every typed prompt through visible thinking.

**Retention re-read:** [RETENTION.sql](./RETENTION.sql). Signup-day activity vs later return: [ACTIVITY_RETURN_CORR.sql](./ACTIVITY_RETURN_CORR.sql).

---

## Live flow

**First visit → sift doors (`#view-sift`) → Seller baru (Beranda finder) or Sudah punya toko (My Toko wizard) → Cari Produk / Laris AI → Deep Dive → end-of-dive alert card → Favorit Aku pulse / scrape digest / Langkah minggu ini / Komunitas strip**

First visit is a full-page choice, not a popup: **Seller baru** opens the Beranda finder (city → category → budget; experience comes from the door). **Sudah punya toko** is the My Toko wizard (paste shop URL → kabar → kompetitor → analisis) in `js/gpt-alat-preview.js`. Returning visitors skip the doors and land on normal Beranda; My Toko stays in the sidebar. **Login alone does not skip the doors** — a fresh signup with no door choice still sees `#view-sift` (alat hides `#finder-xp-step`, so that question has nowhere else to go). After a door is chosen, a reload or signup returns to that door (Seller baru finder, or My Toko if the shop wizard is unfinished), not Beranda. Profile nudge, Merdeka, and feature notices stay off while a door is in progress. A finished visitor skips the doors: wizard done, `user_onboarding_prefs.completed_at`, or a saved `user_store_profiles` row on another device. Platform admins are not gated. `?preview=off` hides the doors. `?sift=1` (or `?onboarding=1`) clears the door choice and forces `#view-sift` again. It is **not** a modal overlay. Shop paste needs the Mac `shop_claim_worker.py` — see [alat-shop-scrape.md](./alat-shop-scrape.md).

| Area | Where | Notes |
|------|--------|--------|
| Onboarding | `#view-sift` + `js/gpt-alat-preview.js` | First visit: Seller baru → Beranda finder; Sudah punya toko → 4-step My Toko. Returning: normal Beranda. Events `alat_*` also go to Clarity. |
| Beranda finder | `state.onboarding` in `js/gpt-app.js` | Seller-baru questionnaire: city → category → experience → `done`; persisted with chat state |
| WhatsApp on signup | `#auth-wa-panel` | Primary path on `#auth-overlay.auth-is-signup`. Google is secondary. |
| WA name capture | `#name-capture` | Required after WhatsApp signup/login if there is no real name. Not skippable. Not onboarding (city/category stay in-page). Also shown on session restore until a name is saved. |
| Google WA capture | `#wa-capture` | Skippable prompt after Google sign-in if `user_profiles.wa_number` is empty. Not onboarding; not shown on session restore. |
| Beranda finder | `#home-finder` | first-run 4-step, not a popup |
| Prefs | `#prefs-drawer` | city / category / experience after first run |
| Deep Dive count | `user_journey_stats.deepdive_count` | written from gpt-app |
| Session-one Deep Dive | `runFinderSearch` auto-open of the first listing row while `deepdive_count === 0`; Cari Produk first row click (`dir_first_click_deepdive`); `#home-first-dd` card | skip reasons logged as `finder_auto_deepdive_skipped`. Landing-finder signup **awaits** `resumeFinderAfterSignin` and must not `renderHome()` over the result thread. Auto-DD still opens if boot briefly showed Beranda (`view === 'home'`) while the listing block is on screen. `runFinderSearch` writes `user_onboarding_prefs.completed_at`. |
| End-of-dive alert | `#ddr-alert` | email / WhatsApp one-tap → product favorite + `set_tracker_notify_prefs`. Mid-dive `ddtp*` promo is retired. |
| Favorit Aku nav pulse | `lid_pantau_nudge_v1`, `schedulePantauNavPulse` | first Deep Dive pulse; stops once the user has ≥ 1 favorite |
| Pasar → produk notice | `#product-rows-notice`, `lid_product_rows_notice_v1` | one-time dismissible for returning (not new) signed-in users; not onboarding |
| Export XLSX notice | `#export-xlsx-notice`, `lid_export_xlsx_notice_v1` | one-time dismissible for returning users when product .xlsx/CSV download shipped; not onboarding |
| Download-gift bell | `#notif-bell`, `user_notices.kind=export_grant` | people with a 1000-row `user_export_grants` bank; click → Cari Produk. Bell lists the last 20 `user_notices` (unread highlighted). Opening marks `read_at`; it does not hide older rows. |
| Scrape-cycle digest | `scrape-digest` edge function | every Deep Dive user, one email per measured scrape landing; WA only if opted in |
| Langkah minggu ini | `#home-langkah` + `user_weekly_steps` | first_time sellers on Beranda after onboarding |
| Komunitas | `#btn-community` main nav, `#home-komunitas`, Deep Dive / Cari Produk “Tanya seller lain” | Peer Diskusi + Usulan Fitur. Not under Tentang. Hidden Beranda strip when empty. Keyword-grain prefill only — no price/omset in the post. See [komunitas-board.md](./komunitas-board.md). |
| Edukasi | `#btn-edukasi` (hidden), `#view-edukasi` | Folded into Belajar. `setView('edukasi')` and `#sfb-edu-link` open `#view-belajar`. The auto `#edu-interest-capture` popup does not open. Old `education_interests` rows stay. Visitor counts still include historical `edu_page_view`. |
| Belajar | `#btn-belajar`, `#view-belajar`, `#home-belajar` | Free public course in `js/gpt-belajar.js` (book icon, label Belajar). Logged-out visitors see the four-step home; Mulai and the mentor banner sign them in, then resume. Mentor yes writes `education_interests`. Signed-in opens log `belajar_page_view` (once per session, not for a platform admin). **Mulai** sets `user_course_state.mulai_at`; each lesson open updates `last_slug` / `furthest_slug`. Admin → Belajar shows where they stopped. Store owners use track `existing`. See [belajar-course.md](./belajar-course.md). |
| Mentor rail | `body.mentor-shell` | Dashboard / Siswa / Jadwal. **Alat seller** accordion (`#btn-side-seller`) opens Cari Produk, Laris AI, Favorit Aku, Kalkulator. Real mentors get this shell; platform admins stay on the seller rail unless **Mode mentor**. |
| Kalkulator | `#btn-kalkulator-alat`, `#view-kalkulator` | Full-page profit calc (same strip as Deep Dive). Product typeahead prefills harga; Unduh PDF + Simpan ke Riwayat · Kalk. Events: `gpt_kalc_page_open`, `gpt_kalc_pdf`, `gpt_kalc_save_riwayat`. Admin usage row via `admin_dashboard_kpis` kalc_*. |

Arm-A names (`nuOnb*`, `dsc*`, `userJourneyTier` 0–3, `larisid_journey_v1`, `#dd-beginner-panel`) do **not** exist in `gpt-app.js`. Do not “fix” them.

Leaders and platform admins bypass journey gating. Do not fabricate “what changed” numbers. Favorit Aku is daily PDP scrape (bucket sold = perkiraan). Toko data still ~2 minggu. See [favorit-aku.md](./favorit-aku.md).
