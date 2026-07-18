// AV209 (2026-07-18) — positional-rowId TOCTOU class: customer.courses[] row
// targeting must be IDENTITY-FIRST, never a blindly-applied UI-frozen index.
//
// THE BUG CLASS (watchlist since the AV208 hunt): the UI captures an array
// index at render (CustomerDetailView entry.originalIndex / RemainingCourseTab
// row.courseIndex), freezes it into modal state, and commits minutes later.
// If ANOTHER machine inserted/removed/reordered courses[] in between, the
// stale index targets the WRONG row inside the tx — wrong course adjusted /
// exchanged / refunded / cancelled, silently (money-adjacent).
//
// THE FIX (one mechanism, Rule P): resolveCourseRowIndex (courseExchange.js)
// — courseId wins; index hint accepted only when it still matches the
// supplied name/product identity; else unambiguous identity search; else -1
// → COURSE_ROW_STALE_MSG. Mirrors the proven matchesDed hint-then-validate
// pattern of deductCourseItems. Legacy callers without identity keep the
// pre-AV209 bounds-only behavior (no silent behavior change for old tests).
//
// Harness: AV192 pattern — EXECUTE the real functions; the ONLY mock is the
// Firestore transaction boundary + audit setDoc. Identity resolution runs
// 100% real ESM.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

let _docData = null;     // what tx.get returns
let _written = null;     // payload captured from tx.update

vi.mock('firebase/firestore', async (orig) => {
  const actual = await orig();
  return {
    ...actual,
    runTransaction: async (_db, cb) => {
      const tx = {
        get: async () => ({ exists: () => _docData != null, data: () => _docData, id: 'TEST-AV209' }),
        update: (_ref, payload) => { _written = payload; if (_docData) Object.assign(_docData, payload); },
        set: () => {},
      };
      return cb(tx);
    },
    setDoc: async () => {},
    serverTimestamp: () => 0,
  };
});

const SRC_BC = readFileSync(path.resolve(process.cwd(), 'src/lib/backendClient.js'), 'utf8');
const SRC_CE = readFileSync(path.resolve(process.cwd(), 'src/lib/courseExchange.js'), 'utf8');
const SRC_SDL = readFileSync(path.resolve(process.cwd(), 'src/lib/scopedDataLayer.js'), 'utf8');
const SRC_CDV = readFileSync(path.resolve(process.cwd(), 'src/components/backend/CustomerDetailView.jsx'), 'utf8');
const SRC_REFUND = readFileSync(path.resolve(process.cwd(), 'src/components/backend/RefundCourseModal.jsx'), 'utf8');
const SRC_CANCEL = readFileSync(path.resolve(process.cwd(), 'src/components/backend/CancelCourseModal.jsx'), 'utf8');
const SRC_EXCH = readFileSync(path.resolve(process.cwd(), 'src/components/backend/ExchangeCourseModal.jsx'), 'utf8');

const rowA = (over = {}) => ({ name: 'คอร์ส A', product: 'Prod A', qty: '5 / 10 ครั้ง', ...over });
const rowB = (over = {}) => ({ name: 'คอร์ส B', product: 'Prod B', qty: '6 / 12 ครั้ง', ...over });

