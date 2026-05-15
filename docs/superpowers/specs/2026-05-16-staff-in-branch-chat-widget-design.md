# Staff In-Branch Chat Widget — Design Spec

**Date**: 2026-05-16
**Phase**: V73 (new feature, post-V72)
**Status**: Brainstorming approved 2026-05-16 — 4 base Qs locked + 4 enhanced features picked

## Table of Contents

| § | Section | Type |
|---|---|---|
| 0 | World-class team-chat research summary | overview |
| 1 | User Goal | requirements |
| 2 | Locked Decisions (base + enhanced features) | requirements |
| 3 | User Stories | requirements |
| 4 | Architecture (mount + components + collection + identity + notifs + rules + cleanup) | design |
| 5 | UI Specifications | design |
| 6 | **Feature B — @mentions + personal alert** | feature |
| 7 | **Feature C — Reply-to-message (quote bubble)** | feature |
| 8 | **Feature F — Image paste/upload** | feature |
| 9 | **Feature H — Customer/appt auto-link** | feature |
| 10 | Data Flow (mount + send + receive + branch switch) | design |
| 11 | Edge Cases & Error Handling | design |
| 12 | Testing Strategy (unit + RTL + Rule I + Rule Q L2 + L1) | testing |
| 13 | Iron-Clad Rule Compliance (A/B/C/E/H/I/L/Q) | compliance |
| 14 | Out of Scope (Future Phases) | YAGNI |
| 15 | Open Architectural Decisions (None Blocking) | trade-offs |
| 16 | Acceptance Criteria (base + 4 features) | acceptance |

## 0. World-class team-chat research summary

Studied: Slack / Discord / Microsoft Teams / WhatsApp Web / Telegram Web / TigerConnect / Klara / FB Messenger.

**Patterns adopted into V73**: cookie-stored display name (Discord nickname pattern), corner-bubble FB anchor, mute-toggle Slack default-on, auto-cleanup HIPAA-style (Klara), branch-scoped channel TigerConnect-style.

**Patterns explicitly added per user pick** (after research-recommendation round 2 — see §2.5):
- **B** @mentions + personal alert (Slack/Discord/Teams)
- **C** Reply-to-message (WhatsApp/Telegram/Slack thread-replacement)
- **F** Image paste/upload (every modern chat)
- **H** Customer/appt auto-link (TigerConnect/Klara healthcare-specific)

**Patterns considered + deferred** (user skipped):
- A Typing indicator
- D Reactions (emoji on message)
- E Online presence dots (heartbeat)
- G Quick-reply templates

Deferred isn't dead — can be V73.B follow-up if usage reveals the gap.

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

### 2.1 Base UX decisions

| # | Decision | Choice | Rationale |
|---|---|---|---|
| 1 | Message retention | **7 days** auto-delete | Mirror customer chat 7-day retention. Minimal storage cost. Staff doesn't need long scrollback (coordination is real-time). |
| 2 | First-time UX | **Modal pick-name on first send** | Lazy modal — opens only when user tries to send their first message. Doesn't block read-first browsing. |
| 3 | Mobile expand | **Fullscreen modal (95vw × 60vh)** | Mobile screen too narrow for a corner-windowed FB-style panel. Modal gives proper tap targets + readable message density. |
| 4 | Sound | **Mute toggle in header, default ON** | Default-on respects user spec ("ออโต้เปิด + เสียง"). Per-device cookie state via `localStorage.staffChatMuted`. |

### 2.5 Enhanced features picked (round 2 — world-class research adoption)

User picked 4 features after seeing research summary (Slack/Discord/Teams/WhatsApp/Telegram/TigerConnect/Klara comparison).

| Code | Feature | Spec section | Complexity |
|---|---|---|---|
| **B** | @mentions + personal alert | §6 | medium (~150 LOC) |
| **C** | Reply-to-message (quote bubble) | §7 | easy (~80 LOC) |
| **F** | Image paste/upload (Firebase Storage) | §8 | medium (~150 LOC) |
| **H** | Customer/appt auto-link detection | §9 | easy (~60 LOC) |

Total est. additional: ~440 LOC on top of base MVP. Combined V73 ≈ **1280 LOC**.

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

## 6. Feature B — @mentions + personal alert

