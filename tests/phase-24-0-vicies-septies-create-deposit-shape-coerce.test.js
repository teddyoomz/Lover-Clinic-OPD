// ─── Phase 24.0-vicies-septies — createDeposit return-shape mismatch ────
//
// User report 2026-05-06: "เพิ่มนัดหมายไม่สำเร็จ:
// createAppointmentForExistingDeposit: deposit [object Object] not found".
//
// Root cause: src/lib/backendClient.js createDeposit returns
//   { depositId, success: true }
// but confirmCreateDeposit's deposit-only path stored the WHOLE OBJECT on
// opd_sessions.linkedDepositId via:
//   depositId = await createDeposit(depositOnlyPayload);  // ← whole object!
//   updateDoc(ref, { linkedDepositId: depositId, ... });  // ← stamps obj
//
// Subsequent handleSaveDepositData cascade reads sess.linkedDepositId
// (an object), passes to createAppointmentForExistingDeposit which calls
// String(depositId) → "[object Object]" → getDoc fails → "not found".
//
// Fix:
//   1. Extract `.depositId` from createDeposit() return value (write-side):
//        const created = await createDeposit(...);
//        depositId = created?.depositId || null;
//      Mirrors the pair-helper path which already does
//      `pairResult?.depositId`.
//   2. Defensive coerceId helper on READ paths (heals legacy broken records
//      where opd_sessions.linkedDepositId is the whole object). Applied in:
//        - handleSaveDepositData (cascade)
//        - handleDepositCancel (kiosk cancel)
//        - renderDepositConfirmModal archive branch
//        - AppointmentCalendarView delete-handler

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');
const ADMIN = fs.readFileSync(
  path.join(ROOT, 'src/pages/AdminDashboard.jsx'),
  'utf8',
);
const VIEW = fs.readFileSync(
  path.join(ROOT, 'src/components/backend/AppointmentCalendarView.jsx'),
  'utf8',
);

describe('Phase 24.0-vicies-septies — write-side fix (extract createDeposit().depositId)', () => {
  it('VST.A.1 — confirmCreateDeposit deposit-only branch extracts createdDeposit?.depositId', () => {
    // Find the deposit-only branch (else of `if (depositFormData.hasAppointment)`).
    expect(ADMIN).toMatch(
      /const\s+createdDeposit\s*=\s*await\s+createDeposit\(depositOnlyPayload\)/,
    );
    expect(ADMIN).toMatch(
      /depositId\s*=\s*createdDeposit\?\.depositId\s*\|\|\s*null/,
    );
  });

  it('VST.A.2 — anti-regression: no longer assigns whole object to depositId', () => {
    // The pre-fix line `depositId = await createDeposit(depositOnlyPayload);`
    // (without extraction) must not appear inside confirmCreateDeposit.
    const startIdx = ADMIN.indexOf('const confirmCreateDeposit = async');
    const endIdx = ADMIN.indexOf('const confirmCreateNoDeposit = async', startIdx);
    expect(startIdx).toBeGreaterThan(0);
    expect(endIdx).toBeGreaterThan(startIdx);
    const block = ADMIN.slice(startIdx, endIdx);
    expect(block).not.toMatch(/^\s*depositId\s*=\s*await\s+createDeposit\(depositOnlyPayload\)/m);
  });

  it('VST.A.3 — Phase 24.0-vicies-septies marker present', () => {
    expect(ADMIN).toMatch(/Phase 24\.0-vicies-septies/);
  });
});

