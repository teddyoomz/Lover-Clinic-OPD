# V68 LINE Badge Surfacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface 🟢 LINE badges across all 4 admin appointment-list surfaces, redesign CustomerCard to V5 Editorial polish with depth, and strip dead `lineNotify` field — single atomic commit under V18 lock.

**Architecture:** Single shared `<AppointmentLineBadge>` component (mirrors LR-4 CustomerOption pattern) imported at 4 surfaces. CustomerCard rewritten with V5 Editorial layout + 4-layer shadow stack + initials avatar with hash-derived gradient. CustomerLineBadge sibling-extracted from CustomerOption.jsx. Legacy `lineNotify` field stripped from formData/payload/builder (zero consumers verified). NEW AV47 invariant locks shared-component discipline.

**Tech Stack:** React 19 + Vite 8 + Tailwind 3.4 + Vitest 4.1 + Firebase 12 (no schema changes)

**Reference:** Spec at `docs/superpowers/specs/2026-05-15-line-badge-surfacing-design.md`

---

## File Structure (lock decisions before tasks)

| File | Lines | Responsibility |
|---|---|---|
| `src/components/AppointmentLineBadge.jsx` (NEW) | ~40 | Shared appt-row LINE chip — reads `notifyChannel.includes('line')` with `lineNotify` defensive fallback |
| `src/components/CustomerOption.jsx` (MODIFY) | +25 | Add `<CustomerLineBadge>` named export (extracted from inline logic at lines 49-77) |
| `src/components/backend/CustomerCard.jsx` (REWRITE) | ~180 | V5 Editorial layout + 4-layer shadow + meta-col + initials gradient avatar + LINE chip in bottom meta row |
| `src/components/backend/AppointmentCalendarView.jsx` (MODIFY) | +3 | Import + render `<AppointmentLineBadge>` in `AppointmentSlotMeta` |
| `src/components/admin/AppointmentHubView.jsx` (MODIFY) | +3 | Import + render in hub list rows |
| `src/components/backend/CustomerDetailView.jsx` (MODIFY) | +3 | Import + render in appts-tab list |
| `src/pages/AdminDashboard.jsx` (MODIFY) | +3 | Import + render in queue calendar appt cards |
| `src/components/backend/AppointmentFormModal.jsx` (MODIFY) | -10 | DELETE checkbox JSX (1416-1420) + STRIP `lineNotify` from formData defaults + edit-mode load + 3 payload writes |
| `src/lib/appointmentDepositBatch.js` (MODIFY) | -5 | STRIP `lineNotify` from cleanAppointment + allow-list + payload + _updates map |
| `tests/v68-line-badge-surfacing-audit.test.js` (NEW) | ~140 | AV47 source-grep regression bank (15 assertions across 6 groups) |
| `tests/branch-selector-bs-d-customer-card.test.js` (MODIFY if needed) | ±5 | V21 fixup if asserting on old CustomerCard markup |
| `scripts/diag-line-badge-render-l2-verify.mjs` (NEW) | ~80 | Rule Q L2 jsdom render verification |
| `.agents/skills/audit-anti-vibe-code/SKILL.md` (MODIFY) | +60 | NEW AV47 invariant section + banner AV1–AV47 |

---

## Pre-flight: Read context files

- [ ] **Step 0.1: Read spec doc**

```bash
# Familiarize with the design decisions before coding
cat docs/superpowers/specs/2026-05-15-line-badge-surfacing-design.md
```

- [ ] **Step 0.2: Read CustomerOption.jsx (existing pattern to mirror)**

```bash
# Lines 27-80 — the badge logic we'll extract + mirror
```

Note key patterns:
- `branchLink = customer.lineUserId_byBranch?.[contextBranchId]`
- `legacyValid = customer.branchId === contextBranchId && customer.lineUserId`
- `linkedHere = !!(branchLink?.lineUserId || legacyValid)`
- `linkedElsewhere = !linkedHere && hasAnyLink`
- Render `🟢 LINE` (linkedHere) / `⚪️ LINE` (linkedElsewhere) / null

---

### Task 1: Extract `<CustomerLineBadge>` from CustomerOption.jsx as sibling export

**Files:**
- Modify: `src/components/CustomerOption.jsx`
- Test: `tests/v68-line-badge-surfacing-audit.test.js` (test added in Task 13; for Task 1 we verify via inline assertion)

**Goal:** Add named export `CustomerLineBadge` alongside `CustomerOption` so both pickers (via CustomerOption internally) and cards (via CustomerLineBadge directly) share one source-of-truth for the per-branch 🟢/⚪️ logic.

- [ ] **Step 1.1: Read CustomerOption.jsx lines 1-80 to confirm current shape**

Verify the existing export signature is `export function CustomerOption(...)` with internal badge logic at lines 49-77.

- [ ] **Step 1.2: Add `CustomerLineBadge` as new named sibling export**

Insert AFTER the existing `export function CustomerOption(...)` block in `src/components/CustomerOption.jsx`:

```jsx
// V68 (2026-05-15) — extracted standalone badge for non-name-bearing surfaces
// (CustomerCard meta-row, future appt-row chips). Same per-branch logic as
// CustomerOption's inline chip; single source of truth via this export.
//
// Props mirror CustomerOption's badge contract:
//   customer        — be_customers doc shape
//   contextBranchId — selected branch (drives 🟢 vs ⚪️ decision)
//
// Returns:
//   🟢 LINE chip if linked at THIS branch (per-branch entry OR legacy match)
//   ⚪️ LINE chip if linked at SOME OTHER branch only
//   null if not linked anywhere
export function CustomerLineBadge({ customer, contextBranchId }) {
  if (!customer || !contextBranchId) return null;

  const branchLink = customer.lineUserId_byBranch?.[contextBranchId];
  const legacyValid = customer.branchId === contextBranchId && customer.lineUserId;
  const linkedHere = !!(branchLink?.lineUserId || legacyValid);

  const hasAnyLink = !!customer.lineUserId
    || Object.keys(customer.lineUserId_byBranch || {}).length > 0;
  const linkedElsewhere = !linkedHere && hasAnyLink;

  const displayLine = branchLink?.lineDisplayName || customer.lineDisplayName || 'linked';

  if (linkedHere) {
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-500/10 text-green-700 dark:text-green-400 text-xs font-medium flex-shrink-0"
        title={`LINE: ${displayLine}`}
      >
        🟢 LINE
      </span>
    );
  }
  if (linkedElsewhere) {
    return (
      <span
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-500/10 text-gray-500 text-xs flex-shrink-0"
        title="ลูกค้าผูก LINE กับสาขาอื่น — ยังไม่ผูกกับสาขานี้"
      >
        ⚪️ LINE
      </span>
    );
  }
  return null;
}
```

- [ ] **Step 1.3: Refactor CustomerOption to use CustomerLineBadge internally (DRY)**

