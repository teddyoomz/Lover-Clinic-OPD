// ─── scopedDataLayer — Branch-Scope Architecture Layer 2 ────────────────────
// Phase BSA (2026-05-04). Re-exports backendClient.js with auto-injection of
// the currently-selected branchId for branch-scoped listers. Pure JS — no
// React imports (V36.G.51 lock).
//
// Pattern:
//   import { listCourses } from '../lib/scopedDataLayer.js';
//   await listCourses();   // branchId auto-injected from localStorage
//   await listCourses({ allBranches: true });        // opt-out
//   await listCourses({ branchId: 'BR-OTHER' });     // explicit override
//
// Universal collections (staff, doctors, customers, templates, branches,
// permission_groups, audiences, central_stock_*) re-exported AS-IS — no
// branch logic. Universal callers know what they want.
//
// Writers re-exported AS-IS — Phase BS V2 stamping inside backendClient
// already handles current-branch resolution via _resolveBranchIdForWrite.
//
// Audit: BS-1 forbids UI components from importing backendClient.js
// directly (must use this module). BS-7 forbids classification drift.
//
// NOTE on lazy access (Task 6 hardening, 2026-05-04):
//   Every export accesses `raw.X` LAZILY (inside a closure called at usage
//   time), never at module-load. This keeps vitest strict-mock checking
//   happy when tests mock backendClient.js with a partial surface — the
//   strict-namespace error only fires when code actually calls the
//   undefined export, not when scopedDataLayer evaluates its own exports.
//   Public callable surface is unchanged: every export is still a function
//   with the same signature backendClient.js exposes.

import * as raw from './backendClient.js';
import { resolveSelectedBranchId } from './branchSelection.js';

// ─── Branch-scoped one-shot listers — auto-inject ──────────────────────────
// Lazy: raw.X accessed at call time, not module-load.

export const listProducts = (opts = {}) => raw.listProducts({ branchId: resolveSelectedBranchId(), ...opts });
export const listCourses = (opts = {}) => raw.listCourses({ branchId: resolveSelectedBranchId(), ...opts });
export const listProductGroups = (opts = {}) => raw.listProductGroups({ branchId: resolveSelectedBranchId(), ...opts });
export const listProductUnitGroups = (opts = {}) => raw.listProductUnitGroups({ branchId: resolveSelectedBranchId(), ...opts });
export const listMedicalInstruments = (opts = {}) => raw.listMedicalInstruments({ branchId: resolveSelectedBranchId(), ...opts });
export const listHolidays = (opts = {}) => raw.listHolidays({ branchId: resolveSelectedBranchId(), ...opts });
export const listDfGroups = (opts = {}) => raw.listDfGroups({ branchId: resolveSelectedBranchId(), ...opts });
export const listDfStaffRates = (opts = {}) => raw.listDfStaffRates({ branchId: resolveSelectedBranchId(), ...opts });

// Finance master
export const listBankAccounts = (opts = {}) => raw.listBankAccounts({ branchId: resolveSelectedBranchId(), ...opts });
export const listExpenseCategories = (opts = {}) => raw.listExpenseCategories({ branchId: resolveSelectedBranchId(), ...opts });
export const listExpenses = (opts = {}) => raw.listExpenses({ branchId: resolveSelectedBranchId(), ...opts });

// Schedules
export const listStaffSchedules = (opts = {}) => raw.listStaffSchedules({ branchId: resolveSelectedBranchId(), ...opts });

// Marketing (with allBranches:true doc-field OR-merge inside Layer 1)
export const listPromotions = (opts = {}) => raw.listPromotions({ branchId: resolveSelectedBranchId(), ...opts });
export const listCoupons = (opts = {}) => raw.listCoupons({ branchId: resolveSelectedBranchId(), ...opts });
export const listVouchers = (opts = {}) => raw.listVouchers({ branchId: resolveSelectedBranchId(), ...opts });

