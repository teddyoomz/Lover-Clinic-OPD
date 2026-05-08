# V54 / BS-13 — Listener Safe-by-Default (AdminDashboard branch leak fix) — Design

> **Status:** Approved (user said "ทำเลย" — autonomous V52/V53-style execution)
> **Date:** 2026-05-08 EOD #8
> **Iron-clad triggers:** Rule J (debug → fix) · Rule P 7-step class-of-bug expansion · Rule N targeted tests · Rule I full-flow simulate · systematic-debugging skill (Phase 1-4)

---

## 1. Problem statement

User report (verbatim):
> "tab นัดหมายใน Frontend ยังไม่แยกดึงข้อมูลเป็นสาขาๆ"

= "the appointments tab in Frontend doesn't yet separate-fetch by branch."

**Surface identified**: `AdminDashboard.jsx` (the patient queue dashboard at `/admin` — Phase 1-7 admin "Frontend" page, distinct from BackendDashboard tabs). The Appointment Manager section uses `listenToAppointmentsByMonth` to render the queue calendar — and shows ALL branches' appointments regardless of top-right BranchSelector.

## 2. Root cause (3-layer V21 chain)

| Layer | File:line | Defect |
|---|---|---|
| 1. Comment-vs-code drift (V21) | `AdminDashboard.jsx:713-715` | Comment claims "scopedDataLayer wrapper resolves the current branch"; wrapper is plain passthrough |
| 2. Wrapper passthrough | `scopedDataLayer.js:307` | `listenToAppointmentsByMonth = (...args) => raw.listenToAppointmentsByMonth(...args)` — no auto-inject |
| 3. Safe-by-default-FAILED | `backendClient.js:2361` | `useFilter = undefined && !false` falsy → query = WHOLE `be_appointments` collection |

**Result**: AdminDashboard's queue calendar subscribes to ALL branches forever. Re-subscribe on `selectedBranchId` change is also `{}` opts → still all branches.

**Class-of-bug** (Rule P Step 2):
- V21 comment-vs-code drift family (comments promised behavior X, code did Y — V36-quater, V44 cluster)
- **NEW: "Raw listener safe-by-default-FAILED" sub-class** — the data layer falls back to whole-collection query when the branch-resolution chain produces falsy. The safe template exists (`listenToScheduleByDay`) but wasn't applied to siblings.

**Cross-file grep results** (Rule P Step 3):

- `listenToAppointmentsByMonth({})`: only AdminDashboard.jsx:711 (steady-state bug)
- `listenToAppointmentsByDate({branchId: ...})`: AppointmentCalendarView passes branchId explicitly — race-window only during initial-mount when localStorage cache empty (~ms)
- `getAppointmentsByMonth`/`getAppointmentsByDate` raw: covered via `_autoInjectPositional` in scopedDataLayer; direct backendClient callers exist in tests / clinicReportAggregator (passes `{allBranches: true}` — explicit, OK)
- `listenToAllSales` / `listenToExamRoomsByBranch` / `listenToHolidays`: no broken callers (verified via grep — only used through `useBranchAwareListener` hook)
- `listenToScheduleByDay`: already safe-by-default (line 10572+ in backendClient.js — the **template** to mirror)

## 3. Architecture decisions (locked)

### Decision 1 — Architectural backstop in `backendClient.js`

Apply the `listenToScheduleByDay` safe-by-default pattern to 4 sibling functions:

```js
// Canonical pattern (mirrors listenToScheduleByDay:10581-10588)
const effectiveBranchId = (typeof branchId === 'string' && branchId)
  ? branchId
  : (allBranches ? null : resolveSelectedBranchId());
if (!effectiveBranchId && !allBranches) {
  onChange?.([]); // listener: empty array
  return () => {}; // listener: noop unsubscribe
  // (or `return []` for getter variants)
}
```

Functions to update:
1. `listenToAppointmentsByMonth` — listener (line 2342+)
2. `listenToAppointmentsByDate` — listener (line 2278+)
3. `getAppointmentsByMonth` — getter (line 2188+)
4. `getAppointmentsByDate` — getter (line 2248+)

**Behavior change** (per call-site contract):
- Caller passes explicit `branchId: 'BR-X'` → filter by that branch (unchanged)
- Caller passes `branchId: null/undefined/empty` AND no `allBranches: true` → resolve via `resolveSelectedBranchId()` from localStorage; if still falsy → return empty (NEW — was: WHOLE collection)
- Caller passes `allBranches: true` → return whole collection (unchanged — explicit opt-in for cross-branch reports)
- Legacy positional listeners (callers passing `(date, onChange, onError)` no opts) → fallback to `resolveSelectedBranchId()`; safe-by-default empty when no branch resolved

