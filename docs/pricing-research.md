# LarisID — Pricing Research & Recommendation

> **⚠️ SUPERSEDED — historical document. Do NOT act on the paid-pricing recommendations below.**
>
> This report was written in **May 2026** when LarisID still had paid credit packs. In **June 2026** all paid packs (Starter/Growth), the per-credit price, and the `crBuy()` purchase stub were **removed** in favour of a 100%-free, earn-only model — commit `68dea63` and `supabase/migrations/20260605120000_monthly_credits_20_no_payment.sql`.
>
> **A freemium three-tier page (Free / Laris Pro Rp 149.000 / Laris Business Rp 399.000) shipped on the morning of 21 Aug 2026 and was RETRACTED the same day** as a MISSION.md §3 violation. **LarisID is 100% free for everyone, forever — there are no paid plans and none are planned.** Do not reintroduce prices, tiers, "Pro", or "Business" anywhere.
>
> Live model: Rp 0. A 10-new-searches/day quota exists purely as a server-cost guard (`_gpt_chat_limit`), currently uncapped for signed-in accounts via `public._beta_unlimited()` + `BETA_UNLIMITED` in `js/gpt-app.js`; tracking is 40 products / 20 stores for every account. Source of truth is `/harga/`.
>
> Nothing in this document — neither §A nor §§2–5 — is a live recommendation.
>
> The original paid-pack analysis (§§2–5 below) is kept **for historical reference only** and is **no longer the recommendation**. The genuinely still-useful part of this document is the **competitor market intelligence in §1** — that remains accurate and worth keeping. **§A. Current model (June 2026)** below is likewise historical now; see `/harga/` for what is actually live.

*Research report. No application code changed by this report. Read [MISSION.md](../MISSION.md) before acting on any of this.*

*Original date: May 2026. Author: research pass (Claude). Superseded: June 2026; superseded again August 2026 (Beta freemium).*

---

## A. Current model (June 2026) — what is actually live

LarisID charges **nothing**. There is no paid tier, no credit pack, no per-credit price, and no payment flow anywhere in the product.

- **100% free.** All paid packs (Starter Rp 25.000, Growth Rp 40.000) and the à-la-carte Rp 5.000/credit rate were removed. The `crBuy()` purchase stub was deleted; the credit-gate now links to the **earn-more** path, not a checkout.
- **20 free credits / month** (raised from 5), granted on the user's signup anniversary, expiring 30 days after grant. New users also start with a **balance default of 20**. See `grant_due_monthly_credits()` in the migration above.
- **Earn-only top-up.** Beyond the monthly grant, the only way to get more credits is the **earn-more loop**: 10 product searches via the Chrome Extension → 1 credit, repeatable up to 10/day (`search_completions`). This is now the *sole* path to extra depth — there is no cash alternative, by design.
- **Spend model unchanged.** 1 credit = 1 Deep Dive, OR 1 month of Tracker, OR 10 AI questions (`MLS_AI_PER_CREDIT = 10`).
- **Unlimited cohort unchanged.** Admins + the primary-mentor cohort bypass all gates (`_isUnlimited()`).
- **Brand promise:** "100% gratis" / "Kompetitor bayar 300rb/bulan. LarisID? Gratis." — now literally true, not aspirational. The Datapinter ~Rp 299.000/mo anchor (§1) is what makes that tagline accurate.

Everything from §2 onward predates this decision. Read it as *why we once considered charging*, not as a plan.

---

## 1. Competitor pricing table — ✅ STILL ACCURATE & USEFUL

*This is the part of the report worth keeping.* All figures are the best public data found May 2026. Indonesian tools publish little detail and lean on "contact us / WhatsApp"; treat soft numbers as indicative. USD converted at ~Rp 16.000.

> **✅ RE-VERIFIED 21 Aug 2026** — Datapinter, Tokpee and Shoptik figures below were read directly
> off their own pricing pages on that date and supersede the May 2026 estimates. Kalodata could not
> be verified at source (see its caveat).

