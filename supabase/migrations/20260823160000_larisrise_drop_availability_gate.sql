-- LaRise Batch 1: schedule is fixed (Wed 16:00–18:00 WITA, 8 sessions).
-- Availability questions were removed from the form; stop requiring min 3 days.

create or replace function public.rise_submit_application(payload jsonb)
returns json
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_nama    text := left(btrim(coalesce(payload->>'nama', '')), 120);
  v_wa_raw  text := regexp_replace(coalesce(payload->>'whatsapp', ''), '[^0-9]', '', 'g');
  v_wa      text;
  v_email   text := lower(left(btrim(coalesce(payload->>'email', '')), 160));
  v_cohort  text := coalesce(nullif(btrim(payload->>'cohort'), ''), 'batch-1');
  v_hari    text[];
  v_id      uuid;
begin
  -- WhatsApp normalisation: Indonesian numbers arrive as 08…, 8…, +628…, or
  -- 628…. Fonnte needs a bare 628… target, so settle it once at the edge
  -- rather than in every consumer.
  if v_wa_raw like '0%' then
    v_wa := '62' || substr(v_wa_raw, 2);
  elsif v_wa_raw like '62%' then
    v_wa := v_wa_raw;
  elsif v_wa_raw like '8%' then
    v_wa := '62' || v_wa_raw;
  else
    v_wa := v_wa_raw;
  end if;

  if v_nama = '' then
    return json_build_object('ok', false, 'error', 'Nama lengkap wajib diisi.');
  end if;
  if length(v_wa) < 10 or length(v_wa) > 15 then
    return json_build_object('ok', false, 'error', 'Nomor WhatsApp tidak valid.');
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    return json_build_object('ok', false, 'error', 'Alamat email tidak valid.');
  end if;
  if btrim(coalesce(payload->>'alasan', '')) = ''
     or btrim(coalesce(payload->>'target_3bulan', '')) = '' then
    return json_build_object('ok', false, 'error', 'Pertanyaan motivasi wajib diisi.');
  end if;

  -- Optional leftover; form no longer collects availability (schedule is fixed).
  select coalesce(array_agg(d), '{}')
    into v_hari
    from jsonb_array_elements_text(coalesce(payload->'hari_tersedia', '[]'::jsonb)) as d
   where d in ('Senin','Selasa','Rabu','Kamis','Jumat','Sabtu');

  -- Soft dedupe: a double-tapped submit button must not create two rows, but a
  -- genuine correction sent the next day should still get through.
  if exists (
    select 1 from public.larisrise_applications a
     where a.cohort = v_cohort
       and lower(a.email) = v_email
       and a.created_at > now() - interval '24 hours'
  ) then
    return json_build_object('ok', true, 'duplicate', true);
  end if;

  insert into public.larisrise_applications (
    cohort, nama, whatsapp, email, kampus, jurusan, semester, kota,
    perangkat, pengalaman_jualan, ide_produk, hari_tersedia, jam_per_minggu,
    alasan, target_3bulan, gate_komitmen, gate_pembukaan, gate_paham_seleksi
  ) values (
    v_cohort, v_nama, v_wa, v_email,
    left(btrim(payload->>'kampus'), 160),
    left(btrim(payload->>'jurusan'), 160),
    left(btrim(payload->>'semester'), 40),
    left(btrim(payload->>'kota'), 120),
    left(btrim(payload->>'perangkat'), 40),
    left(btrim(payload->>'pengalaman_jualan'), 60),
    left(btrim(payload->>'ide_produk'), 400),
    v_hari,
    nullif(left(btrim(coalesce(payload->>'jam_per_minggu', '')), 20), ''),
    left(btrim(payload->>'alasan'), 4000),
    left(btrim(payload->>'target_3bulan'), 4000),
    coalesce((payload->>'gate_komitmen')::boolean, false),
    coalesce((payload->>'gate_pembukaan')::boolean, false),
    coalesce((payload->>'gate_paham_seleksi')::boolean, false)
  )
  returning id into v_id;

  return json_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.rise_submit_application(jsonb) from public, anon, authenticated;
grant execute on function public.rise_submit_application(jsonb) to anon, authenticated;
