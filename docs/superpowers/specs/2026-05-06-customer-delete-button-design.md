# Customer Delete Button — Design Spec

**Date**: 2026-05-06
**Status**: Locked (pending user spec review → writing-plans)
**Phase tag**: Phase 24.0 (next available)
**Author**: brainstormed via `Skill(brainstorming)` Q1-Q4 with user
**Related rules**: Rule M (data ops audit), Rule J (brainstorming HARD-GATE), V31 (cascade-delete discipline), V35 (cleanup-test-* endpoint pattern)

---

## 1. Problem statement

User directive (verbatim, 2026-05-06):

> เพิ่มปุ่มลบลูกค้าแต่ละรายใน tab=customers ของ backend เลย โดยเลข HN ที่เคยใช้ไปแล้ว จะไม่ถูกนำกลับมาใช้อีกเช่น บันทึกนาย A เป็น HN003 หลังจากนั้นลบข้อมูลนาย A ทิ้ง ลูกค้าคนต่อไป นาย B จะได้ HN004 เลย ไม่ซ้ำ HN003 เดิมที่เคยใช้ไปแล้ว

Translation:
- Add a per-customer **delete** button in the BackendDashboard customers tab.
- HN numbers must NEVER be reused after a delete — if customer A is HN003 and gets deleted, the next customer B must get HN004 (not recycle HN003).

---

## 2. Pre-existing infrastructure (already shipped)

### 2.1 HN counter is already monotonic (no change needed)

[`src/lib/backendClient.js:606-620`](src/lib/backendClient.js:606) — `generateCustomerHN()` uses an atomic Firestore counter at `be_customer_counter/counter` that ONLY increments:

```js
const seq = await runTransaction(db, async (tx) => {
  const snap = await tx.get(ref);
  let nextSeq = 1;
  if (snap.exists()) {
    const data = snap.data();
    if (data.year === yearStr) nextSeq = (data.seq || 0) + 1;
  }
  tx.set(ref, { year: yearStr, seq: nextSeq, ... });
  return nextSeq;
});
return `LC-${yearStr}${String(seq).padStart(6, '0')}`;
```

[`src/lib/backendClient.js:786-819`](src/lib/backendClient.js:786) — `deleteCustomerCascade()` deletes the customer doc + 8 cascade collections but **never touches the counter**. The HN-no-reuse requirement is therefore already enforced by infrastructure. This spec only adds **regression test coverage** for the property — no counter changes.

### 2.2 `deleteCustomerCascade` exists but is unwired

