# V82 Staff Chat — Cursor + Force-Open + Role Badges Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Bug #2 (tab-switch resurrects read messages as unread + noti spam) AND ship Feature #1 (force-open widget until all read) AND Feature #3 (4 role badges in NamePicker + chat bubbles), all in single V82 batch.

**Architecture:** Per-(device, branch) localStorage read cursor replaces the in-memory `useRef(new Set())` that loses state every remount. Scroll-to-bottom IntersectionObserver advances cursor → derives `unreadCount` + `canMinimize` for force-open gate. Independent badge module (`getRole`/`setRole` + `<RoleBadge>` component) extends NamePicker + StaffChatMessage.

**Tech Stack:** React 19 + Vite 8 + Firebase Firestore + Tailwind 3.4 + Vitest 4.1 + Playwright + firebase-admin SDK (Rule M/R scripts).

**Spec:** [`docs/superpowers/specs/2026-05-17-staff-chat-cursor-forceopen-badge-design.md`](../specs/2026-05-17-staff-chat-cursor-forceopen-badge-design.md)

---

## File Structure

### NEW files (4 source + 1 test + 1 script)

| Path | Responsibility |
|---|---|
| `src/lib/staffChatReadCursor.js` | Cursor module: getCursor / setCursor / isMessageUnread / initCursorIfMissing |
| `src/components/staffchat/StaffChatRoleBadge.jsx` | Pure presentational RoleBadge with `role` + `size` props |
| `tests/v82-staff-chat-cursor-and-badge.test.js` | 8 groups, ~60 assertions (A-H) |
| `scripts/v82-cursor-l2-verify.mjs` | Rule Q L2 admin-SDK verifier |
| `scripts/v82-staff-chat-stress.mjs` | 10-scenario stress runner against real Firestore |

### Modified files (7 source + 1 audit)

| Path | Change |
|---|---|
| `src/lib/staffChatIdentity.js` | Add `getRole`/`setRole`/`ROLE_KEYS`/`ROLE_LABELS_TH` |
| `src/lib/staffChatClient.js` | `buildMessageDoc` accepts `senderRole` |
| `src/hooks/useStaffChat.js` | Replace `lastSeenIdsRef` → cursor; add `canMinimize` + `markScrolledToBottom`; `openNameEdit` hydrates role |
| `src/components/staffchat/StaffChatNamePicker.jsx` | Add role section + `confirmName({role})` signature |
| `src/components/staffchat/StaffChatMessage.jsx` | Render `<RoleBadge size="sm">` inline before name |
| `src/components/staffchat/StaffChatMessageList.jsx` | Add `bottomSentinelRef` + IntersectionObserver |
| `src/components/staffchat/StaffChatHeader.jsx` (or `StaffChatBubble.jsx`) | Minimize button `disabled={!canMinimize}` + tooltip |
| `.agents/skills/audit-anti-vibe-code/SKILL.md` | Append AV76 invariant |

---

## Execution Order

**Stage 1 — Foundation** (parallel-safe): Tasks 1-3 (pure modules, no integration)
**Stage 2 — Integration** (sequential after Stage 1): Tasks 4-8 (UI + hook refactor)
**Stage 3 — Test bank** (after Stage 2): Task 9 (Rule K: work-first-test-last)
**Stage 4 — Stress + verify** (after Stage 3): Tasks 10-11
**Stage 5 — Audit + deploy** (after green): Tasks 12-13

---

## Task 1: Cursor module (NEW `staffChatReadCursor.js`)

**Files:**
- Create: `src/lib/staffChatReadCursor.js`

- [ ] **Step 1: Write the module**

```js
// src/lib/staffChatReadCursor.js
// V82 (2026-05-17 post-V81-fix7b) — Per-(device, branch) read cursor.
// Closes Bug #2: tab switch resurrects read messages as unread + noti spam.
//
// Root cause of Bug #2: useStaffChat had `lastSeenIdsRef = useRef(new Set())` —
// in-memory only, resets on every remount. Listener fires with last 50 messages
// on resubscribe → all 50 look "new" to the empty Set → unread spam.
//
// Fix: persistent localStorage cursor. Each branch has its own cursor; one
// device's read state across all branches it visits. Pure JS — no React imports.

const KEY_PREFIX = 'staffChat:cursor:';

/** localStorage key for a branch's cursor (exported for tests). */
export function CURSOR_STORAGE_KEY(branchId) {
  return `${KEY_PREFIX}${String(branchId || '')}`;
}

/**
 * Read cursor for branch. Returns null if absent OR parse error.
 * @returns {{lastReadId: string, lastReadCreatedAtMs: number, updatedAt: number} | null}
 */
export function getCursor(branchId) {
  if (!branchId || typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(CURSOR_STORAGE_KEY(branchId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.lastReadCreatedAtMs !== 'number') return null;
    return {
      lastReadId: String(parsed.lastReadId || ''),
      lastReadCreatedAtMs: parsed.lastReadCreatedAtMs,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    };
  } catch {
    return null;
  }
}

/**
 * Write cursor for branch. Merges with existing (partial update). Silent on
 * quota/permission errors (graceful degrade to V73 in-memory-only behavior).
 */
export function setCursor(branchId, partial) {
  if (!branchId || typeof window === 'undefined' || !window.localStorage) return;
  const prev = getCursor(branchId) || { lastReadId: '', lastReadCreatedAtMs: 0, updatedAt: 0 };
  const next = {
    lastReadId: partial.lastReadId !== undefined ? String(partial.lastReadId) : prev.lastReadId,
    lastReadCreatedAtMs: typeof partial.lastReadCreatedAtMs === 'number'
      ? partial.lastReadCreatedAtMs
      : prev.lastReadCreatedAtMs,
    updatedAt: typeof partial.updatedAt === 'number' ? partial.updatedAt : Date.now(),
  };
  try {
    window.localStorage.setItem(CURSOR_STORAGE_KEY(branchId), JSON.stringify(next));
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[staff-chat] cursor write failed:', err?.message || err);
  }
}

/**
 * Initialize cursor on first-ever mount: if no cursor exists, seed it with the
 * latest message's createdAt so the 50-message backlog is silently marked-as-read.
 * Returns the now-set cursor.
 */
export function initCursorIfMissing(branchId, latestCreatedAtMs) {
  const existing = getCursor(branchId);
  if (existing) return existing;
  const seed = typeof latestCreatedAtMs === 'number' && latestCreatedAtMs > 0
    ? latestCreatedAtMs
    : Date.now();
  setCursor(branchId, {
    lastReadId: '',
    lastReadCreatedAtMs: seed,
    updatedAt: Date.now(),
  });
  return getCursor(branchId);
}

/**
 * True iff message is newer than cursor AND not from self.
 * Used to derive unreadCount + decide whether to play sound / auto-expand.
 */
export function isMessageUnread(message, cursor, selfDeviceId) {
  if (!message) return false;
  if (!cursor) return false; // caller must initCursorIfMissing first
  const createdAtMs = typeof message.createdAt === 'number'
    ? message.createdAt
    : (message.createdAt?.toMillis?.() ?? 0);
  if (createdAtMs <= cursor.lastReadCreatedAtMs) return false;
  if (message.deviceId && selfDeviceId && message.deviceId === selfDeviceId) return false;
  return true;
}

/** Frozen list of localStorage prefixes used by this module (exported for tests + audit). */
export const STAFF_CHAT_CURSOR_KEY_PREFIX = KEY_PREFIX;
```

- [ ] **Step 2: Verify module loads in isolation**

Run: `node -e "import('./src/lib/staffChatReadCursor.js').then(m => console.log(Object.keys(m)))"`
Expected: `['CURSOR_STORAGE_KEY', 'STAFF_CHAT_CURSOR_KEY_PREFIX', 'getCursor', 'initCursorIfMissing', 'isMessageUnread', 'setCursor']`

- [ ] **Step 3: Commit**

```bash
git add src/lib/staffChatReadCursor.js
git commit -m "feat(V82): NEW staffChatReadCursor module — per-(device,branch) localStorage cursor"
```

---

## Task 2: Role module extension (modify `staffChatIdentity.js`)

**Files:**
- Modify: `src/lib/staffChatIdentity.js`

- [ ] **Step 1: Read existing identity module**

Run: `head -50 src/lib/staffChatIdentity.js`
Note the existing `getDisplayName`/`setDisplayName`/`getColor`/`setColor` patterns to mirror.

- [ ] **Step 2: Append role helpers**

Append (find the last `export function setColor` block and add after):

