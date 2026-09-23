# Laris Affiliate — Chrome extension (unpacked)

Local v0.3.1. **Not** on the Chrome Web Store, **not** on larisid.com, **not** copied into `_site`.

Sends Target Collab through **your already-open Seller Center session**. Cookies stay in Chrome. No Partner Center. No password field.

**Kirim live is locked by default.** Uji cari only looks up a creator. It does not invite.

## Caps (honest)

TikTok, not us:

- **50 kreator per satu kolaborasi** (`invitation_group/create`)
- **1.000 kolaborasi / 24 jam** (angka US/BR; ID memakai endpoint yang sama)
- **Kuota mingguan unconnected** mengikuti GMV toko. Toko baru: Starter Pack **1.000 sekali**. Setelah itu bisa jauh di bawah 1.000/minggu.

Jangan janji “1.000/hari”. Hitungan di panel adalah **lokal**, bukan jaminan cap live.

Satu sesi: **panel terbuka + tab Affiliate Center terbuka + laptop tidak sleep**. Tutup panel = antrian berhenti.

## Load unpacked

1. Chrome → `chrome://extensions`
2. Developer mode on
3. **Load unpacked** → this folder (`affiliate/extension`)
4. After a code pull: **Reload** the extension (version is on the card, now **0.3.1**)
5. Pin the icon. Click it to open the side panel.
6. Log into [Seller Center](https://seller-id.tokopedia.com/) → **Affiliate → Get Started**
7. Refresh the Affiliate Center tab after reload so the adapter attaches.

Class zip (no git needed): `affiliate/dist/laris-affiliate-0.3.1.zip` — unzip, then Load unpacked on that folder.

## Recon (recorded 2026-09-18 on Steven’s shop)

Manual Target Collab to `@bule_barat` recorded:

- **Send:** `POST /api/v1/oec/affiliate/seller/invitation_group/create`
- **Creators:** `invitation_group.creator_id_list[].base_info.creator_oec_id` (not handle, not empty `creator_id`)
- **Product / komisi:** `product_list[].product_id` + `target_commission` (1500 = 15%). Changing SKU or commission requires **one new manual invite** so this body is re-recorded.
- **Search resolve:** `POST /api/v1/oec/affiliate/creator/marketplace/find` with `{ query: handle }`. Suggestions endpoints are ignored.
- One create request can list **up to 50** `creator_oec_id`s. The extension now fills that array instead of 1.000 single-creator POSTs.

Tes 1 LIVE: add `@bule_barat` only, Izinkan kirim live, Tes 1 kreator · LIVE. **Do not** run a 50-batch on a test product you do not intend to sell.

Recorded `creator_oec_id` for that self-test: `7495372765352463150`. After reload (0.3.1), click Tes 1 in the panel — Chrome Apple Events are off so the agent cannot press it for you.

Kalodata pickup is mapped to the live ID ranking table (`tr.group.cursor-pointer`, `@handle` in the Info Kreator cell — no Unique ID in that DOM). After reload: open `kalodata.com/creator`, **refresh that tab**, Akun → Izinkan baca halaman Kalodata. Opt-in pulls the visible page onto Kreator. Next pages: Ambil again. Ranking rows are handle-only until Cari kreator is recorded.

Kalodata Unique ID is stored as `creatorOpenId`. It is **not proven** equal to `creator_oec_id` (the sample CSV ids are fake). If send returns handle_only, record Cari kreator then retry.

## Creators in

1. **Tempel** from a Kalodata table (Starter-safe; no export quota).
2. **Ambil dari halaman Kalodata** — opt-in on Akun (that first tick **is** the first page). Reads **visible** rows only. Next page: click Ambil. Kalodata ToS 4.1.7 / 4.1.8; risk is to **your Kalodata account**.
3. **CSV** — Professional export (`Creator Handle` + `Unique ID`). Starter cannot export.

## Test without sending

1. Affiliate Center → Find Creators. Type a handle. Do not invite.
2. Akun → Cari kreator **terrekam**.
3. Uji cari (tidak kirim). Log says **uji**, never **terkirim**.

## Live send (only if you confirm)

Akun → Izinkan kirim live → wizard → Tes 1 / Kirim → confirm again. Background refuses `laris-send` until then.

Three live fails in a row pause the queue.

## Out of v0.3

Chrome Web Store, Partner Center, cookie export, Contabo, auto-pagination on Kalodata, 50-batch on a product you do not sell.
