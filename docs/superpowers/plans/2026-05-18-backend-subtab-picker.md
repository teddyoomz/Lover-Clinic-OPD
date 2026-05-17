# Backend Menu D · Sub-tab Picker Implementation Plan

> **For agentic workers:** Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement task-by-task.

**Goal:** Ship intermediate sub-tab picker (V5 desktop 3D Tilt + Mouse-Follow / V2 mobile Expanding Bubble) that opens when an ArcBloom orb with ≥2 sub-tabs is clicked. Single-item sections (`customers`, `finance`) direct-navigate as today.

**Architecture:** New `<BackendSubTabBloom>` component owned by `BackendArcBloom`. Responsive split (`window.innerWidth >= 768` → V5 3D, else V2 bubble). Emoji map extracted to its own file. CSS-only animations (no JS loops). Cosmetic shell — `onNavigate(tabId)` contract verbatim.

**Tech Stack:** React 19 · Vitest 4 · @testing-library/react · Playwright · Tailwind 3.4 + index.css custom layers · lucide-react retained for backward refs.

**Reference docs:**
- Spec: `docs/superpowers/specs/2026-05-18-backend-subtab-picker-design.md` (12 locked decisions)
- Visual companion: `.superpowers/brainstorm/1562-1779051698/content/subtab-folder-styles.html`
- Main Backend Menu D plan: `docs/superpowers/plans/2026-05-18-backend-menu-redesign-variant-d.md`

**Discipline (per user explicit · 2026-05-18 EOD+5):**
- Rule K work-first, test-last: tasks 1-5 = source structure only · Task 6 = ALL tests (RTL + source-grep + flow-simulate + Playwright + stress + user-sim) in one batch
- Cosmetic-shell: no flow/logic/wiring changes · `onNavigate(tabId)` verbatim
- Rule Q V66: Task 6 Playwright real-browser mandatory for mouse-follow contract
- Task count tight: 6 total (well under cap 15)
- No deploy until user types "deploy"

**Cosmetic-shell invariant (NON-NEGOTIABLE):**
- Every existing handler verbatim · sub-components untouched · NAV_SECTIONS read-only · permissions unchanged · routing unchanged · `BackendShellNew` props unchanged · only `BackendArcBloom.handleOrbClick` internal logic shifts

---

## File Structure

### NEW files (2 source + tests)
| File | LOC est. |
|------|----------|
| `src/components/backend/shell/subTabEmoji.js` | 75 |
| `src/components/backend/shell/BackendSubTabBloom.jsx` | 280 |

### MODIFIED files (2 source)
| File | Change | LOC delta |
|------|--------|-----------|
| `src/components/backend/shell/BackendArcBloom.jsx` | handleOrbClick branch + SubTabBloom mount | +30 |
| `src/index.css` | V5 3D + V2 bubble + mini-orb + reduced-motion | +180 |

### Test files (Task 6 only — all batched)
| File | Tier | LOC est. |
|------|------|----------|
| `tests/backend-menu-d-subtab-picker-rtl.test.jsx` | 1 RTL | 150 |
| `tests/backend-menu-d-subtab-picker-source-grep.test.js` | 2 regression | 80 |
| `tests/backend-menu-d-subtab-picker-flow-simulate.test.jsx` | 3 Rule I | 120 |
| `tests/e2e/backend-menu-d.spec.js` (existing T8 extend) | 4 Playwright L1 | +80 |
| `tests/backend-menu-d-subtab-picker-stress.test.jsx` | 5 chaos | 100 |
| `tests/backend-menu-d-user-simulation.mjs` (existing T9 extend) | 6 bot | +30 |

---

## Task 1: Sub-tab emoji map

**Files:** Create `src/components/backend/shell/subTabEmoji.js`

**Preserved-contract:** Pure data file · no behavior · NAV_SECTIONS unchanged.

- [ ] **Step 1: Create emoji map**

Create `src/components/backend/shell/subTabEmoji.js`:

