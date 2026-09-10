-- The launch notice for the user whose feedback started this.
--
-- WHY IT IS NOT JUST AN INSERT. The ten hijab keywords were queued at
-- sla_days=1 but have not been scraped yet — the lane runs tonight. A notice
-- that says "sudah aku ukur buat kamu" while the CTA leads to an empty market
-- would be exactly the dishonesty this whole change exists to fix, and it
-- would land on the one person already annoyed about it.
--
-- So the notice files itself once the data is real: an hourly job checks
-- product_types_v, and only writes the notice when at least half the
-- keywords are genuinely live. The payload lists the ones that actually
-- landed, not the ones we hoped would — if a niche turns out to be too thin
-- to measure, the message silently tells the truth about that too.
--
-- The job unschedules itself on success, so this is a one-shot.

create or replace function public.maybe_send_kwreq_launch_notice()
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_uid  uuid;
  v_kws  text[] := array['hijab dinas','jilbab dinas','hijab dinas instan','jilbab polwan',
                         'hijab pns','kerudung dinas','hijab olahraga','jilbab olahraga',
                         'jilbab instan','kerudung'];
  v_live text[];
begin
  select id into v_uid from auth.users where lower(email) = 'hyu4nara@gmail.com';
  if v_uid is null then return -1; end if;

  if exists (select 1 from public.user_notices
              where user_id = v_uid and kind = 'kwreq_launch') then
    perform cron.unschedule('kwreq-launch-notice')
      where exists (select 1 from cron.job where jobname = 'kwreq-launch-notice');
    return 0;
  end if;

  select array_agg(k order by k) into v_live
    from unnest(v_kws) as k
   where exists (select 1 from public.product_types_v p
                  where p.keyword = k and p.city = 'ALL' and p.n_listings >= 3);

  if v_live is null or cardinality(v_live) < 5 then return 0; end if;

  insert into public.user_notices (user_id, kind, payload)
  values (v_uid, 'kwreq_launch', jsonb_build_object(
    'lead', 'Halo, ini Steven. Kamu bilang kalau cari produk yang spesifik, jawabannya masih '
         || 'terlalu umum — belum spesifik ke jenis produk yang kamu maksud. Kamu benar, dan '
         || 'itu sudah aku perbaiki.',
    'keywords', to_jsonb(v_live),
    'howto', '<strong>Mulai sekarang kamu bisa nambah sendiri:</strong> di bawah hasil '
          || 'pencarian ada tombol &ldquo;Minta kami ukur&rdquo; — tulis kata kunci produkmu, '
          || 'bisa beberapa sekaligus. Yang belum ada di data kami akan aku ukur malam itu '
          || 'juga, dan aku kabari lewat WhatsApp begitu siap.'
  ));

  perform cron.unschedule('kwreq-launch-notice')
    where exists (select 1 from cron.job where jobname = 'kwreq-launch-notice');
  return cardinality(v_live);
end $$;

revoke all on function public.maybe_send_kwreq_launch_notice() from public, anon, authenticated;

select cron.unschedule('kwreq-launch-notice')
 where exists (select 1 from cron.job where jobname = 'kwreq-launch-notice');
select cron.schedule('kwreq-launch-notice', '17 * * * *',
                     $cron$select public.maybe_send_kwreq_launch_notice();$cron$);

notify pgrst, 'reload schema';
