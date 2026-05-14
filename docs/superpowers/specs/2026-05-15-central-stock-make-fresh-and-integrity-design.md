# Central Stock Make-Fresh + Backup Integrity — Design Spec

> **Date**: 2026-05-15
> **Author**: claude (brainstormed with @teddyoomz)
> **Status**: APPROVED via brainstorming Q1-Q3 — pending spec review
> **Companion plan**: `docs/superpowers/plans/2026-05-15-central-stock-make-fresh.md` (to be written by writing-plans skill)
> **Extends**: Selective Make-Fresh + Backup Integrity (2026-05-14) — `docs/superpowers/specs/2026-05-14-selective-make-fresh-and-backup-integrity-design.md`
> **Iron-clad refs**: Rule Q (V66) · Rule M · Rule C1 (Rule of 3) · AV19 + AV43

---

## §0 — Motivation + Scope

### Problem

The 2026-05-14 selective-make-fresh feature covered **per-branch** data wipes. Central stock (warehouse-scoped data) has parallel needs:
- Dev wants to clear a test warehouse's PO history + inventory state without touching the warehouse master.
- Admin wants to reset a central warehouse before fiscal year close, with full restore safety net.
- Operations wants to clear specific data buckets selectively (PO only, or stock-ledger only).

Currently no way exists. The warehouses + their inventory ledger sit at universal-collection level (`be_central_stock_*`) plus `locationId`-keyed stock collections (`be_stock_*` at warehouseId).

### Solution

Extend the selective-make-fresh pattern to **central stock**:

1. Per-warehouse selective wipe (4 logical buckets) via new modal in `CentralStockTab.jsx`.
2. "เคลียทั้งหมด" toolbar button: bulk operation across all warehouses (single backup file + single audit doc).
3. **Warehouse master records permanently exempt** (`be_central_stock_warehouses` NEVER wipeable from this system — analog of T1 protection).
4. SHA-256 hash verification + Rule M cleanup discipline + Rule Q L2 round-trip e2e on real prod.
5. Shared 3-step state machine extracted from existing MakeFreshModal (Rule C1 leverage; both branch + central modals = thin wrappers).

### Out of scope

- Warehouse deletion (use existing Edit→Delete flow on warehouse card).
- Cross-warehouse inventory transfers triggered by wipe (preserved as-is; admin understands trade-off).
- Restore UI changes (V40 `BranchBackupTab` will gain a "Restore central backup" mode in a future task — not in this spec).
- ProClinic sync (Rule H — central stock 100% in our Firestore, no ProClinic touch).

---

## §1 — Brainstorming Decisions (Q1-Q3, user-approved)

| Q | Decision | Rationale |
|---|---|---|
| Q1 | **C — Per-warehouse default + "เคลียทั้งหมด" bulk-all toolbar option** | Per-warehouse for safety + bulk for dev convenience. Single modal handles both (warehouse pre-selection differs). |
| Q2 | **A — 4 buckets** (PO / Stock+Ledger / Transfers&Withdrawals / Adjustments). Warehouse master protected. | Matches admin mental categories. Cross-tier transfer warning shown in UI. |
| Q3 | **B — Refactor shared 3-step state machine + thin wrappers** | Rule C1 leverage. Branch + Central modals share engine; bucket schemas live in separate files. |

Remaining decisions inherited from selective-make-fresh (auto-approved):
- 3-step UX (Pick → Preview → Type-confirm → Run)
- Hash verification BEFORE wipe (BACKUP_INTEGRITY_FAIL aborts)
- Match-scope auto-backup (V40 AV19 preserved)
- Round-trip integrity proven via Rule Q L2 e2e on real prod with TEST-prefixed fixtures

---

## §2 — Architecture (5 layers)

