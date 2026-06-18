-- Capture seller region in the onboarding profile so regional insight
-- ("Yang Laku dari Kotamu") can persist and inform future personalization.
-- Additive + nullable; existing RLS (own-row only) already covers it.
ALTER TABLE public.user_onboarding_prefs
  ADD COLUMN IF NOT EXISTS region text;
