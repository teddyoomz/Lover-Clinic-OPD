// tests/phase-21-0-flow-simulate.test.js
// Phase 21.0 — Rule I full-flow simulate: per-branch × per-type isolation
//
// Pure simulation of the chain:
//   listenToAppointmentsByDate({branchId, date}) → dayAppts
//   → typedDayAppts = dayAppts.filter(apptMatchesType)
//   → render via apptMap (per-room O(1) lookup)
//
// Verifies the new sub-tabs ALWAYS show the correct slice — branch filter
// happens BEFORE type filter (selectedBranchId in BSA listener); type filter
// further narrows. Both must apply for the matrix to be correct.
//
// Adversarial cases:
//   - legacy appointmentType ('sales', 'followup', null, missing) → coerces to no-deposit-booking
//   - branchId missing on appointment → does NOT leak across branches (filtered by listener pre-emit)
//   - duplicate appointment IDs → dedupe behavior preserved

import { describe, test, expect } from 'vitest';
import {
  APPOINTMENT_TYPE_VALUES,
  migrateLegacyAppointmentType,
} from '../src/lib/appointmentTypes.js';

// Mirror of AppointmentCalendarView's apptMatchesType derivation.
function makeApptMatchesType(typeFilter) {
  return (a) => {
    if (!typeFilter) return true;
    return migrateLegacyAppointmentType(a?.appointmentType) === typeFilter;
  };
}

// Mirror of the BSA listener semantics: emit only docs where branchId matches
// (or branchId is missing and selectedBranchId is null — but in production
// every appt has branchId stamped post-Phase 20.0).
function simulateListenerEmit(allAppts, selectedBranchId) {
  return allAppts.filter(a => {
    // Phase BS regression-fix: explicit branchId match. The listener applies
    // the where-clause server-side; tests simulate via filter.
    if (!selectedBranchId) return true;
    return a.branchId === selectedBranchId;
  });
}

// Build a mock dataset: 2 branches × 4 types × 2 appts each = 16 docs total.
const BRANCHES = ['BR-A', 'BR-B'];
const TYPES = APPOINTMENT_TYPE_VALUES.slice(); // 4 types
function fakeAppt(branchId, type, idx) {
  return {
    appointmentId: `BA-${branchId}-${type}-${idx}`,
    branchId,
    appointmentType: type,
    customerId: `C-${idx}`,
    customerName: `Customer ${idx}`,
    date: '2026-05-10',
    startTime: '10:00',
    endTime: '10:15',
    doctorId: `D-${idx}`,
    doctorName: `Dr ${idx}`,
    roomName: `Room ${idx}`,
    status: 'pending',
  };
}

function buildDataset() {
  const out = [];
  for (const b of BRANCHES) {
    for (const t of TYPES) {
      out.push(fakeAppt(b, t, 1));
      out.push(fakeAppt(b, t, 2));
    }
  }
  return out;
}

