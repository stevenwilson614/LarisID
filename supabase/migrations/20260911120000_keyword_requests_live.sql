-- "Minta Produk" — let a user ask us to measure a keyword, and auto-queue it.
--
-- WHY. On 2026-09-10 a power user (15 sessions, 28 deep dives) wrote:
--   "saat pencarian produk yang spesifik jawabannya masih umum atau general.
--    belum spesifik ke jenis produk yang dituju"
-- They are a hijab seller who searched "Hijab Dinas" / "Hijab Dinas Polwan TNI"
-- five times over two days. The corpus has 29 hijab keywords and none for the
-- uniform-hijab niche, so searchProductTypes scored `hijab instan` as a strong
-- match (2 of 3 tokens) and every answer analysed the wrong market. They have
-- ZERO rows in uncovered_searches, because that logger only fires on a hard
-- zero — a partial match is invisible to us. Three days earlier another user
-- used the feedback form as a workaround: "tolong track product batu hijau
-- new zealand". There was no way to ask.
--
-- keyword_scrape_requests already existed (20260612120000) with the right
-- columns, owner+admin RLS and a unique partial index — but its only UI lived
-- in js/laris-app.js, the retired Site A bundle, so the table has 0 rows.
-- This migration keeps that table and adds the server half that makes it real.
--
-- WHAT CHANGED SINCE THAT TABLE WAS WRITTEN: the scraper no longer reads
-- hardcoded keywords_dayN.py lists. public.scrape_keywords is the live work
-- queue and claim_scrape_keywords() sorts never-scraped rows first within
-- their SLA class, so fulfilling a request is one INSERT at sla_days=1 and the
-- data lands on the next daily lane. That is why this can auto-queue instead
-- of parking requests in a review pile.
--
-- SECURITY SHAPE. scrape_keywords has RLS on and NEITHER anon NOR authenticated
-- holds INSERT — deliberately. Every queue write therefore goes through the
-- SECURITY DEFINER functions below, which is also where the abuse guards live,
-- because a client-side guard is not a guard.

-- ── 1. Columns the live flow needs ───────────────────────────────────────────
alter table public.keyword_scrape_requests
  add column if not exists notify_wa     text,
  add column if not exists card_shown_at timestamptz,
  add column if not exists source        text;

comment on column public.keyword_scrape_requests.notify_wa is
  'WhatsApp number collected at request time. Only 1 of 76 users has '
  'user_tracker_state.notify_wa_number, so the form must ask; we do not '
  'silently reuse or overwrite user_profiles.wa_number.';
comment on column public.keyword_scrape_requests.card_shown_at is
  'Set when the in-app "datanya siap" card has been seen. Separate from '
  'notified_at, which means the WhatsApp went out — a row can hit one, the '
  'other, or both.';

-- Existing status CHECK already allows pending|ready|notified|cancelled.
-- Flow: pending -> ready (data landed) -> notified (told, either channel).

alter table public.uncovered_searches
  add column if not exists match_quality text,
  add column if not exists via           text;

comment on column public.uncovered_searches.match_quality is
  'none = nothing matched at all; fuzzy = only the _rbFuzzyMatch rescue hit; '
  'loose = matched on a shared token but not the phrase. Before this column '
  'we only ever recorded hard zeros, which is why the reported case left no trace.';
comment on column public.uncovered_searches.via is
  'search | lookup | agent — which path missed. The agent path passed '
  'skipLog:true and logged nothing, and AI_AGENT_ALL routes most typed text there.';

-- ── 2. Founder notices that persist until dismissed ──────────────────────────
-- The sfb-* feedback card remembers its state in localStorage, which is
-- per-device and auto-minimizes. A notice announcing a fix has to survive a
-- reload and a second device, and go away only when the person says so.
create table if not exists public.user_notices (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         text not null,
  payload      jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  dismissed_at timestamptz
);

create index if not exists user_notices_open_idx
  on public.user_notices (user_id, created_at desc)
  where dismissed_at is null;

alter table public.user_notices enable row level security;

drop policy if exists "user_notices_own_select" on public.user_notices;
create policy "user_notices_own_select" on public.user_notices
  for select to authenticated using (user_id = auth.uid());

-- No insert policy for users on purpose: a notice is from Steven, so only an
-- admin or the service role may create one. Dismissal goes through the RPC
-- below rather than an UPDATE policy, so a client cannot edit kind/payload.
drop policy if exists "user_notices_admin_all" on public.user_notices;
create policy "user_notices_admin_all" on public.user_notices
  for all to authenticated
  using (public.is_platform_admin()) with check (public.is_platform_admin());

grant select on public.user_notices to authenticated;

