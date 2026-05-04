// Branch-Scope Flow Simulate — F1-F9 (Rule I sub-phase end test)
// Locks the BSA chain end-to-end:
//   localStorage('selectedBranchId') → resolveSelectedBranchId() →
//   scopedDataLayer.<lister>(opts) → backendClient.<lister>({branchId, ...opts})
// Plus F9 source-grep regression for BS-1 (no UI direct backendClient imports).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Capture every backendClient call from scopedDataLayer
const captures = [];
function track(name) {
  return vi.fn(async (opts) => { captures.push({ name, opts }); return []; });
}
function trackPositional(name) {
  return vi.fn(async (positional, opts) => { captures.push({ name, positional, opts }); return []; });
}

// Mock backendClient.js — every export scopedDataLayer might call needs a stub.
// scopedDataLayer accesses raw.* lazily so unused mocks don't fire.
vi.mock('../src/lib/backendClient.js', () => ({
  // Branch-scoped listers
  listProducts: track('listProducts'),
  listCourses: track('listCourses'),
  listProductGroups: track('listProductGroups'),
  listProductUnitGroups: track('listProductUnitGroups'),
  listMedicalInstruments: track('listMedicalInstruments'),
  listHolidays: track('listHolidays'),
  listDfGroups: track('listDfGroups'),
  listDfStaffRates: track('listDfStaffRates'),
  listBankAccounts: track('listBankAccounts'),
  listExpenseCategories: track('listExpenseCategories'),
  listExpenses: track('listExpenses'),
  listStaffSchedules: track('listStaffSchedules'),
  listPromotions: track('listPromotions'),
  listCoupons: track('listCoupons'),
  listVouchers: track('listVouchers'),
  listOnlineSales: track('listOnlineSales'),
  listSaleInsuranceClaims: track('listSaleInsuranceClaims'),
  listVendorSales: track('listVendorSales'),
  listQuotations: track('listQuotations'),
  listAllSellers: track('listAllSellers'),
  listStaffByBranch: track('listStaffByBranch'),
  listStockBatches: track('listStockBatches'),
  listStockOrders: track('listStockOrders'),
  listStockMovements: track('listStockMovements'),
  getAllSales: track('getAllSales'),
  getAppointmentsByDate: trackPositional('getAppointmentsByDate'),
  getAppointmentsByMonth: trackPositional('getAppointmentsByMonth'),
  // Universal — re-exported as-is
  listStaff: track('listStaff'),
  listDoctors: track('listDoctors'),
  listBranches: track('listBranches'),
  listPermissionGroups: track('listPermissionGroups'),
  listDocumentTemplates: track('listDocumentTemplates'),
  listAudiences: track('listAudiences'),
  listMembershipTypes: track('listMembershipTypes'),
  listWalletTypes: track('listWalletTypes'),
  listVendors: track('listVendors'),
  listCourseChanges: track('listCourseChanges'),
  // Customer-attached
  getCustomer: track('getCustomer'),
  getAllCustomers: track('getAllCustomers'),
  getCustomerWallets: track('getCustomerWallets'),
  getWalletBalance: track('getWalletBalance'),
  getWalletTransactions: track('getWalletTransactions'),
  getCustomerMembership: track('getCustomerMembership'),
  getAllMemberships: track('getAllMemberships'),
  getCustomerMembershipDiscount: track('getCustomerMembershipDiscount'),
  getCustomerBahtPerPoint: track('getCustomerBahtPerPoint'),
  getPointBalance: track('getPointBalance'),
  getPointTransactions: track('getPointTransactions'),
  getCustomerTreatments: track('getCustomerTreatments'),
  getCustomerSales: track('getCustomerSales'),
  getCustomerAppointments: track('getCustomerAppointments'),
  getCustomerDeposits: track('getCustomerDeposits'),
  getActiveDeposits: track('getActiveDeposits'),
}));

// Mock branchSelection.js so we control resolveSelectedBranchId fully
// without depending on jsdom localStorage edge cases. The module's real
// behavior is: localStorage[STORAGE_KEY] || FALLBACK_ID('main').
let _selectedBranch = null; // null → fallback
vi.mock('../src/lib/branchSelection.js', () => ({
  STORAGE_KEY: 'selectedBranchId',
  FALLBACK_ID: 'main',
  resolveSelectedBranchId: () => _selectedBranch || 'main',
}));

beforeEach(() => {
  captures.length = 0;
  _selectedBranch = null;
});

const setBranch = (id) => { _selectedBranch = id; };
const clearBranch = () => { _selectedBranch = null; };