### 6.1 UX flow

- User types `@` in composer → dropdown auto-suggest appears (anchored under cursor)
- Dropdown shows up to 8 staff members currently active in this branch's chat (sorted: recently-active first, then alphabetical)
- Source of "staff members in branch": **distinct `displayName` values from this branch's last 200 messages** (NOT be_staff — keeps the cookie-identity decoupling intact per Decision #2; user spec says "ไม่สน login email"). If displayName not in recent messages, user can still mention by typing full name then space — system warns "ชื่อนี้ยังไม่เคยพิมพ์ในแชทนี้" but doesn't block.
- Press Enter or click → name appended to composer as `@ดร.วี ` (with trailing space)
- Visual: mention chip rendered inline in the message bubble (rose-tinted background + bold)
- On send: extract mentions via regex `/@([^\s]+)/g` → store as `mentions: [name1, name2]` array on message doc

### 6.2 Personal alert (key innovation — works WITHOUT auth coupling)

The mentioned person is identified by their **cookie displayName**, not auth uid. When a new message arrives:
- `if (msg.mentions.includes(localStorage.staffChatName))` → distinct alert:
  - Different sound (`/public/sounds/staff-chat-mention.mp3`) — louder + 2 quick beeps
  - Badge color: **red** instead of default (vs unread = subtle dot)
  - Auto-expand widget regardless of mute toggle? — **NO**, mute still respected (decision: prioritize user-control over urgency; if admin needs unmute-on-mention, they unmute manually)
  - Browser Notification API (request once, fire on mentioned-msg even if tab hidden) — optional Phase 2

### 6.3 Data shape

```js
{
  ...baseMessage,
  mentions: ['ดร.วี', 'admin']  // displayName array, max 5 mentions per msg
}
```

### 6.4 Edge cases

