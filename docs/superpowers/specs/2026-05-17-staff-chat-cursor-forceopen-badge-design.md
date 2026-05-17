# Staff Chat — Persistent Read Cursor + Force-Open Until Read + Role Badges

**Date**: 2026-05-17 (post-V81-fix7b session)
**Tag**: V82 (next available V-letter)
**Spec authors**: Claude + user brainstorming session

---

## Background

V73 (2026-05-17) shipped the staff-chat widget — a floating FB-style chat for
in-branch coordination, scoped per-branch via BSA. V73-L1 (AV51, 2026-05-18)
hardened error surfacing.

This spec addresses 3 related concerns reported by user 2026-05-17 EOD+2 LATE+4
after V81-fix7b deploy:

1. **Bug**: switching between tabs / Frontend ↔ Backend causes previously-read
   chats to flip back to "unread", badge count grows, notification sound replays
   every time. Same device, same name, same color — but stateful read tracking
   is wiped.

2. **Feature — Force-Open Until Read**: when chat has unread messages, the
   widget must refuse to collapse. Auto-expand on new message. Stays open until
   user has read everything.

3. **Feature — Role Badges**: 4 role badges (แพทย์ / ผู้ช่วยแพทย์ / พนักงาน /
   ผู้จัดการ) selectable in the NamePicker alongside name + color, displayed in
   chat bubbles under sender name.

Bugs #1 and Feature #1 share the same architectural piece (persistent read
cursor); Feature #3 is independent visual addition.

---

## Design Decisions (brainstorming Q-locks)

| Q | Decision | Rationale |
|---|---|---|
| Q1 — "read" semantic for force-open | **B. Scroll-to-bottom = read** | Matches Slack/Discord/Messenger mental model; gives reliable signal the user actually saw the latest |
| Q2 — cursor persistence | **A. localStorage per (deviceId, branchId)** | Staff chat is per-device by design; localStorage matches; zero Firestore traffic; one key per branch handles branch-switch case |
| Q3 — badge visual style | **B. Colored circle (role-tinted gradient)** | Most memorable; per-role color survives even with user's color-picker bubble accent; matches existing app aesthetic |
| Q4 (a) — first-load default | **Cursor = `Date.now()`** | Silent backlog on first-ever load — no 50 unread / 50 noti sounds on first open |
| Q4 (b) — scroll-up while force-open | **Minimize disabled with tooltip** | Admin can re-read history freely; minimize unlocks only when cursor reaches latest |
| Q4 (c) — badge required | **Optional** | Admin can leave blank; persists on selection; legacy messages without badge render cleanly |

---

## Architecture

### 1. Read Cursor Module (NEW)

**File**: `src/lib/staffChatReadCursor.js` (~80 LOC, pure JS, no imports beyond
crypto/window)

**Shape**:
```js
// localStorage key: staffChat:cursor:{branchId}
type Cursor = {
  lastReadId: string;          // message doc id
  lastReadCreatedAtMs: number; // ms epoch — primary comparator
  updatedAt: number;           // ms epoch — when cursor was last advanced
};
```

**API**:
```js
export function getCursor(branchId: string): Cursor | null
export function setCursor(branchId: string, partial: Partial<Cursor>): void
export function isMessageUnread(message, cursor, selfDeviceId): boolean
   // true iff message.createdAt > cursor.lastReadCreatedAtMs
   //   AND message.deviceId !== selfDeviceId
   // returns false if cursor === null (caller must call initCursorIfMissing first)
export function initCursorIfMissing(branchId: string, latestCreatedAtMs: number): Cursor
   // First-mount default: if cursor absent, set to { lastReadCreatedAtMs: latestCreatedAtMs }
   // → backlog silent; only newer messages count as unread
   // returns the now-set cursor
export function CURSOR_STORAGE_KEY(branchId): string  // exported for tests
```

**Storage semantics**:
- One localStorage entry per branchId — branch switch → different cursor, no
  cross-pollution
- Per-device by definition (localStorage is browser-local)
- Writes are sync (no debouncing — scroll-to-bottom events are throttled by
  IntersectionObserver firing rate, typically < 5 Hz)

### 2. useStaffChat Hook Refactor

**File**: `src/hooks/useStaffChat.js`

