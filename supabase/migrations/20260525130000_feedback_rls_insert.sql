-- Allow any user (logged in or anonymous) to submit feedback.
-- Reads stay service-role only (admin only via the dashboard).
create policy "anyone can insert feedback"
  on public.feedback
  for insert
  to anon, authenticated
  with check (true);
