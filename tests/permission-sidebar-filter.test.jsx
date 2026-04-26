// ─── Phase 13.5.2 sidebar / palette / deep-link filter tests ────────────
// PS1 group — verifies:
//   - BackendSidebar reads useTabAccess + filters PINNED + sections
//   - Empty sections are hidden (zero allowed items → no header)
//   - BackendCmdPalette filters identically
//   - BackendDashboard redirect useEffect kicks in only after both
//     hydrated && permsLoaded
//
// Strategy: source-grep regression guards (the wiring shape) + pure
// filter behavior tests using TAB_PERMISSION_MAP from the existing
// tabPermissions module. Full RTL mounts deferred to E2E spec.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { canAccessTab, filterAllowedTabs, firstAllowedTab } from '../src/lib/tabPermissions.js';
import { NAV_SECTIONS, PINNED_ITEMS } from '../src/components/backend/nav/navConfig.js';
import { DEFAULT_PERMISSION_GROUPS } from '../src/lib/seedDefaultPermissionGroups.js';

const sidebarSrc = readFileSync(
  resolve(__dirname, '..', 'src/components/backend/nav/BackendSidebar.jsx'),
  'utf-8'
);
const paletteSrc = readFileSync(
  resolve(__dirname, '..', 'src/components/backend/nav/BackendCmdPalette.jsx'),
  'utf-8'
);
const dashSrc = readFileSync(
  resolve(__dirname, '..', 'src/pages/BackendDashboard.jsx'),
  'utf-8'
);

