# Treatment History Redesign — Design Spec

> Date: 2026-05-14 · Author: Claude (brainstormed with user) · Phase 28
> Status: APPROVED — ready for writing-plans
> Note on naming: this is a Phase number (work scope) not a V-number. V-numbers
> are reserved for bug-class lessons (V12 multi-reader-sweep, V21 lock-in, etc.).
> Tests prefixed `tests/phase-28-treatment-history-*.test.{js,jsx}`.
> Origin: user complaint "โครตจะไม่สวย" on the current treatment-history list in
> CustomerDetailView (screenshot 2026-05-14 EOD). User authorized world-class
> redesigner-level scope.

## 1. Context

The treatment-history card lives in `src/components/backend/CustomerDetailView.jsx`
(lines 1000–1290 approx). It renders a paginated list of treatments per
customer, with three header CTAs (พิมพ์เอกสาร / + บันทึกการรักษา / ดูไทม์ไลน์),
a row-per-treatment expandable list, and pagination at the bottom.

The current shipped state (Phase 27.2-sexies LATE EOD 2026-05-14, master
`9819c2e`) carries lifecycle badges per row but several problems are visible
in the user's screenshot:

- Badge styling is inconsistent (teal `bg-teal-950` + amber `bg-amber-950`
  + emerald `bg-emerald-950` — different palettes per stage with no shared
  rhythm).
- Badge labels wrap awkwardly when row is narrow ("ซัก / ประวัติ" two
  lines on the second row card creates uneven row height).
- The "ล่าสุด" red tag competes visually with the lifecycle pills.
- Date "14 พฤษภาคม 2569" is repeated four times in a row (4 entries on
  same day — vertical rhythm noisy).
- Header CTA buttons are three different colors (purple ghost / sky
  gradient / orange gradient) — un-coordinated.
- CC: / DX: render as bare text labels — weak hierarchy.
- The card lives inside a clean dark-fire/ember theme but the inner
  list feels "made by committee."

The user described the current state as "โครตจะไม่สวย" and asked for a
world-class redesign while preserving every piece of currently-displayed
information.

## 2. Goal

Replace the current treatment-history card body with a **timeline-led**,
**date-grouped**, **dot-stepper-with-connector** layout that:

1. Establishes clear visual rhythm via timeline metaphor and date sections
2. Unifies lifecycle badges into a single semantic vocabulary (3-step
   stepper with glow-tinted dots and connecting lines)
3. Improves typography hierarchy (date / time / status / meta / preview)
4. Polishes the three CTA buttons into a unified set (1 primary fire-red
   + 2 ghost) with refined hover states
5. Preserves every piece of currently-displayed data (date, time(s),
   doctor, branch, assistants, lifecycle stages with timestamps,
   editor attribution, CC, DX, status badge, latest indicator,
   per-treatment edit/delete/print buttons)
6. Stays inside the project design tokens (`--bg-* / --bd-* / --tx-*`)
   so light theme automatically inherits the redesign
7. Respects Thai cultural rules (no red on names/HN — accents only on
   timestamps + indicators; no gold accents)
8. Maintains current expand/collapse interaction model (single row open
   at a time, click anywhere on row to toggle)

## 3. Locked decisions (from brainstorming Q1-Q4)

| Q | Locked choice | Notes |
|---|---|---|
| Q1 — ambition | **B · Structural Redesign** | timeline-led + progress lifecycle; not minor polish, not experimental editorial |
| Q2 — timeline structure | **B · Date-grouped sections** | header per date with relative pill + count; rows underneath show only HH:MM |
| Q3 — lifecycle visualization | **B · Dot stepper + connector** | 3 dots connected by line; ✓ + glow on done; pulse on pending; numeric `2/3` on next; `−` on skipped |
| Q4 — scope | **B · List + header CTAs** | full card body + header CTA cluster; do NOT touch other CDV cards (profile/courses/finance) — that is Phase 28+ if user wants later |

Mockup screens that produced these decisions are persisted at
`.superpowers/brainstorm/16972-1778707957/content/{01..06}.html`.

## 4. Visual specification

### 4.1 Card frame

- Background: `var(--bg-card)` (dark `#0f0f0f` / light `#f8fafc`)
- Border: `1px solid var(--bd)` rounded-xl (`rounded-xl` = 12px)
- Shadow: `var(--shadow-card)` (none in dark, soft in light)
- Top accent: 1px linear-gradient line `transparent → rgba(239,68,68,0.4) → transparent`
  positioned at `top:0; left:0; right:0` via `::before` pseudo

