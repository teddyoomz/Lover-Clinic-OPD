# V71 — OPD Lifecycle Badge on Frontend Appointment List + Service-Completed Sub-Tab + LINE/Status De-overlap

**Date**: 2026-05-15
**Status**: APPROVED (user: "Approve all ตาม Recommend")
**Surface**: `/admin` Frontend → tab `นัดหมาย` → view-mode `รายการ` (`<AppointmentHubView />`)
**Branch**: master (commits pending implementation)

---

## 1. Problem statement

The Frontend appointment list row currently shows time / customer / appt detail / status chip / action buttons. Two visual & functional gaps:

1. **No surface for OPD treatment lifecycle.** Staff scanning today's queue can't tell at-a-glance whether each patient has been vitals-checked, seen the doctor, or completed. The data exists (`be_treatments` for `customerId|date`), and `CustomerDetailView` already renders the canonical 3-dot stepper (`vitalsigns → doctor → completed`), but the appt list mirrors none of it.
2. **LINE badge overlaps the status chip.** The `AppointmentLineBadge` floats `absolute top-right` over the right-column status cluster, producing visual "ซ้อน".
3. **No clean way to remove a completed visit from today's active queue.** Staff conflate "today's queue" with "today's history" — no signal that a patient has finished and can be dismissed from the active view.

User quotes (verbatim):

> "ใน tab นัดหมายของ Frontend ในภาพที่ 1 ให้แสดง Badge สถานะของ OPD ล่าสุดของวันนั้นไว้ที่ list ของ Frontend ด้วย ย้ำว่าเอาอันล่าสุดของวันนั้นๆสาขานั้นๆมา Sync ก็คือที่ประกอบไปด้วย ซักประวัติ, แพทย์ลงบันทึก, เสร็จ ซึ่งก็คือเหมือนกันกับที่แสดงในหน้าข้อมูลลูกค้าในภาพที่ 2 เลย"

> "Badge แสดงการเชื่อมต่อ Line มันซ้อน ให้นายใช้ skill re design ... แบบความสวยงามชัดเจนใช้ง่ายระดับโลก"

> "เฉพาะ tab วันนี้ : ... เพิ่มปุ่ม ลูกค้ารับบริการเรียบร้อย เมื่อกด list ลูกค้าคนนั้น ก็จะย้ายไปอยู่ใน Tab ย่อย tab ใหม่ที่สร้างภายใต้ tab ย่อย วันนี้ อีกที"

---

## 2. Scope

In-scope (this V71):

- New full-width OPD lifecycle stepper row at the bottom of every `<AppointmentHubRowCard>` (visible per rules below).
- LINE badge inline inside the right-column cluster (no more `absolute top-right`).
- New `serviceCompletedAt: timestamp | null` field on `be_appointments`.
- New inline sub-pill bar that appears only when `activeTab === 'today'`, with `กำลังรอ` (default) + `เสร็จแล้ว` filter pills.
- New button `ลูกค้ารับบริการเรียบร้อย` visible only when (a) `activeTab === 'today'`, (b) `latestTreatment` exists, (c) `appt.serviceCompletedAt` is null.

Out-of-scope (future):

