#!/usr/bin/env node
/** Sweep trend pipeline for zero/negative/flat weeks across multi-scrape products. */
const SUPA_URL = process.env.LARISID_API_URL || 'https://api.larisid.com';
const SUPA_KEY = 'sb_publishable_KDSWIJJLckser1e1hk7bbA_yMChRPog';
const HDR = { apikey: SUPA_KEY, Authorization: `Bearer ${SUPA_KEY}` };

const DD_TREND_CAT_MULT = { 'Rumah':2.94,'Fashion':2.77,'Dapur':3.41,'Kamar Mandi':4.21,'Keamanan':3.40,
  'Kecantikan':2.70,'Motor & Mobil':2.96,'Elektronik':3.10,'HP & Gadget':3.40,
  'Hewan Peliharaan':3.95,'Sepeda':2.58,'Taman':3.50,'Olahraga':2.68,'Bayi & Anak':4.12,
  'Hobi & Kerajinan':2.48,'Kesehatan':2.38,'Tanaman':3.63,'Alat Tulis':2.87,
  'Outdoor & Camping':2.67,'__default__':3.20 };
const DD_TREND_MO = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];

function ddTrendCatMult(c) { return DD_TREND_CAT_MULT[c] || DD_TREND_CAT_MULT['__default__']; }
function ddTrendSoldIsBucket(sold, soldTier) {
  const s = sold ?? 0;
  if (soldTier != null && soldTier > 0 && soldTier === s) return true;
  if (s >= 10000) return true;
  return [1,2,5,10,50,100,500,1000,2000,3000,5000,7000,8000,9000].includes(s);
}
function ddTrendBucketFloor(sold, soldTier) {
  const s = sold ?? 0;
  if (soldTier != null && soldTier > 0) return soldTier;
  if (s >= 1000000) return 1000000;
  if (s >= 100000) return Math.floor(s / 1000);
  if (s >= 10000) return 10000;
  return s;
}
function ddTrendMedianRate(rates) {
  if (!rates?.length) return 0;
  const sorted = [...rates].sort((a,b)=>a-b);
  const mid = Math.floor(sorted.length/2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid-1]+sorted[mid])/2;
}
function ddTrendSanitizeRows(rows) {
  if (!Array.isArray(rows) || rows.length < 2) return rows || [];
  let trimmed = rows;
  if (rows.some(r => (r.total_sold ?? 0) > 0)) {
    let start = 0;
    while (start < rows.length - 1 && (rows[start].total_sold ?? 0) <= 0) start++;
    if (start > 0) trimmed = rows.slice(start);
  }
  let maxSold = trimmed[0].total_sold ?? 0, maxRev = trimmed[0].reviews ?? 0;
  return trimmed.map((r,i) => {
    if (i === 0) return r;
    let s = r.total_sold ?? 0, rv = r.reviews ?? 0, fixed = false;
    if (s < maxSold) { s = maxSold; fixed = true; } else maxSold = s;
    if (rv < maxRev) { rv = maxRev; fixed = true; } else maxRev = rv;
    return fixed ? { ...r, total_sold: s, reviews: rv } : r;
  });
}
function ddTrendDedupeRows(dbRows) {
  let rows = dbRows || [];
  const seenTs = new Set();
  rows = rows.filter(r => { if (seenTs.has(r.scraped_at)) return false; seenTs.add(r.scraped_at); return true; });
  const dayMap = new Map();
  for (const r of rows) {
    const day = r.scraped_at?.slice(0,10);
    if (!day) continue;
    const cur = dayMap.get(day);
    if (!cur || (r.total_sold ?? 0) > (cur.total_sold ?? 0)) dayMap.set(day, r);
  }
  return ddTrendSanitizeRows([...dayMap.values()].sort((a,b)=>new Date(a.scraped_at)-new Date(b.scraped_at)));
}
function ddTrendMondayOf(d) {
  const date = new Date(+d);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  date.setHours(0,0,0,0);
  return date;
}
function ddTrendWKey(d) { return ddTrendMondayOf(d).toISOString().slice(0,10); }
function ddTrendWLabel(d) { const m = ddTrendMondayOf(d); return `${m.getDate()} ${DD_TREND_MO[m.getMonth()]}`; }
function ddTrendRawSoldUnchanged(rows) {
  if (!rows?.length) return false;
  const s0 = rows[0].total_sold ?? 0;
  return rows.every(r => (r.total_sold ?? 0) === s0);
}
function ddTrendHasReviewMovement(rows) {
  for (let i=1;i<rows.length;i++) if ((rows[i].reviews??0)>(rows[i-1].reviews??0)) return true;
  return false;
}
function ddTrendReviewEstTotal(rows, category) {
  const mult = ddTrendCatMult(category || rows[rows.length-1]?.category);
  let total = 0;
  for (let i=1;i<rows.length;i++) total += Math.max(0,(rows[i].reviews??0)-(rows[i-1].reviews??0))*mult;
  return Math.round(total);
}
function ddTrendHasMeaningfulReviewSignal(rows, category, minUnits=15) {
  return ddTrendReviewEstTotal(rows, category) >= minUnits;
}
function ddTrendSoldImpliedWeeklyRate(sold) {
  if (!sold || sold <= 0) return 0;
  return Math.max(1, Math.round(sold / 13));
}
function ddTrendSelfWeeklyRateFromDeltas(dbRows, corrDeltas) {
  const rates = [];
  for (let i=0;i<(corrDeltas?.length||0);i++) {
    if ((corrDeltas[i]??0)<=0) continue;
    const gapDays = Math.max(1,(new Date(dbRows[i+1].scraped_at)-new Date(dbRows[i].scraped_at))/86400000);
    rates.push(corrDeltas[i]/(gapDays/7));
  }
  return ddTrendMedianRate(rates);
}
function ddTrendFillZeroDeltas(dbRows, corrDeltas, listing, opts={}) {
  const { peerWeeklyRate=0, selfWeeklyRate=0 } = opts;
  const sold = listing?.total_sold ?? dbRows[dbRows.length-1]?.total_sold ?? 0;
  const fallbackRate = peerWeeklyRate || selfWeeklyRate || ddTrendSoldImpliedWeeklyRate(sold);
  let filled = false;
  for (let i=0;i<corrDeltas.length;i++) {
    if ((corrDeltas[i]??0)>0) continue;
    const gapDays = Math.max(1,(new Date(dbRows[i+1].scraped_at)-new Date(dbRows[i].scraped_at))/86400000);
    corrDeltas[i] = Math.max(1, Math.round(fallbackRate*gapDays/7));
    filled = true;
  }
  return filled;
}
function ddTrendComputeDeltas(dbRows, listing) {
  const category = listing?.category || dbRows[dbRows.length-1]?.category;
  const mult = ddTrendCatMult(category);
  const atBucket = dbRows.every(r => ddTrendSoldIsBucket(r.total_sold, r.sold_tier));
  const hasReviews = dbRows.some(r => (r.reviews??0)>0);
  let unitData, isEstimated=false;
  if (atBucket && hasReviews) {
    isEstimated = true;
    let base = ddTrendBucketFloor(dbRows[0].total_sold, dbRows[0].sold_tier);
    unitData = [base];
    for (let i=1;i<dbRows.length;i++) {
      const revDelta = Math.max(0,(dbRows[i].reviews||0)-(dbRows[i-1].reviews||0));
      base += Math.round(revDelta*mult);
      unitData.push(base);
    }
  } else if (atBucket && !hasReviews) {
    isEstimated = true;
    unitData = dbRows.map(r => ddTrendBucketFloor(r.total_sold, r.sold_tier));
  } else {
    unitData = dbRows.map(r => r.total_sold??0);
  }
  const corrDeltas = [];
  for (let i=0;i<dbRows.length-1;i++) {
    const s0raw=dbRows[i].total_sold??0, s1raw=dbRows[i+1].total_sold??0;
    const s0=unitData[i]??0, s1=unitData[i+1]??0;
    const bucket0=ddTrendSoldIsBucket(s0raw,dbRows[i].sold_tier);
    const bucket1=ddTrendSoldIsBucket(s1raw,dbRows[i+1].sold_tier);
    const rawDelta = bucket0&&bucket1&&s1raw===s0raw?0:Math.max(0,s1-s0);
    const revDelta = Math.max(0,(dbRows[i+1].reviews??0)-(dbRows[i].reviews??0));
    const reviewEst = Math.round(revDelta*mult);
    const est0=dbRows[i].est_sold, est1=dbRows[i+1].est_sold;
    const estDelta = (est0!=null&&est1!=null&&est1>est0)?est1-est0:0;
    if (s0raw<10000&&s1raw>=10000) { isEstimated=true; corrDeltas.push(reviewEst); }
    else if (bucket0&&bucket1&&rawDelta===0&&revDelta>0) { isEstimated=true; corrDeltas.push(reviewEst); }
    else if (s0raw>=10000&&s1raw>=10000&&!atBucket) { isEstimated=true; corrDeltas.push(reviewEst); }
    else if (rawDelta>0&&reviewEst>0&&rawDelta>reviewEst*5) { isEstimated=true; corrDeltas.push(reviewEst); }
    else if (rawDelta===0&&revDelta>0) { isEstimated=true; corrDeltas.push(reviewEst); }
    else if (rawDelta>0) corrDeltas.push(rawDelta);
    else if (estDelta>0) { isEstimated=true; corrDeltas.push(estDelta); }
    else corrDeltas.push(0);
  }
  return { corrDeltas, isEstimated, mult, atBucket };
}
function ddTrendBuildWeeklyRows(dbRows, corrDeltas, fallbackPrice=0) {
  const weekMap = new Map();
  for (const r of dbRows) {
    const key = ddTrendWKey(new Date(r.scraped_at));
    if (!weekMap.has(key)) weekMap.set(key, { label: ddTrendWLabel(new Date(r.scraped_at)), units:0, omset:0, days:0, firstDate: ddTrendMondayOf(new Date(r.scraped_at)) });
  }
  for (let i=0;i<dbRows.length-1;i++) {
    const t0=new Date(dbRows[i].scraped_at), t1=new Date(dbRows[i+1].scraped_at);
    const p0=dbRows[i].price||fallbackPrice, p1=dbRows[i+1].price||fallbackPrice;
    const delta=corrDeltas[i]??0;
    const daysDiff=Math.max(1,(t1-t0)/86400000);
    const dUnit=delta/daysDiff;
    for (let d=1;d<=Math.ceil(daysDiff);d++) {
      const date=new Date(t0.getTime()+d*86400000);
      if (date>t1) break;
      const frac=d/daysDiff;
      const key=ddTrendWKey(date);
      if (!weekMap.has(key)) weekMap.set(key, { label: ddTrendWLabel(date), units:0, omset:0, days:0, firstDate: ddTrendMondayOf(date) });
      const wk=weekMap.get(key);
      wk.units+=dUnit; wk.omset+=dUnit*(p0+(p1-p0)*frac); wk.days+=1;
    }
  }
  let weeks=[...weekMap.values()].sort((a,b)=>a.firstDate-b.firstDate).map(w=>{
    const scale=w.days>0&&w.days<7?7/w.days:1;
    return { label:w.label, units:Math.round(w.units*scale), omset:Math.round(w.omset*scale) };
  });
  while (weeks.length>1&&weeks[weeks.length-1].units<=0) weeks.pop();
  while (weeks.length>1&&weeks[0].units<=0) weeks.shift();
  return weeks;
}
function ddTrendWeeksAreFlatNoise(weeks, minUnits=5) {
  if (!weeks?.length||weeks.length<2) return false;
  const units=weeks.map(w=>w.units);
  const mx=Math.max(...units);
  if (mx>=minUnits) return false;
  return mx-Math.min(...units)<=1;
}
function isPerfectlyFlat(weeks) {
  if (weeks.length < 3) return false;
  const u = weeks.map(w => w.units);
  return Math.max(...u) - Math.min(...u) === 0 && u[0] > 0;
}

