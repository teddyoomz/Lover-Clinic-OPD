# V86-followup-2 — Universal Red Glow + Admin-Tunable Settings UI

**Date**: 2026-05-18 EOD+10 (mid-T7 pivot)
**Author**: Claude Opus 4.7 (brainstormed with user)
**Status**: APPROVED — ready for writing-plans
**Predecessor**: V86 v1 (per-section dual-tone, commits 29c42310→b70e4a87 + b73ccad4)
**Mockup**: `public/v86-followup-2-red-glow-design.html`

---

## 1. Problem

User feedback (verbatim, mid-T7 of V86 v1):
> "เปลี่ยนจากเรืองสีฟ้าเป็นเรืองสีแดง แล้วลดความสว่างลดหน่อย ทั้ง Front และ Backend ทุกที่ แต่อย่างอื่นเหมือนเดิม น่าจะง่ายแล้วเพราะแก้แค่ความสว่างกับสีที่เรื่อง ถ้าทำเมนูให้ตั้งได้ใน tab ตั้งค่ายิ่งดี เพราะมันน่าจะเป็นค่า universal ที่แก้จุดเดียวได้อยู่นะ ไอ้สีของแสงกับความสว่างเนี่ย"

Translation:
- Change from BLUE glow → RED glow (universal)
- Reduce brightness (dimmer)
- Apply to BOTH Frontend + Backend everywhere
- Everything else stays the same
- Add a Settings UI in the settings tab so admin can re-tune later
- "Just brightness and color of light — should be one place"

V86 v1 shipped per-section dual-tone using ArcBloom's 8 SECTION_COLOR pairs (appointments=blue/cyan, customers=teal/green, etc.). User now wants **universal red** with reduced intensity + **admin-tunable controls** in `tab=system-settings`.

---

## 2. Locked Decisions

| # | Decision | Value |
|---|---|---|
| Q1 | **Default intensity** | **C — 45% of V86 v1 baseline alphas** (most dim option) |
| Q2 | **Settings UI scope** | Approved recommended — 2 color pickers + intensity slider + live preview + presets |
| Color | **Default c1 (border)** | `#dc2626` = rgb(220, 38, 38) — red-600 deeper |
| Color | **Default c2 (halo)** | `#ef4444` = rgb(239, 68, 68) — red-500 lighter for halo radiance |
| Storage | **clinic_settings/system_config.v86Glow** | clinic-wide (mirrors existing system_config pattern) |
| Application | **JS sets `document.documentElement.style.setProperty('--neon-c1' / '--neon-c2' / '--neon-intensity')`** on save | live cascade through CSS |

---

## 3. Visual Contract

### Architecture change vs V86 v1

V86 v1 had 8 `[data-section="<id>"]` blocks each setting `--neon-c1` + `--neon-c2`. V86-followup-2 drops the per-section blocks (now dead code since user wants universal color) and uses a single `:root` declaration with **3 vars** + `calc()` to drive intensity.

### New CSS vars

```css
:root {
  --neon-c1: 220, 38, 38;       /* border + outer ring color (red-600 default) */
  --neon-c2: 239, 68, 68;       /* halo color (red-500 default) */
  --neon-intensity: 0.45;       /* alpha multiplier (default 45% per Q1=C) */
}
```

### Alpha contract via calc()

All `.v86-glow-card` rules + auto-glow rules switch from `rgba(var(--neon-c1), 0.40)` to `rgba(var(--neon-c1), calc(0.40 * var(--neon-intensity)))`. Math:

- Dark steady: border `calc(0.40 * 0.45)` = 0.18, ring `calc(0.08 * 0.45)` = 0.04, close `calc(0.45 * 0.45)` = 0.20, spread `calc(0.20 * 0.45)` = 0.09
- Dark breath 50%: ring 0.07, close 0.29, spread 0.17
- Dark hover: border 0.29, ring 0.09, close 0.38, spread 0.23
- Light steady: border 0.25, ring 0.05, close 0.14, spread 0.07
- Light breath 50%: ring 0.09, close 0.23, spread 0.13
- Light hover: border 0.38, ring 0.11, close 0.25, spread 0.14

### Structural preservation (cosmetic-shell strict)

