-- What returners do on a return day, and what they did the active day before.
-- Read-only. Run on Contabo:
--   ssh -i "${LARISID_SSH_KEY:-$HOME/.ssh/larisid_hetzner}" \
--     -o ConnectTimeout=20 root@84.247.147.205 \
--     "docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1" \
--     < docs/RETURN_LAST30_FEATURES.sql
--
-- Active day: WIB date in activity_events ∪ user_sessions ∪ client_events
-- ∪ gpt_chats. Return day: an active day in the last 30 WIB dates that
-- has a strictly earlier active day. Prior day: that previous active day
-- (not an idle-timeout session; same-day reopens collapse into one day).
-- Feature flags come from activity_events on that calendar day.
-- Excludes is_dapur_side_account().
--
-- Last run 2026-11-02. Window 2026-10-04 .. 2026-11-02 WIB.
-- 194 return days, 86 returners. Cari Produk on 62% of return days,
-- Deep Dive 49%, Favorit/tracker 16%, My Toko 10%, Belajar 9%.
-- Same-feature return: Cari 69%, Deep Dive 60%, tracker 25%,
-- My Toko 22%, Belajar 16%. Tracker was never the only product surface.

\pset pager off
set statement_timeout = '180s';

drop table if exists life;
drop table if exists flags;
drop table if exists ev;
drop table if exists need;
drop table if exists rets;
drop table if exists days;
drop table if exists act;
drop table if exists cohort;

create temp table cohort as
select u.id,
       u.created_at,
       (u.created_at at time zone 'Asia/Jakarta')::date as signup_day
from auth.users u
where not public.is_dapur_side_account(coalesce(u.email::text, ''));

create index on cohort (id);

create temp table act as
select e.user_id, (e.created_at at time zone 'Asia/Jakarta')::date as d
  from public.activity_events e
  join cohort u on u.id = e.user_id
 where e.user_id is not null
union
select s.user_id, (s.signed_in_at at time zone 'Asia/Jakarta')::date
  from public.user_sessions s
  join cohort u on u.id = s.user_id
union
select c.user_id, c.view_day
  from public.client_events c
  join cohort u on u.id = c.user_id
 where c.user_id is not null
union
select g.user_id, (g.created_at at time zone 'Asia/Jakarta')::date
  from public.gpt_chats g
  join cohort u on u.id = g.user_id;

create index on act (user_id, d);

create temp table days as
select user_id,
       d,
       lag(d) over (partition by user_id order by d) as prev_d
from (select distinct user_id, d from act) s;

create temp table rets as
select user_id,
       d as ret_d,
       prev_d,
       (d - prev_d) as gap
from days
where prev_d is not null
  and d >= (timezone('Asia/Jakarta', now()))::date - 29
  and d <= (timezone('Asia/Jakarta', now()))::date;

create index on rets (user_id, ret_d);
create index on rets (user_id, prev_d);

create temp table need as
select distinct user_id, d
from (
  select user_id, ret_d as d from rets
  union all
  select user_id, prev_d from rets
) s;

create index on need (user_id, d);

create temp table ev as
select e.user_id,
       n.d,
       e.created_at,
       case
         when e.event_type like 'belajar\_%' escape '\'
           or (e.event_type = 'view_open' and e.metadata->>'view' = 'belajar')
           then 'belajar'
         when e.event_type like 'alat\_%' escape '\'
           or (e.event_type = 'view_open' and e.metadata->>'view' in ('mytoko', 'my-toko'))
           then 'mytoko'
         when e.event_type in (
                'favorite_added', 'favorite_removed', 'favorite_refused',
                'tracker_tab', 'quick_track_added', 'quick_track_notify_on',
                'track_toggle', 'pantau_nudge_pulse', 'tracker_setup_commit',
                'tracker_keyword_add'
              )
           or (e.event_type = 'view_open' and e.metadata->>'view' in ('tracker', 'product-tracker', 'alerts'))
           then 'tracker'
         when e.event_type in (
                'deepdive_open', 'ptype_open', 'deepdive_section', 'deepdive_back',
                'dd_alert_card', 'dd_varian_request', 'finder_auto_deepdive',
                'dir_first_click_deepdive', 'home_first_dd_click'
              )
           then 'deepdive'
         when e.event_type in ('gpt_finder_search', 'search_query', 'discover_view')
           or e.event_type like 'dir\_%' escape '\'
           or (e.event_type = 'view_open' and e.metadata->>'view' in ('directory', 'discover', 'product-database'))
           then 'cari'
         when e.event_type in ('gpt_message_sent', 'gpt_intent')
           or (e.event_type = 'view_open' and e.metadata->>'view' in ('chat', 'ai'))
           then 'chat'
         when e.event_type like 'langkah\_%' escape '\'
           or e.event_type like 'gpt_kalc\_%' escape '\'
           or e.event_type = 'gpt_profit_calc'
           or (e.event_type = 'view_open' and e.metadata->>'view' in ('kalkulator', 'estimator'))
           then 'kalk'
         when e.event_type = 'view_open' and e.metadata->>'view' in ('community', 'komunitas')
           then 'komunitas'
         when e.event_type = 'view_open' and e.metadata->>'view' in ('home', 'dashboard')
           then 'beranda'
         else null
       end as bucket
