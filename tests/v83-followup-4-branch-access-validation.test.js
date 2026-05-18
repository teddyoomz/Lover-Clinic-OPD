// ─── V83-followup-4 — BranchProvider access validation (EOD8 LATE 2026-05-18) ─
// User: "User เข้าได้แต่สาขานครราชสีมา แต่แชทที่เปิดมากลับเป็นสาขาทดลอง 1
// กด refresh แล้วก็ไม่หาย ช่วยทำให้ แชทผูกกับ Branch selector แบบจริงๆ".
//
// Root cause: BranchProvider.selectionStillValid only checked branch EXISTS
// in be_branches snapshot, not whether user has ACCESS. localStorage retained
// a branch ID from a prior session when user had access; access was later
// removed but stored ID stayed. selectedBranchId = stored (now inaccessible).
// BranchSelector (uses access-filtered useUserScopedBranches) showed correct
// accessible branch; StaffChatWidget (uses full useSelectedBranch + branches.
// find) showed the stale branch. UI divergence.
//
// Fix: pure helper logic — selectionStillValid additionally verifies
// staffAccessible includes stored. accessOpen (empty staffAccessible) = "all
// branches" bootstrap admin / legacy → stored is always valid.
//
// This test mirrors the selectionStillValid logic in BranchContext.jsx and
// asserts the V83-followup-4 contract via the same shape.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Pure mirror of post-V83-followup-4 selection-validation logic
function computeSelectionStillValid({ stored, list, staffAccessible }) {
  if (!stored) return false;
  if (!Array.isArray(list) || list.length === 0) return false;
  const existsInList = list.some((b) => String(b.branchId || b.id) === String(stored));
  if (!existsInList) return false;
  const accessOpen = !Array.isArray(staffAccessible) || staffAccessible.length === 0;
  if (accessOpen) return true;
  return staffAccessible.includes(String(stored));
}

describe('V83-followup-4 — BranchProvider access validation', () => {
  const NAKHON = 'BR-1777873556815-26df6480';
  const TRIAL_1 = 'BR-TRIAL-1';
  const TRIAL_2 = 'BR-TRIAL-2';
  const ALL_BRANCHES = [
    { id: NAKHON,  name: 'นครราชสีมา' },
    { id: TRIAL_1, name: 'ทดลอง 1' },
    { id: TRIAL_2, name: 'ทดลอง 2' },
  ];

  describe('V1 — Access closed (staff.branchIds non-empty)', () => {
    const accessible = [NAKHON];

    it('V1.1 — stored = accessible branch → valid', () => {
      expect(computeSelectionStillValid({
        stored: NAKHON, list: ALL_BRANCHES, staffAccessible: accessible,
      })).toBe(true);
    });

    it('V1.2 — USER BUG REPRO — stored = inaccessible branch (in list) → INVALID', () => {
      expect(computeSelectionStillValid({
        stored: TRIAL_1, list: ALL_BRANCHES, staffAccessible: accessible,
      })).toBe(false);
    });

    it('V1.3 — stored = deleted branch (not in list) → invalid', () => {
      expect(computeSelectionStillValid({
        stored: 'BR-DELETED', list: ALL_BRANCHES, staffAccessible: accessible,
      })).toBe(false);
    });

    it('V1.4 — stored = empty → invalid', () => {
      expect(computeSelectionStillValid({
        stored: '', list: ALL_BRANCHES, staffAccessible: accessible,
      })).toBe(false);
    });

    it('V1.5 — multi-branch access — stored = one of accessible → valid', () => {
      expect(computeSelectionStillValid({
        stored: TRIAL_1, list: ALL_BRANCHES, staffAccessible: [NAKHON, TRIAL_1],
      })).toBe(true);
    });

    it('V1.6 — multi-branch access — stored = NOT in accessible → invalid', () => {
      expect(computeSelectionStillValid({
        stored: TRIAL_2, list: ALL_BRANCHES, staffAccessible: [NAKHON, TRIAL_1],
      })).toBe(false);
    });
  });

  describe('V2 — Access open (bootstrap admin / legacy)', () => {
    it('V2.1 — empty staffAccessible + any stored in list → valid', () => {
      expect(computeSelectionStillValid({
        stored: TRIAL_1, list: ALL_BRANCHES, staffAccessible: [],
      })).toBe(true);
    });

    it('V2.2 — undefined staffAccessible + any stored in list → valid', () => {
      expect(computeSelectionStillValid({
        stored: TRIAL_2, list: ALL_BRANCHES, staffAccessible: undefined,
      })).toBe(true);
    });

    it('V2.3 — empty staffAccessible + stored NOT in list → invalid', () => {
      expect(computeSelectionStillValid({
        stored: 'BR-NOT-EXIST', list: ALL_BRANCHES, staffAccessible: [],
      })).toBe(false);
    });
  });

  describe('V3 — Edge cases', () => {
    it('V3.1 — list empty → invalid regardless of stored/access', () => {
      expect(computeSelectionStillValid({
        stored: NAKHON, list: [], staffAccessible: [NAKHON],
      })).toBe(false);
    });

    it('V3.2 — stored vs accessible string-vs-number coerced via String()', () => {
      expect(computeSelectionStillValid({
        stored: '12345', list: [{ id: 12345, name: 'X' }], staffAccessible: ['12345'],
      })).toBe(true);
    });
  });

  describe('V4 — Source-grep regression lock', () => {
    const SOURCE = readFileSync(
      join(process.cwd(), 'src/lib/BranchContext.jsx'),
      'utf8'
    );

    it('V4.1 — BranchContext computes accessOpen + storedIsAccessible', () => {
      expect(SOURCE).toMatch(/accessOpen/);
      expect(SOURCE).toMatch(/storedIsAccessible/);
    });

    it('V4.2 — selectionStillValid clause includes storedIsAccessible', () => {
      // Anti-regression: pre-fix shape was only `list.some(...)` — now AND with storedIsAccessible
      expect(SOURCE).toMatch(/selectionStillValid\s*=\s*[^;]*storedIsAccessible/s);
    });

    it('V4.3 — V83-followup-4 marker present', () => {
      expect(SOURCE).toMatch(/V83-followup-4/);
    });
  });
});
