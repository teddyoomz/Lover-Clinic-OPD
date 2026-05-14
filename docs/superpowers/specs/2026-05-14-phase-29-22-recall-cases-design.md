# Phase 29.22 — Recall Cases Admin (be_recall_cases) — Design

**Date**: 2026-05-14
**Author**: Claude (Opus 4.7) + user (brainstorming session, 2026-05-14)
**Status**: Approved (user explicit "approve" after design Q1-Q3 + condensed proposal)
**Prereqs**: Phase 29 (Recall System) shipped (commit `0af351a` deployed; bugs A/B/C/D/E/+ fixed in `c404cb6`/`6c8b72d`, awaiting redeploy). V66 Rule Q infrastructure shipped (`4124105`).
**Related rules**: A (revert) · B (Probe-Deploy-Probe) · C (Rule of 3) · D (continuous improvement) · L (BSA — universal vs branch-scoped) · M (data ops local + admin SDK) · N (targeted-test for small fixes) · P (class-of-bug expansion) · **Q (REAL-ADVERSARIAL VERIFICATION — Playwright L1 mandatory)**

---

## 1. Goal

Decouple recall preset data (case name + default duration) from `be_products` / `be_courses` master docs. Move into a NEW universal (cross-branch) collection `be_recall_cases`. Add admin sub-pill UI to manage cases (CRUD). Wire recall create modal's reason field to a typeahead picker from `be_recall_cases`.

**Why**: Phase 29 denormalized recall presets INTO product/course master docs (`followUpAfterDays` + `followUpReason` fields). This couples recall behavior to per-product master data which:
- (a) violates separation of concerns (product master = catalog identity; recall preset = workflow config)
- (b) bloats master docs with workflow data
- (c) makes preset management awkward (admin must edit each product/course to change a recall preset)
- (d) duplicates presets across many products (no shared "PRP 7-day follow-up" preset; each product carries its own)

User directive (verbatim, 2026-05-14):
> "ตัดการบันทึก recall ใน master data ออก แล้วให้มาสร้างข้อมูลเป็นของตัวเองในหน้า Recall อาจจะเพิ่ม tab ย่อยมาใหม่เพื่อใช้จัดการข้อมูลเคส และระยะเวลา Recall โดยเฉพาะเลย โดยฐานข้อมูลพวกนี้ เป็น global คือใช้ร่วมกันได้ทุกสาขา แต่ข้อมูลการสร้าง recall สาขาใครสาขามันนะ"

= Strip the recall-saving path from master_data. Create OWN data on the Recall page. Maybe add a NEW sub-tab to manage case + duration data specifically. The database is global (all branches share). But the recall record creation stays per-branch.

---

## 2. Decisions locked (from brainstorming)

| # | Question | Decision |
|---|---|---|
| Q1 | Collection name + schema | `be_recall_cases` with minimal schema `{id, caseName, defaultDays, isHidden, audit stamps}` |
| Q2 | Migration of existing be_products / be_courses fields | DELETE fields (no migration to be_recall_cases — admin creates fresh) |
| Q3 | Sub-tab UX + reason picker UX + dedup + permission | Approach A: sub-pill in `RecallTogglePill` + typeahead component + caseName-unique (case-insensitive) + reuse existing `recall_management` permission |

---

## 3. Architecture

### 3.1 Collection placement (BSA Rule L)

`be_recall_cases` is **universal** (no `branchId` field, shared across branches). Rationale:
- Recall workflow patterns ("After PRP 7 days", "Botox 14-day revisit") are clinically universal — same regardless of branch.
- Branches share staff training + clinical guidelines.
- User explicit: "ฐานข้อมูลพวกนี้ เป็น global คือใช้ร่วมกันได้ทุกสาขา".

Per Rule L BSA:
- Re-exported in `src/lib/scopedDataLayer.js` as a UNIVERSAL pass-through (no `_autoInject` wrapper)
- `branch-collection-coverage.test.js` classification: `scope: 'global'`
- Listener (if needed) marked `__universal__` so `useBranchAwareListener` bypasses branch-resubscribe

`be_recalls` (actual recall records — per-customer, branch-scoped) **unchanged**. The split is correct: PRESET data is universal; RECORDS are branch-scoped.

### 3.2 Read path

