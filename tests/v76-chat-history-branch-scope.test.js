// tests/v76-chat-history-branch-scope.test.js
// V76 (2026-05-16 EOD+1) — chat_history BSA + AV59 regression bank.
//
// Class-of-bug: V12 multi-reader-sweep — V75 wired chat_conversations BSA
// (BS-17 + AV57) but completely missed the SIBLING chat_history reader +
// writer. Result: 3,281 legacy chat_history docs unstamped, ChatPanel
// history view leaked across branches (user-reported).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import {
  decideBackfillAction,
  buildBackfillPatch,
} from '../scripts/v76-backfill-chat-history-branchid.mjs';

describe('V76 — chat_history BSA + AV59 source-grep regression', () => {
  describe('V76.A — backendClient Layer 1 (listenToChatHistoryByBranch)', () => {
    const src = fs.readFileSync('src/lib/backendClient.js', 'utf8');

    it('A.1 — exports listenToChatHistoryByBranch', () => {
      expect(src).toMatch(/export function listenToChatHistoryByBranch/);
    });

    it('A.2 — safe-by-default: empty branchId + !allBranches → empty + noop', () => {
      const block = src.match(/export function listenToChatHistoryByBranch[\s\S]{0,1200}?^}/m);
      expect(block).not.toBeNull();
      expect(block[0]).toMatch(/if\s*\(!effectiveBranchId\s*&&\s*!allBranches\)/);
      expect(block[0]).toMatch(/onChange\(\[\]\)/);
    });

    it('A.3 — applies Firestore where(branchId,==,X) when branch-scoped', () => {
      const block = src.match(/export function listenToChatHistoryByBranch[\s\S]{0,1200}?^}/m);
      expect(block[0]).toMatch(/where\(['"]branchId['"],\s*['"]==['"]/);
    });

    it('A.4 — reads from artifacts/{appId}/public/data/chat_history (canonical path)', () => {
      const block = src.match(/export function listenToChatHistoryByBranch[\s\S]{0,1200}?^}/m);
      expect(block[0]).toMatch(/chat_history/);
    });

    it('A.5 — V76 marker comment present near listener', () => {
      // Multiline window around the new export — V76 marker may be 1-5 lines above
      const window = src.match(/V76[\s\S]{0,400}listenToChatHistoryByBranch/);
      expect(window).not.toBeNull();
    });
  });

  describe('V76.B — scopedDataLayer Layer 2 wrapper', () => {
    const src = fs.readFileSync('src/lib/scopedDataLayer.js', 'utf8');

    it('B.1 — exports listenToChatHistoryByBranch wrapper', () => {
      expect(src).toMatch(/export const listenToChatHistoryByBranch\s*=/);
    });

    it('B.2 — auto-injects resolveSelectedBranchId() when caller passes {}', () => {
      const block = src.match(/export const listenToChatHistoryByBranch[\s\S]{0,500}?\};/m);
      expect(block).not.toBeNull();
      expect(block[0]).toMatch(/resolveSelectedBranchId/);
    });

    it('B.3 — explicit branchId OR allBranches:true bypasses auto-inject', () => {
      const block = src.match(/export const listenToChatHistoryByBranch[\s\S]{0,500}?\};/m);
      expect(block[0]).toMatch(/hasExplicitBranchId/);
      expect(block[0]).toMatch(/isAllBranches/);
    });

    it('B.4 — delegates to raw.listenToChatHistoryByBranch', () => {
      // Block extends to the return + raw call before the closing brace
      const block = src.match(/export const listenToChatHistoryByBranch[\s\S]{0,800}?return raw\.\w+\([\s\S]{0,200}?\};/m);
      expect(block).not.toBeNull();
      expect(block[0]).toMatch(/raw\.listenToChatHistoryByBranch/);
    });

    it('B.5 — V76 marker comment present in wrapper block', () => {
      const block = src.match(/V76[\s\S]{0,200}listenToChatHistoryByBranch|listenToChatHistoryByBranch[\s\S]{0,200}V76/m);
      expect(block).not.toBeNull();
    });
  });

  describe('V76.C — ChatPanel reader migration (BS-17 extension)', () => {
    const src = fs.readFileSync('src/components/ChatPanel.jsx', 'utf8');

    it('C.1 — imports listenToChatHistoryByBranch from scopedDataLayer', () => {
      expect(src).toMatch(/listenToChatHistoryByBranch.*scopedDataLayer|scopedDataLayer.*listenToChatHistoryByBranch/);
    });

    it('C.2 — history listener uses listenToChatHistoryByBranch (NOT raw onSnapshot)', () => {
      // Find the showHistory listener block
      const block = src.match(/if\s*\(!showHistory\)\s*return;[\s\S]{0,1500}?\}, \[showHistory[\s\S]{0,200}?\]\);/m);
      expect(block).not.toBeNull();
      expect(block[0]).toMatch(/listenToChatHistoryByBranch/);
    });

    it('C.3 — history listener deps include selectedBranchId (BS-9 refresh discipline)', () => {
      const block = src.match(/if\s*\(!showHistory\)\s*return;[\s\S]{0,1500}?\}, \[(showHistory[^\]]*)\]\);/m);
      expect(block).not.toBeNull();
      expect(block[1]).toMatch(/selectedBranchId/);
    });

    it('C.4 — V76 marker comment in history listener block', () => {
      expect(src).toMatch(/V76[\s\S]{0,300}chat_history|chat_history[\s\S]{0,300}V76/m);
    });

    it('C.5 — handleResolve stamps branchId on chat_history doc (AV59)', () => {
      const block = src.match(/Save minimal history record[\s\S]{0,1500}?addDoc\(historyRef, historyData\);/m);
      expect(block).not.toBeNull();
      expect(block[0]).toMatch(/branchId:\s*resolvedBranchId/);
      expect(block[0]).toMatch(/branchIdSource/);
    });

    it('C.6 — fallback chain conv.branchId → selectedBranchId → empty', () => {
      const block = src.match(/Save minimal history record[\s\S]{0,1500}?addDoc\(historyRef, historyData\);/m);
      // resolvedBranchId computed via conv.branchId || selectedBranchId || ''
      expect(block[0]).toMatch(/conv\.branchId\s*\|\|\s*selectedBranchId/);
    });

    it('C.7 — branchIdSource attribution distinguishes inherited vs admin-resolved', () => {
      const block = src.match(/Save minimal history record[\s\S]{0,1500}?addDoc\(historyRef, historyData\);/m);
      expect(block[0]).toMatch(/inherited-from-conv|resolved-by-admin-branch|unstamped/);
    });
  });

  describe('V76.D — backfill helpers (Rule M canonical)', () => {
    it('D.1 — decideBackfillAction returns "backfill" when no branchId', () => {
      expect(decideBackfillAction({
        docId: 'h1',
        data: { convId: 'fb_x', lastMessage: 'hi' },
        defaultBranchId: 'BR-NAKHON',
      })).toBe('backfill');
    });

    it('D.2 — decideBackfillAction returns "skip-already-stamped" on match', () => {
      expect(decideBackfillAction({
        docId: 'h1',
        data: { branchId: 'BR-NAKHON' },
        defaultBranchId: 'BR-NAKHON',
      })).toBe('skip-already-stamped');
    });

    it('D.3 — decideBackfillAction returns "skip-mismatch" on different existing branchId (no clobber)', () => {
      expect(decideBackfillAction({
        docId: 'h1',
        data: { branchId: 'BR-OTHER' },
        defaultBranchId: 'BR-NAKHON',
      })).toBe('skip-mismatch');
    });

    it('D.4 — buildBackfillPatch carries forensic-trail fields + V76 attribution', () => {
      const patch = buildBackfillPatch({ docId: 'h1', defaultBranchId: 'BR-NAKHON' });
      expect(patch.branchId).toBe('BR-NAKHON');
      expect(patch.branchIdSource).toBe('backfill-v76-sole-active');
      expect(patch._v76BackfillReason).toBe('sole-active-branch-snapshot-history');
    });

    it('D.5 — buildBackfillPatch throws on missing defaultBranchId', () => {
      expect(() => buildBackfillPatch({ docId: 'h1', defaultBranchId: '' })).toThrow();
    });
  });

  describe('V76.E — AV59 invariant cross-link', () => {
    it('E.1 — AV59 entry referenced in audit-anti-vibe-code SKILL.md (or inline comment)', () => {
      // Either AV59 lands in the skill file OR the source has the marker
      const skillExists = fs.existsSync('.agents/skills/audit-anti-vibe-code/SKILL.md');
      if (skillExists) {
        const skill = fs.readFileSync('.agents/skills/audit-anti-vibe-code/SKILL.md', 'utf8');
        // AV59 may not be in skill yet (added in this same commit), but should reference V76
        expect(skill).toMatch(/AV59|V76 chat_history|chat_history branchId/);
      }
    });

    it('E.2 — backfill script has Rule M invocation guard', () => {
      const src = fs.readFileSync('scripts/v76-backfill-chat-history-branchid.mjs', 'utf8');
      expect(src).toMatch(/process\.argv\[1\]\s*===\s*fileURLToPath/);
    });

    it('E.3 — backfill script supports --apply two-phase + --branch-id override', () => {
      const src = fs.readFileSync('scripts/v76-backfill-chat-history-branchid.mjs', 'utf8');
      expect(src).toMatch(/--apply/);
      expect(src).toMatch(/--branch-id=/);
      expect(src).toMatch(/DRY-RUN/);
    });

    it('E.4 — backfill script emits audit doc on --apply with V76 marker', () => {
      const src = fs.readFileSync('scripts/v76-backfill-chat-history-branchid.mjs', 'utf8');
      expect(src).toMatch(/be_admin_audit/);
      expect(src).toMatch(/v76-chat-history-branchid-backfill/);
    });
  });

  describe('V76.F — class-of-bug expansion verification (Rule P)', () => {
    it('F.1 — NO other chat_history listener in src/ (sibling reader exhaustive check)', () => {
      function walk(dir, list = []) {
        if (!fs.existsSync(dir)) return list;
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = `${dir}/${ent.name}`;
          if (ent.isDirectory()) walk(full, list);
          else if (/\.(js|jsx|ts|tsx)$/.test(ent.name)) list.push(full);
        }
        return list;
      }
      const files = walk('src');
      const SANCTIONED = [
        'src/components/ChatPanel.jsx',       // V76-migrated consumer
        'src\\components\\ChatPanel.jsx',
        'src/lib/backendClient.js',           // Layer 1 helper home
        'src\\lib\\backendClient.js',
        'src/lib/scopedDataLayer.js',         // Layer 2 wrapper home
        'src\\lib\\scopedDataLayer.js',
      ];
      const offenders = [];
      for (const f of files) {
        if (SANCTIONED.includes(f.replace(/^.\//, '').replace(/^F:\\LoverClinic-app[\\\/]/, ''))) continue;
        if (SANCTIONED.some(s => f.endsWith(s))) continue;
        const src = fs.readFileSync(f, 'utf8');
        if (/chat_history/.test(src) && /onSnapshot|query.*orderBy.*resolvedAt/.test(src)) {
          offenders.push(f);
        }
      }
      expect(offenders).toEqual([]);
    });

    it('F.2 — handleResolve is the ONLY chat_history writer in src/', () => {
      function walk(dir, list = []) {
        if (!fs.existsSync(dir)) return list;
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = `${dir}/${ent.name}`;
          if (ent.isDirectory()) walk(full, list);
          else if (/\.(js|jsx|ts|tsx)$/.test(ent.name)) list.push(full);
        }
        return list;
      }
      const files = walk('src');
      const writers = [];
      for (const f of files) {
        const src = fs.readFileSync(f, 'utf8');
        // addDoc / setDoc on chat_history collection ref
        if (/(addDoc|setDoc)\([^)]*chat_history/.test(src)) {
          writers.push(f);
        }
      }
      // Only ChatPanel.jsx handleResolve writes
      expect(writers.length).toBeLessThanOrEqual(1);
      if (writers.length === 1) expect(writers[0]).toMatch(/ChatPanel\.jsx$/);
    });
  });
});
