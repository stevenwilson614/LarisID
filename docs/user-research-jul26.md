# User research — last 30 signups + landing visitors (A vs B)

**Date:** 2026-07-25 · **Analyst pass:** product research
**Cohort:** last 30 real signups, 2026-07-12 → 2026-07-23 (1 test account excluded)
**Landing window:** Clarity last 30 days (678 sessions) · `page_views` since 2026-07-20 deploy
**Sources:** self-hosted Supabase (`api.larisid.com`), Microsoft Clarity `vykppujn5k`

Every number below traces to a query or a named Clarity view. Claims are labelled
**[fact]** (measured), **[pattern]** (consistent across the cohort but small n),
**[hypothesis]** (a reading, not yet evidence), **[gap]** (not instrumented).

---

## 1. Executive summary

- **The A/B test is a dead heat on the metric that matters.** Session → signup is
  9.0% for A (12/134) and 8.6% for B (15/174) over 30 days. B converts CTA-clickers
  much better (40.5% vs 28.6%) but earns slightly fewer CTA clicks per session
  (21.3% vs 26.1%), and the two effects cancel. **[fact]**
- **B is decisively better *after* signup.** B users log 54.2 events each vs A's 25.7,
  4.8 dives vs 3.2, and reach first value in 0.4 min vs 1.2 min. 11/12 B users did
  something valuable vs 8/10 in A. **[fact, small n]**
- **Neither arm fixes retention.** Multi-day return is 2/10 (A) and 2/12 (B) — identical,
  and unchanged from every prior audit. Activation is solved; return is not. **[fact]**
- **The landing page's two most-clicked elements are dismiss buttons.** On `/`, two `×`
  controls take 28 and 26 clicks (7.7% of all taps combined) against 18 for the primary
  "Mulai Gratis" CTA. More people close things than convert. **[fact]**
- **The email-signup leak is now visible from the click side.** In the auth modal,
  "Lanjutkan dengan Google" gets 16 clicks and "Daftar dengan Email" 14 — yet **100% of
  the 30-user cohort signed up via Google and zero via email**. Roughly half of signup
  intent routes into a path that converts nobody. **[fact + pattern]**
- **A third of landing visitors never scroll.** Only 67.3% of `/` pageviews reach 5%
  depth and 48.9% reach 10% — the single biggest drop is inside the hero. **[fact]**
- **The free daily cap is a terminal event.** 6 of 17 user-days with any usage ended at
  the 3-dive ceiling, and for 4 of 30 users a limit event is the *last thing they ever
  did*. **[fact]**
- **Paid acquisition stopped around Jul 22.** Landing visits fell from 31/29 unique on
  Jul 21–22 to 6–7/day after, and no signup has occurred since Jul 23 18:01. **[fact]**

---

## 2. Cohort composition

30 real users, 2026-07-12 → 2026-07-23. One test account (`+laris…`, unconfirmed,
zero activity) excluded.

| Attribute | Result |
|---|---|
| Auth provider | **30/30 Google OAuth**, 0 email — same as every prior audit **[fact]** |
| Email confirmed | 30/30 |
| A/B tagged | 22 (A=10, B=12); 8 untagged — they predate the RAMP_B flip on ~Jul 18 |
| Attribution present | 29/30 (one user has no `signup_attribution` row at all) **[gap]** |

**Channel mix (all 30):**

| Channel | Users |
|---|---|
| Google Ads `ab_gpt_jul26` | 13 |
| ChatGPT referral (`chatgpt.com`) | 7 |
| Google organic | 3 |
| Direct | 4 |
| `/perbandingan/` SEO page | 2 |
| No attribution row | 1 |

The Google Ads campaign points at `/`, so paid traffic feeds **both** arms after the
random split (7 B, 6 A) — the campaign name says `gpt` but it is not a B-only channel.
**[fact]**

Clarity referrers add a channel the DB never sees: **`l.instagram.com` 21 sessions** and
`www.tiktok.com` 1 over 30 days. No cohort user carries an Instagram attribution, so this
traffic either bounces or loses its referrer before signup. **[gap]**

---

## 3. What signed-in users actually do

### 3.1 Paths taken

Aggregate `activity_events` for the cohort, by distinct users touching each surface:

