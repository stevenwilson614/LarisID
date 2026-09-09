-- ---------------------------------------------------------------------------
-- Peta Sebaran Pengguna — one distribution, two maps.
-- ---------------------------------------------------------------------------
-- The komunitas map and the admin map must never disagree, so the whole
-- allocation runs here and both surfaces just draw what this returns.
--
-- We know where only a fraction of people are: ~218 of 353 accounts have a
-- usable onboarding region, and anonymous visitors have nothing until the IP
-- pipeline fills visitor_locations. The rest are allocated proportionally from
-- the distribution of the people we DO know, softened by a weak prior built
-- from our own Shopee seller scrape so provinces our sample has never seen do
-- not sit at zero.
--
-- R1. raw_norm keeps the kab./kota prefix, unlike public.norm_loc(). That is
--     deliberate: norm_loc folds "Banjar" (Kota Banjar, Jawa Barat) and
--     "Kab. Banjar" (Kalimantan Selatan) onto one key. Here they stay apart.
-- R2. kota is non-null only for the five DKI kota. That column is what drives
--     the Jakarta inset; everywhere else the province is the unit.
-- ---------------------------------------------------------------------------

create table if not exists public.geo_place_map (
  raw_norm text primary key,
  province text not null,
  kota     text
);

comment on table public.geo_place_map is
  'Indonesian place name -> province. raw_norm is lower(strip non-alphanumeric) WITHOUT stripping the kab./kota prefix. Seeded by scripts/build-geo-place-map.mjs from scripts/data/id-place-map.json.';

alter table public.geo_place_map enable row level security;

drop policy if exists geo_place_map_read on public.geo_place_map;
create policy geo_place_map_read on public.geo_place_map for select using (true);

grant select on public.geo_place_map to anon, authenticated;

-- ---------------------------------------------------------------------------
-- geo_resolve — free text to a province, two stages.
-- ---------------------------------------------------------------------------
-- Exact match first, then the longest place name contained in the string. The
-- containment pass is what turns "Nagrak Cibadak sukabumi" and "Kota Luwuk,
-- Kabupaten Banggai, Sulawesi Tengah" into real provinces instead of nulls.
-- The 5-character floor stops short names matching inside longer ones.
create or replace function public.geo_resolve(p_raw text)
returns table (province text, kota text)
language plpgsql
stable
parallel safe
set search_path to 'public'
as $$
declare
  v_n text;
begin
  v_n := regexp_replace(lower(coalesce(p_raw, '')), '[^a-z0-9]', '', 'g');
  if v_n = '' then
    return;
  end if;

  return query
    select m.province, m.kota
    from public.geo_place_map m
    where m.raw_norm = v_n
    limit 1;
  if found then
    return;
  end if;

  return query
    select m.province, m.kota
    from public.geo_place_map m
    where length(m.raw_norm) >= 5
      and v_n like '%' || m.raw_norm || '%'
    order by length(m.raw_norm) desc, m.raw_norm
    limit 1;
end;
$$;

