/**
 * V113 — Receipt live-resolve + V112-A update-path resolver (preserved)
 * (2026-05-23 EOD+1 LATE+1)
 *
 * Trust-collapse correction of V112-B (Rule Q V66 / Q-vis violation):
 * the previous turn shipped an admin-SDK backfill that stamped the
 * displayed values directly onto the sale doc. User caught it: "ค** เข้าข้าง
 * ตัวเองเหี้ยๆ ... ให้มึงใช้ระบบที่แก้ เจนใหม่ ไม่ใช่ dry run ไปแปะทีหลังแบบโกง".
 *
 * V113 is the SYSTEM fix the user wanted:
 *   - SalePrintView + QuotationPrintView fetch the master course doc
 *     (+ customer doc for SalePrintView name) at render time and prefer
 *     LIVE values in the name fallback chain.
 *   - Snapshot fields (V111 buy-fetcher writes + V112-A update resolver
 *     writes) stay as defensive fallback for the deleted-master case.
 *   - Receipts re-rendered any time = always-current with master.
 *   - Admin renaming the master = all existing receipts auto-update on
 *     next open. No backfill ever needed.
 *
 * V112-A (updateBackendSale resolver, `backendClient.js:_resolveSaleCustomerForUpdate`)
 * is a SEPARATE concern: it keeps the SALE DOC's customerName field
 * correct at write time so non-renderer consumers (reports, exports,
 * audit) see the right value. Preserved verbatim from V112; tests here.
 *
 * V112-B (admin-SDK backfill script) DELETED — was the V66 violation.
 *
 * Cross-link:
 *   - V113 V-entry in `.claude/rules/00-session-start.md` § 2
 *   - AV113 in `audit-anti-vibe-code/SKILL.md`
 *   - feedback_no_admin_sdk_backfill_to_fix_display.md (user-level memory)
 */