describe('F1-F9 — Branch-Scope Flow Simulate (Rule I)', () => {
  it('F1: localStorage = นครราชสีมา → listProducts() → branchId injected', async () => {
    setBranch('BR-NAKHON');
    const scoped = await import('../src/lib/scopedDataLayer.js');
    await scoped.listProducts();
    const cap = captures.find((c) => c.name === 'listProducts');
    expect(cap).toBeDefined();
    expect(cap.opts.branchId).toBe('BR-NAKHON');
  });

  it('F2: switch to พระราม 3 → next listProducts() picks up new branch', async () => {
    setBranch('BR-NAKHON');
    const scoped = await import('../src/lib/scopedDataLayer.js');
    await scoped.listProducts();
    setBranch('BR-RAMA3');
    await scoped.listProducts();
    const calls = captures.filter((c) => c.name === 'listProducts');
    expect(calls).toHaveLength(2);
    expect(calls[0].opts.branchId).toBe('BR-NAKHON');
    expect(calls[1].opts.branchId).toBe('BR-RAMA3');
  });

  it('F3: TFP load — listProducts/Courses/DfGroups/DfStaffRates branch-injected; listStaff/Doctors universal', async () => {
    setBranch('BR-RAMA3');
    const scoped = await import('../src/lib/scopedDataLayer.js');
    await Promise.all([
      scoped.listDoctors(),
      scoped.listProducts(),
      scoped.listStaff(),
      scoped.listCourses(),
      scoped.listDfGroups(),
      scoped.listDfStaffRates(),
    ]);
    const branchScoped = ['listProducts', 'listCourses', 'listDfGroups', 'listDfStaffRates'];
    for (const name of branchScoped) {
      const cap = captures.find((c) => c.name === name);
      expect(cap, `${name} should be captured`).toBeDefined();
      expect(cap.opts.branchId, `${name} should have branchId injected`).toBe('BR-RAMA3');
    }
    const universal = ['listDoctors', 'listStaff'];
    for (const name of universal) {
      const cap = captures.find((c) => c.name === name);
      expect(cap, `${name} should be captured`).toBeDefined();
      // Universal re-export — no branchId injection. Caller passed nothing,
      // so opts === undefined (or absent branchId if positional re-export).
      const branchOnUniversal = cap?.opts?.branchId;
      expect(branchOnUniversal, `${name} must NOT have branchId injected`).toBeUndefined();
    }
  });

  it('F4: positional getAppointmentsByDate(dateStr) injects branchId via opts', async () => {
    setBranch('BR-X');
    const scoped = await import('../src/lib/scopedDataLayer.js');
    await scoped.getAppointmentsByDate('2026-05-01');
    const cap = captures.find((c) => c.name === 'getAppointmentsByDate');
    expect(cap).toBeDefined();
    expect(cap.positional).toBe('2026-05-01');
    expect(cap.opts.branchId).toBe('BR-X');
  });

  it('F5: {allBranches:true} opt-out preserved alongside branchId', async () => {
    setBranch('BR-X');
    const scoped = await import('../src/lib/scopedDataLayer.js');
    await scoped.listProducts({ allBranches: true });
    const cap = captures.find((c) => c.name === 'listProducts');
    expect(cap.opts).toEqual({ branchId: 'BR-X', allBranches: true });
  });

  it('F6: explicit {branchId:"OVERRIDE"} wins over current selection', async () => {
    setBranch('BR-CURRENT');
    const scoped = await import('../src/lib/scopedDataLayer.js');
    await scoped.listCourses({ branchId: 'BR-OVERRIDE' });
    const cap = captures.find((c) => c.name === 'listCourses');
    expect(cap.opts.branchId).toBe('BR-OVERRIDE');
  });

  it('F7: empty localStorage → falls back to FALLBACK_ID "main"', async () => {
    clearBranch();
    const scoped = await import('../src/lib/scopedDataLayer.js');
    await scoped.listProducts();
    const cap = captures.find((c) => c.name === 'listProducts');
    expect(cap.opts.branchId).toBe('main');
  });

  it('F8: rapid branch switches — each call picks up latest', async () => {
    const scoped = await import('../src/lib/scopedDataLayer.js');
    setBranch('BR-A'); await scoped.listProducts();
    setBranch('BR-B'); await scoped.listProducts();
    setBranch('BR-C'); await scoped.listProducts();
    const branches = captures.filter((c) => c.name === 'listProducts').map((c) => c.opts.branchId);
    expect(branches).toEqual(['BR-A', 'BR-B', 'BR-C']);
  });

  it('F9: source-grep regression — no UI file imports backendClient direct (BS-1)', () => {
    // Mirror BS-1 from audit-branch-scope, but executed here as Rule-I-tier
    // regression so the simulate test fails too if a UI file ever bypasses
    // scopedDataLayer.
    let violations = [];
    try {
      const out = execSync(
        `git grep -lE "from ['\\"](\\.\\./)+lib/backendClient" -- "src/components/" "src/pages/" "src/hooks/" "src/contexts/"`,
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
      );
      violations = out.split('\n').map((s) => s.trim()).filter(Boolean);
    } catch {
      // git grep returns non-zero when no matches — that's the happy path
      violations = [];
    }
    // Allow file-level annotated exceptions (BS-1 sanctioned override pattern)
    const allowed = (file) => {
      try {
        const content = readFileSync(file, 'utf8');
        return content.includes('audit-branch-scope:');
      } catch {
        return false;
      }
    };
    const real = violations.filter((f) => !allowed(f));
    expect(real, `F9: unannotated direct backendClient imports:\n${real.join('\n')}`).toEqual([]);
  });
});
