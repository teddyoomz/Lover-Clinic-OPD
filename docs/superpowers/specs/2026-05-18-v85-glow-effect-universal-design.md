# V85 — Universal Glow Effect for Dark/Light Theme

**Spec date**: 2026-05-18 EOD+9
**Status**: APPROVED (user verbatim "approval design")
**Brainstorming session**: this turn (user + assistant, single session)
**Visual Companion**: `public/v85-glow-variants.html` (30 mockups — 10 V-variants × Card section + 10 V-variants × Modal section + 10 U-variants × Universal-Box section)
**Iron-clad context**: Rule J (brainstorming HARD-GATE — satisfied), Rule Q V66 (Real-Adversarial Verification — required at Phase E), Rule M (data ops — N/A for cosmetic CSS), Rule P (class-of-bug — N/A for new feature).

---

## 1. User intent (verbatim)

> "ต่อไปฝากใส่ Effect shadow สวยๆ แบบไม่จำกัดสี และออกแต่พอดี พอมี gimmick ให้ดูแยกออกจาก Background กับทุกๆอย่างใน Dark theme ทั้ง Frontend และ Backend หรือ Modal ด้วยก็ได้ถ้าทำได้ โดยอยากให้มันดูลอยอยู่นอกอวกาศ โดยมีแสงเงาข้างหลังเหมือนไอพ่นสีต่างๆ พูดง่ายๆ เอาเหมือนไฟแสงเงาที่มันออกหลัง icon ใน Menu Backend แบบใหม่ของเรา"

> "ทุกอย่างที่เป็น box เป็นกรอบ ก็อยากให้ใส่ effect shadow ไปด้วย ให้มันลอยออกจากสีดำข้างหลังอะ ... เราใช้แต่คอมแรงๆเปิดโปรแกรม ไม่ต้องกลัวเรื่อง Graphic ที่กินทรัพยากรเลยนะ เต็มที่เลย"

> "เอาหมดทุกแบบ นายตัดสินใจเลือกใส่ให้ดีๆ ให้เหมาะสมกับแต่ละสไตล์ละกัน ในทั่วทั้งโปรเจ็คเลยนะ ทั้ง Frontend และ Backend ทั้ง Dark และ Light Theme ด้วย"

Translation summary:
1. Apply colored shadow effects across the app so boxes/cards/modals visibly separate from the dark background ("floating in space")
2. Effects inspired by the Backend Menu D bloom glow (existing baseline)
3. Performance budget is unlimited — user explicitly authorized heavy effects
4. Use ALL 20 variants from the Visual Companion; assistant decides per-surface mapping
5. Coverage: Frontend + Backend + Dark + Light theme

---

## 2. Goals

| # | Goal | How measured |
|---|---|---|
| G1 | Every dark-theme card/panel/modal has visible separation from background | Manual review across 10 key screens (AdminDashboard, BackendDashboard tabs, modals) — no card "vanishes" into bg |
| G2 | Light theme has equivalent separation strength via pink/sakura family | Same 10 screens in light theme — no card vanishes |
| G3 | **Entire menu system (OLD + NEW) preserved unchanged** | git diff of `BackendArcBloom.jsx`, `BackendSubTabBloom.jsx`, `BackendSidebar.jsx`, `BackendMobileDrawer.jsx`, `BackendCmdPalette.jsx`, `BackendDuoPill.jsx` = 0 lines (audit assertion); src/index.css `.menu-*` + `.bloom-*` class rules unchanged from pre-V85 (hash assertion) |
| G4 | Print/export views unaffected | `SalePrintView`, `QuotationPrintView`, document print engine → no glow leak in PDF render |
| G5 | All animations honor `prefers-reduced-motion: reduce` | Manual + media-query test |
| G6 | Class-of-bug invariant locks the application pattern | NEW AV81 in `audit-anti-vibe-code/SKILL.md` |
| G7 | Real-browser verification per Rule Q V66 | Playwright L1 spec covering ≥5 key surfaces |

## 3. Non-goals

