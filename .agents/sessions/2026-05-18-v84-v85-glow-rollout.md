# 2026-05-18 EOD+9 — V84 chat-tab fix + V85 universal glow rollout

## Summary
V84 closed the chat-tab badge overflow bug (AV80). V85 = brainstorming → spec → plan → 5 phases shipped → 4 follow-up rounds — culminating in a universal glow effect system that lifts every dark-theme card/modal from background via 27 utility classes + 2 auto-glow CSS rules, while sanctioned-excluding the entire menu system + print-render path. Plus 2 mid-session tangents: sub-tab picker portal fix (3 rounds to find the bloom-stage transform containing-block root cause) and BackendShellNew topbar search-box trigger (4 rounds tuning scale + 3-zone layout + cmd palette backdrop-close).

## Current State
- master = `0a01100e` · ~21 commits ahead of prod (`ef4bd5c3` LIVE)
- 86/86 V85 source-grep regression assertions + 3 CG6 application audits pass
- Full vitest baseline preserved (pre-existing V21 lock-ins on v83-followup-6 fixed)
- Build clean 3.29s
- AV80 (V84) + AV81 (V85) invariants codified in `audit-anti-vibe-code` SKILL.md
- 7-scenario Playwright L1 spec at `tests/e2e/v85-glow-utility-application.spec.js` (skip-graceful without admin creds env)

## Commits (this session, latest first)
```
0a01100e feat(V85-followup): topbar 3-zone layout + search box scale + palette backdrop-close
b7db41f1 feat(V85-followup): topbar search-box trigger + backdrop-close on cmd palette
f6fb23ae revert(V85-followup): restore .subtab-modal original dark gradient bg + heavy drop-shadow
615f1030 fix(V85-followup): sub-tab picker portal escape — full-screen blur restored
59fbc7d3 fix(V85-followup): remove sub-tab picker's heavy dark drop-shadow halo
fb2723fb fix(V85-auto-glow): boost light-theme auto-glow to match user expectation
780b0664 feat(V85-auto-modal): auto-glow ALL modal content cards via fixed-inset selector
118808e3 feat(V85-auto-glow): single CSS rule lifts EVERY card inside backend-content
97705f99 feat(V85-Phase-E): CG6 application audit + Playwright L1 spec (Rule Q V66)
658c93e3 feat(V85-Frontend-ext): apply U3 chat-panel + V8 history-panel in AdminDashboard
a4fc34d8 feat(V85-Phase-C-ext): apply V3 Wide-Aurora to BackupManagerTab + BranchBackupTab outer panels
f5eb24b4 feat(V85-Phase-B/C/D-ext): MarketingFormShell V10 card + CustomerDetailView V9 profile + ReportsHomeTab V5 KPI
09c99ffc feat(V85-Phase-D-partial): apply U10 glassmorphism to MarketingFormShell backdrop + !important fix
1ec135ad feat(V85-Phase-B-partial): apply U3 to BackendDashboard content wrapper + U9 per-domain to 2 tabs
bc9fa52a test(V21-fixup): align V83-followup-7 SH1/SH3/SH4 with followup-16 CSS strip
23a82205 feat(V85-Phase-A): CSS foundation — 20 glow utility classes + 8 U9 sub-modifiers + light theme + reduced-motion + tests
85ec1134 docs(V85): consolidate plan 47→5 tasks + LOUD cosmetic-shell banner
a8b92f16 docs(V85): implementation plan — 5 phases (A foundation → E verify)
8d7c876e docs(V85): brainstorming spec + Visual Companion + AV81 invariant (APPROVED)
2dcb4c79 fix(V84): chat-tab badge overflow-y clip + neighbor overlap + halo containment (AV80)
```

