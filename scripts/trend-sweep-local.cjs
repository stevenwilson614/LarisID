#!/usr/bin/env node
/** Local trend sweep — reads JSON files from scripts/ dir (no network). */
const fs = require('fs');
const path = require('path');
const dir = __dirname;

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
    const rawS = r.total_sold ?? 0;
    const soldGlitch = fixed && (rawS === 0 || rawS < maxSold * 0.5);
    return fixed ? { ...r, total_sold: s, reviews: rv, _soldFixed: true, _soldGlitch: soldGlitch || undefined } : r;
  });
}
function ddTrendWeeksAreVisuallyFlat(weeks, minWeeks = 3) {
  if (!weeks?.length || weeks.length < minWeeks) return false;
  const units = weeks.map(w => w.units).filter(u => u > 0);
  if (units.length < minWeeks) return false;
  return Math.max(...units) - Math.min(...units) === 0;
}
function ddTrendReviewBiasedDayWeights(daysDiff, exp = 1.18) {
  const n = Math.max(1, Math.ceil(daysDiff));
  const weights = [];
  let sum = 0;
  for (let d = 1; d <= n; d++) {
    const f0 = (d - 1) / daysDiff;
    const f1 = Math.min(1, d / daysDiff);
    const w = Math.pow(f1, exp) - Math.pow(f0, exp);
    weights.push(w); sum += w;
  }
  if (sum <= 0) return weights.map(() => 1 / n);
  return weights.map(w => w / sum);
}
function ddTrendAdjustGlitchRecoveryDeltas(dbRows, corrDeltas, unitData) {
  if (!dbRows?.length || corrDeltas.length !== dbRows.length - 1) return;
  let i = 0;
  while (i < dbRows.length) {
    if (!dbRows[i]._soldGlitch) { i++; continue; }
    let runStart = i;
    while (i < dbRows.length && dbRows[i]._soldGlitch) i++;
    const landIdx = i;
    if (landIdx >= dbRows.length) break;
    const anchor = runStart > 0 ? runStart - 1 : runStart;
    const totalRecovery = Math.max(0, (unitData[landIdx] ?? 0) - (unitData[anchor] ?? 0));
    if (totalRecovery <= 0) continue;
    const t0 = new Date(dbRows[anchor].scraped_at);
    const t1 = new Date(dbRows[landIdx].scraped_at);
    const totalDays = Math.max(1, (t1 - t0) / 86400000);
    for (let k = anchor; k < landIdx; k++) {
      const a = new Date(dbRows[k].scraped_at);
      const b = new Date(dbRows[k + 1].scraped_at);
      const days = Math.max(1, (b - a) / 86400000);
      corrDeltas[k] = Math.round(totalRecovery * (days / totalDays));
    }
  }
}
function ddTrendBreakFlatEstimatedWeeks(weeks) {
  if (!ddTrendWeeksAreVisuallyFlat(weeks)) return weeks;
  const total = weeks.reduce((s, w) => s + w.units, 0);
  if (total <= 0) return weeks;
  const pattern = weeks.length >= 5 ? [0.92, 0.96, 1.0, 1.04, 1.08] : [0.94, 0.98, 1.02, 1.06];
  const weights = weeks.map((_, i) => pattern[i % pattern.length]);
  const wSum = weights.reduce((s, w) => s + w, 0);
  let allocated = 0;
  return weeks.map((w, i) => {
    const units = i < weeks.length - 1 ? Math.max(1, Math.round(total * weights[i] / wSum)) : Math.max(0, total - allocated);
    allocated += units;
    return { ...w, units, omset: w.omset && w.units ? Math.round(w.omset * units / w.units) : w.omset };
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
  if (!rates.length) return 0;
  rates.sort((a,b)=>a-b);
  return rates[Math.floor(rates.length/2)];
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
function ddTrendComputeDeltas(dbRows, listing, opts={}) {
  const category = listing?.category || dbRows[dbRows.length-1]?.category;
  const mult = ddTrendCatMult(category);
  const atBucket = dbRows.every(r => ddTrendSoldIsBucket(r.total_sold, r.sold_tier));
  const hasReviews = dbRows.some(r => (r.reviews??0)>0);
  let unitData, isEstimated=false;
  if (atBucket && hasReviews && !opts.isPeerEstimated) {
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
  } else unitData = dbRows.map(r => r.total_sold??0);
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
  ddTrendAdjustGlitchRecoveryDeltas(dbRows, corrDeltas, unitData);
  return { corrDeltas, isEstimated, atBucket };
}
function ddTrendBuildWeeklyRows(dbRows, corrDeltas, fallbackPrice=0, opts={}) {
  const { reviewBiased=false, reviewBiasExp=1.18 } = opts;
  const weekMap = new Map();
  for (const r of dbRows) {
    const key = ddTrendWKey(new Date(r.scraped_at));
    if (!weekMap.has(key)) weekMap.set(key, { label: ddTrendWLabel(new Date(r.scraped_at)), units:0, days:0, firstDate: ddTrendMondayOf(new Date(r.scraped_at)) });
  }
  for (let i=0;i<dbRows.length-1;i++) {
    const t0=new Date(dbRows[i].scraped_at), t1=new Date(dbRows[i+1].scraped_at);
    const delta=corrDeltas[i]??0;
    const daysDiff=Math.max(1,(t1-t0)/86400000);
    const dayWeights = reviewBiased && delta > 0 ? ddTrendReviewBiasedDayWeights(daysDiff, reviewBiasExp) : null;
    const dayCount = Math.ceil(daysDiff);
    for (let d=1;d<=dayCount;d++) {
      const date=new Date(t0.getTime()+d*86400000);
      if (date>t1) break;
      const dUnit = dayWeights ? delta * dayWeights[d - 1] : delta / daysDiff;
      const key=ddTrendWKey(date);
      if (!weekMap.has(key)) weekMap.set(key, { label: ddTrendWLabel(date), units:0, days:0, firstDate: ddTrendMondayOf(date) });
      weekMap.get(key).units+=dUnit; weekMap.get(key).days+=1;
    }
  }
  let weeks=[...weekMap.values()].sort((a,b)=>a.firstDate-b.firstDate).map(w=>{
    const scale=w.days>0&&w.days<7?7/w.days:1;
    return { label:w.label, units:Math.round(w.units*scale) };
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
  return ddTrendWeeksAreVisuallyFlat(weeks);
}

function computeTrend(hist, listing) {
  let dbRows = ddTrendDedupeRows(hist);
  if (dbRows.length < 2) return null;
  const rawSoldFlat = ddTrendRawSoldUnchanged(dbRows);
  const trendCategory = listing?.category || dbRows[dbRows.length-1]?.category;
  const meaningfulRev = ddTrendHasMeaningfulReviewSignal(dbRows, trendCategory);
  let { corrDeltas, isEstimated, atBucket } = ddTrendComputeDeltas(dbRows, listing);
  const selfWeeklyRate = ddTrendSelfWeeklyRateFromDeltas(dbRows, corrDeltas);
  const skipSyntheticFill = rawSoldFlat && !meaningfulRev;
  if (!skipSyntheticFill) {
    if (ddTrendFillZeroDeltas(dbRows, corrDeltas, listing, { peerWeeklyRate: selfWeeklyRate || ddTrendSoldImpliedWeeklyRate(listing?.total_sold ?? dbRows.at(-1)?.total_sold), selfWeeklyRate })) isEstimated = true;
  }
  let weeks = ddTrendBuildWeeklyRows(dbRows, corrDeltas, listing?.price, { reviewBiased: isEstimated });
  if (isEstimated) weeks = ddTrendBreakFlatEstimatedWeeks(weeks);
  const totalUnits = weeks.reduce((s,w)=>s+w.units,0);
  if (!skipSyntheticFill && rawSoldFlat && !meaningfulRev && (totalUnits===0||ddTrendWeeksAreFlatNoise(weeks))) weeks = [];
  return { weeks, corrDeltas, rawSoldFlat, meaningfulRev, atBucket, dbRows, skipSyntheticFill, isEstimated, totalUnits };
}

function analyzeFile(file, listingOverride={}) {
  const hist = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(hist) || hist.length < 2) return null;
  const listing = { ...listingOverride, total_sold: hist.at(-1)?.total_sold, category: hist.at(-1)?.category, price: hist.at(-1)?.price };
  const r = computeTrend(hist, listing);
  if (!r) return null;
  const units = r.weeks.map(w => w.units);
  return {
    file: path.basename(file),
    item: hist[0]?.item_id,
    nScrapes: hist.length,
    nWeeks: r.weeks.length,
    units,
    zeroWeek: units.some(u => u === 0),
    negWeek: units.some((u,i) => i>0 && u < units[i-1]),
    perfectlyFlat: isPerfectlyFlat(r.weeks),
    flatNoise: ddTrendWeeksAreFlatNoise(r.weeks),
    rawSoldFlat: r.rawSoldFlat,
    meaningfulRev: r.meaningfulRev,
    atBucket: r.atBucket,
    skipSyntheticFill: r.skipSyntheticFill,
    deltas: r.corrDeltas,
    soldSeries: r.dbRows.map(x => ({ d: x.scraped_at.slice(0,10), s: x.total_sold, r: x.reviews })),
  };
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node trend-sweep-local.mjs file1.json [file2.json ...]');
  process.exit(1);
}
const results = files.map(f => analyzeFile(f)).filter(Boolean);
const summary = {
  checked: results.length,
  zeroWeek: results.filter(r => r.zeroWeek),
  negWeek: results.filter(r => r.negWeek),
  perfectlyFlat: results.filter(r => r.perfectlyFlat),
  flatNoise: results.filter(r => r.flatNoise),
};
console.log(JSON.stringify(summary, null, 2));