function computeTrend(dbRows, listing) {
  dbRows = ddTrendDedupeRows(dbRows);
  if (dbRows.length < 2) return { skip: true, reason: 'short' };
  const rawSoldFlat = ddTrendRawSoldUnchanged(dbRows);
  const trendCategory = listing?.category || dbRows[dbRows.length-1]?.category;
  const meaningfulRev = ddTrendHasMeaningfulReviewSignal(dbRows, trendCategory);
  let { corrDeltas, isEstimated } = ddTrendComputeDeltas(dbRows, listing);
  const selfWeeklyRate = ddTrendSelfWeeklyRateFromDeltas(dbRows, corrDeltas);
  const impliedRate = ddTrendSoldImpliedWeeklyRate(listing?.total_sold ?? dbRows[dbRows.length-1]?.total_sold ?? 0);
  const skipSyntheticFill = rawSoldFlat && !meaningfulRev;
  if (!skipSyntheticFill) {
    ddTrendFillZeroDeltas(dbRows, corrDeltas, listing, { peerWeeklyRate: impliedRate*0.8, selfWeeklyRate });
    isEstimated = true;
  }
  let weeks = ddTrendBuildWeeklyRows(dbRows, corrDeltas, listing?.price ?? dbRows[dbRows.length-1]?.price ?? 0);
  const totalUnits = weeks.reduce((s,w)=>s+w.units,0);
  if (!skipSyntheticFill && rawSoldFlat && !meaningfulRev && (totalUnits===0||ddTrendWeeksAreFlatNoise(weeks))) {
    weeks = [];
  }
  return { dbRows, corrDeltas, weeks, rawSoldFlat, meaningfulRev, isEstimated, skipSyntheticFill };
}

