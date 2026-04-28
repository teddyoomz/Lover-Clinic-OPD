# Phase 16.5 — Remaining Course tab — design spec

**Status**: Approved 2026-04-29 (user `/brainstorming` flow + ExitPlanMode)
**Type**: New backend report tab + 3 new modal components + 1 new backend helper + extension of existing course-exchange helper module
**Skill flow used**: `using-superpowers` boot → `brainstorming` (Q&A 5 design dimensions, all approved) → ExitPlanMode (plan approved) → spec doc → TDD implementation

---

## Context

ProClinic exposes `/admin/remaining-course` (intel: `docs/proclinic-scan/detailed-adminremaining-course.json`). It is a search/list view of every customer's remaining (= bought-but-not-fully-used) courses, with a cancel-with-reason action per row.

Our system has the backend helpers (`refundCustomerCourse` + `exchangeCourseProduct` in `src/lib/backendClient.js`; pure helpers `applyCourseRefund` + `applyCourseExchange` + `buildChangeAuditEntry` in `src/lib/courseExchange.js`) — shipped via T4 from V32-tris-bis. **Zero UI surfaces them today.** Customers can buy courses (sale flow) and use them (treatment flow), but admin has no list view of "what is sitting unused" and no UI path to cancel/refund/exchange a course post-sale.

This tab is the missing surface. It is the FIRST UI consumer of those helpers. Adding it triggers an extension to `courseExchange.js` (new `applyCourseCancel` + extending `buildChangeAuditEntry` to accept `kind: 'cancel'`) and adds the backend wrapper `cancelCustomerCourse` mirroring `refundCustomerCourse`.

---

## Goals

1. List every course in `be_customers[].courses[]` for the current branch with HN/customer/course/qty/status/value visible at a glance.
2. Filter by search (HN/name/phone/course-name) · status · course-type · "has remaining" toggle.
3. Sort default by purchase date desc.
4. Allow per-row Cancel/Refund/Exchange via 3 dedicated modals.
5. CSV export (admin can paste into Excel for analysis).
6. Branch-scoped via `BranchContext` (consistent with stock/appt/sale tabs).

## Non-goals

- New Firestore collection (derived strategy approved — flatten existing `be_customers` client-side).
- `be_remaining_courses` materialized view + sync triggers.
- Branch=ALL toggle.
- Bulk actions (cancel-many/refund-many).
- Mobile-specific redesign — horizontal scroll table (existing reports pattern).
- Modernizing `exchangeCourseProduct` (it currently writes `courseExchangeLog` array; later it could move to `be_course_changes`. NOT in 16.5 scope.)

---

## Status enum (CRITICAL — Thai strings, not English)

Course objects on `be_customers[].courses[]` use Thai status strings. From `src/lib/courseExchange.js` lines 65, 109, 116:

| Status | Thai string | Meaning | Set by |
|---|---|---|---|
| Active | `'กำลังใช้งาน'` | bought + unused / partially used | initial `assignCourseToCustomer`, `applyCourseExchange` (new course) |
| Used up | `'ใช้หมดแล้ว'` | qtyRemaining hit zero | treatment flow |
| Refunded | `'คืนเงิน'` | refunded (terminal) | `applyCourseRefund` |
| Cancelled | `'ยกเลิก'` | cancelled without refund (terminal) | NEW `applyCourseCancel` (16.5) |

**Filter dropdown labels (UX)**:
- `''` → ทุกสถานะ
- `'กำลังใช้งาน'` → กำลังใช้งาน
- `'ใช้หมดแล้ว'` → ใช้หมดแล้ว
- `'คืนเงิน'` → คืนเงิน
- `'ยกเลิก'` → ยกเลิก

**Status fallback for legacy course objects** missing `status` field: `course.status || 'กำลังใช้งาน'` (default to active — matches ProClinic-imported old courses).

---

## Architecture

### Files to create

