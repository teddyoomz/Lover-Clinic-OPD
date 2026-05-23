// V120 (2026-05-23) — Card-flow OPD session hides from Clinic queue.
//
// User directive (verbatim): "เมื่อกดปุ่ม 'ส่งลิ้งค์ลูกค้ากรอก OPD' ใน Card
// list ลูกค้า ใน tab นัดหมาย ใน Frontend ไม่ต้องไปสร้างคิวตรง tab คิวหน้า
// Clinic แล้ว เพราะตอนนี้มีปุ่มดูข้อมูล OPD และบันทึกลง OPD เองในหน้านี้แล้ว".
//
// Architectural change: provisionOpdLinkForBookingPair now accepts an opt-in
// hideFromQueue:boolean parameter (default false → preserves V116 behavior
// for AppointmentFormModal + DepositPanel callers). V118's Card flow passes
// hideFromQueue:true → session is created already-hidden + stays hidden on
// re-engage (overrides V116 un-hide-on-re-engage).
//
// Class-of-bug: feature-flag opt-in at the helper boundary. Same family as
// V40's allBranches:true pattern, V19's stockChanged gate, V31's
// includeHidden:true. Closed sanctioned exception list at AV60 grep.

import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '..');
const HELPER = fs.readFileSync(path.join(ROOT, 'src/lib/appointmentDepositBatch.js'), 'utf8');
const ADMIN = fs.readFileSync(path.join(ROOT, 'src/pages/AdminDashboard.jsx'), 'utf8');
const APPT_MODAL = fs.readFileSync(path.join(ROOT, 'src/components/backend/AppointmentFormModal.jsx'), 'utf8');
const DEPOSIT_PANEL = fs.readFileSync(path.join(ROOT, 'src/components/backend/DepositPanel.jsx'), 'utf8');

describe('V120 — provisionOpdLinkForBookingPair hideFromQueue param', () => {
  it('SG1.1 — signature accepts hideFromQueue param (default false)', () => {
    // Lock the param shape so future refactors can't silently drop it.
    expect(HELPER).toMatch(/hideFromQueue\s*=\s*false/);
  });

  it('SG1.2 — mint-fresh path stamps isHiddenFromQueue:true when hideFromQueue is true', () => {
    // Conditional spread `...(hideFromQueue ? {...} : {})` injecting hide fields
    // into the new session payload. Lock the EXACT shape so the field doesn't
    // get accidentally dropped (V12 multi-reader-sweep at session-payload boundary).
    expect(HELPER).toMatch(/hideFromQueue\s*\?\s*\{[\s\S]*?isHiddenFromQueue\s*:\s*true/);
    expect(HELPER).toMatch(/hiddenFromQueueAt\s*:\s*serverTimestamp\(\)/);
    expect(HELPER).toMatch(/hiddenFromQueueReason\s*:\s*['"]card-flow-provision-v120['"]/);
  });

  it('SG1.3 — idempotent path RE-HIDES when hideFromQueue:true (overrides V116 un-hide)', () => {
    // V120: if caller passed hideFromQueue:true AND existing session is
    // currently un-hidden, RE-STAMP isHiddenFromQueue:true. Locks the
    // post-V120 override-V116 path.
    expect(HELPER).toMatch(/if\s*\(\s*hideFromQueue\s*\)\s*\{/);
    expect(HELPER).toMatch(/reHideBatch\.update\([\s\S]*?isHiddenFromQueue\s*:\s*true/);
  });

  it('SG1.4 — V116 un-hide-on-re-engage PRESERVED when hideFromQueue is false (default)', () => {
    // Anti-regression: AppointmentFormModal + DepositPanel paths must STILL
    // see un-hide-on-re-engage behavior. The unhideBatch + 're-engage-provision'
    // reason string must remain in source.
    expect(HELPER).toMatch(/isHiddenFromQueue\s*:\s*false/);
    expect(HELPER).toMatch(/unhiddenFromQueueReason\s*:\s*['"]re-engage-provision['"]/);
  });
});

describe('V120 — Callsite wiring (closed list)', () => {
  it('SG2.1 — AdminDashboard V118 Card-flow callsite passes hideFromQueue:true', () => {
    // V118's handleSendOrViewOpdLink (line ~3788) MUST pass hideFromQueue:true.
    // Simplified to direct file-presence check (regex block capture was
    // brittle — it grabbed comment text). The only handleSendOrViewOpdLink
    // in AdminDashboard.jsx is the V118 handler; the only provisionOpdLinkForBookingPair
    // call in AdminDashboard.jsx is that handler's call. So if BOTH names
    // appear AND `hideFromQueue: true` also appears, the wiring is locked.
    expect(ADMIN).toMatch(/handleSendOrViewOpdLink/);
    expect(ADMIN).toMatch(/provisionOpdLinkForBookingPair\(/);
    expect(ADMIN).toMatch(/hideFromQueue\s*:\s*true/);
    // Also verify the call uses an object literal with at least one of the
    // other expected fields nearby — guards against a stray hideFromQueue
    // literal landing in a totally unrelated spot.
    expect(ADMIN).toMatch(/sessionName[\s\S]{0,200}?hideFromQueue\s*:\s*true|hideFromQueue\s*:\s*true[\s\S]{0,200}?sessionName/);
  });

  it('SG2.2 — AppointmentFormModal (legacy V116 path) does NOT pass hideFromQueue', () => {
    // Anti-regression: the modal path must preserve V116 un-hide-on-re-engage
    // behavior — admin opens "แก้ไขนัด" modal + clicks send-link, expects to
    // see queue entry. NOT yet migrated to Card flow. File-wide grep.
    expect(APPT_MODAL).toMatch(/provisionOpdLinkForBookingPair/);
    expect(APPT_MODAL).not.toMatch(/hideFromQueue/);
  });

  it('SG2.3 — DepositPanel (legacy V116 path) does NOT pass hideFromQueue', () => {
    // Same as SG2.2 — legacy V116 path preserved on DepositPanel.
    expect(DEPOSIT_PANEL).toMatch(/provisionOpdLinkForBookingPair/);
    expect(DEPOSIT_PANEL).not.toMatch(/hideFromQueue/);
  });
});

describe('V120 — Marker comments + institutional memory', () => {
  it('SG3.1 — V120 marker comment present in helper', () => {
    expect(HELPER).toMatch(/V120 \(2026-05-23\)/);
  });

  it('SG3.2 — V120 marker comment present at AdminDashboard call site', () => {
    expect(ADMIN).toMatch(/V120 \(2026-05-23\)/);
  });

  it('SG3.3 — User directive verbatim quoted in helper for future reviewers', () => {
    // The directive quote is part of the contract documentation. Locks it so
    // future maintainers see WHY hideFromQueue exists + when to pass it.
    expect(HELPER).toMatch(/ไม่ต้องไปสร้างคิวตรง tab คิวหน้า Clinic แล้ว/);
  });
});
