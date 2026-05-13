# Phase 26.0 — Doctor-Save (บันทึกสำหรับแพทย์) + Admin Finalize-Mode

**Date**: 2026-05-13
**Status**: DESIGN (brainstorming approved; awaiting user review of spec)
**Class**: NEW feature on `TreatmentFormPage.jsx` (3200+ LOC, biggest UI file)
**Rule J HARD-GATE**: brainstorming completed 2026-05-13; 4 Qs locked

---

## 1. User intent (verbatim)

> "ในหน้า TFP เพิ่มระบบใหม่ คือ ปุ่ม บันทึกสำหรับแพทย์ ปุ่มนี้เอาไว้ตรงใต้ section OPD Card ที่ว่างๆก็ได้ โดยปุ่มนี้จะไม่เหมือนปุ่มบันทึกของพนักงาน โดยปุ่มนี้จะไม่สามารถกดบันทึกตรงส่วนของ ข้อมูลการใช้คอร์ส และ สินค้าสิ้นเปลือง ได้ ... และส่งผลให้ Status ของ OPD ที่สร้างโดยการกดบันทึกสำหรับแพทย์นั้น ขึ้นสถานะว่า แพทย์ลงบันทึกเรียบร้อย และเมื่อ admin กลับมากดแก้ไขการรักษาประเภทที่ขึ้นสเตตัสนี้ จะสามารถกดเข้ามาแก้ไข อื่นๆได้ทั้งหมด เช่นเรื่อง ซื้อคอร์ส ตัดการรักษา ซื้อสินค้าหน้าร้าน ใส่ค่ามือ บลาๆ ที่ตอนแรก การ edit แบบปกติไม่อนุญาติให้ทำ"

Translation:
1. Add a NEW button on TFP labeled "บันทึกสำหรับแพทย์" (Save-for-Doctor), positioned under the OPD Card section
2. Doctor-save CANNOT commit course-items (ข้อมูลการใช้คอร์ส) or consumables (สินค้าสิ้นเปลือง). Records OTHER fields only
3. Sets treatment status = "แพทย์ลงบันทึกเรียบร้อย" (Doctor-recorded)
4. When admin returns to edit such a treatment, they CAN add course-buys / treatment items / OTC products / staff DF — things that normal edit-mode disallows

---

## 2. Locked decisions (4 brainstorming Qs)

| # | Question | Decision |
|---|---|---|
| Q1 | Button gate (permission)? | **Open to all** — stamp `recordedBy=uid` for audit trail. No new auth-context wiring in TFP. Doctor users natural consumers but staff can use (e.g., draft before doctor arrives). |
| Q2 | Skip scope beyond course-items + consumables? | **Keep meds + DF** — Skip: course-items + consumables + purchasedItems + auto-sale (createBackendSale + deductWallet + earnPoints + applyDeposit + assignCourseToCustomer + promo-assign). Keep: medications stock deduction (type 7) + doctorFees / DF entries. |
| Q3 | Status field design? | **Single status value + cleared** — `status: 'doctor-recorded'` set on doctor-save; cleared (undefined) on admin's normal save. Display amber chip at 3 locations (CustomerDetailView + TimelineModal + TFP banner). Legacy = undefined = no chip (backward-compat, no backfill). |
| Q4 | Edit-mode unlock mechanism? | **Status-derived flag** — `canAddNewItems = (mode==='create') || (loadedTreatment?.status === 'doctor-recorded')` replaces every `{!isEdit && AddBtn}` gate in TFP. No new TFP mode prop; no caller changes. |

**Architectural approach (A1 locked)**: Single `handleSubmit(saveMode)` handler with explicit gates at every deduction / sale-creation site. Mitigates V12 multi-writer-sweep risk via AV37 audit invariant + source-grep regression test. Alternatives A2 (separate handler — too much refactor) + A3 (filter payload — implicit-skip risk) rejected.

---

## 3. Data schema change

**`be_treatments/{treatmentId}`** gains 3 NEW fields (additive — backward-compat preserved):

```js
{
  // ... all existing fields preserved
  status: 'doctor-recorded' | undefined,
  recordedBy: '<firebaseUid>' | undefined,
  recordedAt: Timestamp | undefined,
}
```

**Semantics**:
- `status === undefined` → legacy OR admin-finalized → NO chip → behaves like "completed"
- `status === 'doctor-recorded'` → set on doctor-save → amber chip everywhere → admin must finalize
- `recordedBy` + `recordedAt` → **forensic trail; preserved across admin finalize** (NOT cleared when status clears) so admin can answer "who recorded the OPD card and when?"

