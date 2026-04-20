# LoverClinic OPD System — Codebase Map
> อัพเดทล่าสุด: 2026-04-18 (Phase 8f/8g/8h complete — Transfer + Withdrawal + Central warehouses + 7 sub-tabs in StockTab)
> Stack: React 19 + Vite 8 + Firebase 12 (Firestore + FCM) + Tailwind CSS 3.4 + Cloud Functions v2
> Firebase Project: `loverclinic-opd-4c39b`

---

## 📁 โครงสร้างไฟล์

```
functions/
├── index.js                    — Cloud Function: onPatientSubmit (Firestore trigger → FCM push)
├── package.json                — node 20, firebase-functions v6, firebase-admin v12
firebase.json                   — Firebase deploy config (functions source)
.firebaserc                     — Firebase project: loverclinic-opd-4c39b
public/
├── firebase-messaging-sw.js    — Service Worker รับ push ขณะ app ปิด/หน้าจอล็อค
├── manifest.json               — PWA manifest สำหรับ iOS "เพิ่มลงหน้าจอ"
src/
├── main.jsx                    — Entry point
├── App.jsx                     — Root routing + auth + clinic settings
├── firebase.js                 — Firebase init, exports: app, auth, db, appId
├── constants.js                — SESSION_TIMEOUT_MS, DEFAULT_CLINIC_SETTINGS, PRESET_COLORS
├── utils.js                    — Helper functions, defaultFormData, clinical logic
├── hooks/
│   └── useTheme.js             — Dark/Light/Auto theme hook
├── components/
│   ├── ClinicLogo.jsx          — Logo component (custom URL / /logo.jpg / text fallback)
│   ├── ThemeToggle.jsx         — Theme toggle button
│   ├── ClinicSettingsPanel.jsx — Admin settings panel (clinic name, color, logo, doctor hours, practitioner settings, ProClinic credential reload, Master Data Sync) — all CSS-var theme-aware
│   ├── CustomFormBuilder.jsx   — Admin form builder for custom templates — all CSS-var theme-aware, responsive layout
│   ├── ChatPanel.jsx           — Chat FB/LINE: reply (FB only), echo, saved replies, history pagination
│   ├── TreatmentTimeline.jsx   — Treatment records: paginated list, expandable detail, inline edit/delete (Phase 2)
│   ├── TreatmentFormPage.jsx   — Full-page treatment create form: mirrors ProClinic layout (Phase 2)
│   ├── PrintTemplates.jsx      — OfficialOPDPrint + DashboardOPDPrint components
│   └── backend/                — Backend Dashboard components (ระบบหลังบ้าน)
│       ├── CloneTab.jsx        — Tab "Clone ลูกค้า": search ProClinic + clone progress UI
│       ├── CustomerCard.jsx    — Reusable card: customer info display (search/cloned modes)
│       ├── CustomerListTab.jsx — Tab "ข้อมูลลูกค้า": card grid of cloned customers + filter
│       ├── MasterDataTab.jsx   — Tab "ข้อมูลพื้นฐาน": sync buttons + 5 sub-tabs (Products/Doctors/Staff/Courses/Promotions) + data table + search/filter
│       ├── AppointmentTab.jsx  — Tab "นัดหมาย": resource time grid (room columns × time rows) + create/edit modal
│       ├── SaleTab.jsx         — Tab "ขาย/ใบเสร็จ": invoice list + create/edit form (buy modals, billing, sellers, payment)
│       ├── FinanceTab.jsx      — Tab "การเงิน" (Phase 7): 4 sub-tabs (Deposit/Wallet/Membership/Points) — ALL wired
│       ├── DepositPanel.jsx    — Deposit CRUD: list + create/edit overlay (with optional appointment sub-form) + cancel/refund/detail
│       ├── DepositPicker.jsx   — Reusable picker: reads `be_deposits` via getActiveDeposits, multi-select with per-deposit amount + max cap (used in SaleTab + TreatmentFormPage billing)
│       ├── WalletPanel.jsx     — Wallet CRUD: customer wallet cards + top-up + adjust ± + transaction history modal
│       ├── WalletPicker.jsx    — Reusable single-wallet picker: reads `be_customer_wallets`, edit-mode cap = balance + initiallyApplied
│       ├── MembershipPanel.jsx — Card-types gradient grid + sold-memberships list + sell form (with wallet credit + initial points side-effects) + renew + cancel modals
│       └── PointsPanel.jsx     — Loyalty point cards (balance + membership badge) + adjust (±) + transaction history modal
├── lib/
│   ├── brokerClient.js         — API client wrapper for /api/proclinic/* (existing)
│   ├── backendClient.js        — Firestore CRUD for be_* collections + master data read/sync + Phase 7:
│   │                             deposit (CRUD + apply/reverse transactional)
│   │                             wallet  (ensure/topUp/deduct/refund/adjust transactional + WTX records)
│   │                             membership (create with wallet+points side-effects + renew + cancel + lazy expire)
│   │                             points (earn/adjust/reverse + PTX log + denorm finance.loyaltyPoints)
│   │                             manual master items (createMasterItem/update/delete for wallet_types + membership_types)
│   ├── financeUtils.js         — Pure calc: calcDepositRemaining, calcDepositStatus, calcSaleBilling, calcPointsEarned, calcMembershipExpiry, isMembershipExpired, fmtMoney, fmtPoints (Phase 7)
│   ├── stockUtils.js           — Phase 8a: Pure stock qty/allocation helpers. Exports: DEFAULT_BRANCH_ID, MOVEMENT_TYPES (1..14 enum), TRANSFER_STATUS (0..4), WITHDRAWAL_STATUS (0..3), BATCH_STATUS. Functions: deductQtyNumeric, reverseQtyNumeric, buildQtyNumeric, formatStockQty, hasExpired, daysToExpiry, isBatchDepleted, isBatchAvailable, batchFifoAllocate (FIFO/FEFO/LIFO + exactBatchId first)
│   └── cloneOrchestrator.js    — 5-step clone orchestrator: profile → courses → treatments list → treatment details → finalize
└── pages/
    ├── AdminLogin.jsx          — Login page
    ├── AdminDashboard.jsx      — Admin main page (queue, history, deposit, appointment, settings, หลังบ้าน nav)
    ├── BackendDashboard.jsx    — Backend admin page (/?backend=1, new tab) — Clone + Customer list
    ├── ClinicSchedule.jsx      — Public schedule page (/?schedule=<token>) — calendar + time slots
    └── PatientForm.jsx         — Patient intake/follow-up form (QR scan target)
api/webhook/                    — Chat webhook endpoints (FB/LINE)
├── facebook.js                 — FB webhook handler + processEchoMessage() for echo events
├── line.js                     — LINE webhook handler
├── send.js                     — Send messages to FB/LINE (Graph API v25)
└── saved-replies.js            — GET endpoint proxying FB saved_message_responses
api/proclinic/                  — Vercel Serverless Functions (7 consolidated endpoints)
├── customer.js                 — actions: create, update, delete, search, fetchPatient. Backups to `pc_customers/{proClinicId}` on create + fetchPatient
├── deposit.js                  — actions: submit, update, cancel, options (รวมจาก deposit-*.js). Options action backups to `pc_form_options/deposit` in Firestore
├── connection.js               — actions: login, credentials, clear (รวมจาก login/credentials/clear-session.js)
├── appointment.js              — actions: create, update, delete, listByCustomer. Key functions: handleCreate, handleUpdate, handleDelete, handleListByCustomer, mapAppointment. Uses FullCalendar range query (start/end) for listing. Backups to `pc_customer_appointments/{customerId}`
├── courses.js                  — actions: default(courses), sync-appointments, fetch-appointment-months. Backups to `pc_courses/{proClinicId}` + `pc_appointments/{YYYY-MM}` + `pc_customer_appointments/{customerId}`
├── master.js                   — actions: syncProducts, syncDoctors, syncStaff, syncCourses (Master Data Sync)
├── treatment.js                — actions: list, get, getCreateForm, create, update, delete (Treatment Records Phase 2)
└── _lib/ (session.js, scraper.js, fields.js, auth.js — fields.js has reverseMapPatient())
```

---

## 🔥 Firestore Collection Path

```
artifacts/{appId}/public/data/
├── opd_sessions/{sessionId}    — Session documents
│     fields: status, patientData, createdAt, updatedAt, submittedAt,
│             isUnread, isArchived, archivedAt, isPermanent,
│             formType, customTemplate, sessionName,
│             depositData, depositSyncStatus, depositSyncError, depositSyncAt,
│             depositProClinicId, serviceCompleted, serviceCompletedAt,
│             appointmentData, appointmentProClinicId, appointmentSyncStatus, appointmentSyncError
├── clinic_settings/main        — Clinic config (clinicName, accentColor, logoUrl, clinicSubtitle)
├── form_templates/{id}         — Custom form templates
├── be_customers/{proClinicId}  — Backend: cloned customer data (patientData, courses, appointments, treatmentSummary, finance.{depositBalance, walletBalances, totalWalletBalance, loyaltyPoints, membershipId, membershipType, membershipExpiry, membershipDiscountPercent})
├── be_treatments/{treatmentId} — Backend: cloned treatment details (customerId, detail with vitals/OPD/meds/images)
├── be_deposits/{depositId}     — Phase 7: DEP-<ts> docs — amount, usedAmount, remainingAmount, refundAmount, status, sellers[], usageHistory[{saleId, amount, date}], optional appointment sub-doc
├── be_customer_wallets/{id}    — Phase 7: composite id `${customerId}__${walletTypeId}` — balance, totalTopUp, totalUsed
├── be_wallet_transactions/{id} — Phase 7: WTX-<ts> — type (topup/deduct/refund/adjust/membership_credit), amount, balanceBefore/After, referenceType/Id
├── be_memberships/{id}         — Phase 7: MBR-<ts> — cardTypeId/Name, purchasePrice, initialCredit, discountPercent, initialPoints, bahtPerPoint, walletTypeId, activatedAt, expiresAt, renewals[], walletTxId, pointTxId, sellers[]
├── be_point_transactions/{id}  — Phase 7: PTX-<ts> — type (earn/redeem/adjust/membership_initial/reverse/expire), amount, pointsBefore/After, referenceType/Id, purchaseAmount, bahtPerPoint
├── be_stock_orders/{orderId}   — Phase 8a: ORD-<ts>-<rand> — vendor imports. Fields: vendorName, importedDate, branchId, note, discount, discountType, items[{orderProductId, batchId, productId, qty, cost, expiresAt, isPremium, unit}], status='active'|'cancelled', createdBy/cancelledBy
├── be_stock_batches/{batchId}  — Phase 8a: BATCH-<ts>-<rand> — FIFO lot (linchpin). Fields: productId, productName, branchId, orderProductId, sourceOrderId, sourceBatchId?, receivedAt, expiresAt, unit, qty:{remaining,total} NUMERIC, originalCost, isPremium, status='active'|'depleted'|'cancelled'|'expired'
├── be_stock_movements/{id}     — Phase 8a: MVT-<ts>-<rand> — IMMUTABLE append-only log. Fields: type (1..14 ProClinic enum), batchId, productId, qty (signed), before, after, branchId, sourceDocPath, linkedSaleId?|linkedTreatmentId?|linkedOrderId?|linkedAdjustId?|linkedTransferId?|linkedWithdrawalId?, revenueImpact, costBasis, isPremium, skipped?, reversedByMovementId?, user:{userId,userName}, note, createdAt
└── be_stock_adjustments/{id}   — Phase 8a: ADJ-<ts>-<rand> — manual +/-. Fields: batchId (required), type:'add'|'reduce', qty, note, branchId, user, movementId, createdAt
```

### Phase 8 backendClient stock primitives (line ~1720+)
- `getStockBatch(batchId)` / `listStockBatches({productId?, branchId?, status?})` — read helpers
- `getStockOrder(orderId)` / `listStockOrders({branchId?, status?})` — read helpers sorted by importedDate DESC
- `listStockMovements(filters)` — query by any linkedId or batchId/productId/branchId/type; `includeReversed` flag (default false) hides both sides of a reversed pair (reversedByMovementId OR reverseOf set)
- `createStockOrder(data, {user})` — creates order + N batches + N type=1 movements. Validates qty>0, allows isPremium flag, costBasis=cost*qty on every movement.
- `cancelStockOrder(orderId, {reason, user})` — BLOCKED if any batch has non-import movement (ProClinic parity). Else: marks order+batches cancelled + emits type=14 movements. Idempotent.
- `updateStockOrder(orderId, patch)` — allows note/vendorName/discount + per-item cost/expiresAt. qty edits THROW. Cancelled orders THROW. Cost updates cascade to batch.originalCost.
- `createStockAdjustment({batchId, type, qty, note, branchId}, {user})` — runTransaction: read batch → verify → mutate qty → write movement + adjustment doc. Blocks on cancelled batches. Transactional rollback on insufficient qty.

### Phase 8b sale/treatment stock integration (same file, +450 LoC)
- `_normalizeStockItems(items)` / `_getProductStockConfig(productId)` / `_deductOneItem(...)` / `_reverseOneMovement(...)` — internals
- `deductStockForSale(saleId, items, {customerId, branchId, user, movementType})` — per-item saga with compensation-on-failure. trackStock=false → skipped movement (audit, no batch touch). movementType defaults to 2 (SALE).
- `deductStockForTreatment(treatmentId, items, opts)` — mirror; default movementType=6 (TREATMENT), opts.movementType=7 for take-home meds.
- `reverseStockForSale(saleId, opts)` / `reverseStockForTreatment(treatmentId, opts)` — idempotent full reversal. Returns {reversedCount, skippedCount}.
- `analyzeStockImpact({saleId? | treatmentId?})` — returns {movements, batchesAffected, warnings, canReverseFully, totalQtyToRestore} — feeds the SaleTab cancel-confirmation modal.

### SaleTab.jsx hooks (Phase 8b UI)
- `handleSave` create branch (:484+): `deductStockForSale` right after `createBackendSale`. On throw → `deleteBackendSale` + re-throw with `ตัดสต็อกไม่สำเร็จ` error.
- `handleSave` edit branch (:440-500+): STEP 0 `reverseStockForSale` (idempotent) BEFORE reverse deposits/wallet/points. STEP 5b `deductStockForSale` AFTER `updateBackendSale`. On throw → `reverseStockForSale` rollback + re-throw.
- `handleDelete` (:600+): `reverseStockForSale` before `deleteBackendSale`. Hard error aborts the delete.
- Cancel modal (:955+): `reverseStockForSale` before `cancelBackendSale`. Hard error aborts the cancel.
- `analyzeSaleCancel` useEffect (:184): now also fetches `analyzeStockImpact` and merges into `cancelAnalysis.stockImpact` → modal shows batches-to-restore preview with canReverseFully flag.
- Single-branch scaffold constant `BRANCH_ID = 'main'` at top of file (mirrors DEFAULT_BRANCH_ID in stockUtils).

### TreatmentFormPage.jsx hooks (Phase 8c UI)
- Create (:1561+): after `createBackendTreatment` + `rebuildTreatmentSummary` → `deductStockForTreatment` with `{consumables, treatmentItems}` + optionally `medications` when `hasSale=false` (else auto-sale deducts meds).
- Edit saga (:1548+): BEFORE `updateBackendTreatment` → `reverseStockForTreatment` (idempotent). AFTER → `deductStockForTreatment` (same scope rules as create).
- Auto-sale create (:1603+): after `createBackendSale` with `grouped` items → `deductStockForSale(saleId, grouped)`. On fail → `deleteBackendSale(saleId)` + re-throw.
- Purchased items exclusion: treatment hook NEVER passes `purchasedItems` — they're already in `grouped.products` and handled by the sale hook. Prevents double-deduct.

### BackendDashboard.jsx hooks (Phase 8c UI)
- `onDeleteTreatment` (:230+): after reversing deposits/wallet/points/courses → `reverseStockForSale(linkedSaleId)` (if linkedSale exists) THEN `reverseStockForTreatment(treatmentId)`. Hard errors alert+abort the delete.

### StockTab container (Phase 8e+8i) — `src/components/backend/StockTab.jsx`
- Sub-tab nav: Balance (default) / Orders / Adjust / Movement Log
- Rose color accent, rounded pill buttons with glow-on-active
- Each sub-tab renders its own panel, independent state

### StockBalancePanel (Phase 8i) — `src/components/backend/StockBalancePanel.jsx`
- Reads active batches via `listStockBatches({branchId, status:'active'})`
- Groups by productId → totalRemaining, totalCapacity, valueCost (=remaining × originalCost), nextExpiry, expired qty
- FEFO ordering within each product (expiresAt ASC, null last)
- Filters: search, "ใกล้หมดอายุ ≤30 วัน", "สต็อกน้อย ≤5"
- Row tooltip: full batch list with IDs + expiry
- **Row quick-actions**: ปรับ (→ Adjust form pre-filled) / เพิ่ม (→ Order form pre-filled) — emits via onAdjustProduct/onAddStockForProduct callbacks to parent StockTab

### Phase 8f/8g/8h — multi-location stock (Transfer + Withdrawal + Central)

