# Backend Menu D · Sub-tab Picker (V5 Desktop + V2 Mobile)

**Status**: Design APPROVED 2026-05-18 EOD+5 · awaits writing-plans
**Scope**: Backend Menu D extension · cosmetic shell · adds intermediate sub-tab picker step between orb click and tab navigation
**Reference mockup**: `docs/superpowers/specs/2026-05-18-backend-menu-redesign-mockup.html` + Visual Companion sessions `.superpowers/brainstorm/326-1779050612/content/subtab-folder-styles-v2.html`

---

## 1. Origin

User feedback (verbatim):
- *"กดแล้วอยากให้เปิดเหมือน C คือเหมือนเปิดกล่องขึ้นมา แต่แทนที่ข้างในจะเป็นข้อความเหมือน C แต่ให้เป็น icon เหมือน A จะสวยกว่า คล้ายๆเปิด Folder ใน IOS เลย ลองทำมาให้เลือกหน่อยสัก 5 แบบ"*
- Then after seeing 5 visual companion options: *"Desktop ลอง V5 ก่อนดิกว่า แล้วทำให้ความเอียงมันเอียงตามเม้าเรา เหมือนหันหน้าความเอียงหาเม้าเราอะ แต่ไม่ต้องหันเยอะ หันแบบ interactive หน่อยๆกับมิศทางเม้า"*
- *"ส่วนถ้ากดจาก mobile ก็ให้ขยายตัวเป็น V2 กลางจอ"*
- *"สรุปคือใช้ 2 แบบเลย Desktop ใช้ V5 และ Mobile ใช้ V2 แตกตัวไปกลางจอ"*

**Problem**: Currently each orb click → navigates to `section.items[0].id` (first sub-tab only). Sections with 17 (Reports) or 21 (Master) sub-tabs are unreachable from the new shell. User must edit URL manually.

**Solution**: Intermediate sub-tab picker triggered when section has ≥2 sub-tabs.

---

## 2. Locked Design Decisions

| # | Decision | Lock |
|---|---|---|
| 1 | **Desktop ≥768px** = V5 3D Tilt Stack with interactive mouse-follow tilt | ✓ |
| 2 | **Mobile <768px** = V2 Expanding Bubble (scale from clicked orb to center) | ✓ |
| 3 | Trigger condition: section.items.length ≥ 2 → open picker. Length 1 → direct navigate (skip popup) — applies to `customers` + `finance` (current single-item sections) | ✓ |
| 4 | **Mouse-follow tilt** (Desktop): base `rotateX(8deg) rotateY(-4deg)` + cursor-direction bias ±6deg X/Y, lerp-smoothed (10-frame ease). "Modal leans toward cursor" feel. Reset to base when cursor leaves modal | ✓ |
| 5 | **Mini-orb depth stagger** (Desktop): each cell gets `translateZ` between 0-30px deterministically (per cell index modulo 4). Hover lifts +10px | ✓ |
| 6 | **Modal color (Mobile V2)**: uses parent orb's gradient verbatim (`--c1` / `--c2` from `SECTION_COLOR`). Mini-orbs inside are white-tinted `rgba(255,255,255,0.18) + backdrop-blur(8px)` tiles | ✓ |
| 7 | **Modal color (Desktop V5)**: neutral dark frosted glass (`rgba(15,23,42,0.95)` → `rgba(8,12,24,0.96)`) + section-accent border `var(--c1) 35% alpha`. Mini-orbs use full section gradient. | ✓ |
| 8 | **Sub-tab emoji map** (NEW `subTabEmoji.js`): ~50 entries keyed on `item.id`. Examples: `reports-pnl: '💰'`, `staff: '👤'`, `holidays: '📆'`, `system-settings: '⚙️'`. Fallback `'✨'`. | ✓ |
| 9 | **Click mini-orb** → `onNavigate(item.id)` + close BOTH SubTabBloom and parent ArcBloom (back to main content). Click outside / Esc → close SubTabBloom only (ArcBloom stays open behind) | ✓ |
| 10 | **A11y**: `role="dialog" aria-modal="true"` + per-cell `role="menuitem"` · focus orb-0 on open · arrow-key 4-way nav (handles 4-column grid wrap) · Esc close · `prefers-reduced-motion` → disable mouse-follow + depth stagger (flat layout) | ✓ |
| 11 | **Animation timings**: Desktop V5 open 320ms `cubic-bezier(0.34, 1.56, 0.64, 1)` (back-overshoot for "popping" 3D entrance). Mobile V2 open 350ms same easing, transform-origin = clicked orb's screen position | ✓ |
| 12 | **Cosmetic-shell rule preserved** — `onNavigate(tabId)` contract identical to current; just adds intermediate picker step. NO changes to handlers, state shape, prop signatures, NAV_SECTIONS, permissions, routing, Firestore, auth | ✓ |

---

