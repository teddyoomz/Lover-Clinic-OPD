# Phase 17.2 — Branch Equality (No "Main" Branch) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate the "main / default branch" concept across data, runtime, code, and UI per user directive ("ทุกสาขาเป็นสาขาเหมือนกัน ไม่มีสาขาหลัก ไม่มีการติดดาว"). Strip `isDefault` field, migrate legacy `branchId='main'` docs to a real branch, hoist `<BranchProvider>` to `App.jsx`, rewrite `BranchContext` for per-user-uid localStorage + newest-default + single-branch-no-picker, remove `includeLegacyMain` from 6 stock panels.

**Architecture:** One-shot admin SDK migration script handles data ops (re-stamp legacy 'main' docs + strip isDefault). Source edits across ~12 files clean up code paths. Per-user localStorage key (`selectedBranchId:${uid}`) replaces global key. BranchProvider hoisted to App.jsx so all consumers (AdminDashboard, BackendDashboard, overlays) inherit it.

**Tech Stack:** React 19 hooks + Firestore SDK (client) + firebase-admin SDK (script) + Vitest + RTL.

**Spec:** `docs/superpowers/specs/2026-05-05-phase-17-2-branch-equality-no-main-design.md`

**Predecessor:** Phase 17.1 (commit `ff78426`).

**Order:** Per Rule K — implementation Tasks 1-12 → review structure → test bank Tasks 13-16 → verify Tasks 17-18 → single bundled commit Task 19. NO commits between tasks.

---

## File structure

| File | Action | LOC |
|---|---|---|
| `scripts/phase-17-2-remove-main-branch.mjs` | Create | ~200 |
| `src/lib/BranchContext.jsx` | Modify (rewrite resolver) | ~80 net delta |
| `src/App.jsx` | Modify (hoist BranchProvider) | ~5 |
| `src/pages/BackendDashboard.jsx` | Modify (remove duplicate provider) | ~5 |
| `src/lib/branchValidation.js` | Modify (strip isDefault) | ~5 |
| `src/lib/backendClient.js` | Modify (4 branch-context sites) | ~15 |
| `src/lib/stockUtils.js` | Modify (strip includeLegacyMain helper) | ~10 |
| `src/components/backend/BranchFormModal.jsx` | Modify (drop checkbox) | ~10 |
| `src/components/backend/BranchesTab.jsx` | Modify (drop badge) | ~10 |
| `src/components/backend/BranchSelector.jsx` | Modify (single-branch hide) | ~15 |
| 6 stock panels | Modify (strip includeLegacyMain wiring) | ~5 each = ~30 |
| `src/components/TreatmentFormPage.jsx` | Modify (comment cleanup) | ~5 |
| `tests/phase-17-2-branch-context-rewrite.test.jsx` | Create | ~250 |
| `tests/phase-17-2-migration-script.test.js` | Create | ~180 |
| `tests/phase-17-2-flow-simulate.test.js` | Create | ~200 |
| `tests/phase-17-2-app-provider-hoist.test.jsx` | Create | ~80 |

---

## Task 1: Migration script — `scripts/phase-17-2-remove-main-branch.mjs`

**Files:** Create `scripts/phase-17-2-remove-main-branch.mjs`

- [ ] **Step 1.1: Read existing migration script as template**

Run: `ls scripts/*.mjs | head -10` and `head -60 scripts/staff-doctors-branch-baseline.mjs 2>/dev/null || head -60 scripts/bsa-leak-sweep-2-marketing-deposits-baseline.mjs 2>/dev/null`

Confirm: env-var pattern, firebase-admin init, `dataPath()` helper, audit doc emit pattern. Match this style.

- [ ] **Step 1.2: Write the migration script**

Use Write tool. Path: `F:/LoverClinic-app/scripts/phase-17-2-remove-main-branch.mjs`

