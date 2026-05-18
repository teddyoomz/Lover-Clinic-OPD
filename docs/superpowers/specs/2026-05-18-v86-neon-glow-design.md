# V86 — Neon Cyberpunk Glow Design Spec

**Date**: 2026-05-18 EOD+10
**Author**: Claude Opus 4.7 (brainstormed with user)
**Status**: APPROVED — ready for writing-plans
**Predecessors**: V85 (universal glow foundation, AV81), V85-followup AV82 (Cmd-palette overlay close)
**Mockup**: `public/v86-neon-glow-variants.html` (Q1-Q4 visual companion)

---

## 1. Problem

User feedback (verbatim):
> "เนื่องจากเงามันเป็นสีดำ ทำให้ Dark themes ก็ยังไม่รู้สึกว่า box หรือ widget แสดงผลมันไม่โดดออกมา … แบบตีมป้าย Neon … Cyber Punk ที่มันจะเป็นแสงเรื่อง ออกทั้งด้านหน้าด้านหลังได้ … ไม่แตะ wiring, logic, flow ใดๆ เพราะเราฉลาดพอที่จะแค่เพิ่มแสง เงา เส้น สี เข้าไปเฉยๆ … อนุญาตให้ใช้สียังไงก็ได้ที่นายเห็นว่ามันเข้ากับ Tab นั้นๆ"

V85 shipped universal glow utilities but uses **black drop-shadow / box-shadow**. On a dark theme background (`#08080a`), black shadows visually merge with the surface → cards appear flat → V85's "depth" promise is unmet on the most-used theme.

V86 replaces the black glow with **per-section colored neon** that emits light visible against any background, animating with a 4s breath pulse + hover boost — the cyberpunk-signage feel the user described.

---

## 2. Locked Decisions (Q1-Q4)

| # | Decision | Rationale |
|---|---|---|
| Q1 | **B intensity + 4s breath pulse** | Medium cyberpunk structure (1px border + dual halo + outer ring) without C's heavy inset top-highlight + inset colored glow. Breath added for "living signage" feel. |
| Q2 | **B dual-tone palette** | Per-section c1 (border) + c2 (halo). Reuses ArcBloom 8 SECTION_COLOR pairs verbatim → admin sees the same gradient identity in menu orbs AND in content cards. |
| Q3 | **D Hybrid animation** | 4s breath steady-state + hover-pause + sharp boost on lift. Reduced-motion fallback to static B. |
| Q4 | **B scope** | Backend (BackendShellNew + classic BackendNav) + AdminDashboard frontend (queue, chat, calendar, QR panel). Explicitly NOT PatientForm, NOT ClinicSchedule public link. |

---

## 3. Visual Contract

### Steady state
```css
border: 1px solid rgba(--c1, 0.40);
box-shadow:
  0 0 0 1px rgba(--c1, 0.08),    /* outer ring */
  0 0 14px rgba(--c2, 0.45),     /* close halo */
  0 0 32px rgba(--c2, 0.20);     /* spread halo */
animation: v86-breath-<section> 4s ease-in-out infinite;
```

### Breath keyframe (per-section)
```css
@keyframes v86-breath-<section> {
  0%, 100% { box-shadow: <steady-state shadow> }
  50%      { box-shadow:
    0 0 0 1px rgba(--c1, 0.16),
    0 0 22px rgba(--c2, 0.65),
    0 0 52px rgba(--c2, 0.38);
  }
}
```

### Hover boost
```css
.v86-glow-card:hover {
  animation-play-state: paused;
  transform: translateY(-3px);
  border-color: rgba(--c1, 0.65);
  box-shadow:
    0 0 0 1px rgba(--c1, 0.20),
    0 0 28px rgba(--c2, 0.85),
    0 0 64px rgba(--c2, 0.50);
  transition: transform 0.18s ease, box-shadow 0.25s ease, border-color 0.25s ease;
}
```

### Reduced-motion override
```css
@media (prefers-reduced-motion: reduce) {
  .v86-glow-card {
    animation: none;
    transition: none;
    /* steady-state shadow remains — just no pulse + no transform on hover */
  }
  .v86-glow-card:hover { transform: none; }
}
```

### 8 SECTION_COLOR pairs (verbatim from `src/components/backend/shell/BackendArcBloom.jsx:110-119`)

