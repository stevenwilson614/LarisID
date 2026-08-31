-- Repair: the Toko URL loop in the cohort view was dead in production.
--
-- 20260818140000_ssis_student_shop_self_serve.sql was never applied to the
-- self-hosted box. Verified live on 2026-08-31: ssis_parse_shop_url and
-- ssis_unlink_shop are both absent, and cohort_event_type has no
-- 'shop_unlinked' row. ssis_link_shop DOES exist (the later 20260821140000
-- migration recreated it) but its body calls ssis_parse_shop_url, so every
-- "Tautkan" click failed with an undefined-function error.
--
-- This migration ports ONLY the missing pieces. It deliberately does NOT
-- recreate ssis_link_shop or get_public_profile: live carries newer versions
-- of both (link_shop has the 8-shop cap + board_status='pending';
-- get_public_profile returns a `badges jsonb` column the 20260818 version
-- does not have), so replaying that file wholesale would regress them.
--
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20260831120000_ssis_parse_and_unlink.sql

-- The FK on cohort_events.event_type means ssis_unlink_shop cannot log
-- without this row existing first.
insert into public.cohort_event_type (event_type, category, description) values
  ('shop_unlinked', 'admin', 'A platform shop URL was deactivated by the student')
on conflict (event_type) do nothing;

-- ── Parse a pasted storefront (or product) URL into a crawlable shop ────────

create or replace function public.ssis_parse_shop_url(p_url text)
returns table (
  platform text,
  handle text,
  canonical_url text,
  platform_ref text
)
language plpgsql
immutable
as $$
declare
  u text;
  host text;
  path text;
  parts text[];
  seg text;
  shop_id text;
  reserved text[];
begin
  u := trim(both from coalesce(p_url, ''));
  if u = '' then
    raise exception 'URL toko kosong';
  end if;
  if u !~* '^https?://' then
    u := 'https://' || u;
  end if;
  u := regexp_replace(u, '[#?].*$', '');
  u := regexp_replace(u, '/+$', '');
  host := lower(regexp_replace(u, '^https?://([^/]+).*$', '\1'));
  host := regexp_replace(host, '^www\.', '');
  path := regexp_replace(u, '^https?://[^/]+(/.*)?$', '\1');
  path := coalesce(nullif(path, ''), '/');
  parts := string_to_array(trim(both '/' from path), '/');

  if host like '%shopee.co.id' or host like '%shopee.com' then
    platform := 'shopee';
    if path ~ '-i\.[0-9]+\.[0-9]+' then
      shop_id := (regexp_match(path, '-i\.([0-9]+)\.[0-9]+'))[1];
      handle := shop_id;
      platform_ref := shop_id;
      canonical_url := 'https://shopee.co.id/shop/' || shop_id;
      return next; return;
    end if;
    if coalesce(parts[1], '') = 'shop' and coalesce(parts[2], '') ~ '^[0-9]+$' then
      shop_id := parts[2];
      handle := shop_id;
      platform_ref := shop_id;
      canonical_url := 'https://shopee.co.id/shop/' || shop_id;
      return next; return;
    end if;
    reserved := array[
      'search','buyer','mall','cart','flash_deals','daily-discover','user','login',
      'product','shop','universal-link','m','id','buyer','cart','checkout'
    ];
    seg := parts[1];
    if seg is null or seg = any (reserved) then
      raise exception 'Tautan Shopee ini bukan halaman toko. Buka tokomu, lalu salin URL-nya.';
    end if;
    handle := seg;
    canonical_url := 'https://shopee.co.id/' || seg;
    return next; return;
  end if;

  if host like '%tokopedia.com' then
    platform := 'tokopedia';
    reserved := array[
      'p','find','discovery','edu','about','care','official','official-store',
      'discovery','cart','login','register','help','promo','hot'
    ];
    seg := parts[1];
    if seg is null or seg = any (reserved) then
      raise exception 'Tautan Tokopedia ini bukan halaman toko. Buka tokomu, lalu salin URL-nya.';
    end if;
    handle := seg;
    canonical_url := 'https://www.tokopedia.com/' || seg;
    return next; return;
  end if;

  if host like '%tiktok.com' then
    platform := 'tiktok_shop';
    if coalesce(parts[1], '') ~ '^@' then
      handle := regexp_replace(parts[1], '^@', '');
      canonical_url := 'https://www.tiktok.com/@' || handle;
      return next; return;
    end if;
    if host like 'vt.tiktok.com' and parts[1] is not null then
      handle := parts[1];
      canonical_url := 'https://vt.tiktok.com/' || handle;
      return next; return;
    end if;
    raise exception 'Tautan TikTok ini bukan toko. Buka profil/toko, lalu salin URL-nya.';
  end if;

  if host like '%lazada.co.id' or host like '%lazada.com' then
    platform := 'lazada';
    if coalesce(parts[1], '') = 'shop' and parts[2] is not null then
      handle := parts[2];
      canonical_url := 'https://www.lazada.co.id/shop/' || handle;
      return next; return;
    end if;
    raise exception 'Tautan Lazada ini bukan halaman toko. Buka tokomu, lalu salin URL-nya.';
  end if;

  if host like '%blibli.com' then
    platform := 'blibli';
    if coalesce(parts[1], '') = 'merchant' and parts[2] is not null then
      handle := parts[2];
      canonical_url := 'https://www.blibli.com/merchant/' || handle;
      return next; return;
    end if;
    raise exception 'Tautan Blibli ini bukan halaman toko. Buka tokomu, lalu salin URL-nya.';
  end if;

  raise exception 'Platform belum dikenali. Pakai tautan Shopee, Tokopedia, TikTok Shop, Lazada, atau Blibli.';
