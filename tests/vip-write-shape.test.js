// VIP write-path shape locks (2026-07-04, spec ②).
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p) => fs.readFileSync(path.resolve(p), 'utf8');

describe('② VIP write shape', () => {
  it('W1 CDV toggle writes {vip, vipAt, vipBy} via scopedDataLayer.updateCustomer (transition-stamp pattern)', () => {
    const cdv = read('src/components/backend/CustomerDetailView.jsx');
    const m = cdv.match(/onToggleVip[\s\S]{0,900}/);
    expect(m, 'onToggleVip handler exists').toBeTruthy();
    const body = m[0];
    expect(body).toMatch(/scopedDataLayer\.js/);
    expect(body).toMatch(/vip:\s*next/);
    expect(body).toMatch(/vipAt:/);
    expect(body).toMatch(/vipBy:/);
  });

  it('W2 updateCustomerFromForm NEVER touches vip — the admin edit-form save cannot strip the flag (V145-class)', () => {
    const bc = read('src/lib/backendClient.js');
    const start = bc.indexOf('export async function updateCustomerFromForm');
    expect(start).toBeGreaterThan(-1);
    const fnBody = bc.slice(start, start + 8000);
    // patch is built from finalForm (normalizeCustomer output) — vip must not appear
    expect(fnBody).not.toMatch(/\bvip\b\s*:/);
    // and it writes via updateDoc/tx.update (top-level merge — untouched fields survive)
    expect(fnBody).toMatch(/updateDoc\(customerDoc\(customerId\), patch\)|tx\.update\(customerDoc\(customerId\), patch\)/);
    // customerValidation (the whitelist source of finalForm) knows nothing about vip
    expect(read('src/lib/customerValidation.js')).not.toMatch(/\bvip\b/);
  });

  it('W3 listenToVipCustomers — single-field where(vip==true) + __universal__ marker', () => {
    const bc = read('src/lib/backendClient.js');
    expect(bc).toMatch(/export function listenToVipCustomers/);
    expect(bc).toMatch(/where\('vip', '==', true\)/);
    expect(bc).toMatch(/listenToVipCustomers\.__universal__ = true/);
  });

  it('W4 scopedDataLayer re-exports listenToVipCustomers as a universal listener (BS-1)', () => {
    const sdl = read('src/lib/scopedDataLayer.js');
    expect(sdl).toMatch(/export const listenToVipCustomers = _makeUniversalListener\('listenToVipCustomers'\)/);
  });

  it('W5 gold-allowed rule recorded in 04-thai-ui.md (supersedes no-gold; red still forbidden)', () => {
    const rule = read('.claude/rules/04-thai-ui.md');
    expect(rule).toMatch(/สีทอง: อนุญาต/);
    expect(rule).toMatch(/สีแดงห้ามใช้กับตัวอักษรชื่อ\/HN/);
  });
});
