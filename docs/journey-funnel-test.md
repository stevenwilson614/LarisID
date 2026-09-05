# Journey funnel — QA (live gpt-app)

Use this before changing Beranda, onboarding, Cari Produk, Deep Dive, or Pantauan nudges. The old arm-A checklist (`nuOnb*`, Discover lobby, `#dd-beginner-panel`) is retired.

## Must pass

1. First login: 4-step finder on Beranda (`#home-finder`). No blocking onboarding popup. Signup modal shows WhatsApp first and larger; Google is below. After a Google sign-in with no `wa_number`, `#wa-capture` may appear and must stay skippable (`Nanti dulu`).
2. After complete: prefs drawer / profile nudge can edit city, category, experience.
3. Finder "Temukan Produk" for a signed-in user with `deepdive_count = 0` auto-opens a Deep Dive on the first listing row. If it does not, `finder_auto_deepdive_skipped` has a reason (`no_listings` / `view_changed` / `anon_seen` / `already_once`).
4. Cari Produk: first **row** click for a dd=0 user opens Deep Dive and logs `dir_first_click_deepdive`.
5. After onboarding, before any Deep Dive: Beranda shows `#home-first-dd` ("Lihat analisis lengkap"). Hidden once they have dived.
6. End of Deep Dive: `#ddr-alert` ("Kabari saya kalau … berubah") with Email and WhatsApp. Copy says ~2 minggu, not harian. Mid-dive Pantauan modal (`#ddtrack-promo`) must not appear.
7. Email / WhatsApp on that card tracks the keyword, sets notify prefs, and writes `user_profiles.wa_number` when a number is entered.
8. First Deep Dive: Pantauan pulse/nudge still appears; tracking a keyword stops it forever for that user.
9. `first_time` sellers with onboarding done see `#home-langkah` (3–4 checkable steps). Checking a step persists. "Buka analisis" opens that keyword's Deep Dive.
10. Return visit: no fabricated price/sales deltas. Omset chips say terukur or perkiraan.
11. Leaders / platform admins are not gated.
12. Mobile: finder, Deep Dive, alert card, and Langkah usable at 390px width.

If a check mentions `laris-app.js`, `larisid_journey_v1`, or `lid_ddtrack_promo_v1` as a live modal, the doc is stale — update this file instead of the code.
