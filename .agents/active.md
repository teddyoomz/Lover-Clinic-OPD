---
updated_at: "2026-05-26 EOD+2 — Frontend 4-tab removal + deposit-aware cancel dialog SHIPPED (LOCAL)"
status: "master e84d2538 — Part 1 (remove 4 tabs) + Part 2 (deposit-aware cancel dialog) complete + full suite GREEN + real-prod e2e PASS. NOT deployed (await explicit 'deploy'). prod still 65ab6467."
branch: "master"
last_commit: "e84d2538 test: V21 fixups for tab removal + AppointmentCalendarView dialog (T11)"
tests: "full suite 14712/14712 — 0 fail · real-prod e2e 31/0 (scripts/e2e-deposit-cancel-dialog.mjs) · build clean 3.34s"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "65ab6467 LIVE — tab-removal + deposit-cancel-dialog + appointment-hub + appointment-modal-deposit ALL NOT yet deployed"
firestore_rules_version: "unchanged (NO rules change — be_deposits/be_appointments already clinic-staff; no new index → no Probe-Deploy-Probe)"
---

# Active Context

## State
- **Part 1 — remove 4 Frontend tabs** (คิวหน้า Clinic / จองไม่มัดจำ / จองมัดจำ / ประวัติ): default landing → นัดหมาย + redirect guard; tab buttons removed (desktop + mobile dock); 5 dead render branches excised (~750 lines); deposit/noDeposit state + create-forms KEPT (still used by viewingSession resolver + สร้างคิวใหม่). Survivors: แชท · นัดหมาย · ตั้งค่า · หลังบ้าน.
- **Part 2 — deposit-aware cancel dialog** (AV132): NEW `resolveDepositCancelState` + shared `DepositAwareCancelDialog` wired into all 3 cancel surfaces (นัดหมาย / AppointmentCalendarView / Finance·มัดจำ). Hard-delete via `deleteDepositBookingPair` (Q3); "keep" preserves the other half; used-deposit blocks the delete. Fixes the Finance orphan-appt gap.

## What this session shipped
- Full /session-start → brainstorming (Visual Companion via AskUserQuestion previews) → spec → writing-plans → executing-plans inline (T1–T11, Rule K work-first/test-last).
- 11 V21-fixup test files (asserted removed render / old calview delete / 2nd patient-link trigger / 8-tab set) flipped to assert-removed / updated counts.
- Detail → `.agents/sessions/2026-05-26-tab-removal-deposit-cancel-dialog.md`

## Next action
- **Await explicit "deploy"** (V18) → `vercel --prod` (frontend + cron; NO rules → no Probe-Deploy-Probe). One deploy ships everything since prod 65ab6467.
- Post-deploy Rule Q **L1 by user**: 4 tabs (default นัดหมาย); cancel a deposit-appt → dialog (ลบทั้งคู่ / เก็บมัดจำ); same on calview delete + Finance·มัดจำ hard-delete; used-deposit → ลบมัดจำ disabled.

## Rule Q-honest scope
- Deposit-cancel LOGIC = L2 (real-prod e2e 31/0; REAL decision helper on REAL prod deposit shapes). Tab-removal RENDER = build + ternary-markers + full suite; real-browser render L1 = USER post-deploy (workstyle "ไม่ self-test UI" + auth-gated AdminDashboard) — disclosed, not driven by me.

## Outstanding user-triggered actions
- Deploy the combined stack (tab-removal + deposit-cancel-dialog + appointment-hub + appointment-modal-deposit) when ready.
- (carryover) V124-126 L1 verify · cron monitoring (passive).
