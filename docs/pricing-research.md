# LarisID — Pricing Research & Recommendation

*Research report. No application code changed. Read [MISSION.md](../MISSION.md) before acting on any of this — every recommendation below is checked against the non-negotiables in the final section.*

*Date: May 2026. Author: research pass (Claude).*

---

## 0. What already exists (verified in code)

Verified in `dist/scripts/app.js` (build mirror of inline JS in `index.html`) and the pricing UI in `index.html` (~line 4281+):

- **`user_credits` table** with a `balance` column, read in `loadCreditData()` (app.js ~2447).
- **Free grant: 5 credits/month**, renewed on the user's *signup anniversary* (not calendar month), via RPC `get_my_monthly_credit_status`; free credits **expire 30 days** after grant (`_renderMonthlyCreditSchedule()`, app.js ~2520). Copy: "5 kredit gratis / bulan".
- **Spend model**: `spend_credit` RPC (app.js ~2654). 1 credit = 1 Deep Dive, OR 1 month of Tracker, OR **10 AI questions** (`MLS_AI_PER_CREDIT = 10`, app.js ~2736). AI gate charges 1 credit at the *start* of each 10-prompt block (app.js ~2764).
- **Earn-more loop**: do 10 product searches via the Chrome Extension → earn 1 credit, repeatable up to 10/day (`search_completions` table; FAQ at index.html ~4384).
- **Unlimited cohort**: admins + primary-mentor-cohort members bypass all gates (`_isUnlimited()`, app.js ~2620). This is the philanthropic/mentorship channel already wired in.
- **Existing paid packs (currently stubbed)**: `crBuy()` only shows an alert pointing to WhatsApp (app.js ~2612) — **no live payment yet**. Landing page already advertises:
  - Free: Rp 0 — 5 credits/mo, Finder access, **7-day history**, community.
  - Starter Pack: **Rp 25.000 one-time** — 25 credits (~Rp 1.000/credit) + **1-month history unlock**.
  - Growth Pack: **Rp 50.000 one-time** — 50 credits + **1-year history unlock**.
  - À-la-carte rate shown: **Rp 5.000 / credit** single-unit.

**Key insight:** LarisID is *already* a credit (token) model, sold as non-expiring one-time packs, with history-depth as the headline unlock. The free monthly credits expire; purchased credits do not. This report builds on that, not from scratch.

---

## 1. Competitor pricing table

All figures are the best public data found May 2026. Indonesian tools publish little detail and lean on "contact us / WhatsApp"; treat soft numbers as indicative. USD converted at ~Rp 16.000.

| Tool | Type | Headline price (IDR/mo) | Billing | What you get | Free tier? |
|---|---|---|---|---|---|
| **Datapinter** ⭐ *closest competitor* | Subscription | **~Rp 299.000/mo** | Fixed sub | Feature set comparable to LarisID (full product/market research, analytics). This is the most direct, feature-equivalent rival. | Limited |
| **Tokpee** (tokpee.co) | Chrome extension | **~Rp 50.000/mo** (annual) / **~Rp 100.000/mo** (4-mo plan) | Fixed sub, billed in blocks | Relatively basic Chrome extension — product research, export to Excel; Shopee + Tokopedia. *Not a direct competitor — narrower scope than LarisID.* | Limited trial |
| **Goleki** (Chrome ext.) | Subscription / daily | **~Rp 15.000/day ≈ Rp 450.000/mo** | Daily/period | Product research extension | Unclear |
| **Shoptik** (shoptik.id) | Subscription | Not published (frequent "50% diskon" promo banners) | Fixed sub | Shopee product research | Unclear |
| **Shoper** (shoper.id) | Subscription | Not published ("Coba Gratis", WhatsApp for price) | Fixed sub | Chrome extension: hidden data (upload time, product age), price/age analysis, competitor "similar products" graphs | Free trial |
| **Shopdora** (shopdora.com) | Subscription (intl.) | **$29,9/mo ≈ Rp 478.000/mo** (Standard) | Fixed sub | 13+ features, 9+ markets incl. Indonesia: product research, keyword mining, price tracking, traffic analysis, AI listing gen. Advanced/Pro = contact sales. | Yes (limited) |
| **Zhixia / ShopeeData** | Subscription (intl.) | Not published in IDR | Fixed sub | Big-data product selection, analytics plugin | Limited |

