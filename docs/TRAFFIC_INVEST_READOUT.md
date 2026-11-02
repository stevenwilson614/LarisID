# Traffic & SEO investment readout

Pulled 2 Nov 2026 from Contabo (`docs/TRAFFIC_INVEST.sql`). Windows are the last 90 days versus the 90 days before that. Dapur / side accounts excluded. Google Search Console was not in this pull — static `/riset/` and `/kota/` pages do not write `page_views`, so SEO volume here is **who reached the app**, not who only read a page.

## Where to put the next effort

**Put it into Google organic and ChatGPT citations. Do not scale `/kota/`, more hand-written guides, Instagram, or a restart of Google Ads as the growth plan. Do not dump the remaining ~2,600 `/riset/` pages until Search Console shows those URLs getting impressions.**

Signups are real and up: **492 in the last 90 days vs 176 in the prior 90** (2.8×). Weekly signups went from the high teens in early August to about 40–60 through October. That growth is not paid.

| Channel | Last 90d signups | Share | Prior 90d |
|---|---:|---:|---:|
| Google organic | 200 | 41% | 10 |
| ChatGPT / other AI | 136 | 28% | 18 |
| Direct | 75 | 15% | 10 |
| Unattributed | 33 | 7% | 91 |
| Google Ads | 17 | 3% | 31 |
| Click from a static SEO page | 15 | 3% | 0 |
| Bing | 4 | 1% | 2 |
| Everything else | 12 | 2% | 14 |

ChatGPT is almost the entire AI bucket (**124 of 136** carry `utm_source=chatgpt.com`; ChatGPT adds that when it cites a URL). The last two full weeks flipped: week of 19 Oct, AI 16 vs Google 7; week of 26 Oct, AI 22 vs Google 14. Over the full 90 days Google is still larger.

Google Ads is a closed chapter. All 17 recent ad signups are campaign `ab_gpt_jul26` in the week of 3 Aug. Nothing since.

The prior window’s channel mix is softer: **91 of 176** signups had no attribution row. The 2.8× signup increase is from `auth.users` and is not an attribution artifact. The 10 → 200 organic jump is directionally real and partly “we now store the referrer.”

## What “best SEO” means in this data

People who sign up from Google land on **the homepage**, with `www.google.com` as the referrer (**196 of 200**). They are not arriving from a `/riset/<keyword>/` URL.

App arrivals whose referrer is a static SEO page, last 90 days:

| Surface | App visitors | Later signed up |
|---|---:|---:|
| `/perbandingan/` | 27 | 10 |
| `/riset/` (hub + a few leaves) | 27 | 10 |
| `/data/` | 20 | 7 |
| `/panduan/` | 7 | 3 |
| `/kalkulator/` | 7 | 0 |
| `/kota/` | 5 | 1 |
| `/harga/` | 4 | 2 |

Against **2,442** unique app visitors in the same window, `/riset/` is about 1% of arrivals — from **2,248** published keyword pages. The leaves that did show up are ones ChatGPT cited (`utm_source=chatgpt.com` on the referrer), not a broad Google long-tail. `/kota/` produced one signup (`kab-tasikmalaya`).

SPA `page_views` themselves are almost all `/` (2,299 of 2,442 visitors). Referrer hosts on those views: direct 1,392, Google 608, `larisid.com` 210, `chatgpt.com` 136, Instagram 88. Instagram’s `utm_source=ig` tag saw **99 visitors and 2 signups**.

This does not prove `/riset/` pages get zero Google impressions. It proves they rarely continue into the product. Search Console is the missing piece before spending another quarter on unpublished keywords.

## Most active users

“Power” here means **5+ active days or 3+ deep dives** in the window (activity, sessions, client events, and chats). The two flags overlap: a one-day binge of deep dives counts as both.

| | Last 90d | Prior 90d |
|---|---:|---:|
| Signups | 492 | 176 |
| Returned on another day within 30 days | 145 (30%) | 34 (19%) |
| Active users | 498 | 141 |
| Power (5 days or 3 dives) | 224 | 63 |
| of which 5+ distinct days | 32 | 5 |
| of which a dive burst on fewer than 5 days | 192 | — |
| Still active in the last 14 days | 120 new signups, **1** older account | — |

Weekly active users rose from ~30 to ~70. Users who cleared the power bar *inside that same week* stayed around 15–24. The base got wider, not stickier.

Of the 224 power users in the last 90 days: **223** opened a deep dive (about 11 dives each), **190** searched, **111** asked Laris AI, **58** saved a favorite, **13** opened Belajar, **0** opened Komunitas. Average active days among power users is **2.8** — the bar is a research burst, not a habit. The 32 people with 5+ days averaged 9.8 days.

Channel quality among last-90-day signups (power = the burst definition, so rates look high):

| Channel | Signups | Became power | One calendar day |
|---|---:|---:|---:|
| Google organic | 200 | 46% | 134 |
| Direct | 75 | 49% | 53 |
| ChatGPT / AI | 136 | 38% | 98 |
| Google Ads | 17 | 59% | 11 |

Ads were not worse quality. The sample is one dead campaign. AI signups dive a bit less often than Google. None of the channels produce the 5-day habit at a useful rate — that is a product gap, not a reason to buy a different channel.

## Invest / hold / skip

1. **Invest — homepage queries on Google.** This is 41% of signups. Keep `/`, `/perbandingan/`, and `/cara-kerja/` accurate and fast. The ranking that matters is the one that already sends people to the root URL.
2. **Invest — being the page ChatGPT cites.** Second channel, and the only one that just passed Google week-on-week. Citation URLs we can see are `/perbandingan/`, `/data/`, and a thin slice of `/riset/` and `/panduan/`. Finish the entity listings already named in `docs/seo.md` (G2 / Capterra / SaaSHub, real `sameAs` only). A “Laporan Tren” study is worth doing **as citation fuel for this channel**, after the comparison and `/data/` pages, not instead of them. Organic is not thin, so this is not a backlink rescue.
3. **Hold — `/riset/` publishing rate.** Leave the ~400–600/week cap. Accelerating the remaining ~2,600 pages is not justified by app arrivals. Revisit only with Search Console impressions and indexed counts.
4. **Hold — Google Ads.** Off since early August. Organic and ChatGPT replaced the volume. A restart is a paid top-up, not the strategy. Quality on the old campaign was fine.
5. **Skip for traffic — `/kota/` refresh, more `/panduan/` or kalkulator pages, Instagram.** Arrivals and signups are in the single digits (Instagram: 99 visits, 2 signups).

More traffic, on today’s pattern, means more people who deep-dive for a couple of days and leave. One account from before this 90-day window was active in the last two weeks.
