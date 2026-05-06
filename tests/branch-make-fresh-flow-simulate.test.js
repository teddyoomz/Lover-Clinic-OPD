import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('FS3 — make-fresh auto-backup discipline', () => {
  const apiDir = path.resolve('api/admin');
  const code = fs.readFileSync(path.join(apiDir, 'branch-make-fresh.js'), 'utf-8');

  it('FS3.1 — endpoint refuses without autoBackupRef', () => {
    expect(code).toMatch(/AUTO_BACKUP_REQUIRED/);
  });

  it('FS3.2 — endpoint verifies file exists in Storage before wiping', () => {
    expect(code).toMatch(/bucket\.file\(autoBackupRef\)\.exists/);
    // Must check exists BEFORE the wipe loop
    const existsIdx = code.indexOf('exists()');
    const deleteIdx = code.indexOf('batch.delete');
    expect(existsIdx).toBeLessThan(deleteIdx);
  });

  it('FS3.3 — UI modal calls backup before make-fresh in sequence', () => {
    const modalCode = fs.readFileSync(path.resolve('src/components/backend/MakeFreshModal.jsx'), 'utf-8');
    const backupIdx = modalCode.indexOf('/api/admin/branch-backup-export');
    const wipeIdx = modalCode.indexOf('/api/admin/branch-make-fresh');
    expect(backupIdx).toBeGreaterThan(-1);
    expect(wipeIdx).toBeGreaterThan(-1);
    expect(backupIdx).toBeLessThan(wipeIdx);
  });

  it('FS3.4 — UI modal locks button until branch name typed verbatim', () => {
    const modalCode = fs.readFileSync(path.resolve('src/components/backend/MakeFreshModal.jsx'), 'utf-8');
    expect(modalCode).toMatch(/confirmText\.trim\(\)\s*===\s*branchName\.trim\(\)/);
    expect(modalCode).toMatch(/disabled=\{!matches\}/);
  });

  it('FS3.5 — make-fresh endpoint deletes T1+T2+T3 + T4 customer subcollections', () => {
    expect(code).toMatch(/TIER_MAP\[BACKUP_TIER_T1\]/);
    expect(code).toMatch(/TIER_MAP\[BACKUP_TIER_T2\]/);
    expect(code).toMatch(/TIER_MAP\[BACKUP_TIER_T3\]/);
    expect(code).toMatch(/T4_SUBCOLLECTIONS/);
  });
});
