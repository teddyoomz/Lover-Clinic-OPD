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

import * as raw from './backendClient.js';
import { resolveSelectedBranchId } from './branchSelection.js';

// ─── Branch-scoped one-shot listers — auto-inject ──────────────────────────

const _scoped = (fn) => (opts = {}) =>
  fn({ branchId: resolveSelectedBranchId(), ...opts });

const _scopedPositional = (fn) => (positional, opts = {}) =>
  fn(positional, { branchId: resolveSelectedBranchId(), ...opts });

// Master data
export const listProducts = _scoped(raw.listProducts);
export const listCourses = _scoped(raw.listCourses);
export const listProductGroups = _scoped(raw.listProductGroups);
export const listProductUnitGroups = _scoped(raw.listProductUnitGroups);
export const listMedicalInstruments = _scoped(raw.listMedicalInstruments);
export const listHolidays = _scoped(raw.listHolidays);
export const listDfGroups = _scoped(raw.listDfGroups);
export const listDfStaffRates = _scoped(raw.listDfStaffRates);

// Finance master
export const listBankAccounts = _scoped(raw.listBankAccounts);
export const listExpenseCategories = _scoped(raw.listExpenseCategories);
export const listExpenses = _scoped(raw.listExpenses);

// Schedules
export const listStaffSchedules = _scoped(raw.listStaffSchedules);

// Marketing (with allBranches:true doc-field OR-merge inside Layer 1)
export const listPromotions = _scoped(raw.listPromotions);
export const listCoupons = _scoped(raw.listCoupons);
export const listVouchers = _scoped(raw.listVouchers);

// Financial
export const listOnlineSales = _scoped(raw.listOnlineSales);
export const listSaleInsuranceClaims = _scoped(raw.listSaleInsuranceClaims);
export const listVendorSales = _scoped(raw.listVendorSales);
export const listQuotations = _scoped(raw.listQuotations);

// Sellers / staff-by-branch
export const listAllSellers = _scoped(raw.listAllSellers);
export const listStaffByBranch = _scoped(raw.listStaffByBranch);

// Sales / appointments — positional + opts
export const getAllSales = _scoped(raw.getAllSales);
export const getAppointmentsByDate = _scopedPositional(raw.getAppointmentsByDate);
export const getAppointmentsByMonth = _scopedPositional(raw.getAppointmentsByMonth);

// Stock — branch-scoped (locationId == branchId at branch tier)
export const listStockBatches = _scoped(raw.listStockBatches);
export const listStockOrders = _scoped(raw.listStockOrders);
export const listStockMovements = _scoped(raw.listStockMovements);

// ─── Universal — re-export raw, NO branch logic ────────────────────────────

// Staff / doctors / customers / templates / branches / permissions
export const listStaff = raw.listStaff;
export const listDoctors = raw.listDoctors;
export const listBranches = raw.listBranches;
export const listPermissionGroups = raw.listPermissionGroups;
export const listDocumentTemplates = raw.listDocumentTemplates;

// Customer-attached subcollections
export const getCustomer = raw.getCustomer;
export const getAllCustomers = raw.getAllCustomers;
export const getCustomerWallets = raw.getCustomerWallets;
export const getWalletBalance = raw.getWalletBalance;
export const getWalletTransactions = raw.getWalletTransactions;
export const getCustomerMembership = raw.getCustomerMembership;
export const getAllMemberships = raw.getAllMemberships;
export const getCustomerMembershipDiscount = raw.getCustomerMembershipDiscount;
export const getCustomerBahtPerPoint = raw.getCustomerBahtPerPoint;
export const getPointBalance = raw.getPointBalance;
export const getPointTransactions = raw.getPointTransactions;
export const getCustomerTreatments = raw.getCustomerTreatments;
export const getCustomerSales = raw.getCustomerSales;
export const getCustomerAppointments = raw.getCustomerAppointments;
export const getCustomerDeposits = raw.getCustomerDeposits;
export const getActiveDeposits = raw.getActiveDeposits;
export const listMembershipTypes = raw.listMembershipTypes;
export const listWalletTypes = raw.listWalletTypes;
export const listCourseChanges = raw.listCourseChanges;

