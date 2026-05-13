# Phase 26.2g-fillin — patientData → TFP health-state auto-fill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Auto-fill the TFP `congenitalDisease` + `treatmentHistory` textareas from the customer's `patientData` (ud_* chronic flags, currentMedication, pregnancy) on create-mode load — closing the V12 multi-reader-sweep gap where lines 1018-1019 set bloodType + drugAllergy but never the two newer health-info fields.

**Architecture:** One new pure-JS helper module `src/lib/patientHealthMapping.js` exports two derivation functions + 2 label-prefix constants + 1 frozen UD_LABELS map. TFP create-mode load (lines 1016-1020) gains 6 lines that import + call the helpers and gate setters on non-empty results. Test bank: 3 new files (unit + source-grep + Rule I flow-simulate) ~16 assertions total. AV40 invariant added to audit-anti-vibe-code to lock the contract (no direct `patientData.ud_*` reads in components / pages outside PatientForm + AdminDashboard).

**Tech Stack:** Pure ES Modules (no React, no Firebase). Existing project: Vite 8 + React 19 + Vitest 4.1 + Tailwind 3.4. Test runner: `npx vitest run <file>`.

---

## File Structure

| Type | Path | Responsibility |
|---|---|---|
| NEW | `src/lib/patientHealthMapping.js` | 2 derivation fns + frozen label maps + 2 prefix constants |
| EDIT | `src/components/TreatmentFormPage.jsx` (lines ~1016-1020 + imports) | Wire helpers into create-mode auto-fill block |
| NEW | `tests/phase-26-2g-fillin-patient-health-mapping.test.js` | L1-L3 helper unit tests (~15 assertions) |
| NEW | `tests/phase-26-2g-fillin-source-grep.test.js` | G1-G2 source-grep regression locks (~4 assertions) |
| NEW | `tests/phase-26-2g-fillin-flow-simulate.test.js` | F1 Rule I auto-fill chain (~3 assertions) |
| EDIT | `.agents/skills/audit-anti-vibe-code/SKILL.md` | AV40 invariant block |
| EDIT | `SESSION_HANDOFF.md` + `.agents/active.md` | State update at session end |
| EDIT | `.claude/rules/00-session-start.md` § 2 | Phase 26.2g-fillin V-summary one-liner |

Total: 2 new source files + 3 new test files + 4 small edits.

---

### Task 1: Pre-flight class-of-bug grep (Rule P Step 3)

**Files:**
- Read-only verification: confirm no other component reads `patientData.ud_*` directly (would expand the class)

- [ ] **Step 1: Grep for unsanctioned `patientData.ud_*` readers**

Run:
```bash
grep -rn "patientData\\.ud_\\|patientData\\.hasUnderlying\\|patientData\\.currentMedication\\|patientData\\.pregnancy" src/components src/pages
```

Expected output: only `src/pages/PatientForm.jsx` (writer) + `src/pages/AdminDashboard.jsx:~4530` (pregnancy display). Anything else = an undocumented class-of-bug site; surface it and ABORT plan execution to expand scope.

- [ ] **Step 2: If grep is clean, record the result in the spec doc**

Append to `docs/superpowers/specs/2026-05-13-phase-26-2g-fillin-patient-health-mapping-design.md` § 8 confirmation line:

```
Pre-flight grep (2026-05-13): only PatientForm.jsx (writer) + AdminDashboard.jsx:4530 (pregnancy chip).
TFP is the sole consumer-with-a-gap. Class-of-bug is bounded.
```

- [ ] **Step 3: Commit pre-flight result**

```bash
git add docs/superpowers/specs/2026-05-13-phase-26-2g-fillin-patient-health-mapping-design.md docs/superpowers/plans/2026-05-13-phase-26-2g-fillin-patient-health-mapping.md
git commit -m "docs(Phase 26.2g-fillin): spec + plan for patientData health auto-fill"
```

---

### Task 2: Write the failing helper unit tests (TDD)

**Files:**
- Test: `tests/phase-26-2g-fillin-patient-health-mapping.test.js`

- [ ] **Step 1: Create the test file with all L1-L3 cases**