- ❌ Touch business logic (Firestore writes, validators, aggregators)
- ❌ Touch schema (no new collection, no new field)
- ❌ **Touch ANY menu system (locked by user 2026-05-18 EOD+9 "ห้ามไปยุ่งกับระบบเมนูที่เราทำนะ ทั้งเมนูแบบเดิมและเมนูแบบใหม่ มันสวยอยู่แล้ว")** — explicit NO-TOUCH list:
  - `src/components/backend/shell/BackendArcBloom.jsx` (NEW menu — bloom orbs)
  - `src/components/backend/shell/BackendSubTabBloom.jsx` (NEW menu — sub-tab picker)
  - `src/components/backend/nav/BackendSidebar.jsx` (OLD sidebar menu)
  - `src/components/backend/nav/BackendMobileDrawer.jsx` (mobile drawer menu)
  - `src/components/backend/nav/BackendCmdPalette.jsx` (command palette / quick-launch menu)
  - `src/components/backend/shell/BackendDuoPill.jsx` (sub-tab navigation)
  - **`AdminDashboard.jsx` menu-shell area**: `.menu-shell` + `.menu-desktop` + every `.menu-tab` button + `.menu-bottom-dock` mobile dock + all `.menu-*` class containers (post-V84 fix is the final menu look)
  - **CSS classes locked**: `.menu-shell`, `.menu-desktop`, `.menu-tab`, `.menu-tab-active`, `.menu-tab-backend`, `.menu-badge`, `.menu-bottom-dock`, `.menu-dock-tab`, `.menu-dock-tab-active`, `.menu-badge-dock`, `.menu-tab-scroll`, `.menu-grad-line`, `.bloom-*` (every `bloom-` prefixed class)
- ❌ Modify `SalePrintView.jsx`, `QuotationPrintView.jsx`, `documentPrintEngine.js`, `BulkPrintModal.jsx`, `DocumentPrintModal.jsx` (PDF render path)
- ❌ Add new tests for component logic (cosmetic-only — source-grep regression + 1 Playwright spec only)
- ❌ Add new fields/permissions/Firestore rules
- ❌ Change tab/section structure or JSX hierarchy (purely additive Tailwind class on existing wrappers)

---

## 4. Variant taxonomy

### 4.1 V-variants — Card / Modal layer (focal-level effects)

Cosmetic source: `public/v85-glow-variants.html` Section A (Card) + Section B (Modal).

| Variant | Visual signature | Apply to | Anim? |
|---|---|---|---|
| **V1 Bloom-Classic** | Multi-layer warm halo + 3.3s pulse + gold-orange ::before | **Backend Menu D ONLY (do not touch — already baked in)** | yes (existing) |
| **V2 Tight-Rim Neon** | 2px cyan rim + 6px close glow + 18px outer glow | Active/selected list rows, focused tab indicator, primary CTA tiles | no |
| **V3 Wide-Aurora** | -36px halo + 22px blur + purple-pink low-opacity radial | Page-level large containers: `CustomerDetailView` root, `TreatmentTimelineModal` root, `BackupManagerTab` panels | no |
| **V4 Heartbeat Pulse** | box-shadow 1.8s ease-in-out red pulse | Alert cards: recall-pending row, stock-low warning chip, sale-overdue tile | yes (1.8s) |
| **V5 Jet-Thrust** | Asymmetric DOWNWARD ellipse glow + 0.8s flicker | Hero KPI cards (top of AdminDashboard, Reports landing — "look here" prominence) | yes (0.8s) |
| **V6 Conic-Rainbow** | 7-color conic gradient cycling `from` angle via @property | Celebration modals ONLY (member tier-up, milestone achievement, payout success) | yes (8s + 12s @property) |
| **V7 Holographic Sweep** | Diagonal stripe sweep 5s + emerald ambient | VIP/Premium badge cards, achievement badges, "premium" feature highlights | yes (5s) |
| **V8 Inner Glow Only** | inset shadow + 1px top highlight + glassmorphism bg | Read-only display cards: archived list, audit-log entries, info-only banners | no |
| **V9 Double-Halo** | inner rose halo + outer amber halo (3.5s + 4.5s reverse pulses) | Detail-view focal cards: `CustomerDetailView` main grid, `OPD print preview`, `RecallDetailModal` body | yes (3.5s + 4.5s) |
| **V10 Drop+Ambient** | drop-shadow + 1px violet rim + small ambient | **Modal default** (Confirm / Form / Info modals) — conservative safe default | no |

### 4.2 U-variants — Universal Box layer (chrome / structural effects)

Cosmetic source: `public/v85-glow-variants.html` Section C (Universal-Box).

