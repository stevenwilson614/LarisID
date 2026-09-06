# Laris AI — routing, modes, and honesty

Live chat is `index.html` + `js/gpt-app.js`. Thread memory lives in `js/gpt-chat-memory.js`.

Read **[MISSION.md](../MISSION.md)** first. Do not invent sold / omset / affiliate / live numbers. Weekly answers stay span-normalised — see [terlaris-minggu.md](./terlaris-minggu.md). Location is **seller** location. Kalodata is **TikTok Shop**, not Shopee.

QA: [journey-funnel-test.md](./journey-funnel-test.md) (Laris AI beats at the end).

---

## `handleComposerSubmit` order

1. “Produk lain” → directory.
2. Conversational thread: decline pending offer; then `detectResponseMode` (`refer` / `promo` / `filter` / `weekly` / `lookup`); then affirm / refine → agent or product AI.
3. Product compare / topic-change (fresh chat).
4. Category evaluate (“apakah jualan fashion bagus?”).
5. Typed modes **before** `AI_AGENT_ALL`: refer, promo, weekly, lookup, filter.
6. Market agent (judgment / public / leftover typed asks). `thinking: wantsDeepReasoning(text)` — not always on.
7. Chip `detectIntent` (profit, bandingkan, modal, lowcomp, rencana, trending, terlaris chip).
8. Logged-out card path.

Logged-out visitors never hit the agent or `cari_web`.

---

## Response modes

| Mode | Example | Thinking | Length | Rows | Data |
|---|---|---|---|---|---|
| LOOKUP | `Crocs` | Off | 2–4 sentence overview | Listing table | LarisID |
| WEEKLY | `apa yang terlaris minggu ini` | Deterministic reviewing steps | 1–2 sentences + window | ~10 from winning markets | `wk_units` then listings |
| FILTER | `ada yang dari Bandung?` | Off | 1–2 sentences | Subset of `lastShown` | Last pool + location |
| REFER | `affiliate tiktok` / `kalodata` | Off | 1–2 sentences | None | Kalodata handoff (TikTok Shop only) |
| PROMO | `untuk affiliate produk mana yang bagus` | Off | Lead + checklist + footnotes | Listing table | Shopee proxies (demand, shop, tekanan) + user-rate calculator |
| JUDGMENT | `sebaiknya jual Crocs atau sandal?` | If `wantsDeepReasoning` | 2–4 short paragraphs | Optional | LarisID first |
| CALC | profit / bandingkan / modal chips | Off (purpose-built UI) | UI | As that flow | LarisID |
| PUBLIC | `supplier Crocs di mana` | Light plan; thinking off unless evaluative | Short + sources | Only if also a product ask | `cari_web` |
| PARTIAL | `ini impor dari mana?` | Same as judgment if evaluative | 4-part contract | Maybe | Proxies, then labeled knowledge |

`lastShown` is stored on `chat.context` whenever rows are painted. “Crocs Bandung” with no demonstrative is LOOKUP-with-city, not FILTER. `Lanjutkan jawaban` / `Ya, lanjut` are never FILTER.

---

## Tools and budget

`AI_TOOL_MAX_TURNS` = 5, `AI_TOOL_MAX_CALLS` = 12. Never tell the user “batas alat”.

| Tool | Role |
|---|---|
| `cari_pasar` | Free-text market search |
| `pasar_kota` | What shops in one city actually sell |
| `pasar_kategori` | Markets in one canonical category |
| `ringkasan_kategori` | Top-N pasar per category in one RPC |
| `detail_pasar` | One market + seller locations |
| `cari_listing` / `filter_listing` | Individual listings |
| `produk_dibuka` | Open Deep Dive product |
| `pemain_baru` / `pola_toko_baru` / `judul_menang` | New-shop playbook |
| `cari_web` | Labeled public search (Tavily / Brave). Refuses sold / omset / terlaris / affiliate / live GMV |

`cari_web` is not attached on LOOKUP / WEEKLY / FILTER / REFER / PROMO / CALC (those paths skip the agent).

### Affiliate / Live routing (Phase 0)

- Shopee affiliate / Live / Komisi XTRA / “berapa orang affiliate” **without** TikTok or Kalodata → `promo`. Paint listing rows + Sinyal Promosi (perkiraan) + checklist + a calculator on the **user’s** commission %. Never invent a rate, XTRA flag, affiliate headcount, or live GMV.
- TikTok Shop / Kalodata / creator-or-video GMV → `refer`. Short Kalodata handoff. No Shopee listing rows under a TikTok question.
- Judgment + affiliate (“sebaiknya jadi affiliate atau jualan sendiri?”) → agent. Same honesty: 4-part partial contract, proxies only.
- Bare `komisi` without affiliate/kreator/konten stays the marketplace fee calculator. Fee copy says “biaya platform”, not affiliate commission.
- `video_count` is **not** used: Contabo `product_details` covers ~0% of 45-day listings (S4, 6 Sep 2026). Tooltip: “video: tidak diperiksa”.

See [live-affiliate-research.md](./live-affiliate-research.md). Copy is `mentor-copy` until Afryian & Hendra confirm.

---

## Follow-up contract

After an agent / LOOKUP / WEEKLY answer, lift `<lanjut>` (1–3 user-voice questions) the same way `<rencana>` is stripped. Persist `content.followups`. Offer chips send `Ya, lanjut`; the model gets `resolveAffirmativePrompt`. Widen `AFFIRM` for `ya boleh`, `ya, lanjut`, `oke lanjut`, `lanjutkan jawaban`.

Empty assistant text is not persisted. `max_tokens` appends a “Lanjutkan jawaban” chip. `AI_MAX_TOKENS_DEEP` = 4096.

---

## Shared prompt context

`aiDataContext()` is on every prompt builder: today’s date (WIB), scrape every 12–17 days, no yearly GMV, persona **Laris AI**, aku/kamu, never mention tool limits.

`detectReplyLanguage` defaults to `id`. English only when `en >= 2 && en > id`.

---

## Audit snapshot (Contabo `gpt_messages`, 21–45 days before 6 Sep 2026)

83 users / 448 chats / 914 assistant replies. Defects this file’s code is meant to close: 21% duplicate user rows, year confusion, English replies to Indonesian (including “Affiliator”), “kena batas alat”, mid-sentence cuts, empty persisted replies, “Mau?” chips that resent the assistant’s sentence, p50 17s / p90 43s from always-on thinking.

SQL used for that count (read-only):

```sql
select count(*) from gpt_messages where role = 'assistant'
  and created_at > now() - interval '45 days';
```

Do not delete historical duplicate rows from this work.

---

## Deploy

- SQL: `bash scripts/apply-selfhost.sh supabase/migrations/20260906093000_ringkasan_kategori.sql`
- Web search: `bash scripts/deploy-function-selfhost.sh cari-web` then set `TAVILY_API_KEY` (or `BRAVE_API_KEY`) on the Contabo functions env. No key → tool returns unavailable; the model must not invent URLs.
- Static: `bash scripts/deploy-static.sh`
