// ─── V40 Bonus 1 — Branch backup/restore/make-fresh adversarial endpoint tests ──
//
// Runtime behavioral tests that call the REAL handler functions in-memory with
// mocked req/res + mocked firebase-admin SDK. Covers every error code in all 3
// endpoints. NOT source-grep style — each test exercises handler execution paths.
//
// E1.* — branch-backup-export.js
// E2.* — branch-restore.js
// E3.* — branch-make-fresh.js

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Buffer } from 'node:buffer';

// ─── helpers ─────────────────────────────────────────────────────────────────

function mockReq({ method = 'POST', body = {}, headers = {} } = {}) {
  return { method, body, headers };
}

function mockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    setHeader(k, v) { this.headers[k] = v; },
    status(code) { this.statusCode = code; return this; },
    json(obj) { this.body = obj; return this; },
    end() { return this; },
  };
  return res;
}

// Minimal valid backup file JSON for restore tests
function makeBackupJson({ schemaVersion = 1, sourceBranchId = 'BR-SRC', collections = {} } = {}) {
  return JSON.stringify({
    meta: {
      schemaVersion,
      sourceBranchId,
      exportedBy: 'test-admin',
      exportedAt: new Date().toISOString(),
      scope: { tiers: ['T1'], collections: [] },
      perCollectionCounts: {},
      isAutoPreFresh: false,
    },
    collections,
  });
}

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../api/admin/_lib/adminAuth.js', () => ({
  verifyAdminToken: vi.fn(async (req, res) => {
    if (req.headers['x-test-unauth']) {
      res.status(401).json({ error: 'UNAUTHORIZED' });
      return null;
    }
    return { decoded: { uid: 'test-admin-uid' } };
  }),
}));

// Storage mock — default: file exists, download returns minimal backup
const mockFileObj = {
  save: vi.fn(async () => undefined),
  download: vi.fn(async () => [Buffer.from(makeBackupJson())]),
  getSignedUrl: vi.fn(async () => ['https://signed.example/url']),
  exists: vi.fn(async () => [true]),
  delete: vi.fn(async () => undefined),
};
const mockBucketObj = {
  file: vi.fn(() => mockFileObj),
};
vi.mock('firebase-admin/storage', () => ({
  getStorage: vi.fn(() => ({ bucket: () => mockBucketObj })),
}));

// Firestore mock — build a chain: collection(...).doc(...).collection(...)...
const mockBatch = {
  set: vi.fn(),
  delete: vi.fn(),
  commit: vi.fn(async () => undefined),
};

// We need a re-usable "chain" that supports .where(...).get() + .get() + .doc(id)
function makeQueryRef(snap = { docs: [], empty: true }) {
  return {
    get: vi.fn(async () => snap),
    where: vi.fn(() => makeQueryRef(snap)),
    doc: vi.fn((id) => ({
      id,
      ref: { delete: vi.fn() },
      collection: vi.fn(() => makeQueryRef(snap)),
      set: vi.fn(async () => undefined),
    })),
  };
}

// mockDb.collection always returns a chain builder
const mockDbObj = {
  batch: vi.fn(() => mockBatch),
  collection: vi.fn(),
  doc: vi.fn(),
};

// Default chain: everything empty
function resetMockDb(snap = { docs: [], empty: true }) {
  // Produces: db.collection('artifacts').doc(APP_ID).collection('public').doc('data').collection(name)
  const innerColFn = vi.fn(() => makeQueryRef(snap));
  const dataDocObj = {
    collection: innerColFn,
  };
  const publicColObj = {
    doc: vi.fn(() => dataDocObj),
  };
  const appDocObj = {
    collection: vi.fn(() => publicColObj),
  };
  const artifactsColObj = {
    doc: vi.fn(() => appDocObj),
  };
  mockDbObj.collection.mockReturnValue(artifactsColObj);
  return innerColFn;
}

vi.mock('firebase-admin/firestore', () => ({
  getFirestore: vi.fn(() => mockDbObj),
}));

vi.mock('firebase-admin/app', () => ({
  initializeApp: vi.fn(() => ({})),
  getApps: vi.fn(() => [{}]),   // pretend already initialized — avoids env-var checks
  getApp: vi.fn(() => ({})),
  cert: vi.fn(() => ({})),
}));

