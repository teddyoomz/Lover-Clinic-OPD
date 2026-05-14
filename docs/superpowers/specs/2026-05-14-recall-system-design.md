# Recall System — Design Spec

> Date: 2026-05-14 · Author: Claude (brainstormed with user) · Phase 29
> Status: APPROVED — ready for writing-plans
> Origin: user request — "เพิ่มระบบรีคอล หรือคือระบบลงบันทึกการโทรศัพท์หรือแชทหาลูกค้าที่ถึงรอบบริการที่จะต้องกลับมาเข้ารับบริการที่คลินิก"
> Brainstorming locked Q1-Q4 + 2-round pairing + pair-label format via Visual Companion at `.superpowers/brainstorm/379-1778731938/content/01-07.html` (gitignored).

## 1. Context

LoverClinic admin needs to call/message customers when their treatment cycle is due (filler 6mo / botox 4mo / PRP 3mo / etc.) AND for short-term aftercare follow-ups (the day after a procedure). Today this is tracked manually in paper or memory — no system, no audit trail, no consistency.

Industry research (Consentz, Pabau, Dewy, Prospyr — top aesthetic clinic CRMs) confirms: treatment-bound automated recall + outcome categorization + multi-channel follow-up are core retention features. We integrate with the existing LINE OA infrastructure (chat_conversations + lineUserId + chat_config — all wired per V32-tris-ter).

The system **also pairs naturally** with how the clinic actually works: most procedures need TWO recalls — one for short-term aftercare (1-3 days) and one for cycle-end revisit (months). User explicitly designed for this 2-round structure.

## 2. Goal

Build a recall management system that:

1. Lets admin create recalls (manual + auto-suggested from treatment) with **2 paired slots** (aftercare + revisit, both optional)
2. Surfaces recalls in **3 places**: Backend management tab + Frontend daily-work sub-tab + Customer Detail card
3. Auto-suggests recall dates + reasons from `be_products` + `be_courses` master-data fields (admin configures once per product)
4. Lets admin save inline during recall creation: "บันทึกระยะเวลานี้ลง master-data ด้วย" — opt-in, never forced
5. Records call outcomes in 4 categories + textarea + auto-snooze on no-answer
6. Sends LINE templates 1-click for customers with linked LINE accounts
7. **Real-time refresh across all 3 surfaces** — create/update fires Firestore listener → components re-render WITHOUT flicker (no unmount)
8. Stays inside the project design tokens (Phase 28 design DNA — date-grouped sections + dot stepper aesthetic + fire-red accent)
9. Honors Thai cultural rules (no red on names, dd/mm/yyyy พ.ศ., 24hr time)
10. Branch-scoped per BSA (Rule L — `be_recalls` is branch-scoped, follows BS-13 safe-by-default listener pattern)

## 3. Locked decisions (from brainstorming Q1-Q4 + bonus + clarifications)

| Q | Locked choice | Notes |
|---|---|---|
| Q1 — scope | **B + LINE templates** | full smart-features baseline (auto-suggest from treatment / snooze / filter+search / outcome categories / overdue badge / quick-actions from CDV/treatment) + 1-click LINE template send (uses existing LINE OA infra) |
| Q2 — auto-suggest source | **Master-data field + inline-learn opt-in** | `be_products` + `be_courses` get `followUpAfterDays` + `recallAfterDays` (each independently optional). Modal create has inline-learn checkbox: "บันทึกระยะเวลานี้ลง master ด้วย" — never forced. Admin can ALWAYS override the suggestion. |
| Q3 — Backend tab UI | **Date-grouped sections (Phase 28 DNA)** | 5-bucket time sections: เกินกำหนด / วันนี้ / พรุ่งนี้ / ภายใน 7 วัน / ภายหลัง. Quick-action chips per card (📞 / 💬 LINE / ⏰ snooze). Auto-suggest banner at top. |
| Q4 — Frontend scope | **Today + Overdue focused** | Frontend sub-tab shows ONLY overdue + today buckets + "+ ตั้ง Recall ใหม่" button. Future recalls live in Backend tab only. Tab badge shows count. |
| BONUS — CDV card | **Mirror appointment-card pattern** | Customer Detail View gets a "Recall" card next to existing "นัดหมายครั้งถัดไป" card. Same header pattern (title + count + "ดูทั้งหมด" + "+ เพิ่ม Recall"). Lists this customer's pending+upcoming recalls. |
| 2-round pairing | **2 independent optional slots in modal** | Modal has 2 slots (🩹 ติดตามอาการ + 📅 นัดกลับมา). Each toggle on/off independently. Validation: ≥ 1 must be enabled. Footer "จะสร้าง N recall" updates real-time. Each slot's enabled→disabled toggle also clears its data. |
| Pair-label format | **Always-show status suffix** | `🔗 จับคู่กับ: <icon> <name> · <date> · <status-suffix>` — status suffix is one of: "รอ Recall" / "เสร็จแล้ว" / "ติดต่อไม่ได้ครั้งที่ N" / "เลื่อนไป <date>" / "เกินกำหนด N วัน". Same template across all 3 surfaces. Clickable — scrolls/opens detail. |

Mockup screens persisted at `.superpowers/brainstorm/379-1778731938/content/{01..07}.html`.

## 4. Visual specification

### 4.1 Surface 1 — Backend tab (`tab=recall`)

Lives in `appointments-section` of `navConfig.js` directly after `appointment-walk-in`. Same architectural pattern as other sub-tabs (e.g. `appointment-treatment-in`).

**Card frame**:
- Background: `var(--bg-card)` rounded-xl, top fire-red gradient accent line via `::before` (Phase 28 DNA)
- Border: `1px solid var(--bd)`
- Box-shadow: `var(--shadow-card)`

**Header** (sticky-on-scroll):
- 30x30 fire-red gradient icon tile (🔔)
- Title "Recall" + count badge (font-mono, fire-red tint pill)
- Search input (max-w-200px) — searches name / HN / reason
- "⚙ ตัวกรอง" ghost button (opens filter dropdown: status / date range / source)
- "+ ตั้ง Recall ใหม่" primary fire-red button (opens RecallCreateModal)

**Date-grouped sections** (5 buckets, in order):
1. **🚨 เกินกำหนด** (overdue — recall date < today AND status != done) — dark red border-left + pulse
2. **📅 วันนี้** — fire-red border-left
3. **📅 พรุ่งนี้** — amber border-left
4. **📆 ภายใน 7 วัน** — teal border-left
5. **📋 ภายหลัง** — indigo border-left

Each section header: title + relative pill ("วันนี้" / "พรุ่งนี้" / etc.) + count "N รายการ · เสร็จ X/N" (only show "เสร็จ X/N" for today section).

