// fillerMath.js — pure math for the Penile Filler Size Simulator (public toy).
// Single source of truth for: girth growth model, condom-size conversion, units,
// and 3D mesh dimensions. NO React, NO Firebase, NO side effects.
// All numbers VERIFIED against research + node (see spec 2026-06-20).

export const PI = Math.PI;

// girth model calibration (geometry × k). RCT (16.4mL HA, baseline girth 7.87cm):
// +2.5cm @1mo / +1.9 @6mo / +1.4 @18mo (J Clin Med 2020, PMC7230452) → implied efficiency
// k ≈ 1.7–2.5. v6: tightened to k 1.8 (durable ~6mo) – 2.3 (early-peak ~1mo) — narrower +
// clinically anchored (was 2.37–3.32, too wide → looked unreliable). Integer fractions
// (value-identical) so the build obfuscator's numbersToExpressions hides the literal values.
export const K_REALISTIC = 180 / 100;  // durable (~6mo) — low end of the girth band
export const K_OPTIMISTIC = 230 / 100; // early-peak (~1mo) — high end of the girth band
export const CM_PER_INCH = 254 / 100;

export const RANGES = {
  lengthCm: [6.35, 25.4], // 2.5 in .. 10 in — both units cap at 10 in (25.4 cm)
  diameterCm: [2.2, 4.1],
  cc: [5, 50], // TOTAL filler — clinical minimum 5cc (cannot go below); split shaft + glans
};

// Glans (head) augmentation — empirical, research-grounded (approximate, ±~30%).
// 2 cc → glans Ø +0.5 cm (+16%); ~0.25 cm Ø per cc (Kim/Abdallah/Kwak cohorts).
// Independent of shaft girth → does NOT change รอบวง / condom size.
export const GLANS_DIAM_PER_CC = { low: 25 / 100, high: 32 / 100 }; // cm diameter per cc
export const GLANS_CC = { min: 0.5, max: 4, step: 0.5, default: 2 };
// initial glans (head) baseline size — a ratio of the shaft Ø; default 1.0 = shaft Ø (today's value).
// Multiplies diameterFromGirth(baseGirthCm), so the baseline head scales with the chosen diameter.
export const GLANS_BASE_RATIO = { min: 0.75, max: 1.25, step: 0.05, default: 1.0 };
// the glans is ~5x more cc-responsive than the shaft; render the head growth gentler
// (illustrative only) so a few cc doesn't look like it balloons. research rate kept above.
export const GLANS_VISUAL_DAMP = 4 / 10;

// real, sourced, mainstream condom nominal widths (mm), ascending. (ISO 4074)
export const CONDOM_LADDER = [
  { label: 'Super snug 45', w: 45 },
  { label: 'Close fit 49', w: 49 },
  { label: 'Regular 52', w: 52 },
  { label: 'Regular+ 54', w: 54 },
  { label: 'Large 56', w: 56 },
  { label: 'Large+ 58', w: 58 },
  { label: 'XL 60', w: 60 },
  { label: 'XXL 64', w: 64 },
];

const num = (x, d = 0) => (Number.isFinite(x) ? x : d);

// ---- exact geometry (condom nominal width = half circumference) ----
export const widthFromGirth = (girthCm) => num(girthCm) * 5; // mm
export const girthFromWidth = (widthMm) => num(widthMm) / 5; // cm
export const diameterFromGirth = (girthCm) => num(girthCm) / PI; // cm
export const girthFromDiameter = (diameterCm) => num(diameterCm) * PI; // cm
export const girthToRadiusCm = (girthCm) => num(girthCm) / (2 * PI); // 3D mesh radius

// ---- units ----
export const cmToInch = (cm) => num(cm) / CM_PER_INCH;
export const inchToCm = (inch) => num(inch) * CM_PER_INCH;

