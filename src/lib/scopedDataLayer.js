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

// Audiences (smart segments — global filter)
export const listAudiences = raw.listAudiences;
export const getAudience = raw.getAudience;

// Documents
export const getDocumentTemplate = raw.getDocumentTemplate;
export const listDocumentDrafts = raw.listDocumentDrafts;
export const listDocumentPrints = raw.listDocumentPrints;
export const getDocumentDraft = raw.getDocumentDraft;
export const getNextCertNumber = raw.getNextCertNumber;

// Vendors (universal supplier directory)
export const listVendors = raw.listVendors;

// Stock — central tier (universal across central warehouses)
export const listCentralStockOrders = raw.listCentralStockOrders;
export const listCentralWarehouses = raw.listCentralWarehouses;
export const listStockLocations = raw.listStockLocations;
export const getCentralStockOrder = raw.getCentralStockOrder;

// Stock — tier-scoped (caller passes locationId explicitly)
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
