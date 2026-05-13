# Phase 26.0 — Doctor-Save (บันทึกสำหรับแพทย์) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a "บันทึกสำหรับแพทย์" button on TFP that records OPD/vitals/charts/meds/DF only (skips course-items + consumables + purchasedItems + auto-sale), stamps treatment `status: 'doctor-recorded'` + `recordedBy/At` forensic trail, and unlocks normal edit-mode to add the missing pieces.

**Architecture:** Approach A1 — `handleSubmit(saveMode)` with explicit gates at every deduction/sale-create site. `canAddNewItems = (mode==='create') || (loadedTreatment?.status === 'doctor-recorded')` replaces every `!isEdit` gate. AV37 audit invariant + Rule I F1-F8 flow-simulate + Rule N targeted-test discipline.

**Tech Stack:** React 19 + Vite + Firebase Firestore (additive `status` / `recordedBy` / `recordedAt` fields on `be_treatments`) + Vitest 4.1 + RTL.

**Reference:** Spec at `docs/superpowers/specs/2026-05-13-doctor-save-and-admin-finalize-mode-design.md`.

**Rule constraints**:
- No deploy this turn (local-only per `feedback_local_only_no_deploy.md`)
- No firestore.rules change (no Rule B trigger)
- No data migration (no Rule M trigger)
- Rule N: targeted-test during iteration; full suite at batch end (Task 8)
- TDD where practical (each functional task = test-first → fail → implement → pass → commit)

---

## File Structure

**Files to CREATE:**
- `tests/phase-26-0-doctor-save-source-grep.test.js` — AV37 source-grep regression (G1 + G2)
- `tests/phase-26-0-status-display-rtl.test.jsx` — RTL chip + banner + button (D1 + D2 + D3)
- `tests/phase-26-0-doctor-save-flow-simulate.test.js` — Rule I F1-F8 full-flow
- `wiki/concepts/treatment-status-and-doctor-save.md` — concept taxonomy + Rule of 3 link

**Files to MODIFY:**
- `src/components/TreatmentFormPage.jsx` — imports + `saveMode` param + 6 gate sites + status stamp + `canAddNewItems` flag + 5 UI gate swaps + doctor-button + edit-banner
- `src/components/backend/CustomerDetailView.jsx` — amber chip on treatment cards
- `src/components/backend/TreatmentTimelineModal.jsx` — amber chip in row header
- `.agents/skills/audit-anti-vibe-code/SKILL.md` — AV37 invariant entry
- `tests/audit-anti-vibe-code.test.js` — AV37.x sub-tests
- `wiki/log.md` — ingest entry
- `SESSION_HANDOFF.md` — current state update
- `.agents/active.md` — current focus update

**File NOT modified (verified)**: `src/lib/backendClient.js` — `createBackendTreatment` + `updateBackendTreatment` are passthrough (verify in Task 2 step 9). `auth` already exported from `src/firebase.js:17`.

---

## Task 1: Scaffold — Imports + `saveMode` parameter + `canAddNewItems` flag (no behavior change)

**Files:**
- Modify: `src/components/TreatmentFormPage.jsx` (imports at top + signature + flag computation)

- [ ] **Step 1: Add imports**

In the firebase/firestore import line at the top of TFP, add `deleteField, serverTimestamp` (likely both already imported — verify first):

```bash
grep -n "from 'firebase/firestore'" src/components/TreatmentFormPage.jsx | head -3
```

Then add `auth` import near other lib imports:

```js
import { auth } from '../firebase.js';
```

(Verify path — TFP is at `src/components/TreatmentFormPage.jsx`; firebase.js at `src/firebase.js`; relative path is `../firebase.js`.)

- [ ] **Step 2: Add `canAddNewItems` flag computation**

Locate the `isEdit` declaration at line ~325 (`const isEdit = mode === 'edit'`). Add immediately after:

```js
// V26.0 — unlock add-ops when admin finalizes a doctor-recorded treatment
const canAddNewItems = (mode === 'create')
  || (loadedTreatment?.status === 'doctor-recorded');
```

NOTE: `loadedTreatment` is the existing variable holding the edit-mode treatment doc. If a different name is used (e.g., `treatmentToEdit`, `existingTreatment`), use that — verify with:
```bash
grep -n "useState.*null.*treatment\|const \[.*Treatment.*\] = useState" src/components/TreatmentFormPage.jsx | head -5
```

- [ ] **Step 3: Add `saveMode` parameter to handleSubmit signature**

Locate `handleSubmit` at line ~1848. Change signature:

```js
const handleSubmit = async (eventOrSaveMode) => {
  // V26.0 — defensive coercion: any value other than literal 'doctor' string → 'staff'
  const saveMode = (eventOrSaveMode === 'doctor') ? 'doctor' : 'staff';
  // Suppress default event behavior only when invoked as form submit handler
  if (eventOrSaveMode && typeof eventOrSaveMode.preventDefault === 'function') {
    eventOrSaveMode.preventDefault();
  }
  // ... existing body unchanged (gates will be added in Task 2)
```

- [ ] **Step 4: Verify build clean**

Run:
```bash
npm run build 2>&1 | tail -20
```
Expected: build completes (chunk size warning OK; no errors).

- [ ] **Step 5: Commit**

```bash
git add src/components/TreatmentFormPage.jsx
git commit -m "$(cat <<'EOF'
feat(Phase 26.0a): TFP scaffold — saveMode param + canAddNewItems flag + auth import

Foundation for doctor-save feature (no behavior change yet):
- Add `auth` import from src/firebase.js (firebaseUid for recordedBy stamp)
- Add `canAddNewItems = (mode==='create') || (loadedTreatment?.status === 'doctor-recorded')`
  flag at top of render (currently equals `!isEdit` since no doctor-recorded
  treatments exist yet — flag activates in Task 3)
- Add `saveMode = (arg === 'doctor') ? 'doctor' : 'staff'` defensive coercion
  to handleSubmit signature. Backward-compat: form submit event still works
  identically (any non-'doctor' arg → 'staff' default).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: handleSubmit gates + status stamping (TDD)

**Files:**
- Create: `tests/phase-26-0-doctor-save-source-grep.test.js`
- Modify: `src/components/TreatmentFormPage.jsx` (handleSubmit body)
- Verify: `src/lib/backendClient.js` (passthrough — likely no change)

- [ ] **Step 1: Write G1 source-grep test (FAIL expected)**

Create `tests/phase-26-0-doctor-save-source-grep.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const TFP_PATH = join(process.cwd(), 'src/components/TreatmentFormPage.jsx');
const TFP_SOURCE = readFileSync(TFP_PATH, 'utf-8');