// ── A. resolveCourseRowIndex pure matrix ───────────────────────────────────
describe('AV209.A — resolveCourseRowIndex (pure)', () => {
  let resolveCourseRowIndex, COURSE_ROW_STALE_MSG;
  beforeEach(async () => {
    ({ resolveCourseRowIndex, COURSE_ROW_STALE_MSG } = await import('../src/lib/courseExchange.js'));
    expect(typeof COURSE_ROW_STALE_MSG).toBe('string');
  });

  it('A1 courseId is the strongest identity — wins over a wrong index hint', () => {
    const courses = [rowA(), rowB({ courseId: 'cid-B' })];
    expect(resolveCourseRowIndex(courses, { courseIndex: 0, courseId: 'cid-B' })).toBe(1);
  });

  it('A2 index hint accepted when the row still matches name+product', () => {
    const courses = [rowA(), rowB()];
    expect(resolveCourseRowIndex(courses, { courseIndex: 1, name: 'คอร์ส B', product: 'Prod B' })).toBe(1);
  });

  it('A3 TOCTOU shift-left (concurrent removal): stale index OOB → identity search finds the row', () => {
    const courses = [rowB()]; // A was removed concurrently; UI froze index 1
    expect(resolveCourseRowIndex(courses, { courseIndex: 1, name: 'คอร์ส B', product: 'Prod B' })).toBe(0);
  });

  it('A4 TOCTOU shift-right (concurrent insert at head): stale index mismatches → identity re-targets', () => {
    const courses = [rowA(), rowB()]; // UI saw [B] and froze index 0; A inserted at head
    expect(resolveCourseRowIndex(courses, { courseIndex: 0, name: 'คอร์ส B', product: 'Prod B' })).toBe(1);
  });

  it('A5 ambiguous duplicates + stale index → -1 (never guess)', () => {
    const courses = [rowB(), rowB()];
    expect(resolveCourseRowIndex(courses, { courseIndex: 5, name: 'คอร์ส B', product: 'Prod B' })).toBe(-1);
  });

  it('A6 duplicates BUT the index hint still matches → the hinted row wins (exact targeting preserved)', () => {
    const courses = [rowB(), rowB()];
    expect(resolveCourseRowIndex(courses, { courseIndex: 1, name: 'คอร์ส B', product: 'Prod B' })).toBe(1);
  });

  it('A7 legacy caller (no identity): bounds-checked index passes through unchanged', () => {
    const courses = [rowA(), rowB()];
    expect(resolveCourseRowIndex(courses, { courseIndex: 1 })).toBe(1);
    expect(resolveCourseRowIndex(courses, { courseIndex: 9 })).toBe(-1);
    expect(resolveCourseRowIndex(courses, { courseIndex: -1 })).toBe(-1);
  });

  it('A8 identity not found at all → -1', () => {
    const courses = [rowA()];
    expect(resolveCourseRowIndex(courses, { courseIndex: 0, name: 'ไม่มีจริง' })).toBe(-1);
  });

  it('A9 empty-product rows: name-only identity matches (legacy shape)', () => {
    const courses = [rowA({ product: '' })];
    expect(resolveCourseRowIndex(courses, { courseIndex: 3, name: 'คอร์ส A' })).toBe(0);
  });

  it('A10 adversarial inputs: null courses / null rows / Thai+emoji names', () => {
    expect(resolveCourseRowIndex(null, { courseIndex: 0 })).toBe(-1);
    expect(resolveCourseRowIndex([null, rowB()], { courseIndex: 0, name: 'คอร์ส B' })).toBe(1);
    const th = [rowA({ name: 'คอร์ส 💉 ฟิลเลอร์' })];
    expect(resolveCourseRowIndex(th, { courseIndex: 7, name: 'คอร์ส 💉 ฟิลเลอร์' })).toBe(0);
  });

  // ── Hunt R1 hardenings (2026-07-19) ──────────────────────────────────────
  it("A11 R1-#1: product '' is a CONSTRAINT — a legacy ''-product row never matches a different-product sibling", () => {
    // Pre-fix: '' skipped the product constraint → name-only search hit the
    // ProdY sibling → wrong-row refund (pre-AV209 this state was a safe throw).
    const courses = [rowA({ name: 'X', product: 'ProdY' })]; // legacy row L{X, ''} was removed concurrently
    expect(resolveCourseRowIndex(courses, { courseIndex: 1, name: 'X', product: '' })).toBe(-1);
    // and '' matches '' (the legacy row itself, post-shift)
    const legacy = [rowA({ name: 'X', product: '' })];
    expect(resolveCourseRowIndex(legacy, { courseIndex: 9, name: 'X', product: '' })).toBe(0);
    // undefined product = genuinely no constraint (legacy identity-less caller)
    expect(resolveCourseRowIndex(courses, { courseIndex: 0 })).toBe(0);
  });

  it('A12 R1-#2: a supplied courseId that no longer exists is DEFINITIVE staleness — identity twins are never fallen into', () => {
    const courses = [rowB({ courseId: 'cid-P2' })]; // P1 (cid-P1) was cancelled/spliced concurrently
    expect(resolveCourseRowIndex(courses, {
      courseIndex: 0, courseId: 'cid-P1', name: 'คอร์ส B', product: 'Prod B',
    })).toBe(-1); // pre-fix: fell through to the hint → P2 silently mutated
  });

  it('A13 R1-#3 + R2-#1: terminal handling is SPLIT — a matching HINT wins even when terminal; the SEARCH excludes terminal twins', () => {
    // IN-PLACE terminalization (R2-#1): the admin's row (hint 0) went terminal
    // via a concurrent sale-cancel cascade (status flip, no move) → return the
    // HINT so downstream raises already-refunded / COURSE_ROW_TERMINAL_MSG.
    // (The R1 draft redirected to the live twin here → silent wrong-row
    // cancel/refund of a DIFFERENT purchase — locked out permanently.)
    const inPlace = [rowB({ status: 'คืนเงิน' }), rowB()];
    expect(resolveCourseRowIndex(inPlace, { courseIndex: 0, name: 'คอร์ส B', product: 'Prod B' })).toBe(0);
    // Array-SHIFT: hint mismatches identity → the search EXCLUDES the
    // refunded twin and finds the single live one.
    const shifted = [rowA(), rowB({ status: 'คืนเงิน' }), rowB()];
    expect(resolveCourseRowIndex(shifted, { courseIndex: 0, name: 'คอร์ส B', product: 'Prod B' })).toBe(2);
    // Hint OOB + only terminal twins remain → -1 (never resurrect via search)
    const allDead = [rowB({ status: 'ยกเลิก' }), rowB({ status: 'คืนเงิน' })];
    expect(resolveCourseRowIndex(allDead, { courseIndex: 5, name: 'คอร์ส B', product: 'Prod B' })).toBe(-1);
    // Legacy no-identity: bounds-only parity (terminal at hint accepted;
    // downstream already-X guards handle it)
    expect(resolveCourseRowIndex(allDead, { courseIndex: 1 })).toBe(1);
  });

  it('A14 R2-#1 execution: adjust/exchange/remove refuse a terminalized target with the Thai terminal error / no-op', async () => {
    const { COURSE_ROW_TERMINAL_MSG } = await import('../src/lib/courseExchange.js');
    const { adjustCourseRemainingQty, exchangeCourseProduct, removeCustomerCourseRowAtomic } = await import('../src/lib/backendClient.js');
    // adjust: in-place-terminalized hint → Thai terminal error, NO write
    _docData = { courses: [{ name: 'คอร์ส B', product: 'Prod B', qty: '6 / 12 ครั้ง', status: 'คืนเงิน' }] };
    _written = null;
    await expect(adjustCourseRemainingQty('TEST-AV209', 0, 1, {
      expectedName: 'คอร์ส B', expectedProduct: 'Prod B',
    })).rejects.toThrow(COURSE_ROW_TERMINAL_MSG);
    expect(_written).toBeNull();
    // exchange: same refusal
    _docData = { courses: [{ name: 'คอร์ส B', product: 'Prod B', qty: '6 / 12 ครั้ง', status: 'ยกเลิก' }] };
    await expect(exchangeCourseProduct('TEST-AV209', 0, { name: 'ใหม่', qty: 1 }, '', {
      expectedName: 'คอร์ส B', expectedProduct: 'Prod B',
    })).rejects.toThrow(COURSE_ROW_TERMINAL_MSG);
    // remove: non-fatal no-op (audit-trail rows must survive)
    _docData = { courses: [{ name: 'คอร์ส B', product: 'Prod B', qty: '0 / 12 ครั้ง', status: 'คืนเงิน' }] };
    const res = await removeCustomerCourseRowAtomic('TEST-AV209', {
      courseIndex: 0, expectedName: 'คอร์ส B', expectedProduct: 'Prod B',
    });
    expect(res).toEqual({ removed: false, reason: 'terminal-status' });
  });
});

