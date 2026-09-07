# Komunitas board (Diskusi + Ajukan Fitur)

Logged-in peer conversation. Goal: **users talking to each other**, not more likes and not a founder backlog.

Live UI: `index.html` + `js/gpt-community-board.js` + `js/gpt-app.js`. Schema: `supabase/migrations/20260907140000_komunitas_board.sql`. Apply on Contabo only (`bash scripts/apply-selfhost.sh`). Never `supabase db push --linked`.

## Lanes

Two tabs. Do not add a third.

| Tab | `feature_requests.kind` | Sort | Default |
|-----|-------------------------|------|---------|
| **Diskusi** | `question` + optional `topic` | unanswered (`comment_count = 0`) first, then newest | yes |
| **Ajukan Fitur** | `feature` / `complaint` | likes desc, then newest | no |

Topic chips and Fitur/Keluhan browse filters are **deferred** while the board is empty (they clutter an empty list). Compose still offers an optional topic select. Re-add browse filters when volume warrants it.

Allowed topics (low-secrecy):

`Foto & Deskripsi` · `Packing & Ongkir` · `Iklan Shopee` · `Kebijakan Shopee` · `Cara Baca Data LarisID` · `Cerita & Pelajaran`

Tips are a topic, not a lane. Named by default. No anonymous posting in v1.

## Privacy model

Public Diskusi is for **process and lessons**. Niche, supplier, margin, and winning ads stay off the board.

- Pinned rules say that in three lines.
- Compose placeholder repeats it.
- Every answer has **Kirim Pesan** (“Mau lanjut ngobrol privat?”) → `user_messages` via the public profile composer (`js/gpt-profile.js`). Requires the answerer `user_profiles.is_public`. First reply nudges the answerer to turn that on.
- Do not prefill harga / omset / perkiraan deltas into a Diskusi post. “Tanya seller lain” uses **keyword grain** only.

## Entry points

- Main nav **Komunitas** (`#btn-community`), next to Favorit Aku — not under Tentang.
- Beranda `#home-komunitas` (after onboarding finder is done): *Pertanyaan minggu ini* (latest staff `question` in 14 days) + up to 2 unanswered. **Hidden when empty.** Not a popup.
- Deep Dive Aksi Cepat and Cari Produk `#dir-ask-sellers`: *Tanya seller lain tentang “keyword”*.
- Email deep link: `https://larisid.com/?komunitas=<uuid>` (optional `&tab=usulan`). Login gate stashes `state.pendingKomunitas`.

## Notifications

`notify-feature-board` (deploy: `bash scripts/deploy-function-selfhost.sh notify-feature-board`):

- New comment → author + likers + other commenters. CTA opens the thread, not the site root.
- `kind=new_question` → users who opted in via `board_topic_follows` for that topic. (UI opt-in is deferred with topic browse filters; schema + notify path remain.)
- `kind=resolved` → watchers when an usulan is marked done (admin).

No email without a reason. No daily user blasts. WhatsApp question digests are v2.

## Usulan Fitur

Existing feature/complaint flow stays. Like opens the reply box with *Ceritakan kasusmu singkat* so a vote can become a thread. Steven replies in public within 7 days (Admin badge). Status dropdown is unchanged (`open` / `considering` / `done`).

## What the product must never do

- Auto-post as a user, staff-disguised account, or AI “seller”.
- Limit Deep Dives, searches, or CSV so people “earn” them back by talking ([MISSION.md](../MISSION.md) §1 and §3).
- Leaderboards, karma, paid member panels, fabricated questions.
- Auto-close threads or auto-mark usulan done.

## Cold-start playbook (humans)

An empty board stays empty. Founders post **questions**, not answers.

**Who**

- **Afryian / Hendra** own Diskusi seeds (local seller voice).
- **Steven** owns Usulan replies (7-day SLA) and at most one Diskusi post per week (the data thread). Admin badge already marks him; flooding Diskusi turns it back into Steven’s board.

**Cadence (first 60 days)**

- ≥3 mentor questions per week (weekday is better). Each ends in a question.
- 1 weekly data thread: use the admin draft from `komunitas_weekly_draft` / Monday digest. **Edit and post as a person.** Label numbers **perkiraan**. See [terlaris-minggu.md](./terlaris-minggu.md) — scrapes are 12–17 days, not a calendar week.
- Staff posts stay under ~30% of visible Diskusi. If users start posting, staff posting drops.

**48-hour wait (the important rule)**

After a question is posted, **wait 48 hours for a non-staff reply**. If a user answers first: thank them and add one detail — do not overwrite. If still empty: a mentor replies **and asks a follow-up**. Usulan Fitur is the exception (Steven within 7 days).

**Personal invites**

Week 1: message ~20 named users from the admin invite list (Deep Dive / Cari Produk users who never posted). One specific question (region, packing, foto). Thank them in public when they reply.

**Recognition**

Monthly “Terima kasih sudah bantu jawab” post naming helpers. No ranking, no points.

### Seed bank (copy by a person — do not insert via SQL)

Good seeds ask something a peer can answer. Bad seeds are blog posts.

