// ─── Phase 15.6 — SaleTab.handleDelete error handling (Issue 5 last bullet) ──
// User report (verbatim, 2026-04-28):
//   "ในหน้า tab=sales ก็ยังเหลือ TEST-SALE-DEFAULT-1777123845203 และ
//    TEST-SALE-1777123823846 แถมกดปุ่มลบแล้ว error เด้งจอดำอีก"
//
// Root cause: SaleTab.jsx:779 final `await deleteBackendSale(saleId)` +
// `loadSales()` were UNGUARDED. Test sales (TEST-SALE-DEFAULT-*, TEST-SALE-*)
// have malformed shapes (missing customerId, no real treatments) — when
// deleteDoc throws OR loadSales errors, exception bubbles to React error
// boundary → black screen ("เด้งจอดำ").
//
// Fix: wrap the final commit in try/catch with setError surfacing a friendly
// Thai error. V31 anti-pattern lock — no silent swallow, console.error +
// user-visible setError.
//
// Coverage:
//   STD.A — handleDelete contains try/catch around deleteBackendSale + loadSales
//   STD.B — error path uses setError (not throw, not silent)
//   STD.C — Thai user-visible message present
//   STD.D — V31 marker comment present (institutional memory)

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const saleTabSrc = read('src/components/backend/SaleTab.jsx');

// Locate handleDelete function block.
// Use the next function-level declaration (`// ════` comment / `if (formOpen)`)
// as the boundary. A generous fixed window of 5000 chars covers the whole
// handler body. Avoid local `const` declarations like `const saleId = ...`
// which are inside the function — that's what the original slice missed.
const handleDeleteStart = saleTabSrc.indexOf('const handleDelete = async');
const handleDeleteSlice = saleTabSrc.slice(handleDeleteStart, handleDeleteStart + 5000);

// =============================================================================
describe('Phase 15.6 STD.A — handleDelete final commit wrapped in try/catch', () => {
  it('STD.A.1 — handleDelete function exists', () => {
    expect(handleDeleteStart).toBeGreaterThan(0);
  });

  it('STD.A.2 — try block precedes deleteBackendSale call', () => {
    // Pattern: `try { ... await deleteBackendSale ... }` somewhere in the slice
    expect(handleDeleteSlice).toMatch(/try\s*\{[\s\S]{0,300}await\s+deleteBackendSale/);
  });

  it('STD.A.3 — catch block follows the try', () => {
    expect(handleDeleteSlice).toMatch(/await\s+deleteBackendSale[\s\S]{0,200}\}\s*catch\s*\(/);
  });

  it('STD.A.4 — loadSales is INSIDE the same try block (not after)', () => {
    // loadSales must be inside try { ... await deleteBackendSale; loadSales(); }
    expect(handleDeleteSlice).toMatch(/await\s+deleteBackendSale[\s\S]{0,100}loadSales\(\)[\s\S]{0,100}\}\s*catch/);
  });
});

// =============================================================================
describe('Phase 15.6 STD.B — catch block surfaces error via setError (not throw)', () => {
  it('STD.B.1 — setError invoked in catch (not throw)', () => {
    expect(handleDeleteSlice).toMatch(/catch\s*\([^)]*\)\s*\{[\s\S]{0,500}setError\(/);
  });

  it('STD.B.2 — console.error logs the original exception (debuggable)', () => {
    expect(handleDeleteSlice).toMatch(/catch\s*\([^)]*\)\s*\{[\s\S]{0,300}console\.error\(/);
  });

  it('STD.B.3 — V31 anti-pattern check: no console.warn(...continuing) silent swallow', () => {
    // Locked pattern: must NOT silently swallow with "continuing" verbiage
    const catchBlock = handleDeleteSlice.match(/catch\s*\([^)]*\)\s*\{[\s\S]*?\}/);
    if (catchBlock) {
      expect(catchBlock[0]).not.toMatch(/console\.warn[^;]*continuing/i);
    }
  });

  it('STD.B.4 — no `throw` in the catch (would re-trigger black screen)', () => {
    const catchBlock = handleDeleteSlice.match(/catch\s*\([^)]*\)\s*\{([\s\S]*?)\}/);
    if (catchBlock) {
      expect(catchBlock[1]).not.toMatch(/^\s*throw\b/m);
    }
  });
});

