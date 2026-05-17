// tests/v73-color-picker.test.jsx
// V73 color-picker (2026-05-18) — per-device chat sender color regression bank.
//
// User request: "เลือกสีชื่อ และสี bubble แชทของตัวเองได้ด้วย เพื่อความจำง่าย
// และเร็วขึ้นสำหรับผู้อ่าน" — redirected D1 to "free hex with UI picker".
//
// Design (docs/superpowers/specs/2026-05-18-chat-color-picker-design.md):
//   - localStorage `staffChatColor` = '#RRGGBB' per device (default '#E11D48')
//   - Native HTML5 <input type="color"> inside NamePicker modal
//   - ONE color drives BOTH name + bubble (name = full color, bubble = 20% alpha)
//   - senderColor field embedded in each Firestore message doc
//   - Past messages without senderColor → fallback rose (own) / sky (other)
//
// Test bank covers helpers + buildMessageDoc + NamePicker + Message + hook
// + Widget wire-through via source-grep.

import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const color = SRC('src/lib/staffChatColor.js');
const identity = SRC('src/lib/staffChatIdentity.js');
const client = SRC('src/lib/staffChatClient.js');
const hook = SRC('src/hooks/useStaffChat.js');
const picker = SRC('src/components/staffchat/StaffChatNamePicker.jsx');
const message = SRC('src/components/staffchat/StaffChatMessage.jsx');
const widget = SRC('src/components/staffchat/StaffChatWidget.jsx');

// Import the actual helpers (pure JS, no Firebase deps)
import {
  hexToRgba,
  isValidHex,
  resolveSenderColor,
  DEFAULT_OWN_COLOR,
  DEFAULT_OTHER_COLOR,
} from '../src/lib/staffChatColor.js';
import { buildMessageDoc } from '../src/lib/staffChatClient.js';
import {
  getColor,
  setColor,
} from '../src/lib/staffChatIdentity.js';

describe('V73.CP1 — staffChatColor pure helpers', () => {
  it('CP1.1 isValidHex accepts "#RRGGBB" 6-digit', () => {
    expect(isValidHex('#FF5544')).toBe(true);
    expect(isValidHex('#000000')).toBe(true);
    expect(isValidHex('#ffffff')).toBe(true);
    expect(isValidHex('#aBcDeF')).toBe(true);
  });

  it('CP1.2 isValidHex rejects bad input', () => {
    expect(isValidHex('FF5544')).toBe(false);         // no #
    expect(isValidHex('#FFF')).toBe(false);            // 3-digit not supported
    expect(isValidHex('#FFGGHH')).toBe(false);         // non-hex chars
    expect(isValidHex('')).toBe(false);
    expect(isValidHex(null)).toBe(false);
    expect(isValidHex(undefined)).toBe(false);
    expect(isValidHex(123)).toBe(false);
  });

  it('CP1.3 hexToRgba converts correctly', () => {
    expect(hexToRgba('#FF0000', 1)).toBe('rgba(255, 0, 0, 1)');
    expect(hexToRgba('#00FF00', 0.5)).toBe('rgba(0, 255, 0, 0.5)');
    expect(hexToRgba('#0000FF', 0.20)).toBe('rgba(0, 0, 255, 0.2)');
    expect(hexToRgba('#E11D48', 0.20)).toBe('rgba(225, 29, 72, 0.2)');
  });

  it('CP1.4 hexToRgba clamps alpha to 0..1', () => {
    expect(hexToRgba('#FF0000', -0.5)).toBe('rgba(255, 0, 0, 0)');
    expect(hexToRgba('#FF0000', 2)).toBe('rgba(255, 0, 0, 1)');
  });

  it('CP1.5 hexToRgba returns transparent black on invalid hex', () => {
    expect(hexToRgba('not-hex', 0.5)).toBe('rgba(0,0,0,0)');
    expect(hexToRgba('', 0.5)).toBe('rgba(0,0,0,0)');
    expect(hexToRgba(null, 0.5)).toBe('rgba(0,0,0,0)');
  });

  it('CP1.6 resolveSenderColor returns message.senderColor when valid', () => {
    expect(resolveSenderColor({ senderColor: '#ABCDEF' }, true)).toBe('#ABCDEF');
    expect(resolveSenderColor({ senderColor: '#ABCDEF' }, false)).toBe('#ABCDEF');
  });

  it('CP1.7 resolveSenderColor falls back to own/other defaults', () => {
    expect(resolveSenderColor({}, true)).toBe(DEFAULT_OWN_COLOR);
    expect(resolveSenderColor({}, false)).toBe(DEFAULT_OTHER_COLOR);
    expect(resolveSenderColor({ senderColor: 'invalid' }, true)).toBe(DEFAULT_OWN_COLOR);
    expect(resolveSenderColor(null, false)).toBe(DEFAULT_OTHER_COLOR);
  });

  it('CP1.8 DEFAULT constants are valid hex', () => {
    expect(isValidHex(DEFAULT_OWN_COLOR)).toBe(true);
    expect(isValidHex(DEFAULT_OTHER_COLOR)).toBe(true);
  });
});

