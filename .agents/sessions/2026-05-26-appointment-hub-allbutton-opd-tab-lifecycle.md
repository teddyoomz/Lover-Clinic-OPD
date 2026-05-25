# Checkpoint — 2026-05-26 EOD+1 — Appointment-hub all-types button + "รอ/ยังไม่ลง OPD" tab + OPD-link auto-cleanup

## Summary

Four connected asks on the Frontend "นัดหมาย" (AppointmentHubView) tab + the patient-fill-link (`opd_sessions`) lifecycle. Full cycle: `/session-start` → `brainstorming` (Visual Companion via AskUserQuestion previews — Rule S: no live browser at ask/plan) → spec → `writing-plans` → `executing-plans` (11 tasks T1–T11, TDD, inline per V81/V86 baseline). SHIPPED LOCAL; full suite + real-prod e2e green; **NOT deployed** (await explicit "deploy", V18).

## Current State

- master = `b476f615`; prod UNCHANGED `65ab6467` (awaits "deploy"). The prior 2026-05-26 appointment-modal-deposit stack (`def9e256`) is ALSO not deployed → one "deploy" ships everything since prod `65ab6467`.
- Full vitest **14688** = 14687 pass + **1 KNOWN Phase 17.1 full-suite-load flake** (`CrossBranchImportModal R1.7`, `global.fetch`/`waitFor` timeout; **isolated 7/7** — untouched by this work, in cross-branch-import). Build clean.
- Real-prod e2e **7/0** (`scripts/e2e-opd-link-lifecycle.mjs`) — SAFE dry-run, NO prod mutation.
- **NO firestore.rules / composite-index change** → no Probe-Deploy-Probe. All client + cron + pure-helper.

## Architecture (the 4 features)

- **① All-types button** — `AppointmentHubView` ALREADY renders `AppointmentFormModal` for edit (line ~609); added a `creatingAppt` state mirroring `editingAppt` → renders the SAME modal in create mode (`lockedAppointmentType=null` → all 5 types incl. Walk-in). FilterBar button relabeled "เพิ่มคิว Walk-in"→"เพิ่มนัดหมาย" (prop `onAddWalkIn`→`onAddAppointment`, testid `walkin-btn`→`add-appt-btn`); AdminDashboard `onAddWalkIn→showSessionModal` kiosk wiring removed. **No new modal** (R1 parity automatic — same component+save-path as ปฏิทิน openCreate).
- **② OPD-pending pill** — 5th `TABS` entry `opd-pending` after `past`; NEW pure `isAppointmentOpdPending({appt,linkedSession})` = `resolveCardOpdState ∈ {B,C,D}` excl. cancelled; `opd-pending` cases in `dateRangeForTab` (today..today+30) + `defaultStatusFilterForTab` (excl cancelled). In-view: `filteredAppts` extra `isAppointmentOpdPending` filter (resolveLinkedSession join) + `opdPendingCount` memo merged into TabBar counts. R4=keep-all-types (state B includes any no-customer+no-link appt of any type).
- **③ Date-passed cron delete** — `decideCleanupAction(data, now, timeout, todayISO)` NEW 4th param + branch ABOVE the 2h-age check: `appointmentDate < todayISO → delete` (overrides V116 hide; fires even with patientData, Q3=A). Sessions don't store the appt date (R5) → `sweepOpdSessionCleanup` joins `be_appointments` by `linkedAppointmentId` (getAll) + stamps `appointmentDate` onto effective-data + passes Bangkok `todayISO`. Shared with the CLI mirror.
- **④ Delete-on-save** — hoisted `isFromBookingFlow` to handleOpdClick scope (shared by `_maybeOpenWalkInModal` early-return AND `_attachLinkedBookings`); best-effort `deleteDoc(opd_sessions/{sessionId})` inside `_attachLinkedBookings` gated on `isFromBookingFlow` (kiosk sessions never deleted — mutual exclusion with the walk-in modal; delete failure never rolls back the save).

## Commits (this session)