describe('PS1 — Phase 13.5.2 sidebar/palette permission filter', () => {
  describe('PS1.A — Source-grep regression guards', () => {
    it('PS1.A.1 BackendSidebar imports useTabAccess', () => {
      expect(sidebarSrc).toMatch(/import\s+\{\s*useTabAccess\s*\}\s+from/);
    });

    it('PS1.A.2 BackendSidebar declares visiblePinned + visibleSections', () => {
      expect(sidebarSrc).toMatch(/const\s+visiblePinned\s*=\s*useMemo/);
      expect(sidebarSrc).toMatch(/const\s+visibleSections\s*=\s*useMemo/);
    });

    it('PS1.A.3 BackendSidebar renders visiblePinned, NOT raw PINNED_ITEMS', () => {
      // The PINNED_ITEMS rendering must use visiblePinned for length+map
      expect(sidebarSrc).toMatch(/visiblePinned\.length\s*>\s*0/);
      expect(sidebarSrc).toMatch(/visiblePinned\.map\(/);
      // Ensure the old PINNED_ITEMS.map render-loop is gone
      expect(sidebarSrc).not.toMatch(/PINNED_ITEMS\.map\(/);
    });

    it('PS1.A.4 BackendSidebar renders visibleSections, NOT raw NAV_SECTIONS', () => {
      expect(sidebarSrc).toMatch(/visibleSections\.map\(/);
      expect(sidebarSrc).not.toMatch(/NAV_SECTIONS\.map\(/);
    });

    it('PS1.A.5 BackendSidebar filter excludes empty sections', () => {
      // visibleSections should filter out sections whose item list is empty
      expect(sidebarSrc).toMatch(/items\.length\s*>\s*0/);
    });

    it('PS1.A.6 BackendCmdPalette imports useTabAccess', () => {
      expect(paletteSrc).toMatch(/import\s+\{\s*useTabAccess\s*\}/);
    });

    it('PS1.A.7 BackendCmdPalette declares visiblePinned + visibleSections', () => {
      expect(paletteSrc).toMatch(/const\s+visiblePinned\s*=\s*useMemo/);
      expect(paletteSrc).toMatch(/const\s+visibleSections\s*=\s*useMemo/);
    });

    it('PS1.A.8 BackendCmdPalette renders filtered (not raw) collections', () => {
      expect(paletteSrc).toMatch(/visiblePinned\.length\s*>\s*0/);
      expect(paletteSrc).toMatch(/visiblePinned\.map\(/);
      expect(paletteSrc).toMatch(/visibleSections\.map\(/);
      expect(paletteSrc).not.toMatch(/PINNED_ITEMS\.map\(/);
      expect(paletteSrc).not.toMatch(/NAV_SECTIONS\.map\(/);
    });

    it('PS1.A.9 BackendDashboard imports useTabAccess', () => {
      expect(dashSrc).toMatch(/import\s+\{\s*useTabAccess\s*\}\s+from\s+['"]\.\.\/hooks\/useTabAccess\.js/);
    });

    it('PS1.A.10 BackendDashboard reads canAccess + firstAllowedTab + permsLoaded', () => {
      expect(dashSrc).toMatch(/const\s+\{\s*canAccess[^}]*first[^}]*loaded:\s*permsLoaded\s*\}\s*=\s*useTabAccess\(\)/);
    });

    it('PS1.A.11 BackendDashboard redirect useEffect gates on hydrated + permsLoaded', () => {
      // Find redirect effect and assert its early-return shape
      expect(dashSrc).toMatch(/if\s*\(\s*!hydrated\s*\|\|\s*!permsLoaded\s*\)\s*return/);
      expect(dashSrc).toMatch(/if\s*\(\s*canAccess\(activeTab\)\s*\)\s*return/);
      // Falls back to firstAllowedTab
      expect(dashSrc).toMatch(/firstAllowedTab\(\[[^\]]*appointments[^\]]*\]\)/);
    });

    it('PS1.A.12 handleNavigate guards via canAccess on permsLoaded', () => {
      expect(dashSrc).toMatch(/permsLoaded\s*&&\s*!canAccess\(tabId\)/);
    });
  });

  describe('PS1.B — Filter behavior (per role)', () => {
    // Build perm maps from seed groups for each role
    const rolePermissions = Object.fromEntries(
      DEFAULT_PERMISSION_GROUPS.map(g => [g.permissionGroupId, g.permissions])
    );

    function visibleTabs(perms, isAdmin) {
      const allIds = [
        ...PINNED_ITEMS.map(i => i.id),
        ...NAV_SECTIONS.flatMap(s => s.items.map(i => i.id)),
      ];
      return filterAllowedTabs(allIds, perms, isAdmin);
    }

    it('PS1.B.1 Owner (admin bypass) sees ALL tabs', () => {
      const visible = visibleTabs(rolePermissions['gp-owner'], true);
      const total = PINNED_ITEMS.length + NAV_SECTIONS.flatMap(s => s.items).length;
      expect(visible.length).toBe(total);
    });

    it('PS1.B.2 Manager (no admin) sees most but not master-data CRUD tabs', () => {
      const perms = rolePermissions['gp-manager'];
      // Manager should see: appointments, customers, sales, quotations, online-sales, etc.
      expect(canAccessTab('appointments', perms, false)).toBe(true);
      expect(canAccessTab('sales', perms, false)).toBe(true);
      expect(canAccessTab('customers', perms, false)).toBe(true);
      // But NOT master-data adminOnly tabs
      expect(canAccessTab('permission-groups', perms, false)).toBe(false);
      expect(canAccessTab('staff', perms, false)).toBe(false);
      expect(canAccessTab('branches', perms, false)).toBe(false);
    });

    it('PS1.B.3 Front-desk sees customer/appointment/sale-view + marketing READ', () => {
      const perms = rolePermissions['gp-frontdesk'];
      expect(canAccessTab('appointments', perms, false)).toBe(true);
      expect(canAccessTab('customers', perms, false)).toBe(true);
      expect(canAccessTab('sales', perms, false)).toBe(true); // sale_view granted
      // Marketing tabs allow VIEW (front-desk has *_view perms); button-level
      // *_management gating happens in Phase 13.5.3.
      expect(canAccessTab('promotions', perms, false)).toBe(true); // promotion_view
      expect(canAccessTab('coupons', perms, false)).toBe(true);    // coupon_view
      expect(canAccessTab('vouchers', perms, false)).toBe(true);   // voucher_view
      // But adminOnly master-data still blocked
      expect(canAccessTab('staff', perms, false)).toBe(false);
      expect(canAccessTab('permission-groups', perms, false)).toBe(false);
    });

    it('PS1.B.4 Doctor sees treatment-related tabs but not master CRUD', () => {
      const perms = rolePermissions['gp-doctor'];
      expect(canAccessTab('appointments', perms, false)).toBe(true);
      expect(canAccessTab('customers', perms, false)).toBe(true); // customer_view
      // Doctor has report_treatment so reports family is mostly accessible
      expect(canAccessTab('permission-groups', perms, false)).toBe(false);
      expect(canAccessTab('doctors', perms, false)).toBe(false); // adminOnly
    });

    it('PS1.B.5 Nurse sees treatment + stock view, no marketing', () => {
      const perms = rolePermissions['gp-nurse'];
      expect(canAccessTab('appointments', perms, false)).toBe(true);
      expect(canAccessTab('customers', perms, false)).toBe(true);
      expect(canAccessTab('stock', perms, false)).toBe(true); // stock_movement
      expect(canAccessTab('promotions', perms, false)).toBe(false);
    });

    it('PS1.B.6 firstAllowedTab returns appointments when granted', () => {
      const perms = rolePermissions['gp-frontdesk'];
      expect(firstAllowedTab(perms, false, ['appointments', 'customers'])).toBe('appointments');
    });

    it('PS1.B.7 firstAllowedTab falls back through preference order', () => {
      const limitedPerms = { customer_view: true };
      // appointments needs appointment* — not granted; customers needs customer_view → granted
      expect(firstAllowedTab(limitedPerms, false, ['appointments', 'customers'])).toBe('customers');
    });

    it('PS1.B.8 firstAllowedTab returns null when nothing matches', () => {
      // No permissions, not admin, candidates that all require something
      expect(firstAllowedTab({}, false, ['appointments', 'sales'])).toBe(null);
    });
  });

  describe('PS1.C — Empty section collapse', () => {
    it('PS1.C.1 master-data section becomes empty for non-admin', () => {
      // Every master-data item is adminOnly → non-admin sees zero items
      const masterSection = NAV_SECTIONS.find(s => s.id === 'master');
      expect(masterSection).toBeTruthy();
      const visible = masterSection.items.filter(it =>
        canAccessTab(it.id, { customer_view: true }, false)
      );
      // Only df-groups + staff-schedules unlock via specific permissions
      // (per Phase 13.5.0 tabPermissions); without those specific perms, 0
      expect(visible).toHaveLength(0);
    });

    it('PS1.C.2 master-data section unlocks df-groups + staff-schedules with specific perms', () => {
      const masterSection = NAV_SECTIONS.find(s => s.id === 'master');
      const visible = masterSection.items.filter(it =>
        canAccessTab(it.id, {
          df_group: true,
          user_schedule_management: true,
        }, false)
      );
      expect(visible.map(v => v.id).sort()).toEqual(['df-groups', 'staff-schedules']);
    });

    it('PS1.C.3 every nav section has at least 1 item visible to admin', () => {
      // Sanity check: NO admin-bypass section is unreachable for owner
      for (const section of NAV_SECTIONS) {
        const visible = section.items.filter(it => canAccessTab(it.id, {}, true));
        expect(visible.length).toBeGreaterThan(0);
      }
    });
  });
});