drop function if exists public.dismiss_notice(uuid);
create function public.dismiss_notice(p_id uuid)
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  if auth.uid() is null then
    raise exception 'auth required' using errcode = '42501';
  end if;
  update public.user_notices
     set dismissed_at = now()
   where id = p_id and user_id = auth.uid() and dismissed_at is null;
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;

revoke all on function public.dismiss_notice(uuid) from public, anon;
grant execute on function public.dismiss_notice(uuid) to authenticated;

-- ── 3. The request RPC ───────────────────────────────────────────────────────
-- Returns one verdict per input keyword rather than a blanket "terkirim", so
-- the form can answer honestly per row. `already_live` is doing real work: it
-- catches the matching-failure class (a user asking for "PEELER SERBAGUNA"
-- when we already carry "alat kupas buah serbaguna") and turns a request into
-- an immediate answer instead of a pointless scrape.
--
-- The brand guard deserves its reasoning. uncovered_searches is dominated by
-- bare brand names — rayban, philips sbm200, logitech group, skechers, tangzu,
-- sacheu — which are worthless as scrape keywords because Shopee search on a
-- brand returns that brand's resellers, not a market. Rather than ship a brand
-- list that would need endless maintenance, a request is rejected when NOT ONE
-- of its words appears as a word anywhere in the existing 6,120-keyword corpus.
-- A real Indonesian product noun ("kerudung", "sendok", "selai") almost always
-- appears somewhere; a foreign brand or model number does not. So "rayban" and
-- "philips sbm200" are both rejected, while "rayban kacamata hitam" is accepted
-- on the strength of "kacamata" — the brand is then just a modifier on a market
-- we understand. Checking every token rather than only single-word queries is
-- what catches the brand+model shape, which is the most common form in the log.
drop function if exists public.request_scrape_keywords(text[], text, text, text);
create function public.request_scrape_keywords(
  p_keywords text[],
  p_wa       text default null,
  p_source   text default 'chat',
  p_category text default ''
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_uid      uuid := auth.uid();
  v_kw       text;
  v_norm     text;
  v_verdict  text;
  v_out      jsonb := '[]'::jsonb;
  v_recent   int;
  v_accepted int := 0;
  v_wa       text := nullif(btrim(coalesce(p_wa, '')), '');
  v_cat      text := coalesce(nullif(btrim(p_category), ''), '');
begin
  if v_uid is null then
    raise exception 'auth required' using errcode = '42501';
  end if;
  if p_keywords is null or cardinality(p_keywords) = 0 then
    return v_out;
  end if;

  -- Rolling 24h budget, counted once up front. Three is generous next to the
  -- ~10-30 searches a day the whole site sees, and it only limits NEW queue
  -- entries: already_live and already_queued answers stay free.
  select count(*) into v_recent
    from public.keyword_scrape_requests
   where user_id = v_uid and created_at > now() - interval '24 hours';

  foreach v_kw in array p_keywords[1:10] loop
    v_norm := regexp_replace(
                regexp_replace(lower(btrim(coalesce(v_kw, ''))), '[^a-z0-9 ]', ' ', 'g'),
                '\s+', ' ', 'g');
    v_norm := btrim(v_norm);
    v_verdict := null;

    if char_length(v_norm) < 3 or char_length(v_norm) > 60 then
      v_verdict := 'rejected_length';

    elsif not exists (
            select 1
              from unnest(string_to_array(v_norm, ' ')) as t(tok)
             where char_length(t.tok) >= 3
               and exists (select 1 from public.scrape_keywords sk
                            where sk.keyword = t.tok
                               or sk.keyword like t.tok || ' %'
                               or sk.keyword like '% ' || t.tok || ' %'
                               or sk.keyword like '% ' || t.tok)) then
      v_verdict := 'rejected_brand';

    elsif exists (select 1 from public.product_types_v p
                   where p.keyword = v_norm and p.city = 'ALL' and p.n_listings >= 3) then
      v_verdict := 'already_live';

    elsif exists (select 1 from public.scrape_keywords sk where sk.keyword = v_norm) then
      -- Queued by someone else, or by an earlier request of theirs. Still
      -- record it so they get told when it lands.
      insert into public.keyword_scrape_requests
             (user_id, keyword, result_count_at_request, notify_when_ready, notify_wa, source)
      values (v_uid, v_norm, 0, v_wa is not null, v_wa, p_source)
      on conflict do nothing;
      v_verdict := 'already_queued';

    elsif v_recent + v_accepted >= 3 then
      v_verdict := 'rate_limited';

    else
      insert into public.scrape_keywords (keyword, category, source_set, sla_days)
      values (v_norm, v_cat, 'request', 1)
      on conflict (keyword) do nothing;

      insert into public.keyword_scrape_requests
             (user_id, keyword, result_count_at_request, notify_when_ready, notify_wa, source)
      values (v_uid, v_norm, 0, v_wa is not null, v_wa, p_source)
      on conflict do nothing;

      v_accepted := v_accepted + 1;
      v_verdict  := 'queued';
    end if;

    v_out := v_out || jsonb_build_object('keyword', v_norm, 'input', v_kw, 'verdict', v_verdict);
  end loop;

  return v_out;
end $$;

revoke all on function public.request_scrape_keywords(text[], text, text, text) from public, anon;
grant execute on function public.request_scrape_keywords(text[], text, text, text) to authenticated;

-- ── 4. Fulfilment ────────────────────────────────────────────────────────────
-- "Ready" is measured against product_types_v, not scrape_keywords.last_listings,
-- because product_types_v is what the app actually reads. A keyword can be
-- scraped successfully and still not surface a market row until the matviews
-- refresh, and promising data that the user then cannot see is worse than
-- waiting a lane.
drop function if exists public.fulfill_scrape_requests();
create function public.fulfill_scrape_requests()
returns integer
language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  update public.keyword_scrape_requests r
     set status = 'ready', fulfilled_at = now()
   where r.status = 'pending'
     and exists (select 1 from public.product_types_v p
                  where p.keyword = r.keyword_norm and p.city = 'ALL' and p.n_listings >= 3);
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.fulfill_scrape_requests() from public, anon, authenticated;

-- ── 5. Admin: work the uncovered_searches list into the queue ────────────────
drop function if exists public.admin_queue_keyword(text, text);
create function public.admin_queue_keyword(p_keyword text, p_category text default '')
returns boolean
language plpgsql security definer set search_path = public as $$
declare v_norm text;
begin
  if not public.is_platform_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  v_norm := btrim(regexp_replace(
              regexp_replace(lower(btrim(coalesce(p_keyword, ''))), '[^a-z0-9 ]', ' ', 'g'),
              '\s+', ' ', 'g'));
  if char_length(v_norm) < 3 then return false; end if;
  insert into public.scrape_keywords (keyword, category, source_set, sla_days)
  values (v_norm, coalesce(nullif(btrim(p_category), ''), ''), 'request', 1)
  on conflict (keyword) do nothing;
  return true;
end $$;

drop function if exists public.admin_retire_keyword(text);
create function public.admin_retire_keyword(p_keyword text)
returns boolean
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_platform_admin() then
    raise exception 'admin only' using errcode = '42501';
  end if;
  -- Retire rather than delete: claim_scrape_keywords filters on active, and
  -- keeping the row preserves the reason it was ever added.
  update public.scrape_keywords
     set active = false, retire_reason = 'admin: not a useful market'
   where keyword = btrim(lower(p_keyword));
  return found;
end $$;

revoke all on function public.admin_queue_keyword(text, text) from public, anon;
revoke all on function public.admin_retire_keyword(text) from public, anon;
grant execute on function public.admin_queue_keyword(text, text) to authenticated;
grant execute on function public.admin_retire_keyword(text) to authenticated;

-- ── 6. Daily fulfilment sweep ────────────────────────────────────────────────
-- 02:30 WIB (19:30 UTC), after the daily lane and the matview refresh. The
-- WhatsApp send is a separate edge function so a Fonnte outage cannot stop
-- requests being marked ready.
select cron.unschedule('fulfill-scrape-requests')
 where exists (select 1 from cron.job where jobname = 'fulfill-scrape-requests');
select cron.schedule('fulfill-scrape-requests', '30 19 * * *',
                     $cron$select public.fulfill_scrape_requests();$cron$);

notify pgrst, 'reload schema';

-- ── 7. WhatsApp sender cron (applied live with the real key) ─────────────────
-- Same convention as 20260529000000_schedule_analyze_feedback.sql: the key is
-- redacted here and the live job carries the real one. Runs 30 minutes after
-- the fulfilment sweep so it only ever sees rows that are already 'ready'.
-- The edge function also calls fulfill_scrape_requests() itself, so a missed
-- sweep self-heals rather than stranding a request.
--
-- select cron.schedule('scrape-request-notify', '0 20 * * *', $$
--   select net.http_post(
--     url     := 'http://kong:8000/functions/v1/scrape-request-notify',
--     headers := '{"Content-Type": "application/json", "Authorization": "Bearer REDACTED_SEE_INFRA_ENV"}'::jsonb,
--     body    := '{}'::jsonb
--   )
-- $$);
