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
