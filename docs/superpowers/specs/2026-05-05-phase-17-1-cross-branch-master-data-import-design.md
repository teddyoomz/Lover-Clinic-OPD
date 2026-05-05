# Phase 17.1 — Cross-Branch Master-Data Import

**Date**: 2026-05-05
**Status**: Design approved (brainstorming complete)
**Predecessor**: Phase 17.0 — BSA Leak Sweep 3 + BS-9 invariant lock (commit `5799bd5`, V15 #17 LIVE)
**Successor**: Phase 17.2 — Branch equality (no main/default branch); separate spec
**Wiki**: [`wiki/concepts/cross-branch-import-pattern.md`](../../wiki/concepts/cross-branch-import-pattern.md)

## Problem statement

User directive verbatim (2026-05-05):
> "tab ต่อไปนี้ product-groups, product-units, medical-instruments, holidays, products, courses, df-groups ให้ทำการเพิ่มปุ่มที่เห็นเฉพาะ Admin เท่านั้นในทุก Tab สำหรับการ import ดึง Data (หรือจะใช้คำว่า Copy ก็ได้) ของ Tab นั้นๆมาจากสาขาอื่น โดยไม่ใช่กดแล้ว import ทั้งหมด แต่ต้องเลือกได้ว่าจะ import อะไรเข้ามาบ้าง ตามแต่ละข้อมูลของหน้านั้นๆ เพื่อความสะดวกเวลาจะขยายสาขา จะได้ Setting ข้อมูลพื้นฐานเหล่านี้ได้ง่ายขึ้น"

Translation: admin-only button on each of 7 master-data tabs to selectively (NOT bulk) import data from another branch. Convenience for branch expansion / setup.

## Approved decisions (locked from brainstorming Q1-Q6)

- **Q1 — Copy semantics**: Copy-with-fresh-ID. Each imported doc gets a new ID, `branchId=target`. Preserve `createdAt` + `createdBy` from source (audit-trail integrity). Stamp `updatedAt=now` + `updatedBy=current admin`. No ID collision risk; idempotent on re-import (would just create another duplicate, but dedup catches that — see Q3).
- **Q2 — FK handling**: Block on missing FK. If a source item references IDs not present in target, refuse import with Thai error "ต้อง import [products] ก่อน: {missing names}". Admin imports in dependency order: product-units → product-groups → products → courses; standalone tabs (medical-instruments / holidays / df-groups) any order.
- **Q3 — Dedup**: Skip duplicates by per-entity name+secondary-discriminator key. Modal preview greys-out duplicate rows with disabled checkbox + Thai tooltip "ซ้ำกับ {name} ในสาขานี้". Admin sees what's filtered before clicking Import.
- **Q4 — Source picker placement**: Per-tab button. Each of 7 tabs gets its own admin-only "Copy from another branch" button next to the existing Create button. Modal opens with a source-branch dropdown.
- **Q5 — Audit trail**: Yes. Every import operation writes one `be_admin_audit/cross-branch-import-{ts}` doc with `{action, sourceBranchId, targetBranchId, entityType, importedIds, skippedDuplicates, skippedMissingFKs, adminUid, adminEmail, ts}`. Mirrors existing `/api/admin/cleanup-*` audit pattern.
- **Q6 — Permission gate**: Hardcode admin-only. `useTabAccess().isAdmin` on UI; admin claim verify on server. No new permission key.

## Architecture

3-layer composition: shared button + shared modal + per-entity adapter. Server-side write for atomicity.

```
src/components/backend/CrossBranchImportButton.jsx       (admin-only icon button)
        |
        v opens
src/components/backend/CrossBranchImportModal.jsx        (source-picker + preview table + confirm)
        |
        | uses per-entity adapter (passed as prop)
        v
src/lib/crossBranchImportAdapters/{entity}.js
{ entityType, dedupKey, fkRefs, clone, displayRow }
        |
        v on confirm
POST /api/admin/cross-branch-import   { entityType, sourceBranchId, targetBranchId, itemIds }
        |
        v firebase-admin SDK
1. verify admin claim
2. assert sourceBranchId !== targetBranchId
3. read source items + target items + FK collections
4. classify: importable / skipDup / skipFK
5. atomic batch:
   - batch.set(targetCol/{newId}, clonedItem) for each importable
   - batch.set(be_admin_audit/cross-branch-import-{ts}, audit)
   - batch.commit()
6. return { imported, skippedDup, skippedFK, auditId }
```

**Why server-side write**: atomicity. Single Firestore batch covers N entity writes + 1 audit write — either all commit or none. Matches existing `/api/admin/cleanup-*` pattern. Client wouldn't get this without complex compensating-write logic.

## Per-entity adapter contract

Each adapter exports:

```js
{
  entityType: 'products',                                    // matches collection key
  collection: 'be_products',                                  // Firestore col name
  dedupKey: (item) => `${item.productType}:${item.productName}`,
  fkRefs: (item) => [                                         // returns referenced IDs
    { collection: 'be_product_unit_groups', ids: [item.unitId] },
    { collection: 'be_product_groups', ids: [item.categoryId] }
  ],
  clone: (item, targetBranchId, adminUid) => ({              // strips id, stamps target
    ...item,
    productId: undefined,                                     // server generates new
    branchId: targetBranchId,
    createdAt: item.createdAt,                                // preserve
    createdBy: item.createdBy,                                // preserve
    updatedAt: new Date().toISOString(),
    updatedBy: adminUid,
  }),
  displayRow: (item, enrichmentMap) => <ProductRow ... />    // per-tab JSX
}
```

### 7 adapters

| Tab | Collection | dedupKey | fkRefs | Notes |
|---|---|---|---|---|
| product-groups | `be_product_groups` | `${productType}:${name}` | products[].productId | needs products imported first |
| product-units | `be_product_unit_groups` | `name` | (none) | standalone |
| medical-instruments | `be_medical_instruments` | `name` | (none) | standalone |
| holidays | `be_holidays` | `${holidayType}:${name}` | (none) | standalone |
| products | `be_products` | `${productType}:${productName}` | unitId, categoryId (optional) | dedup by name+type |
| courses | `be_courses` | `name` | items[].productId | needs products imported first |
| df-groups | `be_df_groups` | `name` | (none branch-scoped) | staffId/doctorId reference universal collections — no branch FK risk |

Dependency-import order:
1. product-units (no deps)
2. product-groups (deps on products — circular hazard; see Risk #4)
3. products (deps on units + groups — optional FKs, can import without)
4. courses (deps on products)
5. medical-instruments / holidays / df-groups (any order, no deps)

## Modal UX flow

```
1. Open: source-branch dropdown (excludes target + suspended branches);
   default = first branch in alphabetical order.
2. On source pick: parallel fetch
   - source items: listX({branchId: source})
   - target items: listX({branchId: target})  — for dedup check
   - FK collections (per adapter.fkRefs) for both branches
   Spinner.
3. Preview table with checkboxes:
   - Row per source item: [☐] {adapter.displayRow(item, enrichmentMap)}
   - Duplicate rows (dedupKey collision in target): greyed-out, checkbox disabled,
     tooltip "ซ้ำกับ {name} ในสาขานี้"
   - Items with missing FKs in target: red-tinted, checkbox disabled,
     tooltip "ต้อง import [products] ก่อน: {missing names}"
   - Header: select-all checkbox (toggles only importable rows)
4. Bottom bar: "Import {N} รายการ" button (disabled when N=0).
5. Click Import → POST /api/admin/cross-branch-import.
   Spinner + "กำลัง import..."
6. Result:
   - ✅ "Import {N} รายการสำเร็จ" + "[ดูรายละเอียด]" link → audit doc viewer
   - ❌ Thai error + retry button
7. On success: parent tab's reload() fires (already wired per Phase 17.0 BS-9 +
   selectedBranchId in deps). New items appear immediately.
```

## Server endpoint contract

`api/admin/cross-branch-import.js` POST:

**Request**:
```json
{
  "entityType": "products",
  "sourceBranchId": "BR-1777095572005-ae97f911",
  "targetBranchId": "BR-1777873556815-26df6480",
  "itemIds": ["PROD-1", "PROD-2", "PROD-3"]
}
```

**Auth**: `Authorization: Bearer <firebase-id-token>`. Endpoint verifies token, asserts `admin: true` claim. Returns 403 if non-admin.

**Validation**:
- `entityType` must be one of the 7 known types
- `sourceBranchId !== targetBranchId` → 400 `SOURCE_EQUALS_TARGET`
- `itemIds` must be a non-empty array
- All `itemIds` must exist in source (entityType collection where branchId=source)

**Processing** (server-side via firebase-admin SDK):
1. Read source items (where branchId=source AND id IN itemIds)
2. Read target items (where branchId=target) — full set for dedup check
3. Read FK target collections (per adapter's fkRefs) — for FK check
4. Classify each requested item:
   - `skipDup`: dedupKey collides with target item → skipped
   - `skipFK`: any fkRef ID missing in target → skipped
   - `importable`: clone with new ID, stamp target branchId, preserve createdAt+createdBy
5. firebase-admin batch:
   - `batch.set(targetCol/{newId}, clonedItem)` for each importable
   - `batch.set(be_admin_audit/cross-branch-import-{ts}-{uuid}, auditDoc)`
   - `batch.commit()` — atomic
6. Return:

**Response (200)**:
```json
{
  "imported": [{ "sourceId": "PROD-1", "newId": "PROD-1777..." }],
  "skippedDup": [{ "sourceId": "PROD-2", "reason": "duplicate", "targetExistingName": "Acetin" }],
  "skippedFK": [{ "sourceId": "PROD-3", "reason": "missing-fk", "missingRefs": [{ "collection": "be_product_unit_groups", "id": "UNIT-X" }] }],
  "auditId": "cross-branch-import-1777953000000-abc123"
}
```

**Errors**:
- 401 `MISSING_AUTH` — no Bearer token
- 403 `NOT_ADMIN` — token valid but no admin claim
- 400 `SOURCE_EQUALS_TARGET` — same branch
- 400 `INVALID_ENTITY_TYPE` — not one of 7 known types
- 400 `EMPTY_ITEM_IDS` — itemIds array empty
- 500 `BATCH_COMMIT_FAILED` — Firestore commit errored (atomic — nothing written)

## Files to create (14)

| File | Type | Estimated LOC |
|------|------|---|
| `src/components/backend/CrossBranchImportButton.jsx` | NEW shared UI | ~50 |
| `src/components/backend/CrossBranchImportModal.jsx` | NEW shared UI | ~250 |
| `src/lib/crossBranchImportAdapters/index.js` | NEW registry | ~30 |
| `src/lib/crossBranchImportAdapters/products.js` | NEW adapter | ~50 |
| `src/lib/crossBranchImportAdapters/product-groups.js` | NEW adapter | ~50 |
| `src/lib/crossBranchImportAdapters/product-units.js` | NEW adapter | ~30 |
| `src/lib/crossBranchImportAdapters/medical-instruments.js` | NEW adapter | ~30 |
| `src/lib/crossBranchImportAdapters/holidays.js` | NEW adapter | ~40 |
| `src/lib/crossBranchImportAdapters/courses.js` | NEW adapter | ~50 |
| `src/lib/crossBranchImportAdapters/df-groups.js` | NEW adapter | ~30 |
| `api/admin/cross-branch-import.js` | NEW server | ~250 |
| `tests/phase-17-1-cross-branch-import-adapters.test.js` | NEW test | ~250 |
| `tests/phase-17-1-cross-branch-import-server.test.js` | NEW test | ~200 |
| `tests/phase-17-1-cross-branch-import-rtl.test.jsx` | NEW test | ~150 |
| `tests/phase-17-1-cross-branch-import-flow-simulate.test.js` | NEW test (Rule I) | ~150 |

(15 actually counting the flow-simulate as separate from the wires test — matrix above shows the canonical 14 deliverables; flow-simulate is required per Rule I and counts in tests bucket.)

## Files to modify (7)

7 master-data tab files — each gains `<CrossBranchImportButton entityType="..." />` near existing Create button:
- `src/components/backend/ProductGroupsTab.jsx`
- `src/components/backend/ProductUnitsTab.jsx`
- `src/components/backend/MedicalInstrumentsTab.jsx`
- `src/components/backend/HolidaysTab.jsx`
- `src/components/backend/ProductsTab.jsx`
- `src/components/backend/CoursesTab.jsx`
- `src/components/backend/DfGroupsTab.jsx`

Each ~5 LOC change (import + 1 JSX line).

Plus: `wiki/concepts/cross-branch-import-pattern.md` updated post-ship to reflect "Status: shipped Phase 17.1" + commit SHA.

## Test plan

Total target: ~150-180 new tests (4997 → ~5180).

### `phase-17-1-cross-branch-import-adapters.test.js` (~50 tests)

For each of 7 adapters:
- Adapter shape (exports entityType, dedupKey, fkRefs, clone, collection)
- dedupKey produces stable string for sample item
- fkRefs returns array (possibly empty for standalone)
- clone strips id, stamps target branchId, preserves createdAt+createdBy, sets new updatedAt+updatedBy
- Adversarial: null item, empty arrays, unicode names, missing fields

### `phase-17-1-cross-branch-import-server.test.js` (~40 tests)

Mock firebase-admin batch + token verify:
- Auth: 401 missing token / 403 non-admin / 200 admin
- Validation: 400 SOURCE_EQUALS_TARGET / 400 INVALID_ENTITY_TYPE / 400 EMPTY_ITEM_IDS
- Classification: importable / skipDup / skipFK
- Batch: writes N items + 1 audit doc atomically
- Audit doc shape: action / sourceBranchId / targetBranchId / entityType / importedIds / skippedDuplicates / skippedMissingFKs / adminUid / adminEmail / ts
- Adversarial: 500-item batch (audit doc cap), concurrent same-ts imports (UUID disambiguation)

### `phase-17-1-cross-branch-import-rtl.test.jsx` (~30 tests, V21 mitigation)

Mount CrossBranchImportModal with mocked adapter + 2 branches:
- Renders source-branch dropdown
- On source pick → fetches source/target/FK data
- Preview table renders rows with correct dedup grey + FK red
- Select-all toggles only importable rows
- Click Import → POST endpoint called with correct payload
- Success state shows count + audit link
- Error state shows Thai error + retry

### `phase-17-1-cross-branch-import-flow-simulate.test.js` (~40 tests, Rule I F1-F8)

- F1 — adapter registry: every entity has an adapter, all 7 entityTypes registered
- F2 — adapter contract conformance: each adapter exposes required exports
- F3 — server endpoint shape: POST handler exists + admin-gate first
- F4 — clone preserves createdAt/createdBy
- F5 — dedupKey + fkRefs invocation in classification path
- F6 — atomic batch (single batch.commit())
- F7 — audit doc emit (presence + shape)
- F8 — V21 anti-regression: source-grep that no adapter overwrites target IDs (always new)

### `phase-17-1-cross-branch-import-button-wires.test.js` (in flow-simulate or separate, ~10 tests)

Source-grep that ALL 7 target tabs:
- Import CrossBranchImportButton
- Render `<CrossBranchImportButton entityType="..." />` somewhere in JSX
- Pass admin-only gate (useTabAccess().isAdmin)

## Risks + V-history mitigations

1. **Audit doc size** (Firestore 1MB limit) — if `importedIds.length > 500`, audit doc stores summary `{count, sampleIds: importedIds.slice(0, 10), truncated: true}` instead of the full ID list. Single audit doc per import (no multi-doc split for v1). Same truncation applies to skippedDuplicates + skippedMissingFKs arrays. Server-side guard. (V14 lesson — beware undefined leaves; audit shape must be Firestore-serializable.)
2. **Concurrent imports** (same `ts` collision) — audit doc ID = `cross-branch-import-{ts}-{uuid}` with `crypto.randomUUID()` server-side. Mitigation tested in F8 server adversarial.
3. **Source = target self-import** — would silently dedup-skip everything. Server-side 400 `SOURCE_EQUALS_TARGET` rejection.
4. **Cross-tier circular FK** (product-groups reference products which reference categoryId → product-groups) — block with FK error; admin imports unit-groups → products → product-groups in order.
5. **V11 mock-shadowed export** — `npm run build` mandatory after writing tests.
6. **V12 multi-reader sweep** — adapter shape change must update all 7 adapters AND the modal. Source-grep guards in F2.
7. **V21 source-grep lock-in** — RTL tests verify runtime behavior (modal mount + preview + endpoint call), not just code shape.
8. **Display row enrichment fetch loop** — if displayRow needs join data, fetch once on modal open, cache in `enrichmentMap` prop. Don't fetch per row.

## Anti-patterns to avoid

- **DO NOT** call `scopedDataLayer.saveX()` from the modal directly — write surface is server-side via admin endpoint, single batch for atomicity.
- **DO NOT** allow client-side write fallback if server endpoint fails — admin should retry through the endpoint.
- **DO NOT** add a per-entity permission key (Q6 locked: admin-only hardcode).
- **DO NOT** auto-cascade-import dependencies (Q2 locked: block + Thai error).
- **DO NOT** allow per-row Skip/Replace (Q3 locked: skip silently with greyed-out preview).

## Out of scope (deferred to future phases)

- Per-row Skip/Replace conflict resolution (Q3 v2 if admin asks)
- Auto-cascade-import dependencies (Q2 v2 if admin asks)
- New permission key for non-admin import staff (Q6 v2)
- Bulk import-all button (user explicitly said selective only)
- Import from CSV / external file (out of user directive scope)
- Cross-environment import (e.g. dev → prod) — out of scope; same-environment branches only

## Success criteria

- [ ] Each of 7 master-data tabs has admin-only "Copy from another branch" button visible
- [ ] Modal preview renders source items with correct dedup grey + FK red
- [ ] Server endpoint enforces admin auth + sourceBranchId !== targetBranchId
- [ ] Atomic batch writes N entity docs + 1 audit doc
- [ ] All 7 adapters pass adapter contract tests
- [ ] RTL test verifies endpoint POST fires on Import click
- [ ] `npm test -- --run` passes (target ~5180 from 5041)
- [ ] `npm run build` clean
- [ ] preview_eval READ-ONLY verify on dev server (modal renders, no real Import click on prod data)
- [ ] Wiki page `cross-branch-import-pattern.md` updated post-ship with commit SHA

## Implementation order (Rule K work-first test-last)

1. Per-entity adapters × 7 (mechanical, parallel-safe)
2. Adapter registry + index
3. Server endpoint (`api/admin/cross-branch-import.js`)
4. CrossBranchImportButton (shared UI)
5. CrossBranchImportModal (shared UI — depends on adapter contract)
6. 7 tab wires (mechanical)
7. Review structure across all files
8. Test bank (5 files) — adapters / server / RTL / flow-simulate / button-wires
9. `npm test -- --run` + `npm run build`
10. preview_eval verify (read-only)
11. Single bundled commit per Rule K
12. Wiki post-ship update + .agents/active.md
