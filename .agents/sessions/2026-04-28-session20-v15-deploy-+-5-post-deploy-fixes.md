# 2026-04-28 (session 20) — V15 combined deploy + 5 post-deploy bug fixes

## Summary

Auto-mode session immediately after s19 ship. User reported 5 bugs found
during their own QA on dev; we fixed all 5 + ran a comprehensive audit
of every Movement Log emit site + ran V15 combined deploy with full
Probe-Deploy-Probe. **2183/2183 tests pass · prod=ae2ab7e LIVE**.

## Current State

- master = `ae2ab7e` (+ pending docs commit) · 2183/2183 vitest green · build clean
- Production = `ae2ab7e` LIVE — fully synced after V15 combined deploy
- Working tree clean

## 6 Commits (this session)

```
ae2ab7e test(stock): bug 5 — full Movement Log wiring audit + regression bank
244e909 feat(stock): bug 3 — AdjustDetailModal row-click detail view
f2b71ec fix(stock): bug 2 v2 — listStockMovements client-side branchId filter
69a5dd9 fix(stock): post-deploy bugs 1 + 4 — V11 local-binding + central-tier gate
(plus EOD docs commit)
```

## 5 user-reported bugs (verbatim) → 5 fixes

| # | User words | Root cause | Fix |
|---|---|---|---|
| 1 | "ปุ่มสร้างออเดอร์ใหม่หน้า stock ใช้ไม่ได้ กดเข้าแล้วหน้าจอดำ" | V11-class: `export { ... } from '...'` is re-export ONLY (no local binding). OrderCreateForm referenced `getUnitOptionsForProduct(...)` at 3 sites → ReferenceError at runtime → blank screen on form mount. Build + vitest didn't catch it (vitest imports from outside the module). | Explicit `import` line + separate `export {}` so local + external bindings both exist. preview_eval verified module loads. |
| 4 | "ปุ่มปรับ stock หน้าคลังกลาง ไปเชื่อมกับ stock สาขา" | Phase F (s19) shipped `includeLegacyMain: true` unconditionally in 3 stock create forms. CentralStockTab passes `branchIdOverride=WH-XXX` → legacy fallback pulled 'main' branch-tier batches into central tab. Cross-tier contamination. | Gate via `deriveLocationType === BRANCH`: branch-tier opts in (BR-* / 'main'), central-tier (WH-*) skips legacy fallback. Applied to AdjustCreateForm + TransferCreateForm + WithdrawalCreateForm. |
| 2 | "ทั้งโอนย้ายของและเบิกของก็ยังไม่ขึ้นที่ movement log ของหน้า stock แต่แสดงใน movement ของหน้า คลังกลาง" | Phase E (s19) dual-query Promise.all had silent-fail trap. Q2 (`where('branchIds', 'array-contains', X)`) wrapped in `.catch()` returning empty docs — when Firestore composite index missing or Q2 had latency, only Q1 results visible. User saw single-side movements only. | Refactor to client-side branchId filter: server-fetch with non-branch clauses, then JS filter `m.branchId === X || m.branchIds.includes(X)`. No composite index dependency. Old movements (no branchIds[]) still match via legacy arm. |
| 3 | "รายการหน้าปรับสต็อคจะต้องกดเข้าไปดูรายละเอียดในแต่ละรายการได้เหมือนหน้าอื่นๆ" | StockAdjustPanel rows weren't clickable; no detail modal existed. | NEW `src/components/backend/AdjustDetailModal.jsx` mirrors Transfer/Withdrawal pattern. NEW `getStockAdjustment` helper in backendClient. Row onClick → setDetailId → conditional modal render. 10 data-testids; V12 backward compat (missing fields render `'-'`); V22 branch-name resolution (no raw id leak). |
| 5 | "ตรวจสอบว่าการเคลื่อนไหวทุกอย่างของ stock ผ่าน Movement log ของตัวเอง และ Movement log ของคลังและสาขาที่เกี่ยวข้องทั้งหมด แบบถูกต้องตาม wiring flow และ logic" | Audit task — no specific bug. | Mapped 12 emit sites: every site has `branchId` (explicit OR `...m` spread for reverse). 4 cross-branch types (8/9/10/13) have `branchIds: [src, dst].filter(Boolean)`. Single-tier types (1/2/3/4/5/6/7/14) intentionally don't. Reader catches all via client-side filter. 22 regression tests lock the architecture. |

## V15 combined deploy (this session — explicit "deploy" auth)

**Pre-probe** (6 positive + 4 negative):
- chat_conversations POST → 200 ✓
- pc_appointments PATCH → 200 ✓
- clinic_settings/proclinic_session PATCH → 200 ✓
- clinic_settings/proclinic_session_trial PATCH → 200 ✓
- opd_sessions anon CREATE → 200 ✓ (V23 hasOnly path)
- opd_sessions anon PATCH whitelisted → 200 ✓
- be_customer_link_tokens (negative) → 403 ✓
- be_link_requests (negative) → 403 ✓
- be_course_changes (negative) → 403 ✓
- be_central_stock_orders (NEW negative) → 403 ✓

**Deploy** (parallel):
- `vercel --prod --yes` → 49s · `lover-clinic-en5gqnqzd-teddyoomz-4523s-projects.vercel.app` aliased `lover-clinic-app.vercel.app`
- `firebase deploy --only firestore:rules` → released to cloud.firestore