```
Modal opens (RecallCreateModal)
  → listRecallCases({ includeHidden: false }) via scopedDataLayer
  → array of {caseId, caseName, defaultDays} passed to RecallSlotCard
  → RecallCaseSelectField renders typeahead dropdown
  → admin types / picks
  → on pick: setReason(caseName) + setRecallDate(today + defaultDays)
```

### 3.3 Write path

**Manage path** (admin clicking sub-pill "จัดการเคส"):
```
RecallCasesAdminPanel
  → "+ เพิ่มเคส" → RecallCaseFormModal
  → validate (caseName non-empty, defaultDays 1-365, no name collision)
  → saveRecallCase({caseName, defaultDays}) — Firestore setDoc
  → emits success; table refreshes via listener
```

**Inline-learn path** (from RecallCreateModal):
```
admin enables slot + types reason "PRP 7d" + ticks "บันทึก..."
  → submitting save recall (existing be_recalls write)
  → IF saveToMaster + reason non-empty + days≥1:
    → check findRecallCaseByName(reason.trim()) (case-insensitive)
    → if exists: silent no-op (Rule C — anti-vibe-code prevent duplicates)
    → if not exists: saveRecallCase({caseName, defaultDays})
  → toast "บันทึกเคสใหม่: {caseName}" (only when freshly created)
```

---

## 4. Data model

### 4.1 `be_recall_cases/{caseId}` (universal)

Path: `artifacts/{APP_ID}/public/data/be_recall_cases/{caseId}`

```js
{
  id: 'CASE-{ts}-{hex8}',        // crypto.getRandomValues — Rule C2
  caseName: string,               // 1-100 chars; case-insensitive unique trim
  defaultDays: number,            // integer 1-365
  isHidden: boolean,              // soft-archive (mirror V41 staff/doctor hide)
  hiddenAt: Timestamp | null,     // audit stamp on transition (V41 pattern)
  hiddenBy: uid | null,           // who hid
  createdAt: serverTimestamp(),
  createdBy: uid,
  updatedAt: serverTimestamp(),
  updatedBy: uid,
}
```

**Validation rules** (in `src/lib/recallCaseValidation.js`):
- `caseName`: trimmed, 1-100 chars. Non-empty after trim. Thai/English/numeric OK.
- `defaultDays`: integer, 1-365 inclusive. Reject 0, negatives, decimals, strings.
- `isHidden`: boolean. Default false.
- Dedup: `findRecallCaseByName(name)` returns existing case where `caseName.trim().toLowerCase() === name.trim().toLowerCase()` AND `isHidden === false`.

### 4.2 firestore.rules

```
match /be_recall_cases/{caseId} {
  // Phase 29.22 (2026-05-14) — universal recall preset collection.
  // Per BSA Rule L: no branchId; shared across all branches.
  // Per Rule Q post-deploy verification: probe via real client SDK compound query.
  allow read: if isClinicStaff();
  allow create: if isClinicStaff();
  allow update: if isClinicStaff();
  allow delete: if false;  // No hard delete; admin uses isHidden=true (V41 pattern)
}
```

**Probe-Deploy-Probe (Rule B) extension** — add probe endpoint #8:
```bash
# Pre + post deploy probes:
# Probe 8a (anon → expect 403):
curl -X POST "$BASE/$PREFIX/be_recall_cases?documentId=test-probe-$(date +%s)" \
  -d '{"fields":{"probe":{"booleanValue":true}}}'
# expect 403

# Probe 8b (clinic-staff token → expect 200):
curl -X POST "$BASE/$PREFIX/be_recall_cases?documentId=test-probe-$(date +%s)" \
  -H "Authorization: Bearer $STAFF_TOKEN" \
  -d '{"fields":{"caseName":{"stringValue":"TEST-PROBE"},"defaultDays":{"integerValue":7}}}'
# expect 200

# Post-deploy real-client-SDK compound query probe (Rule Q V66):
# getDocs(query(be_recall_cases, where(isHidden,==,false), orderBy(caseName)))
# via @firebase/firestore client SDK with clinic-staff token; expect no index errors.
```

### 4.3 firestore.indexes.json

No composite indexes required. Single-field default indexes cover:
- `orderBy(caseName)` — single-field
- `where(isHidden, ==, false)` — single-field
- Combined `where(isHidden, ==, false) + orderBy(caseName)` requires composite index (auto-built or declared explicitly to avoid post-deploy "index building" period per V66 lesson).

