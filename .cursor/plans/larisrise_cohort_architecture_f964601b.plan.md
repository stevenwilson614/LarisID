---
name: LarisRise Cohort Architecture
overview: "Fit LarisRise into the existing LarisID SPA + /rise using the already-shipped SSIS pipeline: daily crawls of linked student shops power cohort-only leaderboards and scrape-verified badges, with strict member-only visibility and WhatsApp-native mentor ops."
todos:
  - id: resolve-cohort-dom
    content: Confirm/restore cohort DOM in index.html (merge from worktree or intentional strip)
    status: completed
  - id: shop-crawler
    content: Daily student-shop crawl job (scraper repo) → listing_snapshot + cohort_events + sensor_health
    status: completed
  - id: leaderboard-rpc
    content: cohort_shop_leaderboard RPC (member-gated) + rankings boards + Toko Saya card
    status: completed
  - id: mentor-roster-health
    content: Mentor roster shop-health columns + flagged confirm/exclude + perlu-bantuan queue
    status: completed
  - id: session-attendance
    content: "P0: mentor tap Hadir/Izin/Absen per session (no Zoom API)"
    status: completed
  - id: attempt-group-ux
    content: "P1: confirm same product across Shopee/Tokopedia → 1 produk, N toko"
    status: completed
  - id: badges
    content: "P1: scrape-verified badge keys + award trigger off cohort_events"
    status: completed
  - id: wa-comms
    content: "P1: send-cohort-whatsapp edge function (announcements mirror + session reminders)"
    status: completed
  - id: wins-digest
    content: "P1: mentor wins digest + celebrate-to-feed flow"
    status: completed
isProject: false
---

# LarisRise on LarisID — Product Architecture

**Core stance:** LarisRise is not a new product. It is one `cohorts` row with the Skool-style surfaces that already exist (feed, rankings, jadwal, milestones, announcements), plus one genuinely new capability: **scrape-verified progress** from SSIS (`student_account` → `listing`/`listing_snapshot` → `cohort_events`). Everything below extends that spine.

## 1. IA (current SPA + /rise)

