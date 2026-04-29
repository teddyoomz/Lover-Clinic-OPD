// Phase 16.3 — tabPermissions.js override merge regression bank.
//
// Q1-D: per-tab overrides accept all 3 patterns (hidden / requires / adminOnly).
// Override merges on top of the static TAB_PERMISSION_MAP without mutating it.
//
// Source-grep guards:
//   - TAB_PERMISSION_MAP is Object.freeze'd (mutation impossible at runtime)
//   - canAccessTab signature: (tabId, permissions, isAdmin, overrides?)
//   - applyTabOverride pure helper exported

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  TAB_PERMISSION_MAP,
  canAccessTab,
  filterAllowedTabs,
  firstAllowedTab,
  applyTabOverride,
} from '../src/lib/tabPermissions.js';

const TP_SRC = readFileSync(resolve(__dirname, '../src/lib/tabPermissions.js'), 'utf-8');

describe('Phase 16.3 TPO.A — applyTabOverride pure helper', () => {
  test('A.1 — null override returns static gate verbatim', () => {
    const sg = { requires: ['customer_management'] };
    const merged = applyTabOverride(sg, null);
    expect(merged).toEqual({ requires: ['customer_management'], adminOnly: false, hidden: false });
  });

  test('A.2 — Q1-D hidden:true sets hidden flag', () => {
    const merged = applyTabOverride({ requires: ['x'] }, { hidden: true });
    expect(merged.hidden).toBe(true);
  });

  test('A.3 — Q1-D requires[]: adds + dedupes', () => {
    const merged = applyTabOverride(
      { requires: ['x', 'y'] },
      { requires: ['y', 'z'] },
    );
    expect(merged.requires.sort()).toEqual(['x', 'y', 'z']);
  });

  test('A.4 — Q1-D adminOnly toggle to true', () => {
    const merged = applyTabOverride({ requires: ['x'] }, { adminOnly: true });
    expect(merged.adminOnly).toBe(true);
  });

  test('A.5 — Q1-D adminOnly toggle to false (override static true)', () => {
    const merged = applyTabOverride({ adminOnly: true }, { adminOnly: false });
    expect(merged.adminOnly).toBe(false);
  });

  test('A.6 — combined Q1-D: hidden + adminOnly + requires together', () => {
    const merged = applyTabOverride(
      { requires: ['a'] },
      { hidden: true, adminOnly: true, requires: ['b'] },
    );
    expect(merged.hidden).toBe(true);
    expect(merged.adminOnly).toBe(true);
    expect(merged.requires.sort()).toEqual(['a', 'b']);
  });

  test('A.7 — does NOT mutate input static gate', () => {
    const sg = { requires: ['x'] };
    applyTabOverride(sg, { requires: ['y'] });
    expect(sg).toEqual({ requires: ['x'] }); // unchanged
  });
});

describe('Phase 16.3 TPO.B — canAccessTab with overrides', () => {
  test('B.1 — admin bypass still works regardless of override', () => {
    const overrides = { sales: { hidden: true, adminOnly: true } };
    expect(canAccessTab('sales', {}, true, overrides)).toBe(true);
  });

  test('B.2 — hidden:true blocks non-admin even with permission', () => {
    const overrides = { sales: { hidden: true } };
    expect(canAccessTab('sales', { sale_management: true }, false, overrides)).toBe(false);
  });

  test('B.3 — adminOnly:true blocks non-admin even with permission', () => {
    const overrides = { sales: { adminOnly: true } };
    expect(canAccessTab('sales', { sale_management: true }, false, overrides)).toBe(false);
  });

  test('B.4 — adminOnly:false on a static-adminOnly tab → unlocks via permissions', () => {
    // Pick a static-adminOnly tab (e.g. branches)
    expect(TAB_PERMISSION_MAP.branches.adminOnly).toBe(true);
    const overrides = { branches: { adminOnly: false, requires: ['branch_management'] } };
    expect(canAccessTab('branches', { branch_management: true }, false, overrides)).toBe(true);
    // Without permission: still blocked
    expect(canAccessTab('branches', {}, false, overrides)).toBe(false);
  });

  test('B.5 — added requires[]: any-of merge works', () => {
    const overrides = { sales: { requires: ['extra_perm'] } };
    expect(canAccessTab('sales', { extra_perm: true }, false, overrides)).toBe(true);
    expect(canAccessTab('sales', { sale_management: true }, false, overrides)).toBe(true);
    expect(canAccessTab('sales', {}, false, overrides)).toBe(false);
  });

  test('B.6 — overrides=undefined → static behaviour preserved (anti-regression)', () => {
    expect(canAccessTab('sales', { sale_management: true }, false)).toBe(true);
    expect(canAccessTab('branches', {}, true)).toBe(true);  // admin
    expect(canAccessTab('branches', {}, false)).toBe(false); // adminOnly default
  });

  test('B.7 — empty overrides object → static behaviour preserved', () => {
    expect(canAccessTab('sales', { sale_management: true }, false, {})).toBe(true);
  });
});