| Section | --neon-c1 | --neon-c2 | Tab IDs (sample) |
|---|---|---|---|
| appointments | `#3b82f6` blue | `#06b6d4` cyan | appointment-all, deposit-no, deposit-yes, walkin, recall, schedule-cal |
| customers | `#14b8a6` teal | `#22c55e` green | customer-list |
| sales | `#ef4444` red | `#f97316` orange | sales, quotation |
| marketing | `#a855f7` purple | `#ec4899` magenta | promotion, coupon, voucher, audience, marketing-master |
| stock | `#f59e0b` amber | `#facc15` yellow | products, courses, central-stock, vendor-sales |
| finance | `#10b981` emerald | `#06b6d4` cyan | expenses, bank-accounts, online-sales, sale-insurance-claims |
| reports | `#0ea5e9` sky | `#6366f1` indigo | reports-* (14 tabs) |
| master | `#facc15` yellow | `#f97316` orange | product-groups, product-units, medical-instruments, holidays, branches, exam-rooms, permission-groups, staff, doctors, document-templates, line-settings, fb-settings, backup-manager, system-settings |

---

## 4. Per-Section Binding Mechanism

**Strategy**: CSS custom properties scoped per section root.

### Approach (cosmetic-shell compliant)
- Define 8 `[data-section="<id>"]` selectors on a wrapper, each setting `--neon-c1` + `--neon-c2`
- Auto-glow rules consume `var(--neon-c1, fallback)` / `var(--neon-c2, fallback)` — cascade does the rest

### Binding option (to confirm at plan-time)
Three candidates evaluated, **(b) recommended**:

| # | Option | Pros | Cons |
|---|---|---|---|
| a | Reuse existing `data-active-tab` (need to verify it exists on DOM) | Zero JSX change | Tab IDs map 1→N to sections; need indirect selector chain |
| **b** | **Add `data-section="<id>"` to BackendDashboard's tab-wrapper div** | 1-line cosmetic data-attr only; section→id is direct; CSS selectors clean | Touches JSX (display metadata, NOT handler/state/wiring) |
| c | React Context exposing per-section CSS vars via inline `style` | Pure runtime, no DOM change | Adds Context + memo overhead for cosmetic feature |

**Recommendation: (b)** with explicit `// audit-anti-vibe-code: V86 cosmetic-shell-safe data-attr only — no handler/state/prop change` marker. Same precedent as `data-backend-menu-mode` (V82) which is already a cosmetic data-attr.

### Section→Tab mapping
Use the **existing `NAV_SECTIONS` map** from `src/components/backend/nav/navConfig.js`. Lookup `section.id` by `activeTabId`. Already exported and consumed by ArcBloom (orb colors), Sidebar (section grouping), and CmdPalette (results grouping) — adding 1 more consumer is consistent with the existing source-of-truth pattern.

---

## 5. Implementation Surface

