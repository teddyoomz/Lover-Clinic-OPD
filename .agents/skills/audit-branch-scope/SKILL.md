---
name: audit-branch-scope
description: "Audit Branch-Scope Architecture (BSA) invariants — UI must import only from scopedDataLayer (not backendClient direct), no master_data/* reads in feature code (Rule H-quater), every branch-scoped listener wired through useBranchAwareListener, writers preserve _resolveBranchIdForWrite stamps, report tabs respect top-right BranchSelector (BS-11), TIME_SLOTS readers derive visible slots via getVisibleTimeSlotsForDate (BS-12), raw appointment listeners safe-by-default (BS-13), schedule-link modal data sources branch-scoped (BS-14), doctor schedule room-assignment integrity (BS-15). Grep-checks 15 invariants and reports violations as a punch list. Use after any change to backendClient.js, scopedDataLayer.js, BranchSelector wiring, AdminDashboard schedule-link modal, or ScheduleEntryFormModal/TodaysDoctorsPanel room-assignment wiring; before releases; as part of /audit-all Tier 1."
user-invocable: true
argument-hint: "[--quick | --full]"
allowed-tools: "Read, Grep, Glob, Bash"
---

# Audit Branch-Scope Architecture — LoverClinic

**Purpose**: Catch drift in the BSA layered architecture before it reaches users. The Branch-Scope Architecture (BSA, shipped 2026-05-04) is a 3-layer split:

- **Layer 1**: `src/lib/backendClient.js` — raw Firestore access. Every writer stamps `branchId` via `_resolveBranchIdForWrite`. Every branch-scoped lister filters via `{ branchId }`. Universal listers (Staff, Doctors, Branches, Audiences, MembershipTypes) ignore branchId.
- **Layer 2**: `src/lib/scopedDataLayer.js` — wraps Layer 1, auto-injects the active `branchId` from `BranchContext`. UI components import from here, NOT from backendClient directly.
- **Layer 3**: `src/hooks/useBranchAwareListener.js` — re-subscribes to listenTo* automatically when branch switches.

This audit guards the seams between layers. Drift = stale data showing across branches, listeners stuck on old branch, writers losing their branchId stamp.

## Scope — 15 invariants (BS-1..BS-15)

