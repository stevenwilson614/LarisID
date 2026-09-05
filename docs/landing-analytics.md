# Landing Page Analytics — Scroll Depth & CTA Tracking

> **Historical.** Written before chat-first cutover. Live analytics are Clarity + `log_client_events` in `js/gpt-app.js`. Paid CTAs described below were retracted.


**Question (product owner):** "Can we track a user's activity on the landing page? Are users scrolling way down before signing up, or simply clicking the primary CTA (`multi` / 'Mulai Gratis')?"

**Short answer:** With today's stack we can answer this **qualitatively** (Clarity heatmaps + recordings show roughly how far people scroll and where they click), but we **cannot** answer it **quantitatively** — there is no scroll-depth funnel and no CTA-click event. To get hard numbers ("X% reach 75% scroll before signup", "Y% of signups click the hero CTA vs the pricing CTA") we need to add custom events. Spec below.

> This is a research/spec document. No application code was changed.

---

## 1. Current analytics inventory

Everything analytics-related lives in the `<head>` of `index.html`:

| Tool | Where (index.html) | What it captures |
|------|--------------------|------------------|
| **Cloudflare Web Analytics** | lines 25–27, beacon token `7cada22477f048bdbe064f16ac18f17e` | Pageviews, referrers, country, device, Web Vitals (LCP/FID/CLS). **No** custom events, **no** scroll, **no** click tracking. Privacy-first beacon with no custom-event API exposed on the page. |
| **Microsoft Clarity** | lines 36–43, tag id `vykppujn5k` | Session **recordings**, **heatmaps** (scroll + click), rage/dead clicks, JS errors. Supports **custom tags** (`clarity('set', ...)`) and **custom events** (`clarity('event', ...)`) — currently **unused**. |
| Tally (feedback form) | line 34 | Not analytics; embedded feedback widget. |

**Verified — what is NOT present today:**

- **No custom scroll-depth tracking.** The only scroll listener in the file (lines 25219–25225) just toggles the nav shadow class on `window.scrollY > 20`. It fires no analytics.
- **No CTA-click event tracking.** Every signup CTA calls `openAuthModal('signup')` directly (definition at line 10199) with **no** analytics call inside it.
- **No GA4 / GTM / Plausible / PostHog / Mixpanel / Segment / Amplitude.** Confirmed by search — zero `clarity('event'|'set')` calls and zero third-party event SDKs.

**The signup CTAs in question** (all call `openAuthModal('signup')`):

| Location | Line | Label |
|----------|------|-------|
| Sticky nav | 3527 | Mulai Gratis |
| Hero (primary) | 3541 | Temukan Produk Terlaris |
| Pricing plan — Free | 4314 | Mulai Gratis |
| Pricing plan — Pro | 4337 | Beli Sekarang |
| Pricing plan — Business | 4359 | Beli Sekarang |
| Deep-dive AI preview | 4466 | Mulai Gratis — Lihat Lebih Lengkap |
| Mid-page CTA | 4479 | Mulai Gratis |
| Banner CTA | 4499 | (banner button) |
| Mobile sticky bar | 4566 | Mulai Gratis |

