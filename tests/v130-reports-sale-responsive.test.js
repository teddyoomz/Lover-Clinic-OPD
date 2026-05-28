// V130 (2026-05-28) — reports-sale responsive: compact density + a height-capped
// table region so the horizontal scrollbar is reachable (was below the fold of a
// tall 39-row table). Real-browser verified (Chrome MCP, emulated 1200px): the
// shells ALREADY contain the table in-panel (min-w-0 on <main>) — so there is NO
// shell code change; only SaleReportTable compacts + gets max-h. AV148 locks both
// the shell-containment regression-guard and the table contract.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const tab  = readFileSync('src/components/backend/reports/SaleReportTab.jsx', 'utf8');
const nav  = readFileSync('src/components/backend/nav/BackendNav.jsx', 'utf8');
const shellNew = readFileSync('src/components/backend/shell/BackendShellNew.jsx', 'utf8');
const av   = readFileSync('.agents/skills/audit-anti-vibe-code/SKILL.md', 'utf8');

describe('V130.B SaleReportTable compact + reachable scroll', () => {
  it('B1: desktop wrapper is height-capped + keeps overflow-auto (scrollbar reachable)', () => {
    // V131 (2026-05-28) — fixed max-h-[70vh] → JS-measured fill-available-height
    // (innerHeight - wrapperTop - margin) so the table is "พอดีจอ" on all sizes;
    // max-h-[85vh] is the pre-measure CSS fallback, inline maxHeight refines it.
    expect(tab).toMatch(/hidden lg:block max-h-\[85vh\] overflow-auto/);
    expect(tab).toMatch(/ref=\{wrapRef\}/);
    expect(tab).toMatch(/style=\{maxH \? \{ maxHeight: `\$\{maxH\}px` \} : undefined\}/);
    expect(tab).toMatch(/window\.innerHeight - top - 16/);
    expect(tab).not.toMatch(/max-h-\[70vh\]/);
  });
  it('B2: table min-width relaxed 1400 → 1180 (compact); old 1400 gone', () => {
    expect(tab).toMatch(/text-xs min-w-\[1180px\]/);
    expect(tab).not.toMatch(/min-w-\[1400px\]/);
  });
  it('B3: compact cell padding px-1.5 py-1 (Thai-readable text-xs floor kept)', () => {
    expect(tab).toMatch(/px-1\.5 py-1 font-bold whitespace-nowrap/); // th
    expect(tab).toMatch(/text-xs/);                                  // font floor not shrunk to 9px
  });
  it('B4: long free-text columns truncate (itemsSummary + paymentChannels) with title', () => {
    expect(tab).toMatch(/const isTruncatable = \(key\) => key === 'itemsSummary' \|\| key === 'paymentChannels'/);
    expect(tab).toMatch(/max-w-\[180px\] truncate/);
    expect(tab).toMatch(/isTruncatable\(c\.key\)/);
  });
  it('B5: mobile (<lg) card list untouched (separate layout)', () => {
    expect(tab).toMatch(/data-testid="sale-report-mobile-list"/);
    expect(tab).toMatch(/function SaleMobileList/);
  });
});

describe('V130.AV148 shell containment regression-guard', () => {
  it('AV148.1: BackendNav <main> retains min-w-0 (in-panel scroll, not off-screen)', () => {
    expect(nav).toMatch(/<main[^>]*min-w-0/);
  });
  it('AV148.2: BackendShellNew <main> retains min-w-0', () => {
    expect(shellNew).toMatch(/<main[^>]*min-w-0/);
  });
  it('AV148.3: AV148 documented in audit skill', () => {
    expect(av).toMatch(/### AV148 —/);
    expect(av).toMatch(/min-w-0/);
    expect(av).toMatch(/max-h-/);
  });
});