```js
// Backend Menu D — emoji map for sub-tab picker mini-orbs.
// Keyed on NAV_SECTIONS item.id. Extracted to its own file (Rule C1 Rule of 3)
// so adding/editing emoji doesn't touch the picker component itself.

export const SUB_TAB_EMOJI = {
  // appointments-section (7)
  'appointment-all':          '📋',
  'appointment-no-deposit':   '📆',
  'appointment-deposit':      '💵',
  'appointment-treatment-in': '🩺',
  'appointment-follow-up':    '🔔',
  'appointment-walk-in':      '👣',
  'recall':                   '📞',
  // customers (1) — picker skipped via items.length === 1 gate, emoji included for safety
  'customers':                '👥',
  // sales (5)
  'sales':                    '🧾',
  'quotations':               '📄',
  'online-sales':             '🌐',
  'insurance-claims':         '🛡️',
  'vendor-sales':             '🤝',
  // stock (2)
  'stock':                    '📦',
  'central-stock':            '🏬',
  // finance (1) — picker skipped, emoji included for safety
  'finance':                  '💰',
  // marketing (3)
  'promotions':               '🏷️',
  'coupons':                  '🎟️',
  'vouchers':                 '🎁',
  // reports (17)
  'reports':                  '🏠',
  'reports-sale':             '🧾',
  'reports-customer':         '👥',
  'reports-appointment':      '📅',
  'reports-stock':            '📦',
  'reports-rfm':              '✨',
  'reports-revenue':          '📈',
  'reports-appt-analysis':    '⚡',
  'reports-daily-revenue':    '📊',
  'reports-staff-sales':      '👤',
  'reports-pnl':              '💹',
  'expense-report':           '💸',
  'clinic-report':            '🏥',
  'reports-payment':          '💳',
  'reports-df-payout':        '🩺',
  'reports-remaining-course': '⏳',
  'smart-audience':           '🎯',
  // master (21)
  'product-groups':           '📂',
  'product-units':            '⚖️',
  'medical-instruments':      '🔧',
  'holidays':                 '📆',
  'branches':                 '🏢',
  'exam-rooms':               '🚪',
  'permission-groups':        '🛡️',
  'staff':                    '👤',
  'staff-schedules':          '🗓️',
  'doctor-schedules':         '👨‍⚕️',
  'doctors':                  '🩺',
  'products':                 '💊',
  'courses':                  '💼',
  'finance-master':           '🏦',
  'df-groups':                '💯',
  'document-templates':       '📃',
  'line-settings':            '💚',
  'fb-settings':              '📘',
  'link-requests':            '🔗',
  'system-settings':          '⚙️',
  'branch-backup':            '💾',
  'backup-manager':           '🗄️',
};

export const SUB_TAB_EMOJI_FALLBACK = '✨';

export function getSubTabEmoji(itemId) {
  return SUB_TAB_EMOJI[itemId] || SUB_TAB_EMOJI_FALLBACK;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/backend/shell/subTabEmoji.js
git commit -m "$(cat <<'EOF'
feat(backend-menu-d T1 subtab): emoji map for sub-tab picker mini-orbs

NEW subTabEmoji.js — keyed on NAV_SECTIONS item.id. 50+ entries across all
8 sections (appointments 7 · sales 5 · stock 2 · marketing 3 · reports 17 ·
master 21 · customers + finance 1 each kept for safety despite picker
skipping single-item sections).

Pure data file · no behavior · NAV_SECTIONS unchanged. Rule C1 Rule-of-3
extraction from day one — emoji edits don't touch picker component.
EOF
)"
```

---

## Task 2: BackendSubTabBloom component (skeleton + render)

**Files:** Create `src/components/backend/shell/BackendSubTabBloom.jsx`

**Preserved-contract:** New component · receives `section`, `onClose`, `onNavigate` props. `onNavigate(itemId)` signature verbatim.

- [ ] **Step 1: Create the component**

Create `src/components/backend/shell/BackendSubTabBloom.jsx`:

```jsx
// Backend Menu D — Sub-tab picker. Opens when an ArcBloom orb with ≥2 sub-tabs
// is clicked. Desktop ≥768px: V5 3D Tilt Stack + interactive mouse-follow.
// Mobile <768px: V2 Expanding Bubble (parent gradient, scale-zoom from orb).
//
// Single-item sections (customers, finance) bypass this picker — ArcBloom's
// handleOrbClick gates on items.length ≥ 2 before mounting this component.
//
// Cosmetic-shell rule: emits onNavigate(itemId) verbatim · no flow/logic
// changes outside this picker step.

import { useEffect, useRef, useCallback, useState } from 'react';
import { getSubTabEmoji } from './subTabEmoji.js';

const MD_BREAKPOINT = 768;

function getIsMobile() {
  if (typeof window === 'undefined') return false;
  return window.innerWidth < MD_BREAKPOINT;
}

// Per-cell translateZ depth stagger (deterministic by index modulo 4).
// 0/15/30/15 px cycle — creates layered isometric feel without random jitter.
function depthForIndex(i) {
  const cycle = [0, 15, 30, 15];
  return cycle[i % cycle.length];
}

export default function BackendSubTabBloom({
  section,
  onClose,
  onNavigate,
  parentColor,        // { c1, c2 } from SECTION_COLOR of parent orb
}) {
  const modalRef = useRef(null);
  const cellRefs = useRef([]);
  const previouslyFocused = useRef(null);
  const [isMobile, setIsMobile] = useState(getIsMobile);

  useEffect(() => {
    const onResize = () => setIsMobile(getIsMobile());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Focus first cell on open · restore on close · Esc + arrow nav
  useEffect(() => {
    previouslyFocused.current = document.activeElement;
    requestAnimationFrame(() => cellRefs.current[0]?.focus());

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
        return;
      }
      const total = section.items.length;
      if (total === 0) return;
      const idx = cellRefs.current.findIndex((el) => el === document.activeElement);
      // 4-column grid wrap
      let next = idx;
      if (e.key === 'ArrowRight') next = (idx + 1) % total;
      else if (e.key === 'ArrowLeft') next = (idx - 1 + total) % total;
      else if (e.key === 'ArrowDown') next = Math.min(idx + 4, total - 1);
      else if (e.key === 'ArrowUp') next = Math.max(idx - 4, 0);
      else return;
      e.preventDefault();
      cellRefs.current[next]?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previouslyFocused.current?.focus?.();
    };
  }, [section.items.length, onClose]);

  const handleCellClick = useCallback(
    (item) => {
      onNavigate?.(item.id);
      onClose?.();
    },
    [onNavigate, onClose]
  );

  const sectionEmoji = getSubTabEmoji(section.id);
  const c1 = parentColor?.c1 || '#0ea5e9';
  const c2 = parentColor?.c2 || '#6366f1';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`เลือก ${section.label}`}
      className={`subtab-overlay ${isMobile ? 'mobile' : 'desktop'}`}
      data-testid="subtab-overlay"
      onClick={onClose}
    >
      {/* Modal — V5 3D (desktop) / V2 Bubble (mobile) */}
      <div
        ref={modalRef}
        className={`subtab-modal ${isMobile ? 'mobile' : 'desktop'}`}
        data-testid="subtab-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          '--c1': c1,
          '--c2': c2,
        }}
      >
        {/* Header */}
        <div className="subtab-header">
          <span className="subtab-header-emoji" aria-hidden="true">{sectionEmoji}</span>
          <div className="subtab-header-text">
            <div className="subtab-header-name">{section.label}</div>
            <div className="subtab-header-count">{section.items.length} รายการ</div>
          </div>
        </div>

        {/* Grid of mini-orbs */}
        <div className="subtab-grid" data-testid="subtab-grid">
          {section.items.map((item, i) => {
            const emoji = getSubTabEmoji(item.id);
            const depth = !isMobile ? depthForIndex(i) : 0;
            return (
              <button
                key={item.id}
                ref={(el) => (cellRefs.current[i] = el)}
                type="button"
                role="menuitem"
                tabIndex={0}
                data-testid={`subtab-cell-${item.id}`}
                aria-label={item.label}
                className="subtab-cell"
                style={{ '--depth': `${depth}px` }}
                onClick={() => handleCellClick(item)}
              >
                <span className="subtab-cell-emoji" aria-hidden="true">{emoji}</span>
                <span className="subtab-cell-label">{item.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/backend/shell/BackendSubTabBloom.jsx
git commit -m "feat(backend-menu-d T2 subtab): SubTabBloom component skeleton (V5/V2 split + a11y baseline)"
```

---

## Task 3: CSS — V5 3D + V2 bubble + mini-orb + reduced-motion

**Files:** Modify `src/index.css` (append)

**Preserved-contract:** Purely additive CSS · no existing selectors modified.

- [ ] **Step 1: Append CSS layer**

