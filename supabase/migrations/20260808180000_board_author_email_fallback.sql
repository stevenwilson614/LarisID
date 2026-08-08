-- Fallback display name when a user hasn't set first_name yet: use the
-- local part of their email (before @) instead of a generic "Pengguna
-- LarisID" — reads more like a real forum username. Still never exposes the
-- full email, and still never trusted from the client (server-set in the
-- same BEFORE INSERT trigger as before).
create or replace function public.fr_set_author_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fname text;
  fcity text;
  favatar text;
  femail text;
begin
  select nullif(trim(first_name), ''), nullif(trim(city), ''), headshot_url
  into fname, fcity, favatar
  from public.user_profiles
  where user_id = new.author_id;

  if fname is null then
    select split_part(email, '@', 1) into femail
    from auth.users
    where id = new.author_id;
  end if;

  new.author_first_name := coalesce(fname, femail, 'Pengguna LarisID');
  new.author_city := coalesce(fcity, '');
  new.author_headshot_url := favatar;
  return new;
end;
$$;

-- Backfill the three rows already seeded under the generic fallback.
update public.feature_requests fr
set author_first_name = split_part(u.email, '@', 1)
from auth.users u
where fr.author_id = u.id
  and fr.author_first_name = 'Pengguna LarisID';

update public.feature_request_comments fc
set author_first_name = split_part(u.email, '@', 1)
from auth.users u
where fc.author_id = u.id
  and fc.author_first_name = 'Pengguna LarisID';
