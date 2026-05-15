import { describe, it, expect, beforeEach } from 'vitest';
import {
  getDisplayName, setDisplayName,
  getDeviceId,
  getMuted, setMuted,
} from '../src/lib/staffChatIdentity.js';

describe('V73.I1 staffChatIdentity', () => {
  beforeEach(() => localStorage.clear());

  it('I1.1 getDisplayName returns null when unset', () => {
    expect(getDisplayName()).toBe(null);
  });

  it('I1.2 setDisplayName persists across reads + trims whitespace', () => {
    setDisplayName('  ดร.วี  ');
    expect(getDisplayName()).toBe('ดร.วี');
    expect(localStorage.getItem('staffChatName')).toBe('ดร.วี');
  });

  it('I1.3 setDisplayName rejects empty / >50 / <2 chars', () => {
    expect(() => setDisplayName('')).toThrow(/STAFF_CHAT_NAME_INVALID/);
    expect(() => setDisplayName('a')).toThrow(/STAFF_CHAT_NAME_INVALID/);
    expect(() => setDisplayName('x'.repeat(51))).toThrow(/STAFF_CHAT_NAME_INVALID/);
  });

  it('I1.4 getDeviceId returns crypto-random hex 8 chars, persists', () => {
    const a = getDeviceId();
    expect(a).toMatch(/^dev-[a-f0-9]{16}$/);
    const b = getDeviceId();
    expect(b).toBe(a);  // same device, same id
  });

  it('I1.5 getMuted defaults false; setMuted(true) persists as "1"', () => {
    expect(getMuted()).toBe(false);
    setMuted(true);
    expect(getMuted()).toBe(true);
    expect(localStorage.getItem('staffChatMuted')).toBe('1');
  });
});
