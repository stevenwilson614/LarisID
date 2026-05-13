-- Cohort theme & branding (leader-only writes via RPC)
-- Apply after 20260213120000_cohort_community.sql

-- ── cohorts: theme + branding (readable by existing cohorts_select) ──
alter table public.cohorts
  add column if not exists theme_primary text,
  add column if not exists theme_secondary text,
  add column if not exists theme_json jsonb default '{}'::jsonb,
  add column if not exists badge_icon text,
  add column if not exists slogan text;

comment on column public.cohorts.theme_primary is 'Hex e.g. #1e3a5f; set only via cohort_leader_update_branding by mentor_user_id';
comment on column public.cohorts.theme_secondary is 'Hex accent e.g. #d4b896';

-- ── community_posts: structured feed + moderation ──
alter table public.community_posts
  add column if not exists kind text not null default 'general',
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_by uuid references auth.users (id) on delete set null;

-- One-time: enforce allowed post kinds
alter table public.community_posts drop constraint if exists community_posts_kind_check;
alter table public.community_posts
  add constraint community_posts_kind_check
  check (kind in ('general', 'win', 'question', 'milestone_share', 'product_share'));

create index if not exists idx_community_posts_hidden on public.community_posts (cohort_id, hidden_at)
  where hidden_at is null;

-- Students: hide moderated posts from others; mentors see all
drop policy if exists posts_select on public.community_posts;
create policy posts_select on public.community_posts
  for select using (
    (
      exists (
        select 1 from public.cohort_members m
        where m.cohort_id = community_posts.cohort_id
          and m.user_id = auth.uid()
          and m.status = 'active'
      )
      and (
        community_posts.hidden_at is null
        or community_posts.author_id = auth.uid()
      )
    )
    or exists (
      select 1 from public.cohorts c
      where c.id = community_posts.cohort_id
        and c.mentor_user_id = auth.uid()
    )
  );

-- Leader can update posts (moderation) in their cohort
drop policy if exists posts_update_leader on public.community_posts;
create policy posts_update_leader on public.community_posts
  for update using (
    exists (
      select 1 from public.cohorts c
      where c.id = community_posts.cohort_id
        and c.mentor_user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.cohorts c
      where c.id = community_posts.cohort_id
        and c.mentor_user_id = auth.uid()
    )
  );

-- ── RPC: only cohort mentor can update branding/theme columns ──
create or replace function public.cohort_leader_update_branding(
  p_cohort uuid,
  p_theme_primary text,
  p_theme_secondary text,
  p_slogan text,
  p_badge_icon text,
  p_theme_json jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_mentor uuid;
  v_pri text;
  v_sec text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select mentor_user_id into v_mentor
  from public.cohorts
  where id = p_cohort;

  if v_mentor is null then
    raise exception 'cohort_not_found';
  end if;

  if v_mentor <> auth.uid() then
    raise exception 'forbidden';
  end if;

  v_pri := case when p_theme_primary is null then null else trim(p_theme_primary) end;
  v_sec := case when p_theme_secondary is null then null else trim(p_theme_secondary) end;

  if v_pri is not null and v_pri <> '' and v_pri !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'invalid_theme_primary';
  end if;
  if v_sec is not null and v_sec <> '' and v_sec !~ '^#[0-9A-Fa-f]{6}$' then
    raise exception 'invalid_theme_secondary';
  end if;

  update public.cohorts set
    theme_primary = case
      when p_theme_primary is null then theme_primary
      when v_pri = '' or v_pri is null then null
      else v_pri
    end,
    theme_secondary = case
      when p_theme_secondary is null then theme_secondary
      when v_sec = '' or v_sec is null then null
      else v_sec
    end,
    slogan = case
      when p_slogan is null then slogan
      else left(trim(p_slogan), 280)
    end,
    badge_icon = case
      when p_badge_icon is null then badge_icon
      else left(trim(p_badge_icon), 64)
    end,
    theme_json = case
      when p_theme_json is null then coalesce(theme_json, '{}'::jsonb)
      else p_theme_json
    end
  where id = p_cohort;
end;
$$;

revoke all on function public.cohort_leader_update_branding(uuid, text, text, text, text, jsonb) from public;
grant execute on function public.cohort_leader_update_branding(uuid, text, text, text, text, jsonb) to authenticated;