| Tool | Type | Headline price (IDR/mo) | Billing | What you get | Free tier? |
|---|---|---|---|---|---|
| **Datapinter** ⭐ *closest competitor* | Subscription | **Rp 99.000 / Rp 299.000 / Rp 499.000 / Rp 2.999.000 per mo** (Go / Dasar / Pinter / Jenius) — **Rp 82.500 / Rp 149.167 / Rp 415.850 / Rp 2.499.200** billed annually | Fixed sub, monthly or annual toggle | Feature set comparable to LarisID (full product/market research, analytics), plus per-month download quotas (2.000 / 10.000 / unlimited products), Kata Kunci Shopee, Pasar Luar Negeri, Chrome extension for Shopee + Tokopedia. Top-up 10.000 download credits for Rp 200.000. The most direct, feature-equivalent rival. | **Yes** — Rp 0 tier with limited data and no downloads |
| **Tokpee** (tokpee.co) | Chrome extension | **Rp 113.999/mo** · **Rp 303.999/4 mo** (≈Rp 75.999/mo) · **Rp 455.999/yr** (≈Rp 37.999/mo) | Fixed sub, billed in blocks | Relatively basic Chrome extension — product research, export to Excel; Shopee + Tokopedia; claims real-time data. *Narrower scope than LarisID.* | No — 14-day money-back only |
| **Goleki** (Chrome ext.) | Subscription / daily | **~Rp 15.000/day ≈ Rp 450.000/mo** | Daily/period | Product research extension | Unclear |
| **Shoptik** (shoptik.id) | Subscription | **Rp 537.000/yr** (≈Rp 44.750/mo) — a standing "50% OFF" from a listed Rp 994.000 | Fixed sub, annual | Shopee **Indonesia + Malaysia** product research; unlimited real-time data, unlimited product analysis, unlimited data download; Chrome & Kiwi browser extension; 1 year of updates + support | No |
| **Shoper** (shoper.id) | Subscription | Not published ("Coba Gratis", WhatsApp for price) | Fixed sub | Chrome extension: hidden data (upload time, product age), price/age analysis, competitor "similar products" graphs | Free trial |
| **Shopdora** (shopdora.com) | Subscription (intl.) | **$29,9/mo ≈ Rp 478.000/mo** (Standard) | Fixed sub | 13+ features, 9+ markets incl. Indonesia: product research, keyword mining, price tracking, traffic analysis, AI listing gen. Advanced/Pro = contact sales. | Yes (limited) |
| **Zhixia / ShopeeData** | Subscription (intl.) | Not published in IDR | Fixed sub | Big-data product selection, analytics plugin | Limited |
| **Kalodata** (kalodata.com) ⭐ *TikTok Shop, not Shopee* | Subscription (intl., USD) | **Starter ~$45,90/mo ≈ Rp 734.000** · **Professional ~$99,90/mo ≈ Rp 1.598.000** *when billed annually*; ~$49,99 / ~$109,99 billed monthly | Fixed sub (monthly or annual) | TikTok Shop analytics: GMV by shop/product/category, creator & affiliate performance, video and livestream data. The market-share leader for TikTok Shop, and the most expensive tool on this list. | **No free plan** — limited-time trial only |

#### Kalodata detail (added 16 Aug 2026)

| Plan | Monthly | Annual | Limits |
|---|---|---|---|
| Starter | $49,99 | $499 | 50 searches/day, 10 tracked shops/creators, 100 detail views/day, 90d history |
| Professional | $109,99 | $1.099 | 250 searches/day, 500 tracked, 500 detail views/day, 180d history, 1 sub-account |
| Enterprise | ~$229–599 *(estimated)* | ~$2.299–5.999 *(estimated)* | Unlimited; 12+ months history; API |

IDR figures converted at ~Rp 16.000/USD, consistent with the rest of this table.

