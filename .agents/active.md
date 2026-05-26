---
updated_at: "2026-05-27 EOD+9 — deposit-without-appointment + Finance deposit modernize (LOCAL, not pushed/deployed)"
status: "Feature complete + tested LOCAL. master tip ff9a775d (+EOD docs commit) — 10+ commits ahead of origin/master 9209ec70, NOT pushed. prod UNCHANGED = 0805da87 (V122). Full suite 14929/0; build clean; real-prod L2 e2e 21/0. Awaiting user push/deploy word (V18)."
branch: "master"
last_commit: "ff9a775d test(deposit): Rule Q L2 e2e (feature tip) + EOD docs commit on top"
tests: "full suite 14929 pass / 0 fail. build clean. deposit no-appt e2e 21/0 (real prod). 2 pre-existing flakes (Phase 17.1 + genShortId, probabilistic) pass on clean run."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "0805da87 LIVE (V122) — UNCHANGED this session (feature NOT deployed)"
firestore_rules_version: "UNCHANGED (no rules/data/cron touched — frontend+serverless only; no Probe-Deploy-Probe when deployed)"
---

# Active Context

## State
- Deposit-without-appointment feature DONE + tested, LOCAL on master (10+ commits ahead of origin, NOT pushed/deployed per V18).
- Flow: brainstorm → spec.html → plan.html → execution (subagent-driven attempted, switched to INLINE per user + a 1M-context credits error). 9 tasks, all on master (user: "merge branch to master").
- Verify: full suite 14929/0 · build clean · Rule Q L2 real-prod e2e 21/0 · flow-simulate + source-grep + VisitPurposePicker RTL. L1 (real-browser UI) = USER (these modals are never RTL-mounted in repo; Rule Q V66 — no mocks-that-lie).

## What this session shipped (detail: .agents/sessions/2026-05-27-deposit-no-appointment.md)
- Part 1: AppointmentFormModal `ไม่นัดหมาย` toggle (deposit-booking only) → hides appt fields (date/time/หมอ/ห้อง/recurring) + skips appt validations → writes a deposit-only doc; advisor→100% seller; purpose=appointmentTo; still supports +สร้างนัด later.
- Part 2: Finance DepositPanel `เลือกลูกค้าภายหลัง` + `มัดจำสำหรับ` (VisitPurposePicker new `label` prop) + table `|| dep.purpose` fallback; all money fields kept (Q2 port-all).
- be_deposits +3 fields (purpose/customerNameTemp/customerPhoneTemp); createDeposit stamps them + guards recalc on empty customerId.
- 10 commits + spec/plan HTML; 7 V21 source-grep fixups (tests locked old shapes).

## Next action
- idle — awaiting user: push master? / deploy (frontend+serverless, NO Probe-Deploy-Probe)? / L1 hands-on. (Optional: Chrome MCP visual check of toggle.)

## Outstanding user-triggered actions
- push master (10+ commits, local) + deploy — both await explicit word (V18).
- L1 hands-on: appt → สร้าง → จองมัดจำ → ติ๊ก ไม่นัดหมาย → save → Finance.มัดจำ row + มัดจำสำหรับ col + ลูกค้าจอง badge → +สร้างนัด.
- 2 pre-existing Rule S doc edits (CLAUDE.md, rules/01-iron-clad.md) still uncommitted (user's).
