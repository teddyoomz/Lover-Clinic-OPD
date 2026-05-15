// src/components/staffchat/StaffChatWidget.jsx
// V73 (2026-05-16) — Root staff chat widget. Mounts globally; self-gates on
// user + selectedBranchId + !needsPublicAuth.
// V73 Feature C (2026-05-16) — Wires reply state from useStaffChat to MessageList + Composer.
// V73 Feature F (2026-05-16) — Passes uploadImage from useStaffChat to Composer for paste/drag uploads.
import React from 'react';
import { useStaffChat } from '../../hooks/useStaffChat.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import { StaffChatBubble } from './StaffChatBubble.jsx';
import { StaffChatPanel } from './StaffChatPanel.jsx';
import { StaffChatMessageList } from './StaffChatMessageList.jsx';
import { StaffChatComposer } from './StaffChatComposer.jsx';
import { StaffChatNamePicker } from './StaffChatNamePicker.jsx';

export function StaffChatWidget({ user, needsPublicAuth, branchName }) {
  const { branchId: selectedBranchId } = useSelectedBranch();
  const chat = useStaffChat();

  if (!user || !selectedBranchId || needsPublicAuth) return null;

  // V73 Feature C — Reply handler: stashes a slim snapshot of the target message
  // into replyingTo state. Composer reads + clears it on send.
  const handleReply = (msg) => {
    chat.setReplyingTo({
      msgId: msg.id,
      snippet: (msg.text || '').slice(0, 80),
      displayName: msg.displayName,
      deviceId: msg.deviceId,
    });
  };

  return (
    <>
      {chat.minimized ? (
        <StaffChatBubble unreadCount={chat.unreadCount} onClick={chat.expand} />
      ) : (
        <StaffChatPanel branchName={branchName} onMinimize={chat.minimize}>
          <StaffChatMessageList messages={chat.messages} ownDeviceId={chat.deviceId} onReply={handleReply} />
          <StaffChatComposer
            onSend={chat.send}
            recentMentionCandidates={chat.recentMentionCandidates}
            replyingTo={chat.replyingTo}
            onClearReply={() => chat.setReplyingTo?.(null)}
            onUploadImage={chat.uploadImage}
          />
        </StaffChatPanel>
      )}
      {chat.namePickerOpen && (
        <StaffChatNamePicker
          onConfirm={chat.confirmName}
          onCancel={() => chat.setNamePickerOpen(false)}
        />
      )}
    </>
  );
}

export default StaffChatWidget;
