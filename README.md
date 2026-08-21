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
| Deploy | Contabo Caddy (`larisid.com`) + Cloudflare Pages (`larisid.pages.dev`) — `bash scripts/deploy-static.sh` |
| Sitemap | `sitemap.xml` (submit in Search Console) |

### Local docs (`docs/`)

| Doc | Use when |
|-----|----------|
| [journey-funnel.md](./docs/journey-funnel.md) | Changing onboarding, Discover defaults, tier gating, Beranda lobby, return loops |
| [journey-funnel-test.md](./docs/journey-funnel-test.md) | QA before shipping funnel changes |
| [seo.md](./docs/seo.md) | Public titles, comparisons, `llms.txt`, static marketing pages |
| [pricing-research.md](./docs/pricing-research.md) | Competitor pricing facts (must stay accurate on site) |
| [SCRAPER_TODO.md](./docs/SCRAPER_TODO.md) | Listing ingest / `total_sold` scraper work |
| [BRAND_V2_PHOENIX.md](./docs/BRAND_V2_PHOENIX.md) | Logo lockups, color schemes, paint text, voice |

## Architecture

LarisID is a **static site** — *not* an Astro or Next build, despite the `LarisID-astro` directory name (a vestige of an abandoned Astro migration). There is no `package.json`, bundler, or framework runtime: pages are plain HTML and the app is vanilla JS.

- **App + landing:** `index.html` + `js/laris-app.js` (Supabase auth/data, dashboard). `js/lp-scroll-story.js` drives the GSAP scroll animation; `js/perf-loader.js` lazy-loads Supabase/Chart.js on demand.
- **Generated content pages:** `/riset/`, `/perbandingan/`, `/panduan/` are produced by `scripts/build-seo-pages.mjs`, `build-comparisons.mjs`, and `build-guides.mjs` from the data in `scripts/seo-*.json`. **Edit the generators, not the generated HTML.**
- **Deploy:** GitHub Pages is **retired**. Ship with `bash scripts/deploy-static.sh` (Contabo serves `larisid.com`; Cloudflare Pages mirrors at `larisid.pages.dev`). Keep `scripts/assemble-site.sh` in sync when adding top-level static dirs. CI workflow: `.github/workflows/deploy-pages.yml` (needs Cloudflare + Contabo secrets once GitHub Actions is available again).
- **Images:** keep web assets as **WebP** (convert with Pillow / `cwebp`). Only files referenced by `index.html`, the generators, or CSS belong in `images/` — everything else is dead weight that ships on every deploy.
- **Not committed / regenerable:** `node_modules/`, `dist/`, `.astro/`, `.venv-*/` are git-ignored build/tooling cruft — safe to delete locally.

### Possible future: Astro for content pages (optional, deferred)

If the generated pages outgrow the `.mjs` string-template approach, the natural next step is to adopt **Astro for those pages only**: convert the `build-*.mjs` generators into Astro page templates sharing one `BaseLayout` (head/SEO/nav/footer/JSON-LD), and add `@astrojs/sitemap` + `@astrojs/image` for automatic sitemaps and responsive WebP/AVIF. Leave `index.html` and the SPA untouched. This reintroduces a build step (and `node_modules`) — intentionally deferred.

## Database (Contabo self-host)

Live API: **`https://api.larisid.com`**. Do **not** `supabase db push` — the cloud
project is gone. Apply SQL and functions on the VPS:

```bash
bash scripts/apply-selfhost.sh supabase/migrations/<file>.sql
bash scripts/deploy-function-selfhost.sh <slug>
```

See **[docs/self-host.md](./docs/self-host.md)** and [supabase/README.md](./supabase/README.md).

## Brand & copy

Visual and voice guidelines: **[docs/BRAND_V2_PHOENIX.md](./docs/BRAND_V2_PHOENIX.md)**. Mission and ethics: **always [MISSION.md](./MISSION.md)**.
