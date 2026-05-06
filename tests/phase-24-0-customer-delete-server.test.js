// Phase 24.0 — server endpoint pure-helper unit tests + source-grep guards.
// Full integration testing (firebase-admin + cascade) is covered by the
// flow-simulate test which uses a separate fixture harness, plus the
// preview_eval verification at user-trigger time per Rule M.
import { describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import {
  assertHasDeletePermission,
  validateAuthorizedBy,
  classifyOrigin,
} from '../api/admin/delete-customer-cascade.js';

describe('Phase 24.0 / S1 — assertHasDeletePermission', () => {
  it('S1.1 admin claim → true', () => {
    expect(assertHasDeletePermission({ admin: true })).toBe(true);
  });
  it('S1.2 customer_delete claim → true', () => {
    expect(assertHasDeletePermission({ customer_delete: true })).toBe(true);
  });
  it('S1.3 both claims → true', () => {
    expect(assertHasDeletePermission({ admin: true, customer_delete: true })).toBe(true);
  });
  it('S1.4 neither claim → false', () => {
    expect(assertHasDeletePermission({})).toBe(false);
    expect(assertHasDeletePermission({ system_config_management: true })).toBe(false);
  });
  it('S1.5 null/undefined → false', () => {
    expect(assertHasDeletePermission(null)).toBe(false);
    expect(assertHasDeletePermission(undefined)).toBe(false);
  });
  it('S1.6 string-truthy claim values still false (must be strict ===true)', () => {
    expect(assertHasDeletePermission({ admin: 'true' })).toBe(false);
    expect(assertHasDeletePermission({ customer_delete: 1 })).toBe(false);
  });
});

describe('Phase 24.0 / S2 — validateAuthorizedBy', () => {
  const valid = {
    staffId: 'BS-1', staffName: 'A',
    assistantId: 'BD-1', assistantName: 'B',
    doctorId: 'BD-2', doctorName: 'C',
  };
  it('S2.1 fully populated → null (no error)', () => {
    expect(validateAuthorizedBy(valid)).toBeNull();
  });
  it('S2.2 missing staffId → error string', () => {
    const out = validateAuthorizedBy({ ...valid, staffId: '' });
    expect(out).toMatch(/staffId/);
  });
  it('S2.3 missing assistantId → error string', () => {
    const out = validateAuthorizedBy({ ...valid, assistantId: '' });
    expect(out).toMatch(/assistantId/);
  });
  it('S2.4 missing doctorId → error string', () => {
    const out = validateAuthorizedBy({ ...valid, doctorId: '' });
    expect(out).toMatch(/doctorId/);
  });
  it('S2.5 missing each name field → distinct error', () => {
    expect(validateAuthorizedBy({ ...valid, staffName: '' })).toMatch(/staffName/);
    expect(validateAuthorizedBy({ ...valid, assistantName: '' })).toMatch(/assistantName/);
    expect(validateAuthorizedBy({ ...valid, doctorName: '' })).toMatch(/doctorName/);
  });
  it('S2.6 null/undefined → "authorizedBy required"', () => {
    expect(validateAuthorizedBy(null)).toBe('authorizedBy required');
    expect(validateAuthorizedBy(undefined)).toBe('authorizedBy required');
  });
  it('S2.7 whitespace-only string → error', () => {
    expect(validateAuthorizedBy({ ...valid, staffId: '   ' })).toMatch(/staffId/);
  });
  it('S2.8 non-string types rejected', () => {
    expect(validateAuthorizedBy({ ...valid, staffId: 12345 })).toMatch(/staffId/);
  });
});

describe('Phase 24.0 / S3 — classifyOrigin', () => {
  it('S3.1 isManualEntry: true → "manual"', () => {
    expect(classifyOrigin({ isManualEntry: true })).toBe('manual');
  });
  it('S3.2 isManualEntry: false → "proclinic-cloned"', () => {
    expect(classifyOrigin({ isManualEntry: false })).toBe('proclinic-cloned');
  });
  it('S3.3 isManualEntry: undefined → "proclinic-cloned" (default-safe)', () => {
    expect(classifyOrigin({})).toBe('proclinic-cloned');
    expect(classifyOrigin({ isManualEntry: null })).toBe('proclinic-cloned');
  });
  it('S3.4 null customer → "proclinic-cloned"', () => {
    expect(classifyOrigin(null)).toBe('proclinic-cloned');
  });
});

describe('Phase 24.0 / S4 — endpoint surface (source-grep guards)', () => {
  const SERVER_TXT = fs.readFileSync('api/admin/delete-customer-cascade.js', 'utf-8');

  it('S4.1 endpoint imports verifyAdminOrPermissionToken (Issue #3 fix — accepts customer_delete claim)', () => {
    expect(SERVER_TXT).toMatch(/import\s*\{[^}]*verifyAdminOrPermissionToken[^}]*\}\s*from\s*['"]\.\/_lib\/adminAuth\.js['"]/);
    // Anti-regression: must NOT use verifyAdminToken (admin-only gate would
    // shut out legitimate non-admin perm-bearers).
    expect(SERVER_TXT).not.toMatch(/import\s*\{[^}]*verifyAdminToken[^}]*\}\s*from\s*['"]\.\/_lib\/adminAuth\.js['"]/);
    expect(SERVER_TXT).toMatch(/verifyAdminOrPermissionToken\(req,\s*res,\s*['"]customer_delete['"]\)/);
  });

  it('S4.2 endpoint declares CUSTOMER_CASCADE_COLLECTIONS list (11 entries)', () => {
    expect(SERVER_TXT).toMatch(/be_treatments[\s\S]{0,800}be_customer_link_tokens/);
    const block = SERVER_TXT.match(/CUSTOMER_CASCADE_COLLECTIONS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
    expect(block).toBeTruthy();
    const entries = block[1].match(/'be_[a-z_]+'/g) || [];
    expect(entries.length).toBe(11);
  });

  it('S4.3 endpoint writes audit doc with prefix customer-delete-', () => {
    expect(SERVER_TXT).toMatch(/customer-delete-\$\{customerId\}-\$\{ts\}-\$\{rand\}/);
  });

  it('S4.4 endpoint cross-validates authorizedBy against branch roster', () => {
    expect(SERVER_TXT).toMatch(/inBranchRoster/);
  });

  it('S4.5 endpoint uses crypto-secure rand (not Math.random)', () => {
    expect(SERVER_TXT).toMatch(/randomBytes\(/);
    expect(SERVER_TXT).not.toMatch(/Math\.random\(\)/);
  });
});

describe('Phase 24.0 / S5 — shared CUSTOMER_CASCADE_COLLECTIONS parity (client + server)', () => {
  it('S5.1 client + server lists are identical (11 entries, same order)', () => {
    const clientTxt = fs.readFileSync('src/lib/backendClient.js', 'utf-8');
    const serverTxt = fs.readFileSync('api/admin/delete-customer-cascade.js', 'utf-8');
    function parseList(src) {
      const m = src.match(/CUSTOMER_CASCADE_COLLECTIONS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
      if (!m) throw new Error('CUSTOMER_CASCADE_COLLECTIONS not found');
      return (m[1].match(/'(be_[a-z_]+)'/g) || []).map(s => s.slice(1, -1));
    }
    expect(parseList(clientTxt)).toEqual(parseList(serverTxt));
  });
});

// ─── S6 — verifyAdminOrPermissionToken helper unit tests (Issue #3) ─────────
// Verifies the new helper accepts the perm claim path that verifyAdminToken
// rejected. Mocks firebase-admin/auth so we can drive the token-claim payload
// without requiring real credentials.
describe('Phase 24.0 / S6 — verifyAdminOrPermissionToken helper', () => {
  // Lazy import + reset module state per test so the mock takes effect.
  async function loadHelperWithMock(mockVerifyIdToken) {
    vi.resetModules();
    vi.doMock('firebase-admin/app', () => ({
      initializeApp: () => ({}),
      cert: () => ({}),
      getApps: () => [{}],
      getApp: () => ({}),
    }));
    vi.doMock('firebase-admin/auth', () => ({
      getAuth: () => ({ verifyIdToken: mockVerifyIdToken }),
    }));
    const mod = await import('../api/admin/_lib/adminAuth.js');
    mod.__resetAdminAuthForTests();
    return mod;
  }

  function makeRes() {
    return {
      _status: 0,
      _body: null,
      status(code) { this._status = code; return this; },
      json(body) { this._body = body; return this; },
    };
  }

  it('S6.1 admin claim → returns caller object with isAdmin=true', async () => {
    const { verifyAdminOrPermissionToken } = await loadHelperWithMock(async () => ({
      uid: 'u1', email: 'admin@x.com', admin: true,
    }));
    const req = { headers: { authorization: 'Bearer FAKE' } };
    const res = makeRes();
    const caller = await verifyAdminOrPermissionToken(req, res, 'customer_delete');
    expect(caller).not.toBeNull();
    expect(caller.uid).toBe('u1');
    expect(caller.isAdmin).toBe(true);
    expect(res._status).toBe(0);
  });

  it('S6.2 perm claim only → returns caller object (KEY FIX — non-admin with permission)', async () => {
    const { verifyAdminOrPermissionToken } = await loadHelperWithMock(async () => ({
      uid: 'u2', email: 'staff@x.com', customer_delete: true,
    }));
    const req = { headers: { authorization: 'Bearer FAKE' } };
    const res = makeRes();
    const caller = await verifyAdminOrPermissionToken(req, res, 'customer_delete');
    expect(caller).not.toBeNull();
    expect(caller.isAdmin).toBe(false);
    expect(caller.hasPermission).toBe(true);
    expect(res._status).toBe(0);
  });

  it('S6.3 neither claim → returns null + 403', async () => {
    const { verifyAdminOrPermissionToken } = await loadHelperWithMock(async () => ({
      uid: 'u3', email: 'rando@x.com',
    }));
    const req = { headers: { authorization: 'Bearer FAKE' } };
    const res = makeRes();
    const caller = await verifyAdminOrPermissionToken(req, res, 'customer_delete');
    expect(caller).toBeNull();
    expect(res._status).toBe(403);
    expect(res._body?.success).toBe(false);
    expect(res._body?.error).toMatch(/customer_delete/);
  });

  it('S6.4a missing token → returns null + 401', async () => {
    const { verifyAdminOrPermissionToken } = await loadHelperWithMock(async () => ({}));
    const req = { headers: {} };
    const res = makeRes();
    const caller = await verifyAdminOrPermissionToken(req, res, 'customer_delete');
    expect(caller).toBeNull();
    expect(res._status).toBe(401);
  });

  it('S6.4b invalid token → returns null + 401', async () => {
    const { verifyAdminOrPermissionToken } = await loadHelperWithMock(async () => {
      throw Object.assign(new Error('bad'), { code: 'auth/invalid-id-token' });
    });
    const req = { headers: { authorization: 'Bearer BAD' } };
    const res = makeRes();
    const caller = await verifyAdminOrPermissionToken(req, res, 'customer_delete');
    expect(caller).toBeNull();
    expect(res._status).toBe(401);
  });

  it('S6.5 helper exported from adminAuth.js (source-grep guard)', () => {
    const TXT = fs.readFileSync('api/admin/_lib/adminAuth.js', 'utf-8');
    expect(TXT).toMatch(/export\s+async\s+function\s+verifyAdminOrPermissionToken/);
  });
});

// ─── S7 — action='preview' branch (Issue #1) ─────────────────────────────────
// The endpoint must accept action='preview' and return cascade counts WITHOUT
// deleting anything. Pre-confirm the modal can show counts to the admin.
describe('Phase 24.0 / S7 — action=preview branch', () => {
  const SERVER_TXT = fs.readFileSync('api/admin/delete-customer-cascade.js', 'utf-8');

  it('S7.1 endpoint switches on action discriminator (action === "preview")', () => {
    expect(SERVER_TXT).toMatch(/action\s*===\s*['"]preview['"]/);
    // action variable derived from req.body?.action
    expect(SERVER_TXT).toMatch(/req\.body\?\.\s*action/);
  });

  it('S7.2 preview branch returns cascadeCounts WITHOUT calling batchOp.commit (no delete)', () => {
    // Locate the preview branch body — bounded by `if (action === 'preview')`
    // and the start of the next `try` for the delete path.
    const m = SERVER_TXT.match(/if\s*\(\s*action\s*===\s*['"]preview['"]\s*\)[\s\S]*?\n\s{0,4}\}\s*\n\s*\n\s*const\s+authorizedBy/);
    expect(m).toBeTruthy();
    const branch = m[0];
    // Must return cascadeCounts.
    expect(branch).toMatch(/cascadeCounts/);
    expect(branch).toMatch(/exists:\s*true/);
    // Must NOT batch.commit (no actual delete in preview path).
    expect(branch).not.toMatch(/batchOp\.commit/);
    // Must NOT iterate refsToDelete or call ref.delete.
    expect(branch).not.toMatch(/refsToDelete/);
  });

  it('S7.3 preview branch does NOT write audit doc (no mutation = no audit)', () => {
    const m = SERVER_TXT.match(/if\s*\(\s*action\s*===\s*['"]preview['"]\s*\)[\s\S]*?\n\s{0,4}\}\s*\n\s*\n\s*const\s+authorizedBy/);
    expect(m).toBeTruthy();
    const branch = m[0];
    expect(branch).not.toMatch(/be_admin_audit/);
    expect(branch).not.toMatch(/auditRef/);
    expect(branch).not.toMatch(/auditPayload/);
    expect(branch).not.toMatch(/customer-delete-\$\{customerId\}-\$\{ts\}/);
  });
});
