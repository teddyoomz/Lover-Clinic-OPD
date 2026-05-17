# Backend Menu Redesign — Variant D (Arc Fan Bloom + Duo Pill + Toggle)

**Status**: Design APPROVED 2026-05-18 EOD+4 · awaits writing-plans
**Scope**: BACKEND ONLY · cosmetic shell · no flow/logic/wiring changes
**Reference mockup**: `docs/superpowers/specs/2026-05-18-backend-menu-redesign-mockup.html` (final iterated design)
**Mockup history**: `.superpowers/brainstorm/1299-1779039977/content/` (5 mockup files, last = `menu-d-bloom-themed-v1.html`)

---

## 1. Origin

User: *"Redesign Menu ของ Backend ใน Mobile (และ Desktop ด้วยถ้านายคิดว่ามีสิ่งที่ดีและสวยกว่านี้) ให้ Menu นั้นสามารถใช้งานได้ง่ายและสวยงามกว่านี้ ให้เหมาะสมกับการใช้งานในโทรศัพท์สำหรับแอปที่มีเมนูและหมวดหมู่เยอะขนาดนี้"*

Current Backend menu (8 sections × 50+ leaves) uses an off-canvas drawer (mobile) + sidebar (desktop) with accordion. Hard to scan on mobile; lots of vertical scrolling. User wants something modern/beautiful that handles the scale.

**Brainstormed via 5-variant Visual Companion** → user picked **D (Floating Hub + Bloom)** → refined to **D2 Arc Fan + Duo Pill placement + Red-Black space (Dark) / Sakura petals (Light)**.

---

## 2. Locked Design Decisions

| # | Decision | Lock |
|---|---|---|
| 1 | **Variant** = D (Floating Hub) · **Bloom style** = D2 Arc Fan (8 orbs radial around Duo Pill, spring physics 0.5s) | ✓ |
| 2 | **Duo Pill** [💬 chat · ≡ menu] bottom-right · backdrop-blur 16px · Liquid Glass · co-locates V73 StaffChatBubble + new menu trigger | ✓ |
| 3 | **Top bar 5 utility buttons preserved + visible at all times** in every state (Idle / Bloom open / Profile open): 🏠 Frontend · 🛒 Shortcut (briefcase) · 📍 Branch dropdown · Dark\|Light Theme · 👤 ProfileDropdown (clickable, opens menu) | ✓ |
| 4 | **Layout responsive** · Mobile <768px: 2-row top bar 44px · Desktop ≥768px: 1-row top bar 48px | ✓ |
| 5 | **Dark theme bloom BG** = deep black space (`#020106 → #050308 → #02010a`) + 3 small red nebula patches + 50+ random-distributed stars (white majority / red minority / orange accent) + 3-4 floating embers + drift animations · all CSS-only (no canvas/JS loop) | ✓ |
| 6 | **Sakura (Light) theme bloom BG** = soft pink (`#fff0f5 → #ffe4ec → #ffd1dc`) + radial pink mist + 17-22 falling petals (3 sizes × 3 pink shades) · `petal-fall` 5-9s rotate + drift | ✓ |
| 7 | **Header BG blends with bloom** · same hue family (Dark = red-black gradient + ember radial · Sakura = soft pink gradient + blossom radial) · `backdrop-filter: blur(14px)` frosted glass · matched border accent | ✓ |
| 8 | **Orb "floats from BG" effect** · multi-layer shadow + colored halo + top highlight + inset · gentle gold-orange flame glow on Dark theme (3 keyframe variants `orb-float-A/B/C` + nth-of-type stagger to desync) + pink shadow on Sakura · `fire-pulse` 3s subtle blob (opacity 0.6↔0.9, scale 0.96↔1.08) | ✓ |
| 9 | **Menu mode toggle ⚡↔📋** · Desktop+Tablet ≥768px only · pill between 🛒 and Branch dropdown · `[⚡ ใหม่ \| 📋 เดิม]` · gold-orange active state (Dark) / pink-orange (Sakura) · **Mobile <768px forced 'new'** | ✓ |
| 10 | **Toggle persistence per-device** · `localStorage.setItem('lover.backendMenuMode', 'new' \| 'classic')` · default `'new'` · scope: browser × device (intentional — different devices keep their own preference) | ✓ |
| 11 | **Seamless instant switch (no refresh)** · React state swaps `<BackendShellNew>` ↔ existing `<BackendNav>` (Classic) · 200ms fade transition · BackendNav stays in codebase 100% · sub-components reused verbatim both modes | ✓ |
| 12 | **A11y** · bloom = `role="dialog" aria-modal="true"` · 8 orbs = `role="menuitem" tabindex` · focus trap · Esc close · arrow-keys navigate · `prefers-reduced-motion` honored (no fall/twinkle/float when set) | ✓ |
| 13 | **Removed (Variant D path only)** · BackendMobileDrawer off-canvas accordion on mobile (replaced by bloom) · BackendCmdPalette (Cmd+K) kept for power users | ✓ |

