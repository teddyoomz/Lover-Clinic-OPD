// tests/phase-21-0-nav-config-appointment-section.test.js
// Phase 21.0 — N1 — navConfig appointment section structure + 4 sub-tabs
//
// Locks the post-Phase-21.0 nav shape:
//   - PINNED_ITEMS is empty (legacy 'appointments' pinned removed)
//   - NAV_SECTIONS contains 'appointments-section' as first entry
//   - section has exactly 4 items with canonical IDs + Thai labels
//   - ALL_ITEM_IDS includes the 4 new ids + does NOT include legacy
//   - ITEM_LOOKUP resolves all 4

import { describe, test, expect } from 'vitest';
import { PINNED_ITEMS, NAV_SECTIONS, ALL_ITEM_IDS, ITEM_LOOKUP, sectionOf, itemById } from '../src/components/backend/nav/navConfig.js';

describe('Phase 21.0 — N1 navConfig appointment section', () => {
  test('N1.1 PINNED_ITEMS is empty (legacy appointments removed)', () => {
    expect(Array.isArray(PINNED_ITEMS)).toBe(true);
    expect(PINNED_ITEMS.length).toBe(0);
  });

  test('N1.2 NAV_SECTIONS first entry is appointments-section', () => {
    expect(NAV_SECTIONS[0]).toBeDefined();
    expect(NAV_SECTIONS[0].id).toBe('appointments-section');
    expect(NAV_SECTIONS[0].label).toBe('นัดหมาย');
  });

  test('N1.3 appointments-section has exactly 4 items in canonical order', () => {
    const section = NAV_SECTIONS.find(s => s.id === 'appointments-section');
    expect(section).toBeDefined();
    expect(section.items.length).toBe(4);
    const ids = section.items.map(i => i.id);
    expect(ids).toEqual([
      'appointment-no-deposit',
      'appointment-deposit',
      'appointment-treatment-in',
      'appointment-follow-up',
    ]);
  });

  test('N1.4 sub-tab labels match user-verbatim presentation labels', () => {
    const section = NAV_SECTIONS.find(s => s.id === 'appointments-section');
    const labelMap = Object.fromEntries(section.items.map(i => [i.id, i.label]));
    expect(labelMap['appointment-no-deposit']).toBe('จองไม่มัดจำ');
    expect(labelMap['appointment-deposit']).toBe('จองมัดจำ');
    expect(labelMap['appointment-treatment-in']).toBe('คิวรอทำหัตถการ');
    expect(labelMap['appointment-follow-up']).toBe('คิวติดตามอาการ');
  });

  test('N1.5 ALL_ITEM_IDS includes 4 new sub-tab ids', () => {
    expect(ALL_ITEM_IDS).toContain('appointment-no-deposit');
    expect(ALL_ITEM_IDS).toContain('appointment-deposit');
    expect(ALL_ITEM_IDS).toContain('appointment-treatment-in');
    expect(ALL_ITEM_IDS).toContain('appointment-follow-up');
  });

  test('N1.6 ALL_ITEM_IDS does NOT include legacy "appointments" pinned id', () => {
    expect(ALL_ITEM_IDS).not.toContain('appointments');
  });

  test('N1.7 ITEM_LOOKUP resolves all 4 sub-tabs to the section', () => {
    for (const id of [
      'appointment-no-deposit',
      'appointment-deposit',
      'appointment-treatment-in',
      'appointment-follow-up',
    ]) {
      const found = ITEM_LOOKUP.get(id);
      expect(found).toBeDefined();
      expect(found.section?.id).toBe('appointments-section');
      expect(found.item.id).toBe(id);
    }
  });

  test('N1.8 sectionOf resolves all 4 sub-tabs to "appointments-section"', () => {
    expect(sectionOf('appointment-no-deposit')).toBe('appointments-section');
    expect(sectionOf('appointment-deposit')).toBe('appointments-section');
    expect(sectionOf('appointment-treatment-in')).toBe('appointments-section');
    expect(sectionOf('appointment-follow-up')).toBe('appointments-section');
  });

  test('N1.9 itemById returns full metadata for each sub-tab (icon + color + palette)', () => {
    for (const id of [
      'appointment-no-deposit',
      'appointment-deposit',
      'appointment-treatment-in',
      'appointment-follow-up',
    ]) {
      const item = itemById(id);
      expect(item).toBeDefined();
      expect(item.icon).toBeDefined();
      expect(typeof item.color).toBe('string');
      expect(typeof item.palette).toBe('string');
      expect(item.palette.length).toBeGreaterThan(0);
    }
  });

  test('N1.10 deposit sub-tab uses emerald color (Finance.มัดจำ visual link)', () => {
    const item = itemById('appointment-deposit');
    expect(item.color).toBe('emerald');
  });
});
