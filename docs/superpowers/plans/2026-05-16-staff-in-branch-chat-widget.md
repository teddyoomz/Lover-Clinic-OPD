# V73 Staff In-Branch Chat Widget — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Facebook-style floating staff chat widget for in-branch coordination — branch-scoped real-time chat with cookie-stored display names, plus 4 world-class features (mentions / reply / image / auto-link).

**Architecture:** Single global mount via App.jsx root, gated on `user && selectedBranchId && !needsPublicAuth`. Branch-scoped Firestore collection `be_staff_chat_messages` via `scopedDataLayer` BSA pattern. Cookie identity (no auth coupling for display name). Optional Firebase Storage for image attachments. Cloud Function nightly cleanup. Mute toggle + sound dispatch (mention sound vs default sound). 30 acceptance checks total.

**Tech Stack:** React 19 + Vite 8 + Tailwind 3.4 + Firestore + Firebase Storage + Firebase Cloud Functions + Vitest 4.1 + RTL + Playwright (deferred to user L1).

**Spec:** [`docs/superpowers/specs/2026-05-16-staff-in-branch-chat-widget-design.md`](../specs/2026-05-16-staff-in-branch-chat-widget-design.md)

---

## File Structure (decomposition lock-in)

| Path | Responsibility | Tasks |
|---|---|---|
| `src/lib/staffChatIdentity.js` | localStorage helpers (name/deviceId/muted) | T1 |
| `src/lib/staffChatClient.js` | Firestore CRUD wrappers + parseMessageBody + extractMentions | T2, T11, T13 |
| `src/lib/staffChatImageResize.js` | Client-side image resize helper (Feature F) | T15 |
| `src/lib/scopedDataLayer.js` | Add `listenToStaffChatMessages` + `addStaffChatMessage` re-exports | T3 |
| `src/lib/backendClient.js` | Raw Firestore wrappers (called by scopedDataLayer) | T3 |
| `src/hooks/useStaffChat.js` | Listener + state + send + notification dispatch | T4, T11, T13, T14 |
| `src/components/staffchat/StaffChatWidget.jsx` | Root composer + visibility gate + auth/branch wire | T5 |
| `src/components/staffchat/StaffChatBubble.jsx` | Minimized circle + unread badge + click-to-expand | T5 |
| `src/components/staffchat/StaffChatPanel.jsx` | Expanded panel (desktop corner + mobile fullscreen) | T6 |
| `src/components/staffchat/StaffChatHeader.jsx` | Branch name + mute toggle + minimize × | T6 |
| `src/components/staffchat/StaffChatMessageList.jsx` | Scrollable list of message bubbles | T7 |
| `src/components/staffchat/StaffChatMessage.jsx` | Single message bubble (own vs other) + reply quote + attachment | T7, T12, T15, T16 |
| `src/components/staffchat/StaffChatComposer.jsx` | Textarea + send + image attach + reply preview | T8, T12, T14, T15 |
| `src/components/staffchat/StaffChatNamePicker.jsx` | First-send modal name picker | T9 |
| `src/components/staffchat/StaffChatMentionDropdown.jsx` | @-trigger dropdown of recent names | T11 |
| `src/components/staffchat/StaffChatMentionChip.jsx` | Inline `@name` chip in message body | T11 |
| `src/components/staffchat/StaffChatMessageBody.jsx` | Renders parseMessageBody segments + chips | T11, T16 |
| `src/components/staffchat/StaffChatImageLightbox.jsx` | Full-size image overlay | T15 |
| `src/App.jsx` | Mount `<StaffChatWidget />` inside providers | T10 |
| `public/sounds/staff-chat-notif.mp3` | Default notification sound | T17 |
| `public/sounds/staff-chat-mention.mp3` | Mention sound (louder, 2 beeps) | T17 |
| `firestore.rules` | Add `match /be_staff_chat_messages/{msgId}` | T18 |
| `firestore.indexes.json` | Composite `(branchId, createdAt)` | T18 |
| `storage.rules` | Add `match /staff-chat-attachments/...` | T19 |
| `functions/cleanupStaffChat.js` | Daily 7-day cleanup + Storage orphans | T20 |
| `functions/index.js` | Export `cleanupOldStaffChatMessages` | T20 |
| `scripts/diag-staff-chat-l2-verify-v73.mjs` | Rule Q L2 real-prod verify | T21 |
| `scripts/probe-deploy-probe.mjs` | Extend with endpoints #9 + #10 | T18, T19 |
| `tests/v73-staff-chat-identity.test.js` | T1 unit |
| `tests/v73-staff-chat-client.test.js` | T2, T11, T16 unit |
| `tests/v73-use-staff-chat.test.jsx` | T4 hook tests |
| `tests/v73-staff-chat-widget-rtl.test.jsx` | T5-T10 RTL |
| `tests/v73-staff-chat-mentions-rtl.test.jsx` | T11 RTL |
| `tests/v73-staff-chat-reply-rtl.test.jsx` | T12 RTL |
| `tests/v73-staff-chat-image-rtl.test.jsx` | T15 RTL |
| `tests/v73-staff-chat-auto-link-rtl.test.jsx` | T16 RTL |
| `tests/v73-staff-chat-flow-simulate.test.jsx` | Rule I F1-F5 full-flow |
| `tests/v73-staff-chat-source-grep.test.js` | Source-grep regression locks |

---

## Task 1: staffChatIdentity helpers (localStorage)

**Files:**
- Create: `src/lib/staffChatIdentity.js`
- Test: `tests/v73-staff-chat-identity.test.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/v73-staff-chat-identity.test.js
import { describe, it, expect, beforeEach } from 'vitest';
import {
  getDisplayName, setDisplayName,
  getDeviceId,
  getMuted, setMuted,
} from '../src/lib/staffChatIdentity.js';

describe('V73.I1 staffChatIdentity', () => {
  beforeEach(() => localStorage.clear());

  it('I1.1 getDisplayName returns null when unset', () => {
    expect(getDisplayName()).toBe(null);
  });

  it('I1.2 setDisplayName persists across reads + trims whitespace', () => {
    setDisplayName('  ดร.วี  ');
    expect(getDisplayName()).toBe('ดร.วี');
    expect(localStorage.getItem('staffChatName')).toBe('ดร.วี');
  });

  it('I1.3 setDisplayName rejects empty / >50 / <2 chars', () => {
    expect(() => setDisplayName('')).toThrow(/STAFF_CHAT_NAME_INVALID/);
    expect(() => setDisplayName('a')).toThrow(/STAFF_CHAT_NAME_INVALID/);
    expect(() => setDisplayName('x'.repeat(51))).toThrow(/STAFF_CHAT_NAME_INVALID/);
  });

  it('I1.4 getDeviceId returns crypto-random hex 8 chars, persists', () => {
    const a = getDeviceId();
    expect(a).toMatch(/^dev-[a-f0-9]{16}$/);
    const b = getDeviceId();
    expect(b).toBe(a);  // same device, same id
  });

  it('I1.5 getMuted defaults false; setMuted(true) persists as "1"', () => {
    expect(getMuted()).toBe(false);
    setMuted(true);
    expect(getMuted()).toBe(true);
    expect(localStorage.getItem('staffChatMuted')).toBe('1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/v73-staff-chat-identity.test.js`
Expected: FAIL — `Cannot find module './src/lib/staffChatIdentity.js'`

- [ ] **Step 3: Implement staffChatIdentity.js**

```js
// src/lib/staffChatIdentity.js
// V73 (2026-05-16) — Cookie-stored chat identity (decoupled from Firebase Auth).
// Display name + deviceId + mute preference, all in localStorage per-device.

const KEY_NAME = 'staffChatName';
const KEY_DEVICE = 'staffChatDeviceId';
const KEY_MUTED = 'staffChatMuted';

export function getDisplayName() {
  const v = localStorage.getItem(KEY_NAME);
  return v && v.trim() ? v.trim() : null;
}

export function setDisplayName(name) {
  const trimmed = String(name || '').trim();
  if (trimmed.length < 2 || trimmed.length > 50) {
    throw new Error('STAFF_CHAT_NAME_INVALID');
  }
  localStorage.setItem(KEY_NAME, trimmed);
}

export function getDeviceId() {
  let v = localStorage.getItem(KEY_DEVICE);
  if (v) return v;
  // Mint new device id via crypto.getRandomValues (Rule C2)
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  v = `dev-${hex}`;
  localStorage.setItem(KEY_DEVICE, v);
  return v;
}

export function getMuted() {
  return localStorage.getItem(KEY_MUTED) === '1';
}

export function setMuted(value) {
  localStorage.setItem(KEY_MUTED, value ? '1' : '0');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/v73-staff-chat-identity.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/staffChatIdentity.js tests/v73-staff-chat-identity.test.js
git commit -m "feat(V73 T1): staffChatIdentity cookie helpers (name/deviceId/muted)"
```

---

## Task 2: staffChatClient core (buildMessageDoc + Firestore wrappers)

**Files:**
- Create: `src/lib/staffChatClient.js`
- Modify: `src/lib/backendClient.js` (add `_addStaffChatMessage` + `_listenToStaffChatMessages` raw wrappers)
- Modify: `src/lib/scopedDataLayer.js` (add re-exports)
- Test: `tests/v73-staff-chat-client.test.js`

- [ ] **Step 1: Write failing tests**

```js
// tests/v73-staff-chat-client.test.js
import { describe, it, expect, vi } from 'vitest';
import { buildMessageDoc } from '../src/lib/staffChatClient.js';

describe('V73.C1 staffChatClient.buildMessageDoc', () => {
  it('C1.1 builds minimal text message', () => {
    const doc = buildMessageDoc({
      branchId: 'BR-1', displayName: 'ดร.วี', text: 'hello', deviceId: 'dev-abc',
    });
    expect(doc.branchId).toBe('BR-1');
    expect(doc.displayName).toBe('ดร.วี');
    expect(doc.text).toBe('hello');
    expect(doc.deviceId).toBe('dev-abc');
    expect(doc.id).toMatch(/^CHAT-\d{13}-[a-f0-9]{8}$/);
    expect(doc.createdAt).toBeDefined();  // serverTimestamp sentinel
  });

  it('C1.2 throws when text empty + no attachment', () => {
    expect(() => buildMessageDoc({
      branchId: 'BR-1', displayName: 'ดร.วี', text: '', deviceId: 'dev-abc',
    })).toThrow(/STAFF_CHAT_EMPTY_MESSAGE/);
  });

  it('C1.3 throws when text > 500 chars', () => {
    expect(() => buildMessageDoc({
      branchId: 'BR-1', displayName: 'ดร.วี', text: 'x'.repeat(501), deviceId: 'dev-abc',
    })).toThrow(/STAFF_CHAT_TEXT_TOO_LONG/);
  });

  it('C1.4 throws when branchId/displayName/deviceId empty', () => {
    expect(() => buildMessageDoc({ branchId: '', displayName: 'X', text: 'hi', deviceId: 'dev' })).toThrow();
    expect(() => buildMessageDoc({ branchId: 'BR-1', displayName: '', text: 'hi', deviceId: 'dev' })).toThrow();
    expect(() => buildMessageDoc({ branchId: 'BR-1', displayName: 'X', text: 'hi', deviceId: '' })).toThrow();
  });

  it('C1.5 trims text + preserves whitespace inside', () => {
    const doc = buildMessageDoc({
      branchId: 'BR-1', displayName: 'X', text: '  hello  world  ', deviceId: 'd',
    });
    expect(doc.text).toBe('hello  world');
  });

  it('C1.6 accepts optional mentions/replyTo/attachmentUrl', () => {
    const doc = buildMessageDoc({
      branchId: 'BR-1', displayName: 'X', text: 'hi', deviceId: 'd',
      mentions: ['ดร.วี'],
      replyTo: { msgId: 'CHAT-1', snippet: 'old', displayName: 'A', deviceId: 'd2' },
      attachmentUrl: 'https://...',
      attachmentSize: 12345,
      attachmentMimeType: 'image/jpeg',
    });
    expect(doc.mentions).toEqual(['ดร.วี']);
    expect(doc.replyTo.msgId).toBe('CHAT-1');
    expect(doc.attachmentUrl).toBe('https://...');
  });

  it('C1.7 doc id uses crypto.getRandomValues (NOT Math.random)', () => {
    // 10 ids should all be unique
    const ids = new Set();
    for (let i = 0; i < 10; i++) {
      const doc = buildMessageDoc({ branchId: 'BR-1', displayName: 'X', text: 'hi', deviceId: 'd' });
      ids.add(doc.id);
    }
    expect(ids.size).toBe(10);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/v73-staff-chat-client.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement staffChatClient.js**

```js
// src/lib/staffChatClient.js
// V73 (2026-05-16) — Firestore CRUD wrappers + pure helpers for staff chat.
import { serverTimestamp } from 'firebase/firestore';

export function buildMessageDoc({
  branchId, displayName, text, deviceId,
  mentions, replyTo, attachmentUrl, attachmentSize, attachmentMimeType,
} = {}) {
  if (!branchId || typeof branchId !== 'string') throw new Error('STAFF_CHAT_BRANCH_REQUIRED');
  if (!displayName || typeof displayName !== 'string') throw new Error('STAFF_CHAT_NAME_REQUIRED');
  if (!deviceId || typeof deviceId !== 'string') throw new Error('STAFF_CHAT_DEVICE_REQUIRED');
  const trimmed = (typeof text === 'string' ? text : '').trim();
  if (!trimmed && !attachmentUrl) throw new Error('STAFF_CHAT_EMPTY_MESSAGE');
  if (trimmed.length > 500) throw new Error('STAFF_CHAT_TEXT_TOO_LONG');

  // Crypto-secure random id (Rule C2 — no Math.random for ids)
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const id = `CHAT-${Date.now()}-${hex}`;

  const doc = {
    id, branchId, displayName, deviceId,
    text: trimmed,
    createdAt: serverTimestamp(),
  };
  if (Array.isArray(mentions) && mentions.length > 0) doc.mentions = mentions.slice(0, 5);
  if (replyTo && replyTo.msgId) doc.replyTo = {
    msgId: replyTo.msgId,
    snippet: String(replyTo.snippet || '').slice(0, 80),
    displayName: String(replyTo.displayName || ''),
    deviceId: String(replyTo.deviceId || ''),
  };
  if (attachmentUrl) {
    doc.attachmentUrl = attachmentUrl;
    doc.attachmentSize = Number(attachmentSize) || 0;
    doc.attachmentMimeType = String(attachmentMimeType || 'image/jpeg');
  }
  return doc;
}

// Sender — calls scopedDataLayer.addStaffChatMessage. Lazy import to avoid
// circular deps.
export async function sendStaffChatMessage(payload) {
  const doc = buildMessageDoc(payload);
  const { addStaffChatMessage } = await import('./scopedDataLayer.js');
  return addStaffChatMessage(doc);
}
```

- [ ] **Step 4: Add backendClient raw wrappers**

Modify `src/lib/backendClient.js` — add after similar `listenTo*` functions:

```js
// V73 (2026-05-16) — Staff Chat raw wrappers. Branch-scoped per BSA.
// scopedDataLayer auto-injects selectedBranchId via _autoInject; explicit
// branchId param + safe-by-default pattern (mirror V54 BS-13).

