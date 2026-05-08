# Appointment Coming-Hub View (V64) — Design Spec

**Date**: 2026-05-08
**Author**: Claude (brainstorming session, user-locked Qs)
**Status**: Approved — proceed to writing-plans

---

## 1. Context

User directive (verbatim):

> "ต่อไป เนรมิต tap นัดหมายใน frontend แต่ละสาขา ของเรา เพิ่มข้อมูลเหล่านี้ ข้างบนสุดของ tap นัดหมายของเรา เหมือน Proclinic ที่ส่งให้ดูในรูป เพื่อเป็นที่รวมนัดหมาย โดยมีทั้ง Tap วันนี้, พรุ่งนี้, ล่วงหน้า 30 วัน, ย้อนหลัง 30 วัน และ bubble แสดงว่าแต่ละวันมีกี่นัด และองค์ประกอบอื่นๆเหมือนเค้าเป๊ะๆ และใช้งานได้ทุกปุ่มเหมือนเค้าเป๊ะๆทุกสาขา ... แล้วเนรมิตมันขึ้นมาอย่างสุดความสามารถ พร้อมเทสการใช้งานจริงทุกรูปแบบ"

Source pages: `https://trial.proclinicth.com/admin/appointment/coming?tab={today,tomorrow,future,past}`.

The target page is the daily-work hub for the receptionist/admin: it shows
the list of appointments split into 4 windows (today, tomorrow, future, past)
with rich per-row context (customer ID + financial summary + appointment
detail + status-conditional actions) and a doctor/assistant working-hours
header at the top.

Triangle Rule scan complete:

- **Leg A (ProClinic)** — user-supplied screenshots show the 4-tab list
  layout with bubble counts, the "แพทย์เข้างาน N คน" header, the per-row
  customer card + appointment detail + status-conditional buttons, search +
  3 dropdown filters + 2 top-right buttons (พิมพ์ตารางนัดหมาย + เพิ่มคิว Walk-in).
- **Leg B (memory)** — V52..V63 schedule-link adoption-gap series
  (BSA + canonical-source patterns from `be_staff_schedules`); existing
  appointment helpers (`getAppointmentsByDateRange`, `listenToAppointmentsByMonth`,
  `appointmentReportAggregator.STATUS_LABELS`).
- **Leg C (our code)** — `AdminDashboard.jsx:6413` `adminMode === 'appointment'`
  block currently renders only the calendar grid; relevant state already
  available (`apptData.appointments`, `apptMonth`, `practitioners`,
  `branchExamRooms`, `useEffectiveClinicSettings`, V63 `canonicalDoctorDays`,
  `selectedBranchId` from `useSelectedBranch`).

## 2. Locked design questions

| # | Decision | Rationale |
|---|---|---|
| Q1 | **A** — list-first default; `[รายการ] [ปฏิทิน]` toggle pill at top of `adminMode==='appointment'` | ProClinic UX is list-first; calendar is supplementary planning view. Calendar still 1-click away. |
| Q2 | **B + D** — doctors row primary + assistants row below; on today/tomorrow tabs ONLY | We have richer staff schema than ProClinic; admin uses both. Header meaningless on 30-day range tabs. |
| Q3 | **C** — single-load aggregation map (~4 batched queries; O(1) lookup per card) | Performant for 120+ rows on past tab; matches ProClinic completeness. No N+1. |
| Q4 | **A** — smart per-tab defaults + auto-missed inference on past tab + dropdown override | Bubble counts reflect actionable rows; admin can broaden via dropdown. Missed-chip helps chase no-shows. |
| Q5 | **C** — jsPDF export matching ProClinic layout via `documentPrintEngine.js` | Polished print artifact for clinical use; admin already trusts our PDF templates. |

Per-row action button table accepted (per status; see § 6).

## 3. Architecture

### File tree

NEW (created):

