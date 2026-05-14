// tests/phase-29-recall-source-grep.test.js
//
// Phase 29.13 (2026-05-14) — Source-grep regression bank (Layer 3 per spec §9).
// SG1-SG12 lock anti-flicker discipline + DRY + BSA + spec self-review fixes.
//
// These tests are the architectural backstop for Phase 29's critical
// invariants. Future code reviewers must NOT relax these without
// understanding the consequences (per spec §14 institutional memory).

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

function readSafe(rel) {
  try { return read(rel); } catch { return ''; }
}

// ─────────────────────────────────────────────────────────────────────────────
// File inventory — all Phase 29 source files
// ─────────────────────────────────────────────────────────────────────────────
const RECALL_COMPONENT_DIR = 'src/components/backend/recall';
const RECALL_COMPONENTS = [
  'RecallRow.jsx',
  'RecallPairBadge.jsx',
  'RecallSectionHeader.jsx',
  'RecallEmptyState.jsx',
  'RecallList.jsx',
  'RecallSlotCard.jsx',
  'RecallCreateModal.jsx',
  'RecallOutcomeModal.jsx',
  'RecallLineTemplateModal.jsx',
  'RecallSnoozeMenu.jsx',
  'RecallTab.jsx',
  'RecallHeader.jsx',
  'RecallFrontendView.jsx',
  'RecallTogglePill.jsx',
];

const RECALL_LIBS = [
  'src/lib/recallResolvers.js',
  'src/lib/recallValidation.js',
  'src/lib/lineTemplateRenderer.js',
  'src/hooks/useRecallListener.js',
];

const CDV_RECALL_CARD = 'src/components/backend/customer-recall/RecallCard.jsx';

// ─────────────────────────────────────────────────────────────────────────────
describe('Phase 29 · SG1 — DRY: all surfaces import shared RecallRow', () => {
  it('SG1.1 RecallList imports RecallRow', () => {
    const c = read(`${RECALL_COMPONENT_DIR}/RecallList.jsx`);
    expect(c).toMatch(/import\s*\{\s*[^}]*RecallRow[^}]*\}\s*from\s*['"]\.\/RecallRow\.jsx['"]/);
  });

  it('SG1.2 RecallCard (CDV) imports RecallRow from recall/', () => {
    const c = read(CDV_RECALL_CARD);
    expect(c).toMatch(/import\s*\{\s*[^}]*RecallRow[^}]*\}\s*from\s*['"]\.\.\/recall\/RecallRow\.jsx['"]/);
  });

  it('SG1.3 No surface re-implements row logic — only RecallRow exists', () => {
    // Search for "function Recall" definitions across recall/ dir — must NOT find duplicates
    const allFiles = RECALL_COMPONENTS.map(f => read(`${RECALL_COMPONENT_DIR}/${f}`)).join('\n');
    const matches = allFiles.match(/function Recall\w*Row\b/g) || [];
    // Only "RecallRow" itself defines a Row function — no RecallCompactRow, etc.
    expect(matches.length).toBeLessThanOrEqual(1);
  });
});

describe('Phase 29 · SG2 — real-time discipline: surfaces use useRecallListener', () => {
  it('SG2.1 RecallTab uses useRecallListener', () => {
    expect(read(`${RECALL_COMPONENT_DIR}/RecallTab.jsx`)).toMatch(/useRecallListener/);
  });

  it('SG2.2 RecallFrontendView uses useRecallListener', () => {
    expect(read(`${RECALL_COMPONENT_DIR}/RecallFrontendView.jsx`)).toMatch(/useRecallListener/);
  });

  it('SG2.3 RecallTogglePill uses useRecallListener (for badge count)', () => {
    expect(read(`${RECALL_COMPONENT_DIR}/RecallTogglePill.jsx`)).toMatch(/useRecallListener/);
  });

  it('SG2.4 CDV RecallCard uses useRecallListener', () => {
    expect(read(CDV_RECALL_CARD)).toMatch(/useRecallListener/);
  });
});

describe('Phase 29 · SG3 — anti-flicker: stable React keys (NEVER index)', () => {
  // Critical per spec §5.6 — keys must be recall.id, NEVER index. Future
  // regressions would cause list-reorder unmount + remount → visible flicker.
  it('SG3.1 RecallList uses key={r.id} not key={index}', () => {
    const c = read(`${RECALL_COMPONENT_DIR}/RecallList.jsx`);
    // Must have key={r.id} or similar
    expect(c).toMatch(/key=\{r\.id\}/);
    // Must NOT have key={index} or key={i} or key={idx}
    expect(c).not.toMatch(/key=\{i\}|key=\{idx\}|key=\{index\}/);
  });

  it('SG3.2 RecallCard renders with stable key (recall.id)', () => {
    const c = read(CDV_RECALL_CARD);
    expect(c).toMatch(/key=\{r\.id\}/);
    expect(c).not.toMatch(/key=\{i\}|key=\{idx\}|key=\{index\}/);
  });
});

