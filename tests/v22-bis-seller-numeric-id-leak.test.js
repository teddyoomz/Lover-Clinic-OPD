// V22-bis (2026-04-27) — Sale seller numeric-id leak fix.
//
// User report: "เจอบั๊คหน้า backend=1&tab=sales ไอ้ผู้ขายในหน้า PDF หรือ
// ใน modal แสดงรายละเอียด ก็ตาม แม่งโชว์เป็นตัวเลขก่อน จนกว่า User จะ
// กดเข้าไป edit แล้วกด cancel ปิด modal ออกมา ทั้งที่ถึงจะโชว์เป็นชื่อ
// มันคือบั๊ค กูต้องกาีใช้โชว์ชื่อแต่แรก เอาตัวเลขออกไปให้หมด"
//
// Same anti-pattern as V22 (schedule calendar leaked staffId text):
// `s.name || s.id` falls back to numeric ID when name is empty.
// User locked the rule 2026-04-26: "ทุกที่แสดงชื่อแพทย์และพนง เป็น
// text ไม่ใช่ตัวเลย".
//
// Root cause: SaleTab loaded `sellers[]` only inside `loadOptions`
// (called from openCreate / openEdit / initialCustomer-driven flows).
// View modal + PDF print opened before any of those fired → sellers
// lookup empty → resolveSellerName fell back to s.id (numeric).
// Edit-then-cancel "fixed" it because edit triggered loadOptions.
//
// Fix:
//   1. NEW src/lib/documentFieldAutoFill.js exports resolveSellerName
//      — name → sellerName → lookup → '' (NEVER numeric ID)
//   2. SaleTab eager-loads sellers on mount (new useEffect)
//   3. SaleTab view modal + SalePrintView PDF use resolveSellerName
//   4. MembershipPanel + DepositPanel detail views also switched
//      (V22 sweep — same pattern, same threat)
//
// This test pins down the contract so any future "name fallback to id"
// regression in seller render paths is caught at commit time.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { resolveSellerName } from '../src/lib/documentFieldAutoFill.js';

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const helperSrc = read('src/lib/documentFieldAutoFill.js');
const saleTabSrc = read('src/components/backend/SaleTab.jsx');
const printViewSrc = read('src/components/backend/SalePrintView.jsx');
const membershipSrc = read('src/components/backend/MembershipPanel.jsx');
const depositSrc = read('src/components/backend/DepositPanel.jsx');

// ────────────────────────────────────────────────────────────────────────
// G1 — resolveSellerName pure helper contract
// ────────────────────────────────────────────────────────────────────────
describe('V22-bis G1 — resolveSellerName pure helper', () => {
  it('G1.1 prefers seller.name when present', () => {
    expect(resolveSellerName({ id: '614', name: 'นางสาว A' }, [])).toBe('นางสาว A');
  });

  it('G1.2 trims whitespace in seller.name', () => {
    expect(resolveSellerName({ id: '614', name: '  นางสาว A  ' }, [])).toBe('นางสาว A');
  });

  it('G1.3 falls back to seller.sellerName (legacy alias)', () => {
    expect(resolveSellerName({ id: '614', sellerName: 'หมอ B' }, [])).toBe('หมอ B');
  });

  it('G1.4 falls back to lookup match by id when name is empty', () => {
    const lookup = [{ id: '614', name: 'พนง C' }, { id: '999', name: 'พนง D' }];
    expect(resolveSellerName({ id: '614', name: '' }, lookup)).toBe('พนง C');
  });

  it('G1.5 lookup id comparison is string-coerced (handles numeric vs string id)', () => {
    const lookup = [{ id: 614, name: 'พนง C' }];   // numeric in lookup
    expect(resolveSellerName({ id: '614' }, lookup)).toBe('พนง C');

    const lookup2 = [{ id: '614', name: 'พนง C' }]; // string in lookup
    expect(resolveSellerName({ id: 614 }, lookup2)).toBe('พนง C');
  });

  it('G1.6 V22 LOCK — never falls back to seller.id (numeric)', () => {
    // No name + no lookup match → return '' (never the numeric id).
    expect(resolveSellerName({ id: '614' }, [])).toBe('');
    expect(resolveSellerName({ id: '614', name: '' }, [])).toBe('');
    expect(resolveSellerName({ id: '614' }, undefined)).toBe('');
    expect(resolveSellerName({ id: '614' }, null)).toBe('');
    expect(resolveSellerName({ id: 614 }, [])).toBe('');  // numeric type
  });

  it('G1.7 V22 LOCK — empty lookup with no match returns empty', () => {
    expect(resolveSellerName({ id: 'unknown-id', name: '' }, [{ id: '614', name: 'A' }])).toBe('');
  });

  it('G1.8 adversarial — null seller', () => {
    expect(resolveSellerName(null, [])).toBe('');
    expect(resolveSellerName(undefined, [])).toBe('');
    expect(resolveSellerName('', [])).toBe('');
    expect(resolveSellerName(123, [])).toBe('');
  });

  it('G1.9 adversarial — seller with non-string name', () => {
    expect(resolveSellerName({ id: '614', name: 614 }, [])).toBe('');
    expect(resolveSellerName({ id: '614', name: null }, [])).toBe('');
    expect(resolveSellerName({ id: '614', name: undefined }, [])).toBe('');
  });

  it('G1.10 adversarial — name with only whitespace falls through to lookup/empty', () => {
    expect(resolveSellerName({ id: '614', name: '   ' }, [])).toBe('');
    expect(resolveSellerName({ id: '614', name: '   ' }, [{ id: '614', name: 'A' }])).toBe('A');
  });

  it('G1.11 adversarial — lookup match with empty name still falls through', () => {
    expect(resolveSellerName({ id: '614' }, [{ id: '614', name: '' }])).toBe('');
    expect(resolveSellerName({ id: '614' }, [{ id: '614', name: '   ' }])).toBe('');
    expect(resolveSellerName({ id: '614' }, [{ id: '614' }])).toBe(''); // missing name field
  });

  it('G1.12 adversarial — null entries in lookup array do not crash', () => {
    expect(resolveSellerName({ id: '614' }, [null, { id: '614', name: 'A' }])).toBe('A');
    expect(resolveSellerName({ id: '614' }, [undefined, { id: '614', name: 'A' }])).toBe('A');
  });
});

