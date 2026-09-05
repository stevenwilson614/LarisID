# Agent instructions (LarisID)

Before making product, copy, pricing, or policy changes, read **[MISSION.md](./MISSION.md)** and treat it as binding.

If a task would violate LarisID’s non-negotiables (access for all, honesty, no exploitation, philanthropic intent), **stop and flag it** instead of implementing it.

For UI and marketing copy, follow **[docs/BRAND_V2_PHOENIX.md](./docs/BRAND_V2_PHOENIX.md)** (logo lockups, four color schemes, paint text, voice).

## Dashboard SPA: onboarding & journey funnel

The logged-in product UI lives in **`index.html` + `js/gpt-app.js`** (not Astro routes, not `laris-app.js`). Before changing first-login flow, Cari Produk / Deep Dive, Beranda, nav gating, or return-loop copy:

1. Read **[docs/journey-funnel.md](./docs/journey-funnel.md)** — live `state.onboarding` steps, `#home-finder`, `#prefs-drawer`, Pantauan nudge, `user_journey_stats`.
2. Run through **[docs/journey-funnel-test.md](./docs/journey-funnel-test.md)** for regressions.
3. Apply related migrations **on Contabo** with `bash scripts/apply-selfhost.sh supabase/migrations/…` — see [docs/self-host.md](./docs/self-host.md). Never `supabase db push --linked`.

**Do not** reintroduce a blocking popup for onboarding. **Do not** fabricate price/sales deltas in return strips. Leaders and platform admins bypass journey gating.

Cari Produk shows **listing rows** (photo, harga, omset, unit, review, usia) with **Peta Peluang** above (`list:false` — the table is the list). Keyword chips filter both. Deep Dive is **PRODUK-only**; keyword-grain entries (tracker, `#home-first-dd`, Langkah, terlaris minggu) open that keyword's top listing. **Bandingkan Pasar** is retired from Cari Produk and lives only in the chat `handleBandingkanIntent` path — see **[docs/pasar-compare.md](./docs/pasar-compare.md)**. Before changing Skor Mudah Masuk weights (still used by that chat board), read that doc. Never add a hard filter on that score. Also **[docs/peta-peluang.md](./docs/peta-peluang.md)** and **[docs/pasar-compare.md](./docs/pasar-compare.md)**.

## "Terlaris Minggu Ini" badge

Before changing badge thresholds, the weekly measurement window, the growth-percentage definition, or the `terlaris_minggu` composer intent, read **[docs/terlaris-minggu.md](./docs/terlaris-minggu.md)**.

Our scrapes land **12-17 days apart**, not weekly. Weekly units are span-normalised to a 7-day rate in `mv_keyword_weekly`; never present a raw two-snapshot delta as "minggu ini". Re-tune with `node scripts/weekly-badge-calibrate.mjs` (read-only) and record the change in that doc.

## Weekly snapshot + next-week forecast

Before changing card omset, Deep Dive trend forecasts, or the post-scrape refresh order, read **[docs/listing-weekly.md](./docs/listing-weekly.md)**.

One estimator (`product_velocity` / `velocity_at`): cards show `price * v_hat * 30`; weekly rows are the 7-day sum. Label `measured` as terukur and everything else as perkiraan. Do **not** revive `weekly_snapshots` (frozen 2026-06-08) or reconstruct omset as `price * delta * 4`.

## SEO, static pages & AI discoverability

Before changing titles, competitor comparisons, pricing copy on the public site, or `llms.txt`, read **[docs/seo.md](./docs/seo.md)**.

- Static crawlable pages live at `perbandingan/`, `harga/`, `tentang/`, `cara-kerja/` (not inside the SPA).
- Competitor names (Datapinter, Tokpee, Shoptik) and prices must stay **factual** per `docs/pricing-research.md`; update `llms.txt` and `sitemap.xml` when facts change.
- New top-level static dirs must be added to `scripts/assemble-site.sh` (and redeployed with `bash scripts/deploy-static.sh`).

## Live database (Contabo)

The app uses **`https://api.larisid.com`**, not Supabase Cloud. Schema and edge
functions live on the Contabo VPS. **Never** `supabase db push --linked` or a
cloud `SUPABASE_ACCESS_TOKEN` — the old project `bzmvlraziqevqdyotvgy` is gone.

- SQL: `bash scripts/apply-selfhost.sh supabase/migrations/<file>.sql`
- Edge function: `bash scripts/deploy-function-selfhost.sh <slug>`
- Full notes: **[docs/self-host.md](./docs/self-host.md)** and [supabase/README.md](./supabase/README.md)

Never commit tokens, `.env`, or SSH private keys. Never paste service-role JWTs into tracked SQL.

## Shopee scraper (separate repo)

Scrapes run on Macs and push to self-host `https://api.larisid.com` (Contabo).
Canonical docs and dual-laptop agent rules live in the private scraper repo — **not** here:

- https://github.com/stevenwilson614/shopee_scraper  
- Start at `README.md` → `docs/AGENTS.md` → `docs/ARCHITECTURE.md`  
- Dual-host day5: `docs/DUAL_LAPTOP.md` (A = batches 1–17, B = 18–34)

After scraper code/doc changes: commit + push that repo; on the other laptop run `git pull` before scraping. Do not run Chrome CDP scrapes on the Contabo VPS by default.

## Shopee Live + Affiliate data

Not collected. Feasibility only: **[docs/live-affiliate-research.md](./docs/live-affiliate-research.md)** (scraper spike: `~/shopee_scraper/docs/LIVE_AFFILIATE_SPIKE.md`). Do not ship affiliate headcounts or live GMV as terukur. Do not start collectors or schema until that brief’s go/no-go and legal/ops gates are accepted.