| Variant | Visual signature | Apply to | Anim? |
|---|---|---|---|
| **U1 Subtle Drop** | 3-layer drop shadow (no color) | Form inputs, search bars, tab buttons, breadcrumbs, secondary controls | no |
| **U2 Cool Ambient** | drop + cyan 10% glow | Data tables, list views, report panels, history tables | no |
| **U3 Warm Ember** | drop + amber 12% glow | **Page-level content wrappers** — outer container of each tab's content area (the page-body `<div>` INSIDE the menu shell, NOT the menu itself) | no |
| **U4 Dual-Tone Aurora** | drop + cyan top + amber bottom | Section group dividers WITHIN content (form section headers in `StaffFormModal` / `ClinicSettingsPanel` / `SystemSettingsTab` / "ตั้งค่าทั่วไป" group titles) | no |
| **U5 Border + Drop** | amber 8% rim + top highlight + drop | Form panels, settings sections, input groups (`StaffFormModal` panels, `ClinicSettingsPanel` cards, `SystemSettingsTab` groups) | no |
| **U6 Slow Pulse** | 8s ambient breathing on box-shadow | Live data widgets: real-time queue panel, dashboard tile-of-today (NOTE: chat unread counter pill is **inside .menu-tab** → excluded per §3 menu guardrail) | yes (8s) |
| **U7 Layered Stack** | 3-layer drop (4px / 12px / 28px) | Popovers, dropdowns, tooltips WITHIN content (NOTE: `BackendCmdPalette` is a menu → excluded per §3) | no |
| **U8 Inner Glow Only** | inset highlight (no outer aura) | Read-only display panels: audit-log lists, archived data, history viewers | no |
| **U9 Per-Domain Tint** | Per-section glow color | **Page title bar boxes WITHIN content** — when on Sales tab content, the "การขาย + actions" title bar box gets red tint; when on Customers content, the title bar gets cyan tint. NOTE: **NOT applied to menu sidebar items** per §3 guardrail | no |
| **U10 Glassmorphism** | backdrop-blur 10px saturate 140% + dark-translucent | Modal **backdrops** + drawer overlays + bottomsheet wrappers (NOTE: `BackendMobileDrawer` is a menu → excluded; only NON-menu drawers eligible — most modal backdrops qualify) | no |

---

## 5. Architecture

### 5.1 CSS layer — 20 utility classes

NEW block in `src/index.css` (estimated +650 LOC):

```css
/* ════ V85 — Universal Glow Effect Utilities ═══════════════════════════ */

/* @property for V6 conic-gradient color cycling — registered once globally */
@property --v85-v6-hue { syntax: '<angle>'; initial-value: 0deg; inherits: false; }

/* V-variants (focal-level) */
.fx-glow-v2  { /* tight-rim neon */ }
.fx-glow-v3  { /* wide-aurora */ }
.fx-glow-v4  { /* heartbeat pulse */ }
.fx-glow-v5  { /* jet-thrust */ }
.fx-glow-v6  { /* conic-rainbow */ }
.fx-glow-v7  { /* holographic sweep */ }
.fx-glow-v8  { /* inner glow only */ }
.fx-glow-v9  { /* double-halo */ }
.fx-glow-v10 { /* drop+ambient */ }
/* V1 NOT exported as utility — locked inside BackendArcBloom */

/* U-variants (universal-box) */
.fx-glow-u1  { /* subtle drop */ }
.fx-glow-u2  { /* cool ambient */ }
.fx-glow-u3  { /* warm ember */ }
.fx-glow-u4  { /* dual-tone aurora */ }
.fx-glow-u5  { /* border + drop */ }
.fx-glow-u6  { /* slow pulse */ }
.fx-glow-u7  { /* layered stack */ }
.fx-glow-u8  { /* inner glow only */ }
.fx-glow-u9  { /* per-domain tint — see u9-{section} sub-modifiers */ }
.fx-glow-u10 { /* glassmorphism */ }

/* U9 per-domain sub-modifiers */
.fx-glow-u9-sales        { --u9-tint: rgba(239,68,68,0.16); }
.fx-glow-u9-customers    { --u9-tint: rgba(6,182,212,0.16); }
.fx-glow-u9-finance      { --u9-tint: rgba(16,185,129,0.16); }
.fx-glow-u9-marketing    { --u9-tint: rgba(168,85,247,0.16); }
.fx-glow-u9-stock        { --u9-tint: rgba(245,158,11,0.16); }
.fx-glow-u9-reports      { --u9-tint: rgba(14,165,233,0.16); }
.fx-glow-u9-master       { --u9-tint: rgba(250,204,21,0.16); }
.fx-glow-u9-appointments { --u9-tint: rgba(59,130,246,0.16); }

/* Light theme overrides */
[data-theme="light"] .fx-glow-v2 { /* cyan→teal */ }
[data-theme="light"] .fx-glow-v3 { /* purple-pink→sakura */ }
/* ... 19 more light-theme overrides */

/* Reduced-motion overrides */
@media (prefers-reduced-motion: reduce) {
  .fx-glow-v4, .fx-glow-v5 .fx-glow-v5::after,
  .fx-glow-v6::before, .fx-glow-v6::after,
  .fx-glow-v7::before, .fx-glow-v9::before, .fx-glow-v9::after,
  .fx-glow-u6 { animation: none !important; }
}
```

