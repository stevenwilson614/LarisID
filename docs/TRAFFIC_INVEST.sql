-- Traffic & SEO investment readout. SELECT-only against live data.
-- Temp tables are session-local. No production writes.
--
-- Run:
--   ssh -i "${LARISID_SSH_KEY:-$HOME/.ssh/larisid_hetzner}" \
--     -o ConnectTimeout=20 root@84.247.147.205 \
--     "docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1" \
--     < docs/TRAFFIC_INVEST.sql
--
-- Windows (WIB dates, timestamptz bounds): last 90 days vs the 90 days before.
-- Static /riset /kota /panduan pages do not call log_page_view. SEO traffic
-- here is the click-through: SPA page_views.referrer or signup referrer whose
-- path is one of those surfaces. Original Google referrer is lost on that hop.

\pset pager off
set statement_timeout = '180s';

create temp table ti_win as
select
  now() as now_at,
  now() - interval '90 days' as cur_start,
  now() - interval '180 days' as prior_start;

create temp table ti_users as
select u.id, u.created_at,
       (u.created_at at time zone 'Asia/Jakarta')::date as signup_day
from auth.users u
where not public.is_dapur_side_account(u.email::text);

create index on ti_users (id);
create index on ti_users (created_at);

-- First signup_attribution row per real user.
create temp table ti_attr as
select distinct on (e.user_id)
  e.user_id,
  e.created_at as attr_at,
  coalesce(e.metadata->>'utm_source', '') as utm_source,
  coalesce(e.metadata->>'utm_medium', '') as utm_medium,
  coalesce(e.metadata->>'utm_campaign', '') as utm_campaign,
  coalesce(e.metadata->>'referrer', '') as referrer,
  coalesce(e.metadata->>'landing', '') as landing,
  coalesce(e.metadata->>'ref_code', '') as ref_code
from public.activity_events e
join ti_users u on u.id = e.user_id
where e.event_type = 'signup_attribution'
order by e.user_id, e.created_at;

create index on ti_attr (user_id);

create or replace function pg_temp.ti_surface(p text)
returns text
language sql
immutable
as $$
  select case
    when p is null or btrim(p) = '' then 'unknown'
    when split_part(p, '?', 1) ~ '^/riset(/|$)' then 'riset'
    when split_part(p, '?', 1) ~ '^/kota(/|$)' then 'kota'
    when split_part(p, '?', 1) ~ '^/perbandingan(/|$)' then 'perbandingan'
    when split_part(p, '?', 1) ~ '^/panduan(/|$)' then 'panduan'
    when split_part(p, '?', 1) ~ '^/kalkulator(/|$)' then 'kalkulator'
    when split_part(p, '?', 1) ~ '^/harga(/|$)' then 'harga'
    when split_part(p, '?', 1) ~ '^/cara-kerja(/|$)' then 'cara_kerja'
    when split_part(p, '?', 1) ~ '^/data(/|$)' then 'data'
    when split_part(p, '?', 1) in ('', '/') then 'home'
    else 'other'
  end
$$;

create or replace function pg_temp.ti_ref_path(p text)
returns text
language sql
immutable
as $$
  select case
    when p is null or p = '' or p = '(direct)' then ''
    when p ~ '^https?://' then regexp_replace(p, '^https?://[^/]+', '')
    else p
  end
$$;

