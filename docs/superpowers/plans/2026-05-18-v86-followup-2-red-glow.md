# V86-followup-2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pivot V86 from per-section blue/cyan to universal RED with reduced intensity (Q1=C 45%) + add admin-tunable Settings UI section in tab=system-settings, persisting to `clinic_settings/system_config.v86Glow` and applying live via CSS custom properties.

**Architecture:** Drop V86 v1's 8 per-section CSS-vars blocks (dead code under universal color). Single `:root` declares 3 vars (`--neon-c1` border RGB, `--neon-c2` halo RGB, `--neon-intensity` 0.45 default). All V86 alphas wrap in `calc(<base> * var(--neon-intensity))`. New `useV86GlowApply` hook reads `system_config.v86Glow` + sets vars on `document.documentElement`. New 5th `SectionCard` in `SystemSettingsTab.jsx` gives admin 2 color pickers + intensity slider + live preview + Save/Reset/Cancel.

**Tech Stack:** Vanilla CSS (`var()` + `calc()` + cascade), React hooks (existing `useSystemConfig`), Firestore (existing `clinic_settings/system_config` doc), Vitest, Playwright.

---

## 🚨 CONSTRAINTS (re-state before each task)

1. **Cosmetic-shell strict** — only CSS value changes + new hook + new SectionCard. ZERO handler/state/prop/wiring changes to existing flows.
2. **V86 v1 commits stay in history** — forward delta only. Don't revert 29c42310 / 691e97f0 / 73442d59 / b707dc45 / b73ccad4 / b70e4a87.
3. **AV81 menu + print lock** — 11 files untouched (BackendArcBloom, SubTabBloom, DuoPill, Sidebar, MobileDrawer, CmdPalette, SalePrintView, QuotationPrintView, BulkPrintModal, DocumentPrintModal, documentPrintEngine).
4. **Q4-B customer-facing untouched** — PatientForm, PatientDashboard, ClinicSchedule stay zero-touch.
5. **AV83 universal** — all V86 alphas via `calc(<base> * var(--neon-intensity))` — NO bare alpha numerals outside the factor.
6. **No deploy** — commit + push only.

---

## File Structure (locked)

| File | Role | Touch type |
|---|---|---|
| `src/index.css` | Drop 8 `[data-section]` blocks; replace with single `:root` (red defaults + intensity); wrap all V86 alphas in `calc(<base> * var(--neon-intensity))` | MODIFY (~80 LOC net change) |
| `src/lib/systemConfigClient.js` | Add `V86_GLOW_DEFAULTS` const + `validateV86Glow` fn; include `v86Glow` in `saveSystemConfig` write path | MODIFY (~30 LOC added) |
| `src/hooks/useV86GlowApply.js` | NEW hook: reads `useSystemConfig`, applies CSS vars on mount + on change | CREATE (~40 LOC) |
| `src/App.jsx` (or top-level shell) | 1-line `useV86GlowApply()` call | MODIFY (1 line) |
| `src/components/backend/SystemSettingsTab.jsx` | Add 5th SectionCard "เอฟเฟกต์แสงเรือง" with color pickers + slider + live preview + Save/Reset/Cancel | MODIFY (~150 LOC added at end of sections) |
| `tests/v86-neon-glow-css.test.js` | Rewrite CG2 + CG3 (drop ArcBloom parity, lock red+intensity defaults); update CG8 to assert `calc()` wrapping | MODIFY |
| `tests/v86-followup-2-settings.test.jsx` | NEW: VS1-VS6 covering validator + hook + UI section | CREATE |
| `tests/e2e/v86-neon-glow-visual.spec.js` | Rewrite B1-B4 (assert RED instead of per-section); B8 NEW (live slider→CSS var) | MODIFY |
| `.claude/skills/audit-anti-vibe-code/SKILL.md` | Update AV83 wording (drop per-section ArcBloom parity, add universal red + intensity multiplier) | MODIFY |

---

## Task Map

| # | Task | Visible? |
|---|---|---|
| T1 | CSS pivot: :root red defaults + intensity multiplier + calc() wrapping all alphas | ✅ Cards turn red immediately |
| T2 | systemConfigClient validator + useV86GlowApply hook + App.jsx mount | ✅ Vars apply from system_config |
| T3 | SystemSettingsTab "เอฟเฟกต์แสงเรือง" section (admin UI) | ✅ Admin can tune |
| T4 | Tests batch + AV83 update | Tests green |
| T5 | Combined V86 v1 + followup-2 handoff (active.md + SESSION_HANDOFF + V-entry) | Final commit |

---

### Task 1: CSS pivot — universal red + intensity multiplier + calc() wrapping

**Files:**
- Modify: `src/index.css` lines ~3677-3871 (V86 block — drop 8 `[data-section]` blocks, rewrite `:root`, wrap all V86 alphas in `calc()`)

- [ ] **Step 1: Read current V86 block to confirm line range**

```bash
grep -n "V86 — Neon Cyberpunk Glow\|Reduced-motion override for auto-glow" src/index.css
```

Expected: line ~3678 (header) + line ~3856 (last `@media` block start). The V86 block spans 3677-3871 currently.

- [ ] **Step 2: Replace V86 block — drop per-section blocks + add intensity multiplier**

Use Edit tool to replace the entire V86 block (lines 3677 to end of file at line 3871). The new block:

