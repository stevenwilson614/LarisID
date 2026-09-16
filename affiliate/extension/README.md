# Laris Affiliate — Chrome extension (unpacked)

Local v0. **Not** on the Chrome Web Store, **not** on larisid.com, **not** copied into `_site`.

Sends Target Collab / shop IM through **your already-open Seller Center session**. Cookies stay in Chrome. No Partner Center. No password field.

Affiliate Center ToS still applies. Caps in the UI: **50 / kirim, 1.000 / 24 jam**.

## Load unpacked

1. Chrome → `chrome://extensions`
2. Developer mode on
3. **Load unpacked** → this folder (`affiliate/extension`)
4. Pin the icon. Click it to open the side panel.
5. Log into [Seller Center](https://seller-id.tokopedia.com/) → **Affiliate → Get Started**
6. Side panel Akun should show **terhubung**

## First live send (one creator you control)

The adapter does not guess TikTok’s private URLs. It **records** the invite / IM request the Affiliate Center page already fires.

1. With the extension loaded, open Affiliate Center.
2. Send **one** Target Collab invite (or one shop IM) by hand to a creator you control.
3. Akun → chip **Target Collab terrekam** / **IM terrekam**.
4. Add that handle (and `creator_id` / `open_id` from CSV if you have it) in Kreator.
5. Buat kampanye → **Kirim** for that one row. Check the creator inbox.
6. Then a small batch, then up to 50 with jeda.

If Kirim fails with “handle saja”: import a Kalodata CSV that includes `creator_id` / `open_id`, or let the recorded **search** request resolve the handle first.

## Out of v0

Chrome Web Store, class zip, phone PWA, Partner Center, cookie export, Contabo.
