# Phase 26.2f — TFP Read-Only Mirror + Vitals-Save Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 3-stage save workflow on TFP (vitals → doctor → complete) + a comprehensive `TreatmentReadOnlyMirror` component that mirrors the editable TFP layout but with disabled inputs, consumed by the Phase 26.2e split-screen.

**Architecture:** 5 sub-phases. **26.2f-pre** = layout reorder + new vitals-save button + handleSubmit `saveMode='vitals'` branch + status state machine + AV37 extension. **26.2f** = NEW `TreatmentReadOnlyMirror.jsx` (~700 LOC) with disabled inputs + object-value extraction. **26.2g** = wire Mirror into TFP split-screen (replacing condensed Panel). **26.2h** = AV39 audit invariant. **26.2i** = full-suite verify + wiki + handoff.

**Tech Stack:** React 19 + Vite + Vitest 4.1 + Tailwind 3.4. Existing helpers: `auth` (firebase.js), `serverTimestamp` / `deleteField` (firebase/firestore), `FormSection` / `SectionHeader` (TFP-local), `formatThaiDateFull` (TFP-local). Existing components to extend: `TreatmentFormPage.jsx`, `CustomerDetailView.jsx`, `TreatmentTimelineModal.jsx`.

**Reference:** Spec at `docs/superpowers/specs/2026-05-13-phase-26-2f-tfp-readonly-mirror-design.md`.

**Rule constraints**:
- No deploy (combined Phase 26.0 + 26.1 + 26.2 + 26.2f = ~55+ commits will deploy together per user authorization)
- No firestore.rules / data migration
- Rule N: targeted-test during iteration; full vitest at batch end (Task 10)
- Rule of 3: Panel + Mirror co-exist post-26.2f (2 consumers each — not Rule of 3 trigger yet)

---

## Pre-flight context (verified)

- TFP signature at `src/components/TreatmentFormPage.jsx:307` destructures `mode, customerId, customerHN, treatmentId, patientName, patientData, isDark, db, appId, onClose, onSaved, saveTarget, initialTreatmentDate`
- `loadedTreatmentStatus` state at line 429 (Phase 26.0a)
- `canAddNewItems` at lines 465-466 — currently checks `'doctor-recorded'` only
- `handleSubmit` signature at line 1977+ — accepts `(eventOrSaveMode, options = {})` with defensive coercion
- handleSubmit's 8 gates use `saveMode !== 'doctor'` (lines 2139, 2278, etc.) — need extension to `saveMode !== 'doctor' && saveMode !== 'vitals'`
- v26StatusPatch at line 2329+ — currently stamps 'doctor-recorded' or clears
- Phase 26.0d doctor-save button: search for `tfp-doctor-save-btn` data-testid
- Phase 26.2-E customerNote display: search for `tfp-customer-note` (currently in RIGHT column above doctor-save button)
- TFP split-screen call-sites at line ~5010 (desktop aside) + ~5159 (mobile fallback) — currently use `<TreatmentReadOnlyPanel>`; will swap to `<TreatmentReadOnlyMirror>`

---

## File Structure

**Files to CREATE:**
- `src/components/backend/TreatmentReadOnlyMirror.jsx` — comprehensive mirror component (~700 LOC)
- `tests/phase-26-2f-pre-vitals-save-source-grep.test.js` — V1 + G5 + AV37 source-grep extensions
- `tests/phase-26-2f-pre-vitals-save-rtl.test.jsx` — V2 RTL (button visibility + chip render + state machine)
- `tests/phase-26-2f-pre-vitals-save-flow-simulate.test.js` — F11 Rule I full-flow
- `tests/phase-26-2f-mirror-source-grep.test.js` — M1 source-grep
- `tests/phase-26-2f-mirror-rtl.test.jsx` — M2 RTL
- `wiki/concepts/tfp-readonly-mirror.md` — concept page

**Files to MODIFY:**
- `src/components/TreatmentFormPage.jsx` — layout reorder + new button + handleSubmit branch + canAddNewItems + doctor-save gate + Mirror import + 2 call-sites
- `src/components/backend/CustomerDetailView.jsx` — chip "บันทึกข้อมูลซักประวัติ"
- `src/components/backend/TreatmentTimelineModal.jsx` — chip render via Panel header
- `src/components/backend/TreatmentReadOnlyPanel.jsx` — add status='vitalsigns-recorded' chip rendering (mirror existing doctor-recorded chip block)
- `src/lib/backendClient.js` — verify `rebuildTreatmentSummary` preserves status (already done Phase 26.0e)
- `tests/audit-branch-scope.test.js` — AV37.12-17 + AV39.1-8 = 14 NEW assertions
- `.agents/skills/audit-anti-vibe-code/SKILL.md` — AV37 extension paragraph + NEW AV39 entry
- `wiki/concepts/treatment-status-and-doctor-save.md` — 3-stage workflow section
- `wiki/log.md` — Phase 26.2f entry
- `SESSION_HANDOFF.md` + `.agents/active.md` — final state

---

## Task 1: Phase 26.2f-pre — Layout reorder (move customerNote LEFT)

**Files:**
- Modify: `src/components/TreatmentFormPage.jsx`

- [ ] **Step 1: Grep current locations**

```bash
cd F:/LoverClinic-app && grep -nE "tfp-customer-note|ข้อมูลสุขภาพลูกค้า|ข้อมูลซักประวัติ" src/components/TreatmentFormPage.jsx | head -6
```

Note the current `tfp-customer-note` line (RIGHT column, above doctor-save button) + the LEFT column section anchors.

- [ ] **Step 2: Cut customerNote JSX from RIGHT column**

Locate the existing customerNote block (`{customerNote && (...)}` wrapping the amber card with `data-testid="tfp-customer-note"`). Use Read tool to grab the exact JSX (about 20 lines including the surrounding ClipboardCheck icon + heading + pre content). Delete those lines.

Verify deletion via grep:
```bash
grep -n "tfp-customer-note" src/components/TreatmentFormPage.jsx
```
Expected: 0 matches.

- [ ] **Step 3: Paste customerNote JSX into LEFT column between "ข้อมูลการรักษา" and "ข้อมูลสุขภาพลูกค้า"**

Find the existing "ข้อมูลสุขภาพลูกค้า" `<FormSection>` opening tag in the LEFT column. Insert the cut customerNote block IMMEDIATELY BEFORE it:

```jsx
{/* Phase 26.2f-pre (V26.2f, 2026-05-13) — หมายเหตุทั่วไป moved from RIGHT column
    to LEFT column (between ข้อมูลการรักษา and ข้อมูลสุขภาพลูกค้า) per user spec. */}
{customerNote && (
  <div
    data-testid="tfp-customer-note"
    className="mb-3 bg-amber-950/10 border border-amber-900/40 rounded-xl overflow-hidden"
  >
    <div className="px-4 py-3 border-b border-amber-900/40 flex items-center gap-2">
      <ClipboardCheck size={14} className="text-amber-400" />
      <h3 className="text-xs font-bold uppercase tracking-wider text-amber-300">
        หมายเหตุทั่วไป
      </h3>
    </div>
    <div className="p-3">
      <pre className="text-xs text-[var(--tx-secondary)] whitespace-pre-wrap font-sans leading-relaxed">
        {String(customerNote || '').trim()}
      </pre>
    </div>
  </div>
)}
```

- [ ] **Step 4: Verify**

```bash
cd F:/LoverClinic-app && grep -n "tfp-customer-note" src/components/TreatmentFormPage.jsx
```
Expected: 1 match (the new LEFT column location).

```bash
cd F:/LoverClinic-app && npm run build 2>&1 | tail -5
```
Expected: clean.

- [ ] **Step 5: Run existing Item-E source-grep tests**

```bash
cd F:/LoverClinic-app && npx vitest run tests/phase-26-2-split-screen-source-grep.test.js 2>&1 | tail -10
```

Expected: Item-E tests still PASS (the test asserts position before `tfp-doctor-save-btn` — moving customerNote to LEFT keeps it positionally before the doctor-save button per character index, but verify). If Item-E.6 fails (positional check inverted because customerNote now precedes doctor-save by a LOT more lines), update the test regex to NOT depend on the specific positional relationship — drop Item-E.6 OR change to "customerNote precedes doctor-save in document order" (still true).

V21-class test fixup acceptable here. Document the change in commit.

- [ ] **Step 6: Commit + push**

```bash
cd F:/LoverClinic-app
git add src/components/TreatmentFormPage.jsx tests/phase-26-2-split-screen-source-grep.test.js
git commit -m "$(cat <<'EOF'
feat(Phase 26.2f-pre Task 1): move หมายเหตุทั่วไป to LEFT column

User spec: "เอา box หมายเหตุทั่วไป ขึ้นไปไว้เหนือ box ข้อมูลสุขภาพลูกค้า
เพราะเป็นสิ่งสำคัญ".

- Moved customerNote JSX from RIGHT column (above doctor-save button)
  to LEFT column (between ข้อมูลการรักษา and ข้อมูลสุขภาพลูกค้า)
- Same amber styling + ClipboardCheck icon + Thai title preserved
- data-testid="tfp-customer-note" preserved
- mb-3 spacing preserved (note → next section gap)
- Item-E.6 positional test V21-fixup if needed (note still precedes
  doctor-save in document order)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin master 2>&1 | tail -3
```

---

## Task 2: Phase 26.2f-pre — handleSubmit saveMode='vitals' branch

**Files:**
- Modify: `src/components/TreatmentFormPage.jsx`

- [ ] **Step 1: Locate handleSubmit signature + gates**

```bash
cd F:/LoverClinic-app && grep -nE "async function handleSubmit|saveMode\s*=\s*'staff'|saveMode\s*!==\s*'doctor'|v26StatusPatch" src/components/TreatmentFormPage.jsx | head -20
```

Note the signature at line ~1977, defensive coercion at line ~1987, and ALL 8 gates that currently use `saveMode !== 'doctor'`.

- [ ] **Step 2: Extend saveMode coercion to accept 'vitals'**

Find the defensive coercion block:

```js
saveMode = (eventOrSaveMode === 'doctor') ? 'doctor' : 'staff';
```

Replace with:

```js
saveMode = (eventOrSaveMode === 'doctor') ? 'doctor'
         : (eventOrSaveMode === 'vitals') ? 'vitals'
         : 'staff';
```

Apply the same change to the object-form re-invoke branch (around line 1994):

```js
saveMode = (eventOrSaveMode.saveMode === 'doctor') ? 'doctor'
         : (eventOrSaveMode.saveMode === 'vitals') ? 'vitals'
         : 'staff';
```

- [ ] **Step 3: Extend the 8 deduction/sale gates to skip both 'doctor' AND 'vitals'**

For EACH occurrence of `saveMode !== 'doctor'` in handleSubmit body, change to `saveMode !== 'doctor' && saveMode !== 'vitals'`.

Use grep to enumerate ALL 8 sites:
```bash
grep -n "saveMode !== 'doctor'" src/components/TreatmentFormPage.jsx
```

Apply the change at each line. Verify all 8 changed:
```bash
grep -n "saveMode !== 'doctor' && saveMode !== 'vitals'" src/components/TreatmentFormPage.jsx | wc -l
```
Expected: 8 (matches all 8 prior occurrences).

- [ ] **Step 4: Extend required-field validation skip**

Find the validation block that returns early when `saveMode === 'doctor'`. It likely looks like:

```js
if (saveMode !== 'doctor') {
  // run validation
}
```

Replace with:

```js
if (saveMode !== 'doctor' && saveMode !== 'vitals') {
  // run validation
}
```

This skips required-field validation for both doctor-save AND vitals-save paths.

- [ ] **Step 5: Extend v26StatusPatch to handle saveMode === 'vitals'**

Locate the existing v26StatusPatch block (line ~2329):

```js
const v26StatusPatch = saveMode === 'doctor' ? {
  status: 'doctor-recorded',
  recordedBy: auth.currentUser?.uid || null,
  recordedAt: serverTimestamp(),
} : {
  // admin save: clear status via deleteField (preserves recordedBy/At forensic trail)
  ...(isEdit && loadedTreatmentStatus === 'doctor-recorded' ? {} : {
    status: deleteField(),
  }),
};
```

Replace with:

```js
const v26StatusPatch = saveMode === 'doctor' ? {
  status: 'doctor-recorded',
  recordedBy: auth.currentUser?.uid || null,
  recordedAt: serverTimestamp(),
} : saveMode === 'vitals' ? {
  status: 'vitalsigns-recorded',
  recordedBy: auth.currentUser?.uid || null,
  recordedAt: serverTimestamp(),
} : {
  // admin regular save: clear status via deleteField (preserves recordedBy/At forensic trail)
  ...(isEdit && (loadedTreatmentStatus === 'doctor-recorded' || loadedTreatmentStatus === 'vitalsigns-recorded') ? {
    status: deleteField(),
  } : {
    status: deleteField(),
  }),
};
```

NOTE the existing logic: even the existing block clears status. The conditional behavior is correct — admin's regular-save always clears. Don't change the clear behavior, just extend the proxy condition to also recognize `'vitalsigns-recorded'` as a clearable state. The actual write is the same `deleteField()`.

Simpler equivalent rewrite for the admin branch:

```js
} : {
  status: deleteField(),  // admin regular save: clears any non-null status
};
```