// Financial
export const listOnlineSales = (opts = {}) => raw.listOnlineSales({ branchId: resolveSelectedBranchId(), ...opts });
export const listSaleInsuranceClaims = (opts = {}) => raw.listSaleInsuranceClaims({ branchId: resolveSelectedBranchId(), ...opts });
export const listVendorSales = (opts = {}) => raw.listVendorSales({ branchId: resolveSelectedBranchId(), ...opts });
export const listQuotations = (opts = {}) => raw.listQuotations({ branchId: resolveSelectedBranchId(), ...opts });
// Deposits — Phase BSA leak-sweep-2 (2026-05-04): branch-scoped per user
// directive. Customer-attached deposit lookups (getCustomerDeposits /
// getActiveDeposits) stay UNIVERSAL — see below.
export const getAllDeposits = (opts = {}) => raw.getAllDeposits({ branchId: resolveSelectedBranchId(), ...opts });

// Sellers / staff-by-branch
export const listAllSellers = (opts = {}) => raw.listAllSellers({ branchId: resolveSelectedBranchId(), ...opts });
export const listStaffByBranch = (opts = {}) => raw.listStaffByBranch({ branchId: resolveSelectedBranchId(), ...opts });

// Sales / appointments — positional + opts
export const getAllSales = (opts = {}) => raw.getAllSales({ branchId: resolveSelectedBranchId(), ...opts });
export const getAppointmentsByDate = (positional, opts = {}) => raw.getAppointmentsByDate(positional, { branchId: resolveSelectedBranchId(), ...opts });
export const getAppointmentsByMonth = (positional, opts = {}) => raw.getAppointmentsByMonth(positional, { branchId: resolveSelectedBranchId(), ...opts });

// Stock — branch-scoped (locationId == branchId at branch tier)
export const listStockBatches = (opts = {}) => raw.listStockBatches({ branchId: resolveSelectedBranchId(), ...opts });
export const listStockOrders = (opts = {}) => raw.listStockOrders({ branchId: resolveSelectedBranchId(), ...opts });
export const listStockMovements = (opts = {}) => raw.listStockMovements({ branchId: resolveSelectedBranchId(), ...opts });

// ─── Universal — re-export raw (LAZY), NO branch logic ─────────────────────

// Staff / doctors / customers / templates / branches / permissions
export const listStaff = (...args) => raw.listStaff(...args);
export const listDoctors = (...args) => raw.listDoctors(...args);
export const listBranches = (...args) => raw.listBranches(...args);
export const listPermissionGroups = (...args) => raw.listPermissionGroups(...args);
export const listDocumentTemplates = (...args) => raw.listDocumentTemplates(...args);

// Customer-attached subcollections
export const getCustomer = (...args) => raw.getCustomer(...args);
export const getAllCustomers = (...args) => raw.getAllCustomers(...args);
export const getCustomerWallets = (...args) => raw.getCustomerWallets(...args);
export const getWalletBalance = (...args) => raw.getWalletBalance(...args);
export const getWalletTransactions = (...args) => raw.getWalletTransactions(...args);
export const getCustomerMembership = (...args) => raw.getCustomerMembership(...args);
export const getAllMemberships = (...args) => raw.getAllMemberships(...args);
export const getCustomerMembershipDiscount = (...args) => raw.getCustomerMembershipDiscount(...args);
export const getCustomerBahtPerPoint = (...args) => raw.getCustomerBahtPerPoint(...args);
export const getPointBalance = (...args) => raw.getPointBalance(...args);
export const getPointTransactions = (...args) => raw.getPointTransactions(...args);
export const getCustomerTreatments = (...args) => raw.getCustomerTreatments(...args);
export const getCustomerSales = (...args) => raw.getCustomerSales(...args);
export const getCustomerAppointments = (...args) => raw.getCustomerAppointments(...args);
export const getCustomerDeposits = (...args) => raw.getCustomerDeposits(...args);
export const getActiveDeposits = (...args) => raw.getActiveDeposits(...args);
export const listMembershipTypes = (...args) => raw.listMembershipTypes(...args);
export const listWalletTypes = (...args) => raw.listWalletTypes(...args);
export const listCourseChanges = (...args) => raw.listCourseChanges(...args);

