---
updated_at: "2026-05-18 EOD+9 — V84 + V85 universal glow shipped (foundation + auto-glow rules + sub-tab fix + topbar search box)"
status: "21 commits ahead of prod · awaiting deploy verb · 1 OPEN UX bug deferred (chat-tab badge crowding — pre-V85)"
branch: "master"
last_commit: "0a01100e feat(V85-followup): topbar 3-zone layout + search box scale + palette backdrop-close"
tests: "86/86 V85 source-grep + CG6 application audit · build clean 3.29s · full vitest baseline 11826/3F/25S (pre-V85 V21 fixed)"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "ef4bd5c3 LIVE (V84 + V85 stack NOT deployed)"
firestore_rules_version: "unchanged"
---

# Active Context

## State
- **V84 + V85 SHIPPED locally** (~21 commits ahead of prod since 2026-05-18 EOD).
- V85 = Universal glow effect (20 utility classes + 2 auto-glow CSS rules covering ALL backend cards + ALL modals at body-root). Spec/plan/AV81 invariant + V21 fixup landed.
- Sub-tab picker (BackendSubTabBloom) fixed via createPortal — escaped bloom-stage's transform-containing-block so full-viewport blur works.
- TopBar (BackendShellNew) Briefcase icon → wide search-box trigger (32×320px) with 3-zone justify-between layout.

## What this session shipped
- **V84 chat-tab badge fix** (commit 2dcb4c79) — overflow-y clip + neighbor overlap + halo containment (AV80)
- **V85 brainstorming** spec + Visual Companion 30 mockups + AV81 invariant (approved by user)
- **V85 plan** v1 → consolidated v2 (5 phase-tasks + cosmetic-shell banner)
- **V85 Phase A** (23a82205) — 27 utility classes + 86 source-grep
- **V21 fixup** (bc9fa52a) — V83-followup-7 SH1/3/4 aligned with -16 strip
- **V85 Phase B/C/D/Frontend ext** (1ec135ad, 09c99ffc, f5eb24b4, a4fc34d8, 658c93e3) — strategic per-shell tints + V10 modal sweep
- **V85 Phase E** (97705f99) — CG6 application audit + Playwright L1 spec
- **V85 auto-glow rules** (118808e3, 780b0664, fb2723fb) — universal backend cards + modals via descendant selectors
- **Sub-tab picker portal fix** (615f1030, 59fbc7d3, f6fb23ae) — full-viewport blur via React.createPortal escape
- **TopBar search-box trigger** (b7db41f1, 0a01100e) — 32×320px 3-zone justify-between + Cmd palette backdrop close (AV78 exemption)
- Checkpoint: `.agents/sessions/2026-05-18-v84-v85-glow-rollout.md`

## Decisions
- V85 strategy = "global rule beats per-file edit" — 2 auto-glow CSS rules (one for backend-content cards, one for modal content cards) cover 100s of surfaces from ~10 explicit class additions.
- Auto-modal rule excludes bloom-overlay/bloom-stage/bloom-backdrop via :not() chain — menu untouched.
- Sub-tab picker fix = createPortal(picker, document.body) — single-line React change to escape transform containing block.
- TopBar 3-zone = LEFT cluster flex-shrink-0 + CENTER flex-1 with justify-center + RIGHT cluster flex-shrink-0. justify-between distributes evenly at all widths 768-1920.
- AV78 exemption for cmd palette (click-outside-to-close) — palette is nav tool, no unsaved data, established convention.

## Next action
**Idle until user types "deploy"** — 21 commits queued vercel-only (no firestore rules change since V82-Phone). Post-deploy: Rule Q L1 hands-on visual review of glow rollout across dark + light theme.

## Outstanding user-triggered actions
- **Deploy verb** — combined queue (vercel-only)
- **Chat-tab unread badge crowding** (OPEN — pre-V85, deferred from EOD+8) — `.menu-badge` position:absolute so siblings shouldn't shift; needs systematic-debugging Phase 1
- **Chrome MCP extension reconnect** (carryover — Claude Preview slow per user request)
- **V82 Menu V2 mobile L1 re-test** (carryover)
- **Playwright L1 hands-on** — `npx playwright test tests/e2e/v85-glow-utility-application.spec.js` when admin creds env set
