# Phase 26.2g-fillin-followup — `src/utils.js` Rule-of-3 refactor (design spec)

**Date:** 2026-05-13
**Brainstorm approval:** user explicit "yes" (2026-05-13) after Approach A + formal-clinical EN labels locked
**Predecessor:** Phase 26.2g-fillin (master `9135313`) — established `src/lib/patientHealthMapping.js` + AV40 invariant + flagged `src/utils.js:345-356,415-426` as sanctioned tech-debt

---

## 1. Problem

Phase 26.2g-fillin closed the V12 multi-reader-sweep gap at the TFP create-mode auto-fill boundary by extracting `derivePatientCongenitalDisease` into `src/lib/patientHealthMapping.js`. The pre-flight Rule P Step 3 grep surfaced **2 additional callers** of the same inline derivation pattern in `src/utils.js`:

- Lines 345-354 — Thai OPD print builder
  ```js
  let pmh = [];
  if (d.hasUnderlying === 'มี') {
    if (d.ud_hypertension) pmh.push('ความดันโลหิตสูง');
    if (d.ud_diabetes) pmh.push('เบาหวาน');
    if (d.ud_lung) pmh.push('โรคปอด');
    if (d.ud_kidney) pmh.push('โรคไต');
    if (d.ud_heart) pmh.push('โรคหัวใจ');
    if (d.ud_blood) pmh.push('โรคโลหิต');
    if (d.ud_other && d.ud_otherDetail) pmh.push(d.ud_otherDetail);
  }
  parts.push(`ประวัติโรคประจำตัว  : ${pmh.length > 0 ? pmh.join(', ') : 'ปฏิเสธโรคประจำตัว'}`);
  ```

- Lines 415-424 — English OPD print builder (formal clinical labels)
  ```js
  let pmh = [];
  if (d.hasUnderlying === 'มี') {
    if (d.ud_hypertension) pmh.push('Hypertension');
    if (d.ud_diabetes) pmh.push('Diabetes Mellitus');
    if (d.ud_lung) pmh.push('Lung Disease');
    if (d.ud_kidney) pmh.push('Chronic Kidney Disease');
    if (d.ud_heart) pmh.push('Heart Disease');
    if (d.ud_blood) pmh.push('Hematological Disease');
    if (d.ud_other && d.ud_otherDetail) pmh.push(d.ud_otherDetail);
  }
  parts.push(`Past Medical History: ${pmh.length > 0 ? pmh.join(', ') : 'No known underlying diseases'}`);
  ```

These were sanctioned as tech-debt in AV40 because (a) they ship to a different audience (OPD print recipients, not TFP textarea), (b) they produce a different output shape (line-prefixed + "ปฏิเสธ"/"No known" fallback), and (c) the English labels differ from PatientForm UI labels (formal clinical: "Diabetes Mellitus" vs UI "Diabetes"). Phase 26.2g-fillin deferred the refactor per Rule P "ONE class-of-bug at a time".

This follow-up closes the Rule of 3 by extracting the inline derivations into a parallel English helper alongside the existing Thai one, keeping output BYTE-IDENTICAL for OPD print recipients.

## 2. Goal

Eliminate the 2 inline `if (d.ud_X) pmh.push(...)` derivations in `src/utils.js` by consuming `src/lib/patientHealthMapping.js` helpers. Preserve OPD print output verbatim (zero behavior change for OPD print recipients per user directive). Drop `src/utils.js` from the AV40 sanctioned-exception list.

## 3. Class-of-bug

**V12 multi-reader-sweep family at the inline-derivation-pattern boundary** — same root cause as Phase 26.2g-fillin (TFP auto-fill block), at a different file boundary. Same 6-key `ud_*` flag set + `ud_otherDetail` + `hasUnderlying` gate. Different output shape (line prefix + fallback) handled at call site, not helper.

After this follow-up, the class is **fully closed** project-wide. Future direct readers of `patientData.ud_*` / `hasUnderlying` will fail the AV40 grep (no longer carry sanctioned exception for utils.js).

## 4. Approach (locked = A)

**Approach A — Mirror helper + caller-side wrapping** (user-locked, 2026-05-13).

1. Extend `src/lib/patientHealthMapping.js` with a NEW frozen `UD_LABELS_EN` map (formal clinical labels) + NEW pure helper `derivePatientCongenitalDiseaseEnglish(patientData)` that mirrors the existing Thai helper logic.
2. Refactor `src/utils.js` lines 345-354 and 415-424 to consume the helpers; wrap the output with the OPD-print prefix + fallback at the call site (1-2 lines per callsite).
3. Update AV40 sanctioned-exception list: `src/utils.js` removed (sanctioned list shrinks 3 → 2).
4. New unit tests mirror existing L1.1-L1.10 for the English helper + new source-grep regression locks for utils.js wiring.