(Phase 26.0e's conditional ternary was overly defensive; the deleteField is idempotent — applying it when status is already null is fine.)

- [ ] **Step 6: Build clean**

```bash
cd F:/LoverClinic-app && npm run build 2>&1 | tail -5
```

- [ ] **Step 7: Run Phase 26.0 tests to confirm no regression**

```bash
cd F:/LoverClinic-app && npx vitest run tests/phase-26-0-doctor-save-source-grep.test.js tests/phase-26-0-doctor-save-flow-simulate.test.js tests/phase-26-0-status-display-rtl.test.jsx 2>&1 | tail -10
```

Expected: all GREEN.

If existing Phase 26.0 tests fail due to the extended `saveMode !== 'doctor' && saveMode !== 'vitals'` regex (because their regex anchored on the exact prior pattern), update those regex windows with V21-class fixups. Include in commit.

- [ ] **Step 8: Commit + push**

```bash
cd F:/LoverClinic-app
git add src/components/TreatmentFormPage.jsx
# Add any Phase 26.0 V21-class test fixups if landed
git diff --cached --stat
git commit -m "$(cat <<'EOF'
feat(Phase 26.2f-pre Task 2): handleSubmit saveMode='vitals' branch

NEW saveMode='vitals' on handleSubmit (mirrors Phase 26.0b doctor-save
pattern):
- Defensive coercion accepts 'vitals' string (and object {saveMode:'vitals'})
- All 8 deduction/sale gates extended:
  saveMode !== 'doctor'  →  saveMode !== 'doctor' && saveMode !== 'vitals'
  (skips course-item deductions / sale creation / stock writes)
- Required-field validation skipped when saveMode === 'vitals'
  (admin can save vitals without selecting แพทย์ or filling OPD)
- v26StatusPatch stamps status='vitalsigns-recorded' + recordedBy + recordedAt
  when saveMode === 'vitals' (mirror Phase 26.0e forensic-fields pattern)
- Admin regular-save still clears status via deleteField (idempotent on null)
- Meds (type 7) sanctioned exception preserved (unchanged)

V21-class test fixups for any Phase 26.0 source-grep that anchored on
the exact prior pattern.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin master 2>&1 | tail -3
```

---

## Task 3: Phase 26.2f-pre — NEW Vitals-Save button + doctor-save edit-mode enablement + canAddNewItems extension

**Files:**
- Modify: `src/components/TreatmentFormPage.jsx`

- [ ] **Step 1: Extend canAddNewItems**

Find the existing definition (~line 465-466):

```js
const canAddNewItems = (mode === 'create')
  || (loadedTreatmentStatus === 'doctor-recorded');
```

Replace with:

```js
// Phase 26.2f-pre — extended canAddNewItems to also unlock when status
// is 'vitalsigns-recorded' (admin saved vitals only; doctor or admin
// can now add items in subsequent edit cycles).
const canAddNewItems = (mode === 'create')
  || (loadedTreatmentStatus === 'doctor-recorded')
  || (loadedTreatmentStatus === 'vitalsigns-recorded');
```

- [ ] **Step 2: Extend doctor-save button gate (edit-mode enablement)**

Find the existing doctor-save button block (`tfp-doctor-save-btn`):

```bash
grep -nB 2 -A 25 "tfp-doctor-save-btn" src/components/TreatmentFormPage.jsx | head -30
```

Locate the wrapping conditional. Phase 26.0d wraps the button in:

```jsx
{!isEdit && (
  <DoctorSaveButton ... />
)}
```

Change to:

```jsx
{/* Phase 26.2f-pre — doctor-save enabled in edit mode when
    loadedTreatmentStatus === 'vitalsigns-recorded' (transition from
    vitals to doctor stage). Otherwise stays create-only per Phase 26.0d. */}
{(!isEdit || loadedTreatmentStatus === 'vitalsigns-recorded') && (
  <DoctorSaveButton ... />
)}
```

(The actual button JSX inside stays unchanged. Only the outer conditional changes.)

- [ ] **Step 3: Add the NEW vitals-save button JSX**

The vitals-save button goes at the OLD position of `customerNote` — the slot ABOVE the doctor-save button in the RIGHT column (OPD card area). Since customerNote was MOVED to LEFT in Task 1, the slot is now empty.

Find the doctor-save button block (search for `tfp-doctor-save-btn`). Insert IMMEDIATELY BEFORE the `{(!isEdit || ...) && (` wrapper:

```jsx
{/* Phase 26.2f-pre (V26.2f, 2026-05-13) — NEW vitals-save button.
    Mirror of Phase 26.0d doctor-save button pattern. Admin clicks to
    create a treatment record with only Vital Signs filled. Status
    stamps 'vitalsigns-recorded'; subsequent doctor-save transitions
    to 'doctor-recorded'; admin's final regular-save clears status. */}
{!isEdit && (
  <div className="mb-3">
    <button
      type="button"
      onClick={() => handleSubmit('vitals')}
      data-testid="tfp-vitals-save-btn"
      disabled={busy}
      className={`w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold text-white transition-all bg-[#2EC4B6] hover:bg-[#26a89c] active:bg-[#1f8f86] shadow-[0_0_18px_rgba(46,196,182,0.25)] disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <Activity size={16} />
      บันทึกข้อมูลซักประวัติ
    </button>
    <p className="mt-1.5 text-[10px] text-[var(--tx-muted)] text-center">
      บันทึกเฉพาะ Vital Signs · ไม่ต้องเลือกแพทย์ · admin จะกลับมา key ข้อมูลที่เหลือทีหลัง
    </p>
  </div>
)}
```

Verify `Activity` icon is already imported in TFP's lucide-react import block:

```bash
grep -nE "import \{[^}]*Activity[^}]*\} from 'lucide-react'" src/components/TreatmentFormPage.jsx
```

If missing, add `Activity` to the existing lucide-react destructure.

- [ ] **Step 4: Build clean**

```bash
cd F:/LoverClinic-app && npm run build 2>&1 | tail -5
```

- [ ] **Step 5: Run Phase 26 regression**

```bash
cd F:/LoverClinic-app && npx vitest run tests/phase-26-0-doctor-save-source-grep.test.js tests/phase-26-0-doctor-save-flow-simulate.test.js tests/phase-26-0-status-display-rtl.test.jsx tests/phase-26-2-split-screen-source-grep.test.js 2>&1 | tail -10
```

Expected: all GREEN. V21-class fixups acceptable.

- [ ] **Step 6: Commit + push**

```bash
cd F:/LoverClinic-app
git add src/components/TreatmentFormPage.jsx
git commit -m "$(cat <<'EOF'
feat(Phase 26.2f-pre Task 3): vitals-save button + doctor-save edit-mode + canAddNewItems extension

