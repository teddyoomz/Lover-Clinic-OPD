// be_assessments backup coverage (2026-06-18) — ED Score rounds must be in every
// customer-scoped backup/restore/cascade list, the client list must equal the single
// source, the response-key maps must cover all 17, and a drift catcher prevents the
// next new customer-scoped collection from silently missing the cascade list (V122/V196).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { CUSTOMER_CASCADE_COLLECTIONS_FULL } from '../src/lib/customerBackupCore.js';

const READ = (p) => readFileSync(p, 'utf8');
const CUSTOMER_BACKUP = READ('src/lib/customerBackupCore.js');
const WHOLE_SYS = READ('src/lib/wholeSystemBackupCore.js');
const BRANCH_CORE = READ('src/lib/branchBackupCore.js');
const BRANCH_BUCKETS = READ('src/lib/branchBackupBuckets.js');
const BE_CLIENT = READ('src/lib/backendClient.js');
const DEL_CLIENT = READ('src/lib/customerDeleteClient.js');
const DEL_SERVER = READ('api/admin/delete-customer-cascade.js');

// keys that all 17 cascade collections map to (camelCase response keys; client+server lockstep)
const RESPONSE_KEYS = {
  be_treatments: 'treatments', be_sales: 'sales', be_deposits: 'deposits', be_customer_wallets: 'wallets',
  be_wallet_transactions: 'walletTransactions', be_memberships: 'memberships',
  be_point_transactions: 'pointTransactions', be_appointments: 'appointments',
  be_course_changes: 'courseChanges', be_link_requests: 'linkRequests',
  be_customer_link_tokens: 'customerLinkTokens', be_quotations: 'quotations',
  be_vendor_sales: 'vendorSales', be_online_sales: 'onlineSales',
  be_sale_insurance_claims: 'saleInsuranceClaims', be_recalls: 'recalls', be_assessments: 'assessments',
};

