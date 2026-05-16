import { describe, it, expect } from 'vitest';
import {
  WHOLE_SYSTEM_SCHEMA_VERSION,
  UNIVERSAL_COLLECTIONS,
  BRANCH_SCOPED_COLLECTIONS,
  CUSTOMER_SUBCOLLECTIONS,
  STORAGE_INCLUDE_PREFIXES,
  STORAGE_EXCLUDE_PREFIXES,
  RETENTION_DAYS,
  NAME_PATTERN,
} from '../src/lib/wholeSystemBackupCore.js';

describe('V81 — wholeSystemBackupCore constants (Group A)', () => {
  it('A.1 — schema version is 2', () => {
    expect(WHOLE_SYSTEM_SCHEMA_VERSION).toBe(2);
  });
  it('A.2 — universal collections frozen array includes core + chat + audit', () => {
    expect(Object.isFrozen(UNIVERSAL_COLLECTIONS)).toBe(true);
    expect(UNIVERSAL_COLLECTIONS).toContain('be_customers');
    expect(UNIVERSAL_COLLECTIONS).toContain('be_staff');
    expect(UNIVERSAL_COLLECTIONS).toContain('be_branches');
    expect(UNIVERSAL_COLLECTIONS).toContain('chat_conversations');
    expect(UNIVERSAL_COLLECTIONS).toContain('chat_history');
    expect(UNIVERSAL_COLLECTIONS).toContain('be_admin_audit');
    expect(UNIVERSAL_COLLECTIONS).toContain('clinic_settings');
  });
  it('A.3 — branch-scoped collections include money/stock/treatment/sale', () => {
    expect(Object.isFrozen(BRANCH_SCOPED_COLLECTIONS)).toBe(true);
    expect(BRANCH_SCOPED_COLLECTIONS).toContain('be_treatments');
    expect(BRANCH_SCOPED_COLLECTIONS).toContain('be_sales');
    expect(BRANCH_SCOPED_COLLECTIONS).toContain('be_appointments');
    expect(BRANCH_SCOPED_COLLECTIONS).toContain('be_stock_batches');
    expect(BRANCH_SCOPED_COLLECTIONS).toContain('be_staff_chat_messages');
  });
  it('A.4 — customer subcollections = V74 T4 list (8 items)', () => {
    expect(CUSTOMER_SUBCOLLECTIONS).toEqual([
      'wallets', 'memberships', 'points',
      'treatments', 'sales', 'appointments',
      'deposits', 'courseChanges'
    ]);
  });
  it('A.5 — storage exclude prefixes include backups/ (recursion gate) + probe/ + TEST-/E2E-', () => {
    expect(STORAGE_EXCLUDE_PREFIXES).toContain('backups/');
    expect(STORAGE_EXCLUDE_PREFIXES).toContain('probe/');
    expect(STORAGE_EXCLUDE_PREFIXES).toContain('TEST-');
    expect(STORAGE_EXCLUDE_PREFIXES).toContain('E2E-');
  });
  it('A.6 — storage include prefixes include customers/ + staff-chat-attachments/', () => {
    expect(STORAGE_INCLUDE_PREFIXES).toContain('customers/');
    expect(STORAGE_INCLUDE_PREFIXES).toContain('staff-chat-attachments/');
  });
  it('A.7 — retention days match spec (5d auto / 7d pre-restore / 1d archive)', () => {
    expect(RETENTION_DAYS).toEqual({ auto: 5, preRestore: 7, archive: 1 });
  });
  it('A.8 — name pattern accepts auto / manual / pre-restore + YYYYMMDD-HHmm', () => {
    expect(NAME_PATTERN.test('auto-20260516-0300')).toBe(true);
    expect(NAME_PATTERN.test('manual-20260516-1430')).toBe(true);
    expect(NAME_PATTERN.test('pre-restore-20260516-2059')).toBe(true);
    expect(NAME_PATTERN.test('random-name')).toBe(false);
    expect(NAME_PATTERN.test('auto-2026-05-16-0300')).toBe(false);
  });
});

import { resolveStorageScope, resolveCollectionScope } from '../src/lib/wholeSystemBackupCore.js';

describe('V81 — scope resolvers (Group A continued)', () => {
  it('A.9 — resolveStorageScope INCLUDES customers/{cid}/photo.jpg', () => {
    expect(resolveStorageScope('customers/CUST-123/photo.jpg')).toBe(true);
  });
  it('A.10 — resolveStorageScope INCLUDES staff-chat-attachments/...', () => {
    expect(resolveStorageScope('staff-chat-attachments/BR-X/file.png')).toBe(true);
  });
  it('A.11 — resolveStorageScope EXCLUDES backups/whole-system/auto-...', () => {
    expect(resolveStorageScope('backups/whole-system/auto-20260516-0300/manifest.json')).toBe(false);
  });
  it('A.12 — resolveStorageScope EXCLUDES probe/test-probe-...', () => {
    expect(resolveStorageScope('probe/test-probe-1778943895496.json')).toBe(false);
  });
  it('A.13 — resolveStorageScope EXCLUDES TEST-/E2E- prefixed', () => {
    expect(resolveStorageScope('TEST-customer-photo.jpg')).toBe(false);
    expect(resolveStorageScope('E2E-fixture-file.png')).toBe(false);
  });
  it('A.14 — resolveStorageScope DEFAULT-EXCLUDE unknown paths (forward-compat safety)', () => {
    expect(resolveStorageScope('unknown-path/file.bin')).toBe(false);
    expect(resolveStorageScope('users/me/private.json')).toBe(false);
  });
  it('A.15 — resolveCollectionScope returns universal + branchScoped arrays', () => {
    const scope = resolveCollectionScope();
    expect(scope.universal).toContain('be_customers');
    expect(scope.branchScoped).toContain('be_treatments');
    expect(scope.universal.length + scope.branchScoped.length).toBeGreaterThan(45);
  });
});