```
┌─────────────────────────────────────────────────────────────────┐
│ UI Layer (React)                                                 │
│  CentralStockTab.jsx (EDIT — add buttons to warehouses sub-tab) │
│  CentralMakeFreshButton.jsx (NEW — admin-gated, per-warehouse)  │
│  CentralMakeFreshModal.jsx (NEW — thin wrapper, ~80 LOC)        │
│  MakeFreshModal.jsx (REFACTOR — slim wrapper, ~80 LOC)          │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│ Shared engine (NEW)                                              │
│  src/lib/makeFreshStateMachine.js — useMakeFreshStateMachine    │
│  src/components/backend/makeFresh/BucketCheckList.jsx           │
│  src/components/backend/makeFresh/ImpactPanel.jsx               │
│  src/components/backend/makeFresh/TypeConfirmGate.jsx           │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│ Scope-specific bucket schemas (pure JS)                          │
│  src/lib/branchBackupBuckets.js (EXISTING — unchanged)          │
│  src/lib/centralStockBuckets.js (NEW)                           │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│ Endpoints (Vercel serverless, admin-token gated)                 │
│  /api/admin/central-stock-backup-export (NEW)                   │
│  /api/admin/central-stock-make-fresh (NEW)                      │
│  /api/admin/branch-{backup-export,make-fresh}.js (EXISTING)     │
│  /api/admin/branch-restore.js (EXISTING — backup file format    │
│    is shared via branchBackupSchema; restore handles both via   │
│    file.meta.scopeKind field — see §7 migration)                │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│ Firestore                                                        │
│  be_central_stock_warehouses (PROTECTED — never wiped)          │
│  be_central_stock_orders + _counter (filter by warehouseId)     │
│  be_central_stock_movements (filter by warehouseId)             │
│  be_stock_{batches,movements,transfers,withdrawals,adjustments} │
│    (filter by locationId === warehouseId for central scope)    │
│  be_admin_audit (audit trail)                                   │
└─────────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────────┐
│ Cloud Storage                                                    │
│  backups/central/{warehouseId | all}/...json (v2 + bodyHash +   │
│  warehouseIds[] + bucketIds[] in meta)                          │
└─────────────────────────────────────────────────────────────────┘
```

**Warehouse master protection invariant**:
- `be_central_stock_warehouses` is NEVER in any central bucket schema.
- `assertWarehouseMasterProtected(collections)` throws `WAREHOUSE_MASTER_NOT_WIPEABLE` on attempt.
- Both endpoints (export + make-fresh) call this defense-in-depth.
- Mirror of branch's `assertNotT1` pattern (T1 protected by same architecture).

---

## §3 — Components

### 3.1 `src/lib/centralStockBuckets.js` (NEW)

Single source of truth for the 4-bucket central stock schema.