**backendClient.js additions (+~800 LoC):**
- Warehouses CRUD: `createCentralWarehouse` / `updateCentralWarehouse` / `deleteCentralWarehouse` (soft) / `listCentralWarehouses` / `getStockWarehouse` — docs in `be_central_stock_warehouses/{WH-ts-rand}`
- `listStockLocations()` — combined branches + centrals `[{id, name, kind}]` for transfer/withdrawal selectors. 'main' always first.
- `createStockTransfer` — status=0 at create, validates source batch + remaining; resolves item metadata (cost/expiry inherited for receive)
- `updateStockTransferStatus` — full state machine 0→1→2, 0|1→3, 1→4; 0→1 deducts source via per-batch tx + type=8 EXPORT_TRANSFER movements; 1→2 creates new dest batches (sourceBatchId back-ref) + type=9 RECEIVE; cancel/reject at status=1 reverses source via idempotent `_reverseOneMovement`
- `listStockTransfers({locationId, status})`, `getStockTransfer`
- `createStockWithdrawal` — mirror pattern; direction='branch_to_central'|'central_to_branch'
- `updateStockWithdrawalStatus` — state machine 0→1→2, 0|1→3; 0→1 deducts source + type=10 EXPORT_WITHDRAWAL; 1→2 creates dest batch + type=13 WITHDRAWAL_CONFIRM
- `listStockWithdrawals({locationId, status})`, `getStockWithdrawal`

**UI additions:**
- `StockTransferPanel.jsx` — list transfers w/ state-aware action buttons (ส่ง/รับ/ยกเลิก/ปฏิเสธ) + create form (src→dst location selectors, batch picker, qty per row)
- `StockWithdrawalPanel.jsx` — similar shape + direction radio (central→branch / branch→central)
- `CentralWarehousePanel.jsx` — warehouse card grid w/ CRUD (soft-delete), showInactive toggle
- `StockTab.jsx` — 7 sub-tabs now: Balance / Orders / Adjust / Transfer / Withdrawal / Warehouses / MovementLog

**Schema additions** (in master section):
```
be_stock_transfers/{TRF-ts-rand}   transferId, sourceLocationId, destinationLocationId, items: [{sourceBatchId, productId, qty, cost, expiresAt, isPremium, destinationBatchId?}], status 0..4, delivered{TrackingNumber,Note,ImageUrl}, canceledNote?, rejectedNote?, user, createdAt, updatedAt
be_stock_withdrawals/{WDR-ts-rand} withdrawalId, direction:'branch_to_central'|'central_to_branch', sourceLocationId, destinationLocationId, items[], status 0..3, canceledNote?, user, createdAt, updatedAt
be_central_stock_warehouses/{WH-ts-rand} stockId, stockName, telephoneNumber, address, isActive, createdAt, updatedAt
```

**firestore.rules**: new collections allow create/update by staff, DELETE BLOCKED (soft-delete only — audit trail).

### StockSeedPanel (Phase 8d++) — `src/components/backend/StockSeedPanel.jsx`
- One-click "opening balance" bulk-import from `master_data/products`
- Table: every product row with checkbox + qty + cost (default=master price) + unit + expiry + line total
- Filters: search, "เฉพาะที่ยังไม่มีสต็อก" (untracked-only)
- Auto-check include when qty > 0 (UX shortcut)
- "เลือก (ที่มี qty)" / "ยกเลิกทั้งหมด" bulk toggle
- Save → single `createStockOrder` with all included items → batches + auto-upsert stockConfig
- Entry points: OrderPanel header button "นำเข้าจากข้อมูลพื้นฐาน" + empty-state CTA

### StockAdjustPanel (Phase 8e) — `src/components/backend/StockAdjustPanel.jsx`
- List view: all be_stock_adjustments for branch, sorted by createdAt DESC
- Create form: product dropdown → batch dropdown (shows "…suffix — คงเหลือ X/Y unit (หมด date)") → radio add/reduce → qty → note
- Auto-picks first active batch when product selected
- Shows selected batch detail card (คงเหลือ / ทั้งหมด / ต้นทุน / หมดอายุ)
- Inline warning when reduce qty > remaining
- Calls `createStockAdjustment(...)` → movement type=3 (add) or type=4 (reduce)

### MovementLogPanel (Phase 8e) — `src/components/backend/MovementLogPanel.jsx`
- Read-only audit log of all be_stock_movements
- Filters: product, type-group (ProClinic enum: import/cancel-import/sale/adjust/treatment/export/receive/withdrawal), date-from, date-to, free-text search
- Checkbox "แสดง movement ที่ถูก reverse แล้ว" to include reversed pairs
- Summary chips show count per group
- Table: date/time / type badge / product+batch / signed qty / before / after / link (sale/treatment/order/adjust/transfer/withdrawal) + note
- REV / SKIP / ฟรี mini-badges for reverse-entries / skipped trackStock-false / isPremium

### OrderPanel (Phase 8d) — `src/components/backend/OrderPanel.jsx`
- List view: table of be_stock_orders filtered by branchId='main', sorted newest-first by importedDate. Columns: ORD-id / vendor / date / item count / ยอดรวม / status / cancel action.
- Create form overlay: vendor (text), importedDate (DateField ce), note (textarea), items grid (product dropdown from master_data/products, qty, unit, cost, expiresAt DateField, isPremium checkbox, line total, remove button), "+ เพิ่มรายการ" button.
- Client-side validation: vendor + date + at least 1 valid item (productId set AND qty>0). Disable save button until satisfied.
- On save: call `createStockOrder(data, {user})` → creates order doc + N batches + N type=1 IMPORT movements. Auto-upserts `stockConfig.trackStock=true` on master products that didn't have stockConfig yet (respects existing trackStock=false opt-outs).
- Cancel action: confirm dialog → `cancelStockOrder(orderId)` → blocked by backend if any batch has non-import movements.
- Wired into BackendDashboard as new tab `stock` with Package icon (rose color).

### Opt-in stock tracking (Phase 8d default fix)
- `_deductOneItem`: missing `stockConfig` (cfg===null) → skip with reason `'not-tracked'` + movement.skipped=true, note="product not yet configured for stock tracking".
- Previous behavior (pre-fix): threw "insufficient stock" when no batches existed → broke existing sale/treatment UI for cloned products that never had stockConfig.
- Test coverage: `phase8-sale-stock.test.js` [STK-S] skipped items — "missing stockConfig (unconfigured product) → skipped with reason 'not-tracked'" + auto-upsert tests (first-time set, existing trackStock=false respected).

### Chat Firestore path
```
artifacts/{appId}/public/data/chat_conversations/{recipientId}
  fields: platform (fb|line), displayName, pictureUrl, lastMessage, lastMessageAt, unread (boolean)
artifacts/{appId}/public/data/chat_conversations/{recipientId}/messages/{messageId}
  fields: text, sender (customer|admin|echo), timestamp, platform
```
- Chat history: 20 messages per page (pagination)
- Auto-delete messages older than 7 days
- Badge count = number of conversations with `unread: true` (not total messages)

### Push Notification Firestore path (new)
```
artifacts/{appId}/public/data/push_config/tokens
  fields: tokens: [{token: string, userAgent: string, createdAt: Timestamp}]
```
- เก็บ FCM device token ทุก device ที่เปิด push
- Cloud Function อ่าน tokens นี้แล้วส่ง multicast push
- Auto-clean token ที่หมดอายุ (invalid-registration-token)

### Session lifecycle
- สร้าง → `status:'pending', patientData:null`
- ผู้ป่วยกรอก → `status:'completed', patientData:{...}, isUnread:true, submittedAt`
- แพทย์อ่าน → `isUnread:false`
- ลบ (ไม่มีข้อมูล) → `deleteDoc` ทันที
- ลบ (มีข้อมูล) → `isArchived:true, archivedAt` (soft delete → ประวัติ)
- ลบถาวรจากประวัติ → `deleteDoc`
- หมดอายุ 2 ชม. + ไม่มีข้อมูล → auto `deleteDoc` (ใน onSnapshot)
- หมดอายุ 2 ชม. + มีข้อมูล → auto `isArchived:true` (ใน onSnapshot)
- Deposit: สร้างคิวจอง → `formType:'deposit', isPermanent:true, depositData:{...}`
- Deposit: "ลูกค้าเข้ารับบริการ" → `serviceCompleted:true` → ย้ายเข้าคิว (queue) ด้วย `isPermanent:false, createdAt:serverTimestamp()` (แปลงเป็น 2-hour link)
- Deposit: "ยกเลิกการจอง" → cancel deposit + delete customer in ProClinic → archive
- NoDeposit: สร้างคิวจองไม่มัดจำ → `isPermanent:true, formType:'intake', appointmentData:{...}` + สร้างนัดหมาย ProClinic
- NoDeposit: "แก้ไขนัด" → อัพเดท appointmentData ใน Firestore + ProClinic
- NoDeposit: "ยกเลิกจอง/ลบ" → ลบนัดจาก ProClinic (ถ้ามี appointmentProClinicId) → archive/delete

### Session ID prefixes
- `LC-XXXXXX` — intake ทั่วไป (ใช้ 3 ตัวแรกของ clinicName)
- `PRM-XXXXXX` — permanent link
- `FW-ED-XXXXXX` — Follow-up IIEF
- `FW-AD-XXXXXX` — Follow-up ADAM
- `FW-MR-XXXXXX` — Follow-up MRS
- `CST-XXXXXX` — Custom form
- `DEP-XXXXXX` — Deposit booking
- `ND-XXXXXX` — No-deposit booking (จองไม่มัดจำ + นัดหมาย ProClinic)
- `IMP-XXXXXX` — Imported from ProClinic (นำเข้าจาก ProClinic)

---

## 📄 src/constants.js

| Export | ค่า | ใช้ที่ |
|--------|-----|--------|
| `SESSION_TIMEOUT_MS` | `2 * 60 * 60 * 1000` (2 ชม.) | filter sessions, expire check |
| `DEFAULT_CLINIC_SETTINGS` | `{clinicName:'Lover Clinic', accentColor:'#dc2626', doctorStartTime, doctorEndTime, doctorStartTimeWeekend, doctorEndTimeWeekend, ...}` | fallback ทุกที่ |
| `PRESET_COLORS` | array 10 สี | ClinicSettingsPanel color picker |

---

## 📄 src/utils.js

### Constants/Data
| Export | บรรทัด | คำอธิบาย |
|--------|--------|-----------|
| `hexToRgb(hex)` | 1 | แปลง hex → "r,g,b" string สำหรับ rgba() |
| `applyThemeColor(hex)` | 8 | set CSS vars `--accent`, `--accent-rgb` บน :root |
| `THAI_MONTHS` | 14 | array {value, label} เดือนภาษาไทย |
| `EN_MONTHS` | 21 | array {value, label} เดือนภาษาอังกฤษ |
| `YEARS_BE` | 29 | array ปีพ.ศ. 120 ปีย้อนหลัง |
| `YEARS_CE` | 30 | array ปีค.ศ. 120 ปีย้อนหลัง |
| `COUNTRY_CODES` | 32 | array {code, label} รหัสโทรศัพท์ ~40 ประเทศ |

### defaultFormData (บรรทัด 48)
Fields ทั้งหมดใน patient intake form:
- `prefix, firstName, lastName, gender`
- `dobDay, dobMonth, dobYear, age, bloodType`
- `address, phone, isInternationalPhone, phoneCountryCode`
- `emergencyName, emergencyRelation, emergencyPhone, isInternationalEmergencyPhone, emergencyPhoneCountryCode`
- `visitReasons[], visitReasonOther`
- `hrtGoals[], hrtTransType, hrtOtherDetail`
- `hasAllergies, allergiesDetail`
- `hasUnderlying, ud_hypertension, ud_diabetes, ud_lung, ud_kidney, ud_heart, ud_blood, ud_other, ud_otherDetail`
- `currentMedication, pregnancy`
- `howFoundUs[]` — ช่องทางที่รู้จักคลินิก (required)
- `symp_pe` — อาการหลั่งเร็ว
- `adam_1..adam_10` — ADAM scale checkboxes
- `iief_1..iief_5` — IIEF-5 scale scores
- `mrs_1..mrs_11` — MRS scale scores
- `assessmentDate` — วันที่ประเมิน (สำหรับ follow-up)

### Functions
| Export | บรรทัด | คำอธิบาย |
|--------|--------|-----------|
| `formatPhoneNumberDisplay(phone, isInt, code)` | 69 | format display เบอร์โทร |
| `formatBangkokTime(timestamp)` | 69 | แปลง Firestore Timestamp → string GMT+7 Bangkok เช่น "21 มี.ค. 67 14:30" |
| `getReasons(d)` | 74 | ดึง visitReasons array (รองรับ field เก่า visitReason) |
| `getHrtGoals(d)` | 81 | ดึง hrtGoals array (รองรับ field เก่า hrtGoal) |
| `calculateADAM(d)` | 88 | คำนวณ ADAM score → {positive, total, text, color, bg} |
| `calculateIIEFScore(d)` | 101 | sum iief_1..5 → number |
| `getIIEFInterpretation(score)` | 105 | แปล IIEF score → {text, color, bg} |
| `calculateMRS(d)` | 114 | คำนวณ MRS score → {score, text, color, bg} |
| `generateClinicalSummary(d, formType, customTemplate, lang)` | 123 | สร้าง clinical summary text (TH/EN) ใช้ copy ใน dashboard |
| `renderDobFormat(d)` | 341 | format วันเกิด → "1 มกราคม 2540" |
| `playNotificationSound(volume)` | 351 | เล่นเสียง "ดิ๊ง" สองโน้ต (880Hz + 1108Hz) ด้วย AudioContext |

---

## 📄 src/App.jsx

### State (บรรทัด 16-25)
| State | ใช้ทำอะไร |
|-------|-----------|
| `user` | Firebase auth user |
| `isInitializing` | loading state ก่อน auth ready |
| `printMode` | null / 'official' / 'dashboard' — เปิด print view |
| `viewingSession` | session object ที่กำลังดูอยู่ (ส่งลง AdminDashboard) |
| `adminView` | 'dashboard' / 'simulation' — สลับ AdminDashboard ↔ PatientForm simulation |
| `simulatedSessionId` | sessionId ที่ simulate scan |
| `clinicSettings` | merged clinic settings object |

### Logic
- `sessionFromUrl` — ถ้ามี `?session=` ใน URL → แสดง PatientForm (สำหรับผู้ป่วย)
- `signInAnonymously` — ถ้ามี session URL + ไม่ได้ login → auth anonymous อัตโนมัติ
- `onSnapshot clinic_settings/main` — sync clinic settings realtime
- `afterprint` event → reset `printMode`

### Routing logic
1. `isInitializing` → loading screen
2. `scheduleFromUrl` → `<ClinicSchedule>` (public, ไม่ต้อง login)
3. `patientFromUrl` → `<PatientDashboard>` (ไม่ต้อง login)
4. `sessionFromUrl` → `<PatientForm>` (ไม่ต้อง login)
5. `!user || user.isAnonymous` → `<AdminLogin>`
6. else → `<AdminDashboard>` หรือ `<PatientForm isSimulation>`

---

## 📄 src/pages/AdminDashboard.jsx

### Props
```js
{ db, appId, user, auth, viewingSession, setViewingSession,
  setPrintMode, onSimulateScan, clinicSettings, theme, setTheme }
```

### State (บรรทัด 25-51)
| State | บรรทัด | คำอธิบาย |
|-------|--------|-----------|
| `sessions` | 25 | active sessions array (realtime) |
| `formTemplates` | 26 | custom form templates array |
| `isGenerating` | 27 | กำลังสร้าง session ใหม่ |
| `selectedQR` | 28 | sessionId ที่แสดง QR panel |
| `sessionToDelete` | 29 | sessionId ที่กำลังจะลบ (confirm modal) |
| `currentTime` | 30 | Date.now() อัพเดททุก 10วิ (สำหรับ countdown) |
| `isCopied` | 31 | feedback ปุ่ม copy QR |
| `isLinkCopied` | 32 | feedback ปุ่ม copy link |
| `showSessionModal` | 33 | modal เลือกประเภท session |
| `sessionModalTab` | 34 | 'standard' / 'custom' |
| `showNamePrompt` | 36 | modal ใส่ชื่อ session |
| `pendingConfig` | 37 | config รอสร้าง {isPermanent, formType, customTemplate} |
| `sessionNameInput` | 38 | ชื่อ session ที่กรอก |
| `editingNameId` | 39 | sessionId ที่กำลัง edit ชื่อ inline |
| `editingNameValue` | 40 | ค่าชื่อที่กำลัง edit |
| `adminMode` | 41 | 'dashboard' / 'formBuilder' / 'clinicSettings' / 'history' / 'deposit' / 'depositHistory' / 'appointment' / 'chat' |
| `isNotifEnabled` | 43 | เปิด/ปิดเสียงแจ้งเตือน |
| `notifVolume` | 44 | ระดับเสียง 0-1 |
| `showNotifSettings` | 45 | dropdown ตั้งค่าเสียง |
| `toastMsg` | 46 | ข้อความ toast notification |
| `prevSessionsRef` | 47 | useRef — เก็บ queue+noDeposit sessions ก่อนหน้าสำหรับ detect changes (allNotifData) |
| `hasNewUpdate` | 48 | มีข้อมูลอัพเดทขณะดู session detail |
| `summaryLang` | 49 | 'en' / 'th' ภาษา clinical summary |
| `archivedSessions` | 50 | archived sessions array (ประวัติ) |
| `sessionToHardDelete` | 51 | sessionId ที่จะลบถาวร (confirm modal) |
| `pushEnabled` | ~53 | push เปิดอยู่บน device นี้ไหม (sync กับ localStorage `lc_push_enabled`) |
| `pushLoading` | ~54 | กำลัง request permission / get FCM token |
| `depositSessions` | — | active deposit sessions (formType==='deposit' && !isArchived) |
| `archivedDepositSessions` | — | archived deposit sessions |
| `noDepositSessions` | — | active no-deposit sessions (isPermanent && formType!=='deposit' && !serviceCompleted && !isArchived) |
| `archivedNoDepositSessions` | — | archived no-deposit sessions |
| `depositOptions` | — | ProClinic dropdown options (payment methods, sellers, doctors, rooms) |
| `depositOptionsLoading` | — | loading state for deposit options fetch |
| `depositToDelete` | — | `{ session, action: 'archive'\|'cancel'\|'complete' }` — styled confirm modal (red=delete/cancel, blue=complete) |
| `schedCustomDoctorHours` | — | object: per-day doctor hour overrides `{ 'YYYY-MM-DD': { start, end } }` |
| `doctorSlotDragRef` | — | useRef สำหรับ drag-select doctor hour slots |
| `apptSlotDuration` | ~171 | ช่วงเวลาสำหรับคำนวณ slot ว่างในปฏิทินนัดหมาย (15-120 นาที, default 60) |
| `apptFilterPractitioner` | ~175 | 'all' \| practitioner id string — filter ปฏิทินนัดหมายตามแพทย์/ผู้ช่วย |
| `schedSelectedDoctor` | ~189 | practitioner id \| null — เลือกแพทย์สำหรับสร้างลิงก์ per-doctor |

