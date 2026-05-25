# Checkpoint — 2026-05-26 EOD+2 — Frontend 4-tab removal + deposit-aware cancel dialog

## Summary

Two connected asks: (1) remove 4 redundant Frontend admin tabs — คิวหน้า Clinic / จองไม่มัดจำ / จองมัดจำ / ประวัติ (unified into นัดหมาย); (2) when cancelling/deleting a deposit-booking, ASK "ลบมัดจำด้วย / เก็บไว้" instead of silently cascading or orphaning. Full cycle: `/session-start` → `brainstorming` (Visual Companion via AskUserQuestion previews — Rule S: no live browser at ask/plan) → spec HTML → `writing-plans` HTML → `executing-plans` inline (11 tasks T1–T11, Rule K work-first/test-last). SHIPPED LOCAL; full suite + real-prod e2e green; **NOT deployed** (await explicit "deploy", V18).

## Current State

- master = `e84d2538`; prod UNCHANGED `65ab6467`. One "deploy" ships everything since prod `65ab6467` (this stack + appointment-hub + appointment-modal-deposit).
- Full vitest **14712/14712 — 0 fail** (Phase 17.1 flake passed this run too). Build clean ✓ 3.34s.
- Real-prod e2e **31/0** (`scripts/e2e-deposit-cancel-dialog.mjs`): Phase A ran the REAL `resolveDepositCancelState` on 11 REAL prod deposits (6 used→blocked) + B-F verified both/appt-keep/used-block cascade outcomes on TEST- fixtures; cleanup 0 orphans + audit doc.
- **NO firestore.rules / composite-index change** → no Probe-Deploy-Probe. All client + pure-helper + cron-untouched.

## Architecture

### Part 1 — Remove 4 tabs (hard delete)
- Default `adminMode` `'dashboard'` → `'appointment'` (`:515`) + redirect guard in the `setAdminMode` wrapper (`REMOVED_ADMIN_MODES` → 'appointment'; single chokepoint, `setAdminModeRaw` is private). All `setAdminMode('dashboard')` nav repointed.
- Removed 4 desktop tab buttons + mobile dock (คิว tab + จอง picker trigger + จอง BottomSheet + ประวัติ from more-drawer). Survivors: แชท · นัดหมาย · ตั้งค่า · หลังบ้าน.
- Excised the 5 now-unreachable render branches (history/deposit/depositHistory/noDeposit/noDepositHistory, ~750 lines) from the main ternary (chain now chat→clinicSettings→appointment) via Edit (small branches) + line-range delete (big consecutive run, bottom-up, build+grep verified). Removed orphaned `showMobileJongPicker`.
- **KEPT** (not orphaned): deposit/noDeposit state + create-forms + listener slices — still read by the `viewingSession` OPD-modal resolver (`:2547`) + the สร้างคิวใหม่ create flow. The dashboard-queue fallback render stays (unreachable, harmless).

### Part 2 — Shared deposit-aware cancel dialog (Rule C1)
- NEW pure `src/lib/depositCancelDecision.js` `resolveDepositCancelState(deposit)` → `{hasDeposit, depositId, amount, usedAmount, remainingAmount, blocked, status}` (blocked = usedAmount>0).
- NEW `src/components/admin/DepositAwareCancelDialog.jsx` — orientation `'appt'|'deposit'`; fetches deposit via `getDeposit`; emits `'both'|'this-only'|'cancel'`; disables delete option(s) when blocked. Explicit-close (AV78).
- Wired into 3 surfaces: **Frontend นัดหมาย** (AppointmentHubView handleCancelOptimistic → AdminDashboard `onCancelAppt(appt,{deleteDeposit})`: both → `deleteDepositBookingPair`, else V125 appt-only) · **Backend AppointmentCalendarView** appt-delete · **Backend Finance·มัดจำ DepositPanel** hard-delete (both → `deleteDepositBookingPair`, this-only → `deleteDeposit` — fixes orphan-appt gap). `AppointmentFormModal` flip-away left as-is (type-change, own dialog).
- **NEW AV132** invariant.

