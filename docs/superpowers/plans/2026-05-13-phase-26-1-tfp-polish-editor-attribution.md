# Phase 26.1 — TFP Polish + Editor-Attribution Modal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Phase 26.0e V12 multi-reader-sweep miss (CDV chip not rendering); remove broken top-right "ยืนยันการรักษา" button; add editor-attribution modal on staff edit-save that records who edited the treatment record and displays it in CDV treatment history list.

**Architecture:** 3 sub-phases — 26.1a (bug + cleanup, single small commit) → 26.1b (NEW modal component standalone with RTL tests) → 26.1c (TFP integration + display + audit). handleSubmit signature extends from Phase 26.0's `(eventOrSaveMode)` to `(eventOrSaveMode, options = {})` with backward-compat defensive coercion preserved. Modal opens between pre-validation and main save flow; user-confirmed pick re-invokes handleSubmit with `editorContext`.

**Tech Stack:** React 19 + Vite + Firebase Firestore (additive 4 fields on `be_treatments`) + Vitest 4.1 + RTL.

**Reference:** Spec at `docs/superpowers/specs/2026-05-13-phase-26-1-tfp-polish-editor-attribution-design.md`.

**Rule constraints**:
- No deploy this turn (local-only).
- No firestore.rules change (additive fields). No Rule B trigger.
- No data migration. No Rule M trigger.
- Rule N: targeted-test during iteration; full suite at batch end (Task 9).
- Rule of 3: `EditAttributionModal` mirrors `ActorConfirmModal` pattern (2nd member; not yet a Rule of 3 trigger).
- Rule P: Item A is V12 multi-reader-sweep at component-level summary memo; AV37 extension locks the reader-sweep contract.

---

## Pre-flight context (verified)

From Phase 26.0 + spec exploration:

- **TFP handleSubmit signature** (line ~1890): `const handleSubmit = async (eventOrSaveMode) => {` with Phase 26.0a defensive coercion at lines 1898-1905. Phase 26.1 extends to 2-arg form.
- **TFP top-right button**: `src/components/TreatmentFormPage.jsx:2888-2893` (sticky header). To be removed.
- **TFP bottom save button**: `src/components/TreatmentFormPage.jsx:4816-4819` (canonical). Untouched.
- **TFP saving state**: `const [saving, setSaving] = useState(false);` at line 373. Reused by modal as in-flight guard.
- **CDV summary mapper**: `src/components/backend/CustomerDetailView.jsx:429-448` — V12 miss site. Add 4 fields.
- **CDV row meta JSX**: `src/components/backend/CustomerDetailView.jsx:1005-1009`. Append editedBy inline.
- **CDV chip placement** (Phase 26.0e): `src/components/backend/CustomerDetailView.jsx:1009-1018`. Already correct; depends on Task 1 fix to render data.
- **rebuildTreatmentSummary**: `src/lib/backendClient.js:1080-1096`. Phase 26.0e added `status: t.status || null`. Phase 26.1 extends.
- **createBackendTreatment + updateBackendTreatment** (Phase 26.0b): `src/lib/backendClient.js` lines ~992-1023. Top-level extraction pattern. Phase 26.1 extends to 4 new fields.
- **be_staff + be_doctors are universal collections** per BSA (each doc has `branchIds[]` or single `branchId` field). Filter helpers location TBV; spec defaults to inline filter if separate exports don't exist.
- **ActorConfirmModal** reference: `src/components/backend/ActorConfirmModal.jsx` (existing pattern for confirmation-before-save).

---

## File Structure

**Files to CREATE:**
- `src/components/backend/EditAttributionModal.jsx` — modal component (~150 LOC)
- `tests/edit-attribution-modal-rtl.test.jsx` — E1-E5 RTL tests for modal (~120 LOC)

**Files to MODIFY:**
- `src/components/backend/CustomerDetailView.jsx` — summary mapper status + editedBy fields + inline meta display + ROLE_LABEL_TH (~30 LOC)
- `src/components/TreatmentFormPage.jsx` — remove top-right button + handleSubmit signature extension + v26StatusPatch extension + modal state + mount + handlers (~80 LOC)
- `src/lib/backendClient.js` — extend createBackendTreatment + updateBackendTreatment for editedBy fields + extend rebuildTreatmentSummary (~20 LOC)
- `tests/phase-26-0-doctor-save-source-grep.test.js` — append G3 block (~30 LOC)
- `tests/phase-26-0-status-display-rtl.test.jsx` — append D5 block (~30 LOC)
- `tests/phase-26-0-doctor-save-flow-simulate.test.js` — append F9 block (~50 LOC)
- `tests/audit-branch-scope.test.js` — extend AV37 with .9-.11 sub-tests (~30 LOC)
- `.agents/skills/audit-anti-vibe-code/SKILL.md` — extend AV37 entry (~20 LOC)
- `SESSION_HANDOFF.md` — Phase 26.1 session block
- `.agents/active.md` — current state update

**File NOT modified**: `src/components/backend/TreatmentTimelineModal.jsx` (optional mirror display deferred — Task 6 covers CDV display; user can request follow-up if needed).

---

## Task 1: Phase 26.1a — Bug fix CDV summary mapper + remove top-right button

**Files:**
- Modify: `src/components/backend/CustomerDetailView.jsx:432-442` (summary mapper)
- Modify: `src/components/TreatmentFormPage.jsx:2876-2895` (remove top-right button)

- [ ] **Step 1: Verify current state**

```bash
cd F:/LoverClinic-app
grep -nB 2 -A 12 "treatments\.map(t => ({" src/components/backend/CustomerDetailView.jsx | head -20
grep -nB 2 -A 8 "ยืนยันการรักษา" src/components/TreatmentFormPage.jsx | head -25
```

Expected: see CDV mapper with 8 fields (missing status + editedBy); see top-right button at line 2888-2893 + bottom button at line 4819.

- [ ] **Step 2: Add status + editedBy fields to CDV summary mapper**

In `src/components/backend/CustomerDetailView.jsx`, find the `treatmentSummary` useMemo at line 429. Edit the mapper at lines 432-442 to include 4 new fields:

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
  // V26.1 (2026-05-13) — V12 multi-reader-sweep fix.
  // Phase 26.0e correctly added `status` to rebuildTreatmentSummary (backendClient.js
  // writer at line 1080+) so customer.treatmentSummary stored in Firestore HAS status.
  // This in-component mapper was overlooked — it strips top-level fields when
  // recomputing locally from `treatments[]` array. Resulting `paginatedTreatments`
  // had no `status` field, so the amber "แพทย์ลงบันทึก" chip at row meta never rendered.
  // Phase 26.1 adds 4 top-level fields: status (chip) + editedBy/Name/Role (NEW
  // editor-attribution display).
  status: t.status || null,
  editedBy: t.editedBy || null,
  editedByName: t.editedByName || '',
  editedByRole: t.editedByRole || '',
}));
```

- [ ] **Step 3: Remove top-right "ยืนยันการรักษา" button**

In `src/components/TreatmentFormPage.jsx`, find the header bar around lines 2876-2895. Locate the button at lines 2888-2893:

```jsx
<button onClick={handleSubmit} disabled={saving}
  className="px-5 py-2.5 rounded-lg text-sm font-bold text-white disabled:opacity-50 transition-all flex items-center gap-2 hover:opacity-90 active:scale-[0.98]"
  style={{ backgroundColor: accent }}>
  {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
  {saving ? 'กำลังบันทึก...' : isEdit ? 'บันทึก' : 'ยืนยันการรักษา'}
</button>
```

Delete this entire JSX block. The surrounding header JSX (close button + title) should remain. Verify after deletion that the header still renders cleanly — if the button was a flex child with gap, check for orphaned wrapper or stray comma.

Add a marker comment at the deletion site:

```jsx
{/* V26.1 (2026-05-13) — top-right "ยืนยันการรักษา" button REMOVED.
    User report: button no longer functional. Bottom save button at
    line ~4816 (post-removal line numbers will shift) is the canonical
    save path. Doctor-save button (Phase 26.0d) under OPD Card unchanged. */}
```

- [ ] **Step 4: Build + run targeted tests**

```bash
cd F:/LoverClinic-app && npm run build 2>&1 | tail -8
cd F:/LoverClinic-app && npx vitest run tests/phase-26-0-status-display-rtl.test.jsx tests/phase-26-0-doctor-save-source-grep.test.js 2>&1 | tail -5
```

Expected:
- Build clean (chunk-size warning OK).
- Existing tests still PASS (62+ from Phase 26.0 baseline).

- [ ] **Step 5: Commit + push**

```bash
cd F:/LoverClinic-app
git add src/components/backend/CustomerDetailView.jsx src/components/TreatmentFormPage.jsx
git commit -m "$(cat <<'EOF'
fix(Phase 26.1a): CDV summary mapper status field + remove TFP top-right button

A. Bug fix — V12 multi-reader-sweep miss at CDV:432-442:
   Phase 26.0e fixed rebuildTreatmentSummary (writer) to preserve status
   field but missed this in-component useMemo (reader). When `treatments`
   array has data, the local mapper strips top-level fields, including
   `status`, before paginatedTreatments → chip render reads `t.status`.
   Result: amber "แพทย์ลงบันทึก" chip never rendered even after Phase 26.0e
   doctor-save successfully wrote status='doctor-recorded' to Firestore.

   Fix = add 4 fields to mapper: status + editedBy/Name/Role (the latter 3
   are Phase 26.1 forward-prep for the editor-attribution modal landing
   in Tasks 2-8).

B. Cleanup — remove TFP:2888-2893 top-right "ยืนยันการรักษา" button:
   User report: no longer functional. Bottom save button at line 4816+
   is the canonical save path. Doctor-save button under OPD Card untouched.

Smallest atomic commit per spec § 11. Tasks 2-10 follow.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin master 2>&1 | tail -3
```

Expected: 1 commit pushed. Tests still pass; build clean.

---

## Task 2: Phase 26.1b — EditAttributionModal component (TDD via RTL)

**Files:**
- Create: `tests/edit-attribution-modal-rtl.test.jsx`
- Create: `src/components/backend/EditAttributionModal.jsx`

- [ ] **Step 1: Verify branch-filter helpers + collection accessors**

```bash
cd F:/LoverClinic-app
grep -nE "export.*filterStaffByBranch|export.*filterDoctorsByBranch" src/lib/ 2>&1 | head -5
grep -nE "export.*listStaff|export.*listDoctors" src/lib/scopedDataLayer.js 2>&1 | head -5
grep -nE "branchIds\[\]|branchId.*be_staff|filterStaff" src/lib/BranchContext.jsx 2>&1 | head -5
```

Document the result:
- If `filterStaffByBranch` / `filterDoctorsByBranch` exist as exports → use them directly.
- If they don't exist → use the universal listers + inline filter on `d.branchIds?.includes(selectedBranchId)` or `d.branchId === selectedBranchId`.

The spec already flags this as a risk; the modal's branch-filter logic adapts.

- [ ] **Step 2: Write E1-E5 RTL tests (FAIL expected)**

Create `tests/edit-attribution-modal-rtl.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mock listStaff + listDoctors (scopedDataLayer) BEFORE importing modal
vi.mock('../src/lib/scopedDataLayer.js', () => ({
  listStaff: vi.fn(() => Promise.resolve([
    { id: 'staff-1', name: 'ปุ๊ก', branchIds: ['BR-A'] },
    { id: 'staff-2', name: 'แอน', branchIds: ['BR-B'] },
  ])),
  listDoctors: vi.fn(() => Promise.resolve([
    { id: 'doc-1', name: 'หมอมายด์', position: 'แพทย์', branchIds: ['BR-A'] },
    { id: 'doc-2', name: 'พี่อร', position: 'ผู้ช่วยแพทย์', branchIds: ['BR-A'] },
    { id: 'doc-3', name: 'หมอบี', position: 'แพทย์', branchIds: ['BR-B'] },
  ])),
}));

// Mock BranchContext
vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: () => ({ branchId: 'BR-A' }),
}));

