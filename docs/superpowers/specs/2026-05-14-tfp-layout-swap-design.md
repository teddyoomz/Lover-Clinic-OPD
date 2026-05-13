# TFP layout swap (left ↔ right) — device-persistent preference

**Date**: 2026-05-14
**Phase**: 27.1 (TFP split-screen layout swap)
**Status**: design — awaiting user review
**Triggers**: user directive verbatim: "เพิ่มปุ่มสลับ ซ้าย-ขวา ระหว่างหน้ากรอก TFP ปกติที่เคยอยู่ทางซ้าย ให้สลับไปขวา สลับตำแหน่งกับหน้าประวัติที่เลือกจาก tab ประวัติที่ตอนนี้อยู่ขวาเท่านั้น แล้ว save สิ่งที่เลือกติดในเครื่องนั้นไปเลย ทำเพื่อ support ตำแหน่งวางจอของแพทย์ได้ทุกรูปแบบ"

## Goal

When TFP's split-screen view is active (selectedHistoryTreatmentId set), allow the admin/doctor to flip the visual order of:
- **LEFT panel** = TFP form (default)
- **RIGHT panel** = TreatmentReadOnlyMirror (selected history)

…to:
- **LEFT panel** = TreatmentReadOnlyMirror
- **RIGHT panel** = TFP form

…via a single click. Persist per device. Reason: clinical workstations vary — some doctors prefer their primary display on the left of the desk, some on the right. The user wants the read-only history visible on the screen they look at FIRST without rotating screens or rearranging hardware.

## Locked design decisions (4 brainstorming Qs)

| Q | Decision | Why |
|---|---|---|
| **Q1** Persistence | localStorage (key `tfp_layout_swap_v1`) | Project canon (BranchSelector pattern); 5MB quota; no HTTP overhead; sync access. User said "cookie" colloquially — localStorage is the technical mechanism. |
| **Q2** Button placement | Floating between panels at column divider | Discoverable, visually associated with the split, instantly communicates "swap these two". Standard split-screen UX. |
| **Q3** Default | Form LEFT / History RIGHT (preserve current) | Backward-compatible. Existing users see no change. Saved preference overrides default. |
| **Q4** Scope | TFP (real split) + reusable hook | TreatmentTimelineModal + CustomerDetailView don't currently have a 50/50 split, but the persistence hook is reusable so future surfaces opt in via `useLayoutPreference(key)`. |

## Architecture — 3 components

### Component 1 — `useLayoutPreference(key, defaultValue='left')` (NEW hook)

`src/hooks/useLayoutPreference.js` — reusable React hook.

```js
import { useState, useEffect, useCallback } from 'react';

const STORAGE_PREFIX = 'layout_pref:';

/**
 * Device-persistent layout preference for a named split-screen view.
 *
 * @param {string} key — feature key, e.g. 'tfp' / 'customer-timeline'
 * @param {'left'|'right'} defaultValue — initial position of the PRIMARY
 *        panel (whatever the consumer treats as "primary"); 'left' = default
 *        location.
 * @returns {{ position: 'left'|'right', isPrimaryLeft: boolean, swap: () => void, setPosition: (p) => void }}
 *
 * Persists to localStorage under `layout_pref:<key>`. Reads on mount; writes
 * on every change. Safe-no-op when localStorage unavailable (SSR / private
 * browsing edge cases).
 *
 * V55 audit: kept pure-React + no external deps.
 */
export function useLayoutPreference(key, defaultValue = 'left') {
  const storageKey = `${STORAGE_PREFIX}${key}`;
  const [position, setPositionState] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored === 'left' || stored === 'right') return stored;
    } catch {
      // localStorage unavailable (private browsing / SSR) — fall through
    }
    return defaultValue === 'right' ? 'right' : 'left';
  });

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, position);
    } catch {
      // Storage write failed (quota / disabled) — UI state still works
    }
  }, [storageKey, position]);

  const swap = useCallback(() => {
    setPositionState((p) => (p === 'left' ? 'right' : 'left'));
  }, []);

  const setPosition = useCallback((p) => {
    if (p === 'left' || p === 'right') setPositionState(p);
  }, []);

  return {
    position,
    isPrimaryLeft: position === 'left',
    swap,
    setPosition,
  };
}
```

Pure React. No Firebase. No external deps. Reusable by any future split-screen consumer with a unique `key`.

### Component 2 — `<LayoutSwapButton />` (NEW component)