## Decisions (locked via Q&A)
- Q1 = นัดหมาย default landing · Q2 = นัดหมายครอบคลุมหมด (no separate arrival surface) · Q3 = ลบหายเลย hard-delete (`deleteDepositBookingPair`) · Q4 = ทุกที่ที่ยกเลิกได้ (all 3 surfaces).
- Spec refinement at impl: Finance dialog wired to the HARD-delete button (`handleDelete`, fixes orphan-appt) not the soft cancel-with-note modal (kept as audit flow).

## Commits (this session, ~14)
spec + plan → T1 helper → T2 dialog → T3 นัดหมาย → T4 calview → T5 DepositPanel → T6 default+guard → T7 tab buttons → T8 excise render → T9 test bank+V21 → T10 AV132+e2e → T11 (`e84d2538`) V21 fixups. (11 V21 test files updated total across T9+T11.)

## Files
- SRC new: `src/lib/depositCancelDecision.js` · `src/components/admin/DepositAwareCancelDialog.jsx`
- SRC modified: `AppointmentHubView.jsx` · `AdminDashboard.jsx` · `AppointmentCalendarView.jsx` · `DepositPanel.jsx`
- TESTS new: `deposit-cancel-decision` · `deposit-cancel-dialog-rtl` · `deposit-cancel-flow-simulate` · `frontend-tab-removal-source-grep` · `scripts/e2e-deposit-cancel-dialog.mjs`
- TESTS V21-fixup (11): menu-variant-a-v2-source-grep · phase-25-0-walk-in-tab-rename · v125-cancel-cascade · phase-24-0-{terdecies,undecies,vicies-ter,vicies-quinquies} · phone-link-tappable-customer-phone · v118-card-opd-lifecycle-row-source-grep · v87-link-button-opd-save-guard · v88-header-cosmetic-harmony
- AUDIT: `audit-anti-vibe-code/SKILL.md` (AV132)
- DOCS: spec+plan HTML `docs/superpowers/{specs,plans}/2026-05-26-frontend-tab-removal-deposit-cancel-dialog*`

## Rule Q-honest scope
- Deposit-cancel LOGIC = L2 real-prod e2e (31/0) + the REAL decision helper run on REAL prod deposit shapes (V66 mirror-risk addressed). Cascade helpers (`deleteDepositBookingPair`/`deleteDeposit`) pre-existing + proven.
- Tab-removal RENDER = build clean + ternary-markers grep + full suite (14712/0). **Real-browser render L1 = USER post-deploy** (per workstyle "ไม่ self-test UI" + auth-gated AdminDashboard). I did NOT drive a real browser on AdminDashboard — disclosed.

## Next Todo
- Await explicit "deploy" → `vercel --prod` (frontend + cron; NO rules).
- Post-deploy Rule Q **L1 (user)**: Frontend admin shows 4 tabs (default นัดหมาย); cancel a deposit-appt in นัดหมาย → dialog → ลบทั้งคู่ vs เก็บมัดจำ; same dialog on AppointmentCalendarView delete + Finance·มัดจำ hard-delete; used-deposit → ลบมัดจำ disabled.

## Resume Prompt

```text
Resume LoverClinic — continue from 2026-05-26 EOD+2.

Read: CLAUDE.md · SESSION_HANDOFF.md (master=e84d2538, prod=65ab6467 LIVE) · .agents/active.md · .claude/rules/00-session-start.md (Rule Q + Q-honest + Q-vis) · .agents/sessions/2026-05-26-tab-removal-deposit-cancel-dialog.md

Status: master=e84d2538, full suite 14712/0, build clean, real-prod e2e 31/0, prod=65ab6467. Frontend 4-tab removal + deposit-aware cancel dialog SHIPPED LOCAL (+ appointment-hub + appointment-modal-deposit) — NOT deployed.
Next: await explicit "deploy" → vercel --prod (frontend + cron; NO rules) → user Rule Q L1.
Rules: no deploy without "deploy" THIS turn (V18); Rule Q + Q-honest + Q-vis.
/session-start
```