-- Acquisition bucket. Order matters: paid before organic, AI before google
-- (gemini.google.*), content-surface referrers before generic internal.
create or replace function pg_temp.ti_channel(
  utm_source text, utm_medium text, utm_campaign text,
  referrer text, landing text, ref_code text
) returns text
language sql
immutable
as $$
  select case
    when utm_source = 'google' and (
      utm_medium = 'cpc'
      or landing ilike '%gad_source%'
      or utm_campaign ilike 'ab\_%'
    ) then 'google_ads'
    when utm_source = 'kota' then 'kota'
    when utm_source = 'email' or utm_medium = 'email' then 'email'
    when utm_source = 'export' then 'export_link'
    when ref_code <> '' or utm_source in ('referral', 'ref') then 'referral'
    when utm_source ilike '%chatgpt%' or referrer ilike '%chatgpt%'
      or referrer ilike '%openai.com%'
      or utm_source ilike '%perplexity%' or referrer ilike '%perplexity%'
      or referrer ilike '%claude.ai%'
      or referrer ilike '%gemini.google%'
      or referrer ilike '%copilot.microsoft%'
      or referrer ilike '%bard.google%'
    then 'ai_referral'
    when referrer ilike '%google.%' then 'google_organic'
    when referrer ilike '%bing.%' or referrer ilike '%duckduckgo.%' then 'bing'
    when referrer ilike '%instagram.%' or referrer ilike '%facebook.%'
      or referrer ilike '%tiktok.%' or referrer ilike '%t.co%'
      or referrer ilike '%twitter.%' or referrer ilike '%linkedin.%'
      or referrer ilike '%youtube.%'
    then 'social'
    when referrer = '' or referrer ilike '%(direct)%' then 'direct'
    when referrer ilike '%larisid.com%' then
      case pg_temp.ti_surface(pg_temp.ti_ref_path(referrer))
        when 'riset' then 'seo_riset'
        when 'kota' then 'seo_kota'
        when 'perbandingan' then 'seo_perbandingan'
        when 'panduan' then 'seo_panduan'
        when 'kalkulator' then 'seo_kalkulator'
        when 'harga' then 'seo_harga'
        when 'cara_kerja' then 'seo_cara_kerja'
        when 'data' then 'seo_data'
        else 'internal'
      end
    else 'other'
  end
$$;

create temp table ti_src as
select
  u.id as user_id,
  u.created_at,
  u.signup_day,
  case
    when u.created_at >= (select cur_start from ti_win) then 'last_90d'
    when u.created_at >= (select prior_start from ti_win) then 'prior_90d'
    else 'older'
  end as win,
  a.utm_source,
  a.utm_medium,
  a.utm_campaign,
  a.referrer,
  a.landing,
  a.ref_code,
  case when a.user_id is null then 'unattributed'
       else pg_temp.ti_channel(a.utm_source, a.utm_medium, a.utm_campaign, a.referrer, a.landing, a.ref_code)
  end as channel,
  pg_temp.ti_surface(coalesce(a.landing, '')) as landing_surface,
  pg_temp.ti_surface(pg_temp.ti_ref_path(coalesce(a.referrer, ''))) as referrer_surface
from ti_users u
left join ti_attr a on a.user_id = u.id;

create index on ti_src (win);
create index on ti_src (user_id);

\echo === BLOCK D: HEADLINE KPIs
select
  (select count(*) from ti_users) as users_all,
  (select count(*) from ti_users u, ti_win w where u.created_at >= w.now_at - interval '7 days') as signups_7d,
  (select count(*) from ti_users u, ti_win w where u.created_at >= w.now_at - interval '30 days') as signups_30d,
  (select count(*) from ti_src where win = 'last_90d') as signups_90d,
  (select count(*) from ti_src where win = 'prior_90d') as signups_prior_90d,
  (select count(*) from public.page_views p, ti_win w where p.created_at >= w.now_at - interval '7 days') as pv_7d,
  (select count(*) from public.page_views p, ti_win w where p.created_at >= w.now_at - interval '30 days') as pv_30d,
  (select count(*) from public.page_views p, ti_win w where p.created_at >= w.cur_start) as pv_90d,
  (select count(distinct visitor_id) from public.page_views p, ti_win w where p.created_at >= w.now_at - interval '7 days') as uniq_7d,
  (select count(distinct visitor_id) from public.page_views p, ti_win w where p.created_at >= w.now_at - interval '30 days') as uniq_30d,
  (select count(distinct visitor_id) from public.page_views p, ti_win w where p.created_at >= w.cur_start) as uniq_90d,
  (select round(100.0 * count(*) filter (where a.user_id is not null) / nullif(count(*), 0), 1)
     from ti_src s left join ti_attr a on a.user_id = s.user_id where s.win = 'last_90d') as attr_coverage_pct_90d;

