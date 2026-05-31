# 2026-05-31 — V135 + V136 + V137 SHIPPED + DEPLOYED

## Summary
Three independent frontend/lib features in one session, committed + pushed + deployed (`vercel --prod`, aliased): V135 (reports-remaining-course clickable customer name), V136 (TFP retroactive course-usage edit — the big one, money/balance-critical), V137 (staff-chat clickable URLs). master = prod = `409804fc` LIVE. All frontend/lib/CSS only → no Probe-Deploy-Probe.

## Current State
- master = prod = `409804fc` deployed + aliased @ lover-clinic-app.vercel.app (first CODE deploy since prod 6c99a3d7).
- Tests (NOT re-run at EOD): full vitest **15199/0** (V136 impl turn) + targeted **350/0** (V136 + deduct/stock siblings) + V135 54/0 + V137 43/0 + build clean.
- **V136 TRUE-L2 e2e on REAL prod 14/0** — `scripts/e2e-v136-course-retro-deduct.mjs` calls the SHIPPED `deductCourseItems`/`deductStockForTreatment`/reverse via custom-token (admin-claim) auth.
- firestore.rules/storage/index/cron UNCHANGED.
- Working tree clean; everything pushed.

## Commits
```
409804fc feat(backend): V135 reports-remaining-course clickable customer name + V136 TFP retro course-usage edit + V137 staff-chat clickable URLs
```

## Files Touched (in 409804fc)
- V135: src/components/backend/reports/RemainingCourseTab.jsx · RemainingCourseRow.jsx · tests/v135-remaining-course-customer-link.test.jsx
- V136: src/components/TreatmentFormPage.jsx · tests/v136-retro-course-usage-edit.test.js · tests/v136-course-stock-flow-simulate.test.js · scripts/e2e-v136-course-retro-deduct.mjs · docs/superpowers/{specs,plans}/2026-05-31-tfp-retro-course-usage-edit*
- V137: src/lib/staffChatClient.js · src/components/staffchat/StaffChatMessageBody.jsx · tests/v137-staff-chat-url-link.test.jsx
- AV156 + AV157 → .agents/skills/audit-anti-vibe-code/SKILL.md

## Decisions (1-line each)
- V135: reuse canonical `openCustomerInNewTab` (cyan link, stopPropagation); graceful plain-text fallback when no prop/customerId. Rule P: sole offending report tab.
- V136 Q1=A: unlock only when courseItems AND treatmentItems both empty at load (`loadedHasNoCourseUsage`, captured once → no flash, no re-lock mid-edit).
- V136 Q2=A: unlock ONLY the course-usage section (consumables/meds/notes stay `canAddNewItems`-gated).
- V136 Q3=B: record EXISTING course use only — ซื้อ buttons stay `canAddNewItems` (hidden in retro) → no auto-sale.
- V136 saveMode='course' = staff-save MINUS auto-sale: deduct/reverse/stock/validate gates are saveMode-AGNOSTIC for course (byte-identical to staff); ONLY the 2 auto-sale gates carry `&& saveMode !== 'course'`. Forensic-only status patch (preserve status/completedAt).
- V136 verification: flow-simulate mirror locked to source (can't drift) + TRUE-L2 e2e (shipped fns on real prod) — NOT a replica (Rule Q-honest: real fn feasible → used it).
- V137: URL branch FIRST in `parseMessageBody` alternation (captures URLs containing LC-/BA- whole); scheme-restricted to http/https (XSS guard); sky link AA both themes; trailing-punct strip.

## Next Todo
- Idle / await user.
- **L1 hands-on (user, prod)**: V136 — finalized treatment w/ empty course section → tick course → save → course remaining ↓ + branch stock ↓ + NO sale. V135 — click name in reports-remaining-course → new tab. V137 — send URL in staff chat → blue link → new tab.
- Pre-existing (not this session): extended-suite 280 stale tests — triage/delete (large; NOT deploy-gating).

## Resume Prompt
```text
Resume LoverClinic — continue from 2026-05-31 EOD.
Read in order BEFORE any tool call: CLAUDE.md · SESSION_HANDOFF.md (master=409804fc, prod=409804fc) · .agents/active.md · .claude/rules/00-session-start.md · (if needed) this checkpoint.
Status: master = prod = 409804fc LIVE @ lover-clinic-app.vercel.app; full vitest 15199/0 + targeted 350/0 + build clean; V136 real-prod e2e 14/0. V135/V136/V137 all live.
Next: idle.
Outstanding (user-triggered): L1 hands-on prod (V136 course-retro deduct via real UI / V135 name-click / V137 chat URL) · extended-suite 280 PRE-EXISTING stale tests triage (large; NOT deploy-gating; npm test=15199/0).
Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Rule Q real-adversarial verify; Probe-Deploy-Probe for rules.
/session-start
```
