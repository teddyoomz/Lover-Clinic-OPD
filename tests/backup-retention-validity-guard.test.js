// ─── backup-retention-validity-guard (2026-07-21) — keep-last-valid guard ────
// Age-only retention could delete the LAST healthy auto backup during a
// V122-style broken-backup streak (05-22→05-26 produced only NO_MANIFEST
// folders while the healthy 05-21 folder aged toward the 5-day line).
// planRetentionWithValidityGuard deletes a retention-expired folder ONLY when
// a strictly-newer manifest-valid folder exists; with zero valid folders it
// deletes NOTHING.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { planRetentionWithValidityGuard, shouldCleanupBackup } from '../src/lib/wholeSystemBackupCore.js';

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-07-21T00:00:00Z');
const auto = (daysAgo, hasManifest = true) => ({
  name: `auto-${new Date(NOW - daysAgo * DAY).toISOString().slice(0, 10).replace(/-/g, '')}-0300`,
  createdMs: NOW - daysAgo * DAY,
  hasManifest,
});

describe('RG1 — normal operation (healthy backups every night)', () => {
  it('RG1.1 expired auto folders are deleted when newer valid folders exist (retention preserved)', () => {
    const plan = planRetentionWithValidityGuard([auto(0), auto(1), auto(6), auto(8)], NOW);
    expect(plan.toDelete.sort()).toEqual([auto(6).name, auto(8).name].sort());
  });

  it('RG1.2 within-retention folders are never deleted', () => {
    const plan = planRetentionWithValidityGuard([auto(0), auto(1), auto(4)], NOW);
    expect(plan.toDelete).toEqual([]);
    expect(plan.kept.length).toBe(3);
  });

  it('RG1.3 manual folders stay untouchable regardless of age or validity', () => {
    const manual = { name: 'manual-20260101-1200', createdMs: NOW - 200 * DAY, hasManifest: true };
    const plan = planRetentionWithValidityGuard([manual, auto(0)], NOW);
    expect(plan.toDelete).toEqual([]);
  });
});

describe('RG2 — PROVE-RED: the V122 broken-streak scenario', () => {
  // Streak: last healthy backup is 6 days old; every newer folder is
  // NO_MANIFEST junk. Age-only retention (the pre-fix executor loop called
  // shouldCleanupBackup alone) DELETES the healthy folder — proven here —
  // while the guarded planner KEEPS it.
  const streak = [
    auto(6, true),   // ← the LAST VALID backup, past the 5d line
    auto(5, false), auto(4, false), auto(3, false), auto(2, false), auto(1, false), auto(0, false),
  ];

  it('RG2.1 age-only retention WOULD delete the last valid backup (the pre-fix behavior)', () => {
    const healthy = streak[0];
    const oldDecision = shouldCleanupBackup(healthy.name, NOW - healthy.createdMs, NOW);
    expect(oldDecision.action).toBe('delete'); // ← the bug this guard closes
  });

  it('RG2.2 the guarded planner KEEPS the last valid backup (no newer valid folder exists)', () => {
    const plan = planRetentionWithValidityGuard(streak, NOW);
    expect(plan.toDelete).not.toContain(streak[0].name);
    const kept = plan.kept.find((k) => k.name === streak[0].name);
    expect(kept.reason).toContain('validity guard');
  });

  it('RG2.3 expired NO_MANIFEST junk older than the last valid backup IS still cleaned', () => {
    const withOlderJunk = [...streak, auto(9, false)];
    const plan = planRetentionWithValidityGuard(withOlderJunk, NOW);
    expect(plan.toDelete).toContain(auto(9, false).name);
  });

  it('RG2.4 zero valid folders anywhere → delete NOTHING (maximum caution during an outage)', () => {
    const allBroken = [auto(8, false), auto(6, false), auto(1, false)];
    const plan = planRetentionWithValidityGuard(allBroken, NOW);
    expect(plan.toDelete).toEqual([]);
  });

  it('RG2.5 recovery night — a fresh VALID backup un-freezes retention on the old one', () => {
    const recovered = [...streak.map((f) => ({ ...f })), auto(0.1, true)];
    const plan = planRetentionWithValidityGuard(recovered, NOW);
    expect(plan.toDelete).toContain(streak[0].name); // newer valid exists now → normal retention resumes
  });
});

describe('RG3 — adversarial inputs', () => {
  it('RG3.1 empty / null / malformed entries never throw and never delete', () => {
    expect(planRetentionWithValidityGuard([], NOW).toDelete).toEqual([]);
    expect(planRetentionWithValidityGuard(null, NOW).toDelete).toEqual([]);
    expect(planRetentionWithValidityGuard([null, {}, { name: 42 }], NOW).toDelete).toEqual([]);
  });

  it('RG3.2 NaN createdMs is treated as fresh (kept), not deleted', () => {
    const plan = planRetentionWithValidityGuard([{ name: 'auto-20260101-0300', createdMs: NaN, hasManifest: false }, auto(0)], NOW);
    expect(plan.toDelete).toEqual([]);
  });

  it('RG3.3 unknown-pattern folder names are preserved (forward-compat, mirrors shouldCleanupBackup)', () => {
    const plan = planRetentionWithValidityGuard([{ name: 'mystery-folder', createdMs: NOW - 30 * DAY, hasManifest: false }, auto(0)], NOW);
    expect(plan.toDelete).toEqual([]);
  });
});

describe('RG4 — executor wiring source-grep locks', () => {
  const exec = readFileSync(join(__dirname, '..', 'api/admin/_lib/wholeSystemBackupExecutor.js'), 'utf8');

  it('RG4.1 executor cleanup routes through planRetentionWithValidityGuard', () => {
    expect(exec).toMatch(/planRetentionWithValidityGuard\(/);
    expect(exec).toMatch(/hasManifest: folderHasManifest\.has\(name\)/);
  });

  it('RG4.2 anti-regression — the raw age-only delete loop is gone', () => {
    expect(exec).not.toMatch(/const decision = shouldCleanupBackup\(folder, ageMs/);
  });

  it('RG4.3 manifest detection reads the SAME listing (no extra API round-trips)', () => {
    expect(exec).toMatch(/m\[2\] === 'manifest\.json'/);
  });
});