```js
// tests/phase-26-2g-fillin-patient-health-mapping.test.js
// Phase 26.2g-fillin — patientData → TFP health-state derivation contract.
// Locks the canonical mapping that closes the create-mode auto-fill gap
// (V12 multi-reader-sweep family — bloodType + drugAllergy were filled,
// congenitalDisease + treatmentHistory were silently dropped).

import { describe, it, expect } from 'vitest';
import {
  derivePatientCongenitalDisease,
  derivePatientTreatmentHistory,
  PREGNANCY_LABEL_PREFIX,
  MEDICATION_LABEL_PREFIX,
  UD_LABELS,
} from '../src/lib/patientHealthMapping.js';

describe('L1 — derivePatientCongenitalDisease', () => {
  it('L1.1 — returns empty for null / undefined / non-object / empty object', () => {
    expect(derivePatientCongenitalDisease(null)).toBe('');
    expect(derivePatientCongenitalDisease(undefined)).toBe('');
    expect(derivePatientCongenitalDisease('string')).toBe('');
    expect(derivePatientCongenitalDisease(42)).toBe('');
    expect(derivePatientCongenitalDisease({})).toBe('');
  });

  it('L1.2 — hasUnderlying="ไม่มี" wins over any ud_* flags (self-contradiction guard)', () => {
    const pd = { hasUnderlying: 'ไม่มี', ud_diabetes: true, ud_hypertension: true };
    expect(derivePatientCongenitalDisease(pd)).toBe('');
  });

  it('L1.3 — single flag returns the corresponding Thai label', () => {
    expect(derivePatientCongenitalDisease({ hasUnderlying: 'มี', ud_diabetes: true }))
      .toBe('เบาหวาน');
  });

  it('L1.4 — two flags comma-join in UI order (hypertension before diabetes)', () => {
    const pd = { hasUnderlying: 'มี', ud_diabetes: true, ud_hypertension: true };
    expect(derivePatientCongenitalDisease(pd)).toBe('ความดันโลหิตสูง, เบาหวาน');
  });

  it('L1.5 — all 6 standard flags emit all 6 Thai labels in UI order', () => {
    const pd = {
      hasUnderlying: 'มี',
      ud_hypertension: true,
      ud_diabetes: true,
      ud_lung: true,
      ud_kidney: true,
      ud_heart: true,
      ud_blood: true,
    };
    expect(derivePatientCongenitalDisease(pd)).toBe(
      'ความดันโลหิตสูง, เบาหวาน, โรคปอด, โรคไต, โรคหัวใจ, โรคโลหิต'
    );
  });

  it('L1.6 — ud_other + ud_otherDetail returns the detail string', () => {
    const pd = { hasUnderlying: 'มี', ud_other: true, ud_otherDetail: 'ไมเกรน' };
    expect(derivePatientCongenitalDisease(pd)).toBe('ไมเกรน');
  });

  it('L1.7 — ud_other without ud_otherDetail (or whitespace) is silently omitted', () => {
    expect(derivePatientCongenitalDisease({ hasUnderlying: 'มี', ud_other: true })).toBe('');
    expect(derivePatientCongenitalDisease({ hasUnderlying: 'มี', ud_other: true, ud_otherDetail: '' })).toBe('');
    expect(derivePatientCongenitalDisease({ hasUnderlying: 'มี', ud_other: true, ud_otherDetail: '   ' })).toBe('');
  });

  it('L1.8 — standard flags emit BEFORE ud_other detail (insertion order locked)', () => {
    const pd = { hasUnderlying: 'มี', ud_diabetes: true, ud_other: true, ud_otherDetail: 'ไมเกรน' };
    expect(derivePatientCongenitalDisease(pd)).toBe('เบาหวาน, ไมเกรน');
  });

  it('L1.9 — UD_LABELS map is frozen', () => {
    expect(Object.isFrozen(UD_LABELS)).toBe(true);
    expect(UD_LABELS.ud_diabetes).toBe('เบาหวาน');
  });
});

describe('L2 — derivePatientTreatmentHistory', () => {
  it('L2.1 — empty / null / non-object → empty', () => {
    expect(derivePatientTreatmentHistory(null)).toBe('');
    expect(derivePatientTreatmentHistory(undefined)).toBe('');
    expect(derivePatientTreatmentHistory({})).toBe('');
    expect(derivePatientTreatmentHistory('string')).toBe('');
  });

  it('L2.2 — sentinel pregnancy + no medication → empty', () => {
    expect(derivePatientTreatmentHistory({ pregnancy: 'ไม่เกี่ยวข้อง/ไม่ได้ตั้งครรภ์', currentMedication: '' }))
      .toBe('');
  });

  it('L2.3 — non-sentinel pregnancy + no medication → pregnancy-only part', () => {
    expect(derivePatientTreatmentHistory({ pregnancy: 'กำลังตั้งครรภ์', currentMedication: '' }))
      .toBe('การตั้งครรภ์: กำลังตั้งครรภ์');
  });

  it('L2.4 — empty pregnancy + medication → medication-only part', () => {
    expect(derivePatientTreatmentHistory({ pregnancy: '', currentMedication: 'Asprin' }))
      .toBe('ยาที่ใช้ประจำ: Asprin');
  });

  it('L2.5 — both parts present → " / "-joined, pregnancy first', () => {
    const pd = { pregnancy: 'กำลังตั้งครรภ์', currentMedication: 'Asprin 1 เม็ด เช้า' };
    expect(derivePatientTreatmentHistory(pd))
      .toBe('การตั้งครรภ์: กำลังตั้งครรภ์ / ยาที่ใช้ประจำ: Asprin 1 เม็ด เช้า');
  });

  it('L2.6 — medication is trimmed on output', () => {
    expect(derivePatientTreatmentHistory({ currentMedication: '   Asprin   ' }))
      .toBe('ยาที่ใช้ประจำ: Asprin');
    // pure whitespace → drop entirely
    expect(derivePatientTreatmentHistory({ currentMedication: '   ' })).toBe('');
  });
});

describe('L3 — Exported label prefix constants', () => {
  it('L3.1 — PREGNANCY_LABEL_PREFIX is the locked Thai literal', () => {
    expect(PREGNANCY_LABEL_PREFIX).toBe('การตั้งครรภ์: ');
  });

  it('L3.2 — MEDICATION_LABEL_PREFIX is the locked Thai literal', () => {
    expect(MEDICATION_LABEL_PREFIX).toBe('ยาที่ใช้ประจำ: ');
  });
});
```

- [ ] **Step 2: Run the test file — confirm it fails because the module doesn't exist**

Run: `npx vitest run tests/phase-26-2g-fillin-patient-health-mapping.test.js`
Expected: ALL tests fail with "Cannot find module '../src/lib/patientHealthMapping.js'" or similar import-resolution error.

- [ ] **Step 3: Do NOT commit yet — implementation comes next**

---

### Task 3: Implement `src/lib/patientHealthMapping.js` (minimal pass)

**Files:**
- Create: `src/lib/patientHealthMapping.js`

- [ ] **Step 1: Write the helper module**

