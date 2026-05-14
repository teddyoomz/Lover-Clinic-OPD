# Phase 29.23 Implementation Plan — Recall Row Edit Button + Clickable Customer + Cases-Admin Delete

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 3 UX additions on the Phase 29.22 recall surface — (1) ✏️ Edit Recall button + RecallEditModal at all 3 surfaces (BE / FE / CDV); (2) clickable customer-name `<a target="_blank">` mirroring appointment pattern; (3) 🗑️ delete button in RecallCasesAdminPanel.

**Architecture:** New 150-LOC `RecallEditModal.jsx` (date + reason only; customer + source read-only). NEW lib fn `deleteRecallCase` (hard-delete; recalls store reason as snapshot string, no FK cascade). Customer-name pattern = bare `<a href=/?backend=1&customer={id} target=_blank>` mirroring `AppointmentCalendarView.jsx:924-935`. All 3 surfaces wired identically (RecallRow is shared atom).

**Tech Stack:** React 19 + Vite 8 + Tailwind 3.4 + Firestore client SDK + Vitest 4.1 + Playwright (Rule Q L1).

**Spec:** [`docs/superpowers/specs/2026-05-14-phase-29-23-recall-row-edit-and-delete-design.md`](../specs/2026-05-14-phase-29-23-recall-row-edit-and-delete-design.md) (commit `0252cdf`).

---

## Pre-flight grep (Rule P Step 3)

Confirms class-of-bug scope before writing code:

- `<a target="_blank">` customer-link callers — already 1 (`AppointmentCalendarView.jsx:924-935`); after Phase 29.23 = 2 (recall surface). Not yet Rule of 3 trigger.
- `deleteRecallCase` — NO existing callers; new function.
- Edit buttons in recall surface — NONE before this; ✏️ Pencil icon is new in recall surface.

No class-of-bug to extend; this is additive UX work.

---

## Task 1: Add `deleteRecallCase` lib function

**Files:**
- Modify: `src/lib/backendClient.js` (after `setRecallCaseHidden` at ~line 11440; new export)
- Modify: `src/lib/scopedDataLayer.js` (universal pass-through near other `recallCase` exports)
- Test: `tests/phase-29-23-delete-recall-case-helper.test.js` (NEW)

---

- [ ] **Step 1.1: Write the failing test**

Create `tests/phase-29-23-delete-recall-case-helper.test.js`:

```js
/**
 * Phase 29.23 — deleteRecallCase lib function unit tests.
 *
 * Hard-delete of be_recall_cases doc. Recalls store reason as STRING SNAPSHOT
 * (no FK to caseId) so cascade is unnecessary. Pure deleteDoc + early return
 * on empty id (defense-in-depth).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock firebase modules
const deleteDocMock = vi.fn();
vi.mock('firebase/firestore', async () => {
  const actual = await vi.importActual('firebase/firestore');
  return {
    ...actual,
    deleteDoc: (...args) => deleteDocMock(...args),
  };
});

describe('Phase 29.23 D1 — deleteRecallCase lib', () => {
  beforeEach(() => {
    deleteDocMock.mockReset();
    deleteDocMock.mockResolvedValue(undefined);
  });

  it('D1.1 — exports deleteRecallCase from backendClient', async () => {
    const mod = await import('../src/lib/backendClient.js');
    expect(typeof mod.deleteRecallCase).toBe('function');
  });

  it('D1.2 — exports deleteRecallCase from scopedDataLayer (universal pass-through)', async () => {
    const mod = await import('../src/lib/scopedDataLayer.js');
    expect(typeof mod.deleteRecallCase).toBe('function');
  });

  it('D1.3 — calls Firestore deleteDoc with recall-cases path when id provided', async () => {
    const { deleteRecallCase } = await import('../src/lib/backendClient.js');
    await deleteRecallCase('CASE-123');
    expect(deleteDocMock).toHaveBeenCalledTimes(1);
  });

  it('D1.4 — early-returns without calling deleteDoc when id is empty string', async () => {
    const { deleteRecallCase } = await import('../src/lib/backendClient.js');
    await deleteRecallCase('');
    expect(deleteDocMock).not.toHaveBeenCalled();
  });

  it('D1.5 — early-returns without calling deleteDoc when id is null/undefined', async () => {
    const { deleteRecallCase } = await import('../src/lib/backendClient.js');
    await deleteRecallCase(null);
    await deleteRecallCase(undefined);
    expect(deleteDocMock).not.toHaveBeenCalled();
  });

  it('D1.6 — ignores ctx param (forward-compat, no audit doc emitted)', async () => {
    const { deleteRecallCase } = await import('../src/lib/backendClient.js');
    await deleteRecallCase('CASE-123', { uid: 'test-uid', user: { uid: 'x' } });
    expect(deleteDocMock).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 1.2: Run test to verify it fails**

Run: `npm test -- --run tests/phase-29-23-delete-recall-case-helper.test.js`
Expected: FAIL — `deleteRecallCase is not a function` (not yet exported).

- [ ] **Step 1.3: Implement deleteRecallCase in backendClient.js**

In `src/lib/backendClient.js`, after `setRecallCaseHidden` (after line 11440), add:

```js
/**
 * Phase 29.23 (2026-05-14) — hard-delete a be_recall_cases doc.
 * Safe because recalls store `reason` as STRING SNAPSHOT (no FK to caseId);
 * existing recalls are unaffected by deleting the master case.
 *
 * No audit doc emitted (consistent with setRecallCaseHidden which writes
 * audit fields directly on the doc — but here the doc is gone, so we don't
 * write anywhere). If audit trail needed in future, callers can pre-record
 * to be_admin_audit via separate write.
 *
 * @param {string} id be_recall_cases doc id
 * @param {object} [ctx] reserved for future audit (unused now)
 */
export async function deleteRecallCase(id, ctx = {}) {
  if (!id) return;
  await deleteDoc(recallCaseDoc(id));
}
```

**Important**: `deleteDoc` is already imported at the top of `backendClient.js` (used by many other functions). `recallCaseDoc` is defined at line 11366 as `(id) => doc(db, ...basePath(), 'be_recall_cases', id)`. No new imports needed.

- [ ] **Step 1.4: Add universal pass-through to scopedDataLayer.js**

In `src/lib/scopedDataLayer.js`, find the existing recall case exports (`saveRecallCase`, `setRecallCaseHidden`) and add immediately after:

```js
export const deleteRecallCase = (...args) => raw.deleteRecallCase(...args);
```

- [ ] **Step 1.5: Run test to verify it passes**

Run: `npm test -- --run tests/phase-29-23-delete-recall-case-helper.test.js`
Expected: PASS — all 6 tests green.

- [ ] **Step 1.6: Commit**

```bash
git add src/lib/backendClient.js src/lib/scopedDataLayer.js tests/phase-29-23-delete-recall-case-helper.test.js
git commit -m "feat(Phase 29.23 Task 1): deleteRecallCase lib hard-delete

NEW src/lib/backendClient.js deleteRecallCase(id, ctx) — hard delete
be_recall_cases doc. Safe because recalls store reason as STRING
SNAPSHOT (no FK cascade). No audit doc emitted (consistent with
setRecallCaseHidden).

Universal pass-through in scopedDataLayer.js.

Tests: D1.1-D1.6 (6 unit assertions) GREEN.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 2: Create RecallEditModal component

**Files:**
- Create: `src/components/backend/recall/RecallEditModal.jsx` (~150 LOC)
- Test: `tests/phase-29-23-recall-edit-modal.test.jsx` (NEW)

---

- [ ] **Step 2.1: Write the failing test**

Create `tests/phase-29-23-recall-edit-modal.test.jsx`:

```jsx
/**
 * Phase 29.23 — RecallEditModal RTL tests.
 *
 * Lightweight edit modal — date + reason only (forensic trail otherwise).
 * Customer/source header read-only. ESC + click-outside + cancel button close.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const updateRecallMock = vi.fn();
vi.mock('../src/lib/scopedDataLayer.js', async () => {
  const actual = await vi.importActual('../src/lib/scopedDataLayer.js');
  return {
    ...actual,
    updateRecall: (...args) => updateRecallMock(...args),
  };
});

// Stable today for date validations
vi.mock('../src/utils.js', async () => {
  const actual = await vi.importActual('../src/utils.js');
  return { ...actual, thaiTodayISO: () => '2026-05-14' };
});

import { RecallEditModal } from '../src/components/backend/recall/RecallEditModal.jsx';

const RECALL_FIXTURE = {
  id: 'REC-TEST-1',
  customerId: 'LC-26000001',
  customerName: 'นายทดสอบ ทดลอง',
  customerHN: 'HN-8001',
  customerPhone: '0812345678',
  recallDate: '2026-05-20',
  reason: 'ติดตามอาการ',
  sourceProductName: 'Botox 100u',
  status: 'pending',
};

const RECALL_CASES_FIXTURE = [
  { caseId: 'CASE-1', caseName: 'ติดตามอาการ', defaultDays: 3 },
  { caseId: 'CASE-2', caseName: 'ครบรอบบริการ', defaultDays: 180 },
];

describe('Phase 29.23 E1 — RecallEditModal', () => {
  beforeEach(() => {
    updateRecallMock.mockReset();
    updateRecallMock.mockResolvedValue(undefined);
  });

  it('E1.1 — renders with prefilled date + reason from recall prop', () => {
    render(
      <RecallEditModal
        recall={RECALL_FIXTURE}
        recallCases={RECALL_CASES_FIXTURE}
        onClose={() => {}}
      />
    );
    expect(screen.getByTestId('recall-edit-modal')).toBeInTheDocument();
    // Customer header is read-only
    expect(screen.getByText(/นายทดสอบ ทดลอง/)).toBeInTheDocument();
    expect(screen.getByText(/HN-8001/)).toBeInTheDocument();
    // Reason typeahead prefilled
    expect(screen.getByDisplayValue('ติดตามอาการ')).toBeInTheDocument();
  });

  it('E1.2 — saves via updateRecall with patched date + reason', async () => {
    const onClose = vi.fn();
    const onSaved = vi.fn();
    render(
      <RecallEditModal
        recall={RECALL_FIXTURE}
        recallCases={RECALL_CASES_FIXTURE}
        onClose={onClose}
        onSaved={onSaved}
      />
    );
    fireEvent.click(screen.getByTestId('recall-edit-save'));
    await waitFor(() => {
      expect(updateRecallMock).toHaveBeenCalledTimes(1);
    });
    const [id, patch] = updateRecallMock.mock.calls[0];
    expect(id).toBe('REC-TEST-1');
    expect(patch).toEqual({
      recallDate: '2026-05-20',
      reason: 'ติดตามอาการ',
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('E1.3 — closes via cancel button', () => {
    const onClose = vi.fn();
    render(
      <RecallEditModal
        recall={RECALL_FIXTURE}
        recallCases={RECALL_CASES_FIXTURE}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByTestId('recall-edit-cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('E1.4 — closes via ESC key', () => {
    const onClose = vi.fn();
    render(
      <RecallEditModal
        recall={RECALL_FIXTURE}
        recallCases={RECALL_CASES_FIXTURE}
        onClose={onClose}
      />
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('E1.5 — closes via backdrop click', () => {
    const onClose = vi.fn();
    render(
      <RecallEditModal
        recall={RECALL_FIXTURE}
        recallCases={RECALL_CASES_FIXTURE}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByTestId('recall-edit-modal'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('E1.6 — backdrop click on inner card does NOT close', () => {
    const onClose = vi.fn();
    render(
      <RecallEditModal
        recall={RECALL_FIXTURE}
        recallCases={RECALL_CASES_FIXTURE}
        onClose={onClose}
      />
    );
    fireEvent.click(screen.getByTestId('recall-edit-card'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('E1.7 — validation banner on empty reason; save disabled', () => {
    render(
      <RecallEditModal
        recall={{ ...RECALL_FIXTURE, reason: '' }}
        recallCases={RECALL_CASES_FIXTURE}
        onClose={() => {}}
      />
    );
    expect(screen.getByTestId('recall-edit-validation-reason')).toBeInTheDocument();
    expect(screen.getByTestId('recall-edit-save')).toBeDisabled();
  });

  it('E1.8 — validation banner on empty date; save disabled', () => {
    render(
      <RecallEditModal
        recall={{ ...RECALL_FIXTURE, recallDate: '' }}
        recallCases={RECALL_CASES_FIXTURE}
        onClose={() => {}}
      />
    );
    expect(screen.getByTestId('recall-edit-validation-date')).toBeInTheDocument();
    expect(screen.getByTestId('recall-edit-save')).toBeDisabled();
  });

  it('E1.9 — save error shows banner; save button re-enabled', async () => {
    updateRecallMock.mockRejectedValueOnce(new Error('rules-denied'));
    render(
      <RecallEditModal
        recall={RECALL_FIXTURE}
        recallCases={RECALL_CASES_FIXTURE}
        onClose={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId('recall-edit-save'));
    await waitFor(() => {
      expect(screen.getByTestId('recall-edit-error')).toHaveTextContent(/rules-denied/);
    });
    expect(screen.getByTestId('recall-edit-save')).not.toBeDisabled();
  });

  it('E1.10 — customer header is read-only (no editable inputs in header)', () => {
    render(
      <RecallEditModal
        recall={RECALL_FIXTURE}
        recallCases={RECALL_CASES_FIXTURE}
        onClose={() => {}}
      />
    );
    const header = screen.getByTestId('recall-edit-customer-header');
    expect(header.querySelectorAll('input, select, textarea').length).toBe(0);
  });
});
```

- [ ] **Step 2.2: Run test to verify it fails**