## 3. Preserved-Contract Invariant (NON-NEGOTIABLE)

Per `feedback_cosmetic_shell_redesign_constraint.md` + iron-clad cosmetic-shell rule:

- ✅ `onNavigate(tabId)` callback signature verbatim — same string `tabId` flows out as before
- ✅ `BackendArcBloom` props unchanged · only `handleOrbClick` internal logic shifts from "navigate first item" to "open SubTabBloom if items.length ≥ 2"
- ✅ `BackendShellNew` props unchanged · SubTabBloom is internal to ArcBloom
- ✅ `NAV_SECTIONS` read-only · permissions via `useTabAccess` unchanged · routing unchanged
- ✅ Sub-components (BranchSelector / ThemeToggle / ProfileDropdown / StaffChatBubble / BackendCmdPalette) UNTOUCHED
- ❌ No new state stored anywhere outside SubTabBloom's local component state
- ❌ No new dependencies (pure React + existing CSS / lucide-react if needed for any icon, but primary is emoji strings)

---

## 4. Files Affected (Estimate — confirmed during writing-plans)

### NEW files (3)

| File | Responsibility | LOC est. |
|------|----------------|----------|
| `src/components/backend/shell/BackendSubTabBloom.jsx` | Modal picker · responsive (V5 desktop / V2 mobile) · mouse-track useEffect + lerp · keyboard + focus trap · open/close animation | 250 |
| `src/components/backend/shell/subTabEmoji.js` | Emoji map for ~50 sub-tabs (keyed on item.id) + fallback constant | 70 |
| `tests/backend-menu-d-subtab-picker-*.test.jsx/.js` | RTL + source-grep + Rule I flow-simulate + stress (covers Tier 1-3+5) | 350+ |

### MODIFIED files (3)

| File | Change | LOC delta |
|------|--------|-----------|
| `src/components/backend/shell/BackendArcBloom.jsx` | `handleOrbClick` branches: items.length ≥ 2 → open SubTabBloom (local state) · items.length 1 → direct navigate (current). Render SubTabBloom conditionally below the orb grid | +~25 |
| `src/index.css` | Subtab modal CSS (V5 3D + V2 bubble + mini-orb styling + mouse-follow CSS var support + reduced-motion) | +~150 |
| `tests/e2e/backend-menu-d.spec.js` (existing T8 Playwright) | Extend with sub-tab picker E2E scenarios E9-E14 (open picker · click sub-tab · navigate · mouse-tilt · mobile bubble · Esc close) | +~80 |

### NEW test files (per 6-tier pyramid)

- `tests/backend-menu-d-subtab-picker-rtl.test.jsx` — Tier 1 RTL (20 tests · render · responsive · 8 sections coverage · click → onNavigate)
- `tests/backend-menu-d-subtab-picker-source-grep.test.js` — Tier 2 regression locks (15 tests · component imports · CSS markers · cosmetic-shell preservation · single-item skip-popup contract)
- `tests/backend-menu-d-subtab-picker-flow-simulate.test.jsx` — Tier 3 Rule I full-flow (10 tests · main bloom → orb click → SubTabBloom open → mini-orb click → activeTab updates · single-item shortcut)
- `tests/backend-menu-d-subtab-picker-stress.test.jsx` — Tier 5 chaos (8 tests · rapid open/close · 100× mouse-move · keyboard thrash · reduced-motion respected · 21-item Master scroll)

### Tier 4 (Playwright L1) + Tier 6 (user-simulation)

- Extend existing `tests/e2e/backend-menu-d.spec.js` with E9-E14 (Playwright real browser · mouse-move pointer event · iPhone 14 viewport bubble animation)
- Extend `tests/backend-menu-d-user-simulation.mjs` with picker click sequences

---

## 5. Out of Scope

- Frontend menu V2 (separate · EOD+3) — UNCHANGED
- Changes to NAV_SECTIONS data structure (only emoji metadata added in separate map file)
- Changes to existing tab content / page-level rendering
- Removing existing T8 e2e specs (just extending)
- Sub-sub-tabs / nested 3-level menus (NAV_SECTIONS only goes 2 deep)

---

## 6. Test Discipline (6-tier pyramid · loop until 100% Perfect)

Per `feedback_cosmetic_shell_redesign_constraint.md` + Rule Q V66:

| Tier | What | Why |
|------|------|---|
| 1 | RTL component | render + click → onNavigate verbatim |
| 2 | Source-grep regression | preserved-contract locks + emoji map presence + responsive split |
| 3 | Rule I flow-simulate | full chain: orb → SubTabBloom → mini-orb → activeTab |
| 4 | **Playwright L1 (REAL browser + REAL mouse-move)** | mouse-follow tilt MUST be verified with real cursor — jsdom can't dispatch real pointer events with meaningful coordinates · Rule Q V66 mandatory |
| 5 | Stress (rapid clicks · mouse-thrash · 21-item scroll · reduced-motion) | chaos resilience |
| 6 | User-simulation bot | random sequences · 100% pass rate |

