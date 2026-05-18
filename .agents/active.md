---
updated_at: "2026-05-18 EOD+10 — V86 v1 + followup-2 shipped (universal red + dimmer + admin-tunable Settings UI)"
status: "30+ commits ahead of prod · awaiting deploy verb · V86 ready (Phase A 64/64 vitest + Phase B 8 Playwright skip-graceful · build clean · partial Phase C L1 verified)"
branch: "master"
last_commit: "cc3aea81 test(V86-followup-2 T4): CG2/CG3/CG8 rewrite + CG9 NEW + VS1-VS6 + B1-B4 rewrite + B8 NEW + AV83 update"
tests: "Phase A vitest 64/64 PASS (CG1-CG9 + VS1-VS6) · Phase B Playwright 8 scenarios skip-graceful · build clean · partial Phase C real-prod L1 (appointments verified pre-pivot)"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "ef4bd5c3 LIVE (V84 + V85 + AV82 + V86 v1 + V86-followup-2 stack NOT deployed)"
firestore_rules_version: "unchanged"
---

# Active Context

## State
- **V84 + V85 SHIPPED locally** (~21 commits ahead of prod since 2026-05-18 EOD).
- V85 = Universal glow effect (20 utility classes + 2 auto-glow CSS rules covering ALL backend cards + ALL modals at body-root). Spec/plan/AV81 invariant + V21 fixup landed.
- Sub-tab picker (BackendSubTabBloom) fixed via createPortal — escaped bloom-stage's transform-containing-block so full-viewport blur works.
- TopBar (BackendShellNew) Briefcase icon → wide search-box trigger (32×320px) with 3-zone justify-between layout.

## What this session shipped
- **V86-followup-2 Universal Red Glow + Admin-Tunable Settings UI** (commits 27f39864 → cc3aea81) — pivot V86 v1 from per-section dual-tone (8 ArcBloom colors) to universal RED (c1=#dc2626 red-600 border + c2=#ef4444 red-500 halo) + `--neon-intensity` multiplier (default 0.45 = Q1=C dim red). All V86 alphas wrap in `calc(<base> * var(--neon-intensity))` so single slider drives global brightness. Dropped 8 per-section [data-section] CSS-vars blocks. NEW `useV86GlowApply` hook at App.jsx root + NEW SystemSettingsTab 5th SectionCard "เอฟเฟกต์แสงเรือง": 2 color pickers + 4 presets each + intensity slider 0-150% + enabled toggle + live preview card + Save/Reset/Cancel buttons + persist to `clinic_settings/system_config.v86Glow` + audit doc. AV83 wording updated. Defense-in-depth menu :not() chain on admin-frontend-zone (per user "ห้ามแตะเมนู"). Tests: Phase A 64/64 vitest (CG1-CG9 + VS1-VS6) + Phase B 8 Playwright (B1-B8 incl. NEW B8 live-slider). 5-task plan inline-executed.
- **V85-followup AV82 Cmd-palette closes bloom** (commit c93287bc) — `handleNavigate` adds `setBloomOpen(false)` + `setPaletteOpen(false)` after `onNavigate?.(tabId)`. Root cause: shell-owned overlay state leak on navigation through the central handleNavigate handler (single-broken path; ArcBloom paths already explicit). Tier 2 artifacts: AV82 invariant + T6.13/T6.14 regression. Real-prod preview L1: Cmd-K → palette opens over bloom → pick item → both collapse + tab switches (2 scenarios). User report verbatim: "menu ui space ข้างหลังมันไม่ปิด".
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
