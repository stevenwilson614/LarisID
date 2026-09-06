# Shopee Live + Affiliate data — research (no build)

*Internal feasibility brief. Last updated: 6 Sep 2026. Phase 0 UI (Sinyal Promosi proxies) shipped; collectors and schema are still **not** started. Read [MISSION.md](../MISSION.md) before acting on any of this.*

**Assumptions:** both personas (aspiring affiliates + competing sellers); path toward Kalodata-style depth; **no Shopee partner / Open Platform API applications** — collect our own data.

Scraper-side endpoint notes and go/no-go: [shopee_scraper `docs/LIVE_AFFILIATE_SPIKE.md`](https://github.com/stevenwilson614/shopee_scraper/blob/main/docs/LIVE_AFFILIATE_SPIKE.md) (same machine: `~/shopee_scraper/docs/LIVE_AFFILIATE_SPIKE.md`).

---

## Verdict

Live **product↔session linkage** is the strongest scrape-only win. Affiliate **commission rates** exist in the affiliate ecosystem but not on the public PDP; without partner GraphQL they require a logged-in Affiliate Center session. Market-wide **“how many affiliates promote this SKU”** is almost certainly not a public field. True **live-attributed GMV** is partner/streamer-only; any sold-delta overlay must be labelled perkiraan.

Do not promise Kalodata parity. Do not invent affiliate headcounts.

---

## 1. What LarisID has today

| Layer | Status |
|---|---|
| Keyword search scrape → `listings` | Yes (price, sold, `is_ad`, `search_rank`, shop tier) |
| Optional PDP → `product_details` | Yes (`video_count` = PDP videos, not Live) |
| Marketplace seller **fee** calculator (“komisi”) | Yes — platform take-rate, labelled **biaya platform (bukan komisi afiliasi)** |
| Shopee Live sessions / hosts / bags | **None** |
| Affiliate / Komisi XTRA rates / affiliate counts | **None** |
| Phase 0 Sinyal Promosi (chat `promo` + Deep Dive) | Yes — perkiraan from demand, shop, `is_ad`, `shop_tier`; user-supplied rate calculator. No live/affiliate fields. |

Public copy already concedes creator/video/live analytics to **Kalodata** ([seo.md](./seo.md), [pricing-research.md](./pricing-research.md)). Kalodata is **TikTok Shop**, not Shopee. The channel analogy is wrong; the **depth** analogy (creator + live metrics) is what users are reaching for.

---

## 2. What users are asking for

One messy question (“berapa orang live / afiliasi untuk produk ini?”) is two jobs:

1. **Affiliate** — “Should I promote this?” Needs: base + XTRA rate, offer open?, demand, shop trust.
2. **Seller** — “How hard is this niche pushed via Live/affiliates?” Needs: how often the item appears in live bags, host strength, whether competitors pay XTRA.

Same underlying joins on `(item_id, shop_id)`. Different framing later. Neither job is TikTok Kalodata.

---

## 3. Official doors (out of scope)

These exist and would be cleaner, but they require partner apps / shop auth — ruled out.

| Door | What it gives | Why out |
|---|---|---|
| **AMS Open API** (`v2.ams.*`) | Seller’s **own** open/targeted campaigns, commission settings, affiliate + live/video **content performance for that shop** | Seller-scoped; Affiliate Marketing Solution Management app |
| **Affiliate Open API GraphQL** (`open-api.affiliate.shopee.co.id/graphql` and regional twins) | Market-wide `productOfferV2`: `commissionRate`, `sellerCommissionRate`, `shopeeCommissionRate`, item/shop ids, offer windows | Affiliate App ID + Secret after Open API approval |
| **Livestream Management Open API** (`v2.livestream.*`) | Session CRUD, bag items, **real-time** session/item metrics (views, likes, clicks, ATC) for **your** streams | Streamer-scoped; Livestream Management app. Supports seller streamers **and** affiliate streamers (ID included). |

AMS also documents `v2.ams.get_content_performance` (shop’s Shopee Video + Live) and `v2.ams.get_affiliate_performance` (one affiliate, **that shop**). None of that is a market-wide catalog of competitors.

Commission-rate change rule (seller AMS): decreases stay in force **7 days** for affiliates already promoting; increases apply immediately. Any future rate-history table should expect lag, not instant drops.

---

## 4. Live — scrape-only

### 4.1 Proven consumer endpoints (Indonesia)

Host: `live.shopee.co.id`.

| Pattern | Role | Evidence |
|---|---|---|
| `GET /api/v1/session/{sessionId}` | Session object + play URLs | [classyid/shopee-live-watcher](https://github.com/classyid/shopee-live-watcher) (`Shopee_API.gs`) |
| `GET /api/v1/session/{sessionId}/more_items?offset=&limit=` | Paginated shopping-bag items | Scrapeless `shopee.live` (TH URL; same path pattern) |

Anonymous `GET https://live.shopee.co.id/api/v1/session/list` (26 Aug 2026) returned `err_code: 1000000` (“Telah terjadi kesalahan”). Hub **discovery** is not a documented public list URL; it needs a real browser Network capture.

Malaysia/other markets have used `live.shopee.com.my/webapi/v1/session` with an `X-Livestreaming-Auth` header (Stack Overflow, 2025). Treat that as a **fingerprint** that live APIs are signed/cookied, not as a drop-in ID path.

### 4.2 Session fields already used in the wild

From live-watcher’s `Spreadsheet.gs` / `Notifications.gs`, `jsonData.data.session` exposes at least:

| Field | Used as |
|---|---|
| `session_id` | Identity |
| `username` | Host |
| `title`, `subtitle`, `description` | Copy |
| `start_time`, `end_time` | Schedule / duration |
| `is_terminate` | Ongoing vs ended |
| `viewer_count` | Penonton |
| `like_cnt`, `member_cnt`, `share_cnt` | Engagement snapshots |
| `items_cnt` | Bag size (count only) |
| `play_url`, `chatroom_id` | Playback / chat |

Bag **contents** (item_id, shop_id) are **not** in that session object; they come from `more_items`.

Short links resolve via `Location` with `session=`. Watchers start from a **known** live URL. They do not crawl “all lives in Indonesia.”

### 4.3 Discovery (the real bottleneck)

To approach market coverage:

1. **Live hub / “sedang live” / category feeds** in Chrome CDP — intercept list/recommend XHRs (same pattern as today’s `search_items` intercept). Highest leverage; payloads not yet captured for ID.
2. **Shop-centric** — shops already in `listings`; shop-home payloads sometimes carry livestream params.
3. **PDP flags** — e.g. `is_live_streaming_price` in third-party PDP dumps: live *pricing*, not a session index.
4. **Share graph** — only for lives already found.

Without (1), coverage is hand-picked hosts.

### 4.4 What you can store vs not

| Signal | Feasibility | Notes |
|---|---|---|
| Session id, host, title, start/end | High | Session detail |
| Items in bag + order | High | `more_items` |
| Viewer / like snapshots while live | Medium–high | Fields exist in consumer JSON; confirm under captcha/load |
| “N distinct lives / 7d” for a product | High **if** discovery is continuous | Derived |
| Seller vs affiliate streamer | Medium | Official Open API distinguishes roles; consumer JSON TBD |
| **Live-attributed GMV / units** | Low | Official `get_session_item_metric` is partner-only. Proxy: sold deltas while item is in bags — perkiraan only |
| Ended-session archives | Medium | Capture while live; ended rooms may trim metrics |

### 4.5 Ops

Lives are ephemeral. Sampling belongs on Mac CDP lanes during peak ID hours, not once-per-day keyword cadence, and **not** on the Contabo VPS. Same sold-audit class of login/captcha failure.

---

## 5. Affiliate / Komisi XTRA — scrape-only

### 5.1 Not on the public PDP

Buyer PDP (`/api/v4/pdp/get_pc`) is for shoppers. Komisi XTRA is an Affiliate Program / AMS concept. Seller edu: XTRA logo appears in the **Shopee Affiliate Program** UI, not as a reliable anonymous PDP field.

### 5.2 Path A — Affiliate Open API (excluded)

Documented GraphQL (BR/VN/ID community mirrors; ID endpoint commonly cited as `https://open-api.affiliate.shopee.co.id/graphql`):

```
productOfferV2(keyword, sortType, page, limit)
```

Nodes typically include `itemId` / `shopId`, `commissionRate`, `sellerCommissionRate`, `shopeeCommissionRate`, `commission`, `periodStartTime` / `periodEndTime`, `campaignType`, sales, rating, `offerLink`.

HMAC-SHA256 with App ID + Secret. This **is** requesting official API access. Out.

### 5.3 Path B — Logged-in Affiliate Center (still “our data”)

`affiliate.shopee.co.id` is a JS SPA (anonymous fetch returns “enable JavaScript”). Chrome extensions such as “Shopee Affiliate Max” document that they capture product/commission data **from the Affiliate site using the user’s login cookies**.

Same idea as today’s scraper: approved affiliate account in CDP → browse offer search → intercept the XHR/GraphQL the Center already uses.

Likely: rates + offer windows + campaign type; keyword browse of high-commission offers; lookup by item id for listings we already have.

Not AMS: we would not see competitors’ affiliate **rosters** or conversion reports.

**Still uncaptured:** exact internal URLs, whether every open-campaign SKU is searchable, rate limits, captcha, itemId lookup.

### 5.4 “How many affiliates promote this?”

Sellers see affiliate performance **for their shop** (`v2.ams.get_affiliate_performance`). Affiliates see offers and **their own** conversions. There is no documented public “affiliate count per SKU.”

Substitutes that stay honest:

- Offer active + commission rate (seller incentive)
- Frequency in live bags / video (observed promotion)
- Appearance in Affiliate Center “high commission / popular” sorts (attention proxy)

---

## 6. Kalodata-style capability map

**Approachable scrape-only:** commission economics; live session + bag co-occurrence; viewer/like snapshots; derived lives-per-item.

**Proxy only:** live-attributed omset from sold deltas; “promo pressure” without headcount.

**Not approachable without partner/seller auth:** exact affiliate count per SKU; official live item clicks/ATC/GMV; other shops’ AMS dashboards.

---

## 7. How collection would work (design only — not implemented)

Join key already in LarisID: `(item_id, shop_id)`.

1. **Live lane** — discover `sessionId`s → poll session detail + `more_items` → history of product↔session.
2. **Affiliate lane** — logged-in Center → offer search / item lookup → rate snapshots.
3. **Join** — Deep Dive / AI later; existing search scrape supplies sold/price.

Cadence (order-of-magnitude): affiliate rates daily or Deep Dive–seeded; live minutes-scale during peak hours.

### 7.1 Tables we would add later (not applied)

- `live_sessions` — session_id, host/shop, title, started_at/ended_at, viewer/like snapshots, scraped_at
- `live_session_items` — session_id, item_id, shop_id, bag_rank, first_seen, last_seen
- `affiliate_offers` — item_id, shop_id, total/seller/shopee rates, offer_active, period, scraped_at
- `affiliate_offer_snapshots` — same grain + scraped_at for rate history
- `mv_product_promo_signals` — `lives_7d`, peak viewers, `affiliate_rate`, `is_xtra`, `rate_changed_7d`

Push path: scraper Macs → PostgREST `api.larisid.com` → Contabo. Apply SQL only with `bash scripts/apply-selfhost.sh` if this ever ships.

### 7.2 Product surfaces we would add later (not shipped)

- Deep Dive strip: rate + lives/7d + honesty footnotes
- Affiliate framing: sort “komisi tinggi + live aktif”
- Seller framing: “sering di-live / ada XTRA” as competition
- Update Kalodata comparison copy **only after data exists**
- AI tools: only claim fields they select; never “12.4k afiliator”

---

## 8. Risks

| Risk | Why |
|---|---|
| ToS / account bans | Aff Center + aggressive live polling > keyword search |
| Session death | Same class as sold-stripping guest scrapes |
| Coverage bias | Weak discovery → mall hosts only |
| Honesty | Easy to overclaim jumlah afiliator / omset live |
| Cost | Continuous live vs batch keyword days |
| Legal | Public live rooms ≠ private AMS; logged-in Center is a product/legal call |

---

## 9. Gaps that still need a human Network tab

Cannot be closed from secondary sources + anonymous HTTP:

1. Exact live **hub** list/recommend XHRs on `live.shopee.co.id`
2. Exact Affiliate Center offer XHR/GraphQL on `affiliate.shopee.co.id` (logged-in)
3. Session JSON under captcha / peak load
4. Confirm no public affiliate **count** field
5. How often open-campaign rates actually move (snapshot cadence)

A read-only CDP capture (no pipeline) is the next research step. Partial capture done 26 Aug 2026 — see §11–§12.

---

## 10. Go / no-go

| Bet | Call | Condition |
|---|---|---|
| Phase 0 proxies from existing listings / velocity / ads / shop_tier | **Go** | Shipped 6 Sep 2026. Risk: ordinal read as headcount — footnotes + `belum cukup data` |
| Phase 0b `video_count` read surface (`promo_signals_batch`) | **No** | S4 (6 Sep 2026): 32 / 679.765 listings in 45d (~0%) have `product_details`. Do not join. |
| Live session metadata + bag items, given a session id | **Go** | Research only until hub discovery works |
| Market-wide live discovery | **Hold** | `/pc` is host studio. Viewer-feed XHR still unknown (S1) |
| Commission rates via Affiliate Center (Path B) | **Hold, policy first** | Approved affiliate account, separate profile from `acct614`, ToS read |
| Affiliate headcount per SKU | **No** | Permanent |
| Live GMV as terukur | **No** | Permanent |
| Sold-delta during live | **No** | Cadence 12–17 days; no pre/post `tracked_pass` |
| TikTok Shop collection | **No** | S3 is documentation only |
| Collectors on Contabo | **No** | Mac CDP lanes only |
| Kalodata comparison rewrite | **No until data** | Honesty |

Phase 2 collection needs explicit acceptance: (a) legal read on logged-in Affiliate Center automation, (b) ops budget for evening Mac lanes, (c) named owner of the affiliate account, kept off `acct614`.

Default stays **no partner API**. Revisit Affiliate Open API only if the legal read says cookie automation of the Center is riskier than a registered affiliate developer app. AMS and Livestream Open APIs stay out.

---

## 11. One-SKU test — Originote Hyalucera (26 Aug 2026, ~10:40 WIB)

**Product:** The Originote Hyalucera Moisturizer Gel 50ml  
**IDs:** `item_id=10492590941` `shop_id=710619388` (~2.1M sold in our listings)  
**Method:** logged-in Chrome CDP (`acct614` / port 9224), Network domain only. Anonymous `get_pc` was **403 / 90309999**. Repeat: `bash chrome.sh 9224` then `/usr/bin/python3 scripts/probe_live_affiliate_one_sku.py` in the scraper repo. Raw dumps stay in `/tmp/larisid_live_aff_spike/` (not git).

| Hypothesis | Result |
|---|---|
| Logged-in PDP has live flags | **Yes.** `item.is_live_streaming_price = null`. `shop_detailed.session_info` / `session_infos` = null. |
| Shop “is live now” | **No, and we can see that.** `get_shop_tab` → `live_tab.show_live_tab = false`. Username `theoriginoteofficial`. |
| Public live room list from `live.shopee.co.id/pc` | **Not this URL.** Bare `/` 404s (`notFound` chunk). `/pc` calls `webapi/v1/session` for **this account as host** (`err_code 3000101`, `pc_streaming_ban_end_time: 0`) plus auth/host_info. No catalog of other rooms, no `session_id` list. |
| Cream in someone’s live bag right now | **Not proven.** Morning sample, shop not live, no public session ids to page `more_items`. |
| Komisi XTRA on this SKU | **Not from this profile.** `affiliate.shopee.co.id` loaded the SPA; **zero** offer/GraphQL JSON. Scrape login is a buyer, not an approved affiliate. PDP has **no** commission/affiliate fields. |

**What the cream would show in Deep Dive today if we shipped this:** “Tidak sedang live (terukur dari PDP/shop).” Not “12 live rooms” and not a komisi %.

**Still blocked for Kalodata-style heat:** click into the public live *feed* (not host studio) to capture the list/recommend XHR; use an **affiliate** login for rates; sample bags at peak evening hours.

---


## 12. One-SKU test — Maybelline Superstay Matte Ink (26 Aug 2026, ~11:00 WIB)

**Product:** Maybelline Superstay Matte Ink (Shopee Beauty Awards listing)  
**IDs:** `item_id=1835009883` `shop_id=62582411` (~8.5M sold; official store `maybellineindonesia`)  
**Method:** same CDP probe as §11 (`acct614` / 9224, Network only). Chrome on 9224 exited after each run; started in the same command as the probe (two probe attempts). Raw dumps in `/tmp/larisid_live_aff_spike/` (not git).

| Check | Result |
|---|---|
| PDP live flags | **Partial.** Logged-in `get_pc` returned **90309999** (captcha / anti-crawler) on both attempts; no `is_live_streaming_price` / `session_info` body captured. |
| Shop “is live now” | **No.** `get_shop_base_v2` → `tab_meta.live_tab.show_live_tab = false`. |
| Public session list / bag | **No.** `/pc` still `webapi/v1/session` err **3000101** (this account as host). No public `session_id`s, so `more_items` not reached. Bag hit: **no**. |
| Komisi | **No.** Affiliate Center *did* fire JSON this time (`/api/v3/gql`, `/api/v3/user/*`, `/api/v3/affiliates/*`). GQL was `checkAffiliateHasOngoingPartnership` (null), not `productOffer`. Profile/status **30003**; live host `is_affiliate=false`. No commission fields. |
| Viewer-feed XHR | **Still missing.** Extra pass (same probe `--only-extra`): `https://shopee.co.id/live` → `pages/is_short_url/?path=live` with empty url, then mall chrome — **no** `/webapi/` or `/api/v1/session` list. Homepage `campaign_modules` had no live module. |

**Would show in Deep Dive today:** shop not live (terukur from `show_live_tab`). Not room count, not komisi %. Viewer discovery still blocked.

---

## 13. Phase 0 copy (`mentor-copy` — confirm with Afryian & Hendra)

Shipped as draft. Do not treat as final until mentors confirm aloud.

**Job A lead:** Untuk afiliasi, aku cek tiga hal dari data Shopee kami: permintaan, toko, dan seberapa ramai produk ini sudah didorong. Komisi dan Komisi XTRA tidak ada di data kami (1) — masukkan angka dari Affiliate Center-mu di kalkulator di bawah.

**Job B lead:** Kalau kamu mau jualan di pasar ini: dari {n} listing teratas, {k} pakai iklan pencarian. Aku tidak bisa menghitung berapa afiliator atau berapa sesi live (1) — ini bacaan tekanan, bukan sensus.

**TikTok refer:** Data kami hanya Shopee. Untuk kreator, afiliasi, dan GMV live di TikTok Shop, coba Kalodata — itu alat TikTok Shop, bukan Shopee.

**Footnotes:** (1) Shopee tidak mempublikasikan komisi afiliasi, Komisi XTRA, jumlah afiliator, atau GMV live per produk. Kami tidak menebak angkanya. (2) Unit/minggu terukur hanya bila bertanda terukur. (3) Tekanan promosi dari iklan, tipe toko, dan laju penjualan — bukan jumlah afiliator. Video halaman produk belum kami cek.

## 14. Phase 1 spike runbook (research only — do not start a collector)

Run on a Mac. Network domain only. Raw dumps in `/tmp/larisid_live_aff_spike/` (not git). Nothing writes to `api.larisid.com`.

| Spike | Account | When | Success | Kill |
|---|---|---|---|---|
| **S1** viewer live-feed XHR | Buyer `acct614` | 19:00–22:00 WIB, max 3 sessions | List/recommend XHR with multiple `session_id`s not owned by the account + one ID `more_items` with `item_id` / `shop_id` | Three evenings, no list XHR → live metrics stay out of product |
| **S2** Affiliate Center offer XHR | **Approved affiliate**, dedicated Chrome profile, **not** `acct614` | After policy/ToS yes | `productOffer`-class payload for one `listings` item_id; note limits, captcha, item-id lookup; confirm no count field | No account or ToS forbids automation → Path B = No |
| **S3** TikTok Shop PDP (optional) | Normal TikTok account | One PDP + “Dipromosikan oleh” | Field shape + how incomplete the creator sample is | Doc only. Does not move the Kalodata concession |
| **S4** `product_details` coverage | Read-only psql | Done 6 Sep 2026 | 32 / 679.765 (~0%) | `video_count` stays unused |
| **S5** session + `more_items` | Buyer, when `show_live_tab=true` | Opportunistic | Pin ID JSON shape (today’s fields are third-party) | Still no hub list |

Commands (scraper repo): `bash chrome.sh 9224` then `/usr/bin/python3 scripts/probe_live_affiliate_one_sku.py`. Click the **viewer** live feed, not host `/pc`.

Still blocked after Phase 1 regardless: affiliate headcount; live-attributed GMV; competitor AMS; TikTok creator GMV.

## 15. Phase 2 collection design (do not apply)

Only if S1 succeeds and S2 + legal/ops accept. Scraper Macs → PostgREST. Later: `bash scripts/apply-selfhost.sh` / `bash scripts/deploy-function-selfhost.sh`. Never run the lane on Contabo.

- `live_sessions` — `session_id` PK, host, role (`unknown|seller|affiliate`), title, start/end, `discovery_source` (`hub_feed|shop_tab|pdp_chip|manual`), first/last seen
- `live_session_snapshots` — `(session_id, snapped_at)`, viewer/like/member/share/`items_cnt`/`err_code`. Keep failed snaps; pause the lane on `err_code != 0`
- `live_session_items` — `(session_id, item_id, shop_id)`, bag_rank, first/last seen
- `affiliate_offer_snapshots` — `(item_id, shop_id, snapped_at)`, rates, `is_xtra`, campaign, period, `account_ref` (hash). View `affiliate_offer_latest`. Expect 7-day decrease lag
- `mv_product_promo_signals` — lives 7d/28d, distinct hosts, peak viewers, `live_coverage` (`hub|partial|none`), latest rate + timestamp, `promo_pressure_class`. Live fields always perkiraan; rate is terukur only with its timestamp

Cadence: rates daily for Deep Dive / Favorit items; live 18:00–23:00 WIB, session every 5–10 min, bag every 15 min. Grants: `anon, authenticated` select on the matview only.

## 16. Open questions (Network tab or policy)

1. Who owns the approved Shopee Affiliate account for S2, and is automated Center reading acceptable under its ToS?
2. Exact viewer live-feed list XHR on `live.shopee.co.id` (S1).
3. Affiliate Center offer payload, rate limits, item-id lookup (S2).
4. Does ID `more_items` return `shop_id` (S5)?
5. Is any TikTok public capture (S3) wanted, or stay Kalodata-only?
6. Evening Mac lane budget vs batch keyword days.

---