**Declared composite index** (to avoid V66-class index-building race):
```json
{
  "collectionGroup": "be_recall_cases",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "isHidden", "order": "ASCENDING" },
    { "fieldPath": "caseName", "order": "ASCENDING" }
  ]
}
```

---

## 5. Components

### 5.1 NEW files

| Path | Purpose |
|---|---|
| `src/lib/recallCaseValidation.js` | `normalizeRecallCase`, `validateRecallCase`, `findRecallCaseByName` (pure JS) |
| `src/components/backend/recall/RecallCasesAdminPanel.jsx` | CRUD table (list, search, add, edit, soft-delete, restore) |
| `src/components/backend/recall/RecallCaseFormModal.jsx` | Form modal (caseName input + defaultDays input + validate + save) |
| `src/components/backend/recall/RecallCaseSelectField.jsx` | Typeahead picker (mirror `ProductSelectField` shape; `onPick({caseName, defaultDays})`) |

### 5.2 Modified files

| Path | Change |
|---|---|
| `src/lib/backendClient.js` | NEW `listRecallCases({includeHidden=false})`, `saveRecallCase(form)`, `setRecallCaseHidden(id, isHidden)`, `findRecallCaseByName(name)`. Marked universal (no `_resolveBranchIdForWrite` stamping). Remove `followUpAfterDays`/`followUpReason` writes from `saveProduct` / `saveCourse`. |
| `src/lib/scopedDataLayer.js` | Re-export `listRecallCases` as universal pass-through (no `_autoInject`). |
| `src/components/backend/recall/RecallTogglePill.jsx` | Add 4th pill "🗂 จัดการเคส" (admin-only via `recall_management` permission gate) |
| `src/components/backend/recall/RecallTab.jsx` | Render `RecallCasesAdminPanel` when `view === 'cases'` |
| `src/components/backend/recall/RecallSlotCard.jsx` | Reason `<input>` → `<RecallCaseSelectField>`. "บันทึก..." copy update ("บันทึกเป็นเคส Recall — Recall ครั้งถัดไปจะ Auto-suggest จากค่านี้"). |
| `src/components/backend/recall/RecallCreateModal.jsx` | `masterDataSuggestions` prop kept but DEPRECATED. NEW prop `recallCases` (array). `onSaveToMaster` → `onSaveAsRecallCase`. Internal: pass `recallCases` to RecallSlotCard for typeahead. |
| `src/components/backend/customer-recall/RecallFromTreatmentModal.jsx` | Remove `be_products`/`be_courses` fetch for `masterDataSuggestions`. Replace with `listRecallCases()` fetch. Pass to RecallCreateModal as `recallCases`. |
| `src/components/backend/recall/RecallFrontendView.jsx` | Same as above: fetch recallCases, pass to modal |
| `src/components/backend/customer-recall/RecallCard.jsx` | Same as above |
| `src/lib/productValidation.js` | Remove `followUpAfterDays`, `followUpReason` from `emptyProductForm`, `normalizeProduct`. |
| `src/lib/courseValidation.js` | Same for courses. |
| `src/components/backend/ProductFormModal.jsx` | Remove `followUpAfterDays`, `followUpReason` form fields |
| `src/components/backend/CourseFormModal.jsx` | Same |
| `firestore.rules` | Add `be_recall_cases` match block |
| `firestore.indexes.json` | Add composite index for `(isHidden, caseName)` |
| `tests/branch-collection-coverage.test.js` | Add `be_recall_cases` to COLLECTION_MATRIX as `scope: 'global'` |

### 5.3 Component contracts

#### RecallCaseSelectField

```jsx
<RecallCaseSelectField
  value={reason}
  recallCases={recallCases}              // [{caseId, caseName, defaultDays}]
  onChange={(text) => setReason(text)}   // typing free-text
  onPick={({ caseName, defaultDays }) => {
    setReason(caseName);
    setRecallDate(addDaysISO(todayISO, defaultDays));
  }}
  data-field="recall-slot-reason"
  placeholder="พิมพ์เพื่อค้นหา หรือเลือกเคสที่บันทึกไว้..."
/>
```

Behavior:
- Free-text input + dropdown overlay
- Filter cases by `caseName.toLowerCase().includes(query.toLowerCase())`
- Empty query → show all visible (max 20 + "Show more")
- Click → `onPick` (auto-fill date)
- Type without picking → `onChange` only (admin enters new reason)
- Esc / blur closes dropdown
- Keyboard nav (↑↓ Enter) — match ProductSelectField

