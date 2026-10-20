# Belajar — seller course in the SPA

Free, self-paced course, public in the main app (`#btn-belajar`, `#view-belajar`, `js/gpt-belajar.js`). The side button uses the book icon and the label Belajar. Logged-out visitors see the four-step home; Mulai and the mentor banner ask them to sign in, then resume. Signed-in learners use `belajar_course` and the other learner RPCs — those no longer return `admin_only`. Editor RPCs (`belajar_admin_overview`, `belajar_admin_save_lesson`, `belajar_admin_save_module`, `belajar_admin_progress`) stay platform-admin only. Not the Anton school prototype and not cohort `milestone_content`.

The old Edukasi page is not a second tab. `#btn-edukasi` stays hidden and `setView('edukasi')` opens Belajar. A small banner on Belajar asks “Tertarik dibimbing mentor bisnis?”. Yes writes `education_interests` through `education_submit_interest` (name, plus email or WhatsApp), so people who already said yes on Edukasi stay interested and show “Minat mentor bisnis sudah tercatat.” The old auto popup does not open.

Goal: four steps from an idea to a linked shop, then watching competitors. The funnel records who starts with no store or no sales and later has a linked shop whose Laris listing data reaches about Rp 3 juta omset per month.

## Layout

Four dots on top are the four modules. A dot is filled when every applicable lesson in that module is done. The ring is the module you are in. Tap a dot to open that module’s first open applicable lesson. Later modules and lessons stay locked until every prior applicable lesson is done — you cannot open step 4 while step 3 is unfinished. There is no Lewati / skip.

Opening page (no lesson open): hero + one card with the four steps and a single **Mulai sekarang** / **Lanjut belajar** button. No baseline or platform questions on that page. Desktop lesson view: lesson in the center, curriculum on the right. Mobile (under 900px): short labels on the dots, a Materi sheet instead of the rail, and a sticky **Lanjut ke berikutnya** bar.

No Tentang / Materi / Diskusi tabs. Body and widget sit on one page. At the bottom of every lesson: **Tanya komunitas** with an editable pre-draft; the learner opens Diskusi and sends themselves. It does not auto-post.

Primary advance control is **Lanjut ke berikutnya** (marks done and opens the next lesson). No “Materi sebelumnya / Materi berikutnya” pager.

A lesson shows a YouTube player only when `url` (or, on the platform lessons, a resource whose name matches that platform) is a real YouTube URL. There is no empty player and no invented video id.

## Tracks and baseline

The course overview has one optional choice. Skip leaves `baseline = unknown`.

| Baseline | Track | What counts |
|---|---|---|
| `no_store` | `new` | Every published lesson whose platform is empty or one they checked |
| `no_sales` or `has_sales` | `existing` | Modules with `sort_order` ≥ 3 (Pilih tempat jual and Pantau), plus earlier lessons they actually mark done |
| `unknown` | whatever was inferred on first visit | Same rule as that track |

Nothing is hidden from the rail, but locked rows are not clickable. Steps 1–2 stay readable for people who already have a store when those lessons are not applicable to their track.

The first visit still saves a suggestion when there is no row yet: `existing` when onboarding `seller_status` is `existing` or a shop URL is already stored, otherwise `new`. Platforms default to linked shops (`tiktok_shop` maps to `tiktok`) or Shopee. Choosing a baseline overwrites the track. Platform chips do not change the baseline.

## Verify keys

`belajar_course()` stamps `done` when the product already shows the step. A lesson the user marked `skipped` stays skipped. A `draft` is upgraded to `done` when the signal becomes true. **Lanjut ke berikutnya** marks the lesson done and opens the next one.

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

There is no paywall. Progress is sequential: locked modules/lessons cannot be opened early. Do not mark a step done unless the learner did it or the verify signal is true. Notification channels are not required for `watch`.

## Modules

Unpublished lessons stay in the database so old progress rows are not deleted. They leave the learner count.

1. **Cari produk**
   - `ide-produk` (**Mau jual apa?**) — single form: name (required to analyze); notes optional. Analisis searches the **name only**. Competitor cards show **photos**, a per-listing score, and an **average score /100** with a short verdict (layak dilanjut / bandingkan lagi / data tipis). The same step recommends **harga, fitur/kata judul, and deskripsi** from the sample — editable, then **Simpan rekomendasi**. `pra-listing` is unpublished and merged here (title saved still satisfies the old `pra` verify). Empty search says so. **Cari inspirasi di Cari Produk** sits under the form.
2. **Sumber produk**
   - `hitung-modal` (**Hitung modal dari harga jual**) — embeds the same `gpt-kalc` UI as the Kalkulator page (not a separate navigation). Prefills from the recommended price / cost or a tapped competitor photo chip; learner can change every field and **Simpan ke Riwayat**. Fee, ongkir, iklan, and retur are part of modal. Rp 3 juta on the shop lesson is gross omset, not profit.
   - `mulai-sourcing` — pasar lokal, 1688, and Alibaba. 1688 and Alibaba are import routes, not a way around customs. Sample, MOQ, lead time, and bea stay in the copy. Video only when a real URL is stored.
   - `tanya-sumber` — same Tanya komunitas block as other lessons, with a sourcing pre-draft. Verify only if this account has posted a question.
