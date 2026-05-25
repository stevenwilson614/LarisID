alter table public.feedback
  add column if not exists element_context jsonb default null;
