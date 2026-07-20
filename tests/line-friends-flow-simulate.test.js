// ─── LINE Friend Picker (2026-07-20) — Rule I full-flow simulate (Task 9) ────
// Chains the REAL helpers end-to-end (no mocks of our own code): follow event
// → doc fields → roster merge → search → pick → bind payload shape → customer
// update shape (dotted-path parity with link-requests handleApprove). F1-F6.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  decideFollowEventUpdate,
  conversationToRosterRow,
  mergeFriendRoster,
  searchRoster,
} from '../src/lib/lineFriendRoster.js';
import {
  svcCompletedMs,
  sortApptsByServiceCompletedDesc,
  applyTabFilter,
} from '../src/lib/appointmentHubFilters.js';

const NOW = '2026-07-20T12:00:00.000Z';
const BR = 'BR-1777873556815-26df6480';

function walkNoUndefined(obj, path = '') {
  for (const [k, v] of Object.entries(obj || {})) {
    expect(v, `undefined leaf at ${path}${k}`).not.toBe(undefined);
    if (v && typeof v === 'object' && !Array.isArray(v)) walkNoUndefined(v, `${path}${k}.`);
  }
}

// Pure mirror of the webhook write (api/webhook/line.js follow branch):
// ref.set({ lineUserId, ...fields }, { merge: true }) on `${branchId}_${userId}`
function simulateFollowWrite(store, { eventType, userId, profile, branchId, nowIso }) {
  const docId = `${branchId}_${userId}`;
  const existing = store.get(docId) || null;
  const { fields } = decideFollowEventUpdate({
    eventType, userId, existing, profile,
    branchId, branchIdSource: 'webhook-line', nowIso,
  });
  store.set(docId, { ...(existing || {}), lineUserId: userId, ...fields });
  return store.get(docId);
}

// Pure mirror of api/admin/line-friends handleBind's customerUpdate shape
// (locked against the real source in F5.2)
function buildBindCustomerUpdate({ lineUserId, branchId, displayName, nowIso }) {
  const update = { lineUserId, lineLinkedAt: nowIso };
  if (displayName) update.lineDisplayName = displayName;
  if (branchId) {
    update[`lineUserId_byBranch.${branchId}`] = {
      lineUserId, lineDisplayName: displayName, linkedAt: nowIso,
      _lineStale: false, _lineStaleAt: null,
    };
  }
  return update;
}

describe('F1 — แอดเพื่อน chain: follow → doc → merge → search → pick → bind payload', () => {
  it('F1.1 whole chain with real helpers', () => {
    const store = new Map();
    // 1. follow event hits the webhook
    const doc = simulateFollowWrite(store, {
      eventType: 'follow', userId: 'U-flow1',
      profile: { displayName: 'ลูกค้าหน้างาน', pictureUrl: 'https://p/f.jpg' },
      branchId: BR, nowIso: NOW,
    });
    walkNoUndefined(doc);
    // 2. listener emits → merge (V38 spread-shape: {...data, id})
    const rows = mergeFriendRoster({ friends: [{ ...doc, id: `${BR}_U-flow1` }], conversations: [] });
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('follow');
    // 3. admin searches + picks
    const hit = searchRoster(rows, 'หน้างาน');
    expect(hit).toHaveLength(1);
    // 4. bind payload → customer update shape
    const update = buildBindCustomerUpdate({
      lineUserId: hit[0].lineUserId, branchId: BR, displayName: hit[0].displayName, nowIso: NOW,
    });
    expect(update.lineUserId).toBe('U-flow1');
    expect(update[`lineUserId_byBranch.${BR}`]).toMatchObject({ lineUserId: 'U-flow1', _lineStale: false });
    walkNoUndefined(update);
  });
});