from public.activity_events e
join need n
  on n.user_id = e.user_id
 and (e.created_at at time zone 'Asia/Jakarta')::date = n.d
where e.event_type = 'view_open'
   or e.event_type like 'belajar\_%' escape '\'
   or e.event_type like 'alat\_%' escape '\'
   or e.event_type like 'dir\_%' escape '\'
   or e.event_type like 'langkah\_%' escape '\'
   or e.event_type like 'gpt_kalc\_%' escape '\'
   or e.event_type in (
        'favorite_added', 'favorite_removed', 'favorite_refused',
        'tracker_tab', 'quick_track_added', 'quick_track_notify_on',
        'track_toggle', 'pantau_nudge_pulse', 'tracker_setup_commit',
        'tracker_keyword_add',
        'deepdive_open', 'ptype_open', 'deepdive_section', 'deepdive_back',
        'dd_alert_card', 'dd_varian_request', 'finder_auto_deepdive',
        'dir_first_click_deepdive', 'home_first_dd_click',
        'gpt_finder_search', 'search_query', 'discover_view',
        'gpt_message_sent', 'gpt_intent', 'gpt_profit_calc'
      );

create index on ev (user_id, d);

create temp table flags as
select user_id,
       d,
       bool_or(bucket = 'tracker') as tracker,
       bool_or(bucket = 'belajar') as belajar,
       bool_or(bucket = 'mytoko') as mytoko,
       bool_or(bucket = 'deepdive') as deepdive,
       bool_or(bucket = 'cari') as cari,
       bool_or(bucket = 'chat') as chat,
       bool_or(bucket = 'kalk') as kalk,
       bool_or(bucket = 'komunitas') as komunitas,
       bool_or(bucket = 'beranda') as beranda,
       coalesce(
         (array_agg(bucket order by created_at) filter (where bucket is not null))[1],
         'none'
       ) as first_bucket
from ev
group by user_id, d;

create index on flags (user_id, d);

-- Lifetime feature touch strictly before the return day.
create temp table life as
select r.user_id,
       r.ret_d,
       bool_or(
         e.event_type in (
           'favorite_added', 'favorite_removed', 'favorite_refused',
           'tracker_tab', 'quick_track_added', 'quick_track_notify_on',
           'track_toggle', 'pantau_nudge_pulse', 'tracker_setup_commit',
           'tracker_keyword_add'
         )
         or (e.event_type = 'view_open' and e.metadata->>'view' in ('tracker', 'product-tracker', 'alerts'))
       ) as tracker,
       bool_or(
         e.event_type like 'belajar\_%' escape '\'
         or (e.event_type = 'view_open' and e.metadata->>'view' = 'belajar')
       ) as belajar,
       bool_or(
         e.event_type like 'alat\_%' escape '\'
         or (e.event_type = 'view_open' and e.metadata->>'view' in ('mytoko', 'my-toko'))
       ) as mytoko,
       bool_or(e.event_type in ('deepdive_open', 'ptype_open', 'deepdive_section', 'deepdive_back', 'finder_auto_deepdive')) as deepdive,
       bool_or(
         e.event_type in ('gpt_finder_search', 'search_query', 'discover_view')
         or e.event_type like 'dir\_%' escape '\'
         or (e.event_type = 'view_open' and e.metadata->>'view' in ('directory', 'discover', 'product-database'))
       ) as cari
