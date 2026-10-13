-- Belajar: free seller course inside the logged-in SPA.
--
-- Not cohort content. milestone_content stays gated to cohort members.
-- Does not touch Rise boards or the Anton school schema.
--
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20261014120000_belajar_course.sql
-- Never: supabase db push --linked
--
-- Re-applying this file overwrites the seeded module/lesson copy (slug is the
-- key). Live admin edits to those same columns are replaced by this seed.

begin;

-- ── Tables ───────────────────────────────────────────────────────────────────

create table if not exists public.course_modules (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  title       text not null,
  subtitle    text,
  sort_order  int not null default 0,
  published   boolean not null default true,
  updated_at  timestamptz not null default now()
);

create table if not exists public.course_lessons (
  id          uuid primary key default gen_random_uuid(),
  module_id   uuid not null references public.course_modules (id) on delete cascade,
  slug        text not null unique,
  title       text not null,
  kind        text not null default 'text'
                check (kind in ('video', 'document', 'text', 'tool')),
  url         text,
  body        text,
  points      jsonb not null default '[]'::jsonb,
  resources   jsonb not null default '[]'::jsonb,
  questions   jsonb not null default '[]'::jsonb,
  action      jsonb,
  platform    text
                check (platform is null or platform in ('shopee', 'tokopedia', 'tiktok', 'lazada')),
  est_mins    int not null default 5 check (est_mins >= 0 and est_mins <= 180),
  sort_order  int not null default 0,
  published   boolean not null default true,
  updated_at  timestamptz not null default now()
);

create index if not exists idx_course_lessons_module
  on public.course_lessons (module_id, sort_order);

create table if not exists public.user_lesson_progress (
  user_id     uuid not null references auth.users (id) on delete cascade,
  lesson_id   uuid not null references public.course_lessons (id) on delete cascade,
  status      text not null check (status in ('draft', 'done', 'skipped')),
  answers     jsonb not null default '{}'::jsonb,
  done_at     timestamptz,
  updated_at  timestamptz not null default now(),
  primary key (user_id, lesson_id)
);

create index if not exists idx_user_lesson_progress_lesson
  on public.user_lesson_progress (lesson_id);

create or replace function public.belajar_platforms_ok(p_platforms text[])
returns boolean
language sql
immutable
as $$
  select coalesce(p_platforms, '{}'::text[])
    <@ array['shopee', 'tokopedia', 'tiktok', 'lazada']::text[];
$$;

create table if not exists public.user_course_state (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  track        text not null default 'new' check (track in ('new', 'existing')),
  platforms    text[] not null default array['shopee']::text[],
  started_at   timestamptz not null default now(),
  completed_at timestamptz,
  updated_at   timestamptz not null default now(),
  constraint user_course_state_platforms_ok check (public.belajar_platforms_ok(platforms))
);

alter table public.course_modules enable row level security;
alter table public.course_lessons enable row level security;
alter table public.user_lesson_progress enable row level security;
alter table public.user_course_state enable row level security;

-- No policies. Reads and writes go through the security-definer RPCs below.

comment on table public.course_modules is
  'Belajar modules. sort_order >= 5 (and slug pantau) is the existing-store track.';
comment on table public.course_lessons is
  'Belajar lessons. action.verify_key: deepdive | favorit3 | kalk | store | pantau.';
comment on table public.user_lesson_progress is
  'draft = answers saved, not finished. done = finished. skipped = left out of the count.';

-- ── Seed helper (dropped at the end of this migration) ──────────────────────

create or replace function public.belajar_seed_lesson(
  p_module text,
  p_slug text,
  p_title text,
  p_kind text,
  p_url text,
  p_body text,
  p_points jsonb,
  p_resources jsonb,
  p_questions jsonb,
  p_action jsonb,
  p_platform text,
  p_mins int,
  p_sort int
) returns void
language plpgsql
as $$
declare
  v_mod uuid;
begin
  select id into v_mod from public.course_modules where slug = p_module;
  if v_mod is null then
    raise exception 'Modul % tidak ada', p_module;
  end if;
  insert into public.course_lessons (
    module_id, slug, title, kind, url, body, points, resources, questions,
    action, platform, est_mins, sort_order, published
  ) values (
    v_mod, p_slug, p_title, p_kind, nullif(btrim(p_url), ''), p_body,
    coalesce(p_points, '[]'::jsonb),
    coalesce(p_resources, '[]'::jsonb),
    coalesce(p_questions, '[]'::jsonb),
    p_action, p_platform, p_mins, p_sort, true
  )
  on conflict (slug) do update set
    module_id = excluded.module_id,
    title = excluded.title,
    kind = excluded.kind,
    url = excluded.url,
    body = excluded.body,
    points = excluded.points,
    resources = excluded.resources,
    questions = excluded.questions,
    action = excluded.action,
    platform = excluded.platform,
    est_mins = excluded.est_mins,
    sort_order = excluded.sort_order,
    published = excluded.published,
    updated_at = now();
end;
$$;

insert into public.course_modules (slug, title, subtitle, sort_order, published)
values
  ('cari', '1. Cari produk',
   'Temukan produk yang orang sudah beli, sebelum kamu belanja stok.', 1, true),
  ('uji', '2. Uji produk',
   'Cek apakah produk itu laku, dan apakah harganya masih menyisakan untung.', 2, true),
  ('supplier', '3. Cari supplier',
   'Barang harus bisa kamu beli lagi, dengan harga yang masih masuk hitungan.', 3, true),
  ('toko', '4. Buka toko',
   'Pilih tempat jualan. Langkah resminya ada di pusat edukasi masing-masing platform.', 4, true),
  ('pantau', '5. Pantau kompetitor',
   'Setelah ada listing, lihat apa yang berubah. Angka yang belum terukur tetap perkiraan.', 5, true)
on conflict (slug) do update set
  title = excluded.title,
  subtitle = excluded.subtitle,
  sort_order = excluded.sort_order,
  published = excluded.published,
  updated_at = now();