// ── B. adjustCourseRemainingQty EXECUTION (TOCTOU scenarios) ───────────────
describe('AV209.B — adjustCourseRemainingQty applies at the IDENTITY row, not the stale index', () => {
  beforeEach(() => { _docData = null; _written = null; });

  it('B1 shift-left: UI froze index 1 (คอร์ส B), row A removed concurrently → B still adjusted', async () => {
    const { adjustCourseRemainingQty } = await import('../src/lib/backendClient.js');
    _docData = { courses: [rowB()] }; // index 1 is now OOB
    const res = await adjustCourseRemainingQty('TEST-AV209', 1, -1, {
      expectedName: 'คอร์ส B', expectedProduct: 'Prod B',
    });
    expect(res.qtyAfter).toBe('5 / 12 ครั้ง');
    expect(res.courseName).toBe('คอร์ส B');
    expect(_written.courses[0].qty).toBe('5 / 12 ครั้ง');
  });

  it('B2 shift-right: UI froze index 0 (คอร์ส B), row inserted at head → the OTHER row untouched', async () => {
    const { adjustCourseRemainingQty } = await import('../src/lib/backendClient.js');
    _docData = { courses: [rowA(), rowB()] };
    const res = await adjustCourseRemainingQty('TEST-AV209', 0, 2, {
      expectedName: 'คอร์ส B', expectedProduct: 'Prod B',
    });
    expect(res.courseName).toBe('คอร์ส B');
    expect(_written.courses[0].qty).toBe('5 / 10 ครั้ง'); // row A NOT touched (pre-fix bug hit this row)
    expect(_written.courses[1].qty).toBe('8 / 12 ครั้ง');
  });

  it('B3 ambiguous duplicates + stale index → Thai stale error, NO write', async () => {
    const { adjustCourseRemainingQty } = await import('../src/lib/backendClient.js');
    const { COURSE_ROW_STALE_MSG } = await import('../src/lib/courseExchange.js');
    _docData = { courses: [rowB(), rowB()] };
    await expect(adjustCourseRemainingQty('TEST-AV209', 5, -1, {
      expectedName: 'คอร์ส B', expectedProduct: 'Prod B',
    })).rejects.toThrow(COURSE_ROW_STALE_MSG);
    expect(_written).toBeNull();
  });

  it('B4 legacy caller (no identity): pre-AV209 behavior preserved (bounds-only index)', async () => {
    const { adjustCourseRemainingQty } = await import('../src/lib/backendClient.js');
    _docData = { courses: [rowA(), rowB()] };
    const res = await adjustCourseRemainingQty('TEST-AV209', 0, -1, {});
    expect(res.courseName).toBe('คอร์ส A');
    await expect((async () => {
      _docData = { courses: [rowA()] };
      return adjustCourseRemainingQty('TEST-AV209', 9, -1, {});
    })()).rejects.toThrow('Invalid course index');
  });

  it('B5 courseId identity beats a wrong index hint', async () => {
    const { adjustCourseRemainingQty } = await import('../src/lib/backendClient.js');
    _docData = { courses: [rowA({ courseId: 'cid-A' }), rowB({ courseId: 'cid-B' })] };
    const res = await adjustCourseRemainingQty('TEST-AV209', 0, -2, { courseId: 'cid-B' });
    expect(res.courseName).toBe('คอร์ส B');
    expect(_written.courses[1].qty).toBe('4 / 12 ครั้ง');
  });
});