describe('Phase 16.3 TPO.C — filterAllowedTabs + firstAllowedTab respect overrides', () => {
  test('C.1 — filterAllowedTabs hides tab with override.hidden', () => {
    const overrides = { sales: { hidden: true } };
    const allowed = filterAllowedTabs(
      ['appointments', 'sales', 'customers'],
      { sale_management: true, customer_view: true, appointment: true },
      false,
      overrides,
    );
    expect(allowed).not.toContain('sales');
    expect(allowed).toContain('customers');
  });

  test('C.2 — firstAllowedTab respects overrides', () => {
    const overrides = { appointments: { hidden: true }, customers: { hidden: true } };
    const id = firstAllowedTab(
      { sale_management: true, appointment: true, customer_view: true },
      false,
      ['appointments', 'customers', 'sales'],
      overrides,
    );
    expect(id).toBe('sales');
  });
});

describe('Phase 16.3 TPO.D — system-settings tab gate', () => {
  test('D.1 — system-settings tab is registered in TAB_PERMISSION_MAP', () => {
    expect(TAB_PERMISSION_MAP['system-settings']).toBeDefined();
  });

  test('D.2 — system-settings requires system_config_management permission', () => {
    expect(TAB_PERMISSION_MAP['system-settings'].requires).toContain('system_config_management');
  });

  test('D.3 — admin claim bypass works for system-settings', () => {
    expect(canAccessTab('system-settings', {}, true)).toBe(true);
  });

  test('D.4 — without admin + without permission → blocked', () => {
    expect(canAccessTab('system-settings', {}, false)).toBe(false);
  });

  test('D.5 — with permission → allowed', () => {
    expect(canAccessTab('system-settings', { system_config_management: true }, false)).toBe(true);
  });
});

describe('Phase 16.3 TPO.E — anti-regression source-grep', () => {
  test('E.1 — TAB_PERMISSION_MAP uses Object.freeze (immutable)', () => {
    expect(Object.isFrozen(TAB_PERMISSION_MAP)).toBe(true);
  });

  test('E.2 — canAccessTab signature accepts 4th `overrides` param', () => {
    expect(TP_SRC).toMatch(/export function canAccessTab\(tabId, permissions, isAdmin, overrides\)/);
  });

  test('E.3 — applyTabOverride pure helper exported', () => {
    expect(TP_SRC).toMatch(/export function applyTabOverride\(staticGate, override\)/);
  });

  test('E.4 — applyTabOverride does NOT mutate TAB_PERMISSION_MAP', () => {
    // Source: must use the spread/Set pattern (not `.push` on the static array)
    expect(TP_SRC).toMatch(/Array\.from\(new Set\(\[\.\.\.baseReq, \.\.\.addReq\]\)\)/);
    expect(TP_SRC).not.toMatch(/TAB_PERMISSION_MAP\[\w+\]\s*=/);
  });

  test('E.5 — Phase 16.3 marker comment present', () => {
    expect(TP_SRC).toMatch(/Phase 16\.3 \(2026-04-29\)/);
  });

  test('E.6 — system-settings nav entry registered', () => {
    expect(TP_SRC).toMatch(/'system-settings':\s*\{\s*requires:\s*\['system_config_management'\]/);
  });

  test('E.7 — pre-Phase-16.3 invariants (existing 45 tabs) NOT broken', () => {
    const tabIds = Object.keys(TAB_PERMISSION_MAP);
    expect(tabIds.length).toBeGreaterThanOrEqual(46); // 45 + system-settings
    // Spot-check well-known tabs
    expect(tabIds).toContain('appointments');
    expect(tabIds).toContain('customers');
    expect(tabIds).toContain('sales');
    expect(tabIds).toContain('reports');
    expect(tabIds).toContain('masterdata');
  });
});
