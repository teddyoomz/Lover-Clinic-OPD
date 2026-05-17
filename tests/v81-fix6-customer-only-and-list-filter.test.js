// tests/v81-fix6-customer-only-and-list-filter.test.js
//
// V81-fix6 (2026-05-17 EOD+2 LATE+1) regression bank:
//   AV72 — Customer-only scope coverage (executor + endpoints + UI)
//   AV73 — backup-manager-list excludes whole-system + deprecated per-customer sub-files
//   AV74 — Optimistic UI delete (state removal before fetch completes; rollback on error)

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(import.meta.dirname, '..');
function read(p) { return readFileSync(resolve(REPO_ROOT, p), 'utf8'); }

describe('V81-fix6 AV72 — Customer-only scope coverage', () => {
  const core = read('src/lib/wholeSystemBackupCore.js');
  const backupExec = read('api/admin/_lib/wholeSystemBackupExecutor.js');
  const restoreExec = read('api/admin/_lib/wholeSystemRestoreExecutor.js');
  const tab = read('src/components/backend/BackupManagerTab.jsx');

  it('AV72.1 — core exports CUSTOMER_ONLY_UNIVERSAL + CUSTOMER_ONLY_BRANCH_SCOPED', () => {
    expect(core).toMatch(/export const CUSTOMER_ONLY_UNIVERSAL/);
    expect(core).toMatch(/export const CUSTOMER_ONLY_BRANCH_SCOPED/);
    expect(core).toMatch(/export const CUSTOMER_ONLY_STORAGE_INCLUDE_PREFIXES/);
  });

  it('AV72.2 — resolveCollectionScope accepts scope param + includeAuth flag', () => {
    expect(core).toMatch(/resolveCollectionScope\(opts/);
    expect(core).toMatch(/scope === 'customer-only'/);
    expect(core).toMatch(/includeAuth:\s*false/);
  });

  it('AV72.3 — backup executor accepts scope param + uses scope-aware paths', () => {
    expect(backupExec).toMatch(/scope\s*=\s*['"]full['"]/);
    expect(backupExec).toMatch(/backupPathPrefix\(scope\)/);
    expect(backupExec).toMatch(/colScope\.includeAuth/);
  });

  it('AV72.4 — restore executor accepts scope + customer-only never wipes Auth', () => {
    expect(restoreExec).toMatch(/scope\s*=\s*['"]full['"]/);
    expect(restoreExec).toMatch(/scope === 'customer-only'/);
    expect(restoreExec).toMatch(/scope\s*!==\s*'customer-only'/);
  });

  it('AV72.5 — restore wipe is scope-aware (customer-only wipes ONLY customer-scoped collections)', () => {
    expect(restoreExec).toMatch(/CUSTOMER_ONLY_UNIVERSAL.*CUSTOMER_ONLY_BRANCH_SCOPED/s);
  });

  it('AV72.6 — restore Storage wipe respects customer-only prefix filter', () => {
    expect(restoreExec).toMatch(/CUSTOMER_ONLY_STORAGE_INCLUDE_PREFIXES/);
  });

  it('AV72.7 — manifest stamps scope + backupType', () => {
    expect(backupExec).toMatch(/manifest\.scope\s*=\s*colScope\.scope/);
    expect(backupExec).toMatch(/manifest\.backupType\s*=/);
  });

  it('AV72.8 — UI has dedicated customer-only section + buttons', () => {
    expect(tab).toMatch(/data-testid="customer-only-backups-section"/);
    expect(tab).toMatch(/data-testid="customer-only-backup-trigger"/);
    expect(tab).toMatch(/customer-only-restore/);
  });

  it('AV72.9 — UI uses dedicated customer-only endpoints (not whole-system)', () => {
    expect(tab).toMatch(/\/api\/admin\/customer-only-backup-export/);
    expect(tab).toMatch(/\/api\/admin\/customer-only-restore/);
    expect(tab).toMatch(/\/api\/admin\/customer-only-backups-list/);
    expect(tab).toMatch(/\/api\/admin\/customer-only-backup-download/);
    expect(tab).toMatch(/\/api\/admin\/customer-only-backup-delete/);
  });
});

describe('V81-fix6 AV73 — backup-manager-list excludes deprecated/whole-system sub-files', () => {
  const list = read('api/admin/backup-manager-list.js');

  it('AV73.1 — EXCLUDE_PREFIXES defined', () => {
    expect(list).toMatch(/const EXCLUDE_PREFIXES/);
  });

  it('AV73.2 — excludes backups/whole-system/', () => {
    expect(list).toMatch(/['"]backups\/whole-system\/['"]/);
  });

  it('AV73.3 — excludes deprecated per-customer paths', () => {
    expect(list).toMatch(/['"]backups\/customers\/['"]/);
    expect(list).toMatch(/['"]backups\/whole-fleet-customers\/['"]/);
  });

  it('AV73.4 — isExcluded check applied BEFORE classification', () => {
    expect(list).toMatch(/if\s*\(isExcluded\(file\.name\)\)\s*return\s+null/);
  });
});

describe('V81-fix6 AV74 — Optimistic UI delete (no flicker)', () => {
  const tab = read('src/components/backend/BackupManagerTab.jsx');

  it('AV74.1 — whole-system deleteWs uses optimistic state update + rollback', () => {
    expect(tab).toMatch(/const before = wsBackups/);
    expect(tab).toMatch(/setWsBackups\(prev => prev\.filter/);
    expect(tab).toMatch(/setWsBackups\(before\)/);
  });

  it('AV74.2 — customer-only deleteCo uses optimistic state update + rollback', () => {
    expect(tab).toMatch(/const before = coBackups/);
    expect(tab).toMatch(/setCoBackups\(prev => prev\.filter/);
    expect(tab).toMatch(/setCoBackups\(before\)/);
  });

  it('AV74.3 — no full reload after delete (optimistic state update is the source of truth)', () => {
    // Both delete functions should have setWsBackups/setCoBackups for optimistic remove
    // + the rollback path on error — NOT a loadWsBackups()/loadCoBackups() trigger
    // immediately after fetch success. Match the body explicitly via async function ... }
    // (curly-brace matching is fragile across multi-line — use anchored substring scan).
    const wsDeleteStart = tab.indexOf('async function deleteWs(');
    expect(wsDeleteStart, 'deleteWs function not found').toBeGreaterThan(-1);
    const wsDeleteEnd = tab.indexOf('async function', wsDeleteStart + 20);
    const wsDeleteBody = tab.slice(wsDeleteStart, wsDeleteEnd);
    expect(wsDeleteBody, 'deleteWs slice empty').toBeTruthy();
    expect(wsDeleteBody.length).toBeGreaterThan(50);
    expect(wsDeleteBody).not.toMatch(/await loadWsBackups\(\)|loadWsBackups\(\);/);

    const coDeleteStart = tab.indexOf('async function deleteCo(');
    expect(coDeleteStart, 'deleteCo function not found').toBeGreaterThan(-1);
    const coDeleteEnd = tab.indexOf('async function', coDeleteStart + 20);
    const coDeleteBody = tab.slice(coDeleteStart, coDeleteEnd);
    expect(coDeleteBody.length).toBeGreaterThan(50);
    expect(coDeleteBody).not.toMatch(/await loadCoBackups\(\)|loadCoBackups\(\);/);
  });

  it('AV74.4 — V81-fix6 marker comment present', () => {
    expect(tab).toMatch(/V81-fix6/);
  });
});

describe('V81-fix6 Customer-only endpoint files exist + Auth-never-touched lock', () => {
  it('endpoint files exist', () => {
    expect(() => read('api/admin/customer-only-backup-export.js')).not.toThrow();
    expect(() => read('api/admin/customer-only-restore.js')).not.toThrow();
    expect(() => read('api/admin/customer-only-backups-list.js')).not.toThrow();
    expect(() => read('api/admin/customer-only-backup-delete.js')).not.toThrow();
    expect(() => read('api/admin/customer-only-backup-download.js')).not.toThrow();
  });

  it('customer-only-restore hard-codes replaceAuthFromBackup:false (Auth never touched)', () => {
    const r = read('api/admin/customer-only-restore.js');
    expect(r).toMatch(/replaceAuthFromBackup:\s*false/);
    expect(r).toMatch(/scope:\s*['"]customer-only['"]/);
  });

  it('customer-only-backup-export forwards scope:"customer-only" to executor', () => {
    const e = read('api/admin/customer-only-backup-export.js');
    expect(e).toMatch(/scope:\s*['"]customer-only['"]/);
  });

  it('vercel.json has maxDuration:300 for all customer-only endpoints', () => {
    const v = read('vercel.json');
    expect(v).toMatch(/customer-only-backup-export\.js[^}]*maxDuration[^}]*300/s);
    expect(v).toMatch(/customer-only-restore\.js[^}]*maxDuration[^}]*300/s);
    expect(v).toMatch(/customer-only-backup-download\.js[^}]*maxDuration[^}]*300/s);
  });
});
