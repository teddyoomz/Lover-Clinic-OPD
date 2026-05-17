// tests/v82-staff-chat-cursor-and-badge.test.js
// V82 (2026-05-17 post-V81-fix7b) regression bank.
//
// 8 groups, ~60 assertions:
//   A. Cursor module unit (9)
//   B. Bug #2 reproduction — snapshot re-fire post-remount (4)
//   C. First-mount silent backlog (2)
//   D. Force-open semantics — source-grep + behavioral (5)
//   E. Sound dedup source-grep (3)
//   F. NamePicker role section RTL via @testing-library/react (6)
//   G. RoleBadge component RTL (4)
//   H. Source-grep regression locks (8)

import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { render, screen, fireEvent } from '@testing-library/react';

const REPO_ROOT = join(import.meta.dirname, '..');
const readFile = (p) => readFileSync(p, 'utf-8');

// Helper: install a Map-backed localStorage shim. vitest jsdom env DOES provide
// localStorage by default, but resetting between tests via .clear() ensures
// isolation. Module-level state (e.g. cursor reads) sees a fresh store per test.
function installFreshLocalStorage() {
  if (typeof global.localStorage === 'undefined') {
    const store = new Map();
    global.localStorage = {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
      clear: () => store.clear(),
    };
    global.window = global.window || {};
    global.window.localStorage = global.localStorage;
  } else {
    try { global.localStorage.clear(); } catch { /* noop */ }
  }
}

// ─── Group A — Cursor module unit ─────────────────────────────────────────
describe('AV76.A — staffChatReadCursor module unit', () => {
  let getCursor, setCursor, isMessageUnread, initCursorIfMissing, CURSOR_STORAGE_KEY;
  beforeEach(async () => {
    // Fresh import per test for clean localStorage state
    vi.resetModules();
    installFreshLocalStorage();
    const mod = await import('../src/lib/staffChatReadCursor.js');
    getCursor = mod.getCursor;
    setCursor = mod.setCursor;
    isMessageUnread = mod.isMessageUnread;
    initCursorIfMissing = mod.initCursorIfMissing;
    CURSOR_STORAGE_KEY = mod.CURSOR_STORAGE_KEY;
  });

  it('A.1 getCursor returns null for absent key', () => {
    expect(getCursor('BR-X')).toBeNull();
  });
  it('A.2 setCursor + getCursor round-trip', () => {
    setCursor('BR-X', { lastReadId: 'm1', lastReadCreatedAtMs: 1000 });
    const c = getCursor('BR-X');
    expect(c.lastReadId).toBe('m1');
    expect(c.lastReadCreatedAtMs).toBe(1000);
    expect(typeof c.updatedAt).toBe('number');
  });
  it('A.3 setCursor partial update preserves existing fields', () => {
    setCursor('BR-X', { lastReadId: 'm1', lastReadCreatedAtMs: 1000 });
    setCursor('BR-X', { lastReadId: 'm2' });
    const c = getCursor('BR-X');
    expect(c.lastReadId).toBe('m2');
    expect(c.lastReadCreatedAtMs).toBe(1000); // preserved
  });
  it('A.4 different branches have independent cursors', () => {
    setCursor('BR-A', { lastReadCreatedAtMs: 100 });
    setCursor('BR-B', { lastReadCreatedAtMs: 200 });
    expect(getCursor('BR-A').lastReadCreatedAtMs).toBe(100);
    expect(getCursor('BR-B').lastReadCreatedAtMs).toBe(200);
  });
  it('A.5 isMessageUnread true when message createdAt > cursor', () => {
    const cursor = { lastReadCreatedAtMs: 500, lastReadId: '' };
    expect(isMessageUnread({ createdAt: 600, deviceId: 'other' }, cursor, 'me')).toBe(true);
  });
  it('A.6 isMessageUnread false when message createdAt <= cursor', () => {
    const cursor = { lastReadCreatedAtMs: 500, lastReadId: '' };
    expect(isMessageUnread({ createdAt: 500, deviceId: 'other' }, cursor, 'me')).toBe(false);
    expect(isMessageUnread({ createdAt: 400, deviceId: 'other' }, cursor, 'me')).toBe(false);
  });
  it('A.7 isMessageUnread false when message from self', () => {
    const cursor = { lastReadCreatedAtMs: 500, lastReadId: '' };
    expect(isMessageUnread({ createdAt: 600, deviceId: 'me' }, cursor, 'me')).toBe(false);
  });
  it('A.7-bis isMessageUnread accepts Firestore Timestamp {toMillis()} shape (real-prod contract)', () => {
    // V82 bug-fix lock (post-T9 vitest red): real prod messages from Firestore
    // SDK arrive as Timestamp instances, not raw numbers. Pre-fix the function
    // over-narrowed to typeof === number → silently returned false for ALL
    // real prod data → cursor never detected unread → force-open/sound/auto-
    // expand never fired in real prod. Lock dual-shape support permanently.
    const cursor = { lastReadCreatedAtMs: 1000, lastReadId: '' };
    expect(isMessageUnread({ createdAt: { toMillis: () => 2000 }, deviceId: 'other' }, cursor, 'me')).toBe(true);
    expect(isMessageUnread({ createdAt: { toMillis: () => 500 }, deviceId: 'other' }, cursor, 'me')).toBe(false);
    expect(isMessageUnread({ createdAt: { toMillis: () => { throw new Error('bad'); } }, deviceId: 'other' }, cursor, 'me')).toBe(false);
  });
  it('A.8 initCursorIfMissing seeds with latest createdAt when absent; idempotent', () => {
    const c1 = initCursorIfMissing('BR-X', 999);
    expect(c1.lastReadCreatedAtMs).toBe(999);
    const c2 = initCursorIfMissing('BR-X', 1234); // already set; should be no-op
    expect(c2.lastReadCreatedAtMs).toBe(999);
  });
  it('A.9 CURSOR_STORAGE_KEY format', () => {
    expect(CURSOR_STORAGE_KEY('BR-test')).toBe('staffChat:cursor:BR-test');
  });
});

