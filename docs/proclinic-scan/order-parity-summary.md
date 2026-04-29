# Phase 16.4 Order tab — ProClinic parity intel (READ-ONLY map, 2026-04-29)

> **Constraint locked by user**: ห้ามเปลี่ยน wiring ของระบบเดิม. เอกสารนี้เป็น **intel เท่านั้น** ไม่ใช่ implementation plan. ถ้า user ตัดสินใจอยากได้ feature ไหน ค่อยมาทำเป็น "เสริม" (additive wiring เข้าระบบเดิม) — แต่ default = **ไม่ทำอะไร**.

## ProClinic routes captured

| Route | Title (TH) | Saved to docs/proclinic-scan/ |
|---|---|---|
| `/admin/order` | รายการนำเข้าสินค้า | `admin-order-list.json` (35.7 KB) |
| `/admin/order/create` | นำเข้าสินค้า | `admin-order-create.json` (36.1 KB) |
| `/admin/central-stock/order` | รายการนำเข้าสินค้า (คลังสินค้ากลาง) | `admin-central-stock-order-list.json` (39.3 KB) |
| `/admin/central-stock/order/create` | นำเข้าสินค้า (คลังสินค้ากลาง) | `admin-central-stock-order-create.json` (37.8 KB) |

## Our existing surface

| File | Phase trail | Status |
|---|---|---|
| `src/components/backend/OrderPanel.jsx` | 8d → 14.7.H → 15.4 → 15.6 → 15.7-bis | ✅ shipped, mature |
| `src/components/backend/CentralStockOrderPanel.jsx` | 15.2 → 15.4 → 15.6 → 15.7-bis | ✅ shipped, mature |
| `src/components/backend/OrderDetailModal.jsx` | 8d++ | ✅ shipped (edit cost/expiry post-receive when batch unused) |
| `src/components/backend/CentralOrderDetailModal.jsx` | 15.4 s22 | ✅ shipped |
| `src/lib/backendClient.js` exports | listStockOrders / createStockOrder / cancelStockOrder / updateStockOrder / getStockOrder / listCentralStockOrders / createCentralStockOrder / receiveCentralStockOrder / cancelCentralStockOrder | ✅ shipped |
| `src/lib/centralStockOrderValidation.js` | Phase 15.2 | ✅ shipped (shape + V14 undefined-strip) |

## Field-by-field parity table

### Order header (create form)