// ── C. exchangeCourseProduct EXECUTION ─────────────────────────────────────
describe('AV209.C — exchangeCourseProduct identity targeting', () => {
  beforeEach(() => { _docData = null; _written = null; });

  it('C1 shift-left TOCTOU: stale index re-targets by identity; exchange log records the RIGHT old row', async () => {
    const { exchangeCourseProduct } = await import('../src/lib/backendClient.js');
    _docData = { courses: [rowB()] };
    const res = await exchangeCourseProduct('TEST-AV209', 1, { name: 'ใหม่', qty: 3, unit: 'ครั้ง' }, 'สลับ', {
      expectedName: 'คอร์ส B', expectedProduct: 'Prod B',
    });
    expect(res.success).toBe(true);
    expect(res.exchangeLog.oldProduct).toBe('Prod B');
    expect(_written.courses[0].product).toBe('ใหม่');
  });

  it('C2 ambiguous → stale error, no write', async () => {
    const { exchangeCourseProduct } = await import('../src/lib/backendClient.js');
    const { COURSE_ROW_STALE_MSG } = await import('../src/lib/courseExchange.js');
    _docData = { courses: [rowB(), rowB()] };
    await expect(exchangeCourseProduct('TEST-AV209', 7, { name: 'ใหม่', qty: 1 }, '', {
      expectedName: 'คอร์ส B', expectedProduct: 'Prod B',
    })).rejects.toThrow(COURSE_ROW_STALE_MSG);
    expect(_written).toBeNull();
  });

  it('C3 legacy caller: bounds-only behavior preserved', async () => {
    const { exchangeCourseProduct } = await import('../src/lib/backendClient.js');
    _docData = { courses: [rowA(), rowB()] };
    const res = await exchangeCourseProduct('TEST-AV209', 0, { name: 'ใหม่', qty: 1, unit: '' }, '');
    expect(res.exchangeLog.oldProduct).toBe('Prod A');
  });
});

