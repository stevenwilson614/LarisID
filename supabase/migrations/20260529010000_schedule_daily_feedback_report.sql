-- HISTORICAL — already applied. Live pg_cron is on Contabo (kong:8000).
-- DO NOT RE-RUN. See docs/self-host.md and larisid-infra/cron/recreate_cron_jobs.sql.

-- Schedule daily-feedback-report at 8am Jakarta (01:00 UTC) every day
select cron.schedule(
  'daily-feedback-report',
  '0 1 * * *',
  $$
  select net.http_post(
    url     := 'http://kong:8000/functions/v1/daily-feedback-report',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer REDACTED_SEE_INFRA_ENV"}'::jsonb,
    body    := '{}'::jsonb
  )
  $$
);
