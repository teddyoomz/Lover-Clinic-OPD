// fillerMath.js — pure math for the Penile Filler Size Simulator (public toy).
// Single source of truth for: girth growth model, condom-size conversion, units,
// and 3D mesh dimensions. NO React, NO Firebase, NO side effects.
// All numbers VERIFIED against research + node (see spec 2026-06-20).

export const PI = Math.PI;

// girth model calibration (geometry × k). Closest-to-real recalibration (spec 2026-06-21):
// research loop (9 rounds + adversarial) → Yang2020 RCT (PMC7230452) + Wang2022 cohort (PMC9809476);
// geometry efficiency at flaccid L 9.16cm gives DURABLE(12mo) k≈1.22, PEAK(~1mo) k≈1.90.
// The displayed Low–High range = DURABLE (ระยะคงตัว) → PEAK (ขนาดใหญ่ที่สุด/ช่วงแรก).
// Integer fractions (value-identical) so the build obfuscator's numbersToExpressions hides the literals.
export const K_DURABLE = 122 / 100;  // 1.22 — 12-month durable = LOW end of the girth range
export const K_PEAK = 190 / 100;     // 1.90 — ~1-month peak    = HIGH end of the girth range
export const CM_PER_INCH = 254 / 100;
// flaccid-length by-product: ~+1.6cm — an anti-retraction splint (filler holds it from retracting),
// NOT true erect elongation (spec 2026-06-21). Integer fraction so the obfuscator hides the literal.
export const FLACCID_LENGTH_GAIN_CM = 16 / 10;

export const RANGES = {
  lengthCm: [6.35, 25.4], // 2.5 in .. 10 in — both units cap at 10 in (25.4 cm)
  diameterCm: [2.2, 4.1],
  cc: [5, 30], // TOTAL filler — clinical range 5–30cc (was 5–50; spec 2026-06-21). split shaft + glans
};

// Glans (head) augmentation — closest-to-real (spec 2026-06-21): central ΔØ 0.17 cm/cc, band 0.13–0.24
// (2024 J Sex Med meta, 706 pts, +10.96mm circ → ΔØ/cc ~0.17). SATURATES at the ~2mL plateau (3mL ≈ 2mL).
// Independent of shaft girth → does NOT change รอบวง / condom size.
export const GLANS_DIAM_PER_CC = { low: 13 / 100, high: 24 / 100 }; // cm diameter per cc
export const GLANS_SATURATION_CC = 2; // dose plateau — no added ΔØ above ~2mL (no dose-response)
export const GLANS_CC = { min: 0.5, max: 4, step: 0.5, default: 2 };
// initial glans (head) baseline size — a ratio of the shaft Ø; default 1.0 = shaft Ø (today's value).
// Multiplies diameterFromGirth(baseGirthCm), so the baseline head scales with the chosen diameter.
export const GLANS_BASE_RATIO = { min: 0.75, max: 1.25, step: 0.05, default: 1.0 };
// the glans is ~5x more cc-responsive than the shaft; render the head growth gentler
// (illustrative only) so a few cc doesn't look like it balloons. research rate kept above.
export const GLANS_VISUAL_DAMP = 4 / 10;

// Thai-familiar + world condom nominal-width ladder (mm), ascending (spec 2026-06-21).
// 45–56 = Thai retail (Durex/Onetouch/Okamoto; 52 = everyday standard — no 51/53);
// 58–72 = global large (MyONE 58/60/64, Pasante Super King 69, My.Size Pro 72 = world max).
// `label` = Thai descriptor for the INPUT dropdown ONLY (blank where none); the RESULT shows the raw computed mm.
export const CONDOM_LADDER = [
  { label: 'กระชับพิเศษ', w: 45 },
  { label: 'กระชับ', w: 49 },
  { label: 'มาตรฐาน', w: 52 },
  { label: '', w: 54 },
  { label: 'ใหญ่', w: 56 },
  { label: '', w: 58 },
  { label: 'ใหญ่พิเศษ', w: 60 },
  { label: '', w: 64 },
  { label: '', w: 69 },
  { label: '', w: 72 },
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
// FLOOR/round-down is the correct RETENTION rule (MyONE/ISO — snug keeps it from slipping; spec 2026-06-21). ----
export function condomIndexForGirth(girthCm) {
  const req = num(girthCm) * 5;
  let bi = 0;
  for (let i = 0; i < CONDOM_LADDER.length; i++) {
    if (CONDOM_LADDER[i].w <= req) bi = i; // floor to the largest size that fits
  }
  return bi;
}
// Cap at the largest real commercial rung (64 mm "Super Wide"). No "beyond" warning (spec 2026-06-21 —
// the old +2→72 extension + เกินมาตรฐาน flag were dropped per the owner's marketing-forward revision).
// A girth requiring >64mm simply floors to the 64 rung (condomIndexForGirth returns the top index).
export function condomForGirth(girthCm) {
  const index = condomIndexForGirth(girthCm);
  const rung = CONDOM_LADDER[index];
  return { index, label: rung.label, w: rung.w, beyond: false };
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
  const deltaCLow = K_DURABLE * g;   // durable (ระยะคงตัว) = LOW end of the displayed range
  const deltaCHigh = K_PEAK * g;     // peak (ขนาดใหญ่ที่สุด/ช่วงแรก) = HIGH end
  const c1Low = C0 + deltaCLow;
  const c1High = C0 + deltaCHigh;
  const condom0 = condomForGirth(C0);
  const condomLow = condomForGirth(c1Low);
  const condomHigh = condomForGirth(c1High);
  // glans (head) — independent of shaft girth / condom; default baseline = shaft Ø
  const dg0 = num(baseGlansDiameterCm) > 0 ? num(baseGlansDiameterCm) : diameterFromGirth(C0);
  const gc = Math.min(Math.max(num(glansCc), 0), GLANS_SATURATION_CC); // saturate at the ~2mL plateau (3mL ≈ 2mL)
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
    // RESULT (UI): raw computed nominal width (mm), rounded to nearest mm — NOT floored to a ladder rung.
    // The customer reads this number and picks the closest real condom themselves (spec 2026-06-21).
    condomWidthLow: Math.round(c1Low * 5),
    condomWidthHigh: Math.round(c1High * 5),
    lengthGainCm: FLACCID_LENGTH_GAIN_CM,
    glans,
  };
}