from rets r
join public.activity_events e
  on e.user_id = r.user_id
 and (e.created_at at time zone 'Asia/Jakarta')::date < r.ret_d
group by r.user_id, r.ret_d;

create index on life (user_id, ret_d);

\echo === headline
select (timezone('Asia/Jakarta', now()))::date as today_wib,
       count(*) as return_days,
       count(distinct user_id) as returners,
       round(count(*)::numeric / nullif(count(distinct user_id), 0), 2) as days_per_returner
from rets;

\echo === gap from prior active day
select case
         when gap = 1 then '1'
         when gap between 2 and 3 then '2-3'
         when gap between 4 and 7 then '4-7'
         when gap between 8 and 30 then '8-30'
         else '31+'
       end as gap_days,
       count(*) as return_days,
       count(distinct user_id) as users,
       round(100.0 * count(*) / sum(count(*)) over (), 1) as pct_days
from rets
group by 1
order by min(gap);

\echo === return-day feature mix (any touch; days can have several)
select bucket,
       return_days,
       round(100.0 * return_days / nullif(max(return_days) filter (where bucket = 'any_day') over (), 0), 1) as pct_days,
       users,
       round(100.0 * users / nullif(max(users) filter (where bucket = 'any_day') over (), 0), 1) as pct_users
from (
  select 'any_day' as bucket, count(*) as return_days, count(distinct r.user_id) as users from rets r
  union all
  select 'tracker', count(*) filter (where coalesce(f.tracker, false)), count(distinct r.user_id) filter (where coalesce(f.tracker, false))
    from rets r left join flags f on f.user_id = r.user_id and f.d = r.ret_d
  union all
  select 'belajar', count(*) filter (where coalesce(f.belajar, false)), count(distinct r.user_id) filter (where coalesce(f.belajar, false))
    from rets r left join flags f on f.user_id = r.user_id and f.d = r.ret_d
  union all
  select 'mytoko', count(*) filter (where coalesce(f.mytoko, false)), count(distinct r.user_id) filter (where coalesce(f.mytoko, false))
    from rets r left join flags f on f.user_id = r.user_id and f.d = r.ret_d
  union all
  select 'deepdive', count(*) filter (where coalesce(f.deepdive, false)), count(distinct r.user_id) filter (where coalesce(f.deepdive, false))
    from rets r left join flags f on f.user_id = r.user_id and f.d = r.ret_d
  union all
  select 'cari', count(*) filter (where coalesce(f.cari, false)), count(distinct r.user_id) filter (where coalesce(f.cari, false))
    from rets r left join flags f on f.user_id = r.user_id and f.d = r.ret_d
  union all
  select 'chat', count(*) filter (where coalesce(f.chat, false)), count(distinct r.user_id) filter (where coalesce(f.chat, false))
    from rets r left join flags f on f.user_id = r.user_id and f.d = r.ret_d
  union all
  select 'kalk', count(*) filter (where coalesce(f.kalk, false)), count(distinct r.user_id) filter (where coalesce(f.kalk, false))
    from rets r left join flags f on f.user_id = r.user_id and f.d = r.ret_d
  union all
  select 'komunitas', count(*) filter (where coalesce(f.komunitas, false)), count(distinct r.user_id) filter (where coalesce(f.komunitas, false))
    from rets r left join flags f on f.user_id = r.user_id and f.d = r.ret_d
  union all
  select 'beranda', count(*) filter (where coalesce(f.beranda, false)), count(distinct r.user_id) filter (where coalesce(f.beranda, false))
    from rets r left join flags f on f.user_id = r.user_id and f.d = r.ret_d
  union all
  select 'no_classified_event', count(*) filter (where f.user_id is null), count(distinct r.user_id) filter (where f.user_id is null)
    from rets r left join flags f on f.user_id = r.user_id and f.d = r.ret_d
) s
order by case bucket when 'any_day' then 0 when 'no_classified_event' then 99 else 1 end, return_days desc;