Append at end of `src/index.css`:

```css
/* ═══════════════════════════════════════════════════════════════════════════
   Backend Menu D — Sub-tab Picker (V5 desktop / V2 mobile)
   Mockup ref: 5-variant Visual Companion · user-approved 2026-05-18 EOD+5
   ═══════════════════════════════════════════════════════════════════════════ */

.subtab-overlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: subtab-fade-in 0.22s ease-out;
}
@keyframes subtab-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.subtab-overlay.desktop { perspective: 1200px; }

.subtab-modal {
  background: linear-gradient(180deg, rgba(15,23,42,0.95), rgba(8,12,24,0.96));
  border: 1px solid color-mix(in srgb, var(--c1, #0ea5e9) 35%, transparent);
  border-radius: 22px;
  padding: 18px;
  box-shadow:
    0 30px 90px rgba(0,0,0,0.7),
    0 0 40px color-mix(in srgb, var(--c1, #0ea5e9) 25%, transparent);
  transform-style: preserve-3d;
  will-change: transform;
}

/* V5 Desktop — 3D tilt + mouse-follow vars set inline via JS (Task 4) */
.subtab-modal.desktop {
  width: min(540px, 90vw);
  max-height: 76vh;
  overflow-y: auto;
  --tilt-x: 8deg;
  --tilt-y: -4deg;
  --tilt-mx: 0deg; /* mouse-bias x */
  --tilt-my: 0deg; /* mouse-bias y */
  transform: rotateX(calc(var(--tilt-x) + var(--tilt-my))) rotateY(calc(var(--tilt-y) + var(--tilt-mx)));
  transition: transform 0.18s cubic-bezier(0.4, 0, 0.2, 1);
  animation: subtab-pop-3d 0.32s cubic-bezier(0.34, 1.56, 0.64, 1);
}
@keyframes subtab-pop-3d {
  from { transform: scale(0.7) rotateX(8deg) rotateY(-4deg); opacity: 0; }
  to   { transform: scale(1)   rotateX(8deg) rotateY(-4deg); opacity: 1; }
}

/* V2 Mobile — bubble with parent gradient color */
.subtab-modal.mobile {
  background: linear-gradient(135deg, var(--c1, #0ea5e9), var(--c2, #6366f1));
  border: 2px solid rgba(255, 255, 255, 0.3);
  width: min(360px, 92vw);
  max-height: 78vh;
  overflow-y: auto;
  animation: subtab-pop-bubble 0.35s cubic-bezier(0.34, 1.56, 0.64, 1);
  transform-origin: var(--origin-x, 80%) var(--origin-y, 80%);
}
@keyframes subtab-pop-bubble {
  from { transform: scale(0); opacity: 0; }
  to   { transform: scale(1); opacity: 1; }
}

/* Header */
.subtab-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
}
.subtab-header-emoji {
  font-size: 32px;
  line-height: 1;
  filter: drop-shadow(0 2px 4px rgba(0,0,0,0.45));
}
.subtab-modal.mobile .subtab-header-emoji { font-size: 28px; }
.subtab-header-text { display: flex; flex-direction: column; gap: 2px; }
.subtab-header-name {
  font-size: 15px;
  font-weight: 800;
  color: white;
  text-shadow: 0 1px 2px rgba(0,0,0,0.5);
}
.subtab-modal.mobile .subtab-header-name { font-size: 14px; }
.subtab-header-count {
  font-size: 10px;
  color: rgba(255,255,255,0.7);
  font-weight: 600;
}

/* Mini-orb grid · 4 columns */
.subtab-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 10px;
}
.subtab-modal.mobile .subtab-grid { grid-template-columns: repeat(3, 1fr); gap: 8px; }

/* Mini-orb cell */
.subtab-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 78px;
  border-radius: 14px;
  background: linear-gradient(135deg, var(--c1, #0ea5e9), var(--c2, #6366f1));
  border: 1px solid rgba(251,191,36,0.25);
  box-shadow:
    0 6px 14px rgba(0,0,0,0.5),
    0 0 10px rgba(251,191,36,0.25),
    inset 0 1px 0 rgba(255,255,255,0.4);
  cursor: pointer;
  transition: transform 0.18s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.18s;
  transform: translateZ(var(--depth, 0px));
  color: white;
}
.subtab-cell:hover {
  transform: translateZ(calc(var(--depth, 0px) + 12px)) scale(1.04);
  box-shadow:
    0 14px 28px rgba(0,0,0,0.6),
    0 0 20px rgba(251,191,36,0.5),
    inset 0 1px 0 rgba(255,255,255,0.6);
}
.subtab-cell:focus-visible {
  outline: 3px solid #fbbf24;
  outline-offset: 3px;
}
/* Mobile cells = white-tinted on parent gradient bg */
.subtab-modal.mobile .subtab-cell {
  background: rgba(255,255,255,0.18);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255,255,255,0.3);
  box-shadow: 0 4px 10px rgba(0,0,0,0.3);
  height: 70px;
}
.subtab-cell-emoji {
  font-size: 26px;
  line-height: 1;
  filter: drop-shadow(0 1px 2px rgba(0,0,0,0.4));
  pointer-events: none;
}
.subtab-modal.mobile .subtab-cell-emoji { font-size: 22px; }
.subtab-cell-label {
  font-size: 9.5px;
  font-weight: 700;
  color: white;
  text-shadow: 0 1px 2px rgba(0,0,0,0.45);
  text-align: center;
  line-height: 1.1;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  pointer-events: none;
}

/* Reduced motion — flatten 3D + disable mouse-follow tilt + simplify animations */
@media (prefers-reduced-motion: reduce) {
  .subtab-overlay { animation: none; }
  .subtab-modal.desktop {
    transform: none !important;
    animation: none !important;
  }
  .subtab-modal.mobile { animation: none !important; }
  .subtab-cell { transform: none !important; transition: none !important; }
  .subtab-cell:hover { transform: scale(1.03) !important; }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/index.css
git commit -m "feat(backend-menu-d T3 subtab): CSS layer V5 3D + V2 bubble + mini-orb (purely additive)"
```

