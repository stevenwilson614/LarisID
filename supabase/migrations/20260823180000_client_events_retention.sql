-- ============================================================================
-- 12-month retention for client_events.
--
-- Exists so the privacy page's claim is true rather than aspirational:
-- privacy/index.html states "Data aktivitas disimpan maksimal 12 bulan, lalu
-- dihapus otomatis". Without this job that sentence would be a promise nothing
-- kept.
--
-- Must be scheduled as supabase_admin: on this self-hosted box the `postgres`
-- role has cron writes revoked (see the runid_seq incident in the migration
-- runbook), so cron.schedule() from `postgres` fails with a permission error.
-- ============================================================================

create or replace function public.prune_client_events()
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.client_events
   where created_at < now() - interval '12 months';
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.prune_client_events() from public, anon, authenticated;
grant execute on function public.prune_client_events() to service_role;

-- 03:20 WIB daily — off the scrape and rollup windows.
select cron.schedule(
  'prune-client-events',
  '20 20 * * *',
  $cron$ select public.prune_client_events(); $cron$
)
where not exists (select 1 from cron.job where jobname = 'prune-client-events');
