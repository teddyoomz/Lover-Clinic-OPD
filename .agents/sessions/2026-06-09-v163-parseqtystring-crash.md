# 2026-06-09 EOD+3 LATE — V163: "แก้คงเหลือ" parseQtyString prod crash — FIXED + DEPLOYED LIVE

## Summary
The customer "แก้คงเหลือ" (ลด/เพิ่มคงเหลือคอร์ส) modal crashed on save with `parseQtyString is not defined` (prod, screenshot LC-26000138, Shock Wave). Root cause: the 2026-06-09 `b8351546` "unified add/reduce" refactor introduced `adjustCourseRemainingQty`, which uses `parseQtyString` but the module-top static `import {…} from './courseUtils.js'` in `backendClient.js` OMITTED it (it had the other 5 helpers — so `formatQtyString`/`reverseQty` worked in the same fn). An undefined identifier resolves to a global lookup → `npm run build` is CLEAN → it only throws at runtime on the save click (V6/V11/V104 build-invisible class). Fixed by adding `parseQtyString` to that static import (class-eliminating: module-scoped for every fn). DEPLOYED vercel-only.

## Current State
- prod frontend = `7c5f4e0a` LIVE @ lover-clinic-app.vercel.app (`vercel --prod` aliased, HTTP 200; frontend-only, firestore.rules UNCHANGED → no Probe-Deploy-Probe). master HEAD = `cd11542d`+ (docs); the deployed code = `7c5f4e0a`.
- full vitest **16332/2** — the 2 fails are PRE-EXISTING + UNRELATED flakes (v55-1 `derivePatientTreatmentHistory` fast-check random-seed; + 1 env-flake) — v55-1 passes **296/0** isolated. av192 8/8, touched cluster 181/0, build clean.
- Rule Q L1 verified (real browser → real prod Firestore, exact flow, 6/12→5/12 + Firestore `courses[0].qty="5 / 12 ครั้ง"`).
- Tree clean (after the session-end docs commit).

## Commits
```
7c5f4e0a fix(course): แก้คงเหลือ prod crash — add parseQtyString to backendClient static import (V163/AV192)
cd11542d docs(agents): V163 parseQtyString crash fixed + deployed LIVE (active.md)
+ this session-end docs commit (SESSION_HANDOFF + checkpoint)
```

## Files Touched
- src/lib/backendClient.js (the 1-line static-import fix + comment)
- tests/av192-courseutil-scope-execution-2026-06-09.test.js (NEW — execution regression + classifier)
- scripts/diag-av192-seed-cleanup.mjs (NEW — Rule Q L1 TEST-fixture seed/read/cleanup)
- .claude/skills/audit-anti-vibe-code/SKILL.md (AV192)
- .claude/rules/00-session-start.md (V163 V-entry)
- .agents/active.md, SESSION_HANDOFF.md (state)

## Decisions (1-line each — full reasoning in 00-session-start.md V163)
- Fix = add `parseQtyString` to the module-top static import (not per-function dynamic imports) — courseUtils is a pure leaf → no circular-dep; eliminates the class for every fn.
- Kept the existing per-function `await import('./courseUtils.js')` (deductCourseItems + 2 others) — harmless shadows; never RELY on a static import that drops a name.
- Regression test must EXECUTE the real fn (only the Firestore tx boundary mocked) — source-grep (the old C1.6–C1.13) can't catch a runtime ReferenceError (V66 lesson). AV192.7 locks the import list; AV192.8 = classifier over every backendClient courseUtils usage.
- Rule P: 5-agent adversarial workflow (token-heavy, ultracode) swept all 52–83 courseUtils usages/13 files + the sibling stockUtils per-fn-destructure class (longest fn `_deductOneItem` 551 lines) → sole instance, 0 siblings (2 auto-flags refuted as comment/JSDoc).
- Deploy = vercel-only (firestore.rules unchanged; deposit-in-reports precedent).

## Honest verification gap (Rule Q-honest)
- L1 done on LOCAL dev serving the IDENTICAL committed+deployed source vs real prod Firestore (exact flow works). Could NOT re-drive the LIVE deployed URL — Chrome MCP has no connected browser + Claude Preview is localhost-only (it redirected back). Live URL smoke = HTTP 200. Deployed bundle = same source, Vercel build clean.

## Next Todo
- IDLE / await direction. (Optional L3: user hard-refresh prod + try ลด/เพิ่มคงเหลือ to confirm on their end.)
- Pre-existing (NOT this work): `npm run test:extended` 283 fail = V50-deleted tabs in stale RTL tests (opt-in; task spawned); 2 full-suite flakes pass isolated; SESSION_HANDOFF.md ~207 KB over the 200 KB soft-cap → archival on a maintenance turn.

## Resume Prompt
Resume LoverClinic — continue from 2026-06-09 EOD+3 LATE.
Read: CLAUDE.md → SESSION_HANDOFF.md (master=cd11542d, prod=7c5f4e0a LIVE) → .agents/active.md → .claude/rules/00-session-start.md → this checkpoint.
Status: V163 "แก้คงเหลือ" parseQtyString prod crash FIXED + DEPLOYED LIVE (vercel-only). Rule Q L1 verified (real browser, exact flow 6/12→5/12). full vitest 16332/2 (2 pre-existing unrelated flakes, pass isolated).
Next: idle / await direction.
Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe on rules.
/session-start
