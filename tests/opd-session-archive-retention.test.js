// opd_sessions archive retention (2026-07-19) — punchlist #22 residual closed.
//
// Pre-fix: the 30-min cleanup sweep SKIPS every isArchived doc → archived
// intake sessions (patient data) were retained FOREVER (143/155 prod docs at
// design time). Policy (user-approved): safe-delete archived sessions older
// than 180 days, guarded by every referenced-session class, decided in JS
// over a FULL scan (V23: a server-side where() silently excludes docs missing
// the field). Deleted docs exist in the nightly whole-system backup — the
// cron runs 03:20 BKK, AFTER the 03:00 backup.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  decideArchiveRetention, anyTimestampMs, ARCHIVE_RETENTION_DAYS,
} from '../src/lib/opdSessionCleanupCore.js';

const CRON = readFileSync(path.resolve(process.cwd(), 'api/cron/opd-session-archive-retention.js'), 'utf8');
const CLI = readFileSync(path.resolve(process.cwd(), 'scripts/opd-session-archive-retention.mjs'), 'utf8');
const VERCEL = JSON.parse(readFileSync(path.resolve(process.cwd(), 'vercel.json'), 'utf8'));
const REGISTRY = readFileSync(path.resolve(process.cwd(), 'src/lib/scheduledTasksRegistry.js'), 'utf8');

const NOW = Date.parse('2026-07-19T00:00:00Z');
const DAY = 24 * 60 * 60 * 1000;
const oldIso = (days) => new Date(NOW - days * DAY).toISOString();

describe('OR1 — anyTimestampMs dual-type coercion (dead-cron lesson)', () => {
  it('OR1.1 Timestamp-like {toMillis}', () => {
    expect(anyTimestampMs({ toMillis: () => 123456 })).toBe(123456);
  });
  it('OR1.2 admin-JSON {_seconds,_nanoseconds}', () => {
    expect(anyTimestampMs({ _seconds: 10, _nanoseconds: 5e8 })).toBe(10500);
  });
  it('OR1.3 ISO string (the AdminDashboard:3048 updatedAt path)', () => {
    expect(anyTimestampMs('2026-01-01T00:00:00.000Z')).toBe(Date.parse('2026-01-01T00:00:00.000Z'));
  });
  it('OR1.4 number passthrough + garbage → null', () => {
    expect(anyTimestampMs(1700000000000)).toBe(1700000000000);
    expect(anyTimestampMs('not-a-date')).toBeNull();
    expect(anyTimestampMs(null)).toBeNull();
    expect(anyTimestampMs(NaN)).toBeNull();
  });
});

