// V74 T2 — Heavy gallery + Storage manifest SHA-256 verify
// 20 gallery_upload images + per-Storage-object SHA-256 round-trip.

import { describe, it, expect } from 'vitest';
import crypto from 'node:crypto';
import {
  buildCustomerBackupFile,
  computeStorageManifestHash,
} from '../src/lib/customerBackupSchema.js';

function makeManifest(n) {
  return Array.from({ length: n }, (_, i) => {
    const bytes = crypto.randomBytes(1024 * (i + 1));
    const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
    return {
      path: `be_customers/LC-1/gallery_${i.toString().padStart(2, '0')}.jpg`,
      size: bytes.length,
      sha256,
      contentType: 'image/jpeg',
    };
  });
}

describe('T2 — Heavy gallery + Storage manifest', () => {
  it('T2.1 20-image gallery manifest produces deterministic hash', () => {
    const manifest = makeManifest(20);
    const h1 = computeStorageManifestHash(manifest);
    const h2 = computeStorageManifestHash(manifest);
    expect(h1).toBe(h2);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
  });
  it('T2.2 reorder manifest entries produces SAME hash (canonical sort)', () => {
    const manifest = makeManifest(20);
    const reordered = [...manifest].reverse();
    expect(computeStorageManifestHash(manifest)).toBe(computeStorageManifestHash(reordered));
  });
  it('T2.3 ANY byte change in one image invalidates hash', () => {
    const m1 = makeManifest(5);
    const target = m1[2].path;
    const m2 = m1.map(e => e.path === target ? { ...e, sha256: 'X'.repeat(64) } : e);
    expect(computeStorageManifestHash(m1)).not.toBe(computeStorageManifestHash(m2));
  });
  it('T2.4 size change in one entry invalidates hash', () => {
    const m1 = makeManifest(5);
    const target = m1[1].path;
    const m2 = m1.map(e => e.path === target ? { ...e, size: e.size + 1 } : e);
    expect(computeStorageManifestHash(m1)).not.toBe(computeStorageManifestHash(m2));
  });
  it('T2.5 buildCustomerBackupFile embeds manifest hash for 20-image gallery', () => {
    const manifest = makeManifest(20);
    const file = buildCustomerBackupFile({
      customerId: 'LC-1', customerHN: '0001', customerName: 'A', exportedBy: 'x',
      collections: {}, subcollections: {}, chatConversations: [], storageManifest: manifest,
    });
    expect(file.meta.storageObjectCount).toBe(20);
    expect(file.meta.storageManifestHash).toBe(computeStorageManifestHash(manifest));
  });
});