describe('F2 — ทักแชท chain: conv doc → roster row → dedupe with friend doc', () => {
  it('F2.1 same person add+chat = ONE row, chat badge, freshest name', () => {
    const store = new Map();
    simulateFollowWrite(store, {
      eventType: 'follow', userId: 'U-both',
      profile: { displayName: 'ชื่อตอนแอด', pictureUrl: '' }, branchId: BR, nowIso: '2026-07-20T10:00:00.000Z',
    });
    // Later they chat — the webhook conversation doc (client listener shape)
    const conv = {
      id: 'line_U-both', platform: 'line', displayName: 'ชื่อตอนแชท',
      pictureUrl: 'https://p/chat.jpg', branchId: BR, lastMessageAt: '2026-07-20T11:30:00.000Z',
    };
    const rows = mergeFriendRoster({
      friends: [{ ...store.get(`${BR}_U-both`), id: `${BR}_U-both` }],
      conversations: [conv],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('chat');
    expect(rows[0].displayName).toBe('ชื่อตอนแชท'); // fresher wins
  });
});

describe('F3 — re-follow lifecycle', () => {
  it('F3.1 follow → unfollow → follow: doc converges to live + fresh name', () => {
    const store = new Map();
    simulateFollowWrite(store, { eventType: 'follow', userId: 'U-re', profile: { displayName: 'A' }, branchId: BR, nowIso: '2026-07-01T00:00:00.000Z' });
    simulateFollowWrite(store, { eventType: 'unfollow', userId: 'U-re', profile: null, branchId: BR, nowIso: '2026-07-05T00:00:00.000Z' });
    const mid = store.get(`${BR}_U-re`);
    expect(mid.unfollowedAt).toBe('2026-07-05T00:00:00.000Z');
    expect(mid.displayName).toBe('A'); // merge preserved
    const fin = simulateFollowWrite(store, { eventType: 'follow', userId: 'U-re', profile: { displayName: 'A ใหม่' }, branchId: BR, nowIso: NOW });
    expect(fin.unfollowedAt).toBe(null);
    expect(fin.displayName).toBe('A ใหม่');
    expect(fin.followedAt).toBe(NOW);
    const rows = mergeFriendRoster({ friends: [fin], conversations: [] });
    expect(rows[0].unfollowed).toBe(false);
  });
});

describe('F4 — adversarial', () => {
  it('F4.1 same person on 2 branches = separate docs, per-branch pickers isolated', () => {
    const store = new Map();
    simulateFollowWrite(store, { eventType: 'follow', userId: 'U-x', profile: { displayName: 'X' }, branchId: 'BR-A', nowIso: NOW });
    simulateFollowWrite(store, { eventType: 'follow', userId: 'U-x', profile: { displayName: 'X' }, branchId: 'BR-B', nowIso: NOW });
    expect(store.size).toBe(2); // distinct docs per branch
    // Per-branch listener only feeds its own docs
    const brA = [...store.values()].filter(d => d.branchId === 'BR-A');
    expect(mergeFriendRoster({ friends: brA, conversations: [] })).toHaveLength(1);
  });
  it('F4.2 profile fetch failed at follow → userId fallback, still searchable + bindable', () => {
    const store = new Map();
    const doc = simulateFollowWrite(store, { eventType: 'follow', userId: 'U-nofetch', profile: null, branchId: BR, nowIso: NOW });
    expect(doc.displayName).toBe('U-nofetch');
    const rows = mergeFriendRoster({ friends: [doc], conversations: [] });
    expect(searchRoster(rows, 'nofetch')).toHaveLength(1);
    const update = buildBindCustomerUpdate({ lineUserId: 'U-nofetch', branchId: BR, displayName: doc.displayName, nowIso: NOW });
    walkNoUndefined(update);
  });
  it('F4.3 Thai + emoji names survive the whole chain', () => {
    const store = new Map();
    const doc = simulateFollowWrite(store, {
      eventType: 'follow', userId: 'U-emoji',
      profile: { displayName: 'มายด์ 🤍✨' }, branchId: BR, nowIso: NOW,
    });
    const rows = mergeFriendRoster({ friends: [doc], conversations: [] });
    expect(searchRoster(rows, '🤍')).toHaveLength(1);
  });
});

describe('F5 — write-shape parity locks (source-grep against REAL endpoint/webhook)', () => {
  it('F5.1 webhook write shape = { lineUserId, ...fields } merge:true (mirror fidelity)', () => {
    const src = readFileSync('api/webhook/line.js', 'utf8');
    expect(src).toMatch(/ref\.set\(\{ lineUserId: userId, \.\.\.fields \}, \{ merge: true \}\)/);
  });
  it('F5.2 endpoint bind customerUpdate shape matches the simulate mirror (dotted-path + stale flags)', () => {
    const src = readFileSync('api/admin/line-friends.js', 'utf8');
    expect(src).toMatch(/lineUserId_byBranch\.\$\{bid\}/);
    expect(src).toMatch(/_lineStale: false/);
    expect(src).toMatch(/_lineStaleAt: null/);
    expect(src).toMatch(/lineLinkedAt: now/);
    // collision guard identical to link-requests handleApprove
    expect(src).toMatch(/\.where\('lineUserId', '==', uid\)/);
    expect(src).toMatch(/\.limit\(2\)/);
    expect(src).toMatch(/ถูกผูกกับลูกค้าอื่นแล้ว/);
  });
  it('F5.3 link-requests handleApprove untouched (old flow intact)', () => {
    const src = readFileSync('api/admin/link-requests.js', 'utf8');
    expect(src).toMatch(/async function handleApprove/);
    expect(src).toMatch(/lineUserId_byBranch\.\$\{reqBranchIdRaw\}/);
  });
});

describe('F6 — done-sort chain (Feature ② — real filter + real comparator)', () => {
  it('F6.1 mark-complete stamps flow into the completed pill sorted newest-first', () => {
    const today = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const iso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    const mk = (id, startTime, completedIso) => ({
      id, date: iso, startTime, status: 'confirmed',
      serviceCompletedAt: completedIso ? { toMillis: () => Date.parse(completedIso) } : null,
    });
    // B กดเสร็จก่อน → A → C (คนกดล่าสุด = C)
    const appts = [
      mk('A', '09:00', '2026-07-20T07:02:00.000Z'),
      mk('B', '10:30', '2026-07-20T04:15:00.000Z'),
      mk('C', '13:00', '2026-07-20T07:40:00.000Z'),
      mk('W', '08:00', null), // ยังรอ — ห้ามโผล่ใน completed
    ];
    const completed = applyTabFilter(appts, { tab: 'today', now: today, todaySubPill: 'completed' });
    const sorted = sortApptsByServiceCompletedDesc(completed);
    expect(sorted.map(a => a.id)).toEqual(['C', 'A', 'B']);
    // กลับคิวรอ (un-mark C) → C หายจาก pill; ลำดับที่เหลือถูก
    const afterUnmark = appts.map(a => (a.id === 'C' ? { ...a, serviceCompletedAt: null } : a));
    const completed2 = applyTabFilter(afterUnmark, { tab: 'today', now: today, todaySubPill: 'completed' });
    expect(sortApptsByServiceCompletedDesc(completed2).map(a => a.id)).toEqual(['A', 'B']);
    // waiting pill untouched by the comparator (uses default path)
    const waiting = applyTabFilter(afterUnmark, { tab: 'today', now: today, todaySubPill: 'waiting' });
    expect(waiting.map(a => a.id).sort()).toEqual(['C', 'W']);
  });
  it('F6.2 optimistic Date stamp (HubView) sorts consistently with server Timestamp', () => {
    const a = { id: 'srv', serviceCompletedAt: { toMillis: () => Date.parse('2026-07-20T07:00:00.000Z') } };
    const b = { id: 'opt', serviceCompletedAt: new Date('2026-07-20T07:30:00.000Z') }; // optimistic
    expect(sortApptsByServiceCompletedDesc([a, b]).map(x => x.id)).toEqual(['opt', 'srv']);
    expect(svcCompletedMs(b.serviceCompletedAt)).toBeGreaterThan(svcCompletedMs(a.serviceCompletedAt));
  });
});