**Color tokens** added under `:root` (dark) and `[data-theme="light"]`:
```css
:root {
  --v85-ember-rgb: 251, 146, 60;
  --v85-rose-rgb: 244, 63, 94;
  --v85-cyan-rgb: 6, 182, 212;
  --v85-violet-rgb: 139, 92, 246;
}
[data-theme="light"] {
  --v85-ember-rgb: 244, 114, 182;  /* sakura mirror */
  --v85-rose-rgb: 236, 72, 153;
  --v85-cyan-rgb: 14, 165, 233;
  --v85-violet-rgb: 168, 85, 247;
}
```

### 5.2 Application pattern — JSX additions

95% of components: single Tailwind class addition on existing wrapper:
```jsx
// before
<div className="bg-[var(--bg-card)] border border-[var(--bd)] rounded-2xl p-4">

// after (V9 detail-view card)
<div className="bg-[var(--bg-card)] border border-[var(--bd)] rounded-2xl p-4 fx-glow-v9">
```

5% special-case components (CustomerDetailView, modal backdrops, BackendCmdPalette) need pair-class adjustments (e.g., remove `shadow-lg` Tailwind class because the glow utility supersedes it).

### 5.3 Light theme parity rules

- **Drop shadows**: dark = `rgba(0,0,0,0.55)`; light = `rgba(0,0,0,0.12)` (~20% intensity)
- **Border highlights**: dark = `inset 0 1px 0 rgba(255,255,255,0.06)`; light = `inset 0 1px 0 rgba(0,0,0,0.04)`
- **Colored glows**: ember/orange → pink/sakura; red → rose-pink; cyan → teal; violet → purple-300
- **U10 Glassmorphism backdrop**: dark = `rgba(20,22,28,0.5)`; light = `rgba(255,250,252,0.6)`
- **Animations**: identical timing/curves; preserved across themes

### 5.4 Animation budget

| Class | Animation | Cadence | Cost | Justification |
|---|---|---|---|---|
| V1 (Bloom) | fire-pulse | 3.3s | medium | already shipped + locked |
| V4 | heartbeat | 1.8s | medium | event-driven (alerts) — sparse |
| V5 | thrust-flicker | 0.8s | medium-high | KPI hero cards — few per screen (≤4) |
| V6 | hue-cycle | 8s + 12s | high | celebration modals — used once per session |
| V7 | sweep | 5s | medium | VIP cards — sparse |
| V9 | dual pulse | 3.5s + 4.5s | medium-high | detail-view focal cards — 1 per screen |
| U6 | u6-breathe | 8s | low (chrome-wide so cumulative) | restricted to live-data widgets ONLY |

Total expected concurrent animations on busiest screen (AdminDashboard with V5 KPI + V4 alert + U6 live widget): **6-8 animations** — within budget for high-end machines.

---

## 6. Scope mapping — file-level

### 6.1 Files touched (~50 components)

**Frontend (`src/pages/`)**:
- `AdminDashboard.jsx` — **menu-shell area locked** per §3. Only the BODY/content area below the menu gets touched: KPI cards (V5), alert cards (V4), page-body wrapper (U3), in-content search bars (U1). **NOT TOUCHED**: `.menu-shell`, `.menu-desktop`, `.menu-tab`, `.menu-bottom-dock`, all menu-* classes.
- `PatientForm.jsx` — form panels (U5), submit CTA card (V2)
- `PatientDashboard.jsx` — course summary cards (V9), schedule slot list (U1)