import { describe, test, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { render, screen, waitFor } from '@testing-library/react';

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

// ─── A. V112-A updateBackendSale resolver — source-grep regression ────────

describe('V113.A — V112-A updateBackendSale customer resolver preserved', () => {
  test('A1 — updateBackendSale calls _resolveSaleCustomerForUpdate before updateDoc', () => {
    const code = read('src/lib/backendClient.js');
    const fnMatch = code.match(/export async function updateBackendSale\([\s\S]{0,3000}\n\}/);
    expect(fnMatch).toBeTruthy();
    const body = fnMatch[0];
    const resolverIdx = body.indexOf('_resolveSaleCustomerForUpdate(');
    const updateIdx = body.indexOf('updateDoc(saleDoc(saleId)');
    expect(resolverIdx).toBeGreaterThan(-1);
    expect(updateIdx).toBeGreaterThan(-1);
    expect(resolverIdx).toBeLessThan(updateIdx);
  });

  test('A2 — helper declared with V108-mirror semantics', () => {
    const code = read('src/lib/backendClient.js');
    expect(code).toMatch(/async function _resolveSaleCustomerForUpdate\(saleId,\s*data,\s*patch\)/);
  });

  test('A3 — helper resolves from be_customers when caller empty + customerId resolvable', () => {
    const code = read('src/lib/backendClient.js');
    expect(code).toMatch(/_resolveSaleCustomerForUpdate[\s\S]{0,2500}customerDoc\(cid\)/);
    expect(code).toMatch(/_resolveSaleCustomerForUpdate[\s\S]{0,2500}resolveCustomerDisplayName/);
  });

  test('A4 — helper DELETES empty customerName/HN when no customerId resolves', () => {
    const code = read('src/lib/backendClient.js');
    expect(code).toMatch(/_resolveSaleCustomerForUpdate[\s\S]{0,2500}delete patch\.customerName/);
    expect(code).toMatch(/_resolveSaleCustomerForUpdate[\s\S]{0,2500}delete patch\.customerHN/);
  });
});

// ─── B. V112-A resolver semantics — pure flow-simulate ────────────────────

describe('V113.B — V112-A resolver decision matrix', () => {
  function mirrorResolveCustomer({ patch, callerData, existingDoc, customerLookup }) {
    const callerName = (callerData && typeof callerData.customerName === 'string') ? callerData.customerName.trim() : '';
    const callerHN = (callerData && typeof callerData.customerHN === 'string') ? callerData.customerHN.trim() : '';
    if (callerName && callerHN) return;
    let cid = callerData && callerData.customerId;
    if (!cid && existingDoc) cid = existingDoc.customerId;
    if (cid) {
      const cust = customerLookup(cid);
      if (cust) {
        if (!callerName) {
          const resolved = resolveName(cust);
          if (resolved) patch.customerName = resolved;
          else delete patch.customerName;
        }
        if (!callerHN) {
          const resolved = resolveHN(cust);
          if (resolved) patch.customerHN = resolved;
          else delete patch.customerHN;
        }
        return;
      }
    }
    if (!callerName) delete patch.customerName;
    if (!callerHN) delete patch.customerHN;
  }
  function trim(v) { return typeof v === 'string' ? v.trim() : ''; }
  function resolveName(c) {
    if (!c) return '';
    const pd = c.patientData || {};
    const n1 = [trim(pd.firstNameTh), trim(pd.lastNameTh)].filter(Boolean).join(' '); if (n1.trim()) return n1.trim();
    const n2 = [trim(pd.firstName), trim(pd.lastName)].filter(Boolean).join(' '); if (n2.trim()) return n2.trim();
    const n3 = [trim(c.firstname), trim(c.lastname)].filter(Boolean).join(' '); if (n3.trim()) return n3.trim();
    return trim(c.nickname) || trim(c.customerName) || '';
  }
  function resolveHN(c) {
    if (!c) return '';
    const pd = c.patientData || {};
    return trim(pd.hn) || trim(pd.HN) || trim(pd.proClinicHN) || trim(c.proClinicHN) || trim(c.hn) || trim(c.HN) || '';
  }

  test('B1 — empty caller + valid customerId → resolves from customer doc', () => {
    const patch = { customerName: '', customerHN: '' };
    mirrorResolveCustomer({
      patch,
      callerData: { customerId: 'LC-1', customerName: '', customerHN: '' },
      customerLookup: () => ({ firstname: 'นิรุต', lastname: 'ชำนาญปรุ', patientData: { hn: 'HN-1' } }),
    });
    expect(patch.customerName).toBe('นิรุต ชำนาญปรุ');
    expect(patch.customerHN).toBe('HN-1');
  });

  test('B2 — non-empty caller PRESERVED (admin explicit override)', () => {
    const patch = { customerName: 'Override Name', customerHN: 'HN-X' };
    mirrorResolveCustomer({
      patch,
      callerData: { customerId: 'LC-1', customerName: 'Override Name', customerHN: 'HN-X' },
      customerLookup: () => ({ firstname: 'IGNORED', lastname: 'IGNORED' }),
    });
    expect(patch.customerName).toBe('Override Name');
    expect(patch.customerHN).toBe('HN-X');
  });

  test('B3 — empty caller + no resolvable customer → DELETE from patch (no clobber)', () => {
    const patch = { customerName: '', customerHN: '' };
    mirrorResolveCustomer({
      patch,
      callerData: { customerName: '', customerHN: '' },
      customerLookup: () => null,
    });
    expect(patch.customerName).toBeUndefined();
    expect(patch.customerHN).toBeUndefined();
  });

  test('B4 — INV-20260520-0010 reproduction: empty + LC-26000074 → "นิรุต ชำนาญปรุ"', () => {
    const patch = { customerName: '', customerHN: '' };
    mirrorResolveCustomer({
      patch,
      callerData: { customerId: 'LC-26000074', customerName: '', customerHN: '' },
      customerLookup: () => ({
        customerId: 'LC-26000074',
        firstname: 'นิรุต',
        lastname: 'ชำนาญปรุ',
        patientData: {}, // hn undefined → delete patch.customerHN
      }),
    });
    expect(patch.customerName).toBe('นิรุต ชำนาญปรุ');
    expect(patch.customerHN).toBeUndefined(); // preserved on-disk
  });
});

// ─── C. V113 live-resolve in SalePrintView — source-grep regression ──────

describe('V113.C — SalePrintView live-resolve wiring', () => {
  test('C1 — imports getCourse + getCustomer from scopedDataLayer', () => {
    const code = read('src/components/backend/SalePrintView.jsx');
    expect(code).toMatch(/import\s*\{[^}]*getCourse[^}]*getCustomer[^}]*\}\s*from\s*['"][^'"]*scopedDataLayer/);
  });

  test('C2 — imports resolveCustomerDisplayName + resolveCustomerHN', () => {
    const code = read('src/components/backend/SalePrintView.jsx');
    expect(code).toMatch(/import\s*\{[^}]*resolveCustomerDisplayName[^}]*resolveCustomerHN[^}]*\}\s*from\s*['"][^'"]*customerDisplayName/);
  });

  test('C3 — useState for liveCourses + liveCustomer present', () => {
    const code = read('src/components/backend/SalePrintView.jsx');
    expect(code).toMatch(/useState\([^)]*\)\s*[^;]*liveCourses|\[liveCourses,\s*setLiveCourses\]/);
    expect(code).toMatch(/\[liveCustomer,\s*setLiveCustomer\]/);
  });

  test('C4 — useEffect fetches getCourse for each course line', () => {
    const code = read('src/components/backend/SalePrintView.jsx');
    expect(code).toMatch(/V113[\s\S]{0,2500}getCourse\(/);
  });

  test('C5 — useEffect fetches getCustomer when s.customerId present', () => {
    const code = read('src/components/backend/SalePrintView.jsx');
    expect(code).toMatch(/V113[\s\S]{0,2500}getCustomer\(s\.customerId\)/);
  });

  test('C6 — liveReceiptName helper prefers liveCourses master receiptCourseName', () => {
    const code = read('src/components/backend/SalePrintView.jsx');
    expect(code).toMatch(/function liveReceiptName\(courseLine\)/);
    expect(code).toMatch(/liveCourses[\s\S]{0,300}receiptCourseName/);
  });

  test('C7 — grouped course-row uses liveReceiptName(c) for name', () => {
    const code = read('src/components/backend/SalePrintView.jsx');
    expect(code).toMatch(/name:\s*liveReceiptName\(c\)/);
  });

  test('C8 — rows useMemo includes liveCourses in deps', () => {
    const code = read('src/components/backend/SalePrintView.jsx');
    expect(code).toMatch(/\}, \[s\.items, liveCourses\]\);/);
  });

  test('C9 — customer header uses liveCustomer fallback chain (resolveCustomerDisplayName)', () => {
    const code = read('src/components/backend/SalePrintView.jsx');
    expect(code).toMatch(/s\.customerName[\s\S]{0,200}resolveCustomerDisplayName\(liveCustomer\)/);
  });

  test('C10 — anti-V112-B: no IMPORT or CALL of admin-SDK backfill helpers in source', () => {
    // The V112-B script was deleted; confirm SalePrintView doesn't IMPORT or
    // CALL any backfill code. Historical-reference comments mentioning V112-B
    // in code-explanation form ARE allowed (and useful for institutional memory).
    const code = read('src/components/backend/SalePrintView.jsx');
    // No import statement pulling backfill helpers
    expect(code).not.toMatch(/^import[^;\n]*v112-backfill/m);
    expect(code).not.toMatch(/from\s+['"][^'"]*v112-backfill/);
    // No function call to backfill helpers
    expect(code).not.toMatch(/\bshouldStampReceiptName\s*\(/);
    expect(code).not.toMatch(/\bresolveCustomerDisplayNameMirror\s*\(/);
  });
});

// ─── D. V113 live-resolve in QuotationPrintView ──────────────────────────

describe('V113.D — QuotationPrintView live-resolve wiring', () => {
  test('D1 — imports getCourse + getCustomer + V105 helpers', () => {
    const code = read('src/components/backend/QuotationPrintView.jsx');
    expect(code).toMatch(/import[^{]*\{[^}]*getCourse[^}]*getCustomer[^}]*\}[^;]*scopedDataLayer/);
    expect(code).toMatch(/import[^{]*\{[^}]*resolveCustomerDisplayName[^}]*resolveCustomerHN[^}]*\}[^;]*customerDisplayName/);
  });

  test('D2 — useEffect fetches per-course master + customer', () => {
    const code = read('src/components/backend/QuotationPrintView.jsx');
    expect(code).toMatch(/V113[\s\S]{0,2500}getCourse\(/);
    expect(code).toMatch(/V113[\s\S]{0,2500}getCustomer\(q\.customerId\)/);
  });

  test('D3 — liveQuoteCourseName helper prefers master receiptCourseName', () => {
    const code = read('src/components/backend/QuotationPrintView.jsx');
    expect(code).toMatch(/function liveQuoteCourseName\(x\)/);
  });

  test('D4 — course row uses live helper', () => {
    const code = read('src/components/backend/QuotationPrintView.jsx');
    expect(code).toMatch(/name:\s*liveQuoteCourseName\(x\)/);
  });

  test('D5 — rows useMemo includes liveCourses in deps', () => {
    const code = read('src/components/backend/QuotationPrintView.jsx');
    expect(code).toMatch(/liveCourses\]\);/);
  });

  test('D6 — customer header live-resolves (mirror SalePrintView)', () => {
    const code = read('src/components/backend/QuotationPrintView.jsx');
    expect(code).toMatch(/q\.customerName[\s\S]{0,300}resolveCustomerDisplayName\(liveCustomer\)/);
  });
});