(There is no element literally named "multi" — the product owner's "multi" refers to the **primary "Mulai Gratis" CTA**. The hero primary button at line 3541 is the top-of-page primary; "Mulai Gratis" buttons are the repeated primary CTA throughout.)

---

## 2. What the current stack CAN and CANNOT answer

### CAN answer (qualitative, available now via Clarity)

- **Roughly how far do people scroll?** Clarity's **scroll heatmap** shows the % of sessions that reached each vertical band of the page (e.g. "only 40% of visitors reach the pricing section").
- **Where do people click?** Clarity's **click heatmap** shows which CTAs get the most clicks — including whether the **hero** CTA or a **lower** CTA (pricing/banner) gets more attention.
- **What does the path look like?** Session **recordings** let you watch real visitors: do they read down then sign up, or click the first button immediately.
- **Friction signals:** rage clicks, dead clicks, quick-backs.

### CANNOT answer (no quantitative funnel today)

- **"What % of users scroll past 75% before signing up?"** — no scroll milestone events, so no number, no per-session join to signup.
- **"Which CTA drives signups?"** — Clarity click heatmaps count *clicks*, not *which CTA preceded a signup*. There is no event tying a specific button to the `openAuthModal('signup')` → account-created funnel.
- **Cloudflare contributes nothing here** beyond top-line pageviews — it has no scroll/click/event capability on the page.
- **No segmentation** of scroll/click behavior by signed-up vs bounced (Clarity custom tags would enable this — currently unused).

**Honest summary:** the heatmaps will give the product owner a confident *directional* answer this week. They will **not** give a defensible *percentage* funnel until the events in Section 4 are added.

---

## 3. How to check the answer in Clarity right now (interim)

Log in to [clarity.microsoft.com](https://clarity.microsoft.com) → LarisID project (tag `vykppujn5k`):

1. **Heatmaps → Scroll heatmap.** Select the landing page URL. Set the date range (last 7–30 days). Read the "average fold" / scroll-reach bands: the line where reach drops below ~50% tells you how far a typical visitor gets. If most sessions die above the pricing section, users are **clicking the CTA early, not scrolling deep**.
2. **Heatmaps → Click heatmap.** Same URL. Compare click counts on the **hero "Temukan Produk Terlaris"** button vs the **pricing "Mulai Gratis"/"Beli Sekarang"** buttons vs the **banner / mobile sticky bar**. The CTA with the dominant share answers "are they clicking the primary CTA?"
3. **Recordings.** Filter recordings where a click on a signup button occurred (or sort by session length). Watch 10–15: note whether they scroll the full page first or convert near the top. This is the qualitative cross-check on the heatmaps.
4. **Mobile vs desktop.** Toggle the device filter on the scroll heatmap — mobile users (the mobile sticky bar at line 4566 is always visible) likely convert without scrolling, which would skew the overall picture.
5. **Compare separately on desktop and mobile**, because the mobile sticky CTA removes the need to scroll to a button at all.

This gives a directional answer today. For a number, ship Section 4.

---

## 4. Recommended event instrumentation spec (SPEC — not implemented)

Goal: produce a quantitative answer — **scroll-depth milestones** and a **CTA-click event** per CTA, both segmentable by whether the session later signed up. Clarity is the right home for this (Cloudflare Web Analytics has no usable custom-event API on the page). All hooks go in `index.html`.

### 4.1 Scroll-depth milestones (25 / 50 / 75 / 100%)

Add **one** listener that fires a Clarity event once per milestone per page load. This is the *only* new scroll listener needed — it can sit right after the existing nav-shadow listener (around line 25225). It must **not** replace that listener.

```js
// SPEC — scroll-depth milestones (add near line 25225, after nav-shadow listener)
(function () {
  var fired = {};                       // de-dupe: each milestone fires once
  var marks = [25, 50, 75, 100];
  function onScroll() {
    var doc = document.documentElement;
    var scrolled = (window.scrollY + window.innerHeight) / doc.scrollHeight * 100;
    marks.forEach(function (m) {
      if (!fired[m] && scrolled >= m) {
        fired[m] = true;
        if (window.clarity) {
          clarity('event', 'scroll_depth_' + m);   // discrete event per milestone
          clarity('set', 'max_scroll', String(m)); // tag = deepest milestone reached
        }
      }
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
})();
```

- `clarity('event', 'scroll_depth_75')` → countable, filterable event in Clarity ("Smart events"/filters).
- `clarity('set', 'max_scroll', '75')` → a **custom tag** on the session, so you can later filter recordings/heatmaps by deepest scroll, and (crucially) cross with the signup tag below.
- Throttle with `requestAnimationFrame` if needed; de-dupe (`fired`) already prevents event spam.

### 4.2 CTA-click event

The cleanest, lowest-risk hook is **inside `openAuthModal`** (line 10199) — every signup CTA already routes through it — plus passing a source label from each button. Spec:

**Step A — extend the function to accept a source and emit an event:**

```js
// SPEC — modify openAuthModal (line 10199)
function openAuthModal(mode, source) {
  if (window.clarity && mode === 'signup') {
    clarity('event', 'cta_signup_click');
    clarity('set', 'signup_cta_source', source || 'unknown'); // which button
  }
  _authMode = mode || 'login';
  document.getElementById('auth-overlay').style.display = 'flex';
  renderAuthModal();
  var inv = document.getElementById('auth-invite-code');
  if (inv) inv.value = getPendingInvite();
}
```

**Step B — pass a `source` label from each signup CTA** so we can tell *which* CTA drove the click (answers "hero vs pricing vs banner"):

| Line | Current | Spec change (2nd arg) |
|------|---------|------------------------|
| 3527 | `openAuthModal('signup')` | `openAuthModal('signup','nav')` |
| 3541 | `openAuthModal('signup')` | `openAuthModal('signup','hero')` |
| 4314 | `openAuthModal('signup')` | `openAuthModal('signup','pricing_free')` |
| 4337 | `openAuthModal('signup')` | `openAuthModal('signup','pricing_pro')` |
| 4359 | `openAuthModal('signup')` | `openAuthModal('signup','pricing_business')` |
| 4466 | `openAuthModal('signup')` | `openAuthModal('signup','deepdive_ai')` |
| 4479 | `openAuthModal('signup')` | `openAuthModal('signup','midpage')` |
| 4499 | `openAuthModal('signup')` | `openAuthModal('signup','banner')` |
| 4566 | `openAuthModal('signup')` | `openAuthModal('signup','mobile_sticky')` |

> Backward-compatible: `source` is optional; existing `login` calls are unaffected.

### 4.3 Signup-completed event (closes the funnel)

To answer "scrolling *before* signing up", tag the session when an account is actually created. In the signup success path (the Supabase `signUp` success handler — search `signUp` near the auth submit logic), add:

```js
// SPEC — in signup success handler
if (window.clarity) {
  clarity('event', 'signup_success');
  clarity('set', 'signed_up', 'true');
}
```

### 4.4 How this answers the question

With the three events above, in Clarity you can:

- **Filter sessions by `signed_up = true`**, then open the **scroll heatmap** for that segment → "of users who signed up, what scroll depth did they reach?" (the core question, now quantitative).
- **Compare `scroll_depth_75` event rate** for signed-up vs all sessions → are deep scrollers more likely to convert.
- **Break down `signup_cta_source`** → exact share of signups from the hero "primary CTA" vs pricing vs banner vs mobile sticky → "are they just clicking the primary CTA?" answered with a number.

### 4.5 Notes / guardrails

- **Cloudflare** stays as-is (pageviews/Web Vitals). It has no first-class custom-event API exposed here, so do **not** try to route these events through it; Clarity is the funnel store.
- **Privacy / MISSION alignment:** these are anonymous behavioral events (scroll %, which button, signup yes/no) — no PII, consistent with honest, non-predatory analytics. Do not add per-user identifying tags. If a consent banner is ever added, gate Clarity custom events behind it.
- **Effort:** ~15 lines of new JS + 9 one-arg edits. Low risk; the scroll listener is `passive` and de-duped.
- **Validation:** after shipping, use Clarity's live/"Smart events" view and the `clarity('event', ...)` debug to confirm events arrive before trusting the funnel.
