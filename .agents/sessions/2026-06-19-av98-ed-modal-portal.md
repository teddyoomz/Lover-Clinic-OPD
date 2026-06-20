# 2026-06-19 — AV98 ED-modal portal fix (modal trapped in its own box)

## Summary
The ED 2-panel compare modal "showed only inside its own box" (user: "modal แค่ box ตัวเองอีกแล้ว"). `/systematic-debugging` root-caused it as an **AV98 recurrence** — `EDScoreBox` renders `<EDDetailModal/>` INSIDE its own `rounded-xl` glow card, and the V86 auto-glow makes every rounded card in backend-content a containing block for `position:fixed` descendants → the fixed modal was confined to the card box. A Workflow census (rate-limited twice → recovered inline per V83) + evidence-based render-site reads proved **EDDetailModal was the LONE trapped instance** (every other overlay modal renders at a tab/panel/page root = sibling of cards = safe). Fix = the AV98-canonical `createPortal(…, document.body)` on `EDDetailModal` + `EDFollowupModal`. SHIPPED + DEPLOYED.

## Current State
- master HEAD `574141ad` (= origin pre-EOD-docs commit). prod = `lover-clinic-228lv6o7s` (vercel frontend), aliased `lover-clinic-app.vercel.app` HTTP 200.
- firestore.rules UNCHANGED → frontend-only, no Probe-Deploy-Probe (V125/V145/V162 precedent).
- full vitest **16767/0** (+11 = new AV98 guard) + build clean.
- Census conclusion: 1 trapped (EDDetailModal). All other overlay modals verified render-at-root.
- Honest gap (Rule Q): authed-CDV rendered-pixel = USER hands-on (auth-gated; same fix proven live for recall).

## Commits
```
574141ad fix(ed-modals): portal EDDetailModal + EDFollowupModal to document.body (AV98 recurrence)
```

## Files Touched
- `src/components/backend/EDDetailModal.jsx` (createPortal — main return)
- `src/components/backend/EDFollowupModal.jsx` (createPortal — modal return + full-screen QR return)
- NEW `tests/av98-ed-modal-portal.test.js` (A portal lock + B EDScoreBox-nesting + C card-spawn registry)
- `.agents/skills/audit-anti-vibe-code/SKILL.md` (AV98 recurrence + census note + cross-link)

## Decisions (1-line each)
- Root cause = AV98 (V80) recurrence — EDScoreBox is a card-component whose ROOT is a rounded card spawning a modal inside it (unique pattern); the recall regression test was dir-scoped so it never guarded the ED modals.
- Scoped fix (2 ED modals), NOT a 30-file mass-portal — census proved every other overlay modal renders at a tab/panel/page root (sibling of cards) = safe; matches the AV98 sanctioned-exceptions list. Ponytail-correct + Rule-P-evidence-based.
- Portaled EDFollowupModal too (same ED feature surface + its full-screen QR sub-overlay) though it's currently safe-at-root.
- Dropped a universal static "overlay-nested-in-rounded-card" walk from the test: false-positive-prone (regex matched `.map()`-callback rounded cards → flagged 4 verified-safe panels). Kept the reliable curated card-spawn registry (C).
- Workflow census rate-limited twice (54-agent burst, then batched-5) → recovered inline (V83 lesson). Determined trapped/safe by reading render sites (FinanceTab/panels root = `space-y-4`; modals are siblings of cards).
- Deploy authorized this turn ("test ใก้ผ่านให้แน่ใจจริงๆ แล้ว deploy ได้") + tests green → vercel-only.

## Next Todo
- Idle / await. Fix DEPLOYED LIVE.
- Outstanding (user-triggered): ROTATE LINE/FB secrets (AV195); encode customer id in LINE OA URL (task_1a3ac96c).
- Rule Q honest gap: pixel render on authed backend CDV (real customer ≥2 ED rounds → click chip → modal full-viewport) = user hands-on.

## Resume Prompt
Resume LoverClinic — continue from 2026-06-19 EOD. master=574141ad, prod=lover-clinic-228lv6o7s LIVE. AV98 ED-modal portal fix (EDDetailModal + EDFollowupModal → document.body) SHIPPED + DEPLOYED. full vitest 16767/0. Next: idle/await. Outstanding (user-triggered): rotate LINE/FB secrets (AV195); LINE-OA-url customer-id chip. Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe (Rule B). /session-start
