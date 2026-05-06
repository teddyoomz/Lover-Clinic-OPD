// ─── Phase 24.0-vicies-novies-bis — handleDepositSync duplicate-deposit fix ──
//
// User-reported bug (2026-05-07, post Phase 24.0-vicies-novies ship):
//   1. "เรื่องมัดจำ แทนที่มันจะไปแก้อันเดิม มันดันไปสร้างมัดจำใหม่ ซึ่งผิด"
//   2. "ใน tab นัดหมาย ก็ไม่ได้แก้ให้ผูกกับ <new customer> ที่เพิ่งบันทึกเข้ามา"
//
// Root cause: handleDepositSync (the "บันทึกลง" handler for the kiosk DEPOSIT
// queue, distinct from handleOpdClick which handles intake forms) had a
// pre-Phase-24.0-vicies-novies createDeposit call that ALWAYS fired on first
// OPD save (gate `alreadySynced` requires brokerProClinicId, which is null
// pre-OPD-save). Phase 24.0-vicies-novies patched ONLY handleOpdClick + the
// session-stamping in confirmCreateDeposit. handleDepositSync was missed →
// kiosk deposit OPD-save still:
//   (a) Created a SECOND duplicate be_deposits doc
//   (b) Never attached the be_appointments doc to the new customer
//
// Fix: handleDepositSync now detects session.linkedDepositId (set by
// confirmCreateDeposit per Phase 24.0-vicies-novies) and:
//   (a) Calls updateDeposit on the EXISTING deposit (no duplicate)
//   (b) Calls attachCustomerToOpdSessionLinks to cascade customer to the
//       linked appointment
// Falls back to legacy createDeposit only when neither linkedDepositId nor
// depositProClinicId is set (pre Phase 24.0-vicies-novies sessions).
//
// Phase 24.0-vicies-novies-bis (2026-05-07).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..');
const ADMIN = fs.readFileSync(
  path.join(ROOT, 'src/pages/AdminDashboard.jsx'),
  'utf8',
);

// Extract the handleDepositSync function block once.
function extractHandleDepositSync() {
  const startIdx = ADMIN.indexOf('const handleDepositSync = async');
  expect(startIdx).toBeGreaterThan(0);
  // The function ends at the `};` followed by the next const/function.
  const tail = ADMIN.slice(startIdx);
  const endIdx = tail.indexOf('const handleDepositCancel');
  expect(endIdx).toBeGreaterThan(0);
  return tail.slice(0, endIdx);
}