describe('V73.CP2 — staffChatIdentity getColor/setColor', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('CP2.1 getColor returns default when localStorage empty', () => {
    expect(getColor()).toBe('#E11D48');  // matches DEFAULT in identity.js
  });

  it('CP2.2 setColor + getColor round-trip', () => {
    setColor('#ABCDEF');
    expect(getColor()).toBe('#ABCDEF');
  });

  it('CP2.3 setColor throws on invalid hex', () => {
    expect(() => setColor('not-hex')).toThrow('STAFF_CHAT_COLOR_INVALID');
    expect(() => setColor('#FFF')).toThrow('STAFF_CHAT_COLOR_INVALID');
    expect(() => setColor('')).toThrow('STAFF_CHAT_COLOR_INVALID');
    expect(() => setColor(null)).toThrow('STAFF_CHAT_COLOR_INVALID');
  });

  it('CP2.4 getColor recovers default if localStorage has corrupt value', () => {
    localStorage.setItem('staffChatColor', 'corrupt');
    expect(getColor()).toBe('#E11D48');  // safe fallback
  });
});

describe('V73.CP3 — buildMessageDoc senderColor embedding', () => {
  const base = {
    branchId: 'BR-X',
    displayName: 'พี่บี',
    deviceId: 'dev-1',
    text: 'hello',
  };

  it('CP3.1 includes senderColor when valid hex', () => {
    const doc = buildMessageDoc({ ...base, senderColor: '#ABCDEF' });
    expect(doc.senderColor).toBe('#ABCDEF');
  });

  it('CP3.2 omits senderColor when missing', () => {
    const doc = buildMessageDoc(base);
    expect('senderColor' in doc).toBe(false);
  });

  it('CP3.3 omits senderColor when invalid (defensive)', () => {
    const doc1 = buildMessageDoc({ ...base, senderColor: 'not-hex' });
    const doc2 = buildMessageDoc({ ...base, senderColor: '#FFF' });
    const doc3 = buildMessageDoc({ ...base, senderColor: 123 });
    expect('senderColor' in doc1).toBe(false);
    expect('senderColor' in doc2).toBe(false);
    expect('senderColor' in doc3).toBe(false);
  });
});

