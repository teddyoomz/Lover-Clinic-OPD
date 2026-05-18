# Phase 26.2g-fillin-followup — `src/utils.js` Rule-of-3 refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the 2 inline `if (d.ud_X) pmh.push(...)` chronic-disease derivations in `src/utils.js` (Thai OPD print builder lines 345-354 + English OPD print builder lines 415-424) by extracting an English mirror helper `derivePatientCongenitalDiseaseEnglish` into `src/lib/patientHealthMapping.js` and refactoring both call sites to consume the existing Thai helper + the new English helper. Output BYTE-IDENTICAL for OPD print recipients.

**Architecture:** Approach A (mirror helper + caller-side wrapping). Extend the shared lib with a NEW frozen `UD_LABELS_EN` constant (formal clinical English labels preserved verbatim from current utils.js) + NEW pure helper `derivePatientCongenitalDiseaseEnglish` that mirrors `derivePatientCongenitalDisease`. Refactor utils.js Thai + English builders to call helpers; wrap with the existing OPD-print prefix + fallback at the call site (2 lines per builder, replacing 10 inline lines each). AV40 sanctioned-exception list shrinks from 3 → 2 entries (`src/utils.js` removed). Spec at `docs/superpowers/specs/2026-05-13-phase-26-2g-fillin-followup-utils-rule-of-3-design.md`.

**Tech Stack:** Pure ESM JavaScript (no React, no Firebase, no async). Vitest 4.1 for unit + source-grep tests. Vite 8 build chain. Existing Phase 26.2g-fillin lib + tests untouched.

---

## File Structure

| Type | Path | Responsibility |
|---|---|---|
| MODIFIED | `src/lib/patientHealthMapping.js` | +UD_LABELS_EN frozen map +derivePatientCongenitalDiseaseEnglish helper (~35 LOC added after existing exports) |
| MODIFIED | `src/utils.js` | +1 import block at top, -10 lines Thai builder, -10 lines English builder, +4 lines (2 call sites × 2 lines each); net -16 LOC |
| NEW | `tests/phase-26-2g-fillin-followup-english-helper.test.js` | L1.1-EN through L1.12-EN (~12 assertions) |
| NEW | `tests/phase-26-2g-fillin-followup-source-grep.test.js` | G3.1-G3.4 (~4 source-grep assertions) |
| MODIFIED | `.agents/skills/audit-anti-vibe-code/SKILL.md` | AV40 sanctioned-list shrink (3 → 2) + Example resolved entry |
| MODIFIED | `.claude/rules/00-session-start.md` § 2 | Phase 26.2g-fillin-followup V-entry one-liner |
| MODIFIED | `SESSION_HANDOFF.md` + `.agents/active.md` | State update at session-end |
| NEW | `.agents/sessions/2026-05-13-phase-26-2g-fillin-followup.md` | Checkpoint file (≤150 lines) |

Net source diff: +30 LOC (helpers) - 20 LOC (utils.js inline) + 4 LOC (utils.js call sites) ≈ +14 LOC source. ~120 LOC tests.

---

### Task 1: TDD English helper (red → green) + commit

**Files:**
- Test: `tests/phase-26-2g-fillin-followup-english-helper.test.js` (NEW)
- Source: `src/lib/patientHealthMapping.js` (MODIFY — append after line 67)

- [ ] **Step 1: Write the failing test file**

Write `tests/phase-26-2g-fillin-followup-english-helper.test.js` with this EXACT content:

```js
// tests/phase-26-2g-fillin-followup-english-helper.test.js
// Phase 26.2g-fillin-followup — derivePatientCongenitalDiseaseEnglish contract.
// Mirrors the Thai L1.1-L1.10 unit suite + adds L1.11-EN formal-clinical
// label verification + L1.12-EN byte-identical output contract.
// EN labels are intentionally MORE FORMAL than PatientForm UI labels
// (Diabetes Mellitus / Chronic Kidney Disease / Hematological Disease)
// because OPD print is clinical documentation, not lay-friendly UI.

import { describe, it, expect } from 'vitest';
import {
  derivePatientCongenitalDiseaseEnglish,
  UD_LABELS_EN,
} from '../src/lib/patientHealthMapping.js';

describe('L1-EN — derivePatientCongenitalDiseaseEnglish', () => {
  it('L1.1-EN — returns empty for null / undefined / non-object / empty object', () => {
    expect(derivePatientCongenitalDiseaseEnglish(null)).toBe('');
    expect(derivePatientCongenitalDiseaseEnglish(undefined)).toBe('');
    expect(derivePatientCongenitalDiseaseEnglish('string')).toBe('');
    expect(derivePatientCongenitalDiseaseEnglish(42)).toBe('');
    expect(derivePatientCongenitalDiseaseEnglish({})).toBe('');
  });

  it('L1.2-EN — hasUnderlying="ไม่มี" wins over any ud_* flags (self-contradiction guard)', () => {
    // Gate key value is Thai ('มี' / 'ไม่มี') because patientData shape is
    // language-agnostic — only output labels differ.
    const pd = { hasUnderlying: 'ไม่มี', ud_diabetes: true, ud_hypertension: true };
    expect(derivePatientCongenitalDiseaseEnglish(pd)).toBe('');
  });

  it('L1.3-EN — single flag returns the corresponding English label', () => {
    expect(derivePatientCongenitalDiseaseEnglish({ hasUnderlying: 'มี', ud_diabetes: true }))
      .toBe('Diabetes Mellitus');
  });

  it('L1.4-EN — two flags comma-join in UI order (hypertension before diabetes)', () => {
    const pd = { hasUnderlying: 'มี', ud_diabetes: true, ud_hypertension: true };
    expect(derivePatientCongenitalDiseaseEnglish(pd)).toBe('Hypertension, Diabetes Mellitus');
  });

  it('L1.5-EN — all 6 standard flags emit all 6 English labels in UI order', () => {
    const pd = {
      hasUnderlying: 'มี',
      ud_hypertension: true,
      ud_diabetes: true,
      ud_lung: true,
      ud_kidney: true,
      ud_heart: true,
      ud_blood: true,
    };
    expect(derivePatientCongenitalDiseaseEnglish(pd)).toBe(
      'Hypertension, Diabetes Mellitus, Lung Disease, Chronic Kidney Disease, Heart Disease, Hematological Disease'
    );
  });

  it('L1.6-EN — ud_other + ud_otherDetail returns the detail string', () => {
    const pd = { hasUnderlying: 'มี', ud_other: true, ud_otherDetail: 'Migraine' };
    expect(derivePatientCongenitalDiseaseEnglish(pd)).toBe('Migraine');
  });

  it('L1.7-EN — ud_other without ud_otherDetail (or whitespace) is silently omitted', () => {
    expect(derivePatientCongenitalDiseaseEnglish({ hasUnderlying: 'มี', ud_other: true })).toBe('');
    expect(derivePatientCongenitalDiseaseEnglish({ hasUnderlying: 'มี', ud_other: true, ud_otherDetail: '' })).toBe('');
    expect(derivePatientCongenitalDiseaseEnglish({ hasUnderlying: 'มี', ud_other: true, ud_otherDetail: '   ' })).toBe('');
  });

  it('L1.8-EN — standard flags emit BEFORE ud_other detail (insertion order locked)', () => {
    const pd = { hasUnderlying: 'มี', ud_diabetes: true, ud_other: true, ud_otherDetail: 'Migraine' };
    expect(derivePatientCongenitalDiseaseEnglish(pd)).toBe('Diabetes Mellitus, Migraine');
  });

  it('L1.9-EN — UD_LABELS_EN map is frozen + Diabetes Mellitus value lock', () => {
    expect(Object.isFrozen(UD_LABELS_EN)).toBe(true);
    expect(UD_LABELS_EN.ud_diabetes).toBe('Diabetes Mellitus');
  });

  it('L1.10-EN — non-string ud_otherDetail is silently omitted (typeof-guard lock)', () => {
    // Lock the `typeof patientData.ud_otherDetail === 'string'` defensive guard.
    expect(derivePatientCongenitalDiseaseEnglish({ hasUnderlying: 'มี', ud_other: true, ud_otherDetail: 99 }))
      .toBe('');
    expect(derivePatientCongenitalDiseaseEnglish({ hasUnderlying: 'มี', ud_other: true, ud_otherDetail: null }))
      .toBe('');
    expect(derivePatientCongenitalDiseaseEnglish({ hasUnderlying: 'มี', ud_other: true, ud_otherDetail: [] }))
      .toBe('');
  });

  it('L1.11-EN — formal-clinical label verbatim string lock (all 6 labels)', () => {
    expect(UD_LABELS_EN).toEqual({
      ud_hypertension: 'Hypertension',
      ud_diabetes: 'Diabetes Mellitus',
      ud_lung: 'Lung Disease',
      ud_kidney: 'Chronic Kidney Disease',
      ud_heart: 'Heart Disease',
      ud_blood: 'Hematological Disease',
    });
  });

  it('L1.12-EN — byte-identical OPD print output contract (all 6 flags + ud_other detail)', () => {
    const pd = {
      hasUnderlying: 'มี',
      ud_hypertension: true,
      ud_diabetes: true,
      ud_lung: true,
      ud_kidney: true,
      ud_heart: true,
      ud_blood: true,
      ud_other: true,
      ud_otherDetail: 'Migraine',
    };
    expect(derivePatientCongenitalDiseaseEnglish(pd))
      .toBe('Hypertension, Diabetes Mellitus, Lung Disease, Chronic Kidney Disease, Heart Disease, Hematological Disease, Migraine');
  });
});
```

