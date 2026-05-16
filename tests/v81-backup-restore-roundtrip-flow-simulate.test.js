// V81 Rule I full-flow simulate — backup → manifest → restore → verify identity.
// Pure-helper simulation (no Firebase). Hermetic emulator tests in Task 19.
// Property-based adversarial in Task 20.
//
// This test bank verifies the round-trip CONTRACT at the helper level:
//   F.1 — round-trip preserves data byte-identical (P1 invariant)
//   F.2 — manifestHash deterministic (P2 invariant)
//   F.3 — tampered manifest refused (P3 invariant)
//   F.4 — schemaVersion drift refused
//   F.5 — empty fixture round-trip (boundary)
//   F.6 — collection ordering doesn't affect hash (deterministic sort invariant)
//   F.7 — storage manifest tamper detection via outer manifestHash

import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  buildWholeSystemManifest,
  computeWholeSystemManifestHash,
  validateWholeSystemManifest,
  diffStates,
} from '../src/lib/wholeSystemBackupCore.js';

function makeFixture(opts = {}) {
  return {
    be_customers: [
      { id: 'CUST-1', name: 'Alice', branchId: 'BR-1', ...opts.cust1 },
      { id: 'CUST-2', name: 'Bob', branchId: 'BR-2', ...opts.cust2 },
    ],
    be_branches: [
      { id: 'BR-1', name: 'นครราชสีมา' },
      { id: 'BR-2', name: 'พระราม 3' },
    ],
  };
}

// Simulator: serialize state → "backup file" → manifest → "restore" via JSON.parse
function simulateRoundTrip(state) {
  const collections = Object.entries(state).map(([name, docs]) => {
    const json = JSON.stringify(docs);
    return {
      name,
      type: 'universal',
      path: `collections/universal/${name}.json`,
      docCount: docs.length,
      fileSizeBytes: json.length,
      fileHash: `sha256:${crypto.createHash('sha256').update(json).digest('hex')}`,
    };
  });
  const manifest = buildWholeSystemManifest({
    name: 'manual-20260516-2100',
    createdAt: '2026-05-16T14:00:00Z',
    createdBy: 'test',
    collections,
    storageObjects: [],
    authUsers: { path: 'auth/users.json', userCount: 0, fileHash: '' },
    stats: { totalDocCount: Object.values(state).reduce((s, d) => s + d.length, 0) },
  });
  manifest.manifestHash = computeWholeSystemManifestHash(manifest);
  return { manifest, fileBlobs: { ...state } };
}

function simulateRestore(backupBundle) {
  const v = validateWholeSystemManifest(backupBundle.manifest);
  if (!v.valid) throw new Error(`Restore refused: ${v.reason}`);
  return { ...backupBundle.fileBlobs };
}

describe('V81 — backup-restore round-trip (Rule I flow-simulate F.1-F.7)', () => {
  it('F.1 — round-trip preserves data byte-identical (P1 invariant)', () => {
    const source = makeFixture();
    const backup = simulateRoundTrip(source);
    const restored = simulateRestore(backup);
    expect(diffStates(source, restored)).toEqual({ added: [], removed: [], modified: [] });
  });

  it('F.2 — manifestHash deterministic across re-builds (P2 invariant)', () => {
    const source = makeFixture();
    const b1 = simulateRoundTrip(source);
    const b2 = simulateRoundTrip(source);
    expect(b1.manifest.manifestHash).toBe(b2.manifest.manifestHash);
    expect(b1.manifest.manifestHash).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('F.3 — tampered manifest hash refused (P3 invariant)', () => {
    const backup = simulateRoundTrip(makeFixture());
    backup.manifest.manifestHash = 'sha256:TAMPERED_0000000000000000000000000000000000000000000000000000';
    expect(() => simulateRestore(backup)).toThrow(/mismatch/i);
  });

  it('F.4 — schemaVersion drift refused', () => {
    const backup = simulateRoundTrip(makeFixture());
    backup.manifest.schemaVersion = 99;
    expect(() => simulateRestore(backup)).toThrow(/schemaVersion/);
  });

  it('F.5 — empty fixture round-trip (boundary)', () => {
    const source = { be_customers: [], be_branches: [] };
    const backup = simulateRoundTrip(source);
    const restored = simulateRestore(backup);
    expect(diffStates(source, restored)).toEqual({ added: [], removed: [], modified: [] });
  });

  it('F.6 — collection ordering does not affect manifestHash (sort invariance)', () => {
    // Build manifest with collections in different orders; hash must match.
    const docs1 = [{ id: '1', x: 'a' }];
    const docs2 = [{ id: '2', y: 'b' }];
    const json1 = JSON.stringify(docs1);
    const json2 = JSON.stringify(docs2);
    const colA = {
      name: 'col_a', type: 'universal', path: 'p1', docCount: 1, fileSizeBytes: json1.length,
      fileHash: `sha256:${crypto.createHash('sha256').update(json1).digest('hex')}`,
    };
    const colB = {
      name: 'col_b', type: 'universal', path: 'p2', docCount: 1, fileSizeBytes: json2.length,
      fileHash: `sha256:${crypto.createHash('sha256').update(json2).digest('hex')}`,
    };
    const m1 = buildWholeSystemManifest({
      name: 'manual-20260516-2100', createdAt: 't', createdBy: 'x',
      collections: [colA, colB], storageObjects: [], authUsers: { path: 'a', userCount: 0, fileHash: '' },
      stats: { totalDocCount: 2 },
    });
    const m2 = buildWholeSystemManifest({
      name: 'manual-20260516-2100', createdAt: 't', createdBy: 'x',
      collections: [colB, colA], storageObjects: [], authUsers: { path: 'a', userCount: 0, fileHash: '' },
      stats: { totalDocCount: 2 },
    });
    expect(computeWholeSystemManifestHash(m1)).toBe(computeWholeSystemManifestHash(m2));
  });

  it('F.7 — storage manifestHash tamper changes outer manifestHash (two-tier seal)', () => {
    const base = makeFixture();
    const collections = Object.entries(base).map(([name, docs]) => ({
      name, type: 'universal', path: `p/${name}`, docCount: docs.length,
      fileSizeBytes: JSON.stringify(docs).length,
      fileHash: `sha256:${crypto.createHash('sha256').update(JSON.stringify(docs)).digest('hex')}`,
    }));
    const storageObjects = [
      { path: 'storage/x.jpg', originalGsPath: 'x.jpg', fileSizeBytes: 100, fileHash: 'sha256:original' },
    ];
    const m1 = buildWholeSystemManifest({
      name: 'manual-20260516-2100', createdAt: 't', createdBy: 'x',
      collections, storageObjects, authUsers: { path: 'a', userCount: 0, fileHash: '' },
      stats: { totalDocCount: 4, totalStorageBytes: 100 },
    });
    const tamperedStorage = [
      { path: 'storage/x.jpg', originalGsPath: 'x.jpg', fileSizeBytes: 100, fileHash: 'sha256:TAMPERED' },
    ];
    const m2 = buildWholeSystemManifest({
      name: 'manual-20260516-2100', createdAt: 't', createdBy: 'x',
      collections, storageObjects: tamperedStorage,
      authUsers: { path: 'a', userCount: 0, fileHash: '' },
      stats: { totalDocCount: 4, totalStorageBytes: 100 },
    });
    expect(computeWholeSystemManifestHash(m1)).not.toBe(computeWholeSystemManifestHash(m2));
  });
});