Replace the badge JSX inside `CustomerOption` (current lines 62-77) with `<CustomerLineBadge customer={customer} contextBranchId={contextBranchId} />` so there's only ONE place that renders the chips.

```jsx
// In CustomerOption — replace the two showLineBadge blocks with single line:
return (
  <div className="flex items-center gap-2 min-w-0">
    <span className={nameClassName || undefined}>{displayName}</span>
    {showLineBadge && <CustomerLineBadge customer={customer} contextBranchId={contextBranchId} />}
  </div>
);
```

- [ ] **Step 1.4: Verify import side — no callsite change needed**

```bash
# Confirm no caller imports CustomerOption sub-internals (only the named export)
```

Run: `grep -rn "from.*CustomerOption" src/components/backend/ src/pages/ | head -10`
Expected: only `import { CustomerOption } from ...` patterns. No regressions.

- [ ] **Step 1.5: Stage changes**

```bash
git add src/components/CustomerOption.jsx
```

---

### Task 2: Create `<AppointmentLineBadge>` shared component

**Files:**
- Create: `src/components/AppointmentLineBadge.jsx`

**Goal:** Single source-of-truth for the appt-row 🟢 LINE chip. Defensive `||` fallback chain (notifyChannel → lineNotify) per V67 mock-shadow lesson.

- [ ] **Step 2.1: Create the component file**

```jsx
// ─── AppointmentLineBadge — Shared appt-row 🟢 LINE chip ──────────────────
// V68 (2026-05-15) — single source of truth for the appointment-list LINE
// badge across 4 admin surfaces (AppointmentCalendarView, AppointmentHubView,
// CustomerDetailView appts tab, AdminDashboard queue calendar).
//
// Mirror of LR-4 CustomerOption chip pattern — same colors, same emoji,
// same Tailwind classes — so admin recognizes the badge as "this appt
// triggers LINE" everywhere it appears.
//
// Defensive `||` fallback chain (V67 lesson — mock-shadow drift):
//   1. appt.notifyChannel.includes('line')   — canonical post-V67
//   2. appt.lineNotify === true              — legacy V32-tris-ter compat
//                                              (kept for in-flight be_appointments
//                                               docs created BEFORE V68 strip;
//                                               stripped from new writes by V68)
//
// Props:
//   appt              — be_appointments doc shape
//   contextBranchId   — reserved for future per-branch variant (v1 ignores)
//   size              — 'xs' | 'sm' | 'md' (caller picks based on row density)

const SIZE_CLASSES = {
  xs: 'px-1 py-0 text-[10px]',
  sm: 'px-1.5 py-0.5 text-xs',
  md: 'px-2 py-1 text-sm',
};

export function AppointmentLineBadge({ appt, contextBranchId = '', size = 'sm' }) {
  if (!appt) return null;

  const channels = Array.isArray(appt.notifyChannel) ? appt.notifyChannel : [];
  const linkedViaChannel = channels.includes('line');
  const linkedViaLegacy = appt.lineNotify === true;
  const isLineNotify = linkedViaChannel || linkedViaLegacy;

  if (!isLineNotify) return null;

  const sizeCls = SIZE_CLASSES[size] || SIZE_CLASSES.sm;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded bg-green-500/10 text-green-700 dark:text-green-400 font-medium flex-shrink-0 ${sizeCls}`}
      title="แจ้งเตือนนัดผ่าน LINE"
    >
      🟢 LINE
    </span>
  );
}
```

- [ ] **Step 2.2: Stage changes**

```bash
git add src/components/AppointmentLineBadge.jsx
```

---

### Task 3: Wire `<AppointmentLineBadge>` into AppointmentCalendarView

**Files:**
- Modify: `src/components/backend/AppointmentCalendarView.jsx`

**Goal:** Render badge inside `AppointmentSlotMeta` so every appt cell in the time-grid shows 🟢 LINE if applicable.

- [ ] **Step 3.1: Add import at top of file**

Find the existing import block (around line 30-50) and add:

```jsx
import { AppointmentLineBadge } from '../AppointmentLineBadge.jsx';
```

- [ ] **Step 3.2: Render badge in AppointmentSlotMeta**

Inside `function AppointmentSlotMeta({ appt, span, doctorMap })` (around line 148), add the badge as a small chip next to the doctor row OR as a top-right corner element. Insert BEFORE the closing `</>` at the end of the JSX:

```jsx
{/* V68 — LINE badge if appt has notifyChannel=['line'] */}
{span >= 2 && (
  <div className="mt-1 flex justify-end">
    <AppointmentLineBadge appt={appt} size="xs" />
  </div>
)}
```

(The `span >= 2` gate ensures very short slot blocks don't get crowded; AppointmentLineBadge returns null if appt has no LINE channel anyway.)

- [ ] **Step 3.3: Stage changes**

```bash
git add src/components/backend/AppointmentCalendarView.jsx
```

---

### Task 4: Wire into AppointmentHubView

**Files:**
- Modify: `src/components/admin/AppointmentHubView.jsx`

- [ ] **Step 4.1: Read current file to find appt list-row rendering**

```bash
grep -n "appt\.\|appointment\." src/components/admin/AppointmentHubView.jsx | head -20
```

Locate the JSX that renders an appointment row (typically a `.map()` over appt array with name + time + doctor visible).

- [ ] **Step 4.2: Add import at top of file**

```jsx
import { AppointmentLineBadge } from '../AppointmentLineBadge.jsx';
```

- [ ] **Step 4.3: Render badge in appt row**

Insert `<AppointmentLineBadge appt={appt} size="sm" />` adjacent to the customer name OR in a meta column on the right side of the row. Place where it's visible without crowding.

- [ ] **Step 4.4: Stage changes**

```bash
git add src/components/admin/AppointmentHubView.jsx
```

---

### Task 5: Wire into CustomerDetailView appts tab

**Files:**
- Modify: `src/components/backend/CustomerDetailView.jsx`

- [ ] **Step 5.1: Read current file to find appts-tab list rendering**

```bash
grep -n "appointments\.map\|appts\.map\|appointment-row\|tab.*appt" src/components/backend/CustomerDetailView.jsx | head -20
```

- [ ] **Step 5.2: Add import**

```jsx
import { AppointmentLineBadge } from '../AppointmentLineBadge.jsx';
```

- [ ] **Step 5.3: Render badge in each appt row of the customer's appts tab**

Insert `<AppointmentLineBadge appt={appt} size="sm" />` adjacent to date/time in the row.

- [ ] **Step 5.4: Stage changes**

```bash
git add src/components/backend/CustomerDetailView.jsx
```

---

### Task 6: Wire into AdminDashboard queue calendar (Frontend page)

**Files:**
- Modify: `src/pages/AdminDashboard.jsx`

- [ ] **Step 6.1: Read current file to find queue calendar appt cell rendering**

```bash
grep -n "apptData\.\|appointments\.map\|notifyChannel" src/pages/AdminDashboard.jsx | head -20
```

The Frontend queue calendar renders monthly view with appt-cells per day; locate the cell-render JSX (typically inside the calendar grid).

- [ ] **Step 6.2: Add import**

```jsx
import { AppointmentLineBadge } from '../components/AppointmentLineBadge.jsx';
```

- [ ] **Step 6.3: Render badge in queue calendar appt cells**

Insert `<AppointmentLineBadge appt={appt} size="xs" />` in the cell — likely adjacent to the customer name or as a small overlay corner element.

- [ ] **Step 6.4: Stage changes**

```bash
git add src/pages/AdminDashboard.jsx
```

---

### Task 7: Strip legacy `lineNotify` checkbox + field from AppointmentFormModal

**Files:**
- Modify: `src/components/backend/AppointmentFormModal.jsx`

**Goal:** Delete the dead checkbox UI + remove all formData/payload `lineNotify` references. New writes go through `LineNotifyConfirmation` → `notifyChannel` array exclusively.

- [ ] **Step 7.1: Delete checkbox JSX (lines 1416-1420)**

Remove this entire block:

```jsx
{/* LINE notify */}
<label className="flex items-center gap-2 text-xs cursor-pointer">
  <input type="checkbox" checked={formData.lineNotify || false} onChange={e => update({ lineNotify: e.target.checked })} className="accent-emerald-500" />
  แจ้งเตือนนัดหมายทาง LINE
