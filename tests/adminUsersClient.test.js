// ─── Phase 12.1 · adminUsersClient tests — token injection + error handling
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

const { mockAuth } = vi.hoisted(() => ({
  mockAuth: { currentUser: { getIdToken: vi.fn() } },
}));

vi.mock('../src/firebase.js', () => ({
  auth: mockAuth,
  db: {},
  appId: 'test-app',
}));

const { listAdminUsers, createAdminUser, deleteAdminUser, grantAdmin } = await import('../src/lib/adminUsersClient.js');

describe('adminUsersClient', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.currentUser = { getIdToken: vi.fn().mockResolvedValue('fake-id-token') };
    global.fetch = vi.fn();
  });

  afterEach(() => { delete global.fetch; });

  it('AC1: sends Bearer token from current user', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({ success: true, data: { users: [] } }),
    });
    await listAdminUsers();
    expect(global.fetch).toHaveBeenCalledWith('/api/admin/users', expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer fake-id-token', 'Content-Type': 'application/json' }),
    }));
  });

  it('AC2: throws if no user signed in', async () => {
    mockAuth.currentUser = null;
    await expect(listAdminUsers()).rejects.toThrow(/เข้าสู่ระบบ/);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('AC3: throws on HTTP 401', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false, status: 401, json: async () => ({ success: false, error: 'Unauthorized' }),
    });
    await expect(listAdminUsers()).rejects.toThrow(/Unauthorized/);
  });

  it('AC4: throws on success:false even with HTTP 200', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: true, status: 200, json: async () => ({ success: false, error: 'invalid email' }),
    });
    await expect(createAdminUser({ email: 'x', password: 'Strong1pw' })).rejects.toThrow(/invalid email/);
  });

  it('AC5: throws with HTTP status fallback when no error body', async () => {
    global.fetch.mockResolvedValueOnce({
      ok: false, status: 500, json: async () => { throw new Error('not json'); },
    });
    await expect(listAdminUsers()).rejects.toThrow(/500/);
  });

  it('AC6: serializes action + params as body', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true, data: {} }) });
    await createAdminUser({ email: 'a@b.c', password: 'Strong1pw', displayName: 'X' });
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body).toEqual({ action: 'create', email: 'a@b.c', password: 'Strong1pw', displayName: 'X', disabled: undefined, makeAdmin: undefined });
  });

  it('AC7: deleteAdminUser sends uid in body', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true, data: { uid: 'X', deleted: true } }) });
    await deleteAdminUser('X');
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body.action).toBe('delete');
    expect(body.uid).toBe('X');
  });

  it('AC8: grantAdmin hits correct action', async () => {
    global.fetch.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ success: true, data: { uid: 'X', isAdmin: true } }) });
    await grantAdmin('X');
    expect(JSON.parse(global.fetch.mock.calls[0][1].body)).toEqual({ action: 'grantAdmin', uid: 'X' });
  });
});
