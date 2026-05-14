import { describe, it, expect } from 'vitest';
import {
  BACKUP_SCHEMA_VERSION,
  computeBodyHash,
  validateBackupFile,
  buildBackupFile,
} from '../src/lib/branchBackupSchema.js';

const SAMPLE_COLLECTIONS = {
  be_appointments: [
    { id: 'BA-001', branchId: 'BR-A', date: '2026-05-14', startTime: '10:00' },
    { id: 'BA-002', branchId: 'BR-A', date: '2026-05-14', startTime: '11:00' },
  ],
  be_sales: [
    { id: 'SALE-001', branchId: 'BR-A', total: 1500 },
  ],
};

describe('H1 BACKUP_SCHEMA_VERSION', () => {
  it('H1.1 — version is 2 (existing v2 schema retained)', () => {
    expect(BACKUP_SCHEMA_VERSION).toBe(2);
  });
});

describe('H2 computeBodyHash', () => {
  it('H2.1 — deterministic across calls', () => {
    const h1 = computeBodyHash(SAMPLE_COLLECTIONS);
    const h2 = computeBodyHash(SAMPLE_COLLECTIONS);
    expect(h1).toBe(h2);
  });

  it('H2.2 — returns 64-char lower-hex (SHA-256)', () => {
    const h = computeBodyHash(SAMPLE_COLLECTIONS);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });

  it('H2.3 — collection key-order permutation produces SAME hash', () => {
    const a = { be_sales: SAMPLE_COLLECTIONS.be_sales, be_appointments: SAMPLE_COLLECTIONS.be_appointments };
    const b = SAMPLE_COLLECTIONS;
    expect(computeBodyHash(a)).toBe(computeBodyHash(b));
  });

  it('H2.4 — doc-order permutation within collection produces SAME hash (sort by id)', () => {
    const reversed = {
      be_appointments: [...SAMPLE_COLLECTIONS.be_appointments].reverse(),
      be_sales: SAMPLE_COLLECTIONS.be_sales,
    };
    expect(computeBodyHash(reversed)).toBe(computeBodyHash(SAMPLE_COLLECTIONS));
  });

  it('H2.5 — different content → different hash', () => {
    const modified = {
      ...SAMPLE_COLLECTIONS,
      be_sales: [{ id: 'SALE-001', branchId: 'BR-A', total: 9999 }],
    };
    expect(computeBodyHash(modified)).not.toBe(computeBodyHash(SAMPLE_COLLECTIONS));
  });

  it('H2.6 — nested object with sorted keys → consistent hash', () => {
    const withNested = {
      be_sales: [{
        id: 'SALE-001',
        createdAt: { seconds: 1715000000, nanoseconds: 123000000 },
      }],
    };
    expect(computeBodyHash(withNested)).toMatch(/^[0-9a-f]{64}$/);
    expect(computeBodyHash(withNested)).toBe(computeBodyHash(withNested));
  });

  it('H2.7 — NaN / Infinity / -Infinity each produce consistent + distinct hashes (via __number__ sentinel)', () => {
    const withNaN = { be_sales: [{ id: 'S1', value: NaN }] };
    const withInf = { be_sales: [{ id: 'S1', value: Infinity }] };
    const withNegInf = { be_sales: [{ id: 'S1', value: -Infinity }] };

    expect(computeBodyHash(withNaN)).toBe(computeBodyHash(withNaN));
    expect(computeBodyHash(withInf)).toBe(computeBodyHash(withInf));
    expect(computeBodyHash(withNaN)).not.toBe(computeBodyHash(withInf));
    expect(computeBodyHash(withInf)).not.toBe(computeBodyHash(withNegInf));
  });

  it('H2.8 — empty collection → stable hash', () => {
    const h = computeBodyHash({ be_appointments: [] });
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe(computeBodyHash({ be_appointments: [] }));
  });

  it('H2.9 — empty collections object → stable hash', () => {
    expect(() => computeBodyHash({})).not.toThrow();
    expect(computeBodyHash({})).toBe(computeBodyHash({}));
  });

  it('H2.10 — 1000-doc fixture deterministic (shuffled doc order yields same hash)', () => {
    const docs = Array.from({ length: 1000 }, (_, i) => ({
      id: `BA-${String(i).padStart(4, '0')}`,
      branchId: 'BR-A',
      index: i,
    }));
    const collA = { be_appointments: docs };
    const shuffled = [...docs];
    // Deterministic shuffle (LCG seeded)
    let seed = 12345;
    for (let i = shuffled.length - 1; i > 0; i--) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const j = seed % (i + 1);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const collB = { be_appointments: shuffled };
    expect(computeBodyHash(collA)).toBe(computeBodyHash(collB));
  });

  it('H2.11 — Thai text in fields preserved in hash', () => {
    const thaiDocs = {
      be_appointments: [{
        id: 'BA-001',
        note: 'นัดหมายลูกค้า พิเศษ',
      }],
    };
    expect(computeBodyHash(thaiDocs)).toMatch(/^[0-9a-f]{64}$/);
    expect(computeBodyHash(thaiDocs)).toBe(computeBodyHash(thaiDocs));
  });

  it('H2.12 — Unicode NFC vs NFD produce DIFFERENT hashes (byte-equal, not unicode-equal)', () => {
    // 'é' as NFC (single code point U+00E9) vs NFD (e + U+0301 combining)
    const nfc = { be_sales: [{ id: 'S1', name: 'é' }] };       // NFC: é
    const nfd = { be_sales: [{ id: 'S1', name: 'é' }] };       // NFD: e + combining acute
    expect(computeBodyHash(nfc)).not.toBe(computeBodyHash(nfd));
  });

  it('H2.13 — deeply nested object stable hash', () => {
    const nested = {
      be_sales: [{
        id: 'S1',
        items: { a: { b: { c: { d: { e: 'deep' } } } } },
      }],
    };
    expect(computeBodyHash(nested)).toBe(computeBodyHash(nested));
  });

  it('H2.14 — key-order permutation inside nested object produces SAME hash', () => {
    const orderA = { be_sales: [{ id: 'S1', items: { x: 1, y: 2, z: 3 } }] };
    const orderB = { be_sales: [{ id: 'S1', items: { z: 3, y: 2, x: 1 } }] };
    expect(computeBodyHash(orderA)).toBe(computeBodyHash(orderB));
  });

  it('H2.15 — null + undefined treated the same (both → "null" in canonical)', () => {
    const withNull = { be_sales: [{ id: 'S1', a: null }] };
    const withUndef = { be_sales: [{ id: 'S1', a: undefined }] };
    expect(computeBodyHash(withNull)).toBe(computeBodyHash(withUndef));
  });
});

