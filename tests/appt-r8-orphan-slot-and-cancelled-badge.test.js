// tests/appt-r8-orphan-slot-and-cancelled-badge.test.js
// appointment-loop R8 (2026-06-03) — convergence-hunt fixes, Tier-2 regression
// (Rule P). Real-prod L2: scripts/e2e-appt-r8-orphan-slot-autoheal.mjs (6/0,
// CONF-1 proven RED pre-fix).
//
//  CONF-1 (P1, silent permanent over-block): the AP1-bis reserve guard keyed only
//     on slotData.cancelled, NOT the parent appt's status → a stale orphan slot
//     (parent cancelled/deleted by a concurrent cancel-vs-edit race) blocked that
//     doctor's time FOREVER with no visible conflict. FIX: the reserve scan reads
//     the slot's parent appt; a slot whose parent is cancelled/missing is FREE.
//  Badge (P2): a cancelled appt wore a green "เสร็จแล้ว" badge (effectiveStatus
//     trusted serviceCompletedAt over a 'cancelled' status; the deposit-cancel
//     path bypasses the V139 sync so serviceCompletedAt is never cleared).

import { describe, it, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const read = (p) => readFileSync(path.resolve(process.cwd(), p), 'utf8');
const BACKEND = read('src/lib/backendClient.js');
const DEPO = read('src/lib/appointmentDepositBatch.js');
const CARD = read('src/components/admin/AppointmentHubRowCard.jsx');

function fnExport(src, name) {
  const re = new RegExp(`export (?:async )?function ${name}\\b`);
  const m = re.exec(src); if (!m) throw new Error(`fn ${name} not found`);
  const rest = src.slice(m.index + 1);
  const nxt = rest.search(/\nexport (?:async )?function /);
  return src.slice(m.index, nxt < 0 ? src.length : m.index + 1 + nxt);
}

// the R8 parent-status guard pattern that every reserve site must carry
const hasParentLiveGuard = (block) =>
  /tx\.get\(appointmentDoc\(/.test(block) &&
  /os && os\.exists\(\) && \(?os\.data\(\)\?\.status !== 'cancelled'\)?/.test(block);

describe('R8 CONF-1 — every reserve site treats a cancelled/missing-parent slot as FREE (auto-heal)', () => {
  test('A.1 createBackendAppointment reserve guard reads the slot’s parent appt status', () => {
    const body = fnExport(BACKEND, 'createBackendAppointment');
    expect(hasParentLiveGuard(body)).toBe(true);
    // anti-regression: the bare "any non-cancelled slot collides" throw is gone
    expect(body).not.toMatch(/if \(slotData\.cancelled\) continue;\s*\n\s*const err = new Error\(/);
  });

  test('A.2 _reserveAppointmentSlotsInTx (deposit-booking reserve) reads the parent appt status', () => {
    // this helper is not exported; slice it by name from the module source
    const i = DEPO.indexOf('async function _reserveAppointmentSlotsInTx');
    const block = DEPO.slice(i, DEPO.indexOf('\nasync function ', i + 1) >= 0 ? DEPO.indexOf('\nasync function ', i + 1) : DEPO.indexOf('\nexport ', i + 1));
    expect(hasParentLiveGuard(block)).toBe(true);
    expect(block).not.toMatch(/if \(sd\.cancelled\) continue;\s*\n\s*const err = new Error\(/);
  });

  test('A.3 _reserveSlotsConditional (R5 no-hijack) frees a slot held by a CANCELLED other appt', () => {
    const body = fnExport(BACKEND, 'updateBackendAppointment');
    expect(body).toMatch(/const ownerSnaps = await Promise\.all\(otherHeld\.map\(\(o\) => tx\.get\(appointmentDoc\(o\.ownerId\)\)\)\);/);
    expect(body).toMatch(/if \(os && os\.exists\(\) && os\.data\(\)\?\.status !== 'cancelled'\) liveBlocked\.add/);
    expect(body).toMatch(/if \(liveBlocked\.has\(i\)\) continue;/);
  });

  test('A.4 the LIVE-holder collision is preserved (no double-book regression)', () => {
    const body = fnExport(BACKEND, 'createBackendAppointment');
    // a live parent still throws AP1_COLLISION
    expect(body).toMatch(/if \(!live\) continue;/);
    expect(body).toMatch(/err\.code = 'AP1_COLLISION';/);
  });
});

describe('R8 badge — a CANCELLED appointment never shows a green "done" badge', () => {
  test('B.1 effectiveStatus gives cancelled precedence over serviceCompletedAt', () => {
    expect(CARD).toMatch(/const effectiveStatus = rawStatus === 'cancelled' \? 'cancelled' : \(appt\.serviceCompletedAt \? 'done' : rawStatus\);/);
  });
  test('B.2 [unit] the effectiveStatus rule', () => {
    const eff = (rawStatus, serviceCompletedAt) => rawStatus === 'cancelled' ? 'cancelled' : (serviceCompletedAt ? 'done' : rawStatus);
    expect(eff('cancelled', '2099-01-01T00:00:00Z')).toBe('cancelled');  // cancelled wins over a stale service stamp
    expect(eff('confirmed', '2099-01-01T00:00:00Z')).toBe('done');       // normal completed
    expect(eff('confirmed', null)).toBe('confirmed');                    // waiting
    expect(eff('cancelled', null)).toBe('cancelled');
  });
});
