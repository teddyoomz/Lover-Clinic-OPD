// V75 AV58 — chatNotificationMute scope guard (source-grep regression).
// ONLY ChatPanel.jsx may import chatNotificationMute helper. Other
// sound-trigger sites consume the SAFE wrapper playChatNotificationSound.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function walk(dir, list = []) {
  if (!fs.existsSync(dir)) return list;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, list);
    else if (/\.(js|jsx|ts|tsx)$/.test(ent.name)) list.push(full);
  }
  return list;
}

describe('V75 AV58 — chatNotificationMute scope (only ChatPanel.jsx imports)', () => {
  it('AV58.1 — chatNotificationMute helper imported ONLY by src/components/ChatPanel.jsx', () => {
    const files = walk('src');
    const offenders = [];
    for (const f of files) {
      if (/chatNotificationMute/i.test(f)) continue; // skip the helper itself
      const src = fs.readFileSync(f, 'utf8');
      if (/from\s+['"][^'"]*chatNotificationMute[^'"]*['"]/.test(src)) {
        offenders.push(f);
      }
    }
    // Acceptable importers: ChatPanel.jsx only.
    const allowed = ['src/components/ChatPanel.jsx', 'src\\components\\ChatPanel.jsx'];
    const violations = offenders.filter(f => !allowed.includes(f));
    expect(violations).toEqual([]);
  });

  it('AV58.2 — V73 staff-chat widget files do NOT import chatNotificationMute', () => {
    const files = walk('src/components/staffchat');
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      expect(src).not.toMatch(/chatNotificationMute/);
    }
  });

  it('AV58.3 — AV58 entry in audit-anti-vibe-code SKILL.md', () => {
    const skill = fs.readFileSync('.agents/skills/audit-anti-vibe-code/SKILL.md', 'utf8');
    expect(skill).toMatch(/^### AV58 — Chat noti mute scope/m);
  });

  it('AV58.4 — ChatPanel.jsx exports playChatNotificationSound safe wrapper', () => {
    const src = fs.readFileSync('src/components/ChatPanel.jsx', 'utf8');
    expect(src).toMatch(/export function playChatNotificationSound/);
  });

  it('AV58.5 — AdminDashboard chat-alert sites use playChatNotificationSound (NOT direct playAlertSound)', () => {
    const src = fs.readFileSync('src/pages/AdminDashboard.jsx', 'utf8');
    // Verify the chat-alert blocks use the safe wrapper
    expect(src).toMatch(/playChatNotificationSound\(\)/);
    // Verify direct playAlertSound() is NOT used inside chat-alert blocks
    // (find the 2 chat blocks via shouldRingChatAlert + shouldRingChatInterval markers)
    const chatAlertSection = src.match(/shouldRingChatAlert[\s\S]{0,500}/);
    const chatIntervalSection = src.match(/shouldRingChatInterval[\s\S]{0,500}/);
    expect(chatAlertSection).not.toBeNull();
    expect(chatIntervalSection).not.toBeNull();
    expect(chatAlertSection[0]).not.toMatch(/playAlertSound\(\)/);
    expect(chatIntervalSection[0]).not.toMatch(/playAlertSound\(\)/);
  });

  it('AV58.6 — playChatNotificationSound implementation reads isChatTabMuted', () => {
    const src = fs.readFileSync('src/components/ChatPanel.jsx', 'utf8');
    const start = src.indexOf('export function playChatNotificationSound');
    const block = src.slice(start, start + 300);
    expect(block).toMatch(/isChatTabMuted/);
    expect(block).toMatch(/playAlertSound/);
  });

  it('AV58.7 — V75 Item 4 marker comments present in ChatPanel.jsx', () => {
    const src = fs.readFileSync('src/components/ChatPanel.jsx', 'utf8');
    expect(src).toMatch(/V75 Item 4/);
  });

  // ─── Task 32 extensions: cross-surface noti scope audit ────────────────
  // Per Rule P 7-step expansion: ensure NO other sound-trigger sites in src/
  // accidentally import the V75 helper (the helper is chat-tab-scoped only).

  it('AV58.8 — V73 StaffChatHeader.jsx uses its own staffChatIdentity (NOT V75 helper)', () => {
    const headerPath = 'src/components/staffchat/StaffChatHeader.jsx';
    if (!fs.existsSync(headerPath)) return; // V73 not shipped yet — skip
    const src = fs.readFileSync(headerPath, 'utf8');
    expect(src).not.toMatch(/chatNotificationMute/);
    expect(src).not.toMatch(/isChatTabMuted/);
    // V73 staff-chat uses its own mute path (getMuted/setMuted from
    // staffChatIdentity or local state — separate from the chat-tab Mute).
  });

  it('AV58.9 — non-ChatPanel sound-trigger sites do NOT import chatNotificationMute', () => {
    const files = walk('src');
    const violations = [];
    for (const f of files) {
      if (/chatNotificationMute/i.test(f)) continue; // helper itself
      if (/ChatPanel\.jsx$/.test(f)) continue; // sanctioned consumer
      const src = fs.readFileSync(f, 'utf8');
      // Find any sound-trigger pattern (Audio / AudioContext / new Notification)
      const hasSoundTrigger = /new\s+Audio\(|AudioContext\(|new\s+Notification\(/.test(src);
      const importsV75Helper = /from\s+['"][^'"]*chatNotificationMute[^'"]*['"]/.test(src);
      if (hasSoundTrigger && importsV75Helper) {
        violations.push(f);
      }
    }
    expect(violations).toEqual([]);
  });

  it('AV58.10 — Phase 29 recall ping + appointment-due alerts do NOT import V75 helper', () => {
    const candidatePaths = [
      'src/components/Recall',
      'src/components/recall',
      'src/components/backend/recall',
      'src/components/backend/appointment',
      'src/lib/recall',
    ];
    for (const dir of candidatePaths) {
      if (!fs.existsSync(dir)) continue;
      const files = walk(dir);
      for (const f of files) {
        const src = fs.readFileSync(f, 'utf8');
        expect(src).not.toMatch(/chatNotificationMute/);
        expect(src).not.toMatch(/isChatTabMuted/);
      }
    }
  });
});