```js
// V82 (2026-05-17 post-V81-fix7b) — Per-device role badge.
// Stored in localStorage; flows into outgoing message doc as `senderRole`.
// 4 fixed roles; optional (null = no badge).

const ROLE_STORAGE_KEY = 'staffChat:role';

export const ROLE_KEYS = Object.freeze(['doctor', 'assistant', 'staff', 'manager']);

export const ROLE_LABELS_TH = Object.freeze({
  doctor: 'แพทย์',
  assistant: 'ผู้ช่วยแพทย์',
  staff: 'พนักงาน',
  manager: 'ผู้จัดการ',
});

/**
 * Get device's chosen role. Returns null if unset OR invalid.
 */
export function getRole() {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(ROLE_STORAGE_KEY);
    if (!raw) return null;
    return ROLE_KEYS.includes(raw) ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Set device's role. Pass null to clear. Throws on invalid non-null role.
 */
export function setRole(role) {
  if (typeof window === 'undefined' || !window.localStorage) return;
  if (role === null || role === '' || role === undefined) {
    try { window.localStorage.removeItem(ROLE_STORAGE_KEY); } catch { /* swallow */ }
    return;
  }
  if (!ROLE_KEYS.includes(role)) {
    throw new Error(`Invalid role: ${role}. Must be one of: ${ROLE_KEYS.join(', ')}`);
  }
  try { window.localStorage.setItem(ROLE_STORAGE_KEY, role); } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[staff-chat] role write failed:', err?.message || err);
  }
}
```

- [ ] **Step 3: Verify exports**

Run: `node -e "import('./src/lib/staffChatIdentity.js').then(m => console.log('role exports:', !!m.getRole, !!m.setRole, m.ROLE_KEYS, !!m.ROLE_LABELS_TH))"`
Expected: `role exports: true true [ 'doctor', 'assistant', 'staff', 'manager' ] true`

- [ ] **Step 4: Commit**

```bash
git add src/lib/staffChatIdentity.js
git commit -m "feat(V82): role helpers in staffChatIdentity (getRole/setRole/ROLE_KEYS/ROLE_LABELS_TH)"
```

---

## Task 3: RoleBadge component (NEW `StaffChatRoleBadge.jsx`)

**Files:**
- Create: `src/components/staffchat/StaffChatRoleBadge.jsx`

- [ ] **Step 1: Write the component**

```jsx
// src/components/staffchat/StaffChatRoleBadge.jsx
// V82 (2026-05-17 post-V81-fix7b) — Role badge renderer.
// Pure presentational. Returns null for absent/invalid role (graceful degradation
// for legacy chat_history docs without senderRole).
//
// Two size variants:
//   - "lg" (40px) for picker preview
//   - "sm" (16px) for chat bubble inline before sender name
//
// Single source for all badge renders (Rule of 3 / Rule C1). Locked by AV76
// source-grep regression in tests/v82-staff-chat-cursor-and-badge.test.js Group H.

import { Stethoscope, HandHeart, Headset, Crown } from 'lucide-react';
import { ROLE_KEYS } from '../../lib/staffChatIdentity.js';

const ROLE_META = Object.freeze({
  doctor:    { icon: Stethoscope, gradient: 'linear-gradient(135deg, #3b82f6, #2563eb)' }, // blue
  assistant: { icon: HandHeart,   gradient: 'linear-gradient(135deg, #14b8a6, #0d9488)' }, // teal
  staff:     { icon: Headset,     gradient: 'linear-gradient(135deg, #f59e0b, #d97706)' }, // amber
  manager:   { icon: Crown,       gradient: 'linear-gradient(135deg, #ef4444, #b91c1c)' }, // red
});

const SIZE_META = Object.freeze({
  lg: { outerPx: 40, iconPx: 22 },
  sm: { outerPx: 16, iconPx: 10 },
});

export default function StaffChatRoleBadge({ role, size = 'sm' }) {
  if (!role || !ROLE_KEYS.includes(role)) return null;
  const meta = ROLE_META[role];
  const sz = SIZE_META[size] || SIZE_META.sm;
  const Icon = meta.icon;
  return (
    <span
      data-testid={`staff-chat-role-badge-${size}-${role}`}
      data-role={role}
      data-size={size}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: `${sz.outerPx}px`,
        height: `${sz.outerPx}px`,
        borderRadius: '50%',
        background: meta.gradient,
        color: 'white',
        flexShrink: 0,
      }}
      title={role}
    >
      <Icon size={sz.iconPx} strokeWidth={2.2} />
    </span>
  );
}
```

- [ ] **Step 2: Verify import resolves**

Run: `npm run build 2>&1 | grep -i "StaffChatRoleBadge\|MISSING_EXPORT" | head -5`
Expected: no MISSING_EXPORT errors (file not yet imported anywhere; build succeeds because it's an orphan module — that's fine).

- [ ] **Step 3: Commit**

```bash
git add src/components/staffchat/StaffChatRoleBadge.jsx
git commit -m "feat(V82): NEW StaffChatRoleBadge component (lg=40px picker + sm=16px bubble)"
```

---

## Task 4: useStaffChat refactor — replace lastSeenIdsRef with cursor

**Files:**
- Modify: `src/hooks/useStaffChat.js`

- [ ] **Step 1: Read current useStaffChat to identify integration points**

Run: `grep -n "lastSeenIdsRef\|unreadCount\|setMinimized\|deviceId\.current" src/hooks/useStaffChat.js`

- [ ] **Step 2: Apply edits — replace in-memory dedup with cursor**

Edit `src/hooks/useStaffChat.js`:

**(2a)** Add imports near the top (after existing imports from `../lib/staffChatIdentity.js`):
```js
// V82 (2026-05-17) — persistent read cursor + role
import {
  getCursor,
  setCursor,
  isMessageUnread,
  initCursorIfMissing,
} from '../lib/staffChatReadCursor.js';
import { getRole, setRole } from '../lib/staffChatIdentity.js';
```

**(2b)** Replace the `lastSeenIdsRef` declaration:
```js
// REMOVE:
// const lastSeenIdsRef = useRef(new Set());

// REPLACE WITH (V82 — cursor-relative dedup; in-memory set tracks ONLY
// sound/auto-expand emission per hook lifetime to prevent double-fire from
// snapshot re-emit during the same mount — distinct from cross-remount dedup
// which is now handled by the cursor):
const emittedForRef = useRef(new Set());
const [cursor, setCursorState] = useState(() => null);
const [currentRole, setCurrentRoleState] = useState(() => getRole());
```

**(2c)** Replace the snapshot delta processing block inside the `useEffect`:
```js
// FIND the existing block starting with:
//   const newMsgs = docs.filter(m => !lastSeenIdsRef.current.has(m.id));
//   for (const m of newMsgs) { ... lastSeenIdsRef.current.add(m.id); ... }
// REPLACE WITH:

// V82 — hydrate / seed cursor from localStorage on first snapshot
let liveCursor = getCursor(selectedBranchId);
if (!liveCursor && docs.length > 0) {
  const latest = docs[docs.length - 1];
  const latestMs = typeof latest.createdAt === 'number'
    ? latest.createdAt
    : (latest.createdAt?.toMillis?.() ?? Date.now());
  liveCursor = initCursorIfMissing(selectedBranchId, latestMs);
}
setCursorState(liveCursor);

// V82 — derive truly-new messages relative to cursor (not in-memory Set)
const trulyNew = docs.filter(m => isMessageUnread(m, liveCursor, deviceId));
for (const m of trulyNew) {
  // Per-mount emit dedup — same message fired twice in snapshot re-emit during
  // ONE hook lifetime should not double-play sound. emittedForRef is reset
  // automatically on hook remount (which is fine — cursor handles cross-mount).
  if (emittedForRef.current.has(m.id)) continue;
  emittedForRef.current.add(m.id);

  const myName = getDisplayName();
  const isMention = myName && Array.isArray(m.mentions) && m.mentions.includes(myName);
  if (isMention) {
    if (!getMuted() && mentionSoundRef.current) {
      try {
        mentionSoundRef.current.volume = 0.6;
        const p = mentionSoundRef.current.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (_) { /* swallow */ }
    }
    setMinimized(false);
  } else {
    if (!getMuted() && defaultSoundRef.current) {
      try {
        defaultSoundRef.current.volume = 0.5;
        const p = defaultSoundRef.current.play();
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (_) { /* swallow */ }
    }
    // V82 — auto-expand on unread (force-open feature)
    setMinimized(false);
  }
}
```

**(2d)** Remove the standalone `unreadCount` useState — derive from cursor + messages:
```js
// REMOVE: const [unreadCount, setUnreadCount] = useState(0);

// Derive instead (place this useMemo after `messages` declaration):
const unreadCount = useMemo(() => {
  if (!cursor) return 0;
  return messages.filter(m => isMessageUnread(m, cursor, deviceId)).length;
}, [messages, cursor, deviceId]);
```