| Surface | Events | Users |
|---|---|---|
| Discover feed (`discover_view`) | 117 | 27 |
| Deep Dive (`deepdive_open`) | 116 | 25 |
| Onboarding completed | 25 | 20 |
| Discover card click | 64 | 16 |
| LARISgpt landing (`gpt_landing_view`) | 19 | 12 |
| Deep-dive sections read | 249 | 9 |
| Chat messages sent | 34 | 8 |
| Track toggle | 13 | 8 |
| Typed search | 29 | 6 |

**Discover → Deep Dive is the spine of the product.** 27 of 30 users see the feed and 25
open at least one dive. Everything else is a minority behaviour. **[fact]**

Deliberate tracking has genuinely recovered: **6 deliberate tracks by 6 users** (vs 0/30
in the Jul 10 audit), alongside 8 calc-only rows from 6 users that indicate the MLS
calculator was opened rather than a real track. **[fact]** `saved_products` is 0. **[fact]**

### 3.2 What they are looking for

Onboarding categories (multi-select, 30 users):
Kecantikan 10 · Fashion 6 · Bayi & Anak 6 · HP & Gadget 6 · Kamar Mandi 6 ·
Kesehatan 5 · Motor & Mobil 4 · Elektronik 4.

Region: Jakarta 7 · Bandung 3 · Surabaya 2 · Surakarta 2 · Semarang 2 · 6 null ·
remainder spread across Depok, Bekasi, Kediri, Tasikmalaya, Jepara. **Beauty-first,
Jakarta-weighted, but with a real secondary-city tail.** **[fact]**

`seller_status` is null for 26/30 — expected, since the seller-status step was removed from
onboarding on Jul 9. **Pemula vs existing seller cannot be segmented from prefs** and must
be inferred from behaviour. **[gap]**

**Typed searches tell a different story than the category picker.** The 29 logged
`search_query` events (6 users) resolve to roughly a dozen real intents:

- **Brand / competitor lookups:** `Sipolos`, `Andistro`, `morinaga`, `chilkid`, `Bapin`
- **Own-market checks:** `Kaos polos tasikmalaya` — from a user whose region *is*
  Tasikmalaya, i.e. checking their own local competition
- **Category exploration:** `Kecantikan`, `Body lotion`, `kesehatan`, `herbal`, `Organizer
  dan alat praktis rumah tangga`

Note `search_query` fires on partial input (`Bo` → `Bod` → `Body lotion`), so raw event
counts overstate intent roughly 2–3×. **[fact]**

**Users search for named brands and their own niche, not just categories.** **[pattern]**

### 3.3 B-arm chat intent

90 messages across 24 chats. User-side prompts split into two groups:

- **Canned chips** — `Temukan produk: <city> · <category> · <budget> · penjual baru`
  (the onboarding handoff), `Produk apa yang lagi trending minggu ini?`,
  `Cari produk dekorasi rumah yang laris`, `Hitung estimasi profit`, `Cari toko di shopee`
- **Genuinely typed** — `pupuk`, `Sepatu wanita`, `Parfum`, `produk fashion trending
  kompetisi rendah`, `Produk yang laris 2026`, `Produk bakal viral`, `Cari skincare
  terlaris`, `Gimana caranya masuk link toko`

Two things stand out. **Typed prompts are overwhelmingly "find me a winning product"** —
trending, viral, low-competition, best-selling. **[pattern]** And one prompt is a support
question — *"Gimana caranya masuk link toko"* (how do I enter a store link) — asked twice,
suggesting store-level analysis is wanted but its entry point is not discoverable.
**[hypothesis]**

**One user shows a clear frustration signature:** 8 user messages against only 5 assistant
replies, including `Parfum` sent four times in a row then `Parfum dulu` twice. Every other
chat user received at least as many replies as they sent. n=1, so this is a lead to verify
in preview, not a proven bug. **[hypothesis]**

### 3.4 Where they stall

Last recorded action per user (excluding attribution and the same-session return strip):

| Last action | Users |
|---|---|
| `discover_view` | **11** |
| `gpt_dwell` | 4 |
| `usage_limit_shown` | 3 |
| `deepdive_open` | 3 |
| `gpt_limit_hit` | 1 |
| other (single occurrences) | 8 |

**11 of 30 users end their entire relationship with the product staring at the Discover
feed.** They arrive, get a feed, and stop. **[fact]** A further **4 of 30 end on a
limit wall** — the free cap is not just a throttle, it is the last screen a seventh of the
cohort ever sees. **[fact]**

Corroborating: of the 17 cohort user-days with any usage, **6 ended with `dives_used = 3`**
(the daily maximum). **[fact]**

