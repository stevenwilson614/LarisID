-- HISTORICAL — already applied on cloud, then re-pointed on Contabo.
-- DO NOT RE-RUN. Live trigger/cron uses http://kong:8000 (larisid-infra/cron).
-- See docs/self-host.md.

-- Wire analyze-feedback edge function to fire on every new feedback insert.
-- The existing on_feedback_insert trigger already calls notify-feedback (email).
-- This adds a second trigger using the same supabase_functions.http_request pattern.

drop trigger if exists on_feedback_insert_analyze on public.feedback;

create trigger on_feedback_insert_analyze
  after insert on public.feedback
  for each row
  execute function supabase_functions.http_request(
    'http://kong:8000/functions/v1/analyze-feedback',
    'POST',
    '{"Content-type":"application/json","Authorization":"Bearer REDACTED_SEE_INFRA_ENV"}',
    '{}',
    '5000'
  );
