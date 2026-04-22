// Pure helpers for chat notification counting + alert triggers.
// Extracted so ChatPanel, useChatUnread, and AdminDashboard all share one
// source of truth — see `.claude/skills/audit-chat-notifications` for the
// invariants that enforce this.

export function countUnreadPeople(conversations) {
  let line = 0;
  let facebook = 0;
  for (const conv of conversations || []) {
    const count = Number(conv?.unreadCount) || 0;
    if (count <= 0) continue;
    if (conv.platform === 'line') line += 1;
    else if (conv.platform === 'facebook') facebook += 1;
  }
  return {
    lineUnread: line,
    fbUnread: facebook,
    totalUnread: line + facebook,
  };
}

export function shouldRingChatAlert({
  chatUnread,
  prevUnread,
  isChatActive,
  isPlaying,
}) {
  if (!isChatActive) return false;
  if (isPlaying) return false;
  const curr = Number(chatUnread) || 0;
  const prev = Number(prevUnread) || 0;
  return curr > 0 && prev === 0;
}

export function shouldRingChatInterval({
  chatUnread,
  isChatActive,
  isPlaying,
}) {
  if (!isChatActive) return false;
  if (isPlaying) return false;
  const curr = Number(chatUnread) || 0;
  return curr > 0;
}
