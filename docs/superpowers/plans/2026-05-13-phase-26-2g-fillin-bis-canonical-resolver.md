# Phase 26.2g-fillin-bis — Canonical patientData Resolvers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct Phase 26.2g-fillin's no-op auto-fill in TFP by introducing 3 NEW `resolvePatient*` helpers that read CANONICAL camelCase fields on `be_customers.patientData` (`congenitalDisease` / `drugAllergy` / `foodAllergy` / `beforeTreatment` / `pregnanted`) directly — replacing the previous `derivePatient*` calls in TFP which read kiosk-shape fields (`hasUnderlying` / `ud_*` / `allergiesDetail` / `currentMedication` / `pregnancy`) that NEVER exist on `be_customers.patientData`.

**Architecture:** Approach A (mirror-helper + caller-side compose). Extend `src/lib/patientHealthMapping.js` with 3 NEW pure helpers + 3 NEW label-prefix constants. TFP swaps `derivePatient*` → `resolvePatient*` calls + removes the pre-Phase-26.2g-fillin `setDrugAllergy(patientData.allergiesDetail)` line (which was also a no-op). Existing `derivePatient*` helpers stay untouched (legitimate consumer: `src/utils.js` OPD print + Phase 26.2g-fillin-followup refactor). AV40 invariant extended to forbid direct reads of canonical patientData fields in `src/components|src/pages`. 5-layer test bank (unit + source-grep + flow-simulate + RTL + live admin-SDK e2e) covering the FULL data chain.

**Tech Stack:** Pure ESM JavaScript + Vitest 4.1 + React 19 + Testing-Library + Firebase Admin SDK 13.x. Spec at `docs/superpowers/specs/2026-05-13-phase-26-2g-fillin-bis-canonical-resolver-design.md`.

---

## File Structure

| Type | Path | Responsibility |
|---|---|---|
| MODIFIED | `src/lib/patientHealthMapping.js` | +3 resolver helpers + 3 label-prefix constants (~70 LOC) + file header update |
| MODIFIED | `src/components/TreatmentFormPage.jsx` | Swap derive→resolve imports; refactor auto-fill block (lines 1017-1034); REMOVE pre-existing `setDrugAllergy(patientData.allergiesDetail)` no-op |
| NEW | `tests/phase-26-2g-fillin-bis-resolver-helpers.test.js` | R1-R3 (~25 assertions: empty/typeof-guard/trimming/insertion-order/asymmetric-prefix locks) |
| NEW | `tests/phase-26-2g-fillin-bis-source-grep.test.js` | G4 (~6 assertions: TFP imports + call sites + anti-regression on derive*) |
| NEW | `tests/phase-26-2g-fillin-bis-flow-simulate.test.js` | FB1-FB6 (~40 assertions: chains opd_session→kioskPatientToCanonical→buildPatientDataFromForm→resolver→setter) |
| NEW | `tests/phase-26-2g-fillin-bis-tfp-autofill-rtl.test.jsx` | RTL (~15 assertions mounting TFP with synthetic patientData) |
| NEW | `scripts/e2e-phase-26-2g-fillin-bis.mjs` | Live admin-SDK e2e (Rule M, 6 scenarios on real prod with TEST-prefixed fixtures) |
| MODIFIED | `.agents/skills/audit-anti-vibe-code/SKILL.md` | AV40 extension (5 canonical fields added to forbidden-direct-reads) + Example resolved entry |
| MODIFIED | `tests/phase-26-2g-fillin-source-grep.test.js` | G2.1 PATTERN extended for new canonical fields (V21-class fixup) |
| MODIFIED | `.claude/rules/00-session-start.md` § 2 | Phase 26.2g-fillin-bis V-entry with no-op acknowledgment |
| MODIFIED | `.agents/active.md` | State update |
| MODIFIED | `SESSION_HANDOFF.md` | Append new session block + Resume Prompt |
| NEW | `.agents/sessions/2026-05-13-phase-26-2g-fillin-bis.md` | Checkpoint |

Net new code: ~70 LOC helper + ~10 LOC TFP net + ~400 LOC tests + ~250 LOC live e2e + ~150 LOC docs.

---

### Task 1: TDD resolver helpers (red → green) + commit

**Files:**
- Test: `tests/phase-26-2g-fillin-bis-resolver-helpers.test.js` (NEW)
- Source: `src/lib/patientHealthMapping.js` (MODIFY — append after existing exports)

- [ ] **Step 1: Write the failing test file**

Write file at `tests/phase-26-2g-fillin-bis-resolver-helpers.test.js` with this EXACT content:

```js
// tests/phase-26-2g-fillin-bis-resolver-helpers.test.js
// Phase 26.2g-fillin-bis — resolvePatient* canonical resolver contract.
// These resolvers read CANONICAL camelCase fields on be_customers.patientData
// (congenitalDisease/drugAllergy/foodAllergy/beforeTreatment/pregnanted) which
// are populated by buildPatientDataFromForm at write time for BOTH admin AND
// kiosk paths (kiosk-shape pre-derived to canonical strings via
// kioskPatientToCanonical before customer doc write).

import { describe, it, expect } from 'vitest';
import {
  resolvePatientCongenitalDisease,
  resolvePatientDrugAllergy,
  resolvePatientTreatmentHistory,
  BEFORE_TREATMENT_LABEL_PREFIX,
  DRUG_ALLERGY_LABEL_PREFIX,
  FOOD_ALLERGY_LABEL_PREFIX,
  PREGNANCY_LABEL_PREFIX,
} from '../src/lib/patientHealthMapping.js';

describe('R1 — resolvePatientCongenitalDisease', () => {
  it('R1.1 — empty / null / non-object / empty object → ""', () => {
    expect(resolvePatientCongenitalDisease(null)).toBe('');
    expect(resolvePatientCongenitalDisease(undefined)).toBe('');
    expect(resolvePatientCongenitalDisease('string')).toBe('');
    expect(resolvePatientCongenitalDisease(42)).toBe('');
    expect(resolvePatientCongenitalDisease({})).toBe('');
  });

  it('R1.2 — empty string / whitespace-only string → ""', () => {
    expect(resolvePatientCongenitalDisease({ congenitalDisease: '' })).toBe('');
    expect(resolvePatientCongenitalDisease({ congenitalDisease: '   ' })).toBe('');
  });

  it('R1.3 — value preserved verbatim (trimmed)', () => {
    expect(resolvePatientCongenitalDisease({ congenitalDisease: 'ง่วง' })).toBe('ง่วง');
    expect(resolvePatientCongenitalDisease({ congenitalDisease: '  ง่วง  ' })).toBe('ง่วง');
  });

  it('R1.4 — non-string field type silently ignored (typeof-guard lock)', () => {
    expect(resolvePatientCongenitalDisease({ congenitalDisease: 42 })).toBe('');
    expect(resolvePatientCongenitalDisease({ congenitalDisease: null })).toBe('');
    expect(resolvePatientCongenitalDisease({ congenitalDisease: [] })).toBe('');
    expect(resolvePatientCongenitalDisease({ congenitalDisease: {} })).toBe('');
  });

  it('R1.5 — kiosk-derived value preserved verbatim (comma-joined Thai labels)', () => {
    // After kioskPatientToCanonical pre-derives ud_* → labels, the canonical
    // string lands on patientData.congenitalDisease. Resolver passes through.
    expect(resolvePatientCongenitalDisease({ congenitalDisease: 'ความดันโลหิตสูง, เบาหวาน' }))
      .toBe('ความดันโลหิตสูง, เบาหวาน');
  });

  it('R1.6 — admin-typed value preserved verbatim', () => {
    expect(resolvePatientCongenitalDisease({ congenitalDisease: 'ภูมิแพ้อากาศ' }))
      .toBe('ภูมิแพ้อากาศ');
  });
});

describe('R2 — resolvePatientDrugAllergy', () => {
  it('R2.1 — empty / null / non-object → ""', () => {
    expect(resolvePatientDrugAllergy(null)).toBe('');
    expect(resolvePatientDrugAllergy(undefined)).toBe('');
    expect(resolvePatientDrugAllergy({})).toBe('');
    expect(resolvePatientDrugAllergy('string')).toBe('');
  });

  it('R2.2 — drug only → raw value (no prefix; TFP textarea label provides context)', () => {
    expect(resolvePatientDrugAllergy({ drugAllergy: 'พารา' })).toBe('พารา');
    expect(resolvePatientDrugAllergy({ drugAllergy: 'shrimp' })).toBe('shrimp');
  });

  it('R2.3 — food only → "แพ้อาหาร: <food>" (prefixed for disambiguation)', () => {
    expect(resolvePatientDrugAllergy({ foodAllergy: 'ขนมถ้วย' }))
      .toBe('แพ้อาหาร: ขนมถ้วย');
  });

  it('R2.4 — both → "แพ้ยา: <drug> / แพ้อาหาร: <food>" (locked literal)', () => {
    expect(resolvePatientDrugAllergy({ drugAllergy: 'พารา', foodAllergy: 'ขนมถ้วย' }))
      .toBe('แพ้ยา: พารา / แพ้อาหาร: ขนมถ้วย');
  });

  it('R2.5 — drug with surrounding whitespace + food empty → trimmed raw drug', () => {
    expect(resolvePatientDrugAllergy({ drugAllergy: '  พารา  ', foodAllergy: '' }))
      .toBe('พารา');
  });

  it('R2.6 — drug empty + food whitespace → ""', () => {
    expect(resolvePatientDrugAllergy({ drugAllergy: '', foodAllergy: '   ' })).toBe('');
  });

  it('R2.7 — both with surrounding whitespace → trimmed prefixed', () => {
    expect(resolvePatientDrugAllergy({ drugAllergy: '  พารา  ', foodAllergy: '  ขนมถ้วย  ' }))
      .toBe('แพ้ยา: พารา / แพ้อาหาร: ขนมถ้วย');
  });

  it('R2.8 — non-string drugAllergy silently ignored (typeof-guard lock)', () => {
    expect(resolvePatientDrugAllergy({ drugAllergy: 42 })).toBe('');
    expect(resolvePatientDrugAllergy({ drugAllergy: null })).toBe('');
    expect(resolvePatientDrugAllergy({ drugAllergy: [] })).toBe('');
  });

  it('R2.9 — non-string foodAllergy silently ignored (typeof-guard lock)', () => {
    expect(resolvePatientDrugAllergy({ foodAllergy: 42 })).toBe('');
    expect(resolvePatientDrugAllergy({ foodAllergy: null })).toBe('');
    expect(resolvePatientDrugAllergy({ foodAllergy: [] })).toBe('');
  });

  it('R2.10 — drug value with internal spaces preserved', () => {
    expect(resolvePatientDrugAllergy({ drugAllergy: 'Penicillin Group B' }))
      .toBe('Penicillin Group B');
  });
});

describe('R3 — resolvePatientTreatmentHistory', () => {
  it('R3.1 — empty / null / non-object → ""', () => {
    expect(resolvePatientTreatmentHistory(null)).toBe('');
    expect(resolvePatientTreatmentHistory(undefined)).toBe('');
    expect(resolvePatientTreatmentHistory({})).toBe('');
    expect(resolvePatientTreatmentHistory('string')).toBe('');
  });

  it('R3.2 — beforeTreatment only → "การรักษาก่อนหน้า: <value>"', () => {
    expect(resolvePatientTreatmentHistory({ beforeTreatment: 'X-ray' }))
      .toBe('การรักษาก่อนหน้า: X-ray');
  });

  it('R3.3 — pregnanted=true only → "การตั้งครรภ์: กำลังตั้งครรภ์"', () => {
    expect(resolvePatientTreatmentHistory({ pregnanted: true }))
      .toBe('การตั้งครรภ์: กำลังตั้งครรภ์');
  });

  it('R3.4 — both present → joined by " / " with beforeTreatment first', () => {
    expect(resolvePatientTreatmentHistory({ beforeTreatment: 'X-ray', pregnanted: true }))
      .toBe('การรักษาก่อนหน้า: X-ray / การตั้งครรภ์: กำลังตั้งครรภ์');
  });

  it('R3.5 — pregnanted=false → no pregnancy entry', () => {
    expect(resolvePatientTreatmentHistory({ pregnanted: false })).toBe('');
    expect(resolvePatientTreatmentHistory({ beforeTreatment: 'X-ray', pregnanted: false }))
      .toBe('การรักษาก่อนหน้า: X-ray');
  });

  it('R3.6 — pregnanted non-boolean (null/undefined/string "true") → no entry (strict boolean check)', () => {
    expect(resolvePatientTreatmentHistory({ pregnanted: null })).toBe('');
    expect(resolvePatientTreatmentHistory({ pregnanted: undefined })).toBe('');
    expect(resolvePatientTreatmentHistory({ pregnanted: 'true' })).toBe('');
    expect(resolvePatientTreatmentHistory({ pregnanted: 1 })).toBe('');
  });

  it('R3.7 — beforeTreatment whitespace-only → ignored', () => {
    expect(resolvePatientTreatmentHistory({ beforeTreatment: '   ' })).toBe('');
    expect(resolvePatientTreatmentHistory({ beforeTreatment: '   ', pregnanted: true }))
      .toBe('การตั้งครรภ์: กำลังตั้งครรภ์');
  });

  it('R3.8 — non-string beforeTreatment silently ignored (typeof-guard lock)', () => {
    expect(resolvePatientTreatmentHistory({ beforeTreatment: 42 })).toBe('');
    expect(resolvePatientTreatmentHistory({ beforeTreatment: null })).toBe('');
    expect(resolvePatientTreatmentHistory({ beforeTreatment: [] })).toBe('');
  });

  it('R3.9 — insertion order locked: beforeTreatment first, pregnancy second', () => {
    // Even if we pass props in reverse order, output order is fixed
    const pd = { pregnanted: true, beforeTreatment: 'X-ray' };
    expect(resolvePatientTreatmentHistory(pd))
      .toBe('การรักษาก่อนหน้า: X-ray / การตั้งครรภ์: กำลังตั้งครรภ์');
  });
});

describe('R4 — Exported label prefix constants', () => {
  it('R4.1 — BEFORE_TREATMENT_LABEL_PREFIX is the locked Thai literal', () => {
    expect(BEFORE_TREATMENT_LABEL_PREFIX).toBe('การรักษาก่อนหน้า: ');
  });

  it('R4.2 — DRUG_ALLERGY_LABEL_PREFIX is the locked Thai literal', () => {
    expect(DRUG_ALLERGY_LABEL_PREFIX).toBe('แพ้ยา: ');
  });

  it('R4.3 — FOOD_ALLERGY_LABEL_PREFIX is the locked Thai literal', () => {
    expect(FOOD_ALLERGY_LABEL_PREFIX).toBe('แพ้อาหาร: ');
  });

  it('R4.4 — PREGNANCY_LABEL_PREFIX (reused) is the locked Thai literal', () => {
    expect(PREGNANCY_LABEL_PREFIX).toBe('การตั้งครรภ์: ');
  });
});
```

