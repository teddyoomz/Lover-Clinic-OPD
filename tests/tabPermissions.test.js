// ─── Phase 13.5 · tab permission gate tests ──────────────────────────────
import { describe, it, expect } from 'vitest';
import {
  canAccessTab, filterAllowedTabs, firstAllowedTab, TAB_PERMISSION_MAP,
} from '../src/lib/tabPermissions.js';

describe('canAccessTab — admin bypass', () => {
  it('TP1: admin sees everything', () => {
    for (const tabId of Object.keys(TAB_PERMISSION_MAP)) {
      expect(canAccessTab(tabId, {}, true)).toBe(true);
    }
  });
  it('TP2: admin bypass works without permissions arg', () => {
    expect(canAccessTab('masterdata', null, true)).toBe(true);
  });
});

describe('canAccessTab — permission match', () => {
  it('TP3: any-of required permission unlocks tab', () => {
    expect(canAccessTab('sales', { sale_view: true }, false)).toBe(true);
    expect(canAccessTab('sales', { sale_management: true }, false)).toBe(true);
  });
  it('TP4: missing required permission blocks', () => {
    expect(canAccessTab('sales', { unrelated: true }, false)).toBe(false);
  });
  it('TP5: explicit false blocks', () => {
    expect(canAccessTab('sales', { sale_view: false }, false)).toBe(false);
  });
});

describe('canAccessTab — adminOnly', () => {
  it('TP6: adminOnly tab blocked for non-admin even with many permissions', () => {
    expect(canAccessTab('masterdata', { customer_view: true, sale_view: true }, false)).toBe(false);
  });
  it('TP7: master-data tabs all blocked for non-admin', () => {
    const masterTabs = ['product-groups', 'product-units', 'medical-instruments',
      'holidays', 'branches', 'permission-groups', 'products', 'courses'];
    for (const t of masterTabs) {
      expect(canAccessTab(t, { customer_view: true }, false)).toBe(false);
    }
  });
  it('TP8: staff-schedules overrides adminOnly when schedule perm granted', () => {
    // Phase 13.2 schedule edit needs staff permission, not pure admin.
    expect(canAccessTab('staff-schedules', { user_schedule_management: true }, false)).toBe(true);
  });
  it('TP9: df-groups unlocks via df_group permission (not admin-only)', () => {
    expect(canAccessTab('df-groups', { df_group: true }, false)).toBe(true);
  });
});

describe('canAccessTab — edge cases', () => {
  it('TP10: unknown tab defaults to allow (better to surface)', () => {
    expect(canAccessTab('mystery-tab', {}, false)).toBe(true);
  });
  it('TP11: empty/null permissions obj treated as no perms', () => {
    expect(canAccessTab('sales', {}, false)).toBe(false);
    expect(canAccessTab('sales', null, false)).toBe(false);
  });
  it('TP12: reports-df-payout unlocks via doctor_df_management', () => {
    expect(canAccessTab('reports-df-payout', { doctor_df_management: true }, false)).toBe(true);
  });
  it('TP13: quotations unlocks via quotation_view (read-only)', () => {
    expect(canAccessTab('quotations', { quotation_view: true }, false)).toBe(true);
  });
});

describe('filterAllowedTabs', () => {
  it('TP14: filters correctly for limited permission set', () => {
    const perms = { sale_view: true, customer_view: true };
    const allowed = filterAllowedTabs(
      ['sales', 'customers', 'stock', 'masterdata'],
      perms, false,
    );
    expect(allowed).toEqual(['sales', 'customers']);
  });
  it('TP15: admin gets everything', () => {
    const ids = ['sales', 'masterdata', 'staff'];
    expect(filterAllowedTabs(ids, {}, true)).toEqual(ids);
  });
  it('TP16: handles empty input', () => {
    expect(filterAllowedTabs([], {}, false)).toEqual([]);
    expect(filterAllowedTabs(null, {}, false)).toEqual([]);
  });
});

describe('firstAllowedTab', () => {
  // Phase 21.0 (2026-05-06) → Phase 21.0-bis (2026-05-06 EOD) — default
  // candidates list now uses 'appointment-all' (combined all-types overview)
  // as the first preference (semantic successor of legacy 'appointments').
  it('TP17: returns preferred tab when allowed', () => {
    expect(firstAllowedTab({ appointment: true }, false)).toBe('appointment-all');
  });
  it('TP18: falls back to next preference when first blocked', () => {
    expect(firstAllowedTab({ sale_view: true }, false)).toBe('sales');
  });
  it('TP19: admin always gets the first-preference appointment overview', () => {
    expect(firstAllowedTab({}, true)).toBe('appointment-all');
  });
  it('TP20: returns null when no tab accessible', () => {
    expect(firstAllowedTab({}, false)).toBe(null);
  });
});