**Post-probe**: 6/6 positive 200 + 4/4 negative 403 ✓ (matches pre-probe)

**Cleanup**:
- DELETE pc_appointments/test-probe-{TS_PRE}: 200 ✓
- DELETE pc_appointments/test-probe-{TS_POST}: 200 ✓
- PATCH clinic_settings/proclinic_session strip probe: 200 ✓
- PATCH clinic_settings/proclinic_session_trial strip probe: 200 ✓
- chat_conversations probes — anon delete blocked (will hit 7-day auto-delete)
- opd_sessions probes — anon delete blocked, isArchived:true hides from queue UI per V27. Admin can use PermissionGroupsTab "🧹 ลบ test-probe ค้าง" if cleanup needed.

**HTTP smoke**:
- `https://lover-clinic-app.vercel.app/` → 200 ✓
- `https://lover-clinic-app.vercel.app/admin` → 200 ✓ (returns full HTML)
- `https://lover-clinic-app.vercel.app/api/webhook/line` → 200 ✓
- `https://lover-clinic-app.vercel.app/api/webhook/facebook` → 403 (by-design — rejects unauth GET without hub.verify_token; webhook function is reachable)

## Decisions (1-line each)

1. **Bug 2 v2 architecture**: client-side branchId filter > server-side dual-query. Trade bandwidth for reliability + simplicity. Acceptable for clinic-scale (<50k movements).
2. **Bug 4 gate via `deriveLocationType`**: existing helper from `stockUtils.js`. Reused (Rule of 3) instead of new helper.
3. **Bug 3 AdjustDetailModal pattern**: mirror Transfer/Withdrawal exactly — same modal layout, same `data-testid` naming convention, same V22 branch-name resolution. Future detail modals follow this template.
4. **Bug 5 audit scope**: structural source-grep (12 emit sites) + simulate fixture covering 13 emit shapes. Skipped runtime preview_eval (admin login needed) — will verify via live QA.
5. **Probe list extension permanent**: `be_central_stock_orders` (Phase 15.2) added to negatives. Future deploys probe 6 positive + 4 negative as new baseline.

## V-entries to lock (none new — all post-deploy bugs fall into existing patterns)

- **V11 (mock-shadowed export)**: re-export-from doesn't create local binding. Build + vitest don't catch — pair imports with explicit local-use checks.
- **V12 (multi-reader sweep)**: AdjustDetailModal renders all new fields with `?.` + `||` fallback. Old docs without all fields render gracefully.
- **V14 (no-undefined leaves)**: `branchIds[].filter(Boolean)` strips null/undefined. Tests assert presence of `.filter(Boolean)` everywhere a branchIds[] is written.
- **V21 (source-grep can lock broken behavior)**: when refactoring, flip the regression guard. Phase E dual-query → client-side filter required flipping ML.A tests from "Promise.all" assertion to "client-side filter" assertion.
- **V31 (no silent-swallow)**: composite-index soft-fail uses `console.warn` not `console.warn('continuing')`. Tests verify ML.B.3 + BP.B.1 explicitly.

## Next Todo

**Awaiting live QA from user**:
- Bug 1: open StockOrderPanel + click "+ สร้าง" → form should render (no blank screen)
- Bug 4: central tab → ปรับสต็อก → batch picker should show warehouse-only batches
- Bug 2: stock-tab MovementLog → transfer + withdrawal entries cross-branch should appear
- Bug 3: stock-tab adjust list rows → click → detail modal opens with full info
- Bug 5: implicit — confirms ALL movements show correctly in their + related logs

**Deferred to Phase 15.5+**:
- ActorPicker dropdown filter by `staff.branchIds[]` / `doctor.branchIds[]`
- Phase 15.4 central→branch dispatch flow
- Phase 15.5 withdrawal approval admin endpoint (types 15/16 emit)

**Admin tasks (carry-over)**:
- LineSettingsTab credentials + webhook URL paste
- Backfill customer IDs (V33.4 admin-mediated linking)
- TEST-/E2E- customer ID prefix convention adoption

## Resume Prompt

```
Resume LoverClinic — continue from 2026-04-28 s20 (post V15 deploy).

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=ae2ab7e, prod=ae2ab7e LIVE — fully synced)
3. .agents/active.md (2183 tests pass; Phase 15.4 + 5 post-deploy fixes deployed)
4. .claude/rules/00-session-start.md (iron-clad A-I + V-summary)
5. .agents/sessions/2026-04-28-session20-v15-deploy-+-5-post-deploy-fixes.md

Status: master=ae2ab7e == prod=ae2ab7e LIVE. 2183/2183 tests pass.
V15 combined deploy COMPLETE this session. All 5 user-reported post-s19
bugs fixed + audit shipped. Phase 15.4 + post-deploy fixes LIVE.

Next: Live QA on the deployed fixes (5 user verifications above).
Then queue: ActorPicker branchIds filter; Phase 15.5 central dispatch +
withdrawal approval admin endpoint.

Outstanding (admin tasks): LineSettingsTab creds + webhook URL · backfill
customer IDs · TEST-/E2E- prefix.

Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe.

/session-start
```
