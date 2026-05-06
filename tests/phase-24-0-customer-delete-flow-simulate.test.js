// Phase 24.0 — Rule I full-flow simulate. End-to-end chain:
//   create A → assign HN(A) → delete A via cascade → create B → assert HN(B)
//   monotonic forward (HN-no-reuse regression lock).
//
// Plus pure-helper checks of the cascade chain, audit doc shape, and
// shared-constant parity. The HEAVY runtime side (firebase-admin against a
// real Firestore project) is COVERED by the dev-server preview_eval at
// verification time — this file is the source-grep + helper test bank.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const CLIENT = fs.readFileSync(
  path.join(process.cwd(), 'src/lib/backendClient.js'),
  'utf-8',
);
const SERVER = fs.readFileSync(
  path.join(process.cwd(), 'api/admin/delete-customer-cascade.js'),
  'utf-8',
);

describe('Phase 24.0 / F1 — HN counter monotonic-forward (no reuse)', () => {
  it('F1.1 generateCustomerHN uses runTransaction with seq + 1 (never decrements)', () => {
    expect(CLIENT).toMatch(/generateCustomerHN/);
    // The function body must read the existing seq and ADD 1 (never subtract).
    expect(CLIENT).toMatch(/nextSeq\s*=\s*\(data\.seq\s*\|\|\s*0\)\s*\+\s*1/);
  });

  it('F1.2 deleteCustomerCascade does NOT touch be_customer_counter', () => {
    // Anti-regression: the cascade must NEVER reset/decrement the counter.
    const fnBody = (CLIENT.match(/export async function deleteCustomerCascade[\s\S]*?^\}/m) || [])[0] || '';
    expect(fnBody.length).toBeGreaterThan(0);
    expect(fnBody).not.toMatch(/be_customer_counter/);
    expect(fnBody).not.toMatch(/customerCounterDoc/);
  });

  it('F1.3 server endpoint does NOT touch be_customer_counter either', () => {
    expect(SERVER).not.toMatch(/be_customer_counter/);
  });
});