\echo === first classified event on the return day
select coalesce(f.first_bucket, 'none') as first_bucket,
       count(*) as return_days,
       round(100.0 * count(*) / sum(count(*)) over (), 1) as pct_days,
       count(distinct r.user_id) as users
from rets r
left join flags f on f.user_id = r.user_id and f.d = r.ret_d
group by 1
order by return_days desc;

\echo === prior-day feature mix
select bucket,
       prior_days,
       round(100.0 * prior_days / nullif(max(prior_days) filter (where bucket = 'any_day') over (), 0), 1) as pct_days,
       users
from (
  select 'any_day' as bucket, count(*) as prior_days, count(distinct r.user_id) as users from rets r
  union all
  select 'tracker', count(*) filter (where coalesce(p.tracker, false)), count(distinct r.user_id) filter (where coalesce(p.tracker, false))
    from rets r left join flags p on p.user_id = r.user_id and p.d = r.prev_d
  union all
  select 'belajar', count(*) filter (where coalesce(p.belajar, false)), count(distinct r.user_id) filter (where coalesce(p.belajar, false))
    from rets r left join flags p on p.user_id = r.user_id and p.d = r.prev_d
  union all
  select 'mytoko', count(*) filter (where coalesce(p.mytoko, false)), count(distinct r.user_id) filter (where coalesce(p.mytoko, false))
    from rets r left join flags p on p.user_id = r.user_id and p.d = r.prev_d
  union all
  select 'deepdive', count(*) filter (where coalesce(p.deepdive, false)), count(distinct r.user_id) filter (where coalesce(p.deepdive, false))
    from rets r left join flags p on p.user_id = r.user_id and p.d = r.prev_d
  union all
  select 'cari', count(*) filter (where coalesce(p.cari, false)), count(distinct r.user_id) filter (where coalesce(p.cari, false))
    from rets r left join flags p on p.user_id = r.user_id and p.d = r.prev_d
  union all
  select 'chat', count(*) filter (where coalesce(p.chat, false)), count(distinct r.user_id) filter (where coalesce(p.chat, false))
    from rets r left join flags p on p.user_id = r.user_id and p.d = r.prev_d
  union all
  select 'kalk', count(*) filter (where coalesce(p.kalk, false)), count(distinct r.user_id) filter (where coalesce(p.kalk, false))
    from rets r left join flags p on p.user_id = r.user_id and p.d = r.prev_d
  union all
  select 'komunitas', count(*) filter (where coalesce(p.komunitas, false)), count(distinct r.user_id) filter (where coalesce(p.komunitas, false))
    from rets r left join flags p on p.user_id = r.user_id and p.d = r.prev_d
  union all
  select 'beranda', count(*) filter (where coalesce(p.beranda, false)), count(distinct r.user_id) filter (where coalesce(p.beranda, false))
    from rets r left join flags p on p.user_id = r.user_id and p.d = r.prev_d
  union all
  select 'no_classified_event', count(*) filter (where p.user_id is null), count(distinct r.user_id) filter (where p.user_id is null)
    from rets r left join flags p on p.user_id = r.user_id and p.d = r.prev_d
) s
order by case bucket when 'any_day' then 0 when 'no_classified_event' then 99 else 1 end, prior_days desc;

\echo === first classified event on the prior day
select coalesce(p.first_bucket, 'none') as first_bucket,
       count(*) as return_days,
       round(100.0 * count(*) / sum(count(*)) over (), 1) as pct_days
from rets r
left join flags p on p.user_id = r.user_id and p.d = r.prev_d
group by 1
order by return_days desc;

\echo === primary transition (first event prior -> first event return), n>=3
with trans as (
  select coalesce(p.first_bucket, 'none') as prior_first,
         coalesce(f.first_bucket, 'none') as return_first,
         count(*) as return_days
  from rets r
  left join flags p on p.user_id = r.user_id and p.d = r.prev_d
  left join flags f on f.user_id = r.user_id and f.d = r.ret_d
  group by 1, 2
),
rated as (
  select prior_first,
         return_first,
         return_days,
         round(100.0 * return_days / sum(return_days) over (partition by prior_first), 1) as pct_of_prior
  from trans
)
select prior_first, return_first, return_days, pct_of_prior
from rated
where return_days >= 3
order by prior_first, return_days desc;