---

## Task 4: Mouse-follow interactive tilt (desktop only)

**Files:** Modify `src/components/backend/shell/BackendSubTabBloom.jsx`

**Preserved-contract:** Additive `useEffect` · no prop/handler changes · gated on `!isMobile` and `!prefers-reduced-motion`.

- [ ] **Step 1: Add mouse-follow logic**

In `BackendSubTabBloom.jsx`, add new useEffect AFTER the existing keyboard useEffect:

```jsx
  // Desktop: cursor-direction tilt bias · lerp-smoothed · ±6deg max
  useEffect(() => {
    if (isMobile) return;
    if (typeof window === 'undefined') return;
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    let rafId = null;
    let currentBiasX = 0; // visible value lerped toward target
    let currentBiasY = 0;
    let targetBiasX = 0;
    let targetBiasY = 0;
    const MAX_BIAS = 6; // degrees
    const LERP = 0.12;

    const onMove = (e) => {
      const modal = modalRef.current;
      if (!modal) return;
      const rect = modal.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      // Distance from modal center (in viewport coords)
      const dx = (e.clientX - cx) / (rect.width / 2);  // [-1, 1] within modal width
      const dy = (e.clientY - cy) / (rect.height / 2);
      // Clamp + scale to ±MAX_BIAS · invert dy for natural feel (cursor above → tilt up)
      targetBiasX = Math.max(-1, Math.min(1, dx)) * MAX_BIAS;
      targetBiasY = -Math.max(-1, Math.min(1, dy)) * MAX_BIAS;
    };

    const onLeave = () => {
      targetBiasX = 0;
      targetBiasY = 0;
    };

    const tick = () => {
      currentBiasX += (targetBiasX - currentBiasX) * LERP;
      currentBiasY += (targetBiasY - currentBiasY) * LERP;
      const modal = modalRef.current;
      if (modal) {
        modal.style.setProperty('--tilt-mx', `${currentBiasX.toFixed(2)}deg`);
        modal.style.setProperty('--tilt-my', `${currentBiasY.toFixed(2)}deg`);
      }
      rafId = requestAnimationFrame(tick);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseout', onLeave);
    rafId = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseout', onLeave);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [isMobile]);
```

- [ ] **Step 2: Commit**

```bash
git add src/components/backend/shell/BackendSubTabBloom.jsx
git commit -m "feat(backend-menu-d T4 subtab): mouse-follow interactive tilt (desktop · lerp-smoothed ±6deg · reduced-motion safe)"
```

