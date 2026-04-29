// Phase 16.3 — full-flow simulate per Rule I.
//
// End-to-end pure-helper chain:
//   admin saves config → mergeSystemConfigDefaults → computeChangedFields →
//   audit doc shape → tabPermissions.canAccessTab merges override → user
//   render decision matches expected.
//
// + adversarial inputs covering Q1-D + Q2-C + Q3-A + Q4-C contracts.
// + cross-file source-grep regression that wires together (UI → helper → rules).

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  mergeSystemConfigDefaults,
  validateSystemConfigPatch,
  computeChangedFields,
} from '../src/lib/systemConfigClient.js';
import { canAccessTab, applyTabOverride, TAB_PERMISSION_MAP } from '../src/lib/tabPermissions.js';
import { ALL_PERMISSION_KEYS } from '../src/lib/permissionGroupValidation.js';

const SYSTEM_TAB_SRC = readFileSync(resolve(__dirname, '../src/components/backend/SystemSettingsTab.jsx'), 'utf-8');
const AUDIT_PANEL_SRC = readFileSync(resolve(__dirname, '../src/components/backend/SystemConfigAuditPanel.jsx'), 'utf-8');
const NAV_CFG_SRC = readFileSync(resolve(__dirname, '../src/components/backend/nav/navConfig.js'), 'utf-8');
const BD_SRC = readFileSync(resolve(__dirname, '../src/pages/BackendDashboard.jsx'), 'utf-8');
const PG_SRC = readFileSync(resolve(__dirname, '../src/lib/permissionGroupValidation.js'), 'utf-8');

describe('Phase 16.3 FS.A — end-to-end flow simulate', () => {
  test('A.1 — admin sets tabOverride.staff-schedules.hidden=true; non-admin can no longer access', () => {
    // Initial empty config + admin permission
    const initial = mergeSystemConfigDefaults(null);
    expect(initial.tabOverrides).toEqual({});

    // Admin saves: hide staff-schedules
    const patch = { tabOverrides: { 'staff-schedules': { hidden: true } } };
    expect(validateSystemConfigPatch(patch)).toBe(null);

    const after = mergeSystemConfigDefaults({ ...initial, ...patch });
    expect(after.tabOverrides['staff-schedules']).toEqual({ hidden: true });

    // Diff captured for audit
    const diff = computeChangedFields(initial, after);
    expect(diff).toEqual(['tabOverrides.staff-schedules']);

    // Non-admin sees no staff-schedules tab even with permission
    const allowed = canAccessTab(
      'staff-schedules',
      { user_schedule_management: true },
      false,
      after.tabOverrides,
    );
    expect(allowed).toBe(false);

    // Admin still sees it (admin bypass overrides hidden — unhide path)
    expect(canAccessTab('staff-schedules', {}, true, after.tabOverrides)).toBe(true);
  });

  test('A.2 — Q4-C: admin toggles allowNegativeStock=false → flag captured for backend gate', () => {
    const initial = mergeSystemConfigDefaults(null);
    expect(initial.featureFlags.allowNegativeStock).toBe(true); // Phase 15.7 default

    const patch = { featureFlags: { allowNegativeStock: false } };
    expect(validateSystemConfigPatch(patch)).toBe(null);

    const after = mergeSystemConfigDefaults({ ...initial, featureFlags: { ...initial.featureFlags, ...patch.featureFlags } });
    expect(after.featureFlags.allowNegativeStock).toBe(false);

    const diff = computeChangedFields(initial, after);
    expect(diff).toEqual(['featureFlags.allowNegativeStock']);
  });

  test('A.3 — admin save defaults: per-section atomic (depositPercent + dateRange in one save)', () => {
    const initial = mergeSystemConfigDefaults(null);
    const patch = { defaults: { depositPercent: 30, dateRange: '90d' } };
    expect(validateSystemConfigPatch(patch)).toBe(null);

    const after = mergeSystemConfigDefaults({
      ...initial,
      defaults: { ...initial.defaults, ...patch.defaults },
    });
    expect(after.defaults.depositPercent).toBe(30);
    expect(after.defaults.dateRange).toBe('90d');
    expect(after.defaults.pointsPerBaht).toBe(0); // unchanged

    const diff = computeChangedFields(initial, after);
    expect(diff).toContain('defaults.depositPercent');
    expect(diff).toContain('defaults.dateRange');
    expect(diff.length).toBe(2);
  });

  test('A.4 — full Q1-D matrix: admin applies hidden + adminOnly + requires together', () => {
    const overrides = {
      'sales': { hidden: true, adminOnly: true, requires: ['extra1', 'extra2'] },
    };
    const merged = applyTabOverride(TAB_PERMISSION_MAP.sales, overrides.sales);
    expect(merged.hidden).toBe(true);
    expect(merged.adminOnly).toBe(true);
    expect(merged.requires).toContain('extra1');
    expect(merged.requires).toContain('extra2');
    // Static requires preserved
    expect(merged.requires.some((k) => TAB_PERMISSION_MAP.sales.requires.includes(k))).toBe(true);
  });
});

