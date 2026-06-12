# LarisID

**Riset produk Shopee untuk penjual Indonesia** — affordable data and clear guidance so sellers can build e-commerce businesses that last.

## Start here: mission & values

Everyone working on LarisID — engineers, designers, mentors, contributors, and AI tools — should read **[MISSION.md](./MISSION.md)** first.

It defines **what we are building, why, how, who is involved, and what we will not do**. If work would violate those principles, stop and raise a red flag before shipping.

## Repository overview

| Area | Location |
|------|----------|
| Web app | `index.html` (landing + dashboard SPA) |
| User journey funnel (onboarding, Discover → Deep Dive) | **`index.html`** — see **[docs/journey-funnel.md](./docs/journey-funnel.md)** |
| SEO / marketing pages | `perbandingan/`, `harga/`, `tentang/`, `cara-kerja/`, `llms.txt` — see **[docs/seo.md](./docs/seo.md)** |
| Shared static styles | `styles/seo-pages.css` |
| Privacy policy | `privacy/` |
| Supabase (DB, auth, edge functions) | `supabase/` — see [supabase/README.md](./supabase/README.md) |
| Deploy | GitHub Actions → GitHub Pages (`larisid.com`) |
| Sitemap | `sitemap.xml` (submit in Search Console) |

### Local docs (`docs/`)

| Doc | Use when |
|-----|----------|
| [journey-funnel.md](./docs/journey-funnel.md) | Changing onboarding, Discover defaults, tier gating, Beranda lobby, return loops |
| [journey-funnel-test.md](./docs/journey-funnel-test.md) | QA before shipping funnel changes |
| [seo.md](./docs/seo.md) | Public titles, comparisons, `llms.txt`, static marketing pages |
| [pricing-research.md](./docs/pricing-research.md) | Competitor pricing facts (must stay accurate on site) |
| [SCRAPER_TODO.md](./docs/SCRAPER_TODO.md) | Listing ingest / `total_sold` scraper work |

## Supabase

From repo root with the [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase db push
```

See [supabase/README.md](./supabase/README.md) for cohort setup, invites, and migrations.

## Brand & copy

Visual and voice guidelines: `LARISID_BRAND_GUIDE.md` (maintained separately). Mission and ethics: **always [MISSION.md](./MISSION.md)**.