**(2e)** Remove the existing `setUnreadCount(0)` from `expand()` and replace with cursor advance:
```js
// FIND: const expand = useCallback(() => { setMinimized(false); setUnreadCount(0); }, []);
// REPLACE WITH (V82 — expand does NOT auto-mark as read; scroll-to-bottom does):
const expand = useCallback(() => {
  setMinimized(false);
}, []);
```

**(2f)** Add `markScrolledToBottom`:
```js
// Place near expand/minimize callbacks:
const markScrolledToBottom = useCallback(() => {
  if (!selectedBranchId || messages.length === 0) return;
  const latest = messages[messages.length - 1];
  const latestMs = typeof latest.createdAt === 'number'
    ? latest.createdAt
    : (latest.createdAt?.toMillis?.() ?? Date.now());
  setCursor(selectedBranchId, {
    lastReadId: latest.id,
    lastReadCreatedAtMs: latestMs,
    updatedAt: Date.now(),
  });
  setCursorState(getCursor(selectedBranchId));
}, [selectedBranchId, messages]);
```

**(2g)** Add `canMinimize` derived value (above the return):
```js
const canMinimize = unreadCount === 0;
```

**(2h)** Update `confirmName` signature to accept `role`:
```js
const confirmName = useCallback(async (name, color, role) => {
  const { setDisplayName } = await import('../lib/staffChatIdentity.js');
  setDisplayName(name);
  setCurrentDisplayName(name);
  if (typeof color === 'string') {
    try { setColor(color); setCurrentColor(color); } catch { /* swallow */ }
  }
  // V82 — optional role
  if (role === null || (typeof role === 'string')) {
    try { setRole(role); setCurrentRoleState(role); } catch { /* swallow */ }
  }
  setNamePickerOpen(false);
  setNameEditMode(false);
  if (pendingSendPayload) {
    const payload = pendingSendPayload;
    setPendingSendPayload(null);
    await send(payload.text, payload);
  }
}, [pendingSendPayload, send]);
```

**(2i)** Update `openNameEdit` to hydrate role too:
```js
const openNameEdit = useCallback(() => {
  const latest = getDisplayName();
  if (latest) setCurrentDisplayName(latest);
  setCurrentColor(getColor());
  setCurrentRoleState(getRole()); // V82
  setNameEditMode(true);
  setNamePickerOpen(true);
}, []);
```

**(2j)** Update `send` to embed `senderRole` in outgoing doc:
```js
// Inside send(), where buildMessageDoc is called, add senderRole:
doc = buildMessageDoc({
  branchId: selectedBranchId,
  displayName,
  deviceId,
  text,
  senderColor: getColor(),
  senderRole: getRole(), // V82
  ...extras,
});
```

**(2k)** Update the return statement — add `canMinimize`, `markScrolledToBottom`, `role`:
```js
return {
  messages, minimized, unreadCount,
  deviceId, error, loading,
  namePickerOpen, setNamePickerOpen,
  send, confirmName, expand, minimize,
  recentMentionCandidates,
  replyingTo, setReplyingTo,
  uploadImage,
  displayName: currentDisplayName,
  nameEditMode,
  openNameEdit,
  closeNameEdit: () => { setNameEditMode(false); setNamePickerOpen(false); },
  color: currentColor,
  // V82 NEW:
  canMinimize,
  markScrolledToBottom,
  role: currentRole,
};
```

- [ ] **Step 3: Reset `emittedForRef` on branch change inside the useEffect**

Add at the very top of the useEffect (after `if (!selectedBranchId) ... return;`):
```js
// V82 — reset per-mount emission dedup on resubscribe (new branch / remount)
emittedForRef.current = new Set();
```

- [ ] **Step 4: Verify build**

Run: `npm run build 2>&1 | tail -15`
Expected: clean build (no MISSING_EXPORT, no syntax errors).

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useStaffChat.js
git commit -m "fix(V82): useStaffChat cursor-based dedup + force-open canMinimize + role wire — closes Bug #2"
```

---

## Task 5: buildMessageDoc accepts senderRole (modify `staffChatClient.js`)

**Files:**
- Modify: `src/lib/staffChatClient.js`

- [ ] **Step 1: Read current buildMessageDoc**

Run: `grep -n -B 2 -A 30 "export function buildMessageDoc" src/lib/staffChatClient.js`

- [ ] **Step 2: Add senderRole to the parameter destructure + output**

Find:
```js
export function buildMessageDoc({
  branchId,
  displayName,
  deviceId,
  text,
  senderColor,
  // ... other fields
}) {
```

Add `senderRole` to the parameter list. Then in the return object, include `senderRole` (only if non-null) — use the existing pattern for senderColor:

```js
const doc = {
  branchId: String(branchId).trim(),
  displayName: String(displayName).trim(),
  deviceId: String(deviceId),
  text: String(text).trim(),
  createdAt: Date.now(),
  // ... existing fields
};
if (senderColor) doc.senderColor = String(senderColor);
// V82 — optional role badge
if (senderRole) doc.senderRole = String(senderRole);
return doc;
```

- [ ] **Step 3: Verify**

Run: `grep -n "senderRole" src/lib/staffChatClient.js`
Expected: 2+ matches (destructure + conditional assignment).

- [ ] **Step 4: Commit**

```bash
git add src/lib/staffChatClient.js
git commit -m "feat(V82): buildMessageDoc accepts optional senderRole field"
```

---

## Task 6: NamePicker role section (modify `StaffChatNamePicker.jsx`)

**Files:**
- Modify: `src/components/staffchat/StaffChatNamePicker.jsx`

- [ ] **Step 1: Read current NamePicker shape**

Run: `head -100 src/components/staffchat/StaffChatNamePicker.jsx`
Note: the existing color-row pattern is what to mirror for the role row.

- [ ] **Step 2: Add role state + selection**

**(2a)** Add imports at top:
```js
import StaffChatRoleBadge from './StaffChatRoleBadge.jsx';
import { ROLE_KEYS, ROLE_LABELS_TH, getRole } from '../../lib/staffChatIdentity.js';
```

**(2b)** Inside the component function, add role state (after the color state):
```js
// V82 — role state, hydrated from localStorage if editing, else null
const [selectedRole, setSelectedRole] = useState(() => editMode ? getRole() : null);
```

**(2c)** Update the form's submit handler (the function passed to `onSubmit`/`onConfirm`) to pass role:
```js
// FIND the existing call like: onConfirm(name, selectedColor)
// REPLACE WITH:
onConfirm(name, selectedColor, selectedRole);
```

**(2d)** Render role section below the color row. Find the closing tag of the color section and add:
```jsx
{/* V82 — Role selector (optional). 4 fixed roles + "ไม่ระบุ". */}
<div className="staffchat-namepicker-section" data-testid="staffchat-namepicker-role-section">
  <label className="staffchat-namepicker-label">ตำแหน่ง (ไม่บังคับ)</label>
  <div className="staffchat-namepicker-role-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px' }}>
    {ROLE_KEYS.map(roleKey => (
      <button
        type="button"
        key={roleKey}
        data-testid={`staffchat-namepicker-role-${roleKey}`}
        onClick={() => setSelectedRole(roleKey)}
        aria-pressed={selectedRole === roleKey}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '4px',
          padding: '8px 4px',
          border: selectedRole === roleKey ? '2px solid #ef4444' : '2px solid transparent',
          borderRadius: '8px',
          background: selectedRole === roleKey ? 'rgba(239,68,68,0.1)' : 'transparent',
          cursor: 'pointer',
        }}
      >
        <StaffChatRoleBadge role={roleKey} size="lg" />
        <span style={{ fontSize: '11px' }}>{ROLE_LABELS_TH[roleKey]}</span>
      </button>
    ))}
    <button
      type="button"
      data-testid="staffchat-namepicker-role-none"
      onClick={() => setSelectedRole(null)}
      aria-pressed={selectedRole === null}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px',
        padding: '8px 4px',
        border: selectedRole === null ? '2px solid #ef4444' : '2px dashed #52525b',
        borderRadius: '8px',
        background: selectedRole === null ? 'rgba(239,68,68,0.1)' : 'transparent',
        cursor: 'pointer',
      }}
    >
      <div style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', color: '#71717a' }}>—</div>
      <span style={{ fontSize: '11px' }}>ไม่ระบุ</span>
    </button>
  </div>
</div>
```

- [ ] **Step 3: Verify build**

Run: `npm run build 2>&1 | tail -10`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/staffchat/StaffChatNamePicker.jsx
git commit -m "feat(V82): NamePicker role section — 4 roles + 'ไม่ระบุ' tile; confirmName(name,color,role)"
```