### Appointment Calendar Computed Values (IIFE inside render)
- `filteredAppointments` — appointments filtered by `apptFilterPractitioner`
- `availByDate` — slot ว่างคำนวณจาก clinic hours (clinicOpenTime/CloseTime) ใช้ filteredAppointments
- `docAvailByDate` — slot ว่างคำนวณเฉพาะ doctor hours (doctorStartTime/EndTime) สำหรับ doctorDays เท่านั้น ใช้ filteredAppointments
- Cell colors: `normalCellBg` (เขียว, default ทุกวัน), `docCellBg` (ฟ้า, หมอเข้า), `closedCellBg` (แดง, ปิด)
- แสดง `ว่าง/หมอ` side-by-side เช่น `8/4` — เขียว=คลินิก, ฟ้า=เวลาหมอ
- 🩺 emoji มุมขวาบนวันหมอเข้า, ส/อา ตัวเลขแดงเสมอ

### Computed (บรรทัด 288-289)
```js
const activeSessionInfo = selectedQR ? sessions.find(s => s.id === selectedQR) : null;
const unreadCount = sessions.filter(s => s.isUnread).length; // ใช้กับ badge บน nav
```

### useEffects
| บรรทัด | ทำอะไร |
|--------|---------|
| 53-56 | `setInterval` อัพเดท `currentTime` ทุก 10วิ |
| 59-64 | `onSnapshot` form_templates collection |
| 66-132 | `onSnapshot` opd_sessions — หลัก: auto-cleanup, set archivedSessions, set sessions, notification logic |
| 134-148 | track `viewingSession` vs latest `sessions` → set `hasNewUpdate` |

### Notification Sound Logic (บรรทัด 107-127)
เสียงดังเมื่อ: `newS.isUnread === true` AND (`!oldS.isUnread` OR `patientData` changed)
- ไม่ดังตอนแพทย์อ่าน (isUnread: true→false)
- ดังเมื่อผู้ป่วยส่งฟอร์มครั้งแรก หรือแก้ไขซ้ำก่อนแพทย์อ่าน

### Functions
| Function | บรรทัด | คำอธิบาย |
|----------|--------|-----------|
| `formatRemainingTime(session)` | 149 | คำนวณเวลาเหลือ → string |
| `getBadgeForFormType(formType, customTemplate)` | 162 | JSX badge chip ตามประเภท form |
| `openNamePrompt(config)` | 170 | เปิด modal ใส่ชื่อ session |
| `confirmCreateSession()` | 177 | สร้าง session ใน Firestore |
| `deleteSession(sessionId)` | 220 | soft delete (archive ถ้ามีข้อมูล, ลบถ้าไม่มี) |
| `hardDeleteSession(sessionId)` | 238 | ลบถาวรจาก Firestore |
| `handleViewSession(session)` | 245 | เปิด detail + mark isUnread:false (ยกเว้น deposit ที่ sync แล้วแต่ลูกค้าแก้ข้อมูล → ไม่ clear จนกว่า sync) |
| `closeViewSession()` | 255 | ปิด detail panel |
| `getSessionUrl(sessionId)` | 260 | สร้าง URL สำหรับผู้ป่วย |
| `getQRUrl(sessionId)` | 261 | สร้าง QR image URL (qrserver.com API) |
| `handleCopyToClipboard(text, isUrl)` | 263 | copy text ด้วย execCommand |
| `handleEditName(id, currentName)` | 276 | เริ่ม inline edit ชื่อ session |
| `saveEditedName(id)` | 281 | บันทึกชื่อ session ใหม่ |
| `enablePushNotifications()` | ~58 | request permission → getToken → save to Firestore push_config/tokens |
| `disablePushNotifications()` | ~90 | clear localStorage + reset pushEnabled state |
| `handleDepositSync(session)` | — | Two-step: fillProClinic → submitDeposit (first time) หรือ updateProClinic → updateDeposit (re-sync), clears isUnread |
| `handleDepositCancel(session)` | — | Cancel deposit + delete customer in ProClinic → archive + clear patientLink |
| `handleSaveDepositData(data)` | — | Save deposit edits to Firestore + sync to ProClinic if already synced (updateDeposit) |
| `handleResync(session)` | — | Manual resync OPD data → clears isUnread for deposit, clears patientLink if notFound |
| `getDoctorHoursForDate(dateStr)` | — | คืน { start, end } สำหรับวันนั้น (custom override → weekend default → weekday default) |
| `isSlotInDoctorHours(slot, dateStr)` | — | เช็คว่า slot อยู่ในช่วงเวลาแพทย์เข้าหรือไม่ |
| `toggleDoctorSlot(dateStr, slotTime)` | — | toggle slot เข้า/ออกจาก customDoctorHours override |
| `handleDocSlotPointerDown/Enter/Up()` | — | drag-select doctor hour slots (ใช้กับ doctorSlotDragRef) |
| `handleDayPointerMove()` | — | touch drag support: ใช้ elementFromPoint ส่ง data-dayds ไปหา handleDayPointerEnter |
| `handleSlotPointerMove()` | — | touch drag support: ใช้ elementFromPoint + data-slot-info ส่งไป slot/doctor enter handlers |

### JSX Layout (return บรรทัด 291+)
```
<div> wrapper
├── Toast notification (fixed bottom-right)
├── <header> — Nav bar
│   ├── Row 1: Logo + mobile icon buttons (xl:hidden)
│   ├── Row 2: Nav tabs (mobile grid-cols-6, xl:hidden)
│   │   └── คิว (badge) | จอง (badge) | ประวัติ | นัด | จัดการ | ตั้งค่า
│   └── Desktop nav (hidden xl:flex, flex-wrap)
│       └── หน้าคิว (badge) | จองมัดจำ (badge) | ประวัติ | นัดหมาย | จัดการ | ตั้งค่า | + สร้างคิว | 🔔 | logout
├── adminMode === 'clinicSettings' → <ClinicSettingsPanel>
├── adminMode === 'formBuilder' → <CustomFormBuilder>
├── adminMode === 'chat' → <ChatPanel> (FB/LINE chat with reply, echo, saved replies)
├── adminMode === 'history' → Archive table + Hard Delete modal + "นำเข้าจาก ProClinic" collapsible section
├── adminMode === 'deposit' → Deposit booking cards (red glow, inline edit, sync/cancel/service-complete buttons)
├── adminMode === 'depositHistory' → Deposit history (serviceCompleted badge, cancelled badge, hard delete)
├── adminMode === 'appointment' → ProClinic appointment calendar (month view + slot duration selector + "ว่าง X" per day + day detail + doctor hour drag column sky/blue)
└── adminMode === 'dashboard' (default)
    ├── Left: Session list table
    │   ├── Columns: รหัสคิว | ข้อมูลผู้ป่วย | สาเหตุที่มา | สถานะ | actions
    │   └── Modals: sessionModal, namePrompt, deleteConfirm
    ├── Right: QR panel (selectedQR)
    ├── Appointment detail cards: ProClinic ExternalLink button per appointment (customerId + proClinicOrigin)
    └── Bottom overlay: Session detail viewer (viewingSession)
        ├── "มีข้อมูลอัพเดท" banner (hasNewUpdate)
        ├── Patient summary sections
        └── Clinical summary copy + print buttons
```

---

## 📄 src/components/ChatPanel.jsx

### Description
Chat panel สำหรับ FB Messenger + LINE — แสดงรายการสนทนา + ข้อความ + reply (FB only)

### Features
- **Reply input**: FB conversations สามารถตอบกลับได้จากแอป; LINE แสดง "ตอบแชท LINE ผ่าน LINE OA Chat เท่านั้น"
- **Saved Replies dropdown**: Bookmark icon, fetches from FB API (`saved_message_responses`), 5-min cache
- **Echo messages**: Admin/AI replies from FB show as blue bubbles on right side (sender = 'echo')
- **Badge counts**: จำนวนคนที่มี unread (ไม่ใช่ total messages) — ใช้ `unread: true` count
- **selectedConv sync**: `liveSelectedConv` ref synced with realtime Firestore data เพื่อป้องกัน stale closure
- **Chat history pagination**: 20 messages per page, auto-delete messages older than 7 days

### Helper Functions
| Function | คำอธิบาย |
|----------|-----------|
| `chatApiFetch(endpoint, options)` | Wrapper for chat API calls (webhook endpoints) |
| `sendMessage(recipientId, text, platform)` | Send message via `/api/webhook/send` (FB only) |

### UI Layout
```
├── Conversation list (left)
│   ├── Platform icon (FB/LINE) + displayName + lastMessage preview
│   └── Unread dot indicator
└── Message view (right)
    ├── Message bubbles (left = customer, right = echo/admin)
    ├── Pagination (older messages)
    ├── Saved Replies dropdown (Bookmark icon, FB only)
    └── Reply input + Send button (FB only) / LINE disclaimer
```

---

## 📄 api/webhook/ — Chat Webhook Endpoints

### api/webhook/facebook.js
- FB Webhook handler: receives messages + echo events from Facebook
- `processEchoMessage()` — handles `message_echoes` subscription events
  - Dedup via `OUR_APP_ID` check (skip echoes from other apps)
  - Stores echo messages with `sender: 'echo'` in Firestore
  - Updates `lastMessage` on conversation doc
- Uses `firestorePatch()` with `updateMask.fieldPaths` to prevent deleting existing fields

### api/webhook/send.js
- Sends messages to FB (Graph API v25.0) and LINE
- Upgraded from Graph API v21 to v25
- Uses `firestorePatch()` with `updateMask.fieldPaths` to prevent deleting existing fields
- Stores sent messages as echo in Firestore chat history

### api/webhook/saved-replies.js
- NEW file: GET endpoint proxying FB `saved_message_responses` API
- Returns saved replies list for the Saved Replies dropdown in ChatPanel
- Fetched via `chatApiFetch()` from frontend

### api/webhook/line.js
- LINE Webhook handler: receives messages from LINE
- LINE does not support echo or reply from our app

---

## AdminDashboard — Import from ProClinic

### Description
"นำเข้าจาก ProClinic" collapsible section in the history page (`adminMode === 'history'`)

### Flow
1. Admin expands "นำเข้าจาก ProClinic" section
2. Search by HN / phone / ID card / name → calls `searchCustomers(query)` via brokerClient
3. Results show patient preview: name, phone, HN, courses count, appointments count
4. Admin clicks "นำเข้า" → calls `fetchPatientFromProClinic(proClinicId)` via brokerClient
5. Duplicate detection: checks existing sessions for matching HN / phone / ID card
   - If duplicate found with broken sync → auto-resync (update broker fields)
   - If duplicate found with active sync → show warning
6. Creates `IMP-XXXXXX` session with imported patient data

### API
- `api/proclinic/customer.js` action `fetchPatient` — fetches full patient data from ProClinic edit page
- `api/proclinic/_lib/fields.js` `reverseMapPatient()` — maps ProClinic form fields back to app's `patientData` format
- `src/lib/brokerClient.js` `fetchPatientFromProClinic(proClinicId)` — client wrapper

---

## 🔄 Master Data Sync (Phase 1)

### Description
Sync master data (products, doctors, staff, courses) from ProClinic → Firestore สำหรับใช้เป็น dropdown/reference data

### api/proclinic/master.js
Route handler — actions: `syncProducts`, `syncDoctors`, `syncStaff`, `syncCourses`

| Function | คำอธิบาย |
|----------|-----------|
| `scrapePaginated(session, baseUrl, extractFn, maxPages)` | Parallel paginated scraper — batch of 5 pages at a time |
| `handleSyncProducts(req, res)` | Scrapes `/admin/product` → products list |
| `handleSyncDoctors(req, res)` | Scrapes `/admin/doctor` → doctors list |
| `handleSyncStaff(req, res)` | Scrapes `/admin/user` → staff/users list |
| `handleSyncCourses(req, res)` | Scrapes `/admin/course` → courses list |
| `handler(req, res)` | Route dispatcher (verifyAuth + action routing) |

### api/proclinic/_lib/scraper.js — Master Data Extraction Functions
| Function | คำอธิบาย |
|----------|-----------|
| `extractProductList(html)` | Extract products table rows (id, name, unit, price, category, type, status) |
| `extractDoctorList(html)` | Extract doctors table rows (id, name, position, branches, color) |
| `extractStaffList(html)` | Extract staff/users table rows (id, name, email, role, branches) |
| `extractCourseList(html)` | Extract courses table rows (id, name, type, category, price, status) |
| `extractListPagination(html)` | Detect max page from pagination links |

### Client (brokerClient.js)
- `syncProducts()` — calls master API action syncProducts
- `syncDoctors()` — calls master API action syncDoctors
- `syncStaff()` — calls master API action syncStaff
- `syncCourses()` — calls master API action syncCourses

### UI (ClinicSettingsPanel.jsx)
- Master Data Sync section (between Practitioners and ProClinic Integration sections)
- 4 individual sync buttons (products, doctors, staff, courses) with per-item loading/result states
- "Sync ทั้งหมด" button to sync all sequentially
- States: `syncStatus` (per-item loading), `syncResults` (per-item success/error/count)

---

## 🏥 Treatment Records (Phase 2)

### Description
ดู/สร้าง/แก้ไข/ลบ treatment records จาก ProClinic ผ่าน LoverClinic app — ระบบ OPD Card ที่สำคัญที่สุด

### api/proclinic/treatment.js
Route handler — actions: `list`, `get`, `getCreateForm`, `create`, `update`, `delete`

| Function | คำอธิบาย |
|----------|-----------|
| `handleList(req, res)` | Scrapes `/admin/customer/{id}?treatment_page=N` → treatment cards + pagination |
| `handleGet(req, res)` | Scrapes `/admin/treatment/{id}/edit` → full treatment detail (OPD, vitals, items, fees) |
| `handleGetCreateForm(req, res)` | Scrapes create page + inventory API (parallel) → form options + courses/products + customer promotions. Firestore backups: `pc_inventory/{customerId}`, `pc_doctors/all`, `pc_form_options/treatment` (blood types, insurance, payment channels, sellers, wallets, med/consumable groups, dosage units) |
| `handleCreate(req, res)` | GET create page → copy ALL form defaults → override with our values → POST `/admin/treatment`. Sends chart_image[], before_image[], after_image[], images[] as data URLs. Lab items: lab_*[] fields + products JSON (NOT product_*[] — those cause rejection). PDF attachments switch to multipart/form-data via `toMultipartFormData()`. After success, async fetches treatment detail and saves to `pc_treatments/{id}` for standalone backup. Success = redirect 302; failure = 200 with validation errors |
| `handleUpdate(req, res)` | GET edit page → copy ALL existing form fields → override with new values → POST with `_method=PUT`. Lab items: clears existing lab_*[] fields, rebuilds with products JSON. PDF attachments switch to multipart. Adds courses/products/sale_type defaults (not in edit page HTML — JS fills them). Preserves existing treatment images or replaces with new ones |
| `toMultipartFormData(urlParams, pdfFiles)` | Helper: converts URLSearchParams to native FormData with PDF Blobs. Used when lab items have pdfBase64 attachments |
| `handleDelete(req, res)` | GET edit page for CSRF, POST with `_method=DELETE` |
| `handler(req, res)` | Route dispatcher (verifyAuth + action routing) |

