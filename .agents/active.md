---
updated_at: "2026-05-31 — V135 + V136 + V137 SHIPPED + DEPLOYED + prod-verified."
status: "Deployed + live. master = prod = 409804fc @ lover-clinic-app.vercel.app. Frontend/lib/CSS only → no Probe-Deploy-Probe."
branch: "master"
last_commit: "409804fc (V135 reports-link + V136 TFP retro course-usage + V137 staff-chat URLs)."
tests: "NO re-run at session-end (per rule). This session: full vitest 15199/0 (V136 impl turn) + targeted 350/0 (V136 + deduct/stock siblings) + V135 54/0 + V137 43/0 + build clean + V136 TRUE-L2 e2e on real prod 14/0 (shipped deductCourseItems/deductStockForTreatment via custom-token auth)."
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "409804fc LIVE (vercel --prod, aliased) — V135/V136/V137 all live."
firestore_rules_version: "UNCHANGED — frontend/lib/CSS only (no rules/storage/index/cron → no Probe-Deploy-Probe)."
---

# Active Context — V135 + V136 + V137 (2026-05-31)

## State
- master = prod = `409804fc` deployed + aliased @ lover-clinic-app.vercel.app. First CODE deploy since prod 6c99a3d7 (was docs-only ahead).
- 3 independent features shipped this session, all frontend/lib/CSS only.
- Working tree clean; everything committed + pushed.

## What this session shipped (detail → checkpoint 2026-05-31-v135-v136-v137-clickables-retro-course.md)
- **V135** — reports-remaining-course customer name → `openCustomerInNewTab` (was plain text). Class-of-bug sweep: sole report tab missing the link. `tests/v135-*` (54/0).
- **V136** — TFP: edit ข้อมูลการใช้คอร์ส retroactively ONLY when no course deducted (`canEditCourseUsageRetro`). NEW `saveMode='course'` = staff-save MINUS auto-sale (course balance + branch stock deduct identically; skips createBackendSale/INV/wallet/deposit/points). ซื้อ buttons + consumables/meds stay `canAddNewItems`. AV156. brainstorm Q1=A/Q2=A/Q3=B. flow-simulate (source-locked, 23) + TRUE-L2 e2e real prod 14/0.
- **V137** — staff chat: http/https URLs → clickable new-tab links (`parseMessageBody` 'url' segment + `<a target=_blank rel=noopener>`); scheme-restricted (no XSS). AV157. `tests/v137-*` (43/0).

## Next action
Idle / await user.

## Outstanding user-triggered actions
- **L1 hands-on (prod, all 3)**: V136 — open finalized treatment with empty course section → tick course → save → course remaining ↓ + branch stock ↓ + NO new sale (TRUE-L2 proved the shipped fns; UI-click L1 = user). V135 — click customer name in reports-remaining-course → new tab. V137 — send a URL in staff chat → blue link → opens new tab.
- **Pre-existing (not this session)**: extended-suite 280 PRE-EXISTING stale tests — triage/delete (large; NOT deploy-gating; npm test=15199/0 green).