### English label decision (Q1 — locked = formal clinical)

Use the same labels that currently ship in `src/utils.js:416-421`:

| Field | English Label |
|---|---|
| ud_hypertension | Hypertension |
| ud_diabetes | Diabetes Mellitus |
| ud_lung | Lung Disease |
| ud_kidney | Chronic Kidney Disease |
| ud_heart | Heart Disease |
| ud_blood | Hematological Disease |

These are intentionally MORE FORMAL than the PatientForm UI labels (which use lay-friendly "Diabetes" / "Kidney Disease" / "Blood Disease"). The OPD print context is clinical documentation; formal labels are appropriate. PatientForm UI labels stay lay-friendly. The drift is intentional and documented.

## 5. Helper API

NEW additions in `src/lib/patientHealthMapping.js` (~30 LOC):

```js
// Formal clinical English labels for OPD print + clinical documentation.
// Intentionally distinct from PatientForm UI labels (which are lay-friendly).
// UI order matches Thai UD_LABELS for consistency.
export const UD_LABELS_EN = Object.freeze({
  ud_hypertension: 'Hypertension',
  ud_diabetes:     'Diabetes Mellitus',
  ud_lung:         'Lung Disease',
  ud_kidney:       'Chronic Kidney Disease',
  ud_heart:        'Heart Disease',
  ud_blood:        'Hematological Disease',
});

/**
 * English-locale parallel of derivePatientCongenitalDisease.
 *
 * Returns comma-separated formal-clinical English chronic-disease labels.
 * Returns '' when:
 *   - patientData is not a plain object
 *   - hasUnderlying !== 'มี'  (NOTE: gate key is Thai; patientData shape is
 *                              language-agnostic — only output labels are EN)
 *   - all UD_LABELS_EN keys are falsy AND ud_otherDetail is empty/whitespace
 *
 * Standard flag labels emit first (UI order), then ud_otherDetail (trimmed) if present.
 */
export function derivePatientCongenitalDiseaseEnglish(patientData) {
  if (!_isPlainObject(patientData)) return '';
  if (patientData.hasUnderlying !== 'มี') return '';

  const parts = [];
  for (const key of Object.keys(UD_LABELS_EN)) {
    if (patientData[key]) parts.push(UD_LABELS_EN[key]);
  }
  if (patientData.ud_other) {
    const detail = typeof patientData.ud_otherDetail === 'string'
      ? patientData.ud_otherDetail.trim()
      : '';
    if (detail) parts.push(detail);
  }
  return parts.join(', ');
}
```

**Note on `hasUnderlying === 'มี'` gate**: this key value remains literal Thai even in the English helper because `patientData.hasUnderlying` is written by PatientForm.jsx using the Thai radio value (`'มี'` / `'ไม่มี'`) regardless of UI language. The DATA SHAPE is language-agnostic; only the OUTPUT labels differ. This is intentional and matches how `src/utils.js:415` already gates with `d.hasUnderlying === 'มี'`.

## 6. utils.js refactor (2 call sites)

### Import addition (top of file)

Add to the existing import cluster:
```js
import {
  derivePatientCongenitalDisease,
  derivePatientCongenitalDiseaseEnglish,
} from './lib/patientHealthMapping.js';
```

### Thai builder (lines 345-354)

**Before** (10 lines):
```js
let pmh = [];
if (d.hasUnderlying === 'มี') {
  if (d.ud_hypertension) pmh.push('ความดันโลหิตสูง');
  if (d.ud_diabetes) pmh.push('เบาหวาน');
  if (d.ud_lung) pmh.push('โรคปอด');
  if (d.ud_kidney) pmh.push('โรคไต');
  if (d.ud_heart) pmh.push('โรคหัวใจ');
  if (d.ud_blood) pmh.push('โรคโลหิต');
  if (d.ud_other && d.ud_otherDetail) pmh.push(d.ud_otherDetail);
}
parts.push(`ประวัติโรคประจำตัว  : ${pmh.length > 0 ? pmh.join(', ') : 'ปฏิเสธโรคประจำตัว'}`);
```

**After** (2 lines):
```js
// Phase 26.2g-fillin-followup (2026-05-13) — Rule of 3 close: use helper
const chronic = derivePatientCongenitalDisease(d);
parts.push(`ประวัติโรคประจำตัว  : ${chronic || 'ปฏิเสธโรคประจำตัว'}`);
```

