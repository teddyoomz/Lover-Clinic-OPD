// src/hooks/useStaffChat.js
// V73 Task 4 (2026-05-16) — Subscribe to staff chat messages + manage state + send.
//
// Responsibilities:
//   1. Subscribe to the per-branch staff chat listener and expose `messages`.
//   2. Mint + remember a stable `deviceId` for the lifetime of the hook so
//      unread-counter logic can ignore the device's own outgoing messages.
//   3. Gate `send()` on `getDisplayName()` — if missing, open name picker and
//      stash the pending payload so `confirmName(name)` can retry the send.
//   4. Increment `unreadCount` only when a NEW message arrives whose deviceId
//      differs from this device's id. Reset on `expand()`.
//   5. Clean up the listener subscription on unmount.
//
// Extras parameter on send() is forward-compat for upcoming features:
//   - mentions (T11 / feature B)
//   - replyTo (T12 / feature C)
//   - attachmentUrl/Size/MimeType (T15 / feature F)
// They simply flow through to buildMessageDoc.
//
// Non-React callers should compose their own pipeline using addStaffChatMessage
// directly; this hook is the React surface only.

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
} from '../lib/staffChatIdentity.js';

export function useStaffChat() {
  const { branchId: selectedBranchId } = useSelectedBranch();
  const [messages, setMessages] = useState([]);
  const [minimized, setMinimized] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [namePickerOpen, setNamePickerOpen] = useState(false);
  const [pendingSendPayload, setPendingSendPayload] = useState(null);
  const [error, setError] = useState(null);

  // Mint deviceId once per hook instance (getDeviceId itself is localStorage
  // backed, so the same value persists across mounts/sessions per device).
  const deviceId = useRef(getDeviceId()).current;
  // Track which message IDs we've already counted so a Firestore snapshot
  // re-fire (V14-class) can't double-bump the unread counter.
  const lastSeenIdsRef = useRef(new Set());

  useEffect(() => {
    if (!selectedBranchId) return;
    const unsub = listenToStaffChatMessages(
      { branchId: selectedBranchId, limitCount: 50 },
      (docs) => {
        setMessages(docs);
        // Detect newly-arrived non-own messages.
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

  const send = useCallback((text, extras = {}) => {
    const displayName = getDisplayName();
    if (!displayName) {
      // Sync gating — keep state flushes synchronous (no Promise return) so
      // `act(() => send(...))` flushes before the next assertion. Stash the
      // pending payload for `confirmName()` to retry once a name is picked.
      setPendingSendPayload({ text, ...extras });
      setNamePickerOpen(true);
      return undefined;
    }
    if (!selectedBranchId) return undefined;
    let doc;
    try {
      doc = buildMessageDoc({
        branchId: selectedBranchId,
        displayName,
        deviceId,
        text,
        ...extras,
      });
    } catch (e) {
      setError(String(e?.message || e));
      return undefined;
    }
    return addStaffChatMessage(doc).catch((e) => {
      setError(String(e?.message || e));
    });
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
    setUnreadCount(0); // reset on expand
  }, []);
  const minimize = useCallback(() => setMinimized(true), []);

  return {
    messages, minimized, unreadCount,
    deviceId, error,
    namePickerOpen, setNamePickerOpen,
    send, confirmName, expand, minimize,
  };
}