| Path | Purpose |
|---|---|
| `src/lib/remainingCourseUtils.js` | Pure helpers (10 exports — all unit-testable) |
| `src/components/backend/reports/RemainingCourseTab.jsx` | Tab container — filter bar, table, CSV button, empty/loading |
| `src/components/backend/reports/RemainingCourseRow.jsx` | Single row + kebab dropdown |
| `src/components/backend/CancelCourseModal.jsx` | NEW soft-cancel modal |
| `src/components/backend/RefundCourseModal.jsx` | NEW refund modal |
| `src/components/backend/ExchangeCourseModal.jsx` | NEW exchange modal |
| `tests/phase16.5-remaining-course-utils.test.js` | ~25 pure helper tests |
| `tests/phase16.5-remaining-course-modals.test.jsx` | ~15 RTL modal tests |
| `tests/phase16.5-remaining-course-flow-simulate.test.js` | ~10 full-flow simulate tests (Rule I) |
| `tests/phase16.5-source-grep.test.js` | ~10 regression guards |
| `tests/phase16.5-cancel-customer-course.test.js` | ~8 backend helper unit tests |

### Files to modify

| Path | Change |
|---|---|
| `src/lib/courseExchange.js` | NEW `applyCourseCancel(customer, courseId, opts)` — sets `status: 'ยกเลิก'`, `cancelledAt`, `cancelReason`; `buildChangeAuditEntry` accepts `kind: 'cancel'` |
| `src/lib/backendClient.js` | NEW `cancelCustomerCourse(customerId, courseId, reason, opts)` — runTransaction wrapper mirroring `refundCustomerCourse` |
| `src/components/backend/nav/navConfig.js` | NEW entry under "รายงาน" section: `{ id: 'reports-remaining-course', label: 'คอร์สคงเหลือ', icon: ClockIcon, color: 'sky', palette: 'remaining course คอร์ส คงเหลือ remaining' }` |
| `src/pages/BackendDashboard.jsx` | `lazy()` import + render case for `'reports-remaining-course'` |

### Existing utilities to reuse (verified paths)

- `src/lib/BranchContext.jsx` — `useBranch()` for `selectedBranchId`
- `src/lib/backendClient.js`:
  - `listCustomers({ branchId })` — branch-scoped customer fetch
  - `refundCustomerCourse(customerId, courseId, refundAmount, opts)` (line 2719)
  - `exchangeCourseProduct(customerId, courseIndex, newProduct, reason)` (line 1330) — note `courseIndex` not `courseId`
- `src/lib/courseExchange.js`:
  - `findCourseIndex(customer, courseId)` — used by Cancel/Refund/Exchange wrappers
  - `applyCourseRefund(customer, courseId, refundAmount, opts)` — reused by RefundCourseModal
  - `applyCourseExchange(customer, fromCourseId, newMasterCourse, opts)` — reused by ExchangeCourseModal
  - `buildChangeAuditEntry({customerId, kind, fromCourse, toCourse, refundAmount, reason, actor})` — extended to support `kind: 'cancel'`
- `src/lib/courseUtils.js`:
  - `parseQtyString(qtyStr)` — "remaining/total" → `{remaining, total, unit}` (note: `parseQtyString` returns object — use `.remaining` etc.)
- `src/lib/financeUtils.js` — `fmtMoney()` for currency display
- `src/utils.js` — `bangkokNow()` · `THAI_MONTHS` · `formatBangkokTime()`
- `src/components/DateField.jsx` — required for any date inputs
- `src/components/backend/ProductSelectField.jsx` — typeahead in ExchangeCourseModal
- `src/components/backend/reports/ReportShell.jsx` — wraps tab chrome (filter bar + body) per existing pattern
- `src/lib/csvExport.js` — `downloadCSV()` for export

---

## Pure helpers in `src/lib/remainingCourseUtils.js`

