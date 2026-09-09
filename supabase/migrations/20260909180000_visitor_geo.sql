-- Visitor city geolocation (IP-derived, no raw IP stored).
--
-- Motivation: map every person who uses the site — signed-in or anonymous.
-- page_views already has visitor_id; this adds city/region/country/lat/lon on
-- each logged visit, plus visitor_locations (one row per visitor) for map pins.
-- Clients resolve IP → place via a third-party lookup and send only the place
-- fields. We never accept or persist an IP address column.

alter table public.page_views
  add column if not exists geo_city    text,
  add column if not exists geo_region  text,
  add column if not exists geo_country text,
  add column if not exists geo_lat     double precision,
  add column if not exists geo_lon     double precision;

create index if not exists page_views_geo_country_created_idx
  on public.page_views (geo_country, created_at desc)
  where geo_country is not null;

create table if not exists public.visitor_locations (
  visitor_id   text primary key,
  city         text,
  region       text,
  country_code text,
  lat          double precision,
  lon          double precision,
  user_id      uuid references auth.users on delete set null,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  hit_count     integer not null default 1
);

create index if not exists visitor_locations_coords_idx
  on public.visitor_locations (lat, lon)
  where lat is not null and lon is not null;

create index if not exists visitor_locations_country_idx
  on public.visitor_locations (country_code)
  where country_code is not null;

create index if not exists visitor_locations_last_seen_idx
  on public.visitor_locations (last_seen_at desc);

alter table public.visitor_locations enable row level security;

-- Writes only via log_page_view (security definer). Admins read via RPC below.
drop policy if exists visitor_locations_select_admin on public.visitor_locations;
create policy visitor_locations_select_admin on public.visitor_locations
  for select using (public.is_platform_admin());

-- Extend log_page_view with optional geo params (defaults keep older clients working).
drop function if exists public.log_page_view(text, text, text, text, text, boolean, text, text);

create function public.log_page_view(
  p_visitor_id     text,
  p_session_id     text default null,
  p_path           text default null,
  p_referrer       text default null,
  p_utm_source     text default null,
  p_is_new_session boolean default false,
  p_ab_variant     text default null,
  p_ab_via         text default null,
  p_geo_city       text default null,
  p_geo_region     text default null,
  p_geo_country    text default null,
  p_geo_lat        double precision default null,
  p_geo_lon        double precision default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_city text := nullif(left(trim(coalesce(p_geo_city, '')), 80), '');
  v_region text := nullif(left(trim(coalesce(p_geo_region, '')), 80), '');
  v_country text := nullif(upper(left(trim(coalesce(p_geo_country, '')), 2)), '');
  v_lat double precision := p_geo_lat;
  v_lon double precision := p_geo_lon;
  v_uid uuid := auth.uid();
begin
  if p_visitor_id is null or length(p_visitor_id) < 6 then
    return jsonb_build_object('ok', false, 'reason', 'bad_visitor');
  end if;

  -- Reject nonsense coordinates (never store raw IP; clients must not send one).
  if v_lat is not null and (v_lat < -90 or v_lat > 90) then
    v_lat := null;
  end if;
  if v_lon is not null and (v_lon < -180 or v_lon > 180) then
    v_lon := null;
  end if;
  -- Country codes are ISO-3166 alpha-2; drop junk.
  if v_country is not null and v_country !~ '^[A-Z]{2}$' then
    v_country := null;
  end if;

  insert into public.page_views
    (visitor_id, session_id, path, referrer, utm_source, is_new_session, user_id,
     ab_variant, ab_via,
     geo_city, geo_region, geo_country, geo_lat, geo_lon)
  values
    (left(p_visitor_id, 64), left(p_session_id, 64), left(p_path, 200),
     left(p_referrer, 300), left(p_utm_source, 80), coalesce(p_is_new_session, false),
     v_uid,
     case when p_ab_variant in ('A', 'B', 'X') then p_ab_variant else null end,
     left(p_ab_via, 40),
     v_city, v_region, v_country, v_lat, v_lon)
  returning id into v_id;

  -- Upsert map pin when we got at least a place or a coordinate pair.
  if v_city is not null or v_region is not null or v_country is not null
     or (v_lat is not null and v_lon is not null) then
    insert into public.visitor_locations
      (visitor_id, city, region, country_code, lat, lon, user_id, first_seen_at, last_seen_at, hit_count)
    values
      (left(p_visitor_id, 64), v_city, v_region, v_country, v_lat, v_lon, v_uid, now(), now(), 1)
    on conflict (visitor_id) do update set
      city = coalesce(excluded.city, visitor_locations.city),
      region = coalesce(excluded.region, visitor_locations.region),
      country_code = coalesce(excluded.country_code, visitor_locations.country_code),
      lat = coalesce(excluded.lat, visitor_locations.lat),
      lon = coalesce(excluded.lon, visitor_locations.lon),
      user_id = coalesce(excluded.user_id, visitor_locations.user_id),
      last_seen_at = now(),
      hit_count = visitor_locations.hit_count + 1;
  end if;

  return jsonb_build_object('ok', true, 'id', v_id, 'path', p_path);
end;
$$;

alter function public.log_page_view(
  text, text, text, text, text, boolean, text, text,
  text, text, text, double precision, double precision
) owner to postgres;

revoke all on function public.log_page_view(
  text, text, text, text, text, boolean, text, text,
  text, text, text, double precision, double precision
) from public;

grant execute on function public.log_page_view(
  text, text, text, text, text, boolean, text, text,
  text, text, text, double precision, double precision
) to anon, authenticated;

-- Admin map export: one pin per visitor with coordinates (or city-only rows).
create or replace function public.admin_visitor_locations()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_result jsonb;
begin
  if not (select public.is_platform_admin()) then
    return '[]'::jsonb;
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'visitor_id', visitor_id,
        'city', city,
        'region', region,
        'country', country_code,
        'lat', lat,
        'lon', lon,
        'user_id', user_id,
        'hit_count', hit_count,
        'first_seen_at', first_seen_at,
        'last_seen_at', last_seen_at
      )
      order by last_seen_at desc
    ),
    '[]'::jsonb
  )
  into v_result
  from public.visitor_locations;

  return v_result;
end;
$$;

alter function public.admin_visitor_locations() owner to postgres;
revoke all on function public.admin_visitor_locations() from public;
grant execute on function public.admin_visitor_locations() to authenticated;

notify pgrst, 'reload schema';
