// V73 Task 2 follow-up (2026-05-16) — listenToStaffChatMessages +
// addStaffChatMessage safe-by-default + source-grep regression locks.
//
// Mirrors V54 BS-13 pattern (see tests/v54-listener-safe-by-default.test.js).
//
// Validates:
//   1. Explicit branchId → where('branchId','==',id) clause applied
//   2. allBranches: true → no where-clause (cross-branch read)
//   3. Empty/null branchId + no allBranches → resolveSelectedBranchId fallback;
//      if STILL falsy → onChange([]) + noop unsub (NEVER fall back to whole
//      collection)
//   4. addStaffChatMessage throws on missing id/branchId; returns id on success
//   5. Source-grep regression locks at backendClient.js + scopedDataLayer.js
//
// Spec: docs/superpowers/specs/2026-05-15-staff-chat-design.md

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

// ─── Mock chain capture ─────────────────────────────────────────────────────

let capturedConds = [];
let docsToReturn = [];
let onSnapshotMock = null;
let setDocMock = null;

vi.mock('firebase/firestore', () => ({
  collection: () => ({ __sentinel: 'col' }),
  query: (col, ...conds) => {
    capturedConds = conds.filter((c) => c?.__sentinel === 'where');
    return { __sentinel: 'query', conds };
  },
  where: (field, op, val) => ({ __sentinel: 'where', field, op, val }),
  orderBy: () => ({ __sentinel: 'orderBy' }),
  doc: () => ({ __sentinel: 'doc' }),
  getDoc: async () => ({ exists: () => false }),
  getDocs: async () => ({ docs: [] }),
  setDoc: async (docRef, data) => {
    setDocMock = { docRef, data };
    return undefined;
  },
  updateDoc: async () => {},
  deleteDoc: async () => {},
  writeBatch: () => ({ set: () => {}, update: () => {}, delete: () => {}, commit: async () => {} }),
  runTransaction: async (_db, fn) => fn({ get: async () => ({ exists: () => false }), set: () => {}, update: () => {}, delete: () => {} }),
  serverTimestamp: () => ({ __sentinel: 'serverTimestamp' }),
  limit: () => ({ __sentinel: 'limit' }),
  onSnapshot: (q, next) => {
    onSnapshotMock = { q, next };
    Promise.resolve().then(() => {
      next({ docs: docsToReturn.map((d) => ({ id: d.id, data: () => ({ ...d, id: undefined }) })) });
    });
    return () => { onSnapshotMock = null; };
  },
}));

vi.mock('../src/firebase.js', () => ({
  db: { __sentinel: 'db' },
  auth: { currentUser: null },
  appId: 'test-app',
}));

// Mock branchSelection so we can control resolveSelectedBranchId per-test.
let mockResolvedBranchId = null;
vi.mock('../src/lib/branchSelection.js', () => ({
  STORAGE_KEY: 'selectedBranchId',
  FALLBACK_ID: null,
  resolveSelectedBranchId: () => mockResolvedBranchId,
  setSelectedBranchId: () => {},
  resetBranchSelection: () => {},
}));

// Lazy-import after mocks
import * as bc from '../src/lib/backendClient.js';

const FIXTURES = {
  messages: [
    { id: 'CHAT-1', branchId: 'BR-A', text: 'hello', displayName: 'A', deviceId: 'd1' },
    { id: 'CHAT-2', branchId: 'BR-A', text: 'world', displayName: 'B', deviceId: 'd2' },
  ],
};

beforeEach(() => {
  capturedConds = [];
  docsToReturn = [];
  onSnapshotMock = null;
  setDocMock = null;
  mockResolvedBranchId = null;
});

function condsHaveBranchId(branchId) {
  return capturedConds.some((c) => c.field === 'branchId' && c.val === branchId);
}
function condsHaveNoBranchId() {
  return !capturedConds.some((c) => c.field === 'branchId');
}

// ─── L1 — listenToStaffChatMessages safe-by-default ─────────────────────────

describe('V73.L1 listenToStaffChatMessages safe-by-default (BS-13)', () => {
  it('L1.1 explicit branchId → where("branchId","==",id) clause applied', async () => {
    docsToReturn = FIXTURES.messages;
    const unsub = bc.listenToStaffChatMessages({ branchId: 'BR-A' }, () => {});
    await Promise.resolve();
    expect(condsHaveBranchId('BR-A')).toBe(true);
    expect(typeof unsub).toBe('function');
    unsub();
  });

  it('L1.2 allBranches: true → no where-clause (whole-collection cross-branch)', async () => {
    docsToReturn = FIXTURES.messages;
    const unsub = bc.listenToStaffChatMessages({ branchId: '', allBranches: true }, () => {});
    await Promise.resolve();
    expect(condsHaveNoBranchId()).toBe(true);
    expect(typeof unsub).toBe('function');
    unsub();
  });

  it('L1.3 empty opts + resolveSelectedBranchId returns null → onChange([]) + noop unsub (NO subscription)', async () => {
    mockResolvedBranchId = null;
    docsToReturn = FIXTURES.messages;
    const calls = [];
    const unsub = bc.listenToStaffChatMessages({}, (msgs) => calls.push(msgs));
    expect(calls).toEqual([[]]); // immediate empty fire
    expect(typeof unsub).toBe('function'); // noop unsub
    expect(onSnapshotMock).toBeNull(); // no actual subscription happened
  });

  it('L1.4 empty opts + resolveSelectedBranchId returns "BR-CTX" → where-clause applied with resolved id', async () => {
    mockResolvedBranchId = 'BR-CTX';
    docsToReturn = FIXTURES.messages;
    const unsub = bc.listenToStaffChatMessages({}, () => {});
    await Promise.resolve();
    expect(condsHaveBranchId('BR-CTX')).toBe(true);
    expect(typeof unsub).toBe('function');
    unsub();
  });

  it('L1.4b no opts at all (default {}) + resolveSelectedBranchId returns null → noop', async () => {
    mockResolvedBranchId = null;
    docsToReturn = FIXTURES.messages;
    const calls = [];
    const unsub = bc.listenToStaffChatMessages(undefined, (msgs) => calls.push(msgs));
    expect(calls).toEqual([[]]);
    expect(typeof unsub).toBe('function');
    expect(onSnapshotMock).toBeNull();
  });
});

