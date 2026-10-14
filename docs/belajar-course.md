# Belajar — seller course in the SPA

Free, self-paced course. The side tab, Beranda strip, and `#view-belajar` are platform-admin only for now (`isPlatformAdmin()`). Logged-out visitors and other accounts do not see them, and `belajar_course`, `belajar_mark_lesson`, `belajar_set_state`, `belajar_save_draft`, `belajar_set_baseline`, `belajar_link_shop`, and `belajar_set_reported_omset` return `admin_only`. It lives in the main app (`#btn-belajar`, `#view-belajar`, `js/gpt-belajar.js`), not in the Anton school prototype and not in cohort `milestone_content`.

Goal: four steps from an idea to a linked shop, then watching competitors. The funnel records who starts with no store or no sales and later has a linked shop whose Laris listing data reaches about Rp 3 juta omset per month.

## Layout

Four dots on top are the four modules. A dot is filled when every applicable lesson in that module is done. The ring is the module you are in. Tap a dot to open that module’s first open applicable lesson.

Desktop: lesson in the center, curriculum on the right (title, percent, accordion, durations). Mobile (under 900px): short labels on the dots, a Materi sheet instead of the rail, and a sticky bar with Tandai selesai and Lanjut.

Tabs on a lesson: **Tentang** (outcomes) and **Materi** (body + widget). **Diskusi** opens Komunitas Diskusi with an editable draft. It does not auto-post and it is not a second forum.

A lesson shows a YouTube player only when `url` (or, on the platform lessons, a resource whose name matches that platform) is a real YouTube URL. There is no empty player and no invented video id.

## Tracks and baseline

The course overview has one optional choice. Skip leaves `baseline = unknown`.

| Baseline | Track | What counts |
|---|---|---|
| `no_store` | `new` | Every published lesson whose platform is empty or one they checked |
| `no_sales` or `has_sales` | `existing` | Modules with `sort_order` ≥ 3 (Pilih tempat jual and Pantau), plus earlier lessons they actually mark done |
| `unknown` | whatever was inferred on first visit | Same rule as that track |

Nothing is hidden. Steps 1–2 stay readable for people who already have a store. Skipping a lesson removes it from the count. It is not marked done.

The first visit still saves a suggestion when there is no row yet: `existing` when onboarding `seller_status` is `existing` or a shop URL is already stored, otherwise `new`. Platforms default to linked shops (`tiktok_shop` maps to `tiktok`) or Shopee. Choosing a baseline overwrites the track. Platform chips do not change the baseline.

## Verify keys

`belajar_course()` stamps `done` when the product already shows the step. A lesson the user marked `skipped` stays skipped. A `draft` is upgraded to `done` when the signal becomes true. Tandai selesai is the only control that advances to the next lesson.

| Key | Done when |
|---|---|
| `ide` | `user_journey_stats.deepdive_count` ≥ 1, or the idea analysis was run (`listing_draft.analysis.ran`) |
| `pra` | pra-listing title is non-empty |
| `kalk` | a `gpt_kalc_save_riwayat` activity event, or a `gpt_chats` row with `context.kind = kalkulator` |
| `diskusi` | this account has a `feature_requests` row with `kind = question` |
| `store` | `user_profiles.public_shopee_url` / `shopee_store_url`, or an active `student_account` shop with a URL |
| `watch` | at least one `user_tracked_products` row, or one manual competitor note in the draft |
| `deepdive` | kept for unpublished lessons: deep dive ≥ 1 |
| `favorit3` | kept for unpublished lessons: favorites ≥ 3 |
| `pantau` | kept for unpublished lessons: favorites ≥ 3 and `user_tracker_state.notify_channels` is not empty |

There is no paywall and no lock that blocks reading the next lesson. Do not mark a step done unless the learner did it or the verify signal is true. Notification channels are not required for `watch`.

## Modules

Unpublished lessons stay in the database so old progress rows are not deleted. They leave the learner count.

1. **Cari produk**
   - `ide-produk` — two cards. **Punya ide:** name (required to analyze), description, optional cost and sell price. Analisis uses `searchListings` and shows the rows that came back: count, price vs the median of that sample, omset p25–p75 labeled perkiraan, and frequent title words. Empty search says so and offers Cari Produk. No single “you will earn Rp X”. **Belum punya ide:** opens Cari Produk. Done on analysis or an existing Deep Dive.
   - `pra-listing` — title, description, optional photo (local preview only; not uploaded), SKU yes/no plus variation names. Suggestions come from the competitor titles just retrieved. Tanya Laris AI opens chat with that draft and those rows and an instruction not to invent sold or omset. Done when a title is saved.
