---
name: audit-anti-vibe-code
description: "Audit the three Vibe-Code failure modes: hardcode/duplication (violates Rule of 3), security slop (leaked uids, Math.random tokens, open Storage/Firestore rules, world-readable admin fields), and premature schema (orphan collections, parallel docs that should be denormalized). Plus AV13-AV17 institutional-memory invariants (long-lived auth bugs, silent cleanup, silent-swallow, list-spread-order). Use before every release and whenever a PR adds a new collection, rule, or 20+ LOC of form/modal code."
user-invocable: true
allowed-tools: "Read, Grep, Glob"
---

# Audit Anti-Vibe-Code

Named after the vibe-code warning 2026-04-19: AI writes fast, but speed today
= burden tomorrow if the foundation is rotten. Three failure modes to scan:

## Invariants (AV1–AV26)

### AV1 — No duplicate component >20 LOC across files
**Why**: DateField had 5 local clones until the 2026-04-19 migration. Canonical component means 1 fix propagates everywhere.
**Grep**:
- `function (DatePicker|ThaiDate|Custom[A-Z]|Modal[A-Z])\w*\(` — any locally-defined picker/modal/custom component. Should be in `src/components/**` only.
- Named function inside a page `.jsx` that looks like a reusable primitive → candidate for extraction.
**Check**: if the same function body (or close variant) appears in 2+ files → extract.

### AV2 — No raw `<input type="date">` outside `DateField.jsx`
**Grep**: `type="date"` in `src/` — must match zero except the one inside `DateField.jsx`.
**Fix**: migrate to `<DateField value={...} onChange={...} fieldClassName={oldClass} />`.

### AV3 — No `Math.random()` for security-critical tokens
**Why**: `Math.random` is non-cryptographic. Patient-link / schedule-link / any URL token must use `crypto.getRandomValues`.
**Grep**: `Math\.random\(\)\.toString\(36\)` — audit each site. `shortId` for queue codes is OK; patient/session tokens are NOT.
**Fix**: `Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('')`.

### AV4 — No credentials/tokens hardcoded in `src/` or `api/`
**Grep**: `sk-[A-Za-z0-9]{20,}|pk-[A-Za-z0-9]{20,}|eyJ[A-Za-z0-9_-]{20,}` — AWS/API key patterns.
Also grep for `token: '[A-Za-z0-9]{20,}'` and `password:\s*['"][^'"]+['"]`.
**Allowed**: `firebaseConfig` API key in `src/firebase.js` (Firebase public API key — Firestore rules enforce actual access control).
**Fix**: move to Vercel env vars + proxy through a serverless function.

### AV5 — No admin-only fields leaked into world-readable docs
**Why**: `clinic_schedules/{token}` is world-readable by token. Anything stored there is visible to whoever has the URL. User bug 2026-04-19: `createdBy: user.uid` leaked admin UID.
**Grep**: in `handleGenScheduleLink`, `handleGeneratePatientLink`, any `setDoc`/`updateDoc` whose target collection is readable without auth — scan the saved payload for `createdBy`, `user.uid`, `adminId`, `editedBy`, `internal*`.
**Fix**: strip before save, OR move to a parallel admin-only collection.

### AV6 — No `allow read, write: if true` in `firestore.rules` or `storage.rules`
**Grep**: `if true` in both rules files. Each match must have a paired `request.auth` check or token-based gate in the matching `match` block.
**Fix**: add auth requirement + optional resource field gates.

### AV7 — Every new collection has ≥1 reader + ≥1 writer within the same PR
**Check**: when a PR adds `collection(db, ..., 'new_name')`, verify the SAME PR has a `getDoc(...)`/`getDocs(query(...))` on that name AND a `setDoc`/`addDoc`/`updateDoc`. A collection that only one side touches is incomplete.

### AV8 — No "log" / "history" / "events" collection without genuine need
**Why**: append-only logs are expensive. Most "history" is better as an array field on the parent doc (same-transaction writes, no extra listeners).
**Targets**: any new `be_*_log`, `be_*_history`, `be_*_events` collection. Justify: does the data volume exceed 1 MB per parent? Does it need independent TTL? If neither → nested array on parent.

### AV9 — Canonical shared modules reused, not re-implemented
**Grep**:
- `const\s+\w+\s*=\s*(new Date\(\)\.toISOString|\(\)\s*=>\s*.*\.getFullYear)` — ad-hoc today-string code. Must use `thaiTodayISO()` from `utils.js`.
- `function\s+toThaiDate\s*\(|const toThaiDate =` — must be only one (in `AdminDashboard.jsx`). Grep for duplicates.
- `function\s+fmtMoney\s*\(|const fmtMoney =` — should import from `financeUtils.js`, not redefine per-file.
- `function\s+parseQtyString\s*\(` — same.

### AV10 — Rule of 3 enforced via shared subcomponents for copy-paste UI
**Examples**: modal shell, chip/badge, empty state, filter dropdown, customer card. If the same 15+ line JSX block appears in 3+ components → extract.
**How to check**: run a side-by-side diff of large render branches; look for identical `<div>` trees differing only by props.

### AV11 — Firestore document not over-normalized
**Why**: a JOIN equivalent costs a Firestore read per doc. If a page displays customer name + phone + HN + hn-status from 3 separate docs → denormalize at write-time.
**Check**: any UI that needs `Promise.all([getDoc(a), getDoc(b), getDoc(c)])` for one render should have the critical fields denormalized onto one doc.

### AV12 — No orphan collection (written but never read, or vice versa)
**Grep**: for each collection name in `artifacts/{appId}/public/data/X`, verify at least one `getDoc`/`getDocs`/`onSnapshot` AND at least one `setDoc`/`addDoc`/`updateDoc` touch it.
**Common orphans**: experimental / scaffolded-but-unfinished collections left behind.

