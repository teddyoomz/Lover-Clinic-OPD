---
name: audit-frontend-links
description: "Audit correctness of shareable links — clinic schedule links (`clinic_schedules/{token}`), patient links (`patientLinkToken`), QR sessions. Catches filter drift (resync ignoring persisted config), missing defaults for legacy docs, expiry/enable/disable inconsistencies, and broken customer-view gates. Use whenever any link-generation or customer-view flow changes."
user-invocable: true
allowed-tools: "Read, Grep, Glob"
---

# Audit Frontend Links — Schedule / Patient / QR Correctness

The LoverClinic app ships multiple shareable links that strangers (customers)
open. Each has an admin-side generator + a customer-side reader, and the two
sides must stay in lockstep. Session bug 2026-04-19: `updateActiveSchedules`
rewrote `bookedSlots` as "all appointments" ignoring the persisted
doctor/room filter → customers saw free slots as busy.

Link types:
- **clinic_schedules/{token}** — per-room, per-doctor scheduling with 24h expiry
- **patientLinkToken** (per session) — patient data view
- **QR session token** — kiosk access

## Invariants (LK1–LK10)

### LK1 — Every filter config that affects `bookedSlots` is persisted on the schedule doc
**Why**: background resync + `updateActiveSchedules` must recompute with the same filter.
**Fields**: `noDoctorRequired`, `selectedDoctorId`, `selectedRoomId`.
**Grep**: at `handleGenScheduleLink` save, verify each field above is written.
**Check**: any new filter added to the modal must be added to the save + to the resync re-filter.

### LK2 — Resync paths use the shared filter helpers, not duplicated logic
**Why**: drift. Session bug: `updateActiveSchedules` had inline code ignoring filter entirely.
**Grep**: `bookedSlots.push` under `src/pages/AdminDashboard.jsx` — every push must be gated by `shouldBlockScheduleSlot` from `src/lib/scheduleFilterUtils.js`.
**Expected**: 3 call sites (handleGenScheduleLink, its background resync, updateActiveSchedules), all using `shouldBlockScheduleSlot(a, filterCfg)`.

### LK3 — `doctorBookedSlots` uses `shouldBlockDoctorSlot` (role + doctor-room only)
**Why**: "หมอไม่ว่าง" label fires only when doctor is at a DOCTOR room.
**Grep**: `doctorBookedSlots.push` — every push gated by `shouldBlockDoctorSlot(a, doctorSlotCfg)`.
**Expected**: 3 call sites, identical cfg shape `{ noDoctorRequired, doctorPractitionerIds, doctorRoomIds }`.

### LK4 — Customer page reads every persisted flag with a safe default
**Why**: legacy docs don't have `selectedRoomId` / `showDoctorStatus` / `doctorBookedSlots`.
**Grep**: in `src/pages/ClinicSchedule.jsx`, every `data.X` read has `|| default` OR uses `=== true` explicit-check.
**Examples**:
- `data.noDoctorRequired || false`
- `data.showDoctorStatus === true` (default-hidden semantics)
- `data.doctorBookedSlots || []`
- `data.customDoctorHours || {}`

### LK5 — Doc expiry check tolerates first-fire `null` timestamp
**Why**: `serverTimestamp()` fires twice — local estimate first (may be null in some SDK versions), then server-confirmed.
**Grep**: `createdAt?.toMillis` or `createdAt?.toMillis?.()` — must use optional chain.
**Check**: `ClinicSchedule.jsx` expiry gate at line ~106-108.

### LK6 — Token generator produces unique IDs even under burst
**Why**: two admin tabs generating simultaneously could collide.
**Grep**: `crypto.getRandomValues` or `Math.random` in token gen — verify 40+ bits entropy.
**Current**: `SCH-` prefix + 5 random bytes = 40 bits. Acceptable for low-volume (≤1 gen/second).

### LK7 — Enable/disable toggle AND `createdAt` age checked together
**Why**: disabled links should not serve data even if still within 24h.
**Grep**: customer-side read of schedule doc — must check both `enabled !== false` AND expiry.
**Expected**: `if (!snap.exists() || snap.data().enabled === false) { setStatus('notfound'); return; }` + separate age check.

### LK8 — `schedList` subscription cleans up on unmount
**Grep**: `onSnapshot` of `clinic_schedules` collection in AdminDashboard — must return `unsub()` from its useEffect.

### LK9 — `selectedRoomName` + `selectedDoctorName` saved for display, even though admins can derive from id
**Why**: room/practitioner names change over time; stamping on the doc preserves label integrity.
**Grep**: at link-save, verify both `selectedRoomId` + `selectedRoomName` are written, not just the id.

### LK10 — No secret or audit-only field leaks into the customer-read doc
**Why**: `clinic_schedules/{token}` is world-readable by token (Firestore security rules). Don't include admin-only fields.
**Inspect**: the save payload in `handleGenScheduleLink` — all fields should be safe for public consumption. No `createdBy: user.uid` exposed to attacker who gets the URL. Currently `createdBy` IS saved — review whether rules gate read access or the uid is considered non-sensitive.

## How to run
1. Start with LK2/LK3 grep — any push to `bookedSlots`/`doctorBookedSlots` NOT going through the shared helpers is a bug.
2. Diff the save payload in `handleGenScheduleLink` against the read in `ClinicSchedule.jsx`. Each written field → used by the customer OR has a reason to be stored.
3. Open the `clinic_schedules` path in Firestore console and sample 3 recent docs — check required fields are present.
4. Run LK10 threat-model: if an attacker gets a leaked schedule URL, what do they see?

## Priority
**LK1, LK2, LK3** = CRITICAL — customer sees wrong data.
**LK4, LK7** = HIGH — correctness / legacy breakage.
**LK6, LK10** = MEDIUM — security posture.
**LK5, LK8, LK9** = LOW — robustness polish.

## Example violations from historical commits
- `updateActiveSchedules` ignored `selectedDoctorId`/`selectedRoomId` → fixed `f98c6ac`.
- `doctorBookedSlots` included doctor-in-staff-room → fixed `07a6c43`.
- Silent `.catch(() => {})` on resync writes → fixed `f98c6ac`.
