-- Site B (LARISgpt): platform admins/leaders bypass the 3-new-chats/WIB-day cap.
-- Mirrors _usage_is_privileged() used by use_dive / use_ai on site A.

create or replace function public.gpt_new_chat(p_title text, p_context jsonb default '{}'::jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me         uuid := auth.uid();
  v_day        date;
  v_count      integer;
  v_reset_at   timestamptz;
  v_chat       public.gpt_chats%rowtype;
  v_privileged boolean;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;

  v_day := (now() at time zone 'Asia/Jakarta')::date;
  v_reset_at := ((v_day + 1)::timestamp at time zone 'Asia/Jakarta');
  v_privileged := public._usage_is_privileged();

  select count(*)::integer into v_count
  from public.gpt_chats
  where user_id = v_me
    and (created_at at time zone 'Asia/Jakarta')::date = v_day;

  if not v_privileged and v_count >= 3 then
    return json_build_object(
      'allowed', false,
      'reason', 'limit_reached',
      'used', v_count,
      'limit', 3,
      'reset_at', v_reset_at,
      'seconds_until_reset', greatest(1, extract(epoch from (v_reset_at - now()))::int)
    );
  end if;

  insert into public.gpt_chats (user_id, title, context)
  values (
    v_me,
    coalesce(nullif(trim(p_title), ''), 'Chat baru'),
    coalesce(p_context, '{}'::jsonb)
  )
  returning * into v_chat;

  return json_build_object(
    'allowed', true,
    'unlimited', v_privileged,
    'used', v_count + 1,
    'limit', case when v_privileged then null else 3 end,
    'reset_at', v_reset_at,
    'seconds_until_reset', greatest(1, extract(epoch from (v_reset_at - now()))::int),
    'chat', json_build_object(
      'id', v_chat.id,
      'title', v_chat.title,
      'context', v_chat.context,
      'created_at', v_chat.created_at
    )
  );
end;
$$;

revoke all on function public.gpt_new_chat(text, jsonb) from public;
grant execute on function public.gpt_new_chat(text, jsonb) to authenticated;

-- RLS insert path: same privilege bypass (direct inserts + definer still OK)
drop policy if exists gpt_chats_insert_capped on public.gpt_chats;

create policy gpt_chats_insert_capped on public.gpt_chats
  for insert with check (
    auth.uid() = user_id
    and (
      public._usage_is_privileged()
      or (
        select count(*) from public.gpt_chats c2
        where c2.user_id = auth.uid()
          and (c2.created_at at time zone 'Asia/Jakarta')::date
              = (now() at time zone 'Asia/Jakarta')::date
      ) < 3
    )
  );