```css
/* =====================================================================
   V86 — Neon Cyberpunk Glow (2026-05-18 EOD+10 + followup-2 pivot)
   FOLLOWUP-2 pivot: universal red dual-tone (c1=#dc2626 + c2=#ef4444)
   with --neon-intensity multiplier (default 0.45). Admin tunes via
   SystemSettingsTab "เอฟเฟกต์แสงเรือง" section, persisted to
   clinic_settings/system_config.v86Glow, applied via useV86GlowApply hook.
   Per-section [data-section] blocks DROPPED (universal color now).
   AV83 lock: utilities consume var(--neon-c1/c2) + var(--neon-intensity)
   via calc() — never hardcoded RGB or bare alphas outside the factor.
   AV81 lock: menu + print files MUST never reference .v86-glow-*.
   ===================================================================== */

/* --- Universal V86 vars (followup-2 defaults: red + 45% intensity) --- */
:root {
  --neon-c1: 220, 38, 38;       /* red-600 border + outer ring */
  --neon-c2: 239, 68, 68;       /* red-500 halo */
  --neon-intensity: 0.45;       /* alpha multiplier — 0.45 = 45% of V86 v1 baseline */
}

/* --- V86 base utility class --- */
.v86-glow-card {
  border: 1px solid rgba(var(--neon-c1), calc(0.40 * var(--neon-intensity)));
  box-shadow:
    0 0 0 1px rgba(var(--neon-c1), calc(0.08 * var(--neon-intensity))),
    0 0 14px rgba(var(--neon-c2), calc(0.45 * var(--neon-intensity))),
    0 0 32px rgba(var(--neon-c2), calc(0.20 * var(--neon-intensity)));
  animation: v86-breath 4s ease-in-out infinite;
  transition: transform 0.18s ease, box-shadow 0.25s ease, border-color 0.25s ease;
}

@keyframes v86-breath {
  0%, 100% {
    box-shadow:
      0 0 0 1px rgba(var(--neon-c1), calc(0.08 * var(--neon-intensity))),
      0 0 14px rgba(var(--neon-c2), calc(0.45 * var(--neon-intensity))),
      0 0 32px rgba(var(--neon-c2), calc(0.20 * var(--neon-intensity)));
  }
  50% {
    box-shadow:
      0 0 0 1px rgba(var(--neon-c1), calc(0.16 * var(--neon-intensity))),
      0 0 22px rgba(var(--neon-c2), calc(0.65 * var(--neon-intensity))),
      0 0 52px rgba(var(--neon-c2), calc(0.38 * var(--neon-intensity)));
  }
}

/* --- Hover boost (pause breath + lift + sharper glow) --- */
.v86-glow-card:hover {
  animation-play-state: paused;
  transform: translateY(-3px);
  border-color: rgba(var(--neon-c1), calc(0.65 * var(--neon-intensity)));
  box-shadow:
    0 0 0 1px rgba(var(--neon-c1), calc(0.20 * var(--neon-intensity))),
    0 0 28px rgba(var(--neon-c2), calc(0.85 * var(--neon-intensity))),
    0 0 64px rgba(var(--neon-c2), calc(0.50 * var(--neon-intensity)));
}

/* --- Reduced-motion fallback (no pulse, no lift transform) --- */
@media (prefers-reduced-motion: reduce) {
  .v86-glow-card {
    animation: none !important;
    transition: none !important;
  }
  .v86-glow-card:hover {
    transform: none !important;
  }
}

/* --- Light theme: deeper-saturation alphas for white-bg contrast --- */
[data-theme="light"] .v86-glow-card {
  border-color: rgba(var(--neon-c1), calc(0.55 * var(--neon-intensity)));
  box-shadow:
    0 0 0 1px rgba(var(--neon-c1), calc(0.10 * var(--neon-intensity))),
    0 0 12px rgba(var(--neon-c2), calc(0.30 * var(--neon-intensity))),
    0 0 28px rgba(var(--neon-c2), calc(0.15 * var(--neon-intensity)));
}
[data-theme="light"] .v86-glow-card:hover {
  border-color: rgba(var(--neon-c1), calc(0.85 * var(--neon-intensity)));
  box-shadow:
    0 0 0 1px rgba(var(--neon-c1), calc(0.25 * var(--neon-intensity))),
    0 0 22px rgba(var(--neon-c2), calc(0.55 * var(--neon-intensity))),
    0 0 50px rgba(var(--neon-c2), calc(0.30 * var(--neon-intensity)));
}
@keyframes v86-breath-light {
  0%, 100% {
    box-shadow:
      0 0 0 1px rgba(var(--neon-c1), calc(0.10 * var(--neon-intensity))),
      0 0 12px rgba(var(--neon-c2), calc(0.30 * var(--neon-intensity))),
      0 0 28px rgba(var(--neon-c2), calc(0.15 * var(--neon-intensity)));
  }
  50% {
    box-shadow:
      0 0 0 1px rgba(var(--neon-c1), calc(0.20 * var(--neon-intensity))),
      0 0 20px rgba(var(--neon-c2), calc(0.50 * var(--neon-intensity))),
      0 0 44px rgba(var(--neon-c2), calc(0.28 * var(--neon-intensity)));
  }
}
[data-theme="light"] .v86-glow-card {
  animation: v86-breath-light 4s ease-in-out infinite;
}

/* --- V86 auto-glow override (replaces V85 black-shadow auto-glow) ---
   Every card-shaped element inside [data-testid="backend-content"] or
   .admin-frontend-zone auto-receives V86 universal red glow. Menu overlays
   + subtab picker excluded by :not() chain (AV81 lock). Print views never
   reach these scopes.
*/
[data-backend-menu-mode="new"] [data-testid="backend-content"] [class*="rounded-2xl"]:not([data-testid="bloom-overlay"]):not([data-testid^="bloom-orb-"]):not([data-testid^="subtab-"]),
[data-backend-menu-mode="new"] [data-testid="backend-content"] [class*="rounded-xl"]:not([data-testid="bloom-overlay"]):not([data-testid^="bloom-orb-"]):not([data-testid^="subtab-"]),
.admin-frontend-zone [class*="rounded-2xl"],
.admin-frontend-zone [class*="rounded-xl"] {
  border: 1px solid rgba(var(--neon-c1), calc(0.40 * var(--neon-intensity)));
  box-shadow:
    0 0 0 1px rgba(var(--neon-c1), calc(0.08 * var(--neon-intensity))),
    0 0 14px rgba(var(--neon-c2), calc(0.45 * var(--neon-intensity))),
    0 0 32px rgba(var(--neon-c2), calc(0.20 * var(--neon-intensity)));
  animation: v86-breath 4s ease-in-out infinite;
  transition: transform 0.18s ease, box-shadow 0.25s ease, border-color 0.25s ease;
}

[data-backend-menu-mode="new"] [data-testid="backend-content"] [class*="rounded-2xl"]:hover,
[data-backend-menu-mode="new"] [data-testid="backend-content"] [class*="rounded-xl"]:hover,
.admin-frontend-zone [class*="rounded-2xl"]:hover,
.admin-frontend-zone [class*="rounded-xl"]:hover {
  animation-play-state: paused;
  transform: translateY(-3px);
  border-color: rgba(var(--neon-c1), calc(0.65 * var(--neon-intensity)));
  box-shadow:
    0 0 0 1px rgba(var(--neon-c1), calc(0.20 * var(--neon-intensity))),
    0 0 28px rgba(var(--neon-c2), calc(0.85 * var(--neon-intensity))),
    0 0 64px rgba(var(--neon-c2), calc(0.50 * var(--neon-intensity)));
}

/* Light theme auto-glow override */
[data-theme="light"] [data-backend-menu-mode="new"] [data-testid="backend-content"] [class*="rounded-2xl"],
[data-theme="light"] [data-backend-menu-mode="new"] [data-testid="backend-content"] [class*="rounded-xl"],
[data-theme="light"] .admin-frontend-zone [class*="rounded-2xl"],
[data-theme="light"] .admin-frontend-zone [class*="rounded-xl"] {
  border-color: rgba(var(--neon-c1), calc(0.55 * var(--neon-intensity)));
  box-shadow:
    0 0 0 1px rgba(var(--neon-c1), calc(0.10 * var(--neon-intensity))),
    0 0 12px rgba(var(--neon-c2), calc(0.30 * var(--neon-intensity))),
    0 0 28px rgba(var(--neon-c2), calc(0.15 * var(--neon-intensity)));
  animation: v86-breath-light 4s ease-in-out infinite;
}

/* Reduced-motion override for auto-glow */
@media (prefers-reduced-motion: reduce) {
  [data-backend-menu-mode="new"] [data-testid="backend-content"] [class*="rounded-2xl"],
  [data-backend-menu-mode="new"] [data-testid="backend-content"] [class*="rounded-xl"],
  .admin-frontend-zone [class*="rounded-2xl"],
  .admin-frontend-zone [class*="rounded-xl"] {
    animation: none !important;
    transition: none !important;
  }
  [data-backend-menu-mode="new"] [data-testid="backend-content"] [class*="rounded-2xl"]:hover,
  [data-backend-menu-mode="new"] [data-testid="backend-content"] [class*="rounded-xl"]:hover,
  .admin-frontend-zone [class*="rounded-2xl"]:hover,
  .admin-frontend-zone [class*="rounded-xl"]:hover {
    transform: none !important;
  }
}
```

- [ ] **Step 3: Build clean check**

```bash
npm run build 2>&1 | tail -5
```

Expected: clean. Pre-existing PLUGIN_TIMINGS + INEFFECTIVE_DYNAMIC_IMPORT warnings OK.

- [ ] **Step 4: Commit + push**

```bash
git add src/index.css
git commit -m "$(cat <<'EOF'
feat(V86-followup-2 T1): CSS pivot — universal red + intensity multiplier

Drops V86 v1's 8 per-section [data-section] CSS-vars blocks (dead code
under universal color per user pivot). Replaces with single :root block:
  --neon-c1: 220, 38, 38;   (red-600 border)
  --neon-c2: 239, 68, 68;   (red-500 halo)
  --neon-intensity: 0.45;   (default 45% of V86 v1 baseline alphas)

All V86 alphas wrapped in calc(<base> * var(--neon-intensity)) so the
intensity multiplier propagates via CSS cascade. Math: at intensity=0.45,
border 0.40 * 0.45 = 0.18; close halo 0.45 * 0.45 = 0.20; etc.

Structural preservation: .v86-glow-card + keyframes + reduced-motion +
light theme + auto-glow scope + hover boost all unchanged. data-section
JSX attributes stay (cosmetic, future-proof).

Cosmetic-shell ✓ — CSS values only. AV81 ✓ — no menu/print files touched.
V86 v1 commits preserved in history (forward delta, no revert).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin master
```

---

### Task 2: systemConfigClient validator + useV86GlowApply hook + App.jsx mount

**Files:**
- Modify: `src/lib/systemConfigClient.js` — add `V86_GLOW_DEFAULTS` + `validateV86Glow`; include `v86Glow` in `saveSystemConfig` write path
- Create: `src/hooks/useV86GlowApply.js` — NEW hook
- Modify: `src/App.jsx` — 1-line `useV86GlowApply()` call

