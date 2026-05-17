// tests/v73-staff-chat-source-grep.test.js
// V73 (2026-05-16) — Source-grep regression locks for StaffChatWidget mount + V73 invariants.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const APP = readFileSync('src/App.jsx', 'utf-8');
const FILES = {
  identity: readFileSync('src/lib/staffChatIdentity.js', 'utf-8'),
  client: readFileSync('src/lib/staffChatClient.js', 'utf-8'),
  hook: readFileSync('src/hooks/useStaffChat.js', 'utf-8'),
  // V82 fix-up — V82 (2026-05-17) extracted the own-device unread-skip logic
  // from useStaffChat.js into staffChatReadCursor.js as `isMessageUnread(message, cursor, selfDeviceId)`.
  // SG5.1 now grep the new canonical home (file added below).
  readCursor: readFileSync('src/lib/staffChatReadCursor.js', 'utf-8'),
  message: readFileSync('src/components/staffchat/StaffChatMessage.jsx', 'utf-8'),
  messageBody: readFileSync('src/components/staffchat/StaffChatMessageBody.jsx', 'utf-8'),
  composer: readFileSync('src/components/staffchat/StaffChatComposer.jsx', 'utf-8'),
  widget: readFileSync('src/components/staffchat/StaffChatWidget.jsx', 'utf-8'),
  mentionDropdown: readFileSync('src/components/staffchat/StaffChatMentionDropdown.jsx', 'utf-8'),
};

describe('V73.SG1 StaffChatWidget mount source-grep', () => {
  it('SG1.1 App.jsx imports StaffChatWidget (lazy)', () => {
    expect(APP).toMatch(/StaffChatWidget.*lazy\(/);
  });

  it('SG1.2 widget rendered with user + needsPublicAuth props', () => {
    expect(APP).toMatch(/<StaffChatWidget[\s\S]{0,200}user=\{user\}/);
    expect(APP).toMatch(/<StaffChatWidget[\s\S]{0,200}needsPublicAuth=\{needsPublicAuth\}/);
  });

  it('SG1.3 widget wrapped in Suspense (lazy fallback)', () => {
    expect(APP).toMatch(/Suspense[\s\S]{0,200}<StaffChatWidget|<StaffChatWidget[\s\S]{0,400}<\/Suspense>/);
  });
});

describe('V73.SG2 Rule C2 crypto-secure id discipline', () => {
  // Strip comments before grepping for Math.random — comments may legitimately
  // reference "Math.random" in their explanation of the Rule C2 mandate without
  // actually invoking it.
  const stripComments = (src) => src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');

  it('SG2.1 staffChatIdentity uses crypto.getRandomValues (NOT Math.random invocation)', () => {
    expect(FILES.identity).toMatch(/crypto\.getRandomValues/);
    expect(stripComments(FILES.identity)).not.toMatch(/Math\.random\s*\(/);
  });

  it('SG2.2 staffChatClient buildMessageDoc uses crypto.getRandomValues for id', () => {
    expect(FILES.client).toMatch(/crypto\.getRandomValues/);
    expect(stripComments(FILES.client)).not.toMatch(/Math\.random\s*\(/);
  });
});

describe('V73.SG3 BSA Rule L — scopedDataLayer indirection', () => {
  it('SG3.1 useStaffChat hook imports from scopedDataLayer (not raw backendClient)', () => {
    expect(FILES.hook).toMatch(/from\s+['"][^'"]*scopedDataLayer/);
    expect(FILES.hook).not.toMatch(/from\s+['"][^'"]*backendClient/);
  });

  it('SG3.2 useStaffChat imports listenToStaffChatMessages + addStaffChatMessage', () => {
    expect(FILES.hook).toMatch(/listenToStaffChatMessages/);
    expect(FILES.hook).toMatch(/addStaffChatMessage/);
  });
});

describe('V73.SG4 MessageBody parser discipline (no raw {message.text})', () => {
  it('SG4.1 StaffChatMessage renders via StaffChatMessageBody (not raw text)', () => {
    expect(FILES.message).toMatch(/StaffChatMessageBody/);
    // Locate the bubble body — it must NOT contain a raw `{message.text}` render.
    // Match the bubble's `className=...` wrapper and ensure its INNER content
    // uses MessageBody rather than `{message.text}`.
    expect(FILES.message).toMatch(/<StaffChatMessageBody\s+text=\{message\.text\}/);
  });

  it('SG4.2 MessageBody uses parseMessageBody helper from staffChatClient', () => {
    expect(FILES.messageBody).toMatch(/parseMessageBody/);
    expect(FILES.messageBody).toMatch(/from\s+['"][^'"]*staffChatClient/);
  });

  it('SG4.3 MessageBody routes mention segments to StaffChatMentionChip', () => {
    expect(FILES.messageBody).toMatch(/StaffChatMentionChip/);
  });
});

describe('V73.SG5 Mention notification dispatch — own-device filter', () => {
  it('SG5.1 own-device skip logic exists (V82: extracted to isMessageUnread)', () => {
    // V82 fix-up — pre-V82 asserted `m.deviceId === deviceId` in useStaffChat.js
    // dispatch loop. V82 (2026-05-17) extracted the own-device skip logic into
    // `isMessageUnread(message, cursor, selfDeviceId)` in src/lib/staffChatReadCursor.js,
    // and the dispatch loop now consumes it via `isMessageUnread(m, liveCursor, deviceId)`.
    // The cursor module owns the `message.deviceId === selfDeviceId` predicate.
    // Assertion adapted to the new canonical location.
    expect(FILES.readCursor).toMatch(/message\.deviceId\s*===\s*selfDeviceId/);
    // Defense-in-depth: hook still consumes isMessageUnread with deviceId arg
    expect(FILES.hook).toMatch(/isMessageUnread\s*\(\s*m\s*,\s*liveCursor\s*,\s*deviceId\s*\)/);
  });

  it('SG5.2 Mention path checks mentions.includes(displayName)', () => {
    expect(FILES.hook).toMatch(/mentions[\s\S]{0,40}includes/);
  });

  it('SG5.3 Mute toggle respected for both default + mention sound (does NOT bypass)', () => {
    expect(FILES.hook).toMatch(/getMuted\(\)/);
  });
});

describe('V73.SG6 Composer @ trigger detection', () => {
  it('SG6.1 Composer uses extractMentions on submit', () => {
    expect(FILES.composer).toMatch(/extractMentions/);
  });

  it('SG6.2 Composer detects @ trigger via regex against text-before-cursor', () => {
    expect(FILES.composer).toMatch(/@\(\[\^\\s@\]/);
  });

  it('SG6.3 Composer renders StaffChatMentionDropdown when trigger active', () => {
    expect(FILES.composer).toMatch(/StaffChatMentionDropdown/);
  });
});

describe('V73.SG7 Widget visibility gate', () => {
  it('SG7.1 Widget gates on user + selectedBranchId + !needsPublicAuth', () => {
    expect(FILES.widget).toMatch(/!user\s*\|\|\s*!selectedBranchId\s*\|\|\s*needsPublicAuth/);
  });

  it('SG7.2 Widget wires Reply handler to MessageList + Composer via setReplyingTo', () => {
    expect(FILES.widget).toMatch(/setReplyingTo/);
    expect(FILES.widget).toMatch(/onReply=\{handleReply\}/);
    expect(FILES.widget).toMatch(/replyingTo=\{chat\.replyingTo\}/);
  });
});
