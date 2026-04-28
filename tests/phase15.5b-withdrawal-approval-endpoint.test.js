// Phase 15.5B (2026-04-28) — Withdrawal approval admin endpoint tests.
//
// Endpoint: POST /api/admin/stock-withdrawal-approve
// Body: { action: 'approve' | 'reject', withdrawalId, note?, reason? }
//
// Approve = soft (audit + metadata, status STAYS at 0)
// Reject = flips status 0→3 (CANCELLED) + audit + reason
//
// Coverage:
//   PD — server source-grep regression guards (auth gate, CORS, method, body)
//   PE — server logic (mocked firebase-admin) for approve + reject + edge cases
//   PF — client wrapper (mocked fetch) — Bearer header, error surface
//   PG — UI button visibility / wiring (RTL render of WithdrawalDetailModal)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const API_PATH = join(process.cwd(), 'api', 'admin', 'stock-withdrawal-approve.js');
const CLIENT_PATH = join(process.cwd(), 'src', 'lib', 'stockWithdrawalApprovalClient.js');
const MODAL_PATH = join(process.cwd(), 'src', 'components', 'backend', 'WithdrawalDetailModal.jsx');

const API_SRC = readFileSync(API_PATH, 'utf-8');
const CLIENT_SRC = readFileSync(CLIENT_PATH, 'utf-8');
const MODAL_SRC = readFileSync(MODAL_PATH, 'utf-8');

