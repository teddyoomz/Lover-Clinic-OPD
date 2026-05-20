// Backend Menu D — customer-detail bug fixes (2026-05-20). Source-grep
// regression locks for two new-menu-mode-only bugs reported on the customer
// detail page:
//
//   Bug #1 — duplicate header (2× BranchSelector / ThemeToggle / ProfileDropdown):
//     BackendDashboard's viewing-customer breadcrumbSlot rendered the
//     Frontend/Branch/Theme/Profile controls UNCONDITIONALLY while
//     BackendShellNew → BackendTopBarNew also renders them in new mode. Fix:
//     gate those controls with menuMode === 'classic' (matching the sibling
//     non-customer breadcrumb branch).
//
//   Bug #2 — recall modal "in a box" + flicker → freeze:
//     The V86 auto-glow (index.css) applies `:hover { transform: translateY(-3px) }`
//     to every rounded-xl/2xl card inside [data-backend-menu-mode="new"]
//     [data-testid="backend-content"]. RecallCard's rounded-xl wrapper matches,
//     and its recall modals rendered as `fixed inset-0` DESCENDANTS → the
//     transform made the wrapper the modal's containing block → confined +
//     self-sustaining hover-feedback flicker. Fix: portal the 4 recall modals
//     to document.body so the fixed overlay escapes the transformed ancestor.
//     (User chose "keep V86 lift" → portal modals, not remove the transform.) AV98.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(__dirname, '..', rel), 'utf8');

const RECALL_MODAL_FILES = [
  'src/components/backend/recall/RecallCreateModal.jsx',
  'src/components/backend/recall/RecallEditModal.jsx',
  'src/components/backend/recall/RecallOutcomeModal.jsx',
  'src/components/backend/recall/RecallSnoozeMenu.jsx',
];

// =============================================================================
describe('A. Bug #2 — recall modals portal to document.body (escape V86 transform ancestor)', () => {
  for (const rel of RECALL_MODAL_FILES) {
    const name = rel.split('/').pop();
    const src = read(rel);
    it(`A.${name} imports createPortal from react-dom`, () => {
      expect(src).toMatch(/import\s*\{\s*createPortal\s*\}\s*from\s*'react-dom'/);
    });
    it(`A.${name} returns via createPortal(...)`, () => {
      expect(src).toMatch(/return createPortal\(/);
    });
    it(`A.${name} portals into document.body`, () => {
      expect(src).toMatch(/document\.body\s*\)\s*;/);
    });
    it(`A.${name} does NOT render the fixed overlay via a bare return ( (anti-regression)`, () => {
      // The modal's top-level fixed overlay must be the createPortal child, not a
      // direct `return (` JSX (which would leave it in-tree, hijack-able).
      expect(src).not.toMatch(/return \(\s*(\/\/[^\n]*\n\s*)?<div\s+className="fixed inset-0/);
    });
  }
});

// =============================================================================
describe('B. Bug #1 — viewing-customer breadcrumb controls are classic-gated', () => {
  const src = read('src/pages/BackendDashboard.jsx');

  it('B.1 the dup-header bugfix marker comment is present', () => {
    expect(src).toMatch(/Bugfix 2026-05-20 \(dup header in new menu\)/);
  });

  it('B.2 the viewing-customer breadcrumb gates its controls behind menuMode === classic', () => {
    // Locate the breadcrumbSlot's viewing-customer branch (it contains the
    // copy-link button via "คัดลอกลิงก์") and assert the control group that
    // follows is wrapped in a menuMode === 'classic' gate.
    const idx = src.indexOf('คัดลอกลิงก์');
    expect(idx).toBeGreaterThan(0);
    const region = src.slice(idx, idx + 1800);
    // BranchSelector + ThemeToggle + ProfileDropdown must appear AFTER a
    // `menuMode === 'classic' && (` opener within this region.
    const gateIdx = region.indexOf("menuMode === 'classic' && (");
    expect(gateIdx).toBeGreaterThan(0);
    const afterGate = region.slice(gateIdx);
    expect(afterGate).toMatch(/<BranchSelector className="hidden lg:flex" \/>/);
    expect(afterGate).toMatch(/<ThemeToggle theme=\{theme\} setTheme=\{setTheme\} \/>/);
    expect(afterGate).toMatch(/<ProfileDropdown \/>/);
  });

  it('B.3 anti-regression — no UNGATED <BranchSelector className="hidden lg:flex" /> outside a classic gate in the viewing-customer branch', () => {
    // Before the fix, the viewing-customer branch had:
    //   <BranchSelector className="hidden lg:flex" />
    // sitting directly after the Frontend button with NO classic gate. After
    // the fix it is INSIDE the menuMode === 'classic' && ( ... ) block, which
    // necessarily places `menuMode === 'classic' && (` within ~400 chars before it.
    const m = src.indexOf('<BranchSelector className="hidden lg:flex" />');
    expect(m).toBeGreaterThan(0);
    // Window must be wide enough to span the gate opener → comment → long
    // Frontend-button className → BranchSelector (~450 chars). 900 = headroom.
    const before = src.slice(Math.max(0, m - 900), m);
    expect(before).toMatch(/menuMode === 'classic' && \(/);
    // Anti-regression: the pre-fix shape inline-gated ONLY the mode toggle while
    // leaving Branch/Theme/Profile ungated. That standalone inline gate is gone.
    expect(src).not.toMatch(/menuMode === 'classic' && <div className="hidden lg:block"><BackendMenuModeToggle/);
  });
});

// =============================================================================
describe('C. AV98 invariant documented', () => {
  it('C.1 audit-anti-vibe-code SKILL.md mentions AV98 (modal-in-glow-card portal rule)', () => {
    const skill = read('.agents/skills/audit-anti-vibe-code/SKILL.md');
    expect(skill).toMatch(/AV98/);
    expect(skill).toMatch(/createPortal/);
  });
});