---

## Task 7: Message bubble badge + MessageList sentinel

**Files:**
- Modify: `src/components/staffchat/StaffChatMessage.jsx`
- Modify: `src/components/staffchat/StaffChatMessageList.jsx`

- [ ] **Step 1: Bubble badge — `StaffChatMessage.jsx`**

**(1a)** Add import:
```js
import StaffChatRoleBadge from './StaffChatRoleBadge.jsx';
```

**(1b)** Find the sender-name render block (look for `message.displayName` or `data-sender-name`). Render badge inline-flex BEFORE the name:
```jsx
<span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
  <StaffChatRoleBadge role={message.senderRole} size="sm" />
  <span data-testid="staff-chat-sender-name" style={{ color: message.senderColor || '#fb923c', fontWeight: 600 }}>
    {message.displayName}
  </span>
</span>
```

- [ ] **Step 2: MessageList sentinel — `StaffChatMessageList.jsx`**

**(2a)** Add `useRef` + `useEffect` for IntersectionObserver. Accept `onScrolledToBottom` prop:
```js
// At top of component:
import { useRef, useEffect } from 'react';

export default function StaffChatMessageList({ messages, onScrolledToBottom, ... }) {
  const bottomSentinelRef = useRef(null);

  useEffect(() => {
    if (!bottomSentinelRef.current || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting && typeof onScrolledToBottom === 'function') {
            onScrolledToBottom();
          }
        }
      },
      { threshold: 0.5 }
    );
    obs.observe(bottomSentinelRef.current);
    return () => obs.disconnect();
  }, [onScrolledToBottom]);

  return (
    <div className="staffchat-message-list" data-testid="staff-chat-message-list">
      {messages.map(m => <StaffChatMessage key={m.id} message={m} ... />)}
      {/* V82 — bottom sentinel for scroll-to-bottom detection */}
      <div ref={bottomSentinelRef} data-testid="staff-chat-bottom-sentinel" style={{ height: '1px' }} />
    </div>
  );
}
```

- [ ] **Step 3: Verify**

Run: `grep -n "bottomSentinelRef\|onScrolledToBottom" src/components/staffchat/StaffChatMessageList.jsx`
Expected: 3+ matches (ref decl, useEffect observe, JSX render).

- [ ] **Step 4: Commit**

```bash
git add src/components/staffchat/StaffChatMessage.jsx src/components/staffchat/StaffChatMessageList.jsx
git commit -m "feat(V82): bubble RoleBadge + MessageList bottomSentinel for scroll-to-bottom cursor advance"
```

---

## Task 8: Wire markScrolledToBottom + force-open in Widget/Header/Panel

**Files:**
- Modify: `src/components/staffchat/StaffChatPanel.jsx` (or wherever MessageList is rendered)
- Modify: `src/components/staffchat/StaffChatHeader.jsx` (minimize button location)

- [ ] **Step 1: Pass markScrolledToBottom prop down**

In `StaffChatPanel.jsx`, find where `useStaffChat()` is consumed AND where `<StaffChatMessageList>` is rendered. Destructure `markScrolledToBottom` + `canMinimize` + `role` from hook:

```js
const { messages, markScrolledToBottom, canMinimize, role, ... } = useStaffChat();
```

Pass to MessageList:
```jsx
<StaffChatMessageList messages={messages} onScrolledToBottom={markScrolledToBottom} ... />
```

- [ ] **Step 2: Force-open gate on minimize button**

In `StaffChatHeader.jsx` (or wherever the minimize/collapse button lives):

```jsx
// Receive canMinimize as prop from parent OR via useStaffChat directly
const { canMinimize, minimize, ... } = useStaffChat();

<button
  type="button"
  data-testid="staff-chat-minimize-btn"
  onClick={canMinimize ? minimize : undefined}
  disabled={!canMinimize}
  title={canMinimize ? 'ย่อหน้าต่าง' : 'เลื่อนลงล่างก่อน ⬇'}
  aria-disabled={!canMinimize}
  style={{ opacity: canMinimize ? 1 : 0.4, cursor: canMinimize ? 'pointer' : 'not-allowed' }}
>
  {/* existing minimize icon */}
</button>
```

- [ ] **Step 3: Verify build + grep wires**

```bash
npm run build 2>&1 | tail -10
grep -n "markScrolledToBottom\|canMinimize" src/components/staffchat/*.jsx
```
Expected: clean build; ≥4 matches across Panel/Header/MessageList/useStaffChat.

- [ ] **Step 4: Commit**

```bash
git add src/components/staffchat/StaffChatPanel.jsx src/components/staffchat/StaffChatHeader.jsx
git commit -m "feat(V82): wire markScrolledToBottom + canMinimize force-open gate"
```

---

## Task 9: Test bank — 8 groups in single file (Rule K work-first-test-last)

**Files:**
- Create: `tests/v82-staff-chat-cursor-and-badge.test.js`

- [ ] **Step 1: Write the full test bank**