// ─── Universal listeners (live snapshot — re-exported lazy) ────────────────
// Layer 3 hook (useBranchAwareListener, Task 5) wraps these for branchId
// injection + re-subscribe on branch change. Customer-attached listeners
// have __universal__:true marker (Task 3) so the hook skips branch logic.
//
// Listener marker preservation: useBranchAwareListener reads `fn.__universal__`
// to decide branch logic. Wrapping the listener in `(...args) => raw.X(...args)`
// would HIDE that marker. Solution: assign __universal__ on the wrapper at
// first-call resolve, or use Object.defineProperty up-front. Since these are
// all marked __universal__:true on raw.X (Task 3), copy the marker eagerly:
// the marker is a static boolean (not a function call), so accessing it does
// NOT trigger vitest strict-mock the same way method invocation does — but
// to be safe, mark the wrapper directly here (literal true).

function _makeUniversalListener(name) {
  const wrapper = (...args) => raw[name](...args);
  wrapper.__universal__ = true;
  return wrapper;
}

export const listenToCustomer = _makeUniversalListener('listenToCustomer');
export const listenToCustomerTreatments = _makeUniversalListener('listenToCustomerTreatments');
export const listenToCustomerAppointments = _makeUniversalListener('listenToCustomerAppointments');
export const listenToCustomerSales = _makeUniversalListener('listenToCustomerSales');
export const listenToCustomerFinance = _makeUniversalListener('listenToCustomerFinance');
export const listenToCourseChanges = _makeUniversalListener('listenToCourseChanges');
export const listenToAudiences = _makeUniversalListener('listenToAudiences');
export const listenToUserPermissions = _makeUniversalListener('listenToUserPermissions');

// ─── Branch-scoped listeners (raw — useBranchAwareListener injects branchId) ─
// useBranchAwareListener hook (Task 5) injects branchId and re-subscribes on
// branch switch. Re-export RAW here — listeners need re-subscribe lifecycle
// that a wrapper-at-call-time can't provide.
export const listenToAppointmentsByDate = (...args) => raw.listenToAppointmentsByDate(...args);
export const listenToAllSales = (...args) => raw.listenToAllSales(...args);
export const listenToHolidays = (...args) => raw.listenToHolidays(...args);
export const listenToScheduleByDay = (...args) => raw.listenToScheduleByDay(...args);

// Audiences (smart segments — global filter)
export const listAudiences = (...args) => raw.listAudiences(...args);
export const getAudience = (...args) => raw.getAudience(...args);
// Audience helpers
export const newAudienceId = (...args) => raw.newAudienceId(...args);

// Documents
export const getDocumentTemplate = (...args) => raw.getDocumentTemplate(...args);
export const listDocumentDrafts = (...args) => raw.listDocumentDrafts(...args);
export const listDocumentPrints = (...args) => raw.listDocumentPrints(...args);
export const getDocumentDraft = (...args) => raw.getDocumentDraft(...args);
export const getNextCertNumber = (...args) => raw.getNextCertNumber(...args);

// ─── Document infra (seeding / upgrade / drafts / print log) ───────────────
export const seedDocumentTemplatesIfEmpty = (...args) => raw.seedDocumentTemplatesIfEmpty(...args);
export const upgradeSystemDocumentTemplates = (...args) => raw.upgradeSystemDocumentTemplates(...args);
export const findResumableDraft = (...args) => raw.findResumableDraft(...args);
export const recordDocumentPrint = (...args) => raw.recordDocumentPrint(...args);

// Vendors (universal supplier directory)
export const listVendors = (...args) => raw.listVendors(...args);

// Stock — central tier (universal across central warehouses)
export const listCentralStockOrders = (...args) => raw.listCentralStockOrders(...args);
export const listCentralWarehouses = (...args) => raw.listCentralWarehouses(...args);
export const listStockLocations = (...args) => raw.listStockLocations(...args);
export const getCentralStockOrder = (...args) => raw.getCentralStockOrder(...args);

