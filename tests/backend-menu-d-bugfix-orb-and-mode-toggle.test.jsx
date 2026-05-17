// Bugfix regression bank (2026-05-18) — Backend Menu D
//
// Bug A (Round 1): orbPosition produced negative bottom values for i ≥ 2 → 5+ orbs
//   below viewport (radial-arc math wrong). Round 1 fix: corrected trig.
// Bug A (Round 2 — same day): user pointed out the radial-arc layout itself was
//   wrong vs the approved mockup. Mockup shows 8 SCATTERED rounded-square tiles
//   with per-section position (top%/left%) + per-section linear-gradient colors,
//   NOT a radial arc fan. Round 2 fix: rewrote orbPosition logic to use
//   SECTION_POSITION + SECTION_COLOR maps from the mockup verbatim.
//
// Bug B: BackendMenuModeToggle was only rendered inside BackendTopBarNew (new
//   shell). Once admin switched to classic mode, no toggle was rendered anywhere
//   → one-way trap (no return path to new mode). Fix: conditional render in
//   BackendDashboard breadcrumbSlot when menuMode === 'classic'.

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import BackendArcBloom from '../src/components/backend/shell/BackendArcBloom.jsx';
import { NAV_SECTIONS } from '../src/components/backend/nav/navConfig.js';

describe('Bug A fix — BackendArcBloom uses scatter-grid layout per mockup', () => {
  it('B1.1 all orbs rendered (8 total, one per NAV_SECTIONS entry)', () => {
    render(<BackendArcBloom open={true} onClose={() => {}} onNavigate={() => {}} />);
    const orbs = screen.getAllByRole('menuitem');
    expect(orbs.length).toBe(NAV_SECTIONS.length);
  });

  it('B1.2 desktop orbs use CSS Grid placement (gridRow + gridColumn, not top%/left%)', () => {
    // Default jsdom innerWidth = 1024 → desktop mode → grid placement
    render(<BackendArcBloom open={true} onClose={() => {}} onNavigate={() => {}} />);
    const orbs = screen.getAllByRole('menuitem');
    for (const orb of orbs) {
      expect(orb.style.gridRow, 'desktop orb must use grid-row').toMatch(/^[12]$/);
      expect(orb.style.gridColumn, 'desktop orb must use grid-column').toMatch(/^[1-4]$/);
    }
  });

  it('B1.3 each orb has --c1 and --c2 CSS vars (gradient colors)', () => {
    render(<BackendArcBloom open={true} onClose={() => {}} onNavigate={() => {}} />);
    const orbs = screen.getAllByRole('menuitem');
    for (const orb of orbs) {
      const c1 = orb.style.getPropertyValue('--c1');
      const c2 = orb.style.getPropertyValue('--c2');
      expect(c1, `--c1 must be a hex color`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(c2, `--c2 must be a hex color`).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('B1.4 grid placement: customers row 1 col 2 (top-row second position)', () => {
    render(<BackendArcBloom open={true} onClose={() => {}} onNavigate={() => {}} />);
    const customersOrb = screen.getByTestId('bloom-orb-customers');
    expect(customersOrb.style.gridRow).toBe('1');
    expect(customersOrb.style.gridColumn).toBe('2');
  });

  it('B1.4-bis grid placement: stock row 2 col 4 (bottom-row last position)', () => {
    render(<BackendArcBloom open={true} onClose={() => {}} onNavigate={() => {}} />);
    const stockOrb = screen.getByTestId('bloom-orb-stock');
    expect(stockOrb.style.gridRow).toBe('2');
    expect(stockOrb.style.gridColumn).toBe('4');
  });

  it('B1.5 mockup-locked colors: sales (red→orange), customers (teal→green)', () => {
    render(<BackendArcBloom open={true} onClose={() => {}} onNavigate={() => {}} />);
    const salesOrb = screen.getByTestId('bloom-orb-sales');
    expect(salesOrb.style.getPropertyValue('--c1')).toBe('#ef4444');
    expect(salesOrb.style.getPropertyValue('--c2')).toBe('#f97316');
    const custOrb = screen.getByTestId('bloom-orb-customers');
    expect(custOrb.style.getPropertyValue('--c1')).toBe('#14b8a6');
    expect(custOrb.style.getPropertyValue('--c2')).toBe('#22c55e');
  });

  it('B1.6 source guard — fix markers + no radial-arc patterns remain', () => {
    const src = readFileSync('src/components/backend/shell/BackendArcBloom.jsx', 'utf-8');
    expect(src).toMatch(/Rewrite 2026-05-18/);
    expect(src).toMatch(/DESKTOP_GRID_AREA/);
    expect(src).toMatch(/MOBILE_POSITION/);
    expect(src).toMatch(/SECTION_COLOR/);
    // Old radial math must be gone
    expect(src).not.toMatch(/orbPosition\(/);
    expect(src).not.toMatch(/Math\.cos\(angle/);
    expect(src).not.toMatch(/Math\.sin\(angle/);
  });

  it('B1.7 orb has label + count visible (icon + name + sub-tab count)', () => {
    render(<BackendArcBloom open={true} onClose={() => {}} onNavigate={() => {}} />);
    const orb = screen.getByTestId('bloom-orb-customers');
    expect(orb.querySelector('.bloom-orb-label')).toBeTruthy();
    expect(orb.querySelector('.bloom-orb-label').textContent).toContain('ลูกค้า');
  });

  it('B1.8 onNavigate still fires with first-item id of clicked section (contract intact)', () => {
    let navigated = null;
    render(<BackendArcBloom open={true} onClose={() => {}} onNavigate={(id) => { navigated = id; }} />);
    const orb = screen.getByTestId('bloom-orb-customers');
    orb.click();
    expect(navigated).toBe(NAV_SECTIONS.find(s => s.id === 'customers').items[0].id);
  });
});

describe('Bug B fix — Mode toggle accessible in classic mode (no one-way trap)', () => {
  it('B2.1 BackendDashboard imports BackendMenuModeToggle', () => {
    const src = readFileSync('src/pages/BackendDashboard.jsx', 'utf-8');
    expect(src).toMatch(/import\s+BackendMenuModeToggle\s+from\s+'\.\.\/components\/backend\/shell\/BackendMenuModeToggle/);
  });

  it('B2.2 BackendMenuModeToggle conditionally rendered in classic mode (return-path)', () => {
    const src = readFileSync('src/pages/BackendDashboard.jsx', 'utf-8');
    expect(src).toMatch(/menuMode\s*===\s*'classic'[\s\S]{0,200}<BackendMenuModeToggle/);
  });

  it('B2.3 BackendMenuModeToggle gated by menuMode === classic in BOTH breadcrumbSlot branches', () => {
    const src = readFileSync('src/pages/BackendDashboard.jsx', 'utf-8');
    // Toggle should appear at least twice gated by 'classic' (viewingCustomer branch + default branch)
    const all = src.match(/menuMode\s*===\s*'classic'[\s\S]{0,1000}?BackendMenuModeToggle/g) || [];
    expect(all.length, 'toggle must be gated to classic mode in both branches').toBeGreaterThanOrEqual(2);
  });

  it('B2.4 fix marker comment present', () => {
    const src = readFileSync('src/pages/BackendDashboard.jsx', 'utf-8');
    expect(src).toMatch(/Bugfix 2026-05-18[\s\S]{0,200}toggle/i);
  });
});
