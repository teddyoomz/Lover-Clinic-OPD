---
updated_at: "2026-05-06 — V15 #15 LIVE; Phase BS branch-selector shipped"
status: "master=83d8413 · prod=83d8413 LIVE (V15 #15) · 4744 tests pass · in-sync"
current_focus: "Phase BS LIVE. Customer-branch baseline migration UI ready. Awaiting admin to run dry-run + apply via MasterDataTab."
branch: "master"
last_commit: "83d8413"
tests: 4744
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "83d8413"
firestore_rules_version: 24
storage_rules_version: 2
---

# Active Context

## State
- master = `83d8413` · production = `83d8413` (V15 #15 LIVE 2026-05-06) · **in-sync**
- 4744/4744 tests pass · build clean · firestore.rules v24 (unchanged — idempotent re-publish)
- Phase BS multi-branch backend ALL LIVE.

## What this session shipped
- **V15 #15 combined deploy** (2026-05-06) — vercel + firebase rules; Probe-Deploy-Probe Rule B 6/6 pre + 6/6 post + cleanup 4/4 + HTTP smoke (/ 200, /admin 200, line webhook 401-LINE-sig). Vercel build 2.47s, aliased `lover-clinic-app.vercel.app`. Rules idempotent (no rule changes Phase BS).
- **Phase BS — Backend Branch Selector** (`83d8413`):
  - Top-right BranchSelector now consumes `useUserScopedBranches()` (NEW hook in BranchContext.jsx) — per-staff `branchIds[]` soft-gate.
  - Customer doc gains immutable `branchId` tag (CREATE-stamp via addCustomer + cloneOrchestrator; updateCustomerFromForm STRIPS branchId from both opts AND form before write).
  - CustomerDetailView shows "สาขาที่สร้างรายการ" InfoRow via `resolveBranchName`.
  - 5 picker sites filter staff/doctors via NEW `branchScopeUtils.js` (empty branchIds = all-branches backward compat).
  - 5 listers (`getAllSales/getAppointmentsByMonth/getAppointmentsByDate/listExpenses/listQuotations`) accept `{branchId, allBranches}`. UI tabs pass `branchId`; aggregators explicit `allBranches:true`. Doctor-collision check uses `allBranches:true` (a doctor can only be in one place at a time).
  - NEW `/api/admin/customer-branch-baseline` endpoint (dry-run + apply, audit doc to `be_admin_audit/customer-branch-baseline-{ts}`) + MasterDataTab UI section "Backfill ลูกค้า → สาขา default".
  - V36.G.51 audit: extracted pure JS `branchSelection.js` so backendClient + cloneOrchestrator don't import .jsx (no React leak into data layer).
  - Tests: +132 net (8 new BS-A through BS-H files), 6 existing tests adjusted for new contract.

## Decisions (4 brainstorm Qs locked 2026-05-06)
- Q1 Customer field: existing `branchId` (no new createdInBranchId field; immutable after CREATE)
- Q2 Permission gate: soft-gate UI v1 (Firestore rules unchanged; hard-gate via custom claim deferred)
- Q3 Reader scope: targeted (5 high-traffic listers + aggregator opt-out)
- Q4 Tab placement: top-right BackendDashboard (already mounted there pre-Phase BS — only scope filter added)

## Next action
**Admin runs customer-branch-baseline dry-run** via MasterDataTab → "Backfill ลูกค้า → สาขา default" panel. Then applies if dry-run looks clean. Endpoint writeBatches up to 500/commit + audit doc per batch.

After backfill: branch-selector feature is fully usable. New branches can be added via BranchesTab; per-staff access via StaffFormModal `branchIds[]`.

## Outstanding user-triggered actions
- **Customer-branch baseline migration** (one-shot — admin runs dry-run + apply via MasterDataTab)
- **Add Rule L**: AI model routing for sub-agent dispatch (Opus 4.7 1M for plan/test, cheaper AI for code-writing per task) — Rule L wording captured in plan file `selector-cozy-avalanche.md` "Out of Scope" section
- **Hard-gate via Firebase custom claim** (Phase BS-future) — Firestore rules check `resource.data.branchId in claim.branchIds`
- 16.8 `/audit-all` orchestrator-only readiness check
- Phase 17 plan TBD

## Rules in force
- V18 deploy auth (per-turn explicit "deploy"; no roll-over)
- V15 combined deploy (vercel + firestore:rules + Probe-Deploy-Probe Rule B)
- Rule J brainstorming HARD-GATE + ORTHOGONAL plan-mode
- Rule K work-first, test-last for multi-stream cycles
- Rule H-quater no master_data reads in feature code
- Phase BS branchId IMMUTABILITY contract on customer doc (set once at CREATE, never overwrite on UPDATE)
- V36.G.51 lock: data layer (backendClient/lib/api) MUST NOT import BranchContext.jsx — pure JS via branchSelection.js
- NO real-action clicks in preview_eval
- V31 silent-swallow lock
