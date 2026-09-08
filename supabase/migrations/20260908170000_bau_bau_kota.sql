-- Bau Bau as a selectable kota: map listings from Bau-Bau + closest bigger
-- Sulawesi markets (Kendari, Makassar) for city weekly recs / location filters.
-- product_types_v still has no Bau Bau hub — client knownCityBucket → Makassar.

insert into public.city_location_map (city, loc) values
  ('Bau Bau', 'Bau-Bau'),
  ('Bau Bau', 'Bau Bau'),
  ('Bau Bau', 'Kota Bau-Bau'),
  ('Bau Bau', 'Kota Bau Bau'),
  ('Bau Bau', 'Kendari'),
  ('Bau Bau', 'Kota Kendari'),
  ('Bau Bau', 'Makassar'),
  ('Bau Bau', 'Kota Makassar')
on conflict (city, loc) do nothing;

-- Delta Amelia + Muh Yun (two most recent Bau-Bau cohort signups) → Bau Bau.
insert into public.user_onboarding_prefs (user_id, region, updated_at)
values
  ('7dd20ffa-1d92-4c9c-92dd-13f6b4040669', 'Bau Bau', now()),
  ('fe73176e-ab11-40de-9691-0c9047977a08', 'Bau Bau', now())
on conflict (user_id) do update
set region = excluded.region,
    updated_at = excluded.updated_at;

insert into public.user_profiles (user_id, city, updated_at)
values
  ('7dd20ffa-1d92-4c9c-92dd-13f6b4040669', 'Bau Bau', now()),
  ('fe73176e-ab11-40de-9691-0c9047977a08', 'Bau Bau', now())
on conflict (user_id) do update
set city = excluded.city,
    updated_at = excluded.updated_at;