```js
import { computeBodyHash } from './branchBackupSchema.js';

export const CENTRAL_BUCKETS = Object.freeze({
  cs_po: Object.freeze({
    label: '🛒 PO นำเข้าจาก Vendor',
    description: 'ลบ Purchase Orders + counter reset (เริ่มเลขใหม่)',
    collections: Object.freeze([
      { name: 'be_central_stock_orders', filterField: 'warehouseId' },
    ]),
    counterDocs: Object.freeze(['be_central_stock_orders_counter']),  // reset to 0
    defaultChecked: true,
  }),
  cs_stock_ledger: Object.freeze({
    label: '📦 สต็อกคงเหลือ + Ledger',
    description: 'ลบ batches + movements (สต็อกคงเหลือ + ประวัติ in/out)',
    collections: Object.freeze([
      { name: 'be_stock_batches', filterField: 'locationId' },
      { name: 'be_stock_movements', filterField: 'locationId' },
      { name: 'be_central_stock_movements', filterField: 'warehouseId' },
    ]),
    counterDocs: Object.freeze([]),
    defaultChecked: true,
  }),
  cs_transfers_withdrawals: Object.freeze({
    label: '🚚 โอนออก / เบิก (ตอบ Branch)',
    description: '⚠️ ลบ transfer/withdrawal records ที่เกี่ยวข้องกับคลังนี้ — branch ปลายทางจะมี batches ที่ไม่มี source order log',
    collections: Object.freeze([
      // Transfers: either source OR dest = warehouseId
      { name: 'be_stock_transfers', filterField: 'sourceLocationId', orFilterField: 'destLocationId' },
      { name: 'be_stock_withdrawals', filterField: 'sourceLocationId' },
    ]),
    counterDocs: Object.freeze([]),
    defaultChecked: true,
  }),
  cs_adjustments: Object.freeze({
    label: '⚖️ การปรับสต็อก',
    description: 'ลบประวัติการปรับ qty (manual adjustments) ที่คลังนี้',
    collections: Object.freeze([
      { name: 'be_stock_adjustments', filterField: 'locationId' },
    ]),
    counterDocs: Object.freeze([]),
    defaultChecked: true,
  }),
});

/** Throws WAREHOUSE_MASTER_NOT_WIPEABLE if `be_central_stock_warehouses` in list. */
export function assertWarehouseMasterProtected(collections) {
  for (const c of collections) {
    const name = typeof c === 'string' ? c : c.name;
    if (name === 'be_central_stock_warehouses') {
      throw new Error('WAREHOUSE_MASTER_NOT_WIPEABLE');
    }
  }
}

/**
 * Resolve bucket IDs into an actionable spec.
 * Returns: { collections: [{name, filterField, orFilterField?}], counterDocs: [...] }
 */
export function resolveCentralBucketScope(bucketIds) {
  if (!Array.isArray(bucketIds) || bucketIds.length === 0) {
    throw new Error('EMPTY_BUCKET_SET');
  }
  const collections = [];
  const counterDocs = new Set();
  const seenCols = new Set();
  for (const id of bucketIds) {
    const b = CENTRAL_BUCKETS[id];
    if (!b) throw new Error(`UNKNOWN_BUCKET: ${id}`);
    for (const c of b.collections) {
      if (!seenCols.has(c.name)) {
        collections.push(c);
        seenCols.add(c.name);
      }
    }
    for (const cd of b.counterDocs) counterDocs.add(cd);
  }
  assertWarehouseMasterProtected(collections);
  return { collections, counterDocs: [...counterDocs] };
}

/** UI default state: all 4 buckets checked (no opt-in-only buckets in central). */
export function centralBucketDefaultsForUI() {
  const out = {};
  for (const [id, b] of Object.entries(CENTRAL_BUCKETS)) {
    out[id] = !!b.defaultChecked;
  }
  return out;
}
```

### 3.2 `src/lib/makeFreshStateMachine.js` (NEW — shared engine)

Pure React hook. Returns state + handlers. Both modals consume.

```js
import { useState, useCallback } from 'react';

/**
 * 3-step Make-Fresh state machine.
 *
 * @param {Object} opts
 * @param {string} opts.exportEndpoint — e.g. '/api/admin/branch-backup-export'
 * @param {string} opts.makeFreshEndpoint — e.g. '/api/admin/branch-make-fresh'
 * @param {Object} opts.bucketDefaults — { bucketId: boolean }
 * @param {(token, body) => Promise<Response>} opts.fetcher — fetch wrapper
 * @param {Object} opts.scopeBody — additional fields for API requests (e.g. {branchId} or {warehouseIds, allWarehouses})
 * @param {string} opts.confirmName — string user must type to confirm
 *
 * @returns {{
 *   phase, checkedBuckets, advancedOpen, confirmText, preview,
 *   autoBackupRef, bodyHash, result, error, matches,
 *   tickedBucketIds, handleBucketToggle, setAdvancedOpen,
 *   setConfirmText, handlePreview, handleRun,
 *   setPhase, setPreview,
 * }}
 */
export function useMakeFreshStateMachine(opts) { /* extracted from current MakeFreshModal */ }
```

### 3.3 Shared sub-components (NEW)

- **`BucketCheckList.jsx`** — renders array of bucket checkboxes given `BUCKETS` + `checkedBuckets` + `onToggle` + `advancedOpen`.
- **`ImpactPanel.jsx`** — renders preview counts given `bucketSchema` + `preview` + `checkedBuckets`.
- **`TypeConfirmGate.jsx`** — typed-name input + Confirm button gated on `matches`.