UNCHANGED from V86 v1:
- `.v86-glow-card` selector + utility class
- `@keyframes v86-breath` + `@keyframes v86-breath-light`
- `@media (prefers-reduced-motion: reduce)` override
- `[data-theme="light"]` override branches
- Auto-glow rule at `[data-backend-menu-mode="new"] [data-testid="backend-content"]` + `.admin-frontend-zone` descendants
- :not() chain excluding bloom-overlay + bloom-orb + subtab (AV81)
- 4s breath duration + hover-pause + translateY(-3px) + transition timing

CHANGED:
- 8 `[data-section]` blocks → DROPPED (universal now)
- All hardcoded alphas → multiplied by `var(--neon-intensity)` via `calc()`
- `:root` fallback gets red defaults + intensity multiplier
- `data-section` JSX attributes on wrappers stay (cosmetic, future-proof; harmless)

---

## 4. Settings UI — New 5th Section in SystemSettingsTab.jsx

### Location
Extend existing `src/components/backend/SystemSettingsTab.jsx` with a 5th SectionCard block after "Feature Flags". Permission gate inherits from the tab (`system_config_management` perm OR admin claim).

### Visual layout (per mockup)

```
┌──────────────────────────────────────────────────────────┐
│ ✨ เอฟเฟกต์แสงเรือง (Neon Glow)                          │
│ ตั้งค่าสีและความสว่างของเรืองทั่วระบบ — Front + Backend  │
├──────────────────────────────────────────────────────────┤
│ สี (Color)                                                │
│  สีขอบ (border) [🎨#dc2626] [#dc2626    ] [● ● ● ●]      │
│  สี halo        [🎨#ef4444] [#ef4444    ] [● ● ● ●]      │
├──────────────────────────────────────────────────────────┤
│ ความสว่าง (Intensity)                                     │
│  ระดับความสว่าง [▬▬▬▬▬▬●─────────────] 45%               │
├──────────────────────────────────────────────────────────┤
│ Live Preview                                              │
│  ┌─────────────────────────────────────────────┐          │
│  │ ตัวอย่างการ์ด                                │          │
│  │ เลื่อน slider ด้านบนเพื่อดูผลแบบ live       │          │
│  └─────────────────────────────────────────────┘          │
├──────────────────────────────────────────────────────────┤
│ [บันทึก] [รีเซ็ตเป็นค่าเริ่มต้น] [ยกเลิก]                  │
└──────────────────────────────────────────────────────────┘
```

### Control surface

- **2 color pickers** (`<input type="color">`) — one for c1 (border), one for c2 (halo)
- **Custom hex inputs** alongside each picker (text field, validates `#RRGGBB` format)
- **4 preset color dots** per picker:
  - c1 presets: red `#dc2626` (default), blue `#3b82f6`, green `#10b981`, purple `#a855f7`
  - c2 presets: red-light `#ef4444` (default), cyan `#06b6d4`, green-light `#22c55e`, pink `#ec4899`
- **1 intensity slider** (`<input type="range" min="0" max="150" step="5">`) — default 45 (% expressed as percent)
- **Live preview card** — sample card rendered using the LIVE local state (not the saved value)
- **Save button** — persists to `clinic_settings/system_config.v86Glow` + emits audit doc + applies vars
- **Reset button** — restores defaults (red + 45%) WITHOUT auto-saving (admin must click Save to commit)
- **Cancel button** — reverts local state to last saved values (no Firestore write)

### Live preview mechanism

Admin drags slider OR changes color → `onChange` fires → JS calls `document.documentElement.style.setProperty('--neon-c1', ...)` / `--neon-c2` / `--neon-intensity` IMMEDIATELY. Cards everywhere on the screen update via CSS cascade. NO Firestore write yet.

On Save: writes to Firestore + audit + the live-applied state becomes persistent. On next page load, `useSystemConfig()` hook reads saved value + a new `useV86GlowApply` hook re-applies the vars at mount.

On Reset / Cancel without Save: refresh of `useSystemConfig()` data restores last-saved values; vars re-apply.

### Edge cases
- **Color picker disabled / hex invalid**: validation prevents submit, error banner shows
- **Intensity outside 0-150**: clamped client + server side
- **Concurrent admin saves**: last-write-wins (system_config has no version conflict — same pattern as feature flags)
- **system_config absent at first load**: `useV86GlowApply` falls back to red + 45% defaults