### Takeaways
- The **closest competitor is Datapinter at ~Rp 299.000/mo** with a feature set comparable to LarisID. This **validates the brand tagline "Kompetitor bayar 300rb/bulan"** — it is accurate against the most direct, feature-equivalent rival. Tokpee (~Rp 50rb/mo) is a relatively basic Chrome extension with narrower scope, so it is *not* the right comparison point. No red flag on the tagline (resolved — see §5).
- Everyone local is **flat subscription** with *unlimited* usage as the pitch. Nobody sells credits/tokens. LarisID's token model is differentiated — for better (fairness) and worse (unfamiliarity).
- **History depth and export volume** are the real premium levers competitors charge for. LarisID already chose history-depth as its paid unlock — consistent with the market.
- Local willingness-to-pay is low and price-sensitive; Indonesia has ~65M MSMEs with thin margins and patchy digital-payment habits. Sub-Rp 50rb price points and one-tap e-wallet (GoPay/OVO/DANA/QRIS) matter more than plan elegance.

---

## 2. Recommended free vs paid tiers

Guiding rule from MISSION: the free tier must be **genuinely useful on its own** — enough that a seller with zero money can run a real product-research workflow, not a crippled demo.

### FREE tier (keep, and protect)
Must remain genuinely useful — this is a non-negotiable, not a funnel.
- **Unlimited Finder/search browsing** — no gate on basic discovery, sales-estimate listing, viability score. This is the "Tanpa Daftar · Langsung Pakai" promise; do not gate it.
- **5 free credits/month** (existing), spendable on Deep Dive / Tracker-month / 10 AI questions each.
- **Earn-more loop kept and made prominent** — 10 extension searches = 1 credit, up to 10/day. This is the genuine no-cash path to deeper features and the single most MISSION-aligned mechanic already in the product. A diligent seller with no money can earn their way to real depth. Keep it.
- **7-day history** (existing free depth).
- **Save products / Tracker**: keep a **free floor of saved products** (recommend **10 saved products free**) so a beginner can track a real basket without paying.
- **Community access.**

### PAID unlocks (what money should buy)
Money buys **depth and convenience**, never *access to truth*. A seller must never be in a position where the free advice is deliberately worse so they'll pay — only *less deep*.

| Lever | Free | Paid |
|---|---|---|
| Historical data depth | 7 days | 1 month → 1 year (existing Starter/Growth unlocks) |
| Credits (Deep Dive / Tracker / AI) | 5/mo + earn-more | Buy non-expiring packs |
| Saved products | 10 | Unlimited (or large cap) |
| AI chat | 10 questions / credit | Same rate, just more credits |
| Export (future) | — | Bulk export, matching Tokpee's lever |

**Do not** gate: the viability score, basic sales estimates, or honest uncertainty/confidence indicators. Hiding uncertainty to push a sale is explicitly out of scope per MISSION §3.

---

## 3. Tokens-vs-plan decision + rationale

**Decision: KEEP the credit/token model as the spine. Do NOT switch to a fixed access-tier subscription. Add ONE optional low-cost monthly "top-up" subscription as a convenience, not as a gate.**

### Tradeoffs

| | Tokens (buy & spend freely) | Fixed subscription tiers |
|---|---|---|
| Seller psychology (ID) | Feels like **pulsa/token listrik** — deeply familiar, pay-what-you-use, no lock-in. Low commitment fear. | Feels like a recurring bill — sellers with thin/seasonal cash flow resent auto-renew; churn anxiety. |
| Cash-flow fit | Pay Rp 5rb when you need it. Matches irregular UMKM income. | Forces monthly outlay even in a slow month. |
| MISSION fit | **Strong.** No "trapped" users — stop buying anytime, nothing auto-charges, no advice held hostage. | **Risk.** Auto-renew + access-revocation = the exact "paywall that traps users who can't afford to leave" MISSION warns against. |
| Revenue predictability | Lower / lumpier for LarisID. | Higher MRR. |
| Simplicity of messaging | "1 kredit = 1 riset" is crisp and already built. | "Which tier do I need?" friction. |
| Competitive contrast | Differentiated — nobody local does it; reinforces "fair, not greedy." | Me-too vs Tokpee, and we'd lose on unlimited. |

### Why tokens win here
1. **MISSION alignment is decisive.** Auto-renewing tiers that cut off access are the closest thing in this space to the "trap" pattern MISSION forbids. Non-expiring purchased credits mean a seller can stop spending with zero penalty and keep everything they bought. That is the honest, non-predatory default.
2. **Cultural fit.** Tokens map cleanly onto *pulsa* and *token listrik PLN* — the most normalized prepaid behaviors in Indonesia. Friction and fear are lowest.
3. **It's already built and shipped in the UI.** Lower execution risk; just wire real payment into `crBuy()`.
4. **Free tier stays clean.** With tokens, "free" isn't a degraded tier — it's the same product with a monthly credit allowance plus an earn-more path. No second-class users.

