# Phase 26.1 — TFP Polish + Editor-Attribution Modal

**Date**: 2026-05-13
**Status**: DESIGN (brainstorming approved 2026-05-13)
**Phase**: Follow-up to Phase 26.0 (doctor-save shipped same day)
**Rule J HARD-GATE**: brainstorming completed; 3 Qs locked

---

## 1. User intent (verbatim)

> "การบันทึกการแก้ไขของพนักงานใน TFP ..เมื่อกดบันทึกการแก้ไขแล้วให้มี modal เด้งขึ้นมาแล้วให้เลือกรายชื่อ พนักงาน ผู้ช่วย แพทย์ ในสาขานั้นๆ เพื่อบันทึกว่าใครเป็นผู้แก้ไขบันทึการรักษานี้ และแสดงใน list ในรายการ ประวัติการรักษาในหน้าข้อมูลลูกค้า บริเวณในภาพด้วย"
>
> "ในประวัติการรักษา บริเวณ list ในภาพ ยังไม่มี badge แสดงว่าแพทย์บันทึกเรียบร้อยแล้ว"
>
> "ในหน้า TFP เอาปุ่มยืนยันการรักษาที่อยู่ขวาบนของหน้าจอออกไป มันใช้ไม่ได้แล้ว"

Three issues from screenshot of treatment history list:
1. **NEW feature** — editor-attribution modal on staff edit-save (pick who edited, show in list)
2. **Bug fix** — Phase 26.0e "แพทย์ลงบันทึก" chip missing in CDV treatment list
3. **Cleanup** — remove top-right "ยืนยันการรักษา" button (no longer functional)

---

## 2. Locked decisions (3 brainstorming Qs)

| # | Question | Decision |
|---|---|---|
| Q1 | Modal trigger? | **Edit mode only** — `mode === 'edit' && saveMode === 'staff'`. Doctor-save bypasses (recordedBy auto-stamps). Create mode bypasses (doctorId picker covers attribution). |
| Q2 | Picker shape? | **Single picker, merged list** with role labels inline. Staff + doctors + assistants filtered by current branch. Save 4 fields (editedBy uid, editedByName, editedByRole, editedAt). |
| Q3 | CDV display? | **Inline row meta** — append "· แก้ไขโดย: คุณ A (ผู้ช่วย)" to existing doctor/assistant meta line. No new row, no chip. |

---

## 3. Item A — Bug fix: badge missing in CDV (V12 multi-reader-sweep)

### 3.1 Root cause

`CustomerDetailView.jsx:432-442` — in-component `treatmentSummary` useMemo maps from raw `treatments[]` array, but the mapper STRIPS the `status` field. Phase 26.0e correctly added `status: t.status || null` to `rebuildTreatmentSummary` (the WRITER in backendClient.js) but missed this READER — exact V12 multi-reader-sweep pattern.

Result: customer.treatmentSummary stored to Firestore has `status`, but CDV recomputes `treatmentSummary` locally from `treatments[]` and strips it before the chip render reads `t.status === 'doctor-recorded'`.

### 3.2 Fix

`CustomerDetailView.jsx:432-442` — add 4 fields to summary mapper:

```js
list = treatments.map(t => ({
  id: t.treatmentId || t.id,
  date: t.detail?.treatmentDate || '',
  doctor: t.detail?.doctorName || '',
  assistants: (t.detail?.assistantNames || t.detail?.assistants || t.detail?.assistantIds || [])
    .map(a => typeof a === 'string' ? a : (a?.name || '')),
  branch: t.detail?.branch || '',
  cc: t.detail?.symptoms || '',
  dx: t.detail?.diagnosis || '',
  createdBy: t.createdBy || 'cloned',
  // V26.1 — V12 multi-reader-sweep miss (Phase 26.0e fixed writer in
  // rebuildTreatmentSummary; this reader was overlooked). Same fix +
  // Phase 26.1 editedBy attribution fields.
  status: t.status || null,
  editedBy: t.editedBy || null,
  editedByName: t.editedByName || '',
  editedByRole: t.editedByRole || '',
}));
```

### 3.3 Reader audit (V12 sweep)

After Phase 26.1 fix, audit every reader of `treatmentSummary` array for status/editedBy preservation:

- ✅ `CustomerDetailView.jsx` — fixed in this phase
- ✅ `TreatmentTimelineModal.jsx` — already reads from same `treatmentSummary` prop (passed by CDV); inherits fix
- ✅ `rebuildTreatmentSummary` in backendClient.js — already preserves status (Phase 26.0e); will extend to preserve editedBy fields

No other readers.

---

## 4. Item B — Cleanup: remove top-right "ยืนยันการรักษา" button

### 4.1 Location

`TreatmentFormPage.jsx:2888-2893` (inside sticky header bar at lines 2876-2895):

```jsx
<button onClick={handleSubmit} disabled={saving}
  className="px-5 py-2.5 rounded-lg text-sm font-bold text-white disabled:opacity-50 transition-all flex items-center gap-2 hover:opacity-90 active:scale-[0.98]"
  style={{ backgroundColor: accent }}>
  {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
  {saving ? 'กำลังบันทึก...' : isEdit ? 'บันทึก' : 'ยืนยันการรักษา'}
</button>
```

### 4.2 Fix

Delete the button JSX block. Keep the bottom save button at lines 4816-4819 as the canonical save path. The doctor-save button (Phase 26.0d) under OPD Card remains untouched.

Verify the surrounding header (close button + title) still renders cleanly after removal — there may be flex/gap adjustments needed if the button was a flex child.

### 4.3 Out-of-scope

Other header buttons (close, title) are not affected. The bottom save button at line 4816-4819 is the SINGLE remaining canonical save path for staff/admin.

---

## 5. Item C — NEW feature: editor-attribution modal

### 5.1 Trigger conditions

```js
const needsEditorAttribution = mode === 'edit' && saveMode === 'staff';
```

- `mode === 'edit'` — only edit-mode (Q1 locked)
- `saveMode === 'staff'` — only staff save (not doctor-save; doctor-save has its own recordedBy)
- ⚠️ Phase 26.0 `saveMode` defensive coercion already returns 'staff' for any non-'doctor' arg → covers form-submit event handlers cleanly

### 5.2 Flow

```
admin clicks "บันทึกการแก้ไข" (bottom button at 4816)
        │
        ▼
handleSubmit fires → saveMode = 'staff' (default)
        │
        ▼
Pre-validation (existing logic at 1910-1985)
        │
        ▼
needsEditorAttribution? ✓
        │
        ▼
open EditAttributionModal (suspend the rest of handleSubmit)
        │
        ▼
[user picks person → state stored]
        │
        ▼
User clicks "บันทึก" → modal closes + handleSubmit RESUMES with editor context
        │
        ▼
Resume = re-invoke handleSubmit with explicit editorContext arg
        │
        ▼
v26StatusPatch extends with editedBy + editedByName + editedByRole + editedAt
        │
        ▼
Existing save flow continues (Phase 26.0 gates + createBackendTreatment/update)
        │
        ▼
rebuildTreatmentSummary preserves editor fields → CDV display
```

### 5.3 Modal component

NEW file `src/components/backend/EditAttributionModal.jsx`:

```jsx
import { useState, useMemo, useEffect } from 'react';
import { X, Users, Stethoscope, UserCheck } from 'lucide-react';
import { listStaff, listDoctors } from '../../lib/scopedDataLayer.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import { filterStaffByBranch, filterDoctorsByBranch } from '../../lib/branchFilterHelpers.js';
// (helper module name TBD per existing BSA pattern)

export default function EditAttributionModal({
  isOpen,
  onConfirm,
  onCancel,
  isDark,
}) {
  const { branchId: selectedBranchId } = useSelectedBranch();
  const [allStaff, setAllStaff] = useState([]);
  const [allDoctors, setAllDoctors] = useState([]);
  const [pickedId, setPickedId] = useState(null);
  const [loading, setLoading] = useState(false);

  // Load on open
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([listStaff(), listDoctors()])
      .then(([staff, doctors]) => {
        if (cancelled) return;
        setAllStaff(filterStaffByBranch(staff, selectedBranchId) || []);
        setAllDoctors(filterDoctorsByBranch(doctors, selectedBranchId) || []);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen, selectedBranchId]);

  // Merge into single list with role labels (Q2 locked)
  const merged = useMemo(() => {
    const items = [];
    allDoctors.forEach(d => {
      const role = (d.position === 'ผู้ช่วยแพทย์') ? 'assistant' : 'doctor';
      const roleLabel = role === 'assistant' ? 'ผู้ช่วย' : 'แพทย์';
      items.push({ id: String(d.id), name: d.name || '', role, roleLabel });
    });
    allStaff.forEach(s => {
      items.push({ id: String(s.id), name: s.name || '', role: 'staff', roleLabel: 'พนักงาน' });
    });
    return items;
  }, [allStaff, allDoctors]);

  if (!isOpen) return null;

  const handleConfirm = () => {
    const picked = merged.find(m => m.id === pickedId);
    if (!picked) return;
    onConfirm({
      uid: picked.id,
      name: picked.name,
      role: picked.role,
    });
  };

  return (
    <div
      data-testid="edit-attribution-modal"
      className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60"
      onClick={onCancel}
    >
      <div
        className={`max-w-md w-full rounded-xl p-5 shadow-2xl ${isDark ? 'bg-[var(--bg-card)]' : 'bg-white'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">เลือกผู้แก้ไขบันทึกการรักษา</h3>
          <button onClick={onCancel} data-testid="edit-attribution-cancel">
            <X size={18} />
          </button>
        </div>

        <p className="text-xs text-[var(--tx-muted)] mb-3">
          เลือกชื่อ พนักงาน / ผู้ช่วย / แพทย์ ที่เป็นผู้แก้ไขบันทึกการรักษานี้
        </p>

        <select
          data-testid="edit-attribution-picker"
          value={pickedId || ''}
          onChange={(e) => setPickedId(e.target.value)}
          disabled={loading}
          className="w-full px-3 py-2 rounded border bg-[var(--bg-elevated)] text-sm"
        >
          <option value="">— เลือกผู้แก้ไข —</option>
          {merged.map(m => (
            <option key={m.id} value={m.id}>
              {m.name} · {m.roleLabel}
            </option>
          ))}
        </select>

        <div className="flex gap-2 mt-5 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded border text-sm"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!pickedId}
            data-testid="edit-attribution-confirm"
            className="px-4 py-2 rounded bg-purple-600 text-white text-sm font-bold disabled:opacity-50"
          >
            บันทึก
          </button>
        </div>
      </div>
    </div>
  );
}
```

NOTE: `filterStaffByBranch` / `filterDoctorsByBranch` may live in `BranchContext.jsx` or a separate helper module — verify at implementation time. If they don't exist as separate exports, use the universal listers + filter inline (be_staff / be_doctors are universal collections per BSA, but each doc has `branchIds[]` or `branchId` field for membership).

### 5.4 TFP integration

`TreatmentFormPage.jsx` — add modal state + flow:

```js
// State (near other modal states, top of component)
const [editAttributionModal, setEditAttributionModal] = useState({
  isOpen: false,
  pendingSave: null,  // { eventOrSaveMode, ...captured args }
});

// In handleSubmit, after pre-validation, before the main payload build:
const needsEditorAttribution = isEdit && saveMode === 'staff';
if (needsEditorAttribution && !editorContext) {
  // First call (from button click) — open modal, suspend save
  setEditAttributionModal({ isOpen: true, pendingSave: { saveMode } });
  return;  // Wait for modal confirm
}

// Handler — modal confirm resumes handleSubmit with editor context
const handleEditAttributionConfirm = (editorCtx) => {
  setEditAttributionModal({ isOpen: false, pendingSave: null });
  // Re-invoke handleSubmit with editorContext
  handleSubmit({ saveMode: 'staff', editorContext: editorCtx });
};