// ─── Stock — tier-scoped (caller passes locationId explicitly) ─────────────
// listStockTransfers/Withdrawals span TWO tiers (central WH ↔ branch); caller
// chooses which side to query via locationId. Auto-injecting branchId would
// silently filter out central-tier views.
export const listStockTransfers = (...args) => raw.listStockTransfers(...args);
export const listStockWithdrawals = (...args) => raw.listStockWithdrawals(...args);
export const getStockBatch = (...args) => raw.getStockBatch(...args);
export const getStockOrder = (...args) => raw.getStockOrder(...args);
export const getStockTransfer = (...args) => raw.getStockTransfer(...args);
export const getStockWithdrawal = (...args) => raw.getStockWithdrawal(...args);
export const getStockAdjustment = (...args) => raw.getStockAdjustment(...args);

// ─── Generic single-doc gets — caller has the id, no branch scope ──────────

export const getProduct = (...args) => raw.getProduct(...args);
export const getCourse = (...args) => raw.getCourse(...args);
export const getProductGroup = (...args) => raw.getProductGroup(...args);
export const getProductUnitGroup = (...args) => raw.getProductUnitGroup(...args);
export const getMedicalInstrument = (...args) => raw.getMedicalInstrument(...args);
export const getHoliday = (...args) => raw.getHoliday(...args);
export const getDfGroup = (...args) => raw.getDfGroup(...args);
export const getDfStaffRates = (...args) => raw.getDfStaffRates(...args);
export const getBankAccount = (...args) => raw.getBankAccount(...args);
export const getExpense = (...args) => raw.getExpense(...args);
export const getOnlineSale = (...args) => raw.getOnlineSale(...args);
export const getSaleInsuranceClaim = (...args) => raw.getSaleInsuranceClaim(...args);
export const getQuotation = (...args) => raw.getQuotation(...args);
export const getStaff = (...args) => raw.getStaff(...args);
export const getDoctor = (...args) => raw.getDoctor(...args);
export const getBranch = (...args) => raw.getBranch(...args);
export const getPermissionGroup = (...args) => raw.getPermissionGroup(...args);
export const getStaffSchedule = (...args) => raw.getStaffSchedule(...args);
export const getCoupon = (...args) => raw.getCoupon(...args);
export const getVoucher = (...args) => raw.getVoucher(...args);
export const getPromotion = (...args) => raw.getPromotion(...args);
export const getTreatment = (...args) => raw.getTreatment(...args);
export const getBackendSale = (...args) => raw.getBackendSale(...args);
export const getDeposit = (...args) => raw.getDeposit(...args);
// getAllDeposits — moved up to "Financial" group (branch-scoped). DO NOT
// re-export as universal here; that would shadow the auto-inject wrapper.
export const getSaleByTreatmentId = (...args) => raw.getSaleByTreatmentId(...args);
export const getMasterDataMeta = (...args) => raw.getMasterDataMeta(...args);
export const getActiveSchedulesForDate = (...args) => raw.getActiveSchedulesForDate(...args);
export const getBeBackedMasterTypes = (...args) => raw.getBeBackedMasterTypes(...args);

// ─── Writes — re-export raw (Phase BS V2 stamping handled inside) ──────────

