# Agent instructions (LarisID)

Before making product, copy, pricing, or policy changes, read **[MISSION.md](./MISSION.md)** and treat it as binding.

If a task would violate LarisID’s non-negotiables (access for all, honesty, no exploitation, philanthropic intent), **stop and flag it** instead of implementing it.

For UI and marketing copy, also follow the LarisID brand guide when available.

## SEO, static pages & AI discoverability

Before changing titles, competitor comparisons, pricing copy on the public site, or `llms.txt`, read **[docs/seo.md](./docs/seo.md)**.

- Static crawlable pages live at `perbandingan/`, `harga/`, `tentang/`, `cara-kerja/` (not inside the SPA).
- Competitor names (Datapinter, Tokpee, Shoptik) and prices must stay **factual** per `docs/pricing-research.md`; update `llms.txt` and `sitemap.xml` when facts change.
- New top-level static dirs must be added to `.github/workflows/deploy-pages.yml`.

## Supabase CLI

For `supabase db push` and other CLI commands, load credentials from **`supabase/.env.local`** (`SUPABASE_ACCESS_TOKEN`). See **`supabase/README.md`**. Never commit tokens or paste them into tracked files.