### 3.4 Modal wrappers (REFACTOR + NEW)

- **`MakeFreshModal.jsx` (REFACTOR)**: passes `bucketSchema=BUCKETS`, `exportEndpoint='/api/admin/branch-backup-export'`, `makeFreshEndpoint='/api/admin/branch-make-fresh'`, `scopeBody={branchId}`, `confirmName=branchName`. ~80 LOC orchestrator + JSX.
- **`CentralMakeFreshModal.jsx` (NEW)**: passes `bucketSchema=CENTRAL_BUCKETS`, central endpoints, `scopeBody={warehouseIds OR allWarehouses}`, `confirmName=warehouseName` or `"ทุกคลังกลาง"` for bulk.

### 3.5 `src/components/backend/CentralMakeFreshButton.jsx` (NEW)

Per-warehouse button (`data-testid="central-make-fresh-btn-{warehouseId}"`) + bulk-all button (`data-testid="central-make-fresh-bulk-btn"`). Both admin-gated via `useTabAccess.isAdmin`. Renders `<CentralMakeFreshModal />` on click.

### 3.6 `CentralStockTab.jsx` warehouses sub-tab (EDIT)

In the `subTab === 'warehouses'` branch, after listing warehouses:
- Top toolbar: "เคลีย Central Stock ทั้งหมด" bulk-all button (right-aligned next to "เพิ่มคลัง")
- Each warehouse card: add `CentralMakeFreshButton` next to existing Edit/Delete buttons

### 3.7 Endpoints (NEW — mirror branch structure)

**`api/admin/central-stock-backup-export.js`**:

```js
// Request body:
//   warehouseIds?: string[]    // selective (one or more warehouses)
//   allWarehouses?: boolean    // bulk-all (overrides warehouseIds)
//   bucketIds: string[]        // required, non-empty
//   dryRun?: boolean
//   isAutoPreFresh?: boolean

// Processing:
//   1. resolveCentralBucketScope(bucketIds) → {collections, counterDocs}
//   2. assertWarehouseMasterProtected — defense-in-depth
//   3. Resolve warehouseIds list (from req OR listAllWarehouses if allWarehouses)
//   4. For each warehouse × each collection spec:
//        - Filter docs by spec.filterField === warehouseId
//        - If spec.orFilterField present: ALSO include docs where orFilterField === warehouseId
//        - Group output by `{collection}/{warehouseId}` key (preserves warehouse association)
//   5. Capture counter doc state (read existing value for restore)
//   6. buildBackupFile({...}) — emits bodyHash + bucketIds + warehouseIds in meta
//   7. dryRun=true: return perBucket + totalDocs + estSizeBytes; NO Storage write
//   8. Upload + audit doc with scopeKind='central'
```

**`api/admin/central-stock-make-fresh.js`**:

```js
// Request body:
//   warehouseIds?: string[]
//   allWarehouses?: boolean
//   bucketIds: string[]
//   autoBackupRef: string
//   expectedBodyHash?: string

// Pre-wipe (mirror branch order):
//   1. Validate bucketIds + warehouseIds non-empty (or allWarehouses=true)
//   2. AV19: bucket.file(autoBackupRef).exists()
//   3. Download + parse + validateBackupFile
//   4. Recompute bodyHash + compare → BACKUP_INTEGRITY_FAIL on mismatch
//   5. expectedBodyHash cross-check → BACKUP_HASH_EXPECTED_MISMATCH
//   6. SCOPE_MISMATCH: file.meta.bucketIds + warehouseIds match request
//   7. resolveCentralBucketScope + assertWarehouseMasterProtected
//   8. Wipe per warehouseId × per collection:
//      - Primary: query WHERE filterField === warehouseId → batch.delete
//      - If spec.orFilterField present (e.g. transfers): ALSO query WHERE
//        orFilterField === warehouseId → batch.delete (dedup by docId)
//   9. Counter docs: batch.delete (re-initializes to seq=0 at next PO creation).
//      Restore phase PRESERVES the snapshot counter value verbatim.
//  10. Audit doc with scopeKind='central' + bucketIds + warehouseIds + bodyHash + deletedCounts
```

