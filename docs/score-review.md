# Viability Score Review — Are we throwing away good products under 70?

> **Historical.** Score functions now live in `js/gpt-app.js` (not `dist/scripts/app.js` or `laris-app.js`). The size-vs-growth finding still stands.


*Research only. No application code changed. Author: AI research pass, 2026-05-30.*
*Binding context: [MISSION.md](../MISSION.md) — no ranking people into "losers," protect the party with less power (the seller).*

This answers the product owner's question: *"Below 70 people just ignore — but we don't want a product thrown away just because of a low score. Are there aspects of the score that would change minds? How do we make scoring accurate and truly best for NEW sellers?"*

Code studied: `calcListingScore()` and `calcLarisScore()` in `index.html` (~line 19471 / 9577) and the build mirror `dist/scripts/app.js` (line 9641 / 9577).

---

## Current formula audit

### `calcListingScore()` → total 0–100
| Sub-score | Max | What it measures | Direction |
|-----------|-----|------------------|-----------|
| `kwScore` (keyword ease) | 30 | `calcLarisScore × 0.30` — how easy the *market* is to enter | structural, good |
| `salesScore` | 25 | this listing's **sales percentile within its keyword** | **rewards already-winning listings** |
| `revScore` (review efficiency) | 25 | `effScore` (sold/review ≤15) + `barScore` (low review count ≤10) | proxy for "winnable" |
| `omsetScore` (revenue opportunity) | 20 | `log10(price×sold/12)` scaled to Rp 50M/mo | rewards big absolute revenue |
| `trendScore` | ±10 | listing or keyword trend × 0.33, capped | momentum nudge |

### `calcLarisScore()` → "market ease" 0–100 (feeds 30% of total)
Entry bar vs 0.5% target (35) · review moat (30) · top-10 concentration (20) · price accessibility (15) · keyword trend (±10). This half is **well-designed for new sellers**: every factor rewards *winnable* markets (low entry bar, thin review moats, un-concentrated demand, accessible price). No complaint here.

### The structural problem: half the total points reward incumbents, not opportunity
`salesScore` (25) + `omsetScore` (20) = **45 of 100 points reward a listing for already being big.** A brand-new seller cannot have high `total_sold` yet, and a genuinely good *un-entered* niche will, by definition, have modest current sales and modest current revenue. So the total score systematically **scores the opportunity by how crowded/mature it already is** — the opposite of what a new seller needs.

We tested this against the live DB (see backtest below) and it is not hypothetical: **listings in the bottom sales-percentile bucket grew +186% over 4 weeks and 74% of them grew; the top bucket grew +5.7% and only 24% grew.** The thing `salesScore` rewards most (high sales percentile) is the thing that empirically grows *least* going forward. For a new-seller tool, `salesScore` as written is partly inverted.

---

## Where good products get under-scored

A niche product can be excellent for a new seller yet land well below 70 because the points it loses are points it *structurally cannot earn yet*:

1. **High `kwScore` (easy market) but low `salesScore`** — the ideal new-seller scenario (open, winnable market where nobody is huge yet) caps `salesScore` low precisely *because* no listing dominates. The score punishes the opportunity for being un-exploited.
2. **High `omsetScore` driving a misleadingly high score on a bad market** — a saturated keyword with one Rp-50M/mo monster lifts `omsetScore` to 20 even though a beginner has near-zero chance there. So `omsetScore` can both *hide* good niches and *flatter* bad ones.
3. **Low `revScore` from a high review count that reflects market age, not this seller's prospects** — `barScore` zeroes out once peers cross ~300 reviews, dragging the total down on established categories that a differentiated new entrant could still win.
4. **`trendScore` only ±10 and often null** — when trend data is missing it contributes 0, so a fast-rising small product gets no credit and reads as "low."

Net effect: a product can have **market-ease 80 (very winnable) and still total in the 50s** because it hasn't accumulated sales/revenue. Under a "ignore anything under 70" habit, that product gets discarded — exactly the failure the owner fears.

---

## Surfacing sub-scores (the "reasons that change minds")

Good news first: **70 does not hide anything today.** Confirmed across `index.html` — every `>= 70` is cosmetic (badge/text color green vs amber vs red, the `recText` wording, "Produk Score 70+" count). The only hard filters are the *user-set* `min_score`/`max_score` inputs in the product database. So the "throwing away" is a **human habit, not a code rule** — which means the fix is presentation, not gatekeeping.

The deep-dive already shows `total` plus `larisScore` ("Pasar: 80/100 · Mudah Masuk"). It does **not** show the other four sub-scores. Recommendation — surface the full breakdown wherever the total appears, so a low total carries its own counter-argument:

1. **Always render the five sub-bars next to the total** (kwScore /30, salesScore /25, revScore /25, omsetScore /20, trendScore ±10), each with a one-line plain-Indonesian meaning. A 55 that is "market-ease 28/30, revenue 4/20" reads as *"easy to enter, just small money for now"* — not *"bad."*
2. **Add a "Why this might still be worth it" line** that fires when total < 70 **but** any structural sub-score is strong — e.g. `kwScore ≥ 24` (market ease ≥ 80) or `revScore ≥ 18` (very winnable on reviews). This is the explicit "change your mind" surface the owner asked for.
3. **Split the headline into two numbers: "Mudah dimasuki" (market ease) and "Sudah ramai" (current size).** New sellers care far more about the first. Showing one blended number invites the "<70 = skip" reflex.
4. **Never show a bare red badge with no reason.** Per MISSION, a low number with no explanation makes a beginner feel small. Always pair the color with the *why* and a next action.