```js
/**
 * Flatten customers[].courses[] into row objects keyed for the table.
 * Each row: { customerId, customerHN, customerName, customerPhone,
 *             courseIndex, courseId, courseName, courseType, status,
 *             qtyTotal, qtyUsed, qtyRemaining, qtyUnit,
 *             purchaseDate, lastUsedDate, totalSpent }
 * Skips courses missing courseId (defensive — exchanged courses get a new id).
 * Status fallback: course.status || 'กำลังใช้งาน'.
 * Date fallback: course.createdAt || course.purchaseDate || customer.createdAt || ''.
 * Total spent: course.value parsed (e.g. "5000 บาท" → 5000) || 0.
 */
export function flattenCustomerCourses(customers): row[]

/**
 * Apply filter set: { search, status, courseType, hasRemainingOnly }.
 * - search: case-insensitive substring match on HN | name | phone | courseName
 * - status: '' (all) | one of ACTIVE_STATUS / USED_STATUS / REFUNDED_STATUS / CANCELLED_STATUS
 * - courseType: '' (all) | string match on row.courseType
 * - hasRemainingOnly: true → keep only rows where qtyRemaining > 0 AND status === 'กำลังใช้งาน'
 */
export function filterCourses(rows, filters): row[]

/**
 * Sort rows by key. Supported keys: 'purchaseDate' (default), 'lastUsedDate',
 * 'qtyRemaining', 'totalSpent', 'customerName' (Thai-locale).
 * dir: 'desc' (default) | 'asc'.
 */
export function sortCourses(rows, key, dir): row[]

/**
 * Aggregate stats for the filter result row set.
 * Returns: { totalRows, totalRemainingValue, customersWithRemaining, byStatus: {active, used, refunded, cancelled} }
 */
export function aggregateRemainingStats(rows): stats

/** Status enum constants — re-exported for filter dropdown + tests. */
export const STATUS_ACTIVE = 'กำลังใช้งาน';
export const STATUS_USED = 'ใช้หมดแล้ว';
export const STATUS_REFUNDED = 'คืนเงิน';
export const STATUS_CANCELLED = 'ยกเลิก';
export const ALL_STATUSES = [STATUS_ACTIVE, STATUS_USED, STATUS_REFUNDED, STATUS_CANCELLED];
```

## Extension to `src/lib/courseExchange.js`

```js
/**
 * Build the post-cancel customer.courses[] array.
 * - Marks source course as `status: 'ยกเลิก'`.
 * - Sets cancelledAt + cancelReason.
 * - Does NOT remove the course (audit trail integrity — same as refund).
 * - Throws if course not found OR already in terminal status (refunded/cancelled).
 */
export function applyCourseCancel(customer, courseId, opts = {}): { nextCourses, fromCourse, cancelledAt }

// buildChangeAuditEntry signature change:
//   kind must be 'exchange' | 'refund' | 'cancel'  (was just 'exchange'|'refund')
//   when kind === 'cancel': refundAmount stays null, toCourse stays null
```

## Backend wrapper in `src/lib/backendClient.js`

```js
/**
 * Soft-cancel a customer's course (no refund). Mirrors refundCustomerCourse.
 * Throws if customer/course missing or course already terminal.
 *
 * @param {string} customerId
 * @param {string} courseId
 * @param {string} reason - non-empty (UI must require)
 * @param {object} opts - { actor: string }
 * @returns {Promise<{ changeId, fromCourse, cancelledAt }>}
 */
export async function cancelCustomerCourse(customerId, courseId, reason, opts = {})
```

---

## UI shape

### `RemainingCourseTab.jsx`

```jsx
<ReportShell title="คอร์สคงเหลือ" icon={ClockIcon}>
  <FilterBar>
    <SearchInput placeholder="ค้นหา HN / ชื่อ / เบอร์ / คอร์ส" />
    <Select label="สถานะ" options={STATUS_OPTIONS_TH} default="" />
    <Select label="ประเภทคอร์ส" options={courseTypeOptions} default="" />
    <Toggle label="เฉพาะคงเหลือ" default={true} />
    <button>📥 Export CSV</button>
  </FilterBar>
  <Stats>{aggregateStats}</Stats>
  <Table>
    <Headers /> {/* 8 cols */}
    {rows.map(r => <RemainingCourseRow row={r} onAction={handleAction} />)}
  </Table>
  {empty && <EmptyState />}
</ReportShell>

<CancelCourseModal open={...} onClose={...} onSubmit={...} />
<RefundCourseModal open={...} onClose={...} onSubmit={...} />
<ExchangeCourseModal open={...} onClose={...} onSubmit={...} />
```

### `RemainingCourseRow.jsx`

```jsx
<tr>
  <td>{HN} {name}</td>
  <td>{courseName} <Badge>{courseType}</Badge></td>
  <td>{purchaseDate dd/mm/yyyy}</td>
  <td>{qtyTotal} / {qtyUsed} / {qtyRemaining}</td>
  <td>{fmtMoney(totalSpent)}</td>
  <td>{lastUsedDate dd/mm/yyyy or '-'}</td>
  <td><StatusBadge status={status} /></td>
  <td><KebabMenu disabled={isTerminal}>
    <Item onClick={() => onAction('cancel', row)}>ยกเลิก</Item>
    <Item onClick={() => onAction('refund', row)}>คืนเงิน</Item>
    <Item onClick={() => onAction('exchange', row)}>เปลี่ยนคอร์ส</Item>
  </KebabMenu></td>
</tr>
```

