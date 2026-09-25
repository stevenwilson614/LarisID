/* Serve /s/{slug} even when the slug looks like a filename (obrolan.marketing). */
export async function onRequest(context) {
  const url = new URL(context.request.url);
  if (/^\/s\/[^/]+\/?$/.test(url.pathname)) {
    const assets = context.env && context.env.ASSETS;
    if (assets && typeof assets.fetch === 'function') {
      return assets.fetch(new URL('/school/index.html', url.origin));
    }
  }
  return context.next();
}
