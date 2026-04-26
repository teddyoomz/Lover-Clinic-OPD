// Phase 11.1 — Master Data Suite scaffold tests.
// Verifies the new "ข้อมูลพื้นฐาน" (master) nav section + 6 stub tabs +
// shared ComingSoon component + BackendDashboard routing deep-link support.
//
// This is scaffold-only. CRUD logic lands in 11.2-11.7.
//
// Iron-clad coverage:
//   - Rule E: no brokerClient import in ComingSoon (static check)
//   - Rule H: all 6 stubs carry Phase 11.x tags so future replace-commits
//     can grep their own anchor
//   - Rule C1: ComingSoon is the SHARED chrome, not per-tab duplication

import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import fs from 'fs';

// jsdom doesn't ship matchMedia — useTheme hook + BackendDashboard body call it.
beforeAll(() => {
  if (!window.matchMedia) {
    window.matchMedia = () => ({
      matches: false,
      media: '',
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    });
  }
});
import {
  NAV_SECTIONS,
  ALL_ITEM_IDS,
  ITEM_LOOKUP,
  itemById,
  sectionOf,
  TAB_COLOR_MAP,
} from '../src/components/backend/nav/navConfig.js';
import ComingSoon from '../src/components/backend/ComingSoon.jsx';
import { FolderTree, Wrench } from 'lucide-react';

// Phase 11.1 stubs + Phase 12.1 people + Phase 13.2 staff-schedules +
// Phase 13.2.7 doctor-schedules + Phase 12.2 catalog + Phase 12.5 finance +
// Phase 13.3 df-groups + Phase 14.1 document templates.
// Keep list append-only so sidebar ordering stays stable.
const MASTER_STUB_IDS = [
  'product-groups',
  'product-units',
  'medical-instruments',
  'holidays',
  'branches',
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
];

const MASTER_SECTION_ITEM_IDS = ['masterdata', ...MASTER_STUB_IDS];

/* ─── navConfig: new 'master' section shape ─────────────────────────────── */