describe('A: be_assessments inclusion in every customer-scoped / universal list', () => {
  it('A1 in CUSTOMER_CASCADE_COLLECTIONS_FULL (the single source)', () => {
    expect(CUSTOMER_CASCADE_COLLECTIONS_FULL).toContain('be_assessments');
    expect(CUSTOMER_CASCADE_COLLECTIONS_FULL.length).toBe(17);
  });
  it('A2 in CUSTOMER_ONLY_UNIVERSAL (whole-system customer-only backup)', () => {
    const block = WHOLE_SYS.slice(WHOLE_SYS.indexOf('CUSTOMER_ONLY_UNIVERSAL'), WHOLE_SYS.indexOf('CUSTOMER_ONLY_UNIVERSAL') + 300);
    expect(block).toMatch(/['"]be_assessments['"]/);
  });
  it('A3 in branchBackupCore UNIVERSAL set (branch backup round-trips it)', () => {
    const block = BRANCH_CORE.slice(BRANCH_CORE.indexOf('const UNIVERSAL'), BRANCH_CORE.indexOf('const UNIVERSAL') + 600);
    expect(block).toMatch(/['"]be_assessments['"]/);
  });
});

describe('B: single-source reconcile + response-key lockstep', () => {
  it('B1 client CUSTOMER_CASCADE_COLLECTIONS === the single-source FULL (re-export, not a stale copy)', () => {
    expect(BE_CLIENT).toMatch(/export const CUSTOMER_CASCADE_COLLECTIONS\s*=\s*CUSTOMER_CASCADE_COLLECTIONS_FULL\s*;/);
    expect(BE_CLIENT).toMatch(/import\s*\{\s*CUSTOMER_CASCADE_COLLECTIONS_FULL\s*\}\s*from\s*['"]\.\/customerBackupCore\.js['"]/);
  });
  it('B2 client COL_TO_RESPONSE_KEY maps all 17 collections', () => {
    for (const [col, key] of Object.entries(RESPONSE_KEYS)) {
      expect(DEL_CLIENT, `client map missing ${col}`).toMatch(new RegExp(`${col}:\\s*'${key}'`));
    }
  });
  it('B3 server COL_TO_RESPONSE_KEY maps all 17 collections', () => {
    for (const [col, key] of Object.entries(RESPONSE_KEYS)) {
      expect(DEL_SERVER, `server map missing ${col}`).toMatch(new RegExp(`${col}:\\s*'${key}'`));
    }
  });
});

describe('C: branch make-fresh buckets correctly EXCLUDE be_assessments (universal, no branchId)', () => {
  it('C1 no make-fresh bucket lists be_assessments (would wrongly wipe ALL customers on a branch make-fresh)', () => {
    expect(BRANCH_BUCKETS).not.toMatch(/['"]be_assessments['"]/);
  });
});

describe('D: drift catcher — every flat be_* collection queried by customerId must be in the cascade list (V196 prevention)', () => {
  // legitimate customer-keyed reads that are NOT customer-cascade collections:
  const ALLOWLIST = new Set([
    'be_customers', // the customer doc itself (IS the customer, not cascade-deleted)
  ]);

  it('D1 customerId-queried collections ⊆ CUSTOMER_CASCADE_COLLECTIONS_FULL ∪ allowlist', () => {
    // map collection accessors  `xCol = () => collection(db, ...basePath(), 'be_X')`  → be_X
    const accessorMap = {};
    for (const m of BE_CLIENT.matchAll(/(\w+)\s*=\s*\([^)]*\)\s*=>\s*collection\(\s*db\s*,\s*\.\.\.basePath\(\)\s*,\s*['"](be_[a-z_]+)['"]/g)) {
      accessorMap[m[1]] = m[2];
    }
    const found = new Set();
    for (const site of BE_CLIENT.matchAll(/where\(\s*['"]customerId['"]\s*,\s*['"]==['"]/g)) {
      const win = BE_CLIENT.slice(Math.max(0, site.index - 220), site.index);
      // nearest inline collection literal in the window
      const inlines = [...win.matchAll(/collection\(\s*db\s*,\s*\.\.\.basePath\(\)\s*,\s*['"](be_[a-z_]+)['"]/g)];
      if (inlines.length) { found.add(inlines[inlines.length - 1][1]); continue; }
      // else nearest accessor call  `xCol(`  that maps to a collection
      const calls = [...win.matchAll(/(\w+)\(\)/g)].map((c) => c[1]).filter((n) => accessorMap[n]);
      if (calls.length) found.add(accessorMap[calls[calls.length - 1]]);
      // unresolved sites are skipped (conservative — never a false failure)
    }
    expect(found.has('be_assessments'), 'sanity: drift catcher resolved be_assessments').toBe(true);
    const leaked = [...found].filter((c) => !CUSTOMER_CASCADE_COLLECTIONS_FULL.includes(c) && !ALLOWLIST.has(c));
    expect(leaked, `customer-scoped collection(s) NOT in CUSTOMER_CASCADE_COLLECTIONS_FULL — add them (or to the allowlist if not customer-data): ${leaked.join(', ')}`).toEqual([]);
  });
});

describe('E: flow-simulate (Rule I) — be_assessments round-trips backup→restore, deletes, moves on merge', () => {
  // pure mirror of "collect docs where customerId==X across the cascade list"
  const COLS = CUSTOMER_CASCADE_COLLECTIONS_FULL;
  const makeDb = () => ({
    be_assessments: [{ id: 'AS1', customerId: 'C1', assessmentDate: '2026-06-18', rawAnswers: { adam_1: true } },
                      { id: 'AS2', customerId: 'C2' }],
    be_treatments: [{ id: 'T1', customerId: 'C1' }],
    be_recalls: [{ id: 'R1', customerId: 'C1' }],
  });
  const collectByCustomer = (store, cid) => {
    const out = {};
    for (const col of COLS) out[col] = (store[col] || []).filter((d) => d.customerId === cid);
    return out;
  };

  it('E1 backup of C1 includes its be_assessments rounds (was the gap)', () => {
    const file = collectByCustomer(makeDb(), 'C1');
    expect(file.be_assessments.map((d) => d.id)).toEqual(['AS1']); // AS2 belongs to C2 — excluded
    expect(Object.keys(file)).toContain('be_assessments');
  });
  it('E2 restore recreates be_assessments at same docId with customerId preserved', () => {
    const file = collectByCustomer(makeDb(), 'C1');
    const restored = {};
    for (const col of COLS) for (const d of file[col]) (restored[col] ||= []).push({ ...d });
    expect(restored.be_assessments[0]).toMatchObject({ id: 'AS1', customerId: 'C1' });
  });
  it('E3 delete-cascade of C1 removes its be_assessments (no orphan); C2 untouched', () => {
    const store = makeDb();
    for (const col of COLS) store[col] = (store[col] || []).filter((d) => d.customerId !== 'C1');
    expect(store.be_assessments.map((d) => d.id)).toEqual(['AS2']); // only C2 remains
  });
  it('E4 merge re-stamps C1 → keeper C9 across the cascade list (incl. be_assessments)', () => {
    const store = makeDb();
    for (const col of COLS) for (const d of store[col] || []) if (d.customerId === 'C1') d.customerId = 'C9';
    expect(store.be_assessments.find((d) => d.id === 'AS1').customerId).toBe('C9');
  });
});