// ─── Universal listeners (live snapshot — re-exported raw) ─────────────────
// Layer 3 hook (useBranchAwareListener, Task 5) wraps these for branchId
// injection + re-subscribe on branch change. Customer-attached listeners
// have __universal__:true marker (Task 3) so the hook skips branch logic.
export const listenToCustomer = raw.listenToCustomer;
export const listenToCustomerTreatments = raw.listenToCustomerTreatments;
export const listenToCustomerAppointments = raw.listenToCustomerAppointments;
export const listenToCustomerSales = raw.listenToCustomerSales;
export const listenToCustomerFinance = raw.listenToCustomerFinance;
export const listenToCourseChanges = raw.listenToCourseChanges;
export const listenToAudiences = raw.listenToAudiences;
export const listenToUserPermissions = raw.listenToUserPermissions;

// ─── Branch-scoped listeners (raw — useBranchAwareListener injects branchId) ─
// useBranchAwareListener hook (Task 5) injects branchId and re-subscribes on
// branch switch. Re-export RAW here — listeners need re-subscribe lifecycle
// that a wrapper-at-call-time can't provide.
export const listenToAppointmentsByDate = raw.listenToAppointmentsByDate;
export const listenToAllSales = raw.listenToAllSales;
export const listenToHolidays = raw.listenToHolidays;
export const listenToScheduleByDay = raw.listenToScheduleByDay;

// Audiences (smart segments — global filter)
export const listAudiences = raw.listAudiences;
export const getAudience = raw.getAudience;
// Audience helpers
export const newAudienceId = raw.newAudienceId;

// Documents
export const getDocumentTemplate = raw.getDocumentTemplate;
export const listDocumentDrafts = raw.listDocumentDrafts;
export const listDocumentPrints = raw.listDocumentPrints;
export const getDocumentDraft = raw.getDocumentDraft;
export const getNextCertNumber = raw.getNextCertNumber;

// ─── Document infra (seeding / upgrade / drafts / print log) ───────────────
export const seedDocumentTemplatesIfEmpty = raw.seedDocumentTemplatesIfEmpty;
export const upgradeSystemDocumentTemplates = raw.upgradeSystemDocumentTemplates;
export const findResumableDraft = raw.findResumableDraft;
export const recordDocumentPrint = raw.recordDocumentPrint;

// Vendors (universal supplier directory)
export const listVendors = raw.listVendors;

// Stock — central tier (universal across central warehouses)
export const listCentralStockOrders = raw.listCentralStockOrders;
export const listCentralWarehouses = raw.listCentralWarehouses;
export const listStockLocations = raw.listStockLocations;
export const getCentralStockOrder = raw.getCentralStockOrder;

// ─── Stock — tier-scoped (caller passes locationId explicitly) ─────────────
// listStockTransfers/Withdrawals span TWO tiers (central WH ↔ branch); caller
// chooses which side to query via locationId. Auto-injecting branchId would
// silently filter out central-tier views.
export const listStockTransfers = raw.listStockTransfers;
export const listStockWithdrawals = raw.listStockWithdrawals;
export const getStockBatch = raw.getStockBatch;
export const getStockOrder = raw.getStockOrder;
export const getStockTransfer = raw.getStockTransfer;
export const getStockWithdrawal = raw.getStockWithdrawal;
export const getStockAdjustment = raw.getStockAdjustment;

// ─── Generic single-doc gets — caller has the id, no branch scope ──────────

export const getProduct = raw.getProduct;
export const getCourse = raw.getCourse;
export const getProductGroup = raw.getProductGroup;
export const getProductUnitGroup = raw.getProductUnitGroup;
export const getMedicalInstrument = raw.getMedicalInstrument;
export const getHoliday = raw.getHoliday;
export const getDfGroup = raw.getDfGroup;
export const getDfStaffRates = raw.getDfStaffRates;
export const getBankAccount = raw.getBankAccount;
export const getExpense = raw.getExpense;
export const getOnlineSale = raw.getOnlineSale;
export const getSaleInsuranceClaim = raw.getSaleInsuranceClaim;
export const getQuotation = raw.getQuotation;
export const getStaff = raw.getStaff;
export const getDoctor = raw.getDoctor;
export const getBranch = raw.getBranch;
export const getPermissionGroup = raw.getPermissionGroup;
export const getStaffSchedule = raw.getStaffSchedule;
export const getCoupon = raw.getCoupon;
export const getVoucher = raw.getVoucher;
export const getPromotion = raw.getPromotion;
export const getTreatment = raw.getTreatment;
export const getBackendSale = raw.getBackendSale;
export const getDeposit = raw.getDeposit;
export const getAllDeposits = raw.getAllDeposits;
export const getSaleByTreatmentId = raw.getSaleByTreatmentId;
export const getMasterDataMeta = raw.getMasterDataMeta;
export const getActiveSchedulesForDate = raw.getActiveSchedulesForDate;
export const getBeBackedMasterTypes = raw.getBeBackedMasterTypes;