- [ ] **Step 2: Run the test (verify RED)**

Run: `cd F:/LoverClinic-app && npx vitest run tests/phase-26-2g-fillin-followup-english-helper.test.js 2>&1 | tail -15`
Expected: ALL ~12 assertions FAIL with "no such export: derivePatientCongenitalDiseaseEnglish" or "UD_LABELS_EN is undefined" — the symbols don't exist yet.

If the test fails for a DIFFERENT reason (syntax error, wrong path), stop and fix the test before Step 3.

- [ ] **Step 3: Extend `src/lib/patientHealthMapping.js` with the new exports**

In `src/lib/patientHealthMapping.js`, find the existing `UD_LABELS` Object.freeze block (lines 26-36). Immediately AFTER that block, BEFORE the `function _isPlainObject` declaration on line 38, add:

```js

// UI order matches UD_LABELS (Thai). Formal clinical labels — intentionally
// MORE FORMAL than PatientForm.jsx UI labels (which are lay-friendly:
// 'Diabetes' / 'Kidney Disease' / 'Blood Disease'). OPD print is clinical
// documentation; formal labels are appropriate. The drift is intentional.
// Frozen so consumers can rely on key + label stability.
export const UD_LABELS_EN = Object.freeze({
  ud_hypertension: 'Hypertension',
  ud_diabetes:     'Diabetes Mellitus',
  ud_lung:         'Lung Disease',
  ud_kidney:       'Chronic Kidney Disease',
  ud_heart:        'Heart Disease',
  ud_blood:        'Hematological Disease',
});

```

Then after the existing `derivePatientCongenitalDisease` function (currently ending at line 67), BEFORE the `derivePatientTreatmentHistory` JSDoc block on line 69, add:

```js

/**
 * English-locale mirror of derivePatientCongenitalDisease. Returns comma-joined
 * formal-clinical English labels for chronic-disease flags.
 *
 * Returns '' when:
 *   - patientData is not a plain object
 *   - hasUnderlying !== 'มี'  (NOTE: gate key value is Thai 'มี' regardless of
 *                              caller's UI language — patientData shape is
 *                              language-agnostic; only OUTPUT labels differ)
 *   - all UD_LABELS_EN keys are falsy AND ud_otherDetail is empty/whitespace
 *
 * Standard flag labels emit first (UI order, matching UD_LABELS), then
 * ud_otherDetail (trimmed) if present.
 *
 * Used by: src/utils.js (Thai + English OPD print builders — line ~345 + ~415).
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

Also update the file-header comment block (lines 1-19) to note the new English helper consumer:

Replace lines 8-19 of the file header (the "Used by" + Audit + Tech-debt note block):

**Before:**
```js
// Pure JS, branch-blind. Used by:
//   - TreatmentFormPage.jsx (create-mode auto-fill)
// Tests:
//   - tests/phase-26-2g-fillin-patient-health-mapping.test.js
//   - tests/phase-26-2g-fillin-source-grep.test.js
//   - tests/phase-26-2g-fillin-flow-simulate.test.js
//
// Audit: AV40 (no direct patientData.ud_* reads in components/pages outside
// PatientForm writer + AdminDashboard pregnancy/chronic display chips).
// Tech-debt note: src/utils.js OPD print builders (lines ~345-356 + ~415-426)
// still have inline derivation with a different output shape; future Rule-of-3
// refactor opportunity is welcome but out of scope for Phase 26.2g-fillin.
```

**After:**
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

- [ ] **Step 4: Run the test (verify GREEN)**

Run: `cd F:/LoverClinic-app && npx vitest run tests/phase-26-2g-fillin-followup-english-helper.test.js 2>&1 | tail -15`
Expected: ALL ~12 assertions PASS.

If anything fails, fix the IMPLEMENTATION (not the test). The test contracts the behavior; the implementation must match.

- [ ] **Step 5: Commit**

```bash
cd F:/LoverClinic-app
git add src/lib/patientHealthMapping.js tests/phase-26-2g-fillin-followup-english-helper.test.js
git commit -m "feat(Phase 26.2g-fillin-followup Task 1): derivePatientCongenitalDiseaseEnglish + tests

NEW UD_LABELS_EN frozen map with formal clinical labels:
  - ud_hypertension: 'Hypertension'
  - ud_diabetes:     'Diabetes Mellitus'
  - ud_lung:         'Lung Disease'
  - ud_kidney:       'Chronic Kidney Disease'
  - ud_heart:        'Heart Disease'
  - ud_blood:        'Hematological Disease'

NEW derivePatientCongenitalDiseaseEnglish helper mirrors Thai version
with UD_LABELS_EN. Same gates (hasUnderlying === 'มี' wins; ud_other +
ud_otherDetail trimming; typeof guards on non-string field).

12 unit assertions L1.1-EN through L1.12-EN covering empty inputs,
self-contradiction guard, single/multi/all-6 flags, ud_other detail
handling, insertion order, frozen map, typeof-guard locks, verbatim
label set, byte-identical OPD output contract.