NEW vitals-save button (RIGHT column, slot above doctor-save):
- Label: "บันทึกข้อมูลซักประวัติ"
- data-testid="tfp-vitals-save-btn"
- Teal styling (bg-#2EC4B6 hover-#26a89c) — distinct from doctor-save's sky
- Activity icon (lucide-react)
- Subtitle: "บันทึกเฉพาะ Vital Signs · ไม่ต้องเลือกแพทย์ · ..."
- Gate: {!isEdit && (...)} create-only (mirror doctor-save's original pattern)
- onClick → handleSubmit('vitals')

Phase 26.0d doctor-save button gate extended:
- Was: {!isEdit && (...)}
- Now: {(!isEdit || loadedTreatmentStatus === 'vitalsigns-recorded') && (...)}
- Enables doctor to complete a vitals-only treatment from edit mode
  (3-stage workflow: admin vitals → doctor → admin regular)

canAddNewItems extended:
- Was: (mode==='create') || (loadedTreatmentStatus === 'doctor-recorded')
- Now: + || (loadedTreatmentStatus === 'vitalsigns-recorded')
- Admin can add course items / consumables / etc. on a vitals-only
  treatment without doctor-save first (more flexible workflow)

Activity icon added to lucide-react import if missing.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin master 2>&1 | tail -3
```

---

## Task 4: Phase 26.2f-pre — Status chip "บันทึกข้อมูลซักประวัติ" rendering (CDV + Panel + TimelineModal)

**Files:**
- Modify: `src/components/backend/CustomerDetailView.jsx`
- Modify: `src/components/backend/TreatmentReadOnlyPanel.jsx` (Panel renders the chip alongside the existing 'doctor-recorded' chip; TimelineModal consumes Panel so inherits the chip)

- [ ] **Step 1: Locate existing 'doctor-recorded' chip in Panel**

```bash
cd F:/LoverClinic-app && grep -nE "doctor-recorded|treatment-status-chip-doctor" src/components/backend/TreatmentReadOnlyPanel.jsx | head -5
```

Note the existing chip JSX block. Read the surrounding ~20 lines for context.

- [ ] **Step 2: Add 'vitalsigns-recorded' chip in Panel immediately after the doctor-recorded chip**

After the existing `{t.status === 'doctor-recorded' && (<span>...</span>)}` block, insert:

```jsx
{/* Phase 26.2f-pre — vitals-recorded chip (mirror doctor-recorded chip).
    Renders when treatment.status === 'vitalsigns-recorded' (admin saved
    vitals only; doctor has not yet completed). Teal styling distinct
    from amber doctor-recorded chip. */}
{t.status === 'vitalsigns-recorded' && (
  <span
    data-testid={`treatment-status-chip-vitalsigns-recorded-${t.id}`}
    className={`text-[10px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1 border ${isDark ? 'bg-teal-950 border-teal-800 text-teal-100' : 'bg-teal-100 border-teal-200 text-teal-900'}`}
    title="บันทึกข้อมูลซักประวัติ"
  >
    <Activity size={10} />
    <span>บันทึกข้อมูลซักประวัติ</span>
  </span>
)}
```

Verify `Activity` icon is imported in Panel:
```bash
grep -nE "import \{[^}]*Activity[^}]*\} from 'lucide-react'" src/components/backend/TreatmentReadOnlyPanel.jsx
```

If missing, add `Activity` to the existing lucide-react destructure.

- [ ] **Step 3: Add the same chip to CustomerDetailView (CDV) row meta**

```bash
cd F:/LoverClinic-app && grep -nE "doctor-recorded|treatment-status-chip-doctor" src/components/backend/CustomerDetailView.jsx | head -5
```

Locate the existing chip JSX in CDV. Insert the vitals-recorded chip block immediately after, mirroring the doctor-recorded pattern. Use the EXACT same JSX block from Step 2 (treatmentSummary `t` should be available in the same scope).

- [ ] **Step 4: Build clean**

```bash
cd F:/LoverClinic-app && npm run build 2>&1 | tail -5
```

- [ ] **Step 5: Run regression**

```bash
cd F:/LoverClinic-app && npx vitest run tests/phase-26-0-status-display-rtl.test.jsx tests/customer-treatment-timeline-flow.test.js 2>&1 | tail -10
```

Expected: GREEN.

- [ ] **Step 6: Commit + push**

```bash
cd F:/LoverClinic-app
git add src/components/backend/TreatmentReadOnlyPanel.jsx src/components/backend/CustomerDetailView.jsx
git commit -m "$(cat <<'EOF'
feat(Phase 26.2f-pre Task 4): vitals-recorded chip in Panel + CDV

NEW status chip "บันทึกข้อมูลซักประวัติ":
- Renders when treatment.status === 'vitalsigns-recorded'
- Teal styling (bg-teal-100/teal-950) — distinct from doctor-recorded
  amber chip
- Activity icon (clinical vitals signal)
- data-testid="treatment-status-chip-vitalsigns-recorded-{id}"
- title attr="บันทึกข้อมูลซักประวัติ"

Render sites (2):
- TreatmentReadOnlyPanel header (consumed by TimelineModal)
- CustomerDetailView row meta (inline alongside doctor-recorded chip)

Activity icon added to imports where missing.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin master 2>&1 | tail -3
```

---

## Task 5: Phase 26.2f-pre — Test bank (V1 + V2 + F11 + AV37 extension)

**Files:**
- Create: `tests/phase-26-2f-pre-vitals-save-source-grep.test.js`
- Create: `tests/phase-26-2f-pre-vitals-save-rtl.test.jsx`
- Create: `tests/phase-26-2f-pre-vitals-save-flow-simulate.test.js`
- Modify: `tests/audit-branch-scope.test.js` (append AV37.12-17)
- Modify: `.agents/skills/audit-anti-vibe-code/SKILL.md` (extend AV37 entry)

- [ ] **Step 1: Create vitals-save source-grep test file**

Create `tests/phase-26-2f-pre-vitals-save-source-grep.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const TFP_PATH = join(process.cwd(), 'src/components/TreatmentFormPage.jsx');
const TFP_SOURCE = readFileSync(TFP_PATH, 'utf-8');

const PANEL_PATH = join(process.cwd(), 'src/components/backend/TreatmentReadOnlyPanel.jsx');
const PANEL_SOURCE = readFileSync(PANEL_PATH, 'utf-8');

const CDV_PATH = join(process.cwd(), 'src/components/backend/CustomerDetailView.jsx');
const CDV_SOURCE = readFileSync(CDV_PATH, 'utf-8');

describe('Phase 26.2f-pre — vitals-save source-grep', () => {
  describe('V1 — handleSubmit saveMode="vitals" branch', () => {
    it('V1.1 — saveMode coercion accepts "vitals" string', () => {
      expect(TFP_SOURCE).toMatch(/eventOrSaveMode\s*===\s*['"]vitals['"]\s*\)\s*\?\s*['"]vitals['"]/);
    });

    it('V1.2 — 8+ gates extended to skip both doctor AND vitals', () => {
      const matches = TFP_SOURCE.match(/saveMode\s*!==\s*['"]doctor['"]\s*&&\s*saveMode\s*!==\s*['"]vitals['"]/g);
      expect(matches?.length).toBeGreaterThanOrEqual(8);
    });

    it('V1.3 — v26StatusPatch stamps "vitalsigns-recorded"', () => {
      expect(TFP_SOURCE).toMatch(/saveMode\s*===\s*['"]vitals['"]\s*\?\s*\{[\s\S]{0,200}?status:\s*['"]vitalsigns-recorded['"]/);
    });

    it('V1.4 — vitals branch stamps recordedBy + recordedAt', () => {
      const idx = TFP_SOURCE.indexOf("'vitalsigns-recorded'");
      const region = TFP_SOURCE.slice(idx, idx + 400);
      expect(region).toMatch(/recordedBy:/);
      expect(region).toMatch(/recordedAt:\s*serverTimestamp\(\)/);
    });

    it('V1.5 — required-field validation skipped when saveMode==="vitals"', () => {
      expect(TFP_SOURCE).toMatch(/if\s*\(\s*saveMode\s*!==\s*['"]doctor['"]\s*&&\s*saveMode\s*!==\s*['"]vitals['"]\s*\)/);
    });
  });

  describe('V1 — vitals-save UI button + gates', () => {
    it('V1.6 — vitals-save button has data-testid="tfp-vitals-save-btn"', () => {
      expect(TFP_SOURCE).toMatch(/data-testid="tfp-vitals-save-btn"/);
    });

    it('V1.7 — vitals-save button is create-only ({!isEdit && ...})', () => {
      const idx = TFP_SOURCE.indexOf('tfp-vitals-save-btn');
      const before = TFP_SOURCE.slice(Math.max(0, idx - 400), idx);
      expect(before).toMatch(/\{!isEdit\s*&&/);
    });

    it('V1.8 — vitals-save onClick calls handleSubmit("vitals")', () => {
      const idx = TFP_SOURCE.indexOf('tfp-vitals-save-btn');
      const region = TFP_SOURCE.slice(Math.max(0, idx - 200), idx + 400);
      expect(region).toMatch(/handleSubmit\(\s*['"]vitals['"]\s*\)/);
    });

    it('V1.9 — vitals-save uses Activity icon', () => {
      const idx = TFP_SOURCE.indexOf('tfp-vitals-save-btn');
      const region = TFP_SOURCE.slice(idx, idx + 600);
      expect(region).toMatch(/<Activity/);
    });

    it('V1.10 — doctor-save gate accepts loadedTreatmentStatus === "vitalsigns-recorded"', () => {
      const idx = TFP_SOURCE.indexOf('tfp-doctor-save-btn');
      const before = TFP_SOURCE.slice(Math.max(0, idx - 500), idx);
      expect(before).toMatch(/loadedTreatmentStatus\s*===\s*['"]vitalsigns-recorded['"]/);
    });

    it('V1.11 — canAddNewItems extended to recognize vitalsigns-recorded', () => {
      expect(TFP_SOURCE).toMatch(/loadedTreatmentStatus\s*===\s*['"]vitalsigns-recorded['"]/);
      const matches = TFP_SOURCE.match(/loadedTreatmentStatus\s*===\s*['"]vitalsigns-recorded['"]/g);
      expect(matches?.length).toBeGreaterThanOrEqual(2);  // canAddNewItems + doctor-save gate
    });
  });

  describe('V1 — chip rendering in Panel + CDV', () => {
    it('V1.12 — Panel renders vitalsigns-recorded chip', () => {
      expect(PANEL_SOURCE).toMatch(/t\.status\s*===\s*['"]vitalsigns-recorded['"]/);
      expect(PANEL_SOURCE).toMatch(/บันทึกข้อมูลซักประวัติ/);
    });

    it('V1.13 — Panel chip uses teal styling', () => {
      const idx = PANEL_SOURCE.indexOf("'vitalsigns-recorded'");
      const region = PANEL_SOURCE.slice(idx, idx + 800);
      expect(region).toMatch(/bg-teal-(100|950)/);
    });

    it('V1.14 — CDV renders vitalsigns-recorded chip', () => {
      expect(CDV_SOURCE).toMatch(/['"]vitalsigns-recorded['"]/);
      expect(CDV_SOURCE).toMatch(/บันทึกข้อมูลซักประวัติ/);
    });
  });

  describe('V1 — layout reorder (Task 1)', () => {
    it('V1.15 — customerNote precedes ข้อมูลสุขภาพลูกค้า', () => {
      const noteIdx = TFP_SOURCE.indexOf('tfp-customer-note');
      const healthIdx = TFP_SOURCE.indexOf('ข้อมูลสุขภาพลูกค้า');
      expect(noteIdx).toBeGreaterThan(0);
      expect(healthIdx).toBeGreaterThan(0);
      expect(noteIdx).toBeLessThan(healthIdx);
    });
  });
});
```

- [ ] **Step 2: Run source-grep → expect ALL PASS (post-Tasks 1-4)**

```bash
cd F:/LoverClinic-app && npx vitest run tests/phase-26-2f-pre-vitals-save-source-grep.test.js 2>&1 | tail -10
```

Expected: 15 PASS (V1.1-V1.15).

- [ ] **Step 3: Create F11 flow-simulate**

Create `tests/phase-26-2f-pre-vitals-save-flow-simulate.test.js`:

```js
import { describe, it, expect } from 'vitest';

/**
 * Phase 26.2f-pre Rule I full-flow simulate (F11).
 *
 * Pure simulator mirroring handleSubmit saveMode routing + status state
 * machine + canAddNewItems gate. No React mount; no real Firestore.
 */

function simulateStatusPatch({ saveMode, isEdit, loadedTreatmentStatus }) {
  if (saveMode === 'doctor') {
    return { status: 'doctor-recorded', recordedBy: 'mock-uid', recordedAt: 'mock-ts' };
  }
  if (saveMode === 'vitals') {
    return { status: 'vitalsigns-recorded', recordedBy: 'mock-uid', recordedAt: 'mock-ts' };
  }
  // admin regular save: clear status (idempotent)
  return { status: '[deleteField]' };
}

function simulateCanAddNewItems({ mode, loadedTreatmentStatus }) {
  return (mode === 'create')
    || (loadedTreatmentStatus === 'doctor-recorded')
    || (loadedTreatmentStatus === 'vitalsigns-recorded');
}

function simulateDoctorSaveGateVisible({ isEdit, loadedTreatmentStatus }) {
  return (!isEdit) || (loadedTreatmentStatus === 'vitalsigns-recorded');
}

function simulateVitalsSaveGateVisible({ isEdit }) {
  return !isEdit;
}

describe('Phase 26.2f-pre — Rule I full-flow simulate (F11)', () => {
  it('F11.1 — create mode + vitals-save → stamps vitalsigns-recorded', () => {
    const patch = simulateStatusPatch({ saveMode: 'vitals', isEdit: false, loadedTreatmentStatus: undefined });
    expect(patch.status).toBe('vitalsigns-recorded');
    expect(patch.recordedBy).toBeTruthy();
    expect(patch.recordedAt).toBeTruthy();
  });

  it('F11.2 — edit mode + status=vitalsigns-recorded + doctor-save → transitions to doctor-recorded', () => {
    const patch = simulateStatusPatch({ saveMode: 'doctor', isEdit: true, loadedTreatmentStatus: 'vitalsigns-recorded' });
    expect(patch.status).toBe('doctor-recorded');
  });

  it('F11.3 — edit mode + status=doctor-recorded + regular save → clears status', () => {
    const patch = simulateStatusPatch({ saveMode: 'staff', isEdit: true, loadedTreatmentStatus: 'doctor-recorded' });
    expect(patch.status).toBe('[deleteField]');
  });

  it('F11.4 — edit mode + status=vitalsigns-recorded + regular save → clears status (admin shortcut)', () => {
    const patch = simulateStatusPatch({ saveMode: 'staff', isEdit: true, loadedTreatmentStatus: 'vitalsigns-recorded' });
    expect(patch.status).toBe('[deleteField]');
  });

  it('F11.5 — canAddNewItems truthy for both vitals + doctor statuses in edit mode', () => {
    expect(simulateCanAddNewItems({ mode: 'edit', loadedTreatmentStatus: 'vitalsigns-recorded' })).toBe(true);
    expect(simulateCanAddNewItems({ mode: 'edit', loadedTreatmentStatus: 'doctor-recorded' })).toBe(true);
    expect(simulateCanAddNewItems({ mode: 'edit', loadedTreatmentStatus: undefined })).toBe(false);
    expect(simulateCanAddNewItems({ mode: 'create', loadedTreatmentStatus: undefined })).toBe(true);
  });

  it('F11.6 — doctor-save button gate accepts edit + vitalsigns-recorded', () => {
    expect(simulateDoctorSaveGateVisible({ isEdit: false, loadedTreatmentStatus: undefined })).toBe(true);
    expect(simulateDoctorSaveGateVisible({ isEdit: true, loadedTreatmentStatus: 'vitalsigns-recorded' })).toBe(true);
    expect(simulateDoctorSaveGateVisible({ isEdit: true, loadedTreatmentStatus: 'doctor-recorded' })).toBe(false);
    expect(simulateDoctorSaveGateVisible({ isEdit: true, loadedTreatmentStatus: undefined })).toBe(false);
  });

  it('F11.7 — vitals-save button gate is create-only', () => {
    expect(simulateVitalsSaveGateVisible({ isEdit: false })).toBe(true);
    expect(simulateVitalsSaveGateVisible({ isEdit: true })).toBe(false);
  });

  it('F11.8 — 3-stage workflow: admin vitals → doctor doctor → admin regular = complete chain', () => {
    // Stage 1: admin create + vitals
    const stage1 = simulateStatusPatch({ saveMode: 'vitals', isEdit: false });
    expect(stage1.status).toBe('vitalsigns-recorded');

    // Stage 2: doctor edit + doctor-save
    const stage2 = simulateStatusPatch({ saveMode: 'doctor', isEdit: true, loadedTreatmentStatus: 'vitalsigns-recorded' });
    expect(stage2.status).toBe('doctor-recorded');

    // Stage 3: admin edit + regular save
    const stage3 = simulateStatusPatch({ saveMode: 'staff', isEdit: true, loadedTreatmentStatus: 'doctor-recorded' });
    expect(stage3.status).toBe('[deleteField]');
  });
});
```

- [ ] **Step 4: Run F11 → 8 PASS**

```bash
cd F:/LoverClinic-app && npx vitest run tests/phase-26-2f-pre-vitals-save-flow-simulate.test.js 2>&1 | tail -10
```

Expected: 8 PASS.

- [ ] **Step 5: Create V2 RTL (optional minimal — just test the button renders + chip renders + states gate correctly via TFP source-grep since RTL-mounting TFP is complex)**

Create `tests/phase-26-2f-pre-vitals-save-rtl.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Stub formatThaiDateFull
vi.mock('../src/utils.js', async () => {
  const actual = await vi.importActual('../src/utils.js');
  return { ...actual, formatThaiDateFull: () => '13 พฤษภาคม 2569' };
});

import TreatmentReadOnlyPanel from '../src/components/backend/TreatmentReadOnlyPanel.jsx';

describe('Phase 26.2f-pre — V2 RTL', () => {
  describe('V2 — Panel renders vitalsigns-recorded chip', () => {
    it('V2.1 — chip visible when treatmentSummary.status === "vitalsigns-recorded"', () => {
      render(
        <TreatmentReadOnlyPanel
          treatmentSummary={{ id: 'TR-1', date: '2026-05-13', status: 'vitalsigns-recorded' }}
          treatmentFull={{ detail: {} }}
          theme="dark"
          accentColor="#a78bfa"
          isLatest={true}
        />
      );
      expect(screen.getByTestId('treatment-status-chip-vitalsigns-recorded-TR-1')).toBeInTheDocument();
      expect(screen.getByText('บันทึกข้อมูลซักประวัติ')).toBeInTheDocument();
    });

    it('V2.2 — chip absent when status undefined', () => {
      render(
        <TreatmentReadOnlyPanel
          treatmentSummary={{ id: 'TR-2', date: '2026-05-13' }}
          treatmentFull={{ detail: {} }}
          theme="dark"
          accentColor="#a78bfa"
        />
      );
      expect(screen.queryByText('บันทึกข้อมูลซักประวัติ')).toBeNull();
    });

    it('V2.3 — both chips can render if status transitions are mid-flow (only one at a time)', () => {
      // Only one status at a time; this confirms doctor-recorded chip doesn't appear when status is vitals
      render(
        <TreatmentReadOnlyPanel
          treatmentSummary={{ id: 'TR-3', date: '2026-05-13', status: 'vitalsigns-recorded' }}
          treatmentFull={{ detail: {} }}
          theme="dark"
          accentColor="#a78bfa"
        />
      );
      expect(screen.queryByText('แพทย์ลงบันทึก')).toBeNull();
      expect(screen.getByText('บันทึกข้อมูลซักประวัติ')).toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 6: Run V2 RTL → 3 PASS**

```bash
cd F:/LoverClinic-app && npx vitest run tests/phase-26-2f-pre-vitals-save-rtl.test.jsx 2>&1 | tail -10
```

Expected: 3 PASS.

- [ ] **Step 7: Append AV37 extension to audit-branch-scope.test.js**

Find the existing AV37 describe block in `tests/audit-branch-scope.test.js`. Append BEFORE its closing `});`:

```js
  // ─── AV37 extension (Phase 26.2f-pre, 2026-05-13) — vitals-save invariants
  it('AV37.12 saveMode coercion accepts "vitals" string', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/TreatmentFormPage.jsx', 'utf8');
    expect(src).toMatch(/eventOrSaveMode\s*===\s*['"]vitals['"]/);
  });

  it('AV37.13 8 deduction gates extended to skip both doctor AND vitals', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/TreatmentFormPage.jsx', 'utf8');
    const matches = src.match(/saveMode\s*!==\s*['"]doctor['"]\s*&&\s*saveMode\s*!==\s*['"]vitals['"]/g);
    expect(matches?.length).toBeGreaterThanOrEqual(8);
  });

  it('AV37.14 v26StatusPatch stamps vitalsigns-recorded when saveMode === "vitals"', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/TreatmentFormPage.jsx', 'utf8');
    expect(src).toMatch(/saveMode\s*===\s*['"]vitals['"]\s*\?\s*\{[\s\S]{0,300}?status:\s*['"]vitalsigns-recorded['"]/);
  });

  it('AV37.15 vitals-save button is create-only', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/TreatmentFormPage.jsx', 'utf8');
    const idx = src.indexOf('tfp-vitals-save-btn');
    expect(idx).toBeGreaterThan(0);
    const before = src.slice(Math.max(0, idx - 400), idx);
    expect(before).toMatch(/\{!isEdit\s*&&/);
  });

  it('AV37.16 doctor-save gate accepts loadedTreatmentStatus === "vitalsigns-recorded"', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/TreatmentFormPage.jsx', 'utf8');
    const idx = src.indexOf('tfp-doctor-save-btn');
    const before = src.slice(Math.max(0, idx - 500), idx);
    expect(before).toMatch(/loadedTreatmentStatus\s*===\s*['"]vitalsigns-recorded['"]/);
  });

  it('AV37.17 canAddNewItems references vitalsigns-recorded', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/TreatmentFormPage.jsx', 'utf8');
    expect(src).toMatch(/canAddNewItems[\s\S]{0,300}?vitalsigns-recorded/);
  });
```

- [ ] **Step 8: Extend AV37 entry in audit-anti-vibe-code/SKILL.md**

Open `.agents/skills/audit-anti-vibe-code/SKILL.md`. Find the AV37 entry. Append after the existing description:

```markdown

**Phase 26.2f-pre extension (V26.2f, 2026-05-13)**: AV37 extended with 6 new sub-tests (AV37.12-AV37.17) covering the NEW `saveMode === 'vitals'` workflow:

- `saveMode` argument now accepts `'vitals'` as 5th locked-X family member (after `lockedCustomer` + `lockedAppointmentType` + `lockedChannel` + `saveMode='doctor'`)
- Deduction/sale gates skip BOTH 'doctor' AND 'vitals' (8+ sites)
- `v26StatusPatch` stamps `status: 'vitalsigns-recorded'` + `recordedBy` + `recordedAt` when `saveMode === 'vitals'`
- Vitals-save button is create-only (mirror Phase 26.0d gate)
- Doctor-save button gate extended to accept `loadedTreatmentStatus === 'vitalsigns-recorded'` (NEW edit-mode transition)
- `canAddNewItems` extended to recognize both `'doctor-recorded'` AND `'vitalsigns-recorded'` statuses

Source-grep regression: `tests/audit-branch-scope.test.js` AV37.12-AV37.17.
```

- [ ] **Step 9: Run AV37 → all PASS**

```bash
cd F:/LoverClinic-app && npx vitest run tests/audit-branch-scope.test.js -t "AV37" 2>&1 | tail -10
```

Expected: 11 AV37 + 6 AV37.12-17 = 17 PASS.

- [ ] **Step 10: Commit + push**

```bash
cd F:/LoverClinic-app
git add tests/phase-26-2f-pre-vitals-save-source-grep.test.js tests/phase-26-2f-pre-vitals-save-rtl.test.jsx tests/phase-26-2f-pre-vitals-save-flow-simulate.test.js tests/audit-branch-scope.test.js .agents/skills/audit-anti-vibe-code/SKILL.md
git commit -m "$(cat <<'EOF'
test(Phase 26.2f-pre Task 5): V1 + V2 + F11 + AV37 extension

NEW tests covering Phase 26.2f-pre vitals-save workflow:
- V1 source-grep (15 assertions): saveMode coercion + 8-gates extension +
  v26StatusPatch vitals branch + vitals-save button + doctor-save edit-mode
  enablement + canAddNewItems extension + chip rendering in Panel + CDV +
  layout reorder verification
- V2 RTL (3 assertions): Panel renders vitalsigns-recorded chip correctly;
  doctor-recorded chip absent when status=vitals; chip hidden when status
  undefined
- F11 Rule I flow-simulate (8 assertions): 3-stage workflow chain admin
  vitals → doctor doctor → admin regular = complete; canAddNewItems gate;
  doctor-save gate; vitals-save gate

AV37 extension (audit-branch-scope.test.js + SKILL.md):
- AV37.12-17 = 6 new sub-tests locking vitals-save invariants
- SKILL.md AV37 entry extended with Phase 26.2f-pre paragraph

Total Phase 26.2f-pre delta: +32 NEW assertions GREEN.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin master 2>&1 | tail -3
```

---

## Task 6: Phase 26.2f — NEW TreatmentReadOnlyMirror component

**Files:**
- Create: `src/components/backend/TreatmentReadOnlyMirror.jsx`

- [ ] **Step 1: Grep TFP's OPD card section to enumerate full field list**

```bash
cd F:/LoverClinic-app && grep -nE "CC|PE|DX|Tx|Plan|Note|หมายเหตุ" src/components/TreatmentFormPage.jsx | head -20
```

Note any OPD fields beyond CC/PE/DX/Tx/Plan/Note (e.g., "หมายเหตุเพิ่มเติม"). Mirror MUST render them all.

- [ ] **Step 2: Create the Mirror component**

Create `src/components/backend/TreatmentReadOnlyMirror.jsx`:

```jsx
import { useState, useEffect } from 'react';
import {
  X, Stethoscope, Calendar, MapPin, User, Pill, Package, FileText, Heart,
  Activity, ClipboardCheck, ClipboardList, Lock, Image as ImageIcon, Loader2,
} from 'lucide-react';
import { fmtThaiDate, THAI_MONTHS_FULL } from '../../lib/dateFormat.js';

/**
 * Phase 26.2f (V26.2f, 2026-05-13) — Full TFP-mirror read-only view.
 *
 * Replaces the condensed TreatmentReadOnlyPanel for TFP split-screen
 * consumers. Mirrors the editable TFP form layout (section by section)
 * but renders every field as a disabled input/textarea/select pre-filled
 * with historical values. No save buttons. No autosave. No edit handlers.
 *
 * AV39 read-only contract (Phase 26.2h):
 *   - All <input> / <textarea> / <select> MUST have `disabled` attribute
 *   - NO save / submit button text ("บันทึก" / "Save" inside <button>)
 *   - NO onEditTreatment / onDeleteTreatment props
 *   - NO onChange handlers on form fields (or only no-op)
 *   - Lightbox + image zoom permitted (read interaction, not edit)
 *
 * Props:
 *   - treatmentDoc: full Firestore doc with `detail` sub-object (null OK)
 *   - theme: 'dark' | 'light'
 *   - accentColor: hex string for accent (defaults to #2EC4B6)
 *   - isLatest: boolean for "ล่าสุด" badge
 *   - showCloseButton: boolean (TFP split-screen sets true)
 *   - onClose: function called on close button click
 */

// ── Local helpers ──────────────────────────────────────────────────────

function extractDisplayString(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    return value.displayName || value.name || value.id || '';
  }
  return String(value);
}

function extractDisplayArray(values) {
  if (!Array.isArray(values)) return [];
  return values.map(extractDisplayString).filter(Boolean);
}

function formatThaiDateFull(dateISO) {
  if (!dateISO) return '';
  const parts = String(dateISO).split('-');
  if (parts.length !== 3) return dateISO;
  const [y, m, d] = parts;
  const yearBE = parseInt(y, 10) + 543;
  const monthName = THAI_MONTHS_FULL[parseInt(m, 10) - 1] || m;
  return `${parseInt(d, 10)} ${monthName} ${yearBE}`;
}

function hexToRgb(hex) {
  const cleaned = hex.replace('#', '');
  const r = parseInt(cleaned.substring(0, 2), 16);
  const g = parseInt(cleaned.substring(2, 4), 16);
  const b = parseInt(cleaned.substring(4, 6), 16);
  return `${r},${g},${b}`;
}

// ── Disabled field primitives ──────────────────────────────────────────

const inputClsBase = 'w-full bg-[var(--bg-card)] border border-[var(--bd)] rounded-lg px-3 py-2 text-sm text-[var(--tx-primary)]';
const disabledCls = 'disabled:cursor-not-allowed disabled:opacity-90';
const labelCls = 'block text-xs font-semibold text-[var(--tx-muted)] mb-1';

function DisabledInput({ label, value, type = 'text', dataField }) {
  return (
    <div data-field={dataField}>
      {label && <label className={labelCls}>{label}</label>}
      <input
        type={type}
        disabled
        value={value || ''}
        onChange={() => {}}
        className={`${inputClsBase} ${disabledCls}`}
      />
    </div>
  );
}

function DisabledTextarea({ label, value, rows = 3, dataField }) {
  return (
    <div data-field={dataField}>
      {label && <label className={labelCls}>{label}</label>}
      <textarea
        disabled
        value={value || ''}
        onChange={() => {}}
        rows={rows}
        className={`${inputClsBase} ${disabledCls} resize-none`}
      />
    </div>
  );
}

function DisabledSelect({ label, value, dataField }) {
  return (
    <div data-field={dataField}>
      {label && <label className={labelCls}>{label}</label>}
      <select
        disabled
        value={value || ''}
        onChange={() => {}}
        className={`${inputClsBase} ${disabledCls}`}
      >
        <option value={value || ''}>{value || '—'}</option>
      </select>
    </div>
  );
}

function DisabledCheckbox({ label, checked }) {
  return (
    <label className="flex items-center gap-2 text-xs text-[var(--tx-secondary)] py-1">
      <input
        type="checkbox"
        disabled
        checked={!!checked}
        onChange={() => {}}
        className={disabledCls}
      />
      <span>{label}</span>
    </label>
  );
}

function ChipStrip({ label, values }) {
  return (
    <div>
      {label && <label className={labelCls}>{label}</label>}
      <div className="flex flex-wrap gap-1.5">
        {values.length === 0 ? (
          <span className="text-xs text-[var(--tx-muted)] italic">—</span>
        ) : (
          values.map((v, i) => (
            <span key={i} className="inline-flex items-center gap-1 bg-[var(--bg-hover)] border border-[var(--bd)] rounded-full px-2 py-0.5 text-xs text-[var(--tx-secondary)]">
              {v}
            </span>
          ))
        )}
      </div>
    </div>
  );
}

// ── Section wrapper (mirrors TFP's FormSection visual style) ──────────

function MirrorSection({ icon: Icon, title, children, isDark }) {
  return (
    <div className={`rounded-xl p-3 border border-[var(--bd)] ${isDark ? 'bg-[var(--bg-card)]' : 'bg-white'}`}>
      <div className="flex items-center gap-2 mb-2.5 pb-2 border-b border-[var(--bd)]">
        {Icon && <Icon size={14} className="text-[var(--tx-secondary)]" />}
        <h3 className="text-xs font-bold uppercase tracking-wider text-[var(--tx-heading)]">{title}</h3>
      </div>
      <div className="space-y-2">
        {children}
      </div>
    </div>
  );
}

// ── ImageColumn (copied from TreatmentReadOnlyPanel — duplicate inline; future refactor: shared) ──

function ImageColumn({ label, images, onZoom }) {
  if (!images || images.length === 0) {
    return (
      <div className="rounded-lg border border-[var(--bd)] border-dashed p-3 flex items-center justify-center text-[10px] text-[var(--tx-muted)]">
        <ImageIcon size={14} className="mr-1.5 opacity-40" />
        ไม่มี {label}
      </div>
    );
  }
  return (
    <div className="space-y-1">
      <p className="text-[10px] font-semibold text-[var(--tx-muted)]">{label}</p>
      {images.map((img, i) => (
        <button
          key={img.id || i}
          onClick={() => onZoom(img.dataUrl, label)}
          data-testid={`mirror-img-zoom-${label}-${i}`}
          aria-label={`ขยายรูป ${label}`}
          className="block w-full rounded overflow-hidden hover:opacity-80 transition-opacity cursor-zoom-in"
        >
          <img src={img.dataUrl} alt={`${label} ${i + 1}`} className="w-full h-auto" />
        </button>
      ))}
    </div>
  );
}

// ── Main Mirror component ──────────────────────────────────────────────

export default function TreatmentReadOnlyMirror({
  treatmentDoc,
  theme = 'dark',
  accentColor = '#2EC4B6',
  isLatest = false,
  showCloseButton = false,
  onClose,
}) {
  const isDark = theme !== 'light';
  const ac = accentColor || '#2EC4B6';
  const acRgb = hexToRgb(ac);
  const detail = treatmentDoc?.detail || {};
  const status = treatmentDoc?.status;

  // Self-contained lightbox
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      if (lightbox) setLightbox(null);
      else onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, lightbox]);

  // Extracted display values
  const doctorName = extractDisplayString(detail.doctor);
  const assistantNames = extractDisplayArray(detail.assistants);
  const treatmentDate = detail.treatmentDate || '';
  const customerNote = detail.customerNote || detail.note || '';
  const bloodType = detail.bloodType || '';
  const chronicDisease = detail.chronicDisease || '';
  const drugAllergy = detail.drugAllergy || detail.allergiesDetail || '';
  const otherHistory = detail.otherHistory || detail.medicalHistory || '';
  const vitals = detail.vitalSigns || detail.vitals || {};
  const cert = detail.medicalCert || detail.certOptions || {};

  // OPD fields
  const cc = detail.symptoms || detail.cc || '';
  const pe = detail.physicalExam || detail.pe || '';
  const dx = detail.diagnosis || detail.dx || '';
  const tx = detail.treatmentNote || detail.tx || '';
  const plan = detail.plan || '';
  const note = detail.note || detail.opdNote || '';
  const extraNote = detail.additionalNote || detail.extraNote || '';

  // Items
  const chartImages = detail.chartImages || detail.charts || [];
  const courseItems = detail.treatmentItems || [];
  const medications = detail.medications || detail.takeHomeMeds || [];
  const consumables = detail.consumables || [];
  const beforeImages = detail.beforeImages || [];
  const afterImages = detail.afterImages || [];
  const otherImages = detail.otherImages || [];

  const isLoading = !treatmentDoc;

  return (
    <div data-testid="treatment-read-only-mirror" className="space-y-3">
      {/* Header — Date + isLatest + status chip + close button */}
      <div className="flex items-center gap-2 flex-wrap">
        <Calendar size={14} style={{ color: ac }} />
        <span className="text-sm font-bold text-[var(--tx-heading)]">
          {formatThaiDateFull(treatmentDate) || '-'}
        </span>
        {isLatest && (
          <span
            className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
            style={{ backgroundColor: `rgba(${acRgb},0.15)`, color: ac }}
          >
            ล่าสุด
          </span>
        )}
        {status === 'doctor-recorded' && (
          <span
            data-testid={`mirror-status-chip-doctor-recorded`}
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1 border ${isDark ? 'bg-amber-950 border-amber-800 text-amber-100' : 'bg-amber-100 border-amber-200 text-amber-900'}`}
            title="แพทย์ลงบันทึก"
          >
            <Stethoscope size={10} />
            <span>แพทย์ลงบันทึก</span>
          </span>
        )}
        {status === 'vitalsigns-recorded' && (
          <span
            data-testid={`mirror-status-chip-vitalsigns-recorded`}
            className={`text-[10px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1 border ${isDark ? 'bg-teal-950 border-teal-800 text-teal-100' : 'bg-teal-100 border-teal-200 text-teal-900'}`}
            title="บันทึกข้อมูลซักประวัติ"
          >
            <Activity size={10} />
            <span>บันทึกข้อมูลซักประวัติ</span>
          </span>
        )}
        {showCloseButton && (
          <button
            onClick={onClose}
            data-testid="treatment-read-only-mirror-close"
            aria-label="ปิด"
            className="ml-auto p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--tx-muted)]"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Read-only banner */}
      <div className={`inline-flex items-center gap-1.5 ${isDark ? 'bg-[var(--bg-card)]' : 'bg-gray-50'} border border-[var(--bd)] rounded-md px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--tx-muted)]`}>
        <Lock size={11} />
        <span>อ่านอย่างเดียว · บันทึกการรักษานี้</span>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-xs text-[var(--tx-muted)] py-6 justify-center">
          <Loader2 size={14} className="animate-spin" />
          กำลังโหลดรายละเอียด...
        </div>
      ) : (
        <>
          {/* Section 1: ข้อมูลการรักษา */}
          <MirrorSection icon={Stethoscope} title="ข้อมูลการรักษา" isDark={isDark}>
            <DisabledSelect label="แพทย์" value={doctorName} dataField="doctor" />
            <ChipStrip label="ผู้ช่วยแพทย์" values={assistantNames} />
            <DisabledInput label="วันที่รักษา" value={formatThaiDateFull(treatmentDate)} dataField="treatmentDate" />
          </MirrorSection>

          {/* Section 2: หมายเหตุทั่วไป (only when present) */}
          {customerNote && (
            <MirrorSection icon={ClipboardCheck} title="หมายเหตุทั่วไป" isDark={isDark}>
              <DisabledTextarea value={customerNote} rows={2} dataField="customerNote" />
            </MirrorSection>
          )}

          {/* Section 3: ข้อมูลสุขภาพลูกค้า */}
          <MirrorSection icon={Heart} title="ข้อมูลสุขภาพลูกค้า" isDark={isDark}>
            <DisabledSelect label="กรุ๊ปเลือด" value={bloodType} dataField="bloodType" />
            <DisabledTextarea label="โรคประจำตัว" value={chronicDisease} rows={2} dataField="chronicDisease" />
            <DisabledTextarea label="ประวัติแพ้ยา" value={drugAllergy} rows={2} dataField="drugAllergy" />
            <DisabledTextarea label="ประวัติการรักษาอื่นๆ" value={otherHistory} rows={2} dataField="otherHistory" />
          </MirrorSection>

          {/* Section 4: ข้อมูลซักประวัติ (Vital Signs) */}
          <MirrorSection icon={Activity} title="ข้อมูลซักประวัติ (Vital Signs)" isDark={isDark}>
            <div className="grid grid-cols-3 gap-2">
              <DisabledInput label="น้ำหนัก (kg)" value={vitals.weight} dataField="weight" />
              <DisabledInput label="ส่วนสูง (cm)" value={vitals.height} dataField="height" />
              <DisabledInput label="BMI" value={vitals.bmi} dataField="bmi" />
              <DisabledInput label="BT (°C)" value={vitals.bt} dataField="bt" />
              <DisabledInput label="PR (bpm)" value={vitals.pr} dataField="pr" />
              <DisabledInput label="RR" value={vitals.rr} dataField="rr" />
              <DisabledInput label="SBP (mmHg)" value={vitals.sbp} dataField="sbp" />
              <DisabledInput label="DBP (mmHg)" value={vitals.dbp} dataField="dbp" />
              <DisabledInput label="O2 Sat (%)" value={vitals.o2sat} dataField="o2sat" />
            </div>
          </MirrorSection>

          {/* Section 5: ใบรับรองแพทย์ */}
          <MirrorSection title="ใบรับรองแพทย์" isDark={isDark}>
            <DisabledCheckbox label="ผู้ป่วยมารักษาวันนี้จริง" checked={cert.confirmVisit || cert.attended} />
            <DisabledCheckbox label="ให้หยุดพัก" checked={cert.giveSickLeave || cert.restDays} />
            <DisabledCheckbox label="อื่นๆ" checked={cert.other} />
          </MirrorSection>

          {/* Section 6: OPD Card */}
          <MirrorSection icon={ClipboardList} title="OPD Card" isDark={isDark}>
            <DisabledTextarea label="CC — อาการ (Chief Complaint)" value={cc} dataField="cc" />
            <DisabledTextarea label="PE — ตรวจร่างกาย (Physical Exam)" value={pe} dataField="pe" />
            <DisabledTextarea label="DX — วินิจฉัยโรค (Diagnosis)" value={dx} dataField="dx" />
            <DisabledTextarea label="Tx — รักษา / Dr. Note" value={tx} dataField="tx" />
            <DisabledTextarea label="Plan — แผนการรักษา" value={plan} dataField="plan" />
            <DisabledTextarea label="Note — หมายเหตุการรักษา" value={note} dataField="note" />
            {extraNote && (
              <DisabledTextarea label="หมายเหตุเพิ่มเติม" value={extraNote} dataField="extraNote" />
            )}
          </MirrorSection>

          {/* Section 7: CHART images (if any) */}
          {chartImages.length > 0 && (
            <MirrorSection icon={FileText} title="CHART" isDark={isDark}>
              <div className="grid grid-cols-2 gap-2">
                {chartImages.map((img, i) => (
                  <button
                    key={img.id || i}
                    onClick={() => setLightbox({ src: img.dataUrl, label: `CHART ${i + 1}` })}
                    data-testid={`mirror-chart-zoom-${i}`}
                    className="block w-full rounded overflow-hidden hover:opacity-80 transition-opacity cursor-zoom-in"
                  >
                    <img src={img.dataUrl} alt={`CHART ${i + 1}`} className="w-full h-auto" />
                  </button>
                ))}
              </div>
            </MirrorSection>
          )}

          {/* Section 8: รายการรักษา */}
          {courseItems.length > 0 && (
            <MirrorSection title="รายการรักษา" isDark={isDark}>
              <ul className="space-y-1">
                {courseItems.map((item, i) => (
                  <li key={i} className="flex items-center justify-between text-xs">
                    <span className="text-[var(--tx-secondary)]">{item.name || item.productName || '-'}</span>
                    <span className="font-mono text-[var(--tx-muted)]">{item.qty || ''} {item.unit || ''}</span>
                  </li>
                ))}
              </ul>
            </MirrorSection>
          )}

          {/* Section 9: ยากลับบ้าน */}
          {medications.length > 0 && (
            <MirrorSection icon={Pill} title="ยากลับบ้าน" isDark={isDark}>
              <ul className="space-y-1">
                {medications.map((m, i) => (
                  <li key={i} className="text-xs text-[var(--tx-secondary)]">
                    {m.name || m.productName || '-'} <span className="font-mono text-[var(--tx-muted)]">{m.qty} {m.unit}</span>
                  </li>
                ))}
              </ul>
            </MirrorSection>
          )}

          {/* Section 10: สินค้าสิ้นเปลือง */}
          {consumables.length > 0 && (
            <MirrorSection icon={Package} title="สินค้าสิ้นเปลือง" isDark={isDark}>
              <ul className="space-y-1">
                {consumables.map((c, i) => (
                  <li key={i} className="text-xs text-[var(--tx-secondary)]">
                    {c.name || c.productName || '-'} <span className="font-mono text-[var(--tx-muted)]">{c.qty} {c.unit}</span>
                  </li>
                ))}
              </ul>
            </MirrorSection>
          )}

          {/* Section 11: รูปภาพการรักษา */}
          {(otherImages.length > 0 || beforeImages.length > 0 || afterImages.length > 0) && (
            <MirrorSection title="รูปภาพการรักษา" isDark={isDark}>
              <div className="grid grid-cols-3 gap-2">
                <ImageColumn label="OPD/อื่นๆ" images={otherImages} onZoom={(src, label) => setLightbox({ src, label })} />
                <ImageColumn label="Before" images={beforeImages} onZoom={(src, label) => setLightbox({ src, label })} />
                <ImageColumn label="After" images={afterImages} onZoom={(src, label) => setLightbox({ src, label })} />
              </div>
            </MirrorSection>
          )}
        </>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-[110] bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <div className="max-w-5xl w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-2 text-white">
              <span className="text-sm font-bold">{lightbox.label}</span>
              <button onClick={() => setLightbox(null)} className="p-1 hover:opacity-70" aria-label="ปิด">
                <X size={20} />
              </button>
            </div>
            <img src={lightbox.src} alt={lightbox.label} className="w-full h-auto max-h-[80vh] object-contain rounded-lg" />
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Build clean (Mirror file compiles)**

```bash
cd F:/LoverClinic-app && npm run build 2>&1 | tail -5
```

Expected: clean. If any import fails (e.g., `THAI_MONTHS_FULL` not exported), check `src/lib/dateFormat.js` and adjust import.

- [ ] **Step 4: Commit + push**

```bash
cd F:/LoverClinic-app
git add src/components/backend/TreatmentReadOnlyMirror.jsx
git commit -m "$(cat <<'EOF'
feat(Phase 26.2f Task 6): TreatmentReadOnlyMirror component (~700 LOC)

NEW src/components/backend/TreatmentReadOnlyMirror.jsx — comprehensive
read-only mirror of TFP form. Replaces condensed TreatmentReadOnlyPanel
for TFP split-screen consumers (TimelineModal stays on Panel).

Layout sections (mirror TFP form order post-Phase 26.2f-pre):
- Header (Date + isLatest + status chip + close button)
- Read-only banner ("อ่านอย่างเดียว · บันทึกการรักษานี้" with Lock icon)
- Section 1: ข้อมูลการรักษา (แพทย์ select + ผู้ช่วยแพทย์ chips + วันที่)
- Section 2: หมายเหตุทั่วไป (when present)
- Section 3: ข้อมูลสุขภาพลูกค้า (blood + chronic + allergy + history)
- Section 4: Vital Signs 3x3 grid
- Section 5: ใบรับรองแพทย์ checkboxes
- Section 6: OPD Card (CC/PE/DX/Tx/Plan/Note/extraNote)
- Section 7: CHART images (zoomable)
- Section 8-10: course items / medications / consumables
- Section 11: 3-column image grid (OPD/Before/After)
- Lightbox for image zoom

Disabled field primitives (local to Mirror, NOT exported):
- DisabledInput / DisabledTextarea / DisabledSelect / DisabledCheckbox
- All use `disabled` attribute + no-op onChange + cursor-not-allowed
  + opacity-90 (visual "locked but visible")

Helpers:
- extractDisplayString(value) — handles string OR object {displayName,
  name, id} (FIXES the [object Object] rendering bug)
- extractDisplayArray(values) — maps + filters empty
- formatThaiDateFull(dateISO) — same shape as TimelineModal local helper

Both status chips supported (doctor-recorded amber + vitalsigns-recorded
teal) — distinct from existing Panel chips (Panel handles both already
post-Phase 26.2f-pre Task 4).

Self-contained lightbox state (no prop threading).
Esc handler: close lightbox first, then call onClose.

AV39 read-only contract codified separately in Phase 26.2h.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin master 2>&1 | tail -3
```

---

## Task 7: Phase 26.2f — Mirror M1 source-grep + M2 RTL tests

**Files:**
- Create: `tests/phase-26-2f-mirror-source-grep.test.js`
- Create: `tests/phase-26-2f-mirror-rtl.test.jsx`

- [ ] **Step 1: Create M1 source-grep**

Create `tests/phase-26-2f-mirror-source-grep.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const MIRROR_PATH = join(process.cwd(), 'src/components/backend/TreatmentReadOnlyMirror.jsx');
const MIRROR_SOURCE = readFileSync(MIRROR_PATH, 'utf-8');

describe('Phase 26.2f Mirror — source-grep (M1)', () => {
  describe('M1 — File presence + AV39 invariants', () => {
    it('M1.1 — Mirror file exists at canonical path', () => {
      expect(MIRROR_SOURCE.length).toBeGreaterThan(1000);
    });

    it('M1.2 — Mirror has data-testid="treatment-read-only-mirror"', () => {
      expect(MIRROR_SOURCE).toMatch(/data-testid="treatment-read-only-mirror"/);
    });

    it('M1.3 — extractDisplayString helper handles object values', () => {
      expect(MIRROR_SOURCE).toMatch(/function extractDisplayString\(value\)/);
      expect(MIRROR_SOURCE).toMatch(/value\.displayName/);
    });

    it('M1.4 — Every input/textarea/select has disabled attribute (AV39)', () => {
      // Strip comments first
      const code = MIRROR_SOURCE
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');

      // Every <input ...> must have `disabled` (skip generic JSX patterns)
      const inputMatches = code.match(/<input\b[^>]*>/g) || [];
      for (const m of inputMatches) {
        expect(m).toMatch(/disabled/);
      }
      const textareaMatches = code.match(/<textarea\b[^>]*>/g) || [];
      for (const m of textareaMatches) {
        expect(m).toMatch(/disabled/);
      }
      const selectMatches = code.match(/<select\b[^>]*>/g) || [];
      for (const m of selectMatches) {
        expect(m).toMatch(/disabled/);
      }
    });

    it('M1.5 — NO save / submit button text (no "บันทึก" / "Save" inside <button>)', () => {
      const code = MIRROR_SOURCE
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
      expect(code).not.toMatch(/<button[\s\S]*?บันทึก[\s\S]*?<\/button>/);
      expect(code).not.toMatch(/<button[^>]*>\s*Save/i);
    });

    it('M1.6 — NO onEditTreatment / onDeleteTreatment in code body', () => {
      const code = MIRROR_SOURCE
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/[^\n]*/g, '');
      expect(code).not.toMatch(/onEditTreatment/);
      expect(code).not.toMatch(/onDeleteTreatment/);
    });

    it('M1.7 — Lightbox + setLightbox preserved (image zoom permitted)', () => {
      expect(MIRROR_SOURCE).toMatch(/setLightbox/);
      expect(MIRROR_SOURCE).toMatch(/z-\[110\]/);
    });
  });

  describe('M1 — TFP-mirror section ordering', () => {
    it('M1.8 — Section order: ข้อมูลการรักษา → หมายเหตุทั่วไป → ข้อมูลสุขภาพ → Vital Signs → ใบรับรองแพทย์ → OPD Card', () => {
      const i1 = MIRROR_SOURCE.indexOf('ข้อมูลการรักษา');
      const i2 = MIRROR_SOURCE.indexOf('หมายเหตุทั่วไป');
      const i3 = MIRROR_SOURCE.indexOf('ข้อมูลสุขภาพลูกค้า');
      const i4 = MIRROR_SOURCE.indexOf('Vital Signs');
      const i5 = MIRROR_SOURCE.indexOf('ใบรับรองแพทย์');
      const i6 = MIRROR_SOURCE.indexOf('OPD Card');
      // All present
      expect(i1).toBeGreaterThan(0);
      expect(i2).toBeGreaterThan(0);
      expect(i3).toBeGreaterThan(0);
      expect(i4).toBeGreaterThan(0);
      expect(i5).toBeGreaterThan(0);
      expect(i6).toBeGreaterThan(0);
      // In order
      expect(i1).toBeLessThan(i2);
      expect(i2).toBeLessThan(i3);
      expect(i3).toBeLessThan(i4);
      expect(i4).toBeLessThan(i5);
      expect(i5).toBeLessThan(i6);
    });

    it('M1.9 — Read-only banner with Lock icon present', () => {
      expect(MIRROR_SOURCE).toMatch(/อ่านอย่างเดียว/);
      expect(MIRROR_SOURCE).toMatch(/<Lock/);
    });

    it('M1.10 — Both status chips supported (doctor-recorded amber + vitalsigns-recorded teal)', () => {
      expect(MIRROR_SOURCE).toMatch(/status\s*===\s*['"]doctor-recorded['"]/);
      expect(MIRROR_SOURCE).toMatch(/status\s*===\s*['"]vitalsigns-recorded['"]/);
      expect(MIRROR_SOURCE).toMatch(/bg-amber-(100|950)/);
      expect(MIRROR_SOURCE).toMatch(/bg-teal-(100|950)/);
    });
  });
});
```

- [ ] **Step 2: Run M1 → 10 PASS**

```bash
cd F:/LoverClinic-app && npx vitest run tests/phase-26-2f-mirror-source-grep.test.js 2>&1 | tail -10
```

Expected: 10 PASS.

- [ ] **Step 3: Create M2 RTL**

Create `tests/phase-26-2f-mirror-rtl.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../src/lib/dateFormat.js', async () => {
  const actual = await vi.importActual('../src/lib/dateFormat.js');
  return {
    ...actual,
    fmtThaiDate: (d) => d || '',
    THAI_MONTHS_FULL: ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'],
  };
});

import TreatmentReadOnlyMirror from '../src/components/backend/TreatmentReadOnlyMirror.jsx';

const baseDoc = {
  id: 'TR-1',
  treatmentId: 'TR-1',
  status: 'vitalsigns-recorded',
  detail: {
    treatmentDate: '2026-05-13',
    doctor: { displayName: 'หมอมายด์' },
    assistants: [{ displayName: 'ผช.A' }, { displayName: 'ผช.B' }],
    bloodType: 'A',
    chronicDisease: 'เบาหวาน',
    drugAllergy: 'ไม่มี',
    otherHistory: '',
    vitalSigns: {
      weight: '60', height: '170', bmi: '20.8',
      bt: '37.0', pr: '72', rr: '16',
      sbp: '120', dbp: '80', o2sat: '98',
    },
    medicalCert: { confirmVisit: true, giveSickLeave: false, other: false },
    symptoms: 'ปวดหัว',
    diagnosis: 'Tension headache',
    treatmentNote: 'Paracetamol',
    plan: 'F/U 1 wk',
    note: 'ปกติ',
    medications: [{ name: 'Paracetamol 500mg', qty: '10', unit: 'เม็ด' }],
    consumables: [],
    treatmentItems: [],
    beforeImages: [],
    afterImages: [],
    otherImages: [],
    chartImages: [],
  },
};

describe('Phase 26.2f Mirror — RTL (M2)', () => {
  it('M2.1 — renders with status chip (vitalsigns-recorded)', () => {
    render(<TreatmentReadOnlyMirror treatmentDoc={baseDoc} theme="dark" accentColor="#2EC4B6" isLatest={true} />);
    expect(screen.getByTestId('treatment-read-only-mirror')).toBeInTheDocument();
    expect(screen.getByTestId('mirror-status-chip-vitalsigns-recorded')).toBeInTheDocument();
    expect(screen.getByText('บันทึกข้อมูลซักประวัติ')).toBeInTheDocument();
  });

  it('M2.2 — extractDisplayString resolves doctor object to displayName', () => {
    render(<TreatmentReadOnlyMirror treatmentDoc={baseDoc} theme="dark" accentColor="#2EC4B6" />);
    // doctor displayName appears in the disabled select option
    expect(screen.getByText('หมอมายด์')).toBeInTheDocument();
    // [object Object] does NOT appear anywhere
    expect(screen.queryByText('[object Object]')).toBeNull();
  });

  it('M2.3 — assistants array renders as chip strip', () => {
    render(<TreatmentReadOnlyMirror treatmentDoc={baseDoc} theme="dark" accentColor="#2EC4B6" />);
    expect(screen.getByText('ผช.A')).toBeInTheDocument();
    expect(screen.getByText('ผช.B')).toBeInTheDocument();
  });

  it('M2.4 — all major sections render', () => {
    render(<TreatmentReadOnlyMirror treatmentDoc={baseDoc} theme="dark" accentColor="#2EC4B6" />);
    expect(screen.getByText('ข้อมูลการรักษา')).toBeInTheDocument();
    expect(screen.getByText('ข้อมูลสุขภาพลูกค้า')).toBeInTheDocument();
    expect(screen.getByText('ข้อมูลซักประวัติ (Vital Signs)')).toBeInTheDocument();
    expect(screen.getByText('ใบรับรองแพทย์')).toBeInTheDocument();
    expect(screen.getByText('OPD Card')).toBeInTheDocument();
    expect(screen.getByText('ยากลับบ้าน')).toBeInTheDocument();
  });

  it('M2.5 — Vital Signs values render in disabled inputs', () => {
    const { container } = render(<TreatmentReadOnlyMirror treatmentDoc={baseDoc} theme="dark" accentColor="#2EC4B6" />);
    const weightInput = container.querySelector('[data-field="weight"] input');
    expect(weightInput).toBeInTheDocument();
    expect(weightInput.value).toBe('60');
    expect(weightInput).toBeDisabled();
  });

  it('M2.6 — Read-only banner present', () => {
    render(<TreatmentReadOnlyMirror treatmentDoc={baseDoc} theme="dark" accentColor="#2EC4B6" />);
    expect(screen.getByText(/อ่านอย่างเดียว/)).toBeInTheDocument();
  });

  it('M2.7 — close button renders + fires onClose when showCloseButton=true', () => {
    const onClose = vi.fn();
    render(
      <TreatmentReadOnlyMirror
        treatmentDoc={baseDoc}
        theme="dark"
        accentColor="#2EC4B6"
        showCloseButton={true}
        onClose={onClose}
      />
    );
    const btn = screen.getByTestId('treatment-read-only-mirror-close');
    expect(btn).toBeInTheDocument();
    btn.click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('M2.8 — loading state when treatmentDoc null', () => {
    render(<TreatmentReadOnlyMirror treatmentDoc={null} theme="dark" accentColor="#2EC4B6" />);
    expect(screen.getByText(/กำลังโหลด/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run M2 RTL → 8 PASS**

```bash
cd F:/LoverClinic-app && npx vitest run tests/phase-26-2f-mirror-rtl.test.jsx 2>&1 | tail -10
```

Expected: 8 PASS.

- [ ] **Step 5: Commit + push**

```bash
cd F:/LoverClinic-app
git add tests/phase-26-2f-mirror-source-grep.test.js tests/phase-26-2f-mirror-rtl.test.jsx
git commit -m "$(cat <<'EOF'
test(Phase 26.2f Task 7): M1 source-grep (10) + M2 RTL (8) for Mirror

NEW tests/phase-26-2f-mirror-source-grep.test.js:
- M1.1 file exists + size > 1000 chars
- M1.2 data-testid="treatment-read-only-mirror"
- M1.3 extractDisplayString helper present
- M1.4 EVERY <input>/<textarea>/<select> has `disabled` attr (AV39 prep)
- M1.5 NO save/submit button text
- M1.6 NO onEditTreatment/onDeleteTreatment in code body
- M1.7 Lightbox + setLightbox + z-[110] preserved
- M1.8 Section order matches TFP form (ข้อมูลการรักษา → หมายเหตุ →
  สุขภาพ → Vital Signs → ใบรับรอง → OPD Card)
- M1.9 Read-only banner with Lock icon
- M1.10 Both status chips (doctor-recorded amber + vitalsigns-recorded teal)

NEW tests/phase-26-2f-mirror-rtl.test.jsx:
- M2.1 renders + chip vitalsigns-recorded
- M2.2 [object Object] bug FIXED via extractDisplayString
- M2.3 assistants chip strip
- M2.4 all major sections visible
- M2.5 Vital Signs disabled inputs with values
- M2.6 Read-only banner present
- M2.7 close button + onClose
- M2.8 loading state when treatmentDoc null

Total: 18 PASS for Phase 26.2f Mirror.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin master 2>&1 | tail -3
```

---

## Task 8: Phase 26.2g — Wire Mirror into TFP split-screen call-sites

**Files:**
- Modify: `src/components/TreatmentFormPage.jsx`

- [ ] **Step 1: Locate current TreatmentReadOnlyPanel call-sites in TFP**

```bash
cd F:/LoverClinic-app && grep -nE "<TreatmentReadOnlyPanel|TreatmentReadOnlyPanel from" src/components/TreatmentFormPage.jsx | head -5
```

Note line numbers (likely import line + 2 call-sites at lines ~5010 + ~5159).

- [ ] **Step 2: Replace TreatmentReadOnlyPanel import**

Find:
```js
import TreatmentReadOnlyPanel from './backend/TreatmentReadOnlyPanel.jsx';
```

Replace with:
```js
import TreatmentReadOnlyMirror from './backend/TreatmentReadOnlyMirror.jsx';
```

- [ ] **Step 3: Replace desktop aside call-site (~line 5010)**

Find the current `<TreatmentReadOnlyPanel ... />` block in the desktop aside. Replace the entire JSX element with:

```jsx
<TreatmentReadOnlyMirror
  treatmentDoc={historyFullDoc}
  theme={isDark ? 'dark' : 'light'}
  accentColor={accent}
  isLatest={historyTreatments.findIndex(t => (t.treatmentId || t.id) === selectedHistoryTreatmentId) === 0}
  showCloseButton={true}
  onClose={() => {
    setSelectedHistoryTreatmentId(null);
    setHistoryFullDoc(null);
  }}
/>
```

Mirror takes ONLY `treatmentDoc` (the full fetched doc) — the entire historyTreatments-find IIFE that built `treatmentSummary` is GONE. Mirror reads everything from `treatmentDoc.detail`.

- [ ] **Step 4: Replace mobile fallback call-site (~line 5159)**

Apply the same replacement to the mobile fallback `<TreatmentReadOnlyPanel ... />`:

```jsx
<TreatmentReadOnlyMirror
  treatmentDoc={historyFullDoc}
  theme={isDark ? 'dark' : 'light'}
  accentColor={accent}
  isLatest={historyTreatments.findIndex(t => (t.treatmentId || t.id) === selectedHistoryTreatmentId) === 0}
  showCloseButton={true}
  onClose={() => {
    setSelectedHistoryTreatmentId(null);
    setHistoryFullDoc(null);
  }}
/>
```

- [ ] **Step 5: Build clean**

```bash
cd F:/LoverClinic-app && npm run build 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 6: Run Phase 26.2 regression**

```bash
cd F:/LoverClinic-app && npx vitest run tests/phase-26-2-split-screen-source-grep.test.js tests/phase-26-2-split-screen-rtl.test.jsx tests/phase-26-2-split-screen-flow-simulate.test.js 2>&1 | tail -15
```

Expected: most GREEN. The old Phase 26.2 G4.9 + E6 tests that anchored on `TreatmentReadOnlyPanel` import will FAIL because the import was swapped. Apply V21-class fixups in the same commit:

For each failing test, update the regex/expectation:
- `import TreatmentReadOnlyPanel from` → `import TreatmentReadOnlyMirror from`
- `<TreatmentReadOnlyPanel` → `<TreatmentReadOnlyMirror`
- Add a comment line: `// Phase 26.2g (V26.2g, 2026-05-13) — swapped Panel → Mirror in TFP split-screen`

E6 tests stay — they test the Panel which still exists (used by TimelineModal). Don't touch E6.

D6 tests may also need adjustment for TFP source-grep. Check + apply fixups.

- [ ] **Step 7: Run TimelineModal regression (must stay GREEN — Panel untouched)**

```bash
cd F:/LoverClinic-app && npx vitest run tests/customer-treatment-timeline-flow.test.js 2>&1 | tail -10
```

Expected: 65 PASS (no change from Phase 26.2 final).

- [ ] **Step 8: Commit + push**

```bash
cd F:/LoverClinic-app
git add src/components/TreatmentFormPage.jsx tests/phase-26-2-split-screen-source-grep.test.js tests/phase-26-2-split-screen-rtl.test.jsx
git commit -m "$(cat <<'EOF'
feat(Phase 26.2g Task 8): wire Mirror into TFP split-screen call-sites

TFP swap:
- import TreatmentReadOnlyPanel → import TreatmentReadOnlyMirror
- 2 call-sites updated (desktop aside + mobile fallback):
  - Drop the IIFE that built treatmentSummary from raw historyTreatments item
  - Pass historyFullDoc directly as treatmentDoc prop
  - Pass theme={isDark ? 'dark' : 'light'} (Mirror API)
  - Pass accentColor={accent}
  - isLatest computed from historyTreatments.findIndex
  - showCloseButton + onClose unchanged

TreatmentReadOnlyPanel stays for TimelineModal (its condensed shape suits
the per-row scrollable list; not deprecated).

V21-class test fixups for Phase 26.2 G4.9 / D6 / similar assertions that
anchored on the old Panel import — updated to Mirror.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin master 2>&1 | tail -3
```

---

## Task 9: Phase 26.2h — AV39 audit invariant (Mirror read-only contract)

**Files:**
- Modify: `tests/audit-branch-scope.test.js` (append AV39 describe block)
- Modify: `.agents/skills/audit-anti-vibe-code/SKILL.md` (append AV39 entry)

- [ ] **Step 1: Append AV39 to tests/audit-branch-scope.test.js**

Find the END of the file (after AV38 describe block). Append:

```js
// ─── AV39 — Phase 26.2f TreatmentReadOnlyMirror read-only contract (V26.2f, 2026-05-13)
describe('AV39 Phase 26.2f — TreatmentReadOnlyMirror read-only contract', () => {
  const MIRROR_PATH = 'src/components/backend/TreatmentReadOnlyMirror.jsx';

  it('AV39.1 TreatmentReadOnlyMirror exists at canonical path', async () => {
    const fs = await import('node:fs/promises');
    const stat = await fs.stat(MIRROR_PATH).catch(() => null);
    expect(stat?.isFile()).toBe(true);
  });

  it('AV39.2 NO onEditTreatment / onDeleteTreatment in code body', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(MIRROR_PATH, 'utf8');
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(code).not.toMatch(/onEditTreatment/);
    expect(code).not.toMatch(/onDeleteTreatment/);
  });

  it('AV39.3 Every <input> has disabled attribute', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(MIRROR_PATH, 'utf8');
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    const inputs = code.match(/<input\b[^>]*>/g) || [];
    for (const m of inputs) {
      expect(m).toMatch(/disabled/);
    }
  });

  it('AV39.4 Every <textarea> has disabled attribute', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(MIRROR_PATH, 'utf8');
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    const matches = code.match(/<textarea\b[^>]*>/g) || [];
    for (const m of matches) {
      expect(m).toMatch(/disabled/);
    }
  });

  it('AV39.5 Every <select> has disabled attribute', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(MIRROR_PATH, 'utf8');
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    const matches = code.match(/<select\b[^>]*>/g) || [];
    for (const m of matches) {
      expect(m).toMatch(/disabled/);
    }
  });

  it('AV39.6 NO "บันทึก" / "Save" inside <button> tags', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(MIRROR_PATH, 'utf8');
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    expect(code).not.toMatch(/<button[\s\S]*?บันทึก[\s\S]*?<\/button>/);
    expect(code).not.toMatch(/<button[^>]*>\s*Save/i);
  });

  it('AV39.7 onChange handlers are no-op `() => {}` (no mutation)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(MIRROR_PATH, 'utf8');
    const code = src
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*/g, '');
    // All onChange occurrences should be `onChange={() => {}}`
    const onChangeMatches = code.match(/onChange=\{[^}]*\}/g) || [];
    for (const m of onChangeMatches) {
      expect(m).toMatch(/onChange=\{\s*\(\)\s*=>\s*\{\s*\}\s*\}/);
    }
  });

  it('AV39.8 Lightbox + setLightbox preserved (image zoom permitted)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile(MIRROR_PATH, 'utf8');
    expect(src).toMatch(/setLightbox/);
    expect(src).toMatch(/z-\[110\]/);
  });
});
```

- [ ] **Step 2: Append AV39 entry to SKILL.md**

In `.agents/skills/audit-anti-vibe-code/SKILL.md`, find the AV38 entry. Append after it:

```markdown

### AV39 — TreatmentReadOnlyMirror read-only contract (V26.2f, 2026-05-13)

**Pattern**: `src/components/backend/TreatmentReadOnlyMirror.jsx` is the canonical
comprehensive read-only treatment view that mirrors the editable TFP form
layout. Used by TFP split-screen consumers (desktop aside + mobile fallback).

Distinct from AV38 (`TreatmentReadOnlyPanel` — condensed view used by
`TreatmentTimelineModal` per-row). Both contracts co-exist (Rule of 3
prep — 2 read-only patterns).

The Mirror MUST remain read-only:
- NO `onEditTreatment` or `onDeleteTreatment` prop references (in code body —
  comments OK)
- Every `<input>` tag MUST have `disabled` attribute
- Every `<textarea>` tag MUST have `disabled` attribute
- Every `<select>` tag MUST have `disabled` attribute
- NO "บันทึก" or "Save" inside `<button>` tags (chip text in `<span>` is permitted
  — both 'doctor-recorded' amber chip and 'vitalsigns-recorded' teal chip
  render the substring "บันทึก" / "ลงบันทึก" in `<span>` not `<button>`)
- `onChange` handlers MUST be no-op `() => {}` (form fields never mutate)

Permitted:
- Lightbox + setLightbox (image zoom is read interaction, not edit)
- `<button>` for accordion toggle / close button / lightbox controls /
  zoom buttons (UI-only — no save semantics)
- `<button>` rendering the "แพทย์ลงบันทึก" / "บันทึกข้อมูลซักประวัติ"
  status chip via `<span>` inside (display only)

**Anchor**: `src/components/backend/TreatmentReadOnlyMirror.jsx`.

**Sanctioned exceptions**: NONE.

**Source-grep regression**: `tests/audit-branch-scope.test.js` AV39.1-AV39.8 —
8 sub-tests locking each invariant.

**Companion**: AV37 (Phase 26.0 + 26.1 + 26.2f-pre doctor-save / vitals-save
gates) + AV38 (Phase 26.2b Panel condensed-view contract). AV39 codifies the
comprehensive-mirror contract.

**Class-of-bug**: V21 source-grep test lock-in family + read-only contract
violation. A future commit that adds an editable input to the Mirror directly
(instead of wrapping the Mirror with an external edit button) would violate
AV39 — caught at audit-grep.
```

- [ ] **Step 3: Run AV39 → 8 PASS**

```bash
cd F:/LoverClinic-app && npx vitest run tests/audit-branch-scope.test.js -t "AV39" 2>&1 | tail -10
```

Expected: 8 PASS.

- [ ] **Step 4: Run full audit-branch-scope → previous AV37 + AV38 + new AV39 all GREEN**

```bash
cd F:/LoverClinic-app && npx vitest run tests/audit-branch-scope.test.js 2>&1 | tail -10
```

Expected: all GREEN (AV37 + AV37.12-17 extension + AV38 + AV39).

- [ ] **Step 5: Build clean**

```bash
cd F:/LoverClinic-app && npm run build 2>&1 | tail -5
```

- [ ] **Step 6: Commit + push**

```bash
cd F:/LoverClinic-app
git add tests/audit-branch-scope.test.js .agents/skills/audit-anti-vibe-code/SKILL.md
git commit -m "$(cat <<'EOF'
feat(Phase 26.2h Task 9): AV39 audit invariant — TreatmentReadOnlyMirror

NEW AV39 audit invariant (audit-anti-vibe-code/SKILL.md + 8 sub-tests in
tests/audit-branch-scope.test.js):

The TreatmentReadOnlyMirror component (Phase 26.2f — comprehensive read-only
mirror of TFP form, used by TFP split-screen) MUST remain read-only:

- AV39.1 file exists at canonical path
- AV39.2 NO onEditTreatment / onDeleteTreatment in code body
- AV39.3 Every <input> has disabled attribute
- AV39.4 Every <textarea> has disabled attribute
- AV39.5 Every <select> has disabled attribute
- AV39.6 NO "บันทึก"/"Save" inside <button> tags (chip text in <span> OK)
- AV39.7 onChange handlers are no-op `() => {}` patterns
- AV39.8 Lightbox + image-zoom preserved (z-[110])

Companion to AV37 (doctor-save / vitals-save gates) + AV38 (Panel condensed-
view contract). 3 audit contracts now cover the read-only treatment views.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin master 2>&1 | tail -3
```

---

## Task 10: Phase 26.2i — Full-suite verify + Wiki + handoff

**Files:**
- Create: `wiki/concepts/tfp-readonly-mirror.md`
- Modify: `wiki/concepts/treatment-status-and-doctor-save.md` (extend with 3-stage workflow)
- Modify: `wiki/log.md`
- Modify: `SESSION_HANDOFF.md`
- Modify: `.agents/active.md`

- [ ] **Step 1: Full-suite vitest verify**

```bash
cd F:/LoverClinic-app && npm test -- --run 2>&1 | grep -E "Test Files|Tests \s*[0-9]" | tail -3
```

Expected: ~8390-8400 PASS + 1 skipped. If any tests FAIL outside Phase 26.2f scope: V21-class fixups + commit.

- [ ] **Step 2: Build clean**

```bash
cd F:/LoverClinic-app && npm run build 2>&1 | tail -5
```

- [ ] **Step 3: Create wiki concept page**

Create `wiki/concepts/tfp-readonly-mirror.md`:

```markdown
---
tags: [tfp, mirror, read-only, vitals-save, phase-26-2f]
date: 2026-05-13
source-count: 1
---

# TFP Read-Only Mirror + Vitals-Save Workflow

## Overview

Phase 26.2f (2026-05-13) shipped the comprehensive read-only mirror of TFP
form for the split-screen history view + a 3-stage save workflow:

1. **Vitals-save** (admin, create-only): admin enters Vital Signs only, clicks
   "บันทึกข้อมูลซักประวัติ" → creates treatment with status='vitalsigns-recorded'
2. **Doctor-save** (doctor, edit-mode-enabled when status='vitalsigns-recorded'):
   doctor opens treatment, fills doctor fields, clicks "บันทึกสำหรับแพทย์" →
   transitions status='doctor-recorded'
3. **Regular-save** (admin, any state): admin fills remaining fields,
   clicks ยืนยันการรักษา → status cleared via deleteField

Both intermediate statuses (`vitalsigns-recorded` + `doctor-recorded`) preserve
the `recordedBy` + `recordedAt` forensic trail.

## TreatmentReadOnlyMirror component

Renders the full TFP form layout with disabled inputs:
- Section ordering matches editable TFP (post-Phase 26.2f-pre layout reorder)
- Disabled `<input>` / `<textarea>` / `<select>` for visual lock-feel
- Object/array value extraction (`extractDisplayString`) fixes the
  `[object Object]` rendering bug for doctor + assistants
- Self-contained Lightbox for image zoom (read interaction, not edit)
- Both status chips (doctor-recorded amber + vitalsigns-recorded teal)

Replaces `TreatmentReadOnlyPanel` (condensed view) in TFP split-screen
call-sites. Panel STAYS for TimelineModal per-row scrollable list.

## Layout reorder

`หมายเหตุทั่วไป` moved from RIGHT column (above doctor-save button) to
LEFT column (between ข้อมูลการรักษา and ข้อมูลสุขภาพลูกค้า). The
NEW `บันทึกข้อมูลซักประวัติ` button now sits at the OLD slot of
หมายเหตุทั่วไป (RIGHT column above doctor-save) — visually adjacent to
the Vital Signs box on LEFT.

## Audit invariants

- **AV37** (extended): saveMode='vitals' as 5th locked-X family member;
  doctor-save edit-mode enablement; canAddNewItems extension
- **AV38** (existing): TreatmentReadOnlyPanel condensed-view contract
- **AV39** (NEW): TreatmentReadOnlyMirror comprehensive-mirror contract

## File inventory

NEW source (1):
- `src/components/backend/TreatmentReadOnlyMirror.jsx` (~700 LOC)

Modified source (3):
- `src/components/TreatmentFormPage.jsx` (section reorder + vitals-save
  button + handleSubmit branch + canAddNewItems + doctor-save gate +
  Mirror import + 2 call-sites)
- `src/components/backend/CustomerDetailView.jsx` (vitalsigns-recorded chip)
- `src/components/backend/TreatmentReadOnlyPanel.jsx` (vitalsigns-recorded
  chip alongside existing doctor-recorded chip)

Tests (NEW: 5):
- `tests/phase-26-2f-pre-vitals-save-source-grep.test.js` (V1, 15 assertions)
- `tests/phase-26-2f-pre-vitals-save-rtl.test.jsx` (V2, 3 assertions)
- `tests/phase-26-2f-pre-vitals-save-flow-simulate.test.js` (F11, 8 assertions)
- `tests/phase-26-2f-mirror-source-grep.test.js` (M1, 10 assertions)
- `tests/phase-26-2f-mirror-rtl.test.jsx` (M2, 8 assertions)

Audit (extended + NEW):
- AV37.12-17 (6 sub-tests) in audit-branch-scope.test.js
- AV39.1-8 (8 sub-tests) NEW describe block

## See also

- Spec: `docs/superpowers/specs/2026-05-13-phase-26-2f-tfp-readonly-mirror-design.md`
- Plan: `docs/superpowers/plans/2026-05-13-phase-26-2f-tfp-readonly-mirror.md`
- Phase 26.0 doctor-save: `concepts/treatment-status-and-doctor-save.md`
- Phase 26.2 split-screen: `concepts/tfp-split-screen-history.md`
```

- [ ] **Step 4: Extend treatment-status-and-doctor-save.md with 3-stage section**

Open `wiki/concepts/treatment-status-and-doctor-save.md`. Append at the end:

```markdown

## Phase 26.2f-pre — 3-stage workflow (2026-05-13)

Status state machine extended to 3 stages with a new vitals-save entry point:

```
create  ──vitals-save──▶ 'vitalsigns-recorded'  (NEW Phase 26.2f-pre)
create  ──doctor-save──▶ 'doctor-recorded'      (Phase 26.0)
create  ──regular─────▶ null/complete

edit + status='vitalsigns-recorded' ──doctor-save──▶ 'doctor-recorded'  (NEW transition)
edit + status='vitalsigns-recorded' ──regular─────▶ null/complete       (admin shortcut)
edit + status='doctor-recorded'     ──regular─────▶ null/complete       (Phase 26.0e deleteField)
```

Vitals-save button (`tfp-vitals-save-btn`):
- Teal styling (#2EC4B6) — distinct from doctor-save's sky
- Activity icon
- Create-only gate (`{!isEdit && ...}`)
- Persists Vital Signs section + minimal metadata
- Status='vitalsigns-recorded' + recordedBy + recordedAt stamping

Doctor-save button gate extension:
- Phase 26.0d: `{!isEdit && ...}` (create-only)
- Phase 26.2f-pre: `{(!isEdit || loadedTreatmentStatus === 'vitalsigns-recorded') && ...}`
- Enables doctor to complete a vitals-only treatment without admin's prior complete-save

canAddNewItems extended:
- Now recognizes both 'doctor-recorded' AND 'vitalsigns-recorded' as
  "admin can add items in edit mode" states

Status chip "บันทึกข้อมูลซักประวัติ":
- Teal pill (bg-teal-100/950 + border-teal-200/800)
- Activity icon
- Renders in CDV row meta + Panel header + Mirror header
- data-testid="treatment-status-chip-vitalsigns-recorded-{id}"
```

- [ ] **Step 5: Append wiki/log.md**

```bash
cd F:/LoverClinic-app && cat >> wiki/log.md << 'EOF'

## [2026-05-13] ingest | Phase 26.2f — TFP Read-Only Mirror + Vitals-Save

Follow-up to Phase 26.2 same-day saga (Tasks 1-8 shipped earlier). Two
linked features: (1) NEW vitals-save workflow stage with teal button +
status chip + doctor-save edit-mode enablement (Phase 26.2f-pre); (2)
NEW comprehensive `TreatmentReadOnlyMirror` component (~700 LOC) that
visually mirrors the editable TFP form layout but with disabled inputs,
replacing the condensed Panel in TFP split-screen call-sites (Phase 26.2f).

Layout reorder: `หมายเหตุทั่วไป` moved from RIGHT column to LEFT (between
ข้อมูลการรักษา and ข้อมูลสุขภาพลูกค้า); NEW vitals-save button takes its
old slot → visually adjacent to Vital Signs box per user spec.

Status state machine extended to 3 stages: vitalsigns-recorded →
doctor-recorded → null/complete. recordedBy/At forensic fields shared.

Test bank: +44 NEW assertions (V1 15 + V2 3 + F11 8 + M1 10 + M2 8) +
14 audit extensions (AV37.12-17 + AV39.1-8). Total ~8400 PASS.

NEW concept page `concepts/tfp-readonly-mirror.md`. Existing concept page
`concepts/treatment-status-and-doctor-save.md` extended with 3-stage section.

NOT YET DEPLOYED — combined Phase 26.0 + 26.1 + 26.2 + 26.2f = ~58+ commits
ahead of prod (`ccef3c2`). Awaiting user `deploy` per Rule V18.
EOF
echo "log appended"
```

- [ ] **Step 6: Update SESSION_HANDOFF.md (prepend Phase 26.2f session block)**

Open `SESSION_HANDOFF.md`. Update the "Date last updated" line and PREPEND a new Phase 26.2f section after the existing top header (BEFORE the Phase 26.2 block from earlier same-day session).

Use Edit tool. NEW header values:

```markdown
- **Date last updated**: 2026-05-13 — Phase 26.0 + 26.1 + 26.2 + **26.2f** COMPLETE (NOT YET DEPLOYED) · ~8400 tests + 1 skipped · build clean · ~58 commits ahead of prod
- **Branch**: `master`
- **Last commit**: `<NEW_SHA>` docs(Phase 26.2f): wiki + log + SESSION_HANDOFF + active.md
- **Test count**: **~8400 passed** (+44 net Phase 26.2f from 8356 Phase 26.2 baseline) + 1 skipped
- **Deploy state**: PRODUCTION = `ccef3c2`. Combined Phase 26.0 + 26.1 + 26.2 + 26.2f = ~58 commits ahead. Awaiting user `deploy` authorization.
```

PREPEND the session block:

```markdown
### Session 2026-05-13 (continued) — Phase 26.2f TFP Read-Only Mirror + Vitals-Save (NOT YET DEPLOYED)

User directive (post-Task-8 brainstorming-locked): make TFP split-screen right panel mirror the LEFT form (all fields visible, inputs locked) + add vitals-save workflow stage + fix [object Object] rendering bug.

**Brainstorming HARD-GATE honored** (Rule J): 9 design Qs locked → spec at `docs/superpowers/specs/2026-05-13-phase-26-2f-tfp-readonly-mirror-design.md`.

**Subagent-driven execution** (Rule J + K work-first / test-last): 10 task commits across 5 sub-phases.

**Phase 26.2f-pre (Tasks 1-5)** — layout reorder (หมายเหตุทั่วไป → LEFT col) + NEW vitals-save button (teal, Activity icon, create-only) + handleSubmit saveMode='vitals' branch + status='vitalsigns-recorded' state machine + doctor-save edit-mode enablement when status='vitalsigns-recorded' + canAddNewItems extension + chip rendering in Panel + CDV + AV37.12-17 extension (6 sub-tests).

**Phase 26.2f (Tasks 6-7)** — NEW `TreatmentReadOnlyMirror.jsx` (~700 LOC): mirrors TFP form layout with disabled inputs; section order matches LEFT-form (post-reorder); `extractDisplayString` helper fixes [object Object] bug for doctor + assistants objects; Both status chips supported (doctor-recorded amber + vitalsigns-recorded teal); Self-contained Lightbox.

**Phase 26.2g (Task 8)** — TFP split-screen call-sites (desktop aside + mobile fallback) swap `<TreatmentReadOnlyPanel>` → `<TreatmentReadOnlyMirror>`. Panel STAYS for TimelineModal per-row.

**Phase 26.2h (Task 9)** — AV39 audit invariant (8 sub-tests) locks read-only contract: all `<input>`/`<textarea>`/`<select>` have `disabled`; NO save-button text; NO edit/delete props; Lightbox preserved.

**Phase 26.2i (Task 10)** — full-suite verify + wiki concept page + handoff (this commit).

**Rule of 3 status**: 2 read-only patterns (Panel + Mirror) co-exist post-26.2f.

**Tests**: Phase 26.2 baseline 8356 → Phase 26.2f final ~8400 (+44 net: V1 15 + V2 3 + F11 8 + M1 10 + M2 8 = 44). Build clean.

Detail: future checkpoint at `.agents/sessions/2026-05-13-phase-26-2f-mirror.md` (deferred until session-end).

NOT yet deployed. Combined Phase 26.0 + 26.1 + 26.2 + 26.2f = ~58 commits ahead of prod (`ccef3c2`). Awaiting user `deploy`.

```

- [ ] **Step 7: Update .agents/active.md**

Use Write to fully replace `.agents/active.md`:

```yaml
---
updated_at: "2026-05-13 — Phase 26.0 + 26.1 + 26.2 + 26.2f ALL complete (NOT YET DEPLOYED)"
status: "master=<NEW_SHA> · prod=ccef3c2 · ~58 commits ahead · ~8400 passed · build clean"
branch: "master"
last_commit: "docs(Phase 26.2f): wiki + log + SESSION_HANDOFF + active.md"
tests: 8400
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "ccef3c2"
firestore_rules_version: 29
storage_rules_version: 2
---

# Active Context

## State
- master = `<NEW_SHA>` · prod = `ccef3c2` (~58 commits ahead — Phase 26.0 + 26.1 + 26.2 + 26.2f NOT YET DEPLOYED)
- ~8400/8401 tests passed + 1 skipped (1 known flake: Phase 17.1 cross-branch-import-rtl under full-suite load)
- Phase 26.2f is 4th same-day follow-up extending Phase 26.0 + 26.1 + 26.2

## What this session shipped (Phase 26.2f, 2026-05-13)

10 tasks across 5 sub-phases:
- 26.2f-pre (Tasks 1-5): layout reorder + NEW vitals-save button + handleSubmit branch + status state machine + chip rendering + AV37 extension + F11 flow-simulate
- 26.2f (Tasks 6-7): NEW TreatmentReadOnlyMirror.jsx (~700 LOC) + M1/M2 tests
- 26.2g (Task 8): wire Mirror into TFP split-screen (Panel stays for TimelineModal)
- 26.2h (Task 9): AV39 audit invariant (8 sub-tests)
- 26.2i (Task 10): full-suite verify + wiki + handoff (this commit)

## Next action
**Idle — awaiting user authorization**:
- (a) `deploy` for combined `vercel --prod` + `firebase deploy --only firestore:rules` per Rule V15 covering ~58 commits Phase 26.0 + 26.1 + 26.2 + 26.2f
- (b) New feature / task

## Outstanding user-triggered actions
- **Pending user authorization**: deploy Phase 26.0 + 26.1 + 26.2 + 26.2f to production
- (Optional, unchanged) probe-deploy-probe.mjs probes 2/3/4 false-positive trim
- (Optional, unchanged) bsa-task7-h-quater-fix flake + Phase 17.1 cross-branch-import-rtl flake (same class)

## Institutional memory anchors (Phase 26.2f)
- **TreatmentReadOnlyMirror is canonical comprehensive read-only view**. Mirrors TFP form layout with disabled inputs. 1 consumer post-26.2f (TFP split-screen — both desktop aside + mobile fallback). AV39 enforces read-only contract.
- **Panel + Mirror co-exist** (not Rule of 3 trigger yet): Panel = condensed (TimelineModal); Mirror = comprehensive (TFP split-screen). Both AV38 + AV39 contracts ensure no-edit semantics.
- **3-stage save workflow**: vitals-save (admin create) → doctor-save (doctor edit/create) → regular-save (admin clear). Status enum: 'vitalsigns-recorded' / 'doctor-recorded' / null. Forensic fields recordedBy/recordedAt shared across stages.
- **saveMode='vitals' is the 5th locked-X family member** (after lockedCustomer + lockedAppointmentType + lockedChannel + saveMode='doctor'). Future locked-X variants must mirror the pattern: defensive coercion + explicit gates at every site + AV invariant + flow-simulate + source-grep regression.
- **extractDisplayString pattern**: handles string OR object {displayName, name, id} → fixes the [object Object] rendering class-of-bug. Reusable for any data shape that mixes denormalized strings + populated objects.
- **Layout reorder**: หมายเหตุทั่วไป moved to LEFT column (above ข้อมูลสุขภาพลูกค้า); vitals-save button at OLD slot (RIGHT col, above doctor-save) → visually adjacent to Vital Signs box on LEFT.

## Carried memory
- (Phase 26.2) TreatmentReadOnlyPanel + split-screen pattern + customer.note display (still active for TimelineModal)
- (Phase 26.1) EditAttributionModal = 2nd "pick-a-person-before-action" family member
- (Phase 26.0) saveMode= 4th locked-X family member (now 5th with vitals); recordedBy/recordedAt forensic trail
- Iron-clad rules A-P + BSA invariants BS-1..16 + AV1-AV30 + AV32-AV39 + CB-1..5
```

- [ ] **Step 8: Commit + push**

```bash
cd F:/LoverClinic-app
git add wiki/concepts/tfp-readonly-mirror.md wiki/concepts/treatment-status-and-doctor-save.md wiki/log.md SESSION_HANDOFF.md .agents/active.md
git commit -m "$(cat <<'EOF'
docs(Phase 26.2f Task 10): wiki + log + SESSION_HANDOFF + active.md

NEW wiki/concepts/tfp-readonly-mirror.md (architecture + 3-stage workflow
+ Mirror component description + audit invariants + file inventory).

EXTENDED wiki/concepts/treatment-status-and-doctor-save.md with 3-stage
workflow section (vitalsigns-recorded → doctor-recorded → complete).

APPENDED wiki/log.md Phase 26.2f ingest entry (~8400 tests, ~58 commits
ahead, audit AV37.12-17 + AV39 added).

PREPENDED SESSION_HANDOFF.md Phase 26.2f session block.

REFRESHED .agents/active.md (current state: ~58 commits ahead Phase 26.0
+ 26.1 + 26.2 + 26.2f; institutional memory anchors).

Phase 26.2f implementation COMPLETE. Awaiting user "deploy" authorization
for combined vercel --prod + firebase deploy --only firestore:rules per
Rule V15. Total: ~58 commits ahead of prod.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin master 2>&1 | tail -3
```

- [ ] **Step 9: Final state verify**

```bash
cd F:/LoverClinic-app && git log --oneline ccef3c2..HEAD | wc -l
```

Expected: ~58 (Phase 26.0 + 26.1 + 26.2 + 26.2f cumulative).

```bash
cd F:/LoverClinic-app && git log -1 --oneline
```

Expected: the docs commit SHA from Step 8.

---

## Self-Review

**Spec coverage**:
- ✅ Phase 26.2f-pre (Item 1 layout reorder) — Task 1
- ✅ Phase 26.2f-pre (Item 2 vitals-save button) — Task 3
- ✅ Phase 26.2f-pre (Item 3 handleSubmit branch) — Task 2
- ✅ Phase 26.2f-pre (Item 4 status state machine) — Task 2 + Task 3 + flow-simulate F11
- ✅ Phase 26.2f-pre (Item 5 chip + canAddNewItems) — Task 3 + Task 4
- ✅ Phase 26.2f-pre (Item 6 AV37 extension) — Task 5
- ✅ Phase 26.2f Mirror component — Task 6
- ✅ Phase 26.2f Mirror tests M1+M2 — Task 7
- ✅ Phase 26.2g Mirror integration — Task 8
- ✅ Phase 26.2h AV39 — Task 9
- ✅ Phase 26.2i verify + wiki + handoff — Task 10

**Placeholder scan**: NO TBD/TODO. `<NEW_SHA>` is a documented placeholder (filled at execution time).

**Type consistency**: Mirror props `treatmentDoc / theme / accentColor / isLatest / showCloseButton / onClose` consistent across Tasks 6-8. Panel prop names (`treatmentSummary / treatmentFull / treatmentsLoading / theme / accentColor`) unchanged (Panel untouched by this plan — only the chip render addition).

**Estimated duration**: 10 tasks × 20-30 min = ~3-5 hours. 1 session via subagent-driven mode.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-13-phase-26-2f-tfp-readonly-mirror.md`. Two execution options:**

**1. Subagent-Driven (recommended — same pattern as Phase 26.0 + 26.1 + 26.2)** — fresh subagent per task, two-stage review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