// ─── Writes — re-export raw (Phase BS V2 stamping handled inside) ──────────

export const saveCustomer = raw.saveCustomer;
export const deleteCustomerDocOnly = raw.deleteCustomerDocOnly;
export const deleteCustomerCascade = raw.deleteCustomerCascade;
export const saveTreatment = raw.saveTreatment;
export const deleteBackendTreatment = raw.deleteBackendTreatment;
export const saveProduct = raw.saveProduct;
export const deleteProduct = raw.deleteProduct;
export const saveCourse = raw.saveCourse;
export const deleteCourse = raw.deleteCourse;
export const saveProductGroup = raw.saveProductGroup;
export const deleteProductGroup = raw.deleteProductGroup;
export const saveProductUnitGroup = raw.saveProductUnitGroup;
export const deleteProductUnitGroup = raw.deleteProductUnitGroup;
export const saveMedicalInstrument = raw.saveMedicalInstrument;
export const deleteMedicalInstrument = raw.deleteMedicalInstrument;
export const saveHoliday = raw.saveHoliday;
export const deleteHoliday = raw.deleteHoliday;
export const saveBranch = raw.saveBranch;
export const deleteBranch = raw.deleteBranch;
export const savePermissionGroup = raw.savePermissionGroup;
export const deletePermissionGroup = raw.deletePermissionGroup;
export const saveStaff = raw.saveStaff;
export const deleteStaff = raw.deleteStaff;
export const saveDoctor = raw.saveDoctor;
export const deleteDoctor = raw.deleteDoctor;
export const saveDfGroup = raw.saveDfGroup;
export const deleteDfGroup = raw.deleteDfGroup;
export const saveDfStaffRates = raw.saveDfStaffRates;
export const deleteDfStaffRates = raw.deleteDfStaffRates;
export const saveBankAccount = raw.saveBankAccount;
export const deleteBankAccount = raw.deleteBankAccount;
export const saveExpenseCategory = raw.saveExpenseCategory;
export const deleteExpenseCategory = raw.deleteExpenseCategory;
export const saveExpense = raw.saveExpense;
export const deleteExpense = raw.deleteExpense;
export const saveOnlineSale = raw.saveOnlineSale;
export const deleteOnlineSale = raw.deleteOnlineSale;
export const transitionOnlineSale = raw.transitionOnlineSale;
export const saveSaleInsuranceClaim = raw.saveSaleInsuranceClaim;
export const deleteSaleInsuranceClaim = raw.deleteSaleInsuranceClaim;
export const saveDocumentTemplate = raw.saveDocumentTemplate;
export const deleteDocumentTemplate = raw.deleteDocumentTemplate;
export const saveDocumentDraft = raw.saveDocumentDraft;
export const deleteDocumentDraft = raw.deleteDocumentDraft;
export const saveVendor = raw.saveVendor;
export const deleteVendor = raw.deleteVendor;
export const saveVendorSale = raw.saveVendorSale;
export const deleteVendorSale = raw.deleteVendorSale;
export const transitionVendorSale = raw.transitionVendorSale;
export const saveQuotation = raw.saveQuotation;
export const deleteQuotation = raw.deleteQuotation;
export const savePromotion = raw.savePromotion;
export const deletePromotion = raw.deletePromotion;
export const saveCoupon = raw.saveCoupon;
export const deleteCoupon = raw.deleteCoupon;
export const findCouponByCode = raw.findCouponByCode;
export const saveVoucher = raw.saveVoucher;
export const deleteVoucher = raw.deleteVoucher;
export const saveStaffSchedule = raw.saveStaffSchedule;
export const deleteStaffSchedule = raw.deleteStaffSchedule;
export const saveAudience = raw.saveAudience;
export const deleteAudience = raw.deleteAudience;
export const deleteCentralWarehouse = raw.deleteCentralWarehouse;
export const deleteBackendSale = raw.deleteBackendSale;
export const deleteBackendAppointment = raw.deleteBackendAppointment;
export const deleteDeposit = raw.deleteDeposit;
export const deleteMembership = raw.deleteMembership;
export const deleteMasterCourse = raw.deleteMasterCourse;
export const deleteMasterItem = raw.deleteMasterItem;

