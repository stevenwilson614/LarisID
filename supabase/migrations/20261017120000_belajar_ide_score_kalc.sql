-- Belajar: merge pra-listing into ide analysis (score + recommend), keep score fields in draft.
-- Contabo only: bash scripts/apply-selfhost.sh supabase/migrations/20261017120000_belajar_ide_score_kalc.sql

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
  features jsonb := '[]'::jsonb;
  manual jsonb := '[]'::jsonb;
  recommend jsonb := '{}'::jsonb;
  v_cost bigint;
  v_price bigint;
  v_median bigint;
  v_user_price bigint;
  v_p25 bigint;
  v_p75 bigint;
  v_n int;
  v_score int;
  v_opp int;
  v_rec_price bigint;
begin
  if p is null or jsonb_typeof(p) is distinct from 'object' then
    return '{}'::jsonb;
  end if;
  if jsonb_typeof(p->'idea') = 'object' then idea := p->'idea'; end if;
  if jsonb_typeof(p->'analysis') = 'object' then analysis := p->'analysis'; end if;
  if jsonb_typeof(p->'listing') = 'object' then listing := p->'listing'; end if;
  if jsonb_typeof(p->'rating') = 'object' then rating := p->'rating'; end if;
  if jsonb_typeof(analysis->'recommend') = 'object' then recommend := analysis->'recommend'; end if;

  v_cost := case when coalesce(idea->>'cost', '') ~ '^[0-9]{1,12}$' then (idea->>'cost')::bigint else null end;
  v_price := case when coalesce(idea->>'price', '') ~ '^[0-9]{1,12}$' then (idea->>'price')::bigint else null end;
  v_median := case when coalesce(analysis->>'median_price', '') ~ '^[0-9]{1,12}$' then (analysis->>'median_price')::bigint else null end;
  v_user_price := case when coalesce(analysis->>'user_price', '') ~ '^[0-9]{1,12}$' then (analysis->>'user_price')::bigint else null end;
  v_p25 := case when coalesce(analysis->>'omset_p25', '') ~ '^[0-9]{1,15}$' then (analysis->>'omset_p25')::bigint else null end;
  v_p75 := case when coalesce(analysis->>'omset_p75', '') ~ '^[0-9]{1,15}$' then (analysis->>'omset_p75')::bigint else null end;
  v_n := case when coalesce(analysis->>'n', '') ~ '^[0-9]{1,6}$' then (analysis->>'n')::int else 0 end;
  v_score := case when coalesce(rating->>'score', '') ~ '^[0-9]{1,2}$' then (rating->>'score')::int else 0 end;
  if v_score > 10 then v_score := 10; end if;
  v_opp := case when coalesce(analysis->>'score', '') ~ '^[0-9]{1,3}$' then (analysis->>'score')::int else 0 end;
  if v_opp > 100 then v_opp := 100; end if;
  v_rec_price := case when coalesce(recommend->>'price', '') ~ '^[0-9]{1,12}$' then (recommend->>'price')::bigint else null end;

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

  select coalesce(jsonb_agg(to_jsonb(left(s.w, 40)) order by s.ord), '[]'::jsonb)
    into features
  from (
    select e #>> '{}' as w, ord
    from jsonb_array_elements(
      case when jsonb_typeof(recommend->'features') = 'array' then recommend->'features' else '[]'::jsonb end
    ) with ordinality as t(e, ord)
    where jsonb_typeof(e) = 'string'
    limit 8
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
    end,
    'score', case
      when coalesce(s.e->>'score', '') ~ '^[0-9]{1,3}$' then least((s.e->>'score')::int, 100)
      else null
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
      'sample', coalesce(sample, '[]'::jsonb),
      'score', v_opp,
      'verdict', left(btrim(coalesce(analysis->>'verdict', '')), 280),
      'tone', case
        when analysis->>'tone' in ('go', 'maybe', 'thin') then analysis->>'tone'
        else ''
      end,
      'recommend', jsonb_build_object(
        'price', v_rec_price,
        'title', left(btrim(coalesce(recommend->>'title', '')), 200),
        'description', left(btrim(coalesce(recommend->>'description', '')), 1500),
        'features', coalesce(features, '[]'::jsonb)
      )
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

-- Merge pra-listing into ide-produk: hide the old step from the learner count.
update public.course_lessons
set published = false,
    updated_at = now()
where slug = 'pra-listing';

update public.course_modules
set subtitle = 'Mau jual apa: skor kompetitor, rekomendasi listing, lalu hitung modal.',
    updated_at = now()
where slug = 'cari';

update public.course_lessons
set
  title = 'Mau jual apa?',
  body = $body$Isi nama produk yang mau kamu jual. Kami cari listing Shopee yang mirip dari data sampel LarisID, tampilkan fotonya, lalu beri skor rata-rata 0–100.

Dari sampel itu kami sarankan harga, kata fitur, dan deskripsi — edit supaya jujur dengan barangmu. Lanjut ke hitung modal dari harga jual.

Hasilnya sampel pencarian, bukan seluruh pasar. Omset yang muncul adalah perkiraan. Tidak ada angka "kamu akan dapat sekian".$body$,
  points = jsonb_build_array(
    'Melihat foto dan skor kompetitor di sampel pencarian.',
    'Mendapat rekomendasi harga, fitur, dan deskripsi dari sampel itu.',
    'Menyimpan draf listing sebelum hitung modal.'
  ),
  updated_at = now()
where slug = 'ide-produk';

update public.course_lessons
set
  title = 'Hitung modal dari harga jual',
  body = $body$Hitung laba dengan kalkulator yang sama seperti di menu Kalkulator. Angka diisi dari rekomendasi atau salah satu kompetitor — semua bisa diubah.

Fee platform, ongkir, iklan, dan retur ikut dihitung. Rp 3 juta di langkah toko adalah omset kotor perkiraan, bukan laba.$body$,
  updated_at = now()
where slug = 'hitung-modal';
