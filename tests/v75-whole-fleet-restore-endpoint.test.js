// tests/v75-whole-fleet-restore-endpoint.test.js
// V75 Item 2 — /api/admin/whole-fleet-customer-restore source-shape tests.
// Targets: action modes + manifestHash verification + per-customer
// failure isolation + Q3=B SAFE conflict resolution + audit doc emit.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';

const mockVerifyAdminToken = vi.fn();
vi.mock('../api/admin/_lib/adminAuth.js', () => ({
  verifyAdminToken: mockVerifyAdminToken,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function makeRes() {
  return {
    setHeader: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    end: vi.fn().mockReturnThis(),
  };
}

describe('V75 Item 2 — /api/admin/whole-fleet-customer-restore endpoint', () => {
  it('WFR1.1 — rejects non-admin (verifyAdminToken returns null → 401/403 written)', async () => {
    mockVerifyAdminToken.mockImplementationOnce(async (_req, res) => {
      res.status(401).json({ ok: false, error: 'Unauthorized' });
      return null;
    });
    const { default: handler } = await import('../api/admin/whole-fleet-customer-restore.js');
    const req = { method: 'POST', headers: {}, body: { action: 'preview', backupRef: 'x' } };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('WFR1.2 — non-POST method returns 405', async () => {
    const { default: handler } = await import('../api/admin/whole-fleet-customer-restore.js');
    const req = { method: 'GET', headers: {}, body: {} };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('WFR1.3 — preview mode branch exists in source (no writes, returns conflict summary)', () => {
    const src = fs.readFileSync('api/admin/whole-fleet-customer-restore.js', 'utf8');
    expect(src).toMatch(/action\s*===?\s*['"]preview['"]/);
    expect(src).toMatch(/wouldRestore/);
    expect(src).toMatch(/wouldSkipBlocked/);
    expect(src).toMatch(/wouldStripLine/);
  });

  it('WFR1.4 — restore mode verifies manifestHash via computeWholeFleetManifestHash', () => {
    const src = fs.readFileSync('api/admin/whole-fleet-customer-restore.js', 'utf8');
    expect(src).toMatch(/computeWholeFleetManifestHash/);
    expect(src).toMatch(/WHOLE_FLEET_MANIFEST_TAMPERED/);
    // confirmManifestHash is required + compared
    expect(src).toMatch(/confirmManifestHash/);
  });

  it('WFR1.5 — per-customer Q3=B SAFE conflict resolution (scanRestoreConflicts + stripLineConflicts)', () => {
    const src = fs.readFileSync('api/admin/whole-fleet-customer-restore.js', 'utf8');
    expect(src).toMatch(/scanRestoreConflicts/);
    expect(src).toMatch(/stripLineConflicts/);
    // CUSTOMER_ID_EXISTS + HN_COLLISION block (Q3=B)
    expect(src).toMatch(/CUSTOMER_ID_EXISTS/);
    expect(src).toMatch(/HN_COLLISION/);
  });

  it('WFR1.6 — aggregate result shape {restored, skippedConflict, failed, perCustomer}', () => {
    const src = fs.readFileSync('api/admin/whole-fleet-customer-restore.js', 'utf8');
    // Counters declared + present in response object (shorthand or explicit)
    expect(src).toMatch(/let\s+restored\s*=\s*0/);
    expect(src).toMatch(/let\s+skippedConflict\s*=\s*0/);
    expect(src).toMatch(/let\s+failed\s*=\s*0/);
    expect(src).toMatch(/restored\+\+/);
    expect(src).toMatch(/skippedConflict\+\+/);
    expect(src).toMatch(/failed\+\+/);
    expect(src).toMatch(/perCustomer/);
  });

  it('WFR1.7 — emits audit doc + V75 marker', () => {
    const src = fs.readFileSync('api/admin/whole-fleet-customer-restore.js', 'utf8');
    expect(src).toMatch(/be_admin_audit/);
    expect(src).toMatch(/V75 Item 2/);
    expect(src).toMatch(/whole-fleet-customer-restore/);
    // Parent batch audit id pattern
    expect(src).toMatch(/parentBatchAuditId|whole-fleet-restore-/);
  });

  it('WFR1.8 — per-customer failure isolation (one customer fail does NOT abort batch)', () => {
    const src = fs.readFileSync('api/admin/whole-fleet-customer-restore.js', 'utf8');
    // V122 (2026-05-26): the per-customer LOAD phase was parallelized
    // (mapWithConcurrency over fleetEntries=manifest.customers) — each entry's
    // load is wrapped in try/catch returning {ok:false}; the decision+restore
    // loop stays SEQUENTIAL (for...of loadedEntries) with its OWN try/catch →
    // failed++. A single customer failure (load OR restore) still does NOT abort
    // the batch — isolation is now in BOTH phases. Same intent, new structure.
    expect(src).toMatch(/mapWithConcurrency\(fleetEntries/);            // Phase A: parallel load
    expect(src).toMatch(/loadAndVerifyPerCustomer/);                    // per-customer load
    expect(src).toMatch(/ok:\s*false/);                                 // Phase A per-entry isolation → {ok:false}
    expect(src).toMatch(/for\s*\(\s*const\s+L\s+of\s+loadedEntries/);   // Phase B: sequential decide+restore
    expect(src).toMatch(/catch\s*\(\s*err\s*\)[\s\S]{0,100}?failed\+\+/); // Phase B per-entry isolation
  });

  it('WFR1.9 — uses canonical adminAuth import path + V74 customer helpers', () => {
    const src = fs.readFileSync('api/admin/whole-fleet-customer-restore.js', 'utf8');
    expect(src).toMatch(/from\s+['"]\.\/_lib\/adminAuth\.js['"]/);
    expect(src).toMatch(/customerBackupSchema/);
    expect(src).toMatch(/customerBackupConflict/);
    expect(src).toMatch(/branchBackupSchema/);
    expect(src).toMatch(/wholeFleetBackupCore/);
    expect(src).toMatch(/customerBackupCore/);
  });

  it('WFR1.10 — restore loop writes batch + Storage copy (mirrors V74 customer-restore)', () => {
    const src = fs.readFileSync('api/admin/whole-fleet-customer-restore.js', 'utf8');
    // Batch chunking at 450 (Firestore limit)
    expect(src).toMatch(/450/);
    expect(src).toMatch(/batchOp\.commit/);
    // Storage copy back to canonical paths
    expect(src).toMatch(/\.copy\(/);
  });

  it('WFR1.11 — missing fields handled (no backupRef → 400; missing confirmManifestHash on restore → 400)', () => {
    const src = fs.readFileSync('api/admin/whole-fleet-customer-restore.js', 'utf8');
    expect(src).toMatch(/MISSING_BACKUP_REF/);
    expect(src).toMatch(/MISSING_CONFIRM_MANIFEST_HASH/);
  });
});
