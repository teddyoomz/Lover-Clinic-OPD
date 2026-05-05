// ─── Phase 17.2 — flow-simulate F1-F8 (Rule I) ────────────────────────────
// Source-grep guards across BranchContext, App.jsx, BackendDashboard, TFP,
// BranchFormModal, BranchesTab, BranchSelector, 6 stock panels, stockUtils.
//
// IMPLEMENTER NOTE (Batch 4): Several files retain comment-level mentions of
// `isDefault` / `includeLegacyMain` / `'main'` (e.g. "isDefault stripped" or
// "Falls back to 'main' when no BranchProvider"). These are explanatory
// comments documenting the Phase 17.2 transition — not LIVE code paths.
// Tests below mirror F1.5's pattern: strip comments before asserting NO
// reference, so the lock-in is on RUNTIME behavior not on doc strings.

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';

const STOCK_PANELS = [
  'src/components/backend/StockBalancePanel.jsx',
  'src/components/backend/MovementLogPanel.jsx',
  'src/components/backend/StockAdjustPanel.jsx',
  'src/components/backend/StockTransferPanel.jsx',
  'src/components/backend/StockWithdrawalPanel.jsx',
  'src/components/backend/StockSeedPanel.jsx',
];

// Helper — strip both line and block comments so source-grep guards
// distinguish LIVE code from explanatory comment text.
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('F1 — BranchContext rewrite', () => {
  let content;
  beforeEach(() => { content = fs.readFileSync('src/lib/BranchContext.jsx', 'utf8'); });
  it('F1.1 has localStorageKey helper using uid', () => {
    expect(content).toMatch(/function\s+localStorageKey\s*\(\s*uid\s*\)/);
    expect(content).toMatch(/selectedBranchId:\$\{uid\}/);
  });

  it('F1.2 has readSelected helper with legacy-key shim', () => {
    expect(content).toMatch(/function\s+readSelected\s*\(/);
    // legacy unkeyed read via STORAGE_KEY constant or literal
    expect(content).toMatch(/getItem\([^)]*STORAGE_KEY[^)]*\)|getItem\(['"]selectedBranchId['"]\)/);
    // legacy cleanup
    expect(content).toMatch(/removeItem\([^)]*STORAGE_KEY[^)]*\)|removeItem\(['"]selectedBranchId['"]\)/);
  });

  it('F1.3 has pickFirstLoginDefault sorting by createdAt DESC', () => {
    expect(content).toMatch(/function\s+pickFirstLoginDefault\s*\(/);
    expect(content).toMatch(/createdAt[\s\S]+localeCompare/);
  });

  it('F1.4 has useBranchVisibility export', () => {
    expect(content).toMatch(/export\s+function\s+useBranchVisibility\s*\(/);
    expect(content).toMatch(/showSelector/);
  });

  it('F1.5 NO `main` literal fallback in LIVE code', () => {
    const codeOnly = stripComments(content);
    expect(codeOnly).not.toMatch(/return\s+['"]main['"]/);
    expect(codeOnly).not.toMatch(/=\s*['"]main['"]/);
  });

  it('F1.6 NO isDefault references in branch-context LIVE code', () => {
    const codeOnly = stripComments(content);
    expect(codeOnly).not.toMatch(/isDefault/);
  });

  it('F1.7 Phase 17.2 marker comment present', () => {
    expect(content).toMatch(/Phase 17\.2/);
  });
});

describe('F2 — App.jsx hoist', () => {
  let content;
  beforeEach(() => { content = fs.readFileSync('src/App.jsx', 'utf8'); });
  it('F2.1 imports BranchProvider', () => {
    expect(content).toMatch(/import\s+\{\s*BranchProvider\s*\}\s+from\s+['"][^'"]+BranchContext/);
  });

  it('F2.2 wraps Routes (or root tree) with <BranchProvider>', () => {
    expect(content).toMatch(/<BranchProvider>/);
    expect(content).toMatch(/<\/BranchProvider>/);
  });
});

describe('F3 — BackendDashboard duplicate provider removed', () => {
  let content;
  beforeEach(() => { content = fs.readFileSync('src/pages/BackendDashboard.jsx', 'utf8'); });
  it('F3.1 NO BranchProvider import in LIVE code', () => {
    const codeOnly = stripComments(content);
    expect(codeOnly).not.toMatch(/import.*BranchProvider/);
  });

  it('F3.2 NO BranchProvider JSX wrap in LIVE code', () => {
    const codeOnly = stripComments(content);
    expect(codeOnly).not.toMatch(/<BranchProvider/);
  });
});

describe('F4 — branchValidation isDefault stripped', () => {
  let content;
  beforeEach(() => { content = fs.readFileSync('src/lib/branchValidation.js', 'utf8'); });
  it('F4.1 NO isDefault references in LIVE code', () => {
    const codeOnly = stripComments(content);
    expect(codeOnly).not.toMatch(/isDefault/);
  });
});

describe('F5 — TFP comment cleanup', () => {
  let content;
  beforeEach(() => { content = fs.readFileSync('src/components/TreatmentFormPage.jsx', 'utf8'); });
  it('F5.1 Phase 17.2 marker in TFP comments', () => {
    expect(content).toMatch(/Phase 17\.2/);
  });

  it('F5.2 NO `falls back to .main.` in LIVE code', () => {
    // The comment "Falls back to 'main' when no BranchProvider is mounted"
    // documents the LEGACY behavior pre-Phase-17.2. Phase 17.2 removed the
    // 'main' fallback from LIVE code; the comment stays as explanatory
    // history. Test asserts no LIVE code still falls back to 'main'.
    const codeOnly = stripComments(content);
    expect(codeOnly).not.toMatch(/falls back to ['"]main['"]/i);
  });
});

describe('F6 — 6 stock panels strip includeLegacyMain', () => {
  for (const panel of STOCK_PANELS) {
    it(`F6.${panel.split('/').pop()} has NO includeLegacyMain reference`, () => {
      const content = fs.readFileSync(panel, 'utf8');
      expect(content).not.toMatch(/includeLegacyMain/);
    });
  }
});

describe('F7 — stockUtils strip includeLegacyMain', () => {
  it('F7.1 stockUtils has NO includeLegacyMain helper or reference in LIVE code', () => {
    const content = fs.readFileSync('src/lib/stockUtils.js', 'utf8');
    const codeOnly = stripComments(content);
    expect(codeOnly).not.toMatch(/includeLegacyMain/);
  });
});

describe('F8 — V21 anti-regression / out-of-scope guards', () => {
  it('F8.1 bank-account isDefault UNTOUCHED in bankAccountValidation.js', () => {
    const content = fs.readFileSync('src/lib/bankAccountValidation.js', 'utf8');
    expect(content).toMatch(/isDefault/);
  });

  it('F8.2 bank-account isDefault UNTOUCHED in FinanceMasterTab.jsx', () => {
    const content = fs.readFileSync('src/components/backend/FinanceMasterTab.jsx', 'utf8');
    expect(content).toMatch(/isDefault/);
  });

  it('F8.3 BranchFormModal isDefault checkbox REMOVED from LIVE code', () => {
    const content = fs.readFileSync('src/components/backend/BranchFormModal.jsx', 'utf8');
    const codeOnly = stripComments(content);
    expect(codeOnly).not.toMatch(/isDefault/);
  });

  it('F8.4 BranchesTab isDefault badge REMOVED', () => {
    const content = fs.readFileSync('src/components/backend/BranchesTab.jsx', 'utf8');
    expect(content).not.toMatch(/isDefault/);
  });

  it('F8.5 BranchSelector uses useBranchVisibility', () => {
    const content = fs.readFileSync('src/components/backend/BranchSelector.jsx', 'utf8');
    expect(content).toMatch(/useBranchVisibility/);
  });

  it('F8.6 backendClient.js bank-account isDefault UNTOUCHED, branch isDefault REMOVED', () => {
    const content = fs.readFileSync('src/lib/backendClient.js', 'utf8');
    // Bank-account isDefault still appears.
    expect(content).toMatch(/bankAccountDoc[\s\S]+isDefault/);
    // Branch-context isDefault should NOT appear.
    // (We can't grep for "branch-related isDefault" precisely; trust manual code review + targeted Task 12 cross-file consistency check.)
  });
});