- [ ] **Step 1: Add V86_GLOW_DEFAULTS + validateV86Glow to systemConfigClient.js**

Read `src/lib/systemConfigClient.js` to find the structure (saveSystemConfig, mergeSystemConfigDefaults, validateSystemConfigPatch). Add the V86 glow defaults + validator alongside existing constants/functions. Show the additions exactly:

```js
// V86-followup-2 (2026-05-18 EOD+10) — Universal red glow + intensity
// multiplier. Admin tunes via SystemSettingsTab "เอฟเฟกต์แสงเรือง" section.
export const V86_GLOW_DEFAULTS = Object.freeze({
  enabled: true,
  c1: '#dc2626',           // red-600 border
  c2: '#ef4444',           // red-500 halo
  intensityPercent: 45,    // 0-150 (% — 0=off, 100=full V86 v1 baseline, 150=brighter)
});

const V86_HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function validateV86Glow(patch) {
  const out = { ...V86_GLOW_DEFAULTS };
  if (typeof patch?.enabled === 'boolean') out.enabled = patch.enabled;
  if (typeof patch?.c1 === 'string' && V86_HEX_RE.test(patch.c1)) {
    out.c1 = patch.c1.toLowerCase();
  }
  if (typeof patch?.c2 === 'string' && V86_HEX_RE.test(patch.c2)) {
    out.c2 = patch.c2.toLowerCase();
  }
  if (Number.isFinite(patch?.intensityPercent)) {
    out.intensityPercent = Math.max(0, Math.min(150, Math.round(patch.intensityPercent)));
  }
  return out;
}
```

Then find the existing merge/save function (likely `mergeSystemConfigDefaults` or similar) and ensure `v86Glow` is merged from defaults if missing in the loaded doc. The merger should call `validateV86Glow(config?.v86Glow)`. Add inline near other field merges. If unclear, read the file's existing patterns first.

- [ ] **Step 2: Create src/hooks/useV86GlowApply.js**

```js
// V86-followup-2 (2026-05-18 EOD+10) — applies V86 glow CSS vars from
// system_config.v86Glow to document.documentElement on mount + change.
// Single mount point at App.jsx root. Falls back to V86_GLOW_DEFAULTS if
// system_config not yet loaded.

import { useEffect } from 'react';
import { useSystemConfig } from './useSystemConfig.js';
import { V86_GLOW_DEFAULTS } from '../lib/systemConfigClient.js';

function hexToRgbTriple(hex) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
}

export function useV86GlowApply() {
  const { config } = useSystemConfig();
  const v86 = { ...V86_GLOW_DEFAULTS, ...(config?.v86Glow || {}) };
  useEffect(() => {
    const root = document.documentElement;
    if (!v86.enabled) {
      // Disabled: zero out intensity (cards revert to no glow)
      root.style.setProperty('--neon-intensity', '0');
      return;
    }
    root.style.setProperty('--neon-c1', hexToRgbTriple(v86.c1));
    root.style.setProperty('--neon-c2', hexToRgbTriple(v86.c2));
    root.style.setProperty('--neon-intensity', String(v86.intensityPercent / 100));
  }, [v86.enabled, v86.c1, v86.c2, v86.intensityPercent]);
}
```

- [ ] **Step 3: Mount useV86GlowApply in App.jsx**

Read `src/App.jsx` to find the root component (likely a function `App`). Add 1-line hook call near other top-level hooks (e.g. next to `useTheme` or similar). Show exact addition:

```jsx
// At top of file, add import:
import { useV86GlowApply } from './hooks/useV86GlowApply.js';

// Inside App component body (near other hooks):
useV86GlowApply();  // V86-followup-2 — applies neon glow CSS vars from system_config
```

- [ ] **Step 4: Build clean check**

```bash
npm run build 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 5: Commit + push**

```bash
git add src/lib/systemConfigClient.js src/hooks/useV86GlowApply.js src/App.jsx
git commit -m "$(cat <<'EOF'
feat(V86-followup-2 T2): systemConfigClient validator + useV86GlowApply hook

src/lib/systemConfigClient.js:
- V86_GLOW_DEFAULTS const (red defaults + intensity 45%)
- validateV86Glow(patch) — hex regex validation + intensity clamp 0-150
- Merged into existing config load/save path (v86Glow field auto-validated)

src/hooks/useV86GlowApply.js NEW:
- Reads useSystemConfig().config.v86Glow
- Calls document.documentElement.style.setProperty for --neon-c1, --neon-c2,
  --neon-intensity
- useEffect re-applies on config change (live cascade)
- Disabled path zeros out --neon-intensity (cards revert to no glow)

src/App.jsx:
- 1-line useV86GlowApply() call near other top-level hooks
- Mounts the hook at app root for global cascade application

Cosmetic-shell ✓ — new hook is display-only metadata application;
no handler/state/prop change to existing flows. Live preview works
in SettingsTab (T3) because useSystemConfig re-fires onSnapshot.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin master
```

---

### Task 3: SystemSettingsTab "เอฟเฟกต์แสงเรือง" section

**Files:**
- Modify: `src/components/backend/SystemSettingsTab.jsx` — add 5th SectionCard after existing 4 sections

- [ ] **Step 1: Read SystemSettingsTab.jsx structure**

```bash
grep -n "SectionCard\|SaveButton\|saveSystemConfig" src/components/backend/SystemSettingsTab.jsx | head -20
```

Locate the pattern: existing SectionCard usage, SaveButton component, and the imports at top. The new section follows the same pattern.

- [ ] **Step 2: Add V86 glow section state + handlers**

In SystemSettingsTab function body, near other useState hooks for tab/defaults/feature-flags sections, add:

```jsx
// V86-followup-2 — Neon Glow section state
const [v86GlowLocal, setV86GlowLocal] = useState(() => ({ ...V86_GLOW_DEFAULTS, ...(config?.v86Glow || {}) }));
const [v86Saving, setV86Saving] = useState(false);
const [v86Success, setV86Success] = useState(false);

// Sync local state when remote config changes
useEffect(() => {
  setV86GlowLocal({ ...V86_GLOW_DEFAULTS, ...(config?.v86Glow || {}) });
}, [config?.v86Glow?.enabled, config?.v86Glow?.c1, config?.v86Glow?.c2, config?.v86Glow?.intensityPercent]);

// Apply local state live to CSS vars (preview)
useEffect(() => {
  const root = document.documentElement;
  if (!v86GlowLocal.enabled) {
    root.style.setProperty('--neon-intensity', '0');
    return;
  }
  const h2t = (hex) => {
    const x = hex.replace('#', '');
    return `${parseInt(x.slice(0,2),16)}, ${parseInt(x.slice(2,4),16)}, ${parseInt(x.slice(4,6),16)}`;
  };
  root.style.setProperty('--neon-c1', h2t(v86GlowLocal.c1));
  root.style.setProperty('--neon-c2', h2t(v86GlowLocal.c2));
  root.style.setProperty('--neon-intensity', String(v86GlowLocal.intensityPercent / 100));
}, [v86GlowLocal.enabled, v86GlowLocal.c1, v86GlowLocal.c2, v86GlowLocal.intensityPercent]);

const handleV86Save = useCallback(async () => {
  setV86Saving(true);
  setV86Success(false);
  try {
    await saveSystemConfig({ v86Glow: v86GlowLocal }, { uid: auth?.currentUser?.uid });
    setV86Success(true);
    setTimeout(() => setV86Success(false), 2000);
  } catch (e) {
    console.error('V86 glow save failed', e);
  } finally {
    setV86Saving(false);
  }
}, [v86GlowLocal]);

const handleV86Reset = useCallback(() => {
  setV86GlowLocal({ ...V86_GLOW_DEFAULTS });
}, []);