```
src/lib/
  appointmentHubAggregator.js         pure aggregator (Q3=C single-load map)
  appointmentHubFilters.js            pure per-tab predicates + missed-inference (Q4=A)
  appointmentHubPrintTemplate.js      pure jsPDF layout (Q5=C)
src/components/admin/
  AppointmentHubView.jsx              orchestrator; loaders + tabs + cards
  AppointmentHubDoctorCards.jsx       Q2 header (today/tomorrow only)
  AppointmentHubTabBar.jsx            4 tab pills with bubble counts
  AppointmentHubFilterBar.jsx         search + 3 filter dropdowns + 2 buttons
  AppointmentHubRowCard.jsx           per-row card (customer + appt + status + actions)
tests/
  v64-appointment-hub-aggregator.test.js
  v64-appointment-hub-filters.test.js
  v64-appointment-hub-flow-simulate.test.js
  v64-appointment-hub-rtl.test.jsx
  v64-appointment-hub-pdf-template.test.js
```

MODIFIED:

```
src/pages/AdminDashboard.jsx          adminMode === 'appointment' branch: prepend toggle pill
                                      + render <AppointmentHubView/> when view === 'list';
                                      keep existing calendar block under view === 'calendar' guard.
```

### Composition rule

`AppointmentHubView` is a container. The 4 children
(`AppointmentHubDoctorCards`, `AppointmentHubTabBar`, `AppointmentHubFilterBar`,
`AppointmentHubRowCard`) are presentational. State (selected tab, search,
dropdown filters, view-toggle) lives in `AppointmentHubView`; mutations
(confirm / cancel / edit appointment / open TFP) call BACK into AdminDashboard
via props — `AppointmentHubView` does NOT introduce new mutation paths.

### Why this composition

1. **Isolation** — each child has one purpose, props are explicit, can be
   unit-tested independently.
2. **Reuse** — `AppointmentHubAggregator` + `AppointmentHubFilters` are pure
   ESM with no React; can power V2 features (e.g., reports drilldown) without
   re-implementation.
3. **AdminDashboard hygiene** — current file is 8000+ LOC; adding the hub view
   inline would push past 9000. Extracting children keeps the diff scoped.

## 4. Data layer (Q3=C single-load aggregation)

### Aggregator signature

```js
// src/lib/appointmentHubAggregator.js

/**
 * Build per-customer summary map from already-fetched lists.
 * Pure JS; no Firestore. All inputs come from scopedDataLayer.
 *
 * @param {Object} args
 * @param {Array}  args.customers   list of be_customers docs (branch-scoped)
 * @param {Array}  args.deposits    list of be_deposits docs (branch-scoped, status='active')
 * @param {Array}  args.sales       list of be_sales docs (branch-scoped)
 * @param {Array}  args.memberships list of be_memberships docs (universal — customer-attached)
 * @param {Array}  args.wallets     list of be_wallets docs (one per customerId)
 * @param {Date}   args.now         "now" reference for membership-days-remaining
 *
 * @return {Map<customerId, {
 *   hn, name, gender, phone, customerType,
 *   membershipTier,        // 'GOLD' | 'PLATINUM' | '' — from active membership
 *   membershipDaysLeft,    // integer, 0 if expired/none
 *   walletBalance,         // number (THB) — sum of wallet balance
 *   activeDepositTotal,    // number — sum(be_deposits.amount where status='active')
 *   outstandingTotal,      // number — sum(be_sales where paymentStatus !== 'paid' totalRemaining)
 *   lifetimeSaleTotal,     // number — sum(be_sales.totalAmount for this customer)
 * }>}
 */
export function buildCustomerSummaryMap(args) { ... }
```

### Loader strategy in `AppointmentHubView`