#### RecallCasesAdminPanel

Layout:
```
[Header] 🗂 จัดการเคส Recall                            [+ เพิ่มเคส]
[Search input: ค้นหาเคส...]                            [☐ แสดงที่ซ่อน]
┌──────────────────────────────────────────────────────┐
│ ชื่อเคส              │ ระยะเวลา │ สถานะ │ Actions  │
├──────────────────────────────────────────────────────┤
│ After PRP 7-day F/U  │ 7 วัน   │ ใช้งาน │ แก้ ซ่อน │
│ Botox 14-day revisit │ 14 วัน  │ ใช้งาน │ แก้ ซ่อน │
│ Filler 30-day check  │ 30 วัน  │ ซ่อน  │ แก้ คืน  │
└──────────────────────────────────────────────────────┘
```

---

## 6. UX flow

### 6.1 Admin creates a case via sub-pill

```
1. Admin clicks pill "🗂 จัดการเคส" in RecallTab
2. RecallCasesAdminPanel renders (CRUD table)
3. Clicks "+ เพิ่มเคส"
4. RecallCaseFormModal opens
5. Fills "After PRP 7-day F/U" + 7
6. Clicks "บันทึก"
7. validateRecallCase → findRecallCaseByName check → no collision → saveRecallCase
8. Modal closes; table refreshes via onSnapshot listener
9. Toast: "เพิ่มเคสสำเร็จ"
```

### 6.2 Admin creates a recall using saved case

```
1. Admin clicks "+ ตั้ง Recall ใหม่" anywhere (Backend / Frontend / CDV / Treatment)
2. RecallCreateModal opens; fetches recallCases via listRecallCases()
3. Admin enables slot 1 (aftercare)
4. Clicks reason field → typeahead dropdown shows existing cases
5. Picks "After PRP 7-day F/U"
6. Reason field shows "After PRP 7-day F/U"; recallDate auto-fills to (today + 7 days)
7. Admin clicks "บันทึก Recall"
8. recall doc written to be_recalls (branch-scoped per BSA — unchanged)
```

### 6.3 Admin creates a recall with new ad-hoc case + saves as preset

```
1-3. Same as above
4. Admin types NEW reason "Acne 21-day follow-up" + days field
5. Picks date (or types days → date auto-computes)
6. Ticks "💾 บันทึกเป็นเคส Recall"
7. Clicks "บันทึก Recall"
8. recall doc written
9. (Inline-learn) saveRecallCase({caseName: "Acne 21-day follow-up", defaultDays: 21})
10. Toast: "บันทึกเคสใหม่: Acne 21-day follow-up — Recall ครั้งถัดไปจะ Auto-suggest"
```

### 6.4 Soft-archive a case

```
1. Admin in RecallCasesAdminPanel
2. Clicks "ซ่อน" on a row
3. Confirm dialog: "ซ่อนเคส 'X' จาก dropdown? (ข้อมูลยังอยู่; สามารถคืนได้)"
4. Yes → setRecallCaseHidden(id, true) → stamps hiddenAt + hiddenBy
5. Row badge → "ซ่อน" (amber)
6. Dropdown in modal stops showing this case (filter `isHidden === false`)
7. Toggle "☐ แสดงที่ซ่อน" → see hidden + restore button
```

---

## 7. Migration (Rule M)

### 7.1 Script contract

`scripts/phase-29-22-strip-recall-fields-from-product-course.mjs`:

**Input**: Pull `.env.local.prod` for admin SDK creds.

**Phase 1 (dry-run default)**:
```
1. Init admin SDK using PEM split('\\n').join('\n')
2. Scan all docs in:
   - artifacts/{APP_ID}/public/data/be_products
   - artifacts/{APP_ID}/public/data/be_courses
3. For each doc, collect:
   - has(followUpAfterDays) ? value : skip
   - has(followUpReason) ? value : skip
4. Output:
   - Total scanned: N products, M courses
   - Total with followUpAfterDays: A
   - Total with followUpReason: B
   - Total with both: C
   - Already-cleared (_recallFieldsClearedAt stamped): D — skipped
   - Distinct (reason, days) tuples found — sample table (for admin to recreate as recall_cases)
   - Sample 5 affected doc IDs
5. Exit with "Re-run with --apply to commit"
```

