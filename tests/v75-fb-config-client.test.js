// V75 Item 3 — fbConfigClient + fbTestClient unit tests.
// Mirrors lineConfigClient.test (direct Firestore client SDK pattern).

import { describe, it, expect, beforeEach, vi, afterAll } from 'vitest';

// ─── Mock firebase/firestore + firebase.js + auth ───────────────────────────
const mockGetDoc = vi.fn();
const mockSetDoc = vi.fn();
const mockOnSnapshot = vi.fn();
const mockGetDocs = vi.fn();
const mockDoc = vi.fn((...args) => ({ __doc: args }));
const mockCollection = vi.fn((...args) => ({ __col: args }));
const mockQuery = vi.fn((col, ...constraints) => ({ __q: true, col, constraints }));
const mockWhere = vi.fn((f, op, v) => ({ __where: true, f, op, v }));
const mockLimit = vi.fn((n) => ({ __limit: n }));

vi.mock('firebase/firestore', () => ({
  doc: mockDoc,
  getDoc: mockGetDoc,
  setDoc: mockSetDoc,
  onSnapshot: mockOnSnapshot,
  collection: mockCollection,
  query: mockQuery,
  where: mockWhere,
  limit: mockLimit,
  getDocs: mockGetDocs,
}));
vi.mock('../src/firebase.js', () => ({
  db: { __mockDb: true },
  appId: 'TEST-APP-ID',
  auth: { currentUser: { getIdToken: async () => 'mock-id-token' } },
}));

const ORIGINAL_FETCH = global.fetch;

beforeEach(() => {
  vi.clearAllMocks();
});

afterAll(() => {
  global.fetch = ORIGINAL_FETCH;
});

describe('V75 Item 3 — fbConfigClient (direct Firestore client SDK)', () => {
  it('FC1.1 — DEFAULT_FB_CONFIG has expected shape + is frozen', async () => {
    const { DEFAULT_FB_CONFIG } = await import('../src/lib/fbConfigClient.js');
    expect(DEFAULT_FB_CONFIG.pageId).toBe('');
    expect(DEFAULT_FB_CONFIG.enabled).toBe(false);
    expect(Object.isFrozen(DEFAULT_FB_CONFIG)).toBe(true);
  });

  it('FC1.2 — getFbConfig returns merged-defaults shape when doc exists', async () => {
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ pageId: '12345', enabled: true }),
    });
    const { getFbConfig } = await import('../src/lib/fbConfigClient.js');
    const r = await getFbConfig('BR-A');
    expect(r.pageId).toBe('12345');
    expect(r.enabled).toBe(true);
    expect(r.pageAccessToken).toBe(''); // default
  });

  it('FC1.3 — getFbConfig returns null when doc missing and branch is NOT นครราชสีมา', async () => {
    // be_fb_configs/{BR-A} → not exists
    mockGetDoc.mockResolvedValueOnce({ exists: () => false });
    // be_branches/{BR-A} → exists but name != นครราชสีมา
    mockGetDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ name: 'ทดลอง 1' }) });
    const { getFbConfig } = await import('../src/lib/fbConfigClient.js');
    const r = await getFbConfig('BR-A');
    expect(r).toBe(null);
  });

  it('FC1.4 — getFbConfig auto-seeds นครราชสีมา from legacy clinic_settings/chat_config', async () => {
    // be_fb_configs/{BR-NAKHON} → not exists
    mockGetDoc.mockResolvedValueOnce({ exists: () => false });
    // be_branches/{BR-NAKHON} → name === นครราชสีมา
    mockGetDoc.mockResolvedValueOnce({ exists: () => true, data: () => ({ name: 'นครราชสีมา' }) });
    // clinic_settings/chat_config → exists with legacy FB cred
    mockGetDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ fbPageId: 'LEGACY-PID', fbAccessToken: 'LEGACY-TOK' }),
    });
    const { getFbConfig } = await import('../src/lib/fbConfigClient.js');
    const r = await getFbConfig('BR-NAKHON');
    expect(r.pageId).toBe('LEGACY-PID');
    expect(r.pageAccessToken).toBe('LEGACY-TOK');
    expect(r._autoSeeded).toBe(true);
    expect(r.enabled).toBe(false); // admin must explicitly save to enable
  });

  it('FC1.5 — saveFbConfig calls setDoc with merge:true + strips _autoSeeded marker', async () => {
    mockSetDoc.mockResolvedValueOnce(undefined);
    const { saveFbConfig } = await import('../src/lib/fbConfigClient.js');
    await saveFbConfig('BR-A', {
      pageId: '12345',
      pageAccessToken: 'tok',
      enabled: true,
      _autoSeeded: true, // should be stripped
    });
    expect(mockSetDoc).toHaveBeenCalledTimes(1);
    const [ref, payload, opts] = mockSetDoc.mock.calls[0];
    expect(payload.pageId).toBe('12345');
    expect(payload.enabled).toBe(true);
    expect(payload._autoSeeded).toBeUndefined();
    expect(opts).toEqual({ merge: true });
  });

  it('FC1.6 — saveFbConfig rejects empty branchId', async () => {
    const { saveFbConfig } = await import('../src/lib/fbConfigClient.js');
    await expect(saveFbConfig('', { pageId: '12345', pageAccessToken: 'tok', enabled: true })).rejects.toThrow(/branchId/i);
  });

  it('FC1.7 — saveFbConfig validates required fields when enabled:true', async () => {
    const { saveFbConfig } = await import('../src/lib/fbConfigClient.js');
    await expect(saveFbConfig('BR-A', { pageId: '', enabled: true })).rejects.toThrow(/Page ID|Access Token/);
  });

  it('FC1.8 — saveFbConfig allows enabled:false without creds', async () => {
    mockSetDoc.mockResolvedValueOnce(undefined);
    const { saveFbConfig } = await import('../src/lib/fbConfigClient.js');
    await expect(saveFbConfig('BR-A', { pageId: '', enabled: false })).resolves.toBeTruthy();
  });

  it('FC1.9 — findFbConfigByPageId returns matching {branchId, config}', async () => {
    mockGetDocs.mockResolvedValueOnce({
      empty: false,
      docs: [{ id: 'BR-A', data: () => ({ pageId: '12345', enabled: true }) }],
    });
    const { findFbConfigByPageId } = await import('../src/lib/fbConfigClient.js');
    const r = await findFbConfigByPageId('12345');
    expect(r.branchId).toBe('BR-A');
    expect(r.config.pageId).toBe('12345');
  });

  it('FC1.10 — findFbConfigByPageId returns null on no match', async () => {
    mockGetDocs.mockResolvedValueOnce({ empty: true, docs: [] });
    const { findFbConfigByPageId } = await import('../src/lib/fbConfigClient.js');
    const r = await findFbConfigByPageId('NOT-FOUND');
    expect(r).toBe(null);
  });

  it('FC1.11 — listenToFbConfig returns unsubscribe fn + invokes onChange(null) on missing doc', async () => {
    const unsub = vi.fn();
    mockOnSnapshot.mockImplementationOnce((ref, onNext) => {
      onNext({ exists: () => false });
      return unsub;
    });
    const onChange = vi.fn();
    const { listenToFbConfig } = await import('../src/lib/fbConfigClient.js');
    const ret = listenToFbConfig('BR-A', onChange);
    expect(typeof ret).toBe('function');
    expect(onChange).toHaveBeenCalledWith(null);
  });

  it('FC1.12 — V75 marker comment in source', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/lib/fbConfigClient.js', 'utf8');
    expect(src).toMatch(/V75 Item 3/);
  });
});

