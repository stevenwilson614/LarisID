-- ---------------------------------------------------------------------------
-- Stop inventing presence in places with zero real people.
-- ---------------------------------------------------------------------------
-- user_map_distribution() blended in a seller-scrape prior so every one of
-- the 34 provinces got a non-zero bubble, softened with sqrt compression so
-- the long tail wasn't invisible. That was the wrong call: checked against
-- live data, 20 of those 34 provinces -- including Papua, Papua Barat,
-- Maluku and Maluku Utara -- have exactly ZERO real people (no IP geo hit,
-- no onboarding region, nothing). Their bubbles existed purely because our
-- own Shopee seller count said sellers exist there, which says nothing about
-- where LarisID's users are.
--
-- The unknown pool is now allocated ONLY across provinces we already have at
-- least one real, measured person in -- pure proportional share, no prior.
-- A province with zero known people gets zero and is dropped from the output
-- entirely (the renderer already treats an absent province as "no bubble").
-- As real IP geolocation accumulates in a province, it appears on the map on
-- its own; nothing here invents it early.
--
-- The DKI Jakarta kota split gets the same treatment for the same reason: the
-- old fixed population weights (28/25/21/17/9%) were never validated against
-- a single real Jakarta Utara visitor. The five kota now split purely by
-- their own known sample, so a kota with zero real hits (currently Jakarta
-- Utara) shows 0 rather than an invented population-sized number.
--
-- geo_province_prior and refresh_geo_province_prior() have no other caller
-- and are dropped rather than left as dead code that looks load-bearing.
-- ---------------------------------------------------------------------------

drop function if exists public.refresh_geo_province_prior();
drop table if exists public.geo_province_prior;

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
-- Allocate the unknown pool ONLY across provinces we already have a real
-- person in, purely proportional to that sample. A province absent from
-- `known` gets no rows here and so never appears in the output.
sample as (
  select k.province, count(*)::numeric as n from known k group by 1
),
alloc as (
  select s.province, s.n::int as known_n,
         floor(sp.unknown * s.n / nullif(sp.known_n, 0))::int as base,
         (sp.unknown * s.n / nullif(sp.known_n, 0))
           - floor(sp.unknown * s.n / nullif(sp.known_n, 0)) as frac
  from sample s cross join span sp
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
-- Same rule for the five kota: split DKI's total purely by which kota its
-- own known sample actually landed in. No fallback weights.
dki_sample as (
  select k.kota, count(*)::numeric as n from known k where k.kota is not null group by 1
),
dki_alloc as (
  select s.kota,
         floor(d.n * s.n / nullif(sum(s.n) over (), 0))::int as base,
         (d.n * s.n / nullif(sum(s.n) over (), 0))
           - floor(d.n * s.n / nullif(sum(s.n) over (), 0)) as frac
  from dki_sample s cross join dki_total d
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