export const saveCustomer = (...args) => raw.saveCustomer(...args);
export const deleteCustomerDocOnly = (...args) => raw.deleteCustomerDocOnly(...args);
export const deleteCustomerCascade = (...args) => raw.deleteCustomerCascade(...args);
export const saveTreatment = (...args) => raw.saveTreatment(...args);
export const deleteBackendTreatment = (...args) => raw.deleteBackendTreatment(...args);
export const saveProduct = (...args) => raw.saveProduct(...args);
export const deleteProduct = (...args) => raw.deleteProduct(...args);
export const saveCourse = (...args) => raw.saveCourse(...args);
export const deleteCourse = (...args) => raw.deleteCourse(...args);
export const saveProductGroup = (...args) => raw.saveProductGroup(...args);
export const deleteProductGroup = (...args) => raw.deleteProductGroup(...args);
export const saveProductUnitGroup = (...args) => raw.saveProductUnitGroup(...args);
export const deleteProductUnitGroup = (...args) => raw.deleteProductUnitGroup(...args);
export const saveMedicalInstrument = (...args) => raw.saveMedicalInstrument(...args);
export const deleteMedicalInstrument = (...args) => raw.deleteMedicalInstrument(...args);
export const saveHoliday = (...args) => raw.saveHoliday(...args);
export const deleteHoliday = (...args) => raw.deleteHoliday(...args);
export const saveBranch = (...args) => raw.saveBranch(...args);
export const deleteBranch = (...args) => raw.deleteBranch(...args);
export const savePermissionGroup = (...args) => raw.savePermissionGroup(...args);
export const deletePermissionGroup = (...args) => raw.deletePermissionGroup(...args);
export const saveStaff = (...args) => raw.saveStaff(...args);
export const deleteStaff = (...args) => raw.deleteStaff(...args);
export const saveDoctor = (...args) => raw.saveDoctor(...args);
export const deleteDoctor = (...args) => raw.deleteDoctor(...args);
export const saveDfGroup = (...args) => raw.saveDfGroup(...args);
export const deleteDfGroup = (...args) => raw.deleteDfGroup(...args);
export const saveDfStaffRates = (...args) => raw.saveDfStaffRates(...args);
export const deleteDfStaffRates = (...args) => raw.deleteDfStaffRates(...args);
export const saveBankAccount = (...args) => raw.saveBankAccount(...args);
export const deleteBankAccount = (...args) => raw.deleteBankAccount(...args);
export const saveExpenseCategory = (...args) => raw.saveExpenseCategory(...args);
export const deleteExpenseCategory = (...args) => raw.deleteExpenseCategory(...args);
export const saveExpense = (...args) => raw.saveExpense(...args);
export const deleteExpense = (...args) => raw.deleteExpense(...args);
export const saveOnlineSale = (...args) => raw.saveOnlineSale(...args);
export const deleteOnlineSale = (...args) => raw.deleteOnlineSale(...args);
export const transitionOnlineSale = (...args) => raw.transitionOnlineSale(...args);
export const saveSaleInsuranceClaim = (...args) => raw.saveSaleInsuranceClaim(...args);
export const deleteSaleInsuranceClaim = (...args) => raw.deleteSaleInsuranceClaim(...args);
export const saveDocumentTemplate = (...args) => raw.saveDocumentTemplate(...args);
export const deleteDocumentTemplate = (...args) => raw.deleteDocumentTemplate(...args);
export const saveDocumentDraft = (...args) => raw.saveDocumentDraft(...args);
export const deleteDocumentDraft = (...args) => raw.deleteDocumentDraft(...args);
export const saveVendor = (...args) => raw.saveVendor(...args);
export const deleteVendor = (...args) => raw.deleteVendor(...args);
export const saveVendorSale = (...args) => raw.saveVendorSale(...args);
export const deleteVendorSale = (...args) => raw.deleteVendorSale(...args);
export const transitionVendorSale = (...args) => raw.transitionVendorSale(...args);
export const saveQuotation = (...args) => raw.saveQuotation(...args);
export const deleteQuotation = (...args) => raw.deleteQuotation(...args);
export const savePromotion = (...args) => raw.savePromotion(...args);
export const deletePromotion = (...args) => raw.deletePromotion(...args);
export const saveCoupon = (...args) => raw.saveCoupon(...args);
export const deleteCoupon = (...args) => raw.deleteCoupon(...args);
export const findCouponByCode = (...args) => raw.findCouponByCode(...args);
export const saveVoucher = (...args) => raw.saveVoucher(...args);
export const deleteVoucher = (...args) => raw.deleteVoucher(...args);
export const saveStaffSchedule = (...args) => raw.saveStaffSchedule(...args);
export const deleteStaffSchedule = (...args) => raw.deleteStaffSchedule(...args);
export const saveAudience = (...args) => raw.saveAudience(...args);
export const deleteAudience = (...args) => raw.deleteAudience(...args);
export const deleteCentralWarehouse = (...args) => raw.deleteCentralWarehouse(...args);
export const deleteBackendSale = (...args) => raw.deleteBackendSale(...args);
export const deleteBackendAppointment = (...args) => raw.deleteBackendAppointment(...args);
export const deleteDeposit = (...args) => raw.deleteDeposit(...args);
export const deleteMembership = (...args) => raw.deleteMembership(...args);
export const deleteMasterCourse = (...args) => raw.deleteMasterCourse(...args);
export const deleteMasterItem = (...args) => raw.deleteMasterItem(...args);