// ── D. refund / cancel identity threading (pure + wrapper execution) ───────
describe('AV209.D — applyCourseRefund / applyCourseCancel identity-validated fallback', () => {
  beforeEach(() => { _docData = null; _written = null; });

  it('D1 stale index + expectedName → refunds the RIGHT row after shift', async () => {
    const { applyCourseRefund } = await import('../src/lib/courseExchange.js');
    const customer = { courses: [rowB()] }; // UI froze index 1 pre-shift
    const { fromCourse } = applyCourseRefund(customer, '', 100, {
      courseIndex: 1, expectedName: 'คอร์ส B', expectedProduct: 'Prod B',
    });
    expect(fromCourse.name).toBe('คอร์ส B');
  });

  it('D2 courseId MISS no longer falls back to a blind index when identity mismatches', async () => {
    const { applyCourseRefund, COURSE_ROW_STALE_MSG } = await import('../src/lib/courseExchange.js');
    // courseId gone (row removed) + index now points at a DIFFERENT course.
    const customer = { courses: [rowA()] };
    expect(() => applyCourseRefund(customer, 'cid-GONE', 100, {
      courseIndex: 0, expectedName: 'คอร์ส B', expectedProduct: 'Prod B',
    })).toThrow(COURSE_ROW_STALE_MSG);
  });

  it('D3 legacy (no identity): bounds fallback preserved', async () => {
    const { applyCourseRefund } = await import('../src/lib/courseExchange.js');
    const customer = { courses: [rowA()] };
    const { fromCourse } = applyCourseRefund(customer, '', 50, { courseIndex: 0 });
    expect(fromCourse.name).toBe('คอร์ส A');
  });

  it('D4 applyCourseCancel mirrors the same resolution', async () => {
    const { applyCourseCancel, COURSE_ROW_STALE_MSG } = await import('../src/lib/courseExchange.js');
    const shifted = { courses: [rowB()] };
    const { fromCourse } = applyCourseCancel(shifted, '', {
      courseIndex: 1, expectedName: 'คอร์ส B', expectedProduct: 'Prod B', reason: 'x',
    });
    expect(fromCourse.name).toBe('คอร์ส B');
    const ambiguous = { courses: [rowB(), rowB()] };
    expect(() => applyCourseCancel(ambiguous, '', {
      courseIndex: 9, expectedName: 'คอร์ส B', expectedProduct: 'Prod B', reason: 'x',
    })).toThrow(COURSE_ROW_STALE_MSG);
  });

  it('D5 refundCustomerCourse wrapper threads expectedName/expectedProduct end-to-end', async () => {
    const { refundCustomerCourse } = await import('../src/lib/backendClient.js');
    _docData = { courses: [rowB()] };
    const res = await refundCustomerCourse('TEST-AV209', '', 250, {
      courseIndex: 1, expectedName: 'คอร์ส B', expectedProduct: 'Prod B', reason: 'ทดสอบ',
    });
    expect(res.fromCourse.name).toBe('คอร์ส B');
    expect(_written.courses[0].status).toBe('คืนเงิน');
  });
});

