# 2026-06-04 EOD+1 — Doctor stale-name propagation FIXED (write + read) + FEFO18 cleanup — DEPLOYED

## Summary
`/systematic-debugging` on a user report: renaming a doctor in tab=doctors didn't update the appointment screen ("ไม่อัพเดทตามฐานข้อมูล"). Root-caused to TWO surfaces of one class — the WRITE never persisted the display name, and the READ rendered a frozen snapshot. Fixed both at the chokepoint + render layers, healed prod data (Rule M), deleted leaked FEFO18 test branches, and DEPLOYED (vercel-only).

## Current State
- master = `e56d2ac7` = Vercel prod `e56d2ac7` LIVE @ lover-clinic-app.vercel.app (aliased). HEAD `8de9e262` (docs).
- NO firestore.rules/storage change → vercel-only deploy, no Probe-Deploy-Probe.
- Prod DATA healed (Rule M, applied LIVE before deploy): be_doctors.name + 18 TEST-FEFO18-* docs deleted.
- doctor-name-compose 11/0 + appt-doctor-name-live-resolve 17/0 + build clean. Full vitest: 2 reds = pre-existing env-flakes only.

## Commits
```
e56d2ac7 fix(appointment): live-resolve doctor name at render — tab=doctors rename propagates to existing appts
861711a3 fix(doctor): recompute be_doctors.name at saveDoctor chokepoint + heal stale names; drop FEFO18 test branches
```

## Root cause (two surfaces, one class)
- **WRITE** — DoctorFormModal has NO `name` input; `saveDoctor` spread `{...form}` → setDoc(merge:false), carrying the OLD `name` verbatim. The appointment dropdown reads `be_doctors.name` (raw, line 1488/1538) → a rename updated firstname/nickname but never `name`. Prod: DOC-mpwmsm1i name="บริบูรณ์ วังแก้ว" vs nickname "หมอมุก"; ASST-mowphsbf name="".
- **READ** — appt views rendered `appt.doctorName` RAW (frozen snapshot at creation) at calendar:197 / detail-body:96 / agenda:87 / hub-card:369. Existing appts never tracked a rename. (Assistants already live-resolved via doctorMap — doctor was the lone raw field.)

## Fix
- `composeDoctorName(form)` (doctorValidation.js) = `(firstname+lastname).trim() || nickname`; `saveDoctor` recomputes `safe.name` every save (Rule O write-chokepoint). Test mock fixup (staff-doctor-hidden-filter +composeDoctorName).
- `resolveDoctorName(appt, doctorMap)` (appointmentDisplay.js, V108/V111/V113 class) = live name by doctorId → snapshot fallback. NEW `useDoctorMap` hook (one-shot listDoctors includeHidden; DEFENSIVE try/catch → degrades to snapshot, never crashes). Wired calendar + detail-body + agenda + hub (via hook + prop).
- Rule M (LIVE): `backfill-doctor-name.mjs --apply` (2 docs, forensic, 0 appt snapshots) + `cleanup-fefo18-test-pollution.mjs --apply` (18 docs: 3 branches + 3 products + 6 batches + 6 movements from e2e-stock-fefo-expiry leak).

## Files Touched
Source: src/lib/doctorValidation.js · src/lib/backendClient.js (saveDoctor) · src/lib/appointmentDisplay.js · src/hooks/useDoctorMap.js (NEW) · src/components/backend/{AppointmentCalendarView,AppointmentDetailBody,AppointmentAgendaView}.jsx · src/components/admin/{AppointmentHubView,AppointmentHubRowCard}.jsx
Tests: tests/{doctor-name-compose,appt-doctor-name-live-resolve}.test.js (NEW) · tests/staff-doctor-hidden-filter.test.js + tests/v73-row-card-advisor-fix.test.jsx + tests/appt-calendar-density.test.jsx (V21 fixups)
Scripts: scripts/{diag-doctor-name-and-test-branches,diag-doctor-name-composition,backfill-doctor-name,cleanup-fefo18-test-pollution}.mjs (NEW)

## Decisions (1-line)
- Write chokepoint (recompute name) beats a read-side fallback: a fallback can't fix a STALE non-empty name.
- Live-resolve at render (read) so the DB is the single source of truth — no more manual backfills; mirrors the proven assistant resolution.
- useDoctorMap made DEFENSIVE (try/catch) → fixes 15 hub RTL tests (partial scopedDataLayer mocks lacked listDoctors) AND hardens prod, vs patching 6 mocks future tests would re-break.
- 2 V21 source-grep lock-ins updated to the live-resolve shape (RC1.4 + calendar T6.4 agenda prop).
- be_staff "Mild"/"มายด์" left untouched (likely intentional EN display; not reported).

## Next Todo
- IDLE / await direction.
- USER L1 (the real proof): rename a doctor WITH existing appointments in tab=doctors → confirm dropdown AND existing calendar/hub cards show the new name automatically.

## Resume Prompt
Resume LoverClinic — continue from 2026-06-04 EOD+1.
Read: CLAUDE.md → SESSION_HANDOFF.md (master=e56d2ac7, prod=e56d2ac7) → .agents/active.md → .claude/rules/00-session-start.md → this checkpoint.
Status: master=e56d2ac7 = prod e56d2ac7 LIVE; doctor stale-name propagation fixed end-to-end (write chokepoint + live-resolve) + FEFO18 test-branch cleanup, all DEPLOYED + Rule-M data healed.
Next: idle / await direction.
Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe on rules.
/session-start
