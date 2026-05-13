// Phase 27.0 Task 8 — migration helper unit tests (V27.0)
import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase-admin/app', () => ({
  initializeApp: vi.fn(),
  cert: vi.fn(),
}));
vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(),
  FieldValue: { serverTimestamp: () => 'SERVER_TIMESTAMP_SENTINEL' },
  Timestamp: { now: vi.fn() },
}));

import {
  decideBackfillAction,
  buildBackfillPatch,
} from '../scripts/phase-27-0-backfill-treatment-branch-id.mjs';

describe('M1 — migration decision logic', () => {
  it('M1.1 already has branchId → SKIP', () => {
    expect(decideBackfillAction({ detail: { branchId: 'BR-A' } }, { branchId: 'BR-X' })).toBe('skip-already-set');
  });
  it('M1.2 missing branchId + customer has branchId → BACKFILL', () => {
    expect(decideBackfillAction({ detail: {} }, { branchId: 'BR-A' })).toBe('backfill');
  });
  it('M1.3 missing branchId + customer empty → SKIP-NO-HEURISTIC', () => {
    expect(decideBackfillAction({ detail: {} }, { branchId: '' })).toBe('skip-no-heuristic');
  });
  it('M1.4 missing branchId + customer null → SKIP-NO-HEURISTIC', () => {
    expect(decideBackfillAction({ detail: {} }, null)).toBe('skip-no-heuristic');
  });
  it('M1.5 empty-string branchId on detail → BACKFILL (treats as missing)', () => {
    expect(decideBackfillAction({ detail: { branchId: '' } }, { branchId: 'BR-A' })).toBe('backfill');
  });
  it('M1.6 patch shape includes forensic-trail fields', () => {
    const patch = buildBackfillPatch({
      newBranchId: 'BR-A',
      newBranchName: 'นครราชสีมา',
      prevBranchId: undefined,
    });
    expect(patch['detail.branchId']).toBe('BR-A');
    expect(patch['detail.branchName']).toBe('นครราชสีมา');
    expect(patch['detail._branchIdBackfilledFrom']).toBe('customer.branchId');
    expect(patch['detail._branchIdBackfilledLegacyValue']).toBe(null);
    expect(patch).toHaveProperty('detail._branchIdBackfilledAt');
  });
});