### Modal shape

All 3 modals share:
- Header: course summary (HN + name + course name)
- Reason textarea (required)
- Confirm button (disabled until reason filled + custom validation per modal)
- Error banner on action failure (Thai message)
- Loading state on submit

`CancelCourseModal`:
- Reason textarea + confirm → `cancelCustomerCourse(customerId, courseId, reason, {actor})`
- Confirms with: "คอร์สนี้จะถูกยกเลิกและไม่สามารถใช้งานได้อีก ยืนยันหรือไม่?"

`RefundCourseModal`:
- Refund amount input (number, required, > 0, ≤ total course value)
- Channel select (`wallet` / `cash` / `transfer` — display Thai labels)
- Reason textarea (required)
- Confirm → `refundCustomerCourse(customerId, courseId, refundAmount, {reason, actor, channel})`
  - Note: existing `refundCustomerCourse` may not accept `channel` opt — need to verify; may extend to accept it

`ExchangeCourseModal`:
- ProductSelectField (typeahead from `be_products` — but actually we want courses, so use `listCourses()` typeahead instead OR `ProductSelectField` configured for course mode — TBD during impl)
- Reason textarea (required)
- Confirm → `exchangeCourseProduct(customerId, courseIndex, newProduct, reason)`
  - Note: helper takes `courseIndex` not `courseId` — modal must derive index from row

---

## Default state

- `hasRemainingOnly = true`
- `status = ''`
- `courseType = ''`
- `search = ''`
- `branchId = useBranch().selectedBranchId`
- Sort: `purchaseDate desc`

## Error handling

- Empty result: "ไม่พบคอร์สคงเหลือ" + clear-filter button
- Modal action failure: try/catch → Thai error message in modal banner (V31 anti-silent-swallow)
- Status fallback: `course.status || 'กำลังใช้งาน'` for legacy courses
- Concurrent edit: backend `runTransaction` → modal shows result; UI re-fetches customer doc

---

## Testing strategy (Rule I — full-flow simulate at sub-phase end)

### Test files

1. **`tests/phase16.5-remaining-course-utils.test.js`** (~25)
   - F1 flattenCustomerCourses (8): empty in, single customer / single course, multi customers/courses, missing courseId skip, missing status fallback, Thai/empty edge, qty parse legacy shape, totalSpent parse from value
   - F2 filterCourses (7): empty filter passes-all, search HN/name/phone/courseName, status exact match, courseType match, hasRemainingOnly + status=active interaction, search Thai char, multi-filter AND
   - F3 sortCourses (5): purchaseDate desc default, lastUsedDate, qtyRemaining, totalSpent, customerName Thai locale
   - F4 aggregateRemainingStats (3): empty rows, mixed statuses, cancelled-not-counted-as-remaining
   - F5 status enum (2): all 4 strings exported, ALL_STATUSES array shape

2. **`tests/phase16.5-cancel-customer-course.test.js`** (~8)
   - C1 applyCourseCancel pure (4): valid cancel sets 'ยกเลิก' + cancelledAt + cancelReason; throws course-not-found; throws already-cancelled; throws already-refunded
   - C2 buildChangeAuditEntry kind:'cancel' (2): valid kind accepted; refundAmount stays null
   - C3 cancelCustomerCourse runTransaction (2): writes customer + audit doc; throws on customer-not-found

3. **`tests/phase16.5-remaining-course-modals.test.jsx`** (~15)
   - M1 CancelCourseModal (5): renders with course summary; reason required (button disabled); submit calls cancelCustomerCourse; error banner on failure; close calls onClose
   - M2 RefundCourseModal (5): renders + amount validation (>0, ≤ courseValue); channel required; submit calls refundCustomerCourse; error banner; close
   - M3 ExchangeCourseModal (5): renders + ProductSelectField typeahead; reason required; submit calls exchangeCourseProduct with courseIndex (not courseId); error banner; close