### AV13 — No long-lived auth-write-blocked silent failures (V23)
**Why**: V23 — opd_sessions update rule was `if isClinicStaff()` since project init (2026-03-23). Anon patients hit PERMISSION_DENIED → "เกิดข้อผิดพลาดของระบบ" alert in PatientForm + 2 silent fail-and-forget paths in PatientDashboard. Bug LIVE for entire project history because tests only verified RENDER, not WRITE.
**Grep**:
- `signInAnonymously\b` — every site that triggers anon-auth. Trace: what writes does the anon user attempt? Are those writes covered by firestore.rules `if isSignedIn()` / `hasOnly([whitelist])` patterns?
- `firestore.rules` `match /<col>/` blocks where `update|create|delete: if isClinicStaff()` — for each, grep code for any anon-reachable writer to that collection. Mismatch = silent-fail-or-alert bug waiting.
**Fix**: narrow rule to `isClinicStaff() OR (isSignedIn() AND request.resource.data.diff(resource.data).affectedKeys().hasOnly([whitelist]))`. Add to Rule B probe list.

### AV14 — No silent cleanup that masks partial failure (V27)
**Why**: V27 — Probe-Deploy-Probe cleanup script DELETE pc_appointments returned 200 → script reported "cleanup OK" → but opd_sessions probe artifacts (different rule shape) were never targeted. Silent partial cleanup left ~10 zombie test docs in production queue.
**Grep**:
- Cleanup scripts (`scripts/**`, `tests/**helpers**`, `api/admin/cleanup-*.js`) — every cleanup must report COUNT of artifacts removed, not just per-call HTTP status.
- `console.log.*cleanup OK\|cleanup complete` — verify the message follows an explicit count assertion.
**Fix**: every cleanup op returns `{ removed: N, failed: M, ids: [...] }`. Caller assertion: `removed > 0` OR `failed === 0 && total === 0`.

### AV15 — No silent-swallow of destructive operations + missing token revoke on credential change (V31)
**Why**: V31 — StaffTab/DoctorsTab `handleDelete` wrapped `deleteAdminUser` in `try { ... } catch (e) { console.warn('continuing with Firestore delete'); }` then proceeded with the second destructive op (Firestore delete). Any Firebase Auth deletion failure left an orphan user (login still worked, email blocked re-creation). Bug LIVE since Phase 12.1 (~Q1 2026). Sister bug: `handleUpdate` and `setCustomUserClaims`-using actions never called `auth.revokeRefreshTokens(uid)` → old session tokens remained valid for ~1h after admin changed credentials or removed claims.
**Grep**:
- `catch.*\{[^}]*console\.warn[^}]*\}` (multiline) — every silent-swallow `console.warn` followed by no rethrow. Each match: classify the swallowed error space. If errors include "real failure that should abort," flag.
- `continuing with Firestore delete\|continuing\|fallthrough` in console.warn messages — same pattern by intent.
- `auth\.updateUser\b|auth\.setCustomUserClaims\b` in `api/admin/**` — every credential/claim mutation must be paired (after success) with `auth.revokeRefreshTokens(uid)` UNLESS the operation is purely additive/granting (e.g. grantAdmin gives MORE access, no revoke needed).
**Fix**:
- Replace silent-swallow with explicit error classification: `try { ... } catch (e) { const allowedErrors = /user-not-found|already gone/i; if (!allowedErrors.test(e.message)) throw e; console.warn('[op] tolerated already-gone case'); }`.
- After `auth.updateUser({email|password|disabled, ...})`: `await auth.revokeRefreshTokens(uid);` — emails/passwords changed = sessions invalidated within 1h.
- After `auth.setCustomUserClaims(uid, claims)` that REMOVES privilege (revokeAdmin, clearPermission, downgrade group): `await auth.revokeRefreshTokens(uid);`.

### AV16 — Source-grep visual tests must be paired with runtime measurement (V32 family)
**Why**: V32 round-1 + round-2 + round-3 + round-4 (2026-04-26) — Bulk PDF alignment war. Each round had passing source-grep tests (`code.includes("pagebreak: 'avoid-all'")` ✓, `getComputedStyle.paddingTop === '6px'` ✓) while the rendered PDF was visibly broken. Source-grep verifies CODE SHAPE; not USER-VISIBLE OUTCOME. For visual outputs (PDF, canvas, screenshot, layout-critical CSS), source-grep is necessary but NOT sufficient.
**Grep**:
- `getComputedStyle\b|toMatch\(/.*pagebreak\|html2canvas\|html2pdf\|jsPDF` — visual-output tests. Each must be paired with at least one runtime/preview_eval check measuring actual rendered geometry (text-vs-line distance, page count, computed colors).
**Fix**: pair source-grep tests with preview_eval that decodes the actual artifact (PDF page count, text geometry, screenshot pixel diff).

### AV17 — `snap.docs.map` spread order: docId must always win (V38)
**Why**: V38 (2026-05-07) — `listProducts`/`listCourses` did `{id: d.id, ...d.data()}`. Baseline-migrated docs (from `branch-merge-apply.mjs` / `customer-branch-baseline.js`) carried a stray `id` data field (legacy ProClinic numeric IDs). Spread order put `data.id` AFTER `id: d.id` → data field OVERRODE the docId. handleDelete fell back to wrong path → silent no-op delete. Bug surfaced 2026-05-07 on พระราม 3 catalog after octies "fix" addressed visibility, not the delete-id resolution.
**Grep**:
- `snap\.docs\.map\(d =>\s*\(\{\s*id:\s*d\.id,\s*\.\.\.d\.data\(\)\s*\}\)\)` — vulnerable pattern. Migrate to `{ ...d.data(), id: d.id }`.
- `\.docs\.map\(d =>\s*\(\{\s*id:\s*d\.id,\s*\.\.\.d\.data\(\)\s*\}\)\)` — same pattern in any context.
- Same risk applies to `onSnapshot` listeners: `snapshot\.docs\.map\(\(d\) =>\s*\(\{\s*id:\s*d\.id,` etc.
**Sanctioned exception** (annotate inline): `// audit-anti-vibe-code: AV17 safe — data has no id field` — only allowed when the collection's docs are KNOWN to never carry a stray `id` field (e.g. system-controlled writes via `setDoc(...,{merge:false})` from a single canonical writer).
**Fix**:
- Default: `snap.docs.map(d => ({ ...d.data(), id: d.id }))` — docId always wins, even with stray data.id.
- For `getDoc` single-doc read: `{ ...snap.data(), id: snap.id }` — same order.
- Pair with handleDelete contract: `const id = obj.<entityId> || obj.id` — works correctly when `obj.id` reliably equals docId.
**Source-grep regression test pattern** (V38 lock):
```js
expect(src).toMatch(/snap\.docs\.map\(d =>\s*\(\{\s*\.\.\.d\.data\(\),\s*id:\s*d\.id\s*\}\)\)/);
expect(srcBlock).not.toMatch(/snap\.docs\.map\(d =>\s*\(\{\s*id:\s*d\.id,\s*\.\.\.d\.data\(\)\s*\}\)\)/);
```
**Mass-sweep status (2026-05-07, V38-followup)**: ✅ **COMPLETE**. Mass-swept 85+ callsites across 15 files (`backendClient.js`, `reportsLoaders.js`, 6 admin endpoints, 5 components, 2 pages). Full suite 6757/6757 PASS post-sweep — zero consumer regressions. Pattern is now universally `{ ...d.data(), id: d.id }` across the codebase. AV17 going forward catches NEW callsites that drift from the safer pattern.

