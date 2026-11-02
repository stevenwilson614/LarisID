# Live Deep Dive “Minta info”

Varian, SKU, and ulasan stay empty until `product_details` has a row. **Minta info** used to only park that item for the next daily `tracked_pass`. It now waits on the same Mac claim path as My Toko: enqueue, fun-facts popup, poll for up to **3 minutes** (the claim lease), then repaint the dive. A failed first open on the Mac waits ~2 minutes before reclaim, so a 90s SPA budget was too short.

Every Deep Dive of a real listing with no `product_details` row shows **Minta info**, including a keyword dive that opens that keyword’s top product. Live only works while `shop_claim_worker.py` is running on **Steven’s MacBook Pro** (laptop B, `Stevens-MacBook-Pro`, Shopee `acct614`, CDP 9224/9225). Laptop A does not claim these rows. If that worker is down or the page does not open in time, the row stays on the overnight queue and the toast says so. Auto-opens (priority 50, from just viewing a dive) are still daily-only. Only an explicit ask (priority 10) is claimed live.

Per-varian sold still does not exist on Shopee’s PDP. The cards show what the page actually returns.

## Pieces

| Piece | Where |
|-------|--------|
| Queue + RPCs | `supabase/migrations/20261101120000_item_detail_live.sql` |
| SPA wait | `js/gpt-app.js` — `wireDdVarianRequest`, `#dd-detail-busy` (busy poll ≤3 min; quiet late-watch another ≤3 min after timeout) |
| Mac worker | `~/shopee_scraper/shop_claim_worker.py` (item detail before shop jobs) |

RPCs on `https://api.larisid.com`:

- `request_item_detail(...)` — signed-in enqueue. 5 / 24h. `already_live` if `product_details` is under 7 days.
- `get_item_detail_status(item_id)` — SPA poll. `detail_ready` only after a scrape newer than this ask.
- `claim_item_detail_jobs(host, limit)` — service_role. Priority ≤ 10, lease 3 minutes.
- `complete_item_detail(...)` — service_role. Upserts `product_details` immediately (`source = live_pdp`) and calls `fulfill_item_detail_requests()`.

Does not wait for `push_details.py`.

## Run on Steven’s MacBook Pro (laptop B)

Not on SOW’s MacBook Pro. That machine skips `claim_item_detail_jobs`.

```bash
cd ~/shopee_scraper
git pull
# Logged-in Chrome for acct614 (CDP 9224 or 9225).
python3 shop_claim_worker.py --cdp http://127.0.0.1:9224
# Back-to-back PDP asks wait 6–14s so one account is not hammered.
# or: python3 shop_claim_worker.py --once
```

Apply SQL on Contabo (never cloud push):

```bash
bash scripts/apply-selfhost.sh supabase/migrations/20261101120000_item_detail_live.sql
```

## Smoke (before a static deploy)

Step A — same PostgREST route My Toko uses. An empty claim is a pass. If a real shop job comes back, set that row back to `pending` so the test does not hold the lease.

```bash
cd ~/shopee_scraper
python3 -c "from shop_claim_worker import rpc, host_id; print(rpc('claim_shop_scrape_jobs', {'p_host': host_id(), 'p_limit': 1}))"
```

Step B — one explicit item, finished while the SPA is still polling (≤3 min, ideally under ~60s on a clean first open): queue `done`, `product_details.fetch_status = ok`, `get_item_detail_status` → `detail_ready`.

```bash
python3 shop_claim_worker.py --once
```

If either step fails, do not `bash scripts/deploy-static.sh`. The overnight queue still works.
