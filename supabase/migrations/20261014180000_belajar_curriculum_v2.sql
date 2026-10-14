-- Belajar v2: four modules, listing draft, shop outcome.
--
-- Does not re-seed the original 16 lessons. Those rows stay, unpublished.
-- Re-applying THIS file overwrites the v2 lesson copy for the same slugs.
-- Do not re-apply 20261014120000_belajar_course.sql after this file.
--
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20261014180000_belajar_curriculum_v2.sql
-- Never: supabase db push --linked

begin;

set local statement_timeout = 0;

alter table public.user_course_state
  add column if not exists baseline text not null default 'unknown';

alter table public.user_course_state
  drop constraint if exists user_course_state_baseline_check;

alter table public.user_course_state
  add constraint user_course_state_baseline_check
  check (baseline in ('no_store', 'no_sales', 'has_sales', 'unknown'));

alter table public.user_course_state
  add column if not exists listing_draft jsonb not null default '{}'::jsonb;

comment on column public.user_course_state.baseline is
  'Funnel start: no_store, no_sales, has_sales, or unknown. Not a paywall.';
comment on column public.user_course_state.listing_draft is
  'Pra-listing and idea analysis. Photo files are not stored.';

create table if not exists public.user_seller_outcomes (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  platform           text not null,
  shop_url           text not null,
  shop_ref           text,
  baseline           text not null default 'unknown'
                       check (baseline in ('no_store', 'no_sales', 'has_sales', 'unknown')),
  linked_at          timestamptz not null default now(),
  est_omset_idr      bigint,
  est_listing_n      int,
  est_omset_at       timestamptz,
  reached_3jt_at     timestamptz,
  reported_omset_idr bigint,
  reported_at        timestamptz,
  updated_at         timestamptz not null default now()
);

alter table public.user_seller_outcomes enable row level security;

comment on table public.user_seller_outcomes is
  'Linked shop for the Belajar funnel. est_omset_idr is a perkiraan sum of Shopee listings we already have for that shop_id, not whole-shop GMV. reported_omset_idr never sets reached_3jt_at.';

create index if not exists listings_deduped_shop_id_idx
  on public.listings_deduped (shop_id);

-- ── Draft sanitiser ──────────────────────────────────────────────────────────

