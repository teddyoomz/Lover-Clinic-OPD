// ─── V94 — audit-2026-05-18 batch fixes (S18 + H7 + A7) ─────────────────────
//
// Companion to V93 (TZ1 batch). audit-all 2026-05-18 EOD+11 LATE found three
// other P0-P1 issues fixed in this batch:
//
//   S18 — cancelCentralStockOrder writeBatch atomicity gap
//         (src/lib/backendClient.js:6256-6306)
//   H7  — TreatmentTimeline.confirmCancel missing course-reverse cascade
//         (src/components/TreatmentTimeline.jsx:118 vs BackendDashboard.jsx:475-493)
//   A7  — bare fetch() across 18 api/ sites missing timeout
//         (architectural — shared apiFetch helper at api/_lib/apiFetch.js)
//
// Source-grep regression tests lock the fixes at the file boundary.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const READ = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

// ═══════════════════════════════════════════════════════════════════════
// V94.S — S18 cancelCentralStockOrder writeBatch atomicity
// ═══════════════════════════════════════════════════════════════════════

describe('V94.S: cancelCentralStockOrder uses writeBatch atomic cascade', () => {
  const SRC = READ('src/lib/backendClient.js');

  // Slice out just the cancelCentralStockOrder function body for tight asserts.
  // The function declaration starts with `export async function cancelCentralStockOrder`.
  const fnStart = SRC.indexOf('export async function cancelCentralStockOrder');
  expect(fnStart, 'cancelCentralStockOrder must be present').toBeGreaterThan(-1);
  const fnEnd = SRC.indexOf('\nexport ', fnStart + 1);
  const FN_BODY = SRC.slice(fnStart, fnEnd > fnStart ? fnEnd : SRC.length);

  it('S.1: function body creates writeBatch (wb = writeBatch(db))', () => {
    expect(FN_BODY).toMatch(/const wb\s*=\s*writeBatch\(db\)/);
  });

  it('S.2: batch update on stockBatchDoc (NOT direct updateDoc on cancel cascade)', () => {
    expect(FN_BODY).toMatch(/wb\.update\(stockBatchDoc\(batchId\)/);
  });

  it('S.3: batch set on stockMovementDoc (NOT direct setDoc on cancel cascade)', () => {
    expect(FN_BODY).toMatch(/wb\.set\(stockMovementDoc\(movementId\)/);
  });

  it('S.4: batch update on centralStockOrderDoc (final order flip atomic)', () => {
    expect(FN_BODY).toMatch(/wb\.update\(centralStockOrderDoc\(orderId\)/);
  });

  it('S.5: single await wb.commit() at end of cascade', () => {
    expect(FN_BODY).toMatch(/await wb\.commit\(\)/);
  });

  it('S.6: V14 + V48 invariants preserved (live productName resolve still present)', () => {
    expect(FN_BODY).toMatch(/_resolveProductNameLive\(batch\.productId\)/);
  });

  it('S.7: no leftover non-atomic await updateDoc / await setDoc inside the cascade loop', () => {
    // The cascade loop starts after `for (const batchId of receivedBatchIds)` SECOND occurrence
    // (first is the pre-check movement-trail scan). The cascade body must NOT contain
    // `await updateDoc(stockBatchDoc` or `await setDoc(stockMovementDoc` anymore.
    const cascadeStart = FN_BODY.indexOf('const wb = writeBatch(db)');
    expect(cascadeStart).toBeGreaterThan(-1);
    const cascade = FN_BODY.slice(cascadeStart);
    expect(cascade).not.toMatch(/await updateDoc\(stockBatchDoc\(/);
    expect(cascade).not.toMatch(/await setDoc\(stockMovementDoc\(/);
    // The final order flip MUST also be batched (not a standalone await updateDoc).
    expect(cascade).not.toMatch(/await updateDoc\(centralStockOrderDoc\(/);
  });

  it('S.8: V34 sibling pattern reference in comment (institutional memory)', () => {
    expect(FN_BODY).toMatch(/S18|V34|atomicity|writeBatch|cancelStockOrder/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// V94.H — H7 TreatmentTimeline course-reverse cascade
// ═══════════════════════════════════════════════════════════════════════

describe('V94.H: TreatmentTimeline.confirmCancel includes course-reverse cascade', () => {
  const SRC = READ('src/components/TreatmentTimeline.jsx');

  it('H.1: dynamic-imports getTreatment + reverseCourseDeduction via scopedDataLayer (BS-1)', () => {
    // BSA Task 6 / BS-1 — UI files MUST route through scopedDataLayer.js,
    // not backendClient.js directly. Pass-through helpers are functionally
    // identical for these collections.
    expect(SRC).toMatch(/import\(['"]\.\.\/lib\/scopedDataLayer\.js['"]\)/);
    expect(SRC).toMatch(/getTreatment[\s\S]{0,80}reverseCourseDeduction/);
  });

  it('H.2: filters courseItems by rowId prefix (purchased- / promo-) — both halves', () => {
    expect(SRC).toMatch(/!ci\.rowId\?\.startsWith\(['"]purchased-['"]\)\s*&&\s*!ci\.rowId\?\.startsWith\(['"]promo-['"]\)/);
    expect(SRC).toMatch(/ci\.rowId\?\.startsWith\(['"]purchased-['"]\)\s*\|\|\s*ci\.rowId\?\.startsWith\(['"]promo-['"]\)/);
  });

  it('H.3: existing courses reverse without preferNewest', () => {
    expect(SRC).toMatch(/reverseCourseDeduction\(customerId,\s*oldExisting\)/);
  });

  it('H.4: purchased/promo courses reverse with preferNewest:true', () => {
    expect(SRC).toMatch(/reverseCourseDeduction\(customerId,\s*oldPurchased,\s*\{\s*preferNewest:\s*true\s*\}\)/);
  });

  it('H.5: cascade gated on customerId truthy (NULL-safe — no throw on missing prop)', () => {
    expect(SRC).toMatch(/if \(customerId\) \{[\s\S]*?reverseCourseDeduction/);
  });

  it('H.6: cascade wrapped in try/catch (failure MUST NOT block deleteBackendTreatment)', () => {
    // Find the if(customerId) block opening, then assert it contains
    // try { ... reverseCourseDeduction ... } catch BEFORE the if-block closes.
    // Use a forgiving regex with [\s\S]*? lazy match.
    expect(SRC).toMatch(
      /if \(customerId\) \{[\s\S]*?try\s*\{[\s\S]*?reverseCourseDeduction[\s\S]*?\}\s*catch/
    );
  });

  it('H.7: BackendDashboard pattern reference in comment (institutional memory)', () => {
    expect(SRC).toMatch(/H7|BackendDashboard\.jsx|course-reverse cascade/);
  });

  it('H.8: deleteBackendTreatment STILL called AFTER cascade (cascade is additive)', () => {
    expect(SRC).toMatch(/await deleteBackendTreatment\(cancelTarget\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// V94.A — A7 apiFetch helper + 18 site migration
// ═══════════════════════════════════════════════════════════════════════

describe('V94.A: apiFetch helper exists with 5s default timeout', () => {
  const SRC = READ('api/_lib/apiFetch.js');

  it('A.1: exports apiFetch function', () => {
    expect(SRC).toMatch(/export async function apiFetch/);
  });

  it('A.2: default 5000ms timeout exported', () => {
    expect(SRC).toMatch(/const DEFAULT_TIMEOUT_MS\s*=\s*5000/);
    expect(SRC).toMatch(/export \{[^}]*DEFAULT_TIMEOUT_MS/);
  });

  it('A.3: uses AbortSignal.timeout when caller doesn\'t supply signal', () => {
    expect(SRC).toMatch(/AbortSignal\.timeout\(/);
  });

  it('A.4: honors caller-supplied signal (no double-wrap)', () => {
    expect(SRC).toMatch(/callerSignal/);
    expect(SRC).toMatch(/const signal\s*=\s*callerSignal\s*\|\|\s*AbortSignal\.timeout/);
  });

  it('A.5: classifies timeout errors with code === \'TIMEOUT\'', () => {
    expect(SRC).toMatch(/code\s*=\s*['"]TIMEOUT['"]/);
    expect(SRC).toMatch(/AbortError|TimeoutError/);
  });

  it('A.6: opts.timeoutMs accepts per-call override (positive finite number)', () => {
    expect(SRC).toMatch(/Number\.isFinite\(timeoutMs\)\s*&&\s*timeoutMs\s*>\s*0/);
  });
});

describe('V94.A: 9 api/ files imported apiFetch + use it at every call site', () => {
  const FILES = [
    'api/webhook/facebook.js',
    'api/webhook/line.js',
    'api/webhook/send.js',
    'api/webhook/saved-replies.js',
    'api/admin/fb-test.js',
    'api/admin/line-test.js',
    'api/admin/line-send-recall.js',
    'api/admin/link-requests.js',
    'api/admin/send-document.js',
  ];

  for (const f of FILES) {
    it(`A.guarded: ${f} imports apiFetch from ../_lib/apiFetch.js`, () => {
      const src = READ(f);
      expect(src).toMatch(/import\s*\{\s*apiFetch\s*\}\s*from\s*['"]\.\.\/_lib\/apiFetch\.js['"]/);
    });

    it(`A.guarded: ${f} — no bare fetch( in code (apiFetch wrapper only)`, () => {
      const src = READ(f);
      const code = stripComments(src);
      // Bare `fetch(` is forbidden. `apiFetch(` allowed. `await fetch(` (no
      // longer used) is forbidden.
      expect(code).not.toMatch(/\bawait fetch\(/);
      // Same constraint for non-await direct uses (we don't allow fire-and-forget either).
      expect(code).not.toMatch(/(?<!apiFetch.*=.*await\s)\bfetch\(/);
    });
  }

  it('A.aggregate: 9 audit-fix files locked', () => {
    expect(FILES).toHaveLength(9);
  });
});

describe('V94.A: apiFetch helper file itself uses underlying fetch correctly', () => {
  it('A.helper.1: apiFetch.js DOES use underlying fetch() internally', () => {
    const src = READ('api/_lib/apiFetch.js');
    // The wrapper body MUST call the native fetch() — that's the whole point.
    expect(src).toMatch(/return await fetch\(url,/);
  });
});