// ─── Customer write/read operations ────────────────────────────────────────
export const addCustomer = (...args) => raw.addCustomer(...args);
export const updateCustomer = (...args) => raw.updateCustomer(...args);
export const updateCustomerFromForm = (...args) => raw.updateCustomerFromForm(...args);
export const customerExists = (...args) => raw.customerExists(...args);
export const buildFormFromCustomer = (...args) => raw.buildFormFromCustomer(...args);

// ─── Sale operations ───────────────────────────────────────────────────────
export const createBackendSale = (...args) => raw.createBackendSale(...args);
export const updateBackendSale = (...args) => raw.updateBackendSale(...args);
export const cancelBackendSale = (...args) => raw.cancelBackendSale(...args);
export const updateSalePayment = (...args) => raw.updateSalePayment(...args);
export const markSalePaid = (...args) => raw.markSalePaid(...args);
export const assignCourseToCustomer = (...args) => raw.assignCourseToCustomer(...args);
export const applyDepositToSale = (...args) => raw.applyDepositToSale(...args);
export const convertQuotationToSale = (...args) => raw.convertQuotationToSale(...args);
export const analyzeSaleCancel = (...args) => raw.analyzeSaleCancel(...args);
export const applySaleCancelToCourses = (...args) => raw.applySaleCancelToCourses(...args);
export const setTreatmentLinkedSaleId = (...args) => raw.setTreatmentLinkedSaleId(...args);
export const transitionSaleInsuranceClaim = (...args) => raw.transitionSaleInsuranceClaim(...args);

// ─── Treatment operations ──────────────────────────────────────────────────
export const createBackendTreatment = (...args) => raw.createBackendTreatment(...args);
export const updateBackendTreatment = (...args) => raw.updateBackendTreatment(...args);
export const rebuildTreatmentSummary = (...args) => raw.rebuildTreatmentSummary(...args);

// ─── Course operations ─────────────────────────────────────────────────────
export const deductCourseItems = (...args) => raw.deductCourseItems(...args);
export const reverseCourseDeduction = (...args) => raw.reverseCourseDeduction(...args);
export const addCourseRemainingQty = (...args) => raw.addCourseRemainingQty(...args);
export const addPicksToResolvedGroup = (...args) => raw.addPicksToResolvedGroup(...args);
export const resolvePickedCourseInCustomer = (...args) => raw.resolvePickedCourseInCustomer(...args);
export const cancelCustomerCourse = (...args) => raw.cancelCustomerCourse(...args);
export const refundCustomerCourse = (...args) => raw.refundCustomerCourse(...args);
export const exchangeCourseProduct = (...args) => raw.exchangeCourseProduct(...args);