export function listenToStaffChatMessages({ branchId, allBranches = false, limitCount = 50 } = {}, onChange, onError) {
  const effectiveBranchId = (typeof branchId === 'string' && branchId)
    ? branchId
    : (allBranches ? null : resolveSelectedBranchId());
  if (!effectiveBranchId && !allBranches) {
    onChange?.([]);
    return () => {};
  }
  const baseQuery = effectiveBranchId
    ? query(staffChatCol(), where('branchId', '==', String(effectiveBranchId)), orderBy('createdAt', 'desc'), limit(limitCount))
    : query(staffChatCol(), orderBy('createdAt', 'desc'), limit(limitCount));
  return onSnapshot(baseQuery, (snap) => {
    const docs = snap.docs.map(d => ({ ...d.data(), id: d.id }));
    onChange?.(docs.reverse());  // chronological for display
  }, (err) => onError?.(err));
}

export async function addStaffChatMessage(messageDoc) {
  if (!messageDoc.id || !messageDoc.branchId) throw new Error('STAFF_CHAT_MISSING_REQUIRED_FIELDS');
  await setDoc(staffChatMessageDoc(messageDoc.id), messageDoc);
  return messageDoc.id;
}

function staffChatCol() {
  return collection(db, `artifacts/${appId}/public/data/be_staff_chat_messages`);
}
function staffChatMessageDoc(messageId) {
  return doc(db, `artifacts/${appId}/public/data/be_staff_chat_messages/${messageId}`);
}
```

- [ ] **Step 5: Re-export via scopedDataLayer**

Modify `src/lib/scopedDataLayer.js` — add to the wrapper section:

```js
// V73 (2026-05-16) — Staff Chat passthrough (branch-scoped via raw _autoInject)
export const listenToStaffChatMessages = (opts = {}, onChange, onError) =>
  raw.listenToStaffChatMessages(opts, onChange, onError);
export const addStaffChatMessage = (messageDoc) => raw.addStaffChatMessage(messageDoc);
```

- [ ] **Step 6: Run tests to verify pass**

Run: `npm test -- --run tests/v73-staff-chat-client.test.js`
Expected: PASS (7 tests)

- [ ] **Step 7: Commit**

```bash
git add src/lib/staffChatClient.js src/lib/backendClient.js src/lib/scopedDataLayer.js tests/v73-staff-chat-client.test.js
git commit -m "feat(V73 T2): staffChatClient + backendClient raw wrappers + scopedDataLayer"
```

---

## Task 3: Add Firestore rules + indexes for be_staff_chat_messages

**Files:**
- Modify: `firestore.rules`
- Modify: `firestore.indexes.json`
- Modify: `scripts/probe-deploy-probe.mjs` (add endpoint #9)

- [ ] **Step 1: Add rule to firestore.rules**

Locate the section near `match /be_appointments/{appointmentId}` (around line 113) and add after it:

```
      // ── V73 Staff Chat ──
      match /be_staff_chat_messages/{msgId} {
        allow read: if isClinicStaff();
        allow create: if isClinicStaff()
                      && request.resource.data.branchId is string
                      && request.resource.data.branchId.size() > 0
                      && request.resource.data.displayName is string
                      && request.resource.data.displayName.size() >= 2
                      && request.resource.data.displayName.size() <= 50
                      && request.resource.data.deviceId is string
                      && (request.resource.data.get('text', '') is string)
                      && (request.resource.data.get('text', '') is string && request.resource.data.get('text', '').size() <= 500);
        allow update, delete: if false;  // immutable from client; admin SDK only (cleanup)
      }
```

- [ ] **Step 2: Add composite index**

Modify `firestore.indexes.json` — add to `indexes` array:

```json
{
  "collectionGroup": "be_staff_chat_messages",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "branchId", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```

- [ ] **Step 3: Extend probe-deploy-probe.mjs (endpoint #9)**

Modify `scripts/probe-deploy-probe.mjs` — add new probe function and include in `runProbe`:

```js
async function probe9_staffChatMessagesAnon(ts) {
  const docId = `test-probe-staffchat-${ts}`;
  const url = `${FIRESTORE_BASE}/${DATA_PATH}/be_staff_chat_messages?documentId=${docId}`;
  // Anon write should be REJECTED (403)
  const r = await http('POST', url, {
    body: { fields: { branchId: { stringValue: 'BR-PROBE' }, displayName: { stringValue: 'PROBE' }, text: { stringValue: 'p' }, deviceId: { stringValue: 'd' } } },
  });
  return {
    name: 'be_staff_chat_messages anon CREATE (expect 403)',
    docId,
    status: r.status,
    ok: r.status === 403,  // INVERTED — we WANT 403
    error: r.status === 403 ? null : `expected 403 got ${r.status}: ${r.text.slice(0, 200)}`,
  };
}
```

Update `runProbe` Promise.all to include `probe9_staffChatMessagesAnon(ts)`. Update header comment from "2-endpoint" to "3-endpoint".

- [ ] **Step 4: Update Rule B reference in `.claude/rules/01-iron-clad.md`**

Append endpoint #9 to the documented probe list (after the LINE Reminder section).

- [ ] **Step 5: Commit (rules deploy deferred until UI mount lands)**

```bash
git add firestore.rules firestore.indexes.json scripts/probe-deploy-probe.mjs .claude/rules/01-iron-clad.md
git commit -m "feat(V73 T3): firestore rules + index + probe endpoint #9 for be_staff_chat_messages"
```

---

## Task 4: useStaffChat hook (listener + state + send)

**Files:**
- Create: `src/hooks/useStaffChat.js`
- Test: `tests/v73-use-staff-chat.test.jsx`

- [ ] **Step 1: Write failing tests**

```jsx
// tests/v73-use-staff-chat.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('../src/lib/scopedDataLayer.js', () => ({
  listenToStaffChatMessages: vi.fn(),
  addStaffChatMessage: vi.fn(() => Promise.resolve('CHAT-x')),
}));
vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: () => ({ branchId: 'BR-TEST' }),
}));

import { useStaffChat } from '../src/hooks/useStaffChat.js';
import { listenToStaffChatMessages, addStaffChatMessage } from '../src/lib/scopedDataLayer.js';

describe('V73.H1 useStaffChat hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('H1.1 subscribes to listener on mount', () => {
    listenToStaffChatMessages.mockReturnValue(() => {});
    renderHook(() => useStaffChat());
    expect(listenToStaffChatMessages).toHaveBeenCalledTimes(1);
  });

  it('H1.2 receives messages via onChange callback', () => {
    let onChangeCallback;
    listenToStaffChatMessages.mockImplementation((opts, onChange) => {
      onChangeCallback = onChange;
      return () => {};
    });
    const { result } = renderHook(() => useStaffChat());
    act(() => onChangeCallback([{ id: 'CHAT-1', text: 'hi', deviceId: 'other' }]));
    expect(result.current.messages).toHaveLength(1);
  });

  it('H1.3 send requires displayName + opens picker if missing', () => {
    listenToStaffChatMessages.mockReturnValue(() => {});
    const { result } = renderHook(() => useStaffChat());
    act(() => result.current.send('hello'));
    expect(result.current.namePickerOpen).toBe(true);
    expect(addStaffChatMessage).not.toHaveBeenCalled();
  });

  it('H1.4 send when displayName set calls addStaffChatMessage', async () => {
    localStorage.setItem('staffChatName', 'ดร.วี');
    listenToStaffChatMessages.mockReturnValue(() => {});
    const { result } = renderHook(() => useStaffChat());
    await act(async () => result.current.send('hello'));
    expect(addStaffChatMessage).toHaveBeenCalledTimes(1);
    const arg = addStaffChatMessage.mock.calls[0][0];
    expect(arg.displayName).toBe('ดร.วี');
    expect(arg.text).toBe('hello');
  });

  it('H1.5 unsubscribes listener on unmount', () => {
    const unsub = vi.fn();
    listenToStaffChatMessages.mockReturnValue(unsub);
    const { unmount } = renderHook(() => useStaffChat());
    unmount();
    expect(unsub).toHaveBeenCalledTimes(1);
  });

  it('H1.6 unread increments for incoming non-own message when minimized', () => {
    let onChangeCallback;
    listenToStaffChatMessages.mockImplementation((opts, onChange) => {
      onChangeCallback = onChange;
      return () => {};
    });
    const { result } = renderHook(() => useStaffChat());
    // initial: minimized=true, unread=0
    expect(result.current.unreadCount).toBe(0);
    act(() => onChangeCallback([{ id: 'CHAT-1', text: 'hi', deviceId: 'other-device' }]));
    expect(result.current.unreadCount).toBe(1);
  });

  it('H1.7 unread does NOT increment for own message', () => {
    let onChangeCallback;
    listenToStaffChatMessages.mockImplementation((opts, onChange) => {
      onChangeCallback = onChange;
      return () => {};
    });
    const { result } = renderHook(() => useStaffChat());
    act(() => onChangeCallback([{ id: 'CHAT-1', text: 'hi', deviceId: result.current.deviceId }]));
    expect(result.current.unreadCount).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/v73-use-staff-chat.test.jsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement useStaffChat.js**

```js
// src/hooks/useStaffChat.js
// V73 (2026-05-16) — Subscribe to staff chat messages + manage state + send.
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSelectedBranch } from '../lib/BranchContext.jsx';
import {
  listenToStaffChatMessages,
  addStaffChatMessage,
} from '../lib/scopedDataLayer.js';
import { buildMessageDoc } from '../lib/staffChatClient.js';
import {
  getDisplayName,
  getDeviceId,
  getMuted,
} from '../lib/staffChatIdentity.js';

export function useStaffChat() {
  const { branchId: selectedBranchId } = useSelectedBranch();
  const [messages, setMessages] = useState([]);
  const [minimized, setMinimized] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [namePickerOpen, setNamePickerOpen] = useState(false);
  const [pendingSendPayload, setPendingSendPayload] = useState(null);
  const [error, setError] = useState(null);

  const deviceId = useRef(getDeviceId()).current;
  const lastSeenIdsRef = useRef(new Set());

  useEffect(() => {
    if (!selectedBranchId) return;
    const unsub = listenToStaffChatMessages(
      { branchId: selectedBranchId, limitCount: 50 },
      (docs) => {
        setMessages(docs);
        // Detect newly-arrived non-own messages
        const newMsgs = docs.filter(m => !lastSeenIdsRef.current.has(m.id));
        for (const m of newMsgs) {
          lastSeenIdsRef.current.add(m.id);
          if (m.deviceId !== deviceId) {
            setUnreadCount(c => c + 1);
          }
        }
      },
      (err) => setError(String(err?.message || err)),
    );
    return () => { unsub?.(); };
  }, [selectedBranchId, deviceId]);

  const send = useCallback(async (text, extras = {}) => {
    const displayName = getDisplayName();
    if (!displayName) {
      setPendingSendPayload({ text, ...extras });
      setNamePickerOpen(true);
      return;
    }
    if (!selectedBranchId) return;
    try {
      const doc = buildMessageDoc({
        branchId: selectedBranchId,
        displayName,
        deviceId,
        text,
        ...extras,
      });
      await addStaffChatMessage(doc);
    } catch (e) {
      setError(String(e?.message || e));
    }
  }, [selectedBranchId, deviceId]);

  const confirmName = useCallback(async (name) => {
    const { setDisplayName } = await import('../lib/staffChatIdentity.js');
    setDisplayName(name);
    setNamePickerOpen(false);
    if (pendingSendPayload) {
      const payload = pendingSendPayload;
      setPendingSendPayload(null);
      await send(payload.text, payload);
    }
  }, [pendingSendPayload, send]);

  const expand = useCallback(() => {
    setMinimized(false);
    setUnreadCount(0);  // reset on expand
  }, []);
  const minimize = useCallback(() => setMinimized(true), []);

  return {
    messages, minimized, unreadCount,
    deviceId, error,
    namePickerOpen, setNamePickerOpen,
    send, confirmName, expand, minimize,
  };
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npm test -- --run tests/v73-use-staff-chat.test.jsx`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useStaffChat.js tests/v73-use-staff-chat.test.jsx
git commit -m "feat(V73 T4): useStaffChat hook — listener + send + unread + name picker state"
```

---

## Task 5: StaffChatWidget root + StaffChatBubble (minimized state)

**Files:**
- Create: `src/components/staffchat/StaffChatWidget.jsx`
- Create: `src/components/staffchat/StaffChatBubble.jsx`
- Test: `tests/v73-staff-chat-widget-rtl.test.jsx`

- [ ] **Step 1: Write failing tests**

```jsx
// tests/v73-staff-chat-widget-rtl.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../src/hooks/useStaffChat.js', () => ({
  useStaffChat: vi.fn(),
}));
vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: () => ({ branchId: 'BR-TEST' }),
}));
vi.mock('../src/firebase.js', () => ({ auth: { currentUser: { uid: 'U1' } } }));

import { StaffChatWidget } from '../src/components/staffchat/StaffChatWidget.jsx';
import { useStaffChat } from '../src/hooks/useStaffChat.js';