describe('Phase 29 · SG4 — anti-flicker: no key={Date.now()} anywhere', () => {
  it('SG4.1 No Date.now() in any recall component key', () => {
    for (const f of RECALL_COMPONENTS) {
      const c = read(`${RECALL_COMPONENT_DIR}/${f}`);
      expect(c, `${f} uses Date.now() in key`).not.toMatch(/key=\{Date\.now\(\)/);
      expect(c, `${f} uses random in key`).not.toMatch(/key=\{Math\.random\(\)/);
    }
  });

  it('SG4.2 CDV RecallCard has no Date.now() / Math.random() keys', () => {
    const c = read(CDV_RECALL_CARD);
    expect(c).not.toMatch(/key=\{Date\.now\(\)/);
    expect(c).not.toMatch(/key=\{Math\.random\(\)/);
  });
});

describe('Phase 29 · SG5 — RecallCreateModal validation enforces ≥1 slot', () => {
  it('SG5.1 Modal renders validation banner for "at-least-one-slot-required"', () => {
    const c = read(`${RECALL_COMPONENT_DIR}/RecallCreateModal.jsx`);
    expect(c).toMatch(/at-least-one-slot-required/);
    expect(c).toMatch(/กรุณาเปิดอย่างน้อย 1 slot/);
  });

  it('SG5.2 validateRecallCreate exports the rule', () => {
    const c = read('src/lib/recallValidation.js');
    expect(c).toMatch(/at-least-one-slot-required/);
  });
});

describe('Phase 29 · SG6 — auto-snooze 3-day default sourced from constant', () => {
  it('SG6.1 recordRecallOutcome auto-snooze uses 3 * 86400000 (3 days)', () => {
    const c = read('src/lib/backendClient.js');
    // Extract just the recordRecallOutcome region — search for the function
    const idx = c.indexOf('recordRecallOutcome');
    expect(idx).toBeGreaterThanOrEqual(0);
    const slice = c.slice(idx, idx + 2000);
    expect(slice).toMatch(/3 \* 86400000/);
  });

  it('SG6.2 computeAutoSnoozeUntil default = 3', () => {
    const c = read('src/lib/recallResolvers.js');
    expect(c).toMatch(/computeAutoSnoozeUntil\(fromISO,\s*days\s*=\s*3\)/);
  });

  it('SG6.3 shouldFlagManualReview default threshold = 3', () => {
    const c = read('src/lib/recallResolvers.js');
    expect(c).toMatch(/shouldFlagManualReview\(noAnswerCount,\s*threshold\s*=\s*3\)/);
  });
});

describe('Phase 29 · SG7 — lineTemplateRenderer used (DRY substitution)', () => {
  it('SG7.1 RecallLineTemplateModal imports renderTemplate + getRecallTemplateVariables', () => {
    const c = read(`${RECALL_COMPONENT_DIR}/RecallLineTemplateModal.jsx`);
    expect(c).toMatch(/renderTemplate/);
    expect(c).toMatch(/getRecallTemplateVariables/);
    expect(c).toMatch(/DEFAULT_RECALL_TEMPLATES/);
  });

  it('SG7.2 No surface re-implements template substitution', () => {
    for (const f of RECALL_COMPONENTS) {
      if (f === 'RecallLineTemplateModal.jsx') continue;
      const c = read(`${RECALL_COMPONENT_DIR}/${f}`);
      // No regex-based {key} substitution outside the canonical renderer
      expect(c, `${f} re-implements template substitution`).not.toMatch(/\.replace\(\s*\/\\\{[^}]*\}\\\//);
    }
  });
});

describe('Phase 29 · SG8 — formatPairBadge used by pair badge (DRY)', () => {
  it('SG8.1 RecallPairBadge imports formatPairBadge', () => {
    const c = read(`${RECALL_COMPONENT_DIR}/RecallPairBadge.jsx`);
    expect(c).toMatch(/formatPairBadge/);
  });

  it('SG8.2 No other file calls formatPairBadge directly (avoid double-computation)', () => {
    let consumerCount = 0;
    for (const f of RECALL_COMPONENTS) {
      const c = read(`${RECALL_COMPONENT_DIR}/${f}`);
      if (c.match(/formatPairBadge\(/)) consumerCount += 1;
    }
    // Only RecallPairBadge itself calls it
    expect(consumerCount).toBe(1);
  });
});

describe('Phase 29 · SG9 — RecallTab registered in navConfig', () => {
  it('SG9.1 navConfig has recall tab entry', () => {
    const c = read('src/components/backend/nav/navConfig.js');
    expect(c).toMatch(/id:\s*['"]recall['"]/);
    expect(c).toMatch(/label:\s*['"]Recall['"]/);
  });

  it('SG9.2 BackendDashboard renders RecallTab on activeTab === "recall"', () => {
    const c = read('src/pages/BackendDashboard.jsx');
    expect(c).toMatch(/activeTab === 'recall'/);
    expect(c).toMatch(/<RecallTab\s*\/>/);
  });
});

describe('Phase 29 · SG10 — BSA: per-customer listener marked universal', () => {
  it('SG10.1 listenToRecallsForCustomer.__universal__ = true in backendClient', () => {
    const c = read('src/lib/backendClient.js');
    expect(c).toMatch(/listenToRecallsForCustomer\.__universal__\s*=\s*true/);
  });

  it('SG10.2 scopedDataLayer marks listRecallsForCustomer + listenToRecallsForCustomer universal', () => {
    const c = read('src/lib/scopedDataLayer.js');
    expect(c).toMatch(/listRecallsForCustomer\.__universal__\s*=\s*true/);
    expect(c).toMatch(/listenToRecallsForCustomer\.__universal__\s*=\s*true/);
  });

  it('SG10.3 listenToRecalls (branch-scoped) NOT marked universal', () => {
    const c = read('src/lib/backendClient.js');
    // Find listenToRecalls block (not listenToRecallsForCustomer)
    const m = c.match(/listenToRecalls\.__universal__\s*=\s*true/);
    expect(m, 'listenToRecalls erroneously marked __universal__ — branch leak risk').toBeNull();
  });
});

describe('Phase 29 · SG11 — spec self-review fixes locked', () => {
  // Per spec §5.3 — auto-suggest is modal pre-fill ONLY. NO daemon, NO draft
  // queue. SG11 prevents drift-back to the rejected design.
  it('SG11.1 No RecallAutoSuggestBanner component exists', () => {
    for (const f of RECALL_COMPONENTS) {
      const c = readSafe(`${RECALL_COMPONENT_DIR}/${f}`);
      expect(c, `${f} contains RecallAutoSuggestBanner`).not.toMatch(/RecallAutoSuggestBanner/);
    }
    expect(readSafe(CDV_RECALL_CARD)).not.toMatch(/RecallAutoSuggestBanner/);
  });

  it('SG11.2 No RecallSuggestReviewModal component exists', () => {
    for (const f of RECALL_COMPONENTS) {
      const c = readSafe(`${RECALL_COMPONENT_DIR}/${f}`);
      expect(c).not.toMatch(/RecallSuggestReviewModal/);
    }
  });

  it('SG11.3 No "draft-suggested" status anywhere', () => {
    for (const f of RECALL_COMPONENTS) {
      const c = readSafe(`${RECALL_COMPONENT_DIR}/${f}`);
      expect(c, `${f} contains draft-suggested status`).not.toMatch(/draft-suggested/);
    }
    expect(readSafe('src/lib/recallResolvers.js')).not.toMatch(/draft-suggested/);
    expect(readSafe('src/lib/recallValidation.js')).not.toMatch(/draft-suggested/);
    expect(readSafe('src/lib/backendClient.js').slice(0, 50000)).not.toMatch(/draft-suggested/);
  });
});

describe('Phase 29 · SG12 — Phase 29 marker comments in all new files', () => {
  // Every new Phase 29 source file should have a "Phase 29" marker comment
  // (or "29.x" sub-phase marker). Enables fast git-blame + audit-grep.
  it('SG12.1 All new recall components have Phase 29 marker', () => {
    for (const f of RECALL_COMPONENTS) {
      const c = read(`${RECALL_COMPONENT_DIR}/${f}`);
      expect(c, `${f} missing Phase 29 marker`).toMatch(/Phase 29/);
    }
  });

  it('SG12.2 All new recall libs have Phase 29 marker', () => {
    for (const lib of RECALL_LIBS) {
      const c = read(lib);
      expect(c, `${lib} missing Phase 29 marker`).toMatch(/Phase 29/);
    }
  });

  it('SG12.3 RecallCard (CDV) has Phase 29 marker', () => {
    expect(read(CDV_RECALL_CARD)).toMatch(/Phase 29/);
  });

  it('SG12.4 api/admin/line-send-recall.js has Phase 29 marker', () => {
    expect(read('api/admin/line-send-recall.js')).toMatch(/Phase 29/);
  });

  it('SG12.5 firestore.rules has Phase 29 marker for be_recalls', () => {
    const c = read('firestore.rules');
    const idx = c.indexOf('be_recalls');
    expect(idx).toBeGreaterThan(0);
    const slice = c.slice(Math.max(0, idx - 200), idx + 200);
    expect(slice).toMatch(/Phase 29/);
  });
});

describe('Phase 29 · SG13 — be_recalls firestore rules + indexes locked', () => {
  it('SG13.1 firestore.rules contains be_recalls match block', () => {
    const c = read('firestore.rules');
    expect(c).toMatch(/match\s*\/be_recalls\/\{recallId\}/);
    expect(c).toMatch(/allow read, write: if isClinicStaff/);
  });

  it('SG13.2 firestore.indexes.json has 4 be_recalls composite indexes', () => {
    const idx = JSON.parse(read('firestore.indexes.json'));
    const recallIndexes = (idx.indexes || []).filter(i => i.collectionGroup === 'be_recalls');
    expect(recallIndexes).toHaveLength(4);
  });
});