Run: `npm test -- --run tests/phase-29-23-recall-edit-modal.test.jsx`
Expected: FAIL — module not found (`RecallEditModal.jsx` doesn't exist yet).

- [ ] **Step 2.3: Create RecallEditModal.jsx**

Create `src/components/backend/recall/RecallEditModal.jsx`:

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import { X, Save } from 'lucide-react';
import DateField from '../../DateField.jsx';
import { RecallCaseSelectField } from './RecallCaseSelectField.jsx';
import { updateRecall } from '../../../lib/scopedDataLayer.js';

/**
 * Phase 29.23 (2026-05-14) — Edit Recall modal (lightweight, single-recall).
 *
 * Per spec §4.1: edit only `recallDate` + `reason` (forensic trail otherwise).
 * Customer + source + audit stamps + status all immutable post-create.
 *
 * Used by RecallTab + RecallFrontendView + CustomerDetailView/RecallCard
 * (3 surfaces share this single component).
 *
 * Anti-flicker discipline (spec §5.6):
 *   - Save → updateRecall → modal closes → parent's onSnapshot updates list
 *   - Stable React keys upstream (RecallList.jsx) preserve DOM nodes; only
 *     edited row's inner text changes.
 *
 * @param {object} props
 * @param {object} props.recall existing recall doc (required)
 * @param {Array<{caseId,caseName,defaultDays}>} [props.recallCases]
 *   Universal cache from useRecallCases. Drives RecallCaseSelectField typeahead.
 * @param {function} props.onClose () => void
 * @param {function} [props.onSaved] (id: string) => void — fires after successful save
 */
export function RecallEditModal({ recall, recallCases = [], onClose, onSaved }) {
  const [recallDate, setRecallDate] = useState(recall?.recallDate || '');
  const [reason, setReason] = useState(recall?.reason || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // ESC closes modal
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const hasDate = !!String(recallDate || '').trim();
  const hasReason = !!String(reason || '').trim();
  const canSave = hasDate && hasReason && !saving;

  const handleSave = useCallback(async () => {
    if (!canSave) return;
    setError('');
    setSaving(true);
    try {
      await updateRecall(recall.id, {
        recallDate: String(recallDate || '').trim(),
        reason: String(reason || '').trim(),
      });
      onSaved?.(recall.id);
      onClose?.();
    } catch (ex) {
      console.error('[RecallEditModal] save failed:', ex);
      setError(ex?.message || 'บันทึกไม่สำเร็จ');
      setSaving(false);
    }
  }, [canSave, recall?.id, recallDate, reason, onClose, onSaved]);

  if (!recall) return null;

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      data-testid="recall-edit-modal"
    >
      <div
        className="bg-[var(--bg-card)] border-2 border-[var(--bd-strong)] rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        data-testid="recall-edit-card"
      >
        {/* Header */}
        <div className="sticky top-0 bg-[var(--bg-card)] border-b border-[var(--bd-strong)] px-4 py-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-[var(--tx-primary)]">✏️ แก้ไข Recall</h2>
          <button
            type="button"
            onClick={onClose}
            data-testid="recall-edit-close"
            className="w-7 h-7 rounded-lg hover:bg-[var(--bg-hover)] flex items-center justify-center text-[var(--tx-muted)]"
            aria-label="ปิด"
          >
            <X size={14} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          {/* Customer header — read-only forensic trail */}
          <div
            className="p-3 rounded-lg bg-teal-500/[0.06] border border-teal-500/25"
            data-testid="recall-edit-customer-header"
          >
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs font-bold text-[var(--tx-primary)]">
                {recall.customerName || '—'}
              </span>
              {recall.customerLineUserId && (
                <span className="text-[8px] px-1 py-0 bg-green-500/15 text-green-300 border border-green-500/30 rounded font-bold">L</span>
              )}
              {recall.customerHN && (
                <span className="font-mono text-[9px] text-[var(--tx-muted)]">HN {recall.customerHN}</span>
              )}
              {recall.customerId && (
                <span className="font-mono text-[9px] text-[var(--tx-muted)]">{recall.customerId}</span>
              )}
            </div>
            {recall.customerPhone && (
              <div className="text-[10px] text-[var(--tx-muted)] mt-0.5">📞 {recall.customerPhone}</div>
            )}
            {(recall.sourceProductName || recall.sourceCourseName) && (
              <div className="text-[10px] text-teal-300 mt-0.5">
                จากบริการ: {recall.sourceProductName || recall.sourceCourseName}
              </div>
            )}
          </div>

          {/* Editable: recallDate */}
          <div data-field="recallDate">
            <label className="block text-[10px] font-bold text-[var(--tx-muted)] mb-1 uppercase">
              วันที่ Recall <span className="text-red-300">*</span>
            </label>
            <DateField
              value={recallDate}
              onChange={setRecallDate}
              locale="be"
              size="sm"
            />
          </div>

          {/* Editable: reason via typeahead */}
          <div data-field="reason">
            <label className="block text-[10px] font-bold text-[var(--tx-muted)] mb-1 uppercase">
              เหตุผล / เคส Recall <span className="text-red-300">*</span>
            </label>
            <RecallCaseSelectField
              value={reason}
              recallCases={recallCases}
              onChange={setReason}
              onPick={({ caseName }) => setReason(caseName || '')}
              placeholder="พิมพ์เพื่อค้น หรือเลือกจาก dropdown"
              data-testid="recall-edit-reason-field"
            />
          </div>

          {/* Validation banners */}
          {!hasDate && (
            <div
              className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300"
              data-testid="recall-edit-validation-date"
            >
              ⚠ กรุณาเลือกวันที่ Recall
            </div>
          )}
          {!hasReason && (
            <div
              className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-300"
              data-testid="recall-edit-validation-reason"
            >
              ⚠ กรุณาเลือกเหตุผล
            </div>
          )}

          {error && (
            <div
              className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-[11px] text-red-300"
              data-testid="recall-edit-error"
            >
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-[var(--bg-card)] border-t border-[var(--bd-strong)] px-4 py-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            data-testid="recall-edit-cancel"
            className="px-4 py-2 rounded-lg text-xs font-semibold text-[var(--tx-muted)] hover:bg-[var(--bg-hover)]"
            disabled={saving}
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            data-testid="recall-edit-save"
            className="px-4 py-2 rounded-lg text-xs font-bold text-white bg-sky-600 hover:bg-sky-500 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
          >
            <Save size={12} />
            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default RecallEditModal;
```

- [ ] **Step 2.4: Run test to verify it passes**

Run: `npm test -- --run tests/phase-29-23-recall-edit-modal.test.jsx`
Expected: PASS — all 10 tests green.

If E1.5 fails because backdrop click doesn't bubble: the modal currently uses `if (e.target === e.currentTarget)` guard — fireEvent.click on the modal element should fire that branch. If RTL doesn't propagate correctly, swap the test to dispatch on document with element ref.

- [ ] **Step 2.5: Commit**

```bash
git add src/components/backend/recall/RecallEditModal.jsx tests/phase-29-23-recall-edit-modal.test.jsx
git commit -m "feat(Phase 29.23 Task 2): RecallEditModal component

NEW src/components/backend/recall/RecallEditModal.jsx (~190 LOC).
Lightweight edit modal — date + reason only per spec §4.1 (forensic
trail otherwise). Customer + source + audit stamps + status all
immutable post-create.

Used by RecallTab + RecallFrontendView + CDV/RecallCard (3 surfaces
share this single component — wired in Tasks 5-7).

Anti-flicker discipline: save → updateRecall → close → parent listener
auto-refreshes. Stable React keys upstream preserve DOM nodes.

Tests: E1.1-E1.10 (10 RTL assertions) GREEN.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 3: RecallRow.jsx — edit button + customer-name `<a>`

**Files:**
- Modify: `src/components/backend/recall/RecallRow.jsx`
- Test: `tests/phase-29-23-recall-row-edit-button.test.jsx` (NEW)

---

- [ ] **Step 3.1: Write the failing test**

Create `tests/phase-29-23-recall-row-edit-button.test.jsx`:

```jsx
/**
 * Phase 29.23 — RecallRow edit button + customer-name <a> link RTL tests.
 *
 * Per spec §4.2:
 *   - Edit button placement: between snooze + delete; sky-500 accent;
 *     data-testid=recall-edit-{id}; always shown when onEdit prop provided.
 *   - Customer-name: <a target="_blank"> with /?backend=1&customer={id}
 *     when customerId present; plain <span> fallback when missing.
 *   - Both stopPropagation so parent row click doesn't fire.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// useTheme hook needs MutationObserver polyfill (loaded via tests/setup.js)
import { RecallRow } from '../src/components/backend/recall/RecallRow.jsx';

const RECALL_FIXTURE = {
  id: 'REC-TEST-1',
  customerId: 'LC-26000001',
  customerName: 'นายทดสอบ ทดลอง',
  customerHN: 'HN-8001',
  recallDate: '2026-05-20',
  reason: 'ติดตามอาการ',
  status: 'pending',
};

describe('Phase 29.23 R1 — RecallRow edit button + customer link', () => {
  it('R1.1 — renders edit button when onEdit prop provided', () => {
    render(
      <RecallRow
        recall={RECALL_FIXTURE}
        todayISO="2026-05-14"
        onEdit={() => {}}
      />
    );
    expect(screen.getByTestId('recall-edit-REC-TEST-1')).toBeInTheDocument();
  });

  it('R1.2 — does NOT render edit button when onEdit prop missing', () => {
    render(
      <RecallRow
        recall={RECALL_FIXTURE}
        todayISO="2026-05-14"
      />
    );
    expect(screen.queryByTestId('recall-edit-REC-TEST-1')).toBeNull();
  });

  it('R1.3 — edit button click → onEdit called with recall.id', () => {
    const onEdit = vi.fn();
    render(
      <RecallRow
        recall={RECALL_FIXTURE}
        todayISO="2026-05-14"
        onEdit={onEdit}
      />
    );
    fireEvent.click(screen.getByTestId('recall-edit-REC-TEST-1'));
    expect(onEdit).toHaveBeenCalledWith('REC-TEST-1');
  });

  it('R1.4 — edit button click stopPropagation: parent onClick NOT fired', () => {
    const onClick = vi.fn();
    const onEdit = vi.fn();
    render(
      <RecallRow
        recall={RECALL_FIXTURE}
        todayISO="2026-05-14"
        onClick={onClick}
        onEdit={onEdit}
      />
    );
    fireEvent.click(screen.getByTestId('recall-edit-REC-TEST-1'));
    expect(onEdit).toHaveBeenCalled();
    expect(onClick).not.toHaveBeenCalled();
  });

  it('R1.5 — customer-name renders as <a target="_blank"> when customerId present', () => {
    render(
      <RecallRow
        recall={RECALL_FIXTURE}
        todayISO="2026-05-14"
      />
    );
    const link = screen.getByTestId('recall-customer-link-REC-TEST-1');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('noreferrer');
  });

  it('R1.6 — customer-name href contains backend deep-link with encoded id', () => {
    render(
      <RecallRow
        recall={RECALL_FIXTURE}
        todayISO="2026-05-14"
      />
    );
    const link = screen.getByTestId('recall-customer-link-REC-TEST-1');
    expect(link.getAttribute('href')).toBe('/?backend=1&customer=LC-26000001');
  });

  it('R1.7 — customer-name renders as plain <span> when customerId missing', () => {
    const recall = { ...RECALL_FIXTURE, customerId: '' };
    render(
      <RecallRow
        recall={recall}
        todayISO="2026-05-14"
      />
    );
    expect(screen.queryByTestId('recall-customer-link-REC-TEST-1')).toBeNull();
    expect(screen.getByTestId('recall-customer-name-plain-REC-TEST-1')).toBeInTheDocument();
  });

  it('R1.8 — customer-name <a> click stopPropagation: parent onClick NOT fired', () => {
    const onClick = vi.fn();
    render(
      <RecallRow
        recall={RECALL_FIXTURE}
        todayISO="2026-05-14"
        onClick={onClick}
      />
    );
    fireEvent.click(screen.getByTestId('recall-customer-link-REC-TEST-1'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('R1.9 — customer-name encodes special chars in customerId', () => {
    const recall = { ...RECALL_FIXTURE, customerId: 'LC/26000001+x' };
    render(
      <RecallRow
        recall={recall}
        todayISO="2026-05-14"
      />
    );
    const link = screen.getByTestId('recall-customer-link-REC-TEST-1');
    expect(link.getAttribute('href')).toBe('/?backend=1&customer=LC%2F26000001%2Bx');
  });

  it('R1.10 — edit button title contains แก้ไข Recall', () => {
    render(
      <RecallRow
        recall={RECALL_FIXTURE}
        todayISO="2026-05-14"
        onEdit={() => {}}
      />
    );
    const btn = screen.getByTestId('recall-edit-REC-TEST-1');
    expect(btn.getAttribute('title')).toContain('แก้ไข');
    expect(btn.getAttribute('aria-label')).toBe('แก้ไข Recall');
  });

  it('R1.11 — edit button rendered ALSO when status=done (admin can fix typos)', () => {
    const recall = { ...RECALL_FIXTURE, status: 'done' };
    render(
      <RecallRow
        recall={recall}
        todayISO="2026-05-14"
        onEdit={() => {}}
      />
    );
    expect(screen.getByTestId('recall-edit-REC-TEST-1')).toBeInTheDocument();
  });

  it('R1.12 — edit button rendered ALSO when status=closed-no-answer', () => {
    const recall = { ...RECALL_FIXTURE, status: 'closed-no-answer' };
    render(
      <RecallRow
        recall={recall}
        todayISO="2026-05-14"
        onEdit={() => {}}
      />
    );
    expect(screen.getByTestId('recall-edit-REC-TEST-1')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3.2: Run test to verify it fails**

Run: `npm test -- --run tests/phase-29-23-recall-row-edit-button.test.jsx`
Expected: FAIL — `recall-edit-REC-TEST-1` not in DOM, `recall-customer-link-REC-TEST-1` not in DOM.

- [ ] **Step 3.3: Modify RecallRow.jsx — import Pencil + add onEdit prop**

In `src/components/backend/recall/RecallRow.jsx`:

**(a) Update the `lucide-react` import** (currently line 2):
```jsx
import { Phone, MessageCircle, Clock, Trash2, Pencil } from 'lucide-react';
```

**(b) Add `onEdit` to JSDoc + destructure** — extend the JSDoc block (lines 31-37) and the function signature (lines 38-49):

Add to JSDoc after the `onDelete` line:
```
 * @param {function} [props.onEdit] (recallId) → open edit modal
```

Add `onEdit,` to the destructured props after `onDelete,`:
```jsx
export function RecallRow({
  recall,
  todayISO,
  pairedRecall,
  onClick,
  onRecordOutcome,
  onLineSend,
  onSnooze,
  onPairClick,
  onDelete,
  onEdit,
  compact = false,
}) {
```

- [ ] **Step 3.4: Replace customer-name span with <a> wrap**

In `src/components/backend/recall/RecallRow.jsx`, find line 121:

```jsx
<span className="text-[12px] font-bold text-[var(--tx-primary)]">{recall.customerName || '—'}</span>
```

Replace with:

```jsx
{recall.customerId ? (
  <a
    href={`/?backend=1&customer=${encodeURIComponent(String(recall.customerId))}`}
    target="_blank"
    rel="noopener noreferrer"
    onClick={(e) => e.stopPropagation()}
    className="text-[12px] font-bold text-[var(--tx-primary)] hover:underline underline-offset-2 hover:text-sky-300"
    title={`เปิดข้อมูล ${recall.customerName || ''} ในแท็บใหม่`}
    data-testid={`recall-customer-link-${recall.id}`}
  >
    {recall.customerName || '—'}
  </a>
) : (
  <span
    className="text-[12px] font-bold text-[var(--tx-primary)]"
    data-testid={`recall-customer-name-plain-${recall.id}`}
  >
    {recall.customerName || '—'}
  </span>
)}
```

- [ ] **Step 3.5: Add edit button between snooze and delete**

In `src/components/backend/recall/RecallRow.jsx`, find the snooze button block (currently lines 218-229; ends with `</button>` after the `Clock` icon).

Immediately AFTER the snooze button's closing `)}` and BEFORE the delete button block (which starts with the comment `{/* Phase 29.22 round-3 — delete button.`), insert:

```jsx
{/* Phase 29.23 — edit button (sky-500). Always shown (admin can fix typos
    on done/closed recalls too — same discoverability rationale as the
    delete button per round-3 lesson). */}
{onEdit && (
  <button
    type="button"
    onClick={(e) => { e.stopPropagation(); onEdit(recall.id); }}
    data-testid={`recall-edit-${recall.id}`}
    className="w-6 h-6 rounded bg-sky-500/10 border border-sky-500/30 text-sky-600 dark:text-sky-300 hover:bg-sky-500/20 hover:border-sky-500/60 flex items-center justify-center"
    aria-label="แก้ไข Recall"
    title="✏️ แก้ไข Recall"
  >
    <Pencil size={11} />
  </button>
)}
```

- [ ] **Step 3.6: Run test to verify it passes**

Run: `npm test -- --run tests/phase-29-23-recall-row-edit-button.test.jsx`
Expected: PASS — all 12 tests green.

- [ ] **Step 3.7: Commit**

```bash
git add src/components/backend/recall/RecallRow.jsx tests/phase-29-23-recall-row-edit-button.test.jsx
git commit -m "feat(Phase 29.23 Task 3): RecallRow edit button + customer-name <a>

Per spec §4.2:
- Customer-name wrapped in <a target=_blank rel=noopener noreferrer>
  with /?backend=1&customer={encoded id} deep-link. Plain <span>
  fallback when customerId missing. Mirror appointment pattern at
  AppointmentCalendarView.jsx:924-935.
- Edit button (Pencil icon, sky-500 accent) inserted between snooze
  and delete in action column. Always shown when onEdit prop provided
  (admin can fix typos on done/closed recalls per round-3 lesson).
- Both stopPropagation so parent row click doesn't fire.

Tests: R1.1-R1.12 (12 RTL assertions) GREEN.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 4: RecallList.jsx — onEdit pass-through

**Files:**
- Modify: `src/components/backend/recall/RecallList.jsx`

---

- [ ] **Step 4.1: Add onEdit to props destructure + RecallRow**

In `src/components/backend/recall/RecallList.jsx`:

**(a)** Update the JSDoc block (around line 25-28) — add after the `onDelete` line (if present, otherwise add at end of @param list):
```
 * @param {function} [props.onEdit] (recallId) → open edit modal
```

**(b)** Update the function destructure (lines 29-40) — add `onEdit,` after `onDelete,`:

```jsx
export function RecallList({
  recalls,
  todayISO,
  mode = 'full',
  onRowClick,
  onRecordOutcome,
  onLineSend,
  onSnooze,
  onPairClick,
  onDelete,
  onEdit,
  emptyState = null,
}) {
```

**(c)** Pass `onEdit` to `<RecallRow>` in the map (around line 91-101):

```jsx
<RecallRow
  key={r.id}
  recall={r}
  todayISO={todayISO}
  pairedRecall={r.pairedRecallId ? pairMap.get(r.pairedRecallId) || null : null}
  onClick={onRowClick}
  onRecordOutcome={onRecordOutcome}
  onLineSend={onLineSend}
  onSnooze={onSnooze}
  onPairClick={onPairClick}
  onDelete={onDelete}
  onEdit={onEdit}
/>
```

- [ ] **Step 4.2: Verify no regressions via targeted test**

Run: `npm test -- --run tests/phase-29-23-recall-row-edit-button.test.jsx tests/phase-29-23-recall-edit-modal.test.jsx`
Expected: PASS — 22 tests green.

- [ ] **Step 4.3: Commit**

```bash
git add src/components/backend/recall/RecallList.jsx
git commit -m "feat(Phase 29.23 Task 4): RecallList onEdit pass-through

Mirror existing onDelete pass-through pattern (line 38, 101) — add
onEdit to JSDoc + destructure + <RecallRow> prop forwarding.

No new tests (Task 3 + Task 5/6/7 cover the full chain).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 5: Wire RecallTab.jsx (Backend surface)

**Files:**
- Modify: `src/components/backend/recall/RecallTab.jsx`

---

- [ ] **Step 5.1: Add imports + editingRecall state + handler**

In `src/components/backend/recall/RecallTab.jsx`:

**(a)** Add import at the top alongside other modals (around line 5-8):

```jsx
import { RecallEditModal } from './RecallEditModal.jsx';
```

**(b)** Add state after the existing modal states (around line 53):

```jsx
const [editModal, setEditModal] = useState(null);
```

**(c)** Add handler after `handleDelete` (around line 138):

```jsx
const handleEdit = useCallback((id) => {
  const recall = findRecall(id);
  if (recall) setEditModal({ recall });
}, [findRecall]);
```

- [ ] **Step 5.2: Wire onEdit to RecallList**

In the same file, find the `<RecallList ...>` invocation (around line 210-220) and add `onEdit={handleEdit}` to its props:

```jsx
<RecallList
  recalls={filteredRecalls}
  todayISO={todayISO}
  mode="full"
  onRowClick={handleRowClick}
  onRecordOutcome={handleRecordOutcome}
  onLineSend={handleLineSend}
  onSnooze={handleSnooze}
  onPairClick={handlePairClick}
  onDelete={handleDelete}
  onEdit={handleEdit}
/>
```

- [ ] **Step 5.3: Render the modal at the bottom alongside other modals**

In the same file, find the modal render block (currently ends at line 255 with `</RecallSnoozeMenu>`). Add immediately after the `{snoozeModal && ...}` block, BEFORE the closing `</div>` of the return:

```jsx
{editModal && (
  <RecallEditModal
    recall={editModal.recall}
    recallCases={recallCases}
    onClose={() => setEditModal(null)}
    onSaved={() => setEditModal(null)}
  />
)}
```

- [ ] **Step 5.4: Run full RecallTab test suite to verify no regressions**

Run: `npm test -- --run tests/phase-29-22-recall-tab.test.jsx`
Expected: PASS (no regressions in existing Phase 29.22 RecallTab tests).

If a test file specifically validating RecallTab integration doesn't exist or covers a different surface, run any test importing RecallTab:
Run: `npm test -- --run --reporter=verbose tests/phase-29-22*.test.{js,jsx}` and confirm the count is unchanged.

- [ ] **Step 5.5: Commit**

```bash
git add src/components/backend/recall/RecallTab.jsx
git commit -m "feat(Phase 29.23 Task 5): wire RecallEditModal in RecallTab

Mirror existing onSnooze/onRecordOutcome modal pattern:
- import RecallEditModal
- useState(null) editModal state
- handleEdit useCallback resolves recall from findRecall + setEditModal
- onEdit={handleEdit} prop on RecallList
- {editModal && <RecallEditModal recall recallCases onClose onSaved />}
  at bottom of return

recallCases prop wired from existing useRecallCases hook (line 45).
onSaved closes modal; Firestore onSnapshot auto-refreshes list.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 6: Wire RecallFrontendView.jsx (Frontend surface)

**Files:**
- Modify: `src/components/backend/recall/RecallFrontendView.jsx`

---

- [ ] **Step 6.1: Read RecallFrontendView.jsx to confirm modal pattern**

Read the current `src/components/backend/recall/RecallFrontendView.jsx` and locate:
- Where modal states are declared (similar to RecallTab — outcomeModal, lineModal, snoozeModal)
- Where `<RecallList ... />` is rendered
- Where the modal render block lives
- Whether `useRecallCases` is already imported (likely yes — typeahead source needed)

If `useRecallCases` is NOT imported (and the typeahead is only used by RecallCreateModal), import it now (mirror RecallTab line 10).

- [ ] **Step 6.2: Add the same 3 changes as Task 5**

Apply the EXACT same pattern as Task 5 steps 5.1-5.3 to `RecallFrontendView.jsx`:

1. Add `import { RecallEditModal } from './RecallEditModal.jsx';`
2. Add `const [editModal, setEditModal] = useState(null);` next to other modal states.
3. Add `handleEdit` useCallback:
   ```jsx
   const handleEdit = useCallback((id) => {
     const recall = findRecall(id);  // adapt to whatever the local resolver is named
     if (recall) setEditModal({ recall });
   }, [findRecall]);
   ```
4. Add `onEdit={handleEdit}` to `<RecallList ... />`.
5. Add the modal render block before the closing tag:
   ```jsx
   {editModal && (
     <RecallEditModal
       recall={editModal.recall}
       recallCases={recallCases}
       onClose={() => setEditModal(null)}
       onSaved={() => setEditModal(null)}
     />
   )}
   ```

If the local file uses a different resolver name (e.g. inline `.find(...)`), adapt accordingly.

- [ ] **Step 6.3: Run any FE-related test to verify no regressions**

Run: `npm test -- --run tests/phase-29-*.test.{js,jsx}` and confirm test count unchanged + all pass.

- [ ] **Step 6.4: Commit**

```bash
git add src/components/backend/recall/RecallFrontendView.jsx
git commit -m "feat(Phase 29.23 Task 6): wire RecallEditModal in RecallFrontendView

Mirror Task 5 RecallTab pattern: import + editModal state + handleEdit
useCallback + onEdit prop on RecallList + modal render block.

3rd of 3 surface wires (Backend RecallTab + Frontend RecallFrontendView +
CDV RecallCard — Task 7 next).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 7: Wire RecallCard.jsx (CDV surface)

**Files:**
- Modify: `src/components/backend/customer-recall/RecallCard.jsx`

---

- [ ] **Step 7.1: Read RecallCard.jsx to confirm modal pattern**

Read `src/components/backend/customer-recall/RecallCard.jsx`. Note:
- This is the recall surface inside CustomerDetailView (CDV).
- The customer is already in context — but per user "ทุกที่" requirement, edit modal still applies here.
- recallCases may or may not be available — if not, read parent CDV.jsx to find where it's loaded OR add `useRecallCases` import (universal hook, no branchId).

- [ ] **Step 7.2: Add the same 3 changes as Task 5/6**

Apply the same pattern to `RecallCard.jsx`:

1. Import `RecallEditModal` from `../recall/RecallEditModal.jsx` (note `../` because CDV is in a sibling `customer-recall/` directory).
2. Import `useRecallCases` from `../../../hooks/useRecallCases.js` if not already.
3. Add `editModal` state + `handleEdit` resolver.
4. Add `onEdit={handleEdit}` prop on the local RecallList (or RecallRow if directly rendered).
5. Render `<RecallEditModal>` conditionally at the bottom of the return.

- [ ] **Step 7.3: Run CDV-related tests**

Run: `npm test -- --run tests/customer-detail-view*.test.{js,jsx} tests/phase-29-*.test.{js,jsx}`
Expected: all pass; count unchanged unless tests reference RecallCard onEdit (none should).

- [ ] **Step 7.4: Commit**

```bash
git add src/components/backend/customer-recall/RecallCard.jsx
git commit -m "feat(Phase 29.23 Task 7): wire RecallEditModal in RecallCard (CDV)

Final of 3 surface wires (BE RecallTab + FE RecallFrontendView + CDV
RecallCard). Mirror Task 5/6 pattern: editModal state + handleEdit +
onEdit prop + modal render block.

useRecallCases hook is universal (no branchId); imports cleanly.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 8: RecallCasesAdminPanel — delete button

**Files:**
- Modify: `src/components/backend/recall/RecallCasesAdminPanel.jsx`
- Test: `tests/phase-29-23-recall-cases-admin-delete.test.jsx` (NEW)

---

- [ ] **Step 8.1: Write the failing test**

Create `tests/phase-29-23-recall-cases-admin-delete.test.jsx`:

```jsx
/**
 * Phase 29.23 — RecallCasesAdminPanel delete button RTL tests.
 *
 * Per spec §4.5: 3rd button (after แก้/ซ่อน) — rose-500 accent + confirm
 * dialog + deleteRecallCase + reload + onCasesChanged callback.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const listRecallCasesMock = vi.fn();
const saveRecallCaseMock = vi.fn();
const setRecallCaseHiddenMock = vi.fn();
const deleteRecallCaseMock = vi.fn();

vi.mock('../src/lib/scopedDataLayer.js', async () => {
  const actual = await vi.importActual('../src/lib/scopedDataLayer.js');
  return {
    ...actual,
    listRecallCases: (...args) => listRecallCasesMock(...args),
    saveRecallCase: (...args) => saveRecallCaseMock(...args),
    setRecallCaseHidden: (...args) => setRecallCaseHiddenMock(...args),
    deleteRecallCase: (...args) => deleteRecallCaseMock(...args),
  };
});

vi.mock('../src/firebase.js', () => ({
  auth: { currentUser: { uid: 'test-uid' } },
  db: {},
}));

import { RecallCasesAdminPanel } from '../src/components/backend/recall/RecallCasesAdminPanel.jsx';

const CASES_FIXTURE = [
  { id: 'CASE-1', caseName: 'ติดตามอาการ', defaultDays: 3, isHidden: false },
  { id: 'CASE-2', caseName: 'ครบรอบบริการ', defaultDays: 180, isHidden: false },
];

describe('Phase 29.23 C1 — RecallCasesAdminPanel delete button', () => {
  let confirmSpy;
  beforeEach(() => {
    listRecallCasesMock.mockReset();
    listRecallCasesMock.mockResolvedValue([...CASES_FIXTURE]);
    saveRecallCaseMock.mockReset();
    setRecallCaseHiddenMock.mockReset();
    deleteRecallCaseMock.mockReset();
    deleteRecallCaseMock.mockResolvedValue(undefined);
    // Default confirm spy: returns true (admin clicked OK)
    confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('C1.1 — delete button renders for each case row', async () => {
    render(<RecallCasesAdminPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('recall-case-delete-CASE-1')).toBeInTheDocument();
    });
    expect(screen.getByTestId('recall-case-delete-CASE-2')).toBeInTheDocument();
  });

  it('C1.2 — delete button click → confirm dialog shown with case name', async () => {
    render(<RecallCasesAdminPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('recall-case-delete-CASE-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('recall-case-delete-CASE-1'));
    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(confirmSpy.mock.calls[0][0]).toContain('ติดตามอาการ');
  });

  it('C1.3 — confirm yes → deleteRecallCase called with case id', async () => {
    render(<RecallCasesAdminPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('recall-case-delete-CASE-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('recall-case-delete-CASE-1'));
    await waitFor(() => {
      expect(deleteRecallCaseMock).toHaveBeenCalledTimes(1);
    });
    expect(deleteRecallCaseMock.mock.calls[0][0]).toBe('CASE-1');
  });

  it('C1.4 — confirm cancel → deleteRecallCase NOT called', async () => {
    confirmSpy.mockReturnValueOnce(false);
    render(<RecallCasesAdminPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('recall-case-delete-CASE-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('recall-case-delete-CASE-1'));
    expect(deleteRecallCaseMock).not.toHaveBeenCalled();
  });

  it('C1.5 — onCasesChanged invoked after successful delete', async () => {
    const onCasesChanged = vi.fn();
    render(<RecallCasesAdminPanel onCasesChanged={onCasesChanged} />);
    await waitFor(() => {
      expect(screen.getByTestId('recall-case-delete-CASE-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('recall-case-delete-CASE-1'));
    await waitFor(() => {
      expect(onCasesChanged).toHaveBeenCalled();
    });
  });

  it('C1.6 — delete error → error banner shown', async () => {
    deleteRecallCaseMock.mockRejectedValueOnce(new Error('rules-denied'));
    render(<RecallCasesAdminPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('recall-case-delete-CASE-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('recall-case-delete-CASE-1'));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/rules-denied|ลบไม่สำเร็จ/);
    });
  });

  it('C1.7 — confirm dialog contains "ถาวร" warning + "snapshot" reassurance', async () => {
    render(<RecallCasesAdminPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('recall-case-delete-CASE-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('recall-case-delete-CASE-1'));
    const msg = confirmSpy.mock.calls[0][0];
    expect(msg).toContain('ถาวร');
    expect(msg).toContain('snapshot');
  });

  it('C1.8 — reload called after successful delete (list re-fetched)', async () => {
    render(<RecallCasesAdminPanel />);
    await waitFor(() => {
      expect(screen.getByTestId('recall-case-delete-CASE-1')).toBeInTheDocument();
    });
    // First load counts: 1
    expect(listRecallCasesMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('recall-case-delete-CASE-1'));
    await waitFor(() => {
      // After delete, reload triggers a 2nd listRecallCases call
      expect(listRecallCasesMock).toHaveBeenCalledTimes(2);
    });
  });
});
```

- [ ] **Step 8.2: Run test to verify it fails**

Run: `npm test -- --run tests/phase-29-23-recall-cases-admin-delete.test.jsx`
Expected: FAIL — `recall-case-delete-CASE-1` not in DOM.

- [ ] **Step 8.3: Modify RecallCasesAdminPanel.jsx**

In `src/components/backend/recall/RecallCasesAdminPanel.jsx`:

**(a)** Extend the import at line 2:
```jsx
import { listRecallCases, saveRecallCase, setRecallCaseHidden, deleteRecallCase } from '../../../lib/scopedDataLayer.js';
```

**(b)** Add `handleDelete` after `handleToggleHidden` (around line 79):

```jsx
async function handleDelete(c) {
  const msg = `ลบเคส "${c.caseName}" ถาวร?\n(Recall ที่ใช้ค่าเดิมไม่ได้รับผลกระทบ; เก็บ snapshot ของชื่อไว้แล้ว)`;
  if (!window.confirm(msg)) return;
  try {
    await deleteRecallCase(c.id, { uid: getUid() });
    await reload();
    onCasesChanged?.();
  } catch (e) {
    setError(e?.message || 'ลบไม่สำเร็จ');
  }
}
```

**(c)** Add the delete button to the action cell. Find the row JSX (around lines 154-168) — the `<div className="text-right space-x-2">` block with the แก้ + ซ่อน/คืน buttons. Add a 3rd button at the end:

```jsx
<div className="text-right space-x-2">
  <button
    type="button"
    onClick={() => setEditing(c)}
    className="text-[11px] font-medium text-sky-500 hover:text-sky-600 dark:text-sky-400 dark:hover:text-sky-300 hover:underline"
  >
    แก้
  </button>
  <button
    type="button"
    onClick={() => handleToggleHidden(c)}
    className="text-[11px] font-medium text-amber-500 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-300 hover:underline"
  >
    {c.isHidden ? 'คืน' : 'ซ่อน'}
  </button>
  <button
    type="button"
    onClick={() => handleDelete(c)}
    className="text-[11px] font-medium text-rose-500 hover:text-rose-600 dark:text-rose-400 dark:hover:text-rose-300 hover:underline"
    data-testid={`recall-case-delete-${c.id}`}
  >
    ลบ
  </button>
</div>
```

- [ ] **Step 8.4: Run test to verify it passes**

Run: `npm test -- --run tests/phase-29-23-recall-cases-admin-delete.test.jsx`
Expected: PASS — all 8 tests green.

- [ ] **Step 8.5: Commit**

```bash
git add src/components/backend/recall/RecallCasesAdminPanel.jsx tests/phase-29-23-recall-cases-admin-delete.test.jsx
git commit -m "feat(Phase 29.23 Task 8): RecallCasesAdminPanel delete button

Per spec §4.5: 3rd action button (after แก้/ซ่อน) — rose-500 accent.
window.confirm('ลบเคส ... ถาวร? (Recall ที่ใช้ค่าเดิมไม่ได้รับผลกระทบ;
เก็บ snapshot ของชื่อไว้แล้ว)') — hard delete via deleteRecallCase +
reload + onCasesChanged callback (typeahead source refresh per RB5
pattern).

Error banner via setError if delete fails.

Tests: C1.1-C1.8 (8 RTL assertions) GREEN.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Task 9: Source-grep regression + flow-simulate + Playwright Rule Q L1

**Files:**
- Test: `tests/phase-29-23-source-grep.test.js` (NEW)
- Test: `tests/phase-29-23-flow-simulate.test.js` (NEW)
- Test: `tests/e2e/phase-29-23-recall-edit-real-browser.spec.js` (NEW)

---

- [ ] **Step 9.1: Write source-grep regression tests**

Create `tests/phase-29-23-source-grep.test.js`:

```js
/**
 * Phase 29.23 — source-grep regression locks.
 *
 * Prevents drift on:
 *   - RecallRow customer-name <a target="_blank"> pattern
 *   - RecallRow imports Pencil + has onEdit prop
 *   - RecallEditModal exists + exported
 *   - deleteRecallCase exports from backendClient + scopedDataLayer
 *   - 3 surface wires (RecallTab + RecallFrontendView + RecallCard)
 *     pass onEdit to RecallList
 *   - RecallCasesAdminPanel imports deleteRecallCase
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname || __dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf-8');

describe('Phase 29.23 SG1 — RecallRow customer-name + edit', () => {
  const src = read('src/components/backend/recall/RecallRow.jsx');

  it('SG1.1 — imports Pencil from lucide-react', () => {
    expect(src).toMatch(/import\s*\{[^}]*\bPencil\b[^}]*\}\s*from\s*['"]lucide-react['"]/);
  });

  it('SG1.2 — has onEdit prop in destructure', () => {
    expect(src).toMatch(/onEdit\b/);
    expect(src).toMatch(/onEdit\?\.\(recall\.id\)/);
  });

  it('SG1.3 — customer-name uses <a href=...customer={encoded} target=_blank rel=noopener', () => {
    expect(src).toMatch(/href=\{\s*`\/\?backend=1&customer=\$\{encodeURIComponent\(/);
    expect(src).toMatch(/target="_blank"/);
    expect(src).toMatch(/rel="noopener noreferrer"/);
  });

  it('SG1.4 — customer-name <a> has e.stopPropagation (no parent bubble)', () => {
    // Looser match: there should exist a stopPropagation call inside the row's
    // customer-name <a> region. Slice from "recall-customer-link-" to "</a>".
    const snippet = src.match(/data-testid=`recall-customer-link-[\s\S]+?<\/a>/);
    expect(snippet).toBeTruthy();
    expect(snippet[0]).toMatch(/stopPropagation/);
  });

  it('SG1.5 — has plain <span> fallback when customerId missing', () => {
    expect(src).toMatch(/data-testid=`recall-customer-name-plain-/);
  });

  it('SG1.6 — edit button uses data-testid=recall-edit-{id}', () => {
    expect(src).toMatch(/data-testid=`recall-edit-/);
  });

  it('SG1.7 — edit button stopPropagation on click', () => {
    const snippet = src.match(/data-testid=`recall-edit-[\s\S]+?<\/button>/);
    expect(snippet).toBeTruthy();
    expect(snippet[0]).toMatch(/stopPropagation/);
    expect(snippet[0]).toMatch(/onEdit\(recall\.id\)/);
  });
});

describe('Phase 29.23 SG2 — RecallEditModal exists + exports', () => {
  const src = read('src/components/backend/recall/RecallEditModal.jsx');

  it('SG2.1 — exports named RecallEditModal', () => {
    expect(src).toMatch(/export\s+function\s+RecallEditModal/);
  });

  it('SG2.2 — exports default RecallEditModal', () => {
    expect(src).toMatch(/export\s+default\s+RecallEditModal/);
  });

  it('SG2.3 — imports updateRecall from scopedDataLayer', () => {
    expect(src).toMatch(/import\s*\{[^}]*\bupdateRecall\b[^}]*\}\s*from\s*['"][./]+lib\/scopedDataLayer\.js['"]/);
  });

  it('SG2.4 — uses DateField + RecallCaseSelectField (not raw input)', () => {
    expect(src).toMatch(/import\s+DateField\s+from/);
    expect(src).toMatch(/RecallCaseSelectField/);
  });
});

describe('Phase 29.23 SG3 — deleteRecallCase exports', () => {
  const backendClient = read('src/lib/backendClient.js');
  const scopedDataLayer = read('src/lib/scopedDataLayer.js');

  it('SG3.1 — deleteRecallCase exported from backendClient', () => {
    expect(backendClient).toMatch(/export\s+async\s+function\s+deleteRecallCase/);
  });

  it('SG3.2 — deleteRecallCase universal pass-through in scopedDataLayer', () => {
    expect(scopedDataLayer).toMatch(/export\s+const\s+deleteRecallCase\s*=\s*\(\.\.\.args\)\s*=>\s*raw\.deleteRecallCase/);
  });

  it('SG3.3 — deleteRecallCase uses recallCaseDoc(id) path', () => {
    const match = backendClient.match(/export\s+async\s+function\s+deleteRecallCase[\s\S]{0,200}/);
    expect(match).toBeTruthy();
    expect(match[0]).toMatch(/deleteDoc\(recallCaseDoc\(id\)\)/);
  });

  it('SG3.4 — deleteRecallCase early-returns when id is empty', () => {
    const match = backendClient.match(/export\s+async\s+function\s+deleteRecallCase[\s\S]{0,200}/);
    expect(match[0]).toMatch(/if\s*\(\s*!\s*id\s*\)\s*return/);
  });
});

describe('Phase 29.23 SG4 — 3 surface wires pass onEdit', () => {
  it('SG4.1 — RecallTab passes onEdit to RecallList', () => {
    const src = read('src/components/backend/recall/RecallTab.jsx');
    expect(src).toMatch(/onEdit=\{handleEdit\}/);
    expect(src).toMatch(/RecallEditModal/);
  });

  it('SG4.2 — RecallFrontendView passes onEdit to RecallList', () => {
    const src = read('src/components/backend/recall/RecallFrontendView.jsx');
    expect(src).toMatch(/onEdit=\{handleEdit\}/);
    expect(src).toMatch(/RecallEditModal/);
  });

  it('SG4.3 — RecallCard (CDV) passes onEdit somewhere', () => {
    const src = read('src/components/backend/customer-recall/RecallCard.jsx');
    expect(src).toMatch(/onEdit/);
    expect(src).toMatch(/RecallEditModal/);
  });

  it('SG4.4 — RecallList propagates onEdit to RecallRow', () => {
    const src = read('src/components/backend/recall/RecallList.jsx');
    expect(src).toMatch(/onEdit/);
    expect(src).toMatch(/onEdit=\{onEdit\}/);
  });
});

describe('Phase 29.23 SG5 — RecallCasesAdminPanel imports + uses deleteRecallCase', () => {
  const src = read('src/components/backend/recall/RecallCasesAdminPanel.jsx');

  it('SG5.1 — imports deleteRecallCase from scopedDataLayer', () => {
    expect(src).toMatch(/import\s*\{[^}]*\bdeleteRecallCase\b[^}]*\}\s*from\s*['"][./]+lib\/scopedDataLayer\.js['"]/);
  });

  it('SG5.2 — has handleDelete function', () => {
    expect(src).toMatch(/(function|const)\s+handleDelete/);
  });

  it('SG5.3 — handleDelete calls deleteRecallCase(c.id)', () => {
    expect(src).toMatch(/deleteRecallCase\(c\.id/);
  });

  it('SG5.4 — handleDelete uses window.confirm', () => {
    expect(src).toMatch(/window\.confirm\(/);
  });

  it('SG5.5 — handleDelete calls onCasesChanged on success', () => {
    const match = src.match(/(function|const)\s+handleDelete[\s\S]{0,500}/);
    expect(match[0]).toMatch(/onCasesChanged\?\.\(\)/);
  });

  it('SG5.6 — delete button rose-500 color (destructive accent)', () => {
    expect(src).toMatch(/data-testid=`recall-case-delete-\$\{c\.id\}`[\s\S]{0,200}rose-500/);
  });
});
```

- [ ] **Step 9.2: Run source-grep tests**

Run: `npm test -- --run tests/phase-29-23-source-grep.test.js`
Expected: PASS — all ~22 source-grep assertions green.

- [ ] **Step 9.3: Write Rule I flow-simulate tests**

Create `tests/phase-29-23-flow-simulate.test.js`:

```js
/**
 * Phase 29.23 — Rule I full-flow simulate.
 *
 * Chains the user-visible flow end-to-end:
 *   F1 — edit recall round-trip (row click edit → modal opens → save → updateRecall)
 *   F2 — delete case round-trip (admin panel → confirm → deleteRecallCase → reload)
 *   F3 — customer-name <a> contains backend deep-link URL
 *   F4 — edit on done recall (status='done') — modal opens + save works
 *   F5 — customerId missing → plain <span> fallback (no <a>)
 *   F6 — onEdit prop wired through RecallList → RecallRow
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// Mocks
const updateRecallMock = vi.fn();
const deleteRecallCaseMock = vi.fn();
const listRecallCasesMock = vi.fn();

vi.mock('../src/lib/scopedDataLayer.js', async () => {
  const actual = await vi.importActual('../src/lib/scopedDataLayer.js');
  return {
    ...actual,
    updateRecall: (...args) => updateRecallMock(...args),
    deleteRecallCase: (...args) => deleteRecallCaseMock(...args),
    listRecallCases: (...args) => listRecallCasesMock(...args),
    saveRecallCase: vi.fn().mockResolvedValue(undefined),
    setRecallCaseHidden: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('../src/firebase.js', () => ({
  auth: { currentUser: { uid: 'test-uid' } },
  db: {},
}));

vi.mock('../src/utils.js', async () => {
  const actual = await vi.importActual('../src/utils.js');
  return { ...actual, thaiTodayISO: () => '2026-05-14' };
});

import { RecallRow } from '../src/components/backend/recall/RecallRow.jsx';
import { RecallEditModal } from '../src/components/backend/recall/RecallEditModal.jsx';
import { RecallList } from '../src/components/backend/recall/RecallList.jsx';
import { RecallCasesAdminPanel } from '../src/components/backend/recall/RecallCasesAdminPanel.jsx';

const RECALL_PENDING = {
  id: 'REC-PENDING',
  customerId: 'LC-26000001',
  customerName: 'นายทดสอบ',
  recallDate: '2026-05-20',
  reason: 'ติดตามอาการ',
  status: 'pending',
};

const RECALL_DONE = {
  id: 'REC-DONE',
  customerId: 'LC-26000002',
  customerName: 'นางสาวทดสอบ',
  recallDate: '2026-05-10',
  reason: 'ครบรอบบริการ',
  status: 'done',
};

describe('Phase 29.23 F1 — edit recall round-trip', () => {
  beforeEach(() => {
    updateRecallMock.mockReset();
    updateRecallMock.mockResolvedValue(undefined);
  });

  it('F1.1 — row click edit → onEdit fired with id → modal opens with prefill', async () => {
    let editingRecall = null;
    function Harness() {
      const [editModal, setEditModal] = React.useState(null);
      return (
        <>
          <RecallRow
            recall={RECALL_PENDING}
            todayISO="2026-05-14"
            onEdit={(id) => {
              editingRecall = id;
              setEditModal({ recall: RECALL_PENDING });
            }}
          />
          {editModal && (
            <RecallEditModal
              recall={editModal.recall}
              recallCases={[]}
              onClose={() => setEditModal(null)}
              onSaved={() => setEditModal(null)}
            />
          )}
        </>
      );
    }
    const React = await import('react');
    render(<Harness />);
    fireEvent.click(screen.getByTestId('recall-edit-REC-PENDING'));
    expect(editingRecall).toBe('REC-PENDING');
    await waitFor(() => {
      expect(screen.getByTestId('recall-edit-modal')).toBeInTheDocument();
    });
    expect(screen.getByDisplayValue('ติดตามอาการ')).toBeInTheDocument();
  });

  it('F1.2 — save in modal → updateRecall called with patch + modal closes', async () => {
    const React = await import('react');
    function Harness() {
      const [open, setOpen] = React.useState(true);
      return open ? (
        <RecallEditModal
          recall={RECALL_PENDING}
          recallCases={[]}
          onClose={() => setOpen(false)}
          onSaved={() => setOpen(false)}
        />
      ) : (
        <div data-testid="modal-closed" />
      );
    }
    render(<Harness />);
    fireEvent.click(screen.getByTestId('recall-edit-save'));
    await waitFor(() => {
      expect(updateRecallMock).toHaveBeenCalledWith('REC-PENDING', {
        recallDate: '2026-05-20',
        reason: 'ติดตามอาการ',
      });
    });
    await waitFor(() => {
      expect(screen.getByTestId('modal-closed')).toBeInTheDocument();
    });
  });
});

describe('Phase 29.23 F2 — delete case round-trip', () => {
  beforeEach(() => {
    deleteRecallCaseMock.mockReset();
    deleteRecallCaseMock.mockResolvedValue(undefined);
    listRecallCasesMock.mockReset();
    listRecallCasesMock.mockResolvedValue([
      { id: 'CASE-1', caseName: 'ติดตามอาการ', defaultDays: 3, isHidden: false },
    ]);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('F2.1 — admin panel → click ลบ → confirm → deleteRecallCase + reload + onCasesChanged', async () => {
    const onCasesChanged = vi.fn();
    render(<RecallCasesAdminPanel onCasesChanged={onCasesChanged} />);
    await waitFor(() => {
      expect(screen.getByTestId('recall-case-delete-CASE-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('recall-case-delete-CASE-1'));
    await waitFor(() => {
      expect(deleteRecallCaseMock).toHaveBeenCalledWith('CASE-1', expect.any(Object));
    });
    expect(onCasesChanged).toHaveBeenCalled();
    // Reload should fire (initial load + post-delete reload = 2 calls)
    expect(listRecallCasesMock).toHaveBeenCalledTimes(2);
  });
});

describe('Phase 29.23 F3 — customer-name deep-link', () => {
  it('F3.1 — <a href> contains /?backend=1&customer={encoded id}', () => {
    render(<RecallRow recall={RECALL_PENDING} todayISO="2026-05-14" />);
    const link = screen.getByTestId('recall-customer-link-REC-PENDING');
    expect(link.getAttribute('href')).toMatch(/^\/\?backend=1&customer=LC-26000001$/);
    expect(link.getAttribute('target')).toBe('_blank');
  });
});

describe('Phase 29.23 F4 — edit on done recall', () => {
  beforeEach(() => updateRecallMock.mockReset().mockResolvedValue(undefined));

  it('F4.1 — edit button renders on done recall', () => {
    render(<RecallRow recall={RECALL_DONE} todayISO="2026-05-14" onEdit={() => {}} />);
    expect(screen.getByTestId('recall-edit-REC-DONE')).toBeInTheDocument();
  });

  it('F4.2 — save updateRecall works on done recall', async () => {
    render(
      <RecallEditModal
        recall={RECALL_DONE}
        recallCases={[]}
        onClose={() => {}}
      />
    );
    fireEvent.click(screen.getByTestId('recall-edit-save'));
    await waitFor(() => {
      expect(updateRecallMock).toHaveBeenCalledWith('REC-DONE', {
        recallDate: '2026-05-10',
        reason: 'ครบรอบบริการ',
      });
    });
  });
});

describe('Phase 29.23 F5 — customerId missing fallback', () => {
  it('F5.1 — renders plain <span>, no <a>', () => {
    const recall = { ...RECALL_PENDING, customerId: '' };
    render(<RecallRow recall={recall} todayISO="2026-05-14" />);
    expect(screen.queryByTestId('recall-customer-link-REC-PENDING')).toBeNull();
    expect(screen.getByTestId('recall-customer-name-plain-REC-PENDING')).toBeInTheDocument();
  });
});

describe('Phase 29.23 F6 — onEdit prop wired through RecallList → RecallRow', () => {
  it('F6.1 — onEdit on RecallList propagates to row button', () => {
    const onEdit = vi.fn();
    render(
      <RecallList
        recalls={[RECALL_PENDING]}
        todayISO="2026-05-14"
        onEdit={onEdit}
      />
    );
    fireEvent.click(screen.getByTestId('recall-edit-REC-PENDING'));
    expect(onEdit).toHaveBeenCalledWith('REC-PENDING');
  });
});
```

- [ ] **Step 9.4: Run flow-simulate tests**

Run: `npm test -- --run tests/phase-29-23-flow-simulate.test.js`
Expected: PASS — all 6 (F1-F6) flow tests green.

- [ ] **Step 9.5: Write Rule Q L1 Playwright spec**

Create `tests/e2e/phase-29-23-recall-edit-real-browser.spec.js`:

```js
/**
 * Phase 29.23 — Rule Q L1 Real-Adversarial Verification (V66 mandate).
 *
 * Drives REAL browser against REAL prod Firestore via local-dev (npm run dev).
 * NO mocks. Auth via REST signInWithPassword → idToken → localStorage inject.
 * TEST-RECALL-* fixtures per V33 prefix discipline.
 *
 * Cleanup at end (afterAll).
 *
 * Run: BASE_URL=http://localhost:5173 npx playwright test tests/e2e/phase-29-23-recall-edit-real-browser.spec.js
 */
import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';

// Fixture identifiers
const TEST_RECALL_ID = `TEST-RECALL-29-23-${Date.now()}`;
const TEST_CASE_ID = `TEST-CASE-29-23-${Date.now()}`;

// Helper — inject real Firebase auth into localStorage (real client SDK auth via REST)
async function authAsAdmin(page) {
  const apiKey = process.env.FIREBASE_API_KEY;
  const email = process.env.TEST_ADMIN_EMAIL;
  const password = process.env.TEST_ADMIN_PASSWORD;
  if (!apiKey || !email || !password) {
    test.skip(true, 'Auth env vars missing — set FIREBASE_API_KEY + TEST_ADMIN_EMAIL + TEST_ADMIN_PASSWORD');
    return;
  }
  const resp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const data = await resp.json();
  if (!data.idToken) throw new Error(`Auth failed: ${JSON.stringify(data)}`);
  await page.addInitScript((tok) => {
    const key = Object.keys(localStorage).find(k => k.startsWith('firebase:authUser:'));
    if (!key) {
      localStorage.setItem(`firebase:authUser:${tok.apiKey}:[DEFAULT]`, JSON.stringify({
        uid: tok.localId,
        stsTokenManager: {
          accessToken: tok.idToken,
          refreshToken: tok.refreshToken,
          expirationTime: Date.now() + 3600000,
        },
        email: tok.email,
      }));
    }
  }, { ...data, apiKey });
}

test.describe('Phase 29.23 PB — Rule Q L1 Real-Browser', () => {
  test.beforeEach(async ({ page }) => {
    await authAsAdmin(page);
  });

  test('PB1 — Edit recall in BackendDashboard: modal opens with prefill, save updates listener-driven DOM', async ({ page }) => {
    // Pre-condition: a real recall in be_recalls (TEST-RECALL-* prefix)
    // For brevity this spec assumes a fixture was created via admin-SDK
    // script (mirror Phase 29.22 e2e pattern). If unavailable, skip.
    await page.goto(`${BASE_URL}/?backend=1&tab=recall`);
    await page.waitForLoadState('networkidle');
    const editBtn = page.getByTestId(/^recall-edit-TEST-RECALL-/).first();
    if (await editBtn.count() === 0) {
      test.skip(true, 'No TEST-RECALL fixture in prod — create via admin-SDK script first');
    }
    await editBtn.click();
    await expect(page.getByTestId('recall-edit-modal')).toBeVisible();
    // Save
    await page.getByTestId('recall-edit-save').click();
    await expect(page.getByTestId('recall-edit-modal')).toBeHidden({ timeout: 5000 });
  });

  test('PB2 — Click customer-name → assert new tab opens with backend deep-link', async ({ page, context }) => {
    await page.goto(`${BASE_URL}/?backend=1&tab=recall`);
    await page.waitForLoadState('networkidle');
    const link = page.getByTestId(/^recall-customer-link-/).first();
    if (await link.count() === 0) {
      test.skip(true, 'No recall rows with customer-link visible');
    }
    const [newPage] = await Promise.all([
      context.waitForEvent('page'),
      link.click({ modifiers: ['Control'] }),  // Ctrl+Click for new tab
    ]);
    await newPage.waitForLoadState('domcontentloaded');
    expect(newPage.url()).toContain('backend=1');
    expect(newPage.url()).toContain('customer=');
    await newPage.close();
  });

  test('PB3 — Delete case in admin sub-pill: confirm → row disappears', async ({ page }) => {
    await page.goto(`${BASE_URL}/?backend=1&tab=recall`);
    await page.waitForLoadState('networkidle');
    // Click "จัดการเคส" sub-pill
    await page.getByTestId('recall-subpill-cases').click();
    await expect(page.getByTestId('recall-cases-admin-panel')).toBeVisible();
    const deleteBtn = page.getByTestId(/^recall-case-delete-TEST-CASE-/).first();
    if (await deleteBtn.count() === 0) {
      test.skip(true, 'No TEST-CASE fixture in prod — create via admin-SDK script first');
    }
    // Accept the native confirm dialog
    page.once('dialog', dialog => dialog.accept());
    await deleteBtn.click();
    // Row should disappear after reload
    await expect(deleteBtn).toBeHidden({ timeout: 5000 });
  });

  test('PB4 — Edit on done recall: save still works (admin can fix typos any-status)', async ({ page }) => {
    await page.goto(`${BASE_URL}/?backend=1&tab=recall`);
    await page.waitForLoadState('networkidle');
    // Look for a row with status=done (data-status attribute)
    const doneRow = page.locator('[data-status="done"]').first();
    if (await doneRow.count() === 0) {
      test.skip(true, 'No done recall row visible');
    }
    const editBtn = doneRow.getByTestId(/^recall-edit-/);
    await editBtn.click();
    await expect(page.getByTestId('recall-edit-modal')).toBeVisible();
    await page.getByTestId('recall-edit-save').click();
    await expect(page.getByTestId('recall-edit-modal')).toBeHidden({ timeout: 5000 });
  });

  test('PB5 — Validation: empty reason → save disabled', async ({ page }) => {
    await page.goto(`${BASE_URL}/?backend=1&tab=recall`);
    await page.waitForLoadState('networkidle');
    const editBtn = page.getByTestId(/^recall-edit-/).first();
    if (await editBtn.count() === 0) {
      test.skip(true, 'No recall row visible');
    }
    await editBtn.click();
    await expect(page.getByTestId('recall-edit-modal')).toBeVisible();
    // Clear the reason via the typeahead (assumes RecallCaseSelectField text input)
    const reasonInput = page.locator('[data-field="reason"] input').first();
    await reasonInput.fill('');
    await expect(page.getByTestId('recall-edit-validation-reason')).toBeVisible();
    await expect(page.getByTestId('recall-edit-save')).toBeDisabled();
  });
});
```

- [ ] **Step 9.6: Run Rule Q L1 Playwright (best-effort — skips if no fixtures)**

Per Rule Q (V66), the L1 spec drives the real deployed UI. Prereqs:
1. `npm run dev` running on port 5173 (or set `BASE_URL` env)
2. Env vars: `FIREBASE_API_KEY`, `TEST_ADMIN_EMAIL`, `TEST_ADMIN_PASSWORD`
3. (Optional) Pre-seeded TEST-RECALL-* + TEST-CASE-* fixtures via admin-SDK script (see Phase 29.22 e2e pattern at `scripts/phase-29-22-e2e-real-prod.mjs`)

Run: `BASE_URL=http://localhost:5173 npx playwright test tests/e2e/phase-29-23-recall-edit-real-browser.spec.js --reporter=list`

Expected:
- If fixtures present: 5/5 PASS
- If fixtures missing: tests `skip()` themselves (acceptable per Rule Q L3 fallback — user walkthrough during final manual verification)

If hardware/env can't run Playwright at all → defer L1 to user-trigger during final verification + add a note in the commit message that L1 was deferred.

- [ ] **Step 9.7: Run full vitest suite + build to confirm no regressions across project**

Per Rule N: full suite + build are required at batch end (Phase 29.23 = 9-task batch, not single small fix).

Run: `npm test -- --run`
Expected: 9644 + ~55 net new = ~9699 vitest PASS + 1 skipped. ZERO failures.

Run: `npm run build`
Expected: clean build; BackendDashboard chunk delta < +5 KB.

- [ ] **Step 9.8: Commit Task 9 deliverables**

```bash
git add tests/phase-29-23-source-grep.test.js tests/phase-29-23-flow-simulate.test.js tests/e2e/phase-29-23-recall-edit-real-browser.spec.js
git commit -m "test(Phase 29.23 Task 9): source-grep + flow-simulate + Rule Q L1 Playwright

Layer 3 source-grep regression bank (SG1-SG5, ~22 assertions):
- RecallRow customer-name <a target=_blank rel=noopener> pattern locked
- RecallRow Pencil import + onEdit prop locked
- RecallEditModal exists + exports + updateRecall import + DateField+
  RecallCaseSelectField usage
- deleteRecallCase exported from backendClient + scopedDataLayer (3
  invariants: name + path + early-return)
- 3 surface wires (RecallTab + RecallFrontendView + RecallCard) pass
  onEdit + RecallList propagates
- RecallCasesAdminPanel handleDelete shape locked

Layer 4 Rule I flow-simulate (F1-F6, 6 assertions):
- F1 edit recall round-trip (row click edit → modal opens with prefill →
  save → updateRecall called with patch + modal closes)
- F2 delete case round-trip (admin panel → confirm → deleteRecallCase →
  reload + onCasesChanged)
- F3 customer-name deep-link URL contains /?backend=1&customer={encoded}
- F4 edit on done recall — modal opens + save works
- F5 customerId missing → plain <span> fallback
- F6 onEdit prop wired through RecallList → RecallRow

Layer 5 Rule Q V66 L1 Playwright (PB1-PB5, 5 real-browser tests):
- PB1 edit recall — full round-trip with real prod
- PB2 customer-name Ctrl+Click opens new tab with /?backend=1&customer
- PB3 delete case in admin sub-pill → row disappears
- PB4 edit on done recall — save works
- PB5 validation — empty reason → save disabled

Tests skip when no TEST- prefixed fixtures present in prod. Run after
seeding via admin-SDK script.

Total Phase 29.23 test delta: +~55 vitest + 5 Playwright. Cumulative:
9644 → ~9699 vitest + 12 → 17 Playwright e2e.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Self-review checklist (run at end of plan)

After all 9 tasks complete:

- [ ] **Spec coverage**: every section in `2026-05-14-phase-29-23-*-design.md` mapped to a task above?
  - §4.1 RecallEditModal → Task 2 ✓
  - §4.2 RecallRow changes → Task 3 ✓
  - §4.3 RecallList → Task 4 ✓
  - §4.4 3 surface wirings → Tasks 5+6+7 ✓
  - §4.5 deleteRecallCase + RecallCasesAdminPanel → Tasks 1+8 ✓
  - §9 5-layer testing → Tasks 1,2,3,8 (layers 1-2) + Task 9 (layers 3-5) ✓
  - §15 Rule Q compliance → Task 9.5 Playwright PB1-PB5 ✓
- [ ] **Bundle delta**: chunk size check after Task 9 — `npm run build` shows BackendDashboard delta < +5 KB?
- [ ] **9644 + ~55 = ~9699 vitest** PASS + 1 skipped + **+5 Playwright** = 17 e2e? Build clean?
- [ ] **Active.md updated** with `master = <last commit sha>` + new test count?
- [ ] **No deploy this session** — Phase 29.23 awaits explicit user "deploy" verb per V18 lock.

---

## Execution handoff

Plan complete and saved to [`docs/superpowers/plans/2026-05-14-phase-29-23-recall-row-edit-and-delete.md`](docs/superpowers/plans/2026-05-14-phase-29-23-recall-row-edit-and-delete.md).

**Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task (Tasks 1-9), with two-stage review between each. Fastest iteration; protects main-context. Best for 9 sequential tasks with clear boundaries.

**2. Inline Execution** — Execute all tasks in this current session via `Skill(executing-plans)`. Single session; user reviews at task boundaries.

**Which approach?**