// ─── E. Live-resolve fallback chain pure-function unit ────────────────────

describe('V113.E — liveReceiptName priority (live > snapshot > original)', () => {
  function liveReceiptName(courseLine, liveCourses) {
    const id = courseLine && courseLine.id != null ? String(courseLine.id) : '';
    const master = liveCourses ? liveCourses.get(id) : null;
    const liveOverride = master && typeof master.receiptCourseName === 'string'
      ? master.receiptCourseName.trim() : '';
    return liveOverride
      || courseLine.receiptCourseName
      || courseLine.name
      || courseLine.courseName
      || courseLine.courseId
      || '';
  }

  test('E1 — live master override present → renders live (highest priority)', () => {
    const live = new Map([['C1', { receiptCourseName: 'LIVE OVERRIDE' }]]);
    const line = { id: 'C1', receiptCourseName: 'SNAPSHOT', name: 'ORIGINAL' };
    expect(liveReceiptName(line, live)).toBe('LIVE OVERRIDE');
  });

  test('E2 — live master missing receiptCourseName → fall back to snapshot', () => {
    const live = new Map([['C1', { receiptCourseName: '' }]]);
    const line = { id: 'C1', receiptCourseName: 'SNAPSHOT', name: 'ORIGINAL' };
    expect(liveReceiptName(line, live)).toBe('SNAPSHOT');
  });

  test('E3 — live master DELETED (not in map) → fall back to snapshot', () => {
    const live = new Map(); // master gone
    const line = { id: 'C1', receiptCourseName: 'SNAPSHOT', name: 'ORIGINAL' };
    expect(liveReceiptName(line, live)).toBe('SNAPSHOT');
  });

  test('E4 — liveCourses still loading (null) → fall back to snapshot', () => {
    // Initial render before useEffect fires.
    const line = { id: 'C1', receiptCourseName: 'SNAPSHOT', name: 'ORIGINAL' };
    expect(liveReceiptName(line, null)).toBe('SNAPSHOT');
  });

  test('E5 — no snapshot + live master with override → renders live', () => {
    const live = new Map([['C1', { receiptCourseName: 'LIVE' }]]);
    const line = { id: 'C1', name: 'ORIGINAL' /* no receiptCourseName */ };
    expect(liveReceiptName(line, live)).toBe('LIVE');
  });

  test('E6 — admin renames master AFTER sale created → renderer picks up rename', () => {
    // Existing sale doc has snapshot "OLD NAME"
    const line = { id: 'C1', receiptCourseName: 'OLD NAME', name: 'OriginalCourse' };
    // Admin renamed in be_courses to "NEW NAME"
    const live = new Map([['C1', { receiptCourseName: 'NEW NAME' }]]);
    expect(liveReceiptName(line, live)).toBe('NEW NAME');
    // ↑ This is the WHOLE POINT of V113. V111+V112 snapshot would show
    // OLD NAME forever (no backfill). V113 always shows current master.
  });

  test('E7 — all empty → empty string (graceful)', () => {
    expect(liveReceiptName({}, null)).toBe('');
  });

  test('E8 — INV-20260520-0010 reproduction with live-resolve', () => {
    const live = new Map([['COURSES_1778150447655_C965C219', {
      receiptCourseName: 'ขลิบเลเซอร์ Sleeve เทคนิค (ไม่ดมยาสลบ)',
    }]]);
    const line = {
      id: 'COURSES_1778150447655_C965C219',
      // Post-V113-revert: no snapshot receiptCourseName, just original name
      name: 'ขลิบเลเซอร์ (ไม่ดมยาสลบ) 1 ครั้ง',
    };
    expect(liveReceiptName(line, live)).toBe('ขลิบเลเซอร์ Sleeve เทคนิค (ไม่ดมยาสลบ)');
  });
});

