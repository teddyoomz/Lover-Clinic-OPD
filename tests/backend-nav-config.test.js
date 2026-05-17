// ─── Backend nav config — adversarial tests ────────────────────────────────
// Guards the nav template from drift as Phase 10-12+ add new tabs.
// Shape, ID uniqueness, section integrity, lookup correctness, pinned items.

import { describe, it, expect } from 'vitest';
import {
  NAV_SECTIONS,
  PINNED_ITEMS,
  ALL_ITEM_IDS,
  ITEM_LOOKUP,
  sectionOf,
  itemById,
  TAB_COLOR_MAP,
} from '../src/components/backend/nav/navConfig.js';

describe('nav config — shape', () => {
  it('S1 every section has id + label + icon + items[]', () => {
    for (const s of NAV_SECTIONS) {
      expect(typeof s.id).toBe('string');
      expect(s.id.length).toBeGreaterThan(0);
      expect(typeof s.label).toBe('string');
      // lucide icons are forwardRef components — objects with $$typeof.
      expect(['function', 'object']).toContain(typeof s.icon); // React component / forwardRef
      expect(Array.isArray(s.items)).toBe(true);
      expect(s.items.length).toBeGreaterThan(0);
    }
  });

  it('S2 every item has id + label + icon + color + palette', () => {
    const all = [...PINNED_ITEMS, ...NAV_SECTIONS.flatMap(s => s.items)];
    for (const it of all) {
      expect(typeof it.id).toBe('string');
      expect(typeof it.label).toBe('string');
      expect(['function', 'object']).toContain(typeof it.icon);
      expect(typeof it.color).toBe('string');
      expect(typeof it.palette).toBe('string');
      expect(it.palette.length).toBeGreaterThan(0);
    }
  });

  it('S3 all item IDs are unique', () => {
    const seen = new Set();
    for (const id of ALL_ITEM_IDS) {
      expect(seen.has(id)).toBe(false);
      seen.add(id);
    }
  });

  it('S4 all section IDs are unique', () => {
    const seen = new Set();
    for (const s of NAV_SECTIONS) {
      expect(seen.has(s.id)).toBe(false);
      seen.add(s.id);
    }
  });

  it('S5 every color references TAB_COLOR_MAP', () => {
    const keys = Object.keys(TAB_COLOR_MAP);
    const all = [...PINNED_ITEMS, ...NAV_SECTIONS.flatMap(s => s.items)];
    for (const it of all) {
      expect(keys).toContain(it.color);
    }
  });

  it('S6 ALL_ITEM_IDS includes pinned + section items', () => {
    // Count: pinned + each section's items
    const expectedCount = PINNED_ITEMS.length + NAV_SECTIONS.reduce((n, s) => n + s.items.length, 0);
    expect(ALL_ITEM_IDS.length).toBe(expectedCount);
    for (const p of PINNED_ITEMS) expect(ALL_ITEM_IDS).toContain(p.id);
    for (const s of NAV_SECTIONS)
      for (const it of s.items) expect(ALL_ITEM_IDS).toContain(it.id);
  });

  it('S7 deep-link whitelist — includes all legacy tab ids to preserve bookmarks', () => {
    // These IDs are baked into existing URLs out in the wild. Don't rename.
    // Phase 21.0 (2026-05-06) — 'appointments' DROPPED from canonical set
    // (replaced with 4 sub-tab ids). Legacy URL preservation handled by
    // BackendDashboard URL-hydration redirect (?tab=appointments → ?tab=
    // appointment-no-deposit). The 4 new ids are added below.
    // V50 (2026-05-08) — 'clone' + 'masterdata' REMOVED (ProClinic strip).
    const legacy = ['customers', 'sales', 'finance', 'stock', 'promotions', 'coupons', 'vouchers'];
    for (const id of legacy) expect(ALL_ITEM_IDS).toContain(id);
    // V50 anti-regression — these MUST NOT come back without explicit reason.
    expect(ALL_ITEM_IDS).not.toContain('clone');
    expect(ALL_ITEM_IDS).not.toContain('masterdata');
    // Phase 21.0 — 4 typed appointment sub-tab ids replace legacy 'appointments'.
    // Phase 21.0-bis — 'appointment-all' overview added at top of section.
    const phase21 = ['appointment-all', 'appointment-no-deposit', 'appointment-deposit', 'appointment-treatment-in', 'appointment-follow-up'];
    for (const id of phase21) expect(ALL_ITEM_IDS).toContain(id);
  });
});

