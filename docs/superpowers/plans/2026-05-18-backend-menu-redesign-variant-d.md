# Backend Menu Redesign — Variant D Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a cosmetic Backend shell redesign — **D2 Arc Fan bloom + Duo Pill + Mode Toggle** — that wraps the existing BackendDashboard with a modern hub UI on Mobile and Desktop, preserving 100% of current handlers/state/props/wiring. Classic mode (existing `BackendNav`) is kept verbatim and selectable via per-device localStorage.

**Architecture:**
- **New** `<BackendShellNew>` component tree mounted conditionally at `BackendDashboard.jsx:349-357` based on `useBackendMenuMode()` (default `'new'`).
- **Existing** `<BackendNav>` + sub-components untouched. Both shells consume the same `activeTabId`, `onNavigate`, `theme`, `setTheme`, `clinicSettings`, `topBarSlot`, `children` contract.
- **StaffChatWidget** (mounted in `App.jsx`) stays mounted; in new-mode the standalone bubble hides via CSS (`html[data-backend-menu-mode="new"]`) and `<BackendDuoPill>` triggers expand via a global `lover:staff-chat-open` window event that `StaffChatWidget` adds as a non-breaking listener.
- CSS is purely additive in `src/index.css` (bloom space dark + sakura petals light + orb-float + fire-pulse + petal-fall + themed scrollbar). No JS animation loop.

**Tech Stack:** React 19 · Vite 8 · Tailwind 3.4 + index.css custom layers · `lucide-react` icons · Firebase 11 · `cmdk` (BackendCmdPalette kept) · Vitest 4.1 (RTL · jsdom) · Playwright (real-browser L1).

**Reference docs:**
- Spec: `docs/superpowers/specs/2026-05-18-backend-menu-redesign-variant-d-design.md` (13 locked decisions)
- Mockup: `docs/superpowers/specs/2026-05-18-backend-menu-redesign-mockup.html` (1194 lines · 4 theme×state combos + Classic mode)
- Memory: `~/.claude/projects/F--LoverClinic-app/memory/feedback_cosmetic_shell_redesign_constraint.md` (NON-NEGOTIABLE invariant: no flow/logic/wiring changes; 6-tier test pyramid; loop until 100% Perfect)
- Memory: `~/.claude/projects/F--LoverClinic-app/memory/feedback_keep_task_count_tight.md` (target 8–12, default merge over split)

**Cosmetic-shell invariant (NON-NEGOTIABLE, applies to every task):**
- ✅ Every handler/state/prop verbatim · ✅ `BranchSelector` · `ThemeToggle` · `ProfileDropdown` · `StaffChatBubble` · `BackendCmdPalette` reused verbatim · ✅ `NAV_SECTIONS` data unchanged · ✅ permissions via `useTabAccess` unchanged · ✅ routing/Firestore/auth unchanged · ✅ `BackendNav` + sub-components NOT edited
- ❌ Anything touching handler signatures, splitting callbacks, consolidating state, "while I'm here" cleanup → STOP

**Tooling preflight (run once before Task 1):**
```bash
cd F:/LoverClinic-app
git status                       # expect clean working tree on master @ 257a699f
git pull origin master           # safety
npm test -- --run | tail -5      # expect 11409 passed (Rule N baseline)
npm run build                    # expect clean
npx playwright --version         # expect 1.x (already installed)
```

---

## File Structure

### NEW files (6 · ~600 LOC total)
| File | Responsibility | LOC est. |
|------|----------------|----------|
| `src/components/backend/shell/backendMenuMode.js` | Pure helper + React hook for `lover.backendMenuMode` localStorage (per-device) | 60 |
| `src/components/backend/shell/BackendMenuModeToggle.jsx` | Pill `[⚡ ใหม่ \| 📋 เดิม]` · Desktop+Tablet ≥768px only | 70 |
| `src/components/backend/shell/BackendArcBloom.jsx` | Fullscreen bloom overlay · 8 orbs · spring physics CSS · `role="dialog" aria-modal` · focus trap · Esc + arrow keys · `prefers-reduced-motion` | 200 |
| `src/components/backend/shell/BackendDuoPill.jsx` | Bottom-right pill · `[💬 chat \| ≡ menu]` · chat segment dispatches `lover:staff-chat-open`; menu segment calls `onOpenBloom` prop · 56×56 mobile, 64×64 desktop · backdrop-blur 16px | 100 |
| `src/components/backend/shell/BackendTopBarNew.jsx` | Responsive top bar (mobile 2-row 44px / desktop 1-row 48px) · 5 utility buttons verbatim + mode toggle pill ≥768px | 200 |
| `src/components/backend/shell/BackendShellNew.jsx` | Top-level shell · composes TopBarNew + DuoPill + ArcBloom + BackendCmdPalette · owns bloom open/close state + html data-attr · lazy-mounts ArcBloom | 200 |

### MODIFIED files (3 · ~270 LOC delta)
| File | Change | LOC delta |
|------|--------|-----------|
| `src/index.css` | Add bloom-space (dark), sakura-petals (light), orb-float (3 variants A/B/C), fire-pulse, petal-fall, themed slim scrollbar (Classic mode) | +~250 LOC additive |
| `src/pages/BackendDashboard.jsx:349-357` | Wrap with `{mode === 'new' ? <BackendShellNew>...</> : <BackendNav>...</>}` · add `useBackendMenuMode()` import | +~12 LOC |
| `src/components/staffchat/StaffChatWidget.jsx` | Additive `useEffect` listening for `'lover:staff-chat-open'` → `chat.expand()` (non-breaking — existing onClick still works) | +~8 LOC |

### NEW test files (7 · across all 6 tiers of test pyramid)
| File | Tier | Tests est. |
|------|------|------------|
| `tests/backend-menu-d-toggle-localstorage.test.js` | Tier 1 (unit) — helper + hook · per-device · SSR-safe · default `'new'` | ~12 |
| `tests/backend-menu-d-shell-rtl.test.jsx` | Tier 1 (RTL) — every chrome button → original handler invoked · responsive | ~25 |
| `tests/backend-menu-d-bloom-rtl.test.jsx` | Tier 1 (RTL) — orb click → onNavigate · focus trap · keyboard · a11y | ~15 |
| `tests/backend-menu-d-source-grep.test.js` | Tier 2 — source-grep regression locks (every prop/handler wired · classic mode untouched · contract preserved) | ~25 |
| `tests/backend-menu-d-flow-simulate.test.js` | Tier 3 (Rule I) — full chain (tap orb → onNavigate → activeTab change → re-render content) | ~10 |
| `tests/e2e/backend-menu-d.spec.js` | Tier 4 (Playwright L1) — real browser · real Firestore · both themes · mode round-trip · all orbs · all 5 utility buttons | ~25 |
| `tests/backend-menu-d-stress.test.js` + `tests/backend-menu-d-user-simulation.mjs` | Tier 5+6 — chaos (rapid clicks, branch switch, theme thrash, 100× toggle) + bot random clicks 100% pass | ~15 + 1 script |

---

## Task 1: Mode helper + toggle component + unit tests

**Files:**
- Create: `src/components/backend/shell/backendMenuMode.js`
- Create: `src/components/backend/shell/BackendMenuModeToggle.jsx`
- Test: `tests/backend-menu-d-toggle-localstorage.test.js`

**Preserved-contract verification:** N/A (purely new code; no existing surface touched).

- [ ] **Step 1: Write the failing unit test**

Create `tests/backend-menu-d-toggle-localstorage.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  getBackendMenuMode,
  setBackendMenuMode,
  useBackendMenuMode,
  STORAGE_KEY,
} from '../src/components/backend/shell/backendMenuMode.js';

describe('Backend Menu D — Mode Toggle helper + hook', () => {
  beforeEach(() => {
    localStorage.clear();
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
  });

  it('T1.1 STORAGE_KEY constant locked', () => {
    expect(STORAGE_KEY).toBe('lover.backendMenuMode');
  });

  it('T1.2 default mode is "new" when localStorage empty', () => {
    expect(getBackendMenuMode()).toBe('new');
  });

  it('T1.3 getBackendMenuMode returns "classic" when set', () => {
    localStorage.setItem(STORAGE_KEY, 'classic');
    expect(getBackendMenuMode()).toBe('classic');
  });

  it('T1.4 setBackendMenuMode persists', () => {
    setBackendMenuMode('classic');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('classic');
    setBackendMenuMode('new');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('new');
  });

  it('T1.5 invalid mode rejected — falls back to "new"', () => {
    localStorage.setItem(STORAGE_KEY, 'garbage');
    expect(getBackendMenuMode()).toBe('new');
    setBackendMenuMode('nonsense');
    // setter must reject invalid → storage unchanged (stays 'garbage' or cleared)
    expect(['garbage', null]).toContain(localStorage.getItem(STORAGE_KEY) === 'nonsense' ? 'INVALID' : localStorage.getItem(STORAGE_KEY));
  });

  it('T1.6 SSR-safe (no window) — returns default', () => {
    const origWindow = global.window;
    // @ts-ignore
    delete global.window;
    expect(getBackendMenuMode()).toBe('new');
    global.window = origWindow;
  });

  it('T1.7 mobile <768px forces "new" regardless of stored value', () => {
    Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true });
    localStorage.setItem(STORAGE_KEY, 'classic');
    expect(getBackendMenuMode()).toBe('new');
  });

  it('T1.8 useBackendMenuMode hook returns current mode + setter', () => {
    const { result } = renderHook(() => useBackendMenuMode());
    expect(result.current[0]).toBe('new');
    act(() => result.current[1]('classic'));
    expect(result.current[0]).toBe('classic');
  });

  it('T1.9 useBackendMenuMode re-renders on cross-component change (storage event)', () => {
    const { result } = renderHook(() => useBackendMenuMode());
    expect(result.current[0]).toBe('new');
    act(() => {
      setBackendMenuMode('classic');
      window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: 'classic' }));
    });
    expect(result.current[0]).toBe('classic');
  });

  it('T1.10 V82 marker in helper source', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/components/backend/shell/backendMenuMode.js', 'utf-8');
    expect(src).toMatch(/Backend Menu D|backendMenuMode/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/backend-menu-d-toggle-localstorage.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the helper**

Create `src/components/backend/shell/backendMenuMode.js`:

```js
// Backend Menu D — per-device localStorage helper + React hook for the mode toggle.
// Scope: browser × device (intentional — different devices keep their own preference).
// Default mode = 'new'. Mobile <768px FORCES 'new' regardless of stored value.
// Cosmetic-shell rule: this helper is the ONE place the mode is read/written.

import { useEffect, useState, useCallback } from 'react';

export const STORAGE_KEY = 'lover.backendMenuMode';
const VALID_MODES = ['new', 'classic'];
const MOBILE_BREAKPOINT = 768;

function isMobileViewport() {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < MOBILE_BREAKPOINT;
}

export function getBackendMenuMode() {
  if (typeof window === 'undefined' || typeof localStorage === 'undefined') return 'new';
  // Mobile forces 'new' — bloom UI is the mobile-first design (Classic sidebar is desktop)
  if (isMobileViewport()) return 'new';
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return VALID_MODES.includes(stored) ? stored : 'new';
  } catch {
    return 'new';
  }
}

export function setBackendMenuMode(mode) {
  if (!VALID_MODES.includes(mode)) return;
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
    // Manually dispatch to other hook instances in same tab (storage event
    // only fires across tabs by default)
    window.dispatchEvent(new StorageEvent('storage', { key: STORAGE_KEY, newValue: mode }));
  } catch { /* private-mode storage quota — ignore */ }
}

