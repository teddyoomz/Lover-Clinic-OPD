# Staff / Doctor Hide-From-Lists — Design Spec

**Status**: Approved 2026-05-08 (3 brainstorming sections + 3 Q&A locked)
**Audience**: Implementation engineers + spec reviewers
**Implementation plan**: TBD via `/writing-plans` skill after this spec is approved by user

---

## 1. Problem statement

User directive (verbatim 2026-05-08):

> "ใน tab=staff และ tab=doctors เพิ่มปุ่มใหม่คือ 'ไม่แสดงรายชื่อ' ซึ่งจะปรากฎอยู่ใน modal สร้างหรือแก้ไข พนักงาน / แพทย์ / ผู้ช่วยแพทย์ ซึ่งเมื่อกดแล้ว พนักงาน / แพทย์ / ผู้ช่วยแพทย์ คนนั้นจะยังมีชื่ออยู่ในระบบ login ได้ทำทุกอย่างได้ตามสิทธิ์เหมือนคนอื่นๆ แต่จะไม่ไปโผล่ในดรอปดาวน์ การดึงรายชื่อในเมนูใดๆ เปรียบเทียบได้กับการซ่อนไว้ ให้สามารถ login เข้ามา ทำงานได้เท่านั้น แต่ไม่ปรากฎที่ไหนเลย"

**Translation**: add a hide-from-lists toggle in StaffFormModal + DoctorFormModal. When enabled, that staff/doctor/assistant-doctor person remains in the system (login + permissions intact) but disappears from every dropdown/picker/list throughout the system. Soft-archive pattern.

**Why now**: clinics have staff who should retain login access (e.g. on leave, on probation, in a non-list role) but should not clutter the daily picker dropdowns the front-desk uses every minute. Without a hide flag, admin's only options today are (a) delete the person — losing audit trail + login access, or (b) leave them in the picker — clutter risks misclick on patient-facing forms.

**Scope clarifier**: hidden persons remain visible in:
- StaffTab + DoctorsTab admin lists (with a "ซ่อน" badge — to allow unhide later)
- Past records' name labels (treatment-history, sale receipts, appointment history) — read-only display of pre-existing references