- **/rise/** (public, exists): marketing + `daftar` intake + `admin` reviewer board. No cohort content ever renders here. Accepted applicants get a `cohort_invite_codes` invite via the existing `rise-notify-accepted` WA/email flow → land in the SPA.
- **SPA `#/cohort`** (members only, exists): student tabs `ringkasan | feed | rankings | chat | jadwal`.
  - `ringkasan`: add a **"Toko Saya"** card — linked shops (`ssis_link_shop`, already self-serve in profile), last-crawl status from `sensor_health`, my measured numbers.
  - `rankings`: add scrape-derived boards next to the existing activity-points board (section 3).
  - `jadwal`: unchanged — 16 sessions via `cohort_sessions` + ICS + (P1) WA reminders, per the learning-research roadmap.
- **Profile** (public, exists): `get_public_profile` already exposes store links; add the badge shelf (`renderProfileBadges` exists). This is the only public window into a student's Rise journey.
- **Mentor tabs** (exist): extend `students` tab + student drawer with per-student **shop health** (linked? last crawl? flagged deltas?) and a **"perlu bantuan"** queue. New small `report` addition: wins digest.
- **Platform admin (Rise ops)**: one admin panel section — cross-cohort `sensor_health` rollup, crawl-failure queue (`cohort_raw_failed`), flagged-delta review.

## 2. Visibility matrix

- **Public / non-member (incl. logged-in non-cohort users)**
  - Sees: /rise marketing, public student profiles (name, city, bio, store links, **badges**), public masukan/community-board features.
  - Never sees: feed, announcements, chat, jadwal, any leaderboard, any per-shop or class-aggregate scrape numbers. Enforced today by RLS (member-or-mentor SELECT on all cohort tables) — keep new leaderboard RPCs behind the same membership check.
- **Active cohort student**
  - Sees: full cohort surfaces; cohort leaderboards with classmates' *derived* metrics (SKU count, units, reviews); own raw snapshots.
  - Does not see: classmates' raw `listing_snapshot` rows (prices, stock, per-SKU detail) — leaderboards expose totals only. `ssis_can_view_student` already restricts raw data to self/mentor/admin; keep it.
- **Mentor of that cohort**: everything students see + raw per-student shop data, notes, flags, roster health.
- **Platform admin**: all of the above across cohorts + raw-payload tables.
- Paused/left members lose access automatically (`status='active'` checks already in RLS).

Badge honesty note: badges on public profiles are individual, verified milestones — celebratory, not class metrics — so they pass constraint 1 and serve MISSION's "helping people up." Leaderboards stay cohort-only.

## 3. Leaderboards + badges — rules & source of truth

**Source of truth (one path):** shop crawler reads active `student_account (kind='shop')` → writes `listing` + `listing_snapshot` → derives `cohort_events` (confidence 1.0). Leaderboards and badges read **only** `cohort_events`/`listing_snapshot`, never self-reported events.

**Cadence & measured-vs-estimated:** crawl each linked shop **daily** (~20 students × ≤8 shops — trivially cheap vs keyword scrapes; this sidesteps the 12–17-day keyword cadence problem entirely). Beginner shops have exact Shopee counts (<1000), so everything is labeled **terukur**. If a counter ever rounds ("1RB+"), freeze that SKU's units at "1.000+" and stop accumulating — never estimate on a leaderboard (docs/listing-weekly.md principle).

**Stores vs products (cross-platform):** a student may sell the *same* product on Shopee and Tokopedia. Count them separately:

| Metric | What it measures | How |
|---|---|---|
| **Toko aktif** | How many stores they’re live on | Count of active `student_account (kind='shop')` |
| **Produk (SKU)** | Distinct products, not platform copies | Count distinct `attempt_group_id` on live `listing` rows (SSIS already has this field for “same product across platforms,” mentor/student-confirmed in check-in). Untagged listings each count as their own group until linked. |
| **Listing aktif** (optional mentor detail) | Raw platform rows | Count of non-delisted `listing` — Shopee copy + Tokopedia copy = 2 |

So: same bottle on Shopee + Tokopedia → **1 produk**, **2 toko**, **2 listings**. Units sold / reviews still sum across listings in the group (every channel’s sales count). First-listing badge fires once per student on first *produk* (first `attempt_group`), not once per platform copy.

**Boards (separate, transparent — no blended opaque score):**

- **Toko aktif** — linked shops (secondary strip / Toko Saya, not necessarily a competitive board).
- **Produk aktif** — distinct `attempt_group_id` (or solo listings) that are live — *this* replaces a naive “SKU = listing rows” board.
- **Terjual (selama program)** — sum of positive daily sold deltas across all listings since `greatest(link_date, starts_at)`.
- **Ulasan** — review-count delta over the same window (sum across listings).
- Secondary (recommended): **Konsistensi** — weeks with ≥1 new/updated listing (habit; hardest to game); keep existing activity-points board as the community board.

**Display (MISSION: no shaming):** students see top 10 + their own rank and delta; mentors see the full list. No "bottom of class" surface anywhere.

**Gamification & UI (how it feels, not just the RPCs):**

- **Rankings tab:** segmented boards (tabs or chips: Aktivitas | Produk | Terjual | Ulasan) — never one opaque “score.” Each row: avatar, name, value, tiny sparkline or “+N minggu ini.” Your row pinned/highlighted even if outside top 10. Labels always say **terukur**.
- **Toko Saya (ringkasan):** my toko count · produk · terjual · ulasan · last crawl status; soft CTA if shop unlinked or sensor dark — coaching tone, not alarm.
- **Badges:** toast + feed-eligible win when earned; shelf on own profile (locked silhouettes for unearned on *own* view only — never show classmates’ empty slots publicly). Verified badges get a small “dari toko” mark vs self-reported.
- **Feed celebrations:** mentor one-tap from wins digest → cohort feed card only (“X dapat lencana Penjualan pertama ✓”). No auto-post to public community board.
- **Tone:** progress and habits (“minggu ini kamu update 2 produk”), not income or class rank shaming. Copy in Indonesian, short.

**Ties:** shared rank (competition ranking); display order within a tie = who reached the value first (`cohort_events.ts`).

**Anti-gaming:**

- Count only positive deltas; relist/delist churn can't inflate **produk** count (`attempt_group_id` + `delisted_at`); listing-row churn still can't inflate toko count.
- Cross-posting the same product to a second platform raises **toko**/listing, not **produk** — once grouped. Ungrouped duplicates can inflate until mentor/student confirms the group in check-in (surface “punya duplikat?” in Toko Saya).
- Unlink keeps history (`active=false`); relinking the same shop dedupes — no reset exploit.
- Outlier flag: daily sold delta above a threshold (e.g. >30 units for a <60-day shop) with no review growth → `needs_review` event; excluded from boards until mentor confirms. Mentor can exclude a shop outright. **Mentor confirm/exclude is P0**, not deferred UI polish.
- Only shops linked before/during the program window count toward Rise boards (no importing an old mature shop — metrics from `greatest(verified_at/link_date, starts_at)` by default).