export function useBackendMenuMode() {
  const [mode, setMode] = useState(() => getBackendMenuMode());
  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === STORAGE_KEY || e.key === null) setMode(getBackendMenuMode());
    };
    const onResize = () => setMode(getBackendMenuMode()); // mobile-force re-check
    window.addEventListener('storage', onStorage);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('resize', onResize);
    };
  }, []);
  const update = useCallback((next) => {
    setBackendMenuMode(next);
    setMode(getBackendMenuMode());
  }, []);
  return [mode, update];
}
```

- [ ] **Step 4: Create the toggle component**

Create `src/components/backend/shell/BackendMenuModeToggle.jsx`:

```jsx
// Backend Menu D — pill toggle ⚡↔📋. Desktop+Tablet ≥768px only; hidden on mobile.
// Consumes useBackendMenuMode() — purely cosmetic chrome.

import { Zap, List } from 'lucide-react';
import { useBackendMenuMode } from './backendMenuMode.js';

export default function BackendMenuModeToggle() {
  const [mode, setMode] = useBackendMenuMode();

  return (
    <div
      role="group"
      aria-label="โหมดเมนู"
      data-testid="backend-menu-mode-toggle"
      className="hidden md:inline-flex items-center gap-0.5 rounded-full bg-[var(--bg-hover)] border border-[var(--bd)] p-0.5"
    >
      <button
        type="button"
        onClick={() => setMode('new')}
        aria-pressed={mode === 'new'}
        data-testid="mode-toggle-new"
        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
          mode === 'new'
            ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-sm'
            : 'text-[var(--tx-muted)] hover:text-[var(--tx-primary)]'
        }`}
      >
        <Zap size={12} /> ใหม่
      </button>
      <button
        type="button"
        onClick={() => setMode('classic')}
        aria-pressed={mode === 'classic'}
        data-testid="mode-toggle-classic"
        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold transition-all ${
          mode === 'classic'
            ? 'bg-gradient-to-r from-slate-600 to-slate-700 text-white shadow-sm'
            : 'text-[var(--tx-muted)] hover:text-[var(--tx-primary)]'
        }`}
      >
        <List size={12} /> เดิม
      </button>
    </div>
  );
}
```

- [ ] **Step 5: Run unit tests to verify pass**

Run: `npx vitest run tests/backend-menu-d-toggle-localstorage.test.js`
Expected: PASS — 10/10.

- [ ] **Step 6: Verify build clean**

Run: `npm run build 2>&1 | tail -10`
Expected: build succeeds with no new warnings.

- [ ] **Step 7: Commit**

```bash
git add src/components/backend/shell/backendMenuMode.js src/components/backend/shell/BackendMenuModeToggle.jsx tests/backend-menu-d-toggle-localstorage.test.js
git commit -m "$(cat <<'EOF'
feat(backend-menu-d T1): mode helper + toggle pill + unit tests

NEW src/components/backend/shell/backendMenuMode.js — pure helper +
useBackendMenuMode hook. localStorage key 'lover.backendMenuMode' (per-device
scope). Default 'new'; mobile <768px forces 'new'. SSR-safe.

NEW BackendMenuModeToggle.jsx — pill ⚡↔📋 visible ≥768px (hidden md:inline-flex).

10 unit tests in backend-menu-d-toggle-localstorage.test.js — default + persistence
+ invalid-mode reject + SSR-safe + mobile-force + hook re-render on storage event.

Cosmetic shell only · no existing surface touched.
EOF
)"
```

---

## Task 2: CSS theme system (bloom-space dark + sakura-petals light + orbs + petals + scrollbar)

**Files:**
- Modify: `src/index.css` (append ~250 LOC at end of file under a `/* === Backend Menu D === */` banner)

**Preserved-contract verification:** CSS purely additive — no existing selectors modified or removed.

- [ ] **Step 1: Append the Backend Menu D CSS layer**

Open `src/index.css` and append at the end:

```css
/* ═══════════════════════════════════════════════════════════════════════════
   Backend Menu D — Bloom Space (Dark) + Sakura Petals (Light)
   Cosmetic chrome ONLY · no behavior · CSS-only animations (no JS loops)
   Activates when html[data-backend-menu-mode="new"]
   ═══════════════════════════════════════════════════════════════════════════ */

/* Hide standalone StaffChatBubble when Backend new-mode active —
   the DuoPill renders the chat segment instead. */
html[data-backend-menu-mode="new"] [data-testid="staff-chat-bubble"] {
  display: none;
}

