// ─── Phase 15.6 / V35.1 — Portal dropdown + BatchSelectField (2 user issues)
//
// Issue 1 (verbatim): "dropdown เลือกสินค้า ในหน้า สร้าง Order นำเข้า โดน
// box modal limit แล้วบังไว้ทำให้โชว์ dropdown ออกมาได้"
//
// Issue 2 (verbatim): "ทำให้ทั้งหน้าสร้างใบโอนย้ายสต็อกและสร้างใบเบิก ของทั้ง
// สาขาและคลังกลาง ใช้ระบบ search เลือกรายการสินค้าได้เหมือนกันกับ สร้าง Order
// นำเข้า"
//
// Coverage:
//   PT.A — ProductSelectField uses React Portal + position:fixed
//   PT.B — BatchSelectField uses React Portal + position:fixed
//   PT.C — batchSearchUtils helpers (composeBatchDisplayName, subtitle, filter)
//   PT.D — StockTransferPanel migrated to BatchSelectField
//   PT.E — StockWithdrawalPanel migrated to BatchSelectField
//   PT.F — V21 anti-regression: no inline <select>{batches.map(...)} in
//          transfer/withdrawal main batch picker

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  composeBatchDisplayName,
  composeBatchSubtitle,
  filterBatchesByQuery,
} from '../src/lib/batchSearchUtils.js';

const ROOT = process.cwd();
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const productSelectSrc = read('src/components/backend/ProductSelectField.jsx');
const batchSelectSrc = read('src/components/backend/BatchSelectField.jsx');
const batchUtilsSrc = read('src/lib/batchSearchUtils.js');
const transferSrc = read('src/components/backend/StockTransferPanel.jsx');
const withdrawalSrc = read('src/components/backend/StockWithdrawalPanel.jsx');

