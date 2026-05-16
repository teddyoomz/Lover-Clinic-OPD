// tests/v75-fb-test-endpoint.test.js
// V75 Item 3 — /api/admin/fb-test endpoint shape tests.
// Adapted from plan: actual verify path is ./_lib/adminAuth.js (NOT
// ./_lib/verifyAdminToken.js per plan typo). Calling convention:
// verifyAdminToken(req, res) returns {uid,email,isAdmin,decoded} | null
// (writes 401/403 itself on null path).

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

const mockVerifyAdminToken = vi.fn();
const ORIGINAL_FETCH = global.fetch;
let fetchMock;

vi.mock('../api/admin/_lib/adminAuth.js', () => ({
  verifyAdminToken: mockVerifyAdminToken,
}));

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock = vi.fn();
  global.fetch = fetchMock;
});
afterAll(() => {
  if (ORIGINAL_FETCH === undefined) delete global.fetch;
  else global.fetch = ORIGINAL_FETCH;
});

function makeRes() {
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return res;
}

describe('V75 Item 3 — /api/admin/fb-test endpoint', () => {
  it('FT1.1 — rejects missing auth (verifyAdminToken returns null)', async () => {
    mockVerifyAdminToken.mockImplementationOnce(async (_req, res) => {
      res.status(401).json({ success: false, error: 'Unauthorized: missing Bearer token' });
      return null;
    });
    const { default: handler } = await import('../api/admin/fb-test.js');
    const req = { method: 'POST', headers: {}, body: { pageId: '1', pageAccessToken: 't' } };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('FT1.2 — happy path: FB Graph /me returns id+name → ok:true + pageName', async () => {
    mockVerifyAdminToken.mockResolvedValueOnce({ uid: 'admin-1', email: 'a@b.c', isAdmin: true });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: '12345', name: 'Lover Clinic' }),
    });
    const { default: handler } = await import('../api/admin/fb-test.js');
    const req = {
      method: 'POST',
      headers: { authorization: 'Bearer tok' },
      body: { pageId: '12345', pageAccessToken: 'graph-tok' },
    };
    const res = makeRes();
    await handler(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: true, pageName: 'Lover Clinic', pageId: '12345' })
    );
  });

  it('FT1.3 — invalid token: FB Graph returns error → ok:false + reason surfaces FB message', async () => {
    mockVerifyAdminToken.mockResolvedValueOnce({ uid: 'admin-1', email: '', isAdmin: true });
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: { message: 'Invalid OAuth access token', type: 'OAuthException', code: 190 },
      }),
    });
    const { default: handler } = await import('../api/admin/fb-test.js');
    const req = {
      method: 'POST',
      headers: { authorization: 'Bearer tok' },
      body: { pageId: '99', pageAccessToken: 'bad' },
    };
    const res = makeRes();
    await handler(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ ok: false, reason: expect.stringMatching(/Invalid OAuth/) })
    );
  });

  it('FT1.4 — pageId mismatch: token returns DIFFERENT id → ok:false + reason', async () => {
    mockVerifyAdminToken.mockResolvedValueOnce({ uid: 'admin-1', email: '', isAdmin: true });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ id: 'DIFFERENT', name: 'Other Page' }),
    });
    const { default: handler } = await import('../api/admin/fb-test.js');
    const req = {
      method: 'POST',
      headers: { authorization: 'Bearer tok' },
      body: { pageId: 'EXPECTED', pageAccessToken: 'tok' },
    };
    const res = makeRes();
    await handler(req, res);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        ok: false,
        reason: expect.stringMatching(/pageId mismatch|EXPECTED|DIFFERENT/),
      })
    );
  });

  it('FT1.5 — missing fields → 400', async () => {
    mockVerifyAdminToken.mockResolvedValueOnce({ uid: 'admin-1', email: '', isAdmin: true });
    const { default: handler } = await import('../api/admin/fb-test.js');
    const req = { method: 'POST', headers: { authorization: 'Bearer tok' }, body: { pageId: '' } };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('FT1.6 — non-POST method → 405', async () => {
    const { default: handler } = await import('../api/admin/fb-test.js');
    const req = { method: 'GET', headers: {}, body: {} };
    const res = makeRes();
    await handler(req, res);
    expect(res.status).toHaveBeenCalledWith(405);
  });

  it('FT1.7 — V75 marker in source', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('api/admin/fb-test.js', 'utf8');
    expect(src).toMatch(/V75 Item 3/);
  });

  it('FT1.8 — imports verifyAdminToken from canonical adminAuth.js path', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('api/admin/fb-test.js', 'utf8');
    expect(src).toMatch(/verifyAdminToken/);
    expect(src).toMatch(/_lib\/adminAuth\.js/);
  });
});