### 3.8 CLI mirror (NEW)

`scripts/central-stock-make-fresh.mjs` — accepts `--warehouse-id` (or `--all`) + `--bucket-ids` + `--apply`. Mirrors `branch-make-fresh.mjs` structure with central bucket resolution.

### 3.9 `scripts/e2e-central-stock-roundtrip-real-prod.mjs` (NEW ★)

5-scenario round-trip on TEST-CSRT-prefixed warehouse with adversarial fixtures (Thai + Unicode + Timestamps + cross-collection refs + counter doc state). 8 phases per scenario × hash byte-equal at every boundary. Cleanup zero orphans. Mirror of branch round-trip script.

---

## §4 — Data Flow

```
[Admin clicks "ทำให้คลังนี้ใหม่" on warehouse card]
  ↓
[CentralMakeFreshModal opens (idle, 4 buckets all checked)]
  ↓
[Ticks/unticks + Advanced toggle]
  ↓
[Click ดูผลกระทบ] → POST /central-stock-backup-export {warehouseIds:[w], bucketIds, dryRun:true}
  ↓ Server: resolveCentralBucketScope → assertWarehouseMasterProtected → count per collection
  ← 200 {perBucket, totalDocs, estSizeBytes}
[Display impact panel]
  ↓
[Click ดำเนินการต่อ + type warehouse name + Confirm]
  ↓
[Phase 1: POST /central-stock-backup-export {warehouseIds, bucketIds, isAutoPreFresh:true}]
  ↓ Server: build file v2 → bodyHash → upload Storage → audit doc
  ← 200 {storagePath, bodyHash, warehouseIds, bucketIds}
  ↓
[Phase 2: POST /central-stock-make-fresh {warehouseIds, bucketIds, autoBackupRef, expectedBodyHash}]
  ↓ Server: AV19 exists → download → parse → validate → recompute hash → compare
  ↓ scope-mismatch check → warehouse-mismatch check → assertWarehouseMasterProtected
  ↓ For each warehouseId × collection: filter + wipe + reset counter docs
  ↓ Audit doc {scopeKind:'central', bucketIds, warehouseIds, bodyHash, deletedCounts}
  ← 200 {deletedCounts, bodyHash, warehouseIds, auditId}
[Display done panel]
```

**Bulk-all variant**: same flow but `warehouseIds=[]` + `allWarehouses=true`. Confirm-name = `"ทุกคลังกลาง"`. Server iterates all known warehouses.

---

## §5 — Safety + Error Handling

Mirror branch (9 failure modes) + 2 new:

| Failure mode | Catch site | Response |
|---|---|---|
| Unauth/non-admin | `verifyAdminToken` | 401/403 |
| `bucketIds` empty | Validator | 400 `EMPTY_BUCKET_SET` |
| Missing `warehouseIds` + `allWarehouses` false | Validator | 400 `MISSING_WAREHOUSE_SCOPE` |
| **`be_central_stock_warehouses` in scope** | `assertWarehouseMasterProtected` × 2 | 400 `WAREHOUSE_MASTER_NOT_WIPEABLE` |
| Unknown bucket ID | `resolveCentralBucketScope` | 400 `UNKNOWN_BUCKET` |
| Backup file missing in Storage | AV19 | 400 `AUTO_BACKUP_NOT_FOUND` |
| **Hash mismatch** | Recompute | 500 `BACKUP_INTEGRITY_FAIL` — abort BEFORE wipe |
| `expectedBodyHash` mismatch | Cross-check | 400 `BACKUP_HASH_EXPECTED_MISMATCH` |
| `file.bucketIds !== request.bucketIds` | Validator | 400 `SCOPE_MISMATCH` |
| `file.warehouseIds !== request.warehouseIds` | Validator | 400 `WAREHOUSE_MISMATCH` |
| Schema validation fail | `validateBackupFile` | 400 |
| Wipe failure mid-batch | try/catch | 500 `WIPE_PARTIAL` + audit doc records partial |

