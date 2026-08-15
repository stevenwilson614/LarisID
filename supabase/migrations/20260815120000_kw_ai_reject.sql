-- AI cover/gallery rejects. Separate from is_offtopic (token / is_ad Rule A)
-- so a bad model run is reversible without rebuilding listings_deduped.

create table if not exists public.kw_ai_reject (
  keyword    text        not null,
  item_id    bigint      not null,
  shop_id    bigint      not null,
  rejected   boolean     not null,
  reason     text,
  model      text,
  created_at timestamptz not null default now(),
  primary key (keyword, item_id, shop_id)
);

comment on table public.kw_ai_reject is
  'Per-type AI flags for cover/gallery only. Does not change is_offtopic, membership, or price stats.';

create index if not exists kw_ai_reject_rejected_idx
  on public.kw_ai_reject (keyword)
  where rejected;

alter table public.kw_ai_reject enable row level security;

notify pgrst, 'reload schema';