Surrounding lines (allergy + currentMedication) preserved verbatim — they have different output shapes and aren't part of this Rule of 3.

### English builder (lines 415-424)

**Before** (10 lines): similar inline structure with English labels.

**After** (2 lines):
```js
// Phase 26.2g-fillin-followup (2026-05-13) — Rule of 3 close: use helper
const chronic = derivePatientCongenitalDiseaseEnglish(d);
parts.push(`Past Medical History: ${chronic || 'No known underlying diseases'}`);
```

### Output verification (byte-identical contract)

The refactor MUST produce BYTE-IDENTICAL output for both builders across all input shapes:
- All 6 standard flags set in any combination
- `ud_other` + `ud_otherDetail` with or without detail
- `hasUnderlying === 'ไม่มี'` (fallback fires)
- Empty `pmh[]` (fallback fires)
- Single flag, two flags, all 6 flags

A snapshot-style assertion in the test bank covers this: run the helper output through the wrapping template; compare to the pre-refactor `parts.push(...)` output.

## 7. AV40 sanctioned-exception list update

In `audit-anti-vibe-code/SKILL.md` AV40 block:

**Before** (3 sanctioned exceptions):
- src/pages/PatientForm.jsx (writer)
- src/pages/AdminDashboard.jsx (display chips)
- src/utils.js (OPD print builder — tech-debt)

**After** (2 sanctioned exceptions):
- src/pages/PatientForm.jsx (writer)
- src/pages/AdminDashboard.jsx (display chips)
- ~~src/utils.js~~ — REFACTORED Phase 26.2g-fillin-followup, 2026-05-13; now uses helpers

Add an "Example violations resolved" entry noting the utils.js close.

The G2.1 grep in `tests/phase-26-2g-fillin-source-grep.test.js` is UNCHANGED — it only walks `src/components` + `src/pages`, not `src/utils.js`. utils.js is naturally outside the walk; the AV40 documentation update is the only AV40 change needed.

## 8. Tests

### NEW `tests/phase-26-2g-fillin-followup-english-helper.test.js` (~12 assertions)

Mirror of existing L1.1-L1.10 for the English helper:

- L1.1-EN — returns '' for null / undefined / non-object / empty object
- L1.2-EN — `hasUnderlying === 'ไม่มี'` wins over flags
- L1.3-EN — single flag returns the corresponding English label
- L1.4-EN — two flags comma-join in UI order
- L1.5-EN — all 6 flags emit all 6 English labels in UI order
- L1.6-EN — `ud_other` + `ud_otherDetail` returns detail
- L1.7-EN — `ud_other` without detail / whitespace → silently omitted
- L1.8-EN — standard flags emit BEFORE ud_otherDetail (insertion order)
- L1.9-EN — UD_LABELS_EN frozen + `Diabetes Mellitus` value lock
- L1.10-EN — non-string `ud_otherDetail` silently omitted (typeof-guard)

Plus L1.11-EN — formal-clinical label verification (verbatim string lock for all 6 EN labels):
```js
expect(UD_LABELS_EN).toEqual({
  ud_hypertension: 'Hypertension',
  ud_diabetes: 'Diabetes Mellitus',
  ud_lung: 'Lung Disease',
  ud_kidney: 'Chronic Kidney Disease',
  ud_heart: 'Heart Disease',
  ud_blood: 'Hematological Disease',
});
```

Plus L1.12-EN — byte-identical output contract:
```js
// All 6 standard flags + ud_other detail
const pd = {
  hasUnderlying: 'มี',
  ud_hypertension: true, ud_diabetes: true, ud_lung: true,
  ud_kidney: true, ud_heart: true, ud_blood: true,
  ud_other: true, ud_otherDetail: 'Migraine',
};
expect(derivePatientCongenitalDiseaseEnglish(pd))
  .toBe('Hypertension, Diabetes Mellitus, Lung Disease, Chronic Kidney Disease, Heart Disease, Hematological Disease, Migraine');
```

### NEW `tests/phase-26-2g-fillin-followup-source-grep.test.js` (~4 assertions)

G3.1 — `src/utils.js` imports both helpers from `./lib/patientHealthMapping.js`:
```js
expect(utils).toMatch(/import\s*\{[^}]*derivePatientCongenitalDisease\b[^}]*\}\s*from\s*['"][^'"]*patientHealthMapping(?:\.js)?['"]/);
expect(utils).toMatch(/import\s*\{[^}]*derivePatientCongenitalDiseaseEnglish[^}]*\}\s*from\s*['"][^'"]*patientHealthMapping(?:\.js)?['"]/);
```