> **⚠️ Source caveat — verify before quoting.** Re-checked 21 Aug 2026: `kalodata.com/pricing`
> still returns **HTTP 403** to automated fetches and redirects a real browser to `/signup`, so the
> pricing page is login-walled. These figures come from third-party pricing reviews
> ([SimpTok](https://simptok.com/how-much-is-kalodata/),
> [tipsonblogging](https://tipsonblogging.com/2025/05/kalodata-pricing/)) and search results, not
> from the vendor page. Confirm manually on kalodata.com before treating any number as current.
> Per the repo rule, all published copy must hedge these as public estimates with the date.

**Positioning note:** Kalodata is **not** a Shopee tool and is not a like-for-like LarisID rival the
way Datapinter is. It owns TikTok Shop GMV/creator analytics — data LarisID does not have. The
honest comparison is the cost gap plus the overlap in *choosing what to sell* and *computing
margin after TikTok Shop commission*, which the LarisID fee calculator does cover. Keep the
"if you need TikTok creator/video GMV analytics, use Kalodata" concession in all copy.

### Takeaways (market intel — still valid)
- The **closest competitor is Datapinter, whose Dasar tier is Rp 299.000/mo** with a feature set comparable to LarisID. This **still validates the brand tagline "Kompetitor bayar 300rb/bulan"** — it is accurate against the most direct, feature-equivalent rival's mid tier. Tokpee (Rp 113.999/mo) is a relatively basic Chrome extension with narrower scope, so it is *not* the right comparison point.
- Everyone local is **flat subscription** with *unlimited* usage as the pitch. Datapinter is the only one with a permanent free tier, and it is deliberately data-limited. **LarisID being 100% free for the whole product is its sharpest differentiator.**
- **Where the paid tools genuinely win, and our copy must say so:** bulk Excel/CSV export (Tokpee, Datapinter, Shoptik, Kalodata — LarisID has none), real-time data (LarisID refreshes daily), Tokopedia listing data (Tokpee, Datapinter), Shopee Malaysia (Shoptik), and TikTok Shop creator/video/live GMV (Kalodata).
- **History depth and export volume** are the levers competitors charge for. LarisID gives these away inside the free credit allowance instead.
- Local willingness-to-pay is low and price-sensitive; Indonesia has ~65M MSMEs with thin margins and patchy digital-payment habits. This price-sensitivity is exactly why "free + earn credits by using the extension" lands better here than any paid plan would.

---

## ⛔ Sections 2–5 below are SUPERSEDED (May 2026 paid-model analysis)

The following four sections recommended a **paid** credit/token model. **That recommendation was rejected in June 2026 in favor of the 100% free, earn-only model described in §A.** They are retained only to document the reasoning that was considered and discarded. **Do not implement anything below.**

---

## 2. ~~Recommended free vs paid tiers~~ *(superseded — see §A)*

Guiding rule from MISSION: the free tier must be **genuinely useful on its own**. *(This principle survived — the resolution was simply to make the whole product free.)*

### FREE tier (original May 2026 proposal)
- **Unlimited Finder/search browsing** — no gate on basic discovery, sales-estimate listing, viability score.
- **5 free credits/month** *(now **20/month** — see §A)*, spendable on Deep Dive / Tracker-month / 10 AI questions each.
- **Earn-more loop kept and made prominent** — 10 extension searches = 1 credit, up to 10/day. *(This is now the only top-up path at all.)*
- **7-day history** (free depth at the time).
- **Save products / Tracker**: a free floor of saved products (~10).
- **Community access.**

### ~~PAID unlocks~~ *(removed June 2026 — there are no paid unlocks)*
The original table proposed money buying history depth (7 days → 1 month → 1 year), non-expiring credit packs, unlimited saved products, and bulk export. **None of this shipped as paid.** Depth is now reached via the monthly 20-credit grant plus the earn-more loop.

**Do not** gate: the viability score, basic sales estimates, or honest uncertainty/confidence indicators. *(This rule remains in force.)*

---

## 3. ~~Tokens-vs-plan decision~~ *(superseded — the answer became "neither; it's free")*

The May 2026 decision was to **keep a paid credit/token model** and avoid fixed subscriptions, optionally adding a low-cost "Langganan Hemat" auto-top-up. **In June 2026 this was overtaken entirely: no money changes hands at all.** The MISSION-alignment argument that drove the token choice (no traps, no held-hostage advice) was taken to its logical end — removing payment removes the trap risk completely.

The original tradeoff analysis (tokens felt like *pulsa/token listrik*, matched irregular UMKM cash flow, etc.) is preserved below for context but is moot now that there is no purchase.

*(Original tradeoff table and rationale omitted from action — see git history at/before commit `ec3dd4f` for the full text. Key surviving insight: prepaid/earn mechanics fit Indonesian seller psychology; that's why the **earn-credits** loop, not any paywall, is the top-up.)*

---

## 4. ~~Suggested IDR price points~~ *(superseded — all prices removed)*

The May 2026 plan set two non-expiring packs:

| Product | Price | Credits | Effective /credit | Status |
|---|---|---|---|---|
| Free | Rp 0 | 5/mo *(now 20/mo)* | — | ✅ Kept (and expanded to free-only) |
| ~~Starter Pack~~ | ~~Rp 25.000~~ | ~~25~~ | ~~Rp 1.000~~ | ❌ Removed June 2026 |
| ~~Growth Pack~~ | ~~Rp 40.000~~ | ~~50~~ | ~~Rp 800~~ | ❌ Removed June 2026 |

**Payment rails** (QRIS + GoPay/OVO/DANA + ShopeePay) are **no longer relevant** — there is no checkout. The landing page's "tanpa kartu kredit" boast is now subsumed by the broader "100% gratis" promise.

**Philanthropic lane:** the `_isUnlimited()` mentor-cohort bypass remains. With the product fully free, the proposed separate "hardship/access program" is largely redundant — everyone already gets the full product for free.

---

## 5. ~~MISSION red-flag check~~ *(historical — re-evaluate against the free model)*

The original check cleared a *paid* token model against MISSION. Under the **current free model**, every "paywall/trap" risk it weighed is **eliminated by construction**: there is nothing to pay for and nothing to revoke. The one item that still matters and remains enforced:

| Recommendation | MISSION principle | Status |
|---|---|---|
| Never gate viability score / sales estimates / uncertainty | §3 "data presentation that hides uncertainty to push a sale" | ✅ Still explicitly preserved. |
| Tagline "Kompetitor bayar 300rb/bulan. LarisID? Gratis." | §3 honesty | ✅ Now literally true (Datapinter ~Rp 299.000/mo anchor; see §1). |

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
- [Kalodata pricing (2026): every plan & cost — SimpTok](https://simptok.com/how-much-is-kalodata/) *(added Aug 2026)*
- [Kalodata pricing plans 2026 — tipsonblogging](https://tipsonblogging.com/2025/05/kalodata-pricing/) *(added Aug 2026)*
- [Kalodata review 2026 — WinningHunter](https://winninghunter.com/insights/kalodata-review/) *(added Aug 2026)*
</content>
</invoke>