describe('Phase 24.0-vicies-septies — read-side coerceId helpers (legacy data healing)', () => {
  it('VST.B.1 — handleSaveDepositData defines coerceId + uses it for depIdForCascade', () => {
    expect(ADMIN).toMatch(
      /const\s+coerceId\s*=\s*\(v\)\s*=>\s*\{[\s\S]{0,300}?typeof\s+v\s*===\s*['"]object['"]\s*&&\s*v\.depositId/,
    );
    expect(ADMIN).toMatch(
      /let\s+depIdForCascade\s*=\s*coerceId\(sess\?\.depositProClinicId\)/,
    );
  });

  it('VST.B.2 — cascade uses coerceId for freshDepId', () => {
    expect(ADMIN).toMatch(
      /const\s+freshDepId\s*=\s*coerceId\(freshSess\?\.depositProClinicId\)/,
    );
  });

  it('VST.B.3 — handleDepositCancel uses _coerceDepId for cancel id', () => {
    // Within handleDepositCancel function body.
    const startIdx = ADMIN.indexOf('const handleDepositCancel = async');
    const endIdx = ADMIN.indexOf('const handleSaveDepositData', startIdx);
    const block = ADMIN.slice(startIdx, endIdx);
    expect(block).toMatch(/const\s+_coerceDepId\s*=\s*\(v\)\s*=>/);
    expect(block).toMatch(
      /const\s+depIdForCancel\s*=\s*_coerceDepId\(session\.depositProClinicId\)/,
    );
  });

  it('VST.B.4 — renderDepositConfirmModal archive branch uses _coerce helper', () => {
    expect(ADMIN).toMatch(
      /const\s+_coerce\s*=\s*\(v\)\s*=>\s*\([\s\S]{0,300}?typeof\s+v\s*===\s*['"]object['"]\s*&&\s*v\.depositId/,
    );
    expect(ADMIN).toMatch(
      /const\s+depIdForCancel\s*=\s*_coerce\(dSess\.depositProClinicId\)/,
    );
  });

  it('VST.B.5 — AppointmentCalendarView delete-handler uses _coerceDepId', () => {
    expect(VIEW).toMatch(
      /const\s+_coerceDepId\s*=\s*\(v\)\s*=>\s*\([\s\S]{0,300}?typeof\s+v\s*===\s*['"]object['"]\s*&&\s*v\.depositId/,
    );
    expect(VIEW).toMatch(
      /const\s+linkedDepositId\s*=\s*_coerceDepId\(formMode\.appt\.linkedDepositId\)/,
    );
  });

  it('VST.B.6 — Phase 24.0-vicies-septies marker present in calendar view', () => {
    expect(VIEW).toMatch(/Phase 24\.0-vicies-septies/);
  });
});

describe('Phase 24.0-vicies-septies — full-flow simulate (Rule I)', () => {
  it('VST.F.1 — coerceId returns string from {depositId, success} object (legacy broken doc)', () => {
    const coerceId = (v) => (
      !v ? '' :
      typeof v === 'string' ? v :
      typeof v === 'object' && v.depositId ? String(v.depositId) :
      String(v)
    );
    expect(coerceId({ depositId: 'DEP-1234', success: true })).toBe('DEP-1234');
  });

  it('VST.F.2 — coerceId pass-through for valid string (post-fix happy path)', () => {
    const coerceId = (v) => (
      !v ? '' :
      typeof v === 'string' ? v :
      typeof v === 'object' && v.depositId ? String(v.depositId) :
      String(v)
    );
    expect(coerceId('DEP-1234')).toBe('DEP-1234');
  });

  it('VST.F.3 — coerceId returns "" for null/undefined/empty (gate skips cascade)', () => {
    const coerceId = (v) => (
      !v ? '' :
      typeof v === 'string' ? v :
      typeof v === 'object' && v.depositId ? String(v.depositId) :
      String(v)
    );
    expect(coerceId(null)).toBe('');
    expect(coerceId(undefined)).toBe('');
    expect(coerceId('')).toBe('');
    expect(coerceId(0)).toBe('');
  });

  it('VST.F.4 — write-side fix: createDeposit returns {depositId,success} → extract string', () => {
    // Mirror confirmCreateDeposit deposit-only branch.
    const createDeposit = async () => ({ depositId: 'DEP-NEW-1', success: true });
    const main = async () => {
      const createdDeposit = await createDeposit();
      const depositId = createdDeposit?.depositId || null;
      return depositId;
    };
    return main().then(id => {
      expect(id).toBe('DEP-NEW-1');
      // Pre-fix would have stored the whole object: { depositId: 'DEP-NEW-1', success: true }
      expect(typeof id).toBe('string');
    });
  });

  it('VST.F.5 — anti-regression: pre-fix bug shape', () => {
    // Pre-fix line: `depositId = await createDeposit(...)` stored whole object.
    // String() on that object → "[object Object]" → "deposit [object Object] not found".
    const fakeReturn = { depositId: 'DEP-X', success: true };
    const preFixDepositId = fakeReturn; // whole obj, no extraction
    const stringified = String(preFixDepositId);
    expect(stringified).toBe('[object Object]'); // confirms the bug shape
  });

  it('VST.F.6 — read-side defense: legacy broken doc with object linkedDepositId now heals', () => {
    // Existing broken sess from pre-fix kiosk creates.
    const sess = {
      linkedDepositId: { depositId: 'DEP-LEGACY', success: true },
      depositProClinicId: '',
    };
    const coerceId = (v) => (
      !v ? '' :
      typeof v === 'string' ? v :
      typeof v === 'object' && v.depositId ? String(v.depositId) :
      String(v)
    );
    const depIdForCascade = coerceId(sess.depositProClinicId)
      || coerceId(sess.linkedDepositId)
      || '';
    expect(depIdForCascade).toBe('DEP-LEGACY');
    // Cascade now succeeds with the extracted string id.
  });
});
