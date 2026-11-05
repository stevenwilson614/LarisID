# Alat on-demand shop scrape (Mac)

Live on the main LarisID SPA (`js/gpt-alat-preview.js`). First visit shows
**Seller baru / Sudah punya toko**. The first **Sudah punya toko** door is
paste-URL, then kabar/kontak while the scrape runs. After that door is
finished — and for Seller baru, Lewati, or Hapus toko — paste-URL skips
kabar, pilih kompetitor, and analisis: full-page fun facts, then the bench,
with the first listing and its top two kompetitor saved in the background.
`?preview=off` turns the doors off. Contabo queues the job; **Steven’s
MacBook Pro** polls and scrapes (~1 min budget). Result is a private
`ext_shop_claim_snapshots` row — same as the Chrome extension claim.
Extension stays the backup. The pasted URL and chosen products are saved
on the signed-in profile (`user_store_profiles`, `user_tracked_products`).

On the connect step, **Lewati dulu** skips adding a shop — lands on the normal
home with My Toko in nav so they can paste later.

## Pieces

| Piece | Where |
|-------|--------|
| Queue + RPCs | `supabase/migrations/20260918120000_ext_shop_scrape_jobs.sql` |
| SPA | `js/gpt-alat-preview.js` — first door: URL → Kabar → poll → Kompetitor. Later: URL → fun-facts poll → bench |
| Mac worker | `~/shopee_scraper/shop_claim_worker.py` |

`match_titles_to_keywords` maps a shop's titles onto product markets (token coverage ≥ 0.6 and the keyword's first word in the title). A brand or shop keyword returns `parent_keyword` when one is set, so Kompetitor is not a list of one reseller. See [search-resolver.md](./search-resolver.md).

RPCs:

- `request_shop_scrape(client, url, shop_id?, name?)` — anon/auth
- `get_shop_scrape_job(job_id, client)` — SPA poll
- `claim_shop_scrape_jobs(host, limit)` — service_role (Mac)
- `complete_shop_scrape(...)` — service_role → private snap

Does **not** merge into `public.listings`.

Mac worker (2026-11-05): a username paste (`shopee.co.id/{slug}`, query string
ignored) is matched to an exact `mv_shops.store_name` (`_` and `-` tried as
spaces) before any scrape. `/{slug}/search` is a Shopee 404 and is not
requested. When the name is new, the worker opens `/{slug}` and reads
`get_shop_info`, or the redirect to `/shop/{id}`. An empty grid on one Chrome
port is retried on the next port. `90309999` or a captcha finishes as
`blocked`.

The product pass opens a throwaway tab on a Chrome port that is still loading
keyword search (not the traffic-verify wall) and reads the page's own
`/api/v4/search/search_items` for `/shop/{id}/search`, page 0 and page 1,
capped at 60. A hand-rolled `fetch()` of that API returns error `90309999`.
Port 9225 was on that wall on 2026-11-05 and recorded `n=0` for every shop,
including ones whose header loaded. A healthy port returned Shakillabyzahra's
grid (`total_count` 38). Jobs that only saw `90309999` or a captcha finish as
`blocked`, not `empty`.

**Host pin:** only **Stevens-MacBook-Pro** (laptop B, `acct614`, CDP 9224/9225)
claims `ext_shop_scrape_jobs` — same as Minta info. Laptop A (`SOWs-MacBook-Pro`)
must not drain these. SPA only enqueues via `request_shop_scrape` to Contabo;
Steven’s Mac polls. After scraper fixes: on B run `cd ~/shopee_scraper && git pull`
and keep `shop_claim_worker.py` or `run_all` / `tracked_pass` (which call
`drain_priority_shop`) running.

## Run on Steven’s Mac

```bash
cd ~/shopee_scraper
# Keep Playwright Shopee session logged in (same shopee_session/ as keyword scrapes)
python3 shop_claim_worker.py          # poll every 2s
# or: python3 shop_claim_worker.py --once
```

Leave this running whenever the laptop is up. Idle cost is one PostgREST RPC
every 2s. Override host id with `SCRAPE_HOST` if needed.

Apply SQL on Contabo (never cloud push):

```bash
bash scripts/apply-selfhost.sh supabase/migrations/20260918120000_ext_shop_scrape_jobs.sql
```
