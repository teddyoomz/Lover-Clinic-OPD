import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

// BSA Task 6 — branch-scope-aware data layer migration. Invariant BS-1:
// only files that opt in via the `// audit-branch-scope:` first-line
// annotation (or are themselves the lib layer) may import backendClient.js
// directly. Everything else must route through scopedDataLayer.js so the
// branch context auto-injects.
//
// Reviewer caught 3 stragglers in commit 2c236d2 (TFP:3197 dynamic
// getAllMasterDataItems + CDV:1486 broken beProductToMasterShape adapter +
// CDV:1714 dynamic getAllCustomers). T6.1 below source-greps to lock the
// migration and catch future regressions at test-time.

const ALLOWED_FIRST_LINE_PREFIX = '// audit-branch-scope:';

function* walkSrc(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walkSrc(p);
    else if (/\.(jsx?|mjs)$/.test(e.name)) yield p;
  }
}

describe('BSA Task 6 — UI files import scopedDataLayer, not backendClient', () => {
  it('T6.1 only sanctioned files import backendClient.js directly', () => {
    const violations = [];
    for (const f of walkSrc('src')) {
      // Lib layer is allowed to reference backendClient
      if (/[\\/]lib[\\/]scopedDataLayer\.js$/.test(f)) continue;
      if (/[\\/]lib[\\/]backendClient\.js$/.test(f)) continue;
      const src = fs.readFileSync(f, 'utf8');
      if (!/backendClient/.test(src)) continue;
      // Detect static import OR dynamic import statements
      const hasStaticImport = /^import\s+[^;]*from\s+['"][^'"]*backendClient(\.js)?['"]/m.test(src);
      const hasDynamicImport = /import\(\s*['"][^'"]*backendClient(\.js)?['"]\s*\)/m.test(src);
      if (!hasStaticImport && !hasDynamicImport) continue;
      const firstLine = src.split('\n', 1)[0] || '';
      if (firstLine.startsWith(ALLOWED_FIRST_LINE_PREFIX)) continue;
      violations.push(path.relative(process.cwd(), f).replace(/\\/g, '/'));
    }
    expect(
      violations,
      `Files import backendClient without // audit-branch-scope: annotation:\n  ${violations.join('\n  ')}`
    ).toEqual([]);
  });
});
