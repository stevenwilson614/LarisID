-- Pesan Steven replies for chats that never got a saved follow-up,
-- plus the future "bingung" auto-reply.
--
-- The 23 Sep backfill only covered people who had already answered.
-- After that, "Bingung cara pakainya" only painted a thank-you in the
-- same session (and that copy still asked them to daftar bimbingan mentor).
-- Closing the card left no user_notices row, so the next login was silent.
--
-- New copy points at the Belajar page. go=edukasi is the existing button
-- key: the client opens Belajar. Re-running does not stack a second open
-- steven_followup on the same person.

create or replace function public.enqueue_sfb_bingung_followup()
returns json
language plpgsql
security definer
set search_path = public, auth
set statement_timeout = '5s'
as $function$
declare
  v_me uuid := auth.uid();
  v_id uuid;
  v_lead text :=
    'Hai! Kalau masih bingung cara pakainya, buka halaman Belajar di menu kiri ya. Langkahnya pelan-pelan, dari cari produk sampai pantau toko.';
  v_payload jsonb;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  select n.id into v_id
    from public.user_notices n
   where n.user_id = v_me
     and n.kind = 'steven_followup'
     and n.dismissed_at is null
     and (
       n.payload->>'go' = 'edukasi'
       or n.payload->>'lead' ilike '%halaman Belajar%'
     )
   order by n.created_at desc
   limit 1;

  -- Another open Steven chat is already waiting. Don't cover it.
  if v_id is null and exists (
    select 1 from public.user_notices n
     where n.user_id = v_me
       and n.kind = 'steven_followup'
       and n.dismissed_at is null
  ) then
    return null;
  end if;

  v_payload := jsonb_build_object(
    'lead', v_lead,
    'go', 'edukasi',
    'cta', 'Buka Belajar'
  );

  if v_id is null then
    insert into public.user_notices (user_id, kind, payload)
    values (v_me, 'steven_followup', v_payload)
    returning id into v_id;
  end if;

  return json_build_object(
    'id', v_id,
    'kind', 'steven_followup',
    'payload', v_payload
  );
end;
$function$;

revoke all on function public.enqueue_sfb_bingung_followup() from public;
grant execute on function public.enqueue_sfb_bingung_followup() to authenticated, service_role;

-- One saved reply per person below. Buckets are the 17 Oct unanswered set.
insert into public.user_notices (user_id, kind, payload)
select u.id, 'steven_followup',
  case t.bucket
    when 'belajar' then jsonb_build_object(
      'lead', 'Hai! Kalau masih bingung cara pakainya, buka halaman Belajar di menu kiri ya. Langkahnya pelan-pelan, dari cari produk sampai pantau toko.',
      'go', 'edukasi',
      'cta', 'Buka Belajar')
    when 'thanks' then jsonb_build_object(
      'lead', 'Hai! Makasih ya. Senang kalau sejauh ini sudah cukup. Kalau ada yang mau diubah atau ditambah, tulis aja di sini.')
    when 'api' then jsonb_build_object(
      'lead', 'Hai! API-nya baru bisa dipakai November ya, Kak. Nanti aku kabarin lagi kalau sudah nyala.')
    when 'toko' then jsonb_build_object(
      'lead', 'Hai! Data toko ada kok. Coba tanya Laris AI, sebut nama tokonya. Tombol Laris AI ada di menu kiri.')
    when 'fitur' then jsonb_build_object(
      'lead', 'Hai! Makasih sudah jawab. Fitur apa yang mau kamu lihat ditambah? Tulis di sini ya.')
    when 'chart' then jsonb_build_object(
      'lead', 'Hai! Aku cek yang kamu buka waktu itu: sabun SCORA, sampo Head & Shoulders, dan sampo Makarizo. Grafiknya datar karena produk itu baru keukur sekali, atau belum sama sekali, jadi angkanya masih perkiraan. Bukan error. Nanti kalau sudah keukur lagi, garisnya baru gerak.')
    when 'afiliasi' then jsonb_build_object(
      'lead', 'Hai! Kami lagi garap produk khusus buat affiliator. Nanti kalau sudah jalan, aku kabarin ya.')
    when 'keyword' then jsonb_build_object(
      'lead', 'Hai! Kaos kaki sekolah anti slip aku masukin ke daftar pencarian. Nanti datanya muncul di Cari Produk.')
  end
from (
  values
    ('kalam.ezr88', 'belajar'),
    ('masdoel0609', 'belajar'),
    ('arkanadigital26', 'belajar'),
    ('amadeuz.cleveland', 'belajar'),
    ('daudgev', 'belajar'),
    ('firdauszula212', 'belajar'),
    ('ghazyrahadian03', 'belajar'),
    ('rizwanabimanyu3', 'belajar'),
    ('26muhamadzatnika26', 'belajar'),
    ('connectmoon5', 'belajar'),
    ('azariamathias', 'belajar'),
    ('ahadatkofficial', 'belajar'),
    ('edgegina977', 'belajar'),
    ('rezaeputra', 'belajar'),
    ('kesone01', 'belajar'),
    ('qgispdam', 'belajar'),
    ('dadangmagic', 'belajar'),
    ('tutu.surutu.2019', 'thanks'),
    ('official.kcnstore', 'thanks'),
    ('ferdhi1515', 'thanks'),
    ('sheenjuu99', 'thanks'),
    ('oxalisskin', 'thanks'),
    ('olivia.melia.park', 'thanks'),
    ('angyongsan661', 'thanks'),
    ('bahtiyarhidayat.work', 'thanks'),
    ('pixelwap.com', 'api'),
    ('buyungabiyan17', 'toko'),
    ('defavegift', 'fitur'),
    ('patrick.tee10', 'fitur'),
    ('bastaff011', 'chart'),
    ('alawyaka9', 'afiliasi'),
    ('ariandinugraha86', 'keyword')
) as t(who, bucket)
join auth.users u on split_part(u.email, '@', 1) = t.who
where not exists (
  select 1 from public.user_notices n
   where n.user_id = u.id
     and n.kind = 'steven_followup'
     and n.dismissed_at is null
);

update public.feedback f
   set status = 'reviewing'
  from auth.users u
 where f.user_id = u.id
   and f.page in ('superuser_prompt', 'steven_followup')
   and f.status = 'new'
   and split_part(u.email, '@', 1) in (
     'kalam.ezr88', 'masdoel0609', 'arkanadigital26', 'amadeuz.cleveland',
     'daudgev', 'firdauszula212', 'ghazyrahadian03', 'rizwanabimanyu3',
     '26muhamadzatnika26', 'connectmoon5', 'azariamathias', 'ahadatkofficial',
     'edgegina977', 'rezaeputra', 'kesone01', 'qgispdam', 'dadangmagic',
     'tutu.surutu.2019', 'official.kcnstore', 'ferdhi1515', 'sheenjuu99',
     'oxalisskin', 'olivia.melia.park', 'angyongsan661', 'bahtiyarhidayat.work',
     'pixelwap.com', 'buyungabiyan17', 'defavegift', 'patrick.tee10',
     'bastaff011', 'alawyaka9', 'ariandinugraha86'
   );

insert into public.scrape_keywords (keyword, category, source_set, sla_days)
values ('kaos kaki sekolah anti slip', '', 'request', 1)
on conflict (keyword) do nothing;
