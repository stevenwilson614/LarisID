# Journey funnel — QA (live gpt-app)

Use this before changing Beranda, onboarding, Cari Produk, Deep Dive, or Favorit Aku nudges. The old arm-A checklist (`nuOnb*`, Discover lobby, `#dd-beginner-panel`) is retired.

## Must pass

1. First login: 4-step finder on Beranda (`#home-finder`). No blocking onboarding popup. Signup modal shows WhatsApp first and larger; Google is below. After a Google sign-in with no `wa_number`, `#wa-capture` may appear and must stay skippable (`Nanti dulu`).
2. After complete: prefs drawer / profile nudge can edit city, category, experience.
3. Finder "Temukan Produk" for a signed-in user with `deepdive_count = 0` auto-opens a Deep Dive on the first listing row. If it does not, `finder_auto_deepdive_skipped` has a reason (`no_listings` / `view_changed` / `anon_seen` / `already_once`).
4. Cari Produk: first **row** click for a dd=0 user opens Deep Dive and logs `dir_first_click_deepdive`.
5. After onboarding, before any Deep Dive: Beranda shows `#home-first-dd` ("Lihat analisis lengkap"). Hidden once they have dived.
6. End of Deep Dive: `#ddr-alert` ("Simpan ke Favorit & kabari …") with Email (and WhatsApp if Fonnte is connected). Mid-dive Pantauan modal (`#ddtrack-promo`) must not appear. No 4-step wizard.
7. Email / WhatsApp on that card favorites the **listing**, sets notify prefs, and writes `user_profiles.wa_number` when a number is entered.
8. First Deep Dive: Favorit Aku pulse/nudge still appears; saving a favorite stops it forever for that user. Nav label is Favorit Aku. Bookmark on Cari Produk / Deep Dive header is one click (toggle off removes).
8b. Favorit Aku page: list shows photo / harga / omset / one % / a dated 3-month omset+unit chart (not a spark, no click-to-detail); optional plain-text “updates this week” lines (title / harga / omset ≥25% WoW); counter `n / 30`; Tambah typeahead saves on click; notify strip is Email / WhatsApp + cadence (Setiap ada perubahan / Sekali seminggu) with an honest WA status line; per-row Pantau toko + Deep Dive + Hapus; no 4-step wizard. Empty state is one line + Tambah + link to Cari Produk. New favorite without history says “Data harian mulai besok”.
9. `first_time` sellers with onboarding done see `#home-langkah` (3–4 checkable steps). Checking a step persists. "Buka analisis" opens that keyword's Deep Dive.
10. Return visit: no fabricated price/sales deltas. Omset chips say terukur or perkiraan. Existing users who have not dismissed it may see one-time `#product-rows-notice` (pasar → produk); new signups must not. Dismiss persists via `lid_product_rows_notice_v1`.
11. Leaders / platform admins are not gated.
12. Mobile: finder, Deep Dive, alert card, and Langkah usable at 390px width.
13. Laris AI (logged in): `Crocs` → listing rows + short Indonesian overview, no “Proses berpikir”. Typed and chip “Apa yang terlaris minggu ini?” → reviewing steps then ~10 rows. Follow-up “ada yang dari Bandung?” → subset of those rows. “untuk affiliate…” → short Kalodata/TikTok REFER, no rows. Judgment question still shows thinking. “Lanjutkan jawaban” continues, does not filter. Profit chip still opens the calculator.
14. Cari Produk Trending Sekarang (`#dir-trending-now` and chat `.trend-host`): place trophy/medal on the far left, then mascot; title above harga; omset and % columns align across ranks; weekly % + bolt (max 60°, light green under-fill); no “perkiraan” on the strip (held/stale 3-scrape % stays on the table only). Row click still opens Deep Dive.

If a check mentions `laris-app.js`, `larisid_journey_v1`, or `lid_ddtrack_promo_v1` as a live modal, the doc is stale — update this file instead of the code.