// ── E. removeCustomerCourseRowAtomic (ExchangeModal full-exchange cleanup) ──
describe('AV209.E — removeCustomerCourseRowAtomic', () => {
  beforeEach(() => { _docData = null; _written = null; });

  it('E1 removes the zeroed row located by identity after a concurrent shift', async () => {
    const { removeCustomerCourseRowAtomic } = await import('../src/lib/backendClient.js');
    _docData = { courses: [rowA(), rowB({ qty: '0 / 12 ครั้ง' })] };
    const res = await removeCustomerCourseRowAtomic('TEST-AV209', {
      courseIndex: 0, expectedName: 'คอร์ส B', expectedProduct: 'Prod B',
    });
    expect(res.removed).toBe(true);
    expect(_written.courses).toHaveLength(1);
    expect(_written.courses[0].name).toBe('คอร์ส A');
  });

  it('E2 requireZeroRemaining guards a racing top-up (remaining>0 → no-op)', async () => {
    const { removeCustomerCourseRowAtomic } = await import('../src/lib/backendClient.js');
    _docData = { courses: [rowB({ qty: '2 / 12 ครั้ง' })] };
    const res = await removeCustomerCourseRowAtomic('TEST-AV209', {
      courseIndex: 0, expectedName: 'คอร์ส B', expectedProduct: 'Prod B',
    });
    expect(res.removed).toBe(false);
    expect(res.reason).toBe('remaining>0');
  });

  it('E3 not-found → non-fatal no-op (post-deduct cleanup semantics)', async () => {
    const { removeCustomerCourseRowAtomic } = await import('../src/lib/backendClient.js');
    _docData = { courses: [rowA()] };
    const res = await removeCustomerCourseRowAtomic('TEST-AV209', {
      courseIndex: 9, expectedName: 'ไม่มีจริง',
    });
    expect(res.removed).toBe(false);
    expect(res.reason).toBe('not-found');
  });
});