**Backward compat**: All ~5000+ existing treatments have `status: undefined` already → render as "completed" (no chip). NO data migration needed. NO Rule M trigger.

**Firestore rules**: NO change. `be_treatments` rules already allow staff write of arbitrary fields. NO Rule B Probe-Deploy-Probe trigger.

---

## 4. High-level flow

```
Doctor opens TFP (mode='create') → fills OPD/vitals/charts/notes/meds/DF
                                          │
                                          ▼
                              Clicks "🩺 บันทึกสำหรับแพทย์"
                                          │
                                          ▼
                              handleSubmit(saveMode='doctor')
                                          │
                              ┌───────────┼───────────┬───────────┐
                              ▼           ▼           ▼           ▼
                          validate    build       writeTreatment    SKIP (5 sites)
                          (relaxed)   payload     {                  - deductCourseItems
                                      (no course   status:           - deductStockForTreatment
                                       items /     'doctor-recorded',  (consumables only)
                                       consums /   recordedBy: uid,  - createBackendSale chain
                                       purchased)  recordedAt: now,  - assignCourseToCustomer
                                                  }                  - DF→sale linkage
                                          │                          KEEP:
                                          ▼                          - deductStockForTreatment
                              Treatment saved · amber chip displayed   (medications only)
                                                                     - DF entries (in detail)
                              ─── time passes ───
                                          │
                                          ▼
                              Admin clicks "แก้ไข" on doctor-recorded treatment
                                          │
                                          ▼
                              TFP opens (mode='edit', loadedTreatment.status='doctor-recorded')
                                          │
                                          ▼
                              canAddNewItems = true  (status-derived)
                              All {!isEdit && AddBtn} → {canAddNewItems && AddBtn}
                                          │
                                          ▼
                              Amber banner displayed at top of form
                                          │
                                          ▼
                              Admin adds: course-items + consumables + purchasedItems
                                          │
                                          ▼
                              Clicks "บันทึก" → handleSubmit(saveMode='staff')  [existing flow]
                                          │
                              ┌───────────┼─────────────────────────┐
                              ▼           ▼                         ▼
                          updateTreatment  reverseCourseDeduction   deduct + sale
                          {                (no-op — nothing to     (full first-time
                            status: null,   reverse, no prior      run because
                            recordedBy +    deductions)            doctor-save
                            recordedAt                              skipped them)
                            PRESERVED
                          }
                                          │
                                          ▼
                              Status cleared · chip disappears · finalized
```

---

## 5. Implementation surfaces

### 5.1 `src/components/TreatmentFormPage.jsx` (~90 LOC delta)

**A. Signature change**:
```js
const handleSubmit = async (eventOrSaveMode) => {
  // Defensive coercion: any value other than literal 'doctor' string → 'staff' (default)
  // Accepts: SyntheticEvent (from form submit) | 'doctor' (string) | 'staff' (string) | undefined
  const saveMode = (eventOrSaveMode === 'doctor') ? 'doctor' : 'staff';
  // Suppress default event behavior if invoked as form submit handler
  if (eventOrSaveMode && typeof eventOrSaveMode.preventDefault === 'function') {
    eventOrSaveMode.preventDefault();
  }
  // ... rest of handler with saveMode gates
};
```

(Reuse existing event-handler arg shape; allow string override for explicit invocation. Defensive coercion guarantees fail-safe — any non-'doctor' arg routes to the full staff flow.)

**B. 5 gate sites** (exploration line refs):

| Site | Line range | New gate |
|---|---|---|
| Course over-deduction live-validation | 1972–2033 | `if (saveMode !== 'doctor') { ...validate... }` |
| `deductCourseItems` (create) | 2159–2163 | `if (saveMode !== 'doctor' && treatmentItems.length > 0) { ... }` |
| `reverseCourseDeduction` + `deductCourseItems` (edit) | 2102–2179 | `if (saveMode !== 'doctor') { ...reverse + rededuct... }` |
| `deductStockForTreatment` consumables (type 6) | 2207–2216 | `if (saveMode !== 'doctor') { ... }` |
| `deductStockForTreatment` meds (type 7) | 2218–2226 | **KEPT** — fires for both saveMode values (per Q2) |
| `createBackendSale` chain (auto-sale create) | 2232–2386 | `if (saveMode !== 'doctor' && hasSale && !isEdit) { ... }` |
| Edit-mode sale sync | 2390–2600 | `if (saveMode !== 'doctor') { ... }` |

