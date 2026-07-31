-- ============================================================================
-- Two unrelated correctness fixes found while auditing the A/B campaign.
--
-- 1. cohort_member_profile() is called by js/laris-app.js (the admin/leader
--    "member profile" overlay, 3 call sites) but never existed in public — the
--    overlay silently rendered em-dashes for every field.
--
-- 2. activity_events had 47 signup_attribution rows for 43 distinct users.
--    Duplicates inflate any naive per-arm signup count, so every query has to
--    remember `distinct on (user_id)`. Enforce one row per user instead.
-- ============================================================================

-- ── 1. cohort_member_profile ───────────────────────────────────────────────
-- Shape matches what the overlay reads: display_name, email, app_role,
-- joined_at, last_activity_at, event_count, milestones_done, engagement_score.
-- Scoring mirrors cohort_student_directory (1 pt/event, 3 pts/milestone) so
-- the overlay and the directory table cannot disagree.
create or replace function public.cohort_member_profile(p_user uuid)
returns table (
  user_id          uuid,
  email            text,
  display_name     text,
  app_role         text,
  joined_at        timestamptz,
  last_activity_at timestamptz,
  event_count      bigint,
  milestones_done  bigint,
  engagement_score numeric
)
language sql
stable
security definer
set search_path to 'public', 'auth'
as $$
  select
    u.id as user_id,
    u.email::text,
    coalesce(
      nullif(trim(both from coalesce(u.raw_user_meta_data->>'full_name', '')), ''),
      split_part(u.email, '@', 1),
      'Member'
    )::text as display_name,
    public.derive_app_role(u.id, u.email)::text as app_role,
    (select min(m.joined_at) from public.cohort_members m where m.user_id = u.id) as joined_at,
    (select max(e.created_at) from public.activity_events e where e.user_id = u.id) as last_activity_at,
    (select count(*)::bigint from public.activity_events e where e.user_id = u.id) as event_count,
    (select count(*)::bigint from public.user_milestone_progress ump where ump.user_id = u.id) as milestones_done,
    (
      (select count(*)::numeric from public.activity_events e where e.user_id = u.id) * 1.0
      + (select count(*)::numeric from public.user_milestone_progress ump where ump.user_id = u.id) * 3.0
    ) as engagement_score
  from auth.users u
  where u.id = p_user
    -- Platform admins see anyone; leaders only members of a cohort they manage.
    and (
      public.is_platform_admin()
      or exists (
        select 1 from public.cohort_members m
        where m.user_id = u.id and public.can_manage_cohort(m.cohort_id)
      )
    );
$$;

alter function public.cohort_member_profile(uuid) owner to postgres;
revoke all on function public.cohort_member_profile(uuid) from public;
grant execute on function public.cohort_member_profile(uuid) to authenticated;

-- ── 2. One signup_attribution row per user ─────────────────────────────────
-- Collapse the existing duplicates first (keep the earliest — it carries the
-- true first-touch attribution), then prevent new ones.
delete from public.activity_events a
using public.activity_events b
where a.event_type = 'signup_attribution'
  and b.event_type = 'signup_attribution'
  and a.user_id = b.user_id
  and a.user_id is not null
  and (b.created_at, b.id) < (a.created_at, a.id);

create unique index if not exists activity_events_signup_attribution_uidx
  on public.activity_events (user_id)
  where event_type = 'signup_attribution';

notify pgrst, 'reload schema';
