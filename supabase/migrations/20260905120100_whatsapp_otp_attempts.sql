-- Lock WhatsApp OTP after 5 failed guesses in the 10-minute window.

alter table public.whatsapp_otps
  add column if not exists attempts integer not null default 0;

comment on column public.whatsapp_otps.attempts is
  'Failed verify guesses. Lock the row after 5; user must request a new OTP.';