| ProClinic field | Branch /admin/order/create | Our OrderPanel | Central /admin/central-stock/order/create | Our CentralStockOrderPanel |
|---|---|---|---|---|
| `order_id` (auto-gen doc#) | ✅ | ✅ | ✅ | ✅ |
| `vendor_name` REQ | ✅ | ✅ (`vendorName`) | ✅ | ✅ (`vendorId` + `vendorName`) |
| `order_date` REQ | ✅ | ✅ (`importedDate`) | ✅ | ✅ (`importedDate`) |
| `note` | ✅ | ✅ | ✅ | ✅ |
| `discount` | ✅ | ❓ **backend supports, branch UI doesn't surface** | ✅ | ✅ surfaced |
| `discount_type` (% / บาท) | ✅ | ❓ **backend supports, branch UI doesn't surface** | ✅ | ✅ surfaced |
| `central_stock_id` REQ (warehouse picker) | — n/a | — n/a | ✅ | ✅ (passed as prop `centralWarehouseId`, contextual UX) |

### Line item

| ProClinic field | Both /admin/*/create forms | Our both panels |
|---|---|---|
| `product_id` REQ | ✅ | ✅ (`ProductSelectField`) |
| `unit_name[]` + `unit_amount[]` | ✅ | ✅ (`UnitField` + `listProductUnitGroups`) |
| `qty[]` | ✅ | ✅ |
| `cost[]` | ✅ | ✅ |
| `expiration_date` | ✅ | ✅ (`expiresAt`) |
| `is_premium` (สินค้าของแถม / free gift) | ✅ | ✅ (UI exposes per item — line 389/402/459) |

### List page table columns

| ProClinic column | Branch /admin/order | Our OrderPanel list | Central /admin/central-stock/order | Our CentralStockOrderPanel list |
|---|---|---|---|---|
| เลขเอกสาร | ✅ | ✅ | ✅ | ✅ |
| คลัง/สาขา | — | — n/a | ✅ | ✅ |
| คู่ค้า | ✅ | ✅ | ✅ | ✅ |
| วันที่นำเข้า | ✅ | ✅ | ✅ | ✅ |
| รายการสินค้า | ✅ | ✅ (`formatOrderItemsSummary`) | ✅ | ✅ |
| ต้นทุนนำเข้า | ✅ | ✅ | ✅ | ✅ |
| หมายเหตุ | ✅ | ✅ | ✅ | ✅ |
| สถานะ | ✅ | ✅ (status badge) | ✅ | ✅ (5-status badge: pending/partial/received/cancelled/cancelled_post_receive) |
| **หมายเหตุยกเลิก** | ✅ | ❓ **need verify visibility** (cancelReason persisted in be_stock_orders) | ✅ | ❓ **need verify** |

### List page filter form

| ProClinic filter | Branch /admin/order | Our OrderPanel | Central /admin/central-stock/order | Our CentralStockOrderPanel |
|---|---|---|---|---|
| `q` (text search) | ✅ | ✅ | ✅ | ✅ |
| `status` (select) | ✅ | ❌ **only inline status badge per row, no filter dropdown** | ✅ | ❌ **same gap** |
| `cost_type` (select) | ✅ | ❌ **not present** | ✅ | ❌ **not present** |
| `period` (date range) | ✅ | ❓ need verify | ✅ | ❓ need verify |
| `stock_id` (warehouse filter) | — n/a | — n/a | ✅ | — n/a (single-warehouse context) |

### Edit-after-receive flow

| ProClinic feature | Branch /admin/order POST `/admin/order-product` | Our OrderDetailModal | Central |
|---|---|---|---|
| Edit `cost` post-receive | ✅ | ✅ (line 57-58 — when batch unused) | ✅ |
| Edit `expiration_date` post-receive | ✅ | ✅ (line 57-58 — when batch unused) | ✅ |
| Block when batch consumed | ❓ | ✅ (consumption check via `listStockMovements` filter `type !== 1`) | ✅ |
| Edit `vendorName` / `note` | ❓ (not in capture) | ✅ | ✅ |

### Cancellation

| ProClinic feature | POST `/admin/order/cancel` | Our backend |
|---|---|---|
| `order_id` | ✅ | ✅ |
| `canceled_detail` (note) | ✅ | ✅ (`reason` → persisted as `cancelReason`) |
| Status flip pending → cancelled | ✅ | ✅ (+ `cancelled_post_receive` if any qty already received — extra beyond ProClinic) |

## Gap candidates (purely informational — NOT a recommendation)

If user later decides to ship any of these as **additive features**, this is the menu. Each is independent and **pluggable into existing wiring** (no rewrite of OrderPanel logic — just expose UI controls already plumbed into `createStockOrder` / `listStockOrders`).

| Gap | Effort | Risk to existing system | Notes |
|---|---|---|---|
| **G1.** Branch OrderPanel — surface `discount` + `discountType` in create form | XS | Zero (backend already accepts; just add 2 inputs in OrderCreateForm + include in payload at line 447) | Already done in CentralStockOrderPanel — copy that UI block |
| **G2.** OrderPanel list — `status` filter dropdown | XS | Zero (filter in-memory after `listStockOrders` returns; no backend change) | Mirror SaleTab pattern |
| **G3.** OrderPanel list — `cost_type` filter (with-cost / premium-only / no-cost) | XS | Zero (in-memory filter on items[].isPremium / items[].cost) | Trivial |
| **G4.** OrderPanel list — `cancelReason` column visibility | XS | Zero (data already on doc; just add `<td>{o.cancelReason}</td>`) | Trivial |
| **G5.** Same gaps mirrored on CentralStockOrderPanel | XS | Zero | Same pattern |
| **G6.** OrderPanel list — `period` date-range filter | S | Zero (in-memory filter on `importedDate`) | Probably already there — verify before claiming |

**ALL G1-G6 are additive.** None requires changing how `createStockOrder` / `listStockOrders` work, none requires firestore.rules changes, none requires schema migration.

## What we have that ProClinic does NOT

(Just for context — these are our UX wins, no action.)

| Feature | Where | Why |
|---|---|---|
| `ActorPicker` (ผู้ทำรายการ required for create + cancel + receive) | Both panels | MOPH audit trail — who did what |
| Auto-repay banner for negative balances | Both panels (Phase 15.7-bis) | When new order qty settles existing AUTO-NEG batches at same product+branch |
| `cancelled_post_receive` status (vs plain `cancelled`) | backend | Distinguishes "cancelled before any receive" from "cancelled after partial receive" |
| `Pagination` (20/page) | Both panels | ProClinic shows everything in one big list — slow on 1000+ orders |
| `OrderDetailModal` consumption tracker | Branch | Per-batch usage count + total out — admin sees if a batch is "safe to edit cost" before opening edit |
| Search across vendor/order_id/product simultaneously | Both panels | ProClinic's `q` field is single-target |
| Branch-context auto-scoping via `useSelectedBranch` | OrderPanel | ProClinic shows ALL branches in one list (we filter to selected branch) |
| `is_premium` line items support sale-disabled at sale-time | Sale + treatment paths | Keeps free-gift items separate from sellable inventory |

## Decision

**No code changes proposed.** This is a pure intel dump. User decides:
- Ship any of G1-G6? (all XS effort, zero risk)
- Verify the "❓" cells (period filter, cancelReason column) before deciding?
- Or park Phase 16.4 entirely (system already covers ProClinic's surface area at the data level)?

Refer to the 4 saved JSON captures for any deeper questions.