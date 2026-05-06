# Session 2026-05-06 EOD continuation 5 — Phase 24.0-undecies through vicies-octies

## Summary
12 commits in rapid user-driven iteration on kiosk จองมัดจำ flow + Finance.มัดจำ + appointment-grid cascades. Pattern: user reports bug → fix + targeted tests → user spots next bug → fix → repeat. NEW iron-clad **Rule N** (targeted-test-only for small bugfixes) added mid-batch.

## Current State
- master=`f9aefb1` · 6442/6442 tests pass · build clean
- prod frozen at `024f6dd` (V15 #22 LIVE 2026-05-05); no-deploy directive active
- master ahead-of-prod ~62 commits
- 12 NEW test files (~290 tests new in batch)
- iron-clad rules now A–N

## Commits

```
f9aefb1 feat(phase-24-0-vicies-octies): Finance ไปที่นัด button + AppointmentCalendarView initialSelectedDate
8dc907b fix(phase-24-0-vicies-septies): extract createDeposit().depositId + coerceId on read paths
8b61a2f fix(phase-24-0-vicies-sexies): kiosk add-appt cascade error surfacing + listener-race defense
98aa6be fix(phase-24-0-vicies-quinquies): kiosk delete + appointment-tab delete = HARD-delete pair
be32427 fix(phase-24-0-vicies-quater): paymentAmount input wheel-scroll bug (2000 → 1999)
39a4f22 feat(phase-24-0-vicies-ter): deposit-card edit-appt link + archive cascade-deletes pair
2e68f4f feat(phase-24-0-vicies-bis): kiosk-cancel cascade + Rule N targeted-tests
91a3190 feat(phase-24-0-vicies): kiosk deposit-edit cascades + Finance visitPurpose + noDeposit name/phone
5e5aba1 feat(phase-24-0-noniesdecies): + สร้างนัด button + auto-create be_appointments on kiosk-edit
dce5a20 feat(phase-24-0-terdecies..octiesdecies): customer-later flow + grid race fix + cascades
feb31eb feat(phase-24-0-duodecies): OPD banner ดู/แก้ไขข้อมูลลูกค้า + edit-mode deep-link
1c84bc1 feat(phase-24-0-undecies): kiosk visitPurpose 'อื่นๆ' detail input + Finance column wrap
```

## Files Touched
**Source**:
- `src/pages/AdminDashboard.jsx` — kiosk modals + handleSaveDepositData + handleDepositCancel + confirmCreateDeposit + OPD banner buttons
- `src/pages/BackendDashboard.jsx` — deep-link `?date=` + edit-mode `?mode=edit` reads + initialApptDate state
- `src/components/backend/DepositPanel.jsx` — Finance column wrap + ลูกค้าจอง badge + + สร้างนัด + ไปที่นัด + paymentAmount input
- `src/components/backend/AppointmentFormModal.jsx` — pickLater toggle + temp fields + dual cascade on edit + existingDepositId prop
- `src/components/backend/AppointmentCalendarView.jsx` — branch-switch grid race fix + delete cascade + initialSelectedDate prop + grid card temp display
- `src/lib/appointmentDepositBatch.js` — 5 NEW helpers (attachCustomerToLinkedDeposit / syncAppointmentToLinkedDeposit / syncCustomerTempToLinkedDeposit / createAppointmentForExistingDeposit / deleteDepositBookingPair)
- `src/lib/customerNavigation.js` — buildCustomerEditUrl + openCustomerEditInNewTab
- `src/lib/visitPurposeUtils.js` — NEW (buildVisitPurposeText + parseVisitPurposeText)

**Rules**:
- `.claude/rules/00-session-start.md` — NEW Rule N (targeted-test-only for small bugfixes)
- `CLAUDE.md` — Rule N entry in iron-clad index

**Tests** (NEW files):
- `tests/phase-24-0-undecies-visit-purpose-other.test.js` (52)
- `tests/phase-24-0-duodecies-opd-banner-customer-buttons.test.js` (30)
- `tests/phase-24-0-terdecies-customer-later-flow.test.js` (35)
- `tests/phase-24-0-quaterdecies-channel-and-required-fields.test.js` (26)
- `tests/phase-24-0-quinquiesdecies-deposit-no-appt-and-resync.test.js` (18)
- `tests/phase-24-0-sexiesdecies-branch-switch-grid-race.test.js` (12)
- `tests/phase-24-0-septiesdecies-customer-later-fixes.test.js` (24)
- `tests/phase-24-0-octiesdecies-sync-appt-to-deposit.test.js` (17)
- `tests/phase-24-0-noniesdecies-add-appointment-to-deposit.test.js` (29)
- `tests/phase-24-0-vicies-finance-cascade-fixes.test.js` (29)
- `tests/phase-24-0-vicies-bis-kiosk-cancel-cascade.test.js` (12)
- `tests/phase-24-0-vicies-ter-deposit-edit-link-and-archive-cascade.test.js` (16)
- `tests/phase-24-0-vicies-quater-payment-amount-wheel-fix.test.js` (13)
- `tests/phase-24-0-vicies-quinquies-hard-delete-deposit-booking-pair.test.js` (20)
- `tests/phase-24-0-vicies-sexies-add-appt-cascade-error-surfacing.test.js` (11)
- `tests/phase-24-0-vicies-septies-create-deposit-shape-coerce.test.js` (15)
- `tests/phase-24-0-vicies-octies-finance-goto-appointment.test.js` (22)

**V21-flips** (existing tests updated to lock NEW shape):
- `phase-21-0-deposit-booking-pair-helper` (P1.1 8-hex suffix)
- `phase-21-0-appointment-calendar-view-typed` (C1.5 typedDayAppts gate)
- `phase-21-0-quinquies-visual-polish` (D4 + D6 — wrap + width)
- `phase-22-0b-kiosk-modal-branch-correctness` (A3.4 + A3.6)
- `phase-23-0-kiosk-canonical-and-modal-fixes` (B.2 APPT_CHANNELS_STATIC)
- `phase-20-0-flow-b-deposit-flow-simulate` (B5.2 — accept deleteDepositBookingPair)
- `phase-20-0-task-5c-deposit-sync` (W4.2)

## Decisions (one-line each)
- **Rule N** added mid-batch after user feedback "ไม่ต้องรัน full suite test ทุกครั้งที่แก้บั๊คอะไรเล็กๆน้อยๆแบบนี้" — codifies targeted-first/full-end-of-batch rhythm.
- HARD-delete (vicies-quinquies) chosen over soft-cancel for kiosk + appt-tab delete — soft-cancelled docs were polluting Finance list + date-strip bubble counter.
- `cancelDepositBookingPair` preserved for Finance.มัดจำ admin-cancel where audit may matter (asymmetric helper choice).
- `coerceId` healer (vicies-septies) at 4 callsites instead of one-shot migration — heals legacy `{depositId,success}` object on next save without script.
- `<input type="text" + inputMode="numeric" + sanitizer + onWheel-blur>` is the canonical defense against `type="number"` wheel-scroll decrement (vicies-quater).
- Branch-switch grid race fixed via `roomsBranchTag === selectedBranchId` gate + cancellation flag (sexiesdecies).
- New-tab pattern (`window.open(url, '_blank', 'noopener,noreferrer')`) reused 5× (Phase 24.0-duodecies + customerNavigation + DepositPanel ไปที่นัด).

## Next Todo
Idle. Awaiting user directive.

## Resume Prompt
See `SESSION_HANDOFF.md` `## Resume Prompt` block.
</content>
</invoke>