# 2026-06-29 — V164 doctor-only header + Recall blink + V164-fix + SKILL.md reconcile

## Summary
Shipped V164 (นัดหมาย header = doctor-only + Recall-วันนี้ pill blinks while pending) via brainstorming→spec→writing-plans→inline. User then reported the header showed "ไม่มีแพทย์เข้า" while a doctor WAS in → `/systematic-debugging` + Rule R real-prod diag found a **latent V64 data-match bug** (per-date `type='work'` shifts dropped by a literal `type==='override'` filter) → fixed via a canonical shared reader (V164-fix). Both DEPLOYED. Then reconciled the two divergent audit-anti-vibe-code SKILL.md copies into one AV1-199 union.

## Current State
- prod = `ef46aa8b` code (V164 + V164-fix) DEPLOYED (vercel --prod, frontend-only; firestore.rules UNCHANGED → no Probe-Deploy-Probe). lover-clinic-app.vercel.app HTTP 200.
- master `1582675f` (post-deploy docs + SKILL reconcile).
- full vitest **16995/16995 · 0 fail · success=true**; build clean.
- firestore.rules untouched all session.
- Idle.

## Commits
```
1582675f chore(skills): reconcile divergent audit-anti-vibe-code SKILL.md copies → one union
8e5a0e9c docs(agents): V164 + V164-fix DEPLOYED to prod
ef46aa8b docs(agents): V164-fix active.md state
ef40ff12 fix(appt): V164-fix — header showed "ไม่มีแพทย์เข้า" while a doctor WAS in (per-date "work" shift dropped)
a96c5998 docs(agents): V164 active.md state
76c1722b feat(appt): V164 doctor-only นัดหมาย header + Recall-วันนี้ blink while pending
850b3035 docs(spec): doctor-header + recall-blink design
```

## Files Touched
- V164: src/components/admin/AppointmentHubDoctorCards.jsx · AppointmentHubView.jsx · src/components/backend/recall/RecallTogglePill.jsx · src/index.css · tests/v164-doctor-header-and-recall-blink.test.jsx · tests/v64-appointment-hub-rtl.test.jsx (V21) · tests/v64-fix-staff-schedule-fields.test.js (V21)
- V164-fix: src/lib/staffScheduleValidation.js (export WORKING_TIME_TYPES + NEW deriveWorkingDoctorShiftsForDate) · AppointmentHubView.jsx (memo→helper) · TodaysDoctorsPanel.jsx (shared set) · tests/v164-… (SS1-9 + SG2) · tests/v64-fix-… (SC2 repoint) · .claude/skills/audit-anti-vibe-code/SKILL.md (AV199) · scripts/diag-v164-doctor-shifts-today.mjs + diag-v164-verify-fix.mjs
- Reconcile: .agents/+.claude/skills/audit-anti-vibe-code/SKILL.md (unified) · tests/skill-av-sync.test.js
- Spec/plan: docs/superpowers/{specs,plans}/2026-06-29-doctor-header-and-recall-blink.{html}

## Decisions (1-line)
- V164 Q1=A doctor-only · Q2=A blink full-swap · Q3=A reuse existing badge count.
- V164-fix: use the canonical `mergeSchedulesForDate` (override-wins) not an inline re-match → fixes leave-overrides-recurring too; exported WORKING_TIME_TYPES shared by 3 readers (Rule of 3).
- Root cause was latent since V64 (2026-05-09), NOT caused by V164 — V164 made it loud; honest disclosure.
- SKILL.md: the 2 copies were genuinely complementary (different AV sets), not stale dups — merged into a union written to both; a sync-guard test prevents recurrence. The cp-overwrite mishap I caused mid-fix was caught + reverted same session (rtk `diff` falsely said "identical").

## Lessons (full → v-log if escalated; AV199 covers the class)
- AV199: "who is working on date X" MUST use the canonical reader; literal stored `type==='override'` match forbidden (no such type; real per-date = work/halfday).
- Rule R real-prod diag (read the actual data shape) was decisive — the type distribution `{recurring:1, work:36}` instantly proved the filter never matched real shifts.
- `rtk`-proxied `grep`/`diff`/`node -e` are UNRELIABLE for regex/`{`/big output — used the Grep tool + PowerShell + git ground-truth instead.

## Next Todo
- Idle. User to confirm หมอมุก shows on their authed session (Rule Q L1 user-pending — auth-gated).
- Optional: commit the 2 untracked docs/filler-math-explainer.{html,pdf} (prior session).

## Resume Prompt
See SESSION_HANDOFF.md Resume Prompt (emitted in chat).