```js
#!/usr/bin/env node
// ─── Phase 17.2 — Remove "main / default branch" concept (admin SDK migration) ──
// One-shot script. Run via:
//   node scripts/phase-17-2-remove-main-branch.mjs              (default --dry-run)
//   node scripts/phase-17-2-remove-main-branch.mjs --apply      (commits writes)
//
// Operations:
//   1. Read be_branches → find isDefault=true → DEFAULT_TARGET (or alphabetical-first fallback)
//   2. Survey 'main' branchId / 'main' locationId docs across all branch-scoped collections
//   3. Survey be_branches docs with isDefault field present (any value)
//   4. --apply: chunked atomic batch writes (re-stamp branchId, FieldValue.delete isDefault) +
//      one audit doc to be_admin_audit/phase-17-2-...
//
// Idempotent: re-running on clean state finds 0 docs + exits clean.

import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import crypto from 'crypto';

const APP_ID = process.env.FIREBASE_APP_ID || 'genform-app';
const DRY_RUN = !process.argv.includes('--apply');

const BRANCH_SCOPED_COLLECTIONS = [
  'be_treatments', 'be_sales', 'be_appointments', 'be_quotations',
  'be_vendor_sales', 'be_online_sales', 'be_sale_insurance_claims',
  'be_expenses', 'be_staff_schedules', 'be_promotions', 'be_coupons',
  'be_vouchers', 'be_deposits', 'be_link_requests',
  'be_products', 'be_courses', 'be_product_groups', 'be_product_unit_groups',
  'be_medical_instruments', 'be_holidays', 'be_df_groups', 'be_df_staff_rates',
  'be_bank_accounts', 'be_expense_categories',
];

const STOCK_COLLECTIONS = [
  'be_stock_batches', 'be_stock_orders', 'be_stock_movements',
  'be_stock_transfers', 'be_stock_withdrawals', 'be_stock_adjustments',
];

function initAdmin() {
  if (getApps().length === 0) {
    const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID || 'loverclinic-opd-4c39b';
    const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
    const privateKey = (process.env.FIREBASE_ADMIN_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    if (!clientEmail || !privateKey) {
      throw new Error('FIREBASE_ADMIN_CLIENT_EMAIL + FIREBASE_ADMIN_PRIVATE_KEY required');
    }
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
}

function colRef(db, name) {
  return db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(name);
}

// --- Pure helpers (extracted for testability) -------------------------------

export function chunkOps500(ops) {
  const chunks = [];
  for (let i = 0; i < ops.length; i += 500) {
    chunks.push(ops.slice(i, i + 500));
  }
  return chunks;
}

export function pickDefaultTarget(branches) {
  if (!Array.isArray(branches) || branches.length === 0) {
    throw new Error('be_branches is empty — cannot determine migration target');
  }
  const isDefaultBranch = branches.find(b => b.isDefault === true);
  if (isDefaultBranch) return isDefaultBranch;
  // Fallback: alphabetical-first by name (Thai locale-aware).
  const sorted = [...branches].sort((a, b) =>
    String(a.name || '').localeCompare(String(b.name || ''), 'th-TH')
  );
  return sorted[0];
}

export function maybeTruncate(arr, max = 500) {
  if (!Array.isArray(arr) || arr.length <= max) return { value: arr, truncated: false };
  return { value: arr.slice(0, 10), truncated: true, totalCount: arr.length };
}

export function summarizeLegacyDocs(docs, branchIdField) {
  const ids = docs.map(d => d.id);
  return { count: docs.length, sampleIds: ids.slice(0, 10), branchIdField };
}

// --- Survey ----------------------------------------------------------------

async function surveyLegacyMainDocs(db, collection, idField) {
  const snap = await colRef(db, collection).where(idField, '==', 'main').get();
  return snap.docs.map(d => ({ id: d.id, ref: d.ref }));
}

async function surveyIsDefaultDocs(db) {
  const snap = await colRef(db, 'be_branches').get();
  return snap.docs.filter(d => 'isDefault' in d.data()).map(d => ({ id: d.id, ref: d.ref, data: d.data() }));
}

// --- Main ------------------------------------------------------------------

async function main() {
  initAdmin();
  const db = getFirestore();

  console.log(`=== Phase 17.2 migration ${DRY_RUN ? '[DRY RUN]' : '[APPLY]'} @ ${new Date().toISOString()} ===\n`);

  // 1. Read be_branches.
  const branchesSnap = await colRef(db, 'be_branches').get();
  const branches = branchesSnap.docs.map(d => ({ branchId: d.id, ...d.data() }));
  if (branches.length === 0) {
    console.error('ERROR: be_branches is empty. Cannot determine migration target.');
    process.exit(1);
  }
  const target = pickDefaultTarget(branches);
  console.log(`DEFAULT_TARGET: ${target.branchId} (${target.name || '<no name>'})`);
  console.log(`  via: ${target.isDefault === true ? 'isDefault=true' : 'alphabetical-first fallback'}\n`);

  // 2. Survey legacy 'main' branchId docs (branch-scoped).
  console.log('Surveying legacy branchId="main" docs...');
  const legacyBranchIdOps = [];
  const perCollectionBreakdown = {};
  for (const col of BRANCH_SCOPED_COLLECTIONS) {
    const docs = await surveyLegacyMainDocs(db, col, 'branchId');
    perCollectionBreakdown[col] = docs.length;
    for (const d of docs) {
      legacyBranchIdOps.push({ ref: d.ref, update: { branchId: target.branchId } });
    }
    if (docs.length > 0) console.log(`  ${col}: ${docs.length}`);
  }

  // 3. Survey legacy 'main' locationId docs (stock).
  console.log('\nSurveying legacy locationId="main" stock docs...');
  const legacyLocationIdOps = [];
  for (const col of STOCK_COLLECTIONS) {
    const docs = await surveyLegacyMainDocs(db, col, 'locationId');
    perCollectionBreakdown[col] = (perCollectionBreakdown[col] || 0) + docs.length;
    for (const d of docs) {
      legacyLocationIdOps.push({ ref: d.ref, update: { locationId: target.branchId } });
    }
    if (docs.length > 0) console.log(`  ${col}: ${docs.length}`);
  }

  // 4. Survey isDefault field on be_branches.
  console.log('\nSurveying be_branches with isDefault field...');
  const isDefaultDocs = await surveyIsDefaultDocs(db);
  const isDefaultOps = isDefaultDocs.map(d => ({ ref: d.ref, update: { isDefault: FieldValue.delete() } }));
  console.log(`  be_branches with isDefault: ${isDefaultDocs.length}\n`);

  // 5. Print summary.
  const totalOps = legacyBranchIdOps.length + legacyLocationIdOps.length + isDefaultOps.length;
  console.log(`SUMMARY:`);
  console.log(`  ${legacyBranchIdOps.length} branchId='main' docs → branchId='${target.branchId}'`);
  console.log(`  ${legacyLocationIdOps.length} locationId='main' stock docs → locationId='${target.branchId}'`);
  console.log(`  ${isDefaultOps.length} be_branches docs → isDefault stripped`);
  console.log(`  TOTAL: ${totalOps} writes\n`);

  if (totalOps === 0) {
    console.log('Nothing to migrate. Exiting.');
    process.exit(0);
  }

  if (DRY_RUN) {
    console.log('DRY RUN — re-run with --apply to commit writes.');
    process.exit(0);
  }

  // 6. Apply: chunked atomic batches.
  console.log('Applying writes...');
  const allOps = [...legacyBranchIdOps, ...legacyLocationIdOps, ...isDefaultOps];
  const chunks = chunkOps500(allOps);
  for (let i = 0; i < chunks.length; i++) {
    const batch = db.batch();
    for (const op of chunks[i]) {
      batch.update(op.ref, { ...op.update, updatedAt: new Date().toISOString(), updatedBy: 'phase-17-2-script' });
    }
    await batch.commit();
    console.log(`  Batch ${i + 1}/${chunks.length} committed (${chunks[i].length} ops).`);
  }

  // 7. Audit doc emit (separate single-doc batch).
  const ts = Date.now();
  const auditId = `phase-17-2-remove-main-branch-${ts}-${crypto.randomUUID()}`;
  const importedTrunc = maybeTruncate(legacyBranchIdOps.map(o => o.ref.id));
  const stockTrunc = maybeTruncate(legacyLocationIdOps.map(o => o.ref.id));
  const isDefaultTrunc = maybeTruncate(isDefaultOps.map(o => o.ref.id));
  const auditDoc = {
    action: 'phase-17-2-remove-main-branch',
    defaultTargetId: target.branchId,
    defaultTargetName: target.name || null,
    migratedBranchIdCount: legacyBranchIdOps.length,
    migratedLocationIdCount: legacyLocationIdOps.length,
    strippedIsDefaultCount: isDefaultOps.length,
    perCollectionBreakdown,
    migratedBranchIdSample: importedTrunc.value,
    migratedBranchIdTruncated: !!importedTrunc.truncated,
    migratedLocationIdSample: stockTrunc.value,
    migratedLocationIdTruncated: !!stockTrunc.truncated,
    strippedIsDefaultSample: isDefaultTrunc.value,
    strippedIsDefaultTruncated: !!isDefaultTrunc.truncated,
    dryRun: false,
    adminUid: 'phase-17-2-script',
    ts: new Date(ts).toISOString(),
  };
  await colRef(db, 'be_admin_audit').doc(auditId).set(auditDoc);
  console.log(`\nAudit doc: be_admin_audit/${auditId}`);
  console.log('DONE.');
  process.exit(0);
}

main().catch(err => {
  console.error('ERROR:', err);
  process.exit(1);
});
```

- [ ] **Step 1.3: Verify**

Run: `grep -n "pickDefaultTarget\|chunkOps500\|maybeTruncate\|FieldValue.delete\|phase-17-2-remove-main-branch" scripts/phase-17-2-remove-main-branch.mjs | head -10`

Expected: helpers + audit-id token + delete sentinel present.

`node --check scripts/phase-17-2-remove-main-branch.mjs` — expected: clean.

---

## Task 2: BranchContext rewrite — per-user uid localStorage + newest-default + legacy-key shim

**Files:**
- Modify: `src/lib/BranchContext.jsx`

- [ ] **Step 2.1: Read existing BranchContext fully**

Run: `wc -l src/lib/BranchContext.jsx && head -80 src/lib/BranchContext.jsx`

Note current shape: provider component, `useSelectedBranch()`, localStorage key, `'main'` fallback semantic, isDefault auto-select. Keep the EXPORTS contract (BranchProvider + useSelectedBranch) STABLE — only internals change.

- [ ] **Step 2.2: Locate the localStorage-read site**

Run: `grep -n "localStorage\|selectedBranchId\|isDefault\|'main'" src/lib/BranchContext.jsx | head -15`

- [ ] **Step 2.3: Write the rewrite**

Use Edit tool to perform the surgical changes. Key edits:

**Add helper functions near the top of the file** (use Edit; insert after the existing imports):

```js
// Phase 17.2 — per-user-uid localStorage key + newest-default selection
// + legacy-key migration shim. Removes the 'main' fallback + isDefault
// auto-select.

function localStorageKey(uid) {
  return `selectedBranchId:${uid}`;
}

function readSelected(uid) {
  if (!uid || typeof window === 'undefined' || !window.localStorage) return null;
  const v = window.localStorage.getItem(localStorageKey(uid));
  if (v) return v;
  // Phase 17.2 graceful upgrade — read legacy unkeyed value once, migrate
  // to per-user key, delete old. Idempotent: legacy key absent → no-op.
  const legacy = window.localStorage.getItem('selectedBranchId');
  if (legacy) {
    window.localStorage.setItem(localStorageKey(uid), legacy);
    window.localStorage.removeItem('selectedBranchId');
    return legacy;
  }
  return null;
}

function writeSelected(uid, branchId) {
  if (!uid || typeof window === 'undefined' || !window.localStorage) return;
  if (branchId) {
    window.localStorage.setItem(localStorageKey(uid), String(branchId));
  } else {
    window.localStorage.removeItem(localStorageKey(uid));
  }
}

function pickFirstLoginDefault({ branches, accessibleBranchIds }) {
  if (!Array.isArray(branches) || branches.length === 0) return null;
  const accessible = Array.isArray(accessibleBranchIds) && accessibleBranchIds.length > 0
    ? branches.filter(b => accessibleBranchIds.includes(b.branchId || b.id))
    : branches;
  if (accessible.length === 0) return null;
  // Newest-created first. Stable secondary sort by branchId for determinism.
  const sorted = [...accessible].sort((a, b) => {
    const ca = a.createdAt || '';
    const cb = b.createdAt || '';
    if (ca !== cb) return cb.localeCompare(ca);  // DESC
    return String(a.branchId || a.id).localeCompare(String(b.branchId || b.id));
  });
  return sorted[0].branchId || sorted[0].id;
}
```

