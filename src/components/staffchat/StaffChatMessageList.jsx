// src/components/staffchat/StaffChatMessageList.jsx
// V73 (2026-05-16) — Scrollable list of messages, auto-scroll to bottom on new msg.
// V73 Feature C (2026-05-16) — Forwards onReply to each message so hover Reply button fires.
// V82 (2026-05-17) — Bottom sentinel + IntersectionObserver fires onScrolledToBottom
//   when the user reaches the latest message. ChatPanel wires this to
//   useStaffChat.markScrolledToBottom → advances the persistent read cursor.
// (2026-05-26) Feature 1 — day separators: messages grouped by Bangkok-local day
//   (groupMessagesByDay) with a centered pill divider between groups. Feature 3 —
//   forwards onDelete so each own message can show the 🗑 unsend affordance.
import React, { useEffect, useRef } from 'react';
import { StaffChatMessage } from './StaffChatMessage.jsx';
import { groupMessagesByDay } from '../../lib/staffChatDayGroups.js';

export function StaffChatMessageList({ messages, ownDeviceId, onReply, onDelete, onScrolledToBottom }) {
  const endRef = useRef(null);
  const bottomSentinelRef = useRef(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length]);

  // V82 (2026-05-17) — IntersectionObserver on the bottom sentinel. Fires
  // onScrolledToBottom() when the sentinel becomes visible in the scroll
  // viewport (>= 50% intersection). Observer recreated on prop change so the
  // callback identity is honored; disconnect on unmount or prop swap.
  useEffect(() => {
    if (typeof onScrolledToBottom !== 'function') return undefined;
    if (typeof IntersectionObserver === 'undefined') return undefined;
    const node = bottomSentinelRef.current;
    if (!node) return undefined;
    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            try {
              onScrolledToBottom();
            } catch {
              // swallow — cursor write failures must not crash the list
            }
            return;
          }
        }
      },
      { threshold: 0.5 }
    );
    obs.observe(node);
    return () => {
      obs.disconnect();
    };
  }, [onScrolledToBottom, messages.length]);

  if (messages.length === 0) {
    return (
      <div data-testid="staff-chat-empty" className="flex-1 flex items-center justify-center text-[var(--tx-muted)] text-sm p-4">
        ยังไม่มีข้อความ — เริ่มแชทกับเพื่อนร่วมงานได้เลย
      </div>
    );
  }

  return (
    <div
      data-testid="staff-chat-message-list"
      className="flex-1 overflow-y-auto overscroll-contain px-3 py-2 space-y-2"
      style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
    >
      {/* (2026-05-26) Feature 1 — day-grouped render. Pill divider per day group;
          messages stay chronological within each group. */}
      {groupMessagesByDay(messages).map(group => (
        <React.Fragment key={group.dayKey}>
          {group.label && (
            <div className="flex justify-center my-2" data-testid="staff-chat-day-divider">
              <span className="text-[11px] text-[var(--tx-muted)] bg-black/30 px-3 py-0.5 rounded-full">
                {group.label}
              </span>
            </div>
          )}
          {group.items.map(m => (
            <StaffChatMessage
              key={m.id}
              message={m}
              isOwn={m.deviceId === ownDeviceId}
              onReply={onReply}
              onDelete={onDelete}
            />
          ))}
        </React.Fragment>
      ))}
      <div ref={endRef} />
      {/* V82 (2026-05-17) — bottom sentinel watched by IntersectionObserver
          to fire onScrolledToBottom when the user reaches the latest message. */}
      <div ref={bottomSentinelRef} data-testid="staff-chat-bottom-sentinel" style={{ height: '1px' }} />
    </div>
  );
}

export default StaffChatMessageList;