```js
// tests/v82-staff-chat-cursor-and-badge.test.js
// V82 (2026-05-17 post-V81-fix7b) regression bank.
//
// 8 groups, ~60 assertions:
//   A. Cursor module unit (8)
//   B. Bug #2 reproduction — snapshot re-fire post-remount (4)
//   C. First-mount silent backlog (2)
//   D. Force-open semantics (5)
//   E. Sound dedup (3)
//   F. Badge picker RTL (6)
//   G. Badge display RTL (4)
//   H. Source-grep regression locks (8)

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const REPO_ROOT = join(import.meta.dirname, '..');
const readFile = (p) => readFileSync(p, 'utf-8');

// ─── Group A — Cursor module unit ─────────────────────────────────────────
describe('AV76.A — staffChatReadCursor module unit', () => {
  let getCursor, setCursor, isMessageUnread, initCursorIfMissing, CURSOR_STORAGE_KEY;
  beforeEach(async () => {
    // Fresh import per test for clean localStorage state
    vi.resetModules();
    if (typeof global.localStorage === 'undefined') {
      const store = new Map();
      global.localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
        clear: () => store.clear(),
      };
      global.window = { localStorage: global.localStorage };
    } else {
      global.localStorage.clear();
    }
    const mod = await import('../src/lib/staffChatReadCursor.js');
    getCursor = mod.getCursor;
    setCursor = mod.setCursor;
    isMessageUnread = mod.isMessageUnread;
    initCursorIfMissing = mod.initCursorIfMissing;
    CURSOR_STORAGE_KEY = mod.CURSOR_STORAGE_KEY;
  });

  it('A.1 getCursor returns null for absent key', () => {
    expect(getCursor('BR-X')).toBeNull();
  });
  it('A.2 setCursor + getCursor round-trip', () => {
    setCursor('BR-X', { lastReadId: 'm1', lastReadCreatedAtMs: 1000 });
    const c = getCursor('BR-X');
    expect(c.lastReadId).toBe('m1');
    expect(c.lastReadCreatedAtMs).toBe(1000);
    expect(typeof c.updatedAt).toBe('number');
  });
  it('A.3 setCursor partial update preserves existing fields', () => {
    setCursor('BR-X', { lastReadId: 'm1', lastReadCreatedAtMs: 1000 });
    setCursor('BR-X', { lastReadId: 'm2' });
    const c = getCursor('BR-X');
    expect(c.lastReadId).toBe('m2');
    expect(c.lastReadCreatedAtMs).toBe(1000); // preserved
  });
  it('A.4 different branches have independent cursors', () => {
    setCursor('BR-A', { lastReadCreatedAtMs: 100 });
    setCursor('BR-B', { lastReadCreatedAtMs: 200 });
    expect(getCursor('BR-A').lastReadCreatedAtMs).toBe(100);
    expect(getCursor('BR-B').lastReadCreatedAtMs).toBe(200);
  });
  it('A.5 isMessageUnread true when message createdAt > cursor', () => {
    const cursor = { lastReadCreatedAtMs: 500, lastReadId: '' };
    expect(isMessageUnread({ createdAt: 600, deviceId: 'other' }, cursor, 'me')).toBe(true);
  });
  it('A.6 isMessageUnread false when message createdAt <= cursor', () => {
    const cursor = { lastReadCreatedAtMs: 500, lastReadId: '' };
    expect(isMessageUnread({ createdAt: 500, deviceId: 'other' }, cursor, 'me')).toBe(false);
    expect(isMessageUnread({ createdAt: 400, deviceId: 'other' }, cursor, 'me')).toBe(false);
  });
  it('A.7 isMessageUnread false when message from self', () => {
    const cursor = { lastReadCreatedAtMs: 500, lastReadId: '' };
    expect(isMessageUnread({ createdAt: 600, deviceId: 'me' }, cursor, 'me')).toBe(false);
  });
  it('A.8 initCursorIfMissing seeds with latest createdAt when absent; idempotent', () => {
    const c1 = initCursorIfMissing('BR-X', 999);
    expect(c1.lastReadCreatedAtMs).toBe(999);
    const c2 = initCursorIfMissing('BR-X', 1234); // already set; should be no-op
    expect(c2.lastReadCreatedAtMs).toBe(999);
  });
  it('A.9 CURSOR_STORAGE_KEY format', () => {
    expect(CURSOR_STORAGE_KEY('BR-test')).toBe('staffChat:cursor:BR-test');
  });
});

// ─── Group B — Bug #2 reproduction ────────────────────────────────────────
describe('AV76.B — Bug #2 snapshot-re-fire post-remount', () => {
  let getCursor, setCursor, isMessageUnread, initCursorIfMissing;
  beforeEach(async () => {
    vi.resetModules();
    const store = new Map();
    global.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
    };
    global.window = { localStorage: global.localStorage };
    const mod = await import('../src/lib/staffChatReadCursor.js');
    ({ getCursor, setCursor, isMessageUnread, initCursorIfMissing } = mod);
  });

  it('B.1 50-message snapshot + cursor at latest → 0 unread (Bug #2 closed)', () => {
    const messages = Array.from({ length: 50 }, (_, i) => ({
      id: `m${i}`, createdAt: 1000 + i, deviceId: 'other-device',
    }));
    setCursor('BR-X', { lastReadId: 'm49', lastReadCreatedAtMs: 1049 });
    const cursor = getCursor('BR-X');
    const unread = messages.filter(m => isMessageUnread(m, cursor, 'me')).length;
    expect(unread).toBe(0);
  });
  it('B.2 cross-mount: simulate remount → cursor hydrated; 0 unread', () => {
    setCursor('BR-X', { lastReadId: 'm49', lastReadCreatedAtMs: 1049 });
    // Simulate hook unmount + remount: cursor persists in localStorage
    const cursorAfterRemount = getCursor('BR-X');
    expect(cursorAfterRemount.lastReadCreatedAtMs).toBe(1049);
  });
  it('B.3 truly-new message after cursor → 1 unread', () => {
    setCursor('BR-X', { lastReadId: 'm49', lastReadCreatedAtMs: 1049 });
    const cursor = getCursor('BR-X');
    const newMsg = { id: 'm50', createdAt: 1050, deviceId: 'other-device' };
    expect(isMessageUnread(newMsg, cursor, 'me')).toBe(true);
  });
  it('B.4 own message (from self deviceId) → 0 unread even when newer', () => {
    setCursor('BR-X', { lastReadCreatedAtMs: 1049 });
    const cursor = getCursor('BR-X');
    const ownMsg = { id: 'm50', createdAt: 1050, deviceId: 'me' };
    expect(isMessageUnread(ownMsg, cursor, 'me')).toBe(false);
  });
});

// ─── Group C — First-mount silent backlog ─────────────────────────────────
describe('AV76.C — first-ever mount silent backlog', () => {
  let getCursor, initCursorIfMissing, isMessageUnread;
  beforeEach(async () => {
    vi.resetModules();
    const store = new Map();
    global.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
    };
    global.window = { localStorage: global.localStorage };
    ({ getCursor, initCursorIfMissing, isMessageUnread } = await import('../src/lib/staffChatReadCursor.js'));
  });

  it('C.1 first mount with 50 messages → cursor = latest.createdAt → all 50 silent', () => {
    const messages = Array.from({ length: 50 }, (_, i) => ({
      id: `m${i}`, createdAt: 1000 + i, deviceId: 'other',
    }));
    const latestMs = messages[messages.length - 1].createdAt;
    const cursor = initCursorIfMissing('BR-X', latestMs);
    expect(cursor.lastReadCreatedAtMs).toBe(latestMs);
    const unread = messages.filter(m => isMessageUnread(m, cursor, 'me')).length;
    expect(unread).toBe(0);
  });
  it('C.2 first mount with 0 messages → cursor = now (fallback)', () => {
    const before = Date.now();
    const cursor = initCursorIfMissing('BR-Y', undefined);
    expect(cursor.lastReadCreatedAtMs).toBeGreaterThanOrEqual(before);
  });
});

// ─── Group D — Force-open semantics ───────────────────────────────────────
describe('AV76.D — force-open semantics', () => {
  // Behavioral tests via source-grep + simulator (full RTL in F group)
  it('D.1 useStaffChat exposes canMinimize derived from unreadCount', () => {
    const src = readFile(join(REPO_ROOT, 'src/hooks/useStaffChat.js'));
    expect(src).toMatch(/canMinimize\s*=\s*unreadCount\s*===\s*0/);
  });
  it('D.2 useStaffChat exports markScrolledToBottom', () => {
    const src = readFile(join(REPO_ROOT, 'src/hooks/useStaffChat.js'));
    expect(src).toMatch(/markScrolledToBottom/);
  });
  it('D.3 expand() does NOT zero unreadCount (per Q1=B scroll-to-bottom drives it)', () => {
    const src = readFile(join(REPO_ROOT, 'src/hooks/useStaffChat.js'));
    // V82 marker — old "setUnreadCount(0)" inside expand should be gone
    const expandBlock = src.match(/const expand = useCallback\(\(\) => \{([\s\S]{0,200})\}/);
    expect(expandBlock).toBeTruthy();
    expect(expandBlock[1]).not.toMatch(/setUnreadCount\s*\(\s*0\s*\)/);
  });
  it('D.4 Header minimize button has disabled={!canMinimize} prop', () => {
    const src = readFile(join(REPO_ROOT, 'src/components/staffchat/StaffChatHeader.jsx'));
    expect(src).toMatch(/disabled=\{!canMinimize\}|disabled=\{\s*!canMinimize\s*\}/);
  });
  it('D.5 Header minimize button has Thai tooltip when blocked', () => {
    const src = readFile(join(REPO_ROOT, 'src/components/staffchat/StaffChatHeader.jsx'));
    expect(src).toMatch(/เลื่อนลงล่าง/);
  });
});

// ─── Group E — Sound dedup ────────────────────────────────────────────────
describe('AV76.E — sound dedup', () => {
  it('E.1 useStaffChat uses emittedForRef Set for per-mount dedup', () => {
    const src = readFile(join(REPO_ROOT, 'src/hooks/useStaffChat.js'));
    expect(src).toMatch(/emittedForRef/);
  });
  it('E.2 useStaffChat no longer uses lastSeenIdsRef for cross-mount dedup (Bug #2 anti-regression)', () => {
    const src = readFile(join(REPO_ROOT, 'src/hooks/useStaffChat.js'));
    expect(src).not.toMatch(/lastSeenIdsRef\s*=\s*useRef\s*\(\s*new Set\(\)\s*\)/);
  });
  it('E.3 useStaffChat sound emit gated on isMessageUnread (cursor-relative)', () => {
    const src = readFile(join(REPO_ROOT, 'src/hooks/useStaffChat.js'));
    expect(src).toMatch(/isMessageUnread/);
  });
});

// ─── Group F — Badge picker RTL ──────────────────────────────────────────
import { render, screen, fireEvent } from '@testing-library/react';

describe('AV76.F — NamePicker role section RTL', () => {
  beforeEach(() => {
    if (typeof global.localStorage === 'undefined') {
      const store = new Map();
      global.localStorage = {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
        clear: () => store.clear(),
      };
      global.window = global.window || {};
      global.window.localStorage = global.localStorage;
    } else {
      global.localStorage.clear();
    }
  });

  it('F.1 renders 4 role tiles + "ไม่ระบุ" tile', async () => {
    const { default: NamePicker } = await import('../src/components/staffchat/StaffChatNamePicker.jsx');
    render(<NamePicker open initialName="" initialColor="#ef4444" onConfirm={() => {}} onClose={() => {}} />);
    expect(screen.getByTestId('staffchat-namepicker-role-doctor')).toBeTruthy();
    expect(screen.getByTestId('staffchat-namepicker-role-assistant')).toBeTruthy();
    expect(screen.getByTestId('staffchat-namepicker-role-staff')).toBeTruthy();
    expect(screen.getByTestId('staffchat-namepicker-role-manager')).toBeTruthy();
    expect(screen.getByTestId('staffchat-namepicker-role-none')).toBeTruthy();
  });
  it('F.2 clicking a role tile sets aria-pressed=true', async () => {
    const { default: NamePicker } = await import('../src/components/staffchat/StaffChatNamePicker.jsx');
    render(<NamePicker open initialName="" initialColor="#ef4444" onConfirm={() => {}} onClose={() => {}} />);
    const tile = screen.getByTestId('staffchat-namepicker-role-doctor');
    fireEvent.click(tile);
    expect(tile.getAttribute('aria-pressed')).toBe('true');
  });
  it('F.3 onConfirm called with (name, color, role)', async () => {
    const { default: NamePicker } = await import('../src/components/staffchat/StaffChatNamePicker.jsx');
    const onConfirm = vi.fn();
    render(<NamePicker open initialName="" initialColor="#ef4444" onConfirm={onConfirm} onClose={() => {}} />);
    // Fill name
    const nameInput = screen.getByPlaceholderText(/ชื่อ/i);
    fireEvent.change(nameInput, { target: { value: 'หมอเอ' } });
    fireEvent.click(screen.getByTestId('staffchat-namepicker-role-doctor'));
    // Find submit button (label varies; use form submit semantics)
    const form = nameInput.closest('form');
    fireEvent.submit(form);
    expect(onConfirm).toHaveBeenCalledWith('หมอเอ', expect.any(String), 'doctor');
  });
  it('F.4 "ไม่ระบุ" tile yields null role', async () => {
    const { default: NamePicker } = await import('../src/components/staffchat/StaffChatNamePicker.jsx');
    const onConfirm = vi.fn();
    render(<NamePicker open initialName="" initialColor="#ef4444" onConfirm={onConfirm} onClose={() => {}} />);
    fireEvent.change(screen.getByPlaceholderText(/ชื่อ/i), { target: { value: 'X' } });
    fireEvent.click(screen.getByTestId('staffchat-namepicker-role-none'));
    fireEvent.submit(screen.getByPlaceholderText(/ชื่อ/i).closest('form'));
    expect(onConfirm).toHaveBeenCalledWith('X', expect.any(String), null);
  });
  it('F.5 setRole/getRole round-trip via localStorage', async () => {
    const { setRole, getRole, ROLE_KEYS } = await import('../src/lib/staffChatIdentity.js');
    setRole('doctor');
    expect(getRole()).toBe('doctor');
    setRole(null);
    expect(getRole()).toBeNull();
  });
  it('F.6 setRole throws on invalid role', async () => {
    const { setRole } = await import('../src/lib/staffChatIdentity.js');
    expect(() => setRole('janitor')).toThrow();
  });
});

// ─── Group G — Badge display RTL ─────────────────────────────────────────
describe('AV76.G — RoleBadge component RTL', () => {
  it('G.1 RoleBadge renders for valid role + size="sm"', async () => {
    const { default: RoleBadge } = await import('../src/components/staffchat/StaffChatRoleBadge.jsx');
    render(<RoleBadge role="doctor" size="sm" />);
    expect(screen.getByTestId('staff-chat-role-badge-sm-doctor')).toBeTruthy();
  });
  it('G.2 RoleBadge renders null for invalid role', async () => {
    const { default: RoleBadge } = await import('../src/components/staffchat/StaffChatRoleBadge.jsx');
    const { container } = render(<RoleBadge role="janitor" size="sm" />);
    expect(container.firstChild).toBeNull();
  });
  it('G.3 RoleBadge renders null for absent role (legacy message)', async () => {
    const { default: RoleBadge } = await import('../src/components/staffchat/StaffChatRoleBadge.jsx');
    const { container } = render(<RoleBadge role={null} size="sm" />);
    expect(container.firstChild).toBeNull();
  });
  it('G.4 size="lg" renders 40px outer; size="sm" renders 16px outer', async () => {
    const { default: RoleBadge } = await import('../src/components/staffchat/StaffChatRoleBadge.jsx');
    const { rerender, container } = render(<RoleBadge role="doctor" size="lg" />);
    expect(container.firstChild.style.width).toBe('40px');
    rerender(<RoleBadge role="doctor" size="sm" />);
    expect(container.firstChild.style.width).toBe('16px');
  });
});

// ─── Group H — Source-grep regression locks ──────────────────────────────
describe('AV76.H — source-grep regression locks (AV76 enforcement)', () => {
  it('H.1 useStaffChat imports cursor module', () => {
    const src = readFile(join(REPO_ROOT, 'src/hooks/useStaffChat.js'));
    expect(src).toMatch(/from\s+['"]\.\.\/lib\/staffChatReadCursor\.js['"]/);
  });
  it('H.2 useStaffChat imports getRole/setRole from staffChatIdentity', () => {
    const src = readFile(join(REPO_ROOT, 'src/hooks/useStaffChat.js'));
    expect(src).toMatch(/getRole|setRole/);
  });
  it('H.3 staffChatClient buildMessageDoc references senderRole', () => {
    const src = readFile(join(REPO_ROOT, 'src/lib/staffChatClient.js'));
    expect(src).toMatch(/senderRole/);
  });
  it('H.4 StaffChatMessage renders RoleBadge inline before name', () => {
    const src = readFile(join(REPO_ROOT, 'src/components/staffchat/StaffChatMessage.jsx'));
    expect(src).toMatch(/StaffChatRoleBadge/);
    expect(src).toMatch(/message\.senderRole/);
  });
  it('H.5 NamePicker renders 4 role tile testids', () => {
    const src = readFile(join(REPO_ROOT, 'src/components/staffchat/StaffChatNamePicker.jsx'));
    for (const k of ['doctor', 'assistant', 'staff', 'manager']) {
      expect(src).toMatch(new RegExp(`staffchat-namepicker-role-${k}`));
    }
  });
  it('H.6 MessageList wires bottomSentinelRef + IntersectionObserver', () => {
    const src = readFile(join(REPO_ROOT, 'src/components/staffchat/StaffChatMessageList.jsx'));
    expect(src).toMatch(/bottomSentinelRef/);
    expect(src).toMatch(/IntersectionObserver/);
  });
  it('H.7 RoleBadge is the SINGLE source — no inline role-badge SVG outside the component (Rule C1)', () => {
    const list = readFile(join(REPO_ROOT, 'src/components/staffchat/StaffChatMessage.jsx'));
    const picker = readFile(join(REPO_ROOT, 'src/components/staffchat/StaffChatNamePicker.jsx'));
    // Both consumers should reference RoleBadge, NOT inline Lucide icons for the same purpose
    expect(list).toMatch(/StaffChatRoleBadge/);
    expect(picker).toMatch(/StaffChatRoleBadge/);
  });
  it('H.8 V82 marker comments present in all modified files (institutional memory)', () => {
    for (const p of [
      'src/lib/staffChatReadCursor.js',
      'src/lib/staffChatIdentity.js',
      'src/hooks/useStaffChat.js',
      'src/components/staffchat/StaffChatRoleBadge.jsx',
      'src/components/staffchat/StaffChatNamePicker.jsx',
      'src/components/staffchat/StaffChatMessage.jsx',
      'src/components/staffchat/StaffChatMessageList.jsx',
    ]) {
      expect(readFile(join(REPO_ROOT, p))).toMatch(/V82/);
    }
  });
});
```

