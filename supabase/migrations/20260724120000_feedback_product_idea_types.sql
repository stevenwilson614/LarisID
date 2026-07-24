-- Allow product request and idea types for Pesan ke Steven chips
alter table public.feedback
  drop constraint if exists feedback_type_check;

alter table public.feedback
  add constraint feedback_type_check
  check (type in (
    'bug',
    'feature',
    'other',
    'product',
    'idea',
    'wrong_data',
    'not_working',
    'request_edit'
  ));
