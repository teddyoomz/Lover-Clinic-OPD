---
updated_at: "2026-06-09 EOD+3 LATE — V163: 'แก้คงเหลือ' (ลด/เพิ่มคงเหลือคอร์ส) PROD CRASH `parseQtyString is not defined` FIXED + DEPLOYED LIVE. Missing static-import entry (build-invisible, V6/V11/V104 class)."
status: "DEPLOYED to prod (vercel --prod, aliased lover-clinic-app.vercel.app, HTTP 200). frontend-only (backendClient import) → vercel-only, firestore.rules UNCHANGED → no Probe-Deploy-Probe. Rule Q L1 verified (real browser → real prod Firestore, exact flow, 6/12→5/12)."
branch: "master"
last_commit: "7c5f4e0a — fix(course): แก้คงเหลือ prod crash — add parseQtyString to backendClient static import (V163/AV192)."
tests: "full vitest 16332/2 — the 2 fails are PRE-EXISTING + UNRELATED flakes (v55-1 derivePatientTreatmentHistory fast-check random-seed; + 1 env-flake), confirmed by isolated re-run (v55-1 passes 296/0). av192 8/8 + touched cluster 181/0. build clean."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "frontend = 7c5f4e0a LIVE (V163 parseQtyString fix). firestore.rules UNCHANGED."
firestore_rules_version: "UNCHANGED."
---

# Active — 2026-06-09 EOD+3 LATE — V163 parseQtyString crash (FIXED + DEPLOYED)

## State
- prod = master HEAD `7c5f4e0a` LIVE. Tree clean. The customer "แก้คงเหลือ" (ลด/เพิ่มคงเหลือคอร์ส) modal save no longer crashes.

## What this turn shipped (V163 — see 00-session-start.md V-table)
- **Root cause**: `adjustCourseRemainingQty` (backendClient.js, the 2026-06-09 `b8351546` unified add/reduce refactor) used `parseQtyString` but the module-top static `import {…} from './courseUtils.js'` OMITTED it (had the other 5). Undefined identifier → global lookup → `npm run build` CLEAN → only threw at runtime on the ยืนยันลด/เพิ่ม save (V6/V11/V104 build-invisible class).
- **Fix (class-eliminating, 1 line)**: add `parseQtyString` to that static import → module-scoped for every fn.
- **Why 16326-green missed it**: the default-suite C1.6–C1.13 are SOURCE-GREP only (never EXECUTE the fn) → can't catch a runtime ReferenceError (V66 lesson). NEW `tests/av192-courseutil-scope-execution-2026-06-09.test.js` EXECUTES the real fn (only the Firestore tx mocked; import resolution real ESM) → RED 7 w/ exact error on reverted import, GREEN 8 on fix; AV192.8 = classifier over every backendClient courseUtils usage.
- **Rule P**: 5-agent adversarial workflow swept all courseUtils usages (13 files) + sibling stockUtils per-fn-destructure class → SOLE instance, 0 siblings. **AV192** added.
- **Rule Q L1**: real browser (local Vite dev → real prod Firestore), TEST customer, exact flow `แก้คงเหลือ → -ลด → ยืนยันลด -1 / หมอมายด์` → no alert, modal closed, UI 5/12, Firestore `courses[0].qty="5 / 12 ครั้ง"`, reduce audit appeared; fixture cleaned.

## Honest verification gap (Rule Q-honest)
- L1 done on LOCAL dev serving the IDENTICAL committed+deployed source vs real prod Firestore (the exact flow works). Could NOT re-drive the LIVE deployed URL — Chrome MCP has no connected browser + Claude Preview is localhost-only (redirected back). Live URL smoke = HTTP 200. The deployed bundle = same source, Vercel build clean. (Matches the deposit-in-reports vercel-only precedent.)

## Next action
- IDLE / await direction. (Optional: user hard-refresh prod + try ลด/เพิ่มคงเหลือ to confirm on their end = L3.)

## Outstanding user-triggered (NOT this work)
- `npm run test:extended` 283 fail = V50-deleted tabs in stale RTL tests (opt-in; task spawned).
- 2 full-suite flakes (v55-1 fast-check seed / env-flake) pass isolated.
- SESSION_HANDOFF.md ~207 KB — over the 200 KB soft-cap → archival on a maintenance turn.
