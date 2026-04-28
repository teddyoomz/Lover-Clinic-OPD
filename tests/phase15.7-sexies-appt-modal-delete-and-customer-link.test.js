// Phase 15.7-sexies (2026-04-28) — AppointmentFormModal delete button + clickable customer name
//
// User directives:
//   1. "มีปุ่มลบนัดหมายด้วย กดแล้วก็ลบนัดนั้นทิ้งไปเลย"
//      → Add a delete button to the appointment edit modal so admin can
//        delete a booking directly from the calendar grid (instead of
//        finding the row in CustomerDetailView).
//   2. "ชื่อลูกค้าสามารถกดแล้วเปิด tab ข้อมูลลูกค้าคนนั้นมาได้เลย"
//      → Customer name in the modal becomes a link that opens the
//        customer's detail tab.
//
// Implementation:
//   - AppointmentFormModal accepts NEW optional props onDelete + onOpenCustomer.
//     Both are GATED (button/link only renders when prop is provided).
//   - AppointmentTab wires both: deleteBackendAppointment for delete,
//     forwards onOpenCustomer prop received from BackendDashboard.
//   - BackendDashboard injects onOpenCustomer: fetches customer + sets
//     viewingCustomer + activeTab='customers' (mirrors URL-driven flow).
//   - CustomerDetailView keeps its existing modal usage UNCHANGED — props
//     are optional, omitted there → static text + no delete button.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(import.meta.dirname || __dirname, '..');
const ModalSrc = readFileSync(path.join(REPO_ROOT, 'src/components/backend/AppointmentFormModal.jsx'), 'utf-8');
const TabSrc = readFileSync(path.join(REPO_ROOT, 'src/components/backend/AppointmentTab.jsx'), 'utf-8');
const DashboardSrc = readFileSync(path.join(REPO_ROOT, 'src/pages/BackendDashboard.jsx'), 'utf-8');
const DetailSrc = readFileSync(path.join(REPO_ROOT, 'src/components/backend/CustomerDetailView.jsx'), 'utf-8');

