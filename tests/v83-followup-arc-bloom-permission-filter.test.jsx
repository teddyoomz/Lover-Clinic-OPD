// ─── V83-followup — BackendArcBloom permission filter (EOD8 2026-05-18) ──
// User: "เมนูใหม่เราแสดง tab และ sub tab ครบ ทั้งๆที่ login นั้นไม่มีสิทธิ์
// เข้าถึง sub tab นั้นๆ ทำให้ขึ้นเฉพาะหน้าที่ account นั้นมีสิทะิ์ที่จะ
// เข้าถึงได้ ซึ่งเมนูแบบเดิมทำได้แล้ว".
//
// Old sidebar (BackendSidebar.jsx) uses useTabAccess → canAccess(tabId) filter.
// New Menu D (BackendArcBloom) was showing ALL sections + items. Now it
// MUST mirror the sidebar gate.
//
// 3 scenarios:
// - PF1: admin (canAccess always true) → all sections render
// - PF2: limited user (only customer perms) → only customer-related section visible
// - PF3: no perms loaded yet → empty (don't flash full menu)

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

// Mock useTabAccess BEFORE importing BackendArcBloom (must be hoisted by vi)
vi.mock('../src/hooks/useTabAccess.js', () => ({
  useTabAccess: vi.fn(),
}));

import { useTabAccess } from '../src/hooks/useTabAccess.js';
import BackendArcBloom from '../src/components/backend/shell/BackendArcBloom.jsx';

describe('V83-followup — BackendArcBloom permission filter', () => {
  describe('PF1 — Admin / all-perms sees ALL sections', () => {
    it('PF1.1 — admin: orbs render for every NAV_SECTION with non-empty items', () => {
      useTabAccess.mockReturnValue({
        canAccess: () => true,
        loaded: true,
        isAdmin: true,
        permissions: {},
      });
      render(<BackendArcBloom open={true} onClose={() => {}} onNavigate={() => {}} clinicSettings={null} theme="dark" />);
      // Expect 8 orbs (NAV_SECTIONS scaffold) — admin sees them all
      const orbs = screen.queryAllByTestId(/^bloom-orb-/);
      expect(orbs.length).toBeGreaterThanOrEqual(6); // tolerate ±2 if NAV_SECTIONS shape evolves
    });
  });

  describe('PF2 — Limited user sees only their accessible sections', () => {
    it('PF2.1 — only customer perm → only customers section visible', () => {
      // canAccess returns true ONLY for customer-related tab ids
      const customerTabs = new Set(['customers', 'clone']);
      useTabAccess.mockReturnValue({
        canAccess: (tabId) => customerTabs.has(tabId),
        loaded: true,
        isAdmin: false,
        permissions: { customer_view: true, customer_management: true },
      });
      render(<BackendArcBloom open={true} onClose={() => {}} onNavigate={() => {}} clinicSettings={null} theme="dark" />);
      // Customers orb visible
      expect(screen.queryByTestId('bloom-orb-customers')).toBeTruthy();
      // Sales / Stock / Marketing / Finance etc. should NOT render
      expect(screen.queryByTestId('bloom-orb-sales')).toBeNull();
      expect(screen.queryByTestId('bloom-orb-stock')).toBeNull();
      expect(screen.queryByTestId('bloom-orb-marketing')).toBeNull();
    });
  });

  describe('PF3 — Permissions not loaded yet → empty', () => {
    it('PF3.1 — loaded:false → no orbs rendered (prevents full-menu flash)', () => {
      useTabAccess.mockReturnValue({
        canAccess: () => true,
        loaded: false,
        isAdmin: false,
        permissions: {},
      });
      render(<BackendArcBloom open={true} onClose={() => {}} onNavigate={() => {}} clinicSettings={null} theme="dark" />);
      const orbs = screen.queryAllByTestId(/^bloom-orb-/);
      expect(orbs.length).toBe(0);
    });
  });

  describe('PF4 — Sub-tab filter (single-item section auto-skips picker)', () => {
    it('PF4.1 — section with 1 accessible item passes only that item to renderable scope', () => {
      // appointments-section has multiple items; only allow appointment-all
      useTabAccess.mockReturnValue({
        canAccess: (tabId) => tabId === 'appointment-all',
        loaded: true,
        isAdmin: false,
        permissions: { appointment: true },
      });
      render(<BackendArcBloom open={true} onClose={() => {}} onNavigate={() => {}} clinicSettings={null} theme="dark" />);
      // appointments-section orb should still render (has 1 accessible item)
      expect(screen.queryByTestId('bloom-orb-appointments-section')).toBeTruthy();
      // Other sections should NOT render
      expect(screen.queryByTestId('bloom-orb-customers')).toBeNull();
    });
  });

  describe('PF5 — Source-grep regression locks', () => {
    it('PF5.1 — BackendArcBloom imports useTabAccess', () => {
      const fs = require('fs');
      const path = require('path');
      const content = fs.readFileSync(
        path.join(process.cwd(), 'src/components/backend/shell/BackendArcBloom.jsx'),
        'utf8'
      );
      expect(content).toMatch(/from\s+['"]\.\.\/\.\.\/\.\.\/hooks\/useTabAccess\.js['"]/);
      expect(content).toMatch(/useTabAccess\(\)/);
      expect(content).toMatch(/canAccess\(item\.id\)/);
    });

    it('PF5.2 — sections useMemo gates on permsLoaded', () => {
      const fs = require('fs');
      const path = require('path');
      const content = fs.readFileSync(
        path.join(process.cwd(), 'src/components/backend/shell/BackendArcBloom.jsx'),
        'utf8'
      );
      expect(content).toMatch(/if\s*\(!permsLoaded\)\s*return\s*\[\]/);
    });
  });
});