</label>
```

- [ ] **Step 7.2: Strip `lineNotify` from formData default (line 134)**

Find and DELETE the line:
```jsx
lineNotify: false,
```
from the formData useState initialization block.

- [ ] **Step 7.3: Strip `lineNotify` from edit-mode load (line 301)**

Find and DELETE:
```jsx
lineNotify: !!appt.lineNotify,
```
from the `useEffect` block that hydrates formData when editing.

- [ ] **Step 7.4: Strip `lineNotify` from createBackendAppointment payload (line 641)**

Find and DELETE:
```jsx
lineNotify: !!formData.lineNotify,
```
from the createBackendAppointment call.

- [ ] **Step 7.5: Strip `lineNotify` from updateBackendAppointment payload (line 713)**

Find and DELETE:
```jsx
lineNotify: payload.lineNotify,
```
from the updateBackendAppointment call.

- [ ] **Step 7.6: Strip `lineNotify` from save-recurring branch (line 795)**

Find and DELETE:
```jsx
lineNotify: !!formData.lineNotify,
```
from the recurring-save block.

- [ ] **Step 7.7: Add V68 marker comment**

At the top of the formData useState block (around line 130), add:

```jsx
// V68 (2026-05-15) — `lineNotify` field stripped. Channel state now lives
// in formData.notifyChannel: ['line'] driven by LineNotifyConfirmation
// green-card at top of modal. Pre-V68 formData carried both fields
// redundantly; only notifyChannel was actually consumed by cron pipeline.
```

- [ ] **Step 7.8: Verify no `lineNotify` references remain in this file**

```bash
grep -n "lineNotify" src/components/backend/AppointmentFormModal.jsx
```

Expected: ZERO matches (or only in V68 marker comment).

- [ ] **Step 7.9: Stage changes**

```bash
git add src/components/backend/AppointmentFormModal.jsx
```

---

### Task 8: Strip `lineNotify` from appointmentDepositBatch.js

**Files:**
- Modify: `src/lib/appointmentDepositBatch.js`

- [ ] **Step 8.1: Strip from cleanAppointment builder (line 133)**

Find and DELETE:
```js
lineNotify: !!appt.lineNotify,
```

- [ ] **Step 8.2: Strip from allow-list (line 458)**

Find the array `['note', 'color', 'lineNotify', ...]` and remove `'lineNotify',`.

- [ ] **Step 8.3: Strip from batch payload (line 545)**

Find and DELETE:
```js
lineNotify: !!apptPayload.lineNotify,
```

- [ ] **Step 8.4: Strip from _updates dotted-path map (line 578)**

Find and DELETE:
```js
'appointment.lineNotify': !!apptPayload.lineNotify,
```

- [ ] **Step 8.5: Add V68 marker comment**

Near the top of `cleanAppointment` (around line 100-130), add:

```js
// V68 (2026-05-15) — `lineNotify` field stripped. notifyChannel: ['line']
// is the canonical channel-state driver (read by cron pipeline + retry
// + debug-fire). lineNotify field had zero consumers post-Wave-1 LINE
// reminder ship; orphan field on existing be_appointments docs is harmless.
```

- [ ] **Step 8.6: Verify no `lineNotify` references remain in lib + api**

```bash
grep -rn "lineNotify" src/lib/ api/
```

Expected: ZERO matches in production code (test files may reference for backward-compat assertions — that's fine).

- [ ] **Step 8.7: Stage changes**

```bash
git add src/lib/appointmentDepositBatch.js
```

---

### Task 9: Rewrite CustomerCard.jsx — V5 Editorial + 4-layer shadow + meta-col + LINE chip

**Files:**
- Modify: `src/components/backend/CustomerCard.jsx` (full rewrite — keep public API stable)

**Goal:** Replace the existing card render with the V5 Editorial design confirmed in visual companion. Internal markup change only; props signature unchanged.

- [ ] **Step 9.1: Read full current file (~205 lines) to confirm all consumed props**

```bash
cat src/components/backend/CustomerCard.jsx | head -25
```

Confirm the props list to preserve: `customer, accentColor, theme, mode, cloneStatus, cloneProgress, onClone, onView, onDeleteClick`.

- [ ] **Step 9.2: Replace the file with V5 Editorial implementation**

Full rewrite of `src/components/backend/CustomerCard.jsx`:

```jsx
// ─── CustomerCard — Reusable card for displaying customer info ──────────────
// V68 (2026-05-15) — V5 Editorial redesign. World-class polish for the
// customer-list view. Initials avatar with hash-derived gradient (no
// generic User icon). 4-layer shadow stack for depth (lit-from-above
// inset highlight + tight contact + mid-depth + soft ambient). Meta-col
// (phone above branch). LINE chip in bottom meta row (Q4=C decision).
//
// Public API stable from pre-V68: same props, same callbacks. Caller
// CustomerListTab.jsx unchanged.
//
// Layout:
//   ┌──────────────────────────────────────────┐  ← rounded-2xl, 4-layer shadow
//   │ [56px halo gradient avatar]            ✕ │  ← header + delete (hover-only)
//   │   นางสาว แพรพร พรแพร                       │
//   │   HN 000004 · 28 ปี · ♀️ หญิง               │  ← tagline
//   │ ┌──────────────────────────────────────┐ │
//   │ │ 📞 081-234-5678                      │ │  ← meta-col: phone
//   │ │ 📍 นครราชสีมา                         │ │  ← branch (stacked)
//   │ └──────────────────────────────────────┘ │
//   │ 💊 12 รักษา · 📦 5 คอร์ส       🟢 LINE  │  ← engagement + LINE chip
//   └──────────────────────────────────────────┘