select public.belajar_seed_lesson(
  'cari', 'baca-cari-produk', 'Baca tabel, kartu, dan yang sedang naik',
  'text', null,
  $body$Cari Produk menampilkan listing Shopee yang kami scrape.

Tabel adalah baris: foto, harga, omset, unit, review, usia. Kartu adalah grid foto dengan harga, omset per bulan, dan persen mingguan dibanding jendela scrape sebelumnya. Trending Sekarang, di atas Urutkan, adalah 3 listing dengan persen omset mingguan tertinggi di hasil yang sedang terbuka — bukan seluruh Shopee.

Chip kata kunci menyaring tabel dan kartu yang sama.

Omset di kartu adalah perkiraan (harga kali kecepatan), kecuali yang dilabeli terukur. Persen mingguan bukan minggu kalender. Scrape kami berjarak sekitar 12–17 hari, lalu dinormalisasi ke laju 7 hari.$body$,
  jsonb_build_array(
    'Mulai dari Tabel kalau kamu mau membandingkan angka.',
    'Trending Sekarang hanya 3 baris teratas di hasil yang sedang terbuka.',
    'Persen mingguan dibanding jendela scrape sebelumnya, bukan janji minggu depan.'
  ),
  jsonb_build_array(jsonb_build_object(
    'name', 'Cara kerja LarisID',
    'url', '/cara-kerja/'
  )),
  jsonb_build_array(
    jsonb_build_object('q', 'Produk atau kata kunci apa yang mau kamu cek dulu?', 'hint', 'Satu saja. Kamu bisa ganti nanti.'),
    jsonb_build_object('q', 'Kamu lebih mudah baca Tabel atau Kartu?', 'hint', 'Tidak ada yang lebih benar. Pilih yang membuat angkanya kebaca.')
  ),
  jsonb_build_object('label', 'Buka Cari Produk', 'view', 'directory'),
  null, 8, 1
);

select public.belajar_seed_lesson(
  'cari', 'deep-dive-pertama', 'Buka satu Deep Dive',
  'tool', null,
  $body$Deep Dive adalah satu produk, bukan satu kata kunci. Ketuk kartu, atau tanda panah di baris tabel.

Di dalamnya ada sebaran harga, tren omset, dan toko yang menjual produk sejenis. Titik yang belum terukur ditulis perkiraan. Jangan dibaca sebagai janji minggu depan.

Satu Deep Dive sudah cukup untuk langkah ini.$body$,
  jsonb_build_array(
    'Deep Dive = satu listing.',
    'Tren yang belum terukur ditulis perkiraan.',
    'Langkah ini selesai sendiri setelah Deep Dive pertamamu tercatat.'
  ),
  jsonb_build_array(jsonb_build_object(
    'name', 'Cara kerja LarisID',
    'url', '/cara-kerja/'
  )),
  jsonb_build_array(jsonb_build_object(
    'q', 'Produk mana yang kamu buka, dan apa satu hal yang mengejutkan?',
    'hint', 'Harga, jumlah review, atau usia listing. Satu kalimat cukup.'
  )),
  jsonb_build_object('label', 'Cari, lalu buka Deep Dive', 'view', 'directory', 'verify_key', 'deepdive'),
  null, 10, 2
);

select public.belajar_seed_lesson(
  'cari', 'tiga-favorit', 'Simpan tiga produk ke Favorit',
  'tool', null,
  $body$Favorit Aku menyimpan produk, bukan kata kunci. Ketuk bookmark di kartu atau tabel. Kami cek ulang listing itu hampir setiap hari.

Tiga favorit di pasar yang sama lebih berguna daripada tiga pasar acak. Angka terjual harian di Favorit adalah bucket perkiraan, bukan struk toko.

Ada batas sekitar 30 favorit. Simpan yang benar-benar mau kamu bandingkan.$body$,
  jsonb_build_array(
    'Tiga produk di pasar yang sama.',
    'Angka harian di Favorit adalah perkiraan.',
    'Langkah ini selesai sendiri kalau favoritmu sudah tiga atau lebih.'
  ),
  '[]'::jsonb,
  jsonb_build_array(jsonb_build_object(
    'q', 'Kenapa ketiga produk itu, bukan yang lain?',
    'hint', 'Harga, review, atau karena kamu bisa dapat barangnya.'
  )),
  jsonb_build_object('label', 'Buka Favorit Aku', 'view', 'tracker', 'verify_key', 'favorit3'),
  null, 8, 3
);

select public.belajar_seed_lesson(
  'uji', 'baca-angka-jujur', 'Baca omset, review, usia, dan harga yang bergerak',
  'text', null,
  $body$Sebelum membeli stok, baca empat hal pada listing yang sama: harga, omset (perkiraan kecuali terukur), jumlah review, dan usia listing.

Dari pengamatan toko baru di data LarisID — listing yang lahir pada atau setelah 15 April 2026 — listing yang harganya pernah berubah tembus 100 unit kira-kira dua kali lebih sering daripada yang harganya tidak pernah disentuh. Itu pengamatan, bukan perintah "turunkan harga". Kami tidak tahu arah perubahannya, dan kami tidak tahu modal penjualnya. Menurunkan harga di bawah modal adalah kerugian yang dijadwalkan.

Median listing yang tembus 100 unit butuh sekitar 69 hari sejak dibuat. Sepuluh persen tercepat sekitar 29 hari. Angka ini batas atas: kami melihatnya di scrape berikutnya, bukan di detik penjualan. Cara pakai yang jujur: jangan berharap lebih cepat dari ini.

Panjang judul hampir tidak membedakan yang laku dan yang sepi. Yang membedakan adalah pilihan katanya, dan itu berbeda per pasar.

Listing yang sudah laris lebih jarang muncul di slot iklan pada hasil yang kami scrape. Jangan dibaca sebagai "iklan tidak berguna". Yang sudah naik sendiri lebih jarang butuh slot itu.$body$,
  jsonb_build_array(
    'Harga yang diuji berkorelasi dengan hasil lebih baik. Arahnya tidak kami ketahui.',
    'Jangan jadikan iklan yang lebih jarang pada listing laris sebagai alasan berhenti beriklan.',
    'Di pasar yang hanya belasan listing, median bukan fakta pasar.'
  ),
  jsonb_build_array(
    jsonb_build_object('name', 'Kalkulator margin dan HPP', 'url', '/kalkulator/margin-hpp/'),
    jsonb_build_object('name', 'Ringkasan biaya admin Shopee (resmi)', 'url', 'https://seller.shopee.co.id/edu/article/3489')
  ),
  jsonb_build_array(
    jsonb_build_object(
      'q', 'Kalau produk ini baru tembus 100 unit dalam dua bulan, apakah itu masih masuk akal untuk modalmu?',
      'hint', '69 hari adalah median yang kami amati, bukan target yang harus dikejar.'
    ),
    jsonb_build_object(
      'q', 'Harga listing yang kamu lirik: pernah berubah, atau dipasang sekali?',
      'hint', 'Berubah belum tentu turun. Yang kami lihat adalah harga yang diuji.'
    )
  ),
  null, null, 12, 1
);

