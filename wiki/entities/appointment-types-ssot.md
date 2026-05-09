---
title: appointmentTypes.js — 5-type taxonomy SSOT
type: entity
date-created: 2026-05-06
date-updated: 2026-05-09
tags: [phase-19-0, phase-25-0, ssot, lib, appointments, walk-in]
source-count: 2
---

# `src/lib/appointmentTypes.js` — 5-type taxonomy SSOT

> Pure JS module shipped Phase 19.0 (commit `ef4c003`, 2026-05-06) — extended Phase 25.0a (2026-05-09) with 5th type `walk-in`. Single source of truth for the appointment-type taxonomy. Replaces the 2-value `'sales'` / `'followup'` enum scattered across 7+ consumers. No Firestore, no React — safe for tests / server / migration scripts / UI.

## Exports

| Symbol | Type | Purpose |
|---|---|---|
| `APPOINTMENT_TYPES` | `readonly Array<Frozen<{value, label, defaultColor, order}>>` | The 4 types; outer + inner objects frozen |
| `APPOINTMENT_TYPE_VALUES` | `readonly string[]` | Convenience: just the 4 string values |
| `DEFAULT_APPOINTMENT_TYPE` | `'no-deposit-booking'` | Phase 19.0 Q2 lock |
| `resolveAppointmentTypeLabel(value)` | `(string\|null) => string` | Thai display label; unknown → DEFAULT label |
| `resolveAppointmentTypeDefaultColor(value)` | `(string\|null) => string` | One of `APPT_COLORS`; unknown → DEFAULT color |
| `isLegacyAppointmentType(value)` | `(string\|null) => boolean` | True for `'sales'` / `'followup'` / `'follow'` / `'consult'` / `'treatment'` / null / empty |
| `migrateLegacyAppointmentType(value)` | `(string\|null) => string` | Option B uniform: legacy → DEFAULT; new values pass through (idempotent) |

## The 5 types

```js
[
  { value: 'deposit-booking',    label: 'จองมัดจำ',     defaultColor: 'เขียวอ่อน',    order: 0 },
  { value: 'no-deposit-booking', label: 'จองไม่มัดจำ',  defaultColor: 'ส้มอ่อน',      order: 1 },
  { value: 'treatment-in',       label: 'เข้าทำหัตถการ', defaultColor: 'น้ำเงินอ่อน',  order: 2 },
  { value: 'follow-up',          label: 'ติดตามอาการ',   defaultColor: 'เหลืองอ่อน',  order: 3 },
  { value: 'walk-in',            label: 'Walk-in',       defaultColor: 'น้ำตาลอ่อน',   order: 4 },  // Phase 25.0a
]
```

Phase 25.0a (2026-05-09) `walk-in` added as the 5th type. Drop-in patients (no advance booking). Inverted flow: customer arrives FIRST → admin records to be_customers via "บันทึกลง OPD" → THEN AppointmentFormModal pops with type/customer/channel/branch locked. Backend sub-tab `appointment-walk-in` lives below `appointment-follow-up` in `nav/navConfig.js`. Default color `น้ำตาลอ่อน` (warm earth/amber Tailwind family) — distinct from the existing 4 + matches Editorial Ember theme + NOT red per Thai-culture iron-clad.

## Consumers (after Phase 19.0)

- `src/components/backend/AppointmentFormModal.jsx` — radio rendering iterates `APPOINTMENT_TYPES.map`
- `src/components/backend/DepositPanel.jsx` — same
- `src/components/backend/reports/AppointmentReportTab.jsx` — filter dropdown spreads `APPOINTMENT_TYPES`
- `src/lib/appointmentReportAggregator.js` — `deriveTypeLabel` delegates to `resolveAppointmentTypeLabel`
- `src/lib/appointmentDisplay.js` — re-exports for chip-rendering convenience
- `src/pages/AdminDashboard.jsx` — patient-side appointment chip uses `resolveAppointmentTypeLabel`
- `api/proclinic/_lib/appointmentTypeProClinic.js` — translator hardcodes `'follow-up'` → `'followup'`; doesn't import SSOT (dev-only, will be stripped per H-bis)

## Defensive contract

`resolveAppointmentTypeLabel(unknown_or_legacy)` returns the DEFAULT label (`'จองไม่มัดจำ'`), not the raw input. This handles the deploy ⇆ migration window: if a legacy `'sales'` doc is read between V15 #22 deploy and migration `--apply`, the UI renders `'จองไม่มัดจำ'` instead of leaking `'sales'` to the user.

`migrateLegacyAppointmentType` is idempotent — passes through any value already in `APPOINTMENT_TYPE_VALUES`. Safe for re-runs of the migration script.

## Cross-references

- Concept: [appointment-15min-and-4types](../concepts/appointment-15min-and-4types.md) — the Phase 19.0 design that introduced this SSOT
- Concept: [data-ops-via-local-sdk](../concepts/data-ops-via-local-sdk.md) — the migration script that uses `migrateLegacyAppointmentType`
- Sibling: `src/lib/appointmentDisplay.js` re-exports the 4 SSOT helpers; consumers can import either path
- Spec: `docs/superpowers/specs/2026-05-06-phase-19-0-appointment-15min-and-4types-design.md`

## History

- 2026-05-06 (commit `ef4c003`) — Created. Task 1 of Phase 19.0 plan. 88 lines.
- 2026-05-09 (Phase 25.0a) — Added 5th type `walk-in` per user directive. New backend sub-tab `appointment-walk-in` below `appointment-follow-up`. AppointmentHubRowCard `TYPE_CHIP_CLS` extended with amber-100/950 for walk-in. BackendDashboard tab guard + activeTab→type mapper extended. AppointmentFormModal radio + AppointmentReportTab filter + Hub typeOptions auto-scaled via `APPOINTMENT_TYPES.map`/`resolveAppointmentTypeLabel`. NEW companion: `lockedChannel` prop on AppointmentFormModal (mirror of `lockedAppointmentType` Phase 21.0 pattern) — used by AdminDashboard kiosk "บันทึกลง OPD" flow to lock channel='Walk-in'.
