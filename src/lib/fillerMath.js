// fillerMath.js — pure math for the Penile Filler Size Simulator (public toy).
// Single source of truth for: girth growth model, condom-size conversion, units,
// and 3D mesh dimensions. NO React, NO Firebase, NO side effects.
// All numbers VERIFIED against research + node (see spec 2026-06-20).

export const PI = Math.PI;

// girth model calibration (geometry × k). Closest-to-real recalibration (spec 2026-06-21):
// research loop (9 rounds + adversarial) → Yang2020 RCT (PMC7230452) + Zhang2022 Asian-J-Androl (PMC9809476);
// [verified 2026-06-21: PMC9809476 first author is ZHANG not "Wang"; full set in src/lib/fillerRefs.js]
// geometry efficiency at flaccid L 9.16cm gives DURABLE(12mo) k≈1.22, PEAK(~1mo) k≈1.90.
// The displayed Low–High range = DURABLE (ระยะคงตัว) → PEAK (ขนาดใหญ่ที่สุด/ช่วงแรก).
// Integer fractions (value-identical) so the build obfuscator's numbersToExpressions hides the literals.
export const K_DURABLE = 122 / 100;  // 1.22 — 12-month durable = LOW end of the girth range
export const K_PEAK = 190 / 100;     // 1.90 — ~1-month peak    = HIGH end of the girth range
export const CM_PER_INCH = 254 / 100;
// flaccid-length by-product — anti-retraction splint (filler holds the flaccid penis from retracting),
// NOT true erect elongation. DOSE-DEPENDENT + SATURATING in injected SHAFT volume (research: PMC9809476
// Zhang2022 — flaccid length +2.55cm peak/1mo → +1.65cm durable/12mo at ~15-21mL; PMC8987147 Ahn2021 is a
// GIRTH RCT not flaccid — verified 2026-06-21; glans filler does NOT
// splint the shaft). gain = MAX·(1 − e^(−shaftCc/HALF)). Integer fractions so the obfuscator hides them.
export const FLACCID_LEN_MAX_DURABLE = 20 / 10; // 2.0cm plateau — durable (ระยะคงตัว)
export const FLACCID_LEN_MAX_PEAK = 30 / 10;    // 3.0cm plateau — ~1-month peak (ช่วงแรก)
export const FLACCID_LEN_HALF_CC = 10;          // shaftCc giving ~63% of the plateau (saturation rate)
export const flaccidLengthGain = (shaftCc, max) =>
  max * (1 - Math.exp(-Math.max(Number(shaftCc) || 0, 0) / FLACCID_LEN_HALF_CC));

export const RANGES = {
  lengthCm: [6.35, 25.4], // 2.5 in .. 10 in — both units cap at 10 in (25.4 cm)
  diameterCm: [2.2, 4.1],
  cc: [5, 50], // TOTAL filler — 5–50cc (raised back to 50 per owner 2026-06-21). split shaft + glans
};

// Glans (head) augmentation — research-anchored cube-root VOLUME-CONSERVATION model (spec 2026-06-21).
// Filler IS the added volume (peer-reviewed mechanism); the head is compact → Ø grows as the CUBE ROOT
// of total volume → never plateaus, each cc adds a little less Ø (real tissue physics). Anchored to the
// only published glans dose (Moon 2015, WJMH 33(2):50, 2cc): durable +0.45cm Ø (5yr, +14.1mm circ) /
// peak +0.53cm Ø (6mo, +16.6mm circ) on a typical glans (Ø ~3.5cm). veff = effective glans
// filler-compliance volume, calibrated so 2cc lands on those anchors (peak +15.1% / durable +12.8% Ø).
// >3mL is a volume-conservation EXTRAPOLATION (no glans study exists above 3mL) — cross-validated by
// 20mL shaft trials that keep growing; see GLANS_CAVEAT in fillerRefs.js. The OLD "saturates at 2mL"
// was a misread (2mL is just the only dose ever studied). Independent of shaft girth → does NOT change
// รอบวง / condom. Integer fractions so the build obfuscator hides the literals.
export const GLANS_FILL_VOLUME_CC = { peak: 381 / 100, durable: 459 / 100 }; // effective glans volume (cc)
export const GLANS_SPLIT_MAX_CC = 15; // head-injection cap (split slider) — locks the exaggeration
export const GLANS_CC = { min: 0, max: 15, step: 0.5, default: 0 };
// initial glans (head) baseline size — a ratio of the shaft Ø; default 1.0 = shaft Ø (today's value).
// Multiplies diameterFromGirth(baseGirthCm), so the baseline head scales with the chosen diameter.
export const GLANS_BASE_RATIO = { min: 0.75, max: 1.25, step: 0.05, default: 1.0 };
// cube-root volume-conservation Ø gain: dg0 · (∛(1 + cc/veff) − 1). Never plateaus; diminishing per-cc.
// Both the 2D mushroom + the 3D glans bulb render the resulting Ø (single source).
export const glansDiameterGain = (glansCc, dg0, veff) => {
  const d = Math.max(Number(dg0) || 0, 0);
  const cc = Math.max(Number(glansCc) || 0, 0);
  const v = Number(veff) || 1;
  return d * (Math.cbrt(1 + cc / v) - 1);
};

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
  const rawGc = Math.max(num(glansCc), 0); // FULL injected head cc — no saturation; capped only by the 15cc slider
  const gainDurable = glansDiameterGain(rawGc, dg0, GLANS_FILL_VOLUME_CC.durable);
  const gainPeak = glansDiameterGain(rawGc, dg0, GLANS_FILL_VOLUME_CC.peak);
  const glans = {
    dg0,
    // cube-root volume-conservation Ø. visualLow = durable (settled), visualHigh = peak (~1mo).
    // 2D + 3D both render visualLow (single source). Never plateaus; capped by the 15cc slider.
    visualLow: dg0 + gainDurable,
    visualHigh: dg0 + gainPeak,
    deltaLow: gainDurable,
    deltaHigh: gainPeak,
    pctLow: dg0 > 0 ? (gainDurable / dg0) * 100 : 0,
    pctHigh: dg0 > 0 ? (gainPeak / dg0) * 100 : 0,
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
    condomWidth0: Math.round(C0 * 5),     // baseline nominal width (mm) — in condom-mode == the rung the user selected (round-trips girthFromWidth)
    condomWidthLow: Math.round(c1Low * 5),
    condomWidthHigh: Math.round(c1High * 5),
    // flaccid-length by-product — varies with injected SHAFT volume, saturating; durable–peak (ระยะคงตัว→ช่วงแรก)
    lengthGainLow: flaccidLengthGain(V, FLACCID_LEN_MAX_DURABLE),
    lengthGainHigh: flaccidLengthGain(V, FLACCID_LEN_MAX_PEAK),
    glans,
  };
}
