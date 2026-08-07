# Most recent ads run — Jul 29 → Aug 7 2026

**The run starts Jul 29, not Aug 1.** Paid signups are zero Jul 23–28, then
resume Jul 29 and run continuously for 10 days. Google-tagged landing traffic
appears in `page_views` on exactly the same day.

**Cohort: A = 29, B = 19 (n=48).** 29 of those 48 came straight from the ads.

## Why this window is worth reading despite the smaller sample

Every confound from the earlier readout closed just before it:

| Fix | Date |
|---|---|
| Arm B page-view logging repaired | Jul 29 |
| Prize wheel live on both arms | Jul 30 |
| Pantauan Harian tracker live on both arms | Jul 31 |
| `page_views.ab_variant` column added | Jul 31 |

So this is the **first window where both arms are instrumented symmetrically and
have the same features**. Half the sample, but far cleaner — and it does not
contradict the Jul 17 readout, it sharpens it.

---

## 1. Findings

| | Arm A | Arm B |
|---|---|---|
| Landing visitors | 172 | 137 |
| Bounce (single page view) | 78.5% | 80.3% |
| **Landing → signup** | **16.9%** | 13.9% |
| Signups | 29 | 19 |
| Ever searched | 58.6% | **94.7%** |
| Ever opened a deep dive | 82.8% | 73.7% |
| Opened 2+ deep dives | 69.0% | 73.7% |
| Median events per user | 32 | **57** |
| Median minutes to first deep dive | 1.2 | 1.3 |
| **Ever tracked a product** | **31.0%** | **0.0%** |
| Returned on a 2nd day | 20.7% (6) | 15.8% (3) |
| Hit the daily wall | 37.9% (11) | 36.8% (7) |
| …came back after hitting it | 1 of 11 | **0 of 7** |

**Arm B tracked exactly zero products in this window.** Not "few" — zero rows in
`user_tracked_products` from 19 users over 10 days, while A produced 21 rows from
9 users. The one B tracker in the full-window data signed up before Jul 29.

At n=48 only two differences are large enough to trust: **tracking** (9/29 vs 0/19)
and **search participation** (17/29 vs 18/19). Both hold at roughly p<0.01. The
conversion gap (16.9% vs 13.9%), the dive-rate gap, and the return gap are all
inside the noise at this sample size — do not act on them.

## 2. The mechanism, confirmed again

B's report is read. In this window alone, 19 of 19 B users who scrolled reached
`skor` and `tren`, 18 reached `harga` and `kompetitor`, 14 reached `aksi_cepat`.

**Only 3 users clicked `track_cta`.** It is the single least-used element of a
report that people otherwise read end to end. A, meanwhile, converts 31% of
signups into trackers with a median time-to-track of 6.8 minutes.

This is now measured twice, in two windows, with the second window having both
arms on identical tracker code. It is a design problem, not a data problem.

## 3. The wall got worse

37.9% of A and 36.8% of B hit the daily limit in this run — up from ~30% and ~28%
across the full window. Of the 18 people who hit it, **1 came back.**

The prize wheel is not rescuing them. It was shown to 19 of 29 A users and 16 of
19 B users; only 8 and 6 respectively took a prize. B shows the wheel to 84% of
its users and still recovers nobody.

## 4. Measurement bug found in this run

The ad's final URL has UTM parameters hardcoded **and** Google Ads appends its own,
so every landing URL carries two sets:

```
/gpt/?utm_source=google&utm_medium=cpc&utm_campaign=ab_gpt_jul26
     &utm_source=google&utm_medium=cpc&utm_campaign=ab_split_aug26&gad_source=1
```

The attribution capture keeps the **first** occurrence, so all 29 paid signups are
stored as `ab_gpt_jul26` when the campaign actually running is **`ab_split_aug26`**.
It appears in 30 rows of raw metadata but never in the `utm_campaign` field.

This does not corrupt the A/B comparison — arm assignment is independent of UTMs —
but campaign-level reporting is naming the wrong campaign, and it will silently
merge this run with the July one. Fix by removing the hardcoded UTMs from the ad's
final URL and letting Google's tracking template supply them.

## 5. Where the traffic came from

| Source | A | B | Total |
|---|---|---|---|
| Google Ads | 20 | 9 | **29** |
| "internal" (the A/B redirect) | 0 | 10 | 10 |
| Google organic | 3 | 0 | 3 |
| ChatGPT | 2 | 0 | 2 |
| Direct | 2 | 0 | 2 |
| Other | 2 | 0 | 2 |

Ads are 60% of this run's signups. The 10 "internal" B rows are the `/` → `/gpt/`
redirect overwriting `document.referrer`, not a real channel — B's true organic
and ChatGPT origins are unrecoverable, so the non-paid rows here are arm-A-biased.

## 6. Demand in this run

**Categories:** Olahraga (14 users), Fashion (7), Rumah (5), Hewan peliharaan (5).
**Cities:** Bandung (20), Jakarta (12), Surabaya (4), Tangerang (4).

Same shape as the full window — Bandung dominates and sport has overtaken fashion.
Most of this telemetry comes from arm B, which is the only arm that emits category
and city events.

---

## 7. What to do

1. **Move the track CTA out of `aksi_cepat`.** Two windows, two instrumented
   arms, same result: B's report is read thoroughly and its track button is not
   reached. Give the merged site a persistent tracker destination like A's.
2. **Fix the limit wall before spending more on ads.** You are paying to acquire
   users, 37% of them hit a ceiling, and 1 in 18 survives it. That is the highest
   leverage fix in this dataset, and it is arm-independent.
3. **Strip the hardcoded UTMs from the ad final URL** so campaign reporting stops
   attributing `ab_split_aug26` traffic to `ab_gpt_jul26`.
4. **Do not merge on conversion yet.** A's 16.9% vs B's 13.9% is 5 signups of
   difference. Keep the split running; only tracking and search participation are
   decided.