utils.js call sites land in Task 2.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 2: Refactor `src/utils.js` to consume helpers (2 call sites)

**Files:**
- Modify: `src/utils.js` (add import at top + replace 2 inline derivation blocks)

- [ ] **Step 1: Add the import at the top of `src/utils.js`**

`src/utils.js` currently has zero top-level imports (the file starts with `export const hexToRgb = ...`). Add a NEW import block at line 1 (very top of file), BEFORE the existing `export const hexToRgb` line:

```js
// Phase 26.2g-fillin-followup (2026-05-13) — Rule-of-3 close:
// OPD print builders below consume the shared patientHealthMapping helpers
// instead of inlining the ud_* → label mapping. Output BYTE-IDENTICAL for
// OPD print recipients (formal-clinical EN labels preserved).
import {
  derivePatientCongenitalDisease,
  derivePatientCongenitalDiseaseEnglish,
} from './lib/patientHealthMapping.js';

```

- [ ] **Step 2: Refactor the Thai builder block (currently lines 344-354 after import addition shifts them down ~9 lines)**

Find this EXACT existing block in `src/utils.js` (search for `let pmh = [];` + the Thai `ความดันโลหิตสูง` literal to anchor):

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

Replace with:

```js
    // Phase 26.2g-fillin-followup (2026-05-13) — Rule of 3 close: use helper
    const chronicTh = derivePatientCongenitalDisease(d);
    parts.push(`ประวัติโรคประจำตัว  : ${chronicTh || 'ปฏิเสธโรคประจำตัว'}`);
```

- [ ] **Step 3: Refactor the English builder block (currently lines 414-424 after Step 1 shifts them down)**

Find this EXACT existing block in `src/utils.js` (search for `let pmh = [];` + `'Hypertension'` to anchor — there will be 2 matches of `let pmh = []`; the English one has `'Hypertension'` immediately after):

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

Replace with:

```js
    // Phase 26.2g-fillin-followup (2026-05-13) — Rule of 3 close: use helper
    const chronicEn = derivePatientCongenitalDiseaseEnglish(d);
    parts.push(`Past Medical History: ${chronicEn || 'No known underlying diseases'}`);
```

- [ ] **Step 4: Build verification (catches import typos + missing exports)**

Run: `cd F:/LoverClinic-app && npm run build 2>&1 | tail -10`
Expected: clean build, no MISSING_EXPORT or syntax errors. If it fails with a message mentioning `patientHealthMapping` or one of the derive functions, the import path is wrong — re-check the import block in Step 1.

- [ ] **Step 5: Targeted regression check — utils.js consumers still work**

Run: `cd F:/LoverClinic-app && grep -rln "from '\.\./utils\|from '\./utils\|from 'src/utils" src/ tests/ 2>&1 | wc -l`
This counts how many files import utils.js. Then verify the helper tests still pass + any utils.js-consumer tests:

Run: `cd F:/LoverClinic-app && npx vitest run tests/phase-26-2g-fillin-patient-health-mapping.test.js tests/phase-26-2g-fillin-followup-english-helper.test.js 2>&1 | tail -10`
Expected: 12 + 20 = 32 assertions GREEN (both Thai and English helper test banks pass; refactor did NOT touch the helper logic).

- [ ] **Step 6: Manual byte-identical contract check (small fixture sanity)**

Run a quick node REPL or vitest one-off (paste into a scratch test file or use node -e):

```bash
cd F:/LoverClinic-app && node -e "
import('./src/lib/patientHealthMapping.js').then(({ derivePatientCongenitalDisease, derivePatientCongenitalDiseaseEnglish }) => {
  const pd = {
    hasUnderlying: 'มี',
    ud_hypertension: true, ud_diabetes: true, ud_lung: true,
    ud_kidney: true, ud_heart: true, ud_blood: true,
    ud_other: true, ud_otherDetail: 'TEST_DETAIL',
  };
  const th = derivePatientCongenitalDisease(pd);
  const en = derivePatientCongenitalDiseaseEnglish(pd);
  console.log('TH:', JSON.stringify(\`ประวัติโรคประจำตัว  : \${th || 'ปฏิเสธโรคประจำตัว'}\`));
  console.log('EN:', JSON.stringify(\`Past Medical History: \${en || 'No known underlying diseases'}\`));
});
"
```

Expected output:
```
TH: "ประวัติโรคประจำตัว  : ความดันโลหิตสูง, เบาหวาน, โรคปอด, โรคไต, โรคหัวใจ, โรคโลหิต, TEST_DETAIL"
EN: "Past Medical History: Hypertension, Diabetes Mellitus, Lung Disease, Chronic Kidney Disease, Heart Disease, Hematological Disease, TEST_DETAIL"
```

Also test the empty (hasUnderlying='ไม่มี') path:
```bash
cd F:/LoverClinic-app && node -e "
import('./src/lib/patientHealthMapping.js').then(({ derivePatientCongenitalDisease, derivePatientCongenitalDiseaseEnglish }) => {
  const pd = { hasUnderlying: 'ไม่มี' };
  const th = derivePatientCongenitalDisease(pd);
  const en = derivePatientCongenitalDiseaseEnglish(pd);
  console.log('TH empty:', JSON.stringify(\`ประวัติโรคประจำตัว  : \${th || 'ปฏิเสธโรคประจำตัว'}\`));
  console.log('EN empty:', JSON.stringify(\`Past Medical History: \${en || 'No known underlying diseases'}\`));
});
"
```

Expected output:
```
TH empty: "ประวัติโรคประจำตัว  : ปฏิเสธโรคประจำตัว"
EN empty: "Past Medical History: No known underlying diseases"
```

If either output differs from the pre-refactor output (which a reviewer can verify by reading the old git history), the wrapping template has drifted — STOP and fix.

- [ ] **Step 7: Commit**

```bash
cd F:/LoverClinic-app
git add src/utils.js
git commit -m "feat(Phase 26.2g-fillin-followup Task 2): utils.js OPD print builders consume helpers

Rule-of-3 close — both Thai (line ~345) and English (line ~415) chronic-disease
PMH derivations in src/utils.js now call patientHealthMapping helpers instead
of inlining the ud_* → label mapping.

Thai builder:    10 inline lines → 2 lines (derive + push)
English builder: 10 inline lines → 2 lines (derive + push)

Surrounding allergy + currentMedication lines preserved verbatim (different
output shape, not part of this Rule of 3).

Output BYTE-IDENTICAL for OPD print recipients (formal-clinical EN labels
preserved: Diabetes Mellitus / Chronic Kidney Disease / Hematological
Disease). Manual node REPL verification passed for full-flags case + empty
(hasUnderlying='ไม่มี') case.

V12 multi-reader-sweep class fully closed for patientData.ud_* project-wide.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 3: Source-grep regression locks (G3.1-G3.4)

**Files:**
- Test: `tests/phase-26-2g-fillin-followup-source-grep.test.js` (NEW)

- [ ] **Step 1: Write the source-grep test file**

Write `tests/phase-26-2g-fillin-followup-source-grep.test.js` with this EXACT content:

```js
// tests/phase-26-2g-fillin-followup-source-grep.test.js
// Phase 26.2g-fillin-followup — source-grep regression locks for utils.js
// Rule-of-3 close.
// G3.1: utils.js imports both helpers
// G3.2: anti-regression — no inline ud_* → label push patterns remain
// G3.3: Thai builder consumes derivePatientCongenitalDisease
// G3.4: English builder consumes derivePatientCongenitalDiseaseEnglish

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const UTILS_PATH = 'src/utils.js';
const utils = readFileSync(UTILS_PATH, 'utf8');