Counter doc reset (= batch.delete) is **last step** (after all wipes succeed). Failure during counter delete leaves data wiped + counter at pre-wipe value → next PO creation auto-increments from the stale value (safe, no collision since wiped POs are gone). Admin can re-run cleanup manually if exact-zero counter is needed.

---

## §6 — Test Strategy (Rule Q L1 + L2 + Rule I + Rule C1)

### 6.1 Unit tests (Rule Q L2)

`tests/central-stock-make-fresh-helpers.test.js`:
- CENTRAL_BUCKETS schema invariants (4 frozen buckets, no warehouse master overlap)
- resolveCentralBucketScope: empty/unknown/single/multi
- assertWarehouseMasterProtected: passes for valid collections, throws for warehouse master
- centralBucketDefaultsForUI returns 4 true (no opt-in-only buckets in central)

### 6.2 Shared engine tests

`tests/make-fresh-state-machine.test.js`:
- 3-step state transitions (idle → previewing → preview-ready → confirming → backing-up → wiping → done | error)
- Default state injection via `bucketDefaults` opt
- Error paths exercised for both scopes (branch + central) via parameterized fixtures

### 6.3 Flow simulate (Rule I)

`tests/central-stock-make-fresh-flow-simulate.test.jsx`:
- BranchProvider not needed (central is warehouse-scoped)
- Mount CentralMakeFreshModal with mock warehouse → preview → confirm → done
- 7 RTL tests mirroring branch F1.1-F1.7

### 6.4 Source-grep regression (V21 + AV44)

`tests/central-stock-make-fresh-source-grep.test.js`:
- UI imports CENTRAL_BUCKETS from lib (not hardcoded)
- UI sends warehouseIds[] (or allWarehouses:true) + bucketIds[] — NEVER raw collection names
- Both endpoints call assertWarehouseMasterProtected
- Both endpoints call computeBodyHash + BACKUP_INTEGRITY_FAIL check BEFORE batch.delete
- Hash compare INDEX < batch.delete INDEX

### 6.5 ★ Round-trip e2e (Rule Q L2 — CRITICAL)

`scripts/e2e-central-stock-roundtrip-real-prod.mjs`:

```
Phase 1: Seed TEST-CSRT-prefixed warehouse + adversarial fixtures across 4 buckets
Phase 2: Snapshot pre-state hash
Phase 3: Selective backup → upload → emit bodyHash
Phase 4: Selective wipe via resolveCentralBucketScope + counter reset
Phase 5: Assert wiped scope empty + warehouse master intact + other warehouses untouched
Phase 6: Restore from backup → re-verify hash on download
Phase 7: Assert post-restore hash byte-equal pre-state hash
Phase 8: Cleanup zero orphans + audit doc

5 scenarios:
- cs_po-only (PO + counter reset roundtrip)
- cs_stock_ledger-only
- cs_transfers_withdrawals-only
- cs_adjustments-only
- all-4-buckets (full central wipe + restore)

Adversarial fixtures: Thai text in PO supplier names, Unicode NFC/NFD,
Firestore Timestamps on movements, large batches arrays, cross-warehouse
transfer refs (TEST-CSRT-W1 → TEST-CSRT-W2 transfers — wipe one, other intact)
```

### 6.6 Playwright real-browser (Rule Q L1)

`tests/e2e/central-stock-make-fresh.spec.js`:

```
PW1.1 — Happy path: open CentralStockTab → warehouses sub-tab → click Make Fresh
        on TEST-CSRT warehouse → tick 1 bucket → preview → confirm → done

PW1.2 — Warehouse master protection: hand-crafted API POST with bucketIds
        attempting be_central_stock_warehouses → expect WAREHOUSE_MASTER_NOT_WIPEABLE

PW1.3 — Hash mismatch: intercept make-fresh request, corrupt expectedBodyHash
        → expect BACKUP_HASH_EXPECTED_MISMATCH or BACKUP_INTEGRITY_FAIL

PW1.4 — Bulk-all: click "เคลีย Central Stock ทั้งหมด" → modal pre-selects all
        warehouses → preview shows aggregated counts → typed confirm
        "ทุกคลังกลาง" → done
```

---

## §7 — Migration / Backward Compatibility

- **Backup file format**: extends v2 with optional `meta.scopeKind: 'branch' | 'central'` + `meta.warehouseIds[]` (replaces `meta.branchId` for central scope). `validateBackupFile` accepts both shapes.
- **Restore endpoint** (`api/admin/branch-restore.js`): EDIT — detect `meta.scopeKind` and route to branch-restore vs central-restore logic OR (simpler) ship a separate `api/admin/central-stock-restore.js`. **Decision deferred**: in this spec, ship **separate restore endpoint** for clarity (extend `branch-restore.js` in follow-up if needed).
- **Existing branch MakeFreshModal**: REFACTORED to use shared engine. No user-visible behavior change. Test bank updated to assert post-refactor invariants.
- **CLI**: existing `scripts/branch-make-fresh.mjs` unchanged. NEW `scripts/central-stock-make-fresh.mjs` parallel mirror.

---

## §8 — Out of scope (deferred)

- **Pre-wipe dry-run restore** (analog of branch Q5-C deferred).
- **Restore UI in BranchBackupTab** for central backup files — V40 BranchBackupTab to be extended in a follow-up task. For now: admin uses CLI script `scripts/central-stock-restore.mjs` (NEW companion script — also part of this scope; see §3.9 addendum).

Actually amending §3.9: ALSO ship `scripts/central-stock-restore.mjs` (NEW) so admin can restore from a central backup file without UI. ~80 LOC mirroring `scripts/branch-restore.mjs`.

- Multi-warehouse batch operations beyond "all warehouses" (e.g. "wipe warehouse A + B but not C") — current bulk-all is all-or-nothing.

---

## §9 — Risks

1. **Counter doc reset semantics**: `be_central_stock_orders_counter` resets to 0 after PO wipe. Future PO creations will reuse PO-CST-YYYYMM-0001 etc. → potential collision if any old PO documents survived in Storage (e.g. via undelete). Mitigation: backup file PRESERVES counter state; restore re-stamps original value.
2. **Cross-warehouse transfer entanglement**: if warehouse A has a transfer to warehouse B, wiping A's bucket 3 removes that transfer record. B may have inherited batches with orphaned `sourceTransferId` references. Mitigation: UI warning + admin understanding via bucket 3 description.
3. **Storage cost**: each central backup file ≤100MB cap (same as branch). For very large central warehouses (10k+ PO records), test bundling. Not currently a concern.
4. **Concurrent writes during backup**: same as branch — admin should not actively create POs during make-fresh. Future "freeze warehouse" toggle deferred.

---

## §10 — Acceptance Criteria

1. ✅ Per-warehouse "ทำให้คลังนี้ใหม่" button visible on each warehouse card (admin-only)
2. ✅ Bulk-all "เคลีย Central Stock ทั้งหมด" toolbar button visible in warehouses sub-tab (admin-only)
3. ✅ Shared 3-step state machine extracted; both MakeFreshModal + CentralMakeFreshModal use it
4. ✅ 4 buckets selectable via CentralMakeFreshModal + Advanced collection toggle works
5. ✅ All 4 buckets default-checked on modal open (no opt-in-only in central)
6. ✅ Warehouse master records NEVER wiped (assertWarehouseMasterProtected enforced in both endpoints)
7. ✅ Selective backup file contains only selected scope (verified via file.meta.bucketIds + warehouseIds + collection keys)
8. ✅ Hash field present + correctly computed + verified before wipe
9. ✅ Hash mismatch aborts wipe with BACKUP_INTEGRITY_FAIL (verified via Playwright PW1.3)
10. ✅ All test files green (unit + state machine + flow-simulate + source-grep + round-trip e2e + Playwright)
11. ✅ **Round-trip e2e script passes ALL 5 scenarios × 8 phases with zero orphans + hash byte-equal at every boundary** (CRITICAL)
12. ✅ Full vitest suite green (no regression in existing branch make-fresh tests post-shared-engine extraction)
13. ✅ Build clean
14. ✅ Audit doc records scopeKind + bucketIds + warehouseIds + bodyHash + deletedCounts
15. ✅ AV44 invariant added to audit-anti-vibe-code SKILL.md
16. ✅ Counter doc reset works correctly + restore preserves original counter value

