// AV192 — courseUtils helper must be in lexical scope wherever backendClient uses it.
//
// PROD CRASH (2026-06-09): clicking "ยืนยันลด -1" / "ยืนยันเพิ่ม" in the customer
// "แก้คงเหลือ" modal threw `parseQtyString is not defined`. Root cause:
// adjustCourseRemainingQty (backendClient.js) uses parseQtyString at the reduce
// branch + the post-mutate unit-resolve, but the file's module-top static import
//   `import { deductQty, reverseQty, addRemaining as addRemainingQty, buildQtyString, formatQtyString } from './courseUtils.js'`
// OMITTED parseQtyString (every OTHER user either top-level-imports it or does its
// own per-function `await import('./courseUtils.js')`). An undefined identifier
// resolves to a global lookup, so `npm run build` is CLEAN — it only throws at
// runtime on the save click. Fix: add parseQtyString to that static import →
// module-scoped for every function (class-eliminating).
//
// WHY THE OLD TESTS MISSED IT (V66 lesson): the existing C1.6–C1.13 in
// course-adjust-and-fixes-2026-06-09.test.js are SOURCE-GREP only — they read the
// function text + regex it, never EXECUTE it. Source-grep cannot catch a lexical-
// scope ReferenceError. This file EXECUTES the real function (the only mock is the
// Firestore transaction boundary; the parseQtyString import resolution is 100%
// real ESM) — so it goes RED on the pre-fix code and GREEN on the fix.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

// --- Mutable doc state + captured write, driven by the Firestore tx stub below ---
let _docData = null;     // { courses: [...] } — what tx.get returns
let _written = null;     // payload captured from tx.update

// Mock ONLY the transaction boundary + the audit write. Everything else
// (doc / collection / the real parseQtyString import graph) stays REAL.
vi.mock('firebase/firestore', async (orig) => {
  const actual = await orig();
  return {
    ...actual,
    runTransaction: async (_db, cb) => {
      const tx = {
        get: async () => ({ exists: () => _docData != null, data: () => _docData }),
        update: (_ref, payload) => { _written = payload; if (_docData) Object.assign(_docData, payload); },
        set: () => {},
      };
      return cb(tx);
    },
    setDoc: async () => {},       // swallow the be_course_changes audit write (no network)
    serverTimestamp: () => 0,
  };
});

const SRC = readFileSync(path.resolve(process.cwd(), 'src/lib/backendClient.js'), 'utf8');
const COURSEUTILS = readFileSync(path.resolve(process.cwd(), 'src/lib/courseUtils.js'), 'utf8');

describe('AV192 — adjustCourseRemainingQty EXECUTES without a scope ReferenceError', () => {
  beforeEach(() => { _docData = null; _written = null; });

  const seed = (qty) => ({ courses: [{ name: 'Shock Wave 12 ครั้ง', product: 'Shock wave', qty }] });

  it('AV192.1 REDUCE -1 on "6 / 12 ครั้ง" → "5 / 12 ครั้ง" (parseQtyString reduce-branch resolves)', async () => {
    const { adjustCourseRemainingQty } = await import('../src/lib/backendClient.js');
    _docData = seed('6 / 12 ครั้ง');
    // Pre-fix this rejected with "parseQtyString is not defined" at the reduce branch.
    const res = await adjustCourseRemainingQty('TEST-LC-AV192', 0, -1, { staffName: 'หมอมายด์' });
    expect(res.qtyAfter).toBe('5 / 12 ครั้ง');
    expect(res.isReduce).toBe(true);
    expect(res.delta).toBe(-1);
    expect(res.unit).toBe('ครั้ง');                 // proves the post-mutate parseQtyString(beforeQty).unit ran
    expect(_written.courses[0].qty).toBe('5 / 12 ครั้ง');
  });

  it('AV192.2 ADD +2 on "5 / 12 ครั้ง" → "7 / 12 ครั้ง" (add path also hits parseQtyString at the unit-resolve)', async () => {
    const { adjustCourseRemainingQty } = await import('../src/lib/backendClient.js');
    _docData = seed('5 / 12 ครั้ง');
    const res = await adjustCourseRemainingQty('TEST-LC-AV192', 0, 2, { staffName: 'หมอมายด์' });
    expect(res.qtyAfter).toBe('7 / 12 ครั้ง');       // reverseQty caps at total
    expect(res.isReduce).toBe(false);
    expect(res.unit).toBe('ครั้ง');
  });

  it('AV192.3 ADD caps at total: "11 / 12 ครั้ง" +3 → "12 / 12 ครั้ง"', async () => {
    const { adjustCourseRemainingQty } = await import('../src/lib/backendClient.js');
    _docData = seed('11 / 12 ครั้ง');
    const res = await adjustCourseRemainingQty('TEST-LC-AV192', 0, 3, {});
    expect(res.qtyAfter).toBe('12 / 12 ครั้ง');
  });

  it('AV192.4 REDUCE floors at 0: "1 / 12 ครั้ง" -5 → "0 / 12 ครั้ง"', async () => {
    const { adjustCourseRemainingQty } = await import('../src/lib/backendClient.js');
    _docData = seed('1 / 12 ครั้ง');
    const res = await adjustCourseRemainingQty('TEST-LC-AV192', 0, -5, {});
    expect(res.qtyAfter).toBe('0 / 12 ครั้ง');
  });

  it('AV192.5 addCourseRemainingQty wrapper executes too (it delegates to adjustCourseRemainingQty)', async () => {
    const { addCourseRemainingQty } = await import('../src/lib/backendClient.js');
    _docData = seed('6 / 12 ครั้ง');
    const course = await addCourseRemainingQty('TEST-LC-AV192', 0, 1);
    expect(course.qty).toBe('7 / 12 ครั้ง');
  });
});

