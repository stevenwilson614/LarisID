-- AI analysis columns written back by analyze-feedback edge function
alter table public.feedback
  add column if not exists ai_priority    text,
  add column if not exists ai_scope       text,
  add column if not exists ai_action      text,
  add column if not exists ai_notes       text,
  add column if not exists ai_analyzed_at timestamptz;

-- Authenticated users can read their own feedback rows
-- (needed so .insert().select('id') works in the browser)
create policy "users can read own feedback"
  on public.feedback
  for select
  to authenticated
  using (auth.uid() = user_id);