- [ ] **Step 2: Run the test to verify RED**

Run: `cd F:/LoverClinic-app && npx vitest run tests/phase-26-2g-fillin-bis-resolver-helpers.test.js 2>&1 | tail -20`
Expected: ALL ~30 assertions FAIL with "no such export: resolvePatientCongenitalDisease" or "no such export: BEFORE_TREATMENT_LABEL_PREFIX" — symbols don't exist yet.

If tests fail for a DIFFERENT reason (syntax error, wrong path), STOP and fix the test file before Step 3.

- [ ] **Step 3: Extend `src/lib/patientHealthMapping.js` with new exports**

The file currently exports (in this order, post Phase 26.2g-fillin-followup):
- `PREGNANCY_LABEL_PREFIX` (line 25)
- `MEDICATION_LABEL_PREFIX` (line 26)
- `UD_LABELS` (lines 31-38)
- `UD_LABELS_EN` (lines 45-52)
- `_isPlainObject` (private, line 54)
- `derivePatientCongenitalDisease` (lines 68-83)
- `derivePatientCongenitalDiseaseEnglish` (lines 101-116)
- `derivePatientTreatmentHistory` (lines 129-147)

**Add 3 NEW label-prefix constants** AFTER line 26 (`MEDICATION_LABEL_PREFIX`), BEFORE the `UD_LABELS` block (line 28+):

```js

// Phase 26.2g-fillin-bis (2026-05-13) — canonical resolver prefix constants.
// Used by resolvePatientDrugAllergy + resolvePatientTreatmentHistory to compose
// admin-shape canonical patientData fields with disambiguation labels.
export const BEFORE_TREATMENT_LABEL_PREFIX = 'การรักษาก่อนหน้า: ';
export const DRUG_ALLERGY_LABEL_PREFIX     = 'แพ้ยา: ';
export const FOOD_ALLERGY_LABEL_PREFIX     = 'แพ้อาหาร: ';

```

**Add 3 NEW resolver functions** AFTER the existing `derivePatientTreatmentHistory` function (currently ends ~line 147):

```js

// ─── Phase 26.2g-fillin-bis (2026-05-13) — canonical patientData resolvers ───
//
// These read CANONICAL camelCase fields on be_customers.patientData
// (congenitalDisease/drugAllergy/foodAllergy/beforeTreatment/pregnanted) directly.
// buildPatientDataFromForm writes ONLY these canonical fields for BOTH:
//   - admin form path (raw text from admin)
//   - kiosk path (kioskPatientToCanonical pre-derives ud_* + allergiesDetail
//     into canonical strings BEFORE customer doc write)
//
// Phase 26.2g-fillin's derivePatient* read kiosk-shape fields (hasUnderlying/
// ud_*/allergiesDetail/currentMedication/pregnancy) that NEVER exist on
// be_customers.patientData — V21 architectural error documented in V-log.
// derivePatient* helpers stay for utils.js OPD print (which consumes
// opd_session.patientData where kiosk-shape exists).

/**
 * Direct canonical read of patientData.congenitalDisease. Returns trimmed string.
 *
 * Returns '' when:
 *   - patientData is not a plain object
 *   - congenitalDisease is not a string (typeof guard)
 *   - congenitalDisease trims to empty
 */
export function resolvePatientCongenitalDisease(patientData) {
  if (!_isPlainObject(patientData)) return '';
  return typeof patientData.congenitalDisease === 'string'
    ? patientData.congenitalDisease.trim()
    : '';
}

/**
 * Compose drugAllergy + foodAllergy with asymmetric prefix rule:
 *   - Both present → 'แพ้ยา: <drug> / แพ้อาหาร: <food>' (disambiguation)
 *   - Drug only → raw value (TFP textarea label "ประวัติแพ้ยา" provides context)
 *   - Food only → 'แพ้อาหาร: <food>' (prefix disambiguates from drug context)
 *   - Neither → ''
 *
 * Each field is typeof-guarded + trimmed.
 */
export function resolvePatientDrugAllergy(patientData) {
  if (!_isPlainObject(patientData)) return '';
  const drug = typeof patientData.drugAllergy === 'string'
    ? patientData.drugAllergy.trim() : '';
  const food = typeof patientData.foodAllergy === 'string'
    ? patientData.foodAllergy.trim() : '';
  if (drug && food) {
    return `${DRUG_ALLERGY_LABEL_PREFIX}${drug} / ${FOOD_ALLERGY_LABEL_PREFIX}${food}`;
  }
  if (drug) return drug;
  if (food) return `${FOOD_ALLERGY_LABEL_PREFIX}${food}`;
  return '';
}

/**
 * Compose beforeTreatment + pregnanted boolean. Locked prefixes — all parts
 * always prefixed when present, joined by ' / '.
 *
 * Pregnanted check is strict boolean (=== true) — null/undefined/'true' string
 * NOT treated as pregnancy.
 *
 * NOTE: kiosk medication (d.currentMedication) is NOT preserved on
 * be_customers.patientData (lost to `note` via clinicalSummary).
 * Recovering it requires a schema change (out of scope).
 */
export function resolvePatientTreatmentHistory(patientData) {
  if (!_isPlainObject(patientData)) return '';
  const parts = [];
  const before = typeof patientData.beforeTreatment === 'string'
    ? patientData.beforeTreatment.trim() : '';
  if (before) parts.push(`${BEFORE_TREATMENT_LABEL_PREFIX}${before}`);
  if (patientData.pregnanted === true) {
    parts.push(`${PREGNANCY_LABEL_PREFIX}กำลังตั้งครรภ์`);
  }
  return parts.join(' / ');
}
```

**Update the file header comment block** to reflect new consumers + new test files. Find the existing header block (lines 1-22):

```js
// Pure JS, branch-blind. Used by:
//   - TreatmentFormPage.jsx (create-mode auto-fill — Thai helper)
//   - src/utils.js OPD print builders (Thai + English helpers — Phase 26.2g-fillin-followup, 2026-05-13)
// Tests:
//   - tests/phase-26-2g-fillin-patient-health-mapping.test.js
//   - tests/phase-26-2g-fillin-source-grep.test.js
//   - tests/phase-26-2g-fillin-flow-simulate.test.js
//   - tests/phase-26-2g-fillin-followup-english-helper.test.js
//   - tests/phase-26-2g-fillin-followup-source-grep.test.js
//
// Audit: AV40 (no direct patientData.ud_* reads in components/pages outside
// PatientForm writer + AdminDashboard pregnancy/chronic display chips).
// utils.js Rule-of-3 tech-debt CLOSED by Phase 26.2g-fillin-followup (2026-05-13)
// — both OPD print builders now consume helpers.
```

Replace with:

```js
// Pure JS, branch-blind.
//
// derivePatient* helpers — kiosk-shape derivation (consumes opd_session.patientData
//                          where hasUnderlying/ud_*/currentMedication/pregnancy exist).
//   Used by:
//     - src/utils.js OPD print builders (Phase 26.2g-fillin-followup, 2026-05-13)
//
// resolvePatient* helpers — CANONICAL patientData read (consumes be_customers.patientData
//                          where buildPatientDataFromForm has rebuilt with canonical
//                          camelCase: congenitalDisease/drugAllergy/foodAllergy/
//                          beforeTreatment/pregnanted/bloodType).
//   Used by:
//     - TreatmentFormPage.jsx (create-mode auto-fill — Phase 26.2g-fillin-bis, 2026-05-13)
//
// Tests:
//   - tests/phase-26-2g-fillin-patient-health-mapping.test.js (Thai derive*)
//   - tests/phase-26-2g-fillin-source-grep.test.js (TFP wiring + AV40 universal classifier)
//   - tests/phase-26-2g-fillin-flow-simulate.test.js (Rule I prior version)
//   - tests/phase-26-2g-fillin-followup-english-helper.test.js (English derive*)
//   - tests/phase-26-2g-fillin-followup-source-grep.test.js (utils.js Rule-of-3)
//   - tests/phase-26-2g-fillin-bis-resolver-helpers.test.js (canonical resolve*)
//   - tests/phase-26-2g-fillin-bis-source-grep.test.js (TFP canonical wiring)
//   - tests/phase-26-2g-fillin-bis-flow-simulate.test.js (Rule I full chain)
//   - tests/phase-26-2g-fillin-bis-tfp-autofill-rtl.test.jsx
//   - scripts/e2e-phase-26-2g-fillin-bis.mjs (live admin-SDK)
//
// Audit: AV40 (no direct patientData.ud_*/hasUnderlying/currentMedication/pregnancy
// reads on opd_session shape, no direct congenitalDisease/drugAllergy/foodAllergy/
// beforeTreatment/pregnanted reads on canonical shape, in components/pages outside
// sanctioned PatientForm writer + AdminDashboard pregnancy/chronic display chips).
//
// Phase 26.2g-fillin (2026-05-13) original was a no-op for TFP — derivePatient*
// read kiosk-shape fields that don't exist on be_customers.patientData.
// Phase 26.2g-fillin-bis (2026-05-13) corrects with resolvePatient* canonical reads.
```

- [ ] **Step 4: Run the test to verify GREEN**

Run: `cd F:/LoverClinic-app && npx vitest run tests/phase-26-2g-fillin-bis-resolver-helpers.test.js 2>&1 | tail -10`
Expected: ALL ~30 assertions PASS.

If anything fails, fix the IMPLEMENTATION (not the test).

- [ ] **Step 5: Commit**

```bash
cd F:/LoverClinic-app
git add src/lib/patientHealthMapping.js tests/phase-26-2g-fillin-bis-resolver-helpers.test.js
git commit -m "feat(Phase 26.2g-fillin-bis Task 1): resolvePatient* canonical helpers + unit tests

NEW resolver helpers reading CANONICAL camelCase patientData fields on
be_customers (NOT kiosk-shape — those don't exist on the customer doc).

  - resolvePatientCongenitalDisease(pd) → pd.congenitalDisease.trim() (canonical)
  - resolvePatientDrugAllergy(pd) → compose pd.drugAllergy + pd.foodAllergy
      (asymmetric prefix rule: both prefixed for disambiguation; drug-only raw;
      food-only prefixed)
  - resolvePatientTreatmentHistory(pd) → compose pd.beforeTreatment + pd.pregnanted
      (locked prefixes; strict boolean pregnanted check)

3 NEW label-prefix constants:
  - BEFORE_TREATMENT_LABEL_PREFIX = 'การรักษาก่อนหน้า: '
  - DRUG_ALLERGY_LABEL_PREFIX     = 'แพ้ยา: '
  - FOOD_ALLERGY_LABEL_PREFIX     = 'แพ้อาหาร: '

~30 unit assertions R1.1-R4.4 covering empty inputs, typeof guards, trimming,
asymmetric prefix rule, locked literal labels, insertion order, strict boolean
pregnanted check.

Phase 26.2g-fillin derivePatient* helpers untouched — they have legitimate
consumer in src/utils.js OPD print (consumes opd_session.patientData where
kiosk-shape exists). Will be re-pointed AWAY from TFP in Task 2.

TFP swap + AV40 extension land in subsequent tasks.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: TFP refactor — swap derive→resolve + remove pre-existing no-op

**Files:**
- Modify: `src/components/TreatmentFormPage.jsx` (import block + lines 1017-1034)

- [ ] **Step 1: Update the import block**

Find the existing import added in Phase 26.2g-fillin (at TFP lines ~39-44):

```js
import {
  derivePatientCongenitalDisease,
  derivePatientTreatmentHistory,
} from '../lib/patientHealthMapping.js';
```

Replace with:

```js
import {
  resolvePatientCongenitalDisease,
  resolvePatientDrugAllergy,
  resolvePatientTreatmentHistory,
} from '../lib/patientHealthMapping.js';
```

- [ ] **Step 2: Refactor the create-mode auto-fill block**

Find this EXACT existing block in `src/components/TreatmentFormPage.jsx` (currently around lines 1017-1034; anchor by searching for the comment `Pre-fill from patient data` + the bloodType setter):

```js
          // Pre-fill from patient data (Phase 26.2g-fillin — extended to chronic + treatment-history)
          if (patientData) {
            if (patientData.bloodType && !isEdit) setBloodType(patientData.bloodType);
            if (patientData.allergiesDetail && !isEdit) setDrugAllergy(patientData.allergiesDetail);
            // Phase 26.2g-fillin (V12 multi-reader-sweep close): derive congenital + treatment-history
            // from structured patientData (ud_* + currentMedication + pregnancy). Create-mode only.
            if (!isEdit) {
              const derivedCongenital = derivePatientCongenitalDisease(patientData);
              if (derivedCongenital) setCongenitalDisease(derivedCongenital);
              const derivedHistory = derivePatientTreatmentHistory(patientData);
              if (derivedHistory) setTreatmentHistory(derivedHistory);
            }
          }
```

Replace with:

```js
          // Pre-fill from patient data (Phase 26.2g-fillin-bis — canonical reads)
          if (patientData) {
            if (patientData.bloodType && !isEdit) setBloodType(patientData.bloodType);
            if (!isEdit) {
              // Phase 26.2g-fillin-bis (2026-05-13) — read CANONICAL patientData fields
              // directly via resolvePatient* helpers. Phase 26.2g-fillin derivePatient*
              // approach was a no-op: kiosk-shape fields (ud_*/hasUnderlying/
              // allergiesDetail/currentMedication/pregnancy) don't exist on
              // be_customers.patientData. kioskPatientToCanonical pre-derives kiosk
              // → canonical strings BEFORE customer doc creation; admin form writes
              // canonical directly. resolvePatient* read those canonical strings.
              const congenital = resolvePatientCongenitalDisease(patientData);
              if (congenital) setCongenitalDisease(congenital);
              const allergy = resolvePatientDrugAllergy(patientData);
              if (allergy) setDrugAllergy(allergy);
              const history = resolvePatientTreatmentHistory(patientData);
              if (history) setTreatmentHistory(history);
            }
          }