end;
$$;

revoke all on function public.ssis_parse_shop_url(text) from public, anon;
grant execute on function public.ssis_parse_shop_url(text) to authenticated;

-- ── Unlink (deactivate — crawler history stays) ────────────────────────────

create or replace function public.ssis_unlink_shop(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := (select auth.uid());
  rec public.student_account;
  next_shopee text;
begin
  if v_me is null then
    raise exception 'Login diperlukan';
  end if;

  select * into rec
  from public.student_account
  where id = p_id and student_id = v_me and kind = 'shop';
  if not found then
    raise exception 'Toko tidak ditemukan';
  end if;

  update public.student_account set active = false where id = rec.id;

  insert into public.cohort_events (
    student_id, ts, source, platform, event_type, confidence, metadata
  ) values (
    v_me, now(), 'laris', rec.platform, 'shop_unlinked', 1.0,
    jsonb_build_object('student_account_id', rec.id, 'url', rec.url, 'handle', rec.handle)
  );

  if rec.platform = 'shopee' then
    select sa.url into next_shopee
    from public.student_account sa
    where sa.student_id = v_me and sa.kind = 'shop' and sa.platform = 'shopee' and sa.active
    order by sa.created_at desc
    limit 1;
    update public.user_profiles
       set public_shopee_url = next_shopee,
           shopee_store_url  = next_shopee
     where user_id = v_me;
  end if;
end;
$$;

revoke all on function public.ssis_unlink_shop(uuid) from public, anon;
grant execute on function public.ssis_unlink_shop(uuid) to authenticated;

-- Seed student_account from the old single Shopee profile field, the one-time
-- backfill that never ran. Safe: student_account.board_status defaults to
-- 'pending', so a seeded shop still needs mentor verification before it can
-- reach any leaderboard. Invalid leftover URLs are skipped, not fatal.
do $$
declare
  r record;
begin
  for r in
    select p.user_id, trim(coalesce(p.public_shopee_url, p.shopee_store_url)) as url
    from public.user_profiles p
    where length(trim(coalesce(p.public_shopee_url, p.shopee_store_url, ''))) > 0
  loop
    begin
      insert into public.student_account (student_id, kind, platform, handle, url, platform_ref, active)
      select r.user_id, 'shop', v.platform, v.handle, v.canonical_url, v.platform_ref, true
      from public.ssis_parse_shop_url(r.url) v
      on conflict (student_id, platform, kind, handle) do nothing;
    exception when others then
      null;
    end;
  end loop;
end $$;

notify pgrst, 'reload schema';
