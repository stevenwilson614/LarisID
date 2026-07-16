-- Enforce the 3-new-chats/WIB-day cap at the RLS layer too. gpt_new_chat()
-- (security definer, owner bypasses RLS) stays the sanctioned path with the
-- friendly reset_at payload; a direct insert now hits the same ceiling instead
-- of sidestepping it.
drop policy if exists gpt_chats_own on public.gpt_chats;

create policy gpt_chats_select_own on public.gpt_chats
  for select using (auth.uid() = user_id);

create policy gpt_chats_update_own on public.gpt_chats
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy gpt_chats_delete_own on public.gpt_chats
  for delete using (auth.uid() = user_id);

create policy gpt_chats_insert_capped on public.gpt_chats
  for insert with check (
    auth.uid() = user_id
    and (
      select count(*) from public.gpt_chats c2
      where c2.user_id = auth.uid()
        and (c2.created_at at time zone 'Asia/Jakarta')::date
            = (now() at time zone 'Asia/Jakarta')::date
    ) < 3
  );