// ─── Reset between tests ─────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  // Reset cached singletons inside the endpoints. Because vitest re-uses the
  // same module instance across tests in the same file (ESM module cache), we
  // need to reset the cachedDb/cachedBucket variables by making getApps()
  // always return a non-empty array (already done above) and clearing call history.
  resetMockDb();
  // Restore file mock defaults
  mockFileObj.exists.mockResolvedValue([true]);
  mockFileObj.download.mockResolvedValue([Buffer.from(makeBackupJson())]);
  mockFileObj.getSignedUrl.mockResolvedValue(['https://signed.example/url']);
  mockFileObj.save.mockResolvedValue(undefined);
  mockBatch.commit.mockResolvedValue(undefined);
  mockBatch.set.mockReset();
  mockBatch.delete.mockReset();
});

// ─── E1 — branch-backup-export.js ────────────────────────────────────────────

describe('E1 — branch-backup-export adversarial', () => {
  async function loadHandler() {
    // Use unstable_moduleGraph invalidation via a fresh dynamic import each group.
    // Because vitest caches by resolved path, we import once per describe block.
    const { default: h } = await import('../api/admin/branch-backup-export.js');
    return h;
  }

  it('E1.1 — OPTIONS request → 204 + no body', async () => {
    const handler = await loadHandler();
    const req = mockReq({ method: 'OPTIONS' });
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(204);
    expect(res.body).toBeNull();
  });

  it('E1.2 — Non-POST request (GET) → 405 METHOD_NOT_ALLOWED', async () => {
    const handler = await loadHandler();
    const req = mockReq({ method: 'GET' });
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(405);
    expect(res.body.error).toBe('METHOD_NOT_ALLOWED');
  });

  it('E1.3 — Unauth caller → handler exits after 401, no body parsing attempted', async () => {
    const handler = await loadHandler();
    const req = mockReq({ headers: { 'x-test-unauth': '1' }, body: {} });
    const res = mockRes();
    await handler(req, res);
    // verifyAdminToken sets 401; handler returns early; mockBucketObj.file never called
    expect(res.statusCode).toBe(401);
    expect(mockBucketObj.file).not.toHaveBeenCalled();
  });

  it('E1.4 + E1.5 + E1.6 — Missing / empty / non-string branchId → 400 MISSING_BRANCH_ID', async () => {
    const handler = await loadHandler();
    for (const branchId of [undefined, '', 123, null]) {
      const req = mockReq({ body: { branchId, tiers: ['T1'] } });
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode, `branchId=${JSON.stringify(branchId)}`).toBe(400);
      expect(res.body.error).toBe('MISSING_BRANCH_ID');
    }
  });

  it('E1.7 — Empty scope (no tiers, no collections) → 400 EMPTY_SCOPE', async () => {
    const handler = await loadHandler();
    const req = mockReq({ body: { branchId: 'BR-X', tiers: [], collections: null } });
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('EMPTY_SCOPE');
  });

  it('E1.8 — Universal collection in explicit scope → 400 UNIVERSAL_COLLECTION_NOT_BACKUPABLE', async () => {
    const handler = await loadHandler();
    const req = mockReq({ body: { branchId: 'BR-X', collections: ['be_customers'] } });
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/UNIVERSAL_COLLECTION_NOT_BACKUPABLE/);
  });

  it('E1.9 — Invalid tier only (T99) collapses to empty scope → 400 EMPTY_SCOPE', async () => {
    const handler = await loadHandler();
    const req = mockReq({ body: { branchId: 'BR-X', tiers: ['T99'] } });
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('EMPTY_SCOPE');
  });

  it('E1.10 — Successful T1 backup with 1 mocked product → 200 + signedUrl + ok:true', async () => {
    // Configure Firestore mock to return 1 product doc for the branchId query
    const prodDoc = {
      id: 'PROD-001',
      data: () => ({ productName: 'Test Product', branchId: 'BR-TEST' }),
      ref: { delete: vi.fn() },
    };
    const prodSnap = { docs: [prodDoc], empty: false };
    // The inner collection function for 'be_products' should return a snap with 1 doc
    const innerColFn = vi.fn(() => {
      const qRef = makeQueryRef(prodSnap);
      return qRef;
    });
    const dataDocObj = { collection: innerColFn };
    const publicColObj = { doc: vi.fn(() => dataDocObj) };
    const appDocObj = { collection: vi.fn(() => publicColObj) };
    const artifactsColObj = { doc: vi.fn(() => appDocObj) };
    mockDbObj.collection.mockReturnValue(artifactsColObj);

    const handler = await loadHandler();
    const req = mockReq({ body: { branchId: 'BR-TEST', tiers: ['T1'] } });
    const res = mockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.signedUrl).toBe('https://signed.example/url');
    expect(mockFileObj.save).toHaveBeenCalled();
    expect(mockFileObj.getSignedUrl).toHaveBeenCalled();
  });
});

