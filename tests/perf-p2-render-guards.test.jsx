// perf P2 (2026-07-06) — behavioral locks for the render-storm equality guards.
// P2.13: useChatUnread must NOT commit state (→ no AdminDashboard re-render)
// when a snapshot fire leaves the 4 badge numbers unchanged.
// P2.14: admin_presence setOnlineAdmins commits only on id|email membership change
// (inline in the 8.6k-line AdminDashboard → source-grep lock).
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { readFileSync } from 'node:fs';

// ── mocks: everything ChatPanel.jsx pulls in except the pure count/branch libs ──
let capturedSnapshotCb = null;
let onSnapshotCalls = 0;
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  doc: vi.fn(() => ({})),
  setDoc: vi.fn(),
  onSnapshot: vi.fn((ref, cb) => { capturedSnapshotCb = cb; onSnapshotCalls++; return () => {}; }),
  query: vi.fn(),
  orderBy: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDocs: vi.fn(),
  addDoc: vi.fn(),
  limit: vi.fn(),
}));
vi.mock('firebase/auth', () => ({ getAuth: vi.fn(() => ({})) }));
vi.mock('../src/firebase.js', () => ({ app: {}, db: {}, appId: 'test-app' }));
vi.mock('../src/lib/BranchContext.jsx', () => ({
  useSelectedBranch: vi.fn(() => ({ branchId: '', branches: [] })),
  useEffectiveClinicSettings: vi.fn(() => ({})),
}));
vi.mock('../src/lib/scopedDataLayer.js', () => ({
  listenToChatConversationsByBranch: vi.fn(() => () => {}),
  listenToChatHistoryByBranch: vi.fn(() => () => {}),
}));
vi.mock('../src/lib/lineConfigClient.js', () => ({ listenToLineConfig: vi.fn(() => () => {}) }));
vi.mock('../src/lib/fbConfigClient.js', () => ({ listenToFbConfig: vi.fn(() => () => {}) }));
// chatUnreadUtils + chatBranchDefaults stay REAL (pure logic under test)

import { useChatUnread } from '../src/components/ChatPanel.jsx';

const snap = (docs) => ({ docs: docs.map((d) => ({ id: d.id, data: () => { const { id, ...rest } = d; return rest; } })) });
// stable db identity — the real caller passes the module-singleton Firestore db;
// an inline {} would re-create per render and falsely re-trigger the subscribe effect
const DB = {};

describe('P2.13 — useChatUnread equality guard (no re-render on irrelevant snapshot)', () => {
  beforeEach(() => { capturedSnapshotCb = null; onSnapshotCalls = 0; });

  it('derives counts, and an irrelevant field change keeps the SAME state object (React bails out)', () => {
    const { result } = renderHook(() => useChatUnread(DB, 'test-app', 'BR-1'));
    expect(capturedSnapshotCb).toBeTypeOf('function');

    act(() => capturedSnapshotCb(snap([
      { id: 'c1', platform: 'line', unreadCount: 2, branchId: 'BR-1', lastMessage: 'hi' },
      { id: 'c2', platform: 'facebook', unreadCount: 0, branchId: 'BR-1', lastMessage: 'yo' },
    ])));
    const first = result.current;
    expect(first.lineUnread).toBe(1);      // 1 line PERSON with unread
    expect(first.totalUnread).toBe(1);
    expect(first.totalConversations).toBe(2);

    // same counts, different lastMessage → NO state commit → identical reference
    act(() => capturedSnapshotCb(snap([
      { id: 'c1', platform: 'line', unreadCount: 2, branchId: 'BR-1', lastMessage: 'CHANGED' },
      { id: 'c2', platform: 'facebook', unreadCount: 0, branchId: 'BR-1', lastMessage: 'CHANGED TOO' },
    ])));
    expect(result.current).toBe(first);

    // a badge number actually changes → new state
    act(() => capturedSnapshotCb(snap([
      { id: 'c1', platform: 'line', unreadCount: 0, branchId: 'BR-1' },
      { id: 'c2', platform: 'facebook', unreadCount: 3, branchId: 'BR-1' },
    ])));
    expect(result.current).not.toBe(first);
    expect(result.current.fbUnread).toBe(1);
    expect(result.current.lineUnread).toBe(0);
  });

  it('branch switch recomputes WITHOUT resubscribing (V78 contract preserved)', () => {
    const { result, rerender } = renderHook(({ b }) => useChatUnread(DB, 'test-app', b), { initialProps: { b: 'BR-1' } });
    act(() => capturedSnapshotCb(snap([
      { id: 'c1', platform: 'line', unreadCount: 1, branchId: 'BR-1' },
      { id: 'c2', platform: 'line', unreadCount: 1, branchId: 'BR-2' },
    ])));
    expect(result.current.totalConversations).toBe(1);
    const before = onSnapshotCalls;
    rerender({ b: 'BR-2' });
    expect(result.current.totalConversations).toBe(1);
    expect(result.current.totalUnread).toBe(1);
    expect(onSnapshotCalls).toBe(before);   // no resubscribe on branch switch
  });

  it('V80 NAKHON-gated fall-through preserved: unstamped conv counts ONLY for the NAKHON branch', () => {
    const { result, rerender } = renderHook(({ b }) => useChatUnread(DB, 'test-app', b), { initialProps: { b: 'BR-1777873556815-26df6480' } });
    act(() => capturedSnapshotCb(snap([{ id: 'legacy', platform: 'line', unreadCount: 5 }])));  // no branchId
    expect(result.current.totalUnread).toBe(1);           // NAKHON sees legacy
    rerender({ b: 'BR-other' });
    expect(result.current.totalUnread).toBe(0);           // other branch does NOT
    expect(result.current.totalConversations).toBe(0);
  });
});

describe('P2.14 — admin_presence equality guard (source-grep lock, inline in AdminDashboard)', () => {
  it('setOnlineAdmins commits through an id|email signature comparison', () => {
    const src = readFileSync('src/pages/AdminDashboard.jsx', 'utf8');
    expect(src).toMatch(/perf P2\.14/);
    expect(src).toMatch(/setOnlineAdmins\(prev => \{/);
    expect(src).toMatch(/sig\(prev\) === sig\(active\) \? prev : active/);
    // anti-regression: no bare unconditional setOnlineAdmins(active)
    expect(src).not.toMatch(/setOnlineAdmins\(active\)/);
  });
});
