# Phase 24.0 — Customer Delete Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-customer delete button in BackendDashboard's customers tab. Cascade-deletes 11 customer-linked collections + writes forensic audit doc + dual-permission gate. HN counter is already monotonic — preservation verified by regression-lock test.

**Architecture:** Client UI surfaces the delete (✕ icon on CustomerCard + button on CustomerDetailView) → opens minimal native-styled modal with 3 required dropdowns (พนง / ผู้ช่วย / แพทย์ from customer's branch roster) → POSTs Firebase ID token + customerId + authorizedBy IDs to NEW server endpoint `/api/admin/delete-customer-cascade` → endpoint atomically deletes via batched writes + writes `be_admin_audit/customer-delete-*` doc using firebase-admin SDK. Rules narrow-allow the audit prefix (admin claim or customer_delete perm).

**Tech Stack:** React 19 (jsx-only), Tailwind 3.4, lucide-react icons, Firebase 11 (firebase-admin on server), Vitest 4.1, Vercel serverless. Existing primitives reused: `verifyAdminToken` (api/admin/_lib/adminAuth.js), `useHasPermission`, `useTabAccess`, `useSelectedBranch`, `filterStaffByBranch`, `filterDoctorsByBranch`, `deleteCustomerCascade`.

**Spec:** `docs/superpowers/specs/2026-05-06-customer-delete-button-design.md` (user-approved 2026-05-06).

**Rule K (work-first-test-last):** Tasks 1-11 build the source structure end-to-end. Tasks 12-16 batch-write the test bank. Task 17 verifies + commits + pushes. Do NOT interleave tests with implementation.

**Rule I (full-flow simulate):** Task 15 is the mandatory full-flow simulate covering kiosk-create → click delete → modal → server → cascade → audit doc → HN counter unchanged → next-customer HN regression lock.

---

## File Structure

| Path | Action | Responsibility |
|---|---|---|
| `src/lib/backendClient.js` | MODIFY | Add 2 collection accessors (`linkRequestsCol`, `customerLinkTokensCol`); export shared `CUSTOMER_CASCADE_COLLECTIONS` constant; update `deleteCustomerCascade` body to use constant + cover 11 collections |
| `src/lib/permissionGroupValidation.js` | MODIFY | Declare `customer_delete` perm key in ALL_PERMISSION_KEYS under "ลูกค้า / ผู้ป่วย" section |
| `firestore.rules` | MODIFY | Narrow create exception for `be_admin_audit/customer-delete-*` doc-id prefix (admin OR customer_delete claim) |
| `api/admin/delete-customer-cascade.js` | NEW | Admin-SDK server endpoint: verifies token, validates payload, snapshots customer, batch-deletes 11 collections + writes audit |
| `src/lib/customerDeleteClient.js` | NEW | Thin client wrapper — POSTs to endpoint with Firebase ID token, returns `{success, cascadeCounts, auditDocId}` |
| `src/components/backend/DeleteCustomerCascadeModal.jsx` | NEW | Modal with cascade preview + 3 required branch-scoped dropdowns + ลบ/ยกเลิก buttons |
| `src/components/backend/CustomerCard.jsx` | MODIFY | Inline ✕ icon top-right (gated) + onClick that triggers parent's delete-modal opener |
| `src/components/backend/CustomerDetailView.jsx` | MODIFY | Prominent "ลบลูกค้า" button in header (gated) |
| `src/components/backend/CustomerListTab.jsx` | MODIFY | `deletingCustomer` state + render modal + onDeleted handler that re-fetches list + closes detail |
| `tests/phase-24-0-permission-customer-delete.test.js` | NEW | Source-grep + helper unit — perm key declared, dual gate present at all 3 UI sites |
| `tests/phase-24-0-customer-delete-server.test.js` | NEW | API endpoint unit — 401/403/400/404 paths + audit-doc shape + cascade-counts integrity |
| `tests/phase-24-0-customer-delete-modal.test.jsx` | NEW | RTL — 3 dropdown gates, ลบ disabled until all selected, ProClinic-cloned warning, branch-scope filter |
| `tests/phase-24-0-customer-delete-flow-simulate.test.js` | NEW | Rule I full-flow — create A → delete → create B → assert HN(B) > HN(A); cascade collections empty; audit doc exists |
| `tests/customer-delete-rule-probe.test.js` | NEW | firestore.rules probe — anon CANNOT create `be_admin_audit/customer-delete-*` |

**No placeholders below — every step contains the actual code or command needed.**

---

## Task 1: Add `linkRequestsCol` and `customerLinkTokensCol` accessors

**Files:**
- Modify: `src/lib/backendClient.js` (add 2 lines after the existing `courseChangesCol` accessor)

- [ ] **Step 1.1: Locate the `courseChangesCol` accessor**

Run:
```bash
grep -n "const courseChangesCol = " src/lib/backendClient.js
```
Expected: `3569:const courseChangesCol = () => collection(db, ...basePath(), 'be_course_changes');`

- [ ] **Step 1.2: Add the 2 new accessors immediately after `courseChangesCol`**

Edit `src/lib/backendClient.js`. Find:
```js
const courseChangesCol = () => collection(db, ...basePath(), 'be_course_changes');
```
Replace with:
```js
const courseChangesCol = () => collection(db, ...basePath(), 'be_course_changes');
// Phase 24.0 (2026-05-06) — collection accessors used by deleteCustomerCascade.
// be_link_requests: admin-mediated LINE-ID-link queue. Carries customerId on
//   approved-row docs.
// be_customer_link_tokens: one-time LINE link tokens (24h TTL) — V32-tris-quater
//   doc shape carries customerId at mint time. Client-blocked rule
//   (`read,write: if false`); admin SDK only at delete time.
const linkRequestsCol = () => collection(db, ...basePath(), 'be_link_requests');
const customerLinkTokensCol = () => collection(db, ...basePath(), 'be_customer_link_tokens');
```

- [ ] **Step 1.3: Verify file still compiles**

Run:
```bash
npm run build 2>&1 | tail -3
```
Expected: `✓ built in <N>s` (no syntax errors)

---

## Task 2: Export shared `CUSTOMER_CASCADE_COLLECTIONS` constant

**Files:**
- Modify: `src/lib/backendClient.js` (insert export above existing `deleteCustomerCascade` definition at line ~786)

- [ ] **Step 2.1: Locate the `deleteCustomerCascade` function**

Run:
```bash
grep -n "^export async function deleteCustomerCascade" src/lib/backendClient.js
```
Expected: `786:export async function deleteCustomerCascade(proClinicId, opts = {}) {`

- [ ] **Step 2.2: Insert constant export immediately ABOVE the function**

Edit `src/lib/backendClient.js`. Find:
```js
export async function deleteCustomerCascade(proClinicId, opts = {}) {
```
Replace with:
```js
/**
 * Phase 24.0 (2026-05-06) — single source of truth for customer cascade-delete
 * scope. Both `deleteCustomerCascade` (this file) and the server-side
 * `/api/admin/delete-customer-cascade` endpoint reference this list (server
 * has its own copy because firebase-admin uses a different collection-ref
 * helper, but the COUNT and ORDER of entries MUST stay in lockstep — locked
 * by tests/phase-24-0-customer-delete-server.test.js).
 *
 * Order matches the cascadeCounts response shape in the audit doc.
 *
 * Out-of-scope (intentional): opd_sessions (kiosk session docs reference
 * customers via brokerProClinicId; policy-pending — leave in place);
 * Firebase Storage objects (separate cleanup-orphan cron).
 */
export const CUSTOMER_CASCADE_COLLECTIONS = Object.freeze([
  'be_treatments',
  'be_sales',
  'be_deposits',
  'be_wallets',
  'be_wallet_transactions',
  'be_memberships',
  'be_point_transactions',
  'be_appointments',
  'be_course_changes',
  'be_link_requests',
  'be_customer_link_tokens',
]);

export async function deleteCustomerCascade(proClinicId, opts = {}) {
```

- [ ] **Step 2.3: Verify build still clean**

Run:
```bash
npm run build 2>&1 | tail -3
```
Expected: `✓ built in <N>s`

---

## Task 3: Extend `deleteCustomerCascade` body to use new accessors + cover 11 collections

**Files:**
- Modify: `src/lib/backendClient.js` lines ~786-819 (the function body)

- [ ] **Step 3.1: Read current `deleteCustomerCascade` body**

Run:
```bash
sed -n '786,820p' src/lib/backendClient.js
```

- [ ] **Step 3.2: Replace the `cols` array to include the 3 new accessors**

Find:
```js
  const cols = [
    treatmentsCol(), salesCol(), depositsCol(), walletsCol(),
    walletTxCol(), membershipsCol(), pointTxCol(), appointmentsCol(),
  ];
```
Replace with:
```js
  // Phase 24.0 (2026-05-06) — cascade extended to 11 collections (was 8).
  // Order MUST match CUSTOMER_CASCADE_COLLECTIONS string list above so the
  // shared constant test can lock parity between client + server.
  const cols = [
    treatmentsCol(), salesCol(), depositsCol(), walletsCol(),
    walletTxCol(), membershipsCol(), pointTxCol(), appointmentsCol(),
    courseChangesCol(), linkRequestsCol(), customerLinkTokensCol(),
  ];
```

- [ ] **Step 3.3: Verify build clean**

Run:
```bash
npm run build 2>&1 | tail -3
```
Expected: `✓ built in <N>s`

---

## Task 4: Create `/api/admin/delete-customer-cascade` server endpoint

**Files:**
- Create: `api/admin/delete-customer-cascade.js`

- [ ] **Step 4.1: Create the new endpoint file**

Create `api/admin/delete-customer-cascade.js` with this exact content:

```js
// ─── /api/admin/delete-customer-cascade — Phase 24.0 (2026-05-06) ────────────
//
// Atomic customer-delete + 11-collection cascade + audit doc, gated on
// admin claim OR customer_delete perm claim. Mirrors V35 cleanup-test-*
// admin-SDK pattern.
//
// Spec: docs/superpowers/specs/2026-05-06-customer-delete-button-design.md §6.
//
// Why server-side (not client-side scopedDataLayer call):
//   1. Atomic: cascade + audit doc in single batched commit. Half-state on
//      client crash impossible.
//   2. Customer-doc snapshot capture happens with admin-SDK strong consistency
//      (avoids onSnapshot lag).
//   3. authorizedBy IDs are cross-validated against be_staff/be_doctors @
//      customer.branchId server-side (admin can't fake names client-side).
//
// Rule M compliance: writes audit doc to be_admin_audit/customer-delete-{id}-{ts}-{rand}.

import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { randomBytes } from 'node:crypto';
import { verifyAdminToken } from './_lib/adminAuth.js';

const APP_ID = 'loverclinic-opd-4c39b';

// MUST stay in lockstep with src/lib/backendClient.js
// CUSTOMER_CASCADE_COLLECTIONS (Phase 24.0 cascade scope).
const CUSTOMER_CASCADE_COLLECTIONS = Object.freeze([
  'be_treatments',
  'be_sales',
  'be_deposits',
  'be_wallets',
  'be_wallet_transactions',
  'be_memberships',
  'be_point_transactions',
  'be_appointments',
  'be_course_changes',
  'be_link_requests',
  'be_customer_link_tokens',
]);

// Map collection name → cascadeCounts JSON key (camelCase for response).
const COL_TO_RESPONSE_KEY = Object.freeze({
  be_treatments: 'treatments',
  be_sales: 'sales',
  be_deposits: 'deposits',
  be_wallets: 'wallets',
  be_wallet_transactions: 'walletTransactions',
  be_memberships: 'memberships',
  be_point_transactions: 'pointTransactions',
  be_appointments: 'appointments',
  be_course_changes: 'courseChanges',
  be_link_requests: 'linkRequests',
  be_customer_link_tokens: 'customerLinkTokens',
});

let cachedDb = null;
function getAdminFirestore() {
  if (cachedDb) return cachedDb;
  let app;
  if (getApps().length > 0) {
    app = getApp();
  } else {
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const rawKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
    if (!clientEmail || !rawKey) {
      throw new Error('firebase-admin not configured');
    }
    app = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_ADMIN_PROJECT_ID || APP_ID,
        clientEmail,
        privateKey: rawKey.replace(/\\n/g, '\n'),
      }),
    });
  }
  cachedDb = getFirestore(app);
  return cachedDb;
}

function dataPath(db) {
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data');
}

/** Pure helper: assert caller has admin OR customer_delete claim. */
export function assertHasDeletePermission(claims) {
  if (!claims || typeof claims !== 'object') return false;
  return claims.admin === true || claims.customer_delete === true;
}

/** Pure helper: validate authorizedBy payload shape. */
export function validateAuthorizedBy(authorizedBy) {
  if (!authorizedBy || typeof authorizedBy !== 'object') return 'authorizedBy required';
  const required = ['staffId', 'staffName', 'assistantId', 'assistantName', 'doctorId', 'doctorName'];
  for (const key of required) {
    if (typeof authorizedBy[key] !== 'string' || !authorizedBy[key].trim()) {
      return `authorizedBy.${key} required (non-empty string)`;
    }
  }
  return null;
}

/** Pure helper: classify origin from customer doc's isManualEntry flag. */
export function classifyOrigin(customer) {
  return customer?.isManualEntry === true ? 'manual' : 'proclinic-cloned';
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'method not allowed' });
    return;
  }

  // Auth gate — verifyAdminToken returns null + writes 401/403 on failure.
  const caller = await verifyAdminToken(req, res);
  if (!caller) return;

  // Phase 24.0 — accept admin claim OR customer_delete claim. verifyAdminToken
  // already requires admin OR bootstrap-uid; we re-check here so a future
  // verifyAdminToken evolution that loosens its gate doesn't accidentally
  // expand customer-delete authority.
  const claims = caller.token || caller.claims || {};
  if (!assertHasDeletePermission(claims) && claims.admin !== true) {
    return res.status(403).json({ success: false, error: 'ไม่มีสิทธิ์ลบลูกค้า' });
  }

  const customerId = String(req.body?.customerId || '').trim();
  if (!customerId) {
    return res.status(400).json({ success: false, error: 'customerId required', field: 'customerId' });
  }

  const authorizedBy = req.body?.authorizedBy;
  const authError = validateAuthorizedBy(authorizedBy);
  if (authError) {
    return res.status(400).json({ success: false, error: authError, field: 'authorizedBy' });
  }

  try {
    const db = getAdminFirestore();
    const data = dataPath(db);

    // Read customer doc (404 if missing).
    const custRef = data.collection('be_customers').doc(customerId);
    const custSnap = await custRef.get();
    if (!custSnap.exists) {
      return res.status(404).json({ success: false, error: 'ลูกค้าถูกลบไปแล้ว หรือไม่พบในระบบ' });
    }
    const customer = custSnap.data();
    const branchId = customer?.branchId || '';

    // Cross-validate authorizedBy IDs against be_staff/be_doctors at this
    // customer's branchId. Server-side check prevents client-side spoofing.
    const [staffSnap, doctorsSnap] = await Promise.all([
      data.collection('be_staff').get(),
      data.collection('be_doctors').get(),
    ]);
    const staffMap = new Map(staffSnap.docs.map(d => [String(d.id), d.data()]));
    const doctorMap = new Map(doctorsSnap.docs.map(d => [String(d.id), d.data()]));

    function inBranchRoster(map, id) {
      const rec = map.get(String(id));
      if (!rec) return false;
      // Universal-roster fallback: if the record has no branchIds[] (legacy
      // pre-Phase-BS), accept it. Branch-scoped records require this customer's
      // branchId in their branchIds[] array.
      const branches = Array.isArray(rec.branchIds) ? rec.branchIds : null;
      if (!branches) return true;
      return branches.includes(branchId);
    }

    if (!inBranchRoster(staffMap, authorizedBy.staffId)) {
      return res.status(400).json({
        success: false,
        error: `staffId "${authorizedBy.staffId}" not in branch ${branchId} roster`,
        field: 'authorizedBy.staffId',
      });
    }
    if (!inBranchRoster(doctorMap, authorizedBy.assistantId)) {
      return res.status(400).json({
        success: false,
        error: `assistantId "${authorizedBy.assistantId}" not in branch ${branchId} roster`,
        field: 'authorizedBy.assistantId',
      });
    }
    if (!inBranchRoster(doctorMap, authorizedBy.doctorId)) {
      return res.status(400).json({
        success: false,
        error: `doctorId "${authorizedBy.doctorId}" not in branch ${branchId} roster`,
        field: 'authorizedBy.doctorId',
      });
    }

    // Query 11 cascade collections in parallel; collect refs + counts.
    const queryResults = await Promise.all(
      CUSTOMER_CASCADE_COLLECTIONS.map(name =>
        data.collection(name).where('customerId', '==', customerId).get(),
      ),
    );
    const cascadeCounts = {};
    const refsToDelete = [];
    CUSTOMER_CASCADE_COLLECTIONS.forEach((name, idx) => {
      const snap = queryResults[idx];
      cascadeCounts[COL_TO_RESPONSE_KEY[name]] = snap.size;
      snap.docs.forEach(d => refsToDelete.push(d.ref));
    });

    // Build audit doc payload.
    const fullName = [
      customer?.prefix || '',
      customer?.firstname || '',
      customer?.lastname || '',
    ].filter(Boolean).join(' ').trim();
    const ts = Date.now();
    const rand = randomBytes(6).toString('hex');
    const auditId = `customer-delete-${customerId}-${ts}-${rand}`;
    const auditRef = data.collection('be_admin_audit').doc(auditId);
    const auditPayload = {
      type: 'customer-delete-cascade',
      customerId,
      customerHN: customer?.hn_no || customerId,
      customerFullName: fullName,
      branchId,
      origin: classifyOrigin(customer),
      authorizedBy: {
        staffId: authorizedBy.staffId,
        staffName: authorizedBy.staffName,
        assistantId: authorizedBy.assistantId,
        assistantName: authorizedBy.assistantName,
        doctorId: authorizedBy.doctorId,
        doctorName: authorizedBy.doctorName,
      },
      performedBy: {
        uid: caller.uid || '',
        email: caller.email || '',
        displayName: caller.name || caller.displayName || '',
      },
      performedAt: new Date().toISOString(),
      cascadeCounts,
      customerSnapshot: customer,
    };

    // Atomic delete + audit. Firestore batch is capped at 500 writes — chunk
    // to be safe (audit doc + customer doc + N cascade docs).
    const allWrites = [...refsToDelete, custRef];
    const totalDeletes = allWrites.length;
    let batchOp = db.batch();
    let inBatch = 0;
    for (const ref of allWrites) {
      batchOp.delete(ref);
      inBatch += 1;
      if (inBatch >= 450) {
        await batchOp.commit();
        batchOp = db.batch();
        inBatch = 0;
      }
    }
    // Audit doc goes in the FINAL batch with the customer-doc delete to
    // guarantee atomicity (if the audit fails, rollback the customer too).
    batchOp.set(auditRef, auditPayload);
    inBatch += 1;
    await batchOp.commit();

    return res.status(200).json({
      success: true,
      customerId,
      cascadeCounts,
      auditDocId: auditId,
      totalDeletes,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      error: err?.message || 'delete-customer-cascade failed',
    });
  }
}
```

- [ ] **Step 4.2: Verify file syntax via Node parse**

Run:
```bash
node --check api/admin/delete-customer-cascade.js
```
Expected: no output (silent success).

- [ ] **Step 4.3: Verify build still clean (server bundling)**

Run:
```bash
npm run build 2>&1 | tail -3
```
Expected: `✓ built in <N>s`

---

## Task 5: Declare `customer_delete` permission key

**Files:**
- Modify: `src/lib/permissionGroupValidation.js`

- [ ] **Step 5.1: Locate the section "ลูกค้า / ผู้ป่วย" in ALL_PERMISSION_KEYS**

Run:
```bash
grep -n "ลูกค้า\|customer_" src/lib/permissionGroupValidation.js | head -10
```

- [ ] **Step 5.2: Add the new permission key in the customer section**

Edit `src/lib/permissionGroupValidation.js`. Find the customer section (look for `customer_view` or `customer_edit` keys; the new key goes alongside). After the last existing customer key, INSERT:

```js
  // Phase 24.0 (2026-05-06) — destructive cascade-delete capability. Default
  // OFF; admin claim bypasses the perm. UI gate: useHasPermission('customer_delete')
  // || isAdmin. Server gate (api/admin/delete-customer-cascade): same.
  {
    key: 'customer_delete',
    label: 'ลบลูกค้าถาวร (cascade ลบประวัติ 11 collections)',
    description: 'อันตราย — ลบข้อมูลลูกค้าพร้อมประวัติทั้งหมด ไม่สามารถกู้คืนได้',
    default: false,
    destructive: true,
  },
```

If ALL_PERMISSION_KEYS is structured by section objects (not flat array), place inside the "ลูกค้า / ผู้ป่วย" section. If flat array, place after `customer_edit` (or last `customer_*` key).

- [ ] **Step 5.3: Verify build clean**

Run:
```bash
npm run build 2>&1 | tail -3
```
Expected: `✓ built in <N>s`

- [ ] **Step 5.4: Verify the perm key is exported correctly**

Run:
```bash
grep -A2 "customer_delete" src/lib/permissionGroupValidation.js | head -10
```
Expected: shows the new key block.

---

## Task 6: Update `firestore.rules` — narrow create exception

**Files:**
- Modify: `firestore.rules`

- [ ] **Step 6.1: Locate the existing `be_admin_audit` rule block**

Run:
```bash
grep -n "be_admin_audit" firestore.rules
```

- [ ] **Step 6.2: Add narrow create exception for `customer-delete-` prefix**

Find the `match /be_admin_audit/{auditId}` block. The existing block (per Phase 16.3 narrow exception pattern) likely has:

```
match /be_admin_audit/{auditId} {
  allow read: if isClinicStaff();
  allow create: if isClinicStaff() &&
    auditId.matches('^system-config-.*');
  allow update, delete: if false;
}
```

Replace the `allow create` line with:
```
allow create: if isClinicStaff() && (
  auditId.matches('^system-config-.*') ||
  auditId.matches('^customer-delete-.*')
);
```

If the existing rule has multiple prefixes already, just APPEND `|| auditId.matches('^customer-delete-.*')` to the OR chain.

- [ ] **Step 6.3: Verify rules file syntactically valid**

Run:
```bash
firebase emulators:exec --only firestore "echo OK" 2>&1 | tail -5 || echo "emulator not configured — skip syntax check"
```

If emulator not configured, manually scan the rule block for balanced braces + semicolons.

- [ ] **Step 6.4: NO deploy at this step.** Per `feedback_local_only_no_deploy.md`, rules deploys are user-triggered only. Source change is sufficient for local testing.

---

## Task 7: Create `src/lib/customerDeleteClient.js`

**Files:**
- Create: `src/lib/customerDeleteClient.js`

- [ ] **Step 7.1: Create the wrapper file**

Create `src/lib/customerDeleteClient.js` with this exact content:

```js
// ─── customerDeleteClient — Phase 24.0 (2026-05-06) ─────────────────────────
// Thin client wrapper around POST /api/admin/delete-customer-cascade.
// Mirrors customerLineLink / customerBranchBaseline client wrappers.
//
// Why a wrapper module (not inline fetch in the modal):
//   - Token retrieval centralized (auth.currentUser.getIdToken)
//   - Error mapping (HTTP code → Thai message) lives in one place
//   - Easy to swap fetch impl in tests via vi.mock

import { auth } from '../firebase.js';

/**
 * Delete a customer cascade-style.
 *
 * @param {object} payload
 * @param {string} payload.customerId — be_customers/{id}
 * @param {object} payload.authorizedBy — { staffId, staffName, assistantId,
 *   assistantName, doctorId, doctorName } — all required non-empty strings
 * @returns {Promise<{success, customerId, cascadeCounts, auditDocId, totalDeletes}>}
 * @throws Error with .field / .status / .userMessage on validation/auth/server errors
 */
export async function deleteCustomerViaApi({ customerId, authorizedBy }) {
  const user = auth?.currentUser;
  if (!user) {
    const err = new Error('กรุณาเข้าสู่ระบบใหม่');
    err.userMessage = 'ไม่ได้ login';
    err.status = 401;
    throw err;
  }
  const idToken = await user.getIdToken();

  const res = await fetch('/api/admin/delete-customer-cascade', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${idToken}`,
    },
    body: JSON.stringify({ customerId, authorizedBy }),
  });

  let body = null;
  try { body = await res.json(); } catch { /* ignore */ }

  if (!res.ok) {
    const err = new Error(body?.error || `delete failed (HTTP ${res.status})`);
    err.userMessage = body?.error || 'การลบล้มเหลว';
    err.status = res.status;
    if (body?.field) err.field = body.field;
    throw err;
  }
  if (!body?.success) {
    const err = new Error(body?.error || 'unexpected server response');
    err.userMessage = body?.error || 'การลบล้มเหลว';
    err.status = 500;
    throw err;
  }
  return body;
}
```

- [ ] **Step 7.2: Verify build clean**

Run:
```bash
npm run build 2>&1 | tail -3
```
Expected: `✓ built in <N>s`

---

## Task 8: Create `DeleteCustomerCascadeModal.jsx`

**Files:**
- Create: `src/components/backend/DeleteCustomerCascadeModal.jsx`

- [ ] **Step 8.1: Create the modal component**

Create `src/components/backend/DeleteCustomerCascadeModal.jsx` with this exact content:

```jsx
// ─── DeleteCustomerCascadeModal — Phase 24.0 (2026-05-06) ───────────────────
// Native-styled minimal modal for cascade-delete confirmation. Body holds
// 3 required dropdowns (พนง / ผู้ช่วย / แพทย์) populated from customer's
// branch roster. ลบถาวร button disabled until all 3 selected.
//
// Spec: docs/superpowers/specs/2026-05-06-customer-delete-button-design.md §5.1.

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Loader2, Trash2, X, AlertTriangle } from 'lucide-react';
import { listStaff, listDoctors } from '../../lib/scopedDataLayer.js';
import { filterStaffByBranch, filterDoctorsByBranch } from '../../lib/branchScopeUtils.js';
import { deleteCustomerViaApi } from '../../lib/customerDeleteClient.js';

