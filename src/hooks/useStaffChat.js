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
import { buildMessageDoc, newStaffChatMessageId } from '../lib/staffChatClient.js';
import {
  getDisplayName,
  getDeviceId,
  getMuted,
  // V73 color-picker (2026-05-18) — per-device sender color helpers
  getColor,
  setColor,
  // V82 (2026-05-17) — Per-device role helpers (extended import).
  getRole,
  setRole,
} from '../lib/staffChatIdentity.js';
// V82 (2026-05-17) — Persistent read cursor (per-(device, branch) localStorage)
// closes Bug #2 (in-memory dedup lost on every remount). Cursor survives tab
// switches / Frontend↔Backend toggles / browser reloads. AV76 codified.
import {
  getCursor,
  setCursor,
  isMessageUnread,
  initCursorIfMissing,
} from '../lib/staffChatReadCursor.js';
// V73 Feature F (T15) — uploadAttachment lets the composer upload a resized
// image blob to Storage and inject the attachment metadata into the next
// send() call via extras.
// (2026-05-22) Any-file: uploadStaffChatFile (any type ≤1GB; thumb+original for
// images, original-only for files) + STAFF_CHAT_MAX_ATTACHMENTS for the
// multi-pick composer.
import {
  uploadAttachment,
  uploadStaffChatFile,
  STAFF_CHAT_MAX_ATTACHMENTS,
} from '../lib/staffChatImageResize.js';

