// Phase 16.3 — systemConfigClient.js helper unit tests.
//
// Pure-helper coverage:
//   - mergeSystemConfigDefaults — defaults applied to missing fields
//   - validateSystemConfigPatch — accepts/rejects patches per Q1+Q4 schema
//   - computeChangedFields — diff before/after for audit emit
//   - readPath — dotted-path read with safe null-walk
//
// Source-grep guards:
//   - SYSTEM_CONFIG_DEFAULTS frozen (Object.freeze)
//   - VALID_DATE_RANGES enum complete
//   - V36 (sticky) source-grep no master_data reads in this helper

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  mergeSystemConfigDefaults,
  validateSystemConfigPatch,
  computeChangedFields,
  readPath,
  SYSTEM_CONFIG_DEFAULTS,
  __SYSTEM_CONFIG_VALID_DATE_RANGES as VALID_DATE_RANGES,
} from '../src/lib/systemConfigClient.js';

const SCC_SRC = readFileSync(resolve(__dirname, '../src/lib/systemConfigClient.js'), 'utf-8');

describe('Phase 16.3 SC.A — defaults merge', () => {
  test('A.1 — null input → all defaults applied', () => {
    const m = mergeSystemConfigDefaults(null);
    expect(m.tabOverrides).toEqual({});
    expect(m.defaults.depositPercent).toBe(0);
    expect(m.defaults.pointsPerBaht).toBe(0);
    expect(m.defaults.dateRange).toBe('30d');
    expect(m.featureFlags.allowNegativeStock).toBe(true);
  });

  test('A.2 — partial input → missing fields filled', () => {
    const m = mergeSystemConfigDefaults({ defaults: { depositPercent: 25 } });
    expect(m.defaults.depositPercent).toBe(25);
    expect(m.defaults.pointsPerBaht).toBe(0); // default applied
    expect(m.featureFlags.allowNegativeStock).toBe(true); // default applied
  });

  test('A.3 — invalid dateRange → coerced to default', () => {
    const m = mergeSystemConfigDefaults({ defaults: { dateRange: 'forever' } });
    expect(m.defaults.dateRange).toBe('30d'); // default
  });

  test('A.4 — featureFlags.allowNegativeStock=false preserved', () => {
    const m = mergeSystemConfigDefaults({ featureFlags: { allowNegativeStock: false } });
    expect(m.featureFlags.allowNegativeStock).toBe(false);
  });

  test('A.5 — _version + _updatedBy fields preserved when present', () => {
    const m = mergeSystemConfigDefaults({ _version: 5, _updatedBy: 'admin@x.com' });
    expect(m._version).toBe(5);
    expect(m._updatedBy).toBe('admin@x.com');
  });

  test('A.6 — missing _version → 0', () => {
    const m = mergeSystemConfigDefaults({});
    expect(m._version).toBe(0);
  });

  test('A.7 — non-numeric depositPercent → coerced to default', () => {
    const m = mergeSystemConfigDefaults({ defaults: { depositPercent: 'abc' } });
    expect(m.defaults.depositPercent).toBe(0);
  });

  test('A.8 — SYSTEM_CONFIG_DEFAULTS is frozen', () => {
    expect(Object.isFrozen(SYSTEM_CONFIG_DEFAULTS)).toBe(true);
    expect(Object.isFrozen(SYSTEM_CONFIG_DEFAULTS.defaults)).toBe(true);
    expect(Object.isFrozen(SYSTEM_CONFIG_DEFAULTS.featureFlags)).toBe(true);
  });

  test('A.9 — VALID_DATE_RANGES enum has all 8 entries', () => {
    expect(VALID_DATE_RANGES).toEqual(['7d', '30d', '90d', '180d', '1y', 'mtd', 'qtd', 'ytd']);
  });
});