describe('Phase 24.0-vicies-novies-bis — handleDepositSync coerceId helper', () => {
  it('VNB.A.1 — coerceId helper defined inside handleDepositSync (V12 healing for legacy object shape)', () => {
    const block = extractHandleDepositSync();
    expect(block).toMatch(
      /const\s+coerceId\s*=\s*\(v\)\s*=>\s*\{[\s\S]{0,300}?typeof\s+v\s*===\s*['"]object['"]\s*&&\s*v\.depositId/,
    );
  });

  it('VNB.A.2 — coerceId returns string for primitive string + extracts depositId from object', () => {
    const block = extractHandleDepositSync();
    expect(block).toMatch(/if\s*\(typeof\s+v\s*===\s*['"]string['"]\)\s*return\s+v/);
    expect(block).toMatch(/return\s+String\(v\.depositId\)/);
  });
});

describe('Phase 24.0-vicies-novies-bis — existingDepositIdForUpdate resolution', () => {
  it('VNB.B.1 — resolution prefers session.depositProClinicId then falls back to session.linkedDepositId', () => {
    const block = extractHandleDepositSync();
    expect(block).toMatch(
      /const\s+existingDepositIdForUpdate\s*=\s*coerceId\(session\.depositProClinicId\)\s*\n\s*\|\|\s*coerceId\(session\.linkedDepositId\)/,
    );
  });

  it('VNB.B.2 — branch on existingDepositIdForUpdate (NOT alreadySynced + depositProClinicId)', () => {
    const block = extractHandleDepositSync();
    // NEW shape: if (existingDepositIdForUpdate)
    expect(block).toMatch(/if\s*\(existingDepositIdForUpdate\)/);
    // OLD shape removed: if (alreadySynced && session.depositProClinicId)
    expect(block).not.toMatch(/if\s*\(alreadySynced\s*&&\s*session\.depositProClinicId\)/);
  });
});

describe('Phase 24.0-vicies-novies-bis — updateDeposit replaces createDeposit on existing path', () => {
  it('VNB.C.1 — calls updateDeposit(existingDepositIdForUpdate, dataForBe) when present', () => {
    const block = extractHandleDepositSync();
    expect(block).toMatch(
      /await\s+updateDeposit\(existingDepositIdForUpdate,\s*dataForBe\)/,
    );
  });

  it('VNB.C.2 — depositId set to existingDepositIdForUpdate (NOT a fresh DEP-{ts} from createDeposit)', () => {
    const block = extractHandleDepositSync();
    expect(block).toMatch(/depositId\s*=\s*existingDepositIdForUpdate/);
  });

  it('VNB.C.3 — createDeposit kept ONLY as legacy fallback (else branch)', () => {
    const block = extractHandleDepositSync();
    // Must still exist for legacy sessions without linkedDepositId
    expect(block).toMatch(/await\s+createDeposit\(dataForBe\)/);
    // BUT it must be inside an else branch (after the existingDepositIdForUpdate path)
    const ifIdx = block.indexOf('if (existingDepositIdForUpdate)');
    const createIdx = block.indexOf('const created = await createDeposit(dataForBe)');
    expect(ifIdx).toBeGreaterThan(0);
    expect(createIdx).toBeGreaterThan(ifIdx);
  });

  it('VNB.C.4 — anti-regression: createDeposit not called when linkedDepositId branch active (no double-create path)', () => {
    const block = extractHandleDepositSync();
    // Pattern: the FIRST createDeposit call must come AFTER the closing } of
    // the if-existingDepositIdForUpdate branch.
    const ifMatch = block.match(/if\s*\(existingDepositIdForUpdate\)\s*\{([\s\S]+?)\}\s*else\s*\{/);
    expect(ifMatch).toBeTruthy();
    // No createDeposit inside the if-branch
    expect(ifMatch[1]).not.toMatch(/createDeposit\(/);
  });
});

describe('Phase 24.0-vicies-novies-bis — attachCustomerToOpdSessionLinks cascade fires', () => {
  it('VNB.D.1 — lazy-imports appointmentDepositBatch + calls attachCustomerToOpdSessionLinks', () => {
    const block = extractHandleDepositSync();
    expect(block).toMatch(/await\s+import\(['"]\.\.\/lib\/appointmentDepositBatch\.js['"]\)/);
    expect(block).toMatch(/mod\.attachCustomerToOpdSessionLinks/);
  });

  it('VNB.D.2 — attach passes sessionId + customerId + customerName + customerHN', () => {
    const block = extractHandleDepositSync();
    expect(block).toMatch(
      /attachCustomerToOpdSessionLinks\(sessionId,\s*\{[\s\S]{0,500}?customerId:\s*proClinicId/,
    );
    expect(block).toMatch(/customerName:\s*dataForBe\.customerName\s*\|\|\s*['"]['"]/);
    expect(block).toMatch(/customerHN:\s*proClinicHN\s*\|\|\s*['"]['"]/);
  });

  it('VNB.D.3 — attach is wrapped in try/catch (best-effort, V31 anti-silent-swallow)', () => {
    const block = extractHandleDepositSync();
    expect(block).toMatch(/console\.warn\([\s\S]{0,200}?attach cascade failed/);
  });

  it('VNB.D.4 — attach result captured into attachResult var (used in toast tally)', () => {
    const block = extractHandleDepositSync();
    expect(block).toMatch(/attachResult\s*=\s*await\s+mod\.attachCustomerToOpdSessionLinks/);
  });

  it('VNB.D.5 — attach is INSIDE the existingDepositIdForUpdate branch (not else)', () => {
    const block = extractHandleDepositSync();
    const ifMatch = block.match(/if\s*\(existingDepositIdForUpdate\)\s*\{([\s\S]+?)\}\s*else\s*\{/);
    expect(ifMatch).toBeTruthy();
    expect(ifMatch[1]).toMatch(/attachCustomerToOpdSessionLinks/);
  });
});

describe('Phase 24.0-vicies-novies-bis — toast surfaces attached count', () => {
  it('VNB.E.1 — toast string interpolates attachedExtra count when > 0', () => {
    const block = extractHandleDepositSync();
    expect(block).toMatch(/บันทึกมัดจำสำเร็จ \+ ผูกนัด \$\{attachedExtra\} รายการ!/);
  });

  it('VNB.E.2 — toast falls back to plain success when attached count = 0', () => {
    const block = extractHandleDepositSync();
    expect(block).toMatch(/บันทึกมัดจำสำเร็จ!/);
  });

  it('VNB.E.3 — attachedExtra reads from attachResult.appointmentCount', () => {
    const block = extractHandleDepositSync();
    expect(block).toMatch(
      /const\s+attachedExtra\s*=\s*\(attachResult\?\.appointmentCount\s*\|\|\s*0\)/,
    );
  });
});

describe('Phase 24.0-vicies-novies-bis — institutional-memory marker', () => {
  it('VNB.F.1 — Phase 24.0-vicies-novies-bis marker present in handleDepositSync block', () => {
    const block = extractHandleDepositSync();
    expect(block).toMatch(/Phase 24\.0-vicies-novies-bis/);
  });

  it('VNB.F.2 — explanatory comment references the user bug report verbatim', () => {
    // Source signal: the fix carries a context comment so future devs see WHY
    // (not just WHAT). Mirrors the V21 anti-regression-comment pattern.
    const block = extractHandleDepositSync();
    expect(block).toMatch(/แทนที่จะแก้อันเดิม มันสร้างมัดจำใหม่|มันดันไปสร้างมัดจำใหม่/);
  });
});