const handleEditAttributionCancel = () => {
  setEditAttributionModal({ isOpen: false, pendingSave: null });
  // No save — admin can cancel without losing form state
};
```

⚠️ handleSubmit signature must accept a third arg shape — `{ saveMode, editorContext }` — without breaking Phase 26.0 defensive coercion. Adjust:

```js
const handleSubmit = async (eventOrSaveMode, options = {}) => {
  // V26.0 defensive coercion
  let saveMode = 'staff';
  let editorContext = null;
  if (typeof eventOrSaveMode === 'string' && eventOrSaveMode === 'doctor') {
    saveMode = 'doctor';
  } else if (eventOrSaveMode && typeof eventOrSaveMode === 'object' && !eventOrSaveMode.preventDefault) {
    // Internal re-invoke: { saveMode, editorContext }
    saveMode = eventOrSaveMode.saveMode || 'staff';
    editorContext = eventOrSaveMode.editorContext || null;
  } else if (eventOrSaveMode && typeof eventOrSaveMode.preventDefault === 'function') {
    eventOrSaveMode.preventDefault();
  }
  // ... rest of handler
};
```

This preserves Phase 26.0 behavior (string 'doctor' / event / undefined → 'staff') AND adds the internal re-invoke path with editor context.

### 5.5 v26StatusPatch extension

```js
const v26StatusPatch = saveMode === 'doctor' ? {
  status: 'doctor-recorded',
  ...(isEdit && loadedTreatmentStatus === 'doctor-recorded' ? {} : {
    recordedBy: auth.currentUser?.uid || null,
    recordedAt: serverTimestamp(),
  }),
} : {
  // V26.1 — staff save (including admin finalize of doctor-recorded)
  status: deleteField(),
  // V26.1 — editor attribution from modal (mandatory on edit; null on create)
  ...(editorContext ? {
    editedBy: editorContext.uid,
    editedByName: editorContext.name,
    editedByRole: editorContext.role,
    editedAt: serverTimestamp(),
  } : {}),
};
```

### 5.6 backendClient.js extension

`createBackendTreatment` + `updateBackendTreatment` extract the new top-level fields (same pattern as Phase 26.0b status extraction):

```js
const { status, recordedBy, recordedAt, editedBy, editedByName, editedByRole, editedAt, ...rest } = detail || {};
const topLevelPatch = {};
if (status !== undefined) topLevelPatch.status = status;
if (recordedBy !== undefined) topLevelPatch.recordedBy = recordedBy;
if (recordedAt !== undefined) topLevelPatch.recordedAt = recordedAt;
if (editedBy !== undefined) topLevelPatch.editedBy = editedBy;
if (editedByName !== undefined) topLevelPatch.editedByName = editedByName;
if (editedByRole !== undefined) topLevelPatch.editedByRole = editedByRole;
if (editedAt !== undefined) topLevelPatch.editedAt = editedAt;
// ...spread topLevelPatch + detail: rest into setDoc/updateDoc payload
```

### 5.7 rebuildTreatmentSummary extension

```js
const summary = treatments.map(t => ({
  // ... existing fields (Phase 26.0e includes status)
  status: t.status || null,
  // V26.1 — editor attribution fields preserved for CDV display
  editedBy: t.editedBy || null,
  editedByName: t.editedByName || '',
  editedByRole: t.editedByRole || '',
}));
```

### 5.8 CDV row meta display

`CustomerDetailView.jsx` row meta block (around line 1005-1008):

```jsx
<div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5 text-xs text-[var(--tx-muted)]">
  {t.branch && <span>{t.branch}</span>}
  {t.doctor && <span className="font-semibold text-[var(--tx-secondary)]">· {t.doctor}</span>}
  {t.assistants?.length > 0 && <span>· {t.assistants.join(', ')}</span>}
  {/* V26.1 — last-editor attribution inline */}
  {t.editedByName && (
    <span data-testid={`treatment-edited-by-${t.id}`} className="italic opacity-80">
      · แก้ไขโดย: {t.editedByName}
      {t.editedByRole && ROLE_LABEL_TH[t.editedByRole] && ` (${ROLE_LABEL_TH[t.editedByRole]})`}
    </span>
  )}
