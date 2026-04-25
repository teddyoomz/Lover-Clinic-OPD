# Firestore Rules Audit — 2026-04-26

> Audit run after Phase 14.7.F shipped (`93fffca`) to confirm no other
> "Missing or insufficient permissions" bugs of the same shape lurk in
> the codebase. Triggered by user directive: "เช็ค Firestore rules
> ทั้งระบบ ว่าจะไม่มีตรงไหนติด permission อีก ทั้ง frontend แลพ backend".

## TL;DR

**ZERO additional bugs found.** The codebase is compliant. The 14.7.F fix
(narrow `be_stock_movements` `update` to allow only `reversedByMovementId`)
was the only violation of the audit-immutable pattern. Every other locked
collection is touched only by `create` operations (matching the rule's
`allow create: if isClinicStaff()` clause).

## Pattern A — audit-immutable collections (`allow update, delete: if false`)

| Collection | Rule line | Write callers found | Verdict |
|---|---|---|---|
| `be_wallet_transactions` | 108-112 | `setDoc(walletTxDoc(newId), {...})` × 4 (lines 1997, 2044, 2090, 2138) — all CREATE with fresh IDs | ✅ OK |
| `be_point_transactions` | 116-120 | `setDoc(pointTxDoc(newId), {...})` × 3 (lines 2489, 2556, 2596) — all CREATE | ✅ OK |
| `be_stock_adjustments` | 260-264 | `tx.set(stockAdjustmentDoc(newId), {...})` × 1 (line 3180) — CREATE inside tx | ✅ OK |
| `be_stock_movements` | 245-259 | `tx.update(movRef, { reversedByMovementId })` (line 3564) + `updateDoc(movRef, { reversedByMovementId })` (line 3516) | ✅ OK after 14.7.F (rule narrowed to allow ONLY `reversedByMovementId` field) |
| `be_stock_orders` (delete only) | 233-238 | No `deleteDoc(stockOrderDoc(...))` | ✅ OK |
| `be_stock_batches` (delete only) | 239-244 | No `deleteDoc(stockBatchDoc(...))` | ✅ OK |
| `be_stock_transfers` (delete only) | 265-270 | No `deleteDoc(stockTransferDoc(...))` (only status flips via `tx.update`, allowed) | ✅ OK |
| `be_stock_withdrawals` (delete only) | 271-275 | No `deleteDoc(stockWithdrawalDoc(...))` | ✅ OK |
| `be_central_stock_warehouses` (delete only) | 276-281 | Zero writes anywhere in codebase | ✅ OK |

## Pattern B — unauth callers writing to staff-gated collections

| Caller path | Writes to | Rule status | Verdict |
|---|---|---|---|
| `api/webhook/{facebook,line,send,saved-replies}.js` | `chat_conversations` + `messages` subcoll | `allow create, update: if true` | ✅ OK |
| `api/proclinic/*.js` | `pc_*` mirror collections | `allow write: if true` | ✅ OK |
| `api/admin/users.js` | (Firebase Admin SDK only — no Firestore writes) | n/a | ✅ OK |
| `cookie-relay/` Chrome extension | `clinic_settings/proclinic_session{,_trial}` | `allow read, write: if true` | ✅ OK |
| `src/pages/PatientForm.jsx` (anon-auth public link) | `opd_sessions` (create) | `allow create: if true` | ✅ OK |
| `src/pages/ClinicSchedule.jsx` (anon-auth public link) | `clinic_schedules` | `allow write: if isSignedIn()` (anon counts as signed-in) | ✅ OK |

No new unauth path writes to a staff-gated collection.

## Pattern C — cross-collection transactions (17 audited)

All 17 `runTransaction` blocks read/write only collections with consistent
auth requirements. No transaction tries to write to a collection with
stricter rules than another collection in the same tx.

Notable transactions:
- `_reverseOneMovement` (line 3524) — touches `be_stock_batches` (full update OK) + `be_stock_movements` (narrowed update). Both pass with `isClinicStaff()` and the field-key constraint on movements.
- `promoteTransferShipment` / `confirmTransferReceipt` — touches `be_stock_transfers` + `be_stock_batches` + `be_stock_movements`. All consistent.
- `topUpWallet` / `deductWallet` / `addWalletAdjustment` / `addMembershipMoneyAdjustment` — touches `be_customer_wallets` + `be_wallet_transactions`. Both `isClinicStaff()`.
- `createStockAdjustment` — touches `be_stock_batches` + `be_stock_movements` + `be_stock_adjustments`. All consistent.

## Residual low-level monitoring (not bugs)

- **Point transactions are NOT wrapped in `runTransaction`** — `recordPointEarn` / `applyPointAdjustment` / `reversePointTx` use `setDoc` for the audit log + a separate `updateDoc` on the customer doc. If the customer write fails after the log lands, the log is authoritative but the customer summary drifts. Console-error monitoring is in place at lines 2512, 2572. **Not a permission issue** — the existing rules permit both writes — just an atomicity note for a future refactor.

- **Movements are immutable EXCEPT `reversedByMovementId`** — by design (Phase 14.7.F). Any future code that tries to update a different field on a movement will hit `Missing or insufficient permissions`. Test guard `S3.1` in `tests/treatment-stock-diff.test.js` locks the rule shape to prevent accidental relaxation.

## How to re-run this audit

1. `Read firestore.rules` end-to-end, list every `match /collection/{id}` rule.
2. For each collection with `if false` updates / deletes, grep:
   - `updateDoc(<collection>...)`
   - `tx.update(<collection>...)`
   - `setDoc(<collection>..., {merge: true})`
   - `deleteDoc(<collection>...)`
   in `src/` + `api/`.
3. For each rule with `if isClinicStaff()`, scan unauth-context callers (`api/`, browser without sign-in) for writes targeting that collection.
4. For each `runTransaction(db, ...)`, list collections inside; ensure rules permit the auth context for every collection involved.

A Phase 14.x audit skill (`/audit-firestore-correctness` is the closest existing one) could automate this; consider adding a dedicated `/audit-rules-vs-callers` skill if more bugs of this shape surface.
