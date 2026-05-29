-- Add school/city to user_profiles and a mentor-to-student messaging table.

alter table public.user_profiles
  add column if not exists school  text,
  add column if not exists city    text;

-- One-way messages from mentor to a specific student.
-- The student sees these in their cohort overview ("Pesan dari Mentor").

create table if not exists public.mentor_messages (
  id             uuid        primary key default gen_random_uuid(),
  cohort_id      uuid        not null references public.cohorts (id) on delete cascade,
  from_user_id   uuid        not null references auth.users (id) on delete cascade,
  to_user_id     uuid        not null references auth.users (id) on delete cascade,
  body           text        not null,
  created_at     timestamptz not null default now(),
  read_at        timestamptz
);

create index if not exists idx_mentor_messages_to
  on public.mentor_messages (to_user_id, created_at desc);

alter table public.mentor_messages enable row level security;

-- Mentor (cohort owner) can insert messages to their cohort's students.
drop policy if exists mm_insert on public.mentor_messages;
create policy mm_insert on public.mentor_messages
  for insert with check (
    from_user_id = auth.uid()
    and exists (
      select 1 from public.cohorts c
      where c.id = cohort_id and c.mentor_user_id = auth.uid()
    )
  );

-- Mentor can read all messages they sent.
drop policy if exists mm_select_mentor on public.mentor_messages;
create policy mm_select_mentor on public.mentor_messages
  for select using (
    from_user_id = auth.uid()
    or (
      to_user_id = auth.uid()
      and exists (
        select 1 from public.cohort_members cm
        where cm.user_id = auth.uid() and cm.cohort_id = mentor_messages.cohort_id
      )
    )
  );

-- Mentor can delete their own messages.
drop policy if exists mm_delete on public.mentor_messages;
create policy mm_delete on public.mentor_messages
  for delete using (from_user_id = auth.uid());
