# Phase 17.1 — Cross-Branch Master-Data Import — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin-only "Copy from another branch" buttons on 7 master-data tabs (product-groups, product-units, medical-instruments, holidays, products, courses, df-groups) that selectively import items from a source branch into the current target branch via a shared modal + per-entity adapter + server-side admin endpoint.

**Architecture:** 3-layer composition — shared `<CrossBranchImportButton />` → shared `<CrossBranchImportModal />` (entity-agnostic; uses adapter prop) → 7 per-entity adapters in `src/lib/crossBranchImportAdapters/`. Write surface = NEW server endpoint `/api/admin/cross-branch-import` for atomic batch (entity writes + audit doc in one Firestore commit). Client computes preview only.

**Tech Stack:** React 19 + Firestore SDK (client-side reads) + firebase-admin SDK (server-side writes) + Vercel serverless + Vitest + RTL.

**Spec:** `docs/superpowers/specs/2026-05-05-phase-17-1-cross-branch-master-data-import-design.md`

**Predecessor:** Phase 17.0 (commit `5799bd5`, V15 #17 LIVE).

**Order:** Per Rule K work-first test-last — implementation Tasks 1-12 → review structure → test bank Tasks 13-16 → verify Tasks 17-18 → single bundled commit Task 19. NO commits between tasks.

---

## File Structure

| File | Action | Estimated LOC |
|---|---|---|
| `src/lib/crossBranchImportAdapters/index.js` | Create | ~30 |
| `src/lib/crossBranchImportAdapters/products.js` | Create | ~50 |
| `src/lib/crossBranchImportAdapters/product-groups.js` | Create | ~45 |
| `src/lib/crossBranchImportAdapters/product-units.js` | Create | ~30 |
| `src/lib/crossBranchImportAdapters/medical-instruments.js` | Create | ~30 |
| `src/lib/crossBranchImportAdapters/holidays.js` | Create | ~40 |
| `src/lib/crossBranchImportAdapters/courses.js` | Create | ~50 |
| `src/lib/crossBranchImportAdapters/df-groups.js` | Create | ~30 |
| `api/admin/cross-branch-import.js` | Create | ~250 |
| `src/components/backend/CrossBranchImportButton.jsx` | Create | ~50 |
| `src/components/backend/CrossBranchImportModal.jsx` | Create | ~280 |
| `src/components/backend/{ProductGroups,ProductUnits,MedicalInstruments,Holidays,Products,Courses,DfGroups}Tab.jsx` | Modify (×7) | ~5 each |
| `tests/phase-17-1-cross-branch-import-adapters.test.js` | Create | ~250 |
| `tests/phase-17-1-cross-branch-import-server.test.js` | Create | ~200 |
| `tests/phase-17-1-cross-branch-import-rtl.test.jsx` | Create | ~150 |
| `tests/phase-17-1-cross-branch-import-flow-simulate.test.js` | Create | ~150 |

---

## Task 1: Adapter — `products.js` (canonical reference)

**Files:**
- Create: `src/lib/crossBranchImportAdapters/products.js`

- [ ] **Step 1.1: Verify `be_products` doc field names**

Run: `grep -n "productId\|productName\|productType\|unitId\|categoryId\|mainUnitName\|categoryName" src/lib/backendClient.js | head -30`

Expected: confirm field names — `productId`, `productName`, `productType`, `unitId`, `categoryId` (optional). If field naming differs (e.g. snake_case), adjust the adapter accordingly.

- [ ] **Step 1.2: Write the adapter**

Use Write tool. Path: `F:/LoverClinic-app/src/lib/crossBranchImportAdapters/products.js`

```js
// ─── Cross-branch import adapter — products ────────────────────────────────
// Phase 17.1 (2026-05-05). Defines how `be_products` items are dedup-checked,
// FK-validated, cloned, and rendered in the cross-branch import modal.
//
// Spec: docs/superpowers/specs/2026-05-05-phase-17-1-cross-branch-master-data-import-design.md
// Wiki: wiki/concepts/cross-branch-import-pattern.md

export const productsAdapter = {
  entityType: 'products',
  collection: 'be_products',
  // Dedup by productType + productName (a product with same name in
  // different productType is legitimately different — e.g. "Acetin" as
  // ยา vs as สินค้าสิ้นเปลือง).
  dedupKey: (item) => `${item.productType || ''}:${item.productName || ''}`,
  // FK references: unitId → be_product_unit_groups, categoryId → be_product_groups.
  // Both are optional in the source doc; only return refs that are present.
  fkRefs: (item) => {
    const refs = [];
    if (item.unitId) {
      refs.push({ collection: 'be_product_unit_groups', ids: [String(item.unitId)] });
    }
    if (item.categoryId) {
      refs.push({ collection: 'be_product_groups', ids: [String(item.categoryId)] });
    }
    return refs;
  },
  // Clone: strip productId (server generates fresh), stamp branchId=target,
  // preserve createdAt+createdBy from source, new updatedAt+updatedBy=now+admin.
  clone: (item, targetBranchId, adminUid) => {
    const now = new Date().toISOString();
    const { productId, ...rest } = item;
    return {
      ...rest,
      branchId: String(targetBranchId),
      createdAt: item.createdAt || now,
      createdBy: item.createdBy || null,
      updatedAt: now,
      updatedBy: adminUid || null,
    };
  },
  // Display row for modal preview. Returns JSX. enrichmentMap reserved for
  // adapter-specific join data (unused for products — has all fields inline).
  displayRow: (item /*, enrichmentMap */) => ({
    primary: item.productName || '(ไม่มีชื่อ)',
    secondary: `${item.productType || '-'} • ${item.mainUnitName || '-'} • ${item.categoryName || '-'}`,
    tertiary: typeof item.price === 'number' ? `฿${item.price.toLocaleString('th-TH')}` : null,
  }),
};

export default productsAdapter;
```

- [ ] **Step 1.3: Verify**

Run: `grep -n "entityType\|collection\|dedupKey\|fkRefs\|clone\|displayRow" src/lib/crossBranchImportAdapters/products.js`

Expected: 6 keys present + 2 import lines.

---

## Task 2: Adapter — `product-groups.js`

**Files:**
- Create: `src/lib/crossBranchImportAdapters/product-groups.js`

- [ ] **Step 2.1: Verify field names**

Run: `grep -n "be_product_groups\|productGroupsCol\|groupId\|productType" src/lib/backendClient.js | head -20`

Expected: confirm `groupId` is the ID field, `name`, `productType`, `products[]` array with `productId` per entry.

- [ ] **Step 2.2: Write adapter**

```js
// ─── Cross-branch import adapter — product-groups ─────────────────────────
// Phase 17.1. Branch-scoped collection `be_product_groups`. Dedup by
// productType + name (consumable group "VAT" vs medication group "VAT" both
// legitimate). FK: products[].productId → be_products.

export const productGroupsAdapter = {
  entityType: 'product-groups',
  collection: 'be_product_groups',
  dedupKey: (item) => `${item.productType || ''}:${item.name || ''}`,
  fkRefs: (item) => {
    const ids = Array.isArray(item.products)
      ? item.products.map(p => p && p.productId ? String(p.productId) : null).filter(Boolean)
      : [];
    return ids.length ? [{ collection: 'be_products', ids }] : [];
  },
  clone: (item, targetBranchId, adminUid) => {
    const now = new Date().toISOString();
    const { groupId, ...rest } = item;
    return {
      ...rest,
      branchId: String(targetBranchId),
      createdAt: item.createdAt || now,
      createdBy: item.createdBy || null,
      updatedAt: now,
      updatedBy: adminUid || null,
    };
  },
  displayRow: (item) => ({
    primary: item.name || '(ไม่มีชื่อ)',
    secondary: `${item.productType || '-'} • ${(item.products || []).length} รายการ`,
    tertiary: item.status === 'พักใช้งาน' ? 'พักใช้งาน' : null,
  }),
};

export default productGroupsAdapter;
```

- [ ] **Step 2.3: Verify**: `grep -n "entityType\|fkRefs" src/lib/crossBranchImportAdapters/product-groups.js`

---

## Task 3: Adapter — `product-units.js`

**Files:** Create `src/lib/crossBranchImportAdapters/product-units.js`

- [ ] **Step 3.1: Verify field names**: `grep -n "be_product_unit_groups\|productUnitGroupsCol\|unitGroupId\|name" src/lib/backendClient.js | head -10`

- [ ] **Step 3.2: Write adapter**

```js
// ─── Cross-branch import adapter — product-units (be_product_unit_groups) ──
// Phase 17.1. Standalone (no FK refs).

export const productUnitsAdapter = {
  entityType: 'product-units',
  collection: 'be_product_unit_groups',
  dedupKey: (item) => `${item.name || ''}`,
  fkRefs: () => [],
  clone: (item, targetBranchId, adminUid) => {
    const now = new Date().toISOString();
    const { unitGroupId, ...rest } = item;
    return {
      ...rest,
      branchId: String(targetBranchId),
      createdAt: item.createdAt || now,
      createdBy: item.createdBy || null,
      updatedAt: now,
      updatedBy: adminUid || null,
    };
  },
  displayRow: (item) => ({
    primary: item.name || '(ไม่มีชื่อ)',
    secondary: Array.isArray(item.units) ? `${item.units.length} หน่วย` : null,
    tertiary: null,
  }),
};

export default productUnitsAdapter;
```

- [ ] **Step 3.3: Verify**: `grep -n "entityType" src/lib/crossBranchImportAdapters/product-units.js`

NOTE: If grep at Step 3.1 reveals the ID field is named differently (e.g. `unitId` not `unitGroupId`), update the destructure accordingly.

---

## Task 4: Adapter — `medical-instruments.js`

**Files:** Create `src/lib/crossBranchImportAdapters/medical-instruments.js`

- [ ] **Step 4.1: Verify field names**: `grep -n "be_medical_instruments\|instrumentId\|medicalInstrument" src/lib/backendClient.js | head -10`

- [ ] **Step 4.2: Write adapter**

```js
// ─── Cross-branch import adapter — medical-instruments ────────────────────
// Phase 17.1. Standalone (no FK refs).

export const medicalInstrumentsAdapter = {
  entityType: 'medical-instruments',
  collection: 'be_medical_instruments',
  dedupKey: (item) => `${item.name || ''}`,
  fkRefs: () => [],
  clone: (item, targetBranchId, adminUid) => {
    const now = new Date().toISOString();
    const { instrumentId, ...rest } = item;
    return {
      ...rest,
      branchId: String(targetBranchId),
      createdAt: item.createdAt || now,
      createdBy: item.createdBy || null,
      updatedAt: now,
      updatedBy: adminUid || null,
    };
  },
  displayRow: (item) => ({
    primary: item.name || '(ไม่มีชื่อ)',
    secondary: item.category || null,
    tertiary: item.status === 'พักใช้งาน' ? 'พักใช้งาน' : null,
  }),
};

export default medicalInstrumentsAdapter;
```

- [ ] **Step 4.3: Verify**: `grep -n "entityType" src/lib/crossBranchImportAdapters/medical-instruments.js`

---

## Task 5: Adapter — `holidays.js`

**Files:** Create `src/lib/crossBranchImportAdapters/holidays.js`

- [ ] **Step 5.1: Verify field names**: `grep -n "be_holidays\|holidayId\|holidayType\|specific\|weekly" src/lib/backendClient.js | head -10`

- [ ] **Step 5.2: Write adapter**

```js
// ─── Cross-branch import adapter — holidays ────────────────────────────────
// Phase 17.1. Standalone (no FK refs). Two kinds: specific-date(s) +
// weekly (day-of-week). Dedup key includes holidayType to differentiate.

export const holidaysAdapter = {
  entityType: 'holidays',
  collection: 'be_holidays',
  dedupKey: (item) => `${item.holidayType || 'specific'}:${item.name || ''}`,
  fkRefs: () => [],
  clone: (item, targetBranchId, adminUid) => {
    const now = new Date().toISOString();
    const { holidayId, ...rest } = item;
    return {
      ...rest,
      branchId: String(targetBranchId),
      createdAt: item.createdAt || now,
      createdBy: item.createdBy || null,
      updatedAt: now,
      updatedBy: adminUid || null,
    };
  },
  displayRow: (item) => {
    const typeLabel = item.holidayType === 'weekly' ? 'รายสัปดาห์' : 'วันเฉพาะ';
    let secondary = typeLabel;
    if (item.holidayType === 'weekly' && Array.isArray(item.daysOfWeek)) {
      secondary += ` • ${item.daysOfWeek.join(', ')}`;
    } else if (Array.isArray(item.dates)) {
      secondary += ` • ${item.dates.length} วัน`;
    }
    return {
      primary: item.name || '(ไม่มีชื่อ)',
      secondary,
      tertiary: null,
    };
  },
};

export default holidaysAdapter;
```

- [ ] **Step 5.3: Verify**: `grep -n "entityType" src/lib/crossBranchImportAdapters/holidays.js`

---

## Task 6: Adapter — `courses.js`

**Files:** Create `src/lib/crossBranchImportAdapters/courses.js`

- [ ] **Step 6.1: Verify field names**: `grep -n "be_courses\|courseId\|coursesCol\|items\[" src/lib/backendClient.js | head -20`

Expected: confirm `courseId` is the ID field, `name`, `items[]` array. Each item entry references a `productId`.

- [ ] **Step 6.2: Write adapter**

```js
// ─── Cross-branch import adapter — courses ────────────────────────────────
// Phase 17.1. Branch-scoped collection `be_courses`. FK: items[].productId
// → be_products. Admin must import products before courses (block on
// missing FK per Q2 lock).

export const coursesAdapter = {
  entityType: 'courses',
  collection: 'be_courses',
  dedupKey: (item) => `${item.name || ''}`,
  fkRefs: (item) => {
    const ids = Array.isArray(item.items)
      ? item.items.map(it => it && it.productId ? String(it.productId) : null).filter(Boolean)
      : [];
    return ids.length ? [{ collection: 'be_products', ids }] : [];
  },
  clone: (item, targetBranchId, adminUid) => {
    const now = new Date().toISOString();
    const { courseId, ...rest } = item;
    return {
      ...rest,
      branchId: String(targetBranchId),
      createdAt: item.createdAt || now,
      createdBy: item.createdBy || null,
      updatedAt: now,
      updatedBy: adminUid || null,
    };
  },
  displayRow: (item) => ({
    primary: item.name || '(ไม่มีชื่อ)',
    secondary: `${(item.items || []).length} รายการ${typeof item.price === 'number' ? ` • ฿${item.price.toLocaleString('th-TH')}` : ''}`,
    tertiary: item.courseType || null,
  }),
};

export default coursesAdapter;
```

- [ ] **Step 6.3: Verify**: `grep -n "fkRefs" src/lib/crossBranchImportAdapters/courses.js`

---

## Task 7: Adapter — `df-groups.js`

**Files:** Create `src/lib/crossBranchImportAdapters/df-groups.js`

- [ ] **Step 7.1: Verify field names**: `grep -n "be_df_groups\|dfGroupId\|dfGroupsCol" src/lib/backendClient.js | head -10`

- [ ] **Step 7.2: Write adapter**

```js
// ─── Cross-branch import adapter — df-groups ──────────────────────────────
// Phase 17.1. Branch-scoped `be_df_groups`. NO branch-scoped FK refs:
// staffId / doctorId references are to UNIVERSAL be_staff / be_doctors
// collections (per BSA matrix). Importing a df-group across branches keeps
// the same staff/doctor refs valid because staff/doctors are not
// branch-scoped.

export const dfGroupsAdapter = {
  entityType: 'df-groups',
  collection: 'be_df_groups',
  dedupKey: (item) => `${item.name || ''}`,
  fkRefs: () => [],
  clone: (item, targetBranchId, adminUid) => {
    const now = new Date().toISOString();
    const { dfGroupId, ...rest } = item;
    return {
      ...rest,
      branchId: String(targetBranchId),
      createdAt: item.createdAt || now,
      createdBy: item.createdBy || null,
      updatedAt: now,
      updatedBy: adminUid || null,
    };
  },
  displayRow: (item) => ({
    primary: item.name || '(ไม่มีชื่อ)',
    secondary: typeof item.percent === 'number' ? `${item.percent}%` : null,
    tertiary: null,
  }),
};

export default dfGroupsAdapter;
```

- [ ] **Step 7.3: Verify**: `grep -n "entityType" src/lib/crossBranchImportAdapters/df-groups.js`

---

## Task 8: Adapter registry — `index.js`

**Files:** Create `src/lib/crossBranchImportAdapters/index.js`

- [ ] **Step 8.1: Write registry**

```js
// ─── Cross-branch import adapter registry ─────────────────────────────────
// Phase 17.1. Single entry point — modal + button look up the adapter for
// a given entityType. Server endpoint imports the same registry to apply
// dedupKey + fkRefs + clone consistently between client preview and
// server-side write.

import productsAdapter from './products.js';
import productGroupsAdapter from './product-groups.js';
import productUnitsAdapter from './product-units.js';
import medicalInstrumentsAdapter from './medical-instruments.js';
import holidaysAdapter from './holidays.js';
import coursesAdapter from './courses.js';
import dfGroupsAdapter from './df-groups.js';

export const ADAPTERS = {
  'products': productsAdapter,
  'product-groups': productGroupsAdapter,
  'product-units': productUnitsAdapter,
  'medical-instruments': medicalInstrumentsAdapter,
  'holidays': holidaysAdapter,
  'courses': coursesAdapter,
  'df-groups': dfGroupsAdapter,
};

export const ENTITY_TYPES = Object.keys(ADAPTERS);

export function getAdapter(entityType) {
  const adapter = ADAPTERS[entityType];
  if (!adapter) {
    throw new Error(`Unknown entityType: ${entityType}. Known: ${ENTITY_TYPES.join(', ')}`);
  }
  return adapter;
}

export function isKnownEntityType(entityType) {
  return entityType in ADAPTERS;
}
```

- [ ] **Step 8.2: Verify all 7 imports + 7 registry entries**:

Run: `grep -c "Adapter from" src/lib/crossBranchImportAdapters/index.js && grep -c "':" src/lib/crossBranchImportAdapters/index.js`

Expected: `7` (imports) and at least `7` (registry entries — lines containing `':`).

---

## Task 9: Server endpoint — `api/admin/cross-branch-import.js`

**Files:**
- Create: `api/admin/cross-branch-import.js`

- [ ] **Step 9.1: Read existing admin endpoint as template**

Run: `ls api/admin/ | head -10 && head -50 api/admin/cleanup-orphan-stock.js 2>/dev/null || head -50 api/admin/cleanup-test-products.js 2>/dev/null`

Confirm: how the existing endpoint imports firebase-admin, verifies token, gates admin claim. Mirror this pattern.

- [ ] **Step 9.2: Write the endpoint**

```js
// ─── /api/admin/cross-branch-import — Phase 17.1 ──────────────────────────
// Server-side cross-branch master-data import. Atomic firebase-admin batch
// writes N entity docs + 1 audit doc in a single commit.
//
// Spec: docs/superpowers/specs/2026-05-05-phase-17-1-cross-branch-master-data-import-design.md
//
// Auth: Bearer ID token w/ admin:true claim.
// Request: { entityType, sourceBranchId, targetBranchId, itemIds: string[] }
// Response: { imported, skippedDup, skippedFK, auditId }

import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import crypto from 'crypto';
import { ADAPTERS, isKnownEntityType, getAdapter } from '../../src/lib/crossBranchImportAdapters/index.js';

// Firebase Admin SDK init (idempotent)
function initAdmin() {
  if (getApps().length === 0) {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('Firebase Admin credentials missing in env');
    }
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
}

// Resolve Firestore collection path under the artifacts/{appId}/public/data/
// base used by the rest of the project (matches src/lib/backendClient.js).
function colPath(collection) {
  const appId = process.env.FIREBASE_APP_ID || 'genform-app';
  return `artifacts/${appId}/public/data/${collection}`;
}

// Extract Bearer token + verify admin claim.
async function verifyAdminToken(req) {
  const auth = req.headers.authorization || '';
  const m = auth.match(/^Bearer (.+)$/);
  if (!m) {
    const err = new Error('MISSING_AUTH');
    err.code = 401;
    throw err;
  }
  const decoded = await getAuth().verifyIdToken(m[1]);
  if (!decoded.admin) {
    const err = new Error('NOT_ADMIN');
    err.code = 403;
    throw err;
  }
  return decoded;
}

// Truncate audit ID arrays for Firestore 1MB doc-size guard.
function maybeTruncate(arr) {
  const max = 500;
  if (!Array.isArray(arr) || arr.length <= max) return { value: arr, truncated: false };
  return { value: arr.slice(0, 10), truncated: true, totalCount: arr.length };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }
  try {
    initAdmin();
    const decoded = await verifyAdminToken(req);

    const { entityType, sourceBranchId, targetBranchId, itemIds } = req.body || {};

    // Validation
    if (!isKnownEntityType(entityType)) {
      return res.status(400).json({ error: 'INVALID_ENTITY_TYPE', entityType });
    }
    if (!sourceBranchId || !targetBranchId) {
      return res.status(400).json({ error: 'MISSING_BRANCH_ID' });
    }
    if (sourceBranchId === targetBranchId) {
      return res.status(400).json({ error: 'SOURCE_EQUALS_TARGET' });
    }
    if (!Array.isArray(itemIds) || itemIds.length === 0) {
      return res.status(400).json({ error: 'EMPTY_ITEM_IDS' });
    }

    const adapter = getAdapter(entityType);
    const db = getFirestore();
    const colRef = db.collection(colPath(adapter.collection));

    // 1. Read source items (branchId=source, doc-id IN itemIds).
    // Use batched-id reads (Firestore in-clause max 30) to handle big lists.
    const sourceItems = [];
    for (let i = 0; i < itemIds.length; i += 30) {
      const chunk = itemIds.slice(i, i + 30);
      const snap = await colRef
        .where('branchId', '==', sourceBranchId)
        .where('__name__', 'in', chunk)
        .get();
      snap.docs.forEach(d => sourceItems.push({ id: d.id, ...d.data() }));
    }

    // 2. Read target items (full set for dedup).
    const targetSnap = await colRef.where('branchId', '==', targetBranchId).get();
    const targetItems = targetSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const targetDedupSet = new Set(targetItems.map(t => adapter.dedupKey(t)));

    // 3. Read FK collections for target branch.
    const fkRefs = sourceItems.flatMap(item => adapter.fkRefs(item));
    const fkCollections = [...new Set(fkRefs.map(r => r.collection))];
    const fkTargetIdSets = {};  // { 'be_products': Set('PROD-1', 'PROD-2', ...) }
    for (const col of fkCollections) {
      const fkSnap = await db.collection(colPath(col)).where('branchId', '==', targetBranchId).get();
      // Match by dedupKey-style: assume FK lookup is by name+secondary
      // (mirrors how dedup catches "same logical entity in target"). For
      // FK we need name match — read target's docs into a Set keyed on
      // the entity's *name* (since source's productId won't match target's
      // newly-generated productId; only name-based match meaningful).
      const fkAdapter = getAdapter(
        col === 'be_products' ? 'products' :
        col === 'be_product_groups' ? 'product-groups' :
        col === 'be_product_unit_groups' ? 'product-units' : null
      );
      const fkSet = new Set(
        fkAdapter
          ? fkSnap.docs.map(d => fkAdapter.dedupKey({ id: d.id, ...d.data() }))
          : fkSnap.docs.map(d => d.id)
      );
      fkTargetIdSets[col] = fkSet;
    }

    // FK check: for each source item, does each fkRef have a name-match in target?
    // Note: source's referenced ID (e.g. productId) needs to map to target's
    // dedupKey (e.g. productType:productName). This requires the SOURCE's FK
    // doc lookup. Read source FK docs to compute their dedupKeys.
    const sourceFkLookup = {};  // { 'be_products': { 'PROD-1': 'productType:name' } }
    for (const col of fkCollections) {
      const fkAdapter = getAdapter(
        col === 'be_products' ? 'products' :
        col === 'be_product_groups' ? 'product-groups' :
        col === 'be_product_unit_groups' ? 'product-units' : null
      );
      if (!fkAdapter) continue;
      const sSnap = await db.collection(colPath(col)).where('branchId', '==', sourceBranchId).get();
      const lookup = {};
      sSnap.docs.forEach(d => {
        lookup[d.id] = fkAdapter.dedupKey({ id: d.id, ...d.data() });
      });
      sourceFkLookup[col] = lookup;
    }

    // 4. Classify each requested item.
    const imported = [];
    const skippedDup = [];
    const skippedFK = [];
    const itemsToImport = [];

    for (const item of sourceItems) {
      const dedupKey = adapter.dedupKey(item);
      if (targetDedupSet.has(dedupKey)) {
        skippedDup.push({ sourceId: item.id, reason: 'duplicate', dedupKey });
        continue;
      }
      // FK check — every ref in adapter.fkRefs(item) must have a name-match
      // in target.
      const refs = adapter.fkRefs(item);
      const missingFKs = [];
      for (const ref of refs) {
        for (const refId of ref.ids) {
          const sourceFkKey = sourceFkLookup[ref.collection]?.[refId];
          if (!sourceFkKey || !fkTargetIdSets[ref.collection]?.has(sourceFkKey)) {
            missingFKs.push({ collection: ref.collection, sourceId: refId, dedupKey: sourceFkKey });
          }
        }
      }
      if (missingFKs.length > 0) {
        skippedFK.push({ sourceId: item.id, reason: 'missing-fk', missingRefs: missingFKs });
        continue;
      }
      itemsToImport.push(item);
    }

    // 5. Atomic batch write.
    const batch = db.batch();
    const ts = Date.now();
    for (const item of itemsToImport) {
      const newId = `${entityType.replace(/-/g, '_')}_${ts}_${crypto.randomBytes(4).toString('hex')}`.toUpperCase();
      const cloned = adapter.clone(item, targetBranchId, decoded.uid);
      batch.set(colRef.doc(newId), cloned);
      imported.push({ sourceId: item.id, newId });
    }

    // Audit doc.
    const auditId = `cross-branch-import-${ts}-${crypto.randomUUID()}`;
    const importedTrunc = maybeTruncate(imported);
    const skippedDupTrunc = maybeTruncate(skippedDup);
    const skippedFKTrunc = maybeTruncate(skippedFK);
    const auditDoc = {
      action: 'cross-branch-import',
      entityType,
      sourceBranchId: String(sourceBranchId),
      targetBranchId: String(targetBranchId),
      requestedItemCount: itemIds.length,
      importedCount: imported.length,
      skippedDuplicateCount: skippedDup.length,
      skippedFKCount: skippedFK.length,
      imported: importedTrunc.value,
      importedTruncated: !!importedTrunc.truncated,
      skippedDuplicates: skippedDupTrunc.value,
      skippedDuplicatesTruncated: !!skippedDupTrunc.truncated,
      skippedMissingFKs: skippedFKTrunc.value,
      skippedMissingFKsTruncated: !!skippedFKTrunc.truncated,
      adminUid: decoded.uid,
      adminEmail: decoded.email || null,
      ts: new Date(ts).toISOString(),
    };
    batch.set(db.collection(colPath('be_admin_audit')).doc(auditId), auditDoc);

    await batch.commit();

    return res.status(200).json({
      imported: imported,
      skippedDup,
      skippedFK,
      auditId,
    });
  } catch (e) {
    if (e.code === 401) return res.status(401).json({ error: 'MISSING_AUTH' });
    if (e.code === 403) return res.status(403).json({ error: 'NOT_ADMIN' });
    console.error('[cross-branch-import]', e);
    return res.status(500).json({ error: 'BATCH_COMMIT_FAILED', message: String(e.message || e) });
  }
}
```

- [ ] **Step 9.3: Verify imports + handler shape**:

Run: `grep -n "import\|export default\|status(\\|verifyIdToken\\|admin\\|batch.commit" api/admin/cross-branch-import.js | head -20`

Expected: imports of firebase-admin, getAdapter from registry, default-export handler, status codes 401/403/400/200/500, batch.commit() call.

NOTE: The endpoint relies on the existing project's firebase-admin env vars (`FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_APP_ID`). If env var names differ in this project, adjust to match `api/admin/cleanup-orphan-stock.js` (template).

---

## Task 10: Shared UI — `CrossBranchImportButton.jsx`

**Files:**
- Create: `src/components/backend/CrossBranchImportButton.jsx`

- [ ] **Step 10.1: Write component**

```jsx
// ─── CrossBranchImportButton — Phase 17.1 ──────────────────────────────────
// Admin-only icon button rendered next to existing Create button on each of
// the 7 master-data tabs. Opens CrossBranchImportModal pre-bound to the
// adapter for that entityType.

import { useState } from 'react';
import { Copy } from 'lucide-react';
import { useTabAccess } from '../../hooks/useTabAccess.js';
import { getAdapter } from '../../lib/crossBranchImportAdapters/index.js';
import CrossBranchImportModal from './CrossBranchImportModal.jsx';

export default function CrossBranchImportButton({ entityType, onImported, isDark }) {
  const { isAdmin } = useTabAccess();
  const [open, setOpen] = useState(false);

  // Phase 17.1 (Q6 lock) — admin-only. Hide the button entirely from
  // non-admin staff. Server endpoint also enforces admin claim (defense
  // in depth).
  if (!isAdmin) return null;

  const adapter = getAdapter(entityType);

  const buttonCls = `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
    isDark
      ? 'bg-purple-900/30 hover:bg-purple-900/50 text-purple-300 border border-purple-800/40'
      : 'bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200'
  }`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={buttonCls}
        title="Copy from another branch (admin only)"
        data-testid={`cross-branch-import-btn-${entityType}`}
      >
        <Copy size={12} />
        <span>Copy จากสาขาอื่น</span>
      </button>
      {open && (
        <CrossBranchImportModal
          adapter={adapter}
          isDark={isDark}
          onClose={() => setOpen(false)}
          onImported={(result) => {
            setOpen(false);
            if (typeof onImported === 'function') onImported(result);
          }}
        />
      )}
    </>
  );
}
```