**Backend dashboard content (`src/components/backend/`)**:
- `BackendDashboard.jsx` — **outer shell touch ONLY on the content-area `<main>` wrapper (U3)** — NOT the menu rail / sidebar / mobile drawer / cmd palette
- `BackupManagerTab.jsx` — page-level container (V3) + backup section cards (U5)
- `CustomerDetailView.jsx` — focal detail (V9)
- `CustomerListTab.jsx` — list row cards (U2), card surfaces inherit V8/V9 by row state
- `SaleTab.jsx` — KPI strip (V5), list row cards (U2), page title bar (U9 red tint)
- `StaffTab.jsx` + `DoctorsTab.jsx` — form panel cards (U5), list rows (U2)
- `PermissionGroupsTab.jsx` — group header cards (U4)
- `ProductsTab.jsx`, `CoursesTab.jsx`, `BranchesTab.jsx`, etc. — list row cards (U2)
- `MasterDataTab.jsx` — sync card panels (U5)
- `RecallCreateModal.jsx`, `RecallEditModal.jsx`, etc. — V4 alert + V10 default
- `SystemSettingsTab.jsx` — settings group panels (U5) + U4 section dividers
- `BranchBackupTab.jsx` — backup section cards (U5)
- `MovementLogPanel.jsx`, `StockBalancePanel.jsx`, etc. — table panels (U2)
- Reports `src/components/backend/reports/*Tab.jsx` (16 files) — report panels (U2), KPI strip cards (V5)

**Backend chrome / menu** (all NO TOUCH per §3 user guardrail):
- `src/components/backend/shell/BackendArcBloom.jsx` — V1 baseline locked
- `src/components/backend/shell/BackendSubTabBloom.jsx` — V1 baseline locked
- `src/components/backend/shell/BackendDuoPill.jsx` — sub-tab navigation
- `src/components/backend/nav/BackendSidebar.jsx` — OLD menu
- `src/components/backend/nav/BackendMobileDrawer.jsx` — mobile drawer menu
- `src/components/backend/nav/BackendCmdPalette.jsx` — command palette menu
- All `BackendShellNew.jsx` / `BackendShell.jsx` JSX that wraps the menu rail — only the content-area `<main>` portion is in scope, NOT the menu rail itself

**Modals (~70 files in `src/components/**/*Modal.jsx`)**:
- All modals receive **V10 default** as baseline
- Special cases:
  - Confirm/Delete modals → V4 heartbeat (urgency)
  - Celebration modals (VIP upgrade, milestone) → V6 conic-rainbow
  - Detail view modals (TreatmentTimelineModal, RecallDetailModal) → V9 double-halo
  - Read-only display modals → V8 inner glow only
- Modal **backdrops** → U10 glassmorphism

**Top-level pages**:
- `App.jsx` — no change (router only)
- `index.html` — no change

### 6.2 Files explicitly NOT touched

**Menu system (user guardrail 2026-05-18 EOD+9 — "ทั้งเมนูแบบเดิมและเมนูแบบใหม่ มันสวยอยู่แล้ว")**:
- `src/components/backend/shell/BackendArcBloom.jsx` — V1 baseline locked
- `src/components/backend/shell/BackendSubTabBloom.jsx` — V1 baseline locked
- `src/components/backend/shell/BackendDuoPill.jsx` — sub-tab navigation
- `src/components/backend/nav/BackendSidebar.jsx` — OLD menu
- `src/components/backend/nav/BackendMobileDrawer.jsx` — mobile drawer menu
- `src/components/backend/nav/BackendCmdPalette.jsx` — command palette menu
- AdminDashboard.jsx `.menu-shell` / `.menu-desktop` / `.menu-tab*` / `.menu-bottom-dock` / `.menu-dock-tab*` / `.menu-badge*` / `.menu-tab-scroll` / `.menu-grad-line` regions — only content BELOW the menu is in scope
- Every CSS class starting with `.bloom-*` in src/index.css — locked

**Print/export render path**:
- `src/lib/documentPrintEngine.js` — html2canvas + jsPDF
- `src/components/SalePrintView.jsx`, `QuotationPrintView.jsx`, `BulkPrintModal.jsx`, `DocumentPrintModal.jsx` — anything that goes through PDF render (glow utilities would either be ignored OR break PDF render)

