// Phase 20.0 LineSettings per-branch status check (2026-05-06).
//
// User's active.md outstanding list referenced "LineSettings พระราม 3
// per-branch redesign". This task was actually completed by Phase BS V3
// (2026-05-04, src/lib/lineConfigClient.js + LineSettingsTab.jsx) BEFORE
// this Phase 20.0 cycle started. Lock-in test verifies the per-branch
// schema is intact + the UI consumes it correctly.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const LINE_TAB = fs.readFileSync(
  path.join(ROOT, 'src/components/backend/LineSettingsTab.jsx'),
  'utf8',
);
const LINE_CLIENT = fs.readFileSync(
  path.join(ROOT, 'src/lib/lineConfigClient.js'),
  'utf8',
);

describe('Phase 20.0 LineSettings — LS1 per-branch schema (Phase BS V3 lock)', () => {
  it('LS1.1 — lineConfigClient.js targets be_line_configs/{branchId}', () => {
    expect(LINE_CLIENT).toMatch(/be_line_configs/);
    expect(LINE_CLIENT).toMatch(/lineConfigDocRef.*branchId/s);
  });

  it('LS1.2 — getLineConfig requires branchId', () => {
    expect(LINE_CLIENT).toMatch(/branchId required/);
  });

  it('LS1.3 — saveLineConfig keyed by branchId', () => {
    expect(LINE_CLIENT).toMatch(/saveLineConfig/);
    expect(LINE_CLIENT).toMatch(/setDoc/);
  });
});

describe('Phase 20.0 LineSettings — LS2 LineSettingsTab consumes useSelectedBranch', () => {
  it('LS2.1 — useSelectedBranch hook imported from BranchContext', () => {
    expect(LINE_TAB).toMatch(
      /import\s*\{[^}]*useSelectedBranch[^}]*\}\s*from\s*['"][^'"]*BranchContext\.jsx['"]/s,
    );
  });

  it('LS2.2 — branchId destructured from useSelectedBranch', () => {
    expect(LINE_TAB).toMatch(/const\s*\{[^}]*branchId[^}]*\}\s*=\s*useSelectedBranch\s*\(\s*\)/);
  });

  it('LS2.3 — getLineConfig called with branchId arg', () => {
    expect(LINE_TAB).toMatch(/getLineConfig\s*\(\s*branchId\s*\)/);
  });

  it('LS2.4 — saveLineConfig called with (branchId, form)', () => {
    expect(LINE_TAB).toMatch(/saveLineConfig\s*\(\s*branchId\s*,\s*form\s*\)/);
  });

  it('LS2.5 — reload effect re-fires on branchId change', () => {
    expect(LINE_TAB).toMatch(/useCallback[\s\S]*?\[\s*branchId\s*\]/);
    expect(LINE_TAB).toMatch(/useEffect[\s\S]*?\[\s*isReady\s*,\s*branchId\s*,\s*reload\s*\]/);
  });
});

describe('Phase 20.0 LineSettings — LS3 success message names the branch', () => {
  it('LS3.1 — save success toast includes branchName', () => {
    expect(LINE_TAB).toMatch(/บันทึกการตั้งค่า LINE ของ.*\$\{branchName\}/);
  });

  it('LS3.2 — branchName resolved from branches array', () => {
    expect(LINE_TAB).toMatch(/branches\?\.find/);
  });
});
