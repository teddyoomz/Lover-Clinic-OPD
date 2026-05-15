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
// V73 Feature B (2026-05-16):
//   - Compute `recentMentionCandidates` (de-duped recent display names, excl. self)
//     for the composer @ dropdown.
//   - On incoming message whose `mentions` array includes the local display name:
//     play mention sound (respects mute) + auto-expand the panel.
//   - Default incoming non-own message: play default sound + bump unread.
//
// Extras parameter on send() is forward-compat for upcoming features:
//   - mentions (T11 / feature B)
//   - replyTo (T12 / feature C)
//   - attachmentUrl/Size/MimeType (T15 / feature F)
// They simply flow through to buildMessageDoc.
//
// Non-React callers should compose their own pipeline using addStaffChatMessage
// directly; this hook is the React surface only.

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
// V73 Feature F (T15) — uploadAttachment lets the composer upload a resized
// image blob to Storage and inject the attachment metadata into the next
// send() call via extras.
import { uploadAttachment } from '../lib/staffChatImageResize.js';

export function useStaffChat() {
  const { branchId: selectedBranchId } = useSelectedBranch();
  const [messages, setMessages] = useState([]);
  const [minimized, setMinimized] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const [namePickerOpen, setNamePickerOpen] = useState(false);
  const [pendingSendPayload, setPendingSendPayload] = useState(null);
  const [error, setError] = useState(null);
  // V73 Feature C (T12) — Reply-to-message: stash the message being replied to
  // so the composer can render a quote strip and the next send() includes replyTo.
  const [replyingTo, setReplyingTo] = useState(null);

  // Mint deviceId once per hook instance (getDeviceId itself is localStorage
  // backed, so the same value persists across mounts/sessions per device).
  const deviceId = useRef(getDeviceId()).current;
  // Track which message IDs we've already counted so a Firestore snapshot
  // re-fire (V14-class) can't double-bump the unread counter.
  const lastSeenIdsRef = useRef(new Set());

  // V73 Feature B — Audio refs for default + mention sounds.
  // Audio file paths land in T17; .catch(() => {}) swallows 404 until then.
  const defaultSoundRef = useRef(
    typeof Audio !== 'undefined' ? new Audio('/sounds/staff-chat-notif.mp3') : null
  );
  const mentionSoundRef = useRef(
    typeof Audio !== 'undefined' ? new Audio('/sounds/staff-chat-mention.mp3') : null
  );

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
          if (m.deviceId === deviceId) continue;
          // V73 Feature B — Personal mention dispatch.
          const myName = getDisplayName();
          const isMention = myName && Array.isArray(m.mentions) && m.mentions.includes(myName);
          if (isMention) {
            // Mention: play mention sound (respects mute), auto-expand panel.
            if (!getMuted() && mentionSoundRef.current) {
              try {
                mentionSoundRef.current.volume = 0.6;
                const p = mentionSoundRef.current.play();
                if (p && typeof p.catch === 'function') p.catch(() => {});
              } catch (_) {
                /* swallow autoplay/load failures */
              }
            }
            setMinimized(false);
          } else {
            // Default: play default sound + bump unread.
            if (!getMuted() && defaultSoundRef.current) {
              try {
                defaultSoundRef.current.volume = 0.5;
                const p = defaultSoundRef.current.play();
                if (p && typeof p.catch === 'function') p.catch(() => {});
              } catch (_) {
                /* swallow autoplay/load failures */
              }
            }
            setUnreadCount(c => c + 1);
          }
        }
      },
      (err) => setError(String(err?.message || err)),
    );
    return () => { unsub?.(); };
  }, [selectedBranchId, deviceId]);

  // V73 Feature B — recentMentionCandidates: de-duped recent display names,
  // excluding self. Walks messages newest-first, caps at 30.
  const recentMentionCandidates = useMemo(() => {
    const myName = getDisplayName();
    const seen = new Set();
    for (let i = messages.length - 1; i >= 0 && seen.size < 30; i--) {
      const n = messages[i]?.displayName;
      if (n && n !== myName) seen.add(n);
    }
    return [...seen];
  }, [messages]);

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

  // V73 Feature F (T15) — upload a resized image blob to staff-chat-attachments/
  // Storage path under the currently-selected branch. Composer awaits this
  // before invoking send() so the message doc carries attachmentUrl/Size/MimeType.
  const uploadImage = useCallback(async (blob) => {
    if (!selectedBranchId) throw new Error('STAFF_CHAT_NO_BRANCH');
    return uploadAttachment(blob, selectedBranchId);
  }, [selectedBranchId]);

  return {
    messages, minimized, unreadCount,
    deviceId, error,
    namePickerOpen, setNamePickerOpen,
    send, confirmName, expand, minimize,
    recentMentionCandidates,
    // V73 Feature C — reply state surface.
    replyingTo, setReplyingTo,
    // V73 Feature F — image upload surface.
    uploadImage,
  };
}