\echo === co-occurrence (prior bucket touched -> return bucket touched)
with paired as (
  select r.user_id,
         coalesce(p.tracker, false) as p_tracker,
         coalesce(p.belajar, false) as p_belajar,
         coalesce(p.mytoko, false) as p_mytoko,
         coalesce(p.deepdive, false) as p_deepdive,
         coalesce(p.cari, false) as p_cari,
         coalesce(p.chat, false) as p_chat,
         coalesce(f.tracker, false) as r_tracker,
         coalesce(f.belajar, false) as r_belajar,
         coalesce(f.mytoko, false) as r_mytoko,
         coalesce(f.deepdive, false) as r_deepdive,
         coalesce(f.cari, false) as r_cari,
         coalesce(f.chat, false) as r_chat
  from rets r
  left join flags p on p.user_id = r.user_id and p.d = r.prev_d
  left join flags f on f.user_id = r.user_id and f.d = r.ret_d
),
long as (
  select 'tracker' as prior_bucket, r_tracker, r_belajar, r_mytoko, r_deepdive, r_cari, r_chat from paired where p_tracker
  union all
  select 'belajar', r_tracker, r_belajar, r_mytoko, r_deepdive, r_cari, r_chat from paired where p_belajar
  union all
  select 'mytoko', r_tracker, r_belajar, r_mytoko, r_deepdive, r_cari, r_chat from paired where p_mytoko
  union all
  select 'deepdive', r_tracker, r_belajar, r_mytoko, r_deepdive, r_cari, r_chat from paired where p_deepdive
  union all
  select 'cari', r_tracker, r_belajar, r_mytoko, r_deepdive, r_cari, r_chat from paired where p_cari
  union all
  select 'chat', r_tracker, r_belajar, r_mytoko, r_deepdive, r_cari, r_chat from paired where p_chat
)
select prior_bucket,
       count(*) as n,
       round(100.0 * count(*) filter (where r_tracker) / count(*), 1) as pct_ret_tracker,
       round(100.0 * count(*) filter (where r_belajar) / count(*), 1) as pct_ret_belajar,
       round(100.0 * count(*) filter (where r_mytoko) / count(*), 1) as pct_ret_mytoko,
       round(100.0 * count(*) filter (where r_deepdive) / count(*), 1) as pct_ret_deepdive,
       round(100.0 * count(*) filter (where r_cari) / count(*), 1) as pct_ret_cari,
       round(100.0 * count(*) filter (where r_chat) / count(*), 1) as pct_ret_chat
from long
group by prior_bucket
order by n desc;

\echo === stickiness: prior day touched X, return day touched X again
with paired as (
  select coalesce(p.tracker, false) as p_tracker,
         coalesce(p.belajar, false) as p_belajar,
         coalesce(p.mytoko, false) as p_mytoko,
         coalesce(p.deepdive, false) as p_deepdive,
         coalesce(p.cari, false) as p_cari,
         coalesce(p.chat, false) as p_chat,
         coalesce(f.tracker, false) as r_tracker,
         coalesce(f.belajar, false) as r_belajar,
         coalesce(f.mytoko, false) as r_mytoko,
         coalesce(f.deepdive, false) as r_deepdive,
         coalesce(f.cari, false) as r_cari,
         coalesce(f.chat, false) as r_chat
  from rets r
  left join flags p on p.user_id = r.user_id and p.d = r.prev_d
  left join flags f on f.user_id = r.user_id and f.d = r.ret_d
)
select 'tracker' as bucket,
       count(*) filter (where p_tracker) as prior_days,
       count(*) filter (where p_tracker and r_tracker) as again,
       round(100.0 * count(*) filter (where p_tracker and r_tracker) / nullif(count(*) filter (where p_tracker), 0), 1) as pct_again
from paired
union all
select 'belajar', count(*) filter (where p_belajar), count(*) filter (where p_belajar and r_belajar),
       round(100.0 * count(*) filter (where p_belajar and r_belajar) / nullif(count(*) filter (where p_belajar), 0), 1) from paired