**Phase 2 (`--apply`)**:
```
1. Re-scan
2. For each doc with non-null followUpAfterDays OR non-null followUpReason AND no _recallFieldsClearedAt stamp:
   - Capture legacy value: legacy = { followUpAfterDays: doc.followUpAfterDays || null, followUpReason: doc.followUpReason || null }
   - updateDoc({
       followUpAfterDays: FieldValue.delete(),
       followUpReason: FieldValue.delete(),
       _recallFieldsClearedAt: serverTimestamp(),
       _recallFieldsLegacyValue: legacy,
     })
3. Write audit doc:
   - artifacts/{APP_ID}/public/data/be_admin_audit/phase-29-22-strip-recall-fields-{ts}-{rand}
   - { phase: '29.22', op: 'strip-recall-fields', scanned: {products: N, courses: M}, cleared: {products: A, courses: B}, skipped: D, distinctSample: [...], appliedAt: serverTimestamp(), appliedBy: 'cli' }
4. Idempotency: re-run with --apply → 0 writes (all stamped)
```

**Invariants**:
- Two-phase (dry-run by default)
- Idempotent
- Audit doc emit
- Forensic stamps (`_recallFieldsClearedAt`, `_recallFieldsLegacyValue`)
- Crypto-secure random for audit doc ID

**NOT migrating to be_recall_cases** — per user directive (Q2 = "ลบข้อมูลตรงนี้ทิ้งไป ไม่ใช้แล้ว"). Admin creates be_recall_cases fresh through the new UI.

### 7.2 When to run

After code deploy (after `be_recall_cases` collection + UI is live). Order:
1. Deploy code (Vercel + Firebase rules + indexes)
2. Probe-Deploy-Probe (Rule B + Rule Q post-deploy real-client-SDK probe)
3. Verify production UI: admin sees sub-pill, can create cases
4. Run script dry-run on prod → review distinct tuples sample
5. User approves → run `--apply`
6. Verify: spot-check 3 products + 3 courses → `_recallFieldsClearedAt` stamped + `followUpAfterDays` gone

---

## 8. Tests (Rule Q — REAL-ADVERSARIAL!)

### 8.1 Test layers (5 layers — mock layers DEMOTED per Rule Q)

| Layer | Type | File | Status |
|---|---|---|---|
| Helper unit | Vitest pure | `tests/phase-29-22-recall-case-validation.test.js` | Code-shape coverage only (per Rule Q) |
| Source-grep | Vitest source-grep | `tests/phase-29-22-source-grep.test.js` | Regression LOCK (post-L1/L2 confirms behavior) |
| Rule I flow-simulate | Vitest RTL | `tests/phase-29-22-flow-simulate.test.jsx` | Multi-step simulation |
| Branch-scope audit | Vitest classification | extend `tests/branch-collection-coverage.test.js` | BSA invariant |
| **🚨 Rule Q L1** | **Playwright real-browser** | `tests/e2e/phase-29-22-recall-cases-real-browser.spec.js` | **PRIMARY verification** |

### 8.2 Rule Q L1 Playwright scenarios (MANDATORY)

Real browser driving dev server pointing at REAL prod Firestore (TEST-CASE-* prefixed fixtures for safety):