**C. Status + audit field stamping** at treatment doc write (line 2145-2148):

```js
import { deleteField, serverTimestamp } from 'firebase/firestore';
import { auth } from '../firebase.js';  // NEW import

// In handleSubmit, at the createBackendTreatment / updateBackendTreatment payload:
const treatmentDocPayload = {
  ...existingPayload,
  // V26.0 doctor-save status routing
  ...(saveMode === 'doctor' ? {
    status: 'doctor-recorded',
    // CREATE: stamp uid + now. UPDATE re-fire of doctor-save (edge case via API,
    // not reachable from UI per 5.1.F): preserve original by passing existing
    // values; createBackendTreatment ignores already-existing fields. Implementation
    // must explicitly NOT overwrite if `loadedTreatment.recordedBy` exists.
    ...(isEdit && loadedTreatment?.recordedBy ? {} : {
      recordedBy: auth.currentUser?.uid || null,
      recordedAt: serverTimestamp(),
    }),
  } : {
    // saveMode === 'staff' (admin finalize OR normal create)
    // Clear status using deleteField() so doc shape stays minimal (vs setting null).
    // recordedBy + recordedAt INTENTIONALLY OMITTED from payload → existing values
    // preserved (forensic trail). Create mode: these are simply undefined.
    status: deleteField(),
  }),
};
```

**Semantics matrix**:

| Scenario | status | recordedBy | recordedAt |
|---|---|---|---|
| Create + staff (existing flow) | `deleteField()` (omitted) | omitted | omitted |
| Create + doctor (NEW) | `'doctor-recorded'` | `uid` | `serverTimestamp()` |
| Edit + staff (admin finalize) | `deleteField()` (clears any prior) | OMITTED (preserves prior) | OMITTED (preserves prior) |
| Edit + doctor (NOT UI-reachable) | `'doctor-recorded'` (idempotent) | OMITTED if exists, else stamps | OMITTED if exists, else stamps |

**D. `canAddNewItems` flag** at top of render (after existing `isEdit` declaration line 325):
```js
const canAddNewItems = (mode === 'create')
  || (loadedTreatment?.status === 'doctor-recorded');
```

**E. Replace `!isEdit` gates** at 5 known UI sites (exploration). Two patterns:

- **Pattern α — show/hide button**:
  - Line 3380-3392: medication add buttons → `{canAddNewItems && <AddBtn>}`
  - Line 4139: consumable add button → `{canAddNewItems && <AddBtn>}`
  - Course/Purchase items section (line ~1300s — picker modal trigger): `{canAddNewItems && <CoursePicker>}`

- **Pattern β — branch-swap editable layout vs read-only layout** (more invasive — JSX structure differs between modes):
  - Line 3627-3674: medication grid → swap `isEdit ? readOnlyLayout : editableLayout` becomes `canAddNewItems ? editableLayout : readOnlyLayout`
  - Line 4286-4304: consumable grid → same pattern

**β pattern audit risk**: legacy `isEdit ?` ternaries at these grid locations must ALL flip to `!canAddNewItems ?` for read-only branch. Source-grep regression test G2.x asserts no remaining `isEdit ?` for these grid layouts (only `canAddNewItems` controls visual mode). Mirrors V12 multi-reader-sweep discipline.

**F. NEW doctor-save button** below OPD Card additionalNote (line 2949), before Chart section (line 2958):
```jsx
{!isEdit && (
  <div className="mt-3 flex justify-center">
    <button
      type="button"
      onClick={() => handleSubmit('doctor')}
      disabled={submitting}
      data-testid="tfp-doctor-save-btn"
      data-save-mode="doctor"
      className={`${BTN_SECONDARY_STYLE} flex items-center gap-2`}
    >
      <Stethoscope className="w-4 h-4" />
      <span>บันทึกสำหรับแพทย์</span>
    </button>
    <p className="text-xs text-tx-muted ml-3 self-center">
      บันทึกเฉพาะ OPD / ยา / ค่ามือ — admin มาเติมคอร์ส / สินค้า / บิลทีหลัง
    </p>
  </div>
)}
```

`{!isEdit && ...}` because doctor-save mode is only meaningful at CREATE time; edit-mode hides the button (admin finalizes via regular "บันทึก").

