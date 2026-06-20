---
updated_at: "2026-06-19 — AV98 recurrence: ED detail/compare modal trapped in its own box. Portaled EDDetailModal + EDFollowupModal to document.body. SHIPPED + DEPLOYED LIVE."
status: "COMMITTED + PUSHED + DEPLOYED (vercel frontend). full vitest 16767/0; build clean."
branch: "master"
last_commit: "574141ad — fix(ed-modals): portal EDDetailModal + EDFollowupModal to document.body (AV98 recurrence)"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "lover-clinic-228lv6o7s (vercel --prod, frontend). aliased lover-clinic-app.vercel.app HTTP 200."
firestore_rules_version: "UNCHANGED (frontend-only → vercel-only, no Probe-Deploy-Probe)."
tests: "full vitest 16767/0 (this session's last run) + build clean. NOT re-run at session-end."
---

# Active — 2026-06-19 — AV98 ED-modal portal fix (SHIPPED + DEPLOYED)

## State
- master HEAD `574141ad` (= origin before the EOD docs commit). prod DEPLOYED LIVE — `lover-clinic-228lv6o7s` (vercel frontend); aliased `lover-clinic-app.vercel.app` HTTP 200.
- full vitest **16767/0** (+11 = new AV98 guard) + build clean. firestore.rules UNCHANGED.
- `/systematic-debugging` + Workflow census (rate-limited → recovered inline per V83 lesson).

## What this session shipped (detail → checkpoint 2026-06-19-av98-ed-modal-portal.md)
- **Root cause (AV98 recurrence)**: `EDScoreBox` renders `<EDDetailModal/>` INSIDE its own `rounded-xl` card; the V86 auto-glow (index.css ~4043) makes every rounded card in `[data-backend-menu-mode=new] [data-testid=backend-content]` a containing block for `position:fixed` descendants → the 2-panel compare modal was confined to the card box ("modal แค่ box ตัวเอง"). Same class as recall V80; missed because that regression test was recall-DIR-scoped.
- **Census (evidence-based Rule P)**: EDDetailModal was the **LONE trapped instance**. Every other overlay modal renders at a tab/panel/page ROOT as a SIBLING of (not descendant of) rounded cards — verified WalletPanel root=`space-y-4` (modals at 232/245/257 siblings), FinanceTab/DepositPanel/OrderPanel/report-tabs likewise. Matches the AV98 sanctioned-exceptions list.
- **Fix**: `createPortal(…, document.body)` on `EDDetailModal` + `EDFollowupModal` (incl. its full-screen QR sub-overlay) — the AV98-canonical fix, byte-identical to the prod-proven recall/appt-popover portal.
- **Guard**: NEW `tests/av98-ed-modal-portal.test.js` (A portal lock + B EDScoreBox-nesting neutralized + C card-spawn registry). Dropped a universal static "nested-in-card" walk — proven false-positive-prone (flagged 3 safe panels). AV98 SKILL.md updated with the recurrence + census.
- Verified: targeted 83/0 + **full vitest 16767/0** + build clean.

## Next action
- Idle / await. Fix DEPLOYED LIVE.

## Outstanding (user-triggered)
- ⚠ ROTATE LINE/FB secrets (AV195).
- Encode customer id in LINE OA message URL (task_1a3ac96c).
- Honest gap (Rule Q): rendered-pixel render on an authed backend CDV (real customer ≥2 ED rounds → click chip → modal full-viewport) = USER hands-on (auth-gated; verified by code+tests+build + same fix proven live for recall).
