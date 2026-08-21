// Win-back campaign copy for the pre-2026-07-16 cohort.
//
// Voice rules (docs/LAUNCH_FOLLOWUP.md): Bahasa Indonesia, informal "kamu",
// "dari penjual untuk penjual", gratis never betrayed, no emojis, CTA verbs
// Mulai / Cek / Lihat / Temukan / Coba.
//
// Design rules, from the re-engagement research (see the plan file):
//   - No hero images and no image-only content. Every message and CTA is live
//     text, because images are blocked by default in many clients and an
//     all-image email is a classic spam signal.
//   - Segment C and the sunset email are TRUE plain text with no template
//     chrome: for those two the goal is a reply, and plain text measurably
//     outperforms designed HTML on reply rate for cold contacts.
//   - Every HTML send carries a hand-written text/plain alternative, not an
//     auto-stripped one.
//   - Styled for light and dark mode.
//
// IMPORTANT wording constraint: the comeback pass lifts the DIVE cap only. The
// AI question pool stays metered at 5/day because AI calls cost real money. The
// copy therefore promises "riset produk tanpa batas", never blanket "unlimited".

export type CityRow = {
  product_name: string
  price: number
  total_sold: number
  sellers: number
}

export type MarketTeardown = {
  nama_pasar: string
  jumlah_penjual: number
  omset_bulanan: number
  harga_median: number
  harga_min: number
  harga_max: number
  insight: string
}

export type Ctx = {
  nama: string          // already sanitised; "" means use the neutral greeting
  bulanDaftar: string   // e.g. "Mei"
  kota: string          // "" when unknown
  tanggalData: string   // e.g. "31 Juli"
  linkKlaim: string
  linkPantau: string
  linkUnsub: string
  rows?: CityRow[]
  pasar?: MarketTeardown
  // Self-hosted 1x1 open-tracking pixel. Omitted for the two PLAIN_ONLY
  // campaigns (no HTML body to embed it in) and safe to omit anywhere else --
  // shell() just skips the <img> tag when it's not set.
  pixelUrl?: string
}

export type Rendered = {
  subject: string
  html: string | null   // null for plain-text-only campaigns
  text: string
}

export const CAMPAIGNS = [
  'wb1_a', 'wb1_b', 'wb1_c',
  'wb2_kota',
  'wb3_pantau_a', 'wb3_pantau_b',
  'wb4_bedah',
  'wb5_sunset',
] as const

export type Campaign = typeof CAMPAIGNS[number]

// Campaigns that must go out as bare plain text, one send at a time.
export const PLAIN_ONLY: Campaign[] = ['wb1_c', 'wb5_sunset']

// Which audience segment each campaign targets. null = any segment.
export const CAMPAIGN_SEGMENT: Record<Campaign, string | null> = {
  wb1_a: 'A',
  wb1_b: 'B',
  wb1_c: 'C',
  wb2_kota: null,
  wb3_pantau_a: null,
  wb3_pantau_b: null,
  wb4_bedah: null,
  wb5_sunset: null,
}

const greet = (nama: string) => (nama ? `Halo ${nama},` : 'Halo,')

const rupiah = (n: number) =>
  'Rp' + Math.round(n).toLocaleString('id-ID')

const angka = (n: number) => Math.round(n).toLocaleString('id-ID')

// Shopee titles are keyword-stuffed to 150+ characters ("Saringan Minyak
// Stainless Steel Anti Karat - Tahan Lama & Mudah Dibersihkan | Alat Tulis ...").
// Dropped whole into an email table they wrap to five lines each and the row
// stops being scannable, so cut at a word boundary.
function trimNama(s: string, max = 58): string {
  const t = String(s || '').replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const sp = cut.lastIndexOf(' ')
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s|,\-]+$/, '') + '...'
}