**Non-UI**:
- All `*Validation.js`, `*Aggregator.js`, `*Client.js` files in `src/lib/` — non-UI
- All `api/**/*.js` server files — non-UI
- All `firestore.rules`, `storage.rules`, `firebase.json` — non-UI
- All scripts in `scripts/**` — non-UI
- All test files in `tests/**` (except 3 NEW V85 tests)

---

## 7. Phasing

5 sub-commits, each independently mergeable + reverting one doesn't break others:

### Phase A — CSS Foundation (single commit, ~700 LOC)

- Add 20 utility classes `.fx-glow-v{2..10}` + `.fx-glow-u{1..10}` to `src/index.css`
- Add U9 per-domain sub-modifiers (8 sections)
- Add 4 V85 color tokens to `:root` + `[data-theme="light"]`
- Add reduced-motion media query overrides
- NEW `tests/v85-glow-utility-css.test.js` (source-grep: every utility class exists + has expected box-shadow + has light-theme override)
- Update `audit-anti-vibe-code/SKILL.md` with AV81 (every utility must have a `[data-theme="light"]` override; light-theme drop opacity ≤ 0.2)

### Phase B — Universal/Content Layer (single commit, ~20 component touches)

Apply U-variants to non-menu content surfaces:
- Page-body wrappers (U3): the `<main>` content area inside AdminDashboard + BackendDashboard (the wrapper that contains tab content, NOT the menu rail)
- Data tables (U2): customer list, sale list, stock balance, movement log, all report tables
- Form panels (U5): StaffFormModal/DoctorFormModal panels, ClinicSettingsPanel, SystemSettingsTab groups
- Section dividers (U4): Form section headers WITHIN content (e.g., StaffFormModal "ข้อมูลทั่วไป" / "สิทธิ์การเข้าถึง" group titles), Settings page group titles
- Popovers/Tooltips/Dropdowns (U7): in-content popovers (NOT BackendCmdPalette — that's a menu)
- Live widgets (U6): dashboard tile-of-today, real-time queue panel (chat-tab badge is INSIDE menu → EXCLUDED)
- Page title bars (U9 per-domain): the title bar BOX at the top of each tab's content area — colored by section (Sales=red, Customers=cyan, Finance=green, etc.). NOT applied to the menu sidebar items.
- Read-only panels (U8): audit logs, archived lists, history viewers within content
- Form inputs (U1): in-content search bars, breadcrumbs, secondary controls — NOT menu search

### Phase C — Card/Focal Layer (single commit, ~30 component touches)

Apply V-variants to focal cards:
- KPI hero cards (V5): AdminDashboard top stat strip + Reports landing tiles
- Detail views (V9): CustomerDetailView main grid, RecallDetailModal body
- Page-level large containers (V3): TreatmentTimelineModal, BackupManagerTab panels
- Active/selected rows (V2): list row hover/active state in CustomerListTab/SaleTab/etc.
- Alert cards (V4): recall-pending tile, stock-low warning, sale-overdue strip
- VIP/Premium badges (V7): VIP customer card, premium feature tile
- Read-only cards (V8): archived entries, view-only timelines

### Phase D — Modal Layer (single commit, ~70 component touches)

Apply V-variants + U10 backdrop:
- **All ~70 modal components**: receive `fx-glow-v10` on content card + `fx-glow-u10` on backdrop wrapper
- **Special-case modals** (override V10 default):
  - Confirm/Delete: replace with V4 heartbeat
  - Detail (CustomerDetailView modal, TreatmentTimelineModal, RecallDetailModal): replace with V9
  - Celebration (member tier-up, milestone, payout-success): replace with V6
  - Read-only display (audit-log view, archived view): replace with V8

### Phase E — Light Theme Parity + Verification (single commit)

- Visual audit: switch app to light theme, run all 10 key screens, verify glow strength is appropriate (not too loud, not invisible)
- Fine-tune any utility's light override based on findings
- NEW Playwright spec `tests/e2e/v85-glow-utility-application.spec.js` — Rule Q V66 L1 verification:
  - Visit Backend dashboard (dark theme) → assert `.fx-glow-u3` on outer chrome
  - Visit CustomerDetailView (dark) → assert `.fx-glow-v9` on main panel
  - Open any modal (dark) → assert `.fx-glow-v10` on modal content + `.fx-glow-u10` on backdrop
  - Switch to light theme → assert same elements still have utilities + computed `box-shadow` differs from dark (proves theme override is firing)
  - Confirm-delete modal (dark) → assert `.fx-glow-v4` running heartbeat animation
- Add 1 stress scenario: open BackendCmdPalette + 1 confirm modal simultaneously, verify no visual regression
- Manual review by user (Rule Q L3 fallback) — only after L1 Playwright green

---

## 8. Tier 2 artifacts (Rule P — class-of-bug discipline)

### 8.1 AV81 (NEW invariant)

```markdown
### AV81 — V85 Glow utility application discipline (2026-05-18)

Every CSS class named `.fx-glow-v[2-9]|10`, `.fx-glow-u[1-9]|10`, or `.fx-glow-u9-*`
in `src/index.css` MUST:

1. Be defined in the V85 utility block (greppable anchor: "V85 — Universal Glow Effect")
2. Have a `[data-theme="light"]` override in the same file
3. Animated variants (V4, V5, V6, V7, V9, U6) MUST honor `prefers-reduced-motion: reduce`

Every component file in `src/components/**` or `src/pages/**` that adds a
`fx-glow-*` class to JSX MUST NOT remove the existing `bg-*` / `border-*` /
`rounded-*` Tailwind classes (utility is additive to surface tokens).

Sanctioned exceptions (every file in this list MUST NOT contain `fx-glow-*` classes):
- **Menu system** (user guardrail 2026-05-18 EOD+9):
  - `BackendArcBloom.jsx` — V1 bloom-classic baked inline
  - `BackendSubTabBloom.jsx` — sub-tab picker
  - `BackendSidebar.jsx` — OLD sidebar menu
  - `BackendMobileDrawer.jsx` — mobile drawer menu
  - `BackendCmdPalette.jsx` — command palette
  - `BackendDuoPill.jsx` — sub-tab navigation
- **Print views** (PDF render breaks if shadow blur sneaks in):
  - `SalePrintView.jsx`, `QuotationPrintView.jsx`, `BulkPrintModal.jsx`, `DocumentPrintModal.jsx`, `documentPrintEngine.js`

Source-grep regression: `tests/v85-glow-utility-css.test.js` locks the contract.
```

### 8.2 Source-grep regression test

NEW `tests/v85-glow-utility-css.test.js` (~120 assertions):

- **CG1** — every utility class exists in `src/index.css` (10 V + 10 U + 8 U9-domain = 28 selectors)
- **CG2** — every utility has a `[data-theme="light"]` override block in same file
- **CG3** — animated utilities have `prefers-reduced-motion: reduce` overrides
- **CG4** — V85 color tokens exist in `:root` + `[data-theme="light"]`
- **CG5** — sanctioned exceptions (10 files: 6 menu files + 4 print files + documentPrintEngine.js + .menu-*/.bloom-* CSS regions) do NOT contain `fx-glow-*` references
- **CG6** — application audit: count `fx-glow-*` references in src/ — expect ≥80 (50 components + 30 modals × ~1.5 avg classes/file)
- **CG7** — V1 fire-pulse keyframe + every `.bloom-*` rule + every `.menu-*` rule in src/index.css unchanged from pre-V85 hash (menu guardrail lock)