```js
// src/lib/patientHealthMapping.js
//
// Phase 26.2g-fillin (2026-05-13) — derive TFP health-info strings from the
// customer's structured patientData. Closes the V12 multi-reader-sweep gap
// at TreatmentFormPage.jsx:1016-1020 where bloodType + drugAllergy auto-fill
// shipped but congenitalDisease + treatmentHistory never did.
//
// Pure JS, branch-blind. Used by:
//   - TreatmentFormPage.jsx (create-mode auto-fill)
// Tests:
//   - tests/phase-26-2g-fillin-patient-health-mapping.test.js
//   - tests/phase-26-2g-fillin-source-grep.test.js
//   - tests/phase-26-2g-fillin-flow-simulate.test.js
//
// Audit: AV40 (no direct patientData.ud_* reads in components/pages outside
// PatientForm writer + AdminDashboard pregnancy display).

const PREGNANCY_SENTINEL = 'ไม่เกี่ยวข้อง/ไม่ได้ตั้งครรภ์';

export const PREGNANCY_LABEL_PREFIX = 'การตั้งครรภ์: ';
export const MEDICATION_LABEL_PREFIX = 'ยาที่ใช้ประจำ: ';

// UI order matches PatientForm.jsx:1095-1102 (Hypertension / Diabetes / Lung
// / Kidney / Heart / Blood). Frozen so consumers can rely on key + label
// stability; insertion order via Object literal preserves UI order.
export const UD_LABELS = Object.freeze({
  ud_hypertension: 'ความดันโลหิตสูง',
  ud_diabetes:     'เบาหวาน',
  ud_lung:         'โรคปอด',
  ud_kidney:       'โรคไต',
  ud_heart:        'โรคหัวใจ',
  ud_blood:        'โรคโลหิต',
});

function _isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Derive comma-separated chronic-disease labels from patientData.
 *
 * Returns '' when:
 *   - patientData is not a plain object
 *   - hasUnderlying !== 'มี' (patient declared no underlying — wins over flags)
 *   - all UD_LABELS keys are falsy AND ud_other-detail is empty/whitespace
 *
 * Standard flag labels emit first (UI order), then ud_otherDetail (if present).
 */
export function derivePatientCongenitalDisease(patientData) {
  if (!_isPlainObject(patientData)) return '';
  if (patientData.hasUnderlying !== 'มี') return '';

  const parts = [];
  for (const key of Object.keys(UD_LABELS)) {
    if (patientData[key]) parts.push(UD_LABELS[key]);
  }
  if (patientData.ud_other) {
    const detail = typeof patientData.ud_otherDetail === 'string'
      ? patientData.ud_otherDetail.trim()
      : '';
    if (detail) parts.push(detail);
  }
  return parts.join(', ');
}

/**
 * Derive treatment-history string from patientData.
 *
 * Composes up to two " / "-joined parts:
 *   1. 'การตั้งครรภ์: <value>' — only when pregnancy is a non-empty string
 *      AND not the sentinel 'ไม่เกี่ยวข้อง/ไม่ได้ตั้งครรภ์'
 *   2. 'ยาที่ใช้ประจำ: <trimmed value>' — only when currentMedication trims
 *      to non-empty
 *
 * Returns '' when both inputs are empty / sentinel.
 */
export function derivePatientTreatmentHistory(patientData) {
  if (!_isPlainObject(patientData)) return '';

  const parts = [];

  const preg = typeof patientData.pregnancy === 'string' ? patientData.pregnancy.trim() : '';
  if (preg && preg !== PREGNANCY_SENTINEL) {
    parts.push(`${PREGNANCY_LABEL_PREFIX}${preg}`);
  }

  const med = typeof patientData.currentMedication === 'string'
    ? patientData.currentMedication.trim()
    : '';
  if (med) {
    parts.push(`${MEDICATION_LABEL_PREFIX}${med}`);
  }

  return parts.join(' / ');
}
```

- [ ] **Step 2: Run the helper tests — expect all green**

Run: `npx vitest run tests/phase-26-2g-fillin-patient-health-mapping.test.js`
Expected: ALL ~17 assertions PASS.

- [ ] **Step 3: Commit helper + unit tests**

```bash
git add src/lib/patientHealthMapping.js tests/phase-26-2g-fillin-patient-health-mapping.test.js
git commit -m "feat(Phase 26.2g-fillin Task 3): patientHealthMapping helpers + unit tests

derivePatientCongenitalDisease + derivePatientTreatmentHistory pure helpers.
Frozen UD_LABELS map. Locked PREGNANCY_LABEL_PREFIX + MEDICATION_LABEL_PREFIX
constants. ~17 unit assertions covering empty inputs, sentinel handling,
ud_* combinations, ud_other detail trimming, UI-order insertion.

Closes the V12 multi-reader-sweep gap for TFP health-info auto-fill —
TFP wiring lands in Task 4.

Class-of-bug: V12 multi-reader-sweep at TFP create-mode auto-fill boundary.
Same family as V52 (BS-11 report tabs) / V36 (multi-call-site). AV40
invariant lands in Task 5."
```

---

### Task 4: Wire helpers into TreatmentFormPage

**Files:**
- Modify: `src/components/TreatmentFormPage.jsx` (add 1 import + extend the create-mode auto-fill block at lines 1016-1020)

- [ ] **Step 1: Read the TFP import block to find the right insertion point**

Open `src/components/TreatmentFormPage.jsx`. Find the existing `import { ... } from '../lib/...'` cluster near the top. Add the new import alongside the other `src/lib` imports (the exact existing siblings depend on prior edits — match the style).