// ─── E2 — branch-restore.js ──────────────────────────────────────────────────

describe('E2 — branch-restore adversarial', () => {
  async function loadHandler() {
    const { default: h } = await import('../api/admin/branch-restore.js');
    return h;
  }

  it('E2.1 — OPTIONS → 204', async () => {
    const handler = await loadHandler();
    const req = mockReq({ method: 'OPTIONS' });
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(204);
    expect(res.body).toBeNull();
  });

  it('E2.2 — Non-POST (DELETE) → 405 METHOD_NOT_ALLOWED', async () => {
    const handler = await loadHandler();
    const req = mockReq({ method: 'DELETE' });
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(405);
    expect(res.body.error).toBe('METHOD_NOT_ALLOWED');
  });

  it('E2.3 — Unauth → exit with 401, no Firestore/Storage calls', async () => {
    const handler = await loadHandler();
    const req = mockReq({ headers: { 'x-test-unauth': '1' } });
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(401);
    expect(mockBucketObj.file).not.toHaveBeenCalled();
  });

  it('E2.4 — Invalid mode ("merge") → 400 INVALID_MODE', async () => {
    const handler = await loadHandler();
    const req = mockReq({ body: { mode: 'merge', targetBranchId: 'BR-DEST' } });
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_MODE');
  });

  it('E2.4b — Missing mode → 400 INVALID_MODE', async () => {
    const handler = await loadHandler();
    const req = mockReq({ body: { targetBranchId: 'BR-DEST' } });
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('INVALID_MODE');
  });

  it('E2.5 — Valid mode but missing targetBranchId → 400 MISSING_TARGET_BRANCH_ID', async () => {
    const handler = await loadHandler();
    const req = mockReq({ body: { mode: 'overwrite' } });
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('MISSING_TARGET_BRANCH_ID');
  });

  it('E2.6 — No sourceStoragePath and no uploadedFileBase64 → 400 NO_SOURCE_PROVIDED', async () => {
    const handler = await loadHandler();
    const req = mockReq({ body: { mode: 'overwrite', targetBranchId: 'BR-DEST' } });
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('NO_SOURCE_PROVIDED');
  });

  it('E2.7 — Invalid JSON in base64 file → 400 JSON_PARSE_FAILED', async () => {
    const handler = await loadHandler();
    const badBase64 = Buffer.from('not-json!!!').toString('base64');
    const req = mockReq({ body: { mode: 'overwrite', targetBranchId: 'BR-DEST', uploadedFileBase64: badBase64 } });
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('JSON_PARSE_FAILED');
  });

  it('E2.8 — Missing meta.schemaVersion → 400 SCHEMA_VERSION_MISSING', async () => {
    const handler = await loadHandler();
    const file = { meta: { sourceBranchId: 'BR-SRC' }, collections: {} };
    const badBase64 = Buffer.from(JSON.stringify(file)).toString('base64');
    const req = mockReq({ body: { mode: 'overwrite', targetBranchId: 'BR-SRC', uploadedFileBase64: badBase64 } });
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('SCHEMA_VERSION_MISSING');
  });

  it('E2.9 — Future schemaVersion → 400 SCHEMA_VERSION_UNSUPPORTED', async () => {
    const handler = await loadHandler();
    const file = { meta: { schemaVersion: 9999, sourceBranchId: 'BR-SRC' }, collections: {} };
    const badBase64 = Buffer.from(JSON.stringify(file)).toString('base64');
    const req = mockReq({ body: { mode: 'overwrite', targetBranchId: 'BR-SRC', uploadedFileBase64: badBase64 } });
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/SCHEMA_VERSION_UNSUPPORTED/);
  });

  it('E2.10 — Missing sourceBranchId in meta → 400 SOURCE_BRANCH_ID_MISSING', async () => {
    const handler = await loadHandler();
    const file = { meta: { schemaVersion: 1 }, collections: {} };
    const badBase64 = Buffer.from(JSON.stringify(file)).toString('base64');
    const req = mockReq({ body: { mode: 'overwrite', targetBranchId: 'BR-DEST', uploadedFileBase64: badBase64 } });
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('SOURCE_BRANCH_ID_MISSING');
  });

  it('E2.11 — Overwrite mode with mismatched sourceBranchId → 400 MODE_MISMATCH', async () => {
    const handler = await loadHandler();
    // source=BR-SRC, target=BR-OTHER → mismatch for overwrite
    const b64 = Buffer.from(makeBackupJson({ sourceBranchId: 'BR-SRC' })).toString('base64');
    const req = mockReq({ body: { mode: 'overwrite', targetBranchId: 'BR-OTHER', uploadedFileBase64: b64 } });
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('MODE_MISMATCH');
  });

  it('E2.12 — Clone mode same-branch → 400 CLONE_TO_SAME_BRANCH', async () => {
    const handler = await loadHandler();
    const b64 = Buffer.from(makeBackupJson({ sourceBranchId: 'BR-SAME' })).toString('base64');
    const req = mockReq({ body: { mode: 'clone', targetBranchId: 'BR-SAME', uploadedFileBase64: b64 } });
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('CLONE_TO_SAME_BRANCH');
  });

  it('E2.13 — Clone mode with non-T1 collection (be_treatments) → 400 CLONE_NON_T1_COLLECTION', async () => {
    const handler = await loadHandler();
    const file = {
      meta: { schemaVersion: 1, sourceBranchId: 'BR-SRC', exportedBy: '', exportedAt: '', scope: {}, perCollectionCounts: {}, isAutoPreFresh: false },
      collections: { be_treatments: [{ id: 'TX-1', branchId: 'BR-SRC' }] },
    };
    const b64 = Buffer.from(JSON.stringify(file)).toString('base64');
    const req = mockReq({ body: { mode: 'clone', targetBranchId: 'BR-DEST', uploadedFileBase64: b64 } });
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('CLONE_NON_T1_COLLECTION');
    expect(res.body.collection).toBe('be_treatments');
  });

  it('E2.14 — Successful overwrite restore via base64 → 200 + perCollection counts', async () => {
    const handler = await loadHandler();
    const file = {
      meta: { schemaVersion: 1, sourceBranchId: 'BR-SAME', exportedBy: 'u', exportedAt: '', scope: {}, perCollectionCounts: {}, isAutoPreFresh: false },
      collections: { be_products: [{ id: 'P1', productName: 'X', branchId: 'BR-SAME' }] },
    };
    const b64 = Buffer.from(JSON.stringify(file)).toString('base64');
    const req = mockReq({ body: { mode: 'overwrite', targetBranchId: 'BR-SAME', uploadedFileBase64: b64 } });
    const res = mockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.mode).toBe('overwrite');
    expect(res.body.perCollection['be_products']).toBeDefined();
    expect(res.body.perCollection['be_products'].written).toBe(1);
  });

  it('E2.15 — Successful clone (T1 only, FK fully resolved) → 200 + unmapped empty', async () => {
    const handler = await loadHandler();
    const file = {
      meta: { schemaVersion: 1, sourceBranchId: 'BR-SRC', exportedBy: 'u', exportedAt: '', scope: {}, perCollectionCounts: {}, isAutoPreFresh: false },
      // be_products only — no FKs to remap → unmapped should be empty
      collections: { be_products: [{ id: 'P1', productName: 'Widget', branchId: 'BR-SRC' }] },
    };
    const b64 = Buffer.from(JSON.stringify(file)).toString('base64');
    const req = mockReq({ body: { mode: 'clone', targetBranchId: 'BR-DEST', uploadedFileBase64: b64 } });
    const res = mockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.mode).toBe('clone');
    expect(res.body.unmapped).toEqual([]);
    expect(res.body.perCollection['be_products'].written).toBe(1);
  });

  it('E2.15b — Clone via Storage path → 200 (file.download called)', async () => {
    const handler = await loadHandler();
    // file.download returns minimal valid backup with be_products
    const validFile = {
      meta: { schemaVersion: 1, sourceBranchId: 'BR-SRC', exportedBy: 'u', exportedAt: '', scope: {}, perCollectionCounts: {}, isAutoPreFresh: false },
      collections: { be_products: [] },
    };
    mockFileObj.download.mockResolvedValueOnce([Buffer.from(JSON.stringify(validFile))]);
    const req = mockReq({ body: { mode: 'clone', targetBranchId: 'BR-DEST', sourceStoragePath: 'backups/BR-SRC/manual-123.json' } });
    const res = mockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(mockFileObj.download).toHaveBeenCalled();
  });
});

