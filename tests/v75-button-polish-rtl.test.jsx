// V75 Item 1 — CustomerDetailView button row polish (structural source-grep).
//
// We test the JSX block's structural contract via source-grep rather than
// full RTL render because CustomerDetailView is a 2000+ LOC component with
// 20+ dependency imports (firebase, scopedDataLayer, BranchContext, etc.).
// Full render would require deeply nested partial mocks that drift each
// time CustomerDetailView gains a new dependency — V12-class lock-in risk.
//
// Source-grep locks the className contract directly. Visual L1 verification
// is covered by tests/e2e/v75-button-polish-visual.spec.js (Task 35).

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

const SOURCE_PATH = 'src/components/backend/CustomerDetailView.jsx';

function extractButtonRowBlock(src) {
  // Locate the row from the V75 marker comment to its closing </div>.
  // The block is the wrapper div containing all 4 action buttons.
  const start = src.indexOf('data-testid="customer-detail-button-row"');
  if (start === -1) return '';
  // Walk forward to find the matching </div> at the same nesting level
  const startOfDiv = src.lastIndexOf('<div', start);
  // Find balanced closing div by depth counting from startOfDiv
  let depth = 0;
  let i = startOfDiv;
  while (i < src.length) {
    if (src.startsWith('<div', i)) depth++;
    else if (src.startsWith('</div>', i)) {
      depth--;
      if (depth === 0) return src.slice(startOfDiv, i + 6);
    }
    i++;
  }
  return src.slice(startOfDiv);
}

describe('V75 Item 1 — CustomerDetailView 4-button row equal-height polish', () => {
  const src = fs.readFileSync(SOURCE_PATH, 'utf8');
  const block = extractButtonRowBlock(src);

  it('BTN1.1 — V75 marker comment present in source', () => {
    expect(src).toMatch(/V75 Item 1/);
  });

  it('BTN1.2 — wrapper div has data-testid="customer-detail-button-row" + flex flex-wrap gap-2', () => {
    expect(block).not.toBe('');
    expect(block).toMatch(/data-testid="customer-detail-button-row"/);
    expect(block).toMatch(/flex/);
    expect(block).toMatch(/flex-wrap/);
    expect(block).toMatch(/gap-2/);
  });

  // V21 fix-up (V82-followup, 2026-05-17): V81-fix4 removed the per-customer 'สำรอง'
  // (customer-detail-backup-button) — superseded by V81 WholeSystem + V81-fix6
  // customer-only single-file backups managed in BackupManagerTab. Button row dropped
  // from 4 → 3 buttons (แก้ไข / ผูก LINE / ลบลูกค้า). BTN1.3 label list trimmed; BTN1.4
  // expected count 4 → 3; BTN1.6 backup-button data-testid assertion removed.
  it('BTN1.3 — all 3 remaining button labels render in the row (แก้ไข / ผูก LINE / ลบลูกค้า)', () => {
    expect(block).toContain('แก้ไข');
    expect(block).toContain('ผูก LINE');
    expect(block).toContain('ลบลูกค้า');
    // V81-fix4: per-customer 'สำรอง' button REMOVED — covered by WholeSystem/customer-only backups
  });

  it('BTN1.4 — every <button> inside the row uses inline-flex + items-center + whitespace-nowrap', () => {
    // Find every `<button` tag in the block + grab its className
    const buttonTagPattern = /<button[\s\S]*?className=["']([^"']*)["'][\s\S]*?>/g;
    const classNames = [];
    let m;
    while ((m = buttonTagPattern.exec(block)) !== null) {
      classNames.push(m[1]);
    }
    // V81-fix4 (V21 fix-up V82-followup): 4 → 3 buttons (สำรอง removed)
    expect(classNames.length).toBe(3);
    classNames.forEach((cn, i) => {
      expect(cn, `button ${i + 1} className: ${cn}`).toMatch(/inline-flex/);
      expect(cn, `button ${i + 1} className: ${cn}`).toMatch(/items-center/);
      expect(cn, `button ${i + 1} className: ${cn}`).toMatch(/whitespace-nowrap/);
    });
  });

  it('BTN1.5 — no remaining `flex items-center gap-1.5` WITHOUT inline-flex prefix in the block (V12 anti-regression)', () => {
    // Anti-regression: if any button still has bare `flex items-center` (not inline-flex), fail.
    // Pattern: `className="...flex items-center..."` but not `inline-flex items-center`.
    const bareFlexMatches = [...block.matchAll(/className=["'][^"']*?\bflex\s+items-center[^"']*?["']/g)]
      .filter(m => !/inline-flex/.test(m[0]));
    expect(bareFlexMatches.length).toBe(0);
  });

  it('BTN1.6 — preserves remaining button onClick handlers + data-testid attrs (no functional change)', () => {
    expect(block).toMatch(/data-testid="edit-customer-btn"/);
    expect(block).toMatch(/data-testid="link-line-btn"/);
    // V81-fix4 (V21 fix-up V82-followup): customer-detail-backup-button REMOVED;
    // per-customer backup superseded by WholeSystem + customer-only backups in BackupManagerTab
    expect(block).toMatch(/data-testid="customer-detail-delete-button"/);
  });
});