These are presentation changes; they need product sign-off but violate nothing in MISSION.

---

## Accuracy / backtest plan

The DB supports a real backtest **today** — no new instrumentation needed. `listings` is panel data: the same `(item_id, shop_id)` reappears across **27 scrape dates spanning 2026-04-08 → 2026-05-26**. Large clean snapshots exist on 2026-04-24 (~54k unique listings) and 2026-05-23 (~30k), ~4 weeks apart.

### Design
1. **Score at T0** using only T0-snapshot data (compute `calcListingScore` per listing against its keyword peers from the same snapshot — mirror the JS in SQL or a small Python/Node script reading via REST/MCP).
2. **Measure forward outcome at T1** = later `total_sold` growth: absolute `s1 − s0`, relative `(s1−s0)/s0`, and a binary "grew meaningfully" (e.g. relative growth ≥ some threshold). For new-seller relevance prefer **relative growth and P(grew)** over absolute units (absolute is dominated by incumbents).
3. **Correlate** T0 score (and each sub-score separately) with the T1 outcome — Spearman rank correlation + decile lift chart. Repeat across several T0→T1 pairs (the 27 dates give many) to avoid a one-window fluke.
4. **Per-sub-score ablation**: correlate `kwScore`, `salesScore`, `revScore`, `omsetScore`, `trendScore` individually against forward *relative* growth. Re-weight the formula toward whichever sub-scores actually predict new-entrant-relevant growth; shrink or invert those that don't.
5. **New-seller cohort, not all sellers**: restrict the outcome to listings that *started small* at T0 (e.g. bottom 2 sales quintiles) — those are the ones a beginner actually competes as. Optimize the score to predict *their* success, not the whole market's.

### Sanity query already run (T0 = 2026-04-24, T1 = 2026-05-23, ~8.1k matched listings)
Bucketed by **early sales percentile within keyword** (what `salesScore` rewards), measuring 4-week forward growth:

| Sales-percentile bucket | n | avg start sold | avg 4wk growth | % that grew | avg **relative** growth |
|---|---|---|---|---|---|
| 1 (bottom 20%) | 1948 | 463 | 110 | **73.8%** | **+186%** |
| 2 | 1542 | 1204 | 136 | 70.2% | +29% |
| 3 | 1567 | 3017 | 314 | 57.4% | +16% |
| 4 | 1528 | 7273 | 452 | 42.1% | +9.5% |
| 5 (top 20%) | 1546 | 42420 | 1227 | 24.0% | **+5.7%** |

**Finding:** forward growth probability and relative growth are **monotonically inverse** to current sales percentile. The lower-sales listings are far more likely to grow and grow much faster in percentage terms. The current `salesScore` (25 pts for *high* percentile) therefore points the wrong way for the new-seller goal. Absolute units still favor incumbents (top bucket +1227), which is exactly why the formula should optimize on **relative/probability** outcomes, not absolute.

Caveat: one window, sales-percentile only (not the full composite score), and `total_sold` is a lifetime cumulative counter (regression-to-mean and counter mechanics inflate small-base relative growth). Treat as directional evidence that motivates the full backtest — not a final re-weighting.

---

## Threshold recommendation

**Do not turn 70 into a filter, and soften it as a label.**

- **Keep all products visible at every score.** Sorting/searching by score is fine; *hiding* by score is not. (Already true in code — keep it that way and resist requests to add a hard cutoff.)
- **Replace the single pass/fail feel of 70** with the two-number split (market ease vs current size) plus the sub-score breakdown, so "62" reads as a profile, not a rejection.
- **Add a "hidden gem" surface**: low total + high market-ease (or high review-winnability) should get an affirmative callout, not a red badge. This is the concrete "change minds" feature.
- **Re-weight after the backtest**, almost certainly *down*-weighting `salesScore` for new sellers (or making it reward the *sweet-spot* middle, not the top) and treating `omsetScore` as market-size context rather than a quality point. Don't re-weight on the one sanity window alone — run step 3–5 first.

So: yes, some products genuinely *are* hard for a beginner — but "hard market" should be communicated as *strategy needed*, never as *this product is a loser*.

---

## MISSION check

- **"No shaming, no ranking people into losers, no designs that make users feel small."** A bare sub-70 red badge with no reason does exactly this to a beginner. Surfacing sub-scores and a "still worth it" reason is the MISSION-aligned fix. ✅ (and a red flag against any future hard <70 filter).
- **"Honest, never predatory; don't hide uncertainty to push a sale."** The backtest finding — that our headline sub-score (`salesScore`) currently mispredicts new-seller success — is something we are obligated to correct, not paper over. Showing the breakdown *increases* honesty. ✅
- **"Affordable, accurate data + brilliant interpretation; protect the party with less power."** The new seller has less power than the established top-10. A score that rewards incumbency quietly steers beginners toward unwinnable crowded markets — the opposite of protection. Re-weighting toward winnable, growing niches serves the seller. ✅
- **Red flag raised:** the current 45/100 points tied to existing size/revenue, combined with the human "<70 = skip" habit, can push new sellers *away from* the exact low-competition niches where the data says they grow fastest. Recommend prioritizing the sub-score surfacing + the backtest-driven re-weighting before any marketing leans harder on the "70+" number.
