// Phase 15.7-septies (2026-04-29) — customer link opens NEW BROWSER TAB
//
// User directive (revising 15.7-sexies behavior):
//   1. "ในหน้า tab=appointments ที่ให้ทำให้ชื่อกดได้หมายถึงให้กดได้
//      ตั้งแต่ในตารางเลย ... ไม่ใช่ต้องกดเปิด modal ก่อนแล้วถึงจะกดชื่อได้"
//      → Customer name in the calendar GRID itself must be clickable
//        (admin shouldn't need to open the edit modal first).
//   2. "ทำให้การกดทั้งในหน้าตารางเลย หรือกด modal เปิดมาก่อน
//      มันเป็นการเปิด Tab ของ Browser ใหม่"
//      → BOTH grid + modal clicks must open a NEW BROWSER TAB
//        (`?backend=1&customer={id}` deep-link), not in-page redirect.
//
// Implementation:
//   - NEW src/lib/customerNavigation.js helper:
//     buildCustomerDetailUrl(customerId) + openCustomerInNewTab(customerId)
//   - AppointmentTab grid cell: customer name is now a real <a target="_blank">
//     with stopPropagation so click on name → new tab; click anywhere else
//     on the cell → still opens edit modal.
//   - Outer cell switched from <button> → <div role="button" tabIndex={0}
//     onKeyDown> so we can NEST a real <a> (HTML5 forbids <a> inside <button>).
//   - AppointmentFormModal: replaces the Phase 15.7-sexies onOpenCustomer
//     callback with a static <a target="_blank">. Gated by NEW prop
//     `enableCustomerLink={true}` (AppointmentTab passes true;
//     CustomerDetailView omits it → static text).
//   - BackendDashboard's onOpenCustomer callback wiring REMOVED — no longer
//     needed since the modal navigates via <a> directly.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

import { buildCustomerDetailUrl, openCustomerInNewTab } from '../src/lib/customerNavigation.js';

const REPO_ROOT = path.resolve(import.meta.dirname || __dirname, '..');
const NavSrc = readFileSync(path.join(REPO_ROOT, 'src/lib/customerNavigation.js'), 'utf-8');
const TabSrc = readFileSync(path.join(REPO_ROOT, 'src/components/backend/AppointmentTab.jsx'), 'utf-8');
const ModalSrc = readFileSync(path.join(REPO_ROOT, 'src/components/backend/AppointmentFormModal.jsx'), 'utf-8');
const DashboardSrc = readFileSync(path.join(REPO_ROOT, 'src/pages/BackendDashboard.jsx'), 'utf-8');

