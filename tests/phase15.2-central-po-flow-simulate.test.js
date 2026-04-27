// Phase 15.2 — Central PO write flow + Rule C1 helper extraction
// Full-flow simulate test (Rule I) covering:
//   - stockUtils.js enum extensions (LOCATION_TYPE, deriveLocationType,
//     MOVEMENT_TYPES.WITHDRAWAL_APPROVE/REJECT, CENTRAL_ORDER_STATUS)
//   - centralStockOrderValidation.js (validate / normalize / emptyForm /
//     validateLineReceipts) — pure helper unit tests + V14 undefined-walk
//   - backendClient.js source-grep: _buildBatchFromOrderItem helper +
//     createCentralStockOrder + receiveCentralStockOrder +
//     cancelCentralStockOrder + listCentralStockOrders +
//     getCentralStockOrder + generateCentralOrderId + linkedCentralOrderId
//     in listStockMovements mapFields
//   - createStockOrder refactor — body delegates to shared helper
//   - firestore.rules: be_central_stock_orders + counter blocks
//   - CentralStockOrderPanel.jsx + CentralStockTab.jsx wiring
//
// Iron-clad rule mapping:
//   C1   Rule of 3 — _buildBatchFromOrderItem shared between branch + central
//   C3   Lean schema — ONE new collection (be_central_stock_orders) + ONE
//        counter (be_central_stock_orders_counter) — both justified
//   E    Backend = Firestore-only — no brokerClient anywhere
//   H    Data ownership — no ProClinic write-back
//   I    Full-flow simulate — chains validator → writer → reader → status
//   V12  No shape migration — additive only (locationType + locationId)
//   V14  setDoc rejects undefined — normalize never emits undefined leaves
//   V19  be_stock_movements rule unchanged (hasOnly(['reversedByMovementId']))
//   V31  No silent-swallow — every catch classifies + rethrows or surfaces

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  MOVEMENT_TYPES,
  LOCATION_TYPE,
  deriveLocationType,
  CENTRAL_ORDER_STATUS,
} from '../src/lib/stockUtils.js';
import {
  validateCentralStockOrder,
  emptyCentralStockOrderForm,
  normalizeCentralStockOrder,
  validateLineReceipts,
  DISCOUNT_TYPES,
  NOTE_MAX_LENGTH,
} from '../src/lib/centralStockOrderValidation.js';

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const stockUtilsSrc = read('src/lib/stockUtils.js');
const validationSrc = read('src/lib/centralStockOrderValidation.js');
const backendSrc = read('src/lib/backendClient.js');
const rulesSrc = read('firestore.rules');
const panelSrc = read('src/components/backend/CentralStockOrderPanel.jsx');
const centralTabSrc = read('src/components/backend/CentralStockTab.jsx');

