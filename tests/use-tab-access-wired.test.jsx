// ─── Phase 13.5.1 wired permission tests ────────────────────────────────
// PT1 group — verifies the wired permission system end-to-end:
//   - deriveState computes isAdmin via 3 paths (bootstrap, owner-group, meta-perm)
//   - non-clinic email never gets admin even with all signals
//   - permissions falls back to {} on missing group
//   - Default seed groups produce sane permission counts
//   - listenToUserPermissions has the expected listener-cluster shape
//
// Pure tests (no Firestore, no React mount) — exercises deriveState
// directly. Source-grep guards lock the wiring shape.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { __deriveStateForTest as deriveState } from '../src/contexts/UserPermissionContext.jsx';
import {
  DEFAULT_PERMISSION_GROUPS,
  seedDefaultPermissionGroups,
} from '../src/lib/seedDefaultPermissionGroups.js';
import { ALL_PERMISSION_KEYS } from '../src/lib/permissionGroupValidation.js';

describe('PT1 — Phase 13.5.1 permission system wiring', () => {
  describe('PT1.A — deriveState isAdmin paths', () => {
    it('PT1.A.1 BOOTSTRAP: @loverclinic.com email + null staff → isAdmin true', () => {
      const s = deriveState({ uid: 'u1', email: 'admin@loverclinic.com' }, null, null);
      expect(s.isAdmin).toBe(true);
      expect(s.bootstrap).toBe(true);
    });

    it('PT1.A.2 OWNER GROUP: gp-owner permissionGroupId → isAdmin true', () => {
      const staff = { id: 'u1', permissionGroupId: 'gp-owner' };
      const group = { id: 'gp-owner', name: 'Owner', permissions: { dashboard: true } };
      const s = deriveState({ uid: 'u1', email: 'a@loverclinic.com' }, staff, group);
      expect(s.isAdmin).toBe(true);
      expect(s.bootstrap).toBe(false);
    });

    it('PT1.A.3 META PERMISSION: permission_group_management granted → isAdmin true', () => {
      const staff = { id: 'u1', permissionGroupId: 'gp-manager' };
      const group = { id: 'gp-manager', permissions: { permission_group_management: true } };
      const s = deriveState({ uid: 'u1', email: 'a@loverclinic.com' }, staff, group);
      expect(s.isAdmin).toBe(true);
    });

    it('PT1.A.4 NON-CLINIC EMAIL: never admin even with owner group assigned', () => {
      const staff = { id: 'u1', permissionGroupId: 'gp-owner' };
      const group = { id: 'gp-owner', permissions: { permission_group_management: true } };
      const s = deriveState({ uid: 'u1', email: 'attacker@gmail.com' }, staff, group);
      expect(s.isAdmin).toBe(false);
    });

    it('PT1.A.5 NON-OWNER staff w/o meta-perm + non-empty staff → not admin', () => {
      const staff = { id: 'u1', permissionGroupId: 'gp-frontdesk' };
      const group = { id: 'gp-frontdesk', permissions: { customer_view: true } };
      const s = deriveState({ uid: 'u1', email: 'a@loverclinic.com' }, staff, group);
      expect(s.isAdmin).toBe(false);
    });

    it('PT1.A.6 NULL user → not admin', () => {
      const s = deriveState(null, null, null);
      expect(s.isAdmin).toBe(false);
    });

    it('PT1.A.7 USER without email → not admin (email matching fails)', () => {
      const s = deriveState({ uid: 'u1' }, null, null);
      expect(s.isAdmin).toBe(false);
    });

    it('PT1.A.8 EMAIL case-insensitive match', () => {
      const s = deriveState({ uid: 'u1', email: 'ADMIN@LoverClinic.COM' }, null, null);
      expect(s.isAdmin).toBe(true);
    });
  });

  describe('PT1.B — deriveState permissions + hasPermission', () => {
    it('PT1.B.1 admin hasPermission returns true for any key', () => {
      const s = deriveState({ uid: 'u1', email: 'a@loverclinic.com' }, null, null);
      expect(s.hasPermission('sale_view')).toBe(true);
      expect(s.hasPermission('nonexistent_key')).toBe(true);
    });

    it('PT1.B.2 non-admin hasPermission only returns true for granted keys', () => {
      const staff = { id: 'u1', permissionGroupId: 'gp-frontdesk' };
      const group = { permissions: { customer_view: true, appointment: true } };
      const s = deriveState({ uid: 'u1', email: 'fd@loverclinic.com' }, staff, group);
      expect(s.hasPermission('customer_view')).toBe(true);
      expect(s.hasPermission('appointment')).toBe(true);
      expect(s.hasPermission('sale_cancel')).toBe(false);
    });

    it('PT1.B.3 missing group → permissions={} and no permissions granted', () => {
      const staff = { id: 'u1', permissionGroupId: 'gp-deleted' };
      const s = deriveState({ uid: 'u1', email: 'fd@loverclinic.com' }, staff, null);
      expect(s.permissions).toEqual({});
      expect(s.hasPermission('customer_view')).toBe(false);
    });

    it('PT1.B.4 explicit false in permissions does NOT grant', () => {
      const staff = { id: 'u1', permissionGroupId: 'gp-frontdesk' };
      const group = { permissions: { customer_view: false } };
      const s = deriveState({ uid: 'u1', email: 'fd@loverclinic.com' }, staff, group);
      expect(s.hasPermission('customer_view')).toBe(false);
    });
  });

  describe('PT1.C — Default seed groups', () => {
    it('PT1.C.1 has exactly 5 groups', () => {
      expect(DEFAULT_PERMISSION_GROUPS).toHaveLength(5);
    });

    it('PT1.C.2 IDs are stable: gp-owner / gp-manager / gp-frontdesk / gp-nurse / gp-doctor', () => {
      const ids = DEFAULT_PERMISSION_GROUPS.map(g => g.permissionGroupId);
      expect(ids).toEqual(['gp-owner', 'gp-manager', 'gp-frontdesk', 'gp-nurse', 'gp-doctor']);
    });

    it('PT1.C.3 owner has ALL 130 permission keys', () => {
      const owner = DEFAULT_PERMISSION_GROUPS.find(g => g.permissionGroupId === 'gp-owner');
      const grantedKeys = Object.keys(owner.permissions).filter(k => owner.permissions[k] === true);
      expect(grantedKeys).toHaveLength(ALL_PERMISSION_KEYS.length);
      expect(ALL_PERMISSION_KEYS.every(k => owner.permissions[k] === true)).toBe(true);
    });

    it('PT1.C.4 manager EXCLUDES permission/user/branch admin', () => {
      const mgr = DEFAULT_PERMISSION_GROUPS.find(g => g.permissionGroupId === 'gp-manager');
      expect(mgr.permissions.permission_group_management).toBeUndefined();
      expect(mgr.permissions.user_management).toBeUndefined();
      expect(mgr.permissions.branch_management).toBeUndefined();
      // But manager DOES have day-to-day perms
      expect(mgr.permissions.sale_management).toBe(true);
      expect(mgr.permissions.dashboard).toBe(true);
    });

    it('PT1.C.5 front-desk has customer_management + appointment + deposit', () => {
      const fd = DEFAULT_PERMISSION_GROUPS.find(g => g.permissionGroupId === 'gp-frontdesk');
      expect(fd.permissions.customer_management).toBe(true);
      expect(fd.permissions.appointment).toBe(true);
      expect(fd.permissions.deposit).toBe(true);
      // No treatment access
      expect(fd.permissions.treatment_management).toBeUndefined();
    });

    it('PT1.C.6 nurse has treatment + stock view', () => {
      const nurse = DEFAULT_PERMISSION_GROUPS.find(g => g.permissionGroupId === 'gp-nurse');
      expect(nurse.permissions.treatment_management).toBe(true);
      expect(nurse.permissions.stock_movement).toBe(true);
      // No sale management
      expect(nurse.permissions.sale_management).toBeUndefined();
    });

    it('PT1.C.7 doctor has treatment + own-appointment scope', () => {
      const dr = DEFAULT_PERMISSION_GROUPS.find(g => g.permissionGroupId === 'gp-doctor');
      expect(dr.permissions.treatment_management).toBe(true);
      expect(dr.permissions.appointment_self).toBe(true);
      expect(dr.permissions.coming_appointment_self).toBe(true);
      // No general appointment perm
      expect(dr.permissions.appointment).toBeUndefined();
    });

    it('PT1.C.8 every seed group passes the validator', async () => {
      // Run validator over each group to catch shape regressions early.
      const { validatePermissionGroup, normalizePermissionGroup } = await import('../src/lib/permissionGroupValidation.js');
      for (const g of DEFAULT_PERMISSION_GROUPS) {
        const norm = normalizePermissionGroup(g);
        const fail = validatePermissionGroup(norm);
        expect(fail).toBe(null);
      }
    });
  });

  describe('PT1.D — seedDefaultPermissionGroups idempotent', () => {
    it('PT1.D.1 noop when groups already exist', async () => {
      const calls = [];
      const client = {
        listPermissionGroups: async () => [{ id: 'gp-existing' }],
        savePermissionGroup: async (id, data) => { calls.push({ id, data }); },
      };
      const result = await seedDefaultPermissionGroups(client);
      expect(result).toEqual({ seeded: false, count: 1 });
      expect(calls).toEqual([]);
    });

    it('PT1.D.2 seeds 5 when collection empty', async () => {
      const calls = [];
      const client = {
        listPermissionGroups: async () => [],
        savePermissionGroup: async (id, data) => { calls.push({ id, name: data.name }); },
      };
      const result = await seedDefaultPermissionGroups(client);
      expect(result).toEqual({ seeded: true, count: 5 });
      expect(calls.map(c => c.id)).toEqual([
        'gp-owner', 'gp-manager', 'gp-frontdesk', 'gp-nurse', 'gp-doctor',
      ]);
    });

    it('PT1.D.3 throws on bad client shape', async () => {
      await expect(seedDefaultPermissionGroups(null)).rejects.toThrow(/client/);
      await expect(seedDefaultPermissionGroups({})).rejects.toThrow(/client/);
      await expect(seedDefaultPermissionGroups({ listPermissionGroups: () => [] })).rejects.toThrow(/client/);
    });
  });

  describe('PT1.E — Source-grep regression guards', () => {
    const ctxSource = readFileSync(
      resolve(__dirname, '..', 'src/contexts/UserPermissionContext.jsx'),
      'utf-8'
    );
    const hookSource = readFileSync(
      resolve(__dirname, '..', 'src/hooks/useTabAccess.js'),
      'utf-8'
    );
    const appSource = readFileSync(
      resolve(__dirname, '..', 'src/App.jsx'),
      'utf-8'
    );
    const backendSource = readFileSync(
      resolve(__dirname, '..', 'src/lib/backendClient.js'),
      'utf-8'
    );

    it('PT1.E.1 UserPermissionContext exports provider + hook', () => {
      expect(ctxSource).toMatch(/export\s+function\s+UserPermissionProvider/);
      expect(ctxSource).toMatch(/export\s+function\s+useUserPermission/);
    });

    it('PT1.E.2 deriveState gates @loverclinic.com email', () => {
      expect(ctxSource).toMatch(/@loverclinic\\\.com/);
    });

    it('PT1.E.3 useTabAccess.js no longer returns the stub literal isAdmin: true', () => {
      // Anti-regression: previous stub had `isAdmin: true` hardcoded
      // (every user was admin). Wiring must read from useUserPermission().
      expect(hookSource).toMatch(/useUserPermission\(\)/);
      expect(hookSource).not.toMatch(/isAdmin:\s*true,\s*\/\/\s*TODO/);
    });

    it('PT1.E.4 App.jsx imports + mounts UserPermissionProvider for backend route', () => {
      expect(appSource).toMatch(/import\s+\{\s*UserPermissionProvider\s*\}/);
      expect(appSource).toMatch(/<UserPermissionProvider\s+user=\{user\}/);
    });

    it('PT1.E.5 backendClient.js exports listenToUserPermissions', () => {
      expect(backendSource).toMatch(/export\s+function\s+listenToUserPermissions\s*\(\s*uid/);
    });

    it('PT1.E.6 listenToUserPermissions chains staff → group with cleanup', () => {
      // Find function start; take next ~3000 chars (function body is dense).
      const startIdx = backendSource.indexOf('export function listenToUserPermissions');
      expect(startIdx).toBeGreaterThan(0);
      const fn = backendSource.slice(startIdx, startIdx + 3500);
      // Two onSnapshot calls — staff + group
      const snapshots = (fn.match(/onSnapshot\(/g) || []).length;
      expect(snapshots).toBeGreaterThanOrEqual(2);
      // Returns unsub function
      expect(fn).toMatch(/return\s+\(\)\s*=>/);
      // Debounce per listener-cluster pattern
      expect(fn).toMatch(/setTimeout|debounceTimer/);
      // References both staff doc and group doc
      expect(fn).toMatch(/staffDoc\(uid\)/);
      expect(fn).toMatch(/permissionGroupDoc/);
    });
  });
});
