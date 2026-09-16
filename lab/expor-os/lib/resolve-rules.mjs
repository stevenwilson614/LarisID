/** Merge kategori pack + per-slug overlay. */

const RISK = new Set(['aman', 'izin_khusus', 'tinggi', 'cek']);

export function resolveUsRule(rulesDoc, { slug, kategori }) {
  const pack = rulesDoc.by_kategori?.[kategori] || null;
  const over = rulesDoc.by_slug?.[slug] || null;
  if (!pack && !over) return null;
  const merged = {
    rule_id: pack?.rule_id || over?.rule_id || slug,
    risk: over?.risk || pack?.risk || 'cek',
    agencies: unique([...(pack?.agencies || []), ...(over?.agencies || [])]),
    flags: unique([...(pack?.flags || []), ...(over?.flags || [])]),
    notes_id: over?.notes_id || pack?.notes_id || '',
    sources: unique([...(pack?.sources || []), ...(over?.sources || [])]),
    checklist_us: unique([...(over?.checklist_us || []), ...(pack?.checklist_us || [])]),
    from_kategori: Boolean(pack),
    from_slug: Boolean(over),
  };
  if (!RISK.has(merged.risk)) merged.risk = 'cek';
  return merged;
}

export function unique(arr) {
  return [...new Set(arr.filter(Boolean))];
}

export function validateRulesDoc(rulesDoc, { keywords, pilots }) {
  const errors = [];
  const katSet = new Set(keywords.map((k) => k.kategori));
  const slugSet = new Set(keywords.map((k) => k.slug));
  for (const kat of katSet) {
    if (!rulesDoc.by_kategori?.[kat]) errors.push(`missing by_kategori pack: ${kat}`);
  }
  for (const [kat, pack] of Object.entries(rulesDoc.by_kategori || {})) {
    if (!RISK.has(pack.risk)) errors.push(`bad risk for kategori ${kat}: ${pack.risk}`);
    if (!pack.notes_id) errors.push(`empty notes_id for kategori ${kat}`);
    if (!pack.sources?.length) errors.push(`no sources for kategori ${kat}`);
  }
  for (const slug of pilots || []) {
    if (!slugSet.has(slug)) errors.push(`pilot slug not in corpus: ${slug}`);
    const kw = keywords.find((k) => k.slug === slug);
    const resolved = resolveUsRule(rulesDoc, { slug, kategori: kw?.kategori });
    if (!resolved) errors.push(`no US rule for pilot ${slug}`);
  }
  for (const slug of Object.keys(rulesDoc.by_slug || {})) {
    if (!slugSet.has(slug)) errors.push(`by_slug not in corpus: ${slug}`);
  }
  return errors;
}
