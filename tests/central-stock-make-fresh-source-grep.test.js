import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('CSG1 CentralMakeFreshModal — sends warehouseIds + bucketIds (not raw)', () => {
  const code = read('src/components/backend/CentralMakeFreshModal.jsx');

  it('CSG1.1 imports CENTRAL_BUCKETS from centralStockBuckets', () => {
    expect(code).toMatch(/import\s*\{[^}]*CENTRAL_BUCKETS[^}]*\}\s*from\s*['"][^'"]*centralStockBuckets/);
  });

  it('CSG1.2 uses shared useMakeFreshStateMachine', () => {
    expect(code).toMatch(/useMakeFreshStateMachine/);
  });

  it('CSG1.3 sends warehouseIds OR allWarehouses (not raw collection names)', () => {
    expect(code).toMatch(/warehouseIds:|allWarehouses:/);
    // Must NOT send raw collection list (V21 anti-pattern)
    expect(code).not.toMatch(/body:\s*JSON\.stringify\([^)]*collections:\s*\[/);
  });

  it('CSG1.4 calls /api/admin/central-stock-{backup-export,make-fresh}', () => {
    expect(code).toMatch(/\/api\/admin\/central-stock-backup-export/);
    expect(code).toMatch(/\/api\/admin\/central-stock-make-fresh/);
  });
});

describe('CSG2 endpoints — assertWarehouseMasterProtected + hash verify BEFORE delete', () => {
  const exportCode = read('api/admin/central-stock-backup-export.js');
  const makeFreshCode = read('api/admin/central-stock-make-fresh.js');

  it('CSG2.1 backup-export calls assertWarehouseMasterProtected', () => {
    expect(exportCode).toMatch(/assertWarehouseMasterProtected\(/);
  });

  it('CSG2.2 make-fresh calls assertWarehouseMasterProtected', () => {
    expect(makeFreshCode).toMatch(/assertWarehouseMasterProtected\(/);
  });

  it('CSG2.3 make-fresh recomputes hash + has BACKUP_INTEGRITY_FAIL', () => {
    expect(makeFreshCode).toMatch(/computeBodyHash\(/);
    expect(makeFreshCode).toMatch(/BACKUP_INTEGRITY_FAIL/);
  });

  it('CSG2.4 ★ CRITICAL: hash compare BEFORE any batch.delete call (not comment)', () => {
    // Use first actual call `batch.delete(` (with paren), not the string
    // mentions in header comments. The `BACKUP_INTEGRITY_FAIL` error response
    // (the actual return statement, not the header comment doc) must come
    // BEFORE the first wipe-loop batch.delete invocation.
    const hashErrIdx = makeFreshCode.indexOf("error: 'BACKUP_INTEGRITY_FAIL'");
    const wipeIdx = makeFreshCode.indexOf('batch.delete(');
    expect(hashErrIdx).toBeGreaterThan(0);
    expect(wipeIdx).toBeGreaterThan(0);
    expect(hashErrIdx).toBeLessThan(wipeIdx);
  });

  it('CSG2.5 make-fresh has SCOPE_MISMATCH + WAREHOUSE_MISMATCH guards', () => {
    expect(makeFreshCode).toMatch(/SCOPE_MISMATCH/);
    expect(makeFreshCode).toMatch(/WAREHOUSE_MISMATCH/);
  });

  it('CSG2.6 backup-export supports dryRun=true (count-only path)', () => {
    expect(exportCode).toMatch(/dryRun\s*===?\s*true/);
    expect(exportCode).toMatch(/perBucket/);
    expect(exportCode).toMatch(/totalDocs/);
  });

  it('CSG2.7 make-fresh validates scopeKind === central', () => {
    expect(makeFreshCode).toMatch(/scopeKind\s*!==\s*['"]central['"]/);
    expect(makeFreshCode).toMatch(/BACKUP_SCOPE_KIND_MISMATCH/);
  });

  it('CSG2.8 backup-export emits scopeKind=central + warehouseIds in meta', () => {
    expect(exportCode).toMatch(/file\.meta\.scopeKind\s*=\s*['"]central['"]/);
    expect(exportCode).toMatch(/file\.meta\.warehouseIds/);
  });

  it('CSG2.9 make-fresh requires bucketIds non-empty', () => {
    expect(makeFreshCode).toMatch(/EMPTY_BUCKET_SET/);
  });

  it('CSG2.10 make-fresh validates warehouseIds OR allWarehouses', () => {
    expect(makeFreshCode).toMatch(/MISSING_WAREHOUSE_SCOPE/);
  });
});

describe('CSG3 centralStockBuckets — 4 frozen buckets + warehouse master protection', () => {
  const code = read('src/lib/centralStockBuckets.js');

  it('CSG3.1 CENTRAL_BUCKETS frozen + 4 in canonical order', () => {
    expect(code).toMatch(/export\s+const\s+CENTRAL_BUCKETS\s*=\s*Object\.freeze\(\{/);
    const idx = ['cs_po', 'cs_stock_ledger', 'cs_transfers_withdrawals', 'cs_adjustments'].map(id => code.indexOf(`${id}:`));
    for (let i = 1; i < idx.length; i++) {
      expect(idx[i]).toBeGreaterThan(idx[i - 1]);
      expect(idx[i]).toBeGreaterThan(0);
    }
  });

  it('CSG3.2 all 4 defaultChecked=true (no opt-in-only in central)', () => {
    const matches = [...code.matchAll(/defaultChecked:\s*(true|false)/g)];
    expect(matches.length).toBe(4);
    for (const m of matches) expect(m[1]).toBe('true');
  });

  it('CSG3.3 exports resolveCentralBucketScope + assertWarehouseMasterProtected', () => {
    expect(code).toMatch(/export\s+function\s+resolveCentralBucketScope/);
    expect(code).toMatch(/export\s+function\s+assertWarehouseMasterProtected/);
    expect(code).toMatch(/export\s+function\s+centralBucketDefaultsForUI/);
  });

  it('CSG3.4 cs_po has counter doc be_central_stock_orders_counter', () => {
    expect(code).toMatch(/counterDocs:\s*Object\.freeze\(\['be_central_stock_orders_counter'\]/);
  });

  it('CSG3.5 cs_transfers_withdrawals has orFilterField === destinationLocationId (V66 fix — prod field)', () => {
    // V66 fix 2026-05-15: pre-fix asserted `destLocationId` (invented field
    // name that doesn't exist in prod data). Corrected to `destinationLocationId`
    // per backendClient.js:7684 + 8060.
    expect(code).toMatch(/orFilterField:\s*['"]destinationLocationId['"]/);
    // Anti-regression: invented name MUST NOT appear
    expect(code).not.toMatch(/orFilterField:\s*['"]destLocationId['"]/);
  });
});

describe('CSG4 shared engine + branch modal still consume it', () => {
  it('CSG4.1 useMakeFreshStateMachine exported from makeFreshStateMachine.js', () => {
    const code = read('src/lib/makeFreshStateMachine.js');
    expect(code).toMatch(/export\s+function\s+useMakeFreshStateMachine/);
  });

  it('CSG4.2 MakeFreshModal (branch) consumes the shared engine', () => {
    const code = read('src/components/backend/MakeFreshModal.jsx');
    expect(code).toMatch(/useMakeFreshStateMachine/);
  });

  it('CSG4.3 CentralMakeFreshModal consumes the shared engine', () => {
    const code = read('src/components/backend/CentralMakeFreshModal.jsx');
    expect(code).toMatch(/useMakeFreshStateMachine/);
  });
});
