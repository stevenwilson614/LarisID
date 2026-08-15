-- Feature board: authors may edit/delete their own posts and comments;
-- platform admins may change status (open / considering / done) and moderate.
-- Status values stay as stored: open = Baru, considering = Dikerjakan, done = Selesai.

alter table public.feature_requests
  add column if not exists updated_at timestamptz not null default now();

alter table public.feature_request_comments
  add column if not exists updated_at timestamptz not null default now();

create or replace function public.fr_guard_update()
returns trigger
language plpgsql
as $$
begin
  if new.author_id is distinct from old.author_id then
    new.author_id := old.author_id;
  end if;
  if new.status is distinct from old.status and not public.is_platform_admin() then
    new.status := old.status;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists fr_guard_update_trg on public.feature_requests;
create trigger fr_guard_update_trg
  before update on public.feature_requests
  for each row execute function public.fr_guard_update();

create or replace function public.frc_guard_update()
returns trigger
language plpgsql
as $$
begin
  if new.author_id is distinct from old.author_id then
    new.author_id := old.author_id;
  end if;
  if new.request_id is distinct from old.request_id then
    new.request_id := old.request_id;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists frc_guard_update_trg on public.feature_request_comments;
create trigger frc_guard_update_trg
  before update on public.feature_request_comments
  for each row execute function public.frc_guard_update();

drop policy if exists fr_update_own on public.feature_requests;
create policy fr_update_own on public.feature_requests
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists fr_update_admin on public.feature_requests;
create policy fr_update_admin on public.feature_requests
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists fr_delete_own on public.feature_requests;
create policy fr_delete_own on public.feature_requests
  for delete to authenticated
  using (author_id = auth.uid());

drop policy if exists fr_delete_admin on public.feature_requests;
create policy fr_delete_admin on public.feature_requests
  for delete to authenticated
  using (public.is_platform_admin());

drop policy if exists frc_update_own on public.feature_request_comments;
create policy frc_update_own on public.feature_request_comments
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists frc_update_admin on public.feature_request_comments;
create policy frc_update_admin on public.feature_request_comments
  for update to authenticated
  using (public.is_platform_admin())
  with check (public.is_platform_admin());

drop policy if exists frc_delete_own on public.feature_request_comments;
create policy frc_delete_own on public.feature_request_comments
  for delete to authenticated
  using (author_id = auth.uid());

drop policy if exists frc_delete_admin on public.feature_request_comments;
create policy frc_delete_admin on public.feature_request_comments
  for delete to authenticated
  using (public.is_platform_admin());

grant select, insert, update, delete on public.feature_requests to authenticated;
grant select, insert, update, delete on public.feature_request_comments to authenticated;