// ─── Customer write/read operations ────────────────────────────────────────
export const addCustomer = raw.addCustomer;
export const updateCustomer = raw.updateCustomer;
export const updateCustomerFromForm = raw.updateCustomerFromForm;
export const customerExists = raw.customerExists;
export const buildFormFromCustomer = raw.buildFormFromCustomer;

// ─── Sale operations ───────────────────────────────────────────────────────
export const createBackendSale = raw.createBackendSale;
export const updateBackendSale = raw.updateBackendSale;
export const cancelBackendSale = raw.cancelBackendSale;
export const updateSalePayment = raw.updateSalePayment;
export const markSalePaid = raw.markSalePaid;
export const assignCourseToCustomer = raw.assignCourseToCustomer;
export const applyDepositToSale = raw.applyDepositToSale;
export const convertQuotationToSale = raw.convertQuotationToSale;
export const analyzeSaleCancel = raw.analyzeSaleCancel;
export const applySaleCancelToCourses = raw.applySaleCancelToCourses;
export const setTreatmentLinkedSaleId = raw.setTreatmentLinkedSaleId;
export const transitionSaleInsuranceClaim = raw.transitionSaleInsuranceClaim;

// ─── Treatment operations ──────────────────────────────────────────────────
export const createBackendTreatment = raw.createBackendTreatment;
export const updateBackendTreatment = raw.updateBackendTreatment;
export const rebuildTreatmentSummary = raw.rebuildTreatmentSummary;

// ─── Course operations ─────────────────────────────────────────────────────
export const deductCourseItems = raw.deductCourseItems;
export const reverseCourseDeduction = raw.reverseCourseDeduction;
export const addCourseRemainingQty = raw.addCourseRemainingQty;
export const addPicksToResolvedGroup = raw.addPicksToResolvedGroup;
export const resolvePickedCourseInCustomer = raw.resolvePickedCourseInCustomer;
export const cancelCustomerCourse = raw.cancelCustomerCourse;
export const refundCustomerCourse = raw.refundCustomerCourse;
export const exchangeCourseProduct = raw.exchangeCourseProduct;

// ─── Stock operations (writers + analysis) ─────────────────────────────────
export const createStockOrder = raw.createStockOrder;
export const updateStockOrder = raw.updateStockOrder;
export const cancelStockOrder = raw.cancelStockOrder;
export const createStockAdjustment = raw.createStockAdjustment;
export const createStockTransfer = raw.createStockTransfer;
export const updateStockTransferStatus = raw.updateStockTransferStatus;
export const createStockWithdrawal = raw.createStockWithdrawal;
export const updateStockWithdrawalStatus = raw.updateStockWithdrawalStatus;
export const deductStockForSale = raw.deductStockForSale;
export const reverseStockForSale = raw.reverseStockForSale;
export const deductStockForTreatment = raw.deductStockForTreatment;
export const reverseStockForTreatment = raw.reverseStockForTreatment;
export const analyzeStockImpact = raw.analyzeStockImpact;
export const summarizeSkipReasons = raw.summarizeSkipReasons;

// ─── Central stock operations ──────────────────────────────────────────────
export const createCentralWarehouse = raw.createCentralWarehouse;
export const updateCentralWarehouse = raw.updateCentralWarehouse;
export const createCentralStockOrder = raw.createCentralStockOrder;
export const cancelCentralStockOrder = raw.cancelCentralStockOrder;
export const receiveCentralStockOrder = raw.receiveCentralStockOrder;

