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

Offline v0 uses **CSV they exported** (their subscription, their file). Path B
(paste key) waits on a written ToS read. If forbidden, stay on CSV.

**Never:** scrape kalodata.com, reuse their session, or pool a class’s contact
exports into one Laris list (UU PDP).

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

- Shop cap: 1,000 target invites / 24h, 50 per send, weekly GMV quota for
  **unconnected** creators. Connected = unlimited.
- Affiliate Center ToS still applies. Shops can get limited. Badge copy stays
  **Unofficial · sesi Chrome kamu**.

Partner Center OAuth remains the durable path if we graduate. Default for
anything that is not this unpacked extension: no live send.

## 5. ICS `calendar_token` on production Jadwal

Live subscribe URL in `js/laris-cohort.js` omits `calendar_token` (403 in
practice). Fix is a one-line production change; **out of this prototype** so
Kohort Pertama stays frozen. Revisit when the offline lock lifts.
