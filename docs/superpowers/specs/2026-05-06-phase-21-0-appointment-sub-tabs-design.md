# Phase 21.0 — Appointment Sub-Tabs (4 types as left-sidebar entries) + Deposit-Booking Pair Atomicity

> Date: 2026-05-06
> Status: Locked (user pre-approved including spec review per "approve และ approve review ด้วย")
> Brainstorm session: this conversation (see `.agents/sessions/...`)

## Why

User directive (verbatim, 2026-05-06):

> ในหน้า backend tab ทางซ้าย ให้ย้ายนัดหมายลงมาจาก tab บนสุด ให้มาเป็น tab เหมือนกันกับเมนูอื่นๆ แล้วแตกเมนูย่อยออกมาเป็น
> -นัดหมาย
>   * จองไม่มัดจำ
>   * จองมัดจำ
>   * คิวรอทำหัตถการ
>   * คิวติดตามอาการ
> โดยแยกแต่ละประเภทของการนัดหมายของสาขานั้นๆ ไว้ในหน้านั้นๆในเมนูด้านบน ส่วนการจองมัดจำ จะมีการบันทึกลงไปในหน้าการเงิน ในส่วนของมัดจำของสาขานั้นๆด้วย
> ทำแล้วเทสด้วยว่าแสดงจริงในแต่ละ tab ย่อยของสาขา และแสดงแบบแยกสาขากันแล้วยังถูกอยู่ การนัดหมายลงสาขาไหน ประเภทไหนต้องแสดงลงหน้า tab ย่อยนั้นๆของสาขานั้นๆ ได้ถูกต้อง

Two problems Phase 21.0 closes:

1. **Nav UX gap.** AppointmentTab today is a single calendar grid showing ALL 4 appointment types (no per-type filter UI). The 4 types exist in `be_appointments.appointmentType` field (Phase 19.0 SSOT) but admins can't slice the calendar by type without scanning chips. Surfacing each type as a left-sidebar entry restructures discovery: "ดูคิวรอทำหัตถการของสาขาพระราม 3" is one click.

2. **Deposit-booking visibility gap (data-shape bug).** Today `DepositPanel.handleSave` calls `createDeposit(payload)` with `appointment` as a NESTED FIELD. It does NOT write a separate `be_appointments` doc. `AppointmentTab` reads `be_appointments` via `listenToAppointmentsByDate` → deposit-bookings created from Finance.มัดจำ DO NOT appear in any appointment grid today. Phase 21.0 must close this gap — both writers (DepositPanel + AppointmentFormModal-with-locked-deposit-type) MUST atomically write paired (`be_deposits` + `be_appointments`) docs via a single `writeBatch`.

3. **Migration safety**. Per user directive "ฝาก migration แบบ pull env ลงมาแล้ว รัน script ไปจัดระเบียบ Data ใน firebase ... ป้องกันข้อมูลไปอยู่ในสิ่งที่ลบไปแล้ว แล้วจะ error และตกค้างในระบบ" — Phase 21.0 ships a Rule M migration script that (a) re-stamps any orphan `appointmentType` values to the safe default `'no-deposit-booking'`, and (b) backfills `be_appointments` docs for existing `be_deposits` with `hasAppointment=true` so they appear in the new `จองมัดจำ` sub-tab.

## What — final scope

### A. Nav restructure (`navConfig.js`)

```js
// REMOVE:
PINNED_ITEMS = [
  { id: 'appointments', label: 'นัดหมาย', ... },  // ← deleted
];
PINNED_ITEMS = [];  // pinned section now empty (kept as exported empty array for ABI parity)

// ADD a new section to NAV_SECTIONS, between PINNED and 'customers':
NAV_SECTIONS = [
  {
    id: 'appointments-section',
    label: 'นัดหมาย',
    icon: CalendarDays,
    items: [
      { id: 'appointment-no-deposit',   label: 'จองไม่มัดจำ',     icon: CalendarDays, color: 'sky',     palette: 'appointment booking no-deposit จองไม่มัดจำ จอง schedule' },
      { id: 'appointment-deposit',      label: 'จองมัดจำ',       icon: CalendarCheck, color: 'emerald', palette: 'appointment booking deposit จองมัดจำ deposit-booking มัดจำ' },
      { id: 'appointment-treatment-in', label: 'คิวรอทำหัตถการ', icon: Stethoscope,   color: 'sky',     palette: 'appointment treatment-in queue คิว ทำหัตถการ procedure' },
      { id: 'appointment-follow-up',    label: 'คิวติดตามอาการ', icon: Activity,      color: 'amber',   palette: 'appointment follow-up queue คิว ติดตาม อาการ' },
    ],
  },
  // ...rest unchanged (customers / sales / stock / finance / marketing / reports / master)
];
```

