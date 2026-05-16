// V75 Item 3 Rule M — chat_conversations branchId backfill helper unit tests.

import { describe, it, expect } from 'vitest';
import {
  decideBackfillAction,
  buildBackfillPatch,
} from '../scripts/v75-backfill-chat-conversations-branchid.mjs';

describe('V75 Item 3 Rule M — chat_conversations branchId backfill helpers', () => {
  const defaultBranchId = 'BR-NAKHON';

  it('BF1.1 — missing branchId → backfill', () => {
    const action = decideBackfillAction({ docId: 'CHAT-1', data: { lineUserId: 'U1' }, defaultBranchId });
    expect(action).toBe('backfill');
  });

  it('BF1.2 — branchId already === default → skip-already-stamped', () => {
    const action = decideBackfillAction({ docId: 'CHAT-1', data: { branchId: 'BR-NAKHON' }, defaultBranchId });
    expect(action).toBe('skip-already-stamped');
  });

  it('BF1.3 — branchId !== default (manual prior set) → skip-mismatch (no clobber)', () => {
    const action = decideBackfillAction({ docId: 'CHAT-1', data: { branchId: 'BR-OTHER' }, defaultBranchId });
    expect(action).toBe('skip-mismatch');
  });

  it('BF1.4 — empty-string branchId field → backfill', () => {
    const action = decideBackfillAction({ docId: 'CHAT-1', data: { branchId: '' }, defaultBranchId });
    expect(action).toBe('backfill');
  });

  it('BF1.5 — buildBackfillPatch shape', () => {
    const patch = buildBackfillPatch({ docId: 'CHAT-1', defaultBranchId });
    expect(patch.branchId).toBe('BR-NAKHON');
    expect(patch.branchIdSource).toBe('backfill-v75-sole-active');
    expect(patch._v75BranchBackfilledFrom).toBe(null);
    expect(patch._v75BackfillReason).toBe('sole-active-branch-snapshot');
  });

  it('BF1.6 — adversarial: defaultBranchId empty → throw', () => {
    expect(() => buildBackfillPatch({ docId: 'CHAT-1', defaultBranchId: '' })).toThrow(/defaultBranchId/);
  });

  it('BF1.7 — adversarial: Thai unicode docId preserved + patch still valid', () => {
    const patch = buildBackfillPatch({ docId: 'CHAT-ทดสอบ-ไทย', defaultBranchId });
    expect(patch.branchId).toBe('BR-NAKHON');
  });

  it('BF1.8 — idempotent: backfill action on stamped doc returns skip', () => {
    const firstAction = decideBackfillAction({ docId: 'CHAT-1', data: { branchId: '' }, defaultBranchId });
    expect(firstAction).toBe('backfill');
    // Simulate post-stamp re-run
    const afterStamp = { branchId: 'BR-NAKHON', branchIdSource: 'backfill-v75-sole-active' };
    const secondAction = decideBackfillAction({ docId: 'CHAT-1', data: afterStamp, defaultBranchId });
    expect(secondAction).toBe('skip-already-stamped');
  });

  it('BF1.9 — non-string branchId field treated as empty → backfill', () => {
    const action = decideBackfillAction({ docId: 'CHAT-1', data: { branchId: 12345 }, defaultBranchId });
    expect(action).toBe('backfill');
  });

  it('BF1.10 — null data passed → backfill (no crash)', () => {
    expect(() => decideBackfillAction({ docId: 'CHAT-1', data: null, defaultBranchId })).not.toThrow();
    expect(decideBackfillAction({ docId: 'CHAT-1', data: null, defaultBranchId })).toBe('backfill');
  });

  it('BF1.11 — script file present and contains V75 marker', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('scripts/v75-backfill-chat-conversations-branchid.mjs', 'utf8');
    expect(src).toMatch(/V75 Item 3 Rule M/);
    expect(src).toMatch(/be_admin_audit/);
    expect(src).toMatch(/--apply/);
  });
});
