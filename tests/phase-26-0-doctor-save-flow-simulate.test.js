import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Phase 26.0 Rule I full-flow simulate
 *
 * Pure simulator that mirrors TFP handleSubmit gate logic per the
 * Phase 26.0 spec § 5.1 + plan Task 2/3/4/5. Validates the
 * doctor-save → admin-finalize round-trip end-to-end. No React mount;
 * no real Firestore. Tests the SHAPE of writes + the ROUTING of gates.
 *
 * Anti-V12 mirror: pure simulator chains every step the user exercises
 * (doctor save → admin opens edit → canAddNewItems unlocks → admin adds
 * items → admin saves) and asserts the cumulative state. Mirrors the
 * V52/V53/V54 Rule I flow-simulate pattern (BranchProvider chain).
 *
 * Source-grep anchors at F2.1 + F7.1 + F8.1 verify the real TFP file
 * agrees with the simulator's assumptions (defense-in-depth — simulator
 * + source must agree, else the simulator has drifted).
 */

const TFP_PATH = join(process.cwd(), 'src/components/TreatmentFormPage.jsx');
const TFP_SOURCE = readFileSync(TFP_PATH, 'utf-8');

// ─── Pure simulator: mirrors handleSubmit gate logic ─────────────────
function simulateHandleSubmit({ saveMode, mode, isEdit, formData, existingTreatment = null, hasSale, editorContext = null }) {
  // Returns { writes: [...], skipped: [...] } describing what fired
  const writes = [];
  const skipped = [];

  // status stamping (mirrors v26StatusPatch in TFP line ~2221)
  const statusPatch = saveMode === 'doctor'
    ? {
        status: 'doctor-recorded',
        // Edit-mode doctor-save (not UI-reachable per § 5.1.F): preserve
        // existing recordedBy/At via proxy signal `loadedTreatmentStatus`
        // (Task 1 state). For create-mode + first-time doctor-save: stamp uid + now.
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

  writes.push({ kind: 'treatment-doc', op: isEdit ? 'update' : 'create', patch: statusPatch });

  // Gate 1 — Course over-deduction validation
  if (saveMode !== 'doctor') {
    writes.push({ kind: 'course-validation', op: 'check' });
  } else {
    skipped.push('course-validation');
  }

  // Gate 2 — Course deductions (reverse + new)
  if (saveMode !== 'doctor' && (formData.treatmentItems?.length || 0) > 0) {
    if (isEdit) writes.push({ kind: 'reverseCourseDeduction', op: 'reverse' });
    writes.push({ kind: 'deductCourseItems', op: 'deduct', items: formData.treatmentItems });
  } else if (saveMode === 'doctor') {
    skipped.push('deductCourseItems');
  }

  // Gate 3 — Consumables stock (type 6)
  if (saveMode !== 'doctor' && (formData.consumables?.length || 0) > 0) {
    writes.push({ kind: 'deductStockForTreatment-consumables', op: 'deduct', type: 6 });
  } else if (saveMode === 'doctor') {
    skipped.push('deductStockForTreatment-consumables');
  }

  // Sanctioned exception — Medications stock (type 7), KEPT for both saveModes per Q2
  if ((formData.medications?.length || 0) > 0 && !hasSale) {
    writes.push({ kind: 'deductStockForTreatment-meds', op: 'deduct', type: 7 });
  }

  // Gate 4 — Auto-sale chain
  if (saveMode !== 'doctor' && hasSale && !isEdit) {
    writes.push({ kind: 'createBackendSale', op: 'create' });
    writes.push({ kind: 'assignCourseToCustomer', op: 'assign' });
    if (formData.depositId) writes.push({ kind: 'applyDepositToSale', op: 'apply' });
    if (formData.walletAmount) writes.push({ kind: 'deductWallet', op: 'deduct' });
    if (formData.earnPointsAmount) writes.push({ kind: 'earnPoints', op: 'earn' });
  } else if (saveMode === 'doctor' && hasSale) {
    skipped.push('createBackendSale-chain');
  }

  // Gate 5 — Edit-mode sale sync
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
    it('F2.1 — canAddNewItems flag definition in source matches spec semantics', () => {
      expect(TFP_SOURCE).toMatch(/canAddNewItems\s*=\s*\(\s*mode\s*===\s*['"]create['"]\s*\)\s*\|\|\s*\(\s*loadedTreatmentStatus\s*===\s*['"]doctor-recorded['"]/);
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

    it('F3.2 — admin save clears status via deleteField + PRESERVES recordedBy/At (forensic trail)', () => {
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

  describe('F5 — admin adds purchasedItems + saves: sale chain routes correctly', () => {
    it('F5.1 — edit mode + no existing linkedSaleId: editModeSaleSync NOT fired (sim simplification)', () => {
      // NOTE: Real TFP edit-mode-with-no-existing-sale handles this via the
      // edit-mode sale sync block (lines 2390-2600) which creates a new sale.
      // Simulator captures the routing decision; runtime handles the create.
      const result = simulateHandleSubmit({
        saveMode: 'staff', mode: 'edit', isEdit: true,
        existingTreatment: { id: 'TR-1', status: 'doctor-recorded', linkedSaleId: null },
        formData: {
          treatmentItems: [], consumables: [], medications: [],
          purchasedItems: [{ id: 'p1' }],
        },
        hasSale: true,
      });
      const editSync = result.writes.find(w => w.kind === 'editModeSaleSync');
      expect(editSync).toBeUndefined();  // no existing sale → routes through create path at runtime
    });

    it('F5.2 — edit mode + existing linkedSaleId: editModeSaleSync fires', () => {
      const result = simulateHandleSubmit({
        saveMode: 'staff', mode: 'edit', isEdit: true,
        existingTreatment: { id: 'TR-1', status: 'doctor-recorded', linkedSaleId: 'SALE-123' },
        formData: { treatmentItems: [], consumables: [], medications: [], purchasedItems: [] },
        hasSale: false,
      });
      const editSync = result.writes.find(w => w.kind === 'editModeSaleSync');
      expect(editSync).toBeDefined();
    });
  });

  describe('F6 — idempotency: re-save admin without new items', () => {
    it('F6.1 — admin re-saves with same form state: no double-deduct', () => {
      // First admin save (status cleared on this commit)
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
        existingTreatment: { id: 'TR-1', status: undefined },  // cleared by r1
        formData: { treatmentItems: [{ id: 't1', qty: 1 }], consumables: [], medications: [], purchasedItems: [] },
        hasSale: false,
      });
      // Edit-mode reverse + re-deduct (existing TFP semantics — V19 stockChanged contract handles real diff at runtime)
      const deducts2 = r2.writes.filter(w => w.kind === 'deductCourseItems');
      const reverses2 = r2.writes.filter(w => w.kind === 'reverseCourseDeduction');
      expect(deducts2).toHaveLength(1);
      expect(reverses2).toHaveLength(1);
    });
  });

  describe('F7 — adversarial: doctor-save invocation in edit mode', () => {
    it('F7.1 — doctor-save button is always visible (Phase 27.2-bis: gate removed for re-edit)', () => {
      // Phase 27.2-bis (2026-05-14) — user directive: doctor-save button no
      // longer gated; admin can re-save doctor info at any time. Each click
      // updates doctorRecordedAt to the latest save time. Mirror V21 fixup
      // from D1.3 in phase-26-0-status-display-rtl.test.jsx.
      const btnIdx = TFP_SOURCE.indexOf('tfp-doctor-save-btn');
      expect(btnIdx).toBeGreaterThan(-1);
      const before = TFP_SOURCE.slice(Math.max(0, btnIdx - 600), btnIdx);
      // Old conditional gate must NOT appear immediately above
      expect(before).not.toMatch(/\(\s*!isEdit\s*\|\|\s*loadedTreatmentStatus\s*===\s*['"]vitalsigns-recorded['"]\s*\)\s*&&\s*\(\s*\n\s*<div/);
      // Phase 27.2-bis marker comment present near button
      expect(before).toMatch(/Phase 27\.2-bis/);
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

    it('F7.3 — non-doctor / non-staff saveMode value coerces to staff (defensive)', () => {
      // Phase 26.0a (V26.0): single-line ternary
      //   `const saveMode = (eventOrSaveMode === 'doctor') ? 'doctor' : 'staff'`
      // Phase 26.1c (V26.1, 2026-05-13): expanded to a let-based branch tree
      // to support a 2nd object form `{saveMode, editorContext}` for the
      // EditAttributionModal internal re-invoke. The defensive coercion
      // semantic is PRESERVED: any string other than 'doctor' → 'staff';
      // any non-string non-object → 'staff' (untouched default).
      //
      // V21-class fixup (Phase 26.2f Task 2): test pattern updated to lock the
      // new canonical shape after vitals coercion branch was added.
      // The chained ternary is now:
      //   (eventOrSaveMode === 'doctor') ? 'doctor'
      //   : (eventOrSaveMode === 'vitals') ? 'vitals'
      //   : 'staff'
      // Defensive contract preserved: anything other than 'doctor'/'vitals' → 'staff'.
      expect(TFP_SOURCE).toMatch(/let\s+saveMode\s*=\s*['"]staff['"]/);
      // Lock: 'doctor' branch still present in string-coercion path
      expect(TFP_SOURCE).toMatch(/eventOrSaveMode\s*===\s*['"]doctor['"]\s*\)\s*\?\s*['"]doctor['"]/);
      // Lock: 'vitals' branch now present too (Phase 26.2f Task 2)
      expect(TFP_SOURCE).toMatch(/eventOrSaveMode\s*===\s*['"]vitals['"]\s*\)\s*\?\s*['"]vitals['"]/);
      // Lock: final fallback is 'staff'
      expect(TFP_SOURCE).toMatch(/:\s*['"]staff['"]/);
    });
  });

  describe('F8 — backward-compat: legacy edit (status=undefined) behaves unchanged', () => {
    it('F8.1 — legacy edit + staff save: full deduction flow + status patch is deleteField (idempotent)', () => {
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
      // Status patch is deleteField (no-op on legacy doc with no status field)
      const tw = result.writes.find(w => w.kind === 'treatment-doc');
      expect(tw.patch.status).toBe('<deleteField>');
    });

    it('F8.2 — legacy edit + doctor save (non-UI-reachable): stamps fresh recordedBy/At', () => {
      // Legacy doc has no status → existingTreatment?.status !== 'doctor-recorded'
      // → recordedBy/At stamped fresh (no prior forensic trail to preserve)
      const result = simulateHandleSubmit({
        saveMode: 'doctor', mode: 'edit', isEdit: true,
        existingTreatment: { id: 'TR-OLD', status: undefined },
        formData: { treatmentItems: [], consumables: [], medications: [], purchasedItems: [] },
        hasSale: false,
      });
      const tw = result.writes.find(w => w.kind === 'treatment-doc');
      expect(tw.patch.status).toBe('doctor-recorded');
      expect(tw.patch.recordedBy).toBe('test-uid-mock');
      expect(tw.patch.recordedAt).toBe('<serverTimestamp>');
    });
  });

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
      const tw = result.writes.find(w => w.kind === 'treatment-doc');
      expect(tw).toBeDefined();
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
      expect(result.stage).not.toBe('modal-opened');
      const tw = result.writes.find(w => w.kind === 'treatment-doc');
      expect(tw.patch.status).toBe('doctor-recorded');
    });

    it('F9.4 — create mode bypasses modal (mode=create skips needsEditorAttribution)', () => {
      const result = simulateEditSaveWithModal({
        saveMode: 'staff', mode: 'create', isEdit: false,
        formData: { treatmentItems: [], consumables: [], medications: [], purchasedItems: [] },
        editorContext: null,
      });
      expect(result.stage).not.toBe('modal-opened');
      const tw = result.writes.find(w => w.kind === 'treatment-doc');
      expect(tw.patch.editedBy).toBeUndefined();
    });

    it('F9.5 — Phase 26.0 v26StatusPatch contract preserved (status cleared on staff save)', () => {
      const result = simulateEditSaveWithModal({
        saveMode: 'staff', mode: 'edit', isEdit: true,
        existingTreatment: { id: 'TR-1', status: 'doctor-recorded' },
        formData: { treatmentItems: [], consumables: [], medications: [], purchasedItems: [] },
        editorContext: { uid: 'doc-1', name: 'หมอมายด์', role: 'doctor' },
      });
      const tw = result.writes.find(w => w.kind === 'treatment-doc');
      expect(tw.patch.status).toBe('<deleteField>');
      expect(tw.patch.editedByName).toBe('หมอมายด์');
    });
  });
});