\echo === BLOCK D: admin_stats (empty object if not platform admin)
select public.admin_stats();

\echo === BLOCK A: signup channel mix last 90d vs prior 90d
select channel,
       count(*) filter (where win = 'last_90d') as last_90d,
       count(*) filter (where win = 'prior_90d') as prior_90d
from ti_src
where win in ('last_90d', 'prior_90d')
group by channel
order by last_90d desc, prior_90d desc;

\echo === BLOCK A: weekly signups by channel (last 90d, WIB week starting Monday)
select date_trunc('week', signup_day)::date as week,
       channel,
       count(*) as signups
from ti_src
where win = 'last_90d'
group by 1, 2
order by 1, 3 desc;

\echo === BLOCK A: raw utm_source last 90d
select coalesce(nullif(utm_source, ''), '(blank)') as utm_source,
       count(*) as signups
from ti_src
where win = 'last_90d'
group by 1
order by 2 desc
limit 25;

\echo === BLOCK A: raw referrer host last 90d
select coalesce(substring(referrer from 'https?://([^/]+)'), nullif(referrer, ''), '(blank)') as host,
       count(*) as signups
from ti_src
where win = 'last_90d'
group by 1
order by 2 desc
limit 25;

\echo === BLOCK A: utm_campaign last 90d
select coalesce(nullif(utm_campaign, ''), '(blank)') as utm_campaign,
       count(*) as signups
from ti_src
where win = 'last_90d'
group by 1
order by 2 desc
limit 25;

\echo === BLOCK B: SPA page_views path surface (last 90d)
select pg_temp.ti_surface(path) as surface,
       count(*) as views,
       count(distinct visitor_id) as visitors
from public.page_views p, ti_win w
where p.created_at >= w.cur_start
group by 1
order by visitors desc;

\echo === BLOCK B: SPA click-through referrer surface (page_views.referrer, last 90d vs prior)
select pg_temp.ti_surface(pg_temp.ti_ref_path(referrer)) as surface,
       count(*) filter (where p.created_at >= w.cur_start) as views_90d,
       count(distinct visitor_id) filter (where p.created_at >= w.cur_start) as visitors_90d,
       count(distinct visitor_id) filter (where p.created_at >= w.prior_start and p.created_at < w.cur_start) as visitors_prior
from public.page_views p, ti_win w
where p.created_at >= w.prior_start
group by 1
order by visitors_90d desc;

\echo === BLOCK B: page_views utm_source last 90d
select coalesce(nullif(utm_source, ''), '(blank)') as utm_source,
       count(*) as views,
       count(distinct visitor_id) as visitors
from public.page_views p, ti_win w
where p.created_at >= w.cur_start
group by 1
order by visitors desc
limit 20;

\echo === BLOCK B: page_views referrer host last 90d
select coalesce(substring(referrer from 'https?://([^/]+)'), nullif(left(referrer, 80), ''), '(blank)') as host,
       count(*) as views,
       count(distinct visitor_id) as visitors
from public.page_views p, ti_win w
where p.created_at >= w.cur_start
group by 1
order by visitors desc
limit 25;

\echo === BLOCK B: signup landing surface + referrer surface last 90d
select landing_surface, referrer_surface, channel, count(*) as signups
from ti_src
where win = 'last_90d'
group by 1, 2, 3
order by signups desc
limit 40;

\echo === BLOCK B: top SEO click-through paths on signup referrer (last 90d)
select left(pg_temp.ti_ref_path(referrer), 140) as ref_path,
       count(*) as signups
from ti_src
where win = 'last_90d'
  and referrer_surface in ('riset', 'kota', 'perbandingan', 'panduan', 'kalkulator', 'harga', 'cara_kerja', 'data')
group by 1
order by signups desc
limit 40;

\echo === BLOCK B: top /riset and /kota paths in page_views.referrer (last 90d)
select left(pg_temp.ti_ref_path(referrer), 140) as ref_path,
       count(*) as views,
       count(distinct visitor_id) as visitors
from public.page_views p, ti_win w
where p.created_at >= w.cur_start
  and pg_temp.ti_surface(pg_temp.ti_ref_path(referrer)) in ('riset', 'kota')