Hidden persons are excluded from:
- Every picker / dropdown for new transactions (appointment form, treatment form, sale form, schedule create, deposit form, …)
- Schedule calendar (rostered shifts won't render)
- Reports / aggregators (DF payout, sales summary, …)

---

## 2. Locked Q&A (from brainstorming session)

| # | Question | Answer |
|---|---|---|
| Q1 | When hidden, person should still appear in which views? | StaffTab + DoctorsTab admin list **+ past records (read-only label)** only. Schedule calendar and reports → hide. |
| Q2 | UI control type in modal | Checkbox at top of modal (recommended option) — labeled "🙈 ซ่อน — ไม่แสดงรายชื่อ" with helper text |
| Q3 | Permission gate for hide/unhide | Existing edit permission (`staff_management`, `doctor_management`) — no new permission key |

---

## 3. Architecture

### 3.1 Data model — `isHidden` field

Mirror existing `isHidden` precedent on `be_products` (current value at `src/lib/backendClient.js:10273` + `:10285`).

**New fields** on `be_staff/{staffId}` + `be_doctors/{doctorId}` documents:

| Field | Type | Default | Notes |
|---|---|---|---|
| `isHidden` | boolean | undefined → falsy → visible | Source of truth for hide state |
| `hiddenAt` | Firestore timestamp \| null | null on visible | Stamped at the visible→hidden transition |
| `hiddenBy` | string (uid) \| null | null on visible | Stamped at the visible→hidden transition |

**Backward compatibility**: existing docs without `isHidden` field are treated as `isHidden === false` (visible). No migration required.

**`be_doctors` covers both doctors and assistant doctors** (differentiated by `position: 'แพทย์' | 'ผู้ช่วยแพทย์'`). Single `isHidden` flag works for both — they share the same DoctorFormModal + DoctorsTab.

### 3.2 Lister behavior — default-filter at lib

**`listStaff()` + `listDoctors()` in `src/lib/backendClient.js`** are universal lib-layer lists exported via `src/lib/scopedDataLayer.js` (no branch-scope, no auto-inject). Both gain a new `opts` parameter:

```js
// Before:
export async function listStaff() { ... }
export async function listDoctors() { ... }

// After:
export async function listStaff({ includeHidden = false } = {}) {
  const docs = ...; // existing fetch
  return includeHidden ? docs : docs.filter(d => !d.isHidden);
}
export async function listDoctors({ includeHidden = false } = {}) {
  const docs = ...;
  return includeHidden ? docs : docs.filter(d => !d.isHidden);
}
```

**Default-filter rationale** (chosen over alternatives):
- New pickers added to the codebase later **automatically secure** — no risk of leaking hidden persons.
- Single-source of truth for the filter logic (Rule of 3 alignment with the existing isHidden product pattern).
- Consumers that legitimately need hidden persons opt in explicitly (`{ includeHidden: true }`) — visible audit signal.

**Rejected alternatives** (documented for reviewer):
- ❌ Filter at picker level only — risk of leaking hidden persons via NEW pickers added later.
- ❌ Two separate listers (`listVisibleStaff()` + `listAllStaff()`) — Rule of 3 violation; two functions diverge over time.

### 3.3 Lister opt-in consumers

Consumers that MUST call `{ includeHidden: true }`:

| File | Reason |
|---|---|
| `src/components/backend/StaffTab.jsx` | Admin management — must show hidden rows so admin can unhide |
| `src/components/backend/DoctorsTab.jsx` | Same as above |
| `src/components/backend/CustomerDetailView.jsx` | Treatment timeline + sale list — past references' names must render |
| `src/components/TreatmentFormPage.jsx` | Loads doctors+staff for both picker AND existing-treatment display map — split into two: opt-in for the map, default-filter for the picker |
| `src/pages/AdminDashboard.jsx` | `loadDepositOptions` + `loadTodaysPractitioners` — same split pattern |
| `src/components/backend/AppointmentCalendarView.jsx` | Past appointment display map (calendar grid renders names from past appointments) — split |
| `src/components/backend/SalePrintView.jsx` (or equivalent) | Sale receipt printout shows seller name |
| `src/components/backend/BulkPrintModal.jsx` | Bulk print may reference hidden seller |

**Split pattern** for files doing BOTH lookup + picker:

```js
// Build full map (includes hidden) for past-record lookup
const allDoctors = await listDoctors({ includeHidden: true });
const doctorMap = new Map(allDoctors.map(d => [d.id, d]));

// Derive visible-only for the picker dropdown
const visibleDoctors = allDoctors.filter(d => !d.isHidden);
```

This pattern uses ONE network call + ONE source list, derives both surfaces without duplicating the fetch.

### 3.4 Save handler — audit stamping

`saveStaff(staffId, data)` and `saveDoctor(doctorId, data)` in `backendClient.js` stamp `hiddenAt` + `hiddenBy` on the **transition** of `isHidden`:

```js
// Pseudo-code inside saveStaff:
const existing = await getDoc(staffDoc(staffId)).then(s => s.data() ?? {});
const wasHidden = !!existing.isHidden;
const willBeHidden = !!data.isHidden;

if (wasHidden !== willBeHidden) {
  data.hiddenAt = willBeHidden ? serverTimestamp() : null;
  data.hiddenBy = willBeHidden ? auth.currentUser?.uid : null;
}
// ... existing setDoc/updateDoc logic continues
```

**Idempotency**: re-saving with the same `isHidden` value (no transition) does NOT update audit stamps — preserves the original transition record.

**Privacy**: `hiddenBy` records the uid of the admin who toggled. Per project precedent (`be_admin_audit/*` records uid; user docs already store uid in `firebaseUid` field), this is acceptable for an internal staff management feature.

---

## 4. UI changes

### 4.1 StaffFormModal + DoctorFormModal — checkbox at top of form

Insert at the very top of the modal body, before any other field group:

```jsx
<div className="flex flex-col gap-1 p-3 rounded-lg bg-amber-900/20 border border-amber-800/40 mb-4">
  <label className="flex items-center gap-2 cursor-pointer">
    <input
      type="checkbox"
      checked={!!isHidden}
      onChange={(e) => setIsHidden(e.target.checked)}
      data-field="isHidden"
      className="w-4 h-4"
    />
    <span className="font-medium text-amber-300">🙈 ซ่อน — ไม่แสดงรายชื่อ</span>
  </label>
  <div className="text-xs text-[var(--tx-muted)] ml-6">
    เมื่อเปิด: คนนี้ยัง login + ใช้สิทธิ์ได้ปกติ แต่จะไม่ปรากฏใน dropdown / picker / รายการ ทุกที่ในระบบ
    (ยกเว้นในแท็บนี้ + ประวัติเก่าที่อ้างชื่อไว้แล้ว)
  </div>
</div>
```

**Color rationale**: amber background — visible enough to draw admin attention (this is a destructive-ish action that suppresses the person from common workflows) but not red/rose (avoids cultural collision with delete + Thai red-on-name = death taboo per project Rule 04).

**State binding**: `isHidden` initialized from `staff?.isHidden` / `doctor?.isHidden` on modal open; passed as part of the `data` object to `saveStaff` / `saveDoctor`.

### 4.2 StaffTab + DoctorsTab — visual badge per row

For rows where `isHidden === true`, render a subtle badge next to the name:

```jsx
{staff.isHidden && (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-amber-900/30 text-amber-300 border border-amber-800/40">
    🙈 ซ่อน
  </span>
)}
```

**Tab-level lister call**: `loadStaff()` / `loadDoctors()` callbacks must pass `{ includeHidden: true }` so admin sees both visible + hidden rows.

```js
// In StaffTab loadStaff useCallback:
const allStaff = await listStaff({ includeHidden: true });
setStaff(allStaff);
```

### 4.3 Past-record consumer migrations — split pattern

For each consumer file in §3.3 that does BOTH lookup + picker:

1. Replace the existing `listDoctors()` / `listStaff()` call with `listDoctors({ includeHidden: true })`.
2. Derive a `visibleDoctors` (or `visibleStaff`) array client-side via `.filter(d => !d.isHidden)`.
3. Use `allDoctors` (full list) for ID→object lookup maps + past-record name resolution.
4. Use `visibleDoctors` (filtered) for picker `<select>` / autocomplete options.

For consumers that ONLY pick (no past-record display):
- Leave alone. The default-filter at lister level handles them.

---

## 5. Audit invariants

### 5.1 New audit invariant — AV20 (lookup-map opt-in)

Add to `audit-anti-vibe-code` skill:

> **AV20 — Lookup-map consumers must opt-in `{ includeHidden: true }`**
>
> Components that build an ID→entity map for past-record name display MUST call the lister with `{ includeHidden: true }`. Picker-only components MUST use the default lister (no opt-in).
>
> **Why**: V41 (2026-05-08) — `listStaff()` / `listDoctors()` default-filter `!isHidden`. Past records reference staff/doctors by id; if the lookup map is built from a default-filtered lister, hidden persons' names render as blank in past records' display labels.
>
> **Grep**:
> - `listStaff\(\{[^}]*\}\)` and `listDoctors\(\{[^}]*\}\)` — every opt-in callsite must be either StaffTab/DoctorsTab/Customer*View/TreatmentFormPage (lookup-map context) or carry an inline comment justifying the opt-in.
> - `\.filter\(d => !d\.isHidden\)` or `.filter(s => !s.isHidden)` — every consumer that derives a visible-only list from an opt-in lister must filter explicitly.

### 5.2 Existing invariants honored

- **BSA Layer-1** (`backendClient.js`): listStaff/listDoctors gain `opts` parameter without becoming branch-scoped (they remain universal — no `branchId` filter introduced).
- **BSA `__universal__` marker**: scopedDataLayer pass-through preserves the universal classification — listeners do not need re-subscription on branch switch.
- **V12 multi-reader-sweep**: every consumer of listStaff/listDoctors is identified in §3.3 + audited via the new AV20 grep guard.
- **V37 git discipline**: every commit uses `git add <specific files>` — never `git add -A`.
- **Rule N (targeted-test-only)**: Phase 1 helper changes use focused vitest run; Rule K work-first-test-last for UI Phase 2; full suite at end of Phase 4.
- **Rule I (full-flow simulate)**: Phase 3.3 ships a live admin-SDK e2e against real prod with TEST-prefixed fixtures.

---

## 6. Test plan

### 6.1 Helper unit tests — `tests/staff-doctor-hidden-filter.test.js`

| Test | What it asserts |
|---|---|
| H1.1 | `listStaff()` default returns only docs where `!isHidden` |
| H1.2 | `listStaff({ includeHidden: true })` returns all docs |
| H1.3 | Existing docs without `isHidden` field are treated as visible (backward compat) |
| H1.4 | Same three for `listDoctors()` |
| H2.1 | `saveStaff` transition visible→hidden stamps `hiddenAt` (serverTimestamp) + `hiddenBy` (uid) |
| H2.2 | `saveStaff` transition hidden→visible clears `hiddenAt` + `hiddenBy` to null |
| H2.3 | `saveStaff` no-transition does NOT modify audit stamps (idempotent) |
| H2.4 | Same three for `saveDoctor` |
| H2.5 | `saveDoctor` with `position: 'ผู้ช่วยแพทย์'` works the same as `position: 'แพทย์'` |

~12 assertions total.

### 6.2 UI RTL tests — `tests/staff-doctor-hide-modal-rtl.test.jsx`

| Test | What it asserts |
|---|---|
| UI1.1 | StaffFormModal renders the "ซ่อน" checkbox at top |
| UI1.2 | Checkbox state binds to staff prop on mount |
| UI1.3 | Toggling checkbox updates state |
| UI1.4 | Save calls `saveStaff(id, { ..., isHidden: true })` |
| UI1.5 | DoctorFormModal mirrors UI1.1–1.4 |
| UI2.1 | StaffTab row shows "ซ่อน" badge when `isHidden === true` |
| UI2.2 | StaffTab calls `listStaff({ includeHidden: true })` |
| UI2.3 | DoctorsTab mirrors UI2.1–2.2 |

~10 assertions total.

### 6.3 Consumer-sweep audit — `tests/staff-doctor-hide-consumer-sweep.test.js`

Source-grep regression guards. For each consumer in §3.3:

| Test | What it asserts |
|---|---|
| CS1.1 | StaffTab + DoctorsTab use `{ includeHidden: true }` |
| CS1.2 | CustomerDetailView uses `{ includeHidden: true }` for staff/doctor lookup |
| CS1.3 | TreatmentFormPage uses `{ includeHidden: true }` for the lookup map + filters visible for the picker |
| CS1.4 | AdminDashboard.loadDepositOptions splits the same way |
| CS1.5 | AppointmentCalendarView splits the same way |
| CS2.1 | No NEW picker imports `listStaff({ includeHidden: true })` without an explanatory comment |
| CS2.2 | (Negative) NO file uses `listStaff()` followed by displaying past-record names without an opt-in (regex-detected pattern) |

~8 assertions.

### 6.4 Live admin-SDK e2e — `scripts/e2e-staff-doctor-hide.mjs`

Live round-trip on real prod with TEST-prefixed fixtures (V33 prefix discipline, soft-cleanup):

1. Create TEST staff via admin SDK with id `TEST-STAFF-V41-${ts}` and isHidden=false → verify present in `listStaff()` default
2. Update isHidden=true via admin SDK → verify EXCLUDED from `listStaff()` default
3. Verify INCLUDED in `listStaff({ includeHidden: true })` opt-in
4. Verify audit fields stamped: `hiddenAt` (timestamp), `hiddenBy` (uid string)
5. Update isHidden=false → verify back in default + audit fields cleared to null
6. Same flow for TEST doctor + TEST assistant doctor (`position: 'ผู้ช่วยแพทย์'`)
7. Cleanup: delete all 3 TEST docs

Expected: ✓ E2E PASS — staff + doctor + assistantDoctor hide round-trip on real Firestore + audit-trail cleanup verified.

---

## 7. File manifest

### Modified (~10 files)

| File | Change | LOC est. |
|---|---|---|
| `src/lib/backendClient.js` | listStaff/listDoctors `{includeHidden}` + saveStaff/saveDoctor audit-stamp transition | +30 |
| `src/lib/scopedDataLayer.js` | Pass-through opt for new param (likely no-op since already passes through) | 0–5 |
| `src/components/backend/StaffFormModal.jsx` | Checkbox UI + state binding | +25 |
| `src/components/backend/DoctorFormModal.jsx` | Checkbox UI + state binding | +25 |
| `src/components/backend/StaffTab.jsx` | Opt-in + badge | +12 |
| `src/components/backend/DoctorsTab.jsx` | Opt-in + badge | +12 |
| `src/components/backend/CustomerDetailView.jsx` | Opt-in for past-record lookup | +5 |
| `src/components/TreatmentFormPage.jsx` | Split (opt-in for map, filter for picker) | +8 |
| `src/pages/AdminDashboard.jsx` | Split for loadDepositOptions + loadTodaysPractitioners | +12 |
| `src/components/backend/AppointmentCalendarView.jsx` | Split for past appointment display | +8 |

(Plus any other consumer that may be discovered during plan phase — implementation plan will sweep grep `listStaff(` / `listDoctors(` and classify each callsite.)

### Created (~4 files)

- `tests/staff-doctor-hidden-filter.test.js` — helper unit (H1–H2)
- `tests/staff-doctor-hide-modal-rtl.test.jsx` — UI behavior (UI1–UI2)
- `tests/staff-doctor-hide-consumer-sweep.test.js` — multi-reader audit (CS1–CS2)
- `scripts/e2e-staff-doctor-hide.mjs` — live admin-SDK e2e

### Doc updates

- `.claude/rules/00-session-start.md` — V41 compact V-entry
- `.claude/rules/v-log-archive.md` — V41 verbose entry
- `.agents/skills/audit-anti-vibe-code/SKILL.md` — AV20 invariant + AV1–AV20 header

---

## 8. Implementation order (per Rule K)

| Phase | Tasks | Notes |
|---|---|---|
| **Phase 1 — Helpers (TDD)** | 1.1 listStaff/listDoctors `{includeHidden}` · 1.2 saveStaff/saveDoctor audit-stamp · 1.3 scopedDataLayer pass-through | Each task TDD: write failing tests → implement → green → commit. Use focused `npx vitest run tests/staff-doctor-hidden-filter.test.js` |
| **Phase 2 — UI (work-first per Rule K)** | 2.1 StaffFormModal + DoctorFormModal checkbox · 2.2 StaffTab + DoctorsTab opt-in + badge · 2.3 Consumer-side migrations (~5 files) | Build all source first, then test bank in Phase 3. Build-clean check after each commit. |
| **Phase 3 — Tests** | 3.1 Multi-reader-sweep audit · 3.2 UI RTL bank · 3.3 Live admin-SDK e2e on real prod | After 3.3 PASS: full suite + build-clean checkpoint. |
| **Phase 4 — Docs + final** | 4.1 V41 + AV20 docs · 4.2 Full suite + push (no deploy until user authorizes) | Same pattern as V40. Push only — no `vercel --prod` / `firebase deploy` without explicit "deploy" THIS turn (V18 lock). |

**Estimated**: 11 atomic tasks, ~6–8 commits.

---

## 9. Out of scope (rejected per YAGNI)

- ❌ Filter UI on StaffTab to "show only hidden" / "show only visible" — admin can grep visually with badge; v2 if a user requests it.
- ❌ Bulk hide/unhide selector — single-row toggle suffices; bulk-toggle is a v2 power-user feature.
- ❌ Auto-hide-after-N-days-inactive — no demand, adds complexity + requires daily cron.
- ❌ Per-collection hide (hide from sales picker but visible in appointment picker) — user said "ไม่ปรากฎที่ไหนเลย" → universal hide is the spec.
- ❌ Audit endpoint at `/api/admin/staff-hide-history` — `hiddenAt` + `hiddenBy` on the doc itself is sufficient; full audit trail can be added in v2 if needed.
- ❌ New permission key `staff_hide_management` — Q3 locked: existing edit permission suffices.
- ❌ Notification to the hidden person — internal staff management feature; no user-facing notification required.

---

## 10. Approval state

- 2026-05-08 — Brainstorming sections 1+2+3 approved by user.
- 2026-05-08 — Q&A locked: Q1 (StaffTab + DoctorsTab + past records) + Q2 (checkbox at top) + Q3 (existing edit permission).
- 2026-05-08 — Spec written + committed to `docs/superpowers/specs/2026-05-08-staff-doctor-hide-from-lists-design.md`.
- ⏳ Pending — User reviews this spec.
- ⏳ Pending — On approval, invoke `/writing-plans` to generate the atomic implementation plan.

End of spec.