- [ ] **Step 2: Add the import**

Insert (matching surrounding style — keep alphabetical or thematic grouping per existing file convention):

```js
import {
  derivePatientCongenitalDisease,
  derivePatientTreatmentHistory,
} from '../lib/patientHealthMapping.js';
```

- [ ] **Step 3: Extend the create-mode auto-fill block**

Replace the existing block at lines 1016-1020:

```js
          // Pre-fill from patient data
          if (patientData) {
            if (patientData.bloodType && !isEdit) setBloodType(patientData.bloodType);
            if (patientData.allergiesDetail && !isEdit) setDrugAllergy(patientData.allergiesDetail);
          }
```

with:

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

- [ ] **Step 4: Verify the build is clean**

Run: `npm run build`
Expected: clean (no MISSING_EXPORT / syntax errors). If `npm run build` fails, the most likely cause is an import-path typo — re-check the import line.

- [ ] **Step 5: Targeted vitest run for TFP-area tests already in the bank**

Run: `npx vitest run tests/phase-26-2f-mirror-source-grep.test.js tests/phase-26-2f-pre-vitals-save-source-grep.test.js`
Expected: GREEN (existing TFP source-grep banks unaffected by the import addition).

- [ ] **Step 6: Commit the wiring**

```bash
git add src/components/TreatmentFormPage.jsx
git commit -m "feat(Phase 26.2g-fillin Task 4): wire patientHealthMapping into TFP create-mode auto-fill

Extends the existing if (patientData) { !isEdit } block at lines 1016-1020.
Adds derivePatientCongenitalDisease + derivePatientTreatmentHistory calls
gated by non-empty result, mirroring the bloodType + drugAllergy pattern.

Edit-mode untouched (lines 927-932 still restore from t.healthInfo).
Vitals-save mode untouched (saveMode='vitals' bypasses this block entirely
since the load path runs at mount, not at save).

Closes the user-reported gap: 'TFP create แล้วโรคประจำตัว + ประวัติยา
ไม่ขึ้นทั้งที่ลูกค้ากรอกใน PatientForm'."
```

---

### Task 5: Source-grep regression locks (G1-G2)

**Files:**
- Test: `tests/phase-26-2g-fillin-source-grep.test.js`

- [ ] **Step 1: Write the source-grep test file**

```js
// tests/phase-26-2g-fillin-source-grep.test.js
// Phase 26.2g-fillin — source-grep regression locks.
// G1: TFP wires the two helpers correctly inside the create-mode auto-fill block.
// G2: AV40 universal classifier — no other component reads patientData.ud_* directly.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const TFP_PATH = 'src/components/TreatmentFormPage.jsx';
const tfp = readFileSync(TFP_PATH, 'utf8');

describe('G1 — TFP wiring', () => {
  it('G1.1 — TFP imports both helpers from patientHealthMapping.js', () => {
    expect(tfp).toMatch(/import\s*\{[^}]*derivePatientCongenitalDisease[^}]*\}\s*from\s*['"][^'"]*patientHealthMapping(?:\.js)?['"]/);
    expect(tfp).toMatch(/import\s*\{[^}]*derivePatientTreatmentHistory[^}]*\}\s*from\s*['"][^'"]*patientHealthMapping(?:\.js)?['"]/);
  });

  it('G1.2 — Both helpers called inside the create-mode auto-fill block', () => {
    // The block: `if (patientData) { ... setBloodType ... setDrugAllergy ... derive... }`
    // Look for both derive calls within ~1500 chars of the bloodType setter (same block).
    const bloodTypeIdx = tfp.indexOf('setBloodType(patientData.bloodType)');
    expect(bloodTypeIdx).toBeGreaterThan(0);
    const window = tfp.slice(bloodTypeIdx, bloodTypeIdx + 1500);
    expect(window).toContain('derivePatientCongenitalDisease(patientData)');
    expect(window).toContain('derivePatientTreatmentHistory(patientData)');
    expect(window).toContain('setCongenitalDisease(');
    expect(window).toContain('setTreatmentHistory(');
  });

  it('G1.3 — Both call-sites gated by !isEdit (no edit-mode auto-fill)', () => {
    // The new derive calls live inside `if (!isEdit) { ... }` — verify by
    // grepping for that exact gate within the bloodType→derive window.
    const bloodTypeIdx = tfp.indexOf('setBloodType(patientData.bloodType)');
    const window = tfp.slice(bloodTypeIdx, bloodTypeIdx + 1500);
    // The inner gate must appear before the derive calls
    const innerGateIdx = window.indexOf('if (!isEdit)');
    const congenitalCallIdx = window.indexOf('derivePatientCongenitalDisease');
    const historyCallIdx = window.indexOf('derivePatientTreatmentHistory');
    expect(innerGateIdx).toBeGreaterThan(-1);
    expect(congenitalCallIdx).toBeGreaterThan(innerGateIdx);
    expect(historyCallIdx).toBeGreaterThan(innerGateIdx);
  });
});

describe('G2 — AV40 universal classifier (no direct patientData.ud_* reads outside sanctioned)', () => {
  // Walk src/components/** and src/pages/** for any file that reads
  // patientData.ud_* / patientData.hasUnderlying / patientData.currentMedication
  // / patientData.pregnancy.
  // Sanctioned exceptions: src/pages/PatientForm.jsx (writer); src/pages/AdminDashboard.jsx
  // (pregnancy display chip per spec § 8).

  const SANCTIONED = new Set([
    'src/pages/PatientForm.jsx',          // writer (kiosk + admin manual)
    'src/pages/AdminDashboard.jsx',       // display chips lines ~4504-4533
    // src/utils.js sanctioned separately below (lives outside walkFiles(src/components|src/pages))
  ]);
  const PATTERN = /patientData\.(?:ud_|hasUnderlying|currentMedication|pregnancy)/;

  function* walkFiles(dir) {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name).replace(/\\/g, '/');
      const st = statSync(path);
      if (st.isDirectory()) yield* walkFiles(path);
      else if (st.isFile() && /\.(jsx?|tsx?)$/.test(name)) yield path;
    }
  }

  it('G2.1 — only sanctioned files read patientData.ud_* / hasUnderlying / currentMedication / pregnancy', () => {
    const offenders = [];
    for (const path of walkFiles('src/components')) {
      const content = readFileSync(path, 'utf8');
      if (PATTERN.test(content)) offenders.push(path);
    }
    for (const path of walkFiles('src/pages')) {
      const content = readFileSync(path, 'utf8');
      if (PATTERN.test(content) && !SANCTIONED.has(path)) offenders.push(path);
    }
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the source-grep tests**

Run: `npx vitest run tests/phase-26-2g-fillin-source-grep.test.js`
Expected: All 4 tests PASS (G1.1, G1.2, G1.3, G2.1). If G2.1 fails, the offender list is in the assertion message — investigate; if it's a legit new pattern, add to SANCTIONED with rationale and re-run. If it's an unintentional new reader, that's the class expanding — STOP and rescope per Rule P Step 4.

- [ ] **Step 3: Commit source-grep locks**

```bash
git add tests/phase-26-2g-fillin-source-grep.test.js
git commit -m "test(Phase 26.2g-fillin Task 5): G1+G2 source-grep regression locks

