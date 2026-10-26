# Laris Affiliate — Chrome extension (unpacked)

Local **v0.5.5**. **Not** on the Chrome Web Store, **not** on larisid.com, **not** copied into `_site`.

Sends Target Collab through **your already-open Seller Center session**. Cookies stay in Chrome. No Partner Center. No password field.

**Kirim live is locked by default.** Uji cari only looks up a creator. It does not invite.

Toolbar icon opens the **on-page overlay** when you are on Seller / Affiliate Center (red **Laris** pill on the right). Side panel is fallback only. Badge shows `Overlay · v0.5.5` or `Panel · v0.5.5`. UI chrome matches larisid.com (white + merah accent + Plus Jakarta Sans).

Class zip (no git needed): `affiliate/dist/laris-affiliate-0.5.5.zip` — unzip, then Load unpacked on that folder. Prefer Load unpacked on `affiliate/extension` so reloads pick up edits.

## Caps (honest)

TikTok, not us:

- **50 kreator per satu kolaborasi** (`invitation_group/create`)
- **1.000 kolaborasi / 24 jam** (angka US/BR; ID memakai endpoint yang sama)
- **Kuota mingguan unconnected** mengikuti GMV toko. Toko baru: Starter Pack **1.000 sekali**. Setelah itu bisa jauh di bawah 1.000/minggu.

Jangan janji “1.000/hari”. The Kirim step shows the recorded `rate_limit_info` remaining count when Affiliate Center has loaded that request. If it has not, the line says the quota is not recorded yet. The local counter is still only local.

Satu sesi: **overlay atau panel tetap terbuka + tab Affiliate Center terbuka + laptop tidak sleep**. Menutup overlay atau panel menghentikan antrian. Hanya satu jendela yang boleh menjalankan antrian.

## Load unpacked