### AV18 — Migrate-fn signature must accept `{branchId}` opt for branch-scoped collections (V39)
**Why**: V39 (2026-05-07) — `migrateMasterPromotionsToBe` / `migrateMasterCouponsToBe` / `migrateMasterVouchersToBe` / `migrateMasterDfStaffRatesToBe` were ZERO-ARITY (line 8133/8202/8279/9549 in `backendClient.js`). `MasterDataTab.handleMigrate` forwarded `{branchId: selectedBranchId || ''}` to ALL targets — but zero-arity wrappers silently dropped it at the JS function-call boundary. Result: imported docs landed with no branchId → invisible in any branch view → user reported 303 product + 174 course + 2 promotion zombies. Octies (e36811f) had patched 7 catalog migrate fns but missed these 4 older Phase 9 paths. Pattern = V12 multi-writer-sweep applied to migrate-fn family.
**Grep**:
- `^export async function migrateMaster\w+ToBe\(\s*\)` — zero-arity migrate wrapper. For each match: classify the destination collection per BSA + COLLECTION_MATRIX (`tests/branch-collection-coverage.test.js`). If branch-scoped → BUG (must accept `{branchId}`). If universal → OK.
- `^export async function migrateMaster\w+ToBe\(\s*\{[^}]*\}` — opt-accepting migrate wrapper. Verify branchId is forwarded to underlying mapper / runMasterToBeMigration.
- `^function mapMasterTo\w+\(src, id, now, existingCreatedAt\)` — 4-arg mapper signature. For branch-scoped collections, MUST be 5-arg `(src, id, now, existingCreatedAt, branchId = '')` and stamp `branchId: branchId || src.branchId || ''` on output.
**Sanctioned exception**: universal collections (be_staff, be_doctors, be_branches, be_permission_groups, be_wallet_types, be_membership_types, be_medicine_labels) — wrapper SHOULD be zero-arity, mapper SHOULD NOT accept branchId. The COLLECTION_MATRIX in `tests/branch-collection-coverage.test.js` is source-of-truth for classification.
**Source-grep regression test pattern** (V39 lock — see `tests/phase-24-0-vicies-novies-decies-migrate-button-coverage.test.js`):
```js
// For each branch-scoped migrate fn:
const re = /export async function migrateMasterXxxToBe\(\s*\{\s*branchId\s*=\s*['"]['"]\s*\}\s*=\s*\{\s*\}\s*\)/;
expect(src).toMatch(re);
// For each universal migrate fn:
expect(src).toMatch(/export async function migrateMasterUniversalToBe\(\s*\)/);
expect(src).not.toMatch(/migrateMasterUniversalToBe\(\s*\{[^}]*branchId/);
```
**Companion AV: AV17** (list spread-order) — same V12 multi-reader-sweep pattern but at READ side. Both MUST hold for branch-scoped collections.

### AV19 — Destructive ops require auto-backup-ref pre-condition (V40)

**Why**: V40 (2026-05-07) — `/api/admin/branch-make-fresh` wipes all branch-scoped collections + per-customer subcollection docs filtered by branchId. Without a pre-call backup, an admin misclick = irreversible production data loss. The fix: server REQUIRES `autoBackupRef` field in request body + verifies the Storage object exists via `bucket.file(autoBackupRef).exists()` BEFORE executing any delete. Pattern generalizes to other destructive bulk ops.

**Grep**:
- `api/admin/.*delete\|cleanup\|wipe\|fresh` — every destructive endpoint. Each must:
  - Accept an `autoBackupRef` (or equivalent prior-state-snapshot) field
  - Verify the snapshot exists in Storage/Firestore BEFORE executing
  - Refuse with 400 on missing

**Sanctioned exception**: cleanup endpoints that delete ONLY test-prefixed docs (per V33.10/11/12) don't need the gate (TEST docs are by definition disposable).

**Source-grep regression**:
```js
expect(code).toMatch(/AUTO_BACKUP_REQUIRED|BACKUP_REF_MISSING/);
expect(code).toMatch(/bucket\.file\(autoBackupRef\)\.exists/);
```

### AV20 — Lookup-map consumers must opt-in `{ includeHidden: true }` (V41)

**Why**: V41 (2026-05-08) — `listStaff()` / `listDoctors()` in `src/lib/backendClient.js` default-filter `!isHidden` so every picker auto-secures (V12 multi-reader-sweep safe pattern). Past records reference staff/doctors by id; if a component's lookup map is built from a default-filtered lister, hidden persons' names render as blank in past records' display labels — silent regression.

**Grep**:
- `listStaff\(\{[^}]*\}\)` — every opt-in callsite. Must be one of: `StaffTab.jsx`, `DoctorsTab.jsx`, `CustomerDetailView.jsx`, `TreatmentFormPage.jsx`, `AdminDashboard.jsx`, `AppointmentCalendarView.jsx`. New callsites need an inline V41/AV20 comment justifying opt-in.
- `listDoctors\(\{[^}]*\}\)` — same.

