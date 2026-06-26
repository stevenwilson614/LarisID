# Launch follow-up messages (Day-1 / Day-3)

The single biggest lever for the video cohort is **getting them to come back**
(baseline return ~31%). Acquisition is handled by the video; activation is
strong (~69% reach a Deep Dive). So the job of these messages is one thing:
**bring them back for a second session.**

- **Audience:** run `LAUNCH_FUNNEL.sql` Query C to get the list of cohort
  signups who have NOT returned, with their email + whether they opened a Deep
  Dive. Send Day-1 ~24h after signup, Day-3 ~72h after, to anyone still absent.
- **Voice:** Bahasa Indonesia, informal "kamu", "dari penjual untuk penjual",
  gratis never betrayed. No emojis. CTA verbs: Mulai, Cek, Lihat, Temukan, Coba.
- **Channel:** email for everyone; WhatsApp only for users who opted in via the
  in-app notify popup (`mls-notify-modal`). WA copy is shorter on purpose.
- Replace `https://larisid.com` / links if you use a tracked or deep link.

---

## Day 1 — "come finish what you started"

**Goal:** remind them of the one valuable thing they can do, point at a single
concrete action. Different angle depending on whether they reached a Deep Dive.

### Email — subject options
- `Produk yang kamu cek kemarin, sudah ada angkanya`
- `1 menit: lihat produk mana yang lagi laku di Shopee`

### Email — body (did NOT open a Deep Dive yet)
> Halo kamu,
>
> Makasih sudah daftar LarisID kemarin. Banyak penjual berhenti di sini,
> padahal bagian yang paling berguna baru dimulai.
>
> Coba satu hal ini: buka Discover, pilih satu produk, lalu klik **Deep Dive**.
> Kamu langsung lihat estimasi omset, jumlah penjual, dan seberapa berat
> "dinding ulasan" buat pemain baru — angka asli dari data Shopee, bukan tebakan.
>
> Semua gratis. Tanpa ribet.
>
> Lihat sekarang: https://larisid.com
>
> — Steven, LarisID
> Dari penjual, untuk penjual.

### Email — body (DID open a Deep Dive)
> Halo kamu,
>
> Kemarin kamu sempat cek satu produk di LarisID. Pertanyaannya sekarang:
> produk itu layak kamu jual, atau ada peluang yang lebih gampang?
>
> Balik lagi dan bandingkan 2–3 produk sekaligus. Yang harganya lebih murah
> biasanya jauh lebih cepat tembus — datanya ada di tab **Peluang Pemula**.
>
> Lanjut riset: https://larisid.com
>
> — Steven, LarisID

### WhatsApp (opted-in only)
> Halo, ini Steven dari LarisID. Kemarin kamu daftar tapi belum sempat lihat
> bagian paling bergunanya: buka satu produk lalu klik *Deep Dive* — langsung
> kelihatan estimasi omset & berat saingannya. Gratis. Cek: https://larisid.com

---

## Day 3 — "here's an insight you'd have missed"

**Goal:** give value up front (a real finding), so the click feels worth it.
Lead with the breakout insight, not a generic "we miss you."

### Email — subject options
- `Produk di bawah 10rb 9x lebih gampang laku — ini alasannya`
- `Yang bikin penjual baru gagal di Shopee (dan cara hindarinya)`

### Email — body
> Halo kamu,
>
> Satu temuan dari data Shopee yang sayang kalau kamu lewatkan: produk murah
> (di bawah ~10rb) punya peluang "tembus" jauh lebih tinggi dibanding produk
> mahal. Dan dinding sebenarnya bukan harga — tapi **50 ulasan pertama**.
> Pemenang rata-rata punya ~64 ulasan; yang gagal sering berhenti di 1.
>
> Di LarisID kamu bisa lihat angka ini per produk sebelum mulai jualan —
> termasuk "1 dari sekian" peluang per kategori. Gratis, tanpa langganan.
>
> Cek peluang di kategorimu: https://larisid.com
>
> — Steven, LarisID
> Dari penjual, untuk penjual.

### WhatsApp (opted-in only)
> Halo, Steven lagi. Fakta cepat dari data Shopee: produk murah jauh lebih
> gampang laku, dan dinding sebenarnya = 50 ulasan pertama. Kamu bisa cek
> angkanya per produk di LarisID, gratis. Lihat: https://larisid.com

---

## Notes
- Keep sends small and personal — 100 users is WhatsApp-broadcast / manual-email
  territory, no need for an ESP yet.
- If you add a tracked link, you can confirm follow-up → return in Query A.
- Do not over-send: Day-1 and Day-3 only. If they return, drop them from the list.
