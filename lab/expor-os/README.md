# LarisExpor OS lab (offline)

Side project. **Not deployed.** Builders write only under `lab/expor-os/`. They never call `scripts/build-expor.mjs` and never `bash scripts/deploy-static.sh`. Graduation to live `/expor/` is a separate, explicit project.

Kartu ekspor = demand + US entry risk + landed-cost estimate + importer roll (if licensed) + channel playbook + checklist. Bahasa, same honesty rules as [docs/expor-app.md](../../docs/expor-app.md) and [MISSION.md](../../MISSION.md).

## Honesty (binding)

- Amazon omset is always **perkiraan** (`price × bought_past_month` badge floor). Never Jungle Scout / BSR unit models.
- Amazon has **no country-of-origin field**. Never label an ASIN as made-in-Indonesia.
- Duty / HTS classification is an **estimate**, not a customs ruling.
- US import notes are curated starting points, not legal advice.
- Named US importers come only from a **licensed BOL CSV**. Do not invent names. Until a subscription exists the section stays empty.
- Freight numbers are ballpark defaults from `js/amazon-fees.js`, not a forwarder quote.
- Lab HPP defaults are a **scenario**, not the seller’s cost.

## Layout

```
lab/expor-os/
  build-kartu.mjs
  kartu/<slug>/index.html     # generated; open locally
  data/                       # curated JSON (tracked)
  collectors/                 # fetch / ingest / validate
  lib/                        # shared helpers
  _raw/                       # gitignored dumps (HTS pulls, BOL CSVs)
```

## Pilot set (20)

See [data/pilots.json](data/pilots.json). Full corpus (145) only after the pilot kartu reads well:

`node lab/expor-os/build-kartu.mjs --all`

## Run loop

```bash
# 0) optional foundation refreshes (existing scripts; do not ingest Amazon to Contabo)
node scripts/fetch-comtrade.mjs
DATAFORSEO_LOGIN=… DATAFORSEO_PASSWORD=… node scripts/fetch-dataforseo-amazon.mjs \
  --only kursi-rotan,furnitur-jati,keranjang-rotan,tas-rotan,ukiran-kayu-bali,kopi-gayo,vanili,lada-hitam,minyak-nilam,minyak-kelapa,briket-arang-kelapa,cocopeat,sedotan-bambu,kain-batik,kemeja-batik,perhiasan-perak-bali,sabun-alami,sambal,gula-aren,tuna-kaleng
# Do NOT run: node scripts/ingest-amazon-listings.mjs --apply

# wrapper that refuses Contabo ingest:
node lab/expor-os/collectors/refresh-amazon-pilots.mjs

# 1) lab collectors
node lab/expor-os/collectors/fetch-hts-duty.mjs
node lab/expor-os/collectors/enrich-us-rules.mjs
# optional, needs a free Census key: CENSUS_API_KEY=… node lab/expor-os/collectors/fetch-census-imports.mjs
node lab/expor-os/collectors/ingest-bol-csv.mjs path/to/vendor-export.csv

# 2) generate local kartu
node lab/expor-os/build-kartu.mjs
node lab/expor-os/build-kartu.mjs --only kopi-gayo
open lab/expor-os/kartu/index.html
```

## Costs

| Source | Cost | Notes |
|---|---|---|
| UN Comtrade preview | Free | Already in `scripts/expor-trade.json` |
| DataForSEO Amazon SERP | Cheap (~&lt;$1 / 145×depth 20) | Fund the account; monthly lab refresh is enough |
| USITC HTS `exportList` | Free | MFN general rate; not a binding classification |
| Census International Trade API | Free key | Country×HS **aggregates**, not named importers |
| ImportGenius / Datamyne / Panjiva | **Paid** | Named-party BOL is the expensive moat. CSV ingest only — no scrape. |

## Amazon while offline

The lab **reads** `scripts/expor-amazon.json` (seed today: meja-makan-jati, kursi-rotan, minyak-kelapa). Missing slugs show an honest empty Amazon block. Do not run Contabo ingest from this folder.
