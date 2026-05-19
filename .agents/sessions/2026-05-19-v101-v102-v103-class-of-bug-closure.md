# Session 2026-05-19 LATE+3 — V101+V102+V103 architectural class-of-bug closure

## Summary

3 user-reported bugs uncovered via real-prod test session on customer วันเพ็ญ (LC-26000078) — closed via 3 V-entries (V101 treatmentItems↔courseItems desync / V102 createBackendSale+Treatment branchId stamp / V103 refunded-course filter), 2 combined deploys (V15), 3 Rule M backfill rounds, 4 commits, 74 V101-V102-V103 tests + 1014 wider regression GREEN. Browser-cache root cause for in-flight treatments documented; V104 cache-bust deferred.

## Current State

- master = `4b1e3d8e` = prod at https://lover-clinic-app.vercel.app
- Stack live: V84..V100 + V101 + V102 + V102-audit + V103
- Tests: V101 18 + V102 29 + V103 27 = 74 cumulative GREEN · 1014 wider regression PASS · 0 fail · build clean
- Probe-Deploy-Probe 4/4 IDENTICAL pre+post both deploy rounds (chat_conv 200 / be_line_reminder_log 403 / be_fb_configs 403 / be_staff_chat_messages 403)
- BSA system-wide audit clean: 0 desync in major branch-scoped collections (be_treatments/sales/appointments/deposits/products/courses/stock_*/promotions). 4 minor edge cases remain (df_staff_rates×2 empty-string + link_requests×2 missing)

## Commits

```
4b1e3d8e fix(V103): terminal-status filter on customer.courses[] active readers + AV90
16db55d5 fix(V102-audit): correct stock-collection field name in BSA audit script
4dcf217e fix(V102): createBackendSale/Treatment branchId stamp + AV89 (BSA gap)
068a2ea5 fix(V101): treatmentItems↔courseItems desync architectural backstop + AV88
```

## Files Touched (names only)

### V101
- src/components/TreatmentFormPage.jsx (two-pass IIFE + edit-load rebind)
- .claude/skills/audit-anti-vibe-code/SKILL.md (AV88)
- scripts/diag-{system-wide-course-desync,wanphen-shockwave,wanphen-lifecycle,wanphen-prodid}.mjs
- scripts/v101-backfill-treatment-course-link.mjs (Rule M)
- tests/v101-treatment-course-link-desync.test.js (18 tests)

### V102
- src/lib/backendClient.js (createBackendSale + createBackendTreatment + update siblings)
- .claude/skills/audit-anti-vibe-code/SKILL.md (AV89)
- scripts/diag-sale-deposit-wallet-desync.mjs
- scripts/diag-system-wide-branchid-stamp-audit.mjs (+V102-audit field-name fix)
- scripts/diag-stock-fields.mjs
- scripts/v102-backfill-branchid-stamp.mjs (Rule M)
- tests/v102-sale-treatment-branchid-stamp.test.js (29 tests)

### V103
- src/components/backend/CustomerDetailView.jsx (activeCourses filter + import)
- src/lib/treatmentBuyHelpers.js (isTerminalCourseStatus + mapRawCoursesToForm + isCourseUsableInTreatment)
- .claude/skills/audit-anti-vibe-code/SKILL.md (AV90)
- scripts/diag-wanphen-refund-status.mjs
- tests/v103-terminal-course-status-filter.test.js (27 tests)
- tests/v47-customer-detail-view-grouping.test.js (V21 fixup C.1)

### Browser-cache investigation (V104 diag, not committed yet)
- scripts/diag-wanphen-v104-latest-treatment.mjs

## Decisions (one-line each)

- V101 IIFE two-pass beats single-pass: Pass 1 happy-path + Pass 2 productId defense covers all 3 desync channels
- V102 update-writers preserve-explicit-only (delete-on-empty): avoids cross-branch admin-edit corruption
- V103 design-intent preserved: refund/cancel SOFT-mark (audit trail) + display readers filter — NO data delete
- lineBotResponder.active = sanctioned exception (whitelist semantic via 'กำลังใช้งาน'/''/'active' — V32-tris-ter contract preserved)
- V102.C scope eliminated: original audit script's `locationId` assumption was wrong; stock uses `branchId` correctly across all writers
- Browser-cache root cause: SPA tab keeps pre-V101 JS in memory until hard refresh — bug NOT in V101 fix; V101 byte-verified in deployed `appointmentDisplay-CwH71V4k.js` chunk

## Rule M Backfill Audit docs (real prod)

- `be_admin_audit/v101-backfill-treatment-course-link-1779192644498-f94f9199` (round 1, 2 treatments × 3 decrements)
- `be_admin_audit/v102-backfill-branchid-stamp-1779192673967-beaf0a0b` (2 treatments + 5 sales)
- `be_admin_audit/v101-backfill-treatment-course-link-1779196350424-59491106` (round 2, 3 treatments × 8 decrements, includes browser-cache victims)

## Next Todo

1. **L1 hands-on (Rule Q V66 gold standard)** — user hard-refresh (Ctrl+Shift+R) https://lover-clinic-app.vercel.app → test scenarios:
   - Save NEW treatment ใช้คอร์ส → verify customer.courses decrement
   - Save treatment + ซื้อคอร์ส (auto-sale) → verify sale appears in per-branch SaleTab (with branchId stamped)
   - Refund a course → verify it disappears from CDV "คอร์สของฉัน" tab AND TFP picker
2. **If bug found** → systematic-debugging + V104+
3. **Optional V104** — cache-bust mechanism: poll `dist/version.json` on visibility-change → alert "ระบบอัพเดท กรุณา refresh" (already-written by `vite.config.js versionPlugin`)
4. **Minor cleanup** — 4 BSA edge cases (df_staff_rates empty-string × 2 + link_requests missing × 2) — backfill if desired
5. **Test-debt** — 17× backend-menu-d V90 (pre-existing); v81 emulator Java-gated skip (intentional)

## Resume Prompt

```
Resume LoverClinic — continue from 2026-05-19 LATE+3 EOD.

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=4b1e3d8e, prod=4b1e3d8e)
3. .agents/active.md (74 V101-V103 tests · 1014 wider regression)
4. .claude/rules/00-session-start.md (iron-clad + V-summary)
5. .agents/sessions/2026-05-19-v101-v102-v103-class-of-bug-closure.md

Status: master=4b1e3d8e, V101+V102+V103 LIVE at https://lover-clinic-app.vercel.app
Next: Rule Q L1 hands-on — user hard-refresh + test treatment save + refund flow
Outstanding (user-triggered):
- L1 verify (3 scenarios in checkpoint Next Todo)
- V104 cache-bust mechanism (optional)
- 4 minor BSA edge cases (df_staff_rates + link_requests)

Rules: no deploy without "deploy" THIS turn (V18); V15 combined deploy;
Probe-Deploy-Probe Rule B (chat_conv 200 / 3× admin-only 403); Rule M data ops
local + admin-SDK + canonical artifacts/{APP_ID}/public/data/* path; Rule Q V66
real-adversarial verification (Playwright L1 / real client SDK L2 mandatory
before any "verified" claim).

/session-start
```