group by 1
order by visitors desc
limit 40;

-- Visitor -> user, earliest link.
create temp table ti_vid as
select visitor_id, user_id, min(linked_at) as linked_at
from (
  select visitor_id, user_id, created_at as linked_at
  from public.page_views
  where user_id is not null
  union all
  select visitor_id, user_id, created_at
  from public.client_events
  where user_id is not null
) x
group by 1, 2;

create index on ti_vid (visitor_id);
create index on ti_vid (user_id);

\echo === BLOCK B: SEO click-through visitors who later signed up (last 90d page_views)
with hits as (
  select pg_temp.ti_surface(pg_temp.ti_ref_path(p.referrer)) as surface,
         p.visitor_id
  from public.page_views p, ti_win w
  where p.created_at >= w.cur_start
    and pg_temp.ti_surface(pg_temp.ti_ref_path(p.referrer)) in
        ('riset', 'kota', 'perbandingan', 'panduan', 'kalkulator', 'harga', 'cara_kerja', 'data', 'home')
)
select h.surface,
       count(distinct h.visitor_id) as visitors,
       count(distinct v.user_id) filter (where s.user_id is not null) as signed_up
from hits h
left join ti_vid v on v.visitor_id = h.visitor_id
left join ti_attr s on s.user_id = v.user_id
group by 1
order by visitors desc;

-- Activity days, last 180d only, real users.
create temp table ti_days as
select user_id, d from (
  select e.user_id, (e.created_at at time zone 'Asia/Jakarta')::date as d
  from public.activity_events e
  join ti_users u on u.id = e.user_id
  where e.created_at >= (select prior_start from ti_win)
  union
  select s.user_id, (s.signed_in_at at time zone 'Asia/Jakarta')::date
  from public.user_sessions s
  join ti_users u on u.id = s.user_id
  where s.signed_in_at >= (select prior_start from ti_win)
  union
  select c.user_id, c.view_day
  from public.client_events c
  join ti_users u on u.id = c.user_id
  where c.user_id is not null
    and c.created_at >= (select prior_start from ti_win)
  union
  select g.user_id, (g.created_at at time zone 'Asia/Jakarta')::date
  from public.gpt_chats g
  join ti_users u on u.id = g.user_id
  where g.created_at >= (select prior_start from ti_win)
) z
where d is not null;

create index on ti_days (user_id, d);

create temp table ti_dives as
select e.user_id, (e.created_at at time zone 'Asia/Jakarta')::date as d
from public.activity_events e
join ti_users u on u.id = e.user_id
where e.event_type in ('deepdive_open', 'ptype_open')
  and e.created_at >= (select prior_start from ti_win);

create index on ti_dives (user_id, d);

create temp table ti_power as
select u.id as user_id,
       w.label as win,
       coalesce(ad.days, 0) as active_days,
       coalesce(dv.dives, 0) as dives,
       (coalesce(ad.days, 0) >= 5 or coalesce(dv.dives, 0) >= 3) as is_power,
       (coalesce(ad.days, 0) = 1) as is_one_day
from ti_users u
cross join (values ('last_90d'), ('prior_90d')) as w(label)
left join lateral (
  select count(distinct d.d) as days
  from ti_days d, ti_win tw
  where d.user_id = u.id
    and d.d >= (case when w.label = 'last_90d' then (tw.cur_start at time zone 'Asia/Jakarta')::date
                     else (tw.prior_start at time zone 'Asia/Jakarta')::date end)
    and d.d < (case when w.label = 'last_90d' then (tw.now_at at time zone 'Asia/Jakarta')::date + 1
                    else (tw.cur_start at time zone 'Asia/Jakarta')::date end)
) ad on true
left join lateral (
  select count(*) as dives
  from ti_dives dv, ti_win tw
  where dv.user_id = u.id
    and dv.d >= (case when w.label = 'last_90d' then (tw.cur_start at time zone 'Asia/Jakarta')::date
                      else (tw.prior_start at time zone 'Asia/Jakarta')::date end)
    and dv.d < (case when w.label = 'last_90d' then (tw.now_at at time zone 'Asia/Jakarta')::date + 1
                     else (tw.cur_start at time zone 'Asia/Jakarta')::date end)
) dv on true
where coalesce(ad.days, 0) > 0;