---

## §11 — Implementation Plan

To be written by `writing-plans` skill at `docs/superpowers/plans/2026-05-15-central-stock-make-fresh.md`.

Expected 14-16 tasks:
1. NEW `centralStockBuckets.js` (TDD)
2. NEW `makeFreshStateMachine.js` (extract from current MakeFreshModal — TDD)
3. NEW shared sub-components (BucketCheckList + ImpactPanel + TypeConfirmGate)
4. REFACTOR `MakeFreshModal.jsx` to consume shared engine (preserve all existing tests)
5. NEW `CentralMakeFreshModal.jsx` (~80 LOC thin wrapper)
6. NEW `CentralMakeFreshButton.jsx`
7. EDIT `CentralStockTab.jsx` — wire buttons into warehouses sub-tab
8. NEW `api/admin/central-stock-backup-export.js`
9. NEW `api/admin/central-stock-make-fresh.js`
10. NEW `scripts/central-stock-make-fresh.mjs` CLI mirror
11. NEW `scripts/central-stock-restore.mjs` CLI mirror
12. NEW unit tests (helpers + state machine)
13. NEW flow-simulate (Rule I) + source-grep (V21 + AV44)
14. NEW `scripts/e2e-central-stock-roundtrip-real-prod.mjs` + RUN --apply on real prod ★
15. NEW Playwright spec
16. AV44 invariant in audit-anti-vibe-code SKILL.md + V21 fixup sweep + final verify

---

## §12 — Verify Locally

```bash
# Unit + flow-simulate + source-grep
npx vitest run tests/central-stock-make-fresh-helpers.test.js \
              tests/make-fresh-state-machine.test.js \
              tests/central-stock-make-fresh-flow-simulate.test.jsx \
              tests/central-stock-make-fresh-source-grep.test.js

# Build clean
npm run build

# Round-trip e2e dry-run + apply (Rule R env-pull standing auth)
vercel env pull .env.local.prod --environment=production
node scripts/e2e-central-stock-roundtrip-real-prod.mjs           # dry-run
node scripts/e2e-central-stock-roundtrip-real-prod.mjs --apply   # ★ critical

# Playwright real-browser
FIREBASE_API_KEY=... TEST_ADMIN_EMAIL=... TEST_ADMIN_PASSWORD=... \
  npx playwright test tests/e2e/central-stock-make-fresh.spec.js

# Full suite (pre-deploy)
npm test -- --run
```

---

## §13 — Rule Q Verification Sign-off

Before claiming "verified":

- [ ] Round-trip e2e --apply on real prod TEST fixtures with 5 scenarios PASS
- [ ] Playwright real-browser spec PASS (or skip gracefully when env vars missing — by design)
- [ ] Hash byte-equal at every phase boundary
- [ ] Warehouse master records UNTOUCHED post-test (verify count unchanged)
- [ ] Cleanup zero orphans (TEST-CSRT-* fully removed)
- [ ] Adversarial fixtures (Thai + Unicode + Timestamps + cross-warehouse refs) all pass
- [ ] Counter doc reset + restore round-trip works

Any "no" → DO NOT CLAIM. Re-test.

---

**End of design spec.**
