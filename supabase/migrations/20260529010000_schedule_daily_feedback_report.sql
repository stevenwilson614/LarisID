-- Schedule daily-feedback-report at 8am Jakarta (01:00 UTC) every day
select cron.schedule(
  'daily-feedback-report',
  '0 1 * * *',
  $$
  select net.http_post(
    url     := 'https://bzmvlraziqevqdyotvgy.supabase.co/functions/v1/daily-feedback-report',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ6bXZscmF6aXFldnFkeW90dmd5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDQwNTUyNSwiZXhwIjoyMDg5OTgxNTI1fQ.YygDyd0FIRvsUQ0xI2K15311-9DvXDDmdqD96cU_4QE"}'::jsonb,
    body    := '{}'::jsonb
  )
  $$
);
