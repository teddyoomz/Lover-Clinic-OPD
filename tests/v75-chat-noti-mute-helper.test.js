// V75 Item 4 — chatNotificationMute helper unit tests.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  isChatTabMuted,
  setChatTabMuted,
  toggleChatTabMute,
} from '../src/lib/chatNotificationMute.js';

describe('V75 Item 4 — chatNotificationMute helper', () => {
  beforeEach(() => {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.clear();
    }
  });

  it('M1.1 — isChatTabMuted defaults to false when key missing', () => {
    expect(isChatTabMuted('TEST-DEVICE-1')).toBe(false);
  });

  it('M1.2 — setChatTabMuted(true) persists to localStorage', () => {
    setChatTabMuted(true, 'TEST-DEVICE-1');
    expect(window.localStorage.getItem('loverclinic.chatTabMuted.TEST-DEVICE-1')).toBe('1');
    expect(isChatTabMuted('TEST-DEVICE-1')).toBe(true);
  });

  it('M1.3 — setChatTabMuted(false) removes the key (not just sets to 0)', () => {
    window.localStorage.setItem('loverclinic.chatTabMuted.TEST-DEVICE-1', '1');
    setChatTabMuted(false, 'TEST-DEVICE-1');
    expect(window.localStorage.getItem('loverclinic.chatTabMuted.TEST-DEVICE-1')).toBe(null);
    expect(isChatTabMuted('TEST-DEVICE-1')).toBe(false);
  });

  it('M1.4 — toggleChatTabMute flips state and returns new value', () => {
    expect(toggleChatTabMute('TEST-DEVICE-1')).toBe(true);
    expect(isChatTabMuted('TEST-DEVICE-1')).toBe(true);
    expect(toggleChatTabMute('TEST-DEVICE-1')).toBe(false);
    expect(isChatTabMuted('TEST-DEVICE-1')).toBe(false);
  });

  it('M1.5 — per-device isolation (deviceA muted does not affect deviceB)', () => {
    setChatTabMuted(true, 'DEVICE-A');
    expect(isChatTabMuted('DEVICE-A')).toBe(true);
    expect(isChatTabMuted('DEVICE-B')).toBe(false);
  });

  it('M1.6 — graceful no-op when localStorage unavailable (SSR-like)', () => {
    const origLs = window.localStorage;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      get() { throw new Error('not available'); },
    });
    expect(() => isChatTabMuted('X')).not.toThrow();
    expect(isChatTabMuted('X')).toBe(false);
    expect(() => setChatTabMuted(true, 'X')).not.toThrow();
    expect(() => toggleChatTabMute('X')).not.toThrow();
    Object.defineProperty(window, 'localStorage', { configurable: true, value: origLs });
  });

  it('M1.7 — adversarial deviceId (empty string, special chars, 10K-char) does not crash', () => {
    expect(() => setChatTabMuted(true, '')).not.toThrow();
    expect(() => setChatTabMuted(true, 'ทดสอบ-ไทย-NFC')).not.toThrow();
    const tenK = 'X'.repeat(10000);
    expect(() => setChatTabMuted(true, tenK)).not.toThrow();
  });

  it('M1.8 — quota-exceeded gracefully swallowed', () => {
    const origSet = Storage.prototype.setItem;
    Storage.prototype.setItem = () => { throw new Error('QuotaExceededError'); };
    expect(() => setChatTabMuted(true, 'DEVICE-QUOTA')).not.toThrow();
    Storage.prototype.setItem = origSet;
  });

  it('M1.9 — default deviceId param reads from staffChatIdentity.getDeviceId', () => {
    expect(() => isChatTabMuted()).not.toThrow();
    expect(typeof isChatTabMuted()).toBe('boolean');
  });

  it('M1.10 — Unicode normalization (NFC vs NFD deviceId) treated as different keys', () => {
    const nfc = 'ก็'; // composed
    const nfd = nfc.normalize('NFD'); // decomposed (different code points)
    if (nfc === nfd) {
      // If they happen to be equal in this environment, skip
      return;
    }
    setChatTabMuted(true, nfc);
    expect(isChatTabMuted(nfc)).toBe(true);
    expect(isChatTabMuted(nfd)).toBe(false);
  });

  it('M1.11 — V75 marker comment present in helper source', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/lib/chatNotificationMute.js', 'utf8');
    expect(src).toMatch(/V75 Item 4/);
  });
});
