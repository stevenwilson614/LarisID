# User journey funnel (live gpt-app)

**Status:** live on `main` via `index.html` + `js/gpt-app.js`. `js/laris-app.js` is retired and not loaded.

Read **[MISSION.md](../MISSION.md)** first. Do not reintroduce a blocking onboarding popup. Do not fabricate price/sales deltas. Deep Dive next-week points come from `listing_weekly` and must stay labelled perkiraan — see [listing-weekly.md](./listing-weekly.md).

**QA checklist:** [journey-funnel-test.md](./journey-funnel-test.md)

---

## Live flow

**Login → Beranda (`#home-finder`) → Cari Produk / Ask Laris → Deep Dive → Pantauan nudge**

Onboarding is in-page on Beranda (`state.onboarding`: city → category → experience → notes), plus `#prefs-drawer` and a profile nudge. It is **not** a modal overlay.

| Area | Where | Notes |
|------|--------|--------|
| Onboarding | `state.onboarding` in `js/gpt-app.js` | steps `idle` → city/category/experience → `done`; persisted with chat state |
| Beranda finder | `#home-finder` | first-run 3-step, not a popup |
| Prefs | `#prefs-drawer` | city / category / experience after first run |
| Deep Dive count | `user_journey_stats.deepdive_count` | written from gpt-app (was arm-A only) |
| Pantauan return loop | `lid_pantau_nudge_v1`, `schedulePantauNavPulse` | first Deep Dive pulse; WA preferred if profile has a number |
| Deep Dive promo | `lid_ddtrack_promo_v1` | one-shot; retires when the user tracks anything |

Arm-A names (`nuOnb*`, `dsc*`, `userJourneyTier` 0–3, `larisid_journey_v1`, `#dd-beginner-panel`) do **not** exist in `gpt-app.js`. Do not “fix” them.

Leaders and platform admins bypass journey gating. Do not fabricate “what changed” numbers.