G3.2 — Anti-regression: `src/utils.js` does NOT contain inline `pmh.push('ความดันโลหิตสูง')` or `pmh.push('Hypertension')`:
```js
expect(utils).not.toMatch(/pmh\.push\(['"]ความดันโลหิตสูง['"]\)/);
expect(utils).not.toMatch(/pmh\.push\(['"]Hypertension['"]\)/);
// (Similar checks for the other 5 labels in each language could be added but
//  the first label per language is sufficient — if it's gone, the others are too.)
```

G3.3 — Thai builder uses derive call within window of `ประวัติโรคประจำตัว` template literal:
```js
const idx = utils.indexOf('ประวัติโรคประจำตัว');
const window = utils.slice(Math.max(0, idx - 500), idx + 300);
expect(window).toMatch(/derivePatientCongenitalDisease\s*\(/);
expect(window).not.toMatch(/derivePatientCongenitalDiseaseEnglish/); // Thai builder uses Thai helper only
```

G3.4 — English builder uses derive call within window of `Past Medical History`:
```js
const idx = utils.indexOf('Past Medical History');
const window = utils.slice(Math.max(0, idx - 500), idx + 300);
expect(window).toMatch(/derivePatientCongenitalDiseaseEnglish\s*\(/);
```

### Cumulative test delta

8474 baseline + ~14 new (12 helper unit + ~4 source-grep) ≈ 8488 + 1 skipped.

## 9. File structure (locked)

| Type | Path | Responsibility |
|---|---|---|
| MODIFIED | `src/lib/patientHealthMapping.js` | +UD_LABELS_EN frozen map +derivePatientCongenitalDiseaseEnglish helper (~30 LOC) |
| MODIFIED | `src/utils.js` | +1 import, -10 lines (Thai builder), -10 lines (English builder), +4 lines (2 call sites × 2 lines each), net -16 LOC |
| NEW | `tests/phase-26-2g-fillin-followup-english-helper.test.js` | L1.1-EN through L1.12-EN (~12 assertions) |
| NEW | `tests/phase-26-2g-fillin-followup-source-grep.test.js` | G3.1-G3.4 (~4 assertions) |
| MODIFIED | `.agents/skills/audit-anti-vibe-code/SKILL.md` | AV40 sanctioned-list shrink + example resolved |
| MODIFIED | `.claude/rules/00-session-start.md` § 2 | Phase 26.2g-fillin-followup V-entry one-liner |
| MODIFIED | `SESSION_HANDOFF.md` + `.agents/active.md` | State update at session-end |

Net source diff: +30 LOC (helpers) - 20 LOC (utils.js inline) + 4 LOC (utils.js call sites) ≈ +14 LOC source. ~120 LOC tests.

## 10. Out of scope

- `currentMedication` line in `src/utils.js:356` + `:426` — different output shape ("ยาที่ใช้ประจำ : <val>" / "Current Medications : <val>"), no inline derivation, no Rule of 3
- `hasAllergies` / `allergiesDetail` lines in `src/utils.js:355` + `:425` — different output shape with conditional "แพ้ ..." / "Allergy to ..." prefix, no inline derivation
- `pregnancy` field — utils.js OPD print doesn't include pregnancy line at all
- PatientForm.jsx EN labels — intentionally lay-friendly, kept separate by design
- AdminDashboard.jsx display chips — JSX render-only, no transform, still sanctioned per AV40

## 11. Verify locally first

Per Rule N (small refactor touching shared file `src/utils.js`):

1. `npx vitest run tests/phase-26-2g-fillin-followup-english-helper.test.js tests/phase-26-2g-fillin-followup-source-grep.test.js` → ~16 assertions GREEN
2. `npx vitest run tests/phase-26-2g-fillin-patient-health-mapping.test.js tests/phase-26-2g-fillin-source-grep.test.js tests/phase-26-2g-fillin-flow-simulate.test.js` → 27 existing assertions still GREEN (Phase 26.2g-fillin tests untouched)
3. `npm run build` → clean (catches import typos)
4. `npm test -- --run` → full suite GREEN (`src/utils.js` is widely imported by AdminDashboard, OPD print, schedule renderers, etc.)

## 12. Deploy authorization (V18 reaffirmed)

NO deploy this turn. 71 commits ahead of prod already (Phase 26.0 → 26.2f → 26.2g-fillin); Phase 26.2g-fillin-followup commits join the queue. User authorizes `vercel --prod` + `firebase deploy --only firestore:rules` separately per V15 + Rule B Probe-Deploy-Probe.