// ─── F. AV113 + lesson-locked invariants present ──────────────────────────

describe('V113.F — AV113 invariant + lesson tracking', () => {
  test('F1 — AV113 entry exists in audit-anti-vibe-code', () => {
    const skillPath = path.join(ROOT, '.agents/skills/audit-anti-vibe-code/SKILL.md');
    if (fs.existsSync(skillPath)) {
      expect(fs.readFileSync(skillPath, 'utf8')).toMatch(/AV113/);
    } else {
      const alt = path.join(ROOT, '.claude/skills/audit-anti-vibe-code/SKILL.md');
      expect(fs.existsSync(alt)).toBe(true);
      expect(fs.readFileSync(alt, 'utf8')).toMatch(/AV113/);
    }
  });

  test('F2 — V112-B backfill script DELETED from repo', () => {
    const scriptPath = path.join(ROOT, 'scripts/v112-backfill-receipt-course-name-and-customer.mjs');
    expect(fs.existsSync(scriptPath)).toBe(false);
  });

  test('F3 — V113 revert script exists (reverses V112-B cheat from prod)', () => {
    const revertPath = path.join(ROOT, 'scripts/v113-revert-v112-backfill.mjs');
    expect(fs.existsSync(revertPath)).toBe(true);
  });
});

// ─── H. V113-C extension — receiptInfo block live-resolve ────────────────