1. Chrome → `chrome://extensions`
2. Developer mode on
3. **Load unpacked** → this folder (`affiliate/extension`)
4. After a code pull: **Reload** the extension (version is on the card, now **0.5.0**)
5. Pin the icon. Open Affiliate Center, **refresh that tab**, then click the icon (or the red **Laris** pill). You should see a wide overlay, badge `Overlay · v0.5.5` — not the narrow side panel alone.
6. Log into [Seller Center](https://seller-id.tokopedia.com/) → **Affiliate → Get Started**
7. Refresh the Affiliate Center tab after reload so the adapter + pill attach.

## Wizard

1. **Produk** — product, commission, invitation name, and end date from the last manual Target Collab. Commission, name, and end date are editable when those fields exist on the recorded body (`target_commission` 1500 = 15%). A different SKU still needs one new manual invite.
2. **Kreator** — **Temukan kreator** replays the recorded Find Creators list. **Dari Kalodata** is CSV, one visible page, or Baca semua halaman. Filters, blacklist, and “already invited on this product” apply before send.
3. **Undangan** — Target Collab or Pesan IM, plus the template. If the recorded invite has no message field, the text is not sent.
4. **Kirim** — Uji cari does not invite. Live send asks again.

## Find Creators replay

`describeSearch` in `js/paging.js` reads the newest recorded `creator/marketplace/find` (or `search`) body and looks for `page` / `offset` / `size` / `cursor` (`search_key` only inside a pagination object), plus follower and GMV minimums when the keys are recognizable (`follower_filter.left_bound`, `gmv_filter.left_bound`, and the same idea under other names).

Ambil then replays that body, advances the page or cursor, waits 1 second between pages, and stops at the requested count, an empty page, or Berhenti. Rows are kept only when the response has both a creator id and a handle, so they arrive with `creator_oec_id`.

A recording that is only `{ query: "@handle" }` is a handle lookup, not a list. The wizard says so. To record a list: Find Creators, clear the search box, set the filters, open page 2 (so the body has a page field). Then **Cek rekaman**.

There is no Seller Center session in this repo, so the live field names are whatever that shop’s Find Creators request contains. **Salin diagnostik** includes `searchShape` (the detected paths) and `liveQuota`. That is how a real recording is identified after one filtered search.

Suggestions endpoints are still ignored.

## Kalodata

No password, no Kalodata API.

- **Baca halaman ini** — opt-in, visible rows only. ToS 4.1.7 / 4.1.8. Risk is to that Kalodata account.
- **Baca semua halaman** — separate opt-in. Clicks the table’s Next control, waits 1.5–3 seconds plus until the rows change, reads again. Stops at the count, the last page, or Berhenti. No hidden requests.
- **CSV** — Professional export. Unique ID is stored on the row. It is **not proven** equal to `creator_oec_id`. The recorded self-test id for `@bule_barat` is `7495372765352463150`. Compare that to the Unique ID column for the same handle. Until they match, a wrong id fails at TikTok and the row is marked gagal.

## Hari tes (runbook)

Seller needs, before you sit down:

- TikTok Shop ID via Seller Center (already logged in on this Chrome)
- At least one **live** product they intend to invite on
- Affiliate Center access (Affiliate → Get Started opens without an error)

Order:

1. Load unpacked **0.5.5** (folder `affiliate/extension`, or unzip the class zip). Pin the icon. Open Affiliate Center, refresh, click icon or Laris pill.
2. Refresh the Affiliate Center tab. Akun → Affiliate Center = terhubung.
3. **Daftar kreator terekam:** Find Creators, clear search, set a filter, open the next page. Do **not** invite. Wizard → Cek rekaman should no longer say the recording is a single handle.
4. **Target Collab terrekam:** send **one** manual Target Collab invite on the product + commission you will use. Changing SKU later needs another manual invite. Open the invite page once so `rate_limit_info` can show on Kirim.
5. **Ambil dari Find Creators** for the count you want (default is the smaller of the local remainder and the recorded TikTok remainder). Or import Kalodata CSV / pages.
6. **Uji cari semua (tidak kirim)** on the chosen list. Count any “handle saja” before going live.
7. Akun → **Izinkan kirim live** (confirm). Wizard → **Tes 1 kreator · LIVE** to a creator who is **not** already invited on that SKU. CRM must show **terkirim**, and Affiliate Center must show the invite.
8. Only then **Kirim kampanye · LIVE**. 50 per request, 4–7 s between batches. Three size-1 failures pause the queue.

Checklist before Tes 1 (Akun → Siap kirim), all **terrekam** / on:

- Affiliate Center terbuka
- Target Collab terrekam
- Cari kreator terrekam (a list, not only one handle)
- Product id + komisi from the recorded invite
- Kirim live diizinkan

If anything fails: Akun → **Salin diagnostik** and paste the JSON into Cursor. No cookies are stored or copied.

Do **not** run a 50-batch on a test product you do not intend to sell.

## Recon (recorded 2026-09-18 on Steven’s shop)

Manual Target Collab to `@bule_barat` recorded:

- **Send:** `POST /api/v1/oec/affiliate/seller/invitation_group/create`
- **Creators:** `invitation_group.creator_id_list[].base_info.creator_oec_id` (not handle, not empty `creator_id`)
- **Product / komisi:** `product_list[].product_id` + `target_commission` (1500 = 15%). Changing SKU requires **one new manual invite**. Commission, invitation name, and end date can be edited in the wizard when those keys are already on the body.
- **Search resolve:** `POST /api/v1/oec/affiliate/creator/marketplace/find` with `{ query: handle }`. Suggestions endpoints are ignored. A filtered list uses the same family of endpoint; pagination field names come from that recorded body (`js/paging.js`).
- One create request can list **up to 50** `creator_oec_id`s.

Tes 1 LIVE: add `@bule_barat` only (sample CSV leaves Unique ID blank so resolve must run), Izinkan kirim live, Tes 1 kreator · LIVE.

Recorded `creator_oec_id` for that self-test: `7495372765352463150`. A later Tes 1 on the same SKU returned `target invitation has unavailable creator or product` (already invited / self-invite). Pick a creator who is not already on that product. The wizard hides handles already marked terkirim for the same product id.

## Creators in

1. **Temukan kreator** — replay of a recorded Find Creators list. One click for N rows that already have `creator_oec_id`.
2. **Tempel** from a Kalodata table (Starter-safe; no export quota).
3. **Ambil dari halaman Kalodata** — opt-in. Visible rows only.
4. **Baca semua halaman** — separate opt-in. Clicks Next on the open table.
5. **CSV** — Professional export (`Creator Handle` + `Unique ID`). Starter cannot export.

## Test without sending

1. Affiliate Center → Find Creators. Type a handle, or record a filtered list as above.
2. Akun → Cari kreator **terrekam**.
3. Uji cari / Uji cari semua (tidak kirim). Log says **uji**, never **terkirim**.

## Live send (only if you confirm)

Akun → Izinkan kirim live → wizard → Tes 1 / Kirim → confirm again. Background refuses `laris-send` until then.

A 2xx business rejection (`code != 0`) on a batch larger than 1 is split in halves and retried. Only size-1 failures count toward the three-fail pause. Network / 5xx / 429 do not bisect.

## Out of v0.5

Chrome Web Store, Partner Center, cookie export, Contabo, Kalodata internal API, a shop-wide product grid inside the overlay, a free-sample toggle unless that field is already on the recorded body.
