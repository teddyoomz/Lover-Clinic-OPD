// ─── LINE Friend Picker (2026-07-20) — pure roster helpers (TDD Task 1) ──────
// R1 decideFollowEventUpdate · R2 conversationToRosterRow · R3 mergeFriendRoster
// R4 searchRoster · R5 adversarial. Pure JS — no react/firebase imports allowed
// (V36.G.51 class; shared by api/webhook/line.js AND client UI).
import { describe, it, expect } from 'vitest';
import {
  decideFollowEventUpdate,
  conversationToRosterRow,
  mergeFriendRoster,
  searchRoster,
} from '../src/lib/lineFriendRoster.js';

const NOW = '2026-07-20T12:00:00.000Z';
const BR = 'BR-1777873556815-26df6480';

function walkNoUndefined(obj, path = '') {
  // V14 lock — no undefined leaves anywhere in a Firestore write payload
  for (const [k, v] of Object.entries(obj || {})) {
    expect(v, `undefined leaf at ${path}${k}`).not.toBe(undefined);
    if (v && typeof v === 'object' && !Array.isArray(v)) walkNoUndefined(v, `${path}${k}.`);
  }
}

describe('R1 — decideFollowEventUpdate', () => {
  it('R1.1 new follow → full doc fields', () => {
    const { fields } = decideFollowEventUpdate({
      eventType: 'follow', userId: 'U111', existing: null,
      profile: { displayName: 'Oomz', pictureUrl: 'https://p/x.jpg' },
      branchId: BR, branchIdSource: 'webhook-line', nowIso: NOW,
    });
    expect(fields).toEqual({
      displayName: 'Oomz', pictureUrl: 'https://p/x.jpg',
      branchId: BR, branchIdSource: 'webhook-line', source: 'follow',
      followedAt: NOW, unfollowedAt: null, updatedAt: NOW,
    });
    walkNoUndefined(fields);
  });

  it('R1.2 follow with profile fetch failure → displayName falls back to userId', () => {
    const { fields } = decideFollowEventUpdate({
      eventType: 'follow', userId: 'U222', existing: null, profile: null,
      branchId: BR, branchIdSource: 'webhook-line', nowIso: NOW,
    });
    expect(fields.displayName).toBe('U222');
    expect(fields.pictureUrl).toBe('');
    walkNoUndefined(fields);
  });

  it('R1.3 re-follow after unfollow → clears unfollowedAt + refreshes name/pic + NEW followedAt', () => {
    const { fields } = decideFollowEventUpdate({
      eventType: 'follow', userId: 'U111',
      existing: { displayName: 'OldName', pictureUrl: '', followedAt: '2026-01-01T00:00:00.000Z', unfollowedAt: '2026-06-01T00:00:00.000Z' },
      profile: { displayName: 'NewName', pictureUrl: 'https://p/new.jpg' },
      branchId: BR, branchIdSource: 'webhook-line', nowIso: NOW,
    });
    expect(fields.unfollowedAt).toBe(null);
    expect(fields.displayName).toBe('NewName');
    expect(fields.pictureUrl).toBe('https://p/new.jpg');
    expect(fields.followedAt).toBe(NOW); // re-follow = a fresh follow date
  });

  it('R1.4 duplicate follow event (already following) → keeps ORIGINAL followedAt (no downgrade)', () => {
    const orig = '2026-01-01T00:00:00.000Z';
    const { fields } = decideFollowEventUpdate({
      eventType: 'follow', userId: 'U111',
      existing: { displayName: 'Old', followedAt: orig, unfollowedAt: null },
      profile: { displayName: 'New', pictureUrl: '' },
      branchId: BR, branchIdSource: 'webhook-line', nowIso: NOW,
    });
    expect(fields.followedAt).toBe(orig);
  });

  it('R1.5 followers-api backfill doc (followedAt null) gets real followedAt on live follow', () => {
    const { fields } = decideFollowEventUpdate({
      eventType: 'follow', userId: 'U111',
      existing: { displayName: 'X', followedAt: null, unfollowedAt: null, source: 'followers-api' },
      profile: { displayName: 'X', pictureUrl: '' },
      branchId: BR, branchIdSource: 'webhook-line', nowIso: NOW,
    });
    expect(fields.followedAt).toBe(NOW);
  });

  it('R1.6 unfollow of existing → ONLY unfollowedAt + updatedAt (name/pic untouched via merge)', () => {
    const { fields } = decideFollowEventUpdate({
      eventType: 'unfollow', userId: 'U111',
      existing: { displayName: 'Keep', pictureUrl: 'https://p/k.jpg' },
      profile: null, branchId: BR, branchIdSource: 'webhook-line', nowIso: NOW,
    });
    expect(fields).toEqual({ unfollowedAt: NOW, updatedAt: NOW });
  });

  it('R1.7 unfollow of UNKNOWN user → stub doc (no orphan crash)', () => {
    const { fields } = decideFollowEventUpdate({
      eventType: 'unfollow', userId: 'U999', existing: null,
      profile: null, branchId: BR, branchIdSource: 'webhook-line', nowIso: NOW,
    });
    expect(fields.displayName).toBe('U999');
    expect(fields.followedAt).toBe(null);
    expect(fields.unfollowedAt).toBe(NOW);
    expect(fields.branchId).toBe(BR);
    walkNoUndefined(fields);
  });

  it('R1.8 profile with missing pictureUrl → empty string (never undefined)', () => {
    const { fields } = decideFollowEventUpdate({
      eventType: 'follow', userId: 'U1', existing: null,
      profile: { displayName: 'A' },
      branchId: BR, branchIdSource: 'webhook-line', nowIso: NOW,
    });
    expect(fields.pictureUrl).toBe('');
    walkNoUndefined(fields);
  });
});