### 8.3 Playwright L1 spec (Phase E)

NEW `tests/e2e/v85-glow-utility-application.spec.js` — 7 scenarios:

1. **G1** — Dark theme Backend chrome → `.fx-glow-u3` present + computed shadow blur ≥ 40px
2. **G2** — Dark theme CustomerDetailView → `.fx-glow-v9` present + has `::before` + has `::after`
3. **G3** — Open Confirm-Delete modal → `.fx-glow-v4` running heartbeat + currentTime advances
4. **G4** — Open generic info modal → `.fx-glow-v10` + modal-backdrop has `.fx-glow-u10` with backdrop-filter
5. **G5** — Switch dark → light theme → same utility classes present BUT computed box-shadow differs (theme override fired)
6. **G6** — BackendCmdPalette popover → `.fx-glow-u7` with 3-layer shadow
7. **G7** — Print preview iframe inspection → no `.fx-glow-*` class in PDF DOM (sanctioned exception)

---

## 9. Acceptance criteria

**Pre-merge** (each phase):
- ✅ `npm run build` clean
- ✅ Targeted `npm test -- --run tests/v85-*` green
- ✅ No new console errors in dev (preview_eval)
- ✅ AV81 audit invariant CG1-CG7 green

**Post-Phase E** (full ship):
- ✅ Manual visual review: 10 key dark-theme screens have visible card separation
- ✅ Manual visual review: same 10 screens in light theme also separate cleanly
- ✅ Backend Menu D (V1 baseline) visually unchanged (preview_eval comparison)
- ✅ Print 1 PDF (sale receipt) — no glow artifact
- ✅ Playwright L1 spec 7/7 PASS
- ✅ Full `npm test -- --run` green (no V21-class regressions on existing tests)
- ✅ User Rule Q L3 walkthrough: 5+ surfaces, written "ok" confirmation