- [ ] **Step 10.2: Verify**:

Run: `grep -n "useTabAccess\|isAdmin\|getAdapter\|CrossBranchImportModal" src/components/backend/CrossBranchImportButton.jsx`

Expected: 4 hits (admin gate + adapter lookup + modal import).

---

## Task 11: Shared UI — `CrossBranchImportModal.jsx`

**Files:**
- Create: `src/components/backend/CrossBranchImportModal.jsx`

- [ ] **Step 11.1: Write component**

```jsx
// ─── CrossBranchImportModal — Phase 17.1 ──────────────────────────────────
// Entity-agnostic modal. Renders source-branch picker + preview table with
// dedup + FK-check greying + select-all + Import button. POSTs to
// /api/admin/cross-branch-import on confirm.
//
// Driven entirely by props.adapter — see src/lib/crossBranchImportAdapters/.

import { useState, useEffect, useMemo, useCallback } from 'react';
import { X, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import * as scopedDataLayer from '../../lib/scopedDataLayer.js';
import { auth } from '../../firebase.js';

const LISTER_NAME_BY_COLLECTION = {
  'be_products': 'listProducts',
  'be_product_groups': 'listProductGroups',
  'be_product_unit_groups': 'listProductUnitGroups',
  'be_medical_instruments': 'listMedicalInstruments',
  'be_holidays': 'listHolidays',
  'be_courses': 'listCourses',
  'be_df_groups': 'listDfGroups',
};

function listForCollection(collection, opts) {
  const fnName = LISTER_NAME_BY_COLLECTION[collection];
  const fn = scopedDataLayer[fnName];
  if (typeof fn !== 'function') {
    throw new Error(`No lister exported from scopedDataLayer for ${collection}`);
  }
  return fn(opts);
}

export default function CrossBranchImportModal({ adapter, isDark, onClose, onImported }) {
  const { branchId: targetBranchId } = useSelectedBranch();

  const [branches, setBranches] = useState([]);
  const [sourceBranchId, setSourceBranchId] = useState('');
  const [sourceItems, setSourceItems] = useState([]);
  const [targetItems, setTargetItems] = useState([]);
  const [fkSourceMaps, setFkSourceMaps] = useState({});  // {col: {id: dedupKey}}
  const [fkTargetSets, setFkTargetSets] = useState({});  // {col: Set<dedupKey>}
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);

  // Load branches list on open.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await scopedDataLayer.listBranches();
        if (!cancelled) {
          setBranches((list || []).filter(b => b && b.branchId !== targetBranchId && b.status !== 'พักใช้งาน'));
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'โหลดสาขาล้มเหลว');
      }
    })();
    return () => { cancelled = true; };
  }, [targetBranchId]);

  // Load source / target / FK data on source pick.
  const loadPreview = useCallback(async () => {
    if (!sourceBranchId) return;
    setLoading(true);
    setError('');
    setSelectedIds(new Set());
    try {
      const [src, tgt] = await Promise.all([
        listForCollection(adapter.collection, { branchId: sourceBranchId }),
        listForCollection(adapter.collection, { branchId: targetBranchId }),
      ]);

      // Compute FK collections needed (union of fkRefs across all source items).
      const fkRefs = (src || []).flatMap(item => adapter.fkRefs(item));
      const fkCollections = [...new Set(fkRefs.map(r => r.collection))];

      const fkSrcMaps = {};
      const fkTgtSets = {};
      for (const col of fkCollections) {
        const [srcFk, tgtFk] = await Promise.all([
          listForCollection(col, { branchId: sourceBranchId }),
          listForCollection(col, { branchId: targetBranchId }),
        ]);
        // We need the FK adapter to compute dedupKey for source FK lookup;
        // dynamically import the registry so this stays adapter-agnostic.
        const { getAdapter } = await import('../../lib/crossBranchImportAdapters/index.js');
        const fkEntityType = (
          col === 'be_products' ? 'products' :
          col === 'be_product_groups' ? 'product-groups' :
          col === 'be_product_unit_groups' ? 'product-units' : null
        );
        const fkAdapter = fkEntityType ? getAdapter(fkEntityType) : null;
        const idKey = (
          col === 'be_products' ? 'productId' :
          col === 'be_product_groups' ? 'groupId' :
          col === 'be_product_unit_groups' ? 'unitGroupId' : 'id'
        );
        const srcMap = {};
        (srcFk || []).forEach(f => {
          const id = String(f[idKey] || f.id || '');
          if (id && fkAdapter) srcMap[id] = fkAdapter.dedupKey(f);
        });
        const tgtSet = new Set((tgtFk || []).map(f => fkAdapter ? fkAdapter.dedupKey(f) : f.id));
        fkSrcMaps[col] = srcMap;
        fkTgtSets[col] = tgtSet;
      }

      setSourceItems(src || []);
      setTargetItems(tgt || []);
      setFkSourceMaps(fkSrcMaps);
      setFkTargetSets(fkTgtSets);
    } catch (e) {
      setError(e.message || 'โหลดข้อมูลล้มเหลว');
    } finally {
      setLoading(false);
    }
  }, [sourceBranchId, targetBranchId, adapter]);

  useEffect(() => { loadPreview(); }, [loadPreview]);

  // Compute classification per row.
  const classified = useMemo(() => {
    const targetDedupSet = new Set((targetItems || []).map(t => adapter.dedupKey(t)));
    return (sourceItems || []).map(item => {
      const dedupKey = adapter.dedupKey(item);
      if (targetDedupSet.has(dedupKey)) {
        return { item, status: 'dup', reason: 'ซ้ำกับ ' + dedupKey + ' ในสาขานี้' };
      }
      const refs = adapter.fkRefs(item);
      const missing = [];
      for (const ref of refs) {
        for (const refId of ref.ids) {
          const sourceKey = fkSourceMaps[ref.collection]?.[refId];
          if (!sourceKey || !fkTargetSets[ref.collection]?.has(sourceKey)) {
            missing.push({ collection: ref.collection, sourceKey: sourceKey || '(unknown)' });
          }
        }
      }
      if (missing.length > 0) {
        const summary = missing.map(m => m.sourceKey).join(', ');
        return { item, status: 'fk', reason: 'ต้อง import ก่อน: ' + summary };
      }
      return { item, status: 'ok' };
    });
  }, [sourceItems, targetItems, fkSourceMaps, fkTargetSets, adapter]);

  const importableIds = useMemo(
    () => classified.filter(c => c.status === 'ok').map(c => c.item.id),
    [classified]
  );

  const allImportableSelected = importableIds.length > 0
    && importableIds.every(id => selectedIds.has(id));

  const toggleAll = () => {
    setSelectedIds(prev => {
      if (allImportableSelected) return new Set();
      return new Set(importableIds);
    });
  };

  const toggleOne = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handleImport = async () => {
    if (selectedIds.size === 0) return;
    setImporting(true);
    setError('');
    try {
      const idToken = await auth.currentUser.getIdToken();
      const resp = await fetch('/api/admin/cross-branch-import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          entityType: adapter.entityType,
          sourceBranchId,
          targetBranchId,
          itemIds: Array.from(selectedIds),
        }),
      });
      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({}));
        throw new Error(errBody.error || `Import failed: ${resp.status}`);
      }
      const data = await resp.json();
      setResult(data);
      if (typeof onImported === 'function') onImported(data);
    } catch (e) {
      setError(e.message || 'Import ล้มเหลว');
    } finally {
      setImporting(false);
    }
  };

  const overlayCls = 'fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm';
  const panelCls = `w-[90vw] max-w-3xl max-h-[85vh] flex flex-col rounded-xl shadow-xl ${
    isDark ? 'bg-[#111] border border-[#333] text-gray-200' : 'bg-white border border-gray-200 text-gray-800'
  }`;

  return (
    <div className={overlayCls} role="dialog" aria-modal="true" aria-label="Cross-branch import">
      <div className={panelCls}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-inherit">
          <h3 className="text-base font-semibold">Copy {adapter.entityType} จากสาขาอื่น</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-white/10" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
          {!result && (
            <>
              {/* Source picker */}
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">
                  สาขาต้นทาง
                </label>
                <select
                  value={sourceBranchId}
                  onChange={(e) => setSourceBranchId(e.target.value)}
                  className={`w-full rounded-lg px-3 py-2 text-sm outline-none ${
                    isDark ? 'bg-[#1a1a1a] border border-[#333]' : 'bg-gray-50 border border-gray-200'
                  }`}
                  data-testid="cross-branch-source-picker"
                >
                  <option value="">-- เลือกสาขา --</option>
                  {branches.map(b => (
                    <option key={b.branchId} value={b.branchId}>{b.name}</option>
                  ))}
                </select>
              </div>

              {/* Loading / Error / Preview */}
              {loading && (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={20} className="animate-spin text-purple-400" />
                  <span className="text-xs text-gray-500 ml-2">กำลังโหลด...</span>
                </div>
              )}
              {error && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-rose-900/20 border border-rose-800/40 text-rose-300 text-xs">
                  <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {!loading && !error && sourceBranchId && classified.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2 text-xs text-gray-500">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={allImportableSelected}
                        onChange={toggleAll}
                        data-testid="cross-branch-select-all"
                      />
                      <span>เลือกทั้งหมด ({importableIds.length} รายการ)</span>
                    </label>
                    <span>{classified.length} รายการ ({importableIds.length} import ได้)</span>
                  </div>
                  <div className="space-y-1 max-h-[40vh] overflow-y-auto">
                    {classified.map(({ item, status, reason }) => {
                      const disabled = status !== 'ok';
                      const row = adapter.displayRow(item);
                      const rowCls = disabled
                        ? (status === 'dup'
                          ? 'opacity-40 grayscale'
                          : 'opacity-50 ring-1 ring-rose-800/40')
                        : 'hover:bg-white/5';
                      return (
                        <label
                          key={item.id}
                          className={`flex items-start gap-2 p-2 rounded ${rowCls} ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                          title={disabled ? reason : ''}
                          data-testid={`cross-branch-row-${item.id}`}
                          data-status={status}
                        >
                          <input
                            type="checkbox"
                            checked={selectedIds.has(item.id)}
                            disabled={disabled}
                            onChange={() => toggleOne(item.id)}
                            data-testid={`cross-branch-row-checkbox-${item.id}`}
                          />
                          <div className="flex-1 text-xs">
                            <div className="font-medium">{row.primary}</div>
                            {row.secondary && <div className="text-gray-500">{row.secondary}</div>}
                            {row.tertiary && <div className="text-gray-600">{row.tertiary}</div>}
                            {disabled && <div className="text-rose-400 mt-1">{reason}</div>}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              )}

              {!loading && !error && sourceBranchId && classified.length === 0 && (
                <div className="text-xs text-gray-500 text-center py-8">
                  ไม่พบข้อมูลในสาขาต้นทาง
                </div>
              )}
            </>
          )}

          {/* Result panel */}
          {result && (
            <div className="space-y-2">
              <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-900/20 border border-emerald-800/40 text-emerald-300 text-xs">
                <CheckCircle size={14} className="mt-0.5 flex-shrink-0" />
                <span>Import สำเร็จ {result.imported.length} รายการ ({result.skippedDup.length} ซ้ำ • {result.skippedFK.length} ขาด FK)</span>
              </div>
              <div className="text-xs text-gray-500">
                Audit: <code>{result.auditId}</code>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-inherit">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs rounded-lg hover:bg-white/10"
            data-testid="cross-branch-cancel-btn"
          >
            {result ? 'ปิด' : 'ยกเลิก'}
          </button>
          {!result && (
            <button
              type="button"
              onClick={handleImport}
              disabled={selectedIds.size === 0 || importing}
              className={`px-4 py-1.5 text-xs rounded-lg font-medium ${
                selectedIds.size === 0 || importing
                  ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed'
                  : 'bg-purple-600 hover:bg-purple-500 text-white'
              }`}
              data-testid="cross-branch-import-confirm-btn"
            >
              {importing ? (
                <span className="inline-flex items-center gap-1.5">
                  <Loader2 size={12} className="animate-spin" />
                  กำลัง import...
                </span>
              ) : (
                <span>Import {selectedIds.size} รายการ</span>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 11.2: Verify**:

Run: `grep -n "useSelectedBranch\|adapter\\.dedupKey\|adapter\\.fkRefs\|adapter\\.displayRow\|cross-branch-source-picker\|cross-branch-import-confirm-btn" src/components/backend/CrossBranchImportModal.jsx | head -20`

Expected: hits for branch context, adapter usage, and at least 2 data-testid attributes.

- [ ] **Step 11.3: Build sanity-check**

Run: `npm run build 2>&1 | tail -10`

Expected: clean.

---

## Task 12: Wire `<CrossBranchImportButton>` into 7 master-data tabs

**Files:**
- Modify: `src/components/backend/ProductGroupsTab.jsx`
- Modify: `src/components/backend/ProductUnitsTab.jsx`
- Modify: `src/components/backend/MedicalInstrumentsTab.jsx`
- Modify: `src/components/backend/HolidaysTab.jsx`
- Modify: `src/components/backend/ProductsTab.jsx`
- Modify: `src/components/backend/CoursesTab.jsx`
- Modify: `src/components/backend/DfGroupsTab.jsx`

For EACH of the 7 files:

- [ ] **Step 12.x.1: Read existing imports + find Create button**

Run: `grep -n "import\|onClick={handleCreate\|onClick={() => handleCreate" src/components/backend/ProductGroupsTab.jsx | head -20`

Identify (a) the line where the `import ... from './ProductGroupFormModal.jsx';` lives — add the new import directly after it, and (b) the JSX line where the Create button is rendered (e.g. inside a header div).

- [ ] **Step 12.x.2: Add import**

After the last component import line, insert:

```js
import CrossBranchImportButton from './CrossBranchImportButton.jsx';
```

- [ ] **Step 12.x.3: Render the button next to Create**

Find the Create-button JSX (the line with `onClick={handleCreate}` or `onClick={() => handleCreate()}`) and INSERT a sibling button next to it, INSIDE the same parent container:

```jsx
<CrossBranchImportButton
  entityType="product-groups"
  isDark={resolveIsDark ? resolveIsDark(theme) : (theme === 'dark')}
  onImported={() => reload()}
/>
```

Replace `entityType="product-groups"` with the matching string per tab:
- ProductGroupsTab → `"product-groups"`
- ProductUnitsTab → `"product-units"`
- MedicalInstrumentsTab → `"medical-instruments"`
- HolidaysTab → `"holidays"`
- ProductsTab → `"products"`
- CoursesTab → `"courses"`
- DfGroupsTab → `"df-groups"`

- [ ] **Step 12.x.4: Verify**:

Run: `grep -n "CrossBranchImportButton\|entityType=" src/components/backend/<TabName>.jsx`

Expected: 1 import + 1 JSX usage with the correct entityType.

- [ ] **Step 12.13: Final build sanity-check after all 7 tabs wired**

Run: `npm run build 2>&1 | tail -10`

Expected: clean.

---

## Task 13: Test bank — adapter contracts (`tests/phase-17-1-cross-branch-import-adapters.test.js`)

**Files:**
- Create: `tests/phase-17-1-cross-branch-import-adapters.test.js`

- [ ] **Step 13.1: Write the test file**

```javascript
// ─── Phase 17.1 — adapter contract tests ──────────────────────────────────
// Per-entity adapter shape + dedupKey + fkRefs + clone semantics +
// adversarial inputs.

import { describe, it, expect } from 'vitest';
import { ADAPTERS, ENTITY_TYPES, getAdapter, isKnownEntityType } from '../src/lib/crossBranchImportAdapters/index.js';

const REQUIRED_KEYS = ['entityType', 'collection', 'dedupKey', 'fkRefs', 'clone', 'displayRow'];

describe('Phase 17.1 — adapter registry', () => {
  it('A1.1 ADAPTERS has 7 entries', () => {
    expect(Object.keys(ADAPTERS).length).toBe(7);
  });
  it('A1.2 ENTITY_TYPES contains all 7 known types', () => {
    expect(ENTITY_TYPES.sort()).toEqual(['courses', 'df-groups', 'holidays', 'medical-instruments', 'product-groups', 'product-units', 'products'].sort());
  });
  it('A1.3 getAdapter throws on unknown', () => {
    expect(() => getAdapter('foo')).toThrow();
  });
  it('A1.4 isKnownEntityType reports correctly', () => {
    expect(isKnownEntityType('products')).toBe(true);
    expect(isKnownEntityType('foo')).toBe(false);
  });
});

describe('Phase 17.1 — adapter contract conformance', () => {
  for (const entityType of ['products', 'product-groups', 'product-units', 'medical-instruments', 'holidays', 'courses', 'df-groups']) {
    describe(entityType, () => {
      const adapter = getAdapter(entityType);

      it(`exports all required keys`, () => {
        for (const k of REQUIRED_KEYS) {
          expect(adapter[k]).toBeDefined();
        }
      });

      it(`entityType matches registry key`, () => {
        expect(adapter.entityType).toBe(entityType);
      });

      it(`collection is a be_* string`, () => {
        expect(adapter.collection).toMatch(/^be_/);
      });

      it(`dedupKey returns a stable string`, () => {
        const item = { name: 'TestName', productType: 'ยา', productName: 'Acetin', holidayType: 'specific' };
        const key = adapter.dedupKey(item);
        expect(typeof key).toBe('string');
      });

      it(`dedupKey is deterministic`, () => {
        const item = { name: 'X', productType: 'Y', productName: 'Z', holidayType: 'specific' };
        expect(adapter.dedupKey(item)).toBe(adapter.dedupKey(item));
      });

      it(`fkRefs returns an array`, () => {
        const refs = adapter.fkRefs({ products: [], items: [] });
        expect(Array.isArray(refs)).toBe(true);
      });

      it(`clone strips id field`, () => {
        const idField = adapter.collection === 'be_products' ? 'productId'
          : adapter.collection === 'be_product_groups' ? 'groupId'
          : adapter.collection === 'be_product_unit_groups' ? 'unitGroupId'
          : adapter.collection === 'be_medical_instruments' ? 'instrumentId'
          : adapter.collection === 'be_holidays' ? 'holidayId'
          : adapter.collection === 'be_courses' ? 'courseId'
          : adapter.collection === 'be_df_groups' ? 'dfGroupId'
          : 'id';
        const sourceItem = { [idField]: 'SRC-1', name: 'X', productType: 'ยา', productName: 'X', branchId: 'BR-source' };
        const cloned = adapter.clone(sourceItem, 'BR-target', 'admin-uid');
        expect(cloned[idField]).toBeUndefined();
      });

      it(`clone stamps target branchId`, () => {
        const cloned = adapter.clone({ name: 'X', productType: 'ยา', productName: 'X' }, 'BR-target', 'admin-uid');
        expect(cloned.branchId).toBe('BR-target');
      });

      it(`clone preserves createdAt + createdBy`, () => {
        const cloned = adapter.clone(
          { name: 'X', productType: 'ยา', productName: 'X', createdAt: '2026-01-01T00:00:00Z', createdBy: 'src-admin' },
          'BR-target',
          'tgt-admin'
        );
        expect(cloned.createdAt).toBe('2026-01-01T00:00:00Z');
        expect(cloned.createdBy).toBe('src-admin');
      });

      it(`clone sets new updatedAt + updatedBy`, () => {
        const cloned = adapter.clone({ name: 'X', productType: 'ยา', productName: 'X' }, 'BR-target', 'tgt-admin');
        expect(cloned.updatedAt).toBeDefined();
        expect(cloned.updatedBy).toBe('tgt-admin');
      });

      it(`displayRow returns object with primary`, () => {
        const row = adapter.displayRow({ name: 'X', productName: 'X', productType: 'ยา' });
        expect(row.primary).toBeDefined();
      });

      it(`adversarial: clone handles null inputs`, () => {
        expect(() => adapter.clone({}, 'BR-target', null)).not.toThrow();
      });

      it(`adversarial: dedupKey handles missing fields`, () => {
        expect(() => adapter.dedupKey({})).not.toThrow();
      });
    });
  }
});

describe('Phase 17.1 — entity-specific dedupKey + fkRefs', () => {
  it('A2.products dedupKey is productType:productName', () => {
    expect(getAdapter('products').dedupKey({ productType: 'ยา', productName: 'Acetin' })).toBe('ยา:Acetin');
  });

  it('A2.products fkRefs picks unitId + categoryId when present', () => {
    const refs = getAdapter('products').fkRefs({ unitId: 'U-1', categoryId: 'C-1' });
    expect(refs.length).toBe(2);
    expect(refs.find(r => r.collection === 'be_product_unit_groups').ids).toEqual(['U-1']);
    expect(refs.find(r => r.collection === 'be_product_groups').ids).toEqual(['C-1']);
  });

  it('A2.products fkRefs returns empty when no refs present', () => {
    expect(getAdapter('products').fkRefs({})).toEqual([]);
  });

  it('A2.product-groups dedupKey is productType:name', () => {
    expect(getAdapter('product-groups').dedupKey({ productType: 'ยากลับบ้าน', name: 'G1' })).toBe('ยากลับบ้าน:G1');
  });

  it('A2.product-groups fkRefs collects products[].productId', () => {
    const refs = getAdapter('product-groups').fkRefs({ products: [{ productId: 'P-1' }, { productId: 'P-2' }] });
    expect(refs[0].collection).toBe('be_products');
    expect(refs[0].ids).toEqual(['P-1', 'P-2']);
  });

  it('A2.courses fkRefs collects items[].productId', () => {
    const refs = getAdapter('courses').fkRefs({ items: [{ productId: 'P-1' }] });
    expect(refs[0].collection).toBe('be_products');
    expect(refs[0].ids).toEqual(['P-1']);
  });

  it('A2.standalone adapters return empty fkRefs', () => {
    for (const t of ['product-units', 'medical-instruments', 'holidays', 'df-groups']) {
      expect(getAdapter(t).fkRefs({})).toEqual([]);
    }
  });

  it('A2.holidays dedupKey includes holidayType', () => {
    const a = getAdapter('holidays');
    expect(a.dedupKey({ holidayType: 'specific', name: 'X' })).toBe('specific:X');
    expect(a.dedupKey({ holidayType: 'weekly', name: 'X' })).toBe('weekly:X');
  });
});

describe('Phase 17.1 — V14 anti-regression (no undefined leaves in clone output)', () => {
  for (const entityType of ['products', 'product-groups', 'product-units', 'medical-instruments', 'holidays', 'courses', 'df-groups']) {
    it(`${entityType} clone output has no undefined values`, () => {
      const cloned = getAdapter(entityType).clone(
        { name: 'X', productType: 'ยา', productName: 'X', holidayType: 'specific', items: [], products: [] },
        'BR-target',
        'admin-uid'
      );
      function walk(obj, path = '') {
        if (obj === undefined) {
          throw new Error(`undefined leaf at ${path || '(root)'}`);
        }
        if (obj === null || typeof obj !== 'object') return;
        if (Array.isArray(obj)) {
          obj.forEach((v, i) => walk(v, `${path}[${i}]`));
          return;
        }
        for (const k of Object.keys(obj)) {
          walk(obj[k], `${path}.${k}`);
        }
      }
      expect(() => walk(cloned)).not.toThrow();
    });
  }
});
```

- [ ] **Step 13.2: Run**

Run: `npm test -- --run tests/phase-17-1-cross-branch-import-adapters.test.js`

Expected: ~80-100 tests pass. If any FAIL, surface real adapter shape mismatches — DO NOT relax assertions, fix the adapter source if it's wrong.

---

## Task 14: Test bank — server endpoint (`tests/phase-17-1-cross-branch-import-server.test.js`)

**Files:**
- Create: `tests/phase-17-1-cross-branch-import-server.test.js`

- [ ] **Step 14.1: Write the test file**

```javascript
// ─── Phase 17.1 — server endpoint tests ───────────────────────────────────
// Source-grep contract verification + handler logic via mocked
// firebase-admin.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';

describe('Phase 17.1 — server endpoint shape', () => {
  let content;
  beforeEach(() => {
    content = fs.readFileSync('api/admin/cross-branch-import.js', 'utf8');
  });

  it('S1.1 default-exports an async handler', () => {
    expect(content).toMatch(/export default async function handler/);
  });

  it('S1.2 imports getAdapter + isKnownEntityType from registry', () => {
    expect(content).toMatch(/from\s+['"][^'"]+crossBranchImportAdapters\/index/);
    expect(content).toMatch(/getAdapter|isKnownEntityType/);
  });

  it('S1.3 imports firebase-admin SDK pieces', () => {
    expect(content).toMatch(/firebase-admin\/app/);
    expect(content).toMatch(/firebase-admin\/auth/);
    expect(content).toMatch(/firebase-admin\/firestore/);
  });

  it('S1.4 verifyIdToken on Bearer auth header', () => {
    expect(content).toMatch(/Bearer/);
    expect(content).toMatch(/verifyIdToken/);
  });

  it('S1.5 admin claim check', () => {
    expect(content).toMatch(/decoded\.admin/);
  });

  it('S1.6 SOURCE_EQUALS_TARGET guard', () => {
    expect(content).toMatch(/SOURCE_EQUALS_TARGET/);
    expect(content).toMatch(/sourceBranchId\s*===\s*targetBranchId/);
  });

  it('S1.7 INVALID_ENTITY_TYPE guard', () => {
    expect(content).toMatch(/INVALID_ENTITY_TYPE/);
    expect(content).toMatch(/isKnownEntityType/);
  });

  it('S1.8 EMPTY_ITEM_IDS guard', () => {
    expect(content).toMatch(/EMPTY_ITEM_IDS/);
  });

  it('S1.9 atomic batch.commit() call', () => {
    expect(content).toMatch(/batch\.commit\(\)/);
  });

  it('S1.10 audit doc id includes randomUUID', () => {
    expect(content).toMatch(/randomUUID/);
  });

  it('S1.11 audit doc written via batch.set', () => {
    expect(content).toMatch(/batch\.set\([\s\S]+be_admin_audit/);
  });

  it('S1.12 audit doc has all required fields', () => {
    for (const f of ['action', 'entityType', 'sourceBranchId', 'targetBranchId', 'importedCount', 'skippedDuplicateCount', 'skippedFKCount', 'adminUid', 'ts']) {
      expect(content, f).toMatch(new RegExp(f));
    }
  });

  it('S1.13 maybeTruncate audit list cap', () => {
    expect(content).toMatch(/maybeTruncate/);
    expect(content).toMatch(/500/);
  });

  it('S1.14 returns 200 on success with imported/skippedDup/skippedFK/auditId', () => {
    expect(content).toMatch(/status\(200\)/);
    expect(content).toMatch(/imported[\s\S]+skippedDup[\s\S]+skippedFK[\s\S]+auditId/);
  });

  it('S1.15 returns 401 / 403 / 400 / 500 errors', () => {
    expect(content).toMatch(/status\(401\)/);
    expect(content).toMatch(/status\(403\)/);
    expect(content).toMatch(/status\(400\)/);
    expect(content).toMatch(/status\(500\)/);
  });

  it('S1.16 BATCH_COMMIT_FAILED on caught error', () => {
    expect(content).toMatch(/BATCH_COMMIT_FAILED/);
  });

  it('S1.17 reads source items via where branchId == sourceBranchId', () => {
    expect(content).toMatch(/where\(['"]branchId['"]\s*,\s*['"]==['"],\s*sourceBranchId/);
  });

  it('S1.18 reads target items via where branchId == targetBranchId', () => {
    expect(content).toMatch(/where\(['"]branchId['"]\s*,\s*['"]==['"],\s*targetBranchId/);
  });

  it('S1.19 uses adapter.clone to build target docs', () => {
    expect(content).toMatch(/adapter\.clone/);
  });

  it('S1.20 uses adapter.dedupKey to compute target dedup set', () => {
    expect(content).toMatch(/adapter\.dedupKey/);
  });

  it('S1.21 uses adapter.fkRefs for FK validation', () => {
    expect(content).toMatch(/adapter\.fkRefs/);
  });
});
```

- [ ] **Step 14.2: Run**

Run: `npm test -- --run tests/phase-17-1-cross-branch-import-server.test.js`

Expected: 21 tests pass. If FAIL, fix the server source.

---

## Task 15: Test bank — RTL modal (`tests/phase-17-1-cross-branch-import-rtl.test.jsx`)

**Files:**
- Create: `tests/phase-17-1-cross-branch-import-rtl.test.jsx`

- [ ] **Step 15.1: Write the test file**

```jsx
// ─── Phase 17.1 — modal RTL tests (V21 mitigation) ────────────────────────
// Mount CrossBranchImportModal with mocked adapter + scopedDataLayer +
// branches; simulate source-pick + select + Import + verify endpoint POST.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { act } from 'react';

// Mock scopedDataLayer.
vi.mock('../src/lib/scopedDataLayer.js', () => ({
  listBranches: vi.fn(async () => ([
    { branchId: 'BR-A', name: 'Branch A', status: 'ใช้งาน' },
    { branchId: 'BR-B', name: 'Branch B', status: 'ใช้งาน' },
  ])),
  listProducts: vi.fn(async ({ branchId } = {}) => {
    if (branchId === 'BR-A') return [
      { productId: 'P-1', productName: 'Acetin', productType: 'ยา', branchId: 'BR-A' },
      { productId: 'P-2', productName: 'Aloe', productType: 'สินค้าสิ้นเปลือง', branchId: 'BR-A' },
    ];
    if (branchId === 'BR-B') return [
      { productId: 'P-OLD', productName: 'Acetin', productType: 'ยา', branchId: 'BR-B' },
    ];
    return [];
  }),
  listProductGroups: vi.fn(async () => []),
  listProductUnitGroups: vi.fn(async () => []),
  listMedicalInstruments: vi.fn(async () => []),
  listHolidays: vi.fn(async () => []),
  listCourses: vi.fn(async () => []),
  listDfGroups: vi.fn(async () => []),
}));

const branchState = { branchId: 'BR-B' };
vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: () => ({ branchId: branchState.branchId }),
}));

vi.mock('../src/firebase.js', () => ({
  auth: {
    currentUser: {
      getIdToken: vi.fn(async () => 'fake-id-token'),
    },
  },
}));

// global fetch
const fetchMock = vi.fn();
global.fetch = fetchMock;

import CrossBranchImportModal from '../src/components/backend/CrossBranchImportModal.jsx';
import { getAdapter } from '../src/lib/crossBranchImportAdapters/index.js';

beforeEach(() => {
  fetchMock.mockReset();
  branchState.branchId = 'BR-B';
});

describe('Phase 17.1 RTL — CrossBranchImportModal', () => {
  it('R1.1 renders source-branch dropdown', async () => {
    const adapter = getAdapter('products');
    render(<CrossBranchImportModal adapter={adapter} isDark={true} onClose={() => {}} onImported={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('cross-branch-source-picker')).toBeTruthy());
  });

  it('R1.2 source dropdown excludes the current target branch', async () => {
    const adapter = getAdapter('products');
    render(<CrossBranchImportModal adapter={adapter} isDark={true} onClose={() => {}} onImported={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('cross-branch-source-picker')).toBeTruthy());
    const select = screen.getByTestId('cross-branch-source-picker');
    const options = Array.from(select.querySelectorAll('option'));
    const values = options.map(o => o.value);
    expect(values).not.toContain('BR-B');  // target excluded
    expect(values).toContain('BR-A');       // source available
  });

  it('R1.3 selecting source branch fetches preview rows', async () => {
    const adapter = getAdapter('products');
    render(<CrossBranchImportModal adapter={adapter} isDark={true} onClose={() => {}} onImported={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('cross-branch-source-picker')).toBeTruthy());
    await act(async () => {
      fireEvent.change(screen.getByTestId('cross-branch-source-picker'), { target: { value: 'BR-A' } });
    });
    await waitFor(() => expect(screen.queryByTestId('cross-branch-row-P-1')).toBeTruthy());
  });

  it('R1.4 duplicate row (Acetin in target) renders with status=dup', async () => {
    const adapter = getAdapter('products');
    render(<CrossBranchImportModal adapter={adapter} isDark={true} onClose={() => {}} onImported={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('cross-branch-source-picker')).toBeTruthy());
    await act(async () => {
      fireEvent.change(screen.getByTestId('cross-branch-source-picker'), { target: { value: 'BR-A' } });
    });
    await waitFor(() => expect(screen.queryByTestId('cross-branch-row-P-1')).toBeTruthy());
    const dupRow = screen.getByTestId('cross-branch-row-P-1');
    expect(dupRow.getAttribute('data-status')).toBe('dup');
  });

  it('R1.5 importable row (Aloe not in target) renders with status=ok', async () => {
    const adapter = getAdapter('products');
    render(<CrossBranchImportModal adapter={adapter} isDark={true} onClose={() => {}} onImported={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('cross-branch-source-picker')).toBeTruthy());
    await act(async () => {
      fireEvent.change(screen.getByTestId('cross-branch-source-picker'), { target: { value: 'BR-A' } });
    });
    await waitFor(() => expect(screen.queryByTestId('cross-branch-row-P-2')).toBeTruthy());
    const okRow = screen.getByTestId('cross-branch-row-P-2');
    expect(okRow.getAttribute('data-status')).toBe('ok');
  });

  it('R1.6 select-all toggles importable rows only', async () => {
    const adapter = getAdapter('products');
    render(<CrossBranchImportModal adapter={adapter} isDark={true} onClose={() => {}} onImported={() => {}} />);
    await waitFor(() => expect(screen.getByTestId('cross-branch-source-picker')).toBeTruthy());
    await act(async () => {
      fireEvent.change(screen.getByTestId('cross-branch-source-picker'), { target: { value: 'BR-A' } });
    });
    await waitFor(() => expect(screen.queryByTestId('cross-branch-row-P-2')).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByTestId('cross-branch-select-all'));
    });
    // Aloe (P-2) should be checked; Acetin (P-1) should NOT be (it's a dup)
    expect(screen.getByTestId('cross-branch-row-checkbox-P-2').checked).toBe(true);
    expect(screen.getByTestId('cross-branch-row-checkbox-P-1').checked).toBe(false);
  });

  it('R1.7 Import button POSTs to /api/admin/cross-branch-import', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ imported: [{ sourceId: 'P-2', newId: 'P-NEW' }], skippedDup: [], skippedFK: [], auditId: 'audit-1' }),
    });
    const onImported = vi.fn();
    const adapter = getAdapter('products');
    render(<CrossBranchImportModal adapter={adapter} isDark={true} onClose={() => {}} onImported={onImported} />);
    await waitFor(() => expect(screen.getByTestId('cross-branch-source-picker')).toBeTruthy());
    await act(async () => {
      fireEvent.change(screen.getByTestId('cross-branch-source-picker'), { target: { value: 'BR-A' } });
    });
    await waitFor(() => expect(screen.queryByTestId('cross-branch-row-P-2')).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByTestId('cross-branch-row-checkbox-P-2'));
    });
    await act(async () => {
      fireEvent.click(screen.getByTestId('cross-branch-import-confirm-btn'));
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/admin/cross-branch-import');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer fake-id-token');
    const body = JSON.parse(init.body);
    expect(body.entityType).toBe('products');
    expect(body.sourceBranchId).toBe('BR-A');
    expect(body.targetBranchId).toBe('BR-B');
    expect(body.itemIds).toEqual(['P-2']);
    expect(onImported).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 15.2: Run**

Run: `npm test -- --run tests/phase-17-1-cross-branch-import-rtl.test.jsx`

Expected: 7 tests pass. If a mock is missing, ADD the mock — do NOT relax assertions.

---

## Task 16: Test bank — flow-simulate F1-F8 (`tests/phase-17-1-cross-branch-import-flow-simulate.test.js`)

**Files:**
- Create: `tests/phase-17-1-cross-branch-import-flow-simulate.test.js`

- [ ] **Step 16.1: Write file**

```javascript
// ─── Phase 17.1 — flow-simulate F1-F8 (Rule I) ────────────────────────────
// Source-grep across registry / endpoint / button / modal / 7 tabs.

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import { ENTITY_TYPES, ADAPTERS } from '../src/lib/crossBranchImportAdapters/index.js';

const TARGET_TABS = [
  { tabFile: 'src/components/backend/ProductGroupsTab.jsx', entityType: 'product-groups' },
  { tabFile: 'src/components/backend/ProductUnitsTab.jsx', entityType: 'product-units' },
  { tabFile: 'src/components/backend/MedicalInstrumentsTab.jsx', entityType: 'medical-instruments' },
  { tabFile: 'src/components/backend/HolidaysTab.jsx', entityType: 'holidays' },
  { tabFile: 'src/components/backend/ProductsTab.jsx', entityType: 'products' },
  { tabFile: 'src/components/backend/CoursesTab.jsx', entityType: 'courses' },
  { tabFile: 'src/components/backend/DfGroupsTab.jsx', entityType: 'df-groups' },
];

describe('F1 — adapter registry', () => {
  it('F1.1 ENTITY_TYPES has 7 entries', () => {
    expect(ENTITY_TYPES.length).toBe(7);
  });
  it('F1.2 ADAPTERS keys match ENTITY_TYPES exactly', () => {
    expect(Object.keys(ADAPTERS).sort()).toEqual([...ENTITY_TYPES].sort());
  });
});

describe('F2 — adapter contract conformance', () => {
  for (const t of ['products', 'product-groups', 'product-units', 'medical-instruments', 'holidays', 'courses', 'df-groups']) {
    it(`F2.${t} has all required exports`, () => {
      const a = ADAPTERS[t];
      expect(a.entityType).toBeDefined();
      expect(a.collection).toBeDefined();
      expect(typeof a.dedupKey).toBe('function');
      expect(typeof a.fkRefs).toBe('function');
      expect(typeof a.clone).toBe('function');
      expect(typeof a.displayRow).toBe('function');
    });
  }
});

describe('F3 — server endpoint shape', () => {
  let content;
  beforeEach(() => { content = fs.readFileSync('api/admin/cross-branch-import.js', 'utf8'); });

  it('F3.1 endpoint imports adapter registry', () => {
    expect(content).toMatch(/from\s+['"][^'"]+crossBranchImportAdapters\/index/);
  });
  it('F3.2 endpoint admin-gate runs BEFORE entity-type validation', () => {
    // Either via verifyAdminToken function call OR inline decoded.admin check —
    // both must appear before the isKnownEntityType validation.
    const handlerStart = content.indexOf('async function handler');
    const adminCheckPos = Math.min(
      ...['verifyAdminToken', 'decoded.admin', 'NOT_ADMIN'].map(needle => {
        const pos = content.indexOf(needle, handlerStart);
        return pos === -1 ? Infinity : pos;
      })
    );
    const validationPos = content.indexOf('isKnownEntityType', handlerStart);
    expect(adminCheckPos).toBeLessThan(validationPos);
  });
  it('F3.3 endpoint uses single batch.commit', () => {
    const matches = content.match(/batch\.commit\(\)/g) || [];
    expect(matches.length).toBe(1);
  });
});

describe('F4 — clone preserves audit fields', () => {
  for (const t of ['products', 'product-groups', 'product-units', 'medical-instruments', 'holidays', 'courses', 'df-groups']) {
    it(`F4.${t} preserves createdAt + createdBy`, () => {
      const cloned = ADAPTERS[t].clone(
        { name: 'X', productType: 'ยา', productName: 'X', holidayType: 'specific', createdAt: '2026-01-01', createdBy: 'src' },
        'BR-target',
        'tgt-admin'
      );
      expect(cloned.createdAt).toBe('2026-01-01');
      expect(cloned.createdBy).toBe('src');
    });
  }
});

describe('F5 — dedupKey + fkRefs invocation', () => {
  it('F5.1 endpoint calls adapter.dedupKey for classification', () => {
    const content = fs.readFileSync('api/admin/cross-branch-import.js', 'utf8');
    expect(content).toMatch(/adapter\.dedupKey/);
  });
  it('F5.2 endpoint calls adapter.fkRefs for FK validation', () => {
    const content = fs.readFileSync('api/admin/cross-branch-import.js', 'utf8');
    expect(content).toMatch(/adapter\.fkRefs/);
  });
});

describe('F6 — atomic batch', () => {
  it('F6.1 endpoint uses single batch.commit() (no per-doc commits)', () => {
    const content = fs.readFileSync('api/admin/cross-branch-import.js', 'utf8');
    const commits = content.match(/\.commit\(\)/g) || [];
    expect(commits.length).toBe(1);
  });
});

describe('F7 — audit doc emit', () => {
  it('F7.1 audit doc id starts with cross-branch-import-', () => {
    const content = fs.readFileSync('api/admin/cross-branch-import.js', 'utf8');
    expect(content).toMatch(/cross-branch-import-\$\{ts\}/);
  });
  it('F7.2 audit batch.set targets be_admin_audit', () => {
    const content = fs.readFileSync('api/admin/cross-branch-import.js', 'utf8');
    expect(content).toMatch(/batch\.set\([\s\S]+be_admin_audit/);
  });
});

describe('F8 — V21 anti-regression: source-grep guards', () => {
  it('F8.1 every adapter strips its id field in clone', () => {
    for (const [type, adapter] of Object.entries(ADAPTERS)) {
      const idField = adapter.collection === 'be_products' ? 'productId'
        : adapter.collection === 'be_product_groups' ? 'groupId'
        : adapter.collection === 'be_product_unit_groups' ? 'unitGroupId'
        : adapter.collection === 'be_medical_instruments' ? 'instrumentId'
        : adapter.collection === 'be_holidays' ? 'holidayId'
        : adapter.collection === 'be_courses' ? 'courseId'
        : adapter.collection === 'be_df_groups' ? 'dfGroupId'
        : 'id';
      const cloned = adapter.clone({ [idField]: 'SRC-1', name: 'X', productType: 'ยา', productName: 'X', holidayType: 'specific' }, 'BR-target', 'admin-uid');
      expect(cloned[idField], `${type} did not strip ${idField}`).toBeUndefined();
    }
  });

  it('F8.2 every target tab imports CrossBranchImportButton', () => {
    for (const { tabFile } of TARGET_TABS) {
      const content = fs.readFileSync(tabFile, 'utf8');
      expect(content, tabFile).toMatch(/import\s+CrossBranchImportButton\s+from/);
    }
  });

  it('F8.3 every target tab renders the button with correct entityType', () => {
    for (const { tabFile, entityType } of TARGET_TABS) {
      const content = fs.readFileSync(tabFile, 'utf8');
      expect(content, `${tabFile} missing entityType="${entityType}"`).toMatch(new RegExp(`entityType=["']${entityType}["']`));
    }
  });

  it('F8.4 endpoint never lets sourceBranchId === targetBranchId proceed', () => {
    const content = fs.readFileSync('api/admin/cross-branch-import.js', 'utf8');
    expect(content).toMatch(/sourceBranchId\s*===\s*targetBranchId[\s\S]+SOURCE_EQUALS_TARGET/);
  });

  it('F8.5 modal admin-gate via useTabAccess.isAdmin in button', () => {
    const content = fs.readFileSync('src/components/backend/CrossBranchImportButton.jsx', 'utf8');
    expect(content).toMatch(/useTabAccess/);
    expect(content).toMatch(/isAdmin/);
    expect(content).toMatch(/if\s*\(!isAdmin\)\s*return\s+null/);
  });
});
```

- [ ] **Step 16.2: Run**

Run: `npm test -- --run tests/phase-17-1-cross-branch-import-flow-simulate.test.js`

Expected: ~30-35 tests pass.

---

## Task 17: Verify — full test suite + build

- [ ] **Step 17.1: Run full Vitest suite**

Run: `npm test -- --run 2>&1 | tail -30`

Expected: ~5180+ pass (was 5041). All Phase 17.1 tests included. If anything unrelated fails, report — DO NOT modify outside Phase 17.1 scope without explicit user authorization.

- [ ] **Step 17.2: Run build**

Run: `npm run build 2>&1 | tail -20`

Expected: clean. V11 lock — build catches mock-shadowed export issues that focused tests miss.

---

## Task 18: Verify — preview_eval read-only on dev server

- [ ] **Step 18.1: Start dev server**

Run: `npm run dev` (background)

Wait until `localhost:5173` is reachable.

- [ ] **Step 18.2: Verify modal mount + preview render (READ-ONLY)**

Use Claude_Preview MCP if available, OR open browser manually. Steps:

1. Navigate to `http://localhost:5173/admin` and log in as admin.
2. Open one of the 7 master-data tabs (e.g. Products).
3. Confirm "Copy จากสาขาอื่น" button is visible (admin-only).
4. Click button → modal opens.
5. Pick a source branch from the dropdown.
6. Verify the preview table renders with rows.
7. Verify duplicate rows are greyed out + show "ซ้ำกับ ... ในสาขานี้" tooltip on hover.
8. Verify items with missing FK refs (if any) are red-tinted.

**DO NOT click "Import {N} รายการ"** — that would write real data. READ-ONLY verification only.

9. Close modal via "ยกเลิก".
10. Repeat for 1-2 other tabs to spot-check.

- [ ] **Step 18.3: Stop dev server**

Run: `kill <pid>` or terminate the background process.

---

## Task 19: Commit + push (single bundled commit per Rule K)

- [ ] **Step 19.1: Review git status**

Run: `git status -s | head -30`

Expected files:
- 14 NEW: 8 adapters (registry + 7 entity adapters), 1 server endpoint, 2 shared UI, 4 test files
- 7 MODIFIED: 7 master-data tab files
- ~+2 documentation: spec + plan files
- 1 MODIFIED: `.agents/active.md` (post-ship state update)

Verify no unexpected files staged.

- [ ] **Step 19.2: Stage Phase 17.1 files**

```bash
git add \
  src/lib/crossBranchImportAdapters/index.js \
  src/lib/crossBranchImportAdapters/products.js \
  src/lib/crossBranchImportAdapters/product-groups.js \
  src/lib/crossBranchImportAdapters/product-units.js \
  src/lib/crossBranchImportAdapters/medical-instruments.js \
  src/lib/crossBranchImportAdapters/holidays.js \
  src/lib/crossBranchImportAdapters/courses.js \
  src/lib/crossBranchImportAdapters/df-groups.js \
  api/admin/cross-branch-import.js \
  src/components/backend/CrossBranchImportButton.jsx \
  src/components/backend/CrossBranchImportModal.jsx \
  src/components/backend/ProductGroupsTab.jsx \
  src/components/backend/ProductUnitsTab.jsx \
  src/components/backend/MedicalInstrumentsTab.jsx \
  src/components/backend/HolidaysTab.jsx \
  src/components/backend/ProductsTab.jsx \
  src/components/backend/CoursesTab.jsx \
  src/components/backend/DfGroupsTab.jsx \
  tests/phase-17-1-cross-branch-import-adapters.test.js \
  tests/phase-17-1-cross-branch-import-server.test.js \
  tests/phase-17-1-cross-branch-import-rtl.test.jsx \
  tests/phase-17-1-cross-branch-import-flow-simulate.test.js \
  docs/superpowers/specs/2026-05-05-phase-17-1-cross-branch-master-data-import-design.md \
  docs/superpowers/plans/2026-05-05-phase-17-1-cross-branch-master-data-import.md
```

- [ ] **Step 19.3: Commit with HEREDOC**

```bash
git commit -m "$(cat <<'EOF'
feat(phase-17-1-cross-branch-import): admin-only selective master-data import across branches

User directive (2026-05-05): "ให้ทำการเพิ่มปุ่มที่เห็นเฉพาะ Admin เท่านั้นในทุก Tab
สำหรับการ import ดึง Data ของ Tab นั้นๆมาจากสาขาอื่น โดยไม่ใช่กดแล้ว import ทั้งหมด
แต่ต้องเลือกได้ว่าจะ import อะไรเข้ามาบ้าง". 7 master-data tabs gain a Copy button
that opens a shared modal driven by per-entity adapters; selective import via
checkboxes; FK + dedup checks; atomic server-side batch.

Architecture:
- Shared <CrossBranchImportButton> + <CrossBranchImportModal> (entity-agnostic)
- 7 per-entity adapters in src/lib/crossBranchImportAdapters/ exposing
  {entityType, collection, dedupKey, fkRefs, clone, displayRow}
- Adapter registry + getAdapter() lookup
- Server endpoint /api/admin/cross-branch-import (firebase-admin SDK):
  Bearer-token verify → admin-claim gate → SOURCE_EQUALS_TARGET +
  INVALID_ENTITY_TYPE + EMPTY_ITEM_IDS guards → read source/target/FK collections
  → classify (importable / skipDup / skipFK) → atomic firebase-admin batch
  (writes N entity docs + 1 audit doc) → return imported/skippedDup/skippedFK/auditId

Q1-Q6 brainstorm decisions locked:
- Q1 copy-with-fresh-ID + preserve createdAt/createdBy
- Q2 block on missing FK (no auto-cascade); admin imports in dependency order
- Q3 skip duplicates with greyed-out preview + Thai tooltip
- Q4 per-tab button (admin-only)
- Q5 audit emit to be_admin_audit/cross-branch-import-{ts}-{uuid}
- Q6 admin-only hardcode (useTabAccess.isAdmin + admin claim verify)

Tests +N (5041 → ~5180):
- adapter contract + V14 no-undefined-leaves (~80-100 tests)
- server endpoint shape (~21 tests)
- modal RTL with mocked branches/scopedDataLayer/auth/fetch (~7 tests)
- flow-simulate F1-F8 (Rule I) covering registry / contract / endpoint / clone /
  audit / V21 anti-regression / per-tab button wires (~30 tests)

Verification:
- npm test -- --run → ~5180 pass (was 5041)
- npm run build → clean
- preview_eval READ-ONLY on dev server (no Import-button clicks against prod data)

Spec: docs/superpowers/specs/2026-05-05-phase-17-1-cross-branch-master-data-import-design.md
Plan: docs/superpowers/plans/2026-05-05-phase-17-1-cross-branch-master-data-import.md
Predecessor: Phase 17.0 (5799bd5, V15 #17 LIVE).
Successor: Phase 17.2 — branch equality (no main/default branch); separate brainstorm cycle.

Wiki: wiki/concepts/cross-branch-import-pattern.md anticipates this phase.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 19.4: Push**

```bash
git push origin master
```

Expected: clean push.

- [ ] **Step 19.5: Verify**

```bash
git log --oneline -3 && git status
```

Expected: Phase 17.1 commit at HEAD; tree clean.

- [ ] **Step 19.6: NO deploy unless user explicitly says "deploy" THIS turn**

V18 lock. Phase 17.1 commit waits for explicit user authorization to ship.

---

## Self-review checklist

- [ ] All 7 adapters created + index registry imports all 7
- [ ] Server endpoint uses firebase-admin SDK + Bearer auth + admin-claim gate
- [ ] Server endpoint atomic batch (1 batch.commit())
- [ ] Server endpoint emits audit doc with required fields
- [ ] Audit doc array fields truncated at 500 (V14 doc-size guard)
- [ ] Button component admin-gate via useTabAccess.isAdmin
- [ ] Modal source-picker excludes target branch
- [ ] Modal preview rows tagged data-status=ok/dup/fk for testability
- [ ] All 7 target tabs wired with the button
- [ ] All 4 test files green
- [ ] npm run build clean
- [ ] preview_eval READ-ONLY (no real Import clicks)
- [ ] Single bundled commit
- [ ] No deploy without explicit "deploy"

---

## Risks + V-history mitigations

| Risk | Mitigation |
|---|---|
| V11 mock-shadowed export | npm run build mandatory in Task 17 |
| V12 multi-reader sweep | Adapter shape change → flow-simulate F2 enforces all 7 |
| V14 undefined leaves | Test bank A2 walk-tree assertion in adapter tests |
| V18 deploy auth roll-over | Task 19 stops at push; deploy gated on user "deploy" |
| V21 source-grep lock-in | RTL Task 15 verifies runtime click → POST behavior |
| Audit doc 1MB limit | maybeTruncate at 500 IDs per array (Task 9 server) |
| Concurrent ts collision | crypto.randomUUID() suffix on audit doc ID |
| Cross-tier FK miss | F3 server validation + F2 adapter test for fkRefs shape |
| Source = target self-import | Server SOURCE_EQUALS_TARGET 400 guard (S1.6) |
| Per-tab adapter drift | Flow-simulate F8.2-F8.3 source-grep that all 7 tabs wire correctly |

---

## Spec coverage check

| Spec section | Tasks |
|---|---|
| Architecture (3-layer) | Tasks 8 (registry), 10 (button), 11 (modal) |
| Per-entity adapter contract (7 entities) | Tasks 1-7 |
| Modal UX flow | Task 11 |
| Server endpoint contract | Task 9 |
| firestore.rules unchanged | (no task — covered by existing be_admin_audit narrow rule) |
| Test plan (4 files + flow-simulate) | Tasks 13-16 |
| Verification (npm test + build + preview_eval) | Tasks 17-18 |
| Commit + push (no deploy) | Task 19 |
| Risks + mitigations | All — see risk table above |

All spec sections covered.
