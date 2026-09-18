# Laris Affiliate — Chrome extension (unpacked)

Local v0. **Not** on the Chrome Web Store, **not** on larisid.com, **not** copied into `_site`.

Sends Target Collab / shop IM through **your already-open Seller Center session**. Cookies stay in Chrome. No Partner Center. No password field.

**Kirim live is locked by default.** Uji cari only looks up a creator. It does not invite.

Affiliate Center ToS still applies. Caps in the UI: **50 / kirim, 1.000 / 24 jam**.

## Load unpacked

1. Chrome → `chrome://extensions`
2. Developer mode on
3. **Load unpacked** → this folder (`affiliate/extension`)
4. After a code pull: **Reload** the extension (version is in the card)
5. Pin the icon. Click it to open the side panel.
6. Log into [Seller Center](https://seller-id.tokopedia.com/) → **Affiliate → Get Started**
   (Affiliate Center opens on `affiliate-id.tokopedia.com`)
7. Akun chip: **Seller Center** or **Affiliate Center**

## Test without sending

1. Open Affiliate Center → **Find Creators / Cari Kreator**.
2. Type a handle in TikTok’s search. **Do not click undang / invite / kirim.**
3. Akun → chip **Cari kreator · terrekam**.
4. Kreator → add that handle (or use the list).
5. Akun → **Uji cari 1 kreator (tidak kirim)** or wizard → **Uji cari (tidak kirim)**.
6. Log should say **uji**, never **terkirim**.

## Live send (only if you confirm)

Default: **Izinkan kirim live** is off. Tes 1 / Kirim kampanye stay disabled.

To actually invite: Akun → check **Izinkan kirim live** → confirm → wizard → Tes 1 / Kirim → confirm again.

Until those two confirms happen, the background worker refuses `laris-send`.

## Out of v0

Chrome Web Store, class zip, phone PWA, Partner Center, cookie export, Contabo.
