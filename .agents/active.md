---
updated_at: "2026-05-06 EOD continuation 5 — Phase 24.0-undecies through vicies-octies SHIPPED + Rule N"
status: "master ahead-of-prod ~62 commits · prod=024f6dd FROZEN · 6442/6442 tests pass · local-only workflow"
branch: "master"
last_commit: "f9aefb1"
tests: 6442
production_url: "https://lover-clinic-app.vercel.app (FROZEN at V15 #22)"
production_commit: "024f6dd"
firestore_rules_version: 26
---

# Active Context

## State
- master=`f9aefb1` · 6442/6442 tests pass · build clean
- prod frozen at `024f6dd` (V15 #22 LIVE 2026-05-05); no-deploy directive active
- NEW iron-clad **Rule N** (targeted-test-only for small bugfixes, full-suite for big/end-of-batch)

## What this session shipped (~12 commits — Phase 24.0-undecies through vicies-octies)
- **24.0-undecies** (`1c84bc1`) — kiosk visitPurpose "อื่นๆ" detail input + Finance column wrap
- **24.0-duodecies** (`feb31eb`) — OPD banner ดู/แก้ไขข้อมูลลูกค้า buttons + edit-mode deep-link
- **24.0-terdecies..octiesdecies** (`dce5a20`) — customer-later flow + grid race fix + cascade-customer-attach + appt-meta-sync
- **24.0-noniesdecies** (`5e5aba1`) — Finance "+ สร้างนัด" button + auto-create be_appointments on kiosk-edit-add-appt
- **24.0-vicies** (`91a3190`) — kiosk deposit-edit cascades + Finance visitPurpose + noDeposit name/phone propagation
- **24.0-vicies-bis** (`2e68f4f`) — kiosk-cancel cascade + Rule N iron-clad
- **24.0-vicies-ter** (`39a4f22`) — deposit-card edit-appt link + archive cascade
- **24.0-vicies-quater** (`be32427`) — paymentAmount wheel-scroll bug fix (2000→1999)
- **24.0-vicies-quinquies** (`98aa6be`) — kiosk + appt-tab delete = HARD-delete pair (no soft-cancel orphans)
- **24.0-vicies-sexies** (`8b61a2f`) — kiosk add-appt cascade error surfacing + listener-race defense
- **24.0-vicies-septies** (`8dc907b`) — extract createDeposit().depositId + coerceId on read paths
- **24.0-vicies-octies** (`f9aefb1`) — Finance "ไปที่นัด" button + AppointmentCalendarView initialSelectedDate

Detail: `.agents/sessions/2026-05-06-phase-24-0-undecies-thru-vicies-octies.md`

## Next action
Idle. Open new chat for next directive.

## Outstanding (user-triggered)
- 🚨 H-bis ProClinic full strip (`brokerClient.js` + `api/proclinic/*` + `cookie-relay/` + `MasterDataTab` + `clinic_settings/proclinic_session*`)
- Hard-gate Firebase custom claim (deploy-coupled — skipped under no-deploy)
- /audit-all pre-release pass
- BackendDashboard nav restructure (deferred from Phase 20.0 EOD)
</content>
</invoke>