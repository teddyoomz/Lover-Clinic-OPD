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

// Future appends from Tasks 7-17:
// - AV63 (Task 7): cron CRON_SECRET + lock
// - manual endpoint (Task 8): verifyAdminToken + shares lock
// - restore endpoint Fresh-only (Task 9): validateWholeSystemManifest + assertTargetEmpty
// - restore Replace mode (Task 10): AV19 elevation auto-pre-backup
// - download endpoint (Task 11): archiver lib + 24h signed URL
// - list+delete (Task 12): validate manifest + NAME_PATTERN