const handleV86Cancel = useCallback(() => {
  setV86GlowLocal({ ...V86_GLOW_DEFAULTS, ...(config?.v86Glow || {}) });
}, [config?.v86Glow]);
```

Add at top of file imports:

```jsx
import { V86_GLOW_DEFAULTS, saveSystemConfig } from '../../lib/systemConfigClient.js';
// (saveSystemConfig likely already imported; just ensure V86_GLOW_DEFAULTS is added)
```

- [ ] **Step 3: Add the 5th SectionCard JSX**

Insert AFTER the existing "Feature Flags" SectionCard, BEFORE the SystemConfigAuditPanel. Use existing `SectionCard` + `SaveButton` components from this file:

```jsx
<SectionCard
  icon={Sparkles}  /* lucide icon — add to imports if not already */
  title="เอฟเฟกต์แสงเรือง (Neon Glow)"
  subtitle="ตั้งค่าสีและความสว่างของเรืองทั่วระบบ — ใช้ทั้ง Frontend และ Backend"
>
  {/* Color section */}
  <div className="space-y-3 mb-4">
    <h4 className="text-sm font-bold text-[var(--tx-heading)]">สี (Color)</h4>

    <div className="flex flex-wrap items-center gap-3">
      <label className="text-xs text-[var(--tx-secondary)] min-w-[100px]">สีขอบ (border)</label>
      <input
        type="color"
        value={v86GlowLocal.c1}
        onChange={(e) => setV86GlowLocal(prev => ({ ...prev, c1: e.target.value.toLowerCase() }))}
        className="w-12 h-8 border border-[var(--bd)] rounded cursor-pointer bg-transparent"
        data-field="v86GlowC1"
      />
      <input
        type="text"
        value={v86GlowLocal.c1}
        onChange={(e) => {
          const v = e.target.value;
          if (/^#[0-9a-fA-F]{6}$/.test(v)) {
            setV86GlowLocal(prev => ({ ...prev, c1: v.toLowerCase() }));
          } else {
            setV86GlowLocal(prev => ({ ...prev, c1: v }));  // allow typing in progress
          }
        }}
        className="bg-[var(--bg-card)] border border-[var(--bd)] rounded px-2 py-1 text-xs font-mono w-24"
        maxLength={7}
      />
      <div className="flex gap-1.5">
        {['#dc2626', '#3b82f6', '#10b981', '#a855f7'].map(p => (
          <button
            key={p}
            type="button"
            onClick={() => setV86GlowLocal(prev => ({ ...prev, c1: p }))}
            className="w-7 h-7 rounded-full border border-[var(--bd)] cursor-pointer transition hover:scale-110"
            style={{ background: p }}
            title={p}
          />
        ))}
      </div>
    </div>

    <div className="flex flex-wrap items-center gap-3">
      <label className="text-xs text-[var(--tx-secondary)] min-w-[100px]">สี halo (glow)</label>
      <input
        type="color"
        value={v86GlowLocal.c2}
        onChange={(e) => setV86GlowLocal(prev => ({ ...prev, c2: e.target.value.toLowerCase() }))}
        className="w-12 h-8 border border-[var(--bd)] rounded cursor-pointer bg-transparent"
        data-field="v86GlowC2"
      />
      <input
        type="text"
        value={v86GlowLocal.c2}
        onChange={(e) => {
          const v = e.target.value;
          if (/^#[0-9a-fA-F]{6}$/.test(v)) {
            setV86GlowLocal(prev => ({ ...prev, c2: v.toLowerCase() }));
          } else {
            setV86GlowLocal(prev => ({ ...prev, c2: v }));
          }
        }}
        className="bg-[var(--bg-card)] border border-[var(--bd)] rounded px-2 py-1 text-xs font-mono w-24"
        maxLength={7}
      />
      <div className="flex gap-1.5">
        {['#ef4444', '#06b6d4', '#22c55e', '#ec4899'].map(p => (
          <button
            key={p}
            type="button"
            onClick={() => setV86GlowLocal(prev => ({ ...prev, c2: p }))}
            className="w-7 h-7 rounded-full border border-[var(--bd)] cursor-pointer transition hover:scale-110"
            style={{ background: p }}
            title={p}
          />
        ))}
      </div>
    </div>
  </div>

  {/* Intensity slider */}
  <div className="space-y-3 mb-4 pt-4 border-t border-[var(--bd)]">
    <h4 className="text-sm font-bold text-[var(--tx-heading)]">ความสว่าง (Intensity)</h4>
    <div className="flex items-center gap-3">
      <label className="text-xs text-[var(--tx-secondary)] min-w-[100px]">ระดับ</label>
      <input
        type="range"
        min={0}
        max={150}
        step={5}
        value={v86GlowLocal.intensityPercent}
        onChange={(e) => setV86GlowLocal(prev => ({ ...prev, intensityPercent: Number(e.target.value) }))}
        className="flex-1 accent-rose-500"
        data-field="v86GlowIntensity"
      />
      <span className="text-xs font-mono text-[var(--tx-primary)] min-w-[48px] text-right">{v86GlowLocal.intensityPercent}%</span>
    </div>
  </div>

  {/* Enabled toggle */}
  <div className="space-y-3 mb-4 pt-4 border-t border-[var(--bd)]">
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={v86GlowLocal.enabled}
        onChange={(e) => setV86GlowLocal(prev => ({ ...prev, enabled: e.target.checked }))}
        className="w-4 h-4 accent-rose-500"
        data-field="v86GlowEnabled"
      />
      <span className="text-sm text-[var(--tx-secondary)]">เปิดเอฟเฟกต์แสงเรือง (ปิดเพื่อกลับไปดูแบบ V85)</span>
    </label>
  </div>

  {/* Live preview */}
  <div className="pt-4 border-t border-[var(--bd)]">
    <h4 className="text-sm font-bold text-[var(--tx-heading)] mb-2">ตัวอย่าง Live Preview</h4>
    <div className="v86-glow-card bg-[var(--bg-card)] rounded-xl p-4">
      <div className="text-sm font-bold mb-1">ตัวอย่างการ์ด</div>
      <div className="text-xs text-[var(--tx-muted)]">เลื่อน slider / เปลี่ยนสี เพื่อดูผลแบบ live</div>
    </div>
  </div>

  {/* Action buttons */}
  <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-[var(--bd)]">
    <SaveButton onClick={handleV86Save} saving={v86Saving} success={v86Success} />
    <button
      type="button"
      onClick={handleV86Reset}
      className="px-4 py-2 rounded-lg text-xs font-bold bg-[var(--bg-hover)] hover:bg-[var(--bg-hover)] text-[var(--tx-secondary)] border border-[var(--bd)] transition"
    >
      รีเซ็ตเป็นค่าเริ่มต้น
    </button>
    <button
      type="button"
      onClick={handleV86Cancel}
      className="px-4 py-2 rounded-lg text-xs font-bold bg-[var(--bg-hover)] hover:bg-[var(--bg-hover)] text-[var(--tx-muted)] border border-[var(--bd)] transition"
    >
      ยกเลิก
    </button>
  </div>
</SectionCard>
```

Add `Sparkles` to lucide imports at top of file if missing:

```jsx
import { Settings, Save, AlertTriangle, RefreshCw, ShieldCheck, Eye, EyeOff,
         Loader2, CheckCircle2, X, Plus, AlertCircle, CalendarDays, Activity,
         Sparkles } from 'lucide-react';
```

- [ ] **Step 4: Build clean check + verify in browser**

```bash
npm run build 2>&1 | tail -5
```

Expected: clean.

Then in browser at `http://localhost:5173/?backend=1&tab=system-settings`:
- Verify new "เอฟเฟกต์แสงเรือง" section renders at the bottom
- Drag intensity slider → cards across the page update LIVE (no save needed)
- Pick a preset color → live update
- Click "บันทึก" → success badge appears + Firestore writes
- Click "รีเซ็ต" → local state returns to defaults (no save until click บันทึก)
- Click "ยกเลิก" → local state returns to last-saved values

- [ ] **Step 5: Commit + push**

