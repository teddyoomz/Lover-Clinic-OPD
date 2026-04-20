// ─── Phase 12.0 · api/admin/users adversarial tests ────────────────────────
// Tests Firebase Admin SDK endpoint with mocked firebase-admin.
// Focus: token verification, admin gate, self-protection, input validation.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { fakeAuth } = vi.hoisted(() => ({
  fakeAuth: {
    verifyIdToken: vi.fn(),
    listUsers: vi.fn(),
    getUser: vi.fn(),
    createUser: vi.fn(),
    updateUser: vi.fn(),
    deleteUser: vi.fn(),
    setCustomUserClaims: vi.fn(),
  },
}));

vi.mock('firebase-admin/app', () => ({
  initializeApp: vi.fn(() => ({})),
  cert: vi.fn((opts) => opts),
  getApps: vi.fn(() => [{}]),
  getApp: vi.fn(() => ({})),
}));

vi.mock('firebase-admin/auth', () => ({
  getAuth: vi.fn(() => fakeAuth),
}));

const { default: handler } = await import('../api/admin/users.js');
const { __resetAdminAuthForTests } = await import('../api/admin/_lib/adminAuth.js');

function createReq({ method = 'POST', authorization = '', body = {} } = {}) {
  return { method, headers: { authorization }, body };
}

function createRes() {
  const res = {
    statusCode: 0,
    body: null,
    headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(b) { this.body = b; return this; },
    end() { return this; },
  };
  return res;
}

const ADMIN_TOKEN = 'valid-admin-token';
const BOOTSTRAP_TOKEN = 'bootstrap-caller-token';
const NONADMIN_TOKEN = 'valid-nonadmin-token';
const INVALID_TOKEN = 'invalid-token';

const ADMIN_UID = 'admin-uid-001';
const BOOTSTRAP_UID = 'root-uid-bootstrap';
const NONADMIN_UID = 'regular-uid-999';

beforeEach(() => {
  vi.clearAllMocks();
  __resetAdminAuthForTests();
  // Env vars set so adminAuth.resolveApp() code path is exercised; actual
  // values never used because `getApps()` mock returns non-empty (skips init).
  process.env.FIREBASE_ADMIN_CLIENT_EMAIL = 'test@service.gserviceaccount.com';
  process.env.FIREBASE_ADMIN_PRIVATE_KEY = 'test-key-placeholder';
  process.env.FIREBASE_ADMIN_BOOTSTRAP_UIDS = BOOTSTRAP_UID;

  fakeAuth.verifyIdToken.mockImplementation(async (token) => {
    if (token === ADMIN_TOKEN) return { uid: ADMIN_UID, email: 'admin@clinic.com', admin: true };
    if (token === BOOTSTRAP_TOKEN) return { uid: BOOTSTRAP_UID, email: 'root@clinic.com' };
    if (token === NONADMIN_TOKEN) return { uid: NONADMIN_UID, email: 'regular@clinic.com' };
    const err = new Error('invalid token');
    err.code = 'auth/invalid-id-token';
    throw err;
  });
});

describe('api/admin/users — method + CORS', () => {
  it('FA1: OPTIONS preflight returns 204 with CORS headers', async () => {
    const req = createReq({ method: 'OPTIONS' });
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(204);
    expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    expect(res.headers['Access-Control-Allow-Methods']).toContain('POST');
    expect(res.headers['Access-Control-Allow-Headers']).toContain('Authorization');
  });

  it('FA2: GET returns 405 method not allowed', async () => {
    const req = createReq({ method: 'GET' });
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(405);
    expect(res.body.success).toBe(false);
  });

  it('FA3: PUT returns 405', async () => {
    const req = createReq({ method: 'PUT' });
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(405);
  });
});

