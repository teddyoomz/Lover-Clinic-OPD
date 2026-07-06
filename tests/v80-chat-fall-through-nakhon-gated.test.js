// V80 (2026-05-16 NIGHT+4) — chat fall-through filters NAKHON-gated.
//
// CLASS-OF-BUG: V12 multi-reader-sweep at fall-through-filter boundary.
// V76 + V77-bis closed the chat branchId WRITE side (webhook resolvers).
// V79 closed the lineEnabled/fbEnabled flag READ side (strict per-branch).
// V80 closes the LAST sibling READER family: 3 fall-through filters in
// ChatPanel.jsx that included missing-branchId docs in EVERY branch view
// (`!item.branchId || item.branchId === selectedBranchId`).
//
// User-reported NIGHT+4 (verbatim): "ตอนนี้กลายเป็นสาขา พระราม 3 กับ ทดลอง 1
// มีประวัติแชทเก่าของสาขานครราชสีมาตามภาพ". Rule R diag confirmed 7 chat_history
// docs with missing branchId leaking across all 3 branch views.
//
// Fix layers (3-deep):
//   1. Rule M backfill — 7 missing-branchId chat_history docs → NAKHON
//      (audit doc be_admin_audit/v80-chat-history-branch-backfill-*).
//   2. Reader fix — 3 fall-through filters NAKHON-gated via isLegacyNakhonBranch
//      (chat_conversations + chat_history + useChatUnread.branchScopedConvs).
//   3. Writer fix — handleResolve last-resort `''` → HARDCODED_NAKHON_BR_ID
//      (mirrors V77-bis webhook resolver pattern).
//
// ALSO COVERS V80 P0a class-of-bug (useMemo not defined in ChatPanel.jsx):
//   - hook-import drift scanner (scripts/diag-react-hook-import-drift.mjs)
//     reports 0 drift across 462 src/ + api/ files.

import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const CHAT_PANEL = path.resolve('src/components/ChatPanel.jsx');
const CHAT_BRANCH_DEFAULTS = path.resolve('src/lib/chatBranchDefaults.js');

function read(p) { return fs.readFileSync(p, 'utf8'); }

// Pure simulator of the V80 NAKHON-gated fall-through logic.
function v80FilterConvForBranch({ convs, selectedBranchId, NAKHON_BR_ID }) {
  if (!selectedBranchId) return convs;
  const isNakhon = selectedBranchId === NAKHON_BR_ID;
  return convs.filter(c =>
    (!c.branchId && isNakhon)
    || String(c.branchId) === String(selectedBranchId)
  );
}

const NAKHON = 'BR-1777873556815-26df6480';
const PRAM3 = 'BR-PRAM3-test';
const TDL1 = 'BR-TDL1-test';

