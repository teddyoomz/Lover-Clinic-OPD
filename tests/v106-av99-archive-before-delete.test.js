// tests/v106-av99-archive-before-delete.test.js
// V106 AV99 — source-grep enforcer: archive-before-delete cron shape + wiring +
// closed-deleter list. Locks the invariant against future drift.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const cron = readFileSync('api/cron/stock-movement-retention.js', 'utf8');
const panel = readFileSync('src/components/backend/MovementLogPanel.jsx', 'utf8');
const skill = readFileSync('.agents/skills/audit-anti-vibe-code/SKILL.md', 'utf8');
const vercel = readFileSync('vercel.json', 'utf8');
const storage = readFileSync('storage.rules', 'utf8');

describe('V106 AV99 — archive-before-delete cron shape', () => {
  it('AV99.1 cron auth via CRON_SECRET', () => {
    expect(cron).toContain('CRON_SECRET');
    expect(cron).toContain('status(401)');
  });
  it('AV99.2 archive write (.save) precedes delete (batch.delete) in source order', () => {
    const saveIdx = cron.indexOf('.save(');
    const delIdx = cron.indexOf('batch.delete(');
    expect(saveIdx).toBeGreaterThan(0);
    expect(delIdx).toBeGreaterThan(saveIdx);
  });
  it('AV99.3 delete gated on archivedKeys.has(groupKeyForMovement(...))', () => {
    expect(cron).toContain('archivedKeys.has(groupKeyForMovement');
  });
  it('AV99.4 precise re-gate via normalizeCreatedAtForCompare + isoAge < cutoff', () => {
    expect(cron).toContain('normalizeCreatedAtForCompare');
    expect(cron).toContain('isoAge < cutoffISO');
  });
  it('AV99.5 batched delete chunked at 450', () => {
    expect(cron).toContain('inBatch >= 450');
  });
  it('AV99.6 audit doc emitted', () => {
    expect(cron).toContain("op: 'stock-movement-retention'");
  });
  it('AV99.7 single-field query (no composite index trap)', () => {
    expect(cron).toContain(".where('createdAt', '<', cutoffISO)");
    expect(cron).toContain(".orderBy('createdAt', 'asc')");
  });
});

describe('V106 — wiring guards', () => {
  it('W1 vercel cron registered at 30 20 * * * + maxDuration', () => {
    expect(vercel).toContain('/api/cron/stock-movement-retention');
    expect(vercel).toContain('30 20 * * *');
    expect(vercel).toContain('"api/cron/stock-movement-retention.js"');
  });
  it('W2 storage.rules archive path admin-only', () => {
    expect(storage).toContain('stock-movements-archive/{branchId}/{file=**}');
    expect(storage).toMatch(/stock-movements-archive\/\{branchId\}\/\{file=\*\*\}[\s\S]{0,160}token\.admin == true/);
  });
  it('W3 MovementLogPanel 90-day notice present', () => {
    expect(panel).toContain('data-testid="movement-retention-info"');
    expect(panel).toContain('แสดงย้อนหลัง 90 วัน');
  });
  it('W4 AV99 codified in audit skill', () => {
    expect(skill).toContain('AV99');
    expect(skill).toContain('archive-before-delete');
    expect(skill).toContain('Sanctioned deleter (closed list of 1)');
  });
});

describe('V106 — closed-deleter list (cron is the ONLY be_stock_movements deleter)', () => {
  const lib = readFileSync('src/lib/backendClient.js', 'utf8');
  it('D1 backendClient never hard-deletes a movement doc', () => {
    // Reversal CREATES a compensating movement + sets reversedByMovementId; it must
    // NEVER deleteDoc/.delete a stockMovementDoc. firestore.rules also blocks it.
    expect(lib).not.toMatch(/deleteDoc\(\s*stockMovementDoc/);
    expect(lib).not.toMatch(/stockMovementDoc\([^)]*\)\s*\)?\s*\.delete\(/);
  });
  it('D2 the cron is the deleter (delete targets the movement doc ref)', () => {
    expect(cron).toContain('batch.delete(e.ref)');
  });
});