`src/components/LayoutSwapButton.jsx` — floating button between the two panels.

```jsx
import { ArrowLeftRight } from 'lucide-react';

/**
 * Floating vertical swap button at the column divider. Click → swap()
 * from useLayoutPreference. Visible only when both panels are rendered
 * (caller's responsibility — pass `visible` prop).
 *
 * Position: absolute, centered vertically at split, hovers slightly above
 * panel surfaces with subtle shadow. Touch target ≥ 44px (mobile/tablet
 * a11y per WCAG 2.5.5).
 */
export function LayoutSwapButton({ onSwap, position, visible = true, isDark = true }) {
  if (!visible) return null;
  const label = position === 'left'
    ? 'สลับ — ฟอร์มไปขวา / ประวัติไปซ้าย'
    : 'สลับ — ฟอร์มไปซ้าย / ประวัติไปขวา';
  return (
    <div
      className="hidden lg:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10"
      style={{ pointerEvents: 'none' }}
      data-testid="layout-swap-button-wrapper"
    >
      <button
        type="button"
        onClick={onSwap}
        data-testid="layout-swap-button"
        aria-label={label}
        title={label}
        style={{ pointerEvents: 'auto' }}
        className={`
          flex items-center justify-center
          w-11 h-11 rounded-full
          border-2 ${isDark ? 'border-[#333] bg-[#1a1a1a]' : 'border-gray-200 bg-white'}
          shadow-lg
          hover:scale-110 active:scale-95
          transition-all duration-150
          text-[var(--accent)] hover:bg-[var(--accent)]/10
          focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:ring-offset-2
        `}
      >
        <ArrowLeftRight size={18} />
      </button>
    </div>
  );
}
```

Constraints:
- 44px touch target (h-11 w-11 in Tailwind = 44px)
- `pointer-events: none` on wrapper + `pointer-events: auto` on button → click-through everywhere except button itself
- `hidden lg:flex` → only visible on desktop split-screen (mobile stacks panels vertically — swap not meaningful)
- Thai aria-label + tooltip

### Component 3 — TFP integration

`src/components/TreatmentFormPage.jsx` changes:

```jsx
// near top (imports)
import { useLayoutPreference } from '../hooks/useLayoutPreference.js';
import { LayoutSwapButton } from './LayoutSwapButton.jsx';

// inside component (top-level state)
const { position: tfpLayout, swap: swapTfpLayout, isPrimaryLeft: isFormLeft } = useLayoutPreference('tfp', 'left');
```

In the split-screen container (around line 3154):

```jsx
{/* ── Two-Column Layout ─────────────────────────────────────── */}
<div className={selectedHistoryTreatmentId
  ? `relative max-w-[2000px] lg:flex lg:gap-4 mx-auto px-4 py-4 ${isFormLeft ? '' : 'lg:flex-row-reverse'}`
  : 'max-w-6xl mx-auto px-4 py-4'
}>
  {/* Floating swap button — only when split is active */}
  {selectedHistoryTreatmentId && (
    <LayoutSwapButton
      onSwap={swapTfpLayout}
      position={tfpLayout}
      visible={true}
      isDark={isDark}
    />
  )}

  {/* LEFT (or RIGHT-when-swapped) panel: TFP form */}
  <div className={selectedHistoryTreatmentId ? 'lg:w-1/2 lg:min-w-0' : ''}>
    {/* ... existing form ... */}
  </div>

  {/* RIGHT (or LEFT-when-swapped) panel: history */}
  {selectedHistoryTreatmentId && (
    <aside className="hidden lg:block lg:w-1/2 ...">
      <TreatmentReadOnlyMirror ... />
    </aside>
  )}
</div>
```

Key technique: `lg:flex-row-reverse` on the flex container reverses VISUAL order without changing DOM order. This means:
- Tab order stays the same (form first, history second) — keyboard nav predictable
- Screen reader order stays the same
- Print order stays the same
- Only visual layout flips

This is the cleanest CSS-only swap. No JSX rewrites. No state-machine complexity.

## Data flow

```
PAGE LOAD
  ↓
useLayoutPreference('tfp', 'left') runs
  ↓
Reads localStorage 'layout_pref:tfp'
  ↓
Sets position state (default 'left' if no stored value)
  ↓
TFP renders with lg:flex-row-reverse iff position==='right'
  ↓
User clicks LayoutSwapButton
  ↓
swap() flips position 'left' ↔ 'right'
  ↓
useEffect writes new position to localStorage
  ↓
React re-renders with new layout
  ↓
[next visit to TFP] reads same localStorage value → preserved
```