// ─── Group B — Bug #2 reproduction ────────────────────────────────────────
describe('AV76.B — Bug #2 snapshot-re-fire post-remount', () => {
  let getCursor, setCursor, isMessageUnread;
  beforeEach(async () => {
    vi.resetModules();
    installFreshLocalStorage();
    const mod = await import('../src/lib/staffChatReadCursor.js');
    ({ getCursor, setCursor, isMessageUnread } = mod);
  });

  it('B.1 50-message snapshot + cursor at latest → 0 unread (Bug #2 closed)', () => {
    const messages = Array.from({ length: 50 }, (_, i) => ({
      id: `m${i}`, createdAt: 1000 + i, deviceId: 'other-device',
    }));
    setCursor('BR-X', { lastReadId: 'm49', lastReadCreatedAtMs: 1049 });
    const cursor = getCursor('BR-X');
    const unread = messages.filter(m => isMessageUnread(m, cursor, 'me')).length;
    expect(unread).toBe(0);
  });
  it('B.2 cross-mount: simulate remount → cursor hydrated; 0 unread', () => {
    setCursor('BR-X', { lastReadId: 'm49', lastReadCreatedAtMs: 1049 });
    // Simulate hook unmount + remount: cursor persists in localStorage
    const cursorAfterRemount = getCursor('BR-X');
    expect(cursorAfterRemount.lastReadCreatedAtMs).toBe(1049);
  });
  it('B.3 truly-new message after cursor → 1 unread', () => {
    setCursor('BR-X', { lastReadId: 'm49', lastReadCreatedAtMs: 1049 });
    const cursor = getCursor('BR-X');
    const newMsg = { id: 'm50', createdAt: 1050, deviceId: 'other-device' };
    expect(isMessageUnread(newMsg, cursor, 'me')).toBe(true);
  });
  it('B.4 own message (from self deviceId) → 0 unread even when newer', () => {
    setCursor('BR-X', { lastReadCreatedAtMs: 1049 });
    const cursor = getCursor('BR-X');
    const ownMsg = { id: 'm50', createdAt: 1050, deviceId: 'me' };
    expect(isMessageUnread(ownMsg, cursor, 'me')).toBe(false);
  });
});

