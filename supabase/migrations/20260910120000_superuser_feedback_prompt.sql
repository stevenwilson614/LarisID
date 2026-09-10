-- Super-user feedback prompt + the export-row grant that thanks people for answering.
--
-- WHY. Outbound email does not get product feedback out of this user base. The
-- feedback_repeat_2026_09 campaign reached 115 people on 2026-09-01 and produced
-- five short replies in the week that followed, two of which opened by addressing
-- Steven by name. The personal framing worked; the channel did not. So the same
-- ask now arrives in-app, as a message from Steven, while the person is already
-- using the product.
--
-- Audience is deliberately the SAME bar the email campaign used, so the two are
-- comparable: at least two sign-ins and at least one Deep Dive. That definition
-- lives in feedback_repeat_audience() (20260901160000) but is admin-only and
-- returns the whole list; the client needs a per-caller answer instead, and it
-- cannot compute one itself because user_sessions is admin-read-only
-- (user_sessions_select_admin). Hence my_feedback_prompt_status().
--
-- Asked/answered/dismissed state is stored server-side, not just in localStorage,
-- so the prompt fires once per PERSON rather than once per browser.
--
-- The thank-you grant is 1000 export rows. _export_row_limit() is a flat 90/day
-- with no per-user term, so this adds a persistent bank (user_export_grants) that
-- is spendable on top of the daily allowance and never expires. export_rows() and
-- get_my_export_quota() are re-created below from their live definitions with
-- only the grant edits applied.

-- ── 1. Prompt state ──────────────────────────────────────────────────────────
create table if not exists public.feedback_prompts (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  asked_at     timestamptz,
  answered_at  timestamptz,
  dismissed_at timestamptz,
  feedback_id  uuid references public.feedback(id) on delete set null
);

alter table public.feedback_prompts enable row level security;

drop policy if exists "feedback_prompts_own_select" on public.feedback_prompts;
create policy "feedback_prompts_own_select" on public.feedback_prompts
  for select to authenticated using (user_id = auth.uid());

-- Writes go through mark_feedback_prompt() only.
revoke all on table public.feedback_prompts from anon, authenticated;
grant select on table public.feedback_prompts to authenticated;

-- ── 2. Export-row grants (a persistent bank, not a daily bonus) ───────────────
create table if not exists public.user_export_grants (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  rows_granted integer not null check (rows_granted > 0),
  rows_used    integer not null default 0 check (rows_used >= 0),
  source       text not null,
  granted_at   timestamptz not null default now()
);

create index if not exists idx_user_export_grants_user
  on public.user_export_grants (user_id, granted_at);

alter table public.user_export_grants enable row level security;

drop policy if exists "user_export_grants_own_select" on public.user_export_grants;
create policy "user_export_grants_own_select" on public.user_export_grants
  for select to authenticated using (user_id = auth.uid());

revoke all on table public.user_export_grants from anon, authenticated;
grant select on table public.user_export_grants to authenticated;

-- ── 3. Eligibility ───────────────────────────────────────────────────────────
create or replace function public.my_feedback_prompt_status()
returns json
language plpgsql
stable
security definer
set search_path = public, auth
set statement_timeout = '5s'
as $function$
declare
  v_me       uuid := auth.uid();
  v_email    text;
  v_sessions integer;
  v_dives    integer;
  v_row      public.feedback_prompts%rowtype;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  select u.email::text into v_email from auth.users u where u.id = v_me;
  select * into v_row from public.feedback_prompts where user_id = v_me;

  select count(*)::int into v_sessions
    from public.user_sessions where user_id = v_me;

  select count(*)::int into v_dives
    from public.activity_events
   where user_id = v_me and event_type = 'deepdive_open';

  return json_build_object(
    'eligible',
      v_row.answered_at is null
      and v_row.dismissed_at is null
      and v_sessions >= 2
      and v_dives >= 1
      and coalesce(v_email, '') !~* '@wa\.larisid\.com$'
      and not public.is_dapur_side_account(coalesce(v_email, ''))
      -- Defence in depth: the client also gates on isPlatformAdminRaw(), but a
      -- stale bundle must never make Steven message himself.
      and not public.is_platform_admin(),
    'sessions',     v_sessions,
    'dives',        v_dives,
    'asked_at',     v_row.asked_at,
    'answered_at',  v_row.answered_at,
    'dismissed_at', v_row.dismissed_at
  );
