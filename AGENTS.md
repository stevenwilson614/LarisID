# Agent instructions (LarisID)

Before making product, copy, pricing, or policy changes, read **[MISSION.md](./MISSION.md)** and treat it as binding.

If a task would violate LarisID’s non-negotiables (access for all, honesty, no exploitation, philanthropic intent), **stop and flag it** instead of implementing it.

For UI and marketing copy, follow **[docs/BRAND_V2_PHOENIX.md](./docs/BRAND_V2_PHOENIX.md)** (logo lockups, four color schemes, paint text, voice).

## Dashboard SPA: onboarding & journey funnel

The logged-in product UI lives in **`index.html`** (not Astro routes). Before changing first-login flow, Discover defaults, Deep Dive beginner mode, Beranda lobby, nav gating, or return-loop copy:

1. Read **[docs/journey-funnel.md](./docs/journey-funnel.md)** — tiers, key functions, localStorage + Supabase tables.
2. Run through **[docs/journey-funnel-test.md](./docs/journey-funnel-test.md)** for regressions.
3. Apply related migrations via `supabase db push` (`user_onboarding_prefs.seller_status`, `user_journey_stats`) — see [supabase/README.md](./supabase/README.md).

**Do not** reintroduce a blocking popup for onboarding; keep the 3-step flow in Discover. **Do not** fabricate price/sales deltas in return strips. Leaders and platform admins bypass journey gating.

## SEO, static pages & AI discoverability

Before changing titles, competitor comparisons, pricing copy on the public site, or `llms.txt`, read **[docs/seo.md](./docs/seo.md)**.

- Static crawlable pages live at `perbandingan/`, `harga/`, `tentang/`, `cara-kerja/` (not inside the SPA).
- Competitor names (Datapinter, Tokpee, Shoptik) and prices must stay **factual** per `docs/pricing-research.md`; update `llms.txt` and `sitemap.xml` when facts change.
- New top-level static dirs must be added to `.github/workflows/deploy-pages.yml`.

## Supabase CLI

For `supabase db push` and other CLI commands, load credentials from **`supabase/.env.local`** (`SUPABASE_ACCESS_TOKEN`). See **`supabase/README.md`**. Never commit tokens or paste them into tracked files.
