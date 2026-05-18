# V85 Universal Glow Effect — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 20 CSS glow utility classes (`.fx-glow-v[2-10]` + `.fx-glow-u[1-10]`) to `src/index.css` and apply them across ~50 components + ~70 modals so every dark-theme box/card/modal visibly separates from the background — with a matching pink-sakura light-theme palette and full menu-system exemption.

**Architecture:** All 20 effects live in `src/index.css` as additive Tailwind-compatible utility classes. Application is one extra className token per existing wrapper — no JSX restructuring for 95% of files. Light theme uses `[data-theme="light"]` overrides on every utility. Animated variants honor `prefers-reduced-motion: reduce`. The entire menu system (BackendArcBloom / BackendSubTabBloom / BackendSidebar / BackendMobileDrawer / BackendCmdPalette / BackendDuoPill / AdminDashboard `.menu-*` regions) is hard-locked from any cosmetic change per user guardrail. All print-render paths (`SalePrintView`, `QuotationPrintView`, `BulkPrintModal`, `DocumentPrintModal`, `documentPrintEngine.js`) are also hard-locked.

**Tech Stack:** Vite 8 + React 19 + Tailwind 3.4 + Vitest 4.1 + Playwright. No new dependencies. Uses `@property` CSS Houdini for V6 conic-gradient color cycling (Chrome 85+ / Safari 16.4+ / Firefox 128+ supported; fallback static for older).

**Spec:** `docs/superpowers/specs/2026-05-18-v85-glow-effect-universal-design.md` (APPROVED 2026-05-18 EOD+9).

**Visual reference:** `public/v85-glow-variants.html` — 30 mockups (Section A=Card 10 / Section B=Modal 10 / Section C=Universal-Box 10).

**Pragmatic deviation note:** Phases B/C/D mass-edit similar-pattern wrappers across N files (~120 total file touches). Strict "one file per step" would produce 300+ steps. Instead, surface-type tasks BATCH similar edits into a single step with the pattern example + full file list. Each batch step is followed by a verify step (build clean + targeted tests pass) before commit. This stays faithful to the skill's intent (small, verifiable units of work) while keeping the plan readable.

---

## Phase A — CSS Foundation (single commit, ~700 LOC)

Adds 20 utility classes + 8 U9 sub-modifiers + light-theme overrides + reduced-motion overrides + 4 color tokens + `@property` registration to `src/index.css`. Plus the source-grep regression test that locks the contract.

### Task A.1 — Infrastructure (color tokens + @property)

**Files:**
- Modify: `src/index.css:1390` (insert BEFORE the existing `/* Chat tab blink alert */` block)
- Test: (lock-in test in Task A.7)

- [ ] **Step 1: Locate the insertion point**

Run:
```bash
grep -n "Chat tab blink alert" src/index.css
```
Expected: ONE match around line 1391 (V84 marker comment). Insert the V85 block BEFORE this line.

- [ ] **Step 2: Insert the V85 header + color tokens + @property**

Edit `src/index.css` — insert at line 1390 (just before the V84 Chat tab blink alert comment block):

```css
/* ════════════════════════════════════════════════════════════════════ */
/* V85 — Universal Glow Effect Utilities (2026-05-18 EOD+9)             */
/* Spec: docs/superpowers/specs/2026-05-18-v85-glow-effect-universal-   */
/* design.md  ·  Visual ref: public/v85-glow-variants.html              */
/* AV81: every utility must have [data-theme="light"] override + every  */
/* animated variant must honor prefers-reduced-motion. Menu system +    */
/* print views are sanctioned NO-CLASS exceptions (do NOT add fx-glow-* */
/* to BackendArcBloom / BackendSubTabBloom / BackendSidebar /           */
/* BackendMobileDrawer / BackendCmdPalette / BackendDuoPill / any       */
/* .menu-* class / SalePrintView / QuotationPrintView / BulkPrintModal  */
/* / DocumentPrintModal / documentPrintEngine).                          */
/* ════════════════════════════════════════════════════════════════════ */

/* V85 color tokens (dark default — RGB triples for use in rgba()) */
:root {
  --v85-ember-rgb: 251, 146, 60;   /* orange / amber — primary chrome */
  --v85-rose-rgb:  244, 63, 94;    /* alert / urgency */
  --v85-cyan-rgb:  6, 182, 212;    /* data / cool tone */
  --v85-violet-rgb: 139, 92, 246;  /* premium / read-only */
}
/* Light theme — pink-sakura mirror per spec §5.3 */
[data-theme="light"] {
  --v85-ember-rgb: 244, 114, 182;
  --v85-rose-rgb:  236, 72, 153;
  --v85-cyan-rgb:  14, 165, 233;
  --v85-violet-rgb: 168, 85, 247;
}

/* @property for V6 conic-gradient color cycling — registered once globally */
@property --v85-v6-hue {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}
```

- [ ] **Step 3: Verify build clean after infrastructure block**

Run:
```bash
npm run build 2>&1 | tail -5
```
Expected: build clean, no parse errors. The @property block + comment-only block do not affect any rendered output yet.

### Task A.2 — V-variants utility classes (V2-V10)

**Files:**
- Modify: `src/index.css` (append AFTER the infrastructure block from Task A.1)

- [ ] **Step 1: Append V2-V5 utility classes**

Edit `src/index.css` — append after the Task A.1 block:

```css
/* ─── V-variants (focal-level effects) ───────────────────────────────── */

/* V2 — Tight-Rim Neon (selected/active rows + primary CTA tiles) */
.fx-glow-v2 {
  border: 2px solid rgba(var(--v85-cyan-rgb), 0.55) !important;
  box-shadow:
    0 0 6px rgba(var(--v85-cyan-rgb), 0.6),
    0 0 18px rgba(var(--v85-cyan-rgb), 0.35),
    0 12px 24px rgba(0,0,0,0.55),
    inset 0 1px 0 rgba(255,255,255,0.06);
}

/* V3 — Wide-Aurora (page-level large containers — atmospheric, no anim) */
.fx-glow-v3 {
  position: relative;
  box-shadow:
    0 16px 32px rgba(0,0,0,0.55),
    inset 0 1px 0 rgba(255,255,255,0.06);
}
.fx-glow-v3::before {
  content: '';
  position: absolute;
  inset: -36px;
  border-radius: inherit;
  background: radial-gradient(circle,
    rgba(var(--v85-violet-rgb), 0.28) 0%,
    rgba(var(--v85-rose-rgb), 0.14) 40%,
    rgba(var(--v85-rose-rgb), 0.04) 70%,
    transparent 100%);
  filter: blur(22px);
  z-index: -1;
  pointer-events: none;
}

/* V4 — Heartbeat Pulse (alert cards — animated 1.8s) */
.fx-glow-v4 {
  border: 1px solid rgba(var(--v85-rose-rgb), 0.28);
  animation: v85-heartbeat 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
@keyframes v85-heartbeat {
  0%, 100% {
    box-shadow:
      0 14px 28px rgba(0,0,0,0.55),
      0 0 8px rgba(var(--v85-rose-rgb), 0.22),
      inset 0 1px 0 rgba(255,255,255,0.06);
  }
  50% {
    box-shadow:
      0 14px 28px rgba(0,0,0,0.55),
      0 0 18px rgba(var(--v85-rose-rgb), 0.5),
      0 0 38px rgba(var(--v85-rose-rgb), 0.18),
      inset 0 1px 0 rgba(255,255,255,0.06);
  }
}

/* V5 — Jet-Thrust (hero KPI cards — asymmetric downward glow) */
.fx-glow-v5 {
  position: relative;
  box-shadow:
    0 0 20px rgba(20, 184, 166, 0.3),
    inset 0 1px 0 rgba(255,255,255,0.06);
}
.fx-glow-v5::after {
  content: '';
  position: absolute;
  left: 50%;
  top: 80%;
  width: 240px;
  height: 200px;
  transform: translateX(-50%);
  background: radial-gradient(ellipse 50% 60% at 50% 0%,
    rgba(20, 184, 166, 0.42) 0%,
    rgba(34, 197, 94, 0.22) 40%,
    transparent 80%);
  filter: blur(20px);
  z-index: -1;
  pointer-events: none;
  animation: v85-thrust 0.8s ease-in-out infinite alternate;
}
@keyframes v85-thrust {
  from { opacity: 0.7; transform: translateX(-50%) scaleY(0.95); }
  to   { opacity: 1;   transform: translateX(-50%) scaleY(1.08); }
}
```

- [ ] **Step 2: Append V6-V10 utility classes**

Edit `src/index.css` — append after Step 1:

```css
/* V6 — Conic-Rainbow (celebration modals only — colors cycle in place
   via @property --v85-v6-hue; element does NOT rotate so bounding box
   stays inside frame) */
.fx-glow-v6 { position: relative; box-shadow: 0 14px 30px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.06); }
.fx-glow-v6::before {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: inherit;
  background: conic-gradient(
    from var(--v85-v6-hue),
    #ef4444, #f97316, #facc15, #22c55e, #06b6d4, #6366f1, #ec4899, #ef4444);
  z-index: -1;
  animation: v85-hue-cycle 8s linear infinite;
  filter: blur(2px) brightness(1.05);
  opacity: 0.7;
}
.fx-glow-v6::after {
  content: '';
  position: absolute;
  inset: -14px;
  border-radius: inherit;
  background: conic-gradient(
    from var(--v85-v6-hue),
    rgba(239,68,68,0.32), rgba(249,115,22,0.32), rgba(250,204,21,0.32),
    rgba(34,197,94,0.32), rgba(6,182,212,0.32), rgba(99,102,241,0.32),
    rgba(236,72,153,0.32), rgba(239,68,68,0.32));
  filter: blur(14px);
  z-index: -2;
  animation: v85-hue-cycle 12s linear infinite reverse;
}
@keyframes v85-hue-cycle { to { --v85-v6-hue: 360deg; } }

/* V7 — Holographic Sweep (VIP / premium badges) */
.fx-glow-v7 {
  position: relative;
  overflow: hidden;
  border: 1px solid rgba(255,255,255,0.1);
  box-shadow:
    0 14px 30px rgba(0,0,0,0.55),
    0 0 14px rgba(16,185,129,0.22),
    inset 0 1px 0 rgba(255,255,255,0.06);
}
.fx-glow-v7::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(115deg,
    transparent 0%, transparent 35%,
    rgba(255,255,255,0.16) 50%,
    transparent 65%, transparent 100%);
  pointer-events: none;
  animation: v85-sweep 5s ease-in-out infinite;
}
@keyframes v85-sweep {
  0%   { transform: translateX(-100%); }
  65%  { transform: translateX(100%); }
  100% { transform: translateX(100%); }
}
.fx-glow-v7::after {
  content: '';
  position: absolute;
  inset: -10px;
  border-radius: inherit;
  background: radial-gradient(circle,
    rgba(16,185,129,0.22),
    rgba(6,182,212,0.1) 50%,
    transparent 80%);
  filter: blur(14px);
  z-index: -1;
  pointer-events: none;
}

/* V8 — Inner Glow + Glass (read-only cards · static · low-cost) */
.fx-glow-v8 {
  background: rgba(20, 22, 28, 0.7) !important;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border: 1px solid rgba(255,255,255,0.14) !important;
  box-shadow:
    0 22px 44px rgba(0,0,0,0.7),
    inset 0 1px 0 rgba(255,255,255,0.18),
    inset 0 -1px 0 rgba(0,0,0,0.4),
    inset 0 0 20px rgba(14, 165, 233, 0.14);
}

/* V9 — Double-Halo (detail-view focal cards · 2 layers · breathing) */
.fx-glow-v9 {
  position: relative;
  box-shadow:
    0 18px 36px rgba(0,0,0,0.6),
    inset 0 1px 0 rgba(255,255,255,0.06);
}
.fx-glow-v9::before {
  content: '';
  position: absolute;
  inset: -8px;
  border-radius: inherit;
  background: radial-gradient(circle,
    rgba(var(--v85-rose-rgb), 0.4) 0%,
    rgba(var(--v85-rose-rgb), 0.14) 50%,
    transparent 80%);
  filter: blur(10px);
  z-index: -1;
  pointer-events: none;
  animation: v85-pulse-fast 3.5s ease-in-out infinite;
}
.fx-glow-v9::after {
  content: '';
  position: absolute;
  inset: -32px;
  border-radius: inherit;
  background: radial-gradient(circle,
    rgba(var(--v85-ember-rgb), 0.26) 0%,
    rgba(var(--v85-ember-rgb), 0.1) 45%,
    transparent 80%);
  filter: blur(22px);
  z-index: -2;
  pointer-events: none;
  animation: v85-pulse-slow 4.5s ease-in-out infinite reverse;
}
@keyframes v85-pulse-fast {
  0%, 100% { opacity: 0.55; transform: scale(0.96); }
  50%      { opacity: 0.85; transform: scale(1.05); }
}
@keyframes v85-pulse-slow {
  0%, 100% { opacity: 0.5;  transform: scale(0.97); }
  50%      { opacity: 0.8;  transform: scale(1.04); }
}

/* V10 — Drop+Ambient (modal default · conservative · static) */
.fx-glow-v10 {
  position: relative;
  box-shadow:
    0 28px 56px rgba(0,0,0,0.7),
    0 12px 24px rgba(0,0,0,0.4),
    0 0 0 1px rgba(var(--v85-violet-rgb), 0.16),
    inset 0 1px 0 rgba(255,255,255,0.05);
}
.fx-glow-v10::before {
  content: '';
  position: absolute;
  inset: -6px;
  border-radius: inherit;
  background: radial-gradient(circle,
    rgba(var(--v85-violet-rgb), 0.16) 0%,
    transparent 70%);
  z-index: -1;
  pointer-events: none;
}
```

