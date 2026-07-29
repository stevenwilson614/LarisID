-- Cross-chat memory for the AI.
--
-- Every AI turn on Site B sends exactly one message: js/gpt-app.js calls
-- _mlsAIRaw(system, [{role:'user', content:text}]). No prior turns, no facts.
-- So "modal saya 500rb" is understood in that reply and gone by the next chat —
-- the user has to repeat themselves every time.
--
-- Two layers fix that: the client now sends a trailing window of the current
-- thread, and this table holds the durable facts worth carrying across threads.
--
-- MISSION.md is binding here: memory must be visible and deletable by the
-- person it describes. Hence own-row RLS including DELETE, and a prefs-drawer
-- surface on the client. Keys are allowlisted so this cannot drift into
-- open-ended profiling.

create table if not exists public.user_ai_memory (
  user_id    uuid not null references auth.users(id) on delete cascade,
  key        text not null,
  value      text not null,
  source     text,                       -- 'onboarding' | 'chat' | 'manual'
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create index if not exists idx_user_ai_memory_user on public.user_ai_memory (user_id, updated_at desc);

alter table public.user_ai_memory enable row level security;

drop policy if exists user_ai_memory_select on public.user_ai_memory;
create policy user_ai_memory_select on public.user_ai_memory
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists user_ai_memory_delete on public.user_ai_memory;
create policy user_ai_memory_delete on public.user_ai_memory
  for delete to authenticated using (auth.uid() = user_id);

-- Writes go through the RPC so the allowlist is enforced server-side.
create or replace function public.upsert_my_memory(p_key text, p_value text, p_source text default 'chat')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text := lower(btrim(coalesce(p_key, '')));
  v_val text := btrim(coalesce(p_value, ''));
begin
  if auth.uid() is null then return; end if;
  -- Allowlist: commerce facts that make advice better. Nothing else is stored.
  if v_key not in ('modal','kota','kategori','pengalaman','target_margin','platform','produk_fokus') then
    return;
  end if;
  if v_val = '' or length(v_val) > 200 then return; end if;

  insert into public.user_ai_memory (user_id, key, value, source, updated_at)
  values (auth.uid(), v_key, v_val, nullif(btrim(coalesce(p_source,'')), ''), now())
  on conflict (user_id, key) do update
    set value = excluded.value, source = excluded.source, updated_at = now();
end; $$;

revoke all on function public.upsert_my_memory(text, text, text) from public;
grant execute on function public.upsert_my_memory(text, text, text) to authenticated;

create or replace function public.forget_my_memory(p_key text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.user_ai_memory
  where user_id = auth.uid() and key = lower(btrim(coalesce(p_key, '')));
$$;

revoke all on function public.forget_my_memory(text) from public;
grant execute on function public.forget_my_memory(text) to authenticated;

-- This box re-grants EXECUTE broadly via default privileges, so the earlier
-- REVOKE ... FROM PUBLIC is not sufficient on its own. Revoke anon explicitly:
-- the auth.uid() guard inside each function already makes an anon call a no-op,
-- but the grant should not imply otherwise.
revoke execute on function public.upsert_my_memory(text, text, text) from anon;
revoke execute on function public.forget_my_memory(text) from anon;