1. Seller Jogja, packing ke luar pulau biasanya berapa hari sampai dan paket apa yang kalian pilih? Kita lagi sering dapat komplain lambat.
2. Foto produk di rumah, lighting-nya pakai apa biar tidak kusam? Lampu meja cukup atau perlu ring light?
3. Deskripsi Shopee yang kepanjangan, orang masih baca atau langsung skip ke varian?
4. Iklan Shopee pertama kali, budget harian kalian mulai dari berapa supaya tidak hangus di hari 1?
5. Ada yang pernah kena hold saldo karena resi telat? Yang kalian lakukan apa, besides nunggu?
6. Ongkir Jawa–luar Jawa, kalian naikin harga atau makan sendiri? Kalau naikin, cara jelasin ke pembeli?
7. Bubble wrap vs polymailer untuk aksesoris kecil — komplain pecah vs ongkir mahal, yang lebih sering?
8. Review 1 bintang soal “beda warna”, kalian balas bagaimana biar tidak kelihatan defensif?
9. Stok habis di tengah iklan, pause dulu atau biarkan habis? Ada yang pernah tes dua-duanya?
10. Kota kecil, ekspedisi mana yang paling jarang nyasar menurut kalian?
11. Thumbnail vs foto ke-2: yang mana yang lebih sering bikin orang masuk PDP?
12. Varian terlalu banyak, checkout jadi ribet. Kalian potong berapa varian di awal?
13. Kebijakan Shopee soal video wajib, ada yang sudah dipaksa dan omsetnya berubah?
14. Cara baca omset LarisID: kalian pakai angka terukur atau perkiraan waktu milih produk? Bingung di bagian mana?
15. Seller baru, hari pertama live — kalian jual produk existing atau tes 1 SKU dulu?
16. Packing makanan kering, silica / extra box / cukup standing pouch? Komplain lembab pernah?
17. Iklan yang “murah klik tapi tidak convert”, kalian matikan atau ubah judul dulu?
18. Ada yang pindah gudang ke kota lain karena ongkir? Worth-it-nya kelihatan setelah berapa lama?
19. Cerita gagal: produk yang kelihatan laris di keyword tapi toko kalian sepi. Dugaan kalian apa?
20. Keyword yang lagi rame di data LarisID minggu ini — kalian lihat hal yang sama di toko, atau beda?

Do not post “Tips packing: pakai bubble wrap.” Nobody needs to reply. Do not invent fake user accounts.

## Staff ops helper (automated, staff-only)

Never publishes. Emails Steven (`stevenwilson614@gmail.com`), Afryian (`afryannp@gmail.com`), and `app_role_assignments` admin/leader.

| When | What |
|------|------|
| Tue–Sun 08:00 WIB | Diskusi still at 0 **non-staff** replies after 48h + one-tap thread links |
| Monday 08:00 WIB | That list + keyword draft (`perkiraan`) + invite-candidate names/keywords |

Admin → **Komunitas — staf**: metrics, unanswered, draft (opens compose), invite list, “Kirim digest ke tim”.

```bash
bash scripts/deploy-function-selfhost.sh komunitas-staff-digest
bash scripts/schedule-komunitas-staff-digest.sh
```

The schedule script reads `SERVICE_ROLE_KEY` on the VPS. Do not paste JWTs into tracked SQL.

RPCs (admin unless noted): `komunitas_beranda_cards` (any signed-in user), `komunitas_board_metrics`, `komunitas_unanswered_staff`, `komunitas_weekly_draft`, `komunitas_invite_candidates`. Service role only: `komunitas_staff_digest_payload`.

## Baseline (Contabo, 2026-09-07, before this ship)

Honest before-number. Do not dress it up.

| Metric | Count |
|--------|------:|
| `feature_requests` | 4 (all `kind=feature`, all non-admin authors) |
| likes | 4 (2 distinct likers) |
| comments | 4 (1 commenter, **all admin**) |
| non-admin comments | **0** |

## Success signals (peer-to-peer only)

Weekly via admin metrics / SQL:

- Replies per question, and % of questions with a **non-admin** reply within 48h.
- Distinct non-admin repliers per 30 days.
- `user_messages` sent from board cards (public → private).
- Return visits to Komunitas within 7 days of posting or replying.
- Usulan threads with 2+ comments (votes that became conversation).

Vanity likes on Usulan are not success.

If after 60 days non-staff replies are still near zero, revisit a **give-only** +1 search for the first helpful reply of the day on someone else’s unanswered question (min length, not self-reply). Still no Deep Dive cap. Still no CSV prize. Measure quality before keeping it.

## MISSION

- Access: board stays free for every logged-in user.
- Honesty: no fake activity; weekly data threads stay perkiraan where required.
- No exploitation: no guilt prompts; secrets have Kirim Pesan.
- Learning: Diskusi is the default surface.
- Philanthropic: mentor time is the investment.

## Deferred to v2

Optional anonymous posting (admins still see identity). Karma/badges. WhatsApp question digests. Merge cohort `community_posts` into this board. Give-only +1 search. Product CSV for everyone (never as a community prize).