- [ ] **Step 3: Verify build clean**

Run:
```bash
npm run build 2>&1 | tail -5
```
Expected: build clean, no parse errors. Total V CSS rules: 9 variants × (~20 LOC base + maybe ::before/::after).

### Task A.3 — U-variants utility classes (U1-U10)

**Files:**
- Modify: `src/index.css` (append AFTER V10 from Task A.2)

- [ ] **Step 1: Append U1-U5 utility classes**

Edit `src/index.css`:

```css
/* ─── U-variants (universal-box / chrome effects) ────────────────────── */

/* U1 — Subtle Drop Lift (no color · form inputs / search / breadcrumbs) */
.fx-glow-u1 {
  box-shadow:
    0 24px 48px rgba(0,0,0,0.55),
    0 8px 16px rgba(0,0,0,0.35),
    inset 0 1px 0 rgba(255,255,255,0.05);
}

/* U2 — Cool Ambient (cyan tint · data tables / list views / reports) */
.fx-glow-u2 {
  box-shadow:
    0 24px 48px rgba(0,0,0,0.55),
    0 0 28px rgba(var(--v85-cyan-rgb), 0.1),
    inset 0 1px 0 rgba(255,255,255,0.06);
}

/* U3 — Warm Ember (page-body content wrapper — NOT menu shell) */
.fx-glow-u3 {
  box-shadow:
    0 24px 48px rgba(0,0,0,0.55),
    0 0 28px rgba(var(--v85-ember-rgb), 0.12),
    inset 0 1px 0 rgba(255,255,255,0.06);
}

/* U4 — Dual-Tone Aurora (in-content form section dividers) */
.fx-glow-u4 {
  box-shadow:
    0 24px 48px rgba(0,0,0,0.55),
    0 -8px 28px rgba(var(--v85-cyan-rgb), 0.08),
    0 14px 28px rgba(var(--v85-ember-rgb), 0.1),
    inset 0 1px 0 rgba(255,255,255,0.06);
}

/* U5 — Border + Drop (form panels / settings groups · amber rim) */
.fx-glow-u5 {
  border-color: rgba(var(--v85-ember-rgb), 0.18) !important;
  box-shadow:
    0 24px 48px rgba(0,0,0,0.6),
    0 0 0 1px rgba(var(--v85-ember-rgb), 0.08),
    inset 0 1px 0 rgba(255,255,255,0.14);
}
```

- [ ] **Step 2: Append U6-U10 utility classes**

Edit `src/index.css`:

```css
/* U6 — Slow Pulse (live data widgets · 8s breathing) */
.fx-glow-u6 {
  animation: v85-u6-breathe 8s ease-in-out infinite;
}
@keyframes v85-u6-breathe {
  0%, 100% {
    box-shadow:
      0 22px 44px rgba(0,0,0,0.55),
      0 0 24px rgba(var(--v85-ember-rgb), 0.08),
      inset 0 1px 0 rgba(255,255,255,0.06);
  }
  50% {
    box-shadow:
      0 26px 52px rgba(0,0,0,0.6),
      0 0 38px rgba(var(--v85-ember-rgb), 0.14),
      inset 0 1px 0 rgba(255,255,255,0.08);
  }
}

/* U7 — Layered Stack Depth (in-content popovers · NOT BackendCmdPalette) */
.fx-glow-u7 {
  box-shadow:
    0 4px 8px rgba(0,0,0,0.4),
    0 12px 24px rgba(0,0,0,0.5),
    0 28px 56px rgba(0,0,0,0.65),
    inset 0 1px 0 rgba(255,255,255,0.06);
}

/* U8 — Inner Glow Only (read-only display panels · audit logs / archives) */
.fx-glow-u8 {
  border-color: rgba(255,255,255,0.1) !important;
  box-shadow:
    0 20px 40px rgba(0,0,0,0.55),
    inset 0 1px 0 rgba(255,255,255,0.18),
    inset 0 0 24px rgba(255,255,255,0.03);
}

/* U9 — Per-Domain Tint (page title bars — see u9-{section} sub-modifiers) */
.fx-glow-u9 {
  box-shadow:
    0 22px 44px rgba(0,0,0,0.55),
    0 0 24px var(--u9-tint, rgba(var(--v85-ember-rgb), 0.16)),
    inset 0 1px 0 rgba(255,255,255,0.06);
}

/* U10 — Glassmorphism (modal backdrops / drawer overlays — NOT menu) */
.fx-glow-u10 {
  background: rgba(20, 22, 28, 0.5) !important;
  backdrop-filter: blur(10px) saturate(140%);
  -webkit-backdrop-filter: blur(10px) saturate(140%);
  border: 1px solid rgba(255,255,255,0.12) !important;
  box-shadow:
    0 22px 44px rgba(0,0,0,0.55),
    inset 0 1px 0 rgba(255,255,255,0.14);
}
```

- [ ] **Step 3: Verify build clean**

Run:
```bash
npm run build 2>&1 | tail -5
```
Expected: build clean.

### Task A.4 — U9 per-domain sub-modifiers

**Files:**
- Modify: `src/index.css` (append AFTER U10 from Task A.3)

- [ ] **Step 1: Append 8 per-domain tint sub-modifiers**

Edit `src/index.css`:

```css
/* U9 per-domain sub-modifiers — apply alongside .fx-glow-u9 on page title
   bars. Example: <h2 className="... fx-glow-u9 fx-glow-u9-sales">การขาย</h2>.
   Sets the --u9-tint custom property which feeds into the .fx-glow-u9 glow. */
.fx-glow-u9-sales        { --u9-tint: rgba(239, 68, 68, 0.16); }   /* red */
.fx-glow-u9-customers    { --u9-tint: rgba(6, 182, 212, 0.16); }    /* cyan */
.fx-glow-u9-finance      { --u9-tint: rgba(16, 185, 129, 0.16); }   /* emerald */
.fx-glow-u9-marketing    { --u9-tint: rgba(168, 85, 247, 0.16); }   /* purple */
.fx-glow-u9-stock        { --u9-tint: rgba(245, 158, 11, 0.16); }   /* amber */
.fx-glow-u9-reports      { --u9-tint: rgba(14, 165, 233, 0.16); }   /* sky */
.fx-glow-u9-master       { --u9-tint: rgba(250, 204, 21, 0.16); }   /* yellow */
.fx-glow-u9-appointments { --u9-tint: rgba(59, 130, 246, 0.16); }   /* blue */
```

- [ ] **Step 2: Verify build clean**

Run:
```bash
npm run build 2>&1 | tail -5
```
Expected: build clean.

### Task A.5 — Light theme overrides

**Files:**
- Modify: `src/index.css` (append AFTER U9 sub-modifiers from Task A.4)

- [ ] **Step 1: Append V-variant light theme overrides**

Edit `src/index.css`:

```css
/* ─── Light theme overrides — pink-sakura palette ────────────────────── */
/* Drop shadows reduced from rgba(0,0,0,0.55) → rgba(0,0,0,0.12).
   Inset top highlight from rgba(255,255,255,0.06) → rgba(0,0,0,0.04).
   Colored glows use the [data-theme="light"] color tokens (already
   swapped to sakura/rose/teal/purple in Task A.1). Animations preserved. */

[data-theme="light"] .fx-glow-v2 {
  border-color: rgba(var(--v85-cyan-rgb), 0.45) !important;
  box-shadow:
    0 0 6px rgba(var(--v85-cyan-rgb), 0.4),
    0 0 18px rgba(var(--v85-cyan-rgb), 0.2),
    0 8px 16px rgba(0,0,0,0.1),
    inset 0 1px 0 rgba(0,0,0,0.04);
}
[data-theme="light"] .fx-glow-v3 {
  box-shadow:
    0 12px 24px rgba(0,0,0,0.1),
    inset 0 1px 0 rgba(0,0,0,0.04);
}
[data-theme="light"] .fx-glow-v3::before {
  background: radial-gradient(circle,
    rgba(var(--v85-violet-rgb), 0.22) 0%,
    rgba(var(--v85-rose-rgb), 0.12) 40%,
    rgba(var(--v85-rose-rgb), 0.03) 70%,
    transparent 100%);
}
[data-theme="light"] .fx-glow-v4 {
  border-color: rgba(var(--v85-rose-rgb), 0.32);
  /* Note: @keyframes v85-heartbeat already uses var(--v85-rose-rgb) which
     swaps automatically in light theme; only drop shadow strength needs
     a manual override here. */
  animation: v85-heartbeat-light 1.8s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}
@keyframes v85-heartbeat-light {
  0%, 100% {
    box-shadow:
      0 10px 20px rgba(0,0,0,0.1),
      0 0 6px rgba(var(--v85-rose-rgb), 0.18),
      inset 0 1px 0 rgba(0,0,0,0.04);
  }
  50% {
    box-shadow:
      0 10px 20px rgba(0,0,0,0.1),
      0 0 14px rgba(var(--v85-rose-rgb), 0.4),
      0 0 28px rgba(var(--v85-rose-rgb), 0.14),
      inset 0 1px 0 rgba(0,0,0,0.04);
  }
}
[data-theme="light"] .fx-glow-v5 {
  box-shadow:
    0 0 16px rgba(20, 184, 166, 0.22),
    inset 0 1px 0 rgba(0,0,0,0.04);
}
[data-theme="light"] .fx-glow-v5::after {
  background: radial-gradient(ellipse 50% 60% at 50% 0%,
    rgba(20, 184, 166, 0.32) 0%,
    rgba(34, 197, 94, 0.16) 40%,
    transparent 80%);
}
[data-theme="light"] .fx-glow-v6 {
  box-shadow: 0 10px 20px rgba(0,0,0,0.1), inset 0 1px 0 rgba(0,0,0,0.04);
}
[data-theme="light"] .fx-glow-v6::before { opacity: 0.55; }
[data-theme="light"] .fx-glow-v7 {
  border-color: rgba(0,0,0,0.06);
  box-shadow:
    0 10px 20px rgba(0,0,0,0.1),
    0 0 12px rgba(16, 185, 129, 0.18),
    inset 0 1px 0 rgba(0,0,0,0.04);
}
[data-theme="light"] .fx-glow-v7::before {
  background: linear-gradient(115deg,
    transparent 0%, transparent 35%,
    rgba(0,0,0,0.06) 50%,
    transparent 65%, transparent 100%);
}
[data-theme="light"] .fx-glow-v8 {
  background: rgba(255, 250, 252, 0.7) !important;
  border-color: rgba(0,0,0,0.08) !important;
  box-shadow:
    0 16px 32px rgba(0,0,0,0.1),
    inset 0 1px 0 rgba(255,255,255,0.6),
    inset 0 -1px 0 rgba(0,0,0,0.06),
    inset 0 0 16px rgba(var(--v85-cyan-rgb), 0.12);
}
[data-theme="light"] .fx-glow-v9 {
  box-shadow:
    0 14px 28px rgba(0,0,0,0.12),
    inset 0 1px 0 rgba(0,0,0,0.04);
}
[data-theme="light"] .fx-glow-v9::before {
  background: radial-gradient(circle,
    rgba(var(--v85-rose-rgb), 0.32) 0%,
    rgba(var(--v85-rose-rgb), 0.1) 50%,
    transparent 80%);
}
[data-theme="light"] .fx-glow-v9::after {
  background: radial-gradient(circle,
    rgba(var(--v85-ember-rgb), 0.2) 0%,
    rgba(var(--v85-ember-rgb), 0.08) 45%,
    transparent 80%);
}
[data-theme="light"] .fx-glow-v10 {
  box-shadow:
    0 20px 40px rgba(0,0,0,0.15),
    0 8px 16px rgba(0,0,0,0.08),
    0 0 0 1px rgba(var(--v85-violet-rgb), 0.16),
    inset 0 1px 0 rgba(0,0,0,0.03);
}
```

- [ ] **Step 2: Append U-variant light theme overrides**

Edit `src/index.css`:

```css
[data-theme="light"] .fx-glow-u1 {
  box-shadow:
    0 16px 32px rgba(0,0,0,0.1),
    0 6px 12px rgba(0,0,0,0.06),
    inset 0 1px 0 rgba(0,0,0,0.03);
}
[data-theme="light"] .fx-glow-u2 {
  box-shadow:
    0 16px 32px rgba(0,0,0,0.1),
    0 0 24px rgba(var(--v85-cyan-rgb), 0.1),
    inset 0 1px 0 rgba(0,0,0,0.04);
}
[data-theme="light"] .fx-glow-u3 {
  box-shadow:
    0 16px 32px rgba(0,0,0,0.1),
    0 0 24px rgba(var(--v85-ember-rgb), 0.14),
    inset 0 1px 0 rgba(0,0,0,0.04);
}
[data-theme="light"] .fx-glow-u4 {
  box-shadow:
    0 16px 32px rgba(0,0,0,0.1),
    0 -6px 24px rgba(var(--v85-cyan-rgb), 0.08),
    0 10px 24px rgba(var(--v85-ember-rgb), 0.1),
    inset 0 1px 0 rgba(0,0,0,0.04);
}
[data-theme="light"] .fx-glow-u5 {
  border-color: rgba(var(--v85-ember-rgb), 0.2) !important;
  box-shadow:
    0 16px 32px rgba(0,0,0,0.12),
    0 0 0 1px rgba(var(--v85-ember-rgb), 0.1),
    inset 0 1px 0 rgba(255,255,255,0.6);
}
[data-theme="light"] .fx-glow-u6 {
  animation: v85-u6-breathe-light 8s ease-in-out infinite;
}
@keyframes v85-u6-breathe-light {
  0%, 100% {
    box-shadow:
      0 14px 28px rgba(0,0,0,0.1),
      0 0 18px rgba(var(--v85-ember-rgb), 0.1),
      inset 0 1px 0 rgba(0,0,0,0.04);
  }
  50% {
    box-shadow:
      0 18px 36px rgba(0,0,0,0.12),
      0 0 28px rgba(var(--v85-ember-rgb), 0.16),
      inset 0 1px 0 rgba(0,0,0,0.05);
  }
}
[data-theme="light"] .fx-glow-u7 {
  box-shadow:
    0 4px 8px rgba(0,0,0,0.08),
    0 8px 16px rgba(0,0,0,0.1),
    0 18px 36px rgba(0,0,0,0.14),
    inset 0 1px 0 rgba(0,0,0,0.04);
}
[data-theme="light"] .fx-glow-u8 {
  border-color: rgba(0,0,0,0.08) !important;
  box-shadow:
    0 14px 28px rgba(0,0,0,0.1),
    inset 0 1px 0 rgba(255,255,255,0.5),
    inset 0 0 18px rgba(0,0,0,0.02);
}
[data-theme="light"] .fx-glow-u9 {
  box-shadow:
    0 14px 28px rgba(0,0,0,0.1),
    0 0 18px var(--u9-tint, rgba(var(--v85-ember-rgb), 0.16)),
    inset 0 1px 0 rgba(0,0,0,0.04);
}
/* U9 per-domain tints use the same RGB triples in light — opacity slightly
   lifted (0.16→0.2) so they read on white bg. */
[data-theme="light"] .fx-glow-u9-sales        { --u9-tint: rgba(239, 68, 68, 0.2); }
[data-theme="light"] .fx-glow-u9-customers    { --u9-tint: rgba(6, 182, 212, 0.2); }
[data-theme="light"] .fx-glow-u9-finance      { --u9-tint: rgba(16, 185, 129, 0.2); }
[data-theme="light"] .fx-glow-u9-marketing    { --u9-tint: rgba(168, 85, 247, 0.2); }
[data-theme="light"] .fx-glow-u9-stock        { --u9-tint: rgba(245, 158, 11, 0.2); }
[data-theme="light"] .fx-glow-u9-reports      { --u9-tint: rgba(14, 165, 233, 0.2); }
[data-theme="light"] .fx-glow-u9-master       { --u9-tint: rgba(250, 204, 21, 0.2); }
[data-theme="light"] .fx-glow-u9-appointments { --u9-tint: rgba(59, 130, 246, 0.2); }
[data-theme="light"] .fx-glow-u10 {
  background: rgba(255, 250, 252, 0.6) !important;
  border-color: rgba(0,0,0,0.08) !important;
  box-shadow:
    0 14px 28px rgba(0,0,0,0.1),
    inset 0 1px 0 rgba(0,0,0,0.04);
}
```

- [ ] **Step 3: Verify build clean**

Run:
```bash
npm run build 2>&1 | tail -5
```
Expected: build clean.

### Task A.6 — Reduced-motion overrides

**Files:**
- Modify: `src/index.css` (append AFTER light theme overrides from Task A.5)

- [ ] **Step 1: Append reduced-motion media query**

Edit `src/index.css`:

```css
/* ─── Reduced motion — disable all V85 animations ────────────────────── */
@media (prefers-reduced-motion: reduce) {
  .fx-glow-v4,
  .fx-glow-v4 [data-theme="light"] &,
  .fx-glow-v5::after,
  .fx-glow-v6::before, .fx-glow-v6::after,
  .fx-glow-v7::before,
  .fx-glow-v9::before, .fx-glow-v9::after,
  .fx-glow-u6 {
    animation: none !important;
  }
}
/* End V85 — Universal Glow Effect Utilities */
```

- [ ] **Step 2: Verify build clean**

Run:
```bash
npm run build 2>&1 | tail -5
```
Expected: build clean.

### Task A.7 — Source-grep regression test (CG1-CG7)

**Files:**
- Create: `tests/v85-glow-utility-css.test.js`

- [ ] **Step 1: Write the failing test file**

Create `tests/v85-glow-utility-css.test.js`:

```javascript
// ─── V85 Glow Utility CSS — Source-Grep Regression Test (2026-05-18) ──
//
// Locks the contract per spec §8.2 + AV81. CG1-CG7 cover:
//   CG1 — every utility class exists in src/index.css
//   CG2 — every utility has a [data-theme="light"] override
//   CG3 — animated utilities have prefers-reduced-motion overrides
//   CG4 — V85 color tokens exist in :root + [data-theme="light"]
//   CG5 — sanctioned exceptions (menu + print files) have ZERO fx-glow-*
//   CG6 — application audit count (skip until Phase B+ ships)
//   CG7 — V1 fire-pulse + .bloom-* + .menu-* unchanged from pre-V85

import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const CSS = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8');

const V_VARIANTS = ['v2','v3','v4','v5','v6','v7','v8','v9','v10'];
const U_VARIANTS = ['u1','u2','u3','u4','u5','u6','u7','u8','u9','u10'];
const U9_DOMAINS = ['sales','customers','finance','marketing','stock','reports','master','appointments'];
const ANIMATED_VARIANTS = ['v4','v5','v6','v7','v9','u6']; // require reduced-motion override

describe('V85 — Glow Utility CSS', () => {
  describe('CG1 — every utility class exists', () => {
    V_VARIANTS.forEach(v => {
      it(`CG1.v.${v} — .fx-glow-${v} defined`, () => {
        expect(CSS).toMatch(new RegExp(`\\.fx-glow-${v}\\s*\\{`));
      });
    });
    U_VARIANTS.forEach(u => {
      it(`CG1.u.${u} — .fx-glow-${u} defined`, () => {
        expect(CSS).toMatch(new RegExp(`\\.fx-glow-${u}\\s*\\{`));
      });
    });
    U9_DOMAINS.forEach(d => {
      it(`CG1.u9.${d} — .fx-glow-u9-${d} defined`, () => {
        expect(CSS).toMatch(new RegExp(`\\.fx-glow-u9-${d}\\s*\\{`));
      });
    });
  });

  describe('CG2 — every utility has [data-theme="light"] override', () => {
    [...V_VARIANTS, ...U_VARIANTS].forEach(name => {
      it(`CG2.${name} — light-theme override present`, () => {
        expect(CSS).toMatch(new RegExp(`\\[data-theme="light"\\][^{]*\\.fx-glow-${name}\\b`));
      });
    });
    U9_DOMAINS.forEach(d => {
      it(`CG2.u9-${d} — light-theme override present`, () => {
        expect(CSS).toMatch(new RegExp(`\\[data-theme="light"\\][^{]*\\.fx-glow-u9-${d}\\b`));
      });
    });
  });

  describe('CG3 — animated utilities have prefers-reduced-motion overrides', () => {
    it('CG3.0 — @media (prefers-reduced-motion: reduce) block exists in V85 region', () => {
      const v85Region = CSS.match(/V85 — Universal Glow Effect Utilities[\s\S]*?End V85 — Universal Glow Effect Utilities/);
      expect(v85Region).not.toBeNull();
      expect(v85Region[0]).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    });
    ANIMATED_VARIANTS.forEach(name => {
      it(`CG3.${name} — listed in reduced-motion block`, () => {
        const v85Region = CSS.match(/V85 — Universal Glow Effect Utilities[\s\S]*?End V85 — Universal Glow Effect Utilities/);
        const reducedBlock = v85Region[0].match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\n\}/);
        expect(reducedBlock).not.toBeNull();
        expect(reducedBlock[0]).toMatch(new RegExp(`\\.fx-glow-${name}\\b`));
      });
    });
  });

  describe('CG4 — V85 color tokens', () => {
    it('CG4.1 — --v85-ember-rgb defined in :root', () => {
      expect(CSS).toMatch(/:root\s*\{[^}]*--v85-ember-rgb:/s);
    });
    it('CG4.2 — --v85-rose-rgb defined', () => {
      expect(CSS).toMatch(/--v85-rose-rgb:/);
    });
    it('CG4.3 — --v85-cyan-rgb defined', () => {
      expect(CSS).toMatch(/--v85-cyan-rgb:/);
    });
    it('CG4.4 — --v85-violet-rgb defined', () => {
      expect(CSS).toMatch(/--v85-violet-rgb:/);
    });
    it('CG4.5 — all 4 tokens swap in light theme', () => {
      const lightBlock = CSS.match(/\[data-theme="light"\]\s*\{[^}]*--v85-ember-rgb[\s\S]*?\}/);
      expect(lightBlock).not.toBeNull();
      ['ember','rose','cyan','violet'].forEach(name => {
        expect(lightBlock[0]).toMatch(new RegExp(`--v85-${name}-rgb:`));
      });
    });
    it('CG4.6 — @property --v85-v6-hue registered', () => {
      expect(CSS).toMatch(/@property\s+--v85-v6-hue\s*\{[^}]*syntax:\s*'<angle>'/);
    });
  });

  describe('CG5 — sanctioned NO-CLASS exceptions', () => {
    const SANCTIONED_FILES = [
      // Menu system (user guardrail 2026-05-18 EOD+9)
      'src/components/backend/shell/BackendArcBloom.jsx',
      'src/components/backend/shell/BackendSubTabBloom.jsx',
      'src/components/backend/shell/BackendDuoPill.jsx',
      'src/components/backend/nav/BackendSidebar.jsx',
      'src/components/backend/nav/BackendMobileDrawer.jsx',
      'src/components/backend/nav/BackendCmdPalette.jsx',
      // Print render path
      'src/components/SalePrintView.jsx',
      'src/components/QuotationPrintView.jsx',
      'src/components/backend/BulkPrintModal.jsx',
      'src/components/backend/DocumentPrintModal.jsx',
      'src/lib/documentPrintEngine.js',
    ];
    SANCTIONED_FILES.forEach(rel => {
      it(`CG5 — ${rel} has ZERO fx-glow-* references`, () => {
        const path = join(process.cwd(), rel);
        if (!existsSync(path)) {
          // Sanctioned file may not exist in repo yet — skip if absent
          return;
        }
        const src = readFileSync(path, 'utf8');
        expect(src).not.toMatch(/fx-glow-/);
      });
    });
  });

  describe('CG7 — pre-V85 baseline unchanged', () => {
    it('CG7.1 — .bloom-orb base rule preserved', () => {
      // Just assert the rule still exists; full byte-hash would be brittle.
      expect(CSS).toMatch(/\.bloom-orb\s*\{[\s\S]*?border-radius:\s*22px/);
    });
    it('CG7.2 — @keyframes fire-pulse still exists', () => {
      expect(CSS).toMatch(/@keyframes\s+fire-pulse\s*\{/);
    });
    it('CG7.3 — @keyframes chat-blink at 10px halo (V84 lock)', () => {
      expect(CSS).toMatch(/@keyframes\s+chat-blink[\s\S]*?box-shadow:\s*0\s+0\s+10px/);
    });
    it('CG7.4 — .menu-tab-scroll padding-margin trick preserved (V84 lock)', () => {
      expect(CSS).toMatch(/\.menu-tab-scroll\s*\{[\s\S]*?padding-top:\s*10px[\s\S]*?margin-top:\s*-10px/);
    });
    it('CG7.5 — .menu-badge top:-6px right:-6px preserved (V84 lock)', () => {
      const menuBadge = CSS.match(/\.menu-badge\s*\{[^}]*\}/);
      expect(menuBadge).not.toBeNull();
      expect(menuBadge[0]).toMatch(/top:\s*-6px/);
      expect(menuBadge[0]).toMatch(/right:\s*-6px/);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run:
```bash
npx vitest run tests/v85-glow-utility-css.test.js
```
Expected: PASS — all CG1-CG7 assertions green (CG1: 9+10+8=27, CG2: 27, CG3: 7, CG4: 6, CG5: 11 (some may auto-skip if files missing), CG7: 5 → ~83 total assertions). CG6 is intentionally absent in Phase A — it tests `fx-glow-*` count in src/ which is 0 until Phase B+ ships; added in Phase E.

### Task A.8 — Phase A commit

- [ ] **Step 1: Run full vitest to verify no regression**

Run:
```bash
npm test -- --run 2>&1 | tail -10
```
Expected: existing test count + 83 new V85 assertions, all PASS. Build clean.

- [ ] **Step 2: Run build**

Run:
```bash
npm run build 2>&1 | tail -5
```
Expected: build clean (2-3 sec).

- [ ] **Step 3: Commit Phase A**

Run:
```bash
git add src/index.css tests/v85-glow-utility-css.test.js
git commit -m "feat(V85-Phase-A): CSS foundation — 20 glow utility classes + 8 U9 sub-modifiers + light theme + reduced-motion + tests

Adds 19 main utility classes (.fx-glow-v[2-10] + .fx-glow-u[1-10]) + 8 U9
per-domain sub-modifiers to src/index.css per the V85 spec. Each utility:
- Has a [data-theme=light] override mirroring colors to pink-sakura family
- Animated variants (V4/V5/V6/V7/V9/U6) honor prefers-reduced-motion
- Uses 4 V85 color tokens (--v85-{ember,rose,cyan,violet}-rgb) registered
  in :root + light theme swap
- V6 uses @property --v85-v6-hue for conic-gradient color cycling so the
  element bounding box stays inside the frame (no transform rotation)

V1 Bloom-Classic NOT exported — locked inside BackendArcBloom per spec §4.

Tier 2 source-grep regression test (tests/v85-glow-utility-css.test.js)
covers CG1-CG5 + CG7 — ~83 assertions locking:
  CG1 — every utility class defined
  CG2 — every utility has light-theme override
  CG3 — animated variants in @media (prefers-reduced-motion: reduce)
  CG4 — 4 color tokens + @property registered
  CG5 — sanctioned NO-CLASS exceptions (6 menu files + 5 print files)
  CG7 — V1/V84/.menu-*/.bloom-* baseline rules preserved (no regression)

CG6 (application count) added in Phase E once Phase B+ have applied
fx-glow-* classes to components.

Spec: docs/superpowers/specs/2026-05-18-v85-glow-effect-universal-design.md
AV81: .claude/skills/audit-anti-vibe-code/SKILL.md
Visual ref: public/v85-glow-variants.html

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase B — Universal/Content Layer (single commit, ~20 component touches)

Apply U-utility classes to non-menu content surfaces. Each task = one surface type. Each step within a task applies ONE pattern across the listed files; the verify step confirms build + targeted tests pass.

### Task B.1 — Page-body wrappers (U3)

**Files** (modify each — add `fx-glow-u3` to the OUTER content wrapper, NOT the menu shell):
- `src/pages/AdminDashboard.jsx` — the `<main>`-like content `<div>` AFTER `</header>` (the menu shell stays untouched)
- `src/components/backend/BackendDashboard.jsx` — the content-area `<div>` inside the shell

- [ ] **Step 1: Find AdminDashboard content area boundary**

Run:
```bash
grep -n "data-testid=\"admin-top-menu\"" src/pages/AdminDashboard.jsx
```
Note the closing `</header>` line number. The wrapper that opens AFTER that closing header tag is the content area to touch.

- [ ] **Step 2: Add fx-glow-u3 to AdminDashboard content wrapper**

Identify the `<div>` immediately following the closing `</header>` of the top menu shell. Add `fx-glow-u3` to its className.

Example pattern:
```jsx
{/* before */}
<div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">

{/* after */}
<div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8 fx-glow-u3">
```

- [ ] **Step 3: Add fx-glow-u3 to BackendDashboard content area**

Open `src/components/backend/BackendDashboard.jsx`. Find the `<main>` or content-area `<div>` that holds the tab content (NOT the sidebar, NOT the mobile drawer, NOT the cmd palette mount point). Add `fx-glow-u3`.

- [ ] **Step 4: Verify build clean**

Run:
```bash
npm run build 2>&1 | tail -5
```
Expected: build clean.

- [ ] **Step 5: Verify menu untouched via grep**

Run:
```bash
grep -E "fx-glow-" src/components/backend/shell/ src/components/backend/nav/ 2>&1
```
Expected: empty output (no menu files have any glow class).

### Task B.2 — Data tables (U2)

**Files** (apply `fx-glow-u2` to the outer `<div>` of each list/table wrapper):
- `src/components/backend/CustomerListTab.jsx` — the customer list grid wrapper
- `src/components/backend/SaleTab.jsx` — the sale list table wrapper
- `src/components/backend/ProductsTab.jsx` — product list wrapper
- `src/components/backend/CoursesTab.jsx` — course list wrapper
- `src/components/backend/StaffTab.jsx` — staff list wrapper (NOT the form modal wrapper)
- `src/components/backend/DoctorsTab.jsx` — doctor list wrapper
- `src/components/backend/BranchesTab.jsx` — branch list wrapper
- `src/components/backend/MovementLogPanel.jsx` — movement log table
- `src/components/backend/StockBalancePanel.jsx` — stock balance table
- `src/components/backend/reports/SaleReportTab.jsx` — report table wrapper
- `src/components/backend/reports/CustomerReportTab.jsx`
- `src/components/backend/reports/AppointmentReportTab.jsx`

- [ ] **Step 1: Apply fx-glow-u2 to each file's list/table wrapper**

For each file in the list above, find the outer `<div>` that holds the rendered list/table (typically has class `space-y-2` or `divide-y` or `overflow-x-auto`). Add `fx-glow-u2` to the className.

Example:
```jsx
{/* before */}
<div className="bg-[var(--bg-card)] rounded-2xl divide-y divide-[var(--bd)]">

{/* after */}
<div className="bg-[var(--bg-card)] rounded-2xl divide-y divide-[var(--bd)] fx-glow-u2">
```

- [ ] **Step 2: Verify build clean**

Run:
```bash
npm run build 2>&1 | tail -5
```
Expected: build clean.

### Task B.3 — Form panels (U5)

**Files**:
- `src/components/backend/StaffFormModal.jsx` — main form panel
- `src/components/backend/DoctorFormModal.jsx` — main form panel
- `src/components/ClinicSettingsPanel.jsx` — settings card sections (apply to each `<section>` or `<div role="region">`)
- `src/components/backend/SystemSettingsTab.jsx` — settings groups (each top-level group panel)
- `src/components/backend/PermissionGroupFormModal.jsx` — form panel
- `src/components/backend/BranchFormModal.jsx`

- [ ] **Step 1: Apply fx-glow-u5 to form panel wrappers**

For each file, find the form panel `<div>` (typically holds inputs in a `space-y-4` or `grid` layout). Add `fx-glow-u5`.

- [ ] **Step 2: Verify build clean**

Run:
```bash
npm run build 2>&1 | tail -5
```
Expected: build clean.

### Task B.4 — Section group dividers (U4)

**Files** (apply `fx-glow-u4` to in-content section group headers — typically `<h3>` or `<div>` with a group title):
- `src/components/backend/SystemSettingsTab.jsx` — "ตั้งค่าทั่วไป" / "ความปลอดภัย" / "การแสดงผล" group title boxes
- `src/components/backend/StaffFormModal.jsx` — "ข้อมูลทั่วไป" / "สิทธิ์การเข้าถึง" group titles
- `src/components/backend/PermissionGroupFormModal.jsx` — permission category group titles
- `src/components/ClinicSettingsPanel.jsx` — section header bars within each region

- [ ] **Step 1: Apply fx-glow-u4 to section group header containers**

For each file, locate the section group title containers and add `fx-glow-u4`.

- [ ] **Step 2: Verify build clean**

Run:
```bash
npm run build 2>&1 | tail -5
```
Expected: build clean.

### Task B.5 — In-content popovers, tooltips, dropdowns (U7)

**Files** (apply `fx-glow-u7` to in-content overlay popovers — NOT BackendCmdPalette / BackendMobileDrawer / menu-related):
- `src/components/backend/StaffSelectField.jsx` — staff picker dropdown panel
- `src/components/backend/ProductSelectField.jsx` — product picker dropdown panel
- Custom popover/tooltip containers within form modals if any exist

- [ ] **Step 1: Apply fx-glow-u7 to dropdown panel wrappers**

For each file above, find the absolutely-positioned dropdown panel `<div>` and add `fx-glow-u7`.

- [ ] **Step 2: Confirm BackendCmdPalette NOT touched**

Run:
```bash
grep -E "fx-glow-" src/components/backend/nav/BackendCmdPalette.jsx 2>&1
```
Expected: empty (no matches — it's a menu, sanctioned exception).

- [ ] **Step 3: Verify build clean**

Run:
```bash
npm run build 2>&1 | tail -5
```
Expected: build clean.

### Task B.6 — Live data widgets (U6)

**Files** (apply `fx-glow-u6` to widgets that show real-time data — restricted scope to avoid breathing on everything):
- `src/pages/AdminDashboard.jsx` — the today/queue tile (the small panel that shows live count of patients waiting)
- `src/components/backend/reports/widgets/LiveQueueWidget.jsx` (if exists — otherwise skip)

- [ ] **Step 1: Locate the live tile in AdminDashboard**

Run:
```bash
grep -n "วันนี้\|คิวรอ\|รอเข้าตรวจ" src/pages/AdminDashboard.jsx | head -5
```
Identify the small panel/tile that displays the live count.

- [ ] **Step 2: Apply fx-glow-u6 to the live tile**

Add `fx-glow-u6` to the tile's outer className.

- [ ] **Step 3: Verify build clean**

Run:
```bash
npm run build 2>&1 | tail -5
```
Expected: build clean.

### Task B.7 — Page title bars (U9 per-domain)

**Files** — every Backend tab content has a title bar at the top of its rendered content. Apply `fx-glow-u9` + the matching `fx-glow-u9-{domain}` sub-modifier:
- `src/components/backend/SaleTab.jsx` — title bar → `fx-glow-u9 fx-glow-u9-sales`
- `src/components/backend/CustomerListTab.jsx` — `fx-glow-u9 fx-glow-u9-customers`
- `src/components/backend/reports/ReportsHomeTab.jsx` — `fx-glow-u9 fx-glow-u9-reports`
- `src/components/backend/MasterDataTab.jsx` — `fx-glow-u9 fx-glow-u9-master`
- `src/components/backend/StockTab.jsx` (or equivalent stock landing) — `fx-glow-u9 fx-glow-u9-stock`
- `src/components/backend/PromotionTab.jsx` (or equivalent marketing landing) — `fx-glow-u9 fx-glow-u9-marketing`
- `src/components/backend/reports/PnLReportTab.jsx` (or equivalent finance) — `fx-glow-u9 fx-glow-u9-finance`
- `src/components/backend/AppointmentTab.jsx` — `fx-glow-u9 fx-glow-u9-appointments`

- [ ] **Step 1: Apply U9 per-domain to each title bar**

For each file, find the title bar `<div>` (typically holds the section heading + action buttons). Add both classes — example for SaleTab:

```jsx
{/* before */}
<div className="flex items-center justify-between mb-4">
  <h2 className="text-xl font-bold">การขาย</h2>
  <button ...>+ ใบขายใหม่</button>
</div>

{/* after */}
<div className="flex items-center justify-between mb-4 fx-glow-u9 fx-glow-u9-sales">
  <h2 className="text-xl font-bold">การขาย</h2>
  <button ...>+ ใบขายใหม่</button>
</div>
```

- [ ] **Step 2: Verify build clean**

Run:
```bash
npm run build 2>&1 | tail -5
```
Expected: build clean.

### Task B.8 — Read-only panels (U8)

**Files** (apply `fx-glow-u8` to read-only / archived / history-display panels):
- `src/components/backend/CustomerDetailView.jsx` — the audit-trail / history sub-panels (NOT the main detail card — that gets V9 in Phase C)
- `src/components/backend/AuditLogPanel.jsx` (if exists)
- `src/components/backend/reports/ArchivedReportsPanel.jsx` (if exists)

- [ ] **Step 1: Identify read-only sub-panels in CustomerDetailView**

Run:
```bash
grep -n "ประวัติ\|audit\|archive" src/components/backend/CustomerDetailView.jsx | head -10
```

- [ ] **Step 2: Apply fx-glow-u8 to history/audit sub-panels**

Add `fx-glow-u8` to each read-only panel's outer wrapper.

- [ ] **Step 3: Verify build clean**

Run:
```bash
npm run build 2>&1 | tail -5
```
Expected: build clean.

### Task B.9 — In-content search bars + secondary controls (U1)

**Files** (apply `fx-glow-u1` to in-content search bars — NOT the menu search):
- `src/components/backend/CustomerListTab.jsx` — search input wrapper at top of tab
- `src/components/backend/SaleTab.jsx` — search input wrapper
- `src/components/backend/ProductsTab.jsx` — search wrapper
- Any breadcrumb or secondary control wrapper in `BackendDashboard.jsx` (NOT the menu shell)

- [ ] **Step 1: Apply fx-glow-u1 to in-content search wrappers**

For each file, locate the search input's wrapper `<div>` and add `fx-glow-u1`.

- [ ] **Step 2: Verify build clean**

Run:
```bash
npm run build 2>&1 | tail -5
```
Expected: build clean.

### Task B.10 — Phase B verify + commit

- [ ] **Step 1: Run full vitest**

Run:
```bash
npm test -- --run 2>&1 | tail -10
```
Expected: all tests pass. No V21-class regressions from existing source-grep tests.

- [ ] **Step 2: Verify CG5 sanctioned exception list still clean**

Run:
```bash
npx vitest run tests/v85-glow-utility-css.test.js -t "CG5"
```
Expected: all CG5 assertions PASS (every menu file + print file has ZERO fx-glow-* references).

- [ ] **Step 3: Build + manual preview verify**

Run:
```bash
npm run build 2>&1 | tail -5
```
Expected: build clean.

Open `http://localhost:5173/` in browser (dev server is already running). Verify visually:
- Menu (top bar + Backend bloom) UNCHANGED
- Backend dashboard content area has subtle warm ember glow
- Tables have cool ambient cyan tint
- Form modals have amber-border + drop shadow
- Page title bars have per-domain colored glow

- [ ] **Step 4: Commit Phase B**

Run:
```bash
git add -A
git commit -m "feat(V85-Phase-B): apply U-variants to content surfaces (~20 components)

Phase B applies U-utility classes per spec §4.2 to non-menu content
surfaces. All menu / shell / drawer / cmd-palette files remain untouched
(sanctioned exception via AV81 CG5).

Surface-type mapping:
- U1 Subtle Drop  → in-content search bars (CustomerListTab, SaleTab,
                    ProductsTab)
- U2 Cool Ambient → data tables (12 list/report tabs)
- U3 Warm Ember   → page-body content wrappers (AdminDashboard +
                    BackendDashboard \"main\" area)
- U4 Dual-Tone    → in-content form section dividers (SystemSettingsTab,
                    StaffFormModal, PermissionGroupFormModal,
                    ClinicSettingsPanel section header bars)
- U5 Border+Drop  → form panels (StaffFormModal, DoctorFormModal,
                    ClinicSettingsPanel, SystemSettingsTab,
                    PermissionGroupFormModal, BranchFormModal)
- U6 Slow Pulse   → live data widgets (today/queue tile in AdminDashboard)
- U7 Layered     → in-content popovers (StaffSelectField,
                    ProductSelectField dropdown panels) — NOT
                    BackendCmdPalette
- U8 Inner Glow   → read-only display panels in CustomerDetailView
                    (history/audit sub-panels)
- U9 Per-Domain   → page title bars per tab (8 sub-modifiers:
                    sales/customers/finance/marketing/stock/reports/
                    master/appointments)

All edits are single-class additions to existing wrapper divs. No JSX
restructuring, no behavioral changes, no business logic touched.

Tier 2 verify:
- CG5 (sanctioned exceptions) all green: 6 menu files + 5 print files
  have ZERO fx-glow-* references
- Full vitest green
- Build clean

Spec: docs/superpowers/specs/2026-05-18-v85-glow-effect-universal-design.md

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase C — Card/Focal Layer (single commit, ~30 component touches)

Apply V-utility classes to focal cards (the "look here" elements).

### Task C.1 — KPI hero cards (V5)

**Files** (apply `fx-glow-v5` to the topmost stat/KPI cards):
- `src/pages/AdminDashboard.jsx` — top stat strip (3-4 KPI cards showing today's count / revenue / etc.)
- `src/components/backend/reports/ReportsHomeTab.jsx` — landing tile grid (the 6-8 large tiles linking to specific reports)
- `src/components/backend/reports/widgets/KpiStripWidget.jsx` (if exists)

- [ ] **Step 1: Apply fx-glow-v5 to AdminDashboard top KPI strip**

Locate the top stat strip in AdminDashboard.jsx — typically a grid of 3-4 cards. Add `fx-glow-v5` to each card's className.

- [ ] **Step 2: Apply fx-glow-v5 to Reports landing tiles**

For each landing tile in ReportsHomeTab.jsx, add `fx-glow-v5` to the tile className.

- [ ] **Step 3: Verify build clean**

Run:
```bash
npm run build 2>&1 | tail -5
```
Expected: build clean.

### Task C.2 — Detail-view focal cards (V9)

**Files**:
- `src/components/backend/CustomerDetailView.jsx` — the main grid/panel that shows customer info (NOT the audit-log sub-panel which got U8 in Phase B)
- `src/components/backend/RecallDetailModal.jsx` — body card inside the modal (the modal CONTENT, not the backdrop)
- `src/components/backend/TreatmentTimelineModal.jsx` — main timeline body (NOT the modal backdrop)

- [ ] **Step 1: Apply fx-glow-v9 to CustomerDetailView main panel**

Find the main customer-info card in CustomerDetailView.jsx (the largest panel that holds name + HN + contact + stats). Add `fx-glow-v9`.

- [ ] **Step 2: Apply fx-glow-v9 to detail modal body cards**

For RecallDetailModal.jsx and TreatmentTimelineModal.jsx, locate the body card (NOT the outer modal backdrop). Add `fx-glow-v9`.

- [ ] **Step 3: Verify build clean**

Run:
```bash
npm run build 2>&1 | tail -5
```
Expected: build clean.

### Task C.3 — Page-level large containers (V3)

**Files**:
- `src/components/backend/BackupManagerTab.jsx` — outer panel of the backup management page (typically a large `<div>` that holds the whole backup UI)
- `src/components/backend/BranchBackupTab.jsx` — similar
- `src/components/backend/BackendArcBloom.jsx` — **DO NOT TOUCH** (sanctioned exception; reminder to plan executor)
- `src/components/backend/customer-detail/TreatmentHistorySectionCard.jsx` (if exists) — large history container

- [ ] **Step 1: Apply fx-glow-v3 to BackupManagerTab outer panel**

Find the outermost panel `<div>` in BackupManagerTab.jsx and add `fx-glow-v3`.

- [ ] **Step 2: Apply fx-glow-v3 to BranchBackupTab outer panel**

Same approach for BranchBackupTab.jsx.

- [ ] **Step 3: Confirm BackendArcBloom NOT touched**

Run:
```bash
grep -E "fx-glow-" src/components/backend/shell/BackendArcBloom.jsx 2>&1
```
Expected: empty.

- [ ] **Step 4: Verify build clean**

Run:
```bash
npm run build 2>&1 | tail -5
```
Expected: build clean.

### Task C.4 — Active/selected list rows (V2)

**Files** — apply `fx-glow-v2` CONDITIONALLY on the active/selected state:
- `src/components/backend/CustomerListTab.jsx` — selected customer row
- `src/components/backend/SaleTab.jsx` — selected sale row
- `src/components/backend/ProductsTab.jsx` — selected product row

- [ ] **Step 1: Apply conditional fx-glow-v2 to CustomerListTab rows**

In CustomerListTab.jsx, find the row component and add `fx-glow-v2` ONLY when the row is the selected/active one. Example:

```jsx
{/* before */}
<div className={`row ${isSelected ? 'ring-2 ring-cyan-400' : ''}`}>

{/* after */}
<div className={`row ${isSelected ? 'ring-2 ring-cyan-400 fx-glow-v2' : ''}`}>
```

If there's no existing isSelected pattern, skip (this surface gets V2 only when the row affordance exists).

- [ ] **Step 2: Repeat for SaleTab + ProductsTab**

Same pattern for the other two files.

- [ ] **Step 3: Verify build clean**

Run:
```bash
npm run build 2>&1 | tail -5
```
Expected: build clean.

### Task C.5 — Alert cards (V4)

**Files**:
- `src/components/backend/RecallTab.jsx` (or RecallListTab) — pending-recall rows that need attention
- `src/components/backend/StockBalancePanel.jsx` — low-stock warning rows
- `src/components/backend/SaleTab.jsx` — overdue-payment sale rows

- [ ] **Step 1: Apply conditional fx-glow-v4 to recall-pending rows**

In the recall list, the row should get `fx-glow-v4` ONLY when status is "pending" (or "overdue"). Add conditional className.

- [ ] **Step 2: Apply conditional fx-glow-v4 to low-stock rows**

In StockBalancePanel.jsx, add `fx-glow-v4` to rows where `qty.remaining <= reorderLevel` (or equivalent low-stock predicate).

- [ ] **Step 3: Apply conditional fx-glow-v4 to overdue sale rows**

In SaleTab.jsx, add `fx-glow-v4` to rows where `paymentStatus === 'overdue'` (or equivalent).

- [ ] **Step 4: Verify build clean**

Run:
```bash
npm run build 2>&1 | tail -5
```
Expected: build clean.

### Task C.6 — VIP/Premium cards (V7)

**Files**:
- `src/components/backend/CustomerDetailView.jsx` — VIP-tier badge card (typically a small panel showing tier level)
- `src/components/backend/CustomerCard.jsx` (or CustomerListTab row component) — VIP indicator card when customer is VIP

- [ ] **Step 1: Apply conditional fx-glow-v7 to VIP-tier cards**

For each file, find the VIP-tier display card and add `fx-glow-v7` conditionally on `customer.vipTier === 'gold'` or similar.

- [ ] **Step 2: Verify build clean**

Run:
```bash
npm run build 2>&1 | tail -5
```
Expected: build clean.

### Task C.7 — Read-only cards (V8)

**Files**:
- `src/components/backend/customer-detail/TreatmentReadOnlyMirror.jsx` — read-only treatment view mirror
- `src/components/backend/customer-detail/AuditLogCard.jsx` (if exists) — audit log entries

- [ ] **Step 1: Apply fx-glow-v8 to TreatmentReadOnlyMirror outer card**

Find the outermost card in TreatmentReadOnlyMirror.jsx and add `fx-glow-v8`.

- [ ] **Step 2: Verify build clean**

Run:
```bash
npm run build 2>&1 | tail -5
```
Expected: build clean.

### Task C.8 — Phase C verify + commit

- [ ] **Step 1: Run full vitest**

Run:
```bash
npm test -- --run 2>&1 | tail -10
```
Expected: all green.

- [ ] **Step 2: Run CG5 sanctioned exception verify**

Run:
```bash
npx vitest run tests/v85-glow-utility-css.test.js -t "CG5"
```
Expected: all CG5 assertions PASS.

- [ ] **Step 3: Build**

Run:
```bash
npm run build 2>&1 | tail -5
```
Expected: build clean.

- [ ] **Step 4: Commit Phase C**

Run:
```bash
git add -A
git commit -m "feat(V85-Phase-C): apply V-variants to card/focal layer (~15-30 components)

Phase C applies V-utility classes per spec §4.1 to focal cards across
Frontend + Backend dashboards.

Surface-type mapping:
- V2 Tight-Rim Neon → selected list rows (CustomerListTab, SaleTab,
                       ProductsTab when isSelected)
- V3 Wide-Aurora    → page-level large containers (BackupManagerTab,
                       BranchBackupTab outer panels)
- V4 Heartbeat      → conditional alert cards (recall-pending rows,
                       low-stock rows, overdue-sale rows — animated 1.8s)
- V5 Jet-Thrust     → KPI hero cards (AdminDashboard top stat strip +
                       ReportsHomeTab landing tiles)
- V7 Holographic    → VIP-tier badge cards (CustomerDetailView + customer
                       list when vipTier=gold)
- V8 Inner Glow     → TreatmentReadOnlyMirror outer card (read-only
                       display)
- V9 Double-Halo    → detail-view focal cards (CustomerDetailView main
                       panel, RecallDetailModal body, TreatmentTimeline
                       Modal body)

All edits are conditional single-class additions to existing wrappers.
BackendArcBloom + BackendSubTabBloom remain untouched per AV81 CG5.

Tier 2 verify:
- CG5 all green (sanctioned exceptions still clean)
- Full vitest green
- Build clean

Spec: docs/superpowers/specs/2026-05-18-v85-glow-effect-universal-design.md

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase D — Modal Layer (single commit, ~70 modals)

Apply `fx-glow-v10` as default to all generic modals + `fx-glow-u10` to all modal backdrops + special-case overrides.

### Task D.1 — Enumerate all modal files

- [ ] **Step 1: List every modal file in src/**

Run:
```bash
find src/components -name "*Modal.jsx" | wc -l
find src/components -name "*Modal.jsx" | sort
```
Expected output: ~70 files. Note the count — Phase D's batch target.

- [ ] **Step 2: Identify special-case modal categories**

Categorize each modal by type using the file name and content. Save categories to a working note:
- **Confirm/Delete modals** → V4 heartbeat (typically named `*Confirm*Modal.jsx`, `*Delete*Modal.jsx`)
- **Celebration modals** → V6 conic-rainbow (typically: VIP tier-up, milestone, achievement, payout-success)
- **Detail-view modals** → V9 double-halo (TreatmentTimelineModal, RecallDetailModal, CustomerDetailView modal mode)
- **Read-only display modals** → V8 inner glow (view-only history, archive viewers)
- **Default (everything else)** → V10 drop+ambient

### Task D.2 — Apply V10 default to generic modal content cards

**Pattern**: every modal has a content card structure like:
```jsx
<div className="fixed inset-0 z-50 flex items-center justify-center">
  <div className="absolute inset-0 bg-black/50" />  {/* backdrop */}
  <div className="relative bg-[var(--bg-surface)] rounded-2xl p-6 ...">  {/* content card */}
    ...modal body...
  </div>
</div>
```

V10 goes on the **content card** (the second nested div); U10 goes on the **backdrop** (the first nested div with bg-black/50).

- [ ] **Step 1: Apply V10 default to non-special-case modals**

For each modal file that is NOT in the special-case categories (confirm/delete, celebration, detail-view, read-only), add `fx-glow-v10` to the content card's className.

Example for a generic info modal:
```jsx
{/* before */}
<div className="relative bg-[var(--bg-surface)] border border-[var(--bd)] rounded-2xl p-6 max-w-md w-full">

{/* after */}
<div className="relative bg-[var(--bg-surface)] border border-[var(--bd)] rounded-2xl p-6 max-w-md w-full fx-glow-v10">
```

- [ ] **Step 2: Verify build clean**

Run:
```bash
npm run build 2>&1 | tail -5
```
Expected: build clean.

### Task D.3 — Apply V4 to confirm/delete modals

**Files** (confirm/delete modal patterns):
- Any modal file containing `confirm` or `delete` in the filename or in the modal title text — discover via grep:
```bash
grep -lr "ยืนยันการลบ\|ยืนยันการ\|ลบรายการ\|Confirm\|กดยืนยัน" src/components | grep -i "modal"
```

- [ ] **Step 1: Apply fx-glow-v4 to each confirm/delete modal's content card**

For each file in the list above, REPLACE `fx-glow-v10` (if added in Task D.2) with `fx-glow-v4` on the content card's className.

- [ ] **Step 2: Verify build clean**

Run:
```bash
npm run build 2>&1 | tail -5
```
Expected: build clean.

### Task D.4 — Apply V9 to detail-view modals

**Files**:
- `src/components/backend/TreatmentTimelineModal.jsx` (already touched in C.2, double-check)
- `src/components/backend/RecallDetailModal.jsx` (already touched in C.2)
- `src/components/backend/CustomerDetailView.jsx` modal mode (if applicable)
- Any other modal showing detailed read+navigate of a single entity

- [ ] **Step 1: Confirm V9 already applied OR apply now**

For each detail-view modal, verify `fx-glow-v9` is on the content card. If V10 was applied in D.2, replace with V9.

- [ ] **Step 2: Verify build clean**

Run:
```bash
npm run build 2>&1 | tail -5
```
Expected: build clean.

### Task D.5 — Apply V8 to read-only display modals

**Files**:
- Any modal that displays archived/historical data with NO editable inputs
- Common patterns: `*ViewModal.jsx`, `*HistoryModal.jsx`, `*AuditModal.jsx`

Discover via:
```bash
grep -lr "read-only\|readonly\|ดูเพียง\|view only" src/components | grep -i "modal"
```

- [ ] **Step 1: Apply fx-glow-v8 to read-only modal content cards**

REPLACE `fx-glow-v10` (if applied in D.2) with `fx-glow-v8` on each read-only modal's content card.

- [ ] **Step 2: Verify build clean**

Run:
```bash
npm run build 2>&1 | tail -5
```
Expected: build clean.

### Task D.6 — Apply V6 to celebration modals

**Files** (if any exist):
- Look for modals related to: VIP upgrade, milestone reach, payout success, achievement, festive events. Common keywords: `tier`, `upgrade`, `milestone`, `achievement`, `success` (where success means a positive emotional moment, not just a successful save).
- Discover:
```bash
grep -lr "ขอแสดงความยินดี\|ปรับระดับ\|ยินดีด้วย\|congratulations" src/components | grep -i "modal"
```

If NO celebration modals exist in the codebase, skip this task (V6 utility remains defined for future use).

- [ ] **Step 1: Apply fx-glow-v6 to celebration modal content cards**

REPLACE `fx-glow-v10` (if applied) with `fx-glow-v6` on celebration modal content cards.

- [ ] **Step 2: Verify build clean**

Run:
```bash
npm run build 2>&1 | tail -5
```
Expected: build clean.

### Task D.7 — Apply U10 glassmorphism to ALL modal backdrops

**Pattern**: every modal's backdrop is the absolutely-positioned bg-black/50-or-similar div.

- [ ] **Step 1: Apply fx-glow-u10 to every modal backdrop**

For each modal file, find the backdrop `<div>` (typically `<div className="absolute inset-0 bg-black/50" />` or `<div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />`). Add `fx-glow-u10` to its className.

**EXCEPT** BackendMobileDrawer.jsx and BackendCmdPalette.jsx backdrops — these are MENU drawers/overlays, sanctioned exceptions, DO NOT TOUCH.

Example:
```jsx
{/* before */}
<div className="absolute inset-0 bg-black/50" onClick={onClose} />

{/* after */}
<div className="absolute inset-0 bg-black/50 fx-glow-u10" onClick={onClose} />
```

- [ ] **Step 2: Confirm menu drawers NOT touched**

Run:
```bash
grep "fx-glow-" src/components/backend/nav/BackendMobileDrawer.jsx src/components/backend/nav/BackendCmdPalette.jsx 2>&1
```
Expected: empty (zero matches).

- [ ] **Step 3: Verify build clean**

Run:
```bash
npm run build 2>&1 | tail -5
```
Expected: build clean.

### Task D.8 — Phase D verify + commit

- [ ] **Step 1: Run full vitest**

Run:
```bash
npm test -- --run 2>&1 | tail -10
```
Expected: all green.

- [ ] **Step 2: Verify CG5 still clean**

Run:
```bash
npx vitest run tests/v85-glow-utility-css.test.js -t "CG5"
```
Expected: all CG5 assertions PASS — every menu file + print file remains glow-class-free.

- [ ] **Step 3: Manual preview verify on a few modals**

Open dev server. Click around to trigger 3-4 modals:
- A confirm/delete modal → should heartbeat-pulse
- A generic info modal → should have V10 drop+ambient glow
- A detail-view modal (CustomerDetailView, TreatmentTimelineModal) → should have V9 double-halo
- Modal backdrops → should appear translucent + blurred (glassmorphism)

If any modal doesn't render its expected glow, identify the missing className and fix.

- [ ] **Step 4: Build + commit Phase D**

Run:
```bash
npm run build 2>&1 | tail -5
git add -A
git commit -m "feat(V85-Phase-D): apply V/U variants to modal layer (~70 modals)

Phase D applies V-utility (modal content card) + U10 (modal backdrop) per
spec §4.1 across all modals in src/components/**.

Pattern:
  <div className=\"fixed inset-0 ...\">
    <div className=\"absolute inset-0 bg-black/50 fx-glow-u10\" />  ← backdrop
    <div className=\"... fx-glow-vN\">  ← content card (V10 default, V4/V6/V8/V9 special)
      ...
    </div>
  </div>

Default + special-case mapping:
- V10 Drop+Ambient → default for all generic modals (info, form,
                      confirm-without-destructive-action)
- V4 Heartbeat   → confirm-delete / destructive-action modals
- V6 Conic       → celebration modals (VIP upgrade, milestone, payout
                    success)
- V8 Inner Glow   → read-only display modals (view-only history)
- V9 Double-Halo  → detail-view modals (TreatmentTimelineModal,
                     RecallDetailModal, CustomerDetailView modal mode)
- U10 Glass       → every modal BACKDROP (NOT menu drawers
                     BackendMobileDrawer / BackendCmdPalette which are
                     sanctioned exceptions)

Tier 2 verify:
- CG5 all green — menu drawers + print modals still untouched
- Full vitest green
- Build clean
- Manual preview: 3-4 modals tested for correct glow rendering

Spec: docs/superpowers/specs/2026-05-18-v85-glow-effect-universal-design.md

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

---

## Phase E — Light Theme Parity + Playwright L1 Verification (single commit)

Visual audit + fine-tune + Rule Q L1 spec.

### Task E.1 — Visual audit on 10 key dark-theme screens

- [ ] **Step 1: Confirm dev server is on dark theme**

Run:
```bash
# In Claude Preview console
```
Eval (via preview tool):
```javascript
document.documentElement.getAttribute('data-theme')
```
Expected: `"dark"` (or null + system-default-to-dark).

- [ ] **Step 2: Visit + visually verify each screen**

For each screen below, navigate via preview, take note of any card that vanishes into background OR has glow too loud:

1. `/` AdminDashboard (top KPI strip + queue list + chat area)
2. `/?backend=1` BackendDashboard landing
3. Backend → CustomerListTab
4. Backend → SaleTab
5. Backend → BackupManagerTab
6. Backend → SystemSettingsTab
7. Backend → ReportsHomeTab
8. Customer detail (click any customer)
9. Any confirm-delete modal (try Delete on a TEST customer)
10. Backup whole-system modal (open + close)

Record findings (paper note OR comment block):
- Which surface has glow too strong?
- Which surface has glow invisible?

### Task E.2 — Switch to light theme, repeat visual audit

- [ ] **Step 1: Toggle theme to light**

In preview console eval:
```javascript
document.documentElement.setAttribute('data-theme', 'light')
```

- [ ] **Step 2: Re-visit same 10 screens; record findings**

For each, verify:
- Menu UNCHANGED (V83 V2 chrome should still look right)
- Content cards have visible separation
- Pink-sakura family glows are subtle, not overwhelming
- Modals still render correctly
- KPI hero cards (V5) still feel "look here"

### Task E.3 — Fine-tune utilities based on findings (if needed)

- [ ] **Step 1: Adjust any utility's opacity if too loud or invisible**

If E.1 or E.2 surfaced any cosmetic issue:
- Open `src/index.css` at the relevant utility block
- Adjust the rgba alpha values (typically reduce by ~20% if too loud, raise by ~20% if invisible)
- Re-test in preview

If NO cosmetic issue found, skip this task (no edits needed).

- [ ] **Step 2: Verify build clean after any tweak**

Run:
```bash
npm run build 2>&1 | tail -5
```
Expected: build clean.

### Task E.4 — Write Playwright L1 spec (Rule Q V66)

**Files:**
- Create: `tests/e2e/v85-glow-utility-application.spec.js`

- [ ] **Step 1: Write 7-scenario spec**

Create `tests/e2e/v85-glow-utility-application.spec.js`:

```javascript
// V85 Glow Utility Application — Playwright L1 Verification (Rule Q V66)
//
// 7 scenarios verify the utility classes are applied AT RUNTIME against
// real prod Firestore (vite dev points at real Firebase). Each scenario
// asserts: (a) the expected fx-glow-* class is present on the right DOM
// element, (b) the computed box-shadow / animation matches the utility's
// contract, (c) theme switching (dark↔light) produces different computed
// styles (proves theme override fires).
//
// Run: npx playwright test tests/e2e/v85-glow-utility-application.spec.js

import { test, expect } from '@playwright/test';

const ADMIN_URL = process.env.ADMIN_URL || 'http://localhost:5173/?backend=1';

// Helper: inject admin auth via REST signInWithPassword (per Rule Q L1)
async function injectAdminAuth(page) {
  const { ADMIN_EMAIL, ADMIN_PASSWORD, FIREBASE_API_KEY } = process.env;
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD || !FIREBASE_API_KEY) {
    test.skip(true, 'Admin credentials not set in env');
    return;
  }
  // signInWithPassword → idToken → inject into localStorage so Vite client
  // SDK picks it up on next page load
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD, returnSecureToken: true }),
  });
  const { idToken, refreshToken, localId } = await res.json();
  await page.addInitScript(({ idToken, refreshToken, localId }) => {
    const stub = {
      uid: localId, email: 'admin', stsTokenManager: {
        accessToken: idToken, refreshToken, expirationTime: Date.now() + 3600000,
      },
    };
    localStorage.setItem(`firebase:authUser:loverclinic-opd-4c39b:[DEFAULT]`, JSON.stringify(stub));
  }, { idToken, refreshToken, localId });
}

test.describe('V85 Glow — Application + theme parity', () => {
  test.beforeEach(async ({ page }) => {
    await injectAdminAuth(page);
    await page.goto(ADMIN_URL);
    await page.waitForLoadState('networkidle');
  });

  test('G1 — BackendDashboard content wrapper has fx-glow-u3 (dark)', async ({ page }) => {
    const wrapper = page.locator('[data-testid="backend-content"]').first();
    await expect(wrapper).toHaveClass(/fx-glow-u3/);
    const shadow = await wrapper.evaluate(el => getComputedStyle(el).boxShadow);
    expect(shadow).toContain('rgba(251, 146, 60');  // ember dark color
    expect(shadow).toMatch(/\d+px/);  // has blur radius
  });

  test('G2 — CustomerDetailView main panel has fx-glow-v9 + ::before + ::after pseudos', async ({ page }) => {
    // Navigate to a customer detail (any customer)
    await page.locator('[data-testid="customer-list"] >> nth=0').click();
    await page.waitForSelector('[data-testid="customer-detail-main"]');
    const main = page.locator('[data-testid="customer-detail-main"]');
    await expect(main).toHaveClass(/fx-glow-v9/);
    const beforeContent = await main.evaluate(el => getComputedStyle(el, '::before').content);
    const afterContent = await main.evaluate(el => getComputedStyle(el, '::after').content);
    expect(beforeContent).not.toBe('none');
    expect(afterContent).not.toBe('none');
  });

  test('G3 — Confirm-Delete modal heartbeat animation running', async ({ page }) => {
    // Trigger a confirm-delete (right-click a TEST customer + delete OR equivalent)
    // For this test, navigate to a known confirm modal path:
    await page.evaluate(() => {
      // Programmatically open a confirm modal by dispatching a custom event
      window.dispatchEvent(new CustomEvent('test:open-confirm-delete'));
    });
    const modal = page.locator('[data-testid="modal-confirm-delete"]');
    await expect(modal).toHaveClass(/fx-glow-v4/);
    const anims = await modal.evaluate(el => el.getAnimations({ subtree: true }).map(a => ({ name: a.animationName, state: a.playState })));
    expect(anims.some(a => a.name === 'v85-heartbeat' && a.state === 'running')).toBe(true);
  });

  test('G4 — Generic info modal has fx-glow-v10 + backdrop has fx-glow-u10', async ({ page }) => {
    await page.evaluate(() => window.dispatchEvent(new CustomEvent('test:open-info-modal')));
    const card = page.locator('[data-testid="modal-info-card"]');
    const backdrop = page.locator('[data-testid="modal-info-backdrop"]');
    await expect(card).toHaveClass(/fx-glow-v10/);
    await expect(backdrop).toHaveClass(/fx-glow-u10/);
    const backdropFilter = await backdrop.evaluate(el => getComputedStyle(el).backdropFilter || getComputedStyle(el).webkitBackdropFilter);
    expect(backdropFilter).toContain('blur');
  });

  test('G5 — Dark→light theme produces different computed box-shadow', async ({ page }) => {
    const wrapper = page.locator('[data-testid="backend-content"]').first();
    const darkShadow = await wrapper.evaluate(el => getComputedStyle(el).boxShadow);
    await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
    await page.waitForTimeout(300);
    const lightShadow = await wrapper.evaluate(el => getComputedStyle(el).boxShadow);
    expect(darkShadow).not.toBe(lightShadow);
    // Light should have lower drop opacity
    const darkOpacity = darkShadow.match(/rgba\(0, 0, 0, ([\d.]+)\)/);
    const lightOpacity = lightShadow.match(/rgba\(0, 0, 0, ([\d.]+)\)/);
    if (darkOpacity && lightOpacity) {
      expect(parseFloat(lightOpacity[1])).toBeLessThan(parseFloat(darkOpacity[1]));
    }
  });

  test('G6 — In-content popover has fx-glow-u7 (3-layer shadow)', async ({ page }) => {
    // Open StaffSelectField dropdown
    await page.locator('[data-testid="staff-select-field"]').first().click();
    await page.waitForSelector('[data-testid="staff-select-dropdown"]');
    const popover = page.locator('[data-testid="staff-select-dropdown"]');
    await expect(popover).toHaveClass(/fx-glow-u7/);
    const shadow = await popover.evaluate(el => getComputedStyle(el).boxShadow);
    // U7 has 3 distinct drop shadows — should have at least 3 "px" matches
    expect(shadow.match(/\d+px \d+px/g)?.length).toBeGreaterThanOrEqual(3);
  });

  test('G7 — Print view DOM has ZERO fx-glow-* classes (sanctioned exception)', async ({ page }) => {
    // Open a sale print preview
    await page.locator('[data-testid="sale-row"]').first().click();
    await page.locator('[data-testid="print-sale-button"]').click();
    await page.waitForSelector('[data-testid="sale-print-preview"]');
    const printRoot = page.locator('[data-testid="sale-print-preview"]');
    const fxGlowCount = await printRoot.evaluate(el => {
      return Array.from(el.querySelectorAll('*')).filter(node =>
        node.className && typeof node.className === 'string' && /fx-glow-/.test(node.className)
      ).length;
    });
    expect(fxGlowCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run the Playwright spec (skip if env not set)**

Run:
```bash
npx playwright test tests/e2e/v85-glow-utility-application.spec.js --reporter=line
```

If `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `FIREBASE_API_KEY` env vars are not set, tests will skip via `test.skip(true, ...)` — this is acceptable for the inline plan execution (user runs Playwright separately later with creds).

If env vars ARE set, all 7 scenarios should PASS.

### Task E.5 — Add CG6 application audit + final commit

- [ ] **Step 1: Add CG6 to the source-grep regression test**

Edit `tests/v85-glow-utility-css.test.js`. Append a CG6 describe block at the end (before the closing top-level describe):

```javascript
describe('CG6 — application audit (fx-glow-* count across src/)', () => {
  it('CG6.1 — at least 80 fx-glow-* references in src/ (Phase B+C+D shipped)', () => {
    const { execSync } = require('child_process');
    const grepResult = execSync(
      `grep -rE "fx-glow-" src/components src/pages 2>/dev/null | wc -l`,
      { encoding: 'utf8' }
    ).trim();
    expect(parseInt(grepResult, 10)).toBeGreaterThanOrEqual(80);
  });
});
```

- [ ] **Step 2: Run the CG6 test**

Run:
```bash
npx vitest run tests/v85-glow-utility-css.test.js -t "CG6"
```
Expected: PASS (assert ≥80 references — Phase B added ~20, Phase C added ~15-30, Phase D added ~70+70 = ~155 total expected; threshold 80 is loose lower bound).

- [ ] **Step 3: Run full vitest**

Run:
```bash
npm test -- --run 2>&1 | tail -10
```
Expected: all green. ALL V85 CG1-CG7 PASS. No V21-class regressions.

- [ ] **Step 4: Build**

Run:
```bash
npm run build 2>&1 | tail -5
```
Expected: build clean.

- [ ] **Step 5: Commit Phase E**

Run:
```bash
git add -A
git commit -m "feat(V85-Phase-E): light theme parity audit + Playwright L1 verify + CG6 application count

Phase E completes the V85 universal glow rollout per spec §7.

Performed:
- Visual audit on 10 dark-theme screens — verified separation across all
  cards/panels/modals without glow leak into menu shell or print views
- Theme switch dark→light on same 10 screens — pink-sakura family glows
  read clean on white bg, no overwhelming intensity
- Fine-tuned utility opacities where audit surfaced issues
- Wrote Playwright L1 spec (Rule Q V66 mandatory):
  G1 BackendDashboard content has fx-glow-u3 (computed shadow matches)
  G2 CustomerDetailView main panel has fx-glow-v9 + ::before + ::after
  G3 Confirm-Delete modal has fx-glow-v4 + heartbeat animation running
  G4 Generic info modal has fx-glow-v10 + backdrop has fx-glow-u10 +
      backdrop-filter blur
  G5 Dark→light theme produces different computed box-shadow (override fires)
  G6 In-content popover has fx-glow-u7 (3-layer shadow)
  G7 Print view DOM has ZERO fx-glow-* (sanctioned exception)
- Added CG6 application audit (grep count ≥80 fx-glow-* references in
  src/ — proves Phase B+C+D shipped successfully)

Tier 2 final state:
- CG1-CG7 all green (full source-grep contract)
- Playwright L1 spec authored (skipped at-rest without env creds; runs
  in CI / by user with ADMIN_EMAIL + ADMIN_PASSWORD + FIREBASE_API_KEY)

V85 universal glow effect is now applied across:
- ~20 content wrappers (Phase B)
- ~15-30 focal cards (Phase C)
- ~70 modal content cards + ~70 backdrops (Phase D)
- Total: ~155+ fx-glow-* references in src/

Menu system + print views remain UNTOUCHED per user guardrail.

Spec: docs/superpowers/specs/2026-05-18-v85-glow-effect-universal-design.md

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>"
```

- [ ] **Step 6: Push all V85 commits**

Run:
```bash
git push origin master 2>&1 | tail -3
```
Expected: push successful.

---

## Self-Review

**1. Spec coverage check:**

| Spec section | Task coverage | Status |
|---|---|---|
| §1 User intent | Captured in plan goal | ✅ |
| §2 G1-G7 goals | G1+G2 covered in Phase E visual audit; G3 covered by CG5+CG7 + Phase B-D edits never touching menu; G4 covered by CG5; G5 covered by Task A.6 + CG3; G6 covered by AV81 commit (already shipped); G7 covered by Task E.4 Playwright | ✅ |
| §3 Non-goals (menu/print lock) | Task A.7 CG5 + every phase step reminds to confirm menu untouched | ✅ |
| §4.1 V-variant taxonomy | Phase C maps every V to its surface | ✅ |
| §4.2 U-variant taxonomy | Phase B maps every U to its surface | ✅ |
| §5 Architecture (CSS layer + theme + JSX additive) | Phase A delivers full CSS; Phase B-D deliver JSX additive | ✅ |
| §6 File-level scope | Tasks B.1-B.9 + C.1-C.7 + D.1-D.7 enumerate touched files | ✅ |
| §7 5-phase plan | Plan IS the 5-phase delivery | ✅ |
| §8 Tier 2 artifacts | Task A.7 test + AV81 (already shipped) + Task E.4 Playwright | ✅ |
| §9 Acceptance criteria | Phase E verifies every gate | ✅ |
| §10 Risks | Print view leak addressed by CG5 + CG7 + Task E.4 G7; theme too loud addressed by Phase E fine-tune | ✅ |

No spec gaps.

**2. Placeholder scan:**

Scanned plan for "TBD", "TODO", "fill in details", "similar to Task N", "add appropriate error handling" — none found. Every step has either complete code OR a specific find-the-pattern action with example pattern shown.

The phrase "if exists" appears a few times for files that may or may not be present in the repo (e.g., `BackendShellNew.jsx`, `LiveQueueWidget.jsx`, `AuditLogPanel.jsx`, `KpiStripWidget.jsx`, `CustomerCard.jsx`). This is intentional — the plan is robust to either the file existing or not. If absent, the task gracefully skips that file and continues.

**3. Type/identifier consistency:**

- `.fx-glow-v[2-10]` + `.fx-glow-u[1-10]` + 8 U9 sub-modifiers used consistently across all tasks
- `--v85-{ember,rose,cyan,violet}-rgb` token names consistent
- `@property --v85-v6-hue` consistent
- `@keyframes v85-heartbeat`, `v85-thrust`, `v85-hue-cycle`, `v85-sweep`, `v85-pulse-fast`, `v85-pulse-slow`, `v85-u6-breathe` (and `-light` variants) consistent
- Phase commit messages reference correct spec path consistently

No drift detected.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-18-v85-glow-effect-universal.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
