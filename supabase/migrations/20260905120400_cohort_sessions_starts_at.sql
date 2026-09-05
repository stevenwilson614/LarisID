alter table public.cohort_sessions
  add column if not exists starts_at timestamptz;

comment on column public.cohort_sessions.starts_at is
  'Absolute session start (WIB). Used by cohort-calendar-ics and WA reminders.';

update public.cohort_sessions
set starts_at = (session_date + coalesce(start_time, time '00:00'))
  at time zone 'Asia/Jakarta'
where starts_at is null and session_date is not null;
