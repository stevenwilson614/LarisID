# Site A vs Site B — Google Ads readout, Jul 17 → Aug 7 2026

Cohort: users who signed up Jul 18 – Aug 6, arm resolved from their
`signup_attribution` event, excluding staff (`X`) and `direct_gpt`.
**A = 43 users, B = 32 users.** Attribution coverage 96.3%.

---

## 1. The one-line answer

**B is better at getting people to look. A is better at getting people to act.**

Both arms are *identical* on the two metrics you'd expect to separate them —
deep-dive rate (81% both) and return rate (19% both). The two places they differ,
they differ enormously, and in opposite directions.

| | Arm A | Arm B | Verdict |
|---|---|---|---|
| Ever searched | 48.8% (21/43) | **93.8% (30/32)** | **B, large** |
| Ever opened a deep dive | 81.4% | 81.3% | tie |
| Opened 2+ deep dives | 62.8% | 71.9% | B, slight |
| Median events per user | 23 | **42.5** | **B** |
| Median session length | 3.6 min | **5.4 min** | **B** |
| Events per session (median) | 14 | **22.5** | **B** |
| **Ever tracked a product** | **37.2% (16/43)** | **3.1% (1/32)** | **A, decisive** |
| Returned on a 2nd day | 18.6% | 18.8% | tie |

Two of these gaps are large enough to be real despite the small sample: the
search gap (21/43 vs 30/32) and the tracking gap (16/43 vs 1/32). Everything else
is a tie or noise.

**The tracking number is not an instrumentation artifact.** I checked it against
`user_tracked_products`, a plain table with no A/B tagging involved: A has 29 rows
from 16 users, B has 2 rows from 1 user.

---

## 2. Why B fails to convert to tracking

B's deep-dive report is read *thoroughly* — its scroll telemetry shows 27–28 of
its ~28 scrolling users reach `skor`, `tren`, `harga` and `kompetitor`. The
report is working.

The problem is where the track button lives. On B it sits inside the `Aksi Cepat`
block near the bottom: only **13 of 28** users scroll that far, and only **3**
ever clicked `track_cta`. On A, tracking is a persistent nav destination —
`tracker_tab` fired 38 times across 12 users on A versus 3 times / 2 users on B.

**A makes tracking a place you can go. B makes it a button you have to scroll to.**
That is the whole difference, and it is the single most valuable thing to carry
from A into the merged site.

Supporting timing: on A, median time from first event to first track is
**4.7 minutes** (n=17). On B only 2 users ever got there, so no median is
meaningful.

---

## 3. The two arms start completely differently

First three events per user tell the story:

- **A:** `location_auto_detected` (35 users) → `onboarding_location` (28) →
  `onboarding_cats` / `onboarding_skip`. A front-loads a wizard. 27/43 complete
  it, 13 explicitly skip.
- **B:** `gpt_landing_view` (26) → `steven_recs_view` / `discover_view` →
  `gpt_finder_search` / `deepdive_open`. B goes straight to content; onboarding is
  optional and 17/32 do it later.

Both arms reach the first deep dive in about the same time — **A 1.2 min, B 1.1
min**. Neither has a discovery problem. The onboarding wizard on A costs 3 extra
steps but does not delay the first dive, and it produces a prefs row for 43/43
users vs 24/32 on B.

B's landing finder is genuinely popular: `gpt_finder_search` fired for **24 of 32**
B users, and **29 of 32** created a chat. B's two-level category picker is used too
(`dir_filter` category by 17 users, subgroup by 15). A has no equivalent instrument
and, per the code, no equivalent event at all — A's category filter fires nothing.

---

## 4. Answers to your specific questions

**Desktop vs mobile** — effectively unmeasurable. The only device signal anywhere
in the database is `auth.sessions.user_agent`: logged-in users only, from Jul 26.
Within that thin slice: A splits 15 desktop / 16 mobile; B splits 12 desktop / 8
mobile. Only 20 of 1,665 `page_views` rows carry a user id, so top-of-funnel
cannot be segmented by device at all. Clarity has this; the database does not.

