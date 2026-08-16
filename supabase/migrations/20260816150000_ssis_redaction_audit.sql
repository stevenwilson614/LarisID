-- SSIS: automated PII leakage audit over the redacted raw corpus.
--
-- Redaction happens in the Cloudflare Worker, before persistence. This is the
-- independent check that it actually worked — because the failure mode is
-- silent, and the thing leaking belongs to people who never consented to
-- anything (buyers, not students). Runs weekly; alerts rather than deletes, so
-- a hit can be investigated before the evidence disappears.
--
-- New SQL: bash scripts/apply-selfhost.sh (docs/self-host.md). Do not supabase db push.

create table if not exists public.ssis_redaction_audit (
  id          uuid primary key default gen_random_uuid(),
  ran_at      timestamptz not null default now(),
  rows_checked integer not null,
  phone_hits  integer not null,
  street_hits integer not null,
  sample_ids  uuid[] not null default '{}'
);

alter table public.ssis_redaction_audit enable row level security;
drop policy if exists ssis_audit_select on public.ssis_redaction_audit;
create policy ssis_audit_select on public.ssis_redaction_audit
  for select using (public.is_platform_admin());
revoke all on public.ssis_redaction_audit from anon;

create or replace function public.ssis_run_redaction_audit()
returns public.ssis_redaction_audit
language plpgsql
security definer
set search_path = public
as $$
declare
  -- Indonesian mobile numbers, and street-level address tokens.
  phone_re  constant text := '(\+?62|0)[[:space:]-]?8[0-9[:space:]-]{7,}';
  street_re constant text := '\m(jl\.?|jalan|gg\.?|gang|rt[[:space:]]*[0-9]|rw[[:space:]]*[0-9]|blok[[:space:]]*[a-z0-9])\M';
  rec public.ssis_redaction_audit;
begin
  with scanned as (
    select id, payload_redacted::text as body
    from public.cohort_raw_ok
    where received_at > now() - interval '8 days'
  ), hits as (
    select id,
           body ~* phone_re  as has_phone,
           body ~* street_re as has_street
    from scanned
  )
  insert into public.ssis_redaction_audit (rows_checked, phone_hits, street_hits, sample_ids)
  select
    (select count(*) from scanned),
    count(*) filter (where has_phone),
    count(*) filter (where has_street),
    coalesce((array_agg(id) filter (where has_phone or has_street))[1:10], '{}')
  from hits
  returning * into rec;

  if rec.phone_hits > 0 or rec.street_hits > 0 then
    raise warning 'SSIS REDACTION LEAK: % phone, % street in % rows. Sample: %',
      rec.phone_hits, rec.street_hits, rec.rows_checked, rec.sample_ids;
  end if;

  return rec;
end;
$$;

revoke execute on function public.ssis_run_redaction_audit() from public, anon, authenticated;

select cron.schedule(
  'ssis-redaction-audit',
  '23 2 * * 1',                            -- Mondays 09:23 WIB
  $$select public.ssis_run_redaction_audit();$$
)
where not exists (select 1 from cron.job where jobname = 'ssis-redaction-audit');

notify pgrst, 'reload schema';