The new section sits at index 0 (between pinned and customers). All other sections preserve their order.

`ALL_ITEM_IDS` whitelist auto-extends since it derives from sections.

### B. AppointmentCalendarView (rename + parameterize from AppointmentTab.jsx)

`src/components/backend/AppointmentTab.jsx` is renamed to `src/components/backend/AppointmentCalendarView.jsx`. New required prop:

```jsx
<AppointmentCalendarView
  appointmentType="no-deposit-booking" | "deposit-booking" | "treatment-in" | "follow-up"
  clinicSettings={...}
  theme={...}
/>
```

Inside the component:
- `dayAppts` listener (`listenToAppointmentsByDate`) is unchanged. It receives ALL types for the date+branch.
- A new pure derivation `dayApptsTyped` filters `dayAppts` by `appointmentType` using `migrateLegacyAppointmentType()` resolver (defense-in-depth — coerces unknown stale values to the safe default so they show up in `จองไม่มัดจำ` rather than orphaning).
- All grid/cell rendering reads from `dayApptsTyped`.
- `monthAppts` (mini-calendar dot map) ALSO filters by type so the dots correctly indicate "this date has appointments of THIS type".
- The "+ เพิ่มนัดหมาย" button passes the locked type as `lockedAppointmentType` prop to the modal (see C below).

Hooks (BSA): `selectedBranchId` and `appointmentType` BOTH appear in deps array of every `useEffect` / `useCallback` that loads appointments. Branch switch + type switch both trigger re-fetch.

Component label rendered above the calendar grid: "{Thai nav label} — {Thai date}" so the admin sees which sub-tab they're on.

### C. AppointmentFormModal — `lockedAppointmentType` prop

NEW prop: `lockedAppointmentType` (string | null). When set:
- Type radio row is hidden.
- A read-only chip renders: `ประเภทนัดหมาย: <Thai label>` with the SSOT-resolved label.
- Save payload forces `appointmentType = lockedAppointmentType`.