### Files touched
- **`src/index.css`** — new `/* === V86 Neon Glow === */` block (~300-400 LOC):
  - 8 `[data-section="<id>"]` CSS-vars blocks (sets `--neon-c1` + `--neon-c2`)
  - `.v86-glow-card` base utility class
  - 8 per-section `@keyframes v86-breath-<id>` rules (each interpolating that section's c1/c2)
  - `[data-theme="light"]` overrides (deeper-saturation alphas for white-bg contrast)
  - `@media (prefers-reduced-motion: reduce)` fallback
  - Override of existing V85 two auto-glow rules to consume `var(--neon-c1)` / `var(--neon-c2)` instead of hardcoded rgba(0,0,0,X) — **this auto-applies V86 to all backend cards without per-component JSX edits**

- **`src/components/backend/BackendDashboard.jsx`** — 1-line per section wrapper:
  ```jsx
  <div data-section={currentSection?.id} className="backend-content">
    {/* existing children — UNTOUCHED */}
  </div>
  ```
  (Only adds the `data-section` attribute on a wrapper div that ALREADY exists. Zero handler/state/prop touch.)

- **`src/pages/AdminDashboard.jsx`** — 1-line wrapper add for queue/chat/calendar zones:
  ```jsx
  <div data-section="appointments" className="admin-frontend-zone">
    {/* existing queue/chat/calendar children — UNTOUCHED */}
  </div>
  ```
  (AdminDashboard frontend always treated as appointments section for now — blue/cyan tint.)

- **`.claude/skills/audit-anti-vibe-code/SKILL.md`** — new AV83 invariant entry

- **`tests/v86-neon-glow-css.test.js`** (NEW) — source-grep regression CG1-CG8

- **`tests/e2e/v86-neon-glow-visual.spec.js`** (NEW) — Playwright L1 visual + interaction tests

### Files NOT touched (V85 AV81 + V86 explicit excludes)
- `src/components/backend/shell/BackendArcBloom.jsx` (menu — AV81 lock)
- `src/components/backend/shell/BackendSubTabBloom.jsx` (menu)
- `src/components/backend/shell/BackendDuoPill.jsx` (menu)
- `src/components/backend/nav/BackendSidebar.jsx` (menu)
- `src/components/backend/nav/BackendMobileDrawer.jsx` (menu)
- `src/components/backend/nav/BackendCmdPalette.jsx` (menu)
- `src/components/SalePrintView.jsx` (print — AV81 lock)
- `src/components/QuotationPrintView.jsx` (print)
- `src/components/backend/BulkPrintModal.jsx` (print)
- `src/components/backend/DocumentPrintModal.jsx` (print)
- `src/lib/documentPrintEngine.js` (print engine)
- `src/pages/PatientForm.jsx` (Q4-B explicit exclude — customer-facing)
- `src/pages/PatientDashboard.jsx` (customer-facing)
- `src/pages/ClinicSchedule.jsx` (customer-facing)
- ANY component handler / state / prop / hook (cosmetic-shell rule)

---

## 6. AV83 Invariant (NEW)

```markdown
### AV83 — V86 Neon Glow consumes CSS vars, never hardcoded RGB (2026-05-18 EOD+10)
**Why**: V86 — per-section glow color flows through CSS cascade via `--neon-c1` / `--neon-c2` custom properties set on `[data-section="<id>"]` wrappers. If a V86 utility class hardcodes rgba(R,G,B,a), the per-section binding breaks → all cards render with the hardcoded color regardless of section.
**Grep**:
- `.v86-glow-*` rules in `src/index.css` MUST reference `var(--neon-c1)` or `var(--neon-c2)` for color values (alphas are fine as numerals).
- `[data-section="<id>"]` selectors MUST define BOTH `--neon-c1` and `--neon-c2` (closed list of 8 sections from NAV_SECTIONS + 1 admin-frontend zone alias).
- `--neon-c1` / `--neon-c2` references MUST resolve to NAV_SECTIONS-derived ArcBloom SECTION_COLOR pairs (sync test).
- Sanctioned exceptions: V86 base utility class default rgba (light-theme fallback) MAY hardcode for the "no section context" edge case.
**Fix**: any V86 rule with hardcoded section color → refactor to `var(--neon-c1)` / `var(--neon-c2)`. Any new `[data-section]` value → add to the closed list + matching CSS-vars block. Source-grep regression: `tests/v86-neon-glow-css.test.js` CG1-CG8 locks the contract.
```

---

## 7. Test Plan

### Phase A — Source-grep regression (vitest)
File: `tests/v86-neon-glow-css.test.js`
- **CG1**: V86 block header anchor present in src/index.css
- **CG2**: All 8 `[data-section="<id>"]` blocks defined, each with `--neon-c1` + `--neon-c2`
- **CG3**: ArcBloom SECTION_COLOR parity — each section's c1/c2 in CSS matches the JS map exactly (load NAV_SECTIONS at test-time, hash-compare)
- **CG4**: 8 `@keyframes v86-breath-<id>` definitions present
- **CG5**: `@media (prefers-reduced-motion: reduce)` override present + strips animation + strips transform
- **CG6**: `[data-theme="light"]` override present
- **CG7**: AV81 menu-system + print-system files contain ZERO `v86-glow-*` references (closed sanctioned-exception list = empty)
- **CG8**: All V86 utility rules use `var(--neon-c1)` / `var(--neon-c2)` for color values, no hardcoded RGB inside `.v86-glow-*` rules (AV83 lock)

Expected: ~30-40 assertions across CG1-CG8.

### Phase B — Playwright L1 visual + interaction
File: `tests/e2e/v86-neon-glow-visual.spec.js`
- **B1**: Backend customer tab — card grid screenshot (dark + light), assert each card's computed `border-color` matches customers c1 + box-shadow contains customers c2
- **B2**: Backend stock tab — card grid screenshot, assert amber/yellow tint
- **B3**: Backend appointments calendar — screenshot, assert blue/cyan tint
- **B4**: AdminDashboard queue panel — assert appointments tint (admin-frontend-zone fallback)
- **B5**: Hover boost — hover a card, assert `border-color` alpha increases + transform=translateY(-3px)
- **B6**: Reduced-motion — set `prefers-reduced-motion: reduce`, assert animation = "none"
- **B7**: AV81 menu untouched — ArcBloom orbs + SubTabBloom + DuoPill computed styles unchanged from V85 baseline (visual diff)

Expected: 7 scenarios, ~15-20 assertions.

### Phase C — Rule Q V66 real-prod L1
- Manual cycle through all 8 backend sections + admin queue + chat + calendar
- Hover 2 cards per section, verify breath pulse + hover boost render correctly
- Toggle dark↔light theme, verify color shift
- Set OS-level reduced-motion, verify static fallback
- Screenshot per section for the V-entry

---

## 8. Acceptance Criteria

1. ✅ All 8 backend sections render cards with their respective dual-tone neon glow at steady state
2. ✅ Breath pulse animates at 4s ease-in-out, halo intensity 0.45→0.65→0.45
3. ✅ Hover any card → animation pauses + lift -3px + halo boosts to 0.85
4. ✅ Reduced-motion users see static glow only (no pulse, no hover transform)
5. ✅ Light theme renders proportionally (deeper-saturation alphas)
6. ✅ AdminDashboard queue/chat/calendar zones get appointments tint
7. ✅ PatientForm + ClinicSchedule customer-facing pages UNCHANGED (no glow leak)
8. ✅ Menu system (Arc Bloom orbs, SubTab picker, DuoPill, Sidebar, MobileDrawer, CmdPalette) UNCHANGED (visual diff = 0 vs pre-V86 baseline)
9. ✅ Print views (Sale, Quotation, Bulk PDF, Document) UNCHANGED
10. ✅ All Phase A source-grep + Phase B Playwright tests green
11. ✅ Build clean, no console errors at runtime
12. ✅ V85 AV82 (Cmd-palette overlay close) still works (no regression)

---

## 9. Rollback Plan

V86 is **purely additive CSS** (one new block in `src/index.css` + 2 wrapper data-attrs in JSX). To rollback:
1. `git revert <V86 commit>` — restores src/index.css to V85 + strips `data-section` attrs from BackendDashboard.jsx + AdminDashboard.jsx
2. Build clean, tests green (V86 test files reference V86 markers → will fail → expected, delete them as part of revert sweep OR leave to fail with V86 not present)
3. Zero data migration, zero rules change, zero serverless touch — pure UI rollback

---

## 10. Out of Scope

- Editing menu system (BackendArcBloom + 5 sibling menu files) — V85 AV81 + V86 explicit excludes
- Editing print views — V85 AV81
- PatientForm / ClinicSchedule / PatientDashboard (customer-facing) — Q4-B explicit exclude
- New animation policies beyond breath + hover (e.g. on-mount fade-in, scroll-triggered) — out of MVP
- Per-card custom tint (e.g. customer card colored by customer.tier) — out of MVP; section-level tint only
- Sound design (yes, cyberpunk has signature SFX — out of scope)

---

## 11. Open Questions Resolved at Plan-Time

1. Confirm `data-section` wrapper placement in BackendDashboard.jsx (likely around the active-tab render wrapper — preview_eval the DOM to find the right spot)
2. Confirm AdminDashboard zone scope — wrap entire `.admin-frontend-zone` or per-panel (queue / chat / calendar / QR)? Decide based on existing DOM hierarchy.
3. Confirm whether V85 existing auto-glow rules should be REPLACED or COEXIST with V86 — recommend REPLACE (V86 is the next iteration of V85's intent, not orthogonal).

---

## 12. References

- V85 spec: `docs/superpowers/specs/2026-05-18-v85-glow-effect-universal-design.md`
- V85-followup AV82 V-entry: `.claude/rules/00-session-start.md` § 2
- ArcBloom SECTION_COLOR map: `src/components/backend/shell/BackendArcBloom.jsx:110-119`
- NAV_SECTIONS: `src/components/backend/nav/navConfig.js`
- Mockup: `public/v86-neon-glow-variants.html`
- Cosmetic-shell rule: `~/.claude/projects/F--LoverClinic-app/memory/feedback_cosmetic_shell_redesign_constraint.md`
- AV81 V85 menu/print guardrail: `.claude/skills/audit-anti-vibe-code/SKILL.md`