**Sanctioned exception**: per-flow opt-in is allowed when (1) the component is a known lookup-map consumer (above list), or (2) the component derives a `visibleX` array client-side via `.filter(d => !d.isHidden)` for picker rendering — proving it understands the split pattern.

**Source-grep regression**: `tests/staff-doctor-hide-consumer-sweep.test.js` (CS1 + CS2) locks the consumer-side classification. CS1.* asserts opt-in present in lookup-map consumers; CS2.* asserts opt-in ABSENT in picker-only consumers.

**Anti-pattern (caught by AV20)**:
```js
// ❌ Picker-only file uses opt-in unnecessarily
// (would leak hidden persons into picker dropdown)
const doctors = await listDoctors({ includeHidden: true });

// ✅ Picker-only file uses default
const doctors = await listDoctors();

// ✅ Lookup-map context uses opt-in (with comment)
// V41 — need full map for past-record name display (AV20)
const allDoctors = await listDoctors({ includeHidden: true });
```

### AV27 — UI pickers reading legacy shape MUST use *ForPicker variants (V49)

**Why**: V49 (2026-05-08) — Phase 14.10-tris (2026-04-26) switched 8 UI pickers from `master_data/*` (legacy `{name, price, category, products, unit}` shape) to `be_courses` / `be_products` / `be_promotions` (canonical `{courseName, salePrice, courseCategory, courseProducts, productName, mainUnitName, categoryName, promotion_name, sale_price, category_name}` shape) WITHOUT updating field-name reads. Result: every dropdown rendered EMPTY rows with `+` icon and `0 ฿` because `c.name` / `c.price` / `c.category` / `c.products` / `p.unit` were ALL `undefined` on canonical docs (verified via `scripts/v49-diag-be-courses-products-shape.mjs` against prod). User-reported on PromotionFormModal "ค้นหาคอร์ส" + "ค้นหาสินค้า" search dropdown 2026-05-08.

**8 victim sites confirmed**:
- `PromotionFormModal.jsx` (course + product picker, multi-field misread)
- `DfGroupFormModal.jsx` (course picker — name + category)
- `QuotationFormModal.jsx` (course + product + promotion picker — name + category)
- `ExchangeCourseModal.jsx` (course picker — products[] silently empty → exchange payload qty=1 unit='')
- `CustomerDetailView.jsx` (ProductExchangeModal sub-modal — name + unit + price)
- `MovementLogPanel.jsx` (product dropdown — name)
- `StockSeedPanel.jsx` (product picker + form — name + unit + price multi-line)
- `VendorSalesTab.jsx` (product dropdown — name)

**The rule**: For UI consumers that fetch from `be_courses` / `be_products` / `be_promotions` and read LEGACY shape `{name, price, category, products[], unit}`, the import MUST be the `*ForPicker` variant from `scopedDataLayer.js`:
- `listCoursesForPicker` (auto-applies `beCourseToMasterShape` + optional `productLookup` for unit enrichment)
- `listProductsForPicker` (auto-applies `beProductToMasterShape`)
- `listPromotionsForPicker` (auto-applies `bePromotionToMasterShape` — V49 extended with `price` + `category` fields)

Direct `listCourses` / `listProducts` / `listPromotions` callsites must read CANONICAL fields (`courseName` / `salePrice` / `courseCategory` / `courseProducts` / `productName` / `mainUnitName` / `categoryName` / `promotion_name` / `sale_price` / `category_name`).

**Decision rule**:
- LEGACY shape readers → `*ForPicker` (forms, modals, dropdowns, search pickers)
- CANONICAL shape readers → `list*` (admin tabs, reports, internal aggregators, cross-branch import)

**Grep**:
- `c\.(name|price|category|products|unit)` after `await\s+listCourses\(` in any `src/components/**` file → V49 anti-pattern; switch to `listCoursesForPicker`.
- `p\.(name|price|category|unit)` after `await\s+listProducts\(` in any `src/components/**` file → V49 anti-pattern; switch to `listProductsForPicker`. Defensive `p.productName || p.name` is OK (sanctioned via inline comment).
- `m\.(name|price|category)` after `await\s+listPromotions\(` → V49 anti-pattern; switch to `listPromotionsForPicker`.
- For each UI file importing from `scopedDataLayer.js`, classify as `ForPicker user` / `Canonical user` / `Sanctioned defensive` / `Internal lib`.

**Source-grep regression test pattern** (V49 lock — see `tests/v49-canonical-shape-multi-reader-sweep.test.js` CAT1 + CAT8):
```js
const VICTIM_FILES = [
  'src/components/backend/PromotionFormModal.jsx',
  'src/components/backend/DfGroupFormModal.jsx',
  'src/components/backend/QuotationFormModal.jsx',
  'src/components/backend/ExchangeCourseModal.jsx',
  'src/components/backend/CustomerDetailView.jsx',
  'src/components/backend/MovementLogPanel.jsx',
  'src/components/backend/StockSeedPanel.jsx',
  'src/components/backend/VendorSalesTab.jsx',
];
for (const f of VICTIM_FILES) {
  const src = readFileSync(f, 'utf8');
  // Must use ForPicker variant
  expect(src).toMatch(/list(Courses|Products|Promotions)ForPicker/);
  // Must NOT import legacy list*() from scopedDataLayer
  expect(src).not.toMatch(/import[^}]*\{[^}]*\b(listCourses|listProducts|listPromotions)\b(?![A-Za-z])[^}]*\}\s*from\s*['"][^'"]*scopedDataLayer/);
}
```

**Sanctioned exception**: defensive readers that handle BOTH canonical AND legacy via `||` fallback (e.g. `p.productName || p.name`, `composeProductDisplayName(p)` shared helper) are SAFE because they auto-adapt. Annotate inline if needed: `// audit-anti-vibe-code: AV27 safe — defensive on both canonical + legacy field names`.

