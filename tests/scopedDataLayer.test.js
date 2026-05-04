import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock backendClient to capture per-call opts
const calls = {};
function mockLister(name) {
  return vi.fn(async (opts) => { calls[name] = opts; return []; });
}
function mockPositionalLister(name) {
  return vi.fn(async (positional, opts) => { calls[name] = { positional, opts }; return []; });
}

vi.mock('../src/lib/backendClient.js', () => {
  return {
    // Branch-scoped listers
    listProducts: mockLister('listProducts'),
    listCourses: mockLister('listCourses'),
    listProductGroups: mockLister('listProductGroups'),
    listProductUnitGroups: mockLister('listProductUnitGroups'),
    listMedicalInstruments: mockLister('listMedicalInstruments'),
    listHolidays: mockLister('listHolidays'),
    listDfGroups: mockLister('listDfGroups'),
    listDfStaffRates: mockLister('listDfStaffRates'),
    listBankAccounts: mockLister('listBankAccounts'),
    listExpenseCategories: mockLister('listExpenseCategories'),
    listExpenses: mockLister('listExpenses'),
    listStaffSchedules: mockLister('listStaffSchedules'),
    listPromotions: mockLister('listPromotions'),
    listCoupons: mockLister('listCoupons'),
    listVouchers: mockLister('listVouchers'),
    listOnlineSales: mockLister('listOnlineSales'),
    listSaleInsuranceClaims: mockLister('listSaleInsuranceClaims'),
    listVendorSales: mockLister('listVendorSales'),
    listQuotations: mockLister('listQuotations'),
    listAllSellers: mockLister('listAllSellers'),
    listStaffByBranch: mockLister('listStaffByBranch'),
    listStockBatches: mockLister('listStockBatches'),
    listStockOrders: mockLister('listStockOrders'),
    listStockMovements: mockLister('listStockMovements'),
    getAllSales: mockLister('getAllSales'),
    getAppointmentsByDate: mockPositionalLister('getAppointmentsByDate'),
    getAppointmentsByMonth: mockPositionalLister('getAppointmentsByMonth'),

    // Universal — re-exported as-is
    listStaff: mockLister('listStaff'),
    listDoctors: mockLister('listDoctors'),
    listBranches: mockLister('listBranches'),
    listPermissionGroups: mockLister('listPermissionGroups'),
    listDocumentTemplates: mockLister('listDocumentTemplates'),
    listAudiences: mockLister('listAudiences'),
    listMembershipTypes: mockLister('listMembershipTypes'),
    listWalletTypes: mockLister('listWalletTypes'),
    listVendors: mockLister('listVendors'),
    listCourseChanges: mockLister('listCourseChanges'),

    // Customer-attached
    getCustomer: mockLister('getCustomer'),
    getAllCustomers: mockLister('getAllCustomers'),
    getCustomerWallets: mockLister('getCustomerWallets'),
    getWalletBalance: mockLister('getWalletBalance'),
    getWalletTransactions: mockLister('getWalletTransactions'),
    getCustomerMembership: mockLister('getCustomerMembership'),
    getAllMemberships: mockLister('getAllMemberships'),
    getCustomerMembershipDiscount: mockLister('getCustomerMembershipDiscount'),
    getCustomerBahtPerPoint: mockLister('getCustomerBahtPerPoint'),
    getPointBalance: mockLister('getPointBalance'),
    getPointTransactions: mockLister('getPointTransactions'),
    getCustomerTreatments: mockLister('getCustomerTreatments'),
    getCustomerSales: mockLister('getCustomerSales'),
    getCustomerAppointments: mockLister('getCustomerAppointments'),
    getCustomerDeposits: mockLister('getCustomerDeposits'),
    getActiveDeposits: mockLister('getActiveDeposits'),

    // Stock — central tier (universal across central warehouses)
    listCentralStockOrders: mockLister('listCentralStockOrders'),
    listCentralWarehouses: mockLister('listCentralWarehouses'),
    listStockLocations: mockLister('listStockLocations'),

    // Stock — tier-scoped (caller passes locationId — no inject)
    listStockTransfers: mockLister('listStockTransfers'),
    listStockWithdrawals: mockLister('listStockWithdrawals'),

    // Single-doc gets
    getCentralStockOrder: mockLister('getCentralStockOrder'),
    getStockBatch: mockLister('getStockBatch'),
    getStockOrder: mockLister('getStockOrder'),
    getStockTransfer: mockLister('getStockTransfer'),
    getStockWithdrawal: mockLister('getStockWithdrawal'),
    getStockAdjustment: mockLister('getStockAdjustment'),
    getProduct: mockLister('getProduct'),
    getCourse: mockLister('getCourse'),
    getProductGroup: mockLister('getProductGroup'),
    getProductUnitGroup: mockLister('getProductUnitGroup'),
    getMedicalInstrument: mockLister('getMedicalInstrument'),
    getHoliday: mockLister('getHoliday'),
    getDfGroup: mockLister('getDfGroup'),
    getDfStaffRates: mockLister('getDfStaffRates'),
    getBankAccount: mockLister('getBankAccount'),
    getExpense: mockLister('getExpense'),
    getOnlineSale: mockLister('getOnlineSale'),
    getSaleInsuranceClaim: mockLister('getSaleInsuranceClaim'),
    getQuotation: mockLister('getQuotation'),
    getStaff: mockLister('getStaff'),
    getDoctor: mockLister('getDoctor'),
    getBranch: mockLister('getBranch'),
    getPermissionGroup: mockLister('getPermissionGroup'),
    getStaffSchedule: mockLister('getStaffSchedule'),
    getCoupon: mockLister('getCoupon'),
    getVoucher: mockLister('getVoucher'),
    getPromotion: mockLister('getPromotion'),
    getTreatment: mockLister('getTreatment'),
    getBackendSale: mockLister('getBackendSale'),
    getDeposit: mockLister('getDeposit'),
    getAllDeposits: mockLister('getAllDeposits'),
    getSaleByTreatmentId: mockLister('getSaleByTreatmentId'),
    getMasterDataMeta: mockLister('getMasterDataMeta'),
    getActiveSchedulesForDate: mockLister('getActiveSchedulesForDate'),
    getBeBackedMasterTypes: mockLister('getBeBackedMasterTypes'),
    getAudience: mockLister('getAudience'),
    getDocumentTemplate: mockLister('getDocumentTemplate'),
    listDocumentDrafts: mockLister('listDocumentDrafts'),
    listDocumentPrints: mockLister('listDocumentPrints'),
    getDocumentDraft: mockLister('getDocumentDraft'),
    getNextCertNumber: mockLister('getNextCertNumber'),

    // Writes
    saveProduct: mockLister('saveProduct'),
    saveCourse: mockLister('saveCourse'),
    saveCustomer: mockLister('saveCustomer'),
    deleteCustomerDocOnly: mockLister('deleteCustomerDocOnly'),
    deleteCustomerCascade: mockLister('deleteCustomerCascade'),
    saveTreatment: mockLister('saveTreatment'),
    deleteBackendTreatment: mockLister('deleteBackendTreatment'),
    deleteProduct: mockLister('deleteProduct'),
    deleteCourse: mockLister('deleteCourse'),
    saveProductGroup: mockLister('saveProductGroup'),
    deleteProductGroup: mockLister('deleteProductGroup'),
    saveProductUnitGroup: mockLister('saveProductUnitGroup'),
    deleteProductUnitGroup: mockLister('deleteProductUnitGroup'),
    saveMedicalInstrument: mockLister('saveMedicalInstrument'),
    deleteMedicalInstrument: mockLister('deleteMedicalInstrument'),
    saveHoliday: mockLister('saveHoliday'),
    deleteHoliday: mockLister('deleteHoliday'),
    saveBranch: mockLister('saveBranch'),
    deleteBranch: mockLister('deleteBranch'),
    savePermissionGroup: mockLister('savePermissionGroup'),
    deletePermissionGroup: mockLister('deletePermissionGroup'),
    saveStaff: mockLister('saveStaff'),
    deleteStaff: mockLister('deleteStaff'),
    saveDoctor: mockLister('saveDoctor'),
    deleteDoctor: mockLister('deleteDoctor'),
    saveDfGroup: mockLister('saveDfGroup'),
    deleteDfGroup: mockLister('deleteDfGroup'),
    saveDfStaffRates: mockLister('saveDfStaffRates'),
    deleteDfStaffRates: mockLister('deleteDfStaffRates'),
    saveBankAccount: mockLister('saveBankAccount'),
    deleteBankAccount: mockLister('deleteBankAccount'),
    saveExpenseCategory: mockLister('saveExpenseCategory'),
    deleteExpenseCategory: mockLister('deleteExpenseCategory'),
    saveExpense: mockLister('saveExpense'),
    deleteExpense: mockLister('deleteExpense'),
    saveOnlineSale: mockLister('saveOnlineSale'),
    deleteOnlineSale: mockLister('deleteOnlineSale'),
    transitionOnlineSale: mockLister('transitionOnlineSale'),
    saveSaleInsuranceClaim: mockLister('saveSaleInsuranceClaim'),
    deleteSaleInsuranceClaim: mockLister('deleteSaleInsuranceClaim'),
    saveDocumentTemplate: mockLister('saveDocumentTemplate'),
    deleteDocumentTemplate: mockLister('deleteDocumentTemplate'),
    saveDocumentDraft: mockLister('saveDocumentDraft'),
    deleteDocumentDraft: mockLister('deleteDocumentDraft'),
    saveVendor: mockLister('saveVendor'),
    deleteVendor: mockLister('deleteVendor'),
    saveVendorSale: mockLister('saveVendorSale'),
    deleteVendorSale: mockLister('deleteVendorSale'),
    transitionVendorSale: mockLister('transitionVendorSale'),
    saveQuotation: mockLister('saveQuotation'),
    deleteQuotation: mockLister('deleteQuotation'),
    savePromotion: mockLister('savePromotion'),
    deletePromotion: mockLister('deletePromotion'),
    saveCoupon: mockLister('saveCoupon'),
    deleteCoupon: mockLister('deleteCoupon'),
    findCouponByCode: mockLister('findCouponByCode'),
    saveVoucher: mockLister('saveVoucher'),
    deleteVoucher: mockLister('deleteVoucher'),
    saveStaffSchedule: mockLister('saveStaffSchedule'),
    deleteStaffSchedule: mockLister('deleteStaffSchedule'),
    saveAudience: mockLister('saveAudience'),
    deleteAudience: mockLister('deleteAudience'),
    deleteCentralWarehouse: mockLister('deleteCentralWarehouse'),
    deleteBackendSale: mockLister('deleteBackendSale'),
    deleteBackendAppointment: mockLister('deleteBackendAppointment'),
    deleteDeposit: mockLister('deleteDeposit'),
    deleteMembership: mockLister('deleteMembership'),
    deleteMasterCourse: mockLister('deleteMasterCourse'),
    deleteMasterItem: mockLister('deleteMasterItem'),
  };
});