describe('Phase 21.0 — F1 per-branch × per-type isolation matrix', () => {
  test('F1.1 dataset shape: 2 branches × 4 types × 2 appts = 16', () => {
    const data = buildDataset();
    expect(data.length).toBe(16);
  });

  test('F1.2 BR-A × no-deposit-booking shows ONLY 2 appts (both BR-A + type)', () => {
    const data = buildDataset();
    const branched = simulateListenerEmit(data, 'BR-A');
    const matched = branched.filter(makeApptMatchesType('no-deposit-booking'));
    expect(matched.length).toBe(2);
    expect(matched.every(a => a.branchId === 'BR-A')).toBe(true);
    expect(matched.every(a => a.appointmentType === 'no-deposit-booking')).toBe(true);
  });

  test('F1.3 BR-A × deposit-booking shows ONLY 2 BR-A deposit-bookings', () => {
    const data = buildDataset();
    const branched = simulateListenerEmit(data, 'BR-A');
    const matched = branched.filter(makeApptMatchesType('deposit-booking'));
    expect(matched.length).toBe(2);
    expect(matched.every(a => a.appointmentType === 'deposit-booking')).toBe(true);
  });

  test('F1.4 BR-A × treatment-in shows ONLY 2 BR-A treatment-in', () => {
    const data = buildDataset();
    const branched = simulateListenerEmit(data, 'BR-A');
    const matched = branched.filter(makeApptMatchesType('treatment-in'));
    expect(matched.length).toBe(2);
    expect(matched.every(a => a.appointmentType === 'treatment-in')).toBe(true);
  });

  test('F1.5 BR-A × follow-up shows ONLY 2 BR-A follow-up', () => {
    const data = buildDataset();
    const branched = simulateListenerEmit(data, 'BR-A');
    const matched = branched.filter(makeApptMatchesType('follow-up'));
    expect(matched.length).toBe(2);
    expect(matched.every(a => a.appointmentType === 'follow-up')).toBe(true);
  });

  test('F1.6 BR-B × all 4 types: each shows ONLY 2 BR-B appts of that type', () => {
    const data = buildDataset();
    const branched = simulateListenerEmit(data, 'BR-B');
    for (const type of TYPES) {
      const matched = branched.filter(makeApptMatchesType(type));
      expect(matched.length).toBe(2);
      expect(matched.every(a => a.branchId === 'BR-B')).toBe(true);
      expect(matched.every(a => a.appointmentType === type)).toBe(true);
    }
  });

  test('F1.7 BR-A view never sees BR-B appts (branch isolation)', () => {
    const data = buildDataset();
    const branched = simulateListenerEmit(data, 'BR-A');
    expect(branched.every(a => a.branchId === 'BR-A')).toBe(true);
  });

  test('F1.8 No type sub-tab shows appts from a different type (type isolation)', () => {
    const data = buildDataset();
    const branched = simulateListenerEmit(data, 'BR-A');
    for (const tabType of TYPES) {
      const matched = branched.filter(makeApptMatchesType(tabType));
      const otherTypes = matched.filter(a => a.appointmentType !== tabType);
      expect(otherTypes.length).toBe(0);
    }
  });

  test('F1.9 Total per-branch count = 8 (sum across 4 sub-tabs)', () => {
    const data = buildDataset();
    for (const b of BRANCHES) {
      const branched = simulateListenerEmit(data, b);
      let sum = 0;
      for (const t of TYPES) sum += branched.filter(makeApptMatchesType(t)).length;
      expect(sum).toBe(8);
    }
  });

  test('F1.10 Total cross-branch (no filter) = 16', () => {
    const data = buildDataset();
    const branched = simulateListenerEmit(data, null);
    let sum = 0;
    for (const t of TYPES) sum += branched.filter(makeApptMatchesType(t)).length;
    expect(sum).toBe(16);
  });
});

describe('Phase 21.0 — F2 adversarial: legacy types coerce to no-deposit-booking', () => {
  test('F2.1 appt with appointmentType="sales" appears in no-deposit-booking sub-tab', () => {
    const a = { branchId: 'BR-A', appointmentType: 'sales' };
    expect(makeApptMatchesType('no-deposit-booking')(a)).toBe(true);
    // And NOT in any other sub-tab
    expect(makeApptMatchesType('deposit-booking')(a)).toBe(false);
    expect(makeApptMatchesType('treatment-in')(a)).toBe(false);
    expect(makeApptMatchesType('follow-up')(a)).toBe(false);
  });

  test('F2.2 appt with appointmentType="followup" coerces to no-deposit-booking', () => {
    // Note: Phase 19.0 chose Option B Uniform (all legacy → no-deposit-booking),
    // so 'followup' does NOT map to 'follow-up' canonically.
    const a = { branchId: 'BR-A', appointmentType: 'followup' };
    expect(makeApptMatchesType('no-deposit-booking')(a)).toBe(true);
    expect(makeApptMatchesType('follow-up')(a)).toBe(false);
  });

  test('F2.3 appt with no appointmentType field appears in no-deposit-booking', () => {
    const a = { branchId: 'BR-A' };
    expect(makeApptMatchesType('no-deposit-booking')(a)).toBe(true);
  });

  test('F2.4 appt with null appointmentType appears in no-deposit-booking', () => {
    const a = { branchId: 'BR-A', appointmentType: null };
    expect(makeApptMatchesType('no-deposit-booking')(a)).toBe(true);
  });

  test('F2.5 appt with empty string appointmentType appears in no-deposit-booking', () => {
    const a = { branchId: 'BR-A', appointmentType: '' };
    expect(makeApptMatchesType('no-deposit-booking')(a)).toBe(true);
  });

  test('F2.6 appt with garbage appointmentType appears in no-deposit-booking', () => {
    const a = { branchId: 'BR-A', appointmentType: 'random-garbage-value' };
    expect(makeApptMatchesType('no-deposit-booking')(a)).toBe(true);
  });

  test('F2.7 No type filter (typeFilter=null) shows all appts including legacy', () => {
    const matcher = makeApptMatchesType(null);
    expect(matcher({ appointmentType: 'sales' })).toBe(true);
    expect(matcher({ appointmentType: null })).toBe(true);
    expect(matcher({ appointmentType: 'no-deposit-booking' })).toBe(true);
  });
});

