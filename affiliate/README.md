# Laris Affiliate

Local LAN prototype. **Not** on larisid.com, **not** copied into `_site`, **not** applied to Contabo.

Campaign tool to test TikTok outreach: first **Pesan TikTok** to friends, later a real shop via OAuth (Anton). It does not blast Seller Center cookies.

## Phone test (P0)

Mac and phone on the same Wi-Fi:

```bash
bash affiliate/serve.sh
```

Open the **Phone** URL it prints, e.g. `http://192.168.x.x:8766/affiliate/`

1. Safari → Share → Add to Home Screen.
2. Stay logged into TikTok as `@bule_barat`.
3. Tab **Kreator** → tambah handle teman (bukan hanya baris `contoh`).
4. **Kampanye** → Buat kampanye → Pesan TikTok → pilih orang → template → **Kirim kampanye**.
5. **Salin & buka TikTok** → di aplikasi, ketuk Message → paste → Send.
6. Kembali ke Laris Affiliate → **Sudah kirim**.

If the phone cannot load the page, allow incoming TCP 8766 on the Mac firewall.

Latihan kuota: **50 / hari (WIB)**. Bukan cap resmi TikTok Shop. Reset tes ada di Akun.

## What this is not

- Not Kaloboost’s Chrome plugin or cookie farm.
- Not “1.000 affiliator / 10 menit”.
- Not an Indonesian seller account. `@bule_barat` is a TikTok login. ID shops need **KTP** (individu) or **NIB + NPWP** (PT Indonesia).
- No consumer-DM API. The app copies and opens TikTok; **you** tap Send.

## UI (P1)

Dock: Kampanye / Kreator / CRM / Akun.

- Select-all, template `{handle}` `{name}` `{toko}` `{produk}` `{komisi}`.
- Job progress. CRM from campaigns on this device.
- CSV import (column `handle` or first column). Outbound is still Pesan TikTok until a shop is bound.
- **Kolaborasi Bertarget** locked until `account.shopToken` exists.

## Seller bind (P2 seam)

`affiliate/js/send.js`:

- `workers.tiktokApp` — copy + `https://www.tiktok.com/@handle`
- `workers.affiliateSeller` — stub (`not_wired`) until Partner Center is live

Same **Kirim**. Do **not** paste Seller Center passwords or cookies.

When a shop token exists, Target Collab unlocks. On LAN only, Akun has **Simulasikan toko terhubung (UI saja)** so you can see the unlocked channel. That dummy token still does not send to Affiliate Center.

### Anton OAuth checklist (later)

1. Register a developer app on [TikTok Shop Partner Center](https://partner.tokopedia.com/) as LarisID (US entity + passport). Not a KTP seller signup.
2. Anton authorizes **his** shop (OAuth). He does not give you Seller Center login.
3. Store the shop token on `account.shopToken` / `shopName`.
4. Unlock Target Collab. Test **one** creator Anton controls.
5. Then mass up to **his** shop caps: 50 / kirim, 1.000 / 24 jam, weekly unconnected GMV quota.
6. Swap `affiliateSellerSend` to `POST /affiliate_seller/202412/target_collaboration/links/generate` and `.../messages/send`.

## Files

| Path | Role |
|------|------|
| `index.html` | PWA shell |
| `js/send.js` | Send workers |
| `js/app.js` | Wizard, job, CRM |
| `serve.sh` | `0.0.0.0:8766` |

`scripts/assemble-site.sh` does not copy this folder.