select public.belajar_seed_lesson(
  'uji', 'cek-margin', 'Hitung margin sebelum percaya omset',
  'tool', null,
  $body$Omset besar dengan margin tipis tetap bisa rugi. Isi harga jual dan harga pokok di Kalkulator, lalu simpan ke Riwayat.

Biaya platform di kalkulator adalah potongan marketplace, bukan komisi afiliasi. Tarif Shopee berubah. Cek halaman resmi dan halaman biaya LarisID sebelum kamu mengunci harga dari ingatan.

Langkah ini selesai sendiri setelah ada kalkulasi yang kamu simpan.$body$,
  jsonb_build_array(
    'Isi harga pokok yang nyata: beli, kemasan, dan ongkir yang kamu tanggung.',
    'Simpan perhitungan. Angka di kepala mudah digeser.',
    'Jangan pasang harga di bawah modal supaya kelihatan murah.'
  ),
  jsonb_build_array(
    jsonb_build_object('name', 'Biaya admin Shopee di LarisID', 'url', '/kalkulator/biaya-shopee/'),
    jsonb_build_object('name', 'Rincian biaya per kategori (resmi)', 'url', 'https://seller.shopee.co.id/edu/article/15965'),
    jsonb_build_object('name', 'Ketentuan biaya admin Non-Star (resmi)', 'url', 'https://seller.shopee.co.id/edu/article/7187')
  ),
  jsonb_build_array(jsonb_build_object(
    'q', 'Modal per unitmu berapa, dan sisa bersih per unit setelah potongan platform?',
    'hint', 'Kalau harga pokok belum ketemu, tulis "belum" — itu jawaban yang jujur.'
  )),
  jsonb_build_object('label', 'Buka Kalkulator', 'view', 'kalkulator', 'verify_key', 'kalk'),
  null, 10, 2
);

select public.belajar_seed_lesson(
  'uji', 'tanya-seller', 'Tanya seller lain',
  'tool', null,
  $body$Di Komunitas, tab Diskusi, kamu bisa bertanya ke penjual lain. Tulis kata kunci produknya.

Jangan tempel harga atau omset orang lain ke dalam pertanyaan. Tidak ada yang otomatis terkirim dari pelajaran ini. Kamu yang menekan kirim, kalau memang mau bertanya.

Kalau tidak ada yang perlu ditanya, tandai selesai setelah kamu baca cara bertanyanya. Lewati juga boleh — langkah yang dilewati tidak dihitung selesai, dan tidak memalsukan progres.$body$,
  jsonb_build_array(
    'Satu pertanyaan spesifik lebih mudah dibalas daripada "gimana cara laris".',
    'Jangan tempel harga atau omset toko lain.',
    'Tidak ada kiriman otomatis.'
  ),
  '[]'::jsonb,
  jsonb_build_array(jsonb_build_object(
    'q', 'Apa satu hal yang belum kelihatan dari data, yang cuma penjual lain yang tahu?',
    'hint', 'Pengiriman, retur, atau supplier. Kosongkan kalau belum ada.'
  )),
  jsonb_build_object('label', 'Buka Komunitas', 'view', 'community'),
  null, 6, 3
);

select public.belajar_seed_lesson(
  'supplier', 'sumber-barang', 'Lima jalan cari barang',
  'text', null,
  $body$Tidak ada satu supplier ajaib. Lima jalan yang biasa dipakai, dari yang paling dekat:

1. Produsen atau UMKM di kotamu. Datang, minta sampel, tanya minimal order.
2. Pasar grosir fisik di kotamu. Lihat barangnya sebelum transfer.
3. Grosir di marketplace. Cari penjual dengan stok yang stabil dan ulasan soal pengiriman, bukan cuma harga termurah.
4. Importir, atau pabrik lewat 1688. Harga bisa lebih rendah, tapi ada ongkir internasional, bea, dan waktu tunggu. Ini bukan cara menghindari aturan. Cek kewajiban usahamu dan bea masuk sebelum pesan dalam jumlah besar.
5. Dropship atau reseller. Modal kecil, margin sering tipis, dan kamu bergantung pada pengirim orang lain. Cocok untuk mencoba permintaan. Lemah untuk toko yang mau tahan lama.

Pilih satu jalan untuk produk yang sudah kamu uji. Jangan pesan stok besar di jalan yang belum kamu coba.$body$,
  jsonb_build_array(
    'Sampel dulu, stok kemudian.',
    'Harga termurah yang tidak sampai adalah harga termahal.',
    '1688 bukan jalan pintas aturan bea atau izin usaha.'
  ),
  jsonb_build_array(
    jsonb_build_object('name', '1688', 'url', 'https://www.1688.com/'),
    jsonb_build_object('name', 'Pusat Edukasi Penjual Shopee', 'url', 'https://seller.shopee.co.id/edu')
  ),
  jsonb_build_array(jsonb_build_object(
    'q', 'Jalan mana yang paling masuk akal untuk produkmu, dan kenapa bukan yang lain?',
    'hint', 'Satu jalan. Kamu bisa ganti setelah sampel.'
  )),
  null, null, 12, 1
);

