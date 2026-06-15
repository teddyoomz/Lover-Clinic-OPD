// Phase 25.0c (2026-05-09) — Rule I full-flow simulate for the Walk-in
// OPD-save → AppointmentFormModal flow.
//
// User flow:
//   1. Walk-in customer fills QR/link form → opd_session created with
//      patient data (firstName/lastName/phone/etc) + branchId stamp
//   2. Admin views คิว Walk-IN tab (adminMode='dashboard') → clicks
//      "บันทึกลง OPD" button (renderOpdButton)
//   3. handleOpdClick saves customer to be_customers (existing logic) →
//      stamps session.opdRecordedAt + brokerStatus='done'
//   4. _maybeOpenWalkInModal fires (gated on adminMode === 'dashboard')
//      → setWalkInModal({ sessionId, customerId, customerHN, patientData })
//   5. <AppointmentFormModal> renders with:
//        - mode='create'
//        - lockedAppointmentType='walk-in'
//        - lockedChannel='Walk-in'
//        - lockedCustomer={...just-saved-customer...}
//        - initialDate={today}
//   6. Admin clicks save → createBackendAppointment with type='walk-in',
//      channel='Walk-in', customerId=sessionCustomer, branchId=current
//   7. V64 hub วันนี้ tab auto-displays the new walk-in (existing wide-range
//      fetch + sortApptsByDateTimeAsc)
//
// This file is a CHAIN regression guard via source-grep at each layer.
// It does NOT mount the modal (heavy Firestore deps); the layer-by-layer
// grep equivalence covers the contract.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const ADMIN_DASHBOARD = readFileSync('src/pages/AdminDashboard.jsx', 'utf-8');
const FORM_MODAL      = readFileSync('src/components/backend/AppointmentFormModal.jsx', 'utf-8');
const HUB_VIEW        = readFileSync('src/components/admin/AppointmentHubView.jsx', 'utf-8');
const HUB_FILTERS     = readFileSync('src/lib/appointmentHubFilters.js', 'utf-8');

