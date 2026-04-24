// ─── Phase 13.2.5 · Nav + BackendDashboard wiring for staff-schedules ─────
import { describe, it, expect } from 'vitest';
import {
  NAV_SECTIONS, ALL_ITEM_IDS, ITEM_LOOKUP, sectionOf, itemById,
} from '../src/components/backend/nav/navConfig.js';

describe('Phase 13.2.5 — staff-schedules nav wiring', () => {
  it('SN1: staff-schedules item registered in ALL_ITEM_IDS', () => {
    expect(ALL_ITEM_IDS).toContain('staff-schedules');
  });

  it('SN2: belongs to master section (ข้อมูลพื้นฐาน)', () => {
    expect(sectionOf('staff-schedules')).toBe('master');
  });

  it('SN3: item metadata well-formed', () => {
    const item = itemById('staff-schedules');
    expect(item).toBeTruthy();
    expect(item.label).toBe('ตารางงานพนักงาน');
    expect(item.color).toBe('amber');
    expect(item.palette).toMatch(/schedule/i);
    expect(item.palette).toMatch(/ตาราง/);
  });

  it('SN4: sits immediately after staff in master section', () => {
    const master = NAV_SECTIONS.find((s) => s.id === 'master');
    const ids = master.items.map((i) => i.id);
    const staffIdx = ids.indexOf('staff');
    const schedIdx = ids.indexOf('staff-schedules');
    expect(schedIdx).toBe(staffIdx + 1);
  });

  it('SN5: ITEM_LOOKUP resolves to master section', () => {
    const entry = ITEM_LOOKUP.get('staff-schedules');
    expect(entry).toBeTruthy();
    expect(entry.section.id).toBe('master');
  });
});
