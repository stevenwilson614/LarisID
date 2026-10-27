# anton-school (Contabo)

Node HTTP server for MasterMind LMS APIs. Disk only — not LarisID Postgres.

| File | Role |
|---|---|
| `server.mjs` | State, media, events, issues, Lynk webhook |
| `pay-wa.mjs` | Mayar invoices/webhook + Fonnte WA inbox |
| `disk-store.mjs` | JSON files under `DATA_DIR/kv` |

Live: Caddy strips `/api` and proxies to this process on port 8787.

```bash
bash scripts/deploy-school-contabo.sh
```

Secrets on the VPS: `/root/larisid-infra/docker/.env`
(`ANTON_ADMIN_KEY`, `MAYAR_*`, `FONNTE_*`, `WA_WEBHOOK_SECRET`).