// ---- condom snap: FLOOR — the largest nominal width that still fits within the girth.
// Conservative by design: never recommends a size bigger than the girth strictly reaches,
// so the predicted result is UNDER-promised (safety — user directive 2026-06-20). ----
export function condomIndexForGirth(girthCm) {
  const req = num(girthCm) * 5;
  let bi = 0;
  for (let i = 0; i < CONDOM_LADDER.length; i++) {
    if (CONDOM_LADDER[i].w <= req) bi = i; // floor to the largest size that fits
  }
  return bi;
}
// Beyond the named ladder, sizes continue in +2mm steps (66, 68, 70, 72). Real ISO products
// run 45–72mm, so 66–72 are REAL numbered sizes; "เกินมาตรฐาน 🔥" fires only past 72 (genuinely
// beyond any product). User directive 2026-06-20: compute the real size past XXL 64, not capped.
export const LADDER_MAX_W = CONDOM_LADDER[CONDOM_LADDER.length - 1].w; // 64
export const BEYOND_STEP = 2;
export const REAL_MAX_W = 72; // largest real ISO nominal width — เกินมาตรฐาน past this
export function condomForGirth(girthCm) {
  const req = widthFromGirth(girthCm); // nominal width needed (mm) = girth * 5
  if (req >= LADDER_MAX_W + BEYOND_STEP) {
    const w = Math.floor(req / BEYOND_STEP) * BEYOND_STEP; // floor to the +2 grid (conservative)
    const index = (CONDOM_LADDER.length - 1) + (w - LADDER_MAX_W) / BEYOND_STEP; // continued index → sizesUp stays meaningful
    return { index, label: String(w), w, beyond: w > REAL_MAX_W }; // เกินมาตรฐาน only past 72mm
  }
  const index = condomIndexForGirth(girthCm);
  return { index, label: CONDOM_LADDER[index].label, w: CONDOM_LADDER[index].w, beyond: false };
}

// geometric cylinder-shell growth (under-predicts real -> multiplied by k below)
const dCgeo = (C0, L, V) => Math.sqrt(C0 * C0 + (4 * PI * num(V)) / Math.max(num(L), 0.1)) - C0;

// ---- main estimate: baseGirthCm in, full result (raw numbers; round at display) ----
export function estimate({ lengthCm, baseGirthCm, shaftCc, fillerCc, glansCc = 0, baseGlansDiameterCm } = {}) {
  const C0 = Math.max(num(baseGirthCm), 0);
  const L = Math.max(num(lengthCm), 0.1);
  // shaftCc (v2) with fillerCc (v1) back-compat alias
  const V = Math.max(num(shaftCc != null ? shaftCc : fillerCc), 0);
  const g = Math.max(dCgeo(C0, L, V), 0);
  const deltaCLow = K_REALISTIC * g;
  const deltaCHigh = K_OPTIMISTIC * g;
  const c1Low = C0 + deltaCLow;
  const c1High = C0 + deltaCHigh;
  const condom0 = condomForGirth(C0);
  const condomLow = condomForGirth(c1Low);
  const condomHigh = condomForGirth(c1High);
  // glans (head) — independent of shaft girth / condom; default baseline = shaft Ø
  const dg0 = num(baseGlansDiameterCm) > 0 ? num(baseGlansDiameterCm) : diameterFromGirth(C0);
  const gc = Math.max(num(glansCc), 0);
  const glans = {
    dg0,
    dgLow: dg0 + GLANS_DIAM_PER_CC.low * gc,
    dgHigh: dg0 + GLANS_DIAM_PER_CC.high * gc,
    deltaLow: GLANS_DIAM_PER_CC.low * gc,
    deltaHigh: GLANS_DIAM_PER_CC.high * gc,
    // visual-only diameter (damped) — head grows believably, not ballooning; independent of shaft
    visualLow: dg0 + GLANS_DIAM_PER_CC.low * gc * GLANS_VISUAL_DAMP,
    visualHigh: dg0 + GLANS_DIAM_PER_CC.high * gc * GLANS_VISUAL_DAMP,
  };
  return {
    c0: C0,
    d0: diameterFromGirth(C0),
    condom0,
    c1Low,
    c1High,
    d1Low: diameterFromGirth(c1Low),
    d1High: diameterFromGirth(c1High),
    deltaCLow,
    deltaCHigh,
    condomLow,
    condomHigh,
    sizesUpLow: condomLow.index - condom0.index,
    sizesUpHigh: condomHigh.index - condom0.index,
    glans,
  };
}
