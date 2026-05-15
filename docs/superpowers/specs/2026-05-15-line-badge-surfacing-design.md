# LINE Badge Surfacing + CustomerCard Redesign — Design

**Date**: 2026-05-15
**Author**: Claude (brainstormed with user)
**Spec ID**: V68
**Status**: Approved — proceeding to implementation plan
**Related**: V67 (LINE reminder pipeline schema-drift fix, 2026-05-15) · LR-4 invariant (CustomerOption shared component, Wave 1 Task 9, 2026-05-15) · AV45 (LINE OA per-branch credential discipline)

---

## 1. Goal

Make LINE-link state visible everywhere it matters in the admin UI, and remove cruft that no longer carries semantic weight.

Three user-asked changes, one cohesive UI consistency improvement:

1. **Add LINE badge** (🟢/⚪️ pill) to every appointment-list rendering in admin surfaces — so admin can see at a glance which appts will trigger a LINE reminder when the cron fires
2. **Remove duplicate checkbox** in `AppointmentFormModal` that has no consumers (legacy V32-tris-ter `lineNotify` field — superseded by `notifyChannel: ['line']` array driven by `LineNotifyConfirmation` green-card at top)
3. **Add LINE badge** to `CustomerCard` in `tab=customerlist` — consistent with appt-row badge pattern; uses opportunity to redesign card to world-class polish (V5 Editorial + 4-layer shadow depth)

User directives (verbatim):

> "เพิ่มการแสดง badge line app icon ใน list การนัดหมายที่เปิดการแจ้งเตือนผ่านไลน์ ทั้งใน tab appointment ทั้งหมด บนตารางเวลาในแต่ละ tab, ทุกที่ที่ list นัดหมายไปปรากฎใน backend และ tab นัดหมายของ Frontend และทุกที่ที่ list นัดหมายไปปรากฎใน Frontend ด้วย"

> "จากภาพฝากลบปุ่มที่ซ้ำกันด้วยใน modal นัดหมาย จะเห็นว่ามี checkbox แจ้งเตือนนัดหมายทาง LINE อยู่ข้างล่างสุด คิดว่าคงไม่ได้ใช้แล้ว ลบทิ้งไปเลย"

> "ใน tab ข้อมูลลูกค้าของ backend ให้แสดง badge line app icon ที่ card list ของลูกค้าคนที่ผูก line กับเราแล้วด้วย"

> "เอาแบบที่ 5 [Editorial] แต่ย้ายสาขาไปไว้ใต้เบอร์โทร ... เหลือใส่เงาหรืออะไรก็ได้ ให้ Card มันดูเด้งออกมาจาก bg มากกว่านี้"

---

## 2. Decisions Locked During Brainstorming

| # | Question | Decision | Rationale |
|---|---|---|---|
| Q1 | Scope of "ทุกที่" appt-list surfaces | All 4 admin surfaces (Backend `AppointmentCalendarView` + `AppointmentHubView` + `CustomerDetailView` appts tab + Frontend `AdminDashboard` queue calendar). NOT customer-facing `PatientDashboard` / `ClinicSchedule`. | Customer-facing surfaces don't need badge — customer IS the recipient; admin needs to see the channel state. |
| Q2 | Badge visual style | 🟢 LINE text chip (CustomerOption pattern reuse) | Maximum consistency with existing LR-4 lock (CustomerOption picker chip). Admin trains visual once → recognizes everywhere (picker + modal + card + appt row). |
| Q3 | Cleanup scope of legacy `lineNotify` | Full strip — checkbox UI + formData default + edit-mode load + 3 payload writes + `appointmentDepositBatch.js` (3 sites) | No consumers anywhere (verified via grep: api/ has zero references; cron uses `notifyChannel.includes('line')`). Rule C3 lean schema win. Existing be_appointments docs keep orphan `lineNotify: false` field harmlessly. |
| Q4 | CustomerCard badge placement | Bottom meta row (alongside engagement chips) | Treats LINE link as just-another-status; per-branch distinction (🟢 = linked at selected branch, ⚪️ = linked elsewhere only) follows top-right BranchSelector context — same architecture as CustomerOption. |
| Q5 (visual) | CustomerCard variant | V5 Editorial · meta stacked vertically (phone above branch) · 4-layer shadow depth · emojis on key fields | User picked V5 from 4 options after seeing dark+light mockups; iterated to vertical meta stack + shadow depth. |
| Approach | Implementation strategy | A — shared component + atomic single-commit batch | Rule of 3 honored (NEW `AppointmentLineBadge` mirrors CustomerOption); V67-class hygiene cluster shipped together; 1 deploy cycle vs 4. |