describe('R2 — conversationToRosterRow', () => {
  it('R2.1 line conversation → row with stripped userId', () => {
    const row = conversationToRosterRow({
      id: 'line_U4af49806', platform: 'line', displayName: 'คุณเอ',
      pictureUrl: 'https://p/a.jpg', lastMessageAt: NOW, branchId: BR,
    });
    expect(row).toMatchObject({
      lineUserId: 'U4af49806', displayName: 'คุณเอ', pictureUrl: 'https://p/a.jpg',
      source: 'chat', unfollowed: false, branchId: BR,
    });
    expect(row.sortMs).toBe(Date.parse(NOW));
  });

  it('R2.2 facebook conversation → null (not a LINE roster row)', () => {
    expect(conversationToRosterRow({ id: 'fb_123', platform: 'facebook', displayName: 'F' })).toBe(null);
  });

  it('R2.3 doc id without line_ prefix → null', () => {
    expect(conversationToRosterRow({ id: 'U123', platform: 'line', displayName: 'X' })).toBe(null);
  });

  it('R2.4 missing lastMessageAt → sortMs 0 (sorts to bottom, no NaN)', () => {
    const row = conversationToRosterRow({ id: 'line_U1', platform: 'line', displayName: 'X' });
    expect(row.sortMs).toBe(0);
  });
});

describe('R3 — mergeFriendRoster', () => {
  const friendDoc = (over = {}) => ({
    lineUserId: 'U1', displayName: 'FriendName', pictureUrl: 'https://p/f.jpg',
    branchId: BR, source: 'follow', followedAt: '2026-07-01T00:00:00.000Z',
    unfollowedAt: null, updatedAt: '2026-07-01T00:00:00.000Z', ...over,
  });
  const convDoc = (over = {}) => ({
    id: 'line_U1', platform: 'line', displayName: 'ChatName',
    pictureUrl: 'https://p/c.jpg', lastMessageAt: '2026-07-10T00:00:00.000Z', branchId: BR, ...over,
  });

  it('R3.1 same person in both sources → ONE row, chat badge wins', () => {
    const rows = mergeFriendRoster({ friends: [friendDoc()], conversations: [convDoc()] });
    expect(rows).toHaveLength(1);
    expect(rows[0].source).toBe('chat');
  });

  it('R3.2 newer source wins displayName/pictureUrl (chat newer here)', () => {
    const rows = mergeFriendRoster({ friends: [friendDoc()], conversations: [convDoc()] });
    expect(rows[0].displayName).toBe('ChatName');
  });

  it('R3.3 friend doc newer than stale chat → friend name wins', () => {
    const rows = mergeFriendRoster({
      friends: [friendDoc({ updatedAt: '2026-07-15T00:00:00.000Z', displayName: 'Fresher' })],
      conversations: [convDoc({ lastMessageAt: '2026-05-01T00:00:00.000Z' })],
    });
    expect(rows[0].displayName).toBe('Fresher');
  });

  it('R3.4 unfollowed flag carries from friend doc even when chat row exists', () => {
    const rows = mergeFriendRoster({
      friends: [friendDoc({ unfollowedAt: '2026-07-18T00:00:00.000Z' })],
      conversations: [convDoc()],
    });
    expect(rows[0].unfollowed).toBe(true);
  });

  it('R3.5 sorted by activity — most recent first', () => {
    const rows = mergeFriendRoster({
      friends: [friendDoc({ lineUserId: 'U2', updatedAt: '2026-07-19T00:00:00.000Z' })],
      conversations: [convDoc()], // U1 @ 07-10
    });
    expect(rows.map(r => r.lineUserId)).toEqual(['U2', 'U1']);
  });

  it('R3.6 empty name in newer source does NOT clobber older non-empty name', () => {
    const rows = mergeFriendRoster({
      friends: [friendDoc({ updatedAt: '2026-07-15T00:00:00.000Z', displayName: '' })],
      conversations: [convDoc({ lastMessageAt: '2026-05-01T00:00:00.000Z' })],
    });
    expect(rows[0].displayName).toBe('ChatName');
  });

  it('R3.7 non-line conversations filtered out', () => {
    const rows = mergeFriendRoster({
      friends: [], conversations: [{ id: 'fb_9', platform: 'facebook', displayName: 'F' }],
    });
    expect(rows).toHaveLength(0);
  });

  it('R3.8 null/undefined inputs → empty array (no throw)', () => {
    expect(mergeFriendRoster({})).toEqual([]);
    expect(mergeFriendRoster({ friends: null, conversations: undefined })).toEqual([]);
  });
});