```js
// Inside AppointmentHubView.jsx
useEffect(() => {
  let cancelled = false;
  Promise.all([
    listAppointmentsByDateRange({ from: rangeFrom, to: rangeTo, branchId: selectedBranchId }),
    getAllCustomers(),                                          // universal — filter by branchId in mapper
    getAllDeposits({ branchId: selectedBranchId }),             // branch-scoped (existing)
    getAllSales({ branchId: selectedBranchId }),                // branch-scoped (existing)
    getAllMemberships(),                                        // universal — filter by customerId in mapper
    getWalletsForCustomerIds(visibleCustomerIds),               // NEW bulk helper (chunks of 30 via 'in' query)
  ]).then(([appts, customers, deposits, sales, memberships, wallets]) => {
    if (cancelled) return;
    setAppts(appts);
    setCustomerSummaryMap(buildCustomerSummaryMap({
      customers, deposits, sales, memberships, wallets, now: new Date(),
    }));
  });
  return () => { cancelled = true; };
}, [selectedBranchId, rangeFrom, rangeTo]);
```

### Range computation

`rangeFrom` / `rangeTo` derived from active tab via pure helper:

```js
// appointmentHubFilters.js
export function dateRangeForTab(tabKey, now = new Date()) {
  // Bangkok TZ stable midday-UTC parse — V53 BS-12 pattern
  const today = thaiTodayISO(now);
  const tomorrow = thaiYearMonthDay(addDays(now, 1));
  const todayMinus30 = thaiYearMonthDay(addDays(now, -30));
  const todayPlus30 = thaiYearMonthDay(addDays(now, 30));
  switch (tabKey) {
    case 'today':    return { from: today, to: today };
    case 'tomorrow': return { from: tomorrow, to: tomorrow };
    case 'future':   return { from: tomorrow, to: todayPlus30 };
    case 'past':     return { from: todayMinus30, to: addDays(now, -1) };
    default: throw new Error(`Unknown tab: ${tabKey}`);
  }
}
```

### NEW lib helpers (exactly two)