**Companion AV: AV22** (canonical mapper adoption at buy-fetcher) + **AV24** (productName live-resolve at write) + **AV25** (display-layer grouping). Together with AV27 they lock the entire canonical→legacy shape-mismatch class:
- AV22 (V44): canonical mapper at buy fetcher (mapper-write boundary)
- AV24 (V46): productName live-resolve at stock-movement write (post-write boundary)
- AV25 (V47): display-layer grouping for course cards (post-storage rendering boundary)
- AV27 (V49): canonical→legacy shape adapter at picker fetch (pre-render boundary)

**Architectural pattern**: V49 introduces the `*ForPicker` naming convention for shape-aware variants. Future schema changes can extend the adapter without touching every consumer. Single source of truth: `beXToMasterShape(canonicalDoc) → legacyDoc`. AV27 grep ensures the boundary is honored.

**Migration on encountering NEW canonical→legacy shape mismatch**: (1) verify field names via diag script (`scripts/v49-diag-*.mjs`); (2) export adapter from `backendClient.js` if private; (3) add `*ForPicker` variant in `scopedDataLayer.js`; (4) migrate consumer; (5) lock with source-grep regression test.

### AV26 — Rule O extends UNIVERSALLY: every stock-write productName must live-resolve (V48)

**Why**: V48 (2026-05-08) — V46 audit only fixed 3 productName-write sites in `_deductOneItem`. Phase 1 source-grep sweep found **15+ OTHER stock-write sites** still using `productName: <doc>.productName` patterns (V46-class poisoning vulnerable): `_repayNegativeBalances`, `cancelStockOrder` CANCEL_IMPORT, `createStockAdjustment` movement+adjustment doc, `createStockTransfer` resolvedItems (POISON GATE — propagates downstream to dest batch + RECEIVE), `updateStockTransferStatus` EXPORT_TRANSFER, `createStockWithdrawal` resolvedItems POISON GATE, `updateStockWithdrawalStatus` EXPORT_WITHDRAWAL, central-stock-order CANCEL_IMPORT. ALL fixed in V48 with consistent live-resolve + fallback chain pattern.

**The rule** (extends AV24): for ANY Firestore write of stock_movement / stock_batch / stock_adjustment that emits `productName` field, MUST live-resolve from `be_products[productId]` BEFORE the tx body. Helper: `_resolveProductNameLive(productId)`. Pattern:
```js
const liveName = await _resolveProductNameLive(<productId-source>);
// ... in tx body or setDoc:
productName: liveName || <doc>.productName || ''
```

Or use item.productName fallback (V46-EXEMPT — caller-supplied canonical post-V44):
```js
productName: liveName || item.productName || <doc>.productName || ''
```

**POISON GATE pattern**: when a function builds a `resolvedItems` array that's later consumed by destination-tier batch/movement writers (e.g. transfer, withdrawal), live-resolve AT THE GATE so downstream consumers inherit canonical names. Single live-resolve fixes multiple downstream write sites.

**Comprehensive grep** (V48 CAT8.1):
```js
// Every stockMovementDoc productName write classified into sanctioned categories:
const writes = [...src.matchAll(/(?:tx\.set|setDoc|wb\.set)\(stockMovementDoc\([^)]+\),\s*\{[\s\S]+?productName:\s*([^,]+?),/g)];
for (const m of writes) {
  const expr = m[1].trim();
  const isLiveResolve = /live(?:Name|...|CentralCancelName)/i.test(expr);
  const isItemBased = /\b(?:item|it)\.productName/.test(expr);
  const isReadExisting = /\bm\.productName/.test(expr); // reading existing movement
  const isLineBased = /\b(?:line|p|t|c)\.productName/.test(expr); // sale-side category split
  expect(isLiveResolve || isItemBased || isReadExisting || isLineBased).toBe(true);
}
```

**Companion AV: AV24** (specific to _deductOneItem productName), **AV25** (display-layer grouping). AV26 is the UNIVERSAL stock-writer enforcement.

**Sanctioned exceptions** (item.productName-based — V46-exempt):
- `createCentralStockOrder.persistedItems` — caller-supplied input items
- All `_normalizeStockItems` skip-paths in `_deductOneItem` (course-skip / product-skip / not-tracked)
- Sale-side category split branches in `_normalizeStockItems` (products / medications / consumables / treatmentItems)
- `reverseStockForSale` reading existing movement (m.productName) for INFORMATION purpose only

### AV25 — Every customer.courses[] reader rendering UI cards MUST go through a grouping helper (V47)

**Why**: V47 (2026-05-08) — `customer.courses[]` stores 1 entry PER PRODUCT (post V44/V45 canonical design). CustomerDetailView mapped `activeCourses` 1-to-1 → user saw N CARDS for one logical course (one per per-product entry — main + each sub-product) with FULL course value stamped on each card. TFP "ข้อมูลการใช้คอร์ส" panel correctly groups via `buildCustomerCourseGroups` (form-shape) → 1 card with N nested rows. The display inconsistency confused user: "ต้องเชื่อตรงไหน?". Same V12 multi-reader-sweep family as V44/V45 (storage shape changed → every READER must be audited) but at the rendering layer that wasn't included in the original Phase 12.2b grouping rollout.

**The rule**: For any UI surface that displays courses to users (Customer Detail View, TFP, future course-list panels, search results, etc.), iteration over `customer.courses[]` for CARD RENDERING is FORBIDDEN. Must go through ONE of:
- `groupCustomerCoursesForDetailView(rawCourses)` — operates on raw `be_customers.courses[]` shape (`name` + `product` fields)
- `mapRawCoursesToForm(rawCourses)` + `buildCustomerCourseGroups(formShape)` — form-shape chain (`courseName` + `products[]` fields)

Both helpers use IDENTICAL group key (`name|linkedSaleId|linkedTreatmentId|parentName` + `__addon__|courseId` for buy-this-visit) so all views agree on "one purchase event = one card".