describe('H3 validateBackupFile (selective-make-fresh extension)', () => {
  const SAMPLE_V2_NO_HASH = {
    meta: {
      schemaVersion: 2,
      sourceBranchId: 'BR-A',
      exportedAt: '2026-05-07T00:00:00.000Z',
    },
    collections: { be_appointments: [] },
  };

  const SAMPLE_V2_WITH_HASH = {
    meta: {
      schemaVersion: 2,
      sourceBranchId: 'BR-A',
      bucketIds: ['appointments'],
      bodyHash: 'a'.repeat(64),
      exportedAt: '2026-05-14T00:00:00.000Z',
    },
    collections: { be_appointments: [] },
  };

  it('H3.1 — v2 file with valid bodyHash + bucketIds validates', () => {
    expect(() => validateBackupFile(SAMPLE_V2_WITH_HASH)).not.toThrow();
  });

  it('H3.2 — v2 legacy file WITHOUT bodyHash validates (backward-compat)', () => {
    expect(() => validateBackupFile(SAMPLE_V2_NO_HASH)).not.toThrow();
  });

  it('H3.3 — v2 file with bodyHash wrong format (not 64-char hex) throws', () => {
    const bad = { ...SAMPLE_V2_WITH_HASH, meta: { ...SAMPLE_V2_WITH_HASH.meta, bodyHash: 'tooshort' } };
    expect(() => validateBackupFile(bad)).toThrow('INVALID_BODY_HASH_FORMAT');
  });

  it('H3.4 — v2 file with bodyHash uppercase hex throws (must be lowercase)', () => {
    const bad = { ...SAMPLE_V2_WITH_HASH, meta: { ...SAMPLE_V2_WITH_HASH.meta, bodyHash: 'A'.repeat(64) } };
    expect(() => validateBackupFile(bad)).toThrow('INVALID_BODY_HASH_FORMAT');
  });

  it('H3.5 — v2 file with bucketIds non-array throws', () => {
    const bad = { ...SAMPLE_V2_WITH_HASH, meta: { ...SAMPLE_V2_WITH_HASH.meta, bucketIds: 'appointments' } };
    expect(() => validateBackupFile(bad)).toThrow('INVALID_BUCKET_IDS_FORMAT');
  });

  it('H3.6 — v1 legacy file (no bodyHash, no bucketIds) validates', () => {
    const v1 = {
      meta: { schemaVersion: 1, sourceBranchId: 'BR-A', exportedAt: '2026-04-01T00:00:00.000Z' },
      collections: { be_appointments: [] },
    };
    expect(() => validateBackupFile(v1)).not.toThrow();
  });
});

describe('H4 buildBackupFile (selective-make-fresh extension)', () => {
  it('H4.1 — emits bodyHash + bucketIds when bucketIds provided', () => {
    const file = buildBackupFile({
      sourceBranchId: 'BR-A',
      exportedBy: 'admin',
      collections: { be_appointments: [{ id: 'BA-001', branchId: 'BR-A' }] },
      bucketIds: ['appointments'],
    });
    expect(file.meta.bodyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(file.meta.bucketIds).toEqual(['appointments']);
  });

  it('H4.2 — emits sorted bucketIds (canonical for cross-check at make-fresh)', () => {
    const file = buildBackupFile({
      sourceBranchId: 'BR-A',
      collections: {},
      bucketIds: ['stock', 'appointments', 'finance'],
    });
    expect(file.meta.bucketIds).toEqual(['appointments', 'finance', 'stock']);
  });

  it('H4.3 — omits bodyHash + bucketIds when bucketIds not provided (V40 legacy path)', () => {
    const file = buildBackupFile({
      sourceBranchId: 'BR-A',
      collections: { be_appointments: [] },
    });
    expect(file.meta.bodyHash).toBeUndefined();
    expect(file.meta.bucketIds).toBeUndefined();
  });

  it('H4.4 — bodyHash matches what computeBodyHash returns for same collections', () => {
    const collections = { be_appointments: [{ id: 'BA-001', x: 1 }] };
    const file = buildBackupFile({
      sourceBranchId: 'BR-A',
      collections,
      bucketIds: ['appointments'],
    });
    expect(file.meta.bodyHash).toBe(computeBodyHash(collections));
  });
});