create or replace function public.belajar_clean_draft(p jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  idea jsonb := '{}'::jsonb;
  analysis jsonb := '{}'::jsonb;
  listing jsonb := '{}'::jsonb;
  words jsonb := '[]'::jsonb;
  sample jsonb := '[]'::jsonb;
  manual jsonb := '[]'::jsonb;
  v_cost bigint;
  v_price bigint;
  v_median bigint;
  v_user_price bigint;
  v_p25 bigint;
  v_p75 bigint;
  v_n int;
begin
  if p is null or jsonb_typeof(p) is distinct from 'object' then
    return '{}'::jsonb;
  end if;
  if jsonb_typeof(p->'idea') = 'object' then idea := p->'idea'; end if;
  if jsonb_typeof(p->'analysis') = 'object' then analysis := p->'analysis'; end if;
  if jsonb_typeof(p->'listing') = 'object' then listing := p->'listing'; end if;

  v_cost := case when coalesce(idea->>'cost', '') ~ '^[0-9]{1,12}$' then (idea->>'cost')::bigint else null end;
  v_price := case when coalesce(idea->>'price', '') ~ '^[0-9]{1,12}$' then (idea->>'price')::bigint else null end;
  v_median := case when coalesce(analysis->>'median_price', '') ~ '^[0-9]{1,12}$' then (analysis->>'median_price')::bigint else null end;
  v_user_price := case when coalesce(analysis->>'user_price', '') ~ '^[0-9]{1,12}$' then (analysis->>'user_price')::bigint else null end;
  v_p25 := case when coalesce(analysis->>'omset_p25', '') ~ '^[0-9]{1,15}$' then (analysis->>'omset_p25')::bigint else null end;
  v_p75 := case when coalesce(analysis->>'omset_p75', '') ~ '^[0-9]{1,15}$' then (analysis->>'omset_p75')::bigint else null end;
  v_n := case when coalesce(analysis->>'n', '') ~ '^[0-9]{1,6}$' then (analysis->>'n')::int else 0 end;

  select coalesce(jsonb_agg(to_jsonb(left(s.w, 40)) order by s.ord), '[]'::jsonb)
    into words
  from (
    select e #>> '{}' as w, ord
    from jsonb_array_elements(
      case when jsonb_typeof(analysis->'words') = 'array' then analysis->'words' else '[]'::jsonb end
    ) with ordinality as t(e, ord)
    where jsonb_typeof(e) = 'string'
    limit 12
  ) s
  where btrim(s.w) <> '';

  select coalesce(jsonb_agg(jsonb_build_object(
    'item_id', left(coalesce(s.e->>'item_id', ''), 24),
    'shop_id', left(coalesce(s.e->>'shop_id', ''), 24),
    'name', left(coalesce(s.e->>'name', ''), 180),
    'price', case when coalesce(s.e->>'price', '') ~ '^[0-9]{1,12}$' then (s.e->>'price')::bigint else null end,
    'omset', case when coalesce(s.e->>'omset', '') ~ '^[0-9]{1,15}$' then (s.e->>'omset')::bigint else null end,
    'store', left(coalesce(s.e->>'store', ''), 120),
    'keyword', left(coalesce(s.e->>'keyword', ''), 80),
    'category', left(coalesce(s.e->>'category', ''), 80),
    'image', case
      when coalesce(s.e->>'image', '') ~* '^https://' then left(s.e->>'image', 800)
      else ''
    end
  ) order by s.ord), '[]'::jsonb)
    into sample
  from (
    select e, ord
    from jsonb_array_elements(
      case when jsonb_typeof(analysis->'sample') = 'array' then analysis->'sample' else '[]'::jsonb end
    ) with ordinality as t(e, ord)
    where jsonb_typeof(e) = 'object'
    limit 6
  ) s;

  select coalesce(jsonb_agg(jsonb_build_object(
    'url', left(s.url, 500),
    'label', left(s.label, 180)
  ) order by s.ord), '[]'::jsonb)
    into manual
  from (
    select btrim(coalesce(e->>'url', '')) as url,
           btrim(coalesce(e->>'label', '')) as label,
           ord
    from jsonb_array_elements(
      case when jsonb_typeof(p->'manual') = 'array' then p->'manual' else '[]'::jsonb end
    ) with ordinality as t(e, ord)
    where jsonb_typeof(e) = 'object'
    limit 8
  ) s
  where s.url <> '' and s.url ~* '^https://';

  return jsonb_build_object(
    'idea', jsonb_build_object(
      'choice', case when idea->>'choice' in ('yes', 'no') then idea->>'choice' else '' end,
      'name', left(btrim(coalesce(idea->>'name', '')), 200),
      'description', left(btrim(coalesce(idea->>'description', '')), 2000),
      'cost', v_cost,
      'price', v_price
    ),
    'analysis', jsonb_build_object(
      'ran', analysis->>'ran' = 'true',
      'query', left(btrim(coalesce(analysis->>'query', '')), 200),
      'n', v_n,
      'median_price', v_median,
      'user_price', v_user_price,
      'price_vs', case
        when analysis->>'price_vs' in ('above', 'below', 'near', 'unknown') then analysis->>'price_vs'
        else 'unknown'
      end,
      'omset_p25', v_p25,
      'omset_p75', v_p75,
      'words', coalesce(words, '[]'::jsonb),
      'sample', coalesce(sample, '[]'::jsonb)
    ),
    'listing', jsonb_build_object(
      'title', left(btrim(coalesce(listing->>'title', '')), 200),
      'description', left(btrim(coalesce(listing->>'description', '')), 4000),
      'sku', listing->>'sku' = 'true',
      'variations', left(btrim(coalesce(listing->>'variations', '')), 500)
    ),
    'manual', coalesce(manual, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.belajar_clean_draft(jsonb) from public, anon, authenticated;

-- ── Shopee shop omset from listings we already have ─────────────────────────

create or replace function public.belajar_refresh_user_outcome(p_user uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_platform text;
  v_ref text;
  v_n int := 0;
  v_omset_n int := 0;
  v_sum bigint := 0;
begin
  select o.platform, o.shop_ref into v_platform, v_ref
  from public.user_seller_outcomes o
  where o.user_id = p_user;
  if not found then
    return;
  end if;

  if v_platform is distinct from 'shopee' or v_ref is null or v_ref !~ '^[0-9]+$' then
    update public.user_seller_outcomes
       set est_omset_idr = null,
           est_listing_n = null,
           est_omset_at = now(),
           updated_at = now()
     where user_id = p_user;
    return;
  end if;

  select count(*)::int,
         count(s.omset)::int,
         coalesce(sum(s.omset), 0)::bigint
    into v_n, v_omset_n, v_sum
  from (
    select distinct on (l.item_id) l.nowcast_omset_monthly as omset
    from public.listings_deduped l
    where l.shop_id = v_ref::bigint
      and coalesce(l.is_offtopic, false) = false
    order by l.item_id, l.nowcast_omset_monthly desc nulls last
  ) s;

  update public.user_seller_outcomes
     set est_listing_n = v_n,
         est_omset_idr = case when v_omset_n > 0 then v_sum else null end,
         est_omset_at = now(),
         reached_3jt_at = case
           when reached_3jt_at is not null then reached_3jt_at
           when v_omset_n > 0 and v_sum >= 3000000 then now()
           else reached_3jt_at
         end,
         updated_at = now()
   where user_id = p_user;
exception
  when others then
    return;
end;
$$;

revoke all on function public.belajar_refresh_user_outcome(uuid) from public, anon, authenticated;

-- ── Modules and lessons ──────────────────────────────────────────────────────

update public.course_modules
   set title = 'Cari produk',
       subtitle = 'Punya ide, atau cari dulu. Lalu siapkan pra-listing.',
       sort_order = 1,
       published = true,
       updated_at = now()
 where slug = 'cari';

update public.course_modules
   set title = 'Uji produk',
       subtitle = 'Digabung ke Cari produk dan Sumber produk.',
       sort_order = 90,
       published = false,
       updated_at = now()
 where slug = 'uji';

update public.course_modules
   set title = 'Sumber produk',
       subtitle = 'Hitung modal, cari barang, tanya penjual lain.',
       sort_order = 2,
       published = true,
       updated_at = now()
 where slug = 'supplier';

update public.course_modules
   set title = 'Pilih tempat jual',
       subtitle = 'Shopee, Tokopedia, TikTok Shop, atau Lazada. Satu dulu.',
       sort_order = 3,
       published = true,
       updated_at = now()
 where slug = 'toko';

update public.course_modules
   set title = 'Pantau',
       subtitle = 'Lihat apa yang kompetitor ubah. Angka yang belum terukur tetap perkiraan.',
       sort_order = 4,
       published = true,
       updated_at = now()
 where slug = 'pantau';

update public.course_lessons
   set published = false,
       updated_at = now()
 where slug in (
   'baca-cari-produk', 'deep-dive-pertama', 'tiga-favorit',
   'baca-angka-jujur', 'cek-margin', 'tanya-seller',
   'sumber-barang', 'sampel-dan-hpp',
   'pilih-platform', 'buka-shopee', 'buka-tokopedia', 'buka-tiktok', 'buka-lazada', 'listing-siap',
   'pantau-favorit', 'bandingkan-tren'
 );

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
    published = true,
    updated_at = now();
end;
$$;

select public.belajar_seed_lesson(
  'cari', 'ide-produk', 'Punya ide produk, atau belum?',
  'tool', null,
  $body$Dua jalan. Kalau kamu sudah punya ide, isi yang kamu tahu lalu lihat listing Shopee yang mirip. Kalau belum, buka Cari Produk dan cari dari data.

Hasil analisis adalah sampel pencarian, bukan seluruh pasar. Harga dibanding median sampel itu. Omset yang muncul adalah perkiraan, kecuali suatu listing memang terukur di tempat lain di LarisID. Tidak ada angka "kamu akan dapat sekian".$body$,
  jsonb_build_array(
    'Membandingkan harga ide dengan median listing yang ketemu.',
    'Melihat rentang omset perkiraan dari sampel itu, bukan janji untuk produkmu.',
    'Pindah ke Cari Produk kalau idenya belum ada atau sampelnya kosong.'
  ),
  jsonb_build_array(jsonb_build_object('name', 'Cara kerja LarisID', 'url', '/cara-kerja/')),
  '[]'::jsonb,
  jsonb_build_object('label', 'Buka Cari Produk', 'view', 'directory', 'verify_key', 'ide'),
  null, 12, 1
);

select public.belajar_seed_lesson(
  'cari', 'pra-listing', 'Siapkan pra-listing',
  'tool', null,
  $body$Ini belum listing di marketplace. Ini draf: judul, deskripsi, dan apakah ada variasi SKU.

Foto tidak kami simpan. Yang kamu unggah hanya tampil di perangkat ini. Pakai foto yang haknya kamu punya. Jangan memakai foto merek orang lain.

Setiap variasi adalah barang lain yang harus kamu stok. Mulai dari satu variasi kalau sourcing-nya belum jalan.

Saran di bawah diambil dari judul sampel pencarian tadi: kata yang sering muncul, dan posisi harga terhadap median. Bukan resep warna atau fitur yang kami karang.$body$,
  jsonb_build_array(
    'Judul yang menyebut isi atau manfaat, dengan kata yang orang ketik.',
    'Deskripsi yang jujur soal bahan, ukuran, dan isi paket.',
    'Variasi hanya kalau kamu sanggup menyiapkan stoknya.'
  ),
  jsonb_build_array(jsonb_build_object('name', 'Cara kerja LarisID', 'url', '/cara-kerja/')),
  '[]'::jsonb,
  jsonb_build_object('verify_key', 'pra'),
  null, 15, 2
);

select public.belajar_seed_lesson(
  'supplier', 'hitung-modal', 'Hitung modal dari harga jual',
  'tool', null,
  $body$Buka kalkulator dengan harga jual dan harga pokok dari pra-listing, kalau kamu sudah mengisinya.

Yang masuk modal bukan cuma harga beli. Masukkan juga ongkir yang kamu tanggung, kemasan, biaya platform, iklan yang kamu rencanakan, dan cadangan retur. Biaya platform di kalkulator adalah potongan marketplace, bukan komisi afiliasi.

Omset besar dengan margin tipis tetap bisa rugi. Milestone Rp 3 juta di pelajaran tautan toko adalah omset kotor perkiraan, bukan untung. Untungnya ada di kalkulator ini.

Simpan kalkulasi ke Riwayat supaya langkah ini tertandai.$body$,
  jsonb_build_array(
    'Harga jual di atas harga pokok setelah potongan.',
    'Ongkir, kemasan, iklan, dan retur masuk hitungan.',
    'Rp 3 juta omset bukan berarti Rp 3 juta untung.'
  ),
  jsonb_build_array(
    jsonb_build_object('name', 'Kalkulator margin dan HPP', 'url', '/kalkulator/margin-hpp/'),
    jsonb_build_object('name', 'Biaya admin Shopee di LarisID', 'url', '/kalkulator/biaya-shopee/')
  ),
  '[]'::jsonb,
  jsonb_build_object('label', 'Buka kalkulator', 'view', 'kalkulator', 'verify_key', 'kalk'),
  null, 10, 1
);

select public.belajar_seed_lesson(
  'supplier', 'mulai-sourcing', 'Cari barangnya',
  'text', null,
  $body$Tidak ada satu supplier ajaib. Mulai dari yang paling dekat, lalu baru yang jauh.

Pasar lokal, produsen, atau UMKM di kotamu. Datang, pegang barangnya, tanya minimal order dan berapa lama repeat order. Cek yang sering bikin retur: ukuran tidak sesuai foto, bahan tipis, kemasan penyok, isi kurang.

1688 adalah jalur impor dari pabrik di Tiongkok. Harga bisa lebih rendah, tapi ada ongkir internasional, bea masuk, dan waktu tunggu. Ini bukan cara menghindari aturan. Cek kewajiban usahamu dan bea sebelum pesan dalam jumlah besar. Pesan sampel dulu.

Alibaba sama-sama jalur pemasok luar, sering dalam bahasa Inggris. Syaratnya sama: sampel, lead time, ongkir, dan bea. Jangan transfer stok besar di jalur yang belum kamu coba.

Grosir di marketplace boleh untuk mencoba permintaan. Margin sering tipis, dan kamu bergantung pada pengirim orang lain.$body$,
  jsonb_build_array(
    'Sampel dulu, stok kemudian.',
    'Tanyakan MOQ dan berapa hari sampai barang ada di tanganmu.',
    '1688 dan Alibaba bukan jalan pintas bea atau izin usaha.'
  ),
  jsonb_build_array(
    jsonb_build_object('name', '1688', 'url', 'https://www.1688.com/'),
    jsonb_build_object('name', 'Alibaba', 'url', 'https://www.alibaba.com/'),
    jsonb_build_object('name', 'Kalkulator margin dan HPP', 'url', '/kalkulator/margin-hpp/')
  ),
  jsonb_build_array(jsonb_build_object(
    'q', 'Jalan mana yang paling masuk akal untuk produkmu, dan kenapa bukan yang lain?',
    'hint', 'Satu jalan. Kamu bisa ganti setelah sampel.'
  )),
  null,
  null, 12, 2
);

select public.belajar_seed_lesson(
  'supplier', 'tanya-sumber', 'Tanya penjual lain',
  'tool', null,
  $body$Di Komunitas, tab Diskusi, kamu bisa bertanya ke penjual lain soal sourcing atau cara jual. Tulis sendiri, lalu kirim sendiri. Pelajaran ini tidak memposting atas namamu.

Jangan tempel harga atau omset orang lain ke dalam pertanyaan.

Kalau akunmu sudah pernah mengirim pertanyaan di Diskusi, langkah ini tertandai dari situ. Kalau belum, buka Diskusi, kirim, atau tandai selesai setelah kamu bertanya.$body$,
  jsonb_build_array(
    'Satu pertanyaan yang spesifik lebih berguna daripada "ada yang jual ini?".',
    'Kamu yang menekan kirim.',
    'Jawaban penjual lain adalah pengalaman mereka, bukan data Laris.'
  ),
  '[]'::jsonb,
  '[]'::jsonb,
  jsonb_build_object('label', 'Buka Diskusi', 'view', 'community', 'verify_key', 'diskusi'),
  null, 8, 3
);

select public.belajar_seed_lesson(
  'toko', 'cara-mulai', 'Cara membuka toko',
  'text', null,
  $body$Pilih platform di bawah. Panduan dan tautan resminya mengikuti pilihan itu. Kalau layar platform berbeda dari ringkasan ini, yang di layar mereka yang berlaku.

Sebelum listing pertama, siapkan KTP pemilik akun dan rekening atas nama yang sama. Dokumen yang blur sering ditolak. Peninjauan platform bisa makan waktu. Itu antrean mereka, bukan tanda gagal.

Tokopedia dan TikTok Shop Indonesia berbagi Seller Center. TikTok Shop butuh akun TikTok yang ditautkan supaya keranjang di video nyambung ke toko.

LarisID datanya Shopee. Toko boleh di tempat lain. Mulai dari satu platform sampai ada listing yang hidup.$body$,
  jsonb_build_array(
    'KTP dan rekening siap sebelum kamu mengunggah produk.',
    'Satu toko yang hidup lebih berguna daripada empat toko kosong.',
    'Tokopedia dan TikTok Shop Indonesia satu Seller Center.'
  ),
  jsonb_build_array(
    jsonb_build_object('name', 'Mulai berjualan di Shopee (resmi)', 'url', 'https://seller.shopee.co.id/edu/article/464'),
    jsonb_build_object('name', 'Daftar penjual Tokopedia', 'url', 'https://seller-id.tokopedia.com/account/register'),
    jsonb_build_object('name', 'Academy Tokopedia dan TikTok Shop', 'url', 'https://seller-id.tokopedia.com/university/home?identity=1&role=seller'),
    jsonb_build_object('name', 'Jualan online di Lazada', 'url', 'https://www.lazada.co.id/wow/i/id/sell-on-lazada/jualanonline')
  ),
  '[]'::jsonb,
  null,
  null, 12, 1
);

select public.belajar_seed_lesson(
  'toko', 'listing-pertama', 'Listing pertama',
  'tool', null,
  $body$Salin dari pra-listing: foto, judul, deskripsi, harga, dan variasi kalau ada. Harga di bawah modal bukan strategi.

Judul yang panjang tidak otomatis lebih laris. Kata yang tepat, iya.

Minggu pertama setelah tayang: balas chat di hari yang sama, packing yang sesuai foto, dan siapkan jawaban kalau pembeli komplain ukuran atau warna. Listing yang tayang tanpa itu cepat dapat ulasan yang susah diperbaiki.

Tokopedia dan TikTok Shop Indonesia tetap satu Seller Center. Kalau kamu menjual di TikTok, tautkan akunnya dulu.$body$,
  jsonb_build_array(
    'Foto terang: barang, pemakaian, isi paket.',
    'Harga masih di atas pokok setelah potongan dan ongkir.',
    'Siapkan balasan chat dan cara packing sebelum iklan.'
  ),
  jsonb_build_array(
    jsonb_build_object('name', 'Biaya admin Shopee di LarisID', 'url', '/kalkulator/biaya-shopee/'),
    jsonb_build_object('name', 'Ringkasan biaya admin Shopee (resmi)', 'url', 'https://seller.shopee.co.id/edu/article/3489')
  ),
  '[]'::jsonb,
  null,
  null, 15, 2
);

select public.belajar_seed_lesson(
  'toko', 'tautan-toko', 'Tautkan URL toko',
  'tool', null,
  $body$Tempel URL tokomu di sini. Kami tidak masuk ke Seller Center-mu.

Kalau tokonya Shopee dan shop id-nya ada di data Laris, kami jumlahkan omset perkiraan listing toko itu yang kami punya. Itu bukan seluruh omset toko, dan bukan angka resmi Shopee. Kalau tidak ada listingnya di data kami, tampilannya "belum ada data Laris", bukan nol.

Tokopedia, TikTok Shop, dan Lazada tercatat tautannya. Omset Laris untuk platform itu belum kami hitung.

Angka yang kamu ketik sendiri disimpan sebagai laporanmu. Laporan itu tidak menghitung milestone Rp 3 juta. Milestone itu hanya dari jumlah perkiraan listing Shopee yang ada di data Laris, minimal Rp 3.000.000, dan itu omset kotor bukan untung.$body$,
  jsonb_build_array(
    'URL toko tersimpan tanpa kami login ke akunmu.',
    'Omset yang kami tunjukkan adalah perkiraan, dan hanya listing yang ada di data Laris.',
    'Rp 3 juta di sini adalah omset kotor, bukan untung.'
  ),
  '[]'::jsonb,
  '[]'::jsonb,
  jsonb_build_object('label', 'Simpan URL toko', 'view', 'profil', 'verify_key', 'store'),
  null, 8, 3
);

select public.belajar_seed_lesson(
  'pantau', 'pantau-kompetitor', 'Pantau kompetitor',
  'tool', null,
  $body$Favorit Aku menyimpan listing, dan kami cek ulang hampir tiap hari. Perubahan harian dari bucket terjual tetap perkiraan.

Kalau analisis tadi menemukan listing, simpan yang mau kamu jaga. Kalau tidak ada di data Laris, tempel URL produk Shopee. Kalau URL itu ada di data kami, ia masuk Favorit. Kalau tidak, kami simpan sebagai catatanmu, tanpa angka penjualan yang kami karang.

Nyalakan kabar di Favorit Aku kalau kamu mau diberitahu. Kabar yang mati tidak kami anggap selesai, dan tidak kami isi sendiri. Langkah ini selesai kalau ada minimal satu Favorit, atau satu catatan URL yang kamu simpan.$body$,
  jsonb_build_array(
    'Pantau listing, bukan kata kunci.',
    'URL yang tidak ada di data Laris tetap catatan, tanpa omset palsu.',
    'Kabar email atau WhatsApp opsional. Satu favorit sudah menghitung langkah ini.'
  ),
  jsonb_build_array(jsonb_build_object(
    'name', 'Ekstensi Chrome LarisID',
    'url', 'https://chromewebstore.google.com/detail/ldgcjbnecfnpbgenechgfbdagecnloae'
  )),
  '[]'::jsonb,
  jsonb_build_object('label', 'Buka Favorit Aku', 'view', 'tracker', 'verify_key', 'watch'),
  null, 10, 1
);

drop function public.belajar_seed_lesson(
  text, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb, text, int, int
);

comment on table public.course_modules is
  'Belajar modules. Existing-store track counts sort_order >= 3 (tempat jual and pantau). Earlier modules stay readable.';
comment on table public.course_lessons is
  'Belajar lessons. action.verify_key: ide | pra | deepdive | favorit3 | kalk | diskusi | store | watch | pantau.';

-- ── Course payload ───────────────────────────────────────────────────────────

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
  v_diskusi boolean := false;
  v_analyzed boolean := false;
  v_title boolean := false;
  v_manual boolean := false;
  v_track text;
  v_plats text[];
  v_baseline text := 'unknown';
  v_draft jsonb := '{}'::jsonb;
  v_seller text;
  v_done int := 0;
  v_total int := 0;
  v_next jsonb := null;
  v_mods jsonb := '[]'::jsonb;
  v_favs jsonb := '[]'::jsonb;
  v_outcome jsonb := null;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'login_required');
  end if;
  if not public.is_platform_admin() then
    return jsonb_build_object('ok', false, 'error', 'admin_only');
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

  v_diskusi := exists (
    select 1 from public.feature_requests fr
    where fr.author_id = v_me and fr.kind = 'question'
  );

  select st.track, st.platforms, st.baseline, st.listing_draft
    into v_track, v_plats, v_baseline, v_draft
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

    select st.track, st.platforms, st.baseline, st.listing_draft
      into v_track, v_plats, v_baseline, v_draft
    from public.user_course_state st
    where st.user_id = v_me;
  end if;

  v_baseline := coalesce(v_baseline, 'unknown');
  v_draft := coalesce(v_draft, '{}'::jsonb);
  v_analyzed := coalesce(v_draft->'analysis'->>'ran', '') = 'true';
  v_title := btrim(coalesce(v_draft->'listing'->>'title', '')) <> '';
  v_manual := jsonb_typeof(v_draft->'manual') = 'array'
    and jsonb_array_length(v_draft->'manual') > 0;

  insert into public.user_lesson_progress (user_id, lesson_id, status, done_at)
  select v_me, l.id, 'done', now()
  from public.course_lessons l
  join public.course_modules m on m.id = l.module_id and m.published
  where l.published
    and (
      (l.action->>'verify_key' = 'ide' and (v_dd >= 1 or v_analyzed))
      or (l.action->>'verify_key' = 'pra' and v_title)
      or (l.action->>'verify_key' = 'deepdive' and v_dd >= 1)
      or (l.action->>'verify_key' = 'favorit3' and v_fav >= 3)
      or (l.action->>'verify_key' = 'kalk' and v_kalk >= 1)
      or (l.action->>'verify_key' = 'diskusi' and v_diskusi)
      or (l.action->>'verify_key' = 'store' and v_store)
      or (l.action->>'verify_key' = 'watch' and (v_fav >= 1 or v_manual))
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
        when 'ide' then (v_dd >= 1 or v_analyzed)
        when 'pra' then v_title
        when 'deepdive' then v_dd >= 1
        when 'favorit3' then v_fav >= 3
        when 'kalk' then v_kalk >= 1
        when 'diskusi' then v_diskusi
        when 'store' then v_store
        when 'watch' then (v_fav >= 1 or v_manual)
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
          or m.sort_order >= 3
          or m.slug = 'pantau'
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

  select coalesce(jsonb_agg(jsonb_build_object(
    'item_id', t.item_id,
    'shop_id', t.shop_id,
    'name', left(coalesce(t.product_name, ''), 180),
    'store', left(coalesce(t.store_name, ''), 120),
    'price', t.price
  ) order by t.tracked_at desc), '[]'::jsonb)
    into v_favs
  from (
    select item_id, shop_id, product_name, store_name, price, tracked_at
    from public.user_tracked_products
    where user_id = v_me
    order by tracked_at desc nulls last
    limit 8
  ) t;

  select jsonb_build_object(
    'platform', o.platform,
    'shop_url', o.shop_url,
    'shop_ref', o.shop_ref,
    'baseline', o.baseline,
    'linked_at', o.linked_at,
    'est_omset_idr', o.est_omset_idr,
    'est_listing_n', o.est_listing_n,
    'est_omset_at', o.est_omset_at,
    'reached_3jt_at', o.reached_3jt_at,
    'reported_omset_idr', o.reported_omset_idr
  )
    into v_outcome
  from public.user_seller_outcomes o
  where o.user_id = v_me;

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
    'baseline', v_baseline,
    'platforms', to_jsonb(v_plats),
    'draft', v_draft,
    'outcome', v_outcome,
    'favorites', coalesce(v_favs, '[]'::jsonb),
    'signals', jsonb_build_object(
      'deepdive', v_dd,
      'favorit', v_fav,
      'kalk', v_kalk,
      'store', v_store,
      'notify', v_notify,
      'diskusi', v_diskusi,
      'analyzed', v_analyzed,
      'title', v_title,
      'watch', (v_fav >= 1 or v_manual)
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

create or replace function public.belajar_save_draft(p_draft jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_clean jsonb;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'login_required');
  end if;
  if not public.is_platform_admin() then
    return jsonb_build_object('ok', false, 'error', 'admin_only');
  end if;
  if octet_length(coalesce(p_draft, '{}'::jsonb)::text) > 24000 then
    return jsonb_build_object('ok', false, 'error', 'draft_too_big');
  end if;
  v_clean := public.belajar_clean_draft(coalesce(p_draft, '{}'::jsonb));
  insert into public.user_course_state (user_id, listing_draft)
  values (v_me, v_clean)
  on conflict (user_id) do update
    set listing_draft = excluded.listing_draft,
        updated_at = now();
  return public.belajar_course();
end;
$$;

revoke all on function public.belajar_save_draft(jsonb) from public, anon;
grant execute on function public.belajar_save_draft(jsonb) to authenticated;

create or replace function public.belajar_set_baseline(p_baseline text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_base text := lower(btrim(coalesce(p_baseline, '')));
  v_track text;
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'login_required');
  end if;
  if not public.is_platform_admin() then
    return jsonb_build_object('ok', false, 'error', 'admin_only');
  end if;
  if v_base not in ('no_store', 'no_sales', 'has_sales') then
    return jsonb_build_object('ok', false, 'error', 'bad_baseline');
  end if;
  v_track := case when v_base = 'no_store' then 'new' else 'existing' end;
  insert into public.user_course_state (user_id, track, platforms, baseline)
  values (v_me, v_track, array['shopee']::text[], v_base)
  on conflict (user_id) do update
    set baseline = excluded.baseline,
        track = excluded.track,
        updated_at = now();
  return public.belajar_course();
end;
$$;

revoke all on function public.belajar_set_baseline(text) from public, anon;
grant execute on function public.belajar_set_baseline(text) to authenticated;

create or replace function public.belajar_link_shop(p_url text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  rec public.student_account;
  v_platform text;
  v_base text := 'unknown';
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'login_required');
  end if;
  if not public.is_platform_admin() then
    return jsonb_build_object('ok', false, 'error', 'admin_only');
  end if;

  begin
    select * into rec from public.ssis_link_shop(p_url);
    if not found or rec.id is null then
      return jsonb_build_object('ok', false, 'error', 'link_failed', 'message', 'URL toko belum tersimpan.');
    end if;
  exception when others then
    return jsonb_build_object('ok', false, 'error', 'link_failed', 'message', sqlerrm);
  end;

  select coalesce(st.baseline, 'unknown') into v_base
  from public.user_course_state st
  where st.user_id = v_me;
  if not found then v_base := 'unknown'; end if;

  v_platform := case rec.platform when 'tiktok_shop' then 'tiktok' else rec.platform end;

  insert into public.user_seller_outcomes (
    user_id, platform, shop_url, shop_ref, baseline, linked_at
  ) values (
    v_me, v_platform, rec.url, nullif(btrim(coalesce(rec.platform_ref, '')), ''), v_base, now()
  )
  on conflict (user_id) do update
    set platform = excluded.platform,
        shop_url = excluded.shop_url,
        shop_ref = excluded.shop_ref,
        baseline = excluded.baseline,
        linked_at = case
          when public.user_seller_outcomes.shop_url is distinct from excluded.shop_url then now()
          else public.user_seller_outcomes.linked_at
        end,
        est_omset_idr = case
          when public.user_seller_outcomes.shop_url is distinct from excluded.shop_url then null
          else public.user_seller_outcomes.est_omset_idr
        end,
        est_listing_n = case
          when public.user_seller_outcomes.shop_url is distinct from excluded.shop_url then null
          else public.user_seller_outcomes.est_listing_n
        end,
        est_omset_at = case
          when public.user_seller_outcomes.shop_url is distinct from excluded.shop_url then null
          else public.user_seller_outcomes.est_omset_at
        end,
        reached_3jt_at = case
          when public.user_seller_outcomes.shop_url is distinct from excluded.shop_url then null
          else public.user_seller_outcomes.reached_3jt_at
        end,
        reported_omset_idr = case
          when public.user_seller_outcomes.shop_url is distinct from excluded.shop_url then null
          else public.user_seller_outcomes.reported_omset_idr
        end,
        reported_at = case
          when public.user_seller_outcomes.shop_url is distinct from excluded.shop_url then null
          else public.user_seller_outcomes.reported_at
        end,
        updated_at = now();

  perform public.belajar_refresh_user_outcome(v_me);
  return public.belajar_course();
end;
$$;

revoke all on function public.belajar_link_shop(text) from public, anon;
grant execute on function public.belajar_link_shop(text) to authenticated;

create or replace function public.belajar_set_reported_omset(p_amount bigint)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
begin
  if v_me is null then
    return jsonb_build_object('ok', false, 'error', 'login_required');
  end if;
  if not public.is_platform_admin() then
    return jsonb_build_object('ok', false, 'error', 'admin_only');
  end if;
  if not exists (select 1 from public.user_seller_outcomes o where o.user_id = v_me) then
    return jsonb_build_object('ok', false, 'error', 'no_shop');
  end if;
  if p_amount is not null and (p_amount < 0 or p_amount > 1000000000000) then
    return jsonb_build_object('ok', false, 'error', 'bad_amount');
  end if;
  update public.user_seller_outcomes
     set reported_omset_idr = p_amount,
         reported_at = case when p_amount is null then null else now() end,
         updated_at = now()
   where user_id = v_me;
  return public.belajar_course();
end;
$$;

revoke all on function public.belajar_set_reported_omset(bigint) from public, anon;
grant execute on function public.belajar_set_reported_omset(bigint) to authenticated;

-- ── Admin counts ─────────────────────────────────────────────────────────────

create or replace function public.belajar_admin_overview()
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  r record;
  v_funnel jsonb;
begin
  if not public.is_platform_admin() then
    return jsonb_build_object('ok', false, 'error', 'admin_only');
  end if;

  begin
    for r in select user_id from public.user_seller_outcomes loop
      perform public.belajar_refresh_user_outcome(r.user_id);
    end loop;
  exception when others then
    null;
  end;

  v_funnel := jsonb_build_object(
    'started', (select count(*)::int from public.user_course_state),
    'no_store', (select count(*)::int from public.user_course_state where baseline = 'no_store'),
    'no_sales', (select count(*)::int from public.user_course_state where baseline = 'no_sales'),
    'has_sales', (select count(*)::int from public.user_course_state where baseline = 'has_sales'),
    'unknown', (select count(*)::int from public.user_course_state where baseline = 'unknown'),
    'linked', (select count(*)::int from public.user_seller_outcomes),
    'reached_3jt', (select count(*)::int from public.user_seller_outcomes where reached_3jt_at is not null),
    'linked_no_store', (select count(*)::int from public.user_seller_outcomes where baseline = 'no_store'),
    'linked_no_sales', (select count(*)::int from public.user_seller_outcomes where baseline = 'no_sales'),
    'reached_no_store', (select count(*)::int from public.user_seller_outcomes where baseline = 'no_store' and reached_3jt_at is not null),
    'reached_no_sales', (select count(*)::int from public.user_seller_outcomes where baseline = 'no_sales' and reached_3jt_at is not null)
  );

  return jsonb_build_object(
    'ok', true,
    'learners', (select count(*)::int from public.user_course_state),
    'completed', (select count(*)::int from public.user_course_state where completed_at is not null),
    'funnel', v_funnel,
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

notify pgrst, 'reload schema';

commit;
