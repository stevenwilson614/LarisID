-- Canonical category taxonomy.
--
-- Measured against this DB before writing: listings_deduped carries 84 distinct
-- category strings PLUS a 60,105-listing / 728-keyword bucket where category is
-- an EMPTY STRING (not NULL — coalesce() does not catch it). The apps hardcode
-- 19 categories, so only 1,256 of 3,854 product types (32.6%) were reachable
-- through the category chips; 2,598 were orphaned.
--
-- The fragmentation is the obvious kind: Fashion / Fashion Muslim / Fashion
-- Wanita / Fashion Pria / Fashion Anak / Pakaian Dalam / Batik & Tenun /
-- Konveksi & Kaos / Aksesoris Fashion are nine separate strings; beauty is split
-- across eight. Meanwhile Furniture (73 kw), Perkakas (77 kw), Gaming & Komputer
-- (50 kw) and Sparepart Motor (50 kw) had no chip at all.
--
-- This establishes ONE canonical set of 18 buckets that the matview, Site A and
-- Site B all read, so the taxonomy cannot drift between them again.

-- ── 1. Raw string -> canonical bucket ────────────────────────────────────
create table if not exists public.category_map (
  raw_category text primary key,
  canonical    text not null,
  sort_order   int  not null default 100
);

grant select on public.category_map to anon, authenticated;

truncate public.category_map;
insert into public.category_map (raw_category, canonical, sort_order) values
  -- Rumah & Dekorasi
  ('Rumah','Rumah & Dekorasi',10), ('Furniture','Rumah & Dekorasi',10),
  ('Tekstil Rumah','Rumah & Dekorasi',10), ('Dekorasi','Rumah & Dekorasi',10),
  ('Kebersihan','Rumah & Dekorasi',10), ('Laundry','Rumah & Dekorasi',10),
  -- Dapur
  ('Dapur','Dapur',20), ('Baking','Dapur',20),
  ('Penyimpanan Makanan','Dapur',20), ('Kopi','Dapur',20),
  -- Kamar Mandi
  ('Kamar Mandi','Kamar Mandi',30),
  -- Fashion
  ('Fashion','Fashion',40), ('Fashion Muslim','Fashion',40),
  ('Fashion Pria & Wanita','Fashion',40), ('Fashion Wanita','Fashion',40),
  ('Fashion Pria','Fashion',40), ('Fashion Anak','Fashion',40),
  ('Pakaian Dalam','Fashion',40), ('Batik & Tenun','Fashion',40),
  ('Konveksi & Kaos','Fashion',40), ('Aksesoris Fashion','Fashion',40),
  -- Sepatu, Tas & Aksesoris
  ('Sepatu & Sandal','Sepatu, Tas & Aksesoris',50), ('Tas','Sepatu, Tas & Aksesoris',50),
  ('Perhiasan','Sepatu, Tas & Aksesoris',50), ('Jam','Sepatu, Tas & Aksesoris',50),
  ('Jam Tangan','Sepatu, Tas & Aksesoris',50),
  -- Kecantikan & Perawatan
  ('Kecantikan','Kecantikan & Perawatan',60), ('Skincare','Kecantikan & Perawatan',60),
  ('Skincare & Kecantikan','Kecantikan & Perawatan',60), ('Makeup','Kecantikan & Perawatan',60),
  ('Body Care','Kecantikan & Perawatan',60), ('Rambut','Kecantikan & Perawatan',60),
  ('Parfum','Kecantikan & Perawatan',60), ('Grooming Pria','Kecantikan & Perawatan',60),
  -- Kesehatan
  ('Kesehatan','Kesehatan',70), ('Kesehatan & Herbal','Kesehatan',70),
  -- Ibu, Bayi & Anak
  ('Bayi & Anak','Ibu, Bayi & Anak',80), ('Ibu & Bayi','Ibu, Bayi & Anak',80),
  ('Mainan','Ibu, Bayi & Anak',80),
  -- Elektronik & Listrik
  ('Elektronik','Elektronik & Listrik',90), ('Elektronik Rumah Tangga','Elektronik & Listrik',90),
  ('Listrik & Elektrikal','Elektronik & Listrik',90), ('Audio & Wearable','Elektronik & Listrik',90),
  ('Keamanan','Elektronik & Listrik',90),
  -- HP, Komputer & Gaming
  ('HP & Gadget','HP, Komputer & Gaming',100), ('Gaming & Komputer','HP, Komputer & Gaming',100),
  ('Komputer','HP, Komputer & Gaming',100),
  -- Motor & Mobil
  ('Motor & Mobil','Motor & Mobil',110), ('Sparepart Motor','Motor & Mobil',110),
  ('Aksesoris Mobil','Motor & Mobil',110), ('Sparepart Mobil','Motor & Mobil',110),
  ('Motor','Motor & Mobil',110), ('Kendaraan Listrik','Motor & Mobil',110),
  -- Olahraga & Outdoor
  ('Olahraga','Olahraga & Outdoor',120), ('Outdoor & Camping','Olahraga & Outdoor',120),
  ('Sepeda','Olahraga & Outdoor',120), ('Travel & Outdoor','Olahraga & Outdoor',120),
  ('Travel','Olahraga & Outdoor',120), ('Outdoor','Olahraga & Outdoor',120),
  ('Pancing','Olahraga & Outdoor',120),
  -- Hewan Peliharaan
  ('Hewan Peliharaan','Hewan Peliharaan',130),
  -- Taman, Tanaman & Perkakas
  ('Taman','Taman, Tanaman & Perkakas',140), ('Tanaman','Taman, Tanaman & Perkakas',140),
  ('Tanaman Hias','Taman, Tanaman & Perkakas',140),
  ('Pertanian & Berkebun','Taman, Tanaman & Perkakas',140),
  ('Pertanian','Taman, Tanaman & Perkakas',140), ('Perkakas','Taman, Tanaman & Perkakas',140),
  -- Sekolah, Kantor & Usaha
  ('Alat Tulis','Sekolah, Kantor & Usaha',150), ('Sekolah & ATK','Sekolah, Kantor & Usaha',150),
  ('Buku & Alat Tulis','Sekolah, Kantor & Usaha',150), ('Buku','Sekolah, Kantor & Usaha',150),
  ('Kantor','Sekolah, Kantor & Usaha',150), ('Perlengkapan Usaha','Sekolah, Kantor & Usaha',150),
  -- Hobi, Kerajinan & Pesta
  ('Hobi & Kerajinan','Hobi, Kerajinan & Pesta',160), ('Kerajinan & Hobi','Hobi, Kerajinan & Pesta',160),
  ('Hobi','Hobi, Kerajinan & Pesta',160), ('Jahit','Hobi, Kerajinan & Pesta',160),
  ('Alat Musik','Hobi, Kerajinan & Pesta',160), ('Pesta & Dekorasi','Hobi, Kerajinan & Pesta',160),
  ('Pernikahan & Souvenir','Hobi, Kerajinan & Pesta',160), ('Kado & Hampers','Hobi, Kerajinan & Pesta',160),
  -- Makanan & Minuman
  ('Makanan & Minuman','Makanan & Minuman',170), ('Sembako','Makanan & Minuman',170),
  -- Perlengkapan Ibadah (kept distinct: 48 keywords, culturally specific)
  ('Perlengkapan Ibadah','Perlengkapan Ibadah',180);

