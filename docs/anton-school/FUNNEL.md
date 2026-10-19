# MasterMind with Anton GC — mentoring funnel + CRM

_Internal. Do not apply SQL on Contabo. Do not merge to `main`._

Remote demo: https://mastermind-anton.pages.dev/s/obrolan.marketing?invite=ANTON-SEP26  
Local: `bash school/serve.sh` → http://127.0.0.1:8765/s/obrolan.marketing  
Dual-view (localhost): http://127.0.0.1:8765/school/present.html

This extends [README.md](./README.md).

## Payment

Anton is merchant. LarisID never holds student fees. Live pay is a Mayar **Headless Invoice** plus webhook. Manual rekening stays as fallback. Do not create a Mayar Kelas Online / membership product (that fee is higher).

**When `MAYAR_API_KEY` is set on Cloudflare:**

1. Siswa ketuk **Bayar sekarang** → `POST /api/pay/invoice`. Prefer VA if `MAYAR_VA_METHOD` is set (`va/bni`, `va/bri`, `va/mandiri`, …); otherwise the Mayar checkout link lets them pick VA or QRIS.
2. Billing stays `pending`, `source: mayar`. CRM chip **Menunggu Mayar**. No Cek transfer task.
3. Mayar `payment.received` → `POST /api/pay/webhook` sets lunas, stage Mentee, timeline `Bayar Mayar`. Same transaction is ignored the second time. HP and laptop unlock on the ~4s state poll.
4. **Konfirmasi manual** remains on the row if Mayar is stuck. It is not required for a normal payment.

**When Mayar is not configured** (localhost, or before the key arrives):

1. **Saya sudah transfer / scan** → `pending`, task **Cek transfer**.
2. Anton **Konfirmasi lunas** → mentoring opens.
3. Kartu autopay is still an instant mock, labeled mock.

Picking ledger **lunas** on a student who is not yet mentoring also grants access. Renewal: 5-day warning → WA task → 1-day grace → video 1 only. Demo clocks: **Simulasi jam**.

Shared state: `GET/PUT /api/state/{slug}?k=ANTON-SEP26` → KV. Poll 4 detik. A paid grant is also stored beside the blob and re-applied on GET and PUT, so a stale browser cannot wipe lunas. Reset clears the school blob; it does not delete old invoice maps. IndexedDB blobs do not sync.

### What to ask Anton

He does not paste the key into the LMS.