### The one subscription to consider (optional, opt-in)
A single **"Langganan Hemat"** auto-top-up: e.g. *Rp 39.000/mo → 50 credits + 1-year history kept active.* Strictly cheaper per credit than à-la-carte, **cancel anytime in-app in one tap**, **no access revoked on cancel** (credits already granted stay; only history-unlock lapses at period end with clear warning). Frame as a *discount for regulars*, never as the only road to depth. If it can't be made one-tap-cancellable and non-trapping, **don't ship it.**

---

## 4. Suggested IDR price points (the sweet spot)

Anchored below Tokpee's ~Rp 50.000/mo and tuned to UMKM price sensitivity. Keep the existing non-expiring-pack structure; adjust unit economics so small packs feel generous.

**FINAL pricing (decided by Steven, May 2026) — two packs, now live in `index.html`:**

| Product | Price | Credits | Effective /credit | Notes |
|---|---|---|---|---|
| **Free** | Rp 0 | 5/mo (expire 30d) + earn-more | — | Keep. Genuinely useful floor. |
| **Starter Pack** | **Rp 25.000** | 25 | **Rp 1.000** | "Paling Populer". Includes 1-month history unlock. |
| **Growth Pack** | **Rp 40.000** | 50 | **Rp 800** | +1-year history unlock; cheaper per-credit reward for the larger pack. |

Both packs are far below the closest competitor (Datapinter ~Rp 299rb/mo). The landing pricing section and the in-app credits page now both show exactly these two packs (previously the credits page sold credits at Rp 2.980–5.000 each — inconsistent, now fixed).

**Payment rails:** prioritize **QRIS + GoPay/OVO/DANA + ShopeePay**; these are how UMKM actually pay. Avoid card-only checkout (MISSION access concern — many sellers have no card; the landing page already brags "tanpa kartu kredit").

**Philanthropic lane (MISSION §4):** keep the existing `_isUnlimited()` mentor-cohort bypass and add an explicit **hardship/access program** — free credit grants for verified students, mentees, or sellers in distress, surfaced as a real, non-hidden offer.

---

## 5. MISSION red-flag check

| Recommendation | MISSION principle | Status |
|---|---|---|
| Token model, non-expiring purchased credits, cancel-anytime | §3 "never predatory", "paywalls that trap" | ✅ Compliant — chosen *because* it avoids the trap. |
| Free tier = unlimited Finder + 5 credits/mo + earn-more + 7-day history + 10 saved | §1 "for anyone and everyone", §4 free tier | ✅ Genuinely useful without paying. |
| Earn-more loop kept prominent | §4 philanthropic, §1 no artificial restriction | ✅ No-cash path to depth. |
| Never gate viability score / sales estimates / uncertainty | §3 "data presentation that hides uncertainty to push a sale" | ✅ Explicitly preserved. |
| QRIS/e-wallet first, no card-only | §1 access for all | ✅ Inclusive. |
| Hardship/access program | §4 philanthropic by intent | ✅ Recommended to make explicit. |

### ✅ Tagline accuracy — RESOLVED (no red flag)
The brand tagline **"Kompetitor bayar 300rb/bulan. LarisID? Gratis."** is **accurate**. The closest, feature-equivalent competitor is **Datapinter (~Rp 299.000/mo)** — confirmed by Steven. Tokpee (~Rp 50rb/mo) is a relatively basic Chrome extension with narrower scope and is not the right comparison. The tagline is honest under MISSION §3; no change needed.

---

## Sources
- [Temukan Ide Bisnis dengan Tools Riset Produk Shopee — Paper.id](https://www.paper.id/blog/smb/tools-riset-produk-shopee/)
- [Tokpee — Tools Riset Produk Shopee & Tokopedia](https://tokpee.co/)
- [Tokpee review — lionelcargo.com](https://lionelcargo.com/tokpee-tools-riset)
- [Shoptik — Riset Produk Shopee](https://shoptik.id/)
- [SHOPER — Tool Riset Produk Shopee](https://www.shoper.id/)
- [Goleki — Tool Riset Produk Shopee (Chrome Web Store)](https://chromewebstore.google.com/detail/goleki-%E2%80%94-tool-riset-produ/oaghaljnegkeijkkgccnbmdbofphjpag)
- [Best Shopee Analytics Tools 2026 — Shopdora blog](https://blog.shopdora.com/en/page/best-shopee-analytics-tools-in-2026-complete-guide-comparison/)
- [Shopdora pricing](https://www.shopdora.com/price)
- [Shopdora Review 2026 — selleraihub](https://selleraihub.com/shopdora-review-shopee-sellers/)
- [Unlocking opportunities in Indonesia — Antom](https://knowledge.antom.com/unlocking-opportunities-in-indonesia-southeast-asias-largest-digital-payments-market)
- [Impact of Subscription Models on Consumer Spending in Indonesia — Snapcart](https://snapcart.global/the-impact-of-subscription-models-on-consumer-spending-habits-in-indonesia/)