grant execute on function public.geo_resolve(text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- geo_province_prior — the softening prior, from our own seller scrape.
-- ---------------------------------------------------------------------------
-- n_toko per province is heavy-tailed (Jawa Barat 25%, Papua Barat 0.004%), so
-- a raw proportional prior would still round the whole east to zero. sqrt
-- compression lifts the tail enough to be visible without letting it invent
-- volume it has not earned.
create table if not exists public.geo_province_prior (
  province text primary key,
  weight   double precision not null
);

alter table public.geo_province_prior enable row level security;

drop policy if exists geo_province_prior_read on public.geo_province_prior;
create policy geo_province_prior_read on public.geo_province_prior for select using (true);

grant select on public.geo_province_prior to anon, authenticated;

create or replace function public.refresh_geo_province_prior()
returns void
language sql
security definer
set search_path to 'public'
as $$
  with by_prov as (
    select g.province, sum(s.n_toko)::double precision as toko
    from public.mv_seller_locations s
    join public.geo_place_map g
      on g.raw_norm = regexp_replace(lower(s.location), '[^a-z0-9]', '', 'g')
    group by 1
  )
  insert into public.geo_province_prior (province, weight)
  select province, sqrt(toko) from by_prov
  on conflict (province) do update set weight = excluded.weight;
$$;

-- ---------------------------------------------------------------------------
-- user_map_distribution — what both maps draw.
-- ---------------------------------------------------------------------------
create or replace function public.user_map_distribution(p_days int default null)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $$
with
-- Steven is routinely the single largest "user"; he is not a data point.
excluded_users as (
  select u.id
  from auth.users u
  where lower(u.email) in ('stevenwilson614@gmail.com', 'stevenfwilson1@gmail.com')
     or u.email ilike '%+selfhosttest%'
),
bounds as (
  select case when p_days is not null and p_days > 0
              then now() - make_interval(days => p_days) end as since
),
-- Real IP geolocation wins over anything typed at onboarding.
from_ip as (
  select coalesce(v.user_id::text, v.visitor_id) as person, 1 as pri, g.province, g.kota
  from public.visitor_locations v
  cross join bounds b
  left join lateral public.geo_resolve(coalesce(nullif(v.city, ''), v.region)) g on true
  where (v.user_id is null or v.user_id not in (select id from excluded_users))
    and (b.since is null or v.last_seen_at >= b.since)
),
from_profile as (
  select u.id::text as person, 2 as pri, g.province, g.kota
  from auth.users u
  cross join bounds b
  left join public.user_onboarding_prefs ob on ob.user_id = u.id
  left join public.user_profiles up on up.user_id = u.id
  left join lateral public.geo_resolve(
    coalesce(nullif(trim(ob.region), ''), nullif(trim(up.city), ''))
  ) g on true
  where u.id not in (select id from excluded_users)
    and (b.since is null or u.created_at >= b.since)
),
known as (
  select distinct on (person) person, province, kota
  from (select * from from_ip union all select * from from_profile) s
  where s.province is not null
  order by person, pri
),
totals as (
  select
    -- Distinct people, not sessions. page_views fires once per tab session, so
    -- its row count is visits and would overstate this by about a quarter.
    (select count(distinct pv.visitor_id)
       from public.page_views pv cross join bounds b
      where b.since is null or pv.created_at >= b.since)::int as total,
    (select count(*) from known)::int as known_n
),
span as (
  select total, known_n, greatest(total - known_n, 0) as unknown from totals
),
-- Blend: the real sample, plus prior_weight * known_n pseudo-observations
-- spread across all 34 provinces by the compressed seller prior. 0.30 is the
-- smallest weight that keeps every province non-zero at ~2.3k visitors.
prior as (
  select p.province, p.weight / nullif(sum(p.weight) over (), 0) as share
  from public.geo_province_prior p
),
sample as (
  select k.province, count(*)::numeric as n from known k group by 1
),
blended as (
  select coalesce(pr.province, sa.province) as province,
         coalesce(sa.n, 0)::int as known_n,
         coalesce(sa.n, 0) + (0.30 * sp.known_n * coalesce(pr.share, 0)) as w
  from prior pr
  full join sample sa on sa.province = pr.province
  cross join span sp
),
alloc as (
  select b.province, b.known_n,
         floor(sp.unknown * b.w / nullif(sum(b.w) over (), 0))::int as base,
         (sp.unknown * b.w / nullif(sum(b.w) over (), 0))
           - floor(sp.unknown * b.w / nullif(sum(b.w) over (), 0)) as frac
  from blended b cross join span sp
),
-- Largest remainder, so the province numbers sum to total exactly.
ranked as (
  select a.*, row_number() over (order by a.frac desc, a.province) as rn,
         sp.unknown - sum(a.base) over () as leftover
  from alloc a cross join span sp
),
provinces as (
  select province, known_n + base + case when rn <= leftover then 1 else 0 end as n
  from ranked
),
dki_total as (
  select coalesce((select n from provinces where province = 'DKI Jakarta'), 0) as n
),
-- DKI splits across its five kota. Whatever kota-level sample exists is added
-- to fixed weights (roughly resident population) that carry it until then.
-- The weights are scaled to 25 pseudo-observations on purpose: at a weight of
-- 0.28 a single user typing "Jakarta Timur" would outvote the entire prior.
dki_fallback (kota, w) as (
  values ('Jakarta Timur', 7.00), ('Jakarta Barat', 6.25), ('Jakarta Selatan', 5.25),
         ('Jakarta Utara', 4.25), ('Jakarta Pusat', 2.25)
),
dki_sample as (
  select k.kota, count(*)::numeric as n from known k where k.kota is not null group by 1
),
dki_alloc as (
  select f.kota,
         floor(d.n * (f.w + coalesce(s.n, 0)) / sum(f.w + coalesce(s.n, 0)) over ())::int as base,
         (d.n * (f.w + coalesce(s.n, 0)) / sum(f.w + coalesce(s.n, 0)) over ())
           - floor(d.n * (f.w + coalesce(s.n, 0)) / sum(f.w + coalesce(s.n, 0)) over ()) as frac
  from dki_fallback f
  left join dki_sample s on s.kota = f.kota
  cross join dki_total d
),
dki_ranked as (
  select a.kota, a.base + case when row_number() over (order by a.frac desc, a.kota)
                                    <= d.n - sum(a.base) over () then 1 else 0 end as n
  from dki_alloc a cross join dki_total d
)
select jsonb_build_object(
  'total', sp.total,
  'measured', sp.known_n,
  'estimated', sp.unknown,
  'generated_at', now(),
  'provinces', (select coalesce(jsonb_agg(jsonb_build_object('province', province, 'n', n)
                                          order by n desc, province), '[]'::jsonb) from provinces),
  'dki', (select coalesce(jsonb_agg(jsonb_build_object('kota', kota, 'n', n)
                                    order by n desc, kota), '[]'::jsonb) from dki_ranked)
)
from span sp;
$$;

grant execute on function public.user_map_distribution(int) to anon, authenticated;

notify pgrst, 'reload schema';