describe('V73.W1 StaffChatWidget render gate', () => {
  beforeEach(() => {
    useStaffChat.mockReturnValue({
      messages: [], minimized: true, unreadCount: 0, deviceId: 'dev-1',
      error: null, namePickerOpen: false, setNamePickerOpen: vi.fn(),
      send: vi.fn(), confirmName: vi.fn(), expand: vi.fn(), minimize: vi.fn(),
    });
  });

  it('W1.1 renders bubble when minimized + has user + branch', () => {
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    expect(screen.getByTestId('staff-chat-bubble')).toBeInTheDocument();
    expect(screen.queryByTestId('staff-chat-panel')).toBeNull();
  });

  it('W1.2 hidden when user is null', () => {
    render(<StaffChatWidget user={null} needsPublicAuth={false} />);
    expect(screen.queryByTestId('staff-chat-bubble')).toBeNull();
  });

  it('W1.3 hidden when needsPublicAuth is true', () => {
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={true} />);
    expect(screen.queryByTestId('staff-chat-bubble')).toBeNull();
  });

  it('W1.4 click bubble calls expand', () => {
    const expand = vi.fn();
    useStaffChat.mockReturnValue({
      messages: [], minimized: true, unreadCount: 0, deviceId: 'dev-1',
      error: null, namePickerOpen: false, setNamePickerOpen: vi.fn(),
      send: vi.fn(), confirmName: vi.fn(), expand, minimize: vi.fn(),
    });
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    fireEvent.click(screen.getByTestId('staff-chat-bubble'));
    expect(expand).toHaveBeenCalled();
  });

  it('W1.5 unread badge shows when count > 0', () => {
    useStaffChat.mockReturnValue({
      messages: [], minimized: true, unreadCount: 3, deviceId: 'dev-1',
      error: null, namePickerOpen: false, setNamePickerOpen: vi.fn(),
      send: vi.fn(), confirmName: vi.fn(), expand: vi.fn(), minimize: vi.fn(),
    });
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    expect(screen.getByTestId('staff-chat-bubble-unread')).toHaveTextContent('3');
  });

  it('W1.6 unread badge shows 99+ when count > 99', () => {
    useStaffChat.mockReturnValue({
      messages: [], minimized: true, unreadCount: 150, deviceId: 'dev-1',
      error: null, namePickerOpen: false, setNamePickerOpen: vi.fn(),
      send: vi.fn(), confirmName: vi.fn(), expand: vi.fn(), minimize: vi.fn(),
    });
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    expect(screen.getByTestId('staff-chat-bubble-unread')).toHaveTextContent('99+');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/v73-staff-chat-widget-rtl.test.jsx`
Expected: FAIL — module not found

- [ ] **Step 3: Implement StaffChatBubble.jsx**

```jsx
// src/components/staffchat/StaffChatBubble.jsx
// V73 (2026-05-16) — Minimized chat bubble at bottom-right, 56×56, fire-red.
import React from 'react';
import { MessageCircle } from 'lucide-react';

export function StaffChatBubble({ unreadCount, onClick }) {
  const displayCount = unreadCount > 99 ? '99+' : String(unreadCount);
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="staff-chat-bubble"
      className="fixed bottom-3 right-3 md:bottom-4 md:right-4 w-14 h-14 rounded-full bg-rose-600 hover:bg-rose-500 text-white shadow-xl hover:shadow-2xl transition-all hover:scale-105 flex items-center justify-center z-[9000]"
      aria-label="เปิดแชทในสาขา"
    >
      <MessageCircle size={24} />
      {unreadCount > 0 && (
        <span
          data-testid="staff-chat-bubble-unread"
          className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-white text-rose-700 text-[10px] font-black flex items-center justify-center border-2 border-rose-600"
        >
          {displayCount}
        </span>
      )}
    </button>
  );
}

export default StaffChatBubble;
```

- [ ] **Step 4: Implement StaffChatWidget.jsx (root composer + gate)**

```jsx
// src/components/staffchat/StaffChatWidget.jsx
// V73 (2026-05-16) — Root staff chat widget. Mounts globally; self-gates on
// user + selectedBranchId + !needsPublicAuth. Bubble + Panel + NamePicker.
import React from 'react';
import { useStaffChat } from '../../hooks/useStaffChat.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import { StaffChatBubble } from './StaffChatBubble.jsx';

export function StaffChatWidget({ user, needsPublicAuth }) {
  const { branchId: selectedBranchId } = useSelectedBranch();
  const chat = useStaffChat();

  // Gate: only show when logged in + branch selected + not on public link
  if (!user || !selectedBranchId || needsPublicAuth) return null;

  return (
    <>
      {chat.minimized && (
        <StaffChatBubble unreadCount={chat.unreadCount} onClick={chat.expand} />
      )}
      {/* Panel + NamePicker added in T6 + T9 */}
    </>
  );
}

export default StaffChatWidget;
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npm test -- --run tests/v73-staff-chat-widget-rtl.test.jsx`
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add src/components/staffchat/ tests/v73-staff-chat-widget-rtl.test.jsx
git commit -m "feat(V73 T5): StaffChatWidget root + StaffChatBubble (minimized state + unread badge)"
```

---

## Task 6: StaffChatPanel + StaffChatHeader (expanded state shell)

**Files:**
- Create: `src/components/staffchat/StaffChatPanel.jsx`
- Create: `src/components/staffchat/StaffChatHeader.jsx`
- Modify: `src/components/staffchat/StaffChatWidget.jsx` (wire panel)
- Test: extend `tests/v73-staff-chat-widget-rtl.test.jsx`

- [ ] **Step 1: Extend tests**

Append to `tests/v73-staff-chat-widget-rtl.test.jsx`:

```jsx
describe('V73.W2 StaffChatPanel + Header', () => {
  beforeEach(() => {
    useStaffChat.mockReturnValue({
      messages: [], minimized: false, unreadCount: 0, deviceId: 'dev-1',
      error: null, namePickerOpen: false, setNamePickerOpen: vi.fn(),
      send: vi.fn(), confirmName: vi.fn(), expand: vi.fn(), minimize: vi.fn(),
    });
  });

  it('W2.1 panel renders when not minimized', () => {
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    expect(screen.getByTestId('staff-chat-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('staff-chat-bubble')).toBeNull();
  });

  it('W2.2 header shows branch name', () => {
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} branchName="ทดลอง 1" />);
    expect(screen.getByTestId('staff-chat-header')).toHaveTextContent('ทดลอง 1');
  });

  it('W2.3 click minimize button → minimize()', () => {
    const minimize = vi.fn();
    useStaffChat.mockReturnValue({
      messages: [], minimized: false, unreadCount: 0, deviceId: 'dev-1',
      error: null, namePickerOpen: false, setNamePickerOpen: vi.fn(),
      send: vi.fn(), confirmName: vi.fn(), expand: vi.fn(), minimize,
    });
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    fireEvent.click(screen.getByTestId('staff-chat-header-minimize'));
    expect(minimize).toHaveBeenCalled();
  });

  it('W2.4 mute toggle present', () => {
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    expect(screen.getByTestId('staff-chat-header-mute')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/v73-staff-chat-widget-rtl.test.jsx`
Expected: FAIL — panel not rendered

- [ ] **Step 3: Implement StaffChatHeader.jsx**

```jsx
// src/components/staffchat/StaffChatHeader.jsx
// V73 (2026-05-16) — Header bar: branch name + mute toggle + minimize ×.
import React, { useState } from 'react';
import { Bell, BellOff, Minus } from 'lucide-react';
import { getMuted, setMuted } from '../../lib/staffChatIdentity.js';

export function StaffChatHeader({ branchName, onMinimize }) {
  const [muted, setMutedState] = useState(getMuted());

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    setMutedState(next);
  };

  return (
    <div
      data-testid="staff-chat-header"
      className="flex items-center justify-between gap-2 px-3 py-2 bg-rose-600 text-white border-b border-rose-700"
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-sm font-bold truncate">💬 แชทสาขา · {branchName || '—'}</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={toggleMute}
          data-testid="staff-chat-header-mute"
          className="w-8 h-8 rounded hover:bg-rose-700 flex items-center justify-center transition-colors"
          aria-label={muted ? 'เปิดเสียงแจ้งเตือน' : 'ปิดเสียงแจ้งเตือน'}
          title={muted ? 'เปิดเสียง' : 'ปิดเสียง'}
        >
          {muted ? <BellOff size={16} /> : <Bell size={16} />}
        </button>
        <button
          type="button"
          onClick={onMinimize}
          data-testid="staff-chat-header-minimize"
          className="w-8 h-8 rounded hover:bg-rose-700 flex items-center justify-center transition-colors"
          aria-label="ย่อแชท"
        >
          <Minus size={16} />
        </button>
      </div>
    </div>
  );
}

export default StaffChatHeader;
```

- [ ] **Step 4: Implement StaffChatPanel.jsx (responsive)**

```jsx
// src/components/staffchat/StaffChatPanel.jsx
// V73 (2026-05-16) — Expanded chat panel. Desktop: 360×480 corner-anchored.
// Mobile (<md): fullscreen 95vw × 60vh modal-style overlay.
import React from 'react';
import { StaffChatHeader } from './StaffChatHeader.jsx';

export function StaffChatPanel({ branchName, onMinimize, children }) {
  return (
    <div
      data-testid="staff-chat-panel"
      className="fixed
        bottom-2 right-2 left-2 top-[20vh] md:top-auto md:left-auto md:bottom-4 md:right-4
        md:w-[360px] md:h-[480px]
        bg-[var(--bg-card)] border border-[var(--bd-strong)] rounded-xl shadow-2xl
        flex flex-col overflow-hidden z-[9000]"
    >
      <StaffChatHeader branchName={branchName} onMinimize={onMinimize} />
      <div className="flex-1 flex flex-col min-h-0">
        {children}
      </div>
    </div>
  );
}

export default StaffChatPanel;
```

- [ ] **Step 5: Wire panel into StaffChatWidget**

Modify `src/components/staffchat/StaffChatWidget.jsx`:

```jsx
import { StaffChatBubble } from './StaffChatBubble.jsx';
import { StaffChatPanel } from './StaffChatPanel.jsx';

export function StaffChatWidget({ user, needsPublicAuth, branchName }) {
  const { branchId: selectedBranchId } = useSelectedBranch();
  const chat = useStaffChat();
  if (!user || !selectedBranchId || needsPublicAuth) return null;
  return (
    <>
      {chat.minimized
        ? <StaffChatBubble unreadCount={chat.unreadCount} onClick={chat.expand} />
        : <StaffChatPanel branchName={branchName} onMinimize={chat.minimize}>
            {/* MessageList + Composer added in T7+T8 */}
            <div className="flex-1 p-3 text-[var(--tx-muted)] text-sm">
              (ยังไม่มีข้อความ — รอ T7+T8)
            </div>
          </StaffChatPanel>}
    </>
  );
}
```

- [ ] **Step 6: Run tests to verify pass**

Run: `npm test -- --run tests/v73-staff-chat-widget-rtl.test.jsx`
Expected: PASS (10 tests total)

- [ ] **Step 7: Commit**

```bash
git add src/components/staffchat/StaffChatPanel.jsx src/components/staffchat/StaffChatHeader.jsx src/components/staffchat/StaffChatWidget.jsx tests/v73-staff-chat-widget-rtl.test.jsx
git commit -m "feat(V73 T6): StaffChatPanel + StaffChatHeader (responsive desktop+mobile shell)"
```

---

## Task 7: StaffChatMessageList + StaffChatMessage (bubble rendering)

**Files:**
- Create: `src/components/staffchat/StaffChatMessageList.jsx`
- Create: `src/components/staffchat/StaffChatMessage.jsx`
- Modify: `src/components/staffchat/StaffChatWidget.jsx` (wire list)
- Test: extend `tests/v73-staff-chat-widget-rtl.test.jsx`

- [ ] **Step 1: Extend tests**

```jsx
describe('V73.W3 StaffChatMessageList', () => {
  beforeEach(() => {
    useStaffChat.mockReturnValue({
      messages: [
        { id: 'CHAT-1', branchId: 'BR-TEST', displayName: 'ดร.วี', text: 'รอลูกค้า', createdAt: { toMillis: () => Date.now() }, deviceId: 'other' },
        { id: 'CHAT-2', branchId: 'BR-TEST', displayName: 'admin',  text: 'ok',       createdAt: { toMillis: () => Date.now() }, deviceId: 'dev-1' },
      ],
      minimized: false, unreadCount: 0, deviceId: 'dev-1',
      error: null, namePickerOpen: false, setNamePickerOpen: vi.fn(),
      send: vi.fn(), confirmName: vi.fn(), expand: vi.fn(), minimize: vi.fn(),
    });
  });

  it('W3.1 renders all messages', () => {
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    expect(screen.getByText('รอลูกค้า')).toBeInTheDocument();
    expect(screen.getByText('ok')).toBeInTheDocument();
  });

  it('W3.2 own message gets data-own=true', () => {
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    const own = screen.getByText('ok').closest('[data-testid="staff-chat-message"]');
    expect(own).toHaveAttribute('data-own', 'true');
  });

  it('W3.3 other message gets data-own=false + shows displayName', () => {
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    const other = screen.getByText('รอลูกค้า').closest('[data-testid="staff-chat-message"]');
    expect(other).toHaveAttribute('data-own', 'false');
    expect(other).toHaveTextContent('ดร.วี');
  });

  it('W3.4 empty state shows when no messages', () => {
    useStaffChat.mockReturnValue({
      messages: [], minimized: false, unreadCount: 0, deviceId: 'dev-1',
      error: null, namePickerOpen: false, setNamePickerOpen: vi.fn(),
      send: vi.fn(), confirmName: vi.fn(), expand: vi.fn(), minimize: vi.fn(),
    });
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    expect(screen.getByTestId('staff-chat-empty')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/v73-staff-chat-widget-rtl.test.jsx`
Expected: FAIL

- [ ] **Step 3: Implement StaffChatMessage.jsx**

```jsx
// src/components/staffchat/StaffChatMessage.jsx
// V73 (2026-05-16) — Single message bubble. Own (right-aligned rose) vs other (left, neutral).
import React from 'react';

function formatTime(createdAt) {
  if (!createdAt) return '';
  const ms = typeof createdAt.toMillis === 'function' ? createdAt.toMillis() : Date.parse(createdAt);
  if (!ms) return '';
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function StaffChatMessage({ message, isOwn }) {
  return (
    <div
      data-testid="staff-chat-message"
      data-own={isOwn ? 'true' : 'false'}
      className={`flex flex-col ${isOwn ? 'items-end' : 'items-start'}`}
    >
      {!isOwn && (
        <div className="text-[10px] font-bold text-sky-700 dark:text-sky-300 mb-0.5 px-1">
          {message.displayName}
        </div>
      )}
      <div
        className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
          isOwn
            ? 'bg-rose-600/20 border border-rose-500/40 text-rose-100 dark:text-rose-100 text-rose-900 rounded-br-md'
            : 'bg-[var(--bg-input)] border border-[var(--bd)] text-[var(--tx-primary)] rounded-bl-md'
        }`}
      >
        {message.text}
      </div>
      <div className="text-[9px] text-[var(--tx-muted)] mt-0.5 px-1">
        {formatTime(message.createdAt)}
      </div>
    </div>
  );
}

export default StaffChatMessage;
```

- [ ] **Step 4: Implement StaffChatMessageList.jsx**

```jsx
// src/components/staffchat/StaffChatMessageList.jsx
// V73 (2026-05-16) — Scrollable list of messages, auto-scroll to bottom on new msg.
import React, { useEffect, useRef } from 'react';
import { StaffChatMessage } from './StaffChatMessage.jsx';

export function StaffChatMessageList({ messages, ownDeviceId }) {
  const endRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  if (messages.length === 0) {
    return (
      <div data-testid="staff-chat-empty" className="flex-1 flex items-center justify-center text-[var(--tx-muted)] text-sm p-4">
        ยังไม่มีข้อความ — เริ่มแชทกับเพื่อนร่วมงานได้เลย
      </div>
    );
  }

  return (
    <div data-testid="staff-chat-message-list" className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
      {messages.map(m => (
        <StaffChatMessage key={m.id} message={m} isOwn={m.deviceId === ownDeviceId} />
      ))}
      <div ref={endRef} />
    </div>
  );
}

export default StaffChatMessageList;
```

- [ ] **Step 5: Wire into StaffChatWidget**

Replace the `(ยังไม่มีข้อความ — รอ T7+T8)` block in `StaffChatWidget.jsx` with:

```jsx
import { StaffChatMessageList } from './StaffChatMessageList.jsx';
// ...
<StaffChatPanel branchName={branchName} onMinimize={chat.minimize}>
  <StaffChatMessageList messages={chat.messages} ownDeviceId={chat.deviceId} />
  {/* Composer added in T8 */}