async function fetchJson(path) {
  const r = await fetch(`${SUPA_URL}/rest/v1/${path}`, { headers: HDR });
  return r.json();
}

async function main() {
  // Multi-scrape products from older window
  const items = await fetchJson(
    'listings?select=item_id,shop_id,total_sold,reviews,category,price&scraped_at=lt.2026-06-01&total_sold=gt.0&order=scraped_at.desc&limit=200'
  );
  const seen = new Set();
  const candidates = [];
  for (const row of items) {
    const k = `${row.item_id}_${row.shop_id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    candidates.push(row);
    if (candidates.length >= 40) break;
  }

  const issues = { zeroWeek: [], negWeek: [], flatNoise: [], perfectlyFlat: [] };
  const flatExamples = [];

  await Promise.all(candidates.map(async (listing) => {
    const k = `${listing.item_id}_${listing.shop_id}`;
    const hist = await fetchJson(
      `listings?select=scraped_at,total_sold,price,reviews,category,est_sold,sold_tier&item_id=eq.${listing.item_id}&shop_id=eq.${listing.shop_id}&order=scraped_at.asc&limit=80`
    );
    if (!Array.isArray(hist) || hist.length < 3) return;
    const r = computeTrend(hist, listing);
    if (r.skip) return;
    const units = r.weeks.map(w => w.units);
    if (units.some(u => u === 0)) issues.zeroWeek.push({ k, units, sold: listing.total_sold, raw: r.dbRows.map(x=>x.total_sold) });
    if (units.some((u,i) => i>0 && u < units[i-1])) issues.negWeek.push({ k, units });
    if (ddTrendWeeksAreFlatNoise(r.weeks)) issues.flatNoise.push({ k, units });
    if (isPerfectlyFlat(r.weeks)) {
      issues.perfectlyFlat.push({ k, units, sold: listing.total_sold, rawSoldFlat: r.rawSoldFlat, meaningfulRev: r.meaningfulRev, deltas: r.corrDeltas, soldSeries: r.dbRows.map(x=>({d:x.scraped_at.slice(0,10),s:x.total_sold,r:x.reviews})) });
      flatExamples.push(r);
    }
  }));

  console.log(JSON.stringify({ checked: candidates.length, issues: {
    zeroWeek: issues.zeroWeek.length,
    negWeek: issues.negWeek.length,
    flatNoise: issues.flatNoise.length,
    perfectlyFlat: issues.perfectlyFlat.length,
  }, perfectlyFlat: issues.perfectlyFlat.slice(0,5) }, null, 2));
}
main().catch(e => { console.error(e); process.exit(1); });