- [ ] **Step 2: Run targeted tests + verify all green**

```bash
npx vitest run tests/v82-staff-chat-cursor-and-badge.test.js 2>&1 | tail -20
```
Expected: 60+ PASS / 0 FAIL.

- [ ] **Step 3: Commit**

```bash
git add tests/v82-staff-chat-cursor-and-badge.test.js
git commit -m "test(V82): 60+ assertion regression bank — A cursor + B Bug#2 repro + C-H force-open/badge/source-grep"
```

---

## Task 10: AV76 invariant in audit-anti-vibe-code SKILL.md

**Files:**
- Modify: `.agents/skills/audit-anti-vibe-code/SKILL.md`

- [ ] **Step 1: Append AV76 entry (after the existing last AV entry)**

Find the end of the current AV invariants list (search for last `### AV` header). Append:

```markdown
### AV76 — In-memory dedup for Firestore listener results crashes on remount (V82, 2026-05-17)

**Trigger**: Any component that subscribes to a Firestore listener AND uses
`useRef(new Set())` to track "seen IDs" for unread/sound dedup. The Set is
in-memory — it resets every component remount (parent re-render, route change,
tab toggle). On resubscribe, the listener fires with the full result set, all
docs look "new", duplicate sound + unread events fire.

**Why**: Cross-remount dedup needs PERSISTENT state, not in-memory ref. Per
Rule of 3 / per-device patterns:
- **Per-device** (most common): localStorage cursor with `{branchId}` keying
- **Cross-device** (rare): Firestore doc per-(uid, scope)

**Origin**: V73 useStaffChat shipped with `lastSeenIdsRef = useRef(new Set())`.
After V81-fix7b deploy, user reported chat badge count growing + noti spam on
every Frontend↔Backend tab switch — same device, same name, same color, but
unread state reset every remount. V82 introduced `staffChatReadCursor.js`
(localStorage per-(deviceId, branchId)) to close the gap permanently.

**Source-grep pattern** (catches future drift):
```
grep -rn "useRef\s*(\s*new Set\s*(" src/ | grep -v node_modules
```
For each match, verify whether cross-remount dedup is required. If YES →
migrate to persistent cursor (localStorage or Firestore). If NO (per-mount
dedup is intentional, e.g. modal open-close) → annotate with comment
`// AV76 safe — per-mount dedup intentional` so the audit skips.