1. Mayar API key, Read & Write. Sandbox first from [web.mayar.io/api-keys](https://web.mayar.io/api-keys), then live from [web.mayar.id/api-keys](https://web.mayar.id/api-keys).
2. At least one VA bank and QRIS turned on.
3. After deploy, paste the webhook from **Pengaturan bayar** (or `https://mastermind-anton.pages.dev/api/pay/webhook`) into Mayar → Integration → Webhook, event `payment.received`.
4. Optional: which VA bank should be the default.

Steven, not Anton:

```bash
npx wrangler pages secret put MAYAR_API_KEY --project-name=mastermind-anton
# optional
npx wrangler pages secret put MAYAR_WEBHOOK_SECRET --project-name=mastermind-anton
npx wrangler pages secret put MAYAR_VA_METHOD --project-name=mastermind-anton
```

`MAYAR_API_BASE` lives in `school/wrangler.toml` (not a secret). Default `https://api.mayar.io/hl/v2` (sandbox). Live flip: `https://api.mayar.id/hl/v2`, put the live key, redeploy, Anton saves the webhook URL, one small invoice. If `MAYAR_WEBHOOK_SECRET` is set, Anton must paste the URL that includes `?secret=` (the settings card shows it).

Localhost without Pages Functions keeps the mock. Full path: `npx wrangler pages dev` inside `school/` with the sandbox secret, then open the school with `?sync=1`.

## Cycle

1. Anton adds the person to the class WhatsApp group (manual).
2. Group CTA → school. **Form first, one question per screen** (nama → WA → toko → kota → dari mana), progress ticks, back keeps answers, dock hidden. Same fields: nama, WA, sudah punya toko (kalau ya: nama + tautan), kota, dari mana tahu Anton.
3. **Payment page** (last onboarding screen). Clocked 24-hour welcome discount starts at form submit (remaining time is real; no fake seat count). Applies to 1-month transfer and autopay only — not stacked on 3/6 month.
   - Included: kurikulum, live/diskusi/kolab, grup WA, **50% off all tools**. Laris Affiliate stays satuan.
   - Bayar sekarang: **1 bulan**, **3 bulan** (−15%), **6 bulan** (−25%), or **kartu autopay** (−10%). With a Mayar key this opens a Mayar invoice. Without it, transfer waits for Anton and autopay is a mock. Rekening in Pengaturan bayar is the manual fallback.
   - **Bayar nanti, lihat dulu:** Form selesai → trial aktif + dock **Belajar/Diskusi** muncul (boleh dari halaman bayar). Kurikulum penuh kelihatan; hanya video 1 (cover + checklist + pertanyaan GMV) kebuka, sisanya blur. CTA bayar + countdown 24 jam + FAB **WA Anton**.
4. After video 1: in-app pay prompt. At 12 hours left: queued WA + a **task for Anton**. He taps **Kirim dari CRM** (or Buka WA). Otomasi never auto-sends as Anton.
5. Unpaid after 24h → **Sudah keluar**. “Tidak tertarik” stays its own stage.
6. Paid → **Mentee**. Full class for the term (month / year / autopay). Laris Affiliate stays extra.
7. Renewal defaults: 5-day warning WA → Anton personal WA task → 1-day grace. Stage **Akan keluar**. Anton edits delays in **Otomasi**. After grace: preview-only + **Sudah keluar**.
8. Finish 12 videos → one sitting **tes** → certificate if pass → eligible mentor. Anton (or they) accept with **disclosed 20% licensing**. Not auto-enrol. One downline level.

## Access

| State | Belajar | Tools lynk | Laris Affiliate | Live / Diskusi / Kolab |
|---|---|---|---|---|
| Trial / nonton / sudah keluar unpaid | Video 1 + supplies | Dual CTA: satuan or mentoring | Always satuan | Locked |
| Mentee / akan keluar / beasiswa | All 12 | Included | Satuan unless bought | Open |
| SKU only | Locked | Owned SKUs | If bought | Locked |

## CRM (roster + profil + otomasi)

Satu tab **Siswa** dengan tiga kamera: **Daftar** (baris orang: nama+foto, telepon, email, stage, bayar, nilai · klik baris = profil) · **Pipa** (kanban drag-and-drop) · **Progres** (nama + bar % materi selesai). Stage: WA baru · Form · Nonton belum bayar · 24 jam trial · Mentee · Akan keluar · Sudah keluar · Tidak tertarik · Mentor. Profil 3 kolom: kiri kontak **inline-edit** + status/SKU bayar, tengah chat WA / catatan / linimasa, kanan tugas + rencana aksi. Foto TikTok (oEmbed → unavatar.io, cache IndexedDB, fallback inisial + unggah).

**Otomasi** = peta visual (pemicu → tunggu jam → email / WA / tugas / pindah stage → selesai). Buat / salin / arsip. Seed **Onboarding bayar**. Tidak auto-kirim.

**Tugas** = inbox Follow Up Boss: jenis WA / Email / Telepon / pengingat, tanggal+jam, kelompok terlambat / hari ini / besok / minggu ini / nanti / selesai. Klik nama → profil. Antrian WA memakai **Kirim dari CRM** (thread di profil) plus **Buka WA** cadangan. Bagian **Pesan** menampilkan balasan belum dibaca.

**WhatsApp (kirim + lihat).** Profil siswa, mode WA, adalah chat 1:1: bubble masuk/keluar, Kirim, unread. Live path = Fonnte device + Pages Functions (`/api/wa/send`, `/webhook`, `/thread`) on `mastermind-anton`. Localhost tanpa Fonnte memakai seed thread Farah / Irma. Hanya pesan setelah perangkat tersambung — tidak ada import riwayat WA lama, tidak ada grup. Otomasi tetap tidak auto-kirim. Chat mentoring disimpan untuk operasional (UU PDP); form join bilang nomor dipakai Anton untuk chat.

**Kurikulum:** editor ala Udemy — Bagian N, lecture rows, **+ Item kurikulum** (Lecture / Bacaan / File), **+ Konten** untuk unggah, drag urutan. Cover, file, teks. Blob IndexedDB. Jatuh tempo bagian (Edit) masuk kalender. Tanpa preview HP.

**Perpustakaan:** Anton bisa tambah SKU lokal (lynk URL). Toggle Contoh → File Anton.

**Jadwal:** kalender bulan — kurikulum (due), Meet/Zoom, tugas.

Mentor tabs: Siswa · Tugas · Otomasi · Kurikulum · Perpustakaan · Jadwal · Diskusi · Pengaturan bayar. **Tidak ada** tab Antrian atau Pembayaran — bayar di baris siswa + profil.

**Simulasi jam** (+1h / +12h / +1d) on the mentor chrome to demo clocks without waiting. Queued WA becomes a CRM send (Fonnte when `FONNTE_DEVICE_READY=true`); email stays `mailto`.

## Money

Anton is merchant. LarisID never holds student fees.

Placeholder list (editable): monthly Rp500.000; 3 months −15%; 6 months −25%; card autopay −10%; 24h welcome −20% on 1-month and autopay; mentee tools −50% vs satuan.

Mentoring invoices use the Mayar Invoice API. Prefer VA for the Rp500rb line (channel fee is a flat bank charge). QRIS stays available on the Mayar checkout page. Platform fee is the Invoice rate, not the Kelas Online rate.

Certified mentors collect from **their** students. CRM **setoran 20%** is expected vs received. Mission: this is a disclosed curriculum/brand licensing fee, one level, no recruit bonuses.

## Personas (siswa switcher)

| Persona | Demo |
|---|---|
| Tamu baru (wizard) | Form → pay |
| Ayu | Trial, clock running |
| Farah | Watched v1, unpaid, Anton task |
| Gilang | Tidak tertarik |
| Hadi | Akan keluar (peringatan 5 hari) |
| Irma | Akan keluar (tenggang) |
| Joko | Mentee, lulus tes, layak mentor |
| Dewi Mentor | Mentor · downline Oki (mentoring) + Putri (SKU + Affiliate) |
| Kamu / Nina / … | Mentee |

Reset clears `localStorage` key `anton-school-v3` and, on the remote demo, the shared KV blob. Fresh Reset also slides seed clocks forward so Ayu / Farah / Hadi / Irma stay demoable.

## Dual-view presentation

`school/present.html` — localhost only. Laptop (Anton CRM) on the left, phone (siswa) on the right. Two acts with Next/Prev; both frames are the live app. Clicking inside a bezel is allowed; Next resumes the script.

| Bab | Adegan |
|---|---|
| 1 Tutup trial | Tamu form → pay 24 jam → Ayu bayar nanti → video 1 → Farah nonton → tugas WA 12 jam → Kamu lunas (Affiliate tetap satuan) |
| 2 Jaga & luluskan | Hadi akan keluar → Irma tenggang → Joko sertifikat → 20% licensing → Jaringan Dewi |

Keyboard: Left/Right. Reset demo returns to the first scene of the current act. Do not deploy.
