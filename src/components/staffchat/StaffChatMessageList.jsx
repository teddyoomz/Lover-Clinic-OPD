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