describe('Phase 25.0c — Walk-in OPD-save → modal flow simulation', () => {
  it('F1 step 1+2 — kiosk session + renderOpdButton wired (existing pre-25.0)', () => {
    // Pre-existing — sanity check that the renderOpdButton still calls handleOpdClick.
    expect(ADMIN_DASHBOARD).toMatch(/onClick=\{\(\) => handleOpdClick\(session\)\}/);
  });

  it('F2 step 3 — handleOpdClick saves customer via addCustomer (existing)', () => {
    // Customer save semantics already exist (Phase 23.0). Walk-in flow
    // depends on this remaining intact.
    // 2026-06-16 — via addCustomerOrLinkExisting chokepoint (DUPLICATE_IDENTITY → link existing).
    expect(ADMIN_DASHBOARD).toMatch(/addCustomerOrLinkExisting\(patient,\s*\{\s*strict:\s*false,\s*branchId/);
  });

  it('F3 step 4 — _maybeOpenWalkInModal helper exists + gated by adminMode', () => {
    expect(ADMIN_DASHBOARD).toMatch(/const _maybeOpenWalkInModal\s*=\s*\(/);
    expect(ADMIN_DASHBOARD).toMatch(/if\s*\(adminMode\s*!==\s*'dashboard'\)\s*return;/);
  });

  it('F4 step 4 — _maybeOpenWalkInModal called at all 3 success branches (regression sweep)', () => {
    // Branch 1: addCustomer → result.success
    // Branch 2: relink to existing customer
    // Branch 3: recovery create after notFound
    const matches = ADMIN_DASHBOARD.match(/_maybeOpenWalkInModal\(/g) || [];
    // 3 call-sites (regex matches paren — function definition is `= (`,
    // not `(`, so it doesn't count). Each success branch wires one call.
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it('F5 step 5 — AppointmentFormModal mounted with all 4 LOCKED props', () => {
    // The walkInModal-gated render block must include the 4 lock contracts.
    expect(ADMIN_DASHBOARD).toMatch(/lockedAppointmentType="walk-in"/);
    expect(ADMIN_DASHBOARD).toMatch(/lockedChannel="Walk-in"/);
    expect(ADMIN_DASHBOARD).toMatch(/lockedCustomer=\{\{[\s\S]{0,400}proClinicId/);
    // Branch lock is implicit via useSelectedBranch context (Phase 15.7-octies);
    // location field is hard-locked to currentBranchName — see modal source.
    expect(FORM_MODAL).toMatch(/location:\s*currentBranchName\s*\|\|\s*formData\.location/);
  });

  it('F6 step 5 — modal initialDate = thaiTodayISO()', () => {
    expect(ADMIN_DASHBOARD).toMatch(/walkInModal[\s\S]{0,800}initialDate=\{thaiTodayISO\(\)\}/);
  });

  it('F7 step 5 — modal mode="create" + skipCollisionCheck=true (walk-in is HERE NOW)', () => {
    expect(ADMIN_DASHBOARD).toMatch(/walkInModal[\s\S]{0,800}mode="create"/);
    expect(ADMIN_DASHBOARD).toMatch(/walkInModal[\s\S]{0,800}skipCollisionCheck=\{true\}/);
  });

  it('F8 step 5 — onSaved closes modal + shows success toast', () => {
    expect(ADMIN_DASHBOARD).toMatch(/walkInModal[\s\S]{0,1200}showToast\('สร้างนัดหมาย Walk-in สำเร็จ'/);
    expect(ADMIN_DASHBOARD).toMatch(/walkInModal[\s\S]{0,1200}setWalkInModal\(null\)/);
  });

  it('F9 step 6 — modal save path writes channel via safeLockedChannel || formData.channel', () => {
    // Verifies that the saved appointment doc carries channel='Walk-in'
    // when lockedChannel='Walk-in' is passed (the lock wins over user input).
    expect(FORM_MODAL).toMatch(/channel:\s*safeLockedChannel\s*\|\|\s*formData\.channel/);
  });

  it('F10 step 7 — V64 hub วันนี้ tab fetches all appointments + sorts ASC (auto-displays walk-in)', () => {
    // The hub already fetches wide range + filters by date — walk-in just
    // needs to be in the wide range with date=today.
    expect(HUB_VIEW).toMatch(/getAppointmentsByDateRange/);
    expect(HUB_VIEW).toMatch(/sortApptsByDateTimeAsc/);
    expect(HUB_FILTERS).toMatch(/export function sortApptsByDateTimeAsc/);
  });

  it('F11 step 7 — V64 hub TYPE_CHIP_CLS handles walk-in (auto-renders chip)', () => {
    const HUB_ROW = readFileSync('src/components/admin/AppointmentHubRowCard.jsx', 'utf-8');
    expect(HUB_ROW).toMatch(/'walk-in':\s+'bg-amber-100/);
  });

  it('F12 step 7 — V64 hub real-time refresh: appointmentDataVersion bumps on listenToAppointmentsByMonth', () => {
    // V64-fix9 contract — when a walk-in is saved, AdminDashboard's listener
    // fires → setAppointmentDataVersion(v=>v+1) → AppointmentHubView silent
    // reload → walk-in appears immediately without F5.
    expect(ADMIN_DASHBOARD).toMatch(/setAppointmentDataVersion/);
    expect(HUB_VIEW).toMatch(/appointmentDataVersion/);
  });

  it('F13 lifecycle — phase comment markers (institutional memory)', () => {
    // Future readers grep for "Phase 25.0c" to find the wiring.
    const c = (ADMIN_DASHBOARD.match(/Phase 25\.0c/g) || []).length;
    expect(c).toBeGreaterThanOrEqual(3); // helper + 3 success branches
    expect(FORM_MODAL).toMatch(/Phase 25\.0c/);
  });

  it('F14 modal payload — type lock writes appointmentType=walk-in (mirrors lockedAppointmentType pattern)', () => {
    // Existing Phase 21.0 pattern — safeLockedType wins over formData.appointmentType.
    expect(FORM_MODAL).toMatch(/appointmentType:\s*safeLockedType\s*\|\|\s*formData\.appointmentType/);
  });
});
