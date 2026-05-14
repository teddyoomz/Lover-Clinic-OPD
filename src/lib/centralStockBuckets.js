// ─── 4-bucket schema for central stock selective make-fresh ───────────────
// Pure ESM, no Firebase deps. Single source of truth — UI imports from here,
// endpoints import from here. Mirrors branchBackupBuckets.js architecture but
// scoped to central warehouses (warehouseId/locationId) instead of branches.
//
// Brainstorming decisions (Q1-Q3 locked 2026-05-15):
//   Q1=C Per-warehouse default + "เคลียทั้งหมด" bulk-all toolbar option
//   Q2=A 4 buckets (PO / Stock+Ledger / Transfers&Withdrawals / Adjustments)
//   Q3=B Refactor shared 3-step state machine; thin wrapper modals per scope
//
// `be_central_stock_warehouses` (warehouse master) PERMANENTLY EXEMPT —
// never in any bucket. assertWarehouseMasterProtected enforces at API boundary.

export const CENTRAL_BUCKETS = Object.freeze({
  cs_po: Object.freeze({
    label: '🛒 PO นำเข้าจาก Vendor',
    description: 'ลบ Purchase Orders + reset counter (เริ่มเลขใหม่จาก 0001 ครั้งหน้า)',
    collections: Object.freeze([
      Object.freeze({ name: 'be_central_stock_orders', filterField: 'warehouseId' }),
    ]),
    counterDocs: Object.freeze(['be_central_stock_orders_counter']),
    defaultChecked: true,
  }),
  cs_stock_ledger: Object.freeze({
    label: '📦 สต็อกคงเหลือ + Ledger',
    description: 'ลบ batches + movements (สต็อกคงเหลือ + ประวัติ in/out ของคลังนี้)',
    collections: Object.freeze([
      Object.freeze({ name: 'be_stock_batches', filterField: 'locationId' }),
      Object.freeze({ name: 'be_stock_movements', filterField: 'locationId' }),
      Object.freeze({ name: 'be_central_stock_movements', filterField: 'warehouseId' }),
    ]),
    counterDocs: Object.freeze([]),
    defaultChecked: true,
  }),
  cs_transfers_withdrawals: Object.freeze({
    label: '🚚 โอนออก / เบิก (ตอบ Branch)',
    description: '⚠️ ลบ transfer/withdrawal records ที่เกี่ยวข้องกับคลังนี้ — branch ปลายทางจะมี batches ที่ไม่มี source order log ในระบบ',
    collections: Object.freeze([
      // Transfers: either source OR dest = warehouseId (both directions of transfer history)
      Object.freeze({
        name: 'be_stock_transfers',
        filterField: 'sourceLocationId',
        orFilterField: 'destLocationId',
      }),
      Object.freeze({ name: 'be_stock_withdrawals', filterField: 'sourceLocationId' }),
    ]),
    counterDocs: Object.freeze([]),
    defaultChecked: true,
  }),
  cs_adjustments: Object.freeze({
    label: '⚖️ การปรับสต็อก',
    description: 'ลบประวัติการปรับ qty (manual adjustments) ที่คลังนี้',
    collections: Object.freeze([
      Object.freeze({ name: 'be_stock_adjustments', filterField: 'locationId' }),
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
 *
 * Accepts strings or { name } objects.
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
 *
 * Returns:
 *   {
 *     collections: [{ name, filterField, orFilterField? }],  // deduped by name
 *     counterDocs: [string],                                 // doc names to reset
 *   }
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
