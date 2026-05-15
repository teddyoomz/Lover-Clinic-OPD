# Staff In-Branch Chat Widget — Design Spec

**Date**: 2026-05-16
**Phase**: V73 (new feature, post-V72)
**Status**: Brainstorming approved 2026-05-16 (4 Qs locked)

## 1. User Goal

User report (verbatim, with 2 Facebook chat-widget screenshots):

> "เพิ่มระบบ Chat กันเองในสาขา โดยจะมี icon กล่องแชทลอยไว้บริเวณขวาล่างจอ
> เหมือนกับหน้าของ Facebook โดยมีทั้งใน Frontend และ Backend...
> จุดประสงค์คือ อยากให้ในสาขานั้นๆ ระหว่าง admin, ผู้จัดการ, แพทย์
> ที่อยู่คนละห้องแต่เปิดโปรแกรมเราเหมือนกัน สามารถคุยกันได้เลยในแอป
> ของเราเพื่อความสะดวกและรวดเร็วเวลาให้บริการลูกค้าในคลินิก"

In-branch staff text chat for fast coordination across rooms (admin/manager/doctor
in different rooms of the same clinic branch).

## 2. Locked Decisions (from brainstorming 2026-05-16)

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Message retention | **7 days** auto-delete | Mirror customer chat 7-day retention. Minimal storage cost. Staff doesn't need long scrollback (coordination is real-time). |
| 2 | First-time UX | **Modal pick-name on first send** | Lazy modal — opens only when user tries to send their first message. Doesn't block read-first browsing. |
| 3 | Mobile expand | **Fullscreen modal (95vw × 60vh)** | Mobile screen too narrow for a corner-windowed FB-style panel. Modal gives proper tap targets + readable message density. |
| 4 | Sound | **Mute toggle in header, default ON** | Default-on respects user spec ("ออโต้เปิด + เสียง"). Per-device cookie state via `localStorage.staffChatMuted`. |

## 3. User Stories

- **U1**: As an admin on Frontend `/`, I see a floating chat bubble at bottom-right with unread count badge. Click to expand.
- **U2**: As a manager in another room, I open Backend `/?backend=1` on my device. The same chat widget appears with same conversation.
- **U3**: I haven't set my display name yet. I read messages freely. I type a reply + click send — modal pops up: "ตั้งชื่อในแชท" → I type "ดร.วี" → press OK → message sends as "ดร.วี".
- **U4**: My device remembers "ดร.วี" across sessions (localStorage). Next time I send, no modal.
- **U5**: While I'm on the Backend stock page with chat minimized, someone sends a message. Sound plays + bubble auto-expands + flashes briefly.
- **U6**: I click the 🔔/🔕 toggle in chat header → mute. New messages still arrive silently. Decision persists per-device.
- **U7**: On mobile, I tap the bubble → fullscreen modal slides up. Tap × → modal closes back to bubble.
- **U8**: I switch top BranchSelector from นครราชสีมา → พระราม 3. Chat history switches to พระราม 3's room. Messages from นครราชสีมา not visible.
- **U9**: A message from 8 days ago doesn't appear — auto-deleted by Cloud Function.

## 4. Architecture

### 4.1 Surfaces (where the widget renders)

Mount globally via **App.jsx root** (single mount point), inside `<BranchProvider>` so `selectedBranchId` is available.

Gate visibility on:

```js
const showWidget = !!user && !!selectedBranchId && !needsPublicAuth;
```

- `user` = Firebase Auth user object (any staff logged in)
- `selectedBranchId` = current branch from BranchContext
- `needsPublicAuth` = false unless URL has `?session=`/`?patient=`/`?schedule=` (per V16 logic)

Result:
- ✅ `/` (Frontend admin) — renders
- ✅ `/?backend=1` (Backend admin) — renders
- ❌ `?session=*` (patient form) — hidden
- ❌ `?patient=*` (patient dashboard) — hidden
- ❌ `?schedule=*` (clinic schedule public) — hidden
- ❌ Logged-out — hidden

### 4.2 Component tree

```
App.jsx
└── BranchProvider
    └── UserPermissionProvider
        ├── <existing routes>
        └── StaffChatWidget (NEW)
            ├── StaffChatBubble (minimized state)
            └── StaffChatPanel (expanded state)
                ├── StaffChatHeader (mute toggle + minimize + branch name)
                ├── StaffChatMessageList (scrollable, latest at bottom)
                ├── StaffChatComposer (textarea + send button)
                └── StaffChatNamePicker (modal on first-send)
```

### 4.3 Files