describe('V73.CP4 — NamePicker color UI source-grep', () => {
  it('CP4.1 NamePicker accepts initialColor prop', () => {
    expect(picker).toMatch(/function StaffChatNamePicker\(\{[^}]*initialColor/);
  });

  it('CP4.2 NamePicker renders <input type="color">', () => {
    expect(picker).toMatch(/type="color"/);
  });

  it('CP4.3 NamePicker has color-input data-testid', () => {
    expect(picker).toMatch(/data-testid="staff-chat-name-picker-color"/);
  });

  it('CP4.4 NamePicker has hex preview span with monospace font', () => {
    expect(picker).toMatch(/data-testid="staff-chat-name-picker-color-hex"/);
  });

  it('CP4.5 NamePicker has color-preview chip showing user color', () => {
    expect(picker).toMatch(/data-testid="staff-chat-name-picker-color-preview"/);
  });

  it('CP4.6 NamePicker onConfirm passes (name, color)', () => {
    // V82 fix-up — pre-V82 asserted `onConfirm(trimmed, color)`; V82 extended
    // the signature to `onConfirm(trimmed, color, selectedRole)` adding optional
    // role param. Assertion adapted to match the new 3-arg shape.
    expect(picker).toMatch(/onConfirm\(trimmed,\s*color,\s*selectedRole\)/);
  });

  it('CP4.7 NamePicker save enabled when name OR color changes (not both required)', () => {
    // V82 fix-up — pre-V82 asserted `canSave = valid && (nameChanged || colorChanged)`;
    // V82 added `roleChanged` to the OR-chain so admin can save by changing only
    // role too. Assertion adapted to include the new 3rd branch.
    expect(picker).toMatch(/canSave\s*=\s*valid\s*&&\s*\(nameChanged\s*\|\|\s*colorChanged\s*\|\|\s*roleChanged\)/);
  });
});

describe('V73.CP5 — Message renders senderColor styles', () => {
  it('CP5.1 Message imports hexToRgba + resolveSenderColor', () => {
    expect(message).toMatch(/from\s+['"]\.\.\/\.\.\/lib\/staffChatColor\.js['"]/);
    expect(message).toMatch(/hexToRgba/);
    expect(message).toMatch(/resolveSenderColor/);
  });

  it('CP5.2 Message resolves senderColor from message + isOwn', () => {
    expect(message).toMatch(/resolveSenderColor\(message,\s*isOwn\)/);
  });

  it('CP5.3 Message bubble uses inline style (not Tailwind static classes for color)', () => {
    expect(message).toMatch(/style=\{bubbleStyle\}/);
  });

  it('CP5.4 Message name uses inline style with senderColor', () => {
    expect(message).toMatch(/style=\{nameStyle\}/);
  });

  it('CP5.5 bubbleStyle uses 20% alpha for background, 45% for border', () => {
    expect(message).toMatch(/hexToRgba\(senderColor,\s*0\.20\)/);
    expect(message).toMatch(/hexToRgba\(senderColor,\s*0\.45\)/);
  });
});

describe('V73.CP6 — useStaffChat hook threads color end-to-end', () => {
  it('CP6.1 hook imports getColor + setColor', () => {
    expect(hook).toMatch(/getColor/);
    expect(hook).toMatch(/setColor/);
  });

  it('CP6.2 hook stores currentColor state init from getColor', () => {
    expect(hook).toMatch(/const\s*\[currentColor,\s*setCurrentColor\]\s*=\s*useState\(\(\)\s*=>\s*getColor\(\)\)/);
  });

  it('CP6.3 hook send() includes senderColor via getColor() in payload', () => {
    expect(hook).toMatch(/senderColor:\s*getColor\(\)/);
  });

  it('CP6.4 confirmName accepts optional color param', () => {
    // V82 fix-up — pre-V82 asserted `confirmName = useCallback(async (name, color))`;
    // V82 extended the signature to `(name, color, role)` so the hook can persist
    // the picker's selected role via setRole. Assertion adapted to include the
    // new 3rd arg.
    expect(hook).toMatch(/confirmName\s*=\s*useCallback\(async\s*\(name,\s*color,\s*role\)/);
  });

  it('CP6.5 confirmName persists color via setColor + setCurrentColor', () => {
    expect(hook).toMatch(/setColor\(color\)/);
    expect(hook).toMatch(/setCurrentColor\(color\)/);
  });

  it('CP6.6 hook returns color in return shape', () => {
    expect(hook).toMatch(/color:\s*currentColor/);
  });

  it('CP6.7 openNameEdit re-syncs currentColor from localStorage', () => {
    expect(hook).toMatch(/setCurrentColor\(getColor\(\)\)/);
  });
});

describe('V73.CP7 — Widget threads chat.color to NamePicker', () => {
  it('CP7.1 Widget passes initialColor={chat.color} to NamePicker', () => {
    expect(widget).toMatch(/initialColor=\{chat\.color\}/);
  });
});

describe('V73.CP8 — Class-of-bug expansion: senderColor flows end-to-end', () => {
  it('CP8.1 SIM full chain: hook send → buildMessageDoc → Firestore-shape doc', () => {
    // Pure-sim chain without React mounting.
    setColor('#A1B2C3');
    const doc = buildMessageDoc({
      branchId: 'BR-1',
      displayName: 'tester',
      deviceId: 'dev-1',
      text: 'hello',
      senderColor: getColor(),
    });
    expect(doc.senderColor).toBe('#A1B2C3');
    expect(doc.displayName).toBe('tester');
    expect(doc.branchId).toBe('BR-1');
  });

  it('CP8.2 SIM message render path: message.senderColor → rgba bubble', () => {
    const senderColor = resolveSenderColor({ senderColor: '#A1B2C3' }, false);
    expect(senderColor).toBe('#A1B2C3');
    const bg = hexToRgba(senderColor, 0.2);
    expect(bg).toBe('rgba(161, 178, 195, 0.2)');
  });

  it('CP8.3 SIM legacy message (no senderColor): defaults applied', () => {
    const ownColor = resolveSenderColor({ id: 'msg-1', text: 'hi' }, true);
    const otherColor = resolveSenderColor({ id: 'msg-2', text: 'hi' }, false);
    expect(ownColor).toBe(DEFAULT_OWN_COLOR);
    expect(otherColor).toBe(DEFAULT_OTHER_COLOR);
  });
});