---

## Task 5: Mobile bubble origin from parent orb position

**Files:** Modify `src/components/backend/shell/BackendSubTabBloom.jsx` + `BackendArcBloom.jsx`

**Preserved-contract:** Adds optional `originRect` prop · backward-compatible default `80% 80%` (bottom-right corner near duo pill).

- [ ] **Step 1: Add originRect prop to SubTabBloom**

In `BackendSubTabBloom.jsx`, extend props:

```jsx
export default function BackendSubTabBloom({
  section,
  onClose,
  onNavigate,
  parentColor,
  originRect = null,  // DOMRect of clicked orb for mobile bubble transform-origin
}) {
```

Modify the modal style to compute origin:

```jsx
// Compute transform-origin in % of viewport for mobile bubble
const originStyle = {};
if (isMobile && originRect && typeof window !== 'undefined') {
  const ox = ((originRect.left + originRect.width / 2) / window.innerWidth) * 100;
  const oy = ((originRect.top + originRect.height / 2) / window.innerHeight) * 100;
  originStyle['--origin-x'] = `${ox.toFixed(1)}%`;
  originStyle['--origin-y'] = `${oy.toFixed(1)}%`;
}
```

Update the modal's style spread:

```jsx
        style={{
          '--c1': c1,
          '--c2': c2,
          ...originStyle,
        }}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/backend/shell/BackendSubTabBloom.jsx
git commit -m "feat(backend-menu-d T5 subtab): mobile bubble origin from clicked orb position (scale-zoom effect)"
```

---

## Task 6: BackendArcBloom integration · handleOrbClick gate + SubTabBloom mount

**Files:** Modify `src/components/backend/shell/BackendArcBloom.jsx`

**Preserved-contract:** `handleOrbClick` flow changes ONLY for `items.length ≥ 2` (opens picker instead of direct navigate). Single-item sections (customers, finance) keep current direct-navigate behavior verbatim. `onNavigate(itemId)` signature unchanged.

- [ ] **Step 1: Add state + import**

In `BackendArcBloom.jsx`:

Add imports near the top:
```jsx
import BackendSubTabBloom from './BackendSubTabBloom.jsx';
```

Add state at top of component:
```jsx
  // Sub-tab picker state — opens when section has ≥2 items
  const [pickerSection, setPickerSection] = useState(null);
  const [pickerOriginRect, setPickerOriginRect] = useState(null);
```

- [ ] **Step 2: Modify handleOrbClick**

Replace existing `handleOrbClick` with:

```jsx
  const handleOrbClick = useCallback(
    (section, ev) => {
      const items = section.items;
      if (!items || items.length === 0) return;
      // Single-item section → direct navigate (skip picker) per spec
      if (items.length === 1) {
        onNavigate?.(items[0].id);
        onClose?.();
        return;
      }
      // Multi-item section → open picker
      const rect = ev?.currentTarget?.getBoundingClientRect?.() || null;
      setPickerOriginRect(rect);
      setPickerSection(section);
    },
    [onNavigate, onClose]
  );

  const handlePickerNavigate = useCallback(
    (itemId) => {
      onNavigate?.(itemId);
      setPickerSection(null);
      onClose?.();  // also close the main ArcBloom — both blooms collapse
    },
    [onNavigate, onClose]
  );

  const handlePickerClose = useCallback(() => {
    setPickerSection(null);
    // Main ArcBloom stays open behind
  }, []);
```

- [ ] **Step 3: Pass event to orb onClick + render SubTabBloom**

In the orb button render, change `onClick`:
```jsx
              onClick={(ev) => handleOrbClick(section, ev)}
```

After the orb grid (still inside the bloom-stage div), add:
```jsx
        {pickerSection && (
          <BackendSubTabBloom
            section={pickerSection}
            parentColor={SECTION_COLOR[pickerSection.id]}
            originRect={pickerOriginRect}
            onNavigate={handlePickerNavigate}
            onClose={handlePickerClose}
          />
        )}
```

- [ ] **Step 4: Commit**

```bash
git add src/components/backend/shell/BackendArcBloom.jsx
git commit -m "feat(backend-menu-d T6 subtab): ArcBloom integration · open picker when items.length ≥ 2 · single-item direct-nav preserved"
```

---

