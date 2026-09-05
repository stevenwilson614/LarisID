-- Quarantine 1.5 GB July backup tables. Off-box dump first (see docs/self-host.md).
-- DROP after 7 days with no errors. Do not revive weekly_snapshots.

do $$
begin
  if to_regclass('public.listings_pre_dedupe_20260727') is not null
     and to_regclass('public._zz_drop_listings_pre_dedupe_20260727') is null then
    execute 'alter table public.listings_pre_dedupe_20260727 rename to _zz_drop_listings_pre_dedupe_20260727';
  end if;
  if to_regclass('public._listings_dedupe_keep') is not null
     and to_regclass('public._zz_drop_listings_dedupe_keep') is null then
    execute 'alter table public._listings_dedupe_keep rename to _zz_drop_listings_dedupe_keep';
  end if;
end $$;