-- is_power = 5+ active days OR 3+ deep dives in the window.
-- is_one_day can overlap is_power (a single-day dive burst). Read both flags
-- together; do not add the two counts.
\echo === BLOCK C: power vs one-day counts
select win,
       count(*) as active_users,
       count(*) filter (where is_power) as power_users,
       count(*) filter (where is_one_day) as one_day_users,
       round(avg(active_days) filter (where is_power), 1) as power_avg_days,
       round(avg(dives) filter (where is_power), 1) as power_avg_dives
from ti_power
group by win
order by win;

\echo === BLOCK D: return + recently active (signups in each window)
select s.win,
       count(*) as signups,
       count(*) filter (where exists (
         select 1 from ti_days d
         where d.user_id = s.user_id and d.d > s.signup_day
           and d.d <= s.signup_day + 30
       )) as returned_within_30d,
       count(*) filter (where exists (
         select 1 from ti_days d, ti_win w
         where d.user_id = s.user_id
           and d.d >= (w.now_at at time zone 'Asia/Jakarta')::date - 14
       )) as active_last_14d
from ti_src s
where s.win in ('last_90d', 'prior_90d')
group by s.win
order by s.win;

\echo === BLOCK C: weekly active users and weekly power-in-progress (last 90d)
with weeks as (
  select date_trunc('week', d)::date as week, user_id, count(distinct d) as days
  from ti_days, ti_win w
  where d >= (w.cur_start at time zone 'Asia/Jakarta')::date
  group by 1, 2
),
week_dives as (
  select date_trunc('week', d)::date as week, user_id, count(*) as dives
  from ti_dives, ti_win w
  where d >= (w.cur_start at time zone 'Asia/Jakarta')::date
  group by 1, 2
)
select k.week,
       count(*) as active_users,
       count(*) filter (where k.days >= 5 or coalesce(v.dives, 0) >= 3) as power_that_week
from weeks k
left join week_dives v on v.week = k.week and v.user_id = k.user_id
group by k.week
order by k.week;

\echo === BLOCK C: channel mix of power vs one-day, signups in last 90d
select s.channel,
       count(*) as signups,
       count(*) filter (where p.is_power) as power,
       count(*) filter (where p.is_one_day) as one_day,
       round(100.0 * count(*) filter (where p.is_power) / nullif(count(*), 0), 1) as pct_power
from ti_src s
left join ti_power p on p.user_id = s.user_id and p.win = 'last_90d'
where s.win = 'last_90d'
group by s.channel
order by signups desc;

\echo === BLOCK C: top event types among last-90d power users
select e.event_type, count(*) as events, count(distinct e.user_id) as users
from public.activity_events e
join ti_power p on p.user_id = e.user_id and p.win = 'last_90d' and p.is_power
, ti_win w
where e.created_at >= w.cur_start
group by e.event_type
order by users desc
limit 25;

\echo === BLOCK C: product actions among last-90d power users
select
  count(distinct e.user_id) filter (where e.event_type in ('search_query', 'gpt_finder_search')) as searched,
  count(distinct e.user_id) filter (where e.event_type in ('deepdive_open', 'ptype_open')) as deep_dived,
  count(distinct e.user_id) filter (where e.event_type in ('favorite_added', 'track_toggle', 'product_saved')) as favorited,
  count(distinct e.user_id) filter (where e.event_type = 'belajar_page_view') as belajar,
  count(distinct e.user_id) filter (where e.event_type = 'gpt_message_sent') as asked_ai,
  count(distinct e.user_id) filter (where e.event_type = 'view_open' and e.metadata->>'view' = 'komunitas') as komunitas,
  (select count(*) from ti_power where win = 'last_90d' and is_power) as power_users
from public.activity_events e
join ti_power p on p.user_id = e.user_id and p.win = 'last_90d' and p.is_power
, ti_win w
where e.created_at >= w.cur_start;
