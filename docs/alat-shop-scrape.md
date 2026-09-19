# Alat on-demand shop scrape (Mac)

Paste-URL first in `?preview=alat` (Sudah punya toko). Contabo queues the job;
**Steven’s MacBook Pro** polls and scrapes; the SPA fills kabar/kontak in
parallel (~1 min budget). Result is a private `ext_shop_claim_snapshots` row —
same as the Chrome extension claim. Extension stays the backup.

On the connect step, **Lewati dulu** skips adding a shop — lands on the normal
home with My Toko in nav so they can paste later.

## Pieces

| Piece | Where |
|-------|--------|
| Queue + RPCs | `supabase/migrations/20260918120000_ext_shop_scrape_jobs.sql` |
| SPA | `js/gpt-alat-preview.js` — URL → Kabar → poll → Kompetitor |
| Mac worker | `~/shopee_scraper/shop_claim_worker.py` |

RPCs:

- `request_shop_scrape(client, url, shop_id?, name?)` — anon/auth
- `get_shop_scrape_job(job_id, client)` — SPA poll
- `claim_shop_scrape_jobs(host, limit)` — service_role (Mac)
- `complete_shop_scrape(...)` — service_role → private snap

Does **not** merge into `public.listings`.

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
