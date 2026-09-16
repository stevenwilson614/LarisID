/**
 * Lab landed-cost: Amazon referral + FBA + freight ballpark + HTS duty estimate.
 * Requires globalThis.LARIS_AMZ (js/amazon-fees.js).
 */

export function dutyOnValue(customsUsd, duty) {
  if (!duty || duty.kind !== 'simple' || duty.duty_pct == null) {
    return { usd: null, kind: duty?.kind || 'missing', note: duty?.general_raw || 'cek HTS — duty not a single %' };
  }
  const v = Number(customsUsd) || 0;
  return { usd: v * (Number(duty.duty_pct) / 100), kind: 'simple', note: duty.general_raw };
}

export function freightUsd(A, mode, { unitKg, unitCbm, docs = true }) {
  const F = A.FREIGHT;
  let freight = 0;
  if (mode === 'air') freight = (Number(unitKg) || 0) * F.air.usdPerKg;
  else if (mode === 'seaFcl20') freight = F.seaFcl20.usdFlat;
  else freight = (Number(unitCbm) || 0) * F.seaLcl.usdPerCbm;
  const docsUsd = docs ? F.docs.usdFlat : 0;
  return { freight, docs: docsUsd, total: freight + docsUsd, mode };
}

/**
 * Unit economics at a sell price.
 * customs_value ≈ HPP + freight_per_unit (common rough CIF stand-in; not a broker entry).
 */
export function landedUnit({
  A,
  priceUsd,
  hppUsd,
  catKey,
  fbaBand,
  weightLb,
  freightMode,
  unitKg,
  unitCbm,
  duty,
  unitsForDocs = 100,
}) {
  const price = Number(priceUsd) || 0;
  const hpp = Number(hppUsd) || 0;
  const ref = A.referralFee(catKey, price);
  const fba = A.fbaFee(fbaBand, weightLb);
  const fr = freightUsd(A, freightMode, { unitKg, unitCbm, docs: false });
  const docsPer = (A.FREIGHT.docs.usdFlat) / Math.max(1, unitsForDocs);
  const freightPer = fr.freight + docsPer;
  const customs = hpp + freightPer;
  const d = dutyOnValue(customs, duty);
  const dutyUsd = d.usd;
  const costKnown = hpp + freightPer + fba + ref.usd + (dutyUsd == null ? 0 : dutyUsd);
  const sisa = dutyUsd == null ? null : price - costKnown;
  const marginPct = sisa == null || !price ? null : (sisa / price) * 100;
  return {
    price,
    hpp,
    referral: ref.usd,
    referralLabel: ref.label,
    fba,
    freightPer,
    docsPer,
    customs,
    dutyUsd,
    dutyKind: d.kind,
    dutyNote: d.note,
    sisa,
    marginPct,
    fx: A.FX.idrPerUsd,
  };
}

export function scenarioHpp(priceUsd, share) {
  if (priceUsd == null) return null;
  return Number(priceUsd) * (share == null ? 0.4 : share);
}