beforeEach(() => {
  for (const k of Object.keys(calls)) delete calls[k];
  try { window.localStorage.setItem('selectedBranchId', 'BR-TEST'); } catch {}
});

describe('Task 4 — scopedDataLayer Layer 2', () => {
  describe('BS2.1 branch-scoped one-shot listers auto-inject', () => {
    const branchScoped = [
      'listProducts', 'listCourses',
      'listProductGroups', 'listProductUnitGroups', 'listMedicalInstruments',
      'listHolidays', 'listDfGroups', 'listDfStaffRates',
      'listBankAccounts', 'listExpenseCategories', 'listExpenses',
      'listStaffSchedules',
      'listPromotions', 'listCoupons', 'listVouchers',
      'listOnlineSales', 'listSaleInsuranceClaims', 'listVendorSales',
      'listQuotations',
      'listAllSellers', 'listStaffByBranch',
      'listStockBatches', 'listStockOrders', 'listStockMovements',
      'getAllSales',
    ];
    for (const name of branchScoped) {
      it(`BS2.1.${name} auto-injects current branchId`, async () => {
        const scoped = await import('../src/lib/scopedDataLayer.js');
        await scoped[name]();
        expect(calls[name]).toEqual(expect.objectContaining({ branchId: 'BR-TEST' }));
      });
    }
  });

  describe('BS2.2 positional + opts listers', () => {
    it('BS2.2.1 getAppointmentsByDate(dateStr, opts) auto-injects', async () => {
      const scoped = await import('../src/lib/scopedDataLayer.js');
      await scoped.getAppointmentsByDate('2026-05-01');
      expect(calls.getAppointmentsByDate.positional).toBe('2026-05-01');
      expect(calls.getAppointmentsByDate.opts.branchId).toBe('BR-TEST');
    });

    it('BS2.2.2 getAppointmentsByMonth(yearMonth, opts) auto-injects', async () => {
      const scoped = await import('../src/lib/scopedDataLayer.js');
      await scoped.getAppointmentsByMonth('2026-05');
      expect(calls.getAppointmentsByMonth.positional).toBe('2026-05');
      expect(calls.getAppointmentsByMonth.opts.branchId).toBe('BR-TEST');
    });
  });

  describe('BS2.3 caller override paths', () => {
    it('BS2.3.1 {allBranches:true} preserved', async () => {
      const scoped = await import('../src/lib/scopedDataLayer.js');
      await scoped.listProducts({ allBranches: true });
      expect(calls.listProducts).toEqual({ branchId: 'BR-TEST', allBranches: true });
    });

    it('BS2.3.2 explicit {branchId:"OTHER"} overrides current', async () => {
      const scoped = await import('../src/lib/scopedDataLayer.js');
      await scoped.listCourses({ branchId: 'BR-OTHER' });
      expect(calls.listCourses.branchId).toBe('BR-OTHER');
    });

    it('BS2.3.3 unrelated opts pass through with branchId added', async () => {
      const scoped = await import('../src/lib/scopedDataLayer.js');
      await scoped.listOnlineSales({ status: 'paid', startDate: '2026-05-01' });
      expect(calls.listOnlineSales).toEqual({
        branchId: 'BR-TEST',
        status: 'paid',
        startDate: '2026-05-01',
      });
    });
  });

  describe('BS2.4 universal collections re-export raw (no inject)', () => {
    const universal = [
      'listStaff', 'listDoctors', 'listBranches', 'listPermissionGroups',
      'listDocumentTemplates', 'listAudiences', 'getCustomer', 'getAllCustomers',
      'listCentralStockOrders', 'listCentralWarehouses', 'listStockLocations',
    ];
    for (const name of universal) {
      it(`BS2.4.${name} does NOT inject branchId`, async () => {
        const scoped = await import('../src/lib/scopedDataLayer.js');
        await scoped[name]();
        const captured = calls[name];
        if (captured !== undefined) {
          expect(captured.branchId).toBeUndefined();
        }
      });
    }
  });

  describe('BS2.5 writes re-exported as-is', () => {
    it('BS2.5.1 saveProduct passes args through (no branch injection wrapper)', async () => {
      const scoped = await import('../src/lib/scopedDataLayer.js');
      await scoped.saveProduct('P1', { name: 'x' });
      // mockLister captures arg1 only. If saveProduct had been wrapped with
      // _scoped, arg1 would be `{ branchId:'BR-TEST', ... }` (an object) — we
      // would NOT see the raw productId 'P1' here. Receiving 'P1' proves the
      // writer is re-exported as-is (no auto-inject), which is the contract:
      // Phase BS V2 stamping happens server-side via _resolveBranchIdForWrite.
      expect(calls.saveProduct).toBe('P1');
    });

    it('BS2.5.2 saveCustomer also re-exported as-is', async () => {
      const scoped = await import('../src/lib/scopedDataLayer.js');
      await scoped.saveCustomer('C1', { hn: 'HN-1' });
      expect(calls.saveCustomer).toBe('C1');
    });

    it('BS2.5.3 deleteProduct re-exported as-is', async () => {
      const scoped = await import('../src/lib/scopedDataLayer.js');
      await scoped.deleteProduct('P1');
      expect(calls.deleteProduct).toBe('P1');
    });
  });

  describe('BS2.6 stock-tier listers — locationId NOT injected (caller passes explicitly)', () => {
    it('BS2.6.1 listStockTransfers re-exports raw', async () => {
      const scoped = await import('../src/lib/scopedDataLayer.js');
      await scoped.listStockTransfers({ locationId: 'WH-1' });
      expect(calls.listStockTransfers).toEqual({ locationId: 'WH-1' });
    });

    it('BS2.6.2 listStockWithdrawals re-exports raw', async () => {
      const scoped = await import('../src/lib/scopedDataLayer.js');
      await scoped.listStockWithdrawals({ locationId: 'WH-1' });
      expect(calls.listStockWithdrawals).toEqual({ locationId: 'WH-1' });
    });
  });

  describe('BS2.7 V36.G.51 — no React imports', () => {
    it('BS2.7.1 source has no React or .jsx imports', async () => {
      const fs = await import('node:fs/promises');
      const src = await fs.readFile('src/lib/scopedDataLayer.js', 'utf8');
      expect(src).not.toMatch(/from\s+['"]react['"]/);
      expect(src).not.toMatch(/BranchContext\.jsx/);
      expect(src).not.toMatch(/\.jsx['"]/);
    });
  });

  describe('BS2.8 localStorage absence falls back to FALLBACK_ID', () => {
    it('BS2.8.1 empty localStorage → FALLBACK_ID injected', async () => {
      try { window.localStorage.removeItem('selectedBranchId'); } catch {}
      const scoped = await import('../src/lib/scopedDataLayer.js');
      await scoped.listProducts();
      expect(calls.listProducts.branchId).toBe('main');
    });
  });
});
