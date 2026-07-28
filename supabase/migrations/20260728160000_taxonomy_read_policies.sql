-- category_map and keyword_subgroup are public reference data (the category
-- taxonomy the UI renders its chips from), but this box auto-enables RLS on new
-- tables in `public`. With RLS on and no policy, the GRANT is irrelevant and
-- anon reads return zero rows — the chips silently fell back to the old
-- hardcoded list instead of erroring, which is exactly how this would have
-- shipped unnoticed.
--
-- Read-only for everyone; writes stay restricted to the SECURITY DEFINER
-- rebuild function and migrations.

alter table public.category_map     enable row level security;
alter table public.keyword_subgroup enable row level security;

drop policy if exists category_map_read on public.category_map;
create policy category_map_read on public.category_map
  for select to anon, authenticated using (true);

drop policy if exists keyword_subgroup_read on public.keyword_subgroup;
create policy keyword_subgroup_read on public.keyword_subgroup
  for select to anon, authenticated using (true);