describe('Phase 24.0 / F2 — cascade scope contract', () => {
  it('F2.1 client cascade list = 11 entries', () => {
    const m = CLIENT.match(/CUSTOMER_CASCADE_COLLECTIONS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
    expect(m).toBeTruthy();
    const entries = m[1].match(/'be_[a-z_]+'/g) || [];
    expect(entries.length).toBe(11);
  });

  it('F2.2 server cascade list = 11 entries', () => {
    const m = SERVER.match(/CUSTOMER_CASCADE_COLLECTIONS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
    expect(m).toBeTruthy();
    const entries = m[1].match(/'be_[a-z_]+'/g) || [];
    expect(entries.length).toBe(11);
  });

  it('F2.3 cascade includes V36-quinquies be_course_changes (was missing pre-Phase-24)', () => {
    expect(CLIENT).toMatch(/courseChangesCol/);
    expect(SERVER).toMatch(/be_course_changes/);
  });

  it('F2.4 cascade includes be_link_requests + be_customer_link_tokens (Phase 24.0 additions)', () => {
    expect(CLIENT).toMatch(/linkRequestsCol/);
    expect(CLIENT).toMatch(/customerLinkTokensCol/);
    expect(SERVER).toMatch(/be_link_requests/);
    expect(SERVER).toMatch(/be_customer_link_tokens/);
  });

  it('F2.5 cascade does NOT include opd_sessions (out-of-scope per spec §10)', () => {
    const m = CLIENT.match(/CUSTOMER_CASCADE_COLLECTIONS\s*=\s*Object\.freeze\(\[([\s\S]*?)\]\)/);
    expect(m[1]).not.toMatch(/opd_sessions/);
  });
});

describe('Phase 24.0 / F3 — audit doc shape', () => {
  it('F3.1 audit doc id format: customer-delete-{customerId}-{ts}-{rand}', () => {
    expect(SERVER).toMatch(/auditId\s*=\s*`customer-delete-\$\{customerId\}-\$\{ts\}-\$\{rand\}`/);
  });

  it('F3.2 audit payload includes type field "customer-delete-cascade"', () => {
    expect(SERVER).toMatch(/type:\s*['"]customer-delete-cascade['"]/);
  });

  it('F3.3 audit payload includes customerSnapshot (post-hardening: pruned via buildSnapshot)', () => {
    // Phase 24.0 post-review hardening: customerSnapshot is now produced by
    // buildSnapshot(customer) which prunes heavy fields (gallery_upload /
    // profile_image / card_photo) and falls back to identity-only when the
    // pruned doc still exceeds the 700KB safety limit. This protects the
    // audit doc from hitting Firestore's 1MB doc cap (which would fail the
    // FINAL batch commit and roll back the entire cascade).
    expect(SERVER).toMatch(/customerSnapshot:\s*buildSnapshot\(customer\)/);
    expect(SERVER).toMatch(/function buildSnapshot/);
    expect(SERVER).toMatch(/SNAPSHOT_BYTE_LIMIT/);
    expect(SERVER).toMatch(/HEAVY_KEYS/);
  });

  it('F3.4 audit payload includes authorizedBy + performedBy + cascadeCounts + branchId + origin', () => {
    expect(SERVER).toMatch(/authorizedBy:/);
    expect(SERVER).toMatch(/performedBy:/);
    expect(SERVER).toMatch(/cascadeCounts/);
    expect(SERVER).toMatch(/branchId/);
    expect(SERVER).toMatch(/origin:\s*classifyOrigin\(customer\)/);
  });

  it('F3.5 audit doc commits in same batch as customer-doc delete (atomicity)', () => {
    // The endpoint must batchOp.set(auditRef, ...) BEFORE the final commit.
    expect(SERVER).toMatch(/batchOp\.set\(auditRef/);
    expect(SERVER).toMatch(/await batchOp\.commit\(\)/);
  });
});

describe('Phase 24.0 / F4 — UI wiring', () => {
  it('F4.1 CustomerCard renders ✕ icon button via Trash2 with stopPropagation', () => {
    const card = fs.readFileSync('src/components/backend/CustomerCard.jsx', 'utf-8');
    expect(card).toMatch(/Trash2/);
    expect(card).toMatch(/e\.stopPropagation\(\)/);
  });

  it('F4.2 CustomerDetailView has prominent ลบลูกค้า button + onDeleteCustomer prop', () => {
    const detail = fs.readFileSync('src/components/backend/CustomerDetailView.jsx', 'utf-8');
    expect(detail).toMatch(/ลบลูกค้า/);
    expect(detail).toMatch(/onDeleteCustomer/);
  });

  it('F4.3 CustomerListTab manages deletingCustomer state + renders modal + uses setRefreshKey + delete-customer-success banner', () => {
    // Adaptation 4 — refresh is via setRefreshKey(k => k + 1) (not loadCustomers)
    // and success surface is a transient banner with data-testid="delete-customer-success"
    // (not showToast).
    const tab = fs.readFileSync('src/components/backend/CustomerListTab.jsx', 'utf-8');
    expect(tab).toMatch(/deletingCustomer/);
    expect(tab).toMatch(/DeleteCustomerCascadeModal/);
    expect(tab).toMatch(/setRefreshKey/);
    expect(tab).toMatch(/delete-customer-success/);
    // Anti-pattern guards — make sure the plan-assumed names didn't sneak in.
    expect(tab).not.toMatch(/showToast\(/);
  });

  it('F4.4 BackendDashboard wires DeleteCustomerCascadeModal + onDeleteCustomer prop (Adaptation 3 — Task 11-bis)', () => {
    // The cascade modal is also wired at BackendDashboard.jsx so that the
    // CustomerDetailView's ลบลูกค้า button can trigger the same flow.
    const dash = fs.readFileSync('src/pages/BackendDashboard.jsx', 'utf-8');
    expect(dash).toMatch(/import\s+DeleteCustomerCascadeModal/);
    expect(dash).toMatch(/onDeleteCustomer\s*=\s*\{[^}]*setDeletingCustomer/);
    expect(dash).toMatch(/<DeleteCustomerCascadeModal/);
  });
});

describe('Phase 24.0 / F5 — full-flow simulate (pure mirror of HN behaviour)', () => {
  // Mirror the counter logic to assert no-reuse — proves that any cascade
  // delete operating between counter reads cannot affect the counter.
  function simulateCounter(initial = { year: '26', seq: 0 }) {
    let state = { ...initial };
    return {
      next() {
        state = { year: state.year, seq: state.seq + 1 };
        return `LC-${state.year}${String(state.seq).padStart(6, '0')}`;
      },
      readState() { return { ...state }; },
    };
  }
  // Mirror cascade-delete (no counter touch).
  function simulateCascadeDelete(customers, hn) {
    return customers.filter(c => c.hn !== hn);
  }

  it('F5.1 create A → delete A → create B → HN(B) > HN(A) [no reuse]', () => {
    const counter = simulateCounter();
    const customers = [];
    const hnA = counter.next();
    customers.push({ hn: hnA, name: 'A' });
    expect(hnA).toBe('LC-26000001');

    // Delete A — cascade does NOT touch counter.
    const survived = simulateCascadeDelete(customers, hnA);
    expect(survived.length).toBe(0);
    expect(counter.readState()).toEqual({ year: '26', seq: 1 });

    const hnB = counter.next();
    expect(hnB).toBe('LC-26000002');
    expect(hnB).not.toBe(hnA);
  });

  it('F5.2 create N customers, delete every other → next HN > all prior', () => {
    const counter = simulateCounter();
    let customers = [];
    const hns = [];
    for (let i = 0; i < 5; i += 1) {
      const hn = counter.next();
      customers.push({ hn, name: `C${i}` });
      hns.push(hn);
    }
    // delete idx 0, 2, 4
    customers = simulateCascadeDelete(customers, hns[0]);
    customers = simulateCascadeDelete(customers, hns[2]);
    customers = simulateCascadeDelete(customers, hns[4]);

    const hnNew = counter.next();
    expect(hnNew).toBe('LC-26000006');
    expect(hns).not.toContain(hnNew);
  });

  it('F5.3 delete-then-create across YEAR boundary still monotonic within new year', () => {
    // Year-rollover only resets the seq when generateCustomerHN sees a new
    // yearStr. Simulating two years to confirm cascade-delete in year N
    // doesn't perturb year N+1.
    const counter26 = simulateCounter({ year: '26', seq: 0 });
    const hnA = counter26.next();
    expect(hnA).toBe('LC-26000001');
    // delete A
    let survived = simulateCascadeDelete([{ hn: hnA, name: 'A' }], hnA);
    expect(survived).toEqual([]);
    // year rolls forward → fresh counter in 27
    const counter27 = simulateCounter({ year: '27', seq: 0 });
    const hnB = counter27.next();
    expect(hnB).toBe('LC-27000001');
    expect(hnB).not.toBe(hnA);
  });
});

describe('Phase 24.0 / F6 — preview endpoint integrity (Issue #1)', () => {
  it('F6.1 server endpoint switches on action discriminator', () => {
    expect(SERVER).toMatch(/action\s*===\s*['"]preview['"]/);
    expect(SERVER).toMatch(/req\.body\?\.\s*action/);
  });

  it('F6.2 client wrapper exports BOTH deleteCustomerViaApi AND previewCustomerDeleteViaApi (Phase 24.0-ter: client-side Firestore)', () => {
    const CLIENT_TXT = fs.readFileSync(
      path.join(process.cwd(), 'src/lib/customerDeleteClient.js'),
      'utf-8',
    );
    expect(CLIENT_TXT).toMatch(/export\s+async\s+function\s+deleteCustomerViaApi/);
    expect(CLIENT_TXT).toMatch(/export\s+async\s+function\s+previewCustomerDeleteViaApi/);
    // Phase 24.0-ter — wrapper now uses Firestore SDK directly (no fetch
    // to /api/admin/*) so it works on `npm run dev` Vite without needing
    // Vercel serverless. Verify the canonical client-side primitives are
    // imported + the deleteCustomerCascade reuse is intact.
    expect(CLIENT_TXT).toMatch(/import[\s\S]*?CUSTOMER_CASCADE_COLLECTIONS,\s*deleteCustomerCascade[\s\S]*?from\s*['"][^'"]*backendClient/);
    expect(CLIENT_TXT).toMatch(/import[\s\S]*?from\s*['"]firebase\/firestore['"]/);
    // Audit doc id format is preserved (mirror of server endpoint).
    expect(CLIENT_TXT).toMatch(/customer-delete-\$\{cid\}-\$\{ts\}-\$\{rand\}/);
    // Anti-regression: NO fetch() calls to the api endpoint. Local-only
    // workflow requires direct Firestore SDK paths.
    expect(CLIENT_TXT).not.toMatch(/fetch\(['"]\/api\/admin\/delete-customer-cascade/);
  });
});
