// Shared analytics <head> snippet for every generated static page.
//
// Why this exists: until 2026-08-23 the generated content pages carried the
// Google Ads tag and nothing else — no Clarity, no Cloudflare beacon — and the
// leaf pages carried nothing at all. Google sends ~57 sessions a week into
// /riset/, /panduan/ and /perbandingan/ and none of it was measurable. Worse,
// each generator kept its own copy of the tag, so a regenerated hub could
// silently strip conversion tracking.
//
// One constant, imported by all four generators, is the fix. Add a tag here and
// every page gets it on the next build.
//
// Keep CF_BEACON_TOKEN in sync with index.html:194. The token that shipped
// before this file (7cada224…) was dead and returned zero rows for every
// window; the live site tag is the one below. Verify after changing it with:
//   rumPageloadEventsAdaptiveGroups(filter:{siteTag:"<token>"}) — see
//   reference_larisid_analytics in memory for the full query.

export const GTAG_ID = 'AW-862519971';
export const CLARITY_ID = 'vykppujn5k';
export const CF_BEACON_TOKEN = 'c47631101f894583b52191104f6ef5ad';

/** Google Ads / gtag. Kept as its own export because some hubs already
 *  reference `GTAG` by name and post-injected copies exist in committed HTML. */
export const GTAG = `<!-- Google tag (gtag.js) -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${GTAG_ID}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());

  gtag('config', '${GTAG_ID}');
</script>`;

/** Clarity, deferred to the load event so it never competes with first paint.
 *  Static pages have no larisIdle(), so this uses requestIdleCallback directly
 *  with a setTimeout fallback — same intent as the app shell in index.html. */
export const CLARITY = `<!-- Microsoft Clarity -->
<script type="text/javascript">
  window.clarity = window.clarity || function () { (window.clarity.q = window.clarity.q || []).push(arguments); };
  window.addEventListener('load', function () {
    var start = function () {
      (function(c,l,a,r,i,t,y){
        c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
        t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
        y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
      })(window, document, "clarity", "script", "${CLARITY_ID}");
    };
    if (typeof requestIdleCallback === 'function') requestIdleCallback(start, { timeout: 3000 });
    else setTimeout(start, 1500);
  });
</script>`;

/** Cloudflare Web Analytics beacon (RUM: pageviews, referrers, Web Vitals). */
export const CF_BEACON =
  `<script defer src='https://static.cloudflareinsights.com/beacon.min.js' ` +
  `data-cf-beacon='{"token": "${CF_BEACON_TOKEN}"}'></script>`;

/** The whole set. Put this in every generated <head>, hub and leaf alike. */
export const ANALYTICS = `${GTAG}
${CLARITY}
${CF_BEACON}`;

export default ANALYTICS;
