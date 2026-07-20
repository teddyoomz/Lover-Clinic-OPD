// ─── LINE Friend Picker (2026-07-20) — webhook follow/unfollow capture ───────
// W1-W5 source-grep locks on api/webhook/line.js. The decision logic itself is
// unit-tested in tests/line-friend-roster.test.js (pure decideFollowEventUpdate);
// these lock the WIRING: gate, placement, best-effort isolation, fallback-branch
// discipline (V78 BUG-XR-24 class), and the untouched message pipeline.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const src = readFileSync('api/webhook/line.js', 'utf8');

describe('W1 — event gate', () => {
  it('W1.1 processEvent accepts follow + unfollow (join/leave still ignored)', () => {
    expect(src).toMatch(/\['message',\s*'postback',\s*'follow',\s*'unfollow'\]\.includes\(event\.type\)/);
  });
  it('W1.2 no handler for join/leave events (scope stays tight)', () => {
    expect(src).not.toMatch(/event\.type === 'join'/);
    expect(src).not.toMatch(/event\.type === 'leave'/);
  });
});

describe('W2 — placement + best-effort isolation', () => {
  it('W2.1 follow branch sits AFTER config resolution and BEFORE the chat message path', () => {
    const followIdx = src.indexOf("event.type === 'follow'");
    const configIdx = src.indexOf('resolveLineConfigForWebhook');
    const chatPathIdx = src.indexOf('chat_conversations/line_');
    expect(followIdx).toBeGreaterThan(configIdx);
    expect(followIdx).toBeLessThan(chatPathIdx);
  });
  it('W2.2 follow handler is try/catch-wrapped with a warn (never blocks pipeline)', () => {
    const block = src.slice(src.indexOf("event.type === 'follow'"), src.indexOf('chat_conversations/line_'));
    expect(block).toMatch(/try\s*\{/);
    expect(block).toMatch(/console\.warn\('\[line-webhook\] follow handler failed:/);
  });
  it('W2.3 follow branch RETURNS — never falls through into the chat message path', () => {
    const block = src.slice(src.indexOf("event.type === 'follow'"), src.indexOf('chat_conversations/line_'));
    expect(block).toMatch(/\breturn;/);
  });
});

describe('W3 — doc path + fallback-branch discipline', () => {
  it('W3.1 writes be_line_friends/{branchId}_{userId}', () => {
    expect(src).toMatch(/be_line_friends\/\$\{friendBranchId\}_\$\{userId\}/);
  });
  it('W3.2 uses resolveChatFallbackBranchId (V78 BUG-XR-24 class — no raw || fallback)', () => {
    const block = src.slice(src.indexOf("event.type === 'follow'"), src.indexOf('chat_conversations/line_'));
    expect(block).toMatch(/resolveChatFallbackBranchId\(process\.env\.LOVER_DEFAULT_BRANCH_ID\)/);
  });
  it('W3.3 merge-set with lineUserId + decideFollowEventUpdate fields', () => {
    const block = src.slice(src.indexOf("event.type === 'follow'"), src.indexOf('chat_conversations/line_'));
    expect(block).toMatch(/decideFollowEventUpdate\(/);
    expect(block).toMatch(/\.set\(\{ lineUserId: userId, \.\.\.fields \}, \{ merge: true \}\)/);
  });
  it('W3.4 imports decideFollowEventUpdate from the shared pure lib', () => {
    expect(src).toMatch(/from '\.\.\/\.\.\/src\/lib\/lineFriendRoster\.js'/);
  });
});

describe('W4 — profile API economy', () => {
  it('W4.1 unfollow does NOT fetch profile (follow-only)', () => {
    const block = src.slice(src.indexOf("event.type === 'follow'"), src.indexOf('chat_conversations/line_'));
    expect(block).toMatch(/event\.type === 'follow'\s*\?\s*await getLineProfile\(userId, config\.channelAccessToken\)\s*:\s*null/);
  });
});

describe('W5 — message pipeline untouched (silent-regression anchors)', () => {
  it('W5.1 chat conversation write path intact', () => {
    expect(src).toMatch(/chat_conversations\/line_\$\{userId\}/);
    expect(src).toMatch(/await adminChatSet\(getAdminFirestore\(\), convPath, convFields\)/);
  });
  it('W5.2 bot reply still runs AFTER chat storage (V32-tris-ter contract)', () => {
    expect(src).toMatch(/await maybeEmitBotReply\(event, config, branchId\)/);
  });
  it('W5.3 postback branch intact (LINE Reminder Task 7)', () => {
    expect(src).toMatch(/await handlePostback\(event, db, config, branchId\)/);
  });
  it('W5.4 AV57 branchId stamp on conversations intact', () => {
    expect(src).toMatch(/branchId: \{ stringValue: chatBranchId \}/);
  });
});