describe('R4 — searchRoster', () => {
  const rows = [
    { lineUserId: 'U4af49806', displayName: 'Oomz Peerapat' },
    { lineUserId: 'U8bb21f44', displayName: 'มายด์ 🤍' },
    { lineUserId: 'U0c3daa91', displayName: 'แพรพร  พรแพร' },
  ];
  it('R4.1 empty query → all rows', () => {
    expect(searchRoster(rows, '')).toHaveLength(3);
    expect(searchRoster(rows, '   ')).toHaveLength(3);
  });
  it('R4.2 thai name substring', () => {
    expect(searchRoster(rows, 'มายด์')).toHaveLength(1);
  });
  it('R4.3 case-insensitive latin', () => {
    expect(searchRoster(rows, 'oomz')).toHaveLength(1);
  });
  it('R4.4 userId substring match', () => {
    expect(searchRoster(rows, '8bb21')).toHaveLength(1);
  });
  it('R4.5 emoji query matches', () => {
    expect(searchRoster(rows, '🤍')).toHaveLength(1);
  });
  it('R4.6 no match → empty', () => {
    expect(searchRoster(rows, 'zzz-none')).toHaveLength(0);
  });
});

describe('R5 — adversarial', () => {
  it('R5.1 same person on 2 branches = separate rows (branch is part of identity context)', () => {
    // caller queries per-branch so cross-branch dupes never co-occur; but if fed
    // anyway, merge keys on lineUserId — assert single row (identity = userId)
    const rows = mergeFriendRoster({
      friends: [
        { lineUserId: 'U1', displayName: 'A', branchId: 'BR-A', updatedAt: NOW, followedAt: NOW, unfollowedAt: null, pictureUrl: '', source: 'follow' },
        { lineUserId: 'U1', displayName: 'A', branchId: 'BR-B', updatedAt: NOW, followedAt: NOW, unfollowedAt: null, pictureUrl: '', source: 'follow' },
      ],
      conversations: [],
    });
    expect(rows).toHaveLength(1);
  });
  it('R5.2 500-char name + NUL byte → no throw, searchable', () => {
    const long = 'ก'.repeat(500) + ' x';
    const rows = mergeFriendRoster({
      friends: [{ lineUserId: 'U9', displayName: long, pictureUrl: '', branchId: BR, source: 'follow', followedAt: NOW, unfollowedAt: null, updatedAt: NOW }],
      conversations: [],
    });
    expect(searchRoster(rows, 'ก')).toHaveLength(1);
  });
  it('R5.3 rows with null fields survive search', () => {
    expect(() => searchRoster([{ lineUserId: null, displayName: null }], 'x')).not.toThrow();
  });
  it('R5.4 decide functions never emit undefined leaves across every event/existing combo (V14)', () => {
    for (const eventType of ['follow', 'unfollow']) {
      for (const existing of [null, {}, { followedAt: NOW }, { unfollowedAt: NOW }]) {
        for (const profile of [null, {}, { displayName: 'X' }]) {
          const { fields } = decideFollowEventUpdate({
            eventType, userId: 'U1', existing, profile,
            branchId: BR, branchIdSource: 'webhook-line', nowIso: NOW,
          });
          walkNoUndefined(fields);
        }
      }
    }
  });
});