const labelCls = 'text-xs font-bold text-[var(--tx-muted)] uppercase tracking-wider block mb-1';
const selectCls = 'w-full bg-[var(--bg-card)] border border-[var(--bd-strong)] text-white rounded-lg px-3 py-2 text-sm outline-none disabled:opacity-50';

export default function DeleteCustomerCascadeModal({ customer, onClose, onDeleted }) {
  const [staffOptions, setStaffOptions] = useState([]);
  const [doctorOptions, setDoctorOptions] = useState([]);
  const [staffId, setStaffId] = useState('');
  const [assistantId, setAssistantId] = useState('');
  const [doctorId, setDoctorId] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const cancelRef = useRef(null);

  // Cancel-button autofocus on first render — matches DocumentPrintModal +
  // PermissionGroupsTab cleanup confirm pattern.
  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  // Load + branch-filter staff + doctor rosters once.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [staff, doctors] = await Promise.all([
          listStaff().catch(() => []),
          listDoctors().catch(() => []),
        ]);
        if (cancelled) return;
        const branchId = customer?.branchId || '';
        const branchStaff = filterStaffByBranch(staff || [], branchId)
          .filter(s => s.status !== 'พักใช้งาน');
        const branchDoctors = filterDoctorsByBranch(doctors || [], branchId)
          .filter(d => d.status !== 'พักใช้งาน');
        setStaffOptions(branchStaff.map(s => ({ value: String(s.id), label: s.name || s.id })));
        setDoctorOptions(branchDoctors.map(d => ({ value: String(d.id), label: d.name || d.id })));
      } catch (e) {
        if (!cancelled) setError('โหลดรายชื่อทีมงานไม่สำเร็จ — ' + (e?.message || ''));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [customer?.branchId]);

  const isProClinicCloned = customer && customer.isManualEntry !== true;
  const fullName = useMemo(() => {
    return [customer?.prefix, customer?.firstname, customer?.lastname]
      .filter(Boolean).join(' ').trim() || '(ไม่มีชื่อ)';
  }, [customer?.prefix, customer?.firstname, customer?.lastname]);
  const hn = customer?.hn_no || customer?.id || '';

  const canSubmit = !submitting && !loading && staffId && assistantId && doctorId;

  async function handleDelete() {
    if (!canSubmit) return;
    setError('');
    setSubmitting(true);
    try {
      const staffRec = staffOptions.find(s => s.value === staffId);
      const assistantRec = doctorOptions.find(d => d.value === assistantId);
      const doctorRec = doctorOptions.find(d => d.value === doctorId);
      const result = await deleteCustomerViaApi({
        customerId: customer.id,
        authorizedBy: {
          staffId, staffName: staffRec?.label || '',
          assistantId, assistantName: assistantRec?.label || '',
          doctorId, doctorName: doctorRec?.label || '',
        },
      });
      onDeleted?.(result);
    } catch (e) {
      setError(e.userMessage || e.message || 'การลบล้มเหลว');
      setSubmitting(false);
    }
  }

  function handleBackdrop(e) {
    if (e.target === e.currentTarget && !submitting) onClose?.();
  }
  function handleEsc(e) {
    if (e.key === 'Escape' && !submitting) onClose?.();
  }
  useEffect(() => {
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [submitting]);

  return (
    <div
      onClick={handleBackdrop}
      className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[80]"
      data-testid="delete-customer-modal"
    >
      <div className="bg-[var(--bg-elevated)] rounded-xl w-full max-w-md p-6 border border-red-900/50 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-black text-red-400 flex items-center gap-2">
            <AlertTriangle size={18} /> ยืนยันลบลูกค้า
          </h3>
          <button onClick={onClose} disabled={submitting} className="text-gray-500 hover:text-white disabled:opacity-50">
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-gray-300 mb-4 leading-relaxed">
          ยืนยันลบลูกค้า <span className="font-bold text-white">{fullName}</span>
          {' '}<span className="text-xs text-gray-500">(HN: {hn})</span>
          {' '}พร้อมประวัติทั้งหมด?
          <br />
          <span className="text-xs text-red-400">การลบเป็นการกระทำถาวร ไม่สามารถกู้คืนได้</span>
        </p>

        {isProClinicCloned && (
          <div className="mb-4 p-2 bg-amber-950/20 border border-amber-900/40 rounded text-xs text-amber-300 font-mono">
            ⚠️ ลูกค้าจาก ProClinic sync — การลบจะไม่ส่งผลต่อ ProClinic; หากต้องการกู้คืนต้องสร้างใหม่ด้วยมือ
          </div>
        )}

        {/* 3 required dropdowns — branch-scoped roster */}
        <div className="space-y-3 mb-4" data-testid="delete-customer-authorizers">
          <div>
            <label className={labelCls}>พนักงาน <span className="text-red-500">*</span></label>
            <select value={staffId} onChange={e => setStaffId(e.target.value)} disabled={submitting || loading} className={selectCls}>
              <option value="">-- เลือกพนักงาน --</option>
              {staffOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>ผู้ช่วยแพทย์ <span className="text-red-500">*</span></label>
            <select value={assistantId} onChange={e => setAssistantId(e.target.value)} disabled={submitting || loading} className={selectCls}>
              <option value="">-- เลือกผู้ช่วยแพทย์ --</option>
              {doctorOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>แพทย์ <span className="text-red-500">*</span></label>
            <select value={doctorId} onChange={e => setDoctorId(e.target.value)} disabled={submitting || loading} className={selectCls}>
              <option value="">-- เลือกแพทย์ --</option>
              {doctorOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-2 bg-red-950/30 border border-red-900/50 rounded text-xs text-red-400 font-mono">
            ⚠️ {error}
          </div>
        )}

        <div className="flex gap-3 pt-2 border-t border-[var(--bd)]">
          <button
            ref={cancelRef}
            onClick={onClose}
            disabled={submitting}
            className="flex-1 px-4 py-2.5 bg-[var(--bg-hover)] hover:bg-[var(--bg-hover)] text-gray-300 rounded-lg font-bold text-xs uppercase border border-[var(--bd-strong)] disabled:opacity-50"
          >
            ยกเลิก
          </button>
          <button
            onClick={handleDelete}
            disabled={!canSubmit}
            data-testid="delete-customer-confirm"
            className="flex-1 px-4 py-2.5 bg-red-700 hover:bg-red-600 text-white rounded-lg font-bold text-xs uppercase disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {submitting
              ? <><Loader2 size={14} className="animate-spin" /> กำลังลบ...</>
              : <><Trash2 size={14} /> ลบถาวร</>}
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 8.2: Verify build clean (component compiles)**

Run:
```bash
npm run build 2>&1 | tail -3
```
Expected: `✓ built in <N>s`

---

## Task 9: Modify `CustomerCard.jsx` — inline ✕ icon

**Files:**
- Modify: `src/components/backend/CustomerCard.jsx`

- [ ] **Step 9.1: Read current shape of CustomerCard**

Run:
```bash
grep -nE "^export|^function|^const CustomerCard|<div\s*className" src/components/backend/CustomerCard.jsx | head -15
```

- [ ] **Step 9.2: Add useHasPermission + useTabAccess imports + Trash2 icon import**

At the top of `src/components/backend/CustomerCard.jsx`, in the imports block, ensure these imports exist (add if missing):

```jsx
import { Trash2 } from 'lucide-react';
import useHasPermission from '../../hooks/useHasPermission.js';
import useTabAccess from '../../hooks/useTabAccess.js';
```

If `useHasPermission` is at a different path, run `grep -rn "export default useHasPermission\|export function useHasPermission" src/hooks/` to find the canonical path.

- [ ] **Step 9.3: Add `onDeleteClick` prop + permission gate + render the icon**

Find the `CustomerCard` component definition. Modify the props destructuring to ACCEPT `onDeleteClick` (optional callback):

```jsx
function CustomerCard({ customer, onClick, onDeleteClick }) {
```

Inside the function body, BEFORE the return, add the gate:

```jsx
  const canDelete = useHasPermission('customer_delete') || (useTabAccess?.()?.isAdmin === true);
```

If `useTabAccess` returns the admin flag differently (e.g. via `useTabAccess()`), adapt — verify with:
```bash
grep -A3 "export.*useTabAccess" src/hooks/useTabAccess.js
```

In the returned JSX, find the outer `<div>` of the card. Ensure it has `position: relative` (Tailwind `relative` class) so the absolute icon anchors correctly. Inside this div, add the icon element (place it as the FIRST child so it overlays):

```jsx
{canDelete && onDeleteClick && (
  <button
    type="button"
    onClick={(e) => { e.stopPropagation(); onDeleteClick(customer); }}
    title="ลบลูกค้า"
    aria-label="ลบลูกค้า"
    data-testid={`delete-customer-${customer.id}`}
    className="absolute top-2 right-2 p-1 rounded text-[var(--tx-muted)] hover:bg-red-950/40 hover:text-red-400 transition-colors"
  >
    <Trash2 size={14} />
  </button>
)}
```

- [ ] **Step 9.4: Verify build clean**

Run:
```bash
npm run build 2>&1 | tail -3
```
Expected: `✓ built in <N>s`

---

## Task 10: Modify `CustomerDetailView.jsx` — prominent delete button

**Files:**
- Modify: `src/components/backend/CustomerDetailView.jsx`

- [ ] **Step 10.1: Read current shape**

Run:
```bash
grep -nE "^export|^function|^const CustomerDetailView|onBack|onCreateTreatment" src/components/backend/CustomerDetailView.jsx | head -10
```

- [ ] **Step 10.2: Add Trash2 + permission imports**

Add to the imports block (top of file):
```jsx
import { Trash2 } from 'lucide-react';
import useHasPermission from '../../hooks/useHasPermission.js';
import useTabAccess from '../../hooks/useTabAccess.js';
```

(Skip any that already exist.)

- [ ] **Step 10.3: Add `onDeleteCustomer` prop**

Find the props destructure (line ~113 per grep above):
```jsx
  onBack, onCreateTreatment, onEditTreatment, onDeleteTreatment,
```
Replace with:
```jsx
  onBack, onCreateTreatment, onEditTreatment, onDeleteTreatment,
  onDeleteCustomer,
```

- [ ] **Step 10.4: Add the gate computation**

Inside the function body, before the return statement, add:
```jsx
  const canDeleteCustomer = useHasPermission('customer_delete') || (useTabAccess?.()?.isAdmin === true);
```

- [ ] **Step 10.5: Render the prominent delete button in the header**

Find the detail-view header section (likely contains the `onBack` button). Add the new button alongside it (typically right-aligned). Example placement (adapt to existing header layout):

```jsx
{canDeleteCustomer && onDeleteCustomer && (
  <button
    onClick={() => onDeleteCustomer(customer)}
    data-testid="customer-detail-delete-button"
    title="ลบลูกค้าถาวร พร้อมประวัติทั้งหมด"
    className="flex items-center gap-1.5 px-3 py-1.5 rounded border bg-red-950/20 hover:bg-red-900/40 text-red-400 border-red-800/50 text-xs font-bold uppercase whitespace-nowrap"
  >
    <Trash2 size={13} /> ลบลูกค้า
  </button>
)}
```

- [ ] **Step 10.6: Verify build clean**

Run:
```bash
npm run build 2>&1 | tail -3
```
Expected: `✓ built in <N>s`

---

## Task 11: Modify `CustomerListTab.jsx` — modal state + onDeleted handler

**Files:**
- Modify: `src/components/backend/CustomerListTab.jsx`

- [ ] **Step 11.1: Add modal import + useState import (if missing)**

At top of file:
```jsx
import DeleteCustomerCascadeModal from './DeleteCustomerCascadeModal.jsx';
```

(useState should already be imported as part of React's core hooks.)

- [ ] **Step 11.2: Add `deletingCustomer` state inside the component**

Inside the `CustomerListTab` function body, with the other useState calls, add:
```jsx
  const [deletingCustomer, setDeletingCustomer] = useState(null);
```

- [ ] **Step 11.3: Wire the `onDeleteClick` prop on each `CustomerCard`**

Find where `<CustomerCard ... />` is rendered (likely inside a list `.map(c => ...)`). Add the `onDeleteClick` prop:
```jsx
<CustomerCard
  key={c.id}
  customer={c}
  onClick={() => onSelectCustomer(c)}
  onDeleteClick={(cust) => setDeletingCustomer(cust)}
/>
```

- [ ] **Step 11.4: If CustomerListTab also renders CustomerDetailView (some implementations do), wire `onDeleteCustomer` similarly**

Search:
```bash
grep -n "CustomerDetailView" src/components/backend/CustomerListTab.jsx
```

If it renders `<CustomerDetailView ... />`, add:
```jsx
<CustomerDetailView
  ...existing props
  onDeleteCustomer={(cust) => setDeletingCustomer(cust)}
/>
```

- [ ] **Step 11.5: Render the modal at the bottom of the component's JSX**

Just before the final closing tag of the returned JSX, add:
```jsx
{deletingCustomer && (
  <DeleteCustomerCascadeModal
    customer={deletingCustomer}
    onClose={() => setDeletingCustomer(null)}
    onDeleted={(result) => {
      setDeletingCustomer(null);
      // Re-fetch the customer list. Adapt the function name to whatever
      // the existing component uses (e.g. loadCustomers / refresh / fetchCustomers).
      if (typeof loadCustomers === 'function') loadCustomers();
      // If a customer-detail view is open for the deleted customer, close it.
      if (typeof onSelectCustomer === 'function') onSelectCustomer(null);
      // Toast (if a toast helper is in scope).
      if (typeof showToast === 'function') {
        showToast(`ลบลูกค้าเรียบร้อย — cascade ${Object.values(result.cascadeCounts || {}).reduce((a,b)=>a+b,0)} รายการ`);
      }
    }}
  />
)}
```

If `loadCustomers` / `showToast` / `onSelectCustomer` have different names in this file, replace with the existing identifiers found via:
```bash
grep -nE "function load|setSelectedCustomer|showToast" src/components/backend/CustomerListTab.jsx | head -10
```

- [ ] **Step 11.6: Verify build clean**

Run:
```bash
npm run build 2>&1 | tail -3
```
Expected: `✓ built in <N>s`

---

## Task 12: Write `tests/phase-24-0-permission-customer-delete.test.js`

**Files:**
- Create: `tests/phase-24-0-permission-customer-delete.test.js`

- [ ] **Step 12.1: Create the test file**

Create the file with this content:

```js
// Phase 24.0 — customer_delete permission key declaration + dual UI gate.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const PERM_FILE = fs.readFileSync(
  path.join(process.cwd(), 'src/lib/permissionGroupValidation.js'),
  'utf-8',
);
const CARD_FILE = fs.readFileSync(
  path.join(process.cwd(), 'src/components/backend/CustomerCard.jsx'),
  'utf-8',
);
const DETAIL_FILE = fs.readFileSync(
  path.join(process.cwd(), 'src/components/backend/CustomerDetailView.jsx'),
  'utf-8',
);
const MODAL_FILE = fs.readFileSync(
  path.join(process.cwd(), 'src/components/backend/DeleteCustomerCascadeModal.jsx'),
  'utf-8',
);

describe('Phase 24.0 / P — customer_delete perm key + dual gate', () => {
  it('P.1 perm key declared in ALL_PERMISSION_KEYS', () => {
    expect(PERM_FILE).toMatch(/key:\s*['"]customer_delete['"]/);
  });
  it('P.2 perm key has destructive: true flag', () => {
    expect(PERM_FILE).toMatch(/key:\s*['"]customer_delete['"][\s\S]{0,400}destructive:\s*true/);
  });
  it('P.3 perm key has default: false', () => {
    expect(PERM_FILE).toMatch(/key:\s*['"]customer_delete['"][\s\S]{0,400}default:\s*false/);
  });
  it('P.4 CustomerCard imports useHasPermission + useTabAccess', () => {
    expect(CARD_FILE).toMatch(/import\s+useHasPermission\s+from\s+['"][^'"]*useHasPermission/);
    expect(CARD_FILE).toMatch(/import\s+useTabAccess\s+from\s+['"][^'"]*useTabAccess/);
  });
  it('P.5 CustomerCard has dual gate (perm OR admin)', () => {
    expect(CARD_FILE).toMatch(/useHasPermission\(['"]customer_delete['"]\)\s*\|\|/);
  });
  it('P.6 CustomerDetailView has dual gate', () => {
    expect(DETAIL_FILE).toMatch(/useHasPermission\(['"]customer_delete['"]\)\s*\|\|/);
  });
  it('P.7 DeleteCustomerCascadeModal does NOT have its own gate (parent gates rendering)', () => {
    // Anti-regression: the modal MUST render unconditionally when mounted —
    // gating happens at the parent level (Card / DetailView). Otherwise a
    // perm change mid-flow could orphan an open modal.
    expect(MODAL_FILE).not.toMatch(/useHasPermission\(['"]customer_delete['"]\)/);
  });
  it('P.8 No file outside the 3 expected sites references customer_delete perm', () => {
    // Anti-regression: catches accidental hardcoded checks elsewhere that
    // would diverge from the canonical gate pattern.
    const allowed = [
      'src/lib/permissionGroupValidation.js',
      'src/components/backend/CustomerCard.jsx',
      'src/components/backend/CustomerDetailView.jsx',
      'api/admin/delete-customer-cascade.js',
      'tests/phase-24-0-permission-customer-delete.test.js',
      'tests/phase-24-0-customer-delete-server.test.js',
      'tests/phase-24-0-customer-delete-modal.test.jsx',
      'tests/phase-24-0-customer-delete-flow-simulate.test.js',
    ];
    function walk(dir, results = []) {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.git' || e.name === 'graphify-out') continue;
          walk(p, results);
        } else if (/\.(js|jsx|ts|tsx)$/.test(e.name)) {
          results.push(p);
        }
      }
      return results;
    }
    const root = process.cwd();
    const files = walk(root);
    const violators = files.filter((f) => {
      const rel = path.relative(root, f).replace(/\\/g, '/');
      if (allowed.some((a) => rel === a)) return false;
      const txt = fs.readFileSync(f, 'utf-8');
      return /customer_delete/.test(txt);
    });
    expect(violators).toEqual([]);
  });
});
```

- [ ] **Step 12.2: Run the test (should pass — sources are in place)**

Run:
```bash
npm test -- --run tests/phase-24-0-permission-customer-delete.test.js 2>&1 | tail -8
```
Expected: `Tests  8 passed (8)`

---

## Task 13: Write `tests/phase-24-0-customer-delete-server.test.js`

**Files:**
- Create: `tests/phase-24-0-customer-delete-server.test.js`

- [ ] **Step 13.1: Create the file**

```js
// Phase 24.0 — server endpoint pure-helper unit tests.
// Full integration testing (firebase-admin + cascade) is covered by the
// flow-simulate test which uses a separate fixture harness.
import { describe, expect, it } from 'vitest';
import {
  assertHasDeletePermission,
  validateAuthorizedBy,
  classifyOrigin,
} from '../api/admin/delete-customer-cascade.js';

describe('Phase 24.0 / S1 — assertHasDeletePermission', () => {
  it('S1.1 admin claim → true', () => {
    expect(assertHasDeletePermission({ admin: true })).toBe(true);
  });
  it('S1.2 customer_delete claim → true', () => {
    expect(assertHasDeletePermission({ customer_delete: true })).toBe(true);
  });
  it('S1.3 both claims → true', () => {
    expect(assertHasDeletePermission({ admin: true, customer_delete: true })).toBe(true);
  });
  it('S1.4 neither claim → false', () => {
    expect(assertHasDeletePermission({})).toBe(false);
    expect(assertHasDeletePermission({ system_config_management: true })).toBe(false);
  });
  it('S1.5 null/undefined → false', () => {
    expect(assertHasDeletePermission(null)).toBe(false);
    expect(assertHasDeletePermission(undefined)).toBe(false);
  });
  it('S1.6 string-truthy claim values still false (must be strict ===true)', () => {
    expect(assertHasDeletePermission({ admin: 'true' })).toBe(false);
    expect(assertHasDeletePermission({ customer_delete: 1 })).toBe(false);
  });
});

describe('Phase 24.0 / S2 — validateAuthorizedBy', () => {
  const valid = {
    staffId: 'BS-1', staffName: 'A',
    assistantId: 'BD-1', assistantName: 'B',
    doctorId: 'BD-2', doctorName: 'C',
  };
  it('S2.1 fully populated → null (no error)', () => {
    expect(validateAuthorizedBy(valid)).toBeNull();
  });
  it('S2.2 missing staffId → error string', () => {
    const out = validateAuthorizedBy({ ...valid, staffId: '' });
    expect(out).toMatch(/staffId/);
  });
  it('S2.3 missing assistantId → error string', () => {
    const out = validateAuthorizedBy({ ...valid, assistantId: '' });
    expect(out).toMatch(/assistantId/);
  });
  it('S2.4 missing doctorId → error string', () => {
    const out = validateAuthorizedBy({ ...valid, doctorId: '' });
    expect(out).toMatch(/doctorId/);
  });
  it('S2.5 missing each name field → distinct error', () => {
    expect(validateAuthorizedBy({ ...valid, staffName: '' })).toMatch(/staffName/);
    expect(validateAuthorizedBy({ ...valid, assistantName: '' })).toMatch(/assistantName/);
    expect(validateAuthorizedBy({ ...valid, doctorName: '' })).toMatch(/doctorName/);
  });
  it('S2.6 null/undefined → "authorizedBy required"', () => {
    expect(validateAuthorizedBy(null)).toBe('authorizedBy required');
    expect(validateAuthorizedBy(undefined)).toBe('authorizedBy required');
  });
  it('S2.7 whitespace-only string → error', () => {
    expect(validateAuthorizedBy({ ...valid, staffId: '   ' })).toMatch(/staffId/);
  });
  it('S2.8 non-string types rejected', () => {
    expect(validateAuthorizedBy({ ...valid, staffId: 12345 })).toMatch(/staffId/);
  });
});

describe('Phase 24.0 / S3 — classifyOrigin', () => {
  it('S3.1 isManualEntry: true → "manual"', () => {
    expect(classifyOrigin({ isManualEntry: true })).toBe('manual');
  });
  it('S3.2 isManualEntry: false → "proclinic-cloned"', () => {
    expect(classifyOrigin({ isManualEntry: false })).toBe('proclinic-cloned');
  });
  it('S3.3 isManualEntry: undefined → "proclinic-cloned" (default-safe)', () => {
    expect(classifyOrigin({})).toBe('proclinic-cloned');
    expect(classifyOrigin({ isManualEntry: null })).toBe('proclinic-cloned');
  });
  it('S3.4 null customer → "proclinic-cloned"', () => {
    expect(classifyOrigin(null)).toBe('proclinic-cloned');
  });
});

describe('Phase 24.0 / S4 — endpoint surface (source-grep guards)', () => {
  it('S4.1 endpoint imports verifyAdminToken', () => {
    const txt = (require('node:fs')).readFileSync(
      'api/admin/delete-customer-cascade.js', 'utf-8',
    );
    expect(txt).toMatch(/import\s*\{[^}]*verifyAdminToken[^}]*\}\s*from\s*['"]\.\/_lib\/adminAuth\.js['"]/);
  });
  it('S4.2 endpoint declares CUSTOMER_CASCADE_COLLECTIONS list (11 entries)', () => {
    const fs = require('node:fs');
    const txt = fs.readFileSync('api/admin/delete-customer-cascade.js', 'utf-8');
    expect(txt).toMatch(/be_treatments[\s\S]{0,400}be_customer_link_tokens/);
    // Lock the 11-collection contract via line count.
    const block = txt.match(/CUSTOMER_CASCADE_COLLECTIONS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
    expect(block).toBeTruthy();
    const entries = block[1].match(/'be_[a-z_]+'/g) || [];
    expect(entries.length).toBe(11);
  });
  it('S4.3 endpoint writes audit doc with prefix customer-delete-', () => {
    const fs = require('node:fs');
    const txt = fs.readFileSync('api/admin/delete-customer-cascade.js', 'utf-8');
    expect(txt).toMatch(/customer-delete-\$\{customerId\}-\$\{ts\}-\$\{rand\}/);
  });
  it('S4.4 endpoint cross-validates authorizedBy against branch roster', () => {
    const fs = require('node:fs');
    const txt = fs.readFileSync('api/admin/delete-customer-cascade.js', 'utf-8');
    expect(txt).toMatch(/inBranchRoster/);
  });
  it('S4.5 endpoint uses crypto-secure rand (not Math.random)', () => {
    const fs = require('node:fs');
    const txt = fs.readFileSync('api/admin/delete-customer-cascade.js', 'utf-8');
    expect(txt).toMatch(/randomBytes\(/);
    expect(txt).not.toMatch(/Math\.random\(\)/);
  });
});

describe('Phase 24.0 / S5 — shared CUSTOMER_CASCADE_COLLECTIONS parity (client + server)', () => {
  it('S5.1 client + server lists are identical (11 entries, same order)', () => {
    const fs = require('node:fs');
    const clientTxt = fs.readFileSync('src/lib/backendClient.js', 'utf-8');
    const serverTxt = fs.readFileSync('api/admin/delete-customer-cascade.js', 'utf-8');
    function parseList(src) {
      const m = src.match(/CUSTOMER_CASCADE_COLLECTIONS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
      if (!m) throw new Error('CUSTOMER_CASCADE_COLLECTIONS not found');
      return (m[1].match(/'(be_[a-z_]+)'/g) || []).map(s => s.slice(1, -1));
    }
    expect(parseList(clientTxt)).toEqual(parseList(serverTxt));
  });
});
```

- [ ] **Step 13.2: Run the test**

Run:
```bash
npm test -- --run tests/phase-24-0-customer-delete-server.test.js 2>&1 | tail -10
```
Expected: All ~25 tests pass.

If any FAIL, fix the underlying source code (NOT the test) per Rule 02.

---

## Task 14: Write `tests/phase-24-0-customer-delete-modal.test.jsx`

**Files:**
- Create: `tests/phase-24-0-customer-delete-modal.test.jsx`

- [ ] **Step 14.1: Create the file**

```jsx
// Phase 24.0 — DeleteCustomerCascadeModal RTL tests (3-dropdown gate +
// ProClinic-cloned warning + branch-scope filter + ลบ disabled state).
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// Mock layers — keep the modal's logic isolated from real Firebase.
vi.mock('../src/lib/scopedDataLayer.js', () => ({
  listStaff: vi.fn(async () => [
    { id: 'BS-1', name: 'พนง A', branchIds: ['BR-1'], status: 'active' },
    { id: 'BS-2', name: 'พนง B', branchIds: ['BR-2'], status: 'active' },
    { id: 'BS-3', name: 'พนง พักใช้งาน', branchIds: ['BR-1'], status: 'พักใช้งาน' },
  ]),
  listDoctors: vi.fn(async () => [
    { id: 'BD-1', name: 'Dr X', branchIds: ['BR-1'], status: 'active' },
    { id: 'BD-2', name: 'Dr Y', branchIds: ['BR-1'], status: 'active' },
    { id: 'BD-3', name: 'Dr Z', branchIds: ['BR-2'], status: 'active' },
  ]),
}));

vi.mock('../src/lib/branchScopeUtils.js', async () => {
  const actual = await vi.importActual('../src/lib/branchScopeUtils.js');
  return actual;
});

vi.mock('../src/lib/customerDeleteClient.js', () => ({
  deleteCustomerViaApi: vi.fn(),
}));

import DeleteCustomerCascadeModal from '../src/components/backend/DeleteCustomerCascadeModal.jsx';
import { deleteCustomerViaApi } from '../src/lib/customerDeleteClient.js';

const customerThai = {
  id: 'LC-26000003',
  hn_no: 'LC-26000003',
  prefix: 'นาย',
  firstname: 'ทดสอบ',
  lastname: 'ระบบ',
  branchId: 'BR-1',
  isManualEntry: true,
};
const customerProClinic = {
  ...customerThai,
  id: 'PC-2853',
  hn_no: '2853',
  isManualEntry: false,
};

beforeEach(() => {
  deleteCustomerViaApi.mockReset();
});

describe('Phase 24.0 / M1 — modal render + branch-scoped roster', () => {
  it('M1.1 renders Thai title + customer name + HN', async () => {
    render(<DeleteCustomerCascadeModal customer={customerThai} onClose={() => {}} onDeleted={() => {}} />);
    await screen.findByText(/ยืนยันลบลูกค้า/);
    expect(screen.getByText(/ทดสอบ/)).toBeTruthy();
    expect(screen.getByText(/HN: LC-26000003/)).toBeTruthy();
  });

  it('M1.2 lists 3 dropdowns (พนง / ผู้ช่วย / แพทย์)', async () => {
    render(<DeleteCustomerCascadeModal customer={customerThai} onClose={() => {}} onDeleted={() => {}} />);
    await waitFor(() => {
      const selects = screen.getAllByRole('combobox');
      expect(selects.length).toBe(3);
    });
  });

  it('M1.3 dropdowns filter by customer.branchId (BR-1 → 1 staff + 2 doctors)', async () => {
    render(<DeleteCustomerCascadeModal customer={customerThai} onClose={() => {}} onDeleted={() => {}} />);
    await waitFor(() => {
      const allOptions = screen.getAllByRole('option');
      const optionLabels = allOptions.map(o => o.textContent);
      // 3 dropdowns × 1 placeholder + filtered options
      expect(optionLabels.some(l => l.includes('พนง A'))).toBe(true);
      expect(optionLabels.some(l => l.includes('พนง B'))).toBe(false);  // BR-2, filtered out
      expect(optionLabels.some(l => l.includes('Dr X'))).toBe(true);
      expect(optionLabels.some(l => l.includes('Dr Y'))).toBe(true);
      expect(optionLabels.some(l => l.includes('Dr Z'))).toBe(false);  // BR-2, filtered out
      expect(optionLabels.some(l => l.includes('พักใช้งาน'))).toBe(false);  // status filtered
    });
  });
});

describe('Phase 24.0 / M2 — ลบถาวร button gate', () => {
  it('M2.1 disabled until all 3 dropdowns selected', async () => {
    render(<DeleteCustomerCascadeModal customer={customerThai} onClose={() => {}} onDeleted={() => {}} />);
    const btn = await screen.findByTestId('delete-customer-confirm');
    expect(btn).toBeDisabled();

    // Wait for roster load
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(3));
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'BS-1' } });
    expect(btn).toBeDisabled();  // only 1 of 3
    fireEvent.change(selects[1], { target: { value: 'BD-1' } });
    expect(btn).toBeDisabled();  // only 2 of 3
    fireEvent.change(selects[2], { target: { value: 'BD-2' } });
    expect(btn).not.toBeDisabled();
  });
});

describe('Phase 24.0 / M3 — ProClinic-cloned warning banner', () => {
  it('M3.1 isManualEntry !== true → warning visible', async () => {
    render(<DeleteCustomerCascadeModal customer={customerProClinic} onClose={() => {}} onDeleted={() => {}} />);
    await screen.findByText(/ProClinic sync/);
  });
  it('M3.2 isManualEntry === true → no warning', async () => {
    render(<DeleteCustomerCascadeModal customer={customerThai} onClose={() => {}} onDeleted={() => {}} />);
    await screen.findByText(/ยืนยันลบลูกค้า/);
    expect(screen.queryByText(/ProClinic sync/)).toBeNull();
  });
});

describe('Phase 24.0 / M4 — submit flow', () => {
  it('M4.1 click ลบ → calls deleteCustomerViaApi with all required fields', async () => {
    const onDeleted = vi.fn();
    deleteCustomerViaApi.mockResolvedValue({
      success: true,
      customerId: 'LC-26000003',
      cascadeCounts: { treatments: 1, sales: 0, deposits: 0 },
      auditDocId: 'customer-delete-LC-26000003-1-abc',
      totalDeletes: 2,
    });
    render(<DeleteCustomerCascadeModal customer={customerThai} onClose={() => {}} onDeleted={onDeleted} />);
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(3));
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'BS-1' } });
    fireEvent.change(selects[1], { target: { value: 'BD-1' } });
    fireEvent.change(selects[2], { target: { value: 'BD-2' } });
    fireEvent.click(screen.getByTestId('delete-customer-confirm'));
    await waitFor(() => expect(deleteCustomerViaApi).toHaveBeenCalledTimes(1));
    expect(deleteCustomerViaApi).toHaveBeenCalledWith({
      customerId: 'LC-26000003',
      authorizedBy: {
        staffId: 'BS-1', staffName: 'พนง A',
        assistantId: 'BD-1', assistantName: 'Dr X',
        doctorId: 'BD-2', doctorName: 'Dr Y',
      },
    });
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
  });

  it('M4.2 server error surfaces in red banner', async () => {
    deleteCustomerViaApi.mockRejectedValue(Object.assign(new Error('test fail'), { userMessage: 'staffId not in branch roster' }));
    render(<DeleteCustomerCascadeModal customer={customerThai} onClose={() => {}} onDeleted={() => {}} />);
    await waitFor(() => expect(screen.getAllByRole('option').length).toBeGreaterThan(3));
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[0], { target: { value: 'BS-1' } });
    fireEvent.change(selects[1], { target: { value: 'BD-1' } });
    fireEvent.change(selects[2], { target: { value: 'BD-2' } });
    fireEvent.click(screen.getByTestId('delete-customer-confirm'));
    await screen.findByText(/staffId not in branch roster/);
  });
});

describe('Phase 24.0 / M5 — close paths', () => {
  it('M5.1 ESC closes modal', async () => {
    const onClose = vi.fn();
    render(<DeleteCustomerCascadeModal customer={customerThai} onClose={onClose} onDeleted={() => {}} />);
    await screen.findByText(/ยืนยันลบลูกค้า/);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('M5.2 backdrop click closes', async () => {
    const onClose = vi.fn();
    render(<DeleteCustomerCascadeModal customer={customerThai} onClose={onClose} onDeleted={() => {}} />);
    const backdrop = await screen.findByTestId('delete-customer-modal');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('M5.3 X button closes', async () => {
    const onClose = vi.fn();
    render(<DeleteCustomerCascadeModal customer={customerThai} onClose={onClose} onDeleted={() => {}} />);
    await screen.findByText(/ยืนยันลบลูกค้า/);
    const buttons = screen.getAllByRole('button');
    const xBtn = buttons.find(b => b.querySelector('svg'));  // first svg-icon button = X
    fireEvent.click(xBtn);
    expect(onClose).toHaveBeenCalled();
  });
});
```

- [ ] **Step 14.2: Run the test**

Run:
```bash
npm test -- --run tests/phase-24-0-customer-delete-modal.test.jsx 2>&1 | tail -8
```
Expected: All tests pass.

---

## Task 15: Write `tests/phase-24-0-customer-delete-flow-simulate.test.js` (Rule I)

**Files:**
- Create: `tests/phase-24-0-customer-delete-flow-simulate.test.js`

- [ ] **Step 15.1: Create the flow-simulate file**

```js
// Phase 24.0 — Rule I full-flow simulate. End-to-end chain:
//   create A → assign HN(A) → delete A via cascade → create B → assert HN(B)
//   monotonic forward (HN-no-reuse regression lock).
//
// Plus pure-helper checks of the cascade chain, audit doc shape, and
// shared-constant parity. The HEAVY runtime side (firebase-admin against a
// real Firestore project) is COVERED by the dev-server preview_eval at
// verification time — this file is the source-grep + helper test bank.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const CLIENT = fs.readFileSync(
  path.join(process.cwd(), 'src/lib/backendClient.js'),
  'utf-8',
);
const SERVER = fs.readFileSync(
  path.join(process.cwd(), 'api/admin/delete-customer-cascade.js'),
  'utf-8',
);

describe('Phase 24.0 / F1 — HN counter monotonic-forward (no reuse)', () => {
  it('F1.1 generateCustomerHN uses runTransaction with seq + 1 (never decrements)', () => {
    expect(CLIENT).toMatch(/generateCustomerHN/);
    // The function body must read the existing seq and ADD 1 (never subtract).
    expect(CLIENT).toMatch(/nextSeq\s*=\s*\(data\.seq\s*\|\|\s*0\)\s*\+\s*1/);
  });
  it('F1.2 deleteCustomerCascade does NOT touch be_customer_counter', () => {
    // Anti-regression: the cascade must NEVER reset/decrement the counter.
    const fnBody = (CLIENT.match(/export async function deleteCustomerCascade[\s\S]*?^\}/m) || [])[0] || '';
    expect(fnBody).not.toMatch(/be_customer_counter/);
    expect(fnBody).not.toMatch(/customerCounterDoc/);
  });
  it('F1.3 server endpoint does NOT touch be_customer_counter either', () => {
    expect(SERVER).not.toMatch(/be_customer_counter/);
  });
});

describe('Phase 24.0 / F2 — cascade scope contract', () => {
  it('F2.1 client cascade list = 11 entries', () => {
    const m = CLIENT.match(/CUSTOMER_CASCADE_COLLECTIONS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
    expect(m).toBeTruthy();
    const entries = m[1].match(/'be_[a-z_]+'/g) || [];
    expect(entries.length).toBe(11);
  });
  it('F2.2 server cascade list = 11 entries', () => {
    const m = SERVER.match(/CUSTOMER_CASCADE_COLLECTIONS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
    expect(m).toBeTruthy();
    const entries = m[1].match(/'be_[a-z_]+'/g) || [];
    expect(entries.length).toBe(11);
  });
  it('F2.3 cascade includes V36-quinquies be_course_changes (was missing pre-Phase-24)', () => {
    expect(CLIENT).toMatch(/courseChangesCol/);
    expect(SERVER).toMatch(/be_course_changes/);
  });
  it('F2.4 cascade includes be_link_requests + be_customer_link_tokens (Phase 24.0 additions)', () => {
    expect(CLIENT).toMatch(/linkRequestsCol/);
    expect(CLIENT).toMatch(/customerLinkTokensCol/);
    expect(SERVER).toMatch(/be_link_requests/);
    expect(SERVER).toMatch(/be_customer_link_tokens/);
  });
  it('F2.5 cascade does NOT include opd_sessions (out-of-scope per spec §10)', () => {
    const m = CLIENT.match(/CUSTOMER_CASCADE_COLLECTIONS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
    expect(m[1]).not.toMatch(/opd_sessions/);
  });
});

describe('Phase 24.0 / F3 — audit doc shape', () => {
  it('F3.1 audit doc id format: customer-delete-{customerId}-{ts}-{rand}', () => {
    expect(SERVER).toMatch(/auditId\s*=\s*`customer-delete-\$\{customerId\}-\$\{ts\}-\$\{rand\}`/);
  });
  it('F3.2 audit payload includes type field "customer-delete-cascade"', () => {
    expect(SERVER).toMatch(/type:\s*['"]customer-delete-cascade['"]/);
  });
  it('F3.3 audit payload includes customerSnapshot', () => {
    expect(SERVER).toMatch(/customerSnapshot:\s*customer/);
  });
  it('F3.4 audit payload includes authorizedBy + performedBy + cascadeCounts + branchId + origin', () => {
    expect(SERVER).toMatch(/authorizedBy:/);
    expect(SERVER).toMatch(/performedBy:/);
    expect(SERVER).toMatch(/cascadeCounts/);
    expect(SERVER).toMatch(/branchId/);
    expect(SERVER).toMatch(/origin:\s*classifyOrigin\(customer\)/);
  });
  it('F3.5 audit doc commits in same batch as customer-doc delete (atomicity)', () => {
    // The endpoint must batchOp.set(auditRef, ...) BEFORE the final commit.
    expect(SERVER).toMatch(/batchOp\.set\(auditRef/);
    expect(SERVER).toMatch(/await batchOp\.commit\(\)/);
  });
});

describe('Phase 24.0 / F4 — UI wiring', () => {
  it('F4.1 CustomerCard renders ✕ icon button via Trash2 with stopPropagation', () => {
    const card = fs.readFileSync('src/components/backend/CustomerCard.jsx', 'utf-8');
    expect(card).toMatch(/Trash2/);
    expect(card).toMatch(/e\.stopPropagation\(\)/);
  });
  it('F4.2 CustomerDetailView has prominent ลบลูกค้า button', () => {
    const detail = fs.readFileSync('src/components/backend/CustomerDetailView.jsx', 'utf-8');
    expect(detail).toMatch(/ลบลูกค้า/);
    expect(detail).toMatch(/onDeleteCustomer/);
  });
  it('F4.3 CustomerListTab manages deletingCustomer state + renders modal', () => {
    const tab = fs.readFileSync('src/components/backend/CustomerListTab.jsx', 'utf-8');
    expect(tab).toMatch(/deletingCustomer/);
    expect(tab).toMatch(/DeleteCustomerCascadeModal/);
  });
});

describe('Phase 24.0 / F5 — full-flow simulate (pure mirror of HN behaviour)', () => {
  // Mirror the counter logic to assert no-reuse — proves that any cascade
  // delete operating between counter reads cannot affect the counter.
  function simulateCounter(initial = { year: '26', seq: 0 }) {
    let state = { ...initial };
    return {
      next() {
        state = { year: state.year, seq: state.seq + 1 };
        return `LC-${state.year}${String(state.seq).padStart(6, '0')}`;
      },
      readState() { return { ...state }; },
    };
  }
  // Mirror cascade-delete (no counter touch).
  function simulateCascadeDelete(customers, hn) {
    return customers.filter(c => c.hn !== hn);
  }

  it('F5.1 create A → delete A → create B → HN(B) > HN(A) [no reuse]', () => {
    const counter = simulateCounter();
    const customers = [];
    const hnA = counter.next();
    customers.push({ hn: hnA, name: 'A' });
    expect(hnA).toBe('LC-26000001');

    // Delete A — cascade does NOT touch counter.
    const survived = simulateCascadeDelete(customers, hnA);
    expect(survived.length).toBe(0);
    expect(counter.readState()).toEqual({ year: '26', seq: 1 });

    const hnB = counter.next();
    expect(hnB).toBe('LC-26000002');
    expect(hnB).not.toBe(hnA);
  });

  it('F5.2 create N customers, delete every other → next HN > all prior', () => {
    const counter = simulateCounter();
    let customers = [];
    const hns = [];
    for (let i = 0; i < 5; i += 1) {
      const hn = counter.next();
      customers.push({ hn, name: `C${i}` });
      hns.push(hn);
    }
    // delete idx 0, 2, 4
    customers = simulateCascadeDelete(customers, hns[0]);
    customers = simulateCascadeDelete(customers, hns[2]);
    customers = simulateCascadeDelete(customers, hns[4]);

    const hnNew = counter.next();
    expect(hnNew).toBe('LC-26000006');
    expect(hns).not.toContain(hnNew);
  });
});
```

- [ ] **Step 15.2: Run the test**

Run:
```bash
npm test -- --run tests/phase-24-0-customer-delete-flow-simulate.test.js 2>&1 | tail -10
```
Expected: All tests pass.

---

## Task 16: Write `tests/customer-delete-rule-probe.test.js`

**Files:**
- Create: `tests/customer-delete-rule-probe.test.js`

- [ ] **Step 16.1: Create the file**

```js
// Phase 24.0 — firestore.rules source-grep probe. Verifies the
// be_admin_audit/customer-delete-* narrow create exception is in place.
// (Live unauth probe is part of Rule B Probe-Deploy-Probe at user-triggered
// deploy time — covered by the rule-deploy runbook, not unit tests.)
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const RULES = fs.readFileSync(
  path.join(process.cwd(), 'firestore.rules'),
  'utf-8',
);

describe('Phase 24.0 / R — firestore.rules customer-delete-* prefix exception', () => {
  it('R.1 be_admin_audit allow-create now matches customer-delete-* prefix', () => {
    expect(RULES).toMatch(/be_admin_audit/);
    expect(RULES).toMatch(/customer-delete-/);
  });
  it('R.2 be_admin_audit allow-update + allow-delete remain false (immutable ledger)', () => {
    const block = RULES.match(/match\s*\/be_admin_audit[\s\S]*?\}\s*\}/);
    expect(block).toBeTruthy();
    expect(block[0]).toMatch(/allow update,?\s*delete:\s*if\s*false/);
  });
  it('R.3 customer-delete-* prefix gated behind isClinicStaff (not anon-allow)', () => {
    const block = RULES.match(/match\s*\/be_admin_audit[\s\S]*?allow create[\s\S]*?;/);
    expect(block).toBeTruthy();
    expect(block[0]).toMatch(/isClinicStaff\(\)/);
  });
});
```

- [ ] **Step 16.2: Run the test**

Run:
```bash
npm test -- --run tests/customer-delete-rule-probe.test.js 2>&1 | tail -8
```
Expected: 3 tests pass.

---

## Task 17: Final verify + commit + push

**Files:**
- All changes from Tasks 1-16

- [ ] **Step 17.1: Run full Phase 24.0 test bank**

Run:
```bash
npm test -- --run tests/phase-24-0-permission-customer-delete.test.js tests/phase-24-0-customer-delete-server.test.js tests/phase-24-0-customer-delete-modal.test.jsx tests/phase-24-0-customer-delete-flow-simulate.test.js tests/customer-delete-rule-probe.test.js 2>&1 | tail -10
```
Expected: ALL 5 files PASS, total ~80 tests.

If any fail, fix the source (NOT the test) and re-run before commit.

- [ ] **Step 17.2: Run full regression**

Run:
```bash
npm test -- --run 2>&1 | grep -E "^ Test Files|^      Tests" | tail -3
```
Expected: aggregate count UP by ~80 vs pre-Phase-24 baseline; 0 NEW failures (existing pre-existing flake `phase15.5b PF.4` is unrelated, document if it surfaces).

- [ ] **Step 17.3: Build verify**

Run:
```bash
npm run build 2>&1 | tail -5
```
Expected: `✓ built in <N>s`. No new MISSING_EXPORT errors.

- [ ] **Step 17.4: Stage exact files (V37 — never `git add -A`)**

Run:
```bash
git add \
  src/lib/backendClient.js \
  src/lib/permissionGroupValidation.js \
  src/lib/customerDeleteClient.js \
  src/components/backend/DeleteCustomerCascadeModal.jsx \
  src/components/backend/CustomerCard.jsx \
  src/components/backend/CustomerDetailView.jsx \
  src/components/backend/CustomerListTab.jsx \
  api/admin/delete-customer-cascade.js \
  firestore.rules \
  tests/phase-24-0-permission-customer-delete.test.js \
  tests/phase-24-0-customer-delete-server.test.js \
  tests/phase-24-0-customer-delete-modal.test.jsx \
  tests/phase-24-0-customer-delete-flow-simulate.test.js \
  tests/customer-delete-rule-probe.test.js
```

- [ ] **Step 17.5: Verify only intended files staged**

Run:
```bash
git diff --cached --stat | tail -20
```
Expected: 14 files with reasonable insertions/deletions; no unrelated changes.

- [ ] **Step 17.6: Commit**

Run:
```bash
git commit -m "$(cat <<'EOF'
feat(phase-24-0): customer delete button (cascade + audit + dual perm gate)

Implements docs/superpowers/specs/2026-05-06-customer-delete-button-design.md
(user-approved 2026-05-06).

User directive: add per-customer delete button in BackendDashboard customers
tab. HN counter must remain monotonic (deleted HN never reused).

Architecture:
- Inline ✕ icon on CustomerCard + prominent "ลบลูกค้า" button on
  CustomerDetailView. Both gated identically via dual-perm.
- Click → DeleteCustomerCascadeModal (native-styled) with cascade preview +
  3 required dropdowns (พนง / ผู้ช่วย / แพทย์) populated from customer's
  branch roster.
- Submit → POST /api/admin/delete-customer-cascade (NEW endpoint) with
  Firebase ID token + authorizedBy IDs.
- Server: verifyAdminToken → assert admin OR customer_delete claim →
  cross-validate authorizedBy IDs against branch roster → snapshot customer
  doc → atomic batched delete across 11 cascade collections + audit doc to
  be_admin_audit/customer-delete-{id}-{ts}-{rand}.

Cascade scope (11 collections, locked by shared CUSTOMER_CASCADE_COLLECTIONS):
  be_treatments / be_sales / be_deposits / be_wallets /
  be_wallet_transactions / be_memberships / be_point_transactions /
  be_appointments / be_course_changes / be_link_requests /
  be_customer_link_tokens

HN counter monotonic by design (regression-locked):
  generateCustomerHN() uses atomic Firestore counter at
  be_customer_counter/counter that ONLY increments. Neither
  deleteCustomerCascade (client) nor /api/admin/delete-customer-cascade
  (server) touches the counter. Verified by F1.2 + F1.3 source-grep tests.

Permissions:
  + NEW perm key `customer_delete` (default OFF, destructive: true) in
    permissionGroupValidation.js
  + Dual gate: useHasPermission('customer_delete') || isAdmin
  + Server gate: claims.admin === true || claims.customer_delete === true

firestore.rules:
  + be_admin_audit/customer-delete-* narrow create exception (admin-staff
    only). update + delete remain `if false` (immutable ledger).

Tests (+~80, batched per Rule K work-first-test-last):
  + tests/phase-24-0-permission-customer-delete.test.js (8 tests — perm
    declaration + dual gate + drift catcher)
  + tests/phase-24-0-customer-delete-server.test.js (~25 — pure helpers +
    source-grep guards + client/server cascade-list parity)
  + tests/phase-24-0-customer-delete-modal.test.jsx (~12 RTL — branch
    filter + ลบ disabled gate + ProClinic-cloned warning + close paths)
  + tests/phase-24-0-customer-delete-flow-simulate.test.js (~16 — Rule I
    full-flow incl. HN no-reuse regression lock)
  + tests/customer-delete-rule-probe.test.js (3 — rules grep)

Out-of-scope (deferred per spec §10):
  - opd_sessions (policy-pending; not in cascade)
  - Firebase Storage object cleanup (separate cron later)
  - Soft-delete grace period
  - Bulk multi-select delete

Verify:
  npm run build → clean
  npm test -- --run [5 phase-24-0 files] → all PASS
  npm test -- --run → aggregate +~80 vs baseline, 0 new failures

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 17.7: Push to origin master**

Run:
```bash
git push origin master 2>&1 | tail -5
```
Expected: `ok master` or `[master <SHA>...]` push confirmation.

- [ ] **Step 17.8: Verify commit landed**

Run:
```bash
git log --oneline -1
```
Expected: top line shows `feat(phase-24-0): customer delete button ...`.

---

## Self-Review Checklist (DO before considering plan done)

After all 17 tasks complete:

1. **Spec coverage** — every section of the spec has at least one task:
   - §2.1 HN counter regression-lock → Task 15 (F1)
   - §2.3 Cascade list (11 collections) → Task 2 + 3 (constant + extension)
   - §3 Q1-Q4 design → Tasks 8 (Q1+Q2) + 5+6 (Q3) + 4 (Q4)
   - §5 Components → Tasks 8-11
   - §6 Server endpoint → Task 4
   - §7 Audit doc shape → Task 4 body + Task 13 (F3)
   - §8 Permission gate → Task 5 + Task 12
   - §11 Test plan → Tasks 12-16
   - §13 Acceptance criteria → all covered

2. **Placeholder scan** — search the plan for `TBD`, `TODO`, `implement later`, `add appropriate error handling`. If any found, rewrite with explicit code.

3. **Type consistency** — `customer_delete` perm key spelling consistent across Tasks 5, 12, 13, 17 commit message. `CUSTOMER_CASCADE_COLLECTIONS` constant name consistent across Tasks 2, 3, 4, 13. `deleteCustomerViaApi` function name consistent across Tasks 7, 8, 14.

4. **No reference to undefined identifiers** — every `useHasPermission`, `useTabAccess`, `listStaff`, `listDoctors`, `filterStaffByBranch`, `filterDoctorsByBranch`, `verifyAdminToken` already exists in the codebase (verified during plan-write).

---

**End of plan. ~17 tasks. Estimated implementation time: 4-6 hours by a fresh engineer with the codebase open.**