```bash
git add src/components/backend/SystemSettingsTab.jsx
git commit -m "$(cat <<'EOF'
feat(V86-followup-2 T3): SystemSettingsTab "เอฟเฟกต์แสงเรือง" section

NEW 5th SectionCard after existing 4 (TabOverrides, Defaults, FeatureFlags,
AuditViewer) — admin tunes V86 neon glow:

- 2 color pickers (c1 border + c2 halo) + hex text inputs + 4 preset dots each
- 1 intensity slider 0-150% (default 45 per Q1=C)
- 1 enabled toggle (off → cards revert to no glow)
- Live preview card (uses .v86-glow-card utility — reflects local state via CSS)
- Save / Reset / Cancel buttons (Save persists + audit; Reset → defaults
  without save; Cancel → revert to last saved)

Local-state useEffect mirrors useV86GlowApply (from T2) so admin sees
LIVE preview on every slider drag / color change BEFORE saving.

On save: saveSystemConfig({v86Glow: validated}) — validator clamps
intensity 0-150 + validates hex regex. Audit doc emitted per existing
system_config save pipeline.

Cosmetic-shell ✓ — new section appended to existing tab via existing
SectionCard component; no handler/state/prop change to other sections.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin master
```

---

### Task 4: Tests batch + AV83 update

**Files:**
- Modify: `tests/v86-neon-glow-css.test.js` — rewrite CG2 + CG3 + CG8
- Create: `tests/v86-followup-2-settings.test.jsx` — NEW VS1-VS6
- Modify: `tests/e2e/v86-neon-glow-visual.spec.js` — rewrite B1-B4, add B8
- Modify: `.claude/skills/audit-anti-vibe-code/SKILL.md` — update AV83 wording

- [ ] **Step 1: Rewrite tests/v86-neon-glow-css.test.js CG2 + CG3 + CG8**

Use Edit tool to replace these specific blocks:

**CG2 (was: 8 [data-section] blocks)** — replace with:
```js
  describe('CG2 — :root has --neon-c1, --neon-c2, --neon-intensity (V86-followup-2 universal)', () => {
    it('CG2.1 — :root block in V86 area defines --neon-c1 = 220, 38, 38 (red-600)', () => {
      const block = v86Block();
      expect(block).toMatch(/:root[^{]*\{[^}]*--neon-c1:\s*220,\s*38,\s*38/);
    });
    it('CG2.2 — :root defines --neon-c2 = 239, 68, 68 (red-500)', () => {
      const block = v86Block();
      expect(block).toMatch(/:root[^{]*\{[^}]*--neon-c2:\s*239,\s*68,\s*68/);
    });
    it('CG2.3 — :root defines --neon-intensity = 0.45 (Q1=C default)', () => {
      const block = v86Block();
      expect(block).toMatch(/:root[^{]*\{[^}]*--neon-intensity:\s*0\.45/);
    });
  });
```

