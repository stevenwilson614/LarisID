-- Teacher class certificates: a cohort leader (mentor) recognises a student's
-- genuine completion of a class/program with a printable certificate.
--
-- Per MISSION.md, recognition must reflect real achievement. The certificate can
-- only be issued by the cohort's own mentor (verified server-side), and the
-- student can always see their own certificates.

create table if not exists public.certificates (
  id         uuid        primary key default gen_random_uuid(),
  cohort_id  uuid        not null references public.cohorts(id) on delete cascade,
  user_id    uuid        not null references auth.users(id) on delete cascade,
  title      text        not null,
  issued_by  uuid        references auth.users(id),
  issued_at  timestamptz not null default now(),
  serial     text        not null unique
               default ('LRS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)))
);

create index if not exists idx_certificates_user   on public.certificates (user_id);
create index if not exists idx_certificates_cohort on public.certificates (cohort_id);

-- ── RLS ───────────────────────────────────────────────────────────────────────

alter table public.certificates enable row level security;

-- Student reads their own certificates; the cohort mentor reads certificates for
-- their cohort; platform admins can read all.
drop policy if exists certificates_select on public.certificates;
create policy certificates_select on public.certificates
  for select using (
    user_id = auth.uid()
    or public.is_platform_admin()
    or exists (
      select 1 from public.cohorts c
      where c.id = certificates.cohort_id
        and c.mentor_user_id = auth.uid()
    )
  );

-- Issuance only via the security-definer RPC below (no direct insert policy).

-- ── RPC: leader_issue_certificate ──────────────────────────────────────────────
-- Verifies the caller is the cohort's mentor, confirms the target user is a
-- member of that cohort, inserts a certificate with a generated serial, returns it.

create or replace function public.leader_issue_certificate(
  p_cohort uuid,
  p_user   uuid,
  p_title  text
)
returns public.certificates
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_serial text;
  v_title  text;
  v_row    public.certificates;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  -- Only the cohort's mentor (or a platform admin) may issue.
  if not public.can_manage_cohort(p_cohort) then
    raise exception 'forbidden';
  end if;

  -- The recipient must belong to the cohort, so certificates can't be minted for
  -- arbitrary users.
  if not exists (
    select 1 from public.cohort_members m
    where m.cohort_id = p_cohort and m.user_id = p_user
  ) then
    raise exception 'not_a_cohort_member';
  end if;

  v_title := nullif(btrim(coalesce(p_title, '')), '');
  if v_title is null then
    raise exception 'title_required';
  end if;
  v_title := left(v_title, 160);

  v_serial := 'LRS-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 12));

  insert into public.certificates (cohort_id, user_id, title, issued_by, serial)
  values (p_cohort, p_user, v_title, auth.uid(), v_serial)
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.leader_issue_certificate(uuid, uuid, text) from public;
grant execute on function public.leader_issue_certificate(uuid, uuid, text) to authenticated;
