// src/components/staffchat/StaffChatWidget.jsx
// V73 (2026-05-16) — Root staff chat widget. Mounts globally; self-gates on
// user + selectedBranchId + !needsPublicAuth.
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

  return (
    <>
      {chat.minimized ? (
        <StaffChatBubble unreadCount={chat.unreadCount} onClick={chat.expand} />
      ) : (
        <StaffChatPanel branchName={branchName} onMinimize={chat.minimize}>
          <StaffChatMessageList messages={chat.messages} ownDeviceId={chat.deviceId} />
          <StaffChatComposer onSend={chat.send} recentMentionCandidates={chat.recentMentionCandidates} />
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