**CG3 (was: ArcBloom parity)** — replace with:
```js
  describe('CG3 — Per-section [data-section] blocks DROPPED (V86-followup-2 universal)', () => {
    const droppedSections = ['appointments-section', 'customers', 'sales', 'marketing', 'stock', 'finance', 'reports', 'master'];
    droppedSections.forEach((sec) => {
      it(`CG3 — [data-section="${sec}"] block NOT defined in V86 area (universal color now)`, () => {
        const block = v86Block();
        // Section may appear in selectors (e.g. data-section attr usage in T4 JSX wrappers) but
        // MUST NOT have its own --neon-c1/c2 declaration block in V86 area
        const re = new RegExp(`\\[data-section="${sec}"\\][^{]*\\{[^}]*--neon-c1`);
        expect(block).not.toMatch(re);
      });
    });
  });
```

**CG8.1 + CG8.2 + CG8.3** — replace `var(--neon-c[12])` assertion to require `calc(... * var(--neon-intensity))`:
```js
  describe('CG8 — V86 rules wrap alphas in calc() with var(--neon-intensity) (AV83)', () => {
    it('CG8.1 — .v86-glow-card alphas wrap calc(<num> * var(--neon-intensity))', () => {
      const block = v86Block();
      const re = /\.v86-glow-card[^{]*\{([^}]+)\}/g;
      let m;
      let foundAny = false;
      while ((m = re.exec(block))) {
        foundAny = true;
        const body = m[1];
        if (body.match(/rgba?\(/)) {
          // Every rgba(...) must use var(--neon-c*) AND wrap alpha in calc()
          expect(body, `.v86-glow-card body uses var(--neon-c*): ${body.slice(0, 80)}`).toMatch(/var\(--neon-c[12]\)/);
          expect(body, `.v86-glow-card body wraps alpha in calc(...var(--neon-intensity)): ${body.slice(0, 80)}`).toMatch(/calc\([\d.]+\s*\*\s*var\(--neon-intensity\)\)/);
        }
      }
      expect(foundAny, '.v86-glow-card rules should exist').toBe(true);
    });

    it('CG8.2 — V86 auto-glow rules at [data-testid="backend-content"] wrap alphas in calc()', () => {
      const block = v86Block();
      const autoGlowSection = block.indexOf('data-testid="backend-content"') >= 0
        ? block.slice(block.indexOf('data-testid="backend-content"'))
        : '';
      expect(autoGlowSection.length).toBeGreaterThan(0);
      expect(autoGlowSection).toMatch(/var\(--neon-c1\)/);
      expect(autoGlowSection).toMatch(/var\(--neon-c2\)/);
      expect(autoGlowSection).toMatch(/calc\([\d.]+\s*\*\s*var\(--neon-intensity\)\)/);
    });

    it('CG8.3 — admin-frontend-zone auto-glow rules wrap alphas in calc()', () => {
      const block = v86Block();
      const adminSection = block.indexOf('admin-frontend-zone') >= 0
        ? block.slice(block.indexOf('admin-frontend-zone'))
        : '';
      expect(adminSection.length).toBeGreaterThan(0);
      expect(adminSection).toMatch(/var\(--neon-c1\)/);
      expect(adminSection).toMatch(/var\(--neon-c2\)/);
      expect(adminSection).toMatch(/calc\([\d.]+\s*\*\s*var\(--neon-intensity\)\)/);
    });

    it('CG8.4 — NO bare alphas outside calc() factor (e.g. rgba(var(--neon-c1), 0.4))', () => {
      const block = v86Block();
      // Find any rgba(var(--neon-cX), <bareNumeral>) that's NOT inside calc()
      // Allow rgba(var(--neon-cX), calc(<num> * var(--neon-intensity)))
      const badPattern = /rgba\(var\(--neon-c[12]\),\s*0\.\d+\s*\)/;
      expect(block, 'V86 block should NOT have bare alphas (must wrap in calc())').not.toMatch(badPattern);
    });
  });
```

- [ ] **Step 2: Create tests/v86-followup-2-settings.test.jsx**

```jsx
// V86-followup-2 Settings UI tests (VS1-VS6)
//
// VS1: validateV86Glow accepts valid; rejects invalid hex; clamps intensity
// VS2: useV86GlowApply sets CSS vars on mount + on config change
// VS3: SystemSettingsTab renders "เอฟเฟกต์แสงเรือง" section with all controls
// VS4: Live preview card uses local state (not saved)
// VS5: Save calls saveSystemConfig with validated patch
// VS6: Reset restores defaults without saving; Cancel restores last-saved

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, render, screen, fireEvent } from '@testing-library/react';
import { V86_GLOW_DEFAULTS, validateV86Glow } from '../src/lib/systemConfigClient.js';

describe('V86-followup-2 — Settings UI + validator + hook', () => {
  describe('VS1 — validateV86Glow', () => {
    it('VS1.1 accepts valid input', () => {
      const out = validateV86Glow({ enabled: true, c1: '#dc2626', c2: '#ef4444', intensityPercent: 45 });
      expect(out).toEqual({ enabled: true, c1: '#dc2626', c2: '#ef4444', intensityPercent: 45 });
    });
    it('VS1.2 returns defaults for empty patch', () => {
      expect(validateV86Glow({})).toEqual({ ...V86_GLOW_DEFAULTS });
      expect(validateV86Glow(null)).toEqual({ ...V86_GLOW_DEFAULTS });
      expect(validateV86Glow(undefined)).toEqual({ ...V86_GLOW_DEFAULTS });
    });
    it('VS1.3 rejects invalid hex', () => {
      const out = validateV86Glow({ c1: 'not-a-hex', c2: '#zzz' });
      expect(out.c1).toBe(V86_GLOW_DEFAULTS.c1);
      expect(out.c2).toBe(V86_GLOW_DEFAULTS.c2);
    });
    it('VS1.4 clamps intensity 0-150', () => {
      expect(validateV86Glow({ intensityPercent: -10 }).intensityPercent).toBe(0);
      expect(validateV86Glow({ intensityPercent: 200 }).intensityPercent).toBe(150);
      expect(validateV86Glow({ intensityPercent: 75 }).intensityPercent).toBe(75);
    });
    it('VS1.5 normalizes hex to lowercase', () => {
      expect(validateV86Glow({ c1: '#DC2626' }).c1).toBe('#dc2626');
    });
    it('VS1.6 enabled defaults to true', () => {
      expect(validateV86Glow({}).enabled).toBe(true);
      expect(validateV86Glow({ enabled: false }).enabled).toBe(false);
    });
  });

  describe('VS2 — useV86GlowApply', () => {
    let originalSetProp;
    beforeEach(() => {
      originalSetProp = document.documentElement.style.setProperty;
      document.documentElement.style.setProperty = vi.fn();
    });
    afterEach(() => {
      document.documentElement.style.setProperty = originalSetProp;
    });

    it('VS2.1 sets --neon-c1, --neon-c2, --neon-intensity from defaults when config absent', async () => {
      vi.doMock('../src/hooks/useSystemConfig.js', () => ({
        useSystemConfig: () => ({ config: null }),
      }));
      const { useV86GlowApply } = await import('../src/hooks/useV86GlowApply.js');
      renderHook(() => useV86GlowApply());
      const setProp = document.documentElement.style.setProperty;
      expect(setProp).toHaveBeenCalledWith('--neon-c1', '220, 38, 38');
      expect(setProp).toHaveBeenCalledWith('--neon-c2', '239, 68, 68');
      expect(setProp).toHaveBeenCalledWith('--neon-intensity', '0.45');
    });

    it('VS2.2 zeros intensity when disabled', async () => {
      vi.doMock('../src/hooks/useSystemConfig.js', () => ({
        useSystemConfig: () => ({ config: { v86Glow: { enabled: false } } }),
      }));
      vi.resetModules();
      const { useV86GlowApply } = await import('../src/hooks/useV86GlowApply.js');
      renderHook(() => useV86GlowApply());
      const setProp = document.documentElement.style.setProperty;
      expect(setProp).toHaveBeenCalledWith('--neon-intensity', '0');
    });
  });

  describe('VS3 — SystemSettingsTab section render', () => {
    it('VS3.1 — source contains 5th section title "เอฟเฟกต์แสงเรือง"', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const __filename = fileURLToPath(import.meta.url);
      const ROOT = path.resolve(path.dirname(__filename), '..');
      const src = fs.readFileSync(path.join(ROOT, 'src/components/backend/SystemSettingsTab.jsx'), 'utf-8');
      expect(src).toMatch(/เอฟเฟกต์แสงเรือง/);
      expect(src).toMatch(/V86_GLOW_DEFAULTS/);
      expect(src).toMatch(/data-field="v86GlowC1"/);
      expect(src).toMatch(/data-field="v86GlowC2"/);
      expect(src).toMatch(/data-field="v86GlowIntensity"/);
      expect(src).toMatch(/data-field="v86GlowEnabled"/);
    });
    it('VS3.2 — handleV86Save + handleV86Reset + handleV86Cancel handlers defined', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const __filename = fileURLToPath(import.meta.url);
      const ROOT = path.resolve(path.dirname(__filename), '..');
      const src = fs.readFileSync(path.join(ROOT, 'src/components/backend/SystemSettingsTab.jsx'), 'utf-8');
      expect(src).toMatch(/handleV86Save\s*=/);
      expect(src).toMatch(/handleV86Reset\s*=/);
      expect(src).toMatch(/handleV86Cancel\s*=/);
    });
    it('VS3.3 — 4 c1 preset colors + 4 c2 preset colors', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const __filename = fileURLToPath(import.meta.url);
      const ROOT = path.resolve(path.dirname(__filename), '..');
      const src = fs.readFileSync(path.join(ROOT, 'src/components/backend/SystemSettingsTab.jsx'), 'utf-8');
      // c1 presets
      expect(src).toMatch(/'#dc2626'.*'#3b82f6'.*'#10b981'.*'#a855f7'/s);
      // c2 presets
      expect(src).toMatch(/'#ef4444'.*'#06b6d4'.*'#22c55e'.*'#ec4899'/s);
    });
  });

  describe('VS4-VS6 — Live preview + Save/Reset/Cancel semantics', () => {
    it('VS4 — preview card uses .v86-glow-card class', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const __filename = fileURLToPath(import.meta.url);
      const ROOT = path.resolve(path.dirname(__filename), '..');
      const src = fs.readFileSync(path.join(ROOT, 'src/components/backend/SystemSettingsTab.jsx'), 'utf-8');
      expect(src).toMatch(/v86-glow-card/);
    });
    it('VS5 — handleV86Save calls saveSystemConfig with {v86Glow: ...}', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const __filename = fileURLToPath(import.meta.url);
      const ROOT = path.resolve(path.dirname(__filename), '..');
      const src = fs.readFileSync(path.join(ROOT, 'src/components/backend/SystemSettingsTab.jsx'), 'utf-8');
      const sliceMatch = src.match(/handleV86Save[\s\S]*?\]\)/);
      expect(sliceMatch).toBeTruthy();
      expect(sliceMatch[0]).toMatch(/saveSystemConfig\s*\(\s*\{\s*v86Glow/);
    });
    it('VS6 — handleV86Reset uses V86_GLOW_DEFAULTS spread', async () => {
      const fs = await import('node:fs');
      const path = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const __filename = fileURLToPath(import.meta.url);
      const ROOT = path.resolve(path.dirname(__filename), '..');
      const src = fs.readFileSync(path.join(ROOT, 'src/components/backend/SystemSettingsTab.jsx'), 'utf-8');
      expect(src).toMatch(/handleV86Reset[\s\S]*?\{\s*\.\.\.V86_GLOW_DEFAULTS/);
    });
  });
});
```

- [ ] **Step 3: Update tests/e2e/v86-neon-glow-visual.spec.js B1-B4 to assert RED + add B8**

Replace B1-B4 RGB assertions from per-section colors to red RGB. Update the locator-comments. B1 example:

```js
test('B1 — backend customers tab shows RED glow (universal V86-followup-2)', async ({ page }) => {
  await page.goto(`${APP_URL}/?backend=1&tab=customer-list`);
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('[data-testid="backend-content"]', { timeout: 10000 });

  const card = page.locator('[data-testid="backend-content"] [class*="rounded-2xl"], [data-testid="backend-content"] [class*="rounded-xl"]').first();
  await card.waitFor({ state: 'visible', timeout: 5000 });
  const border = await card.evaluate((el) => getComputedStyle(el).borderColor);
  const boxShadow = await card.evaluate((el) => getComputedStyle(el).boxShadow);

  // V86-followup-2: c1 = rgb(220, 38, 38) red-600 border, c2 = rgb(239, 68, 68) red-500 halo
  expect(border).toMatch(/rgba?\(220,\s*38,\s*38/);
  expect(boxShadow).toMatch(/rgba?\(239,\s*68,\s*68/);
});
```

Do the same for B2, B3, B4 (all assert RED RGB, drop per-section RGB expectations).

Add B8:

```js
test('B8 — Settings UI live slider updates --neon-intensity CSS var', async ({ page }) => {
  await page.goto(`${APP_URL}/?backend=1&tab=system-settings`);
  await page.waitForLoadState('networkidle');
  await page.waitForSelector('[data-field="v86GlowIntensity"]', { timeout: 10000 });

  // Initial intensity (could be saved value or default)
  const before = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--neon-intensity').trim());

  // Drag slider to 80%
  const slider = page.locator('[data-field="v86GlowIntensity"]');
  await slider.fill('80');
  await page.waitForTimeout(200);

  const after = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--neon-intensity').trim());

  expect(after).toBe('0.8');
  expect(after).not.toBe(before);
});
```

- [ ] **Step 4: Update AV83 wording in SKILL.md**

Find current AV83 entry in `.claude/skills/audit-anti-vibe-code/SKILL.md` and replace with the new V86-followup-2 wording (per spec § 8). The new entry text:

```markdown
### AV83 — V86 Neon Glow consumes CSS vars (universal red, admin-tunable) (2026-05-18 EOD+10 V86-followup-2)
**Why**: V86-followup-2 pivot — drop per-section dual-tone (V86 v1 design), use universal red (c1=#dc2626 border + c2=#ef4444 halo) with intensity multiplier (--neon-intensity, default 0.45). Admin tunes via SystemSettingsTab "เอฟเฟกต์แสงเรือง" section, persisted to clinic_settings/system_config.v86Glow.
**Grep**:
- `.v86-glow-` rules + V86 auto-glow rules in `src/index.css` MUST reference `var(--neon-c1)` / `var(--neon-c2)` / `var(--neon-intensity)` for color + alpha — NO hardcoded RGB, NO bare alphas outside `calc(<base> * var(--neon-intensity))` factor.
- `:root` MUST define all 3 vars with V86-followup-2 defaults: `--neon-c1: 220, 38, 38;` + `--neon-c2: 239, 68, 68;` + `--neon-intensity: 0.45;`.
- `useV86GlowApply` hook is the ONLY sanctioned consumer that calls `document.documentElement.style.setProperty('--neon-c1' | '--neon-c2' | '--neon-intensity', ...)` (SystemSettingsTab also calls these for live preview — sanctioned).
- Menu files (BackendArcBloom + BackendSubTabBloom + BackendDuoPill + BackendSidebar + BackendMobileDrawer + BackendCmdPalette) MUST contain ZERO `v86-glow-` references.
- Print files (SalePrintView + QuotationPrintView + BulkPrintModal + DocumentPrintModal + documentPrintEngine) MUST contain ZERO `v86-glow-` references.
- Customer-facing files (PatientForm + PatientDashboard + ClinicSchedule) MUST contain ZERO `v86-glow-` + ZERO `data-section` + ZERO `admin-frontend-zone` references.
**Fix**: V86 rules with hardcoded section RGB → consume `var(--neon-c1/c2)`. Alphas → wrap in `calc(<base> * var(--neon-intensity))`. Settings UI changes → flow through `validateV86Glow` → `saveSystemConfig` → `useV86GlowApply`. Source-grep regression: `tests/v86-neon-glow-css.test.js` CG1-CG8 + `tests/v86-followup-2-settings.test.jsx` VS1-VS6.
```

- [ ] **Step 5: Run targeted vitest**

```bash
npx vitest run tests/v86-neon-glow-css.test.js tests/v86-followup-2-settings.test.jsx --reporter=default 2>&1 | tail -15
```

Expected: all CG1-CG8 (post-rewrite) + VS1-VS6 PASS. If any fails, investigate + fix CSS/source/test as appropriate.

- [ ] **Step 6: Commit + push**

```bash
git add tests/v86-neon-glow-css.test.js tests/v86-followup-2-settings.test.jsx tests/e2e/v86-neon-glow-visual.spec.js .claude/skills/audit-anti-vibe-code/SKILL.md
git commit -m "$(cat <<'EOF'
test(V86-followup-2 T4): rewrite Phase A CG2/CG3/CG8 + NEW VS1-VS6 + B8 + AV83

tests/v86-neon-glow-css.test.js:
- CG2 REWRITTEN — assert :root has --neon-c1=220,38,38 + --neon-c2=239,68,68 +
  --neon-intensity=0.45 (drop ArcBloom 8-section parity)
- CG3 REWRITTEN — assert per-section [data-section] blocks DROPPED (universal
  color now); 8 sections each have NO --neon-c1 declaration block
- CG8 UPDATED — assert all V86 alphas wrap in calc(<num> * var(--neon-intensity))
  + CG8.4 NEW catches bare alphas outside calc() factor (AV83 lock)

tests/v86-followup-2-settings.test.jsx NEW — 18+ assertions across VS1-VS6:
- VS1: validateV86Glow accepts valid/rejects invalid hex/clamps 0-150/normalizes
- VS2: useV86GlowApply sets CSS vars on mount + zeros on disabled
- VS3: SystemSettingsTab source-grep — section title + handlers + presets + data-fields
- VS4: preview card uses .v86-glow-card class
- VS5: handleV86Save calls saveSystemConfig({v86Glow: ...})
- VS6: handleV86Reset uses V86_GLOW_DEFAULTS spread

tests/e2e/v86-neon-glow-visual.spec.js:
- B1-B4 REWRITTEN — assert RED RGB (220,38,38 border + 239,68,68 halo) instead
  of per-section colors. Section selector now uses just [data-testid="backend-content"]
  without [data-section=X] qualifier (universal).
- B8 NEW — open SystemSettings, drag intensity slider to 80%, assert
  document.documentElement --neon-intensity = '0.8' (live cascade)

.claude/skills/audit-anti-vibe-code/SKILL.md AV83 UPDATED:
- Drop "per-section ArcBloom parity" wording
- Add universal red default + intensity multiplier + calc() requirement +
  useV86GlowApply sanctioned consumer note + SystemSettingsTab sanctioned for
  live preview setProperty calls

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin master
```

---

### Task 5: Combined V86 v1 + followup-2 handoff

**Files:**
- Modify: `.agents/active.md` — YAML frontmatter + state bullets
- Modify: `SESSION_HANDOFF.md` — new EOD+10 session block above EOD+9
- Modify: `.claude/rules/00-session-start.md` — add V86 V-entry at top of § 2 (combined V86 v1 + followup-2)

- [ ] **Step 1: Run full vitest baseline**

```bash
npx vitest run --reporter=default 2>&1 | tail -10
```

Expected: PASS count includes the new VS1-VS6 assertions (~18 added) + the updated CG2/CG3/CG8 assertions. Pre-existing 3F is acceptable.

- [ ] **Step 2: Build clean check**

```bash
npm run build 2>&1 | tail -5
```

Expected: clean.

- [ ] **Step 3: Update .agents/active.md**

Read first to confirm current state, then Edit YAML frontmatter:

```yaml
---
updated_at: "2026-05-18 EOD+10 — V86 v1 + followup-2 shipped (universal red + dimmer + admin-tunable Settings UI)"
status: "30+ commits ahead of prod · awaiting deploy verb · V86 ready (Phase A 50+ vitest + Phase B 8 Playwright skip-graceful + Phase C manual L1 + Settings UI live)"
branch: "master"
last_commit: "<T5_SHA> docs(V86-followup-2 T5): combined V86 v1 + followup-2 handoff"
tests: "Phase A CG1-CG8 (rewritten for universal red + calc multiplier) + VS1-VS6 (validator + hook + SettingsTab) + Phase B B1-B4 + B8 NEW · build clean"
production_url: "https://lover-clinic-app.vercel.app"
production_commit: "ef4bd5c3 LIVE (V84 + V85 + AV82 + V86 v1 + V86-followup-2 stack NOT deployed)"
firestore_rules_version: "unchanged"
---
```

Add to TOP of "What this session shipped":

```markdown
- **V86-followup-2 Universal Red Glow + Settings UI** (commits 27f39864 → <T5_SHA>) — pivot V86 v1 from per-section dual-tone to universal RED (c1=#dc2626 + c2=#ef4444) with --neon-intensity multiplier (default 0.45 = 45% of V86 v1 alphas). Drop 8 per-section [data-section] blocks (dead under universal). All V86 alphas wrap in `calc(<base> * var(--neon-intensity))`. NEW useV86GlowApply hook + NEW SystemSettingsTab 5th section "เอฟเฟกต์แสงเรือง" — 2 color pickers + 4 presets each + intensity slider 0-150% + enabled toggle + live preview + Save/Reset/Cancel. Persists to clinic_settings/system_config.v86Glow + audit doc. AV83 updated. 18 new vitest VS1-VS6 + B8 Playwright + CG2/CG3/CG8 rewritten.
```

- [ ] **Step 4: Update SESSION_HANDOFF.md**

Read top of file, insert new session block above EOD+9 entry:

```markdown
### Session 2026-05-18 EOD+10 — V86 v1 shipped + V86-followup-2 pivot (universal red + admin-tunable Settings UI)

V86 v1 (7-task subagent-driven) shipped per-section dual-tone neon glow (8 ArcBloom SECTION_COLOR pairs + 4s breath + hover + light + reduced-motion + AV81 menu/print lock). Commits 29c42310 → b73ccad4. Phase A vitest 47/47 + Phase B Playwright 7 scenarios skip-graceful.

Mid-T7 USER PIVOT: "เปลี่ยนจากเรืองสีฟ้าเป็นเรืองสีแดง แล้วลดความสว่างลดหน่อย ทั้ง Front และ Backend ทุกที่ ... ถ้าทำเมนูให้ตั้งได้ใน tab ตั้งค่ายิ่งดี เพราะมันน่าจะเป็นค่า universal ที่แก้จุดเดียวได้อยู่นะ". Brainstormed Q1=C (Dim Red 45% intensity) + Q2=approved Settings UI scope via Visual Companion `public/v86-followup-2-red-glow-design.html`.

V86-followup-2 (5-task subagent-driven) lands as forward delta:
- T1: CSS pivot — drop 8 [data-section] blocks; single :root with red defaults + --neon-intensity 0.45; all V86 alphas wrap in calc(<base> * var(--neon-intensity)) so slider multiplier propagates via cascade
- T2: systemConfigClient.V86_GLOW_DEFAULTS + validateV86Glow + NEW useV86GlowApply hook + App.jsx 1-line mount
- T3: SystemSettingsTab 5th SectionCard "เอฟเฟกต์แสงเรือง" — 2 color pickers (border + halo) + 4 preset dots each + hex inputs + intensity slider 0-150% + enabled toggle + live preview card + Save/Reset/Cancel
- T4: CG2/CG3/CG8 rewrite (drop ArcBloom parity, lock red + calc) + NEW VS1-VS6 tests + Playwright B1-B4 rewrite + B8 NEW + AV83 wording update
- T5: this handoff

AV81 menu+print + Q4-B customer-facing zero-touch preserved through both V86 v1 + followup-2. AV83 wording updated. V86 v1 commits stay in history (forward delta).

NO DEPLOY this session per V18. V86 v1 + followup-2 joins existing combined queue. Post-deploy: Rule Q L1 user hands-on for all 8 backend tabs + AdminDashboard frontend + Settings UI interaction + dark/light + reduced-motion.

**Checkpoint**: spec/plan files at `docs/superpowers/{specs,plans}/2026-05-18-v86-neon-glow*.md` + `2026-05-18-v86-followup-2-*.md`. Mockups at `public/v86-neon-glow-variants.html` + `public/v86-followup-2-red-glow-design.html`.
```

- [ ] **Step 5: Add combined V86 V-entry to .claude/rules/00-session-start.md § 2**

Find top of V-entries table:
```bash
grep -n "| V85\b\|| V84\b" .claude/rules/00-session-start.md
```

Insert combined entry at TOP:

```markdown
| V86 + followup-2 | 2026-05-18 EOD+10 | **Neon Cyberpunk Glow shipped + mid-T7 pivot to universal red + admin-tunable Settings UI (12-task subagent-driven across 2 specs)** — V86 v1 (per-section dual-tone neon, 8 ArcBloom SECTION_COLOR pairs + 4s breath + hover + light + reduced-motion + AV81 menu/print lock + AV83 invariant, 7-task plan T1-T7 — but T7 interrupted mid-handoff by user pivot). V86-followup-2 (5-task plan T1-T5): user requested "เปลี่ยนจากเรืองสีฟ้าเป็นเรืองสีแดง แล้วลดความสว่างลดหน่อย ทุกที่ + เมนูตั้งค่าได้". Pivot drops 8 per-section [data-section] blocks → single :root with red defaults (c1=#dc2626 + c2=#ef4444) + NEW --neon-intensity multiplier (default 0.45 = Q1=C dim red). All V86 alphas wrap in calc(<base> * var(--neon-intensity)) so a single slider drives global brightness. NEW useV86GlowApply hook reads system_config.v86Glow → setProperty CSS vars on documentElement. NEW SystemSettingsTab 5th section "เอฟเฟกต์แสงเรือง" — 2 color pickers + 4 presets each + intensity slider 0-150% + enabled toggle + live preview card + Save/Reset/Cancel buttons + persist to clinic_settings/system_config.v86Glow + audit doc. AV81 menu+print zero-touch + Q4-B customer-facing zero-touch preserved across both. AV83 wording updated to V86-followup-2 (drop per-section parity, add intensity multiplier + sanctioned consumers). Tests: Phase A vitest 47 (v1) → 50+ (CG2/CG3/CG8 rewritten + VS1-VS6 NEW), Phase B Playwright 7 → 8 (B1-B4 RED-rewrite + B8 NEW live-slider test). V86 v1 commits 29c42310→b73ccad4 preserved (forward delta, no revert). Cosmetic-shell rule honored throughout — zero handler/state/prop/hook touch outside the 1 new hook + 1 new SectionCard. NO DEPLOY this session. |
```

- [ ] **Step 6: Final commit + push**

```bash
git add .agents/active.md SESSION_HANDOFF.md .claude/rules/00-session-start.md
git commit -m "$(cat <<'EOF'
docs(V86-followup-2 T5): combined V86 v1 + followup-2 handoff

active.md status bumped to V86 v1 + followup-2 shipped; SESSION_HANDOFF
gets new EOD+10 session block covering V86 v1 shipped + mid-T7 user
pivot + V86-followup-2 5-task delivery.

V86 + followup-2 V-entry locked into .claude/rules/00-session-start.md § 2
(combined entry — V86 v1 7 tasks + followup-2 5 tasks = 12 tasks total).

NO deploy this turn — V86 v1 + followup-2 join existing combined queue
per V18; user authorizes deploy verb separately. Post-deploy: Rule Q L1
hands-on across 8 backend tabs + AdminDashboard frontend + Settings UI
interaction (slider drag, color change, save, reset, cancel) + dark/light
theme + reduced-motion.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
git push origin master
```

- [ ] **Step 7: Final verification**

```bash
git log --oneline -15
```

Expected: V86 v1 commits (29c42310 + 691e97f0 + 73442d59 + b707dc45 + b73ccad4 + b70e4a87) + V86-followup-2 commits (27f39864 + T1-T5 commits) all pushed.

---

## Self-Review

**1. Spec coverage check** (skim spec § sections, point to task):
- § 2 Locked Decisions (Q1=C, Q2=approve) → T1 (45% intensity) + T3 (settings UI)
- § 3 Visual Contract (drop per-section blocks + calc + alpha math) → T1
- § 4 Settings UI mockup → T3
- § 5 Storage shape (v86Glow {enabled, c1, c2, intensityPercent}) → T2 (validator) + T3 (UI)
- § 6 useV86GlowApply hook → T2
- § 7 Implementation Surface → All tasks
- § 8 AV83 update → T4
- § 9 Test plan Phase A → T4 vitest; Phase B → T4 Playwright; Phase C → T5 manual
- § 10 Acceptance criteria → covered across T1-T4 visual + T4 tests + T5 manual
- § 11 Rollback Plan → noted in plan header constraints
- § 12 Out of Scope → reinforced in cosmetic-shell + AV81 constraints
- ✅ Full coverage

**2. Placeholder scan**: all steps have concrete code + commands + expected outputs. No "TBD" / "add appropriate" / "similar to". ✅

**3. Type/name consistency**:
- `--neon-c1` / `--neon-c2` / `--neon-intensity` consistent across CSS + hook + SettingsTab + tests
- `.v86-glow-card` class consistent
- `V86_GLOW_DEFAULTS` const consistent
- `validateV86Glow` function consistent
- `useV86GlowApply` hook consistent
- `v86Glow` Firestore field key consistent
- `system_config.v86Glow.{enabled, c1, c2, intensityPercent}` shape consistent
- data-field attributes `v86GlowC1`, `v86GlowC2`, `v86GlowIntensity`, `v86GlowEnabled` consistent
- handlers `handleV86Save` / `handleV86Reset` / `handleV86Cancel` consistent
- ✅ No drift

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-18-v86-followup-2-red-glow.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task with two-stage review (spec compliance + code quality) between tasks. Mirrors V86 v1 pattern.

**2. Inline Execution** — execute all 5 tasks in this session via executing-plans with batch checkpoints.

**Which approach?**
