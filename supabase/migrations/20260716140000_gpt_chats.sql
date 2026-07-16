-- LARISgpt (A/B variant B): chat sessions + server-enforced 3 new chats/day (WIB).
-- Onboarding prefs continue to use public.user_onboarding_prefs (unified with A).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.gpt_chats (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  title      text not null default 'Chat baru',
  context    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists gpt_chats_user_created_idx
  on public.gpt_chats (user_id, created_at desc);

alter table public.gpt_chats enable row level security;

drop policy if exists gpt_chats_own on public.gpt_chats;
create policy gpt_chats_own on public.gpt_chats
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create table if not exists public.gpt_messages (
  id         bigserial primary key,
  chat_id    uuid not null references public.gpt_chats(id) on delete cascade,
  role       text not null check (role in ('user', 'assistant', 'system')),
  content    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists gpt_messages_chat_created_idx
  on public.gpt_messages (chat_id, created_at);

alter table public.gpt_messages enable row level security;

drop policy if exists gpt_messages_own on public.gpt_messages;
create policy gpt_messages_own on public.gpt_messages
  for all using (
    exists (
      select 1 from public.gpt_chats c
      where c.id = gpt_messages.chat_id and c.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.gpt_chats c
      where c.id = gpt_messages.chat_id and c.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- RPC: create a new chat if under the daily limit (3 / WIB day)
-- ---------------------------------------------------------------------------

create or replace function public.gpt_new_chat(p_title text, p_context jsonb default '{}'::jsonb)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_me       uuid := auth.uid();
  v_day      date;
  v_count    integer;
  v_reset_at timestamptz;
  v_chat     public.gpt_chats%rowtype;
begin
  if v_me is null then
    raise exception 'not_authenticated';
  end if;

  v_day := (now() at time zone 'Asia/Jakarta')::date;
  v_reset_at := ((v_day + 1)::timestamp at time zone 'Asia/Jakarta');

  select count(*)::integer into v_count
  from public.gpt_chats
  where user_id = v_me
    and (created_at at time zone 'Asia/Jakarta')::date = v_day;

  if v_count >= 3 then
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
    'used', v_count + 1,
    'limit', 3,
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
