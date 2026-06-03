// tests/appt-r10-link-validation-and-phantom-reconcile.test.js
// appointment-loop R10 (2026-06-03) — convergence-hunt fixes, Tier-2 regression
// (Rule P). Round 10's 3 hunts confirmed the CORE is bulletproof (no double-charge,
// no double-booking, no money loss); these are the real residual defects found:
//
//  B (FK staleness): appt.linkedTreatmentId is a denormalized FK invalidated ONLY
//     at treatment-DELETE (R6) → a CUSTOMER-CHANGE on the appt (or a stale restore)
//     leaves it pointing at a DIFFERENT customer's treatment → the hub gate bricks
//     the new customer's appt forever. FIX: render-time join-validation — a LOADED
//     link whose customerId ≠ the appt's current customer is INVALID.
//  C1 (ghost collision): concurrent same-appt edits to DIFFERENT times leave a
//     PHANTOM slot stamped to the live appt at a time it no longer occupies →
//     invisible permanent over-block (R8 can't heal a live-owner slot). FIX:
//     updateBackendAppointment reconciles the appt's slots to its CURRENT keys
//     after a slot-affecting edit — releases any stamped slot that isn't current.

import { describe, it, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const read = (p) => readFileSync(path.resolve(process.cwd(), p), 'utf8');
const CARD = read('src/components/admin/AppointmentHubRowCard.jsx');
const VIEW = read('src/components/admin/AppointmentHubView.jsx');
const BACKEND = read('src/lib/backendClient.js');

function fnExport(src, name) {
  const re = new RegExp(`export (?:async )?function ${name}\\b`);
  const m = re.exec(src); if (!m) throw new Error(`fn ${name} not found`);
  const rest = src.slice(m.index + 1);
  const nxt = rest.search(/\nexport (?:async )?function /);
  return src.slice(m.index, nxt < 0 ? src.length : m.index + 1 + nxt);
}

describe('R10 B — the persistent appt→treatment link is join-validated by customer', () => {
  test('B.1 the hub gate trusts linkedTreatmentId only when the link is valid', () => {
    expect(CARD).toMatch(/const linkValid = !!appt\.linkedTreatmentId\s*\n?\s*&& \(!linkedTreatment \|\| String\(linkedTreatment\.customerId\) === String\(appt\.customerId\)\);/);
    expect(CARD).toMatch(/const hasTreatmentForDay = !!latestTreatment \|\| linkValid;/);
    // anti-regression: the pre-R10 blind trust is gone
    expect(CARD).not.toMatch(/const hasTreatmentForDay = !!latestTreatment \|\| !!appt\.linkedTreatmentId;/);
  });
  test('B.2 the hub view builds treatmentsById + passes the resolved linkedTreatment', () => {
    expect(VIEW).toMatch(/const treatmentsById = useMemo\(/);
    expect(VIEW).toMatch(/linkedTreatment=\{a\.linkedTreatmentId \? treatmentsById\.get\(String\(a\.linkedTreatmentId\)\) : null\}/);
  });
  test('B.3 [unit] the linkValid rule: out-of-window trusts (R4 backstop), loaded mismatch invalidates', () => {
    const linkValid = (appt, linkedTreatment) => !!appt.linkedTreatmentId
      && (!linkedTreatment || String(linkedTreatment.customerId) === String(appt.customerId));
    expect(linkValid({ linkedTreatmentId: 'BT', customerId: 'A' }, null)).toBe(true);                  // not loaded → trust (R4)
    expect(linkValid({ linkedTreatmentId: 'BT', customerId: 'A' }, { customerId: 'A' })).toBe(true);   // loaded, same customer
    expect(linkValid({ linkedTreatmentId: 'BT', customerId: 'B' }, { customerId: 'A' })).toBe(false);  // loaded, customer CHANGED → invalid
    expect(linkValid({ customerId: 'A' }, null)).toBe(false);                                          // no link
  });
});

describe('R10 C1 — updateBackendAppointment reconciles slots to current keys (no phantom over-block)', () => {
  const body = fnExport(BACKEND, 'updateBackendAppointment');
  test('C1.1 a reconcile runs after a slot-affecting edit', () => {
    expect(body).toMatch(/if \(keysChanged \|\| becameCancelled \|\| becameUncancelled\) \{/);
    expect(body).toMatch(/const fresh = await getDoc\(appointmentDoc\(appointmentId\)\);/);   // re-read authoritative state
  });
  test('C1.2 it queries the slots STAMPED to this appt + releases any that aren’t a current key', () => {
    expect(body).toMatch(/query\(appointmentSlotsCol\(\), where\('appointmentId', '==', appointmentId\)\)/);
    expect(body).toMatch(/const stale = stamped\.docs\.filter\(\(d\) => !curSet\.has\(d\.id\)\);/);
    // the delete re-verifies still-stamped-to-us in-tx (no hijack of another appt's slot)
    expect(body).toMatch(/String\(sd\.appointmentId\) === String\(appointmentId\) && !curSet\.has\(stale\[i\]\.id\)/);
    expect(body).toMatch(/tx\.delete\(stale\[i\]\.ref\)/);
  });
  test('C1.3 a cancelled appt reconciles to ZERO current keys (releases all its slots)', () => {
    expect(body).toMatch(/const freshKeys = \(fa\.status === 'cancelled'\) \? \[\] : buildAppointmentGuardKeys\(/);
  });
});
