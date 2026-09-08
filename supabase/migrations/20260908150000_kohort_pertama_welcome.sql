-- One welcome announcement on Kohort Pertama, authored by Steven.
-- Apply: bash scripts/apply-selfhost.sh supabase/migrations/20260908150000_kohort_pertama_welcome.sql

insert into public.cohort_announcements (cohort_id, author_id, title, body)
select
  c.id,
  u.id,
  'Selamat datang',
  E'Selamat datang di Kohort Pertama.\n\nKita ketemu setiap Selasa jam 15.00 WIB. Kalau belum tahu mau jual apa, buka Cari Produk atau tanya Laris AI — mentor di sini buat bantu, bukan buat menekan.\n\n— Steven'
from public.cohorts c
join auth.users u on u.email = 'stevenwilson614@gmail.com'
where c.slug = 'kohort-pertama'
  and not exists (
    select 1 from public.cohort_announcements a
    where a.cohort_id = c.id
      and a.title = 'Selamat datang'
      and a.author_id = u.id
  );