describe('Phase 11.1 — navConfig master section', () => {
  it('M1 master section exists with label "ข้อมูลพื้นฐาน"', () => {
    const master = NAV_SECTIONS.find(s => s.id === 'master');
    expect(master).toBeTruthy();
    expect(master.label).toBe('ข้อมูลพื้นฐาน');
  });

  it('M2 master section has exactly 16 items — 1 sync + 6 P11 + 2 P12.1 + 2 P13.2 (staff+doctor schedules) + 2 P12.2 + 1 P12.5 + 1 P13.3 + 1 P14 docs', () => {
    const master = NAV_SECTIONS.find(s => s.id === 'master');
    expect(master.items.length).toBe(16);
    expect(master.items.map(i => i.id)).toEqual(MASTER_SECTION_ITEM_IDS);
  });

  it('M3 Sync ProClinic stays as FIRST item (seed-only, not CRUD)', () => {
    const master = NAV_SECTIONS.find(s => s.id === 'master');
    expect(master.items[0].id).toBe('masterdata');
    expect(master.items[0].label).toBe('Sync ProClinic');
  });

  it('M4 every stub id is in ALL_ITEM_IDS whitelist (URL deep-link)', () => {
    for (const id of MASTER_STUB_IDS) {
      expect(ALL_ITEM_IDS).toContain(id);
    }
  });

  it('M5 every stub has unique id + label + icon + color + palette', () => {
    const master = NAV_SECTIONS.find(s => s.id === 'master');
    const seen = new Set();
    for (const it of master.items) {
      expect(seen.has(it.id)).toBe(false);
      seen.add(it.id);
      expect(typeof it.label).toBe('string');
      expect(it.label.length).toBeGreaterThan(0);
      expect(['function', 'object']).toContain(typeof it.icon);
      expect(typeof it.color).toBe('string');
      expect(typeof it.palette).toBe('string');
      expect(it.palette.length).toBeGreaterThan(3);
    }
  });

  it('M6 every stub uses a color that exists in TAB_COLOR_MAP', () => {
    const master = NAV_SECTIONS.find(s => s.id === 'master');
    for (const it of master.items) {
      expect(Object.keys(TAB_COLOR_MAP)).toContain(it.color);
    }
  });

  it('M7 sectionOf returns "master" for every stub', () => {
    for (const id of MASTER_SECTION_ITEM_IDS) {
      expect(sectionOf(id)).toBe('master');
    }
  });

  it('M8 itemById returns full metadata for each stub', () => {
    for (const id of MASTER_STUB_IDS) {
      const item = itemById(id);
      expect(item).toBeTruthy();
      expect(item.id).toBe(id);
      expect(typeof item.label).toBe('string');
    }
  });

  it('M9 cmdk palette keywords — Thai + English coverage for discovery', () => {
    // Adversarial: make sure every stub is findable by at least one Thai word
    // AND one English word, so bilingual users can find them via Ctrl+K.
    const palettes = {
      'product-groups':       { en: ['group', 'category', 'product'], th: ['กลุ่ม', 'สินค้า'] },
      'product-units':        { en: ['unit'], th: ['หน่วย'] },
      'medical-instruments':  { en: ['instrument', 'maintenance'], th: ['เครื่อง'] },
      'holidays':             { en: ['holiday'], th: ['วันหยุด'] },
      'branches':             { en: ['branch', 'location'], th: ['สาขา'] },
      'permission-groups':    { en: ['permission', 'role'], th: ['สิทธิ์'] },
    };
    for (const [id, expected] of Object.entries(palettes)) {
      const item = itemById(id);
      const palette = item.palette.toLowerCase();
      for (const kw of expected.en) expect(palette).toContain(kw.toLowerCase());
      for (const kw of expected.th) expect(palette).toContain(kw);
    }
  });

  it('M10 deprecated "system" section is absent', () => {
    expect(NAV_SECTIONS.find(s => s.id === 'system')).toBeUndefined();
  });

  it('M11 legacy "masterdata" id preserved for URL deep-link compatibility', () => {
    // Old URLs ?backend=1&tab=masterdata must still resolve. We kept the id
    // even though the label changed from "ข้อมูลพื้นฐาน" → "Sync ProClinic".
    expect(ALL_ITEM_IDS).toContain('masterdata');
    expect(ITEM_LOOKUP.has('masterdata')).toBe(true);
  });
});

/* ─── ComingSoon — shared placeholder ───────────────────────────────────── */

describe('Phase 11.1 — ComingSoon shared placeholder', () => {
  it('CS1 renders label + default message + icon', () => {
    render(<ComingSoon icon={FolderTree} label="กลุ่มสินค้า" />);
    expect(screen.getByText('กลุ่มสินค้า')).toBeInTheDocument();
    // Default Thai message
    expect(screen.getByText(/อยู่ระหว่างพัฒนา/)).toBeInTheDocument();
    expect(screen.getByTestId('coming-soon')).toBeInTheDocument();
  });

  it('CS2 renders custom message when provided', () => {
    render(
      <ComingSoon
        icon={Wrench}
        label="เครื่องหัตถการ"
        message="ทะเบียนเครื่องมือ + รอบบำรุงรักษา"
      />,
    );
    expect(screen.getByText('ทะเบียนเครื่องมือ + รอบบำรุงรักษา')).toBeInTheDocument();
  });

  it('CS3 renders phaseTag when provided (lets user know timeline)', () => {
    render(<ComingSoon icon={FolderTree} label="กลุ่มสินค้า" phaseTag="Phase 11.2" />);
    expect(screen.getByText('Phase 11.2')).toBeInTheDocument();
  });

  it('CS4 does NOT crash when clinicSettings is omitted (default accent)', () => {
    expect(() => render(<ComingSoon icon={FolderTree} label="X" />)).not.toThrow();
  });

  it('CS5 accepts custom clinicSettings.accentColor without crashing', () => {
    expect(() =>
      render(<ComingSoon icon={FolderTree} label="X" clinicSettings={{ accentColor: '#00aa00' }} />),
    ).not.toThrow();
  });
});