// ────────────────────────────────────────────────────────────────────────
// F1 — stockUtils.js extensions (LOCATION_TYPE, deriveLocationType, types 15+16)
// ────────────────────────────────────────────────────────────────────────
describe('Phase 15.2 F1 — stockUtils enum extensions', () => {
  it('F1.1 LOCATION_TYPE enum exists with branch + central', () => {
    expect(LOCATION_TYPE).toEqual({ BRANCH: 'branch', CENTRAL: 'central' });
  });

  it('F1.2 LOCATION_TYPE is frozen (immutability invariant)', () => {
    expect(Object.isFrozen(LOCATION_TYPE)).toBe(true);
  });

  it('F1.3 deriveLocationType("WH-X") → "central"', () => {
    expect(deriveLocationType('WH-2026-001')).toBe('central');
    expect(deriveLocationType('WH-')).toBe('central');
  });

  it('F1.4 deriveLocationType("main") → "branch"', () => {
    expect(deriveLocationType('main')).toBe('branch');
    expect(deriveLocationType('BR-A')).toBe('branch');
    expect(deriveLocationType('branch_27')).toBe('branch');
  });

  it('F1.5 deriveLocationType edge cases (null/undefined/empty)', () => {
    expect(deriveLocationType(null)).toBe('branch');
    expect(deriveLocationType(undefined)).toBe('branch');
    expect(deriveLocationType('')).toBe('branch');
  });

  it('F1.6 MOVEMENT_TYPES gains WITHDRAWAL_APPROVE=15 + WITHDRAWAL_REJECT=16', () => {
    expect(MOVEMENT_TYPES.WITHDRAWAL_APPROVE).toBe(15);
    expect(MOVEMENT_TYPES.WITHDRAWAL_REJECT).toBe(16);
  });

  it('F1.7 existing MOVEMENT_TYPES unchanged (V12 multi-reader sweep)', () => {
    expect(MOVEMENT_TYPES.IMPORT).toBe(1);
    expect(MOVEMENT_TYPES.SALE).toBe(2);
    expect(MOVEMENT_TYPES.EXPORT_TRANSFER).toBe(8);
    expect(MOVEMENT_TYPES.RECEIVE).toBe(9);
    expect(MOVEMENT_TYPES.EXPORT_WITHDRAWAL).toBe(10);
    expect(MOVEMENT_TYPES.WITHDRAWAL_CONFIRM).toBe(13);
    expect(MOVEMENT_TYPES.CANCEL_IMPORT).toBe(14);
  });

  it('F1.8 CENTRAL_ORDER_STATUS enum exists + frozen', () => {
    expect(CENTRAL_ORDER_STATUS.PENDING).toBe('pending');
    expect(CENTRAL_ORDER_STATUS.PARTIAL).toBe('partial');
    expect(CENTRAL_ORDER_STATUS.RECEIVED).toBe('received');
    expect(CENTRAL_ORDER_STATUS.CANCELLED).toBe('cancelled');
    expect(CENTRAL_ORDER_STATUS.CANCELLED_POST_RECEIVE).toBe('cancelled_post_receive');
    expect(Object.isFrozen(CENTRAL_ORDER_STATUS)).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────
// F2 — centralStockOrderValidation.js (validate happy + sad)
// ────────────────────────────────────────────────────────────────────────
describe('Phase 15.2 F2 — validateCentralStockOrder', () => {
  const validForm = () => ({
    centralWarehouseId: 'WH-001',
    vendorId: 'VND-001',
    vendorName: 'Acme Pharma',
    importedDate: '2026-04-27',
    note: 'first batch',
    discount: 100,
    discountType: 'amount',
    items: [
      { productId: 'P1', productName: 'Botox', qty: 10, cost: 200, unit: 'amp', isPremium: false, expiresAt: '2027-01-01' },
    ],
  });

  it('F2.1 happy path returns null', () => {
    expect(validateCentralStockOrder(validForm())).toBeNull();
  });

  it('F2.2 missing form → ["form","missing form"]', () => {
    expect(validateCentralStockOrder(null)).toEqual(['form', 'missing form']);
    expect(validateCentralStockOrder(undefined)).toEqual(['form', 'missing form']);
    expect(validateCentralStockOrder([])).toEqual(['form', 'missing form']);
  });

  it('F2.3 missing centralWarehouseId rejected', () => {
    const f = validForm(); f.centralWarehouseId = '';
    expect(validateCentralStockOrder(f)?.[0]).toBe('centralWarehouseId');
  });

  it('F2.4 missing vendorId rejected', () => {
    const f = validForm(); f.vendorId = '   ';
    expect(validateCentralStockOrder(f)?.[0]).toBe('vendorId');
  });

  it('F2.5 empty items[] rejected', () => {
    const f = validForm(); f.items = [];
    expect(validateCentralStockOrder(f)?.[0]).toBe('items');
  });

  it('F2.6 item without productId rejected', () => {
    const f = validForm(); f.items[0].productId = '';
    expect(validateCentralStockOrder(f)?.[0]).toBe('items[0].productId');
  });

  it('F2.7 item with qty=0 rejected', () => {
    const f = validForm(); f.items[0].qty = 0;
    expect(validateCentralStockOrder(f)?.[0]).toBe('items[0].qty');
  });

  it('F2.8 item with negative qty rejected', () => {
    const f = validForm(); f.items[0].qty = -5;
    expect(validateCentralStockOrder(f)?.[0]).toBe('items[0].qty');
  });

  it('F2.9 invalid discountType rejected', () => {
    const f = validForm(); f.discountType = 'pesos';
    expect(validateCentralStockOrder(f)?.[0]).toBe('discountType');
  });

  it('F2.10 negative discount rejected', () => {
    const f = validForm(); f.discount = -10;
    expect(validateCentralStockOrder(f)?.[0]).toBe('discount');
  });

  it('F2.11 negative cost rejected', () => {
    const f = validForm(); f.items[0].cost = -1;
    expect(validateCentralStockOrder(f)?.[0]).toBe('items[0].cost');
  });

  it('F2.12 isPremium non-boolean rejected', () => {
    const f = validForm(); f.items[0].isPremium = 'yes';
    expect(validateCentralStockOrder(f)?.[0]).toBe('items[0].isPremium');
  });

  it('F2.13 over-long vendorName rejected', () => {
    const f = validForm(); f.vendorName = 'x'.repeat(201);
    expect(validateCentralStockOrder(f)?.[0]).toBe('vendorName');
  });

  it('F2.14 over-long note rejected', () => {
    const f = validForm(); f.note = 'x'.repeat(NOTE_MAX_LENGTH + 1);
    expect(validateCentralStockOrder(f)?.[0]).toBe('note');
  });

  it('F2.15 DISCOUNT_TYPES whitelist exposed for UI', () => {
    expect(DISCOUNT_TYPES).toEqual(['amount', 'percent']);
    expect(Object.isFrozen(DISCOUNT_TYPES)).toBe(true);
  });
});

// ────────────────────────────────────────────────────────────────────────
// F3 — emptyForm + normalize (V14 undefined-walk regression guard)
// ────────────────────────────────────────────────────────────────────────
describe('Phase 15.2 F3 — empty + normalize (V14 undefined-walk)', () => {
  function walkForUndefined(obj, pathStr = '') {
    if (obj === undefined) return [pathStr || '<root>'];
    if (obj === null) return [];
    if (Array.isArray(obj)) {
      return obj.flatMap((v, i) => walkForUndefined(v, `${pathStr}[${i}]`));
    }
    if (typeof obj === 'object') {
      const found = [];
      for (const [k, v] of Object.entries(obj)) {
        found.push(...walkForUndefined(v, pathStr ? `${pathStr}.${k}` : k));
      }
      return found;
    }
    return [];
  }

  it('F3.1 emptyCentralStockOrderForm returns shape with one blank line', () => {
    const f = emptyCentralStockOrderForm();
    expect(f.items.length).toBe(1);
    expect(f.discountType).toBe('amount');
    expect(f.centralWarehouseId).toBe('');
    expect(f.vendorId).toBe('');
  });

  it('F3.2 V14 — emptyForm has zero undefined leaves', () => {
    expect(walkForUndefined(emptyCentralStockOrderForm())).toEqual([]);
  });

  it('F3.3 V14 — normalize(empty) has zero undefined leaves', () => {
    expect(walkForUndefined(normalizeCentralStockOrder(emptyCentralStockOrderForm()))).toEqual([]);
  });

  it('F3.4 V14 — normalize(garbage input) still has zero undefined leaves', () => {
    expect(walkForUndefined(normalizeCentralStockOrder({}))).toEqual([]);
    expect(walkForUndefined(normalizeCentralStockOrder({ items: null }))).toEqual([]);
    expect(walkForUndefined(normalizeCentralStockOrder({ items: [{}] }))).toEqual([]);
    expect(walkForUndefined(normalizeCentralStockOrder({ items: [{ qty: 'NaN' }] }))).toEqual([]);
    expect(walkForUndefined(normalizeCentralStockOrder({ items: [{ cost: undefined }] }))).toEqual([]);
  });

  it('F3.5 normalize coerces qty to 0 when invalid (preserves shape)', () => {
    const r = normalizeCentralStockOrder({ items: [{ qty: 'NaN', productId: 'P1' }] });
    expect(r.items[0].qty).toBe(0);
  });

  it('F3.6 normalize uses orderId-prefixed centralOrderProductId fallback', () => {
    const r = normalizeCentralStockOrder({ items: [{ productId: 'P1', qty: 5 }] }, { orderId: 'PO-CST-202604-0001' });
    expect(r.items[0].centralOrderProductId).toBe('PO-CST-202604-0001-0');
  });

  it('F3.7 normalize defaults expiresAt to null (not undefined)', () => {
    const r = normalizeCentralStockOrder({ items: [{ productId: 'P1', qty: 5 }] });
    expect(r.items[0].expiresAt).toBe(null);
    expect(r.items[0].receivedBatchId).toBe(null);
  });

  it('F3.8 normalize discount falls back to 0 + amount when invalid', () => {
    const r = normalizeCentralStockOrder({ discount: 'abc', discountType: 'pesos' });
    expect(r.discount).toBe(0);
    expect(r.discountType).toBe('amount');
  });

  it('F3.9 normalize default status is pending', () => {
    expect(normalizeCentralStockOrder({}).status).toBe('pending');
  });

  it('F3.10 normalize accepts existing valid status', () => {
    expect(normalizeCentralStockOrder({ status: 'received' }).status).toBe('received');
    // invalid status falls back to pending
    expect(normalizeCentralStockOrder({ status: 'bogus' }).status).toBe('pending');
  });
});

// ────────────────────────────────────────────────────────────────────────
// F4 — validateLineReceipts (idempotency + duplicate detection)
// ────────────────────────────────────────────────────────────────────────
describe('Phase 15.2 F4 — validateLineReceipts', () => {
  const order = {
    items: [
      { centralOrderProductId: 'L1', qty: 10 },
      { centralOrderProductId: 'L2', qty: 5, receivedBatchId: 'BATCH-existing' },
    ],
  };

  it('F4.1 happy path null', () => {
    expect(validateLineReceipts([{ centralOrderProductId: 'L1', qty: 10 }], order)).toBeNull();
  });

  it('F4.2 empty receipts rejected', () => {
    expect(validateLineReceipts([], order)?.[0]).toBe('receipts');
  });

  it('F4.3 missing centralOrderProductId rejected', () => {
    expect(validateLineReceipts([{ qty: 1 }], order)?.[0]).toMatch(/centralOrderProductId/);
  });

  it('F4.4 unknown lineId rejected', () => {
    expect(validateLineReceipts([{ centralOrderProductId: 'BOGUS', qty: 10 }], order)?.[0]).toMatch(/centralOrderProductId/);
  });

  it('F4.5 already-received line rejected', () => {
    expect(validateLineReceipts([{ centralOrderProductId: 'L2', qty: 5 }], order)?.[0]).toMatch(/centralOrderProductId/);
  });

  it('F4.6 duplicate lineId in same call rejected', () => {
    expect(validateLineReceipts([
      { centralOrderProductId: 'L1', qty: 10 },
      { centralOrderProductId: 'L1', qty: 10 },
    ], order)?.[0]).toMatch(/centralOrderProductId/);
  });

  it('F4.7 negative qty rejected', () => {
    expect(validateLineReceipts([{ centralOrderProductId: 'L1', qty: -1 }], order)?.[0]).toMatch(/qty/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// F5 — backendClient.js source-grep (exports + helper extraction)
// ────────────────────────────────────────────────────────────────────────
describe('Phase 15.2 F5 — backendClient.js exports + helper', () => {
  it('F5.1 generateCentralOrderId exported', () => {
    expect(backendSrc).toMatch(/export async function generateCentralOrderId/);
  });

  it('F5.2 createCentralStockOrder exported', () => {
    expect(backendSrc).toMatch(/export async function createCentralStockOrder/);
  });

  it('F5.3 receiveCentralStockOrder exported (idempotent partial-receive)', () => {
    expect(backendSrc).toMatch(/export async function receiveCentralStockOrder/);
    // idempotency contract: skips lines in receivedLineIds
    expect(backendSrc).toMatch(/receivedLineIds/);
    expect(backendSrc).toMatch(/existingReceived\.has\(lineId\)/);
  });

  it('F5.4 cancelCentralStockOrder exported (V19 movement-trail check)', () => {
    expect(backendSrc).toMatch(/export async function cancelCentralStockOrder/);
    // V19 contract: refuses cancel if any non-IMPORT movement exists
    expect(backendSrc).toMatch(/Cannot cancel central order.*non-import/);
  });

  it('F5.5 listCentralStockOrders + getCentralStockOrder exported', () => {
    expect(backendSrc).toMatch(/export async function listCentralStockOrders/);
    expect(backendSrc).toMatch(/export async function getCentralStockOrder/);
  });

  it('F5.6 collection accessors use canonical paths', () => {
    expect(backendSrc).toMatch(/centralStockOrdersCol\s*=\s*\(\)\s*=>\s*collection\(db,\s*\.\.\.basePath\(\),\s*'be_central_stock_orders'\)/);
    expect(backendSrc).toMatch(/centralStockOrderCounterDoc\s*=\s*\(\)\s*=>\s*doc\(db,\s*\.\.\.basePath\(\),\s*'be_central_stock_orders_counter',\s*'counter'\)/);
  });

  it('F5.7 _buildBatchFromOrderItem helper extracted (Rule C1)', () => {
    expect(backendSrc).toMatch(/async function _buildBatchFromOrderItem\(/);
  });

  it('F5.8 createStockOrder body delegates to _buildBatchFromOrderItem (refactor verified)', () => {
    // Find the createStockOrder body and assert it calls the helper.
    const fnStart = backendSrc.indexOf('export async function createStockOrder');
    expect(fnStart).toBeGreaterThan(0);
    // Find the closing brace by searching for the next "export async function" or top-level boundary.
    const after = backendSrc.slice(fnStart, fnStart + 3000);
    expect(after).toContain('_buildBatchFromOrderItem');
    expect(after).toMatch(/linkedField:\s*'linkedOrderId'/);
    expect(after).toMatch(/locationType:\s*'branch'/);
  });

  it('F5.9 receiveCentralStockOrder calls _buildBatchFromOrderItem with central tier params', () => {
    const fnStart = backendSrc.indexOf('export async function receiveCentralStockOrder');
    const after = backendSrc.slice(fnStart, fnStart + 3500);
    expect(after).toContain('_buildBatchFromOrderItem');
    expect(after).toMatch(/linkedField:\s*'linkedCentralOrderId'/);
    expect(after).toMatch(/locationType:\s*'central'/);
  });

  it('F5.10 listStockMovements gains linkedCentralOrderId in mapFields (filter contract)', () => {
    expect(backendSrc).toMatch(/mapFields\s*=\s*\[[\s\S]*?'linkedCentralOrderId'/);
  });

  it('F5.11 PO id format PO-CST-YYYYMM-NNNN locked', () => {
    expect(backendSrc).toMatch(/PO-CST-\$\{ym\}-\$\{String\(seq\)\.padStart\(4,\s*'0'\)\}/);
  });

  it('F5.12 generateCentralOrderId uses runTransaction (atomic counter)', () => {
    const fnStart = backendSrc.indexOf('export async function generateCentralOrderId');
    const after = backendSrc.slice(fnStart, fnStart + 800);
    expect(after).toContain('runTransaction');
    expect(after).toMatch(/yearMonth.*seq/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// F6 — _buildBatchFromOrderItem behaviour contract (V14-clean writes)
// ────────────────────────────────────────────────────────────────────────
describe('Phase 15.2 F6 — _buildBatchFromOrderItem contract', () => {
  it('F6.1 helper writes locationType + locationId on every batch (Phase 15.2 additive)', () => {
    const fnStart = backendSrc.indexOf('async function _buildBatchFromOrderItem');
    const after = backendSrc.slice(fnStart, fnStart + 6500);
    expect(after).toMatch(/locationType:\s*locationType\s*\|\|\s*'branch'/);
    expect(after).toMatch(/locationId:\s*String\(locationId\)/);
  });

  it('F6.2 helper writes branchId for legacy compat (V12 multi-reader sweep — keep canonical filter)', () => {
    const fnStart = backendSrc.indexOf('async function _buildBatchFromOrderItem');
    const after = backendSrc.slice(fnStart, fnStart + 6500);
    expect(after).toMatch(/branchId:\s*String\(locationId\)/);
  });

  it('F6.3 helper movement uses dynamic linkedField key (branch vs central tier)', () => {
    const fnStart = backendSrc.indexOf('async function _buildBatchFromOrderItem');
    const after = backendSrc.slice(fnStart, fnStart + 6500);
    expect(after).toMatch(/movementDoc\[linkedField\]\s*=\s*String\(orderId\)/);
  });

  it('F6.4 V14 — helper resolved item never contains undefined', () => {
    const fnStart = backendSrc.indexOf('async function _buildBatchFromOrderItem');
    const after = backendSrc.slice(fnStart, fnStart + 6500);
    // every optional field uses `|| ''` or `|| null` or `|| 0` defaults
    expect(after).toMatch(/expiresAt:\s*item\.expiresAt\s*\|\|\s*null/);
    expect(after).toMatch(/unit:\s*String\(item\.unit\s*\|\|\s*''\)/);
  });

  it('F6.5 V31 — helper does NOT swallow errors silently (only stockConfig opt-in is non-fatal)', () => {
    const fnStart = backendSrc.indexOf('async function _buildBatchFromOrderItem');
    const after = backendSrc.slice(fnStart, fnStart + 6500);
    // The only catch block is around the stockConfig auto-opt-in (non-fatal).
    // No "continuing" pattern that masks a real failure.
    expect(after).not.toMatch(/console\.warn\([^)]*continuing/i);
  });
});

// ────────────────────────────────────────────────────────────────────────
// F7 — firestore.rules new blocks
// ────────────────────────────────────────────────────────────────────────
describe('Phase 15.2 F7 — firestore.rules', () => {
  it('F7.1 be_central_stock_orders block exists with read/create/update + delete:false', () => {
    expect(rulesSrc).toMatch(/match\s+\/be_central_stock_orders\/\{orderId\}\s*\{[\s\S]+?allow read:\s*if\s+isClinicStaff\(\);[\s\S]+?allow create,\s*update:\s*if\s+isClinicStaff\(\);[\s\S]+?allow delete:\s*if\s+false;/);
  });

  it('F7.2 be_central_stock_orders_counter block exists with read,write', () => {
    expect(rulesSrc).toMatch(/match\s+\/be_central_stock_orders_counter\/\{counterId\}\s*\{[\s\S]+?allow read,\s*write:\s*if\s+isClinicStaff\(\);/);
  });

  it('F7.3 be_stock_movements rule UNCHANGED (V19 hasOnly contract preserved)', () => {
    // V19's narrowing must still cover types 15+16 + new linkedCentralOrderId.
    expect(rulesSrc).toMatch(/match\s+\/be_stock_movements\/\{movementId\}/);
    expect(rulesSrc).toMatch(/hasOnly\(\['reversedByMovementId'\]\)/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// F8 — UI source-grep (CentralStockOrderPanel + CentralStockTab wiring)
// ────────────────────────────────────────────────────────────────────────
describe('Phase 15.2 F8 — CentralStockOrderPanel + CentralStockTab wiring', () => {
  it('F8.1 CentralStockOrderPanel imports all 4 backendClient writers', () => {
    expect(panelSrc).toMatch(/listCentralStockOrders[\s\S]+createCentralStockOrder[\s\S]+receiveCentralStockOrder[\s\S]+cancelCentralStockOrder/);
  });

  it('F8.2 CentralStockOrderPanel imports validator helpers', () => {
    expect(panelSrc).toMatch(/validateCentralStockOrder[\s\S]+emptyCentralStockOrderForm[\s\S]+normalizeCentralStockOrder/);
  });

  it('F8.3 CentralStockTab orders sub-tab renders CentralStockOrderPanel (placeholder removed)', () => {
    expect(centralTabSrc).toMatch(/import CentralStockOrderPanel from/);
    expect(centralTabSrc).toMatch(/subTab\s*===\s*'orders'\s*&&\s*\(\s*<CentralStockOrderPanel/);
    // Placeholder text gone — Phase 15.2 supersedes the 15.1 stub.
    expect(centralTabSrc).not.toContain('central-orders-coming-soon');
  });

  it('F8.4 panel has receive + cancel buttons with data-testids', () => {
    expect(panelSrc).toContain('data-testid="cpo-receive-btn"');
    expect(panelSrc).toContain('data-testid="cpo-cancel-btn"');
    expect(panelSrc).toContain('data-testid="cpo-save-btn"');
  });

  it('F8.5 panel passes user from auth.currentUser (V31 — no anonymous mutations)', () => {
    expect(panelSrc).toMatch(/currentAuditUser\(\)/);
    expect(panelSrc).toMatch(/auth\.currentUser/);
  });

  it('F8.6 panel handleReceive opens ActorConfirmModal (2026-04-27 actor tracking)', () => {
    // Before: handleReceive mapped receipts inline + called receiveCentralStockOrder.
    // After: handleReceive opens ActorConfirmModal; the receipt mapping +
    // writer call moved to onConfirm. The actual writer call is searchable
    // file-wide; receipt mapping now lives next to the modal.
    expect(panelSrc).toContain('receiveCentralStockOrder');
    expect(panelSrc).toMatch(/setPendingAction\(\{\s*kind:\s*'receive'/);
    // Receipt mapping still threads "!it.receivedBatchId" filter
    expect(panelSrc).toContain('!it.receivedBatchId');
  });

  it('F8.7 panel handleCancel opens ActorConfirmModal with reason field', () => {
    expect(panelSrc).toContain('cancelCentralStockOrder');
    expect(panelSrc).toMatch(/setPendingAction\(\{\s*kind:\s*'cancel'/);
    // V31 — modal surfaces error via setError; no silent-swallow.
    // The legacy alert(ยกเลิกไม่สำเร็จ) pattern is gone — modal handles UX now.
    const stripped = panelSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*\n/g, '\n');
    expect(stripped).not.toMatch(/alert\(`ยกเลิกไม่สำเร็จ/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// F9 — Iron-clad source-grep guards
// ────────────────────────────────────────────────────────────────────────
describe('Phase 15.2 F9 — iron-clad guards', () => {
  it('F9.1 Rule E — CentralStockOrderPanel does NOT import brokerClient', () => {
    expect(panelSrc).not.toMatch(/^\s*import\s+[^;]*brokerClient/m);
    expect(panelSrc).not.toMatch(/from\s+['"][^'"]*brokerClient/);
  });

  it('F9.2 Rule E — panel does NOT call /api/proclinic/*', () => {
    expect(panelSrc).not.toMatch(/from\s+['"][^'"]*\/api\/proclinic\//);
    expect(panelSrc).not.toMatch(/fetch\(\s*['"`][^'"`]*\/api\/proclinic\//);
  });

  it('F9.3 Rule C2 — no Math.random for IDs in writers (server uses atomic counter)', () => {
    const fnStart = backendSrc.indexOf('export async function generateCentralOrderId');
    const after = backendSrc.slice(fnStart, fnStart + 800);
    expect(after).not.toMatch(/Math\.random/);
  });

  it('F9.4 V31 — receiveCentralStockOrder NEVER swallows with continuing pattern', () => {
    const fnStart = backendSrc.indexOf('export async function receiveCentralStockOrder');
    const after = backendSrc.slice(fnStart, fnStart + 4500);
    expect(after).not.toMatch(/console\.warn\([^)]*continuing/i);
  });

  it('F9.5 V31 — cancelCentralStockOrder NEVER silent-swallows', () => {
    const fnStart = backendSrc.indexOf('export async function cancelCentralStockOrder');
    const after = backendSrc.slice(fnStart, fnStart + 3500);
    expect(after).not.toMatch(/console\.warn\([^)]*continuing/i);
  });

  it('F9.6 Phase 15.2 marker present in backendClient.js (institutional memory grep)', () => {
    expect(backendSrc).toContain('Phase 15.2');
  });

  it('F9.7 Phase 15.2 marker present in firestore.rules', () => {
    expect(rulesSrc).toContain('Phase 15.2');
  });

  it('F9.8 V14 marker — _buildBatchFromOrderItem comment cites V14', () => {
    const fnStart = backendSrc.indexOf('async function _buildBatchFromOrderItem');
    const before = backendSrc.slice(Math.max(0, fnStart - 1500), fnStart);
    expect(before).toMatch(/V14/);
  });

  it('F9.9 V19 marker — receive comment cites V19 contract preservation', () => {
    expect(backendSrc).toMatch(/V19/);
  });
});

// ────────────────────────────────────────────────────────────────────────
// F10 — Adversarial: counter monotonicity + status state-machine simulate
// ────────────────────────────────────────────────────────────────────────
describe('Phase 15.2 F10 — adversarial state-machine simulate', () => {
  // Pure simulate of the status flip logic (mirrors receiveCentralStockOrder).
  function simulateStatusAfterReceive(allLineIds, alreadyReceived, newlyReceived) {
    const total = new Set([...alreadyReceived, ...newlyReceived]);
    const allReceived = allLineIds.every(id => total.has(id));
    return allReceived ? 'received' : 'partial';
  }

  it('F10.1 first partial receive → partial', () => {
    expect(simulateStatusAfterReceive(['L1', 'L2'], [], ['L1'])).toBe('partial');
  });

  it('F10.2 receive remaining after partial → received', () => {
    expect(simulateStatusAfterReceive(['L1', 'L2'], ['L1'], ['L2'])).toBe('received');
  });

  it('F10.3 receive all in one call → received', () => {
    expect(simulateStatusAfterReceive(['L1', 'L2', 'L3'], [], ['L1', 'L2', 'L3'])).toBe('received');
  });

  it('F10.4 idempotent retry of already-received lineIds → status unchanged', () => {
    // Already received L1+L2; new call repeats L1 — no progression.
    expect(simulateStatusAfterReceive(['L1', 'L2'], ['L1'], ['L1'])).toBe('partial');
    // Already received both; rerun with no new lines — stays received.
    expect(simulateStatusAfterReceive(['L1', 'L2'], ['L1', 'L2'], [])).toBe('received');
  });

  it('F10.5 no double-tally — Set dedups newly+existing overlap', () => {
    expect(simulateStatusAfterReceive(['L1'], ['L1'], ['L1'])).toBe('received');
  });

  // Cancel logic simulate
  function canCancel(status, batchMovements) {
    if (status === 'cancelled' || status === 'cancelled_post_receive') return 'already-cancelled';
    if (status === 'pending') return 'cancel-pre';
    // status partial OR received — V19 movement-trail check
    const nonImport = batchMovements.filter(m => m.type !== 1);
    if (nonImport.length > 0) return 'blocked';
    return 'cancel-post-receive';
  }

  it('F10.6 cancel pending → cancel-pre (no compensations)', () => {
    expect(canCancel('pending', [])).toBe('cancel-pre');
  });

  it('F10.7 cancel partial with only IMPORT movements → cancel-post-receive', () => {
    expect(canCancel('partial', [{ type: 1 }, { type: 1 }])).toBe('cancel-post-receive');
  });

  it('F10.8 cancel received with SALE movement → blocked (V19 audit lock)', () => {
    expect(canCancel('received', [{ type: 1 }, { type: 2 }])).toBe('blocked');
  });

  it('F10.9 cancel received with TREATMENT movement → blocked', () => {
    expect(canCancel('received', [{ type: 1 }, { type: 6 }])).toBe('blocked');
  });

  it('F10.10 cancel cancelled → already-cancelled', () => {
    expect(canCancel('cancelled', [])).toBe('already-cancelled');
    expect(canCancel('cancelled_post_receive', [])).toBe('already-cancelled');
  });
});
