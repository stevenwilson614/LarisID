-- LarisExpor interest probe: the validation instrument for /expor/.
-- Anon INSERT only. No anon SELECT — emails are not a public list.
--
-- TRAP (same family as item_snapshots / the Chrome extension write path):
-- a named audit migration previously revoked anon INSERT globally, and
-- ALTER DEFAULT PRIVILEGES on this box grants EXECUTE/table rights in ways
-- `revoke from public` does not undo. Grant INSERT to anon EXPLICITLY, then
-- confirm a PostgREST insert as the anon key before shipping the form.

begin;

create table if not exists public.expor_interest (
  id         bigint generated always as identity primary key,
  email      text not null check (char_length(trim(email)) >= 5 and position('@' in email) > 1),
  need       text not null check (need in (
               'produk-harga',
               'dokumen-izin',
               'cari-buyer',
               'ongkos-kirim',
               'belum-tahu'
             )),
  note       text check (note is null or char_length(note) <= 500),
  context    text,
  user_id    uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists expor_interest_created_idx
  on public.expor_interest (created_at desc);
create index if not exists expor_interest_need_idx
  on public.expor_interest (need);

alter table public.expor_interest enable row level security;

revoke all on public.expor_interest from public, anon;

drop policy if exists expor_interest_insert on public.expor_interest;
create policy expor_interest_insert on public.expor_interest
  for insert to anon, authenticated
  with check (true);

drop policy if exists expor_interest_admin_select on public.expor_interest;
create policy expor_interest_admin_select on public.expor_interest
  for select to authenticated
  using (public.is_platform_admin());

grant insert on public.expor_interest to anon, authenticated;
grant select on public.expor_interest to authenticated;

notify pgrst, 'reload schema';

commit;