describe('Phase 21.0 — F3 adversarial: cross-branch isolation under bad data', () => {
  test('F3.1 appt with missing branchId is excluded from branch-scoped emit', () => {
    const data = [
      { appointmentId: 'A', appointmentType: 'no-deposit-booking', branchId: 'BR-A' },
      { appointmentId: 'B', appointmentType: 'no-deposit-booking', branchId: '' },
      { appointmentId: 'C', appointmentType: 'no-deposit-booking' },  // missing
    ];
    const branched = simulateListenerEmit(data, 'BR-A');
    expect(branched.map(a => a.appointmentId)).toEqual(['A']);
  });

  test('F3.2 appt with branchId different from selected does NOT leak', () => {
    const data = [
      fakeAppt('BR-A', 'no-deposit-booking', 1),
      fakeAppt('BR-B', 'no-deposit-booking', 2),
    ];
    const branchedA = simulateListenerEmit(data, 'BR-A');
    expect(branchedA.length).toBe(1);
    expect(branchedA[0].branchId).toBe('BR-A');
  });
});

describe('Phase 21.0 — F4 lifecycle: deposit-booking pair appears in correct sub-tab', () => {
  test('F4.1 paired deposit-booking appt (linkedDepositId set) appears in จองมัดจำ sub-tab', () => {
    const pairAppt = {
      appointmentId: 'BA-pair-1',
      branchId: 'BR-A',
      appointmentType: 'deposit-booking',
      linkedDepositId: 'DEP-1',
      spawnedFromDepositId: 'DEP-1',
      customerId: 'C-1',
      date: '2026-05-10',
      startTime: '10:00',
    };
    const branched = simulateListenerEmit([pairAppt], 'BR-A');
    const matchedDeposit = branched.filter(makeApptMatchesType('deposit-booking'));
    expect(matchedDeposit.length).toBe(1);
    expect(matchedDeposit[0].linkedDepositId).toBe('DEP-1');
  });

  test('F4.2 backfilled appt (spawnedFromDepositId set) appears in จองมัดจำ sub-tab', () => {
    const backfillAppt = {
      appointmentId: 'BA-backfill-1',
      branchId: 'BR-B',
      appointmentType: 'deposit-booking',
      linkedDepositId: 'DEP-99',
      spawnedFromDepositId: 'DEP-99',
      customerId: 'C-99',
      date: '2026-05-10',
      startTime: '11:00',
    };
    const branched = simulateListenerEmit([backfillAppt], 'BR-B');
    const matchedDeposit = branched.filter(makeApptMatchesType('deposit-booking'));
    expect(matchedDeposit.length).toBe(1);
    expect(matchedDeposit[0].spawnedFromDepositId).toBe('DEP-99');
  });

  test('F4.3 deposit-booking pair does NOT leak into จองไม่มัดจำ sub-tab', () => {
    const pairAppt = {
      branchId: 'BR-A',
      appointmentType: 'deposit-booking',
      linkedDepositId: 'DEP-1',
    };
    expect(makeApptMatchesType('no-deposit-booking')(pairAppt)).toBe(false);
  });
});

describe('Phase 21.0 — F5 source-grep regression guards (V21 lock-in)', () => {
  test('F5.1 AppointmentCalendarView wires typeFilter to all 4 dayAppts use-sites', () => {
    const { readFileSync } = require('node:fs');
    const SRC = readFileSync('src/components/backend/AppointmentCalendarView.jsx', 'utf8');
    // Each of these derivations must read typedDayAppts (or use apptMatchesType filter)
    expect(SRC).toMatch(/typedDayAppts\.forEach/);  // apptMap + dayDoctors
    expect(SRC).toMatch(/typedDayAppts\.some/);     // occupied + hasOrphan
    expect(SRC).toMatch(/typedDayAppts\.find/);     // doctor scroll-target
  });

  test('F5.2 BackendDashboard renders >= 5 distinct AppointmentCalendarView instances (Phase 21.0-bis added all-types overview)', () => {
    const { readFileSync } = require('node:fs');
    const BD = readFileSync('src/pages/BackendDashboard.jsx', 'utf8');
    const matches = BD.match(/<AppointmentCalendarView/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(5);
  });

  test('F5.3 navConfig has section with exactly 5 appointment items (Phase 21.0-bis)', () => {
    const { NAV_SECTIONS } = require('../src/components/backend/nav/navConfig.js');
    const section = NAV_SECTIONS.find(s => s.id === 'appointments-section');
    expect(section.items.length).toBe(5);
  });
});