describe('V75 Item 3 — fbTestClient (FB Graph API proxy)', () => {
  let fetchMock;
  beforeEach(() => {
    fetchMock = vi.fn();
    global.fetch = fetchMock;
  });

  it('FT1.1 — testFbConnection rejects missing fields', async () => {
    const { testFbConnection } = await import('../src/lib/fbTestClient.js');
    await expect(testFbConnection({})).rejects.toThrow(/pageId.*pageAccessToken/);
  });

  it('FT1.2 — testFbConnection calls /api/admin/fb-test with bearer token', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, pageName: 'Lover Clinic' }),
    });
    const { testFbConnection } = await import('../src/lib/fbTestClient.js');
    const r = await testFbConnection({ pageId: '12345', pageAccessToken: 'tok' });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/admin/fb-test'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer mock-id-token' }),
        body: expect.stringContaining('"pageId":"12345"'),
      })
    );
    expect(r.ok).toBe(true);
    expect(r.pageName).toBe('Lover Clinic');
  });

  it('FT1.3 — testFbConnection surfaces FB-side error reason', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: false, reason: 'INVALID_TOKEN' }),
    });
    const { testFbConnection } = await import('../src/lib/fbTestClient.js');
    const r = await testFbConnection({ pageId: '12345', pageAccessToken: 'bad' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('INVALID_TOKEN');
  });

  it('FT1.4 — testFbConnection throws on non-OK HTTP', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 403,
      json: async () => ({ error: 'FORBIDDEN' }),
    });
    const { testFbConnection } = await import('../src/lib/fbTestClient.js');
    await expect(testFbConnection({ pageId: '12345', pageAccessToken: 'tok' })).rejects.toThrow(/FORBIDDEN/);
  });
});