select public.belajar_seed_lesson(
  'supplier', 'sampel-dan-hpp', 'Sampel, lalu tulis harga pokok',
  'text', null,
  $body$Sebelum listing, pegang barangnya kalau bisa. Cek yang sering bikin retur: ukuran tidak sesuai foto, bahan tipis, kemasan penyok, atau jumlah isi kurang.

Tulis harga pokok di satu tempat: harga beli, ongkir sampel, kemasan, label, dan ongkir rata-rata ke pembeli kalau kamu yang tanggung. Itu yang kamu masukkan ke Kalkulator.

Kalau harga pokok belum ketemu, kamu belum siap pasang harga.$body$,
  jsonb_build_array(
    'Satu sampel yang jelek menghemat satu dus yang tidak laku.',
    'Harga pokok yang "kira-kira" biasanya kurang, bukan lebih.',
    'Masukkan ongkir yang kamu tanggung, jangan cuma harga beli.'
  ),
  jsonb_build_array(jsonb_build_object(
    'name', 'Kalkulator margin dan HPP',
    'url', '/kalkulator/margin-hpp/'
  )),
  jsonb_build_array(jsonb_build_object(
    'q', 'Apa yang akan kamu cek pada sampel sebelum pesan ulang?',
    'hint', 'Satu cacat yang paling mahal kalau lolos: ukuran, bahan, atau isi.'
  )),
  null, null, 8, 2
);

select public.belajar_seed_lesson(
  'toko', 'pilih-platform', 'Pilih tempat kamu mau jual',
  'text', null,
  $body$LarisID datanya Shopee, jadi riset produk di sini paling kuat untuk Shopee. Toko boleh di tempat lain.

Centang platform di atas halaman ini. Hanya platform yang kamu centang yang masuk hitungan progres. Kamu bisa menambah nanti.

Tokopedia dan TikTok Shop Indonesia sekarang satu Seller Center. Kamu tetap bisa centang keduanya: Tokopedia untuk etalase, TikTok Shop untuk video dan LIVE. Pendaftarannya sering satu akun, lalu akun TikTok ditautkan.

Lazada punya Seller Center dan Lazada University sendiri.

Mulai dari satu platform sampai ada listing yang hidup. Platform kedua menyalin kerja. Ia tidak menggandakan pembeli dengan sendirinya.$body$,
  jsonb_build_array(
    'Centang jujur. Platform yang tidak kamu centang tidak dihitung.',
    'Tokopedia dan TikTok Shop Indonesia berbagi Seller Center.',
    'Satu toko yang hidup lebih berguna daripada empat toko kosong.'
  ),
  '[]'::jsonb,
  jsonb_build_array(jsonb_build_object(
    'q', 'Platform mana yang kamu buka duluan, dan kenapa?',
    'hint', 'Shopee kalau kamu memakai data LarisID sebagai dasar. Tempat lain boleh, asal kamu tahu datanya di sini bukan dari sana.'
  )),
  null, null, 6, 1
);

select public.belajar_seed_lesson(
  'toko', 'buka-shopee', 'Buka toko Shopee',
  'document', 'https://seller.shopee.co.id/edu/article/464',
  $body$Daftar lewat aplikasi Shopee (Mulai Jual) atau Seller Center. Verifikasi identitas memakai KTP pemilik akun. Lengkapi info toko, lalu unggah produk.

Detail resminya ada di artikel "Mulai Berjualan di Shopee". Buka tautannya. Kalau langkah di layar Shopee berubah, yang di layar mereka yang berlaku — ringkasan ini cuma peta.$body$,
  jsonb_build_array(
    'KTP yang dipakai harus milik pemilik akun.',
    'Nama toko yang kebaca lebih berguna daripada nama yang susah dicari.',
    'Ikuti layar Seller Center kalau berbeda dari ringkasan ini.'
  ),
  jsonb_build_array(
    jsonb_build_object('name', 'Mulai berjualan di Shopee (resmi)', 'url', 'https://seller.shopee.co.id/edu/article/464'),
    jsonb_build_object('name', 'Shopee Seller Center', 'url', 'https://seller.shopee.co.id/'),
    jsonb_build_object('name', 'Pusat Edukasi Penjual', 'url', 'https://seller.shopee.co.id/edu')
  ),
  jsonb_build_array(jsonb_build_object(
    'q', 'Sampai langkah mana kamu hari ini: akun, verifikasi, atau belum mulai?',
    'hint', 'Jujur. Belum mulai juga jawaban.'
  )),
  null, 'shopee', 15, 2
);

select public.belajar_seed_lesson(
  'toko', 'buka-tokopedia', 'Buka toko Tokopedia',
  'document', 'https://seller-id.tokopedia.com/account/register',
  $body$Pendaftaran penjual Indonesia ada di Seller Center Tokopedia & TikTok Shop. Individu biasanya diminta KTP. Peninjauan platform bisa sampai beberapa hari. Itu antrean mereka, bukan tanda gagal.

Setelah disetujui, unggah produk dan atur pengiriman. Karena Tokopedia dan TikTok Shop terintegrasi, baca juga materi Mulai Berjualan di Academy supaya kamu tahu apa yang harus ditautkan.$body$,
  jsonb_build_array(
    'Daftar di Seller Center, bukan lewat formulir pihak ketiga.',
    'Peninjauan bisa makan waktu. Itu belum berarti ditolak.',
    'Dokumen blur sering ditolak. Unggah yang terbaca.'
  ),
  jsonb_build_array(
    jsonb_build_object('name', 'Daftar penjual Indonesia', 'url', 'https://seller-id.tokopedia.com/account/register'),
    jsonb_build_object('name', 'Tokopedia & TikTok Shop Academy', 'url', 'https://seller-id.tokopedia.com/university/home?identity=1&role=seller'),
    jsonb_build_object('name', 'Mulai berjualan (Academy)', 'url', 'https://seller-id.tokopedia.com/university/course?content_id=6685219521595153&lang=id-ID&learning_id=6691229207562001')
  ),
  jsonb_build_array(jsonb_build_object(
    'q', 'Jenis usahamu individu atau badan, dan dokumen apa yang sudah kamu pegang?',
    'hint', 'KTP untuk individu. Jangan unggah dokumen orang lain.'
  )),
  null, 'tokopedia', 12, 3
);