const esc = (s: string) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// ---------------------------------------------------------------------------
// HTML shell. Single column, system fonts, no images, light and dark aware.
// The CTA is live text inside a table cell so it survives image blocking and
// renders as a button everywhere including Outlook.
// ---------------------------------------------------------------------------
function shell(bodyHtml: string, linkUnsub: string, pixelUrl?: string): string {
  return `<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
  :root { color-scheme: light dark; }
  body { margin:0; padding:0; background:#F5F5F4; }
  .wrap { max-width:600px; margin:0 auto; padding:24px 16px; }
  .card { background:#FFFFFF; border:1px solid #E5E7EB; border-radius:10px; padding:28px 24px; }
  .brand { font-weight:800; font-size:15px; letter-spacing:.02em; color:#1A1F3C; margin:0 0 20px; }
  p { margin:0 0 16px; }
  .cta a { background:#E8442A; color:#FFFFFF !important; text-decoration:none;
           display:inline-block; padding:13px 22px; border-radius:8px; font-weight:700; }
  .foot { font-size:12px; color:#9CA3AF; margin:24px 0 0; padding-top:16px; border-top:1px solid #E5E7EB; }
  .foot a { color:#9CA3AF; }
  /* Products stack instead of sitting in a 4-column grid: on a 375px phone --
     how most of this audience reads email -- four columns wrapped every product
     name onto six lines and pushed one row past 300px tall. */
  table.data { width:100%; border-collapse:collapse; font-size:14px; margin:0 0 18px; }
  table.data td { padding:12px 0; border-bottom:1px solid #F3F4F6; vertical-align:top; }
  td.rank { width:26px; color:#9CA3AF; font-weight:700; padding-right:8px; }
  .pname { font-weight:600; display:block; margin:0 0 4px; }
  .pmeta { font-size:13px; color:#6B7280; display:block; }
  .pmeta strong { color:#1F2937; font-weight:700; }
  @media (prefers-color-scheme: dark) {
    body { background:#0F1117; }
    .card { background:#171A21; border-color:#2A2F3A; }
    .brand { color:#F5F5F4; }
    body, p, td { color:#E5E7EB; }
    table.data td { border-bottom-color:#232833; }
    .pmeta { color:#9CA3AF; }
    .pmeta strong { color:#E5E7EB; }
    .foot { border-top-color:#2A2F3A; }
  }
</style>
</head>
<body>
<div class="wrap">
  <div class="card" style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1F2937;">
    <p class="brand">Laris</p>
${bodyHtml}
    <p class="foot">
      Kamu menerima email ini karena pernah daftar di
      <a href="https://larisid.com">larisid.com</a>.<br>
      <a href="${esc(linkUnsub)}">Berhenti terima email</a>
    </p>
  </div>
</div>
${pixelUrl ? `<img src="${esc(pixelUrl)}" width="1" height="1" alt="" style="display:block;border:0;outline:none;" />\n` : ''}</body>
</html>`
}

// The CTA is a styled anchor, not an image, so it degrades to a plain link
// everywhere. No duplicate bare URL underneath: it wrapped over three lines on
// mobile and repeating the same destination twice is a mild spam signal. The
// text/plain alternative already carries the raw link for stripped clients.
function ctaHtml(label: string, href: string): string {
  return `    <p class="cta"><a href="${esc(href)}">${esc(label)}</a></p>
`
}

// ---------------------------------------------------------------------------

