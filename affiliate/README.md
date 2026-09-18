# Laris Affiliate

Local prototype. **Not** on larisid.com, **not** copied into `_site`, **not** applied to Contabo.

## Product (v0.3)

Unpacked Chrome extension: [`extension/`](./extension/). Side panel campaigns send Target Collab through the **open Affiliate Center tab** (`invitation_group/create`, up to 50 creators per request). Cookies stay in Chrome.

Load: [`extension/README.md`](./extension/README.md). Class zip: [`dist/laris-affiliate-0.3.0.zip`](./dist/laris-affiliate-0.3.0.zip) (rebuild with `bash extension/pack.sh`).

**Kirim live is locked** until you tick Izinkan kirim live and confirm. Uji cari does not invite.

Caps: **50 kreator / kolaborasi**, **1.000 kolaborasi / 24 jam**, plus the shop’s weekly unconnected quota. Do not promise 1.000/hari. Badge: **Unofficial · sesi Chrome kamu**.

## LAN PWA (preview only)

The phone shell at this folder is a **dead preview**. It does not send. Prefer the extension.

```bash
bash affiliate/serve.sh
```

## Out of v0

Chrome Web Store, Partner Center OAuth, cookie export, Contabo.
