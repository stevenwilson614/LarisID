/**
 * Always-visible side tab from LarisID static pages onto LarisExpor.
 *
 * CSS-only, no JS display toggle — an ID rule in a stylesheet once silently
 * beat a JS style.display toggle and hid the Kohort sidebar button for months.
 * Styles live in styles/seo-pages.css (.expor-tab). On /expor/ pages the mirror
 * tab (class="expor-tab to-laris") is emitted by scripts/build-expor.mjs.
 */
export const EXPOR_TAB = `<a class="expor-tab" href="/expor/" title="Ke LarisExpor — riset ekspor produk Indonesia">
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
  LarisExpor
</a>`;