**G. Edit-mode banner** at top of form (above existing FormSection):
```jsx
{loadedTreatment?.status === 'doctor-recorded' && (
  <div
    data-testid="tfp-doctor-recorded-banner"
    className="mb-3 px-4 py-2 rounded-lg bg-amber-50 dark:bg-amber-950
               border border-amber-200 dark:border-amber-800
               text-amber-900 dark:text-amber-100 text-sm flex items-center gap-2"
  >
    <AlertCircle className="w-4 h-4 flex-shrink-0" />
    <span>การรักษานี้บันทึกโดยแพทย์ — กรุณาเติมข้อมูลคอร์ส / สินค้า / ค่ามือ / ใบเสร็จให้ครบ แล้วกดบันทึก</span>
  </div>
)}
```

**H. Validation differences** in `validateBeforeSubmit(saveMode)`:
- Skip when `saveMode === 'doctor'`: hasSale/seller/payment-channel checks; fill-later course-items validation; course over-deduction live-check
- Keep regardless: `doctorId`, `treatmentDate`, OPD-required fields (per existing rules)

### 5.2 `src/lib/backendClient.js` (~10 LOC delta)

Verify `createBackendTreatment` + `updateBackendTreatment` allow `status` + `recordedBy` + `recordedAt` in payload (likely already passthrough; confirm during implementation). If whitelisted, extend whitelist.

NO new exports; NO new helpers needed.

### 5.3 `src/components/backend/CustomerDetailView.jsx` (~25 LOC)

Add status chip on treatment cards (treatment tab list):
```jsx
{t.status === 'doctor-recorded' && (
  <span
    data-testid={`treatment-status-chip-doctor-recorded-${t.id}`}
    className="ml-2 px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-950
               border border-amber-200 dark:border-amber-800
               text-amber-900 dark:text-amber-100 text-xs font-medium
               inline-flex items-center gap-1"
  >
    <Stethoscope className="w-3 h-3" />
    แพทย์ลงบันทึก
  </span>
)}
```

### 5.4 `src/components/backend/TreatmentTimelineModal.jsx` (~10 LOC)

Mirror the chip in row header (next to date badge), same pattern.

### 5.5 NEW tests (3 files, ~500 LOC)

| File | Groups | Tests | Purpose |
|---|---|---|---|
| `tests/phase-26-0-doctor-save-flow-simulate.test.js` | F1–F8 | ~30 | Rule I full-flow: doctor-save → status='doctor-recorded' → admin opens edit → canAddNewItems=true → admin adds items → admin save → status cleared, stock+course deducted ONCE (not double), recordedBy preserved |
| `tests/phase-26-0-doctor-save-source-grep.test.js` | G1–G3 | ~20 | AV37 source-grep: every deduction/sale-create site has `saveMode !== 'doctor'` gate; doctor-button source markers; canAddNewItems wired at 5 UI sites |
| `tests/phase-26-0-status-display-rtl.test.jsx` | D1–D3 | ~15 | RTL: amber chip renders on `t.status === 'doctor-recorded'` in CustomerDetailView + TimelineModal; banner renders in TFP edit-mode |

Plus +7 AV37.x sub-tests in `tests/audit-anti-vibe-code.test.js`.

### 5.6 `.agents/skills/audit-anti-vibe-code/SKILL.md` — AV37 invariant

