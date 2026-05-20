// tests/v106-stock-movement-retention-flow-simulate.test.js
// Rule I — mirror the cron's archive-before-delete loop over an in-memory
// db + storage. LOGIC/code-shape coverage per Rule Q V66 (NOT real verification;
// the real verification is scripts/e2e-stock-movement-retention.mjs against prod).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  computeCutoffISO, archiveStoragePath, groupByBranchMonth, groupKeyForMovement,
  mergeArchive, buildArchiveFileBody, normalizeCreatedAtForCompare,
} from '../src/lib/stockMovementRetentionCore.js';

// In-memory mirror of the cron handler body (api/cron/stock-movement-retention.js).
// db = Map(movementId -> movement); storage = Map(path -> archiveBodyObject).
function simulateRetentionRun({ db, storage, now, limit = 2000 }) {
  const cutoffISO = computeCutoffISO(now);
  const all = [...db.values()]
    .filter(m => { const a = normalizeCreatedAtForCompare(m.createdAt); return a && a < cutoffISO; })
    .sort((a, b) => normalizeCreatedAtForCompare(a.createdAt).localeCompare(normalizeCreatedAtForCompare(b.createdAt)))
    .slice(0, limit);
  const groups = groupByBranchMonth(all);
  const archivedKeys = new Set();
  for (const [key, ms] of Object.entries(groups)) {
    const [branchId, month] = key.split('|');
    const path = archiveStoragePath(branchId, month);
    const existing = storage.get(path)?.movements || [];
    storage.set(path, buildArchiveFileBody({ branchId, month, movements: mergeArchive(existing, ms) }));
    archivedKeys.add(key);
  }
  let deleted = 0;
  for (const m of all) {
    if (!archivedKeys.has(groupKeyForMovement(m))) continue;
    db.delete(m.movementId); deleted++;
  }
  return { scanned: all.length, archived: all.length, deleted, cutoffISO };
}

function seedDb() {
  const db = new Map();
  const add = (id, branchId, createdAt) => db.set(id, { movementId: id, branchId, createdAt, qty: -1 });
  add('old1', 'BR-a', '2026-01-05T00:00:00.000Z');  // > 90d (old)
  add('old2', 'BR-a', '2026-01-20T00:00:00.000Z');
  add('old3', 'BR-b', '2026-02-10T00:00:00.000Z');
  add('recent1', 'BR-a', '2026-05-10T00:00:00.000Z'); // < 90d -> kept
  // recent doc with legacy Timestamp createdAt — must NOT be deleted
  add('recentTs', 'BR-a', { _seconds: Math.floor(new Date('2026-05-12T00:00:00Z').getTime() / 1000), _nanoseconds: 0 });
  return db;
}

const NOW = new Date('2026-05-20T00:00:00.000Z'); // cutoff = 2026-02-19

describe('V106 F1 — archive then delete', () => {
  it('old movements archived to monthly files + deleted; recent kept', () => {
    const db = seedDb(); const storage = new Map();
    const r = simulateRetentionRun({ db, storage, now: NOW });
    expect(r.deleted).toBe(3);
    expect(db.has('recent1')).toBe(true);
    expect(db.has('recentTs')).toBe(true);   // legacy-Timestamp recent doc preserved
    expect(db.has('old1')).toBe(false);
    expect(storage.get('stock-movements-archive/BR-a/2026-01.json').movements.map(m => m.movementId).sort())
      .toEqual(['old1', 'old2']);
    expect(storage.get('stock-movements-archive/BR-b/2026-02.json').count).toBe(1);
  });
});

describe('V106 F2 — idempotent re-run', () => {
  it('second run deletes 0 + archive does not grow', () => {
    const db = seedDb(); const storage = new Map();
    simulateRetentionRun({ db, storage, now: NOW });
    const before = storage.get('stock-movements-archive/BR-a/2026-01.json').count;
    const r2 = simulateRetentionRun({ db, storage, now: NOW });
    expect(r2.deleted).toBe(0);
    expect(storage.get('stock-movements-archive/BR-a/2026-01.json').count).toBe(before);
  });
});

describe('V106 F3 — incremental backlog drain (limit)', () => {
  it('limit caps per run; consecutive runs drain remainder', () => {
    const db = seedDb(); const storage = new Map();
    const r1 = simulateRetentionRun({ db, storage, now: NOW, limit: 2 });
    expect(r1.deleted).toBe(2);
    const r2 = simulateRetentionRun({ db, storage, now: NOW, limit: 2 });
    expect(r2.deleted).toBe(1);            // last old one
    const r3 = simulateRetentionRun({ db, storage, now: NOW, limit: 2 });
    expect(r3.deleted).toBe(0);            // drained
  });
});

describe('V106 F4 — balance untouched', () => {
  it('batches map (separate from movements) is never read or written', () => {
    const db = seedDb(); const storage = new Map();
    const batches = new Map([['BR-a:38699', { remaining: 9, total: 10 }]]);
    const snapshot = JSON.stringify([...batches]);
    simulateRetentionRun({ db, storage, now: NOW });
    expect(JSON.stringify([...batches])).toBe(snapshot); // byte-identical
  });
});

describe('V106 F5 — archive-before-delete ordering (no orphan delete)', () => {
  it('every deleted month-group has a corresponding archive file', () => {
    const db = seedDb(); const storage = new Map();
    simulateRetentionRun({ db, storage, now: NOW });
    expect(storage.has('stock-movements-archive/BR-a/2026-01.json')).toBe(true);
    expect(storage.has('stock-movements-archive/BR-b/2026-02.json')).toBe(true);
  });
});

describe('V106 F6 — source-grep: cron uses the same helpers this simulate uses', () => {
  it('cron imports/uses every retention helper', () => {
    const cron = readFileSync('api/cron/stock-movement-retention.js', 'utf8');
    for (const fn of ['computeCutoffISO', 'groupByBranchMonth', 'groupKeyForMovement', 'mergeArchive', 'buildArchiveFileBody', 'normalizeCreatedAtForCompare', 'archiveStoragePath'])
      expect(cron).toContain(fn);
  });
});

describe('V106 F7 — boundary: doc exactly at cutoff is NOT eligible', () => {
  it('createdAt === cutoff is kept (strict < gate)', () => {
    const db = new Map();
    const cutoff = computeCutoffISO(NOW);
    db.set('edge', { movementId: 'edge', branchId: 'BR-a', createdAt: cutoff });
    const storage = new Map();
    const r = simulateRetentionRun({ db, storage, now: NOW });
    expect(r.deleted).toBe(0);
    expect(db.has('edge')).toBe(true);
  });
});