export function render(campaign: Campaign, c: Ctx): Rendered {
  switch (campaign) {

    // -- Day 0, segment A: never opened a Deep Dive ------------------------
    case 'wb1_a': {
      const subject = c.nama
        ? `${c.nama}, 3 hal berubah total di Laris sejak kamu daftar`
        : '3 hal berubah total di Laris sejak kamu daftar'
      const text = `${greet(c.nama)}

Kamu daftar Laris sekitar ${c.bulanDaftar}, lihat sebentar, terus nggak balik lagi. Jujur saja: waktu itu produknya memang belum cukup berguna. Itu bukan salahmu.

Tiga hal berubah total sejak itu:

1. Cari produk sekarang menampilkan PASAR, bukan listing.
Satu kartu = satu pasar: berapa penjual di dalamnya, omset per bulan, harga median, dan rentang harganya. Bukan lagi 30 listing yang isinya mirip semua.

2. Pantauan Harian.
Pilih sampai 40 keyword dan 20 toko. Kami scrape keyword kamu setiap pagi, jadi tiap hari kamu bisa lihat produk mana yang benar-benar bergerak.

3. Kategori dan kota dirapikan.
Dari 84 nama kategori acak jadi 18 kategori bersih. Kotamu bisa diketik bebas - kalau kotamu belum ada datanya, kami pakai kota terdekat dan bilang kota mana yang dipakai.

Data terakhir masuk ${c.tanggalData}.

Karena kamu daftar duluan, kami buka riset produk tanpa batas selama 7 hari. Nggak perlu bayar, nggak perlu kartu.

Ambil akses 7 hari: ${c.linkKlaim}

Kalau setelah dicoba ternyata masih belum berguna, balas email ini dan bilang apa yang kurang. Saya baca semua.

- Steven, Laris
Dari penjual, untuk penjual.

Berhenti terima email: ${c.linkUnsub}`

      const html = shell(`    <p>${esc(greet(c.nama))}</p>
    <p>Kamu daftar Laris sekitar ${esc(c.bulanDaftar)}, lihat sebentar, terus nggak balik lagi. Jujur saja: waktu itu produknya memang belum cukup berguna. Itu bukan salahmu.</p>
    <p>Tiga hal berubah total sejak itu:</p>
    <p><strong>1. Cari produk sekarang menampilkan PASAR, bukan listing.</strong><br>
    Satu kartu = satu pasar: berapa penjual di dalamnya, omset per bulan, harga median, dan rentang harganya. Bukan lagi 30 listing yang isinya mirip semua.</p>
    <p><strong>2. Pantauan Harian.</strong><br>
    Pilih sampai 40 keyword dan 20 toko. Kami scrape keyword kamu setiap pagi, jadi tiap hari kamu bisa lihat produk mana yang benar-benar bergerak.</p>
    <p><strong>3. Kategori dan kota dirapikan.</strong><br>
    Dari 84 nama kategori acak jadi 18 kategori bersih. Kotamu bisa diketik bebas &mdash; kalau kotamu belum ada datanya, kami pakai kota terdekat dan bilang kota mana yang dipakai.</p>
    <p>Data terakhir masuk ${esc(c.tanggalData)}.</p>
    <p>Karena kamu daftar duluan, kami buka <strong>riset produk tanpa batas selama 7 hari</strong>. Nggak perlu bayar, nggak perlu kartu.</p>
${ctaHtml('Ambil akses 7 hari', c.linkKlaim)}
    <p>Kalau setelah dicoba ternyata masih belum berguna, balas email ini dan bilang apa yang kurang. Saya baca semua.</p>
    <p>&mdash; Steven, Laris<br><em>Dari penjual, untuk penjual.</em></p>
`, c.linkUnsub, c.pixelUrl)
      return { subject, html, text }
    }

    // -- Day 0, segment B: 1-4 Deep Dives ----------------------------------
    case 'wb1_b': {
      const subject = c.nama
        ? `${c.nama}, produk yang dulu kamu cek sekarang ada angka pasarnya`
        : 'Produk yang dulu kamu cek sekarang ada angka pasarnya'
      const text = `${greet(c.nama)}

Dulu kamu sempat buka beberapa produk di Laris lalu berhenti. Masalahnya waktu itu jelas: kamu dapat angka satu listing, tapi bukan gambaran pasarnya. Satu listing laku belum tentu pasarnya masih muat buat pemain baru.

Itu yang kami perbaiki. Sekarang hasil pencarian adalah PASAR: jumlah penjual, total omset per bulan, harga median, dan sebaran harganya. Dari situ baru kelihatan mana yang ramai tapi masih longgar, dan mana yang sudah sesak.

Tambahan yang paling sering diminta: Pantauan Harian. Pilih sampai 5 keyword, kami scrape tiap pagi, dan kamu lihat pergerakannya per hari - bukan tebakan.

Kami buka riset produk tanpa batas selama 7 hari buat kamu.

Lanjut riset: ${c.linkKlaim}

- Steven, Laris
Dari penjual, untuk penjual.

Berhenti terima email: ${c.linkUnsub}`

      const html = shell(`    <p>${esc(greet(c.nama))}</p>
    <p>Dulu kamu sempat buka beberapa produk di Laris lalu berhenti. Masalahnya waktu itu jelas: kamu dapat angka satu listing, tapi bukan gambaran pasarnya. Satu listing laku belum tentu pasarnya masih muat buat pemain baru.</p>
    <p>Itu yang kami perbaiki. Sekarang hasil pencarian adalah <strong>pasar</strong>: jumlah penjual, total omset per bulan, harga median, dan sebaran harganya. Dari situ baru kelihatan mana yang ramai tapi masih longgar, dan mana yang sudah sesak.</p>
    <p>Tambahan yang paling sering diminta: <strong>Pantauan Harian</strong>. Pilih sampai 5 keyword, kami scrape tiap pagi, dan kamu lihat pergerakannya per hari &mdash; bukan tebakan.</p>
    <p>Kami buka <strong>riset produk tanpa batas selama 7 hari</strong> buat kamu.</p>
${ctaHtml('Lanjut riset', c.linkKlaim)}
    <p>&mdash; Steven, Laris<br><em>Dari penjual, untuk penjual.</em></p>
`, c.linkUnsub, c.pixelUrl)
      return { subject, html, text }
    }

    // -- Day 0, segment C: 5+ Deep Dives. Plain text, asking for a reply. ---
    case 'wb1_c': {
      const subject = c.nama ? `Boleh minta 5 menit, ${c.nama}?` : 'Boleh minta 5 menit?'
      const text = `${greet(c.nama)}

Kamu termasuk yang paling serius pakai Laris waktu awal - kamu buka banyak produk dalam satu sesi. Terus berhenti. Saya beneran mau tahu kenapa.

Sejak itu produknya berubah banyak: pencarian sekarang per pasar (jumlah penjual, omset bulanan, harga median), ada Pantauan Harian yang scrape keyword pilihanmu tiap pagi, dan batas hariannya sudah bukan sistem kredit lagi.

Dua hal:

1. Riset produk tanpa batas selama 7 hari, langsung aktif: ${c.linkKlaim}
2. Kalau kamu sempat balas email ini dengan satu kalimat - apa yang bikin kamu berhenti - itu jauh lebih berharga buat saya daripada klik.

- Steven, Laris

Kalau nggak mau terima email lagi: ${c.linkUnsub}`
      return { subject, html: null, text }
    }

    // -- Day 3: the city list ----------------------------------------------
    case 'wb2_kota': {
      const rows = c.rows ?? []
      const subject = c.kota
        ? `5 produk paling laris di ${c.kota} minggu ini`
        : '5 pasar paling ramai minggu ini'
      const dimana = c.kota ? `di sekitar ${c.kota}` : 'di pasar Shopee Indonesia'

      const textRows = rows.map((r, i) =>
        `${i + 1}. ${trimNama(r.product_name)}\n   ${rupiah(r.price)} | terjual ${angka(r.total_sold)} | ${angka(r.sellers)} penjual di pasar ini`
      ).join('\n')

      const catatanKota = c.kota
        ? ''
        : '\nKami belum tahu kotamu, jadi ini angka nasional. Set kotamu di aplikasi dan daftar berikutnya jadi khusus kotamu.\n'

      const text = `${greet(c.nama)}

Nggak usah baca panjang-panjang. Ini yang paling laku ${dimana} minggu ini, dari data scrape kami:

${textRows}

Angka "terjual" itu total 7 hari terakhir, bukan penjualan kemarin - Shopee cuma menampilkan angka pasti di bawah 1.000 terjual, jadi rentang seminggu jauh lebih bisa dipercaya. Kami sengaja nggak mau kasih angka yang kelihatan meyakinkan tapi ngawur.

Yang biasanya menentukan itu jumlah penjualnya: pasar ramai dengan sedikit penjual jauh lebih gampang dimasuki daripada pasar ramai yang sudah sesak.
${catatanKota}
Lihat pasar lengkapnya: ${c.linkKlaim}

Akses 7 harimu masih aktif dan belum dipakai.

- Steven, Laris

Berhenti terima email: ${c.linkUnsub}`

      const htmlRows = rows.map((r, i) => `      <tr>
        <td class="rank">${i + 1}</td>
        <td>
          <span class="pname">${esc(trimNama(r.product_name))}</span>
          <span class="pmeta">${esc(rupiah(r.price))} &middot; terjual <strong>${esc(angka(r.total_sold))}</strong> &middot; <strong>${esc(angka(r.sellers))}</strong> penjual</span>
        </td>
      </tr>`).join('\n')

      const html = shell(`    <p>${esc(greet(c.nama))}</p>
    <p>Nggak usah baca panjang-panjang. Ini yang paling laku ${esc(dimana)} minggu ini, dari data scrape kami:</p>
    <table class="data">
${htmlRows}
    </table>
    <p>Angka "terjual" itu total 7 hari terakhir, bukan penjualan kemarin &mdash; Shopee cuma menampilkan angka pasti di bawah 1.000 terjual, jadi rentang seminggu jauh lebih bisa dipercaya. Kami sengaja nggak mau kasih angka yang kelihatan meyakinkan tapi ngawur.</p>
    <p>Yang biasanya menentukan itu jumlah penjualnya: pasar ramai dengan sedikit penjual jauh lebih gampang dimasuki daripada pasar ramai yang sudah sesak.</p>
${c.kota ? '' : '    <p>Kami belum tahu kotamu, jadi ini angka nasional. Set kotamu di aplikasi dan daftar berikutnya jadi khusus kotamu.</p>\n'}${ctaHtml('Lihat pasar lengkapnya', c.linkKlaim)}
    <p>Akses 7 harimu masih aktif dan belum dipakai.</p>
    <p>&mdash; Steven, Laris</p>
`, c.linkUnsub, c.pixelUrl)
      return { subject, html, text }
    }

    // -- Day 7, claimed the pass -------------------------------------------
    case 'wb3_pantau_a': {
      const subject = c.nama ? `Akses penuhmu habis besok, ${c.nama}` : 'Akses penuhmu habis besok'
      const text = `${greet(c.nama)}

Akses riset tanpa batasmu habis besok. Setelah itu kamu balik ke jatah biasa: 10 Deep Dive per hari - tetap cukup buat riset santai, dan LarisID tetap gratis, selamanya.

Satu hal yang saya sarankan kamu lakukan sebelum habis: set up Pantauan Harian. Pilih sampai 40 keyword dan 20 toko yang mau kamu ikuti. Kami scrape tiap pagi dan kamu tinggal buka untuk lihat apa yang bergerak - ini nggak makan jatah harianmu.

Setup-nya satu ketukan: pilih kategori, kami isikan keyword yang paling ramai di sana.

Atur pantauan: ${c.linkPantau}

Kalau nggak dibuka 2 minggu, pantauannya otomatis dijeda biar hemat - keyword dan datamu tetap tersimpan dan jalan lagi begitu kamu buka.

- Steven, Laris

Berhenti terima email: ${c.linkUnsub}`

      const html = shell(`    <p>${esc(greet(c.nama))}</p>
    <p>Akses riset tanpa batasmu habis besok. Setelah itu kamu balik ke jatah biasa: 10 Deep Dive per hari &mdash; tetap cukup buat riset santai, dan LarisID tetap gratis, selamanya.</p>
    <p>Satu hal yang saya sarankan kamu lakukan sebelum habis: <strong>set up Pantauan Harian.</strong> Pilih sampai 40 keyword dan 20 toko yang mau kamu ikuti. Kami scrape tiap pagi dan kamu tinggal buka untuk lihat apa yang bergerak &mdash; ini nggak makan jatah harianmu.</p>
    <p>Setup-nya satu ketukan: pilih kategori, kami isikan keyword yang paling ramai di sana.</p>
${ctaHtml('Atur pantauan', c.linkPantau)}
    <p>Kalau nggak dibuka 2 minggu, pantauannya otomatis dijeda biar hemat &mdash; keyword dan datamu tetap tersimpan dan jalan lagi begitu kamu buka.</p>
    <p>&mdash; Steven, Laris</p>
`, c.linkUnsub, c.pixelUrl)
      return { subject, html, text }
    }

    // -- Day 7, never claimed. Last email of the primary sequence. ---------
    case 'wb3_pantau_b': {
      const subject = 'Akses 7 harimu belum diambil'
      const text = `${greet(c.nama)}

Minggu lalu saya buka riset produk tanpa batas selama 7 hari buat kamu, dan sampai sekarang belum diambil. Nggak ada syarat, nggak perlu bayar - tinggal klik.

Yang berubah sejak terakhir kamu buka: pencarian sekarang menampilkan pasar (jumlah penjual, omset bulanan, harga median), bukan tumpukan listing. Data terakhir masuk ${c.tanggalData}.

Ambil sekarang: ${c.linkKlaim}

Ini email terakhir soal akses ini.

- Steven, Laris

Berhenti terima email: ${c.linkUnsub}`

      const html = shell(`    <p>${esc(greet(c.nama))}</p>
    <p>Minggu lalu saya buka <strong>riset produk tanpa batas selama 7 hari</strong> buat kamu, dan sampai sekarang belum diambil. Nggak ada syarat, nggak perlu bayar &mdash; tinggal klik.</p>
    <p>Yang berubah sejak terakhir kamu buka: pencarian sekarang menampilkan pasar (jumlah penjual, omset bulanan, harga median), bukan tumpukan listing. Data terakhir masuk ${esc(c.tanggalData)}.</p>
${ctaHtml('Ambil sekarang', c.linkKlaim)}
    <p>Ini email terakhir soal akses ini.</p>
    <p>&mdash; Steven, Laris</p>
`, c.linkUnsub, c.pixelUrl)
      return { subject, html, text }
    }

    // -- Day 21: one real market teardown, no offer -------------------------
    case 'wb4_bedah': {
      const p = c.pasar
      if (!p) throw new Error('wb4_bedah requires ctx.pasar')
      const subject = `Bedah satu pasar: ${p.nama_pasar}`
      const text = `${greet(c.nama)}

Nggak ada tawaran di email ini. Cuma satu contoh hasil riset, biar kamu bisa nilai sendiri apakah alat ini berguna.

${p.nama_pasar} - ${angka(p.jumlah_penjual)} penjual, omset pasar sekitar ${rupiah(p.omset_bulanan)} per bulan, harga median ${rupiah(p.harga_median)} (rentang ${rupiah(p.harga_min)} sampai ${rupiah(p.harga_max)}).

Yang menarik: ${p.insight}

Semua angka itu dari satu layar di Laris, gratis.

Cek pasar kamu sendiri: ${c.linkKlaim}

- Steven, Laris

Berhenti terima email: ${c.linkUnsub}`

      const html = shell(`    <p>${esc(greet(c.nama))}</p>
    <p>Nggak ada tawaran di email ini. Cuma satu contoh hasil riset, biar kamu bisa nilai sendiri apakah alat ini berguna.</p>
    <p><strong>${esc(p.nama_pasar)}</strong> &mdash; ${esc(angka(p.jumlah_penjual))} penjual, omset pasar sekitar ${esc(rupiah(p.omset_bulanan))} per bulan, harga median ${esc(rupiah(p.harga_median))} (rentang ${esc(rupiah(p.harga_min))} sampai ${esc(rupiah(p.harga_max))}).</p>
    <p>Yang menarik: ${esc(p.insight)}</p>
    <p>Semua angka itu dari satu layar di Laris, gratis.</p>
${ctaHtml('Cek pasar kamu sendiri', c.linkKlaim)}
    <p>&mdash; Steven, Laris</p>
`, c.linkUnsub, c.pixelUrl)
      return { subject, html, text }
    }

    // -- Day 45: sunset. Plain text, permission reset. ----------------------
    case 'wb5_sunset': {
      const subject = 'Terakhir dari saya - mau saya berhenti kirim email?'
      const text = `${greet(c.nama)}

Ini email terakhir dari rangkaian ini. Kamu daftar Laris beberapa bulan lalu dan sejak itu nggak pernah buka lagi, jadi wajar kalau ini sudah nggak relevan.

Kalau memang begitu, berhenti di sini: ${c.linkUnsub}
Satu klik, selesai, akunmu tetap aman kalau suatu saat mau balik.

Kalau kamu masih jualan dan cuma lagi sibuk, nggak usah apa-apa. Saya akan kirim ringkasan pasar sebulan sekali, itu saja.

- Steven, Laris
Dari penjual, untuk penjual.`
      return { subject, html: null, text }
    }
  }
}