### api/proclinic/_lib/scraper.js — Treatment Extraction Functions
| Function | คำอธิบาย |
|----------|-----------|
| `extractTreatmentList(html)` | Parse customer detail page center column → treatment cards (date, doctor, assistants, CC, DX, products) |
| `extractTreatmentPagination(html)` | Detect max page from `?treatment_page=N` pagination links |
| `extractTreatmentDetail(html)` | Parse treatment edit page → all fields: doctorId, vitals, OPD textareas, items, fees, consent, medCert, beforeImages/afterImages/otherImages, labItems (with images + fileId for PDF) |
| `extractTreatmentCreateOptions(html)` | Parse create form → doctors, assistants, healthInfo, paymentChannels, CSRF token (courses via inventory API in treatment.js) |

### src/components/TreatmentTimeline.jsx
Shared component used in AdminDashboard + PatientDashboard

| Component | คำอธิบาย |
|-----------|-----------|
| `TreatmentTimeline` | Main: paginated list, expandable cards, refresh, create button. Props: customerId, isDark, onOpenCreateForm. States: treatments, page, totalPages, expandedId, detailCache, editingId, deletingId, cancelModalOpen, cancelTarget, cancelDetail |
| Cancel Modal | `cancelModalOpen` state → overlay modal with textarea for cancel reason (replaces `prompt()`). Calls `broker.deleteTreatment(cancelTarget, cancelDetail)` on confirm |
| `TreatmentEditForm` | Inline edit form pre-filled from detail, saves via `broker.updateTreatment` |
| `VitalBadge` | Small display for vital sign values (BT, PR, RR, BP, O2sat, weight, height) |
| `OPDField` | Labeled text field display for OPD card sections (CC, PE, DX, Dr.Note, Plan) |

### src/components/TreatmentFormPage.jsx
Full-page treatment create form — mirrors ProClinic `/admin/treatment/create` layout

| Section | Fields |
|---------|--------|
| ข้อมูลการรักษา | doctor select, assistant multi-select (max 5), treatment date |
| ข้อมูลสุขภาพลูกค้า | blood type, congenital disease, drug allergy, treatment history |
| Vital Signs | weight, height, BMI (auto), BT, PR, RR, SBP, DBP, O₂sat |
| ใบรับรองแพทย์ | med cert checkboxes (actually came, rest period, other) |
| OPD Card | CC, PE, DX, Dr.Note, Plan, Note, Additional Note (7 textareas) |
| ค่ามือแพทย์ & ผู้ช่วยแพทย์ | Auto-populated from doctor/assistant selection. Editable fee per person (pencil icon), deletable, + เพิ่ม button. Total display. Sends df_ hidden fields to ProClinic (df_doctor_id[], df_group_id[], df_rowId_{rowId}[]) |
| สั่งยากลับบ้าน | 3 buttons (กลุ่มยากลับบ้าน, ยากลับบ้าน, Remed) + medication table (read-only display with edit pencil + delete icons). Edit opens modal pre-filled for in-place update. Real ProClinic product search via JSON API |
| ข้อมูลการใช้คอร์ส | 3-column grid matching ProClinic: คอร์ส (grouped by course header + checkable products, non-promotion only) \| โปรโมชัน (grouped by promotion header → sub-courses → checkable products, same UX as courses; plus purchased promotions) \| รายการรักษา (selected items with qty+delete). Checked items from both courses & promotions go to treatment items. Retail products shown below grid |
| เบิกประกัน | checkbox toggle + benefit type + company — controls insurance deduction in billing. Hidden when no sale (`hasSale`) |
| สรุปค่าใช้จ่าย | itemized billing: subtotal, medicine discount (%), coupon, bill-end discount (amt/%), insurance/deposit/wallet deductions, net total. Auto-calc via `billing` useMemo. Hidden when no sale |
| การชำระเงิน | radio buttons status (0/2/4), payment date+time, 3 payment channels (checkbox+select+amount), ref_no, note. Hidden when no sale |
| พนักงานขาย | 5 seller rows (checkbox+select+%+auto-calc commission). Commission = netTotal * percent / 100. Hidden when no sale |
| Lab | Per-item: product select, qty, price, discount, VAT. Description textarea + image gallery (max 6, resize 1920px JPEG 0.8) + PDF attachment (max 10MB, sent as multipart blob). State: `labItems` [{productId, productName, unitName, qty, price, discount, discountType, isVatIncluded, information, images, fileId, pdfBase64, pdfFileName}]. Sends lab_*[] fields + products JSON to ProClinic |
| รูปภาพการรักษา | 3 galleries: Before (max 12), After (max 12), อื่นๆ (max 12). Client-side resize 1920x1920 JPEG 0.8. State: `beforeImages`, `afterImages`, `otherImages` [{dataUrl, id}]. Sends `before_image[]`, `after_image[]`, `images[]` to ProClinic |

**Auto-fill from OPD:** Receives `patientData` prop → auto-fills blood type (matched by name to ProClinic options), underlying conditions → congenital disease, allergies → drug allergy, current medications → treatment history, visit reasons → OPD symptoms

**Data loading:** `broker.getTreatmentCreateForm(customerId)` → doctors, assistants, healthInfo, vitalsDefaults, bloodTypeOptions, customerCourses, benefitTypes, insuranceCompanies, paymentChannels, sellers, dosageUnits, wallets, medicationGroups, remedItems

**Navigation:** AdminDashboard `treatmentFormMode` state → renders as z-[80] full-screen overlay. Props include `db`, `appId`, `patientData` for Firestore backup + auto-fill.

**Firestore backup:** On submit, saves raw treatment data to `artifacts/{appId}/public/data/treatments/{proClinicId}` including charts, beforeImages, afterImages, otherImages. On group modal open, saves medication groups → `master_data/medication_groups/items/{id}` and consumable groups → `master_data/consumable_groups/items/{id}`. On form load, saves customer inventory (courses) → `pc_inventory/{customerId}`

### Client (brokerClient.js) — Treatment Functions
- `listTreatments(customerId, page)` — list treatments for a customer (paginated)
- `getTreatment(treatmentId)` — get full treatment detail
- `getTreatmentCreateForm(customerId)` — get create form options (enhanced: courses, insurance, blood types, sellers)
- `createTreatment(customerId, treatment)` — create new treatment (enhanced: courseItems, medications, insurance, payment)
- `updateTreatment(treatmentId, treatment)` — update existing treatment
- `deleteTreatment(treatmentId)` — delete/cancel treatment
- `listItems(itemType, query)` — list purchasable items (course/promotion/product) from ProClinic `/admin/api/item/{type}`

### Integration
- **AdminDashboard.jsx**: TreatmentTimeline rendered in patient detail view (after Clinical Summary), conditioned on `viewingSession.brokerProClinicId`. Create button triggers `treatmentFormMode` state → opens TreatmentFormPage overlay
- **PatientDashboard.jsx**: TreatmentTimeline rendered for admin view (`isAdminView && sessionData.brokerProClinicId`)
- Purple accent color: dark `#a78bfa`, light `#7c3aed`
- **Reference:** `docs/TREATMENT_CREATE.md` — comprehensive ProClinic treatment create page map (field names, submit behavior, bugs & gotchas)

---

## 📄 src/pages/ClinicSchedule.jsx

### Props
```js
{ token, clinicSettings, theme, setTheme }
```

### Description
Public schedule page ที่ลูกค้าเปิดผ่าน `/?schedule=<token>` — ไม่ต้อง login

### Data
- อ่านจาก Firestore: `clinic_schedules/{token}` ผ่าน onSnapshot (live update)
- Fields: `months`, `doctorDays`, `closedDays`, `bookedSlots`, `manualBlockedSlots`, `clinicOpenTime/CloseTime`, `clinicOpenTimeWeekend/CloseTimeWeekend`, `doctorStartTime/EndTime`, `doctorStartTimeWeekend/EndTimeWeekend`, `customDoctorHours`, `slotDurationMins`, `noDoctorRequired`, `enabled`, `createdAt`
- Merge bookedSlots + manualBlockedSlots สำหรับคำนวณว่าง

