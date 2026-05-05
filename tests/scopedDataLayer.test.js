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

    // ── BS2.9 surface-completeness mocks (Task 4-CR) ───────────────────────
    // Listeners (raw — useBranchAwareListener wraps in Task 5)
    listenToCustomer: mockLister('listenToCustomer'),
    listenToCustomerTreatments: mockLister('listenToCustomerTreatments'),
    listenToCustomerAppointments: mockLister('listenToCustomerAppointments'),
    listenToCustomerSales: mockLister('listenToCustomerSales'),
    listenToCustomerFinance: mockLister('listenToCustomerFinance'),
    listenToCourseChanges: mockLister('listenToCourseChanges'),
    listenToAudiences: mockLister('listenToAudiences'),
    listenToUserPermissions: mockLister('listenToUserPermissions'),
    listenToAppointmentsByDate: mockLister('listenToAppointmentsByDate'),
    listenToAllSales: mockLister('listenToAllSales'),
    listenToHolidays: mockLister('listenToHolidays'),
    listenToScheduleByDay: mockLister('listenToScheduleByDay'),

    // Customer ops
    addCustomer: mockLister('addCustomer'),
    updateCustomer: mockLister('updateCustomer'),
    updateCustomerFromForm: mockLister('updateCustomerFromForm'),
    customerExists: mockLister('customerExists'),
    buildFormFromCustomer: mockLister('buildFormFromCustomer'),

    // Sale ops
    createBackendSale: mockLister('createBackendSale'),
    updateBackendSale: mockLister('updateBackendSale'),
    cancelBackendSale: mockLister('cancelBackendSale'),
    updateSalePayment: mockLister('updateSalePayment'),
    markSalePaid: mockLister('markSalePaid'),
    assignCourseToCustomer: mockLister('assignCourseToCustomer'),
    applyDepositToSale: mockLister('applyDepositToSale'),
    convertQuotationToSale: mockLister('convertQuotationToSale'),
    analyzeSaleCancel: mockLister('analyzeSaleCancel'),
    applySaleCancelToCourses: mockLister('applySaleCancelToCourses'),
    setTreatmentLinkedSaleId: mockLister('setTreatmentLinkedSaleId'),
    transitionSaleInsuranceClaim: mockLister('transitionSaleInsuranceClaim'),

    // Treatment ops
    createBackendTreatment: mockLister('createBackendTreatment'),
    updateBackendTreatment: mockLister('updateBackendTreatment'),
    rebuildTreatmentSummary: mockLister('rebuildTreatmentSummary'),

    // Course ops
    deductCourseItems: mockLister('deductCourseItems'),
    reverseCourseDeduction: mockLister('reverseCourseDeduction'),
    addCourseRemainingQty: mockLister('addCourseRemainingQty'),
    addPicksToResolvedGroup: mockLister('addPicksToResolvedGroup'),
    resolvePickedCourseInCustomer: mockLister('resolvePickedCourseInCustomer'),
    cancelCustomerCourse: mockLister('cancelCustomerCourse'),
    refundCustomerCourse: mockLister('refundCustomerCourse'),
    exchangeCourseProduct: mockLister('exchangeCourseProduct'),

    // Stock ops + analysis
    createStockOrder: mockLister('createStockOrder'),
    updateStockOrder: mockLister('updateStockOrder'),
    cancelStockOrder: mockLister('cancelStockOrder'),
    createStockAdjustment: mockLister('createStockAdjustment'),
    createStockTransfer: mockLister('createStockTransfer'),
    updateStockTransferStatus: mockLister('updateStockTransferStatus'),
    createStockWithdrawal: mockLister('createStockWithdrawal'),
    updateStockWithdrawalStatus: mockLister('updateStockWithdrawalStatus'),
    deductStockForSale: mockLister('deductStockForSale'),
    reverseStockForSale: mockLister('reverseStockForSale'),
    deductStockForTreatment: mockLister('deductStockForTreatment'),
    reverseStockForTreatment: mockLister('reverseStockForTreatment'),
    analyzeStockImpact: mockLister('analyzeStockImpact'),
    summarizeSkipReasons: mockLister('summarizeSkipReasons'),

    // Central stock ops
    createCentralWarehouse: mockLister('createCentralWarehouse'),
    updateCentralWarehouse: mockLister('updateCentralWarehouse'),
    createCentralStockOrder: mockLister('createCentralStockOrder'),
    cancelCentralStockOrder: mockLister('cancelCentralStockOrder'),
    receiveCentralStockOrder: mockLister('receiveCentralStockOrder'),

    // Appointment ops
    createBackendAppointment: mockLister('createBackendAppointment'),
    updateBackendAppointment: mockLister('updateBackendAppointment'),

    // Deposit ops
    createDeposit: mockLister('createDeposit'),
    updateDeposit: mockLister('updateDeposit'),
    cancelDeposit: mockLister('cancelDeposit'),
    refundDeposit: mockLister('refundDeposit'),
    reverseDepositUsage: mockLister('reverseDepositUsage'),

    // Wallet/points ops
    ensureCustomerWallet: mockLister('ensureCustomerWallet'),
    topUpWallet: mockLister('topUpWallet'),
    adjustWallet: mockLister('adjustWallet'),
    deductWallet: mockLister('deductWallet'),
    refundToWallet: mockLister('refundToWallet'),
    adjustPoints: mockLister('adjustPoints'),
    earnPoints: mockLister('earnPoints'),
    reversePointsEarned: mockLister('reversePointsEarned'),

    // Membership ops
    createMembership: mockLister('createMembership'),
    cancelMembership: mockLister('cancelMembership'),
    renewMembership: mockLister('renewMembership'),

    // Document infra
    seedDocumentTemplatesIfEmpty: mockLister('seedDocumentTemplatesIfEmpty'),
    upgradeSystemDocumentTemplates: mockLister('upgradeSystemDocumentTemplates'),
    findResumableDraft: mockLister('findResumableDraft'),
    recordDocumentPrint: mockLister('recordDocumentPrint'),

    // Audience helpers
    newAudienceId: mockLister('newAudienceId'),

    // Master shape
    beCourseToMasterShape: mockLister('beCourseToMasterShape'),

    // Master data sync helpers REMOVED from scopedDataLayer in Task 11
    // (MasterDataTab consumes them via backendClient direct per Rule H-bis).

    // Treatment context-specific
    listProductGroupsForTreatment: mockLister('listProductGroupsForTreatment'),

    // Admin reconciler
    reconcileAllCustomerSummaries: mockLister('reconcileAllCustomerSummaries'),
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
      // Phase BSA leak-sweep-2 (2026-05-04) — deposits branch-scoped
      'getAllDeposits',
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
    it('BS2.3.1 {allBranches:true} preserved (Phase 17.2-bis: no redundant branchId injection)', async () => {
      // Phase 17.2-bis (2026-05-05): when allBranches:true, scopedDataLayer
      // pass-throughs without auto-injecting branchId — caller wants
      // cross-branch read, branchId is moot. Pre-17.2-bis the wrapper
      // unconditionally spread `{branchId: resolveSelectedBranchId(), ...opts}`
      // which produced the redundant pair `{branchId:'BR-TEST', allBranches:true}`.
      const scoped = await import('../src/lib/scopedDataLayer.js');
      await scoped.listProducts({ allBranches: true });
      expect(calls.listProducts).toEqual({ allBranches: true });
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
      // Phase BSA leak-sweep-2 (2026-05-04) — customer-attached deposit
      // lookups stay UNIVERSAL (a customer can have deposits at any branch
      // and customer-detail views aggregate across all). getAllDeposits is
      // the LIST-level reader and is branch-scoped (BS2.1).
      'getCustomerDeposits', 'getActiveDeposits',
    ];
    for (const name of universal) {
      it(`BS2.4.${name} does NOT inject branchId`, async () => {
        const scoped = await import('../src/lib/scopedDataLayer.js');
        await scoped[name]();
        // V21 lock — assert the captured opts directly. The previous
        // `if (captured !== undefined)` guard let a vacuous-pass slip
        // through if the mock was missing (captured undefined → branch
        // skipped → green). Optional chaining keeps the test honest:
        // captured?.branchId must be undefined either because captured
        // is itself undefined (raw export, no opts arg) OR because the
        // function didn't auto-inject branchId.
        expect(calls[name]?.branchId).toBeUndefined();
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

  describe('BS2.8 Phase 17.2-bis — localStorage absence → empty array (no cross-branch leak)', () => {
    it('BS2.8.1 empty localStorage → wrapper returns [] WITHOUT calling raw lister', async () => {
      // Phase 17.2-bis (2026-05-05): when resolveSelectedBranchId() returns
      // null (no branch resolved, no auth, no localStorage), the wrapper
      // returns Promise.resolve([]) directly. Pre-17.2-bis it injected
      // `branchId: null` and the raw lister fell back to a CROSS-BRANCH
      // read because `useFilter = branchId && !allBranches` evaluated
      // null as falsy. User-facing symptom on prod: TFP buttons showed
      // every branch's data after switching to a branch with no data.
      // Coverage of the runtime selection in
      // tests/phase-17-2-branch-context-rewrite.test.jsx BC1.8.
      try {
        window.localStorage.removeItem('selectedBranchId');
        // Phase 17.2-bis — also clear per-user keyed values (the auth mock
        // returns uid='user-test' OR similar; ensure no keyed value either).
        Object.keys(window.localStorage)
          .filter(k => k.startsWith('selectedBranchId:'))
          .forEach(k => window.localStorage.removeItem(k));
      } catch {}
      // Reset captured calls to detect "raw was NOT invoked".
      delete calls.listProducts;
      const scoped = await import('../src/lib/scopedDataLayer.js');
      const result = await scoped.listProducts();
      expect(result).toEqual([]);
      // raw.listProducts must NOT have been called (cross-branch leak prevention).
      expect(calls.listProducts).toBeUndefined();
    });

    it('BS2.8.2 explicit {allBranches:true} still works when localStorage empty', async () => {
      // allBranches:true is the explicit cross-branch read opt — must work
      // even when no branch is resolved. Pass-through, no auto-inject.
      try { window.localStorage.removeItem('selectedBranchId'); } catch {}
      delete calls.listProducts;
      const scoped = await import('../src/lib/scopedDataLayer.js');
      await scoped.listProducts({ allBranches: true });
      expect(calls.listProducts).toEqual({ allBranches: true });
    });
  });

  describe('BS2.9 — surface completeness (UI consumers)', () => {
    // Every name UI components actually import from backendClient — must
    // be re-exported by scopedDataLayer so Task 6 mass-import migration
    // can swap import paths without build failure.
    const requiredExports = [
      // Listeners (raw — useBranchAwareListener wraps in Task 5)
      'listenToCustomer', 'listenToCustomerTreatments',
      'listenToCustomerAppointments', 'listenToCustomerSales',
      'listenToCustomerFinance', 'listenToCourseChanges',
      'listenToAudiences', 'listenToUserPermissions',
      'listenToAppointmentsByDate', 'listenToAllSales',
      'listenToHolidays', 'listenToScheduleByDay',
      // Customer ops
      'addCustomer', 'updateCustomer', 'updateCustomerFromForm',
      'customerExists', 'buildFormFromCustomer',
      // Sale ops
      'createBackendSale', 'updateBackendSale', 'cancelBackendSale',
      'updateSalePayment', 'markSalePaid',
      'assignCourseToCustomer', 'applyDepositToSale',
      'convertQuotationToSale', 'analyzeSaleCancel',
      'applySaleCancelToCourses', 'setTreatmentLinkedSaleId',
      'transitionSaleInsuranceClaim',
      // Treatment ops
      'createBackendTreatment', 'updateBackendTreatment',
      'rebuildTreatmentSummary',
      // Course ops
      'deductCourseItems', 'reverseCourseDeduction',
      'addCourseRemainingQty', 'addPicksToResolvedGroup',
      'resolvePickedCourseInCustomer', 'cancelCustomerCourse',
      'refundCustomerCourse', 'exchangeCourseProduct',
      // Stock ops + analysis
      'createStockOrder', 'updateStockOrder', 'cancelStockOrder',
      'createStockAdjustment', 'createStockTransfer',
      'updateStockTransferStatus', 'createStockWithdrawal',
      'updateStockWithdrawalStatus', 'deductStockForSale',
      'reverseStockForSale', 'deductStockForTreatment',
      'reverseStockForTreatment', 'analyzeStockImpact',
      'summarizeSkipReasons',
      // Central stock ops
      'createCentralWarehouse', 'updateCentralWarehouse',
      'createCentralStockOrder', 'cancelCentralStockOrder',
      'receiveCentralStockOrder',
      // Appointment ops
      'createBackendAppointment', 'updateBackendAppointment',
      // Deposit ops
      'createDeposit', 'updateDeposit', 'cancelDeposit',
      'refundDeposit', 'reverseDepositUsage',
      // Wallet/points ops
      'ensureCustomerWallet', 'topUpWallet', 'adjustWallet',
      'deductWallet', 'refundToWallet',
      'adjustPoints', 'earnPoints', 'reversePointsEarned',
      // Membership ops
      'createMembership', 'cancelMembership', 'renewMembership',
      // Document infra
      'seedDocumentTemplatesIfEmpty', 'upgradeSystemDocumentTemplates',
      'findResumableDraft', 'recordDocumentPrint',
      // Audience helpers
      'newAudienceId',
      // Master shape
      'beCourseToMasterShape',
      // Master data sync helpers REMOVED from scopedDataLayer in Task 11
      // (MasterDataTab consumes them via backendClient direct per Rule H-bis).
      // Treatment context-specific
      'listProductGroupsForTreatment',
      // Admin reconciler
      'reconcileAllCustomerSummaries',
    ];

    for (const name of requiredExports) {
      it(`BS2.9.${name} is exported from scopedDataLayer`, async () => {
        const scoped = await import('../src/lib/scopedDataLayer.js');
        expect(typeof scoped[name]).toBe('function');
      });
    }
  });
});