**Empty section**: hide entirely (don't render header if 0 items).

**Recall row** (uniform across all sections):
- Grid: `[time:56px] [content:1fr] [actions:auto]`
- Time column: dd MMM (e.g. "12 พ.ค.") font-mono, latest=fire-red glow
- Content:
  - Title row: customer name + LINE badge (if linked) + status chip + paired-link mini-icon
  - Meta line: reason · source product/course · "นัดเดิม dd MMM yyyy" · "โทรครั้งที่ N" if no-answer count > 0
  - Outcome callout (if status='done'): green left-border quoted text + "บันทึกโดย ___"
  - **Pair badge** (full format per § 4.7) below meta if `pairedRecallId` present
- Actions column (right-aligned, hover-fade desktop / always-visible mobile):
  - 📞 record-call (opens RecallOutcomeModal)
  - 💬 LINE template (opens RecallLineTemplateModal — only for customers with `lineUserId`)
  - ⏰ snooze (opens snooze-date picker)
- Click anywhere on content (NOT actions/pair-badge) → opens RecallDetailModal (full edit)

### 4.2 Surface 2 — Frontend sub-tab (`?adminMode=appointment` view-toggle)

Inserted between "📋 รายการ" and "📅 ปฏิทิน" toggle pills (AdminDashboard.jsx:6480-6505 area). Becomes 3-state toggle: รายการ / **🔔 Recall** / ปฏิทิน.

**Tab pill**:
- Active state: fire-red bg
- Has count badge `<span class="ml-1 bg-white/20 px-1.5 rounded-full text-[10px]">7</span>` showing pending+overdue count
- Badge updates in real-time via Firestore listener (no manual refresh)

**Body** = simplified version of Backend tab:
- Show ONLY overdue + today sections (no future buckets)
- Same row design (same `RecallRow` component reused)
- "+ ตั้ง Recall ใหม่" button at bottom
- Hint footer: "ดู recall อนาคต / ทั้งหมด → ไป Backend → Recall"
- No filter / no search (frontend = focused-action; admin uses backend for management)

### 4.3 Surface 3 — CDV card (next to "นัดหมายครั้งถัดไป" card)

Lives in `CustomerDetailView.jsx`, rendered alongside the existing appointment card. Same header pattern as appointment card (per user screenshot reference).

**Header**:
- Icon tile 🔔 (fire-red gradient, matches Phase 28 pattern)
- Title "Recall" + count badge
- Right side: "📋 ดูทั้งหมด" ghost button (opens RecallListModal filtered to this customer) + "+ เพิ่ม Recall" primary button (opens RecallCreateModal pre-filled with customer)

**Body**:
- Lists this customer's recalls (sorted: overdue → today → upcoming)
- Each row shows: relative-when (74px column "15 พ.ค." + sub-label "พรุ่งนี้" / "เกิน 2 วัน" / "8 วัน" / "~6 เดือน")
- Reason (bold) + slot-type chip (🩹 / 📅) + status chip
- Source meta ("จากการรักษา 14 พ.ค. 2569 · neuramis deep")
- Pair badge (if applicable) with full format
- Compact actions: 📞 + ⏰ (no LINE here — use Backend tab for that)

**Footer hint** (only when this customer has historical recalls beyond what's shown):
- "💡 ลูกค้าคนนี้มี recall เก่าทั้งหมด N รายการ (เสร็จ X / ติดต่อไม่ได้ Y) → กด 'ดูทั้งหมด' เพื่อดูประวัติ"

**Empty state**:
- "ไม่มี Recall · กดปุ่ม + เพื่อเพิ่ม" centered with icon

### 4.4 RecallCreateModal (2-slot design)

**Header**: "🔔 ตั้ง Recall ใหม่" + ✕ close

**Customer header** (shared at top of body):
- Background: teal-tinted card
- Avatar (initials or photo) + name + LC ID + phone + LINE badge
- "จากการรักษา <date> · <treatment-summary>" (auto-filled when launched from treatment context, editable when launched standalone)

**Slot 1 — 🩹 ติดตามอาการ** (collapsible):
- Header: amber-tinted bg + 🩹 icon + label "Recall #1 · ติดตามอาการ" + sub "หลังการรักษา (มักจะ 1-3 วัน)" + toggle switch (default ON when launching from treatment context)
- When OFF: body collapsed (animation)
- When ON: body shows:
  - Date input (DateField — dd/mm/yyyy พ.ศ. per project rule 04)
  - Days-from-now indicator (amber badge): `📅 ห่างจากวันนี้ <N> วัน` (auto-update on date change)
  - Reason input (auto-suggest from master-data if available)
  - Auto-suggest hint (teal dashed): "💡 Auto-suggest จาก master-data: <product> — ติดตามอาการที่ +<N> วัน"
  - Inline-learn checkbox (if no master-data exists for this product yet): "💾 บันทึกระยะเวลา <N> วันลง master-data ของ <product>"

**Slot 2 — 📅 นัดกลับมารับบริการ** (collapsible):
- Same structure as Slot 1 but with fire-red theme + 📅 icon + "Recall #2 · นัดกลับมารับบริการ" + sub "เมื่อบริการครบรอบ (ฟิลเลอร์ 6 เดือน / botox 4 เดือน / etc.)"
- Days-from-now badge in fire-red
- Auto-suggest pre-filled from `master.recallAfterDays`
- Inline-learn checkbox per slot independently

**Validation banner** (shown if both slots disabled):
- "⚠ กรุณาเปิดอย่างน้อย 1 slot"
- Save button disabled

**Footer**:
- Left: live summary "📋 จะสร้าง <N> recall" (N = count of enabled slots, 1 or 2)
- Right: "ยกเลิก" ghost + "บันทึก <N> Recall" primary
- Save handler:
  - Creates 1 or 2 `be_recalls` docs (each with own ID)
  - If both: stamps `pairedRecallId` cross-reference on both
  - If inline-learn checked per slot: writes `recallAfterDays`/`followUpAfterDays` + `*Reason` defaults to the matched `be_products` or `be_courses` doc
  - Optimistic UI: closes modal immediately + adds locally to list (rolls back on error)

### 4.5 RecallOutcomeModal (record call result)

**Header**: "📞 บันทึกผลการ Recall · <customer name>"

**Body**:
- "ผลการติดต่อ" 4-card grid (single-select, required):
  - **✓ จะมาตามนัด** (emerald) → status='done', note required if user wants to add details
  - **⏰ ขอเลื่อน** (amber) → status='done' + opens snooze-date picker for new recall date
  - **💭 ไม่สนใจ / ไม่ต้องการ** (indigo) → status='done' + closes recall
  - **📵 ติดต่อไม่ได้** (red) → status='no-answer' + auto-snooze 3 days + increment `noAnswerCount`
- "รายละเอียด / หมายเหตุ" textarea
- Auto-snooze hint (when no-answer selected): "📵 ระบบจะ auto-snooze 3 วัน — ครั้งที่ 3 จะ flag ให้ admin จัดการ manual"

**Save handler**:
- Updates `be_recalls/{id}` with: `status`, `outcome`, `outcomeNote`, `outcomeAt`, `outcomeBy` (uid + name + role from useAuth)
- If "ติดต่อไม่ได้": also sets `snoozedUntil = now + 3 days`, increments `noAnswerCount`
- If `noAnswerCount >= 3`: sets `requiresManualReview = true` + shows in special "ต้องตรวจสอบด้วยตนเอง" sub-bucket within "เกินกำหนด" section
- Optimistic UI: closes modal immediately + updates local row state (status chip + outcome callout appears)

### 4.6 RecallLineTemplateModal (1-click LINE send)

**Visible only when customer has `lineUserId`** (otherwise the 💬 button is hidden in the row).

**Header**: "💬 ส่งข้อความ LINE · <customer name>"

**Body**:
- "เลือก template" header
- 3 cards (single-select):
  - **📅 แจ้งครบรอบ recall (default)** — `"คุณ {ชื่อ} สวัสดีค่ะ คลินิก Lover แจ้งให้ทราบว่าครบรอบบริการ {เรื่อง} ของคุณแล้วค่ะ ..."`
  - **💉 ติดตามผลฟิลเลอร์/botox** — `"คุณ {ชื่อ} ครบ {N} เดือนแล้ว ผลและความพึงพอใจเป็นอย่างไรบ้างคะ?"`
  - **✏️ ข้อความ custom** — opens a textarea for admin to write directly
- Templates stored in `clinic_settings/chat_config.recallTemplates` (admin can edit in LineSettingsTab — out of scope for this phase, default 3 templates ship with Phase 29)
- Variables auto-fill: `{ชื่อ}`, `{เรื่อง}`, `{วันที่}`, `{N เดือน}`, `{คลินิก}` — pre-rendered preview shown below template selection
- Footer hint (when LINE confirmed linked): "✓ ลูกค้าผูก LINE แล้ว · template variables auto-fill จากข้อมูลลูกค้า · กด 'ส่ง' = ส่งทันที + บันทึกใน chat history"

**Save handler**:
- POST to NEW endpoint `/api/admin/line-send-recall` (admin-gated):
  - Server uses firebase-admin to read `clinic_settings/chat_config` (per V32-tris-ter pattern)
  - Sends LINE Push API call to customer's `lineUserId`
  - On success: appends a system message to `chat_conversations/{conversationId}` for audit trail
  - Returns `{ ok: true, messageId, sentAt }`
- Updates `be_recalls/{id}` with: `lineMessageSent: true`, `lineMessageSentAt`, `lineMessageTemplate`, `lineMessageBy`
- Optimistic UI: closes modal immediately + adds "💬 ส่ง LINE" badge to row

### 4.7 Pair link badge (used in all 3 surfaces)

Format (always shows status suffix):
```
🔗 จับคู่กับ: <icon> <reason> · <date dd MMM> · <status-suffix>
```

Status suffix vocabulary:

| Paired recall status | Suffix |
|---|---|
| pending (รอโทร, default) | `· รอ Recall` |
| done | `· เสร็จแล้ว` |
| no-answer (count N) | `· ติดต่อไม่ได้ครั้งที่ N` |
| snoozed (until date) | `· เลื่อนไป <dd MMM>` |
| overdue (not yet handled) | `· เกินกำหนด <N> วัน` |

**Style** (rendered as a clickable chip below the meta line, not inline with name):
- Background: `rgba(99,102,241,0.08)`
- Border: `1px solid rgba(99,102,241,0.25)` + `border-left:2px solid #6366f1`
- Border-radius: 5px
- Padding: 3px 8px
- Font-size: 10px
- Color: `#c4b5fd`
- Components within: 🔗 + "จับคู่กับ:" + slot-icon + bold reason (white) + monospace date in muted color
- Hover: `bg:rgba(99,102,241,0.14) border:rgba(99,102,241,0.4)`
- Click handler:
  - In Backend/Frontend list: scrolls to paired recall row + briefly highlights (yellow flash 1s)
  - In CDV card: same as above (paired recall is in same list)
  - If paired recall is on a different page (Backend pagination): navigate to its page + scroll

**Computed by helper**: `formatPairBadge(pairedRecall)` returns `{ icon, reason, date, statusSuffix, statusColor }` — pure function, testable.

### 4.8 Status colors (shared vocabulary)

| Status | bg | border | text | symbol |
|---|---|---|---|---|
| pending (รอโทร) | rgba(245,158,11,0.10) | rgba(245,158,11,0.35) | #fcd34d | ⏳ |
| done (เสร็จแล้ว) | rgba(16,185,129,0.10) | rgba(16,185,129,0.35) | #6ee7b7 | ✓ |
| no-answer (ติดต่อไม่ได้) | rgba(239,68,68,0.10) | rgba(239,68,68,0.35) | #fca5a5 | 📵 |
| overdue | rgba(239,68,68,0.20) | rgba(239,68,68,0.50) | #fca5a5 | 🚨 (with pulse animation) |
| snoozed | rgba(99,102,241,0.10) | rgba(99,102,241,0.35) | #a5b4fc | 💤 (faded opacity 0.7) |
| auto-suggest (draft) | rgba(20,184,166,0.10) | rgba(20,184,166,0.35) | #5eead4 | 💡 |

## 5. Behavior specification

### 5.1 Slot toggle behavior (modal create)

- Each slot has independent enable/disable toggle
- When toggled OFF: body collapses (200ms transition) + slot data cleared (date + reason + inline-learn flag — but keep it in local state in case user toggles back ON)
- When toggled ON: body expands + auto-suggest fires (if treatment context available)
- Validation: at least 1 slot must be enabled — Save button disabled with banner when both off
- Footer summary "จะสร้าง N recall" updates real-time (N = count of enabled slots)

### 5.2 Date grouping (5 buckets)

Pure helper `groupRecallsByTimeBucket(recalls, todayISO)`:

```js
{
  overdue: [],   // recallDate < today AND status != done AND status != snoozed-active
  today: [],     // recallDate == today (or snoozed-until == today)
  tomorrow: [],  // recallDate == today+1
  thisWeek: [],  // today+2 <= recallDate <= today+7
  later: [],     // recallDate > today+7
}
```

Bangkok-stable midday-UTC parse for date-only comparison (V53 lesson — same pattern as Phase 28 `computeRelativeThaiDateLabel`). Each row carries an effective recall date = `snoozedUntil || recallDate`.

### 5.3 Auto-suggest in modal (pre-fill from master-data)

Auto-suggest is **purely a modal pre-fill behavior** — no background daemon, no auto-created drafts. The system never writes a recall without admin explicitly clicking "บันทึก".

Trigger entry points (all open `RecallCreateModal`):
1. **Backend tab "+ ตั้ง Recall ใหม่" button** — modal opens blank; admin picks customer + product → modal pre-fills slots
2. **Frontend tab "+ ตั้ง Recall ใหม่" button** — same as Backend
3. **CDV Recall card "+ เพิ่ม Recall" button** — modal opens with customer pre-filled
4. **Treatment-history row "+ Recall" quick-action chip** (NEW — added next to existing edit/delete chips on backend-created treatment rows in `TreatmentHistoryRow`) — modal opens with customer + treatment context + product context pre-filled, auto-suggest fires for both slots from product master-data

Auto-suggest pre-fill flow inside modal (entry point 4 — most automatic):
1. Modal opens with `sourceTreatmentId` set
2. Reads the treatment's `treatmentItems[]`
3. For each item with a `productId`, fetches `be_products/{productId}` (already in cache for current customer flow)
4. If `followUpAfterDays` exists → enables Slot 1 + pre-fills date (saveDate + N) + reason from master
5. If `recallAfterDays` exists → enables Slot 2 + pre-fills date + reason from master
6. If neither exists → both slots default to OFF (admin manually toggles + types)
7. Admin can override anything before save

This removes the need for a "review queue" + "draft-suggested" status — every recall is admin-confirmed at creation time.

### 5.4 Inline-learn (save to master-data on recall create)

When admin creates a recall manually (not from auto-suggest) and selects a customer + treatment context (or specifies a product/course):

1. After picking the product/course in the reason field (autocomplete dropdown), system checks `be_products` / `be_courses` for `recallAfterDays` / `followUpAfterDays`
2. If field is missing → show inline-learn checkbox per slot: "💾 บันทึกระยะเวลา N วันลง master-data ของ <product>"
3. If checked: on save, atomic batch:
   - Write `be_recalls/{id}` (the recall itself)
   - Update `be_products/{productId}` with `{recallAfterDays: N, recallReason: "<text>"}` (or `followUpAfterDays` for slot 1)
4. If unchecked: just write the recall, master-data untouched
5. Future recalls for this product → auto-suggest will fire

### 5.5 Outcome state machine

Initial state: `status='pending'`

| From | Action | To | Side effects |
|---|---|---|---|
| pending | "📞 จะมาตามนัด" | done | outcome='will-come', outcomeAt=now, outcomeBy=staff |
| pending | "⏰ ขอเลื่อน" | done | outcome='reschedule', outcomeAt=now + opens snooze date picker → creates new recall |
| pending | "💭 ไม่สนใจ" | done | outcome='not-interested', outcomeAt=now |
| pending | "📵 ติดต่อไม่ได้" | no-answer | outcome='no-answer', outcomeAt=now, snoozedUntil=now+3d, noAnswerCount++ |
| no-answer | "📞 จะมาตามนัด" | done | (same as pending → done) |
| no-answer | "📵 ติดต่อไม่ได้" again | no-answer | snoozedUntil=now+3d, noAnswerCount++. If noAnswerCount >= 3 → requiresManualReview=true |
| done/snoozed | "↻ เปิดใหม่" | pending | requiresManualReview=false |
| any | "⏰ snooze manual" | pending | snoozedUntil=<picked date> |

### 5.6 Real-time refresh (NO FLICKER — critical per user)

**Pattern: Firestore onSnapshot listener + stable React keys + optimistic local mutation**.

**Listener per surface**:
- Backend tab: `listenToRecalls({branchId})` — branch-scoped via `useBranchAwareListener` hook (per Rule L BSA)
- Frontend sub-tab: `listenToRecalls({branchId, dateBefore: today+1})` — only today+overdue
- CDV card: `listenToRecalls({customerId})` — universal (per-customer, see § 6 data model)

**Re-render discipline**:
- Each row keyed by stable `recall.id` (NEVER `index`) — prevents unmount on list reorder
- `useMemo` for derived data (grouping, sorting, filtering) keyed by data version — prevents unnecessary re-compute
- Status chip + outcome callout use simple conditional rendering (no key change) — DOM stable
- Optimistic mutation: when admin saves, immediately add to local state with `status='pending'` (or update existing row); listener confirms within ~100ms; if listener returns DIFFERENT shape, second update is silent (already there)

**Cross-surface real-time**:
- Create recall in CDV modal → `be_recalls/{id}` written → Backend tab listener fires + Frontend listener fires + CDV card listener fires (same customer) → all 3 surfaces show new row
- Update outcome in Backend → listener fires across all surfaces showing this recall → status chip flips, outcome callout appears, no flicker
- Verified test: Open CDV in tab A + Backend Recall in tab B → create in A → row appears in B within 100ms WITHOUT page refresh

**Anti-flicker checks**:
- No `<Suspense>` or `<Skeleton>` swaps mid-state — only on initial mount
- No `key={Date.now()}` patterns anywhere
- Modal close → list re-render uses same component instance (modal is portal'd outside list)
- Hover state preserved via CSS-only (no React hover state that triggers re-render)

### 5.7 Auto-snooze on no-answer

- "📵 ติดต่อไม่ได้" outcome → `snoozedUntil = now + 3 days` (configurable in `clinic_settings.recallAutoSnoozeDays` default 3)
- Recall reappears in "วันนี้" section on the snooze date
- `noAnswerCount` increments
- After 3 consecutive no-answers (`noAnswerCount >= 3`):
  - Set `requiresManualReview = true`
  - Show in special "🚨 ต้องตรวจสอบด้วยตนเอง" sub-section within "เกินกำหนด" bucket
  - Admin must take action (manually pick a new date OR mark as 'closed-no-answer' status)

### 5.8 Snooze (manual)

- ⏰ button on row → opens compact date picker
- Pick a date → `snoozedUntil = <picked>` + status remains `pending`
- Effective recall date = `snoozedUntil || recallDate`
- Snoozed rows in current view fade to opacity 0.7 + show snoozed chip
- After snooze date passes → row appears in regular section based on snoozed-until-date

### 5.9 LINE template send flow

1. 💬 button visible only if `customer.lineUserId` exists
2. Click → RecallLineTemplateModal opens
3. Admin selects 1 of 3 templates (or custom)
4. Template variables pre-rendered with customer + recall data
5. Click "📤 ส่งข้อความ":
   - POST `/api/admin/line-send-recall` with `{ recallId, customerLineUserId, templateText }`
   - Server: validates admin token, reads chat_config, sends LINE Push API
   - On success: appends system message to `chat_conversations/{conversationId}` for audit (preserves V32-tris-ter pattern)
   - Returns `{ ok: true, messageId, sentAt }`
6. Updates `be_recalls/{id}` with `lineMessageSent: true`, `lineMessageSentAt`, `lineMessageTemplate`, `lineMessageBy`
7. Optimistic UI: modal closes + row gets new "💬 ส่ง LINE" badge

### 5.10 Empty / loading / error states

- **Empty (no recalls)**: centered icon + "ไม่มี Recall — กดปุ่ม + เพื่อเพิ่ม"
- **Loading (initial mount)**: skeleton rows for ~200ms (then real data via listener)
- **Error (listener failed)**: error banner at top "โหลด Recall ไม่สำเร็จ — รีโหลดหน้า" + retry button
- **No customer LINE**: 💬 button HIDDEN (not disabled) — only shows when `lineUserId` present

## 6. Data model — `be_recalls` collection

**Path**: `artifacts/{APP_ID}/public/data/be_recalls/{recallId}`

**Branch-scoped** (per BSA Rule L) — has `branchId` field, listed via branch-scoped lister + `useBranchAwareListener` for live subscriptions.

**Doc shape**:

```js
{
  id: 'RECALL-{ts}-{rand}',
  branchId: '<branch-id>',          // BSA per Rule L
  customerId: 'LC-{N}',
  customerName: 'นาย ___',          // denormalized for list rendering
  customerPhone: '081-...',         // denormalized
  customerLineUserId: 'U_xxx' | null, // denormalized (nullable — null = no LINE)
  customerHN: 'HN_xxx' | null,      // denormalized
  
  // Slot identity
  slotType: 'aftercare' | 'revisit',
  
  // Source (where this recall came from)
  source: 'manual' | 'from-treatment-row',
  sourceTreatmentId: 'BT-...' | null, // if from treatment context
  sourceProductId: '<id>' | null,
  sourceProductName: '<name>' | null, // denormalized
  sourceCourseId: '<id>' | null,
  sourceCourseName: '<name>' | null,  // denormalized
  
  // Schedule
  recallDate: 'YYYY-MM-DD',        // canonical date (Bangkok)
  reason: '<text>',                // user-editable reason
  snoozedUntil: 'YYYY-MM-DD' | null, // overrides recallDate when present
  
  // Pairing
  pairedRecallId: '<id>' | null,    // cross-link (set on both ends when paired)
  
  // Lifecycle
  status: 'pending' | 'done' | 'no-answer' | 'closed-no-answer',
  outcome: 'will-come' | 'reschedule' | 'not-interested' | 'no-answer' | null,
  outcomeNote: '<text>' | null,
  outcomeAt: <timestamp> | null,
  outcomeBy: { uid, name, role } | null,
  
  // No-answer escalation
  noAnswerCount: 0,
  requiresManualReview: false,
  
  // LINE messaging (optional)
  lineMessageSent: false,
  lineMessageSentAt: <timestamp> | null,
  lineMessageTemplate: 'recall-default' | 'aftercare-followup' | 'custom' | null,
  lineMessageText: '<rendered text>' | null, // what was actually sent
  lineMessageBy: { uid, name, role } | null,
  
  // Audit
  createdAt: <serverTimestamp>,
  createdBy: { uid, name, role },
  updatedAt: <serverTimestamp>,
  updatedBy: { uid, name, role },
}
```

**Indexes** (firestore.indexes.json):
- `(branchId, recallDate)` for date-grouped queries
- `(branchId, status)` for status filter
- `(customerId, recallDate)` for CDV card
- `(branchId, status, snoozedUntil)` for "today" bucket including snoozed

**Master-data extension** — `be_products` + `be_courses` get 4 new optional fields:

```js
{
  // ...existing fields,
  followUpAfterDays: <number> | null, // slot 1 default (e.g. 1 for filler aftercare)
  followUpReason: '<text>' | null,    // slot 1 default reason
  recallAfterDays: <number> | null,   // slot 2 default (e.g. 180 for filler)
  recallReason: '<text>' | null,      // slot 2 default reason
}
```

All 4 fields independently optional. ProductFormModal + CourseFormModal get a new "Recall settings" section with 2 sub-cards (one per slot).

## 7. Component architecture

```
src/components/backend/recall/
├── RecallTab.jsx                    (top-level — Backend tab body)
├── RecallHeader.jsx                 (title + count + search + filter + create-btn)
├── RecallList.jsx                   (date-grouped sections + bucket logic)
├── RecallSectionHeader.jsx          (per-bucket header with title + count)
├── RecallRow.jsx                    (single recall row — used in all 3 surfaces)
├── RecallPairBadge.jsx              (pair link badge with status suffix)
├── RecallCreateModal.jsx            (2-slot modal create/edit)
├── RecallSlotCard.jsx               (single slot inside RecallCreateModal)
├── RecallOutcomeModal.jsx           (4-category outcome record)
├── RecallLineTemplateModal.jsx      (LINE template send modal)
├── RecallSnoozeMenu.jsx             (compact date picker for snooze)
└── RecallEmptyState.jsx             (shared empty card)

src/components/backend/treatment-history/
└── (Phase 28 components — no changes needed for Phase 29; CDV card is its own component)

src/components/backend/CustomerDetailView.jsx
└── (modified — add <RecallCard customerId={customer.id} /> next to appointments card)

src/components/backend/customer-recall/
└── RecallCard.jsx                   (CDV card — shorter version of RecallList for one customer)

src/lib/recallResolvers.js           (NEW — pure helpers)
├── groupRecallsByTimeBucket(recalls, todayISO) → { overdue, today, tomorrow, thisWeek, later }
├── getRecallStatusLabel(recall) → string
├── getRecallStatusColor(recall) → { bg, border, text }
├── getEffectiveRecallDate(recall) → 'YYYY-MM-DD' (snoozedUntil || recallDate)
├── computeDaysFromToday(targetDate, todayISO) → number (negative = past)
├── formatDaysFromTodayLabel(N) → string ("90 วัน (3 เดือน)" / "184 วัน (~6 เดือน)" / "เกิน 2 วัน" / etc.)
├── formatPairBadge(pairedRecall, todayISO) → { icon, reason, date, statusSuffix }
├── shouldShowAutoSnooze(outcome) → boolean
├── computeAutoSnoozeUntil(now, days=3) → 'YYYY-MM-DD'
├── shouldFlagManualReview(noAnswerCount, threshold=3) → boolean
└── isOverdue(recall, todayISO) → boolean

src/lib/recallValidation.js          (NEW)
├── validateRecallSlot(slot) → { ok, errors }
├── validateRecallCreate(payload) → { ok, errors } (≥1 slot enabled)
└── normalizeRecallSlot(slot) → cleaned slot

src/lib/lineTemplateRenderer.js      (NEW)
├── renderTemplate(templateText, vars) → string (substitutes {ชื่อ} / {เรื่อง} / etc.)
├── DEFAULT_RECALL_TEMPLATES (frozen array of 3 templates)
└── getRecallTemplateVariables(recall, customer) → { ชื่อ, เรื่อง, วันที่, ... }

src/lib/backendClient.js             (extended)
├── listRecalls({branchId, ...filters}) → Promise<Recall[]>
├── listRecallsForCustomer(customerId) → Promise<Recall[]> (universal — no branch)
├── listenToRecalls({branchId, ...filters}, onChange, onError) → unsubscribe
├── listenToRecallsForCustomer(customerId, onChange, onError) → unsubscribe
├── createRecall(payload) → Promise<{id}>
├── createRecallPair(slot1, slot2) → Promise<{id1, id2}> (atomic batch with pairedRecallId cross-link)
├── updateRecall(id, patch) → Promise<void>
├── recordRecallOutcome(id, outcomeData) → Promise<void>
├── recordRecallLineSend(id, lineData) → Promise<void>
└── snoozeRecall(id, untilDate) → Promise<void>

src/hooks/useRecallListener.js       (NEW — wraps useBranchAwareListener for be_recalls)

src/components/backend/nav/navConfig.js
└── (modified — add 'recall' tab in appointments-section after 'appointment-walk-in')

src/pages/AdminDashboard.jsx
└── (modified — add 3-state view-toggle pill 'รายการ / Recall / ปฏิทิน' + render RecallList when recall mode)

src/components/backend/ProductFormModal.jsx + CourseFormModal.jsx
└── (modified — add "Recall settings" section with 2 sub-cards)

api/admin/line-send-recall.js        (NEW — server endpoint)
└── (admin-gated; uses firebase-admin to read chat_config + LINE Push API + chat_conversations append)

firestore.rules
└── (extended — be_recalls allow read/write: if isClinicStaff() — branch-scoped per BSA defense in depth at app layer)

firestore.indexes.json
└── (extended — 4 new composite indexes per § 6)
```

Net new files: ~16. Modified existing: ~7 (added: TreatmentHistoryRow.jsx for the "+ Recall" quick-action chip — Phase 28 component). Plan estimates ~12-14 commits across implementation tasks.

## 8. Files to touch (full list)

### New files (18)

**Components** (12 in `src/components/backend/recall/` + 1 in `src/components/backend/customer-recall/`):
- RecallTab.jsx, RecallHeader.jsx, RecallList.jsx, RecallSectionHeader.jsx, RecallRow.jsx, RecallPairBadge.jsx, RecallCreateModal.jsx, RecallSlotCard.jsx, RecallOutcomeModal.jsx, RecallLineTemplateModal.jsx, RecallSnoozeMenu.jsx, RecallEmptyState.jsx
- customer-recall/RecallCard.jsx

**Helpers** (3):
- src/lib/recallResolvers.js
- src/lib/recallValidation.js
- src/lib/lineTemplateRenderer.js

**Hook** (1):
- src/hooks/useRecallListener.js

**Server endpoint** (1):
- api/admin/line-send-recall.js

### Modified files (~12)

- `src/lib/backendClient.js` — add ~9 functions (listRecalls / listRecallsForCustomer / listenToRecalls / listenToRecallsForCustomer / createRecall / createRecallPair / updateRecall / recordRecallOutcome / recordRecallLineSend / snoozeRecall)
- `src/lib/scopedDataLayer.js` — re-export branch-scoped versions per Rule L
- `src/components/backend/nav/navConfig.js` — add `recall` tab
- `src/pages/BackendDashboard.jsx` — lazy-import RecallTab + render case `'recall'`
- `src/pages/AdminDashboard.jsx` — extend appointment view-toggle to 3 states + render RecallList when recall mode
- `src/components/backend/CustomerDetailView.jsx` — render `<RecallCard customerId={customer.id} />` next to appointments card
- `src/components/backend/treatment-history/TreatmentHistoryRow.jsx` — add "+ Recall" quick-action chip (next to existing edit/delete) on backend-created treatment rows; opens RecallCreateModal pre-filled with customer + treatment context (Phase 28 component extension)
- `src/components/backend/ProductFormModal.jsx` — add "Recall settings" section with 2 sub-cards
- `src/components/backend/CourseFormModal.jsx` — same
- `src/lib/productValidation.js` + `src/lib/courseValidation.js` — accept new master-data fields
- `firestore.rules` — add `be_recalls/{recallId}` allow read/write for clinic staff
- `firestore.indexes.json` — 4 new composite indexes

### Tests to create (per § 9 — heavy emphasis)

See § 9 for full test list (estimated 10 new test files, ~250+ assertions).

## 9. Test strategy — HEAVY EMPHASIS per user directive

User said: "เขียน e2e test flow logic ให้ครบคลอบคลุมก่อนปล่อยออกมาให้ผมได้ลอง เขียนจับผิดตัวเอง stimulate แบบใช้จริง พยายามทำให้มันพังทำให้มันบั๊คดู tolerance และ stability และที่สำคัญเลย ดู flow ว่าเป็นไปตามที่ผมบอกไหม"

This section is intentionally exhaustive. Every scenario the user described in chat MUST have at least one test asserting the contract. Tests are organized into 6 layers (per V55 brutal-pre-deploy methodology):

### Layer 1 — Pure helper unit tests

`tests/phase-29-recall-resolvers.test.js` — ~50 assertions
- R1.x `groupRecallsByTimeBucket` — 5 buckets correct, snoozedUntil overrides recallDate, empty input → empty buckets, Bangkok TZ stable (R4-style midday-UTC)
- R2.x `getRecallStatusLabel` — 6 status labels exact Thai strings
- R3.x `getRecallStatusColor` — color map per status returns correct rgb
- R4.x `computeDaysFromToday` — past dates negative, future positive, today=0, Bangkok TZ stable
- R5.x `formatDaysFromTodayLabel` — "เกิน 2 วัน" / "วันนี้" / "พรุ่งนี้" / "90 วัน (3 เดือน)" / "184 วัน (~6 เดือน)" / "1 ปี" boundaries
- R6.x `formatPairBadge` — all 5 status suffixes exact format, slot icon right per type, date format dd MMM
- R7.x `getEffectiveRecallDate` — snoozedUntil takes precedence, falsy snoozed → recallDate
- R8.x `shouldShowAutoSnooze` + `computeAutoSnoozeUntil` + `shouldFlagManualReview` — boundary at 3
- R9.x `isOverdue` — recallDate < today AND not done, Bangkok TZ stable

`tests/phase-29-recall-validation.test.js` — ~25 assertions
- V1.x `validateRecallSlot` — empty date / past date / no reason / valid → ok
- V2.x `validateRecallCreate` — both slots off → fails, only slot 1 → ok, only slot 2 → ok, both on → ok
- V3.x `normalizeRecallSlot` — strips empty fields, defaults date format
- V4.x — adversarial: null / undefined / mixed-case date strings / Thai-edge year (พ.ศ. ↔ ค.ศ. confusion guard)

`tests/phase-29-line-template-renderer.test.js` — ~20 assertions
- L1.x `renderTemplate` — simple sub, multi-var, missing var → empty replace, no variable → string unchanged
- L2.x `DEFAULT_RECALL_TEMPLATES` — 3 templates, exact Thai text, all required vars present
- L3.x `getRecallTemplateVariables` — extracts correct fields from recall + customer, handles null lineUserId

### Layer 2 — RTL component tests (per surface)

`tests/phase-29-recall-row-rtl.test.jsx` — ~30 assertions
- Row.1 renders time + name + reason + status chip + actions
- Row.2 LINE button hidden when no `lineUserId`
- Row.3 LINE button visible when `lineUserId` present
- Row.4 outcome callout shows when status='done'
- Row.5 pair badge renders with full format + status suffix per the 5 cases
- Row.6 click body opens detail modal (mock); click action chips DOES NOT open detail (e.stopPropagation)
- Row.7 snoozed row has fade opacity 0.7 + snooze chip
- Row.8 overdue row has pulse animation class
- Row.9 graceful render with null/missing fields

`tests/phase-29-recall-create-modal-rtl.test.jsx` — ~40 assertions
- M1.x slot toggle on/off shows/hides body
- M2.x date input → days-from-now badge updates real-time
- M3.x both slots off → save button disabled + validation banner shows
- M4.x slot 1 only → save creates 1 recall (fetch mock asserts call count 1)
- M5.x both slots on → save creates 2 paired recalls (fetch mock asserts 2 docs + pairedRecallId set)
- M6.x auto-suggest hint shows when master has the field; hidden otherwise
- M7.x inline-learn checkbox shows when master is missing the field; click + save → master-data PATCH happens (fetch mock asserts)
- M8.x footer summary "จะสร้าง 1 recall" / "จะสร้าง 2 recall" updates real-time
- M9.x customer header renders correctly with LINE badge when linked
- M10.x ESC closes modal; backdrop click closes modal
- M11.x edit mode (existing recall) pre-fills both slots if both exist

`tests/phase-29-recall-outcome-modal-rtl.test.jsx` — ~25 assertions
- O1.x renders 4 outcome cards with exact Thai labels
- O2.x select "📵 ติดต่อไม่ได้" shows auto-snooze hint
- O3.x save with "📞 จะมาตามนัด" → updates recall status='done' + outcome='will-come'
- O4.x save with "📵 ติดต่อไม่ได้" → status='no-answer' + snoozedUntil=now+3d + noAnswerCount++
- O5.x save with no-answer when count >= 2 → next save sets requiresManualReview=true
- O6.x textarea note appears in outcomeNote field

`tests/phase-29-recall-line-template-modal-rtl.test.jsx` — ~20 assertions
- LT1.x renders 3 template cards
- LT2.x preview shows below template selection with rendered variables
- LT3.x send button disabled when no template selected
- LT4.x click send → POST to /api/admin/line-send-recall with correct payload
- LT5.x success → modal closes + row badge "💬 ส่ง LINE" appears
- LT6.x failure → error toast + modal stays open
- LT7.x custom template option opens textarea

`tests/phase-29-recall-tab-rtl.test.jsx` — ~25 assertions
- T1.x 5-section render (overdue/today/tomorrow/thisWeek/later)
- T2.x empty section hidden
- T3.x search filters by name/HN/reason
- T4.x filter chip "วันนี้" hides other sections
- T5.x "+ ตั้ง Recall ใหม่" opens RecallCreateModal (blank)
- T5b.x "+ Recall" chip on Phase 28 treatment-history row opens RecallCreateModal pre-filled with customer + treatment context + auto-suggest from product master-data
- T7.x click row body opens detail modal
- T8.x branch switch via BranchSelector → list re-fetches (BSA per Rule L)

`tests/phase-29-recall-frontend-tab-rtl.test.jsx` — ~15 assertions
- F1.x view-toggle pill renders 3 states (รายการ / Recall / ปฏิทิน)
- F2.x recall mode shows ONLY overdue + today sections
- F3.x tab badge shows count = pending + overdue
- F4.x "+ ตั้ง Recall ใหม่" opens RecallCreateModal
- F5.x footer hint "ดู recall อนาคต → Backend"

`tests/phase-29-recall-cdv-card-rtl.test.jsx` — ~20 assertions
- CDV1.x renders card with header pattern matching appointment card
- CDV2.x lists this customer's recalls only
- CDV3.x "+ เพิ่ม Recall" opens modal pre-filled with customerId
- CDV4.x "📋 ดูทั้งหมด" opens RecallListModal filtered to this customer
- CDV5.x footer hint shows when customer has historical recalls
- CDV6.x empty state when customer has 0 recalls
- CDV7.x rows show pair badge correctly

### Layer 3 — Source-grep regression tests

`tests/phase-29-recall-source-grep.test.js` — ~25 assertions
- SG1.x All 3 surfaces import shared `RecallRow` component (DRY enforcement)
- SG2.x All 3 surfaces use `useRecallListener` hook (real-time discipline)
- SG3.x No surface uses `key={index}` for recall rows (anti-flicker)
- SG4.x No surface uses `key={Date.now()}` anywhere
- SG5.x `RecallCreateModal` validation enforces ≥1 slot (specific assertion)
- SG6.x Auto-snooze 3-day default sourced from constant (not magic number)
- SG7.x LINE template renderer used for all template substitution (DRY)
- SG8.x `formatPairBadge` used by pair-badge component (DRY)
- SG9.x `RecallTab` registered in navConfig under appointments-section
- SG10.x BSA: be_recalls listed via branch-aware lister for Backend tab + Frontend tab (BSA Rule L). CDV per-customer listener (`listenToRecallsForCustomer`) is sanctioned exception (universal — filter by customerId regardless of branch, mirrors existing be_appointments per-customer pattern)
- SG11.x No `RecallAutoSuggestBanner` / `RecallSuggestReviewModal` / `'draft-suggested'` status anywhere (auto-suggest is modal pre-fill only — verifies the spec § 5.3 simplification didn't drift back)
- SG12.x Phase 29 marker comments in all new files

### Layer 4 — Rule I full-flow simulate

`tests/phase-29-recall-flow-simulate.test.jsx` — ~30 assertions
Realistic 8-recall fixture (mixed slots, pairs, statuses):
```js
const FIXTURE = [
  // Pair 1 — filler 14 พ.ค. — slot 1 done, slot 2 pending
  { id: 'R1', slotType: 'aftercare', recallDate: '2026-05-15', status: 'done', pairedRecallId: 'R2', ... },
  { id: 'R2', slotType: 'revisit', recallDate: '2026-11-14', status: 'pending', pairedRecallId: 'R1', ... },
  // Pair 2 — botox — both pending
  { id: 'R3', slotType: 'aftercare', recallDate: '2026-05-14', status: 'pending', pairedRecallId: 'R4', ... },
  { id: 'R4', slotType: 'revisit', recallDate: '2026-09-14', status: 'pending', pairedRecallId: 'R3', ... },
  // Single — circumcision aftercare only
  { id: 'R5', slotType: 'aftercare', recallDate: '2026-05-15', status: 'pending', pairedRecallId: null, ... },
  // Overdue
  { id: 'R6', slotType: 'revisit', recallDate: '2026-05-12', status: 'pending', pairedRecallId: null, ... },
  // No-answer cycle
  { id: 'R7', slotType: 'revisit', recallDate: '2026-05-10', status: 'no-answer', noAnswerCount: 2, snoozedUntil: '2026-05-13', ... },
  // Snoozed manually
  { id: 'R8', slotType: 'revisit', recallDate: '2026-05-08', status: 'pending', snoozedUntil: '2026-05-22', ... },
];
```
- F1.x bucket grouping correct: overdue=[R6,R7], today=[R3], tomorrow=[R1,R5], thisWeek=[], later=[R2,R4,R8]
- F2.x click R3 row → opens detail modal (mock); detail shows full recall + paired link to R4
- F3.x outcome modal save "📞 จะมาตามนัด" on R3 → R3 status='done' immediately (optimistic) + listener confirms within 100ms (mock listener fires)
- F4.x R5 (single, no pair) shows NO pair badge
- F5.x R1 pair badge shows "🔗 จับคู่กับ: 📅 ฟิลเลอร์ครบ 6 เดือน · 14 พ.ย. · รอ Recall"
- F6.x R2 pair badge shows "🔗 จับคู่กับ: 🩹 ติดตามอาการหลังฉีดฟิลเลอร์ · 15 พ.ค. · เสร็จแล้ว"
- F7.x R7 (no-answer count 2) — 3rd save with no-answer → requiresManualReview=true + appears in special sub-section
- F8.x Snooze date passes (advance fixture today) → R8 moves from later → today bucket
- F9.x Filter "วันนี้" → only R3 remains visible
- F10.x Search "ฟิลเลอร์" → R1, R2 visible

### Layer 5 — Multi-surface real-time integration tests (CRITICAL per user)

`tests/phase-29-recall-multi-surface-realtime.test.jsx` — ~25 assertions
- MS1.x Mount Backend RecallTab + CDV RecallCard (same customer) in 1 test → create recall via mocked listener event → BOTH surfaces re-render with new row WITHIN 100ms (verified via waitFor)
- MS2.x Update outcome via mocked listener event → BOTH surfaces show updated status chip + outcome callout (no flicker — verified via React Testing Library's `getByTestId` reference stability across renders)
- MS3.x Delete recall via mocked listener event → BOTH surfaces remove the row (no error)
- MS4.x Frontend tab + Backend tab + CDV card all listen to same data → 3 simultaneous updates after 1 mutation
- MS5.x Branch switch (mocked) → branch-scoped surfaces re-fetch + show new branch's data; CDV (universal) unchanged
- MS6.x Optimistic update: save modal → row appears in local state IMMEDIATELY (before listener fires) → listener confirms within 100ms with same shape (no double-render)
- MS7.x Listener returns DIFFERENT shape (server transformed) → second update is silent (existing row's data merged, no row re-key)
- MS8.x Anti-flicker: assert that `useRecallListener` hook does NOT cause unmount during mutation cycle (use React DevTools profiler in test mode)
- MS9.x List key stability: assert `key={recall.id}` (not index) via source-grep + runtime verification
- MS10.x Modal close → list re-render uses same component instance (NOT re-mount)

### Layer 6 — Adversarial / property-based tests

`tests/phase-29-recall-adversarial.test.js` — ~30 assertions
- ADV1.x Empty recall list — every surface renders empty state without throw
- ADV2.x Recall with null `pairedRecallId` — pair badge NOT rendered
- ADV3.x Pair recall where paired ID points to deleted recall — pair badge shows "📅 (รายการถูกลบ)" gracefully
- ADV4.x Pair recall pointing across customers (data inconsistency) — pair badge renders with warning indicator
- ADV5.x Recall with snoozedUntil before recallDate (malformed) — uses recallDate as effective
- ADV6.x Recall with future recallDate but status='done' — renders in done section, no overdue trigger
- ADV7.x Bangkok TZ edge: recallDate = '2026-12-31' viewed from machine in UTC — bucket assignment correct
- ADV8.x Property-based via fast-check (mulberry32 PRNG seed 42, 100 iterations): generate random recall + verify groupRecallsByTimeBucket invariant (sum of bucket sizes = input size)
- ADV9.x Long Thai customer name (50+ chars) — list row truncates with ellipsis, no overflow
- ADV10.x noAnswerCount=999 — requiresManualReview=true, no overflow
- ADV11.x recallDate in 2099 — formatDaysFromTodayLabel returns "73 ปี" gracefully (no crash)
- ADV12.x Concurrent mutation: 2 outcomes saved within 50ms — final state matches LATER write (Firestore last-write-wins)
- ADV13.x LINE send to customer with stale lineUserId (LINE returns 400) — error toast, recall NOT marked sent
- ADV14.x 1000 recalls in list — render time < 500ms (perf budget; soft warning if exceeded)
- ADV15.x Validation: slot 1 enabled with slot 2 disabled but slot 2 has data → save IGNORES slot 2 data (only enabled slots persist)

### Layer 7 — Live admin-SDK e2e (real prod, optional / dry-run by default)

`scripts/phase-29-recall-e2e-real-prod.mjs` (NEW — invocation-guarded per Rule M)
- Creates 5 TEST-RECALL- prefixed fixtures on production Firestore via firebase-admin
- Verifies real-time listener fires for each create/update/delete
- Cleanup at end (deletes all TEST- prefixed fixtures)
- Runs in dry-run by default; `--apply` to actually write
- Used as final verification gate before production deploy (Task 12 of plan)

### Layer 8 — Live preview verification (per Rule I item b)

Mandatory before commit-claim-done. Use mcp Preview tool:
1. Open dev server, navigate to backend/recall + frontend/recall + CDV for a real customer (LC-26000006 or similar)
2. Create a new recall in CDV modal → verify it appears in:
   - Backend tab Recall (within 100ms, no flicker)
   - Frontend tab badge count + body
   - CDV card itself
3. Update outcome → verify status chip changes across all 3 surfaces simultaneously
4. Test light theme + mobile viewport (375x812)
5. Verify console errors = 0 new

### Test count budget

| Layer | File count | Assertions |
|---|---|---|
| 1 — pure helpers | 3 | ~95 |
| 2 — RTL components | 6 | ~155 |
| 3 — source-grep | 1 | ~27 |
| 4 — flow simulate | 1 | ~30 |
| 5 — multi-surface real-time | 1 | ~25 |
| 6 — adversarial | 1 | ~30 |
| Total new | **13 files** | **~362 assertions** |

Plus V21 fixups for any existing tests that break from CDV.jsx receiving the new Recall card (estimated 3-5 fixups).

## 10. Risks + mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Real-time listener storms with 100+ recalls per branch | Medium | Listener queries indexed `(branchId, recallDate)` + limited to 60 days window; pagination beyond that. Verified with 1000-row stress test (ADV14) |
| Optimistic update mismatched with server response (duplicate row temporarily) | Medium | Use stable `recall.id` as key + merge strategy in local state; if server returns transformed shape, second update is silent merge. MS6 + MS7 tests lock this |
| Anti-flicker requirement broken by future code changes | High | Source-grep tests SG3 + SG4 enforce no `key={index}` / `key={Date.now()}`; multi-surface integration test MS8 + MS10 explicitly assert no unmount. CI fails if violated |
| LINE send to customer who unlinked LINE since last sync | Low | API call returns error from LINE → toast shown + recall NOT marked sent. ADV13 covers this |
| Pair badge points to deleted recall (data inconsistency) | Medium | Renders gracefully with "(รายการถูกลบ)" hint per ADV3. No crash. Future cleanup script can purge orphan pairs |
| Auto-snooze creates infinite no-answer cycle | Low | requiresManualReview flag at noAnswerCount >= 3 prevents indefinite cycling. ADV3 + O5 tests lock this |
| Performance with 100+ recalls in CDV card | Medium | CDV card limits to most recent 5 + "ดูทั้งหมด" link. Footer hint shows total count. Full list in modal (paginated) |
| New collection rules breaking probe-deploy-probe | Low | Rule B Probe-Deploy-Probe applies; add be_recalls write probe to deploy checklist if rules change |
| Master-data fields breaking ProductFormModal/CourseFormModal existing tests | Medium | V21 fixups planned (Task 11 of writing-plans); new fields are additive (existing data unaffected — null fields = no auto-suggest) |
| Inline-learn race: 2 admins create recall for same product simultaneously, both check inline-learn | Low | Last-write-wins on master-data field (Firestore semantics) — both writes complete, last value persists. Acceptable since recallAfterDays is a customizable default, not strict business rule |

## 11. Out of scope (Phase 29+)

- Bulk-call workflow (originally Q1 option C — explicit deferred)
- Auto-reschedule on no-answer (originally Q1 option C — replaced by simpler auto-snooze 3 days)
- Recall analytics tab (conversion rate / avg-call-attempts) — Q1 option C
- Per-branch rule overrides (e.g. branch X uses different filler interval) — Q1 option C
- Bulk CSV import of recalls — Q1 option C
- Editing LINE templates UI in LineSettingsTab — defaults ship hardcoded; admin can request UI later
- Editing recall reason directly inline (without modal) — out of scope; modal opens for any edit
- Drag-and-drop reordering — out of scope (date is the natural order)
- Calendar view of recalls — date-grouped list serves the same purpose; calendar would duplicate
- Email recall reminders — explicitly out (user said "ไม่ต้องมีระบบรับส่งเมล" in V32-tris-bis context)

## 12. Migration / rollout

- Pure additive — no schema migration of existing data
- New collection `be_recalls` starts empty
- New fields on `be_products` + `be_courses` are nullable; existing docs unaffected (`recallAfterDays === undefined` → no auto-suggest)
- `firestore.rules` extended (be_recalls read/write for clinic staff) — REQUIRES Probe-Deploy-Probe per Rule B
- New composite indexes — Firebase auto-builds on first query (or pre-deployed via firestore.indexes.json)
- No customer-facing change (recall is admin-only)
- Combined deploy: `vercel --prod` + `firebase deploy --only firestore:rules,firestore:indexes` (note: indexes are part of the same deploy command)

## 13. Verification before commit (Rule N + Rule I + V18)

1. Targeted test runs per task (Rule N): `npm test -- --run tests/phase-29-*` — all green
2. Build clean: `npm run build` — BackendDashboard chunk delta budget +20 KB (acceptable for 16+ new components)
3. Audit `audit-branch-scope`: 95+/95+ green (be_recalls correctly branch-scoped)
4. Live preview verification (Rule I item b): real prod data on LC-26000006 — create recall → 3 surfaces update simultaneously without flicker
5. Stress test ADV14 — 1000 rows render < 500ms
6. Final full vitest at end of batch — green
7. e2e script Phase 29 dry-run on real prod — passes
8. Combined V15 deploy authorization required from user (V18 — explicit "deploy" THIS turn)

## 14. Lessons / institutional memory

This spec deliberately specs heavy testing because user said "เขียนจับผิดตัวเอง stimulate แบบใช้จริง พยายามทำให้มันพังทำให้มันบั๊คดู". The 6-layer test methodology (helper unit / RTL / source-grep / flow simulate / multi-surface real-time / adversarial) mirrors the V55 brutal-pre-deploy methodology that shipped successfully. Multi-surface real-time tests (Layer 5) are NEW for this spec and are the most novel layer — they're critical because Phase 29 is the FIRST feature with 3 simultaneous Firestore listener surfaces driven by the same data.

Real-time refresh discipline (no flicker) is the most fragile property. Source-grep tests SG3+SG4 are the architectural backstop. Future Phase reviewers must NOT relax these without understanding the consequences.

If Phase 29 ships and admin reports "list flickers when X happens", the bug is class-of-bug "key instability" or "useEffect dep churn" — investigate listener setup + memo deps before component logic.

---

## Approval

- Brainstorming Q1-Q4 + 2-round + pair-label-with-status — APPROVED by user 2026-05-14
- Spec self-review — pending (next step)
- User spec review — pending (after self-review)
- Transition to writing-plans — pending (after user review)