---

## 5. Storage Shape

`clinic_settings/system_config` doc grows by 1 key:

```js
{
  // ... existing fields (tabOverrides, defaults, featureFlags, ...)
  v86Glow: {
    enabled: true,             // boolean — turn off to revert to pre-V86 (V85 black-shadow) look
    c1: '#dc2626',             // 7-char hex string, validates /^#[0-9a-fA-F]{6}$/
    c2: '#ef4444',             // same shape
    intensityPercent: 45       // integer 0-150 (% — 0 = no glow, 100 = full V86 v1, 150 = brighter)
  }
}
```

### Defaults (when v86Glow undefined)
```js
const V86_GLOW_DEFAULTS = {
  enabled: true,
  c1: '#dc2626',
  c2: '#ef4444',
  intensityPercent: 45,
};
```

### Validator (extends systemConfigClient.js)
```js
function validateV86Glow(patch) {
  const out = { ...V86_GLOW_DEFAULTS };
  if (typeof patch?.enabled === 'boolean') out.enabled = patch.enabled;
  if (typeof patch?.c1 === 'string' && /^#[0-9a-fA-F]{6}$/.test(patch.c1)) out.c1 = patch.c1.toLowerCase();
  if (typeof patch?.c2 === 'string' && /^#[0-9a-fA-F]{6}$/.test(patch.c2)) out.c2 = patch.c2.toLowerCase();
  if (Number.isFinite(patch?.intensityPercent)) {
    out.intensityPercent = Math.max(0, Math.min(150, Math.round(patch.intensityPercent)));
  }
  return out;
}
```

---

## 6. Application Mechanism (JS plumbing)

NEW hook: `src/hooks/useV86GlowApply.js`
```js
import { useEffect } from 'react';
import { useSystemConfig } from './useSystemConfig.js';

const DEFAULTS = { enabled: true, c1: '#dc2626', c2: '#ef4444', intensityPercent: 45 };

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ].join(', ');
}

export function useV86GlowApply() {
  const { config } = useSystemConfig();
  const v86 = { ...DEFAULTS, ...(config?.v86Glow || {}) };
  useEffect(() => {
    const root = document.documentElement;
    if (!v86.enabled) {
      root.style.setProperty('--neon-intensity', '0');
      return;
    }
    root.style.setProperty('--neon-c1', hexToRgb(v86.c1));
    root.style.setProperty('--neon-c2', hexToRgb(v86.c2));
    root.style.setProperty('--neon-intensity', String(v86.intensityPercent / 100));
  }, [v86.enabled, v86.c1, v86.c2, v86.intensityPercent]);
}
```

Mount in `App.jsx` (or top-level shell) — called once at app root, listener auto-refreshes on system_config changes via the existing `useSystemConfig` hook.

---

## 7. Implementation Surface

### Files modified

| File | Change | Why |
|---|---|---|
| `src/index.css` | Drop 8 `[data-section]` blocks; rewrite `:root` block to red + intensity; convert all V86 alphas to `calc(<base> * var(--neon-intensity))` | universal red + intensity multiplier |
| `src/components/backend/SystemSettingsTab.jsx` | Add 5th SectionCard "เอฟเฟกต์แสงเรือง" with color pickers + slider + live preview + Save/Reset/Cancel | new admin UI |
| `src/lib/systemConfigClient.js` | Add `V86_GLOW_DEFAULTS` + `validateV86Glow` + include `v86Glow` in `saveSystemConfig` write path | persistence |
| `src/hooks/useV86GlowApply.js` | NEW hook applying CSS vars from system_config | live apply mechanism |
| `src/App.jsx` (or top-level component) | 1-line `useV86GlowApply()` call | mount the hook |
| `tests/v86-neon-glow-css.test.js` | CG2 + CG3 rewrite (drop ArcBloom parity, lock red defaults + intensity multiplier); CG8 update | tests reflect pivot |
| `tests/v86-followup-2-settings.test.jsx` (NEW) | Tests for new SystemSettingsTab section + validator + hook | new code coverage |
| `tests/e2e/v86-neon-glow-visual.spec.js` | B1-B4 rewrite to assert RED RGB on cards (not per-section) | Playwright matches new contract |
| `.claude/skills/audit-anti-vibe-code/SKILL.md` | Update AV83 wording (drop "per-section ArcBloom parity", add "universal red default + intensity multiplier + admin-tunable via system_config") | invariant update |