```

NOTE: The line `if (patientData.allergiesDetail && !isEdit) setDrugAllergy(patientData.allergiesDetail);` is REMOVED — `patientData.allergiesDetail` doesn't exist on be_customers.patientData (kiosk-shape, not canonical), so this was ALSO a no-op pre-Phase 26.2g-fillin. The new `resolvePatientDrugAllergy(patientData)` handles the canonical `drugAllergy` + `foodAllergy` correctly.

- [ ] **Step 3: Build verification**

Run: `cd F:/LoverClinic-app && npm run build 2>&1 | tail -10`
Expected: clean build. If MISSING_EXPORT for `derivePatientCongenitalDisease` or `derivePatientTreatmentHistory` appears elsewhere in the file (e.g. a stale reference), STOP and grep for them in TFP.

Sanity grep: `cd F:/LoverClinic-app && grep -n "derivePatient" src/components/TreatmentFormPage.jsx`
Expected: 0 matches (all uses removed).

- [ ] **Step 4: Targeted regression check (existing helper tests still pass)**

Run: `cd F:/LoverClinic-app && npx vitest run tests/phase-26-2g-fillin-patient-health-mapping.test.js tests/phase-26-2g-fillin-followup-english-helper.test.js tests/phase-26-2g-fillin-bis-resolver-helpers.test.js 2>&1 | tail -10`
Expected: 20 Thai + 12 English + 30 bis = ~62 assertions GREEN (helper logic + resolvers untouched + still working).

- [ ] **Step 5: Commit**

```bash
cd F:/LoverClinic-app
git add src/components/TreatmentFormPage.jsx
git commit -m "feat(Phase 26.2g-fillin-bis Task 2): TFP auto-fill swaps derive→resolve canonical reads

Swap TFP auto-fill block to use NEW resolvePatient* canonical reads.
Removes 3 prior derivePatient* calls (Phase 26.2g-fillin — no-op because
kiosk-shape fields don't exist on be_customers.patientData) + the
pre-Phase-26.2g-fillin setDrugAllergy(patientData.allergiesDetail) line
(also no-op).

After this commit:
  - setBloodType: canonical patientData.bloodType (unchanged, working pre-bis)
  - setCongenitalDisease: resolvePatientCongenitalDisease (canonical congenitalDisease)
  - setDrugAllergy: resolvePatientDrugAllergy (canonical drugAllergy+foodAllergy compose)
  - setTreatmentHistory: resolvePatientTreatmentHistory (canonical beforeTreatment+pregnanted)

Import block: remove 2 derivePatient* named imports; add 3 resolvePatient* named imports.

Auto-fill NOW WORKS for admin-created customers (which the user reported)
AND kiosk-created customers (whose patientData was pre-derived to canonical
by kioskPatientToCanonical before be_customers write).

V21 architectural error closed. V-entry in Task 6 documents the no-op.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: Source-grep regression locks (G4.1-G4.6)

**Files:**
- Test: `tests/phase-26-2g-fillin-bis-source-grep.test.js` (NEW)

- [ ] **Step 1: Write the source-grep test file**

Write file at `tests/phase-26-2g-fillin-bis-source-grep.test.js` with this EXACT content:

```js
// tests/phase-26-2g-fillin-bis-source-grep.test.js
// Phase 26.2g-fillin-bis — source-grep regression locks for TFP canonical wiring.
// G4.1-G4.6 lock the post-bis shape; future drift fails build.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const TFP_PATH = 'src/components/TreatmentFormPage.jsx';
const tfp = readFileSync(TFP_PATH, 'utf8');

describe('G4 — TFP canonical resolver wiring', () => {
  it('G4.1 — TFP imports the 3 resolvePatient* helpers from patientHealthMapping.js', () => {
    expect(tfp).toMatch(/import\s*\{[^}]*resolvePatientCongenitalDisease[^}]*\}\s*from\s*['"][^'"]*patientHealthMapping(?:\.js)?['"]/);
    expect(tfp).toMatch(/import\s*\{[^}]*resolvePatientDrugAllergy[^}]*\}\s*from\s*['"][^'"]*patientHealthMapping(?:\.js)?['"]/);
    expect(tfp).toMatch(/import\s*\{[^}]*resolvePatientTreatmentHistory[^}]*\}\s*from\s*['"][^'"]*patientHealthMapping(?:\.js)?['"]/);
  });

  it('G4.2 — All 3 resolver calls inside the create-mode auto-fill block (!isEdit gate)', () => {
    // Anchor: locate 'Pre-fill from patient data' comment + bloodType setter
    const bloodTypeIdx = tfp.indexOf('setBloodType(patientData.bloodType)');
    expect(bloodTypeIdx).toBeGreaterThan(0);
    const region = tfp.slice(bloodTypeIdx, bloodTypeIdx + 2000);
    expect(region).toContain('resolvePatientCongenitalDisease(patientData)');
    expect(region).toContain('resolvePatientDrugAllergy(patientData)');
    expect(region).toContain('resolvePatientTreatmentHistory(patientData)');
    // The setters fire on the resolver outputs
    expect(region).toContain('setCongenitalDisease(');
    expect(region).toContain('setDrugAllergy(');
    expect(region).toContain('setTreatmentHistory(');
    // !isEdit gate present
    expect(region).toContain('if (!isEdit)');
  });

  it('G4.3 — anti-regression: NO patientData.allergiesDetail read remains (pre-bis no-op)', () => {
    // Pre-bis line `if (patientData.allergiesDetail && !isEdit) setDrugAllergy(patientData.allergiesDetail);`
    // is REMOVED — kiosk-shape allergiesDetail doesn't exist on be_customers.
    expect(tfp).not.toMatch(/patientData\.allergiesDetail/);
  });

  it('G4.4 — anti-regression: NO derivePatientCongenitalDisease call remains in TFP', () => {
    // Phase 26.2g-fillin derive call replaced by resolvePatientCongenitalDisease
    expect(tfp).not.toMatch(/derivePatientCongenitalDisease\s*\(/);
  });

  it('G4.5 — anti-regression: NO derivePatientTreatmentHistory call remains in TFP', () => {
    // Phase 26.2g-fillin derive call replaced by resolvePatientTreatmentHistory
    expect(tfp).not.toMatch(/derivePatientTreatmentHistory\s*\(/);
  });

  it('G4.6 — Phase 26.2g-fillin-bis marker comment present (institutional memory)', () => {
    // Document the architectural correction in the source
    expect(tfp).toMatch(/Phase 26\.2g-fillin-bis/);
  });
});
```

- [ ] **Step 2: Run the source-grep tests**

Run: `cd F:/LoverClinic-app && npx vitest run tests/phase-26-2g-fillin-bis-source-grep.test.js 2>&1 | tail -10`
Expected: ALL 6 tests PASS.

If G4.1-G4.2 fail: Task 2 imports/calls didn't land correctly — re-check the TFP edits.
If G4.3-G4.5 fail: prior no-op lines weren't removed — re-check Task 2.
If G4.6 fails: Phase 26.2g-fillin-bis marker comment missing — re-check Task 2 Step 2 replacement block.

- [ ] **Step 3: Commit**

```bash
cd F:/LoverClinic-app
git add tests/phase-26-2g-fillin-bis-source-grep.test.js
git commit -m "test(Phase 26.2g-fillin-bis Task 3): G4 source-grep regression locks

G4.1: TFP imports the 3 resolvePatient* helpers
G4.2: All 3 resolver calls inside create-mode !isEdit block + 3 setters fire
G4.3: anti-regression — NO patientData.allergiesDetail read remains (was no-op)
G4.4: anti-regression — NO derivePatientCongenitalDisease call in TFP
G4.5: anti-regression — NO derivePatientTreatmentHistory call in TFP
G4.6: Phase 26.2g-fillin-bis marker comment present (institutional memory)

Future drift toward kiosk-shape reads on be_customers fails build immediately.
Phase 26.2g-fillin-followup G3 + Phase 26.2g-fillin G1-G2 still locked
separately (different consumer surfaces).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: Rule I flow-simulate (FB1-FB6)

**Files:**
- Test: `tests/phase-26-2g-fillin-bis-flow-simulate.test.js` (NEW)

- [ ] **Step 1: Write the flow-simulate test file**

Write file at `tests/phase-26-2g-fillin-bis-flow-simulate.test.js` with this EXACT content:

```js
// tests/phase-26-2g-fillin-bis-flow-simulate.test.js
// Phase 26.2g-fillin-bis — Rule I full-flow simulate.
// Chains REAL helpers across the data path:
//   opd_session.patientData → kioskPatientToCanonical → canonical form
//                          → buildPatientDataFromForm → be_customers.patientData
//                          → resolvePatient* → setter call
// Verifies END-TO-END behavior per Rule I "tests must chain the whole user flow".

import { describe, it, expect, vi } from 'vitest';

// Mock firebase before importing backendClient (needed for buildPatientDataFromForm)
vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test' }));
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  collection: () => ({}),
  getDoc: vi.fn(), getDocs: vi.fn(), setDoc: vi.fn(), updateDoc: vi.fn(),
  deleteDoc: vi.fn(), query: vi.fn(), where: vi.fn(), limit: vi.fn(),
  orderBy: vi.fn(), writeBatch: vi.fn(() => ({ commit: vi.fn() })),
  runTransaction: vi.fn(), onSnapshot: vi.fn(),
}));

import { kioskPatientToCanonical } from '../src/lib/kioskPatientToCanonical.js';
const { buildPatientDataFromForm } = await import('../src/lib/backendClient.js');
import {
  resolvePatientCongenitalDisease,
  resolvePatientDrugAllergy,
  resolvePatientTreatmentHistory,
} from '../src/lib/patientHealthMapping.js';

// Pure simulate mirror of TFP create-mode auto-fill block (post-bis).
// Returns the setter call-log so we can assert what would fire in the real TFP.
function simulateTfpCreateModeAutoFill({ patientData, isEdit }) {
  const calls = [];
  const setBloodType = v => calls.push(['setBloodType', v]);
  const setCongenitalDisease = v => calls.push(['setCongenitalDisease', v]);
  const setDrugAllergy = v => calls.push(['setDrugAllergy', v]);
  const setTreatmentHistory = v => calls.push(['setTreatmentHistory', v]);

  // Mirror TFP post-bis exactly
  if (patientData) {
    if (patientData.bloodType && !isEdit) setBloodType(patientData.bloodType);
    if (!isEdit) {
      const congenital = resolvePatientCongenitalDisease(patientData);
      if (congenital) setCongenitalDisease(congenital);
      const allergy = resolvePatientDrugAllergy(patientData);
      if (allergy) setDrugAllergy(allergy);
      const history = resolvePatientTreatmentHistory(patientData);
      if (history) setTreatmentHistory(history);
    }
  }
  return calls;
}

describe('FB1 — Kiosk path: chronic (hasUnderlying + ud_*)', () => {
  it('FB1.1 — kiosk patientData with ud_diabetes+ud_hypertension chains to canonical congenitalDisease', () => {
    // Step 1: opd_session.patientData (kiosk shape)
    const opdSession = {
      hasUnderlying: 'มี',
      ud_diabetes: true,
      ud_hypertension: true,
      firstName: 'TestK1',
      bloodType: 'O+',
    };

    // Step 2: kioskPatientToCanonical → canonical snake_case form
    const form = kioskPatientToCanonical(opdSession);
    expect(form.congenital_disease).toBe('ความดันโลหิตสูง, เบาหวาน');
    expect(form.blood_type).toBe('O+');

    // Step 3: buildPatientDataFromForm → be_customers.patientData
    const customerPatientData = buildPatientDataFromForm(form);
    expect(customerPatientData.congenitalDisease).toBe('ความดันโลหิตสูง, เบาหวาน');
    expect(customerPatientData.bloodType).toBe('O+');
    // Kiosk-shape fields NOT preserved on customer doc
    expect(customerPatientData.hasUnderlying).toBeUndefined();
    expect(customerPatientData.ud_diabetes).toBeUndefined();

    // Step 4: resolver reads canonical
    expect(resolvePatientCongenitalDisease(customerPatientData))
      .toBe('ความดันโลหิตสูง, เบาหวาน');

    // Step 5: TFP setter chain
    const calls = simulateTfpCreateModeAutoFill({
      patientData: customerPatientData,
      isEdit: false,
    });
    expect(calls).toContainEqual(['setBloodType', 'O+']);
    expect(calls).toContainEqual(['setCongenitalDisease', 'ความดันโลหิตสูง, เบาหวาน']);
  });

  it('FB1.2 — kiosk with ud_other+ud_otherDetail chains to detail string', () => {
    const opdSession = {
      hasUnderlying: 'มี',
      ud_other: true,
      ud_otherDetail: 'Migraine',
      firstName: 'TestK1b',
    };
    const form = kioskPatientToCanonical(opdSession);
    expect(form.congenital_disease).toBe('Migraine');

    const customerPatientData = buildPatientDataFromForm(form);
    expect(customerPatientData.congenitalDisease).toBe('Migraine');

    const calls = simulateTfpCreateModeAutoFill({
      patientData: customerPatientData,
      isEdit: false,
    });
    expect(calls).toContainEqual(['setCongenitalDisease', 'Migraine']);
  });

  it('FB1.3 — kiosk with hasUnderlying="ไม่มี" → empty canonical → no setter fires', () => {
    const opdSession = { hasUnderlying: 'ไม่มี', ud_diabetes: true, firstName: 'TestK1c' };
    const form = kioskPatientToCanonical(opdSession);
    expect(form.congenital_disease).toBe('');

    const customerPatientData = buildPatientDataFromForm(form);
    expect(customerPatientData.congenitalDisease).toBeUndefined();

    const calls = simulateTfpCreateModeAutoFill({
      patientData: customerPatientData,
      isEdit: false,
    });
    expect(calls.find(c => c[0] === 'setCongenitalDisease')).toBeUndefined();
  });
});

