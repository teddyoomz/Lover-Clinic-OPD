// ─── Phase 13.1.5 · Nav + BackendDashboard wiring for quotations ──────────
// Focused tests per feedback_test_per_subphase. Validates that the new
// quotations tab is properly registered in navConfig so deep-links resolve,
// Sidebar renders the item, and CmdPalette fuzzy-search can find it.

import { describe, it, expect } from 'vitest';
import {
  NAV_SECTIONS, ALL_ITEM_IDS, ITEM_LOOKUP, sectionOf, itemById,
} from '../src/components/backend/nav/navConfig.js';

describe('Phase 13.1.5 — quotations nav wiring', () => {
  it('QN1: quotations item registered in ALL_ITEM_IDS (deep-link whitelist)', () => {
    expect(ALL_ITEM_IDS).toContain('quotations');
  });

  it('QN2: quotations belongs to the sales section', () => {
    expect(sectionOf('quotations')).toBe('sales');
  });

  it('QN3: quotations item has well-formed metadata', () => {
    const item = itemById('quotations');
    expect(item).toBeTruthy();
    expect(item.label).toBe('ใบเสนอราคา');
    expect(item.color).toBe('rose');
    expect(typeof item.icon).toMatch(/^(function|object)$/);
    expect(item.palette).toMatch(/quotation/i);
    expect(item.palette).toMatch(/เสนอราคา/);
  });

  it('QN4: quotations sits between sales and online-sales in the sales section', () => {
    const sales = NAV_SECTIONS.find((s) => s.id === 'sales');
    const ids = sales.items.map((i) => i.id);
    const salesIdx = ids.indexOf('sales');
    const quotIdx = ids.indexOf('quotations');
    const onlineIdx = ids.indexOf('online-sales');
    expect(salesIdx).toBeLessThan(quotIdx);
    expect(quotIdx).toBeLessThan(onlineIdx);
  });

  it('QN5: ITEM_LOOKUP resolves quotations to sales section', () => {
    const entry = ITEM_LOOKUP.get('quotations');
    expect(entry).toBeTruthy();
    expect(entry.section.id).toBe('sales');
    expect(entry.item.id).toBe('quotations');
  });
});