### 4.2 Card header

- Padding: `px-5 py-3.5` (~14px 18px)
- Background: `linear-gradient(180deg, rgba(239,68,68,0.04), transparent)`
- Border-bottom: `1px solid var(--bd)`
- Layout: flex row, `gap-3`, `items-center`, `flex-wrap`
- Slots in order:
  1. **Header icon** — 32x32 rounded-9px tile with fire gradient bg
     (`linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.05))`)
     + `border:1px solid rgba(239,68,68,0.3)` + `Stethoscope` icon `size={14}` color `#fca5a5`
  2. **Title** — `text-sm font-bold` (`var(--tx-heading)`), text "ประวัติการรักษา",
     letter-spacing `-0.01em`
  3. **Count badge** — pill `px-2 py-0.5 rounded-full` with bg
     `rgba(239,68,68,0.15)`, text `#fca5a5`, border
     `1px solid rgba(239,68,68,0.3)`, font-mono, `text-xs font-bold`,
     value = `customer?.treatmentCount || treatmentSummary.length`
  4. **CTA cluster** (margin-left:auto, `flex gap-1.5 items-center`):
     - **Print (ghost)** — `cta-sec` style with print icon. Hover tints purple
       (`rgba(167,139,250,0.5)` border, `#c4b5fd` color, `rgba(167,139,250,0.05)` bg)
     - **Timeline (ghost)** — `cta-sec` style with activity icon. Hover tints orange
       (`rgba(251,146,60,0.5)` border, `#fdba74` color, `rgba(251,146,60,0.05)` bg)
     - **Create primary (fire-red)** — `cta-pri` style: padding `px-3.5 py-1.5`
       (~7px 14px), `text-xs font-bold`, white text,
       background `linear-gradient(135deg, #ef4444 0%, #dc2626 100%)`,
       border `1px solid rgba(255,255,255,0.1)`,
       box-shadow `0 0 0 1px rgba(239,68,68,0.3), 0 2px 8px rgba(239,68,68,0.4), inset 0 1px 0 rgba(255,255,255,0.15)`,
       hover lifts `translateY(-1px)` and grows shadow.
       Hidden when `onCreateTreatment` is null (existing prop gate preserved)

### 4.3 Date group header

- Padding: `px-5 py-2.5` (~10px 18px)
- Background: `linear-gradient(90deg, rgba(239,68,68,0.06) 0%, transparent 60%)` for "today"
  / `linear-gradient(90deg, rgba(75,85,99,0.04) 0%, transparent 60%)` for past
- Border-left: `3px solid #ef4444` (today) / `3px solid #374151` (past)
- Layout: flex row, justify-between, items-center
- Left side: date label + relative pill
  - **Date label**: `text-xs font-bold`, `var(--tx-heading)` (today) / `var(--tx-primary)` (past),
    format = `formatThaiDateFull(t.date)` returning e.g. "14 พฤษภาคม 2569"
  - **Relative pill**: `text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded`
    bg `rgba(239,68,68,0.12)` border `rgba(239,68,68,0.25)` color `#fca5a5` for today;
    bg `rgba(75,85,99,0.15)` border `rgba(75,85,99,0.3)` color `#9ca3af` for past
  - Relative pill text computed by helper: `วันนี้` / `เมื่อวาน` / `N วันที่แล้ว` / `N สัปดาห์ที่แล้ว` / `N เดือนที่แล้ว`
    based on `daysAgo = bangkokTodayDayDiff(t.date)`
- Right side: count `text-[10px] text-muted font-mono` "N รายการ"

### 4.4 Row (collapsed default state)

- Display: grid `grid-cols-[64px_1fr_24px]` (time / content / chevron)
- Padding: `px-5 py-3` (~12px 18px)
- Border-bottom: `1px solid #1a1a1a` (between rows; remove on last)
- Hover: `bg-[rgba(255,255,255,0.015)]`
- Cursor: pointer

#### Time column (64px wide)

