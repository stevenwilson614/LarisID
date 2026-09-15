# Sekolah Anton — offline prototype

_Internal. Not a public product. Do not deploy, do not apply SQL on Contabo,
do not push this work to `main`._

Run locally from the repo root:

```bash
bash school/serve.sh
# open http://127.0.0.1:8765/school/
```

Live Kohort Pertama (`js/laris-cohort.js` + `#view-cohort`) is untouched.
This folder is not copied by `scripts/assemble-site.sh`.

## Two tracks

| | Seller kohort (Rise) | Creator-mentor school (Anton) |
|---|---|---|
| Who | Hendra / Afryian, Batch 1 | Anton, then other mentors |
| Job | Shop-crawl verified progress, Toko Saya | Live class + kurikulum + tools + WA |
| Live UI | Ringkasan / Siswa / Feed / Jadwal | Prototype: Home / Belajar / Pustaka / Diskusi / Progres |
| Chrome | LaRISE applicants, hardcoded Zoom, scrape boards | Hidden |
| Money | LarisID is free | Anton is merchant; ledger in LMS |
| Next mentor | New `cohorts` row (today) | `schools` + `school_members` |

Schema that exists but has no live UI: `milestone_content` (`video|document|text`),
`cohort-docs`, assignments, certificates, ICS (`calendar_token` omitted on the
live subscribe URL), `mentor_messages`. Retired [`js/laris-app.js`](../../js/laris-app.js)
is **not loaded** and still holds authoring + `wscLazyEmbedHtml`.

## Steal vs skip

- **Udemy classic:** player + always-visible kurikulum + Tanya on the lecture. Skip 2026 hidden sidebar, marketplace, quizzes.
- **lynk.id:** mobile home, WA-native, tool tiles. Skip link-in-bio clutter and their checkout (Anton already collects there).
- **Skool:** one login. **Whop:** tools as apps in the hub. **Thinkific:** owner / mentor / asisten. **Komunitas board:** unanswered-first.
- **Skip:** Mighty Networks sprawl, in-app DMs, Rise shop crawls, Kaloboost cookie farms.

## Prototype map

- Student shell: [`school/index.html`](../../school/index.html)
- Schema draft (do not apply): [`school/sql/20260915120000_anton_school_schema.sql`](../../school/sql/20260915120000_anton_school_schema.sql)
- Open decisions: [`OPEN_DECISIONS.md`](./OPEN_DECISIONS.md)

Gating is Anton’s membership and IP, not LarisID Cari Produk / Deep Dive.
`gratis` / beasiswa is a first-class billing status. Progress is completed
items / total — no fake scores.

## Catalog (lynk.id/obrolan.marketing)

Six products can be bought **satuan**. **Mentoring** unlocks all six plus live class
(Home / Belajar / Diskusi / Kolab). Checkout stays on lynk.id.

| SKU | Harga (coret) | Demo siswa |
|---|---|---|
| Profit Calculator | 99k (129k) | Rina Wulandari |
| AI Creative Assistant | 69k (100k) | mentoring |
| AI Analisa Data | 200k (250k) | mentoring |
| Jangan Naik Harga (rekaman) | 99k (200k) | mentoring |
| Mastering Algorithm (rekaman) | 59.9k (199k) | Toni Wijaya |
| Ads Strategic GMV (rekaman) | 149k (249k) | mentoring |

Persona **Kamu (demo)** = mentoring. **Budi** = belum. Setiap SKU punya **Lihat contoh**
sampai Anton ganti file di Perpustakaan mentor.

Kalkulator di `school/tools/harga.html` meniru spreadsheet Anton (Set harga + Toko/HPP).

### Saran susunan lynk.id (kita tidak bisa edit lynk)

Anton bisa paste sendiri:

1. Kartu pertama: **Mentoring** — “Live class + semua produk di bawah.” Pintu: WA.
2. Grup **Alat:** Calculator, AI Creative, AI Analisa Data.
3. Grup **Rekaman:** Naik harga, Algoritma, Ads GMV.
4. Harga lynk tetap. LMS tidak checkout.