---

## 4. A vs B comparison

### 4.1 Post-signup (Supabase, cohort of 22 tagged users)

| Metric | A (n=10) | B (n=12) | Untagged (n=8) |
|---|---|---|---|
| Avg events/user | 25.7 | **54.2** | 21.0 |
| Avg deep dives/user | 3.2 | **4.8** | 3.3 |
| Did something valuable (dive or chat) | 8/10 | **11/12** | 7/8 |
| Zero-value users | 2 | **1** | 1 |
| Onboarding completed | 7/10 | 8/12 | 5/8 |
| Median time to first value | 1.2 min | **0.4 min** | 0.9 min |
| Multi-day return | 2/10 | 2/12 | 2/8 |
| Hit a usage limit | 2 | 2 | 0 |

### 4.2 Pre-signup (Clarity, 30 days, filtered on `ab_variant`)

| Metric | A | B |
|---|---|---|
| Sessions | 134 | 174 |
| Unique users | 117 | 139 |
| Pages/session | 1.36 | 1.41 |
| Active time | 1.5 min (of 3.8) | **2.6 min (of 6.6)** |
| CTA click rate | **26.1%** (35) | 21.3% (37) |
| CTA → signup | 28.6% | **40.5%** |
| **Session → signup** | **9.0%** (12) | 8.6% (15) |
| Median time to convert | **43 s** | 1.2 min |
| Quick backs | 3.73% | **0%** |
| Dead clicks | **5.22%** | 6.32% |
| Performance score | 64/100 | **77/100** |
| LCP | 6.3 s (poor) | **4.0 s** (poor) |
| CLS | 0.13 | **0.095** (good) |
| Mobile share | ~64% | ~69% |

**Do not compare the scroll-depth figures** (A 44.3%, B 99.5%). B is a short chat page
where 100% scroll is trivially reached; the number measures page length, not interest.
**[gap]**

### 4.3 Verdict

- **Acquisition: tie.** 9.0% vs 8.6% session→signup, on 134 and 174 sessions. That
  difference is far inside noise for these volumes. **[fact]**
- **B's mechanism is different, not better at the top.** A gets more people to click a
  CTA; B converts more of the people who do. The chat page holds attention 73% longer and
  produces zero quick-backs, but asks for signup later (1.2 min vs 43 s to convert).
  **[pattern]**
- **B wins clearly on depth.** ~2× the events and 1.5× the dives per user, and faster to
  first value. If the goal is engaged users rather than raw signups, B is ahead.
  **[pattern, n=22]**
- **B is also the faster page** (77 vs 64 performance score) despite carrying a chat UI —
  A's 6.3 s LCP on a mostly-mobile, mostly-paid audience is a real cost.
- **Neither arm moves retention.** 2/10 vs 2/12. Whatever is broken about coming back on
  day 2 is upstream of the A/B question. **[fact]**

---

## 5. Landing funnel: arrive → engage → CTA → leave

30-day Clarity, all variants, 678 sessions (95 bot sessions excluded; note ~112 pageviews
come from `https://Electron` and `localhost`/`127.0.0.1`, i.e. local dev — treat absolute
totals as slightly inflated). **[gap]**

```
678 sessions
  → 188 reach 25% scroll        (27.7%)
  → 143 reach 50% scroll        (21.1%)
  → 133 reach 75% scroll        (19.6%)
  →  77 reach 100% scroll       (11.4%)
  → 130 cta_signup_click        (19.2% of sessions)
  →  42 signup_success          (32.3% of clickers, 6.2% of sessions)
```

Scroll decay measured on `/` alone (272 pageviews):

| Depth | Visitors | % |
|---|---|---|
| 5% | 183 | 67.3% |
| 10% | 133 | 48.9% |
| 15% | 120 | 44.1% |
| 20% | 108 | 39.7% |
| 25% | 93 | 34.2% |
| 30% | 86 | 31.6% |
| 40% | 77 | 28.3% |
| 45% | 66 | 24.3% |

**Interest dies in the hero.** A third of pageviews never reach 5% depth, and the single
largest drop is 5% → 10% (183 → 133, a 27% loss). Once past ~20%, decay is gradual — the
mid-page and pricing sections are not where people quit. **[fact]**

### Click heatmap on `/` (272 pageviews, 705 taps)

