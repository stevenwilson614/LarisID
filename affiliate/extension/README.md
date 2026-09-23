# Laris Affiliate — Chrome extension (unpacked)

Local **v0.4.0**. **Not** on the Chrome Web Store, **not** on larisid.com, **not** copied into `_site`.

Sends Target Collab through **your already-open Seller Center session**. Cookies stay in Chrome. No Partner Center. No password field.

**Kirim live is locked by default.** Uji cari only looks up a creator. It does not invite.

Class zip (no git needed): `affiliate/dist/laris-affiliate-0.4.0.zip` — unzip, then Load unpacked on that folder.

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
4. After a code pull: **Reload** the extension (version is on the card, now **0.4.0**)
5. Pin the icon. Click it to open the side panel.
6. Log into [Seller Center](https://seller-id.tokopedia.com/) → **Affiliate → Get Started**
7. Refresh the Affiliate Center tab after reload so the adapter attaches.

## Hari tes (runbook)

Seller needs, before you sit down:

- TikTok Shop ID via Seller Center (already logged in on this Chrome)
- At least one **live** product they intend to invite on
- Affiliate Center access (Affiliate → Get Started opens without an error)

Order:

1. Load unpacked **0.4.0** (or unzip the class zip). Pin the icon. Open the side panel.
2. Open Affiliate Center in a tab. Refresh that tab. Akun → Affiliate Center = terhubung.
3. **Cari kreator terrekam:** Affiliate Center → Find Creators / Cari Kreator. Type a real handle. Do **not** invite. Akun checklist: Cari kreator **terrekam**.
4. **Target Collab terrekam:** send **one** manual Target Collab invite on the product + commission you will use tomorrow. Changing SKU or commission later needs another manual invite. Akun: Target Collab **terrekam**, plus the product line with a product id.
5. Import creators: Tempel, CSV, or Akun → Izinkan baca halaman Kalodata then Ambil (visible page only). Ranking rows are usually handle-only.
6. **Uji cari semua (tidak kirim)** on the chosen list. Confirm handles resolve (status uji, `creator_oec_id` filled). Count any “handle saja” before going live.
7. Akun → **Izinkan kirim live** (confirm). Wizard → **Tes 1 kreator · LIVE** to a creator who is **not** already invited on that SKU. CRM must show **terkirim**, and Affiliate Center must show the invite.
8. Only then **Kirim kampanye · LIVE**. 50 per request, 4–7 s between batches. Three size-1 failures pause the queue.

Checklist before Tes 1 (Akun → Siap kirim), all **terrekam** / on:

- Affiliate Center terbuka
- Target Collab terrekam
- Cari kreator terrekam
- Product id + komisi from the recorded invite
- Kirim live diizinkan

If anything fails: Akun → **Salin diagnostik** and paste the JSON into Cursor. No cookies are stored or copied.

Do **not** run a 50-batch on a test product you do not intend to sell.

## Recon (recorded 2026-09-18 on Steven’s shop)

Manual Target Collab to `@bule_barat` recorded:

- **Send:** `POST /api/v1/oec/affiliate/seller/invitation_group/create`
- **Creators:** `invitation_group.creator_id_list[].base_info.creator_oec_id` (not handle, not empty `creator_id`)
- **Product / komisi:** `product_list[].product_id` + `target_commission` (1500 = 15%). Changing SKU or commission requires **one new manual invite** so this body is re-recorded.
- **Search resolve:** `POST /api/v1/oec/affiliate/creator/marketplace/find` with `{ query: handle }`. Suggestions endpoints are ignored.
- One create request can list **up to 50** `creator_oec_id`s.

Tes 1 LIVE: add `@bule_barat` only (sample CSV leaves Unique ID blank so resolve must run), Izinkan kirim live, Tes 1 kreator · LIVE.

Recorded `creator_oec_id` for that self-test: `7495372765352463150`. A later Tes 1 on the same SKU returned `target invitation has unavailable creator or product` (already invited / self-invite). Pick a creator who is not already on that product.

Kalodata pickup is mapped to the live ID ranking table (`tr.group.cursor-pointer`, `@handle` in the Info Kreator cell — no Unique ID in that DOM). After reload: open `kalodata.com/creator`, **refresh that tab**, Akun → Izinkan baca halaman Kalodata. Opt-in pulls the visible page onto Kreator. Next pages: Ambil again. Ranking rows are handle-only until Cari kreator is recorded.

Kalodata Unique ID is stored as `creatorOpenId`. It is **not proven** equal to `creator_oec_id`. If send returns handle_only, record Cari kreator then retry.

## Creators in

1. **Tempel** from a Kalodata table (Starter-safe; no export quota).
2. **Ambil dari halaman Kalodata** — opt-in on Akun (that first tick **is** the first page). Reads **visible** rows only. Next page: click Ambil. Kalodata ToS 4.1.7 / 4.1.8; risk is to **your Kalodata account**.
3. **CSV** — Professional export (`Creator Handle` + `Unique ID`). Starter cannot export.

## Test without sending

1. Affiliate Center → Find Creators. Type a handle. Do not invite.
2. Akun → Cari kreator **terrekam**.
3. Uji cari / Uji cari semua (tidak kirim). Log says **uji**, never **terkirim**.

## Live send (only if you confirm)

Akun → Izinkan kirim live → wizard → Tes 1 / Kirim → confirm again. Background refuses `laris-send` until then.

A 2xx business rejection (`code != 0`) on a batch larger than 1 is split in halves and retried. Only size-1 failures count toward the three-fail pause. Network / 5xx / 429 do not bisect.

## Out of v0.4

Chrome Web Store, Partner Center, cookie export, Contabo, auto-pagination on Kalodata, 50-batch on a product you do not sell.
