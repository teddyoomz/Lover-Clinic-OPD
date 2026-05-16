// V75 Item 2 — wholeFleetBackupCore helper unit tests.

import { describe, it, expect } from 'vitest';
import {
  buildWholeFleetManifest,
  computeWholeFleetManifestHash,
  validateWholeFleetManifest,
  WHOLE_FLEET_SCHEMA_VERSION,
  WHOLE_FLEET_TYPE,
} from '../src/lib/wholeFleetBackupCore.js';

const makeCustomerEntry = (cid, hn, displayName, fileHash, storageHash, ts) => ({
  cid, hn, displayName,
  fileEntry: `customers/${cid}.json`,
  fileHash,
  storageManifestHash: storageHash,
  exportedAt: ts || '2026-05-16T10:00:00.000Z',
  totals: { appointmentCount: 3, saleCount: 2, treatmentCount: 5 },
});

describe('V75 Item 2 — wholeFleetBackupCore', () => {
  it('WF1.1 — schema version is 1 and type is whole-fleet-customers', () => {
    expect(WHOLE_FLEET_SCHEMA_VERSION).toBe(1);
    expect(WHOLE_FLEET_TYPE).toBe('whole-fleet-customers');
  });

  it('WF1.2 — buildWholeFleetManifest emits expected shape with summed totals', () => {
    const customers = [
      makeCustomerEntry('LC-001', 'HN001', 'A', 'h1', 's1'),
      makeCustomerEntry('LC-002', 'HN002', 'B', 'h2', 's2'),
    ];
    const m = buildWholeFleetManifest({ customers, userNote: 'pre-migration', exportedAt: '2026-05-16T12:00:00.000Z', exporterUid: 'admin-uid' });
    expect(m.schemaVersion).toBe(1);
    expect(m.type).toBe('whole-fleet-customers');
    expect(m.customerCount).toBe(2);
    expect(m.customers).toHaveLength(2);
    expect(m.userNote).toBe('pre-migration');
    expect(m.exporterUid).toBe('admin-uid');
    expect(m.totals.appointmentCount).toBe(6); // 3+3
    expect(m.totals.saleCount).toBe(4); // 2+2
    expect(m.totals.treatmentCount).toBe(10); // 5+5
  });

  it('WF1.3 — computeWholeFleetManifestHash is deterministic', () => {
    const customers = [makeCustomerEntry('LC-001', 'HN001', 'A', 'h1', 's1')];
    const m1 = buildWholeFleetManifest({ customers, userNote: 'note1', exportedAt: '2026-05-16T12:00:00.000Z' });
    const m2 = buildWholeFleetManifest({ customers, userNote: 'note1', exportedAt: '2026-05-16T12:00:00.000Z' });
    expect(computeWholeFleetManifestHash(m1)).toBe(computeWholeFleetManifestHash(m2));
  });

  it('WF1.4 — manifestHash EXCLUDES userNote (Q5b=Y precedent from V74)', () => {
    const customers = [makeCustomerEntry('LC-001', 'HN001', 'A', 'h1', 's1')];
    const m1 = buildWholeFleetManifest({ customers, userNote: 'note1', exportedAt: '2026-05-16T12:00:00.000Z' });
    const m2 = buildWholeFleetManifest({ customers, userNote: 'COMPLETELY DIFFERENT NOTE', exportedAt: '2026-05-16T12:00:00.000Z' });
    expect(computeWholeFleetManifestHash(m1)).toBe(computeWholeFleetManifestHash(m2));
  });

  it('WF1.5 — manifestHash INCLUDES customer file hashes (tampering detection)', () => {
    const m1 = buildWholeFleetManifest({ customers: [makeCustomerEntry('LC-001', 'HN001', 'A', 'h1', 's1')], exportedAt: '2026-05-16T12:00:00.000Z' });
    const m2 = buildWholeFleetManifest({ customers: [makeCustomerEntry('LC-001', 'HN001', 'A', 'TAMPERED', 's1')], exportedAt: '2026-05-16T12:00:00.000Z' });
    expect(computeWholeFleetManifestHash(m1)).not.toBe(computeWholeFleetManifestHash(m2));
  });

  it('WF1.6 — manifestHash INCLUDES storage manifest hashes (image tampering detection)', () => {
    const m1 = buildWholeFleetManifest({ customers: [makeCustomerEntry('LC-001', 'HN001', 'A', 'h1', 's1')], exportedAt: '2026-05-16T12:00:00.000Z' });
    const m2 = buildWholeFleetManifest({ customers: [makeCustomerEntry('LC-001', 'HN001', 'A', 'h1', 'STORAGE-TAMPERED')], exportedAt: '2026-05-16T12:00:00.000Z' });
    expect(computeWholeFleetManifestHash(m1)).not.toBe(computeWholeFleetManifestHash(m2));
  });

  it('WF1.7 — validateWholeFleetManifest accepts valid manifest', () => {
    const m = buildWholeFleetManifest({ customers: [makeCustomerEntry('LC-001', 'HN001', 'A', 'h1', 's1')], exportedAt: '2026-05-16T12:00:00.000Z' });
    expect(validateWholeFleetManifest(m)).toEqual({ valid: true });
  });

  it('WF1.8 — validateWholeFleetManifest rejects invalid schemaVersion', () => {
    const m = { schemaVersion: 2, type: 'whole-fleet-customers', customerCount: 0, customers: [], exportedAt: 'x', totals: { appointmentCount: 0, saleCount: 0, treatmentCount: 0 } };
    expect(validateWholeFleetManifest(m).valid).toBe(false);
    expect(validateWholeFleetManifest(m).reason).toMatch(/schemaVersion/);
  });

  it('WF1.9 — validateWholeFleetManifest rejects wrong type', () => {
    const m = buildWholeFleetManifest({ customers: [], exportedAt: 'x' });
    m.type = 'customer-backup'; // single-customer V74 shape
    expect(validateWholeFleetManifest(m).valid).toBe(false);
  });

  it('WF1.10 — customerCount mismatch detected', () => {
    const m = buildWholeFleetManifest({ customers: [makeCustomerEntry('LC-001', 'HN001', 'A', 'h1', 's1')], exportedAt: 'x' });
    m.customerCount = 99;
    expect(validateWholeFleetManifest(m).valid).toBe(false);
    expect(validateWholeFleetManifest(m).reason).toMatch(/customerCount/);
  });

  it('WF1.11 — empty customer list valid (zero-customer fleet edge)', () => {
    const m = buildWholeFleetManifest({ customers: [], exportedAt: '2026-05-16T12:00:00.000Z' });
    expect(validateWholeFleetManifest(m).valid).toBe(true);
    expect(m.customerCount).toBe(0);
    expect(() => computeWholeFleetManifestHash(m)).not.toThrow();
  });

  it('WF1.12 — failedCustomers array preserved through manifest hash', () => {
    const m = buildWholeFleetManifest({
      customers: [makeCustomerEntry('LC-001', 'HN001', 'A', 'h1', 's1')],
      failedCustomers: [{ cid: 'LC-FAIL', reason: 'PRODUCT_NOT_FOUND' }],
      exportedAt: 'x',
    });
    expect(m.failedCustomers).toHaveLength(1);
    expect(m.failedCustomers[0].cid).toBe('LC-FAIL');
    // failedCustomers IS in hash seed → mutating it changes hash
    const m2 = buildWholeFleetManifest({
      customers: [makeCustomerEntry('LC-001', 'HN001', 'A', 'h1', 's1')],
      failedCustomers: [{ cid: 'LC-DIFFERENT-FAIL', reason: 'OTHER' }],
      exportedAt: 'x',
    });
    expect(computeWholeFleetManifestHash(m)).not.toBe(computeWholeFleetManifestHash(m2));
  });

  it('WF1.13 — V75 marker comment present in source', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/lib/wholeFleetBackupCore.js', 'utf8');
    expect(src).toMatch(/V75 Item 2/);
  });
});
