# Sekolah Anton — mentoring funnel + CRM

_Internal. Localhost prototype only. Do not deploy, do not apply SQL on Contabo._

Run: `bash school/serve.sh` → http://127.0.0.1:8765/school/

Dual-view walkthrough (Anton desktop + student HP): http://127.0.0.1:8765/school/present.html

This extends [README.md](./README.md). Offline lock unchanged.

## Cycle

1. Anton adds the person to the class WhatsApp group (manual).
2. Group CTA → school. **Form first:** nama, WA, pengalaman, kenapa mau di-mentor.
3. **Payment page.** Clocked 24-hour welcome discount starts at form submit (remaining time is real; no fake seat count).
   - Bayar sekarang: monthly **transfer** (rekening in Pengaturan bayar), annual transfer discount, or card autopay discount (Mayar mock).
   - **Bayar nanti:** Home looks like the real school; only video 1 + lembar kerja unlock.
4. After video 1: in-app pay prompt. At 12 hours left: queued WA to the student + a **task for Anton** to open WA himself (never auto-send as Anton).
5. Unpaid after 24h → **Nurture**. “Tidak tertarik” → **extended nurture**.
6. Paid → full class for the term (month / year / autopay). Laris Affiliate stays extra.
7. Renewal defaults: 5-day warning WA → Anton personal WA task → 1-day grace. Anton edits delays in **Otomasi**. After grace: preview-only + Nurture.
8. Finish 12 videos → one sitting **tes** → certificate if pass → eligible mentor. Anton (or they) accept with **disclosed 20% licensing**. Not auto-enrol. One downline level.

## Access

| State | Belajar | Tools lynk | Laris Affiliate | Live / Diskusi / Kolab |
|---|---|---|---|---|
| Trial / nurture unpaid | Video 1 + supplies | Dual CTA: satuan or mentoring | Always satuan | Locked |
| Mentoring lunas / grace / beasiswa | All 12 | Included | Satuan unless bought | Open |
| SKU only | Locked | Owned SKUs | If bought | Locked |

## CRM (roster + profil + otomasi)

Satu tab **Siswa** dengan tiga kamera: **Daftar** (baris orang ala CRM: nama+foto, telepon, email, stage, nilai, tag · filter stage) · **Pipa** (kanban drag-and-drop, aksen warna kolom) · **Progres** (heatmap + titik materi). Klik nama membuka **profil 3 kolom** (bukan drawer): kiri kontak, tengah catatan/linimasa, kanan tugas + rencana aksi. Foto TikTok (oEmbed → unavatar.io, cache IndexedDB, fallback inisial + unggah).

**Otomasi** = peta visual (pemicu → tunggu jam → email / WA / tugas / pindah stage → selesai). Buat / salin / arsip. Seed **Onboarding bayar**. Tidak auto-kirim.

**Tugas** dikelompokkan hari ini / mendatang / selesai. **Antrian** = WA | email.

**Kurikulum:** cover modul/item, banyak file, item teks. Blob IndexedDB (cover ~5 MB, file ~20 MB).

Mentor tabs: Siswa · Tugas · Antrian · Otomasi · Jaringan · Kurikulum · … · Pembayaran · Pengaturan bayar.

**Simulasi jam** (+1h / +12h / +1d) on the mentor chrome to demo clocks without waiting. Queued WA/email is `wa.me` / `mailto` + status, not live send.

## Money

Anton is merchant. LarisID never holds student fees.

Placeholder list (editable): monthly Rp500.000; annual −15%; card autopay −10%; 24h welcome −20%.

Certified mentors collect from **their** students. CRM **setoran 20%** is expected vs received. Mission: this is a disclosed curriculum/brand licensing fee, one level, no recruit bonuses.

## Personas (siswa switcher)

| Persona | Demo |
|---|---|
| Tamu baru (wizard) | Form → pay |
| Ayu | Trial, clock running |
| Farah | Watched v1, unpaid, Anton task |
| Gilang | Tidak tertarik |
| Hadi | Perpanjangan 5 hari |
| Irma | Grace |
| Joko | Lulus tes, layak mentor |
| Dewi Mentor | Downline Oki (mentoring) + Putri (SKU + Affiliate) |
| Kamu / Nina / … | Aktif seperti sebelumnya |

Reset lokal clears `localStorage` key `anton-school-v3`.

## Dual-view presentation

`school/present.html` — localhost only. Laptop (Anton CRM) on the left, phone (siswa) on the right. Two acts with Next/Prev; both frames are the live app. Clicking inside a bezel is allowed; Next resumes the script.

| Bab | Adegan |
|---|---|
| 1 Tutup trial | Tamu form → pay 24 jam → Ayu bayar nanti → video 1 → Farah nonton → antrian WA 12 jam → Kamu lunas (Affiliate tetap satuan) |
| 2 Jaga & luluskan | Hadi perpanjangan → Irma grace → Joko sertifikat → 20% licensing → Jaringan Dewi |

Keyboard: Left/Right. Reset demo returns to the first scene of the current act. Do not deploy.