// ─── Stock operations (writers + analysis) ─────────────────────────────────
export const createStockOrder = (...args) => raw.createStockOrder(...args);
export const updateStockOrder = (...args) => raw.updateStockOrder(...args);
export const cancelStockOrder = (...args) => raw.cancelStockOrder(...args);
export const createStockAdjustment = (...args) => raw.createStockAdjustment(...args);
export const createStockTransfer = (...args) => raw.createStockTransfer(...args);
export const updateStockTransferStatus = (...args) => raw.updateStockTransferStatus(...args);
export const createStockWithdrawal = (...args) => raw.createStockWithdrawal(...args);
export const updateStockWithdrawalStatus = (...args) => raw.updateStockWithdrawalStatus(...args);
export const deductStockForSale = (...args) => raw.deductStockForSale(...args);
export const reverseStockForSale = (...args) => raw.reverseStockForSale(...args);
export const deductStockForTreatment = (...args) => raw.deductStockForTreatment(...args);
export const reverseStockForTreatment = (...args) => raw.reverseStockForTreatment(...args);
export const analyzeStockImpact = (...args) => raw.analyzeStockImpact(...args);
export const summarizeSkipReasons = (...args) => raw.summarizeSkipReasons(...args);

// ─── Central stock operations ──────────────────────────────────────────────
export const createCentralWarehouse = (...args) => raw.createCentralWarehouse(...args);
export const updateCentralWarehouse = (...args) => raw.updateCentralWarehouse(...args);
export const createCentralStockOrder = (...args) => raw.createCentralStockOrder(...args);
export const cancelCentralStockOrder = (...args) => raw.cancelCentralStockOrder(...args);
export const receiveCentralStockOrder = (...args) => raw.receiveCentralStockOrder(...args);

// ─── Appointment operations ────────────────────────────────────────────────
export const createBackendAppointment = (...args) => raw.createBackendAppointment(...args);
export const updateBackendAppointment = (...args) => raw.updateBackendAppointment(...args);

// ─── Deposit operations ────────────────────────────────────────────────────
export const createDeposit = (...args) => raw.createDeposit(...args);
export const updateDeposit = (...args) => raw.updateDeposit(...args);
export const cancelDeposit = (...args) => raw.cancelDeposit(...args);
export const refundDeposit = (...args) => raw.refundDeposit(...args);
export const reverseDepositUsage = (...args) => raw.reverseDepositUsage(...args);

// ─── Wallet / points operations ────────────────────────────────────────────
export const ensureCustomerWallet = (...args) => raw.ensureCustomerWallet(...args);
export const topUpWallet = (...args) => raw.topUpWallet(...args);
export const adjustWallet = (...args) => raw.adjustWallet(...args);
export const deductWallet = (...args) => raw.deductWallet(...args);
export const refundToWallet = (...args) => raw.refundToWallet(...args);
export const adjustPoints = (...args) => raw.adjustPoints(...args);
export const earnPoints = (...args) => raw.earnPoints(...args);
export const reversePointsEarned = (...args) => raw.reversePointsEarned(...args);

// ─── Membership operations ─────────────────────────────────────────────────
export const createMembership = (...args) => raw.createMembership(...args);
export const cancelMembership = (...args) => raw.cancelMembership(...args);
export const renewMembership = (...args) => raw.renewMembership(...args);

// ─── Master shape conversion ───────────────────────────────────────────────
export const beCourseToMasterShape = (...args) => raw.beCourseToMasterShape(...args);

// ─── Master data sync — REMOVED FROM SCOPED LAYER (Task 11) ────────────────
// Per Rule H-bis, master-data sync helpers (getAllMasterDataItems, run*Sync,
// migrate*ToBe, etc.) live in backendClient.js and are consumed ONLY by
// MasterDataTab.jsx (sanctioned exception per BS-1 annotation). Removing
// them from scopedDataLayer prevents accidental re-export to feature code
// and keeps the BSA boundary clean.

// ─── Treatment context-specific helper (be_product_groups for TFP modal) ───
export const listProductGroupsForTreatment = (...args) => raw.listProductGroupsForTreatment(...args);

// ─── Admin reconciler ──────────────────────────────────────────────────────
export const reconcileAllCustomerSummaries = (...args) => raw.reconcileAllCustomerSummaries(...args);