// =============================================================================
describe('Phase 15.6 PT.A — ProductSelectField Portal-positioned dropdown', () => {
  it('PT.A.1 — imports createPortal from react-dom', () => {
    expect(productSelectSrc).toMatch(/import\s*\{\s*createPortal\s*\}\s*from\s*['"]react-dom['"]/);
  });

  it('PT.A.2 — uses useLayoutEffect for coords', () => {
    expect(productSelectSrc).toMatch(/useLayoutEffect/);
  });

  it('PT.A.3 — computes coords from getBoundingClientRect', () => {
    expect(productSelectSrc).toMatch(/inputRef\.current\.getBoundingClientRect/);
  });

  it('PT.A.4 — calls createPortal(... document.body)', () => {
    expect(productSelectSrc).toMatch(/createPortal\([\s\S]{0,3000}document\.body\s*\)/);
  });

  it('PT.A.5 — dropdown uses position:fixed (not absolute) + high z-index', () => {
    // Look at the JSX block inside createPortal
    expect(productSelectSrc).toMatch(/className="fixed z-\[1000\]/);
  });

  it('PT.A.6 — reposition on scroll AND resize while open', () => {
    expect(productSelectSrc).toMatch(/window\.addEventListener\(['"]scroll['"]/);
    expect(productSelectSrc).toMatch(/window\.addEventListener\(['"]resize['"]/);
    // capture-phase scroll listener (catches ANY ancestor scroll)
    expect(productSelectSrc).toMatch(/window\.addEventListener\(['"]scroll['"]\s*,\s*\w+\s*,\s*true\)/);
  });

  it('PT.A.7 — V21 anti-regression: NO `position: absolute` on dropdown anymore', () => {
    // Strip comments to avoid matching the explanatory note about pre-fix behavior.
    const stripped = productSelectSrc
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/[^\n]*\n/g, '\n');
    // Inside the createPortal block (after `createPortal(`), no `absolute z-50` survives
    const portalIdx = stripped.indexOf('createPortal(');
    expect(portalIdx).toBeGreaterThan(0);
    const portalSlice = stripped.slice(portalIdx, portalIdx + 2500);
    expect(portalSlice).not.toMatch(/className="absolute z-50/);
  });

  it('PT.A.8 — institutional memory: V35.1 marker present', () => {
    expect(productSelectSrc).toMatch(/V35\.1/);
  });
});

// =============================================================================
describe('Phase 15.6 PT.B — BatchSelectField mirrors Portal pattern', () => {
  it('PT.B.1 — imports createPortal', () => {
    expect(batchSelectSrc).toMatch(/import\s*\{\s*createPortal\s*\}\s*from\s*['"]react-dom['"]/);
  });

  it('PT.B.2 — useLayoutEffect + getBoundingClientRect coords', () => {
    expect(batchSelectSrc).toMatch(/useLayoutEffect/);
    expect(batchSelectSrc).toMatch(/inputRef\.current\.getBoundingClientRect/);
  });

  it('PT.B.3 — createPortal(... document.body)', () => {
    expect(batchSelectSrc).toMatch(/createPortal\([\s\S]{0,3000}document\.body\s*\)/);
  });

  it('PT.B.4 — dropdown position:fixed z-[1000]', () => {
    expect(batchSelectSrc).toMatch(/className="fixed z-\[1000\]/);
  });

  it('PT.B.5 — onChange emits (batchId, record) pair', () => {
    expect(batchSelectSrc).toMatch(/onChange\(id,\s*b\)/);
  });

  it('PT.B.6 — selected batch lookup by batchId/id', () => {
    expect(batchSelectSrc).toMatch(/safe\.find\(b\s*=>\s*String\(b\?\.batchId\s*\?\?\s*b\?\.id/);
  });

  it('PT.B.7 — Phase 15.6 / V35.1 marker', () => {
    expect(batchSelectSrc).toMatch(/V35\.1/);
  });
});

// =============================================================================
describe('Phase 15.6 PT.C — batchSearchUtils helpers', () => {
  describe('PT.C.1 composeBatchDisplayName', () => {
    it('returns "{name} — …{last8}" when both present', () => {
      const out = composeBatchDisplayName({
        productName: 'Allergan 100 U',
        batchId: 'BATCH-1776555444098-4oqx',
      });
      expect(out).toBe('Allergan 100 U — …098-4oqx');
    });

    it('falls back to last-8 only when name missing', () => {
      const out = composeBatchDisplayName({ batchId: 'BATCH-XYZ-12345678' });
      expect(out).toBe('…12345678');
    });

    it('returns "" for empty/null', () => {
      expect(composeBatchDisplayName(null)).toBe('');
      expect(composeBatchDisplayName({})).toBe('');
    });

    it('uses .id when batchId missing', () => {
      const out = composeBatchDisplayName({ productName: 'X', id: 'fallback-1234' });
      expect(out).toMatch(/fallback-1234$|—\s*…\w+/);
    });
  });

  describe('PT.C.2 composeBatchSubtitle', () => {
    it('shows remaining/total + unit', () => {
      const out = composeBatchSubtitle({
        qty: { remaining: 50, total: 100 },
        unit: 'U',
      });
      expect(out).toMatch(/50\/100\s*U/);
    });

    it('appends expiry when present', () => {
      const out = composeBatchSubtitle({
        qty: { remaining: 5, total: 10 },
        unit: 'amp',
        expiresAt: '2027-12-31',
      });
      expect(out).toMatch(/5\/10\s*amp/);
      expect(out).toMatch(/exp 2027-12-31/);
    });

    it('handles missing qty gracefully', () => {
      expect(composeBatchSubtitle({ unit: 'cc' })).toBe('cc');
      expect(composeBatchSubtitle({})).toBe('');
    });

    it('Thai-locale formats decimals', () => {
      const out = composeBatchSubtitle({
        qty: { remaining: 0.5, total: 2.75 },
        unit: 'mg',
      });
      // Thai locale uses standard digits + standard decimal point
      expect(out).toMatch(/0\.5\/2\.75\s*mg/);
    });
  });

  describe('PT.C.3 filterBatchesByQuery', () => {
    const sample = [
      { batchId: 'BATCH-001', productName: 'Allergan 100 U', unit: 'U', qty: { remaining: 50, total: 100 } },
      { batchId: 'BATCH-002', productName: 'BTX 50', unit: 'U', qty: { remaining: 20, total: 50 } },
      { batchId: 'BATCH-003', productName: 'โบทูล็อกซ์', unit: 'amp', qty: { remaining: 5, total: 10 } },
    ];

    it('empty query returns all', () => {
      expect(filterBatchesByQuery(sample, '').length).toBe(3);
    });

    it('filters by product name (case-insensitive)', () => {
      const r = filterBatchesByQuery(sample, 'allergan');
      expect(r.map(b => b.batchId)).toEqual(['BATCH-001']);
    });

    it('filters by batchId substring', () => {
      const r = filterBatchesByQuery(sample, '002');
      expect(r.map(b => b.batchId)).toEqual(['BATCH-002']);
    });

    it('filters by Thai text', () => {
      const r = filterBatchesByQuery(sample, 'โบทู');
      expect(r.map(b => b.batchId)).toEqual(['BATCH-003']);
    });

    it('returns [] for non-array input', () => {
      expect(filterBatchesByQuery(null, 'q')).toEqual([]);
      expect(filterBatchesByQuery(undefined, 'q')).toEqual([]);
    });

    it('regex special chars treated as literal (no injection)', () => {
      expect(filterBatchesByQuery(sample, '.+')).toEqual([]);
    });
  });
});

// =============================================================================
describe('Phase 15.6 PT.D — StockTransferPanel migrated to BatchSelectField', () => {
  it('PT.D.1 — imports BatchSelectField', () => {
    expect(transferSrc).toMatch(/import\s+BatchSelectField\s+from\s+['"]\.\/BatchSelectField\.jsx['"]/);
  });

  it('PT.D.2 — renders BatchSelectField in batch row', () => {
    expect(transferSrc).toMatch(/<BatchSelectField[\s\S]{0,300}options=\{batches\}/);
  });

  it('PT.D.3 — onChange wires to updateItem(idx, { sourceBatchId: id })', () => {
    expect(transferSrc).toMatch(/onChange=\{\(id\)\s*=>\s*updateItem\(idx,\s*\{\s*sourceBatchId:\s*id\s*\}\)/);
  });

  it('PT.D.4 — testId uses transfer-batch-{idx} pattern', () => {
    expect(transferSrc).toMatch(/testId=\{`transfer-batch-\$\{idx\}`\}/);
  });

  it('PT.D.5 — V21 anti-regression: no inline <select> for sourceBatchId', () => {
    const stripped = transferSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*\n/g, '\n');
    expect(stripped).not.toMatch(/<select\s+value=\{it\.sourceBatchId\}/);
  });
});

// =============================================================================
describe('Phase 15.6 PT.E — StockWithdrawalPanel migrated to BatchSelectField', () => {
  it('PT.E.1 — imports BatchSelectField', () => {
    expect(withdrawalSrc).toMatch(/import\s+BatchSelectField\s+from\s+['"]\.\/BatchSelectField\.jsx['"]/);
  });

  it('PT.E.2 — renders BatchSelectField in batch row', () => {
    expect(withdrawalSrc).toMatch(/<BatchSelectField[\s\S]{0,300}options=\{batches\}/);
  });

  it('PT.E.3 — onChange wires to updateItem(idx, { sourceBatchId: id })', () => {
    expect(withdrawalSrc).toMatch(/onChange=\{\(id\)\s*=>\s*updateItem\(idx,\s*\{\s*sourceBatchId:\s*id\s*\}\)/);
  });

  it('PT.E.4 — testId uses withdrawal-batch-{idx} pattern', () => {
    expect(withdrawalSrc).toMatch(/testId=\{`withdrawal-batch-\$\{idx\}`\}/);
  });

  it('PT.E.5 — V21 anti-regression: no inline <select> for sourceBatchId', () => {
    const stripped = withdrawalSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*\n/g, '\n');
    expect(stripped).not.toMatch(/<select\s+value=\{it\.sourceBatchId\}/);
  });
});

// =============================================================================
describe('Phase 15.6 PT.F — V35.1 institutional memory', () => {
  it('PT.F.1 — both pickers cite Phase 15.6 / V35.1', () => {
    expect(productSelectSrc).toMatch(/Phase 15\.6/);
    expect(batchSelectSrc).toMatch(/Phase 15\.6/);
  });

  it('PT.F.2 — Issue 1 (modal-clip) reason documented in ProductSelectField', () => {
    expect(productSelectSrc).toMatch(/modal|overflow|clip|portal/i);
  });

  it('PT.F.3 — Issue 2 (transfer + withdrawal search) reason documented in BatchSelectField', () => {
    expect(batchSelectSrc).toMatch(/Transfer|Withdrawal|batch/i);
  });
});
