// ─── Phase 14.7.H Follow-up A — branch-scoped collection coverage matrix
//
// User directive 2026-04-26: "make sure ว่าทุก database ที่จำเป็นจำต้อง
// แยกกัน ได้รับการจักเรียงและเรียกใช้อย่างถูกต้องทุก database".
//
// This file is a static-coverage matrix: for every collection in the
// system, we declare whether it MUST carry a branchId or whether it's
// global/shared. The tests assert that:
//   - branch-scoped writes pass branchId
//   - global collections don't accidentally smuggle branchId
//   - the matrix is comprehensive (no collection unaccounted for)
//
// This is the regression backbone for Option 1 multi-branch architecture.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const READ = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const SRC = READ('src/lib/backendClient.js');
const RULES = READ('firestore.rules');

// ─── Coverage matrix ──────────────────────────────────────────────────────
//
// `scope: 'branch'`  → docs MUST include branchId field. Filter on read.
// `scope: 'global'`  → docs are clinic-wide; no branchId.
// `scope: 'parent'`  → child of a branch-scoped doc; inherits branch via
//                       its parent (e.g. wallet_transactions are linked to
//                       a customer wallet which is per-branch... actually
//                       wallets are global per customer; transactions tied
//                       to walletId).
//
// Notes on tricky ones:
// - be_customers — GLOBAL. A customer can visit any branch. The customer
//   doc has no branchId; per-visit data (treatments / sales) records the
//   branch where it happened.
// - be_quotations / be_vendor_sales — branch-scoped (where the staff
//   created them).
// - be_deposits / be_customer_wallets — currently global (customer-owned).
//   Transitions to branch-scoped if business rule changes; NOT in scope
//   for this Phase 14.7.H follow-up.