4. **`tests/phase16.5-remaining-course-flow-simulate.test.js`** (~10) — Rule I full-flow
   - FS1: 3 customers × 5 courses = 15 rows → flatten → filter (status=active, hasRemaining=true) → sort (purchaseDate desc) → assert row count + order
   - FS2: cancel a course → re-flatten same customer → row's status='ยกเลิก' + filtered out by hasRemaining
   - FS3: refund a course → re-flatten → status='คืนเงิน' + refundAmount field present
   - FS4: exchange → re-flatten → old course removed, new course present with status='กำลังใช้งาน'
   - FS5: legacy course missing status field → status fallback 'กำลังใช้งาน' applies
   - FS6: search "นา" matches Thai customer name
   - FS7: courseType filter works
   - FS8: empty branch → empty rows
   - FS9: branch-scope: customer in branch A invisible from branch B view
   - FS10: aggregateStats correct counts after each mutation

5. **`tests/phase16.5-source-grep.test.js`** (~10) — regression guards
   - G1: RemainingCourseTab.jsx imports useBranch from BranchContext
   - G2: ExchangeCourseModal.jsx imports ProductSelectField (Rule of 3 / Rule C1)
   - G3: All 3 modals have try/catch on submit (V31 anti-silent-swallow)
   - G4: navConfig has 'reports-remaining-course' entry
   - G5: BackendDashboard.jsx has lazy import + render case
   - G6: cancelCustomerCourse uses runTransaction (atomic write)
   - G7: applyCourseCancel does NOT remove course from array (preserves audit trail)
   - G8: status fallback `course.status || 'กำลังใช้งาน'` present in flattenCustomerCourses
   - G9: NO hardcoded English statuses ('active'/'cancelled'/'refunded') in this file set
   - G10: be_course_changes audit doc written on cancel (matches refund pattern)

### Runtime verification (Rule I item b — preview_eval against real Firestore)

When dev server live (post-implementation):
1. Open `http://localhost:5173/?tab=reports-remaining-course`
2. flattenCustomerCourses on real customers → assert non-zero row count + valid shape
3. Use `createTestCustomerId()` (V33.10) to spin up a TEST-prefixed customer with 1 course → run full cancel flow → verify `be_course_changes` doc written + customer.courses[0].status === 'ยกเลิก'
4. Cleanup TEST customer + audit docs

---

## Test budget

- Pure helpers: 25
- Backend cancel: 8
- Modal RTL: 15
- Full-flow simulate: 10
- Source-grep: 10
- **Total**: 68 (slightly over the 60 estimate due to backend helper tests)
- **3312 → 3380** projected.

---

## Out of scope (locked OFF)

- Pre-launch H-bis cleanup (per `feedback_no_prelaunch_cleanup_without_explicit_ask.md`)
- Materialized `be_remaining_courses` collection
- Branch=ALL toggle
- Bulk operations
- Mobile-specific redesign
- Modernizing `exchangeCourseProduct` (still writes `courseExchangeLog` array — not `be_course_changes`)
- Auto-deploy after commit (V18 — user authorizes per turn)

---

## Commit shape

```
feat(reports): Phase 16.5 — Remaining Course tab + cancelCustomerCourse + 3 action modals

NEW FILES:
  src/lib/remainingCourseUtils.js (5 pure helpers + status enum)
  src/components/backend/reports/RemainingCourseTab.jsx
  src/components/backend/reports/RemainingCourseRow.jsx
  src/components/backend/CancelCourseModal.jsx
  src/components/backend/RefundCourseModal.jsx
  src/components/backend/ExchangeCourseModal.jsx
  tests/phase16.5-remaining-course-utils.test.js
  tests/phase16.5-cancel-customer-course.test.js
  tests/phase16.5-remaining-course-modals.test.jsx
  tests/phase16.5-remaining-course-flow-simulate.test.js
  tests/phase16.5-source-grep.test.js
  docs/superpowers/specs/2026-04-29-phase16-5-remaining-course-design.md

MODIFIED:
  src/lib/courseExchange.js — applyCourseCancel + buildChangeAuditEntry kind:'cancel'
  src/lib/backendClient.js — cancelCustomerCourse runTransaction wrapper
  src/components/backend/nav/navConfig.js — reports-remaining-course nav entry
  src/pages/BackendDashboard.jsx — lazy import + render case

User approved scope via brainstorming (5 design dimensions) +
ExitPlanMode (full plan). 3 modals expose backend helpers
(refundCustomerCourse + exchangeCourseProduct from V32-tris-bis +
NEW cancelCustomerCourse) for the first time in the UI. Status enum
uses Thai strings (existing courseExchange.js convention).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```
