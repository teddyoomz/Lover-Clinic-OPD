// Phase 24.0 — server endpoint pure-helper unit tests + source-grep guards.
// Full integration testing (firebase-admin + cascade) is covered by the
// flow-simulate test which uses a separate fixture harness, plus the
// preview_eval verification at user-trigger time per Rule M.
import { describe, expect, it } from 'vitest';
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

  it('S4.1 endpoint imports verifyAdminToken', () => {
    expect(SERVER_TXT).toMatch(/import\s*\{[^}]*verifyAdminToken[^}]*\}\s*from\s*['"]\.\/_lib\/adminAuth\.js['"]/);
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