**Loop rule**: ANY tier red → fix → re-run ENTIRE pyramid. No "done" claim until 100% Perfect.

**Rule Q V66 emphasis**: mouse-follow tilt is INHERENTLY VISUAL + interactive. RTL with mocked mousemove events is NOT sufficient. Playwright real-browser run with `page.mouse.move(x, y)` is the only acceptable L1 verification. User L1 hands-on follow-up after deploy.

---

## 7. Rule Compliance Checklist

- [x] **Rule J** (Brainstorming HARD-GATE): brainstorming completed via Visual Companion · 5 options → user picked V5 (desktop) + V2 (mobile) hybrid · 12 locked decisions
- [x] **Rule I** (Full-Flow Simulate at sub-phase end): mandated above Tier 3
- [x] **Rule Q** (Real-Adversarial Verification): Tier 4 Playwright L1 required for mouse-follow contract
- [x] **Cosmetic-shell** (`feedback_cosmetic_shell_redesign_constraint`): every handler/prop/state verbatim · no flow/logic/wiring changes
- [x] **Task count tight** (`feedback_keep_task_count_tight`): single feature scope — target 8-10 tasks (cap 15)
- [x] **Local-only** (`feedback_local_only_no_deploy`): no deploy until user types "deploy" explicitly
- [x] **Rule C1** (Rule of 3): emoji map extracted to its own file from day one (avoids future inline duplication)
- [x] **Rule C2** (Security): no secrets · no Math.random for IDs · cosmetic only
- [x] **Rule C3** (Lean schema): NO new Firestore collection · purely UI

---

## 8. Sub-tab Emoji Mapping (preview · finalized in `subTabEmoji.js`)

### appointments-section (7)
- `appointment-all`: 📋 · `appointment-no-deposit`: 📆 · `appointment-deposit`: 💵 · `appointment-treatment-in`: 🩺 · `appointment-follow-up`: 🔔 · `appointment-walk-in`: 👣 · `recall`: 📞

### customers (1)
- `customers`: 👥 — SKIP POPUP (direct navigate)

### sales (5)
- `sales`: 🧾 · `quotations`: 📄 · `online-sales`: 🌐 · `insurance-claims`: 🛡️ · `vendor-sales`: 🤝

### stock (2)
- `stock`: 📦 · `central-stock`: 🏬

### finance (1)
- `finance`: 💰 — SKIP POPUP (direct navigate)

### marketing (3)
- `promotions`: 🏷️ · `coupons`: 🎟️ · `vouchers`: 🎁

### reports (17)
- `reports`: 🏠 · `reports-sale`: 🧾 · `reports-customer`: 👥 · `reports-appointment`: 📅 · `reports-stock`: 📦 · `reports-rfm`: ✨ · `reports-revenue`: 📈 · `reports-appt-analysis`: ⚡ · `reports-daily-revenue`: 📊 · `reports-staff-sales`: 👤 · `reports-pnl`: 💹 · `expense-report`: 💸 · `clinic-report`: 🏥 · `reports-payment`: 💳 · `reports-df-payout`: 🩺 · `reports-remaining-course`: ⏳ · `smart-audience`: 🎯

### master (21)
- `product-groups`: 📂 · `product-units`: ⚖️ · `medical-instruments`: 🔧 · `holidays`: 📆 · `branches`: 🏢 · `exam-rooms`: 🚪 · `permission-groups`: 🛡️ · `staff`: 👤 · `staff-schedules`: 🗓️ · `doctor-schedules`: 👨‍⚕️ · `doctors`: 🩺 · `products`: 💊 · `courses`: 💼 · `finance-master`: 🏦 · `df-groups`: 💯 · `document-templates`: 📃 · `line-settings`: 💚 · `fb-settings`: 📘 · `link-requests`: 🔗 · `system-settings`: ⚙️ · `branch-backup`: 💾 · `backup-manager`: 🗄️

(Emoji finalized in spec; tweakable during implementation if user prefers different glyphs)

---

## 9. Spec self-review

Inline checks:
- [x] No placeholders / TBDs
- [x] Internal consistency (desktop V5 vs mobile V2 contracts both defined · cosmetic-shell preserved on both)
- [x] Scope focused (single feature · 1 plan)
- [x] Ambiguity resolved (mouse-follow magnitude bounded to ±6deg · single-item skip explicit · animation timings explicit)

---

## 10. Next step

**writing-plans skill** invocation:
- Read this spec + main Backend Menu D design at `2026-05-18-backend-menu-redesign-variant-d-design.md`
- Break into 8-12 tasks (per `feedback_keep_task_count_tight`)
- Each task: preserved-contract check + relevant test tier
- Save plan to `docs/superpowers/plans/2026-05-18-backend-subtab-picker.md`
