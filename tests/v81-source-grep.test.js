// V81 source-grep regression (AV62/AV63/AV64 + AV19 elevation + recursion gate).
// Tests added gradually as Tasks 6+ land their respective endpoints/components.
// THIS file is the Task 5 scaffold — initial groups for foundation invariants only.
// Future tasks append describe() blocks as endpoints/components are written.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const READ = (rel) => fs.readFileSync(path.resolve(rel), 'utf8');

describe('V81 source-grep — wholeSystemBackupCore exports complete', () => {
  const src = READ('src/lib/wholeSystemBackupCore.js');

  it('exports all required constants', () => {
    expect(src).toMatch(/export const WHOLE_SYSTEM_SCHEMA_VERSION/);
    expect(src).toMatch(/export const UNIVERSAL_COLLECTIONS/);
    expect(src).toMatch(/export const BRANCH_SCOPED_COLLECTIONS/);
    expect(src).toMatch(/export const CUSTOMER_SUBCOLLECTIONS/);
    expect(src).toMatch(/export const STORAGE_INCLUDE_PREFIXES/);
    expect(src).toMatch(/export const STORAGE_EXCLUDE_PREFIXES/);
    expect(src).toMatch(/export const RETENTION_DAYS/);
    expect(src).toMatch(/export const NAME_PATTERN/);
  });

  it('exports all required pure helpers', () => {
    expect(src).toMatch(/export function buildWholeSystemManifest/);
    expect(src).toMatch(/export function computeWholeSystemManifestHash/);
    expect(src).toMatch(/export function computeStorageManifestHash/);
    expect(src).toMatch(/export function validateWholeSystemManifest/);
    expect(src).toMatch(/export function resolveStorageScope/);
    expect(src).toMatch(/export function resolveCollectionScope/);
    expect(src).toMatch(/export function sanitizeAuthUser/);
    expect(src).toMatch(/export function diffStates/);
    expect(src).toMatch(/export function formatBackupName/);
    expect(src).toMatch(/export function parseBackupName/);
    expect(src).toMatch(/export function shouldCleanupBackup/);
  });

  it('STORAGE_EXCLUDE_PREFIXES contains backups/ (CRITICAL recursion gate)', () => {
    // The recursion gate prevents daily backup from including itself (which
    // would double the backup size every day). MUST be tested at source level
    // so future refactors can't accidentally drop it.
    expect(src).toMatch(/['"]backups\/['"]/);
  });

  it('STORAGE_EXCLUDE_PREFIXES contains probe/ + TEST- + E2E- (test pollution gate)', () => {
    expect(src).toMatch(/['"]probe\/['"]/);
    expect(src).toMatch(/['"]TEST-['"]/);
    expect(src).toMatch(/['"]E2E-['"]/);
  });

  it('AUTH_EXCLUDE_FIELDS strips passwordHash + passwordSalt + refreshTokens (security)', () => {
    expect(src).toMatch(/AUTH_EXCLUDE_FIELDS/);
    expect(src).toMatch(/['"]passwordHash['"]/);
    expect(src).toMatch(/['"]passwordSalt['"]/);
    expect(src).toMatch(/['"]refreshTokens['"]/);
  });

  it('schemaVersion = 2 (V40=1, V75=1, V81=2)', () => {
    expect(src).toMatch(/WHOLE_SYSTEM_SCHEMA_VERSION\s*=\s*2/);
  });

  it('NAME_PATTERN regex accepts auto/manual/pre-restore types', () => {
    expect(src).toMatch(/NAME_PATTERN\s*=\s*\/\^\(\?:auto\|manual\|pre-restore\)/);
  });

  it('RETENTION_DAYS = {auto: 5, preRestore: 7, archive: 1} (AV64)', () => {
    expect(src).toMatch(/auto:\s*5/);
    expect(src).toMatch(/preRestore:\s*7/);
    expect(src).toMatch(/archive:\s*1/);
  });
});

// ─── Task 7 — AV63: cron CRON_SECRET gate + concurrency lock ───────────────

describe('V81 AV63 — cron CRON_SECRET gate + concurrency lock', () => {
  const cron = READ('api/cron/whole-system-backup-daily.js');
  const exec = READ('api/admin/_lib/wholeSystemBackupExecutor.js');

  it('cron verifies CRON_SECRET header (Authorization OR x-cron-secret)', () => {
    expect(cron).toMatch(/CRON_SECRET/);
    expect(cron).toMatch(/authorization|x-cron-secret/i);
    expect(cron).toMatch(/status\(401\)/);
  });

  it('cron acquires + releases lock doc be_admin_audit/whole-system-backup-running', () => {
    expect(cron).toMatch(/whole-system-backup-running/);
    expect(cron).toMatch(/runTransaction/);
    expect(cron).toMatch(/LOCK_BUSY/);
    expect(cron).toMatch(/lockRef\.delete\(\)/);
  });

  it('cron sets runCleanup:true (auto-type triggers cleanup per spec §5.1)', () => {
    expect(cron).toMatch(/runCleanup:\s*true/);
    expect(cron).toMatch(/type:\s*['"]auto['"]/);
  });

  it('executor imports buildWholeSystemManifest + computeWholeSystemManifestHash (AV62)', () => {
    expect(exec).toMatch(/buildWholeSystemManifest/);
    expect(exec).toMatch(/computeWholeSystemManifestHash/);
  });

  it('executor uses formatBackupName + auto/manual/pre-restore types', () => {
    expect(exec).toMatch(/formatBackupName\(type/);
  });

  it('executor invokes cleanup via shouldCleanupBackup (AV64)', () => {
    expect(exec).toMatch(/shouldCleanupBackup/);
  });

  it('executor emits audit doc to be_admin_audit collection with whole-system-backup id', () => {
    // Path built via template literal `${PREFIX}/be_admin_audit/${auditId}` where
    // auditId = `whole-system-backup-${name}-${Date.now()}-${randomHex}`.
    expect(exec).toMatch(/be_admin_audit/);
    expect(exec).toMatch(/['"`]whole-system-backup-/);
    expect(exec).toMatch(/auditId/);
  });

  it('executor sanitizes auth users via sanitizeAuthUser', () => {
    expect(exec).toMatch(/sanitizeAuthUser/);
  });

  it('executor enumerates Storage via resolveStorageScope (recursion gate)', () => {
    expect(exec).toMatch(/resolveStorageScope/);
  });
});

// ─── Task 8 — manual export endpoint ───────────────────────────────────

describe('V81 — manual export endpoint', () => {
  const src = READ('api/admin/whole-system-backup-export.js');

  it('uses verifyAdminToken (NOT cron secret)', () => {
    expect(src).toMatch(/verifyAdminToken/);
  });

  it('imports runWholeSystemBackup from shared executor', () => {
    expect(src).toMatch(/runWholeSystemBackup/);
    expect(src).toMatch(/wholeSystemBackupExecutor/);
  });

  it('shares concurrency lock with cron (whole-system-backup-running)', () => {
    expect(src).toMatch(/whole-system-backup-running/);
    expect(src).toMatch(/LOCK_BUSY/);
  });

  it('default type=manual; pre-restore opt-in via req.body.type', () => {
    // Both literal strings must appear (one as default, other as opt-in branch)
    expect(src).toMatch(/['"`]pre-restore['"`]/);
    expect(src).toMatch(/['"`]manual['"`]/);
    expect(src).toMatch(/req\.body\?\.type/);
  });

  it('runCleanup:false (manual does NOT cleanup per spec)', () => {
    expect(src).toMatch(/runCleanup:\s*false/);
  });

  it('rejects non-POST', () => {
    expect(src).toMatch(/METHOD_NOT_ALLOWED/);
  });

  it('lock source attribution uses caller.uid', () => {
    expect(src).toMatch(/manual-admin-\$\{caller\.uid\}/);
  });
});

// Future appends from Tasks 9-17 ...