### Files NOT touched (preserved zero-touch)

- All AV81 menu+print files (BackendArcBloom, SubTabBloom, DuoPill, Sidebar, MobileDrawer, CmdPalette, SalePrintView, QuotationPrintView, BulkPrintModal, DocumentPrintModal, documentPrintEngine)
- Q4-B customer-facing (PatientForm, PatientDashboard, ClinicSchedule)
- `src/components/backend/shell/BackendArcBloom.jsx` — SECTION_COLOR map preserved for menu orb tinting (independent of V86)
- `src/pages/BackendDashboard.jsx` — data-section attribute stays (cosmetic, future-proof)
- `src/pages/AdminDashboard.jsx` — admin-frontend-zone class stays

---

## 8. AV83 Update (V86-followup-2 wording)

```markdown
### AV83 — V86 Neon Glow consumes CSS vars (universal red, admin-tunable) (2026-05-18 EOD+10 V86-followup-2)
**Why**: V86-followup-2 pivot — drop per-section dual-tone (V86 v1 design), use universal red (c1=#dc2626 border + c2=#ef4444 halo) with intensity multiplier (--neon-intensity, default 0.45). Admin tunes via SystemSettingsTab "เอฟเฟกต์แสงเรือง" section, persisted to clinic_settings/system_config.v86Glow.
**Grep**:
- `.v86-glow-` rules + V86 auto-glow rules in `src/index.css` MUST reference `var(--neon-c1)` / `var(--neon-c2)` / `var(--neon-intensity)` for color + alpha — NO hardcoded RGB, NO hardcoded alpha numerals outside the `calc(<base> * var(--neon-intensity))` factor.
- `:root` MUST define all 3 vars with V86-followup-2 defaults: `--neon-c1: 220, 38, 38;` + `--neon-c2: 239, 68, 68;` + `--neon-intensity: 0.45;`.
- `useV86GlowApply` hook is ONLY consumer that calls `document.documentElement.style.setProperty('--neon-c1' | '--neon-c2' | '--neon-intensity', ...)` — sanctioned exception.
- Menu (BackendArcBloom + 5 sibling menu files) MUST contain ZERO `v86-glow-` references.
- Print (SalePrintView + QuotationPrintView + BulkPrintModal + DocumentPrintModal + documentPrintEngine) MUST contain ZERO `v86-glow-` references.
- Customer-facing (PatientForm + PatientDashboard + ClinicSchedule) MUST contain ZERO `v86-glow-` + ZERO `data-section` + ZERO `admin-frontend-zone` references.
**Fix**: V86 rules with hardcoded section RGB → consume `var(--neon-c1/c2)`. Alphas → wrap in `calc(<base> * var(--neon-intensity))`. Settings UI changes → flow through validateV86Glow → saveSystemConfig → useV86GlowApply.
```

---

## 9. Test Plan

### Phase A — vitest source-grep (extends existing tests/v86-neon-glow-css.test.js)
- **CG1**: V86 block header still present + dated EOD+10 (with followup-2 note)
- **CG2 (REWRITTEN)**: `:root` block has all 3 vars (`--neon-c1`, `--neon-c2`, `--neon-intensity`) with red defaults
- **CG3 (REWRITTEN)**: NO 8 `[data-section]` blocks present (dropped); fallback `:root` is the single source
- **CG4**: keyframes `v86-breath` + `v86-breath-light` use `var(--neon-c1/c2)` AND `var(--neon-intensity)` via `calc()`
- **CG5**: reduced-motion override unchanged
- **CG6**: light theme override unchanged
- **CG7**: AV81 menu+print + customer-facing zero-touch unchanged
- **CG8 (UPDATED)**: all V86 alphas wrapped in `calc(<num> * var(--neon-intensity))` — NO bare alpha numerals outside the factor

