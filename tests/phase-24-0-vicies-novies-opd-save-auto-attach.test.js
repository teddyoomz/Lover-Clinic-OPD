// ─── Phase 24.0-vicies-novies — OPD-save auto-attach customer-later bookings ──
//
// User directive 2026-05-07 (verbatim): "เวลาเราส่ง link ให้ใครอะ มันสร้าง
// unique link มาอยู่แล้ว มึงก็เอาไปประกอบกับ มัดจำ กับนัดหมาย ดิวะ มันไม่ซ้ำ
// กันอยู่แล้ว พอลูกค้าส่งข้อมูลมาผ่านลิ้งนั้น มันก็ไป match กับ unique link
// ที่บันทึกไปก่อนหน้านี้ ใน มัดจำ กับนัดหมาย ที่มึงเอาไปประกอบไว้ก่อนหน้านี้".
//
// Match key locked: bidirectional `linkedOpdSessionId`:
//   - opd_sessions has linkedDepositId / linkedAppointmentId (existing kiosk flow)
//   - be_deposits + be_appointments carry reverse linkedOpdSessionId (NEW)
// → attachCustomerToOpdSessionLinks queries WHERE linkedOpdSessionId == sessionId
//   AND customerId == '' → batch-attach via writeBatch.
//
// Phone-mismatch resilience: customer can type ANY phone — match is via the
// stamped sessionId, NOT phone. ✅ User's "match ถูก แม้คนละเบอร์" requirement
// is satisfied by design (Q1=Hybrid simplified to Q2=A pre-mint session;
// Q3=REJECTED — no fuzzy matching needed).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');
const PAIR_HELPER = fs.readFileSync(
  path.join(ROOT, 'src/lib/appointmentDepositBatch.js'),
  'utf8',
);
const ADMIN = fs.readFileSync(
  path.join(ROOT, 'src/pages/AdminDashboard.jsx'),
  'utf8',
);