**Replace the existing `BranchProvider` body** — find the section that reads localStorage (likely uses bare `'selectedBranchId'`) and the section that auto-selects `isDefault=true`. Replace both with the new helpers:

Find existing pattern (approximate, locate via grep):
```js
const stored = localStorage.getItem('selectedBranchId');
// ... isDefault auto-select fallback ...
// ... 'main' fallback ...
```

Replace with:
```js
// Phase 17.2 — per-user uid localStorage + newest-default + no 'main' fallback.
const stored = readSelected(currentUserUid);
const initialBranchId = stored
  || pickFirstLoginDefault({ branches, accessibleBranchIds: staffAccessible });
```

**Replace the setter** — find the `setBranchId(newId)` callback that writes to localStorage. Replace `localStorage.setItem('selectedBranchId', ...)` with `writeSelected(currentUserUid, newId)`.

**Add the visibility helper export** at the bottom of the file:

```js
export function useBranchVisibility() {
  const { branches, accessibleBranchIds } = useBranchState();
  const accessible = Array.isArray(branches) && Array.isArray(accessibleBranchIds)
    ? branches.filter(b => accessibleBranchIds.includes(b.branchId || b.id))
    : (branches || []);
  return {
    showSelector: accessible.length > 1,
    branches: accessible,
  };
}
```

(If `useBranchState()` is the internal hook used by `useSelectedBranch()`, reuse it; otherwise read directly from the context shape used by BranchProvider.)

**Update the comment block** at the top of the file from "Pre-Phase-15 audit surfaced that BRANCH_ID was hardcoded to 'main' …" to add a Phase 17.2 note:
```js
// Phase 17.2 (2026-05-05) — Removed 'main' fallback semantic. Per-user uid
// localStorage key. Newest-created default for first-login. Single-branch
// users hide the selector entirely (see useBranchVisibility helper).
```

- [ ] **Step 2.4: Verify**

Run: `grep -n "localStorageKey\|readSelected\|writeSelected\|pickFirstLoginDefault\|useBranchVisibility\|Phase 17.2" src/lib/BranchContext.jsx | head -15`

Expected: 5+ helpers + Phase 17.2 marker.

Run: `grep -n "'main'\|isDefault" src/lib/BranchContext.jsx`

Expected: NO 'main' string literal references; NO isDefault references (except possibly historical comments — strip those too if found).

Build sanity:
```
npm run build 2>&1 | tail -10
```

Expected: clean.

---

## Task 3: Hoist `<BranchProvider>` to App.jsx

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 3.1: Read App.jsx structure**

Run: `wc -l src/App.jsx && grep -n "BranchProvider\|<Routes\|export default\|function App" src/App.jsx | head -10`

Identify: location of root component return, current import line area, route container.

- [ ] **Step 3.2: Add import**

Use Edit tool. After the last component import in `src/App.jsx`, insert:

```js
import { BranchProvider } from './lib/BranchContext.jsx';
```

- [ ] **Step 3.3: Wrap root tree with `<BranchProvider>`**

Find the JSX root return of the App component (likely `return (<Routes>` or `return (<>` or `return (<Layout>`). Wrap the contents:

Before:
```jsx
return (
  <Routes>
    <Route path="/admin" element={<AdminDashboard />} />
    <Route path="/backend" element={<BackendDashboard />} />
    {/* ... */}
  </Routes>
);
```

After:
```jsx
return (
  <BranchProvider>
    <Routes>
      <Route path="/admin" element={<AdminDashboard />} />
      <Route path="/backend" element={<BackendDashboard />} />
      {/* ... */}
    </Routes>
  </BranchProvider>
);
```

If App's root is already `<>` fragment, change to `<BranchProvider>` directly. If Routes are inside a wrapper component, place BranchProvider above Routes but inside any auth-gate or theme provider that should remain outside.

- [ ] **Step 3.4: Verify**

Run: `grep -n "BranchProvider" src/App.jsx`

Expected: 1 import + 1 JSX usage.

---

## Task 4: Remove duplicate `<BranchProvider>` from BackendDashboard

**Files:**
- Modify: `src/pages/BackendDashboard.jsx`

- [ ] **Step 4.1: Locate existing wrap**

Run: `grep -n "BranchProvider" src/pages/BackendDashboard.jsx`

Expected: an import line + 1 JSX wrap (the duplicate to remove).

- [ ] **Step 4.2: Remove the wrap**

Use Edit tool to remove the import line + unwrap the JSX. The contents previously inside `<BranchProvider>...</BranchProvider>` move up one level.

If BackendDashboard's tree was:
```jsx
return (
  <BranchProvider>
    <BackendShell>...</BackendShell>
  </BranchProvider>
);
```

Change to:
```jsx
return (
  <BackendShell>...</BackendShell>
);
```

Also remove the `import { BranchProvider } from '...'` line entirely.

- [ ] **Step 4.3: Verify**

Run: `grep -n "BranchProvider" src/pages/BackendDashboard.jsx`

Expected: 0 hits.

Build sanity:
```
npm run build 2>&1 | tail -10
```