| Path | Purpose | LOC est. |
|---|---|---|
| `src/components/staffchat/StaffChatWidget.jsx` | Root composer + visibility gate | 80 |
| `src/components/staffchat/StaffChatBubble.jsx` | Minimized circle bubble + unread badge | 50 |
| `src/components/staffchat/StaffChatPanel.jsx` | Expanded panel (desktop corner + mobile modal) | 120 |
| `src/components/staffchat/StaffChatHeader.jsx` | Branch name + mute toggle + minimize button | 60 |
| `src/components/staffchat/StaffChatMessageList.jsx` | Scrollable message list, auto-scroll on new msg | 100 |
| `src/components/staffchat/StaffChatComposer.jsx` | Textarea + send + Enter-to-send | 80 |
| `src/components/staffchat/StaffChatNamePicker.jsx` | First-send name modal | 70 |
| `src/hooks/useStaffChat.js` | Listener + state + send/mute logic | 150 |
| `src/lib/staffChatClient.js` | Firestore CRUD wrappers via scopedDataLayer | 80 |
| `src/lib/staffChatIdentity.js` | Cookie-stored displayName + deviceId helpers | 50 |
| Total | | ~840 LOC |

### 4.4 Data model

**Collection**: `be_staff_chat_messages` (new, branch-scoped per BSA Rule L)

```js
{
  id: 'CHAT-{ts}-{rand}',           // crypto-secure random id
  branchId: 'BR-...',                // BSA branch scope
  displayName: 'ดร.วี',              // cookie-stored, user-set
  text: 'รอลูกค้าเข้าห้อง 3 อีก 2 คน',  // message body, max 500 chars
  createdAt: serverTimestamp,        // sort key
  deviceId: 'dev-abc123',            // cookie identity (for dedup + presence later)
  // Forward-compat fields (not used in MVP):
  // replyTo: null,
  // mentions: [],
}
```

**Indexes** (firestore.indexes.json — new): composite index on `(branchId, createdAt)` for the listener query.

**Listener query** (via scopedDataLayer):
```js
query(
  collection(db, 'artifacts/{APP_ID}/public/data/be_staff_chat_messages'),
  where('branchId', '==', selectedBranchId),
  orderBy('createdAt', 'desc'),
  limit(50)  // last 50 messages — covers 7-day window for low-volume branches
)
```

### 4.5 Identity model

**Display name** (`localStorage.staffChatName`):
- User-set on first send (modal)
- Never tied to Firebase Auth email
- Per-device persistence
- 2-50 chars, Thai/English/digits OK
- No uniqueness enforcement (2 people can pick same name — duplicates allowed)