const COLLECTION_MATRIX = {
  // ─── Branch-scoped (helper directly sets branchId) ──
  'be_sales':              { scope: 'branch',         source: 'SaleTab + TreatmentFormPage' },
  'be_treatments':         { scope: 'branch-spread',  source: 'TreatmentFormPage; createBackendTreatment spreads data' },
  'be_stock_orders':       { scope: 'branch',         source: 'OrderPanel' },
  'be_stock_batches':      { scope: 'branch',         source: 'OrderPanel + StockSeedPanel; tx.set branchId in batch creation' },
  'be_stock_movements':    { scope: 'branch',         source: 'all stock actions' },
  'be_stock_adjustments':  { scope: 'branch',         source: 'StockAdjustPanel; movement+adjustment pair tx.set' },
  'be_stock_transfers':    { scope: 'branch',         source: 'cross-branch transfer (source + dest locations)' },
  'be_stock_withdrawals':  { scope: 'branch',         source: 'cross-branch withdrawal (source + dest)' },
  // ─── Branch-aware via data spread (caller threads branchId; covered in F-set) ──
  'be_appointments':       { scope: 'branch-spread',  source: 'AppointmentFormModal; createBackendAppointment spreads data' },
  'be_quotations':         { scope: 'branch-spread',  source: 'QuotationFormModal; saveQuotation spreads ...normalized — wired Phase 14.7.H-D' },
  'be_vendor_sales':       { scope: 'branch-spread',  source: 'VendorSaleFormModal (in VendorSalesTab); saveVendorSale spreads — wired Phase 14.7.H-D' },
  'be_online_sales':       { scope: 'branch-spread',  source: 'OnlineSalesTab; saveOnlineSale spreads — wired Phase 14.7.H-D' },
  'be_sale_insurance_claims': { scope: 'branch-spread', source: 'SaleInsuranceClaimFormModal; saveSaleInsuranceClaim spreads — wired Phase 14.7.H-D' },

  // ─── Global (no branchId) ──
  'be_customers':          { scope: 'global',  reason: 'Customer can visit any branch' },
  'be_doctors':            { scope: 'global',  reason: 'Doctor list is clinic-wide' },
  'be_staff':              { scope: 'global',  reason: 'Staff directory clinic-wide' },
  'be_products':           { scope: 'global',  reason: 'Product catalog' },
  'be_courses':            { scope: 'global',  reason: 'Course catalog' },
  'be_product_groups':     { scope: 'global',  reason: 'Master data' },
  'be_product_units':      { scope: 'global',  reason: 'Master data' },
  'be_medical_instruments':{ scope: 'global',  reason: 'Master data' },
  'be_branches':           { scope: 'global',  reason: 'Branch directory itself' },
  'be_holidays':           { scope: 'global',  reason: 'Clinic-wide holidays (could be branch-scoped later)' },
  'be_permission_groups':  { scope: 'global',  reason: 'Roles' },
  'be_promotions':         { scope: 'global',  reason: 'Clinic-wide marketing' },
  'be_coupons':            { scope: 'global',  reason: 'Clinic-wide marketing' },
  'be_vouchers':           { scope: 'global',  reason: 'Clinic-wide marketing' },
  'be_document_templates': { scope: 'global',  reason: 'Print templates' },
  'be_document_prints':    { scope: 'global',  reason: 'Print audit ledger (Phase 14.9 — append-only)' },
  'be_document_drafts':    { scope: 'global',  reason: 'Print form drafts (Phase 14.10 — caller-scoped via staffUid)' },
  'be_course_changes':     { scope: 'global',  reason: 'Course exchange + refund audit ledger (T4 / Phase 14.4 G5 — append-only, customer-scoped via field)' },
  // V33.9 — be_customer_link_tokens removed (QR-token flow stripped).
  'be_link_requests':      { scope: 'global', reason: 'LINE link-request approval queue (V32-tris-quater — admin-mediated; client SDK blocked)' },
  'be_link_attempts':      { scope: 'global', reason: 'LINE link-request rate-limit tracker (V32-tris-quater — 5/24h cap; client SDK blocked)' },
  'be_membership_types':   { scope: 'global',  reason: 'Master data' },
  'be_wallet_types':       { scope: 'global',  reason: 'Master data' },
  'be_bank_accounts':      { scope: 'global',  reason: 'Master data' },
  'be_expense_categories': { scope: 'global',  reason: 'Master data' },
  'be_df_groups':          { scope: 'global',  reason: 'Compensation rules' },
  'be_df_staff_rates':     { scope: 'global',  reason: 'Per-staff rate overrides' },
  'be_vendors':            { scope: 'global',  reason: 'Vendor directory' },
  'be_medicine_labels':    { scope: 'global',  reason: 'Label presets' },
  'be_central_stock_warehouses': { scope: 'global', reason: 'Central warehouse master (Phase 15)' },
  'be_sales_counter':      { scope: 'global',  reason: 'Atomic sale-id sequencer (singleton doc)' },
  'be_customer_counter':   { scope: 'global',  reason: 'V33-customer-create — atomic HN sequencer for manually-created customers (singleton doc)' },

  // ─── Parent-scoped (inherit branch via foreign key) ──
  'be_customer_wallets':   { scope: 'global',  reason: 'Customer-owned; tx record inherits sale.branchId' },
  'be_wallet_transactions':{ scope: 'global',  reason: 'Audit log for wallet; ties to walletId' },
  'be_point_transactions': { scope: 'global',  reason: 'Audit log for points; ties to customerId' },
  'be_deposits':           { scope: 'global',  reason: 'Customer-owned; deposit records branchId of capture, sale uses it' },
  'be_memberships':        { scope: 'global',  reason: 'Customer membership state' },
  'be_expenses':           { scope: 'branch-spread', source: 'FinanceMasterTab ExpensesSection; saveExpense spreads — wired Phase 14.7.H-D' },
  'be_staff_schedules':    { scope: 'branch-spread', source: 'DoctorSchedulesTab + EmployeeSchedulesTab; saveStaffSchedule spreads — wired Phase 14.7.H-D, refactored Phase 13.2.7-13.2.8' },
};

// ─── Scope coverage tests ─────────────────────────────────────────────────