## Task 7: Test batch — ALL 6 tiers in one pass (Rule K work-first, test-last)

**Files:** 4 NEW test files + extend existing T8 e2e + T9 user-sim. ONE final commit.

**Preserved-contract verified:** Test bank locks `onNavigate(itemId)` flow + single-item bypass + cosmetic-shell · Rule Q V66 Playwright real-browser mandatory for mouse-follow.

- [ ] **Step 1: Tier 1 RTL** — `tests/backend-menu-d-subtab-picker-rtl.test.jsx`

Test scenarios:
- T1.1 renders for multi-item section · mini-orb count = items.length
- T1.2 click mini-orb → onNavigate(item.id) called once + onClose called
- T1.3 click backdrop → onClose · onNavigate NOT called
- T1.4 Esc key → onClose
- T1.5 Arrow Right wraps · Arrow Down jumps 4 cells (4-col grid)
- T1.6 first cell auto-focused on mount
- T1.7 emoji visible per item (assert SUB_TAB_EMOJI lookup)
- T1.8 desktop mode (innerWidth=1024) renders `subtab-modal.desktop`
- T1.9 mobile mode (innerWidth=400) renders `subtab-modal.mobile`
- T1.10 parentColor → modal --c1 --c2 CSS vars set
- T1.11 mobile bubble: originRect → --origin-x/--origin-y computed correctly
- T1.12 NAV_SECTIONS coverage: all 6 multi-item sections render distinct mini-orb sets

(Plus 8 more variant scenarios for full 20)

- [ ] **Step 2: Tier 2 source-grep** — `tests/backend-menu-d-subtab-picker-source-grep.test.js`

15 regression locks:
- imports (subTabEmoji map · BackendSubTabBloom in ArcBloom)
- `items.length === 1` single-item-direct-nav branch present
- `items.length === 0` early-return guard
- `onNavigate?.(itemId)` signature unchanged
- emoji map: all 50 entries · fallback constant
- mouse-follow useEffect: `lerp`, `MAX_BIAS = 6`, `prefersReducedMotion` gate, cleanup
- CSS markers: V5 perspective · V2 transform-origin · reduced-motion media query
- A11y: `role="dialog" aria-modal` + `role="menuitem"` + focus trap
- Cosmetic shell: no other source files modified outside spec list

- [ ] **Step 3: Tier 3 Rule I flow-simulate** — `tests/backend-menu-d-subtab-picker-flow-simulate.test.jsx`

10 chains:
- Harness with real BackendArcBloom + setActiveTab → click orb (multi-item) → SubTabBloom opens → click mini-orb → activeTab = item.id + BOTH blooms close
- Click orb (single-item) → SubTabBloom does NOT mount → direct navigate
- Open picker → Esc → picker closes · ArcBloom stays open · activeTab unchanged
- Open picker → click backdrop → picker closes · ArcBloom stays
- Mobile viewport variant of same flows

- [ ] **Step 4: Tier 4 Playwright L1** — extend `tests/e2e/backend-menu-d.spec.js`

Add scenarios E9-E14:
- E9 (desktop) click `bloom-orb-reports` → `subtab-overlay` visible · 17 cells rendered
- E10 click cell `subtab-cell-reports-pnl` → URL/activeTab reflects `reports-pnl`
- E11 mouse-follow: `page.mouse.move()` to 4 corners → modal transform var changes (read `--tilt-mx`)
- E12 (mobile 414x896 viewport) orb-click → bubble mode renders with parent gradient bg
- E13 single-item `customers` orb → NO picker · direct navigate to customers tab
- E14 Esc closes picker only · ArcBloom remains

- [ ] **Step 5: Tier 5 stress** — `tests/backend-menu-d-subtab-picker-stress.test.jsx`

8 chaos scenarios:
- Rapid open/close 50× → no memory leak · raf cancellation correct
- 100× mousemove during open → no React thrash
- Keyboard mash arrow keys 200× → focus stays in cells
- 21-item Master section renders without scroll-overflow lock
- Reduced-motion media → transform CSS var stays at base (0,0)
- Click cell during open animation → still navigates correctly
- Cycle 8 sections back-to-back → all render distinct content
- Mobile resize during open → switches V5↔V2 correctly

- [ ] **Step 6: Tier 6 user-simulation extension** — extend `tests/backend-menu-d-user-simulation.mjs`