// ─── A. handleOpdClick post-save attach hook ────────────────────────────────
describe('Phase 24.0-vicies-novies — handleOpdClick post-save attach hook', () => {
  it('VN.A.1 — handleOpdClick declares the _attachLinkedBookings closure', () => {
    expect(ADMIN).toMatch(
      /const\s+_attachLinkedBookings\s*=\s*async\s*\(customerId,\s*customerHN\)/,
    );
  });

  it('VN.A.2 — closure builds customerName from prefix + firstname/firstName + lastname/lastName', () => {
    // Patterns inside the closure body (which lives inside handleOpdClick).
    expect(ADMIN).toMatch(/patient\.firstname\s*\|\|\s*patient\.firstName/);
    expect(ADMIN).toMatch(/patient\.lastname\s*\|\|\s*patient\.lastName/);
    expect(ADMIN).toMatch(/`\$\{patient\.prefix\s*\|\|\s*['"]['"]\}\s+\$\{fname\}\s+\$\{lname\}`\.trim\(\)/);
  });

  it('VN.A.3 — closure invokes attachCustomerToOpdSessionLinks via lazy import', () => {
    // Within handleOpdClick scope, the closure imports + calls the helper.
    expect(ADMIN).toMatch(/const\s+mod\s*=\s*await\s+import\(['"]\.\.\/lib\/appointmentDepositBatch\.js['"]\)/);
    expect(ADMIN).toMatch(/mod\.attachCustomerToOpdSessionLinks\s*!==\s*['"]function['"]/);
    expect(ADMIN).toMatch(/await\s+mod\.attachCustomerToOpdSessionLinks\(sessionId,\s*\{/);
  });

  it('VN.A.4 — attach is called in the result.success success path (kiosk + recovery share)', () => {
    expect(ADMIN).toMatch(
      /if\s*\(result\?\.success\)\s*\{[\s\S]{0,800}?await\s+_attachLinkedBookings\(result\.proClinicId,\s*result\.proClinicHN\)/,
    );
  });

  it('VN.A.5 — attach is called in the relink-to-existing-customer path', () => {
    expect(ADMIN).toMatch(
      /await\s+_attachLinkedBookings\(existing\.customer\.id,\s*existing\.customer\.hn_no\s*\|\|\s*''\)/,
    );
  });

  it('VN.A.6 — attach is called in the create-new-after-relink-failed path', () => {
    expect(ADMIN).toMatch(
      /await\s+_attachLinkedBookings\(created\.id,\s*created\.hn\s*\|\|\s*''\)/,
    );
  });

  it('VN.A.7 — closure surfaces success toast with attached count when total>0', () => {
    expect(ADMIN).toMatch(
      /showToast\(`บันทึกลง OPD สำเร็จ \+ ผูกนัด\/มัดจำ \$\{total\} รายการ`\)/,
    );
  });

  it('VN.A.8 — closure surfaces degraded-toast on attach failure (V31 anti-silent-swallow)', () => {
    expect(ADMIN).toMatch(/บันทึก OPD สำเร็จ — ผูกนัด\/มัดจำล้มเหลว/);
  });

  it('VN.A.9 — closure logs error via console.warn (V31 classify-not-swallow)', () => {
    expect(ADMIN).toMatch(
      /console\.warn\([\s\S]{0,200}?attachCustomerToOpdSessionLinks failed/,
    );
  });

  it('VN.A.10 — closure short-circuits when customerId empty (no-op)', () => {
    // The early-return pattern is unique enough to grep globally.
    expect(ADMIN).toMatch(/_attachLinkedBookings\s*=\s*async\s*\(customerId,\s*customerHN\)\s*=>\s*\{\s*\n\s*if\s*\(!customerId\)\s+return\s+null/);
  });
});

// ─── B. linkedOpdSessionId stamped at booking creation (kiosk flows) ────────
describe('Phase 24.0-vicies-novies — kiosk-flow linkedOpdSessionId stamping', () => {
  it('VN.B.1 — confirmCreateDeposit pair-helper call passes linkedOpdSessionId: sessionId', () => {
    // The pair-helper kiosk path (hasAppointment=true)
    expect(ADMIN).toMatch(
      /await\s+createDepositBookingPair\(\{\s*[\s\S]{0,500}?linkedOpdSessionId:\s*sessionId/,
    );
  });

  it('VN.B.2 — confirmCreateDeposit deposit-only branch follows up with updateDoc to stamp linkedOpdSessionId', () => {
    // The deposit-only path uses createDeposit (which doesn't accept the
    // field), so the stamp lands via a separate updateDoc on be_deposits.
    expect(ADMIN).toMatch(
      /if\s*\(!pairResult\)\s*\{[\s\S]{0,600}?'be_deposits'[\s\S]{0,200}?linkedOpdSessionId:\s*sessionId/,
    );
  });

  it('VN.B.3 — confirmCreateNoDeposit createBackendAppointment payload includes linkedOpdSessionId', () => {
    // Increased bound to {0,4000} to span the full payload (~30 fields).
    expect(ADMIN).toMatch(
      /await\s+createBackendAppointment\(\{\s*[\s\S]{0,4000}?linkedOpdSessionId:\s*sessionId/,
    );
  });

  it('VN.B.4 — confirmCreateNoDeposit also stamps linkedAppointmentId on the kiosk session doc', () => {
    // The stamp is unique to this site (apptResult is a local var only here).
    expect(ADMIN).toMatch(/linkedAppointmentId:\s*apptResult\.appointmentId/);
  });

  it('VN.B.5 — sessionId prefix DEP- preserved (kiosk deposit) for forensic trail', () => {
    expect(ADMIN).toMatch(/const\s+sessionId\s*=\s*`DEP-\$\{shortId\}`/);
  });

  it('VN.B.6 — sessionId prefix ND- preserved (kiosk no-deposit) for forensic trail', () => {
    expect(ADMIN).toMatch(/const\s+sessionId\s*=\s*`ND-\$\{shortId\}`/);
  });
});

// ─── C. attachCustomerToOpdSessionLinks helper (input validation) ───────────
describe('Phase 24.0-vicies-novies — attachCustomerToOpdSessionLinks helper', () => {
  it('VN.C.1 — helper exported from appointmentDepositBatch.js', () => {
    expect(PAIR_HELPER).toMatch(
      /export\s+async\s+function\s+attachCustomerToOpdSessionLinks/,
    );
  });

  it('VN.C.2 — helper rejects when sessionId missing', async () => {
    const { attachCustomerToOpdSessionLinks } = await import(
      '../src/lib/appointmentDepositBatch.js'
    );
    await expect(
      attachCustomerToOpdSessionLinks('', { customerId: 'C-1' }),
    ).rejects.toThrow(/sessionId required/);
  });

  it('VN.C.3 — helper rejects when customerId missing', async () => {
    const { attachCustomerToOpdSessionLinks } = await import(
      '../src/lib/appointmentDepositBatch.js'
    );
    await expect(
      attachCustomerToOpdSessionLinks('DEP-XYZ', { customerId: '' }),
    ).rejects.toThrow(/customerId required/);
  });

  it('VN.C.4 — helper rejects when args object missing', async () => {
    const { attachCustomerToOpdSessionLinks } = await import(
      '../src/lib/appointmentDepositBatch.js'
    );
    await expect(
      attachCustomerToOpdSessionLinks('DEP-XYZ'),
    ).rejects.toThrow(/customerId required/);
  });

  it('VN.C.5 — helper queries by linkedOpdSessionId AND customerId (idempotent filter)', () => {
    // Direct grep — these patterns are unique to the new helper.
    expect(PAIR_HELPER).toMatch(/where\(['"]linkedOpdSessionId['"],\s*['"]==['"],\s*String\(sessionId\)\)/);
    expect(PAIR_HELPER).toMatch(/where\(['"]customerId['"],\s*['"]==['"],\s*['"]['"]\)/);
  });

  it('VN.C.6 — helper queries BOTH be_deposits + be_appointments collections', () => {
    expect(PAIR_HELPER).toMatch(/query\(\s*depositsCol\(\)/);
    expect(PAIR_HELPER).toMatch(/query\(\s*appointmentsCol\(\)/);
  });

  it('VN.C.7 — helper uses writeBatch atomic commit', () => {
    expect(PAIR_HELPER).toMatch(/writeBatch\(db\)/);
    expect(PAIR_HELPER).toMatch(/await\s+batch\.commit\(\)/);
  });

  it('VN.C.8 — helper stamps customerLinkedAt + customerLinkedFrom forensic fields (Rule M)', () => {
    expect(PAIR_HELPER).toMatch(/customerLinkedFrom:\s*['"]opd-save-auto['"]/);
    expect(PAIR_HELPER).toMatch(/customerLinkedAt:\s*now/);
  });

  it('VN.C.9 — helper preserves customerNameTemp + customerPhoneTemp (forensic trail)', () => {
    // Source signal: customerFields object exists + does NOT clear temp fields.
    const block = PAIR_HELPER.match(
      /const\s+customerFields\s*=\s*\{[\s\S]{0,800}?\};/,
    );
    expect(block).toBeTruthy();
    expect(block[0]).not.toMatch(/customerNameTemp:\s*['"]['"]/);
    expect(block[0]).not.toMatch(/customerPhoneTemp:\s*['"]['"]/);
  });

  it('VN.C.10 — helper short-circuits with empty result shape when no matches found', () => {
    expect(PAIR_HELPER).toMatch(/if\s*\(depSnap\.size\s*===\s*0\s*&&\s*apptSnap\.size\s*===\s*0\)/);
  });

  it('VN.C.11 — helper return shape includes sessionId + counts + ids', () => {
    // Final return includes all four named fields.
    expect(PAIR_HELPER).toMatch(/depositCount:\s*depSnap\.size/);
    expect(PAIR_HELPER).toMatch(/appointmentCount:\s*apptSnap\.size/);
    expect(PAIR_HELPER).toMatch(/depositIds,/);
    expect(PAIR_HELPER).toMatch(/appointmentIds,/);
  });
});

// ─── D. Payload-builder linkedOpdSessionId persistence ──────────────────────
describe('Phase 24.0-vicies-novies — payload builders carry linkedOpdSessionId', () => {
  it('VN.D.1 — buildAppointmentPairPayload accepts linkedOpdSessionId opt + persists field', async () => {
    const { buildAppointmentPairPayload } = await import(
      '../src/lib/appointmentDepositBatch.js'
    );
    const payload = buildAppointmentPairPayload({
      depositData: { appointment: { date: '2026-06-01', startTime: '10:00' } },
      depositId: 'DEP-T1',
      appointmentId: 'BA-T1',
      branchId: 'BR-X',
      linkedOpdSessionId: 'DEP-XYZ',
    });
    expect(payload.linkedOpdSessionId).toBe('DEP-XYZ');
  });

  it('VN.D.2 — buildAppointmentPairPayload defaults linkedOpdSessionId to empty string', async () => {
    const { buildAppointmentPairPayload } = await import(
      '../src/lib/appointmentDepositBatch.js'
    );
    const payload = buildAppointmentPairPayload({
      depositData: { appointment: { date: '2026-06-01', startTime: '10:00' } },
      depositId: 'DEP-T1',
      appointmentId: 'BA-T1',
      branchId: 'BR-X',
    });
    expect(payload.linkedOpdSessionId).toBe('');
  });

  it('VN.D.3 — buildDepositPairPayload accepts linkedOpdSessionId opt + persists field', async () => {
    const { buildDepositPairPayload } = await import(
      '../src/lib/appointmentDepositBatch.js'
    );
    const payload = buildDepositPairPayload({
      depositData: { amount: 1000, hasAppointment: true, appointment: {} },
      depositId: 'DEP-T2',
      appointmentId: 'BA-T2',
      branchId: 'BR-X',
      linkedOpdSessionId: 'BL-12345',
    });
    expect(payload.linkedOpdSessionId).toBe('BL-12345');
  });

  it('VN.D.4 — buildDepositPairPayload defaults linkedOpdSessionId to empty string', async () => {
    const { buildDepositPairPayload } = await import(
      '../src/lib/appointmentDepositBatch.js'
    );
    const payload = buildDepositPairPayload({
      depositData: { amount: 500, hasAppointment: true, appointment: {} },
      depositId: 'DEP-T3',
      appointmentId: 'BA-T3',
      branchId: 'BR-X',
    });
    expect(payload.linkedOpdSessionId).toBe('');
  });

  it('VN.D.5 — createDepositBookingPair signature accepts linkedOpdSessionId', () => {
    // Function signature contains the new param with default empty string.
    expect(PAIR_HELPER).toMatch(
      /export\s+async\s+function\s+createDepositBookingPair\(\{\s*[\s\S]{0,1000}?linkedOpdSessionId\s*=\s*['"]['"]/,
    );
  });

  it('VN.D.6 — createDepositBookingPair forwards linkedOpdSessionId to BOTH builders', () => {
    const block = PAIR_HELPER.match(
      /export\s+async\s+function\s+createDepositBookingPair[\s\S]{0,4000}?await\s+batch\.commit\(\)/,
    );
    expect(block).toBeTruthy();
    // Forwarded twice (once to deposit builder, once to appointment builder).
    const forwards = block[0].match(/linkedOpdSessionId,/g) || [];
    expect(forwards.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── E. Adversarial / institutional-memory ──────────────────────────────────
describe('Phase 24.0-vicies-novies — adversarial + institutional-memory', () => {
  it('VN.E.1 — attach helper uses query/where/getDocs (NOT a full collection scan)', () => {
    expect(PAIR_HELPER).toMatch(/query\(\s*depositsCol/);
    expect(PAIR_HELPER).toMatch(/getDocs\(/);
  });

  it('VN.E.2 — attach helper uses Promise.all to parallelize the two queries', () => {
    expect(PAIR_HELPER).toMatch(/Promise\.all\(\[\s*\n\s*getDocs/);
  });

  it('VN.E.3 — institutional-memory marker present', () => {
    expect(PAIR_HELPER).toMatch(
      /MARKER:\s*phase-24-0-vicies-novies-attach-customer-to-opd-session-links/,
    );
  });

  it('VN.E.4 — Phase 24.0-vicies-novies marker in source code', () => {
    expect(PAIR_HELPER).toMatch(/Phase 24\.0-vicies-novies/);
    expect(ADMIN).toMatch(/Phase 24\.0-vicies-novies/);
  });

  it('VN.E.5 — attach helper does NOT match on phone (Q1=simplified-token-only lock)', () => {
    // User explicitly rejected phone fallback in brainstorming Q3=REJECTED.
    // This test guards against regression where someone re-adds phone-match.
    // Check ONLY within attachCustomerToOpdSessionLinks function body.
    const block = PAIR_HELPER.match(
      /export\s+async\s+function\s+attachCustomerToOpdSessionLinks[\s\S]+?(?=export\s+async\s+function|MARKER:)/,
    );
    expect(block).toBeTruthy();
    expect(block[0]).not.toMatch(/where\(['"]customerPhoneTemp['"]/);
    expect(block[0]).not.toMatch(/where\(['"]customerNameTemp['"]/);
    expect(block[0]).not.toMatch(/Levenshtein|fuzzy/i);
  });

  it('VN.E.6 — V12 multi-writer-sweep: BOTH halves of the pair must stamp linkedOpdSessionId', () => {
    // Anti-regression: if someone removes the field from one builder but not
    // the other, the bidirectional invariant breaks → fewer matches at OPD save.
    // Increased upper bounds — full builder bodies are large.
    expect(PAIR_HELPER).toMatch(
      /buildDepositPairPayload[\s\S]+?linkedOpdSessionId:\s*linkedOpdSessionId\s*\|\|\s*['"]['"]/,
    );
    expect(PAIR_HELPER).toMatch(
      /buildAppointmentPairPayload[\s\S]+?linkedOpdSessionId:\s*linkedOpdSessionId\s*\|\|\s*['"]['"]/,
    );
  });

  it('VN.E.7 — opd-save attach is wrapped in try/catch (best-effort, V31 anti-silent-swallow)', () => {
    // The closure has try/catch — both the try block and catch handler exist.
    expect(ADMIN).toMatch(/_attachLinkedBookings/);
    expect(ADMIN).toMatch(/attachCustomerToOpdSessionLinks failed/);
    expect(ADMIN).toMatch(/console\.warn/);
  });
});