**Landing bounce** (valid from Jul 29 only, when B's page-view logger was fixed) —
A 78.1% single-view visitors of 169, B 81.2% of 138. A is marginally stickier at
the landing but the gap is inside the noise.

**Hit the daily limit** — A 13/43 users (30%), B 9/32 (28%). Essentially equal.
What matters far more: **of everyone who hit the wall, 2 people ever came back.**
A 1 of 13, B 1 of 9. The limit is close to fatal on both arms.

**Spinner** — A: 19 users shown, 8 awarded (42%). B: 17 shown, 5 awarded (29%).
Note there is *no dismiss event and no spin-initiated event* in either arm, so
"shown minus awarded" mixes people who closed the modal with people who spun and
landed the zero segment (15% of the wheel). A true click-vs-dismiss rate is not
recoverable.

**Chrome extension** — no analytics exist on either arm; the store links are plain
anchors with no handler. Total adoption to date: 3 codes issued, 1 used.

**Feedback** — 4 submissions from 3 users since Jul 17, all from arm A's page
title. Zero from B. B's feedback insert was rejected by a check constraint until
Aug 2 and A's was broken until Aug 3, so this measures the bug, not the users.

**Cari Supplier** — still admin-gated (`SUPPLIER_PROBE_PUBLIC = false`). All 11
`supplier_tab_open` events are one staff account. The one real signal: B's
"no supplier yet" demand modal got **9 responses from 4 real users** — small, but
it's the only genuine supplier demand evidence you have.

**Mulai berjualan** — not instrumented on either arm; `switchDashView()` fires no
event. It is also an A-only surface, so there is nothing to compare.

**Referrals** — `referral_codes` has 34 rows, `referrals` has **0**. The referral
programme has produced nothing.

---

## 5. Where users come from

| Source | Arm A | Arm B | Total |
|---|---|---|---|
| Google Ads (cpc) | 25 | 16 | **41** |
| ChatGPT | 6 | 2 | 8 |
| Google organic | 5 | 0 | 5 |
| Direct | 5 | 0 | 5 |
| Bing | 2 | 0 | 2 |
| "internal" (larisid.com) | 0 | 14 | 14 |

**Caveat that matters:** B's 14 "internal" referrals are an artifact — the A/B
redirect sends users from `/` to `/gpt/`, overwriting `document.referrer` with
larisid.com. So B's true organic/direct/ChatGPT origins are lost. UTM parameters
survive the redirect, so the **Google Ads split (25/16) is reliable**; the rest of
the source breakdown is arm-A-biased and should only be read as a pooled total.

Ads are ~55% of signups and steady (11 → 15 → 13 per week). **ChatGPT is a real
and unmanaged channel** at ~11% of attributable signups — people are being sent to
you by an LLM, not by your marketing.

---

## 6. What people look for

**Cities:** Bandung dominates (22 users), then Jakarta (13), Surabaya (7),
Tangerang (4). **Categories:** Olahraga (17 users), Fashion (14), Kecantikan (5),
Rumah (5). Fashion + sport + beauty is the demand core.

**The search behaviour differs by arm in a way worth designing around.** A's users
type keywords — "kemeja", "kaos", "batik", "tote bag kanvas". B's users type
sentences — "cari produk dekorasi rumah yang laris", "bagaimana aku cara cek
rating seo suatu toko?". Same intent, different grammar.

Search is not a friction point: **zero-result rate is 2.0%** across 198 measured
searches.

Note that most city/category telemetry comes from B — A's browse filters emit no
events — so these lists lean toward B's population.

---

## 7. Recommendation for the merged site

The evidence supports a clear split of responsibilities. Keep B's front half and
A's back half.

**Take from B:**
1. **The landing finder.** 24 of 32 B users used it. It's the best-performing
   entry point either arm has.
2. **Natural-language search.** B's users ask questions and B answers them; this
   drove search participation from 49% to 94%.
3. **The deep-dive report layout and its scroll telemetry.** People genuinely read
   it top to bottom, and it's the only instrument either arm has for *what gets
   read*. Port it to the merged report.
4. **The two-level category/subgroup picker** (17 and 15 users), which A lacks
   entirely — including its events.

**Take from A:**
1. **Tracking as a persistent destination**, not a button inside a report. This is
   the single highest-value change; it is worth ~34 percentage points of tracking
   conversion.
2. **The onboarding wizard**, but keep it skippable. It produced a prefs row for
   43/43 A users vs 24/32 on B, and it did not slow the first deep dive.

**Fix regardless of arm:**
3. **The daily limit is destroying users.** 22 people hit the wall; 2 came back.
   Whatever the merged site does, hitting the cap must not be a dead end — the
   spinner is not solving it (only 29–42% of people shown it even spin).
4. **Move the track CTA above the fold** of the deep-dive report. On B only 13 of
   28 readers scroll as far as `Aksi Cepat` where it currently lives.

**The path of least resistance you asked for**, based on what actually happened:
land → natural-language finder (B) → results → deep dive in ~1 minute (both arms
already achieve this) → **track from a persistent tab, not a buried button (A)**.
The first three steps are solved. Only the fourth is broken, and only on B.

---

## 8. What this readout cannot tell you

- Desktop vs mobile behaviour (no device data outside logged-in sessions).
- Chrome extension interest (zero instrumentation).
- Spinner click vs dismiss (no dismiss event).
- "Mulai berjualan" click-through (no event, and A-only anyway).
- Real supplier demand (probe still admin-gated).
- Feedback rates (the feature was broken on both arms for most of the window).
- Anything about anonymous pre-signup behaviour — every `activity_events` row
  requires a signed-in user.

**And the sample is small.** n=75. Only the search gap and the tracking gap are
large enough to trust. The dive-rate and return-rate ties are genuine ties, not
"B slightly ahead" — do not read them as directional. The pre-committed decision
rule in `docs/AB_TEST.sql` (±10pp return gap at ~160 signups/arm) remains
unsatisfiable; at the current ~20 signups/week it would need roughly 8 more weeks.
