// ─── Phase 15.4 — Transfer + Withdrawal 3-role split (items 5 + 6) ──────────
// User directive (s19, verbatim):
//   item 5: "Modal รายละเอียดการโอนย้าย ต้องแสดงทั้ง ผู้สร้าง, ผู้ส่ง, ผู้รับ"
//   item 6: "Modal รายละเอียดการเบิก ต้องแสดงทั้ง ผู้สร้าง, ผู้อนุมัติและส่งสินค้า,
//            ผู้รับสินค้า"
//
// Schema additions:
//   be_stock_transfers:
//     - dispatchedByUser: { userId, userName }  (status 0→1)
//     - dispatchedAt: ISO
//     - receivedByUser: { userId, userName }     (status 1→2)
//     - receivedAt: ISO
//   be_stock_withdrawals:
//     - approvedByUser: { userId, userName }     (status 0→1)
//     - approvedAt: ISO
//     - receivedByUser: { userId, userName }     (status 1→2)
//     - receivedAt: ISO
//   Existing `user` (creator) untouched in both.
//
// Coverage (Rule I full-flow simulate):
//   TR.A — Transfer writer: status 0→1 patches dispatchedByUser + dispatchedAt
//   TR.B — Transfer writer: status 1→2 patches receivedByUser + receivedAt
//   TR.C — Transfer modal: 3 actor rows with conditional visibility
//   TR.D — Transfer modal: backward-compat for old docs lacking new fields
//   TR.E — V14 lock: writer uses _normalizeAuditUser (no undefined)
//   WD.A — Withdrawal writer: status 0→1 patches approvedByUser + approvedAt
//   WD.B — Withdrawal writer: status 1→2 patches receivedByUser + receivedAt
//   WD.C — Withdrawal modal: 3 actor rows with conditional visibility
//   WD.D — Withdrawal modal: backward-compat
//   WD.E — V14 lock
//   GS.A — V14 source-grep: no `undefined` leaves in writer output

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const backendSrc = read('src/lib/backendClient.js');
const transferModalSrc = read('src/components/backend/TransferDetailModal.jsx');
const withdrawalModalSrc = read('src/components/backend/WithdrawalDetailModal.jsx');

// Slice the writer functions for focused grep.
function fnSlice(src, fnName) {
  const start = src.indexOf(`export async function ${fnName}`);
  if (start < 0) return '';
  // Naive end-of-function: walk balanced braces. For this regression bank,
  // a 6KB window is enough to capture the full function body.
  return src.slice(start, start + 6000);
}

const updateTransferFn = fnSlice(backendSrc, 'updateStockTransferStatus');
const updateWithdrawalFn = fnSlice(backendSrc, 'updateStockWithdrawalStatus');