select public.belajar_seed_lesson(
  'toko', 'buka-tiktok', 'Siapkan TikTok Shop',
  'document', 'https://seller-id.tokopedia.com/university/home?identity=1&role=seller',
  $body$Di Indonesia, TikTok Shop dikelola bersama Tokopedia. Kamu tidak membuat toko TikTok yang terpisah total.

Setelah toko di Seller Center aktif, tautkan akun TikTok. Di Seller Center: Profil, lalu Akun Saya, lalu Akun TikTok yang ditautkan. Tanpa tautan itu, keranjang di video dan LIVE tidak nyambung ke toko.

Materi resminya satu Academy. Pelajaran ini fokus ke tautan akun, bukan pendaftaran kedua.$body$,
  jsonb_build_array(
    'Satu Seller Center untuk Tokopedia dan TikTok Shop.',
    'Tautkan akun TikTok sebelum mengharapkan keranjang di video.',
    'Jangan buat pendaftaran kedua kalau toko yang pertama masih menunggu peninjauan.'
  ),
  jsonb_build_array(
    jsonb_build_object('name', 'Academy', 'url', 'https://seller-id.tokopedia.com/university/home?identity=1&role=seller'),
    jsonb_build_object('name', 'Mulai berjualan (Academy)', 'url', 'https://seller-id.tokopedia.com/university/course?content_id=6685219521595153&lang=id-ID&learning_id=6691229207562001')
  ),
  jsonb_build_array(jsonb_build_object(
    'q', 'Akun TikTok yang akan kamu tautkan sudah ada, atau masih dibuat?',
    'hint', 'Akun yang mau dipakai jualan, bukan akun pribadi yang tidak mau ketahuan.'
  )),
  null, 'tiktok', 10, 4
);

select public.belajar_seed_lesson(
  'toko', 'buka-lazada', 'Buka toko Lazada',
  'document', 'https://www.lazada.co.id/wow/i/id/sell-on-lazada/jualanonline',
  $body$Daftar lewat halaman jualan Lazada, lalu isi alamat toko, dokumen, dan rekening di Seller Center. Seller Center akan meminta login dulu. Itu normal.

Lazada University punya tutorial dan webinar penjual. Angka promo di halaman mereka — misalnya bebas komisi untuk masa tertentu — adalah program mereka, dengan syarat dan masa berlaku. Baca halamannya. Jangan anggap permanen.$body$,
  jsonb_build_array(
    'Ikuti halaman resmi Lazada, bukan rekap pihak ketiga.',
    'Promo 0% punya masa berlaku. Baca syaratnya di halaman mereka.',
    'University adalah tempat materi. Seller Center adalah tempat daftar.'
  ),
  jsonb_build_array(
    jsonb_build_object('name', 'Jualan online di Lazada', 'url', 'https://www.lazada.co.id/wow/i/id/sell-on-lazada/jualanonline'),
    jsonb_build_object('name', 'Daftar Seller Center', 'url', 'https://sellercenter.lazada.co.id/apps/register/index'),
    jsonb_build_object('name', 'Lazada University', 'url', 'https://university.lazada.co.id/')
  ),
  jsonb_build_array(jsonb_build_object(
    'q', 'Kamu daftar Lazada sebagai toko pertama, atau tambahan setelah Shopee?',
    'hint', 'Tambahan boleh. Selesaikan listing di satu tempat dulu kalau waktu kamu sempit.'
  )),
  null, 'lazada', 10, 5
);

select public.belajar_seed_lesson(
  'toko', 'listing-siap', 'Listing pertama, lalu simpan URL toko',
  'text', null,
  $body$Sebelum menekan unggah: foto terang (barang, pemakaian, isi paket), judul yang menyebut isi atau manfaat dengan kata yang orang ketik, harga di atas harga pokok setelah potongan, dan ongkir yang kamu mengerti.

Judul yang panjang tidak otomatis lebih laris. Kata yang tepat, iya.

Lalu tempel URL tokomu di Profil LarisID. Kami tidak masuk ke Seller Center-mu. URL yang tersimpan itulah tanda langkah ini selesai.$body$,
  jsonb_build_array(
    'Tiga foto yang jujur mengalahkan selusin foto gelap.',
    'Harga di bawah modal bukan strategi.',
    'URL toko di Profil menandai langkah ini. Kami tidak login ke tokomu.'
  ),
  jsonb_build_array(
    jsonb_build_object('name', 'Biaya admin Shopee di LarisID', 'url', '/kalkulator/biaya-shopee/'),
    jsonb_build_object('name', 'Ringkasan biaya admin Shopee (resmi)', 'url', 'https://seller.shopee.co.id/edu/article/3489')
  ),
  jsonb_build_array(jsonb_build_object(
    'q', 'URL toko yang mana yang akan kamu simpan, atau kenapa belum ada?',
    'hint', 'Belum punya toko adalah jawaban yang sah. Centang platform-nya dulu, selesaikan pelajaran buka tokonya, lalu kembali ke sini.'
  )),
  jsonb_build_object('label', 'Simpan URL toko di Profil', 'view', 'profil', 'verify_key', 'store'),
  null, 12, 6
);

select public.belajar_seed_lesson(
  'pantau', 'pantau-favorit', 'Pantau produk yang kamu tandai',
  'tool', null,
  $body$Favorit Aku menyimpan listing, dan kami cek ulang hampir tiap hari. Nyalakan kabar lewat email atau WhatsApp di halaman itu kalau kamu mau diberitahu saat ada perubahan. WhatsApp butuh nomor yang valid.

Tiga favorit plus kabar yang menyala berarti langkah ini selesai. Kalau favoritmu masih kurang dari tiga, simpan dulu dari Cari Produk.

Kabar yang sengaja kamu matikan tidak kami hitung sebagai selesai. Diam adalah pilihan, bukan kelupaan yang kami isi sendiri.$body$,
  jsonb_build_array(
    'Tiga favorit di pasar yang ingin kamu jaga.',
    'Nyalakan email atau WhatsApp. Keduanya kosong berarti belum selesai.',
    'Perubahan harian tetap perkiraan kalau sumbernya bucket terjual.'
  ),
  '[]'::jsonb,
  jsonb_build_array(jsonb_build_object(
    'q', 'Produk siapa yang mau kamu pantau minggu ini?',
    'hint', 'Nama produknya cukup. Bukan perlu nomor toko.'
  )),
  jsonb_build_object('label', 'Atur kabar di Favorit Aku', 'view', 'tracker', 'verify_key', 'pantau'),
  null, 8, 1
);

