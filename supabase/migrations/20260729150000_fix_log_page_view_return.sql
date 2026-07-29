-- log_page_view was returning void and PostgREST answered 204 without a
-- reliable insert on some pools (anon callers saw success, page_views stayed
-- empty — including every /gpt/ hit). Return jsonb so the client can confirm
-- the row landed, and re-grant execute to anon/authenticated.
--
-- Apply on BOTH the linked cloud project AND Contabo (api.larisid.com) —
-- they do not share a schema cache / function body today.

drop function if exists public.log_page_view(text, text, text, text, text, boolean);

create function public.log_page_view(
  p_visitor_id     text,
  p_session_id     text default null,
  p_path           text default null,
  p_referrer       text default null,
  p_utm_source     text default null,
  p_is_new_session boolean default false
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
    (visitor_id, session_id, path, referrer, utm_source, is_new_session, user_id)
  values
    (left(p_visitor_id, 64), left(p_session_id, 64), left(p_path, 200),
     left(p_referrer, 300), left(p_utm_source, 80), coalesce(p_is_new_session, false),
     auth.uid())
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id, 'path', p_path);
end;
$$;

alter function public.log_page_view(text, text, text, text, text, boolean) owner to postgres;
revoke all on function public.log_page_view(text, text, text, text, text, boolean) from public;
grant execute on function public.log_page_view(text, text, text, text, text, boolean) to anon, authenticated;

notify pgrst, 'reload schema';