---

## 3. Architecture

### 3.1 File map

**NEW (2 files)**:

| File | Purpose |
|---|---|
| `src/components/AppointmentLineBadge.jsx` | Shared appt-row LINE chip (🟢/⚪️). Mirrors `CustomerOption` LR-4 pattern. Single source of truth. |
| `tests/v68-line-badge-surfacing-audit.test.js` | AV47 source-grep regression — locks badge import + render at all 4 surfaces; no inline-pasted chip JSX outside the component. |

**MODIFIED (9 files)**:

| File | Change |
|---|---|
| `src/components/backend/AppointmentCalendarView.jsx` | Import + render `<AppointmentLineBadge>` in appt cards inside time-grid cells |
| `src/components/admin/AppointmentHubView.jsx` | Import + render in hub list rows |
| `src/components/backend/CustomerDetailView.jsx` | Import + render in appts-tab list rows |
| `src/pages/AdminDashboard.jsx` | Import + render in queue calendar appt cards (Frontend page) |
| `src/components/backend/AppointmentFormModal.jsx` | DELETE legacy checkbox (lines 1416–1420) + STRIP `lineNotify` field from formData defaults (line 134) + edit-mode load (line 301) + 3 payload sites (lines 641, 713, 795) |
| `src/lib/appointmentDepositBatch.js` | STRIP `lineNotify` from 4 sites (lines 133, 458, 545, 578) |
| `src/components/backend/CustomerCard.jsx` | Full rewrite — V5 Editorial variant. Stable public API (`{customer, accentColor, theme, mode, cloneStatus, cloneProgress, onClone, onView, onDeleteClick}`); CustomerListTab caller unchanged. |
| `src/components/backend/CustomerListTab.jsx` | No code change. (CustomerCard reads `customer.lineUserId_byBranch` internally — already in customer prop shape.) |
| `.agents/skills/audit-anti-vibe-code/SKILL.md` | NEW AV47 invariant + banner AV1–AV47 |

**OUT OF SCOPE (explicitly NOT touched)**:

- Customer-facing `PatientDashboard.jsx` / `ClinicSchedule.jsx` (per Q1)
- Cron pipeline (`api/cron/line-reminder-*`) — no contract change
- `firestore.rules` / `storage.rules` — no schema change
- Existing `be_appointments` docs — orphan `lineNotify: false` field preserved harmlessly (Rule C3 doesn't require backfill since reads are dropped)
- `LineReminderHistoryPanel.jsx` — already LINE-themed; no change
- `CustomerOption.jsx` — unchanged (the existing picker pattern is the model we mirror, not modify)

### 3.2 Commit shape

Single commit (V18 lock — no auto-deploy):

```
feat(V68): LINE badge surfacing across 4 admin surfaces +
           CustomerCard V5 redesign + lineNotify legacy strip
```

Push immediately. NO `vercel --prod` until user types "deploy" verb. NO firestore/storage rules deploy (zero rules changes).

---

## 4. Components

### 4.1 NEW `<AppointmentLineBadge>` (canonical appt-row chip)

**Location**: `src/components/AppointmentLineBadge.jsx`

**Purpose**: Render the 🟢/⚪️ LINE chip for any appointment row in admin UI. Determines linked-state from `appt.notifyChannel` array AND (defensively) `appt.lineNotify` legacy field to remain compatible with legacy be_appointments docs that pre-date V67's `notifyChannel` adoption.

**Props**:

```js
{
  appt,                  // be_appointments doc shape (or any object with notifyChannel + customerId)
  contextBranchId = '',  // optional — if provided, future variant could distinguish "this branch
                         //            actually has a configured OA"; v1 ignores it (icon = green for any LINE-channel appt)
  size = 'sm',           // 'xs' | 'sm' | 'md' — caller picks based on row density
}
```

**Render contract**:

| Condition | Render |
|---|---|
| `appt.notifyChannel` includes `'line'` (canonical post-V67) | `🟢 LINE` chip (green-tinted background, `#16a34a` light / `#4ade80` dark text) |
| `appt.notifyChannel` falsy AND `appt.lineNotify === true` (legacy V32-tris-ter compat) | `🟢 LINE` chip (same — defensive backward-compat OR-merge) |
| Neither | `null` (no chip rendered — keep row clean for non-LINE appts) |

**Rationale for OR-merge**: V67 lesson — pipeline reads `notifyChannel`, but legacy docs may have only `lineNotify: true`. Defensive `||` chain mirrors `lineBotResponder.js:407-421` and `lineReminderTemplate.js:30` pattern. Once V68 ships + lineNotify field is no longer written, this fallback is forward-compat-only and can stay indefinitely (zero cost).

**Style**:

```jsx
<span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded
                 bg-green-500/10 text-green-700 dark:text-green-400
                 text-xs font-medium flex-shrink-0">
  🟢 LINE
</span>
```

(Same Tailwind classes as CustomerOption's `linkedHere` chip — copy-paste deliberate to keep visual equivalence.)

### 4.2 REWRITE `CustomerCard.jsx` — V5 Editorial + Depth

**Public API stable** — caller `CustomerListTab.jsx` not modified. Only internal render shape changes.

**Layout** (top-to-bottom):

```
┌──────────────────────────────────────────┐  ← rounded-2xl, 4-layer shadow stack
│ [56px halo gradient avatar — initials] ✕│  ← header: avatar + name + delete (hover-only)
│   นางสาว แพรพร พรแพร                       │
│   HN 000004 · 28 ปี · ♀️ หญิง               │  ← tagline (12px muted)
│ ┌──────────────────────────────────────┐ │
│ │ 📞 081-234-5678                      │ │  ← meta col: phone above
│ │ 📍 นครราชสีมา                         │ │  ← branch below (Q5 stack decision)
│ └──────────────────────────────────────┘ │
│ 💊 12 รักษา · 📦 5 คอร์ส       🟢 LINE  │  ← engagement + LINE chip (Q4=C bottom)
└──────────────────────────────────────────┘
```

**Avatar**: 56px circle with halo glow effect. Initials = first 2 chars of customer name. Background = hash-derived gradient from 8-color palette (pink/teal/amber/blue/purple/emerald — NO red per Thai cultural rule).

**Avatar gradient palette helper**:

```js
const AVATAR_GRADIENTS = [
  'bg-gradient-to-br from-pink-500 to-pink-700',
  'bg-gradient-to-br from-teal-500 to-teal-700',
  'bg-gradient-to-br from-amber-500 to-amber-700',
  'bg-gradient-to-br from-blue-500 to-blue-700',
  'bg-gradient-to-br from-purple-500 to-purple-700',
  'bg-gradient-to-br from-emerald-500 to-emerald-700',
];
function pickGradient(name) {
  let hash = 0;
  for (const ch of name) hash = (hash << 5) - hash + ch.charCodeAt(0);
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}
function getInitials(name) {
  const cleaned = name.replace(/^(นาย|นาง|นางสาว|เด็กชาย|เด็กหญิง)\s*/, '').trim();
  return cleaned.slice(0, 2) || '?';
}
```

**Shadow stack** (4 layers — applied inline via Tailwind `shadow-[...]` arbitrary value OR a project-shared utility class):

Dark theme:
```
inset 0 1px 0 rgba(255,255,255,0.05)   ← top edge highlight
0 1px 2px rgba(0,0,0,0.3)               ← tight contact
0 4px 12px rgba(0,0,0,0.35)             ← mid depth
0 12px 32px rgba(0,0,0,0.4)             ← soft ambient
```

Light theme (flipped contrast):
```
inset 0 1px 0 rgba(255,255,255,0.9)     ← top inset highlight
0 1px 2px rgba(31,41,55,0.04)
0 4px 12px rgba(31,41,55,0.06)
0 12px 28px rgba(219,39,119,0.08)       ← sakura ambient
```

Hover: `translateY(-3px)` + ambient bleeds in fire-red (dark) / sakura-pink (light) accent.

**LINE chip**: same `<AppointmentLineBadge>`-style chip — but reads `customer.lineUserId_byBranch[contextBranchId]` (per-branch context from BranchSelector via `useSelectedBranch()` hook); 🟢 if linked at selected branch (or legacy `customer.lineUserId` when `customer.branchId === contextBranchId`); ⚪️ if linked at OTHER branch only; nothing if not linked anywhere.

**Reuse decision** — locked: extract the badge logic from `CustomerOption.jsx` into a tiny named export `<CustomerLineBadge>` in the SAME FILE (sibling export, NOT a new file). `CustomerOption` itself continues to render `<CustomerLineBadge>` internally for picker callsites. `CustomerCard.jsx` imports `CustomerLineBadge` directly and renders it standalone in the bottom meta row. Single source of truth for the per-branch 🟢/⚪️ logic; zero new files.

### 4.3 DELETE legacy `lineNotify` checkbox + field

**`AppointmentFormModal.jsx`** — DELETE these surfaces:

| Line | Delete |
|---|---|
| 134 | `lineNotify: false,` from formData default |
| 301 | `lineNotify: !!appt.lineNotify,` from edit-mode load |
| 641 | `lineNotify: !!formData.lineNotify,` from createBackendAppointment payload |
| 713 | `lineNotify: payload.lineNotify,` from updateBackendAppointment payload |
| 795 | `lineNotify: !!formData.lineNotify,` from save-recurring branch |
| 1416–1420 | The `<label>` + `<input checkbox>` JSX block ("LINE notify" comment + checkbox) |

**`appointmentDepositBatch.js`** — DELETE these surfaces:

| Line | Delete |
|---|---|
| 133 | `lineNotify: !!appt.lineNotify,` from `cleanAppointment()` builder |
| 458 | `'lineNotify',` from the explicit allow-list array |
| 545 | `lineNotify: !!apptPayload.lineNotify,` from batch write payload |
| 578 | `'appointment.lineNotify': !!apptPayload.lineNotify,` from `_updates` map |

**Verification**: post-strip grep `lineNotify` across `src/` + `api/` should return ZERO matches in runtime files (test files may legitimately reference for backward-compat assertions; that's fine).

### 4.4 NEW `AV47` invariant

**Title**: AV47 — Appointment-row LINE badge MUST go through `<AppointmentLineBadge>` shared component (V68 mock-shadow drift prevention)

**Trigger**: any new code that renders an appointment row in admin surfaces.

**Class**: V67-class continuation — Rule of 3 enforcement at the appt-row badge layer. Inline-pasted `🟢 LINE` chips create drift risk (each callsite could diverge in color / label / behavior). Single component import = greppable + style-change = 1 file edit.

**Grep targets** (each MUST be present):

- `src/components/backend/AppointmentCalendarView.jsx` MUST contain `import.*AppointmentLineBadge` AND `<AppointmentLineBadge`
- `src/components/admin/AppointmentHubView.jsx` MUST contain same
- `src/components/backend/CustomerDetailView.jsx` MUST contain same
- `src/pages/AdminDashboard.jsx` MUST contain same
- NO file outside the 4 sanctioned surfaces + `AppointmentLineBadge.jsx` + `CustomerOption.jsx` (which renders `🟢 LINE` for the picker chip) + `tests/**` MUST contain a literal `🟢 LINE` string. Inline-pasted chip JSX in any other file fails AV47.B.

**Sanctioned exceptions**: NONE. The 4 surfaces listed are the closed set; new appt-render surfaces added in the future MUST add themselves to AV47 grep + import the badge.

---

## 5. Data Flow

### 5.1 Appointment row badge

```
be_appointments doc (real prod) ─→ appt.notifyChannel: ['line'] (post-V67)
                                ╲
                                 ╲─→ <AppointmentLineBadge appt={appt} />
                                       ↓
                                       reads appt.notifyChannel.includes('line')
                                                 || appt.lineNotify === true (V32-tris-ter compat)
                                       ↓
                                       returns 🟢 LINE chip OR null
```

### 5.2 Customer card badge

```
be_customers doc ─→ customer.lineUserId_byBranch[branchId] (canonical, post-V32-tris-quater)
                ╲
                 ╲─→ customer.lineUserId + customer.branchId (legacy V32-tris-ter)
                ╱
useSelectedBranch() ─→ contextBranchId (from BranchSelector via BranchContext)
                ↓
                <CustomerLineBadge customer={customer} contextBranchId={contextBranchId} />
                  (extracted helper from CustomerOption — same logic, sibling export)
                ↓
                🟢 (linked here) | ⚪️ (linked elsewhere) | null (not linked)
```

### 5.3 Modal cleanup

Pre-V68: `formData.lineNotify` (checkbox state) → `appointmentDepositBatch.cleanAppointment()` → `be_appointments.lineNotify: false` (orphan field, no consumers)

Post-V68: `formData.lineNotify` removed entirely. Channel state lives in `formData.notifyChannel: ['line']` (driven by `LineNotifyConfirmation` green-card at top of modal). Only `notifyChannel` is written.

---

## 6. Error Handling

### 6.1 `<AppointmentLineBadge>`

- **Missing `appt`**: render `null` (defensive — same as CustomerOption pattern)
- **`appt.notifyChannel` undefined**: fall through to `appt.lineNotify` check; if both falsy, render `null`
- **`appt.notifyChannel` not an array** (defensive against shape drift): treat as falsy, fall through to `lineNotify`
- **No throw paths** — badge is purely presentational

### 6.2 `<CustomerLineBadge>` (extracted from CustomerOption)

- Inherits CustomerOption's existing defensive pattern (lines 27-43 of `CustomerOption.jsx`):
  - `!customer || !contextBranchId` → return `null`
  - `customer.lineUserId_byBranch?.[contextBranchId]` optional-chain
  - `customer._lineStale === true` → treat as not-linked-here

### 6.3 `CustomerCard` rewrite

- **Missing customer name**: avatar fallback to `'?'` initials; no throw
- **Missing patientData**: card still renders with name + HN; tagline shows just the available fields (e.g. just HN if no age/gender)
- **Missing customer.lineUserId_byBranch + missing customer.branchId**: badge component returns null; card renders without badge (clean fallback)

### 6.4 lineNotify field strip

- **Existing be_appointments docs with `lineNotify: false`**: orphan field, harmless, no read path. No backfill needed.
- **Edit-mode load on legacy appt**: `appt.lineNotify` field is ignored on load (formData.lineNotify no longer exists); UI drives entirely off `notifyChannel` via `LineNotifyConfirmation`.
- **Save path**: writes `notifyChannel` only; existing `lineNotify` field on the doc is preserved unchanged (Firestore merge semantics — only fields in the payload get touched).

---

## 7. Testing

### 7.1 NEW `tests/v68-line-badge-surfacing-audit.test.js`

Source-grep regression bank (V67 AV46 pattern) with these groups:

- **AV47.A** (4 tests) — each of 4 appt surfaces imports `AppointmentLineBadge` + renders `<AppointmentLineBadge` JSX
- **AV47.B** (1 test) — universal classifier: NO file outside the 4 sanctioned surfaces + the badge component itself + tests/* contains literal `🟢 LINE` string
- **AV47.C** (3 tests) — `AppointmentLineBadge.jsx` reads `notifyChannel.includes('line')` AND has `appt.lineNotify` defensive fallback AND returns `null` when neither truthy
- **AV47.D** (2 tests) — `CustomerCard.jsx` imports `CustomerLineBadge` + uses `useSelectedBranch()` for contextBranchId
- **AV47.E** (3 tests) — `lineNotify` field stripped: `AppointmentFormModal.jsx` MUST NOT contain `formData.lineNotify` reads/writes; `appointmentDepositBatch.js` MUST NOT contain `lineNotify` payload fields; AV47 marker comment present in stripped files
- **AV47.F** (2 tests) — `CustomerLineBadge` extracted from CustomerOption: importable as named export from `src/components/CustomerOption.jsx`; render contract identical to inline CustomerOption chip (per-branch logic)

Total: ~15 source-grep assertions.

### 7.2 EXISTING `tests/branch-selector-bs-d-customer-card.test.js`

Verify CustomerCard's BSA branch-selector test still passes — the only existing CustomerCard-touching test in repo (BS-D invariant). Public API stays stable; if test asserts on internal markup that changed (avatar / spacing classes), update test selectors to V5 shape with V21 lock comment.

### 7.3 EXISTING `tests/line-reminder-modal-autotick*.test.{js,jsx}`

Verify LineNotifyConfirmation green-card at TOP of modal still drives `notifyChannel`. Should pass unchanged after `lineNotify` strip (LineNotifyConfirmation reads/writes `notifyChannel`, not `lineNotify`).

### 7.4 Targeted vitest run (Rule N small bugfix scope)

```bash
npx vitest run \
  tests/v68-line-badge-surfacing-audit.test.js \
  tests/branch-selector-bs-d-customer-card.test.js \
  tests/line-reminder-modal-autotick*.test.*
```

Plus full suite at end of batch (Rule N batch-end mandatory due to multi-file structural change in CustomerCard rewrite).

### 7.5 Rule Q L2 verification

`scripts/diag-line-badge-render-l2-verify.mjs` (NEW) — uses jsdom + React Testing Library to render each of 4 surfaces with a fixture appointment that has `notifyChannel: ['line']` AND with one without; assert badge renders / doesn't render. NOT real-prod query (badge is purely client-render); L2 here = real React render against fixture data with the actual production component code, not mock-shadowed Firestore. (Real-prod query verification was done in V67 — V68 is a render-layer fix, so L2 = real render.)

### 7.6 Rule Q L1 (user hands-on)

Post-deploy:
1. Open backend → tab=appointment-all → grid view → see 🟢 LINE chip on appts that have notifyChannel=line
2. Same in tab=appointment-hub
3. Same in customer detail view → appts tab
4. Same in /admin (Frontend) queue calendar
5. Open AppointmentFormModal → confirm bottom checkbox is GONE; only green-card at top
6. Open tab=customerlist → see V5 redesigned cards with 🟢/⚪️ LINE chips + 4-layer shadow depth + initials gradient avatars

---

## 8. Migration / Rollout

- **No data migration needed.** Existing `be_appointments.lineNotify: false` orphan fields are harmless (no read path post-V68).
- **No firestore rules change.** Pure client-render + client-state change.
- **Single deploy** when user authorizes — `vercel --prod` only (no firebase deploy).
- **Rollback**: single `git revert` reverts everything atomically (no inter-commit dependencies). User-facing: badges disappear, modal regains the dead checkbox, CustomerCards revert to old visual. No data loss possible.

---

## 9. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| CustomerCard rewrite breaks layout in some edge case (very long Thai name, missing patientData) | Medium | Truncate name with `truncate` class + minimum-viable card (tagline degrades gracefully); jsdom render test in AV47.D covers missing-fields fixtures |
| AV47 grep too strict — flags a legit new surface | Low | Sanctioned-exception list documented in spec § 4.4 + AV47 SKILL.md entry; future surfaces ADD themselves explicitly |
| `lineNotify` strip breaks an undiscovered consumer | Very Low | Pre-strip grep across `src/` + `api/` + `scripts/` + `tests/` returned ONLY input-form writers (verified during brainstorming Phase 1); test files may reference for backward-compat assertions |
| Avatar gradient hash collisions on common names | Low | 8-color palette; collisions = same color for same name = consistent (feature, not bug); all 8 colors avoid red per Thai rule |
| Light-theme shadow looks washed out on light pink bg | Medium | sakura-pink ambient (`rgba(219,39,119,0.08)`) provides accent contrast; user reviewed both themes in visual companion mockup → confirmed |

---

## 10. Acceptance Criteria

- [ ] 4 appt-list surfaces import + render `<AppointmentLineBadge>` (verified by AV47.A)
- [ ] No file outside the 4 + badge component contains literal `🟢 LINE` (AV47.B)
- [ ] `AppointmentFormModal.jsx` lines 1416–1420 deleted; no `lineNotify` references remain in modal/batch.js (AV47.E)
- [ ] `CustomerCard.jsx` rewritten to V5 Editorial + 4-layer shadow + meta-col + LINE chip in bottom meta row (visual verify in user L1)
- [ ] AV47 invariant added to `audit-anti-vibe-code/SKILL.md` (banner AV1–AV47)
- [ ] Targeted vitest GREEN
- [ ] Full vitest GREEN (Rule N batch-end)
- [ ] Rule Q L2 render verification GREEN
- [ ] User L1 hands-on: badges visible at all 4 appt surfaces + customer cards; modal cleaner; no regression on existing flows

---

## 11. Out of Scope (explicit non-goals)

- Customer-facing surfaces (PatientDashboard / ClinicSchedule) — per Q1
- Cron pipeline behavior changes — V67 already shipped that
- LINE OA configuration UI changes — Wave 1 LineSettingsTab unchanged
- be_appointments data migration — orphan fields harmless
- Performance optimization of appt-list rendering — separate concern
- Adding LINE-link state to appointment EDIT modal at the customer-picker layer (already done by Wave 1 Task 9 — `CustomerOption` chip)

---

## 12. References

- V67 V-entry (LINE reminder pipeline schema-drift fix, `.claude/rules/00-session-start.md` § 2)
- V67 verbose entry (`.claude/rules/v-log-archive.md`)
- AV45 (LINE OA per-branch credential discipline)
- AV46 (V67 — pipeline Firestore field name MUST match real schema)
- LR-4 invariant (CustomerOption shared component, Wave 1 Task 9)
- Rule of 3 (`.claude/rules/01-iron-clad.md` Rule C1)
- Rule N (targeted-test-only for small bugfixes)
- Rule Q V66 (Real-Adversarial Verification)
- Visual companion mockups (preserved in `.superpowers/brainstorm/686-1778829352/content/` for reference: `customer-card-redesign.html` · `customer-card-v2.html` · `customer-card-v5-final.html` · `customer-card-v5-depth.html`)