describe('api/admin/users — authentication gate', () => {
  it('FA4: missing Authorization header returns 401', async () => {
    const req = createReq({ body: { action: 'list' } });
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toMatch(/missing Bearer token/);
  });

  it('FA5: malformed Authorization header (no Bearer prefix) returns 401', async () => {
    const req = createReq({ authorization: 'Basic xyz', body: { action: 'list' } });
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(401);
  });

  it('FA6: invalid/expired token returns 401', async () => {
    const req = createReq({ authorization: `Bearer ${INVALID_TOKEN}`, body: { action: 'list' } });
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(401);
    expect(res.body.error).toMatch(/auth\/invalid-id-token|invalid-token/);
  });

  it('FA7: valid token but non-admin user returns 403', async () => {
    const req = createReq({ authorization: `Bearer ${NONADMIN_TOKEN}`, body: { action: 'list' } });
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/admin privilege/);
  });

  it('FA8: bootstrap UID caller treated as admin (no custom claim needed)', async () => {
    fakeAuth.listUsers.mockResolvedValueOnce({ users: [], pageToken: null });
    const req = createReq({ authorization: `Bearer ${BOOTSTRAP_TOKEN}`, body: { action: 'list' } });
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('FA9: admin:true custom-claim caller granted access', async () => {
    fakeAuth.listUsers.mockResolvedValueOnce({ users: [], pageToken: null });
    const req = createReq({ authorization: `Bearer ${ADMIN_TOKEN}`, body: { action: 'list' } });
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
  });

  it('FA10: verifyIdToken called with checkRevoked=true', async () => {
    fakeAuth.listUsers.mockResolvedValueOnce({ users: [], pageToken: null });
    const req = createReq({ authorization: `Bearer ${ADMIN_TOKEN}`, body: { action: 'list' } });
    await handler(req, createRes());
    expect(fakeAuth.verifyIdToken).toHaveBeenCalledWith(ADMIN_TOKEN, true);
  });
});

describe('api/admin/users — action dispatch + validation', () => {
  const adminAuth = () => ({ authorization: `Bearer ${ADMIN_TOKEN}` });

  it('FA11: unknown action returns 400', async () => {
    const req = createReq({ ...adminAuth(), body: { action: 'DROP_TABLE' } });
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/unknown action/);
  });

  it('FA12: empty action returns 400', async () => {
    const req = createReq({ ...adminAuth(), body: {} });
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('FA13: list returns serialized users + pageToken', async () => {
    fakeAuth.listUsers.mockResolvedValueOnce({
      users: [
        { uid: 'u1', email: 'a@b.c', displayName: 'Alice', disabled: false, emailVerified: true, customClaims: { admin: true }, metadata: { creationTime: 'T1', lastSignInTime: 'T2' } },
        { uid: 'u2', email: 'b@c.d', displayName: '', disabled: true, customClaims: {}, metadata: {} },
      ],
      pageToken: 'next-page',
    });
    const req = createReq({ ...adminAuth(), body: { action: 'list' } });
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data.users).toHaveLength(2);
    expect(res.body.data.users[0]).toMatchObject({ uid: 'u1', email: 'a@b.c', isAdmin: true });
    expect(res.body.data.users[1].disabled).toBe(true);
    expect(res.body.data.users[1].isAdmin).toBe(false);
    expect(res.body.data.pageToken).toBe('next-page');
  });

  it('FA14: create with invalid email returns 400', async () => {
    const req = createReq({ ...adminAuth(), body: { action: 'create', email: 'not-an-email', password: 'secret-pw' } });
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/invalid email/);
    expect(fakeAuth.createUser).not.toHaveBeenCalled();
  });

  it('FA15: create with short password returns 400', async () => {
    const req = createReq({ ...adminAuth(), body: { action: 'create', email: 'new@clinic.com', password: '123' } });
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/at least 6/);
  });

  it('FA16: create with valid input creates user', async () => {
    fakeAuth.createUser.mockResolvedValueOnce({
      uid: 'new-uid', email: 'new@clinic.com', displayName: 'New Staff', disabled: false, emailVerified: false, metadata: {},
    });
    const req = createReq({ ...adminAuth(), body: {
      action: 'create', email: 'new@clinic.com', password: 'secret-pw', displayName: 'New Staff',
    } });
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(fakeAuth.createUser).toHaveBeenCalledWith({
      email: 'new@clinic.com', password: 'secret-pw', displayName: 'New Staff', disabled: false,
    });
    expect(res.body.data.uid).toBe('new-uid');
    expect(fakeAuth.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it('FA17: create with makeAdmin=true sets admin custom claim', async () => {
    fakeAuth.createUser.mockResolvedValueOnce({ uid: 'admin-new', email: 'boss@clinic.com', metadata: {} });
    fakeAuth.getUser.mockResolvedValueOnce({ uid: 'admin-new', email: 'boss@clinic.com', customClaims: { admin: true }, metadata: {} });
    const req = createReq({ ...adminAuth(), body: {
      action: 'create', email: 'boss@clinic.com', password: 'secret-pw', makeAdmin: true,
    } });
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(fakeAuth.setCustomUserClaims).toHaveBeenCalledWith('admin-new', { admin: true });
    expect(res.body.data.isAdmin).toBe(true);
  });

  it('FA18: update without uid returns 400', async () => {
    const req = createReq({ ...adminAuth(), body: { action: 'update', email: 'x@y.z' } });
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/uid required/);
  });

  it('FA19: update with no fields returns 400', async () => {
    const req = createReq({ ...adminAuth(), body: { action: 'update', uid: 'target-uid' } });
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/no update fields/);
  });

  it('FA20: update with invalid email returns 400', async () => {
    const req = createReq({ ...adminAuth(), body: { action: 'update', uid: 'target', email: 'bad' } });
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
  });

  it('FA21: update with valid fields updates user', async () => {
    fakeAuth.updateUser.mockResolvedValueOnce({ uid: 'target', email: 'new@e.com', displayName: 'D', disabled: true, metadata: {} });
    const req = createReq({ ...adminAuth(), body: {
      action: 'update', uid: 'target', email: 'new@e.com', displayName: 'D', disabled: true,
    } });
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(fakeAuth.updateUser).toHaveBeenCalledWith('target', {
      email: 'new@e.com', displayName: 'D', disabled: true,
    });
  });

  it('FA22: delete own uid returns 400 (self-protection)', async () => {
    const req = createReq({ ...adminAuth(), body: { action: 'delete', uid: ADMIN_UID } });
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/cannot delete own/);
    expect(fakeAuth.deleteUser).not.toHaveBeenCalled();
  });

  it('FA23: delete other uid succeeds', async () => {
    fakeAuth.deleteUser.mockResolvedValueOnce(undefined);
    const req = createReq({ ...adminAuth(), body: { action: 'delete', uid: 'other-uid' } });
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(fakeAuth.deleteUser).toHaveBeenCalledWith('other-uid');
    expect(res.body.data).toEqual({ uid: 'other-uid', deleted: true });
  });

  it('FA24: grantAdmin preserves existing custom claims', async () => {
    fakeAuth.getUser.mockResolvedValueOnce({ uid: 'target', customClaims: { branch: 'bkk' }, metadata: {} });
    fakeAuth.getUser.mockResolvedValueOnce({ uid: 'target', customClaims: { branch: 'bkk', admin: true }, metadata: {} });
    const req = createReq({ ...adminAuth(), body: { action: 'grantAdmin', uid: 'target' } });
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(fakeAuth.setCustomUserClaims).toHaveBeenCalledWith('target', { branch: 'bkk', admin: true });
    expect(res.body.data.isAdmin).toBe(true);
  });

  it('FA25: revokeAdmin own uid (non-bootstrap caller) returns 400', async () => {
    const req = createReq({ ...adminAuth(), body: { action: 'revokeAdmin', uid: ADMIN_UID } });
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/cannot revoke own/);
    expect(fakeAuth.setCustomUserClaims).not.toHaveBeenCalled();
  });

  it('FA26: revokeAdmin own uid (bootstrap caller) succeeds', async () => {
    fakeAuth.getUser.mockResolvedValueOnce({ uid: BOOTSTRAP_UID, customClaims: { admin: true, branch: 'bkk' }, metadata: {} });
    fakeAuth.getUser.mockResolvedValueOnce({ uid: BOOTSTRAP_UID, customClaims: { branch: 'bkk' }, metadata: {} });
    const req = createReq({ authorization: `Bearer ${BOOTSTRAP_TOKEN}`, body: { action: 'revokeAdmin', uid: BOOTSTRAP_UID } });
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(fakeAuth.setCustomUserClaims).toHaveBeenCalledWith(BOOTSTRAP_UID, { branch: 'bkk' });
  });

  it('FA27: revokeAdmin strips only admin claim from others', async () => {
    fakeAuth.getUser.mockResolvedValueOnce({ uid: 'other', customClaims: { admin: true, branch: 'cnx' }, metadata: {} });
    fakeAuth.getUser.mockResolvedValueOnce({ uid: 'other', customClaims: { branch: 'cnx' }, metadata: {} });
    const req = createReq({ ...adminAuth(), body: { action: 'revokeAdmin', uid: 'other' } });
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(fakeAuth.setCustomUserClaims).toHaveBeenCalledWith('other', { branch: 'cnx' });
    expect(res.body.data.isAdmin).toBe(false);
  });

  it('FA28: get returns serialized user', async () => {
    fakeAuth.getUser.mockResolvedValueOnce({
      uid: 'xxx', email: 'x@y.z', displayName: 'X', disabled: false, emailVerified: true,
      customClaims: { admin: true }, metadata: { creationTime: 'T', lastSignInTime: 'T2' },
    });
    const req = createReq({ ...adminAuth(), body: { action: 'get', uid: 'xxx' } });
    const res = createRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(res.body.data).toMatchObject({ uid: 'xxx', isAdmin: true, createdAt: 'T' });
  });
});