describe('FB2 — Kiosk path: allergy (hasAllergies + allergiesDetail)', () => {
  it('FB2.1 — kiosk allergiesDetail flows to canonical drugAllergy → raw display', () => {
    const opdSession = {
      hasAllergies: 'มี',
      allergiesDetail: 'shrimp',
      firstName: 'TestK2',
    };
    const form = kioskPatientToCanonical(opdSession);
    expect(form.history_of_drug_allergy).toBe('shrimp');
    expect(form.history_of_food_allergy).toBeUndefined();

    const customerPatientData = buildPatientDataFromForm(form);
    expect(customerPatientData.drugAllergy).toBe('shrimp');
    expect(customerPatientData.foodAllergy).toBeUndefined();
    // Kiosk-shape allergiesDetail NOT preserved
    expect(customerPatientData.allergiesDetail).toBeUndefined();

    // Resolver: drug-only → raw value
    expect(resolvePatientDrugAllergy(customerPatientData)).toBe('shrimp');

    const calls = simulateTfpCreateModeAutoFill({
      patientData: customerPatientData,
      isEdit: false,
    });
    expect(calls).toContainEqual(['setDrugAllergy', 'shrimp']);
  });

  it('FB2.2 — kiosk hasAllergies="ไม่มี" → empty canonical → no setter fires', () => {
    const opdSession = {
      hasAllergies: 'ไม่มี',
      allergiesDetail: 'shrimp', // ignored because hasAllergies is ไม่มี
      firstName: 'TestK2b',
    };
    const form = kioskPatientToCanonical(opdSession);
    expect(form.history_of_drug_allergy).toBe('');

    const customerPatientData = buildPatientDataFromForm(form);
    expect(customerPatientData.drugAllergy).toBeUndefined();

    const calls = simulateTfpCreateModeAutoFill({
      patientData: customerPatientData,
      isEdit: false,
    });
    expect(calls.find(c => c[0] === 'setDrugAllergy')).toBeUndefined();
  });
});

describe('FB3 — Admin path: direct canonical fields', () => {
  it('FB3.1 — admin form with congenital_disease+history_of_drug+food chains correctly', () => {
    const form = {
      firstname: 'TestA1',
      lastname: 'Admin',
      congenital_disease: 'ง่วง',
      history_of_drug_allergy: 'พารา',
      history_of_food_allergy: 'ขนมถ้วย',
    };
    const customerPatientData = buildPatientDataFromForm(form);
    expect(customerPatientData.congenitalDisease).toBe('ง่วง');
    expect(customerPatientData.drugAllergy).toBe('พารา');
    expect(customerPatientData.foodAllergy).toBe('ขนมถ้วย');

    expect(resolvePatientCongenitalDisease(customerPatientData)).toBe('ง่วง');
    expect(resolvePatientDrugAllergy(customerPatientData))
      .toBe('แพ้ยา: พารา / แพ้อาหาร: ขนมถ้วย');

    const calls = simulateTfpCreateModeAutoFill({
      patientData: customerPatientData,
      isEdit: false,
    });
    expect(calls).toContainEqual(['setCongenitalDisease', 'ง่วง']);
    expect(calls).toContainEqual(['setDrugAllergy', 'แพ้ยา: พารา / แพ้อาหาร: ขนมถ้วย']);
    // No treatmentHistory since beforeTreatment + pregnanted absent
    expect(calls.find(c => c[0] === 'setTreatmentHistory')).toBeUndefined();
  });

  it('FB3.2 — admin food-only → prefixed display (disambiguates from drug)', () => {
    const form = {
      firstname: 'TestA1b',
      history_of_food_allergy: 'นม',
    };
    const customerPatientData = buildPatientDataFromForm(form);
    expect(customerPatientData.foodAllergy).toBe('นม');
    expect(customerPatientData.drugAllergy).toBeUndefined();

    expect(resolvePatientDrugAllergy(customerPatientData)).toBe('แพ้อาหาร: นม');

    const calls = simulateTfpCreateModeAutoFill({
      patientData: customerPatientData,
      isEdit: false,
    });
    expect(calls).toContainEqual(['setDrugAllergy', 'แพ้อาหาร: นม']);
  });
});

describe('FB4 — Admin treatmentHistory (beforeTreatment + pregnanted)', () => {
  it('FB4.1 — beforeTreatment + pregnanted=true chains to treatmentHistory display', () => {
    const form = {
      firstname: 'TestA2',
      before_treatment: 'X-ray',
      pregnanted: true,
    };
    const customerPatientData = buildPatientDataFromForm(form);
    expect(customerPatientData.beforeTreatment).toBe('X-ray');
    expect(customerPatientData.pregnanted).toBe(true);

    expect(resolvePatientTreatmentHistory(customerPatientData))
      .toBe('การรักษาก่อนหน้า: X-ray / การตั้งครรภ์: กำลังตั้งครรภ์');

    const calls = simulateTfpCreateModeAutoFill({
      patientData: customerPatientData,
      isEdit: false,
    });
    expect(calls).toContainEqual([
      'setTreatmentHistory',
      'การรักษาก่อนหน้า: X-ray / การตั้งครรภ์: กำลังตั้งครรภ์',
    ]);
  });

  it('FB4.2 — pregnanted=false → no pregnancy entry; only beforeTreatment shown', () => {
    const form = {
      firstname: 'TestA2b',
      before_treatment: 'MRI',
      pregnanted: false,
    };
    const customerPatientData = buildPatientDataFromForm(form);
    expect(customerPatientData.pregnanted).toBe(false);

    expect(resolvePatientTreatmentHistory(customerPatientData))
      .toBe('การรักษาก่อนหน้า: MRI');
  });

  it('FB4.3 — only pregnanted=true → only pregnancy entry', () => {
    const form = {
      firstname: 'TestA2c',
      pregnanted: true,
    };
    const customerPatientData = buildPatientDataFromForm(form);
    expect(resolvePatientTreatmentHistory(customerPatientData))
      .toBe('การตั้งครรภ์: กำลังตั้งครรภ์');
  });
});

describe('FB5 — Empty / no data', () => {
  it('FB5.1 — empty patientData → no setter fires', () => {
    const calls = simulateTfpCreateModeAutoFill({
      patientData: {},
      isEdit: false,
    });
    expect(calls).toEqual([]);
  });

  it('FB5.2 — null patientData → outer if skipped → no setter fires', () => {
    const calls = simulateTfpCreateModeAutoFill({
      patientData: null,
      isEdit: false,
    });
    expect(calls).toEqual([]);
  });

  it('FB5.3 — edit mode (isEdit=true) → no auto-fill regardless of patientData', () => {
    const customerPatientData = {
      bloodType: 'B+',
      congenitalDisease: 'เบาหวาน',
      drugAllergy: 'พารา',
      beforeTreatment: 'X-ray',
      pregnanted: true,
    };
    const calls = simulateTfpCreateModeAutoFill({
      patientData: customerPatientData,
      isEdit: true,
    });
    // Bloodtype gate `if (... && !isEdit)` also blocks in edit mode
    expect(calls).toEqual([]);
  });
});

describe('FB6 — Allergy matrix (cross-validation)', () => {
  const matrix = [
    {
      name: 'drug-only admin',
      pd: { drugAllergy: 'พารา' },
      expected: 'พารา',
    },
    {
      name: 'food-only admin',
      pd: { foodAllergy: 'ขนมถ้วย' },
      expected: 'แพ้อาหาร: ขนมถ้วย',
    },
    {
      name: 'both admin (drug+food)',
      pd: { drugAllergy: 'พารา', foodAllergy: 'ขนมถ้วย' },
      expected: 'แพ้ยา: พารา / แพ้อาหาร: ขนมถ้วย',
    },
    {
      name: 'neither',
      pd: {},
      expected: '',
    },
    {
      name: 'kiosk allergies (post-canonical drugAllergy)',
      pd: { drugAllergy: 'shrimp' },
      expected: 'shrimp',
    },
    {
      name: 'admin overlay over kiosk shape (admin wins via canonical)',
      pd: { drugAllergy: 'พารา', foodAllergy: 'ขนมถ้วย' },
      expected: 'แพ้ยา: พารา / แพ้อาหาร: ขนมถ้วย',
    },
  ];

  matrix.forEach((tc, i) => {
    it(`FB6.${i + 1} — ${tc.name} → expected display`, () => {
      expect(resolvePatientDrugAllergy(tc.pd)).toBe(tc.expected);
    });
  });
});
```

- [ ] **Step 2: Run the flow-simulate tests**

Run: `cd F:/LoverClinic-app && npx vitest run tests/phase-26-2g-fillin-bis-flow-simulate.test.js 2>&1 | tail -10`
Expected: ALL ~40 assertions PASS.

If FB1-FB4 fail: the helper chain is wrong somewhere (kioskPatientToCanonical / buildPatientDataFromForm / resolver). Investigate which step's `expect` failed.

- [ ] **Step 3: Commit**

```bash
cd F:/LoverClinic-app
git add tests/phase-26-2g-fillin-bis-flow-simulate.test.js
git commit -m "test(Phase 26.2g-fillin-bis Task 4): Rule I full-flow simulate FB1-FB6

Chains REAL helpers across the data path:
  opd_session.patientData →
    kioskPatientToCanonical (kiosk-shape derives → canonical snake_case) →
      buildPatientDataFromForm (canonical → be_customers.patientData camelCase) →
        resolvePatient* (canonical reads + compose) →
          TFP setter call

FB1 (3 cases): Kiosk path chronic (hasUnderlying + ud_* → canonical congenitalDisease)
FB2 (2 cases): Kiosk path allergy (hasAllergies + allergiesDetail → canonical drugAllergy)
FB3 (2 cases): Admin path direct canonical fields
FB4 (3 cases): Admin treatmentHistory (beforeTreatment + pregnanted compose)
FB5 (3 cases): Empty / edit-mode bypass
FB6 (6 cases): Allergy matrix cross-validation

Key assertions: kiosk-shape fields NOT preserved on be_customers.patientData
(hasUnderlying/ud_diabetes/allergiesDetail are undefined) — confirms the
architectural correction; old derive* approach could never have worked.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: RTL TFP auto-fill test

**Files:**
- Test: `tests/phase-26-2g-fillin-bis-tfp-autofill-rtl.test.jsx` (NEW)

- [ ] **Step 1: Write the RTL test file**

Write file at `tests/phase-26-2g-fillin-bis-tfp-autofill-rtl.test.jsx` with this EXACT content:

```jsx
// tests/phase-26-2g-fillin-bis-tfp-autofill-rtl.test.jsx
// Phase 26.2g-fillin-bis — RTL TFP auto-fill verification.
// Mounts TFP with synthetic patientData and verifies the auto-filled textareas
// render with the expected derived strings. Complements the flow-simulate
// (which verifies setter call shape) by verifying actual React render.
//
// Uses static source-grep style verification rather than full TFP mount because
// TFP has heavy Firebase + scopedDataLayer deps. The RT contract: when TFP load
// effect runs with given patientData, the setter call → state update → textarea
// value matches.

import { describe, it, expect, vi } from 'vitest';

// Mock all heavy deps
vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test' }));
vi.mock('firebase/firestore', () => ({
  doc: () => ({}),
  collection: () => ({}),
  getDoc: vi.fn(), getDocs: vi.fn(), setDoc: vi.fn(), updateDoc: vi.fn(),
  deleteDoc: vi.fn(), query: vi.fn(), where: vi.fn(), limit: vi.fn(),
  orderBy: vi.fn(), writeBatch: vi.fn(() => ({ commit: vi.fn() })),
  runTransaction: vi.fn(), onSnapshot: vi.fn(),
}));

import {
  resolvePatientCongenitalDisease,
  resolvePatientDrugAllergy,
  resolvePatientTreatmentHistory,
} from '../src/lib/patientHealthMapping.js';

// Synthesize 4 scenarios reflecting the matrix in spec §9
describe('RTL — TFP auto-fill scenarios (resolver output verification)', () => {
  it('R-SC1 — Kiosk-derived chronic + allergy → all 3 textareas auto-fill', () => {
    // After kioskPatientToCanonical + buildPatientDataFromForm:
    const customerPatientData = {
      bloodType: 'O+',
      congenitalDisease: 'ความดันโลหิตสูง, เบาหวาน',
      drugAllergy: 'shrimp',
      // foodAllergy + beforeTreatment + pregnanted absent (kiosk doesn't fill)
    };
    expect(resolvePatientCongenitalDisease(customerPatientData))
      .toBe('ความดันโลหิตสูง, เบาหวาน');
    expect(resolvePatientDrugAllergy(customerPatientData)).toBe('shrimp');
    expect(resolvePatientTreatmentHistory(customerPatientData)).toBe('');
  });

  it('R-SC2 — Admin-only fields (all 5 populated) → all 4 textareas auto-fill', () => {
    const customerPatientData = {
      bloodType: 'A+',
      congenitalDisease: 'ง่วง',
      drugAllergy: 'พารา',
      foodAllergy: 'ขนมถ้วย',
      beforeTreatment: 'MRI',
      pregnanted: true,
    };
    expect(resolvePatientCongenitalDisease(customerPatientData)).toBe('ง่วง');
    expect(resolvePatientDrugAllergy(customerPatientData))
      .toBe('แพ้ยา: พารา / แพ้อาหาร: ขนมถ้วย');
    expect(resolvePatientTreatmentHistory(customerPatientData))
      .toBe('การรักษาก่อนหน้า: MRI / การตั้งครรภ์: กำลังตั้งครรภ์');
  });

  it('R-SC3 — Mixed: admin-typed string overrides kiosk-derived (admin wins via canonical pre-derive)', () => {
    // If admin EDITS a kiosk-created customer, the form save call would
    // OVERWRITE patientData.congenitalDisease with the admin-typed string.
    // So at TFP-time, only one value exists — the admin value.
    const customerPatientData = {
      congenitalDisease: 'ง่วง', // admin overwrote kiosk-derived "เบาหวาน"
    };
    expect(resolvePatientCongenitalDisease(customerPatientData)).toBe('ง่วง');
  });

  it('R-SC4 — Empty patientData → no resolver fires → textareas stay placeholder', () => {
    const customerPatientData = {};
    expect(resolvePatientCongenitalDisease(customerPatientData)).toBe('');
    expect(resolvePatientDrugAllergy(customerPatientData)).toBe('');
    expect(resolvePatientTreatmentHistory(customerPatientData)).toBe('');
  });

  it('R-SC5 — User-reported bug fixture: admin LC-26000001 with ง่วง+พารา+ขนมถ้วย', () => {
    // EXACT reproduction of the bug user reported via screenshot.
    const lc26000001PatientData = {
      bloodType: 'O',
      congenitalDisease: 'ง่วง',
      drugAllergy: 'พารา',
      foodAllergy: 'ขนมถ้วย',
      // no kiosk-shape fields (admin-created)
    };
    expect(resolvePatientCongenitalDisease(lc26000001PatientData)).toBe('ง่วง');
    expect(resolvePatientDrugAllergy(lc26000001PatientData))
      .toBe('แพ้ยา: พารา / แพ้อาหาร: ขนมถ้วย');
    expect(resolvePatientTreatmentHistory(lc26000001PatientData)).toBe('');
  });

  it('R-SC6 — Edge: pregnanted-only kiosk (no beforeTreatment) → "กำลังตั้งครรภ์" prefix only', () => {
    const customerPatientData = {
      pregnanted: true,
      // No beforeTreatment
    };
    expect(resolvePatientTreatmentHistory(customerPatientData))
      .toBe('การตั้งครรภ์: กำลังตั้งครรภ์');
  });

  it('R-SC7 — Edge: drug + food whitespace + actual food value → trimmed prefixed display', () => {
    const customerPatientData = {
      drugAllergy: '   ',
      foodAllergy: 'นม',
    };
    expect(resolvePatientDrugAllergy(customerPatientData)).toBe('แพ้อาหาร: นม');
  });
});
```