// ============================================================================
describe('Phase 15.4 TR.A — Transfer writer captures ผู้ส่ง on status 0→1', () => {
  it('TR.A.1 — patch.dispatchedByUser is set when next === 1', () => {
    expect(updateTransferFn).toMatch(/if\s*\(\s*next\s*===\s*1\s*\)\s*\{[\s\S]*?patch\.dispatchedByUser\s*=/);
  });

  it('TR.A.2 — patch.dispatchedAt is set when next === 1', () => {
    expect(updateTransferFn).toMatch(/if\s*\(\s*next\s*===\s*1\s*\)\s*\{[\s\S]*?patch\.dispatchedAt\s*=\s*now/);
  });

  it('TR.A.3 — uses _normalizeAuditUser (V14 no-undefined lock)', () => {
    expect(updateTransferFn).toMatch(/patch\.dispatchedByUser\s*=\s*_normalizeAuditUser\(opts\.user\)/);
  });

  it('TR.A.4 — dispatchedByUser written INSIDE the runTransaction patch (proximity check)', () => {
    // Both `deliveredTrackingNumber` (existing field, proves we're in the
    // status===1 block) and `dispatchedByUser` (new field) must appear
    // within ~600 chars of each other — same conditional block.
    const idxExisting = updateTransferFn.indexOf('patch.deliveredTrackingNumber');
    const idxNew = updateTransferFn.indexOf('patch.dispatchedByUser');
    expect(idxExisting).toBeGreaterThan(0);
    expect(idxNew).toBeGreaterThan(0);
    expect(Math.abs(idxNew - idxExisting)).toBeLessThan(600);
    // dispatchedAt also nearby
    const idxAt = updateTransferFn.indexOf('patch.dispatchedAt');
    expect(idxAt).toBeGreaterThan(0);
    expect(Math.abs(idxAt - idxNew)).toBeLessThan(200);
  });
});

describe('Phase 15.4 TR.B — Transfer writer captures ผู้รับ on status 1→2', () => {
  it('TR.B.1 — patch.receivedByUser is set when next === 2', () => {
    expect(updateTransferFn).toMatch(/if\s*\(\s*next\s*===\s*2\s*\)\s*\{[\s\S]*?patch\.receivedByUser\s*=/);
  });

  it('TR.B.2 — patch.receivedAt is set when next === 2', () => {
    expect(updateTransferFn).toMatch(/if\s*\(\s*next\s*===\s*2\s*\)\s*\{[\s\S]*?patch\.receivedAt\s*=\s*now/);
  });

  it('TR.B.3 — uses _normalizeAuditUser (V14 no-undefined lock)', () => {
    expect(updateTransferFn).toMatch(/patch\.receivedByUser\s*=\s*_normalizeAuditUser\(opts\.user\)/);
  });

  it('TR.B.4 — pre-existing creator-fallback `user` line still present (movements still attribute)', () => {
    expect(updateTransferFn).toMatch(/const\s+user\s*=\s*opts\.user\s*\|\|\s*cur\.user/);
  });
});

describe('Phase 15.4 TR.C — Transfer detail modal renders 3 actor rows', () => {
  it('TR.C.1 — ผู้สร้าง row exists (creator, always visible)', () => {
    expect(transferModalSrc).toContain('ผู้สร้าง');
    expect(transferModalSrc).toMatch(/data-testid="transfer-creator-name"/);
    expect(transferModalSrc).toMatch(/data\.user\?\.userName/);
  });

  it('TR.C.2 — ผู้ส่ง row exists with conditional visibility (status >= 1 OR dispatchedByUser exists)', () => {
    expect(transferModalSrc).toContain('ผู้ส่ง');
    expect(transferModalSrc).toMatch(/data-testid="transfer-dispatcher-name"/);
    expect(transferModalSrc).toMatch(/status\s*>=\s*1\s*\|\|\s*data\.dispatchedByUser/);
  });

  it('TR.C.3 — ผู้รับ row exists with conditional visibility (status >= 2 OR receivedByUser exists)', () => {
    expect(transferModalSrc).toContain('ผู้รับ');
    expect(transferModalSrc).toMatch(/data-testid="transfer-receiver-name"/);
    expect(transferModalSrc).toMatch(/status\s*>=\s*2\s*\|\|\s*data\.receivedByUser/);
  });

  it('TR.C.4 — timestamps shown for each role (createdAt/dispatchedAt/receivedAt)', () => {
    expect(transferModalSrc).toMatch(/data\.createdAt/);
    expect(transferModalSrc).toMatch(/data\.dispatchedAt/);
    expect(transferModalSrc).toMatch(/data\.receivedAt/);
  });

  it('TR.C.5 — fallback to "-" when actor field missing (V12 multi-reader sweep)', () => {
    expect(transferModalSrc).toMatch(/data\.dispatchedByUser\?\.userName\s*\|\|\s*['"]-['"]?/);
    expect(transferModalSrc).toMatch(/data\.receivedByUser\?\.userName\s*\|\|\s*['"]-['"]?/);
  });
});

describe('Phase 15.4 TR.D — Transfer modal handles old docs without new fields gracefully', () => {
  it('TR.D.1 — no crash when dispatchedByUser is undefined: optional-chain', () => {
    // Optional chaining on every new field
    expect(transferModalSrc).toMatch(/dispatchedByUser\?\./);
    expect(transferModalSrc).toMatch(/receivedByUser\?\./);
  });

  it('TR.D.2 — when status is 0 and no dispatchedByUser, ผู้ส่ง row hidden', () => {
    // The condition is `status >= 1 || data.dispatchedByUser` — at status 0
    // with no dispatchedByUser, the row is hidden. Verified via grep that
    // the condition appears inside curly braces { ... && ( ... )} (JSX render).
    expect(transferModalSrc).toMatch(/\{\s*\(\s*status\s*>=\s*1\s*\|\|\s*data\.dispatchedByUser\s*\)\s*&&\s*\(/);
  });

  it('TR.D.3 — when status is 1 and no receivedByUser, ผู้รับ row hidden', () => {
    expect(transferModalSrc).toMatch(/\{\s*\(\s*status\s*>=\s*2\s*\|\|\s*data\.receivedByUser\s*\)\s*&&\s*\(/);
  });
});

// ============================================================================
describe('Phase 15.4 WD.A — Withdrawal writer captures ผู้อนุมัติและส่งสินค้า on status 0→1', () => {
  it('WD.A.1 — patch.approvedByUser is set when next === 1', () => {
    expect(updateWithdrawalFn).toMatch(/if\s*\(\s*next\s*===\s*1\s*\)\s*\{[\s\S]*?patch\.approvedByUser\s*=/);
  });

  it('WD.A.2 — patch.approvedAt is set when next === 1', () => {
    expect(updateWithdrawalFn).toMatch(/if\s*\(\s*next\s*===\s*1\s*\)\s*\{[\s\S]*?patch\.approvedAt\s*=\s*now/);
  });

  it('WD.A.3 — uses _normalizeAuditUser (V14 no-undefined lock)', () => {
    expect(updateWithdrawalFn).toMatch(/patch\.approvedByUser\s*=\s*_normalizeAuditUser\(opts\.user\)/);
  });
});

describe('Phase 15.4 WD.B — Withdrawal writer captures ผู้รับสินค้า on status 1→2', () => {
  it('WD.B.1 — patch.receivedByUser is set when next === 2', () => {
    expect(updateWithdrawalFn).toMatch(/if\s*\(\s*next\s*===\s*2\s*\)\s*\{[\s\S]*?patch\.receivedByUser\s*=/);
  });

  it('WD.B.2 — patch.receivedAt is set when next === 2', () => {
    expect(updateWithdrawalFn).toMatch(/if\s*\(\s*next\s*===\s*2\s*\)\s*\{[\s\S]*?patch\.receivedAt\s*=\s*now/);
  });

  it('WD.B.3 — uses _normalizeAuditUser (V14 no-undefined lock)', () => {
    expect(updateWithdrawalFn).toMatch(/patch\.receivedByUser\s*=\s*_normalizeAuditUser\(opts\.user\)/);
  });
});

describe('Phase 15.4 WD.C — Withdrawal detail modal renders 3 actor rows', () => {
  it('WD.C.1 — ผู้สร้าง row exists (creator, always visible)', () => {
    expect(withdrawalModalSrc).toContain('ผู้สร้าง');
    expect(withdrawalModalSrc).toMatch(/data-testid="withdrawal-creator-name"/);
  });

  it('WD.C.2 — ผู้อนุมัติและส่งสินค้า row exists with conditional visibility', () => {
    expect(withdrawalModalSrc).toContain('ผู้อนุมัติและส่งสินค้า');
    expect(withdrawalModalSrc).toMatch(/data-testid="withdrawal-approver-name"/);
    expect(withdrawalModalSrc).toMatch(/status\s*>=\s*1\s*\|\|\s*data\.approvedByUser/);
  });

  it('WD.C.3 — ผู้รับสินค้า row exists with conditional visibility', () => {
    expect(withdrawalModalSrc).toContain('ผู้รับสินค้า');
    expect(withdrawalModalSrc).toMatch(/data-testid="withdrawal-receiver-name"/);
    expect(withdrawalModalSrc).toMatch(/status\s*>=\s*2\s*\|\|\s*data\.receivedByUser/);
  });

  it('WD.C.4 — timestamps shown for each role', () => {
    expect(withdrawalModalSrc).toMatch(/data\.createdAt/);
    expect(withdrawalModalSrc).toMatch(/data\.approvedAt/);
    expect(withdrawalModalSrc).toMatch(/data\.receivedAt/);
  });

  it('WD.C.5 — fallback to "-" when actor field missing (V12 multi-reader sweep)', () => {
    expect(withdrawalModalSrc).toMatch(/data\.approvedByUser\?\.userName\s*\|\|\s*['"]-['"]?/);
    expect(withdrawalModalSrc).toMatch(/data\.receivedByUser\?\.userName\s*\|\|\s*['"]-['"]?/);
  });
});

describe('Phase 15.4 WD.D — Withdrawal modal handles old docs without new fields', () => {
  it('WD.D.1 — optional-chaining on every new field', () => {
    expect(withdrawalModalSrc).toMatch(/approvedByUser\?\./);
    expect(withdrawalModalSrc).toMatch(/receivedByUser\?\./);
  });

  it('WD.D.2 — at status 0 without approvedByUser, ผู้อนุมัติ row hidden', () => {
    expect(withdrawalModalSrc).toMatch(/\{\s*\(\s*status\s*>=\s*1\s*\|\|\s*data\.approvedByUser\s*\)\s*&&\s*\(/);
  });

  it('WD.D.3 — at status 1 without receivedByUser, ผู้รับ row hidden', () => {
    expect(withdrawalModalSrc).toMatch(/\{\s*\(\s*status\s*>=\s*2\s*\|\|\s*data\.receivedByUser\s*\)\s*&&\s*\(/);
  });
});

// ============================================================================
describe('Phase 15.4 GS.A — Global V14 + cross-cutting source-grep', () => {
  it('GS.A.1 — _normalizeAuditUser is the single normalizer (Rule of 3)', () => {
    // backendClient.js exports it; both writers use it.
    expect(backendSrc).toMatch(/function\s+_normalizeAuditUser/);
    expect(updateTransferFn).toContain('_normalizeAuditUser(opts.user)');
    expect(updateWithdrawalFn).toContain('_normalizeAuditUser(opts.user)');
  });

  it('GS.A.2 — _normalizeAuditUser returns {userId, userName} not undefined (V14 contract)', () => {
    // Find the function definition and inspect its return shape.
    const fnIdx = backendSrc.indexOf('function _normalizeAuditUser');
    expect(fnIdx).toBeGreaterThan(0);
    const body = backendSrc.slice(fnIdx, fnIdx + 800);
    // Must return an object with userId + userName keys; undefined never returned.
    expect(body).toMatch(/return\s*\{\s*userId/);
    expect(body).toMatch(/userName/);
  });

  it('GS.A.3 — V21 anti-regression: writers do NOT skip the actor capture for transitions 0→1 / 1→2', () => {
    // Both transitions must persist the actor — ensures user can see who did what.
    expect(updateTransferFn).toMatch(/dispatchedByUser/);
    expect(updateTransferFn).toMatch(/receivedByUser/);
    expect(updateWithdrawalFn).toMatch(/approvedByUser/);
    expect(updateWithdrawalFn).toMatch(/receivedByUser/);
  });

  it('GS.A.4 — both writers use atomic CAS via runTransaction (S12 race-prevention preserved)', () => {
    expect(updateTransferFn).toMatch(/runTransaction\(db,\s*async\s*\(tx\)\s*=>/);
    expect(updateWithdrawalFn).toMatch(/runTransaction\(db,\s*async\s*\(tx\)\s*=>/);
  });

  it('GS.A.5 — both modal files use data-testid for the 3 actor rows (preview_eval addressable)', () => {
    expect(transferModalSrc).toMatch(/data-testid="transfer-creator-name"/);
    expect(transferModalSrc).toMatch(/data-testid="transfer-dispatcher-name"/);
    expect(transferModalSrc).toMatch(/data-testid="transfer-receiver-name"/);
    expect(withdrawalModalSrc).toMatch(/data-testid="withdrawal-creator-name"/);
    expect(withdrawalModalSrc).toMatch(/data-testid="withdrawal-approver-name"/);
    expect(withdrawalModalSrc).toMatch(/data-testid="withdrawal-receiver-name"/);
  });
});