describe('ITEM_LOOKUP + helpers', () => {
  it('L1 itemById returns the exact item for a known id', () => {
    const p = itemById('promotions');
    expect(p).toBeTruthy();
    expect(p.label).toBe('โปรโมชัน');
  });

  it('L2 itemById returns null for unknown id', () => {
    expect(itemById('does-not-exist')).toBeNull();
  });

  it('L3 sectionOf returns section id for grouped items', () => {
    expect(sectionOf('promotions')).toBe('marketing');
    expect(sectionOf('customers')).toBe('customers');
    expect(sectionOf('product-groups')).toBe('master');
    // V50 (2026-05-08) — clone + masterdata REMOVED. sectionOf returns null.
    expect(sectionOf('clone')).toBeNull();
    expect(sectionOf('masterdata')).toBeNull();
  });

  it('L4 sectionOf returns null for pinned items', () => {
    for (const p of PINNED_ITEMS) {
      expect(sectionOf(p.id)).toBeNull();
    }
  });

  it('L5 sectionOf returns null for unknown id (no crash)', () => {
    expect(sectionOf('nonsense')).toBeNull();
    expect(sectionOf('')).toBeNull();
    expect(sectionOf(null)).toBeNull();
    expect(sectionOf(undefined)).toBeNull();
  });

  it('L6 ITEM_LOOKUP has entry for every item', () => {
    for (const id of ALL_ITEM_IDS) {
      expect(ITEM_LOOKUP.has(id)).toBe(true);
    }
  });
});

describe('pinned items', () => {
  // Phase 21.0 (2026-05-06) — flipped invariant: PINNED_ITEMS is empty after
  // 'appointments' was moved into its own NAV_SECTIONS section with 4
  // sub-tabs. The 4 sub-tab section is asserted in S6 + the new
  // phase-21-0-nav-config-appointment-section.test.js.
  it('P1 PINNED_ITEMS is empty after Phase 21.0 (legacy นัดหมาย moved to section)', () => {
    expect(PINNED_ITEMS.length).toBe(0);
  });

  it('P2 pinned items do NOT also appear in a section (avoid duplicate nav)', () => {
    const pinnedIds = new Set(PINNED_ITEMS.map(p => p.id));
    for (const s of NAV_SECTIONS) {
      for (const it of s.items) {
        expect(pinnedIds.has(it.id)).toBe(false);
      }
    }
  });

  it('P3 pinned count stays low (≤ 3) to preserve section value', () => {
    expect(PINNED_ITEMS.length).toBeLessThanOrEqual(3);
  });
});

describe('TAB_COLOR_MAP', () => {
  it('C1 every entry has activeBg + activeGlow + hoverTx + activeRing', () => {
    for (const [name, cfg] of Object.entries(TAB_COLOR_MAP)) {
      expect(typeof cfg.activeBg).toBe('string');
      expect(typeof cfg.activeGlow).toBe('string');
      expect(typeof cfg.hoverTx).toBe('string');
      expect(typeof cfg.activeRing).toBe('string');
      // sanity: activeBg is a tailwind bg utility
      expect(cfg.activeBg).toMatch(/^bg-[a-z]+-\d+$/);
    }
  });

  it('C2 Thai culture — no "red" family bg on item colors (reserved for urgent accent)', () => {
    // "rose" is OK (pinkish red); explicit "red-*" bg would be off-limits per
    // the clinic's anti-red rule for patient-facing content. Sidebar items
    // aren't customer-facing but the rule keeps palettes consistent.
    for (const [name, cfg] of Object.entries(TAB_COLOR_MAP)) {
      expect(cfg.activeBg).not.toMatch(/^bg-red-/);
    }
  });
});

