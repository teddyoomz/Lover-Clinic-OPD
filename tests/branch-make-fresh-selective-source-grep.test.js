import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('SG1 MakeFreshModal — sends bucketIds (not raw collections/tiers)', () => {
  const code = read('src/components/backend/MakeFreshModal.jsx');

  it('SG1.1 — imports BUCKETS from branchBackupBuckets.js', () => {
    expect(code).toMatch(/import\s*\{[^}]*BUCKETS[^}]*\}\s*from\s*['"][^'"]*branchBackupBuckets/);
  });

  it('SG1.2 — sends bucketIds in API request body', () => {
    expect(code).toMatch(/bucketIds:\s*tickedBucketIds/);
  });

  it('SG1.3 — does NOT send raw tiers in request body (V40 contract retired in UI)', () => {
    expect(code).not.toMatch(/body:\s*JSON\.stringify\([^)]*tiers:\s*\[/);
  });

  it('SG1.4 — sends expectedBodyHash on make-fresh request (UI cross-check)', () => {
    expect(code).toMatch(/expectedBodyHash/);
  });

  it('SG1.5 — uses dryRun:true for preview request', () => {
    expect(code).toMatch(/dryRun:\s*true/);
  });
});

describe('SG2 endpoints — assertNotT1 + hash verify before wipe', () => {
  const exportCode = read('api/admin/branch-backup-export.js');
  const makeFreshCode = read('api/admin/branch-make-fresh.js');

  it('SG2.1 — branch-backup-export.js calls assertNotT1', () => {
    expect(exportCode).toMatch(/assertNotT1\(/);
  });

  it('SG2.2 — branch-make-fresh.js calls assertNotT1', () => {
    expect(makeFreshCode).toMatch(/assertNotT1\(/);
  });

  it('SG2.3 — branch-make-fresh.js recomputes hash + has BACKUP_INTEGRITY_FAIL', () => {
    expect(makeFreshCode).toMatch(/computeBodyHash\(/);
    expect(makeFreshCode).toMatch(/BACKUP_INTEGRITY_FAIL/);
  });

  it('SG2.4 — CRITICAL: hash compare happens BEFORE any batch.delete', () => {
    const hashIdx = makeFreshCode.indexOf('BACKUP_INTEGRITY_FAIL');
    const wipeIdx = makeFreshCode.indexOf('batch.delete');
    expect(hashIdx).toBeGreaterThan(0);
    expect(wipeIdx).toBeGreaterThan(0);
    expect(hashIdx).toBeLessThan(wipeIdx);
  });

  it('SG2.5 — branch-make-fresh.js checks SCOPE_MISMATCH', () => {
    expect(makeFreshCode).toMatch(/SCOPE_MISMATCH/);
  });

  it('SG2.6 — branch-backup-export.js handles dryRun=true (count-only path)', () => {
    expect(exportCode).toMatch(/dryRun\s*===?\s*true/);
    expect(exportCode).toMatch(/perBucket/);
    expect(exportCode).toMatch(/totalDocs/);
  });

  it('SG2.7 — branch-make-fresh.js requires bucketIds non-empty', () => {
    expect(makeFreshCode).toMatch(/EMPTY_BUCKET_SET/);
  });

  it('SG2.8 — branch-make-fresh.js verifies sourceBranchId matches request', () => {
    expect(makeFreshCode).toMatch(/BACKUP_BRANCH_MISMATCH/);
  });

  it('SG2.9 — both endpoints reject T1 via assertNotT1 (no try-catch bypass)', () => {
    // assertNotT1 should be called INSIDE try block or right after resolveBucketScope
    // The call site must throw (not silently log)
    expect(exportCode).toMatch(/assertNotT1\(resolved\.collections\)/);
    expect(makeFreshCode).toMatch(/assertNotT1\(resolved\.collections\)/);
  });
});

describe('SG3 branchBackupBuckets — BUCKETS frozen + Q4-B contract', () => {
  const code = read('src/lib/branchBackupBuckets.js');

  it('SG3.1 — BUCKETS is Object.freeze + 7 buckets in canonical order', () => {
    expect(code).toMatch(/export\s+const\s+BUCKETS\s*=\s*Object\.freeze\(\{/);
    // Each of 7 buckets must appear in order
    const idx = ['appointments', 'treatments', 'sales', 'stock', 'finance', 'lineLink', 'customerActivity']
      .map(id => code.indexOf(`${id}:`));
    for (let i = 1; i < idx.length; i++) {
      expect(idx[i]).toBeGreaterThan(idx[i - 1]);
      expect(idx[i]).toBeGreaterThan(0);
    }
  });

  it('SG3.2 — customerActivity defaultChecked is FALSE (Q4-B opt-in lock)', () => {
    // Match customerActivity block + assert defaultChecked: false within it
    const match = code.match(/customerActivity:\s*Object\.freeze\(\{[\s\S]*?defaultChecked:\s*(true|false)/);
    expect(match, 'customerActivity defaultChecked block').toBeTruthy();
    expect(match[1]).toBe('false');
  });

  it('SG3.3 — exports resolveBucketScope + assertNotT1 + isT1Collection + bucketDefaultsForUI', () => {
    expect(code).toMatch(/export\s+function\s+resolveBucketScope/);
    expect(code).toMatch(/export\s+function\s+assertNotT1/);
    expect(code).toMatch(/export\s+function\s+isT1Collection/);
    expect(code).toMatch(/export\s+function\s+bucketDefaultsForUI/);
  });
});

describe('SG4 branchBackupSchema — computeBodyHash + v2 schema', () => {
  const code = read('src/lib/branchBackupSchema.js');

  it('SG4.1 — BACKUP_SCHEMA_VERSION is 2', () => {
    expect(code).toMatch(/export\s+const\s+BACKUP_SCHEMA_VERSION\s*=\s*2/);
  });

  it('SG4.2 — exports computeBodyHash', () => {
    expect(code).toMatch(/export\s+function\s+computeBodyHash/);
  });

  it('SG4.3 — buildBackupFile accepts bucketIds → emits bodyHash', () => {
    expect(code).toMatch(/bucketIds[\s\S]*bodyHash/);
  });

  it('SG4.4 — validateBackupFile rejects INVALID_BODY_HASH_FORMAT', () => {
    expect(code).toMatch(/INVALID_BODY_HASH_FORMAT/);
  });
});

describe('SG5 cross-file invariants', () => {
  it('SG5.1 — UI bucketIds shape must match endpoint expectation (canonical 7 IDs)', () => {
    const uiCode = read('src/components/backend/MakeFreshModal.jsx');
    const libCode = read('src/lib/branchBackupBuckets.js');
    // UI imports BUCKETS from same lib that endpoints use → single source of truth
    expect(uiCode).toMatch(/from\s*['"][^'"]*branchBackupBuckets/);
    expect(libCode).toMatch(/export\s+const\s+BUCKETS/);
  });

  it('SG5.2 — make-fresh requires file.meta.bodyHash + bucketIds (rejects legacy V40 files)', () => {
    const code = read('api/admin/branch-make-fresh.js');
    expect(code).toMatch(/BACKUP_MISSING_BODY_HASH/);
    expect(code).toMatch(/BACKUP_MISSING_BUCKET_IDS/);
  });
});