- Same name as me → my own mention is filtered out (don't alert self)
- displayName changed since msg sent — the mention is frozen to the historical name. If "ดร.วี" became "ดร.วี (2)" later, old mention still highlights as "ดร.วี" but won't match current me. Acceptable.
- Mention "@everyone" / "@here" → NOT supported in MVP (broadcast spam risk). May add later.
- Cookie has same displayName on 2 devices for 1 person → both devices alert. Fine.

### 6.5 Tests

- Helper: `extractMentions(text)` returns `['ดร.วี']` for `"hello @ดร.วี please come"`
- RTL: type `@` → dropdown appears; pick → composer reflects; submit → mention chip in bubble
- Listener: incoming mentioned-msg → red badge + mention sound (separate from default sound)
- Source-grep: every mention render goes through shared `MentionChip` component (Rule C1)

## 7. Feature C — Reply-to-message (quote bubble)

### 7.1 UX flow

- Each message bubble shows "Reply" action button on hover (desktop) / tap-and-hold (mobile)
- Click → composer shows a **quote bubble strip** above the textarea: "↩ Reply to ดร.วี: 'รอลูกค้า 5 นาที'..." with × to cancel
- Compose normally → on send, `replyTo: { msgId, snippet: 'รอลูกค้า 5 นาที', displayName: 'ดร.วี' }` saved on message
- In rendered list, the reply appears with a small quote-bubble preview ABOVE the new message body (clickable → scroll-to-original)

### 7.2 Data shape

```js
{
  ...baseMessage,
  replyTo: {
    msgId: 'CHAT-...',
    snippet: 'รอลูกค้า 5 นาที',  // first 80 chars of original text
    displayName: 'ดร.วี',
    deviceId: 'dev-abc'  // for "you replied to yourself" cue
  }
}
```

### 7.3 Edge cases

- Original message deleted (auto-cleanup after 7 days) → reply still shows the snippet (denormalized). Clicking scroll-to-original gracefully no-ops with "ข้อความเดิมหมดอายุแล้ว" toast.
- Reply-to-self → "↩ ตอบกลับตัวเอง" label
- Cannot reply-to-reply (no nesting; replyTo on a reply just points to the original original)

### 7.4 Tests

- Click reply → composer shows quote strip; click × → strip disappears
- Send with quote → message has replyTo field
- Scroll-to-original on quote click

## 8. Feature F — Image paste/upload

### 8.1 UX flow

- Composer accepts:
  - Paste image from clipboard (Ctrl+V on text input → detect `clipboardData.files[0]` image)
  - Drag-and-drop file onto panel
  - Camera/file icon button (📎) → file input (accept `image/*`)
- On image selected:
  - Client-side resize: max 1024×1024, JPEG quality 0.85 → typically <500KB
  - Preview thumbnail above composer (×30% size of expanded panel)
  - User can add text caption + send
- On send:
  - Upload to Firebase Storage: `staff-chat-attachments/{branchId}/{ts}-{rand}.jpg`
  - Get download URL
  - Write message doc with `attachmentUrl` + `attachmentSize` + optional `text` caption
- In rendered list: image bubble renders as ~200px max thumbnail (click → lightbox full-size)

### 8.2 Limits + safety

- Max file size **before resize**: 10MB (block larger with "ไฟล์ใหญ่เกิน — กรุณาย่อก่อนส่ง")
- Max resized size: ~1024×1024 → fits well under 500KB jpeg
- Image-only: JPG/PNG/WEBP/GIF accepted; PDF/doc/video rejected ("รองรับเฉพาะรูปภาพ")
- Storage rules: only `isClinicStaff()` can write to `staff-chat-attachments/*`
- Auto-cleanup: Cloud Function nightly deletes attachments referenced by messages >7 days old (or orphans with no msg pointing to them after 24h)
- No camera access (would require getUserMedia permission — defer to Phase 2)

### 8.3 Data shape

```js
{
  ...baseMessage,
  text: 'optional caption',         // can be empty when image-only
  attachmentUrl: 'https://firebasestorage...',
  attachmentSize: 247380,           // bytes
  attachmentMimeType: 'image/jpeg',
}
```

### 8.4 Storage rules (new, add to storage.rules)

```
match /staff-chat-attachments/{branchId}/{file=**} {
  allow read: if isClinicStaff();
  allow create: if isClinicStaff() && request.resource.size < 1 * 1024 * 1024;  // 1MB hard cap
  allow update, delete: if false;  // admin SDK only
}
```

Probe-Deploy-Probe (Rule B): add endpoint #10 — anon write to `staff-chat-attachments/` → expect 403.

### 8.5 Tests

- Helper: `resizeImageToBlob(file, maxDim, quality)` → blob shape + dimensions
- RTL: paste → preview shows; drag → preview shows; send → message has attachmentUrl placeholder (Storage mocked)
- Rule Q L2 verify: write a real image to Storage, read back via real client SDK (no admin SDK), display via signed URL

## 9. Feature H — Customer/appointment auto-link detection

### 9.1 UX flow

- When rendering a message, scan text for tokens:
  - `LC-\d{8}` → customer ID (e.g. `LC-26000022`)
  - `BA-\d+` → appointment ID (e.g. `BA-1778868832454`)
- Replace each token with a clickable link styled like a chip:
  - Customer: rose-tinted `<a href="/?backend=1&customer=LC-26000022" target="_blank">LC-26000022</a>` (rose-100 bg, rose-700 text, rounded chip)
  - Appointment: sky-tinted `<a href="/?backend=1&customer={apptCustomerId}#appt-{id}">BA-...</a>` (sky-100 bg, sky-700 text)
- On hover (desktop): tooltip shows resolved customer name (lookup from `be_customers`) — implements lazy-fetch via `staffChatLinkResolver.js` (cache 5 min in memory, no Firestore reads on every render)

### 9.2 Implementation

- Pure function `parseMessageBody(text)` returns array of `{type:'text'|'customer'|'appt', content, refId?}` segments
- `<MessageBody>` component maps segments → text vs `<CustomerLink>` / `<AppointmentLink>` chip components
- No data-model change (purely render-layer)

### 9.3 Edge cases

- Customer ID for branch user can't access — chip renders but link 404s on click (rules block it). Acceptable.
- Appointment ID resolution requires customer lookup → defer "open appt" to next page; chip just opens customer profile + scrolls to apptId
- Token inside URL (e.g. `https://example.com/?customer=LC-26000022`) — only match when surrounded by word boundary `\b` — won't match inside another URL
- Falsy match (someone typed `LC-99999999` which doesn't exist) — link 404s gracefully

### 9.4 Tests

- Helper: `parseMessageBody('see LC-26000022 about BA-1778') → [text, customer, text, appt]`
- RTL: render message with customer ID → chip element with correct href
- Source-grep: every message render uses parseMessageBody (no raw text-only display)

## 10. Data Flow

### 10.1 Mount → first render

```
App.jsx mounts
  → BranchProvider resolves selectedBranchId
  → UserPermissionProvider resolves user
  → StaffChatWidget mounts (gated)
    → useStaffChat() subscribes via scopedDataLayer
      → Firestore onSnapshot(be_staff_chat_messages where branchId=X order createdAt desc limit 50)
    → renders <StaffChatBubble> (minimized state)
```

### 10.2 User sends message

```
User types in composer
  → presses Enter OR clicks send button
  → useStaffChat.send(text)
    → if !localStorage.staffChatName → setNamePickerOpen(true), pendingMessage=text, return
    → else: addDoc(be_staff_chat_messages, {branchId, displayName, text, createdAt: serverTimestamp(), deviceId, mentions?, replyTo?, attachmentUrl?})
    → optimistic: append to local state immediately
    → on success: server snapshot replaces optimistic
    → on error: revert local state, show toast
```

### 10.3 Incoming message → notification

```
Firestore snapshot fires with new doc
  → useStaffChat detects new message (id not in prev state)
  → if msg.deviceId === myDeviceId: skip notification
  → else if msg.mentions.includes(localStorage.staffChatName):  // V73 Feature B
    → play /public/sounds/staff-chat-mention.mp3 (override mute? NO — still respect mute)
    → red badge (vs default subtle dot)
    → auto-expand widget regardless of state
  → else:
    → if !muted: play default /public/sounds/staff-chat-notif.mp3, flash bubble (3× CSS pulse)
    → if document.hidden OR minimized: setMinimized(false) — auto-expand
    → increment unread count if still minimized
  → append to message list, scroll-to-bottom (smooth)
```

### 10.4 Branch switch

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

## 11. Edge Cases & Error Handling

| Case | Behavior |
|---|---|
| Firestore offline | Listener cached → reads from cache. Sends queued by SDK, auto-retry on reconnect. |
| Permission denied on listener | Show "ไม่สามารถโหลดแชทได้" banner in panel, retry button. |
| Sound file 404 | `Audio.play().catch(() => {})` — silent fail, still flash + auto-expand. |
| Multiple devices same name | Allowed — backend dedup not needed (deviceId distinguishes). |
| 500 char limit reached | Composer disables send button + shows char counter at 400+. |
| Empty message send (no text + no image) | Send button disabled. Image-only allowed when no text. |
| Branch switch mid-typing | Composer state preserved (text + quote + pending image); next send goes to new branch's room. |
| User logs out | `user === null` → widget unmounts → listener unsubscribes. |
| URL is patient public link | Widget never mounts (gate). |
| Image upload mid-flight + tab close | Storage upload aborts cleanly; message not written; no orphan. |
| Mention non-existent name | Allowed — chip renders but no one alerts. Useful for placeholders ("@everyone" maybe in future). |
| Reply to message that disappeared (7-day cleanup) | Snippet still rendered (denormalized); scroll-to-original toasts "ข้อความเดิมหมดอายุแล้ว". |
| Storage 1MB quota exceeded | Toast "รูปใหญ่เกิน — ลองลดขนาดก่อนส่ง"; resize client retries at quality 0.7. |
| Hover customer-link chip while offline | Tooltip shows "—" (no resolution); chip still clickable to navigate. |

## 12. Testing Strategy

### 12.1 Helper unit (Vitest)

- `staffChatIdentity` — getDisplayName/setDisplayName/getDeviceId/getMuted (localStorage + crypto random)
- `staffChatClient.buildMessageDoc` — validate fields + crypto-random id, accepts optional mentions/replyTo/attachmentUrl
- `extractMentions(text)` — regex extract `@name` → array, edge cases (no spaces, special chars, max 5, dedup)
- `parseMessageBody(text)` — segment array for text/customer/appt, word-boundary correct, URL-internal no match
- `resizeImageToBlob(file, maxDim, quality)` — blob shape + actual dimensions when fed a 4000×3000 mock + quality fallback

### 12.2 RTL (Vitest + @testing-library/react)

- Widget mount with auth gate (renders / doesn't render based on user + selectedBranchId + needsPublicAuth)
- Click bubble → expands; click × → minimizes
- Type message + send (no name) → name picker opens
- Set name in modal → message sends
- Incoming snapshot (mock) → message appears + unread counter increments when minimized
- Mute toggle → no sound played on next msg
- Type `@` → dropdown of recent names appears; pick → composer reflects → submit → mention chip in bubble
- Click reply on a bubble → composer quote strip appears; × clears it; send writes replyTo field
- Paste image → preview thumbnail appears; send → bubble renders image with click → lightbox
- Render message "ลูกค้า LC-26000022 รออยู่" → rose chip on LC-...; click chip opens new tab to customer page (mock window.open)

### 12.3 Rule I full-flow simulate

Each chain mounts the widget, exercises the flow, asserts post-state:
- F1 Base: mount → listener subscribes → mock incoming → bubble auto-expands → user replies → addDoc fires correct shape → branch switch → listener re-subscribes
- F2 Mention: another device sends `@ดร.วี ...` → my device (localStorage.staffChatName=='ดร.วี') receives → mention sound + red badge + auto-expand regardless of state
- F3 Reply: click reply → quote strip → send → message has replyTo → click rendered quote-card → scroll-to-original
- F4 Image: paste image (mock blob) → resize helper called → upload to Firebase Storage (mock) → message doc has attachmentUrl → bubble renders thumbnail → click → lightbox opens
- F5 Auto-link: send "see LC-26000022" → bubble has chip → click opens correct URL

### 12.4 Source-grep regression (per V21 lessons)

- Widget gated on `user && selectedBranchId && !needsPublicAuth`
- onSnapshot uses scopedDataLayer (not raw backendClient)
- All sends go through `staffChatClient` (no inline addDoc in components)
- Sound + auto-expand only fires when `deviceId !== myDeviceId`
- Mention render uses shared `MentionChip` (no inline `<span class="...">@${name}</span>`)
- Auto-link render uses `parseMessageBody` (no raw `<div>{text}</div>` for chat messages)
- Mention notification uses `mentions.includes(displayName)` check (no inline regex)

### 12.5 Rule Q L2 real-prod verify

Script: `scripts/diag-staff-chat-l2-verify-v73.mjs` covers:
- Mock-free: real client SDK signs in as `loverclinic@loverclinic.com`, subscribes to listener for ทดลอง 1 branch
- Writes TEST-V73-base message → verifies receive in second client (compound query w/ where branchId + orderBy createdAt)
- Writes TEST-V73-mention with `mentions: ['DR.WEE']` → second client with `localStorage.staffChatName='DR.WEE'` receives + mentions array intact
- Writes TEST-V73-reply with replyTo pointing to TEST-V73-base → receives + snippet preserved
- Writes TEST-V73-image with attachmentUrl pointing to Storage `staff-chat-attachments/{branchId}/TEST-V73-{ts}.jpg` → uploads via Storage real client SDK → reads back via signed URL
- Cleanup: deletes all TEST-V73-* messages + Storage objects

### 12.6 Rule Q L1 Playwright (deferred to user hands-on)

L1 = real-browser flow drive — multi-device requires 2 browser contexts. Deferred to user hands-on test plan:
- User opens chat in 2 browsers (1 desktop, 1 mobile), confirms real-time delivery + sound + auto-expand
- User mentions other user → other user's device alerts with red badge + mention sound
- User replies to message → quote-card renders + scroll-to-original works
- User pastes image → upload + receive both display correctly
- User sends LC-26000022 → other user clicks chip → correct customer page opens

## 13. Iron-Clad Rule Compliance

- **Rule A** (revert-on-bug): N/A new feature; bugs trigger revert path normally.
- **Rule B** (Probe-Deploy-Probe): firestore.rules deploy adds endpoint #9 (anon CREATE on be_staff_chat_messages → expect 403). Storage rules add endpoint #10 (anon write to `staff-chat-attachments/` → expect 403, per §8 Feature F).
- **Rule C1** (Rule of 3): shared display name helper in `staffChatIdentity.js` (no duplication). Shared `MentionChip` (§6) + `MessageBody` parser (§9) — single source for mention render + auto-link detection.
- **Rule C2** (Security): deviceId via `crypto.getRandomValues` (NOT Math.random); displayName user-set is OK because it's not a secret token; rules enforce write shape; image upload size capped at 1MB Storage rule; resized client-side max 1024×1024.
- **Rule C3** (Lean schema): one new collection — justified (3 readers: Firestore listener + Cloud Function cleanup + Rule Q diag; 1 writer: chat send; size: 7-day retention × low message volume × image-attachment URL).
- **Rule E** (Backend = Firestore only): N/A — staff chat ≠ ProClinic.
- **Rule H** (Data ownership): be_staff_chat_messages is OUR data, lives in Firestore only.
- **Rule I** (Full-flow simulate): listed in §12.3 — F1-F5 cover mount → name pick → send → receive → branch switch + 4 feature flows.
- **Rule L** (BSA): branch-scoped collection; uses scopedDataLayer wrapper.
- **Rule Q** (Real-Adversarial Verification): L2 script via real client SDK (§12.5) covers base + all 4 features; L1 deferred to user hands-on (2 devices, 1 desktop + 1 mobile, real prod).

## 14. Out of Scope (Future Phases)

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

## 15. Open Architectural Decisions (None Blocking)

- Sound file source: ship our own MP3 vs use built-in browser tone. → Default: ship `/public/sounds/staff-chat-notif.mp3` (~3KB) for predictable UX.
- Z-index conflict with TFP modal (z-100): widget at z-9000 sits above. May want to demote when TFP open. → Defer; if conflict reported, add `hidden when treatmentFormMode != null` gate.

## 16. Acceptance Criteria

### 16.1 Base (MVP) — 10 checks

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

### 16.2 Feature B (@mentions) — 5 checks

11. Type `@` in composer → dropdown of recent-active names appears
12. Click dropdown entry "ดร.วี" → composer reads `@ดร.วี ` (with space)
13. Send → message renders with rose-tinted "@ดร.วี" chip
14. Another device with `localStorage.staffChatName === 'ดร.วี'` hears MENTION sound (different from default) + red badge
15. Same device with no matching name hears no special alert (default unread badge only)

### 16.3 Feature C (Reply-to-message) — 4 checks

16. Hover any message bubble → "Reply" action appears
17. Click reply → quote strip "↩ Reply to ดร.วี: 'รอลูกค้า 5 นาที'..." appears above composer; × clears it
18. Send while quote active → new message has `replyTo` field; bubble renders mini quote-card on top
19. Click the quote-card on a rendered reply → smooth-scroll to original message in list (or graceful toast if expired)

### 16.4 Feature F (Image paste/upload) — 5 checks

20. Paste image from clipboard (Ctrl+V on focused composer) → preview thumbnail appears above textarea
21. Drag image file onto panel → same preview behavior
22. Click 📎 icon → file picker opens, accepts image/* only; >10MB rejected with toast
23. Send → image uploads to Firebase Storage; message renders as ~200px thumbnail; click → lightbox full-size
24. Send with caption "ดูยานี้" → both image + caption render in same bubble

### 16.5 Feature H (Customer/appt auto-link) — 4 checks

25. Send "ลูกค้า LC-26000022 รออยู่ห้อง 3" → rendered with rose-tinted chip on LC-26000022, clickable
26. Click chip → opens `/?backend=1&customer=LC-26000022` in new tab
27. Send "ดูนัด BA-1778868832454" → sky-tinted chip on BA-1778868832454
28. Hover desktop chip → tooltip resolves customer name (lazy-fetched, cached 5min)

### 16.6 Cross-feature (combinations)

29. Reply to a message that contains LC-26000022 with @mention to another user — all 3 features render correctly in same composer + bubble
30. Image upload + mention + reply combined in one message → all stored in single doc with `mentions: [...], replyTo: {...}, attachmentUrl: '...'`

Total: 30 acceptance checks. Manual L1 user-walkthrough on real prod with 2+ devices (one desktop, one mobile) covers all 30. Rule Q L2 automation covers ~25 (excludes physical taps + sound playback verification — those are user-only).
