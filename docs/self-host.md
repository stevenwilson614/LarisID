# Live database = Contabo self-host

**This is the only live backend.** The old Supabase Cloud project
`bzmvlraziqevqdyotvgy` (`*.supabase.co`) was migrated off and removed.
The site, scrapers, and edge functions talk to **`https://api.larisid.com`**.

| | |
|---|---|
| API | `https://api.larisid.com` |
| Box | Contabo VPS `vmi3462173`, `root@84.247.147.205` (Singapore) |
| SSH key | `~/.ssh/larisid_hetzner` (override with `LARISID_SSH_KEY`) |
| Postgres | Docker `supabase-db` on that box |
| Functions | `/root/larisid-infra/docker/volumes/functions/<slug>/` |
| Infra repo | https://github.com/stevenwilson614/larisid-infra |

The public site (`larisid.com`) is static HTML/JS served by **Contabo Caddy**
(DNS A → `84.247.147.205`), with a **Cloudflare Pages** mirror at
`larisid.pages.dev`. Ship static changes with `bash scripts/deploy-static.sh`
in this repo — that does **not** change schema or edge functions.

## Never do this

- `supabase db push` / `supabase db push --linked`
- `supabase link` to `bzmvlraziqevqdyotvgy`
- A cloud `SUPABASE_ACCESS_TOKEN` / `sbp_…` PAT against the live DB
- Supabase Dashboard SQL editor on the old project
- Cursor’s Supabase MCP unless it is explicitly pointed at Contabo (the
  default MCP project is **not** LarisID)

Those commands either fail (“Resource has been removed”) or write to the
wrong place. That is how the HUT RI unlimited-dives work almost shipped
only to the static hosts (Contabo / Cloudflare Pages), not the DB.

## Apply a SQL migration

From this repo root:

```bash
bash scripts/apply-selfhost.sh supabase/migrations/YYYYMMDDHHMMSS_name.sql
```

Equivalent:

```bash
ssh -i "${LARISID_SSH_KEY:-$HOME/.ssh/larisid_hetzner}" \
    -o ConnectTimeout=20 root@84.247.147.205 \
    "docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1" \
    < supabase/migrations/YYYYMMDDHHMMSS_name.sql
```

Scraper-owned DDL (`listing_weekly`, `product_velocity`, daily series) still
lives in `~/shopee_scraper` and is applied the same SSH+psql way — see
[listing-weekly.md](./listing-weekly.md).

## Deploy an edge function

1. Keep the source in **this** repo: `supabase/functions/<slug>/index.ts`
2. Copy to the box **and** to `larisid-infra` so the next `git pull` on the
   VPS does not delete it:

```bash
bash scripts/deploy-function-selfhost.sh <slug>
```

Then commit + push **both** `LarisID-astro` and `larisid-infra`.

On the box the container is `supabase-edge-functions`. Cron jobs call
`http://kong:8000/functions/v1/<slug>` with the **self-host** service role
(see `larisid-infra/cron/recreate_cron_jobs.sql`). Do not paste cloud JWTs
into new cron SQL.

## Studio / one-off SQL

https://api.larisid.com (basic auth from `larisid-infra/docker/.env`), or
`ssh` + `docker exec -it supabase-db psql -U postgres`.

## Historical files

Old migrations under `supabase/migrations/` that mention
`bzmvlraziqevqdyotvgy.supabase.co` are **already applied artifacts**. Do not
re-run them. Live pg_cron was re-pointed at Kong on cutover.