select public.belajar_seed_lesson(
  'pantau', 'bandingkan-tren', 'Bandingkan, dan baca tren sebagai perkiraan',
  'text', null,
  $body$Untuk membandingkan dua pasar, buka Laris AI dan ketik bandingkan, lalu nama pasarnya. Papan Bandingkan tidak ada di Cari Produk.

Di Deep Dive, titik minggu depan adalah perkiraan dari riwayat scrape, bukan janji. Label terukur hanya untuk yang benar-benar terukur.

Ekstensi Chrome LarisID menampilkan omset di halaman pencarian Shopee. Itu alat bantu lihat di Shopee, bukan sumber angka yang berbeda dari yang ada di sini.$body$,
  jsonb_build_array(
    'Bandingkan lewat Laris AI, bukan dari Cari Produk.',
    'Tren yang belum terukur tetap perkiraan.',
    'Ekstensi memudahkan lihat di Shopee. Angkanya tetap dari data yang sama.'
  ),
  jsonb_build_array(
    jsonb_build_object('name', 'Cara kerja LarisID', 'url', '/cara-kerja/'),
    jsonb_build_object('name', 'Ekstensi Chrome LarisID', 'url', 'https://chromewebstore.google.com/detail/ldgcjbnecfnpbgenechgfbdagecnloae')
  ),
  jsonb_build_array(jsonb_build_object(
    'q', 'Kompetitor atau pasar mana yang mau kamu cek ulang minggu ini, dan angka apa yang kamu lihat?',
    'hint', 'Satu angka: harga, omset perkiraan, atau persen mingguan. Tulis juga kalau itu perkiraan.'
  )),
  jsonb_build_object('label', 'Buka Laris AI', 'view', 'chat'),
  null, 8, 2
);

drop function public.belajar_seed_lesson(
  text, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb, text, int, int
);

-- ── Course read + auto-stamp of verified steps ──────────────────────────────

