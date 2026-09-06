# User journey funnel (live gpt-app)

**Status:** live on `main` via `index.html` + `js/gpt-app.js`. `js/laris-app.js` is retired and not loaded.

Read **[MISSION.md](../MISSION.md)** first. Do not reintroduce a blocking onboarding popup. Do not fabricate price/sales deltas. Deep Dive next-week points come from `listing_weekly` and must stay labelled perkiraan — see [listing-weekly.md](./listing-weekly.md).

**QA checklist:** [journey-funnel-test.md](./journey-funnel-test.md)

**Laris AI replies:** [ask-laris.md](./ask-laris.md) — lookup / weekly / filter / refer / judgment. Do not send every typed prompt through visible thinking.

**Retention re-read:** [RETENTION.sql](./RETENTION.sql)

---

## Live flow

**Login → Beranda (`#home-finder`) → Cari Produk / Laris AI → Deep Dive → end-of-dive alert card → Favorit Aku pulse / scrape digest / Langkah minggu ini**

Onboarding is in-page on Beranda (`state.onboarding`: city → category → experience → notes), plus `#prefs-drawer` and a profile nudge. It is **not** a modal overlay.

| Area | Where | Notes |
|------|--------|--------|
| Onboarding | `state.onboarding` in `js/gpt-app.js` | steps `idle` → city/category/experience → `done`; persisted with chat state |
| WhatsApp on signup | `#auth-wa-panel` | Primary path on `#auth-overlay.auth-is-signup`. Google is secondary. |
| Google WA capture | `#wa-capture` | Skippable prompt after Google sign-in if `user_profiles.wa_number` is empty. Not onboarding; not shown on session restore. |
| Beranda finder | `#home-finder` | first-run 4-step, not a popup |
| Prefs | `#prefs-drawer` | city / category / experience after first run |
| Deep Dive count | `user_journey_stats.deepdive_count` | written from gpt-app |
| Session-one Deep Dive | `runFinderSearch` auto-open of the first listing row while `deepdive_count === 0`; Cari Produk first row click (`dir_first_click_deepdive`); `#home-first-dd` card | skip reasons logged as `finder_auto_deepdive_skipped` |
| End-of-dive alert | `#ddr-alert` | email / WhatsApp one-tap → product favorite + `set_tracker_notify_prefs`. Mid-dive `ddtp*` promo is retired. |
| Favorit Aku nav pulse | `lid_pantau_nudge_v1`, `schedulePantauNavPulse` | first Deep Dive pulse; stops once the user has ≥ 1 favorite |
| Pasar → produk notice | `#product-rows-notice`, `lid_product_rows_notice_v1` | one-time dismissible for returning (not new) signed-in users; not onboarding |
| Scrape-cycle digest | `scrape-digest` edge function | every Deep Dive user, one email per measured scrape landing; WA only if opted in |
| Langkah minggu ini | `#home-langkah` + `user_weekly_steps` | first_time sellers on Beranda after onboarding |

Arm-A names (`nuOnb*`, `dsc*`, `userJourneyTier` 0–3, `larisid_journey_v1`, `#dd-beginner-panel`) do **not** exist in `gpt-app.js`. Do not “fix” them.

Leaders and platform admins bypass journey gating. Do not fabricate “what changed” numbers. Favorit Aku is daily PDP scrape (bucket sold = perkiraan). Toko data still ~2 minggu. See [favorit-aku.md](./favorit-aku.md).