2. **Sumber produk**
   - `hitung-modal` — opens the calculator prefilled from the pra-listing (`price`, `cogs`). Fee, ongkir, iklan, and retur are part of modal. Rp 3 juta on the shop lesson is gross omset, not profit.
   - `mulai-sourcing` — pasar lokal, 1688, and Alibaba. 1688 and Alibaba are import routes, not a way around customs. Sample, MOQ, lead time, and bea stay in the copy. Video only when a real URL is stored.
   - `tanya-sumber` — Komunitas draft the person edits and posts themselves. Verify only if this account has posted a question.
3. **Pilih tempat jual** — Shopee, Tokopedia, Lazada, and TikTok Shop. One switcher, stored by adding the platform to `user_course_state.platforms`. Content of the first two lessons swaps; the rail stays three sections.
   - `cara-mulai` — how to open the seller account, official education links, and a KTP plus rekening checklist. Video only from a real YouTube URL.
   - `listing-pertama` — checklist mapped from the pra-listing. Tokopedia and TikTok Shop Indonesia share a Seller Center. A short block covers the first week (reply time, packing, complaints).
   - `tautan-toko` — paste the shop URL. Calls `belajar_link_shop`, which uses `ssis_link_shop`. Then the page shows what Laris actually knows.
4. **Pantau**
   - `pantau-kompetitor` — Favorit already saved, plus a form for competitor product URLs. A Shopee URL we can resolve (`-i.SHOP.ITEM` or `/product/SHOP/ITEM` in `listings_deduped`) becomes a real Favorit via `trackProductFavorite`. A URL we cannot resolve is stored as “kamu yang mencatat” with no invented sales. Done when at least one real Favorit or one manual note exists.

External links are official seller-education pages from the seed, plus `/cara-kerja/`, `/kalkulator/biaya-shopee/`, and `/kalkulator/margin-hpp/`. Photo-rights and SKU-stock warnings live on `pra-listing`.

## Outcome: about Rp 3 juta / month

“3 juta coming in” is **omset kotor**, not profit. Profit stays on the calculator.

`user_seller_outcomes` is written when a shop URL is linked: user, platform, url, shop ref, baseline, `linked_at`. One row per user. Changing the URL clears the previous omset, the self-reported number, and `reached_3jt_at`.

Omset refresh runs on link and from Admin → Belajar (no new crawler):

- Shopee shop id that already appears in `listings_deduped`: sum of `nowcast_omset_monthly` for distinct on-topic `item_id`s, labeled perkiraan. The UI says this is only listings we have, not the whole shop.
- `reached_3jt_at` is set only when that Laris sum is at least Rp 3.000.000. Once set, it stays until the shop URL changes.
- `est_listing_n = 0` is “belum ada data Laris”, not zero sales.
- Lazada, Tokopedia, TikTok, and a Shopee URL with no numeric shop id are recorded. Their Laris omset stays empty.
- `reported_omset_idr` is the learner’s own number. It never sets `reached_3jt_at`.

Admin → Belajar shows baseline → URL linked → reached 3jt, including linked and reached counts for `no_store` and `no_sales`.

Large drafts live in `user_course_state.listing_draft` (cleaned by `belajar_clean_draft`, max 24k). They are not stuffed into lesson answers.

## Editing

Admin → **Belajar — kurikulum** edits title, URL, body, points, resources, questions, action JSON, platform, and tayang. Counts are people who marked `done` or `skipped`.

Interactive widgets are keyed by lesson slug in `js/gpt-belajar.js`. Changing the slug in admin detaches the widget.

```bash
bash scripts/apply-selfhost.sh supabase/migrations/20261014180000_belajar_curriculum_v2.sql
```

Never `supabase db push --linked`.

Do not re-apply `supabase/migrations/20261014120000_belajar_course.sql` after the v2 file. That file’s `belajar_course()` does not know baseline, listing draft, or shop outcomes, and it puts the five-module seed back. Re-applying the v2 file overwrites v2 lesson copy for the same slugs.

## Events

`belajar_open`, `belajar_lesson_open`, `belajar_lesson_done`, `belajar_action_click`, `belajar_track_set`, `belajar_analysis`, `belajar_shop_linked`, `belajar_baseline`.
