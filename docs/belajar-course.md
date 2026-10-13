# Belajar — seller course in the SPA

Free, self-paced course for every logged-in user. It lives in the main app
(`#btn-belajar`, `#view-belajar`, `js/gpt-belajar.js`), not in the Anton school
prototype and not in cohort `milestone_content`.

Goal: take someone from no product to a live listing, with a clear next step.
People who already have a store are not marched through the opening modules.

## Tracks

| Track | Who | What counts |
|---|---|---|
| `new` | Belum punya toko | Every published lesson whose platform is empty or one they checked |
| `existing` | Sudah punya toko | Module `pantau` (and any module with `sort_order` ≥ 5), plus earlier lessons they actually mark done |

Nothing is hidden. Earlier modules stay open under “Sudah punya toko”. Skipping a
lesson removes it from the count. It is not marked done.

The first visit saves a suggestion: `existing` when onboarding `seller_status`
is `existing` or a shop URL is already stored, otherwise `new`. Platforms
default to linked shops (`tiktok_shop` maps to `tiktok`) or Shopee. The chips
and the two track buttons overwrite that.

## Verify keys

`belajar_course()` stamps `done` when the product already shows the step.
A lesson the user marked `skipped` stays skipped. A `draft` is upgraded to
`done` when the signal becomes true.

| Key | Done when |
|---|---|
| `deepdive` | `user_journey_stats.deepdive_count` ≥ 1 |
| `favorit3` | `user_tracked_products` ≥ 3 |
| `kalk` | a `gpt_kalc_save_riwayat` activity event, or a `gpt_chats` row with `context.kind = kalkulator` |
| `store` | `user_profiles.public_shopee_url` / `shopee_store_url`, or an active `student_account` shop with a URL |
| `pantau` | favorit ≥ 3 and `user_tracker_state.notify_channels` is not empty |

There is no paywall and no lock that blocks reading the next lesson.

The course home and each lesson show one dot per lesson. A filled dot is selesai, the ring is where you are, and a dim dot is outside the current count (another platform, or an early module when the track is “sudah punya toko”). Tap a dot, or Materi sebelumnya / berikutnya, to open that lesson. Tandai selesai saves the step and opens the next lesson in order. On the last lesson it opens the next counted lesson that is still open. Selesai · lanjut moves forward without clearing the check.

## Modules

1. **Cari produk** — Tabel, Kartu, Trending Sekarang, one Deep Dive, three Favorit.
2. **Uji produk** — how to read omset / review / usia, the toko-baru price observation (with its limits), Kalkulator, Komunitas. Omset that is not measured stays labeled perkiraan.
3. **Cari supplier** — five sourcing paths, sample, harga pokok. 1688 is named as an import route, not a way around customs.
4. **Buka toko** — platform chips. Shopee, Tokopedia, TikTok Shop, Lazada lessons only count when that chip is on. Tokopedia and TikTok Shop Indonesia share one Seller Center; the lessons say so. Last step is the listing checklist plus saving the shop URL on Profil.
5. **Pantau kompetitor** — Favorit alerts, Laris AI “Bandingkan”, the Chrome extension. At 100% the page links to Edukasi (mentor interest). It does not enroll anyone.

External links are official seller-education pages (checked when the seed was written) plus `/cara-kerja/`, `/kalkulator/biaya-shopee/`, and `/kalkulator/margin-hpp/`. YouTube or Drive URLs pasted later lazy-load: the iframe starts only after Putar video.

## Editing

Admin → **Belajar — kurikulum** edits title, URL, body, points, resources,
questions, action JSON, platform, and tayang. Counts are people who marked
`done` or `skipped`.

Re-applying `supabase/migrations/20261014120000_belajar_course.sql` overwrites
the seeded copy for the same slugs. Treat that file as the source of truth for
the original 16 lessons, or put later copy changes in a new migration.

```bash
bash scripts/apply-selfhost.sh supabase/migrations/20261014120000_belajar_course.sql
```

Never `supabase db push --linked`.

## Events

`belajar_open`, `belajar_lesson_open`, `belajar_lesson_done`,
`belajar_action_click`, `belajar_track_set`.