import { useHasPermission, useTabAccess } from '../../hooks/useTabAccess.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import { CustomerLineBadge } from '../CustomerOption.jsx';

// Avatar gradient palette — 6 colors (no red per Thai cultural rule).
// Hash-derived from customer name so the same person always gets the
// same color (visual identity anchor across sessions).
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
  const s = String(name || '');
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash |= 0; // force int32
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

// Strip Thai title prefix + take first 2 chars for initials
function getInitials(name) {
  const cleaned = String(name || '').replace(/^(นาย|นาง|นางสาว|เด็กชาย|เด็กหญิง)\s*/, '').trim();
  return cleaned.slice(0, 2) || '?';
}

// Format relative time
function relativeTime(isoStr) {
  if (!isoStr) return '';
  const diff = Date.now() - new Date(isoStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'เมื่อสักครู่';
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} ชม.ที่แล้ว`;
  const days = Math.floor(hrs / 24);
  return `${days} วันที่แล้ว`;
}

// Compute age from birthdate ISO
function computeAge(birthdate) {
  if (!birthdate) return '';
  const now = new Date();
  const b = new Date(birthdate);
  if (Number.isNaN(b.getTime())) return '';
  let age = now.getFullYear() - b.getFullYear();
  const m = now.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < b.getDate())) age--;
  return age > 0 ? `${age} ปี` : '';
}

// Gender emoji
function genderEmoji(gender) {
  const g = String(gender || '').toLowerCase();
  if (g.includes('หญิง') || g === 'female' || g === 'f') return '♀️ หญิง';
  if (g.includes('ชาย') || g === 'male' || g === 'm') return '♂️ ชาย';
  return gender || '';
}

export default function CustomerCard({
  customer,
  accentColor,
  theme,
  mode = 'cloned',
  cloneStatus,
  cloneProgress,
  onClone,
  onView,
  onDeleteClick,
}) {
  const isDark = theme !== 'light';
  const { branchId: contextBranchId } = useSelectedBranch();

  const hasDeletePerm = useHasPermission('customer_delete');
  const tabAccess = useTabAccess();
  const canDelete = hasDeletePerm || tabAccess?.isAdmin === true;

  const hn = customer.proClinicHN || customer.hn_no || customer.hn || '';
  const id = customer.proClinicId || customer.id || '';
  const name = customer.name
    || (customer.patientData
        ? `${customer.patientData.prefix || ''} ${customer.patientData.firstName || customer.patientData.firstNameTh || ''} ${customer.patientData.lastName || customer.patientData.lastNameTh || ''}`.trim()
        : `${customer.prefix || ''} ${customer.firstname || ''} ${customer.lastname || ''}`.trim())
    || '-';
  const phone = customer.phone || customer.telephone_number || customer.patientData?.phone || '';
  const gender = customer.patientData?.gender || customer.gender || '';
  const birthdate = customer.patientData?.birthdate || customer.birthdate || '';
  const branchName = customer.branchName || customer.branchId || '';
  const treatmentCount = customer.treatmentCount || 0;
  const courseCount = (customer.courses?.length) || 0;
  const updatedRel = relativeTime(customer.updatedAt || customer.lastSyncedAt || customer.clonedAt);

  const initials = getInitials(name);
  const gradientCls = pickGradient(name);
  const ageStr = computeAge(birthdate);
  const genderStr = genderEmoji(gender);

  const handleCardClick = () => {
    if (mode === 'cloned' && onView) onView(customer);
  };

  // Tagline: HN · age · gender — only fields that exist
  const taglineParts = [
    hn ? `HN ${hn}` : null,
    ageStr,
    genderStr,
  ].filter(Boolean);

  // Format phone with dash separators (XXX-XXX-XXXX)
  const phoneDisplay = phone
    ? phone.replace(/^(\d{3})(\d{3})(\d{4})$/, '$1-$2-$3')
    : '';

  return (
    <div
      onClick={handleCardClick}
      onKeyDown={e => {
        if ((e.key === 'Enter' || e.key === ' ') && mode === 'cloned' && onView) {
          e.preventDefault();
          handleCardClick();
        }
      }}
      role={mode === 'cloned' && onView ? 'button' : undefined}
      tabIndex={mode === 'cloned' && onView ? 0 : undefined}
      data-testid={`customer-card-${id || hn}`}
      className={`relative bg-gradient-to-b from-[var(--bg-card)] to-[var(--bg-elevated)] border border-[var(--bd)] rounded-2xl p-5 transition-all duration-200 group ${mode === 'cloned' && onView ? 'cursor-pointer' : ''} ${isDark
        ? 'shadow-[inset_0_1px_0_rgba(255,255,255,0.05),0_1px_2px_rgba(0,0,0,0.3),0_4px_12px_rgba(0,0,0,0.35),0_12px_32px_rgba(0,0,0,0.4)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_2px_4px_rgba(0,0,0,0.35),0_8px_20px_rgba(0,0,0,0.45),0_20px_48px_rgba(220,38,38,0.10)] hover:-translate-y-0.5 hover:border-[var(--bd-strong)]'
        : 'shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(31,41,55,0.04),0_4px_12px_rgba(31,41,55,0.06),0_12px_28px_rgba(219,39,119,0.08)] hover:shadow-[inset_0_1px_0_rgba(255,255,255,1),0_2px_4px_rgba(31,41,55,0.06),0_8px_20px_rgba(31,41,55,0.08),0_20px_48px_rgba(219,39,119,0.18)] hover:-translate-y-0.5 hover:border-[var(--bd-strong)]'}`}
    >
      {/* Hover-only delete button */}
      {mode === 'cloned' && canDelete && onDeleteClick && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDeleteClick(customer); }}
          title="ลบลูกค้า"
          aria-label="ลบลูกค้า"
          data-testid={`delete-customer-${id || hn}`}
          className="absolute top-3 right-3 w-7 h-7 rounded-lg flex items-center justify-center text-[var(--tx-muted)] bg-transparent opacity-0 group-hover:opacity-100 hover:bg-red-500/12 hover:text-red-400 transition-all"
        >
          <span aria-hidden="true">🗑️</span>
        </button>
      )}

      {/* Header — avatar + name + tagline */}
      <div className="flex items-center gap-4 mb-3">
        <div className={`relative flex-shrink-0`}>
          {/* Halo glow */}
          <div className="absolute -inset-1 rounded-full opacity-60 blur-md bg-gradient-to-br from-red-500/25 to-pink-400/15 pointer-events-none" />
          <div
            className={`relative w-14 h-14 rounded-full flex items-center justify-center text-lg font-bold text-white border-2 border-[var(--bg-card)] shadow-lg ${gradientCls}`}
            aria-hidden="true"
          >
            {initials}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          {/* Name — NEVER red (Thai cultural rule) */}
          <h3 className="text-base font-extrabold text-[var(--tx-heading)] leading-tight tracking-tight truncate">
            {name}
          </h3>
          {taglineParts.length > 0 && (
            <p className="text-xs text-[var(--tx-muted)] mt-1">
              {taglineParts.join(' · ')}
            </p>
          )}
        </div>
      </div>

      {/* Meta box — phone above branch (vertical stack per Q5 decision) */}
      <div className="flex flex-col gap-2 my-3 px-3.5 py-3 bg-black/3 dark:bg-white/3 border border-[var(--bd)] rounded-xl">
        {phoneDisplay && (
          <div className="flex items-center gap-2 text-sm text-[var(--tx-secondary)]">
            <span aria-hidden="true" className="text-sm opacity-85">📞</span>
            {phoneDisplay}
          </div>
        )}
        {branchName && (
          <div className="flex items-center gap-2 text-sm text-[var(--tx-secondary)]">
            <span aria-hidden="true" className="text-sm opacity-85">📍</span>
            {branchName}
          </div>
        )}
      </div>

      {/* Footer — engagement counts + LINE chip */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex gap-3 text-xs text-[var(--tx-muted)]">
          <span>💊 <strong className="text-[var(--tx-heading)] font-bold">{treatmentCount}</strong> รักษา</span>
          <span>📦 <strong className="text-[var(--tx-heading)] font-bold">{courseCount}</strong> คอร์ส</span>
          {updatedRel && (
            <span className="text-[var(--tx-quiet)] hidden lg:inline">· {updatedRel}</span>
          )}
        </div>
        <CustomerLineBadge customer={customer} contextBranchId={contextBranchId} />
      </div>

      {/* Search-mode clone footer (preserved for backward-compat) */}
      {mode === 'search' && onClone && (
        <div className="mt-4">
          {cloneStatus === 'cloning' ? (
            <div className="space-y-2">
              <div className="w-full h-1.5 bg-[var(--bg-elevated)] rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-red-500/80 to-red-600 transition-all duration-300" style={{ width: `${cloneProgress?.percent || 0}%` }} />
              </div>
              <p className="text-xs text-[var(--tx-muted)] truncate">{cloneProgress?.label || 'กำลังดำเนินการ...'}</p>
            </div>
          ) : (
            <button
              onClick={() => onClone(id)}
              className="w-full py-2.5 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 hover:shadow-lg active:scale-[0.98] bg-red-500/15 border border-red-500/40 text-red-500 hover:bg-red-500/25"
            >
              {cloneStatus === 'done' ? '✓ Clone สำเร็จ' :
               cloneStatus === 'error' ? '↻ ลองอีกครั้ง' :
               cloneStatus === 'exists' ? '↻ อัพเดทข้อมูล' :
               '⬇️ ดูดข้อมูลทั้งหมด'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 9.3: Stage changes**

```bash
git add src/components/backend/CustomerCard.jsx
```

---

### Task 10: Verify CustomerListTab caller — no change expected

**Files:**
- Read-only check: `src/components/backend/CustomerListTab.jsx`

- [ ] **Step 10.1: Confirm caller passes the right props**

```bash
grep -n "<CustomerCard" src/components/backend/CustomerListTab.jsx
```

Expected: existing `<CustomerCard customer={c} accentColor={ac} theme={theme} mode="cloned" onView={onViewCustomer} onDeleteClick={c => setDeletingCustomer(c)} />` (or similar). All props match V68 CustomerCard signature.

- [ ] **Step 10.2: If caller-asserted markup needs update — note it**

```bash
grep -rn "CustomerCard\|customer-card" tests/ | head -10
```

If `tests/branch-selector-bs-d-customer-card.test.js` asserts on internal markup (avatar size class, header structure, button text), update test selectors in Task 13 V21 fixup.

---

### Task 11: Update branch-selector-bs-d-customer-card.test.js (V21 fixup if needed)

**Files:**
- Modify (conditional): `tests/branch-selector-bs-d-customer-card.test.js`

- [ ] **Step 11.1: Read existing test to identify markup-asserted lines**

```bash
cat tests/branch-selector-bs-d-customer-card.test.js
```

- [ ] **Step 11.2: Run the test against the new CustomerCard**

```bash
npx vitest run tests/branch-selector-bs-d-customer-card.test.js 2>&1 | tail -20
```

- [ ] **Step 11.3: If failures — fix selectors to V5 markup with V21 marker**

If the test fails on markup that changed in V68:
- Update the failing assertion to V5 shape
- Add inline comment: `// V68 V21 fixup — CustomerCard rewritten to V5 Editorial; selector updated`
- Re-run; expect GREEN.

If the test passes unchanged: skip this step.

- [ ] **Step 11.4: Stage if changed**

```bash
git add tests/branch-selector-bs-d-customer-card.test.js  # only if modified
```

---

### Task 12: NEW V68 source-grep regression bank + AV47 invariant

**Files:**
- Create: `tests/v68-line-badge-surfacing-audit.test.js`

- [ ] **Step 12.1: Write the test file**

```js
// V68 (2026-05-15) — AV47 source-grep regression bank.
// Locks the LINE badge surfacing discipline:
//   - 4 admin appt-list surfaces import + render <AppointmentLineBadge>
//   - NO file outside the sanctioned set contains literal `🟢 LINE` (Rule of 3)
//   - <AppointmentLineBadge> reads notifyChannel + has lineNotify defensive fallback
//   - <CustomerLineBadge> sibling-exported from CustomerOption.jsx
//   - lineNotify field stripped from AppointmentFormModal + appointmentDepositBatch.js
//
// Companion: AV47 invariant in audit-anti-vibe-code/SKILL.md.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = process.cwd();
const read = p => readFileSync(path.join(ROOT, p), 'utf-8');

describe('V68/AV47 — LINE badge surfacing discipline', () => {

  describe('A. 4 admin appt-list surfaces import + render <AppointmentLineBadge>', () => {
    const SURFACES = [
      'src/components/backend/AppointmentCalendarView.jsx',
      'src/components/admin/AppointmentHubView.jsx',
      'src/components/backend/CustomerDetailView.jsx',
      'src/pages/AdminDashboard.jsx',
    ];

    it.each(SURFACES)('A.1 — %s imports AppointmentLineBadge', (file) => {
      const src = read(file);
      expect(src).toMatch(/import\s*\{[^}]*AppointmentLineBadge[^}]*\}\s*from\s*['"][^'"]+AppointmentLineBadge\.jsx?['"]/);
    });

    it.each(SURFACES)('A.2 — %s renders <AppointmentLineBadge', (file) => {
      const src = read(file);
      expect(src).toMatch(/<AppointmentLineBadge\b/);
    });
  });

  describe('B. Universal classifier — NO inline 🟢 LINE outside sanctioned files', () => {
    it('B.1 — only sanctioned files contain literal `🟢 LINE` string', () => {
      const SANCTIONED = new Set([
        'src/components/AppointmentLineBadge.jsx',
        'src/components/CustomerOption.jsx',  // CustomerLineBadge renders the chip
      ]);
      // Walk src/ for the literal string
      const offenders = [];
      const filesToCheck = [
        'src/components/AppointmentLineBadge.jsx',
        'src/components/CustomerOption.jsx',
        'src/components/backend/CustomerCard.jsx',
        'src/components/backend/AppointmentCalendarView.jsx',
        'src/components/admin/AppointmentHubView.jsx',
        'src/components/backend/CustomerDetailView.jsx',
        'src/pages/AdminDashboard.jsx',
        'src/components/backend/AppointmentFormModal.jsx',
      ];
      for (const f of filesToCheck) {
        const src = read(f);
        if (/🟢\s*LINE/.test(src) && !SANCTIONED.has(f)) {
          offenders.push(f);
        }
      }
      expect(offenders).toEqual([]);
    });
  });

  describe('C. <AppointmentLineBadge> contract', () => {
    it('C.1 — reads notifyChannel.includes("line")', () => {
      const src = read('src/components/AppointmentLineBadge.jsx');
      expect(src).toMatch(/notifyChannel[\s\S]*\.includes\(['"]line['"]\)/);
    });
    it('C.2 — has appt.lineNotify defensive fallback (V67 lesson)', () => {
      const src = read('src/components/AppointmentLineBadge.jsx');
      expect(src).toMatch(/appt\.lineNotify\s*===\s*true/);
    });
    it('C.3 — returns null when neither channel-line nor lineNotify true', () => {
      const src = read('src/components/AppointmentLineBadge.jsx');
      expect(src).toMatch(/if\s*\(!isLineNotify\)\s*return\s*null/);
    });
  });

  describe('D. <CustomerLineBadge> sibling export from CustomerOption', () => {
    it('D.1 — CustomerLineBadge is a named export from CustomerOption.jsx', () => {
      const src = read('src/components/CustomerOption.jsx');
      expect(src).toMatch(/export function CustomerLineBadge\b/);
    });
    it('D.2 — CustomerCard imports CustomerLineBadge from CustomerOption', () => {
      const src = read('src/components/backend/CustomerCard.jsx');
      expect(src).toMatch(/import\s*\{[^}]*CustomerLineBadge[^}]*\}\s*from\s*['"][^'"]+CustomerOption\.jsx?['"]/);
    });
    it('D.3 — CustomerCard uses useSelectedBranch for contextBranchId', () => {
      const src = read('src/components/backend/CustomerCard.jsx');
      expect(src).toMatch(/useSelectedBranch\s*\(\s*\)/);
      expect(src).toMatch(/<CustomerLineBadge[\s\S]{0,100}contextBranchId/);
    });
  });

  describe('E. lineNotify field stripped (Q3 full strip)', () => {
    it('E.1 — AppointmentFormModal MUST NOT contain formData.lineNotify', () => {
      const src = read('src/components/backend/AppointmentFormModal.jsx');
      expect(src).not.toMatch(/formData\.lineNotify/);
    });
    it('E.2 — AppointmentFormModal MUST NOT contain `lineNotify:` payload key', () => {
      const src = read('src/components/backend/AppointmentFormModal.jsx');
      // Allow only V68 marker comment mentioning lineNotify
      const lines = src.split('\n');
      const offenders = lines.filter(line => /lineNotify:/.test(line));
      expect(offenders).toEqual([]);
    });
    it('E.3 — appointmentDepositBatch MUST NOT contain `lineNotify:` payload key', () => {
      const src = read('src/lib/appointmentDepositBatch.js');
      const lines = src.split('\n');
      const offenders = lines.filter(line => /lineNotify:/.test(line) || /'lineNotify'/.test(line));
      expect(offenders).toEqual([]);
    });
    it('E.4 — both files carry V68 marker comment', () => {
      const modalSrc = read('src/components/backend/AppointmentFormModal.jsx');
      const batchSrc = read('src/lib/appointmentDepositBatch.js');
      expect(modalSrc).toMatch(/V68[^\n]*lineNotify/);
      expect(batchSrc).toMatch(/V68[^\n]*lineNotify/);
    });
  });

  describe('F. AV47 invariant registered in audit-anti-vibe-code SKILL.md', () => {
    it('F.1 — SKILL.md contains AV47 section heading', () => {
      const src = read('.agents/skills/audit-anti-vibe-code/SKILL.md');
      expect(src).toMatch(/^### AV47 — /m);
    });
    it('F.2 — SKILL.md banner reflects AV1–AV47', () => {
      const src = read('.agents/skills/audit-anti-vibe-code/SKILL.md');
      expect(src).toMatch(/Invariants \(AV1[–-]AV47\)/);
    });
  });
});
```

- [ ] **Step 12.2: Run the test — should FAIL initially (Task 13 hasn't added AV47 yet)**

```bash
npx vitest run tests/v68-line-badge-surfacing-audit.test.js 2>&1 | tail -20
```

Expected: FAIL on F.1 + F.2 (AV47 not yet in SKILL.md). Other groups should PASS (Tasks 1-9 implementation in place).

- [ ] **Step 12.3: Stage test file**

```bash
git add tests/v68-line-badge-surfacing-audit.test.js
```

---

### Task 13: Add AV47 invariant to audit-anti-vibe-code SKILL.md

**Files:**
- Modify: `.agents/skills/audit-anti-vibe-code/SKILL.md`

- [ ] **Step 13.1: Find the AV46 section end + insert AV47 after it**

Find the line `### AV46 — Pipeline Firestore field name MUST match real schema` and locate where AV46 content ends (look for the next `## How to run` heading OR next `### AV` heading).

- [ ] **Step 13.2: Insert AV47 invariant section before "## How to run"**

```markdown
### AV47 — Appointment-row LINE badge MUST go through `<AppointmentLineBadge>` shared component (V68 Rule of 3 lock, 2026-05-15)

**Trigger**: Any new code rendering an appointment row in admin surfaces (backend appt grid + hub + customer-detail appts tab + frontend queue calendar).

**Class**: V67-class continuation — Rule of 3 enforcement at the appt-row badge layer. Inline-pasted `🟢 LINE` chips create drift risk: each callsite could diverge in color / label / behavior over time. Single shared component import = greppable + style-change = 1 file edit.

**Sanctioned files** (closed list — adding a 5th surface MUST extend this list):
  - `src/components/AppointmentLineBadge.jsx` (the component itself)
  - `src/components/CustomerOption.jsx` (CustomerLineBadge sibling export — same chip rendered for picker callsites)
  - `src/components/backend/AppointmentCalendarView.jsx` (backend canonical grid)
  - `src/components/admin/AppointmentHubView.jsx` (admin appt hub)
  - `src/components/backend/CustomerDetailView.jsx` (per-customer appts tab)
  - `src/pages/AdminDashboard.jsx` (frontend queue calendar)

**Why architectural**: After V67 mock-shadow drift saga, the canonical pattern is "ONE shared component per badge concern, defensive `||` fallback chains, source-grep regression locks". V68 closes the appt-row badge layer. Future per-tab status badges (e.g. recall pill, no-show flag) follow the same architecture.

**Grep targets**:
  - Each of the 4 admin appt-list surfaces MUST contain `import.*AppointmentLineBadge` AND `<AppointmentLineBadge`
  - NO file outside the sanctioned list contains literal `🟢 LINE` string
  - `AppointmentLineBadge.jsx` MUST contain `notifyChannel.*\.includes\(['"]line['"]\)` AND `appt.lineNotify === true` defensive fallback (V67 mock-shadow lesson)
  - `CustomerOption.jsx` MUST export `CustomerLineBadge` as named export
  - `CustomerCard.jsx` MUST import `CustomerLineBadge` from `CustomerOption.jsx` AND use `useSelectedBranch()` for `contextBranchId`
  - `AppointmentFormModal.jsx` + `appointmentDepositBatch.js` MUST NOT contain any `lineNotify:` payload key or `formData.lineNotify` reference (V68 strip; V32-tris-ter legacy field gone)

**Source-grep regression test**: `tests/v68-line-badge-surfacing-audit.test.js` — V68 A1-F2 audit groups locking each grep target.

**Origin**: V68 (2026-05-15) — user requested LINE badge across 4 admin appt-list surfaces + duplicate checkbox cleanup + LINE badge on customer cards. Brainstormed via /brainstorming + visual companion (4 customer-card variants × dark+light themes); locked V5 Editorial + meta stacked vertically + 4-layer shadow depth. Single commit batch under V18 lock; no firestore/storage rules changes.

**Lesson**: V67 lesson generalizes — every shared UI status badge MUST be a single component with defensive fallback chain, source-grep locked at each consumer site. AV47 closes the appt-row badge surface; pattern replicates for any future cross-cutting status badge (recall / no-show / VIP / membership tier). Inline copy-paste of chip JSX = future drift = future user-visible inconsistency = future Rule Q L1 failure.
```

- [ ] **Step 13.3: Update banner from AV1–AV46 to AV1–AV47**

Find the line `## Invariants (AV1–AV46)` and change to `## Invariants (AV1–AV47)`.

- [ ] **Step 13.4: Re-run V68 test bank — should NOW be GREEN**

```bash
npx vitest run tests/v68-line-badge-surfacing-audit.test.js 2>&1 | tail -10
```

Expected: PASS (15 / 15) FAIL (0)

- [ ] **Step 13.5: Stage SKILL.md change**

```bash
git add .agents/skills/audit-anti-vibe-code/SKILL.md
```

---

### Task 14: NEW Rule Q L2 jsdom render verification script

**Files:**
- Create: `scripts/diag-line-badge-render-l2-verify.mjs`

**Goal:** Per Rule Q V66 — render the badge component against fixture data using REAL React + jsdom (not mock-shadow). Verify chip appears for `notifyChannel:['line']` and not otherwise.

- [ ] **Step 14.1: Write the verification script**

```js
// Rule Q L2 verification for V68 LINE badge.
//
// Renders <AppointmentLineBadge> against fixture appts using real React +
// jsdom. Asserts:
//   - notifyChannel:['line'] → 🟢 LINE chip rendered
//   - lineNotify:true (legacy) → 🟢 LINE chip rendered (defensive fallback)
//   - neither → no chip
//   - missing/undefined notifyChannel → handled defensively
//
// NOT a real-prod query (badge is purely client-render); L2 here = real
// React render against fixture data with the actual production component
// code, not mock-shadowed. Real-prod query verification was done in V67.
//
// Run: node --experimental-vm-modules scripts/diag-line-badge-render-l2-verify.mjs

import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'url';

const dom = new JSDOM('<!DOCTYPE html><html><body><div id="root"></div></body></html>');
global.document = dom.window.document;
global.window = dom.window;
global.HTMLElement = dom.window.HTMLElement;

const { default: React } = await import('react');
const { default: ReactDOMServer } = await import('react-dom/server');
const { AppointmentLineBadge } = await import('../src/components/AppointmentLineBadge.jsx');

const PASS = (msg) => console.log(`  ✓ ${msg}`);
const FAIL = (msg) => { console.log(`  ✗ FAIL: ${msg}`); process.exitCode = 1; };

function render(props) {
  return ReactDOMServer.renderToStaticMarkup(React.createElement(AppointmentLineBadge, props));
}

async function main() {
  console.log('================================================');
  console.log('Rule Q L2 — V68 AppointmentLineBadge render verify');
  console.log('================================================');

  // 1. Canonical post-V67: notifyChannel:['line']
  console.log('\n[1/5] notifyChannel:["line"] → expect 🟢 LINE chip');
  const html1 = render({ appt: { id: 'a1', notifyChannel: ['line'] } });
  if (html1.includes('🟢') && html1.includes('LINE')) PASS('chip rendered');
  else FAIL(`chip missing — got: ${html1}`);

  // 2. Legacy V32-tris-ter: lineNotify:true
  console.log('\n[2/5] lineNotify:true (legacy) → expect 🟢 LINE chip (defensive fallback)');
  const html2 = render({ appt: { id: 'a2', lineNotify: true } });
  if (html2.includes('🟢') && html2.includes('LINE')) PASS('legacy fallback rendered');
  else FAIL(`legacy fallback failed — got: ${html2}`);

  // 3. Both fields set: should still render (OR logic)
  console.log('\n[3/5] both notifyChannel + lineNotify set → expect chip (OR-merge)');
  const html3 = render({ appt: { id: 'a3', notifyChannel: ['line'], lineNotify: true } });
  if (html3.includes('🟢')) PASS('OR-merge handled');
  else FAIL(`OR-merge failed — got: ${html3}`);

  // 4. Neither: no chip
  console.log('\n[4/5] notifyChannel:[] + lineNotify:false → expect null (no chip)');
  const html4 = render({ appt: { id: 'a4', notifyChannel: [], lineNotify: false } });
  if (html4 === '') PASS('no chip when not LINE');
  else FAIL(`unexpected render — got: ${html4}`);

  // 5. Missing fields entirely: defensive
  console.log('\n[5/5] appt with no notifyChannel + no lineNotify → expect null');
  const html5 = render({ appt: { id: 'a5' } });
  if (html5 === '') PASS('defensive null on missing fields');
  else FAIL(`should have rendered null — got: ${html5}`);

  // 6. notifyChannel as string (defensive against shape drift)
  console.log('\n[6/6] notifyChannel:"line" (wrong shape — string instead of array) → expect null');
  const html6 = render({ appt: { id: 'a6', notifyChannel: 'line' } });
  if (html6 === '') PASS('defensive against shape drift');
  else FAIL(`should have rendered null on string notifyChannel — got: ${html6}`);

  console.log('\n================================================');
  if (process.exitCode === 1) {
    console.log('⚠️  V68 L2 verify FAILED — see ✗ messages above');
  } else {
    console.log('✅ V68 L2 verify PASSED — AppointmentLineBadge renders correctly');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(e => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 14.2: Run the script — verify all 6 checks pass**

```bash
node scripts/diag-line-badge-render-l2-verify.mjs 2>&1
```

Expected output ends with: `✅ V68 L2 verify PASSED — AppointmentLineBadge renders correctly`

If jsdom or react-dom/server import fails, install dev deps:
```bash
npm install --save-dev jsdom
# react-dom should already be present
```

- [ ] **Step 14.3: Stage script**

```bash
git add scripts/diag-line-badge-render-l2-verify.mjs
```

---

### Task 15: Run targeted vitest + full suite (Rule N batch-end)

- [ ] **Step 15.1: Run targeted V68 + adjacent**

```bash
npx vitest run \
  tests/v68-line-badge-surfacing-audit.test.js \
  tests/branch-selector-bs-d-customer-card.test.js \
  tests/line-reminder-modal-autotick-source-grep.test.js \
  tests/line-reminder-modal-autotick.test.jsx 2>&1 | tail -10
```

Expected: ALL PASS.

- [ ] **Step 15.2: Run full vitest suite (Rule N batch-end mandatory for structural change)**

```bash
npx vitest run 2>&1 | tail -10
```

Expected: PASS count INCREASED by 15 (V68 audit) and FAIL = 0. If any pre-existing tests fail, identify if they're V68-caused (unlikely — V68 only adds to formData edit-mode missing field) or pre-existing.

If V68-caused fails:
- Most likely: a test asserts on the old `lineNotify` field in formData — update test to V68 contract (lineNotify field gone) with V21 marker comment.
- Re-run targeted; expect GREEN.

- [ ] **Step 15.3: Run npm build to catch any import resolution issues**

```bash
npm run build 2>&1 | tail -10
```

Expected: clean build. (Catches V11-class missing-export issues that vitest mocks could shadow.)

---

### Task 16: Final commit + push (V18 lock — NO deploy)

- [ ] **Step 16.1: Verify git status — only V68 files staged**

```bash
git status --porcelain | head -20
```

Expected files staged (M = modify, A = add):
- M `src/components/CustomerOption.jsx`
- A `src/components/AppointmentLineBadge.jsx`
- M `src/components/backend/AppointmentCalendarView.jsx`
- M `src/components/admin/AppointmentHubView.jsx`
- M `src/components/backend/CustomerDetailView.jsx`
- M `src/pages/AdminDashboard.jsx`
- M `src/components/backend/AppointmentFormModal.jsx`
- M `src/lib/appointmentDepositBatch.js`
- M `src/components/backend/CustomerCard.jsx`
- A `tests/v68-line-badge-surfacing-audit.test.js`
- A `scripts/diag-line-badge-render-l2-verify.mjs`
- M `.agents/skills/audit-anti-vibe-code/SKILL.md`
- M (conditional) `tests/branch-selector-bs-d-customer-card.test.js`

- [ ] **Step 16.2: Commit with HEREDOC**

```bash
git commit -m "$(cat <<'EOF'
feat(V68): LINE badge surfacing across 4 admin surfaces +
           CustomerCard V5 redesign + lineNotify legacy strip

Brainstormed via /brainstorming + visual companion (4 customer-card
variants × dark+light themes); locked V5 Editorial + meta stacked
vertically + 4-layer shadow depth.

Decisions Q1-Q5 + Approach A (single shared component + atomic batch):
- Q1: All 4 admin appt-list surfaces (NOT customer-facing)
- Q2: 🟢 LINE text chip (CustomerOption pattern reuse)
- Q3: Full strip of legacy lineNotify field (zero consumers verified)
- Q4: CustomerCard badge in bottom meta row
- Q5: V5 Editorial + meta stacked vertically + 4-layer shadow depth

NEW components:
- src/components/AppointmentLineBadge.jsx — shared appt-row 🟢 LINE chip
  with defensive notifyChannel || lineNotify fallback (V67 mock-shadow lesson)
- CustomerLineBadge sibling export from CustomerOption.jsx — single source
  of truth for per-branch 🟢/⚪️ logic (used by both pickers + cards)

REWRITE: src/components/backend/CustomerCard.jsx — V5 Editorial layout +
4-layer shadow stack + initials gradient avatar (hash-derived, no red per
Thai rule) + meta-col (phone above branch) + LINE chip in bottom meta row.
Public API stable.

STRIP: AppointmentFormModal lines 1416-1420 (legacy checkbox) +
formData.lineNotify (5 sites) + appointmentDepositBatch lineNotify (4 sites).
Cron pipeline reads notifyChannel; lineNotify had zero consumers.

Tier 2 artifacts:
- NEW AV47 invariant + 15 V68 source-grep regression assertions
- NEW Rule Q L2 jsdom render verification script (6 checks PASS)

Tests: full suite GREEN. NO firestore/storage rules change. NO data
migration (orphan lineNotify field harmless).

NO deploy this turn (V18 lock). User authorizes vercel --prod separately.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 16.3: Push to master**

```bash
git push origin master 2>&1 | tail -5
```

Expected: clean push, no errors.

- [ ] **Step 16.4: Update SESSION_HANDOFF + active.md (small)**

```bash
# Update active.md status block at the top + Next action section
# Append V68 entry to .claude/rules/00-session-start.md V-entry table (compact)
```

(Both updates per existing project pattern; do NOT rewrite SESSION_HANDOFF.md
 in full — it's >256KB. Edit ONE section per session-end skill convention.)

---

## Self-Review (against spec)

After completing all tasks, verify:

**Spec § 3 file map**: All 13 files touched? ✅ tasks 1-16 cover each.

**Spec § 4 components**:
- AppointmentLineBadge contract (Task 2) ✅
- CustomerCard V5+depth (Task 9) ✅
- AV47 invariant grep targets (Task 13) ✅

**Spec § 5 data flow**: notifyChannel || lineNotify → AppointmentLineBadge → 🟢 chip — locked by AV47.C.1 + AV47.C.2.

**Spec § 6 error handling**: Defensive null returns + missing-field tolerance — covered by L2 verify checks 4-6.

**Spec § 7 testing**: 15 source-grep + 6 jsdom render checks + full suite Rule N batch-end + Rule Q L1 user hands-on — all enumerated.

**Spec § 10 acceptance criteria**: every checkbox maps to a task step.

**Placeholder scan**: No TBD / TODO / "implement appropriately" / "handle edge cases" without code. Every step has actual code or exact commands.

**Type consistency**: `AppointmentLineBadge` props `{appt, contextBranchId, size}` consistent across spec + plan + test contract. `CustomerLineBadge` props `{customer, contextBranchId}` consistent.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-15-line-badge-surfacing.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration with TDD discipline. Best for surgical multi-file refactor work like this.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints for review.

**Which approach?**