describe('Phase 15.7-sexies — Appointment modal delete + customer link', () => {
  describe('SX1 — AppointmentFormModal accepts new props', () => {
    it('SX1.1 modal destructures onOpenCustomer + onDelete from props', () => {
      // Anchor on the function signature destructure block
      const sig = ModalSrc.match(/export default function AppointmentFormModal\(\{[\s\S]+?\}\)/);
      expect(sig).toBeTruthy();
      expect(sig[0]).toMatch(/onOpenCustomer/);
      expect(sig[0]).toMatch(/onDelete/);
    });

    it('SX1.2 JSDoc documents both new props', () => {
      expect(ModalSrc).toMatch(/@param\s+\{\(customerId:\s*string\)\s*=>\s*void\}\s+\[?props\.onOpenCustomer\]?/);
      expect(ModalSrc).toMatch(/@param\s+\{\(\)\s*=>\s*Promise<void>\s*\|\s*void\}\s+\[?props\.onDelete\]?/);
    });

    it('SX1.3 Phase 15.7-sexies marker comment present', () => {
      expect(ModalSrc).toMatch(/Phase 15\.7-sexies/);
    });
  });

  describe('SX2 — Customer name is clickable when onOpenCustomer provided', () => {
    it('SX2.1 clickable customer-name button gated on (onOpenCustomer && customerId)', () => {
      expect(ModalSrc).toMatch(/onOpenCustomer\s*&&\s*formData\.customerId/);
    });

    it('SX2.2 clickable button calls onOpenCustomer with formData.customerId', () => {
      // The onClick passes customerId in
      expect(ModalSrc).toMatch(/onOpenCustomer\(formData\.customerId\)/);
    });

    it('SX2.3 clickable button has data-testid="appt-modal-open-customer"', () => {
      expect(ModalSrc).toMatch(/data-testid="appt-modal-open-customer"/);
    });

    it('SX2.4 fallback to static span when onOpenCustomer absent (CustomerDetailView path unchanged)', () => {
      // The ternary's else branch renders a non-interactive span
      const block = ModalSrc.match(/onOpenCustomer\s*&&\s*formData\.customerId\s*\?[\s\S]+?<span className="text-xs text-\[var\(--tx-heading\)\] font-bold">/);
      expect(block).toBeTruthy();
    });

    it('SX2.5 e.stopPropagation on button click (so backdrop click handler doesn\'t close modal)', () => {
      const block = ModalSrc.match(/onClick=\{\(e\)\s*=>\s*\{[\s\S]{0,200}onOpenCustomer\(formData\.customerId\)/);
      expect(block).toBeTruthy();
      expect(block[0]).toMatch(/e\.stopPropagation\(\)/);
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
      const block = ModalSrc.match(/data-testid="appointment-form-delete"[\s\S]{0,200}/);
      expect(block).toBeTruthy();
      // confirm + onDelete pattern lives BEFORE the data-testid in the source —
      // grep the surrounding 1500 chars instead
      const wider = ModalSrc.split('data-testid="appointment-form-delete"')[0];
      expect(wider.slice(-1500)).toMatch(/window\.confirm\([^)]*ลบนัดหมาย/);
      expect(wider.slice(-1500)).toMatch(/await onDelete\(\)/);
    });

    it('SX3.4 delete button uses red color scheme (destructive action)', () => {
      const block = ModalSrc.match(/data-testid="appointment-form-delete"[\s\S]{0,400}/);
      expect(block).toBeTruthy();
      // Search the surrounding source for the red classes
      const wider = ModalSrc.split('data-testid="appointment-form-delete"')[0];
      expect(wider.slice(-1500)).toMatch(/text-red-400|bg-red-900/);
    });

    it('SX3.5 delete button uses Trash2 icon from lucide-react', () => {
      expect(ModalSrc).toMatch(/Trash2/);
      // Imported in the lucide-react named-import block
      expect(ModalSrc).toMatch(/Trash2,?\s*\}\s*from\s*'lucide-react'/);
    });

    it('SX3.6 delete button positioned LEFT (separated from save/cancel pair via flex-1 spacer)', () => {
      // The footer adds <div className="flex-1" /> between delete and the
      // right-side cancel/save group. Visual + accidental-click guard.
      const wider = ModalSrc.split('data-testid="appointment-form-delete"')[0];
      const after = ModalSrc.split('data-testid="appointment-form-delete"')[1] || '';
      // The flex-1 spacer should appear shortly after the button definition
      expect(after.slice(0, 1500)).toMatch(/<div className="flex-1"\s*\/>/);
    });

    it('SX3.7 delete handler sets saving state during onDelete call (race guard)', () => {
      const wider = ModalSrc.split('data-testid="appointment-form-delete"')[0];
      expect(wider.slice(-1500)).toMatch(/setSaving\(true\)/);
    });
  });

  describe('SX4 — AppointmentTab wires onDelete + onOpenCustomer to modal', () => {
    it('SX4.1 imports deleteBackendAppointment from backendClient', () => {
      expect(TabSrc).toMatch(/deleteBackendAppointment/);
      // Must be in the named-import block. Search for `import {...}` block
      // that ends with `from '../../lib/backendClient.js'`.
      const importBlock = TabSrc.match(/import\s*\{[\s\S]+?\}\s*from\s+['"]\.\.\/\.\.\/lib\/backendClient[^'"]*['"]/);
      expect(importBlock).toBeTruthy();
      expect(importBlock[0]).toMatch(/deleteBackendAppointment/);
    });

    it('SX4.2 AppointmentTab accepts onOpenCustomer prop', () => {
      expect(TabSrc).toMatch(/AppointmentTab\(\{[^}]*onOpenCustomer[^}]*\}\)/);
    });

    it('SX4.3 modal receives onDelete prop (edit-mode-only conditional)', () => {
      const modalBlock = TabSrc.match(/<AppointmentFormModal[\s\S]+?\/>/);
      expect(modalBlock).toBeTruthy();
      expect(modalBlock[0]).toMatch(/onDelete=\{formMode\.mode\s*===\s*'edit'/);
      expect(modalBlock[0]).toMatch(/deleteBackendAppointment\(/);
    });

    it('SX4.4 onDelete closes the modal after delete (setFormMode(null))', () => {
      const modalBlock = TabSrc.match(/<AppointmentFormModal[\s\S]+?\/>/);
      expect(modalBlock).toBeTruthy();
      // The onDelete arrow fn calls setFormMode(null) after the delete
      const onDeleteArrow = modalBlock[0].match(/onDelete=\{formMode\.mode === 'edit' && formMode\.appt \? async \(\) => \{[\s\S]+?\}\s*:\s*undefined\}/);
      expect(onDeleteArrow).toBeTruthy();
      expect(onDeleteArrow[0]).toMatch(/setFormMode\(null\)/);
    });

    it('SX4.5 onOpenCustomer is forwarded conditionally (gates on prop existence)', () => {
      const modalBlock = TabSrc.match(/<AppointmentFormModal[\s\S]+?\/>/);
      expect(modalBlock).toBeTruthy();
      expect(modalBlock[0]).toMatch(/onOpenCustomer=\{onOpenCustomer\s*\?\s*\(customerId\)/);
      expect(modalBlock[0]).toMatch(/onOpenCustomer\(customerId\)/);
    });

    it('SX4.6 onOpenCustomer closes the modal before navigating', () => {
      const modalBlock = TabSrc.match(/<AppointmentFormModal[\s\S]+?\/>/);
      // Closing the modal first means the customer page is visible without a
      // stacking glitch.
      const onOpenArrow = modalBlock[0].match(/onOpenCustomer=\{onOpenCustomer\s*\?\s*\(customerId\)\s*=>\s*\{[\s\S]+?\}\s*:\s*undefined\}/);
      expect(onOpenArrow).toBeTruthy();
      expect(onOpenArrow[0]).toMatch(/setFormMode\(null\)/);
    });
  });

  describe('SX5 — BackendDashboard injects onOpenCustomer to AppointmentTab', () => {
    it('SX5.1 onOpenCustomer prop on <AppointmentTab>', () => {
      const apptTabRender = DashboardSrc.match(/<AppointmentTab[\s\S]+?\/>/);
      expect(apptTabRender).toBeTruthy();
      expect(apptTabRender[0]).toMatch(/onOpenCustomer=\{/);
    });

    it('SX5.2 onOpenCustomer fetches customer + sets viewing + switches tab', () => {
      const apptTabRender = DashboardSrc.match(/<AppointmentTab[\s\S]+?\/>/);
      expect(apptTabRender).toBeTruthy();
      const fn = apptTabRender[0];
      expect(fn).toMatch(/getCustomer\(customerId\)/);
      expect(fn).toMatch(/setViewingCustomer\(c\)/);
      expect(fn).toMatch(/setActiveTab\(['"]customers['"]\)/);
    });

    it('SX5.3 onOpenCustomer is async (awaits getCustomer)', () => {
      const apptTabRender = DashboardSrc.match(/<AppointmentTab[\s\S]+?\/>/);
      expect(apptTabRender[0]).toMatch(/onOpenCustomer=\{async\s*\(customerId\)/);
    });

    it('SX5.4 early-return on empty customerId (defensive)', () => {
      const apptTabRender = DashboardSrc.match(/<AppointmentTab[\s\S]+?\/>/);
      expect(apptTabRender[0]).toMatch(/if\s*\(\s*!customerId\s*\)\s*return/);
    });

    it('SX5.5 try/catch around getCustomer (V31 no-silent-swallow — logs the error)', () => {
      const apptTabRender = DashboardSrc.match(/<AppointmentTab[\s\S]+?\/>/);
      expect(apptTabRender[0]).toMatch(/try\s*\{/);
      expect(apptTabRender[0]).toMatch(/catch\s*\(e\)\s*\{[\s\S]{0,200}console\.error/);
    });
  });

  describe('SX6 — CustomerDetailView modal usage UNCHANGED (anti-regression)', () => {
    it('SX6.1 CustomerDetailView <AppointmentFormModal> does NOT pass onDelete', () => {
      // CustomerDetailView already has its own cancel button outside the modal,
      // so the modal there should NOT show a delete button.
      const modalBlock = DetailSrc.match(/<AppointmentFormModal[\s\S]+?\/>/);
      expect(modalBlock).toBeTruthy();
      expect(modalBlock[0]).not.toMatch(/onDelete=/);
    });

    it('SX6.2 CustomerDetailView <AppointmentFormModal> does NOT pass onOpenCustomer', () => {
      // We're already on the customer page — clicking the name to "open"
      // would be a no-op. Static text is correct.
      const modalBlock = DetailSrc.match(/<AppointmentFormModal[\s\S]+?\/>/);
      expect(modalBlock).toBeTruthy();
      expect(modalBlock[0]).not.toMatch(/onOpenCustomer=/);
    });
  });

  describe('SX7 — Functional simulate (callback shape contract)', () => {
    function simulateDelete(formMode, deleteImpl, setFormMode) {
      // The arrow-function shape from AppointmentTab
      if (!(formMode.mode === 'edit' && formMode.appt)) return undefined;
      return async () => {
        const id = formMode.appt.appointmentId || formMode.appt.id;
        if (!id) return;
        await deleteImpl(id);
        setFormMode(null);
      };
    }

    function simulateOpenCustomer(parentCallback, setFormMode) {
      if (!parentCallback) return undefined;
      return (customerId) => {
        setFormMode(null);
        parentCallback(customerId);
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

    it('SX7.5 — simulateOpenCustomer returns undefined when no parent callback', () => {
      expect(simulateOpenCustomer(undefined, () => {})).toBeUndefined();
      expect(simulateOpenCustomer(null, () => {})).toBeUndefined();
    });

    it('SX7.6 — open fn closes modal then calls parent callback', () => {
      const calls = [];
      const fn = simulateOpenCustomer(
        (id) => calls.push(['open', id]),
        () => calls.push(['close']),
      );
      fn('LC-26000001');
      expect(calls).toEqual([['close'], ['open', 'LC-26000001']]);
    });

    it('SX7.7 — open fn handles cloned customer ids equally', () => {
      const calls = [];
      const fn = simulateOpenCustomer(
        (id) => calls.push(['open', id]),
        () => calls.push(['close']),
      );
      fn('2853'); // cloned customer id (numeric string)
      expect(calls[1][1]).toBe('2853');
    });
  });
});