import EditAttributionModal from '../src/components/backend/EditAttributionModal.jsx';

describe('Phase 26.1 — EditAttributionModal RTL', () => {
  it('E1 — modal renders only when isOpen=true', () => {
    const { rerender } = render(
      <EditAttributionModal isOpen={false} onConfirm={() => {}} onCancel={() => {}} isDark={false} />
    );
    expect(screen.queryByTestId('edit-attribution-modal')).toBeNull();

    rerender(
      <EditAttributionModal isOpen={true} onConfirm={() => {}} onCancel={() => {}} isDark={false} />
    );
    expect(screen.queryByTestId('edit-attribution-modal')).toBeInTheDocument();
  });

  it('E2 — picker lists staff + doctors + assistants filtered by branch BR-A', async () => {
    render(
      <EditAttributionModal isOpen={true} onConfirm={() => {}} onCancel={() => {}} isDark={false} />
    );
    await waitFor(() => {
      const picker = screen.getByTestId('edit-attribution-picker');
      expect(picker).toBeInTheDocument();
      const options = picker.querySelectorAll('option');
      // 1 placeholder + 3 BR-A people (doc-1, doc-2 assistant, staff-1) — doc-3 + staff-2 are BR-B
      expect(options.length).toBeGreaterThanOrEqual(4);
      const texts = Array.from(options).map(o => o.textContent || '');
      expect(texts.some(t => t.includes('หมอมายด์'))).toBe(true);
      expect(texts.some(t => t.includes('พี่อร'))).toBe(true);
      expect(texts.some(t => t.includes('ปุ๊ก'))).toBe(true);
      // BR-B people should NOT appear
      expect(texts.some(t => t.includes('แอน'))).toBe(false);
      expect(texts.some(t => t.includes('หมอบี'))).toBe(false);
    });
  });

  it('E3 — role labels rendered inline ("Name · แพทย์ / · ผู้ช่วย / · พนักงาน")', async () => {
    render(
      <EditAttributionModal isOpen={true} onConfirm={() => {}} onCancel={() => {}} isDark={false} />
    );
    await waitFor(() => {
      const picker = screen.getByTestId('edit-attribution-picker');
      const texts = Array.from(picker.querySelectorAll('option')).map(o => o.textContent || '');
      // หมอมายด์ (position='แพทย์') → "หมอมายด์ · แพทย์"
      expect(texts.some(t => /หมอมายด์.*แพทย์/.test(t))).toBe(true);
      // พี่อร (position='ผู้ช่วยแพทย์') → "พี่อร · ผู้ช่วย"
      expect(texts.some(t => /พี่อร.*ผู้ช่วย/.test(t))).toBe(true);
      // ปุ๊ก (staff) → "ปุ๊ก · พนักงาน"
      expect(texts.some(t => /ปุ๊ก.*พนักงาน/.test(t))).toBe(true);
    });
  });

  it('E4 — "บันทึก" disabled until selection; calls onConfirm with {uid, name, role}', async () => {
    const onConfirm = vi.fn();
    render(
      <EditAttributionModal isOpen={true} onConfirm={onConfirm} onCancel={() => {}} isDark={false} />
    );
    await waitFor(() => screen.getByTestId('edit-attribution-picker'));

    const confirmBtn = screen.getByTestId('edit-attribution-confirm');
    expect(confirmBtn).toBeDisabled();

    const picker = screen.getByTestId('edit-attribution-picker');
    fireEvent.change(picker, { target: { value: 'doc-1' } });

    await waitFor(() => expect(confirmBtn).not.toBeDisabled());

    fireEvent.click(confirmBtn);
    expect(onConfirm).toHaveBeenCalledWith({
      uid: 'doc-1',
      name: 'หมอมายด์',
      role: 'doctor',
    });
  });

  it('E5 — "ยกเลิก" + backdrop click → onCancel', async () => {
    const onCancel = vi.fn();
    const { container } = render(
      <EditAttributionModal isOpen={true} onConfirm={() => {}} onCancel={onCancel} isDark={false} />
    );
    await waitFor(() => screen.getByTestId('edit-attribution-picker'));

    const cancelBtn = screen.getByTestId('edit-attribution-cancel');
    fireEvent.click(cancelBtn);
    expect(onCancel).toHaveBeenCalledTimes(1);

    // Backdrop click
    onCancel.mockClear();
    const backdrop = screen.getByTestId('edit-attribution-modal');
    fireEvent.click(backdrop);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 3: Run E1-E5 → expect FAIL**

```bash
cd F:/LoverClinic-app && npx vitest run tests/edit-attribution-modal-rtl.test.jsx 2>&1 | tail -10
```

Expected: FAIL — module not found (`EditAttributionModal.jsx` doesn't exist yet).

- [ ] **Step 4: Create EditAttributionModal component**

Create `src/components/backend/EditAttributionModal.jsx`:

```jsx
import { useState, useMemo, useEffect } from 'react';
import { X } from 'lucide-react';
import { listStaff, listDoctors } from '../../lib/scopedDataLayer.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';

/**
 * Phase 26.1 (V26.1, 2026-05-13) — Editor Attribution Modal.
 *
 * Triggered by TFP handleSubmit when mode === 'edit' && saveMode === 'staff'
 * (Phase 26.1c integration). User picks one person (staff/doctor/assistant
 * from current branch) → onConfirm fires with `{uid, name, role}` →
 * handleSubmit re-invokes with editorContext.
 *
 * Single-picker merged-list per spec § 5.3 (Q2 locked = "Single picker, merged").
 *
 * Role mapping:
 * - be_doctors with position='แพทย์' → role 'doctor'
 * - be_doctors with position='ผู้ช่วยแพทย์' → role 'assistant'
 * - be_staff (any position) → role 'staff'
 *
 * Branch filter: be_staff + be_doctors are universal collections (per BSA);
 * docs carry branchIds[] (membership). Filter inline against selectedBranchId.
 *
 * Props:
 * - isOpen: boolean — render gate
 * - onConfirm({uid, name, role}): function — called when user clicks "บันทึก"
 *   with valid selection
 * - onCancel(): function — called on backdrop click, X button, or "ยกเลิก"
 * - isDark: boolean — theme flag
 */
export default function EditAttributionModal({ isOpen, onConfirm, onCancel, isDark }) {
  const { branchId: selectedBranchId } = useSelectedBranch();
  const [allStaff, setAllStaff] = useState([]);
  const [allDoctors, setAllDoctors] = useState([]);
  const [pickedId, setPickedId] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setPickedId('');  // reset on close
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([listStaff(), listDoctors()])
      .then(([staff, doctors]) => {
        if (cancelled) return;
        setAllStaff(Array.isArray(staff) ? staff : []);
        setAllDoctors(Array.isArray(doctors) ? doctors : []);
      })
      .catch(() => {
        if (!cancelled) {
          setAllStaff([]);
          setAllDoctors([]);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isOpen]);

  // Branch filter (inline) — be_staff + be_doctors are universal per BSA.
  // Each doc has branchIds[] (membership array) OR legacy branchId field.
  const inBranch = (doc) => {
    if (!selectedBranchId) return true;  // no filter
    if (Array.isArray(doc.branchIds) && doc.branchIds.length > 0) {
      return doc.branchIds.includes(selectedBranchId);
    }
    if (doc.branchId) {
      return String(doc.branchId) === String(selectedBranchId);
    }
    return false;  // doc has neither → filtered out
  };

  // Merge into single list with role labels (spec § 5.3 + Q2)
  const merged = useMemo(() => {
    const items = [];
    allDoctors.filter(inBranch).forEach(d => {
      const isAssistant = d.position === 'ผู้ช่วยแพทย์';
      items.push({
        id: String(d.id),
        name: d.name || '',
        role: isAssistant ? 'assistant' : 'doctor',
        roleLabel: isAssistant ? 'ผู้ช่วย' : 'แพทย์',
      });
    });
    allStaff.filter(inBranch).forEach(s => {
      items.push({
        id: String(s.id),
        name: s.name || '',
        role: 'staff',
        roleLabel: 'พนักงาน',
      });
    });
    return items;
  }, [allStaff, allDoctors, selectedBranchId]);

  if (!isOpen) return null;

  const handleConfirmClick = () => {
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
        className={`max-w-md w-full rounded-xl p-5 shadow-2xl ${isDark ? 'bg-[var(--bg-card)] text-[var(--tx-primary)]' : 'bg-white text-gray-900'}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">เลือกผู้แก้ไขบันทึกการรักษา</h3>
          <button
            onClick={onCancel}
            data-testid="edit-attribution-cancel"
            className="p-1 hover:opacity-70"
            aria-label="ปิด"
          >
            <X size={18} />
          </button>
        </div>

        <p className={`text-xs mb-3 ${isDark ? 'text-[var(--tx-muted)]' : 'text-gray-500'}`}>
          เลือกชื่อ พนักงาน / ผู้ช่วย / แพทย์ ที่เป็นผู้แก้ไขบันทึกการรักษานี้
          (กรองตามสาขาที่เลือก)
        </p>

        <select
          data-testid="edit-attribution-picker"
          value={pickedId}
          onChange={(e) => setPickedId(e.target.value)}
          disabled={loading}
          className={`w-full px-3 py-2 rounded border text-sm ${isDark ? 'bg-[var(--bg-elevated)] border-[var(--bd)]' : 'bg-gray-50 border-gray-300'}`}
        >
          <option value="">— เลือกผู้แก้ไข —</option>
          {merged.map(m => (
            <option key={m.id} value={m.id}>
              {m.name} · {m.roleLabel}
            </option>
          ))}
        </select>

        {loading && (
          <p className="text-xs mt-2 opacity-60">กำลังโหลดรายชื่อ...</p>
        )}

        <div className="flex gap-2 mt-5 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className={`px-4 py-2 rounded border text-sm ${isDark ? 'border-[var(--bd)]' : 'border-gray-300'}`}
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleConfirmClick}
            disabled={!pickedId}
            data-testid="edit-attribution-confirm"
            className="px-4 py-2 rounded bg-purple-600 text-white text-sm font-bold disabled:opacity-50 hover:bg-purple-500 transition-colors"
          >
            บันทึก
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Run E1-E5 → expect PASS**

```bash
cd F:/LoverClinic-app && npx vitest run tests/edit-attribution-modal-rtl.test.jsx 2>&1 | tail -10
```

Expected: 5 PASS, 0 FAIL.

If E2/E3 fail due to async loading: add `await screen.findByText(...)` instead of `getByText` to wait for the useEffect resolution.

- [ ] **Step 6: Build**

```bash
cd F:/LoverClinic-app && npm run build 2>&1 | tail -8
```

Expected: clean.

- [ ] **Step 7: Commit + push**

```bash
cd F:/LoverClinic-app
git add src/components/backend/EditAttributionModal.jsx tests/edit-attribution-modal-rtl.test.jsx
git commit -m "$(cat <<'EOF'
feat(Phase 26.1b): EditAttributionModal component + RTL E1-E5

NEW src/components/backend/EditAttributionModal.jsx (~155 LOC):
- Single picker, merged-list (staff + doctors + assistants per branch)
- Loads via scopedDataLayer (listStaff + listDoctors); filters inline by
  selectedBranchId against doc.branchIds[] (BSA universal collection pattern)
- Role mapping: be_doctors.position='แพทย์' → 'doctor', 'ผู้ช่วยแพทย์' →
  'assistant', be_staff → 'staff'. Inline role label in option text.
- onConfirm({uid, name, role}) on "บันทึก" with valid pick
- onCancel on X / backdrop / "ยกเลิก"
- isDark theme prop
- Reset pickedId on isOpen=false transition

Tests: edit-attribution-modal-rtl.test.jsx E1-E5 (5/5 PASS):
- E1 render gate (isOpen)
- E2 branch filter (BR-A vs BR-B fixtures)
- E3 role label rendering
- E4 confirm button gating + onConfirm payload shape
- E5 onCancel (X button + backdrop)

Standalone component; TFP integration follows in Tasks 3-7.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin master 2>&1 | tail -3
```

---

## Task 3: Phase 26.1c — TFP handleSubmit signature extension (TDD via G3.4)

**Files:**
- Modify: `src/components/TreatmentFormPage.jsx` handleSubmit signature (~line 1890)
- Modify: `tests/phase-26-0-doctor-save-source-grep.test.js` (append G3 describe)

- [ ] **Step 1: Write G3.4 source-grep test (FAIL expected)**

Append to `tests/phase-26-0-doctor-save-source-grep.test.js` BEFORE the closing `});` of the outer `describe`:

```js
  describe('G3 — Phase 26.1 editor-attribution modal integration source-grep', () => {
    it('G3.4 — handleSubmit signature accepts (eventOrSaveMode, options) form', () => {
      // V26.1 — extends Phase 26.0a defensive coercion to support internal
      // re-invoke from EditAttributionModal confirmation with editor context.
      // Original Phase 26.0 form: handleSubmit = async (eventOrSaveMode) => {}
      // V26.1 form:               handleSubmit = async (eventOrSaveMode, options = {}) => {}
      expect(TFP_SOURCE).toMatch(/const\s+handleSubmit\s*=\s*async\s*\(\s*eventOrSaveMode\s*,\s*options\s*=\s*\{\s*\}\s*\)/);
    });

    it('G3.5 — editorContext extracted from options OR from internal re-invoke object form', () => {
      // Accepts either:
      //   options.editorContext  OR
      //   eventOrSaveMode being a plain object with .saveMode + .editorContext
      // Source must reference editorContext at handleSubmit body
      expect(TFP_SOURCE).toMatch(/editorContext/);
    });
  });
```

- [ ] **Step 2: Run G3.4-G3.5 → expect FAIL**

```bash
cd F:/LoverClinic-app && npx vitest run tests/phase-26-0-doctor-save-source-grep.test.js -t "G3" 2>&1 | tail -8
```

Expected: 2 FAIL (signature not yet extended).

- [ ] **Step 3: Extend handleSubmit signature**

In `src/components/TreatmentFormPage.jsx` at line ~1890, find:

```js
  const handleSubmit = async (eventOrSaveMode) => {
    // Phase 26.0a (V26.0, 2026-05-13) — Doctor-Save scaffold. Defensive
    // coercion: any value OTHER than the literal string 'doctor' resolves
    // to 'staff' default. Backward-compat: existing callers pass either
    // nothing or a form submit Event (handlers in onClick/onSubmit), both
    // of which → 'staff'. Future Task 2 will add explicit gates around
    // course-deduct / sale-create / consumables-deduct using this var.
    // Future Task 3 will wire a "บันทึกสำหรับแพทย์" button that calls
    // handleSubmit('doctor').
    const saveMode = (eventOrSaveMode === 'doctor') ? 'doctor' : 'staff';
    // If invoked as a form submit handler, suppress default behavior so the
    // page doesn't navigate. No-op when called programmatically with a
    // saveMode string (or no argument).
    if (eventOrSaveMode && typeof eventOrSaveMode.preventDefault === 'function') {
      eventOrSaveMode.preventDefault();
    }
```

Replace with V26.1 extended signature:

```js
  const handleSubmit = async (eventOrSaveMode, options = {}) => {
    // Phase 26.0a (V26.0, 2026-05-13) — Doctor-Save scaffold. Defensive
    // coercion: any value OTHER than the literal string 'doctor' resolves
    // to 'staff' default. Backward-compat: existing callers pass either
    // nothing or a form submit Event (handlers in onClick/onSubmit), both
    // of which → 'staff'. Phase 26.0b added explicit gates around
    // course-deduct / sale-create / consumables-deduct using this var.
    //
    // Phase 26.1 (V26.1, 2026-05-13) — Editor-attribution modal extension.
    // handleSubmit may be re-invoked internally after EditAttributionModal
    // confirms with `{saveMode, editorContext}` object form. Defensive
    // coercion preserved: string 'doctor' / Event / undefined / null still
    // resolve to original behavior. The NEW object form is recognized only
    // when eventOrSaveMode is a plain object WITHOUT preventDefault (i.e.,
    // not a React SyntheticEvent).
    let saveMode = 'staff';
    let editorContext = options.editorContext || null;

    if (typeof eventOrSaveMode === 'string') {
      // Phase 26.0 form: handleSubmit('doctor') OR handleSubmit('staff')
      saveMode = (eventOrSaveMode === 'doctor') ? 'doctor' : 'staff';
    } else if (
      eventOrSaveMode &&
      typeof eventOrSaveMode === 'object' &&
      typeof eventOrSaveMode.preventDefault !== 'function'
    ) {
      // Phase 26.1 internal re-invoke: handleSubmit({saveMode, editorContext})
      saveMode = (eventOrSaveMode.saveMode === 'doctor') ? 'doctor' : 'staff';
      if (eventOrSaveMode.editorContext) {
        editorContext = eventOrSaveMode.editorContext;
      }
    } else if (eventOrSaveMode && typeof eventOrSaveMode.preventDefault === 'function') {
      // Phase 26.0 form: handleSubmit(SyntheticEvent) from form submit
      eventOrSaveMode.preventDefault();
      // saveMode stays 'staff' default
    }
    // else: handleSubmit() with no arg → saveMode = 'staff', editorContext = null
```

- [ ] **Step 4: Run G3.4-G3.5 → expect PASS**

```bash
cd F:/LoverClinic-app && npx vitest run tests/phase-26-0-doctor-save-source-grep.test.js -t "G3" 2>&1 | tail -8
```

Expected: 2 PASS.

- [ ] **Step 5: Run full Phase 26.0 test bank to verify no regression**

```bash
cd F:/LoverClinic-app && npx vitest run tests/phase-26-0-doctor-save-source-grep.test.js tests/phase-26-0-status-display-rtl.test.jsx tests/phase-26-0-doctor-save-flow-simulate.test.js tests/treatment-stock-diff.test.js 2>&1 | tail -10
```

Expected: 80+ PASS, 0 FAIL (Phase 26.0 baseline 62 + G3 2 = 64; treatment-stock-diff 36 = 100 minimum).

If TF3.A.6 regex test now fails: that's a Phase 26.0a regex with 800-char window. Phase 26.1 signature is slightly longer (added ~10 lines of comment + the new branches). Verify by reading the regex window — if it now exceeds 2500 chars (the Task 8 fixup limit), bump to 4000 chars.

- [ ] **Step 6: Build**

```bash
cd F:/LoverClinic-app && npm run build 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 7: Commit + push**

```bash
cd F:/LoverClinic-app
git add src/components/TreatmentFormPage.jsx tests/phase-26-0-doctor-save-source-grep.test.js
git commit -m "$(cat <<'EOF'
feat(Phase 26.1c): TFP handleSubmit signature extension for editor-attribution

V26.1 extends Phase 26.0a defensive coercion signature from
`handleSubmit(eventOrSaveMode)` to `handleSubmit(eventOrSaveMode, options = {})`.

New parameter `options = {editorContext}` allows internal re-invoke from
EditAttributionModal confirmation (Task 5 wires this). Also recognizes a
new object form for eventOrSaveMode: `{saveMode, editorContext}` — used
when the modal confirm handler synthesizes the call.

Defensive coercion preserved:
- string 'doctor' → 'doctor' mode (Phase 26.0)
- string 'staff' → 'staff' mode (Phase 26.0)
- Event with preventDefault → 'staff' mode + preventDefault called (Phase 26.0)
- undefined/null → 'staff' mode (Phase 26.0)
- NEW: plain object with .saveMode + .editorContext (no preventDefault) →
  extract saveMode + editorContext (Phase 26.1)

Tests: G3.4 + G3.5 source-grep regression locks (2/2 PASS).
Phase 26.0 + G1/G2/D1-D4/F1-F8 baseline preserved.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin master 2>&1 | tail -3
```

---

## Task 4: Phase 26.1c — v26StatusPatch extension + backendClient top-level extraction

**Files:**
- Modify: `src/components/TreatmentFormPage.jsx` v26StatusPatch block (~line 2221)
- Modify: `src/lib/backendClient.js` createBackendTreatment + updateBackendTreatment + rebuildTreatmentSummary (~3 spots)
- Modify: `tests/phase-26-0-doctor-save-source-grep.test.js` (append G3.6)
- Modify: `tests/phase-26-0-status-display-rtl.test.jsx` (append D5.4)

- [ ] **Step 1: Write G3.6 + D5.4 tests (FAIL expected)**

Append to `tests/phase-26-0-doctor-save-source-grep.test.js` inside G3 block:

```js
    it('G3.6 — v26StatusPatch includes editedBy + editedByName + editedByRole + editedAt conditional spread (saveMode=staff)', () => {
      // V26.1 extends v26StatusPatch staff branch with editorContext spread
      expect(TFP_SOURCE).toMatch(/editorContext\s*\?\s*\{[\s\S]{0,500}editedBy:\s*editorContext\.uid/);
      expect(TFP_SOURCE).toMatch(/editedByName:\s*editorContext\.name/);
      expect(TFP_SOURCE).toMatch(/editedByRole:\s*editorContext\.role/);
      expect(TFP_SOURCE).toMatch(/editedAt:\s*serverTimestamp/);
    });
```

Append to `tests/phase-26-0-status-display-rtl.test.jsx` inside D4 block (or new D5 describe — verify file layout first):

```jsx
  describe('D5 — Phase 26.1 editor-attribution display + summary preservation', () => {
    it('D5.4 — rebuildTreatmentSummary preserves editedBy/Name/Role fields', () => {
      const BC_PATH = join(process.cwd(), 'src/lib/backendClient.js');
      const BC_SOURCE = readFileSync(BC_PATH, 'utf-8');
      const fnIdx = BC_SOURCE.indexOf('function rebuildTreatmentSummary');
      expect(fnIdx).toBeGreaterThan(-1);
      const region = BC_SOURCE.slice(fnIdx, fnIdx + 2000);
      expect(region).toMatch(/editedBy:\s*t\.editedBy\s*\|\|\s*null/);
      expect(region).toMatch(/editedByName:\s*t\.editedByName\s*\|\|\s*['"]['"]/);
      expect(region).toMatch(/editedByRole:\s*t\.editedByRole\s*\|\|\s*['"]['"]/);
    });
  });
```

- [ ] **Step 2: Run G3.6 + D5.4 → expect FAIL**

```bash
cd F:/LoverClinic-app && npx vitest run tests/phase-26-0-doctor-save-source-grep.test.js tests/phase-26-0-status-display-rtl.test.jsx -t "G3.6|D5" 2>&1 | tail -10
```

Expected: 2 FAIL.

- [ ] **Step 3: Extend v26StatusPatch in TFP**

In `src/components/TreatmentFormPage.jsx` around line 2221, locate the `v26StatusPatch` block. Replace the staff branch (the `else` of the `saveMode === 'doctor'` ternary):

```js
        const v26StatusPatch = saveMode === 'doctor' ? {
          status: 'doctor-recorded',
          ...(isEdit && loadedTreatmentStatus === 'doctor-recorded' ? {} : {
            recordedBy: auth.currentUser?.uid || null,
            recordedAt: serverTimestamp(),
          }),
        } : {
          // Phase 26.0b — admin/staff save clears status (preserves recordedBy/At)
          status: deleteField(),
          // Phase 26.1 (V26.1, 2026-05-13) — editor attribution from EditAttributionModal.
          // When `editorContext` is present (modal-confirmed edit-save), stamp 4 fields
          // for CDV "· แก้ไขโดย: X (role)" display. When absent (create-mode staff save,
          // or legacy callsite), no fields written — backward compat.
          ...(editorContext ? {
            editedBy: editorContext.uid,
            editedByName: editorContext.name,
            editedByRole: editorContext.role,
            editedAt: serverTimestamp(),
          } : {}),
        };
```

- [ ] **Step 4: Extend backendClient.js top-level extraction**

In `src/lib/backendClient.js`, find `createBackendTreatment` (around line 990). The current Phase 26.0b extraction extracts `status, recordedBy, recordedAt`. Extend to also extract editor fields.

Show current shape via grep first:

```bash
cd F:/LoverClinic-app && grep -nB 2 -A 25 "function createBackendTreatment" src/lib/backendClient.js | head -40
```

Then edit. The pattern is `if (X !== undefined) topLevelPatch.X = X;` per Phase 26.0b. Add 4 lines:

```js
// Existing Phase 26.0b extraction (KEEP):
if (status !== undefined) topLevelPatch.status = status;
if (recordedBy !== undefined) topLevelPatch.recordedBy = recordedBy;
if (recordedAt !== undefined) topLevelPatch.recordedAt = recordedAt;
// V26.1 Phase 26.1 (2026-05-13) — editor attribution top-level fields
if (editedBy !== undefined) topLevelPatch.editedBy = editedBy;
if (editedByName !== undefined) topLevelPatch.editedByName = editedByName;
if (editedByRole !== undefined) topLevelPatch.editedByRole = editedByRole;
if (editedAt !== undefined) topLevelPatch.editedAt = editedAt;
```

And update the destructure at the top of `createBackendTreatment`:

```js
const {
  status, recordedBy, recordedAt,
  editedBy, editedByName, editedByRole, editedAt,  // V26.1
  ...rest
} = detail || {};
```

Apply the SAME pattern in `updateBackendTreatment`.

- [ ] **Step 5: Extend rebuildTreatmentSummary**

In `src/lib/backendClient.js` around line 1082-1094, extend the summary mapper:

```js
  const summary = treatments.map(t => ({
    id: t.treatmentId || t.id,
    date: t.detail?.treatmentDate || '',
    doctor: t.detail?.doctorName || '',
    assistants: (t.detail?.assistants || t.detail?.assistantIds || []).map(a => typeof a === 'string' ? a : a.name || ''),
    branch: t.detail?.branch || '',
    cc: t.detail?.symptoms || '',
    dx: t.detail?.diagnosis || '',
    createdBy: t.createdBy || 'cloned',
    // V26.0 Phase 26.0e (2026-05-13) — preserve `status` for chip rendering
    status: t.status || null,
    // V26.1 Phase 26.1c (2026-05-13) — preserve editor attribution for
    // CDV row meta display "· แก้ไขโดย: X (role)". Top-level fields written
    // by createBackendTreatment + updateBackendTreatment via top-level extraction.
    editedBy: t.editedBy || null,
    editedByName: t.editedByName || '',
    editedByRole: t.editedByRole || '',
  }));
```

- [ ] **Step 6: Run G3.6 + D5.4 → expect PASS**

```bash
cd F:/LoverClinic-app && npx vitest run tests/phase-26-0-doctor-save-source-grep.test.js tests/phase-26-0-status-display-rtl.test.jsx -t "G3.6|D5" 2>&1 | tail -10
```

Expected: 2 PASS.

- [ ] **Step 7: Build**

```bash
cd F:/LoverClinic-app && npm run build 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 8: Commit + push**

```bash
cd F:/LoverClinic-app
git add src/components/TreatmentFormPage.jsx src/lib/backendClient.js tests/phase-26-0-doctor-save-source-grep.test.js tests/phase-26-0-status-display-rtl.test.jsx
git commit -m "$(cat <<'EOF'
feat(Phase 26.1c): v26StatusPatch + backendClient extend for editor attribution

TFP v26StatusPatch staff branch extended: when editorContext present (set by
Task 5 modal-confirm), stamps editedBy + editedByName + editedByRole + editedAt
at top level of treatment doc.

backendClient.js extended:
- createBackendTreatment + updateBackendTreatment destructure 4 new fields
  + write to top-level via defensive `if (X !== undefined)` pattern
  (Phase 26.0b additive convention; legacy callers unaffected)
- rebuildTreatmentSummary preserves editedBy/Name/Role in summary array
  (Phase 26.0e companion — chip + display both need top-level fields in summary)

Tests: G3.6 (TFP v26StatusPatch source-grep) + D5.4 (summary mapper editor
fields source-grep) — 2/2 PASS.

Modal integration (Task 5) + CDV display (Task 6) follow.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin master 2>&1 | tail -3
```

---

## Task 5: Phase 26.1c — Modal state + mount + wire to handleSubmit (TDD via G3.1-G3.3)

**Files:**
- Modify: `src/components/TreatmentFormPage.jsx` (state + mount + handlers)
- Modify: `tests/phase-26-0-doctor-save-source-grep.test.js` (append G3.1-G3.3)

- [ ] **Step 1: Write G3.1-G3.3 source-grep tests (FAIL expected)**

Append to `tests/phase-26-0-doctor-save-source-grep.test.js` G3 block:

```js
    it('G3.1 — editAttributionModal state declared with isOpen + pendingSave shape', () => {
      expect(TFP_SOURCE).toMatch(/const\s+\[editAttributionModal,\s*setEditAttributionModal\]\s*=\s*useState/);
      expect(TFP_SOURCE).toMatch(/isOpen:\s*false/);  // initial state
    });

    it('G3.2 — needsEditorAttribution guard exists in handleSubmit', () => {
      expect(TFP_SOURCE).toMatch(/(needsEditorAttribution|isEdit\s*&&\s*saveMode\s*===\s*['"]staff['"])/);
      // Guard must check: edit mode AND staff saveMode AND no editorContext yet
      expect(TFP_SOURCE).toMatch(/!editorContext/);
    });

    it('G3.3 — EditAttributionModal mounted when isOpen', () => {
      expect(TFP_SOURCE).toMatch(/<EditAttributionModal/);
      expect(TFP_SOURCE).toMatch(/import\s+EditAttributionModal\s+from\s+['"][^'"]*EditAttributionModal['"]/);
    });
```

- [ ] **Step 2: Run G3.1-G3.3 → expect FAIL**

```bash
cd F:/LoverClinic-app && npx vitest run tests/phase-26-0-doctor-save-source-grep.test.js -t "G3" 2>&1 | tail -8
```

Expected: 3 FAIL.

- [ ] **Step 3: Add EditAttributionModal import to TFP**

In `src/components/TreatmentFormPage.jsx` near other component imports (around line ~25):

```bash
cd F:/LoverClinic-app && grep -nE "^import.*from\s+['\"]\.\/backend\/" src/components/TreatmentFormPage.jsx | head -5
```

Add the import:

```js
import EditAttributionModal from './backend/EditAttributionModal.jsx';
```

- [ ] **Step 4: Add state + handlers**

In TFP component body near other modal states (search for `useState` blocks around lines 370-440):

```js
// Phase 26.1c (V26.1, 2026-05-13) — Editor attribution modal state.
// Triggered when admin clicks save in edit mode + staff saveMode (not
// doctor-save, not create-mode). Modal opens, suspends handleSubmit, and
// re-invokes handleSubmit with editorContext on user confirm.
const [editAttributionModal, setEditAttributionModal] = useState({ isOpen: false });

const handleEditAttributionConfirm = (editorCtx) => {
  setEditAttributionModal({ isOpen: false });
  // Re-invoke handleSubmit synchronously with the editor context via the
  // V26.1 internal object form. This re-enters handleSubmit fresh — the
  // `needsEditorAttribution` guard now passes (editorContext present) and
  // the save flow proceeds normally with the editor stamping in v26StatusPatch.
  handleSubmit({ saveMode: 'staff', editorContext: editorCtx });
};

const handleEditAttributionCancel = () => {
  setEditAttributionModal({ isOpen: false });
  // No save. Admin can re-click the save button to retry; form state preserved.
};
```

- [ ] **Step 5: Add needsEditorAttribution guard in handleSubmit**

In `src/components/TreatmentFormPage.jsx` handleSubmit body, after the pre-validation block (after the `setFieldErrors({})` line and the required-field checks at ~line 1910) but BEFORE the main payload build (~line 1960):

```js
// Phase 26.1c (V26.1, 2026-05-13) — Editor attribution gate. When admin
// clicks save in edit-mode + staff saveMode, suspend the rest of handleSubmit
// and open the modal. User picks → onConfirm fires → handleSubmit re-invokes
// with editorContext → this guard passes (editorContext truthy) → save proceeds.
const needsEditorAttribution = isEdit && saveMode === 'staff';
if (needsEditorAttribution && !editorContext) {
  setEditAttributionModal({ isOpen: true });
  return;  // Suspend; modal-confirm handler re-enters with editorContext
}
```

⚠️ Placement is critical: AFTER pre-validation (so validation errors surface BEFORE modal opens — better UX) but BEFORE the heavy payload build + save call (so the modal isn't a no-op).

- [ ] **Step 6: Mount the modal in TFP render**

Near the end of TFP render (after main form JSX, before any closing wrapper), add:

```jsx
{/* Phase 26.1c (V26.1, 2026-05-13) — Editor attribution modal */}
<EditAttributionModal
  isOpen={editAttributionModal.isOpen}
  onConfirm={handleEditAttributionConfirm}
  onCancel={handleEditAttributionCancel}
  isDark={isDark}
/>
```

Verify placement: outside any conditional wrappers; not nested inside form sections. The modal is fixed-position so it overlays regardless.

- [ ] **Step 7: Run G3.1-G3.3 → expect PASS**

```bash
cd F:/LoverClinic-app && npx vitest run tests/phase-26-0-doctor-save-source-grep.test.js -t "G3" 2>&1 | tail -8
```

Expected: 5/5 G3 PASS (G3.1-G3.6).

- [ ] **Step 8: Run full Phase 26.0 test bank**

```bash
cd F:/LoverClinic-app && npx vitest run tests/phase-26-0-doctor-save-source-grep.test.js tests/phase-26-0-status-display-rtl.test.jsx tests/phase-26-0-doctor-save-flow-simulate.test.js tests/edit-attribution-modal-rtl.test.jsx 2>&1 | tail -8
```

Expected: 80+ PASS, 0 FAIL.

- [ ] **Step 9: Build**

```bash
cd F:/LoverClinic-app && npm run build 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 10: Commit + push**

```bash
cd F:/LoverClinic-app
git add src/components/TreatmentFormPage.jsx tests/phase-26-0-doctor-save-source-grep.test.js
git commit -m "$(cat <<'EOF'
feat(Phase 26.1c): TFP modal state + mount + wire EditAttributionModal

Wire EditAttributionModal (Phase 26.1b) into TreatmentFormPage edit-save
flow:
- Import EditAttributionModal
- State: editAttributionModal = { isOpen: false }
- needsEditorAttribution guard at handleSubmit (after pre-validation,
  before payload build): isEdit && saveMode === 'staff' && !editorContext
  → opens modal + early-return
- Modal mount near end of TFP render: isOpen + onConfirm + onCancel + isDark
- handleEditAttributionConfirm: re-invokes handleSubmit({saveMode:'staff',
  editorContext}) via the V26.1 internal object form
- handleEditAttributionCancel: closes modal, preserves form state, no save

Tests: G3.1 + G3.2 + G3.3 (state + guard + mount source-grep) — 3/3 PASS.
G3.4 + G3.5 + G3.6 baseline preserved. Edit-attribution-modal RTL E1-E5
unchanged. Full Phase 26.0 baseline preserved.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin master 2>&1 | tail -3
```

---

## Task 6: Phase 26.1c — CDV row meta inline display + ROLE_LABEL_TH

**Files:**
- Modify: `src/components/backend/CustomerDetailView.jsx` (ROLE_LABEL_TH constant + row meta display)
- Modify: `tests/phase-26-0-status-display-rtl.test.jsx` (append D5.1-D5.3)

- [ ] **Step 1: Write D5.1-D5.3 RTL tests (FAIL expected)**

Append to `tests/phase-26-0-status-display-rtl.test.jsx` D5 block:

```jsx
    it('D5.1 — CDV summary mapper includes status + editedBy + editedByName + editedByRole (Task 1 fix)', () => {
      const CDV_PATH = join(process.cwd(), 'src/components/backend/CustomerDetailView.jsx');
      const CDV_SOURCE = readFileSync(CDV_PATH, 'utf-8');
      const fnIdx = CDV_SOURCE.indexOf('const treatmentSummary = useMemo');
      expect(fnIdx).toBeGreaterThan(-1);
      const region = CDV_SOURCE.slice(fnIdx, fnIdx + 2000);
      expect(region).toMatch(/status:\s*t\.status\s*\|\|\s*null/);
      expect(region).toMatch(/editedBy:\s*t\.editedBy\s*\|\|\s*null/);
      expect(region).toMatch(/editedByName:\s*t\.editedByName\s*\|\|\s*['"]['"]/);
      expect(region).toMatch(/editedByRole:\s*t\.editedByRole\s*\|\|\s*['"]['"]/);
    });

    it('D5.2 — CDV row meta renders "· แก้ไขโดย: <name>" when editedByName present', () => {
      const CDV_PATH = join(process.cwd(), 'src/components/backend/CustomerDetailView.jsx');
      const CDV_SOURCE = readFileSync(CDV_PATH, 'utf-8');
      expect(CDV_SOURCE).toMatch(/data-testid={`treatment-edited-by-/);
      expect(CDV_SOURCE).toMatch(/แก้ไขโดย/);
      expect(CDV_SOURCE).toMatch(/t\.editedByName\s*&&/);
    });

    it('D5.3 — ROLE_LABEL_TH constant defined with doctor/assistant/staff keys', () => {
      const CDV_PATH = join(process.cwd(), 'src/components/backend/CustomerDetailView.jsx');
      const CDV_SOURCE = readFileSync(CDV_PATH, 'utf-8');
      expect(CDV_SOURCE).toMatch(/ROLE_LABEL_TH\s*=\s*\{/);
      expect(CDV_SOURCE).toMatch(/doctor:\s*['"]แพทย์['"]/);
      expect(CDV_SOURCE).toMatch(/assistant:\s*['"]ผู้ช่วย['"]/);
      expect(CDV_SOURCE).toMatch(/staff:\s*['"]พนักงาน['"]/);
    });
```

- [ ] **Step 2: Run D5.1-D5.3 → expect FAIL**

```bash
cd F:/LoverClinic-app && npx vitest run tests/phase-26-0-status-display-rtl.test.jsx -t "D5" 2>&1 | tail -8
```

Expected: D5.1 PASS (Task 1 fix landed); D5.2 + D5.3 FAIL.

- [ ] **Step 3: Add ROLE_LABEL_TH constant**

In `src/components/backend/CustomerDetailView.jsx` near the top of the file (after imports but before the component function — around line 15-25):

```js
// Phase 26.1c (V26.1, 2026-05-13) — Editor-attribution role labels (Thai).
// Maps editedByRole values from EditAttributionModal back to display text.
// Used in row meta "· แก้ไขโดย: <name> (<role>)".
const ROLE_LABEL_TH = {
  doctor: 'แพทย์',
  assistant: 'ผู้ช่วย',
  staff: 'พนักงาน',
};
```

- [ ] **Step 4: Add inline meta display in row JSX**

In `src/components/backend/CustomerDetailView.jsx` around line 1005-1009, find the existing row meta block:

```jsx
<div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5 text-xs text-[var(--tx-muted)]">
  {t.branch && <span>{t.branch}</span>}
  {t.doctor && <span className="font-semibold text-[var(--tx-secondary)]">· {t.doctor}</span>}
  {t.assistants?.length > 0 && <span>· {t.assistants.join(', ')}</span>}
</div>
```

Add a 4th line for editor attribution:

```jsx
<div className="flex flex-wrap gap-x-2 gap-y-0.5 mt-0.5 text-xs text-[var(--tx-muted)]">
  {t.branch && <span>{t.branch}</span>}
  {t.doctor && <span className="font-semibold text-[var(--tx-secondary)]">· {t.doctor}</span>}
  {t.assistants?.length > 0 && <span>· {t.assistants.join(', ')}</span>}
  {/* V26.1 Phase 26.1c (2026-05-13) — last-editor attribution. Shown only when
      editedByName present (legacy treatments stay null → skip cleanly). Italic
      + slightly muted to differentiate from the primary doctor/assistant meta. */}
  {t.editedByName && (
    <span
      data-testid={`treatment-edited-by-${t.id}`}
      className="italic opacity-80"
    >
      · แก้ไขโดย: {t.editedByName}
      {t.editedByRole && ROLE_LABEL_TH[t.editedByRole] && ` (${ROLE_LABEL_TH[t.editedByRole]})`}
    </span>
  )}
</div>
```

- [ ] **Step 5: Run D5 → expect PASS**

```bash
cd F:/LoverClinic-app && npx vitest run tests/phase-26-0-status-display-rtl.test.jsx -t "D5" 2>&1 | tail -8
```

Expected: 4/4 D5 PASS (D5.1-D5.4).

- [ ] **Step 6: Build**

```bash
cd F:/LoverClinic-app && npm run build 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 7: Commit + push**

```bash
cd F:/LoverClinic-app
git add src/components/backend/CustomerDetailView.jsx tests/phase-26-0-status-display-rtl.test.jsx
git commit -m "$(cat <<'EOF'
feat(Phase 26.1c): CDV row meta inline editor-attribution display

Wire the editor-attribution display per spec § 5.8:
- NEW ROLE_LABEL_TH constant at top of CDV (doctor/assistant/staff → Thai)
- Row meta line gains 4th conditional span: "· แก้ไขโดย: {name} ({role})"
  when t.editedByName present. Italic + opacity-80 to differentiate from
  the primary doctor/assistant/branch meta chips.
- data-testid="treatment-edited-by-{id}" for RTL targeting
- Legacy treatments (editedByName empty/null) gracefully skip

Tests: D5.1 + D5.2 + D5.3 (source-grep regression locks) — 3/3 PASS.
D5.4 already passing post Task 4 (rebuildTreatmentSummary). Full D5
block GREEN. Phase 26.0 baseline preserved.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin master 2>&1 | tail -3
```

---

## Task 7: Phase 26.1c — F9 flow-simulate edit-save-with-modal

**Files:**
- Modify: `tests/phase-26-0-doctor-save-flow-simulate.test.js` (append F9 describe)

- [ ] **Step 1: Append F9 simulator + tests**

Append to `tests/phase-26-0-doctor-save-flow-simulate.test.js` BEFORE the closing `});` of the outer describe:

```js
  // ─── Phase 26.1 — Editor-attribution modal simulator ─────────────────
  /**
   * Simulates the V26.1 edit-save-with-modal flow:
   * 1. Staff clicks save in edit mode → handleSubmit fires with no editorContext
   * 2. needsEditorAttribution guard returns early → modal opens
   * 3. User picks → modal-confirm re-invokes handleSubmit with editorContext
   * 4. v26StatusPatch stamps editedBy/At/Name/Role + status:deleteField
   */
  function simulateEditSaveWithModal({ saveMode, mode, isEdit, formData, existingTreatment = null, editorContext = null }) {
    const needsEditorAttribution = isEdit && saveMode === 'staff';
    if (needsEditorAttribution && !editorContext) {
      return { stage: 'modal-opened', writes: [], skipped: ['everything-pending-modal-confirm'] };
    }
    // Re-invoke from modal confirm OR no-modal needed → fall through to existing simulator
    return simulateHandleSubmit({ saveMode, mode, isEdit, formData, existingTreatment, hasSale: false, editorContext });
  }

  // Extend simulateHandleSubmit to accept editorContext + write editor fields
  // (the test file's simulator may not yet include this — append the V26.1 extension)
  // NOTE: this is illustrative; the actual handleSubmit simulator in the test file
  // should already accept editorContext via the `options` arg shape.
  // If the simulator does not — add the editorContext spread in the staff branch
  // of the statusPatch construction inside simulateHandleSubmit (this test file
  // line ~50-60).

  describe('F9 — Phase 26.1 edit-save with editor-attribution modal', () => {
    it('F9.1 — staff edit save WITHOUT editorContext: modal opens, no writes', () => {
      const result = simulateEditSaveWithModal({
        saveMode: 'staff', mode: 'edit', isEdit: true,
        existingTreatment: { id: 'TR-1', status: 'doctor-recorded' },
        formData: { treatmentItems: [], consumables: [], medications: [], purchasedItems: [] },
        editorContext: null,
      });
      expect(result.stage).toBe('modal-opened');
      expect(result.writes).toHaveLength(0);
      expect(result.skipped).toContain('everything-pending-modal-confirm');
    });

    it('F9.2 — staff edit save WITH editorContext: writes editedBy/Name/Role to patch', () => {
      const result = simulateEditSaveWithModal({
        saveMode: 'staff', mode: 'edit', isEdit: true,
        existingTreatment: { id: 'TR-1', status: 'doctor-recorded' },
        formData: { treatmentItems: [], consumables: [], medications: [], purchasedItems: [] },
        editorContext: { uid: 'staff-1', name: 'ปุ๊ก', role: 'staff' },
      });
      // Falls through to simulateHandleSubmit; treatment-doc write exists
      const tw = result.writes.find(w => w.kind === 'treatment-doc');
      expect(tw).toBeDefined();
      // editor fields present in patch (simulator must propagate editorContext)
      expect(tw.patch.editedBy).toBe('staff-1');
      expect(tw.patch.editedByName).toBe('ปุ๊ก');
      expect(tw.patch.editedByRole).toBe('staff');
      expect(tw.patch.editedAt).toBeDefined();
    });

    it('F9.3 — doctor-save bypasses modal (saveMode=doctor skips needsEditorAttribution)', () => {
      const result = simulateEditSaveWithModal({
        saveMode: 'doctor', mode: 'edit', isEdit: true,
        existingTreatment: { id: 'TR-1', status: 'doctor-recorded' },
        formData: { treatmentItems: [], consumables: [], medications: [], purchasedItems: [] },
        editorContext: null,
      });
      // No modal stage — doctor-save proceeds directly
      expect(result.stage).not.toBe('modal-opened');
      const tw = result.writes.find(w => w.kind === 'treatment-doc');
      expect(tw.patch.status).toBe('doctor-recorded');  // doctor stamp preserved
    });

    it('F9.4 — create mode bypasses modal (mode=create skips needsEditorAttribution)', () => {
      const result = simulateEditSaveWithModal({
        saveMode: 'staff', mode: 'create', isEdit: false,
        formData: { treatmentItems: [], consumables: [], medications: [], purchasedItems: [] },
        editorContext: null,
      });
      expect(result.stage).not.toBe('modal-opened');
      const tw = result.writes.find(w => w.kind === 'treatment-doc');
      expect(tw.patch.editedBy).toBeUndefined();  // no editor stamp on create
    });

    it('F9.5 — Phase 26.0 v26StatusPatch contract preserved (status cleared on staff save)', () => {
      const result = simulateEditSaveWithModal({
        saveMode: 'staff', mode: 'edit', isEdit: true,
        existingTreatment: { id: 'TR-1', status: 'doctor-recorded' },
        formData: { treatmentItems: [], consumables: [], medications: [], purchasedItems: [] },
        editorContext: { uid: 'doc-1', name: 'หมอมายด์', role: 'doctor' },
      });
      const tw = result.writes.find(w => w.kind === 'treatment-doc');
      expect(tw.patch.status).toBe('<deleteField>');  // Phase 26.0 contract preserved
      expect(tw.patch.editedByName).toBe('หมอมายด์');  // V26.1 stamp present
    });
  });
```

**Pre-flight check**: open `tests/phase-26-0-doctor-save-flow-simulate.test.js` and look at `simulateHandleSubmit` (line ~28-90). Verify whether it accepts `editorContext`. If not, extend the simulator's statusPatch staff branch:

```js
// In simulateHandleSubmit at the statusPatch construction (line ~30-50):
const statusPatch = saveMode === 'doctor'
  ? {
      status: 'doctor-recorded',
      ...(isEdit && existingTreatment?.status === 'doctor-recorded' ? {} : {
        recordedBy: 'test-uid-mock',
        recordedAt: '<serverTimestamp>',
      }),
    }
  : {
      status: '<deleteField>',
      // V26.1 — editor attribution spread (mirrors TFP v26StatusPatch staff branch)
      ...(editorContext ? {
        editedBy: editorContext.uid,
        editedByName: editorContext.name,
        editedByRole: editorContext.role,
        editedAt: '<serverTimestamp>',
      } : {}),
    };
```

Also extend the `simulateHandleSubmit` signature to accept `editorContext`:
```js
function simulateHandleSubmit({ saveMode, mode, isEdit, formData, existingTreatment = null, hasSale, editorContext = null }) {
```

- [ ] **Step 2: Run F9 → expect PASS**

```bash
cd F:/LoverClinic-app && npx vitest run tests/phase-26-0-doctor-save-flow-simulate.test.js 2>&1 | tail -10
```

Expected: F1-F9 all PASS (Phase 26.0 baseline 19 + Phase 26.1 F9 5 = 24 minimum).

- [ ] **Step 3: Commit + push**

```bash
cd F:/LoverClinic-app
git add tests/phase-26-0-doctor-save-flow-simulate.test.js
git commit -m "$(cat <<'EOF'
test(Phase 26.1c): F9 flow-simulate edit-save-with-modal

Extends Phase 26.0g flow-simulate with F9 group covering Phase 26.1
editor-attribution modal round-trip:

F9.1 — staff edit save WITHOUT editorContext: modal opens, no writes
F9.2 — staff edit save WITH editorContext: editor fields land in patch
F9.3 — doctor-save bypasses modal (saveMode=doctor branch)
F9.4 — create mode bypasses modal (mode=create branch)
F9.5 — Phase 26.0 v26StatusPatch contract preserved (status:deleteField
       co-exists with V26.1 editor fields)

simulateHandleSubmit extended to accept editorContext arg + propagate to
staff statusPatch branch. Anti-V12 mirror — simulator + actual TFP code
agree (source-grep at G3.6 + TFP v26StatusPatch implementation).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin master 2>&1 | tail -3
```

---

## Task 8: AV37.9-AV37.11 audit extension + SKILL.md update

**Files:**
- Modify: `tests/audit-branch-scope.test.js` (append AV37.9-AV37.11)
- Modify: `.agents/skills/audit-anti-vibe-code/SKILL.md` (extend AV37 entry)

- [ ] **Step 1: Append AV37.9-AV37.11 sub-tests**

In `tests/audit-branch-scope.test.js`, find the AV37 describe block (added in Phase 26.0f around line 938+). Append 3 new sub-tests:

```js
  it('AV37.9 EditAttributionModal exists at canonical path', async () => {
    const fs = await import('node:fs/promises');
    try {
      const stat = await fs.stat('src/components/backend/EditAttributionModal.jsx');
      expect(stat.isFile()).toBe(true);
    } catch (e) {
      expect.fail('EditAttributionModal.jsx missing at canonical path');
    }
  });

  it('AV37.10 TFP handleSubmit signature accepts (eventOrSaveMode, options) (Phase 26.1 ext)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/TreatmentFormPage.jsx', 'utf8');
    expect(src).toMatch(/const\s+handleSubmit\s*=\s*async\s*\(\s*eventOrSaveMode\s*,\s*options\s*=\s*\{\s*\}\s*\)/);
    expect(src).toMatch(/editorContext/);
  });

  it('AV37.11 editedBy/At/Name/Role land in top-level treatment doc (not nested in detail)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/lib/backendClient.js', 'utf8');
    // Top-level extraction pattern: `if (editedBy !== undefined) topLevelPatch.editedBy = ...`
    expect(src).toMatch(/if\s*\(\s*editedBy\s*!==\s*undefined\s*\)\s*topLevelPatch\.editedBy/);
    expect(src).toMatch(/if\s*\(\s*editedByName\s*!==\s*undefined\s*\)\s*topLevelPatch\.editedByName/);
    expect(src).toMatch(/if\s*\(\s*editedByRole\s*!==\s*undefined\s*\)\s*topLevelPatch\.editedByRole/);
    expect(src).toMatch(/if\s*\(\s*editedAt\s*!==\s*undefined\s*\)\s*topLevelPatch\.editedAt/);
  });
```

- [ ] **Step 2: Run AV37 → expect PASS**

```bash
cd F:/LoverClinic-app && npx vitest run tests/audit-branch-scope.test.js -t "AV37" 2>&1 | tail -8
```

Expected: 11 AV37 sub-tests PASS (8 from Phase 26.0f + 3 from Phase 26.1).

- [ ] **Step 3: Extend AV37 entry in SKILL.md**

In `.agents/skills/audit-anti-vibe-code/SKILL.md`, find the AV37 entry (added in Phase 26.0f). Append a "Phase 26.1 extension" section AT THE END of the existing AV37 body, BEFORE the "Companion" line:

```markdown
### AV37 extension — Phase 26.1 editor-attribution (2026-05-13)

Phase 26.1 extends AV37 with editor-attribution modal contract:

- `handleSubmit` signature becomes `async (eventOrSaveMode, options = {})`
  with new `options.editorContext` arg. Internal re-invoke via plain object
  `{saveMode, editorContext}` form is recognized when eventOrSaveMode lacks
  `preventDefault`. All Phase 26.0 forms (string / Event / undefined) still
  resolve identically.
- `editedBy / editedByName / editedByRole / editedAt` fields stamped to
  TOP LEVEL of be_treatments doc (not nested in detail). createBackendTreatment
  + updateBackendTreatment extend the Phase 26.0b extraction pattern.
- `rebuildTreatmentSummary` preserves the 4 editor fields in summary array
  for CDV row meta display.
- CDV summary mapper in CustomerDetailView.jsx line 432-442 includes the
  4 fields — V12 multi-reader-sweep miss from Phase 26.0e fixed in
  Phase 26.1a.
- `ROLE_LABEL_TH = { doctor, assistant, staff }` constant at top of CDV
  for inline meta display.

Source-grep regression: AV37.9 (modal exists) + AV37.10 (signature ext)
+ AV37.11 (top-level extraction). All in `tests/audit-branch-scope.test.js`.

Sanctioned exceptions:
- `editorContext` may be null on create-mode staff save (no modal triggered) —
  the spread `...(editorContext ? {} : {})` writes nothing in that branch.
- Legacy treatments without editedBy fields render no inline meta —
  defensive `t.editedByName && ...` gate at CDV row meta.
```

- [ ] **Step 4: Build**

```bash
cd F:/LoverClinic-app && npm run build 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 5: Commit + push**

```bash
cd F:/LoverClinic-app
git add tests/audit-branch-scope.test.js .agents/skills/audit-anti-vibe-code/SKILL.md
git commit -m "$(cat <<'EOF'
feat(Phase 26.1c): AV37 audit invariant extension — editor attribution

AV37.9-AV37.11 sub-tests added to tests/audit-branch-scope.test.js:
- AV37.9: EditAttributionModal exists at canonical path
- AV37.10: handleSubmit signature accepts (eventOrSaveMode, options) form
- AV37.11: editedBy/Name/Role/At land at top-level treatment doc (not nested)

SKILL.md entry extended with Phase 26.1 contract:
- handleSubmit signature extension to 2-arg form
- 4 new top-level fields with Phase 26.0b extraction pattern
- rebuildTreatmentSummary preservation for CDV display
- CDV summary mapper V12 multi-reader-sweep fix from Phase 26.1a
- ROLE_LABEL_TH constant for inline display

Total AV37 coverage now: 11 sub-tests (8 Phase 26.0f + 3 Phase 26.1c).
Catches future drift on either Phase 26.0 doctor-save invariants OR
Phase 26.1 editor-attribution invariants.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin master 2>&1 | tail -3
```

---

## Task 9: Full-suite verification (Rule N end-of-batch)

**Files:** None (verification only)

- [ ] **Step 1: Run targeted Phase 26.0 + 26.1 tests**

```bash
cd F:/LoverClinic-app && npx vitest run tests/phase-26-0-doctor-save-source-grep.test.js tests/phase-26-0-status-display-rtl.test.jsx tests/phase-26-0-doctor-save-flow-simulate.test.js tests/edit-attribution-modal-rtl.test.jsx tests/audit-branch-scope.test.js -t "AV37" 2>&1 | tail -15
```

Expected: ~110 assertions PASS (Phase 26.0 baseline 62 + G3 6 + D5 4 + F9 5 + E1-E5 5 + AV37.9-11 3 = ~85; + treatment-stock-diff 36 if included = ~120).

- [ ] **Step 2: Run full vitest suite**

```bash
cd F:/LoverClinic-app && npm test -- --run 2>&1 | grep -E "Test Files|Tests \s*[0-9]" | tail -3
```

Expected: 8310+ passed (Phase 26.0 baseline 8297 + Phase 26.1 ~20 new + adjustments).

If any pre-existing tests fail due to Phase 26.1 source contract evolution: those are V21-class regex lock-ins. Update the regex per the V21 fixup pattern (e.g., bump char windows, accept new signature shapes). Apply same approach as Phase 26.0 Task 8 fixups (commit `13b9551`).

- [ ] **Step 3: Build**

```bash
cd F:/LoverClinic-app && npm run build 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 4: Document results (no commit unless V21 fixups landed)**

If full suite reveals V21 fixups needed: apply + commit as a fixup commit:

```bash
cd F:/LoverClinic-app
# (Only if V21 fixups landed)
git add tests/...
git commit -m "$(cat <<'EOF'
fix(Phase 26.1-test-fixups): V21-class regex updates for N stale tests post Task X

[describe each fixup briefly]

Full suite verified: 8310+ pass + 1 skipped (Phase 26.0 baseline +
Phase 26.1 net delta). Build clean.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin master
```

Otherwise no commit; just document the test counts in Task 10 wiki/handoff updates.

---

## Task 10: Wiki + SESSION_HANDOFF + active.md final state

**Files:**
- Modify: `wiki/concepts/treatment-status-and-doctor-save.md` (append Phase 26.1 section)
- Modify: `wiki/log.md`
- Modify: `SESSION_HANDOFF.md`
- Modify: `.agents/active.md`

- [ ] **Step 1: Append Phase 26.1 section to existing wiki concept page**

In `wiki/concepts/treatment-status-and-doctor-save.md`, add a new section AFTER the existing Phase 26.0 content but BEFORE the "See also" section at the end:

```markdown

## Phase 26.1 — Editor-attribution modal (2026-05-13 — same day)

Follow-up sub-phase to Phase 26.0. Adds 3 changes:

### A. V12 multi-reader-sweep fix at CDV summary mapper

Phase 26.0e correctly added `status: t.status || null` to `rebuildTreatmentSummary`
(the writer in `backendClient.js`) so customer.treatmentSummary stored in Firestore
DOES carry status. But the **READER** at
`src/components/backend/CustomerDetailView.jsx:432-442` was overlooked — the
in-component useMemo recomputes summary locally from `treatments[]` and stripped
top-level fields. Result: `paginatedTreatments` had no `status` → chip never
rendered. Phase 26.1a fixed this with a 1-line addition (plus 3 editor fields
for forward-prep).

This is the V12 reader-sweep pattern: every writer fix MUST be paired with a
sweep of every reader. Tests D5.1 lock the contract permanently.

### B. Top-right "ยืนยันการรักษา" button removed

TFP:2888-2893 (sticky header) — user reported non-functional; removed.
Bottom save button at TFP:4816+ is the canonical save path.

### C. NEW editor-attribution modal

Trigger: `isEdit && saveMode === 'staff' && !editorContext`. Doctor-save and
create-mode bypass.

`EditAttributionModal` (NEW component at
`src/components/backend/EditAttributionModal.jsx`) is the 2nd member of the
"pick a person before action" pattern family (1st = `ActorConfirmModal` for
stock state-flip confirmations). Rule of 3 not yet reached.

Schema additions on `be_treatments` (additive — no migration):

| Field | Type | Set when | Display |
|---|---|---|---|
| `editedBy` | uid string | modal-confirmed staff edit-save | (not displayed; ref only) |
| `editedByName` | display name | same | CDV row meta inline + TimelineModal mirror |
| `editedByRole` | 'doctor' / 'assistant' / 'staff' | same | "(แพทย์)" / "(ผู้ช่วย)" / "(พนักงาน)" via ROLE_LABEL_TH |
| `editedAt` | Timestamp | same | (not displayed; audit trail) |

Overwrite-on-each-edit (no history array — YAGNI). Future "edit log"
feature can extend.

### handleSubmit signature evolution

| Phase | Signature |
|---|---|
| Pre-26.0 | `async ()` |
| 26.0a | `async (eventOrSaveMode)` |
| 26.1 | `async (eventOrSaveMode, options = {})` |

Defensive coercion preserved across all phases. `options.editorContext` plus
the internal re-invoke object form `{saveMode, editorContext}` are the Phase
26.1 additions.

### Files (Phase 26.1)

Source:
- `src/components/backend/EditAttributionModal.jsx` (NEW)
- `src/components/backend/CustomerDetailView.jsx` (summary mapper + ROLE_LABEL_TH + row meta)
- `src/components/TreatmentFormPage.jsx` (button removal + signature ext + state + mount + v26StatusPatch ext)
- `src/lib/backendClient.js` (top-level extraction + rebuildTreatmentSummary ext)

Tests:
- `tests/edit-attribution-modal-rtl.test.jsx` (NEW — E1-E5)
- `tests/phase-26-0-doctor-save-source-grep.test.js` (append G3 block)
- `tests/phase-26-0-status-display-rtl.test.jsx` (append D5 block)
- `tests/phase-26-0-doctor-save-flow-simulate.test.js` (append F9 block)
- `tests/audit-branch-scope.test.js` (append AV37.9-AV37.11)
```

- [ ] **Step 2: Append wiki/log.md entry**

```bash
cat >> wiki/log.md << 'EOF'

## [2026-05-13] ingest | Phase 26.1 — TFP Polish + Editor-Attribution Modal

Follow-up to Phase 26.0 (same-day). 3 items: (A) V12 multi-reader-sweep fix at CDV summary mapper — Phase 26.0e fixed the writer but missed the in-component reader, so the amber "แพทย์ลงบันทึก" chip never rendered. (B) Removed broken top-right "ยืนยันการรักษา" button at TFP:2888-2893. (C) NEW EditAttributionModal on staff edit-save — single picker, merged list (staff + doctors + assistants per branch), inline role labels. Records 4 top-level fields (editedBy/Name/Role/At) and displays "· แก้ไขโดย: X (role)" inline in CDV row meta.

Updated `concepts/treatment-status-and-doctor-save.md` with Phase 26.1 section. handleSubmit signature evolution table added. AV37 audit invariant extended with 3 new sub-tests (AV37.9-AV37.11). Total AV37 coverage: 11 sub-tests across both 26.0 + 26.1.

10 task commits across 3 sub-phases (26.1a bug+cleanup, 26.1b modal+RTL, 26.1c TFP integration + display + flow + audit). ~560 LOC delta. Tests delta ~+20 net. Build clean. NOT YET DEPLOYED.
EOF
echo "log appended"
```

- [ ] **Step 3: Update SESSION_HANDOFF.md**

Prepend a new session block after the existing top header. Use this template (adjust SHA + test counts to match actual end-of-Task-9 numbers):

```markdown

### Session 2026-05-13 (continued) — Phase 26.1 TFP Polish + Editor-Attribution Modal (NOT YET DEPLOYED)

User directive (3 items from screenshot of CDV treatment history):
1. NEW modal on staff edit-save to pick editor (พนักงาน/ผู้ช่วย/แพทย์ per branch)
2. Phase 26.0e "แพทย์ลงบันทึก" chip missing in CDV list
3. Remove top-right "ยืนยันการรักษา" button (non-functional)

**Brainstorming HARD-GATE honored** (Rule J): 3 Qs locked — Q1 trigger = edit mode only; Q2 picker = single + merged list with role labels; Q3 display = inline row meta.

**11 files modified** (~560 LOC): 4 source + 7 test/wiki/audit. 10 task commits across 3 sub-phases.

**Phase 26.1a — Bug + cleanup**: CDV summary mapper V12 reader-sweep fix (add status + editedBy/Name/Role to local useMemo at line 432-442) + top-right button removal (TFP:2888-2893).

**Phase 26.1b — Modal + RTL**: NEW `EditAttributionModal.jsx` (155 LOC) + `tests/edit-attribution-modal-rtl.test.jsx` E1-E5 (5 assertions). Single picker, merged list, branch filter via doc.branchIds[].

**Phase 26.1c — Integration**: handleSubmit signature `(eventOrSaveMode, options = {})` + v26StatusPatch staff branch editor stamping + backendClient.js 4-field top-level extraction + rebuildTreatmentSummary preservation + CDV row meta inline display + ROLE_LABEL_TH constant. Tests: G3.1-G3.6 + D5.1-D5.4 + F9.1-F9.5. AV37.9-AV37.11 audit ext.

**Rule of 3 status**: `EditAttributionModal` is 2nd member of "pick a person before action" pattern family (with `ActorConfirmModal`); not yet a Rule of 3 trigger.

**Tests**: Phase 26.0 baseline 8297 → Phase 26.1 final ~8315+ (depending on V21 fixups). Build clean.

Detail: future checkpoint at `.agents/sessions/2026-05-13-phase-26-1-tfp-polish.md` (deferred until session-end).

NOT yet deployed — combined Phase 26.0 + 26.1 = 11+ commits ahead of prod (`ccef3c2`). User authorizes `vercel --prod` separately per Rule V18.

```

- [ ] **Step 4: Update `.agents/active.md`**

Replace contents to reflect the post-Phase-26.1 state (adjust SHA + test counts to actual end-of-Task-10 numbers):

```yaml
---
updated_at: "2026-05-13 — Phase 26.1 editor-attribution complete (NOT YET DEPLOYED)"
status: "master=<NEW_SHA> · prod=ccef3c2 · 20+ commits ahead · 8315+ passed · build clean"
branch: "master"
last_commit: "docs(Phase 26.1): wiki concept + log + SESSION_HANDOFF + active.md"
tests: 8315
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "ccef3c2"
firestore_rules_version: 29
storage_rules_version: 2
---

# Active Context

## State
- master = `<NEW_SHA>` · prod = `ccef3c2` (20+ commits ahead — Phase 26.0 + 26.1 NOT YET DEPLOYED)
- 8315+/8316+ tests passed + 1 skipped (0 Phase 26.1 regressions)
- Phase 26.1 follows Phase 26.0 same-day

## What this session shipped (Phase 26.0 + 26.1)
- **Phase 26.0 — Doctor-Save** (11 commits earlier; see prior active.md state)
- **Phase 26.1 — TFP Polish + Editor-Attribution Modal** (10 task commits this turn):
  - 26.1a: CDV summary mapper V12 fix + top-right button removal
  - 26.1b: NEW EditAttributionModal component + E1-E5 RTL
  - 26.1c: handleSubmit signature ext + v26StatusPatch ext + backendClient extraction + CDV inline meta display + ROLE_LABEL_TH + F9 + AV37.9-AV37.11

## Next action
Idle — Phase 26.0 + 26.1 awaiting user `deploy` authorization to ship combined vercel --prod + firebase deploy --only firestore:rules per V15.

## Outstanding user-triggered actions
- **Pending user authorization**: deploy Phase 26.0 + 26.1 to production
- (Optional, unchanged) probe-deploy-probe.mjs probes 2/3/4 false-positive
- (Optional, unchanged) bsa-task7-h-quater-fix flake

## Institutional memory anchors
- **Phase 26.1 — `EditAttributionModal` is 2nd "pick-a-person-before-action" pattern** (1st = `ActorConfirmModal`). Future 3rd similar modal should consider extracting `<PersonPickerModal>` base.
- **handleSubmit signature evolution**: `async ()` → `async (eventOrSaveMode)` [26.0a] → `async (eventOrSaveMode, options = {})` [26.1c]. Defensive coercion preserved across all forms.
- **V12 multi-reader-sweep at component-level memo** — Phase 26.0e fixed the writer (rebuildTreatmentSummary in backendClient.js) but missed the reader (in-component useMemo in CDV). Phase 26.1a closed the gap; AV37 extension locks. Lesson: every "preserve field X in summary" change must audit ALL summary readers, not just the canonical writer.
- **Top-level vs detail-nested treatment fields**: Phase 26.0b established the extraction pattern (`const {X, Y, ...rest} = detail; if (X !== undefined) topLevelPatch.X = X;`). Phase 26.1c extends with 4 more fields. AV37.11 locks the contract.
- (Carried) Phase 26.0 `saveMode` arg = 4th member of locked-X family (lockedCustomer + lockedAppointmentType + lockedChannel + saveMode).
- (Carried) Iron-clad rules A-P + BSA invariants BS-1..16 + AV1-AV30 + AV32-AV37 + CB-1..5.
```

(Replace `<NEW_SHA>` with `git log -1 --oneline` SHA. The `tests: 8315` is illustrative — adjust to actual count from Task 9 verification.)

- [ ] **Step 5: Commit + push**

```bash
cd F:/LoverClinic-app
git add wiki/concepts/treatment-status-and-doctor-save.md wiki/log.md SESSION_HANDOFF.md .agents/active.md
git commit -m "$(cat <<'EOF'
docs(Phase 26.1): wiki concept extension + log + SESSION_HANDOFF + active.md

- Append Phase 26.1 section to wiki/concepts/treatment-status-and-doctor-save.md
  (V12 reader-sweep fix + button removal + editor-attribution modal pattern +
  handleSubmit signature evolution table)
- Append wiki/log.md 2026-05-13 ingest entry
- Prepend SESSION_HANDOFF.md Phase 26.1 session block
- Refresh .agents/active.md current state (Phase 26.0 + 26.1 awaiting deploy)

Phase 26.1 implementation COMPLETE. Awaiting user "deploy" authorization
for combined vercel --prod + firebase deploy --only firestore:rules.
Total: Phase 26.0 (11 commits) + Phase 26.1 (10 commits) = 21+ commits
ahead of prod (ccef3c2).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin master 2>&1 | tail -3
```

---

## Self-Review

**Spec coverage**:
- ✅ Item A (CDV V12 fix) — Task 1
- ✅ Item B (top-right button removal) — Task 1
- ✅ Item C (editor-attribution modal):
  - Modal component — Task 2
  - handleSubmit signature ext — Task 3
  - v26StatusPatch + backendClient extension — Task 4
  - State + mount + wire — Task 5
  - CDV row meta display + ROLE_LABEL_TH — Task 6
  - Flow-simulate F9 — Task 7
  - AV37 audit ext — Task 8
- ✅ Verification — Task 9
- ✅ Wiki + handoff — Task 10

**Placeholder scan**: no TBD / TODO. Task 2 Step 1 has "Document the result" for branch-filter helpers location — that's a verification step with clear instructions (use exports if present, else inline filter). Task 9 Step 4 has "(Only if V21 fixups landed)" — conditional branch with clear template.

**Type consistency**: `saveMode`, `editorContext`, `editAttributionModal` state shape (`{isOpen: boolean}`), `ROLE_LABEL_TH` keys (doctor/assistant/staff), `editedBy/Name/Role/At` field names — all consistent across Tasks 2-10.

**Estimated duration**: 10 tasks × 20-30 min = ~4 hours. 1 session with focused work.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-13-phase-26-1-tfp-polish-editor-attribution.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
