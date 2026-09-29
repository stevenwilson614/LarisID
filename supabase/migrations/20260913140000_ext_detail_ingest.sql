-- Extension-supplied product detail passes.
--
-- WHY. The extension already intercepts /api/v4/pdp/get_pc to draw its omset
-- panel, and that payload carries description, attributes, categories, images,
-- tier_variations, models and the rating breakdown -- i.e. everything
-- product_details is made of. v3.0 was extracting only the listings-shaped
-- fields and discarding the rest, while product_details held 996 rows and
-- item_detail_queue sat on 177 pending items waiting for exactly this. A
-- product a user opens is a detail pass already paid for.
--
-- SHAPE. Same posture as 20260913120000: staging with NO anon grant, one
-- validating SECURITY DEFINER RPC that anon may execute, and a service_role
-- merge. Detail is per-item (product_details is keyed on item_id alone), so
-- the merge upserts rather than appending.
--
-- THE QUEUE DRAINS ITSELF. fulfill_item_detail_requests() already marks
-- item_detail_queue done, and item_detail_requests 'ready', for any item that
-- gains a product_details row with fetch_status='ok' and detail_scraped_at >=
-- last_queued_at. merge_ext_detail() just calls it, so one user opening a
-- product can fulfil another user's queued request and trigger their notice.
--
-- WHAT THIS STILL DOES NOT DO. Nothing here produces a per-variant sales
-- figure. models_json carries sold and stock as nulls because Shopee's PDP
-- payload has never returned them non-null (0 of 1,675 models in the June
-- pilot). They are stored as documentation of that fact, not as data.

begin;
set local statement_timeout to '600s';

create table if not exists public.ext_detail_ingest (
  id                    bigint      generated always as identity primary key,
  install_id            uuid        not null,
  item_id               bigint      not null,
  shop_id               bigint,
  detail_scraped_at     timestamptz not null,
  product_name          text,
  description           text,
  hashtags              text,
  attributes_json       jsonb,
  categories_json       jsonb,
  brand                 text,
  condition             text,
  preorder_days         integer,
  images_json           jsonb,
  video_count           integer,
  tier_variations_json  jsonb,
  models_json           jsonb,
  rating_breakdown_json jsonb,
  liked_count           integer,
  comment_count         integer,
  ctime                 timestamptz,
  shop_location         text,
  received_at           timestamptz not null default now(),
  merged_at             timestamptz,
  reject_reason         text
);

-- Detail passes are rate-limited separately from listing rows: one is per
-- product opened, the other per results page, and the sane daily ceilings
-- differ by two orders of magnitude.
alter table public.ext_installs
  add column if not exists details_today integer not null default 0,
  add column if not exists details_total bigint  not null default 0;

comment on table public.ext_detail_ingest is
  'Staging for PDP detail passes the Chrome extension captured from product '
  'pages a user opened. Promoted into product_details by merge_ext_detail() '
  'for items already known to listings. Never read by the frontend.';

create index if not exists ext_detail_ingest_unmerged_idx
  on public.ext_detail_ingest (received_at)
  where merged_at is null and reject_reason is null;
create index if not exists ext_detail_ingest_item_idx
  on public.ext_detail_ingest (item_id, detail_scraped_at desc);

alter table public.ext_detail_ingest enable row level security;
revoke all on table public.ext_detail_ingest from public, anon, authenticated;
grant select on table public.ext_detail_ingest to service_role;

-- Which collector produced a detail row. push_details.py already writes
-- 'raw_cdp' / 'reparse'; extension rows land as 'ext'.
comment on column public.product_details.source is
  'raw_cdp | reparse | ext. Which collector produced the row.';

notify pgrst, 'reload schema';
commit;
