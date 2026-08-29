-- Tracking a keyword now enrols it in the scrape queue.
--
-- THE GAP THIS CLOSES
-- -------------------
-- scrape_keywords carries a per-keyword SLA and claim_scrape_keywords() orders by
-- overdue RATIO (age / sla_days), so a 1-day keyword two days stale (2.0) already
-- outranks a 7-day corpus keyword ten days stale (1.43). The mechanism was built for
-- exactly this. Nothing ever connected it.
--
-- add_tracked_keyword only ever wrote user_tracked_keywords. Measured 2026-08-29:
-- of 26 tracked keywords, 3 had NEVER been scraped (they are not in the corpus at
-- all -- 'oleh oleh khas malang', 'oleh oleh malang', a CJK string), and the rest
-- averaged 2-4 scrapes per fortnight against a nominal 1-day SLA. A student who
-- tracks their market and is promised daily movement would have waited ~18 days for
-- the second data point.
--
-- Cost: ~40 keyword-slots/day against 400-1,100 scraped daily -- under 10%.
--
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20260830130000_track_enrolls_scrape_queue.sql

begin;

-- ---------------------------------------------------------------------------
-- 1. Shared enrol/release helpers
-- ---------------------------------------------------------------------------
-- Kept as functions rather than inlined so the add path, the remove path and the
-- backfill below cannot drift apart on what "tracked" means to the queue.

create or replace function public.scrape_enrol_tracked(p_keyword text, p_category text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kw text := btrim(coalesce(p_keyword, ''));
begin
  if length(v_kw) < 2 then return; end if;

  insert into public.scrape_keywords (keyword, category, source_set, active, sla_days)
  values (v_kw, nullif(btrim(coalesce(p_category, '')), ''), 'tracked', true, 1)
  on conflict (keyword) do update
    -- An existing corpus keyword keeps its category and history; it is only
    -- promoted to the daily lane and un-retired if it had been dropped.
    set sla_days = 1,
        active   = true,
        updated_at = now();
end;
$$;

comment on function public.scrape_enrol_tracked(text, text) is
  'Put a keyword in the daily scrape lane (sla_days=1). Idempotent; promotes an '
  'existing corpus keyword rather than duplicating it.';

create or replace function public.scrape_release_tracked(p_keyword text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kw text := btrim(coalesce(p_keyword, ''));
begin
  if v_kw = '' then return; end if;

  -- Only demote once NOBODY tracks it any more. Two students on the same market is
  -- the normal case in a cohort, and one of them untracking must not slow the other
  -- one's data down.
  if exists (select 1 from public.user_tracked_keywords where keyword = v_kw) then
    return;
  end if;

  update public.scrape_keywords
     set sla_days = 7, updated_at = now()
   where keyword = v_kw and sla_days = 1;
end;
$$;

comment on function public.scrape_release_tracked(text) is
  'Drop a keyword back to the 7-day corpus lane, but only when no user still tracks it.';

commit;

begin;

-- ---------------------------------------------------------------------------
-- 2. add_tracked_keyword -- unchanged contract, now also enrols
-- ---------------------------------------------------------------------------
-- The { ok:false, error } refusal shapes are load-bearing: quickTrackKeyword and the
-- wizard both branch on them and must not start seeing exceptions instead. Only the
-- success path gains a side effect.

create or replace function public.add_tracked_keyword(p_keyword text, p_category text default ''::text)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_kw text := btrim(coalesce(p_keyword, ''));
  v_id uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if length(v_kw) < 2 then
    return json_build_object('ok', false, 'error', 'keyword_too_short');
  end if;

  insert into public.user_tracker_state (user_id) values (v_me)
    on conflict (user_id) do nothing;

  begin
    insert into public.user_tracked_keywords (user_id, keyword, category)
    values (v_me, v_kw, coalesce(p_category, ''))
    returning id into v_id;
  exception
    when unique_violation then
      return json_build_object('ok', false, 'error', 'already_tracked');
    when check_violation then
      return json_build_object('ok', false, 'error', 'limit_reached',
                               'limit', public.tracking_keyword_limit());
  end;

  -- Enrolment must never cost the user their tracking. If the queue write fails the
  -- keyword is still tracked -- it just refreshes on the corpus cadence, which is
  -- exactly the behaviour that existed before this migration.
  begin
    perform public.scrape_enrol_tracked(v_kw, p_category);
  exception when others then
    raise warning 'scrape_enrol_tracked failed for %: %', v_kw, sqlerrm;
  end;

  return json_build_object('ok', true, 'id', v_id);
end $$;

create or replace function public.remove_tracked_keyword(p_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me uuid := auth.uid();
  v_kw text;
  v_found boolean;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  delete from public.user_tracked_keywords
   where id = p_id and user_id = v_me
   returning keyword into v_kw;
  v_found := v_kw is not null;

  if v_found then
    begin
      perform public.scrape_release_tracked(v_kw);
    exception when others then
      raise warning 'scrape_release_tracked failed for %: %', v_kw, sqlerrm;
    end;
  end if;

  return json_build_object('ok', v_found);
end $$;

commit;

begin;

-- ---------------------------------------------------------------------------
-- 3. Backfill the keywords that were already being tracked
-- ---------------------------------------------------------------------------
-- Includes the 3 that were never in the corpus at all, which is why they had no
-- data to show: they were tracked but nothing was ever going to scrape them.

do $$
declare
  v_added int;
begin
  select count(*) into v_added
  from public.user_tracked_keywords k
  where not exists (select 1 from public.scrape_keywords s where s.keyword = k.keyword);

  perform public.scrape_enrol_tracked(k.keyword, k.category)
  from (select distinct keyword, min(category) as category
          from public.user_tracked_keywords group by keyword) k;

  raise notice 'backfill: % tracked keywords were absent from scrape_keywords entirely', v_added;
end $$;

commit;

notify pgrst, 'reload schema';