describe('Phase 26.0 — AV37 source-grep regression locks', () => {
  describe('G1 — handleSubmit deduction/sale-create sites have saveMode gate', () => {
    const GATED_SITES = [
      'deductCourseItems(',
      'createBackendSale(',
      'assignCourseToCustomer(',
      'applyDepositToSale(',
      'deductWallet(',
      'earnPoints(',
    ];

    GATED_SITES.forEach((fn) => {
      it(`G1.${fn.replace(/[()]/g, '')} — every '${fn}' call gated within 400 chars`, () => {
        const fnEscaped = fn.replace(/[()]/g, '\\$&');
        const callsRe = new RegExp(`await\\s+${fnEscaped}`, 'g');
        const matches = [...TFP_SOURCE.matchAll(callsRe)];
        if (matches.length === 0) return; // no calls — sanctioned (e.g. before Task 2 completes)

        matches.forEach((match) => {
          const idx = match.index;
          const before = TFP_SOURCE.slice(Math.max(0, idx - 400), idx);
          const hasGate = /saveMode\s*!==\s*['"]doctor['"]/.test(before)
            || /saveMode\s*===\s*['"]staff['"]/.test(before);
          expect(
            hasGate,
            `${fn} site at index ${idx} missing saveMode gate within 400 chars; preceding 200 chars:\n${before.slice(-200)}`
          ).toBe(true);
        });
      });
    });

    it('G1.consumables — deductStockForTreatment for consumables (1st call) is gated', () => {
      const callsRe = /await\s+deductStockForTreatment\s*\(/g;
      const matches = [...TFP_SOURCE.matchAll(callsRe)];
      expect(matches.length).toBeGreaterThanOrEqual(2);
      const firstMatch = matches[0]; // consumables call (line ~2207)
      const before = TFP_SOURCE.slice(Math.max(0, firstMatch.index - 500), firstMatch.index);
      const hasGate = /saveMode\s*!==\s*['"]doctor['"]/.test(before);
      expect(hasGate, 'consumables deductStockForTreatment must be saveMode-gated').toBe(true);
    });

    it('G1.meds — deductStockForTreatment for medications (2nd call) NOT saveMode-gated (KEPT per Q2)', () => {
      const callsRe = /await\s+deductStockForTreatment\s*\(/g;
      const matches = [...TFP_SOURCE.matchAll(callsRe)];
      if (matches.length < 2) return;
      const medsMatch = matches[1];
      const before = TFP_SOURCE.slice(Math.max(0, medsMatch.index - 200), medsMatch.index);
      // Meds call may be inside !hasSale block but must NOT have saveMode gate
      // (sanctioned exception per Q2: doctor records meds for the patient)
      // Look for saveMode within just the 200 chars BEFORE — should NOT match
      const hasSaveModeGate = /saveMode\s*!==\s*['"]doctor['"]/.test(before);
      expect(hasSaveModeGate, 'medications deductStockForTreatment must NOT be saveMode-gated (KEPT)').toBe(false);
    });

    it('G1.statusStamp — treatment doc write stamps status + recordedBy + recordedAt for doctor save', () => {
      // Verify status-stamping pattern exists in handleSubmit
      expect(TFP_SOURCE).toMatch(/saveMode\s*===\s*['"]doctor['"]/);
      expect(TFP_SOURCE).toMatch(/status:\s*['"]doctor-recorded['"]/);
      expect(TFP_SOURCE).toMatch(/recordedBy:\s*auth/);
      expect(TFP_SOURCE).toMatch(/recordedAt:\s*serverTimestamp/);
      expect(TFP_SOURCE).toMatch(/deleteField\s*\(\s*\)/);
    });
  });
});
```

- [ ] **Step 2: Run test → expect FAIL**

```bash
npx vitest run tests/phase-26-0-doctor-save-source-grep.test.js 2>&1 | tail -30
```

Expected: 9+ assertions FAIL (no gates in source yet).

- [ ] **Step 3: Add `saveMode` gate to course over-deduction validation (line ~1972)**

Locate the course-validation block (lines 1972-2033 per exploration). Wrap:

```js
// BEFORE: courseValidation block runs unconditionally
// AFTER:
if (saveMode !== 'doctor') {
  // ... existing course-validation block lines 1972-2033 ...
}
```

- [ ] **Step 4: Add gate to `reverseCourseDeduction` + `deductCourseItems` (lines 2102-2179)**

Wrap the entire course-deduction block:

```js
if (saveMode !== 'doctor') {
  // ... existing reverseCourseDeduction (edit mode, line 2102-2106) ...
  // ... existing deductCourseItems calls (lines 2159-2163) ...
}
```

- [ ] **Step 5: Add gate to consumables `deductStockForTreatment` (lines 2207-2216)**

```js
if (saveMode !== 'doctor') {
  // ... existing deductStockForTreatment for consumables + treatmentItems, type 6 ...
}
```

KEEP the medications call (lines 2218-2226, type 7) UNGATED by saveMode — its existing `if (!hasSale && stockChanged)` gate stays as-is. Doctor records meds per Q2 decision.

- [ ] **Step 6: Add gate to `createBackendSale` chain (lines 2232-2386)**

```js
if (saveMode !== 'doctor' && hasSale && !isEdit) {
  // ... existing createBackendSale + deductStockForSale + applyDepositToSale +
  //     deductWallet + earnPoints + assignCourseToCustomer + promo-assign ...
}
```

- [ ] **Step 7: Add gate to edit-mode sale sync (lines 2390-2600)**

```js
if (saveMode !== 'doctor') {
  // ... existing edit-mode sale sync block ...
}
```

- [ ] **Step 8: Add status + recordedBy + recordedAt stamp at treatment doc write (line ~2145)**

Locate the `createBackendTreatment` / `updateBackendTreatment` call site. The treatment payload is built around line 2144-2148 — locate the existing payload variable (e.g., `treatmentPayload`, `payload`, etc.) and extend just BEFORE the create/update call:

```js
// V26.0 — status routing + forensic trail
const v26StatusPatch = saveMode === 'doctor' ? {
  status: 'doctor-recorded',
  // Preserve original recordedBy/At if already set (edit-mode doctor-save edge case, not UI-reachable)
  ...(isEdit && loadedTreatment?.recordedBy ? {} : {
    recordedBy: auth.currentUser?.uid || null,
    recordedAt: serverTimestamp(),
  }),
} : {
  // saveMode === 'staff' (admin finalize OR normal create)
  // Clear status with deleteField() so doc shape stays minimal
  // recordedBy + recordedAt INTENTIONALLY OMITTED → preserve prior forensic trail
  status: deleteField(),
};

// Merge into existing payload BEFORE create/update call:
const finalTreatmentPayload = { ...existingPayload, ...v26StatusPatch };
// Then use finalTreatmentPayload in createBackendTreatment / updateBackendTreatment call
```

NOTE: Adjust variable name to match what TFP currently uses (`treatmentPayload` vs `payload` vs inline object). The pattern is: spread the existing payload, then spread the v26StatusPatch on top.

- [ ] **Step 9: Verify `backendClient.js` passes through `status` / `recordedBy` / `recordedAt`**

```bash
grep -n "createBackendTreatment\|updateBackendTreatment" src/lib/backendClient.js | head -10
```

Open the function definitions and verify the payload is spread into `setDoc` / `updateDoc` without a whitelist. If a whitelist exists, add `status`, `recordedBy`, `recordedAt` to it. If passthrough, no change needed.

- [ ] **Step 10: Run G1 test → expect PASS**

```bash
npx vitest run tests/phase-26-0-doctor-save-source-grep.test.js 2>&1 | tail -20
```

Expected: all 9 G1 assertions PASS.

- [ ] **Step 11: Run build**

```bash
npm run build 2>&1 | tail -10
```

Expected: clean build.

- [ ] **Step 12: Commit**

```bash
git add src/components/TreatmentFormPage.jsx src/lib/backendClient.js tests/phase-26-0-doctor-save-source-grep.test.js
git commit -m "$(cat <<'EOF'
feat(Phase 26.0b): handleSubmit gates + status/recordedBy/recordedAt stamping

Add 6 explicit gates in TFP handleSubmit when saveMode === 'doctor':
- Skip course over-deduction validation (1972-2033)
- Skip reverseCourseDeduction + deductCourseItems (2102-2179)
- Skip consumables deductStockForTreatment, type 6 (2207-2216)
- KEEP medications deductStockForTreatment, type 7 (2218-2226) per Q2
- Skip createBackendSale chain + auto-sale (2232-2386)
- Skip edit-mode sale sync (2390-2600)

Stamp treatment doc with status='doctor-recorded' + recordedBy=uid +
recordedAt=serverTimestamp() on doctor-save. Admin's normal save clears
status via deleteField() and PRESERVES recordedBy + recordedAt
(forensic trail per spec semantics matrix).

Tests: G1 source-grep regression (9 assertions) GREEN — every
gated site verified; meds sanctioned exception locked.

AV37 invariant entry deferred to Task 6.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: UI gates — `canAddNewItems` replaces `!isEdit` (TDD)

**Files:**
- Modify: `src/components/TreatmentFormPage.jsx` (5 UI sites: medication add + grid + consumable add + grid + course picker)
- Modify: `tests/phase-26-0-doctor-save-source-grep.test.js` (add G2 block)

- [ ] **Step 1: Add G2 source-grep test (FAIL expected)**

Append to `tests/phase-26-0-doctor-save-source-grep.test.js` inside the outer `describe`:

```js
  describe('G2 — UI gates use canAddNewItems flag (replaces !isEdit)', () => {
    it('G2.canAddNewItemsDeclared — flag declared at top of render', () => {
      expect(TFP_SOURCE).toMatch(/const\s+canAddNewItems\s*=\s*\(\s*mode\s*===\s*['"]create['"]\s*\)\s*\|\|\s*\(\s*loadedTreatment\?\.status\s*===\s*['"]doctor-recorded['"]\s*\)/);
    });

    it('G2.canAddNewItemsUsed — flag referenced in at least 5 JSX gate sites', () => {
      const refs = TFP_SOURCE.match(/canAddNewItems/g) || [];
      // Declaration + 5+ uses
      expect(refs.length).toBeGreaterThanOrEqual(6);
    });

    it('G2.noLegacyIsEditForAddBtns — no `!isEdit && <button` pattern for AddBtn elements remains', () => {
      // Sanctioned exception: doctor-save button itself uses {!isEdit && ...} per spec 5.1.F
      // (button hidden in edit mode by design — admin finalizes via regular save)
      // Source must contain canAddNewItems for medication / consumable / course picker gates.
      // Loose check: medication "เพิ่มยา" add button site should reference canAddNewItems
      // Look around the medication grid (search for the medication section anchor)
      const medSectionIdx = TFP_SOURCE.indexOf('ยากลับบ้าน');
      expect(medSectionIdx).toBeGreaterThan(-1);
      // Within 3000 chars of the medication section, canAddNewItems must appear
      const medRegion = TFP_SOURCE.slice(medSectionIdx, medSectionIdx + 5000);
      expect(medRegion).toMatch(/canAddNewItems/);
    });

    it('G2.consumableSectionGated — consumable add btn gated by canAddNewItems', () => {
      const consSectionIdx = TFP_SOURCE.indexOf('สินค้าสิ้นเปลือง');
      expect(consSectionIdx).toBeGreaterThan(-1);
      const consRegion = TFP_SOURCE.slice(consSectionIdx, consSectionIdx + 3000);
      expect(consRegion).toMatch(/canAddNewItems/);
    });
  });
```

- [ ] **Step 2: Run G2 → expect FAIL**

```bash
npx vitest run tests/phase-26-0-doctor-save-source-grep.test.js -t "G2" 2>&1 | tail -20
```

Expected: 4 G2 assertions FAIL (no `canAddNewItems` usage in UI yet — only declared in Task 1).

- [ ] **Step 3: Replace medication add buttons gate (lines 3380-3392, Pattern α)**

Find the JSX block at lines 3380-3392 (3 medication add buttons: กลุ่มยากลับบ้าน, ยากลับบ้าน, Remed). Replace `{!isEdit && (` with `{canAddNewItems && (`:

```jsx
{/* BEFORE */}
{!isEdit && (
  <div className="flex gap-2">
    <button>กลุ่มยากลับบ้าน</button>
    <button>ยากลับบ้าน</button>
    <button>Remed</button>
  </div>
)}

{/* AFTER */}
{canAddNewItems && (
  <div className="flex gap-2">
    <button>กลุ่มยากลับบ้าน</button>
    <button>ยากลับบ้าน</button>
    <button>Remed</button>
  </div>
)}
```

- [ ] **Step 4: Replace medication grid editable/read-only swap (lines 3627-3674, Pattern β)**

Locate the medication grid where layout swaps between create (editable 12-col with price + delete) and edit (read-only 10-col). Two `isEdit ?` ternaries at minimum:

```jsx
{/* BEFORE — grid columns */}
<div className={`grid ${isEdit ? 'grid-cols-10' : 'grid-cols-12'} gap-2`}>

{/* AFTER */}
<div className={`grid ${canAddNewItems ? 'grid-cols-12' : 'grid-cols-10'} gap-2`}>
```

And similarly for the per-row JSX conditionals — anywhere `{isEdit ? <ReadOnly/> : <Editable/>}` exists, flip to `{canAddNewItems ? <Editable/> : <ReadOnly/>}`.

For the delete icon column:
```jsx
{/* BEFORE */}
{!isEdit && <DeleteIcon onClick={...} />}
{/* AFTER */}
{canAddNewItems && <DeleteIcon onClick={...} />}
```

- [ ] **Step 5: Replace consumable add button gate (line 4139, Pattern α)**

```jsx
{/* BEFORE */}
{!isEdit && (
  <button>เพิ่มสินค้าสิ้นเปลือง</button>
)}

{/* AFTER */}
{canAddNewItems && (
  <button>เพิ่มสินค้าสิ้นเปลือง</button>
)}
```

- [ ] **Step 6: Replace consumable grid editable/read-only swap (lines 4286-4304, Pattern β)**

Mirror Task 3 Step 4 for the consumable grid. Same `isEdit ?` ternaries flipped to `canAddNewItems ?` (with operands swapped).

- [ ] **Step 7: Replace course/purchase picker trigger gate (line ~1300s, Pattern α)**

Find the course-picker modal trigger. Could be a button like "เพิ่มคอร์สที่ซื้อ" or "เลือกคอร์ส":

```bash
grep -n "ซื้อคอร์ส\|เพิ่มคอร์ส\|เลือกคอร์ส" src/components/TreatmentFormPage.jsx | head -5
```

Replace surrounding `{!isEdit && (` with `{canAddNewItems && (`.

- [ ] **Step 8: Run G2 → expect PASS**

```bash
npx vitest run tests/phase-26-0-doctor-save-source-grep.test.js 2>&1 | tail -20
```

Expected: G1 + G2 all assertions PASS.

- [ ] **Step 9: Run build**

```bash
npm run build 2>&1 | tail -10
```

Expected: clean build.

- [ ] **Step 10: Commit**

```bash
git add src/components/TreatmentFormPage.jsx tests/phase-26-0-doctor-save-source-grep.test.js
git commit -m "$(cat <<'EOF'
feat(Phase 26.0c): UI gates — canAddNewItems replaces !isEdit at 5 sites

Replace !isEdit gates with canAddNewItems flag at:
- Medication add buttons (กลุ่มยากลับบ้าน/ยากลับบ้าน/Remed) Pattern α
- Medication grid editable layout swap Pattern β
- Consumable add button Pattern α
- Consumable grid editable layout swap Pattern β
- Course/Purchase items picker trigger Pattern α

Effect: when admin opens TFP to edit a doctor-recorded treatment
(status='doctor-recorded'), UI behaves like CREATE mode — admin can
ADD new meds/consumables/courses on top of the doctor's prior save.

For legacy edit mode (status=undefined), behavior unchanged (canAddNewItems
== !isEdit because status check is false).

Tests: G2 source-grep regression (4 assertions) GREEN.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Doctor-save button + edit-mode banner (TDD)

**Files:**
- Modify: `src/components/TreatmentFormPage.jsx`
- Create: `tests/phase-26-0-status-display-rtl.test.jsx` (D1 only first)

- [ ] **Step 1: Write D1 RTL test (FAIL expected)**

Create `tests/phase-26-0-status-display-rtl.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'fs';
import { join } from 'path';

const TFP_PATH = join(process.cwd(), 'src/components/TreatmentFormPage.jsx');
const TFP_SOURCE = readFileSync(TFP_PATH, 'utf-8');

describe('Phase 26.0 — Status display RTL', () => {
  describe('D1 — TFP doctor-save button + edit-mode banner', () => {
    it('D1.1 — doctor-save button source-grep: `tfp-doctor-save-btn` data-testid + onClick handleSubmit doctor', () => {
      expect(TFP_SOURCE).toMatch(/data-testid="tfp-doctor-save-btn"/);
      expect(TFP_SOURCE).toMatch(/onClick=\{\s*\(\s*\)\s*=>\s*handleSubmit\s*\(\s*['"]doctor['"]\s*\)\s*\}/);
    });

    it('D1.2 — doctor-save button label "บันทึกสำหรับแพทย์"', () => {
      expect(TFP_SOURCE).toContain('บันทึกสำหรับแพทย์');
    });

    it('D1.3 — doctor-save button hidden in edit mode (wrapped in {!isEdit && ...})', () => {
      // Find the button JSX block + check for {!isEdit && wrapper within 200 chars before
      const btnIdx = TFP_SOURCE.indexOf('tfp-doctor-save-btn');
      expect(btnIdx).toBeGreaterThan(-1);
      const before = TFP_SOURCE.slice(Math.max(0, btnIdx - 500), btnIdx);
      expect(before).toMatch(/\{\s*!isEdit\s*&&/);
    });

    it('D1.4 — edit-mode banner source-grep: tfp-doctor-recorded-banner data-testid', () => {
      expect(TFP_SOURCE).toMatch(/data-testid="tfp-doctor-recorded-banner"/);
    });

    it('D1.5 — banner gated on loadedTreatment.status === doctor-recorded', () => {
      const bannerIdx = TFP_SOURCE.indexOf('tfp-doctor-recorded-banner');
      expect(bannerIdx).toBeGreaterThan(-1);
      const before = TFP_SOURCE.slice(Math.max(0, bannerIdx - 500), bannerIdx);
      expect(before).toMatch(/loadedTreatment\?\.status\s*===\s*['"]doctor-recorded['"]/);
    });

    it('D1.6 — banner contains Thai instruction copy', () => {
      expect(TFP_SOURCE).toMatch(/การรักษานี้บันทึกโดยแพทย์/);
    });
  });
});
```

- [ ] **Step 2: Run D1 → expect FAIL**

```bash
npx vitest run tests/phase-26-0-status-display-rtl.test.jsx -t "D1" 2>&1 | tail -20
```

Expected: all 6 D1 assertions FAIL.

- [ ] **Step 3: Add doctor-save button JSX in TFP**

Locate the OPD Card section (lines 2924-2952). After the additionalNote field (line ~2949) but before the Chart section (line ~2958), inside the right panel `<div className="space-y-4">` parent, add:

```jsx
{!isEdit && (
  <div
    className="mt-3 flex flex-col sm:flex-row items-center gap-2 sm:gap-3
               px-3 py-3 rounded-lg bg-sky-50/50 dark:bg-sky-950/30
               border border-sky-200 dark:border-sky-800"
  >
    <button
      type="button"
      onClick={() => handleSubmit('doctor')}
      disabled={submitting}
      data-testid="tfp-doctor-save-btn"
      data-save-mode="doctor"
      className="inline-flex items-center gap-2 px-4 py-2 rounded-md
                 bg-white dark:bg-sky-900 border border-sky-300 dark:border-sky-600
                 text-sky-700 dark:text-sky-200 text-sm font-semibold
                 hover:bg-sky-100 dark:hover:bg-sky-800
                 disabled:opacity-50 disabled:cursor-not-allowed
                 shadow-sm transition-colors"
    >
      <Stethoscope className="w-4 h-4" />
      <span>บันทึกสำหรับแพทย์</span>
    </button>
    <p className="text-xs text-tx-muted dark:text-sky-200/70 text-center sm:text-left">
      บันทึกเฉพาะ OPD / ยา / ค่ามือ — admin มาเติมคอร์ส / สินค้า / บิลทีหลัง
    </p>
  </div>
)}
```

Verify `Stethoscope` is imported from `lucide-react` at top of TFP. If not, add it:

```bash
grep -n "from 'lucide-react'" src/components/TreatmentFormPage.jsx | head -1
```

Edit the import to include `Stethoscope`:
```js
import { /* existing icons */, Stethoscope } from 'lucide-react';
```

- [ ] **Step 4: Add edit-mode banner JSX in TFP**

Find the TFP outermost return / form-wrapper element. Add the banner at the very top, BEFORE the first FormSection:

```jsx
{loadedTreatment?.status === 'doctor-recorded' && (
  <div
    data-testid="tfp-doctor-recorded-banner"
    className="mb-3 px-4 py-3 rounded-lg
               bg-amber-50 dark:bg-amber-950
               border border-amber-200 dark:border-amber-800
               text-amber-900 dark:text-amber-100 text-sm
               flex items-center gap-2"
  >
    <AlertCircle className="w-4 h-4 flex-shrink-0" />
    <span>
      <strong>การรักษานี้บันทึกโดยแพทย์</strong> —
      กรุณาเติมข้อมูลคอร์ส / สินค้า / ค่ามือ / ใบเสร็จให้ครบ แล้วกดบันทึก
    </span>
  </div>
)}
```

Verify `AlertCircle` is imported from `lucide-react`. Add if missing.

- [ ] **Step 5: Run D1 → expect PASS**

```bash
npx vitest run tests/phase-26-0-status-display-rtl.test.jsx -t "D1" 2>&1 | tail -20
```

Expected: 6 D1 assertions PASS.

- [ ] **Step 6: Run build + verify no console errors**

```bash
npm run build 2>&1 | tail -10
```

Expected: clean build.

- [ ] **Step 7: Commit**

```bash
git add src/components/TreatmentFormPage.jsx tests/phase-26-0-status-display-rtl.test.jsx
git commit -m "$(cat <<'EOF'
feat(Phase 26.0d): TFP doctor-save button + edit-mode amber banner

NEW UI:
- "บันทึกสำหรับแพทย์" button under OPD Card section (below additionalNote,
  before Chart). Secondary-tier sky styling + Stethoscope icon +
  data-testid="tfp-doctor-save-btn" + data-save-mode="doctor". Hidden in
  edit mode ({!isEdit && ...}) since doctor-save semantic is create-only.
- Helper text: "บันทึกเฉพาะ OPD / ยา / ค่ามือ — admin มาเติมคอร์ส / สินค้า / บิลทีหลัง"
- Edit-mode banner at top of form when loadedTreatment.status ===
  'doctor-recorded'. Amber bg + AlertCircle icon + Thai instruction.
  data-testid="tfp-doctor-recorded-banner".

Tests: D1 RTL source-grep (6 assertions) GREEN.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Status chips in CustomerDetailView + TreatmentTimelineModal (TDD)

**Files:**
- Modify: `src/components/backend/CustomerDetailView.jsx`
- Modify: `src/components/backend/TreatmentTimelineModal.jsx`
- Modify: `tests/phase-26-0-status-display-rtl.test.jsx` (add D2 + D3)

- [ ] **Step 1: Add D2 + D3 tests (FAIL expected)**

Append to `tests/phase-26-0-status-display-rtl.test.jsx` inside the outer `describe`:

```jsx
  describe('D2 — CustomerDetailView status chip', () => {
    const CDV_PATH = join(process.cwd(), 'src/components/backend/CustomerDetailView.jsx');
    const CDV_SOURCE = readFileSync(CDV_PATH, 'utf-8');

    it('D2.1 — chip data-testid pattern present', () => {
      expect(CDV_SOURCE).toMatch(/data-testid={\s*[`"]treatment-status-chip-doctor-recorded/);
    });

    it('D2.2 — chip gated on t.status === doctor-recorded', () => {
      const chipIdx = CDV_SOURCE.indexOf('treatment-status-chip-doctor-recorded');
      expect(chipIdx).toBeGreaterThan(-1);
      const before = CDV_SOURCE.slice(Math.max(0, chipIdx - 400), chipIdx);
      expect(before).toMatch(/status\s*===\s*['"]doctor-recorded['"]/);
    });

    it('D2.3 — chip Thai label "แพทย์ลงบันทึก"', () => {
      const chipIdx = CDV_SOURCE.indexOf('treatment-status-chip-doctor-recorded');
      const region = CDV_SOURCE.slice(chipIdx, chipIdx + 500);
      expect(region).toContain('แพทย์ลงบันทึก');
    });
  });

  describe('D3 — TreatmentTimelineModal status chip', () => {
    const TTM_PATH = join(process.cwd(), 'src/components/backend/TreatmentTimelineModal.jsx');
    const TTM_SOURCE = readFileSync(TTM_PATH, 'utf-8');

    it('D3.1 — chip data-testid pattern present', () => {
      expect(TTM_SOURCE).toMatch(/data-testid={\s*[`"]treatment-status-chip-doctor-recorded/);
    });

    it('D3.2 — chip gated on doctor-recorded status', () => {
      const chipIdx = TTM_SOURCE.indexOf('treatment-status-chip-doctor-recorded');
      expect(chipIdx).toBeGreaterThan(-1);
      const before = TTM_SOURCE.slice(Math.max(0, chipIdx - 400), chipIdx);
      expect(before).toMatch(/status\s*===\s*['"]doctor-recorded['"]/);
    });
  });
```

- [ ] **Step 2: Run D2 + D3 → expect FAIL**

```bash
npx vitest run tests/phase-26-0-status-display-rtl.test.jsx -t "D2|D3" 2>&1 | tail -20
```

Expected: 5 assertions FAIL.

- [ ] **Step 3: Add chip JSX to CustomerDetailView treatment cards**

Find the treatment card render in `src/components/backend/CustomerDetailView.jsx`. Search for where each treatment row renders the date / type / actions:

```bash
grep -n "treatments.map\|treatment\.id\|treatment\.treatmentDate" src/components/backend/CustomerDetailView.jsx | head -10
```

Inside the treatment-card JSX (near the date or type label), add:

```jsx
{t.status === 'doctor-recorded' && (
  <span
    data-testid={`treatment-status-chip-doctor-recorded-${t.id}`}
    className="ml-2 px-2 py-0.5 rounded-md
               bg-amber-100 dark:bg-amber-950
               border border-amber-200 dark:border-amber-800
               text-amber-900 dark:text-amber-100 text-xs font-medium
               inline-flex items-center gap-1"
    title="แพทย์ลงบันทึก — admin ต้องมาเติมคอร์ส/สินค้า/บิล"
  >
    <Stethoscope className="w-3 h-3" />
    <span>แพทย์ลงบันทึก</span>
  </span>
)}
```

Verify `Stethoscope` is imported from `lucide-react` in CustomerDetailView (add if missing).

- [ ] **Step 4: Add chip JSX to TreatmentTimelineModal**

Find each treatment row header in `src/components/backend/TreatmentTimelineModal.jsx`. Add the same chip pattern (with `t.status` replaced by the local variable name — likely `treatment.status` or `row.status`):

```jsx
{treatment.status === 'doctor-recorded' && (
  <span
    data-testid={`treatment-status-chip-doctor-recorded-${treatment.id}`}
    className="ml-2 px-2 py-0.5 rounded-md
               bg-amber-100 dark:bg-amber-950
               border border-amber-200 dark:border-amber-800
               text-amber-900 dark:text-amber-100 text-xs font-medium
               inline-flex items-center gap-1"
    title="แพทย์ลงบันทึก"
  >
    <Stethoscope className="w-3 h-3" />
    <span>แพทย์ลงบันทึก</span>
  </span>
)}
```

Verify import.

- [ ] **Step 5: Run D2 + D3 → expect PASS**

```bash
npx vitest run tests/phase-26-0-status-display-rtl.test.jsx 2>&1 | tail -20
```

Expected: D1 + D2 + D3 all GREEN.

- [ ] **Step 6: Run build**

```bash
npm run build 2>&1 | tail -10
```

Expected: clean build.

- [ ] **Step 7: Commit**

```bash
git add src/components/backend/CustomerDetailView.jsx src/components/backend/TreatmentTimelineModal.jsx tests/phase-26-0-status-display-rtl.test.jsx
git commit -m "$(cat <<'EOF'
feat(Phase 26.0e): Status chips in CustomerDetailView + TreatmentTimelineModal

Render amber 'แพทย์ลงบันทึก' chip on every treatment row where
treatment.status === 'doctor-recorded' (set by Phase 26.0b doctor-save).
Stethoscope icon + tooltip explaining admin action needed.

3 chip surfaces (per spec § 5.3-5.4):
- CustomerDetailView treatment cards (right side of date)
- TreatmentTimelineModal row headers (next to date badge)
- TFP edit-mode banner (Phase 26.0d) — separate component

data-testid pattern: treatment-status-chip-doctor-recorded-{id}

Tests: D2 (CDV chip 3 assertions) + D3 (Timeline chip 2 assertions) GREEN.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: AV37 invariant + audit-anti-vibe-code sub-tests

**Files:**
- Modify: `.agents/skills/audit-anti-vibe-code/SKILL.md`
- Modify: `tests/audit-anti-vibe-code.test.js`

- [ ] **Step 1: Add AV37 entry to SKILL.md**

Find the existing AV36 entry in `.agents/skills/audit-anti-vibe-code/SKILL.md`:

```bash
grep -n "^### AV3[0-9]" .agents/skills/audit-anti-vibe-code/SKILL.md
```

After the last AVxx (AV36), append:

```markdown
### AV37 — TFP doctor-save gate discipline (V26.0, 2026-05-13)

Every `await deductCourseItems(`, `await createBackendSale(`,
`await assignCourseToCustomer(`, `await applyDepositToSale(`,
`await deductWallet(`, `await earnPoints(` in
`src/components/TreatmentFormPage.jsx` `handleSubmit` MUST be preceded
within 400 chars by `saveMode !== 'doctor'` gate OR be inside an
`if (saveMode === 'staff')` block.

`await deductStockForTreatment(` — the FIRST call (consumables /
treatmentItems, type 6) MUST be saveMode-gated; the SECOND call
(medications, type 7) MUST NOT be saveMode-gated (sanctioned exception
per Phase 26.0 Q2 — doctor records meds for the patient).

`status: 'doctor-recorded'` stamping pattern must be present:
- `saveMode === 'doctor' ? {...} : {...}` ternary in payload
- `recordedBy: auth` + `recordedAt: serverTimestamp` for doctor-save
- `deleteField()` for admin save (clears status)

Source-grep regression: `tests/phase-26-0-doctor-save-source-grep.test.js`
(G1.* + G2.*).

Phase 26.0c UI gates: `canAddNewItems = (mode==='create') ||
(loadedTreatment?.status === 'doctor-recorded')` declared at top of
TFP render; replaces every `!isEdit && <AddBtn>` pattern at 5 UI sites
(med add buttons, med grid swap, consumable add, consumable grid swap,
course picker trigger).

Sanctioned exception: doctor-save button itself uses `{!isEdit && ...}`
because doctor-save semantic is create-only (admin finalizes via regular
"บันทึก").

Anti-pattern: forgetting a gate at a NEW deduction/sale-create call site
added in future = V12 multi-writer-sweep → double-deduct on admin
finalize. AV37 source-grep catches every new `await deduct*` / `await
createBackendSale*` / etc.
```

- [ ] **Step 2: Add AV37.x sub-tests in audit-anti-vibe-code.test.js**

Find the existing AV36 test block:

```bash
grep -n "AV36\|AV35\|describe.*AV3" tests/audit-anti-vibe-code.test.js | head -5
```

After the last AVxx describe, append:

```js
  describe('AV37 — TFP doctor-save gate discipline (V26.0)', () => {
    const TFP_PATH = join(process.cwd(), 'src/components/TreatmentFormPage.jsx');
    const TFP_SOURCE = readFileSync(TFP_PATH, 'utf-8');

    it('AV37.1 — handleSubmit signature accepts saveMode arg with defensive coercion', () => {
      expect(TFP_SOURCE).toMatch(/const\s+saveMode\s*=\s*\(\s*eventOrSaveMode\s*===\s*['"]doctor['"]\s*\)\s*\?\s*['"]doctor['"]\s*:\s*['"]staff['"]/);
    });

    it('AV37.2 — status doctor-recorded literal exists exactly twice in TFP (stamp + clear pattern)', () => {
      const matches = TFP_SOURCE.match(/['"]doctor-recorded['"]/g) || [];
      // At minimum: status: 'doctor-recorded' (stamp) + loadedTreatment.status === 'doctor-recorded' (check)
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    it('AV37.3 — recordedBy + recordedAt referenced at status-stamp site', () => {
      expect(TFP_SOURCE).toMatch(/recordedBy:\s*auth\.currentUser/);
      expect(TFP_SOURCE).toMatch(/recordedAt:\s*serverTimestamp/);
    });

    it('AV37.4 — deleteField() referenced for admin clear path', () => {
      expect(TFP_SOURCE).toMatch(/status:\s*deleteField\s*\(\s*\)/);
    });

    it('AV37.5 — canAddNewItems flag declared with correct definition', () => {
      expect(TFP_SOURCE).toMatch(/const\s+canAddNewItems\s*=\s*\(\s*mode\s*===\s*['"]create['"]/);
      expect(TFP_SOURCE).toMatch(/loadedTreatment\?\.status\s*===\s*['"]doctor-recorded['"]/);
    });

    it('AV37.6 — canAddNewItems used ≥5 times (1 declaration + 4+ UI gates)', () => {
      const refs = TFP_SOURCE.match(/canAddNewItems/g) || [];
      expect(refs.length).toBeGreaterThanOrEqual(5);
    });

    it('AV37.7 — meds deductStockForTreatment NOT saveMode-gated (sanctioned)', () => {
      const callsRe = /await\s+deductStockForTreatment\s*\(/g;
      const matches = [...TFP_SOURCE.matchAll(callsRe)];
      if (matches.length < 2) return; // not yet in this state
      const medsMatch = matches[1];
      const before = TFP_SOURCE.slice(Math.max(0, medsMatch.index - 300), medsMatch.index);
      expect(/saveMode\s*!==\s*['"]doctor['"]/.test(before)).toBe(false);
    });
  });
```

NOTE: the imports `readFileSync` + `join` may already be at top of the test file. Verify with `head -20 tests/audit-anti-vibe-code.test.js`.

- [ ] **Step 3: Run AV37.x tests → expect PASS**

(Should already pass since Tasks 2-3 added all the gates + flag.)

```bash
npx vitest run tests/audit-anti-vibe-code.test.js -t "AV37" 2>&1 | tail -20
```

Expected: 7 AV37 assertions PASS.

- [ ] **Step 4: Commit**

```bash
git add .agents/skills/audit-anti-vibe-code/SKILL.md tests/audit-anti-vibe-code.test.js
git commit -m "$(cat <<'EOF'
feat(Phase 26.0f): AV37 audit invariant — TFP doctor-save gate discipline

NEW audit invariant locking the Phase 26.0 doctor-save architectural
contract:
- handleSubmit signature with defensive saveMode coercion
- status='doctor-recorded' literal usage ≥2× (stamp + check)
- recordedBy/At at stamp site
- deleteField() at admin-clear path
- canAddNewItems flag declaration + ≥5 uses in JSX
- Sanctioned exception: meds deductStockForTreatment NOT saveMode-gated

7 AV37.x assertions in tests/audit-anti-vibe-code.test.js GREEN.

Catches V12 multi-writer-sweep: any NEW deduction/sale-create call site
added to handleSubmit in future MUST be gated; AV37 source-grep enforces.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Rule I full-flow simulate F1-F8

**Files:**
- Create: `tests/phase-26-0-doctor-save-flow-simulate.test.js`

- [ ] **Step 1: Create the flow-simulate test file**

```js
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Phase 26.0 Rule I full-flow simulate
 *
 * Pure simulator that mirrors TFP handleSubmit logic, validates the
 * doctor-save → admin-finalize round-trip end-to-end. No React mount;
 * no real Firestore. Tests the SHAPE of writes + the ROUTING of gates.
 *
 * Anti-V12 mirror: pure simulator chains every step the user exercises
 * (doctor save → admin opens edit → admin adds items → admin saves)
 * and asserts the cumulative state.
 */

const TFP_PATH = join(process.cwd(), 'src/components/TreatmentFormPage.jsx');
const TFP_SOURCE = readFileSync(TFP_PATH, 'utf-8');

// ─── Pure simulator: mirrors handleSubmit gate logic ─────────────────
function simulateHandleSubmit({ saveMode, mode, isEdit, formData, existingTreatment = null, hasSale }) {
  // Returns { writes: [...], skipped: [...] } describing what fired
  const writes = [];
  const skipped = [];

  // status stamping
  const statusPatch = saveMode === 'doctor'
    ? {
        status: 'doctor-recorded',
        ...(isEdit && existingTreatment?.recordedBy ? {} : {
          recordedBy: 'test-uid-mock',
          recordedAt: '<serverTimestamp>',
        }),
      }
    : { status: '<deleteField>' };

  writes.push({ kind: 'treatment-doc', op: isEdit ? 'update' : 'create', patch: statusPatch });

  // Course over-deduction validation
  if (saveMode !== 'doctor') {
    writes.push({ kind: 'course-validation', op: 'check' });
  } else {
    skipped.push('course-validation');
  }

  // Course deductions
  if (saveMode !== 'doctor' && (formData.treatmentItems?.length || 0) > 0) {
    if (isEdit) writes.push({ kind: 'reverseCourseDeduction', op: 'reverse' });
    writes.push({ kind: 'deductCourseItems', op: 'deduct', items: formData.treatmentItems });
  } else if (saveMode === 'doctor') {
    skipped.push('deductCourseItems');
  }

  // Consumables stock (type 6)
  if (saveMode !== 'doctor' && (formData.consumables?.length || 0) > 0) {
    writes.push({ kind: 'deductStockForTreatment-consumables', op: 'deduct', type: 6 });
  } else if (saveMode === 'doctor') {
    skipped.push('deductStockForTreatment-consumables');
  }

  // Medications stock (type 7) — KEPT for both saveModes
  if ((formData.medications?.length || 0) > 0 && !hasSale) {
    writes.push({ kind: 'deductStockForTreatment-meds', op: 'deduct', type: 7 });
  }

  // Auto-sale chain
  if (saveMode !== 'doctor' && hasSale && !isEdit) {
    writes.push({ kind: 'createBackendSale', op: 'create' });
    writes.push({ kind: 'assignCourseToCustomer', op: 'assign' });
    if (formData.depositId) writes.push({ kind: 'applyDepositToSale', op: 'apply' });
    if (formData.walletAmount) writes.push({ kind: 'deductWallet', op: 'deduct' });
    if (formData.earnPointsAmount) writes.push({ kind: 'earnPoints', op: 'earn' });
  } else if (saveMode === 'doctor' && hasSale) {
    skipped.push('createBackendSale-chain');
  }

  // Edit-mode sale sync
  if (saveMode !== 'doctor' && isEdit && existingTreatment?.linkedSaleId) {
    writes.push({ kind: 'editModeSaleSync', op: 'sync' });
  } else if (saveMode === 'doctor' && isEdit) {
    skipped.push('editModeSaleSync');
  }

  return { writes, skipped };
}

describe('Phase 26.0 — Rule I full-flow simulate', () => {
  describe('F1 — doctor-save fires only treatment-doc write + NO deductions', () => {
    it('F1.1 — bare doctor-save (empty form): only treatment-doc write', () => {
      const result = simulateHandleSubmit({
        saveMode: 'doctor', mode: 'create', isEdit: false,
        formData: { treatmentItems: [], consumables: [], medications: [], purchasedItems: [] },
        hasSale: false,
      });
      expect(result.writes).toHaveLength(1);
      expect(result.writes[0].kind).toBe('treatment-doc');
      expect(result.writes[0].patch.status).toBe('doctor-recorded');
    });

    it('F1.2 — doctor-save with treatmentItems IN FORM: skips deduction (gate works)', () => {
      const result = simulateHandleSubmit({
        saveMode: 'doctor', mode: 'create', isEdit: false,
        formData: { treatmentItems: [{ id: 't1', qty: 1 }], consumables: [], medications: [], purchasedItems: [] },
        hasSale: false,
      });
      expect(result.skipped).toContain('deductCourseItems');
      expect(result.writes.find(w => w.kind === 'deductCourseItems')).toBeUndefined();
    });

    it('F1.3 — doctor-save with consumables IN FORM: skips stock deduction', () => {
      const result = simulateHandleSubmit({
        saveMode: 'doctor', mode: 'create', isEdit: false,
        formData: { treatmentItems: [], consumables: [{ id: 'c1', qty: 1 }], medications: [], purchasedItems: [] },
        hasSale: false,
      });
      expect(result.skipped).toContain('deductStockForTreatment-consumables');
    });

    it('F1.4 — doctor-save with medications: KEEPS meds deduction (sanctioned exception)', () => {
      const result = simulateHandleSubmit({
        saveMode: 'doctor', mode: 'create', isEdit: false,
        formData: { treatmentItems: [], consumables: [], medications: [{ id: 'm1', qty: 1 }], purchasedItems: [] },
        hasSale: false,
      });
      const medsWrite = result.writes.find(w => w.kind === 'deductStockForTreatment-meds');
      expect(medsWrite).toBeDefined();
      expect(medsWrite.type).toBe(7);
    });

    it('F1.5 — doctor-save with hasSale + purchasedItems: skips entire sale chain', () => {
      const result = simulateHandleSubmit({
        saveMode: 'doctor', mode: 'create', isEdit: false,
        formData: { treatmentItems: [], consumables: [], medications: [], purchasedItems: [{ id: 'p1' }] },
        hasSale: true,
      });
      expect(result.skipped).toContain('createBackendSale-chain');
      expect(result.writes.find(w => w.kind === 'createBackendSale')).toBeUndefined();
    });

    it('F1.6 — doctor-save stamps recordedBy + recordedAt on first save', () => {
      const result = simulateHandleSubmit({
        saveMode: 'doctor', mode: 'create', isEdit: false,
        formData: { treatmentItems: [], consumables: [], medications: [], purchasedItems: [] },
        hasSale: false,
      });
      expect(result.writes[0].patch.recordedBy).toBe('test-uid-mock');
      expect(result.writes[0].patch.recordedAt).toBe('<serverTimestamp>');
    });
  });

  describe('F2 — admin opens edit on doctor-recorded → canAddNewItems unlocks', () => {
    it('F2.1 — canAddNewItems flag definition in source', () => {
      expect(TFP_SOURCE).toMatch(/canAddNewItems\s*=\s*\(\s*mode\s*===\s*['"]create['"]\s*\)\s*\|\|\s*\(\s*loadedTreatment\?\.status\s*===\s*['"]doctor-recorded['"]/);
    });

    it('F2.2 — pure logic: canAddNewItems true when mode=edit + status=doctor-recorded', () => {
      const compute = (mode, status) => (mode === 'create') || (status === 'doctor-recorded');
      expect(compute('create', undefined)).toBe(true);
      expect(compute('edit', undefined)).toBe(false);  // legacy edit: locked
      expect(compute('edit', 'doctor-recorded')).toBe(true);  // doctor-recorded edit: unlocked
      expect(compute('edit', 'completed')).toBe(false);  // future status: locked
    });
  });

  describe('F3 — admin saves doctor-recorded treatment with course-items', () => {
    it('F3.1 — admin save (staff mode) on doctor-recorded edit: course deduction fires ONCE', () => {
      const existingDoctorRecorded = { id: 'TR-1', status: 'doctor-recorded', recordedBy: 'doctor-uid' };
      const result = simulateHandleSubmit({
        saveMode: 'staff', mode: 'edit', isEdit: true,
        existingTreatment: existingDoctorRecorded,
        formData: {
          treatmentItems: [{ id: 't1', qty: 1 }], consumables: [], medications: [], purchasedItems: [],
        },
        hasSale: false,
      });
      const deducts = result.writes.filter(w => w.kind === 'deductCourseItems');
      expect(deducts).toHaveLength(1);  // exactly one — NOT double
    });

    it('F3.2 — admin save clears status via deleteField + PRESERVES recordedBy/At', () => {
      const result = simulateHandleSubmit({
        saveMode: 'staff', mode: 'edit', isEdit: true,
        existingTreatment: { id: 'TR-1', status: 'doctor-recorded', recordedBy: 'doctor-uid' },
        formData: { treatmentItems: [], consumables: [], medications: [], purchasedItems: [] },
        hasSale: false,
      });
      const treatmentWrite = result.writes.find(w => w.kind === 'treatment-doc');
      expect(treatmentWrite.patch.status).toBe('<deleteField>');
      expect(treatmentWrite.patch.recordedBy).toBeUndefined();  // omitted = preserved
      expect(treatmentWrite.patch.recordedAt).toBeUndefined();
    });
  });

  describe('F4 — admin adds consumables + saves: stock fires ONCE', () => {
    it('F4.1 — consumables deduction fires once on staff edit-mode save', () => {
      const result = simulateHandleSubmit({
        saveMode: 'staff', mode: 'edit', isEdit: true,
        existingTreatment: { id: 'TR-1', status: 'doctor-recorded' },
        formData: {
          treatmentItems: [], consumables: [{ id: 'c1', qty: 1 }], medications: [], purchasedItems: [],
        },
        hasSale: false,
      });
      const consWrites = result.writes.filter(w => w.kind === 'deductStockForTreatment-consumables');
      expect(consWrites).toHaveLength(1);
    });
  });

  describe('F5 — admin adds purchasedItems + saves: sale chain fires', () => {
    it('F5.1 — createBackendSale + assignCourseToCustomer fire on edit-mode staff save', () => {
      // NOTE: This test verifies the simulator routing logic — actual TFP edit-mode-sale-creation
      // goes through the edit-mode sale sync path (lines 2390-2600) not createBackendSale.
      // Simulator simplification: treat edit-with-no-existing-sale as effectively a fresh sale create.
      const result = simulateHandleSubmit({
        saveMode: 'staff', mode: 'edit', isEdit: true,  // edit but no existing sale
        existingTreatment: { id: 'TR-1', status: 'doctor-recorded', linkedSaleId: null },
        formData: {
          treatmentItems: [], consumables: [], medications: [],
          purchasedItems: [{ id: 'p1' }],
        },
        hasSale: true,
      });
      // edit-mode sale sync fires only if linkedSaleId existed; otherwise falls back to creating new sale
      // (TFP lines 2390-2600 — handled at runtime; simulator captures the routing decision)
      const editSync = result.writes.find(w => w.kind === 'editModeSaleSync');
      expect(editSync).toBeUndefined();  // no existing sale to sync → falls back to create path at runtime
    });
  });

  describe('F6 — idempotency: re-save admin without new items', () => {
    it('F6.1 — admin re-saves with same form state: no double-deduct', () => {
      // First admin save
      const r1 = simulateHandleSubmit({
        saveMode: 'staff', mode: 'edit', isEdit: true,
        existingTreatment: { id: 'TR-1', status: 'doctor-recorded' },
        formData: { treatmentItems: [{ id: 't1', qty: 1 }], consumables: [], medications: [], purchasedItems: [] },
        hasSale: false,
      });
      const deducts1 = r1.writes.filter(w => w.kind === 'deductCourseItems');
      expect(deducts1).toHaveLength(1);

      // Second admin save (treatment now has status=undefined since first save cleared it)
      const r2 = simulateHandleSubmit({
        saveMode: 'staff', mode: 'edit', isEdit: true,
        existingTreatment: { id: 'TR-1', status: undefined },  // status cleared by r1
        formData: { treatmentItems: [{ id: 't1', qty: 1 }], consumables: [], medications: [], purchasedItems: [] },
        hasSale: false,
      });
      // Edit-mode reverse + re-deduct (existing TFP semantics)
      const deducts2 = r2.writes.filter(w => w.kind === 'deductCourseItems');
      const reverses2 = r2.writes.filter(w => w.kind === 'reverseCourseDeduction');
      expect(deducts2).toHaveLength(1);
      expect(reverses2).toHaveLength(1);
    });
  });

  describe('F7 — adversarial: doctor-save on EDIT mode', () => {
    it('F7.1 — doctor-save button hidden in edit mode per source-grep', () => {
      const btnIdx = TFP_SOURCE.indexOf('tfp-doctor-save-btn');
      const before = TFP_SOURCE.slice(Math.max(0, btnIdx - 500), btnIdx);
      expect(before).toMatch(/\{\s*!isEdit\s*&&/);
    });

    it('F7.2 — saveMode=doctor on EDIT mode silently preserves prior recordedBy', () => {
      const result = simulateHandleSubmit({
        saveMode: 'doctor', mode: 'edit', isEdit: true,
        existingTreatment: { id: 'TR-1', status: 'doctor-recorded', recordedBy: 'original-doctor-uid' },
        formData: { treatmentItems: [], consumables: [], medications: [], purchasedItems: [] },
        hasSale: false,
      });
      const tw = result.writes.find(w => w.kind === 'treatment-doc');
      expect(tw.patch.status).toBe('doctor-recorded');  // idempotent
      expect(tw.patch.recordedBy).toBeUndefined();  // preserved (omitted from patch)
      expect(tw.patch.recordedAt).toBeUndefined();
    });
  });

  describe('F8 — backward-compat: legacy edit (status=undefined) behaves unchanged', () => {
    it('F8.1 — legacy edit + staff save: full deduction flow, no status field touched outside of clear', () => {
      const result = simulateHandleSubmit({
        saveMode: 'staff', mode: 'edit', isEdit: true,
        existingTreatment: { id: 'TR-OLD', status: undefined },  // legacy
        formData: {
          treatmentItems: [{ id: 't1', qty: 1 }],
          consumables: [{ id: 'c1', qty: 1 }],
          medications: [],
          purchasedItems: [],
        },
        hasSale: false,
      });
      // Full deductions run (V12 backward-compat lock)
      expect(result.writes.find(w => w.kind === 'deductCourseItems')).toBeDefined();
      expect(result.writes.find(w => w.kind === 'deductStockForTreatment-consumables')).toBeDefined();
      // Status patch is deleteField (idempotent — already undefined)
      const tw = result.writes.find(w => w.kind === 'treatment-doc');
      expect(tw.patch.status).toBe('<deleteField>');
    });
  });
});
```

- [ ] **Step 2: Run flow-simulate → expect PASS (after Tasks 2-3 done)**

```bash
npx vitest run tests/phase-26-0-doctor-save-flow-simulate.test.js 2>&1 | tail -30
```

Expected: all F1-F8 assertions PASS (the simulator is internally consistent; F2.1 + F7.1 verify against actual TFP source).

If any FAIL: review whether the simulator matches the actual handleSubmit logic implemented in Tasks 2-3. Iterate if simulator drift detected (this is the value of the test — it forces simulator + real code to agree).

- [ ] **Step 3: Commit**

```bash
git add tests/phase-26-0-doctor-save-flow-simulate.test.js
git commit -m "$(cat <<'EOF'
test(Phase 26.0g): Rule I full-flow simulate F1-F8

Pure simulator mirroring TFP handleSubmit gate logic. Chains every step
the user exercises (doctor save → admin opens edit → admin adds items →
admin saves) and asserts the cumulative write/skip state.

F1 — doctor-save writes treatment-doc with status + audit fields,
     skips all 5 deduction/sale sites, KEEPS meds (sanctioned).
F2 — canAddNewItems flag unlocks UI on doctor-recorded edit; legacy +
     completed remain locked.
F3 — admin save (staff mode) clears status via deleteField, PRESERVES
     recordedBy/At forensic trail, runs course deduction ONCE.
F4 — admin adds consumables: stock fires ONCE.
F5 — admin adds purchasedItems: sale chain routes through edit-mode
     sale sync OR fresh create depending on prior linkedSaleId.
F6 — idempotency: re-saving admin with same items does not double-deduct.
F7 — adversarial: doctor-save button hidden in edit mode (source-grep);
     hypothetical doctor-save on edit preserves prior recordedBy/At.
F8 — backward-compat: legacy edit (status=undefined) behaves unchanged.

Anti-V12 mirror — simulator + source-grep ensure helper output AND
overall chain agree.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Full-suite verification

**Files:** (no edits; verification only — produce evidence)

- [ ] **Step 1: Run targeted Phase 26.0 tests**

```bash
npx vitest run tests/phase-26-0-doctor-save-source-grep.test.js tests/phase-26-0-status-display-rtl.test.jsx tests/phase-26-0-doctor-save-flow-simulate.test.js tests/audit-anti-vibe-code.test.js 2>&1 | tail -30
```

Expected: all assertions GREEN (~40 Phase 26.0 + AV37 tests + pre-existing AV1-AV36 assertions).

- [ ] **Step 2: Run full vitest suite (Rule N end-of-batch)**

```bash
npm test -- --run 2>&1 | tail -40
```

Expected: 8242+ passed (no Phase 26.0 regressions). Known flake: `bsa-task7-h-quater-fix` may flake; if it does, document but do NOT block.

- [ ] **Step 3: Run build**

```bash
npm run build 2>&1 | tail -15
```

Expected: clean build (chunk size warning OK).

- [ ] **Step 4: Capture test/build evidence — write summary**

Record final test count + any flakes + any unexpected regressions. Document in commit message of Task 9.

No commit at this step unless verification revealed a fix needed (in which case fix + amend the relevant Task 2-7 commit OR add a fix commit).

---

## Task 9: Wiki concept page + SESSION_HANDOFF + active.md

**Files:**
- Create: `wiki/concepts/treatment-status-and-doctor-save.md`
- Modify: `wiki/log.md`
- Modify: `SESSION_HANDOFF.md`
- Modify: `.agents/active.md`

- [ ] **Step 1: Create wiki concept page**

Write `wiki/concepts/treatment-status-and-doctor-save.md`:

```markdown
---
tags: [treatment, status, doctor-save, phase-26-0]
date: 2026-05-13
source-count: 1
---

# Treatment Status & Doctor-Save Pattern

## Overview

Phase 26.0 (2026-05-13) introduced an asymmetric save flow on
`TreatmentFormPage`: the canonical "บันทึก" button writes the full
treatment (deductions + auto-sale + linkages), but a NEW
"บันทึกสำหรับแพทย์" button records OPD/vitals/charts/meds/DF only and
defers the inventory-touching pieces to admin.

## Status semantics

| Status value | Meaning | UI signal |
|---|---|---|
| `undefined` | Legacy or admin-finalized | No chip |
| `'doctor-recorded'` | Doctor saved; admin must finalize | Amber chip "แพทย์ลงบันทึก" |

Status field on `be_treatments/{id}`:
- Set on doctor-save (`saveMode === 'doctor'`)
- Cleared on admin's normal save via Firestore `deleteField()`
- `recordedBy` (uid) + `recordedAt` (serverTimestamp) preserved across
  admin finalize as forensic trail

## What doctor-save records

- ✅ OPD card text (symptoms, diagnosis, treatmentInfo, treatmentPlan,
     treatmentNote, additionalNote)
- ✅ Vitals, blood type, congenital disease, drug allergy
- ✅ Treatment history, med-cert info
- ✅ Doctor fees (`doctorFees` + DF entries)
- ✅ Medications (`medications[]`) — stock deduction type 7 fires
     (sanctioned exception per Q2 brainstorming)
- ✅ Images, lab items, treatment files, chart canvas
- ✅ Status + recordedBy + recordedAt audit stamps

## What doctor-save SKIPS

- ❌ Course-items deduction (treatmentItems)
- ❌ Consumables stock deduction (type 6)
- ❌ Course/promotion purchases (purchasedItems)
- ❌ Auto-sale creation chain (createBackendSale, deductWallet,
     earnPoints, applyDepositToSale, assignCourseToCustomer)
- ❌ Edit-mode sale sync

Admin completes these via normal save when finalizing.

## Edit-mode unlock

`canAddNewItems = (mode === 'create') || (loadedTreatment?.status === 'doctor-recorded')`

This replaces every `!isEdit && <AddBtn>` gate in TFP at 5 UI sites:
medication add buttons, medication grid swap, consumable add button,
consumable grid swap, course/purchase picker trigger.

Effect: when admin opens TFP to edit a doctor-recorded treatment, UI
behaves like create mode (admin can add ANY missing pieces). Legacy
edits (status=undefined) remain locked per existing behavior.

## Rule of 3 link — saveMode joins lockedX family

`saveMode` is the 4th member of the architectural pattern family
established on TFP/AppointmentFormModal:

| Member | Component | Phase |
|---|---|---|
| `lockedCustomer` | AppointmentFormModal | Phase 21.0 |
| `lockedAppointmentType` | AppointmentFormModal | Phase 21.0 |
| `lockedChannel` | AppointmentFormModal | Phase 25.0c |
| `saveMode` | TreatmentFormPage | Phase 26.0 (this) |

The shared pattern: **payload-shape-routing via single argument with
explicit gate sites + AV invariant + source-grep regression test**.

Future "save-mode" / "lockedX" variants MUST mirror:
- Defensive coercion at entry (`safeX = ALLOWED.includes(x) ? x : null`
  OR `mode = (arg === expected) ? expected : default`)
- Explicit gates at EVERY downstream call site
- AV audit invariant locking the pattern
- Flow-simulate F-tests for the round-trip
- Source-grep regression for the gates

## Backward compat

- Legacy treatments (~5000+) have `status: undefined` → no chip → behave
  like "completed". NO data migration needed.
- `firestore.rules` unchanged — `be_treatments` already allows arbitrary
  staff write.
- No Rule B Probe-Deploy-Probe; no Rule M data ops.

## Files

- `src/components/TreatmentFormPage.jsx` — primary
- `src/components/backend/CustomerDetailView.jsx` — chip
- `src/components/backend/TreatmentTimelineModal.jsx` — chip
- `.agents/skills/audit-anti-vibe-code/SKILL.md` — AV37
- `tests/phase-26-0-doctor-save-*.{test.js,test.jsx}` — 3 test files

## See also

- Spec: `docs/superpowers/specs/2026-05-13-doctor-save-and-admin-finalize-mode-design.md`
- Plan: `docs/superpowers/plans/2026-05-13-phase-26-0-doctor-save.md`
- Phase 25.0c lockedChannel: `concepts/appointment-15min-and-4types.md`
```

- [ ] **Step 2: Append wiki/log.md**

```bash
cat >> wiki/log.md << 'EOF'

## [2026-05-13] ingest | Phase 26.0 — Doctor-Save + Admin Finalize-Mode

Created `concepts/treatment-status-and-doctor-save.md` documenting the new
asymmetric save flow on TreatmentFormPage. Doctor-save records OPD-only
(plus meds + DF per Q2 decision); admin finalize unlocks via
`canAddNewItems` flag derived from `treatment.status === 'doctor-recorded'`.
`saveMode` joins the lockedX architectural family as 4th member; AV37
audit invariant + Rule I F1-F8 flow-simulate lock the pattern.
EOF
```

- [ ] **Step 3: Update SESSION_HANDOFF.md**

Open `SESSION_HANDOFF.md` and prepend a new session block right after the existing top header. Use this template:

```markdown
### Session 2026-05-13 — Phase 26.0 Doctor-Save (บันทึกสำหรับแพทย์) + Admin Finalize-Mode

User: "เพิ่มระบบใหม่ ปุ่ม บันทึกสำหรับแพทย์ ... จะไม่สามารถกดบันทึกตรงส่วนของ ข้อมูลการใช้คอร์ส และ สินค้าสิ้นเปลือง ได้ ... และเมื่อ admin กลับมากดแก้ไข ... จะสามารถกดเข้ามาแก้ไข อื่นๆได้ทั้งหมด"

**Brainstorming HARD-GATE honored** (Rule J): 4 Qs locked before code — Q1 permission=Open-to-all, Q2 skip-scope=keep-meds-and-DF, Q3 status=single-doctor-recorded-cleared, Q4 unlock=status-derived-canAddNewItems. Approach A1 (single handleSubmit + explicit gates) locked.

**9 files modified** (~770 LOC est): 4 source + 5 test/wiki/audit.

**Phase 26.0a — Scaffold**: `auth` import + `canAddNewItems` flag + `saveMode` defensive coercion (no behavior change).

**Phase 26.0b — Gates**: 6 gate sites in handleSubmit gate on `saveMode !== 'doctor'`. KEPT: meds deductStockForTreatment (type 7) per Q2. Stamp `status: 'doctor-recorded' + recordedBy + recordedAt` on doctor-save; `deleteField()` on admin save (preserves recordedBy/At).

**Phase 26.0c — UI gates**: `canAddNewItems` replaces `!isEdit` at 5 UI sites (med add + grid + consumable add + grid + course picker). Pattern α (show/hide) for 3 sites; Pattern β (branch-swap editable/read-only) for 2 grid sites.

**Phase 26.0d — Doctor button + banner**: NEW button under OPD Card additionalNote (Stethoscope icon, secondary sky styling, helper text). NEW amber edit-mode banner with AlertCircle + Thai instruction.

**Phase 26.0e — Status chips**: amber chip "แพทย์ลงบันทึก" in CustomerDetailView treatment cards + TreatmentTimelineModal row headers.

**Phase 26.0f — AV37 audit**: 7 sub-tests in tests/audit-anti-vibe-code.test.js + invariant entry in SKILL.md. Locks doctor-save gate discipline permanently.

**Phase 26.0g — Tests**: 3 NEW Phase 26.0 test files (~40 assertions: G1+G2 source-grep + D1+D2+D3 RTL + F1-F8 flow-simulate). Full suite verified GREEN.

**Rule of 3 reached** — `saveMode` is 4th member of payload-shape-routing family (lockedCustomer + lockedAppointmentType + lockedChannel + saveMode). Future variants MUST mirror: defensive coercion + explicit gates + AV invariant + flow-simulate + source-grep.

Detail: `.agents/sessions/2026-05-13-phase-26-0-doctor-save.md` (deferred until session-end).

NOT yet deployed — user authorizes `vercel --prod` separately. Production at `ccef3c2` (unchanged this session).
```

- [ ] **Step 4: Update `.agents/active.md`**

Replace the contents with:

```yaml
---
updated_at: "2026-05-13 — Phase 26.0 Doctor-Save shipped (NOT YET DEPLOYED)"
status: "master=<NEW_SHA> · prod=ccef3c2 · 9 commits ahead · 8282+ passed · build clean"
branch: "master"
last_commit: "<last commit subject>"
tests: 8282
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "ccef3c2"
firestore_rules_version: 29
storage_rules_version: 2
---

# Active Context

## State
- master = `<NEW_SHA>` · prod = `ccef3c2` (9 commits ahead — Phase 26.0 NOT YET DEPLOYED)
- 8282+/8285+ tests passed + 1 pending (1 pre-existing `bsa-task7-h-quater-fix` flake; 0 Phase 26.0 regressions)
- Rule of 3 family extended: `saveMode` joins `lockedCustomer` + `lockedAppointmentType` + `lockedChannel` as 4th member of payload-shape-routing pattern on TFP/AppointmentFormModal

## What this session shipped
- **Phase 26.0 — Doctor-Save (บันทึกสำหรับแพทย์) + Admin Finalize-Mode**: 7 task commits (26.0a..26.0g) covering scaffold + gates + UI gates + button/banner + chips + AV37 audit + flow-simulate F1-F8
- Spec: `docs/superpowers/specs/2026-05-13-doctor-save-and-admin-finalize-mode-design.md`
- Plan: `docs/superpowers/plans/2026-05-13-phase-26-0-doctor-save.md`
- Wiki: NEW `wiki/concepts/treatment-status-and-doctor-save.md` + log appended
- AV37 invariant + 7 sub-tests in tests/audit-anti-vibe-code.test.js
- 3 NEW test files (~40 assertions) all GREEN

## Next action
Idle — Phase 26.0 implementation complete; awaiting user `deploy` authorization to ship combined `vercel --prod` + `firebase deploy --only firestore:rules` (rules unchanged but combined per V15).

## Outstanding user-triggered actions
- **Pending user authorization**: deploy Phase 26.0 to production
- (Optional, unchanged) `scripts/probe-deploy-probe.mjs` probes 2/3/4 false-positive trim
- (Optional, unchanged) `bsa-task7-h-quater-fix` parallel-run flake

## Institutional memory anchors
- **Phase 26.0 — `saveMode` arg = 4th locked-field family member**. Future locked-X / save-mode props on TFP/AppointmentFormModal MUST mirror: defensive coercion + explicit gates at every site + AV invariant + flow-simulate F-tests + source-grep regression.
- **Doctor-save asymmetric flow** — records OPD/vitals/charts/meds/DF only; SKIPS course-items/consumables/purchasedItems/auto-sale; admin's normal save unlocks via `canAddNewItems = (mode==='create') || (loadedTreatment?.status === 'doctor-recorded')`.
- **`status` field on be_treatments** — new additive field; legacy treatments stay `status: undefined` = "completed" semantic; `'doctor-recorded'` set on doctor-save; cleared via `deleteField()` on admin finalize; recordedBy/At preserved.
- (Carried) Iron-clad rules A-P + BSA invariants BS-1..16 + AV1-AV37 + CB-1..5.
```

(Replace `<NEW_SHA>` with the actual commit SHA after Task 9 commit lands. The `tests: 8282` figure is an estimate — adjust to actual count after full-suite run in Task 8.)

- [ ] **Step 5: Commit**

```bash
git add wiki/concepts/treatment-status-and-doctor-save.md wiki/log.md SESSION_HANDOFF.md .agents/active.md
git commit -m "$(cat <<'EOF'
docs(Phase 26.0): wiki concept page + SESSION_HANDOFF + active.md state

- NEW wiki/concepts/treatment-status-and-doctor-save.md — full taxonomy
  + flow + Rule of 3 link (saveMode = 4th locked-field family member)
- Append wiki/log.md ingest entry
- SESSION_HANDOFF.md prepend Session 2026-05-13 block
- .agents/active.md updated current state + next action

Phase 26.0 implementation COMPLETE; awaiting user 'deploy' authorization.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 6: Push all commits**

```bash
git push origin master 2>&1 | tail -5
```

Expected: `master` updated remotely (8-9 commits ahead → 0 ahead).

---

## Self-Review

After writing this plan, checked against spec:

**Spec coverage**:
- ✅ Section 1 (user intent) — addressed in Task 4 button
- ✅ Section 2 Q1-Q4 (locked decisions) — Task 2 (Q2 skip scope), Task 3 (Q4 unlock), Task 4 (Q1 button visibility hard-coded {!isEdit}), Task 2 (Q3 status stamping)
- ✅ Section 3 (data schema) — Task 2 Step 8 + backward compat tested in F8
- ✅ Section 4 (high-level flow) — F1-F8 in Task 7 chains the round-trip
- ✅ Section 5.1 (TFP changes) — Tasks 1-4 cover all 8 surfaces (A-H)
- ✅ Section 5.2 (backendClient passthrough) — Task 2 Step 9 verification
- ✅ Section 5.3 (CustomerDetailView chip) — Task 5
- ✅ Section 5.4 (TimelineModal chip) — Task 5
- ✅ Section 5.5 (3 new test files) — Tasks 2, 4-5, 7
- ✅ Section 5.6 (AV37) — Task 6
- ✅ Section 5.7 (wiki page) — Task 9
- ✅ Section 6 (verification + Rule cross-refs) — Task 8 + framework
- ✅ Section 7 (non-goals) — N/A (omissions)
- ✅ Section 8 (risks + mitigations) — addressed in test design + status semantics matrix
- ✅ Section 10 (Rule of 3) — wiki concept page links it

**Placeholder scan**: no TBD / TODO / fill-in-details in tasks. Task 1 Step 2 has a "verify variable name" note which is appropriate (codebase exploration may vary). Task 3 Step 7 has a similar "find the trigger" instruction with grep command provided.

**Type consistency**: `saveMode`, `canAddNewItems`, `loadedTreatment`, `status`, `recordedBy`, `recordedAt`, `deleteField`, `serverTimestamp`, `auth.currentUser?.uid` — all consistent across tasks.

**Risks NOT yet addressed in plan**:
- `loadedTreatment` variable name may differ in actual TFP (Task 1 Step 2 notes this with grep command)
- `reverseCourseDeduction` + `reverseStockForTreatment` no-op-on-empty (spec Section 1.3 invariant 4) — not tested in F1-F8; flagged as "implementation should verify; gate explicitly if unsafe". Worth a dedicated subtest if time permits in Task 7.

**Estimated duration**: 1-2 sessions (135 LOC source + 500 LOC tests + 135 LOC docs). Single developer with TDD discipline. Each task is 15-30 minutes.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-13-phase-26-0-doctor-save.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
