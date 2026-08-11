-- Fix: keyword-based category fallback classified Olahraga & Outdoor items as
-- Fashion because generic apparel terms in the Fashion regex (celana, jaket,
-- bra, legging, ...) also describe sportswear, and Fashion was evaluated
-- before Olahraga & Outdoor in the ordered CASE. Move Olahraga & Outdoor to
-- evaluate right after Sepatu, Tas & Aksesoris — before Fashion — so
-- sport-specific terms (olahraga, fitness, gym, jersey, running, badminton,
-- futsal, ...) win first. Only affects rows with empty raw_category (the
-- fallback path); everything else is unchanged from
-- 20260728130000_category_canonical.sql.
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

    -- Olahraga & Outdoor (moved above Fashion: sport-specific terms like
    -- "jersey", "running", "badminton" must win before Fashion's generic
    -- apparel terms swallow sportswear like sports bras/leggings/jackets)
    when kw ~* '(olahraga|fitness|gym|yoga|matras|dumbbell|barbel|treadmill|sepeda |sepeda$|bola |raket|renang|swim|diving|hiking|camping|tenda|carrier|sleeping bag|kompor portable|pancing|fishing|jersey|running|lari |skipping|golf|badminton|futsal)' then 'Olahraga & Outdoor'

    -- Fashion
    when kw ~* '(baju|kaos|kemeja|celana|jaket|hoodie|sweater|dress|rok |blouse|gamis|hijab|jilbab|mukena|kerudung|batik|tenun|daster|piyama|kaos kaki|sock|bra|bikini|underwear|pakaian dalam|legging|jeans|flannel|blazer|cardigan|topi|hat|kacamata|sabuk|ikat pinggang|syal|sarung tangan fashion|jas |suit|shirt|blouse|skirt|trouser|swimwear|swimsuit|bikini|lingerie|boob|bra$|robe|kimono|american eagle|outfit|apparel|clothing)' then 'Fashion'

    -- Taman, Tanaman & Perkakas
    when kw ~* '(tanaman|pot bunga|pot tanaman|pupuk|benih|bibit|berkebun|taman|selang air|sprayer|gunting rumput|cangkul|sekop|obeng|tang |palu |bor |gergaji|kunci pas|perkakas|toolkit|meteran|las |paku|sekrup|amplas|cat tembok|teak wood|kayu)' then 'Taman, Tanaman & Perkakas'

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