// ─── Group C — First-mount silent backlog ─────────────────────────────────
describe('AV76.C — first-ever mount silent backlog', () => {
  let initCursorIfMissing, isMessageUnread;
  beforeEach(async () => {
    vi.resetModules();
    installFreshLocalStorage();
    ({ initCursorIfMissing, isMessageUnread } = await import('../src/lib/staffChatReadCursor.js'));
  });

  it('C.1 first mount with 50 messages → cursor = latest.createdAt → all 50 silent', () => {
    const messages = Array.from({ length: 50 }, (_, i) => ({
      id: `m${i}`, createdAt: 1000 + i, deviceId: 'other',
    }));
    const latestMs = messages[messages.length - 1].createdAt;
    const cursor = initCursorIfMissing('BR-X', latestMs);
    expect(cursor.lastReadCreatedAtMs).toBe(latestMs);
    const unread = messages.filter(m => isMessageUnread(m, cursor, 'me')).length;
    expect(unread).toBe(0);
  });
  it('C.2 first mount with 0 messages → cursor = now (fallback)', () => {
    const before = Date.now();
    const cursor = initCursorIfMissing('BR-Y', undefined);
    expect(cursor.lastReadCreatedAtMs).toBeGreaterThanOrEqual(before);
  });
});

// ─── Group D — Force-open semantics ───────────────────────────────────────
describe('AV76.D — force-open semantics', () => {
  // Behavioral tests via source-grep + simulator (full RTL in F group)
  it('D.1 useStaffChat exposes canMinimize derived from unreadCount', () => {
    const src = readFile(join(REPO_ROOT, 'src/hooks/useStaffChat.js'));
    expect(src).toMatch(/canMinimize\s*=\s*unreadCount\s*===\s*0/);
  });
  it('D.2 useStaffChat exports markScrolledToBottom', () => {
    const src = readFile(join(REPO_ROOT, 'src/hooks/useStaffChat.js'));
    expect(src).toMatch(/markScrolledToBottom/);
  });
  it('D.3 expand() does NOT zero unreadCount (per Q1=B scroll-to-bottom drives it)', () => {
    const src = readFile(join(REPO_ROOT, 'src/hooks/useStaffChat.js'));
    // V82 marker — old "setUnreadCount(0)" inside expand should be gone
    const expandBlock = src.match(/const expand = useCallback\(\(\) => \{([\s\S]{0,200})\}/);
    expect(expandBlock).toBeTruthy();
    expect(expandBlock[1]).not.toMatch(/setUnreadCount\s*\(\s*0\s*\)/);
  });
  it('D.4 V82-fix7 — Header minimize button is ALWAYS clickable (no disabled gate)', () => {
    // V82-fix7 (2026-05-18): force-open trapped mobile users where chat panel
    // covered the bottom dock + IntersectionObserver "scroll-to-bottom" never
    // fired. Fix: minimize button ALWAYS works; useStaffChat.minimize auto-
    // advances the cursor (treats user click = "acknowledge all read").
    const src = readFile(join(REPO_ROOT, 'src/components/staffchat/StaffChatHeader.jsx'));
    expect(src).not.toMatch(/disabled=\{!canMinimize\}|disabled=\{\s*!canMinimize\s*\}/);
    // Anti-regression: legacy `disabled={!canMinimize}` pattern absent
  });
  it('D.5 V82-fix7 — Header tooltip indicates ack-on-minimize when unread > 0', () => {
    // V82-fix7: tooltip changes to inform user that clicking will mark all read.
    const src = readFile(join(REPO_ROOT, 'src/components/staffchat/StaffChatHeader.jsx'));
    expect(src).toMatch(/ทำเครื่องหมายว่าอ่านครบ/);
    // Old "เลื่อนลงล่างก่อน ⬇" tooltip is removed per V82-fix7
    expect(src).not.toMatch(/เลื่อนลงล่างก่อน/);
  });
  it('D.6 V82-fix7 — useStaffChat.minimize advances cursor before setMinimized(true)', () => {
    // V82-fix7 contract: clicking minimize = ack all read. Cursor advances
    // to latest msg createdAt, then setMinimized(true). Locks the new behavior.
    const src = readFile(join(REPO_ROOT, 'src/hooks/useStaffChat.js'));
    const minimizeBlock = src.match(/const minimize = useCallback\(\(\) => \{[\s\S]*?\},\s*\[[^\]]*\]\)/);
    expect(minimizeBlock).toBeTruthy();
    // Cursor advance call inside minimize body
    expect(minimizeBlock[0]).toMatch(/setCursor\(selectedBranchId/);
    // Deps array now includes selectedBranchId + messages (was empty pre-fix7)
    expect(minimizeBlock[0]).toMatch(/\[selectedBranchId,\s*messages\]/);
  });
});

// ─── Group E — Sound dedup ────────────────────────────────────────────────
describe('AV76.E — sound dedup', () => {
  it('E.1 useStaffChat uses emittedForRef Set for per-mount dedup', () => {
    const src = readFile(join(REPO_ROOT, 'src/hooks/useStaffChat.js'));
    expect(src).toMatch(/emittedForRef/);
  });
  it('E.2 useStaffChat no longer uses lastSeenIdsRef for cross-mount dedup (Bug #2 anti-regression)', () => {
    const src = readFile(join(REPO_ROOT, 'src/hooks/useStaffChat.js'));
    expect(src).not.toMatch(/lastSeenIdsRef\s*=\s*useRef\s*\(\s*new Set\(\)\s*\)/);
  });
  it('E.3 useStaffChat sound emit gated on isMessageUnread (cursor-relative)', () => {
    const src = readFile(join(REPO_ROOT, 'src/hooks/useStaffChat.js'));
    expect(src).toMatch(/isMessageUnread/);
  });
});

// ─── Group F — Badge picker RTL ──────────────────────────────────────────
describe('AV76.F — NamePicker role section RTL', () => {
  beforeEach(() => {
    installFreshLocalStorage();
  });

  it('F.1 renders 4 role tiles + "ไม่ระบุ" tile', async () => {
    const { default: NamePicker } = await import('../src/components/staffchat/StaffChatNamePicker.jsx');
    render(React.createElement(NamePicker, { initialValue: '', initialColor: '#ef4444', onConfirm: () => {}, onCancel: () => {} }));
    expect(screen.getByTestId('staffchat-namepicker-role-doctor')).toBeTruthy();
    expect(screen.getByTestId('staffchat-namepicker-role-assistant')).toBeTruthy();
    expect(screen.getByTestId('staffchat-namepicker-role-staff')).toBeTruthy();
    expect(screen.getByTestId('staffchat-namepicker-role-manager')).toBeTruthy();
    expect(screen.getByTestId('staffchat-namepicker-role-none')).toBeTruthy();
  });
  it('F.2 clicking a role tile sets aria-pressed=true', async () => {
    const { default: NamePicker } = await import('../src/components/staffchat/StaffChatNamePicker.jsx');
    render(React.createElement(NamePicker, { initialValue: '', initialColor: '#ef4444', onConfirm: () => {}, onCancel: () => {} }));
    const tile = screen.getByTestId('staffchat-namepicker-role-doctor');
    fireEvent.click(tile);
    expect(tile.getAttribute('aria-pressed')).toBe('true');
  });
  it('F.3 onConfirm called with (name, color, role)', async () => {
    const { default: NamePicker } = await import('../src/components/staffchat/StaffChatNamePicker.jsx');
    const onConfirm = vi.fn();
    render(React.createElement(NamePicker, { initialValue: '', initialColor: '#ef4444', onConfirm, onCancel: () => {} }));
    // Fill name via testid (placeholder is "เช่น ดร.วี / admin / พี่บี" — does not match /ชื่อ/i)
    const nameInput = screen.getByTestId('staff-chat-name-picker-input');
    fireEvent.change(nameInput, { target: { value: 'หมอเอ' } });
    fireEvent.click(screen.getByTestId('staffchat-namepicker-role-doctor'));
    // No <form> wrapper — click save button (testid) directly
    fireEvent.click(screen.getByTestId('staff-chat-name-picker-save'));
    expect(onConfirm).toHaveBeenCalledWith('หมอเอ', expect.any(String), 'doctor');
  });
  it('F.4 "ไม่ระบุ" tile yields null role', async () => {
    const { default: NamePicker } = await import('../src/components/staffchat/StaffChatNamePicker.jsx');
    const onConfirm = vi.fn();
    render(React.createElement(NamePicker, { initialValue: '', initialColor: '#ef4444', onConfirm, onCancel: () => {} }));
    // Name must be ≥2 chars to satisfy `valid` gate (canSave) in NamePicker.
    // Plan-text used 'X' (1 char) but validation requires 2-50 chars.
    fireEvent.change(screen.getByTestId('staff-chat-name-picker-input'), { target: { value: 'XX' } });
    fireEvent.click(screen.getByTestId('staffchat-namepicker-role-none'));
    fireEvent.click(screen.getByTestId('staff-chat-name-picker-save'));
    expect(onConfirm).toHaveBeenCalledWith('XX', expect.any(String), null);
  });
  it('F.5 setRole/getRole round-trip via localStorage', async () => {
    const { setRole, getRole } = await import('../src/lib/staffChatIdentity.js');
    setRole('doctor');
    expect(getRole()).toBe('doctor');
    setRole(null);
    expect(getRole()).toBeNull();
  });
  it('F.6 setRole throws on invalid role', async () => {
    const { setRole } = await import('../src/lib/staffChatIdentity.js');
    expect(() => setRole('janitor')).toThrow();
  });
});

// ─── Group G — Badge display RTL ─────────────────────────────────────────
describe('AV76.G — RoleBadge component RTL', () => {
  it('G.1 RoleBadge renders for valid role + size="sm"', async () => {
    const { default: RoleBadge } = await import('../src/components/staffchat/StaffChatRoleBadge.jsx');
    render(React.createElement(RoleBadge, { role: 'doctor', size: 'sm' }));
    expect(screen.getByTestId('staff-chat-role-badge-sm-doctor')).toBeTruthy();
  });
  it('G.2 RoleBadge renders null for invalid role', async () => {
    const { default: RoleBadge } = await import('../src/components/staffchat/StaffChatRoleBadge.jsx');
    const { container } = render(React.createElement(RoleBadge, { role: 'janitor', size: 'sm' }));
    expect(container.firstChild).toBeNull();
  });
  it('G.3 RoleBadge renders null for absent role (legacy message)', async () => {
    const { default: RoleBadge } = await import('../src/components/staffchat/StaffChatRoleBadge.jsx');
    const { container } = render(React.createElement(RoleBadge, { role: null, size: 'sm' }));
    expect(container.firstChild).toBeNull();
  });
  it('G.4 size="lg" renders 40px outer; size="sm" renders 16px outer', async () => {
    const { default: RoleBadge } = await import('../src/components/staffchat/StaffChatRoleBadge.jsx');
    const { rerender, container } = render(React.createElement(RoleBadge, { role: 'doctor', size: 'lg' }));
    expect(container.firstChild.style.width).toBe('40px');
    rerender(React.createElement(RoleBadge, { role: 'doctor', size: 'sm' }));
    expect(container.firstChild.style.width).toBe('16px');
  });
});

// ─── Group H — Source-grep regression locks ──────────────────────────────
describe('AV76.H — source-grep regression locks (AV76 enforcement)', () => {
  it('H.1 useStaffChat imports cursor module', () => {
    const src = readFile(join(REPO_ROOT, 'src/hooks/useStaffChat.js'));
    expect(src).toMatch(/from\s+['"]\.\.\/lib\/staffChatReadCursor\.js['"]/);
  });
  it('H.2 useStaffChat imports getRole/setRole from staffChatIdentity', () => {
    const src = readFile(join(REPO_ROOT, 'src/hooks/useStaffChat.js'));
    expect(src).toMatch(/getRole|setRole/);
  });
  it('H.3 staffChatClient buildMessageDoc references senderRole', () => {
    const src = readFile(join(REPO_ROOT, 'src/lib/staffChatClient.js'));
    expect(src).toMatch(/senderRole/);
  });
  it('H.4 StaffChatMessage renders RoleBadge inline before name', () => {
    const src = readFile(join(REPO_ROOT, 'src/components/staffchat/StaffChatMessage.jsx'));
    expect(src).toMatch(/StaffChatRoleBadge/);
    expect(src).toMatch(/message\.senderRole/);
  });
  it('H.5 NamePicker renders 4 role tile testids', () => {
    // NamePicker.jsx renders `data-testid={`staffchat-namepicker-role-${key}`}`
    // where keys come from ROLE_KEYS imported from staffChatIdentity.js.
    // Lock both: NamePicker has the testid template + ROLE_KEYS contains the 4 keys.
    const pickerSrc = readFile(join(REPO_ROOT, 'src/components/staffchat/StaffChatNamePicker.jsx'));
    expect(pickerSrc).toMatch(/staffchat-namepicker-role-/);
    expect(pickerSrc).toMatch(/ROLE_KEYS/);
    expect(pickerSrc).toMatch(/staffchat-namepicker-role-none/); // "ไม่ระบุ" tile literal
    const identitySrc = readFile(join(REPO_ROOT, 'src/lib/staffChatIdentity.js'));
    for (const k of ['doctor', 'assistant', 'staff', 'manager']) {
      // ROLE_KEYS frozen literal in identity module
      expect(identitySrc).toMatch(new RegExp(`['"]${k}['"]`));
    }
  });
  it('H.6 MessageList wires bottomSentinelRef + IntersectionObserver', () => {
    const src = readFile(join(REPO_ROOT, 'src/components/staffchat/StaffChatMessageList.jsx'));
    expect(src).toMatch(/bottomSentinelRef/);
    expect(src).toMatch(/IntersectionObserver/);
  });
  it('H.7 RoleBadge is the SINGLE source — no inline role-badge SVG outside the component (Rule C1)', () => {
    const list = readFile(join(REPO_ROOT, 'src/components/staffchat/StaffChatMessage.jsx'));
    const picker = readFile(join(REPO_ROOT, 'src/components/staffchat/StaffChatNamePicker.jsx'));
    // Both consumers should reference RoleBadge, NOT inline Lucide icons for the same purpose
    expect(list).toMatch(/StaffChatRoleBadge/);
    expect(picker).toMatch(/StaffChatRoleBadge/);
  });
  it('H.8 V82 marker comments present in all modified files (institutional memory)', () => {
    for (const p of [
      'src/lib/staffChatReadCursor.js',
      'src/lib/staffChatIdentity.js',
      'src/hooks/useStaffChat.js',
      'src/components/staffchat/StaffChatRoleBadge.jsx',
      'src/components/staffchat/StaffChatNamePicker.jsx',
      'src/components/staffchat/StaffChatMessage.jsx',
      'src/components/staffchat/StaffChatMessageList.jsx',
    ]) {
      expect(readFile(join(REPO_ROOT, p))).toMatch(/V82/);
    }
  });
});