```
RB1. Admin creates case via sub-pill
  - Login as clinic-staff (Firebase ID token injected)
  - Navigate to RecallTab
  - Click sub-pill "🗂 จัดการเคส"
  - Click "+ เพิ่มเคส"
  - Fill caseName="TEST-CASE-A1 PRP-7d", defaultDays=7
  - Click บันทึก
  - Assert table shows new row
  - Assert no console errors

RB2. Typeahead picker in recall modal pulls from be_recall_cases
  - Open RecallCreateModal (Backend tab)
  - Pick customer (TEST customer pre-fixtured)
  - Click reason field → typeahead dropdown appears
  - Type "TEST-CASE-A1"
  - Assert dropdown shows "TEST-CASE-A1 PRP-7d"
  - Click row
  - Assert reason input shows full text
  - Assert recallDate auto-filled to (today + 7 days)
  - Assert no console errors

RB3. Inline-learn from modal
  - Open RecallCreateModal
  - Type NEW reason "TEST-CASE-RB3 Acne-21d"
  - Set days = 21
  - Tick "💾 บันทึกเป็นเคส Recall"
  - Click บันทึก Recall
  - Toast: "บันทึกเคสใหม่"
  - Navigate to sub-pill "จัดการเคส"
  - Assert "TEST-CASE-RB3 Acne-21d" appears in table

RB4. Cross-branch universal verification
  - Switch top-right BranchSelector to a different branch
  - Open RecallCreateModal again
  - Click reason field
  - Assert TEST-CASE-A1 and TEST-CASE-RB3 STILL show in dropdown (universal — branch-agnostic)

RB5. Soft-archive flow
  - In RecallCasesAdminPanel
  - Click "ซ่อน" on TEST-CASE-A1
  - Confirm
  - Assert badge "ซ่อน" appears
  - Open recall modal
  - Type "TEST-CASE-A1" in reason field
  - Assert dropdown does NOT show TEST-CASE-A1

RB6. Real-client-SDK compound query (Rule Q V66 post-deploy probe)
  - getDocs(query(be_recall_cases, where(isHidden, ==, false), orderBy(caseName)))
  - via @firebase/firestore client SDK with clinic-staff token
  - Assert no "index building" error
  - Assert returns non-empty when cases exist

Cleanup phase: delete all TEST-CASE-* fixtures via admin SDK
```

### 8.3 Source-grep regression locks

```
- src/lib/backendClient.js MUST have:
  - `listRecallCases` function with `__universal__` marker
  - `saveRecallCase` function
  - `setRecallCaseHidden` function
  - `findRecallCaseByName` function
  - NO `followUpAfterDays` / `followUpReason` writes (anti-regression)

- src/lib/productValidation.js + courseValidation.js MUST NOT have:
  - `followUpAfterDays` references
  - `followUpReason` references

- firestore.rules MUST contain:
  - `match /be_recall_cases/{caseId}`
  - `allow delete: if false` (soft-archive only)

- firestore.indexes.json MUST have:
  - `be_recall_cases` composite index (isHidden, caseName)

- tests/branch-collection-coverage.test.js MUST classify:
  - `be_recall_cases`: scope: 'global'
```

### 8.4 Targeted tests (Rule N — small fix scope)

Per Rule N, full vitest run reserved for batch end. During iteration:
- Helper tests (validation)
- Touched-module imports (grep `<touched-module>` in tests/)
- Phase 29.22 flow-simulate
- audit-branch-scope (universal classification check)

**Full vitest** at end of batch + pre-deploy.

---

## 9. Deploy plan

Per Rule B Probe-Deploy-Probe + Rule Q V66 post-deploy real-query verification:

### 9.1 Pre-deploy checklist

- [ ] All 5 test layers GREEN
- [ ] **Rule Q L1 Playwright 6/6 PASS** (PRIMARY verification)
- [ ] `npm run build` clean
- [ ] Code review: no `followUpAfterDays` / `followUpReason` writes remain (grep)
- [ ] Migration script dry-run reviewed (admin sees expected distinct tuples)

### 9.2 Deploy sequence (USER-TRIGGERED — requires explicit "deploy" per V18)

```
1. Pre-deploy probes (Rule B):
   - Existing 4 endpoints (chat_conversations, opd_sessions CREATE+UPDATE, be_exam_rooms, backups)
   - NEW endpoint 8: be_recall_cases anon→403 + clinic-staff→200

2. firebase deploy --only firestore:rules,storage:rules,firestore:indexes

3. vercel --prod --yes (parallel)

4. Post-deploy probes:
   - Rule B: re-run 4+1 endpoints (verify no regression)
   - Rule Q V66: real-client-SDK compound query probe via @firebase/firestore
     - getDocs(query(be_recall_cases, where(isHidden,==,false), orderBy(caseName)))
     - Watch for "index building" error → retry every 30s up to 5min
     - Once green: proceed
   - Rule Q V66: Playwright real-browser smoke against production URL
     - 1-2 scenarios from RB1-RB6 on PROD
     - Verify no console errors + sub-pill visible + dropdown populates

5. Cleanup test probes (admin-only cleanup endpoint OR Rule M script)

6. Run migration script:
   - scripts/phase-29-22-strip-recall-fields-from-product-course.mjs (dry-run)
   - Review counts + distinct tuples
   - User confirms → --apply
   - Verify audit doc created in be_admin_audit
```