**Device ID** (`localStorage.staffChatDeviceId`):
- `dev-{crypto-random-hex-8}` minted on first widget mount
- Persists forever
- Used for dedup (don't show own-message notification) + future presence

**Mute state** (`localStorage.staffChatMuted`):
- Boolean string, "1" / "0"
- Default "0" (sound on)
- Toggle via header 🔔/🔕 button

### 4.6 Notifications

On new message arrives via onSnapshot:

```
if (msg.deviceId === myDeviceId) return;  // own message — skip
if (mutedToggle === true) {
  show unread badge only;
} else {
  play /public/sounds/staff-chat-notif.mp3 (volume 0.5);
  if (document.hidden || widget.minimized) {
    auto-expand widget;
    flash bubble border 3× (CSS animation);
  }
}
```

Sound file: small MP3, ~3KB, soft "ding" — not jarring.

### 4.7 Firestore rules

```
match /be_staff_chat_messages/{msgId} {
  allow read: if isClinicStaff();
  allow create: if isClinicStaff()
                && request.resource.data.branchId is string
                && request.resource.data.text is string
                && request.resource.data.text.size() > 0
                && request.resource.data.text.size() <= 500
                && request.resource.data.displayName is string
                && request.resource.data.displayName.size() >= 2
                && request.resource.data.displayName.size() <= 50;
  allow update, delete: if false;  // immutable (Cloud Function uses admin SDK to delete old)
}
```

Probe-Deploy-Probe (Rule B): add to probe list as endpoint #9 — anon CREATE → expect 403.

### 4.8 Auto-cleanup (Cloud Function)

New `functions/cleanupStaffChat.js` — scheduled daily 03:00 Bangkok:

```js
exports.cleanupOldStaffChatMessages = onSchedule({
  schedule: '0 20 * * *',  // 20:00 UTC = 03:00 Bangkok
  timeZone: 'UTC',
}, async () => {
  const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
  const snap = await db.collection(`artifacts/${APP_ID}/public/data/be_staff_chat_messages`)
    .where('createdAt', '<', new Date(cutoff))
    .limit(500)  // batch
    .get();
  const batch = db.batch();
  for (const d of snap.docs) batch.delete(d.ref);
  await batch.commit();
  console.log(`[staff-chat-cleanup] deleted ${snap.size} messages older than 7 days`);
});
```

## 5. UI Specifications

### 5.1 Bubble (minimized)

- Position: `fixed bottom-4 right-4` (desktop) / `bottom-3 right-3` (mobile)
- Size: 56×56 px circle
- Background: `bg-rose-600` (Lover Clinic fire-red brand)
- Icon: lucide `MessageCircle` 24px white
- Unread badge: top-right, 18×18 white circle, red text, count 1-99 ("99+" if >99)
- Hover: `bg-rose-500`, `shadow-xl`, scale-105
- Z-index: 9000 (above modals, below toasts)

### 5.2 Panel (expanded — desktop)

- Position: `fixed bottom-4 right-4`
- Size: `360 × 480` (w × h)
- Background: `bg-[var(--bg-card)]`, `border border-[var(--bd-strong)]`, `rounded-xl`, `shadow-2xl`
- Sections (top to bottom):
  - Header: 44px tall, branch name + mute toggle + minimize × button
  - Message list: flex-1, scrollable, padding 12px
  - Composer: 48px tall, textarea + send button

### 5.3 Panel (expanded — mobile ≤640px)

- Position: `fixed inset-x-2 bottom-2 top-[20vh]` (95vw × 60vh)
- Same internal structure
- Header gets a back/× button instead of minimize (more taps-friendly)

### 5.4 Message bubble (in list)

- Own messages: right-aligned, `bg-rose-600/20 border-rose-500/40 text-rose-100`
- Others: left-aligned, `bg-[var(--bg-input)] border-[var(--bd)] text-[var(--tx-primary)]`
- Above bubble: tiny grey text `displayName · HH:MM` (own messages: just HH:MM right-aligned)
- Body: white-space pre-wrap, max-width 80% of list width
- Each bubble: rounded-2xl with one squared corner pointing toward sender side

### 5.5 First-send name picker modal

- Modal overlay z-index 9500 (above widget)
- Card: 320×180, centered
- Title: "ตั้งชื่อในแชท"
- Body text: "พิมพ์ชื่อที่จะปรากฏในแชทของสาขา (2-50 ตัวอักษร)"
- Input: text, autofocus, max length 50
- Buttons: ยกเลิก (gray) + บันทึก (rose, disabled if invalid)
- On Save: write to localStorage + close modal + retry pending send

## 6. Data Flow

### 6.1 Mount → first render

```
App.jsx mounts
  → BranchProvider resolves selectedBranchId
  → UserPermissionProvider resolves user
  → StaffChatWidget mounts (gated)
    → useStaffChat() subscribes via scopedDataLayer
      → Firestore onSnapshot(be_staff_chat_messages where branchId=X order createdAt desc limit 50)
    → renders <StaffChatBubble> (minimized state)
```

### 6.2 User sends message

```
User types in composer
  → presses Enter OR clicks send button
  → useStaffChat.send(text)
    → if !localStorage.staffChatName → setNamePickerOpen(true), pendingMessage=text, return
    → else: addDoc(be_staff_chat_messages, {branchId, displayName, text, createdAt: serverTimestamp(), deviceId})
    → optimistic: append to local state immediately
    → on success: server snapshot replaces optimistic
    → on error: revert local state, show toast
```

### 6.3 Incoming message → notification

```
Firestore snapshot fires with new doc
  → useStaffChat detects new message (id not in prev state)
  → if msg.deviceId === myDeviceId: skip notification
  → else:
    → if !muted: play sound (Audio.play()), flash bubble (3× CSS pulse)
    → if document.hidden OR minimized: setMinimized(false) — auto-expand
    → increment unread count if still minimized
  → append to message list, scroll-to-bottom (smooth)
```

### 6.4 Branch switch

```
User clicks top BranchSelector to switch
  → BranchContext.selectBranch(newBranchId)
    → localStorage.setItem('selectedBranchId:{uid}', newBranchId)
    → setSelectedBranchId(newBranchId)
  → useStaffChat re-runs effect (selectedBranchId in deps)
    → onSnapshot unsubscribes from old branch
    → re-subscribes with new branchId
    → message list resets to new branch's last 50
```

## 7. Edge Cases & Error Handling

| Case | Behavior |
|---|---|
| Firestore offline | Listener cached → reads from cache. Sends queued by SDK, auto-retry on reconnect. |
| Permission denied on listener | Show "ไม่สามารถโหลดแชทได้" banner in panel, retry button. |
| Sound file 404 | `Audio.play().catch(() => {})` — silent fail, still flash + auto-expand. |
| Multiple devices same name | Allowed — backend dedup not needed (deviceId distinguishes). |
| 500 char limit reached | Composer disables send button + shows char counter at 400+. |
| Empty message send | Send button disabled when textarea trimmed === ''. |
| Branch switch mid-typing | Composer state preserved (text); next send goes to new branch's room. |
| User logs out | `user === null` → widget unmounts → listener unsubscribes. |
| URL is patient public link | Widget never mounts (gate). |

## 8. Testing Strategy

### 8.1 Helper unit (Vitest)

- `staffChatIdentity` — getDisplayName/setDisplayName/getDeviceId/getMuted (localStorage + crypto random)
- `staffChatClient.buildMessageDoc` — validate fields + crypto-random id

### 8.2 RTL (Vitest + @testing-library/react)

- Widget mount with auth gate (renders / doesn't render)
- Click bubble → expands; click × → minimizes
- Type message + send (no name) → name picker opens
- Set name in modal → message sends
- Incoming snapshot (mock) → message appears + unread counter increments when minimized
- Mute toggle → no sound played on next msg

### 8.3 Rule I full-flow simulate

- Mount → listener subscribes → mock incoming message → bubble auto-expands → user replies → addDoc fires with correct shape → branch switch → listener re-subscribes to new branch

### 8.4 Source-grep regression (per V21 lessons)

- Widget gated on `user && selectedBranchId`
- onSnapshot uses scopedDataLayer (not raw backendClient)
- All sends go through `staffChatClient` (no inline addDoc in components)
- Sound + auto-expand only fires when `deviceId !== myDeviceId`

### 8.5 Rule Q L2 real-prod verify

- Script: `scripts/diag-staff-chat-l2-verify-v73.mjs`
- Mock-free: real client SDK signs in as `loverclinic@loverclinic.com`, subscribes to listener for ทดลอง 1 branch, writes a TEST-message, verifies receive, deletes.
- Cleanup: deletes any TEST- prefixed messages remaining.

### 8.6 Rule Q L1 Playwright (deferred to user hands-on)

- L1 = real-browser flow drive — multi-device requires 2 browser contexts. Deferred to user hands-on test plan: user opens chat in 2 browsers (1 desktop, 1 mobile), confirms real-time delivery + sound + auto-expand.

## 9. Iron-Clad Rule Compliance

- **Rule A** (revert-on-bug): N/A new feature; bugs trigger revert path normally.
- **Rule B** (Probe-Deploy-Probe): firestore.rules deploy adds endpoint #9 (anon CREATE on be_staff_chat_messages → expect 403).
- **Rule C1** (Rule of 3): shared display name helper in `staffChatIdentity.js` (no duplication).
- **Rule C2** (Security): deviceId via `crypto.getRandomValues` (NOT Math.random); displayName user-set is OK because it's not a secret token; rules enforce write shape.
- **Rule C3** (Lean schema): one new collection — justified (3 readers: Firestore listener + Cloud Function cleanup + Rule Q diag; 1 writer: chat send; size: 7-day retention × low message volume).
- **Rule E** (Backend = Firestore only): N/A — staff chat ≠ ProClinic.
- **Rule H** (Data ownership): be_staff_chat_messages is OUR data, lives in Firestore only.
- **Rule I** (Full-flow simulate): listed in §8.3.
- **Rule L** (BSA): branch-scoped collection; uses scopedDataLayer wrapper.
- **Rule Q** (Real-Adversarial Verification): L2 script via real client SDK (§8.5); L1 deferred to user hands-on.

## 10. Out of Scope (Future Phases)

- File/image upload (paste image, drag-drop)
- @mentions
- Online presence indicator ("3 คนออนไลน์")
- Read receipts ("เห็นแล้ว 2/3")
- Edit/delete messages
- Threaded replies / reply-to-message
- Search messages
- Emoji picker / reactions
- Multiple chat rooms per branch (#general #urgent)
- Cross-branch global staff channel
- Push notifications to phone via FCM when app closed
- Voice/video calls

## 11. Open Architectural Decisions (None Blocking)

- Sound file source: ship our own MP3 vs use built-in browser tone. → Default: ship `/public/sounds/staff-chat-notif.mp3` (~3KB) for predictable UX.
- Z-index conflict with TFP modal (z-100): widget at z-9000 sits above. May want to demote when TFP open. → Defer; if conflict reported, add `hidden when treatmentFormMode != null` gate.

## 12. Acceptance Criteria

A clinic admin can:
1. Open Frontend `/` on desktop → see floating bubble bottom-right
2. Click bubble → panel expands with last messages (or empty state)
3. Type "hello" + send → name modal pops up
4. Type "ดร.วี" + Save → message sends, displays right-aligned
5. Open Backend `/?backend=1` on mobile → see same bubble
6. Tap bubble → fullscreen modal with same message history
7. Reply "got it" → sends + appears on desktop in real-time (~1s)
8. Switch branch via top selector → chat history switches
9. Mute → next message produces no sound
10. Wait 8 days → message disappears (Cloud Function cleanup)
