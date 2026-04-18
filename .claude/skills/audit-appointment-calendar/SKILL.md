---
name: audit-appointment-calendar
description: "Audit Phase 4 appointment calendar for time-slot conflicts, Thai TZ handling, resource overlap, cancellation atomicity. Use before any change to appointment code."
user-invocable: true
allowed-tools: "Read, Grep, Glob"
---

# Audit Appointment Calendar (Phase 4)

## Invariants (AP1–AP8)

### AP1 — Time-slot conflict detection
**Why**: two writes to same doctor+slot in parallel → double-booking.
**Where**: `src/components/backend/AppointmentTab.jsx` handleSave + `createBackendAppointment`
**Known gap**: scan finding #6 — NO overlap check in handleSave. Bug confirmed.
**Fix hint**: pre-write query `be_appointments` for `(roomId/doctorId, overlapping time)`; ideally inside `runTransaction` for race safety.

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

### AP8 — FCM reminder doesn't re-fire on snapshot 2x
**Why**: CLAUDE.md rule 1 — serverTimestamp causes 2 snapshot calls.
**Check**: if reminder scheduling listens to appointment snapshots, must guard idempotency.

## How to run
1. Read AppointmentTab.jsx in full (~700 LOC).
2. Read `api/proclinic/appointment.js`.
3. Grep patterns above.

## Priority
AP1 (double-booking) is CRITICAL — clinic embarrassment + patient harm. AP3 (TZ) is HIGH for multi-TZ scenarios.