| Rank | Element | Clicks | % of taps |
|---|---|---|---|
| 1 | `×` (dismiss) | 28 | 3.97% |
| 2 | `×` (dismiss) | 26 | 3.69% |
| 3 | **Mulai Gratis** (primary CTA) | 18 | 2.55% |
| 4 | Lanjutkan dengan Google | 16 | 2.27% |
| 5 | Daftar dengan Email | 14 | 1.99% |
| 6 | `#sidebar-overlay` | 13 | 1.84% |
| 7 | `×` on "Buat Akun Gratis" modal | 9 | 1.28% |

Three readings:

1. **Dismissal outranks conversion 3:1.** The two top `×` controls collect 54 clicks
   against the CTA's 18. Something on the page is being closed far more than the product is
   being started. **[fact]**
2. **The auth modal splits intent almost evenly between Google (16) and Email (14) — and
   the email half converts nobody.** All 30 cohort signups are Google. This is the
   long-standing email leak, now quantified at the point of choice rather than inferred
   from missing confirmations. **[fact + pattern]**
3. **9 people opened the signup modal and closed it.** That is half again the number who
   clicked "Daftar dengan Email", and it sits directly on the 67.7% CTA→signup drop-off.
   **[fact]**

### Volume and health

`page_views` (real rows only; the 1025 synthetic Cloudflare backfill rows are excluded):

| Date (WIB) | Views | Unique visitors |
|---|---|---|
| Jul 20 | 12 | 12 |
| Jul 21 | 31 | 29 |
| Jul 22 | 33 | 31 |
| Jul 23 | 7 | 6 |
| Jul 24 | 7 | 7 |
| Jul 25 | 3 | 3 |

Real-referrer split since deploy: `www.google.com` 64 views / 60 visitors, direct 27/22.
**Traffic collapsed ~4× after Jul 22 and signups stopped entirely after Jul 23 18:01** —
consistent with the ad campaign pausing or exhausting budget. **[fact]** Any comparison of
"recent" engagement against the Jul 20–22 peak needs to account for this. **[hypothesis:
ads paused; verify in Google Ads]**

`page_views` only ever records `/`. **`/gpt/` is not logged server-side at all** — B-arm
landing volume exists only in Clarity. **[gap]**

Site-wide health from Clarity: **0 rage clicks** in 678 sessions, 4.87% dead clicks (33
sessions), 1.18% quick backs. Devices ~59% mobile (ChromeMobile 41.7% + MobileSafari 14.0%
+ InstagramApp 3.4%). **The landing experience is not enraging anyone — it is failing to
hold them.** **[fact]**

---

## 6. What users actually need

Derived from behaviour, ranked by weight of evidence.

**1. "Tell me what to sell" — a shortlist, not a feed.** 27/30 reach Discover; 11/30 die
there. Typed chat prompts are almost all `trending` / `viral` / `terlaris` /
`kompetisi rendah`. Users are not asking to browse; they are asking to be handed a small
set of answers. The feed gives them a surface to browse. **[pattern — strong: two
independent sources, behaviour + language]**

**2. "Check this specific thing I already have in mind."** Every typed search is a brand
or a niche — `Sipolos`, `Andistro`, `morinaga`, `chilkid`, `Kaos polos tasikmalaya`. These
are sellers validating an existing hypothesis, often against their own local market, not
discovering from scratch. Only 6/30 typed anything, but of those who did, this is what they
did. **[pattern — moderate: n=6]**

**3. "Will this actually make me money?"** `Hitung estimasi profit` is a repeatedly-clicked
chip; 8 calc-only rows from 6 users show the MLS calculator being opened. The question after
"what should I sell" is immediately "what do I earn". **[pattern]**

**4. "Let me look at more than three things."** 6 of 17 active user-days end at the 3-dive
cap and 4 users' final action is a limit wall. Three dives is below the number needed to
form a judgement when comparing products. **[fact for the wall; hypothesis for the cause]**

**5. "Sign me in the way I expect."** 14 clicks on email signup, zero email signups ever
completing. Users are choosing a door that does not open. **[fact]**

---

## 7. Recommended next steps

Ranked by expected impact ÷ effort.

**1. Remove or fix the email signup path.** It absorbs ~47% of auth-modal clicks and
converts 0%. Either fix deliverability/confirmation end-to-end, or hide it behind a
"lainnya" link and make Google the single obvious door. This is the cheapest measurable
win on the board — roughly a third of signup intent is currently discarded.

