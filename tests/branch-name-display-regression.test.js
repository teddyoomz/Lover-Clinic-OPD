// Branch name display — V22 anti-pattern lock for branch IDs
//
// User report 2026-04-27: "กดสร้างออเดอร์ใหม่แล้ว แต่มันสาขาว่า สาขา
// BR-1777095572005-ae97f911 เป็นโค๊ด อ่านไม่รู้เรื่อง ต้องการชื่อสาขา
// แบบมนุษย์อ่านรู้เรื่อง"
//
// Root cause: OrderDetailModal:206 rendered `{order.branchId || '-'}`
// raw → leaked the BR-{ts}-{rand} doc id from be_branches into the UI.
// Same V22 anti-pattern (2026-04-26 schedule calendar staffId leak)
// + V22-bis (2026-04-27 sale seller numeric-id leak). User locked the
// rule: "ทุกที่แสดงชื่อ … เป็น text ไม่ใช่ตัวเลข".
//
// Fix:
//   1. NEW resolveBranchName(branchId, branches) helper in BranchContext.jsx
//      — name → nameEn → '' (NEVER raw branch id)
//   2. OrderDetailModal uses helper + falls back to "สาขาหลัก" for the
//      legacy 'main' id, '-' otherwise
//   3. This test pins the contract so future panels rendering branchId
//      never ship raw codes.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { resolveBranchName } from '../src/lib/BranchContext.jsx';

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const branchCtxSrc = read('src/lib/BranchContext.jsx');
const detailModalSrc = read('src/components/backend/OrderDetailModal.jsx');

// ────────────────────────────────────────────────────────────────────────
// B1 — resolveBranchName pure helper
// ────────────────────────────────────────────────────────────────────────
describe('branch-name B1 — resolveBranchName helper', () => {
  const branches = [
    { id: 'BR-1', branchId: 'BR-1', name: 'สาขากรุงเทพ', nameEn: 'Bangkok' },
    { id: 'BR-2', branchId: 'BR-2', name: 'สาขาเชียงใหม่' },
    { id: 'BR-3', branchId: 'BR-3', nameEn: 'Phuket' },          // English only
    { id: 'BR-4', branchId: 'BR-4', name: '   ', nameEn: 'Chonburi' }, // whitespace name
    { id: 'BR-5', branchId: 'BR-5' },                            // no name at all
  ];

  it('B1.1 returns Thai name when present', () => {
    expect(resolveBranchName('BR-1', branches)).toBe('สาขากรุงเทพ');
  });

  it('B1.2 trims whitespace from name', () => {
    expect(resolveBranchName('BR-1', [{ id: 'BR-1', name: '  สาขา  ' }])).toBe('สาขา');
  });

  it('B1.3 falls back to nameEn when name missing', () => {
    expect(resolveBranchName('BR-3', branches)).toBe('Phuket');
  });

  it('B1.4 falls back to nameEn when name is whitespace-only', () => {
    expect(resolveBranchName('BR-4', branches)).toBe('Chonburi');
  });

  it('B1.5 V22 LOCK — returns empty string (NEVER raw id) when no name resolves', () => {
    expect(resolveBranchName('BR-5', branches)).toBe('');
    expect(resolveBranchName('BR-UNKNOWN', branches)).toBe('');
  });

  it('B1.6 lookup matches via .branchId OR .id (alternate doc shape)', () => {
    const onlyId = [{ id: 'BR-X', name: 'X' }];
    const onlyBranchId = [{ branchId: 'BR-X', name: 'X' }];
    expect(resolveBranchName('BR-X', onlyId)).toBe('X');
    expect(resolveBranchName('BR-X', onlyBranchId)).toBe('X');
  });

  it('B1.7 string-coerced lookup (numeric vs string id)', () => {
    expect(resolveBranchName(1, [{ id: '1', name: 'A' }])).toBe('A');
    expect(resolveBranchName('1', [{ id: 1, name: 'A' }])).toBe('A');
  });

  it('B1.8 adversarial — empty/null/undefined branchId', () => {
    expect(resolveBranchName('', branches)).toBe('');
    expect(resolveBranchName(null, branches)).toBe('');
    expect(resolveBranchName(undefined, branches)).toBe('');
  });

  it('B1.9 adversarial — branches not yet loaded (empty/null array)', () => {
    expect(resolveBranchName('BR-1', [])).toBe('');
    expect(resolveBranchName('BR-1', null)).toBe('');
    expect(resolveBranchName('BR-1', undefined)).toBe('');
  });

  it('B1.10 adversarial — null entries in branches array do not crash', () => {
    expect(resolveBranchName('BR-1', [null, undefined, { id: 'BR-1', name: 'A' }])).toBe('A');
  });

  it('B1.11 adversarial — non-string name fields fall through', () => {
    expect(resolveBranchName('BR-X', [{ id: 'BR-X', name: 123 }])).toBe('');
    expect(resolveBranchName('BR-X', [{ id: 'BR-X', name: null, nameEn: 'OK' }])).toBe('OK');
  });
});

// ────────────────────────────────────────────────────────────────────────
// B2 — Helper exported + documented
// ────────────────────────────────────────────────────────────────────────
describe('branch-name B2 — helper export + docs', () => {
  it('B2.1 BranchContext exports resolveBranchName', () => {
    expect(branchCtxSrc).toMatch(/^export function resolveBranchName\(/m);
  });

  it('B2.2 helper docs cite V22 contract + the user report', () => {
    expect(branchCtxSrc).toMatch(/V22/);
    expect(branchCtxSrc).toMatch(/BR-1777095572005-ae97f911/);
  });

  it('B2.3 doc string commits to NEVER returning a raw branch id', () => {
    expect(branchCtxSrc).toMatch(/V22 contract/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// B3 — OrderDetailModal uses helper (specific user-reported site)
// ────────────────────────────────────────────────────────────────────────
describe('branch-name B3 — OrderDetailModal', () => {
  it('B3.1 imports useSelectedBranch + resolveBranchName', () => {
    expect(detailModalSrc).toMatch(
      /import\s*\{\s*useSelectedBranch\s*,\s*resolveBranchName\s*\}\s*from\s*['"]\.\.\/\.\.\/lib\/BranchContext\.jsx['"]/
    );
  });

  it('B3.2 calls useSelectedBranch to get branches', () => {
    expect(detailModalSrc).toMatch(/const\s*\{\s*branches\s*\}\s*=\s*useSelectedBranch\(\)/);
  });

  it('B3.3 branch field renders resolveBranchName(order.branchId, branches)', () => {
    expect(detailModalSrc).toMatch(
      /resolveBranchName\(order\.branchId,\s*branches\)/
    );
  });

  it('B3.4 falls back to "สาขาหลัก" for legacy main branch id', () => {
    expect(detailModalSrc).toMatch(/order\.branchId\s*===\s*'main'\s*\?\s*'สาขาหลัก'/);
  });

  it('B3.5 V22 LOCK — no raw `{order.branchId}` rendering', () => {
    // Strip block + line comments so commentary referencing the bug doesn't
    // false-trigger the regex.
    const stripped = detailModalSrc
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*\n/g, '\n');
    // The OLD broken pattern was: <div ...>{order.branchId || '-'}</div>
    // It must not survive in the executable code.
    expect(stripped).not.toMatch(/<div[^>]*>\s*\{order\.branchId\s*\|\|\s*['"`]-['"`]\s*\}\s*<\/div>/);
  });

  it('B3.6 has data-testid for the branch-name surface (preview verification anchor)', () => {
    expect(detailModalSrc).toMatch(/data-testid=["']order-detail-branch-name["']/);
  });
});
