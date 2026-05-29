-- Milestone content: rich learning materials (video/document/text) attached to milestones,
-- with per-user progress tracking and auto-completion.

-- ── Ensure milestones has track + description (may already exist in live DB) ──

alter table public.milestones
  add column if not exists track text not null default 'general'
    check (track in ('soft_skill','business_skill','general')),
  add column if not exists description text;

-- ── Tables ────────────────────────────────────────────────────────────────────

create table if not exists public.milestone_content (
  id            uuid        primary key default gen_random_uuid(),
  milestone_id  uuid        not null references public.milestones(id) on delete cascade,
  content_type  text        not null check (content_type in ('video','document','text')),
  title         text,
  url           text,
  body          text,
  sort_order    int         not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists idx_mc_milestone on public.milestone_content (milestone_id, sort_order);

create table if not exists public.user_content_progress (
  id           uuid        primary key default gen_random_uuid(),
  user_id      uuid        not null references auth.users(id) on delete cascade,
  content_id   uuid        not null references public.milestone_content(id) on delete cascade,
  progress_pct int         not null default 0 check (progress_pct between 0 and 100),
  completed_at timestamptz,
  updated_at   timestamptz not null default now(),
  unique (user_id, content_id)
);

create index if not exists idx_ucp_user on public.user_content_progress (user_id);

-- ── RLS: milestone_content ────────────────────────────────────────────────────

alter table public.milestone_content enable row level security;

create policy mc_select on public.milestone_content
  for select using (
    exists (
      select 1 from public.milestones ms
      join public.cohort_members m on m.cohort_id = ms.cohort_id
      where ms.id = milestone_content.milestone_id
        and m.user_id = auth.uid() and m.status = 'active'
    )
    or exists (
      select 1 from public.milestones ms
      join public.cohorts c on c.id = ms.cohort_id
      where ms.id = milestone_content.milestone_id
        and c.mentor_user_id = auth.uid()
    )
  );

create policy mc_insert on public.milestone_content
  for insert with check (
    exists (
      select 1 from public.milestones ms
      join public.cohorts c on c.id = ms.cohort_id
      where ms.id = milestone_id and c.mentor_user_id = auth.uid()
    )
  );

create policy mc_update on public.milestone_content
  for update using (
    exists (
      select 1 from public.milestones ms
      join public.cohorts c on c.id = ms.cohort_id
      where ms.id = milestone_content.milestone_id and c.mentor_user_id = auth.uid()
    )
  );

create policy mc_delete on public.milestone_content
  for delete using (
    exists (
      select 1 from public.milestones ms
      join public.cohorts c on c.id = ms.cohort_id
      where ms.id = milestone_content.milestone_id and c.mentor_user_id = auth.uid()
    )
  );

-- ── RLS: user_content_progress ────────────────────────────────────────────────

alter table public.user_content_progress enable row level security;

create policy ucp_select on public.user_content_progress
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.milestone_content mc
      join public.milestones ms on ms.id = mc.milestone_id
      join public.cohorts c on c.id = ms.cohort_id
      where mc.id = user_content_progress.content_id and c.mentor_user_id = auth.uid()
    )
  );

create policy ucp_insert on public.user_content_progress
  for insert with check (user_id = auth.uid());

create policy ucp_update on public.user_content_progress
  for update using (user_id = auth.uid());

-- ── RPC: complete_content_item ────────────────────────────────────────────────
-- Upserts progress=100 and fires milestone completion when all content items done.

create or replace function public.complete_content_item(p_content_id uuid)
returns void
language plpgsql security definer
set search_path = public, auth
as $$
declare
  v_milestone uuid;
  v_cohort    uuid;
  v_total     int;
  v_done      int;
begin
  if auth.uid() is null then raise exception 'Unauthenticated'; end if;

  select ms.id, ms.cohort_id
  into v_milestone, v_cohort
  from public.milestone_content mc
  join public.milestones ms on ms.id = mc.milestone_id
  where mc.id = p_content_id;

  if v_milestone is null then raise exception 'Content not found'; end if;

  insert into public.user_content_progress (user_id, content_id, progress_pct, completed_at, updated_at)
  values (auth.uid(), p_content_id, 100, now(), now())
  on conflict (user_id, content_id) do update
    set progress_pct = 100, completed_at = coalesce(user_content_progress.completed_at, now()), updated_at = now();

  select count(*) into v_total from public.milestone_content where milestone_id = v_milestone;
  select count(*) into v_done
  from public.user_content_progress ucp
  join public.milestone_content mc on mc.id = ucp.content_id
  where mc.milestone_id = v_milestone and ucp.user_id = auth.uid() and ucp.progress_pct = 100;

  if v_done >= v_total and v_total > 0 then
    insert into public.user_milestone_progress (user_id, milestone_id)
    values (auth.uid(), v_milestone)
    on conflict do nothing;

    insert into public.activity_events (cohort_id, user_id, event_type, metadata)
    values (v_cohort, auth.uid(), 'milestone_complete',
            jsonb_build_object('milestone_id', v_milestone, 'via', 'content'))
    on conflict do nothing;
  end if;
end;
$$;

revoke all on function public.complete_content_item(uuid) from public;
grant execute on function public.complete_content_item(uuid) to authenticated;