### 9.3 Combined deploy with Phase 29 V66 bug fixes

Phase 29 bugs A-E+ already fixed in master (`c404cb6`, `6c8b72d`) but not redeployed. Phase 29.22 ships **combined** with those fixes in one deploy.

### 9.4 Rollback plan (Rule A)

If deploy breaks production:
1. `git revert <merge-commit>` immediately (NOT patch-forward per Rule A)
2. Re-deploy reverted master
3. firestore.rules + indexes also revert
4. Migration script: forensic-trail allows restore via `_recallFieldsLegacyValue`

---

## 10. Risk + mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| `be_recall_cases` empty on first deploy → modal dropdown empty | Low | Admin creates cases via sub-pill before relying on dropdown; free-text input remains as fallback |
| Composite index "building" period after deploy (V66) | Medium | Declared index in firestore.indexes.json + post-deploy real-client-SDK probe with retry |
| Migration script blasts wrong fields | High | Two-phase dry-run + admin review + forensic stamps allow restore |
| Existing Phase 29 RecallCreateModal callers break | Medium | Backward-compat: keep `masterDataSuggestions` prop accepted but unused; new `recallCases` prop is opt-in |
| caseName collision on inline-learn | Low | `findRecallCaseByName` checks before write (Rule C anti-vibe) |
| Race condition: 2 admins create same caseName | Low | Last-write-wins; Firestore transaction not required (admin operation, low concurrency) |
| Dropdown perf with 100+ cases | Low | Filter client-side; show top 20 + "Show more"; mirror ProductSelectField pattern |
| Permission gate skipped | Medium | Sub-pill checks `useTabAccess.hasPermission('recall_management')` AND admin bypass; backend rule = `isClinicStaff()` defense in depth |
| Cross-branch leak of recall RECORD | None | `be_recalls` unchanged — still branch-scoped per BSA |

---

## 11. Success criteria

**Code complete when**:
- All tests GREEN (5 layers)
- Playwright RB1-RB6 PASS (Rule Q L1)
- `npm run build` clean
- Source-grep shows no `followUpAfterDays`/`followUpReason` writes remain
- branch-collection-coverage shows `be_recall_cases: scope: 'global'`

**Deploy complete when**:
- All probes green (pre + post)
- Real-client-SDK compound query probe PASS (no index-building error)
- 1-2 Playwright scenarios PASS against production URL
- Migration script applied + audit doc verified
- Spot-check: 3 products + 3 courses show `_recallFieldsClearedAt` stamped + `followUpAfterDays` field gone
- User confirms: can create + use cases end-to-end via real UI

**V-class lock**:
- If any post-deploy bug found via Rule Q L1 retest → log V-entry, fix, redeploy
- If 5-min testing finds 0 bugs → adversarial retest at higher difficulty (V66 self-check)

---

## 12. Out of scope

- ProClinic sync (no recall presets in ProClinic — purely OUR data)
- Per-branch case overrides (universal only per user directive)
- Recall case categories / tags / colors (deferred to v2 if needed)
- Cross-reference recall_cases ↔ products/courses (decoupled per user directive — no linkage)
- Bulk import / export of recall cases (admin creates inline)
- Per-customer recall case preferences (universal at preset level; per-customer is the recall record itself)
- Auto-suggest based on treatment context (Phase 29 fix2 path) — REMOVED entirely; admin picks from dropdown
- Editing be_recalls records that referenced legacy `followUpReason` — historical records preserved as-is (immutable)

---

## 13. Open questions

None at design time. Brainstorming Q1-Q3 resolved + condensed proposal approved.

---

## 14. References

- Brainstorming session log (this chat, 2026-05-14)
- Phase 29 spec: `docs/superpowers/specs/2026-05-14-recall-system-design.md`
- Phase 29 plan: `docs/superpowers/plans/2026-05-14-phase-29-recall-system.md`
- V66 V-entry: `.claude/rules/00-session-start.md` § 2 + `.claude/rules/v-log-archive.md`
- Rule Q (real-adversarial-verification): `~/.claude/skills/real-adversarial-verification/SKILL.md`
- Rule M (data ops): `.claude/rules/01-iron-clad.md` Rule M
- Rule L (BSA): `.claude/rules/00-session-start.md` Rule L
- V41 (staff/doctor hide) — soft-archive pattern reference: `.claude/rules/v-log-archive.md` V41 section