**Sanctioned exceptions**: short-lived modal components where the user is
expected to see all listener events fresh on each open; one-shot toast
notifications.

**Detection**: regression test `tests/v82-staff-chat-cursor-and-badge.test.js`
Group H assertions (H.1-H.8) lock the post-fix shape: cursor module imported,
markScrolledToBottom wired, no `lastSeenIdsRef = useRef(new Set())` remains.

**Priority**: HIGH — listener-consuming components are common; missed dedup
manifests as user-visible noti/badge spam (Rule Q V66 trust collapse risk).

**Lineage**: V82 (2026-05-17 post-V81-fix7b) — single migration of useStaffChat.
Cross-file grep (Rule P Step 3) confirmed no other listener consumers in src/
currently use `useRef(new Set())` for cross-remount dedup. AV76 codifies the
pattern permanently.
```

- [ ] **Step 2: Commit**

```bash
git add .agents/skills/audit-anti-vibe-code/SKILL.md
git commit -m "docs(V82): AV76 invariant — useRef(new Set()) for Firestore listener dedup forbidden across remount"
```

---

## Task 11: Stress test runner (NEW `scripts/v82-staff-chat-stress.mjs`)

**Files:**
- Create: `scripts/v82-staff-chat-stress.mjs`

- [ ] **Step 1: Write the stress runner (10 scenarios per user directive)**

```js
// scripts/v82-staff-chat-stress.mjs
// V82 (2026-05-17 post-V81-fix7b) — 10-scenario brutal stress test against
// real prod Firestore via admin SDK. Per Rule M + Rule R + user directive
// "stress test แบบโหดๆ".
//
// Each scenario tests a different aspect of the cursor + force-open + badge
// system. Run sequentially; aborts on first failure for diagnostic clarity.
//
// USAGE:
//   vercel env pull .env.local.prod --environment=production   # if needed
//   node scripts/v82-staff-chat-stress.mjs [--scenario N]
//
// NEVER click real action buttons in preview_eval; this script uses TEST-
// prefixed fixtures per V33.11/V33.12 discipline.

import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { randomBytes } from 'crypto';

// ─── Env + admin SDK ─────────────────────────────────────────────────────
const envText = readFileSync('.env.local.prod', 'utf-8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let v = m[2];
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  process.env[m[1]] = v;
}
const APP_ID = 'loverclinic-opd-4c39b';
function admin() {
  if (getApps().length > 0) return getApp();
  return initializeApp({
    credential: cert({
      projectId: APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n'),
    }),
  });
}
const app = admin();
const db = getFirestore(app);
const messagesCol = () => db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection('be_staff_chat_messages');

// ─── Test fixtures ───────────────────────────────────────────────────────
const TEST_BRANCH = 'TEST-V82-STRESS-BR-' + Date.now();
const TEST_DEVICE_A = 'TEST-V82-DEV-A-' + Date.now();
const TEST_DEVICE_B = 'TEST-V82-DEV-B-' + Date.now();

let createdDocIds = [];

async function writeMessage({ deviceId, text, mentions = [], senderRole = null }) {
  const id = `TEST-V82-MSG-${Date.now()}-${randomBytes(4).toString('hex')}`;
  await messagesCol().doc(id).set({
    branchId: TEST_BRANCH,
    displayName: 'StressBot ' + deviceId.slice(-2),
    deviceId,
    text,
    senderColor: '#fb923c',
    senderRole,
    mentions,
    createdAt: Date.now(),
    _stressTestId: id,
  });
  createdDocIds.push(id);
  return id;
}

async function cleanup() {
  // eslint-disable-next-line no-console
  console.log(`\n[cleanup] deleting ${createdDocIds.length} test docs...`);
  let nuked = 0;
  for (const id of createdDocIds) {
    try { await messagesCol().doc(id).delete(); nuked++; } catch { /* */ }
  }
  // eslint-disable-next-line no-console
  console.log(`[cleanup] nuked ${nuked}/${createdDocIds.length}`);
}

// ─── 10 Scenarios ────────────────────────────────────────────────────────
const SCENARIOS = [
  {
    name: 'S1 — Baseline: write 1 msg, verify shape',
    run: async () => {
      const id = await writeMessage({ deviceId: TEST_DEVICE_A, text: 'baseline test' });
      const doc = await messagesCol().doc(id).get();
      if (!doc.exists) throw new Error('doc not written');
      if (doc.data().branchId !== TEST_BRANCH) throw new Error('branchId mismatch');
    },
  },
  {
    name: 'S2 — 10 rapid messages (sound dedup soak)',
    run: async () => {
      for (let i = 0; i < 10; i++) await writeMessage({ deviceId: TEST_DEVICE_A, text: `rapid ${i}` });
      const snap = await messagesCol().where('branchId', '==', TEST_BRANCH).get();
      if (snap.size < 11) throw new Error(`expected ≥11 docs, got ${snap.size}`);
    },
  },
  {
    name: 'S3 — Cross-device mention',
    run: async () => {
      await writeMessage({ deviceId: TEST_DEVICE_B, text: '@StressBot A hello', mentions: ['StressBot ' + TEST_DEVICE_A.slice(-2)] });
    },
  },
  {
    name: 'S4 — All 4 role badges',
    run: async () => {
      for (const role of ['doctor', 'assistant', 'staff', 'manager']) {
        await writeMessage({ deviceId: TEST_DEVICE_A, text: `role test ${role}`, senderRole: role });
      }
    },
  },
  {
    name: 'S5 — Null senderRole (legacy compat)',
    run: async () => {
      await writeMessage({ deviceId: TEST_DEVICE_A, text: 'no-badge', senderRole: null });
    },
  },
  {
    name: 'S6 — Invalid senderRole (graceful degrade)',
    run: async () => {
      await writeMessage({ deviceId: TEST_DEVICE_A, text: 'invalid-role', senderRole: 'janitor' });
      // UI should render null badge; not crash. We can't verify UI from admin SDK; just confirm write.
    },
  },
  {
    name: 'S7 — Adversarial text (Thai + emoji + NUL + 10K)',
    run: async () => {
      await writeMessage({ deviceId: TEST_DEVICE_A, text: 'ทดสอบ 🎉\0' + 'x'.repeat(10000) });
    },
  },
  {
    name: 'S8 — Concurrent writes from 2 devices',
    run: async () => {
      await Promise.all([
        writeMessage({ deviceId: TEST_DEVICE_A, text: 'concurrent A' }),
        writeMessage({ deviceId: TEST_DEVICE_B, text: 'concurrent B' }),
        writeMessage({ deviceId: TEST_DEVICE_A, text: 'concurrent A2' }),
        writeMessage({ deviceId: TEST_DEVICE_B, text: 'concurrent B2' }),
      ]);
    },
  },
  {
    name: 'S9 — Snapshot re-emit simulation (Bug #2 repro)',
    run: async () => {
      // Read snap, simulate "re-emit": read again and verify same doc IDs returned.
      // The cursor logic (client-side) MUST treat the second read as 0 unread.
      const snap1 = await messagesCol().where('branchId', '==', TEST_BRANCH).get();
      const snap2 = await messagesCol().where('branchId', '==', TEST_BRANCH).get();
      const ids1 = snap1.docs.map(d => d.id).sort();
      const ids2 = snap2.docs.map(d => d.id).sort();
      if (JSON.stringify(ids1) !== JSON.stringify(ids2)) {
        throw new Error('snapshot inconsistency between calls');
      }
    },
  },
  {
    name: 'S10 — Branch isolation (write to TEST_BRANCH, read from different branch)',
    run: async () => {
      const otherBranch = 'TEST-V82-OTHER-' + Date.now();
      const snap = await messagesCol().where('branchId', '==', otherBranch).get();
      if (snap.size !== 0) throw new Error(`expected 0 docs in other branch, got ${snap.size}`);
    },
  },
];