## Test strategy (V55 8-layer methodology — apply NEW tooling)

### Layer 1 — Hook unit
- `tests/phase-27-1-use-layout-preference.test.js`
- Tests:
  - Default returns 'left' on first load
  - Custom default works ('right')
  - Reads from localStorage on mount
  - Writes to localStorage on swap
  - Rejects invalid stored values (falls back to default)
  - Safe when localStorage throws (private browsing)
  - swap() flips position
  - setPosition() validates input

### Layer 2 — Source-grep regression
- `tests/phase-27-1-source-grep.test.js`
- Asserts:
  - TFP imports useLayoutPreference + LayoutSwapButton
  - TFP applies `lg:flex-row-reverse` conditionally
  - LayoutSwapButton always paired with split-screen condition
  - Storage key matches canonical `layout_pref:tfp`

### Layer 3 — Rule I full-flow simulate
- `tests/phase-27-1-flow-simulate.test.js`
- Chain: localStorage mock → hook init → swap → localStorage write → unmount + remount → preference restored
- Cover: missing localStorage / corrupted value / quota-exceeded write error

### Layer 4 — Property-based via fast-check (NEW V55 methodology)
- `tests/phase-27-1-layout-preference-property-based.test.js`
- Properties:
  - Toggle is involutive: swap()+swap() returns to start
  - localStorage write always matches state position
  - Only 'left' or 'right' values ever appear (no invalid leaks)
  - Storage key always prefixed `layout_pref:`

### Layer 5 — Adversarial fuzz (reuse `tests/helpers/adversarialFixtures.js`)
- Pass adversarial strings as stored values → hook falls back to default
- Pass adversarial keys → storage key construction safe (no prototype pollution / injection)

### Layer 6 — RTL (React Testing Library) component test
- `tests/phase-27-1-layout-swap-rtl.test.jsx`
- Mount TFP-like fixture with split-screen state
- Click swap button → assert `lg:flex-row-reverse` class flips
- Verify aria-label updates
- Verify keyboard activation (Enter / Space)
- Verify localStorage write fires

### Layer 7 — Snapshot (button visual stability)
- `tests/phase-27-1-swap-button-snapshot.test.jsx`
- Lock button DOM structure + classes for both `position='left'` and `position='right'`

### Layer 8 — Stress
- 100-iter swap cycle → assert localStorage final value matches expected count parity

Build verification: full `npm run build` clean.

## Audit invariant

Per Rule D / C1, a NEW audit isn't strictly required for a single-feature hook. BUT to prevent drift:

**AV43 (lightweight)** — every localStorage write outside `useLayoutPreference` that uses key prefix `layout_pref:` is forbidden. Source-grep regression in `tests/phase-27-1-source-grep.test.js` enforces.

## Files touched

NEW:
- `src/hooks/useLayoutPreference.js` (~50 LOC)
- `src/components/LayoutSwapButton.jsx` (~50 LOC)
- 6 NEW test files (Layers 1, 2, 3, 4, 5, 6, 7, 8 — some merged for cohesion)

MODIFIED:
- `src/components/TreatmentFormPage.jsx` — 3 minimal edits:
  - Add 2 imports
  - Add 1 hook call near top of component
  - Add `lg:flex-row-reverse` to outer container + render `<LayoutSwapButton>` inside

## Backward compatibility

- localStorage key `layout_pref:tfp` is new — no migration needed
- Default = 'left' = current behavior; existing users see zero visual change until they explicitly click swap
- TFP's existing split-screen logic untouched — only flex direction changes
- Tab order / a11y / screen reader behavior unchanged (CSS-only visual flip)

## Deploy

- Frontend-only change (no firestore.rules, no api/, no schema)
- Combined V15 deploy `vercel --prod` only (firebase rules redeploy idempotent)
- Smoke verify on prod: open TFP with split-screen → click swap → reload → preference persists

## Out of scope

- Sync preference across devices (would require Firestore user-prefs doc — separate Phase if requested)
- Mobile swap (mobile stacks panels — swap not meaningful; button hidden via `hidden lg:flex`)
- Keyboard shortcut binding (e.g. Alt+L) — can extend later via `setPosition` API
- Other split-screen surfaces — hook is reusable; future surfaces add their own key
- Animated transition between layouts (Tailwind class change is instant; smooth transition would need View Transition API — skip for now)