- Editing/un-completing a serviceCompletedAt write (admin-side rollback) — write-once for V71; admin can override via direct Firestore edit if needed.
- Cross-day stepper visibility (e.g. "yesterday's visit" badge on today's row).
- AppointmentHubView (other than the 3 changes above).
- Pre-launch H-bis cleanup of dev-only sync UI (deferred).

---

## 3. Design — Section 1: Layout

### 3.1 Stepper row (new, full-width)

A new row appended to the bottom of `<AppointmentHubRowCard>` containing the `<TreatmentLifecycleStepper>` component, spanning the full width of the card.

**Source**:
- `apptDateTreatments[0]` (already passed as prop; sorted by `createdAt` DESC by `AppointmentHubView`).
- `lifecycle = getTreatmentLifecycle(latestTreatment)` from `src/lib/treatmentDisplayResolvers.js`.

**Visibility rules**:

| Tab | latestTreatment present | Stepper state |
|---|---|---|
| `today` | yes | Full stepper with stage colors + timestamps. `isLatest={true}` for pulse on the pending-next dot. |
| `today` | no | Muted stepper (3 grey dots, no times, state `pending-future` for all). Signals "patient not checked in yet". |
| `tomorrow` | n/a | Stepper row absent (no treatment can exist for a future day). |
| `future` | n/a | Absent. |
| `past` | yes | Full stepper. Same as today/present. |
| `past` | no | Absent (no past treatment = no signal worth showing). |

**Reasoning**:

- Bottom full-width row gives the stepper its native 280px width without compressing the existing 3-column block.
- Matches `CustomerDetailView` Image-2 layout for staff who already learned the visual vocabulary in Phase 28.
- Muted state only on today's tab keeps signal density meaningful — staff care about "checked in or not" for active rows.

**Component extraction**: NEW `src/components/admin/AppointmentOpdStepperRow.jsx`:

```jsx
export default function AppointmentOpdStepperRow({ latestTreatment, isTodayTab }) {
  // Returns null when stepper shouldn't render
  // (no treatment AND not today, OR treatment but already-served signal handled by row caller).
  if (!latestTreatment && !isTodayTab) return null;
  const lifecycle = latestTreatment ? getTreatmentLifecycle(latestTreatment) : [];
  return (
    <div className="border-t border-[var(--bd)] mt-3 pt-3" data-testid="appt-row-opd-stepper">
      <div className="flex items-center gap-3">
        <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--tx-muted)] shrink-0">สถานะ OPD</span>
        <TreatmentLifecycleStepper lifecycle={lifecycle} isLatest={!!latestTreatment} />
      </div>
    </div>
  );
}
```

### 3.2 LINE badge — inline relocation

**Before** (`AppointmentHubView.jsx:420-425`):

```jsx
<div key={a.id} className="relative">
  <div className="absolute top-2 right-2 z-10 pointer-events-none">
    <AppointmentLineBadge appt={a} size="sm" />
  </div>
  <AppointmentHubRowCard appt={a} ... />
</div>
```

**After**:

- The `absolute` wrapper is removed.
- `AppointmentLineBadge` is rendered inline INSIDE `<AppointmentHubRowCard>` right column, at the top of the action cluster, BEFORE the `<span>` status chip.
- Order in right column: `[LINE chip (if present)] [Status chip] [button group]`.

```jsx
{/* RIGHT — Status + Actions */}
<div className="flex flex-col gap-2 items-start md:items-end justify-start md:min-w-[200px]">
  <div className="flex items-center gap-2 flex-wrap md:justify-end">
    <AppointmentLineBadge appt={appt} size="xs" />
    <span className={`text-[11px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${STATUS_CHIP_CLS[status]}`}>
      {statusLabel}
    </span>
  </div>
  ...
</div>
```

`AppointmentLineBadge` self-nullifies when `notifyChannel !== 'line'`, so its presence is harmless when the badge shouldn't render.

---

## 4. Design — Section 2: Service-completed button + sub-pill

### 4.1 New schema field

| Field | Type | Default | Writer | Reader |
|---|---|---|---|---|
| `be_appointments.<id>.serviceCompletedAt` | Firestore `Timestamp` | `null` | New admin handler (`markAppointmentServiceCompleted`) | `<AppointmentHubView>` filter |

Forensic stamps (per Rule M discipline, even though this is UI not migration):
- `serviceCompletedBy: string` (Firebase uid of staff who pressed the button)

No Firestore rule change — `be_appointments` already allows `isClinicStaff()` writes.

### 4.2 Button visibility logic

The "ลูกค้ารับบริการเรียบร้อย" button appears in the row's action button group, with this composite predicate:

```js
const showServiceCompleteBtn = (
  activeTab === 'today'         // only on today's tab
  && !appt.serviceCompletedAt    // not yet marked complete
  && !!latestTreatment           // treatment must exist (proves they've been treated)
);
```

Reason for gating on `latestTreatment`: prevents staff from prematurely dismissing a patient who hasn't been seen.

**Click flow**:

1. Click → `window.confirm('ยืนยันลูกค้าได้รับบริการเรียบร้อย? ลูกค้าจะถูกย้ายไปแท็บ "เสร็จแล้ว"')`
2. Optimistic update: `setAppts(prev => prev.map(a => a.id === appt.id ? { ...a, serviceCompletedAt: new Date(), serviceCompletedBy: <uid> } : a))`
3. Call `markAppointmentServiceCompleted(appt.id)` → `updateDoc(appointmentDoc(appt.id), { serviceCompletedAt: serverTimestamp(), serviceCompletedBy: auth.currentUser.uid })`
4. On error: revert + toast
5. Row visually moves to "เสร็จแล้ว" sub-pill on next render (filter picks up `serviceCompletedAt != null`)

### 4.3 Sub-pill bar component

NEW `src/components/admin/AppointmentHubTodaySubPillBar.jsx`:

Renders ONLY when `activeTab === 'today'`. Two pills:

```
[ กำลังรอ (N) ] [ เสร็จแล้ว (M) ]
```

- `กำลังรอ` (default): `appt.date === today && !appt.serviceCompletedAt`
- `เสร็จแล้ว`: `appt.date === today && !!appt.serviceCompletedAt`

Counts derived from `appts` array (already loaded).

State lifted into `AppointmentHubView`: `const [todaySubPill, setTodaySubPill] = useState('waiting')`. Reset to `'waiting'` whenever `activeTab` changes (so switching tomorrow → today snaps back to the default sub-pill).

### 4.4 Filter logic update

`src/lib/appointmentHubFilters.js → applyTabFilter` extended with optional `todaySubPill: 'waiting' | 'completed'` param. When `tab === 'today'`:
- `'waiting'` (default): existing today logic + `!appt.serviceCompletedAt`
- `'completed'`: existing today logic + `!!appt.serviceCompletedAt`

For `tab !== 'today'`, the param is ignored.

---

## 5. Design — Section 3: Schema + data flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    AppointmentHubView                            │
│                                                                  │
│  ┌──── existing useState/useMemo (unchanged) ────────────────┐  │
│  │  appts, summaryMap, allTreatments, treatmentsByCustDate    │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                  │
│  NEW: const [todaySubPill, setTodaySubPill] = useState('waiting')│
│  NEW: useEffect reset todaySubPill on activeTab change           │
│                                                                  │
│  NEW: counts.today.{waiting, completed} sub-counts               │
│                                                                  │
│  filteredAppts = applyTabFilter(appts, {                         │
│    tab: activeTab, todaySubPill, ...existing                     │
│  })                                                              │
│                                                                  │
│  Renders:                                                        │
│    <AppointmentHubTabBar />                                      │
│    NEW: {activeTab === 'today' && <TodaySubPillBar />}            │
│    <AppointmentHubFilterBar />                                   │
│    filteredAppts.map(a => (                                      │
│      <AppointmentHubRowCard                                      │
│        appt={a}                                                  │
│        apptDateTreatments={treatmentsByCustomerDate.get(...)}    │
│        isTodayTab={activeTab === 'today'}            NEW prop    │
│        onMarkServiceComplete={handleMarkServiceComplete} NEW prop│
│        ... existing props (LINE badge moves inside)              │
│      />                                                          │
│    ))                                                            │
└──────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────────┐
│              AppointmentHubRowCard                                │
│                                                                   │
│  ┌── LEFT: customer ────┐ ┌── MIDDLE: appt ───┐ ┌── RIGHT ────┐ │
│  │ HN, name, phone      │ │ time, dr/asst/    │ │ LINE chip   │ │
│  │ finance chips        │ │ room, purpose     │ │ Status chip │ │
│  │                      │ │                   │ │ button grp  │ │
│  └──────────────────────┘ └───────────────────┘ └─────────────┘ │
│                                                                   │
│  NEW row (full-width, bottom):                                    │
│  ┌── OPD STATUS ─ TreatmentLifecycleStepper ──────────────────┐ │
│  │  ⓥ (vitals) ──── ⓓ (doctor) ──── ⓒ (complete)            │ │
│  └────────────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────────────┘
```

### 5.1 Files changed

| File | Change type | Purpose |
|---|---|---|
| `src/components/admin/AppointmentHubView.jsx` | edit | sub-pill state, sub-pill component render, isTodayTab prop, onMarkServiceComplete handler, remove absolute LINE wrapper |
| `src/components/admin/AppointmentHubRowCard.jsx` | edit | add OPD stepper row, move LINE badge inline, add complete button, accept isTodayTab + onMarkServiceComplete props |
| `src/components/admin/AppointmentOpdStepperRow.jsx` | NEW | wrapper around `TreatmentLifecycleStepper` with empty-state handling |
| `src/components/admin/AppointmentHubTodaySubPillBar.jsx` | NEW | inline sub-pill bar for today tab |
| `src/lib/appointmentHubFilters.js` | edit | `applyTabFilter` accepts `todaySubPill` param; new `subPillCountsForToday` helper |
| `src/lib/backendClient.js` | edit | new `markAppointmentServiceCompleted(apptId, uid)` writer |
| `src/lib/scopedDataLayer.js` | edit | re-export `markAppointmentServiceCompleted` (universal — not branch-scoped) |
| `src/pages/AdminDashboard.jsx` | edit | wire `onMarkServiceComplete` handler |
| `tests/v71-opd-lifecycle-badge-frontend.test.jsx` | NEW | RTL tests for stepper rendering + visibility rules |
| `tests/v71-service-completed-sub-pill.test.jsx` | NEW | RTL tests for complete button + sub-pill filter |
| `tests/v71-line-badge-no-overlap.test.jsx` | NEW | regression: AppointmentLineBadge NOT inside absolute positioning in AppointmentHubView |
| `tests/v71-appointment-hub-flow-simulate.test.jsx` | NEW | Rule I full-flow simulate: load → render stepper → click complete → sub-pill filter |
| `tests/audit-anti-vibe-code.test.js` | edit | AV49 invariant — see §7 |
| `.agents/skills/audit-anti-vibe-code/SKILL.md` | edit | AV49 entry |

### 5.2 No deploy / no rules change

- Pure UI + 1 new schema field (no rule change since the parent path already allows clinic-staff writes).
- Rule M not triggered — no Firestore migration of existing data needed (legacy rows have `serviceCompletedAt: undefined ≈ null` → naturally treated as `'waiting'`).
- Rule B not triggered — no `firestore.rules` change.

---

## 6. Tests required

### 6.1 RTL unit/integration

| File | Tests | Coverage |
|---|---|---|
| `tests/v71-opd-lifecycle-badge-frontend.test.jsx` | S1.1–S1.8 | Stepper renders/hides per tab × treatment-present matrix |
| `tests/v71-service-completed-sub-pill.test.jsx` | S2.1–S2.7 | Sub-pill bar shows only on today tab; clicking complete button triggers confirm + optimistic update + filter move |
| `tests/v71-line-badge-no-overlap.test.jsx` | S3.1–S3.3 | LINE badge inline; no `absolute` wrapper in `AppointmentHubView` JSX |
| `tests/v71-appointment-hub-flow-simulate.test.jsx` | F1–F5 | Rule I full-flow: load treatments → render row → stepper visible → click complete → sub-pill filter + counts |

### 6.2 Source-grep regression

Inside `tests/v71-line-badge-no-overlap.test.jsx`:
- Assert `AppointmentHubView.jsx` does NOT contain `absolute top-2 right-2.*AppointmentLineBadge` pattern (regex grep)
- Assert `AppointmentHubRowCard.jsx` contains `<AppointmentLineBadge appt={appt}` inline import + usage

Inside `tests/v71-opd-lifecycle-badge-frontend.test.jsx`:
- Assert `AppointmentHubRowCard.jsx` imports `AppointmentOpdStepperRow`
- Assert `AppointmentOpdStepperRow` imports `TreatmentLifecycleStepper` from the Phase 28 path

### 6.3 Rule N verification

- Targeted: V71 4 test files
- Full vitest: at batch end (new components added)
- `npm run build`: clean (V11 lesson — new import resolution)

### 6.4 Rule Q verification

- **L1 (preferred)**: localhost:5173 → /admin → tab `นัดหมาย` → view `รายการ` → today tab — visually verify:
  1. Stepper row renders for rows with treatment
  2. Muted stepper for rows without treatment (today tab only)
  3. LINE badge no longer overlaps status chip
  4. "ลูกค้ารับบริการเรียบร้อย" button appears only when conditions met
  5. Clicking complete → confirm → row disappears → switch to "เสร็จแล้ว" sub-pill → row reappears
- **L2**: RTL render with real component tree + asserts on actual DOM output (4 test files above)

Mock-only test passes are NOT sufficient per Rule Q — RTL with real tree IS L2-acceptable. L1 dev-server review with user before claiming verified.

---

## 7. AV49 audit invariant (NEW)

**AV49 — Inline-badge discipline for appointment row cards**:

Every `<AppointmentLineBadge>` consumer in admin appt list surfaces (`src/components/admin/AppointmentHub*.jsx`, `src/pages/AdminDashboard.jsx` queue calendar) MUST render the badge inline as a sibling of other row chips — NOT inside an `absolute`-positioned wrapper that overlays the row's right column.

**Anchor**:
```js
// FORBIDDEN: absolute wrapping AppointmentLineBadge in admin appt-list code
const VIOLATION = /<div[^>]*className=["'][^"']*\babsolute\b[^"']*["'][^>]*>\s*[^<]*<AppointmentLineBadge/;
```

**Sanctioned exceptions**:
- Calendar grid micro-cells (`AdminDashboard.jsx:~7397` queue calendar) — badge sits inline, NOT inside absolute, already compliant.
- Recall view — no LINE badge expected.

Registered in `/audit-all` Tier 1.

---

## 8. Risk + mitigation

| Risk | Likelihood | Mitigation |
|---|---|---|
| Existing `treatmentsByCustomerDate` doesn't include legacy appts where customerId is null (walk-in) | medium | RowCard checks `!!latestTreatment` before reading lifecycle — null-safe |
| `getTreatmentLifecycle` shape changes break stepper | low | Helper is Phase 28-stable; AV49 test asserts import path |
| Stepper visual jitter on optimistic update | medium | Confirm dialog blocks the click before optimistic write; revert-on-error already pattern (V64-fix3) |
| Sub-pill state reset on tab change loses filter on F5 | low | Acceptable — staff use the page session-by-session; URL doesn't carry sub-pill state |
| Treatment count mismatch between sub-pill bar and filter | low | Both derived from same `appts` array via shared helper |

---

## 9. Verification gate — pre-commit

Per Rule N (new components) + Rule I (full-flow simulate):
- All V71 RTL tests GREEN
- Source-grep regression GREEN
- `npm run build` clean
- Full `npm test -- --run` GREEN at batch end
- Localhost dev-server visual review with user before claiming verified

Per Rule Q: RTL is L2-acceptable; localhost visual review is L1-equivalent for this layer (no LINE-app message rendering involved — purely web UI).

---

## 10. Out-of-scope (future)

- Undo / un-complete: V71 is write-once. If admin needs to rollback, edit Firestore directly.
- Multi-day stepper: "ดูสถานะ OPD ของวันอื่นๆ" — current scope only shows latest of that day.
- Stepper interaction (click dot to navigate to that stage) — V71 stepper is display-only.
- Auto-complete via treatment.status === 'completed' — user explicitly chose manual button to avoid premature auto-dismissal.

---

## Approval log

- 2026-05-15: User approved all 3 sections per recommendation ("Approve all ตาม Recommend").
