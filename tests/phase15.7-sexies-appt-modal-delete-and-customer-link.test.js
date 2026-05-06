// Phase 15.7-sexies (2026-04-28) — AppointmentFormModal delete button
//
// User directive (still active): "มีปุ่มลบนัดหมายด้วย กดแล้วก็ลบนัดนั้น
// ทิ้งไปเลย" — admin can delete a booking directly from the calendar
// edit modal.
//
// NOTE: Phase 15.7-septies (2026-04-29) REVISED the customer-name link
// behavior — it now opens a new browser tab via <a target="_blank">
// instead of an in-page redirect callback. The customer-link tests that
// originally lived in this file have been MOVED to
// `tests/phase15.7-septies-customer-link-new-tab.test.js`.
// This file now only covers the delete button (which is unchanged).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(import.meta.dirname || __dirname, '..');
const ModalSrc = readFileSync(path.join(REPO_ROOT, 'src/components/backend/AppointmentFormModal.jsx'), 'utf-8');
const TabSrc = readFileSync(path.join(REPO_ROOT, 'src/components/backend/AppointmentCalendarView.jsx'), 'utf-8');
const DetailSrc = readFileSync(path.join(REPO_ROOT, 'src/components/backend/CustomerDetailView.jsx'), 'utf-8');

describe('Phase 15.7-sexies — Appointment modal delete button', () => {
  describe('SX1 — AppointmentFormModal accepts onDelete prop', () => {
    it('SX1.1 modal destructures onDelete from props', () => {
      const sig = ModalSrc.match(/export default function AppointmentFormModal\(\{[\s\S]+?\}\)/);
      expect(sig).toBeTruthy();
      expect(sig[0]).toMatch(/onDelete/);
    });

    it('SX1.2 JSDoc documents onDelete prop', () => {
      expect(ModalSrc).toMatch(/@param\s+\{\(\)\s*=>\s*Promise<void>\s*\|\s*void\}\s+\[?props\.onDelete\]?/);
    });

    it('SX1.3 Phase 15.7-sexies marker comment present', () => {
      expect(ModalSrc).toMatch(/Phase 15\.7-sexies/);
    });
  });

  describe('SX3 — Delete button (edit mode only)', () => {
    it('SX3.1 delete button gated on (mode === "edit" && onDelete)', () => {
      expect(ModalSrc).toMatch(/mode\s*===\s*'edit'\s*&&\s*onDelete/);
    });

    it('SX3.2 delete button has data-testid="appointment-form-delete"', () => {
      expect(ModalSrc).toMatch(/data-testid="appointment-form-delete"/);
    });

    it('SX3.3 delete button uses confirm() before invoking onDelete', () => {
      const wider = ModalSrc.split('data-testid="appointment-form-delete"')[0];
      expect(wider.slice(-1500)).toMatch(/window\.confirm\([^)]*ลบนัดหมาย/);
      expect(wider.slice(-1500)).toMatch(/await onDelete\(\)/);
    });

    it('SX3.4 delete button uses red color scheme (destructive action)', () => {
      const wider = ModalSrc.split('data-testid="appointment-form-delete"')[0];
      expect(wider.slice(-1500)).toMatch(/text-red-400|bg-red-900/);
    });

    it('SX3.5 delete button uses Trash2 icon from lucide-react', () => {
      expect(ModalSrc).toMatch(/Trash2/);
      expect(ModalSrc).toMatch(/Trash2,?\s*\}\s*from\s*'lucide-react'/);
    });

    it('SX3.6 delete button positioned LEFT (separated from save/cancel pair via flex-1 spacer)', () => {
      const after = ModalSrc.split('data-testid="appointment-form-delete"')[1] || '';
      expect(after.slice(0, 1500)).toMatch(/<div className="flex-1"\s*\/>/);
    });

    it('SX3.7 delete handler sets saving state during onDelete call (race guard)', () => {
      const wider = ModalSrc.split('data-testid="appointment-form-delete"')[0];
      expect(wider.slice(-1500)).toMatch(/setSaving\(true\)/);
    });
  });

  describe('SX4 — AppointmentTab wires onDelete to modal', () => {
    it('SX4.1 imports deleteBackendAppointment from scopedDataLayer (BSA Task 6)', () => {
      expect(TabSrc).toMatch(/deleteBackendAppointment/);
      // BSA Task 6: UI imports backendClient via scopedDataLayer Layer 2
      const importBlock = TabSrc.match(/import\s*\{[\s\S]+?\}\s*from\s+['"]\.\.\/\.\.\/lib\/scopedDataLayer[^'"]*['"]/);
      expect(importBlock).toBeTruthy();
      expect(importBlock[0]).toMatch(/deleteBackendAppointment/);
    });

    it('SX4.2 modal receives onDelete prop (edit-mode-only conditional)', () => {
      const modalBlock = TabSrc.match(/<AppointmentFormModal[\s\S]+?\/>/);
      expect(modalBlock).toBeTruthy();
      expect(modalBlock[0]).toMatch(/onDelete=\{formMode\.mode\s*===\s*'edit'/);
      expect(modalBlock[0]).toMatch(/deleteBackendAppointment\(/);
    });

    it('SX4.3 onDelete closes the modal after delete (setFormMode(null))', () => {
      const modalBlock = TabSrc.match(/<AppointmentFormModal[\s\S]+?\/>/);
      expect(modalBlock).toBeTruthy();
      const onDeleteArrow = modalBlock[0].match(/onDelete=\{formMode\.mode === 'edit' && formMode\.appt \? async \(\) => \{[\s\S]+?\}\s*:\s*undefined\}/);
      expect(onDeleteArrow).toBeTruthy();
      expect(onDeleteArrow[0]).toMatch(/setFormMode\(null\)/);
    });
  });

  describe('SX6 — CustomerDetailView modal usage UNCHANGED (anti-regression)', () => {
    it('SX6.1 CustomerDetailView <AppointmentFormModal> does NOT pass onDelete', () => {
      // CustomerDetailView already has its own cancel button outside the modal.
      const modalBlock = DetailSrc.match(/<AppointmentFormModal[\s\S]+?\/>/);
      expect(modalBlock).toBeTruthy();
      expect(modalBlock[0]).not.toMatch(/onDelete=/);
    });

    it('SX6.2 CustomerDetailView <AppointmentFormModal> does NOT pass enableCustomerLink', () => {
      // We're already on the customer page — link would be a no-op.
      const modalBlock = DetailSrc.match(/<AppointmentFormModal[\s\S]+?\/>/);
      expect(modalBlock).toBeTruthy();
      expect(modalBlock[0]).not.toMatch(/enableCustomerLink/);
    });
  });

  describe('SX7 — Functional simulate (delete callback shape)', () => {
    function simulateDelete(formMode, deleteImpl, setFormMode) {
      if (!(formMode.mode === 'edit' && formMode.appt)) return undefined;
      return async () => {
        const id = formMode.appt.appointmentId || formMode.appt.id;
        if (!id) return;
        await deleteImpl(id);
        setFormMode(null);
      };
    }

    it('SX7.1 — simulateDelete returns undefined when not in edit mode', () => {
      expect(simulateDelete({ mode: 'create' }, () => {}, () => {})).toBeUndefined();
    });

    it('SX7.2 — simulateDelete returns async fn when in edit mode + appt', () => {
      const fn = simulateDelete({ mode: 'edit', appt: { id: 'A1' } }, () => {}, () => {});
      expect(typeof fn).toBe('function');
    });

    it('SX7.3 — delete fn calls deleteImpl with id then closes modal', async () => {
      const calls = [];
      const fn = simulateDelete(
        { mode: 'edit', appt: { appointmentId: 'BA-123' } },
        async (id) => { calls.push(['delete', id]); },
        () => { calls.push(['close']); },
      );
      await fn();
      expect(calls).toEqual([['delete', 'BA-123'], ['close']]);
    });

    it('SX7.4 — delete fn no-ops when appt has no id (defensive)', async () => {
      const calls = [];
      const fn = simulateDelete(
        { mode: 'edit', appt: { /* no id */ } },
        async () => { calls.push('delete'); },
        () => { calls.push('close'); },
      );
      await fn();
      expect(calls).toEqual([]);
    });
  });
});
