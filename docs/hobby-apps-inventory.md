# Hobby apps sharing the LarisID production DB

**Phase 8 go/no-go.** Do not move or drop these until Steven confirms.

These objects live in the same Postgres / Kong / anon key as LarisID. A RLS slip is a LarisID breach in users' eyes.

## Tables (non-LarisID)

`kitchen_*`, `envelopes`, `households`, `transactions*`, `trips*`, `votes`, `registry_*`, `fx_rates`, `cash_snapshots`, `voice_commands`, plus generic `users` / `categories` / `product_plans` if they belong to Amplop/Dapur rather than LarisID.

## Edge functions (infra-only)

`budget-insights`, `fetch-product`, `fx-rate-sync`, `hello`, `home-login`, `pin-login`, `recipe-import`, `resolve-image`

## Cron

`fx-rate-sync-daily-amplop`

## Clients

Personal Amplop / Dapur / kitchen apps on the same box. Confirm which devices still call these before a move.

## Recommended move (after go)

1. Second Postgres database (or compose stack) on the same VPS with its own Kong + anon key.
2. `pg_dump` / `pg_restore` those objects.
3. Repoint those clients.
4. Drop from the LarisID DB.

Until then, default-privilege revoke (migration `20260905120000`) stops new tables inheriting anon writes.