/* ─── Rule E compliance: no brokerClient in ComingSoon ──────────────────── */

describe('Phase 11.1 — Rule E (Backend = Firestore ONLY) compliance', () => {
  it('E1 ComingSoon.jsx does NOT import brokerClient (stub has zero broker surface)', () => {
    const src = fs.readFileSync('src/components/backend/ComingSoon.jsx', 'utf-8');
    expect(src).not.toMatch(/brokerClient/);
    expect(src).not.toMatch(/\/api\/proclinic\//);
  });

  it('E2 navConfig.js master section contains NO broker-coupled items', () => {
    // All 7 items are either Firestore-only (MasterDataTab reads master_data)
    // or stubs (ComingSoon, zero network). Verify by grepping the source.
    const src = fs.readFileSync('src/components/backend/nav/navConfig.js', 'utf-8');
    expect(src).not.toMatch(/brokerClient/);
  });
});

/* ─── BackendDashboard routing ──────────────────────────────────────────── */

// Mock firebase for jsdom.
vi.mock('../src/firebase.js', () => ({ db: {}, appId: 'test-app' }));

// Mock broker (setUseTrialServer called by BackendDashboard useEffect).
vi.mock('../src/lib/brokerClient.js', () => ({
  setUseTrialServer: vi.fn(),
}));

// Mock backendClient (BackendDashboard imports for customer lookup on deep-link).
vi.mock('../src/lib/backendClient.js', () => ({
  getCustomer: vi.fn(() => Promise.resolve(null)),
  deleteBackendTreatment: vi.fn(),
  rebuildTreatmentSummary: vi.fn(),
  getTreatment: vi.fn(),
  reverseCourseDeduction: vi.fn(),
}));

// Stub heavy tab children — we only need scaffold routing verification.
vi.mock('../src/components/backend/CloneTab.jsx', () => ({ default: () => <div data-testid="t-clone" /> }));
vi.mock('../src/components/backend/CustomerListTab.jsx', () => ({ default: () => <div data-testid="t-customers" /> }));
vi.mock('../src/components/backend/CustomerDetailView.jsx', () => ({ default: () => <div data-testid="t-customer-detail" /> }));
vi.mock('../src/components/backend/MasterDataTab.jsx', () => ({ default: () => <div data-testid="t-masterdata" /> }));
vi.mock('../src/components/backend/AppointmentTab.jsx', () => ({ default: () => <div data-testid="t-appointments" /> }));
vi.mock('../src/components/backend/SaleTab.jsx', () => ({ default: () => <div data-testid="t-sales" /> }));
vi.mock('../src/components/backend/FinanceTab.jsx', () => ({ default: () => <div data-testid="t-finance" /> }));
vi.mock('../src/components/backend/StockTab.jsx', () => ({ default: () => <div data-testid="t-stock" /> }));
vi.mock('../src/components/backend/PromotionTab.jsx', () => ({ default: () => <div data-testid="t-promotions" /> }));
vi.mock('../src/components/backend/CouponTab.jsx', () => ({ default: () => <div data-testid="t-coupons" /> }));
vi.mock('../src/components/backend/VoucherTab.jsx', () => ({ default: () => <div data-testid="t-vouchers" /> }));
vi.mock('../src/components/backend/reports/ReportsHomeTab.jsx', () => ({ default: () => <div data-testid="t-reports" /> }));
vi.mock('../src/components/backend/reports/SaleReportTab.jsx', () => ({ default: () => <div /> }));
vi.mock('../src/components/backend/reports/CustomerReportTab.jsx', () => ({ default: () => <div /> }));
vi.mock('../src/components/backend/reports/AppointmentReportTab.jsx', () => ({ default: () => <div /> }));
vi.mock('../src/components/backend/reports/StockReportTab.jsx', () => ({ default: () => <div /> }));
vi.mock('../src/components/backend/reports/CRMInsightTab.jsx', () => ({ default: () => <div /> }));
vi.mock('../src/components/backend/reports/RevenueAnalysisTab.jsx', () => ({ default: () => <div /> }));
vi.mock('../src/components/backend/reports/AppointmentAnalysisTab.jsx', () => ({ default: () => <div /> }));
vi.mock('../src/components/backend/reports/DailyRevenueTab.jsx', () => ({ default: () => <div /> }));
vi.mock('../src/components/backend/reports/StaffSalesTab.jsx', () => ({ default: () => <div /> }));
// Phase 11.2 + 11.3 shipped — ProductGroupsTab + ProductUnitsTab are now real.
// Mock them here so this scaffold test stays independent of their internals.
vi.mock('../src/components/backend/ProductGroupsTab.jsx', () => ({ default: () => <div data-testid="t-product-groups" /> }));
vi.mock('../src/components/backend/ProductUnitsTab.jsx', () => ({ default: () => <div data-testid="t-product-units" /> }));
vi.mock('../src/components/backend/MedicalInstrumentsTab.jsx', () => ({ default: () => <div data-testid="t-medical-instruments" /> }));
vi.mock('../src/components/backend/HolidaysTab.jsx', () => ({ default: () => <div data-testid="t-holidays" /> }));
vi.mock('../src/components/backend/BranchesTab.jsx', () => ({ default: () => <div data-testid="t-branches" /> }));
vi.mock('../src/components/backend/PermissionGroupsTab.jsx', () => ({ default: () => <div data-testid="t-permission-groups" /> }));
vi.mock('../src/components/TreatmentFormPage.jsx', () => ({ default: () => <div /> }));
vi.mock('../src/components/backend/nav/BackendNav.jsx', () => ({
  default: ({ children }) => <div>{children}</div>,
}));
vi.mock('../src/components/ThemeToggle.jsx', () => ({ default: () => <div /> }));

describe('Phase 11.1 — BackendDashboard routing (deep-link)', () => {
  async function renderWith(tab) {
    // Set URL before import so BackendDashboard's useEffect reads it.
    window.history.replaceState(null, '', `?backend=1&tab=${tab}`);
    // Re-import to pick up fresh module state.
    vi.resetModules();
    const { default: BackendDashboard } = await import('../src/pages/BackendDashboard.jsx');
    return render(<BackendDashboard clinicSettings={{ accentColor: '#dc2626' }} />);
  }

  it('R1 ?tab=product-groups renders ProductGroupsTab (Phase 11.2 shipped 2026-04-20)', async () => {
    await renderWith('product-groups');
    // Phase 11.2 replaced the ComingSoon stub with a real tab. Verify routing
    // still works — mocked stub renders with testid.
    expect(await screen.findByTestId('t-product-groups')).toBeInTheDocument();
  });

  it('R2 ?tab=product-units renders ProductUnitsTab (Phase 11.3 shipped 2026-04-20)', async () => {
    await renderWith('product-units');
    expect(await screen.findByTestId('t-product-units')).toBeInTheDocument();
  });

  it('R3 ?tab=medical-instruments renders MedicalInstrumentsTab (Phase 11.4 shipped 2026-04-20)', async () => {
    await renderWith('medical-instruments');
    expect(await screen.findByTestId('t-medical-instruments')).toBeInTheDocument();
  });

  it('R4 ?tab=holidays renders HolidaysTab (Phase 11.5 shipped 2026-04-20)', async () => {
    await renderWith('holidays');
    expect(await screen.findByTestId('t-holidays')).toBeInTheDocument();
  });

  it('R5 ?tab=branches renders BranchesTab (Phase 11.6 shipped 2026-04-20)', async () => {
    await renderWith('branches');
    expect(await screen.findByTestId('t-branches')).toBeInTheDocument();
  });

  it('R6 ?tab=permission-groups renders PermissionGroupsTab (Phase 11.7 shipped 2026-04-20)', async () => {
    await renderWith('permission-groups');
    expect(await screen.findByTestId('t-permission-groups')).toBeInTheDocument();
  });

  it('R7 ?tab=masterdata still renders MasterDataTab (preserved URL)', async () => {
    await renderWith('masterdata');
    expect(await screen.findByTestId('t-masterdata')).toBeInTheDocument();
  });
});
