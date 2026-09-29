-- Full profile page: public identity extras + Komunitas counts.
-- Apply only after the local preview is approved:
--   bash scripts/apply-selfhost.sh supabase/migrations/20260929150000_profile_page.sql
-- Never supabase db push --linked.

begin;

alter table public.user_profiles
  add column if not exists social_links jsonb not null default '[]'::jsonb,
  add column if not exists focus_areas text[] not null default '{}'::text[],
  add column if not exists selling_platforms text[] not null default '{}'::text[];

comment on column public.user_profiles.social_links is
  'Public social rows: [{platform: instagram|tiktok|youtube, url, handle}].';
comment on column public.user_profiles.focus_areas is
  'Short seller focus tags, max 8, each <= 24 chars (enforced in the app).';
comment on column public.user_profiles.selling_platforms is
  'Marketplace ids: shopee, tiktok_shop, tokopedia, lazada, blibli.';

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
  store_links jsonb,
  badges jsonb,
  social_links jsonb,
  focus_areas text[],
  selling_platforms text[],
  joined_at timestamptz,
  komunitas_posts int,
  komunitas_comments int,
  komunitas_likes int,
  komunitas_recent jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select
    up.user_id,
    up.display_name,
    up.first_name,
    up.city,
    up.headshot_url,
    up.bio,
    up.shopee_store_name,
    coalesce(up.public_shopee_url, up.shopee_store_url) as shopee_store_url,
    public.user_is_platform_admin(up.user_id) as is_admin,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', sa.id, 'platform', sa.platform, 'url', sa.url, 'handle', sa.handle
      ) order by sa.created_at)
      from public.student_account sa
      where sa.student_id = up.user_id and sa.kind = 'shop' and sa.active
    ), '[]'::jsonb) as store_links,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'key', a.key, 'title', a.title, 'awarded_at', ua.awarded_at
      ) order by ua.awarded_at)
      from public.user_achievements ua
      join public.achievements a on a.id = ua.achievement_id
      where ua.user_id = up.user_id
    ), '[]'::jsonb) as badges,
    coalesce(up.social_links, '[]'::jsonb) as social_links,
    coalesce(up.focus_areas, '{}'::text[]) as focus_areas,
    coalesce(up.selling_platforms, '{}'::text[]) as selling_platforms,
    up.completed_at as joined_at,
    (
      select count(*)::int
      from public.feature_requests fr
      where fr.author_id = up.user_id
    ) as komunitas_posts,
    (
      select count(*)::int
      from public.feature_request_comments fc
      where fc.author_id = up.user_id
    ) as komunitas_comments,
    (
      (
        select count(*)::int
        from public.feature_request_likes l
        join public.feature_requests fr on fr.id = l.request_id
        where fr.author_id = up.user_id
      )
      +
      (
        select count(*)::int
        from public.feature_request_comment_likes cl
        join public.feature_request_comments fc on fc.id = cl.comment_id
        where fc.author_id = up.user_id
      )
    ) as komunitas_likes,
    coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id, 'title', x.title, 'created_at', x.created_at
      ) order by x.created_at desc)
      from (
        select fr.id, fr.title, fr.created_at
        from public.feature_requests fr
        where fr.author_id = up.user_id
        order by fr.created_at desc
        limit 3
      ) x
    ), '[]'::jsonb) as komunitas_recent
  from public.user_profiles up
  where up.user_id = p_user_id and up.is_public is true;
$$;

grant execute on function public.get_public_profile(uuid) to authenticated;

notify pgrst, 'reload schema';

commit;