| ID | Rule | Pattern |
|---|---|---|
| BS-1 | UI components import from `scopedDataLayer.js`, not `backendClient.js` direct | `git grep -nE "from ['\"](\\.\\./)+lib/backendClient" -- src/components/ src/pages/ src/hooks/ src/contexts/` minus annotated whitelist |
| BS-2 | No `master_data/*` collection reads in feature code (Rule H-quater) | `git grep -nE "['\"]master_data/" -- src/components/ src/pages/ src/lib/` minus MasterDataTab + migrators + scopedDataLayer + backendClient legacy lookups |
| BS-3 | `getAllMasterDataItems` not used in UI feature code (BSA Task 7 lock) | `git grep -nE "getAllMasterDataItems\\(" -- src/components/ src/pages/ src/hooks/ src/contexts/` minus MasterDataTab |
| BS-4 | Branch-scoped `listenTo*` either wrapped in `useBranchAwareListener` OR annotated `// audit-branch-scope: listener-direct` | grep direct calls; verify file uses hook or has annotation |
| BS-5 | Every Firestore collection classified in `tests/branch-collection-coverage.test.js` `COLLECTION_MATRIX` | sanity check the test file exists + has the matrix |
| BS-6 | `tests/branch-scope-flow-simulate.test.js` exists and runs (Task 10 will populate) | soft-pass until Task 10 ships |
| BS-7 | `scopedDataLayer.js` universal re-exports point to `raw.X` (no `_scoped` wrap, no branchId injection) | spot-check the 6 known universal exports remain raw |
| BS-8 | Phase BS V2 + BSA Task 1-2 writers preserve `_resolveBranchIdForWrite` stamps | grep count ≥17 lines in `backendClient.js` |
| BS-9 | Branch-switch refresh discipline — every backend tab importing branch-scoped lister from `scopedDataLayer.js` MUST also subscribe `useSelectedBranch` + include `selectedBranchId` in data-loading hook deps. Sanctioned exception: tabs using `useBranchAwareListener` — annotate `// audit-branch-scope: BS-9 listener-driven`. Phase 17.0 / 2026-05-05 | grep tabs that import scopedDataLayer; verify file imports `useSelectedBranch` or has the BS-9 annotation |
| **BS-11** | **Report-tab branch-refresh discipline** — every file in `src/components/backend/reports/**/*Tab.jsx` that calls a `load*` from `reportsLoaders.js` MUST either subscribe `useSelectedBranch` + pass `branchId` to loader + include `selectedBranchId` in the data-loading useEffect/useCallback deps array, OR be annotated `// audit-branch-scope: BS-11 in-page-selector` (sanctioned: `ExpenseReportTab.jsx`, `ClinicReportTab.jsx` only) OR `// audit-branch-scope: BS-11 navigation-only` (sanctioned: `ReportsHomeTab.jsx` only). V52 / 2026-05-08 | grep tabs that import reportsLoaders; verify file imports `useSelectedBranch` or has BS-11 annotation |
| **BS-12** | **Time-axis branch-aware discipline** — every component importing `TIME_SLOTS` from `staffScheduleValidation.js` AND rendering it via `.map()` MUST also import `getVisibleTimeSlotsForDate` from `scheduleFilterUtils.js` to derive visible slots, AND read `useEffectiveClinicSettings` so the time-axis re-renders on branch switch. Sanctioned exception: `TimeSelect24.jsx` (pure 24-hour HH/MM picker for editing settings — uses local `HOURS`/`MINUTES` constants, NOT `TIME_SLOTS`, so doesn't trip this rule). V53 / 2026-05-08 | grep `TIME_SLOTS\\.map` callers; verify file also imports `getVisibleTimeSlotsForDate` |
| **BS-13** | **Raw listener+getter safe-by-default discipline** — every raw appointment/sale getter+listener in `backendClient.js` that reads from a branch-scoped collection MUST be safe-by-default: when `branchId` opt is falsy AND `allBranches !== true` → resolve via `resolveSelectedBranchId()`. If STILL falsy → return empty (getter returns `{}` or `[]`; listener fires `onChange([])` + returns noop unsubscribe). NEVER fall back to whole-collection query unless `allBranches: true` is explicit. Safe template: `listenToScheduleByDay` (line 10572+ in backendClient.js). Sanctioned exceptions: NONE — every listener follows this pattern. V54 / 2026-05-08 | grep `getAppointmentsByMonth\|getAppointmentsByDate\|listenToAppointmentsByMonth\|listenToAppointmentsByDate` definitions; verify each contains `resolveSelectedBranchId` reference |
| **BS-14** | **Schedule-link modal data sources branch-scoped** — AdminDashboard.jsx schedule-link modal ("สร้างลิงก์ตาราง") MUST source data per-branch: (a) `livePractitioners` filtered via `filterDoctorsByBranch + filterStaffByBranch` with `selectedBranchId` in useEffect deps; (b) exam rooms loaded via `listExamRooms({branchId, status:'ใช้งาน'})` into a `branchExamRooms` state — NOT direct `clinicSettings.rooms` reads; (c) clinic open hours via per-branch helpers (`monFriOpen/Close + satSunOpen/Close`) which derive from V51 `cs.openHoursMonFri/SatSun` (via `useEffectiveClinicSettings`); legacy `clinicSettings.{clinicOpen,clinicClose,doctorStart,doctorEnd}Time*` direct reads NOT allowed outside the V55 helper fallback chains. Defensive: `schedSelectedDoctor`/`schedSelectedRoom` reset to null on branch switch when previously-picked id isn't in new branch's set. Sanctioned exceptions: NONE — every site goes through the V55 helpers. V55 / 2026-05-08 | grep `clinicSettings\.(rooms|clinicOpenTime\|...)` in `src/pages/AdminDashboard.jsx`; verify only inside `monFriOpen/Close + satSunOpen/Close` helper memos |
| **BS-15** | **Doctor schedule room-assignment integrity** — `validateStaffScheduleStrict` in `staffScheduleValidation.js` MUST enforce SS-10 (doctor + working type → roomIds required, min 1) and SS-11 (assistant → roomIds forbidden). `ScheduleEntryFormModal` MUST gate room-checkbox UI to `staffKind === 'doctor' && showTime` and pass `staffKind` into `validateStaffScheduleStrict`. `TodaysDoctorsPanel` MUST import `expandRoomIdsForDisplay` and render per-doctor room chips. `AdminDashboard.handleGenScheduleLink` MUST import `derivedAutoClosedDates`, union into `closedDaysUnion`, and write `closedDays: closedDaysUnion`. Sanctioned exceptions: NONE. V56 / 2026-05-08 | grep SS-10/SS-11 in `staffScheduleValidation.js`; grep `staffKind` prop in `ScheduleEntryFormModal`; grep `expandRoomIdsForDisplay` in `TodaysDoctorsPanel`; grep `derivedAutoClosedDates + closedDaysUnion` in `AdminDashboard.jsx` |

## How to run

1. `npm test -- --run tests/audit-branch-scope.test.js` — automated regression bank for all 15 invariants
2. For interactive investigation, run grep recipes from [patterns.md](patterns.md) and read surrounding code
3. Decide severity per violation:
   - **PASS**: invariant holds across all paths
   - **WARN**: holds in happy path, fragile to add-a-new-import
   - **VIOLATION**: drift confirmed → branch switching demonstrably broken

## Annotation comments (sanctioned exceptions)

Add a file-header comment when a file legitimately must import directly. The audit reads file content — annotation must be in the file (any line works; convention is in the top 30-line comment block).

| Comment | Meaning | When to use |
|---|---|---|
| `// audit-branch-scope: report — uses {allBranches:true} for cross-branch aggregation` | **DEPRECATED** by V52 (2026-05-08) — report tabs are now branch-scoped. Reserved for future cross-branch dashboards (none currently). | reserved |
| `// audit-branch-scope: BS-11 in-page-selector` | Report tab has its own multi-branch checkbox UI, allowed cross-branch reads via aggregator | ExpenseReportTab.jsx, ClinicReportTab.jsx ONLY |
| `// audit-branch-scope: BS-11 navigation-only` | Report tab is a navigation-only landing page (no data load) | ReportsHomeTab.jsx ONLY |
| `// audit-branch-scope: BS-9 listener-driven` | Tab uses `useBranchAwareListener` (auto-handles re-subscribe + deps) | tabs whose data-load is fully driven by branch-aware listeners (Phase 17.0) |
| `// audit-branch-scope: listener-direct — <fn> uses positional args incompatible with hook` | Direct `listenTo*` import is intentional (positional-args contract incompatible with `useBranchAwareListener`) | AppointmentTab (listenToAppointmentsByDate, listenToScheduleByDay) |
| `// audit-branch-scope: sanctioned exception — Rule H-bis dev-only sync` | MasterDataTab dev-only sync UI | MasterDataTab.jsx ONLY |
| `// audit-branch-scope: sanctioned exception — root composition / mixed scope` | BackendDashboard root composition imports a small slice of backendClient | BackendDashboard.jsx ONLY |
| `// audit-branch-scope: BS-2 OR-field` | Marketing/global collections that branch-spread via `allBranches:true` doc-level field | reserved for future cross-branch features |
| `// audit-branch-scope: BS-3 dev-only` | `getAllMasterDataItems` callsite that legitimately needs dev-only sync data | reserved — currently no callsite outside MasterDataTab |

## Arguments

- `--quick` — BS-1, BS-3, BS-4, BS-8, BS-14, BS-15 (6 highest-risk, most-likely-to-regress)
- `--full` — all 15 (default; takes < 2s)

## Output

Single markdown punch list to chat. Do NOT write to disk.

```
# audit-branch-scope report — <YYYY-MM-DD HH:MM>

## Summary
- Total invariants: 15
- ✅ PASS: <count>
- ⚠️ WARN: <count>
- ❌ VIOLATION: <count>

## Violations
- BS-X (file:line) — <expected> / <actual> / <fix-hint>

## Notes
- BS-6: <pending|ok>
- Build: <clean|fail>
```

## Domain rationale

**Why this audit matters**: BSA was shipped to fix the V20 multi-branch silent-stale problem (Phase 15). The architecture's correctness depends on UI never bypassing the scoped layer, every writer stamping branchId, every listener resubscribing on switch. Each violation is invisible until a user switches branch and sees stale data — by which point the bug has shipped.

**Why source-grep-only is enough here**: Unlike money/stock invariants (which need runtime preview_eval per Rule I), BSA invariants are static-analyzable. The `branchId` field's presence in writes is a structural fact. Listener wiring is a structural fact. master_data/* reads are a structural fact. We don't need to run the code to verify — we just need to grep and confirm the seams hold. (Runtime branch-switch verification belongs to BS-6 / Task 10's flow-simulate test.)

**Why annotations beat allowlists**: A hardcoded file-list whitelist drifts. A file moves, gets renamed, gets split — the audit list goes stale and either gates a sanctioned import or stops gating a real one. Annotation comments ride with the file. If the import survives a refactor that removes the legitimate cross-branch use case, the annotation visibly remains and reviewers can challenge it.

## Companion files

- [patterns.md](patterns.md) — concrete grep recipes (Bash + PowerShell) per invariant
- `tests/audit-branch-scope.test.js` — automated source-grep regression bank (drift catcher)

## Registration

Registered in `/audit-all` Tier 1 (release-blocking).