</div>
```

Constant (top of file or shared util):
```js
const ROLE_LABEL_TH = {
  doctor: 'แพทย์',
  assistant: 'ผู้ช่วย',
  staff: 'พนักงาน',
};
```

### 5.9 TimelineModal mirror (optional Q-deferred)

`TreatmentTimelineModal.jsx` already iterates `treatmentSummary`. Add the same `t.editedByName && <span>` block in the row header for consistency. ~10 LOC.

---

## 6. Data schema additions

`be_treatments/{id}` gains 4 NEW additive fields:

```js
{
  // ... Phase 26.0 fields preserved
  // V26.1 — editor attribution
  editedBy: '<staffId>' | null,           // selected from picker (staff/doctor docId)
  editedByName: '<display name>' | '',    // denormalized for display
  editedByRole: 'doctor' | 'assistant' | 'staff' | '',
  editedAt: Timestamp | null,             // serverTimestamp at modal-confirmed save
}
```

Backward compat: legacy treatments stay `editedBy: null` → CDV display gracefully skips. NO data migration. NO firestore.rules change.

---

## 7. Files touched (estimate)

| File | Change | LOC |
|---|---|---|
| `src/components/backend/CustomerDetailView.jsx` | Summary mapper status + editedBy fields + inline meta display + ROLE_LABEL_TH constant | ~30 |
| `src/components/TreatmentFormPage.jsx` | Remove top-right button (2888-2893) + modal state + handleSubmit signature extension + v26StatusPatch extension + modal mount | ~80 |
| `src/components/backend/EditAttributionModal.jsx` (NEW) | Modal component with merged-list picker | ~150 |
| `src/components/backend/TreatmentTimelineModal.jsx` | Optional mirror display | ~10 |
| `src/lib/backendClient.js` | Top-level extraction in create+update + rebuildTreatmentSummary | ~20 |
| `tests/phase-26-0-doctor-save-source-grep.test.js` | Append G3 (modal source-grep) | ~30 |
| `tests/phase-26-0-status-display-rtl.test.jsx` | Append D5 (editedBy display + summary fix verification) | ~30 |
| `tests/phase-26-0-doctor-save-flow-simulate.test.js` | Append F9 (edit-save-with-modal flow) | ~40 |
| `tests/edit-attribution-modal-rtl.test.jsx` (NEW) | RTL test for modal component (E1-E5) | ~120 |
| `tests/audit-branch-scope.test.js` | Extend AV37 with .9-.11 sub-tests | ~30 |
| `.agents/skills/audit-anti-vibe-code/SKILL.md` | Extend AV37 entry with editor-attribution + V26.1 V12 reader-sweep note | ~20 |

**Total**: ~560 LOC. ~1 session.

---

## 8. Test plan

### G3 — handleSubmit modal integration source-grep
- G3.1 — `editAttributionModal` state declared with `isOpen + pendingSave` shape
- G3.2 — `needsEditorAttribution = isEdit && saveMode === 'staff'` guard exists
- G3.3 — `<EditAttributionModal` rendered when `editAttributionModal.isOpen`
- G3.4 — handleSubmit signature accepts `(eventOrSaveMode, options)` form
- G3.5 — v26StatusPatch includes editedBy/At/Name/Role conditional spread
- G3.6 — top-right button at 2888-2893 REMOVED (source-grep regression)

### D5 — RTL display assertions
- D5.1 — CDV summary mapper includes `status + editedBy + editedByName + editedByRole`
- D5.2 — CDV row meta renders `· แก้ไขโดย: <name> (<role>)` when editedByName present
- D5.3 — ROLE_LABEL_TH mapping correct (doctor/assistant/staff)
- D5.4 — rebuildTreatmentSummary in backendClient.js includes editedBy fields

### F9 — flow-simulate edit-save with modal
- F9.1 — staff edit save WITHOUT editorContext: returns early (modal opens)
- F9.2 — staff edit save WITH editorContext: writes editedBy/At/Name/Role to treatment patch
- F9.3 — doctor-save bypasses modal (saveMode === 'doctor' skips needsEditorAttribution)
- F9.4 — create mode bypasses modal (mode === 'create' skips needsEditorAttribution)
- F9.5 — cancel resets pendingSave + does NOT write
- F9.6 — modal-confirmed save preserves Phase 26.0 v26StatusPatch (status, recordedBy/At still cleared/preserved as before)

### E1-E5 — EditAttributionModal RTL
- E1 — modal renders only when isOpen=true
- E2 — picker lists staff + doctors + assistants filtered by branch (mock listStaff/Doctors)
- E3 — role labels rendered inline ("Name · แพทย์")
- E4 — "บันทึก" disabled until selection; calls onConfirm with {uid, name, role}
- E5 — "ยกเลิก" / backdrop click → onCancel + state preserved

### AV37 extension (AV37.9-AV37.11)
- AV37.9 — EditAttributionModal exists at `src/components/backend/EditAttributionModal.jsx`
- AV37.10 — TFP handleSubmit signature accepts `(eventOrSaveMode, options)` (Phase 26.1 extension)
- AV37.11 — editedBy/At/Name/Role fields land in top-level treatment doc (not nested in detail)

---

## 9. Risks + mitigations

| Risk | Mitigation |
|---|---|
| Modal interception breaks handleSubmit re-entry (existing single-flight pattern via `saving` flag) | Test F9.1/F9.2 specifically — modal-cancel must reset state cleanly; re-invoke via `{saveMode, editorContext}` arg shape preserves all closure refs |
| Phase 26.0 defensive coercion regression | Extended coercion logic preserves: string 'doctor' / Event / undefined / null → 'staff'; new internal `{saveMode, editorContext}` object form ONLY when explicitly passed. Source-grep regression in G3.4 |
| `filterStaffByBranch` / `filterDoctorsByBranch` may not exist as exports | If missing, use universal listers + inline filter on `branchIds[]` / `branchId` field per doc; document at implementation time |
| Legacy treatments without editedBy break CDV display | Defensive: chip + meta line check `t.editedByName && ...` — null/empty gracefully skip |
| Top-right button removal breaks flex layout of header | Verify after removal — surrounding header has close-button + title; gap-X classes may need adjustment. RTL header-render test catches this |
| be_staff and be_doctors are universal (not branch-scoped) — branch filter must read doc.branchIds[] | Existing BSA helpers handle this; verify at impl time |

---

## 10. Non-goals (YAGNI)

- **NO edit history array** — single `editedBy` field (overwritten on each subsequent edit). Future "edit log" can extend.
- **NO multi-select** — single editor per save (Q2 locked).
- **NO modal for create-mode saves** — doctorId picker covers attribution.
- **NO modal for doctor-save** — recordedBy already auto-stamps.
- **NO retroactive editor attribution** — legacy treatments stay null; users can re-edit + select to populate going forward.

---

## 11. Implementation plan (deferred to writing-plans skill)

3 logical sub-phases:

- **Phase 26.1a — Bug fix + cleanup (~30 LOC)**: CDV summary mapper status/editedBy fields + remove top-right button. Smallest atomic commit.
- **Phase 26.1b — Modal component + tests (~270 LOC)**: NEW EditAttributionModal + E1-E5 RTL tests. Independent of TFP integration.
- **Phase 26.1c — TFP integration + display + AV37 ext (~260 LOC)**: handleSubmit signature extension + v26StatusPatch ext + backendClient extraction + rebuildTreatmentSummary ext + CDV inline meta display + G3/D5/F9 tests + AV37.9-AV37.11.

writing-plans skill will detail each sub-phase into bite-sized tasks.

---

## 12. Rule of 3 implications

`EditAttributionModal` joins the "pick a person before action" pattern family with `ActorConfirmModal` (existing in `src/components/backend/ActorConfirmModal.jsx` — stock state-flip confirmations). Rule of 3 not yet reached (2 instances), but a future 3rd similar modal should consider extracting a shared `<PersonPickerModal>` base component.

`handleSubmit` signature extension is the 2nd evolution of Phase 26.0a's defensive coercion. Coercion remains backward-compat for all existing callers; new `{saveMode, editorContext}` object form is for internal re-invocation only.

---

## 13. Verification + Rule cross-references

- **Rule N**: targeted test during iteration; full suite at end of Phase 26.1c.
- **Rule I**: F9 full-flow simulate covers edit-save-with-modal round-trip.
- **Rule P**: Item A is a class-of-bug instance (V12 multi-reader-sweep at the in-component memo level — different boundary from rebuildTreatmentSummary writer). Mitigation: source-grep regression D5.1 + audit-grep sweep of all readers of `treatmentSummary` array.
- **Rule M**: NO data migration. NO Rule M trigger.
- **Rule B**: NO firestore.rules change. NO Probe-Deploy-Probe trigger.
- **Local-only**: NO deploy this turn. User authorizes `vercel --prod` separately when ready.

---

**END OF SPEC** — awaiting user review.
