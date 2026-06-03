// tests/appt-r11-line-confirm-status-precondition.test.js
// appointment-loop R11 (2026-06-03) — convergence-round fix, Tier-2 regression.
// Two final high-bar hunts reached a CONVERGENCE verdict (the lifecycle is
// bulletproof at the money/double-book/double-charge/corruption bar). The ONE
// genuinely-unhunted writer×guard interaction they surfaced:
//
//  LOW-1 — the LINE-confirm postback (api/webhook/line.js handlePostback) set
//     status='confirmed' UNCONDITIONALLY. A customer tapping "ยืนยันนัด" on an old
//     reminder thus RESURRECTED a cancelled appointment (live again, but with NO
//     be_appointment_slots → unguarded, bypassing the atomic guard) and downgraded
//     a DONE/completed visit. FIX: gate the status change to a confirmable state;
//     the tap is still audit-logged (postback_log + notifyMeta) either way.
//
// handlePostback is an internal (non-exported) serverless handler, so this is a
// source-grep + unit lock (a full webhook L2 would need a LINE-event + reply-API
// harness, disproportionate for a status precondition). Rule Q-honest: source-grep
// + unit, NOT a live webhook L2.

import { describe, it, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const WEBHOOK = readFileSync(path.resolve(process.cwd(), 'api/webhook/line.js'), 'utf8');

describe('R11 — LINE confirm postback gates the status change to a confirmable state', () => {
  test('R11.1 computes curStatus + confirmable and gates status=confirmed on it', () => {
    expect(WEBHOOK).toMatch(/const curStatus = String\(apptData\.status \|\| ''\)\.toLowerCase\(\);/);
    expect(WEBHOOK).toMatch(/const confirmable = curStatus !== 'cancelled' && curStatus !== 'done' && curStatus !== 'completed';/);
    expect(WEBHOOK).toMatch(/if \(parsed\.action === 'confirm' && confirmable\) \{/);
    // anti-regression: the unconditional confirm is gone
    expect(WEBHOOK).not.toMatch(/if \(parsed\.action === 'confirm'\) \{\s*\n\s*apptUpdate\.status = 'confirmed';/);
  });
  test('R11.2 a customer confirming a CANCELLED appt is told it was cancelled (not resurrected)', () => {
    expect(WEBHOOK).toMatch(/curStatus === 'cancelled'\s*\n?\s*\? 'นัดนี้ถูกยกเลิกแล้ว/);
  });
  test('R11.3 the tap is still audit-logged regardless (postback_log + notifyMeta)', () => {
    // notifyMeta.lastPostbackAction is set OUTSIDE the confirmable gate
    expect(WEBHOOK).toMatch(/'notifyMeta\.lastPostbackAction': postbackActionToFlag\(parsed\.action\),/);
    expect(WEBHOOK).toMatch(/be_line_reminder_postback_log/);
  });
});

describe('R11 — [unit] the confirmable decision', () => {
  const confirmable = (status) => {
    const curStatus = String(status || '').toLowerCase();
    return curStatus !== 'cancelled' && curStatus !== 'done' && curStatus !== 'completed';
  };
  test('R11.4 cancelled / done / completed are NOT confirmable (no resurrect / no downgrade)', () => {
    expect(confirmable('cancelled')).toBe(false);
    expect(confirmable('done')).toBe(false);
    expect(confirmable('completed')).toBe(false);
    expect(confirmable('CANCELLED')).toBe(false);   // case-insensitive
  });
  test('R11.5 pending / confirmed (and blank legacy) ARE confirmable', () => {
    expect(confirmable('pending')).toBe(true);
    expect(confirmable('confirmed')).toBe(true);
    expect(confirmable('')).toBe(true);
    expect(confirmable(undefined)).toBe(true);
  });
});
