// Regression: treatment-delete must resolve the customer id via `id || proClinicId`,
// NEVER bare `.proClinicId`.
//
// ROOT CAUSE (2026-06-09, customer LC-26000114): BackendDashboard's
// onDeleteTreatment handler did `const cid = viewingCustomer.proClinicId;`
// (bare). Post-V50 (ProClinic stripped) ALL customers are self-created (LC-*)
// with proClinicId === undefined → cid = undefined → deleteBackendTreatment
// removed the be_treatments doc but the follow-up reverseCourseDeduction(cid),
// rebuildTreatmentSummary(cid) + getCustomer(cid) all ran against `undefined`
// → the customer's denormalized treatmentSummary/treatmentCount went STALE
// (count badge showed 2 while the live list showed 1) AND the course usage was
// never returned to the customer.
//
// This is an isolated instance of the documented V33 class — CustomerDetailView
// already fixed + documented it (line ~221-226: "customer.proClinicId → V33
// customers silent-failed (empty appointments...)"). BackendDashboard:497 was
// the SOLE surviving bare-`.proClinicId` callsite.
//
// Class-of-bug: V33/V50 self-created-customer id resolution. Any operation that
// needs the customer's canonical Firestore doc-id MUST use the `id || proClinicId`
// (or `proClinicId || id`) fallback, never bare `.proClinicId`.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const SRC = (p) => readFileSync(path.resolve(process.cwd(), p), 'utf8');

// Pure mirror of the resolver the fixed callsite must use.
const resolveCustomerOperationId = (c) => c?.id || c?.proClinicId || null;

describe('treatment-delete customer-id resolution (V33/V50 class)', () => {
  describe('R1 — resolver semantics (the fix logic)', () => {
    it('R1.1 self-created (LC-*) customer with no proClinicId → resolves to doc id', () => {
      const lc = { id: 'LC-26000114', proClinicId: undefined };
      expect(resolveCustomerOperationId(lc)).toBe('LC-26000114');
    });
    it('R1.2 legacy ProClinic customer (has both) → still resolves (id preferred, doc-id is canonical post-getCustomer)', () => {
      const legacy = { id: '2853', proClinicId: '2853' };
      expect(resolveCustomerOperationId(legacy)).toBe('2853');
    });
    it('R1.3 empty-string proClinicId is falsy → falls through to id', () => {
      expect(resolveCustomerOperationId({ id: 'LC-1', proClinicId: '' })).toBe('LC-1');
    });
    it('R1.4 bare `.proClinicId` would be undefined for LC-* (the bug)', () => {
      const lc = { id: 'LC-26000114', proClinicId: undefined };
      expect(lc.proClinicId).toBeUndefined(); // the pre-fix value of `cid`
      expect(resolveCustomerOperationId(lc)).not.toBeUndefined();
    });
  });

  describe('R2 — source-grep: BackendDashboard onDeleteTreatment uses the fallback', () => {
    const src = SRC('src/pages/BackendDashboard.jsx');
    // Isolate the onDeleteTreatment handler body.
    const start = src.indexOf('onDeleteTreatment={async (treatmentId)');
    // Wide enough to reach the cid assignment past line 496's long confirm() string.
    const slice = start >= 0 ? src.slice(start, start + 2800) : '';

    it('R2.1 handler exists', () => {
      expect(start).toBeGreaterThan(-1);
    });
    it('R2.2 cid resolved via id-first fallback (NOT bare .proClinicId)', () => {
      // The fix: const cid = viewingCustomer.id || viewingCustomer.proClinicId;
      expect(slice).toMatch(/const\s+cid\s*=\s*viewingCustomer\.id\s*\|\|\s*viewingCustomer\.proClinicId/);
    });
    it('R2.3 anti-regression: no bare `const cid = viewingCustomer.proClinicId;`', () => {
      expect(slice).not.toMatch(/const\s+cid\s*=\s*viewingCustomer\.proClinicId\s*;/);
    });
  });

  describe('R3 — Rule P classifier: no bare `.proClinicId` used as an operation id', () => {
    // Sweep the whole src/ for `= <ident>.proClinicId;` assignments NOT followed by
    // a `|| ...id` fallback. The canonical convention everywhere is `proClinicId || id`
    // or `id || proClinicId`; a bare assignment is the V33-class smell.
    const FILES = [
      'src/pages/BackendDashboard.jsx',
      'src/components/backend/CustomerDetailView.jsx',
    ];
    it('R3.1 no bare `= X.proClinicId;` customer-id assignment in delete/rebuild surfaces', () => {
      const offenders = [];
      for (const f of FILES) {
        const txt = SRC(f);
        // match `const NAME = SOMETHING.proClinicId;` (no `||` on the same RHS)
        const re = /(?:const|let)\s+\w+\s*=\s*\w+\.proClinicId\s*;/g;
        let m;
        while ((m = re.exec(txt))) offenders.push(`${f}: ${m[0]}`);
      }
      expect(offenders).toEqual([]);
    });
  });
});
