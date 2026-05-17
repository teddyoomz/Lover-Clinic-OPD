# 2026-05-18 EOD+4 — Backend Menu Redesign Variant D · Design phase (spec + mockup, no code)

## Summary

Brainstormed Backend menu redesign for mobile (and desktop) via 5-variant Visual Companion. User picked **Variant D Floating Hub** → iterated 8+ refinement rounds to final design: **D2 Arc Fan bloom + Duo Pill bottom-right + 5 utility buttons preserved + Mode Toggle ⚡↔📋 with per-device localStorage**. Dark theme = red-black space + random stars + flame-glow orbs; Sakura (Light) theme = white-pink + falling petals. Spec + mockup committed. **No code touched this session** — pure design. Writing-plans deferred to fresh chat (context near cap).

## Current State

- master = `257a699f` (V82-Phone shipped previously) · prod = `ef4bd5c3` (V82-Phone pending deploy auth)
- 11409/11409 PASS baseline · build clean · no changes this session
- Backend Menu D design **APPROVED** and committed in `docs/superpowers/specs/`
- Frontend Menu V2 (EOD+3) UNCHANGED · this redesign is Backend-only
- Two new feedback memories saved (cosmetic-shell + task-count-tight)

## Commits (this session)

```
(commits will come from wrap-up only — design files + state files)
docs(agents): EOD+4 2026-05-18 — Backend Menu D design (spec + mockup committed)
```

## Files Touched