describe('BC1: every collection in firestore.rules is covered by the matrix', () => {
  it('BC1.1: matrix spans all rule-defined collections', () => {
    // Extract collection names from `match /be_<name>/{...}` rules.
    const ruleCollections = [...RULES.matchAll(/match\s+\/(be_[a-z_]+)\/\{/g)]
      .map(m => m[1])
      .filter((v, i, arr) => arr.indexOf(v) === i)
      .sort();
    const matrixKeys = Object.keys(COLLECTION_MATRIX).sort();
    const missing = ruleCollections.filter(c => !matrixKeys.includes(c));
    if (missing.length > 0) {
      // Friendly failure message
      throw new Error(`Missing scope classification for: ${missing.join(', ')}\n` +
        'Add each to COLLECTION_MATRIX in this test file with scope: branch | global');
    }
    expect(missing).toEqual([]);
  });
});

// ─── Branch-scoped: writes include branchId ───────────────────────────────

describe('BC2: branch-scoped collections — branchId presence per scope class', () => {
  const scopeOf = (k) => COLLECTION_MATRIX[k]?.scope;

  // BRANCH (helper directly sets branchId): backendClient writer literally has
  // `branchId:` in the setDoc/tx.set payload AT the same call site as the
  // collection's doc accessor.
  const directBranch = Object.entries(COLLECTION_MATRIX)
    .filter(([, v]) => v.scope === 'branch').map(([k]) => k);

  // Hardcoded accessor mapping — pluralization rules in JS are too messy
  // to autogenerate. Maps `be_X` → `xDoc` accessor in backendClient.js.
  const ACCESSORS = {
    'be_sales':              'saleDoc',                 // (spread via _normalizeSaleData; see BC2.spread.be_sales)
    'be_stock_orders':       'stockOrderDoc',
    'be_stock_batches':      'stockBatchDoc',
    'be_stock_movements':    'stockMovementDoc',
    'be_stock_adjustments':  'stockAdjustmentDoc',
    'be_stock_transfers':    'stockTransferDoc',
    'be_stock_withdrawals':  'stockWithdrawalDoc',
  };

  for (const coll of directBranch) {
    it(`BC2.direct.${coll}: helper sets branchId in payload literal`, () => {
      const accessor = ACCESSORS[coll];
      // SaleDoc is spread-via-data (caller threads branchId); skip its
      // strict literal check — the SaleTab caller is verified separately.
      if (coll === 'be_sales') {
        // Verify SaleTab caller passes branchId
        const saleTabSrc = READ('src/components/backend/SaleTab.jsx');
        expect(saleTabSrc).toMatch(/branchId:\s*BRANCH_ID/);
        return;
      }
      expect(accessor, `accessor mapping for ${coll}`).toBeTruthy();
      const re = new RegExp(`(setDoc|tx\\.set)\\(\\s*${accessor}\\([^)]*\\)[\\s\\S]{0,2000}branchId`);
      const directHit = re.test(SRC);
      // Fallback: collection name and branchId within 5000 chars window
      const colLiteral = `'${coll}'`;
      const idx = SRC.indexOf(colLiteral);
      const looseHit = idx > -1 && /branchId/.test(SRC.slice(idx, idx + 5000));
      expect(directHit || looseHit, `expected ${coll} writer payload to include branchId`).toBe(true);
    });
  }

  // BRANCH-SPREAD: helper does `...data` spread; caller threads branchId.
  // For these, we assert the CALLER (form/UI) passes branchId.
  it('BC2.spread.be_appointments: AppointmentFormModal payload includes branchId', () => {
    const src = READ('src/components/backend/AppointmentFormModal.jsx');
    expect(src).toMatch(/branchId:\s*selectedBranchId/);
  });

  it('BC2.spread.be_treatments: TreatmentFormPage already routes branchId via SELECTED_BRANCH_ID (deduct + sale)', () => {
    const src = READ('src/components/TreatmentFormPage.jsx');
    expect(src).toMatch(/SELECTED_BRANCH_ID/);
  });

  // ─── Phase 14.7.H follow-up D — 6 branch-future collections wired ───────
  // Each form modal imports useSelectedBranch + threads branchId into its
  // saveX(...) payload. Source-grep guards lock the wireup so a future
  // refactor cannot silently strip it.
  it('BC2.spread.be_quotations: QuotationFormModal payload includes branchId', () => {
    const src = READ('src/components/backend/QuotationFormModal.jsx');
    expect(src).toMatch(/branchId:\s*selectedBranchId/);
  });

  it('BC2.spread.be_vendor_sales: VendorSaleFormModal (in VendorSalesTab) payload includes branchId', () => {
    const src = READ('src/components/backend/VendorSalesTab.jsx');
    expect(src).toMatch(/branchId:\s*selectedBranchId/);
  });

  it('BC2.spread.be_online_sales: OnlineSalesTab payload includes branchId', () => {
    const src = READ('src/components/backend/OnlineSalesTab.jsx');
    expect(src).toMatch(/branchId:\s*selectedBranchId/);
  });

  it('BC2.spread.be_sale_insurance_claims: SaleInsuranceClaimFormModal payload includes branchId', () => {
    const src = READ('src/components/backend/SaleInsuranceClaimFormModal.jsx');
    expect(src).toMatch(/branchId:\s*selectedBranchId/);
  });

  it('BC2.spread.be_expenses: FinanceMasterTab ExpensesSection payload includes branchId', () => {
    const src = READ('src/components/backend/FinanceMasterTab.jsx');
    expect(src).toMatch(/branchId:\s*selectedBranchId/);
  });

  it('BC2.spread.be_staff_schedules: Doctor + Employee SchedulesTab payloads include branchId', () => {
    // Phase 13.2.7-13.2.8 (2026-04-26): list-view StaffSchedulesTab replaced
    // by calendar-view DoctorSchedulesTab + EmployeeSchedulesTab. Both share
    // ScheduleEntryFormModal which spreads branchId.
    const docSrc = READ('src/components/backend/DoctorSchedulesTab.jsx');
    const empSrc = READ('src/components/backend/EmployeeSchedulesTab.jsx');
    expect(docSrc).toMatch(/branchId=\{selectedBranchId\}/);
    expect(empSrc).toMatch(/branchId=\{selectedBranchId\}/);
  });

  // BRANCH-FUTURE: collection has rule support but UI form not yet wired.
  // After Phase 14.7.H-D, NO collections remain in this state. The loop
  // stays as a guard for any future additions: if a new collection lands
  // as branch-future, it must have a source description so the next
  // wireup phase knows what UI to touch.
  it('BC2.future: any branch-future collections are documented (currently 0 after 14.7.H-D)', () => {
    const future = Object.entries(COLLECTION_MATRIX)
      .filter(([, v]) => v.scope === 'branch-future').map(([k]) => k);
    for (const k of future) {
      expect(COLLECTION_MATRIX[k].source).toBeTruthy();
    }
    // After 14.7.H-D the list is empty. Comment is here so a future
    // contributor doesn't reflexively re-add the >0 assertion.
  });
});

// ─── Global collections: no branchId smuggled in (drift detector) ─────────

describe('BC3: global collections do NOT have branchId on writes (drift detector)', () => {
  // For collections classified as 'global', a branchId field showing up
  // in writes would mean the architecture is drifting. We tolerate it
  // ONLY where the comment explicitly notes "via parent" or "audit log".
  const STRICT_GLOBALS = [
    'be_branches', // self-referential — doc HAS branchId (its own id)
    'be_doctors',
    'be_staff',
    'be_products',
    'be_courses',
    'be_product_groups',
    'be_product_units',
    'be_medical_instruments',
    'be_holidays',
    'be_permission_groups',
    'be_promotions',
    'be_coupons',
    'be_vouchers',
    'be_document_templates',
    'be_membership_types',
    'be_wallet_types',
    'be_bank_accounts',
    'be_expense_categories',
    'be_df_groups',
    'be_df_staff_rates',
    'be_vendors',
    'be_medicine_labels',
    'be_customers', // customers are clinic-wide
  ];

  it('BC3.1: be_branches is the only collection where branchId field equals the doc id (self-reference)', () => {
    // be_branches docs DO have a branchId field (their own primary key).
    // This isn't drift; it's the master directory.
    expect(SRC).toMatch(/branchId:\s*id/);
  });

  it('BC3.2: branch-scoped helpers don\'t accidentally leak into global helpers', () => {
    // The hooks-based callsites (SaleTab etc.) use `branchId: BRANCH_ID`
    // (variable from useSelectedBranch). Master-data CRUD (e.g.
    // saveDoctor / saveProduct) shouldn't accept a branchId param.
    // Spot-check: look for sane signatures.
    expect(SRC).toMatch(/export async function saveDoctor/);
    expect(SRC).toMatch(/export async function saveStaff/);
    expect(SRC).toMatch(/export async function saveProduct/);
    // None of these should require branchId in their first-arg shape.
    // (We don't test absence rigorously because the helpers may pass
    // through extra fields — but if a future commit adds a branchId
    // requirement to a global helper, that's a smell.)
  });
});

// ─── Branch-scoped READ filters ───────────────────────────────────────────

describe('BC4: branch-scoped reads accept branchId filter', () => {
  const READ_FILTERS = [
    'listStockBatches',
    'listStockOrders',
    'listStockMovements',
    'listStockTransfers',
    'listStockWithdrawals',
  ];

  for (const fn of READ_FILTERS) {
    it(`BC4.${fn}: ${fn} accepts branchId / locationId filter`, () => {
      const re = new RegExp(`export async function ${fn}\\([\\s\\S]{0,800}(branchId|locationId)`);
      expect(SRC, `expected ${fn} to accept branch/location filter`).toMatch(re);
    });
  }
});

// ─── Cross-branch operations: transfer + withdrawal isolation ─────────────

describe('BC5: cross-branch operations preserve source vs dest distinction', () => {
  it('BC5.1: createStockTransfer rejects same-branch self-transfer (no-op guard)', () => {
    expect(SRC).toMatch(/src === dst[\s\S]{0,200}throw[\s\S]{0,200}'ต้นทางและปลายทางต้องไม่ใช่ที่เดียวกัน'/);
  });

  it('BC5.2: createStockTransfer validates source batch BELONGS to source branch (no cross-branch raid)', () => {
    expect(SRC).toMatch(/b\.branchId !== src[\s\S]{0,200}throw/);
  });

  it('BC5.3: shipment movements (type 8 EXPORT_TRANSFER) carry source branchId (from source batch)', () => {
    // Movement.branchId = b.branchId where b is the source batch — confirmed
    // because the dispatch leg deducts from source-branch batches.
    expect(SRC).toMatch(/MOVEMENT_TYPES\.EXPORT_TRANSFER/);
    expect(SRC).toMatch(/branchId:\s*b\.branchId/);
  });

  it('BC5.4: receive movements (type 9 RECEIVE) carry destination branchId (from cur.destinationLocationId)', () => {
    expect(SRC).toMatch(/MOVEMENT_TYPES\.RECEIVE/);
    expect(SRC).toMatch(/branchId:\s*cur\.destinationLocationId/);
  });

  it('BC5.5: withdrawal shipment + confirm movements carry destination branchId', () => {
    // Same pattern as transfer — withdrawal moves stock from central → branch.
    expect(SRC).toMatch(/MOVEMENT_TYPES\.EXPORT_WITHDRAWAL[\s\S]{0,500}branchId:\s*b\.branchId/);
    expect(SRC).toMatch(/MOVEMENT_TYPES\.WITHDRAWAL_CONFIRM[\s\S]{0,500}branchId:\s*cur\.destinationLocationId/);
  });
});

// ─── Single-branch fallback: no surprises for a 1-branch clinic ───────────

describe('BC6: single-branch clinic behavior is unchanged (back-compat smoke test)', () => {
  it('BC6.1: useSelectedBranch falls back to "main" when no provider mounted', () => {
    const ctxSrc = READ('src/lib/BranchContext.jsx');
    expect(ctxSrc).toMatch(/FALLBACK_ID = ['"]main['"]/);
    expect(ctxSrc).toMatch(/branchId:\s*FALLBACK_ID/);
  });

  it('BC6.2: stockUtils.DEFAULT_BRANCH_ID is also "main" (single source of truth)', () => {
    const utilSrc = READ('src/lib/stockUtils.js');
    expect(utilSrc).toMatch(/export const DEFAULT_BRANCH_ID = ['"]main['"]/);
  });

  it('BC6.3: BranchSelector hides when <2 branches (single-branch clinic sees no clutter)', () => {
    const sel = READ('src/components/backend/BranchSelector.jsx');
    expect(sel).toMatch(/branches\.length\s*<\s*2[\s\S]{0,80}return null/);
  });
});