// ════════════════════════════════════════════════════════════════════════════
// PD — Server source-grep regression guards
// ════════════════════════════════════════════════════════════════════════════
describe('Phase 15.5B.PD — server endpoint source-grep guards', () => {
  it('PD.1 endpoint exists with default export handler', () => {
    expect(API_SRC).toMatch(/export default async function handler/);
  });

  it('PD.2 admin gate via verifyAdminToken (FA1-FA5)', () => {
    expect(API_SRC).toMatch(/import\s*\{[^}]*verifyAdminToken[^}]*\}\s*from\s*['"]\.\/_lib\/adminAuth(?:\.js)?['"]/);
    expect(API_SRC).toMatch(/await\s+verifyAdminToken\(req,\s*res\)/);
    expect(API_SRC).toMatch(/if\s*\(!caller\)\s*return/);
  });

  it('PD.3 method gate: POST only (FA — non-POST → 405)', () => {
    expect(API_SRC).toMatch(/req\.method\s*!==\s*['"]POST['"]/);
    expect(API_SRC).toMatch(/405/);
  });

  it('PD.4 CORS preflight handled (OPTIONS → 204)', () => {
    expect(API_SRC).toMatch(/req\.method\s*===\s*['"]OPTIONS['"]/);
    expect(API_SRC).toMatch(/204/);
    expect(API_SRC).toMatch(/Access-Control-Allow-Methods/);
  });

  it('PD.5 input validation: action must be approve | reject', () => {
    expect(API_SRC).toMatch(/action\s*!==\s*['"]approve['"]\s*&&\s*action\s*!==\s*['"]reject['"]/);
  });

  it('PD.6 input validation: withdrawalId required (string)', () => {
    expect(API_SRC).toMatch(/withdrawalId.*required/i);
  });

  it('PD.7 firebase-admin Firestore (NOT client SDK)', () => {
    expect(API_SRC).toMatch(/from\s*['"]firebase-admin\/firestore['"]/);
    expect(API_SRC).not.toMatch(/from\s*['"]firebase\/firestore['"]/);
  });

  it('PD.8 type=15 audit movement on approve (WITHDRAWAL_APPROVE)', () => {
    expect(API_SRC).toMatch(/type:\s*15/);
  });

  it('PD.9 type=16 audit movement on reject (WITHDRAWAL_REJECT)', () => {
    expect(API_SRC).toMatch(/type:\s*16/);
  });

  it('PD.10 audit-only movements (qty=0, skipped:true)', () => {
    // Both approve + reject emit qty:0 movements with skipped:true so they
    // don't contribute to conservation invariants.
    expect(API_SRC).toMatch(/qty:\s*0/);
    expect(API_SRC).toMatch(/skipped:\s*true/);
  });

  it('PD.11 reject flips status 0→3 (CANCELLED)', () => {
    // handleReject must set status: 3 atomically with the audit movement
    expect(API_SRC).toMatch(/handleReject[\s\S]*?status:\s*3/);
  });

  it('PD.12 approve PRESERVES status (no status field in approve batch.update payload)', () => {
    // handleApprove must NOT change status — soft approval. Lock the
    // batch.update payload object scope only (not the status guard).
    const fnMatch = API_SRC.match(/async function handleApprove[\s\S]*?\nasync function handleReject/);
    expect(fnMatch).toBeTruthy();
    const block = fnMatch[0];
    // Extract the batch.update(withdrawalRef, { ... }) payload exactly.
    const updateMatch = block.match(/batch\.update\(withdrawalRef,\s*\{([\s\S]*?)\}\s*\)/);
    expect(updateMatch, 'handleApprove must call batch.update(withdrawalRef, ...)').toBeTruthy();
    const payload = updateMatch[1];
    // No status: <number> in the approve payload
    expect(payload).not.toMatch(/\bstatus:\s*\d/);
  });

  it('PD.13 idempotent approve (alreadyApproved early return)', () => {
    expect(API_SRC).toMatch(/alreadyApproved:\s*true/);
  });

  it('PD.14 status guard: only PENDING (0) can be approved/rejected', () => {
    expect(API_SRC).toMatch(/Number\(data\.status\)\s*!==\s*0/);
  });

  it('PD.15 atomic batch: single batch.commit per action', () => {
    // handleApprove + handleReject each use db.batch() + batch.commit()
    const matches = API_SRC.match(/db\.batch\(\)/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2); // approve + reject

    const commitMatches = API_SRC.match(/batch\.commit\(\)/g) || [];
    expect(commitMatches.length).toBeGreaterThanOrEqual(2);
  });

  it('PD.16 V14 lock: normalizeAuditUser ensures no undefined user fields', () => {
    expect(API_SRC).toMatch(/function normalizeAuditUser/);
    expect(API_SRC).toMatch(/userId:\s*String\(/);
    expect(API_SRC).toMatch(/userName:\s*String\(/);
  });

  it('PD.17 input bound: note + reason capped at 500 chars', () => {
    expect(API_SRC).toMatch(/\.slice\(0,\s*500\)/);
  });

  it('PD.18 sourceDocPath links movement back to withdrawal', () => {
    expect(API_SRC).toMatch(/be_stock_withdrawals\/\$\{withdrawalId\}/);
    expect(API_SRC).toMatch(/sourceDocPath/);
  });

  it('PD.19 linkedWithdrawalId on movement (audit query support)', () => {
    expect(API_SRC).toMatch(/linkedWithdrawalId:\s*withdrawalId/);
  });

  it('PD.20 Phase 15.5B marker comment', () => {
    expect(API_SRC).toMatch(/Phase 15\.5B \(2026-04-28\)/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PE — Server logic (mocked firebase-admin) — approve + reject scenarios
// ════════════════════════════════════════════════════════════════════════════
describe('Phase 15.5B.PE — server logic (mocked firebase-admin)', () => {
  let withdrawalDoc;
  let batchUpdateCalls;
  let batchSetCalls;
  let batchCommits;
  let mockGet;
  let mockBatch;

  beforeEach(() => {
    batchUpdateCalls = [];
    batchSetCalls = [];
    batchCommits = 0;
    mockGet = vi.fn(async () => ({ exists: !!withdrawalDoc, data: () => withdrawalDoc }));
    mockBatch = vi.fn(() => ({
      update: vi.fn((ref, data) => batchUpdateCalls.push({ path: ref.__path, data })),
      set: vi.fn((ref, data) => batchSetCalls.push({ path: ref.__path, data })),
      commit: vi.fn(async () => { batchCommits += 1; }),
    }));
    vi.resetModules();

    // Mock firebase-admin
    vi.doMock('firebase-admin/app', () => ({
      initializeApp: vi.fn(),
      cert: vi.fn(),
      getApps: vi.fn(() => [{}]),
      getApp: vi.fn(() => ({})),
    }));
    vi.doMock('firebase-admin/firestore', () => ({
      getFirestore: vi.fn(() => ({
        doc: (path) => ({ __path: path, get: mockGet }),
        batch: mockBatch,
      })),
      FieldValue: { serverTimestamp: () => 'SERVER_TS' },
    }));
    // Mock admin auth
    vi.doMock('../api/admin/_lib/adminAuth.js', () => ({
      verifyAdminToken: vi.fn(async (req, res) => {
        const auth = req.headers?.authorization || '';
        if (!auth.startsWith('Bearer ')) {
          res.status(401).json({ error: 'unauth' });
          return null;
        }
        return { uid: 'admin-uid-1', email: 'admin@loverclinic.com', isAdmin: true };
      }),
    }));
  });

  function makeReq(body, headers = { authorization: 'Bearer fake' }) {
    return {
      method: 'POST',
      headers,
      body,
    };
  }

  function makeRes() {
    let statusCode = 200;
    let payload = null;
    return {
      setHeader: () => {},
      status(c) { statusCode = c; return this; },
      json(p) { payload = p; return this; },
      end() { return this; },
      get _status() { return statusCode; },
      get _payload() { return payload; },
    };
  }

  it('PE.1 method != POST → 405', async () => {
    const handler = (await import('../api/admin/stock-withdrawal-approve.js')).default;
    const req = { method: 'GET', headers: {}, body: {} };
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(405);
  });

  it('PE.2 OPTIONS preflight → 204', async () => {
    const handler = (await import('../api/admin/stock-withdrawal-approve.js')).default;
    const req = { method: 'OPTIONS', headers: {}, body: {} };
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(204);
  });

  it('PE.3 missing Bearer token → 401', async () => {
    const handler = (await import('../api/admin/stock-withdrawal-approve.js')).default;
    const req = makeReq({ action: 'approve', withdrawalId: 'WDR-1' }, {});
    const res = makeRes();
    await handler(req, res);
    expect(res._status).toBe(401);
  });

  it('PE.4 invalid action → 400', async () => {
    const handler = (await import('../api/admin/stock-withdrawal-approve.js')).default;
    const res = makeRes();
    await handler(makeReq({ action: 'bogus', withdrawalId: 'WDR-1' }), res);
    expect(res._status).toBe(400);
    expect(res._payload.error).toMatch(/action must be/);
  });

  it('PE.5 missing withdrawalId → 400', async () => {
    const handler = (await import('../api/admin/stock-withdrawal-approve.js')).default;
    const res = makeRes();
    await handler(makeReq({ action: 'approve' }), res);
    expect(res._status).toBe(400);
    expect(res._payload.error).toMatch(/withdrawalId/);
  });

  it('PE.6 happy approve: audit + metadata, status STAYS 0', async () => {
    withdrawalDoc = {
      status: 0,
      sourceLocationId: 'BR-1',
      destinationLocationId: 'WH-CENTRAL',
    };
    const handler = (await import('../api/admin/stock-withdrawal-approve.js')).default;
    const res = makeRes();
    await handler(makeReq({ action: 'approve', withdrawalId: 'WDR-1', note: 'ok' }), res);
    expect(res._status).toBe(200);
    expect(res._payload).toMatchObject({ withdrawalId: 'WDR-1', status: 0 });
    expect(res._payload.approvedAt).toBeTruthy();
    expect(res._payload.movementId).toMatch(/^MVT-/);

    // 1 update (withdrawal metadata) + 1 set (audit movement) + 1 commit
    expect(batchUpdateCalls).toHaveLength(1);
    expect(batchSetCalls).toHaveLength(1);
    expect(batchCommits).toBe(1);

    // Withdrawal update has approval metadata, NO status field
    const upd = batchUpdateCalls[0].data;
    expect(upd.approvedAt).toBeTruthy();
    expect(upd.approvedByUser).toMatchObject({ userId: 'admin-uid-1' });
    expect(upd.approvalNote).toBe('ok');
    expect(upd.status).toBeUndefined(); // soft approval — status preserved

    // Movement is type=15 audit-only
    const mvt = batchSetCalls[0].data;
    expect(mvt.type).toBe(15);
    expect(mvt.qty).toBe(0);
    expect(mvt.skipped).toBe(true);
    expect(mvt.linkedWithdrawalId).toBe('WDR-1');
    expect(mvt.branchId).toBe('BR-1');
    expect(mvt.branchIds).toEqual(['BR-1', 'WH-CENTRAL']);
  });

  it('PE.7 happy reject: status 0→3 + audit + reason', async () => {
    withdrawalDoc = {
      status: 0,
      sourceLocationId: 'WH-CENTRAL',
      destinationLocationId: 'BR-1',
    };
    const handler = (await import('../api/admin/stock-withdrawal-approve.js')).default;
    const res = makeRes();
    await handler(makeReq({ action: 'reject', withdrawalId: 'WDR-2', reason: 'low priority' }), res);
    expect(res._status).toBe(200);
    expect(res._payload).toMatchObject({ withdrawalId: 'WDR-2', status: 3 });

    expect(batchUpdateCalls).toHaveLength(1);
    expect(batchSetCalls).toHaveLength(1);
    expect(batchCommits).toBe(1);

    const upd = batchUpdateCalls[0].data;
    expect(upd.status).toBe(3); // CANCELLED
    expect(upd.rejectedAt).toBeTruthy();
    expect(upd.rejectionReason).toBe('low priority');
    expect(upd.rejectedByUser).toMatchObject({ userId: 'admin-uid-1' });

    const mvt = batchSetCalls[0].data;
    expect(mvt.type).toBe(16);
    expect(mvt.qty).toBe(0);
    expect(mvt.skipped).toBe(true);
  });

  it('PE.8 approve on non-pending → 500 with descriptive error', async () => {
    withdrawalDoc = { status: 1, sourceLocationId: 'BR-1', destinationLocationId: 'WH-CENTRAL' };
    const handler = (await import('../api/admin/stock-withdrawal-approve.js')).default;
    const res = makeRes();
    await handler(makeReq({ action: 'approve', withdrawalId: 'WDR-3' }), res);
    expect(res._status).toBe(500);
    expect(res._payload.error).toMatch(/status=1/);
  });

  it('PE.9 reject on non-existent → 500 not found', async () => {
    withdrawalDoc = null; // doc doesn't exist
    const handler = (await import('../api/admin/stock-withdrawal-approve.js')).default;
    const res = makeRes();
    await handler(makeReq({ action: 'reject', withdrawalId: 'WDR-NOT-EXIST' }), res);
    expect(res._status).toBe(500);
    expect(res._payload.error).toMatch(/not found/);
  });

  it('PE.10 idempotent approve: already-approved by same admin returns alreadyApproved', async () => {
    withdrawalDoc = {
      status: 0,
      sourceLocationId: 'BR-1',
      destinationLocationId: 'WH-CENTRAL',
      approvedAt: '2026-04-28T00:00:00Z',
      approvedByUser: { userId: 'admin-uid-1', userName: 'admin' },
    };
    const handler = (await import('../api/admin/stock-withdrawal-approve.js')).default;
    const res = makeRes();
    await handler(makeReq({ action: 'approve', withdrawalId: 'WDR-DUP' }), res);
    expect(res._status).toBe(200);
    expect(res._payload.alreadyApproved).toBe(true);
    // No new write
    expect(batchCommits).toBe(0);
  });

  it('PE.11 long note bounded to 500 chars', async () => {
    withdrawalDoc = {
      status: 0,
      sourceLocationId: 'BR-1',
      destinationLocationId: 'WH-CENTRAL',
    };
    const longNote = 'X'.repeat(800);
    const handler = (await import('../api/admin/stock-withdrawal-approve.js')).default;
    const res = makeRes();
    await handler(makeReq({ action: 'approve', withdrawalId: 'WDR-LONG', note: longNote }), res);
    expect(res._status).toBe(200);
    expect(batchUpdateCalls[0].data.approvalNote).toHaveLength(500);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PF — Client wrapper (mocked fetch)
// ════════════════════════════════════════════════════════════════════════════
describe('Phase 15.5B.PF — client wrapper', () => {
  let mockFetch;

  beforeEach(() => {
    vi.resetModules();
    mockFetch = vi.fn();
    global.fetch = mockFetch;

    vi.doMock('../src/firebase.js', () => ({
      auth: {
        currentUser: {
          getIdToken: vi.fn(async () => 'fake-id-token'),
        },
      },
    }));
  });

  it('PF.1 approveStockWithdrawal sends POST with Bearer token', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ withdrawalId: 'WDR-1', status: 0, approvedAt: '2026' }),
    });
    const { approveStockWithdrawal } = await import('../src/lib/stockWithdrawalApprovalClient.js');
    const result = await approveStockWithdrawal({ withdrawalId: 'WDR-1', note: 'ok' });
    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toBe('/api/admin/stock-withdrawal-approve');
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe('Bearer fake-id-token');
    expect(opts.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(opts.body);
    expect(body).toEqual({ action: 'approve', withdrawalId: 'WDR-1', note: 'ok' });
    expect(result.withdrawalId).toBe('WDR-1');
  });

  it('PF.2 rejectStockWithdrawal sends action=reject', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ withdrawalId: 'WDR-2', status: 3, rejectedAt: '2026' }),
    });
    const { rejectStockWithdrawal } = await import('../src/lib/stockWithdrawalApprovalClient.js');
    await rejectStockWithdrawal({ withdrawalId: 'WDR-2', reason: 'no' });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).toEqual({ action: 'reject', withdrawalId: 'WDR-2', reason: 'no' });
  });

  it('PF.3 throws Thai message on non-2xx', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'Withdrawal WDR-X not found' }),
    });
    const { approveStockWithdrawal } = await import('../src/lib/stockWithdrawalApprovalClient.js');
    await expect(approveStockWithdrawal({ withdrawalId: 'WDR-X' })).rejects.toThrow(/not found/);
  });

  it('PF.4 throws when not logged in', async () => {
    vi.resetModules();
    vi.doMock('../src/firebase.js', () => ({ auth: { currentUser: null } }));
    const { approveStockWithdrawal } = await import('../src/lib/stockWithdrawalApprovalClient.js');
    await expect(approveStockWithdrawal({ withdrawalId: 'WDR-Y' })).rejects.toThrow(/login/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PG — UI source-grep (WithdrawalDetailModal admin section)
// ════════════════════════════════════════════════════════════════════════════
describe('Phase 15.5B.PG — UI buttons + reject modal', () => {
  it('PG.1 imports approveStockWithdrawal + rejectStockWithdrawal', () => {
    expect(MODAL_SRC).toMatch(/approveStockWithdrawal/);
    expect(MODAL_SRC).toMatch(/rejectStockWithdrawal/);
  });

  it('PG.2 useTabAccess() for admin gate (NOT email check)', () => {
    expect(MODAL_SRC).toMatch(/useTabAccess/);
    expect(MODAL_SRC).toMatch(/isAdmin/);
  });

  it('PG.3 admin-action section visible only when status===0 && isAdmin', () => {
    // Render condition `isAdmin && status === 0 &&` precedes the section
    expect(MODAL_SRC).toMatch(/isAdmin\s*&&\s*status\s*===\s*0\s*&&/);
  });

  it('PG.4 testIds for buttons (RTL-friendly)', () => {
    expect(MODAL_SRC).toMatch(/data-testid=["']withdrawal-approve-btn["']/);
    expect(MODAL_SRC).toMatch(/data-testid=["']withdrawal-reject-btn["']/);
    expect(MODAL_SRC).toMatch(/data-testid=["']withdrawal-reject-confirm-btn["']/);
    expect(MODAL_SRC).toMatch(/data-testid=["']withdrawal-admin-action-section["']/);
    expect(MODAL_SRC).toMatch(/data-testid=["']withdrawal-reject-modal["']/);
  });

  it('PG.5 reject modal shown via state flag + close-on-backdrop', () => {
    expect(MODAL_SRC).toMatch(/setRejectModal\(true\)/);
    expect(MODAL_SRC).toMatch(/setRejectModal\(false\)/);
  });

  it('PG.6 input fields bounded by maxLength=500 (mirrors server cap)', () => {
    const matches = MODAL_SRC.match(/maxLength=\{?500\}?/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(2); // approval note + reject reason
  });

  it('PG.7 onAfterAction callback fires after success', () => {
    expect(MODAL_SRC).toMatch(/onAfterAction\?\.\(\)/);
  });

  it('PG.8 actionPending state guards against double-click', () => {
    expect(MODAL_SRC).toMatch(/setActionPending/);
    expect(MODAL_SRC).toMatch(/disabled=\{!!actionPending\}/);
  });

  it('PG.9 success/error banners with testIds', () => {
    expect(MODAL_SRC).toMatch(/data-testid=["']withdrawal-action-error["']/);
    expect(MODAL_SRC).toMatch(/data-testid=["']withdrawal-action-success["']/);
  });

  it('PG.10 Phase 15.5B marker comment', () => {
    expect(MODAL_SRC).toMatch(/Phase 15\.5B \(2026-04-28\)/);
  });

  it('PG.11 already-approved state shows audit info (not buttons)', () => {
    // When data.approvedAt is set, the button should NOT render but
    // the audit info SHOULD render
    expect(MODAL_SRC).toMatch(/data\.approvedAt\s*\?/);
    expect(MODAL_SRC).toMatch(/อนุมัติแล้วโดย/);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// PH — Client source-grep
// ════════════════════════════════════════════════════════════════════════════
describe('Phase 15.5B.PH — client wrapper source guards', () => {
  it('PH.1 named exports approveStockWithdrawal + rejectStockWithdrawal', () => {
    expect(CLIENT_SRC).toMatch(/^export async function approveStockWithdrawal/m);
    expect(CLIENT_SRC).toMatch(/^export async function rejectStockWithdrawal/m);
  });

  it('PH.2 uses Firebase auth.currentUser.getIdToken (V32-tris-quater pattern)', () => {
    expect(CLIENT_SRC).toMatch(/auth\.currentUser/);
    expect(CLIENT_SRC).toMatch(/getIdToken\(\)/);
  });

  it('PH.3 endpoint URL matches server file path', () => {
    expect(CLIENT_SRC).toMatch(/['"]\/api\/admin\/stock-withdrawal-approve['"]/);
  });

  it('PH.4 throws if not logged in', () => {
    expect(CLIENT_SRC).toMatch(/ต้อง login ก่อน/);
  });

  it('PH.5 surfaces server error message in throw', () => {
    expect(CLIENT_SRC).toMatch(/err\.error/);
  });
});