**Removed**:
- `lastSeenIdsRef = useRef(new Set())` — the in-memory leak (Bug #2 root cause)
- `unreadCount` React state — replaced with derived value

**Added**:
- Hook mount: read cursor from localStorage; if null AND messages loaded → call
  `initCursorIfMissing(branchId, messages.at(-1)?.createdAt || Date.now())`
- Per-snapshot: compute `unreadCount = messages.filter(m => isMessageUnread(m, cursor, deviceId)).length`
- New: `markScrolledToBottom()` callback exposed to message list; advances cursor to latest message id + createdAt
- New: `canMinimize` derived = `unreadCount === 0` AND no truly-new messages since mount

**Sound + auto-expand semantics**:
- Snapshot delta processing: only messages where `isMessageUnread(m, cursor, deviceId) === true` AND not previously emitted-for in THIS hook lifetime trigger sound + auto-expand
- A truly-new message (cursor-relative AND not seen-this-hook) bumps unread + plays sound
- A remount-resurrected message (matches cursor's already-read state) is silent
- Mention detection unchanged (auto-expand + mention sound for mentions)

### 3. Force-Open Enforcement

**File**: `src/components/staffchat/StaffChatWidget.jsx` (or `StaffChatHeader.jsx` — minimize button location)

- Minimize button: `disabled={!canMinimize}` + tooltip "เลื่อนลงล่างก่อน ⬇" when blocked
- Auto-expand on new unread message: existing behavior preserved
- New message arriving while expanded but scrolled-up: bump unread + sound; no jarring auto-scroll; admin notices via badge

### 4. Scroll-to-Bottom Detection

**File**: `src/components/staffchat/StaffChatMessageList.jsx`

- Add a sentinel `<div ref={bottomSentinelRef}>` at the end of the message list
- `IntersectionObserver` watches sentinel; when visible → call `markScrolledToBottom()`
- Cleaner than scroll-position math; handles dynamic message heights (image-attachment messages have variable height); no scroll-jitter listener overhead
- Cleanup observer on unmount

### 5. Badge System

**Schema** — extend `src/lib/staffChatIdentity.js`:
```js
// localStorage key: staffChat:role → 'doctor' | 'assistant' | 'staff' | 'manager' | null
export const ROLE_KEYS = Object.freeze(['doctor', 'assistant', 'staff', 'manager']);
export const ROLE_LABELS_TH = Object.freeze({
  doctor: 'แพทย์', assistant: 'ผู้ช่วยแพทย์', staff: 'พนักงาน', manager: 'ผู้จัดการ',
});
export function getRole(): string | null
export function setRole(role: string | null): void   // validates against ROLE_KEYS; throws on invalid
```

**Outgoing message doc** (`src/lib/staffChatClient.js buildMessageDoc`):
- Add `senderRole: ROLE_KEYS[i] | null` field, populated from `getRole()`
- Optional — null/absent rendered without badge (graceful for legacy + opt-out)

**NEW component** — `src/components/staffchat/StaffChatRoleBadge.jsx` (~60 LOC):
- Props: `{ role: string | null, size: 'lg' | 'sm' }`
- Returns `null` if role is absent or invalid (graceful degradation)
- `lg` size (40px) for picker preview; `sm` (16px) for chat bubble inline
- Single source for all badge renders — Rule of 3 enforced via source-grep

**4 role badge designs** (Q3=B locked):
| Key | Label TH | Icon (Lucide source SVG, inline) | Gradient |
|---|---|---|---|
| `doctor` | แพทย์ | stethoscope | `linear-gradient(135deg, #3b82f6, #2563eb)` (blue 500→600) |
| `assistant` | ผู้ช่วยแพทย์ | hand-heart | `linear-gradient(135deg, #14b8a6, #0d9488)` (teal 500→600) |
| `staff` | พนักงาน | headset | `linear-gradient(135deg, #f59e0b, #d97706)` (amber 500→600) |
| `manager` | ผู้จัดการ | crown | `linear-gradient(135deg, #ef4444, #b91c1c)` (red 500→700) |

**NamePicker extension** (`src/components/staffchat/StaffChatNamePicker.jsx`):
- New section below the color row: "ตำแหน่ง" label + 5 tiles (4 roles + "ไม่ระบุ")
- Each role tile = `<StaffChatRoleBadge size="lg" role={key} />` + label
- "ไม่ระบุ" tile uses a generic "no badge" visual treatment (dashed outline, role=null)
- `confirmName({ name, color, role })` signature gains `role` — forward-compat default for existing callers

**Bubble display** (`src/components/staffchat/StaffChatMessage.jsx`):
- Render `<StaffChatRoleBadge size="sm" role={message.senderRole} />` inline-flex BEFORE the sender name
- No layout reflow when badge absent (RoleBadge returns null)

---

## Data Flow

### Bug #2 fix — cursor lifecycle
```
[Browser load #1, first-ever] localStorage cursor: absent
                              → initCursorIfMissing(branchId, Date.now())
                              → cursor = { lastReadCreatedAtMs: now }
                              → all backlog silent; unread = 0

[New message arrives]         snapshot includes m where m.createdAt > cursor.lastReadCreatedAtMs
                              → isMessageUnread(m, cursor, self) = true
                              → bump unreadCount + play sound + auto-expand if minimized

[User scrolls to bottom]      IntersectionObserver fires on sentinel
                              → markScrolledToBottom()
                              → setCursor(branchId, { lastReadId: m.id, lastReadCreatedAtMs: m.createdAt, updatedAt: Date.now() })
                              → unreadCount → 0 (derived); canMinimize → true

[Tab switch / remount]        hook re-mounts; new useEffect fires
                              → cursor = getCursor(branchId) → reads { lastReadCreatedAtMs: m.createdAt } from localStorage
                              → snapshot fires with same 50 messages
                              → isMessageUnread for each m → all false (createdAt <= cursor)
                              → unreadCount = 0; no sound; no auto-expand
                              → Bug #2 closed
```

### Force-open lifecycle
```
[Unread = 0, minimized]       widget shows FAB (small circle); minimize button N/A
[New message arrives]         auto-expand panel; sound; unread = 1; canMinimize = false
                              → minimize button disabled w/ tooltip
[User reads but scrolls up]   minimize stays disabled; admin can read history
[User scrolls to bottom]      cursor advances; unread = 0; canMinimize = true
[User clicks minimize]        widget collapses to FAB
```

### Badge selection lifecycle
```
[First-ever first send]       NamePicker opens with empty name + default color + role = null
[User picks name + color + role] confirmName({name, color, role}) writes all 3 to localStorage
[Subsequent sends]            buildMessageDoc reads getDisplayName() + getColor() + getRole() → stamps senderRole on outgoing doc
[Receiver sees message]       StaffChatMessage renders <StaffChatRoleBadge size="sm" role={message.senderRole} />
[Admin edits via header chip] opens NamePicker in edit mode pre-filled with current name + color + role; user can change any of 3
```

---

## Error Handling

- `setCursor` localStorage write fails (quota / private browsing) → catch + console.warn; cursor stays in-memory for hook lifetime (graceful degrade to V73 behavior — better than crash)
- `getCursor` returns parse error → treat as null → initCursorIfMissing branch
- `setRole` with invalid key → throws (caught by NamePicker save; surfaces error toast)
- `<RoleBadge role={invalid}>` → returns null (no crash, no badge)
- Listener error (existing V73 L1 / AV51 path preserved) → unchanged

---

## Testing

**File**: `tests/v82-staff-chat-cursor-and-badge.test.js`

8 test groups, ~60 assertions:

| Group | Coverage |
|---|---|
| A. Cursor module unit (8) | get/set/init/isMessageUnread; numeric edge cases; key generation |
| B. Bug #2 reproduction (4) | Simulate snapshot re-fire post-remount; assert unreadCount stays 0 when cursor matches latest; assert no sound replay |
| C. First-mount silent backlog (2) | Empty cursor + 50-message snapshot → cursor = latest.createdAt; unread = 0 |
| D. Force-open (5) | Minimize disabled when unread > 0; tooltip rendered; auto-expand on new message; scroll-to-bottom advances cursor; minimize unlocks |
| E. Sound dedup (3) | Same message after remount does NOT replay sound; truly-new message does; mention path preserved |
| F. Badge picker RTL (6) | 4 role tiles + "ไม่ระบุ"; selection persists to localStorage; confirmName carries role; edit mode pre-fills role |
| G. Badge display RTL (4) | Bubble shows badge when present; null when absent; legacy message (no senderRole) renders without crash; `size="sm"` renders 16px and `size="lg"` renders 40px (test computed inline-style or className) |
| H. Source-grep regression (8) | No `useRef(new Set())` in useStaffChat; cursor module imported; markScrolledToBottom wired; force-open `disabled` prop wired; RoleBadge single source (Rule of 3) |

**Rule Q V66 verification**:
- **L1** (user hands-on, post-deploy): expand widget → scroll to bottom → switch
  Frontend ↔ Backend rapidly (5+ times) → badge count stays at 0, no sound spam,
  no auto-expand spam. Click minimize when unread > 0 → blocked with tooltip.
  Scroll to bottom → minimize unlocks.
- **L2** (Claude post-deploy): admin-SDK script `scripts/v82-cursor-l2-verify.mjs`
  writes a test message, simulates 5 snapshot re-fires by querying the
  collection 5x with a mocked listener, asserts the cursor stays at the same
  lastReadCreatedAtMs after each fire.

---

## AV76 (NEW invariant)

**Added to** `.agents/skills/audit-anti-vibe-code/SKILL.md`:

> **AV76 — In-memory dedup for Firestore listener results crashes on remount**
>
> In-memory dedup of Firestore listener results (`useRef(new Set())` for "seen
> IDs") loses state across every component remount or parent re-render → all
> messages look "new" → false-positive "new" events fire after every tab switch,
> Frontend↔Backend toggle, browser reload.
>
> For ANY listener-consuming component that needs cross-remount dedup, persist
> the cursor:
> - **Per-device** (most common): localStorage with `{branchId}` keying
> - **Cross-device** (rare): Firestore doc per-(uid, scope)
>
> Detection: grep `useRef\(new Set\(\)\)` near `listenTo*` callers; treat each
> match as a candidate for cursor-persistence migration.
>
> Sanctioned exceptions: short-lived modal components that mount only when user
> opens, unmount on close, and the user is expected to see all messages once
> (e.g. a one-shot notification toast).
>
> Lineage: V73 useStaffChat shipped 2026-05-17 with `lastSeenIdsRef`; V82
> (2026-05-17 post-V81-fix7b) introduced `staffChatReadCursor.js` after user
> reported badge spam on every tab switch.

---

## File Inventory

### New (3 source + 1 test + 1 audit entry)
- `src/lib/staffChatReadCursor.js` — cursor module
- `src/components/staffchat/StaffChatRoleBadge.jsx` — badge renderer
- `tests/v82-staff-chat-cursor-and-badge.test.js` — regression bank
- `.agents/skills/audit-anti-vibe-code/SKILL.md` — append AV76
- `scripts/v82-cursor-l2-verify.mjs` — Rule Q L2 verification (admin-SDK)

### Modified (5 source)
- `src/hooks/useStaffChat.js` — replace lastSeenIdsRef with cursor; add canMinimize + markScrolledToBottom; openNameEdit hydrates role from localStorage alongside name + color (mirror existing pattern)
- `src/lib/staffChatIdentity.js` — add getRole / setRole / ROLE_KEYS / ROLE_LABELS_TH
- `src/lib/staffChatClient.js` — buildMessageDoc accepts senderRole
- `src/components/staffchat/StaffChatNamePicker.jsx` — add role section + confirmName({role}) signature
- `src/components/staffchat/StaffChatMessage.jsx` — render `<RoleBadge size="sm" />` inline before name
- `src/components/staffchat/StaffChatMessageList.jsx` — add bottomSentinelRef + IntersectionObserver
- `src/components/staffchat/StaffChatHeader.jsx` (or `StaffChatWidget.jsx`) — minimize button disabled + tooltip

---

## Out of Scope (explicit)

- Cross-device read sync (would require Firestore cursor mirror — YAGNI per Q2)
- Per-message acknowledgement (Q1-D rejected — too heavy)
- Custom badge upload (Q3 locked to 4 fixed roles)
- Auto-detection of role from `be_staff.position` (Q4-c — staff chat is
  device-keyed, not staff-keyed; coupling adds complexity without value)
- Sound-mute per role (existing 🔔/🔕 mute toggle is sufficient)
- Backfill of `senderRole` on existing chat_history docs (no need — legacy
  messages render fine without badge)

---

## Rollout

1. Land all code + tests in single commit (Rule P 7-step batch)
2. `npm run build` clean + targeted vitest (Rule N — small-bugfix-equivalent for
   this batch since it's all localized to staff-chat module + 1 test file)
3. User authorizes `deploy` THIS turn → combined Vercel + Firebase rules deploy
   (rules unchanged; idempotent re-release per V15 + V1/V9 Console-drift defense)
4. Probe-Deploy-Probe per Rule B (6 probes, current set)
5. Post-deploy: user runs Rule Q L1 (tab-switch spam test + force-open test +
   badge pick + cross-device receiver check)
6. Claude runs Rule Q L2 verifier script (`scripts/v82-cursor-l2-verify.mjs`)

---

## Lessons Anticipated (post-V82)

- **AV76 codifies cross-remount dedup**: in-memory `useRef(new Set())` is a V12
  multi-reader-sweep family member at the LISTENER boundary. Generalizes to any
  future listener-consuming component.
- **Force-open semantic is a UX primitive worth reusing**: same pattern could
  apply to mentions, important system announcements, etc. RoleBadge component
  + canMinimize derived → reusable.
- **Per-device localStorage cursors mirror V40 storage-per-branch pattern**:
  branch-keyed localStorage with auto-cleanup on branch removal would be a
  generalization. Not in scope for V82.
