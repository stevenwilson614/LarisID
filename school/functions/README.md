# Retired — Cloudflare Pages Functions

School APIs now run on Contabo Node (`school/server/`, container
`anton-school`). Live paths:

- `https://larisid.com/api/state/{slug}`
- `https://larisid.com/api/pay/*`
- `https://larisid.com/api/wa/*`

Deploy: `bash scripts/deploy-school-contabo.sh`.

These `functions/api/**` files are kept only as reference for the old
Pages project (`mastermind-anton`). Do not deploy them.