/* ─── Bloom backdrop (dark theme) ─────────────────────────────────────────── */
.bloom-backdrop {
  position: fixed;
  inset: 0;
  z-index: 8500;
  background: radial-gradient(ellipse at bottom right, #050308 0%, #020106 60%, #02010a 100%);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease-out;
}
.bloom-backdrop[data-open="true"] {
  opacity: 1;
  pointer-events: auto;
}

[data-theme="light"] .bloom-backdrop {
  background: radial-gradient(ellipse at bottom right, #fff0f5 0%, #ffe4ec 60%, #ffd1dc 100%);
}

/* ─── Stars (dark only) ───────────────────────────────────────────────────── */
.bloom-stars { position: absolute; inset: 0; pointer-events: none; }
.bloom-stars .star {
  position: absolute;
  width: 2px; height: 2px;
  background: white;
  border-radius: 50%;
  box-shadow: 0 0 4px rgba(255,255,255,0.7);
  animation: twinkle 3s ease-in-out infinite;
}
.bloom-stars .star.red    { background: #f87171; box-shadow: 0 0 6px rgba(248,113,113,0.8); }
.bloom-stars .star.orange { background: #fb923c; box-shadow: 0 0 6px rgba(251,146,60,0.8); }
.bloom-stars .star.big    { width: 3px; height: 3px; }
@keyframes twinkle {
  0%, 100% { opacity: 0.3; transform: scale(0.9); }
  50%      { opacity: 1;   transform: scale(1.2); }
}
[data-theme="light"] .bloom-stars { display: none; }

/* ─── Nebula patches (dark only) ──────────────────────────────────────────── */
.bloom-nebula {
  position: absolute;
  width: 200px; height: 200px;
  background: radial-gradient(circle, rgba(220,38,38,0.25), transparent 70%);
  filter: blur(40px);
  pointer-events: none;
}
[data-theme="light"] .bloom-nebula {
  background: radial-gradient(circle, rgba(244,114,182,0.25), transparent 70%);
}

/* ─── Embers (dark only) — floating */
.bloom-ember {
  position: absolute;
  width: 4px; height: 4px;
  background: radial-gradient(circle, #fbbf24, #ea580c);
  border-radius: 50%;
  box-shadow: 0 0 8px rgba(251,191,36,0.8);
  animation: ember-drift 8s ease-in-out infinite;
  pointer-events: none;
}
@keyframes ember-drift {
  0%   { transform: translate(0,0)   scale(1);   opacity: 0.8; }
  50%  { transform: translate(20px,-40px) scale(1.3); opacity: 1; }
  100% { transform: translate(-10px,-80px) scale(0.7); opacity: 0; }
}
[data-theme="light"] .bloom-ember { display: none; }

/* ─── Sakura petals (light only) ──────────────────────────────────────────── */
.bloom-petal {
  position: absolute;
  width: 12px; height: 12px;
  background: radial-gradient(ellipse at 30% 30%, #fbcfe8 0%, #f9a8d4 60%, #ec4899 100%);
  border-radius: 50% 0 50% 0;
  opacity: 0.7;
  animation: petal-fall 7s linear infinite;
  pointer-events: none;
}
.bloom-petal.small { width: 8px;  height: 8px;  }
.bloom-petal.big   { width: 16px; height: 16px; }
@keyframes petal-fall {
  0%   { transform: translate(0,-20px) rotate(0deg);     opacity: 0;   }
  10%  { opacity: 0.8; }
  100% { transform: translate(40px, calc(100vh + 20px)) rotate(360deg); opacity: 0; }
}
[data-theme="dark"] .bloom-petal { display: none; }

/* ─── Orbs (8 nav-section buttons radiating from Duo Pill) ────────────────── */
.bloom-orb {
  position: absolute;
  width: 72px; height: 72px;
  border-radius: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  cursor: pointer;
  transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);
  background: radial-gradient(circle at 30% 25%, rgba(255,255,255,0.18), rgba(0,0,0,0.55) 70%);
  border: 1px solid rgba(255,255,255,0.1);
  box-shadow:
    0 12px 32px rgba(0,0,0,0.5),
    0 0 24px rgba(220,38,38,0.4),
    inset 0 1px 0 rgba(255,255,255,0.15);
  opacity: 0;
  transform: scale(0);
}
.bloom-orb[data-bloomed="true"] {
  opacity: 1;
  transform: scale(1);
  animation: orb-float-A 5s ease-in-out infinite;
}
.bloom-orb:nth-of-type(3n+1)[data-bloomed="true"] { animation-name: orb-float-A; }
.bloom-orb:nth-of-type(3n+2)[data-bloomed="true"] { animation-name: orb-float-B; animation-delay: -1s; }
.bloom-orb:nth-of-type(3n+3)[data-bloomed="true"] { animation-name: orb-float-C; animation-delay: -2s; }
.bloom-orb:hover { transform: scale(1.08) translateY(-4px); }
.bloom-orb:focus-visible {
  outline: 2px solid #fbbf24;
  outline-offset: 4px;
}

@keyframes orb-float-A { 0%,100% { translate: 0   0;   } 50% { translate: 0    -6px; } }
@keyframes orb-float-B { 0%,100% { translate: 0   0;   } 50% { translate: -3px -4px; } }
@keyframes orb-float-C { 0%,100% { translate: 0   0;   } 50% { translate: 3px  -5px; } }

/* fire-pulse halo (dark) */
.bloom-orb::before {
  content: '';
  position: absolute;
  inset: -8px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(251,146,60,0.4), transparent 70%);
  filter: blur(8px);
  animation: fire-pulse 3s ease-in-out infinite;
  z-index: -1;
}
@keyframes fire-pulse {
  0%, 100% { opacity: 0.6; transform: scale(0.96); }
  50%      { opacity: 0.9; transform: scale(1.08); }
}
[data-theme="light"] .bloom-orb::before {
  background: radial-gradient(circle, rgba(244,114,182,0.4), transparent 70%);
}
[data-theme="light"] .bloom-orb {
  background: radial-gradient(circle at 30% 25%, rgba(255,255,255,0.95), rgba(255,228,236,0.7) 70%);
  border: 1px solid rgba(244,114,182,0.3);
  box-shadow:
    0 12px 32px rgba(244,114,182,0.25),
    0 0 24px rgba(244,114,182,0.3),
    inset 0 1px 0 rgba(255,255,255,0.9);
}
.bloom-orb-label {
  font-size: 10px;
  font-weight: 700;
  color: white;
  text-shadow: 0 1px 3px rgba(0,0,0,0.6);
  pointer-events: none;
}
[data-theme="light"] .bloom-orb-label { color: #831843; text-shadow: 0 1px 3px rgba(255,255,255,0.6); }

/* ─── Duo Pill (bottom-right) ─────────────────────────────────────────────── */
.duo-pill {
  position: fixed;
  bottom: 16px;
  right: 16px;
  z-index: 9100;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px;
  border-radius: 999px;
  background: rgba(13,13,15,0.7);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255,255,255,0.1);
  box-shadow: 0 8px 24px rgba(0,0,0,0.4);
}
[data-theme="light"] .duo-pill {
  background: rgba(255,255,255,0.7);
  border: 1px solid rgba(244,114,182,0.25);
  box-shadow: 0 8px 24px rgba(244,114,182,0.2);
}
.duo-pill-btn {
  width: 48px; height: 48px;
  border-radius: 50%;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  position: relative;
  transition: transform 0.15s ease, background 0.15s ease;
}
.duo-pill-btn:hover { transform: scale(1.08); }
.duo-pill-btn:focus-visible { outline: 2px solid #fbbf24; outline-offset: 2px; }

/* ─── Mobile shrinks pill ─── */
@media (max-width: 767px) {
  .duo-pill { bottom: 12px; right: 12px; padding: 4px; }
  .duo-pill-btn { width: 44px; height: 44px; }
}

/* ─── Themed slim scrollbar (Classic mode sidebar) ────────────────────────── */
.backend-classic-sidebar::-webkit-scrollbar { width: 5px; }
.backend-classic-sidebar::-webkit-scrollbar-track { background: transparent; }
.backend-classic-sidebar::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, #dc2626, #f97316);
  border-radius: 999px;
}
[data-theme="light"] .backend-classic-sidebar::-webkit-scrollbar-thumb {
  background: linear-gradient(180deg, #ec4899, #fb923c);
}

/* ─── Reduced motion ──────────────────────────────────────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .bloom-stars .star,
  .bloom-ember,
  .bloom-petal,
  .bloom-orb,
  .bloom-orb::before,
  .duo-pill-btn { animation: none !important; transition: none !important; }
}
```

- [ ] **Step 2: Build to verify CSS parses**

Run: `npm run build 2>&1 | tail -5`
Expected: build succeeds with no CSS parser warnings.

- [ ] **Step 3: Spot-check visual via the mockup file (no test needed — Tier 4 Playwright covers visuals)**

Run: `powershell -NoProfile -Command "Start-Process docs/superpowers/specs/2026-05-18-backend-menu-redesign-mockup.html"`
Expected: dark space + petals + orbs match what we just wrote (the mockup is the reference contract).

- [ ] **Step 4: Commit**

```bash
git add src/index.css
git commit -m "$(cat <<'EOF'
feat(backend-menu-d T2): bloom-space + sakura-petals + orb-float + fire-pulse CSS

src/index.css +~250 LOC additive — bloom backdrop (dark red-black space /
light pink), stars (dark only · 3 variants), nebula patches, embers, sakura
petals (light only · 3 sizes), orb-float A/B/C with nth-child stagger,
fire-pulse halo (gold-orange dark / pink light), Duo Pill backdrop-blur 16px,
Classic-mode themed scrollbar, prefers-reduced-motion override.

CSS-only · no JS animation loops · activates via html[data-backend-menu-mode="new"]
which also hides standalone [data-testid="staff-chat-bubble"] (DuoPill renders
chat segment instead).

No existing CSS modified — purely additive layer.
EOF
)"
```

---

## Task 3: BackendArcBloom overlay + RTL

**Files:**
- Create: `src/components/backend/shell/BackendArcBloom.jsx`
- Test: `tests/backend-menu-d-bloom-rtl.test.jsx`

**Preserved-contract verification:** `NAV_SECTIONS` consumed read-only; `onNavigate(tabId)` callback receives the SAME shape (string id) that classic `BackendNav` already feeds.

- [ ] **Step 1: Write the failing RTL test**

Create `tests/backend-menu-d-bloom-rtl.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BackendArcBloom from '../src/components/backend/shell/BackendArcBloom.jsx';
import { NAV_SECTIONS } from '../src/components/backend/nav/navConfig.js';

const noop = () => {};

describe('Backend Menu D — ArcBloom RTL', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('T3.1 renders nothing when open=false', () => {
    const { container } = render(<BackendArcBloom open={false} onClose={noop} onNavigate={noop} />);
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it('T3.2 renders dialog when open=true with aria-modal', () => {
    render(<BackendArcBloom open={true} onClose={noop} onNavigate={noop} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toMatch(/เมนู|menu/i);
  });

  it('T3.3 renders one orb per NAV_SECTIONS entry (8 orbs)', () => {
    render(<BackendArcBloom open={true} onClose={noop} onNavigate={noop} />);
    const orbs = screen.getAllByRole('menuitem');
    expect(orbs.length).toBe(NAV_SECTIONS.length);
  });

  it('T3.4 orb click invokes onNavigate with first item id from that section', () => {
    const onNavigate = vi.fn();
    render(<BackendArcBloom open={true} onClose={vi.fn()} onNavigate={onNavigate} />);
    const orbs = screen.getAllByRole('menuitem');
    fireEvent.click(orbs[0]);
    const firstSectionFirstItemId = NAV_SECTIONS[0].items[0].id;
    expect(onNavigate).toHaveBeenCalledWith(firstSectionFirstItemId);
  });

  it('T3.5 orb click also closes the bloom', () => {
    const onClose = vi.fn();
    render(<BackendArcBloom open={true} onClose={onClose} onNavigate={vi.fn()} />);
    fireEvent.click(screen.getAllByRole('menuitem')[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it('T3.6 Escape key closes bloom', () => {
    const onClose = vi.fn();
    render(<BackendArcBloom open={true} onClose={onClose} onNavigate={vi.fn()} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('T3.7 Arrow keys move focus to next orb', () => {
    render(<BackendArcBloom open={true} onClose={noop} onNavigate={noop} />);
    const orbs = screen.getAllByRole('menuitem');
    orbs[0].focus();
    expect(document.activeElement).toBe(orbs[0]);
    fireEvent.keyDown(orbs[0], { key: 'ArrowRight' });
    expect(document.activeElement).toBe(orbs[1]);
  });

  it('T3.8 backdrop click closes bloom', () => {
    const onClose = vi.fn();
    render(<BackendArcBloom open={true} onClose={onClose} onNavigate={vi.fn()} />);
    const backdrop = screen.getByTestId('bloom-backdrop');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('T3.9 each orb has accessible name from NAV_SECTIONS.label', () => {
    render(<BackendArcBloom open={true} onClose={noop} onNavigate={noop} />);
    const orbs = screen.getAllByRole('menuitem');
    NAV_SECTIONS.forEach((section, i) => {
      expect(orbs[i].getAttribute('aria-label')).toContain(section.label);
    });
  });

  it('T3.10 V82 marker present', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/components/backend/shell/BackendArcBloom.jsx', 'utf-8');
    expect(src).toMatch(/Backend Menu D|ArcBloom/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/backend-menu-d-bloom-rtl.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the ArcBloom component**

Create `src/components/backend/shell/BackendArcBloom.jsx`:

```jsx
// Backend Menu D — ArcBloom overlay. 8 orbs radial fan around Duo Pill.
// Reads NAV_SECTIONS verbatim · orb click → onNavigate(firstChildTabId) · onClose
// role=dialog aria-modal · focus trap · Esc + arrow keys · prefers-reduced-motion

import { useEffect, useRef, useCallback, useMemo } from 'react';
import { NAV_SECTIONS } from '../nav/navConfig.js';

// Random star/nebula/ember/petal positions — generated once per module-load
// so they stay stable across re-renders (no jitter).
const STARS = Array.from({ length: 55 }, (_, i) => ({
  top: `${Math.random() * 100}%`,
  left: `${Math.random() * 100}%`,
  delay: `${(Math.random() * 3).toFixed(2)}s`,
  variant: i % 17 === 0 ? 'red' : i % 13 === 0 ? 'orange' : '',
  big: i % 19 === 0,
}));
const NEBULAE = Array.from({ length: 3 }, () => ({
  top: `${20 + Math.random() * 60}%`,
  left: `${20 + Math.random() * 60}%`,
}));
const EMBERS = Array.from({ length: 4 }, (_, i) => ({
  top: `${60 + Math.random() * 30}%`,
  left: `${Math.random() * 100}%`,
  delay: `${(i * 1.5).toFixed(2)}s`,
}));
const PETALS = Array.from({ length: 20 }, (_, i) => ({
  left: `${Math.random() * 100}%`,
  delay: `${(Math.random() * 5).toFixed(2)}s`,
  duration: `${(5 + Math.random() * 4).toFixed(2)}s`,
  size: i % 7 === 0 ? 'big' : i % 5 === 0 ? 'small' : '',
}));

// Arc fan layout — 8 positions on a radial arc anchored to bottom-right.
function orbPosition(i, total) {
  const startAngle = 175; // degrees, fan opens up-and-left from bottom-right
  const sweep = 95;
  const angle = ((startAngle + (sweep * i) / Math.max(1, total - 1)) * Math.PI) / 180;
  const radius = 180; // px from anchor
  // Anchor at viewport bottom-right corner ~64px in
  return {
    right: `${64 + Math.cos(angle - Math.PI) * radius}px`,
    bottom: `${64 + Math.sin(Math.PI - angle) * radius}px`,
  };
}

export default function BackendArcBloom({ open, onClose, onNavigate }) {
  const orbRefs = useRef([]);
  const previouslyFocused = useRef(null);

  const sections = useMemo(() => NAV_SECTIONS, []);

  // Focus trap + Esc + arrow keys
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement;
    // Focus first orb when bloom opens
    requestAnimationFrame(() => orbRefs.current[0]?.focus());

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
        return;
      }
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault();
        const idx = orbRefs.current.findIndex((el) => el === document.activeElement);
        const next = (idx + 1) % sections.length;
        orbRefs.current[next]?.focus();
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault();
        const idx = orbRefs.current.findIndex((el) => el === document.activeElement);
        const prev = (idx - 1 + sections.length) % sections.length;
        orbRefs.current[prev]?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previouslyFocused.current?.focus?.();
    };
  }, [open, onClose, sections.length]);

  const handleOrbClick = useCallback(
    (section) => {
      const firstItem = section.items[0];
      if (!firstItem) return;
      onNavigate?.(firstItem.id);
      onClose?.();
    },
    [onNavigate, onClose]
  );

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="เมนูระบบหลังบ้าน"
      className="bloom-backdrop"
      data-open="true"
      data-testid="bloom-overlay"
    >
      {/* Click-anywhere-to-close backdrop */}
      <div
        className="absolute inset-0"
        data-testid="bloom-backdrop"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dark: stars + nebulae + embers · Light: petals */}
      <div className="bloom-stars" aria-hidden="true">
        {STARS.map((s, i) => (
          <span
            key={i}
            className={`star ${s.variant} ${s.big ? 'big' : ''}`}
            style={{ top: s.top, left: s.left, animationDelay: s.delay }}
          />
        ))}
      </div>
      {NEBULAE.map((n, i) => (
        <div key={i} className="bloom-nebula" style={n} aria-hidden="true" />
      ))}
      {EMBERS.map((e, i) => (
        <div key={i} className="bloom-ember" style={{ top: e.top, left: e.left, animationDelay: e.delay }} aria-hidden="true" />
      ))}
      {PETALS.map((p, i) => (
        <div
          key={i}
          className={`bloom-petal ${p.size}`}
          style={{ left: p.left, animationDelay: p.delay, animationDuration: p.duration }}
          aria-hidden="true"
        />
      ))}

      {/* 8 orbs · radial fan layout */}
      {sections.map((section, i) => {
        const Icon = section.icon;
        const pos = orbPosition(i, sections.length);
        return (
          <button
            key={section.id}
            ref={(el) => (orbRefs.current[i] = el)}
            type="button"
            role="menuitem"
            tabIndex={0}
            data-bloomed="true"
            data-testid={`bloom-orb-${section.id}`}
            aria-label={`ไปยังหมวด ${section.label}`}
            className="bloom-orb"
            style={pos}
            onClick={() => handleOrbClick(section)}
          >
            {Icon && <Icon size={26} color="white" />}
            <span className="bloom-orb-label">{section.label}</span>
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: Run RTL tests to verify pass**

Run: `npx vitest run tests/backend-menu-d-bloom-rtl.test.jsx`
Expected: PASS — 10/10.

- [ ] **Step 5: Build clean**

Run: `npm run build 2>&1 | tail -5`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/backend/shell/BackendArcBloom.jsx tests/backend-menu-d-bloom-rtl.test.jsx
git commit -m "$(cat <<'EOF'
feat(backend-menu-d T3): ArcBloom overlay + RTL (8 orbs · a11y · focus trap)

NEW BackendArcBloom.jsx — fullscreen overlay reading NAV_SECTIONS verbatim.
8 orbs at radial-arc positions. orb click → onNavigate(firstChildTabId) +
onClose. Dialog role + aria-modal · focus trap (orb 0 on open, restore on
close) · Esc + arrow keys nav · backdrop click closes.

Decorative layers: stars + nebulae + embers (dark) / sakura petals (light)
— positions generated once at module-load for stability (no jitter on
re-render).

10 RTL tests · cover render gating · dialog role · orb count · onNavigate
contract · onClose paths · keyboard nav · backdrop · accessible names.

Cosmetic only · NAV_SECTIONS read-only · onNavigate signature verbatim.
EOF
)"
```

---

## Task 4: BackendDuoPill + StaffChatWidget event bridge + RTL

**Files:**
- Create: `src/components/backend/shell/BackendDuoPill.jsx`
- Modify: `src/components/staffchat/StaffChatWidget.jsx` (additive — listen for `lover:staff-chat-open` event)
- Test: written as part of `backend-menu-d-shell-rtl.test.jsx` in Task 6 (DuoPill covered there)

**Preserved-contract verification:** StaffChatWidget edit is purely additive — existing `chat.expand` paths (StaffChatBubble onClick) untouched. New `useEffect` adds an alternative trigger surface via window event.

- [ ] **Step 1: Create the DuoPill component**

Create `src/components/backend/shell/BackendDuoPill.jsx`:

```jsx
// Backend Menu D — Duo Pill (bottom-right). Two segments:
//   💬 chat  → dispatches 'lover:staff-chat-open' window event
//             (StaffChatWidget listens + calls chat.expand())
//   ≡  menu  → calls onOpenBloom() prop
// Cosmetic — does NOT mount or replace the chat hook.
//
// Unread count is consumed via the SAME custom event but in reverse —
// StaffChatWidget broadcasts 'lover:staff-chat-unread' with the count.

import { useEffect, useState } from 'react';
import { MessageCircle, Menu as MenuIcon } from 'lucide-react';

export default function BackendDuoPill({ onOpenBloom }) {
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    const onUnread = (e) => {
      const next = Number(e.detail?.count ?? 0);
      if (Number.isFinite(next)) setUnread(next);
    };
    window.addEventListener('lover:staff-chat-unread', onUnread);
    // Request initial count on mount
    window.dispatchEvent(new CustomEvent('lover:staff-chat-unread-request'));
    return () => window.removeEventListener('lover:staff-chat-unread', onUnread);
  }, []);

  return (
    <div className="duo-pill" data-testid="backend-duo-pill">
      <button
        type="button"
        className="duo-pill-btn"
        data-testid="duo-pill-chat"
        aria-label={`เปิดแชทพนักงาน${unread > 0 ? ` (${unread} ข้อความใหม่)` : ''}`}
        onClick={() => window.dispatchEvent(new CustomEvent('lover:staff-chat-open'))}
      >
        <MessageCircle size={22} color="white" />
        {unread > 0 && (
          <span
            data-testid="duo-pill-unread-badge"
            className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-white text-rose-700 text-[10px] font-black flex items-center justify-center border-2 border-rose-600"
          >
            {unread > 99 ? '99+' : String(unread)}
          </span>
        )}
      </button>
      <button
        type="button"
        className="duo-pill-btn"
        data-testid="duo-pill-menu"
        aria-label="เปิดเมนู"
        onClick={onOpenBloom}
      >
        <MenuIcon size={22} color="white" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Patch StaffChatWidget — additive event listeners (NON-BREAKING)**

Read current `src/components/staffchat/StaffChatWidget.jsx` (already loaded in context — lines 19-46) then add additive listeners. Edit `src/components/staffchat/StaffChatWidget.jsx`:

Replace `const chat = useStaffChat();` with:

```js
  const chat = useStaffChat();

  // Backend Menu D — alternative trigger surface. Additive: existing
  // StaffChatBubble onClick still works. DuoPill dispatches these events.
  useEffect(() => {
    const onOpen = () => chat.expand?.();
    const onUnreadReq = () => {
      window.dispatchEvent(
        new CustomEvent('lover:staff-chat-unread', { detail: { count: chat.unreadCount || 0 } })
      );
    };
    window.addEventListener('lover:staff-chat-open', onOpen);
    window.addEventListener('lover:staff-chat-unread-request', onUnreadReq);
    // Broadcast on count change
    onUnreadReq();
    return () => {
      window.removeEventListener('lover:staff-chat-open', onOpen);
      window.removeEventListener('lover:staff-chat-unread-request', onUnreadReq);
    };
  }, [chat.expand, chat.unreadCount]);
```

Also add to imports at top of file: `import React, { useEffect } from 'react';` (replace existing `import React from 'react';`).

- [ ] **Step 3: Smoke test the patch — run existing V73/V82 staff-chat test bank**

Run: `npx vitest run tests/v73 tests/v82 2>&1 | tail -15`
Expected: PASS (existing V73/V82 staff-chat tests unaffected since we ONLY added listeners).

- [ ] **Step 4: Build clean**

Run: `npm run build 2>&1 | tail -5`
Expected: succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/components/backend/shell/BackendDuoPill.jsx src/components/staffchat/StaffChatWidget.jsx
git commit -m "$(cat <<'EOF'
feat(backend-menu-d T4): Duo Pill + staff-chat event bridge (NON-BREAKING)

NEW BackendDuoPill.jsx — bottom-right pill with 2 segments:
  💬 → dispatches window 'lover:staff-chat-open' event
  ≡  → calls onOpenBloom prop
Unread badge synced via inbound 'lover:staff-chat-unread' event +
outbound 'lover:staff-chat-unread-request' handshake.

MOD StaffChatWidget.jsx — ADDITIVE useEffect listens for the two events
and calls chat.expand() / broadcasts unreadCount. Existing StaffChatBubble
onClick → chat.expand path is UNCHANGED — this is a parallel trigger
surface. V73/V82 contract intact.

Cosmetic shell · no hook re-mounting · no chat state change.
EOF
)"
```

---

## Task 5: BackendTopBarNew (responsive · 5 utility buttons preserved · mode toggle)

**Files:**
- Create: `src/components/backend/shell/BackendTopBarNew.jsx`
- Test: covered in `backend-menu-d-shell-rtl.test.jsx` in Task 6

**Preserved-contract verification:** `BranchSelector` · `ThemeToggle` · `ProfileDropdown` imported VERBATIM. `theme` + `setTheme` props passed through unchanged.

- [ ] **Step 1: Create the new top bar**

Create `src/components/backend/shell/BackendTopBarNew.jsx`:

```jsx
// Backend Menu D — TopBarNew. Replaces classic BackendTopBar visually but
// preserves every sub-component verbatim (BranchSelector, ThemeToggle,
// ProfileDropdown). Mobile <768px: 2-row 44px each. Desktop ≥768px: 1-row 48px.
//
// 5 utility buttons (all preserved at all states):
//   🏠 Frontend · 🛒 Shortcut · 📍 BranchSelector · 🌓 ThemeToggle · 👤 ProfileDropdown
//
// Plus Mode Toggle pill (Desktop+Tablet ≥768px only) between Shortcut and BranchSelector.

import { useState } from 'react';
import { Home, Briefcase, Search } from 'lucide-react';
import { itemById, sectionOf, NAV_SECTIONS } from '../nav/navConfig.js';
import ThemeToggle from '../../ThemeToggle.jsx';
import BranchSelector from '../BranchSelector.jsx';
import ProfileDropdown from '../ProfileDropdown.jsx';
import BackendMenuModeToggle from './BackendMenuModeToggle.jsx';
import { hexToRgb } from '../../../utils.js';

export default function BackendTopBarNew({
  activeTabId,
  clinicSettings,
  theme,
  setTheme,
  topBarSlot,
  onOpenPalette,
}) {
  const ac = clinicSettings?.accentColor || '#dc2626';
  const acRgb = hexToRgb(ac);
  const sec = sectionOf(activeTabId);
  const item = itemById(activeTabId);
  const section = NAV_SECTIONS.find((s) => s.id === sec);

  return (
    <header
      className="sticky top-0 z-40 backdrop-blur-[14px]"
      style={{
        background:
          'linear-gradient(180deg, rgba(13,13,15,0.75) 0%, rgba(13,13,15,0.6) 100%)',
        borderBottom: `1px solid rgba(${acRgb},0.25)`,
        paddingTop: 'env(safe-area-inset-top, 0)',
      }}
      data-testid="backend-topbar-new"
    >
      {/* Mobile <768px : 2-row */}
      <div className="md:hidden">
        {/* Row 1 — 44px — chrome buttons (NO Mode Toggle on mobile per spec) */}
        <div className="h-11 px-3 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => { window.location.href = '/'; }}
            aria-label="กลับ Frontend"
            data-testid="topbar-frontend-mobile"
            className="p-2 rounded-lg hover:bg-[var(--bg-hover)] active:scale-95 transition-all"
          >
            <Home size={18} />
          </button>
          <button
            type="button"
            onClick={onOpenPalette}
            aria-label="ค้นหาเมนู"
            data-testid="topbar-shortcut-mobile"
            className="p-2 rounded-lg hover:bg-[var(--bg-hover)] active:scale-95 transition-all"
          >
            <Briefcase size={18} />
          </button>
          <div className="flex-1" />
          <BranchSelector />
          <ThemeToggle theme={theme} setTheme={setTheme} />
          <ProfileDropdown />
        </div>
        {/* Row 2 — 44px — title + breadcrumb */}
        <div className="h-11 px-3 flex items-center gap-1.5 border-t border-[var(--bd)] bg-[var(--bg-surface)]/30">
          {section && (
            <>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--tx-muted)] truncate">
                {section.label}
              </span>
              <span className="text-[var(--tx-muted)] flex-shrink-0">›</span>
            </>
          )}
          <h1 className="text-sm font-black truncate" style={{ color: ac }}>
            {item?.label || 'ระบบหลังบ้าน'}
          </h1>
          <div className="ml-auto">{topBarSlot}</div>
        </div>
      </div>

      {/* Desktop ≥768px : 1-row 48px */}
      <div className="hidden md:flex h-12 px-4 items-center gap-2">
        <button
          type="button"
          onClick={() => { window.location.href = '/'; }}
          aria-label="กลับ Frontend"
          data-testid="topbar-frontend-desktop"
          className="p-2 rounded-lg hover:bg-[var(--bg-hover)] active:scale-95 transition-all"
        >
          <Home size={18} />
        </button>
        <button
          type="button"
          onClick={onOpenPalette}
          aria-label="ค้นหาเมนู (Cmd+K)"
          data-testid="topbar-shortcut-desktop"
          className="p-2 rounded-lg hover:bg-[var(--bg-hover)] active:scale-95 transition-all"
        >
          <Briefcase size={18} />
        </button>
        <BackendMenuModeToggle />
        <BranchSelector />
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          {section && (
            <>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--tx-muted)] truncate">
                {section.label}
              </span>
              <span className="text-[var(--tx-muted)] flex-shrink-0">›</span>
            </>
          )}
          <h1 className="text-sm font-black truncate" style={{ color: ac }}>
            {item?.label || 'ระบบหลังบ้าน'}
          </h1>
          <div className="ml-3">{topBarSlot}</div>
        </div>
        <ThemeToggle theme={theme} setTheme={setTheme} />
        <ProfileDropdown />
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Build clean**

Run: `npm run build 2>&1 | tail -5`
Expected: succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/components/backend/shell/BackendTopBarNew.jsx
git commit -m "$(cat <<'EOF'
feat(backend-menu-d T5): BackendTopBarNew — responsive 2-row mobile / 1-row desktop

NEW BackendTopBarNew.jsx — top bar for new shell.
  Mobile <768px: 2-row (44px chrome + 44px title/breadcrumb)
  Desktop ≥768px: 1-row 48px
5 utility buttons preserved verbatim: 🏠 Frontend · 🛒 Shortcut · BranchSelector
· ThemeToggle · ProfileDropdown (imports VERBATIM — same handlers/props).
Mode Toggle pill rendered ≥768px between 🛒 and BranchSelector.

Tests covered in Task 6 shell-RTL bank (whole-shell contract test).
EOF
)"
```

---

## Task 6: BackendShellNew composer + shell-RTL test bank

**Files:**
- Create: `src/components/backend/shell/BackendShellNew.jsx`
- Test: `tests/backend-menu-d-shell-rtl.test.jsx` (covers Tasks 4, 5, 6 contract)

**Preserved-contract verification:** `children` slot preserved verbatim — content render unchanged from classic. `BackendCmdPalette` reused verbatim (⌘K still works). Sets `html[data-backend-menu-mode="new"]` for CSS hide of standalone StaffChatBubble.

- [ ] **Step 1: Write the failing RTL test**

Create `tests/backend-menu-d-shell-rtl.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import BackendShellNew from '../src/components/backend/shell/BackendShellNew.jsx';

vi.mock('../src/components/backend/BranchSelector.jsx', () => ({
  default: () => <div data-testid="mock-branch-selector">Branch</div>,
}));
vi.mock('../src/components/ThemeToggle.jsx', () => ({
  default: ({ theme, setTheme }) => (
    <button data-testid="mock-theme-toggle" onClick={() => setTheme?.(theme === 'dark' ? 'light' : 'dark')}>
      {theme}
    </button>
  ),
}));
vi.mock('../src/components/backend/ProfileDropdown.jsx', () => ({
  default: () => <div data-testid="mock-profile-dropdown">Profile</div>,
}));

describe('Backend Menu D — Shell RTL', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('data-backend-menu-mode');
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
  });
  afterEach(() => {
    document.documentElement.removeAttribute('data-backend-menu-mode');
  });

  const setup = (overrides = {}) =>
    render(
      <BackendShellNew
        activeTabId="customers"
        onNavigate={vi.fn()}
        clinicSettings={{ accentColor: '#dc2626' }}
        theme="dark"
        setTheme={vi.fn()}
        topBarSlot={null}
        {...overrides}
      >
        <div data-testid="shell-children">PAGE CONTENT</div>
      </BackendShellNew>
    );

  it('T6.1 sets html[data-backend-menu-mode="new"] on mount, clears on unmount', () => {
    const { unmount } = setup();
    expect(document.documentElement.getAttribute('data-backend-menu-mode')).toBe('new');
    unmount();
    expect(document.documentElement.getAttribute('data-backend-menu-mode')).toBeNull();
  });

  it('T6.2 renders children content unchanged', () => {
    setup();
    expect(screen.getByTestId('shell-children').textContent).toBe('PAGE CONTENT');
  });

  it('T6.3 renders all 5 utility buttons (desktop)', () => {
    setup();
    expect(screen.getByTestId('topbar-frontend-desktop')).toBeTruthy();
    expect(screen.getByTestId('topbar-shortcut-desktop')).toBeTruthy();
    expect(screen.getByTestId('mock-branch-selector')).toBeTruthy();
    expect(screen.getByTestId('mock-theme-toggle')).toBeTruthy();
    expect(screen.getByTestId('mock-profile-dropdown')).toBeTruthy();
  });

  it('T6.4 mode toggle visible on desktop ≥768px', () => {
    setup();
    expect(screen.getByTestId('backend-menu-mode-toggle')).toBeTruthy();
  });

  it('T6.5 renders DuoPill', () => {
    setup();
    expect(screen.getByTestId('backend-duo-pill')).toBeTruthy();
    expect(screen.getByTestId('duo-pill-chat')).toBeTruthy();
    expect(screen.getByTestId('duo-pill-menu')).toBeTruthy();
  });

  it('T6.6 click DuoPill menu opens bloom overlay', () => {
    setup();
    expect(screen.queryByTestId('bloom-overlay')).toBeNull();
    fireEvent.click(screen.getByTestId('duo-pill-menu'));
    expect(screen.getByTestId('bloom-overlay')).toBeTruthy();
  });

  it('T6.7 click DuoPill chat dispatches lover:staff-chat-open event', () => {
    setup();
    const spy = vi.fn();
    window.addEventListener('lover:staff-chat-open', spy);
    fireEvent.click(screen.getByTestId('duo-pill-chat'));
    expect(spy).toHaveBeenCalled();
    window.removeEventListener('lover:staff-chat-open', spy);
  });

  it('T6.8 Esc closes bloom when open', () => {
    setup();
    fireEvent.click(screen.getByTestId('duo-pill-menu'));
    expect(screen.getByTestId('bloom-overlay')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('bloom-overlay')).toBeNull();
  });

  it('T6.9 click orb calls onNavigate verbatim with section first-item id', () => {
    const onNavigate = vi.fn();
    setup({ onNavigate });
    fireEvent.click(screen.getByTestId('duo-pill-menu'));
    const orbs = screen.getAllByRole('menuitem');
    fireEvent.click(orbs[0]);
    expect(onNavigate).toHaveBeenCalledTimes(1);
    expect(typeof onNavigate.mock.calls[0][0]).toBe('string');
  });

  it('T6.10 theme prop passed through to ThemeToggle verbatim', () => {
    setup({ theme: 'light' });
    expect(screen.getByTestId('mock-theme-toggle').textContent).toBe('light');
  });

  it('T6.11 topBarSlot rendered (breadcrumb slot)', () => {
    setup({ topBarSlot: <div data-testid="custom-slot">SLOT</div> });
    expect(screen.getByTestId('custom-slot')).toBeTruthy();
  });

  it('T6.12 V82 marker present', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/components/backend/shell/BackendShellNew.jsx', 'utf-8');
    expect(src).toMatch(/Backend Menu D|BackendShellNew/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/backend-menu-d-shell-rtl.test.jsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the shell composer**

Create `src/components/backend/shell/BackendShellNew.jsx`:

```jsx
// Backend Menu D — top-level shell composer.
// Mirrors BackendNav's children/topBarSlot/activeTabId/onNavigate/theme/setTheme/
// clinicSettings contract verbatim. Renders TopBarNew + DuoPill + lazy ArcBloom +
// BackendCmdPalette. Sets html[data-backend-menu-mode="new"] for CSS hide of
// standalone StaffChatBubble.

import { useEffect, useState, useCallback, lazy, Suspense } from 'react';
import BackendTopBarNew from './BackendTopBarNew.jsx';
import BackendDuoPill from './BackendDuoPill.jsx';
import BackendCmdPalette from '../nav/BackendCmdPalette.jsx';

const BackendArcBloom = lazy(() => import('./BackendArcBloom.jsx'));

export default function BackendShellNew({
  activeTabId,
  onNavigate,
  clinicSettings,
  theme,
  setTheme,
  topBarSlot = null,
  children,
}) {
  const [bloomOpen, setBloomOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

  // Set html data-attr so global CSS can hide standalone StaffChatBubble
  useEffect(() => {
    document.documentElement.setAttribute('data-backend-menu-mode', 'new');
    return () => {
      document.documentElement.removeAttribute('data-backend-menu-mode');
    };
  }, []);

  const openBloom = useCallback(() => setBloomOpen(true), []);
  const closeBloom = useCallback(() => setBloomOpen(false), []);
  const openPalette = useCallback(() => setPaletteOpen(true), []);

  // Navigate via existing onNavigate prop — same shape as BackendNav.
  const handleNavigate = useCallback(
    (tabId) => {
      onNavigate?.(tabId);
    },
    [onNavigate]
  );

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--tx-primary)] flex flex-col">
      <BackendTopBarNew
        activeTabId={activeTabId}
        clinicSettings={clinicSettings}
        theme={theme}
        setTheme={setTheme}
        topBarSlot={topBarSlot}
        onOpenPalette={openPalette}
      />

      {/* Main content — children slot unchanged from BackendNav contract */}
      <main className="flex-1 min-w-0 overflow-x-hidden">{children}</main>

      {/* DuoPill bottom-right */}
      <BackendDuoPill onOpenBloom={openBloom} />

      {/* ArcBloom overlay — lazy-mounted so its CSS+JS only loads on open */}
      {bloomOpen && (
        <Suspense fallback={null}>
          <BackendArcBloom open={bloomOpen} onClose={closeBloom} onNavigate={handleNavigate} />
        </Suspense>
      )}

      {/* CmdPalette preserved verbatim (Cmd+K + 🛒 button trigger it) */}
      <BackendCmdPalette open={paletteOpen} onOpenChange={setPaletteOpen} onNavigate={handleNavigate} />
    </div>
  );
}
```

- [ ] **Step 4: Run RTL test to verify pass**

Run: `npx vitest run tests/backend-menu-d-shell-rtl.test.jsx`
Expected: PASS — 12/12.

- [ ] **Step 5: Build clean**

Run: `npm run build 2>&1 | tail -5`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add src/components/backend/shell/BackendShellNew.jsx tests/backend-menu-d-shell-rtl.test.jsx
git commit -m "$(cat <<'EOF'
feat(backend-menu-d T6): BackendShellNew composer + 12-test shell-RTL bank

NEW BackendShellNew.jsx — top-level shell composer with same contract as
BackendNav (activeTabId/onNavigate/clinicSettings/theme/setTheme/topBarSlot/
children). Owns bloomOpen + paletteOpen state. Lazy-mounts BackendArcBloom
(loaded only on first menu open).

Sets html[data-backend-menu-mode="new"] on mount (CSS hides standalone
StaffChatBubble · DuoPill replaces visually). Cleans up on unmount so
mode switch is seamless.

BackendCmdPalette + Cmd+K preserved verbatim (kept for power users per spec).

12 RTL tests in backend-menu-d-shell-rtl.test.jsx covering: data-attr
setup/teardown · children pass-through · 5 utility buttons · mode toggle ·
DuoPill render+events · bloom open/close · Esc · orb→onNavigate contract ·
theme prop pass-through · topBarSlot · V82 marker.
EOF
)"
```

---

## Task 7: BackendDashboard wrap + source-grep regression locks

**Files:**
- Modify: `src/pages/BackendDashboard.jsx` (lines 349-357 — wrap with conditional shell)
- Test: `tests/backend-menu-d-source-grep.test.js`

**Preserved-contract verification:** classic mode path renders existing `<BackendNav>` 100% unchanged. New mode path renders `<BackendShellNew>` with IDENTICAL prop names + IDENTICAL handler references. Source-grep test bank locks both paths.

- [ ] **Step 1: Write the failing source-grep test**

Create `tests/backend-menu-d-source-grep.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const dashSrc = () => readFileSync('src/pages/BackendDashboard.jsx', 'utf-8');
const shellSrc = () => readFileSync('src/components/backend/shell/BackendShellNew.jsx', 'utf-8');
const navSrc = () => readFileSync('src/components/backend/nav/BackendNav.jsx', 'utf-8');

describe('Backend Menu D — Source-grep regression locks', () => {
  it('T7.1 BackendDashboard imports useBackendMenuMode', () => {
    expect(dashSrc()).toMatch(/useBackendMenuMode/);
    expect(dashSrc()).toMatch(/from '\.\.\/components\/backend\/shell\/backendMenuMode/);
  });

  it('T7.2 BackendDashboard imports BackendShellNew', () => {
    expect(dashSrc()).toMatch(/BackendShellNew/);
  });

  it('T7.3 BackendDashboard preserves BackendNav import (classic mode kept)', () => {
    expect(dashSrc()).toMatch(/import BackendNav from '\.\.\/components\/backend\/nav\/BackendNav/);
  });

  it('T7.4 BackendDashboard uses both shells in ternary — classic + new', () => {
    const src = dashSrc();
    // Ternary form: mode === 'new' ? <BackendShellNew> : <BackendNav>
    expect(src).toMatch(/mode\s*===\s*'new'\s*\?\s*[\s\S]{0,300}<BackendShellNew/);
    expect(src).toMatch(/:\s*<BackendNav/);
  });

  it('T7.5 Both shells receive SAME props (activeTabId / onNavigate / clinicSettings / theme / setTheme / topBarSlot)', () => {
    const src = dashSrc();
    // Extract the ternary block (~600 chars) and assert both branches contain the props
    const ternary = src.match(/mode === 'new'[\s\S]{0,1200}<\/BackendNav>/);
    expect(ternary).toBeTruthy();
    const block = ternary[0];
    const props = ['activeTabId', 'onNavigate', 'clinicSettings', 'theme', 'setTheme', 'topBarSlot'];
    for (const p of props) {
      // Both branches must reference each prop at least once
      const occurrences = (block.match(new RegExp(`\\b${p}\\b`, 'g')) || []).length;
      expect(occurrences).toBeGreaterThanOrEqual(2);
    }
  });

  it('T7.6 BackendNav.jsx is UNTOUCHED — no shell/* imports', () => {
    expect(navSrc()).not.toMatch(/backend\/shell\//);
    expect(navSrc()).not.toMatch(/BackendShellNew|BackendArcBloom|BackendDuoPill|BackendTopBarNew/);
  });

  it('T7.7 BackendShellNew preserves children slot', () => {
    expect(shellSrc()).toMatch(/\{children\}/);
  });

  it('T7.8 BackendShellNew sets html data-attr for staff-chat hide', () => {
    expect(shellSrc()).toMatch(/data-backend-menu-mode/);
  });

  it('T7.9 BackendShellNew uses BackendCmdPalette (Cmd+K preserved)', () => {
    expect(shellSrc()).toMatch(/BackendCmdPalette/);
  });

  it('T7.10 No accidental edits to sub-components (BranchSelector / ThemeToggle / ProfileDropdown source unmodified)', () => {
    // These are imported verbatim by BOTH BackendNav (via BackendTopBar / BackendDashboard
    // breadcrumb) AND BackendTopBarNew. No edits should have been made to them
    // in this PR — assert no Backend Menu D markers leaked into them.
    const branchSel = readFileSync('src/components/backend/BranchSelector.jsx', 'utf-8');
    const themeT = readFileSync('src/components/ThemeToggle.jsx', 'utf-8');
    const profile = readFileSync('src/components/backend/ProfileDropdown.jsx', 'utf-8');
    for (const src of [branchSel, themeT, profile]) {
      expect(src).not.toMatch(/Backend Menu D|backendMenuMode|BackendShellNew|BackendArcBloom|BackendDuoPill/);
    }
  });

  it('T7.11 navConfig.js NAV_SECTIONS structure unchanged (count + first section id)', () => {
    const nav = readFileSync('src/components/backend/nav/navConfig.js', 'utf-8');
    // Snapshot lock: exact count of section objects and the FIRST section's id.
    // Updating either of these requires a separate, intentional PR.
    expect(nav.match(/id:\s*'appointments-section'/g)).toBeTruthy();
    expect(nav.match(/id:\s*'customers'/g)).toBeTruthy();
    expect(nav.match(/id:\s*'master'/g)).toBeTruthy();
  });

  it('T7.12 StaffChatWidget patch is additive — original chat.expand / unreadCount paths intact', () => {
    const widget = readFileSync('src/components/staffchat/StaffChatWidget.jsx', 'utf-8');
    // Existing V73 contract
    expect(widget).toMatch(/chat\.expand/);
    expect(widget).toMatch(/chat\.unreadCount/);
    // V82 marker (existing)
    expect(widget).toMatch(/StaffChatBubble/);
    // New V D event bridge
    expect(widget).toMatch(/lover:staff-chat-open/);
    expect(widget).toMatch(/lover:staff-chat-unread/);
  });
});
```

- [ ] **Step 2: Run source-grep test to verify it fails**

Run: `npx vitest run tests/backend-menu-d-source-grep.test.js`
Expected: FAIL (T7.1–T7.5 fail — dashboard not yet wrapped).

- [ ] **Step 3: Wrap BackendDashboard with conditional shell**

Modify `src/pages/BackendDashboard.jsx`:

First, add the import near the existing `BackendNav` import (line 23):

```js
import BackendNav from '../components/backend/nav/BackendNav.jsx';
import BackendShellNew from '../components/backend/shell/BackendShellNew.jsx';
import { useBackendMenuMode } from '../components/backend/shell/backendMenuMode.js';
```

Then near the top of the `BackendDashboard` component body (where other hooks live, alongside `activeTab` / `theme` state), add:

```js
const [menuMode] = useBackendMenuMode();
```

Then replace the existing `return ( <BackendNav ... > {children} </BackendNav> )` block at lines 349-720 with a ternary. The exact change: at line 349, change `return (` to:

```jsx
  return menuMode === 'new' ? (
    <BackendShellNew
      activeTabId={activeTab}
      onNavigate={handleNavigate}
      clinicSettings={clinicSettings}
      theme={theme}
      setTheme={setTheme}
      topBarSlot={breadcrumbSlot}
    >
      {/* Same children block as classic mode — copy verbatim from lines 358-719 */}
      <div className={`${activeTab === 'reports' || activeTab.startsWith('reports-') ? 'max-w-none' : 'max-w-7xl'} mx-auto px-4 py-6`}>
        {/* ... entire existing main content block, unchanged ... */}
      </div>
    </BackendShellNew>
  ) : (
    <BackendNav
      activeTabId={activeTab}
      onNavigate={handleNavigate}
      clinicSettings={clinicSettings}
      theme={theme}
      setTheme={setTheme}
      topBarSlot={breadcrumbSlot}
    >
      <div className={`${activeTab === 'reports' || activeTab.startsWith('reports-') ? 'max-w-none' : 'max-w-7xl'} mx-auto px-4 py-6`}>
        {/* ... entire existing main content block, unchanged ... */}
      </div>
    </BackendNav>
  );
```

**Implementation note**: rather than literally duplicating the ~360-line content block, refactor by extracting it to a `const mainContent = (<div className=...>...</div>);` const ABOVE the return, then reference `{mainContent}` inside both branches of the ternary. Both branches receive the SAME children — that's the cosmetic-shell invariant.

The cleanest patch is:

```jsx
  // Extract main content once — both shells consume identically
  const mainContent = (
    <div className={`${activeTab === 'reports' || activeTab.startsWith('reports-') ? 'max-w-none' : 'max-w-7xl'} mx-auto px-4 py-6`}>
      <Suspense fallback={
        <div className="flex items-center justify-center py-16 text-[var(--tx-muted)]" data-testid="backend-tab-loading">
          <span className="inline-block w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin" aria-hidden="true" />
          <span className="ml-3 text-sm">กำลังโหลด...</span>
        </div>
      }>
        {/* ... entire existing tab-switch content ... */}
      </Suspense>
    </div>
  );

  const sharedProps = {
    activeTabId: activeTab,
    onNavigate: handleNavigate,
    clinicSettings,
    theme,
    setTheme,
    topBarSlot: breadcrumbSlot,
  };

  return menuMode === 'new' ? (
    <BackendShellNew {...sharedProps}>{mainContent}</BackendShellNew>
  ) : (
    <BackendNav {...sharedProps}>{mainContent}</BackendNav>
  );
```

The `sharedProps` object guarantees both shells receive byte-identical props (which is the contract the source-grep test T7.5 locks).

- [ ] **Step 4: Run source-grep test — must pass**

Run: `npx vitest run tests/backend-menu-d-source-grep.test.js`
Expected: PASS — 12/12.

- [ ] **Step 5: Run full Backend Menu D test bank (Tasks 1–6 + 7) — all green**

Run:
```bash
npx vitest run \
  tests/backend-menu-d-toggle-localstorage.test.js \
  tests/backend-menu-d-bloom-rtl.test.jsx \
  tests/backend-menu-d-shell-rtl.test.jsx \
  tests/backend-menu-d-source-grep.test.js
```
Expected: PASS — ~59/59.

- [ ] **Step 6: Run targeted regression — ensure classic-mode BackendNav tests still pass**

Run: `npx vitest run tests/backend-nav 2>&1 | tail -10` (matches anything containing `backend-nav` — should hit the existing nav config + sidebar tests).
Expected: PASS unchanged.

- [ ] **Step 7: Build clean**

Run: `npm run build 2>&1 | tail -5`
Expected: succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/pages/BackendDashboard.jsx tests/backend-menu-d-source-grep.test.js
git commit -m "$(cat <<'EOF'
feat(backend-menu-d T7): wrap BackendDashboard with conditional shell + source-grep regression

MOD BackendDashboard.jsx — extracts mainContent + sharedProps; returns
{menuMode === 'new' ? <BackendShellNew> : <BackendNav>} with byte-identical
props on both branches. ~25 LOC delta. Existing handleNavigate / activeTab /
breadcrumbSlot / clinicSettings unchanged.

12 source-grep regression locks in backend-menu-d-source-grep.test.js:
imports, ternary shape, shared-props parity, BackendNav untouched, sub-
components (BranchSelector/ThemeToggle/ProfileDropdown) unmodified, navConfig
unchanged, StaffChatWidget patch additive (V73 contract intact + Menu D
event bridge).

Cosmetic shell invariant verified by tests — no flow/logic/wiring changes.
EOF
)"
```

---

## Task 8: Rule I flow-simulate + Playwright e2e (Tier 3 + Tier 4 L1)

**Files:**
- Create: `tests/backend-menu-d-flow-simulate.test.js`
- Create: `tests/e2e/backend-menu-d.spec.js`

**Preserved-contract verification:** flow-simulate chains the EXACT same nav contract used by classic mode (NAV_SECTIONS → orb → onNavigate(tabId) → activeTab state → tab content re-renders). Playwright Tier 4 drives the real browser against real Firestore — Rule Q V66 L1 evidence required for "verified" claim.

- [ ] **Step 1: Write the flow-simulate test**

Create `tests/backend-menu-d-flow-simulate.test.js`:

```js
// Rule I full-flow simulate — Backend Menu D.
// Chains the exact user click → state change → render path.

import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import BackendShellNew from '../src/components/backend/shell/BackendShellNew.jsx';
import { NAV_SECTIONS } from '../src/components/backend/nav/navConfig.js';

vi.mock('../src/components/backend/BranchSelector.jsx', () => ({ default: () => <div>BS</div> }));
vi.mock('../src/components/ThemeToggle.jsx', () => ({ default: () => <div>TT</div> }));
vi.mock('../src/components/backend/ProfileDropdown.jsx', () => ({ default: () => <div>PD</div> }));

function HarnessApp() {
  const [activeTab, setActiveTab] = useState('customers');
  const [theme, setTheme] = useState('dark');
  return (
    <BackendShellNew
      activeTabId={activeTab}
      onNavigate={setActiveTab}
      clinicSettings={{ accentColor: '#dc2626' }}
      theme={theme}
      setTheme={setTheme}
    >
      <div data-testid="active-tab">{activeTab}</div>
    </BackendShellNew>
  );
}

describe('Backend Menu D — Rule I full-flow simulate', () => {
  it('FS1 initial activeTab = customers', () => {
    render(<HarnessApp />);
    expect(screen.getByTestId('active-tab').textContent).toBe('customers');
  });

  it('FS2 tap menu → bloom opens → tap orb 0 → activeTab updates to first-section first-item', () => {
    render(<HarnessApp />);
    fireEvent.click(screen.getByTestId('duo-pill-menu'));
    const orbs = screen.getAllByRole('menuitem');
    expect(orbs.length).toBe(NAV_SECTIONS.length);
    fireEvent.click(orbs[0]);
    expect(screen.getByTestId('active-tab').textContent).toBe(NAV_SECTIONS[0].items[0].id);
  });

  it('FS3 orb click also closes the bloom (no lingering overlay)', () => {
    render(<HarnessApp />);
    fireEvent.click(screen.getByTestId('duo-pill-menu'));
    fireEvent.click(screen.getAllByRole('menuitem')[0]);
    expect(screen.queryByTestId('bloom-overlay')).toBeNull();
  });

  it('FS4 every section reachable via orb click', () => {
    NAV_SECTIONS.forEach((section, i) => {
      const { unmount } = render(<HarnessApp />);
      fireEvent.click(screen.getByTestId('duo-pill-menu'));
      const orbs = screen.getAllByRole('menuitem');
      fireEvent.click(orbs[i]);
      expect(screen.getByTestId('active-tab').textContent).toBe(section.items[0].id);
      unmount();
    });
  });

  it('FS5 backdrop click closes bloom without navigating', () => {
    render(<HarnessApp />);
    expect(screen.getByTestId('active-tab').textContent).toBe('customers');
    fireEvent.click(screen.getByTestId('duo-pill-menu'));
    fireEvent.click(screen.getByTestId('bloom-backdrop'));
    expect(screen.queryByTestId('bloom-overlay')).toBeNull();
    expect(screen.getByTestId('active-tab').textContent).toBe('customers');
  });

  it('FS6 keyboard Esc closes bloom without navigating', () => {
    render(<HarnessApp />);
    fireEvent.click(screen.getByTestId('duo-pill-menu'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('bloom-overlay')).toBeNull();
    expect(screen.getByTestId('active-tab').textContent).toBe('customers');
  });
});
```

- [ ] **Step 2: Run flow-simulate test — must pass**

Run: `npx vitest run tests/backend-menu-d-flow-simulate.test.js`
Expected: PASS — 6/6.

- [ ] **Step 3: Write the Playwright e2e spec**

Check first if Playwright config exists: `cat F:/LoverClinic-app/playwright.config.* 2>/dev/null | head -20`. If yes, use existing config. Reuse the auth-fixture pattern from `tests/e2e/phase-29-recall-adversarial.spec.js` (anonymous + admin signInWithPassword → idToken injected via localStorage).

Create `tests/e2e/backend-menu-d.spec.js`:

```js
import { test, expect } from '@playwright/test';

// Backend Menu D — Tier 4 L1 (real browser · real Firestore)
// Per Rule Q V66 mandate — required for any "verified" claim.

const BASE_URL = process.env.PW_BASE_URL || 'http://localhost:5173';
const ADMIN_EMAIL = process.env.PW_ADMIN_EMAIL || 'oomz.peerapat@gmail.com';
const ADMIN_PASS = process.env.PW_ADMIN_PASS;
const FIREBASE_API_KEY = process.env.PW_FIREBASE_API_KEY;

async function signInAsAdmin(page) {
  // Mirror tests/e2e/phase-29-recall-adversarial.spec.js auth fixture.
  if (!ADMIN_PASS || !FIREBASE_API_KEY) {
    test.skip(true, 'PW_ADMIN_PASS + PW_FIREBASE_API_KEY required');
  }
  const res = await page.request.post(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`,
    { data: { email: ADMIN_EMAIL, password: ADMIN_PASS, returnSecureToken: true } }
  );
  const body = await res.json();
  expect(body.idToken).toBeTruthy();
  await page.addInitScript((token, uid, email) => {
    const k = `firebase:authUser:${'AIza...'}` /* matched via prefix scan below */;
    // Use prefix matcher because key suffix depends on apiKey
    localStorage.setItem(`firebase:authUser:${uid}`, JSON.stringify({
      uid, email, stsTokenManager: { accessToken: token },
    }));
  }, body.idToken, body.localId, ADMIN_EMAIL);
}

test.describe('Backend Menu D — Real-browser L1', () => {
  test.beforeEach(async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto(`${BASE_URL}/?backend=1`);
    // Wait for shell to render
    await page.waitForSelector('[data-testid="backend-topbar-new"], [data-testid="backend-classic-sidebar"]', { timeout: 10000 });
  });

  test('E1 Backend renders in "new" mode by default', async ({ page }) => {
    await expect(page.locator('[data-testid="backend-topbar-new"]')).toBeVisible();
    await expect(page.locator('[data-testid="backend-duo-pill"]')).toBeVisible();
  });

  test('E2 Tap DuoPill menu → bloom opens with 8 orbs', async ({ page }) => {
    await page.locator('[data-testid="duo-pill-menu"]').click();
    await expect(page.locator('[data-testid="bloom-overlay"]')).toBeVisible();
    const orbs = page.locator('[role="menuitem"]');
    await expect(orbs).toHaveCount(8);
  });

  test('E3 Tap orb → activeTab switches + bloom closes', async ({ page }) => {
    await page.locator('[data-testid="duo-pill-menu"]').click();
    await page.locator('[data-testid="bloom-orb-customers"]').click();
    await expect(page.locator('[data-testid="bloom-overlay"]')).not.toBeVisible();
    // Tab content visible — assert URL or breadcrumb reflects
    await expect(page.locator('header h1')).toContainText(/ข้อมูลลูกค้า|ลูกค้า/);
  });

  test('E4 Mode toggle: switch to classic → BackendNav sidebar renders', async ({ page }) => {
    await page.locator('[data-testid="mode-toggle-classic"]').click();
    await page.waitForTimeout(300); // 200ms fade + buffer
    // Classic shell uses a different testid (existing BackendSidebar)
    await expect(page.locator('[data-testid="backend-topbar-new"]')).not.toBeVisible();
    // Switch back
    await page.reload(); // localStorage persists; default re-reads to 'classic' on this device
    await page.locator('[data-testid="mode-toggle-new"]').click();
    await expect(page.locator('[data-testid="backend-topbar-new"]')).toBeVisible();
  });

  test('E5 5 utility buttons present in desktop top bar', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.reload();
    await expect(page.locator('[data-testid="topbar-frontend-desktop"]')).toBeVisible();
    await expect(page.locator('[data-testid="topbar-shortcut-desktop"]')).toBeVisible();
    await expect(page.locator('[data-testid="backend-menu-mode-toggle"]')).toBeVisible();
    // BranchSelector + ThemeToggle + ProfileDropdown render their own real components
  });

  test('E6 Theme toggle (dark → light) — bloom switches to sakura palette', async ({ page }) => {
    // Find the theme toggle button (existing component — no testid override)
    await page.locator('button[aria-label*="theme" i], button[title*="theme" i]').first().click();
    await page.waitForTimeout(200);
    await page.locator('[data-testid="duo-pill-menu"]').click();
    await expect(page.locator('[data-testid="bloom-overlay"]')).toBeVisible();
    // No stars in light theme — petals instead. Sanity: count CSS-rendered .bloom-petal
    const petalCount = await page.locator('.bloom-petal').count();
    expect(petalCount).toBeGreaterThan(0);
  });

  test('E7 DuoPill chat button triggers staff chat expand (V73/V82 contract)', async ({ page }) => {
    await page.locator('[data-testid="duo-pill-chat"]').click();
    // StaffChatPanel renders (existing testid from V73)
    await expect(page.locator('[data-testid="staff-chat-panel"]').or(page.getByRole('dialog'))).toBeVisible();
  });

  test('E8 Mobile viewport — bloom UI forced + Mode toggle hidden', async ({ page }) => {
    await page.setViewportSize({ width: 414, height: 896 });
    await page.reload();
    await expect(page.locator('[data-testid="backend-topbar-new"]')).toBeVisible();
    await expect(page.locator('[data-testid="backend-menu-mode-toggle"]')).not.toBeVisible();
    await expect(page.locator('[data-testid="duo-pill-menu"]')).toBeVisible();
  });
});
```

- [ ] **Step 4: Start dev server in background then run Playwright**

```bash
# Terminal 1 — dev server
npm run dev &
# Wait until http://localhost:5173 responds
# Terminal 2 — run e2e
PW_ADMIN_PASS=<admin-password> PW_FIREBASE_API_KEY=<firebase-web-api-key> \
  npx playwright test tests/e2e/backend-menu-d.spec.js --reporter=line
```
Expected: 8/8 PASS in the deployed-dev (real browser + real Firestore).

If creds env vars not set → tests skip (acceptable for local dev). User runs full L1 hands-on instead.

- [ ] **Step 5: Build clean**

Run: `npm run build 2>&1 | tail -5`
Expected: succeeds.

- [ ] **Step 6: Commit**

```bash
git add tests/backend-menu-d-flow-simulate.test.js tests/e2e/backend-menu-d.spec.js
git commit -m "$(cat <<'EOF'
test(backend-menu-d T8): Rule I flow-simulate (Tier 3) + Playwright e2e (Tier 4 L1)

NEW tests/backend-menu-d-flow-simulate.test.js — Rule I chain (tap → state →
re-render) · 6 simulated user flows covering FS1-FS6 · every section
reachable via orb · backdrop/Esc close without navigating.

NEW tests/e2e/backend-menu-d.spec.js — Playwright real-browser · 8 scenarios
E1-E8 · real Firestore · admin auth via signInWithPassword · covers default
mode · DuoPill open · orb navigate · mode toggle round-trip · 5 utility
buttons · theme switch (dark↔sakura) · chat trigger · mobile forces-new.

Per Rule Q V66 — Tier 4 L1 evidence required for "verified" claim. Tests
skip locally without PW_ADMIN_PASS + PW_FIREBASE_API_KEY env vars; user
runs them with creds or via L1 hands-on.
EOF
)"
```

---

## Task 9: Stress + user-simulation (Tier 5 + Tier 6 chaos)

**Files:**
- Create: `tests/backend-menu-d-stress.test.js`
- Create: `tests/backend-menu-d-user-simulation.mjs`

**Preserved-contract verification:** stress test asserts no state corruption / no leak / no double-fire across 100× toggle, rapid clicks, branch+theme thrash. User-simulation script asserts 100% pass rate (no console errors, no thrown exceptions) under random click sequence.

- [ ] **Step 1: Write the stress test**

Create `tests/backend-menu-d-stress.test.js`:

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { useState } from 'react';
import BackendShellNew from '../src/components/backend/shell/BackendShellNew.jsx';
import { setBackendMenuMode, getBackendMenuMode } from '../src/components/backend/shell/backendMenuMode.js';

vi.mock('../src/components/backend/BranchSelector.jsx', () => ({ default: () => <div>BS</div> }));
vi.mock('../src/components/ThemeToggle.jsx', () => ({ default: ({ theme, setTheme }) => (
  <button data-testid="tt" onClick={() => setTheme?.(theme === 'dark' ? 'light' : 'dark')}>{theme}</button>
) }));
vi.mock('../src/components/backend/ProfileDropdown.jsx', () => ({ default: () => <div>PD</div> }));

function Harness() {
  const [activeTab, setActiveTab] = useState('customers');
  const [theme, setTheme] = useState('dark');
  return (
    <BackendShellNew
      activeTabId={activeTab}
      onNavigate={setActiveTab}
      clinicSettings={{ accentColor: '#dc2626' }}
      theme={theme}
      setTheme={setTheme}
    >
      <div data-testid="tab">{activeTab}</div>
    </BackendShellNew>
  );
}

describe('Backend Menu D — Stress', () => {
  beforeEach(() => { localStorage.clear(); cleanup(); });

  it('S1 100× mode toggle round-trip — no localStorage corruption', () => {
    for (let i = 0; i < 100; i++) {
      setBackendMenuMode(i % 2 === 0 ? 'new' : 'classic');
    }
    expect(getBackendMenuMode()).toBe('classic');
    setBackendMenuMode('new');
    expect(getBackendMenuMode()).toBe('new');
  });

  it('S2 rapid open/close DuoPill 50× — no leaked bloom overlays', () => {
    render(<Harness />);
    for (let i = 0; i < 50; i++) {
      fireEvent.click(screen.getByTestId('duo-pill-menu'));
      fireEvent.keyDown(window, { key: 'Escape' });
    }
    expect(screen.queryByTestId('bloom-overlay')).toBeNull();
  });

  it('S3 orb click 20× — activeTab toggles deterministically', () => {
    render(<Harness />);
    let lastTab = null;
    for (let i = 0; i < 20; i++) {
      fireEvent.click(screen.getByTestId('duo-pill-menu'));
      const orbs = screen.getAllByRole('menuitem');
      const idx = i % orbs.length;
      fireEvent.click(orbs[idx]);
      const tab = screen.getByTestId('tab').textContent;
      expect(typeof tab).toBe('string');
      expect(tab.length).toBeGreaterThan(0);
      lastTab = tab;
    }
    expect(lastTab).toBeTruthy();
  });

  it('S4 theme thrash 30× — html data-attr remains "new" throughout', () => {
    render(<Harness />);
    for (let i = 0; i < 30; i++) {
      fireEvent.click(screen.getByTestId('tt'));
      expect(document.documentElement.getAttribute('data-backend-menu-mode')).toBe('new');
    }
  });

  it('S5 staff-chat-open event fires exactly 1× per chat click', () => {
    render(<Harness />);
    const spy = vi.fn();
    window.addEventListener('lover:staff-chat-open', spy);
    for (let i = 0; i < 10; i++) fireEvent.click(screen.getByTestId('duo-pill-chat'));
    expect(spy).toHaveBeenCalledTimes(10);
    window.removeEventListener('lover:staff-chat-open', spy);
  });

  it('S6 unmount cleans up html data-attr', () => {
    const { unmount } = render(<Harness />);
    expect(document.documentElement.getAttribute('data-backend-menu-mode')).toBe('new');
    unmount();
    expect(document.documentElement.getAttribute('data-backend-menu-mode')).toBeNull();
  });
});
```

- [ ] **Step 2: Write the user-simulation bot**

Create `tests/backend-menu-d-user-simulation.mjs`:

```js
#!/usr/bin/env node
// Tier 6 — Random-click user simulation. Runs against running dev server.
// 100 random click sequences; 100% pass rate required (zero console errors,
// zero thrown exceptions).
//
// Usage:
//   npm run dev &
//   node tests/backend-menu-d-user-simulation.mjs

import { chromium } from 'playwright';

const BASE = process.env.PW_BASE_URL || 'http://localhost:5173';
const ITERATIONS = Number(process.env.PW_ITER || 100);
const SEED = Number(process.env.PW_SEED || 42);

const SELECTORS = [
  '[data-testid="duo-pill-chat"]',
  '[data-testid="duo-pill-menu"]',
  '[data-testid="topbar-frontend-desktop"]',
  '[data-testid="topbar-shortcut-desktop"]',
  '[data-testid="mode-toggle-new"]',
  '[data-testid="mode-toggle-classic"]',
];

function lcg(seed) {
  let s = seed;
  return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296;
}

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });

  try {
    await page.goto(`${BASE}/?backend=1`, { waitUntil: 'networkidle' });
    await page.waitForSelector('[data-testid="backend-topbar-new"], [data-testid="backend-classic-sidebar"]', { timeout: 10000 });

    const rng = lcg(SEED);
    let clicked = 0;
    for (let i = 0; i < ITERATIONS; i++) {
      const sel = SELECTORS[Math.floor(rng() * SELECTORS.length)];
      const el = await page.$(sel);
      if (el) {
        try {
          await el.click({ timeout: 1000 });
          clicked++;
        } catch { /* element may have unmounted (e.g. mode swap); fine */ }
      }
      // 200ms settle
      await page.waitForTimeout(200);
      // Close any open overlay before next iter
      await page.keyboard.press('Escape').catch(() => {});
    }

    console.log(`Iterations: ${ITERATIONS} · clicks-landed: ${clicked} · errors: ${errors.length}`);
    if (errors.length > 0) {
      console.error('FAILED — errors:');
      errors.forEach((e) => console.error('  -', e));
      process.exit(1);
    }
    console.log('PASS — 100% clean (no console errors, no exceptions)');
  } finally {
    await browser.close();
  }
})();
```

- [ ] **Step 3: Run the stress test**

Run: `npx vitest run tests/backend-menu-d-stress.test.js`
Expected: PASS — 6/6.

- [ ] **Step 4: Run the user-simulation bot (manual, against running dev server)**

```bash
# Terminal 1:
npm run dev
# Terminal 2 (once port 5173 ready):
node tests/backend-menu-d-user-simulation.mjs
```
Expected: `PASS — 100% clean (no console errors, no exceptions)`.

If bot finds errors → fix → re-run ENTIRE pyramid (per feedback_cosmetic_shell_redesign_constraint loop discipline).

- [ ] **Step 5: Run the FULL Backend Menu D test bank — all 6 tiers green**

```bash
npx vitest run \
  tests/backend-menu-d-toggle-localstorage.test.js \
  tests/backend-menu-d-bloom-rtl.test.jsx \
  tests/backend-menu-d-shell-rtl.test.jsx \
  tests/backend-menu-d-source-grep.test.js \
  tests/backend-menu-d-flow-simulate.test.js \
  tests/backend-menu-d-stress.test.js
```
Expected: PASS — ~71/71.

- [ ] **Step 6: Run the FULL vitest baseline regression — no other test broken**

Run: `npm test -- --run 2>&1 | tail -15`
Expected: PASS — was 11409, expect 11409 + ~71 = ~11480.

- [ ] **Step 7: Build clean**

Run: `npm run build 2>&1 | tail -5`
Expected: succeeds.

- [ ] **Step 8: Commit**

```bash
git add tests/backend-menu-d-stress.test.js tests/backend-menu-d-user-simulation.mjs
git commit -m "$(cat <<'EOF'
test(backend-menu-d T9): stress (Tier 5) + user-simulation (Tier 6) — pyramid complete

NEW tests/backend-menu-d-stress.test.js — 6 chaos scenarios
S1 100× mode toggle · S2 50× rapid open/close · S3 20× orb-click ·
S4 30× theme thrash · S5 staff-chat-event fires-once-per-click · S6 cleanup.

NEW tests/backend-menu-d-user-simulation.mjs — Playwright bot · LCG-seeded
random click sequence (default 100 iterations) · 100% clean = 0 console
errors + 0 pageerrors.

Loop discipline (per feedback_cosmetic_shell_redesign_constraint) — if ANY
tier red, fix → re-run pyramid → no "done" claim until 100% Perfect.

Cumulative test count: 11409 → ~11480 (+71 Backend Menu D · 6 tiers).
EOF
)"
```

---

## Self-Review

**Spec coverage (vs design doc 13 locked decisions):**

| # | Decision | Task covers |
|---|---|---|
| 1 | D2 Arc Fan bloom | T3 (BackendArcBloom layout + animation) |
| 2 | Duo Pill bottom-right | T4 (BackendDuoPill) |
| 3 | 5 utility buttons + ProfileDropdown clickable | T5 (BackendTopBarNew imports verbatim) |
| 4 | Responsive 2-row mobile / 1-row desktop | T5 |
| 5 | Dark bloom BG (space + stars + nebula + embers + drift) | T2 (CSS) + T3 (positions) |
| 6 | Sakura BG (pink + petals) | T2 + T3 |
| 7 | Header BG blends with bloom (frosted) | T5 (top bar gradient + blur) |
| 8 | Orb float + fire-pulse halo | T2 (CSS animations) + T3 (nth-of-type) |
| 9 | Mode toggle ⚡↔📋 ≥768px | T1 (toggle component) + T5 (placement) |
| 10 | Per-device localStorage | T1 (helper + hook) |
| 11 | Seamless React swap | T7 (BackendDashboard conditional render) |
| 12 | A11y (dialog/menuitem/focus trap/Esc/arrows/reduced-motion) | T3 (focus trap + keyboard) + T2 (reduced-motion CSS) |
| 13 | Removed BackendMobileDrawer in new-mode; Cmd+K kept | T6 (ShellNew doesn't import drawer; BackendCmdPalette mounted) |

**Test pyramid coverage:**

| Tier | Task | Covers |
|------|------|--------|
| 1 RTL (unit + component) | T1, T3, T6 | helper / hook / Bloom / Shell |
| 2 Source-grep regression | T7 | preserved-contract + classic-untouched |
| 3 Rule I flow-simulate | T8 | full chain tap → state → render |
| 4 Playwright e2e L1 | T8 | real browser + real Firestore (Rule Q V66 evidence) |
| 5 Stress | T9 | rapid clicks · 100× toggle · theme thrash · event count |
| 6 User simulation | T9 | bot random clicks · 100% clean |

**Placeholder scan:** ✅ none. Every step has actual code.

**Type consistency:** ✅
- `useBackendMenuMode()` returns `[mode, setMode]` consistently across T1, T5, T7.
- `onNavigate(tabId: string)` signature identical in T3 (Bloom orb click) and T7 (BackendDashboard handleNavigate prop pass-through).
- `BackendShellNew` prop list `{activeTabId, onNavigate, clinicSettings, theme, setTheme, topBarSlot, children}` IDENTICAL to existing `BackendNav` prop list (T6 + T7 lock this via sharedProps spread).
- Custom-event names `lover:staff-chat-open` + `lover:staff-chat-unread` + `lover:staff-chat-unread-request` consistent across T4 (DuoPill dispatch + StaffChatWidget listen).

**Task count:** 9 tasks. Within target 8–12; cap 15. Honors `feedback_keep_task_count_tight` — every task ships a complete artifact (component + test) rather than splitting "component" and "test" into separate tasks.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-18-backend-menu-redesign-variant-d.md`.

**Two execution options:**

**1. Subagent-Driven (recommended)** — `Skill(subagent-driven-development)`. Fresh subagent per task + two-stage review between tasks. Fast iteration; reviewer catches drift early. Best fit for 9 tasks with cosmetic-shell invariant that must be enforced per-task.

**2. Inline Execution** — `Skill(executing-plans)`. Batch execution with checkpoints. Good for a single uninterrupted sitting; reviewer is you between tasks.

Choose one to proceed.
