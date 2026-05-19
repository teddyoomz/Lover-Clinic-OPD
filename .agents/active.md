---
updated_at: "2026-05-19 LATE+3 — V101+V102+V103 LIVE · refund + branchId + course-decrement class-of-bug closed"
status: "🚀 master = prod. V101+V102+V103 deployed via 2 combined deploys. 3 user-reported bugs CLOSED. Rule M backfills applied to วันเพ็ญ."
branch: "master"
last_commit: "fix(V103): terminal-status filter on customer.courses[] active readers + AV90"
tests: "V101 18 + V102 29 + V103 27 = 74 cumulative GREEN · 1014 wider regression V8/V9/V10/V101/V102/V103 PASS · 0 fail"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "V103 LIVE — lover-clinic-gtihropqd-... aliased 12:35:37 UTC 2026-05-19"
firestore_rules_version: "unchanged (idempotent since V82-Phone)"
storage_rules_version: "unchanged"
---

# Active Context

## State

- master = prod, V101+V102+V103 LIVE, Probe-Deploy-Probe 4/4 IDENTICAL on both rounds
- BSA system-wide audit clean: 0 desync in be_treatments/sales/appointments/deposits/products/courses/stock_*/promotions. 4 minor edge cases left (be_df_staff_rates×2 empty-string + be_link_requests×2 missing) — non-blocking
- 3 V-entries shipped (068a2ea5 / 4dcf217e / 4b1e3d8e) + 1 audit-script fix (16db55d5) + 3 Rule M backfill rounds applied

## What this session shipped

- **V101** (`068a2ea5`) — treatmentItems↔courseItems desync backstop. TFP:2352 IIFE Pass 1 (rowId) + Pass 2 (productId fallback) + edit-load rebind. AV88. 18 tests
- **V102** (`4dcf217e`) — createBackendSale/Treatment top-level branchId stamp via `_resolveBranchIdForWrite`. Graphify-confirmed gap (24 sibling writers had it, sale+treatment didn't). AV89. 29 tests
- **V102-audit fix** (`16db55d5`) — stock collections use `branchId` not `locationId`; corrected audit script
- **V103** (`4b1e3d8e`) — refunded/cancelled course filter at 3 active-display readers (CDV.activeCourses + mapRawCoursesToForm + isCourseUsableInTreatment) via canonical `isTerminalCourseStatus` helper. lineBotResponder sanctioned exception. AV90. 27 tests + 1 V21 fixup (V47 C.1 import regex relaxed)
- **Rule M backfills** applied 3 rounds: V101 (5 treatments, 11 decrements, 11 audit emits) + V102 (2 treatments + 5 sales branchId stamp)
- **Browser-cache root cause** found for treatments saved during deploy window — SPA tab held pre-V101 JS in memory; deployed bundle verified V101 IIFE present in `appointmentDisplay-CwH71V4k.js`. V101 backfill closed retroactively

## Next action

- User hands-on L1 (Rule Q V66) — hard-refresh (Ctrl+Shift+R) browser → save NEW treatment ใช้คอร์ส → verify customer.courses decrement + sale appears in per-branch SaleTab + refunded courses hidden from CDV
- If bug found → systematic-debugging + V104+

## Outstanding user-triggered actions

- V104 architectural (optional): cache-bust mechanism for SPA deploy (version.json poll + reload prompt) OR server-side V101 defense-in-depth via Cloud Function/API endpoint
- 4 minor BSA edge cases (df_staff_rates empty-string × 2 + link_requests missing × 2) — backfill if desired
- L1 Playwright spec (Rule Q V66 gold standard) — defer to next session