When `lockedAppointmentType === 'deposit-booking'`:
- Modal renders a dedicated banner: `"การจองมัดจำต้องสร้างผ่านหน้าการเงิน → มัดจำ ของสาขานั้นๆ. กดปุ่มด้านล่างเพื่อไปยังฟอร์มมัดจำ พร้อมข้อมูลลูกค้านี้."`
- Save button is HIDDEN.
- Replaced with a "ไปสร้างมัดจำ" button that navigates: `?tab=finance&subtab=deposit&action=create-with-customer={customerId}`. The Finance tab + DepositPanel hydrate from this query param to auto-open the create-deposit form with that customer pre-selected. (Actual auto-hydration is a small enhancement to FinanceTab's existing `initialSubTab` plumbing — implementation detail.)

Rationale: keeps DepositPanel as the SOLE writer for deposit-bookings. Single writer = no V12 multi-writer drift. AppointmentFormModal stays for the OTHER 3 types.

When `lockedAppointmentType` is omitted (existing callers like CustomerDetailView), the modal behaves exactly as today (admin picks any of 4 types from radio).

### D. NEW `src/lib/appointmentDepositBatch.js`

Pure helper module — single source of truth for the paired (`be_deposits` + `be_appointments`) write. Used by DepositPanel (today's only entry point); future callers could route through this too.

```js
/**
 * Atomically create a paired deposit + deposit-booking appointment.
 *
 * Inputs:
 *   depositData: same shape DepositPanel.handleSave currently builds for createDeposit
 *                (must include hasAppointment=true + appointment field with
 *                date / startTime / endTime / doctorId / etc.).
 *   branchId:    selectedBranchId from useSelectedBranch context (stamped on both docs).
 *
 * Output:
 *   { depositId, appointmentId } — both committed atomically via writeBatch.
 *
 * Cross-link fields:
 *   be_deposits doc:    linkedAppointmentId = appointmentId
 *   be_appointments doc: linkedDepositId = depositId
 *                        appointmentType = 'deposit-booking' (SSOT-locked)
 *                        branchId = same as deposit
 *
 * Failure: throws on validation / transaction error. Both writes either land
 * together or neither lands (Firestore writeBatch atomicity).
 *
 * Idempotency: NOT idempotent (each call mints a fresh DEP-{ts} + BA-{ts}).
 *              Caller is responsible for not re-submitting a saved form.
 */
export async function createDepositBookingPair({ depositData, branchId }) { ... }

/**
 * Atomically cancel both docs of a paired deposit-booking.
 * Used by DepositPanel.handleCancel when dep.linkedAppointmentId is set.
 *
 * If the deposit has no linkedAppointmentId (legacy, no paired appt yet),
 * falls back to plain cancelDeposit (the existing single-doc path).
 */
export async function cancelDepositBookingPair(depositId, { cancelNote, cancelEvidenceUrl }) { ... }
```

Implementation notes:
- Uses Firestore client SDK `writeBatch(db)` — same db handle as backendClient.
- `appointmentId = 'BA-{ts}-{2-char-suffix}'`, `depositId = 'DEP-{ts}'` (Phase 19.0 + existing pattern).
- Branch stamp uses the same helper as DepositPanel today (`_resolveBranchIdForWrite` mirror, but executed at the helper level so both docs receive the same branchId).
- AP1-bis slot reservation is NOT exercised by this path. Deposit-bookings are scheduled via a different UX (deposit form with separate appt fields) and historically didn't go through the AP1-bis slot guard. To preserve behavior, this helper writes the appointment doc directly without slot-reservation. Trade-off acknowledged: a deposit-booking that overlaps a doctor's existing appointment will not be blocked by AP1-bis at this entry. The DepositPanel UI still has its own collision check via `existingAppointments` prop (best-effort soft check). Future: route deposit-bookings through the same AP1-bis transaction. Tracked as Phase 21.0-bis-future.

### E. DepositPanel.jsx wiring

The save handler at line 284 (`handleSave`) is updated:

- When `hasAppointment === true` and creating (not editing): call `createDepositBookingPair({ depositData: payload, branchId: selectedBranchId })` instead of `createDeposit(payload)`.
- When `hasAppointment === false`: call `createDeposit(payload)` as today.
- Edit-mode is unchanged (no appointment doc spawn — edit only touches the deposit doc; if the deposit had a linkedAppointmentId from create-time, it stays linked).
- Cancel handler (`handleCancel`): if `dep.linkedAppointmentId` is set, call `cancelDepositBookingPair(...)`. Else fall back to `cancelDeposit(...)`.
- Delete + refund handlers UNCHANGED (these don't affect the appointment doc — refund is a deposit-only action; delete is rare admin-only and removes only the deposit, leaving the appointment as a documentation artifact).

`getAllDeposits` reader is unchanged — still pulls deposits for the Finance.มัดจำ list view.

`useSelectedBranch` already imported in DepositPanel (per BSA).

### F. BackendDashboard.jsx routing

Three changes:

1. **URL hydration** (line 147 area): when `tab === 'appointments'` (legacy URL), redirect to `appointment-no-deposit`. Mirrors existing whitelist check; if `tab` is in the new 4-tab id set, hydrate as-is.

2. **Tab cases**: replace the existing `} else if (activeTab === 'appointments') { ... }` block (line 427) with 4 separate case branches, each rendering `<AppointmentCalendarView appointmentType="..."/>`. Each case sets `if (viewingCustomer) { setActiveTab('customers'); }` to preserve existing escape-from-customer-detail behavior.

3. **Fallback** (line 162): change the canAccess fallback array from `['appointments', ...]` → `['appointment-no-deposit', ...]` so a permission-blocked admin lands on the most-frequent appointment view.

4. **Lazy import**: AppointmentCalendarView is imported eagerly today's AppointmentTab is. No code-split change in this phase (lightweight component).

### G. Migration script `scripts/phase-21-0-migrate-appointment-types-strict.mjs`

Two-phase migration in a single script. Both phases are idempotent and emit a single audit doc.

**Phase 21.0a — Strict appointmentType stamp** (defensive cleanup of any orphan):
- Scan ALL `be_appointments` docs across all branches.
- For each: if `appointmentType` is NOT in `['no-deposit-booking', 'deposit-booking', 'treatment-in', 'follow-up']` (covers null / missing / legacy stragglers post-Phase 19.0), stamp `'no-deposit-booking'`.
- Forensic trail: `appointmentTypeMigratedAt = serverTimestamp()`, `appointmentTypeLegacyValue = <prior>`.

**Phase 21.0b — Backfill be_appointments from be_deposits**:
- Scan ALL `be_deposits` docs where `hasAppointment === true` AND `status !== 'cancelled'` AND `linkedAppointmentId` is NOT already set.
- For each, build a `be_appointments` doc using the embedded `appointment` field on the deposit + cross-link fields:
  - `appointmentType = 'deposit-booking'`
  - `linkedDepositId = depositId`
  - `branchId = deposit.branchId` (or coerced from customer if deposit lacks branch)
  - `customerId / customerName / customerHN` copied from deposit
  - `date / startTime / endTime / doctorId / doctorName / assistantIds / assistantNames / roomId / roomName / channel / appointmentTo / lineNotify / appointmentColor` copied from `deposit.appointment`
  - `status = 'pending'` (default)
- Update the deposit with `linkedAppointmentId = newAppointmentId`.
- Forensic trail on appointment: `spawnedFromDepositId = depositId`, `spawnedAt = serverTimestamp()`.

**Idempotency**:
- Phase 21.0a: re-runs find docs already in the 4-set → skip.
- Phase 21.0b: re-runs find deposits where `linkedAppointmentId` is already set → skip.

**Audit doc** at `be_admin_audit/phase-21-0-strict-and-backfill-{ts}-{rand}`:
```js
{
  phase: '21.0',
  op: 'strict-appointment-type + backfill-deposit-bookings',
  scanned: { appts: N, deposits: M },
  migratedA: K,    // stamped no-deposit-booking
  spawnedB: L,     // be_appointments docs backfilled
  skipped:  Q,
  beforeDistribution: { appts: {...}, deposits: {...} },
  afterDistribution:  { appts: {...}, deposits: {...} },
  appliedAt: serverTimestamp(),
}
```

CLI: `--dry-run` (default), `--apply` to commit. PEM-key `\n` conversion + canonical `artifacts/{APP_ID}/public/data/...` path + invocation guard mirror Phase 19.0 / Phase 20.0 templates verbatim.

### H. Test bank (Rule K work-first-test-last batch)

8 NEW test files:

1. `tests/phase-21-0-nav-config-appointment-section.test.js` — Section structure, 4 items, IDs match canonical, `ALL_ITEM_IDS` extends correctly, `ITEM_LOOKUP` resolves all 4, old `'appointments'` pinned id is NOT in `ALL_ITEM_IDS`, section count assertions for sibling tests.
2. `tests/phase-21-0-appointment-calendar-view-typed.test.jsx` — Component renders only docs matching prop, branch-filter intact, defense-in-depth coercion of unknown types to `'no-deposit-booking'`, type prop in deps for `useEffect` (BS-9 lock), 4-instance render-test with mock data verifies isolation.
3. `tests/phase-21-0-appointment-form-modal-locked-type.test.jsx` — `lockedAppointmentType` prop hides type radio, payload forces type, deposit-booking lock shows "ไปสร้างมัดจำ" button + hides save, navigation URL contains `?tab=finance&subtab=deposit&action=create-with-customer={customerId}`. Existing callers without the prop see today's behavior unchanged.
4. `tests/phase-21-0-deposit-booking-pair-helper.test.js` — `createDepositBookingPair` mocks `writeBatch`, asserts both docs queued + cross-link fields + branch stamps. `cancelDepositBookingPair` ditto + fallback for legacy deposits.
5. `tests/phase-21-0-deposit-panel-pair-wiring.test.jsx` — DepositPanel save handler routes to `createDepositBookingPair` when `hasAppointment=true`; routes to `createDeposit` when false. Source-grep regression guard locks the import + call shape.
6. `tests/phase-21-0-tab-redirect.test.js` — Old `?tab=appointments` triggers redirect to `appointment-no-deposit`. ALL_ITEM_IDS whitelist test. Fallback array uses new ids.
7. `tests/phase-21-0-strict-and-backfill-migration.test.js` — Migration script unit tests: `mapAppointmentType` defaults; `buildBackfillAppointmentDoc` shape; idempotency check (re-running yields 0); audit-doc shape with both phase counters; forensic-trail field naming.
8. `tests/phase-21-0-flow-simulate.test.js` — **Rule I full-flow simulate**: mock 2 branches × 4 types × N appointments; assert each sub-tab × branch combination shows ONLY the right appointments. Adversarial: legacy type, missing type, branchId mismatch, deposit-with-appointment.

### I. Acceptance gate — preview_eval per-branch × per-type

Mandatory final step before marking complete (user verbatim requirement):

1. Start dev server (vite already installed — npm install completed).
2. Use admin SDK with TEST-prefixed fixtures (V33.13 + V33.14 prefixes — `TEST-APPT-*` + `TEST-DEPOSIT-*`):
   - For each pair `(branchA, branchB)` × `(no-deposit-booking, deposit-booking, treatment-in, follow-up)`:
     - Write a fixture appointment via firebase-admin with that branchId + type
3. Open the page in the preview browser. For each branch in selector × each sub-tab nav entry:
   - Navigate to that sub-tab.
   - Use `preview_eval` to read the rendered appointment list (DOM query for `[data-testid="appt-grid-customer-link"]` or equivalent, count + match against fixtures).
   - Assert: ONLY appointments of the matching `(branch, type)` combination appear. No leakage from sibling sub-tabs or sibling branches.
4. Verify deposit-booking sub-tab specifically:
   - Pre-condition: the migration script Phase 21.0b should have spawned be_appointments docs for any backfill-eligible deposits. After acceptance gate, a TEST-DEPOSIT- + TEST-APPT- pair (created via the new pair helper) should appear in BOTH the จองมัดจำ sub-tab AND the Finance.มัดจำ tab.
5. Cleanup: `firebase-admin` deletes ALL `TEST-APPT-*` and `TEST-DEPOSIT-*` docs at end. Audit-trail movements/deposits if any are left as test artifacts (immutable per Rule D, identifiable by prefix for future bulk cleanup via existing `/api/admin/cleanup-test-sales` pattern).
6. Result table reported in commit message + session checkpoint.

## How — implementation order (Rule K work-first-test-last)

### Stream 1 — Source files first (no tests yet):

1. `navConfig.js` — add section + items + remove pinned (~20 LOC change)
2. `AppointmentCalendarView.jsx` — rename + add prop + filter logic (~10 LOC change to existing 740-LOC file)
3. `appointmentDepositBatch.js` — NEW (~90 LOC)
4. `AppointmentFormModal.jsx` — `lockedAppointmentType` prop + deposit-redirect banner (~30 LOC change)
5. `DepositPanel.jsx` — route hasAppointment to pair helper (~10 LOC change)
6. `BackendDashboard.jsx` — URL redirect + 4 tab cases + fallback (~20 LOC change)
7. `phase-21-0-migrate-appointment-types-strict.mjs` — NEW migration (~250 LOC, mirrors Phase 19.0 template)

### Stream 2 — Review + verify structure:

- Read each new/modified file once. Sanity-check imports + component signatures.
- Run `npm run build` — must be clean (catches any silent Edit failures, stale imports).

### Stream 3 — Test bank in one batch:

8 NEW test files per § H. Each test file follows the existing phase-19-0 / phase-20-0 patterns (source-grep + RTL component + flow simulate).

### Stream 4 — Migration:

- `vercel env pull .env.local.prod --environment=production` (if not fresh)
- `node scripts/phase-21-0-migrate-appointment-types-strict.mjs` (dry-run; report distribution)
- `node scripts/phase-21-0-migrate-appointment-types-strict.mjs --apply` (commit + audit doc)
- Re-run dry-run to confirm 0 docs to migrate (idempotent)

### Stream 5 — Acceptance gate:

- Start dev server via Claude_Preview
- Run preview_eval matrix per § I
- Cleanup TEST- fixtures
- Capture results table

### Stream 6 — Wrap:

- `npm test -- --run tests/phase-21-0-*` — all green
- `npm run build` — final clean check
- Commit + push (NO Vercel deploy per local-only directive 2026-05-06)
- Update `SESSION_HANDOFF.md` + `.agents/active.md` + `.agents/sessions/2026-05-06-phase-21-0-...md` checkpoint

## Files touched

| Action | Path | Approx LOC delta |
|---|---|---|
| RENAME + MODIFY | `src/components/backend/AppointmentTab.jsx` → `AppointmentCalendarView.jsx` | +50 / −20 |
| MODIFY | `src/components/backend/nav/navConfig.js` | +20 / −5 |
| MODIFY | `src/components/backend/AppointmentFormModal.jsx` | +60 / −5 |
| MODIFY | `src/components/backend/DepositPanel.jsx` | +20 / −10 |
| MODIFY | `src/pages/BackendDashboard.jsx` | +25 / −5 |
| NEW | `src/lib/appointmentDepositBatch.js` | +120 |
| NEW | `scripts/phase-21-0-migrate-appointment-types-strict.mjs` | +260 |
| NEW × 8 | `tests/phase-21-0-*.test.{js,jsx}` | +600 total |
| MODIFY | `tests/phase-19-0-deposit-creates-deposit-booking.test.js` | adjust to assert NEW pair-helper call shape |
| MODIFY | `tests/audit-branch-scope.test.js` | extend BS-9 invariant to cover the new 4 sub-tabs |

## Risk + rollback

- **Risk**: AppointmentCalendarView rename breaks any test that imports `AppointmentTab.jsx` directly. Mitigation: search-and-replace import paths in same commit; test-bank verification catches any miss.
- **Risk**: Phase 21.0b migration spawns appointment docs for cancelled deposits (incorrect — already filtered, but verify). Mitigation: dry-run review reads the candidate-list audit + abort if any cancelled deposits show up.
- **Risk**: AppointmentFormModal's deposit-booking redirect button breaks the flow for callers that DON'T want to redirect (e.g. if a future caller wants to create deposit-bookings directly from the modal). Mitigation: redirect path only fires when `lockedAppointmentType === 'deposit-booking'` is explicitly passed. Other callers (without the prop) keep today's full radio-row behavior — they CAN pick deposit-booking but the save handler will throw a friendly error directing them to use DepositPanel. Future fix: integrate full deposit subform into AppointmentFormModal (Phase 21.0-bis).
- **Rollback**: Single revert of the Phase 21.0 commit; old `appointments` pinned tab returns from history; migration is idempotent so doesn't need un-doing (forensic trail fields preserved). Backfilled be_appointments docs would remain — they're harmless data, just won't have a matching nav entry.

## Open questions (none — user pre-approved including review skip)

User said: "approve และ approve review ด้วย แล้วทำให้จบ แล้วเทสตามที่บอกไปเลย จะออกไปข้างนอก ฝากด้วย แบบอยู่ในกฎเกนของเรา และใช้ได้จริงแบบที่หวัง ด้วยความสามารถสูงสุดของนาย"

Implementation proceeds without further user gating. Acceptance gate (preview_eval per-branch × per-type) is the final word.