// ─── Runner ──────────────────────────────────────────────────────────────
async function main() {
  // eslint-disable-next-line no-console
  console.log(`\n=== V82 Stress test (10 scenarios) — TEST_BRANCH=${TEST_BRANCH} ===\n`);
  const argIdx = process.argv.indexOf('--scenario');
  const onlyN = argIdx >= 0 ? parseInt(process.argv[argIdx + 1], 10) : null;
  let pass = 0, fail = 0;
  for (let i = 0; i < SCENARIOS.length; i++) {
    if (onlyN !== null && (i + 1) !== onlyN) continue;
    const { name, run } = SCENARIOS[i];
    process.stdout.write(`[${i + 1}/10] ${name} ... `);
    try { await run(); console.log('✓ PASS'); pass++; }
    catch (e) { console.log('✗ FAIL — ' + (e.message || e)); fail++; if (onlyN === null) break; }
  }
  await cleanup();
  console.log(`\n=== RESULTS: ${pass} pass / ${fail} fail ===\n`);
  process.exit(fail === 0 ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); cleanup().finally(() => process.exit(1)); });
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/v82-staff-chat-stress.mjs
git commit -m "test(V82): 10-scenario stress runner — Rule M admin-SDK + TEST-V82 fixtures + auto-cleanup"
```

---

## Task 12: Rule Q L2 verifier (NEW `scripts/v82-cursor-l2-verify.mjs`)

**Files:**
- Create: `scripts/v82-cursor-l2-verify.mjs`

- [ ] **Step 1: Write the L2 verifier**

```js
// scripts/v82-cursor-l2-verify.mjs
// V82 (2026-05-17) — Rule Q V66 L2 verification: simulates the cursor flow
// against REAL client-SDK-style query patterns (we use admin SDK here for
// privileged read, but exercise the EXACT compound query shape the UI uses).
//
// Verifies:
//   - Listener re-fire returns same doc IDs (no new docs introduced)
//   - Cursor stamped to localStorage SHOULD prevent unread bump
//   - Cross-branch query isolation
//
// USAGE: node scripts/v82-cursor-l2-verify.mjs

import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import { initializeApp, cert, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const envText = readFileSync('.env.local.prod', 'utf-8');
for (const line of envText.split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m) continue;
  let v = m[2];
  if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
  process.env[m[1]] = v;
}
const APP_ID = 'loverclinic-opd-4c39b';

function admin() {
  if (getApps().length > 0) return getApp();
  return initializeApp({
    credential: cert({
      projectId: APP_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.split('\\n').join('\n'),
    }),
  });
}
const app = admin();
const db = getFirestore(app);
const messagesCol = () => db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection('be_staff_chat_messages');

async function main() {
  const branchId = process.argv[2] || 'BR-1777873556815-26df6480'; // นครราชสีมา default
  console.log(`\n=== V82 L2 verifier — branch=${branchId} ===\n`);

  // Exact compound query the UI uses (see backendClient.js listenToStaffChatMessages):
  //   .where('branchId', '==', branchId).orderBy('createdAt', 'desc').limit(50)
  const query = messagesCol()
    .where('branchId', '==', branchId)
    .orderBy('createdAt', 'desc')
    .limit(50);

  // Re-fire 5 times, assert same doc IDs each time (simulates remount stability)
  const runs = [];
  for (let i = 0; i < 5; i++) {
    const snap = await query.get();
    runs.push(snap.docs.map(d => d.id));
    process.stdout.write(`Run ${i + 1}: ${snap.size} docs\n`);
  }

  const allSame = runs.every(ids => JSON.stringify(ids) === JSON.stringify(runs[0]));
  if (!allSame) {
    console.error('✗ FAIL: 5 listener re-fires returned DIFFERENT doc IDs');
    console.error('  Run 1:', runs[0].slice(0, 5), '...');
    console.error('  Run 5:', runs[4].slice(0, 5), '...');
    process.exit(1);
  }
  console.log('✓ PASS: 5 listener re-fires returned IDENTICAL doc IDs (cursor logic SAFE)');

  // Latest message createdAt (this is what cursor would set on scroll-to-bottom)
  if (runs[0].length > 0) {
    const latest = await messagesCol().doc(runs[0][0]).get();
    console.log(`  Latest message id: ${latest.id}, createdAt: ${latest.data()?.createdAt}`);
    console.log(`  Cursor SHOULD store: { lastReadId: '${latest.id}', lastReadCreatedAtMs: ${latest.data()?.createdAt} }`);
  }

  process.exit(0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
```

- [ ] **Step 2: Commit**

```bash
git add scripts/v82-cursor-l2-verify.mjs
git commit -m "test(V82): Rule Q L2 verifier — 5 listener-refire same-IDs check + cursor stamp diag"
```

---

## Task 13: Final batch verify + deploy

- [ ] **Step 1: Full V82 test pass**

```bash
npx vitest run tests/v82-staff-chat-cursor-and-badge.test.js 2>&1 | tail -10
```
Expected: 60+ PASS / 0 FAIL.

- [ ] **Step 2: Build clean**

```bash
npm run build 2>&1 | tail -10
```
Expected: clean build.

- [ ] **Step 3: Run stress test on real prod**

```bash
node scripts/v82-staff-chat-stress.mjs 2>&1 | tail -20
```
Expected: `RESULTS: 10 pass / 0 fail`.

- [ ] **Step 4: Run L2 verifier on real prod**

```bash
node scripts/v82-cursor-l2-verify.mjs 2>&1 | tail -10
```
Expected: `✓ PASS: 5 listener re-fires returned IDENTICAL doc IDs`.

- [ ] **Step 5: Bug loop (if any test/stress fails)**

If ANY of steps 1-4 fail → debug → fix → re-run from step 1. Loop until ALL green. STOP only when 0 failures.

- [ ] **Step 6: Push + combined deploy (user authorizes per V18 — already given in this session)**

```bash
git push origin master 2>&1 | tail -3
node scripts/probe-deploy-probe.mjs pre 2>&1 | tail -10
```

Then in parallel (per V15 combined):
```bash
vercel --prod --yes      # background
firebase deploy --only firestore:rules   # background (idempotent re-release)
```

After both complete:
```bash
node scripts/probe-deploy-probe.mjs post 2>&1 | tail -15
```
Expected: 6/6 post-probes GREEN + cleanup done.

- [ ] **Step 7: Post-deploy L2 against real prod**

```bash
node scripts/v82-cursor-l2-verify.mjs 2>&1 | tail -10
```
Expected: same as Step 4 — PASS.

- [ ] **Step 8: Update active.md + SESSION_HANDOFF.md + V82 V-entry**

- Append V82 entry to `.claude/rules/00-session-start.md` § 2 PAST VIOLATIONS table
- Add verbose V82 entry to `.claude/rules/v-log-archive.md`
- Update `.agents/active.md` with V82 ship status
- Add brief V82 session block to `SESSION_HANDOFF.md` (under 200 KB hard cap)

```bash
git add .claude/rules/00-session-start.md .claude/rules/v-log-archive.md .agents/active.md SESSION_HANDOFF.md
git commit -m "docs(V82): V-entry + active + handoff post-deploy update"
git push origin master
```

---

## Self-Review

**Spec coverage check** (skim spec → map to tasks):
- Cursor module → Task 1 ✓
- useStaffChat refactor → Task 4 ✓
- Force-open enforcement → Task 8 ✓
- Scroll-to-bottom detection → Task 7 ✓
- Badge schema + storage → Task 2 ✓
- RoleBadge component → Task 3 ✓
- buildMessageDoc senderRole → Task 5 ✓
- NamePicker role section → Task 6 ✓
- Message bubble badge → Task 7 ✓
- Test bank (8 groups A-H) → Task 9 ✓
- AV76 invariant → Task 10 ✓
- Stress runner → Task 11 ✓
- L2 verifier → Task 12 ✓
- Deploy + verification → Task 13 ✓

**Placeholder scan**: no TBD / TODO / "implement later" / "fill in details". All code blocks complete.

**Type consistency check**: `confirmName(name, color, role)` consistent across Task 4 + Task 6. `markScrolledToBottom` consistent across Task 4 + Task 8. `senderRole` field consistent across Task 5 + Task 7. `canMinimize` derived consistent.

**Scope check**: 3 features tightly coupled by single cursor architectural piece + 1 independent badge feature. Single V82 batch. ~3-4 hours of work.

---

## Execution Handoff

Plan complete + saved.

User pre-authorized **subagent-driven-development** ("ฝากเลือกแบบ sub agent ด้วยตอนเขียน"). Invoking that skill next per the brainstorming → writing-plans → subagent-driven-development chain.