-- ── 2. Keyword-based inference for the uncategorised bucket ──────────────
-- 728 keywords / 60k listings arrive with category = ''. Rules are ordered:
-- the first match wins, so put specific patterns above generic ones.
create or replace function public._lid_category_from_keyword(kw text)
returns text
language sql immutable
as $$
  select case
    when kw is null or btrim(kw) = '' then null

    -- Ibu, Bayi & Anak (before Fashion: "celana bayi" must not read as Fashion)
    when kw ~* '(bayi|baby|balita|newborn|anak-anak|stroller|popok|dot susu|asi |mpasi|kereta dorong|gendongan|mainan|toys|puzzle|lego|boneka|action figure|edukasi anak|flash ?card|sepeda anak|ibu hamil|menyusui|nursing|maternity|bumil|basinet|bassinet|breast ?pump|after birth|bekal anak|anak$)' then 'Ibu, Bayi & Anak'

    -- Kecantikan & Perawatan
    when kw ~* '(skincare|serum|toner|moisturi|sunscreen|sunblock|facial|masker wajah|lipstik|lipstick|lip ?balm|lip ?tint|makeup|make up|bedak|foundation|concealer|maskara|mascara|eyeliner|eyeshadow|blush|setting spray|micellar|cleanser|kojic|body ?scrub|hair ?spray|hairspray|hair ?straightener|hyaluronic|retinol|niacinamide|eye ?mask|face ?mask|nail |cuticle|epilator|shaver|razor|whitening|pemutih|jerawat|acne|komedo|parfum|perfume|body ?lotion|body ?wash|hand ?body|shampo|shampoo|conditioner|hair ?tonic|hair ?mask|catok|rambut|sisir|kutek|kuku palsu|nail art|lensa kontak|softlens|bulu mata|alis)' then 'Kecantikan & Perawatan'

    -- Kesehatan
    when kw ~* '(vitamin|suplemen|supplement|propolis|herbal|jamu|temulawak|obat |p3k|masker medis|termometer|tensimeter|oximeter|kursi roda|alat pijat|massage|korset|penyangga|nebulizer|madu murni|collagen|kolagen|probiotik|diet|bcaa|whey|protein|glucometer|compression stocking|orthopedic|orthotic|first aid|blood pressure)' then 'Kesehatan'

    -- Makanan & Minuman
    when kw ~* '(kopi|teh |teh$|coklat|chocolate|snack|keripik|kerupuk|mie |mie$|beras|gula |minyak goreng|sambal|saus|kecap|selai|granola|sereal|yogurt|susu |jus |sirup|madu|kacang|abon|dendeng|frozen food|bumbu dapur|santan|tepung|oleh.?oleh|makanan|minuman|sembako|air mineral|energy drink|biskuit|roti |permen|candy|es krim|tea bag|coffee|matcha|spice|seasoning|olive oil|peanut butter)' then 'Makanan & Minuman'

    -- Hewan Peliharaan
    when kw ~* '(kucing|anjing|kelinci|hamster|burung|ikan hias|aquarium|akuarium|pet |pakan|cat food|dog food|kandang|litter|grooming hewan|bird ?feeder)' then 'Hewan Peliharaan'

    -- Motor & Mobil
    when kw ~* '(motor|mobil|sepeda motor|helm|knalpot|ban |velg|oli |aki |busi|kampas rem|spion|jok |car |otomotif|dashboard|wiper|klakson|shock ?breaker|vario|beat |nmax|pcx)' then 'Motor & Mobil'

    -- HP, Komputer & Gaming
    when kw ~* '(hp |handphone|smartphone|iphone|samsung|xiaomi|oppo|vivo|realme|casing hp|case hp|tempered glass|charger hp|power ?bank|laptop|notebook|keyboard|mouse|monitor|pc |komputer|ssd|hardisk|flashdisk|ram |gaming|konsol|playstation|nintendo|joystick|webcam|printer|router|wifi|ipad|tablet|airpod|earbud|flash ?drive|usb |apple watch|watch band|smart ?watch|aksesoris hp|phone|charger|kabel data)' then 'HP, Komputer & Gaming'

    -- Elektronik & Listrik
    when kw ~* '(tv |smart tv|televisi|kulkas|mesin cuci|kipas angin|ac |air conditioner|dispenser|rice cooker|blender|microwave|oven listrik|setrika|vacuum|penyedot debu|lampu|led|senter|kabel|stop kontak|saklar|adaptor|baterai|earphone|headset|headphone|speaker|tws|bluetooth|smartwatch|cctv|kamera|alarm|gembok|kunci pintar|solar panel|heater|air ?purifier|humidifier|elektronik|electronic)' then 'Elektronik & Listrik'

    -- Dapur
    when kw ~* '(panci|wajan|penggorengan|presto|talenan|pisau dapur|spatula|sendok|garpu|piring|mangkuk|gelas |cangkir|teko|termos|toples|candy jar|serving dish|tempat bumbu|rak piring|celemek|loyang|cetakan kue|mixer|dapur|kitchen|masak|tumbler|botol minum|sedotan|tupperware|food container|food processor|food protector|spoon rest|serving |candy jar|botol|gelas|mug|tea ?pot|cutting board|colander|strainer|whisk|tray)' then 'Dapur'

    -- Kamar Mandi
    when kw ~* '(kamar mandi|shower|gayung|ember|kloset|toilet|wastafel|keran|sabun cuci tangan|sikat gigi|pasta gigi|handuk|keset|tirai shower|dispenser sabun)' then 'Kamar Mandi'

    -- Sepatu, Tas & Aksesoris
    when kw ~* '(sepatu|sandal|sneakers|loafer|boots|heels|slip ?on|birkenstock|tas |ransel|backpack|koper|dompet|pouch|selempang|tote ?bag|jam tangan|kalung|gelang|cincin|anting|perhiasan|emas |liontin|birkenstok|birkenstock|chain|necklace|bracelet|earring|watch strap|sunglass|glasses|eyewear)' then 'Sepatu, Tas & Aksesoris'

    -- Fashion
    when kw ~* '(baju|kaos|kemeja|celana|jaket|hoodie|sweater|dress|rok |blouse|gamis|hijab|jilbab|mukena|kerudung|batik|tenun|daster|piyama|kaos kaki|sock|bra|bikini|underwear|pakaian dalam|legging|jeans|flannel|blazer|cardigan|topi|hat|kacamata|sabuk|ikat pinggang|syal|sarung tangan fashion|jas |suit|shirt|blouse|skirt|trouser|swimwear|swimsuit|bikini|lingerie|boob|bra$|robe|kimono|american eagle|outfit|apparel|clothing)' then 'Fashion'

    -- Taman, Tanaman & Perkakas
    when kw ~* '(tanaman|pot bunga|pot tanaman|pupuk|benih|bibit|berkebun|taman|selang air|sprayer|gunting rumput|cangkul|sekop|obeng|tang |palu |bor |gergaji|kunci pas|perkakas|toolkit|meteran|las |paku|sekrup|amplas|cat tembok|teak wood|kayu)' then 'Taman, Tanaman & Perkakas'

    -- Olahraga & Outdoor
    when kw ~* '(olahraga|fitness|gym|yoga|matras|dumbbell|barbel|treadmill|sepeda |sepeda$|bola |raket|renang|swim|diving|hiking|camping|tenda|carrier|sleeping bag|kompor portable|pancing|fishing|jersey|running|lari |skipping|golf|badminton|futsal)' then 'Olahraga & Outdoor'

    -- Sekolah, Kantor & Usaha
    when kw ~* '(pulpen|pena |pensil|spidol|stabilo|penghapus|penggaris|buku tulis|binder|map |folder|stapler|kalkulator|alat tulis|atk|sekolah|kantor|kartu nama|kalender|calender|label|stiker|amplop|kasir|struk|mesin kasir|barcode|packing|bubble wrap|kardus)' then 'Sekolah, Kantor & Usaha'

    -- Hobi, Kerajinan & Pesta
    when kw ~* '(kerajinan|craft|rajut|benang|jahit|jarum|kain flanel|manik|lem tembak|lukis|kanvas|gitar|piano|ukulele|drum|alat musik|pesta|balon|dekorasi ulang tahun|souvenir|hampers|kado|gift|wedding|pernikahan|scrapbook|diecast|miniatur|puzzle dewasa|board game)' then 'Hobi, Kerajinan & Pesta'

    -- Perlengkapan Ibadah
    when kw ~* '(sajadah|tasbih|al.?quran|iqro|peci|kopiah|sarung pria|perlengkapan ibadah|rosario|salib)' then 'Perlengkapan Ibadah'

    -- Rumah & Dekorasi (generic — last, it is the widest net)
    when kw ~* '(rumah|sofa|kasur|springbed|bantal|guling|sprei|selimut|gorden|tirai|karpet|rak |lemari|meja |kursi|laci|gantungan|hanger|organizer|penyimpanan|tempat sampah|sapu|pel |pembersih|dekorasi|hiasan|wall decor|jam dinding|cermin|vas |lilin|aromaterapi|pigura|furniture|kabinet|shelf|shelving|head ?board|bed frame|nightstand|dresser|wardrobe|stool|bench|ottoman|curtain|rug |mat |vase|frame|wall |decor|magnet|sticker|stickers)' then 'Rumah & Dekorasi'

    else null
  end;
$$;

-- ── 3. Canonical resolver: explicit map first, keyword inference second ──
create or replace function public._lid_canonical_category(raw text, kw text)
returns text
language sql stable
as $$
  select coalesce(
    (select cm.canonical from public.category_map cm
      where cm.raw_category = btrim(raw) and coalesce(btrim(raw),'') <> ''),
    public._lid_category_from_keyword(kw),
    'Lainnya'
  );
$$;

-- ── 4. Subgroups live in a table, not the matview ────────────────────────
-- A materialized view cannot be UPDATEd, so scripts/build-subgroups.mjs writes
-- here and mv_product_types left-joins it. Populate BEFORE refreshing the view.
create table if not exists public.keyword_subgroup (
  keyword    text primary key,
  canonical  text not null,
  subgroup   text not null,
  updated_at timestamptz not null default now()
);
create index if not exists keyword_subgroup_canon_idx on public.keyword_subgroup (canonical, subgroup);
grant select on public.keyword_subgroup to anon, authenticated;
