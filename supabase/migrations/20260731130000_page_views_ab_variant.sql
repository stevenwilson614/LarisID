-- ============================================================================
-- A/B tracking gap: page_views cannot identify which arm a visit belongs to.
--
-- The table had no ab_variant/ab_via, so the landing-side denominator (the
-- "signup conversion" half of the pre-committed decision rule) could only be
-- inferred from `path` ('/gpt/' = B). That inference happens to hold — the A/B
-- redirect runs in index.html's head before laris-app.js loads, so the visitor
-- sets are near-disjoint — but it cannot separate `random` B from `direct_gpt`
-- B, and the cohort rule requires excluding direct_gpt.
--
-- Adds the columns and extends log_page_view. New params are appended with
-- defaults so a cached older bundle keeps working (it just writes NULLs).
-- ============================================================================

alter table public.page_views
  add column if not exists ab_variant text,
  add column if not exists ab_via     text;

-- Arm-sliced landing counts are the primary read of this table.
create index if not exists page_views_ab_variant_created_idx
  on public.page_views (ab_variant, created_at desc);

-- Replace the 6-arg version with an 8-arg one. Drop the old signature so
-- PostgREST does not see two overloads and 300 on ambiguous calls.
drop function if exists public.log_page_view(text, text, text, text, text, boolean);

create function public.log_page_view(
  p_visitor_id     text,
  p_session_id     text default null,
  p_path           text default null,
  p_referrer       text default null,
  p_utm_source     text default null,
  p_is_new_session boolean default false,
  p_ab_variant     text default null,
  p_ab_via         text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_visitor_id is null or length(p_visitor_id) < 6 then
    return jsonb_build_object('ok', false, 'reason', 'bad_visitor');
  end if;
  insert into public.page_views
    (visitor_id, session_id, path, referrer, utm_source, is_new_session, user_id,
     ab_variant, ab_via)
  values
    (left(p_visitor_id, 64), left(p_session_id, 64), left(p_path, 200),
     left(p_referrer, 300), left(p_utm_source, 80), coalesce(p_is_new_session, false),
     auth.uid(),
     -- Only accept the three real arms; anything else is noise, not a variant.
     case when p_ab_variant in ('A', 'B', 'X') then p_ab_variant else null end,
     left(p_ab_via, 40))
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'path', p_path);
end;
$$;

alter function public.log_page_view(text, text, text, text, text, boolean, text, text)
  owner to postgres;
revoke all on function public.log_page_view(text, text, text, text, text, boolean, text, text)
  from public;
grant execute on function public.log_page_view(text, text, text, text, text, boolean, text, text)
  to anon, authenticated;

notify pgrst, 'reload schema';