describe('Phase 16.3 SC.B — patch validation (Q1 + Q4 shapes)', () => {
  test('B.1 — accepts empty patch', () => {
    expect(validateSystemConfigPatch({})).toBe(null);
  });

  test('B.2 — rejects null/non-object patch', () => {
    expect(validateSystemConfigPatch(null)).toMatch(/object/);
    expect(validateSystemConfigPatch('hi')).toMatch(/object/);
  });

  test('B.3 — Q1-D tabOverrides: hidden + adminOnly + requires accepted', () => {
    expect(validateSystemConfigPatch({
      tabOverrides: {
        'staff-schedules': { hidden: true },
        'reports': { adminOnly: true },
        'sales': { requires: ['extra_perm'] },
        'customers': { hidden: true, adminOnly: true, requires: ['a', 'b'] },
      },
    })).toBe(null);
  });

  test('B.4 — rejects non-array requires', () => {
    expect(validateSystemConfigPatch({
      tabOverrides: { 'sales': { requires: 'not-array' } },
    })).toMatch(/requires must be an array/);
  });

  test('B.5 — rejects non-string in requires array', () => {
    expect(validateSystemConfigPatch({
      tabOverrides: { 'sales': { requires: ['ok', 123, ''] } },
    })).toMatch(/non-empty strings/);
  });

  test('B.6 — rejects non-boolean hidden/adminOnly', () => {
    expect(validateSystemConfigPatch({
      tabOverrides: { 'sales': { hidden: 'yes' } },
    })).toMatch(/hidden must be boolean/);
    expect(validateSystemConfigPatch({
      tabOverrides: { 'sales': { adminOnly: 1 } },
    })).toMatch(/adminOnly must be boolean/);
  });

  test('B.7 — defaults.depositPercent must be 0-100', () => {
    expect(validateSystemConfigPatch({ defaults: { depositPercent: 50 } })).toBe(null);
    expect(validateSystemConfigPatch({ defaults: { depositPercent: -1 } })).toMatch(/0-100/);
    expect(validateSystemConfigPatch({ defaults: { depositPercent: 101 } })).toMatch(/0-100/);
  });

  test('B.8 — defaults.pointsPerBaht must be ≥ 0', () => {
    expect(validateSystemConfigPatch({ defaults: { pointsPerBaht: 0.5 } })).toBe(null);
    expect(validateSystemConfigPatch({ defaults: { pointsPerBaht: -1 } })).toMatch(/≥ 0/);
  });

  test('B.9 — defaults.dateRange must be enum', () => {
    expect(validateSystemConfigPatch({ defaults: { dateRange: '30d' } })).toBe(null);
    expect(validateSystemConfigPatch({ defaults: { dateRange: 'forever' } })).toMatch(/dateRange must be one of/);
  });

  test('B.10 — Q4 featureFlags.allowNegativeStock must be boolean', () => {
    expect(validateSystemConfigPatch({ featureFlags: { allowNegativeStock: false } })).toBe(null);
    expect(validateSystemConfigPatch({ featureFlags: { allowNegativeStock: 'yes' } })).toMatch(/allowNegativeStock must be boolean/);
  });
});