describe('V80 — chat fall-through filters NAKHON-gated', () => {
  // ─────────────────────────────────────────────────────────────────────
  // GROUP A — Source-grep regression locks (4 V80 fix sites)
  // ─────────────────────────────────────────────────────────────────────
  describe('A. Source-grep contract locks for 4 V80 fix sites', () => {
    const src = read(CHAT_PANEL);

    it('A.1 — imports BOTH isLegacyNakhonBranch AND HARDCODED_NAKHON_BR_ID', () => {
      expect(src).toMatch(
        /import\s*\{\s*isLegacyNakhonBranch\s*,\s*HARDCODED_NAKHON_BR_ID\s*\}\s*from\s*['"][^'"]*chatBranchDefaults[^'"]*['"]/m
      );
    });

    it('A.2 — chat_conversations filter NAKHON-gated', () => {
      // V80 marker present
      expect(src).toMatch(/V80[^\n]*NAKHON-gated fall-through/);
      // The chat_conversations branch-scope effect now uses the gated form
      expect(src).toMatch(/!c\.branchId\s*&&\s*isLegacyNakhonBranch\(selectedBranchId\)/);
    });

    it('A.3 — chat_history filter NAKHON-gated (inside listenToChatHistoryByBranch callback)', () => {
      expect(src).toMatch(/!item\.branchId\s*&&\s*isLegacyNakhonBranch\(selectedBranchId\)/);
    });

    it('A.4 — useChatUnread.branchScopedConvs filter NAKHON-gated', () => {
      // perf P2.13 (2026-07-06): derivation moved into recompute() with a local
      // `branchId` (from branchRef) — window widened + either identifier accepted.
      // The V80 CONTRACT (legacy unstamped counts only for NAKHON) is unchanged.
      const useChatUnreadIdx = src.indexOf('useChatUnread');
      expect(useChatUnreadIdx).toBeGreaterThan(0);
      const slice = src.slice(useChatUnreadIdx, useChatUnreadIdx + 3200);
      expect(slice).toMatch(/!c\.branchId\s*&&\s*isLegacyNakhonBranch\((selectedBranchId|branchId)\)/);
    });

    it('A.5 — handleResolve writer hardcoded NAKHON fallback (V77-bis mirror)', () => {
      // The resolvedBranchId fallback chain ends with HARDCODED_NAKHON_BR_ID
      expect(src).toMatch(
        /resolvedBranchId\s*=\s*String\(\s*conv\.branchId\s*\|\|\s*selectedBranchId\s*\|\|\s*HARDCODED_NAKHON_BR_ID\s*\)/
      );
    });

    it('A.6 — branchIdSource fallback path renamed to "fallback-hardcoded-nakhon"', () => {
      expect(src).toMatch(/['"]fallback-hardcoded-nakhon['"]/);
      // Old 'unstamped' marker should be gone (no more empty-branchId writes)
      expect(src.match(/['"]unstamped['"]/g)).toBeNull();
    });

    it('A.7 — anti-regression: NO bare `!c.branchId ||` fall-through (must be NAKHON-gated)', () => {
      // The pre-V80 patterns `!c.branchId || String(c.branchId)` and
      // `!item.branchId || String(item.branchId)` MUST be gone.
      expect(src).not.toMatch(/!c\.branchId\s*\|\|\s*String\(c\.branchId\)/);
      expect(src).not.toMatch(/!item\.branchId\s*\|\|\s*String\(item\.branchId\)/);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // GROUP B — Pure simulator of fall-through filter behavior
  // ─────────────────────────────────────────────────────────────────────
  describe('B. Pure simulator — NAKHON-gated fall-through correctness', () => {
    const convs = [
      { id: 'cv-nakhon-1', branchId: NAKHON, displayName: 'A' },
      { id: 'cv-pram-1', branchId: PRAM3, displayName: 'B' },
      { id: 'cv-tdl-1', branchId: TDL1, displayName: 'C' },
      { id: 'cv-legacy-1', displayName: 'D' }, // missing branchId
      { id: 'cv-legacy-2', branchId: '', displayName: 'E' }, // empty string
      { id: 'cv-legacy-3', branchId: null, displayName: 'F' },
    ];

    it('B.1 — NAKHON view SEES its own + ALL legacy (missing/empty/null)', () => {
      const out = v80FilterConvForBranch({ convs, selectedBranchId: NAKHON, NAKHON_BR_ID: NAKHON });
      expect(out.map(c => c.id).sort()).toEqual(['cv-legacy-1', 'cv-legacy-2', 'cv-legacy-3', 'cv-nakhon-1'].sort());
    });

    it('B.2 — พระราม 3 view sees ONLY its own; legacy EXCLUDED', () => {
      const out = v80FilterConvForBranch({ convs, selectedBranchId: PRAM3, NAKHON_BR_ID: NAKHON });
      expect(out.map(c => c.id)).toEqual(['cv-pram-1']);
    });

    it('B.3 — ทดลอง 1 view sees ONLY its own; legacy EXCLUDED', () => {
      const out = v80FilterConvForBranch({ convs, selectedBranchId: TDL1, NAKHON_BR_ID: NAKHON });
      expect(out.map(c => c.id)).toEqual(['cv-tdl-1']);
    });

    it('B.4 — empty selectedBranchId returns ALL (no filtering)', () => {
      const out = v80FilterConvForBranch({ convs, selectedBranchId: '', NAKHON_BR_ID: NAKHON });
      expect(out.length).toBe(6);
    });

    it('B.5 — adversarial: branchId set but selectedBranchId is unknown string excludes everything', () => {
      const out = v80FilterConvForBranch({ convs, selectedBranchId: 'BR-UNKNOWN', NAKHON_BR_ID: NAKHON });
      expect(out.length).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // GROUP C — chatBranchDefaults.js HARDCODED_NAKHON_BR_ID stays in sync
  // ─────────────────────────────────────────────────────────────────────
  describe('C. chatBranchDefaults.js HARDCODED_NAKHON_BR_ID contract', () => {
    const src = read(CHAT_BRANCH_DEFAULTS);
    it('C.1 — exports HARDCODED_NAKHON_BR_ID literal', () => {
      expect(src).toMatch(/export\s+const\s+HARDCODED_NAKHON_BR_ID\s*=\s*['"]BR-1777873556815-26df6480['"]/);
    });
    it('C.2 — exports isLegacyNakhonBranch helper', () => {
      expect(src).toMatch(/export\s+function\s+isLegacyNakhonBranch\(/);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // GROUP D — V80 P0a useMemo import-drift class-of-bug
  // ─────────────────────────────────────────────────────────────────────
  describe('D. V80 P0a — useMemo import drift (black-screen origin)', () => {
    const src = read(CHAT_PANEL);
    it('D.1+D.2 — useMemo import/usage CONSISTENT (V80 P0a class: used-but-not-imported = black screen). perf P2.13 removed the last useMemo call → import removed too; the lock is now the consistency invariant either way', () => {
      const uses = (src.match(/\buseMemo\(/g) || []).length;
      const imported = /import\s*\{[^}]*\buseMemo\b[^}]*\}\s*from\s*['"]react['"]/m.test(src);
      if (uses > 0) expect(imported).toBe(true);   // used → MUST be imported (the V80 bug)
      else expect(imported).toBe(false);           // unused → import removed (no dead import)
    });
    it('D.3 — diag-react-hook-import-drift.mjs scanner exists (Rule P Step 3 perpetual guard)', () => {
      expect(fs.existsSync(path.resolve('scripts/diag-react-hook-import-drift.mjs'))).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // GROUP E — V80 Rule M backfill script contract
  // ─────────────────────────────────────────────────────────────────────
  describe('E. V80 Rule M backfill script — decideBackfillAction + patch shape', () => {
    it('E.1 — script file exists', () => {
      expect(fs.existsSync(path.resolve('scripts/v80-backfill-chat-history-missing-branchid.mjs'))).toBe(true);
    });
    it('E.2 — exports decideBackfillAction + buildBackfillPatch', () => {
      const src = read(path.resolve('scripts/v80-backfill-chat-history-missing-branchid.mjs'));
      expect(src).toMatch(/export function decideBackfillAction/);
      expect(src).toMatch(/export function buildBackfillPatch/);
    });
    it('E.3 — uses two-phase --apply gate', () => {
      const src = read(path.resolve('scripts/v80-backfill-chat-history-missing-branchid.mjs'));
      expect(src).toMatch(/process\.argv\.includes\(['"]--apply['"]\)/);
    });
    it('E.4 — emits audit doc to be_admin_audit/', () => {
      const src = read(path.resolve('scripts/v80-backfill-chat-history-missing-branchid.mjs'));
      expect(src).toMatch(/be_admin_audit/);
    });
    it('E.5 — stamps forensic trail (_v80BackfilledAt + _v80BackfillReason)', () => {
      const src = read(path.resolve('scripts/v80-backfill-chat-history-missing-branchid.mjs'));
      expect(src).toMatch(/_v80BackfilledAt/);
      expect(src).toMatch(/_v80BackfillReason/);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // GROUP F — decideBackfillAction pure behavior
  // ─────────────────────────────────────────────────────────────────────
  describe('F. decideBackfillAction pure helper', () => {
    // Lazy import to avoid Firebase init at module load
    let decideBackfillAction;
    beforeAll(async () => {
      ({ decideBackfillAction } = await import('../scripts/v80-backfill-chat-history-missing-branchid.mjs'));
    });

    it('F.1 — missing branchId → backfill', () => {
      expect(decideBackfillAction({})).toBe('backfill');
    });
    it('F.2 — null branchId → backfill', () => {
      expect(decideBackfillAction({ branchId: null })).toBe('backfill');
    });
    it('F.3 — empty string branchId → backfill', () => {
      expect(decideBackfillAction({ branchId: '' })).toBe('backfill');
    });
    it('F.4 — set branchId → skip', () => {
      expect(decideBackfillAction({ branchId: 'BR-XYZ' })).toBe('skip-already-stamped');
    });
    it('F.5 — NAKHON branchId → skip (idempotency)', () => {
      expect(decideBackfillAction({ branchId: NAKHON })).toBe('skip-already-stamped');
    });
  });
});

