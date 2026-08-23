-- SSIS: students register their own marketplace shops from the Laris profile.
-- The crawler already reads public.student_account (kind='shop'); this opens
-- that table to the student so Day-0 intake is not WhatsApp-only.
--
-- New SQL: bash scripts/apply-selfhost.sh (docs/self-host.md). Do not supabase db push.

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

-- ── Link ───────────────────────────────────────────────────────────────────

create or replace function public.ssis_link_shop(p_url text)
returns public.student_account
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := (select auth.uid());
  parsed record;
  v_cohort uuid;
  v_count int;
  rec public.student_account;
begin
  if v_me is null then
    raise exception 'Login diperlukan';
  end if;

  select * into parsed from public.ssis_parse_shop_url(p_url);

  select count(*) into v_count
  from public.student_account
  where student_id = v_me and kind = 'shop' and active;
  if v_count >= 8 then
    raise exception 'Maksimal 8 toko. Nonaktifkan yang lama dulu.';
  end if;

  select m.cohort_id into v_cohort
  from public.cohort_members m
  where m.user_id = v_me and m.status = 'active'
  order by m.joined_at desc nulls last
  limit 1;

  insert into public.student_account (
    student_id, cohort_id, kind, platform, handle, url, platform_ref, active
  ) values (
    v_me, v_cohort, 'shop', parsed.platform, parsed.handle,
    parsed.canonical_url, parsed.platform_ref, true
  )
  on conflict (student_id, platform, kind, handle) do update
    set url          = excluded.url,
        platform_ref = coalesce(excluded.platform_ref, public.student_account.platform_ref),
        cohort_id    = coalesce(excluded.cohort_id, public.student_account.cohort_id),
        active       = true
  returning * into rec;

  insert into public.cohort_events (
    student_id, ts, source, platform, event_type, confidence, metadata
  ) values (
    v_me, now(), 'laris', rec.platform, 'shop_linked', 1.0,
    jsonb_build_object('student_account_id', rec.id, 'url', rec.url, 'handle', rec.handle)
  );

  if rec.platform = 'shopee' then
    update public.user_profiles
       set public_shopee_url = rec.url,
           shopee_store_url  = rec.url,
           shopee_store_name = coalesce(nullif(shopee_store_name, ''), rec.handle)
     where user_id = v_me;
  end if;

  return rec;
end;
$$;

revoke all on function public.ssis_link_shop(text) from public, anon;
grant execute on function public.ssis_link_shop(text) to authenticated;

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

-- Students still cannot INSERT the table directly — only these RPCs write.
-- SELECT already allowed via ssis_can_view_student (self / mentor / admin).

-- ── Public profile includes the shop list ──────────────────────────────────

drop function if exists public.get_public_profile(uuid);
create function public.get_public_profile(p_user_id uuid)
returns table (
  user_id uuid,
  display_name text,
  first_name text,
  city text,
  headshot_url text,
  bio text,
  shopee_store_name text,
  shopee_store_url text,
  is_admin boolean,
  store_links jsonb
)
language sql stable security definer
set search_path = public
as $$
  select
    up.user_id, up.display_name, up.first_name, up.city, up.headshot_url, up.bio,
    up.shopee_store_name,
    coalesce(up.public_shopee_url, up.shopee_store_url) as shopee_store_url,
    public.user_is_platform_admin(up.user_id) as is_admin,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sa.id,
        'platform', sa.platform,
        'url', sa.url,
        'handle', sa.handle
      ) order by sa.created_at)
      from public.student_account sa
      where sa.student_id = up.user_id
        and sa.kind = 'shop'
        and sa.active
    ), '[]'::jsonb) as store_links
  from public.user_profiles up
  where up.user_id = p_user_id and up.is_public is true;
$$;

grant execute on function public.get_public_profile(uuid) to authenticated;

-- Seed from the old single Shopee field so existing profiles are not blank.
-- Invalid leftover URLs are skipped — they must not abort the migration.
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
