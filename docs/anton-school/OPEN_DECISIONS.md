# Sekolah Anton — decisions parked (not for this offline slice)

Raise these with Steven before anything leaves localhost. None of them is implied
by the mock.

## 1. PT PMA / local partner PT — merchant of record

**Question:** Should LarisID (US business, no Indonesian PT) ever collect student
fees itself?

**Facts already checked**

- US LLC + Stripe: cards only. No QRIS, GoPay, OVO, or bank VA. Indonesian
  students will not pay that way.
- Mayar, Xendit, Midtrans: KYC wants KTP; entities want NPWP / NIB. Midtrans’
  foreign path still wants an Indonesian tax ID and a KITAS director.
- Cross-border aggregators (Tazapay-class) are heavy for a one-mentor school.

**Current path (do this until a yes):** mentor-as-merchant. Anton keeps collecting
on lynk.id (today) or Mayar (webhookable). LMS holds `cohort_member_billing` and
gates Belajar. LarisID never holds money. v2 = Anton’s Mayar API key +
`payment.received` webhook, per mentor, no pooled balance.

**If we ever want MoR:** need a PT PMA or a partner PT that is the licensed
merchant, plus a MISSION review (LarisID is 100% free; taking a cut of Anton’s
class is a different product). Default no.

## 2. Same entity question — TikTok Shop Partner Center

**Question:** Can we register a Partner Center app for official Affiliate Seller
API 202412 (creator search, target collab links, IM, samples, orders)?

Partner Center onboarding is built for businesses, not hobby localhost. Indonesia
/ SEA scope, seller OAuth, request signing, test shops. Likely needs the same
entity as (1). This is the long pole for **live** Kolab sends — not for the mock.

Until then: quota-aware queue UI. Live send for this slice is the
**unpacked Chrome extension** (in-tab Affiliate Center session only). See §4.
No cookie farms. No unofficial cloud blast.

## 3. Kalodata ToS — student’s Open API key

**Question:** May a third-party app (us) call Kalodata’s Open API with a key the
**student** pasted, store only what they pulled, per user?

Path B (paste Open API key) still waits on a written ToS read.

**Decision 2026-09-18 (Steven):** in-page DOM pickup of **visible** Kalodata
creator rows is allowed in the unpacked Chrome extension, opt-in, disclosed.
Kalodata ToS 4.1.7 (incorporate the Services into another program) and 4.1.8
(automated scripts to collect information) cover this. Risk sits on the
**student’s paid Kalodata account** (fingerprint / limits), not LarisID
servers. Accepted with these hard rules:

- DOM only. Rows the student can already see. **No** MAIN-world hook, **no**
  XHR/response capture, **no** fetch to Kalodata APIs, **no** bypass of plan
  limits (4.1.6 stays untouched).
- No auto-pagination, no scrolling loop, no scheduler. One click = one visible
  page. Student pages in Kalodata, then clicks Ambil again.
- Opt-in default off. Confirm names 4.1.7 / 4.1.8 and that the risk is to
  their Kalodata account.
- Data stays in `chrome.storage.local` on that machine. Never pooled, never
  sent to LarisID/Contabo (UU PDP).
- Lift handle, nickname, Unique ID, followers, revenue only. Do not lift
  emails / WhatsApp even if visible.

CSV export and paste-from-Kalodata remain the fallbacks. Starter Kalodata
cannot export; say so in the student README.

**Still never:** Kalodata session reuse on our servers, class-wide API keys,
pooling a class’s contact exports, server-side scrape.

## 4. Go / no-go — live TikTok sends

**Question:** After Partner Center approval, do we send Target Collab / IM for
real shops?

**v0 exception (explicit, unpacked Chrome only):** in-tab Seller Center
automation is allowed as a local experiment. The extension rides the shop’s
already-open Affiliate Center session in this Chrome profile. Cookies never
leave the machine, never go to LarisID/Contabo, and we do not collect Seller
Center passwords.

Still **out of scope:** cookie farms, cloud queues, selling sessions, unofficial
“3.000 DM / 10 menit” claims.

Caps that do not go away:

- Shop cap (US/BR help; ID live uses `invitation_group/create`): up to **50
  creators per collaboration**, up to **1,000 collaborations / 24h**, plus a
  weekly GMV quota for **unconnected** creators (new shops: one-time Starter
  Pack of 1,000). Connected = unlimited. Do not promise students “1.000/hari”.
- Affiliate Center ToS still applies. Shops can get limited. Badge copy stays
  **Unofficial · sesi Chrome kamu**.

Partner Center OAuth remains the durable path if we graduate. Default for
anything that is not this unpacked extension: no live send.

## 5. ICS `calendar_token` on production Jadwal

Live subscribe URL in `js/laris-cohort.js` omits `calendar_token` (403 in
practice). Fix is a one-line production change; **out of this prototype** so
Kohort Pertama stays frozen. Revisit when the offline lock lifts.

## Closed in the funnel prototype (still offline)

Answered 2026-09-18. Implementation is localhost only — see [FUNNEL.md](./FUNNEL.md).

- Mentoring is **monthly**. Default collect: **bank transfer** (Anton’s rekening in Pengaturan bayar). Offer discount for **annual transfer** and **card autopay** (Mayar still mock).
- 24-hour welcome cut is a **real clock from form submit**, not fake scarcity.
- **Bayar nanti** = first lecture + supplies; CRM stages Trial / Nonton / Nurture / Tidak tertarik.
- Renewal: 5-day warning → Anton WA task → 1-day grace; Anton can edit in Otomasi.
- Certified mentors: one-level **20% licensing** of their student + SKU + Laris Affiliate earnings, disclosed before they accept. Not a recruit pyramid. Not LarisID as MoR.
- **Laris Affiliate** is never included in mentoring price.