union all
select 'mytoko', count(*) filter (where p_mytoko), count(*) filter (where p_mytoko and r_mytoko),
       round(100.0 * count(*) filter (where p_mytoko and r_mytoko) / nullif(count(*) filter (where p_mytoko), 0), 1) from paired
union all
select 'deepdive', count(*) filter (where p_deepdive), count(*) filter (where p_deepdive and r_deepdive),
       round(100.0 * count(*) filter (where p_deepdive and r_deepdive) / nullif(count(*) filter (where p_deepdive), 0), 1) from paired
union all
select 'cari', count(*) filter (where p_cari), count(*) filter (where p_cari and r_cari),
       round(100.0 * count(*) filter (where p_cari and r_cari) / nullif(count(*) filter (where p_cari), 0), 1) from paired
union all
select 'chat', count(*) filter (where p_chat), count(*) filter (where p_chat and r_chat),
       round(100.0 * count(*) filter (where p_chat and r_chat) / nullif(count(*) filter (where p_chat), 0), 1) from paired
order by prior_days desc;

\echo === only product surface on the return day (beranda/chat/kalk/komunitas may also be open)
with paired as (
  select coalesce(f.tracker, false) as tracker,
         coalesce(f.belajar, false) as belajar,
         coalesce(f.mytoko, false) as mytoko,
         coalesce(f.deepdive, false) as deepdive,
         coalesce(f.cari, false) as cari
  from rets r
  left join flags f on f.user_id = r.user_id and f.d = r.ret_d
)
select bucket,
       n,
       round(100.0 * n / nullif((select count(*) from rets), 0), 1) as pct_of_return_days
from (
  select 'tracker_only' as bucket, count(*) filter (
           where tracker and not belajar and not mytoko and not deepdive and not cari
         ) as n from paired
  union all
  select 'belajar_only', count(*) filter (
           where belajar and not tracker and not mytoko and not deepdive and not cari
         ) from paired
  union all
  select 'mytoko_only', count(*) filter (
           where mytoko and not tracker and not belajar and not deepdive and not cari
         ) from paired
  union all
  select 'deepdive_only', count(*) filter (
           where deepdive and not tracker and not belajar and not mytoko and not cari
         ) from paired
  union all
  select 'cari_only', count(*) filter (
           where cari and not tracker and not belajar and not mytoko and not deepdive
         ) from paired
  union all
  select 'none_of_five', count(*) filter (
           where not tracker and not belajar and not mytoko and not deepdive and not cari
         ) from paired
) s
order by n desc;

\echo === ever used before return day vs used again that day
select 'tracker' as bucket,
       count(*) filter (where coalesce(l.tracker, false)) as days_used_before,
       count(*) filter (where coalesce(l.tracker, false) and coalesce(f.tracker, false)) as used_again,
       round(100.0 * count(*) filter (where coalesce(l.tracker, false) and coalesce(f.tracker, false))
             / nullif(count(*) filter (where coalesce(l.tracker, false)), 0), 1) as pct_again_if_before,
       count(*) filter (where not coalesce(l.tracker, false) and coalesce(f.tracker, false)) as first_touch_on_return
from rets r
left join life l on l.user_id = r.user_id and l.ret_d = r.ret_d
left join flags f on f.user_id = r.user_id and f.d = r.ret_d
union all
select 'belajar',
       count(*) filter (where coalesce(l.belajar, false)),
       count(*) filter (where coalesce(l.belajar, false) and coalesce(f.belajar, false)),
       round(100.0 * count(*) filter (where coalesce(l.belajar, false) and coalesce(f.belajar, false))
             / nullif(count(*) filter (where coalesce(l.belajar, false)), 0), 1),
       count(*) filter (where not coalesce(l.belajar, false) and coalesce(f.belajar, false))
from rets r
left join life l on l.user_id = r.user_id and l.ret_d = r.ret_d
left join flags f on f.user_id = r.user_id and f.d = r.ret_d
union all
select 'mytoko',
       count(*) filter (where coalesce(l.mytoko, false)),
       count(*) filter (where coalesce(l.mytoko, false) and coalesce(f.mytoko, false)),
       round(100.0 * count(*) filter (where coalesce(l.mytoko, false) and coalesce(f.mytoko, false))
             / nullif(count(*) filter (where coalesce(l.mytoko, false)), 0), 1),
       count(*) filter (where not coalesce(l.mytoko, false) and coalesce(f.mytoko, false))
