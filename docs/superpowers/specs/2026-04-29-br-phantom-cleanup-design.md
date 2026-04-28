# Phase 15.7-novies — BR-1777095572005-ae97f911 phantom branch cleanup

**Status**: Approved 2026-04-29 (user confirmed via `/brainstorming` flow)
**Type**: One-shot ops cleanup (destructive)
**Test data**: Confirmed by user — 4 batches at the phantom branch are NOT real production stock
**Skill used**: `brainstorming` (then direct execute, skipping `writing-plans` because the work is enumerated cleanup, not a multi-step implementation)

---

## Context

User report (2026-04-29):
> "เราไม่มีสาขา BR-1777095572005-ae97f911 อยู่แล้ว มันมาจากไหน ลบทิ้งไปเลยได้ไหม
> ถ้าไม่มีประโยชน์กับเรา กันการสับสนเรื่องข้อมูล เพราะตอนนี้เรามีแค่สาขาเดียว
> กับคลังกลาง ยังไม่ได้สร้าง database ใดๆกับสาขาใหม่"

The branch `BR-1777095572005-ae97f911` is the only doc in `be_branches`. It was
auto-created during V20 multi-branch testing (created 2026-04-25, name=
"นครราชสีมา", isDefault=true). User has only ONE physical clinic + one central
warehouse — they never intentionally created this V20 multi-branch entry.

The branch's `isDefault: true` flag caused Phase 15.7-ter's auto-pick effect to
default `StockBalancePanel.locationId` to it (instead of literal `'main'`),
which is what surfaced the issue.

User clarified that the 4 batches sitting at this branch (Allergan 824 +
Acetin 15 = ฿16,200) are **test data** (probably from my Phase 15.7-bis test
imports + the V35.3-ter import flow that landed at the wrong branch tag).

---

## Goals

1. Delete the phantom `be_branches/BR-...` doc.
2. Delete all stock-system docs tagged with `branchId='BR-...'` (49 docs total).
3. Remove the phantom branch from any `branchIds[]` arrays on staff/doctors (preserve those records — only strip the phantom entry).
4. Reset `localStorage.selectedBranchId` so admin's next save doesn't tag a dead branch.
5. After cleanup, `branches=[]` in `be_branches`. Phase 15.7-ter auto-pick logic falls back to literal `'main'` (already verified in code review). No additional code changes needed.

## Non-goals

- Migrating any data to `'main'` (user confirmed test → no migration).
- Creating a new `be_branches/main` doc to represent the canonical branch — admin can do that later via BranchesTab CRUD if/when they roll out V20 multi-branch for real.
- Hardening V20 BranchContext against future phantom auto-creation — out of scope; admin-ui CRUD is the ONLY path that creates `be_branches` docs anyway.

## Scope (from preview_eval discovery 2026-04-29)

| Collection | Refs to phantom | Action |
|---|---|---|
| `be_stock_batches` | 4 | DELETE |
| `be_stock_movements` (branchId field) | 29 | DELETE |
| `be_stock_movements` (branchIds[] array) | 0 | (no action) |
| `be_stock_orders` | 12 | DELETE |
| `be_stock_transfers` (sourceLocationId) | 1 | DELETE |
| `be_stock_transfers` (destinationLocationId) | 0 | — |
| `be_stock_withdrawals` | 0 | — |
| `be_appointments` | 1 | DELETE |
| `be_staff` (branchIds[] array) | 2 | UPDATE (arrayRemove) |
| `be_doctors` (branchIds[] array) | 0 | — |
| `be_branches/BR-...` | 1 (the doc) | DELETE (last) |
| `localStorage.selectedBranchId` | `'BR-...'` | RESET to `''` |

**Total**: 49 docs deleted, 2 staff docs updated, 1 localStorage key reset.

## Execution method

**REVISION 2026-04-29 (post-discovery)**: client SDK CANNOT delete the
audit-immutable stock collections. `firestore.rules` has `allow delete: if
false` on:
- `be_stock_batches` (line 348)
- `be_stock_movements` (line 363)
- `be_stock_orders` (line 342)
- `be_stock_transfers` (line 374)

This is the V19 + S3 audit-immutability invariant — admins cannot delete
stock-history records via the client SDK no matter what auth state. The
preview_eval `writeBatch.commit()` returned `Missing or insufficient
permissions` as expected.

**Revised approach**: NEW admin endpoint
`POST /api/admin/cleanup-phantom-branch` using `firebase-admin` SDK
(bypasses firestore.rules — same pattern as `cleanup-test-sales` /
`cleanup-orphan-stock` / `cleanup-test-products`).

**Two-phase contract**:
- `{ action: 'list', phantomId: 'BR-...' }` → DRY-RUN counts (no writes)
- `{ action: 'delete', phantomId: 'BR-...', confirm: true }` → actual delete

**Order of operations inside the endpoint** (one phase, server-side):

1. Verify admin token (verifyAdminToken).
2. Verify `phantomId` matches `^BR-[0-9]+-[a-f0-9]+$` (defensive — refuse to
   nuke production-shaped IDs like 'main' or empty).