## Files Touched (key)
- `src/index.css` — V85 utility block + 2 auto-glow rules + V84 fixes (~700 LOC)
- `src/pages/AdminDashboard.jsx` — V84 menu-tab-scroll + V85 chat U3 + history V8
- `src/pages/BackendDashboard.jsx` — V85 fx-glow-u3 global content wrapper
- `src/components/backend/CustomerListTab.jsx` + `SaleTab.jsx` — V85 U9 per-domain tints
- `src/components/backend/CustomerDetailView.jsx` — V85 V9 main profile card
- `src/components/backend/BackupManagerTab.jsx` + `BranchBackupTab.jsx` — V85 V3 wide-aurora
- `src/components/backend/reports/ReportsHomeTab.jsx` — V85 V5 KPI tiles
- `src/components/backend/MarketingFormShell.jsx` — V85 U10 backdrop + V10 content
- `src/components/backend/shell/BackendSubTabBloom.jsx` — createPortal escape (menu touch, user explicit)
- `src/components/backend/shell/BackendTopBarNew.jsx` — search-box trigger + 3-zone layout
- `src/components/backend/nav/BackendCmdPalette.jsx` — AV78 exemption (backdrop close)
- `tests/v85-glow-utility-css.test.js` (NEW · 86 + 3 = 89 assertions)
- `tests/v84-menu-badge-overflow-y-clip.test.js` (NEW · 20 assertions)
- `tests/v83-followup-6-tilt-symmetry-zero-base.test.js` — V21 fixup
- `tests/e2e/v85-glow-utility-application.spec.js` (NEW · 7 Playwright scenarios)
- `.claude/skills/audit-anti-vibe-code/SKILL.md` — AV80 + AV81
- `docs/superpowers/specs/2026-05-18-v85-glow-effect-universal-design.md` (NEW)
- `docs/superpowers/plans/2026-05-18-v85-glow-effect-universal.md` (NEW)
- `public/v85-glow-variants.html` (NEW · 30 mockups Visual Companion)

## Decisions (one-line each — full reasoning → v-log-archive.md V85-V85followup entries)
- V85 strategy = "global rule beats per-file edit" — 2 auto-glow CSS rules + ~10 explicit additions cover 100s of surfaces via React composition (not per-component editing).
- Auto-modal rule scope via `[class*="fixed"][class*="inset-0"]:not([data-testid="bloom-overlay"])...` — catches all body-root modals, excludes menu overlays.
- V84 padding-margin trick for `.menu-tab-scroll` — single 4-line CSS pattern solves overflow-x-auto's implicit overflow-y clipping.
- Sub-tab picker fix = React.createPortal(picker, document.body) — single-line escape from bloom-stage's transform containing block (not CSS workaround).
- TopBar 3-zone justify-between distributes evenly at 1024-1920 viewports (LEFT pinned left, CENTER flex-1 with search 320px max, RIGHT pinned right).
- AV78 exemption for cmd palette — nav tool with no unsaved data; click-outside-to-close is canonical convention for ⌘K command palettes.
- max-w-md in this project's Tailwind = 672px (custom remap), explicit `max-w-[320px]` bracket value is the canonical fix for tight scaling.
- Plan revision 47→5 tasks per user "เห็น 47 TASK แล้วสยอง" + "ห้ามแตะ wiring/logic/flow" — cosmetic-shell banner LOUD at top of plan; tests run AT END OF PHASE only.

## Next Todo
1. **Deploy verb** — combined queue ~21 commits vercel-only (no firestore rules change since V82-Phone)
2. **Chat-tab unread badge crowding** (OPEN — pre-V85 carryover) — `.menu-badge` is position:absolute so siblings shouldn't shift; needs systematic-debugging Phase 1
3. Chrome MCP extension reconnect (user complained Claude Preview slow EOD+9)
4. V82 Menu V2 mobile L1 re-test (carryover)
5. Playwright L1 hands-on `npx playwright test tests/e2e/v85-glow-utility-application.spec.js` once admin creds env set
6. Post-deploy Rule Q L1 visual review of glow rollout across dark + light theme on 10 key screens

## Resume Prompt

Resume LoverClinic — continue from 2026-05-18 EOD+9.

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=`0a01100e`, prod=`ef4bd5c3` LIVE)
3. .agents/active.md (86/86 V85 source-grep + CG6 audit + 7 Playwright scenarios)
4. .claude/rules/00-session-start.md (iron-clad + V-summary V83 + AV80 + AV81)
5. .agents/sessions/2026-05-18-v84-v85-glow-rollout.md (this checkpoint)

Status: master=`0a01100e`, 86 V85 tests pass + build clean 3.29s, prod=`ef4bd5c3` LIVE (V84 + V85 stack of ~21 commits NOT deployed).

Next: idle until user types "deploy" (combined queue vercel-only) OR investigate chat-tab badge crowding bug.

Outstanding (user-triggered):
- deploy verb (combined queue)
- Chat-tab unread badge crowds neighbors (OPEN — pre-V85 carryover)
- Chrome MCP extension reconnect
- V82 Menu V2 mobile L1 re-test
- Playwright L1 hands-on tilt + glow

Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe; cosmetic-shell ห้ามแตะ wiring; Rule Q V66 L1 Playwright mandatory.

/session-start
