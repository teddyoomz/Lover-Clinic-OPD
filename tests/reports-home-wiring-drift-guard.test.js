// Reports-home wiring — REG (registration/deep-link) + HOME (drift guard).
// The HOME group is the institutional guard against the wiring-gap bug class
// (V52-family): a home card that points at an unregistered/soon tab fails build.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ALL_ITEM_IDS } from '../src/components/backend/nav/navConfig.js';
import { TAB_PERMISSION_MAP } from '../src/lib/tabPermissions.js';

const NEW_TABS = ['reports-alt-sales', 'reports-outstanding', 'reports-stock-movements', 'reports-stock-alert'];
const dash = readFileSync('src/pages/BackendDashboard.jsx', 'utf8');

describe('REG new report tabs registered', () => {
  it.each(NEW_TABS)('REG1 %s in ALL_ITEM_IDS (derived from navConfig → deep-link whitelist)', (id) => {
    expect(ALL_ITEM_IDS).toContain(id);
  });
  it.each(NEW_TABS)('REG2 %s has a render branch in BackendDashboard', (id) => {
    expect(dash).toContain(`activeTab === '${id}'`);
  });
  it.each(NEW_TABS)('REG3 %s has a permission gate', (id) => {
    expect(TAB_PERMISSION_MAP[id]).toBeTruthy();
    expect(Array.isArray(TAB_PERMISSION_MAP[id].requires)).toBe(true);
    expect(TAB_PERMISSION_MAP[id].requires.length).toBeGreaterThan(0);
  });
  it('REG4 stock-movements reuses MovementLogPanel (no duplicate report built)', () => {
    expect(dash).toContain('MovementLogReportPanel');
    expect(dash).toContain("import('../components/backend/MovementLogPanel.jsx')");
  });
});

describe('HOME reports-home drift guard', () => {
  const home = readFileSync('src/components/backend/reports/ReportsHomeTab.jsx', 'utf8');
  const homeTabIds = [...home.matchAll(/tabId:\s*'([\w-]+)'/g)].map(m => m[1]);

  it('HOME1 no card left with status: soon (wiring complete)', () => {
    expect(home).not.toMatch(/status:\s*'soon'/);
  });
  it('HOME2 every tabId referenced is a registered navConfig id (deep-link resolves)', () => {
    const orphan = homeTabIds.filter(id => !ALL_ITEM_IDS.includes(id));
    expect(orphan).toEqual([]);
  });
  it('HOME3 the 6 wired + 4 new report ids are present', () => {
    ['reports-pnl', 'expense-report', 'reports-df-payout', 'reports-remaining-course',
     'clinic-report', 'reports-payment', 'smart-audience',
     'reports-alt-sales', 'reports-outstanding', 'reports-stock-movements', 'reports-stock-alert']
      .forEach(id => expect(homeTabIds).toContain(id));
  });
  it('HOME4 removed dead cards are gone', () => {
    ['กำไรต่อการรักษา', 'ตัดสต็อคสินค้าล่วงหน้า', 'คูปองส่วนลด', 'สรุปใช้ยาประจำวัน', 'รายงานการใช้คอร์ส']
      .forEach(label => expect(home).not.toContain(label));
  });
  it('HOME5 Smart Audience is wired (no tabId: null placeholder anywhere)', () => {
    expect(home).not.toMatch(/tabId:\s*null/);
  });
});