---

## 3. Preserved-Contract Invariant (NON-NEGOTIABLE)

Per `feedback_cosmetic_shell_redesign_constraint.md` — every existing handler/state/prop must remain **VERBATIM**:

### Top bar utility chrome
- `🏠 Frontend` → existing `window.location.href = '/'`
- `🛒 briefcase` → existing handler (whatever it is now)
- `BranchSelector` → imported verbatim, same props
- `ThemeToggle` → imported verbatim, same props (`theme`, `setTheme`)
- `ProfileDropdown` → imported verbatim
- Notif popover → preserved (currently in BackendTopBar mobile)
- `BackendCmdPalette` (Cmd+K) → preserved for power-user access

### Section/leaf navigation
- 8 sections from `navConfig.js NAV_SECTIONS` mapped to 8 orbs (icon + label from same data source)
- `onNavigate(tabId)` callback → existing in BackendNav, used verbatim
- `activeTabId` state → driven by existing `BackendDashboard.activeTab` state
- Permission gating via existing `useTabAccess` / `canAccess` — orbs respect same gates

### Floating chrome
- `StaffChatBubble` (V73 + V82) → wired into Duo Pill chat segment · same props · same listeners (no behavior change · purely visual relocation into pill container · existing `bottom-[88px]` Mobile lift CSS removed since pill now anchors it)

### Mode toggle
- Default mode `'new'` · classic mode reuses existing `<BackendNav>` 100% (no edits to BackendNav, BackendSidebar, BackendMobileDrawer, BackendTopBar, breadcrumbSlot)
- State stored in React + localStorage · NO route change · NO re-mount of child tabs

**Anti-pattern alarm**: anything that touches handler signatures, splits callbacks, consolidates state, "while I'm here" cleanup → STOP. Cosmetic only.

---

## 4. Files Affected (Estimate — confirmed during writing-plans)

### NEW files (~6 files)
- `src/components/backend/shell/BackendShellNew.jsx` — top-level shell wrapper · renders top bar + Duo Pill + bloom · 200-300 LOC
- `src/components/backend/shell/BackendTopBarNew.jsx` — single component for new top bar (mobile 2-row + desktop 1-row responsive) · ~150-200 LOC
- `src/components/backend/shell/BackendDuoPill.jsx` — Duo Pill bottom-right · 50-100 LOC · wraps StaffChatBubble chat segment + menu trigger
- `src/components/backend/shell/BackendArcBloom.jsx` — fullscreen bloom overlay with 8 orbs · spring/animation · keyboard + focus-trap · 150-200 LOC
- `src/components/backend/shell/BackendMenuModeToggle.jsx` — toggle pill component with localStorage hook · 50 LOC
- `src/components/backend/shell/backendMenuMode.js` — pure helper · `getBackendMenuMode()` / `setBackendMenuMode()` / `useBackendMenuMode()` hook · localStorage key `lover.backendMenuMode` · 50 LOC

### MODIFIED files (~3 files)
- `src/pages/BackendDashboard.jsx` — wrap children in `{mode === 'new' ? <BackendShellNew>...</> : <BackendNav>...</>}` · ~5-line change · `useBackendMenuMode()` hook
- `src/index.css` — new CSS classes for shell (bloom space + sakura petals + orb glow + Duo Pill) · ~150-250 LOC of styles
- `src/components/backend/nav/navConfig.js` — possibly add `palette` / icon size hints (NO behavior change · only metadata used by new bloom)

### NEW tests (≥6 files per test pyramid)
- `tests/backend-menu-d-shell-rtl.test.jsx` — RTL render new shell · click each button → original handler invoked verbatim · ~15-25 assertions
- `tests/backend-menu-d-toggle-localstorage.test.js` — pure helper + hook test · per-device persistence · default fallback · ~10 assertions
- `tests/backend-menu-d-source-grep.test.js` — every handler/prop/state-reader wired at expected callsite · NO legacy markup orphaned · ~20 source-grep regression locks
- `tests/backend-menu-d-flow-simulate.test.js` — Rule I full-flow chain (tap orb → mode switch → state change → re-render) · ~10 simulated user flows
- `tests/e2e/backend-menu-d.spec.js` — Playwright real browser · real Firestore · click every orb · 5 utility buttons · toggle switch · ~30 e2e scenarios
- `tests/backend-menu-d-stress.test.js` — rapid clicks 10/s × 5 buttons · branch switch chaos · theme thrash · 50× profile open/close · 100× toggle · no leak / no stale state / no double-fire
- `tests/backend-menu-d-user-simulation.mjs` — Node bot · random N clicks · 100% pass rate · no console error · loop until perfect