export function useStaffChat() {
  const { branchId: selectedBranchId } = useSelectedBranch();
  const [messages, setMessages] = useState([]);
  const [minimized, setMinimized] = useState(true);
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
  // V82 (2026-05-17) — Per-mount sound dedup only. Prevents the same message
  // from triggering the notification sound twice within a single listener
  // lifecycle (e.g. Firestore snapshot re-fires for serverTimestamp resolve).
  // Resets on every useEffect resubscribe (branch switch / remount). Unlike
  // the V73-pre in-memory dedup ref, this ref does NOT drive unread-badge
  // state — that comes from the persistent cursor via isMessageUnread.
  const emittedForRef = useRef(new Set());
  // V82 (2026-05-17) — Persistent cursor in React state (cache for re-render
  // trigger). localStorage is source of truth; this state mirrors getCursor
  // and updates via setCursorState whenever the cursor advances.
  const [cursor, setCursorState] = useState(() => getCursor(selectedBranchId));
  // V82 (2026-05-17) — Per-device role, cached for re-render trigger on edit.
  // localStorage is source of truth.
  const [currentRole, setCurrentRoleState] = useState(() => getRole());

  // V73 Feature B — Audio refs for default + mention sounds.
  // Audio file paths land in T17; .catch(() => {}) swallows 404 until then.
  const defaultSoundRef = useRef(
    typeof Audio !== 'undefined' ? new Audio('/sounds/staff-chat-notif.mp3') : null
  );
  const mentionSoundRef = useRef(
    typeof Audio !== 'undefined' ? new Audio('/sounds/staff-chat-mention.mp3') : null
  );

  // V82 (2026-05-17) — Persistent unread count derived from cursor.
  // Replaces V73-pre `useState(0)` counter that lived in memory and was
  // bumped/reset by listener side effects. Now: every message whose
  // createdAt > cursor.lastReadCreatedAtMs AND deviceId !== self counts as
  // unread. Survives remount because cursor is in localStorage.
  const unreadCount = useMemo(
    () => messages.filter(m => isMessageUnread(m, cursor, deviceId)).length,
    [messages, cursor, deviceId],
  );

  useEffect(() => {
    if (!selectedBranchId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);  // V73 L1 fix — clear prior-branch error on resubscribe
    // V82 (2026-05-17) — Reset per-mount sound-dedup set on every
    // resubscribe. Pre-V82 the in-memory dedup ref accumulated forever
    // across the hook lifetime; V82 narrows scope to a single listener
    // subscription because unread state now lives in the persistent cursor.
    emittedForRef.current = new Set();
    const unsub = listenToStaffChatMessages(
      { branchId: selectedBranchId, limitCount: 50 },
      (docs) => {
        setLoading(false);
        setMessages(docs);
        // V82 (2026-05-17) — Hydrate persistent cursor on first snapshot.
        // initCursorIfMissing seeds with the latest message's createdAt so
        // the entire backlog reads as "read" on first-ever load (no
        // 50-message badge spam). Idempotent on subsequent snapshots.
        // V82 bug-fix (post-T9 vitest red, 2026-05-17) — handle both raw number
        // and Firestore Timestamp `{toMillis()}` shape. Mirrors the cursor
        // module's isMessageUnread fix; real prod messages arrive as Timestamp.
        const latest = docs.length > 0 ? docs[docs.length - 1] : null;
        let seedMs = Date.now();
        if (latest) {
          const rawCa = latest.createdAt;
          if (typeof rawCa === 'number' && Number.isFinite(rawCa)) {
            seedMs = rawCa;
          } else if (rawCa && typeof rawCa.toMillis === 'function') {
            try { seedMs = rawCa.toMillis(); } catch { /* swallow → keep Date.now() */ }
          }
        }
        initCursorIfMissing(selectedBranchId, seedMs);
        const liveCursor = getCursor(selectedBranchId);
        setCursorState(liveCursor);
        // V82 (2026-05-17) — Compute truly-new (vs persistent cursor) and
        // route to sound + force-open. emittedForRef dedups so a snapshot
        // re-fire within the same subscription doesn't double-play.
        const trulyNew = docs.filter(m => isMessageUnread(m, liveCursor, deviceId));
        for (const m of trulyNew) {
          if (emittedForRef.current.has(m.id)) continue;
          emittedForRef.current.add(m.id);
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
            // V82 (2026-05-17) — Default non-mention: play default sound +
            // force-open panel (auto-expand). Pre-V82 only bumped unread;
            // V82 spec says non-mentions also auto-expand so admin sees the
            // new chat without manual click. unreadCount is now derived
            // from cursor so no setUnreadCount call needed.
            if (!getMuted() && defaultSoundRef.current) {
              try {
                defaultSoundRef.current.volume = 0.5;
                const p = defaultSoundRef.current.play();
                if (p && typeof p.catch === 'function') p.catch(() => {});
              } catch (_) {
                /* swallow autoplay/load failures */
              }
            }
            setMinimized(false);
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
        // V82 (2026-05-17) — Embed current role in outgoing message so
        // receivers render the Thai role badge next to the sender's name.
        senderRole: getRole(),
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

  const confirmName = useCallback(async (name, color, role) => {
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
    // V82 (2026-05-17) — Optional role persisted alongside name + color.
    // setRole accepts null/''/undefined to clear the role; non-null values
    // are validated against ROLE_KEYS (throws on invalid). Swallow per spec
    // so bad role doesn't block name save (previous valid role retained).
    try {
      setRole(role);
      setCurrentRoleState(role);
    } catch {
      // Invalid role — keep previous role, do not block name save
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
    // V82 (2026-05-17) — Re-sync role from localStorage (parallel to color)
    // so the NamePicker dialog pre-fills with the persisted role even if it
    // was modified externally (DevTools / cross-tab) between mount and edit.
    setCurrentRoleState(getRole());
    setNameEditMode(true);
    setNamePickerOpen(true);
  }, []);

  // V82 (2026-05-17) — expand no longer resets unread; that's the cursor's
  // job (advances via markScrolledToBottom when user scrolls to the bottom
  // of the message list). Just un-minimize.
  const expand = useCallback(() => {
    setMinimized(false);
  }, []);
  const minimize = useCallback(() => setMinimized(true), []);

  // V82 (2026-05-17) — Advance the persistent cursor to the latest message
  // when the user scrolls to the bottom of the chat list. ChatPanel calls
  // this from its IntersectionObserver / scroll handler on the last bubble.
  // Effect: unreadCount drops to 0 (derived via isMessageUnread) AND
  // persists across remounts (Bug #2 closure).
  const markScrolledToBottom = useCallback(() => {
    if (!selectedBranchId) return;
    if (!messages || messages.length === 0) return;
    const latest = messages[messages.length - 1];
    if (!latest) return;
    // V82 bug-fix (post-T9 vitest red, 2026-05-17) — dual-shape support; real
    // prod messages arrive as Firestore Timestamp {toMillis()}, not raw number.
    let latestMs = Date.now();
    if (typeof latest.createdAt === 'number' && Number.isFinite(latest.createdAt)) {
      latestMs = latest.createdAt;
    } else if (latest.createdAt && typeof latest.createdAt.toMillis === 'function') {
      try { latestMs = latest.createdAt.toMillis(); } catch { /* keep Date.now() */ }
    }
    setCursor(selectedBranchId, {
      lastReadId: String(latest.id || ''),
      lastReadCreatedAtMs: latestMs,
      updatedAt: Date.now(),
    });
    setCursorState(getCursor(selectedBranchId));
  }, [selectedBranchId, messages]);

  // V82 (2026-05-17) — canMinimize gates the minimize button so unread
  // messages stay visible (force-open contract). Header minimize button
  // disables when unreadCount > 0; user must scroll to clear before
  // collapsing again.
  const canMinimize = unreadCount === 0;

  // V73 Feature F (T15) — upload a resized image blob to staff-chat-attachments/
  // Storage path under the currently-selected branch. Composer awaits this
  // before invoking send() so the message doc carries attachmentUrl/Size/MimeType.
  const uploadImage = useCallback(async (blob) => {
    if (!selectedBranchId) throw new Error('STAFF_CHAT_NO_BRANCH');
    return uploadAttachment(blob, selectedBranchId);
  }, [selectedBranchId]);

  // (2026-05-22) Any-file upload pipeline. Mints the messageId ONCE so all
  // attachments land under staff-chat-attachments/{branchId}/{messageId}/
  // (per-message folder → retention prefix-sweep deletes them cleanly).
  // Uploads sequentially (bounds memory for big files). Each file is uploaded
  // via uploadStaffChatFile (any type ≤1GB; image kind also gets a thumbnail).
  // registerTask(i, task) exposes each resumable task so the composer can
  // task.cancel() (Q3); cancelRef carries indices the user cancelled before
  // their turn. A cancelled file is skipped; a real (non-cancel) failure is
  // collected in `failed[]` so the composer can offer retry. Returns
  // { messageId, attachments, failed } — composer sends { id, attachments }.
  const prepareAndUpload = useCallback(async (files, onItemProgress, registerTask, cancelRef) => {
    if (!selectedBranchId) throw new Error('STAFF_CHAT_NO_BRANCH');
    const list = Array.from(files || []).slice(0, STAFF_CHAT_MAX_ATTACHMENTS);
    const messageId = newStaffChatMessageId();
    const attachments = [];
    const failed = [];
    for (let i = 0; i < list.length; i++) {
      // ✕ tapped before this file's turn → skip
      if (cancelRef && cancelRef.current && cancelRef.current.has(i)) continue;
      try {
        const att = await uploadStaffChatFile({
          file: list[i],
          branchId: selectedBranchId,
          messageId,
          onProgress: (frac) => { if (onItemProgress) onItemProgress(i, frac); },
          registerTask: (task) => { if (registerTask) registerTask(i, task); },
        });
        attachments.push(att);
        if (onItemProgress) onItemProgress(i, 1);
      } catch (e) {
        if (String(e?.message) === 'STAFF_CHAT_UPLOAD_CANCELLED') continue;  // ✕ mid-upload → skip
        failed.push({ index: i, name: list[i]?.name || '', message: String(e?.message || e) });
      }
    }
    return { messageId, attachments, failed };
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
    // (2026-05-22) multi-image upload surface (mints messageId + uploads thumb+original).
    prepareAndUpload,
    // V73 name-edit (2026-05-18) — surface for header chip + NamePicker pre-fill.
    displayName: currentDisplayName,
    nameEditMode,
    openNameEdit,
    closeNameEdit: () => { setNameEditMode(false); setNamePickerOpen(false); },
    // V73 color-picker (2026-05-18) — current sender hex color (for NamePicker pre-fill).
    color: currentColor,
    // V82 (2026-05-17) — persistent cursor surface.
    //   canMinimize: false while unreadCount > 0 (force-open contract).
    //   markScrolledToBottom: ChatPanel calls when user reaches latest msg.
    //   role: current persisted role (for NamePicker pre-fill + UI badge).
    canMinimize,
    markScrolledToBottom,
    role: currentRole,
  };
}
