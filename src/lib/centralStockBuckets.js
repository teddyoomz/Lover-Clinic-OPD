// ─── 4-bucket schema for central stock selective make-fresh ───────────────
// Pure ESM, no Firebase deps. Single source of truth — UI imports from here,
// endpoints import from here. Mirrors branchBackupBuckets.js architecture but
// scoped to central warehouses.
//
// 2026-05-15 V66 FIX — field names verified against production write-side
// code (Rule R env-pull diag confirmed prod data field names). Pre-fix spec
// invented field names that DIDN'T match prod data → filter matched 0 docs
// → make-fresh deleted nothing → user reported "data ยังอยู่ครบเลย".
//
// Verified field names (via scripts/diag-central-stock-prod-field-names.mjs):
//   - be_central_stock_orders → `centralWarehouseId` (line 5855 backendClient)
//   - be_stock_batches → `branchId` (line 5439 backendClient; locationId
//     exists ONLY when written via _buildBatchFromOrderItem post-Phase 15.2;
//     real prod data has branchId on every doc, locationId on subset)
//   - be_stock_movements → `branchId` (line 5466 backendClient)
//   - be_stock_transfers → `sourceLocationId` + `destinationLocationId`
//     (NOT `destLocationId` — line 7684 backendClient)
//   - be_stock_withdrawals → `sourceLocationId` + `destinationLocationId`
//     (line 8059-8060 backendClient)
//   - be_stock_adjustments → `branchId` (line 6291 backendClient)
//
// REMOVED `be_central_stock_movements` — confirmed empty in prod (collection
// listed in branchBackupCore.UNIVERSAL but never written). Central tier
// movements go to `be_stock_movements` with branchId === warehouseId.
//
// Brainstorming decisions (Q1-Q3 locked 2026-05-15):
//   Q1=C Per-warehouse + bulk-all toolbar
//   Q2=A 4 buckets (PO / Stock+Ledger / Transfers&Withdrawals / Adjustments)
//   Q3=B Refactor shared 3-step state machine; thin wrappers per scope
//
// `be_central_stock_warehouses` (warehouse master) PERMANENTLY EXEMPT.

export const CENTRAL_BUCKETS = Object.freeze({
  cs_po: Object.freeze({
    label: '🛒 PO นำเข้าจาก Vendor',
    description: 'ลบ Purchase Orders + reset counter (เริ่มเลขใหม่จาก 0001 ครั้งหน้า)',
    collections: Object.freeze([
      // V66 fix 2026-05-15: filterField was `warehouseId` (invented) → corrected
      // to `centralWarehouseId` (actual prod field per backendClient.js:5855).
      Object.freeze({ name: 'be_central_stock_orders', filterField: 'centralWarehouseId' }),
    ]),
    counterDocs: Object.freeze(['be_central_stock_orders_counter']),
    defaultChecked: true,
  }),
  cs_stock_ledger: Object.freeze({
    label: '📦 สต็อกคงเหลือ + Ledger',
    description: 'ลบ batches + movements (สต็อกคงเหลือ + ประวัติ in/out ของคลังนี้)',
    collections: Object.freeze([
      // V66 fix 2026-05-15: filterField was `locationId` (existed only on
      // post-Phase 15.2 docs) → corrected to `branchId` (universal field on
      // ALL be_stock_batches docs; central tier stores warehouseId here per
      // backendClient.js:5439, 5466, 7542).
      Object.freeze({ name: 'be_stock_batches', filterField: 'branchId' }),
      Object.freeze({ name: 'be_stock_movements', filterField: 'branchId' }),
      // be_central_stock_movements REMOVED — confirmed empty in prod (Rule R
      // diag 2026-05-15). Stale collection from branchBackupCore.UNIVERSAL.
    ]),
    counterDocs: Object.freeze([]),
    defaultChecked: true,
  }),
  cs_transfers_withdrawals: Object.freeze({
    label: '🚚 โอนออก / เบิก (ตอบ Branch)',
    description: '⚠️ ลบ transfer/withdrawal records ที่เกี่ยวข้องกับคลังนี้ — branch ปลายทางจะมี batches ที่ไม่มี source order log ในระบบ',
    collections: Object.freeze([
      // V66 fix 2026-05-15: orFilterField was `destLocationId` (invented) →
      // corrected to `destinationLocationId` (actual prod field per
      // backendClient.js:7684).
      Object.freeze({
        name: 'be_stock_transfers',
        filterField: 'sourceLocationId',
        orFilterField: 'destinationLocationId',
      }),
      // V66 fix 2026-05-15: added orFilterField on withdrawals — central can
      // be either source (sending to branch) OR destination (rare cross-
      // central receive). Field name verified per backendClient.js:8059-8060.
      Object.freeze({
        name: 'be_stock_withdrawals',
        filterField: 'sourceLocationId',
        orFilterField: 'destinationLocationId',
      }),
    ]),
    counterDocs: Object.freeze([]),
    defaultChecked: true,
  }),
  cs_adjustments: Object.freeze({
    label: '⚖️ การปรับสต็อก',
    description: 'ลบประวัติการปรับ qty (manual adjustments) ที่คลังนี้',
    collections: Object.freeze([
      // V66 fix 2026-05-15: filterField was `locationId` (does not exist on
      // be_stock_adjustments) → corrected to `branchId` (actual prod field
      // per backendClient.js:6291).
      Object.freeze({ name: 'be_stock_adjustments', filterField: 'branchId' }),
    ]),
    counterDocs: Object.freeze([]),
    defaultChecked: true,
  }),
});

/**
 * Throws WAREHOUSE_MASTER_NOT_WIPEABLE if `be_central_stock_warehouses` appears
 * in the collections list. Defense-in-depth at API boundary — even if a UI
 * caller (or hand-crafted curl) somehow includes the master collection, the
 * server rejects before any wipe.
 */
export function assertWarehouseMasterProtected(collections) {
  for (const c of collections) {
    const name = typeof c === 'string' ? c : c?.name;
    if (name === 'be_central_stock_warehouses') {
      throw new Error('WAREHOUSE_MASTER_NOT_WIPEABLE');
    }
  }
}

/**
 * Resolve a list of bucket IDs into actionable spec.
 * Throws EMPTY_BUCKET_SET / UNKNOWN_BUCKET / WAREHOUSE_MASTER_NOT_WIPEABLE.
 */
export function resolveCentralBucketScope(bucketIds) {
  if (!Array.isArray(bucketIds) || bucketIds.length === 0) {
    throw new Error('EMPTY_BUCKET_SET');
  }
  const collections = [];
  const seen = new Set();
  const counterDocs = new Set();
  for (const id of bucketIds) {
    const b = CENTRAL_BUCKETS[id];
    if (!b) throw new Error(`UNKNOWN_BUCKET: ${id}`);
    for (const c of b.collections) {
      if (!seen.has(c.name)) {
        collections.push(c);
        seen.add(c.name);
      }
    }
    for (const cd of b.counterDocs) counterDocs.add(cd);
  }
  assertWarehouseMasterProtected(collections);
  return { collections, counterDocs: [...counterDocs] };
}

/** Returns {bucketId: true} UI default state — all 4 default-checked. */
export function centralBucketDefaultsForUI() {
  const out = {};
  for (const [id, b] of Object.entries(CENTRAL_BUCKETS)) {
    out[id] = !!b.defaultChecked;
  }
  return out;
}
