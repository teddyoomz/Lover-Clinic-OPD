// ─── LINE Friend Picker (2026-07-20) — /api/admin/line-friends (Task 6) ──────
// E1 followers 403 graceful · E2 pagination+backfill · E3 module-cache 60s ·
// E4 bind collision zero-write · E5 bind happy (batch shape mirrors
// link-requests handleApprove + audit doc + best-effort push) · E6 auth gate ·
// E7 bind missing customer. Mock layer mirrors v75-fb-test-endpoint.test.js.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockVerifyAdminToken = vi.fn();
const mockResolveLineConfigForAdmin = vi.fn();
const mockApiFetch = vi.fn();

vi.mock('../api/admin/_lib/adminAuth.js', () => ({ verifyAdminToken: mockVerifyAdminToken }));
vi.mock('../api/admin/_lib/lineConfigAdmin.js', () => ({ resolveLineConfigForAdmin: mockResolveLineConfigForAdmin }));
vi.mock('../api/_lib/apiFetch.js', () => ({ apiFetch: mockApiFetch }));
vi.mock('firebase-admin/app', () => ({
  initializeApp: vi.fn(() => ({})),
  cert: vi.fn(() => ({})),
  getApps: vi.fn(() => [{}]),
  getApp: vi.fn(() => ({})),
}));
const dbState = { docs: new Map(), collections: new Map(), batchOps: [], committed: 0 };
function fakeDb() {
  return {
    doc: (path) => ({
      get: async () => {
        const data = dbState.docs.get(path);
        return { exists: !!data, data: () => data, id: path.split('/').pop() };
      },
      set: async (data, opts) => { dbState.docs.set(path, { ...(opts?.merge ? dbState.docs.get(path) : {}), ...data }); },
      update: async (data) => { dbState.docs.set(path, { ...(dbState.docs.get(path) || {}), ...data }); },
    }),
    collection: (path) => {
      const rows = dbState.collections.get(path) || [];
      const makeQuery = (filtered) => ({
        where: (field, _op, value) => makeQuery(filtered.filter(r => r.data[field] === value)),
        limit: (n) => makeQuery(filtered.slice(0, n)),
        get: async () => ({ docs: filtered.map(r => ({ id: r.id, data: () => r.data })) }),
      });
      return makeQuery(rows);
    },
    batch: () => ({
      update: (ref, data) => dbState.batchOps.push({ op: 'update', data }),
      set: (ref, data) => dbState.batchOps.push({ op: 'set', data }),
      commit: async () => { dbState.committed++; },
    }),
  };
}
vi.mock('firebase-admin/firestore', () => ({ getFirestore: vi.fn(() => fakeDb()) }));

const APP = 'loverclinic-opd-4c39b';
function makeRes() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() };
}
const admin = { uid: 'admin-1', email: 'a@b.c', isAdmin: true };

beforeEach(() => {
  vi.clearAllMocks();
  dbState.docs = new Map();
  dbState.collections = new Map();
  dbState.batchOps = [];
  dbState.committed = 0;
  mockVerifyAdminToken.mockResolvedValue(admin);
  mockResolveLineConfigForAdmin.mockResolvedValue({ config: { channelAccessToken: 'tok-x' } });
});

async function loadHandler() {
  const { default: handler } = await import('../api/admin/line-friends.js');
  return handler;
}

describe('E6 — auth gate', () => {
  it('E6.1 verifyAdminToken null → no processing (parity with link-requests)', async () => {
    mockVerifyAdminToken.mockImplementationOnce(async (_req, res) => {
      res.status(401).json({ error: 'Unauthorized' });
      return null;
    });
    const handler = await loadHandler();
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, body: { action: 'list', branchId: 'BR-auth' } }, res);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
  it('E6.2 non-POST → 405', async () => {
    const handler = await loadHandler();
    const res = makeRes();
    await handler({ method: 'GET', headers: {}, body: {} }, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });
});

describe('E1 — list: followers API unavailable (unverified OA)', () => {
  it('E1.1 403 from followers/ids → followersApi unavailable, NO throw, zero backfill', async () => {
    mockApiFetch.mockResolvedValueOnce({ ok: false, status: 403, json: async () => ({}) });
    const handler = await loadHandler();
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, body: { action: 'list', branchId: 'BR-e1' } }, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ followersApi: 'unavailable', backfilled: 0 }));
  });
  it('E1.2 no token for branch → unavailable (no LINE call)', async () => {
    mockResolveLineConfigForAdmin.mockResolvedValueOnce({ config: {} });
    const handler = await loadHandler();
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, body: { action: 'list', branchId: 'BR-e1b' } }, res);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ followersApi: 'unavailable' }));
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