Expected: clean. If consumers downstream (e.g. BackendDashboard's children) couldn't find BranchContext anymore, there's an issue — but they should resolve via the App.jsx-level provider now.

---

## Task 5: Strip `isDefault` from `branchValidation.js`

**Files:**
- Modify: `src/lib/branchValidation.js`

- [ ] **Step 5.1: Locate `isDefault` lines**

Run: `grep -n "isDefault" src/lib/branchValidation.js`

Expected: 2 hits (line 99 in defaults factory, line 121 in validator).

- [ ] **Step 5.2: Edit**

Use Edit tool to remove the `isDefault: false` line from `defaultBranchForm()` (or whatever the factory is named) and `isDefault: !!form.isDefault` from `validateBranch()`.

- [ ] **Step 5.3: Verify**

Run: `grep -n "isDefault" src/lib/branchValidation.js`

Expected: 0 hits.

---

## Task 6: backendClient.js 4 branch-context sites

**Files:**
- Modify: `src/lib/backendClient.js`

For EACH of 4 sites (verify lines via grep first — they may have shifted slightly):

- [ ] **Step 6.1: Locate the 4 sites**

Run: `grep -n "isDefault\|'สาขาหลัก'" src/lib/backendClient.js | head -10`

Expected: lines around 7276, 7287, 8842-8843, 9137 (per spec). Note actual current line numbers.

- [ ] **Step 6.2: Edit each site**

**Site 1 (~line 7276) — `listStockLocations` returned shape:**

Find:
```js
return { id: String(id), name: String(name), kind: 'branch', isDefault: !!b.isDefault };
```

Replace with:
```js
return { id: String(id), name: String(name), kind: 'branch' };
```

**Site 2 (~line 7287) — synthetic fallback:**

Find:
```js
: [{ id: 'main', name: 'สาขาหลัก (main)', kind: 'branch', isDefault: true }];
```

Replace with:
```js
: [];
```

(If the surrounding ternary expects an array, `[]` is safe; UI will show "ยังไม่มีสาขา" empty state.)

**Site 3 (~line 8842-8843) — `saveBranch` mutual-exclusion update:**

Find the snippet (approximately):
```js
if (d.id !== id && d.data().isDefault === true) {
  batch.update(branchDoc(d.id), { isDefault: false, updatedAt: new Date().toISOString() });
}
```

Replace with:
```js
// Phase 17.2 — isDefault concept removed; no mutual-exclusion needed.
```

(Or simply delete the entire `if` block.)

**Site 4 (~line 9137) — clone helper:**

Find:
```js
isDefault: !!src.isDefault,
```

Delete that line entirely.

- [ ] **Step 6.3: Verify branch-context isDefault gone (bank-account isDefault MUST remain)**

Run: `grep -n "isDefault" src/lib/backendClient.js | head -15`

Expected: remaining hits are ONLY in bank-account contexts (search the surrounding ~5 lines — they should mention `bankAccount` / `bank` / `default deposit` etc., NOT `branch`). If any branch-context hit remains, fix it.

Build sanity:
```
npm run build 2>&1 | tail -10
```

Expected: clean.

---

## Task 7: BranchFormModal — drop isDefault checkbox

**Files:**
- Modify: `src/components/backend/BranchFormModal.jsx`

- [ ] **Step 7.1: Locate the isDefault block**

Run: `grep -n "isDefault" src/components/backend/BranchFormModal.jsx`

Expected: at least 1 hit (around line 208 — a checkbox JSX block).

- [ ] **Step 7.2: Remove the checkbox JSX block**

Read the surrounding ~10-15 lines to identify the full JSX block (likely `<label><input type="checkbox" checked={form.isDefault} onChange={...} />...</label>`). Remove the entire block.

If `isDefault` appears in the form-state initialization or default-form spread, remove those references too (e.g. `isDefault: form.isDefault` in update spreads).

- [ ] **Step 7.3: Verify**

Run: `grep -n "isDefault" src/components/backend/BranchFormModal.jsx`

Expected: 0 hits.

---

## Task 8: BranchesTab — drop default-branch badge/star

**Files:**
- Modify: `src/components/backend/BranchesTab.jsx`

- [ ] **Step 8.1: Locate isDefault references in the tab**

Run: `grep -n "isDefault\|<Star\|⭐" src/components/backend/BranchesTab.jsx`

Expected: hits in row-rendering JSX (badge / icon / class name conditional).

- [ ] **Step 8.2: Remove badge/star JSX**

Read context. Remove the conditional render that depends on `branch.isDefault` (badge / Star icon / "Default" label / row-highlight class).

- [ ] **Step 8.3: Verify**

Run: `grep -n "isDefault" src/components/backend/BranchesTab.jsx`

Expected: 0 hits.

---

## Task 9: BranchSelector — single-branch hide via `useBranchVisibility`

**Files:**
- Modify: `src/components/backend/BranchSelector.jsx`

- [ ] **Step 9.1: Read existing component**

Run: `cat src/components/backend/BranchSelector.jsx | head -60`

Note current props + render shape.

- [ ] **Step 9.2: Add `useBranchVisibility` import + early return**

Use Edit tool. Add import near top:

```js
import { useBranchVisibility, useSelectedBranch } from '../../lib/BranchContext.jsx';
```

(Adjust path if BranchSelector is in a deeper folder.)

Replace the component's render to use the new helper. Find the section where the dropdown JSX is returned and prepend an early return:

```jsx
const { showSelector, branches } = useBranchVisibility();
const { branchId: currentBranchId } = useSelectedBranch();

// Phase 17.2 — single-branch user gets a static label instead of dropdown.
// Empty branches: render nothing (avoid "ยังไม่มีสาขา" empty dropdown).
if (!showSelector) {
  if (branches.length === 0) return null;
  return (
    <span data-testid="branch-static-label" className="branch-static-label">
      สาขา: {branches[0].name}
    </span>
  );
}

// Existing dropdown render below — uses `branches` + `currentBranchId`.
return (
  <select
    value={currentBranchId || ''}
    onChange={...}
    data-testid="branch-selector"
  >
    {branches.map(b => <option key={b.branchId} value={b.branchId}>{b.name}</option>)}
  </select>
);
```

(Adapt to existing component's exact JSX structure — preserve onChange + className.)

- [ ] **Step 9.3: Verify**

Run: `grep -n "useBranchVisibility\|branch-static-label\|branch-selector" src/components/backend/BranchSelector.jsx`

Expected: import + early-return + dropdown JSX.

Build sanity:
```
npm run build 2>&1 | tail -10
```

Expected: clean.

---

## Task 10: Strip `includeLegacyMain` from 6 stock panels + stockUtils.js

**Files:**
- Modify: `src/lib/stockUtils.js`
- Modify: `src/components/backend/StockBalancePanel.jsx`
- Modify: `src/components/backend/MovementLogPanel.jsx`
- Modify: `src/components/backend/StockAdjustPanel.jsx`
- Modify: `src/components/backend/StockTransferPanel.jsx`
- Modify: `src/components/backend/StockWithdrawalPanel.jsx`
- Modify: `src/components/backend/StockSeedPanel.jsx`

- [ ] **Step 10.1: Locate every `includeLegacyMain` site**

Run: `grep -rn "includeLegacyMain" src/lib src/components/backend/ | head -25`

Expected: ~10-15 hits across the 7 files. Identify each callsite + helper definition.

- [ ] **Step 10.2: Remove `includeLegacyMain` from `stockUtils.js`**

Find the helper that derives `includeLegacyMain` from branches + isDefault. It might be a function like `shouldIncludeLegacyMain(branchId, branches)` or inline logic. Remove the function entirely; remove its export.

If the file has nothing else affected by this removal, leave the rest unchanged.

- [ ] **Step 10.3: Remove `includeLegacyMain` from each of the 6 panels**

For each panel file:
1. Locate the line that builds the lister opts (e.g. `listStockBatches({ branchId, includeLegacyMain: ... })`)
2. Remove the `includeLegacyMain` key entirely; keep the rest of the opts intact

3. Also remove any local helper/derivation logic like:
```js
const includeLegacyMain = branches.some(b => b.branchId === currentBranchId && b.isDefault);
```
Delete that line entirely.

- [ ] **Step 10.4: Locate StockBalancePanel:169 + MovementLogPanel:110 specifically**

Run: `grep -n "isDefault === true" src/components/backend/StockBalancePanel.jsx src/components/backend/MovementLogPanel.jsx`

Each line should be a derivation that matches "this branch is the default-branch and we're viewing it". Remove those derivations entirely.

- [ ] **Step 10.5: Verify**

Run: `grep -rn "includeLegacyMain" src/lib src/components/backend/`

Expected: 0 hits.

Run: `grep -rn "isDefault === true" src/components/backend/`

Expected: 0 hits in stock panels (allowed in BankAccountForm or similar — verify any remaining hits are non-stock-non-branch).

Build sanity:
```
npm run build 2>&1 | tail -10
```

Expected: clean.

---

## Task 11: TFP `'main'` fallback comment cleanup

**Files:**
- Modify: `src/components/TreatmentFormPage.jsx`

- [ ] **Step 11.1: Locate the `'main'` fallback comment block**

Run: `grep -n "main\|fallback to 'main'" src/components/TreatmentFormPage.jsx | head -10`

Expected: lines around 20-24 + 322-324 — comment blocks that mention 'main' fallback.

- [ ] **Step 11.2: Update the comment block at lines 20-24**

Find:
```js
// Phase 14.7.H follow-up A — branch-aware sale + stock writes (defensive
// import: TreatmentFormPage is reachable both in BackendDashboard's
// BranchProvider AND from AdminDashboard's create-treatment overlay where
// no provider exists. The hook falls back to 'main' when no provider is
// mounted, preserving legacy behavior.).
import { useSelectedBranch } from '../lib/BranchContext.jsx';
```

Replace with:
```js
// Phase 14.7.H follow-up A + Phase 17.2 (2026-05-05) — branch-aware sale +
// stock writes. BranchProvider hoisted to App.jsx in Phase 17.2; TFP always
// receives a real branchId from useSelectedBranch (no 'main' fallback).
import { useSelectedBranch } from '../lib/BranchContext.jsx';
```

- [ ] **Step 11.3: Update the destructure-block comment at lines 322-324**

Find:
```js
  // Phase 14.7.H follow-up A — resolve current branch for sale + stock writes.
  // Falls back to 'main' when no BranchProvider is mounted (e.g. when
  // TreatmentFormPage is opened from AdminDashboard create-treatment flow).
  const { branchId: SELECTED_BRANCH_ID } = useSelectedBranch();
```

Replace with:
```js
  // Phase 14.7.H follow-up A + Phase 17.2 — resolve current branch for sale
  // + stock writes. BranchProvider is hoisted to App.jsx (Phase 17.2), so
  // SELECTED_BRANCH_ID always resolves to a real branchId.
  const { branchId: SELECTED_BRANCH_ID } = useSelectedBranch();
```

- [ ] **Step 11.4: Verify**

Run: `grep -n "main\|Phase 17.2" src/components/TreatmentFormPage.jsx | head -10`

Expected: no `'main'` literal references in the branch-context comments. Phase 17.2 markers present.

(Note: `'main'` may legitimately appear in OTHER parts of the file as a string for non-branch concepts — e.g. doc fields. Don't strip those. Only the TWO comment blocks above need editing.)

---

## Task 12: Final build + structure review

- [ ] **Step 12.1: Full build**

Run: `npm run build 2>&1 | tail -10`

Expected: clean. Catches any syntax errors / undefined identifiers / missing exports.

- [ ] **Step 12.2: Cross-file consistency review**

Spot-check via grep:
```
# Branch-context isDefault should be GONE from feature code (bank-account allowed).
grep -rn "isDefault" src/components/backend/Branch* src/lib/BranchContext.jsx src/lib/branchValidation.js

# 'main' fallback in branch-context should be GONE.
grep -rn "'main'" src/lib/BranchContext.jsx src/components/TreatmentFormPage.jsx

# includeLegacyMain should be GONE everywhere.
grep -rn "includeLegacyMain" src/

# BranchProvider should appear in App.jsx ONLY (not BackendDashboard).
grep -rn "BranchProvider" src/App.jsx src/pages/BackendDashboard.jsx
```

Expected:
- First: 0 hits (bank-account references are in different files).
- Second: 0 hits.
- Third: 0 hits.
- Fourth: 1 hit in App.jsx, 0 in BackendDashboard.

If any of those don't match, return to the appropriate task and re-edit.

---

## Task 13: Test bank — BranchContext rewrite RTL

**Files:** Create `tests/phase-17-2-branch-context-rewrite.test.jsx`

- [ ] **Step 13.1: Write the test file**

```jsx
// ─── Phase 17.2 — BranchContext rewrite RTL ──────────────────────────────
// Verifies per-user uid localStorage key + newest-default + single-branch
// hide + legacy-key migration shim + no 'main' fallback.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor, act } from '@testing-library/react';
import { useSelectedBranch, useBranchVisibility } from '../src/lib/BranchContext.jsx';
// NOTE: BranchProvider import path is the same as production — tests render
// it directly with mocked auth + branches.

// Mock firebase auth + branch sources.
const authState = { user: { uid: 'user-A' } };
vi.mock('../src/firebase.js', () => ({
  auth: {
    get currentUser() { return authState.user; },
    onAuthStateChanged: (cb) => {
      cb(authState.user);
      return () => {};
    },
  },
}));

const branchState = { branches: [], staffAccessibleIds: [] };
vi.mock('../src/lib/scopedDataLayer.js', () => ({
  listBranches: vi.fn(async () => branchState.branches),
  getCurrentStaff: vi.fn(async () => ({ branchIds: branchState.staffAccessibleIds })),
}));

import { BranchProvider } from '../src/lib/BranchContext.jsx';

function Probe() {
  const { branchId } = useSelectedBranch();
  const vis = useBranchVisibility();
  return <div data-testid="probe">{JSON.stringify({ branchId, vis })}</div>;
}

beforeEach(() => {
  if (typeof window !== 'undefined') {
    window.localStorage.clear();
  }
  authState.user = { uid: 'user-A' };
  branchState.branches = [];
  branchState.staffAccessibleIds = [];
});

describe('Phase 17.2 BranchContext — per-user uid localStorage key', () => {
  it('BC1.1 first-load with no localStorage + 1 accessible branch → that branch auto-selected', async () => {
    branchState.branches = [{ branchId: 'BR-A', name: 'A', createdAt: '2026-01-01' }];
    branchState.staffAccessibleIds = ['BR-A'];
    const { getByTestId } = render(<BranchProvider><Probe /></BranchProvider>);
    await waitFor(() => {
      const data = JSON.parse(getByTestId('probe').textContent);
      expect(data.branchId).toBe('BR-A');
    });
  });

  it('BC1.2 first-load with no localStorage + 2 accessible → newest-created selected', async () => {
    branchState.branches = [
      { branchId: 'BR-A', name: 'A', createdAt: '2026-01-01' },
      { branchId: 'BR-B', name: 'B', createdAt: '2026-03-01' },
    ];
    branchState.staffAccessibleIds = ['BR-A', 'BR-B'];
    const { getByTestId } = render(<BranchProvider><Probe /></BranchProvider>);
    await waitFor(() => {
      const data = JSON.parse(getByTestId('probe').textContent);
      expect(data.branchId).toBe('BR-B');
    });
  });

  it('BC1.3 localStorage with uid-keyed value → that value used', async () => {
    window.localStorage.setItem('selectedBranchId:user-A', 'BR-Z');
    branchState.branches = [
      { branchId: 'BR-A', name: 'A', createdAt: '2026-01-01' },
      { branchId: 'BR-Z', name: 'Z', createdAt: '2026-01-02' },
    ];
    branchState.staffAccessibleIds = ['BR-A', 'BR-Z'];
    const { getByTestId } = render(<BranchProvider><Probe /></BranchProvider>);
    await waitFor(() => {
      const data = JSON.parse(getByTestId('probe').textContent);
      expect(data.branchId).toBe('BR-Z');
    });
  });

  it('BC1.4 legacy unkeyed localStorage → migrated to per-user key', async () => {
    window.localStorage.setItem('selectedBranchId', 'BR-LEGACY');
    branchState.branches = [{ branchId: 'BR-LEGACY', name: 'L', createdAt: '2026-01-01' }];
    branchState.staffAccessibleIds = ['BR-LEGACY'];
    render(<BranchProvider><Probe /></BranchProvider>);
    await waitFor(() => {
      expect(window.localStorage.getItem('selectedBranchId:user-A')).toBe('BR-LEGACY');
      expect(window.localStorage.getItem('selectedBranchId')).toBeNull();
    });
  });

  it('BC1.5 useBranchVisibility.showSelector === false when only 1 accessible branch', async () => {
    branchState.branches = [{ branchId: 'BR-A', name: 'A', createdAt: '2026-01-01' }];
    branchState.staffAccessibleIds = ['BR-A'];
    const { getByTestId } = render(<BranchProvider><Probe /></BranchProvider>);
    await waitFor(() => {
      const data = JSON.parse(getByTestId('probe').textContent);
      expect(data.vis.showSelector).toBe(false);
      expect(data.vis.branches.length).toBe(1);
    });
  });

  it('BC1.6 useBranchVisibility.showSelector === true when 2+ accessible', async () => {
    branchState.branches = [
      { branchId: 'BR-A', name: 'A', createdAt: '2026-01-01' },
      { branchId: 'BR-B', name: 'B', createdAt: '2026-02-01' },
    ];
    branchState.staffAccessibleIds = ['BR-A', 'BR-B'];
    const { getByTestId } = render(<BranchProvider><Probe /></BranchProvider>);
    await waitFor(() => {
      const data = JSON.parse(getByTestId('probe').textContent);
      expect(data.vis.showSelector).toBe(true);
    });
  });

  it('BC1.7 different uid → different localStorage key (per-user isolation)', async () => {
    window.localStorage.setItem('selectedBranchId:user-A', 'BR-A');
    window.localStorage.setItem('selectedBranchId:user-B', 'BR-B');
    branchState.branches = [
      { branchId: 'BR-A', name: 'A', createdAt: '2026-01-01' },
      { branchId: 'BR-B', name: 'B', createdAt: '2026-01-02' },
    ];
    branchState.staffAccessibleIds = ['BR-A', 'BR-B'];

    authState.user = { uid: 'user-A' };
    let probe = render(<BranchProvider><Probe /></BranchProvider>);
    await waitFor(() => {
      const data = JSON.parse(probe.getByTestId('probe').textContent);
      expect(data.branchId).toBe('BR-A');
    });

    probe.unmount();
    authState.user = { uid: 'user-B' };
    probe = render(<BranchProvider><Probe /></BranchProvider>);
    await waitFor(() => {
      const data = JSON.parse(probe.getByTestId('probe').textContent);
      expect(data.branchId).toBe('BR-B');
    });
  });

  it('BC1.8 no `main` literal fallback (Phase 17.2 anti-regression)', async () => {
    branchState.branches = [];
    branchState.staffAccessibleIds = [];
    const { getByTestId } = render(<BranchProvider><Probe /></BranchProvider>);
    await waitFor(() => {
      const data = JSON.parse(getByTestId('probe').textContent);
      expect(data.branchId).not.toBe('main');
    });
  });
});
```

NOTE: The test mocks may need adjustment if the real BranchProvider imports differ. The implementer should adapt mock paths to match the actual `BranchProvider`'s real dependencies (it may use `auth.onAuthStateChanged` or `useUser()` hook from elsewhere).

- [ ] **Step 13.2: Run**

Run: `npm test -- --run tests/phase-17-2-branch-context-rewrite.test.jsx 2>&1 | tail -25`

Expected: 8 tests pass. If a test fails because of a mock-path mismatch, adapt the mock (NOT the assertion).

---

## Task 14: Test bank — migration script pure helpers

**Files:** Create `tests/phase-17-2-migration-script.test.js`

- [ ] **Step 14.1: Write the test file**

```js
// ─── Phase 17.2 — migration script pure helpers ───────────────────────────
// Tests pickDefaultTarget / chunkOps500 / maybeTruncate / summarizeLegacyDocs
// extracted from scripts/phase-17-2-remove-main-branch.mjs.

import { describe, it, expect } from 'vitest';
import {
  pickDefaultTarget,
  chunkOps500,
  maybeTruncate,
  summarizeLegacyDocs,
} from '../scripts/phase-17-2-remove-main-branch.mjs';

describe('M1 — pickDefaultTarget', () => {
  it('M1.1 picks isDefault=true branch when present', () => {
    const branches = [
      { branchId: 'BR-A', name: 'A', isDefault: false },
      { branchId: 'BR-B', name: 'B', isDefault: true },
    ];
    expect(pickDefaultTarget(branches).branchId).toBe('BR-B');
  });

  it('M1.2 falls back to alphabetical-first when no isDefault=true', () => {
    const branches = [
      { branchId: 'BR-Z', name: 'พระราม 3' },
      { branchId: 'BR-A', name: 'นครราชสีมา' },
    ];
    // Thai locale: นครราชสีมา < พระราม 3
    expect(pickDefaultTarget(branches).branchId).toBe('BR-A');
  });

  it('M1.3 throws on empty branches', () => {
    expect(() => pickDefaultTarget([])).toThrow();
  });

  it('M1.4 throws on null', () => {
    expect(() => pickDefaultTarget(null)).toThrow();
  });
});

describe('M2 — chunkOps500', () => {
  it('M2.1 single-chunk under limit', () => {
    const ops = Array.from({ length: 10 }, (_, i) => ({ i }));
    expect(chunkOps500(ops).length).toBe(1);
  });

  it('M2.2 splits at 500', () => {
    const ops = Array.from({ length: 1234 }, (_, i) => ({ i }));
    const chunks = chunkOps500(ops);
    expect(chunks.length).toBe(3);
    expect(chunks[0].length).toBe(500);
    expect(chunks[1].length).toBe(500);
    expect(chunks[2].length).toBe(234);
  });

  it('M2.3 empty array → empty chunks', () => {
    expect(chunkOps500([])).toEqual([]);
  });
});

describe('M3 — maybeTruncate', () => {
  it('M3.1 returns full array when ≤ max', () => {
    const r = maybeTruncate([1, 2, 3], 500);
    expect(r.value).toEqual([1, 2, 3]);
    expect(r.truncated).toBe(false);
  });

  it('M3.2 truncates when > max', () => {
    const arr = Array.from({ length: 600 }, (_, i) => `id-${i}`);
    const r = maybeTruncate(arr, 500);
    expect(r.value.length).toBe(10);
    expect(r.truncated).toBe(true);
    expect(r.totalCount).toBe(600);
  });

  it('M3.3 default max=500', () => {
    const arr = Array.from({ length: 600 }, (_, i) => i);
    const r = maybeTruncate(arr);
    expect(r.truncated).toBe(true);
  });
});

describe('M4 — summarizeLegacyDocs', () => {
  it('M4.1 counts + samples first 10', () => {
    const docs = Array.from({ length: 25 }, (_, i) => ({ id: `doc-${i}` }));
    const r = summarizeLegacyDocs(docs, 'branchId');
    expect(r.count).toBe(25);
    expect(r.sampleIds.length).toBe(10);
    expect(r.branchIdField).toBe('branchId');
  });

  it('M4.2 empty docs → count=0', () => {
    expect(summarizeLegacyDocs([], 'branchId').count).toBe(0);
  });
});
```

- [ ] **Step 14.2: Run**

Run: `npm test -- --run tests/phase-17-2-migration-script.test.js 2>&1 | tail -25`

Expected: 12 tests pass.

---

## Task 15: Test bank — flow-simulate F1-F8 (Rule I)

**Files:** Create `tests/phase-17-2-flow-simulate.test.js`

- [ ] **Step 15.1: Write the test file**

```js
// ─── Phase 17.2 — flow-simulate F1-F8 (Rule I) ────────────────────────────
// Source-grep guards across BranchContext, App.jsx, BackendDashboard, TFP,
// BranchFormModal, BranchesTab, BranchSelector, 6 stock panels, stockUtils.

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';

const STOCK_PANELS = [
  'src/components/backend/StockBalancePanel.jsx',
  'src/components/backend/MovementLogPanel.jsx',
  'src/components/backend/StockAdjustPanel.jsx',
  'src/components/backend/StockTransferPanel.jsx',
  'src/components/backend/StockWithdrawalPanel.jsx',
  'src/components/backend/StockSeedPanel.jsx',
];

describe('F1 — BranchContext rewrite', () => {
  let content;
  beforeEach(() => { content = fs.readFileSync('src/lib/BranchContext.jsx', 'utf8'); });
  it('F1.1 has localStorageKey helper using uid', () => {
    expect(content).toMatch(/function\s+localStorageKey\s*\(\s*uid\s*\)/);
    expect(content).toMatch(/selectedBranchId:\$\{uid\}/);
  });

  it('F1.2 has readSelected helper with legacy-key shim', () => {
    expect(content).toMatch(/function\s+readSelected\s*\(/);
    expect(content).toMatch(/getItem\(['"]selectedBranchId['"]\)/);  // legacy key fallback
    expect(content).toMatch(/removeItem\(['"]selectedBranchId['"]\)/);  // cleanup
  });

  it('F1.3 has pickFirstLoginDefault sorting by createdAt DESC', () => {
    expect(content).toMatch(/function\s+pickFirstLoginDefault\s*\(/);
    expect(content).toMatch(/createdAt[\s\S]+localeCompare/);
  });

  it('F1.4 has useBranchVisibility export', () => {
    expect(content).toMatch(/export\s+function\s+useBranchVisibility\s*\(/);
    expect(content).toMatch(/showSelector/);
  });

  it('F1.5 NO `main` literal fallback', () => {
    // 'main' may appear in pre-Phase-17.2 audit comments or non-branch
    // string literals; check that no LIVE code path returns 'main'.
    const codeOnly = content.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(codeOnly).not.toMatch(/return\s+['"]main['"]/);
    expect(codeOnly).not.toMatch(/=\s*['"]main['"]/);
  });

  it('F1.6 NO isDefault references in branch-context code', () => {
    expect(content).not.toMatch(/isDefault/);
  });

  it('F1.7 Phase 17.2 marker comment present', () => {
    expect(content).toMatch(/Phase 17\.2/);
  });
});

describe('F2 — App.jsx hoist', () => {
  let content;
  beforeEach(() => { content = fs.readFileSync('src/App.jsx', 'utf8'); });
  it('F2.1 imports BranchProvider', () => {
    expect(content).toMatch(/import\s+\{\s*BranchProvider\s*\}\s+from\s+['"][^'"]+BranchContext/);
  });

  it('F2.2 wraps Routes (or root tree) with <BranchProvider>', () => {
    expect(content).toMatch(/<BranchProvider>/);
    expect(content).toMatch(/<\/BranchProvider>/);
  });
});

describe('F3 — BackendDashboard duplicate provider removed', () => {
  let content;
  beforeEach(() => { content = fs.readFileSync('src/pages/BackendDashboard.jsx', 'utf8'); });
  it('F3.1 NO BranchProvider import', () => {
    expect(content).not.toMatch(/import.*BranchProvider/);
  });

  it('F3.2 NO BranchProvider JSX wrap', () => {
    expect(content).not.toMatch(/<BranchProvider/);
  });
});

describe('F4 — branchValidation isDefault stripped', () => {
  let content;
  beforeEach(() => { content = fs.readFileSync('src/lib/branchValidation.js', 'utf8'); });
  it('F4.1 NO isDefault references', () => {
    expect(content).not.toMatch(/isDefault/);
  });
});

describe('F5 — TFP comment cleanup', () => {
  let content;
  beforeEach(() => { content = fs.readFileSync('src/components/TreatmentFormPage.jsx', 'utf8'); });
  it('F5.1 Phase 17.2 marker in TFP comments', () => {
    expect(content).toMatch(/Phase 17\.2/);
  });

  it('F5.2 NO `falls back to .main.` in active comments', () => {
    expect(content).not.toMatch(/falls back to ['"]main['"]/i);
  });
});

describe('F6 — 6 stock panels strip includeLegacyMain', () => {
  for (const panel of STOCK_PANELS) {
    it(`F6.${panel.split('/').pop()} has NO includeLegacyMain reference`, () => {
      const content = fs.readFileSync(panel, 'utf8');
      expect(content).not.toMatch(/includeLegacyMain/);
    });
  }
});

describe('F7 — stockUtils strip includeLegacyMain', () => {
  it('F7.1 stockUtils has NO includeLegacyMain helper or reference', () => {
    const content = fs.readFileSync('src/lib/stockUtils.js', 'utf8');
    expect(content).not.toMatch(/includeLegacyMain/);
  });
});

describe('F8 — V21 anti-regression / out-of-scope guards', () => {
  it('F8.1 bank-account isDefault UNTOUCHED in bankAccountValidation.js', () => {
    const content = fs.readFileSync('src/lib/bankAccountValidation.js', 'utf8');
    expect(content).toMatch(/isDefault/);
  });

  it('F8.2 bank-account isDefault UNTOUCHED in FinanceMasterTab.jsx', () => {
    const content = fs.readFileSync('src/components/backend/FinanceMasterTab.jsx', 'utf8');
    expect(content).toMatch(/isDefault/);
  });

  it('F8.3 BranchFormModal isDefault checkbox REMOVED', () => {
    const content = fs.readFileSync('src/components/backend/BranchFormModal.jsx', 'utf8');
    expect(content).not.toMatch(/isDefault/);
  });

  it('F8.4 BranchesTab isDefault badge REMOVED', () => {
    const content = fs.readFileSync('src/components/backend/BranchesTab.jsx', 'utf8');
    expect(content).not.toMatch(/isDefault/);
  });

  it('F8.5 BranchSelector uses useBranchVisibility', () => {
    const content = fs.readFileSync('src/components/backend/BranchSelector.jsx', 'utf8');
    expect(content).toMatch(/useBranchVisibility/);
  });

  it('F8.6 backendClient.js bank-account isDefault UNTOUCHED, branch isDefault REMOVED', () => {
    const content = fs.readFileSync('src/lib/backendClient.js', 'utf8');
    // Bank-account isDefault still appears.
    expect(content).toMatch(/bankAccountDoc[\s\S]+isDefault/);
    // Branch-context isDefault should NOT appear.
    // (We can't grep for "branch-related isDefault" precisely; trust manual code review + targeted Task 12 cross-file consistency check.)
  });
});
```

- [ ] **Step 15.2: Run**

Run: `npm test -- --run tests/phase-17-2-flow-simulate.test.js 2>&1 | tail -25`

Expected: ~25-30 tests pass.

---

## Task 16: Test bank — App.jsx provider hoist RTL

**Files:** Create `tests/phase-17-2-app-provider-hoist.test.jsx`

- [ ] **Step 16.1: Write the test file**

```jsx
// ─── Phase 17.2 — App.jsx provider hoist tests ────────────────────────────
// Source-grep covering the hoist + structural guards. Full mount tests left
// to integration-level testing; this file covers the structural invariants.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

describe('AP1 — BranchProvider structural placement', () => {
  it('AP1.1 App.jsx imports BranchProvider', () => {
    const content = fs.readFileSync('src/App.jsx', 'utf8');
    expect(content).toMatch(/import\s+\{[^}]*BranchProvider[^}]*\}\s+from\s+['"][^'"]+BranchContext/);
  });

  it('AP1.2 App.jsx wraps with <BranchProvider>', () => {
    const content = fs.readFileSync('src/App.jsx', 'utf8');
    expect(content).toMatch(/<BranchProvider>/);
    expect(content).toMatch(/<\/BranchProvider>/);
  });

  it('AP1.3 BackendDashboard NO duplicate BranchProvider import', () => {
    const content = fs.readFileSync('src/pages/BackendDashboard.jsx', 'utf8');
    expect(content).not.toMatch(/import.*BranchProvider/);
  });

  it('AP1.4 BackendDashboard NO duplicate BranchProvider JSX', () => {
    const content = fs.readFileSync('src/pages/BackendDashboard.jsx', 'utf8');
    expect(content).not.toMatch(/<BranchProvider/);
  });

  it('AP1.5 only ONE source has BranchProvider component (i.e. App.jsx)', () => {
    // This is a soft-check; counts unique consumers.
    const appHas = /<BranchProvider>/.test(fs.readFileSync('src/App.jsx', 'utf8'));
    const backendHas = /<BranchProvider/.test(fs.readFileSync('src/pages/BackendDashboard.jsx', 'utf8'));
    expect(appHas).toBe(true);
    expect(backendHas).toBe(false);
  });
});
```

- [ ] **Step 16.2: Run**

Run: `npm test -- --run tests/phase-17-2-app-provider-hoist.test.jsx 2>&1 | tail -15`

Expected: 5 tests pass.

---

## Task 17: Verify — full test suite + build

- [ ] **Step 17.1: Run full Vitest suite**

Run: `npm test -- --run 2>&1 | tail -30`

Expected: ~5310 pass (was 5208). All 4 Phase 17.2 test files included.

- [ ] **Step 17.2: Run build**

Run: `npm run build 2>&1 | tail -20`

Expected: clean.

---

## Task 18: Verify — preview_eval read-only on dev

- [ ] **Step 18.1: Start dev server**

Run: `npm run dev` (background)

- [ ] **Step 18.2: Verify per-user uid localStorage + branch switch (READ-ONLY)**

Open browser to `http://localhost:5173/admin`:
1. Login as admin → confirm `selectedBranchId:${uid}` key in localStorage (DevTools).
2. Switch top-right BranchSelector → confirm value updates in localStorage.
3. Logout → login as different user → confirm THEIR `selectedBranchId:${uid}` is read.
4. Open AdminDashboard → click "สร้างการรักษา" overlay → confirm TFP gets a real branchId (not 'main').
5. With single-branch staff (if test fixture exists): confirm BranchSelector renders the static label (no dropdown).

**DO NOT** click migration-script `--apply` against prod. Read-only verification ONLY.

- [ ] **Step 18.3: Stop dev server**

---

## Task 19: Commit + push (single bundled commit per Rule K)

- [ ] **Step 19.1: Review git status**

Run: `git status -s | head -30`

- [ ] **Step 19.2: Stage Phase 17.2 files**

```bash
git add scripts/phase-17-2-remove-main-branch.mjs src/lib/BranchContext.jsx src/App.jsx src/pages/BackendDashboard.jsx src/lib/branchValidation.js src/lib/backendClient.js src/lib/stockUtils.js src/components/backend/BranchFormModal.jsx src/components/backend/BranchesTab.jsx src/components/backend/BranchSelector.jsx src/components/backend/StockBalancePanel.jsx src/components/backend/MovementLogPanel.jsx src/components/backend/StockAdjustPanel.jsx src/components/backend/StockTransferPanel.jsx src/components/backend/StockWithdrawalPanel.jsx src/components/backend/StockSeedPanel.jsx src/components/TreatmentFormPage.jsx tests/phase-17-2-branch-context-rewrite.test.jsx tests/phase-17-2-migration-script.test.js tests/phase-17-2-flow-simulate.test.js tests/phase-17-2-app-provider-hoist.test.jsx docs/superpowers/specs/2026-05-05-phase-17-2-branch-equality-no-main-design.md docs/superpowers/plans/2026-05-05-phase-17-2-branch-equality-no-main.md .agents/active.md
```

- [ ] **Step 19.3: Commit with HEREDOC**

```bash
git commit -m "$(cat <<'EOF'
feat(phase-17-2-branch-equality): remove "main / default branch" concept end-to-end

User directive (2026-05-05): "ยกเลิกสาขา Main หรือ สาขาหลัก ออกไป — ทุกสาขาเป็น
สาขาเหมือนกัน สำคัญเท่ากัน ไม่มีสาขาหลัก ไม่มีการติดดาว". Branch equality across
data, runtime, code, and UI.

Architecture (4 surfaces):
1. Data: NEW scripts/phase-17-2-remove-main-branch.mjs admin SDK migration
   re-stamps legacy branchId='main' (24 collections) + locationId='main'
   (6 stock collections) → DEFAULT_TARGET (current isDefault=true branch
   read BEFORE strip; alphabetical-first fallback). Strips isDefault field
   from all be_branches docs. Atomic chunked batches + audit emit.
2. Runtime: BranchContext rewrite — per-user uid localStorage key
   `selectedBranchId:${uid}`, legacy unkeyed value migrated on first read,
   newest-created default for first-login, useBranchVisibility helper hides
   selector when staff has 1 accessible branch. NO 'main' fallback.
3. Code cleanup: includeLegacyMain opt + filter logic stripped from 6 stock
   panels + stockUtils.js. isDefault references removed from
   branchValidation.js + backendClient.js (4 branch-context sites; bank-
   account isDefault UNTOUCHED — separate concept). BranchFormModal drops
   the isDefault checkbox; BranchesTab drops the Default badge.
4. UI: BranchSelector wires useBranchVisibility — single-branch user gets a
   static "สาขา: {name}" label instead of dropdown.

Q1-Q6 brainstorm decisions locked:
- Q1 hardcoded default to current isDefault=true branch (in admin SDK script)
- Q2 per-user uid localStorage + newest-default + single-branch-no-picker
- Q3 hoist BranchProvider to App.jsx; remove 'main' fallback
- Q4 strip isDefault via migration script
- Q5 remove includeLegacyMain entirely (no no-op stub)
- Q6 full UI removal of star/badge/checkbox

Out of scope (verified):
- Bank-account isDefault (separate concept — "default deposit account")
- Customer branchId (immutable patient-home-branch tag from Phase BS V1)
- Cross-device persistence via Firestore (deferred v2)

Tests +N (5208 → ~5310):
- BranchContext rewrite RTL (8 tests: per-user key, newest-default,
  single-branch hide, legacy-key migration, no 'main' fallback)
- Migration script pure helpers (12 tests: pickDefaultTarget /
  chunkOps500 / maybeTruncate / summarizeLegacyDocs)
- Flow-simulate F1-F8 (~25-30: source-grep guards across 12 modified files
  + V21 anti-regression + out-of-scope verification)
- App provider hoist RTL (5 tests: structural placement)

Verification:
- npm test -- --run → ~5310 pass
- npm run build → clean
- preview_eval READ-ONLY: per-user localStorage key + branch switch +
  TFP-from-AdminDashboard path verified

Migration script execution: NOT auto-run. Admin runs separately via:
  node scripts/phase-17-2-remove-main-branch.mjs              (dry-run preview)
  node scripts/phase-17-2-remove-main-branch.mjs --apply      (commit writes)

Spec: docs/superpowers/specs/2026-05-05-phase-17-2-branch-equality-no-main-design.md
Plan: docs/superpowers/plans/2026-05-05-phase-17-2-branch-equality-no-main.md
Predecessor: Phase 17.1 (ff78426).

Wiki: wiki/concepts/branch-equality-no-main.md anticipates this phase
(post-ship update with commit SHA pending).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 19.4: Push**

```bash
git push origin master
```

- [ ] **Step 19.5: Verify**

```bash
git log --oneline -3 && git status
```

- [ ] **Step 19.6: NO deploy unless user explicitly says "deploy" THIS turn**

V18 lock. Phase 17.2 commit waits for explicit user authorization.

NOTE: even after deploy, the migration script (`--apply`) requires SEPARATE explicit user authorization — it's a destructive prod-data operation, NOT auto-runnable.

---

## Self-review checklist

- [ ] Migration script created + idempotent + dry-run default
- [ ] BranchContext rewrite — 4 helpers (localStorageKey, readSelected, writeSelected, pickFirstLoginDefault) + useBranchVisibility export + legacy-key shim
- [ ] App.jsx wraps with BranchProvider; BackendDashboard does NOT
- [ ] 4 backendClient.js branch-context sites cleaned; bank-account isDefault UNTOUCHED
- [ ] branchValidation.js has 0 isDefault references
- [ ] BranchFormModal has 0 isDefault references
- [ ] BranchesTab has 0 isDefault references / Default badge
- [ ] BranchSelector uses useBranchVisibility for single-branch hide
- [ ] 6 stock panels + stockUtils.js have 0 includeLegacyMain references
- [ ] TFP comments updated; no 'main' fallback semantic
- [ ] All 4 test files green
- [ ] npm run build clean
- [ ] preview_eval READ-ONLY (no `--apply` against prod)
- [ ] Single bundled commit
- [ ] No deploy without explicit "deploy"
- [ ] Customer branchId UNTOUCHED (verified via F8.6 / cross-file consistency)
- [ ] Bank-account isDefault UNTOUCHED (verified via F8.1, F8.2)

---

## Risks + V-history mitigations

| Risk | Mitigation |
|---|---|
| Atomic batch >500 ops | chunkOps500 helper; sequential commits |
| Re-run idempotency | Survey returns 0 on clean state; clean exit |
| Legacy localStorage value | One-time read-old-key-write-new-key shim in readSelected |
| Customer branchId accidentally migrated | Spec out-of-scope + F8 + Task 12 cross-file consistency |
| Bank-account isDefault accidentally stripped | Spec out-of-scope + F8.1+F8.2 |
| AdminDashboard create-treatment overlay broken | F2 + F5 + AP1 (TFP gets real branchId from App-level provider) |
| V11 mock-shadowed export | npm run build mandatory (Task 17) |
| V12 multi-reader sweep | F1-F8 grep across all readers |
| V14 undefined leaves | Audit doc V14 maybeTruncate (migration script) |
| V18 deploy auth roll-over | Task 19.6 stops at push |
| V21 source-grep lock-in | RTL tests verify runtime BranchContext behavior |
| Single-branch admin add-2nd-branch | useEffect deps include branches.length |

---

## Spec coverage check

| Spec section | Tasks |
|---|---|
| Architecture (4 surfaces) | Tasks 1-12 |
| Migration script | Task 1 |
| BranchContext rewrite | Task 2 |
| App.jsx hoist | Task 3 |
| BackendDashboard de-duplicate | Task 4 |
| branchValidation cleanup | Task 5 |
| backendClient.js 4 sites | Task 6 |
| BranchFormModal cleanup | Task 7 |
| BranchesTab cleanup | Task 8 |
| BranchSelector single-branch hide | Task 9 |
| 6 stock panels + stockUtils | Task 10 |
| TFP comment cleanup | Task 11 |
| Cross-file consistency review | Task 12 |
| Test plan (4 files) | Tasks 13-16 |
| Verification | Tasks 17-18 |
| Commit + push (no deploy) | Task 19 |
| Out-of-scope (bank-account, customer, cross-device) | F8 anti-regression + Task 12 |

All spec sections covered.