```markdown
AV37 — TFP doctor-save gate discipline (V26.0, 2026-05-13)
        Every `await deductCourseItems(`, `await deductStockForTreatment(`
        (consumables type 6 only), `await createBackendSale(`,
        `await assignCourseToCustomer(`, `await applyDepositToSale(`,
        `await deductWallet(`, `await earnPoints(` in
        `src/components/TreatmentFormPage.jsx` `handleSubmit` MUST be
        preceded by `saveMode !== 'doctor'` gate within 50 chars
        OR be inside an `if (saveMode === 'staff')` block.
        Sanctioned exceptions: `deductStockForTreatment` for medications
        (type 7) — KEPT per Q2 brainstorming decision.
```

### 5.7 NEW wiki page

`wiki/concepts/treatment-status-and-doctor-save.md` — full taxonomy + flow diagram + Rule of 3 link to `lockedX` family (Phase 25.0c).

---

## 6. Verification + Rule cross-references

### Rule I — Full-flow simulate
F1-F8 chain doctor-save → admin-edit → admin-save round-trip, verifying:
- (F1) doctor-save writes treatment with status='doctor-recorded' + recordedBy + recordedAt + NO deduction movements
- (F2) doctor-save with treatmentItems in form → still SKIPPED in write (gate works)
- (F3) admin edit loads treatment → canAddNewItems=true → AddBtn visible in DOM
- (F4) admin adds course-items → admin save → updates treatment → status cleared + recordedBy preserved + deductCourseItems fires ONCE
- (F5) admin adds consumables → admin save → deductStockForTreatment fires ONCE
- (F6) admin adds purchasedItems → admin save → createBackendSale fires + assignCourseToCustomer fires + linkedSaleId back-link
- (F7) idempotency: re-save admin → no double-deduct (existing reversal logic)
- (F8) adversarial: doctor-save on EDIT mode (legacy treatment) → button hidden + saveMode arg silently ignored

### Rule N — Targeted test scope
Small feature with focused surface → run targeted (Phase 26.0 + AV37) during iteration; full suite at batch end.

### Rule P — Class-of-bug
"doctor-save forgot a gate → double-deduct on admin finalize" = V12 multi-writer-sweep at handleSubmit level. AV37 + F1-F8 + Phase 26.0 source-grep regression are the Tier 1+2 artifacts. Tier 3 (V-entry + iron-clad rule) NOT triggered (this is a feature-class invariant, not architectural).

### Rule M — Data ops
NO migration. Legacy treatments stay `status: undefined`. No backfill.

### Rule B — Probe-Deploy-Probe
NOT triggered. firestore.rules unchanged.

### Local-only directive
NO deploy this turn. User authorizes `vercel --prod` separately when ready.

---

## 7. Non-goals (YAGNI)

- **NO** per-user save-history view ("who-saved-what timeline"). Audit fields exist; UI deferred.
- **NO** doctor-save draft autosave (single-click commit only).
- **NO** preventing doctor from saving with empty OPD (existing required-field validation applies).
- **NO** notifications to admin when doctor saves (chip in CustomerDetailView is the signal).
- **NO** reverting status (`'doctor-recorded'` → undefined manually). Cleared only on admin's full save.

---

## 8. Risks + mitigations

| Risk | Mitigation |
|---|---|
| V12 missed gate at deduction site → double-deduct | AV37 audit + F1-F8 flow-simulate + source-grep regression |
| `reverseCourseDeduction([])` not safe on empty | Verify in implementation; gate explicitly `if (status !== 'doctor-recorded') runReverse()` if unsafe |
| `loadedTreatment.status` race (TFP loads async; canAddNewItems computed before load) | Default `canAddNewItems = (mode==='create')`; flip true after load (useMemo or useState) |
| Edit mode banner flickers when treatment.status updates async | Gate on `loadedTreatment` truthy + `loadedTreatment.status === 'doctor-recorded'` |
| Doctor-save fires twice (double-click) | Existing `submitting` flag pattern reused |
| Stale `recordedBy` after admin re-saves | Forensic-trail design says PRESERVE; updateBackendTreatment must NOT clear recordedBy/At |

---

## 9. Implementation plan (deferred to writing-plans skill)

Steps to be detailed by `writing-plans` after this spec is user-approved:

1. Phase 26.0a — `auth` import in TFP + `saveMode` parameter scaffolding
2. Phase 26.0b — 5 gate sites + status/recordedBy/recordedAt stamp
3. Phase 26.0c — `canAddNewItems` flag + UI gate replacements
4. Phase 26.0d — Doctor-save button + edit-mode banner
5. Phase 26.0e — Status chips in CustomerDetailView + TimelineModal
6. Phase 26.0f — AV37 audit invariant + 3 NEW test files
7. Phase 26.0g — Wiki page + SESSION_HANDOFF + active.md updates

Estimated total: ~770 LOC (135 source + 500 tests + 135 docs/wiki). 1-2 sessions.

---

## 10. Rule of 3 link

Phase 26.0 `saveMode` joins the `lockedX` family (Phase 25.0c `lockedChannel` + Phase 21.0 `lockedAppointmentType` + `lockedCustomer`) as a NEW architectural pattern: **payload-shape-routing via single argument with explicit gate sites + AV invariant + source-grep regression**. Future similar "save-mode" variants (e.g., draft-save) MUST mirror this pattern: arg parameter + gate-at-every-site + AV invariant + flow-simulate F-tests.

---

**END OF SPEC** — awaiting user review.
