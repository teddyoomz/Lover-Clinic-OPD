// V33.4 — Customer LINE-link state machine tests.

import { describe, it, expect } from 'vitest';
import {
  LINK_STATES,
  getLineLinkState,
  formatLineLinkStatusBadge,
  maskLineUserId,
} from '../src/lib/customerLineLinkState.js';

describe('V33.4.A — getLineLinkState', () => {
  it('A1 — null/undefined customer → unlinked', () => {
    expect(getLineLinkState(null)).toBe('unlinked');
    expect(getLineLinkState(undefined)).toBe('unlinked');
    expect(getLineLinkState('not-an-object')).toBe('unlinked');
  });
  it('A2 — no lineUserId → unlinked', () => {
    expect(getLineLinkState({})).toBe('unlinked');
    expect(getLineLinkState({ lineUserId: '' })).toBe('unlinked');
    expect(getLineLinkState({ lineUserId: null })).toBe('unlinked');
  });
  it('A3 — lineUserId + missing status → active (legacy compat)', () => {
    expect(getLineLinkState({ lineUserId: 'Uabc' })).toBe('active');
  });
  it('A4 — lineUserId + lineLinkStatus="active" → active', () => {
    expect(getLineLinkState({ lineUserId: 'Uabc', lineLinkStatus: 'active' })).toBe('active');
  });
  it('A5 — lineUserId + lineLinkStatus="suspended" → suspended', () => {
    expect(getLineLinkState({ lineUserId: 'Uabc', lineLinkStatus: 'suspended' })).toBe('suspended');
  });
  it('A6 — unknown lineLinkStatus value → active (defensive: treat unknown as active)', () => {
    expect(getLineLinkState({ lineUserId: 'Uabc', lineLinkStatus: 'banana' })).toBe('active');
  });
});

describe('V33.4.B — formatLineLinkStatusBadge', () => {
  it('B1 — active → green LINE color', () => {
    const b = formatLineLinkStatusBadge(LINK_STATES.ACTIVE);
    expect(b.label).toBe('ผูกอยู่');
    expect(b.color).toBe('#06C755');
  });
  it('B2 — suspended → amber/yellow', () => {
    const b = formatLineLinkStatusBadge(LINK_STATES.SUSPENDED);
    expect(b.label).toBe('ปิดชั่วคราว');
    expect(b.color).toBe('#f59e0b');
  });
  it('B3 — unlinked → gray', () => {
    const b = formatLineLinkStatusBadge(LINK_STATES.UNLINKED);
    expect(b.label).toBe('ยังไม่ผูก');
    expect(b.color).toBe('#9ca3af');
  });
  it('B4 — unknown value defaults to unlinked badge', () => {
    expect(formatLineLinkStatusBadge('banana').label).toBe('ยังไม่ผูก');
  });
});

describe('V33.4.C — maskLineUserId', () => {
  it('C1 — empty/null → empty string', () => {
    expect(maskLineUserId(null)).toBe('');
    expect(maskLineUserId('')).toBe('');
    expect(maskLineUserId(undefined)).toBe('');
  });
  it('C2 — short string passes through', () => {
    expect(maskLineUserId('abc')).toBe('abc');
    expect(maskLineUserId('Uab12')).toBe('Uab12');
  });
  it('C3 — long lineUserId masks middle showing first char + last 4', () => {
    expect(maskLineUserId('U1234567890abcdef1234567890abcdef')).toBe('U…cdef');
  });
});
