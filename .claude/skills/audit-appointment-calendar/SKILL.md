---
name: audit-appointment-calendar
description: "Audit Phase 4 appointment calendar for time-slot conflicts, Thai TZ handling, resource overlap, cancellation atomicity. Use before any change to appointment code."
user-invocable: true
allowed-tools: "Read, Grep, Glob"
---

# Audit Appointment Calendar (Phase 4)

## Invariants (AP1–AP8)

### AP1 — Time-slot conflict detection (AP1-bis atomic multi-slot guard)
**Why**: two writes to same doctor+slot in parallel → double-booking.
**Where**: `createBackendAppointment` (`src/lib/backendClient.js`).
**Status**: IMPLEMENTED — AP1-bis reserves one `be_appointment_slots` doc per
15-min interval inside a `runTransaction` (`buildAppointmentSlotKeys` from
`src/lib/appointmentSlotKeys.js`); range overlaps collide on a shared interval →
`AP1_COLLISION`, Firestore OCC retries. A soft pre-write `getAppointmentsByDate`
scan complements it for the sequential case.
**Check**: every appointment-CREATE path reserves slots via this guard — NOT just
`createBackendAppointment`. See **AP9**.

### AP2 — Resource overlap (room + equipment)
**Check**: same patterns as AP1 for rooms and medical instruments.

### AP3 — Thai timezone (Asia/Bangkok, UTC+7)
**Why**: `new Date()` is browser-local; staff in different TZ → date shift.
**Known gap**: scan finding #7 — `dateStr(new Date())` at AppointmentTab.jsx:42-48.
**Fix hint**: use `date-fns-tz` with 'Asia/Bangkok' timezone or manual offset.

### AP4 — DST safe
**Note**: Thailand doesn't observe DST. But if frontend user travels, timezone offset shift matters.

### AP5 — Buddhist Era display derived, not stored
**Why**: พ.ศ. = Gregorian + 543. Store Gregorian ISO; display พ.ศ. at render.
**Grep**: `2569|พ.ศ.` in appointment code.

### AP6 — Update includes updateMask (A1/F1 concretely for appointments)

### AP7 — Cancel releases slot atomically
**Why**: cancel without status change = ghost reserved slot.
**Check (appointment-loop R1, 2026-06-03)**: deposit-booking cancel/delete
(`cancelDepositBookingPair` / `deleteDepositBookingPair` in
`src/lib/appointmentDepositBatch.js`) MUST release the reserved slot docs via
`_appointmentSlotKeysForRelease` + `batch.delete(appointmentSlotDoc(k))` —
otherwise the AP9 reservation orphans the slot + blocks the time forever.
**Check (appointment-loop R2, 2026-06-03)**: UN-cancel (cancelled→non-cancelled
via `updateBackendAppointment`) MUST RE-RESERVE the slots the cancel released
(`becameUncancelled` branch) — else the reactivated appt holds NO slot doc →
its time is double-bookable. Reproduced on real prod
(`scripts/diag-appointment-room-uncancel-probe.mjs` C).

### AP9 — EVERY appointment-create path reserves slots via the AP1-bis guard (appointment-loop R1, 2026-06-03)
**Why**: the atomic double-booking guard is only as complete as its LEAST-guarded
writer. Pre-R1, `createBackendAppointment` reserved slots but the DEPOSIT-booking
writers (`createDepositBookingPair`, `createAppointmentForExistingDeposit` in
`appointmentDepositBatch.js`) did a plain `writeBatch.set(appt)` with NO slot
reservation → the money-backed booking flow had ZERO atomic double-booking
protection and the two flows were mutually blind. Reproduced on REAL prod
(`scripts/e2e-appointment-double-booking-concurrency.mjs` D1: 2 concurrent deposit
bookings same doctor+slot → appts=2 deposits=2 collisions=0).
**Invariant**: every function that WRITES a new `be_appointments` doc with a
doctor+time MUST reserve its slots in the SAME `be_appointment_slots` namespace
inside a `runTransaction` (via `_reserveAppointmentSlotsInTx` / the
`createBackendAppointment` tx) so all create paths are mutually exclusive.
**appointment-loop R2 (2026-06-03)** — the guard keys come from
`buildAppointmentGuardKeys` = DOCTOR slots (`${date}_${doctorId}_${HHMM}`) PLUS
ROOM slots (`ROOM__${date}_${roomId}_${HHMM}`, disjoint namespace) so a collision
on EITHER the doctor OR the room aborts the write (two different doctors can no
longer double-book the same physical room). Every reserve/release site
(create + deposit writers + `_releaseAppointmentSlot` + update rotation/un-cancel)
uses `buildAppointmentGuardKeys` — NOT the doctor-only `buildAppointmentSlotKeys`.
**Grep**:
```
# every be_appointments writer that is NOT inside a slot-reserving tx:
grep -nE "batch\.set\(appointmentDoc|tx\.set\(appointmentDoc" src/lib/appointmentDepositBatch.js src/lib/backendClient.js
```
Each `*.set(appointmentDoc(...))` of a NEW appt with a doctor+time must be preceded
by `_reserveAppointmentSlotsInTx` (deposit module) or the AP1-bis slot tx (backendClient).
**Sanctioned exceptions**: `createDepositForExistingAppointment` (links a deposit
to an ALREADY-created appt → its slots were reserved at its own create; reserves
no NEW slot) + `buildAppointmentPairPayload`/legacy/`skipServerCollisionCheck`
imports (open-ended, no parseable doctor+time → no keys → no guard, same as
`createBackendAppointment`'s legacy fallback).
**Regression lock**: `tests/appt-double-booking-deposit-slot-guard.test.js` (R1.6–R1.14).

### AP8 — FCM reminder doesn't re-fire on snapshot 2x
**Why**: CLAUDE.md rule 1 — serverTimestamp causes 2 snapshot calls.
**Check**: if reminder scheduling listens to appointment snapshots, must guard idempotency.

## How to run
1. Read AppointmentTab.jsx in full (~700 LOC).
2. Read `api/proclinic/appointment.js`.
3. Grep patterns above.

## Priority
AP1 (double-booking) is CRITICAL — clinic embarrassment + patient harm. AP3 (TZ) is HIGH for multi-TZ scenarios.
