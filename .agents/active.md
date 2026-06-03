---
updated_at: "2026-06-04 EOD+1 — Doctor-name propagation FIXED end-to-end (write chokepoint + live-resolve) + FEFO18 test-branch cleanup. DEPLOYED to prod."
status: "Renaming a doctor in tab=doctors now propagates automatically — saveDoctor recomputes be_doctors.name (write) + appointment views live-resolve doctorName at render (read). No more manual backfills. Deployed."
branch: "master"
last_commit: "e56d2ac7 (live-resolve doctor name at render). Prev: 861711a3 (saveDoctor name chokepoint + FEFO18 cleanup)."
tests: "doctor-name-compose 11/0 + appt-doctor-name-live-resolve 17/0 + build clean. Full vitest 16247 → 16245 pass / 2 PRE-EXISTING env-flakes (bsa-task7 execSync git-grep + v85-glow grep-PATH; zero overlap with diff). 15 hub-render fails (my hook) FIXED via defensive useDoctorMap; 6 hub files re-run green."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "Vercel prod = e56d2ac7 (DEPLOYED this session, aliased, live). Was 0e80af8d. vercel-only — NO firestore.rules change → no Probe-Deploy-Probe."
firestore_rules_version: "UNCHANGED."
---

# Active — 2026-06-04 EOD+1 — Doctor-name propagation fixed (write + read) + deployed

## State
- master `e56d2ac7` = Vercel prod `e56d2ac7` (DEPLOYED, aliased, live). Tree: only docs/handoff pending.
- Prod DATA already healed earlier (Rule M, LIVE): be_doctors.name (บริบูรณ์ วังแก้ว→หมอมุก, ""→ยาหยี) + 18 TEST-FEFO18-* docs deleted.

## What this session shipped (/systematic-debugging — user "ไม่อัพเดทตามฐานข้อมูล")
- **Surface 1 — WRITE (861711a3)**: DoctorFormModal has no `name` input; old saveDoctor carried `name` verbatim → renames never persisted the display name. Fix: `composeDoctorName` (doctorValidation.js) + saveDoctor recomputes `safe.name` every save. + Rule M backfill of the 2 stale docs.
- **Surface 2 — READ (e56d2ac7)**: appt views rendered `appt.doctorName` RAW (frozen snapshot) at calendar/agenda/detail-body/hub-card → existing appts never tracked a rename. Fix: NEW `resolveDoctorName(appt, doctorMap)` (appointmentDisplay.js, V108/V111/V113 class) + NEW `useDoctorMap` hook (defensive: degrades to snapshot, never crashes) wired at all 4 sites.
- **Cleanup**: deleted leaked FEFO18 stock-test pollution (Rule M, idempotent, audited).

## Next action
- IDLE / await direction. Both surfaces deployed; data healed.

## Outstanding user-triggered actions
- **L1 hands-on (the real proof)**: rename a doctor (esp. one WITH existing appointments) in tab=doctors → confirm the appointment dropdown AND existing appointment cards (calendar/hub) show the new name automatically, no backfill.
- be_staff `STAFF-mofkgy4e` name="Mild" vs firstname="มายด์" — left as-is (likely intentional EN display; not reported). Say so to normalize.
- 2 pre-existing env-flake tests (bsa-task7 execSync git-grep POSIX-redir + v85-glow grep-PATH) — pass when git-bash/grep is on PATH; unrelated to this work.