// ─── E3 — branch-make-fresh.js ───────────────────────────────────────────────

describe('E3 — branch-make-fresh adversarial', () => {
  async function loadHandler() {
    const { default: h } = await import('../api/admin/branch-make-fresh.js');
    return h;
  }

  it('E3.1 — OPTIONS → 204', async () => {
    const handler = await loadHandler();
    const req = mockReq({ method: 'OPTIONS' });
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(204);
    expect(res.body).toBeNull();
  });

  it('E3.2 — Non-POST (PUT) → 405 METHOD_NOT_ALLOWED', async () => {
    const handler = await loadHandler();
    const req = mockReq({ method: 'PUT' });
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(405);
    expect(res.body.error).toBe('METHOD_NOT_ALLOWED');
  });

  it('E3.3 — Unauth → 401, no Storage calls', async () => {
    const handler = await loadHandler();
    const req = mockReq({ headers: { 'x-test-unauth': '1' } });
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(401);
    expect(mockBucketObj.file).not.toHaveBeenCalled();
  });

  it('E3.4 — Missing branchId → 400 MISSING_BRANCH_ID', async () => {
    const handler = await loadHandler();
    const req = mockReq({ body: { autoBackupRef: 'backups/BR-X/auto-pre-fresh-123.json' } });
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('MISSING_BRANCH_ID');
  });

  it('E3.5 + E3.6 + E3.7 — Missing / empty / non-string autoBackupRef → 400 AUTO_BACKUP_REQUIRED', async () => {
    const handler = await loadHandler();
    for (const autoBackupRef of [undefined, '', 42, null]) {
      const req = mockReq({ body: { branchId: 'BR-X', autoBackupRef } });
      const res = mockRes();
      await handler(req, res);
      expect(res.statusCode, `autoBackupRef=${JSON.stringify(autoBackupRef)}`).toBe(400);
      expect(res.body.error).toBe('AUTO_BACKUP_REQUIRED');
    }
  });

  it('E3.8 — autoBackupRef points to non-existent file → 400 AUTO_BACKUP_NOT_FOUND', async () => {
    // Override exists() to return false
    mockFileObj.exists.mockResolvedValueOnce([false]);
    const handler = await loadHandler();
    const req = mockReq({ body: { branchId: 'BR-X', autoBackupRef: 'backups/BR-X/auto-pre-fresh-ghost.json' } });
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toBe('AUTO_BACKUP_NOT_FOUND');
  });

  it('E3.9 — Successful wipe (no docs in branch) → 200 + deletedCounts all zeros', async () => {
    const handler = await loadHandler();
    // Default mocks: all queries return empty snaps + exists() returns true
    const req = mockReq({ body: { branchId: 'BR-WIPE', autoBackupRef: 'backups/BR-WIPE/auto-123.json' } });
    const res = mockRes();
    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.deletedCounts).toBeDefined();
    // Every collection should have 0 deletions (empty mock snaps)
    for (const count of Object.values(res.body.deletedCounts)) {
      expect(count).toBe(0);
    }
    expect(res.body.autoBackupRef).toBe('backups/BR-WIPE/auto-123.json');
  });

  it('E3.10 — Wipe returns auditId + auditId is a non-empty string', async () => {
    const handler = await loadHandler();
    const req = mockReq({ body: { branchId: 'BR-AUDIT', autoBackupRef: 'backups/BR-AUDIT/auto.json' } });
    const res = mockRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(typeof res.body.auditId).toBe('string');
    expect(res.body.auditId.length).toBeGreaterThan(5);
    expect(res.body.auditId).toMatch(/^branch-make-fresh-/);
  });
});

