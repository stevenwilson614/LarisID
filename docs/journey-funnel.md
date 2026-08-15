# User journey funnel (onboarding + progressive disclosure)

**Status:** shipped on branch `feat/journey-funnel` (merge to `main` when ready).

This doc is for engineers and AI agents changing the **logged-in dashboard** (`index.html` SPA). Read **[MISSION.md](../MISSION.md)** first — copy must stay honest; we hide complexity for beginners, we do not remove features or fabricate metrics. Deep Dive next-week points come from `listing_weekly` and must stay labelled perkiraan — see [listing-weekly.md](./listing-weekly.md).

**QA checklist:** [journey-funnel-test.md](./journey-funnel-test.md)

---

## Problem we solve

New sellers were overwhelmed by the full dashboard (filters, charts, tracker, alerts) before they understood one product. The funnel guides:

**Login → Discover (onboarding) → Deep Dive → Track → full dashboard**

Return visits get lightweight “what changed” loops without dark patterns.

---

## Where the code lives

Everything is in **`index.html`** (monolithic SPA). There is no separate React/Astro app for the dashboard.

| Area | HTML / IDs | JS (search in `index.html`) |
|------|------------|------------------------------|
| In-page onboarding | `#dsc-onb-screen`, `#nu-onb-body` | `nuOnb*` (~line 27700+) |
| Discover view | `#dash-view-discover`, `.dsc-layout` | `dsc*` (~line 16400+) |
| Deep Dive beginner panel | `#dd-beginner-panel`, `#dd-tab-ringkasan` | `ddRenderBeginnerVerdict`, `journeyApplyDeepDiveChrome` |
| Beranda lobby / return strip | `#hbd-nu-reco`, `#hbd-alerts-strip` | `nuRefreshView`, `hbdInit`, `journeyRenderReturnStrip` |
| Nav gating | `#dash-nav-journey-more`, `body.journey-beginner` | `journeyApplyNavGating` |
| Journey state | — | `JOURNEY_*`, `journeyLoad` / `journeySave` (~line 26620+) |

**Static preview (optional, untracked):** `.preview-onboarding.html` — UI mock only, not wired to auth.

---

## First-login onboarding (in-page, not a popup)

**Removed:** `#nu-onb-overlay` modal popup.

**Added:** 3-step flow inside Discover (`#dsc-onb-screen`):

1. Pick **≥3 categories** (`NU_ONB_MIN_CATS`)
2. **Price range** (budget presets → Discover filters)
3. **Seller status** — `first_time` vs `existing` (saved to Supabase)

**Routing:**

- `openProfile()` / post-auth: if `nuOnbCheckNeeded()` → `switchDashView('discover')` + `nuOnbShowInPage(true)`
- Return users with prefs saved → normal dashboard; onboarding hidden

**Persistence:** `user_onboarding_prefs` (+ `seller_status` column). See migration `20260611160000_onboarding_seller_status.sql`.

Key functions: `nuOnbCheckNeeded`, `nuOnbFinish`, `nuOnbPersist`, `nuOnbApplyToDiscover`, `nuOnbDecorateFirst` (highlights first card after payoff).

---

## Discover defaults

Constants near `DSC_DEFAULT_*`:

| Setting | Default |
|---------|---------|
| Price min | Rp 15.000 (`DSC_DEFAULT_PRICE_MIN`) |
| Price max | Rp 150.000 (`DSC_DEFAULT_PRICE_MAX`) |
| Min score | 45 (`DSC_DEFAULT_MIN_SCOR`) |
| Sort | **Acak** (`random` — `_dscShuffleInPlace`) |

`dscResetFilters()` must keep these defaults in sync with HTML slider initial values.

---

## Journey tiers

Tier is computed client-side in `userJourneyTier()` (also synced to `user_journey_stats`).

| Tier | Condition | UX |
|------|-----------|-----|
| **0** | No Deep Dive yet | 6 Discover cards on empty browse (`JOURNEY_BEGINNER_DISCOVER_CAP`); **committed search lifts the cap to 30–60** pasar cards. No filter panel, starter card highlight, simplified Deep Dive (no track btn) |
| **1** | ≥1 Deep Dive | Filter btn visible, track hint, return loops |
| **2** | ≥1 tracked product (`trkLoad`) | Full Beranda stats, nav unlocks |
| **3** | ≥3 Deep Dives **or** admin/leader | Full Discover + Deep Dive |

