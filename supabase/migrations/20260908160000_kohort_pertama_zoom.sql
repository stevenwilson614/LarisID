-- Kohort Pertama: shared Zoom link for all 8 Kegiatan sessions.
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20260908160000_kohort_pertama_zoom.sql

update public.cohort_sessions s
set
  meet_url = 'https://us06web.zoom.us/j/88393238624?pwd=pavGSKFeAm0leH7lMSiwau0973UiOn.1',
  notes = coalesce(
    nullif(btrim(s.notes), ''),
    'Pertemuan mingguan · Selasa 15:00 WIB'
  ),
  updated_at = now()
from public.cohorts c
where s.cohort_id = c.id
  and c.slug = 'kohort-pertama';
