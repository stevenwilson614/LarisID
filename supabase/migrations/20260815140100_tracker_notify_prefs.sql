-- ============================================================================
-- How a user wants to hear about changes in the markets they track.
--
-- Stored on user_tracker_state, i.e. PER USER — same placement and same shape
-- as the existing `metrics text[]`, for the same reason: the question is asked
-- once at the end of the tracking page, not per keyword.
--
-- This replaces user_tracked_products.alert_prefs, which is unusable here: it
-- is per-PRODUCT, and product tracking has taken zero new rows since the
-- 2026-08-10 cutover. Its `whatsapp`/`competitors`/`triggers` fields were
-- written by the retired Site A and read by nothing.
--
-- Capability, not just preference: a user can only be reached on a channel we
-- have an address for. Verified 2026-08-15 — 3 of 28 profiles have any
-- WhatsApp number and only 1 of them tracks anything — so selecting
-- 'whatsapp' REQUIRES a number and is rejected without one.
-- ============================================================================

begin;

create or replace function public.tracker_valid_notify_channels() returns text[]
  language sql immutable as $$ select array['email','whatsapp']::text[] $$;

-- Mirrors normalisePhone() in supabase/functions/send-whatsapp-otp/index.ts.
-- Kept server-side as well so the boundary is enforced regardless of client.
-- Returns E.164 (+62…) or null when the input cannot be a valid ID mobile.
create or replace function public.normalise_wa_phone(p_raw text) returns text
language plpgsql immutable as $$
declare
  s text;
begin
  if p_raw is null then return null; end if;
  s := regexp_replace(p_raw, '[\s\-().]', '', 'g');
  if s ~ '^\+62[0-9]{8,13}$' then return s; end if;
  if s ~ '^62[0-9]{8,13}$'   then return '+' || s; end if;
  if s ~ '^0[0-9]{8,13}$'    then return '+62' || substr(s, 2); end if;
  if s ~ '^8[0-9]{7,12}$'    then return '+62' || s; end if;
  return null;
end $$;

alter table public.user_tracker_state
  add column if not exists notify_channels  text[] not null default '{}'::text[],
  add column if not exists notify_wa_number text,
  add column if not exists notify_asked_at  timestamptz;

-- Unlike `metrics` there is no cardinality floor: an empty array is a
-- meaningful state here, it means "do not notify me".
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'user_tracker_state_notify_channels_valid'
  ) then
    alter table public.user_tracker_state
      add constraint user_tracker_state_notify_channels_valid
      check (notify_channels <@ public.tracker_valid_notify_channels());
  end if;
end $$;

comment on column public.user_tracker_state.notify_channels is
  'Delivery channels for tracked-market change alerts. Empty = no alerts. '
  'whatsapp requires notify_wa_number to be set.';
comment on column public.user_tracker_state.notify_asked_at is
  'When the user was last shown the notification question — lets the UI stop '
  'nagging someone who deliberately chose nothing.';

create or replace function public.set_tracker_notify_prefs(
  p_channels  text[] default '{}'::text[],
  p_wa_number text default null
)
returns json language plpgsql volatile security definer set search_path to 'public' as $$
declare
  v_me    uuid := auth.uid();
  v_clean text[];
  v_phone text;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  -- Intersect with the allow-list rather than trusting the payload, and dedupe.
  select coalesce(array_agg(distinct c order by c), '{}'::text[]) into v_clean
  from unnest(coalesce(p_channels, '{}'::text[])) c
  where c = any(public.tracker_valid_notify_channels());

  v_phone := public.normalise_wa_phone(p_wa_number);

  -- Fall back to any number already on the profile before rejecting, so a user
  -- who supplied one at signup is not asked twice.
  if v_phone is null then
    select public.normalise_wa_phone(coalesce(nullif(btrim(p.wa_number), ''),
                                              nullif(btrim(p.public_whatsapp), '')))
      into v_phone
    from public.user_profiles p where p.user_id = v_me;
  end if;

  -- A channel we cannot deliver on is worse than no channel: it looks enabled
  -- and silently drops every message.
  if 'whatsapp' = any(v_clean) and v_phone is null then
    return json_build_object('ok', false, 'error', 'wa_number_required');
  end if;

  insert into public.user_tracker_state (user_id, notify_channels, notify_wa_number, notify_asked_at)
  values (v_me, v_clean, v_phone, now())
  on conflict (user_id) do update
    set notify_channels  = excluded.notify_channels,
        notify_wa_number = coalesce(excluded.notify_wa_number, public.user_tracker_state.notify_wa_number),
        notify_asked_at  = now();

  return json_build_object(
    'ok', true,
    'notify_channels', v_clean,
    'notify_wa_number', v_phone
  );
end $$;

-- get_my_tracking gains the notify fields so the client renders the saved
-- answer on first paint instead of flashing an empty question.
create or replace function public.get_my_tracking()
returns json language plpgsql stable security definer set search_path to 'public' as $$
declare
  v_me uuid := auth.uid();
  v_st public.user_tracker_state%rowtype;
  v_wa text;
begin
  if v_me is null then raise exception 'not_authenticated'; end if;

  select * into v_st from public.user_tracker_state where user_id = v_me;

  -- Prefill candidate for the phone input when the user has never answered.
  select public.normalise_wa_phone(coalesce(nullif(btrim(p.wa_number), ''),
                                            nullif(btrim(p.public_whatsapp), '')))
    into v_wa
  from public.user_profiles p where p.user_id = v_me;

  return json_build_object(
    'keyword_limit', public.tracking_keyword_limit(),
    'store_limit',   public.tracking_store_limit(),
    'paused',        (v_st.paused_at is not null),
    'paused_at',     v_st.paused_at,
    'last_viewed_at',v_st.last_viewed_at,
    'metrics',       coalesce(v_st.metrics, public.tracker_default_metrics()),
    'all_metrics',   public.tracker_valid_metrics(),
    'notify_channels',   coalesce(v_st.notify_channels, '{}'::text[]),
    'all_notify_channels', public.tracker_valid_notify_channels(),
    'notify_wa_number',  coalesce(v_st.notify_wa_number, v_wa),
    'notify_asked',      (v_st.notify_asked_at is not null),
    'keywords', coalesce((
      select json_agg(json_build_object(
               'id', k.id, 'keyword', k.keyword, 'category', k.category,
               'created_at', k.created_at) order by k.created_at)
      from public.user_tracked_keywords k where k.user_id = v_me), '[]'::json),
    'stores', coalesce((
      select json_agg(json_build_object(
               'id', s.id, 'shop_id', s.shop_id, 'store_name', s.store_name,
               'created_at', s.created_at) order by s.created_at)
      from public.user_tracked_stores s where s.user_id = v_me), '[]'::json)
  );
end $$;

revoke all on function
  public.set_tracker_notify_prefs(text[], text),
  public.tracker_valid_notify_channels(),
  public.normalise_wa_phone(text)
from public, anon;

grant execute on function
  public.set_tracker_notify_prefs(text[], text),
  public.tracker_valid_notify_channels(),
  public.normalise_wa_phone(text)
to authenticated;

commit;

notify pgrst, 'reload schema';