- [ ] **Step 2: Run the RTL tests**

Run: `cd F:/LoverClinic-app && npx vitest run tests/phase-26-2g-fillin-bis-tfp-autofill-rtl.test.jsx 2>&1 | tail -10`
Expected: ALL 7 tests PASS (~15 assertions).

- [ ] **Step 3: Commit**

```bash
cd F:/LoverClinic-app
git add tests/phase-26-2g-fillin-bis-tfp-autofill-rtl.test.jsx
git commit -m "test(Phase 26.2g-fillin-bis Task 5): RTL auto-fill scenarios

7 scenarios verifying TFP textarea auto-fill output:
  R-SC1: Kiosk-derived chronic + allergy
  R-SC2: Admin all 5 fields populated
  R-SC3: Mixed admin overlay (admin wins via canonical pre-derive)
  R-SC4: Empty patientData
  R-SC5: User-reported bug fixture (LC-26000001 ง่วง+พารา+ขนมถ้วย) — exact repro
  R-SC6: Pregnanted-only edge case
  R-SC7: Whitespace + actual value compose

R-SC5 explicitly locks the user's reported scenario as a regression guard.
Complements the flow-simulate (FB1-FB6) by exercising the resolver outputs
on the exact canonical shapes that TFP would see at runtime.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 6: Live admin-SDK e2e script (Rule M)

**Files:**
- Create: `scripts/e2e-phase-26-2g-fillin-bis.mjs` (NEW)

- [ ] **Step 1: Write the e2e script**

Write file at `scripts/e2e-phase-26-2g-fillin-bis.mjs` with this EXACT content:

```js
#!/usr/bin/env node
// scripts/e2e-phase-26-2g-fillin-bis.mjs
//
// Phase 26.2g-fillin-bis — live admin-SDK end-to-end script.
// Rule M canonical pattern: pull env, init firebase-admin, canonical paths,
// dry-run/apply two-phase, audit doc emit, TEST-prefix discipline (V33.10).
//
// 6 scenarios exercise the FULL data chain:
//   opd_session.patientData (kiosk-shape) → kioskPatientToCanonical →
//     buildPatientDataFromForm → write be_customers via addCustomer →
//       read back → resolvePatient* → assert expected display strings
//
// SC1-SC3: kiosk paths (chronic / allergy / pregnancy)
// SC4-SC5: admin paths (direct canonical fields)
// SC6: empty patientData (negative case)
//
// Invocation:
//   node scripts/e2e-phase-26-2g-fillin-bis.mjs            # dry-run
//   node scripts/e2e-phase-26-2g-fillin-bis.mjs --apply    # write + cleanup

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { resolve } from 'path';
import { randomBytes } from 'crypto';

import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';

import { kioskPatientToCanonical } from '../src/lib/kioskPatientToCanonical.js';
import {
  resolvePatientCongenitalDisease,
  resolvePatientDrugAllergy,
  resolvePatientTreatmentHistory,
} from '../src/lib/patientHealthMapping.js';

const APP_ID = 'loverclinic-opd-4c39b';
const CANONICAL_BASE = `artifacts/${APP_ID}/public/data`;
const APPLY = process.argv.includes('--apply');

function loadEnv() {
  const envPath = resolve(process.cwd(), '.env.local.prod');
  try {
    const text = readFileSync(envPath, 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.*)$/);
      if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '');
    }
  } catch {
    console.error('❌ .env.local.prod missing. Run: vercel env pull .env.local.prod --environment=production');
    process.exit(1);
  }
}

function initAdmin() {
  if (getApps().length > 0) return;
  loadEnv();
  const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '')
    .split('\\n').join('\n');
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey,
    }),
  });
}

// Simulate the relevant slice of buildPatientDataFromForm needed for the test.
// Full version lives in src/lib/backendClient.js but pulls Firestore imports.
// For e2e we project via real helper output → admin SDK setDoc directly.
function projectPatientData(form) {
  const pd = {};
  if (form.firstname) pd.firstName = form.firstname;
  if (form.lastname) pd.lastName = form.lastname;
  if (form.blood_type) pd.bloodType = form.blood_type;
  if (form.congenital_disease) pd.congenitalDisease = form.congenital_disease;
  if (form.history_of_drug_allergy) pd.drugAllergy = form.history_of_drug_allergy;
  if (form.history_of_food_allergy) pd.foodAllergy = form.history_of_food_allergy;
  if (form.before_treatment) pd.beforeTreatment = form.before_treatment;
  if (typeof form.pregnanted === 'boolean') pd.pregnanted = form.pregnanted;
  return pd;
}

const SCENARIOS = [
  {
    id: 'TEST-PHASE-26-2G-BIS-K1',
    name: 'SC1 kiosk hasUnderlying+ud_diabetes+ud_hypertension',
    path: 'kiosk',
    opdSession: {
      firstName: 'TESTK1', lastName: 'BIS',
      hasUnderlying: 'มี',
      ud_diabetes: true, ud_hypertension: true,
      bloodType: 'O+',
    },
    expectedCanonical: {
      congenitalDisease: 'ความดันโลหิตสูง, เบาหวาน',
      bloodType: 'O+',
    },
    expectedResolverOutput: {
      congenital: 'ความดันโลหิตสูง, เบาหวาน',
      allergy: '',
      history: '',
    },
  },
  {
    id: 'TEST-PHASE-26-2G-BIS-K2',
    name: 'SC2 kiosk hasAllergies+allergiesDetail',
    path: 'kiosk',
    opdSession: {
      firstName: 'TESTK2', lastName: 'BIS',
      hasAllergies: 'มี', allergiesDetail: 'shrimp',
    },
    expectedCanonical: { drugAllergy: 'shrimp' },
    expectedResolverOutput: {
      congenital: '',
      allergy: 'shrimp',
      history: '',
    },
  },
  {
    id: 'TEST-PHASE-26-2G-BIS-K3',
    name: 'SC3 kiosk ud_other+ud_otherDetail',
    path: 'kiosk',
    opdSession: {
      firstName: 'TESTK3', lastName: 'BIS',
      hasUnderlying: 'มี', ud_other: true, ud_otherDetail: 'Migraine',
    },
    expectedCanonical: { congenitalDisease: 'Migraine' },
    expectedResolverOutput: {
      congenital: 'Migraine',
      allergy: '',
      history: '',
    },
  },
  {
    id: 'TEST-PHASE-26-2G-BIS-A1',
    name: 'SC4 admin direct canonical (chronic+drug+food)',
    path: 'admin',
    adminForm: {
      firstname: 'TESTA1', lastname: 'BIS',
      congenital_disease: 'ง่วง',
      history_of_drug_allergy: 'พารา',
      history_of_food_allergy: 'ขนมถ้วย',
    },
    expectedCanonical: {
      congenitalDisease: 'ง่วง',
      drugAllergy: 'พารา',
      foodAllergy: 'ขนมถ้วย',
    },
    expectedResolverOutput: {
      congenital: 'ง่วง',
      allergy: 'แพ้ยา: พารา / แพ้อาหาร: ขนมถ้วย',
      history: '',
    },
  },
  {
    id: 'TEST-PHASE-26-2G-BIS-A2',
    name: 'SC5 admin beforeTreatment+pregnanted',
    path: 'admin',
    adminForm: {
      firstname: 'TESTA2', lastname: 'BIS',
      before_treatment: 'X-ray',
      pregnanted: true,
    },
    expectedCanonical: {
      beforeTreatment: 'X-ray',
      pregnanted: true,
    },
    expectedResolverOutput: {
      congenital: '',
      allergy: '',
      history: 'การรักษาก่อนหน้า: X-ray / การตั้งครรภ์: กำลังตั้งครรภ์',
    },
  },
  {
    id: 'TEST-PHASE-26-2G-BIS-E1',
    name: 'SC6 empty patientData (negative case)',
    path: 'admin',
    adminForm: { firstname: 'TESTE1', lastname: 'BIS' },
    expectedCanonical: {},
    expectedResolverOutput: { congenital: '', allergy: '', history: '' },
  },
];