// ─── Appointment operations ────────────────────────────────────────────────
export const createBackendAppointment = raw.createBackendAppointment;
export const updateBackendAppointment = raw.updateBackendAppointment;

// ─── Deposit operations ────────────────────────────────────────────────────
export const createDeposit = raw.createDeposit;
export const updateDeposit = raw.updateDeposit;
export const cancelDeposit = raw.cancelDeposit;
export const refundDeposit = raw.refundDeposit;
export const reverseDepositUsage = raw.reverseDepositUsage;

// ─── Wallet / points operations ────────────────────────────────────────────
export const ensureCustomerWallet = raw.ensureCustomerWallet;
export const topUpWallet = raw.topUpWallet;
export const adjustWallet = raw.adjustWallet;
export const deductWallet = raw.deductWallet;
export const refundToWallet = raw.refundToWallet;
export const adjustPoints = raw.adjustPoints;
export const earnPoints = raw.earnPoints;
export const reversePointsEarned = raw.reversePointsEarned;

// ─── Membership operations ─────────────────────────────────────────────────
export const createMembership = raw.createMembership;
export const cancelMembership = raw.cancelMembership;
export const renewMembership = raw.renewMembership;

// ─── Master shape conversion ───────────────────────────────────────────────
export const beCourseToMasterShape = raw.beCourseToMasterShape;

// ─── Master data sync — DEV-ONLY (Rule H-bis: strip before production) ─────
// MasterDataTab is the sole sanctioned consumer of these helpers. Re-exported
// here so Task 6 mass migration doesn't fail to build; not for general use.
export const runMasterDataSync = raw.runMasterDataSync;
export const getAllMasterDataItems = raw.getAllMasterDataItems;
export const clearMasterDataItems = raw.clearMasterDataItems;
export const createMasterCourse = raw.createMasterCourse;
export const updateMasterCourse = raw.updateMasterCourse;
export const createMasterItem = raw.createMasterItem;
export const updateMasterItem = raw.updateMasterItem;
export const migrateMasterPromotionsToBe = raw.migrateMasterPromotionsToBe;
export const migrateMasterCouponsToBe = raw.migrateMasterCouponsToBe;
export const migrateMasterVouchersToBe = raw.migrateMasterVouchersToBe;
export const migrateMasterProductGroupsToBe = raw.migrateMasterProductGroupsToBe;
export const migrateMasterProductUnitsToBe = raw.migrateMasterProductUnitsToBe;
export const migrateMasterMedicalInstrumentsToBe = raw.migrateMasterMedicalInstrumentsToBe;
export const migrateMasterHolidaysToBe = raw.migrateMasterHolidaysToBe;
export const migrateMasterBranchesToBe = raw.migrateMasterBranchesToBe;
export const migrateMasterPermissionGroupsToBe = raw.migrateMasterPermissionGroupsToBe;
export const migrateMasterStaffToBe = raw.migrateMasterStaffToBe;
export const migrateMasterDoctorsToBe = raw.migrateMasterDoctorsToBe;
export const migrateMasterStaffSchedulesToBe = raw.migrateMasterStaffSchedulesToBe;
export const migrateMasterProductsToBe = raw.migrateMasterProductsToBe;
export const migrateMasterCoursesToBeV2 = raw.migrateMasterCoursesToBeV2;
export const migrateMasterDfGroupsToBe = raw.migrateMasterDfGroupsToBe;
export const migrateMasterDfStaffRatesToBe = raw.migrateMasterDfStaffRatesToBe;
export const migrateMasterWalletTypesToBe = raw.migrateMasterWalletTypesToBe;
export const migrateMasterMembershipTypesToBe = raw.migrateMasterMembershipTypesToBe;
export const migrateMasterMedicineLabelsToBe = raw.migrateMasterMedicineLabelsToBe;

// ─── Treatment context-specific helper (be_product_groups for TFP modal) ───
export const listProductGroupsForTreatment = raw.listProductGroupsForTreatment;

// ─── Admin reconciler ──────────────────────────────────────────────────────
export const reconcileAllCustomerSummaries = raw.reconcileAllCustomerSummaries;
