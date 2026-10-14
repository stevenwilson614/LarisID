-- Belajar Unit 1 refresh: Mau jual apa? + Nilai listingmu; drop Cara kerja tautan.
-- Contabo only: bash scripts/apply-selfhost.sh supabase/migrations/20261014200000_belajar_unit1_refresh.sql

create or replace function public.belajar_clean_draft(p jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  idea jsonb := '{}'::jsonb;
  analysis jsonb := '{}'::jsonb;
  listing jsonb := '{}'::jsonb;
  rating jsonb := '{}'::jsonb;
  words jsonb := '[]'::jsonb;
  sample jsonb := '[]'::jsonb;
  tips jsonb := '[]'::jsonb;
  manual jsonb := '[]'::jsonb;
  v_cost bigint;
  v_price bigint;
  v_median bigint;
  v_user_price bigint;
  v_p25 bigint;
  v_p75 bigint;
  v_n int;
  v_score int;
begin
  if p is null or jsonb_typeof(p) is distinct from 'object' then
    return '{}'::jsonb;
  end if;
  if jsonb_typeof(p->'idea') = 'object' then idea := p->'idea'; end if;
  if jsonb_typeof(p->'analysis') = 'object' then analysis := p->'analysis'; end if;
  if jsonb_typeof(p->'listing') = 'object' then listing := p->'listing'; end if;
  if jsonb_typeof(p->'rating') = 'object' then rating := p->'rating'; end if;

  v_cost := case when coalesce(idea->>'cost', '') ~ '^[0-9]{1,12}$' then (idea->>'cost')::bigint else null end;
  v_price := case when coalesce(idea->>'price', '') ~ '^[0-9]{1,12}$' then (idea->>'price')::bigint else null end;
  v_median := case when coalesce(analysis->>'median_price', '') ~ '^[0-9]{1,12}$' then (analysis->>'median_price')::bigint else null end;
  v_user_price := case when coalesce(analysis->>'user_price', '') ~ '^[0-9]{1,12}$' then (analysis->>'user_price')::bigint else null end;
  v_p25 := case when coalesce(analysis->>'omset_p25', '') ~ '^[0-9]{1,15}$' then (analysis->>'omset_p25')::bigint else null end;
  v_p75 := case when coalesce(analysis->>'omset_p75', '') ~ '^[0-9]{1,15}$' then (analysis->>'omset_p75')::bigint else null end;
  v_n := case when coalesce(analysis->>'n', '') ~ '^[0-9]{1,6}$' then (analysis->>'n')::int else 0 end;
  v_score := case when coalesce(rating->>'score', '') ~ '^[0-9]{1,2}$' then (rating->>'score')::int else 0 end;
  if v_score > 10 then v_score := 10; end if;

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

  select coalesce(jsonb_agg(to_jsonb(left(s.t, 280)) order by s.ord), '[]'::jsonb)
    into tips
  from (
    select e #>> '{}' as t, ord
    from jsonb_array_elements(
      case when jsonb_typeof(rating->'tips') = 'array' then rating->'tips' else '[]'::jsonb end
    ) with ordinality as t(e, ord)
    where jsonb_typeof(e) = 'string'
    limit 8
  ) s
  where btrim(s.t) <> '';

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
    'rating', jsonb_build_object(
      'ran', rating->>'ran' = 'true',
      'score', v_score,
      'tips', coalesce(tips, '[]'::jsonb)
    ),
    'manual', coalesce(manual, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.belajar_clean_draft(jsonb) from public, anon, authenticated;

update public.course_modules
set subtitle = 'Mau jual apa, lalu nilai listingmu sebelum sourcing.',
    updated_at = now()
where slug = 'cari';

update public.course_lessons
set
  title = 'Mau jual apa?',
  body = $body$Isi nama produk yang mau kamu jual. Kami cari listing Shopee yang mirip dari data sampel LarisID.

Hasilnya sampel pencarian, bukan seluruh pasar. Harga dibanding median sampel. Omset yang muncul adalah perkiraan, kecuali listing itu terukur di tempat lain di LarisID. Tidak ada angka "kamu akan dapat sekian".

Belum punya ide? Cari inspirasi di Cari Produk di bawah form.$body$,
  points = jsonb_build_array(
    'Membandingkan harga ide dengan median listing yang ketemu.',
    'Melihat rentang omset perkiraan dari sampel itu, bukan janji untuk produkmu.',
    'Membuka Cari Produk kalau butuh inspirasi.'
  ),
  resources = '[]'::jsonb,
  updated_at = now()
where slug = 'ide-produk';

update public.course_lessons
set
  title = 'Nilai listingmu',
  body = $body$Ini belum listing di marketplace. Nilai draf judul dan deskripsimu terhadap listing kompetitor dari langkah sebelumnya.

Kalau analisis ide sudah jalan, kami ambil foto sampel dari listing mirip sebagai referensi. Kamu bisa ganti dengan foto sendiri — foto hanya tampil di perangkat ini, kami tidak menyimpannya. Pakai foto yang haknya kamu punya.

Saran diambil dari judul dan harga sampel, bukan resep fitur yang kami karang.$body$,
  points = jsonb_build_array(
    'Judul yang menyebut isi atau manfaat, dengan kata yang orang ketik.',
    'Deskripsi yang jujur soal bahan, ukuran, dan isi paket.',
    'Bandingkan dengan kompetitor dari langkah ide sebelum naik listing.'
  ),
  resources = '[]'::jsonb,
  updated_at = now()
where slug = 'pra-listing';

-- Drop Cara kerja LarisID from any other lesson that still links it.
update public.course_lessons
set
  resources = coalesce((
    select jsonb_agg(r)
    from jsonb_array_elements(coalesce(resources, '[]'::jsonb)) r
    where coalesce(r->>'url', '') not in ('/cara-kerja/', 'https://larisid.com/cara-kerja/')
      and lower(coalesce(r->>'name', '')) not like '%cara kerja%'
  ), '[]'::jsonb),
  updated_at = now()
where resources @> '[{"url":"/cara-kerja/"}]'::jsonb
   or resources::text ilike '%cara kerja%';