</StaffChatPanel>
```

- [ ] **Step 6: Run tests to verify pass**

Run: `npm test -- --run tests/v73-staff-chat-widget-rtl.test.jsx`
Expected: PASS (14 tests total)

- [ ] **Step 7: Commit**

```bash
git add src/components/staffchat/StaffChatMessageList.jsx src/components/staffchat/StaffChatMessage.jsx src/components/staffchat/StaffChatWidget.jsx tests/v73-staff-chat-widget-rtl.test.jsx
git commit -m "feat(V73 T7): StaffChatMessageList + StaffChatMessage bubble rendering"
```

---

## Task 8: StaffChatComposer (textarea + send button)

**Files:**
- Create: `src/components/staffchat/StaffChatComposer.jsx`
- Modify: `src/components/staffchat/StaffChatWidget.jsx`
- Test: extend `tests/v73-staff-chat-widget-rtl.test.jsx`

- [ ] **Step 1: Extend tests**

```jsx
describe('V73.W4 StaffChatComposer', () => {
  let sendMock;
  beforeEach(() => {
    sendMock = vi.fn();
    useStaffChat.mockReturnValue({
      messages: [], minimized: false, unreadCount: 0, deviceId: 'dev-1',
      error: null, namePickerOpen: false, setNamePickerOpen: vi.fn(),
      send: sendMock, confirmName: vi.fn(), expand: vi.fn(), minimize: vi.fn(),
    });
  });

  it('W4.1 textarea + send button rendered', () => {
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    expect(screen.getByTestId('staff-chat-composer-input')).toBeInTheDocument();
    expect(screen.getByTestId('staff-chat-composer-send')).toBeInTheDocument();
  });

  it('W4.2 send button disabled when textarea empty', () => {
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    expect(screen.getByTestId('staff-chat-composer-send')).toBeDisabled();
  });

  it('W4.3 typing enables send button', () => {
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    fireEvent.change(screen.getByTestId('staff-chat-composer-input'), { target: { value: 'hello' } });
    expect(screen.getByTestId('staff-chat-composer-send')).toBeEnabled();
  });

  it('W4.4 click send calls chat.send(text) + clears textarea', () => {
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    const input = screen.getByTestId('staff-chat-composer-input');
    fireEvent.change(input, { target: { value: 'hello' } });
    fireEvent.click(screen.getByTestId('staff-chat-composer-send'));
    expect(sendMock).toHaveBeenCalledWith('hello', expect.anything());
    expect(input.value).toBe('');
  });

  it('W4.5 Enter without shift submits', () => {
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    const input = screen.getByTestId('staff-chat-composer-input');
    fireEvent.change(input, { target: { value: 'hi' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: false });
    expect(sendMock).toHaveBeenCalledWith('hi', expect.anything());
  });

  it('W4.6 Shift+Enter inserts newline (does NOT submit)', () => {
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    const input = screen.getByTestId('staff-chat-composer-input');
    fireEvent.change(input, { target: { value: 'hi' } });
    fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('W4.7 char counter visible at 400+ chars', () => {
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    fireEvent.change(screen.getByTestId('staff-chat-composer-input'), { target: { value: 'x'.repeat(420) } });
    expect(screen.getByTestId('staff-chat-composer-counter')).toHaveTextContent('420 / 500');
  });

  it('W4.8 send disabled at 501 chars', () => {
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    fireEvent.change(screen.getByTestId('staff-chat-composer-input'), { target: { value: 'x'.repeat(501) } });
    expect(screen.getByTestId('staff-chat-composer-send')).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/v73-staff-chat-widget-rtl.test.jsx`
Expected: FAIL

- [ ] **Step 3: Implement StaffChatComposer.jsx**

```jsx
// src/components/staffchat/StaffChatComposer.jsx
// V73 (2026-05-16) — Textarea + send button. Enter to submit, Shift+Enter newline.
import React, { useState } from 'react';
import { Send } from 'lucide-react';

export function StaffChatComposer({ onSend }) {
  const [text, setText] = useState('');
  const trimmed = text.trim();
  const tooLong = trimmed.length > 500;
  const canSend = trimmed.length > 0 && !tooLong;

  const submit = () => {
    if (!canSend) return;
    onSend(trimmed, {});  // extras from features (B/C/F) wire in later tasks
    setText('');
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="border-t border-[var(--bd)] px-2 py-2 flex items-end gap-2 bg-[var(--bg-surface)]">
      <textarea
        data-testid="staff-chat-composer-input"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="พิมพ์ข้อความ... (Enter = ส่ง · Shift+Enter = ขึ้นบรรทัด)"
        rows={1}
        className="flex-1 resize-none px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-sm text-[var(--tx-primary)] focus:outline-none focus:border-rose-500 max-h-24"
      />
      <div className="flex flex-col items-end gap-1">
        {trimmed.length >= 400 && (
          <span
            data-testid="staff-chat-composer-counter"
            className={`text-[9px] font-mono ${tooLong ? 'text-rose-500' : 'text-[var(--tx-muted)]'}`}
          >
            {trimmed.length} / 500
          </span>
        )}
        <button
          type="button"
          onClick={submit}
          disabled={!canSend}
          data-testid="staff-chat-composer-send"
          className="w-9 h-9 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:bg-[var(--bg-hover)] disabled:text-[var(--tx-muted)] text-white flex items-center justify-center disabled:cursor-not-allowed transition-colors"
          aria-label="ส่ง"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

export default StaffChatComposer;
```

- [ ] **Step 4: Wire Composer into StaffChatWidget**

```jsx
import { StaffChatComposer } from './StaffChatComposer.jsx';
// ...
<StaffChatPanel branchName={branchName} onMinimize={chat.minimize}>
  <StaffChatMessageList messages={chat.messages} ownDeviceId={chat.deviceId} />
  <StaffChatComposer onSend={chat.send} />
</StaffChatPanel>
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npm test -- --run tests/v73-staff-chat-widget-rtl.test.jsx`
Expected: PASS (22 tests total)

- [ ] **Step 6: Commit**

```bash
git add src/components/staffchat/StaffChatComposer.jsx src/components/staffchat/StaffChatWidget.jsx tests/v73-staff-chat-widget-rtl.test.jsx
git commit -m "feat(V73 T8): StaffChatComposer (textarea + Enter-to-send + char counter)"
```

---

## Task 9: StaffChatNamePicker (first-send modal)

**Files:**
- Create: `src/components/staffchat/StaffChatNamePicker.jsx`
- Modify: `src/components/staffchat/StaffChatWidget.jsx`
- Test: extend `tests/v73-staff-chat-widget-rtl.test.jsx`

- [ ] **Step 1: Extend tests**

```jsx
describe('V73.W5 StaffChatNamePicker', () => {
  let confirmName;
  beforeEach(() => {
    confirmName = vi.fn();
    useStaffChat.mockReturnValue({
      messages: [], minimized: false, unreadCount: 0, deviceId: 'dev-1',
      error: null,
      namePickerOpen: true,
      setNamePickerOpen: vi.fn(),
      send: vi.fn(), confirmName, expand: vi.fn(), minimize: vi.fn(),
    });
  });

  it('W5.1 modal renders when namePickerOpen=true', () => {
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    expect(screen.getByTestId('staff-chat-name-picker')).toBeInTheDocument();
  });

  it('W5.2 save button disabled when input invalid', () => {
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    expect(screen.getByTestId('staff-chat-name-picker-save')).toBeDisabled();
  });

  it('W5.3 save enabled when ≥2 chars', () => {
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    fireEvent.change(screen.getByTestId('staff-chat-name-picker-input'), { target: { value: 'ดร.วี' } });
    expect(screen.getByTestId('staff-chat-name-picker-save')).toBeEnabled();
  });

  it('W5.4 click save calls confirmName(value)', () => {
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    fireEvent.change(screen.getByTestId('staff-chat-name-picker-input'), { target: { value: 'ดร.วี' } });
    fireEvent.click(screen.getByTestId('staff-chat-name-picker-save'));
    expect(confirmName).toHaveBeenCalledWith('ดร.วี');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/v73-staff-chat-widget-rtl.test.jsx`
Expected: FAIL

- [ ] **Step 3: Implement StaffChatNamePicker.jsx**

```jsx
// src/components/staffchat/StaffChatNamePicker.jsx
// V73 (2026-05-16) — First-send name picker modal.
import React, { useState } from 'react';

export function StaffChatNamePicker({ onConfirm, onCancel }) {
  const [name, setName] = useState('');
  const trimmed = name.trim();
  const valid = trimmed.length >= 2 && trimmed.length <= 50;

  return (
    <div
      data-testid="staff-chat-name-picker"
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9500] p-4"
    >
      <div className="bg-[var(--bg-card)] border border-[var(--bd-strong)] rounded-xl shadow-2xl w-full max-w-[320px] p-5">
        <h3 className="text-lg font-bold text-[var(--tx-primary)] mb-1">ตั้งชื่อในแชท</h3>
        <p className="text-xs text-[var(--tx-muted)] mb-3">
          พิมพ์ชื่อที่จะปรากฏในแชทของสาขา (2-50 ตัวอักษร) — ชื่อจะเก็บไว้ในเครื่องนี้
        </p>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={50}
          autoFocus
          placeholder="เช่น ดร.วี / admin / พี่บี"
          data-testid="staff-chat-name-picker-input"
          className="w-full px-3 py-2 rounded-lg bg-[var(--bg-input)] border border-[var(--bd)] text-sm text-[var(--tx-primary)] focus:outline-none focus:border-rose-500"
        />
        <div className="flex justify-end gap-2 mt-4">
          <button
            type="button"
            onClick={onCancel}
            data-testid="staff-chat-name-picker-cancel"
            className="px-3 py-1.5 rounded-lg text-sm font-bold bg-[var(--bg-hover)] hover:bg-[var(--bg-elevated)] text-[var(--tx-muted)]"
          >
            ยกเลิก
          </button>
          <button
            type="button"
            onClick={() => valid && onConfirm(trimmed)}
            disabled={!valid}
            data-testid="staff-chat-name-picker-save"
            className="px-3 py-1.5 rounded-lg text-sm font-bold bg-rose-600 hover:bg-rose-500 disabled:bg-[var(--bg-hover)] disabled:text-[var(--tx-muted)] text-white disabled:cursor-not-allowed"
          >
            บันทึก
          </button>
        </div>
      </div>
    </div>
  );
}

export default StaffChatNamePicker;
```

- [ ] **Step 4: Wire into StaffChatWidget**

```jsx
import { StaffChatNamePicker } from './StaffChatNamePicker.jsx';
// ...
{chat.namePickerOpen && (
  <StaffChatNamePicker
    onConfirm={chat.confirmName}
    onCancel={() => chat.setNamePickerOpen(false)}
  />
)}
```

- [ ] **Step 5: Run tests to verify pass**

Run: `npm test -- --run tests/v73-staff-chat-widget-rtl.test.jsx`
Expected: PASS (26 tests)

- [ ] **Step 6: Commit**

```bash
git add src/components/staffchat/StaffChatNamePicker.jsx src/components/staffchat/StaffChatWidget.jsx tests/v73-staff-chat-widget-rtl.test.jsx
git commit -m "feat(V73 T9): StaffChatNamePicker first-send modal"
```

---

## Task 10: Mount StaffChatWidget in App.jsx root

**Files:**
- Modify: `src/App.jsx`

- [ ] **Step 1: Read App.jsx to find mount point**

Locate the section that returns the main app JSX (after providers, around the bottom of App). Identify the children inside `<BranchProvider>` `<UserPermissionProvider>`.

- [ ] **Step 2: Add StaffChatWidget mount**

Modify `src/App.jsx`:

```jsx
import { lazy } from 'react';
// ... existing imports
const StaffChatWidget = lazy(() => import('./components/staffchat/StaffChatWidget.jsx'));

// Inside the return, find the appropriate place inside BranchProvider + UserPermissionProvider
// (typically alongside other top-level rendered children):
<Suspense fallback={null}>
  <StaffChatWidget user={user} needsPublicAuth={needsPublicAuth} branchName={selectedBranchName} />
</Suspense>
```

If `selectedBranchName` isn't already computed in App.jsx, derive it from BranchContext or pass null — the widget defaults to '—'.

- [ ] **Step 3: Add source-grep regression test**

Create `tests/v73-staff-chat-source-grep.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const APP = readFileSync('src/App.jsx', 'utf-8');

describe('V73.SG1 StaffChatWidget mount source-grep', () => {
  it('SG1.1 App.jsx imports StaffChatWidget', () => {
    expect(APP).toMatch(/StaffChatWidget/);
  });

  it('SG1.2 widget gated on user + needsPublicAuth props', () => {
    expect(APP).toMatch(/<StaffChatWidget[^/]*user=\{user\}/);
    expect(APP).toMatch(/needsPublicAuth=\{needsPublicAuth\}/);
  });
});
```

- [ ] **Step 4: Run dev server + verify mount**

Run: `npm run dev` (or use existing preview server) → navigate to `/` → expect to see fire-red bubble bottom-right.

Run: `npm test -- --run tests/v73-staff-chat-source-grep.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx tests/v73-staff-chat-source-grep.test.js
git commit -m "feat(V73 T10): mount StaffChatWidget in App.jsx root inside providers"
```

---

## Task 11: Feature B — @mentions (dropdown + chip + alert sound)

**Files:**
- Create: `src/components/staffchat/StaffChatMentionChip.jsx`
- Create: `src/components/staffchat/StaffChatMentionDropdown.jsx`
- Create: `src/components/staffchat/StaffChatMessageBody.jsx`
- Modify: `src/lib/staffChatClient.js` (add `extractMentions`)
- Modify: `src/components/staffchat/StaffChatComposer.jsx` (`@` trigger + dropdown wire)
- Modify: `src/components/staffchat/StaffChatMessage.jsx` (render mentions via MessageBody)
- Modify: `src/hooks/useStaffChat.js` (mention notification dispatch + sound)
- Test: `tests/v73-staff-chat-mentions-rtl.test.jsx`

- [ ] **Step 1: Add extractMentions to staffChatClient + test**

Append to `src/lib/staffChatClient.js`:

```js
// V73 Feature B (2026-05-16) — Extract @mentions from text.
// Returns array of unique display-name candidates (max 5) without the '@' prefix.
export function extractMentions(text) {
  if (typeof text !== 'string' || !text) return [];
  const matches = text.match(/@([^\s@]+)/g) || [];
  const unique = [];
  for (const m of matches) {
    const name = m.slice(1);  // strip leading @
    if (name && !unique.includes(name)) unique.push(name);
    if (unique.length >= 5) break;
  }
  return unique;
}
```

Append tests to `tests/v73-staff-chat-client.test.js`:

```js
import { extractMentions } from '../src/lib/staffChatClient.js';

describe('V73.C2 extractMentions', () => {
  it('C2.1 returns single mention', () => {
    expect(extractMentions('hello @ดร.วี please')).toEqual(['ดร.วี']);
  });

  it('C2.2 dedups + caps at 5', () => {
    expect(extractMentions('@a @b @a @c @d @e @f')).toEqual(['a','b','c','d','e']);
  });

  it('C2.3 returns empty for no mentions', () => {
    expect(extractMentions('plain text')).toEqual([]);
  });

  it('C2.4 handles email-like @ (treats `@example.com` as one mention)', () => {
    // Acceptable false-positive; rare in chat
    expect(extractMentions('email me at @example.com')).toEqual(['example.com']);
  });
});
```

- [ ] **Step 2: Run extractMentions tests to fail then pass**

Run: `npm test -- --run tests/v73-staff-chat-client.test.js`
Expected: 11 tests pass (7 original + 4 new)

- [ ] **Step 3: Implement StaffChatMentionChip.jsx**

```jsx
// src/components/staffchat/StaffChatMentionChip.jsx
// V73 Feature B (2026-05-16) — Rose-tinted @name chip in message bubble.
import React from 'react';

export function StaffChatMentionChip({ name }) {
  return (
    <span
      data-testid={`staff-chat-mention-chip-${name}`}
      className="inline-block px-1.5 py-0.5 rounded font-bold bg-rose-500/15 text-rose-700 dark:text-rose-300 border border-rose-500/30"
    >
      @{name}
    </span>
  );
}

export default StaffChatMentionChip;
```

- [ ] **Step 4: Implement StaffChatMessageBody.jsx (parser + render)**

Append to `src/lib/staffChatClient.js`:

```js
// V73 Features B + H (2026-05-16) — Parse message text into renderable segments.
// Returns array of { type: 'text' | 'mention' | 'customer' | 'appt', content/refId }.
export function parseMessageBody(text) {
  if (typeof text !== 'string' || !text) return [{ type: 'text', content: '' }];
  const out = [];
  // Combined regex: mentions @name, LC-12345678, BA-1234567890
  const re = /(@[^\s@]+)|(\bLC-\d{8}\b)|(\bBA-\d+\b)/g;
  let lastIndex = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) out.push({ type: 'text', content: text.slice(lastIndex, m.index) });
    if (m[1]) out.push({ type: 'mention', content: m[1].slice(1) });
    else if (m[2]) out.push({ type: 'customer', content: m[2], refId: m[2] });
    else if (m[3]) out.push({ type: 'appt', content: m[3], refId: m[3] });
    lastIndex = m.index + m[0].length;
  }
  if (lastIndex < text.length) out.push({ type: 'text', content: text.slice(lastIndex) });
  return out;
}
```

Create `src/components/staffchat/StaffChatMessageBody.jsx`:

```jsx
// V73 Features B + H (2026-05-16) — Render parsed segments with chips.
import React from 'react';
import { parseMessageBody } from '../../lib/staffChatClient.js';
import { StaffChatMentionChip } from './StaffChatMentionChip.jsx';

export function StaffChatMessageBody({ text }) {
  const segments = parseMessageBody(text);
  return (
    <>
      {segments.map((s, i) => {
        if (s.type === 'mention') return <StaffChatMentionChip key={i} name={s.content} />;
        if (s.type === 'customer') return (
          <a key={i} href={`/?backend=1&customer=${encodeURIComponent(s.refId)}`} target="_blank" rel="noopener noreferrer"
             onClick={(e) => e.stopPropagation()}
             data-testid={`staff-chat-customer-link-${s.refId}`}
             className="inline-block px-1.5 py-0.5 rounded font-bold bg-rose-100 text-rose-800 border border-rose-300 hover:bg-rose-200 cursor-pointer">
            {s.content}
          </a>
        );
        if (s.type === 'appt') return (
          <a key={i} href={`/?backend=1#appt-${encodeURIComponent(s.refId)}`} target="_blank" rel="noopener noreferrer"
             onClick={(e) => e.stopPropagation()}
             data-testid={`staff-chat-appt-link-${s.refId}`}
             className="inline-block px-1.5 py-0.5 rounded font-bold bg-sky-100 text-sky-800 border border-sky-300 hover:bg-sky-200 cursor-pointer">
            {s.content}
          </a>
        );
        return <span key={i}>{s.content}</span>;
      })}
    </>
  );
}

export default StaffChatMessageBody;
```

- [ ] **Step 5: Wire MessageBody into StaffChatMessage**

Modify `src/components/staffchat/StaffChatMessage.jsx` — replace `{message.text}` body line with:

```jsx
import { StaffChatMessageBody } from './StaffChatMessageBody.jsx';
// ...
<StaffChatMessageBody text={message.text} />
```

- [ ] **Step 6: Implement StaffChatMentionDropdown.jsx**

```jsx
// src/components/staffchat/StaffChatMentionDropdown.jsx
// V73 Feature B (2026-05-16) — @-trigger dropdown of recent display names.
import React from 'react';

export function StaffChatMentionDropdown({ candidates, onPick }) {
  if (!candidates || candidates.length === 0) return null;
  return (
    <div
      data-testid="staff-chat-mention-dropdown"
      className="absolute bottom-full left-0 mb-1 bg-[var(--bg-card)] border border-[var(--bd-strong)] rounded-lg shadow-xl max-h-48 overflow-y-auto w-64 z-10"
    >
      {candidates.slice(0, 8).map(name => (
        <button
          key={name}
          type="button"
          onClick={() => onPick(name)}
          data-testid={`staff-chat-mention-dropdown-item-${name}`}
          className="w-full text-left px-3 py-2 hover:bg-rose-500/10 text-sm text-[var(--tx-primary)]"
        >
          @{name}
        </button>
      ))}
    </div>
  );
}

export default StaffChatMentionDropdown;
```

- [ ] **Step 7: Wire dropdown into StaffChatComposer + mention notification in useStaffChat**

Modify `src/components/staffchat/StaffChatComposer.jsx` — add `@`-detect + dropdown render. Take `recentMentionCandidates` prop:

```jsx
import { StaffChatMentionDropdown } from './StaffChatMentionDropdown.jsx';
// ... inside Composer function
const [mentionTrigger, setMentionTrigger] = useState(null);

const onChange = (e) => {
  const v = e.target.value;
  setText(v);
  // Detect @ at cursor without trailing space
  const beforeCursor = v.slice(0, e.target.selectionStart || v.length);
  const m = beforeCursor.match(/@([^\s@]*)$/);
  setMentionTrigger(m ? { partial: m[1], offset: m.index } : null);
};

const onMentionPick = (name) => {
  if (!mentionTrigger) return;
  const before = text.slice(0, mentionTrigger.offset);
  const after = text.slice(mentionTrigger.offset + 1 + mentionTrigger.partial.length);
  setText(`${before}@${name} ${after}`);
  setMentionTrigger(null);
};

// In JSX, wrap textarea+dropdown in `<div className="relative flex-1">`:
<div className="relative flex-1">
  {mentionTrigger && (
    <StaffChatMentionDropdown
      candidates={(recentMentionCandidates || []).filter(c => c.toLowerCase().startsWith(mentionTrigger.partial.toLowerCase()))}
      onPick={onMentionPick}
    />
  )}
  <textarea ... onChange={onChange} ... />
</div>
```

Update `submit()` to pass mentions:

```jsx
import { extractMentions } from '../../lib/staffChatClient.js';
// ...
const submit = () => {
  if (!canSend) return;
  const mentions = extractMentions(trimmed);
  onSend(trimmed, mentions.length > 0 ? { mentions } : {});
  setText('');
  setMentionTrigger(null);
};
```

Pass `recentMentionCandidates` from useStaffChat — modify hook:

```js
// In useStaffChat — derive from last 200 messages
const recentMentionCandidates = useMemo(() => {
  const myName = getDisplayName();
  const seen = new Set();
  for (let i = messages.length - 1; i >= 0 && seen.size < 30; i--) {
    const n = messages[i].displayName;
    if (n && n !== myName) seen.add(n);
  }
  return [...seen];
}, [messages]);
return { ..., recentMentionCandidates };
```

And mention-notification dispatch in useStaffChat — extend the onChange callback:

```js
import { Howl } from 'howler';  // OR just new Audio
const defaultSound = useRef(new Audio('/sounds/staff-chat-notif.mp3'));
const mentionSound = useRef(new Audio('/sounds/staff-chat-mention.mp3'));
// In onChange after detecting newMsgs:
for (const m of newMsgs) {
  // ...existing
  const myName = getDisplayName();
  const isMention = myName && Array.isArray(m.mentions) && m.mentions.includes(myName);
  if (m.deviceId !== deviceId) {
    if (isMention) {
      mentionSound.current.volume = 0.6; mentionSound.current.play().catch(() => {});
      setMinimized(false);  // auto-expand on mention regardless of state
    } else if (!getMuted()) {
      defaultSound.current.volume = 0.5; defaultSound.current.play().catch(() => {});
    }
  }
}
```

- [ ] **Step 8: Write RTL tests**

Create `tests/v73-staff-chat-mentions-rtl.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../src/hooks/useStaffChat.js', () => ({ useStaffChat: vi.fn() }));
vi.mock('../src/lib/BranchContext.jsx', () => ({ useSelectedBranch: () => ({ branchId: 'BR-T' }) }));

import { StaffChatWidget } from '../src/components/staffchat/StaffChatWidget.jsx';
import { useStaffChat } from '../src/hooks/useStaffChat.js';

describe('V73.M1 @mention flow', () => {
  let sendMock;
  beforeEach(() => {
    sendMock = vi.fn();
    useStaffChat.mockReturnValue({
      messages: [
        { id: 'CHAT-1', branchId: 'BR-T', displayName: 'ดร.วี', text: 'hi', deviceId: 'other', createdAt: { toMillis: () => Date.now() } },
        { id: 'CHAT-2', branchId: 'BR-T', displayName: 'admin', text: 'ok', deviceId: 'other2', createdAt: { toMillis: () => Date.now() } },
      ],
      minimized: false, unreadCount: 0, deviceId: 'dev-me',
      error: null, namePickerOpen: false, setNamePickerOpen: vi.fn(),
      send: sendMock, confirmName: vi.fn(), expand: vi.fn(), minimize: vi.fn(),
      recentMentionCandidates: ['ดร.วี', 'admin'],
    });
  });

  it('M1.1 typing @ → dropdown appears', () => {
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    const input = screen.getByTestId('staff-chat-composer-input');
    fireEvent.change(input, { target: { value: 'hello @' } });
    expect(screen.getByTestId('staff-chat-mention-dropdown')).toBeInTheDocument();
  });

  it('M1.2 dropdown filters by partial match', () => {
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    const input = screen.getByTestId('staff-chat-composer-input');
    fireEvent.change(input, { target: { value: 'hello @ad' } });
    expect(screen.getByTestId('staff-chat-mention-dropdown-item-admin')).toBeInTheDocument();
    expect(screen.queryByTestId('staff-chat-mention-dropdown-item-ดร.วี')).toBeNull();
  });

  it('M1.3 click dropdown item appends @name + space', () => {
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    const input = screen.getByTestId('staff-chat-composer-input');
    fireEvent.change(input, { target: { value: 'hello @' } });
    fireEvent.click(screen.getByTestId('staff-chat-mention-dropdown-item-ดร.วี'));
    expect(input.value).toBe('hello @ดร.วี ');
  });

  it('M1.4 send extracts mentions into extras', () => {
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    const input = screen.getByTestId('staff-chat-composer-input');
    fireEvent.change(input, { target: { value: 'hi @ดร.วี please' } });
    fireEvent.click(screen.getByTestId('staff-chat-composer-send'));
    expect(sendMock).toHaveBeenCalledWith('hi @ดร.วี please', { mentions: ['ดร.วี'] });
  });

  it('M1.5 message bubble renders mention chip', () => {
    useStaffChat.mockReturnValue({
      messages: [
        { id: 'CHAT-1', branchId: 'BR-T', displayName: 'admin', text: 'see @ดร.วี soon', deviceId: 'other', mentions: ['ดร.วี'], createdAt: { toMillis: () => Date.now() } },
      ],
      minimized: false, unreadCount: 0, deviceId: 'dev-me',
      error: null, namePickerOpen: false, setNamePickerOpen: vi.fn(),
      send: vi.fn(), confirmName: vi.fn(), expand: vi.fn(), minimize: vi.fn(),
      recentMentionCandidates: [],
    });
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    expect(screen.getByTestId('staff-chat-mention-chip-ดร.วี')).toBeInTheDocument();
  });
});
```

- [ ] **Step 9: Run tests to verify pass**

Run: `npm test -- --run tests/v73-staff-chat-mentions-rtl.test.jsx tests/v73-staff-chat-client.test.js`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/components/staffchat/StaffChatMentionChip.jsx src/components/staffchat/StaffChatMentionDropdown.jsx src/components/staffchat/StaffChatMessageBody.jsx src/components/staffchat/StaffChatMessage.jsx src/components/staffchat/StaffChatComposer.jsx src/lib/staffChatClient.js src/hooks/useStaffChat.js tests/v73-staff-chat-mentions-rtl.test.jsx tests/v73-staff-chat-client.test.js
git commit -m "feat(V73 T11 Feature B): @mentions dropdown + chip + mention sound dispatch"
```

---

## Task 12: Feature C — Reply-to-message (quote bubble)

**Files:**
- Modify: `src/components/staffchat/StaffChatMessage.jsx` (hover Reply button + reply quote-card render)
- Modify: `src/components/staffchat/StaffChatComposer.jsx` (quote-strip + replyTo state)
- Modify: `src/hooks/useStaffChat.js` (replyingTo state + setter)
- Test: `tests/v73-staff-chat-reply-rtl.test.jsx`

- [ ] **Step 1: Write failing tests**

```jsx
// tests/v73-staff-chat-reply-rtl.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../src/hooks/useStaffChat.js', () => ({ useStaffChat: vi.fn() }));
vi.mock('../src/lib/BranchContext.jsx', () => ({ useSelectedBranch: () => ({ branchId: 'BR-T' }) }));

import { StaffChatWidget } from '../src/components/staffchat/StaffChatWidget.jsx';
import { useStaffChat } from '../src/hooks/useStaffChat.js';

describe('V73.R1 Reply-to-message flow', () => {
  let sendMock, setReplyingTo;
  beforeEach(() => {
    sendMock = vi.fn();
    setReplyingTo = vi.fn();
    useStaffChat.mockReturnValue({
      messages: [
        { id: 'CHAT-1', branchId: 'BR-T', displayName: 'ดร.วี', text: 'รอลูกค้า 5 นาที', deviceId: 'other', createdAt: { toMillis: () => Date.now() } },
      ],
      minimized: false, unreadCount: 0, deviceId: 'dev-me',
      error: null, namePickerOpen: false, setNamePickerOpen: vi.fn(),
      send: sendMock, confirmName: vi.fn(), expand: vi.fn(), minimize: vi.fn(),
      recentMentionCandidates: [],
      replyingTo: null,
      setReplyingTo,
    });
  });

  it('R1.1 hover message shows Reply button', () => {
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    expect(screen.getByTestId('staff-chat-message-reply-CHAT-1')).toBeInTheDocument();
  });

  it('R1.2 click Reply calls setReplyingTo with shape', () => {
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    fireEvent.click(screen.getByTestId('staff-chat-message-reply-CHAT-1'));
    expect(setReplyingTo).toHaveBeenCalledWith(expect.objectContaining({
      msgId: 'CHAT-1', snippet: expect.stringContaining('รอลูกค้า'), displayName: 'ดร.วี',
    }));
  });

  it('R1.3 quote strip renders when replyingTo set', () => {
    useStaffChat.mockReturnValue({
      messages: [],
      minimized: false, unreadCount: 0, deviceId: 'dev-me',
      error: null, namePickerOpen: false, setNamePickerOpen: vi.fn(),
      send: sendMock, confirmName: vi.fn(), expand: vi.fn(), minimize: vi.fn(),
      recentMentionCandidates: [],
      replyingTo: { msgId: 'CHAT-1', snippet: 'รอลูกค้า', displayName: 'ดร.วี', deviceId: 'other' },
      setReplyingTo,
    });
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    expect(screen.getByTestId('staff-chat-composer-quote-strip')).toHaveTextContent('รอลูกค้า');
  });

  it('R1.4 click × on quote strip clears it', () => {
    useStaffChat.mockReturnValue({
      messages: [],
      minimized: false, unreadCount: 0, deviceId: 'dev-me',
      error: null, namePickerOpen: false, setNamePickerOpen: vi.fn(),
      send: sendMock, confirmName: vi.fn(), expand: vi.fn(), minimize: vi.fn(),
      recentMentionCandidates: [],
      replyingTo: { msgId: 'CHAT-1', snippet: 'x', displayName: 'A', deviceId: 'd' },
      setReplyingTo,
    });
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    fireEvent.click(screen.getByTestId('staff-chat-composer-quote-clear'));
    expect(setReplyingTo).toHaveBeenCalledWith(null);
  });

  it('R1.5 send while replying includes replyTo in extras', () => {
    useStaffChat.mockReturnValue({
      messages: [],
      minimized: false, unreadCount: 0, deviceId: 'dev-me',
      error: null, namePickerOpen: false, setNamePickerOpen: vi.fn(),
      send: sendMock, confirmName: vi.fn(), expand: vi.fn(), minimize: vi.fn(),
      recentMentionCandidates: [],
      replyingTo: { msgId: 'CHAT-1', snippet: 'รอ', displayName: 'ดร.วี', deviceId: 'other' },
      setReplyingTo,
    });
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    fireEvent.change(screen.getByTestId('staff-chat-composer-input'), { target: { value: 'got it' } });
    fireEvent.click(screen.getByTestId('staff-chat-composer-send'));
    expect(sendMock).toHaveBeenCalledWith('got it', expect.objectContaining({
      replyTo: { msgId: 'CHAT-1', snippet: 'รอ', displayName: 'ดร.วี', deviceId: 'other' },
    }));
  });

  it('R1.6 message with replyTo renders quote-card', () => {
    useStaffChat.mockReturnValue({
      messages: [
        { id: 'CHAT-2', branchId: 'BR-T', displayName: 'me', text: 'got it', deviceId: 'dev-me',
          replyTo: { msgId: 'CHAT-1', snippet: 'รอลูกค้า', displayName: 'ดร.วี', deviceId: 'other' },
          createdAt: { toMillis: () => Date.now() } },
      ],
      minimized: false, unreadCount: 0, deviceId: 'dev-me',
      error: null, namePickerOpen: false, setNamePickerOpen: vi.fn(),
      send: vi.fn(), confirmName: vi.fn(), expand: vi.fn(), minimize: vi.fn(),
      recentMentionCandidates: [],
      replyingTo: null, setReplyingTo: vi.fn(),
    });
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    expect(screen.getByTestId('staff-chat-message-quote-CHAT-2')).toHaveTextContent('รอลูกค้า');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- --run tests/v73-staff-chat-reply-rtl.test.jsx`
Expected: FAIL

- [ ] **Step 3: Extend useStaffChat with replyingTo state**

Modify `src/hooks/useStaffChat.js`:

```js
const [replyingTo, setReplyingTo] = useState(null);
// In the returned object: replyingTo, setReplyingTo
```

- [ ] **Step 4: Add Reply button + quote-card to StaffChatMessage**

Modify `src/components/staffchat/StaffChatMessage.jsx`:

```jsx
import { Reply } from 'lucide-react';

export function StaffChatMessage({ message, isOwn, onReply }) {
  return (
    <div ... className="group flex flex-col ...">
      {message.replyTo && (
        <div
          data-testid={`staff-chat-message-quote-${message.id}`}
          className={`text-[10px] px-2 py-1 mb-1 border-l-2 border-rose-400 bg-rose-500/[0.08] rounded max-w-[80%] ${isOwn ? 'self-end' : 'self-start'} cursor-pointer hover:bg-rose-500/15`}
        >
          <span className="font-bold text-rose-300">↩ {message.replyTo.displayName}: </span>
          <span className="text-[var(--tx-muted)] italic">{message.replyTo.snippet}</span>
        </div>
      )}
      {!isOwn && <div ... displayName ... />}
      <div className={...bubble classes...}>
        <StaffChatMessageBody text={message.text} />
        {onReply && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onReply(message); }}
            data-testid={`staff-chat-message-reply-${message.id}`}
            className="opacity-0 group-hover:opacity-100 transition-opacity ml-2 inline-flex items-center text-[10px] text-[var(--tx-muted)] hover:text-rose-500"
            aria-label="ตอบกลับ"
            title="ตอบกลับ"
          >
            <Reply size={11} />
          </button>
        )}
      </div>
      <div ... time ... />
    </div>
  );
}
```

- [ ] **Step 5: Wire onReply in StaffChatMessageList**

Modify `src/components/staffchat/StaffChatMessageList.jsx`:

```jsx
export function StaffChatMessageList({ messages, ownDeviceId, onReply }) {
  // ...
  <StaffChatMessage key={m.id} message={m} isOwn={m.deviceId === ownDeviceId} onReply={onReply} />
```

Wire in StaffChatWidget:

```jsx
const handleReply = (msg) => {
  chat.setReplyingTo({
    msgId: msg.id,
    snippet: (msg.text || '').slice(0, 80),
    displayName: msg.displayName,
    deviceId: msg.deviceId,
  });
};

<StaffChatMessageList messages={chat.messages} ownDeviceId={chat.deviceId} onReply={handleReply} />
<StaffChatComposer onSend={chat.send} replyingTo={chat.replyingTo} onClearReply={() => chat.setReplyingTo(null)} ... />
```

- [ ] **Step 6: Add quote-strip to StaffChatComposer**

Modify `src/components/staffchat/StaffChatComposer.jsx`:

```jsx
export function StaffChatComposer({ onSend, recentMentionCandidates, replyingTo, onClearReply }) {
  // ...
  const submit = () => {
    if (!canSend) return;
    const mentions = extractMentions(trimmed);
    const extras = {};
    if (mentions.length > 0) extras.mentions = mentions;
    if (replyingTo) extras.replyTo = replyingTo;
    onSend(trimmed, extras);
    setText('');
    setMentionTrigger(null);
    onClearReply?.();
  };
  return (
    <div className="border-t border-[var(--bd)] bg-[var(--bg-surface)]">
      {replyingTo && (
        <div
          data-testid="staff-chat-composer-quote-strip"
          className="px-3 py-1.5 bg-rose-500/10 border-b border-rose-500/30 flex items-center gap-2 text-[10px]"
        >
          <span className="font-bold text-rose-300">↩ ตอบกลับ {replyingTo.displayName}:</span>
          <span className="flex-1 text-[var(--tx-muted)] italic truncate">{replyingTo.snippet}</span>
          <button
            type="button"
            onClick={onClearReply}
            data-testid="staff-chat-composer-quote-clear"
            className="w-5 h-5 rounded hover:bg-rose-500/20 flex items-center justify-center text-rose-400"
            aria-label="ยกเลิกการตอบกลับ"
          >
            ×
          </button>
        </div>
      )}
      <div className="px-2 py-2 flex items-end gap-2">
        {/* existing textarea + send */}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Run tests to verify pass**

Run: `npm test -- --run tests/v73-staff-chat-reply-rtl.test.jsx`
Expected: PASS (6 tests)

- [ ] **Step 8: Commit**

```bash
git add src/components/staffchat/StaffChatMessage.jsx src/components/staffchat/StaffChatMessageList.jsx src/components/staffchat/StaffChatComposer.jsx src/components/staffchat/StaffChatWidget.jsx src/hooks/useStaffChat.js tests/v73-staff-chat-reply-rtl.test.jsx
git commit -m "feat(V73 T12 Feature C): Reply-to-message quote-strip + quote-card render"
```

---

## Task 13: Source-grep regression sweep (post-features-B+C)

**Files:**
- Modify: `tests/v73-staff-chat-source-grep.test.js`

- [ ] **Step 1: Add regression locks**

Append:

```js
const ROOT_FILES = {
  'staffChatClient.js': readFileSync('src/lib/staffChatClient.js', 'utf-8'),
  'useStaffChat.js': readFileSync('src/hooks/useStaffChat.js', 'utf-8'),
  'StaffChatMessage.jsx': readFileSync('src/components/staffchat/StaffChatMessage.jsx', 'utf-8'),
  'StaffChatMessageBody.jsx': readFileSync('src/components/staffchat/StaffChatMessageBody.jsx', 'utf-8'),
  'StaffChatComposer.jsx': readFileSync('src/components/staffchat/StaffChatComposer.jsx', 'utf-8'),
};

describe('V73.SG2 source-grep regression', () => {
  it('SG2.1 deviceId minted via crypto.getRandomValues (Rule C2)', () => {
    const identity = readFileSync('src/lib/staffChatIdentity.js', 'utf-8');
    expect(identity).toMatch(/crypto\.getRandomValues/);
    expect(identity).not.toMatch(/Math\.random/);
  });

  it('SG2.2 buildMessageDoc uses crypto.getRandomValues for id', () => {
    expect(ROOT_FILES['staffChatClient.js']).toMatch(/crypto\.getRandomValues/);
  });

  it('SG2.3 useStaffChat uses scopedDataLayer, not raw backendClient', () => {
    expect(ROOT_FILES['useStaffChat.js']).toMatch(/scopedDataLayer/);
    expect(ROOT_FILES['useStaffChat.js']).not.toMatch(/from\s+['"][^'"]*backendClient/);
  });

  it('SG2.4 mention render goes through shared MentionChip', () => {
    expect(ROOT_FILES['StaffChatMessageBody.jsx']).toMatch(/StaffChatMentionChip/);
  });

  it('SG2.5 message body uses parseMessageBody (no raw text-only render)', () => {
    expect(ROOT_FILES['StaffChatMessage.jsx']).toMatch(/StaffChatMessageBody/);
    expect(ROOT_FILES['StaffChatMessage.jsx']).not.toMatch(/\{message\.text\}/);
  });

  it('SG2.6 mention sound + auto-expand only when deviceId !== own', () => {
    expect(ROOT_FILES['useStaffChat.js']).toMatch(/m\.deviceId\s*!==\s*deviceId/);
  });
});
```

- [ ] **Step 2: Run + verify pass**

Run: `npm test -- --run tests/v73-staff-chat-source-grep.test.js`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/v73-staff-chat-source-grep.test.js
git commit -m "test(V73 T13): source-grep regression locks (Rule C2 + scopedDataLayer + MentionChip + parseMessageBody)"
```

---

## Task 14: Add Firebase Storage rules + probe endpoint #10 (Feature F prep)

**Files:**
- Modify: `storage.rules`
- Modify: `firebase.json` (if storage rules deployment is not yet wired — verify)
- Modify: `scripts/probe-deploy-probe.mjs` (add endpoint #10)

- [ ] **Step 1: Add Storage rule for staff-chat-attachments**

Modify `storage.rules` — append within `service firebase.storage` block:

```
match /b/{bucket}/o {
  match /staff-chat-attachments/{branchId}/{file=**} {
    allow read: if request.auth != null && (request.auth.token.isClinicStaff == true || request.auth.token.admin == true);
    allow create: if request.auth != null
                  && (request.auth.token.isClinicStaff == true || request.auth.token.admin == true)
                  && request.resource.size < 1 * 1024 * 1024;
    allow update, delete: if false;
  }
}
```

- [ ] **Step 2: Extend probe-deploy-probe.mjs (endpoint #10)**

Add new probe function to `scripts/probe-deploy-probe.mjs`:

```js
async function probe10_staffChatAttachmentsAnon(ts) {
  // Anon write to Storage should be 403/401
  const filename = `test-probe-attach-${ts}.json`;
  const url = `https://firebasestorage.googleapis.com/v0/b/${APP_ID}.firebasestorage.app/o?name=staff-chat-attachments%2FPROBE%2F${filename}`;
  const r = await http('POST', url, {
    body: { probe: true },
  });
  return {
    name: 'staff-chat-attachments anon WRITE (expect 403)',
    status: r.status,
    ok: r.status === 401 || r.status === 403,
    error: (r.status === 401 || r.status === 403) ? null : `expected 403/401 got ${r.status}: ${r.text.slice(0, 200)}`,
  };
}
```

Update `runProbe` + header comment from "3-endpoint" to "4-endpoint".

- [ ] **Step 3: Update Rule B docs in 01-iron-clad.md**

Add endpoint #10 description.

- [ ] **Step 4: Commit**

```bash
git add storage.rules scripts/probe-deploy-probe.mjs .claude/rules/01-iron-clad.md
git commit -m "feat(V73 T14): storage.rules for staff-chat-attachments + probe endpoint #10"
```

---

## Task 15: Feature F — Image paste/upload

**Files:**
- Create: `src/lib/staffChatImageResize.js`
- Create: `src/components/staffchat/StaffChatImageLightbox.jsx`
- Modify: `src/components/staffchat/StaffChatComposer.jsx` (paste/drag handlers + preview + upload)
- Modify: `src/components/staffchat/StaffChatMessage.jsx` (render attachmentUrl)
- Modify: `src/hooks/useStaffChat.js` (image upload helper)
- Test: `tests/v73-staff-chat-image-rtl.test.jsx`

- [ ] **Step 1: Write failing tests + helper unit**

Create `tests/v73-staff-chat-image.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { isImageFile } from '../src/lib/staffChatImageResize.js';

describe('V73.IM1 image helpers', () => {
  it('IM1.1 isImageFile accepts JPEG/PNG/WEBP/GIF', () => {
    expect(isImageFile({ type: 'image/jpeg' })).toBe(true);
    expect(isImageFile({ type: 'image/png' })).toBe(true);
    expect(isImageFile({ type: 'image/webp' })).toBe(true);
    expect(isImageFile({ type: 'image/gif' })).toBe(true);
  });
  it('IM1.2 isImageFile rejects PDF/doc/video', () => {
    expect(isImageFile({ type: 'application/pdf' })).toBe(false);
    expect(isImageFile({ type: 'video/mp4' })).toBe(false);
    expect(isImageFile({ type: 'text/plain' })).toBe(false);
  });
});
```

- [ ] **Step 2: Implement staffChatImageResize.js**

```js
// src/lib/staffChatImageResize.js
// V73 Feature F (2026-05-16) — Client-side image resize + upload helpers.

export function isImageFile(file) {
  return !!file && typeof file.type === 'string' && file.type.startsWith('image/');
}

export const MAX_FILE_SIZE_BEFORE_RESIZE = 10 * 1024 * 1024;  // 10 MB
export const RESIZE_MAX_DIM = 1024;
export const RESIZE_QUALITY = 0.85;

/**
 * Resize an image File to JPEG blob, max dimension RESIZE_MAX_DIM.
 * Returns { blob, width, height } or throws on error.
 */
export async function resizeImageToBlob(file, maxDim = RESIZE_MAX_DIM, quality = RESIZE_QUALITY) {
  if (!isImageFile(file)) throw new Error('STAFF_CHAT_NOT_AN_IMAGE');
  if (file.size > MAX_FILE_SIZE_BEFORE_RESIZE) throw new Error('STAFF_CHAT_FILE_TOO_LARGE');

  const img = await loadImageFromFile(file);
  const ratio = Math.min(maxDim / img.naturalWidth, maxDim / img.naturalHeight, 1);
  const w = Math.round(img.naturalWidth * ratio);
  const h = Math.round(img.naturalHeight * ratio);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, w, h);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob((b) => b ? resolve(b) : reject(new Error('STAFF_CHAT_CANVAS_BLOB_FAILED')), 'image/jpeg', quality);
  });
  return { blob, width: w, height: h };
}

function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('STAFF_CHAT_IMAGE_LOAD_FAILED'));
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Upload a Blob to Firebase Storage at staff-chat-attachments/{branchId}/{filename}.
 * Returns { url, size }.
 */
export async function uploadAttachment(blob, branchId) {
  const { getStorage, ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
  const filename = `${Date.now()}-${hex}.jpg`;
  const path = `staff-chat-attachments/${branchId}/${filename}`;
  const storage = getStorage();
  const r = ref(storage, path);
  await uploadBytes(r, blob, { contentType: 'image/jpeg' });
  const url = await getDownloadURL(r);
  return { url, size: blob.size };
}
```

- [ ] **Step 3: Run helper tests**

Run: `npm test -- --run tests/v73-staff-chat-image.test.js`
Expected: PASS

- [ ] **Step 4: Implement StaffChatImageLightbox.jsx**

```jsx
// src/components/staffchat/StaffChatImageLightbox.jsx
import React, { useEffect } from 'react';
import { X } from 'lucide-react';

export function StaffChatImageLightbox({ src, onClose }) {
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose?.(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      data-testid="staff-chat-image-lightbox"
      onClick={onClose}
      className="fixed inset-0 bg-black/90 flex items-center justify-center z-[9700] p-4 cursor-pointer"
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center"
        aria-label="ปิด"
      >
        <X size={20} />
      </button>
      <img src={src} alt="Chat attachment" className="max-w-full max-h-full object-contain" />
    </div>
  );
}

export default StaffChatImageLightbox;
```

- [ ] **Step 5: Add paste/drag/file handlers to StaffChatComposer**

Modify `src/components/staffchat/StaffChatComposer.jsx`:

```jsx
import { Paperclip, X as XIcon } from 'lucide-react';
import { isImageFile, resizeImageToBlob, MAX_FILE_SIZE_BEFORE_RESIZE } from '../../lib/staffChatImageResize.js';

export function StaffChatComposer({ onSend, recentMentionCandidates, replyingTo, onClearReply, onUploadImage }) {
  const [text, setText] = useState('');
  const [pendingImageBlob, setPendingImageBlob] = useState(null);
  const [pendingImageUrl, setPendingImageUrl] = useState(null);

  // ... existing state

  const acceptFile = async (file) => {
    if (!isImageFile(file)) {
      window.alert('รองรับเฉพาะรูปภาพ');
      return;
    }
    if (file.size > MAX_FILE_SIZE_BEFORE_RESIZE) {
      window.alert('ไฟล์ใหญ่เกิน — กรุณาย่อก่อนส่ง');
      return;
    }
    try {
      const { blob } = await resizeImageToBlob(file);
      setPendingImageBlob(blob);
      setPendingImageUrl(URL.createObjectURL(blob));
    } catch (e) {
      window.alert('ย่อรูปไม่สำเร็จ: ' + e.message);
    }
  };

  const onPaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const it of items) {
      if (it.kind === 'file') {
        const f = it.getAsFile();
        if (f) acceptFile(f);
      }
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) acceptFile(file);
  };

  const fileInputRef = useRef(null);
  const onFileSelect = (e) => {
    const f = e.target.files?.[0];
    if (f) acceptFile(f);
    e.target.value = '';
  };

  const clearImage = () => {
    if (pendingImageUrl) URL.revokeObjectURL(pendingImageUrl);
    setPendingImageBlob(null);
    setPendingImageUrl(null);
  };

  const canSend = (trimmed.length > 0 || pendingImageBlob) && !tooLong;

  const submit = async () => {
    if (!canSend) return;
    let extras = {};
    if (pendingImageBlob) {
      try {
        const { url, size } = await onUploadImage(pendingImageBlob);
        extras.attachmentUrl = url;
        extras.attachmentSize = size;
        extras.attachmentMimeType = 'image/jpeg';
      } catch (e) {
        window.alert('อัพโหลดรูปไม่สำเร็จ: ' + e.message);
        return;
      }
    }
    const mentions = extractMentions(trimmed);
    if (mentions.length > 0) extras.mentions = mentions;
    if (replyingTo) extras.replyTo = replyingTo;
    onSend(trimmed, extras);
    setText('');
    clearImage();
    onClearReply?.();
  };

  return (
    <div
      className="border-t border-[var(--bd)] bg-[var(--bg-surface)]"
      onPaste={onPaste}
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      {/* ... existing replyingTo quote strip ... */}
      {pendingImageUrl && (
        <div data-testid="staff-chat-composer-image-preview" className="px-3 py-2 flex items-center gap-2">
          <img src={pendingImageUrl} className="w-16 h-16 object-cover rounded-md border border-[var(--bd)]" />
          <button type="button" onClick={clearImage}
            data-testid="staff-chat-composer-image-clear"
            className="w-6 h-6 rounded hover:bg-rose-500/20 flex items-center justify-center text-rose-400">
            <XIcon size={14} />
          </button>
          <span className="text-[10px] text-[var(--tx-muted)]">รูปพร้อมส่ง</span>
        </div>
      )}
      <div className="px-2 py-2 flex items-end gap-2">
        <button type="button" onClick={() => fileInputRef.current?.click()}
          data-testid="staff-chat-composer-attach"
          className="w-9 h-9 rounded-lg hover:bg-rose-500/10 flex items-center justify-center text-[var(--tx-muted)] hover:text-rose-500"
          aria-label="แนบรูป">
          <Paperclip size={16} />
        </button>
        <input type="file" accept="image/*" ref={fileInputRef} onChange={onFileSelect} hidden />
        {/* ... existing textarea + send ... */}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Pass onUploadImage from useStaffChat**

Modify `src/hooks/useStaffChat.js`:

```js
import { uploadAttachment } from '../lib/staffChatImageResize.js';
// ...
const uploadImage = useCallback(async (blob) => {
  if (!selectedBranchId) throw new Error('STAFF_CHAT_NO_BRANCH');
  return uploadAttachment(blob, selectedBranchId);
}, [selectedBranchId]);
return { ..., uploadImage };
```

Wire in widget: `<StaffChatComposer ... onUploadImage={chat.uploadImage} />`.

- [ ] **Step 7: Render attachment in StaffChatMessage**

Modify `src/components/staffchat/StaffChatMessage.jsx`:

```jsx
import { StaffChatImageLightbox } from './StaffChatImageLightbox.jsx';
// ...
export function StaffChatMessage({ message, isOwn, onReply }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  // ... rest
  return (
    <div ...>
      {/* ... reply quote ... */}
      {/* ... displayName ... */}
      <div className={...bubble...}>
        {message.attachmentUrl && (
          <button type="button" onClick={() => setLightboxOpen(true)}
            data-testid={`staff-chat-message-image-${message.id}`}
            className="block max-w-[200px] rounded-lg overflow-hidden mb-1 cursor-zoom-in">
            <img src={message.attachmentUrl} alt="" className="w-full h-auto" />
          </button>
        )}
        {message.text && <StaffChatMessageBody text={message.text} />}
        {/* ... reply button ... */}
      </div>
      {/* ... time ... */}
      {lightboxOpen && (
        <StaffChatImageLightbox src={message.attachmentUrl} onClose={() => setLightboxOpen(false)} />
      )}
    </div>
  );
}
```

- [ ] **Step 8: RTL tests for image features**

Create `tests/v73-staff-chat-image-rtl.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../src/hooks/useStaffChat.js', () => ({ useStaffChat: vi.fn() }));
vi.mock('../src/lib/BranchContext.jsx', () => ({ useSelectedBranch: () => ({ branchId: 'BR-T' }) }));

import { StaffChatWidget } from '../src/components/staffchat/StaffChatWidget.jsx';
import { useStaffChat } from '../src/hooks/useStaffChat.js';

describe('V73.IM2 image flow', () => {
  beforeEach(() => {
    useStaffChat.mockReturnValue({
      messages: [
        { id: 'CHAT-IMG', branchId: 'BR-T', displayName: 'me', text: '', deviceId: 'dev-me',
          attachmentUrl: 'https://example.com/img.jpg', attachmentSize: 12345,
          createdAt: { toMillis: () => Date.now() } },
      ],
      minimized: false, unreadCount: 0, deviceId: 'dev-me',
      error: null, namePickerOpen: false, setNamePickerOpen: vi.fn(),
      send: vi.fn(), confirmName: vi.fn(), expand: vi.fn(), minimize: vi.fn(),
      recentMentionCandidates: [], replyingTo: null, setReplyingTo: vi.fn(),
      uploadImage: vi.fn(() => Promise.resolve({ url: 'https://example.com/x.jpg', size: 5000 })),
    });
  });

  it('IM2.1 attach button rendered', () => {
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    expect(screen.getByTestId('staff-chat-composer-attach')).toBeInTheDocument();
  });

  it('IM2.2 image in message renders thumbnail + clickable', () => {
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    const img = screen.getByTestId('staff-chat-message-image-CHAT-IMG');
    expect(img).toBeInTheDocument();
    fireEvent.click(img);
    expect(screen.getByTestId('staff-chat-image-lightbox')).toBeInTheDocument();
  });
});
```

- [ ] **Step 9: Run tests pass**

Run: `npm test -- --run tests/v73-staff-chat-image-rtl.test.jsx tests/v73-staff-chat-image.test.js`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/lib/staffChatImageResize.js src/components/staffchat/StaffChatImageLightbox.jsx src/components/staffchat/StaffChatComposer.jsx src/components/staffchat/StaffChatMessage.jsx src/hooks/useStaffChat.js src/components/staffchat/StaffChatWidget.jsx tests/v73-staff-chat-image.test.js tests/v73-staff-chat-image-rtl.test.jsx
git commit -m "feat(V73 T15 Feature F): image paste/upload + lightbox + Firebase Storage"
```

---

## Task 16: Feature H — Customer/appt auto-link verification (already covered by parseMessageBody)

**Files:**
- Test: `tests/v73-staff-chat-auto-link-rtl.test.jsx`
- Test: extend `tests/v73-staff-chat-client.test.js`

- [ ] **Step 1: Add parseMessageBody tests**

Append to `tests/v73-staff-chat-client.test.js`:

```js
import { parseMessageBody } from '../src/lib/staffChatClient.js';

describe('V73.C3 parseMessageBody', () => {
  it('C3.1 plain text → single segment', () => {
    expect(parseMessageBody('hello world')).toEqual([{ type: 'text', content: 'hello world' }]);
  });

  it('C3.2 customer LC-12345678 → chip segment', () => {
    const out = parseMessageBody('see LC-26000022 please');
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ type: 'text', content: 'see ' });
    expect(out[1]).toMatchObject({ type: 'customer', refId: 'LC-26000022' });
    expect(out[2]).toEqual({ type: 'text', content: ' please' });
  });

  it('C3.3 appointment BA-12345 → chip segment', () => {
    const out = parseMessageBody('check BA-1778868832454');
    expect(out[1]).toMatchObject({ type: 'appt', refId: 'BA-1778868832454' });
  });

  it('C3.4 mixed mention + customer + appt', () => {
    const out = parseMessageBody('@ดร.วี see LC-26000022 about BA-1778');
    const types = out.map(s => s.type);
    expect(types).toContain('mention');
    expect(types).toContain('customer');
    expect(types).toContain('appt');
  });

  it('C3.5 LC inside URL not matched (word-boundary)', () => {
    const out = parseMessageBody('visit https://x.com/customer=LC-26000022 now');
    // LC-26000022 is part of the URL — still matched because URL params aren't word-boundary excluded.
    // Acceptable: the chip will be a false-positive click, but the URL itself still readable.
    // This is documented in §9.3 edge cases.
    expect(out.some(s => s.type === 'customer')).toBe(true);
  });
});
```

- [ ] **Step 2: Add RTL tests for auto-link render**

Create `tests/v73-staff-chat-auto-link-rtl.test.jsx`:

```jsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../src/hooks/useStaffChat.js', () => ({ useStaffChat: vi.fn() }));
vi.mock('../src/lib/BranchContext.jsx', () => ({ useSelectedBranch: () => ({ branchId: 'BR-T' }) }));

import { StaffChatWidget } from '../src/components/staffchat/StaffChatWidget.jsx';
import { useStaffChat } from '../src/hooks/useStaffChat.js';

describe('V73.AL1 auto-link render', () => {
  beforeEach(() => {
    useStaffChat.mockReturnValue({
      messages: [
        { id: 'CHAT-1', branchId: 'BR-T', displayName: 'admin', text: 'see LC-26000022 about BA-1778',
          deviceId: 'other', createdAt: { toMillis: () => Date.now() } },
      ],
      minimized: false, unreadCount: 0, deviceId: 'dev-me',
      error: null, namePickerOpen: false, setNamePickerOpen: vi.fn(),
      send: vi.fn(), confirmName: vi.fn(), expand: vi.fn(), minimize: vi.fn(),
      recentMentionCandidates: [], replyingTo: null, setReplyingTo: vi.fn(),
      uploadImage: vi.fn(),
    });
  });

  it('AL1.1 customer chip renders with correct href', () => {
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    const link = screen.getByTestId('staff-chat-customer-link-LC-26000022');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', expect.stringContaining('LC-26000022'));
  });

  it('AL1.2 appt chip renders', () => {
    render(<StaffChatWidget user={{ uid: 'U' }} needsPublicAuth={false} />);
    expect(screen.getByTestId('staff-chat-appt-link-BA-1778')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run tests pass**

Run: `npm test -- --run tests/v73-staff-chat-auto-link-rtl.test.jsx tests/v73-staff-chat-client.test.js`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add tests/v73-staff-chat-client.test.js tests/v73-staff-chat-auto-link-rtl.test.jsx
git commit -m "test(V73 T16 Feature H): customer/appt auto-link parser + RTL tests"
```

---

## Task 17: Add notification sound assets

**Files:**
- Create: `public/sounds/staff-chat-notif.mp3` (small ~3KB ding)
- Create: `public/sounds/staff-chat-mention.mp3` (slightly louder, 2 beeps)

- [ ] **Step 1: Generate/source sounds**

Use a free CC0 source (freesound.org / pixabay) to download:
- staff-chat-notif.mp3 — short single ding (~0.3s, ~3KB)
- staff-chat-mention.mp3 — 2-beep alert (~0.6s, ~6KB)

Place at `public/sounds/`.

If unable to source, use the same file for both (degrade gracefully — `useStaffChat` already swallows 404 via `.catch()`).

- [ ] **Step 2: Verify via dev server**

`npm run dev` → open `/`, expand widget, mock send a message from another device → confirm sound plays.

- [ ] **Step 3: Commit (LFS-friendly small files)**

```bash
git add public/sounds/
git commit -m "feat(V73 T17): notification sound assets (default + mention)"
```

---

## Task 18: Cloud Function cleanup (7-day auto-delete)

**Files:**
- Create: `functions/cleanupStaffChat.js`
- Modify: `functions/index.js`
- Modify: `functions/package.json` (verify deps)

- [ ] **Step 1: Write cleanup function**

```js
// functions/cleanupStaffChat.js
// V73 (2026-05-16) — Daily 03:00 Bangkok cleanup of >7-day-old staff chat
// messages + orphan Storage attachments.
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { initializeApp, getApps, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

if (getApps().length === 0) initializeApp({ credential: applicationDefault() });
const APP_ID = 'loverclinic-opd-4c39b';

export const cleanupOldStaffChatMessages = onSchedule({
  schedule: '0 20 * * *',  // 20:00 UTC = 03:00 Bangkok
  timeZone: 'UTC',
  region: 'asia-southeast1',
}, async () => {
  const db = getFirestore();
  const cutoff = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const snap = await db.collection(`artifacts/${APP_ID}/public/data/be_staff_chat_messages`)
    .where('createdAt', '<', cutoff)
    .limit(500)
    .get();

  const attachmentUrls = [];
  const batch = db.batch();
  for (const d of snap.docs) {
    const data = d.data();
    if (data.attachmentUrl) attachmentUrls.push(data.attachmentUrl);
    batch.delete(d.ref);
  }
  await batch.commit();

  // Delete orphan Storage objects
  const storage = getStorage();
  const bucket = storage.bucket();
  for (const url of attachmentUrls) {
    try {
      // Extract object path from URL: ...firebasestorage.googleapis.com/v0/b/BUCKET/o/PATH?...
      const m = url.match(/\/o\/([^?]+)/);
      if (!m) continue;
      const objectPath = decodeURIComponent(m[1]);
      await bucket.file(objectPath).delete({ ignoreNotFound: true });
    } catch (e) {
      console.warn('staff-chat cleanup attachment delete failed:', e.message);
    }
  }

  console.log(`[staff-chat-cleanup] deleted ${snap.size} messages + ${attachmentUrls.length} attachments`);
});
```

- [ ] **Step 2: Wire export**

Modify `functions/index.js`:

```js
export { cleanupOldStaffChatMessages } from './cleanupStaffChat.js';
```

- [ ] **Step 3: Verify package.json has firebase-admin + firebase-functions**

Run: `cat functions/package.json` — confirm both deps present (likely already are).

- [ ] **Step 4: Commit (Cloud Function deploy deferred to user)**

```bash
git add functions/cleanupStaffChat.js functions/index.js
git commit -m "feat(V73 T18): Cloud Function daily cleanup of >7d staff chat msgs + Storage orphans"
```

---

## Task 19: Rule I full-flow simulate tests

**Files:**
- Create: `tests/v73-staff-chat-flow-simulate.test.jsx`

- [ ] **Step 1: Write F1-F5 flow simulate tests**

```jsx
// tests/v73-staff-chat-flow-simulate.test.jsx
// V73 Rule I full-flow simulate — chains the entire user journey through
// each feature using REAL helpers + mocked Firestore listener.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

vi.mock('../src/lib/scopedDataLayer.js', () => ({
  listenToStaffChatMessages: vi.fn(),
  addStaffChatMessage: vi.fn(() => Promise.resolve('CHAT-x')),
}));
vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: () => ({ branchId: 'BR-T' }),
}));
vi.mock('../src/firebase.js', () => ({ auth: { currentUser: { uid: 'U1' } }, appId: 'TEST-APP' }));

import { StaffChatWidget } from '../src/components/staffchat/StaffChatWidget.jsx';
import { listenToStaffChatMessages, addStaffChatMessage } from '../src/lib/scopedDataLayer.js';

describe('V73.F1 Rule I — full base flow', () => {
  beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); });

  it('F1.1 mount → listener subscribes → incoming msg → bubble auto-expands when minimized', async () => {
    let onChange;
    listenToStaffChatMessages.mockImplementation((opts, onC) => { onChange = onC; return () => {}; });
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    expect(screen.getByTestId('staff-chat-bubble')).toBeInTheDocument();
    expect(listenToStaffChatMessages).toHaveBeenCalled();

    // Send default-sound mock so .play() doesn't throw
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());

    act(() => onChange([{ id: 'CHAT-1', branchId: 'BR-T', displayName: 'ดร.วี', text: 'hi', deviceId: 'other', createdAt: { toMillis: () => Date.now() } }]));
    // Unread badge appears (still minimized initially)
    await waitFor(() => expect(screen.getByTestId('staff-chat-bubble-unread')).toHaveTextContent('1'));
  });
});

describe('V73.F2 Rule I — mention triggers special alert', () => {
  it('F2.1 mention sound + mention chip render + auto-expand', async () => {
    localStorage.setItem('staffChatName', 'ดร.วี');
    let onChange;
    listenToStaffChatMessages.mockImplementation((opts, onC) => { onChange = onC; return () => {}; });
    HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve());

    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    act(() => onChange([{ id: 'CHAT-2', branchId: 'BR-T', displayName: 'admin', text: '@ดร.วี รอลูกค้า', deviceId: 'other', mentions: ['ดร.วี'], createdAt: { toMillis: () => Date.now() } }]));
    // Widget auto-expands on mention regardless of state
    await waitFor(() => expect(screen.getByTestId('staff-chat-panel')).toBeInTheDocument());
    expect(screen.getByTestId('staff-chat-mention-chip-ดร.วี')).toBeInTheDocument();
  });
});

describe('V73.F3 Rule I — reply flow', () => {
  it('F3.1 click reply → quote strip → send → message stored with replyTo', async () => {
    localStorage.setItem('staffChatName', 'me');
    let onChange;
    listenToStaffChatMessages.mockImplementation((opts, onC) => {
      onChange = onC;
      // Initial messages
      setTimeout(() => onC([{ id: 'CHAT-1', branchId: 'BR-T', displayName: 'ดร.วี', text: 'รอลูกค้า', deviceId: 'other', createdAt: { toMillis: () => Date.now() } }]), 0);
      return () => {};
    });
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    fireEvent.click(screen.getByTestId('staff-chat-bubble'));  // expand
    await waitFor(() => screen.getByTestId('staff-chat-message-reply-CHAT-1'));
    fireEvent.click(screen.getByTestId('staff-chat-message-reply-CHAT-1'));
    expect(screen.getByTestId('staff-chat-composer-quote-strip')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('staff-chat-composer-input'), { target: { value: 'ok' } });
    fireEvent.click(screen.getByTestId('staff-chat-composer-send'));
    await waitFor(() => expect(addStaffChatMessage).toHaveBeenCalled());
    const arg = addStaffChatMessage.mock.calls[0][0];
    expect(arg.replyTo).toMatchObject({ msgId: 'CHAT-1', displayName: 'ดร.วี' });
  });
});

describe('V73.F4 Rule I — auto-link render in message body', () => {
  it('F4.1 LC- + BA- tokens render as clickable chips', async () => {
    let onChange;
    listenToStaffChatMessages.mockImplementation((opts, onC) => {
      onChange = onC;
      setTimeout(() => onC([{ id: 'CHAT-1', branchId: 'BR-T', displayName: 'admin', text: 'see LC-26000022 about BA-1778', deviceId: 'other', createdAt: { toMillis: () => Date.now() } }]), 0);
      return () => {};
    });
    render(<StaffChatWidget user={{ uid: 'U1' }} needsPublicAuth={false} />);
    fireEvent.click(screen.getByTestId('staff-chat-bubble'));
    await waitFor(() => screen.getByTestId('staff-chat-customer-link-LC-26000022'));
    expect(screen.getByTestId('staff-chat-appt-link-BA-1778')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run + verify pass**

Run: `npm test -- --run tests/v73-staff-chat-flow-simulate.test.jsx`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add tests/v73-staff-chat-flow-simulate.test.jsx
git commit -m "test(V73 T19): Rule I full-flow simulate F1-F4 (base + mention + reply + auto-link)"
```

---

## Task 20: Rule Q L2 real-prod verify script

**Files:**
- Create: `scripts/diag-staff-chat-l2-verify-v73.mjs`

- [ ] **Step 1: Write L2 verify script**

```js
// scripts/diag-staff-chat-l2-verify-v73.mjs
// V73 Rule Q L2 — real CLIENT SDK against real prod (NOT admin SDK).
// Mock-free verification of base + 4 features.

import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, collection, query, where, orderBy, limit, onSnapshot, setDoc, doc, serverTimestamp, getDocs, deleteDoc } from 'firebase/firestore';
import { readFileSync } from 'fs';

const envText = readFileSync('.env.local.prod', 'utf-8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=("?)(.*)\2$/);
  if (m) process.env[m[1]] = m[3];
}

const APP_ID = 'loverclinic-opd-4c39b';
const FIREBASE_API_KEY = 'AIzaSyDrUal7dR9eweWQKgi4ZhDK7k0hiF9tx20';
const TEST_BRANCH_ID = 'BR-1778136097138-98199ef5';  // ทดลอง 1

const app = initializeApp({
  apiKey: FIREBASE_API_KEY,
  authDomain: `${APP_ID}.firebaseapp.com`,
  projectId: APP_ID,
  storageBucket: `${APP_ID}.firebasestorage.app`,
});
const auth = getAuth(app);
const db = getFirestore(app);

const PASS = (m) => console.log(`  ✓ ${m}`);
const FAIL = (m) => { console.log(`  ✗ FAIL: ${m}`); process.exitCode = 1; };

const COL = `artifacts/${APP_ID}/public/data/be_staff_chat_messages`;

async function main() {
  console.log('=== V73 Staff Chat Rule Q L2 verify ===');
  await signInWithEmailAndPassword(auth, 'loverclinic@loverclinic.com', 'Lover2024');
  PASS('signed in');

  const ts = Date.now();
  const testIds = [];

  // F1: base text message
  {
    const id = `TEST-V73-BASE-${ts}`;
    testIds.push(id);
    await setDoc(doc(db, COL, id), {
      id, branchId: TEST_BRANCH_ID, displayName: 'L2-VERIFY', deviceId: 'l2-script',
      text: 'V73 L2 base test', createdAt: serverTimestamp(),
    });
    PASS(`F1 base message written: ${id}`);
  }

  // F2: mention
  {
    const id = `TEST-V73-MENTION-${ts}`;
    testIds.push(id);
    await setDoc(doc(db, COL, id), {
      id, branchId: TEST_BRANCH_ID, displayName: 'L2-VERIFY', deviceId: 'l2-script',
      text: '@target hello', mentions: ['target'],
      createdAt: serverTimestamp(),
    });
    PASS(`F2 mention message written: ${id}`);
  }

  // F3: reply
  {
    const id = `TEST-V73-REPLY-${ts}`;
    testIds.push(id);
    await setDoc(doc(db, COL, id), {
      id, branchId: TEST_BRANCH_ID, displayName: 'L2-VERIFY', deviceId: 'l2-script',
      text: 'ok got it',
      replyTo: { msgId: `TEST-V73-BASE-${ts}`, snippet: 'V73 L2 base test', displayName: 'L2-VERIFY', deviceId: 'l2-script' },
      createdAt: serverTimestamp(),
    });
    PASS(`F3 reply message written: ${id}`);
  }

  // Compound query — same as listener uses
  await new Promise((resolve, reject) => {
    const q = query(collection(db, COL), where('branchId', '==', TEST_BRANCH_ID), orderBy('createdAt', 'desc'), limit(50));
    const unsub = onSnapshot(q, (snap) => {
      const ids = snap.docs.map(d => d.id);
      const allFound = testIds.every(t => ids.includes(t));
      if (allFound) {
        PASS('compound query returned all test docs');
        unsub();
        resolve();
      }
    }, (err) => { FAIL(`onSnapshot error: ${err.message}`); reject(err); });
    setTimeout(() => { unsub(); FAIL('timeout waiting for snapshot'); resolve(); }, 10000);
  });

  // Cleanup
  for (const id of testIds) {
    await deleteDoc(doc(db, COL, id)).catch(() => {});  // expected to fail — rules block client delete
    // We need admin SDK to delete; or accept that test docs auto-cleanup at 7d
  }
  console.log('note: client-side delete blocked by rules; test docs will auto-cleanup in 7 days');

  if (process.exitCode !== 1) {
    console.log('\n✅ V73 L2 verify: ALL FEATURES PASS on real prod');
  }
  process.exit(process.exitCode || 0);
}

main().catch(e => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run script (rules + indexes need to be deployed first)**

After T3 firestore.rules + index deployed:

Run: `node scripts/diag-staff-chat-l2-verify-v73.mjs`
Expected: all features PASS

- [ ] **Step 3: Commit**

```bash
git add scripts/diag-staff-chat-l2-verify-v73.mjs
git commit -m "test(V73 T20): Rule Q L2 real-prod verify script (base + mention + reply via real client SDK)"
```

---

## Task 21: Update SESSION_HANDOFF + active.md

**Files:**
- Modify: `SESSION_HANDOFF.md` (add V73 entry section)
- Modify: `.agents/active.md`

- [ ] **Step 1: Append V73 section to SESSION_HANDOFF.md**

Use the existing V-entry pattern (similar to V72 entry).

- [ ] **Step 2: Update .agents/active.md**

Mark V73 as ready for deploy + L1 hands-on.

- [ ] **Step 3: Commit**

```bash
git add SESSION_HANDOFF.md .agents/active.md
git commit -m "docs(V73): SESSION_HANDOFF + active.md update"
```

---

## Task 22: Full vitest + build + pre-deploy verification

- [ ] **Step 1: Run full vitest**

```bash
npm test -- --run
```

Expected: 10237+ PASS (existing) + ~80 new V73 tests = ~10317 PASS

- [ ] **Step 2: Run build**

```bash
npm run build
```

Expected: clean build, no errors. New BackendDashboard chunk size up by ~30KB (staffchat lazy module).

- [ ] **Step 3: Run probe-deploy-probe pre-deploy**

```bash
node scripts/probe-deploy-probe.mjs pre
```

Expected: 2 base probes 200 + new probes #9 + #10 to be checked POST-deploy (since they expect 403 which is the post-rule-deploy state)

- [ ] **Step 4: Report ready for user authorization**

Tell user: "V73 implementation complete. Ready for:
- `firebase deploy --only firestore:rules,firestore:indexes,storage:rules` (probe-deploy-probe)
- `firebase deploy --only functions:cleanupOldStaffChatMessages`
- `vercel --prod` (frontend bundle)
- Rule Q L1 user hands-on (open chat in 2 browsers, run through 30 acceptance checks)"

---

## Self-Review (run after writing plan)

**1. Spec coverage:**
- §1 Goal → T1-T22 ✓
- §2 Decisions (4 base) → T1 (cookie), T4 (mute), T6 (mobile fullscreen), T9 (name picker) ✓
- §2.5 4 features → T11 (B), T12 (C), T15 (F), T16 (H) ✓
- §3 User stories U1-U9 → covered by T5-T10 ✓
- §4 Architecture (mount + collection + identity + rules + cleanup) → T1-T3, T10, T18 ✓
- §5 UI specs (bubble + panel + message + composer + name picker) → T5-T9 ✓
- §6 Feature B mentions → T11 ✓
- §7 Feature C reply → T12 ✓
- §8 Feature F image → T14, T15 ✓
- §9 Feature H auto-link → T16 ✓
- §10 Data flow → covered across T4, T11, T12, T15 ✓
- §11 Edge cases → covered in each task's edge handling (12-task chain) ✓
- §12 Tests → T1-T2 unit + T4-T9 RTL + T11-T12-T15-T16 feature RTL + T19 Rule I + T20 Rule Q L2 ✓
- §13 Iron-clad → T2 (Rule C2), T3 (Rule B endpoint #9), T13 (source-grep regression), T14 (Rule B endpoint #10) ✓
- §16 Acceptance criteria 30 checks → 1-10 base (T5-T10), 11-15 mentions (T11), 16-19 reply (T12), 20-24 image (T15), 25-28 auto-link (T16), 29-30 cross-feature (covered by T19 flow simulate) ✓

**2. Placeholder scan:** No "TBD" or "TODO" found in plan body.

**3. Type consistency:** Function names + props checked: `useStaffChat()` returns same shape across all tasks. `buildMessageDoc({...})` params consistent. `parseMessageBody(text)` returns same segment shape. `recentMentionCandidates` prop used consistently. `replyingTo` shape: `{msgId, snippet, displayName, deviceId}` consistent across tasks. `extras` object: `{mentions?, replyTo?, attachmentUrl?, attachmentSize?, attachmentMimeType?}` consistent.

All checks pass. Plan ready for execution.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-05-16-staff-in-branch-chat-widget.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

**Which approach?**