### Required outcome
- `npm run build` clean (no INEFFECTIVE_DYNAMIC_IMPORT new warnings beyond baseline)
- Full vitest GREEN (11409 → 11409+N)
- Playwright real-browser GREEN
- L1 user hands-on on mobile + desktop · Dark + Sakura both themes · classic ↔ new toggle round-trip

---

## 5. Out of Scope

- Frontend menu (`/admin` page Menu V2 from EOD+3) — UNCHANGED
- Any change to: NAV_SECTIONS data structure (only metadata add allowed) · permission system · routing · Firestore queries · auth flow
- Removing classic mode code (kept for fallback)
- New features beyond cosmetic redesign

---

## 6. Test Discipline (User-mandated)

Per `feedback_cosmetic_shell_redesign_constraint.md` (the "หน้ากากไปครอบ" lesson):

> *"ทุกปุ่มทำหน้าที่ได้สมบูรณ์แบบอยู่แล้ว ... สิ่งที่เราทำต่อไปนี้ก็ต้องไปประกบกับสิ่งเดิมที่สมบูรณ์แบบอยู่แล้วแบบห้ามพลาดเท่านั้น เป็นห่วงและ Concern อยากให้เข้มงวดมากๆ รวมถึงการเทสให่ครบคลุม ทั้ง e2e , stress , user stimulate ด้วย เอาให้จบ ถ้าไม่จบก็วนลูปเทสแล้วแก้ซ้ำไปเรื่อยๆจนจบ Perfect 100%"*

**6-tier test pyramid** — every tier must pass before claim "done":
1. RTL component — render + click → original handler invoked
2. Source-grep regression — every callsite/prop/handler wired
3. Rule I flow-simulate — full chain (tap → state → re-render)
4. Playwright e2e — real browser + real Firestore
5. Stress — chaos (rapid clicks, branch switch, theme thrash)
6. User simulation — bot random clicks · 100% pass rate

**Loop discipline**: ANY red → fix → re-run ENTIRE pyramid → never claim done until **100% Perfect**.

---

## 7. References

- **Mockup files** (HTML): `.superpowers/brainstorm/1299-1779039977/content/menu-d-bloom-themed-v1.html` (final · 800+ lines · all 4 themes × all states + Classic mode + lock card)
- **Permanent mockup**: `docs/superpowers/specs/2026-05-18-backend-menu-redesign-mockup.html` (copy of final for git tracking)
- **Memory feedback**: `~/.claude/projects/F--LoverClinic-app/memory/feedback_cosmetic_shell_redesign_constraint.md`
- **Iron-clad rules**: `.claude/rules/01-iron-clad.md` (Rule Q V66 — real-adversarial verification)
- **Existing nav code**: `src/components/backend/nav/{BackendNav,BackendTopBar,BackendMobileDrawer,BackendCmdPalette,navConfig}.jsx/js` · `src/pages/BackendDashboard.jsx` lines 280-347 (breadcrumbSlot) + 5750-5930 (NOT TOUCHED — those are Frontend Menu V2, OUT OF SCOPE)
- **Sub-components reused verbatim**: `BranchSelector` · `ThemeToggle` · `ProfileDropdown` · `StaffChatBubble` (V73/V82) · `BackendCmdPalette`

---

## 8. Spec self-review

Done inline:
- [x] No placeholders / TBDs
- [x] Internal consistency (preserved-contract section matches what variant D needs)
- [x] Scope focused on Backend cosmetic shell · single-implementation plan size
- [x] Ambiguity resolved (mode toggle persistence per-device explicit · seamless switch explicit · classic mode kept 100% explicit)

---

## 9. Next step

**writing-plans skill** in a fresh chat (this chat near context cap):
- Read this spec + final mockup HTML
- Break into 8-12 implementation tasks (per `feedback_keep_task_count_tight.md` — don't pad)
- Each task includes preserved-contract verification + relevant test tier
- Save plan to `docs/superpowers/plans/2026-05-18-backend-menu-redesign-variant-d.md`
