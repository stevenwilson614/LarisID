-- Bell inbox: opening the lonceng marks notices read, it does not delete them.
-- read_at is the unread badge; dismissed_at stays for the founder card only.

alter table public.user_notices
  add column if not exists read_at timestamptz;

update public.user_notices
   set read_at = dismissed_at
 where read_at is null
   and dismissed_at is not null;

create index if not exists user_notices_unread_idx
  on public.user_notices (user_id, created_at desc)
  where read_at is null;

create index if not exists user_notices_user_created_idx
  on public.user_notices (user_id, created_at desc);

drop function if exists public.mark_notices_read();
create function public.mark_notices_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_n int;
begin
  if auth.uid() is null then
    raise exception 'auth required' using errcode = '42501';
  end if;
  update public.user_notices
     set read_at = now()
   where user_id = auth.uid()
     and read_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

revoke all on function public.mark_notices_read() from public, anon;
grant execute on function public.mark_notices_read() to authenticated;

-- Old clients still call this on bell-open. Keep the name, stop wiping the inbox.
drop function if exists public.dismiss_notices_open();
create function public.dismiss_notices_open()
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  return public.mark_notices_read();
end $$;

revoke all on function public.dismiss_notices_open() from public, anon;
grant execute on function public.dismiss_notices_open() to authenticated;

drop function if exists public.dismiss_notice(uuid);
create function public.dismiss_notice(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_n int;
begin
  if auth.uid() is null then
    raise exception 'auth required' using errcode = '42501';
  end if;
  update public.user_notices
     set dismissed_at = coalesce(dismissed_at, now()),
         read_at = coalesce(read_at, now())
   where id = p_id and user_id = auth.uid();
  get diagnostics v_n = row_count;
  return v_n > 0;
end $$;

revoke all on function public.dismiss_notice(uuid) from public, anon;
grant execute on function public.dismiss_notice(uuid) to authenticated;
