// ─── Phase 14.3 G6 follow-up C — VendorSalesTab route wiring tests ─────
//
// Pre-Phase-15 audit 2026-04-26 surfaced that VendorSalesTab.jsx existed
// + navConfig.js listed it (id='vendor-sales'), but BackendDashboard.jsx
// did NOT import or render it — so clicking the menu item did nothing.
// This test file locks the route wiring + a few render-case invariants.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const READ = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

describe('VendorSalesTab route wiring (Phase 14.3 G6 follow-up C)', () => {
  const DASH = READ('src/pages/BackendDashboard.jsx');
  const NAV = READ('src/components/backend/nav/navConfig.js');
  const TAB = READ('src/components/backend/VendorSalesTab.jsx');

  it('VS1: navConfig.js lists vendor-sales tab id with B2B label', () => {
    expect(NAV).toMatch(/id:\s*['"]vendor-sales['"]/);
    expect(NAV).toMatch(/ขายให้คู่ค้า/);
  });

  it('VS2: BackendDashboard imports VendorSalesTab', () => {
    expect(DASH).toMatch(/import\s+VendorSalesTab\s+from\s*['"]\.\.\/components\/backend\/VendorSalesTab\.jsx['"]/);
  });

  it('VS3: BackendDashboard render branch matches activeTab === "vendor-sales"', () => {
    expect(DASH).toMatch(/activeTab\s*===\s*['"]vendor-sales['"]\s*\?\s*\(\s*\n?\s*<VendorSalesTab/);
  });

  it('VS4: VendorSalesTab passes clinicSettings + theme props (matches sibling marketing tabs)', () => {
    expect(DASH).toMatch(/<VendorSalesTab\s+clinicSettings=\{clinicSettings\}\s+theme=\{theme\}\s*\/>/);
  });

  it('VS5: VendorSalesTab is exported as default function', () => {
    expect(TAB).toMatch(/export default function VendorSalesTab/);
  });

  it('VS6: VendorSalesTab is Firestore-only (Rule E) — no brokerClient + no /api/proclinic', () => {
    expect(TAB).not.toMatch(/brokerClient/);
    expect(TAB).not.toMatch(/\/api\/proclinic/);
  });

  it('VS7: VendorSalesTab uses Firestore-only backend helpers (listVendors / listVendorSales)', () => {
    expect(TAB).toMatch(/listVendors/);
    expect(TAB).toMatch(/listVendorSales/);
  });

  it('VS8: tab id "vendor-sales" only renders ONE component (no duplicate render-case bug)', () => {
    // Defensive: count render branches to make sure only one match (`activeTab === 'vendor-sales' ?`).
    const matches = DASH.match(/activeTab\s*===\s*['"]vendor-sales['"]/g) || [];
    expect(matches.length).toBe(1);
  });
});
