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

  it('B1.2 desktop orbs use scatter top%/left% positioning (mockup-organic)', () => {
    render(<BackendArcBloom open={true} onClose={() => {}} onNavigate={() => {}} />);
    const orbs = screen.getAllByRole('menuitem');
    for (const orb of orbs) {
      expect(orb.style.top, 'desktop orb must use top%').toMatch(/%$/);
      expect(orb.style.left, 'desktop orb must use left%').toMatch(/%$/);
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

  it('B1.4 scatter positions (re-centered): customers top:19% left:34%', () => {
    render(<BackendArcBloom open={true} onClose={() => {}} onNavigate={() => {}} />);
    const customersOrb = screen.getByTestId('bloom-orb-customers');
    expect(customersOrb.style.top).toBe('19%');
    expect(customersOrb.style.left).toBe('34%');
  });

  it('B1.4-bis scatter positions: stock top:65% left:88% (bottom-right corner)', () => {
    render(<BackendArcBloom open={true} onClose={() => {}} onNavigate={() => {}} />);
    const stockOrb = screen.getByTestId('bloom-orb-stock');
    expect(stockOrb.style.top).toBe('65%');
    expect(stockOrb.style.left).toBe('88%');
  });

  it('B1.4-quater cluster centroid ~ (50%, 50%) — balanced not top-left tilt', () => {
    render(<BackendArcBloom open={true} onClose={() => {}} onNavigate={() => {}} />);
    const orbs = Array.from(document.querySelectorAll('[role="menuitem"]'));
    const sumTop = orbs.reduce((s, o) => s + parseFloat(o.style.top), 0);
    const sumLeft = orbs.reduce((s, o) => s + parseFloat(o.style.left), 0);
    const meanTop = sumTop / orbs.length;
    const meanLeft = sumLeft / orbs.length;
    expect(meanTop, `cluster vertical centroid (${meanTop.toFixed(1)}%) should be ~50%`).toBeGreaterThanOrEqual(45);
    expect(meanTop).toBeLessThanOrEqual(55);
    expect(meanLeft, `cluster horizontal centroid (${meanLeft.toFixed(1)}%) should be ~50%`).toBeGreaterThanOrEqual(45);
    expect(meanLeft).toBeLessThanOrEqual(55);
  });

  it('B1.4-ter emoji glyphs present (mockup-matched colored icons)', () => {
    render(<BackendArcBloom open={true} onClose={() => {}} onNavigate={() => {}} />);
    const customersOrb = screen.getByTestId('bloom-orb-customers');
    expect(customersOrb.querySelector('.bloom-orb-emoji')?.textContent).toBe('👥');
    const reportsOrb = screen.getByTestId('bloom-orb-reports');
    expect(reportsOrb.querySelector('.bloom-orb-emoji')?.textContent).toBe('📊');
    const stockOrb = screen.getByTestId('bloom-orb-stock');
    expect(stockOrb.querySelector('.bloom-orb-emoji')?.textContent).toBe('📦');
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
    expect(src).toMatch(/DESKTOP_POSITION/);
    expect(src).toMatch(/MOBILE_POSITION/);
    expect(src).toMatch(/SECTION_COLOR/);
    expect(src).toMatch(/SECTION_EMOJI/);
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