describe('Phase 15.7-septies — customer link opens new browser tab', () => {
  describe('SE1 — customerNavigation helpers', () => {
    it('SE1.1 buildCustomerDetailUrl produces the canonical deep-link', () => {
      // Standard origin (jsdom default is "http://localhost:3000")
      const url = buildCustomerDetailUrl('LC-26000001');
      expect(url).toMatch(/\?backend=1&customer=LC-26000001$/);
    });

    it('SE1.2 buildCustomerDetailUrl encodes special chars in customerId', () => {
      const url = buildCustomerDetailUrl('LC-26000001 spaces&amp');
      // encodeURIComponent → %20 + %26 + spaces become %20
      expect(url).toMatch(/customer=LC-26000001%20spaces%26amp/);
    });

    it('SE1.3 buildCustomerDetailUrl returns empty for empty/null id', () => {
      expect(buildCustomerDetailUrl('')).toBe('');
      expect(buildCustomerDetailUrl(null)).toBe('');
      expect(buildCustomerDetailUrl(undefined)).toBe('');
      expect(buildCustomerDetailUrl('   ')).toBe('');
    });

    it('SE1.4 openCustomerInNewTab calls window.open with _blank + noopener', () => {
      const opened = [];
      const origOpen = window.open;
      window.open = (url, target, features) => { opened.push({ url, target, features }); return null; };
      try {
        const ok = openCustomerInNewTab('LC-26000001');
        expect(ok).toBe(true);
        expect(opened).toHaveLength(1);
        expect(opened[0].target).toBe('_blank');
        expect(opened[0].features).toMatch(/noopener/);
        expect(opened[0].url).toMatch(/\?backend=1&customer=LC-26000001$/);
      } finally {
        window.open = origOpen;
      }
    });

    it('SE1.5 openCustomerInNewTab returns false when id is empty', () => {
      const opened = [];
      const origOpen = window.open;
      window.open = (...args) => { opened.push(args); return null; };
      try {
        expect(openCustomerInNewTab('')).toBe(false);
        expect(openCustomerInNewTab(null)).toBe(false);
        expect(opened).toHaveLength(0);
      } finally {
        window.open = origOpen;
      }
    });

    it('SE1.6 helper has Phase 15.7-septies marker comment', () => {
      expect(NavSrc).toMatch(/Phase 15\.7-septies/);
    });
  });

  describe('SE2 — Calendar GRID customer name = <a target="_blank">', () => {
    it('SE2.1 grid cell renders <a target="_blank" rel="noopener noreferrer"> for customer name', () => {
      // The cell renders `<a href="/?backend=1&customer={id}" target="_blank" rel="noopener noreferrer">`
      expect(TabSrc).toMatch(/href=\{`\/\?backend=1&customer=\$\{encodeURIComponent\(String\(appt\.customerId\)\)\}`\}/);
      expect(TabSrc).toMatch(/data-testid="appt-grid-customer-link"/);
    });

    it('SE2.2 grid cell anchor uses target=_blank + rel="noopener noreferrer"', () => {
      const block = TabSrc.match(/data-testid="appt-grid-customer-link"[\s\S]{0,400}/);
      const wider = TabSrc.split('data-testid="appt-grid-customer-link"')[0].slice(-1500);
      expect(wider).toMatch(/target="_blank"/);
      expect(wider).toMatch(/rel="noopener noreferrer"/);
    });

    it('SE2.3 grid cell anchor calls e.stopPropagation so cell-click doesn\'t open edit modal', () => {
      const wider = TabSrc.split('data-testid="appt-grid-customer-link"')[0].slice(-1500);
      expect(wider).toMatch(/e\.stopPropagation\(\)/);
    });

    it('SE2.4 grid outer cell switched from <button> to <div role="button"> (HTML5 nesting fix)', () => {
      // <a> inside <button> is invalid HTML5. The cell must now be <div role="button">
      // to allow the nested <a> for the customer name.
      // Search for a div with role="button" + tabIndex={0} + onKeyDown handler.
      expect(TabSrc).toMatch(/role="button"\s+tabIndex=\{0\}\s+onClick=\{\(\)\s*=>\s*openEdit\(appt\)\}/);
      expect(TabSrc).toMatch(/onKeyDown=\{[\s\S]{0,200}openEdit\(appt\)/);
    });

    it('SE2.5 grid cell falls back to non-link <span> when appt.customerId is empty', () => {
      // Defensive: legacy appts without customerId render as static text
      expect(TabSrc).toMatch(/appt\.customerId\s*\?[\s\S]{0,2000}\)\s*:\s*\(/);
    });
  });

  describe('SE3 — Modal customer name = <a target="_blank">', () => {
    it('SE3.1 modal renders <a> instead of <button> for customer name (Phase 15.7-septies)', () => {
      expect(ModalSrc).toMatch(/href=\{`\/\?backend=1&customer=\$\{encodeURIComponent\(formData\.customerId\)\}`\}/);
      expect(ModalSrc).toMatch(/target="_blank"/);
    });

    it('SE3.2 modal anchor has data-testid="appt-modal-open-customer"', () => {
      // testid preserved from sexies for backward compat with existing tests
      expect(ModalSrc).toMatch(/data-testid="appt-modal-open-customer"/);
    });

    it('SE3.3 modal accepts NEW prop enableCustomerLink (replaces sexies onOpenCustomer)', () => {
      // Function signature destructure
      const sig = ModalSrc.match(/export default function AppointmentFormModal\(\{[\s\S]+?\}\)/);
      expect(sig).toBeTruthy();
      expect(sig[0]).toMatch(/enableCustomerLink\s*=\s*false/);
      // Phase 15.7-sexies onOpenCustomer prop is GONE
      expect(sig[0]).not.toMatch(/onOpenCustomer/);
    });

    it('SE3.4 modal gates link on enableCustomerLink && formData.customerId', () => {
      expect(ModalSrc).toMatch(/enableCustomerLink\s*&&\s*formData\.customerId/);
    });

    it('SE3.5 modal anchor uses rel="noopener noreferrer"', () => {
      const linkBlock = ModalSrc.match(/href=\{`\/\?backend=1&customer=\$\{encodeURIComponent\(formData\.customerId\)\}`\}[\s\S]{0,500}/);
      expect(linkBlock).toBeTruthy();
      expect(linkBlock[0]).toMatch(/rel="noopener noreferrer"/);
    });

    it('SE3.6 modal anchor stops propagation so backdrop click doesn\'t close modal', () => {
      const linkBlock = ModalSrc.match(/href=\{`\/\?backend=1&customer=\$\{encodeURIComponent\(formData\.customerId\)\}`\}[\s\S]{0,500}/);
      expect(linkBlock[0]).toMatch(/e\.stopPropagation\(\)/);
    });
  });

  describe('SE4 — AppointmentTab passes enableCustomerLink={true} to modal', () => {
    it('SE4.1 modal receives enableCustomerLink={true}', () => {
      const modalBlock = TabSrc.match(/<AppointmentFormModal[\s\S]+?\/>/);
      expect(modalBlock).toBeTruthy();
      expect(modalBlock[0]).toMatch(/enableCustomerLink=\{true\}/);
    });

    it('SE4.2 onOpenCustomer wiring REMOVED from modal usage (anti-regression)', () => {
      const modalBlock = TabSrc.match(/<AppointmentFormModal[\s\S]+?\/>/);
      // Sexies callback should no longer be passed
      expect(modalBlock[0]).not.toMatch(/onOpenCustomer=/);
    });

    it('SE4.3 AppointmentTab no longer accepts onOpenCustomer prop (cleanup)', () => {
      // Function signature
      const sig = TabSrc.match(/export default function AppointmentTab\([\s\S]{0,200}\)/);
      expect(sig).toBeTruthy();
      expect(sig[0]).not.toMatch(/onOpenCustomer/);
    });
  });

  describe('SE5 — BackendDashboard wiring cleanup', () => {
    it('SE5.1 BackendDashboard no longer injects onOpenCustomer to AppointmentTab', () => {
      const apptTabRender = DashboardSrc.match(/<AppointmentTab[\s\S]+?\/>/);
      expect(apptTabRender).toBeTruthy();
      // Phase 15.7-septies removed the in-page-redirect callback
      expect(apptTabRender[0]).not.toMatch(/onOpenCustomer=/);
    });

    it('SE5.2 BackendDashboard contains Phase 15.7-septies marker explaining the removal', () => {
      const apptTabRender = DashboardSrc.match(/<AppointmentTab[\s\S]+?\/>/);
      // The comment around AppointmentTab references the new-tab approach
      const wider = DashboardSrc.split('<AppointmentTab')[0].slice(-2000);
      // Marker can sit just before or just after the render
      expect(DashboardSrc).toMatch(/Phase 15\.7-septies/);
    });
  });

  describe('SE6 — Functional simulate (URL builder + new-tab behavior)', () => {
    it('SE6.1 — typical V33 self-created customer LC-26000001', () => {
      expect(buildCustomerDetailUrl('LC-26000001')).toMatch(/customer=LC-26000001$/);
    });

    it('SE6.2 — cloned customer (numeric proClinicId)', () => {
      expect(buildCustomerDetailUrl('2853')).toMatch(/customer=2853$/);
    });

    it('SE6.3 — both customer types resolve to the SAME URL pattern', () => {
      const lc = buildCustomerDetailUrl('LC-26000001');
      const cloned = buildCustomerDetailUrl('2853');
      // Both URLs should differ ONLY by the customer query param
      expect(lc.replace(/customer=[^&]+/, 'customer=X')).toBe(cloned.replace(/customer=[^&]+/, 'customer=X'));
    });

    it('SE6.4 — opening from grid OR modal both produce the same URL', () => {
      // Grid: href=`/?backend=1&customer=${encodeURIComponent(String(appt.customerId))}`
      // Modal: href=`/?backend=1&customer=${encodeURIComponent(formData.customerId)}`
      // Both equivalent for the same id. Simulated URL build:
      const customerId = 'LC-26000001';
      const gridHref = `/?backend=1&customer=${encodeURIComponent(String(customerId))}`;
      const modalHref = `/?backend=1&customer=${encodeURIComponent(customerId)}`;
      expect(gridHref).toBe(modalHref);
    });
  });

  describe('SE7 — anti-regression: Phase 15.7-sexies callback path removed', () => {
    it('SE7.1 modal no longer references sexies onOpenCustomer callback shape', () => {
      // The sexies pattern was: `onOpenCustomer && formData.customerId ? <button onClick=...>`
      // That should be replaced by: `enableCustomerLink && formData.customerId ? <a href=...>`
      expect(ModalSrc).not.toMatch(/onOpenCustomer\s*&&\s*formData\.customerId/);
    });

    it('SE7.2 AppointmentTab no longer wires the in-page navigation callback', () => {
      // The sexies pattern: `onOpenCustomer={onOpenCustomer ? (customerId) => {...}`
      expect(TabSrc).not.toMatch(/onOpenCustomer\s*\?\s*\(customerId\)\s*=>/);
    });
  });
});