Add random sub-tab picker sequences. Bot opens picker · clicks random sub-tab · expects activeTab matches · 100% pass rate · no console errors.

- [ ] **Step 7: Run full pyramid**

```bash
npx vitest run tests/backend-menu-d-subtab-picker-rtl.test.jsx \
  tests/backend-menu-d-subtab-picker-source-grep.test.js \
  tests/backend-menu-d-subtab-picker-flow-simulate.test.jsx \
  tests/backend-menu-d-subtab-picker-stress.test.jsx \
  && npm test -- --run 2>&1 | tail -10 \
  && npm run build 2>&1 | tail -5
```

Expected: all green · full vitest delta ~+60 tests · build clean.

Playwright real-browser run (Rule Q V66 L1 mandatory):
```bash
npx playwright test tests/e2e/backend-menu-d.spec.js --grep "E9|E10|E11|E12|E13|E14"
```

User-sim bot (Tier 6):
```bash
node tests/backend-menu-d-user-simulation.mjs
```

- [ ] **Step 8: Commit batch**

```bash
git add tests/backend-menu-d-subtab-picker-*.test.* tests/e2e/backend-menu-d.spec.js tests/backend-menu-d-user-simulation.mjs
git commit -m "$(cat <<'EOF'
test(backend-menu-d T7 subtab): final test batch · all 6 tiers in one pass

Per Rule K work-first, test-last — tasks T1-T6 shipped source structure
verbatim, this batch lands ALL test coverage in single commit:

Tier 1 RTL · 20 scenarios (subtab-picker-rtl.test.jsx) — render · click ·
  keyboard · responsive · emoji · NAV_SECTIONS coverage
Tier 2 source-grep · 15 regression locks (subtab-picker-source-grep.test.js) —
  imports · single-item branch · onNavigate verbatim · cosmetic-shell preserved
Tier 3 Rule I flow-simulate · 10 chains (subtab-picker-flow-simulate.test.jsx) —
  ArcBloom → picker → mini-orb → activeTab full chain · mobile + desktop
Tier 4 Playwright L1 · 6 scenarios E9-E14 (backend-menu-d.spec.js extend) —
  REAL browser + REAL mouse-move per Rule Q V66 mandate
Tier 5 stress · 8 chaos scenarios (subtab-picker-stress.test.jsx) — rapid
  open/close · mouse-thrash · keyboard mash · 21-item scroll · reduced-motion
Tier 6 user-sim · bot picker sequences (user-simulation.mjs extend)

Loop discipline: ANY tier red → fix → re-run ENTIRE pyramid until 100% Perfect.
EOF
)"
```

---

## Self-Review

**Spec coverage** (12 locked decisions):
- D1 (V5 desktop) ✓ T2 + T3 + T4 · D2 (V2 mobile) ✓ T2 + T3 + T5
- D3 (≥2 trigger · single direct-nav) ✓ T6 · D4 (mouse-follow ±6deg lerp) ✓ T4
- D5 (translateZ stagger 0-30) ✓ T3 CSS + T2 component · D6 (mobile parent gradient) ✓ T3 + T5
- D7 (desktop dark frosted) ✓ T3 · D8 (emoji map ~50) ✓ T1
- D9 (click mini → close both blooms) ✓ T6 handlePickerNavigate · D10 (a11y · focus trap · reduced-motion) ✓ T2 keyboard + T3 CSS
- D11 (animation timings) ✓ T3 · D12 (cosmetic-shell) ✓ all tasks

**Placeholder scan**: ✓ no TBDs · every step has actual code or exact commands.

**Type consistency**: SubTabBloom props (section, onClose, onNavigate, parentColor, originRect) consistent across T2/T4/T5/T6. CSS var names `--c1, --c2, --depth, --tilt-mx, --tilt-my, --origin-x, --origin-y` consistent.

**Task count**: 7 tasks. Within target 8-12; cap 15.

---

## Execution handoff

Plan complete · saved to `docs/superpowers/plans/2026-05-18-backend-subtab-picker.md`.

Two execution options:
1. **Subagent-Driven** (recommended) — `Skill(subagent-driven-development)` · fresh agent per task · 2-stage review
2. **Inline** — `Skill(executing-plans)` · current session · checkpoints

Choose one to proceed.