**Badges (extend existing `achievements` + trigger, don't rebuild):** new keys awarded off `cohort_events`: `first_listing` (first produk/group), `first_sale_verified`, `first_review`, `lima_produk`, `sepuluh_terjual`, `dua_toko` (live on 2 platforms). Defer `ulasan_bintang5` until crawl reliably has star rating. Existing self-reported `first_sale` stays; verified badge is distinct and marked "terverifikasi dari toko." One-time, never revoked, no income framing. Award path: `cohort_events` → award RPC (today’s trigger is `activity_events` only — extend it). Public shelf needs `get_public_profile` (or RLS) change — today badges are self/mentor-only.

## 4. Mentor/admin comms & ops

- **Chat stays in WhatsApp** (group + 1:1). Don't build in-app chat depth; the existing `chat` tab links out to `cohorts.whatsapp_invite_url`. This is the Indonesia-native call and avoids duplicating a channel students already live in.
- **Announcements**: authored in-app (`cohort_announcements`, source of record) and mirrored to WA via a new `send-cohort-whatsapp` edge function (Fonnte, same infra as OTP/rise-notify). Session reminders (P1 in the research roadmap) ride the same function.
- **Roster health (mentor `students` tab):** per-student row = shop linked? · last crawl ok (`sensor_health`)? · toko/produk/units/reviews · session hadir · last-seen (`cohort_ping`) · flags. "Perlu bantuan" auto-list: no shop by week 1, zero produk by week 3, sensor `dark`, flagged deltas, missed ≥2 sessions.
- **Session attendance (Zoom):** **no reliable auto-track in v1.** Zoom’s participant API needs a paid Zoom app, OAuth, and matching display names to students — brittle for a 20-person WA-native cohort. **P0:** mentor (or co-host) taps Hadir / Izin / Absen on the session roster after class (~30s for 20 names); store `session_attendance(session_id, user_id, status, marked_by)`. Meeting link stays on `cohort_sessions.meet_url`. **P2 optional:** Zoom CSV upload or API if ops wants it — never block the program on it. Self-check-in via WA (`checkin_submitted`) can *supplement* but does not replace mentor roll for “who was in the room.”
- **Celebrating wins without leaks:** mentor gets a wins digest (new `first_sale_verified` etc. events); one tap posts a celebration to the **cohort feed only**. Public celebration happens solely through the badge on the student's own profile.
- **Admin (Rise ops):** application pipeline stays at `/rise/admin`; operational health (crawl failures, redaction audit, flagged shops, cross-cohort sensor rollup) lives in the SPA admin area.

## 5. Build order

- **P0 (program can't run without):**
  - Shop crawler job (scraper repo) reading `student_account`, daily, writing `listing_snapshot` + deriving `cohort_events` + `sensor_health`.
  - Shop leaderboard RPC(s) (membership-gated) on rankings tab: Produk | Terjual | Ulasan (+ existing activity board) + "Toko Saya" card (toko vs produk clear).
  - Mentor roster shop-health + flagged-shop confirm/exclude + perlu-bantuan queue.
  - Session attendance: mentor tap Hadir/Izin/Absen (no Zoom API).
  - Resolve the missing cohort DOM in `index.html` (see open questions).
- **P1:** scrape-verified badge keys + `cohort_events` award path; `attempt_group` confirm UX in Toko Saya/check-in; `send-cohort-whatsapp` (announcements + session reminders); mentor wins digest + celebrate-to-feed.
- **P2:** Konsistensi board; public-profile badge shelf via `get_public_profile`; admin cross-cohort ops panel; optional Zoom CSV/API attendance import.

**Risks:** crawler lives in the separate scraper repo (cross-repo coordination is the long pole); Shopee anti-bot on shop pages at daily cadence (small N mitigates); students linking someone else's shop (mitigate: mentor verifies at Day-0, `verified_at` gates boards); fake orders (flag + mentor review, accept imperfection over surveillance).

## 6. Blocking open questions

1. **Cohort DOM is absent from the current `index.html`** — `js/laris-app.js` still expects `#dash-view-cohort` and all subtab panels (full markup exists in the `beginner-products-and-calculators` worktree). Was it intentionally stripped, or is a merge pending? Blocks every SPA surface above.
2. **Does the scraper repo already have a student-shop crawl job** reading `student_account (kind='shop')`, or is that greenfield? (The migration comment says "the crawler already reads" it — need confirmation of what exists and its cadence.) Determines P0 scope and which repo the work lands in.
3. **Program window definition for metrics:** count units/reviews from cohort `starts_at` (2 Sep) even for shops linked earlier, or from each shop's link date? Affects fairness for students who already have a small shop — my recommendation is `greatest(link_date, starts_at)`, but this is a program-policy call.