create or replace function public.belajar_course()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_dd int := 0;
  v_fav int := 0;
  v_kalk int := 0;
  v_store boolean := false;
  v_notify boolean := false;
  v_track text;
  v_plats text[];
  v_seller text;
  v_done int := 0;
  v_total int := 0;
  v_next jsonb := null;
  v_mods jsonb := '[]'::jsonb;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'login_required');
  end if;

  select coalesce(s.deepdive_count, 0) into v_dd
  from public.user_journey_stats s
  where s.user_id = v_me;
  if not found then v_dd := 0; end if;

  select count(*)::int into v_fav
  from public.user_tracked_products t
  where t.user_id = v_me;

  select
    (select count(*)::int from public.activity_events e
      where e.user_id = v_me and e.event_type = 'gpt_kalc_save_riwayat')
    + (select count(*)::int from public.gpt_chats c
      where c.user_id = v_me and coalesce(c.context->>'kind', '') = 'kalkulator')
  into v_kalk;

  v_store := exists (
    select 1 from public.user_profiles up
    where up.user_id = v_me
      and coalesce(nullif(btrim(up.public_shopee_url), ''), nullif(btrim(up.shopee_store_url), '')) is not null
  ) or exists (
    select 1 from public.student_account sa
    where sa.student_id = v_me
      and sa.kind = 'shop'
      and sa.active
      and nullif(btrim(sa.url), '') is not null
  );

  select coalesce(cardinality(ts.notify_channels), 0) > 0 into v_notify
  from public.user_tracker_state ts
  where ts.user_id = v_me;
  if not found then v_notify := false; end if;

  select st.track, st.platforms into v_track, v_plats
  from public.user_course_state st
  where st.user_id = v_me;

  if not found then
    select coalesce(
      (select ob.seller_status from public.user_onboarding_prefs ob where ob.user_id = v_me),
      (select up.seller_status from public.user_profiles up where up.user_id = v_me)
    ) into v_seller;

    select coalesce(array_agg(distinct mapped), array['shopee']::text[])
      into v_plats
    from (
      select case sa.platform when 'tiktok_shop' then 'tiktok' else sa.platform end as mapped
      from public.student_account sa
      where sa.student_id = v_me
        and sa.kind = 'shop'
        and sa.active
        and sa.platform in ('shopee', 'tokopedia', 'tiktok_shop', 'lazada')
    ) shops;

    if v_plats is null or cardinality(v_plats) = 0 then
      v_plats := array['shopee']::text[];
    end if;

    v_track := case
      when v_seller = 'existing' or v_store then 'existing'
      else 'new'
    end;

    insert into public.user_course_state (user_id, track, platforms)
    values (v_me, v_track, v_plats)
    on conflict (user_id) do nothing;

    select st.track, st.platforms into v_track, v_plats
    from public.user_course_state st
    where st.user_id = v_me;
  end if;

  -- Stamp steps the product already proved. Skipped stays skipped.
  insert into public.user_lesson_progress (user_id, lesson_id, status, done_at)
  select v_me, l.id, 'done', now()
  from public.course_lessons l
  join public.course_modules m on m.id = l.module_id and m.published
  where l.published
    and (
      (l.action->>'verify_key' = 'deepdive' and v_dd >= 1)
      or (l.action->>'verify_key' = 'favorit3' and v_fav >= 3)
      or (l.action->>'verify_key' = 'kalk' and v_kalk >= 1)
      or (l.action->>'verify_key' = 'store' and v_store)
      or (l.action->>'verify_key' = 'pantau' and v_fav >= 3 and v_notify)
    )
  on conflict (user_id, lesson_id) do update
    set status = 'done',
        done_at = coalesce(public.user_lesson_progress.done_at, now()),
        updated_at = now()
    where public.user_lesson_progress.status = 'draft';

  with lessons as (
    select
      l.id, l.slug, l.title, l.kind, l.url, l.body, l.points, l.resources,
      l.questions, l.action, l.platform, l.est_mins, l.sort_order,
      m.id as module_id, m.slug as module_slug, m.title as module_title,
      m.subtitle as module_subtitle, m.sort_order as module_sort,
      p.status, p.answers, p.done_at,
      case l.action->>'verify_key'
        when 'deepdive' then v_dd >= 1
        when 'favorit3' then v_fav >= 3
        when 'kalk' then v_kalk >= 1
        when 'store' then v_store
        when 'pantau' then (v_fav >= 3 and v_notify)
        else false
      end as verify_met,
      (
        l.published
        and m.published
        and p.status is distinct from 'skipped'
        and (l.platform is null or l.platform = any (v_plats))
        and (
          v_track = 'new'
          or m.slug = 'pantau'
          or m.sort_order >= 5
          or p.status = 'done'
        )
      ) as applicable
    from public.course_lessons l
    join public.course_modules m on m.id = l.module_id
    left join public.user_lesson_progress p
      on p.lesson_id = l.id and p.user_id = v_me
    where l.published and m.published
  ),
  counts as (
    select
      (count(*) filter (where applicable and status = 'done'))::int as done_n,
      (count(*) filter (where applicable))::int as total_n
    from lessons
  )
  select
    c.done_n,
    c.total_n,
    (
      select jsonb_build_object(
        'slug', n.slug,
        'title', n.title,
        'module_slug', n.module_slug,
        'module_title', n.module_title
      )
      from lessons n
      where n.applicable and n.status is distinct from 'done'
      order by n.module_sort, n.sort_order
      limit 1
    ),
    coalesce((
      select jsonb_agg(mod_json order by module_sort)
      from (
        select
          le.module_sort,
          jsonb_build_object(
            'id', le.module_id,
            'slug', le.module_slug,
            'title', le.module_title,
            'subtitle', le.module_subtitle,
            'sort_order', le.module_sort,
            'lessons', coalesce(jsonb_agg(jsonb_build_object(
              'id', le.id,
              'slug', le.slug,
              'title', le.title,
              'kind', le.kind,
              'url', le.url,
              'body', le.body,
              'points', le.points,
              'resources', le.resources,
              'questions', le.questions,
              'action', le.action,
              'platform', le.platform,
              'est_mins', le.est_mins,
              'sort_order', le.sort_order,
              'status', le.status,
              'answers', coalesce(le.answers, '{}'::jsonb),
              'done_at', le.done_at,
              'verify_met', le.verify_met,
              'applicable', le.applicable
            ) order by le.sort_order), '[]'::jsonb)
          ) as mod_json
        from lessons le
        group by le.module_id, le.module_slug, le.module_title, le.module_subtitle, le.module_sort
      ) mods
    ), '[]'::jsonb)
  into v_done, v_total, v_next, v_mods
  from counts c;

  if coalesce(v_total, 0) > 0 and coalesce(v_done, 0) >= v_total then
    update public.user_course_state
       set completed_at = coalesce(completed_at, now())
     where user_id = v_me and completed_at is null;
  else
    update public.user_course_state
       set completed_at = null
     where user_id = v_me and completed_at is not null;
  end if;

  return jsonb_build_object(
    'ok', true,
    'track', v_track,
    'platforms', to_jsonb(v_plats),
    'signals', jsonb_build_object(
      'deepdive', v_dd,
      'favorit', v_fav,
      'kalk', v_kalk,
      'store', v_store,
      'notify', v_notify
    ),
    'progress', jsonb_build_object(
      'done', coalesce(v_done, 0),
      'total', coalesce(v_total, 0),
      'pct', case
        when coalesce(v_total, 0) = 0 then 0
        else round(100.0 * coalesce(v_done, 0) / v_total)::int
      end,
      'next', v_next
    ),
    'modules', coalesce(v_mods, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.belajar_course() from public, anon;
grant execute on function public.belajar_course() to authenticated;

create or replace function public.belajar_mark_lesson(
  p_lesson uuid,
  p_status text,
  p_answers jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_status text := lower(btrim(coalesce(p_status, '')));
  v_answers jsonb := '{}'::jsonb;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'login_required');
  end if;
  if not exists (
    select 1 from public.course_lessons l
    join public.course_modules m on m.id = l.module_id
    where l.id = p_lesson and l.published and m.published
  ) then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;

  if v_status = 'clear' then
    delete from public.user_lesson_progress
    where user_id = v_me and lesson_id = p_lesson;
    return public.belajar_course();
  end if;

  if v_status not in ('draft', 'done', 'skipped') then
    return jsonb_build_object('ok', false, 'error', 'bad_status');
  end if;

  if jsonb_typeof(coalesce(p_answers, '{}'::jsonb)) = 'object' then
    select coalesce(jsonb_object_agg(s.key, to_jsonb(left(s.value, 2000))), '{}'::jsonb)
      into v_answers
    from (
      select key, value
      from jsonb_each_text(p_answers)
      limit 20
    ) s;
  end if;
  v_answers := coalesce(v_answers, '{}'::jsonb);

  insert into public.user_lesson_progress (user_id, lesson_id, status, answers, done_at)
  values (
    v_me, p_lesson, v_status, v_answers,
    case when v_status = 'done' then now() else null end
  )
  on conflict (user_id, lesson_id) do update
    set status = excluded.status,
        answers = excluded.answers,
        done_at = case
          when excluded.status = 'done' then coalesce(public.user_lesson_progress.done_at, now())
          else null
        end,
        updated_at = now();

  return public.belajar_course();
end;
$$;

revoke all on function public.belajar_mark_lesson(uuid, text, jsonb) from public, anon;
grant execute on function public.belajar_mark_lesson(uuid, text, jsonb) to authenticated;

create or replace function public.belajar_set_state(
  p_track text,
  p_platforms text[]
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_track text := lower(btrim(coalesce(p_track, '')));
  v_plats text[];
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'login_required');
  end if;
  if v_track not in ('new', 'existing') then
    return jsonb_build_object('ok', false, 'error', 'bad_track');
  end if;
  if not public.belajar_platforms_ok(p_platforms) then
    return jsonb_build_object('ok', false, 'error', 'bad_platform');
  end if;

  select coalesce(array_agg(distinct p order by p), '{}'::text[])
    into v_plats
  from unnest(coalesce(p_platforms, '{}'::text[])) p
  where p in ('shopee', 'tokopedia', 'tiktok', 'lazada');

  insert into public.user_course_state (user_id, track, platforms)
  values (v_me, v_track, coalesce(v_plats, '{}'::text[]))
  on conflict (user_id) do update
    set track = excluded.track,
        platforms = excluded.platforms,
        updated_at = now();

  return public.belajar_course();
end;
$$;

revoke all on function public.belajar_set_state(text, text[]) from public, anon;
grant execute on function public.belajar_set_state(text, text[]) to authenticated;

-- ── Admin ────────────────────────────────────────────────────────────────────

create or replace function public.belajar_admin_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin() then
    return jsonb_build_object('ok', false, 'error', 'admin_only');
  end if;
  return jsonb_build_object(
    'ok', true,
    'learners', (select count(*)::int from public.user_course_state),
    'completed', (select count(*)::int from public.user_course_state where completed_at is not null),
    'modules', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id,
        'slug', m.slug,
        'title', m.title,
        'subtitle', m.subtitle,
        'sort_order', m.sort_order,
        'published', m.published,
        'lessons', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', l.id,
            'slug', l.slug,
            'title', l.title,
            'kind', l.kind,
            'url', l.url,
            'body', l.body,
            'points', l.points,
            'resources', l.resources,
            'questions', l.questions,
            'action', l.action,
            'platform', l.platform,
            'est_mins', l.est_mins,
            'sort_order', l.sort_order,
            'published', l.published,
            'done', (
              select count(*)::int from public.user_lesson_progress p
              where p.lesson_id = l.id and p.status = 'done'
            ),
            'skipped', (
              select count(*)::int from public.user_lesson_progress p
              where p.lesson_id = l.id and p.status = 'skipped'
            )
          ) order by l.sort_order)
          from public.course_lessons l
          where l.module_id = m.id
        ), '[]'::jsonb)
      ) order by m.sort_order)
      from public.course_modules m
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.belajar_admin_overview() from public, anon;
grant execute on function public.belajar_admin_overview() to authenticated;