describe('AV192 — class invariant: every courseUtils export used in backendClient is in scope', () => {
  // courseUtils.js exports (the leaf module). Add a name here if courseUtils grows.
  const EXPORTS = ['parseQtyString', 'formatQtyString', 'deductQty', 'reverseQty', 'addRemaining', 'buildQtyString'];

  it('AV192.6 courseUtils.js exports the expected helper set', () => {
    for (const name of EXPORTS) {
      expect(COURSEUTILS, `courseUtils must export ${name}`).toMatch(new RegExp(`export function ${name}\\b`));
    }
  });

  it('AV192.7 the module-top static import INCLUDES parseQtyString (+ the other 5)', () => {
    // The exact line that omitting parseQtyString from caused the prod crash.
    const m = SRC.match(/import \{([^}]*)\} from '\.\/courseUtils\.js';/);
    expect(m, 'module-top courseUtils static import not found').toBeTruthy();
    const named = m[1];
    expect(named).toMatch(/\bparseQtyString\b/);
    for (const n of ['deductQty', 'reverseQty', 'addRemaining', 'buildQtyString', 'formatQtyString']) {
      expect(named, `static import must include ${n}`).toMatch(new RegExp(`\\b${n}\\b`));
    }
  });

  it('AV192.8 CLASSIFIER: each courseUtils symbol used in a backendClient fn is in module scope OR that fn dynamic-imports it', () => {
    // Module-scope names available everywhere: the static-import list (hoisted).
    const staticImport = SRC.match(/import \{([^}]*)\} from '\.\/courseUtils\.js';/)[1];
    const moduleScope = new Set(
      staticImport.split(',').map((s) => s.trim().split(/\s+as\s+/)[0].trim()).filter(Boolean)
    );
    // Split file into exported-function bodies; for each, the symbols it can see =
    // moduleScope ∪ (names it destructures from a `= await import('./courseUtils.js')`).
    const fnRe = /(?:export )?(?:async )?function (\w+)\s*\(/g;
    const starts = [];
    let mm;
    while ((mm = fnRe.exec(SRC))) starts.push({ name: mm[1], at: mm.index });
    const offenders = [];
    for (let i = 0; i < starts.length; i++) {
      const body = SRC.slice(starts[i].at, starts[i + 1]?.at ?? SRC.length);
      const dyn = body.match(/const \{([^}]*)\} = await import\('\.\/courseUtils\.js'\)/);
      const localScope = new Set(moduleScope);
      if (dyn) dyn[1].split(',').forEach((s) => localScope.add(s.trim().split(/\s+as\s+/)[0].trim()));
      for (const sym of ['parseQtyString', 'formatQtyString', 'deductQty', 'reverseQty', 'buildQtyString']) {
        // is the symbol CALLED in this fn body? (call-site, not a comment mention)
        if (new RegExp(`(?<![\\w.])${sym}\\s*\\(`).test(body) && !localScope.has(sym)) {
          offenders.push(`${starts[i].name}() uses ${sym} but it is not in scope`);
        }
      }
    }
    expect(offenders, `out-of-scope courseUtils usage(s):\n${offenders.join('\n')}`).toEqual([]);
  });
});
