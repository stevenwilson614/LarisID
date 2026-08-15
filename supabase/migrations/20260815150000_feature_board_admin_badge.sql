-- Mark platform-admin authors on the Fitur board and public profiles so
-- everyone can see who is working the request (Steven / LarisID owner).

create or replace function public.user_is_platform_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users u
    left join public.app_role_assignments ar on lower(ar.email) = lower(u.email)
    where u.id = p_user_id
      and (
        ar.role = 'admin'
        or lower(u.email) in ('stevenwilson614@gmail.com')
      )
  );
$$;

revoke all on function public.user_is_platform_admin(uuid) from public;
grant execute on function public.user_is_platform_admin(uuid) to authenticated;

alter table public.feature_requests
  add column if not exists author_is_admin boolean not null default false;

alter table public.feature_request_comments
  add column if not exists author_is_admin boolean not null default false;

create or replace function public.fr_set_author_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fname text;
  fcity text;
  favatar text;
  femail text;
begin
  select nullif(trim(first_name), ''), nullif(trim(city), ''), headshot_url
  into fname, fcity, favatar
  from public.user_profiles
  where user_id = new.author_id;

  if fname is null then
    select split_part(email, '@', 1) into femail
    from auth.users
    where id = new.author_id;
  end if;

  new.author_first_name := coalesce(fname, femail, 'Pengguna LarisID');
  new.author_city := coalesce(fcity, '');
  new.author_headshot_url := favatar;
  new.author_is_admin := public.user_is_platform_admin(new.author_id);
  return new;
end;
$$;

update public.feature_requests
set author_is_admin = public.user_is_platform_admin(author_id)
where author_is_admin is distinct from public.user_is_platform_admin(author_id);

update public.feature_request_comments
set author_is_admin = public.user_is_platform_admin(author_id)
where author_is_admin is distinct from public.user_is_platform_admin(author_id);

create or replace view public.feature_requests_feed as
select
  fr.id, fr.author_id, fr.author_first_name,
  fr.kind, fr.title, fr.body, fr.created_at,
  coalesce(lc.n, 0)::int as like_count,
  coalesce(cc.n, 0)::int as comment_count,
  exists (
    select 1 from public.feature_request_likes l
    where l.request_id = fr.id and l.user_id = auth.uid()
  ) as liked_by_me,
  fr.author_city, fr.author_headshot_url,
  fr.status,
  fr.author_is_admin
from public.feature_requests fr
left join (select request_id, count(*) n from public.feature_request_likes group by request_id) lc
  on lc.request_id = fr.id
left join (select request_id, count(*) n from public.feature_request_comments group by request_id) cc
  on cc.request_id = fr.id;

grant select on public.feature_requests_feed to authenticated;

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
  is_admin boolean
)
language sql stable security definer
set search_path = public
as $$
  select up.user_id, up.display_name, up.first_name, up.city, up.headshot_url,
         up.bio, up.shopee_store_name, up.shopee_store_url,
         public.user_is_platform_admin(up.user_id) as is_admin
  from public.user_profiles up
  where up.user_id = p_user_id and up.is_public is true;
$$;

grant execute on function public.get_public_profile(uuid) to authenticated;