// ─── L1 (continued) — addStaffChatMessage validation + write ────────────────

describe('V73.L1 addStaffChatMessage (writer)', () => {
  it('L1.5 throws when id missing', async () => {
    await expect(
      bc.addStaffChatMessage({ branchId: 'BR-X', text: 'hi', displayName: 'A', deviceId: 'd' })
    ).rejects.toThrow(/STAFF_CHAT_MISSING_REQUIRED_FIELDS/);
  });

  it('L1.6 throws when branchId missing', async () => {
    await expect(
      bc.addStaffChatMessage({ id: 'CHAT-1', text: 'hi', displayName: 'A', deviceId: 'd' })
    ).rejects.toThrow(/STAFF_CHAT_MISSING_REQUIRED_FIELDS/);
  });

  it('L1.7 returns id on success + calls setDoc with the message doc payload', async () => {
    const messageDoc = {
      id: 'CHAT-V73-OK',
      branchId: 'BR-X',
      text: 'hi',
      displayName: 'A',
      deviceId: 'd1',
    };
    const result = await bc.addStaffChatMessage(messageDoc);
    expect(result).toBe('CHAT-V73-OK');
    expect(setDocMock).toBeTruthy();
    expect(setDocMock.data).toEqual(messageDoc);
  });
});

// ─── L1 — Source-grep BS-13 markers ─────────────────────────────────────────

describe('V73.L1 source-grep BS-13 markers + scopedDataLayer passthrough', () => {
  const BC = readFileSync('src/lib/backendClient.js', 'utf8');
  const SDL = readFileSync('src/lib/scopedDataLayer.js', 'utf8');

  it('L1.8 listenToStaffChatMessages body references resolveSelectedBranchId (BS-13 safe-by-default)', () => {
    // Find the function body — scan up to next `export` to bound the slice.
    const idx = BC.indexOf('export function listenToStaffChatMessages');
    expect(idx).toBeGreaterThan(-1);
    const after = BC.slice(idx);
    const nextExport = after.indexOf('\nexport ', 1); // search past current export keyword
    const body = nextExport > 0 ? after.slice(0, nextExport) : after.slice(0, 2000);
    expect(body).toMatch(/resolveSelectedBranchId/);
    // V73 / BS-13 marker
    expect(BC).toMatch(/V73 Task 2[\s\S]{0,200}BS-13|BS-13[\s\S]{0,400}V73 Task 2/);
  });

  it('L1.9 listener body uses where on branchId field when filtering', () => {
    const idx = BC.indexOf('export function listenToStaffChatMessages');
    const after = BC.slice(idx);
    const nextExport = after.indexOf('\nexport ', 1);
    const body = nextExport > 0 ? after.slice(0, nextExport) : after.slice(0, 2000);
    // The where call uses `branchId` literal + effectiveBranchId
    expect(body).toMatch(/where\([^,)]+,\s*['"]==['"]?,/);
    expect(body).toMatch(/['"]branchId['"]/);
    expect(body).toMatch(/effectiveBranchId/);
  });

  it('L1.10 scopedDataLayer.js re-exports listenToStaffChatMessages + addStaffChatMessage with raw.X passthrough', () => {
    // Both re-exports follow `raw.X(...)` passthrough pattern (Layer 2 wrapper).
    expect(SDL).toMatch(/export\s+const\s+listenToStaffChatMessages\s*=\s*\([^)]*\)\s*=>\s*\n?\s*raw\.listenToStaffChatMessages/);
    expect(SDL).toMatch(/export\s+const\s+addStaffChatMessage\s*=\s*\([^)]*\)\s*=>\s*raw\.addStaffChatMessage/);
  });

  it('L1.11 listenToStaffChatMessages body returns noop function + fires onChange([]) when no branch resolves', () => {
    const idx = BC.indexOf('export function listenToStaffChatMessages');
    const after = BC.slice(idx);
    const nextExport = after.indexOf('\nexport ', 1);
    const body = nextExport > 0 ? after.slice(0, nextExport) : after.slice(0, 2000);
    expect(body).toMatch(/onChange\?\.\(\[\]\)/);
    expect(body).toMatch(/return\s+\(\s*\)\s*=>\s*\{?\s*\}?\s*;?/);
  });

  it('L1.12 addStaffChatMessage body throws STAFF_CHAT_MISSING_REQUIRED_FIELDS on missing id/branchId', () => {
    const idx = BC.indexOf('export async function addStaffChatMessage');
    expect(idx).toBeGreaterThan(-1);
    const after = BC.slice(idx);
    const nextExport = after.indexOf('\nexport ', 1);
    const body = nextExport > 0 ? after.slice(0, nextExport) : after.slice(0, 1500);
    expect(body).toMatch(/messageDoc\.id/);
    expect(body).toMatch(/messageDoc\.branchId/);
    expect(body).toMatch(/STAFF_CHAT_MISSING_REQUIRED_FIELDS/);
  });
});
