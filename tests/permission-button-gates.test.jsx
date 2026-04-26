// ─── Phase 13.5.3 inline button gate tests ──────────────────────────────
// PB1 group — verifies critical destructive buttons are gated by
// useHasPermission(key). Each gated tab:
//   - imports useHasPermission
//   - declares `const canDelete = useHasPermission('<perm_key>')`
//   - delete button has `disabled={busy || !canDelete}` AND tooltip
//
// Strategy: pure source-grep regression guards (the wiring shape) +
// sanity check that useHasPermission is exported from the hooks file.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { __deriveStateForTest as deriveState } from '../src/contexts/UserPermissionContext.jsx';

const hookSource = readFileSync(
  resolve(__dirname, '..', 'src/hooks/useTabAccess.js'),
  'utf-8'
);

const TAB_GATE_MATRIX = [
  // [tab file, permission key, Thai delete label hint]
  ['PermissionGroupsTab.jsx', 'permission_group_management', 'กลุ่มสิทธิ์'],
  ['StaffTab.jsx',            'user_management',             'พนักงาน'],
  ['DoctorsTab.jsx',          'doctor_management',           'แพทย์'],
  ['BranchesTab.jsx',         'branch_management',           'สาขา'],
  ['HolidaysTab.jsx',         'holiday_setting',             'วันหยุด'],
  ['CouponTab.jsx',           'coupon_management',           'คูปอง'],
  ['PromotionTab.jsx',        'promotion_management',        'โปรโมชัน'],
  ['VoucherTab.jsx',          'voucher_management',          'Voucher'],
];

describe('PB1 — Phase 13.5.3 inline button gates', () => {
  describe('PB1.A — useHasPermission hook export', () => {
    it('PB1.A.1 useTabAccess.js exports useHasPermission', () => {
      expect(hookSource).toMatch(/export\s+function\s+useHasPermission\s*\(\s*key\s*\)/);
    });

    it('PB1.A.2 useHasPermission reads from useUserPermission context', () => {
      expect(hookSource).toMatch(/useHasPermission[\s\S]{0,200}useUserPermission/);
    });

    it('PB1.A.3 returns hasPermission(key) result (not raw permissions[key])', () => {
      // Anti-regression: must use the context's hasPermission (which has
      // admin-bypass logic) rather than direct permissions[key] lookup.
      expect(hookSource).toMatch(/return\s+hasPermission\(key\)/);
    });

    it('PB1.A.4 admin bypass works through useHasPermission via deriveState', () => {
      // Sanity: deriveState's hasPermission returns true for admin
      const s = deriveState({ uid: 'u', email: 'a@loverclinic.com' }, null, null);
      expect(s.hasPermission('any_key')).toBe(true);
    });

    it('PB1.A.5 non-admin denies unrelated keys', () => {
      const staff = { id: 'u', permissionGroupId: 'gp-frontdesk' };
      const group = { permissions: { customer_view: true } };
      const s = deriveState({ uid: 'u', email: 'fd@loverclinic.com' }, staff, group);
      expect(s.hasPermission('user_management')).toBe(false);
    });
  });

  describe('PB1.B — Per-tab gate wiring', () => {
    for (const [file, key /*, label */] of TAB_GATE_MATRIX) {
      const path = resolve(__dirname, '..', 'src/components/backend/', file);
      const src = readFileSync(path, 'utf-8');

      describe(`PB1.B — ${file}`, () => {
        it(`imports useHasPermission`, () => {
          expect(src).toMatch(/import\s+\{\s*useHasPermission\s*\}\s+from\s+['"]\.\.\/\.\.\/hooks\/useTabAccess\.js['"]/);
        });

        it(`declares canDelete bound to ${key}`, () => {
          const re = new RegExp(`canDelete\\s*=\\s*useHasPermission\\(['"]${key}['"]\\)`);
          expect(src).toMatch(re);
        });

        it(`delete button uses canDelete in disabled prop`, () => {
          // Look for a `disabled={busy || !canDelete}` somewhere
          expect(src).toMatch(/disabled=\{[^}]*!canDelete[^}]*\}/);
        });

        it(`delete button shows tooltip when canDelete is false`, () => {
          // title attribute referencing !canDelete
          expect(src).toMatch(/title=\{!canDelete\s*\?[^}]*['"][^'"]*['"][^}]*\}/);
        });
      });
    }
  });

  describe('PB1.C — DepositPanel refund gate', () => {
    const path = resolve(__dirname, '..', 'src/components/backend/DepositPanel.jsx');
    const src = readFileSync(path, 'utf-8');

    it('PB1.C.1 imports useHasPermission', () => {
      expect(src).toMatch(/import\s+\{\s*useHasPermission\s*\}\s+from\s+['"]\.\.\/\.\.\/hooks\/useTabAccess\.js['"]/);
    });

    it('PB1.C.2 declares canRefund on deposit_cancel', () => {
      expect(src).toMatch(/canRefund\s*=\s*useHasPermission\(['"]deposit_cancel['"]\)/);
    });

    it('PB1.C.3 refund button disabled when !canRefund', () => {
      expect(src).toMatch(/handleRefund[\s\S]{0,300}!canRefund/);
    });

    it('PB1.C.4 refund button has tooltip on disabled', () => {
      expect(src).toMatch(/title=\{!canRefund\s*\?[^}]*['"][^'"]*ไม่มีสิทธิ์[^'"]*['"][^}]*\}/);
    });
  });

  describe('PB1.D — Anti-regression: gates only fire on canDelete=false', () => {
    // Source-grep can encode broken behavior (V21 lesson). Pair with
    // deriveState integration to verify the actual permission flow.
    it('PB1.D.1 admin always bypasses (canDelete=true regardless of group)', () => {
      const cases = [
        { user: { email: 'admin@loverclinic.com' }, staff: null, group: null }, // bootstrap
        { user: { email: 'a@loverclinic.com' }, staff: { permissionGroupId: 'gp-owner' }, group: { permissions: {} } }, // owner
      ];
      for (const c of cases) {
        const s = deriveState(c.user, c.staff, c.group);
        expect(s.hasPermission('user_management')).toBe(true);
        expect(s.hasPermission('doctor_management')).toBe(true);
        expect(s.hasPermission('voucher_management')).toBe(true);
      }
    });

    it('PB1.D.2 manager (no permission_group_management) cannot delete permission groups', () => {
      const staff = { permissionGroupId: 'gp-manager' };
      // Manager seed excludes permission_group_management — verify
      const group = {
        permissions: {
          // ALL keys EXCEPT the 3 admin keys
          dashboard: true, sale_management: true, voucher_management: true,
          // permission_group_management omitted
        },
      };
      const s = deriveState({ email: 'm@loverclinic.com' }, staff, group);
      expect(s.hasPermission('permission_group_management')).toBe(false);
      expect(s.hasPermission('user_management')).toBe(false); // also excluded
      expect(s.hasPermission('voucher_management')).toBe(true); // granted
    });

    it('PB1.D.3 front-desk cannot delete coupon (no coupon_management)', () => {
      const staff = { permissionGroupId: 'gp-frontdesk' };
      const group = { permissions: { coupon_view: true } };
      const s = deriveState({ email: 'f@loverclinic.com' }, staff, group);
      expect(s.hasPermission('coupon_management')).toBe(false);
      expect(s.hasPermission('coupon_view')).toBe(true);
    });
  });
});