**2. Identify and kill the two `×` elements on `/`.** They out-click the primary CTA 3:1.
Find what they close (the ranked heatmap gives element handles; `#sidebar-overlay` at rank 6
is a lead), then either remove the interruption or move it after first scroll. Re-measure
CTA click rate afterwards.

**3. Raise or restructure the 3-dive daily cap.** Four users' last-ever action is a limit
event and 35% of active days hit the ceiling. Test a higher first-day allowance (e.g. 3/day
but 8 on day 1) so the first session can actually reach a decision. Success metric: share of
user-days ending at the cap, and day-2 return.

**4. Fix the hero, and fix it on mobile.** A third of pageviews never scroll and A's LCP is
6.3 s on a ~64%-mobile paid audience. The hero is doing both jobs badly — too slow to load
and not compelling enough to earn a scroll. B already demonstrates 77/100 is achievable on
the same stack.

**5. Ship the instrumentation needed to answer what this pass could not** (see §8). In
particular: log `/gpt/` pageviews server-side, and fire `scroll_depth_*` on B. Without
these the next A/B read will have the same blind spots as this one.

**Deliberately not recommended:** killing either A or B. Session→signup is a tie, B wins on
depth, A wins on CTA rate — there is no evidence base yet for retiring an arm, and the
Jul 22 traffic collapse means recent data is thin. Let the split run.

---

## 8. Instrumentation gaps

Confirmed in code and data during this pass:

- **`/gpt/` pageviews are not logged to `page_views`.** `_lidLogPageView()` runs from
  `js/laris-app.js` only; `js/gpt-app.js` has no equivalent. B-arm landing volume is
  Clarity-only.
- **`scroll_depth_*` fires on A only** (`js/laris-app.js:24339`); no equivalent in
  `js/gpt-app.js`. A/B scroll cannot be compared, and B's 99.5% Clarity figure is a
  page-length artifact.
- **No CTA-click event in the database.** Signup CTAs call `openAuthModal('signup')`
  directly; only Clarity's `cta_signup_click` / `signup_cta_source` carry it.
- **No view-open events** for Tools / Akademi / MLS / community. Reaching those surfaces is
  inferred (e.g. `calc_scenario` rows imply the calculator was opened).
- **`unlock_modal_shown` and `deepdive_teaser_click` remain at zero site-wide** since the
  Jul 10 ship. Absence is not evidence of behaviour here — these hooks are unverified.
- **`gpt_ai_reply` badly undercounts**: 6 sessions / 10 events against 50 assistant messages
  actually stored. Do not use it as a reply-rate metric.
- **`deepdive_open` (116 events / 25 users) vs metered `usage_events` dives (30 / 10 users)
  disagree ~4×.** Most likely re-opens and cached dives do not consume quota. Both figures
  are reported above as-is rather than reconciled — resolve before either is used as a KPI.
- **`seller_status` is unavailable** for 26/30 users since the Jul 9 onboarding cut.
- **One user has no `signup_attribution` row**, so channel data covers 29/30.
- **`credits` is NULL for post-Jul-16 users by design** (metering pivot). Not a bug.
- **Clarity totals include local dev traffic** (`https://Electron` 112 pageviews,
  `localhost`, `127.0.0.1`).

## 9. Method note

Cohort pulled from `auth.users` ordered by `created_at desc`, limit 30, excluding the one
`stevenwilson614+…` test address; reconciled against 163 total users and a newest signup of
2026-07-24 03:52 UTC. A/B variant read from the first `signup_attribution` event's
`metadata->>'ab_variant'`, matching the pattern in `docs/AB_TEST.sql`; 22 tagged, 8 untagged
(pre-flip), no silent drops. Clarity read through the dashboard with a `ab_variant` custom-tag
filter over the last 30 days, plus the tap and scroll heatmaps for `https://larisid.com/`.

**Scope limit, stated plainly:** the qualitative layer here comes from heatmaps, ranked
click elements, dead-click / quick-back / rage-click rates, and stored chat text — **not
from watching individual session recordings**. The brief asked for 10–15 recordings; those
were not viewed in this pass, so no claim below rests on them. Recording review remains the
best next step for the two open questions: what the `×` elements actually close, and what
happens in the 88 sessions that clicked a CTA and did not sign up.

Feedback table adds nothing for this window: 22 rows all-time, **1 in the last 30 days**
("Pingin dagang online", filed as a bug). The June cluster is all `wrong_data` complaints
about flat/zero sales — the scraper freeze, not a current-cohort signal.