create or replace function public.belajar_admin_save_module(
  p_id uuid,
  p_title text,
  p_subtitle text,
  p_sort int,
  p_published boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
begin
  if not public.is_platform_admin() then
    return jsonb_build_object('ok', false, 'error', 'admin_only');
  end if;
  if v_title = '' or char_length(v_title) > 160 then
    return jsonb_build_object('ok', false, 'error', 'bad_title');
  end if;
  update public.course_modules
     set title = v_title,
         subtitle = left(btrim(coalesce(p_subtitle, '')), 400),
         sort_order = coalesce(p_sort, sort_order),
         published = coalesce(p_published, published),
         updated_at = now()
   where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return public.belajar_admin_overview();
end;
$$;

revoke all on function public.belajar_admin_save_module(uuid, text, text, int, boolean) from public, anon;
grant execute on function public.belajar_admin_save_module(uuid, text, text, int, boolean) to authenticated;

create or replace function public.belajar_admin_save_lesson(
  p_id uuid,
  p_title text,
  p_kind text,
  p_url text,
  p_body text,
  p_points jsonb,
  p_resources jsonb,
  p_questions jsonb,
  p_action jsonb,
  p_platform text,
  p_est_mins int,
  p_sort int,
  p_published boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_title text := btrim(coalesce(p_title, ''));
  v_kind text := lower(btrim(coalesce(p_kind, 'text')));
  v_platform text := nullif(lower(btrim(coalesce(p_platform, ''))), '');
  v_action jsonb := p_action;
begin
  if not public.is_platform_admin() then
    return jsonb_build_object('ok', false, 'error', 'admin_only');
  end if;
  if v_title = '' or char_length(v_title) > 200 then
    return jsonb_build_object('ok', false, 'error', 'bad_title');
  end if;
  if v_kind not in ('video', 'document', 'text', 'tool') then
    return jsonb_build_object('ok', false, 'error', 'bad_kind');
  end if;
  if v_platform is not null and v_platform not in ('shopee', 'tokopedia', 'tiktok', 'lazada') then
    return jsonb_build_object('ok', false, 'error', 'bad_platform');
  end if;
  if p_points is not null and jsonb_typeof(p_points) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'points_must_be_array');
  end if;
  if p_resources is not null and jsonb_typeof(p_resources) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'resources_must_be_array');
  end if;
  if p_questions is not null and jsonb_typeof(p_questions) <> 'array' then
    return jsonb_build_object('ok', false, 'error', 'questions_must_be_array');
  end if;
  if v_action is not null and jsonb_typeof(v_action) = 'null' then
    v_action := null;
  end if;
  if v_action is not null and jsonb_typeof(v_action) <> 'object' then
    return jsonb_build_object('ok', false, 'error', 'action_must_be_object');
  end if;

  update public.course_lessons
     set title = v_title,
         kind = v_kind,
         url = nullif(left(btrim(coalesce(p_url, '')), 2000), ''),
         body = left(coalesce(p_body, ''), 12000),
         points = coalesce(p_points, '[]'::jsonb),
         resources = coalesce(p_resources, '[]'::jsonb),
         questions = coalesce(p_questions, '[]'::jsonb),
         action = v_action,
         platform = v_platform,
         est_mins = least(180, greatest(0, coalesce(p_est_mins, est_mins))),
         sort_order = coalesce(p_sort, sort_order),
         published = coalesce(p_published, published),
         updated_at = now()
   where id = p_id;
  if not found then
    return jsonb_build_object('ok', false, 'error', 'not_found');
  end if;
  return public.belajar_admin_overview();
end;
$$;

revoke all on function public.belajar_admin_save_lesson(
  uuid, text, text, text, text, jsonb, jsonb, jsonb, jsonb, text, int, int, boolean
) from public, anon;
grant execute on function public.belajar_admin_save_lesson(
  uuid, text, text, text, text, jsonb, jsonb, jsonb, jsonb, text, int, int, boolean
) to authenticated;

revoke all on function public.belajar_platforms_ok(text[]) from public, anon;
grant execute on function public.belajar_platforms_ok(text[]) to authenticated;

notify pgrst, 'reload schema';

commit;