```
b476f615 test(opd): Rule Q L2 real-prod e2e — date-passed join+decision + dry-run + delete-on-save (③④)
a05f5512 test: V21 fixups — relabel button + hoisted isFromBookingFlow + attach-guard flip (①②④)
82e382a2 audit(AV131): OPD link lifecycle invariants (②③④)
413dc1f4 test(appt-hub): Rule I flow-simulate — tab/cleanup/save lifecycle chain
abba392c feat(opd): hard-delete link session on OPD-save success, gated on isFromBookingFlow (④)
b4340ad7 feat(opd-cleanup): cron joins be_appointments + Bangkok todayISO for date-passed delete (③)
3ee11854 feat(opd-cleanup): decideCleanupAction date-passed -> hard delete (③)
bd5101e2 feat(appt-hub): add รอ/ยังไม่ลง OPD pill + state filter + count (②)
dc89290a feat(appt-hub): isAppointmentOpdPending + opd-pending filter cases (②)
26dd2f6a feat(appt-hub): เพิ่มนัดหมาย all-types button reuses AppointmentFormModal in create mode (①)
2799a182 docs(plan) + 0b656792 docs(spec)
```

## Files Touched

- SRC: `src/components/admin/AppointmentHubFilterBar.jsx` · `src/components/admin/AppointmentHubView.jsx` · `src/components/admin/AppointmentHubTabBar.jsx` · `src/pages/AdminDashboard.jsx` · `src/lib/opdSessionState.js` · `src/lib/appointmentHubFilters.js` · `src/lib/opdSessionCleanupCore.js` · `api/cron/opd-session-cleanup-sweep.js`
- TESTS (new): `appt-hub-add-appointment-button` · `opd-pending-tab` · `opd-pending-tab-rtl` · `opd-session-date-passed-cleanup` · `opd-session-delete-on-save` · `appt-hub-opd-lifecycle-flow-simulate` · `av131-opd-link-lifecycle` · `scripts/e2e-opd-link-lifecycle.mjs`
- TESTS (V21 fixup): `v64-appointment-hub-rtl` · `v64-appointment-hub-flow-simulate` · `v116-link-survives-queue-delete` · `phase-24-0-vicies-novies-opd-save-auto-attach` · `phase-29-23-bis-admin-dashboard-source-grep`
- AUDIT: `.agents/skills/audit-anti-vibe-code/SKILL.md` (AV131)
- DOCS: spec + plan HTML `docs/superpowers/{specs,plans}/2026-05-26-appointment-hub-allbutton-opd-tab-lifecycle*`

## Decisions (1-line each)

- Q1 = B+C+D — tab shows every not-yet-in-OPD appt incl. "ยังไม่ส่งลิงก์" (B).
- Q2 = hard-delete obsolete `opd_session` (perf; data already in be_customers on save).
- Q3 = delete all date-passed links (override V116, even filled-but-unsaved D).
- Q4 = single all-types button reusing the existing modal (retire kiosk button wiring).
- R4 = keep-all-types in state B (user confirmed; not narrowed to booking-types).
- ① reuse-not-rebuild (user redirect: "เป็นปุ่มเดียวกัน shared กัน จะสร้าง modal ใหม่ทำเหี้ยไร").
- T2 plan-review catch: inlined `onSaved` instead of a `useCallback` before `loadAll` (TDZ).
- T9 SAFE deviation: dry-run sweep + targeted decision check (apply:true would mutate real prod via undeployed logic = Rule M).

## Next Todo

- Await explicit "deploy" → `vercel --prod` (frontend + cron; no rules).
- Post-deploy Rule Q **L1 (user)**: pick เพิ่มนัดหมาย → all-types modal saves like ปฏิทิน; new pill renders+filters; past-dated link auto-gone after cron; saved booking leaves the tab + link gone.
- Real-prod note: the dry-run found 1 real obsolete link (date passed) the deployed cron will reap.

## Resume Prompt

```text
Resume LoverClinic — continue from 2026-05-26 EOD+1.

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=b476f615, prod=65ab6467 LIVE)
3. .agents/active.md (14688 tests)
4. .claude/rules/00-session-start.md (iron-clad + V-summary; Rule Q + Q-honest + Q-vis)
5. .agents/sessions/2026-05-26-appointment-hub-allbutton-opd-tab-lifecycle.md

Status: master=b476f615, full suite 14688 (1 known Phase 17.1 flake; isolated 7/7), real-prod e2e 7/0, build clean, prod=65ab6467 LIVE. Appointment-hub ①②③④ + (carryover) appointment-modal-deposit SHIPPED LOCAL — NOT deployed.
Next: await explicit "deploy" → vercel --prod (frontend + cron; NO rules → no Probe-Deploy-Probe) → then user Rule Q L1.
Outstanding (user-triggered): deploy this stack (ships everything since 65ab6467) · L1 verify ①②③④ + V124-126.
Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe on rules; Rule Q + Q-honest + Q-vis (real-adversarial; disclose the test-vs-claim gap; verify pixels with eyes).
/session-start
```