describe('V113.H — receiptInfo block lives-resolves from liveCustomer (V113-C)', () => {
  test('H1 — SalePrintView imports resolveCustomerReceiptInfo', () => {
    const code = read('src/components/backend/SalePrintView.jsx');
    expect(code).toMatch(/import\s*\{\s*resolveCustomerReceiptInfo\s*\}\s*from\s*['"][^'"]*customerReceiptInfo/);
  });

  test('H2 — SalePrintView computes liveReceiptInfo via useMemo on liveCustomer', () => {
    const code = read('src/components/backend/SalePrintView.jsx');
    expect(code).toMatch(/liveReceiptInfo\s*=\s*useMemo[\s\S]{0,500}resolveCustomerReceiptInfo\(liveCustomer\)/);
  });

  test('H3 — SalePrintView computes mergedReceiptInfo via useMemo with field-by-field pick', () => {
    const code = read('src/components/backend/SalePrintView.jsx');
    expect(code).toMatch(/mergedReceiptInfo\s*=\s*useMemo/);
    // Field-level snapshot-wins-fall-back-to-live merge
    expect(code).toMatch(/sv\s*\|\|\s*lv\s*\|\|\s*''/);
  });

  test('H4 — SalePrintView receipt-info block reads mergedReceiptInfo (not s.receiptInfo)', () => {
    const code = read('src/components/backend/SalePrintView.jsx');
    // V113-C: render block uses mergedReceiptInfo
    expect(code).toMatch(/mergedReceiptInfo\.taxId/);
    expect(code).toMatch(/mergedReceiptInfo\.address/);
    expect(code).toMatch(/mergedReceiptInfo\.phone/);
    expect(code).toMatch(/mergedReceiptInfo\.name/);
    // anti-regression: the OLD pre-V113-C conditional must NOT exist
    expect(code).not.toMatch(/s\.receiptInfo && \(s\.receiptInfo\.taxId/);
  });

  test('H5 — QuotationPrintView mirrors V113-C (same imports + merge + render)', () => {
    const code = read('src/components/backend/QuotationPrintView.jsx');
    expect(code).toMatch(/import\s*\{\s*resolveCustomerReceiptInfo\s*\}\s*from\s*['"][^'"]*customerReceiptInfo/);
    expect(code).toMatch(/liveReceiptInfo\s*=\s*useMemo[\s\S]{0,500}resolveCustomerReceiptInfo\(liveCustomer\)/);
    expect(code).toMatch(/mergedReceiptInfo\s*=\s*useMemo/);
    expect(code).toMatch(/mergedReceiptInfo\.taxId/);
    expect(code).not.toMatch(/q\.receiptInfo && \(q\.receiptInfo\.taxId/);
  });

  test('H6 — pure merge: snapshot wins field-by-field; live fills empty', () => {
    // Mirror the mergedReceiptInfo logic for pure-unit verification.
    function mergeReceiptInfo(snap, live) {
      const s = snap || {};
      const l = live || {};
      const pick = (k) => {
        const sv = typeof s[k] === 'string' ? s[k].trim() : '';
        const lv = typeof l[k] === 'string' ? l[k].trim() : '';
        return sv || lv || '';
      };
      return {
        type: s.type || l.type || '',
        name: pick('name'),
        taxId: pick('taxId'),
        phone: pick('phone'),
        address: pick('address'),
      };
    }
    // Case A — null snapshot + populated live → all live values
    expect(mergeReceiptInfo(null, {
      type: '', name: 'นิรุต', taxId: '3309901263672', phone: '0989149195', address: '369 ถนนสืบศิริ',
    })).toEqual({
      type: '', name: 'นิรุต', taxId: '3309901263672', phone: '0989149195', address: '369 ถนนสืบศิริ',
    });
    // Case B — snapshot with some fields + live with others → snapshot wins, live fills gaps
    expect(mergeReceiptInfo(
      { type: '', name: 'Admin Override', taxId: '', phone: '', address: '' },
      { type: '', name: 'IGNORED', taxId: 'LIVE-TAX', phone: 'LIVE-PHONE', address: 'LIVE-ADDR' },
    )).toEqual({
      type: '', name: 'Admin Override', taxId: 'LIVE-TAX', phone: 'LIVE-PHONE', address: 'LIVE-ADDR',
    });
    // Case C — full snapshot + populated live → snapshot wins entirely
    expect(mergeReceiptInfo(
      { type: 'personal', name: 'S-NAME', taxId: 'S-TAX', phone: 'S-PHONE', address: 'S-ADDR' },
      { type: 'inherit', name: 'L-NAME', taxId: 'L-TAX', phone: 'L-PHONE', address: 'L-ADDR' },
    )).toEqual({
      type: 'personal', name: 'S-NAME', taxId: 'S-TAX', phone: 'S-PHONE', address: 'S-ADDR',
    });
    // Case D — both null → all empty
    expect(mergeReceiptInfo(null, null)).toEqual({
      type: '', name: '', taxId: '', phone: '', address: '',
    });
  });
});

// ─── G. RTL: mount SalePrintView with mocked scopedDataLayer + verify ────

describe('V113.G — SalePrintView RTL with live-resolve fetch mocks', () => {
  let mockGetCourse;
  let mockGetCustomer;

  beforeEach(() => {
    mockGetCourse = vi.fn();
    mockGetCustomer = vi.fn();
    vi.resetModules();
    vi.doMock('../src/lib/scopedDataLayer.js', () => ({
      getCourse: (...args) => mockGetCourse(...args),
      getCustomer: (...args) => mockGetCustomer(...args),
    }));
    vi.doMock('../src/lib/BranchContext.jsx', () => ({
      useEffectiveClinicSettings: () => ({ name: 'Test Clinic', accentColor: '#dc2626' }),
    }));
  });

  test('G1 — mounts, fetches master, renders LIVE override name', async () => {
    mockGetCourse.mockResolvedValue({
      courseId: 'C1',
      courseName: 'Original',
      receiptCourseName: 'LIVE OVERRIDE',
    });
    mockGetCustomer.mockResolvedValue({
      firstname: 'นิรุต', lastname: 'ชำนาญปรุ', patientData: {},
    });

    const { default: SalePrintView } = await import('../src/components/backend/SalePrintView.jsx');
    render(
      <SalePrintView
        sale={{
          saleId: 'TEST-V113',
          customerId: 'LC-1',
          customerName: '', // pre-revert empty
          items: { courses: [{ id: 'C1', name: 'Original' }] },
          billing: { netTotal: 1000 },
          payment: { status: 'paid' },
        }}
        onClose={() => {}}
      />
    );

    // Initially snapshot fallback. After useEffect resolves, live override.
    await waitFor(() => {
      expect(screen.queryByText('LIVE OVERRIDE')).toBeInTheDocument();
    });
  });

  test('G2 — live customer name resolved from doc when snapshot empty (V113-A + V113-C combined)', async () => {
    mockGetCourse.mockResolvedValue(null);
    mockGetCustomer.mockResolvedValue({
      firstname: 'นิรุต', lastname: 'ชำนาญปรุ',
      // V113-C: receiptInfo block also live-resolves; when customerName
      // is empty, the live name appears in BOTH the customer header
      // (V113-A) AND the receipt-info block (V113-C, since name !== '').
      patientData: {},
    });

    const { default: SalePrintView } = await import('../src/components/backend/SalePrintView.jsx');
    render(
      <SalePrintView
        sale={{
          saleId: 'TEST-V113-G2',
          customerId: 'LC-26000074',
          customerName: '', // INV-20260520-0010 case
          items: { courses: [] },
          billing: {},
          payment: {},
        }}
        onClose={() => {}}
      />
    );

    // V113-C: name appears in customer header AND receipt-info block
    // (both are correct behavior — see V113-C field-by-field merge).
    await waitFor(() => {
      const matches = screen.queryAllByText('นิรุต ชำนาญปรุ');
      expect(matches.length).toBeGreaterThanOrEqual(1);
    });
  });

  test('G3 — snapshot customerName preserved when present (admin explicit)', async () => {
    mockGetCourse.mockResolvedValue(null);
    mockGetCustomer.mockResolvedValue({
      firstname: 'Live Name', lastname: 'From Doc',
    });

    const { default: SalePrintView } = await import('../src/components/backend/SalePrintView.jsx');
    render(
      <SalePrintView
        sale={{
          saleId: 'TEST-V113-G3',
          customerId: 'LC-1',
          customerName: 'Admin Explicit Name',
          items: { courses: [] },
          billing: {},
          payment: {},
        }}
        onClose={() => {}}
      />
    );

    // Snapshot wins for the customer-header line
    expect(screen.queryByText('Admin Explicit Name')).toBeInTheDocument();
    // Wait for useEffect + state updates so we capture the post-resolve
    // render state (avoids the React "not wrapped in act" warning + assert).
    await waitFor(() => {
      // Live customer name must NOT appear as a standalone string anywhere
      // (snapshot wins for header; receipt-info block's name-row filter
      // `mergedReceiptInfo.name !== s.customerName` blocks duplicate
      // display since live name 'Live Name From Doc' != 'Admin Explicit Name').
      expect(screen.queryByText('Live Name From Doc')).not.toBeInTheDocument();
    });
    // Snapshot still in place after live-resolve completes.
    expect(screen.queryByText('Admin Explicit Name')).toBeInTheDocument();
  });

  test('G4 — snapshot fallback during initial render before useEffect resolves', async () => {
    // Resolves slowly to simulate network delay
    let resolveCourse;
    mockGetCourse.mockReturnValue(new Promise(r => { resolveCourse = r; }));
    mockGetCustomer.mockResolvedValue(null);

    const { default: SalePrintView } = await import('../src/components/backend/SalePrintView.jsx');
    render(
      <SalePrintView
        sale={{
          saleId: 'TEST-V113-G4',
          items: { courses: [{ id: 'C1', name: 'SNAPSHOT FALLBACK', receiptCourseName: '' }] },
          billing: {},
          payment: {},
        }}
        onClose={() => {}}
      />
    );

    // Initial render BEFORE master resolves → snapshot name shown
    expect(screen.queryByText('SNAPSHOT FALLBACK')).toBeInTheDocument();

    // Now master arrives with override → renderer switches
    resolveCourse({ receiptCourseName: 'LATE LIVE' });
    await waitFor(() => {
      expect(screen.queryByText('LATE LIVE')).toBeInTheDocument();
    });
  });
});
