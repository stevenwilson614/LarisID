-- LarisRise batch 1 reviewer: Afryian (Afryannp@gmail.com).
-- Grants /rise/admin/ via rise_is_reviewer(); not full platform admin.
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20260821150000_larisrise_reviewer_afryian.sql

insert into public.app_role_assignments (email, role, note)
values (
  'afryannp@gmail.com',
  'rise_reviewer',
  'LarisRise batch 1 reviewer (Afryian)'
)
on conflict (email) do update
  set role = excluded.role,
      note = excluded.note,
      updated_at = now();
