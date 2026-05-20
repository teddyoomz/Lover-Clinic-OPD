import { describe, it, expect } from 'vitest';
import { shouldReap, SESSION_MAX_AGE_MS } from '../src/lib/chartEditSessionCore.js';

describe('shouldReap (T10 orphan sweep)', () => {
  const now = 10_000_000;
  it('SW1 active w/ fresh heartbeats → keep', () => expect(shouldReap({ status: 'active', pcHeartbeatAt: now - 1000, tabletHeartbeatAt: now - 1000, createdAt: now - 2000 }, now)).toBe(false));
  it('SW2 active w/ stale tablet heartbeat → reap', () => expect(shouldReap({ status: 'active', pcHeartbeatAt: now - 1000, tabletHeartbeatAt: now - 60000, createdAt: now - 70000 }, now)).toBe(true));
  it('SW3 requested but pc gone → reap', () => expect(shouldReap({ status: 'requested', pcHeartbeatAt: now - 60000, createdAt: now - 60000 }, now)).toBe(true));
  it('SW4 saved + older than max age → GC', () => expect(shouldReap({ status: 'saved', updatedAt: now - SESSION_MAX_AGE_MS - 1 }, now)).toBe(true));
  it('SW5 saved + recent → keep (not yet GC age)', () => expect(shouldReap({ status: 'saved', updatedAt: now - 1000 }, now)).toBe(false));
  it('SW6 requested + fresh pc, no tablet yet → keep', () => expect(shouldReap({ status: 'requested', pcHeartbeatAt: now - 1000, createdAt: now - 1000 }, now)).toBe(false));
  it('SW7 null session → false', () => expect(shouldReap(null, now)).toBe(false));
});