describe('OR2 — decideArchiveRetention guard matrix', () => {
  const base = { isArchived: true, archivedAt: oldIso(200), patientData: { firstName: 'x' } };

  it('OR2.1 archived >180d + no guards → delete', () => {
    expect(decideArchiveRetention('s1', base, { nowMs: NOW })).toEqual({
      action: 'delete', reason: 'archived-older-than-retention',
    });
  });

  it('OR2.2 not archived → skip (the cleanup sweep owns it)', () => {
    expect(decideArchiveRetention('s1', { ...base, isArchived: false }, { nowMs: NOW }).reason).toBe('not-archived');
  });

  it('OR2.3 isPermanent → skip (permanent links never age out)', () => {
    expect(decideArchiveRetention('s1', { ...base, isPermanent: true }, { nowMs: NOW }).reason).toBe('permanent-link');
  });

  it('OR2.4 live patient link → skip; DISABLED link falls through to delete', () => {
    expect(decideArchiveRetention('s1', { ...base, patientLinkToken: 't'.repeat(20), patientLinkEnabled: true }, { nowMs: NOW }).reason)
      .toBe('live-patient-link');
    expect(decideArchiveRetention('s1', { ...base, patientLinkToken: 't'.repeat(20), patientLinkEnabled: false }, { nowMs: NOW }).action)
      .toBe('delete');
  });

  it('OR2.5 referenced by a booking (linkedOpdSessionId reverse-set) → skip', () => {
    const referencedIds = new Set(['s1']);
    expect(decideArchiveRetention('s1', base, { nowMs: NOW, referencedIds }).reason).toBe('referenced-by-booking');
    expect(decideArchiveRetention('s2', base, { nowMs: NOW, referencedIds }).action).toBe('delete');
  });

  it('OR2.6 no resolvable timestamp → conservative skip (never guess age)', () => {
    expect(decideArchiveRetention('s1', { isArchived: true }, { nowMs: NOW }).reason).toBe('no-timestamp');
  });

  it('OR2.7 age anchor fallback chain: archivedAt → updatedAt(ISO!) → submittedAt → createdAt', () => {
    // archivedAt missing (legacy archived doc) → old ISO-string updatedAt drives the decision
    expect(decideArchiveRetention('s1', { isArchived: true, updatedAt: oldIso(300) }, { nowMs: NOW }).action).toBe('delete');
    // young archivedAt WINS over an ancient createdAt (age from archive, not creation)
    expect(decideArchiveRetention('s1', { isArchived: true, archivedAt: oldIso(10), createdAt: oldIso(400) }, { nowMs: NOW }).reason)
      .toBe('younger-than-retention');
  });

  it('OR2.8 boundary: exactly 180d = skip; 181d = delete (default constant locked)', () => {
    expect(ARCHIVE_RETENTION_DAYS).toBe(180);
    expect(decideArchiveRetention('s1', { isArchived: true, archivedAt: oldIso(180) }, { nowMs: NOW }).action).toBe('skip');
    expect(decideArchiveRetention('s1', { isArchived: true, archivedAt: oldIso(181) }, { nowMs: NOW }).action).toBe('delete');
  });

  it('OR2.9 adversarial: null/garbage data → skip, never throw', () => {
    expect(decideArchiveRetention('s1', null, { nowMs: NOW }).reason).toBe('invalid-data');
    expect(decideArchiveRetention('s1', 'junk', { nowMs: NOW }).reason).toBe('invalid-data');
    expect(decideArchiveRetention('s1', { isArchived: true, archivedAt: { bogus: 1 } }, { nowMs: NOW }).reason).toBe('no-timestamp');
  });
});

describe('OR3 — wiring locks (cron + CLI + registry + vercel.json)', () => {
  it('OR3.1 cron: FULL scan, NO server-side where() on isArchived (V23 lock)', () => {
    expect(CRON).not.toMatch(/where\(\s*['"]isArchived/);
    expect(CRON).toMatch(/decideArchiveRetention/);
  });

  it('OR3.2 cron: reverse-reference collection from BOTH be_appointments + be_deposits via select()', () => {
    expect(CRON).toMatch(/BE_APPOINTMENTS_COL, BE_DEPOSITS_COL/);
    expect(CRON).toMatch(/select\('linkedOpdSessionId'\)/);
  });

  it('OR3.3 cron: delete cap reported (no silent caps) + canonical CRON_SECRET gate + audit doc', () => {
    expect(CRON).toMatch(/DELETE_CAP = 400/);
    expect(CRON).toMatch(/capped\+\+/);
    expect(CRON).toMatch(/x-cron-secret/);
    expect(CRON).toMatch(/op: 'opd-session-archive-retention'/);
  });

  it('OR3.4 vercel.json: cron at 20:20 UTC (03:20 BKK — AFTER the 03:00 backup) + maxDuration', () => {
    const entry = (VERCEL.crons || []).find(c => c.path === '/api/cron/opd-session-archive-retention');
    expect(entry?.schedule).toBe('20 20 * * *');
    const backup = (VERCEL.crons || []).find(c => c.path === '/api/cron/whole-system-backup-daily');
    expect(backup?.schedule).toBe('0 20 * * *'); // ordering: backup BEFORE retention
    expect(VERCEL.functions['api/cron/opd-session-archive-retention.js'].maxDuration).toBe(300);
  });

  it('OR3.5 registry: task entry with retentionDays param (30..3650, default from the core)', () => {
    expect(REGISTRY).toMatch(/id: 'opdSessionArchiveRetention', category: 'retention'/);
    expect(REGISTRY).toMatch(/num\('retentionDays', 'ลบ archive เก่ากว่า', ARCHIVE_RETENTION_DAYS, 30, 3650, 'วัน'\)/);
  });

  it('OR3.6 CLI shares the SAME sweep export (one decision core, no drift)', () => {
    expect(CLI).toMatch(/sweepOpdSessionArchiveRetention/);
    expect(CLI).toMatch(/--apply/);
  });
});