### Decision 2 — Defense-in-depth at AdminDashboard

Even with backstop, AdminDashboard.jsx:716 should pass `{branchId: selectedBranchId}` explicitly (V52/BS-11 canonical pattern). Belt-and-suspenders: backstop catches anyone who forgets; explicit pattern is the documented contract.

### Decision 3 — NEW audit invariant BS-13

```
BS-13 — Raw listener safe-by-default discipline (V54, 2026-05-08)
       Every raw appointment/sale getter+listener in backendClient.js that
       reads from a branch-scoped collection MUST be safe-by-default:
       (a) When `branchId` opt is falsy AND `allBranches !== true` →
           resolve via `resolveSelectedBranchId()`. If STILL falsy →
           return empty array (getter) OR return empty + noop unsubscribe
           (listener). NEVER fall back to whole-collection query.
       (b) When `allBranches: true` is passed → cross-branch read is
           explicit opt-in (allowed for reports/aggregators).
       (c) The safe template is `listenToScheduleByDay` (line 10572+).
       Sanctioned exceptions: NONE — every listener following this rule.
```

7 sub-tests in `tests/audit-branch-scope.test.js` (BS-13.1..BS-13.7).

### Decision 4 — V-entry V54 (Tier 3 architectural)

This is V21-class architectural fix:
- Comment-vs-code drift (V21) repeated 3 layers deep at AdminDashboard
- Sibling listener (`listenToScheduleByDay`) had the safe template; siblings did not adopt it
- Architectural backstop closes the family permanently

V54 entry codifies the lesson + invariant.

## 4. Files to modify

### Source (2 files):
- `src/lib/backendClient.js` — 4 functions safe-by-default (mirror `listenToScheduleByDay`)
- `src/pages/AdminDashboard.jsx` — explicit `{branchId: selectedBranchId}` + comment fix

### Audit (2 files):
- `.agents/skills/audit-branch-scope/SKILL.md` — add BS-13 row
- `tests/audit-branch-scope.test.js` — extend with BS-13.x sub-tests

### Tests (2 new):
- `tests/v54-listener-safe-by-default.test.js` (Rule N) — 4 functions × 4 scenarios = 16 unit tests
- `tests/v54-admin-dashboard-branch-leak-flow.test.js` (Rule I) — full-flow simulate: BranchProvider switch → re-subscribe → no cross-branch leak

### Docs (4):
- `docs/superpowers/specs/2026-05-08-listener-safe-by-default-design.md` — THIS file
- `docs/superpowers/plans/2026-05-08-listener-safe-by-default.md` — implementation plan
- `.claude/rules/00-session-start.md` § 2 — V54 compact entry
- `.claude/rules/v-log-archive.md` — V54 verbose entry
- `SESSION_HANDOFF.md` + `.agents/active.md` — state update

## 5. Implementation order

1. backendClient.js 4 functions (foundation)
2. v54 unit tests (verify foundation)
3. AdminDashboard.jsx caller fix (defense-in-depth)
4. BS-13 audit invariant + tests
5. Rule I flow-simulate
6. Full vitest + build
7. Commit + push (NO deploy)
8. Docs update

## 6. Verify (acceptance criteria)

- `tests/v54-listener-safe-by-default.test.js` GREEN
- `tests/audit-branch-scope.test.js` GREEN (incl. new BS-13.x)
- `tests/v54-admin-dashboard-branch-leak-flow.test.js` GREEN
- Full `npm test -- --run` GREEN (no regressions in 7631 existing tests)
- `npm run build` clean
- Source-grep: every `listenToAppointmentsByMonth\|listenToAppointmentsByDate\|getAppointmentsByMonth\|getAppointmentsByDate` definition in backendClient.js contains `resolveSelectedBranchId` reference (proves safe-by-default applied)

## 7. Iron-clad rule trail

- Rule P 7-step class-of-bug expansion: Tier 2 (regression test + AVxx + classifier doc) + Tier 3 (V54 V-entry — architectural backstop in `00-session-start.md` § 2 + `v-log-archive.md`)
- Rule N targeted-test-only during iteration; full vitest at batch end
- Rule I full-flow simulate via BranchProvider chain
- Rule of 3: 4 victim functions in 1 file with single canonical pattern
- Rule V37: git add explicit files only
- NO DEPLOY this turn — local + commits only

---

**Approved**: User said "ทำเลย" (go ahead). Implementation begins immediately.