- NEW `docs/superpowers/specs/2026-05-18-backend-menu-redesign-variant-d-design.md` (190 lines · 13 locked decisions · preserved-contract invariant · 6-tier test pyramid · files-affected estimate)
- NEW `docs/superpowers/specs/2026-05-18-backend-menu-redesign-mockup.html` (1194 lines · final iterated mockup · all 4 theme×state combos + Classic mode)
- NEW `~/.claude/projects/F--LoverClinic-app/memory/feedback_cosmetic_shell_redesign_constraint.md` (cosmetic-shell rule + 5 invariants + 6-tier test pyramid + anti-patterns)
- NEW `~/.claude/projects/F--LoverClinic-app/memory/feedback_keep_task_count_tight.md` (don't pad task lists · default merge over split · cap ~15 tasks typical · Menu V1 failure precedent)
- MOD `~/.claude/projects/F--LoverClinic-app/memory/MEMORY.md` (+2 new memory index entries)
- MOD `.agents/active.md` (state update)
- MOD `SESSION_HANDOFF.md` (Current State + new session block)
- NEW `.agents/sessions/2026-05-18-backend-menu-d-design.md` (this file)
- Mockup iteration history kept in `.superpowers/brainstorm/1299-1779039977/content/` (gitignored)

## Locked Design Decisions (13)

1. **Variant** = D Floating Hub · **Bloom** = D2 Arc Fan (8 orbs radial spring 0.5s)
2. **Duo Pill** [💬 chat \| ≡ menu] bottom-right · backdrop-blur 16px · Liquid Glass · merges V73 StaffChatBubble + new menu trigger
3. **Top bar 5 utility buttons** preserved + visible in every state: 🏠 Frontend · 🛒 Shortcut · 📍 Branch · Dark\|Light · 👤 ProfileDropdown (clickable, opens menu)
4. **Layout responsive** · Mobile <768px: 2-row 44px · Desktop ≥768px: 1-row 48px
5. **Dark bloom BG** = deep black space + 3 small red nebula + 50+ random stars (white majority) + 3-4 floating embers + drift anim
6. **Sakura bloom BG** = soft pink + radial mist + 17-22 falling petals (3 sizes × 3 shades) + `petal-fall` 5-9s
7. **Header BG blends with bloom** · same hue family · backdrop-filter blur 14px · matched border accent
8. **Orb "float from BG"** · multi-layer shadow + colored halo + gentle gold-orange flame on Dark (mid intensity · `fire-pulse` 3s subtle) + pink on Sakura · 3 keyframe variants + nth-of-type stagger
9. **Mode toggle ⚡↔📋** · Desktop+Tablet ≥768px only · pill between 🛒 and Branch · mobile <768px forced 'new'
10. **Toggle per-device persistence** · `localStorage.setItem('lover.backendMenuMode', 'new'|'classic')` · default `'new'` · browser × device scope (intentional)
11. **Seamless instant switch** · React state swap `<BackendShellNew>` ↔ existing `<BackendNav>` · 200ms fade · classic BackendNav kept 100%
12. **A11y** · bloom `role="dialog" aria-modal="true"` · orbs `role="menuitem"` · focus trap · Esc + arrow keys · `prefers-reduced-motion` honored
13. **Removed (in 'new' mode)** · BackendMobileDrawer off-canvas (replaced by bloom) · BackendCmdPalette Cmd+K kept

## Preserved-Contract Invariant (NON-NEGOTIABLE)

Per `feedback_cosmetic_shell_redesign_constraint.md`:
- Every existing handler/state/prop verbatim (BranchSelector · ThemeToggle · ProfileDropdown · StaffChatBubble · BackendCmdPalette · BackendNav · onNavigate · activeTabId · breadcrumbSlot)
- NAV_SECTIONS data structure unchanged · permission gating via existing `useTabAccess` · routing unchanged · Firestore queries unchanged · auth flow unchanged
- StaffChatBubble V73/V82 props + listeners 100% preserved (relocates into Duo Pill chat segment · no behavior change)
- Classic mode reuses existing BackendNav verbatim · no edits to BackendNav / BackendSidebar / BackendMobileDrawer / BackendTopBar / breadcrumbSlot

## Test Pyramid Required (6 tiers)

User-mandated *"e2e · stress · user simulate · loop until 100% Perfect"*:
1. RTL — render + click → original handler invoked
2. Source-grep — every callsite/prop/handler wired
3. Rule I flow-simulate — full chain
4. Playwright e2e — real browser + real Firestore
5. Stress — rapid clicks, branch switch, theme thrash, profile open/close, 100× toggle
6. User simulation — Node bot random N clicks · 100% pass rate

Loop discipline: ANY red → fix → re-run ENTIRE pyramid → no "done" claim until 100% Perfect.

## Files Estimated for Implementation

- NEW ~6 files: `BackendShellNew.jsx` + `BackendTopBarNew.jsx` + `BackendDuoPill.jsx` + `BackendArcBloom.jsx` + `BackendMenuModeToggle.jsx` + `backendMenuMode.js` (helper + hook)
- MOD ~3 files: `BackendDashboard.jsx` (5-line wrap), `index.css` (150-250 LOC of bloom/sakura/orb CSS), `navConfig.js` (metadata only · no behavior)
- NEW ≥6 test files: RTL · source-grep · localStorage helper · flow-simulate · Playwright · stress · user-sim

## Next Todo

**Fresh chat** (this chat near context cap · cannot do writing-plans safely here):
1. `Skill(writing-plans)` against `docs/superpowers/specs/2026-05-18-backend-menu-redesign-variant-d-design.md`
2. Output plan → `docs/superpowers/plans/2026-05-18-backend-menu-redesign-variant-d.md`
3. Target **8-12 tasks** (cap 15 per keep-task-tight rule)
4. Each task: preserved-contract verification + test tier coverage
5. Commit plan · then `Skill(executing-plans)` OR `Skill(subagent-driven-development)` to ship

## Resume Prompt

Resume LoverClinic — continue from 2026-05-18 EOD+4 (Backend Menu D design complete · writing-plans next).

Read in order BEFORE any tool call:
1. CLAUDE.md
2. SESSION_HANDOFF.md (master=257a699f, prod=ef4bd5c3)
3. .agents/active.md (11409 PASS · design committed)
4. .claude/rules/00-session-start.md (iron-clad + V-summary)
5. .agents/sessions/2026-05-18-backend-menu-d-design.md (this checkpoint)
6. docs/superpowers/specs/2026-05-18-backend-menu-redesign-variant-d-design.md (the spec)
7. (optional reference) docs/superpowers/specs/2026-05-18-backend-menu-redesign-mockup.html (visual)

Status: master=257a699f · 11409 tests pass · prod=ef4bd5c3 LIVE · Backend Menu D design APPROVED

Next: invoke `Skill(writing-plans)` against the spec → output `docs/superpowers/plans/2026-05-18-backend-menu-redesign-variant-d.md` (8-12 tasks, cap 15). Each task preserves-contract verbatim + includes test tier. Memory loaded: `feedback_cosmetic_shell_redesign_constraint.md` (no flow/logic/wiring changes · 6-tier test pyramid · loop until 100% Perfect) + `feedback_keep_task_count_tight.md` (don't pad). After plan committed → executing-plans OR subagent-driven-development.

Outstanding (user-triggered): (1) V82-Phone deploy authorization for `257a699f` (vercel-only · no rules change); (2) Backend Menu D writing-plans then execute; (3) V82 Menu V2 user L1 mobile re-test pending.

Rules: no deploy without "deploy" THIS turn (V18); V15 combined; Probe-Deploy-Probe; cosmetic-shell ห้ามแตะ wiring; 6-tier test pyramid mandatory before claim "done".

/session-start
