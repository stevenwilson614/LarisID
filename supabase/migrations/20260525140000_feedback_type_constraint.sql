-- Expand type CHECK constraint to include element-level feedback types
alter table public.feedback
  drop constraint if exists feedback_type_check;

alter table public.feedback
  add constraint feedback_type_check
  check (type in ('bug', 'feature', 'other', 'wrong_data', 'not_working', 'request_edit'));