The function is implemented (cascade across 8 collections, batched chunks of 450 to respect Firestore's 500-write limit) and exported via `scopedDataLayer`. Phase 20.0 task 5b removed the old kiosk handler and commented "cascade-delete relocated to BackendDashboard" — but the relocation never landed. The button + modal in this spec is that relocation.

### 2.3 Existing cascade collection list

Currently `deleteCustomerCascade` cascades:
1. `be_treatments`
2. `be_sales`
3. `be_deposits`
4. `be_wallets`
5. `be_wallet_transactions`
6. `be_memberships`
7. `be_point_transactions`
8. `be_appointments`

**Gaps surfaced during this spec's pre-write inventory** (queries with `where('customerId', '==', ...)` that point at collections NOT in the cascade list):
- `be_course_changes` — V36-quinquies audit log of course usage. **Add to cascade.**
- `be_customer_link_tokens` — one-time LINE link tokens (V32-tris-quater; client-blocked `read,write: if false`). Token doc carries `customerId` field at mint time. Admin SDK can query + delete. **Add to cascade** (tokens are 24h-TTL so typically 0-1 pending; clean for completeness).
- `be_link_requests` — admin-mediated LINE link queue. Has `customerId` field after approval. **Add to cascade.**

**Total cascade collections after this spec**: **11** (8 existing + 3 added).

**Out-of-scope (deferred, NOT changed by this spec)**:
- `opd_sessions` — kiosk session docs reference customers via `brokerProClinicId`. Deleting these is policy-decision-pending (sessions can predate customer doc creation; may want to NULL the field instead of deleting). Spec recommendation: **leave opd_sessions in place; admin can manually delete via separate flow if needed.** Captured as follow-up in §10.
- Image/file uploads in Firebase Storage (`profile_image`, `gallery_upload` URLs). Cascade only deletes Firestore docs; storage objects orphaned. Captured as follow-up.

---

## 3. Locked design decisions

| # | Decision | Rationale |
|---|---|---|
| **Q1** | **Option C** — inline ✕ icon on every `CustomerCard` (top-right, ghost style) **AND** prominent "ลบลูกค้า" button on `CustomerDetailView` header | Both surfaces match user request; modal gate (Q2) is the same → either entry point routes through identical confirmation flow |
| **Q2** | Native-styled minimal modal (`<div>` overlay, NOT `window.confirm()`) with body containing 3 **required** dropdowns (พนง / ผู้ช่วย / แพทย์) populated from the customer's `branchId` roster, then ลบ + ยกเลิก buttons | All 3 dropdowns required so admin must explicitly identify the on-duty staff/assistant/doctor authorizing the delete. Forensic accountability per Thai clinic ops convention |
| **Q3** | Dual gate: `useHasPermission('customer_delete') \|\| isAdmin` — new perm key declared in `permissionGroupValidation.js`, plus admin-claim escape hatch | Mirrors Phase 16.3 `system_config_management` pattern. Admin can delegate to senior staff without granting full owner. V25/V26 lesson: never lock everyone out via perm-config bug |
| **Q4** | Server endpoint `/api/admin/delete-customer-cascade` — admin-SDK bypasses rules, atomically deletes + writes audit doc | Half-state risk if browser closes mid-flow on client-side flow. Single round trip + cascade snapshot capture done server-side. Mirrors V35 `cleanup-test-products` pattern |

---

## 4. Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│ BackendDashboard.jsx (customers tab)                               │
│                                                                     │
│  ┌──────────────────┐    ┌─────────────────────────────────────┐  │
│  │ CustomerListTab  │ ▶  │ CustomerCard (each row)              │  │
│  └──────────────────┘    │   • avatar / name / HN / phone        │  │
│                          │   • inline ✕ icon (admin/perm only)   │  │
│                          └─────────────────────────────────────┘  │
│                                       │                             │
│                                       ▼ (click ✕ OR detail view)   │
│                          ┌─────────────────────────────────────┐  │
│                          │ DeleteCustomerCascadeModal (NEW)     │  │
│                          │   • Title: ยืนยันลบลูกค้า X พร้อม    │  │
│                          │     ประวัติทั้งหมด?                  │  │
│                          │   • Cascade preview: counts of 9     │  │
│                          │     collections about to be deleted   │  │
│                          │   • 3 required dropdowns:            │  │
│                          │     - พนักงาน (be_staff @ branch)    │  │
│                          │     - ผู้ช่วยแพทย์ (be_doctors filt) │  │
│                          │     - แพทย์ (be_doctors @ branch)    │  │
│                          │   • Buttons: ยกเลิก / ลบถาวร         │  │
│                          └─────────────────────────────────────┘  │
│                                       │                             │
│                                       ▼ on confirm                 │
└────────────────────────────────────────────────────────────────────┘
                                        │
                                        ▼ POST { customerId, authorizedBy: {...} }
                       ┌────────────────────────────────────────────┐
                       │ /api/admin/delete-customer-cascade.js       │
                       │  (NEW server endpoint)                       │
                       │   1. verifyIdToken + assert admin OR perm    │
                       │   2. read customer doc (snapshot capture)    │
                       │   3. count linked docs across 9 collections  │
                       │   4. atomically delete via batched writes    │
                       │   5. write be_admin_audit doc                │
                       │   6. return { success, cascadeCounts }       │
                       └────────────────────────────────────────────┘
                                        │
                                        ▼
                       ┌────────────────────────────────────────────┐
                       │ Firestore                                    │
                       │  • be_customers/{id}                deleted  │
                       │  • be_treatments where customerId   deleted  │
                       │  • be_sales where customerId        deleted  │
                       │  • be_deposits where customerId     deleted  │
                       │  • be_wallets where customerId      deleted  │
                       │  • be_wallet_transactions where ... deleted  │
                       │  • be_memberships where customerId  deleted  │
                       │  • be_point_transactions where ...  deleted  │
                       │  • be_appointments where customerId deleted  │
                       │  • be_course_changes where ...      deleted  │
                       │  • be_link_requests where ...       deleted  │
                       │  • be_customer_link_tokens where .. deleted  │
                       │  • be_admin_audit/customer-delete-* CREATED  │
                       └────────────────────────────────────────────┘
```

---

## 5. Components

### 5.1 NEW: `DeleteCustomerCascadeModal.jsx`

`src/components/backend/DeleteCustomerCascadeModal.jsx`

**Props**:
- `customer` (required) — full customer doc (including `id`, `branchId`, `firstname`, `lastname`, `hn_no`)
- `onClose()` — close without deleting
- `onDeleted(result)` — called after server confirms delete (parent re-fetches list / closes detail view / shows toast)

**State**:
- `staffList`, `assistantList`, `doctorList` — branch-scoped rosters fetched on mount via `listStaff` + `listDoctors` filtered by `customer.branchId` (universal markers preserved)
- `staffId`, `assistantId`, `doctorId` — selected dropdown values, all start `''`
- `cascadeCounts` — fetched on mount via lightweight server preflight OR computed client-side via parallel `getDocs` queries (decision in implementation plan; recommend server preflight for atomic snapshot consistency)
- `loading`, `error` — UI state

**Render**:
- Native-styled overlay (Tailwind `fixed inset-0 bg-black/80 backdrop-blur-sm`)
- Card body with title + cascade preview + 3 dropdowns + buttons
- ลบถาวร button **disabled** until all 3 dropdowns selected AND no inflight request
- Thai error messages (Rule 04)
- Cascade-counts row example: `5 การรักษา · 12 การขาย · 3 มัดจำ · 1 wallet · 8 wallet tx · 0 membership · 4 point tx · 7 นัดหมาย · 2 course changes · 0 link requests`

### 5.2 MODIFY: `CustomerCard.jsx`

- Add inline ✕ icon (lucide `Trash2` size 14) top-right of card
- Visible only when `useHasPermission('customer_delete') || isAdmin`
- onClick → `e.stopPropagation()` (don't open detail view) → opens `DeleteCustomerCascadeModal` with this customer

### 5.3 MODIFY: `CustomerDetailView.jsx`

- Add prominent "ลบลูกค้า" button in the detail-view header (red destructive style)
- Same gate (perm OR admin)
- onClick → opens the same modal

### 5.4 MODIFY: `CustomerListTab.jsx`

- Add modal-state management (`deletingCustomer`, `setDeletingCustomer`)
- Render `<DeleteCustomerCascadeModal>` when `deletingCustomer` truthy
- On `onDeleted` → re-fetch list, close any open detail view if it was for this customer, toast "ลบลูกค้าเรียบร้อย"

---

## 6. NEW server endpoint: `/api/admin/delete-customer-cascade`

`api/admin/delete-customer-cascade.js`

**Request** (`POST`):
```json
{
  "customerId": "LC-26000003",
  "authorizedBy": {
    "staffId": "BS-...",       "staffName":   "Wee 523",
    "assistantId": "BD-...",   "assistantName": "Tum",
    "doctorId": "BD-...",      "doctorName":   "Dr. A"
  }
}
```

**Auth**: verifyIdToken → assert `admin === true` OR `customer_delete === true` claim. Per Phase 16.3 narrow-claim pattern.

**Validation**:
- `customerId` non-empty string, exists in `be_customers`
- `authorizedBy.{staffId, assistantId, doctorId}` all non-empty
- staffName/assistantName/doctorName: validate against be_staff / be_doctors lookups (server-side cross-check — admin can't fake names client-side)
- All 3 IDs must belong to the customer's `branchId` roster

**Response** (success):
```json
{
  "success": true,
  "customerId": "LC-26000003",
  "cascadeCounts": {
    "treatments": 5, "sales": 12, "deposits": 3,
    "wallets": 1, "walletTransactions": 8,
    "memberships": 0, "pointTransactions": 4,
    "appointments": 7, "courseChanges": 2,
    "linkRequests": 0, "customerLinkTokens": 0
  },
  "auditDocId": "customer-delete-LC-26000003-1778100000000-abcd1234"
}
```

**Response** (error):
```json
{ "error": "<Thai message>", "field"?: "..." }
```

**Implementation outline**:
1. `verifyIdToken` from `Authorization: Bearer …`
2. Assert admin claim OR `customer_delete` claim. 403 otherwise.
3. Read customer doc — 404 if not found.
4. Cross-validate `authorizedBy` IDs against be_staff + be_doctors @ customer.branchId. 400 if ID not in roster.
5. Snapshot customer doc data (full record, last state).
6. Query 10 cascade collections in parallel; collect doc refs + counts.
7. Build audit doc payload (see §7).
8. **Atomic batch**: delete all linked docs + customer doc + write audit doc → `commitBatch()` chunked at 450 writes per batch.
9. Return success + cascadeCounts + auditDocId.

**Idempotency note**: re-running with the same `customerId` after a successful delete returns 404 (customer no longer exists). No double-delete possible. Audit doc is keyed by ts + rand; not idempotent (each call creates a new audit doc) — acceptable since the customer-delete itself is.

---

## 7. Audit doc shape — `be_admin_audit/customer-delete-{customerId}-{ts}-{rand}`

```js
{
  // Identity
  type: 'customer-delete-cascade',
  customerId: 'LC-26000003',
  customerHN: 'LC-26000003',                  // == doc id for LC-prefixed manual creates
  customerFullName: 'นาย ทดสอบ ระบบ',          // prefix + firstname + lastname

  // Scope
  branchId: 'BR-1777873556815-26df6480',      // customer's branch at delete time
  origin: 'manual' | 'proclinic-cloned',      // derived from isManualEntry flag

  // Authorization
  authorizedBy: {
    staffId, staffName,
    assistantId, assistantName,
    doctorId, doctorName,
  },

  // Performer
  performedBy: {
    uid, email, displayName,                   // Firebase auth user
  },
  performedAt: serverTimestamp(),

  // Cascade summary
  cascadeCounts: {
    treatments, sales, deposits,
    wallets, walletTransactions,
    memberships, pointTransactions,
    appointments,
    courseChanges, linkRequests, customerLinkTokens,
  },

  // Forensic snapshot (last state of customer doc before delete)
  customerSnapshot: { /* full doc data, no images */ },
}
```

**Snapshot scope**: full customer doc fields (root + patientData mirror). NOT the 10 cascade collections' contents — too much data. If we need to restore later, the snapshot + audit doc gives identity; the actual treatment/sale records would need to come from backups. This is consistent with Rule M's audit-trail-not-backup philosophy.

---

## 8. Permission key + gate

### 8.1 NEW perm key in `permissionGroupValidation.js`

Add to `ALL_PERMISSION_KEYS` under section "ลูกค้า / ผู้ป่วย":
```js
{ key: 'customer_delete',
  label: 'ลบลูกค้าถาวร (cascade)',
  description: 'ลบข้อมูลลูกค้าพร้อมประวัติทั้งหมด — irreversible',
  default: false,
  destructive: true }
```

### 8.2 Frontend gate

In `CustomerCard` + `CustomerDetailView`:
```js
const canDeleteCustomer = useHasPermission('customer_delete') || isAdmin;
```

### 8.3 Server gate

In `/api/admin/delete-customer-cascade`:
```js
const claims = decoded.token || {};
if (!(claims.admin === true || claims.customer_delete === true)) {
  return res.status(403).json({ error: 'ไม่มีสิทธิ์ลบลูกค้า' });
}
```

---

## 9. Data flow / failure modes

| Failure | Behaviour |
|---|---|
| Network drops mid-request | Server endpoint completes atomically (single batch) OR fails entirely. Client sees error toast, modal stays open, user can retry |
| Auth token expired during long modal session | Server returns 401, client refreshes token + retries |
| Customer already deleted (race with another admin) | Server returns 404 with `'ลูกค้าถูกลบไปแล้ว'`. Client closes modal + refreshes list |
| Branch-roster lookup fails (e.g. listStaff throws) | Modal shows "โหลดรายชื่อทีมงานไม่สำเร็จ" + retry button |
| ProClinic-cloned customer | Modal shows extra warning banner "ลูกค้านี้มาจากการ sync เริ่มต้น (origin: proclinic-cloned) — การลบจะไม่ส่งผลต่อ ProClinic; แต่หากต้องการกู้คืนต้องสร้างใหม่ด้วยมือ" |

---

## 10. Out-of-scope / follow-up

The following are intentionally NOT in this spec; tracked as separate work:

1. **Soft delete + 30-day grace period** — would let admin "undo" within 30 days. Adds complexity; user did not request. Defer until needed.
2. **Storage object cleanup** — `profile_image` + `gallery_upload` URLs are firebase-storage paths; deleting the doc orphans the files. Add `/api/admin/cleanup-orphan-storage` cron later.
3. **`opd_sessions` cleanup** — sessions reference customers via `brokerProClinicId`. Policy decision pending. For this spec: **leave them in place**.
4. **Bulk delete (multi-select)** — out of scope. Single-customer delete only.
5. **Restore from audit-doc snapshot** — manual recovery procedure; documented in runbook later.
6. **Test-customer (TEST- / E2E- prefix) bypass** — those are cleaned by `/api/admin/cleanup-test-products` family (V35). They CAN also be deleted via this new flow, but the new flow's authorization-by-staff requirement is overhead for routine test cleanup. **Recommendation**: leave V35 endpoints as the bulk-test-cleanup path; this UI is for production customer admin actions.

---

## 11. Test plan

Per Rule K (work-first-test-last) + Rule I (full-flow simulate at sub-phase end):

1. **Helper tests** (pure):
   - HN-counter monotonicity preservation post-delete (mock counter doc, assert seq never decrements after `deleteCustomerCascade`)
   - cascade-collection-list integrity (the list should match between `deleteCustomerCascade()` body and `/api/admin/delete-customer-cascade.js` server handler — locked via shared constant export)
   - Permission key shape (`customer_delete` key declared correctly + gating both client + server)

2. **Component tests** (RTL):
   - Modal renders 3 required dropdowns, ลบ disabled until all selected
   - Modal cascade preview rows correct
   - ProClinic-cloned warning banner appears when origin === 'proclinic-cloned'
   - ✕ icon on CustomerCard hidden when no perm + no admin
   - "ลบลูกค้า" button on CustomerDetailView hidden when no perm + no admin

3. **API tests** (server-side):
   - 401 without token; 403 without perm/admin claim
   - 400 if `authorizedBy` IDs not in customer's branch roster
   - 404 if customer doesn't exist
   - Successful delete: cascade counts correct; audit doc written; customer doc absent
   - Idempotency: re-call after delete returns 404 + zero side effects
   - HN counter unchanged after delete (regression-lock for the user's no-reuse requirement)

4. **Full-flow simulate** (`tests/phase-24-0-customer-delete-flow-simulate.test.js`):
   - Admin creates customer A (HN: LC-XX#####1), creates customer B (HN: LC-XX#####2)
   - Delete customer A via this UI flow
   - Create customer C → assert HN = LC-XX#####3 (not #####1 — no reuse)
   - Verify audit doc exists with all required fields
   - Verify all 10 cascade collections empty for customer A's id
   - Verify customer B + C unaffected
   - Re-attempt delete of customer A → 404

5. **firestore.rules update**:
   - `be_admin_audit/customer-delete-*` doc-id prefix create exception (admin-claim or perm-claim, similar to Phase 16.3 narrow exception)
   - Verify-via-probe extension: add unauth attempt to create `be_admin_audit/customer-delete-test-probe-{ts}` → expect 403

---

## 12. Files (summary)

| Path | Action | Notes |
|---|---|---|
| `src/components/backend/DeleteCustomerCascadeModal.jsx` | NEW | ~250 LOC modal component |
| `src/components/backend/CustomerCard.jsx` | MODIFY | Inline ✕ icon + gate |
| `src/components/backend/CustomerDetailView.jsx` | MODIFY | Prominent ลบ button + gate |
| `src/components/backend/CustomerListTab.jsx` | MODIFY | Modal state + onDeleted handler |
| `api/admin/delete-customer-cascade.js` | NEW | ~200 LOC server endpoint |
| `src/lib/backendClient.js` | MODIFY | Extend `deleteCustomerCascade` cascade list (add `be_course_changes`, `be_link_requests`, `be_customer_link_tokens`) — also export shared `CUSTOMER_CASCADE_COLLECTIONS` constant for server parity |
| `src/lib/customerDeleteClient.js` | NEW | Thin client wrapper that POSTs to the new endpoint with Firebase ID token |
| `src/lib/permissionGroupValidation.js` | MODIFY | Declare `customer_delete` perm key |
| `firestore.rules` | MODIFY | `be_admin_audit/customer-delete-*` narrow create exception |
| `tests/phase-24-0-customer-delete-modal.test.jsx` | NEW | RTL component tests |
| `tests/phase-24-0-customer-delete-server.test.js` | NEW | API endpoint unit tests |
| `tests/phase-24-0-customer-delete-flow-simulate.test.js` | NEW | Rule I full-flow simulate including HN no-reuse regression lock |
| `tests/phase-24-0-permission-customer-delete.test.js` | NEW | Perm-key declaration + dual gate source-grep |
| `tests/customer-delete-rule-probe.test.js` | NEW | firestore.rules probe — anon can't create audit docs |

Estimated test count: **+80** across 5 files.

---

## 13. Acceptance criteria

- [ ] Inline ✕ icon visible on every CustomerCard for users with `customer_delete` perm OR admin claim. Hidden for everyone else.
- [ ] "ลบลูกค้า" button visible on CustomerDetailView header for same gate.
- [ ] Click ✕ OR detail-view button → modal opens; clicking outside closes; ESC closes.
- [ ] Modal title: "ยืนยันลบลูกค้า {prefix} {firstname} {lastname} (HN: {hn_no}) พร้อมประวัติทั้งหมด?"
- [ ] Modal body shows cascade preview row with 11 counts.
- [ ] 3 dropdowns populated from customer's branchId roster, all required.
- [ ] ProClinic-cloned warning banner appears for `isManualEntry !== true` customers.
- [ ] ลบถาวร button disabled until all 3 dropdowns selected.
- [ ] Click ลบ → spinner → server endpoint hits → on success: customer + 11 cascade collections empty for this customer's ID; audit doc created.
- [ ] HN counter never decrements (regression-lock test).
- [ ] Permission gate works on both client (UI hidden) AND server (403 if missing).
- [ ] All test counts: helper + component + API + full-flow + rule-probe ≥ 80, all PASS.
- [ ] `npm run build` clean.
- [ ] No mention of ProClinic in user-visible toasts (post Phase 20.0 strip discipline).

---

## 14. Open questions for spec review

1. Should the modal show **time-on-record** ("registered 14 months ago") to add context for the destructive decision? (Out of scope for v1; flag for later.)
2. Should a per-branch-admin be able to delete only customers in their own branch? — Currently admin/customer_delete perm has NO branch-scoping. The customer's branch is captured in the audit. Scoping the perm by branch is a Rule J brainstorm if/when requested.
3. Should we email the clinic owner when ANY delete happens? — Out of scope; can be added as a Cloud Function listener on `be_admin_audit/customer-delete-*` later.

---

**End of design spec.**