// ── F. source-grep regression locks (callsite contracts) ───────────────────
describe('AV209.F — source-grep locks', () => {
  it('F1 adjustCourseRemainingQty + exchangeCourseProduct resolve via resolveCourseRowIndex', () => {
    const adj = SRC_BC.slice(SRC_BC.indexOf('export async function adjustCourseRemainingQty'));
    expect(adj.slice(0, 3000)).toMatch(/resolveCourseRowIndex/);
    const exch = SRC_BC.slice(SRC_BC.indexOf('export async function exchangeCourseProduct'));
    expect(exch.slice(0, 3000)).toMatch(/resolveCourseRowIndex/);
  });

  it('F2 removeCustomerCourseRowAtomic exported + scopedDataLayer passthrough', () => {
    expect(SRC_BC).toMatch(/export async function removeCustomerCourseRowAtomic/);
    expect(SRC_SDL).toMatch(/removeCustomerCourseRowAtomic = \(\.\.\.args\) => raw\.removeCustomerCourseRowAtomic/);
  });

  it('F3 CustomerDetailView AddQtyModal passes expectedName+expectedProduct', () => {
    const i = SRC_CDV.indexOf('await adjustCourseRemainingQty(');
    expect(i).toBeGreaterThan(-1);
    const window = SRC_CDV.slice(i, i + 500);
    expect(window).toMatch(/expectedName:/);
    expect(window).toMatch(/expectedProduct:/);
  });

  it('F4 ExchangeModal + ShareModal deductions carry productName (full identity for matchesDed)', () => {
    const calls = SRC_CDV.match(/deductCourseItems\([^\]]*\{ courseIndex, deductQty[^}]*\}/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const c of calls) expect(c).toMatch(/productName: course\.product/);
  });

  it('F5 ExchangeModal full-exchange cleanup is ATOMIC (no getCustomer→splice→updateCustomer RMW remains)', () => {
    expect(SRC_CDV).toMatch(/removeCustomerCourseRowAtomic\(customerId, \{/);
    // anti-regression on the exact pre-AV209 non-atomic pattern
    expect(SRC_CDV).not.toMatch(/updateCustomer\(customerId, \{ courses: cur \}\)/);
  });

  it('F6 RemainingCourseTab modals pass identity (refund / cancel / exchange)', () => {
    for (const [src, label] of [[SRC_REFUND, 'refund'], [SRC_CANCEL, 'cancel'], [SRC_EXCH, 'exchange']]) {
      expect(src, `${label} modal must pass expectedName`).toMatch(/expectedName: row\.courseName/);
      expect(src, `${label} modal must pass expectedProduct`).toMatch(/expectedProduct: row\.product/);
    }
    expect(SRC_EXCH).toMatch(/courseId: row\.hasRealCourseId \? row\.courseId : ''/);
  });

  it('F8 BONUS BUG (caught live by the AV209 L2 e2e): buildChangeAuditEntry accepts kind=reduce', async () => {
    // 2026-06-09 unified add/reduce emitted kind='reduce' but the whitelist was
    // never extended → EVERY ลดคงเหลือ audit emit threw into the non-fatal
    // catch → ประวัติการใช้คอร์ส silently missed all reduces (the reader
    // CourseHistoryTab supported 'reduce' all along).
    const { buildChangeAuditEntry } = await import('../src/lib/courseExchange.js');
    const audit = buildChangeAuditEntry({
      customerId: 'TEST-AV209', kind: 'reduce',
      fromCourse: rowB(), toCourse: null, refundAmount: null,
      reason: 'ลดคงเหลือ -1', actor: '', qtyDelta: -1,
      qtyBefore: '6 / 12 ครั้ง', qtyAfter: '5 / 12 ครั้ง',
    });
    expect(audit.kind).toBe('reduce');
    expect(SRC_CE).toMatch(/'add', 'reduce', 'share', 'use'/);
    // the reader really does render 'reduce'
    const hist = readFileSync(path.resolve(process.cwd(), 'src/components/backend/CourseHistoryTab.jsx'), 'utf8');
    expect(hist).toMatch(/reduce:\s*\{ label: 'ลดคงเหลือ'/);
  });

  it('F7 courseExchange refund/cancel no longer carry the blind bounds-only fallback', () => {
    // pre-AV209 pattern: `if (idx < 0 && hasIdxInput) { ... if (opts.courseIndex < len) idx = opts.courseIndex; }`
    expect(SRC_CE).not.toMatch(/if \(idx < 0 && hasIdxInput\)/);
    const refund = SRC_CE.slice(SRC_CE.indexOf('export function applyCourseRefund'));
    expect(refund.slice(0, 2500)).toMatch(/resolveCourseRowIndex/);
    const cancel = SRC_CE.slice(SRC_CE.indexOf('export function applyCourseCancel'));
    expect(cancel.slice(0, 2500)).toMatch(/resolveCourseRowIndex/);
  });
});