describe('G3 — utils.js consumes patientHealthMapping helpers', () => {
  it('G3.1 — utils.js imports both helpers from ./lib/patientHealthMapping.js', () => {
    expect(utils).toMatch(/import\s*\{[^}]*derivePatientCongenitalDisease\b[^}]*\}\s*from\s*['"][^'"]*patientHealthMapping(?:\.js)?['"]/);
    expect(utils).toMatch(/import\s*\{[^}]*derivePatientCongenitalDiseaseEnglish[^}]*\}\s*from\s*['"][^'"]*patientHealthMapping(?:\.js)?['"]/);
  });

  it('G3.2 — anti-regression: no inline pmh.push label statements remain (Thai + EN)', () => {
    // Lock the refactor — these inline patterns MUST NOT reappear.
    // (Sentinel labels: first Thai label + first English label. If these are
    // gone, the rest of the inline block is too — refactor landed correctly.)
    expect(utils).not.toMatch(/pmh\.push\(['"]ความดันโลหิตสูง['"]\)/);
    expect(utils).not.toMatch(/pmh\.push\(['"]Hypertension['"]\)/);
    // Also lock the secondary distinguishing label per language (Diabetes vs
    // Diabetes Mellitus drift would be caught here; Kidney Disease vs Chronic
    // Kidney Disease likewise).
    expect(utils).not.toMatch(/pmh\.push\(['"]Diabetes Mellitus['"]\)/);
    expect(utils).not.toMatch(/pmh\.push\(['"]เบาหวาน['"]\)/);
  });

  it('G3.3 — Thai builder uses derivePatientCongenitalDisease near its push site', () => {
    // Window around the Thai PMH literal: 500 chars before, 300 chars after.
    // The derive call must appear within that window.
    const idx = utils.indexOf('ประวัติโรคประจำตัว');
    expect(idx).toBeGreaterThan(-1);
    const region = utils.slice(Math.max(0, idx - 500), idx + 300);
    expect(region).toMatch(/derivePatientCongenitalDisease\s*\(\s*d\s*\)/);
    // Thai builder MUST NOT use the English helper.
    expect(region).not.toMatch(/derivePatientCongenitalDiseaseEnglish/);
  });

  it('G3.4 — English builder uses derivePatientCongenitalDiseaseEnglish near its push site', () => {
    const idx = utils.indexOf('Past Medical History');
    expect(idx).toBeGreaterThan(-1);
    const region = utils.slice(Math.max(0, idx - 500), idx + 300);
    expect(region).toMatch(/derivePatientCongenitalDiseaseEnglish\s*\(\s*d\s*\)/);
  });
});
```

- [ ] **Step 2: Run the source-grep tests**

Run: `cd F:/LoverClinic-app && npx vitest run tests/phase-26-2g-fillin-followup-source-grep.test.js 2>&1 | tail -15`
Expected: ALL 4 tests PASS (G3.1, G3.2, G3.3, G3.4).

If G3.1 fails: the import block was not added correctly in Task 2 Step 1.
If G3.2 fails: one of the inline `pmh.push(...)` blocks was not removed in Task 2 Step 2 or 3.
If G3.3 fails: the Thai derive call is missing OR the window is too narrow — STOP and inspect.
If G3.4 fails: the English derive call is missing OR the window is too narrow — STOP and inspect.

- [ ] **Step 3: Commit**

```bash
cd F:/LoverClinic-app
git add tests/phase-26-2g-fillin-followup-source-grep.test.js
git commit -m "test(Phase 26.2g-fillin-followup Task 3): G3 source-grep regression locks

G3.1: utils.js imports both helpers
G3.2: anti-regression — no inline pmh.push label statements remain
       (Thai: ความดันโลหิตสูง + เบาหวาน · EN: Hypertension + Diabetes Mellitus)
G3.3: Thai builder uses derivePatientCongenitalDisease (within ±300/500 char
       window of ประวัติโรคประจำตัว)
G3.4: English builder uses derivePatientCongenitalDiseaseEnglish (within
       window of 'Past Medical History')

Future commits cannot accidentally restore inline derivation without failing
the build. Mirrors Phase 26.2g-fillin G1+G2 source-grep pattern.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 4: AV40 sanctioned-exception list update + SKILL.md example resolved

**Files:**
- Modify: `.agents/skills/audit-anti-vibe-code/SKILL.md`

- [ ] **Step 1: Edit the AV40 sanctioned-exception list block**

Find this EXACT block in `.agents/skills/audit-anti-vibe-code/SKILL.md` (within the AV40 section, around the "Sanctioned exceptions" subsection):

```markdown
**Sanctioned exceptions** (closed list — adding a 4th file fails the lock test):
- `src/pages/PatientForm.jsx` — writer of these fields (kiosk + admin manual)
- `src/pages/AdminDashboard.jsx` — display chips at lines ~4504-4533
  (`d.ud_*` JSX literals + `d.pregnancy` chip-color logic); pure display,
  not transform
- `src/utils.js` — Thai + English PMH builders at lines ~345-356 + ~415-426
  inside the OPD print builder; pre-existing inline derivation with
  different output shape ("ปฏิเสธ" / "No known" fallback). **Tech-debt**:
  future Rule-of-3 refactor to consume `derivePatientCongenitalDisease`
  is welcome but was out of scope for Phase 26.2g-fillin. This file is
  outside the G2.1 walk (only `src/components` + `src/pages`) so no test
  change needed; reviewers must NOT add new direct `ud_*` reads in
  `src/utils.js` either — refactor toward the helper instead.
```

Replace with:

```markdown
**Sanctioned exceptions** (closed list — adding a 4th file fails the lock test):
- `src/pages/PatientForm.jsx` — writer of these fields (kiosk + admin manual)
- `src/pages/AdminDashboard.jsx` — display chips at lines ~4504-4533
  (`d.ud_*` JSX literals + `d.pregnancy` chip-color logic); pure display,
  not transform
- ~~`src/utils.js`~~ — **REFACTORED Phase 26.2g-fillin-followup (2026-05-13)**.
  Thai + English PMH builders now consume `derivePatientCongenitalDisease`
  + `derivePatientCongenitalDiseaseEnglish` helpers. Output BYTE-IDENTICAL
  for OPD print recipients (formal-clinical EN labels preserved). V12
  multi-reader-sweep class fully closed for `patientData.ud_*` project-wide.
  Future direct `ud_*` reads in `src/utils.js` are forbidden — would fail
  G3.2 anti-regression grep.
```

- [ ] **Step 2: Edit the "Example violations from historical commits" entry for AV40**

Find this EXACT line in the Example section:

```markdown
- AV40 — Phase 26.2g-fillin (2026-05-13) NEW `src/lib/patientHealthMapping.js` with `derivePatientCongenitalDisease` + `derivePatientTreatmentHistory` pure helpers. TFP create-mode auto-fill at `TreatmentFormPage.jsx:1024-1034` extended to call both helpers gated by `!isEdit`. Sanctioned exceptions: `PatientForm.jsx` (writer) + `AdminDashboard.jsx:4504-4533` (display chips) + `src/utils.js:345-356,415-426` (OPD print builder tech-debt). Source-grep regression: `tests/phase-26-2g-fillin-source-grep.test.js` G1+G2.
```

Replace with:

```markdown
- AV40 — Phase 26.2g-fillin (2026-05-13) NEW `src/lib/patientHealthMapping.js` with `derivePatientCongenitalDisease` + `derivePatientTreatmentHistory` pure helpers. TFP create-mode auto-fill at `TreatmentFormPage.jsx:1024-1034` extended to call both helpers gated by `!isEdit`. Sanctioned exceptions: `PatientForm.jsx` (writer) + `AdminDashboard.jsx:4504-4533` (display chips). Source-grep regression: `tests/phase-26-2g-fillin-source-grep.test.js` G1+G2.
- AV40 follow-up — Phase 26.2g-fillin-followup (2026-05-13) extended `patientHealthMapping.js` with `derivePatientCongenitalDiseaseEnglish` + `UD_LABELS_EN` frozen map (formal clinical labels preserved verbatim from `src/utils.js`). Refactored both `src/utils.js` OPD print builders (Thai + English) to consume helpers — 20 inline lines → 4 (2 per builder). `src/utils.js` dropped from AV40 sanctioned list. Anti-regression locks: `tests/phase-26-2g-fillin-followup-source-grep.test.js` G3.1-G3.4. V12 multi-reader-sweep class fully closed for `patientData.ud_*` project-wide.
```

- [ ] **Step 3: Commit**

```bash
cd F:/LoverClinic-app
git add .agents/skills/audit-anti-vibe-code/SKILL.md
git commit -m "feat(audit AV40 update): utils.js dropped from sanctioned list

Phase 26.2g-fillin-followup refactored both Thai + English OPD print
builders in src/utils.js to consume patientHealthMapping helpers. AV40
sanctioned-exception list shrinks 3 → 2 (only PatientForm.jsx writer +
AdminDashboard.jsx display chips remain). Example-violations section gains
a Phase 26.2g-fillin-followup entry documenting the close.

V12 multi-reader-sweep class for patientData.ud_* fully closed project-wide.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

### Task 5: Rule N verification — targeted + full vitest + build

**Files:** none modified (verification only)

- [ ] **Step 1: Targeted Phase 26.2g-fillin + followup test runs**

Run: `cd F:/LoverClinic-app && npx vitest run tests/phase-26-2g-fillin-patient-health-mapping.test.js tests/phase-26-2g-fillin-source-grep.test.js tests/phase-26-2g-fillin-flow-simulate.test.js tests/phase-26-2g-fillin-followup-english-helper.test.js tests/phase-26-2g-fillin-followup-source-grep.test.js 2>&1 | tail -10`
Expected: ~43 assertions GREEN (27 existing Phase 26.2g-fillin + 12 English helper + 4 source-grep). 0 fail.

- [ ] **Step 2: Build verification**

Run: `cd F:/LoverClinic-app && npm run build 2>&1 | tail -10`
Expected: clean build. No MISSING_EXPORT.

- [ ] **Step 3: Full vitest suite (Rule N: small refactor touches shared file `src/utils.js`, widely imported)**

Run: `cd F:/LoverClinic-app && npm test -- --run 2>&1 | tail -15`
Expected: ~8488 tests pass + 1 skipped + 0 fail (8474 baseline + 12 English helper + 4 source-grep ≈ 8490; minus any helper-test renaming/reshape = ~8488). 1 known intermittent flake (Phase 17.1 cross-branch-import-rtl) — re-run if it flakes alone.

If full suite reveals an unexpected regression in any test that imports `src/utils.js` (AdminDashboard, OPD print flows, schedule renderers, customer-detail formatters): STOP and apply systematic-debugging.

- [ ] **Step 4: No commit at this task — verification only**

---

### Task 6: Session-end docs (V-entry + active.md + handoff + checkpoint)

**Files:**
- Modify: `.claude/rules/00-session-start.md` § 2 (V-entry table)
- Modify: `.agents/active.md` (rewrite to reflect Phase 26.2g-fillin-followup SHIPPED)
- Modify: `SESSION_HANDOFF.md` (append new session block + Resume Prompt)
- Create: `.agents/sessions/2026-05-13-phase-26-2g-fillin-followup.md` (checkpoint, ≤150 lines)

- [ ] **Step 1: Append a Phase 26.2g-fillin-followup V-entry to `.claude/rules/00-session-start.md` § 2**

Find this EXACT line in `.claude/rules/00-session-start.md` (the Phase 26.2g-fillin V-entry inserted in the prior session):

```markdown
| Phase 26.2g-fillin | 2026-05-13 | **patientData → TFP create-mode auto-fill V12 sweep close (AV40)** —
```

Insert a NEW row IMMEDIATELY BEFORE that line (so Phase 26.2g-fillin-followup sits above Phase 26.2g-fillin in chronological order, since it's the newer entry):

```markdown
| Phase 26.2g-fillin-followup | 2026-05-13 | **utils.js OPD print builders Rule-of-3 close (AV40 sanctioned list shrunk 3 → 2)** — Phase 26.2g-fillin pre-flight Rule P Step 3 grep flagged `src/utils.js:345-356,415-426` as tech-debt with the SAME inline `ud_*` derivation pattern but a different output shape (line-prefixed + ปฏิเสธ/No-known fallback for OPD print) + DIFFERENT English labels (formal clinical: "Diabetes Mellitus", "Chronic Kidney Disease", "Hematological Disease" vs PatientForm lay-friendly "Diabetes", "Kidney Disease", "Blood Disease"). Approach A (mirror helper + caller-side wrap) locked. **Architectural extension**: NEW `UD_LABELS_EN` frozen map + NEW `derivePatientCongenitalDiseaseEnglish` pure helper in `src/lib/patientHealthMapping.js` (~30 LOC added). utils.js Thai builder (10 lines → 2) + English builder (10 lines → 2) refactored to consume helpers; OPD print output BYTE-IDENTICAL (verified via node REPL across full-flags + empty cases). AV40 sanctioned-exception list shrinks from 3 → 2 (utils.js removed; PatientForm.jsx writer + AdminDashboard.jsx display chips remain). **Tests**: +16 new (12 L1-EN unit assertions + 4 G3 source-grep regression locks). Cumulative: 8474 → ~8488 + 1 skipped. Build clean. **Lessons**: (a) Rule P "ONE class-of-bug at a time" + sanctioned tech-debt + follow-up plan is the right rhythm — Phase 26.2g-fillin shipped the user-visible fix first, follow-up closed the Rule-of-3 cleanly without scope creep; (b) byte-identical output is the right contract when refactoring existing builders that ship to external recipients (OPD print) — caller-side wrapping with original prefix + fallback strings preserves zero behavior change; (c) intentional label drift between contexts (formal clinical vs lay-friendly UI) deserves an explicit separate constant (`UD_LABELS_EN`) rather than forcing unification — context-appropriate labels matter; (d) the existing helper's pure-derivation contract was preserved by NOT adding a `lang` param (Approach B rejected) — separation of concerns intact. NO deploy this turn — joins the 71+-commits-ahead-of-prod queue per V18. |
| Phase 26.2g-fillin | 2026-05-13 | **patientData → TFP create-mode auto-fill V12 sweep close (AV40)** —
```

- [ ] **Step 2: Rewrite `.agents/active.md`**

Use Write tool to OVERWRITE `.agents/active.md` with this content (substitute `<NEW HEAD SHA>` with the actual SHA after Task 6 Step 5 commit — fix-up at Step 7):

```markdown
---
updated_at: "2026-05-13 EOD — Phase 26.2g-fillin-followup SHIPPED (utils.js Rule-of-3 close + UD_LABELS_EN + AV40 shrink)"
status: "master=<NEW HEAD SHA> · prod=ccef3c2 · 76+ commits ahead · 8488 passed · build clean"
branch: "master"
last_commit: "<NEW HEAD SHA> docs(Phase 26.2g-fillin-followup): session-end state + V-entry + checkpoint"
tests: 8488
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "ccef3c2"
firestore_rules_version: 29
storage_rules_version: 2
---

# Active Context

## State
- master = `<NEW HEAD SHA>` · prod = `ccef3c2` (76+ commits ahead — Phase 26.0 + 26.1 + 26.2 + 26.2f + 26.2g-fillin + 26.2g-fillin-followup all LIVE on master only; NOT deployed)
- 8488 tests + 1 skipped + 0 fail. Build clean.
- Phase 26.2g-fillin-followup shipped via 6 subagent-driven tasks.

## What this session shipped
- NEW `UD_LABELS_EN` frozen map + `derivePatientCongenitalDiseaseEnglish` pure helper in `src/lib/patientHealthMapping.js` (~30 LOC added).
- `src/utils.js` Thai + English OPD print builders refactored to consume helpers (10 → 2 lines each; OPD output BYTE-IDENTICAL).
- 2 NEW test files (~16 assertions): English helper unit L1.1-EN..L1.12-EN + G3 source-grep regression.
- AV40 sanctioned-exception list shrunk 3 → 2 (utils.js removed; PatientForm.jsx writer + AdminDashboard.jsx display chips remain).
- V12 multi-reader-sweep class fully closed for `patientData.ud_*` project-wide.
- Detail: `.agents/sessions/2026-05-13-phase-26-2g-fillin-followup.md`

## Next action
Choose ONE in next chat:
1. **Deploy combined 76+ commits** — `vercel --prod` + `firebase deploy --only firestore:rules` per V15 + Rule B Probe-Deploy-Probe.
2. **New phase / feature** — user specifies priority.
3. **Probe-Deploy-Probe maintenance** — investigate probes 2/3/4 false-positive or Phase 17.1 flake.

## Outstanding user-triggered actions
- **Deploy auth**: 76+ commits ahead. Combined deploy per V15 + Rule B (4-endpoint probe list post-V50-followup-2).
- (Optional) Phase 17.1 cross-branch-import-rtl flake (intermittent under full-suite load).

## Carried institutional memory
- saveMode='vitals' = 5th locked-X family member (Phase 26.2f AV37 extension).
- Panel + Mirror co-exist for TimelineModal vs TFP split-screen (Phase 26.2f AV38 + AV39).
- `extractDisplayString` = canonical fix for [object Object] rendering (Phase 26.2).
- `toDateSafely` = canonical fix for Firestore Timestamp → React child crash (Phase 26.2f3).
- `derivePatientCongenitalDisease` (Thai) + `derivePatientCongenitalDiseaseEnglish` (formal clinical EN) + `derivePatientTreatmentHistory` = canonical helpers for patientData health-info derivation; both Thai and EN OPD print builders + TFP create-mode auto-fill consume the same lib.
- `UD_LABELS_EN` formal-clinical labels intentionally distinct from PatientForm UI labels (lay-friendly); context-appropriate label drift documented.
- 3-stage save workflow: vitals → doctor → null/complete (Phase 26.2f).
- AV40 = patientData.ud_* / hasUnderlying / currentMedication / pregnancy reads centralized via patientHealthMapping.js (Phase 26.2g-fillin + followup). Sanctioned list: PatientForm.jsx + AdminDashboard.jsx only (2 entries).
- V21-class regex windows drift when comments expand — bump windows + V21 marker comment.
- Rule P "ONE class-of-bug at a time" + sanctioned tech-debt + follow-up plan = canonical rhythm for partial-scope refactors.
```

- [ ] **Step 3: Append a new section to `SESSION_HANDOFF.md`**

Use the Edit tool to update the file. First find this line near the top of `SESSION_HANDOFF.md`:

```markdown
- **Date last updated**: 2026-05-13 EOD — Phase 26.2g-fillin SHIPPED (patientHealthMapping + TFP wire + AV40 + V21 fixup) · 8474 tests + 1 skipped · build clean · 71 commits ahead of prod
```

Replace with:

```markdown
- **Date last updated**: 2026-05-13 EOD — Phase 26.2g-fillin-followup SHIPPED (utils.js Rule-of-3 close + UD_LABELS_EN + AV40 shrunk) · 8488 tests + 1 skipped · build clean · 76+ commits ahead of prod
```

Then find this line:

```markdown
- **Last commit**: `f978de6` test(Phase 26.2g-fillin Task 8 fixup): D6.2 + D6.3 V21-class window bump
```

Replace with:

```markdown
- **Last commit**: `<NEW HEAD SHA>` docs(Phase 26.2g-fillin-followup): session-end state + V-entry + checkpoint
```

Then find this line:

```markdown
- **Test count**: **8474 passed** + 1 skipped. 0 failures. 1 known flake (Phase 17.1, intermittent).
```

Replace with:

```markdown
- **Test count**: **8488 passed** + 1 skipped. 0 failures. 1 known flake (Phase 17.1, intermittent).
```

Then find this line:

```markdown
- **Deploy state**: **PRODUCTION = `ccef3c2`** (master 71 commits ahead). Phase 26.0 + 26.1 + 26.2 + 26.2f + 26.2g-fillin LIVE on master only.
```

Replace with:

```markdown
- **Deploy state**: **PRODUCTION = `ccef3c2`** (master 76+ commits ahead). Phase 26.0 + 26.1 + 26.2 + 26.2f + 26.2g-fillin + 26.2g-fillin-followup LIVE on master only.
```

Then find this line (the section heading for the prior session block):

```markdown
### Session 2026-05-13 EOD — Phase 26.2g-fillin SHIPPED (NOT YET DEPLOYED)
```

INSERT a new section IMMEDIATELY BEFORE that line:

```markdown
### Session 2026-05-13 EOD — Phase 26.2g-fillin-followup SHIPPED (NOT YET DEPLOYED)

User chose the optional Rule-of-3 follow-up (`src/utils.js:345-356+415-426` flagged as sanctioned tech-debt in Phase 26.2g-fillin AV40). Brainstormed Approach A (mirror helper + caller wrap) + formal-clinical EN labels (preserve current utils.js output verbatim) → spec → plan → subagent-driven execution.

**Commits this session** (5-7 total): spec → English helper TDD → utils.js refactor → source-grep → AV40 update → session-end.

**(A) `src/lib/patientHealthMapping.js` extension** — NEW `UD_LABELS_EN` frozen map with formal clinical labels (Hypertension / Diabetes Mellitus / Lung Disease / Chronic Kidney Disease / Heart Disease / Hematological Disease) intentionally MORE FORMAL than PatientForm UI labels. NEW pure helper `derivePatientCongenitalDiseaseEnglish` mirrors the Thai version with `UD_LABELS_EN` (same gates: `hasUnderlying === 'มี'` wins; ud_other + ud_otherDetail trimming; typeof guards). ~30 LOC added after existing exports.

**(B) `src/utils.js` refactor** — 2 inline `if (d.ud_X) pmh.push(...)` blocks (10 lines each, Thai + English) collapsed to 2 lines each that call the helpers and wrap with the existing OPD-print prefix + fallback. Output BYTE-IDENTICAL for OPD print recipients (verified via node REPL on full-flags + empty cases). Surrounding allergy + currentMedication lines preserved verbatim (different shape, out of scope).

**(C) AV40 sanctioned-exception list update** — `src/utils.js` REMOVED (now uses helpers). List shrinks 3 → 2 (PatientForm.jsx writer + AdminDashboard.jsx display chips remain). V12 multi-reader-sweep class for `patientData.ud_*` fully closed project-wide.

**Tests**: +16 new (12 L1.1-EN..L1.12-EN unit + 4 G3 source-grep). Cumulative: 8474 → 8488 + 1 skipped. Build clean.

**Lessons**: Rule P "ONE class-of-bug at a time" + sanctioned tech-debt + follow-up plan is canonical rhythm for partial-scope refactors. Byte-identical output is the right contract when refactoring builders shipping to external recipients. Intentional label drift between contexts (formal clinical vs lay-friendly UI) deserves separate frozen constants rather than forced unification.

Detail: `.agents/sessions/2026-05-13-phase-26-2g-fillin-followup.md`. NOT yet deployed. 76+ commits ahead.

#### Resume Prompt — Phase 26.2g-fillin-followup SHIPPED

```
Resume LoverClinic — continue from 2026-05-13 EOD (Phase 26.2g-fillin-followup SHIPPED).

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=<NEW HEAD SHA>, prod=ccef3c2 · 76+ commits ahead · NOT DEPLOYED)
3. .agents/active.md (8488 tests · Phase 26.2g-fillin-followup DONE)
4. .claude/rules/00-session-start.md (iron-clad A-P + V-summary)
5. .agents/sessions/2026-05-13-phase-26-2g-fillin-followup.md (latest checkpoint)

Status: master=`<NEW HEAD SHA>`, 8488 tests pass + 1 skip, prod=`ccef3c2` LIVE. Build clean.
Phase 26.0 / 26.1 / 26.2 / 26.2f / 26.2g-fillin / 26.2g-fillin-followup all SHIPPED to master; NOT deployed. 76+ commits ahead.

Next: choose ONE
1. Deploy combined 76+ commits — `vercel --prod` + `firebase deploy --only firestore:rules` per V15 + Rule B Probe-Deploy-Probe.
2. New phase / feature — user specifies priority.
3. Probe-Deploy-Probe maintenance — probes 2/3/4 false-positive or Phase 17.1 flake.

Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe Rule B; Rule J brainstorming HARD-GATE; Rule N targeted-test-only.

Phase 26.2g-fillin-followup institutional memory:
- `derivePatientCongenitalDiseaseEnglish` + `UD_LABELS_EN` formal clinical labels = canonical helpers for English OPD print
- V12 multi-reader-sweep for patientData.ud_* fully closed project-wide
- AV40 sanctioned list = 2 entries (PatientForm.jsx + AdminDashboard.jsx)
- Rule P partial-scope refactor + sanctioned tech-debt + follow-up plan rhythm

/session-start
```

---
```

- [ ] **Step 4: Create the checkpoint file**

Use Write tool to create `.agents/sessions/2026-05-13-phase-26-2g-fillin-followup.md` with this content:

```markdown
# Session 2026-05-13 EOD — Phase 26.2g-fillin-followup (utils.js Rule-of-3 close)

## Summary

Phase 26.2g-fillin-followup SHIPPED via 6 tasks (5 source/test/docs + 1 verify). NEW `UD_LABELS_EN` frozen map + `derivePatientCongenitalDiseaseEnglish` pure helper extracted into `src/lib/patientHealthMapping.js`. `src/utils.js` Thai + English OPD print builders refactored to consume both Thai (existing) + English (new) helpers — 20 inline lines → 4 (2 per builder). Output BYTE-IDENTICAL for OPD print recipients (formal clinical EN labels preserved verbatim). AV40 sanctioned-exception list shrinks 3 → 2 (utils.js removed). V12 multi-reader-sweep class for `patientData.ud_*` fully closed project-wide.

## Current State

- master = `<NEW HEAD SHA>` · prod = `ccef3c2` (76+ commits ahead — Phase 26.0 + 26.1 + 26.2 + 26.2f + 26.2g-fillin + 26.2g-fillin-followup all LIVE on master only; NOT deployed)
- 8488 tests + 1 skipped + 0 fail. Build clean.
- 1 known intermittent flake (Phase 17.1 cross-branch-import-rtl under full-suite load).

## Commits this session (after spec commit)

```
<6 SHAs from Tasks 1-6 — git log --oneline -7>
```

## Files Touched

**Source**:
- MODIFIED `src/lib/patientHealthMapping.js` (+UD_LABELS_EN frozen map +derivePatientCongenitalDiseaseEnglish helper +file-header consumer/test updates, ~35 LOC added)
- MODIFIED `src/utils.js` (+1 import block at top, Thai builder 10 → 2 lines, English builder 10 → 2 lines, net -16 LOC)
- MODIFIED `.agents/skills/audit-anti-vibe-code/SKILL.md` (AV40 sanctioned list shrunk 3 → 2; Example entry updated)

**Tests NEW**:
- `tests/phase-26-2g-fillin-followup-english-helper.test.js` (12 assertions L1.1-EN..L1.12-EN)
- `tests/phase-26-2g-fillin-followup-source-grep.test.js` (4 assertions G3.1-G3.4)

**Docs**:
- NEW `docs/superpowers/specs/2026-05-13-phase-26-2g-fillin-followup-utils-rule-of-3-design.md`
- NEW `docs/superpowers/plans/2026-05-13-phase-26-2g-fillin-followup-utils-rule-of-3.md`
- MODIFIED `.claude/rules/00-session-start.md` § 2 (Phase 26.2g-fillin-followup V-entry inserted before Phase 26.2g-fillin)
- MODIFIED `.agents/active.md` (rewrite to Phase 26.2g-fillin-followup SHIPPED state)
- MODIFIED `SESSION_HANDOFF.md` (Current State + new session block + Resume Prompt)
- NEW `.agents/sessions/2026-05-13-phase-26-2g-fillin-followup.md` (this file)

## Decisions (one-liner each)

- Approach A locked: mirror helper + caller-side wrap. Existing helper's pure-derivation contract preserved.
- Formal clinical EN labels (current utils.js output) preserved verbatim — zero behavior change for OPD print recipients per user directive.
- `UD_LABELS_EN` frozen + separate from `UD_LABELS` (Thai) → context-appropriate label drift between OPD print (formal) and PatientForm UI (lay-friendly) is intentional.
- Surrounding allergy + currentMedication + pregnancy lines in utils.js preserved as-is (different output shape; not part of this Rule of 3; YAGNI).
- AV40 sanctioned list shrunk 3 → 2 (utils.js dropped); G2.1 grep walk unchanged (only walks src/components + src/pages anyway).
- G3.2 anti-regression locks both first-label + secondary-distinguishing-label per language (Hypertension + Diabetes Mellitus EN; ความดันโลหิตสูง + เบาหวาน TH) — catches any partial refactor.
- Byte-identical OPD output verified via node REPL on full-flags + empty cases (NOT a vitest snapshot — utils.js builders consume more than just chronic; manual verification is sufficient for this small change).
- File-header comment block in patientHealthMapping.js updated to list new consumer (utils.js) + new test files + tech-debt note flipped to "CLOSED".

## Lessons (Rule D continuous improvement)

1. **Rule P "ONE class-of-bug at a time" + sanctioned tech-debt + follow-up plan is the canonical rhythm for partial-scope refactors.** Phase 26.2g-fillin shipped the user-visible fix first (TFP create-mode auto-fill gap) + AV40 invariant + sanctioned the utils.js tech-debt. Phase 26.2g-fillin-followup closed the Rule-of-3 cleanly without scope creep.

2. **Byte-identical output is the right contract when refactoring builders shipping to external recipients.** OPD print recipients see no change; the refactor is internal. Caller-side wrapping with original prefix + fallback strings preserves zero behavior change.

3. **Intentional label drift between contexts deserves separate frozen constants.** `UD_LABELS_EN` (formal clinical) vs PatientForm UI labels (lay-friendly) — both legitimate, different audiences. Forcing unification would be wrong; explicit separate constants documents the distinction.

4. **The existing helper's pure-derivation contract was preserved by NOT adding a `lang` param (Approach B rejected).** Separation of concerns intact — helper does derivation, caller does formatting. Future English-locale consumers (if any) just import the mirror helper.

5. **G3.2 anti-regression locks BOTH first + secondary labels per language.** First label (Hypertension / ความดันโลหิตสูง) catches the obvious case; secondary distinguishing label (Diabetes Mellitus / เบาหวาน) catches partial refactor or label-drift introduction.

6. **node REPL verification is sufficient for byte-identical contract on small refactors.** A vitest snapshot would require setting up the full OPD print builder context (parts.push chain, surrounding lines, etc.) — disproportionate to the change. The L1.12-EN unit assertion in the helper test bank + manual REPL verification covers the contract.

## Next Todo

Choose ONE in next chat:

1. **Deploy combined 76+ commits** — `vercel --prod` + `firebase deploy --only firestore:rules` per V15 (combined deploy + Probe-Deploy-Probe Rule B). 4-endpoint probe list post-V50-followup-2.
2. **New phase / feature** — user specifies priority.
3. **Probe-Deploy-Probe maintenance** — investigate probes 2/3/4 false-positive or Phase 17.1 cross-branch-import-rtl flake.

## Resume Prompt

See SESSION_HANDOFF.md "Session 2026-05-13 EOD — Phase 26.2g-fillin-followup SHIPPED" block (master=<NEW HEAD SHA>).
```

- [ ] **Step 5: Stage all session-end docs and commit**

```bash
cd F:/LoverClinic-app
git add .claude/rules/00-session-start.md .agents/active.md SESSION_HANDOFF.md .agents/sessions/2026-05-13-phase-26-2g-fillin-followup.md
git commit -m "docs(Phase 26.2g-fillin-followup Task 6): session-end state + V-entry + checkpoint

V-entry appended to .claude/rules/00-session-start.md § 2 — Phase 26.2g-fillin-followup
inserted BEFORE Phase 26.2g-fillin (chronological — followup is the newer entry).
- Rule P partial-scope refactor + sanctioned tech-debt rhythm lesson
- Byte-identical output contract for external-recipient builders lesson
- Intentional label drift (formal clinical vs lay-friendly) deserves separate frozen constants
- Separation of concerns preserved by NOT adding lang param to existing helper

.agents/active.md flipped to Phase 26.2g-fillin-followup SHIPPED state.
SESSION_HANDOFF.md appended new session block + Resume Prompt for next chat.
.agents/sessions/2026-05-13-phase-26-2g-fillin-followup.md checkpoint.

76+-commits-ahead-of-prod queue. NO deploy this turn (V18).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

- [ ] **Step 6: Fix up `<NEW HEAD SHA>` placeholders**

After Step 5 commit lands, the HEAD SHA is known. If the SHA placeholders in `.agents/active.md` + `SESSION_HANDOFF.md` + checkpoint file were left literal `<NEW HEAD SHA>` rather than replaced with the actual SHA: AMEND the prior commit OR add a tiny fix-up commit replacing the placeholders with the real SHA from `git rev-parse HEAD`.

Recommended: use a small fix-up commit (per project rule "prefer new commit over amend"):

```bash
cd F:/LoverClinic-app
NEW_SHA=$(git rev-parse HEAD)
# Edit the 3 files to replace <NEW HEAD SHA> with $NEW_SHA
# Use sed-style or Edit tool — but for simplicity:
# (a) Read each file
# (b) Edit tool: old_string='<NEW HEAD SHA>', new_string=$NEW_SHA, replace_all=true
git add .agents/active.md SESSION_HANDOFF.md .agents/sessions/2026-05-13-phase-26-2g-fillin-followup.md
git commit -m "docs(Phase 26.2g-fillin-followup Task 6 fix-up): fill in HEAD SHA placeholders

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

- [ ] **Spec coverage** — every section in `docs/superpowers/specs/2026-05-13-phase-26-2g-fillin-followup-utils-rule-of-3-design.md` is implemented by a task.
- [ ] **Placeholder scan** — no "TBD" / "implement later" — every step has real content. `<NEW HEAD SHA>` is an INTENTIONAL post-commit fix-up handled in Task 6 Step 6.
- [ ] **Type consistency** — `derivePatientCongenitalDisease` / `derivePatientCongenitalDiseaseEnglish` / `UD_LABELS_EN` / `_isPlainObject` spelled identically across all tasks.
- [ ] **Test file naming** — `phase-26-2g-fillin-followup-*` mirrors existing phase convention.
- [ ] **Commit messages** — every commit has Phase tag + Task # + Rule context where relevant.
- [ ] **OPD output verification** — Task 2 Step 6 manual node REPL check covers byte-identical contract.

---

## Out of scope (defer to follow-up if needed)

- currentMedication / hasAllergies / pregnancy lines in `src/utils.js` (different output shape, no inline derivation, no Rule of 3)
- PatientForm.jsx EN UI label updates (intentionally lay-friendly)
- AdminDashboard.jsx display chips (still sanctioned per AV40 — JSX render only, no transform)
- Snapshot-style integration test for the full OPD print builder (manual REPL verification + L1.12-EN unit assertion is sufficient for this small refactor)

---

**Plan complete and saved.** Phase 26.2g-fillin-followup awaits execution choice:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task (Tasks 1-6), review between. Faster iteration.
2. **Inline Execution** — execute tasks 1-6 in this session via `executing-plans`; batch with checkpoints.

Which approach?
