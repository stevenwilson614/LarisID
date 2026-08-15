# Journey funnel — manual QA checklist

Architecture and function reference: **[journey-funnel.md](./journey-funnel.md)**.

Use this before merging changes to onboarding, Discover defaults, journey tiers, or return loops.

## Onboarding (first login)

- [ ] New user lands on **Discover** (not dashboard), in-page 3-step onboarding visible
- [ ] Step 1: cannot continue with fewer than 3 categories
- [ ] Step 2: price range saves correctly
- [ ] Step 3: seller status (sudah jual / baru mulai) saves
- [ ] After finish: filtered Discover results; no popup overlay
- [ ] Return visit: goes to dashboard with normal Discover (no onboarding)

## Discover defaults

- [ ] Price filter defaults **Rp 15.000 – 150.000**
- [ ] Min score defaults **45**
- [ ] Sort defaults **Acak** (random order stable within session)
- [ ] Reset filters restores the above defaults

## Journey tiers (independent user, not admin/leader)

| Tier | Trigger | Expected |
|------|---------|----------|
| 0 | No deep dive yet | 6 cards, no filter panel, starter highlight, simple Deep Dive |
| 1 | ≥1 deep dive | Filter button visible, track hint after deep dive |
| 2 | ≥1 tracked product | Full dashboard stats, nav unlocks |
| 3 | ≥3 deep dives | Full Discover + Deep Dive |

- [ ] Admin / leader bypass all gating (`journeyBypassGating`)

## Deep Dive beginner mode

- [ ] Verdict panel + 3 bullets on Ringkasan
- [ ] Charts hidden until “Analisis lengkap”
- [ ] Track button hidden at tier 0

## Beranda lobby (tier 0–1, no tracked products)

- [ ] Stats / trending / alerts hidden
- [ ] Daily reco grid visible (5–6 products)
- [ ] One contextual hint per session max

## Return loop (Phase 3)

- [ ] After ≥1 deep dive, next-day Beranda shows delta strip (price/sold change or “N produk baru hari ini”)
- [ ] Discover subtitle includes **Diperbarui hari ini** for returning users (tier ≥1)
- [ ] Strip is honest — no fabricated deltas; stable products show no fake “up”

## Events (browser console / `user_events`)

- [ ] `onboarding_complete`
- [ ] `discover_view` (with `journey_tier`)
- [ ] `discover_card_click`
- [ ] `deepdive_open`
- [ ] `journey_return_strip` (returning users)

## Regression

- [ ] Cohort / leader dashboards unchanged
- [ ] Tracker, alerts, AI views work for tier 2+
- [ ] Extension link modal still works

## Migrations

```bash
bash scripts/apply-selfhost.sh supabase/migrations/<file>.sql
```

- [ ] `user_onboarding_prefs.seller_status`
- [ ] `user_journey_stats` table + RLS