describe('Phase 16.3 SC.C — computeChangedFields (audit diff)', () => {
  test('C.1 — empty diff returns []', () => {
    const before = mergeSystemConfigDefaults(null);
    const after = mergeSystemConfigDefaults(null);
    expect(computeChangedFields(before, after)).toEqual([]);
  });

  test('C.2 — depositPercent change captured', () => {
    const before = mergeSystemConfigDefaults({ defaults: { depositPercent: 0 } });
    const after = mergeSystemConfigDefaults({ defaults: { depositPercent: 30 } });
    expect(computeChangedFields(before, after)).toEqual(['defaults.depositPercent']);
  });

  test('C.3 — multiple defaults changes captured', () => {
    const before = mergeSystemConfigDefaults({ defaults: { depositPercent: 0, pointsPerBaht: 0, dateRange: '30d' } });
    const after = mergeSystemConfigDefaults({ defaults: { depositPercent: 30, pointsPerBaht: 0.01, dateRange: '90d' } });
    const diff = computeChangedFields(before, after);
    expect(diff).toContain('defaults.depositPercent');
    expect(diff).toContain('defaults.pointsPerBaht');
    expect(diff).toContain('defaults.dateRange');
    expect(diff.length).toBe(3);
  });

  test('C.4 — featureFlags.allowNegativeStock toggle captured', () => {
    const before = mergeSystemConfigDefaults({ featureFlags: { allowNegativeStock: true } });
    const after = mergeSystemConfigDefaults({ featureFlags: { allowNegativeStock: false } });
    expect(computeChangedFields(before, after)).toEqual(['featureFlags.allowNegativeStock']);
  });

  test('C.5 — tabOverrides.<id> per-tab diff', () => {
    const before = mergeSystemConfigDefaults({ tabOverrides: { sales: { hidden: false } } });
    const after = mergeSystemConfigDefaults({ tabOverrides: { sales: { hidden: true } } });
    expect(computeChangedFields(before, after)).toEqual(['tabOverrides.sales']);
  });

  test('C.6 — adding a new override key captured', () => {
    const before = mergeSystemConfigDefaults({ tabOverrides: {} });
    const after = mergeSystemConfigDefaults({ tabOverrides: { 'staff-schedules': { adminOnly: true } } });
    expect(computeChangedFields(before, after)).toEqual(['tabOverrides.staff-schedules']);
  });

  test('C.7 — removing an override key captured', () => {
    const before = mergeSystemConfigDefaults({ tabOverrides: { 'staff-schedules': { adminOnly: true } } });
    const after = mergeSystemConfigDefaults({ tabOverrides: {} });
    expect(computeChangedFields(before, after)).toEqual(['tabOverrides.staff-schedules']);
  });
});

describe('Phase 16.3 SC.D — readPath dotted-path read', () => {
  test('D.1 — single-level path', () => {
    expect(readPath({ a: 1 }, 'a')).toBe(1);
  });

  test('D.2 — nested path', () => {
    expect(readPath({ a: { b: { c: 42 } } }, 'a.b.c')).toBe(42);
  });

  test('D.3 — missing path returns null (not undefined)', () => {
    expect(readPath({ a: 1 }, 'a.b.c')).toBe(null);
  });

  test('D.4 — null/empty obj/path returns null', () => {
    expect(readPath(null, 'a')).toBe(null);
    expect(readPath({ a: 1 }, '')).toBe(null);
  });

  test('D.5 — works with Q1 tabOverrides shape', () => {
    const cfg = mergeSystemConfigDefaults({ tabOverrides: { sales: { hidden: true } } });
    expect(readPath(cfg, 'tabOverrides.sales')).toEqual({ hidden: true });
  });
});

describe('Phase 16.3 SC.E — V36-tris source-grep + iron-clad H', () => {
  test('E.1 — NO master_data reads in systemConfigClient.js', () => {
    expect(SCC_SRC).not.toMatch(/master_data/);
  });

  test('E.2 — only writes to clinic_settings/system_config', () => {
    expect(SCC_SRC).toMatch(/SYSTEM_CONFIG_DOC_ID = 'system_config'/);
    expect(SCC_SRC).toMatch(/'clinic_settings'/);
  });

  test('E.3 — saveSystemConfig uses writeBatch (atomic with audit doc)', () => {
    expect(SCC_SRC).toMatch(/writeBatch/);
    expect(SCC_SRC).toMatch(/be_admin_audit/);
  });

  test('E.4 — Q3-A: every save emits audit doc with auditId="system-config-{ts}"', () => {
    expect(SCC_SRC).toMatch(/auditId\s*=\s*`system-config-\$\{ts\}`/);
    expect(SCC_SRC).toMatch(/action:\s*'system_config_update'/);
  });

  test('E.5 — Q1-D: tabOverrides validation accepts hidden + requires + adminOnly', () => {
    expect(SCC_SRC).toMatch(/override\.hidden/);
    expect(SCC_SRC).toMatch(/override\.requires/);
    expect(SCC_SRC).toMatch(/override\.adminOnly/);
  });
});
