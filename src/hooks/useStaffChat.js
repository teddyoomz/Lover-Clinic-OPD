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
  // V73 color-picker (2026-05-18) — per-device sender color helpers
  getColor,
  setColor,
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
  // V73 L1 fix (2026-05-18, AV51) — Loading state for initial listener subscribe.
  // Pre-fix: panel rendered empty immediately, no way to distinguish "no messages
  // yet" from "listener errored" from "listener still subscribing". Bug D root
  // cause was silent error swallowing — surface loading + error to UI.
  const [loading, setLoading] = useState(true);
  // V73 Feature C (T12) — Reply-to-message: stash the message being replied to
  // so the composer can render a quote strip and the next send() includes replyTo.
  const [replyingTo, setReplyingTo] = useState(null);

  // Mint deviceId once per hook instance (getDeviceId itself is localStorage
  // backed, so the same value persists across mounts/sessions per device).
  const deviceId = useRef(getDeviceId()).current;

  // V73 name-edit (2026-05-18) — track current displayName in React state so
  // the header chip + composer NamePicker re-render after edit. localStorage
  // is source of truth; this state is a cache for re-render trigger.
  const [currentDisplayName, setCurrentDisplayName] = useState(() => getDisplayName());
  // V73 color-picker (2026-05-18) — per-device sender color, cached for
  // re-render trigger on edit. localStorage is source of truth.
  const [currentColor, setCurrentColor] = useState(() => getColor());
  // V73 name-edit — controls whether namePickerOpen was triggered by edit
  // (pre-fill current value) vs first-send (empty).
  const [nameEditMode, setNameEditMode] = useState(false);
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
    if (!selectedBranchId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);  // V73 L1 fix — clear prior-branch error on resubscribe
    const unsub = listenToStaffChatMessages(
      { branchId: selectedBranchId, limitCount: 50 },
      (docs) => {
        setLoading(false);
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
      (err) => {
        // V73 L1 fix (Bug D, AV51) — surface listener errors instead of
        // silently swallowing. Pre-fix: PERMISSION_DENIED / index-not-built /
        // branch-mismatch all resulted in empty panel with no diagnostic.
        // Now logs to console AND sets error state which Panel renders as banner.
        // eslint-disable-next-line no-console
        console.warn('[staff-chat] listener error:', err);
        setError(String(err?.message || err));
        setLoading(false);
      },
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
        // V73 color-picker (2026-05-18) — embed current color in outgoing
        // message so receivers render with sender's chosen color.
        senderColor: getColor(),
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

  const confirmName = useCallback(async (name, color) => {
    const { setDisplayName } = await import('../lib/staffChatIdentity.js');
    setDisplayName(name);
    setCurrentDisplayName(name);  // V73 name-edit — refresh header chip + mention candidates
    // V73 color-picker (2026-05-18) — optional color persisted alongside
    // name. Validated by setColor (throws on bad hex; we swallow to keep the
    // name-save flow non-blocking — bad hex stays at previous valid value).
    if (typeof color === 'string') {
      try {
        setColor(color);
        setCurrentColor(color);
      } catch {
        // Invalid hex — keep previous color, do not block name save
      }
    }
    setNamePickerOpen(false);
    setNameEditMode(false);
    if (pendingSendPayload) {
      const payload = pendingSendPayload;
      setPendingSendPayload(null);
      await send(payload.text, payload);
    }
  }, [pendingSendPayload, send]);

  // V73 name-edit (2026-05-18) — open NamePicker in edit mode (pre-fill with
  // current name). Stays separate from the send-gated first-send open path.
  // Re-sync currentDisplayName from localStorage in case it was modified
  // externally (DevTools / cross-tab) between mount and edit-click — the
  // useState init only fires once at mount. V73 color-picker — same re-sync
  // for currentColor.
  const openNameEdit = useCallback(() => {
    const latest = getDisplayName();
    if (latest) setCurrentDisplayName(latest);
    setCurrentColor(getColor());
    setNameEditMode(true);
    setNamePickerOpen(true);
  }, []);

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
    deviceId, error, loading,
    namePickerOpen, setNamePickerOpen,
    send, confirmName, expand, minimize,
    recentMentionCandidates,
    // V73 Feature C — reply state surface.
    replyingTo, setReplyingTo,
    // V73 Feature F — image upload surface.
    uploadImage,
    // V73 name-edit (2026-05-18) — surface for header chip + NamePicker pre-fill.
    displayName: currentDisplayName,
    nameEditMode,
    openNameEdit,
    closeNameEdit: () => { setNameEditMode(false); setNamePickerOpen(false); },
    // V73 color-picker (2026-05-18) — current sender hex color (for NamePicker pre-fill).
    color: currentColor,
  };
}