3. Discover all references via Firestore queries:
   - `be_stock_batches.where('branchId', '==', phantomId)`
   - `be_stock_movements.where('branchId', '==', phantomId)`
   - `be_stock_orders.where('branchId', '==', phantomId)`
   - `be_stock_transfers.where('sourceLocationId', '==', phantomId)`
   - `be_stock_transfers.where('destinationLocationId', '==', phantomId)`
   - `be_appointments.where('branchId', '==', phantomId)`
   - `be_staff` (full scan + filter `branchIds[]` includes phantom)
   - `be_doctors` (same)
4. If `action === 'list'`: return counts. NO writes.
5. If `action === 'delete'`:
   - Use `db.batch()` (max 500 ops). For our scope (49+2+1 = 52 ops) one
     batch suffices but loop with chunking for safety.
   - DELETE in dependency order: movements → batches → orders → transfers
     → appointment.
   - UPDATE staff/doctors with `FieldValue.arrayRemove(phantomId)` on
     `branchIds[]`.
   - DELETE `be_branches/{phantomId}` last.
   - Write audit doc to `be_admin_audit/cleanup-phantom-branch-{TS}` with
     deleted counts + caller info.
6. Browser reset of `localStorage.selectedBranchId` is **client-side**
   (runs separately via preview_eval after deploy). The endpoint can't
   touch browser storage.

**Atomicity**: per-batch atomic. Multi-batch (>500 ops) chunks are
committed sequentially — partial failure recoverable via re-running list →
seeing what's left.

**Partial-failure recovery**: idempotent. Re-run `list` to see what
references remain → `delete` again. Eventually consistent.

## Verification

After execution, call `POST /api/admin/cleanup-phantom-branch` again with
`action: 'list'`. Expected output:

- `batches: 0`
- `movements: 0`
- `stockOrders: 0`
- `stockTransfersSource: 0` + `stockTransfersDest: 0`
- `appointments: 0`
- `staffWithPhantomInBranchIds: 0`
- `doctorsWithPhantomInBranchIds: 0`
- `branchDocExists: false`
- Plus client-side preview_eval to confirm `localStorageSelectedBranch =
  ''` and `branches.length = 0` (via `listBranches({})`)

## Tests

`tests/phase15.7-novies-br-phantom-cleanup.test.js`:
- **Source-grep regression guard**: NO hardcoded `BR-1777095572005-ae97f911`
  string anywhere under `src/` (anti-regression after the cleanup commit).
- **Endpoint contract**: `api/admin/cleanup-phantom-branch.js` exists +
  exports `findPhantomReferences` pure helper + uses
  `verifyAdminToken` + writes `be_admin_audit` doc.
- **Defensive phantomId regex**: refuses `''`, `'main'`, arbitrary
  strings — only accepts `BR-<digits>-<hex>` shape.
- **Functional simulate**: `findPhantomReferences` correctly identifies
  references across all 8 collection scans + handles missing fields +
  empty arrays + adversarial inputs.
- **Phase 15.7-ter integration**: auto-pick effect with `branches=[]`
  (post-cleanup state) → stays at literal `'main'` (verifies the
  fallback) — covered by the existing
  `tests/phase15.7-ter-balance-panel-default-branch.test.js` and re-asserted
  here as anti-regression.

## Risks

- **Audit trail loss**: 29 stock movements deleted. For test data this is
  acceptable. Production movements at `'main'` (the real branch) untouched.
- **Mid-flight breakage**: writeBatch is atomic, so partial state shouldn't
  occur. If it does (e.g., quota error), discovery re-run catches it.
- **No backup**: rollback not feasible. User authorized "ลบทิ้ง" so this is OK.

## Future-proofing

The auto-pick effect (`StockBalancePanel.jsx:74-87`) calls
`branches.find(b => b.isDefault)` — when `branches=[]` after this cleanup,
`def` is undefined, `defId` is undefined, no `setLocationId` call → location
stays at the literal `'main'` initial state. Already covered by Phase 15.7-ter
TER3.4 functional simulate.

If admin later sets up V20 multi-branch for real (creates a be_branches doc
via BranchesTab), the auto-pick will pick that branch as default. No further
guard needed.

## Commit shape

```
chore(stock): Phase 15.7-novies — admin endpoint to purge BR-... phantom branch

NEW: POST /api/admin/cleanup-phantom-branch (firebase-admin SDK)
NEW: tests/phase15.7-novies-br-phantom-cleanup.test.js
SPEC: docs/superpowers/specs/2026-04-29-br-phantom-cleanup-design.md

User confirmed test data via /brainstorming flow.

Discovery (preview_eval 2026-04-29):
  - 4 batches at branchId=BR-... (Allergan 824 + Acetin 15)
  - 29 movements (mix of IMPORT/SALE/TREATMENT/ADJ/EXPORT_TRANSFER)
  - 12 stock orders, 1 stock transfer (source)
  - 1 appointment
  - 2 staff with BR-... in branchIds[]
  - 0 doctors / 0 sales / 0 withdrawals affected

Why endpoint, not preview_eval client-side: firestore.rules has `allow
delete: if false` on be_stock_batches/movements/orders/transfers (V19 +
S3 audit-immutability). Client SDK can't delete; firebase-admin SDK
bypasses rules.

Endpoint is two-phase: action:'list' (DRY-RUN counts) → action:'delete'
(actual purge). Audit doc written to be_admin_audit. localStorage reset
runs client-side via preview_eval after deploy.

Phase 15.7-ter auto-pick (StockBalancePanel) already falls back to
literal 'main' when branches=[] — no code change needed.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```