// ────────────────────────────────────────────────────────────────────────
// G2 — Helper exported from canonical module (Rule of 3)
// ────────────────────────────────────────────────────────────────────────
describe('V22-bis G2 — helper export', () => {
  it('G2.1 documentFieldAutoFill exports resolveSellerName', () => {
    expect(helperSrc).toMatch(/^export function resolveSellerName\(/m);
  });

  it('G2.2 helper docs cite V22 contract', () => {
    expect(helperSrc).toMatch(/V22/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// G3 — SaleTab uses helper + eager-loads sellers + no `|| s.id` fallback
// ────────────────────────────────────────────────────────────────────────
describe('V22-bis G3 — SaleTab.jsx', () => {
  it('G3.1 imports resolveSellerName', () => {
    expect(saleTabSrc).toMatch(/import\s*\{[^}]*resolveSellerName[^}]*\}\s*from\s*['"]\.\.\/\.\.\/lib\/documentFieldAutoFill\.js['"]/);
  });

  it('G3.2 view modal seller render uses helper (not raw `|| s.id`)', () => {
    // View-modal seller block — find the block and assert helper is used
    // and the V22-banned fallback is gone.
    const blockMatch = saleTabSrc.match(/viewingSale\.sellers\.map[\s\S]{0,800}?(?=\n\s+<\/div>|\n\s+\)\}|\n\s+\)\;)/);
    expect(blockMatch).toBeTruthy();
    expect(blockMatch[0]).toContain('resolveSellerName(s, sellers)');
    // V22 LOCK — no `|| s.id` in the seller render path.
    expect(blockMatch[0]).not.toMatch(/\|\|\s*s\.id/);
  });

  it('G3.3 view modal renders "ไม่ระบุ" placeholder when name empty (never numeric)', () => {
    expect(saleTabSrc).toMatch(/resolvedName\s*\|\|\s*'ไม่ระบุ'/);
  });

  it('G3.4 eager-load useEffect on mount calls listAllSellers', () => {
    // The new mount-effect must reference listAllSellers + setSellers.
    expect(saleTabSrc).toMatch(/V22 fix 2026-04-27/);
    // Phase BS (2026-05-06) — listAllSellers now accepts {branchId} for
    // per-branch staff scoping. Eager-load passes BRANCH_ID + adds the
    // dep so re-fetches when admin switches branch via top-right tab.
    const block = saleTabSrc.match(/Eager-load seller lookup on mount[\s\S]{0,2000}/);
    expect(block).toBeTruthy();
    expect(block[0]).toMatch(/listAllSellers\(\{\s*branchId:\s*BRANCH_ID\s*\}\)/);
    expect(block[0]).toContain('setSellers');
    expect(block[0]).toMatch(/\},\s*\[BRANCH_ID\]\);/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// G4 — SalePrintView uses helper + no numeric-id fallback
// ────────────────────────────────────────────────────────────────────────
describe('V22-bis G4 — SalePrintView.jsx', () => {
  it('G4.1 imports resolveSellerName', () => {
    expect(printViewSrc).toMatch(/import\s*\{\s*resolveSellerName\s*\}\s*from\s*['"]\.\.\/\.\.\/lib\/documentFieldAutoFill\.js['"]/);
  });

  it('G4.2 sellerDisplay uses helper (not the old multi-fallback chain)', () => {
    expect(printViewSrc).toMatch(/const\s+sellerName\s*=\s*resolveSellerName\(firstSeller,\s*sellersLookup\)/);
  });

  it('G4.3 V22 LOCK — no `firstSeller.id` fallback in sellerDisplay chain', () => {
    // The OLD chain had `|| firstSeller.id` between lookupName and createdByName.
    // Anti-regression: that pattern must not return.
    const block = printViewSrc.match(/const sellerDisplay[\s\S]{0,400}/);
    expect(block).toBeTruthy();
    expect(block[0]).not.toMatch(/\|\|\s*firstSeller\.id/);
  });

  it('G4.4 V22 LOCK — sellerDisplay only falls back to s.createdBy when string', () => {
    // s.createdBy might be `{userId, userName}` object in some sales —
    // guard against rendering [object Object] OR a numeric-looking userId.
    const block = printViewSrc.match(/const sellerDisplay[\s\S]{0,400}/);
    expect(block[0]).toMatch(/typeof s\.createdBy\s*===\s*'string'/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// G5 — MembershipPanel + DepositPanel sweep (same V22 anti-pattern)
// ────────────────────────────────────────────────────────────────────────
describe('V22-bis G5 — MembershipPanel + DepositPanel sweep', () => {
  it('G5.1 MembershipPanel imports resolveSellerName', () => {
    expect(membershipSrc).toMatch(/import\s*\{\s*resolveSellerName\s*\}\s*from\s*['"]\.\.\/\.\.\/lib\/documentFieldAutoFill\.js['"]/);
  });

  it('G5.2 MembershipPanel view uses helper + lookup', () => {
    expect(membershipSrc).toMatch(/resolveSellerName\(s,\s*sellerList\)\s*\|\|\s*'ไม่ระบุ'/);
  });

  it('G5.3 MembershipPanel — no `|| s.id` in m.sellers render', () => {
    // Find the m.sellers.map line and confirm no numeric-id fallback.
    const block = membershipSrc.match(/m\.sellers\.map[\s\S]{0,400}/);
    expect(block).toBeTruthy();
    expect(block[0]).not.toMatch(/s\.name\s*\|\|\s*s\.id/);
  });

  it('G5.4 DepositPanel imports resolveSellerName', () => {
    expect(depositSrc).toMatch(/import\s*\{\s*resolveSellerName\s*\}\s*from\s*['"]\.\.\/\.\.\/lib\/documentFieldAutoFill\.js['"]/);
  });

  it('G5.5 DepositPanel view uses helper', () => {
    expect(depositSrc).toMatch(/resolveSellerName\(s,\s*\[\]\)\s*\|\|\s*'ไม่ระบุ'/);
  });

  it('G5.6 DepositPanel — no `|| s.id` in dep.sellers render', () => {
    const block = depositSrc.match(/dep\.sellers\.map[\s\S]{0,500}/);
    expect(block).toBeTruthy();
    expect(block[0]).not.toMatch(/s\.name\s*\|\|\s*s\.id/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// G6 — Project-wide source-grep guard (catch future regressions)
// ────────────────────────────────────────────────────────────────────────
describe('V22-bis G6 — project-wide regression guard', () => {
  // The four files we audited above must NEVER render a seller via
  // `s.name || s.id` again. New patterns that emerge anywhere in the
  // src/components/backend tree should add themselves to this catalog.
  const SOURCES = [
    ['src/components/backend/SaleTab.jsx', saleTabSrc],
    ['src/components/backend/SalePrintView.jsx', printViewSrc],
    ['src/components/backend/MembershipPanel.jsx', membershipSrc],
    ['src/components/backend/DepositPanel.jsx', depositSrc],
  ];

  for (const [file, src] of SOURCES) {
    it(`G6.${file} — no s.name || s.id fallback survives`, () => {
      // Allow `s.name || s.id` ONLY in test/comment contexts (never in
      // executable expressions) — strip block + line comments first.
      const stripped = src
        .replace(/\/\*[\s\S]*?\*\//g, '')   // block comments
        .replace(/\/\/[^\n]*\n/g, '\n');    // line comments
      expect(stripped).not.toMatch(/<span[^>]*>\s*\{?\s*s\.name\s*\|\|\s*s\.id\s*\}?\s*<\/span>/);
      expect(stripped).not.toMatch(/\bresolvedName\s*=[^;]*\|\|\s*s\.id/);
    });
  }

  it('G6.contract — resolveSellerName helper documented as V22 lock', () => {
    expect(helperSrc).toMatch(/NEVER fall back to seller\.id/);
  });
});