---

## 10. Risk register

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Glow leak into PDF print render | Medium | High (broken PDF) | AV81 sanctioned-exception grep locks print views; manual PDF render verify in Phase E |
| Light theme glow too loud (overwhelms content) | Medium | Medium | Conservative 20% opacity rule + Phase E visual audit |
| Animation budget overrun on low-end devices (despite user's "ไม่ต้องกลัว") | Low | Medium | Animations limited to event-driven surfaces; ambient effects static; `prefers-reduced-motion` always honored |
| V21 lock-in (existing tests assert no shadow on element) | Low | Medium | Phase A test bank greps existing assertions; flag conflicts before Phase B starts |
| Backend Menu D bloom interference (V1 visually competes with V5 KPI cards adjacent) | Low | Low | Spatially separated; Backend Menu D opens as overlay, V5 KPI shows on standard dashboard |
| U10 backdrop-blur performance on 100+ modals stacked (theoretical worst case) | Very Low | Low | Only ONE modal renders at a time per layer; backdrop-blur applies to backdrop layer only |
| `@property` lack of support on older Firefox/Safari (V6 conic) | Low | Low | `@supports not` fallback freezes V6 colors but element doesn't break |

---

## 11. Open questions (resolved during brainstorming)

| Q | Resolution |
|---|---|
| Which variant goes where? | Assistant-decided per § 4 taxonomy. User: "เอาหมดทุกแบบ นายตัดสินใจเลือกใส่ให้ดีๆ" |
| Performance budget? | Unlimited per user authorization "เครื่องแรงพอ ใส่ effect เต็มที่" |
| Coverage scope? | Frontend + Backend + Modals + Dark + Light theme |
| Modify Backend Menu D? | NO — V1 baseline preserved (G3 audit assertion) |
| Light theme behavior? | Pink-sakura mirror palette + lighter drop opacity per § 5.3 |
| Motion behavior? | Static for ambient, animated for event-driven; `prefers-reduced-motion` always honored |
| Print/export views? | NO TOUCH — sanctioned exception in AV81 |

---

## 12. Files referenced

**Cosmetic source / Visual Companion**:
- `public/v85-glow-variants.html` (30 mockups — visual reference, do not ship to production beyond `public/`)

**Implementation surfaces**:
- `src/index.css` (Phase A — main CSS file, +700 LOC)
- `src/pages/AdminDashboard.jsx`, `PatientForm.jsx`, `PatientDashboard.jsx`
- `src/components/backend/**/*.jsx` (~50 files)
- All modal components — ~70 files

**Tests (NEW)**:
- `tests/v85-glow-utility-css.test.js`
- `tests/e2e/v85-glow-utility-application.spec.js` (Playwright)

**Documentation**:
- `.claude/skills/audit-anti-vibe-code/SKILL.md` (AV81)
- `.claude/rules/00-session-start.md` § 2 (V85 V-entry — added after Phase E ship)
- `SESSION_HANDOFF.md` (state update)
- `.agents/active.md` (focus update)

---

## 13. Spec self-review

- ✅ Placeholder scan: no TBD/TODO/incomplete sections
- ✅ Internal consistency: variant taxonomy in §4 matches phasing in §7 matches acceptance in §9
- ✅ Scope check: 5 phases, each ≤25 file touches except Phase D (~70 modals) — D may need sub-batching during implementation but the architectural contract is uniform
- ✅ Ambiguity check: "celebration modal" defined as member tier-up / milestone / payout-success (no other special-case modals get V6)
- ✅ Goal/non-goal coverage: every goal G1-G7 has a §9 acceptance criterion
- ✅ Rule Q V66 compliance: Phase E requires Playwright L1 spec before final ship claim

---

**END SPEC** — awaiting user review before invoking `writing-plans` skill.
