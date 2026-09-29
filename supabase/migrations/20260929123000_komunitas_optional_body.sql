-- Diskusi titles can stand alone; Ceritakan / body is optional.
-- Keep NOT NULL with '' so existing clients and feed views stay simple.

alter table public.feature_requests
  drop constraint if exists feature_requests_body_check;

alter table public.feature_requests
  alter column body set default '';

alter table public.feature_requests
  add constraint feature_requests_body_check
  check (char_length(trim(body)) <= 4000);
