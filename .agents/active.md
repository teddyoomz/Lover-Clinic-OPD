---
updated_at: "2026-05-06 EOD — Phase 23.0 + Phase 24.0 customer-delete trilogy SHIPPED"
status: "master ahead-of-prod ~50 commits · prod=024f6dd FROZEN · 6056/6056 tests pass · local-only workflow"
branch: "master"
last_commit: "4240abc"
tests: 6056
production_url: "https://lover-clinic-app.vercel.app (FROZEN at V15 #22)"
production_commit: "024f6dd"
firestore_rules_version: 26
---

# Active Context

## State
- master=`4240abc` · 6056/6056 tests pass · build clean
- prod frozen at `024f6dd` (V15 #22 LIVE 2026-05-05); no-deploy directive active
- Local dev via `npm run dev`; data ops via Rule M admin-SDK + `vercel env pull`

## What this session shipped
- Phase 21.0 + 22.0 trilogies merged from side-branch (15 commits fast-forward)
- Phase 23.0 — kiosk modal channel dropdown + 4 explicit branchId stamps + sparse-patient bug fix (V12 mirror) + cache schema-version guard
- **Phase 24.0 customer-delete suite** (main + bis through decies, ~25 commits):
  - Cascade delete 11 collections + audit doc + dual perm gate (`customer_delete` || isAdmin)
  - 1-dropdown authorizer (collapsed from 3 via optgroup); HN counter monotonic-no-reuse regression-locked
  - Client-side Firestore path (no /api/admin fetch — works on `npm run dev`) + graceful-skip 5 rule-locked collections
  - Force-refresh token + best-effort audit + identity-based dedup recovery (citizen_id/passport/phone match before re-create)
  - kiosk Thai gender translation (ชาย/หญิง/LGBTQ+ → M/F/LGBTQ); customer_type='ลูกค้าทั่วไป' auto; emergencyRelation → contact_1_relation canonical
  - หมายเหตุทั่วไป amber box on CustomerDetailView left column

Detail: `.agents/sessions/2026-05-06-phase-23-24-trilogy.md`

## Next action
Idle. Open new chat for next directive.

## Outstanding (user-triggered)
- 🚨 H-bis ProClinic full strip (`brokerClient.js` + `api/proclinic/*` + `cookie-relay/` + `MasterDataTab` + `clinic_settings/proclinic_session*`)
- Hard-gate Firebase custom claim (deploy-coupled — skipped under no-deploy)
- /audit-all pre-release pass
- BackendDashboard nav restructure (deferred from Phase 20.0 EOD)