// ─── Cross-endpoint invariants ────────────────────────────────────────────────

describe('E0 — Cross-endpoint CORS + method-gate invariants', () => {
  it('E0.1 — All 3 endpoints respond to OPTIONS with 204 (no auth gate bypassed)', async () => {
    const [exportH, restoreH, freshH] = await Promise.all([
      import('../api/admin/branch-backup-export.js').then(m => m.default),
      import('../api/admin/branch-restore.js').then(m => m.default),
      import('../api/admin/branch-make-fresh.js').then(m => m.default),
    ]);
    for (const h of [exportH, restoreH, freshH]) {
      const req = mockReq({ method: 'OPTIONS' });
      const res = mockRes();
      await h(req, res);
      expect(res.statusCode).toBe(204);
    }
  });

  it('E0.2 — All 3 endpoints set CORS headers on every request', async () => {
    const [exportH, restoreH, freshH] = await Promise.all([
      import('../api/admin/branch-backup-export.js').then(m => m.default),
      import('../api/admin/branch-restore.js').then(m => m.default),
      import('../api/admin/branch-make-fresh.js').then(m => m.default),
    ]);
    for (const h of [exportH, restoreH, freshH]) {
      const req = mockReq({ method: 'OPTIONS' });
      const res = mockRes();
      await h(req, res);
      expect(res.headers['Access-Control-Allow-Origin']).toBe('*');
    }
  });

  it('E0.3 — All 3 endpoints reject non-POST with 405 (PATCH)', async () => {
    const [exportH, restoreH, freshH] = await Promise.all([
      import('../api/admin/branch-backup-export.js').then(m => m.default),
      import('../api/admin/branch-restore.js').then(m => m.default),
      import('../api/admin/branch-make-fresh.js').then(m => m.default),
    ]);
    for (const h of [exportH, restoreH, freshH]) {
      const req = mockReq({ method: 'PATCH' });
      const res = mockRes();
      await h(req, res);
      expect(res.statusCode).toBe(405);
      expect(res.body.ok).toBe(false);
      expect(res.body.error).toBe('METHOD_NOT_ALLOWED');
    }
  });

  it('E0.4 — All 3 endpoints gate on auth BEFORE any business logic', async () => {
    const [exportH, restoreH, freshH] = await Promise.all([
      import('../api/admin/branch-backup-export.js').then(m => m.default),
      import('../api/admin/branch-restore.js').then(m => m.default),
      import('../api/admin/branch-make-fresh.js').then(m => m.default),
    ]);
    for (const h of [exportH, restoreH, freshH]) {
      vi.clearAllMocks();
      const req = mockReq({ headers: { 'x-test-unauth': '1' }, body: { branchId: 'BR-X' } });
      const res = mockRes();
      await h(req, res);
      expect(res.statusCode).toBe(401);
      // Storage should never be touched on unauth path
      expect(mockBucketObj.file).not.toHaveBeenCalled();
    }
  });
});

// ─── V40 marker ──────────────────────────────────────────────────────────────
describe('E_META — V40 Bonus 1 institutional memory', () => {
  it('V40.B1.marker — test file is the branch-backup adversarial suite (Bonus 1)', () => {
    // Exists as a grep target for audit-all invariant catalog.
    // The presence of E1.* + E2.* + E3.* + E0.* confirms 30+ runtime tests.
    expect(true).toBe(true);
  });
});
