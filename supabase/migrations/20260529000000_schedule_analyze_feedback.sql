-- HISTORICAL — already applied. Live pg_cron is on Contabo (kong:8000).
-- DO NOT RE-RUN. See docs/self-host.md and larisid-infra/cron/recreate_cron_jobs.sql.

-- Enable required extensions
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Remove existing schedule if re-running migration
select cron.unschedule('analyze-feedback-batch') where exists (
  select 1 from cron.job where jobname = 'analyze-feedback-batch'
);

-- Schedule analyze-feedback edge function 5x/day: 8am, 11am, 2pm, 5pm, 8pm Jakarta (UTC+7)
-- Equivalent UTC times: 01:00, 04:00, 07:00, 10:00, 13:00
select cron.schedule(
  'analyze-feedback-batch',
  '0 1,4,7,10,13 * * *',
  $$
  select net.http_post(
    url     := 'http://kong:8000/functions/v1/analyze-feedback',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer REDACTED_SEE_INFRA_ENV"}'::jsonb,
    body    := '{"batch": true}'::jsonb
  )
  $$
);
