// AV98 — ED modals must portal to document.body (2026-06-19).
//
// Bug (reported by user, recurring class): the per-question ED detail modal
// "showed only inside its own box" — EDScoreBox renders <EDDetailModal/> INSIDE
// its own rounded-xl card (cardCls), and the V86 auto-glow (index.css ~4043) makes
// EVERY rounded-xl/2xl card in [data-backend-menu-mode="new"] [data-testid="backend-content"]
// a containing block for position:fixed descendants (transform-bearing glow/hover).
// So the fixed-inset-0 modal was confined to the EDScoreBox card box instead of the
// viewport. The fix is the AV98-canonical one (recall V80, appt-popover): the modal
// portals to document.body so it escapes the transformed ancestor.
//
// Why this slipped through: the existing AV98 regression test
// (recall-modal-portal-and-header-dedup.test.js) is RECALL-DIR-SCOPED — it never
// guarded the ED modals (shipped 2026-06-15/18, after AV98 at V80). This file
// closes that gap for the ED feature + a card-spawn registry forward guard.
//
// Census (2026-06-19, /systematic-debugging): EDDetailModal was the LONE currently-
// trapped instance. Every other overlay modal renders at a tab/panel/page ROOT as a
// SIBLING of (not a descendant of) rounded cards — verified e.g. WalletPanel root =
// <div className="space-y-4"> with its modals at lines 232/245/257 as siblings of the
// rounded toolbar card; FinanceTab/DepositPanel/PointsPanel/MembershipPanel same;
// OrderPanel / report-tab / TFP roots likewise. The AV98 entry's sanctioned-exceptions
// list already documents this. EDScoreBox is the UNIQUE case: a component whose ROOT
// IS a rounded card that spawns a modal inside it.
//
// A universal "overlay nested inside a rounded card" static walk was deliberately NOT
// added: detecting JSX descendant-nesting via regex is false-positive-prone (a .map()
// callback that returns a rounded card, or a rounded child card, trips it — proven on
// WalletPanel/PointsPanel/SaleInsuranceClaimsTab/LineReminderHistoryPanel, all of which
// are verified-safe). The reliable guard is the per-modal portal lock (A) + the curated
// card-spawn registry (C): a NEW card component that spawns an overlay modal is a
// conscious addition there.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repo = join(__dirname, '..');
const read = (rel) => readFileSync(join(repo, rel), 'utf8');

// The ED overlay modals — rendered inside / spawnable from a backend glow card.
const ED_MODAL_FILES = [
  'src/components/backend/EDDetailModal.jsx',
  'src/components/backend/EDFollowupModal.jsx',
];

// =============================================================================
describe('A. ED modals portal to document.body (escape the V86 glow-card containing block)', () => {
  for (const rel of ED_MODAL_FILES) {
    const name = rel.split('/').pop();
    const src = read(rel);
    it(`A.${name} imports createPortal from react-dom`, () => {
      expect(src).toMatch(/import\s*\{\s*createPortal\s*\}\s*from\s*'react-dom'/);
    });
    it(`A.${name} returns via createPortal(...)`, () => {
      expect(src).toMatch(/return createPortal\(/);
    });
    it(`A.${name} portals into document.body`, () => {
      expect(src).toMatch(/document\.body\s*,?\s*\)\s*;/);
    });
    it(`A.${name} has NO bare \`return (\` with a fixed-inset-0 overlay root (anti-regression)`, () => {
      // The fixed-inset-0 overlay MUST be the createPortal child, not a direct
      // `return ( <div className="fixed inset-0 ...` (which leaves it in-tree,
      // hijack-able by a transformed ancestor — the exact pre-fix shape).
      expect(src).not.toMatch(/return \(\s*(?:\/\/[^\n]*\n\s*)?<div\s+className="fixed inset-0/);
    });
  }
});

// =============================================================================
describe('B. EDScoreBox card-nesting trap is neutralized by the portal', () => {
  const box = read('src/components/backend/EDScoreBox.jsx');
  it('B.1 EDScoreBox renders the detail modal AS A DESCENDANT of its own rounded-xl card (the trap)', () => {
    expect(box).toMatch(/cardCls\s*=\s*['"][^'"]*rounded-xl[^'"]*['"]/); // root is a rounded card
    expect(box).toMatch(/<EDDetailModal\b/);                            // spawns the modal inside it
  });
  it('B.2 EDDetailModal portals → so even though EDScoreBox nests it in a card, it escapes', () => {
    expect(read('src/components/backend/EDDetailModal.jsx')).toMatch(/return createPortal\(/);
  });
});

// =============================================================================
describe('C. card-spawned-modal registry (closed set) — each spawned overlay modal MUST portal', () => {
  // A "card-spawned modal" = an overlay modal rendered by a component whose ROOT is a
  // rounded card (so the modal becomes a descendant of a glow card). EDScoreBox →
  // EDDetailModal is the known case. Adding a NEW card component that spawns an overlay
  // modal REQUIRES adding it here (Rule P closed list) + that modal must portal.
  const CARD_SPAWNED = [
    { host: 'src/components/backend/EDScoreBox.jsx', renders: '<EDDetailModal', modal: 'src/components/backend/EDDetailModal.jsx' },
  ];
  for (const { host, renders, modal } of CARD_SPAWNED) {
    it(`C.${host.split('/').pop()} spawns ${renders}> and that modal portals`, () => {
      expect(read(host)).toContain(renders);
      expect(read(modal)).toMatch(/return createPortal\(/);
    });
  }
});
