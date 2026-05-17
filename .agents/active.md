---
updated_at: "2026-05-18 EOD+2 — Menu Variant A v2 SHIPPED (Phase A redesign)"
status: "Menu redesign committed + pushed. 11366/0 PASS. Dev preview verified. Deploy pending user authorization."
branch: "master"
last_commit: "24b116a3 feat(menu): Variant A v2 — compact pill bar + mobile bottom dock (Phase A)"
tests: "11366/11366 PASS full vitest (44 new — 43 menu-source-grep + 1 V21-fixup mobile dock label)"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "still 2 rounds LIVE from prior session (44737de3 V82 core + a78046f3 opt-out) — V82-fix2 + V82-fix6 + Menu-V2 source patches LOCAL-ONLY pending deploy"
firestore_rules_version: "unchanged; no rules change this session"
---

# Active Context

## State
- master = `24b116a3` (Menu Variant A v2) — origin/master matches
- 11366/0 PASS full vitest (+44 net from V82-fix6 baseline 11322)
- Build clean (2.97s)
- Dev preview verified at desktop 1440 + mobile 375:
  - Desktop pill bar with 8 tabs + right rail rendered ✓
  - Mobile top bar (44px) + floating bottom dock (5 slots) rendered ✓
  - จอง BottomSheet picker opens with 2 options ✓
  - ⋯ More Drawer opens with 6 items (history/settings/backend/theme/online/signout) ✓
  - Tab switching dashboard→appointment→clinicSettings works ✓
  - StaffChatBubble lifted to bottom-[88px] on mobile — 19px gap above bottom dock ✓

## What this session shipped
- Visual companion mockup with 4 variants → user picked Variant A
- Variant A refined per user feedback (real ClinicLogo + unread badges preserved + chat bubble lift)
- Phase A-v2 plan + 43-test source-grep regression bank
- V21 fixup of `phase-25-0-walk-in-tab-rename.test.js` for new JSX shape
- Single commit `24b116a3` with:
  - `src/pages/AdminDashboard.jsx` header replaced + state hooks + mobile dock/sheets/drawer JSX
  - `src/index.css` new menu utility classes
  - `src/components/staffchat/StaffChatBubble.jsx` mobile bottom-[88px]
  - 2 test files (1 new regression + 1 V21 fixup)
  - Plan doc + visual companion mockup committed

## Preserved 100% (wiring contract)
- All 8 setAdminMode handlers (chat/dashboard/noDeposit/deposit/appointment/history/clinicSettings + backend window.open)
- All 4 unread badges with exact same expressions + same colors + chat-tab-blink animation
- Sub-mode active states (noDepositHistory under noDeposit, depositHistory under deposit, formBuilder under clinicSettings)
- Notif popover JSX preserved verbatim in both viewports (sound toggle + volume slider + push enable/disable + iPhone hint)
- BranchSelector real dropdown + ThemeToggle + ClinicLogo + onlineAdmins indicator + signOut(auth) all wired identical
- No new Firestore reads/writes — pure UI restructure

## Next action
AWAIT user authorization to deploy. Per V18:
- `deploy` = combined `vercel --prod` + `firebase deploy --only firestore:rules` (no rules change so vercel-only this round)
- OR `deploy vercel only` = vercel only

If user requests changes → iterate; mockup at `docs/brainstorm/menu-redesign-variants.html` for reference.

## Outstanding (user-triggered, not auto)
- Deploy authorization THIS turn (per V18 lock — never roll over)
- Future: Phase B (15 modals redesign) when user opts in
- Future: Phase C (settings + chat + light theme) when user opts in
- Future: Phase D (backend redesign) when user opts in

## Rule Q V66 status
- L1 (real-browser preview_eval at 3 viewports) — desktop 1440 + mobile 375 verified via DOM introspection
- Playwright L1 NOT run this session (preview_eval covered the verification surface; user can request Playwright if needed for screenshot evidence)
- L2 not applicable — pure UI restructure, no data layer changes
