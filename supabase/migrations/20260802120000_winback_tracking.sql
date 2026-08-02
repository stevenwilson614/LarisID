-- ==========================================================================
-- Win-back email tracking: opens, deliveries, bounces/complaints, and the
-- stats an operator needs to tell which template variant is working.
--
-- Deliberately does NOT use Resend's native open/click tracking -- that
-- requires a verified DNS tracking subdomain (links.larisid.com), which is a
-- Namecheap panel change outside what this migration can do. Instead:
--   - opens are recorded by a self-hosted 1x1 pixel (email-pixel function)
--     embedded with each email_sends.id, no DNS dependency;
--   - click-through is already visible via the existing utm_campaign +
--     page_views/activity_events instrumentation on our own domain;
--   - delivered/bounced/complained come from a Resend webhook subscription
--     (resend-webhook function), which does NOT require the tracking
--     subdomain -- only the opened/clicked toggles do.
-- ==========================================================================

create table if not exists public.email_events (
  id             uuid primary key default gen_random_uuid(),
  email_send_id  uuid references public.email_sends(id) on delete cascade,
  resend_email_id text,
  event_type     text not null check (event_type in
                   ('sent','delivered','bounced','complained','opened','clicked')),
  occurred_at    timestamptz not null default now(),
  meta           jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index if not exists idx_email_events_send_id on public.email_events (email_send_id);
create index if not exists idx_email_events_type_time on public.email_events (event_type, occurred_at);
create index if not exists idx_email_events_resend_id on public.email_events (resend_email_id);

alter table public.email_events enable row level security;
revoke all privileges on table public.email_events from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Per-campaign funnel: sent -> delivered -> opened -> claimed. "claimed" reads
-- activity_events winback_claim rows carrying the SPECIFIC template variant
-- (metadata->>'campaign'), not comeback_passes.campaign -- that column is
-- always 'winback' (one shared pass regardless of which sequence email linked
-- to it), so it can't tell wb1_a from wb1_b. The frontend capture that fills
-- this in was added alongside this migration.
-- ---------------------------------------------------------------------------
create or replace function public.winback_campaign_stats()
 returns table(
   campaign        text,
   sent            bigint,
   delivered       bigint,
   opened          bigint,
   open_rate       numeric,
   bounced         bigint,
   complained      bigint,
   claimed         bigint,
   claim_rate      numeric,
   avg_minutes_to_open numeric
 )
 language plpgsql
 stable
 SECURITY DEFINER
 SET search_path TO 'public'
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden';
  end if;

  return query
  with base as (
    select es.id, es.campaign, es.sent_at, es.user_id
    from public.email_sends es
    where es.status = 'sent'
  ),
  ev as (
    select
      b.campaign,
      b.id,
      b.sent_at,
      bool_or(e.event_type = 'delivered')  as was_delivered,
      bool_or(e.event_type = 'bounced')    as was_bounced,
      bool_or(e.event_type = 'complained') as was_complained,
      min(e.occurred_at) filter (where e.event_type = 'opened') as first_open_at
    from base b
    left join public.email_events e on e.email_send_id = b.id
    group by b.campaign, b.id, b.sent_at
  ),
  claims as (
    select
      ae.metadata->>'campaign' as campaign,
      count(*) as n
    from public.activity_events ae
    where ae.event_type = 'winback_claim'
      and ae.metadata->>'campaign' is not null
    group by 1
  )
  select
    ev.campaign,
    count(*) as sent,
    count(*) filter (where ev.was_delivered) as delivered,
    count(*) filter (where ev.first_open_at is not null) as opened,
    round(
      100.0 * count(*) filter (where ev.first_open_at is not null)
      / nullif(count(*), 0), 1
    ) as open_rate,
    count(*) filter (where ev.was_bounced) as bounced,
    count(*) filter (where ev.was_complained) as complained,
    coalesce(cl.n, 0) as claimed,
    round(100.0 * coalesce(cl.n, 0) / nullif(count(*), 0), 1) as claim_rate,
    round(
      avg(extract(epoch from (ev.first_open_at - ev.sent_at)) / 60.0)
        filter (where ev.first_open_at is not null),
      1
    ) as avg_minutes_to_open
  from ev
  left join claims cl on cl.campaign = ev.campaign
  group by ev.campaign, cl.n
  order by ev.campaign;
end;
$$;

revoke execute on function public.winback_campaign_stats() from anon;
grant execute on function public.winback_campaign_stats() to authenticated;

-- ---------------------------------------------------------------------------
-- What hour (Asia/Jakarta) do opens actually land in. Answers "at what time"
-- rather than just "did they open" -- informs future send-time changes.
-- One row per email_send_id (first open only), so a re-open doesn't double-count.
-- ---------------------------------------------------------------------------
create or replace function public.winback_open_hour_histogram(p_campaign text default null)
 returns table(hour_wib int, opens bigint)
 language plpgsql
 stable
 SECURITY DEFINER
 SET search_path TO 'public'
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden';
  end if;

  return query
  with first_opens as (
    select
      es.campaign,
      min(e.occurred_at) as first_open_at
    from public.email_events e
    join public.email_sends es on es.id = e.email_send_id
    where e.event_type = 'opened'
      and (p_campaign is null or es.campaign = p_campaign)
    group by es.campaign, e.email_send_id
  )
  select
    extract(hour from (first_open_at at time zone 'Asia/Jakarta'))::int as hour_wib,
    count(*) as opens
  from first_opens
  group by 1
  order by 1;
end;
$$;

revoke execute on function public.winback_open_hour_histogram(text) from anon;
grant execute on function public.winback_open_hour_histogram(text) to authenticated;

-- PostgREST needs a schema cache reload after this migration.
-- Run: NOTIFY pgrst, 'reload schema';