**Bypass:** `journeyBypassGating()` — platform admin (`isPlatformAdmin`) or cohort leader (`_effectiveLeaderMode`). Never gate mentors/leaders.

**Local state:** `localStorage` key `larisid_journey_v1` (`JOURNEY_LS_KEY`):

- `deepdiveCount`, `firstDeepDiveAt`, `lastDiscoverAt`, `fullDeepDive`
- `seenProducts` — snapshots for return-loop deltas
- `lastBerandaAt` — calendar-day return detection

**Remote:** `user_journey_stats` table (migration `20260611170000_user_journey_stats.sql`). Hydrated via `journeyHydrateFromRemote()` on login; upserted via `journeySyncRemote()`.

---

## Progressive UI by surface

### Discover

- `journeyApplyDiscoverChrome()` — CSS classes `dsc-journey-beginner`, `dsc-journey-tier1`; subtitle copy
- `dscRenderTable()` — caps list at 6 for tier-0 **browse only**; committed search uses 30–60 pasar/type cards
- `dscHighlightStarterCard()` / `dscOpenStarterDeepDive()` — “Mulai di sini” CTA

### Deep Dive

- `journeyApplyDeepDiveChrome()` — shows `#dd-beginner-panel`, hides charts (`.dd-row2`, `.dd-row3`) until unlock
- `ddRenderBeginnerVerdict()` — verdict badge + 3 honest bullets
- `journeyUnlockFullDeepDive()` — user opts into full analysis (`fullDeepDive` flag)

### Beranda

- `nuRefreshView('dashboard')` — **lobby mode** for `isJourneyBeginner()` without tracked products: hides stats/trending/alerts; shows daily reco (`hbdRenderNuReco` → `recBuildDailyRandom`)
- `journeyRenderReturnStrip()` — tier ≥1, no tracked products: honest price/sold deltas vs `seenProducts`, plus “N produk baru hari ini di Discover” (same daily seed as reco)

### Nav

- `body.journey-beginner` hides advanced nav items; shows **Lainnya** (`#dash-nav-journey-more` → `journeyOpenMoreTools()`)
- `nuScheduleHint()` — **one hint per session** (`JOURNEY_HINT_SESSION_KEY`), action-linked CTAs

---

## Analytics events

Logged via `journeyLog()` → `logUserEvent` with `journey_tier` metadata:

| Event | When |
|-------|------|
| `discover_view` | Enter Discover |
| `discover_card_click` | Open card |
| `deepdive_open` | Open Deep Dive (`source`: `discover`, `onboarding`, etc.) |
| `journey_return_strip` | Return strip rendered on Beranda |
| `onboarding_complete` | Onboarding finished (existing onboarding telemetry) |

---

## Database migrations

Apply on Contabo (not cloud). See [self-host.md](./self-host.md):

```bash
bash scripts/apply-selfhost.sh supabase/migrations/<file>.sql
```

| Migration | Purpose |
|-----------|---------|
| `20260611160000_onboarding_seller_status.sql` | `user_onboarding_prefs.seller_status` (`first_time` \| `existing`) |
| `20260611170000_user_journey_stats.sql` | `user_journey_stats` + RLS (own row only) |

---

## Changing this funnel safely

1. Read **MISSION.md** — no fake urgency, no fabricated deltas in return strips.
2. Keep **leader/admin/cohort** paths unchanged unless explicitly requested.
3. If you change tier rules, update `userJourneyTier()`, `docs/journey-funnel-test.md`, and any copy that references tier behavior.
4. If you change Discover defaults, update `DSC_DEFAULT_*`, HTML sliders, and `dscResetFilters()`.
5. Do **not** reintroduce a blocking popup for onboarding — keep flow in Discover.
6. Competitor/pricing/marketing copy is **not** here — see [seo.md](./seo.md).

---

## Related docs

- [journey-funnel-test.md](./journey-funnel-test.md) — manual QA
- [supabase/README.md](../supabase/README.md) — CLI + migration index
- [AGENTS.md](../AGENTS.md) — agent guardrails
