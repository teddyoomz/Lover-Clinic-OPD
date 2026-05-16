// src/components/staffchat/StaffChatWidget.jsx
// V73 (2026-05-16) — Root staff chat widget. Mounts globally; self-gates on
// user + selectedBranchId + !needsPublicAuth.
// V73 Feature C (2026-05-16) — Wires reply state from useStaffChat to MessageList + Composer.
// V73 Feature F (2026-05-16) — Passes uploadImage from useStaffChat to Composer for paste/drag uploads.
// V73 L1 fix (2026-05-18, AV51) — Widget self-resolves branchName from
// useSelectedBranch.branches (Bug A from L1: App.jsx never passed branchName
// prop → header rendered "—"). Also surfaces hook error to UI banner (Bug D
// silent-listener-error → V66-class trust collapse).
import React from 'react';
import { useStaffChat } from '../../hooks/useStaffChat.js';
import { useSelectedBranch } from '../../lib/BranchContext.jsx';
import { StaffChatBubble } from './StaffChatBubble.jsx';
import { StaffChatPanel } from './StaffChatPanel.jsx';
import { StaffChatMessageList } from './StaffChatMessageList.jsx';
import { StaffChatComposer } from './StaffChatComposer.jsx';
import { StaffChatNamePicker } from './StaffChatNamePicker.jsx';

export function StaffChatWidget({ user, needsPublicAuth, branchName: propBranchName }) {
  const { branchId: selectedBranchId, branches } = useSelectedBranch();
  const chat = useStaffChat();

  if (!user || !selectedBranchId || needsPublicAuth) return null;

  // V73 L1 fix Bug A — resolve branch name from context (caller may not
  // pass branchName prop; App.jsx historically didn't, causing widget header
  // to render "—" instead of the actual branch name).
  // Defensive: `branches` may be undefined in test mocks; default to [].
  const resolvedBranchName =
    (typeof propBranchName === 'string' && propBranchName.trim()) ||
    (Array.isArray(branches) ? branches.find(b => b.id === selectedBranchId)?.name : '') ||
    '';

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
        <StaffChatPanel
          branchName={resolvedBranchName}
          onMinimize={chat.minimize}
          onEditName={chat.openNameEdit}
          displayName={chat.displayName}
          error={chat.error}
          loading={chat.loading}
        >
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
          onCancel={chat.nameEditMode ? chat.closeNameEdit : (() => chat.setNamePickerOpen(false))}
          initialValue={chat.nameEditMode ? chat.displayName : ''}
        />
      )}
    </>
  );
}

export default StaffChatWidget;
