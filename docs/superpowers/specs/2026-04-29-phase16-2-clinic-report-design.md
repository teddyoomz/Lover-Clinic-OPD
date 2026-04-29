# Phase 16.2 — Clinic Report Tab Design

**Date**: 2026-04-29
**Brainstorming session**: 1783-1777441941
**Status**: Design approved by user · ready for `writing-plans` handoff
**Author trail**: 9 brainstorm Q&A → user approved consolidated proposal

---

## Context

Phase 15 closed (V15 #7 LIVE). Phase 16.3 (System Settings) shipped to prod (V15 #9). Phase 16.5 (Remaining Course) had design done previously. Per `project_phase16_plan.md` execution order, Phase 16.2 is the next sub-phase: **Clinic Report tab — read-only consolidator dashboard for clinic leadership**.

The clinic already has 13 detail report tabs + 11 aggregators in `src/lib/*Aggregator.js` covering revenue, customers, DF payout, P&L, payment summary, staff sales, sale, daily revenue, appointment analysis, appointment report, stock. What's missing is a **single executive dashboard** that surfaces the most important KPIs at a glance — currently leadership has to navigate 13 tabs to assemble that view manually.

**User constraint locked in this session** (paraphrased): "ห้ามเปลี่ยน wiring ของระบบเดิม — ใช้ได้ดีอยู่แล้ว. แค่ feature เสริมขึ้นมาค่อยมา wiring เพิ่ม". This design is **strictly additive** — zero edits to existing aggregators, zero edits to existing 13 detail report tabs, zero edits to existing chart components.

---

## Locked decisions (9 brainstorm answers)

| # | Question | Answer |
|---|---|---|
| Q1 | Primary audience | **Both** — clinic-wide exec view default + branch-filter drilldown |
| Q2 | KPI scope | **Comprehensive** (12 widgets — see § Widget catalogue) |
| Q3 | Layout pattern | **Sticky filter rail (sidebar) + scrollable widget grid** |
| Q4 | Date range control | **Smart presets + custom picker** — 7 preset buttons (วันนี้ / สัปดาห์นี้ / เดือนนี้ / ไตรมาสนี้ / YTD / 6 เดือน [default] / 12 เดือน) + custom range picker. Granularity (daily/weekly/monthly) auto-derived from selected range |
| Q5 | Permission gating | **NEW `report_clinic_summary` permission key** + **branch-scoped** via `branchIds[]` (admin sees all clinic; granted-non-admin sees only assigned branches) |
| Q6 | Export | **Both PDF + CSV** (sidebar buttons) |
| Q7 | Cache strategy | **Smart hybrid** — load on mount, manual 🔄 refresh button, auto-invalidate when filter changes; cache keyed on `{dateRange, branchIds, categories}` combo |
| Q8 | Drilldown depth | **Link to existing detail tabs** — each widget has "ดูรายละเอียด" / "ดูทั้งหมด" link that navigates to the relevant existing detail tab. Zero new modals. |
| Architecture | Data orchestration | **Approach A — NEW `clinicReportAggregator.js` orchestrator facade** that fans out via `Promise.all` to 8 reused aggregators + does cross-aggregator math (retention cohort) in one place. Single cache layer. Mirror existing aggregator pattern. |

---

## Widget catalogue (12 widgets)

Each widget reads from existing aggregators (no rewiring). Naming: KPI tile (single number) / Chart (line/bar/donut) / Ranked table.

| # | Widget | Type | Primary data source | Drilldown link |
|---|---|---|---|---|
| W1 | Revenue trend M-o-M | Chart (line) | `revenueAnalysisAggregator` | RevenueAnalysisTab |
| W2 | New customers M-o-M | Chart (bar) | `customerReportAggregator` | CustomerReportTab |
| W3 | Retention cohort heatmap | Chart (heatmap, NEW math) | cross: `be_sales` + `be_customers` | CRMInsightTab |
| W4 | Top-10 services | Ranked table | `saleReportAggregator` | SaleReportTab |
| W5 | Top-10 doctors | Ranked table | `staffSalesAggregator` | StaffSalesTab |
| W6 | Top-10 products | Ranked table | `stockReportAggregator` | StockReportTab |
| W7 | Branch comparison | Chart (grouped bar) | `be_sales` group-by `branchId` | (no specific tab — inline) |
| W8 | Cash flow (revenue − expense) | Chart (line) | `pnlReportAggregator` | PnLReportTab |
| W9 | Expense ratio % | KPI tile + sparkline | `pnlReportAggregator` | PnLReportTab |
| W10 | Appt fill rate (weekly) | Chart (bar) | `appointmentReportAggregator` | AppointmentReportTab |
| W11 | No-show rate | KPI tile + sparkline | `appointmentAnalysisAggregator` | AppointmentAnalysisTab |
| W12 | Course utilization % | KPI tile + ranked table | `be_customers[].courses[]` derive | RemainingCourseTab |

**Top-of-grid KPI tiles** (8 number-only summaries always visible above the charts):
- รายได้ YTD · M-o-M growth % · ลูกค้าใหม่/เดือน · Retention rate %
- Avg ticket · Course utilization % · No-show rate % · Expense ratio %

These tiles share data with widgets below — render-order: tiles → charts → ranked tables.

---

## Architecture

```
src/components/backend/reports/ClinicReportTab.jsx (NEW root tab)
    │  filter state: { dateRange, branchIds, categories }
    │  branch context: useSelectedBranch (existing)
    │  permission gate: useTabAccess (existing) checks 'report_clinic_summary'
    │
    ├─ ClinicReportSidebar.jsx (NEW)
    │      ├─ branch checkbox group (per branchIds[] gate)
    │      ├─ 7 preset date buttons + DateRangePicker.jsx (reused)
    │      ├─ category toggle pills (รายได้ / ลูกค้า / ปฏิบัติการ / สต็อค / สาขา)
    │      ├─ Export PDF button → documentPrintEngine.js (reused)
    │      ├─ Export CSV button → clinicReportCsv.js (NEW)
    │      └─ 🔄 manual refresh button
    │
    └─ useClinicReport(filter) (NEW hook in src/hooks/)
            │  internal: filter-combo cache map (in-memory, component lifetime)
            │  invalidate-on-filter-change semantics
            │
            └─ src/lib/clinicReportAggregator.js (NEW orchestrator)
                    │  pure: takes filter, returns Promise<ClinicReportSnapshot>
                    │
                    ├─ Promise.all([
                    │     revenueAnalysisAggregator(filter)    [reused]
                    │     customerReportAggregator(filter)     [reused]
                    │     saleReportAggregator(filter)         [reused]
                    │     staffSalesAggregator(filter)         [reused]
                    │     stockReportAggregator(filter)        [reused]
                    │     pnlReportAggregator(filter)          [reused]
                    │     appointmentReportAggregator(filter)  [reused]
                    │     appointmentAnalysisAggregator(filter)[reused]
                    │  ])
                    ├─ computeRetentionCohort(sales, customers, dateRange)  [NEW pure helper]
                    ├─ computeBranchComparison(sales, branchIds)            [NEW pure helper]
                    ├─ computeKpiTiles(...)                                  [NEW pure helper]
                    └─ merge + return → ClinicReportSnapshot
                          {
                            tiles: { revenueYtd, momGrowth, newCustomersPerMonth, retentionRate, avgTicket, courseUtil, noShowRate, expenseRatio },
                            charts: { revenueTrend, newCustomersTrend, retentionCohort, branchComparison, cashFlow, apptFillRate },
                            tables: { topServices, topDoctors, topProducts },
                            meta:   { generatedAt, filterApplied, branchScope }
                          }
```

**ClinicReportSnapshot** is a flat, JSON-serializable object — feeds widget partials directly + CSV export iterates its keys.

---

## Component breakdown

### NEW files (9 net + ~12 widget partials)

| File | LOC est. | Purpose |
|---|---|---|
| `src/lib/clinicReportAggregator.js` | ~300 | Orchestrator facade · Promise.all fan-out · cross-aggregator retention cohort + branch comparison math · returns `ClinicReportSnapshot` |
| `src/lib/clinicReportCsv.js` | ~80 | CSV builder per snapshot · one CSV section per widget category · UTF-8 BOM for Excel-compat Thai |
| `src/hooks/useClinicReport.js` | ~80 | Smart hybrid cache · filter-combo keyed Map · auto-invalidate via `useMemo` deps · exposes `{snapshot, loading, error, refresh}` |
| `src/components/backend/reports/ClinicReportTab.jsx` | ~120 | Root tab · sidebar + grid layout · permission gate · branch context | 
| `src/components/backend/reports/ClinicReportSidebar.jsx` | ~140 | Sticky filter rail · branch / preset / category / export / refresh |
| `src/components/backend/reports/widgets/KpiTile.jsx` | ~40 | Single-number tile · optional sparkline · click → drilldown |
| `src/components/backend/reports/widgets/RankedTableWidget.jsx` | ~60 | Top-10 list · numbered rows · ดูทั้งหมด link |
| `src/components/backend/reports/widgets/RetentionHeatmapWidget.jsx` | ~80 | Cohort heatmap · uses inline SVG (no library) |
| `src/components/backend/reports/widgets/BranchComparisonWidget.jsx` | ~60 | Grouped bar chart · uses FancyCharts.jsx (reused) |

Existing chart components (`FancyCharts`, `FancyDonut`, `ChartSection`) directly consumed by chart widgets that show standard line/bar series — no NEW chart wrapper for those (each widget partial = ~30 LOC of consumer-side rendering).

### Edits (3 small additive changes)

| File | Change | Reason |
|---|---|---|
| `src/lib/permissionGroupValidation.js` | Add `report_clinic_summary` to `ALL_PERMISSION_KEYS` under "รายงาน" group | Q5 — NEW permission key |
| `src/lib/tabPermissions.js` | Add `'clinic-report': { requires: ['report_clinic_summary'] }` to `TAB_PERMISSION_MAP` | Wire tab gate via existing `useTabAccess` hook |
| `src/components/backend/nav/navConfig.js` | Add `clinic-report` entry in reports section | Show in sidebar when access granted |
| `src/pages/BackendDashboard.jsx` | Lazy import + render case for `'clinic-report'` | Tab-shell pattern (matches Phase 16.3 ship) |

### Reused unchanged (per "ห้ามแตะ wiring เดิม")

- 11 existing aggregators in `src/lib/*Aggregator.js` (revenueAnalysis, customerReport, dfPayout, pnlReport, staffSales, saleReport, stockReport, appointmentReport, appointmentAnalysis, dailyRevenue, paymentSummary) — used as-is, called by orchestrator
- 13 existing detail report tabs — receive drilldown navigation from widgets, no edits
- `FancyCharts.jsx`, `FancyDonut.jsx`, `ChartSection.jsx` — chart rendering primitives, used by widget partials
- `ReportShell.jsx`, `DateRangePicker.jsx` — layout / picker primitives
- `documentPrintEngine.js` — PDF export pipeline (V32 patterns: html2canvas + jsPDF direct)
- `useTabAccess.js`, `useSystemConfig.js` — permission + config hooks (Phase 16.3 wiring stays untouched)

---

## Data flow

1. **Mount**: `ClinicReportTab` mounts → reads `useSelectedBranch` → gates on `useTabAccess('clinic-report')` → if denied, renders empty state with "ไม่มีสิทธิ์ดูรายงานคลินิก".
2. **Filter init**: default `dateRange = {start: today-180d, end: today}`, `branchIds = currentUser.branchIds[]` (or `['*']` if admin), `categories = ['revenue','customers','operations','stock','branch']`.
3. **First load**: `useClinicReport(filter)` fires. Hook checks cache for `cacheKey = JSON.stringify(filter)`. Miss → calls `clinicReportAggregator(filter)`.
4. **Aggregator fan-out**: `Promise.all` 8 reused aggregators. If any rejects → wraps with widget-level error (other widgets still render). After all settle → cross-aggregator math (retention cohort + branch comparison + KPI tiles) → returns `ClinicReportSnapshot`.
5. **Render**: snapshot drives widget partials. Charts use `FancyCharts.jsx`, tiles use `KpiTile.jsx`, tables use `RankedTableWidget.jsx`. Drilldown links use existing `onNavigate(tabId)` pattern.
6. **Filter change**: user toggles branch / preset / category → filter object identity changes → `useMemo` deps invalidate → cache miss → re-run aggregator → re-render.
7. **Manual refresh**: 🔄 button → hook clears its cache for current key → re-run aggregator (forced fresh).
8. **Export PDF**: button → `documentPrintEngine.exportDocumentToPdf` against the dashboard root DOM node → downloaded file. Uses V32 direct html2canvas+jsPDF pattern (no html2pdf.js, no pagebreak issues).
9. **Export CSV**: button → `clinicReportCsv.toCsv(snapshot)` → blob download. UTF-8 BOM for Excel.

---

## Permission gating

### Permission key

Add to `permissionGroupValidation.js` under "รายงาน" section (line ~213, alphabetically grouped with existing `report_*` keys that are currently defined but unwired — Phase 16.2 wires the first one):
```
{ key: 'report_clinic_summary',  label: 'รายงานคลินิก (ภาพรวมผู้บริหาร)' }
```

Naming follows the existing `report_*` snake_case convention from permissionGroupValidation.js (lines 175-213). Existing pattern: tabs gate on UNDERLYING module permissions (`reports-pnl` → `expense_view`, `reports-rfm` → `customer_view`, etc.). Clinic Report is multi-domain, so it gets a NEW dedicated key rather than requiring the union of 5 module permissions.

### Tab gate

In `tabPermissions.js` (line ~60, after `reports-pnl` entry):
```
'clinic-report': { requires: ['report_clinic_summary'] }
```

`useTabAccess` already supports `requires:[…]` resolution + Phase 16.3 `tabOverrides` (admin can per-tab override). Per Phase 16.3-bis fix on master (`ced094d`), tabOverrides are correctly forwarded through the consumer-hook layer.

### Branch scoping

Resolve at runtime:
- If `useTabAccess.isAdmin === true` → `effectiveBranchIds = branches.map(b => b.id)` (all branches)
- Else → `effectiveBranchIds = currentUser.branchIds[] ?? []` (per V20 multi-branch contract on `be_staff`)

Sidebar's branch checkbox group renders only `effectiveBranchIds`. Aggregator filter is clamped to `effectiveBranchIds ∩ selected` so a non-admin can't query a branch they don't own even by URL manipulation.

---

## Smart hybrid cache strategy

`useClinicReport(filter)` hook holds an in-memory `Map<cacheKey, snapshot>` for the component's lifetime.

- **cacheKey** = stable JSON serialization of `{dateRange, branchIds: [...sorted], categories: [...sorted]}`
- **On filter change**: `useMemo([filter])` recomputes; if cacheKey already in Map → return cached. Else → fire aggregator, store result.
- **On 🔄 refresh**: hook deletes current cacheKey from Map → triggers re-fetch.
- **No global cache** (intentional — rules out stale-shared-state bugs across tab switches). Cache lives only while the tab component is mounted.
- **Auto-invalidate on filter change** is FREE because filter is the dep; no manual TTL needed.

If aggregator promise rejects, hook stores `{error, partialSnapshot}` so widgets that succeeded still render with what they got.

---

## Export specifications

### PDF
- Trigger: sidebar "⬇ PDF" button.
- Pipeline: capture `<div ref={dashboardRoot}>` → `html2canvas` → `jsPDF.addImage` (V32 pattern, no html2pdf.js).
- Page size: A4 landscape (12-widget grid is wider than tall).
- Filename: `clinic-report-{YYYY-MM-DD}-{branchScopeLabel}.pdf`
- Header injected before render: clinic name + date range + branch scope + generated timestamp.

### CSV
- Trigger: sidebar "⬇ CSV" button.
- Format: UTF-8 with BOM (Excel-compat for Thai).
- Layout: one section per widget. Section header = widget title. Empty row between sections.
- Example:
  ```
  ﻿"Clinic Report — {dateRange} — {branchScope}"
  
  "W1 — Revenue trend M-o-M"
  "Month","Revenue (THB)"
  "2025-11","1234567"
  "2025-12","2345678"
  
  "W4 — Top-10 services"
  "Rank","Service","Revenue (THB)","Count"
  "1","ดริปผิวใส",2400000,142
  ...
  ```
- Filename: `clinic-report-{YYYY-MM-DD}-{branchScopeLabel}.csv`

---

## Drilldown wiring

Each widget exposes a "ดูทั้งหมด →" or "ดูรายละเอียด →" link (text varies per widget). Click handler:
```js
onNavigate(targetTabId)
```
Where `onNavigate` is the standard prop pattern matching `ReportsHomeTab` (already shipped). Mapping:

```js
const DRILLDOWN_MAP = {
  W1: 'reports-revenue',           // RevenueAnalysisTab
  W2: 'reports-customer',          // CustomerReportTab
  W3: 'reports-rfm',               // CRMInsightTab (RFM cohort closest)
  W4: 'reports-sale',              // SaleReportTab
  W5: 'reports-staff-sales',       // StaffSalesTab
  W6: 'reports-stock',             // StockReportTab
  W7: null,                        // branch comparison — inline only, no detail tab
  W8: 'reports-pnl',               // PnLReportTab
  W9: 'reports-pnl',               // same source
  W10: 'reports-appointment',      // AppointmentReportTab
  W11: 'reports-appt-analysis',    // AppointmentAnalysisTab
  W12: 'reports-remaining-course', // RemainingCourseTab (Phase 16.5)
};
```

W7 has no drilldown (branch comparison is the inline view). Widgets with `null` link omit the drilldown button.

---

## Error handling

- **Aggregator rejection**: wrap each aggregator promise in `.catch(err => ({error: err.message}))` so `Promise.all` always resolves. Widgets receiving an error slice render a small "ข้อมูล widget นี้โหลดไม่สำเร็จ — กดรีเฟรช" placeholder instead of crashing the entire dashboard.
- **Permission denied**: tab-level gate via `useTabAccess` returns falsy → render polite empty state, never crashes.
- **No data in range**: snapshot has all zeros → KPI tiles show "—", charts show empty-state dotted line, ranked tables show "ไม่มีข้อมูลในช่วงเวลานี้".
- **Branch list empty**: if non-admin user has zero `branchIds[]` (mis-configured), sidebar shows "บัญชีนี้ไม่มีสาขาที่เข้าถึงได้ — ติดต่อ admin" + dashboard renders empty state.
- **PDF export on empty data**: still allowed; PDF shows the empty placeholders. Don't block.
- **Aggregator timeout > 30s** (sanity): each aggregator wrapped with `Promise.race([fn(filter), timeout(30000)])`. Timeout → widget shows error slice.
- **firestore offline**: existing aggregators handle this (return cached / fail). Our orchestrator passes through errors per-aggregator.

---

## Testing strategy

**Target: +60 tests** distributed across the 9 new files.

| File | Tests | Type |
|---|---|---|
| `clinicReportAggregator.js` | ~25 | Unit: pure orchestrator math. Mock 8 aggregator outputs (use existing test fixtures from each detail tab's test bank) → assert merged snapshot shape. Adversarial: one aggregator throws, partial result still returned. Cross-aggregator: retention cohort math correctness on 6-month sales fixture. KPI tile math. Branch comparison group-by. |
| `clinicReportCsv.js` | ~10 | Pure CSV builder. UTF-8 BOM emitted. Per-widget section headers. Thai chars not garbled. Empty-data handles. Number formatting. |
| `useClinicReport.js` | ~10 | Hook test (renderHook). Cache hit / miss / invalidate-on-filter-change / refresh-clears-key. Concurrent filter change doesn't double-fire. |
| `ClinicReportTab.jsx` | ~5 | Render: tab gates correctly with/without permission. Branch scope respected. Drilldown link click fires `onNavigate` with correct tabId. |
| `ClinicReportSidebar.jsx` | ~5 | Render: 7 preset buttons. Custom picker opens. Branch checkboxes filtered by `effectiveBranchIds`. Refresh + export buttons fire correct handlers. |
| Widget partials | ~5 | Smoke: each widget renders given its data slice. Empty data → placeholder. Drilldown link present iff DRILLDOWN_MAP[id] !== null. |

**Full-flow simulate** (per Rule I — mandatory at sub-phase end): `tests/phase16.2-clinic-report-flow-simulate.test.js`. Chain:
1. Mount tab → permission gate passes
2. Default filter snapshot resolves
3. Change date preset → cache miss → re-fetch
4. Export PDF → mock html2canvas → assert blob created
5. Export CSV → assert UTF-8 BOM + section headers + Thai unmangled
6. Drilldown click → `onNavigate('reports-revenue')` called
7. Adversarial: one aggregator throws → other widgets still render
8. Branch toggle → snapshot includes/excludes correct sales

**Source-grep regression guards** (per Rule I item c):
- `clinicReportAggregator` source must not import `master_data/*` (per H-quater)
- `ClinicReportTab` must not import `brokerClient` or `/api/proclinic/*` (per Rule E)
- `useClinicReport` must NOT introduce `setInterval` polling (zero-polling guarantee)
- Drilldown handler must use existing `onNavigate` prop (no `window.location.assign`)

---

## What this is NOT

- **Not modifying any existing aggregator**. They are read-only dependencies.
- **Not adding new firestore collections**. All data comes from existing `be_*`.
- **Not changing firestore.rules**. No new collections, no new rule sections.
- **Not changing existing detail report tabs**. They are drilldown destinations, untouched.
- **Not introducing a chart library**. Reuse FancyCharts/FancyDonut/ChartSection (custom inline SVG).
- **Not real-time live data**. Smart hybrid cache means data refreshes on filter change or manual button.
- **Not multi-clinic capable**. Single-clinic, multi-branch only (matches V20 contract).
- **Not building Smart Audience (16.1)**. Audience-segment rule-builder is a separate sub-phase.

---

## Risks + mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| 8 parallel aggregator queries timeout / overload Firestore | Medium | High (blank dashboard) | Per-aggregator timeout (30s) + per-widget error slice; partial render OK |
| Retention cohort math complexity introduces bug | Medium | Medium (wrong number) | NEW pure helper `computeRetentionCohort` extensively unit-tested with adversarial fixtures (sparse data, single-customer cohorts, future-dated edge cases) |
| Branch-scoping bypass via URL/devtools | Low | High (data leak) | Aggregator filter clamped to `effectiveBranchIds ∩ selected` server-side intent; firestore.rules already gate `be_*` reads to clinic staff (existing) — non-admin can't query unauthorized branches even if they spoof the filter |
| PDF export blank pages (V32 regression class) | Low | Medium | Reuse V32 fix pattern: direct html2canvas+jsPDF (no html2pdf.js), no `pagebreak` config, single-page A4 landscape. V32 test bank already locks the pattern. |
| CSV Thai characters garbled in Excel | Low | Low | UTF-8 BOM prefix (﻿) — Excel auto-detects |
| Cache stale after backend mutation | Medium | Low | Manual 🔄 button covers it; users understand "refresh" semantics |
| Widget filter-state desync between sidebar and aggregator | Low | Medium | Single source of truth: `filter` state in tab; sidebar is controlled component; hook deps on `filter` |
| User confused by 12 widgets at once | Medium | Low | Category toggle pills let user hide whole groups; default visible = all 5 categories |

---

## Definition of done

- All 60+ tests pass (`npm test -- --run` clean)
- `npm run build` clean (no missing-export / dead-code warnings)
- Source-grep audits pass (no master_data reads, no brokerClient import, no setInterval)
- Phase 16.2 flow-simulate test passes
- Manual smoke on dev: load tab → see widgets → toggle branch → toggle preset → click drilldown → PDF download → CSV download
- No edits made to any of the 11 existing aggregators or 13 existing detail tabs
- CODEBASE_MAP.md updated with the 9 new files
- SESSION_HANDOFF.md updated with Phase 16.2 entry

---

## Out of scope (will NOT happen this sub-phase)

- Phase 16.1 Smart Audience tab (rule-builder) — separate sub-phase
- Phase 16.4 Order tab — closed-as-no-action this session per intel + parity audit
- Phase 16.7 Google Calendar — optional, deferred indefinitely
- Phase 16.8 `/audit-all` full-stack run — runs LAST after all 16.* tabs ship
- V15 #10 deploy of `ced094d` (Phase 16.3-bis) — separate user-triggered action
- Real-time / live-streaming dashboards (Firestore listeners) — explicit choice for cache-and-refresh pattern
- New Firestore collection / new firestore.rules section
- Any change to existing aggregators or detail report tabs
- New chart library installation
- Multi-clinic federation
- Email scheduling / report subscription / cron-based PDF generation

---

## Handoff

After user reviews this spec and gives approval, the brainstorming skill terminates by invoking `writing-plans` to produce an executable implementation plan with TDD checkpoints, file-by-file step ordering, and verification gates.