### Features
- **i18n**: ระบบแปลภาษา TH/EN ผ่าน `LANG` object + `lang` state + ปุ่ม Globe toggle
- **Theme-aware**: ใช้ `isDark` boolean คำนวณสีแทน Tailwind `dark:` prefix (เพราะ theme ใช้ `data-theme` attribute)
- **Dark mode: Fire/Ember theme** — `fireGlow` object มี inline styles สำหรับ normal/doctor/avail/selected/disabled cells: gradient backgrounds (#0a0a0a→#2d0f00), inset box-shadow glow effects, red-orange metallic borders (#4a1a0a), premium gaming aesthetic. Header/legend/slots/contact cards ทั้งหมดใช้ fire palette. Light mode ใช้ Tailwind classes ปกติ
- Calendar view แบ่งตามเดือน (month tabs) — gap-px grid borders, trailing cells fill incomplete rows
- วันหมอเข้า (sky highlight / dark: blue glow) / วันปิด (muted disabled) / วันว่าง (green badge "ว่างX" / dark: emerald glow)
- `noDoctorRequired=false`: วันที่ไม่ใช่หมอเข้า disabled + ไม่แสดงเลขคิวว่าง
- `noDoctorRequired=true`: ทุกวันคลิกได้ยกเว้นวันปิด, วันหมอเข้ามี 🩺 emoji (มุมขวาบน)
- กดวันที่ → แสดง time slots (horizontal list + CheckCircle2/XCircle icons) — free/total count
- Today indicator: dot above date number + "วันนี้"/"Today" label below
- 24hr expiry: ลิงก์อายุ 24 ชม. จาก `createdAt` → แสดง "ลิงก์หมดอายุ"
- `enabled === false` → แสดง "ไม่พบตารางนัดหมาย"
- Contact buttons (LINE + Phone) with hover scale animation
- Sticky header with backdrop blur
- Loading state with spinning circle, error states with icon container
- Legend inside calendar card at bottom
- Mobile-first layout (max-w-lg container, responsive padding)

### Helper functions
- `generateTimeSlots(open, close, duration)` — สร้าง array ของ time slots
- `getSlotsForDate(dateStr)` — เลือก weekday/weekend hours แล้ว generate slots
- `isSlotBooked(date, start, end, bookedSlots)` — เช็คว่า slot ซ้อนกับ booking ไหม
- `isDayDisabled(dateStr)` — เช็คว่าวันนี้ disabled (ปิด หรือ ไม่ใช่วันหมอเข้าเมื่อต้องพบแพทย์)
- `getDoctorHoursForDate(dateStr)` — คืน { start, end } จาก customDoctorHours override หรือ weekend/weekday default
- `isSlotOutsideDoctorHours(slot, dateStr)` — blocks slots นอกเวลาแพทย์สำหรับ พบแพทย์ links
- Availability count + selected slots exclude doctor-hour-blocked slots
- `showFrom` — อ่านจาก schedule doc ('today'/'tomorrow') → วันก่อน cutoff = disabled เหมือนวันหมอไม่เข้า
- `endDate` — อ่านจาก schedule doc ('YYYY-MM-DD') → วันหลัง endDate = disabled + ไม่นับ avail
- `isDark` — computed boolean จาก theme prop + matchMedia สำหรับ auto mode
- Theme color helpers: `docCellBg`, `availCellBg`, `availColor`, `closedCellBg` etc.

---

## AdminDashboard — Schedule Link Modal

### State (บรรทัด ~170-186)
| State | ใช้ทำอะไร |
|-------|-----------|
| `showScheduleModal` | เปิด/ปิด modal สร้างลิงก์ |
| `schedStartMonth` | เดือนเริ่มต้น (YYYY-MM) |
| `schedAdvanceMonths` | จำนวนเดือนทั้งหมด (1-4) |
| `schedDoctorDays` | Set ของวันที่หมอเข้า (persist ใน Firestore schedule_prefs) |
| `schedClosedDays` | Set ของวันปิด (persist ใน Firestore schedule_prefs) |
| `schedGenLoading` | boolean กำลัง gen |
| `schedGenResult` | { token, url, qrUrl } หลัง gen สำเร็จ |
| `schedSlotDuration` | ช่วงเวลาละกี่นาที (15-120) เลือกตอน gen |
| `schedNoDoctorRequired` | checkbox "ไม่ต้องพบแพทย์" |
| `schedShowFrom` | 'today' หรือ 'tomorrow' — แสดงคิวตั้งแต่วันนี้/พรุ่งนี้ |
| `schedEndDay` | 'YYYY-MM-DD' วันสิ้นสุดของลิงก์ (default = วันสุดท้ายของเดือนสุดท้าย) |
| `schedManualBlocked` | array ของ { date, startTime, endTime } slots ที่ปิด manual |
| `schedBlockingDay` | วันที่กำลังเลือก block slots (null = ไม่ได้เลือก) |
| `schedList` | array ของ schedule docs ทั้งหมด (subscribe) |
| `schedPrefsLoaded` | boolean โหลด prefs จาก Firestore แล้ว |
| `apptAutoSyncedRef` | ref: auto-sync ±1 เดือนแล้วหรือยัง |
| `apptSyncedMonthsRef` | ref Set: เดือนที่ lazy sync แล้ว |

### Flow
1. Admin กดปุ่ม "สร้างลิงก์" ใน appointment tab header
2. Modal: เลือกเดือน + จำนวนเดือน + toggle วันหมอเข้า/ปิด (cycle: ปกติ→หมอเข้า→ปิด, save ทันที)
3. เลือก slot interval (15min-2hr) + checkbox "ไม่ต้องพบแพทย์"
4. Manual block: กดวันที่ → เลือก 15-min slots ที่ต้องการปิด
5. กด "Sync + สร้างลิงก์" → sync appointments ทุกเดือน → สร้าง clinic_schedules/{token}
6. แสดง QR + URL ให้ copy
7. Schedule list แสดงนอก modal: copy/toggle enable/delete

### Key Functions
- `toggleDay(dateStr)` — cycle ปกติ→หมอเข้า→ปิด + save to Firestore immediately
- `saveSchedulePrefs()` — save prefs including `customDoctorHours` to Firestore
- `handleGenScheduleLink()` — sync all months + create schedule doc (saves doctorStartTime/End + customDoctorHours + selectedDoctorId/Name). bookedSlots filtered: พบแพทย์→per-doctor, ไม่พบแพทย์→all assistants combined
- `updateActiveSchedules()` — refresh bookedSlots in all active non-expired schedule docs (called after sync)
- `handleToggleSchedule(id)` / `handleDeleteSchedule(id)` — จัดการลิงก์

---

## 📄 src/pages/PatientForm.jsx

### Theme: Fire/Ember Dark + Sakura Light
- **isDark** computed boolean (เหมือน PatientDashboard/ClinicSchedule)
- **Hero**: red-black gradient `#1a0000 → #0a0a0a → #200000` (dark) / sakura pink (light)
- **Form body**: ember gradient `#0a0a0a → #0d0500` (dark) / pink-white (light)
- **Sections**: glassmorphism-inspired with `backdrop-filter: blur(12px)`, ember/sakura glass tints
- **Status screens** (invalid/expired/closed/success): themed backgrounds matching fire/sakura
- **CSS classes**: `pf-hero`, `pf-body`, `pf-section`, `pf-reason-card`, `pf-radio-card`, `pf-submit` — all in index.css

### Props
```js
{ db, appId, user, sessionId, isSimulation, onBack, clinicSettings, theme, setTheme }
```

### State (บรรทัด 19-29)
| State | คำอธิบาย |
|-------|-----------|
| `formData` | form values ทั้งหมด (defaultFormData) |
| `language` | 'th' / 'en' — ภาษา UI |
| `isSubmitting` | กำลัง submit |
| `sessionExists` | session มีอยู่ใน Firestore ไหม |
| `isExpired` | session หมดอายุ (2 ชม.) — แสดง UI "หมดอายุ" |
| `isClosed` | session ถูก admin archive — แสดง UI "คลินิกปิดคิวนี้แล้ว" (Lock icon) |
| `isSuccess` | submit สำเร็จ |
| `isEditing` | กำลัง edit หลัง submit |
| `sessionType` | 'intake' / 'followup_ed' / 'followup_adam' / 'followup_mrs' / 'custom' |
| `customTemplate` | template object สำหรับ custom form |

### useEffects
| บรรทัด | ทำอะไร |
|--------|---------|
| 30-38 | แปลงปีเกิด BE↔CE เมื่อ language เปลี่ยน |
| 40-73 | `onSnapshot` session doc — load data, check expire, check isArchived → setIsClosed, set sessionType |

### Functions
| Function | บรรทัด | คำอธิบาย |
|----------|--------|-----------|
| `handleInputChange(e)` | 76 | generic input handler (กรอง non-digit สำหรับ phone) |
| `handleCustomCheckboxChange(qId, option)` | 88 | toggle checkbox สำหรับ custom form |
| `handleReasonToggle(reason)` | 96 | toggle visitReasons array |
| `handleHowFoundUsToggle(channel)` | 103 | toggle howFoundUs array |
| `handleGoalToggle(goal)` | 110 | toggle hrtGoals array |
| `handleDobChange(e)` | 117 | update DOB + auto-calculate age |
| `handleSubmit(e)` | 137 | validate + updateDoc Firestore |

### handleSubmit validation order (บรรทัด 141-180)
1. (intake only) `howFoundUs` ต้องเลือก ≥1
2. (intake only) `visitReasons` ต้องเลือก ≥1
3. (intake only) ถ้าเลือก HRT ต้องมี `hrtGoals` ≥1
4. (intake only) validate เบอร์โทร (Thai 10 digit หรือ international)
5. (intake/custom) validate อายุตรงกับวันเกิด
6. `updateDoc` → `{status:'completed', patientData:formData, submittedAt/updatedAt: serverTimestamp(), isUnread:true}`

### Firestore write on submit (บรรทัด 184-186)
```js
updateDoc(sessionRef, {
  status: 'completed',
  patientData: formData,
  [isEditing ? 'updatedAt' : 'submittedAt']: serverTimestamp(),
  isUnread: true
})
```

### Form sections rendered (intake)
1. ข้อมูลส่วนตัว (prefix, name, gender, DOB, age, address)
2. ข้อมูลการติดต่อ (phone, emergency contact)
3. สาเหตุที่มา (visitReasons multi-select)
4. HRT goals (ถ้าเลือก HRT)
5. โรคประจำตัว (hasUnderlying + checkboxes)
6. ยาที่ใช้ / การตั้งครรภ์
7. แบบคัดกรอง (ADAM/IIEF/PE ถ้าเลือก ED; MRS ถ้าเลือก HRT female)
8. **รู้จักคลินิกได้อย่างไร** (howFoundUs multi-select — REQUIRED)
9. Submit button

### LanguageToggle component (บรรทัด 195)
Inline component ด้านบนขวา — สลับ TH/EN

---

## 📄 src/components/ClinicLogo.jsx

### Props
| Prop | Default | คำอธิบาย |
|------|---------|-----------|
| `className` | `"py-4"` | class สำหรับ img/div wrapper |
| `showText` | `true` | แสดง subtitle |
| `forceLight` | `false` | ใช้ใน dark overlay → invert logo |
| `printMode` | `false` | ใช้ใน print → ไม่ filter |
| `clinicSettings` | `null` | ถ้า null ใช้ DEFAULT |
| `center` | `false` | center text logo |

### Logic
1. ถ้า `logoUrl` ตั้งไว้ → แสดง custom logo
2. ถ้าไม่มี → ลอง `/logo.jpg`
3. ถ้า error → แสดง text logo จาก clinicName

---

## 📄 src/hooks/useTheme.js

- `THEME_KEY` = `'app-theme'` (localStorage key)
- `THEMES` = [{value:'dark'|'light'|'auto', label, icon}]
- `useTheme()` → `{theme, resolvedTheme, setTheme}`
- set `data-theme` attribute บน `<html>` เมื่อเปลี่ยน

---

## 🎨 Theme & Color System

- CSS var `--accent` = accent color hex (เช่น `#dc2626`)
- CSS var `--accent-rgb` = "220,38,38"
- CSS var `--bg-base`, `--tx-heading` etc. — defined ใน index.css ตาม `data-theme`
- `applyThemeColor(hex)` ใน utils.js — set CSS vars
- ถูกเรียกจาก App.jsx ทุกครั้งที่ clinic_settings เปลี่ยน

---

## 🗝️ Key Design Decisions

0. **Push Notification flow** — Patient submits → Firestore `isUnread: false→true` → Cloud Function triggers → sends FCM multicast → admin device receives push (แม้หน้าจอล็อค). Admin กด push → เปิดแอป. iOS ต้องติดตั้ง PWA ก่อน (iOS 16.4+, Add to Home Screen in Safari)
1. **Soft delete** — sessions ที่มี patientData → archive (isArchived:true), ไม่ deleteDoc
2. **Auto-cleanup** — ทำใน onSnapshot callback ของ AdminDashboard (ไม่มี background job)
3. **Notification sound** — ดังเฉพาะ `isUnread: false→true` หรือ patientData เปลี่ยนขณะ isUnread:true
4. **isUnread badge** — แสดงบน "หน้าคิว" nav tab (ไม่แสดงบน "ประวัติ")
5. **QR/Link** — ใช้ `window.location.origin + ?session=ID`, QR ผ่าน qrserver.com API
6. **No IIFE in JSX** — Vite OXC parser ไม่รองรับ IIFE ใน JSX → ใช้ pre-computed variables แทน
7. **howFoundUs** — required field สุดท้ายใน intake form, multi-select; แสดงใน session detail viewer (Globe icon, blue chips)
8. **Bilingual** — PatientForm รองรับ TH/EN, default EN สำหรับแพทย์
9. **isClosed vs isExpired** — PatientForm ใช้ 2 state แยก: `isClosed` (admin archive) แสดง Lock icon + "คลินิกปิดคิวนี้แล้ว"; `isExpired` (2 ชม.) แสดง TimerOff + "หมดอายุ"; render isClosed ก่อน isExpired
10. **Timestamps in tables** — Queue table: QR time (QrCode icon, gray) ใน col 1; submit/edit time (CheckCircle2/Edit3, green/blue) ใน status col. History table: 4 timestamps (Gen/กรอก/แก้ไข/เก็บ) ด้วย icons+colors
11. **Deposit isUnread persistence** — deposit sessions: isUnread ไม่ clear เมื่อแค่กดปุ่มตา/edit → clear เฉพาะเมื่อ handleDepositSync หรือ handleResync สำเร็จ (guard: `isDepositKeepUnread = session.formType === 'deposit' && session.isUnread`)
12. **PatientLink cleanup** — เมื่อ OPD หลุด sync (delete, notFound, cancel) → ลบ patientLinkToken ถาวร ลิงก์ใช้ไม่ได้อีก
13. **PatientLink requires OPD** — ปุ่มสร้างลิงก์ดูข้อมูลในหน้าประวัติ แสดงเฉพาะเมื่อ opdRecordedAt + brokerStatus=done
14. **DatePickerThai** — custom component: แสดง DD/MM/YYYY + ไอคอนปฏิทิน, กดแล้วเปิด native calendar picker, value เก็บเป็น YYYY-MM-DD (compatible กับ ProClinic)
15. **API Security (Firebase Auth)** — ทุก `/api/proclinic/*` endpoint ต้องมี `Authorization: Bearer <firebaseIdToken>` header. ตรวจสอบผ่าน `_lib/auth.js` → `verifyAuth()` (เรียก Firebase `accounts:lookup` REST API). brokerClient.js แนบ token อัตโนมัติทุก request
16. **ProClinic credential reload** — เปลี่ยน env vars ใน Vercel แล้วกดปุ่ม "โหลด Credentials ใหม่" ใน ClinicSettingsPanel → เรียก `/api/proclinic/clear-session` → ลบ session cache จาก Firestore → ครั้งถัดไป API จะ login ใหม่ด้วย credentials ใหม่ (ไม่ต้อง redeploy)
17. **Practitioner data (frontend)** — AdminDashboard ดึงรายชื่อแพทย์/ผู้ช่วยสด ๆ จาก ProClinic ผ่าน `broker.getLivePractitioners()` (5-min sessionStorage cache, key `lc_live_practitioners_v1`). ไม่ต้องตั้งค่าใน Settings ก่อนใช้งาน — คนเดียวกันที่ ProClinic ใส่ไว้ทั้งแพทย์+ผู้ช่วยจะโชว์ทั้ง 2 ที่. `clinicSettings.practitioners[]` (+ Settings panel) เก็บไว้เป็น **fallback** เมื่อ live fetch ล้มเหลว (offline / 429 / no creds) — role `hidden` ถูก filter ออก. Backend Dashboard (`TreatmentFormPage.jsx` เมื่อ `saveTarget==='backend'`) ยังใช้ `master_data/doctors` + `master_data/staff` ตาม Rule #10

18. **Room config (frontend schedule links)** — ProClinic ไม่แบ่ง "ห้องแพทย์" vs "ห้องหัตถการ" → admin ต้อง tag ใน Settings. ClinicSettingsPanel "ห้องตรวจ / ห้องหัตถการ" section: ดึงจาก `getDepositOptions().rooms` → กำหนด role (`doctor` / `staff` / `hidden`) → save ลง `clinicSettings.rooms[]` = `[{id, name, role}]`. Schedule link modal กรองห้องตามโหมด: `!schedNoDoctorRequired` → ห้องแพทย์, `schedNoDoctorRequired` → ห้องหัตถการทั่วไป. Schedule doc เพิ่ม `selectedRoomId` + `selectedRoomName`. Appointment docs มี `roomId` + `roomName` แล้ว (mapped จาก ProClinic `examination_room_id`/`examination_room_name`). **Slot-blocking logic** อยู่ใน `src/lib/scheduleFilterUtils.js` `shouldBlockScheduleSlot()` (27 adversarial tests): (1) ถ้าเลือกแพทย์คนเฉพาะ — slot busy เมื่อแพทย์นั้นจอง OR ห้องที่เลือกถูกใช้, (2) ถ้าเลือกห้องแต่ไม่เลือกแพทย์ — slot busy เมื่อห้องนั้นถูกใช้เท่านั้น (ไม่ใช่ตามจำนวนแพทย์ทุกคน — bug 2026-04-19: Shockwave booking leaked through to doctor-room link), (3) ถ้าไม่เลือกแพทย์+ไม่เลือกห้อง — legacy "all doctors block" behavior (พบแพทย์) หรือ "assistants block" (ไม่พบแพทย์)

19. **Thai time (GMT+7) — canonical helpers** — ทุกที่ใน frontend ที่ต้องรู้ "วันนี้" / "เดือนนี้" / "ตอนนี้" ใช้ `bangkokNow()` / `thaiTodayISO()` / `thaiNowMinutes()` / `thaiYearMonth()` จาก `src/utils.js` เท่านั้น. **ห้ามใช้** `new Date().toISOString().slice(0,10)` สำหรับแสดงวัน — มัน emit UTC → ช่วง 00:00–07:00 เวลาไทยจะโชว์เมื่อวาน (bug 2026-04-19 prod). `.toISOString()` ยังใช้ได้สำหรับ audit timestamps ที่ถูก format ผ่าน `formatBangkokTime()` ตอนแสดง. AdminDashboard มี `const bangkokNow = bangkokNowUtil; const todayISO = thaiTodayISO;` เป็น alias เพื่อความเข้ากันได้กับโค้ดเดิมในไฟล์
18. **Chat system** — FB Messenger: full reply + echo support (admin replies show as blue bubbles). LINE: receive only, no reply from app. Saved Replies from FB API with 5-min cache. Badge = unread people count. History 20/page + auto-delete > 7 days
19. **Import from ProClinic** — Search by HN/phone/ID card/name, preview patient data + courses + appointments, duplicate detection with auto-resync for broken sync, creates `IMP-XXXXXX` sessions. Uses `reverseMapPatient()` to map ProClinic fields back to app format
20. **Firestore REST API updateMask** — All `firestorePatch()` calls must include `updateMask.fieldPaths` query params to prevent PATCH from deleting unmentioned fields (REST API quirk: PATCH = replace entire doc without mask)
21. **Per-doctor schedule links** — สร้างลิงก์: พบแพทย์→เลือกแพทย์→bookedSlots เฉพาะคนนั้น, ไม่พบแพทย์→bookedSlots รวมผู้ช่วยทุกคน. ClinicSchedule.jsx ไม่ต้องแก้ (filter ที่ต้นทาง)

---

## ⚠️ จุดระวัง / Known Quirks

- **Vite OXC parser** — ห้ามใช้ `{(() => { ... })()}` IIFE ใน JSX → ใช้ pre-computed var แทน
- **Firestore snapshot fires 2x** สำหรับ write ที่มี `serverTimestamp()` (local estimate + server confirm) → notification logic ต้องตรวจ isUnread ไม่ใช่แค่ patientData
- **isNotifEnabled/notifVolume** ใน dependency array ของ sessions useEffect → ถ้าเปลี่ยน จะ re-subscribe onSnapshot (prevSessionsRef ยังคงเดิม)
- **Notification detection** ครอบคลุม queue + noDeposit sessions ผ่าน `allNotifData = [...data, ...ndData]` → prevSessionsRef เก็บทั้ง 2 tab
- **Phone validation** — Thai domestic: `/^0\d{9}$/`, international: แค่กรอง non-digit
- **DOB year** — BE (พ.ศ.) ถ้า year > 2400, CE (ค.ศ.) ถ้า year < 2400
- **logo.jpg** — เก็บไว้ที่ `/public/logo.jpg`
- **Missing icon import → black screen** — ถ้า import lucide-react icon ขาด จะเกิด JS runtime error → component crash → จอดำ; ตรวจ import ก่อนเสมอ
- **Archive link fix** — PatientForm ตรวจ `data.isArchived` ใน onSnapshot → setIsClosed(true) และ return ทันที ป้องกันการกรอกซ้ำ
- **VAPID Key** — ต้อง generate ใน Firebase Console → Project Settings → Cloud Messaging → Web Push certificates → Generate key pair แล้วใส่ใน `VAPID_KEY` constant ใน AdminDashboard.jsx
- **API Auth required** — ทุก `/api/proclinic/*` endpoint ต้องมี Firebase Auth token. ถ้าเพิ่ม endpoint ใหม่ต้อง import `verifyAuth` จาก `_lib/auth.js` เสมอ
- **Firestore REST API updateMask** — `firestorePatch()` ใน serverless functions (facebook.js, send.js) ต้องใส่ `updateMask.fieldPaths` ใน query string เสมอ ไม่งั้น PATCH จะลบ field ที่ไม่ได้ส่งไป (REST API PATCH = replace entire doc)
- **Chat echo dedup** — facebook.js webhook ใช้ `OUR_APP_ID` เช็ค echo events เพื่อ skip echoes จาก app อื่น
- **Chat LINE limitation** — LINE ไม่มี echo API และตอบจากแอปเราไม่ได้ → ChatPanel แสดง disclaimer + ซ่อน reply input
- **Chat saved replies cache** — 5-min cache ใน ChatPanel เพื่อลด API calls ไปยัง FB saved_message_responses
- **Import duplicate detection** — Import from ProClinic ตรวจ HN/phone/ID card ซ้ำก่อนสร้าง session ใหม่ ถ้าเจอ broken sync → auto-resync แทนสร้างใหม่
- **Cloud Functions deploy** — `cd F:\LoverClinic-app\functions && npm install` แล้ว `firebase deploy --only functions` จาก root
- **iOS Push** — ต้องใช้ iOS 16.4+, เปิดจาก Safari แล้ว Share → "เพิ่มลงหน้าจอ (Add to Home Screen)" ก่อนถึงจะรับ push ได้
- **FCM token lifecycle** — token เก็บใน Firestore `push_config/tokens`, auto-cleanup เมื่อ invalid (Cloud Function ทำ)

---

## 🔌 Cookie Relay Extension (cookie-relay/)

### ภาพรวม
Chrome Extension MV3 ที่ sync ProClinic httpOnly cookies → Firestore + auto-login เมื่อ session หมดอายุ
- ProClinic มี reCAPTCHA v3 → server login ทำไม่ได้ → ต้องใช้ browser จริง
- **ไม่มี auto-deploy** — ต้อง reload ที่ `chrome://extensions` เอง
- **Reload เมื่อแก้**: `background.js`, `manifest.json`, `content-loverclinic.js`
- **ไม่ต้อง reload เมื่อแก้**: `popup.html`, `popup.js`

### Files
| ไฟล์ | หน้าที่ |
|------|--------|
| `manifest.json` | MV3 config, permissions: cookies/scripting/tabs/storage |
| `background.js` | Service Worker — syncCookies(), autoLogin(), doLogin(), message handlers |
| `content-loverclinic.js` | Bridge webapp ↔ extension (postMessage ↔ chrome.runtime.sendMessage) |
| `popup.html/js` | UI ตั้ง credentials + manual sync |

### Credentials (อัตโนมัติ)
```
Vercel env vars → /api/proclinic/credentials → webapp → LC_SET_CREDENTIALS → chrome.storage.local
```

### Cookie Sync
```
syncCookies():
  chrome.cookies.getAll({ domain: '.proclinicth.com' })
  → ใช้ origin จาก credentials (ไม่ใช่ cookie domain!)
  → PATCH Firestore: clinic_settings/proclinic_session
```

### Auto-login
```
autoLogin():
  1. chrome.windows.create({ type: 'popup' }) → chrome.windows.update({ state: 'minimized' })
  2. waitForTabLoad → executeScript(doLogin) → click #form-submit button
  3. waitForLoginRedirect (non-/login URL) → syncCookies()
```

## 🔌 Legacy: Broker Extension (broker-extension/) — ⚠️ DEPRECATED
ไม่ใช้แล้ว — ถูกแทนที่ด้วย API layer + cookie-relay/ ห้ามอ้างอิง

### ProClinic URL
```
const PROCLINIC_ORIGIN     = 'https://proclinicth.com'
const PROCLINIC_CREATE_URL = ORIGIN + '/admin/customer/create'
const PROCLINIC_LIST_URL   = ORIGIN + '/admin/customer'
```

### Firestore broker fields (เพิ่มใน opd_sessions)
```
brokerStatus: null | 'pending' | 'done' | 'failed'
brokerProClinicId: string | null    // ProClinic customer ID (numeric)
brokerProClinicHN: string | null    // HN เช่น "000485" — ไม่เปลี่ยน ใช้ค้นหา
brokerError: string | null
opdRecordedAt: ISO string | null    // เวลาบันทึก OPD ครั้งแรก
brokerFilledAt: ISO string | null   // เวลา fill ล่าสุด
brokerLastAutoSyncAt: ISO string | null  // เวลา auto-sync ล่าสุด
```

### Message Types
| Type | ทิศทาง | คำอธิบาย |
|------|--------|-----------|
| `LC_FILL_PROCLINIC` | Page → Extension | สร้างลูกค้าใหม่ใน ProClinic |
| `LC_DELETE_PROCLINIC` | Page → Extension | ลบลูกค้าออกจาก ProClinic |
| `LC_UPDATE_PROCLINIC` | Page → Extension | แก้ไขข้อมูลลูกค้าใน ProClinic (auto-sync) |
| `LC_OPEN_EDIT_PROCLINIC` | Page → Extension | เปิดหน้า edit ProClinic (manual) |
| `LC_BROKER_RESULT` | Extension → Page | ผล create |
| `LC_DELETE_RESULT` | Extension → Page | ผล delete |
| `LC_UPDATE_RESULT` | Extension → Page | ผล update |
| `LC_GET_STATUS` | Popup → Extension | ขอ statusMap |
| `LC_CLEAR_STATUS` | Popup → Extension | clear statusMap |

### background.js — Architecture

**Serial Queue** (ป้องกัน race condition บน shared ProClinic tab)
```js
enqueueProClinic(fn)  // ทุก handler ต้องผ่านนี้
```

**Tab Management**
```js
getOrCreateProclinicTab()      // หา/สร้าง ProClinic tab + รอ login check
navigateAndWait(tabId, url, delayMs=800, timeoutMs=15000)
  // ⚠️ ตั้ง listener ก่อน navigate เสมอ — ป้องกัน race condition
waitForTabReady(tabId)         // รอ tab ที่กำลัง loading
```

**CREATE Flow** (`handleFillRequest`)
```
1. navigateAndWait(createURL)
2. executeScript(fillAndSubmitProClinicForm)  ← click submit หลัง 400ms
3. waitForNavAwayFromCreate  ← รอ navigation event ถัดไป (NEXT event, ไม่ใช่ current state)
4. check !url.includes('/create') → extract proClinicId จาก URL
5. navigateAndWait(editURL)  ← เพื่อดึง HN
6. executeScript: document.querySelector('input[name="hn_no"]')?.value
7. reportBack LC_BROKER_RESULT { proClinicId, proClinicHN }
```

**UPDATE Flow** (`handleUpdateRequest`) — ⚠️ FETCH-BASED (ไม่ navigate tab!)
```
1. searchAndResolveId(HN → phone → name)
2. navigateAndWait(editURL)  ← แค่ดึง CSRF + form values
3. executeScript(submitProClinicEditViaFetch)
   → FormData(form) เพื่อเก็บ hidden fields ทั้งหมด
   → override: prefix, firstname, lastname, telephone_number, gender, note
   → fetch PUT redirect:'manual'
   → type==='opaqueredirect' → SUCCESS ✓ (server sent 302)
   → type==='basic' status 200 → FAIL (validation error, no redirect)
4. reportBack LC_UPDATE_RESULT
```
> ⚠️ ProClinic ALWAYS redirects กลับ /edit หลัง save สำเร็จ — ตรวจ URL ไม่ได้!
> ใช้ `redirect:'manual'` + ตรวจ response.type แทน

**DELETE Flow** (`handleDeleteRequest`)
```
1. searchAndResolveId ถ้าไม่มี proClinicId
2. navigateAndWait(listURL)  ← ดึง CSRF
3. executeScript: fetch POST _method=DELETE + check res.ok
4. reportBack LC_DELETE_RESULT
```

**Search Flow** (`searchAndResolveId`)
```
Round 1: HN search  → searchProClinicCustomers(HN) → เอาตัวแรก (HN unique)
Round 2: Phone      → searchProClinicCustomers(phone) → findBestMatch
Round 3: Name       → searchProClinicCustomers("firstname lastname") → findBestMatch
→ throw ถ้าไม่เจอ

searchProClinicCustomers:
  navigateAndWait(searchURL, 1200ms)  ← 1200ms รอ DOM render
  executeScript(extractCustomersFromSearchResults)
  → returns [{id, name, phone}]
```

### ProClinic DOM Selectors (สำคัญ)
```js
// Customer ID จาก list
'button.btn-delete[data-url]'  // data-url="/admin/customer/{id}"

// HN (อยู่ที่ edit page เท่านั้น)
'input[name="hn_no"]'  // value เช่น "000485"

// CSRF
'meta[name="csrf-token"]'

// Edit form
'form'  // form แรกในหน้า
```

### ProClinic Form Fields (PUT /admin/customer/{id})
ดูจาก FormData(form) จริงๆ มี fields เยอะมาก key ที่เราแตะ:
```
prefix, firstname, lastname, telephone_number, gender, note
_method=PUT, _token={csrf}  ← ต้องมีเสมอ
hn_no  ← ห้ามแตะ! ProClinic กำหนดเอง
```
ที่เหลือ (address, citizen_id ฯลฯ) → อ่านจาก FormData(form) แล้วส่งต่อเลย

### AdminDashboard.jsx — Broker Logic (Server API only, no Extension)

**Desync on Patient Edit** (ใน Firestore onSnapshot — ภายใน `if (oldS)` block)
เมื่อลูกค้าแก้ข้อมูล → **ไม่ auto-sync** แต่หลุด sync แทน → admin ต้องกด OPD ใหม่
```js
if (
  oldStr !== newStr              // patientData เปลี่ยน
  && newS.brokerStatus === 'done'
  && newS.brokerProClinicId
  && oldS.brokerStatus === 'done'
  && oldS.brokerProClinicId === newS.brokerProClinicId
  && lastAutoSyncedStrRef.current[newS.id] !== newStr
) {
  → updateDoc(ref, { brokerStatus: null, brokerError: null, brokerJob: null })
}
```
> ใช้ `brokerDesyncSessions` array แทน `brokerSyncSessions` เดิม
> Clinical summary sync ใช้ภาษาอังกฤษ ('en') ทุกจุดที่ส่งไป ProClinic

**Banner Logic** (useEffect ~line 332) — ⚠️ ต้องไม่ evaluate banner ขณะ brokerChanged
```js
const brokerChanged = brokerFields.some(k => viewingSession[k] !== latestSession[k]);
if (brokerChanged) {
  setViewingSession(latestSession);  // รอ render ถัดไป (ป้องกัน flash + banner ค้าง)
} else {
  dataOutOfSync ? setHasNewUpdate(true) : setHasNewUpdate(false);
}
// → Banner หายอัตโนมัติหลัง auto-sync สำเร็จ
```

**brokerFields ที่ sync อัตโนมัติ**:
```js
['brokerStatus','brokerProClinicId','brokerProClinicHN','brokerError',
 'opdRecordedAt','brokerFilledAt','brokerLastAutoSyncAt','depositProClinicId']
```

**OPD Button States**
```js
isDone    = !isPending && !!session.opdRecordedAt && session.brokerStatus === 'done'
isPending = brokerPending[id] || session.brokerStatus === 'pending'
isFailed  = !isPending && !isDone && session.brokerStatus === 'failed'
// disabled={isPending || isDone}  ← ป้องกัน double-click

// Deposit hasOPD (ใช้ brokerProClinicId แทน opdRecordedAt เพราะ serverTimestamp null ใน first snapshot):
hasOPD = !!session.brokerProClinicId && session.brokerStatus === 'done'
```

### Deposit Booking System (จองมัดจำ)

**Flow**: สร้างคิวจอง → ลูกค้าสแกน QR กรอกประวัติ → Admin ตรวจสอบ → กดบันทึกลง ProClinic (manual only)

**Session filtering** (onSnapshot handler):
```
allDocs → filter:
├── sessions         → !isArchived && !deposit-pending && !noDeposit-pending (+ timeout check)
├── archivedSessions → isArchived && !(deposit && !serviceCompleted) && !(isPermanent && !deposit && !serviceCompleted)
├── depositSessions  → formType === 'deposit' && !isArchived && !serviceCompleted
├── archivedDepositSessions → formType === 'deposit' && isArchived
├── noDepositSessions → isPermanent && formType !== 'deposit' && !serviceCompleted && !isArchived
└── archivedNoDepositSessions → isPermanent && formType !== 'deposit' && !serviceCompleted && isArchived
```
> Note: deposit sessions ที่ serviceCompleted แสดงในคิว (sessions) ไม่ใช่ deposit tab
> Note: noDeposit sessions ที่ "ลูกค้าเข้ารับบริการ" → serviceCompleted=true, isPermanent=false → ย้ายไปคิวเป็น 2hr timed

**Auto-sync guard**: `newS.formType !== 'deposit'` — ป้องกัน auto-sync สำหรับ deposit sessions

**"บันทึกลงการจอง" (handleDepositSync)** — Two-step manual:
```
First time:
  Step 1: fillProClinic(patient) → ได้ proClinicId + HN → set brokerStatus:'done'
  Step 2: submitDeposit(proClinicId, proClinicHN, deposit) → set depositSyncStatus:'done' + depositProClinicId
Re-sync (ลูกค้าแก้ข้อมูล):
  Step 1: updateProClinic(proClinicId, proClinicHN, patient) → update OPD data
  Step 2: updateDeposit(proClinicId, proClinicHN, depositProClinicId, deposit) → update deposit
  → clears isUnread after success
```

**Deposit re-sync trigger**: `dataUpdated = hasOPD && hasDeposit && session.isUnread`
- `hasOPD = !!session.brokerProClinicId && session.brokerStatus === 'done'` (ไม่ใช้ opdRecordedAt เพราะ serverTimestamp null ใน first snapshot)
- ปุ่มเปลี่ยนเป็นสีเหลือง + animate-pulse เมื่อ dataUpdated
- isUnread ไม่ clear เมื่อกดดูข้อมูล (ตา/edit) → clear เฉพาะเมื่อ handleDepositSync หรือ handleResync สำเร็จ

**"ยกเลิกการจอง" (handleDepositCancel)**:
```
cancelDeposit(proClinicId, proClinicHN) → cancel deposit + delete customer in ProClinic → archive + clear patientLink
```

**"ลูกค้าเข้ารับบริการ"**: sets `serviceCompleted:true, isPermanent:false, createdAt:serverTimestamp()` → ย้ายจาก deposit tab เข้า queue (แปลงเป็น 2-hour link) พร้อม QR code + tag "จองมัดจำ"

**Deposit eye/edit button**:
- แสดง Edit3 icon เมื่อรอ patient data, Eye icon เมื่อ data submitted
- สามารถดู/แก้ deposit data ได้แม้ patient ยังไม่กรอกฟอร์ม
- Viewer: "รอลูกค้ากรอกข้อมูล..." เมื่อไม่มี patientData, toolbar+grid+clinical summary ซ่อน
- ใช้ `d = viewingSession.patientData || {}` ป้องกัน crash + grid ซ่อนด้วย `style={display:'none'}` (OXC workaround)

**Deposit data editing**: When admin edits deposit data in viewing modal and session already synced → auto calls `updateDeposit()` to sync changes to ProClinic via `#editDepositModal` PUT
- Archived deposit sessions: ซ่อนปุ่ม "แก้ไขข้อมูล", "Resync ProClinic", "แก้ไข" ในส่วน deposit info

**Deposit confirm modal**: ทุกปุ่ม action (ลบ/ยกเลิก/เข้ารับบริการ) ใช้ styled modal แทน `window.confirm()`
- State: `depositToDelete = { session, action }` — red สำหรับ archive/cancel, blue สำหรับ complete
- แสดงชื่อลูกค้า + matching style กับ queue delete modal

**PatientLink cleanup**: เมื่อ OPD หลุด sync → clear `patientLinkToken: null, patientLinkEnabled: false`
- Flows ที่ trigger: handleOpdClick notFound, handleResync notFound, delete ProClinic, deposit cancel

**DatePickerThai component**: `function DatePickerThai({ value, onChange, className, placeholder })`
- แสดง DD/MM/YYYY readonly + Calendar icon, hidden `<input type="date">` opens on click
- value เก็บเป็น YYYY-MM-DD → compatible กับ ProClinic
- ใช้ใน deposit form (สร้าง + แก้ไข) ทั้ง depositDate และ appointmentDate

**brokerClient** (`src/lib/brokerClient.js`):
- `apiFetch(endpoint, body)` — internal helper, auto-attaches Firebase Auth token (`Authorization: Bearer`)
- ถ้า user ไม่ได้ login หรือ token หมดอายุ → return `{ success: false, error }` ไม่ยิง request
- **Auto-retry via extension**: เมื่อ `extensionNeeded:true` → send credentials + request sync → retry (timeout 30s)

```js
// CRUD
fillProClinic(patient)                                 // POST create customer
updateProClinic(proClinicId, proClinicHN, patient)     // POST update customer
deleteProClinic(proClinicId, proClinicHN, patient)     // POST delete customer
searchCustomers(query)                                 // POST search
getCourses(proClinicId)                                // POST get courses
testLogin()                                            // POST test login
// Import
fetchPatientFromProClinic(proClinicId)                   // POST fetchPatient → full patient data
// Deposit
getDepositOptions()                                    // GET dropdown options
getLivePractitioners({forceRefresh?})                  // GET doctors+assistants live from ProClinic (5-min cache)
invalidateLivePractitioners()                          // clear the 5-min cache
submitDeposit(proClinicId, proClinicHN, deposit)       // POST new deposit
updateDeposit(proClinicId, proClinicHN, depositProClinicId, deposit) // PUT existing
cancelDeposit(proClinicId, proClinicHN)                // POST cancel + DELETE customer
// Appointments
syncAppointments(month)                                // POST sync appointments for YYYY-MM → Firestore
fetchAppointmentMonths(year)                           // POST get appointment counts per month
// Master Data Sync
syncProducts()                                         // POST sync products from ProClinic
syncDoctors()                                          // POST sync doctors from ProClinic
syncStaff()                                            // POST sync staff from ProClinic
syncCourses()                                          // POST sync courses from ProClinic
// Admin
clearProClinicSession()                                // POST clear session cache
getProClinicCredentials()                              // GET credentials for extension
// Extension helpers
sendMessageToExtension(type, extra)                    // postMessage bridge (timeout 30s)
requestExtensionSync(forceLogin)                       // LC_SYNC_COOKIES
ensureExtensionHasCredentials()                        // fetch credentials → send to extension
```

**ProClinic deposit endpoints** (discovered via debug scraping):
- Create: POST `/admin/deposit` — `#createDepositModal` (62 fields)
- Edit: POST `/admin/deposit` with `_method=PUT` — `#editDepositModal` (12 fields)
- Cancel: POST `/admin/deposit/cancel` — `#cancelDepositModal` (deposit_id + cancel_note)

### Bug History (Broker Extension)
| Bug | Root Cause | Fix |
|-----|-----------|-----|
| Extension ไม่เปิด ProClinic tab ได้ | race condition: navigate เร็วกว่า listener | `navigateAndWait` ตั้ง listener ก่อน navigate |
| Search ไม่เจอเมื่อชื่อ+เบอร์เปลี่ยน | ไม่มี unique key ค้นหา | ดึง HN หลัง create, store `brokerProClinicHN`, ใช้ search |
| Update → button แดงเสมอแม้ save สำเร็จ | ProClinic redirects กลับ /edit เสมอ | เปลี่ยนเป็น fetch + `redirect:'manual'` + ตรวจ `type==='opaqueredirect'` |
| ProClinic refresh รัวๆ → CAPTCHA | URL-based detect บังคับ navigate 3 ครั้ง | fetch approach → navigate tab แค่ 1 ครั้ง (ดึง CSRF เท่านั้น) |
| Banner "มีข้อมูลอัปเดต" ไม่หาย | ไม่มีโค้ด clear banner | brokerChanged → skip → render ถัดไป clear อัตโนมัติ |
| Auto-sync fire ซ้ำหลัง create | guard `oldS.brokerProClinicId === newS.brokerProClinicId` ขาด | เพิ่ม guard ใน onSnapshot |
| Auto-sync รัวๆ หลังกด Report | Firestore อาจ batch snapshot (isUnread=false + broker update) ทำให้ prevRef stale | `lastAutoSyncedStrRef` track patientData ที่ sync แล้ว → skip ถ้า data เดิม |
| กดปุ่มแดง (retry) → สร้างคนใหม่ใน ProClinic | `handleOpdClick` ส่ง `LC_FILL_PROCLINIC` เสมอ แม้ผู้ป่วยมี HN อยู่แล้ว | ถ้า `brokerProClinicId \|\| brokerProClinicHN` มีอยู่ → ส่ง `LC_UPDATE_PROCLINIC` แทน |
| กดปุ่มแดง retry → spinner ไม่หาย | `LC_UPDATE_RESULT` handler ไม่ clear `brokerPending` / timeout | เพิ่ม `clearTimeout` + `setBrokerPending(...)` ใน `LC_UPDATE_RESULT` handler |

---

## Phase 9 Marketing — Promotion CRUD (Task 9.1, 2026-04-19)

Triangle-Rule verified: `opd.js forms /admin/promotion` = 27 form fields (2 modes).

**New files:**
- `src/components/backend/PromotionTab.jsx` — list + search + category/status filter + card grid. Reads `listPromotions()`, deletes via `brokerClient.deletePromotionInProClinic` then `deletePromotion` Firestore
- `src/components/backend/PromotionFormModal.jsx` — 27-field form: usage_type / name / receipt_name / code / category / procedure_type / deposit_price / sale_price / VAT toggle / promotion_type mode (fixed vs flexible, conditional min/max course+qty) / period toggle+DateField range / description / status / enable_line_oa_display (with is_price_line_display + button_label conditional) / scrollToError via data-field attrs. Deferred for 9.1b: cover_image multipart + courses/products sub-items.
- `src/lib/promotionValidation.js` — pure `validatePromotion(form)` + `emptyPromotionForm()` (extracted for unit-testing; consumed by PromotionFormModal)
- `api/proclinic/promotion.js` — POST /admin/promotion (create redirect captures id), POST /{id} with `_method=PUT` (update), POST /{id} with `_method=DELETE`. `buildPromotionFormData(data, csrf, defaults)` exported for tests. Mirrors successful writes to `pc_promotions/{id}` via Firestore REST PATCH with `updateMask.fieldPaths` (iron-clad rule B compliance).
- `tests/promotion.test.js` — 26 adversarial unit tests (V1-V12 + extras + F1-F10 + emptyForm baseline). Covers: name+whitespace, NaN/negative price, inverted min/max bounds (flexible only), period inverted/missing, fixed-mode skip, Laravel checkbox convention, defaults merge preserves unknown keys, etc.

**Existing files extended:**
- `src/lib/backendClient.js` (+55 LoC): `savePromotion(id, data)` / `deletePromotion(id)` / `listPromotions()` / `getPromotion(id)`. Write also mirrors 5 display fields to `master_data/promotions/items/{id}` so SaleTab's buy modal sees the new promotion without waiting for next ProClinic sync
- `src/lib/brokerClient.js` (+14 LoC): `createPromotion(data)` / `updatePromotion(id, data)` / `deletePromotionInProClinic(id)` wrappers around `apiFetch('promotion', {...})`
- `src/pages/BackendDashboard.jsx`: added `orange` to TAB_COLOR_MAP, `promotions` tab with Tag icon, routing branch, URL allowlist
- `firestore.rules`:
  - `be_promotions/{promotionId}` → `allow read, write: if isClinicStaff();`
  - `pc_promotions/{docId}` → `allow read: if isClinicStaff(); allow write: if true;` (matches pc_* pattern; server REST mirror writes without Firebase auth)
  - ⚠️ **Not deployed** — rules file updated but `firebase deploy --only firestore:rules` requires probe-deploy-probe per iron-clad B, awaiting user OK

**Firestore schema `be_promotions/{proClinicId}`** (full 27 core fields + audit):
```
proClinicId, usage_type ('clinic'|'branch'), promotion_name*, receipt_promotion_name,
promotion_code, category_name, procedure_type_name,
deposit_price, sale_price*, is_vat_included, sale_price_incl_vat,
promotion_type ('fixed'|'flexible'),
min/max_course_chosen_count, min/max_course_chosen_qty,
has_promotion_period, promotion_period_start, promotion_period_end,
description, status ('active'|'suspended'),
enable_line_oa_display, is_price_line_display, button_label,
createdAt (ISO), updatedAt (ISO)
```
(* = required; full 29 ProClinic fields minus cover_image multipart + courses/products subcollections — deferred.)

**Data flow — create**:
1. UI → `createPromotion(payload)` → Vercel serverless scrapes CSRF from `/admin/promotion` + POSTs form data → ProClinic returns 302 to `/admin/promotion/{id}/edit` → we capture `id`
2. Returns `{success, proClinicId}` to UI
3. UI → `savePromotion(proClinicId, payload)` → writes `be_promotions/{id}` + mirrors to `master_data/promotions/items/{id}`
4. `PromotionTab.reload()` → fresh list

**Data flow — delete**:
1. UI → `deletePromotionInProClinic(id)` → ProClinic DELETE
2. UI → `deletePromotion(id)` → removes Firestore doc + mirror

**Unknowns / follow-ups (v9.1b):**
- Actual encoding of `promotion_type` radio (`'fixed'|'flexible'` guess — need `opd.js network` capture on real submit)
- `status` serialization (`'active'|'suspended'` guess)
- `promotion_period` daterange format (`"YYYY-MM-DD to YYYY-MM-DD"` guess — Flatpickr default)
- Cover image multipart upload (current UI stores to Firebase Storage only, ProClinic image not pushed)
- Courses + products sub-items (need course/product picker modal — extract shared with SaleTab's picker)

---

## Phase 9 Task 9.2 Coupon CRUD (2026-04-19)

Triangle-verified: `opd.js forms /admin/coupon` — 10 fields + 5 branches.

**New files:**
- `src/components/backend/CouponTab.jsx` + `CouponFormModal.jsx` — list, search, type filter, expiry badge; create/edit form with `coupon_code` uppercase-locked, discount + type toggle (%/baht), max_qty, per-user limit, start/end dates, branch multi-select chips
- `src/lib/couponValidation.js` — `validateCoupon` / `emptyCouponForm` / `COUPON_BRANCHES` (5 entries — IDs 28/29/30/31/32 pending live verify)
- `api/proclinic/coupon.js` — CRUD + `buildCouponFormData` exported for tests; `branch_id[]` multi-append with default-merge clearing
- `tests/coupon.test.js` — 22 cases: CV1–CV10 validation + extra bounds + CF1–CF8 form-data + baseline

**Extensions:** `backendClient.js` adds `saveCoupon/deleteCoupon/listCoupons/getCoupon/findCouponByCode(code)` (for SaleTab apply flow — checks start/end window). `brokerClient.js` adds create/update/delete wrappers. `firestore.rules` gets `be_coupons` (admin) + `pc_coupons` (server-open). `BackendDashboard.jsx` adds `coupons` tab with Ticket icon.

## Phase 9 Task 9.3 Voucher CRUD (2026-04-19)

Triangle-verified: `opd.js forms /admin/voucher` — 5 platforms (HDmall/GoWabi/SkinX/Shopee/Tiktok), 10 fields.

**New files:**
- `src/components/backend/VoucherTab.jsx` + `VoucherFormModal.jsx` — cards with platform badge, commission %, period range; form with usage_type toggle, sale_price (Inc. VAT), commission %, platform select, period picker, status
- `src/lib/voucherValidation.js` — `validateVoucher` + `emptyVoucherForm` + `VOUCHER_PLATFORMS` constant (5 entries, intel showed 5 not 6 as prep memory guessed)
- `api/proclinic/voucher.js` — CRUD + `buildVoucherFormData` exported for tests; period serializes "YYYY-MM-DD to YYYY-MM-DD" same as promotion
- `tests/voucher.test.js` — 18 cases: VV1–VV10 validation (incl. platform whitelist) + VF1–VF6 form-data + baseline

**Extensions:** `backendClient.js` adds voucher CRUD. `brokerClient.js` adds wrappers. `firestore.rules` gets `be_vouchers` + `pc_vouchers`. `BackendDashboard.jsx` adds `vouchers` tab with Gift icon.

## Phase 9 Task 9.4 (deferred to 9.4b)

`opd.js forms /admin/online-sale` inspected 2026-04-19 — payment LIFECYCLE (pending → paid → completed) with slip upload + bank_account_id FK, not a simple CRUD. `master_data/bank_accounts` dropdown shows 2 trial accounts (IDs 11, 104). Task reduced for this cycle — deferred to a follow-up where the status machine + Storage slip push can be done properly alongside a matching `be_online_sales` collection.

## Phase 9 Task 9.5 SaleTab coupon apply (2026-04-19)

`src/components/backend/SaleTab.jsx` — existing `couponCode` input gets a "ใช้" button. On click:
1. `findCouponByCode(code)` — queries `be_coupons` where `coupon_code == code`, filters expired via start/end dates
2. Sets `billDiscount` + `billDiscountType` from coupon so existing billing math (`afterDiscount → afterMembership → afterDeposit → afterWallet → grandTotal`) picks it up automatically
3. Shows `✓ coupon_name` badge when applied; inline red message when not found

No refactor of billing math — coupon simply feeds the manual discount inputs.

---

## Phase 9 Rule of 3 opportunity (deferred)

After Task 9.3 there are 3 near-identical `*Tab.jsx` (PromotionTab/CouponTab/VoucherTab) and 3 near-identical `*FormModal.jsx` shells. Extraction candidate: `src/components/backend/MarketingTabBase.jsx` (list + search + filter + card grid) + a `MarketingFormShell.jsx` (header/footer/save button/error banner). Deferred to a post-merge refactor — current cost of 3 tab copies is tolerable given per-entity fields differ.

---

## Phase 11.1 Master Data Suite — scaffold (2026-04-20)

Nav restructure + 6 CRUD placeholders. No Firestore writes yet — full CRUD lands in 11.2-11.7.

**navConfig restructure:**
- Old `system` section (label "ระบบ") removed — absorbed into new `master` section (label "ข้อมูลพื้นฐาน") with 7 items
- Existing `masterdata` item: label renamed `ข้อมูลพื้นฐาน` → `Sync ProClinic` to clarify its seed-only role; ID preserved for URL back-compat
- 6 new stub items (all `color: amber`, section `master`, Phase 11.2-11.7 one-per-task): `product-groups` (FolderTree), `product-units` (Scale), `medical-instruments` (Wrench), `holidays` (CalendarX), `branches` (Building2), `permission-groups` (ShieldCheck)
- DF rates (doctor/assistance/group) NOT scaffolded in 11.x — moved to Phase 13 alongside payout calc

**New file:**
- `src/components/backend/ComingSoon.jsx` — shared placeholder card. Accepts `{icon, label, message, phaseTag, clinicSettings}`. Renders icon chip + title + message + phase tag. Rule C1 shared chrome for 6 stubs now + future scaffolds.

**Edits:**
- `src/components/backend/nav/navConfig.js` — `system` → `master` section, 6 new items, new icon imports (FolderTree/Scale/Wrench/CalendarX/Building2/ShieldCheck)
- `src/pages/BackendDashboard.jsx` — 6 new `activeTab === 'xxx'` branches pointing to `<ComingSoon icon label phaseTag message />`
- `tests/backend-nav-config.test.js` — test I4 (was "system owns masterdata only") rewritten to "master owns Sync ProClinic + 6 stubs"; L3 updated `'system' → 'master'`; added I4b/I4c
- `tests/phase11-master-data-scaffold.test.jsx` — 25 adversarial: M1-M11 nav shape + CS1-CS5 component render + E1-E2 Rule E grep + R1-R7 BackendDashboard deep-link routing

**Rule compliance:**
- **E** backend=Firestore ONLY: ComingSoon has zero broker/proclinic refs (E1/E2 greps guard this)
- **H** data ownership: all 6 stubs carry Phase 11.x phaseTag so future CRUD commits replace in-place
- **C1** Rule of 3: ComingSoon extracted BEFORE 3rd use (used 6× immediately; existing `ReportComingSoon` in BackendDashboard.jsx is a candidate for later consolidation)
- **F** Triangle: `opd.js routes` confirmed 6 target ProClinic routes (`/admin/product-group`, `/admin/default-product-unit`, `/admin/medical-instrument`, `/admin/holiday`, `/admin/branch`, `/admin/permission-group`) exist in trial server

Tests: 2085 → 2112 PASS (+27).

---

## Phase 11.2 Product Groups CRUD (2026-04-20)

First real CRUD tab of the Master Data Suite. Replaces Phase 11.1 ComingSoon stub with live `be_product_groups` collection + create/edit/delete UI.

**Schema (`be_product_groups`):**
- `groupId` — doc id, shape `GRP-{ts}-{8hex}` via shared `generateMarketingId('GRP')` from `marketingUiUtils.js` (Rule C2 crypto-random)
- `name` — trimmed, ≤ `NAME_MAX_LENGTH` (80)
- `productType` — enum 4: `ยา | สินค้าหน้าร้าน | สินค้าสิ้นเปลือง | บริการ` (matches ProClinic product_type)
- `status` — enum 2: `ใช้งาน | พักใช้งาน`
- `productIds[]` — FK into `master_data/products/items`; populated in Phase 11.8 wiring (StockTab chip picker)
- `note` — optional free-form
- `createdAt` / `updatedAt` ISO strings

**New files:**
- `src/lib/productGroupValidation.js` — `validateProductGroup(form) → [field,msg] | null`, `emptyProductGroupForm()`, `PRODUCT_TYPES` (Object.freeze), `STATUS_OPTIONS`, `NAME_MAX_LENGTH`
- `src/components/backend/ProductGroupFormModal.jsx` — reuses `MarketingFormShell` chrome; 4 fields (name / productType / status / note); shows linked-product count read-only in edit mode
- `src/components/backend/ProductGroupsTab.jsx` — reuses `MarketingTabShell` chrome; grid of cards with type colorization (rose/amber/sky/violet) + status badge; filter by productType / status + search

**Edits:**
- `src/lib/backendClient.js` — appends 5 fns: `listProductGroups` (sort updatedAt desc, ties by createdAt), `getProductGroup`, `saveProductGroup` (trims, defaults status/productIds/note), `deleteProductGroup`, `findProductGroupByName` (case-insensitive)
- `src/pages/BackendDashboard.jsx` — swaps the Phase 11.1 ComingSoon stub branch to `<ProductGroupsTab>` for `activeTab === 'product-groups'`
- `firestore.rules` — new Phase-11 section with 6 `be_*` collections (product_groups / product_units / medical_instruments / holidays / branches / permission_groups), all `allow read, write: if isClinicStaff()`. Adding all 6 in this commit lets Rule B probe-deploy-probe fire once instead of 6 times during 11.3-11.7.
- `tests/phase11-master-data-scaffold.test.jsx` — R1 updated (product-groups now real, no longer ComingSoon); added `ProductGroupsTab` mock so scaffold test stays independent of 11.2 internals

**New tests — `tests/productGroup.test.jsx` — 45 adversarial:**
- PV1-PV15 validator (null form, blank name, whitespace, non-string, boundary, enum drift, array shape)
- PC1-PC5 constants (freeze, Thai-only, length bounds, no dupes)
- PE1-PE2 emptyForm shape + no-shared-mutation
- E1-E3 Rule E grep (validator/tab/modal don't import brokerClient; firestore.rules has the new block)
- PU1-PU10 Tab flow (empty state, render, search, type filter, status filter, delete confirm yes/no/error, load error, product count badge)
- PM1-PM10 Modal flow (create/edit modes, validation blocks save, new id on create, preserve id on edit, save error, ESC close, 4-option select, trim on save, linked-product count)

**Rule compliance:**
- **B** probe-deploy-probe: firestore.rules modified but NOT deployed — next `firebase deploy --only firestore:rules` MUST run curl-probe on chat_conversations + pc_appointments before AND after per iron-clad B
- **C1** Rule of 3: ProductGroupFormModal/Tab reuse `MarketingFormShell`/`MarketingTabShell` instead of forking (4th use of the shared chrome now)
- **C2** security: id via `generateMarketingId('GRP')` which wraps `crypto.getRandomValues` (never Math.random)
- **C3** lean schema: justified — reader (SaleTab/StockTab will pick categories), writer (this tab), shape doesn't fit existing master_data (ProClinic-origin vs OUR-origin split per Rule H)
- **D** adversarial: 45 tests span validator branches + UI edge cases + Rule-E static
- **E** Firestore only: static E1/E2/E3 greps guard every file in scope
- **F** Triangle: Plan memory field list (group_name/product_type) matches ProClinic intel captured 2026-04-20
- **H** data ownership: be_product_groups is OUR canonical; master_data/products stays read-only-from-sync

Tests: 2112 → 2157 PASS (+45).

---

## Phase 11.3 Product Unit Groups CRUD (2026-04-20)

Conversion-group model — Triangle (Rule F) captured via fresh `opd.js forms /admin/default-product-unit` after quick-login. ProClinic uses `product_unit_group_name` + `unit_name[]` + `unit_amount[]` (row 0 = smallest with implicit amount=1). Plan memory had oversimplified schema; fresh intel corrected it before code.

**Schema (`be_product_units`):**
- `unitGroupId` — `UNIT-{ts}-{8hex}` via `generateMarketingId('UNIT')`
- `groupName` — trimmed, ≤ `GROUP_NAME_MAX_LENGTH` (80)
- `units[]` — array 1..MAX_UNITS (10):
  - `name` — trimmed, ≤ `UNIT_NAME_MAX_LENGTH` (40), unique case-insensitive within group
  - `amount` — integer ≥ 1; row 0 LOCKED to 1 (base rule)
  - `isBase` — `true` on row 0, `false` elsewhere (enforced by normalizer)
- `status` / `note` — same pattern as Phase 11.2
- `createdAt` / `updatedAt` ISO

**New files:**
- `src/lib/productUnitValidation.js` — `validateProductUnitGroup` (null form, non-string group, bounds, array shape, < MIN / > MAX units, dup names, amount < 1 / non-int / base-amount=1, multi-base rejection), `normalizeProductUnitGroup` (trim, force row 0 base, reset non-base isBase), `emptyProductUnitGroupForm` (1-row seed), 6 frozen constants
- `src/components/backend/ProductUnitFormModal.jsx` — dynamic add/remove rows; base row has readOnly amount + emerald BASE badge; higher rows show `× {baseName}` suffix
- `src/components/backend/ProductUnitsTab.jsx` — card shows conversion chain preview (1 base = smallest; 1 higher → N base); reuses MarketingTabShell (5th use)

**Edits:**
- `src/lib/backendClient.js` — +5 fns (`listProductUnitGroups`, `getProductUnitGroup`, `saveProductUnitGroup`, `deleteProductUnitGroup`, `findProductUnitGroupByName`); `saveProductUnitGroup` dynamically imports validator + normalizer so Firestore never stores inconsistent base flag
- `src/pages/BackendDashboard.jsx` — swap ComingSoon → ProductUnitsTab for `product-units`
- `tests/phase11-master-data-scaffold.test.jsx` — R2 updated (no longer ComingSoon); added ProductUnitsTab mock

**New tests — `tests/productUnit.test.jsx` — 51 adversarial:**
- PUV1-PUV20 validator (happy / null / whitespace / bounds / per-row name+amount / dup name case-insensitive / base=1 rule / multi-base rejection / single-unit group accept / status enum)
- PUN1-PUN5 normalizer (trim, force base, reset non-base, default status, trim units)
- PUC1-PUC4 constants (frozen, MIN/MAX sanity)
- PUE1-PUE2 empty form (1-row seed + no-shared-mutation)
- E1-E2 Rule E import-only grep
- PUT1-PUT8 Tab flow (empty, conversion chain display, search matches unit names not just group, status filter, delete confirm yes/no, load error, unit count badge)
- PUM1-PUM10 Modal flow (create/edit mode, add/remove rows, validate block, crypto id on create, id preserved on edit, save error, base readOnly, ESC close)

**Rule compliance:**
- **B**: firestore.rules already covers be_product_units (shipped in 11.2 batch) — no re-deploy needed this commit
- **C1**: 5th reuse of MarketingFormShell/MarketingTabShell chrome
- **C2**: id via `generateMarketingId('UNIT')` — crypto-random
- **C3**: justified — distinct conversion-group concern not fitting existing collections
- **D**: 51 adversarial cases across validator + normalizer + UI + Rule-E static
- **E**: zero broker/proclinic imports (E1/E2 greps)
- **F**: Triangle re-run on CF-blocked route; corrected plan schema before coding
- **H**: OUR canonical data; no write-back to ProClinic; master_data unaffected

Tests: 2157 → 2208 PASS (+51).

---

## Phase 11.4 Medical Instruments CRUD (2026-04-20)

Equipment registry with maintenance scheduling. Fields match ProClinic (Triangle via `opd.js forms /admin/medical-instrument`) + extensions (status enum, note, maintenanceLog).

**Schema (`be_medical_instruments`):**
- `instrumentId` — `INST-{ts}-{8hex}` via `generateMarketingId('INST')`
- `name` — trimmed, ≤ 120, required
- `code` — ≤ 40, optional
- `costPrice` — number ≥ 0 or null, optional
- `purchaseDate` — `YYYY-MM-DD` via DateField (rule 04 Thai-UI), optional
- `maintenanceIntervalMonths` — integer ≥ 0 or null, optional
- `nextMaintenanceDate` — `YYYY-MM-DD` via DateField, must be ≥ `purchaseDate` when both set
- `maintenanceLog[]` — array ≤ 50, each entry `{date, cost?, note?, performedBy?}`
- `status` — enum 3: `ใช้งาน | พักใช้งาน | ซ่อมบำรุง`
- `note`, `createdAt`, `updatedAt`

**Helper:** `daysUntilMaintenance(nextDate, today) → number | null` — negative = overdue. Used in tab card to render a traffic-light badge (overdue red / ≤30d amber / > 30d neutral).

**New files:**
- `src/lib/medicalInstrumentValidation.js` — validator (null form, blank name, bounds, numeric/date formats, cross-field rule, log array shape, per-entry shape, 50-entry cap), normalizer (trim, coerce to null on empty, drop log entries w/o date), `daysUntilMaintenance` helper, 4 frozen constants
- `src/components/backend/MedicalInstrumentFormModal.jsx` — 8 top-level fields + nested maintenanceLog editor with add/remove rows; 2 DateField pickers (purchaseDate, nextMaintenanceDate); 4 sub-fields per log entry (date, cost, note, performedBy)
- `src/components/backend/MedicalInstrumentsTab.jsx` — 6th reuse of MarketingTabShell; card shows cost (Thai locale) + maintenance badge + log count

**Edits:**
- `src/lib/backendClient.js` — +4 CRUD fns (no `findByName` — code/name dedup would need fuzzy match; deferred); `saveMedicalInstrument` dynamically imports validator+normalizer
- `src/pages/BackendDashboard.jsx` — swap ComingSoon → MedicalInstrumentsTab
- `tests/phase11-master-data-scaffold.test.jsx` — R3 updated + mock added

**New tests — `tests/medicalInstrument.test.jsx` — 43 adversarial:**
- MIV1-MIV16 validator (minimal pass, null/array form, name rules + bound, code optional+bound, costPrice optional+negative+0+positive, purchaseDate ISO strict, maintenance interval integer+≥0, nextMaintenanceDate format + cross-field ≥ purchaseDate, status enum, log array + entries + cap)
- MIN1-MIN5 normalizer (trim, coerce number, default status, drop date-less entries, trim log entries)
- MID1-MID5 `daysUntilMaintenance` (null, future, today=0, overdue negative, cross-month boundary)
- E1-E2 Rule E import-only greps
- MIT1-MIT7 Tab (empty, cards with Thai-locale cost, search note, status filter, delete yes, load error, log count badge)
- MIM1-MIM8 Modal (create/edit modes, validation block, crypto id, add log row, remove log row, edit id preserve, ESC close)

**Rule compliance:**
- **C1**: 6th reuse of shell chrome; DateField is canonical per iron-clad rule 04
- **C2**: INST-prefix crypto id
- **D**: 43 adversarial
- **E**: E1/E2 import-only greps
- **F**: Fresh Triangle verified field set — confirmed all 6 ProClinic fields + validated cross-field rule (nextMaintenanceDate ≥ purchaseDate)
- **H**: OUR canonical; maintenanceLog array is OUR extension (not in ProClinic)

Tests: 2208 → 2251 PASS (+43).

---

## Phase 11.5 Holidays CRUD (2026-04-20)

Two-type holiday entity (`specific` dates + `weekly` day-of-week) with pure `isDateHoliday()` decider ready for wiring into AppointmentTab calendar + schedule-link `shouldBlockScheduleSlot` consumer.

**Schema (`be_holidays`):**
- `holidayId` — `HOL-{ts}-{8hex}`
- `type` — enum `specific | weekly` (discriminator)
- `dates[]` (type=specific) — 1..60 unique `YYYY-MM-DD` strings
- `dayOfWeek` (type=weekly) — integer 0..6 (0=Sun in JS Date.getUTCDay)
- `note` — optional, ≤ 200
- `status` — enum `ใช้งาน | พักใช้งาน` (พักใช้งาน = skipped by `isDateHoliday` so admin can temporarily lift a holiday without deleting)

**New files:**
- `src/lib/holidayValidation.js` — `validateHoliday`, `normalizeHoliday` (dedup+sort dates, clamp dayOfWeek, delete unused discriminator field), `emptyHolidayForm`, `isDateHoliday(dateStr, holidays) → Holiday | null` pure decider, `DAY_OF_WEEK_LABELS` Thai frozen const (อาทิตย์..เสาร์)
- `src/components/backend/HolidayFormModal.jsx` — type toggle (specific/weekly); DateField picker + "เพิ่มวัน" button for specific mode → dates rendered as removable chips; 7-button day-of-week grid for weekly mode
- `src/components/backend/HolidaysTab.jsx` — 7th shell reuse; cards show either date chips (first 6 + "+ N" overflow) or day-of-week badge

**Edits:**
- `src/lib/backendClient.js` — +4 CRUD fns (`list/get/save/delete`); `saveHoliday` dyn-imports validator+normalizer
- `src/pages/BackendDashboard.jsx` — swap ComingSoon → HolidaysTab
- `tests/phase11-master-data-scaffold.test.jsx` — R4 updated + mock

**New tests — `tests/holiday.test.jsx` — 42 adversarial:**
- HV1-HV13 validator (specific/weekly happy paths, null/array form, bad type, 0-date specific, malformed date, dup dates, 60-cap, dayOfWeek integer+range, note string+bound, status enum, HOLIDAY_TYPES frozen)
- HN1-HN5 normalizer (dedup+sort, drop invalid dates, clamp dayOfWeek 0..6, drop unused discriminator field, trim+default status)
- HIS1-HIS8 `isDateHoliday` (empty+bad input, specific match, multi-date range, weekly Sunday/Saturday with UTC-safe getUTCDay, skip พักใช้งาน, first-match wins, null-safe over array)
- C1-E2 constants + Rule E imports
- HT1-HT6 Tab (empty, specific card with date chips, weekly card with Thai dow label, type filter, search matches date string, delete confirm YES)
- HM1-HM7 Modal (specific default, toggle to weekly reveals 7-day grid, validate blocks empty, weekly crypto id HOL-, edit prefill dates, remove chip, ESC)

**Bug caught by test — JSX lowercase-variable dot access**: first draft used `<typeCfg.icon />` which fails React's JSX tag parser (lowercase start = HTML tag). Fixed by capitalizing: `const TypeIcon = typeCfg.icon; <TypeIcon/>`. Also fixed duplicate text rendering (note in h3 AND in bottom `<p>`) — pruned redundant p for specific type.

**Rule compliance:**
- **C1**: 7th shell reuse; DateField canonical
- **C2**: HOL crypto id
- **D**: 42 adversarial cases including `isDateHoliday` UTC-safe day-of-week (prevents Thai TZ drift same class as `thaiTodayISO` hazard)
- **E**: E1/E2 import-only greps
- **F**: Triangle captured ProClinic `holiday_date` (multi-date flatpickr) + `holiday_note`; extended with type discriminator + weekly mode for OUR clinic-use semantics
- **H**: OUR canonical; pure `isDateHoliday` helper ready for 11.8 wiring into scheduleFilterUtils.js

Tests: 2251 → 2293 PASS (+42).

---

## Phase 11.6 Branches CRUD (2026-04-20)

Core 13 branch fields + isDefault flag + unique-default enforcement via writeBatch. 7-day opening schedule deferred to Phase 13 (pairs with staff schedule + booking).

**Schema (`be_branches`):**
- `branchId` — `BR-{ts}-{8hex}`
- Identification: `name` (required, ≤ 120), `nameEn`
- Contact: `phone` (required, regex `0[0-9]{8,10}`), `website` (optional, must be http(s)://)
- Legal: `licenseNo`, `taxId`
- Address: `address` (≤ 500), `addressEn` (≤ 500 — for English-doc printing)
- Map: `googleMapUrl` (http(s)://), `latitude` (-90..90), `longitude` (-180..180)
- Our: `isDefault` boolean, `status` (ใช้งาน/พักใช้งาน), `note` (≤ 200)
- Timestamps

**Unique-default invariant**: when saving a branch with `isDefault: true`, `saveBranch` clears `isDefault` on all other branches in a `writeBatch` — so exactly one default exists at a time. Prevents ambiguity for future "use default branch" picker defaults.

**New files:**
- `src/lib/branchValidation.js` — validate (Thai phone regex strict, URL regex for website/map, lat/lng range, length bounds), normalize (trim + strip phone whitespace/dashes + coerce numbers), empty form, 4 frozen consts
- `src/components/backend/BranchFormModal.jsx` — 3xl modal (wide), 13 inputs arranged in grid + isDefault checkbox; explicit Phase-13 note at bottom about deferred hours
- `src/components/backend/BranchesTab.jsx` — 8th shell reuse; card shows name + nameEn + default badge (⭐) + phone + address snippet + Google Maps link

**Edits:**
- `src/lib/backendClient.js` — +4 CRUD fns; sort order is isDefault-first → newest-first; saveBranch uses writeBatch to enforce default-uniqueness
- `src/pages/BackendDashboard.jsx` — swap ComingSoon → BranchesTab
- `tests/phase11-master-data-scaffold.test.jsx` — R5 updated + mock

**New tests — `tests/branch.test.jsx` — 34 adversarial:**
- BV1-BV15 validator (minimal, null/array, blank name, bounds, non-string, missing phone, Thai phone regex 7/8/9/10/11-digit boundaries + no-0 prefix reject, phone accepts spaces/dashes, website URL validation, map URL validation, lat -91/91/boundaries/text, lng -181/181, address+addressEn length, status enum, isDefault boolean)
- BN1-BN4 normalizer (trim + strip phone chars, empty→null, string→number, defaults + truthy isDefault)
- E1-E2 Rule E import-only greps
- BT1-BT6 Tab (empty, card with phone/default badge, search nameEn+taxId, status filter, delete confirm YES, load error)
- BM1-BM7 Modal (create/edit, validation block, BR crypto id, bad phone surfaces, id preserve, ESC)

**Rule compliance:**
- **C1**: 8th shell reuse
- **C2**: BR crypto id
- **C3**: justified: distinct address/contact/geo concern
- **D**: 34 adversarial, esp. phone regex 5-point boundary
- **E**: E1/E2 greps
- **F**: Triangle captured 18+ ProClinic fields; shipped core 13 with lat/lng + bilingual; 7-day schedule deferred with explicit note
- **H**: OUR canonical; unique-default enforcement is OUR invariant

Tests: 2293 → 2327 PASS (+34).

---

## Phase 11.7 Permission Groups CRUD (2026-04-20)

Role-based access control. 130 ProClinic permissions mirrored across 14 modules, rendered as collapsible checkbox matrix. Flat `Record<string, boolean>` storage. `hasPermission(group, key)` pure helper is ready for Phase 11.8 tab/button gating.

**Schema (`be_permission_groups`):**
- `permissionGroupId` — `ROLE-{ts}-{8hex}`
- `name` (required, ≤ 80), `description` (≤ 300)
- `permissions` — Record<string, true>; falsy values NOT persisted (absent key = not granted)
- `status`, timestamps

**Seed: `PERMISSION_MODULES`** — 14 modules × 1-40+ items = ~130 keys covering ProClinic surface:
dashboard / customer / appointment / treatment / sale / course_membership / finance / stock / marketing / df / document / analytics / reports / settings.

**New files:**
- `src/lib/permissionGroupValidation.js` — validate (shape check of Record<string, boolean>, enum-only status), normalize (drops unknown keys + drops false entries so doc stays compact), `countPermissions(permissions) → n`, `hasPermission(group, key) → boolean` pure helpers, `PERMISSION_MODULES` + `ALL_PERMISSION_KEYS` frozen seeds
- `src/components/backend/PermissionGroupFormModal.jsx` — 3xl modal; master "ใช้งานทุกระบบ" toggle mirrors ProClinic's `permission-all`; 14 collapsible module sections each with "ทั้งหมด" cascade checkbox (with `indeterminate` when partial); auto-expand modules with granted permissions on edit
- `src/components/backend/PermissionGroupsTab.jsx` — 9th shell reuse; card shows permission-count + gradient progress bar (sky → amber)

**Edits:**
- `src/lib/backendClient.js` — +4 CRUD fns
- `src/pages/BackendDashboard.jsx` — swap ComingSoon → PermissionGroupsTab
- `tests/phase11-master-data-scaffold.test.jsx` — R6 updated + mock

**New tests — `tests/permissionGroup.test.jsx` — 36 adversarial:**
- PGV1-PGV10 validator (null/array form, blank name, non-string, bounds, description optional+type+length, permissions object shape, boolean values, status enum, 130 real keys)
- PGN1-PGN5 normalizer (trim, drop false entries, drop unknown keys, default status, non-object→empty map)
- PGS1-PGS4 seed integrity (frozen, id/label/items, unique keys with Thai labels, ALL_PERMISSION_KEYS = flatten; ≥ 100 sanity floor)
- PGH1-PGH4 helpers (countPermissions, hasPermission boolean + null-safe + rejects non-true)
- E1-E2 Rule E
- PGT1-PGT5 Tab (empty, card with count + progress, search description, delete, error)
- PGM1-PGM6 Modal (create blank, validate, ROLE crypto id, "ใช้งานทุกระบบ" grants ≥ 100 permissions in single toggle, edit prefill, ESC)

**Rule compliance:**
- **C1**: 9th shell reuse
- **C2**: ROLE crypto id
- **C3**: distinct concern; Record<string, bool> avoids premature sub-collection per permission
- **D**: 36 adversarial including master-toggle payload size assertion
- **E**: E1/E2 greps
- **F**: Triangle captured all 130+ ProClinic permissions via grep over form fields; organized into 14 user-friendly modules
- **H**: OUR canonical; normalize drops unknown keys so future ProClinic-only permissions don't pollute OUR map

Tests: 2327 → 2363 PASS (+36).