G1 (TFP wiring): imports + call-sites inside the create-mode block + !isEdit gate.
G2 (AV40 universal classifier): only PatientForm.jsx (writer) + AdminDashboard.jsx
(pregnancy chip) may read patientData.ud_* / hasUnderlying / currentMedication /
pregnancy directly. All other components/pages MUST use derivePatient* helpers.

Drift-catcher: any future component that adds a direct read fails build."
```

---

### Task 6: Rule I flow-simulate (F1.1-F1.3)

**Files:**
- Test: `tests/phase-26-2g-fillin-flow-simulate.test.js`

- [ ] **Step 1: Write the flow-simulate test file**

```js
// tests/phase-26-2g-fillin-flow-simulate.test.js
// Phase 26.2g-fillin — Rule I full-flow simulate.
// Chains: patientData (from customer doc) → TFP load (create-mode) →
// derivePatient* helpers → setter calls. Verifies the END-TO-END behavior
// per Rule I "tests must chain the whole user flow, not just one function".

import { describe, it, expect, vi } from 'vitest';
import {
  derivePatientCongenitalDisease,
  derivePatientTreatmentHistory,
} from '../src/lib/patientHealthMapping.js';

// Pure simulate mirror of the TFP create-mode auto-fill block (TFP:1016-1024).
// Returns the setter call-log so we can assert what would fire in the real TFP.
function simulateTfpCreateModeAutoFill({ patientData, isEdit }) {
  const calls = [];
  const setBloodType = v => calls.push(['setBloodType', v]);
  const setDrugAllergy = v => calls.push(['setDrugAllergy', v]);
  const setCongenitalDisease = v => calls.push(['setCongenitalDisease', v]);
  const setTreatmentHistory = v => calls.push(['setTreatmentHistory', v]);

  // Mirror TFP:1017-1023 exactly
  if (patientData) {
    if (patientData.bloodType && !isEdit) setBloodType(patientData.bloodType);
    if (patientData.allergiesDetail && !isEdit) setDrugAllergy(patientData.allergiesDetail);
    if (!isEdit) {
      const derivedCongenital = derivePatientCongenitalDisease(patientData);
      if (derivedCongenital) setCongenitalDisease(derivedCongenital);
      const derivedHistory = derivePatientTreatmentHistory(patientData);
      if (derivedHistory) setTreatmentHistory(derivedHistory);
    }
  }
  return calls;
}