**Grep**:
- `customer\.courses\.map\(` or `(activeCourses|expiredCourses)\.map\(` in component files (excluding helper definitions). V47 anti-pattern when used for card rendering.
- `groupCustomerCoursesForDetailView\(` should appear in any consumer of raw `customer.courses[]` for UI rendering.
- `customer\.courses\.filter\(` is OK for non-rendering operations (badge counts, etc.) but should still go through grouping for any user-facing count.

**Sanctioned exception**: helper internals + tests + scripts are allowed direct iteration. Annotate inline if relevant: `// audit-anti-vibe-code: AV25 safe — helper-internal access`.

**Source-grep regression test pattern** (V47 lock — see `tests/v47-customer-detail-view-grouping.test.js` V47.C):
```js
expect(cdvSrc).toMatch(/import\s*\{\s*groupCustomerCoursesForDetailView/);
expect(cdvSrc).toMatch(/groupCustomerCoursesForDetailView\(activeCourses\)/);
expect(cdvSrc).toMatch(/\(\s*courseTab === 'active' \? activeCourseGroups : expiredCourseGroups\s*\)\.map\(/);
// Anti-regression: badge MUST use group count, not raw entry count
const badgeBlock = cdvSrc.match(/Package size=\{13\}[\s\S]+?<\/span>/);
expect(badgeBlock?.[0]).not.toMatch(/activeCourses\.length/);
```

**Branch-blindness invariant** (V47.D): the grouping helper's `.toString()` MUST NOT contain `branchId` / `SELECTED_BRANCH` / `useSelectedBranch` references — pure JS only. Same input on every branch produces identical output.

**Companion AV: AV20 (V41) + AV21 (V43) + AV22 (V44) + AV23 (V45) + AV24 (V46)**. Together they lock the entire customer-courses-display + skip-stock-deduction class:
- AV20: lookup-map opt-in
- AV21: denormalized-flag live-resolve
- AV22: canonical mapper adoption
- AV23: dedup OR-merge
- AV24: productName live-resolve at write
- AV25: customer.courses[] reader grouping (display parity)

### AV24 — Stock movement productName must come from be_products live-read, NEVER from batch's frozen denormalized field (V46 + Iron-clad Rule O)

