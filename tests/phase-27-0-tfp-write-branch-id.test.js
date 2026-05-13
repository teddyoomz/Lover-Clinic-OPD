// V27.0 Task 5 — TFP write-side branchId stamping source-grep regression
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const TFP_SRC = readFileSync('src/components/TreatmentFormPage.jsx', 'utf-8');

describe('W1 — TFP write-side branchId stamping (Phase 27.0)', () => {
  it('W1.1 imports useSelectedBranch', () => {
    expect(TFP_SRC).toMatch(/import.*useSelectedBranch.*from.*BranchContext/);
  });

  it('W1.2 uses useSelectedBranch hook within component body', () => {
    expect(TFP_SRC).toMatch(/useSelectedBranch\(\)/);
    expect(TFP_SRC).toMatch(/selectedBranchId/);
  });

  it('W1.3 backendDetail block stamps branchId from selectedBranchId', () => {
    const idx = TFP_SRC.indexOf('const backendDetail = clean({');
    expect(idx).toBeGreaterThan(0);
    const window = TFP_SRC.slice(idx, idx + 4000);
    expect(window).toMatch(/branchId:\s*selectedBranchId/);
  });

  it('W1.4 V27.0 marker comment present near branchId stamp', () => {
    expect(TFP_SRC).toMatch(/Phase 27\.0[\s\S]*?branchId/);
  });
});