describe('E2 — list: pagination + unknown-only profile resolve + backfill write', () => {
  it('E2.1 paginates via next token, resolves ONLY unknown ids, writes source=followers-api docs', async () => {
    const BR = 'BR-e2';
    // known: U-known has a friend doc; U-chat has a line_ conversation
    dbState.collections.set(`artifacts/${APP}/public/data/be_line_friends`, [
      { id: `${BR}_U-known`, data: { lineUserId: 'U-known', branchId: BR } },
    ]);
    dbState.collections.set(`artifacts/${APP}/public/data/chat_conversations`, [
      { id: 'line_U-chat', data: { branchId: BR, platform: 'line' } },
    ]);
    mockApiFetch
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ userIds: ['U-known', 'U-chat'], next: 'page2' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ userIds: ['U-new'] }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ displayName: 'NewGuy', pictureUrl: 'https://p/n.jpg' }) });
    const handler = await loadHandler();
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, body: { action: 'list', branchId: BR } }, res);

    const followerCalls = mockApiFetch.mock.calls.filter(c => String(c[0]).includes('/followers/ids'));
    expect(followerCalls).toHaveLength(2);
    expect(String(followerCalls[1][0])).toContain('start=page2');
    const profileCalls = mockApiFetch.mock.calls.filter(c => String(c[0]).includes('/profile/'));
    expect(profileCalls).toHaveLength(1); // U-new only — known/chat skipped
    const doc = dbState.docs.get(`artifacts/${APP}/public/data/be_line_friends/${BR}_U-new`);
    expect(doc).toMatchObject({
      lineUserId: 'U-new', displayName: 'NewGuy', pictureUrl: 'https://p/n.jpg',
      branchId: BR, source: 'followers-api', followedAt: null, unfollowedAt: null,
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      followersApi: 'ok', totalFollowers: 3, backfilled: 1,
    }));
  });
});

describe('E3 — list: module cache 60s per branch', () => {
  it('E3.1 second call within TTL → zero LINE calls + cached flag', async () => {
    const BR = 'BR-e3';
    mockApiFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({ userIds: [] }) });
    const handler = await loadHandler();
    const res1 = makeRes();
    await handler({ method: 'POST', headers: {}, body: { action: 'list', branchId: BR } }, res1);
    const callsAfterFirst = mockApiFetch.mock.calls.length;
    const res2 = makeRes();
    await handler({ method: 'POST', headers: {}, body: { action: 'list', branchId: BR } }, res2);
    expect(mockApiFetch.mock.calls.length).toBe(callsAfterFirst); // no new LINE traffic
    expect(res2.json).toHaveBeenCalledWith(expect.objectContaining({ cached: true }));
  });
});

describe('E4/E7 — bind guards', () => {
  it('E4.1 lineUserId already bound to ANOTHER customer → Thai error + zero writes', async () => {
    dbState.docs.set(`artifacts/${APP}/public/data/be_customers/CUST-A`, { customerName: 'A' });
    dbState.collections.set(`artifacts/${APP}/public/data/be_customers`, [
      { id: 'CUST-B', data: { lineUserId: 'U-taken' } },
    ]);
    const handler = await loadHandler();
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, body: { action: 'bind', customerId: 'CUST-A', lineUserId: 'U-taken', branchId: 'BR-x' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringContaining('ถูกผูกกับลูกค้าอื่น') }));
    expect(dbState.committed).toBe(0);
  });
  it('E7.1 customer missing → Thai error + zero writes', async () => {
    const handler = await loadHandler();
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, body: { action: 'bind', customerId: 'NOPE', lineUserId: 'U-1', branchId: 'BR-x' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(dbState.committed).toBe(0);
  });
  it('E7.2 missing params → error', async () => {
    const handler = await loadHandler();
    const res = makeRes();
    await handler({ method: 'POST', headers: {}, body: { action: 'bind', customerId: '', lineUserId: '' } }, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });
});

describe('E5 — bind happy path (mirror handleApprove shape)', () => {
  it('E5.1 batch: customer update w/ dotted byBranch + audit doc + push best-effort', async () => {
    dbState.docs.set(`artifacts/${APP}/public/data/be_customers/CUST-A`, { customerName: 'คุณเอ' });
    dbState.collections.set(`artifacts/${APP}/public/data/be_customers`, []);
    mockApiFetch.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }); // push
    const handler = await loadHandler();
    const res = makeRes();
    await handler({
      method: 'POST', headers: {},
      body: { action: 'bind', customerId: 'CUST-A', lineUserId: 'U-new1', branchId: 'BR-b1', displayName: 'ไลน์เอ' },
    }, res);

    const upd = dbState.batchOps.find(o => o.op === 'update')?.data;
    expect(upd).toBeTruthy();
    expect(upd.lineUserId).toBe('U-new1');
    expect(typeof upd.lineLinkedAt).toBe('string');
    expect(upd.lineDisplayName).toBe('ไลน์เอ');
    expect(upd['lineUserId_byBranch.BR-b1']).toMatchObject({
      lineUserId: 'U-new1', lineDisplayName: 'ไลน์เอ', _lineStale: false, _lineStaleAt: null,
    });
    const audit = dbState.batchOps.find(o => o.op === 'set')?.data;
    expect(audit).toMatchObject({
      action: 'line-friend-bind', customerId: 'CUST-A', lineUserId: 'U-new1',
      branchId: 'BR-b1', source: 'friend-picker', performedBy: 'admin-1',
    });
    expect(dbState.committed).toBe(1);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'bound', customerId: 'CUST-A' }));
  });
  it('E5.2 push failure does NOT fail the bind (best-effort)', async () => {
    dbState.docs.set(`artifacts/${APP}/public/data/be_customers/CUST-C`, { customerName: 'ซี' });
    dbState.collections.set(`artifacts/${APP}/public/data/be_customers`, []);
    mockApiFetch.mockRejectedValue(new Error('LINE down'));
    const handler = await loadHandler();
    const res = makeRes();
    await handler({
      method: 'POST', headers: {},
      body: { action: 'bind', customerId: 'CUST-C', lineUserId: 'U-c', branchId: 'BR-c', displayName: '' },
    }, res);
    expect(dbState.committed).toBe(1);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'bound' }));
  });
});