end;
$function$;

-- ── 4. Prompt state transitions ──────────────────────────────────────────────
create or replace function public.mark_feedback_prompt(
  p_action      text,
  p_feedback_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_me  uuid := auth.uid();
  v_fid uuid;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_action not in ('asked', 'answered', 'dismissed') then
    raise exception 'bad_action';
  end if;

  -- Never trust the id from the client: only link feedback the caller owns.
  if p_feedback_id is not null then
    select f.id into v_fid from public.feedback f
     where f.id = p_feedback_id and f.user_id = v_me;
  end if;

  insert into public.feedback_prompts (user_id) values (v_me)
  on conflict (user_id) do nothing;

  -- coalesce() everywhere so the first timestamp wins and a repeat call is a no-op.
  update public.feedback_prompts
     set asked_at     = case when p_action = 'asked'
                             then coalesce(asked_at, now()) else asked_at end,
         answered_at  = case when p_action = 'answered'
                             then coalesce(answered_at, now()) else answered_at end,
         dismissed_at = case when p_action = 'dismissed'
                             then coalesce(dismissed_at, now()) else dismissed_at end,
         feedback_id  = coalesce(feedback_id, v_fid)
   where user_id = v_me;
end;
$function$;

-- ── 5. Grant bank helpers ────────────────────────────────────────────────────
create or replace function public._export_row_grant_remaining(p_user uuid)
returns integer
language sql
stable
security definer
set search_path = public
as $function$
  select coalesce(sum(greatest(0, rows_granted - rows_used)), 0)::int
    from public.user_export_grants
   where user_id = p_user;
$function$;

create or replace function public._export_row_grant_consume(p_user uuid, p_rows integer)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_left integer := greatest(0, coalesce(p_rows, 0));
  v_take integer;
  r      record;
begin
  if v_left = 0 then return; end if;
  for r in
    select id, greatest(0, rows_granted - rows_used) as avail
      from public.user_export_grants
     where user_id = p_user and rows_granted > rows_used
     order by granted_at, id
  loop
    exit when v_left <= 0;
    v_take := least(v_left, r.avail);
    update public.user_export_grants
       set rows_used = rows_used + v_take
     where id = r.id;
    v_left := v_left - v_take;
  end loop;
end;
$function$;

-- ── 6. The thank-you grant ───────────────────────────────────────────────────
-- Mirrors claim_feedback_bonus(): the client is only the trigger, never the
-- authority. Differences: once per user EVER (not per day), and a 25-character
-- floor rather than 10 — the 10-char floor is fine for +3 searches, too weak for
-- 1000 export rows.
create or replace function public.claim_feedback_export_grant(p_feedback_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_me uuid := auth.uid();
  v_ok boolean;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  if exists (
    select 1 from public.user_export_grants
     where user_id = v_me and source = 'superuser_feedback'
  ) then
    return json_build_object('granted', false, 'reason', 'already_claimed');
  end if;

  select exists (
    select 1 from public.feedback f
     where f.id = p_feedback_id
       and f.user_id = v_me
       and f.page = 'superuser_prompt'
       and length(coalesce(trim(f.message), '')) >= 25
  ) into v_ok;

  if not v_ok then
    return json_build_object('granted', false, 'reason', 'invalid_feedback');
  end if;

  insert into public.user_export_grants (user_id, rows_granted, source)
  values (v_me, 1000, 'superuser_feedback');

  return json_build_object(
    'granted',   true,
    'rows',      1000,
    'remaining', public._export_row_grant_remaining(v_me)
  );
end;
$function$;

-- ── 7. Teach the export quota about the bank ─────────────────────────────────
-- Both functions below are the LIVE definitions with only the grant edits applied
-- (generated by diffing against pg_get_functiondef, not retyped).
CREATE OR REPLACE FUNCTION public.get_my_export_quota()
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '5s'
AS $function$
declare
  v_me         uuid := auth.uid();
  v_used       integer;
  v_weeks_used integer;
  v_limit      integer := public._export_row_limit()
                         + public._export_row_grant_remaining(auth.uid());
  v_wlimit     integer := public._export_week_limit();
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  -- NOT _beta_unlimited() — see TRAP 1 in 20260909120000_export_row_budget.sql.
  if public._usage_is_privileged() then
    return json_build_object(
      'unlimited', true, 'used', 0, 'limit', null, 'remaining', null,
      'weeks_used', 0, 'weeks_limit', null, 'weeks_remaining', null,
      'history_cap', public._export_history_cap(),
      'reset_at', public._export_reset_at());
  end if;

  select coalesce(export_rows_used, 0), coalesce(export_weeks_used, 0)
    into v_used, v_weeks_used
    from public.daily_usage where user_id = v_me and day = public._usage_day();
  v_used := coalesce(v_used, 0);
  v_weeks_used := coalesce(v_weeks_used, 0);

  return json_build_object(
    'unlimited',        false,
    'used',             v_used,
    'limit',            v_limit,
    'remaining',        greatest(0, v_limit - v_used),
    'weeks_used',       v_weeks_used,
    'weeks_limit',      v_wlimit,
    'weeks_remaining',  greatest(0, v_wlimit - v_weeks_used),
    'history_cap',      public._export_history_cap(),
    'reset_at',         public._export_reset_at());
end;
$function$

;

CREATE OR REPLACE FUNCTION public.export_rows(p_request_id uuid, p_item_ids bigint[], p_shop_ids bigint[], p_keywords text[] DEFAULT NULL::text[], p_history boolean DEFAULT false, p_weeks integer DEFAULT 12, p_source text DEFAULT 'directory'::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '30s'
AS $function$
declare
  v_me             uuid    := auth.uid();
  v_limit          integer := public._export_row_limit()
                              + public._export_row_grant_remaining(auth.uid());
  v_wlimit         integer := public._export_week_limit();
  v_priv           boolean := public._usage_is_privileged();
  v_weeks          integer := greatest(1, least(coalesce(p_weeks, 12), 26));
  v_src            text    := case when coalesce(p_source, 'directory')
                                        in ('directory', 'deepdive', 'favorit')
                                   then p_source else 'directory' end;
  -- Weekly history only for a single Deep Dive product. Multi-product / Cari
  -- Produk downloads are always monthly omset (1 product = 1 row).
  v_hist           boolean := coalesce(p_history, false)
                              and v_src = 'deepdive'
                              and coalesce(array_length(p_item_ids, 1), 0) = 1;
  v_maxkeys        integer;
  v_used           integer;
  v_used_pre       integer := 0;
  v_weeks_used     integer;
  v_remaining      integer;
  v_weeks_rem      integer;
  v_maxord         integer := 0;
  v_cost           integer := 0;
  v_weeks_cost     integer := 0;
  v_kept           integer := 0;
  v_asked          integer := 0;
  v_need           integer := 0;
  v_total          integer := 0;
  v_replay         boolean := false;
  v_prior          public.export_jobs%rowtype;
  v_items          bigint[];
  v_shops          bigint[];
  v_snap           jsonb   := '[]'::jsonb;
  v_weeksall       jsonb   := '[]'::jsonb;
  v_rows           jsonb   := '[]'::jsonb;
  v_series         jsonb   := '[]'::jsonb;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;
  if p_request_id is null then raise exception 'missing_request_id'; end if;
  if p_item_ids is null or p_shop_ids is null then raise exception 'missing_keys'; end if;
  if coalesce(array_length(p_item_ids, 1), 0)
     is distinct from coalesce(array_length(p_shop_ids, 1), 0) then
    raise exception 'key_arrays_mismatched';
  end if;

  v_maxkeys := case when v_hist then public._export_history_cap() else v_limit end;

  select * into v_prior from public.export_jobs
   where user_id = v_me and request_id = p_request_id;

  select coalesce(export_rows_used, 0), coalesce(export_weeks_used, 0)
    into v_used, v_weeks_used
    from public.daily_usage where user_id = v_me and day = public._usage_day();
  v_used := coalesce(v_used, 0);
  v_weeks_used := coalesce(v_weeks_used, 0);

  if v_prior.request_id is not null then
    v_replay    := true;
    v_remaining := case when v_hist then v_limit else v_prior.rows_charged end;
    v_weeks_rem := case when v_hist then v_prior.weeks else v_wlimit end;
  elsif v_priv then
    v_remaining := v_limit;
    v_weeks_rem := v_wlimit;
  else
    v_remaining := greatest(0, v_limit - v_used);
    v_weeks_rem := greatest(0, v_wlimit - v_weeks_used);
    if v_hist then
      if v_weeks_rem = 0 then
        return json_build_object('allowed', false, 'reason', 'limit_reached',
          'used', v_used, 'limit', v_limit, 'remaining', v_remaining,
          'weeks_used', v_weeks_used, 'weeks_limit', v_wlimit, 'weeks_remaining', 0,
          'reset_at', public._export_reset_at());
      end if;
      v_weeks := least(v_weeks, v_weeks_rem);
    else
      if v_remaining = 0 then
        return json_build_object('allowed', false, 'reason', 'limit_reached',
          'used', v_used, 'limit', v_limit, 'remaining', 0,
          'weeks_used', v_weeks_used, 'weeks_limit', v_wlimit,
          'weeks_remaining', v_weeks_rem,
          'reset_at', public._export_reset_at());
      end if;
    end if;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'ord',            k.ord,
           'item_id',        l.item_id::text,
           'shop_id',        l.shop_id::text,
           'product_name',   l.product_name,
           'store_name',     l.store_name,
           'location',       l.location,
           'category',       l.category,
           'keyword',        l.keyword,
           'price',          l.price,
           'original_price', l.original_price,
           'omset_monthly',  coalesce(l.nowcast_omset_monthly, l.est_omset_monthly),
           'omset_method',   coalesce(l.nowcast_method, l.omset_method),
           'omset_confidence', coalesce(l.nowcast_confidence, l.omset_confidence),
           'v_daily',        coalesce(l.nowcast_velocity_daily, l.est_velocity_daily),
           'total_sold',     l.total_sold,
           'sold_tier',      l.sold_tier,
           'momentum_pct',   m.momentum_pct,
           'momentum_class', coalesce(m.momentum_class, 'belum'),
           'units_now_wk',   m.units_now_wk,
           'units_prev_wk',  m.units_prev_wk,
           'rating',         l.rating,
           'reviews',        l.reviews,
           'wishlist',       l.wishlist,
           'in_stock',       l.in_stock,
           'is_ad',          l.is_ad,
           'search_rank',    l.search_rank,
           'listing_date',   l.listing_date,
           'scraped_at',     l.scraped_at,
           'last_obs_at',    l.nowcast_last_obs_at,
           'n_obs',          l.nowcast_n_obs,
           'url',            l.url,
           'image_url',      l.image_url
         ) order by k.ord), '[]'::jsonb) into v_snap
  from (
    select i::int as ord,
           p_item_ids[i] as item_id,
           p_shop_ids[i] as shop_id,
           nullif(btrim(coalesce(p_keywords[i], '')), '') as keyword
    from generate_subscripts(p_item_ids, 1) as i
    where i <= v_maxkeys
      and p_item_ids[i] is not null and p_shop_ids[i] is not null
  ) k
  cross join lateral (
    select d.*
    from public.listings_deduped d
    where d.item_id = k.item_id and d.shop_id = k.shop_id
      and not d.is_offtopic
    order by (d.keyword is not distinct from k.keyword) desc,
             d.total_sold desc nulls last
    limit 1
  ) l
  left join public.mv_listing_momentum m
    on m.item_id = l.item_id and m.shop_id = l.shop_id;

  v_asked := greatest(coalesce(array_length(p_item_ids, 1), 0),
                      jsonb_array_length(v_snap));
  if jsonb_array_length(v_snap) = 0 then
    return json_build_object('allowed', false, 'reason', 'no_rows',
      'used', v_used, 'limit', v_limit, 'remaining', v_remaining,
      'weeks_used', v_weeks_used, 'weeks_limit', v_wlimit,
      'weeks_remaining', v_weeks_rem,
      'reset_at', public._export_reset_at());
  end if;

  if v_hist then
    select array_agg((r->>'item_id')::bigint order by (r->>'ord')::int),
           array_agg((r->>'shop_id')::bigint order by (r->>'ord')::int)
      into v_items, v_shops
      from jsonb_array_elements(v_snap) r;

    select coalesce(jsonb_agg(to_jsonb(w) order by w.ord, w.week_start), '[]'::jsonb)
      into v_weeksall
      from public._product_weeks_batch(v_items, v_shops, v_weeks) w;
  end if;

  if v_hist then
    v_kept := jsonb_array_length(v_snap);
    v_maxord := v_kept;
    v_weeks_cost := v_weeks * v_kept;
    v_cost := 0;
    if not v_replay and not v_priv and v_weeks_cost > v_weeks_rem then
      return json_build_object('allowed', false, 'reason', 'not_enough_weeks',
        'need', v_weeks_cost, 'used', v_used, 'limit', v_limit,
        'remaining', v_remaining,
        'weeks_used', v_weeks_used, 'weeks_limit', v_wlimit,
        'weeks_remaining', v_weeks_rem,
        'reset_at', public._export_reset_at());
    end if;
  else
    with snap as (
      select (r->>'ord')::int as ord from jsonb_array_elements(v_snap) r
    ),
    running as (
      select ord, 1 as c,
             sum(1) over (order by ord rows between unbounded preceding and current row) as cum
      from snap
    ),
    keep as (select ord, cum from running where cum <= v_remaining)
    select coalesce(max(k.ord), 0), coalesce(max(k.cum), 0), count(k.ord)::int,
           1
      into v_maxord, v_cost, v_kept, v_need
    from keep k;

    if v_kept = 0 then
      return json_build_object('allowed', false, 'reason', 'not_enough_rows',
        'need', coalesce(v_need, 1), 'used', v_used, 'limit', v_limit,
        'remaining', v_remaining,
        'weeks_used', v_weeks_used, 'weeks_limit', v_wlimit,
        'weeks_remaining', v_weeks_rem,
        'reset_at', public._export_reset_at());
    end if;
  end if;

  select coalesce(jsonb_agg(r order by (r->>'ord')::int), '[]'::jsonb) into v_rows
    from jsonb_array_elements(v_snap) r where (r->>'ord')::int <= v_maxord;

  if v_hist then
    select coalesce(jsonb_agg(w order by (w->>'ord')::int, w->>'week_start'), '[]'::jsonb)
      into v_series
      from jsonb_array_elements(v_weeksall) w where (w->>'ord')::int <= v_maxord;
  end if;

  v_total := jsonb_array_length(v_rows) + jsonb_array_length(v_series);

  if not v_replay and not v_priv then
    insert into public.daily_usage (user_id, day)
    values (v_me, public._usage_day())
    on conflict (user_id, day) do nothing;

    if v_hist then
      update public.daily_usage
         set export_weeks_used = export_weeks_used + v_weeks_cost, updated_at = now()
       where user_id = v_me and day = public._usage_day()
         and export_weeks_used + v_weeks_cost <= v_wlimit
      returning export_weeks_used, export_rows_used into v_weeks_used, v_used;

      if v_weeks_used is null then
        select coalesce(export_rows_used, 0), coalesce(export_weeks_used, 0)
          into v_used, v_weeks_used from public.daily_usage
         where user_id = v_me and day = public._usage_day();
        return json_build_object('allowed', false, 'reason', 'limit_reached',
          'used', v_used, 'limit', v_limit,
          'remaining', greatest(0, v_limit - v_used),
          'weeks_used', v_weeks_used, 'weeks_limit', v_wlimit,
          'weeks_remaining', greatest(0, v_wlimit - v_weeks_used),
          'reset_at', public._export_reset_at());
      end if;
    else
      v_used_pre := v_used;
      update public.daily_usage
         set export_rows_used = export_rows_used + v_cost, updated_at = now()
       where user_id = v_me and day = public._usage_day()
         and export_rows_used + v_cost <= v_limit
      returning export_rows_used, export_weeks_used into v_used, v_weeks_used;

      if v_used is null then
        select coalesce(export_rows_used, 0), coalesce(export_weeks_used, 0)
          into v_used, v_weeks_used from public.daily_usage
         where user_id = v_me and day = public._usage_day();
        return json_build_object('allowed', false, 'reason', 'limit_reached',
          'used', v_used, 'limit', v_limit,
          'remaining', greatest(0, v_limit - v_used),
          'weeks_used', v_weeks_used, 'weeks_limit', v_wlimit,
          'weeks_remaining', greatest(0, v_wlimit - v_weeks_used),
          'reset_at', public._export_reset_at());
      end if;
      -- Rows above the free daily cap were only affordable because of a bonus
      -- grant, so spend that much of the bank. Both readings are exact: v_used_pre
      -- is today's total before this charge, v_used the total after it.
      perform public._export_row_grant_consume(
        v_me,
        greatest(0, v_used     - public._export_row_limit())
        - greatest(0, v_used_pre - public._export_row_limit()));
    end if;

    insert into public.export_jobs (user_id, request_id, day, shape, weeks,
                                    rows_charged, rows_total, products, truncated, source)
    values (v_me, p_request_id, public._usage_day(),
            case when v_hist then 'history' else 'snapshot' end,
            case when v_hist then v_weeks else 0 end,
            case when v_hist then v_weeks_cost else v_cost end,
            v_total, v_kept, v_kept < v_asked, v_src)
    on conflict (user_id, request_id) do nothing;

    insert into public.usage_events (user_id, kind, action, weight, product_key)
    values (v_me, 'export',
            case when v_hist then 'export_history' else 'export_snapshot' end,
            case when v_hist then v_weeks_cost else v_cost end,
            left(v_src, 40));
  end if;

  return json_build_object(
    'allowed',         true,
    'replay',          v_replay,
    'unlimited',       v_priv,
    'charged',         case when v_replay or v_priv then 0
                            when v_hist then v_weeks_cost else v_cost end,
    'weeks_charged',   case when v_replay or v_priv or not v_hist then 0 else v_weeks_cost end,
    'used',            v_used,
    'limit',           v_limit,
    'remaining',       case when v_priv then null else greatest(0, v_limit - v_used) end,
    'weeks_used',      v_weeks_used,
    'weeks_limit',     v_wlimit,
    'weeks_remaining', case when v_priv then null else greatest(0, v_wlimit - v_weeks_used) end,
    'reset_at',        public._export_reset_at(),
    'products',        v_kept,
    'requested',       v_asked,
    'truncated',       v_kept < v_asked,
    'weeks',           case when v_hist then v_weeks else 0 end,
    'rows_total',      v_total,
    'generated_at',    now(),
    'rows',            v_rows,
    'history',         v_series);
end;
$function$

;

-- ── 8. Grants ────────────────────────────────────────────────────────────────
revoke all on function public.my_feedback_prompt_status()                from public;
revoke all on function public.mark_feedback_prompt(text, uuid)           from public;
revoke all on function public.claim_feedback_export_grant(uuid)          from public;
revoke all on function public._export_row_grant_remaining(uuid)          from public;
revoke all on function public._export_row_grant_consume(uuid, integer)   from public;

grant execute on function public.my_feedback_prompt_status()      to authenticated, service_role;
grant execute on function public.mark_feedback_prompt(text, uuid) to authenticated, service_role;
grant execute on function public.claim_feedback_export_grant(uuid) to authenticated, service_role;
-- Internal helpers: called from inside security-definer functions only.
grant execute on function public._export_row_grant_remaining(uuid) to service_role;
grant execute on function public._export_row_grant_consume(uuid, integer) to service_role;

notify pgrst, 'reload schema';