3. **Pilih tempat jual** — Shopee, Tokopedia, Lazada, and TikTok Shop. One switcher with marketplace logos, stored by adding the platform to `user_course_state.platforms`. Content of the first two lessons swaps; the rail stays three sections.
   - `cara-mulai` — how to open the seller account, official education links, and a KTP plus rekening checklist. Video only from a real YouTube URL.
   - `listing-pertama` — checklist mapped from the pra-listing. Tokopedia and TikTok Shop Indonesia share a Seller Center. A short block covers the first week (reply time, packing, complaints).
   - `tautan-toko` — paste the shop URL. Calls `belajar_link_shop`, which uses `ssis_link_shop`. Then the page shows what Laris actually knows.
4. **Pantau**
   - `pantau-kompetitor` — Favorit already saved, plus a form for competitor product URLs. A Shopee URL we can resolve (`-i.SHOP.ITEM` or `/product/SHOP/ITEM` in `listings_deduped`) becomes a real Favorit via `trackProductFavorite`. A URL we cannot resolve is stored as “kamu yang mencatat” with no invented sales. Done when at least one real Favorit or one manual note exists.

External links are official seller-education pages from the seed, plus `/kalkulator/biaya-shopee/` and `/kalkulator/margin-hpp/`. Unit 1 does not link `/cara-kerja/`. Photo-rights and SKU-stock warnings live on `pra-listing`.

```bash
bash scripts/apply-selfhost.sh supabase/migrations/20261014200000_belajar_unit1_refresh.sql
bash scripts/apply-selfhost.sh supabase/migrations/20261017120000_belajar_ide_score_kalc.sql
```

## Outcome: about Rp 3 juta / month

“3 juta coming in” is **omset kotor**, not profit. Profit stays on the calculator.

`user_seller_outcomes` is written when a shop URL is linked: user, platform, url, shop ref, baseline, `linked_at`. One row per user. Changing the URL clears the previous omset, the self-reported number, and `reached_3jt_at`.

Omset refresh runs on link (no new crawler):

- Shopee shop id that already appears in `listings_deduped`: sum of `nowcast_omset_monthly` for distinct on-topic `item_id`s, labeled perkiraan. The UI says this is only listings we have, not the whole shop.
- `reached_3jt_at` is set only when that Laris sum is at least Rp 3.000.000. Once set, it stays until the shop URL changes.
- `est_listing_n = 0` is “belum ada data Laris”, not zero sales.
- Lazada, Tokopedia, TikTok, and a Shopee URL with no numeric shop id are recorded. Their Laris omset stays empty.
- `reported_omset_idr` is the learner’s own number. It never sets `reached_3jt_at`.

Large drafts live in `user_course_state.listing_draft` (cleaned by `belajar_clean_draft`, max 24k). They are not stuffed into lesson answers.

## Editing

Curriculum copy is edited via SQL migrations / DB, not an Admin dashboard editor. The old **Belajar — kurikulum** admin card (module/lesson forms + stop funnel) was removed. Interactive widgets stay keyed by lesson slug in `js/gpt-belajar.js` — changing a slug detaches the widget.

```bash
bash scripts/apply-selfhost.sh supabase/migrations/20261014180000_belajar_curriculum_v2.sql
bash scripts/apply-selfhost.sh supabase/migrations/20261014200000_belajar_unit1_refresh.sql
```

Never `supabase db push --linked`.

Do not re-apply `supabase/migrations/20261014120000_belajar_course.sql` after the v2 file. That file’s `belajar_course()` does not know baseline, listing draft, or shop outcomes, and it puts the five-module seed back. Re-applying the v2 file overwrites v2 lesson copy for the same slugs — then re-apply the unit1 refresh migration.

## Visits, mentor interest, and kurikulum progress

Signed-in opens of Belajar log `belajar_page_view` once per browser session (`lid_belajar_page_view_v1`). Platform-admin and view-as sessions are not counted, same as the old Edukasi preview. Admin → **Belajar — kunjungan & minat mentor** (`education_admin_overview`) counts unique people across `edu_page_view` and `belajar_page_view`, and every row in `education_interests`. The people table is collapsed by default; each row shows kurikulum progress % from `belajar_admin_progress` (`done` / published lessons) when they pressed Mulai, and a green check when they opted into mentor interest.

`belajar_touch('mulai', slug)` runs when someone presses **Mulai sekarang** or Beranda **Mulai belajar**. It sets `user_course_state.mulai_at` once. Each lesson they then open calls `belajar_touch('open', slug)`, which sets `last_slug` / `last_at` and advances `furthest_slug` only forward. Do not backfill `mulai_at` from `started_at`.

```bash
bash scripts/apply-selfhost.sh supabase/migrations/20261017150000_belajar_public.sql
```

## Events

`belajar_page_view`, `belajar_open`, `belajar_lesson_open`, `belajar_lesson_done`, `belajar_action_click`, `belajar_track_set`, `belajar_analysis`, `belajar_shop_linked`, `belajar_baseline`. Mentor yes also logs `edu_interest` with `via: belajar`.