- Font: `font-mono text-[13px] font-bold`
- Color: `var(--tx-secondary)` (#9ca3af) by default
- For latest row: color `#fca5a5` + text-shadow `0 0 8px rgba(239,68,68,0.4)`
- Top-padding 1px to align with first text line

#### Content column

- **Title row** (`flex items-center gap-2 mb-2 flex-wrap`):
  - **Status text**: `text-[13px] font-bold` color `var(--tx-heading)`.
    Computed from lifecycle state — see § 4.6 Status text vocabulary.
  - **Latest tag** (only on globalIndex===0): `text-[9px] font-bold uppercase
    tracking-wider px-1.5 py-0.5 rounded` bg
    `linear-gradient(135deg, rgba(239,68,68,0.25), rgba(239,68,68,0.15))`,
    color `#fca5a5`, border `1px solid rgba(239,68,68,0.4)`,
    box-shadow `0 0 8px rgba(239,68,68,0.2)`. Text "ล่าสุด"
  - **Row action** (`ml-auto font-mono text-[10px] font-semibold`):
    - "⌛ in progress" when not yet completed (color `var(--tx-muted)`)
    - "✓ บันทึก HH:MM" when completed (color `#6ee7b7`)
- **Stepper** (3 steps + 2 connectors, see § 4.5)
- **Meta-compact line** (margin-top 8px, `flex flex-wrap gap-x-2 text-[11px] text-muted`):
  - `<span class="doctor">หมอX</span>` — color `var(--tx-primary)` font-semibold (only if doctor present)
  - `· branch` (only if branch present)
  - `· assistant1, assistant2` (only if assistants[] non-empty)
  - `· แก้ไขโดย: name (role)` italic opacity-70 (only if editedByName present, role from ROLE_LABEL_TH)
- **CC/DX inline preview** (margin-top 5px, only if cc OR dx present):
  - Each line: `<span class="lbl">CC</span><span class="val">{value}</span>`
  - lbl: `text-[9px] uppercase tracking-wider font-bold text-muted`
  - val: `text-[11px] text-secondary truncate max-w-full inline-block`
  - One line per non-empty field

#### Chevron column (24px wide)

- Single character `▾` (Lucide `ChevronDown size={14}` preferred)
- Color `var(--tx-muted)`, padding-top 4px (align with first text line)
- Rotates to ▴ when row expanded
- Transition `transform 200ms`

#### Edit / Delete icon chips (collapsed row only — hover-fade desktop, always-visible mobile)

PRESERVE existing always-reachable behavior from current CDV.jsx:1197-1218 — admin
needs quick edit/delete without expansion. Render INSIDE the row (right-aligned
between content and chevron, or absolute-positioned overlay, choose during plan).

- Visibility: `opacity-70 lg:opacity-0 lg:group-hover:opacity-100 transition-opacity`
  (mobile always-visible at 70%, desktop fades in on row hover)
- Only rendered when `isBackendCreated && (onEditTreatment || onDeleteTreatment)`
- Each: 26x26 rounded-md icon button
  - Edit: `bg-[rgba(56,189,248,0.08)] border-[rgba(56,189,248,0.3)] text-[#7dd3fc]`,
    Lucide `Edit3 size={11}`, `aria-label="แก้ไขการรักษา"`, `title="แก้ไข"`
  - Delete: `bg-[rgba(239,68,68,0.08)] border-[rgba(239,68,68,0.3)] text-[#fca5a5]`,
    Lucide `Trash2 size={11}`, `aria-label="ลบการรักษา"`, `title="ยกเลิก / ลบ"`
- Click handler **MUST `e.stopPropagation()`** so click doesn't toggle expand

### 4.5 Stepper (3 steps + 2 connectors)

- Outer container: `flex items-start pr-3` (right-padding so connectors don't run to edge)
- Each step is a flex column, `min-width:74px`, `flex-shrink-0`,
  `items-center`, contains 3 vertically-stacked elements:

#### Step dot (24x24)

- Default (pending-future): `border-2 border-[#2a2a2a] bg-[#0a0a0a]`,
  centered text shows step number ("2" or "3") in `text-[#444]`.
- **Pending-now** (the current waiting step): border `#fcd34d`, text `#fcd34d`,
  bg `rgba(245,158,11,0.05)`, animation `pulse 2s ease-in-out infinite`
  (pulse keyframes: 0%/100% box-shadow `0 0 0 0 rgba(245,158,11,0)`,
  50% `0 0 0 6px rgba(245,158,11,0.05), 0 0 12px rgba(245,158,11,0.4)`).
  Text shows step number.
- **Done — vitals (`t`)**: bg `linear-gradient(135deg,#14b8a6,#0d9488)`,
  border `#5eead4`, color white, box-shadow `0 0 12px rgba(20,184,166,0.5)`.
  Text shows ✓ (Lucide Check size={11}).
- **Done — doctor (`a`)**: bg `linear-gradient(135deg,#f59e0b,#d97706)`,
  border `#fcd34d`, color white, box-shadow `0 0 12px rgba(245,158,11,0.5)`.
  Text ✓.
- **Done — completed (`e`)**: bg `linear-gradient(135deg,#10b981,#059669)`,
  border `#6ee7b7`, color white, box-shadow `0 0 12px rgba(16,185,129,0.5)`.
  Text ✓.
- **Skipped** (when stage was bypassed but treatment still progressed):
  same as default but text shows `−` and color `var(--tx-faint)`. No pulse.

#### Step label

- `text-[10px] font-bold mt-1.5 text-center leading-tight`
- Default color `var(--tx-muted)`; done → `var(--tx-primary)`;
  pending-now → `#fcd34d`
- Text per stage: "ซักประวัติ" / "แพทย์" / "เสร็จ" (or "รอแพทย์" / "ข้ามแพทย์" / "ข้าม"
  context-dependent — see § 4.6)

#### Step time

- `text-[9px] font-mono font-semibold mt-0.5 tracking-wider`
- Done: `var(--tx-secondary)` showing `formatBadgeTime(b.time)`
- Empty (pending or skipped): `var(--tx-faint)` showing `—`

#### Connector

- `flex-1 h-0.5 mx-[-2px] mt-[11px] z-0`
- Default: `bg-[#222]` (dark gray)
- Filled (when step BEFORE this connector is done):
  - `done-t`: `linear-gradient(90deg,#5eead4,#14b8a6,#0d9488)`
  - `done-a`: `linear-gradient(90deg,#fcd34d,#f59e0b,#d97706)`

### 4.6 Lifecycle status vocabulary

Compute `treatmentLifecycle` array (existing logic at CDV.jsx:1073-1095 — preserve).
Then derive a readable status string for the title-row:

| Stages done | Status text |
|---|---|
| none (somehow) | "ยังไม่บันทึก" |
| only `vitalsigns` | "ซักประวัติเท่านั้น" |
| only `completed` (no vitals/doctor) | "เสร็จสิ้น · ตรงเข้าบันทึก" |
| `vitalsigns` + `completed` (no doctor) | "เสร็จสิ้น · ข้ามแพทย์" |
| all 3 (`vitalsigns` + `doctor` + `completed`) | "เสร็จสิ้น · ครบ 3 ขั้น" |
| `vitalsigns` only AND latest row | "รอแพทย์บันทึก" (signals in-progress) |
| `vitalsigns` + `doctor` (no completed) | "ครบขั้นแพทย์ · รอบันทึก" |

Helper function: `getTreatmentStatusLabel(treatment, isLatest)` — pure function,
testable in isolation. Located in `src/lib/treatmentDisplayResolvers.js`
(extends existing module from Phase 27.0).

For the stepper, the labels per dot also adapt:

| Context | t-label | a-label | e-label |
|---|---|---|---|
| All done | ซักประวัติ | แพทย์ | เสร็จ |
| Vitals done, doctor pending | ซักประวัติ | **รอแพทย์** | เสร็จ |
| Doctor skipped, completed | ซักประวัติ | **ข้ามแพทย์** | เสร็จ |
| All skipped except completed | **ข้าม** | **ข้าม** | เสร็จ |
| Pending state | rolling defaults |

### 4.7 Row (expanded state)

When user clicks a row, the same row stays in place but adopts the
expanded styling AND a new body section appears below the chevron column.

#### Style adjustments to expanded row

- Background: `linear-gradient(180deg, rgba(239,68,68,0.025), rgba(239,68,68,0.01))`
- Border-left: `3px solid #ef4444` (entire row gets a fire accent)
- Padding-left: reduced by 3px to compensate for border (~`pl-[15px]` instead of `pl-[18px]`)
- Chevron rotates 180deg, color `#fca5a5`

#### Expanded body

- Renders BELOW the row (still inside same row container, `grid-column: 1 / -1`)
- Margin-top 14px, padding `p-4 pl-[78px]` (78px = 64px time column + 14px gap)
- Border-top: `1px dashed #2a1818`
- Background: `rgba(0,0,0,0.2)`
- Border-radius bottom: `0 0 6px 6px`
- Negative side-margin to extend to row edges (`-mx-[15px]`)

Body content blocks (top-to-bottom):

1. **CC/DX callout** (only if cc OR dx present):
   - Two-column flex layout
   - Container: `flex gap-2 mb-3.5 px-3 py-2.5 bg-[#0a0a0a]
     border border-[#1a1a1a] border-l-[3px] border-l-[rgba(239,68,68,0.5)] rounded-md`
   - Each block: `flex-1 min-w-0`
   - CC block has `text-muted` label; DX block has `text-[#fca5a5]` label
   - Label: `text-[9px] font-bold uppercase tracking-wider`
   - Value: `text-[12px] text-primary leading-relaxed` (full text, NOT truncated)

2. **TreatmentDetailExpanded component** (existing component at CDV — keep as-is):
   - Renders vitals signs grid, treatment items, medications, images grid, chart
   - Wrapped in same `bg-[var(--bg-elevated)] rounded-lg p-3` container as today
   - Component itself is OUT OF SCOPE for this redesign (Phase 28+ if user wants to refresh too)

3. **Per-treatment print bar** (`flex flex-wrap gap-2 mt-3.5`):
   - **Print cert button**: `text-xs font-bold px-3 py-1.5 rounded-md`
     bg `rgba(56,189,248,0.1)`, border `rgba(56,189,248,0.4)`,
     color `#7dd3fc`, hover bg `rgba(56,189,248,0.2)`,
     text "⎙ พิมพ์ใบรับรองแพทย์ ▾"
   - **Print record button**: same pattern but emerald
     bg `rgba(16,185,129,0.1)`, border `rgba(16,185,129,0.4)`,
     color `#6ee7b7`, hover bg `rgba(16,185,129,0.2)`,
     text "⎙ พิมพ์การรักษา ▾"
   - **Edit/Delete icons stay on the COLLAPSED row** (per § 4.4 chip block) —
     do NOT duplicate them inside the expanded body. Reasoning: admin
     can edit/delete without expanding (current behavior preserved);
     duplicating in expanded body would clutter without value.

### 4.8 Pagination footer

- Padding `px-5 py-3` (~12px 18px)
- Border-top: `1px solid var(--bd)`
- Background: `linear-gradient(180deg, transparent, rgba(0,0,0,0.3))`
- Layout: flex justify-between items-center flex-wrap gap-2.5

#### Info text (left)

- `text-[11px] text-muted`
- Bold numbers in mono font: "แสดง **1–5** จาก **13** รายการ"

#### Nav buttons (right)

- `flex gap-1 items-center`
- Each button: `min-w-[30px] h-7 px-2.5 text-[11px] rounded-md
  border border-[#2a2a2a] bg-[rgba(255,255,255,0.02)]
  text-secondary font-bold font-mono`
- Hover: `bg-[rgba(255,255,255,0.06)] text-heading border-[#444]`
- Active page: `bg-[linear-gradient(135deg,#ef4444,#dc2626)]
  border-transparent text-white box-shadow:0 0 0 1px rgba(239,68,68,0.4),
  0 2px 6px rgba(239,68,68,0.3)`
- Prev `‹` Next `›` buttons same shape, disabled state `opacity-30 cursor-not-allowed`
- Ellipsis `…` rendered as plain text between non-adjacent page numbers
  (logic preserved from existing CDV.jsx:1273-1282)

## 5. Behavior specification

### 5.1 Expand toggle

- Click anywhere on a collapsed row → expand
- Click anywhere on an expanded row's HEADER (not the body content) → collapse
- Body content (CC/DX callout, TreatmentDetailExpanded, action buttons)
  must `e.stopPropagation()` to prevent collapsing when interacted with.
- Only one row expanded at a time (single-state pattern preserved from
  existing `expandedTreatment` useState).
- Pagination behavior preserved: switching pages auto-collapses any
  expanded row not in the new page (existing useEffect at CDV.jsx:567-573).

### 5.2 Date grouping computation

- Sort `treatmentSummary` by `date DESC, time DESC` (already sorted upstream)
- After pagination slice, group by `date`:
  ```js
  const groupedRows = useMemo(() => {
    const groups = [];
    let currentDate = null;
    for (const t of paginatedTreatments) {
      if (t.date !== currentDate) {
        groups.push({ type: 'header', date: t.date, count: 1, _firstAt: groups.length });
        currentDate = t.date;
      } else {
        groups[groups.length - 1].count++;
      }
      groups.push({ type: 'row', t });
    }
    return groups;
  }, [paginatedTreatments]);
  ```
- Render: `.map((node, i) => node.type === 'header' ? <DateHeader ... /> : <Row ... />)`

### 5.3 Relative date computation (date-header pill)

Pure helper `computeRelativeThaiDateLabel(dateISO, todayISO)`:

| daysAgo | Label |
|---|---|
| 0 | วันนี้ |
| 1 | เมื่อวาน |
| 2-6 | `${daysAgo} วันที่แล้ว` |
| 7-13 | `1 สัปดาห์ที่แล้ว` |
| 14-29 | `${Math.floor(daysAgo/7)} สัปดาห์ที่แล้ว` |
| 30-89 | `${Math.floor(daysAgo/30)} เดือนที่แล้ว` |
| 90-364 | `${Math.floor(daysAgo/30)} เดือนที่แล้ว` |
| 365+ | `${Math.floor(daysAgo/365)} ปีที่แล้ว` |

Bangkok TZ via existing `bangkokNow()` and `thaiTodayISO()` helpers from
`src/utils.js` — never raw `new Date()` per Rule 04-thai-ui.

### 5.4 Time formatting

- All HH:MM rendering uses existing `formatBadgeTime(timestamp)` helper
  (preserve from current CDV.jsx) — returns 24-hour HH:MM in Bangkok TZ.
- Step-time empty state shows `—` (em-dash) not blank.

### 5.5 Hover / focus states

- Row hover: subtle bg lift `rgba(255,255,255,0.015)` 200ms
- CTA button hover: defined per-button above (translateY -1px + shadow grow)
- Step dot hover: no per-dot hover (whole row is the click target)
- Pagination button hover: bg + border + text color change 150ms

### 5.6 Keyboard accessibility

- Each row is a `<button>` semantically (already is in current code, line 1105–1108)
- Has `aria-expanded={isExpanded}`
- Has `data-testid={treatment-toggle-${t.id}}`
- Tab order: header → CTA group (left to right) → first row → … → pagination
- Enter/Space toggles row when focused

### 5.7 Empty / loading / error states

- Empty (no treatments): preserve current empty card design at CDV.jsx:1052-1057
  but update typography to match new aesthetic
- Loading per-row (when expand fires before `treatments[]` populated):
  preserve existing skeleton at CDV.jsx:1224-1227
- Error (treatments listener failed): preserve existing error banner at
  CDV.jsx:1047-1051 but check color tokens are still right

## 6. Data shape — no schema changes required

All required fields already exist on `treatmentSummary[]` entries (Phase 27.2-quater
backfill brought them up to date in production):

```js
{
  id: string,
  date: 'YYYY-MM-DD',
  doctor: string,
  branch: string,
  assistants: string[],
  cc: string,
  dx: string,
  status: string,
  vitalsignsRecordedAt: ISO8601 | null,
  doctorRecordedAt: ISO8601 | null,
  completedAt: ISO8601 | null,
  recordedAt: ISO8601 | null,
  editedAt: ISO8601 | null,
  editedByName: string | null,
  editedByRole: string | null,
  createdBy: string | null,
}
```

The new layout consumes these existing fields. **No Firestore writes,
no schema migrations, no rule changes.** Pure client-side render layer.

## 7. Component architecture

Currently the entire treatment-history card is rendered inline inside
`CustomerDetailView.jsx` (~290 lines from line 1000 to 1290). This redesign
extracts it into focused sub-components for testability and to reduce CDV
file size:

```
src/components/backend/treatment-history/
├── TreatmentHistoryCard.jsx          (top-level — renders header + groups + pagination)
├── TreatmentHistoryHeader.jsx        (icon + title + count + 3 CTAs)
├── TreatmentDateHeader.jsx           (date pill + relative pill + count)
├── TreatmentHistoryRow.jsx           (single row collapsed + expand toggle)
├── TreatmentLifecycleStepper.jsx     (3 dots + 2 connectors)
├── TreatmentHistoryExpandedBody.jsx  (CC/DX callout + TreatmentDetailExpanded + action buttons)
└── TreatmentHistoryPagination.jsx    (existing pagination footer cleaned up)
```

Plus pure helpers in `src/lib/treatmentDisplayResolvers.js` (extends existing module):

- `getTreatmentLifecycle(t)` — returns `[{ key, time, label }]` sorted by time.
  Replaces inline logic at CDV.jsx:1073-1095.
- `getTreatmentStatusLabel(t, isLatest)` — returns Thai status string per § 4.6 table
- `getStepLabels(lifecycle)` — returns `{ t, a, e }` step-label strings
- `computeRelativeThaiDateLabel(dateISO, todayISO)` — per § 5.3
- `groupTreatmentsByDate(rows)` — per § 5.2
- `computeRowAction(lifecycle)` — returns "⌛ in progress" / "✓ บันทึก HH:MM" string

CustomerDetailView.jsx imports `<TreatmentHistoryCard customer={customer}
treatmentSummary={treatmentSummary} treatments={treatments}
expandedTreatment={expandedTreatment} setExpandedTreatment={...}
onCreateTreatment={...} onEditTreatment={...} onDeleteTreatment={...}
treatmentPage={...} setTreatmentPage={...} treatmentsLoading={...}
treatmentsError={...} setPrintDocOpen={...} setShowTimeline={...}
setPrintPerTreatment={...} ac={ac} acRgb={acRgb} isDark={isDark} />`
and replaces the inline 290-line block.

Net: CustomerDetailView.jsx shrinks ~270 lines; treatment-history concerns
isolated and unit-testable.

### 7.1 Phase 27.2-septies note (acknowledged but NOT done in this spec)

The active.md flagged optional follow-up: extract shared
`buildTreatmentSummaryEntry(t)` helper to backendClient.js so both
`rebuildTreatmentSummary` (writer) AND CDV's in-component mapper consume it,
eliminating V12 multi-reader-sweep structurally. **This redesign extracts
display helpers but does NOT extract that mapper**. Reason: Phase 27.2-septies
is a structural-fix orthogonal to this visual redesign. Recommended order:
ship Phase 28 (this redesign) first → then Phase 27.2-septies as a separate
1-commit follow-up. If user prefers combined, writing-plans phase can fold
both into one plan.

## 8. Files to touch

### New files

- `src/components/backend/treatment-history/TreatmentHistoryCard.jsx`
- `src/components/backend/treatment-history/TreatmentHistoryHeader.jsx`
- `src/components/backend/treatment-history/TreatmentDateHeader.jsx`
- `src/components/backend/treatment-history/TreatmentHistoryRow.jsx`
- `src/components/backend/treatment-history/TreatmentLifecycleStepper.jsx`
- `src/components/backend/treatment-history/TreatmentHistoryExpandedBody.jsx`
- `src/components/backend/treatment-history/TreatmentHistoryPagination.jsx`

### Modified files

- `src/lib/treatmentDisplayResolvers.js` — add 6 new pure helpers per § 7
- `src/components/backend/CustomerDetailView.jsx` — replace inline 290-line
  block with `<TreatmentHistoryCard {...props} />` (~5 lines net)

### Tests added

- `tests/phase-28-treatment-history-resolvers.test.js` — pure helpers
  unit (getTreatmentLifecycle, getTreatmentStatusLabel, getStepLabels,
  computeRelativeThaiDateLabel, groupTreatmentsByDate, computeRowAction).
  Adversarial inputs (null / empty / Bangkok-TZ-edge / mixed status / all-skipped).
  Estimated +60 assertions.
- `tests/phase-28-treatment-history-rtl.test.jsx` — RTL render tests:
  - Header renders 3 CTA buttons (print/timeline/create) when all callbacks present
  - Header omits create button when `onCreateTreatment` is null
  - Date headers group correctly (today + 7 days ago test fixture)
  - Date relative label correct ("วันนี้" / "7 วันที่แล้ว")
  - Row collapsed shows time + status + stepper + meta + cc/dx preview
  - Click row → expands; click again → collapses
  - Only one row expanded at a time
  - Latest tag only on globalIndex===0
  - Stepper dots show ✓ on done, "−" on skipped, number on pending
  - Pulse class only on pending-now stage
  - Edit/delete chips appear on collapsed rows when `isBackendCreated && callbacks present`
  - **Edit chip click does NOT toggle expand** (e.stopPropagation guard)
  - **Delete chip click does NOT toggle expand** (same guard)
  - Pagination unchanged behavior (page 2 → first row of page 2 not auto-expanded)
  - Estimated +37 assertions.
- `tests/phase-28-treatment-history-flow-simulate.test.jsx` — Rule I full-flow
  simulate: mount actual `<TreatmentHistoryCard>` with realistic 5-treatment
  fixture (matching user's screenshot), assert grouped rendering + correct
  HH:MM in stepper + click flow → expand → CC/DX callout + nested print
  buttons. Estimated +15 assertions.
- `tests/phase-28-treatment-history-source-grep.test.js` — V21-class regression
  guards: TreatmentHistoryCard imports from treatmentDisplayResolvers (not
  inline); CustomerDetailView no longer contains the inline 290-line block;
  helper functions exported from resolver module; new components in
  `src/components/backend/treatment-history/` directory; Phase 28 marker comments.
  Estimated +12 assertions.

### Tests modified (V21 fixups)

- Existing tests asserting CDV inline structure may break: enumerate during
  writing-plans, fix each with Phase 28 marker comment explaining transition.
  Estimated 5-10 fixups.

## 9. Risks + mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| V21 source-grep tests on CDV inline structure break en masse | Medium | Enumerate broken tests during writing-plans; add Phase 28 marker comments; do NOT lock the inline structure pattern in any test |
| TreatmentDetailExpanded re-render breaks (out of scope but neighbor) | Low | Keep TreatmentDetailExpanded component untouched; only its parent container is replaced. Snapshot test of TreatmentDetailExpanded should remain green |
| Edit/delete chip click bubbles up and toggles row expansion | Medium | Mandatory `e.stopPropagation()` on both onClick handlers (locked in spec § 4.4); regression test in `phase-28-treatment-history-rtl.test.jsx` clicks edit chip and asserts row stays collapsed |
| Date grouping breaks pagination edge cases (page 2 starts mid-day) | Medium | Helper `groupTreatmentsByDate` runs AFTER pagination slice — date header always renders correctly per page even if same date spans pages |
| Stepper visual breaks in narrow viewports (e.g. mobile portrait < 375px) | Medium | Set `min-width:74px` per step; outer container has `overflow-x-auto` fallback. Test at 320px width via Playwright snapshot. |
| Bundle size growth | Low | New components are small (<5KB total); helpers reuse existing patterns. Build report should show <2KB delta on BackendDashboard chunk |
| Theme breakage in light mode | Low | All hardcoded hex colors (`#ef4444` etc.) appear ONLY for accent/glow/gradient surfaces; surface/text colors use `var(--bg-* / --tx-*)` tokens. Smoke-test in `[data-theme=light]` |

## 10. Out of scope (Phase 28+ if user wants later)

- Profile card / chips card visual update
- Course card visual update
- Finance card visual update
- Appointments tab visual update
- Chat tab visual update
- TreatmentDetailExpanded internal layout (the body content rendered when
  a row expands — its CC/DX, vitals, items, medications, images all keep
  the existing TreatmentDetailExpanded component)
- Print modal redesign (PrintDocumentModal stays as today)
- Timeline modal redesign (TreatmentTimelineModal stays as today)
- TFP page redesign (out of scope — this is CDV-only)

## 11. Migration / rollout

- Pure client render-layer change. No Firestore writes. No schema changes.
- No data migration needed.
- No probe-deploy-probe needed.
- Combined with the existing ~32 commits ahead of prod, deploy via standard
  V15 combined deploy when user authorizes.

## 12. Verification before commit (Rule N + Rule I + V18)

- Targeted: `npm test -- --run tests/phase-28-*` → all green
- Build: `npm run build` → clean
- Rule I full-flow simulate via preview_eval on running dev server:
  navigate to backend → customer detail → verify card renders correctly,
  click row → expand → verify expanded body has CC/DX callout + detail
  + print buttons; click again → collapse
- Light theme smoke test via `?theme=light` URL param or system pref
- Mobile viewport check at 375px and 768px breakpoints
- Final full suite at end of batch (Rule N implicit override)

## 13. Lessons / institutional memory

If this redesign uncovers V12-class drift in the helpers module
(`treatmentDisplayResolvers.js`), the existing AV42 audit invariant should
catch it. Phase 27.2-septies follow-up may become more urgent if the new
helpers introduce another reader path that strips lifecycle fields — flag
during writing-plans.

---

## Approval

- Brainstorming Q1-Q4 + integrated design v2 — APPROVED by user 2026-05-14 EOD
- Spec self-review — pending (next step)
- User spec review — pending (after self-review)
- Transition to writing-plans — pending (after user review)