**Why**: V46 (2026-05-08) — `_deductOneItem` at `backendClient.js:6889+6952` set movement.productName from `b.productName` (BATCH's denormalized cache field). When the batch was created during older bug rounds (V44-era course-name leak), batch.productName was POISONED with course name. New movements at this batch inherited the poisoned name despite item.productName being correct (Stapple no 22). User's repro (treatment BT-1778169734111) showed productId=38699 deducted but movement displayed "ขลิบไร้เลือด (เบอร์22) 1 ครั้ง" — looking like name-based deduct even though productId resolution was right. This is the 4th round of the skip-stock-deduction class-of-bug; Iron-clad Rule O was added in `00-session-start.md` to lock the architectural invariant permanently.

**The rule**: For ANY stock-related Firestore write (be_stock_movements primarily, but also batch-creating writers like AUTO-NEG synthesis):
1. productName MUST be live-resolved from `be_products[productId]` at WRITE time. Use the `_resolveProductNameLive(productId)` helper which caches per-call.
2. batch.productName / adjustment.productName / similar denormalized fields are DISPLAY CACHE only — NEVER authoritative when generating new movement records.
3. Fallback chain: `liveName || item.productName || batch.productName || ''`. Empty string is the FINAL fallback — better than course-name leak.

**Grep**:
- `productName:\s*[a-zA-Z_]+\.productName,` — bare assignment from any object's productName (no fallback chain). V46 anti-pattern when the value object is a batch/adjustment/similar Firestore-read doc.
- `tx\.set\(stockMovementDoc` followed within ~20 lines by `productName:\s*b\.productName` (or any short-form bare assignment) — V46 anti-pattern in movement emit.
- `setDoc\(stockBatchDoc[^)]+\),\s*\{[^}]*productName:\s*item\.productName(?!\s*\|\|\s*liveProductName)` — AUTO-NEG batch creation without live-resolve. V46 anti-pattern.
- Helper presence: `_resolveProductNameLive` MUST be imported/defined wherever stock_movement writes happen. Audit grep: `_resolveProductNameLive\(` count must be ≥ number of `tx.set(stockMovementDoc` writes that emit productName.

**Source-grep regression test pattern** (V46 lock — see `tests/v46-rule-o-live-product-name.test.js`):
```js
// 1. Helper exists
expect(backendSrc).toMatch(/async function _resolveProductNameLive\(productId\)/);
// 2. Movement productName uses live-resolved variable, not batch field
expect(backendSrc).toMatch(/productName:\s*liveName\s*\|\|\s*item\.productName/);
expect(backendSrc).toMatch(/productName:\s*liveNameNeg\s*\|\|\s*item\.productName/);
// 3. AUTO-NEG batch creation uses live name
expect(backendSrc).toMatch(/productName:\s*liveProductName\s*\|\|\s*item\.productName/);
// 4. Bare batch-name anti-pattern is GONE in movement emits
expect(backendSrc).not.toMatch(/productName:\s*b\.productName,\s*\n\s*qty:\s*-/);
```

**Sanctioned exception**: SKIP-path movements (course-skip / product-skip / trackStock-false / not-tracked) emit productName from `item.productName` directly because they're documenting USER INTENT (item.productName came from TFP post-V44 canonical chain), not the actual stock outcome. These DO NOT need live-resolve. Annotate inline if relevant: `// audit-anti-vibe-code: AV24 safe — skip-path documents user intent, not stock outcome`.

**Companion AV: AV20 + AV21 + AV22 + AV23**. Together with AV24 they lock the entire skip-stock-deduction class-of-bug:
- AV20 (V41): lookup-map opt-in
- AV21 (V43): denormalized-flag live-resolve
- AV22 (V44): canonical mapper adoption
- AV23 (V45): dedup OR-merge
- AV24 (V46): productName live-resolve at write time — the architectural backstop

**Migration on encountering poisoned data**: V46 ships `scripts/v46-backfill-stock-batch-product-name.mjs` (Rule M two-phase). Re-run when admin sees inconsistent batch productName vs current be_products. Idempotent.

### AV23 — Dedup logic in canonical mappers must OR-merge per-row flags before skipping (V45)

**Why**: V45 (2026-05-08) — `beCourseToMasterShape:3193` had `if (pid && pid === mainId) continue;` — silent dedup that dropped per-row sub-row flags when admin had configured the dup-of-main sub-row with `skipStockDeduction=true`. The main entry was pushed first with `skipStockDeduction: !!c.skipStockDeduction` (top-level only), and the dup-of-main sub's TRUE flag was silently lost. User-reported repro on "ขลิบไร้เลือด (เบอร์26) 1 ครั้ง" — admin set top=false + sub-row=true; result: -1 deduction via negativeOverage instead of branch-1 SKIP. 14 courses on prod were affected (PRP + ขลิบ + ปรึกษา clusters).

This is a **3rd-round-class bug** (V43 + V44 + V45 are all skip-stock-deduction class). Phase 4.5 of `/systematic-debugging` triggered architectural review: the architecture is sound; the bug is dedup-as-silent-skip. Fix: BEFORE `continue;`, find the already-pushed kept entry and OR-merge per-row flags from the dup-row into it. Pure mapper fix — propagates to all 3 consumers (TFP buy + SaleTab buy + QuotationFormModal).

**Grep**:
- `if\s*\([^)]*===\s*mainId\)\s*continue;` — bare continue without merge body. V45 anti-pattern. Every match must be paired with a preceding `products.find(...).<flag> = ...` block to OR-merge.
- General pattern: in any canonical mapper that DEDUPs entries, look for `continue;` after equality check on key field. If the kept entry has any per-record flag that the duplicate could meaningfully override, dedup must OR-merge before skipping.
- Specific flag classes to merge: boolean opt-out flags (`skipStockDeduction`, `isHidden`, `isPremium`, `isControlled`, etc.) — OR-semantic. Numeric/text fields generally don't merge well; flag the dup as ambiguous and skip OR pick the higher-priority source explicitly.

**Source-grep regression test pattern** (V45 lock):
```js
// AV23 grep — bare continue is forbidden; OR-merge body required
expect(backendSrc).not.toMatch(/if\s*\(pid\s*&&\s*pid\s*===\s*mainId\)\s*continue;\s*\n\s*const\s+enriched/);
// OR-merge body must reference the kept entry + per-flag merge
expect(backendSrc).toMatch(/if\s*\(pid\s*&&\s*pid\s*===\s*mainId\)\s*\{[\s\S]*?cp\.skipStockDeduction\s*===\s*true[\s\S]*?continue;\s*\}/);
```

**Sanctioned exception**: dedup paths where the kept entry is GUARANTEED to be canonical (the source-of-truth field is identical between dup + kept) — e.g. dedup by document id where both records came from the same source. Annotate inline: `// audit-anti-vibe-code: AV23 safe — dedup keys are canonical, no per-row override semantic`.

**Companion AV: AV22** (canonical mapper adoption — every consumer uses the same mapper). AV22 prevents inline mappers from drifting; AV23 prevents the canonical mapper itself from silently dropping user intent at dedup boundaries.

### AV22 — Every "buy item" fetcher must use the canonical mapper (V44)

**Why**: V44 (2026-05-08) — `TreatmentFormPage.jsx:1558+` buy fetcher did INLINE mapping (`products: c.courseProducts || c.products || []`) bypassing canonical `beCourseToMasterShape` (`backendClient.js:3150`). Two consequences: (a) `courseProducts` field is `productName` not `name` → `buildPurchasedCourseEntry` reads `p.name` → undefined → falls back to `item.name` (course name); (b) main product (`mainProductId/mainProductName`) at TOP LEVEL of be_courses doc gets dropped entirely. Result: customer course panel shows duplicate rows labeled by course name (Image 2); deduct path uses course name as productName → not found in be_products → falls into negative-overage path. SaleTab + QuotationFormModal both correctly use the canonical mapper; TFP was the V12 multi-reader-sweep gap.

**Grep**:
- `c\.courseProducts\s*\|\|\s*c\.products\s*\|\|\s*\[\]` — V44 anti-pattern. Every match in `src/components/**` (excluding `CoursesTab.jsx` admin-edit modal which works on the master directly) is a violation.
- `products:\s*c\.courseProducts\b` — narrower variant. Same fix.
- For each new "buy item" fetcher (any code that produces buyable course items for a UI dropdown / modal), grep for `beCourseToMasterShape` import — must be present.

**Sanctioned exception**: course-master-edit modals (`CoursesTab.jsx`, `CourseFormModal.jsx`) that EDIT the master directly — they work on the raw shape because they ARE the source-of-truth writer. Mark inline: `// audit-anti-vibe-code: AV22 safe — master-edit context, not a buy fetcher`.

**Source-grep regression test pattern** (V44 lock — see `tests/v44-course-buy-product-name-source-fix.test.js` V44.A.4 + V44.F.3):
```js
// Locate the buy-fetcher branch (e.g. TFP `} else if (type === 'course')`)
const courseBranchStart = src.indexOf('} else if (type === \'course\')');
const courseBranchEnd = src.indexOf('} else if (type === \'promotion\')', courseBranchStart);
const block = src.slice(courseBranchStart, courseBranchEnd);
// V44 anti-pattern grep
expect(block).not.toMatch(/c\.courseProducts\s*\|\|\s*c\.products\s*\|\|\s*\[\]/);
// Canonical mapper present
expect(block).toMatch(/beCourseToMasterShape\(c,/);
```

**Defense-in-depth**: even if a future writer drifts back to raw shape, **`buildPurchasedCourseEntry` + `assignCourseToCustomer`** use V44 dual-read fallbacks (`p.name || p.productName || ...`) to prevent course-name leak at the writer layer. The empty-string final fallback (NOT course-name) makes the V44 bug fingerprint impossible to write silently — admin sees blank product, not a phantom course-named product.

**Companion AV: AV20** (lookup-map opt-in) + **AV21** (denormalized-flag live-resolve). Same V12 multi-reader-sweep family but at the **buy-fetcher mapper** layer rather than read-time enrichment or write-time stamping.