describe('F1 — TFP create-mode auto-fill end-to-end', () => {
  it('F1.1 — patient with chronic + medication + pregnancy → both setters fire with derived strings', () => {
    const patientData = {
      bloodType: 'O+',
      allergiesDetail: 'แพ้ Penicillin',
      hasUnderlying: 'มี',
      ud_diabetes: true,
      ud_hypertension: true,
      ud_other: true,
      ud_otherDetail: 'ไมเกรน',
      currentMedication: 'Asprin 1 เม็ด เช้า',
      pregnancy: 'กำลังตั้งครรภ์',
    };
    const calls = simulateTfpCreateModeAutoFill({ patientData, isEdit: false });

    // Bloodtype + drug allergy still work (V21 anti-regression — pre-existing behavior preserved)
    expect(calls).toContainEqual(['setBloodType', 'O+']);
    expect(calls).toContainEqual(['setDrugAllergy', 'แพ้ Penicillin']);

    // NEW Phase 26.2g-fillin behavior
    expect(calls).toContainEqual(['setCongenitalDisease', 'ความดันโลหิตสูง, เบาหวาน, ไมเกรน']);
    expect(calls).toContainEqual(['setTreatmentHistory', 'การตั้งครรภ์: กำลังตั้งครรภ์ / ยาที่ใช้ประจำ: Asprin 1 เม็ด เช้า']);
  });

  it('F1.2 — patient with hasUnderlying="ไม่มี" + sentinel pregnancy + no med → neither new setter fires', () => {
    const patientData = {
      bloodType: 'A+',
      hasUnderlying: 'ไม่มี',
      ud_diabetes: true, // self-contradiction — should be ignored
      pregnancy: 'ไม่เกี่ยวข้อง/ไม่ได้ตั้งครรภ์',
      currentMedication: '',
    };
    const calls = simulateTfpCreateModeAutoFill({ patientData, isEdit: false });

    expect(calls).toContainEqual(['setBloodType', 'A+']);
    // No setCongenitalDisease — empty result → gated out
    expect(calls.find(c => c[0] === 'setCongenitalDisease')).toBeUndefined();
    expect(calls.find(c => c[0] === 'setTreatmentHistory')).toBeUndefined();
  });

  it('F1.3 — edit mode (isEdit=true) → NO auto-fill fires regardless of patientData', () => {
    const patientData = {
      bloodType: 'B+',
      allergiesDetail: 'แพ้',
      hasUnderlying: 'มี',
      ud_diabetes: true,
      pregnancy: 'กำลังตั้งครรภ์',
      currentMedication: 'Asprin',
    };
    const calls = simulateTfpCreateModeAutoFill({ patientData, isEdit: true });

    // Gate respected — nothing fires in edit mode
    expect(calls).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the flow-simulate tests**

Run: `npx vitest run tests/phase-26-2g-fillin-flow-simulate.test.js`
Expected: All 3 F1.x tests PASS.

- [ ] **Step 3: Commit flow-simulate**

```bash
git add tests/phase-26-2g-fillin-flow-simulate.test.js
git commit -m "test(Phase 26.2g-fillin Task 6): Rule I flow-simulate chain

simulateTfpCreateModeAutoFill mirrors TFP:1017-1023 exactly. F1.1 verifies
end-to-end: chronic + medication + pregnancy → both new setters fire AND
pre-existing bloodType + drugAllergy setters still fire (V21 anti-regression).
F1.2 verifies hasUnderlying='ไม่มี' + sentinel pregnancy + empty med →
neither new setter fires (gates respected). F1.3 verifies edit-mode bypass."
```

---

### Task 7: AV40 audit invariant + audit skill update

**Files:**
- Modify: `.agents/skills/audit-anti-vibe-code/SKILL.md`

- [ ] **Step 1: Locate the AV invariant table in the skill file**

Open `.agents/skills/audit-anti-vibe-code/SKILL.md`. Find the latest AV-numbered entry (should be AV39 from Phase 26.2f). Append a new AV40 block.

- [ ] **Step 2: Append the AV40 block**

After the AV39 entry, add:

```markdown
### AV40 — `patientData.ud_*` reads centralized via `patientHealthMapping.js` (Phase 26.2g-fillin, 2026-05-13)

**Class-of-bug**: V12 multi-reader-sweep at TFP create-mode auto-fill boundary. Pre-V40, lines 1018-1019 set `bloodType` + `drugAllergy` from `patientData.*` while `congenitalDisease` + `treatmentHistory` were silently dropped. User reported (verbatim): "TFP create แล้วโรคประจำตัว + ประวัติยา ไม่ขึ้นทั้งที่ลูกค้ากรอกใน PatientForm".

**Invariant**: Direct reads of the following `patientData` keys are forbidden in `src/components/**` AND `src/pages/**`:
- `patientData.ud_diabetes` / `patientData.ud_hypertension` / `patientData.ud_lung` / `patientData.ud_kidney` / `patientData.ud_heart` / `patientData.ud_blood` / `patientData.ud_other` / `patientData.ud_otherDetail`
- `patientData.hasUnderlying`
- `patientData.currentMedication`
- `patientData.pregnancy`

Consumers MUST use `derivePatientCongenitalDisease` / `derivePatientTreatmentHistory` from `src/lib/patientHealthMapping.js`.

**Sanctioned exceptions** (closed list — adding a 4th file inside src/components|src/pages fails the lock test):
- `src/pages/PatientForm.jsx` — writer of these fields (kiosk + admin manual entry)
- `src/pages/AdminDashboard.jsx` — patient detail panel display chips at lines ~4504-4533 (`d.ud_*` JSX literals + `d.pregnancy` chip-color logic; pure display, not transform)
- `src/utils.js` — Thai + English PMH builders at lines ~345-356 + ~415-426 (OPD print builder; pre-existing inline derivation; different output shape with "ปฏิเสธ"/"No known" fallback). **Tech-debt**: future Rule-of-3 refactor to consume `derivePatientCongenitalDisease` is welcome but out of scope for Phase 26.2g-fillin. This file is outside the G2.1 grep walk (only `src/components` + `src/pages`) so no test change needed — but AV40 reviewers must NOT add new direct `ud_*` reads in utils.js either; refactor toward the helper instead.

**Grep anchor**: `patientData\.(ud_|hasUnderlying|currentMedication|pregnancy)` in non-sanctioned files.

**Regression lock**: `tests/phase-26-2g-fillin-source-grep.test.js` G2.1 walks `src/components` + `src/pages` and asserts the offender list is empty (modulo sanctioned set).

**Why**: prevents the V12 multi-reader-sweep that surfaced Phase 26.2g-fillin (TFP create-mode field-completion gap). Future patient-health derivations land in the lib + tests there; consumers stay declarative.
```

- [ ] **Step 3: Commit the audit invariant**

```bash
git add .agents/skills/audit-anti-vibe-code/SKILL.md
git commit -m "feat(audit AV40): patientData.ud_* reads must go through patientHealthMapping

NEW invariant locking the V12 multi-reader-sweep gap closed by Phase 26.2g-fillin.
Sanctioned exceptions: PatientForm.jsx (writer) + AdminDashboard.jsx (pregnancy chip).
Regression test: tests/phase-26-2g-fillin-source-grep.test.js G2.1."
```

---

### Task 8: Targeted run + full vitest + build (Rule N pre-commit)

**Files:** none modified (verification only)

- [ ] **Step 1: Targeted run of all Phase 26.2g-fillin tests + the existing AV-related tests**

Run:
```bash
npx vitest run tests/phase-26-2g-fillin-patient-health-mapping.test.js tests/phase-26-2g-fillin-source-grep.test.js tests/phase-26-2g-fillin-flow-simulate.test.js
```

Expected: ~24 assertions GREEN (17 unit + 4 source-grep + 3 flow-simulate).

- [ ] **Step 2: Find tests that import TreatmentFormPage.jsx (Rule N "small-fix touches shared file" check)**

Run:
```bash
grep -rln "TreatmentFormPage" tests/ | head -20
```

For each match, run it targeted to verify the TFP import additions didn't break it:
```bash
npx vitest run <matched files joined with spaces>
```

Expected: all GREEN. If any test broke, investigate — most likely a regex-window source-grep that needs a tiny adjustment for the new import/comment lines (per V21 fixup pattern from prior phases).

- [ ] **Step 3: Build verification**

Run: `npm run build`
Expected: clean (no MISSING_EXPORT, no syntax errors).

- [ ] **Step 4: Full suite (Rule N — small fix in shared lib + new component imports → full suite at batch end)**

Run: `npm test -- --run`
Expected: 8447+24 ≈ 8471 PASS + 1 skipped + 0 fail (modulo the 1 known intermittent flake in `phase-17-1-cross-branch-import-rtl.test.jsx` under full-suite load — re-run if it flakes alone).

If full suite reveals a regression in an unrelated test, STOP — apply systematic-debugging skill before continuing.

- [ ] **Step 5: No commit at this task — verification only**

---

### Task 9: Documentation + state update (session-end)

**Files:**
- Modify: `.claude/rules/00-session-start.md` § 2 (V-summary table)
- Modify: `.agents/active.md` (status)
- Modify: `SESSION_HANDOFF.md` (Resume Prompt + Recent Commits section)
- Create: `.agents/sessions/2026-05-13-phase-26-2g-fillin.md` (checkpoint)

- [ ] **Step 1: Append one-liner V-entry to `.claude/rules/00-session-start.md` § 2 table**

Locate the V-entries table in `.claude/rules/00-session-start.md` section "2. PAST VIOLATIONS". Add a row at the END:

```markdown
| Phase 26.2g-fillin | 2026-05-13 | **patientData → TFP create-mode auto-fill V12 sweep close** — User reported TFP create blank for `congenitalDisease` + `treatmentHistory` despite patient profile having `hasUnderlying:'มี'` + `ud_*` + `currentMedication` + `pregnancy`. Root: TFP:1016-1020 auto-fill block handled bloodType + drugAllergy but stopped — V12 multi-reader-sweep at the create-mode boundary. Fix: NEW `src/lib/patientHealthMapping.js` — `derivePatientCongenitalDisease` (ud_* + ud_otherDetail with hasUnderlying gate + UI-order insertion) + `derivePatientTreatmentHistory` (pregnancy with sentinel-skip + currentMedication trim + " / " join + locked PREGNANCY_LABEL_PREFIX/MEDICATION_LABEL_PREFIX constants + frozen UD_LABELS map). TFP wired at the same `!isEdit` gate. **AV40 invariant** locks `patientData.ud_* / hasUnderlying / currentMedication / pregnancy` reads to the helper module (sanctioned exceptions: PatientForm.jsx writer + AdminDashboard.jsx pregnancy chip). Tests: ~24 assertions across 3 files (helper unit L1-L3 + source-grep G1-G2 + Rule I flow-simulate F1.1-F1.3). Cumulative: 8447 → 8471 + 1 skipped. Build clean. **Lessons**: (a) V12 multi-reader-sweep applies at SINGLE-BLOCK boundary too — when a block sets N derived fields and N-2 land, the missing 2 are the silent bug; (b) sentinel-value handling for radio-default fields (pregnancy `'ไม่เกี่ยวข้อง/ไม่ได้ตั้งครรภ์'`) deserves an explicit constant to prevent literal-string drift; (c) locked label-prefix constants give admin a visible auto-fill origin in the textarea ("การตั้งครรภ์:" / "ยาที่ใช้ประจำ:") AND make tests deterministic. NO deploy — joins the 50-commits-ahead queue. |
```

- [ ] **Step 2: Update `.agents/active.md`**

Replace the entire file with:

```markdown
---
updated_at: "2026-05-13 — Phase 26.2g-fillin SHIPPED (patientHealthMapping + TFP wire + AV40)"
status: "master=<NEW SHA> · prod=ccef3c2 · 51+ commits ahead · 8471 passed · build clean"
branch: "master"
last_commit: "<NEW SHA> docs(Phase 26.2g-fillin): session-end state update + V-entry"
tests: 8471
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "ccef3c2"
firestore_rules_version: 29
storage_rules_version: 2
---

# Active Context

## State
- master = `<NEW SHA>` · prod = `ccef3c2` (51+ commits ahead — Phase 26.0+26.1+26.2+26.2f+26.2g-fillin all NOT deployed)
- 8471 tests + 1 skipped + 0 fail. Build clean.
- Phase 26.2g-fillin shipped 8 tasks (pre-flight grep + helper TDD + TFP wire + source-grep + flow-simulate + AV40 + Rule N verify + state update).

## What this session shipped
- NEW `src/lib/patientHealthMapping.js` (2 pure helpers + frozen UD_LABELS + 2 label-prefix constants).
- TFP create-mode auto-fill extended at lines 1016-1024 (gated by `!isEdit`, mirrors existing bloodType/drugAllergy pattern).
- 3 NEW test files (~24 assertions): helper unit L1-L3 + source-grep G1-G2 + Rule I flow-simulate F1.1-F1.3.
- AV40 audit invariant added (sanctioned exceptions: PatientForm.jsx writer + AdminDashboard.jsx pregnancy chip).
- Detail: `.agents/sessions/2026-05-13-phase-26-2g-fillin.md`

## Next action
Choose ONE in next chat:
1. **Deploy combined 51+ commits** — `vercel --prod` + `firebase deploy --only firestore:rules` per V15.
2. **New phase / feature** — user specifies priority.
3. **Probe-Deploy-Probe maintenance** — investigate probes 2/3/4 false-positive or Phase 17.1 flake.

## Outstanding user-triggered actions
- **Deploy auth**: 51+ commits ahead. Combined deploy per V15.
- (Optional) probe-deploy-probe.mjs probes 2/3/4 false-positive; Phase 17.1 cross-branch-import-rtl flake.

## Carried institutional memory
- saveMode='vitals' = 5th locked-X family member (Phase 26.2f).
- Panel + Mirror co-exist for TimelineModal vs TFP split-screen (Phase 26.2f).
- `extractDisplayString` = canonical fix for [object Object] rendering (Phase 26.2).
- `toDateSafely` = canonical fix for Firestore Timestamp → React child crash (Phase 26.2f3).
- **`derivePatientCongenitalDisease` + `derivePatientTreatmentHistory` = canonical helpers for patientData health-info → TFP-state derivation (Phase 26.2g-fillin)**.
- 3-stage save workflow: vitals → doctor → null/complete (Phase 26.2f).
- **AV40 = sanctioned-exception closed list pattern for patientData direct reads (Phase 26.2g-fillin)**.
```

(Substitute `<NEW SHA>` with the actual commit SHA after final state-update commit.)

- [ ] **Step 3: Append a new section to `SESSION_HANDOFF.md`**

Use the Edit tool to append below the latest existing section (do NOT rewrite the file). Add a "Phase 26.2g-fillin SHIPPED 2026-05-13" block with:
- Summary (3-4 lines)
- Files touched
- Test deltas
- Resume Prompt verbatim block for next chat

- [ ] **Step 4: Create checkpoint file**

```bash
# Use the Write tool — path:
.agents/sessions/2026-05-13-phase-26-2g-fillin.md
```

Content template (mirror `.agents/sessions/2026-05-13-phase-26-2f-mirror.md` structure):
- Summary (1 paragraph)
- Current State (master SHA + test count)
- Commits this session (verbatim git log subset)
- Files Touched
- Decisions (one-liner each)
- Next Todo (3 options)
- Resume Prompt

- [ ] **Step 5: Commit the docs**

```bash
git add .claude/rules/00-session-start.md .agents/active.md SESSION_HANDOFF.md .agents/sessions/2026-05-13-phase-26-2g-fillin.md
git commit -m "docs(Phase 26.2g-fillin Task 9): session-end state + V-entry + checkpoint

V-entry appended to 00-session-start.md § 2 (V12 multi-reader-sweep family,
AV40 invariant, locked label-prefix constants).
active.md flipped to Phase 26.2g-fillin SHIPPED state.
SESSION_HANDOFF.md appended with Resume Prompt for next chat.
Checkpoint at .agents/sessions/2026-05-13-phase-26-2g-fillin.md.

50-commits-ahead queue grows to 51+. NO deploy this turn (V18)."
```

- [ ] **Step 6: Push (Rule "every commit must push immediately")**

```bash
git push origin master
```

---

## Self-review checklist (run BEFORE handing back to user)

- [ ] **Spec coverage** — every section in `docs/superpowers/specs/2026-05-13-phase-26-2g-fillin-patient-health-mapping-design.md` is implemented by a task.
- [ ] **Placeholder scan** — no "TBD" / "handle edge cases" / "similar to Task N" — every step has real content.
- [ ] **Type consistency** — `derivePatientCongenitalDisease` / `derivePatientTreatmentHistory` / `PREGNANCY_LABEL_PREFIX` / `MEDICATION_LABEL_PREFIX` / `UD_LABELS` spelled identically across all tasks.
- [ ] **TFP line numbers** — Task 4 references lines 1016-1020 (verify after edit they're still in that neighborhood; comment markers help future audits).
- [ ] **Test file naming** — `phase-26-2g-fillin-*` mirrors existing phase convention (`phase-26-2f-*`).
- [ ] **Commit messages** — every commit has Phase tag + Task # + 1-line summary + Rule P class context where relevant.

---

## Out of scope (defer to follow-up if needed)

- Other auto-fill expansions (ADAM scores, isPerfMode flags, hasAllergies radio → drugAllergy textarea heuristic when allergiesDetail empty)
- patientData ↔ backend transform changes
- TFP edit-mode behavior changes
- TreatmentReadOnlyMirror (Phase 26.2f) — read-only, doesn't auto-fill
- Vitals-save mode behavior — health-info textareas not in scope at vitals stage

---

**Plan complete and saved.** Phase 26.2g-fillin awaits execution choice:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task (Tasks 1-9), review between tasks. Faster iteration; each subagent gets ~50 lines of task content with everything it needs.
2. **Inline Execution** — execute tasks 1-9 in this session via `executing-plans`; batch with checkpoints for review.

Which approach?