describe('Phase 16.3 FS.B — adversarial', () => {
  test('B.1 — applying override to unknown tab → still computes', () => {
    const merged = applyTabOverride({}, { hidden: true });
    expect(merged.hidden).toBe(true);
    expect(merged.requires).toEqual([]);
  });

  test('B.2 — empty patch is a no-op (computeChangedFields returns [])', () => {
    const a = mergeSystemConfigDefaults(null);
    const b = mergeSystemConfigDefaults(null);
    expect(computeChangedFields(a, b)).toEqual([]);
  });

  test('B.3 — Q4-C: setting allowNegativeStock=true (default) explicitly does not produce a "fake" diff', () => {
    const a = mergeSystemConfigDefaults({ featureFlags: { allowNegativeStock: true } });
    const b = mergeSystemConfigDefaults({ featureFlags: { allowNegativeStock: true } });
    expect(computeChangedFields(a, b)).toEqual([]);
  });

  test('B.4 — array dedupe in requires (admin adds same key twice)', () => {
    const merged = applyTabOverride({ requires: ['x'] }, { requires: ['x', 'x', 'y'] });
    expect(merged.requires.sort()).toEqual(['x', 'y']);
  });

  test('B.5 — admin sets hidden:false on a tab with no prior override → empty override (cleaned)', () => {
    // The UI strips false/empty fields before save. validate doesn't block this.
    expect(validateSystemConfigPatch({ tabOverrides: { sales: {} } })).toBe(null);
  });

  test('B.6 — Q4-C: shortfall=0 even with flag-off does NOT throw (no negative case to block)', () => {
    // Pure helper guard: backend code only enters the gate when shortfall > 0
    const fnSrc = readFileSync(resolve(__dirname, '../src/lib/backendClient.js'), 'utf-8');
    const fnStart = fnSrc.indexOf('async function _deductOneItem(');
    const fnEnd = fnSrc.indexOf('\nasync function ', fnStart + 30);
    const body = fnSrc.substring(fnStart, fnEnd > 0 ? fnEnd : fnStart + 14000);
    // Flag check must be WITHIN the shortfall block
    const shortfallIdx = body.indexOf("plan.shortfall > 0");
    const flagIdx = body.indexOf('allowNegativeStock === false', shortfallIdx);
    expect(shortfallIdx).toBeGreaterThan(0);
    expect(flagIdx).toBeGreaterThan(shortfallIdx);
  });
});

describe('Phase 16.3 FS.C — cross-file wiring source-grep', () => {
  test('C.1 — system_config_management permission key registered', () => {
    expect(ALL_PERMISSION_KEYS).toContain('system_config_management');
  });

  test('C.2 — categorised under "ตั้งค่า / ข้อมูลพื้นฐาน" module in permissionGroupValidation', () => {
    expect(PG_SRC).toMatch(/system_config_management[\s\S]{0,200}ตั้งค่าระบบ/);
  });

  test('C.3 — navConfig has system-settings entry', () => {
    expect(NAV_CFG_SRC).toMatch(/id:\s*'system-settings'/);
    expect(NAV_CFG_SRC).toMatch(/label:\s*'ตั้งค่าระบบ'/);
  });

  test('C.4 — BackendDashboard lazy-imports + renders SystemSettingsTab', () => {
    expect(BD_SRC).toMatch(/lazy\(\(\) => import\(['"]\.\.\/components\/backend\/SystemSettingsTab\.jsx['"]\)/);
    expect(BD_SRC).toMatch(/activeTab === 'system-settings'/);
  });

  test('C.5 — SystemSettingsTab uses useSystemConfig hook', () => {
    expect(SYSTEM_TAB_SRC).toMatch(/useSystemConfig/);
    expect(SYSTEM_TAB_SRC).toMatch(/from '\.\.\/\.\.\/hooks\/useSystemConfig\.js'/);
  });

  test('C.6 — SystemSettingsTab gated by isAdmin + canManage permission', () => {
    expect(SYSTEM_TAB_SRC).toMatch(/useTabAccess/);
    expect(SYSTEM_TAB_SRC).toMatch(/useHasPermission\(['"]system_config_management['"]\)/);
  });

  test('C.7 — SystemSettingsTab calls saveSystemConfig with executedBy from auth', () => {
    expect(SYSTEM_TAB_SRC).toMatch(/saveSystemConfig\(\{/);
    expect(SYSTEM_TAB_SRC).toMatch(/executedBy/);
    expect(SYSTEM_TAB_SRC).toMatch(/auth\.currentUser/);
  });

  test('C.8 — SystemConfigAuditPanel uses onSnapshot listener (real-time)', () => {
    expect(AUDIT_PANEL_SRC).toMatch(/onSnapshot/);
    expect(AUDIT_PANEL_SRC).toMatch(/be_admin_audit/);
    expect(AUDIT_PANEL_SRC).toMatch(/system_config_update/);
  });
});

describe('Phase 16.3 FS.D — Phase 16 plan invariants', () => {
  test('D.1 — TAB_PERMISSION_MAP count is 49 (48 pre-Phase-16.1 + smart-audience)', () => {
    const count = Object.keys(TAB_PERMISSION_MAP).length;
    expect(count).toBe(49);
  });

  test('D.2 — Phase 16.3 doesn’t break existing tab gates (smoke test)', () => {
    // Sample 5 well-known tabs work as before
    expect(canAccessTab('appointments', { appointment: true }, false)).toBe(true);
    expect(canAccessTab('customers', { customer_view: true }, false)).toBe(true);
    expect(canAccessTab('sales', { sale_view: true }, false)).toBe(true);
    expect(canAccessTab('reports', { dashboard: true }, false)).toBe(true);
    expect(canAccessTab('staff', {}, true)).toBe(true); // adminOnly
  });

  test('D.3 — Phase 16.3 marker present in core files', () => {
    expect(SYSTEM_TAB_SRC).toMatch(/Phase 16\.3/);
    expect(AUDIT_PANEL_SRC).toMatch(/Phase 16\.3/);
    expect(NAV_CFG_SRC).toMatch(/Phase 16\.3/);
    expect(PG_SRC).toMatch(/Phase 16\.3/);
  });
});