### AV21 — Denormalized boolean flags from a master must live-resolve OR have backfill-migration tracking (V43)

**Why**: V43 (2026-05-08) — `customer.courses[i].skipStockDeduction` was denormalized at buy time + frozen against later master edits. Admin set "ไม่ตัดสต็อค" on PRP sub-product in `be_courses` master AFTER customer LC-26000006 had bought a promotion bundle containing that course. Customer's frozen entries kept `skipStockDeduction: false` → treatment deduct path emitted FIFO+negative-overage instead of branch-1 course-skip. Pattern: any boolean flag denormalized from a master into customer-attached / transaction-attached docs is silent-drift-prone if the master can be edited after the copy.

**Grep**:
- For every `setDoc`/`updateDoc` that copies a boolean field from a master doc into customer-attached / sale-attached / treatment-attached subdoc, audit:
  1. Is the master doc EDITABLE post-copy? (Yes for be_courses / be_products / be_promotions / be_coupons / be_vouchers — admin can change anytime)
  2. Is there a live-resolve overlay at the READ site? (Helper-function pattern that queries the master at form-load + overrides the frozen field)
  3. Is there a backfill-migration script in `scripts/v*-backfill-*.mjs` (Rule M two-phase + audit doc + idempotent)?
- A YES on (1) AND a NO on BOTH (2) and (3) = AV21 violation.

**Specific known-resolved fields** (V43 fix):
- `customer.courses[i].skipStockDeduction` ← live-resolved via `overlayCustomerCoursesWithMaster` in `src/components/TreatmentFormPage.jsx` load path; backfilled via `scripts/v43-backfill-customer-courses-skip-stock.mjs`. Single-source resolver: `resolveCustomerCourseSkipFlag` in `src/lib/treatmentBuyHelpers.js`.

**Source-grep regression test pattern** (V43 lock):
```js
// Lib helper exports + matches diag/migration classifier
expect(treatmentBuyHelpersSrc).toMatch(/export function resolveCustomerCourseSkipFlag/);
expect(treatmentBuyHelpersSrc).toMatch(/export function overlayCustomerCoursesWithMaster/);
// TFP load path applies overlay AFTER mapRawCoursesToForm
expect(tfpSrc).toMatch(/overlayCustomerCoursesWithMaster\(\s*customerCoursesForForm,\s*courseItems/);
// Migration script is two-phase + audit-doc-emitting + idempotent
expect(scriptSrc).toMatch(/process\.argv\.includes\('--apply'\)/);
expect(scriptSrc).toMatch(/be_admin_audit\/v43-/);
```

**Sanctioned exception**: short-lived flags that the master never edits post-copy (e.g. `customer.courses[i].assignedAt` is a write-once timestamp; not a sync target). Mark with `// audit-anti-vibe-code: AV21 safe — master-immutable field` annotation.

**Companion AV: AV13** (long-lived auth bug class) + **AV17** (list spread-order V12). Same V12 multi-reader-sweep family but at the **denormalized-master-flag** level rather than read-shape or write-direction.

## How to run

1. Run each grep pattern; classify hits.
2. For AV1/AV10 (duplication): use `Read` to diff the candidate duplicates — if bodies match ≥70 %, flag for extraction.
3. For AV6: open `firestore.rules` and `storage.rules` if present. Check match blocks against the "world-readable" contract.
4. For AV5: pick the latest 3 commits that wrote to `clinic_schedules` or `opd_sessions.patientLinkToken` — re-read the payload.
5. For AV7/AV8/AV12: `grep -rE "collection\(db.*'(\w+)'" src/` — list collection names, then check for the paired access patterns.

## Priority

**CRITICAL**: AV4 (leaked credentials), AV5 (admin uid leak), AV6 (open rules), AV13 (long-lived auth), AV15 (silent-swallow + missing token revoke), AV17 (list spread order — silent no-op), AV18 (migrate-fn zero-arity dropping branchId — silent zombie creation).
**HIGH**: AV2 (raw date input), AV3 (Math.random tokens), AV11 (N+1 reads), AV14 (silent cleanup), AV16 (source-grep alone for visual).
**MEDIUM**: AV1 (dup components), AV9 (canonical helpers not reused), AV10 (copy-paste UI).
**LOW**: AV7, AV8, AV12 — hygiene over time.

## Example violations from historical commits

- AV1 — DateField had 5 duplicates (SaleTab.DatePickerField, TreatmentFormPage.ThaiDatePicker, AdminDashboard.DatePickerThai + 2 inline). Unified `362da72`.
- AV2 — 5 sites with raw `<input type="date">` fixed in the same commit.
- AV3 — patientLinkToken used `Math.random().toString(36).substr(2,10)` × 2. Crypto upgrade `0d00701`.
- AV5 — `createdBy: user.uid` in schedule doc removed `335cb0e`.
- AV9 — dozens of ad-hoc `new Date().toISOString().slice(0,10)` display sites migrated to `thaiTodayISO()` `71e513f`.
- AV17 — `listProducts` + `listCourses` spread order swapped to `{...d.data(), id: d.id}` in V38 (2026-05-07). 5 พระราม 3 products + 2 courses had stray `data.id` overriding docId → handleDelete silent no-op. **V38-followup mass-sweep** (commit after V39, 2026-05-07) extended the fix to all 85+ callsites across 15 files; full suite 6757/6757 PASS post-sweep.
- AV18 — V39 (2026-05-07) patched 4 migrate fns (promotions/coupons/vouchers/df_staff_rates) + 4 mappers (`buildBe{Promotion,Coupon,Voucher}FromMaster` + `mapMasterToDfStaffRates`) to accept `{branchId}` opt. 479 zombie docs backfilled to พระราม 3 via `scripts/phase-24-0-vicies-novies-decies-backfill-zombie-branchid.mjs --apply`. Audit doc `be_admin_audit/phase-24-0-vicies-novies-decies-backfill-zombie-branchid-1778102599138-4d7618f4`.
