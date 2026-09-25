# MasterMind with Anton GC — offline prototype + remote demo

_Internal. Not a public product. Do not apply SQL on Contabo, do not merge
this branch to `main`, do not copy `school/` into `scripts/assemble-site.sh`._

**Remote demo (Anton, 25 Sep 2026):**
[https://mastermind-anton.pages.dev/s/obrolan.marketing?invite=ANTON-SEP26](https://mastermind-anton.pages.dev/s/obrolan.marketing?invite=ANTON-SEP26)

Separate Cloudflare Pages project (`mastermind-anton`), not `larisid.com`.
Laptop (Mentor) and phone (Siswa) share one KV blob. Anyone with the link
can switch to Mentor — treat the URL as private.

Redeploy: `bash scripts/deploy-school-pages.sh`

Run locally from the repo root:

```bash
bash school/serve.sh
# vanity (Anton): http://127.0.0.1:8765/s/obrolan.marketing
# join + invite:  http://127.0.0.1:8765/s/obrolan.marketing?invite=ANTON-SEP26
# legacy path:    http://127.0.0.1:8765/school/
# walkthrough:    http://127.0.0.1:8765/school/present.html
# local sync:     add ?sync=1 (needs wrangler pages dev)
```

## Anton — tes 10 langkah (HP + laptop)

1. HP: buka tautan di atas. Peran **Siswa**, pilih **Tamu baru**.
2. Isi form (nama → WA → toko → kota → dari mana). Dock Belajar muncul.
3. Di halaman paket, pilih **1 bulan · transfer**, ketuk **Saya sudah transfer / scan**.
4. Home siswa harus bilang **Menunggu konfirmasi Anton**. Video 1 tetap kebuka; 2–12 terkunci.
5. Laptop: peran **Mentor (Anton)** → tab **Siswa** → kartu **Cek transfer** (atau **Tugas**).
6. Ketuk **Konfirmasi lunas**. Stage jadi Mentee, ledger Lunas.
7. HP (tunggu ~5 detik): banner hilang, 12 video kebuka (baca dulu; selesai tetap berurutan). Affiliate tetap satuan.
8. Laptop: **Pengaturan bayar** — rekening, harga, slug. **Kurikulum** → Edit materi / + Bagian.
9. Laptop: **Simulasi jam** +1 hari sampai kartu mentee **Akan keluar**, lalu habis → siswa kembali preview video 1.
10. **Reset** di salah satu perangkat mengosongkan demo di semua perangkat. Autopay kartu = mock (langsung lunas). WA tidak terkirim.

Masih mock: Mayar sungguhan, webhook, login, blob video IndexedDB (tautan YouTube/Drive ikut sync).

## School URLs (creator-mentor LMS)

Same pattern as lynk / Skool / Whop: one **slug** per school on a shared domain.

| | |
|---|---|
| Production target | `https://larisid.com/s/{slug}` |
| Anton | `https://larisid.com/s/obrolan.marketing` (same handle as `lynk.id/obrolan.marketing`) |
| Join | `…/s/{slug}?invite={batch-code}` |
| Display name | Free-form (`MasterMind with Anton GC`) — not in the path |

Slug rules (draft `schools.slug`): lowercase, letters/digits/`.`/`-`/`_`, no `..`, max 64, reserved path segments blocked. Mentors edit slug + invite under **Pengaturan bayar → Alamat sekolah**. Lynk stays the paid storefront; `/s/{slug}` is the class after they’re in.

Future mentors get their own `schools` row + slug (e.g. `/s/dewi-live`). Do not put Rise kohorts on this path until an explicit go.

Live Kohort Pertama (`js/laris-cohort.js` + `#view-cohort`) is untouched.
This folder is not copied by `scripts/assemble-site.sh`.

## Two tracks

| | Seller kohort (Rise) | Creator-mentor school (Anton) |
|---|---|---|
| Who | Hendra / Afryian, Batch 1 | Anton, then other mentors |
| Job | Shop-crawl verified progress, Toko Saya | Live class + kurikulum + tools + WA |
| Live UI | Ringkasan / Siswa / Feed / Jadwal | Prototype: Home / Belajar / Alat / Pustaka / Diskusi / Progres |
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

**Funnel + CRM** (localhost): form → 24h offer or bayar nanti → first-video
preview → Follow Up Boss pipeline, tasks, queued WA, customizable renewal.
Finish program → tes + sertifikat → optional mentor with disclosed 20%
licensing. Laris Affiliate is never bundled. Details:
[FUNNEL.md](./FUNNEL.md). Draft SQL (do not apply):
[`school/sql/20260918120000_anton_funnel_crm.sql`](../../school/sql/20260918120000_anton_funnel_crm.sql).
Walk Anton through it on localhost: [`school/present.html`](../../school/present.html)
(desktop CRM + HP siswa, two acts). Not in `assemble-site.sh`.

Kurikulum contoh: **12 video** (4 minggu × 3). Tiap video punya lembar kerja,
poin penting, dan 2 pertanyaan cek pemahaman (bukan ujian). Check hijau + bar
% untuk seluruh kurikulum. Kolab tetap alat mentoring di Pustaka, bukan salah
satu dari 12.

Mentor (desktop) boleh ganti bagian jadi **minggu atau modul**, rename, tambah,
urutkan, tutup/buka dengan panah, dan unggah video (tautan YouTube/Drive atau
file MP4 di browser ini). Asisten hanya lihat. **+ Bagian** nempel di toolbar
atas supaya tidak hilang di bawah modul yang panjang.

Siswa punya tab **Alat** (kalkulator, AI creative, AI analisa, plus Kolab kalau
mentoring) — daftar teks, tanpa cover lynk. Pustaka tetap etalase + rekaman.
Checkout tetap lynk.id.

Kalkulator (`school/tools/harga.html`) memakai contoh Anton langsung, hasil harga
di atas, potongan di balik “Ubah”, dan **Unduh PDF** (dialog cetak → Simpan
sebagai PDF). Bukan file Excel.

Kolab memakai sampel export Kalodata (`school/data/kalodata-creators.csv`) dan
contoh pengirim **@bule_barat** (akun TikTok Steven). Antrian palsu di LMS: tidak
kirim ke TikTok. Live send is the unpacked extension (`affiliate/extension/`),
not Kaloboost cloud.

## Instagram / lynk — kita tidak ambil alih

Etalase IG (link in bio) **tetap lynk.id/obrolan.marketing**. LMS bukan pengganti
menu Instagram. Lynk = daftar harga + checkout (Anton merchant). Sekolah =
kelas setelah orang sudah bayar / mentoring. Kita tidak edit lynk dan tidak
pindahkan checkout ke LarisID.

## Catalog (lynk.id/obrolan.marketing)

Six products can be bought **satuan**. **Mentoring** unlocks those six plus live class
(Home / Belajar / Diskusi / Kolab). **Laris Affiliate is a seventh SKU and is
never included in mentoring.** Checkout for satuan stays on lynk.id.

| SKU | Harga (coret) | Demo siswa |
|---|---|---|
| Profit Calculator | 99k (129k) | Rina Wulandari |
| AI Creative Assistant | 69k (100k) | mentoring |
| AI Analisa Data | 200k (250k) | mentoring |
| Jangan Naik Harga (rekaman) | 99k (200k) | mentoring |
| Mastering Algorithm (rekaman) | 59.9k (199k) | Toni Wijaya |
| Ads Strategic GMV (rekaman) | 149k (249k) | mentoring |

| Laris Affiliate | 299k (399k) placeholder | Putri Laila (satuan); **never** mentoring |

Persona **Kamu (demo)** = mentoring. **Ayu** = trial video 1. **Budi** = belum form.
Setiap SKU punya **Lihat contoh** sampai Anton ganti file di Perpustakaan mentor.

Kalkulator di `school/tools/harga.html` meniru spreadsheet Anton (Set harga + Toko/HPP),
dengan contoh terisi, hasil tiga harga, dan unduh PDF.

Cover, foto profil, dan logo Obrolan disalin ke `school/assets/obrolan/` dari CDN lynk (bukan hotlink). Pustaka dan rekaman memakai file itu. Tab Alat tidak menampilkan cover.

### Saran susunan lynk.id (kita tidak bisa edit lynk)

Anton bisa paste sendiri:

1. Kartu pertama: **Mentoring** — “Live class + alat lynk di bawah (bukan Laris Affiliate).” Pintu: WA.
2. Grup **Alat:** Calculator, AI Creative, AI Analisa Data.
3. Grup **Rekaman:** Naik harga, Algoritma, Ads GMV.
4. **Laris Affiliate** terpisah — tidak termasuk mentoring.
5. Harga lynk tetap. LMS tidak checkout.
