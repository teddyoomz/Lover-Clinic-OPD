---
title: Appointment 15-min slots + 4-type taxonomy (Phase 19.0)
type: concept
date-created: 2026-05-06
date-updated: 2026-05-06
tags: [phase-19-0, appointments, ssot, rule-of-3, taxonomy]
source-count: 2
---

# Appointment 15-min slots + 4-type taxonomy (Phase 19.0)

> Phase 19.0 (V15 #22, 2026-05-05) shrunk the minimum appointment slot from 30 → 15 min and replaced the 2-type taxonomy (`'sales'` / `'followup'`) with 4 types (`'deposit-booking'` / `'no-deposit-booking'` / `'treatment-in'` / `'follow-up'`). Same paint, sharper grid + finer semantic categorization. Net source diff: ~17 files modified + 3 new lib + 1 new script + 9 new test files.

## Overview

Two orthogonal user directives bundled into one phase:

1. **Slot interval shrink** — every TIME_SLOTS dropdown + grid cell + duration default goes from 30-min to 15-min. AppointmentTab grid keeps the same total pixel-height (28 rows × 36px = 56 rows × 18px = 1008px). All 30-min boundaries are still 15-min boundaries, so existing data needs no shape change.

2. **Type taxonomy expansion** — replace `ขาย` / `ติดตาม` with 4 explicit categories: `จองมัดจำ` (deposit-bound booking) / `จองไม่มัดจำ` (no-deposit booking) / `เข้าทำหัตถการ` (treatment-in session) / `ติดตามอาการ` (follow-up). DepositPanel deposit→appointment writes `'deposit-booking'`. ProClinic dev-only sync compresses 4→2 (`'follow-up'` → `'followup'`; others → `'sales'`).

## Architecture

**Single source of truth**: NEW `src/lib/appointmentTypes.js` exports `APPOINTMENT_TYPES` (frozen 4-entry array of `{value, label, defaultColor, order}`), `DEFAULT_APPOINTMENT_TYPE = 'no-deposit-booking'`, plus 4 helpers (`resolveAppointmentTypeLabel`, `resolveAppointmentTypeDefaultColor`, `isLegacyAppointmentType`, `migrateLegacyAppointmentType`). See [appointment-types-ssot](../entities/appointment-types-ssot.md).

**Rule of 3 collapse**: 4 local `TIME_SLOTS` generators (AppointmentTab + AppointmentFormModal + DepositPanel + the canonical in `staffScheduleValidation.js`) → 1 canonical export. Three local copies dropped.

**Migration policy** (Q1 lock = Option B Uniform): all legacy `appointmentType` values (`'sales'` / `'followup'` / `'follow'` / `'consult'` / `'treatment'` / `null`) → `'no-deposit-booking'`. Admin re-classifies per appointment manually post-migration. Forensic-trail fields stamped: `appointmentTypeMigratedAt` + `appointmentTypeLegacyValue`.

**Auto-bump endTime**: in AppointmentFormModal's `update` callback, when admin changes `startTime` and `endTime` was at the +15 default gap, advance `endTime` to maintain +15. Admin-customized gaps preserved.

## Per-type default colors

When admin doesn't pick an explicit `appointmentColor`, chip render uses:
- `'deposit-booking'` → เขียวอ่อน (paid intent)
- `'no-deposit-booking'` → ส้มอ่อน (pending)
- `'treatment-in'` → น้ำเงินอ่อน (active)
- `'follow-up'` → เหลืองอ่อน (info)

Admin-picked color always wins.

## Out of scope (Phase 19.0)

- Hard business-rule gates (e.g. `'deposit-booking'` requires linked deposit doc) — Q7 lock; types are descriptive labels only.
- Public-facing booking page — none exists; admin-only scope verified.
- `pc_*` mirror collections — frontend ProClinic display untouched. ProClinic sync uses translator at outbound only.
- APPT_COLORS palette extraction — only 2 copies, no Rule of 3 trigger yet.

## Migration execution (V15 #22, 2026-05-05)

Production audit: `artifacts/loverclinic-opd-4c39b/public/data/be_admin_audit/phase-19-0-migrate-appointment-types-1777987427963-c3e11db0`.
- Scanned: 27 documents
- Before: `{ null: 18, sales: 9 }`
- After: `{ 'no-deposit-booking': 27 }`
- Idempotency re-run: 0 writes ✓

## Cross-references

- Entity: [appointment-types-ssot](../entities/appointment-types-ssot.md) — the new SSOT module
- Concept: [data-ops-via-local-sdk](data-ops-via-local-sdk.md) — Rule M; Phase 19.0 migration script is one canonical template
- Concept: [iron-clad-rules](iron-clad-rules.md) — Rule K (work-first-test-last) was followed: 14 source-task commits + 1 batched test bank commit
- Spec: `docs/superpowers/specs/2026-05-06-phase-19-0-appointment-15min-and-4types-design.md`
- Plan: `docs/superpowers/plans/2026-05-06-phase-19-0-appointment-15min-and-4types.md`

## History

- 2026-05-06 — Phase 19.0 shipped (V15 #22). 16+ commits across Tasks 1-11 + 4 polish + post-deploy script fix. Migration `--apply` complete on prod.