### Phase A-new — vitest tests/v86-followup-2-settings.test.jsx (NEW)
- **VS1**: `validateV86Glow` accepts valid input; rejects invalid hex; clamps intensity 0-150
- **VS2**: `useV86GlowApply` hook sets CSS vars on mount + on config change
- **VS3**: SystemSettingsTab renders "เอฟเฟกต์แสงเรือง" section with 2 color pickers + slider + 4 preset dots per picker + Save/Reset/Cancel
- **VS4**: Live preview card uses local state (not saved state)
- **VS5**: Save action calls `saveSystemConfig` with validated patch + emits audit doc
- **VS6**: Reset restores defaults without saving

### Phase B — Playwright (updates tests/e2e/v86-neon-glow-visual.spec.js)
- B1-B4 rewrite: assert RED RGB on backend customer/stock/appointments cards + admin frontend (instead of per-section colors)
- B5 (hover boost) unchanged
- B6 (reduced-motion) unchanged
- B7 (AV81 menu untouched) unchanged
- **B8 (NEW)**: open SystemSettingsTab, change slider to 80%, verify CSS var `--neon-intensity` updates live + cards update

### Phase C — Manual L1 (Rule Q V66)
- Cycle backend customer/stock/sales tabs — verify red glow consistent
- AdminDashboard frontend — verify red glow on queue/chat/calendar cards
- Open SystemSettings → glow section → drag slider → verify live update
- Save → reload page → verify persistence
- Reset → verify defaults restore (no save until click Save)
- Toggle dark↔light theme — verify red glow scales appropriately

---

## 10. Acceptance Criteria

1. ✅ All backend cards + admin frontend cards glow RED (universal, no per-section variation)
2. ✅ Intensity default = 45% per Q1=C (visibly dimmer than V86 v1)
3. ✅ SystemSettingsTab has new "เอฟเฟกต์แสงเรือง" section with 2 color pickers + slider + live preview
4. ✅ Save persists to `clinic_settings/system_config.v86Glow` + emits audit doc
5. ✅ Reset restores defaults WITHOUT auto-save
6. ✅ Live preview updates immediately on slider drag / color change (no save needed for preview)
7. ✅ `useV86GlowApply` hook applies vars on mount + auto-refreshes on system_config changes
8. ✅ Dark + light themes both render with red palette scaled appropriately
9. ✅ Reduced-motion still strips animation (per V86 v1 contract)
10. ✅ Hover boost still lifts + intensifies (per V86 v1 contract)
11. ✅ AV81 menu + print + Q4-B customer-facing untouched
12. ✅ Phase A vitest CG1-CG8 + new VS1-VS6 all PASS
13. ✅ Build clean
14. ✅ V86 v1 commit history preserved (no revert — followup-2 lands as forward delta)

---

## 11. Rollback Plan

Forward delta — to rollback:
1. `git revert <followup-2 commits>` — restores V86 v1 per-section dual-tone
2. Drop `system_config.v86Glow` field manually via admin SDK if needed (no DB migration required — defaults restore)
3. New `useV86GlowApply` hook stays inactive (no-op) since CSS vars wouldn't be referenced by reverted CSS

Zero rules change, zero serverless touch — pure UI + 1 Firestore field rollback.

---

## 12. Out of Scope

- Per-section override (admin can't set red for customers + blue for sales — universal only per user intent)
- Animation speed slider (breath stays 4s)
- Multi-clinic theme presets sharing
- Customer-facing PatientForm/ClinicSchedule glow (Q4-B exclude preserved)
- Menu (ArcBloom orbs, SubTabBloom, DuoPill) — AV81 lock

---

## 13. References

- V86 v1 spec: `docs/superpowers/specs/2026-05-18-v86-neon-glow-design.md`
- V86 v1 plan: `docs/superpowers/plans/2026-05-18-v86-neon-glow.md`
- Mockup: `public/v86-followup-2-red-glow-design.html`
- SystemSettingsTab Phase 16.3 spec context: `src/components/backend/SystemSettingsTab.jsx`
- system_config infrastructure: `src/lib/systemConfigClient.js`, `src/hooks/useSystemConfig.js`
- Cosmetic-shell rule: `~/.claude/projects/F--LoverClinic-app/memory/feedback_cosmetic_shell_redesign_constraint.md`
- AV83: `.claude/skills/audit-anti-vibe-code/SKILL.md`