from rets r
left join life l on l.user_id = r.user_id and l.ret_d = r.ret_d
left join flags f on f.user_id = r.user_id and f.d = r.ret_d
union all
select 'deepdive',
       count(*) filter (where coalesce(l.deepdive, false)),
       count(*) filter (where coalesce(l.deepdive, false) and coalesce(f.deepdive, false)),
       round(100.0 * count(*) filter (where coalesce(l.deepdive, false) and coalesce(f.deepdive, false))
             / nullif(count(*) filter (where coalesce(l.deepdive, false)), 0), 1),
       count(*) filter (where not coalesce(l.deepdive, false) and coalesce(f.deepdive, false))
from rets r
left join life l on l.user_id = r.user_id and l.ret_d = r.ret_d
left join flags f on f.user_id = r.user_id and f.d = r.ret_d
union all
select 'cari',
       count(*) filter (where coalesce(l.cari, false)),
       count(*) filter (where coalesce(l.cari, false) and coalesce(f.cari, false)),
       round(100.0 * count(*) filter (where coalesce(l.cari, false) and coalesce(f.cari, false))
             / nullif(count(*) filter (where coalesce(l.cari, false)), 0), 1),
       count(*) filter (where not coalesce(l.cari, false) and coalesce(f.cari, false))
from rets r
left join life l on l.user_id = r.user_id and l.ret_d = r.ret_d
left join flags f on f.user_id = r.user_id and f.d = r.ret_d
order by days_used_before desc;

\echo === user-level: any return day in window (one row per returner)
with u as (
  select r.user_id,
         bool_or(coalesce(f.tracker, false)) as tracker,
         bool_or(coalesce(f.belajar, false)) as belajar,
         bool_or(coalesce(f.mytoko, false)) as mytoko,
         bool_or(coalesce(f.deepdive, false)) as deepdive,
         bool_or(coalesce(f.cari, false)) as cari,
         bool_or(coalesce(f.chat, false)) as chat,
         bool_or(coalesce(f.beranda, false)) as beranda
  from rets r
  left join flags f on f.user_id = r.user_id and f.d = r.ret_d
  group by r.user_id
)
select count(*) as returners,
       count(*) filter (where tracker) as tracker,
       count(*) filter (where belajar) as belajar,
       count(*) filter (where mytoko) as mytoko,
       count(*) filter (where deepdive) as deepdive,
       count(*) filter (where cari) as cari,
       count(*) filter (where chat) as chat,
       count(*) filter (where beranda) as beranda,
       count(*) filter (where tracker and not belajar and not mytoko and not deepdive and not cari) as tracker_only,
       count(*) filter (where belajar and not tracker and not mytoko and not deepdive and not cari) as belajar_only,
       count(*) filter (where mytoko and not tracker and not belajar and not deepdive and not cari) as mytoko_only
from u;

\echo === context: signups at least 8 days ago (compare ACTIVITY_RETURN_CORR 2026-10-14)
with ud as (
  select u.id,
         u.signup_day,
         count(distinct a.d) as active_days,
         coalesce(bool_or(a.d between u.signup_day + 1 and u.signup_day + 7), false) as ret_d1_7,
         coalesce(bool_or(a.d between u.signup_day + 8 and u.signup_day + 30), false) as ret_d8_30,
         coalesce(bool_or(a.d > u.signup_day), false) as ever_returned,
         (u.signup_day <= (timezone('Asia/Jakarta', now()))::date - 30) as mature_30
  from cohort u
  left join act a on a.user_id = u.id
  where u.signup_day <= (timezone('Asia/Jakarta', now()))::date - 8
  group by u.id, u.signup_day
)
select count(*) as users,
       round(100.0 * count(*) filter (where ever_returned) / count(*), 1) as pct_ever,
       round(100.0 * count(*) filter (where ret_d1_7) / count(*), 1) as pct_wk1,
       round(100.0 * count(*) filter (where ret_d8_30) / nullif(count(*) filter (where mature_30), 0), 1) as pct_d8_30_mature,
       count(*) filter (where mature_30) as mature_n
from ud;