1. **`getAppointmentsByDateRange({ from, to, branchId, allBranches })`** in
   `backendClient.js` — V54 BS-13 safe-by-default pattern (mirror
   `getAppointmentsByMonth`'s post-V54 shape). Re-exported via
   `scopedDataLayer.js` to auto-inject `branchId`. Re-uses the
   `where('date','>=',from), where('date','<=',to)` query primitive.

2. **`getWalletsForCustomerIds(customerIds)`** in `backendClient.js` —
   bulk fetch keyed by customerId. Implementation: chunk customerIds into
   groups of ≤30 (Firestore `'in'` query cap), `Promise.all` per chunk
   `where(documentId, 'in', chunk)`, flatten. Universal (no branchId).
   Re-exported as universal pass-through via `scopedDataLayer.js`.

Existing helpers used unchanged: `getAllCustomers` (universal),
`getAllSales({branchId})` (branch-scoped), `getAllDeposits({branchId})`
(branch-scoped), `getAllMemberships` (universal),
`listStaffSchedules({branchId,staffId?})` (V63).

## 5. UI composition

### Top-level layout (inside `adminMode==='appointment'`)

```
┌────────────────────────────────────────────────────────────────────┐
│ [📋 รายการ] [📅 ปฏิทิน]  ← view-toggle pill                        │
├────────────────────────────────────────────────────────────────────┤
│ if view === 'list':                                                │
│   <AppointmentHubView selectedBranchId={...} />                    │
│ else:                                                              │
│   <existing calendar grid block (unchanged)>                       │
└────────────────────────────────────────────────────────────────────┘
```

### Inside `AppointmentHubView`

```
┌── นัดหมาย — แพทย์เข้างาน N คน ──────────────────────────────┐  (Q2: today/tomorrow only)
│  [Doctor Card]  [Doctor Card]  [Doctor Card]                │
├── ผู้ช่วยเข้างาน M คน ──────────────────────────────────────┤
│  [Asst Card]  [Asst Card]                                   │
├─────────────────────────────────────────────────────────────┤
│ [วันนี้ ①] [พรุ่งนี้ ①] [ล่วงหน้า 30 วัน ⑥] [ย้อนหลัง 30 วัน ⑱⑥] │  (Q4: bubble counts)
├── รายการนัดหมาย ลูกค้า N คน ───────────────────────────────┤
│ [search...]  [ประเภท▾] [สถานะ▾] [วัน▾]   [🖨 พิมพ์] [+ Walk-in] │
├─────────────────────────────────────────────────────────────┤
│ ┌── Row Card 1 ──────────────────────────────────────────┐  │
│ │ Customer (left)                  Appt detail (mid)     │  │
│ │ HN · name · gender             ที่ปรึกษา · แพทย์ · ...   │  │
│ │ phone                          เวลา · ห้องตรวจ · นัดมาเพื่อ│  │
│ │ [GOLD 340 วัน] [Wallet ฿]                              │  │
│ │ [มัดจำ ฿] [ค่างชำระ ฿] [ยอดสั่งซื้อ ฿]                  │  │
│ │                       [Status badge]    [Actions...]   │  │
│ └────────────────────────────────────────────────────────┘  │
│ ┌── Row Card 2 ────────────────────────────────────────── ┐ │
│ ...                                                         │
└─────────────────────────────────────────────────────────────┘
```

### Per-tab default filters (Q4=A)

| Tab | Default predicate |
|---|---|
| `today` | `date == thaiTodayISO()` AND `status !== 'cancelled'` |
| `tomorrow` | `date == thaiTomorrowISO()` AND `status !== 'cancelled'` |
| `future` | `today < date <= today+30` AND `status NOT IN ['done', 'cancelled']` |
| `past` | `today-30 <= date < today` (any status) — admin reviews full history |

`สถานะ` dropdown options: `ทุกสถานะ` (default per-tab) / `รอยืนยัน` / `ยืนยันแล้ว` / `เสร็จแล้ว` / `ยกเลิก`. Selecting overrides the default predicate.

### Auto-missed-chip on past tab (Q4=A)

For rows where `tab==='past' AND status==='confirmed' AND dateISO < todayISO`:
render a small red chip "ไม่มาตามนัด" between the status badge and the
action buttons. Pure inference — does NOT mutate the doc.

## 6. Action button wiring (Q5 accepted table)

Per-row buttons rendered conditionally on `(status, dateRelativeToToday)`:

| Status (computed) | Buttons | Wires to |
|---|---|---|
| `pending` | LINE · **คอนเฟิร์มนัด** · แก้ไขนัด · ยกเลิก | `updateAppointment(id, { status:'confirmed' })` / `setApptFormMode({mode:'edit', appointmentId:id})` / `updateAppointment(id, { status:'cancelled' })` |
| `confirmed AND date>=today` | **บันทึกการรักษา** · แก้ไขนัด · ยกเลิก | `setTreatmentFormMode({mode:'create', appointmentId, customerId})` / edit-modal / cancel |
| `confirmed AND date<today` (auto-missed) | **บันทึกการรักษา** · แก้ไขนัด · ยกเลิก + red "ไม่มาตามนัด" chip | same as above |
| `done` | **แก้ไขการรักษา** · ยกเลิก (hidden if linkedTreatment exists) | `setTreatmentFormMode({mode:'edit', treatmentId:appt.linkedTreatmentId})` ; fallback: บันทึก if no linked treatment |
| `cancelled` | (read-only, "ยกเลิกแล้ว" badge) | none |

LINE icon rendered IFF `customer.lineUserId` is set. Click opens
`https://line.me/R/oaMessage/<botBasicId>/?customer=${HN}` (customer chat
quick-link) — wires to existing pattern in `LinkLineQrModal.jsx`.

**Top bar buttons**:
- **🖨 พิมพ์ตารางนัดหมาย** — calls `exportAppointmentHubPdf({ tab, rows, doctors, assistants, branchName })` (NEW pure helper).
- **+ เพิ่มคิว Walk-in** — calls existing `setShowSessionModal(true)` (kiosk session creation).

All mutation handlers ALREADY EXIST in AdminDashboard — passed down as
props. NO new mutation logic introduced by V64.

## 7. Branch-scope alignment (BSA + V53/V54/V63 invariants)

- **All listers** routed through `scopedDataLayer.js` (Layer 2 auto-inject).
- **All onSnapshot listeners** for live data (top doctors-cards) wrapped in
  `useBranchAwareListener(...)` — re-subscribes on `selectedBranchId` change.
- **Cross-branch leakage**: NONE. Aggregator + filters are pure; no Firestore
  reads inside helpers. View component subscribes only to its own scope.
- **V53 BS-12 time-axis** — N/A here (no time slot grid in hub view).
- **V63 AV35 canonical doctor-days** — top doctors-cards derive from
  `be_staff_schedules` via existing `derivedDoctorDaysAcrossWindow` /
  `derivedDoctorWorkingHoursPerDate` helpers. NO admin manual paint.

## 8. PDF print (Q5=C)

`exportAppointmentHubPdf` in `appointmentHubPrintTemplate.js`:

1. Build a deterministic data-shape from current tab's filtered rows +
   doctors/assistants header + branch context.
2. Render to a hidden HTML container with print-friendly CSS (Thai font,
   tabular layout — see ProClinic screenshot 1 for visual reference).
3. Call `html2canvas` + `jsPDF.addImage()` directly (V32 lock — never
   `html2pdf` orchestration; explicit width × height to avoid blank-2nd-page
   bug).
4. Output filename: `appointments-{branchId}-{tab}-{thaiTodayISO}.pdf` where `branchId` is the canonical `be_branches` document ID (e.g. `BR-1777873556815-26df6480`); kept as-is rather than slugged to preserve forensic trail in admin file systems.
5. Pure-helper layer is unit-tested independently of canvas/PDF rendering.

Design intentionally reuses the V32 lessons (direct html2canvas + jsPDF,
position-absolute alignment for any underlines).

## 9. Testing strategy

### Unit (Vitest)

- `v64-appointment-hub-aggregator.test.js`
  - U1: empty inputs → empty Map
  - U2: single customer, multi-deposit → sum amounts
  - U3: membership days-remaining with `expiresAt` vs `now`
  - U4: outstanding sum filtering by paymentStatus
  - U5: lifetimeSaleTotal across multiple sales
  - U6: branch-blind invariant (toString.grep no `branchId` reference)
  - U7: adversarial — null/undefined/wrong-type inputs / Thai-fullwidth IDs
  - U8: idempotent re-run (same inputs → same output, deep-equal)

- `v64-appointment-hub-filters.test.js`
  - F1: per-tab `dateRangeForTab` returns correct from/to
  - F2: missed-inference predicate (status==='confirmed' AND date<today)
  - F3: status-dropdown override predicate
  - F4: search-text predicate matches HN / name / phone (case-insensitive)
  - F5: type-dropdown filter
  - F6: V12 multi-reader-sweep regression — no callsite uses raw status string outside enum
  - F7: Bangkok TZ stable midday-UTC parse (mirror V53)
  - F8: adversarial — empty rows / null status / future-dated past-tab data

- `v64-appointment-hub-pdf-template.test.js`
  - P1: pure-helper builds correct row-data shape
  - P2: thai font + bangkok date format
  - P3: empty-list edge case
  - P4: V32 lock — no html2pdf import; explicit dimensions

### Integration / RTL

- `v64-appointment-hub-rtl.test.jsx`
  - R1: render + 4 tabs + bubble counts match prop data
  - R2: tab click → `setActiveTab(tab)` + range recompute
  - R3: doctors+assistants header renders ONLY on today/tomorrow
  - R4: per-row click on "คอนเฟิร์มนัด" → mock `updateAppointment` called with `{status:'confirmed'}`
  - R5: per-row click on "บันทึกการรักษา" → mock `setTreatmentFormMode({mode:'create', appointmentId, customerId})`
  - R6: per-row click on "ยกเลิก" → confirm dialog → mock `updateAppointment({status:'cancelled'})`
  - R7: missed-chip renders only on past tab + status==='confirmed'
  - R8: status-dropdown override changes filtered rows
  - R9: branch-switch → loaders re-fire with new branchId

### Rule I full-flow simulate

- `v64-appointment-hub-flow-simulate.test.js`
  - F1: BranchProvider with 2 branches → switch B → loaders re-fire with new args
  - F2: search input "0655..." filters to matching phone → click confirm → mock called with right id
  - F3: lifecycle — A→B→A round-trip; selected tab + search RESET on branch switch (simpler; matches Phase 17.0 BS-9 reset-on-branch-switch pattern; admin starts fresh per branch)
  - F4: PRE-fix bug repro doc — render with stale `apptData` then assert NEW data after re-load
  - F5: source-grep regression — `import` from `scopedDataLayer.js`, NOT raw `backendClient.js`
  - F6: V64 marker comments present at all key sites (BS-1..BS-15 + V64 invariant audit)

## 10. Out of scope (V2 deferrals)

- **Bulk actions** (multi-select rows + bulk-confirm/cancel) — V2.
- **Advanced filters** (filter by doctor, by assistant, by appt-type combo)
  — search bar + dropdowns suffice for V1.
- **Appointment count badge in admin nav button** (cumulative for today's
  appts) — V2 polish.
- **LINE bulk-broadcast** — already covered by chat panel; not part of hub view.

## 11. Audit invariant

NEW source-grep regression in `tests/audit-branch-scope.test.js`:

- **BS-16** — `src/components/admin/AppointmentHub*.jsx` MUST import from
  `scopedDataLayer.js` (not raw `backendClient.js`); MUST subscribe
  `useSelectedBranch`; MUST include `selectedBranchId` in all data-loading
  hook deps. Sanctioned exceptions: NONE.

NEW source-grep regression in `tests/audit-anti-vibe-code.test.js`:

- **AV36** — `appointmentHubPrintTemplate.js` MUST NOT import `html2pdf`;
  MUST use `html2canvas` + `jsPDF.addImage` directly with explicit width ×
  height (V32 lock). Pure-helper unit-testable without canvas.

## 12. Acceptance criteria

- [ ] `adminMode==='appointment'` shows the hub list view by default.
- [ ] `[ปฏิทิน]` toggle pill renders the existing calendar block unchanged.
- [ ] All 4 tabs render correct bubble counts (sourced from filtered rows).
- [ ] Doctors + assistants header renders on today/tomorrow only; sourced
      from canonical `be_staff_schedules`.
- [ ] Per-row card shows HN, name, gender, phone, membership chip, wallet,
      มัดจำ, ค่างชำระ, ยอดสั่งซื้อ — all from single-load aggregator.
- [ ] All 5 status flows have correct buttons + correct mutations.
- [ ] Branch switch fully re-loads (all 6 batched queries) + clears stale
      data; no cross-branch leak.
- [ ] PDF print produces correct one-page output (V32 lock — no blank
      page).
- [ ] All NEW tests green (vitest); audit-branch-scope BS-16 green;
      audit-anti-vibe-code AV36 green.
- [ ] Rule I full-flow simulate green (branch switch + tab switch + button
      wiring).
- [ ] Build clean (`npm run build`).
- [ ] No console errors on dev server (preview_eval).

## 13. Outstanding before proceed

NONE — all design Qs locked, references to canonical patterns explicit,
NEW lib helpers limited to ONE (`listAppointmentsByDateRange`).

---

**Next step**: invoke `writing-plans` skill to produce the implementation
plan as `docs/superpowers/plans/2026-05-08-appointment-coming-hub.md`.
