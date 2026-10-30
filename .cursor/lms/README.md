# LMS (Cursor home)

**Product name:** LMS  
**Entry URL:** https://larisid.com/lms/

This product was previously called Anton’s app, Anton’s school, or Obrolan Marketing in chat and older notes. In docs and agent work, call it **LMS**.

## What lives where

| Surface | Path / URL |
| --- | --- |
| Landing + mentor signup/login | `lms/` → https://larisid.com/lms/ |
| Live class (left-rail UI) | `obrolan.marketing/` → `/s/{slug}/` (and legacy hub `/obrolan.marketing/`) |
| Agent product doc | [docs/lms.md](../../docs/lms.md) |
| Agent rules for this area | [AGENTS.md](./AGENTS.md) · rule [../rules/lms.mdc](../rules/lms.mdc) |

## Legacy names (infra only)

Keep these when pointing at code or Contabo services — do not use them as the product name:

- Source folder / API prefix: `obrolan.marketing/`
- Docker / volume: Contabo `anton-school`
- Founding tenant slug: `obrolan.marketing` (one school among many)

Belajar and LarisRise are separate products — do not fold them into LMS.

## Staging

`https://stage.larisid.com` is a separate static tree and disk (`anton-school-stage`). It does not share production kurikulum or students.

```bash
bash scripts/deploy-static-stage.sh
bash scripts/deploy-school-api-stage.sh
```

`main` CI deploys production only. Try a tab or button on stage, then `bash scripts/deploy-static.sh`. School JSON backups are `state/{slug}.json.bak.1` (newest) through `.bak.5` on that environment’s volume. Details: [docs/lms.md](../../docs/lms.md).