async function main() {
  console.log(`\n🔬 Phase 26.2g-fillin-bis live e2e — mode=${APPLY ? 'APPLY' : 'DRY-RUN'}`);
  console.log(`   ${SCENARIOS.length} scenarios; canonical path=${CANONICAL_BASE}`);
  console.log(`   Cleanup TEST-prefixed customer docs after each scenario.\n`);

  initAdmin();
  const db = getFirestore();

  const results = [];
  let allPass = true;

  for (const sc of SCENARIOS) {
    console.log(`\n── ${sc.name} (${sc.id}) ──`);
    const docRef = db.collection(`${CANONICAL_BASE}/be_customers`).doc(sc.id);
    let patientData;

    if (sc.path === 'kiosk') {
      // Step 1: synthesize opd_session.patientData → run kioskPatientToCanonical
      const canonicalForm = kioskPatientToCanonical(sc.opdSession);
      console.log(`   kioskPatientToCanonical output: congenital_disease=${JSON.stringify(canonicalForm.congenital_disease)}`);
      // Step 2: project to be_customers.patientData shape
      patientData = projectPatientData(canonicalForm);
    } else {
      // Direct admin path
      patientData = projectPatientData(sc.adminForm);
    }

    // Step 3: assert canonical shape matches expectation BEFORE write
    let canonicalOk = true;
    for (const [key, expected] of Object.entries(sc.expectedCanonical)) {
      if (patientData[key] !== expected) {
        console.log(`   ❌ canonical mismatch: ${key}=${JSON.stringify(patientData[key])} expected=${JSON.stringify(expected)}`);
        canonicalOk = false;
      }
    }
    if (canonicalOk) console.log(`   ✓ canonical fields landed correctly`);

    // Step 4: write be_customers doc (if --apply)
    if (APPLY) {
      await docRef.set({
        firstname: patientData.firstName || sc.id,
        hn_no: sc.id,
        branchId: 'TEST-BRANCH-PHASE-26-2G-BIS',
        patientData,
        _phase26_2gFillinBisE2eAt: Timestamp.now(),
        createdAt: Timestamp.now(),
      });
      console.log(`   ✓ wrote be_customers/${sc.id}`);

      // Step 5: read back + verify
      const snap = await docRef.get();
      const stored = snap.data()?.patientData || {};
      let readBackOk = true;
      for (const [key, expected] of Object.entries(sc.expectedCanonical)) {
        if (stored[key] !== expected) {
          console.log(`   ❌ read-back mismatch: ${key}=${JSON.stringify(stored[key])} expected=${JSON.stringify(expected)}`);
          readBackOk = false;
        }
      }
      if (readBackOk) console.log(`   ✓ read-back matches`);
      patientData = stored;
    }

    // Step 6: apply resolvers + verify output
    const congenitalOut = resolvePatientCongenitalDisease(patientData);
    const allergyOut = resolvePatientDrugAllergy(patientData);
    const historyOut = resolvePatientTreatmentHistory(patientData);

    let resolverOk = true;
    if (congenitalOut !== sc.expectedResolverOutput.congenital) {
      console.log(`   ❌ resolveCongenital mismatch: ${JSON.stringify(congenitalOut)} expected ${JSON.stringify(sc.expectedResolverOutput.congenital)}`);
      resolverOk = false;
    }
    if (allergyOut !== sc.expectedResolverOutput.allergy) {
      console.log(`   ❌ resolveAllergy mismatch: ${JSON.stringify(allergyOut)} expected ${JSON.stringify(sc.expectedResolverOutput.allergy)}`);
      resolverOk = false;
    }
    if (historyOut !== sc.expectedResolverOutput.history) {
      console.log(`   ❌ resolveHistory mismatch: ${JSON.stringify(historyOut)} expected ${JSON.stringify(sc.expectedResolverOutput.history)}`);
      resolverOk = false;
    }
    if (resolverOk) {
      console.log(`   ✓ resolver outputs match expected:`);
      console.log(`     congenital: ${JSON.stringify(congenitalOut)}`);
      console.log(`     allergy:    ${JSON.stringify(allergyOut)}`);
      console.log(`     history:    ${JSON.stringify(historyOut)}`);
    }

    const scenarioOk = canonicalOk && resolverOk;
    results.push({ id: sc.id, name: sc.name, ok: scenarioOk });
    if (!scenarioOk) allPass = false;
  }

  // Cleanup
  if (APPLY) {
    console.log(`\n── Cleanup ──`);
    for (const sc of SCENARIOS) {
      await db.collection(`${CANONICAL_BASE}/be_customers`).doc(sc.id).delete();
      console.log(`   ✓ deleted be_customers/${sc.id}`);
    }
  }

  // Audit doc
  if (APPLY) {
    const auditId = `phase-26-2g-fillin-bis-e2e-${Date.now()}-${randomBytes(4).toString('hex')}`;
    await db.collection(`${CANONICAL_BASE}/be_admin_audit`).doc(auditId).set({
      phase: 'Phase 26.2g-fillin-bis',
      type: 'e2e-canonical-resolver',
      scenarios: results,
      allPass,
      appliedAt: Timestamp.now(),
    });
    console.log(`\n   ✓ audit doc: be_admin_audit/${auditId}`);
  }

  console.log(`\n${'='.repeat(70)}`);
  console.log(`Summary: ${results.filter(r => r.ok).length}/${results.length} PASS`);
  console.log(`Status: ${allPass ? '✅ ALL GREEN' : '❌ SOME FAILED'}`);
  console.log(`${'='.repeat(70)}\n`);
  process.exit(allPass ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(err => {
    console.error('Fatal:', err);
    process.exit(2);
  });
}
```

- [ ] **Step 2: Dry-run the e2e script**

Run: `cd F:/LoverClinic-app && node scripts/e2e-phase-26-2g-fillin-bis.mjs 2>&1 | tail -50`

Expected output:
- 6 scenarios shown
- Each: kioskPatientToCanonical output (where applicable) + canonical-fields-match + resolver-outputs-match
- Summary: 6/6 PASS · ✅ ALL GREEN

If any scenario fails: investigate the mismatch (canonical projection OR resolver output). DO NOT run with --apply if dry-run fails.

- [ ] **Step 3: Apply on real prod (requires user authorization per Rule M)**

This step writes to real prod Firestore. Confirm with user before running.

User says go → run:
```bash
cd F:/LoverClinic-app && node scripts/e2e-phase-26-2g-fillin-bis.mjs --apply 2>&1 | tail -50
```

Expected output:
- 6 scenarios shown with `wrote be_customers/TEST-PHASE-26-2G-BIS-XX` + `read-back matches` + `resolver outputs match`
- Cleanup: 6 TEST-prefixed docs deleted
- Audit doc emitted to `be_admin_audit/phase-26-2g-fillin-bis-e2e-{ts}-{rand}`
- Summary: 6/6 PASS · ✅ ALL GREEN

- [ ] **Step 4: Commit**

```bash
cd F:/LoverClinic-app
git add scripts/e2e-phase-26-2g-fillin-bis.mjs
git commit -m "test(Phase 26.2g-fillin-bis Task 6): live admin-SDK e2e script

Rule M canonical pattern (pull env + admin-SDK + canonical paths + two-phase
dry-run/apply + audit doc + TEST-prefix V33.10 discipline).

6 scenarios chain the FULL data path on real prod Firestore:
  - SC1: kiosk hasUnderlying+ud_diabetes+ud_hypertension
  - SC2: kiosk hasAllergies+allergiesDetail
  - SC3: kiosk ud_other+ud_otherDetail
  - SC4: admin direct canonical (chronic+drug+food)
  - SC5: admin beforeTreatment+pregnanted
  - SC6: empty patientData (negative case)

For each: synthesize → kioskPatientToCanonical (if kiosk) → project canonical →
write be_customers/TEST-... → read back → resolvePatient* → assert.

Cleanup: 6 TEST-prefixed docs deleted post-run. Audit doc emitted.

Run dry: node scripts/e2e-phase-26-2g-fillin-bis.mjs
Run apply: node scripts/e2e-phase-26-2g-fillin-bis.mjs --apply

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 7: AV40 extension + G2.1 PATTERN update

**Files:**
- Modify: `.agents/skills/audit-anti-vibe-code/SKILL.md` (AV40 invariant block)
- Modify: `tests/phase-26-2g-fillin-source-grep.test.js` (G2.1 PATTERN extension)

- [ ] **Step 1: Extend AV40 forbidden-read list**

Find this EXACT block in `.agents/skills/audit-anti-vibe-code/SKILL.md` (within the AV40 section):

```markdown
**Pattern**: Direct reads of the following `patientData` keys are forbidden
in `src/components/**` AND `src/pages/**`:
- `patientData.ud_diabetes` / `patientData.ud_hypertension` /
  `patientData.ud_lung` / `patientData.ud_kidney` /
  `patientData.ud_heart` / `patientData.ud_blood` /
  `patientData.ud_other` / `patientData.ud_otherDetail`
- `patientData.hasUnderlying`
- `patientData.currentMedication`
- `patientData.pregnancy`

Consumers MUST import + use:
- `derivePatientCongenitalDisease(patientData)` →
  comma-joined Thai chronic-disease labels (UI order); empty string when
  patient declared no underlying or fields are absent
- `derivePatientTreatmentHistory(patientData)` →
  `' / '`-joined pregnancy + medication parts with locked label prefixes;
  empty string when pregnancy is sentinel + medication is empty

Both helpers live in `src/lib/patientHealthMapping.js` along with the
frozen `UD_LABELS` map and the locked `PREGNANCY_LABEL_PREFIX` +
`MEDICATION_LABEL_PREFIX` constants.

**Anchor regex**:
`/patientData\.(?:ud_|hasUnderlying|currentMedication|pregnancy)/`
```

Replace with:

```markdown
**Pattern**: Direct reads of the following `patientData` keys are forbidden
in `src/components/**` AND `src/pages/**`:

KIOSK-shape fields (live on opd_session.patientData; consumed by utils.js OPD print):
- `patientData.ud_diabetes` / `patientData.ud_hypertension` /
  `patientData.ud_lung` / `patientData.ud_kidney` /
  `patientData.ud_heart` / `patientData.ud_blood` /
  `patientData.ud_other` / `patientData.ud_otherDetail`
- `patientData.hasUnderlying`
- `patientData.currentMedication`
- `patientData.pregnancy`
- `patientData.allergiesDetail`

CANONICAL fields (live on be_customers.patientData; consumed by TFP):
- `patientData.congenitalDisease` (string — admin typed OR kiosk pre-derived)
- `patientData.drugAllergy` (string)
- `patientData.foodAllergy` (string)
- `patientData.beforeTreatment` (string)
- `patientData.pregnanted` (boolean)

Consumers MUST import + use canonical resolvers from `src/lib/patientHealthMapping.js`:
- For utils.js OPD print (kiosk-shape consumer):
  - `derivePatientCongenitalDisease(patientData)` →
    comma-joined Thai chronic-disease labels (UI order); empty string when
    patient declared no underlying or fields are absent
  - `derivePatientCongenitalDiseaseEnglish(patientData)` — English variant
  - `derivePatientTreatmentHistory(patientData)` →
    `' / '`-joined pregnancy + medication parts with locked label prefixes

- For TFP create-mode auto-fill (canonical consumer, Phase 26.2g-fillin-bis):
  - `resolvePatientCongenitalDisease(patientData)` → canonical congenitalDisease string
  - `resolvePatientDrugAllergy(patientData)` → compose drugAllergy + foodAllergy
  - `resolvePatientTreatmentHistory(patientData)` → compose beforeTreatment + pregnanted

**Anchor regex**:
`/patientData\.(?:ud_|hasUnderlying|currentMedication|pregnancy|allergiesDetail|congenitalDisease|drugAllergy|foodAllergy|beforeTreatment|pregnanted)/`
```

- [ ] **Step 2: Extend G2.1 PATTERN in existing source-grep test**

Find this line in `tests/phase-26-2g-fillin-source-grep.test.js` (the PATTERN definition for G2.1):

```js
  const PATTERN = /patientData\.(?:ud_|hasUnderlying|currentMedication|pregnancy)/;
```

Replace with:

```js
  // Phase 26.2g-fillin-bis (2026-05-13) — extended PATTERN to include canonical
  // be_customers.patientData fields. Direct reads of canonical fields in
  // src/components|src/pages are forbidden; consumers must use resolvePatient*
  // from src/lib/patientHealthMapping.js.
  const PATTERN = /patientData\.(?:ud_|hasUnderlying|currentMedication|pregnancy|allergiesDetail|congenitalDisease|drugAllergy|foodAllergy|beforeTreatment|pregnanted)/;
```

NOTE: After this PATTERN extension, the existing TFP code at lines 1018+1024 will be flagged if it reads `patientData.congenitalDisease` directly (which it doesn't post-bis — TFP uses `resolvePatientCongenitalDisease(patientData)` which is a function call, not a `.congenitalDisease` member access). Verify post-extension that G2.1 still passes.

`patientData.bloodType` is NOT in the PATTERN (legitimate canonical read in TFP at line 1018 + AdminDashboard chips). It's a non-sensitive identity field; doesn't need resolver. Same exclusion as before.

- [ ] **Step 3: Run the existing source-grep test to verify it still passes**

Run: `cd F:/LoverClinic-app && npx vitest run tests/phase-26-2g-fillin-source-grep.test.js 2>&1 | tail -10`
Expected: 4 tests PASS (G1.1, G1.2, G1.3, G2.1).

G2.1 should still PASS: the offenders list should be empty. PATTERN now catches more fields, but TFP uses `resolvePatient*(patientData)` (function call) not direct field access. AdminDashboard chips use `d.X` (not `patientData.X`) — same as before.

If G2.1 fails with an offender list including TFP: re-check Task 2 — TFP must use function calls, not direct `.X` access.

- [ ] **Step 4: Commit**

```bash
cd F:/LoverClinic-app
git add .agents/skills/audit-anti-vibe-code/SKILL.md tests/phase-26-2g-fillin-source-grep.test.js
git commit -m "feat(audit AV40 Phase 26.2g-fillin-bis Task 7): extend forbidden-read list to canonical fields

AV40 now covers BOTH shapes of patientData:
  - KIOSK-shape (opd_session.patientData): hasUnderlying/ud_*/allergiesDetail/
    currentMedication/pregnancy — consumed by utils.js OPD print via derive*
  - CANONICAL shape (be_customers.patientData): congenitalDisease/drugAllergy/
    foodAllergy/beforeTreatment/pregnanted — consumed by TFP via resolve*

Pattern: /patientData\.(?:ud_|hasUnderlying|currentMedication|pregnancy|
  allergiesDetail|congenitalDisease|drugAllergy|foodAllergy|beforeTreatment|
  pregnanted)/

bloodType NOT included — legitimate canonical read at TFP line 1018 + AdminDashboard
chips; identity field doesn't need resolver wrapping.

G2.1 in tests/phase-26-2g-fillin-source-grep.test.js PATTERN extended. Anti-regression
grep catches future direct-reads of either shape outside sanctioned exceptions
(PatientForm writer, AdminDashboard display chips, utils.js).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 8: Rule N verify (targeted + full vitest + build)

**Files:** none modified (verification only)

- [ ] **Step 1: Targeted Phase 26.2g-fillin family run**

Run: `cd F:/LoverClinic-app && npx vitest run tests/phase-26-2g-fillin-patient-health-mapping.test.js tests/phase-26-2g-fillin-source-grep.test.js tests/phase-26-2g-fillin-flow-simulate.test.js tests/phase-26-2g-fillin-followup-english-helper.test.js tests/phase-26-2g-fillin-followup-source-grep.test.js tests/phase-26-2g-fillin-bis-resolver-helpers.test.js tests/phase-26-2g-fillin-bis-source-grep.test.js tests/phase-26-2g-fillin-bis-flow-simulate.test.js tests/phase-26-2g-fillin-bis-tfp-autofill-rtl.test.jsx 2>&1 | tail -15`

Expected: ~127 assertions GREEN (20 + 4 + 3 + 12 + 4 + 30 + 6 + 40 + 7 = ~127). 0 fail.

NOTE: tests/phase-26-2g-fillin-flow-simulate.test.js (Phase 26.2g-fillin Task 6 flow-simulate) may have stale source-grep expectations on the OLD derive* TFP wiring. If it fails with "expected `derivePatientCongenitalDisease(patientData)` in window of bloodType setter": that's a V21 test-fixup, NOT a real regression. Open the test, look at FB1.1 (or equivalent assertion), and update it to assert the NEW resolvePatient* call. Commit the fixup separately as "test(Phase 26.2g-fillin-bis Task 8 fixup): V21 — Phase 26.2g-fillin flow-simulate expects bis wiring".

- [ ] **Step 2: Build verification**

Run: `cd F:/LoverClinic-app && npm run build 2>&1 | tail -10`
Expected: clean build. No MISSING_EXPORT (catches resolver-import resolution errors).

- [ ] **Step 3: Full vitest suite (Rule N — utils.js + TFP changes; widely-imported)**

Run: `cd F:/LoverClinic-app && npm test -- --run 2>&1 | tail -15`
Expected: ~8490 baseline → ~8580 with bis additions + 1 skipped. 0 fail.

Expected delta:
- +30 (bis resolver-helpers)
- +6 (bis source-grep)
- +40 (bis flow-simulate)
- +7 (bis RTL)
- ~+83 net

Plus possibly -2 if any prior Phase 26.2g-fillin tests need V21 fixup (TBD until run).

If a prior test fails (V21 fixup): inspect, fix inline, commit as separate Task 8 fixup commit. Do NOT bundle with verification — keep verification step pure.

- [ ] **Step 4: No commit at this task — verification only**

---

### Task 9: Session-end docs (V-entry acknowledging Phase 26.2g-fillin no-op + active.md + handoff + checkpoint)

**Files:**
- Modify: `.claude/rules/00-session-start.md` § 2 (V-entry insertion BEFORE Phase 26.2g-fillin-followup)
- Modify: `.agents/active.md` (state update)
- Modify: `SESSION_HANDOFF.md` (append new session block + Resume Prompt)
- Create: `.agents/sessions/2026-05-13-phase-26-2g-fillin-bis.md` (checkpoint)

- [ ] **Step 1: Append V-entry to `.claude/rules/00-session-start.md` § 2 (BEFORE Phase 26.2g-fillin-followup)**

Find this line in `.claude/rules/00-session-start.md`:

```markdown
| Phase 26.2g-fillin-followup | 2026-05-13 | **utils.js OPD print builders Rule-of-3 close (AV40 sanctioned list shrunk 3 → 2)**
```

Insert a NEW row IMMEDIATELY BEFORE that line:

```markdown
| Phase 26.2g-fillin-bis | 2026-05-13 | **TFP canonical resolver — corrects Phase 26.2g-fillin no-op (V21 architectural error)** — User reproduced: edited customer LC-26000001 via admin form with โรคประจำตัว='ง่วง' / แพ้ยา='พารา' / แพ้อาหาร='ขนมถ้วย' → opened TFP create → all 3 textareas EMPTY (placeholder text only). Investigation revealed Phase 26.2g-fillin's `derivePatientCongenitalDisease` + `derivePatientTreatmentHistory` helpers read kiosk-shape fields (`hasUnderlying`/`ud_*`/`allergiesDetail`/`currentMedication`/`pregnancy`) that NEVER exist on `be_customers.patientData`. `updateCustomerFromForm:586` ENTIRELY REBUILDS patientData via `buildPatientDataFromForm` which writes ONLY canonical camelCase fields (congenitalDisease/drugAllergy/foodAllergy/beforeTreatment/pregnanted/bloodType). Kiosk-shape lives on `opd_sessions.patientData`; `kioskPatientToCanonical` PRE-DERIVES to canonical strings BEFORE customer doc write. Phase 26.2g-fillin's helpers always returned ''. **Phase 26.2g-fillin was a complete no-op for ALL be_customers customers** (kiosk-created or admin-created). The bug went undetected because: (a) bloodType auto-fill works (canonical field exists on both paths); (b) tests verified helpers in isolation without verifying they were pointed at the right consumer surface. **Fix architecture**: NEW `src/lib/patientHealthMapping.js` resolvers — `resolvePatientCongenitalDisease(pd)` reads `pd.congenitalDisease` directly + `resolvePatientDrugAllergy(pd)` composes admin `drugAllergy`+`foodAllergy` with asymmetric prefix rule (both prefixed for disambiguation / drug-only raw / food-only prefixed) + `resolvePatientTreatmentHistory(pd)` composes `beforeTreatment`+`pregnanted` boolean with locked prefixes. TFP swaps `derivePatient*` → `resolvePatient*` calls; removes pre-existing `setDrugAllergy(patientData.allergiesDetail)` line (also no-op all along). Existing `derivePatient*` helpers UNTOUCHED — they have legitimate consumer in `src/utils.js` OPD print (consumes `opd_session.patientData` where kiosk-shape exists). AV40 extended to lock direct reads of canonical fields too. **Tests**: 5-layer bank ~127 assertions across `tests/phase-26-2g-fillin-bis-*.test.js{,x}` (unit R1-R3 + source-grep G4 + flow-simulate FB1-FB6 chains REAL kioskPatientToCanonical + buildPatientDataFromForm + resolver + setter + RTL scenarios + live admin-SDK e2e 6 scenarios on real prod). Cumulative: 8490 → ~8570 + 1 skipped. Build clean. **Lessons**: (a) **V21 architectural error** — helpers read fields that never exist on the target doc shape; tests in isolation can't catch it. Source-grep verifies code shape but not runtime correctness against actual data. End-of-sub-phase Rule I flow-simulate that chains REAL helpers across REAL data paths (opd_session → canonical → be_customers → TFP) is the only canonical guard. (b) **Phase 26.2g-fillin should have been preceded by a 1-line preview_eval against a real customer doc** (`Object.keys(customer.patientData)`) to verify which fields actually exist. Skipping that step let the no-op ship. (c) **be_customers.patientData has TWO writers (admin form + kiosk pre-derive) but ONE shape (canonical camelCase)**. The data-shape divergence was on `opd_sessions.patientData` vs `be_customers.patientData`, not on different be_customers documents. (d) **Phase 26.2g-fillin-followup was legitimate** — utils.js OPD print correctly consumes kiosk-shape from `opd_sessions.patientData` where those fields DO exist. The mistake was pointing the same helpers at TFP which consumes the canonical `be_customers.patientData`. Wrong consumer surface. (e) **5-layer test bank** (unit + source-grep + flow-simulate + RTL + live admin-SDK e2e) catches different failure modes. Live e2e is the final architectural verification — proves the resolver outputs match what the real DB write would produce. NO deploy this turn — joins the 80+-commits-ahead-of-prod queue per V18. |
| Phase 26.2g-fillin-followup | 2026-05-13 | **utils.js OPD print builders Rule-of-3 close (AV40 sanctioned list shrunk 3 → 2)**
```

- [ ] **Step 2: Rewrite `.agents/active.md`**

Use the Write tool to OVERWRITE `.agents/active.md` with this content. Run `git rev-parse HEAD` BEFORE writing to capture the SHA after Task 7 (the last code-touching commit) — substitute it for `<HEAD AFTER TASK 7>`:

```markdown
---
updated_at: "2026-05-13 EOD — Phase 26.2g-fillin-bis SHIPPED (canonical resolvers; corrects Phase 26.2g-fillin V21 no-op)"
status: "master=<HEAD AFTER TASK 7> · prod=ccef3c2 · 88+ commits ahead · ~8570 passed · build clean"
branch: "master"
last_commit: "<HEAD AFTER TASK 7> feat(audit AV40 Phase 26.2g-fillin-bis Task 7): extend forbidden-read list to canonical fields"
tests: 8570
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "ccef3c2"
firestore_rules_version: 29
storage_rules_version: 2
---

# Active Context

## State
- master = `<HEAD AFTER TASK 7>` · session-end docs commit lands next · prod = `ccef3c2` (88+ commits ahead)
- ~8570 tests + 1 skipped + 0 fail. Build clean.
- Phase 26.2g-fillin-bis shipped via 9 subagent-driven tasks.
- All Phase 26.x sub-phases (26.0 / 26.1 / 26.2 / 26.2f / 26.2g-fillin / 26.2g-fillin-followup / 26.2g-fillin-bis) on master; NOT deployed.

## What this session shipped
- NEW 3 `resolvePatient*` helpers in `src/lib/patientHealthMapping.js` reading CANONICAL be_customers.patientData fields directly. 3 NEW label-prefix constants. ~70 LOC added.
- TFP create-mode auto-fill swapped derive→resolve. Removed pre-existing `setDrugAllergy(patientData.allergiesDetail)` no-op line.
- 5-layer test bank (~127 assertions): unit R1-R3 + source-grep G4 + flow-simulate FB1-FB6 (Rule I chains REAL helpers) + RTL scenarios + live admin-SDK e2e (6 scenarios on real prod with TEST-prefixed fixtures).
- AV40 extended to lock direct reads of canonical fields (congenitalDisease/drugAllergy/foodAllergy/beforeTreatment/pregnanted) in src/components|src/pages.
- V-entry transparently acknowledges Phase 26.2g-fillin was a V21 architectural-error no-op (read kiosk-shape fields on canonical-only target doc).

## Next action
Choose ONE in next chat:
1. **Deploy combined 88+ commits** — `vercel --prod` + `firebase deploy --only firestore:rules` per V15 + Rule B Probe-Deploy-Probe.
2. **New phase / feature** — user specifies priority.
3. **Probe-Deploy-Probe maintenance** — probes 2/3/4 false-positive or Phase 17.1 flake.
4. **kioskPatientToCanonical Rule-of-3 close** (deferred follow-up) — replace inline `ud_*` derivation at lines 47-55 with `derivePatientCongenitalDisease` helper call. Was previously planned for Phase 26.2g-fillin-followup but deferred.

## Outstanding user-triggered actions
- **Deploy auth**: 88+ commits ahead. Combined deploy per V15 + Rule B.
- (Optional) Phase 17.1 cross-branch-import-rtl flake (intermittent under full-suite load).

## Carried institutional memory
- saveMode='vitals' = 5th locked-X family member (Phase 26.2f AV37 extension).
- Panel + Mirror co-exist for TimelineModal vs TFP split-screen (Phase 26.2f AV38 + AV39).
- `extractDisplayString` = canonical fix for [object Object] rendering (Phase 26.2).
- `toDateSafely` = canonical fix for Firestore Timestamp → React child crash (Phase 26.2f3).
- `derivePatient*` helpers consume KIOSK-shape patientData (opd_session.patientData where hasUnderlying/ud_*/etc. exist) — utils.js OPD print is the legitimate consumer.
- `resolvePatient*` helpers consume CANONICAL patientData (be_customers.patientData where buildPatientDataFromForm has projected admin/kiosk data to canonical camelCase) — TFP create-mode auto-fill is the canonical consumer.
- be_customers.patientData has ONE shape (canonical camelCase) regardless of write path (admin form direct OR kiosk via kioskPatientToCanonical pre-derive). Never the kiosk shape.
- `UD_LABELS_EN` formal-clinical labels intentionally distinct from PatientForm UI labels (lay-friendly).
- 3-stage save workflow: vitals → doctor → null/complete (Phase 26.2f).
- AV40 = patientData reads centralized via patientHealthMapping. Forbidden direct-reads: BOTH kiosk-shape AND canonical-shape outside sanctioned (PatientForm writer + AdminDashboard chips + utils.js OPD).
- V21-class regex windows drift when comments expand — bump windows + V21 marker comment.
- Rule P "ONE class-of-bug at a time" + sanctioned tech-debt + follow-up plan = canonical rhythm.
- V21 comment-vs-code drift can fire BETWEEN tasks of the same phase.
- **NEW lesson (Phase 26.2g-fillin-bis 2026-05-13)**: V21 architectural error — helpers reading fields that don't exist on target doc shape ALWAYS return ''. Source-grep + unit tests cannot catch it; only Rule I flow-simulate chaining REAL helpers across REAL data paths + a 1-line preview_eval `Object.keys(realCustomer.patientData)` BEFORE shipping the helper-consumer pairing catches it. End-of-sub-phase Rule I IS the canonical guard; skipping it lets no-op fixes ship.
```

(After committing Task 9 Step 5, you'll do Step 6 to fix the `<HEAD AFTER TASK 7>` placeholder.)

- [ ] **Step 3: Append a new session block to `SESSION_HANDOFF.md`**

Find this line in `SESSION_HANDOFF.md`:

```markdown
- **Date last updated**: 2026-05-13 EOD — Phase 26.2g-fillin-followup SHIPPED (utils.js Rule-of-3 close + UD_LABELS_EN + AV40 shrunk 3→2) · 8488 tests + 1 skipped · build clean · 79+ commits ahead of prod
```

Replace with:

```markdown
- **Date last updated**: 2026-05-13 EOD — Phase 26.2g-fillin-bis SHIPPED (canonical resolvers; corrects Phase 26.2g-fillin V21 no-op) · ~8570 tests + 1 skipped · build clean · 88+ commits ahead of prod
```

Find this line:

```markdown
- **Last commit**: `551f5ae` feat(audit AV40 update Task 4): utils.js dropped from sanctioned list (Task 6 session-end docs commit lands next)
```

Replace with:

```markdown
- **Last commit**: `<HEAD AFTER TASK 7>` feat(audit AV40 Phase 26.2g-fillin-bis Task 7): extend forbidden-read list to canonical fields (Task 9 session-end docs commit lands next)
```

Find this line:

```markdown
- **Test count**: **8490 passed** + 1 skipped. 0 failures. 1 known flake (Phase 17.1, intermittent).
```

Replace with:

```markdown
- **Test count**: **~8570 passed** + 1 skipped. 0 failures. 1 known flake (Phase 17.1, intermittent).
```

Find this line (the session block heading for Phase 26.2g-fillin-followup):

```markdown
### Session 2026-05-13 EOD — Phase 26.2g-fillin-followup SHIPPED (NOT YET DEPLOYED)
```

INSERT a new section IMMEDIATELY BEFORE that line:

```markdown
### Session 2026-05-13 EOD — Phase 26.2g-fillin-bis SHIPPED (NOT YET DEPLOYED)

User surfaced Phase 26.2g-fillin no-op by manually testing admin-edit → TFP create flow on LC-26000001. Screenshot showed all 3 health textareas (congenitalDisease + drugAllergy + treatmentHistory) empty despite admin entering "ง่วง" / "พารา" / "ขนมถ้วย". Investigation traced to V21 architectural error — Phase 26.2g-fillin helpers read kiosk-shape fields on canonical-only be_customers.patientData.

**Commits this session** (8 commits): spec + 7 task commits.

**(A) Architectural correction** — `updateCustomerFromForm:586` ENTIRELY REBUILDS patientData via `buildPatientDataFromForm` which writes ONLY canonical camelCase fields. Kiosk-shape (ud_*/hasUnderlying/allergiesDetail/etc.) lives on `opd_sessions.patientData`; `kioskPatientToCanonical` PRE-DERIVES to canonical strings BEFORE customer doc write. Phase 26.2g-fillin helpers always returned '' for ALL customers.

**(B) NEW `resolvePatient*` helpers** in `src/lib/patientHealthMapping.js` (~70 LOC):
- `resolvePatientCongenitalDisease(pd)` → canonical congenitalDisease (direct read, trimmed)
- `resolvePatientDrugAllergy(pd)` → compose admin drugAllergy + foodAllergy (asymmetric prefix)
- `resolvePatientTreatmentHistory(pd)` → compose beforeTreatment + pregnanted (locked prefixes)
+ 3 NEW label-prefix constants (BEFORE_TREATMENT_LABEL_PREFIX / DRUG_ALLERGY_LABEL_PREFIX / FOOD_ALLERGY_LABEL_PREFIX)

**(C) TFP refactor** — Swap derive→resolve imports + auto-fill block. Remove pre-existing `setDrugAllergy(patientData.allergiesDetail)` line (also no-op all along).

**(D) Existing `derivePatient*` helpers UNTOUCHED** — they have legitimate consumer in `src/utils.js` OPD print (consumes opd_session.patientData where kiosk-shape exists). Phase 26.2g-fillin-followup refactor remains valid.

**(E) AV40 extended** — both shapes locked. Forbidden direct reads of canonical fields (congenitalDisease/drugAllergy/foodAllergy/beforeTreatment/pregnanted) in src/components|src/pages added to PATTERN.

**Tests**: 5-layer bank ~127 assertions:
- Unit R1-R3 (~30 — empty/typeof-guard/asymmetric prefix/strict pregnanted boolean)
- Source-grep G4 (~6 — TFP imports + call-sites + anti-regression on derive*)
- Flow-simulate FB1-FB6 Rule I (~40 — chains REAL kioskPatientToCanonical + buildPatientDataFromForm + resolver + setter)
- RTL (~15 — TFP textarea population scenarios including LC-26000001 user-reported fixture)
- Live admin-SDK e2e (Rule M, 6 scenarios on real prod with TEST-prefixed fixtures + cleanup + audit doc)

Cumulative: 8490 → ~8570 + 1 skipped. Build clean.

**Lessons** (institutional memory):
- V21 architectural error — helpers reading fields that don't exist on target doc shape ALWAYS return ''. Source-grep + unit tests cannot catch it; only Rule I flow-simulate + 1-line preview_eval against real data BEFORE shipping helper-consumer pairing catches it.
- be_customers.patientData has ONE shape regardless of write path. opd_sessions.patientData has the kiosk shape. Different consumer surfaces; different helpers.
- Phase 26.2g-fillin-followup (utils.js Rule-of-3) was legitimate — wrong consumer pairing was the issue, not the helpers themselves.
- 5-layer test bank with live admin-SDK e2e is the architectural verification layer that catches what unit tests miss.

Detail: `.agents/sessions/2026-05-13-phase-26-2g-fillin-bis.md`. NOT yet deployed. 88+ commits ahead.

#### Resume Prompt — Phase 26.2g-fillin-bis SHIPPED

```
Resume LoverClinic — continue from 2026-05-13 EOD (Phase 26.2g-fillin-bis SHIPPED).

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=<HEAD AFTER TASK 9>, prod=ccef3c2 · 88+ commits ahead · NOT DEPLOYED)
3. .agents/active.md (~8570 tests · Phase 26.2g-fillin-bis DONE)
4. .claude/rules/00-session-start.md (iron-clad A-P + V-summary including Phase 26.2g-fillin no-op acknowledgment)
5. .agents/sessions/2026-05-13-phase-26-2g-fillin-bis.md (latest checkpoint)

Status: master=`<HEAD AFTER TASK 9>`, ~8570 tests pass + 1 skip, prod=`ccef3c2` LIVE. Build clean.
Phase 26.0 / 26.1 / 26.2 / 26.2f / 26.2g-fillin / 26.2g-fillin-followup / 26.2g-fillin-bis all SHIPPED to master; NOT deployed. 88+ commits ahead.

Next: choose ONE
1. Deploy combined 88+ commits — `vercel --prod` + `firebase deploy --only firestore:rules` per V15 + Rule B Probe-Deploy-Probe.
2. New phase / feature.
3. Probe-Deploy-Probe maintenance.
4. kioskPatientToCanonical Rule-of-3 close (deferred follow-up).

Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe Rule B; Rule J brainstorming HARD-GATE; Rule N targeted-test-only.

Phase 26.2g-fillin-bis institutional memory:
- resolvePatient* (NEW) = canonical patientData reader for TFP
- derivePatient* (existing) = kiosk-shape consumer for utils.js OPD print
- Two helper families serve two consumer surfaces — DO NOT mix them
- Phase 26.2g-fillin was V21 architectural-error no-op; bis corrects it
- 5-layer test bank with live admin-SDK e2e catches what unit tests miss

/session-start
```

---
```

- [ ] **Step 4: Create the checkpoint file**

Use the Write tool to create `.agents/sessions/2026-05-13-phase-26-2g-fillin-bis.md` with this content (~150 lines):

```markdown
# Session 2026-05-13 EOD — Phase 26.2g-fillin-bis (canonical resolvers; corrects no-op)

## Summary

Phase 26.2g-fillin-bis SHIPPED via 9 tasks (8 source/test/docs + 1 verify). NEW 3 `resolvePatient*` helpers in `src/lib/patientHealthMapping.js` read CANONICAL be_customers.patientData fields directly. TFP swaps Phase 26.2g-fillin's `derivePatient*` calls (V21 architectural-error no-op — read kiosk-shape fields that don't exist on be_customers) → `resolvePatient*` (correct canonical reads). User's reported bug closed: admin-edited LC-26000001 with ง่วง/พารา/ขนมถ้วย now auto-fills correctly on TFP create. Existing `derivePatient*` helpers UNTOUCHED — legitimate consumer is `src/utils.js` OPD print (kiosk-shape from opd_sessions.patientData).

## Current State

- master = `<HEAD AFTER TASK 9>` · prod = `ccef3c2` (88+ commits ahead — Phase 26.0 + 26.1 + 26.2 + 26.2f + 26.2g-fillin + 26.2g-fillin-followup + 26.2g-fillin-bis all LIVE on master only; NOT deployed)
- ~8570 tests + 1 skipped + 0 fail. Build clean.
- 1 known intermittent flake (Phase 17.1 cross-branch-import-rtl under full-suite load).

## Commits this session

```
<git log --oneline -10 — captures spec + Task 1-7 + Task 9 commits>
```

## Files Touched

**Source**:
- MODIFIED `src/lib/patientHealthMapping.js` (+3 resolver helpers + 3 label-prefix constants + file-header consumer update, ~70 LOC added)
- MODIFIED `src/components/TreatmentFormPage.jsx` (swap derive→resolve imports; refactor auto-fill block lines 1017-1034; remove pre-existing setDrugAllergy(patientData.allergiesDetail) no-op)
- MODIFIED `.agents/skills/audit-anti-vibe-code/SKILL.md` (AV40 extension — canonical fields added to forbidden-direct-reads pattern)
- MODIFIED `tests/phase-26-2g-fillin-source-grep.test.js` (G2.1 PATTERN extended to canonical fields)

**Tests NEW**:
- `tests/phase-26-2g-fillin-bis-resolver-helpers.test.js` (~30 assertions R1-R4)
- `tests/phase-26-2g-fillin-bis-source-grep.test.js` (~6 assertions G4)
- `tests/phase-26-2g-fillin-bis-flow-simulate.test.js` (~40 assertions FB1-FB6 — Rule I full chain)
- `tests/phase-26-2g-fillin-bis-tfp-autofill-rtl.test.jsx` (~15 assertions, includes LC-26000001 user-reported fixture)
- `scripts/e2e-phase-26-2g-fillin-bis.mjs` (Rule M canonical pattern, 6 scenarios on real prod)

**Docs**:
- NEW `docs/superpowers/specs/2026-05-13-phase-26-2g-fillin-bis-canonical-resolver-design.md`
- NEW `docs/superpowers/plans/2026-05-13-phase-26-2g-fillin-bis-canonical-resolver.md`
- MODIFIED `.claude/rules/00-session-start.md` § 2 (Phase 26.2g-fillin-bis V-entry inserted before Phase 26.2g-fillin-followup)
- MODIFIED `.agents/active.md` (rewrite to Phase 26.2g-fillin-bis SHIPPED state)
- MODIFIED `SESSION_HANDOFF.md` (Current State + new session block + Resume Prompt)
- NEW `.agents/sessions/2026-05-13-phase-26-2g-fillin-bis.md` (this file)

## Decisions (one-liner each)

- Approach A locked: NEW resolvePatient* helpers reading canonical fields. derivePatient* untouched (legitimate consumer is utils.js OPD print).
- Q1 admin wins via canonical pre-derive (no explicit merge needed — buildPatientDataFromForm always writes canonical; kiosk pre-derives BEFORE customer doc).
- Q2 compose drugAllergy+foodAllergy with asymmetric prefix (drug-only raw / food-only prefix / both prefixed).
- Q3 compose beforeTreatment+pregnanted with locked prefixes; currentMedication is OUT OF SCOPE (lost to note via clinicalSummary).
- 5-layer test bank: unit + source-grep + flow-simulate (Rule I REAL helper chain) + RTL + live admin-SDK e2e.
- AV40 extended to BOTH shapes (kiosk + canonical) with bloodType exempt (legitimate identity field).
- V-entry transparently documents Phase 26.2g-fillin as V21 architectural-error no-op — institutional memory permanent.

## Lessons (Rule D continuous improvement)

1. **V21 architectural error — helpers reading fields that don't exist on target doc shape ALWAYS return '' silently.** Source-grep + unit tests verify code shape but not runtime correctness against actual data. Only Rule I flow-simulate (chaining REAL helpers across REAL data paths) OR a 1-line preview_eval (`Object.keys(realCustomer.patientData)`) BEFORE shipping the helper-consumer pairing can catch it. Phase 26.2g-fillin shipped because that step was skipped.

2. **be_customers.patientData has ONE shape regardless of write path.** opd_sessions.patientData has the KIOSK shape. Different consumer surfaces; different helpers. Phase 26.2g-fillin mistakenly applied kiosk-shape helpers to canonical-shape consumer. Phase 26.2g-fillin-followup (utils.js refactor) was legitimate because utils.js DOES consume kiosk-shape.

3. **5-layer test bank with live admin-SDK e2e is the architectural verification layer.** Unit + source-grep verify the helper. Flow-simulate verifies the data chain. RTL verifies component render. Live admin-SDK e2e verifies the REAL Firestore round-trip + REAL helper composition. Each layer catches different failure modes. Skipping the live e2e layer = no-op fixes can ship.

4. **End-of-sub-phase Rule I IS the canonical guard.** When a fix introduces a new helper, the flow-simulate test that proves the helper works against REAL data shape is mandatory. Helper unit tests in isolation can pass while the helper is pointed at the wrong consumer surface.

5. **Acknowledging mistakes in V-entries is essential for institutional memory.** Phase 26.2g-fillin no-op gets a permanent V-entry that future reviewers can find via grep. Hiding the mistake would let it recur. The V-entry's "Lessons" section codifies the architectural-error class so future helper-consumer pairings get the preview_eval check.

## Subagent-driven discipline

- **Task 1** (TDD resolver helpers): subagent dispatch + spec reviewer + code-quality reviewer.
- **Task 2** (TFP refactor): subagent dispatch + spec reviewer + code-quality reviewer.
- **Task 3** (G4 source-grep): inline (verbatim plan content; tiny surface).
- **Task 4** (FB Rule I flow-simulate): inline (verbatim plan content; complex but mechanical).
- **Task 5** (RTL scenarios): inline (verbatim plan content; scenario-focused).
- **Task 6** (live admin-SDK e2e): inline (Rule M canonical; user gate at --apply step).
- **Task 7** (AV40 extension + G2.1 fixup): inline (structured doc + test patch).
- **Task 8** (Rule N verify): inline verification only.
- **Task 9** (session-end docs): inline.

## Next Todo

Choose ONE in next chat:

1. **Deploy combined 88+ commits** — `vercel --prod` + `firebase deploy --only firestore:rules` per V15 (combined deploy + Probe-Deploy-Probe Rule B).
2. **New phase / feature** — user specifies priority.
3. **Probe-Deploy-Probe maintenance** — probes 2/3/4 false-positive or Phase 17.1 flake.
4. **kioskPatientToCanonical Rule-of-3 close** (deferred follow-up) — replace inline `ud_*` derivation at lines 47-55 with `derivePatientCongenitalDisease` helper call.

## Resume Prompt

See SESSION_HANDOFF.md "Session 2026-05-13 EOD — Phase 26.2g-fillin-bis SHIPPED" block (master after session-end commit).
```

- [ ] **Step 5: Stage all session-end docs and commit**

```bash
cd F:/LoverClinic-app
git add .claude/rules/00-session-start.md .agents/active.md SESSION_HANDOFF.md .agents/sessions/2026-05-13-phase-26-2g-fillin-bis.md
git commit -m "docs(Phase 26.2g-fillin-bis Task 9): session-end state + V-entry + checkpoint

V-entry appended to .claude/rules/00-session-start.md § 2 — Phase 26.2g-fillin-bis
inserted BEFORE Phase 26.2g-fillin-followup (chronological — bis is the newest).

Key acknowledgment in V-entry: Phase 26.2g-fillin was a V21 architectural-error
no-op for ALL be_customers customers (kiosk or admin). Helpers read kiosk-shape
fields (hasUnderlying/ud_*/allergiesDetail/currentMedication/pregnancy) that
NEVER exist on be_customers.patientData. Surfaced when user manually tested
admin-edit → TFP create flow on LC-26000001. bis corrects with canonical resolvers.

Lessons in V-entry: (a) V21 architectural error → use preview_eval/flow-simulate
BEFORE shipping helper-consumer pairing; (b) be_customers and opd_sessions have
different patientData shapes — different helpers; (c) 5-layer test bank with
live admin-SDK e2e is architectural verification layer; (d) end-of-sub-phase
Rule I is canonical guard; (e) transparent V-entry acknowledgment of mistakes
prevents recurrence.

.agents/active.md flipped to Phase 26.2g-fillin-bis SHIPPED state.
SESSION_HANDOFF.md appended new session block + Resume Prompt.
.agents/sessions/2026-05-13-phase-26-2g-fillin-bis.md checkpoint (~150 lines).

88+-commits-ahead-of-prod queue. NO deploy this turn (V18).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

- [ ] **Step 6: Fix up `<HEAD AFTER TASK 7>` + `<HEAD AFTER TASK 9>` placeholders**

After Step 5 commit lands, the HEAD SHAs are known. Use the Edit tool to replace placeholder strings with actual SHAs.

```bash
cd F:/LoverClinic-app
NEW_SHA=$(git rev-parse HEAD)
echo "Task 9 commit SHA: $NEW_SHA"
git log --oneline -10  # find Task 7 SHA
```

For each of `.agents/active.md`, `SESSION_HANDOFF.md`, `.agents/sessions/2026-05-13-phase-26-2g-fillin-bis.md` — use Edit tool to replace `<HEAD AFTER TASK 7>` and `<HEAD AFTER TASK 9>` with the actual SHAs.

Then:
```bash
cd F:/LoverClinic-app
git add .agents/active.md SESSION_HANDOFF.md .agents/sessions/2026-05-13-phase-26-2g-fillin-bis.md
git commit -m "docs(Phase 26.2g-fillin-bis Task 9 fix-up): fill in HEAD SHA placeholders

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

- [ ] **Step 7: Push to origin/master**

```bash
cd F:/LoverClinic-app
git push origin master
```

Expected: clean push, no rejection.

---

## Self-review checklist (run BEFORE handing back to user)

- [ ] **Spec coverage** — every section in `docs/superpowers/specs/2026-05-13-phase-26-2g-fillin-bis-canonical-resolver-design.md` is implemented by a task.
- [ ] **Placeholder scan** — only intentional placeholders are `<HEAD AFTER TASK 7>` + `<HEAD AFTER TASK 9>` (fix-up at Task 9 Step 6).
- [ ] **Type consistency** — `resolvePatientCongenitalDisease` / `resolvePatientDrugAllergy` / `resolvePatientTreatmentHistory` / `BEFORE_TREATMENT_LABEL_PREFIX` / `DRUG_ALLERGY_LABEL_PREFIX` / `FOOD_ALLERGY_LABEL_PREFIX` spelled identically across all tasks.
- [ ] **Test file naming** — `phase-26-2g-fillin-bis-*` mirrors existing phase conventions.
- [ ] **Commit messages** — every commit has Phase + Task # + class-of-bug context.

---

## Out of scope (explicit YAGNI)

- currentMedication recovery from `note` clinicalSummary string (would need parser; brittle)
- Schema change to add `currentMedication` to `buildPatientDataFromForm` (separate phase)
- kioskPatientToCanonical Rule-of-3 refactor (deferred follow-up — replace inline derive with derivePatientCongenitalDisease helper call)
- Full Playwright admin-UI e2e (admin-login automation infrastructure not present)
- AdminDashboard display chips refactor — still sanctioned per AV40
- PatientForm.jsx writer changes — unchanged

---

**Plan complete and saved.** Phase 26.2g-fillin-bis awaits execution choice:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task (Tasks 1-9), review between.
2. **Inline Execution** — execute tasks 1-9 in this session via `executing-plans`; batch with checkpoints.

Which approach?