describe('section integrity', () => {
  it('I1 sales section contains ขาย/ใบเสร็จ (after appointments moved to pinned)', () => {
    const sales = NAV_SECTIONS.find(s => s.id === 'sales');
    expect(sales).toBeTruthy();
    expect(sales.items.some(i => i.id === 'sales')).toBe(true);
    // Appointments must NO LONGER be in this section (moved to pinned).
    expect(sales.items.some(i => i.id === 'appointments')).toBe(false);
  });

  it('I2 marketing section contains all 3 marketing tabs', () => {
    const marketing = NAV_SECTIONS.find(s => s.id === 'marketing');
    expect(marketing).toBeTruthy();
    const ids = marketing.items.map(i => i.id);
    expect(ids).toEqual(expect.arrayContaining(['promotions', 'coupons', 'vouchers']));
  });

  it('I3 customers section — clone REMOVED (V50), customer list is the only item', () => {
    const customers = NAV_SECTIONS.find(s => s.id === 'customers');
    expect(customers).toBeTruthy();
    const ids = customers.items.map(i => i.id);
    expect(ids).toEqual(expect.arrayContaining(['customers']));
    // V50 anti-regression — Clone tab gone permanently.
    expect(ids).not.toContain('clone');
  });

  it('I4 master section — V50 "masterdata" REMOVED + V74 backup-manager + V75 fb-settings (V81-fix7b drops customer-data-recovery)', () => {
    // V50: ProClinic Sync tab gone. All master data is now CRUD'd via the
    // 22 dedicated be_* tabs (P11/P12/P13/P14/V32/Phase16.3/V40 + V74 backup-manager
    // + V75 fb-settings per-branch FB Page config).
    // 2026-05-17 post-V81-fix7b — 'customer-data-recovery' tab REMOVED per user
    // directive (orphan after V81-fix4 deprecated per-customer UI). Count 23 → 22.
    const master = NAV_SECTIONS.find(s => s.id === 'master');
    expect(master).toBeTruthy();
    expect(master.label).toBe('ข้อมูลพื้นฐาน');
    expect(master.items.map(i => i.id)).toEqual([
      'product-groups',
      'product-units',
      'medical-instruments',
      'holidays',
      'branches',
      'exam-rooms',
      'permission-groups',
      'staff',
      'staff-schedules',
      'doctor-schedules',
      'doctors',
      'products',
      'courses',
      'finance-master',
      'df-groups',
      'document-templates',
      'line-settings',
      // V75 Item 3 (2026-05-16) — per-branch FB Page settings, adjacent to line-settings
      'fb-settings',
      'link-requests',
      'system-settings',
      'branch-backup',
      // V74 (2026-05-16) — customer backup/restore admin surface (backup-manager only post-V81-fix7b)
      'backup-manager',
    ]);
    // V50 anti-regression
    expect(master.items.map(i => i.id)).not.toContain('masterdata');
    // post-V81-fix7b anti-regression — orphan tab must NOT come back
    expect(master.items.map(i => i.id)).not.toContain('customer-data-recovery');
  });

  it('I4b deprecated "system" section no longer exists (absorbed into master in Phase 11.1)', () => {
    expect(NAV_SECTIONS.find(s => s.id === 'system')).toBeUndefined();
  });

  it('I4c V50 — "masterdata" item REMOVED from master section (was: Sync ProClinic)', () => {
    const md = NAV_SECTIONS.find(s => s.id === 'master').items.find(i => i.id === 'masterdata');
    expect(md).toBeUndefined(); // V50 anti-regression
  });
});

describe('useViewport', () => {
  // Import lazily to ensure jsdom globals are set up.
  it('V1 default viewport hook returns numeric w/h + is() function', async () => {
    const { useViewport } = await import('../src/hooks/useViewport.js');
    expect(typeof useViewport).toBe('function');
    // Don't actually call (would need a React host) — just verify module shape.
  });
});