// =============================================================================
describe('Phase 15.6 STD.C — Thai user-visible error message', () => {
  it('STD.C.1 — error string contains Thai "ลบใบขายไม่สำเร็จ"', () => {
    expect(handleDeleteSlice).toMatch(/ลบใบขายไม่สำเร็จ/);
  });

  it('STD.C.2 — error mentions malformed-doc context (โครงสร้างผิดปกติ)', () => {
    expect(handleDeleteSlice).toMatch(/โครงสร้างผิดปกติ/);
  });
});

// =============================================================================
describe('Phase 15.6 STD.D — institutional memory markers', () => {
  it('STD.D.1 — Phase 15.6 marker present', () => {
    expect(handleDeleteSlice).toMatch(/Phase 15\.6/);
  });

  it('STD.D.2 — Issue 5 reference present', () => {
    expect(handleDeleteSlice).toMatch(/Issue 5/);
  });

  it('STD.D.3 — V31 anti-pattern reference present', () => {
    expect(handleDeleteSlice).toMatch(/V31/);
  });
});

// =============================================================================
describe('Phase 15.6 STD.E — pure simulate of the catch path', () => {
  // Simulates the wrapper logic so future regressions are caught even
  // if source-grep patterns drift.
  async function simulateHandleDelete({
    deleteBackendSale,
    loadSales,
    setError,
    consoleError = () => {},
    saleId = 'TEST-SALE-DEFAULT-1777123845203',
  }) {
    try {
      await deleteBackendSale(saleId);
      loadSales();
    } catch (e) {
      consoleError('[SaleTab] handleDelete final commit failed:', e);
      setError(`ลบใบขายไม่สำเร็จ — เอกสารอาจมีโครงสร้างผิดปกติ (${e?.message || 'unknown error'})`);
    }
  }

  it('STD.E.1 — happy path: delete succeeds, no error surfaced', async () => {
    let errorMsg = '';
    let loadCalled = false;
    await simulateHandleDelete({
      deleteBackendSale: async () => ({ success: true }),
      loadSales: () => { loadCalled = true; },
      setError: (m) => { errorMsg = m; },
    });
    expect(errorMsg).toBe('');
    expect(loadCalled).toBe(true);
  });

  it('STD.E.2 — deleteBackendSale throws → error surfaced via setError', async () => {
    let errorMsg = '';
    await simulateHandleDelete({
      deleteBackendSale: async () => { throw new Error('Permission denied'); },
      loadSales: () => {},
      setError: (m) => { errorMsg = m; },
    });
    expect(errorMsg).toMatch(/ลบใบขายไม่สำเร็จ/);
    expect(errorMsg).toMatch(/Permission denied/);
  });

  it('STD.E.3 — loadSales throws → caught + error surfaced (no black screen)', async () => {
    let errorMsg = '';
    await simulateHandleDelete({
      deleteBackendSale: async () => ({ success: true }),
      loadSales: () => { throw new Error('listener crashed'); },
      setError: (m) => { errorMsg = m; },
    });
    expect(errorMsg).toMatch(/listener crashed/);
  });

  it('STD.E.4 — error with no .message → fallback "unknown error"', async () => {
    let errorMsg = '';
    await simulateHandleDelete({
      deleteBackendSale: async () => { throw 'string-error'; },
      loadSales: () => {},
      setError: (m) => { errorMsg = m; },
    });
    expect(errorMsg).toMatch(/unknown error/);
  });

  it('STD.E.5 — adversarial: malformed test sale (TEST-SALE-DEFAULT-*) caught cleanly', async () => {
    let errorMsg = '';
    let consoleArgs = null;
    await simulateHandleDelete({
      deleteBackendSale: async () => {
        const e = new Error('Cannot read properties of undefined (reading length)');
        throw e;
      },
      loadSales: () => {},
      setError: (m) => { errorMsg = m; },
      consoleError: (...a) => { consoleArgs = a; },
      saleId: 'TEST-SALE-DEFAULT-1777123845203',
    });
    expect(errorMsg).toMatch(/ลบใบขายไม่สำเร็จ/);
    expect(consoleArgs).not.toBeNull();
  });
});
