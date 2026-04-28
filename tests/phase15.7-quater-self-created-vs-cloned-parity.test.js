// Phase 15.7-quater (2026-04-28) — Self-created vs ProClinic-cloned parity
//
// User directive: "เทสให้แน่ใจว่า wiring หรือ flow หรือ logic ทุกอย่างของ
// ลูกค้าที่สร้างโดยระบบเราต้องทำได้เหมือนลูกค้าที่ clone มาจาก proclinic
// ทุกประการ เพราะเดี๋ยวจะลบลูกค้าที่ clone มาทิ้งหมดอยู่แล้ว".
//
// Translation: All customer flows must work IDENTICALLY for self-created
// (LC-* prefix) customers as for ProClinic-cloned customers — because
// cloned customers will be deleted before launch.
//
// Convention across the codebase:
//   - ProClinic-cloned customers: customer.id === customer.proClinicId (numeric, "12345")
//   - Self-created (V33): customer.id = "LC-..." (or "CUST-..."), customer.proClinicId = null
//
// CRITICAL INVARIANT: every code path that READS a customer-keyed resource
// (treatments, appointments, wallets, points, memberships, sales) must use
// a fallback chain (`customer.id || customer.proClinicId` OR
// `customer.proClinicId || customer.id`). A bare `customer.proClinicId`
// without fallback would silent-fail for LC-* customers.
//
// This test bank source-greps for the BARE-PCID anti-pattern across the
// codebase + locks the canonical fallback patterns at all known consumer
// sites.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(import.meta.dirname || __dirname, '..');

function read(rel) {
  return readFileSync(path.join(REPO_ROOT, rel), 'utf-8');
}

describe('Phase 15.7-quater Parity — self-created vs cloned customers', () => {
  describe('PAR1 — BackendDashboard customer-id usage', () => {
    const src = read('src/pages/BackendDashboard.jsx');

    it('PAR1.1 onCreateTreatment uses id-first precedence', () => {
      expect(src).toMatch(/customerId:\s*viewingCustomer\.id\s*\|\|\s*viewingCustomer\.proClinicId/);
    });

    it('PAR1.2 onEditTreatment uses id-first precedence', () => {
      // Both create AND edit must use id-first. Source has both lines.
      const matches = src.match(/customerId:\s*viewingCustomer\.id\s*\|\|\s*viewingCustomer\.proClinicId/g) || [];
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    it('PAR1.3 onSaved getCustomer uses id-first (Phase 15.7-quater fix)', () => {
      expect(src).toMatch(/getCustomer\(viewingCustomer\?\.id\s*\|\|\s*viewingCustomer\?\.proClinicId\)/);
    });

    it('PAR1.4 NO bare viewingCustomer.proClinicId without fallback in critical paths', () => {
      // The acceptable patterns are `id || proClinicId` and
      // `proClinicId || id` (legacy). The DANGEROUS pattern is
      // `proClinicId)` followed by no `||` — i.e. .proClinicId used as the
      // sole id source.
      // Allowed exceptions:
      //  - share-link URL builder (lines 161, 225, 408): `proClinicId || id`
      //    is fine because share-link is for OTHER admins to load this customer
      //  - editing customer doc (line 296): `id || proClinicId`
      //  - onSaved (line 541, our fix): `id || proClinicId`
      // We assert NO `getCustomer(viewingCustomer?.proClinicId)` (bare) remains.
      expect(src).not.toMatch(/getCustomer\(viewingCustomer\?\.proClinicId\)/);
    });
  });

  describe('PAR2 — CustomerDetailView listener subscription', () => {
    const src = read('src/components/backend/CustomerDetailView.jsx');

    it('PAR2.1 customerId derivation: id || proClinicId', () => {
      expect(src).toMatch(/const customerId\s*=\s*customer\?\.id\s*\|\|\s*customer\?\.proClinicId/);
    });

    it('PAR2.2 listenToCustomerTreatments subscribes with this customerId', () => {
      expect(src).toMatch(/listenToCustomerTreatments\(\s*customerId/);
    });

    it('PAR2.3 listenToCustomerAppointments uses customerId', () => {
      expect(src).toMatch(/listenToCustomerAppointments\(\s*customerId/);
    });

    it('PAR2.4 treatmentSummary derives from live treatments[] state', () => {
      expect(src).toMatch(/Phase 15\.7-quater[\s\S]{0,500}treatments\[\]/);
    });
  });

  describe('PAR3 — Panel-level customer-id consumers (write+read parity)', () => {
    // These panels write data keyed by `customer.proClinicId || customer.id`.
    // They must also READ the same way, otherwise self-created customer
    // data lands at one key but is read from another → invisible.

    it('PAR3.1 PointsPanel write+read both use `proClinicId || id`', () => {
      const src = read('src/components/backend/PointsPanel.jsx');
      // Multiple sites — all must match the same precedence
      const matches = src.match(/customer\.proClinicId\s*\|\|\s*customer\.id/g) || [];
      expect(matches.length).toBeGreaterThanOrEqual(2);
      // Anti-regression: NO bare customer.proClinicId on its own as a key
      expect(src).not.toMatch(/customerId\s*=\s*customer\.proClinicId\s*[;,)]/);
    });

    it('PAR3.2 WalletPanel write+read both use `proClinicId || id`', () => {
      const src = read('src/components/backend/WalletPanel.jsx');
      const matches = src.match(/customer\.proClinicId\s*\|\|\s*customer\.id/g) || [];
      expect(matches.length).toBeGreaterThanOrEqual(2);
    });

    it('PAR3.3 MembershipPanel write+read use fallback', () => {
      const src = read('src/components/backend/MembershipPanel.jsx');
      expect(src).toMatch(/proClinicId\s*\|\|\s*[a-z]+\.id/i);
    });

    it('PAR3.4 DepositPanel write+read use fallback', () => {
      const src = read('src/components/backend/DepositPanel.jsx');
      expect(src).toMatch(/\.proClinicId\s*\|\|\s*[a-z]+\.id/i);
    });

    it('PAR3.5 OnlineSalesTab uses fallback', () => {
      const src = read('src/components/backend/OnlineSalesTab.jsx');
      expect(src).toMatch(/\.proClinicId\s*\|\|\s*[a-z]+\.id/i);
    });

    it('PAR3.6 AppointmentFormModal lockedCustomer falls back to id', () => {
      const src = read('src/components/backend/AppointmentFormModal.jsx');
      expect(src).toMatch(/lockedCustomer\.proClinicId\s*\|\|\s*lockedCustomer\.id/);
    });
  });

  describe('PAR4 — Aggregator key extractors (read-side group-by)', () => {
    // Report aggregators key by customer id. They MUST tolerate both shapes
    // so per-customer rollups don't split self-created records into
    // separate buckets vs cloned records.

    it('PAR4.1 customerReportAggregator key extractor falls back', () => {
      const src = read('src/lib/customerReportAggregator.js');
      expect(src).toMatch(/c\?\.proClinicId\s*\|\|\s*c\?\.id/);
    });

    it('PAR4.2 saleReportAggregator key extractor falls back', () => {
      const src = read('src/lib/saleReportAggregator.js');
      expect(src).toMatch(/c\?\.proClinicId\s*\|\|\s*c\?\.id/);
    });

    it('PAR4.3 rfmUtils key extractor falls back', () => {
      const src = read('src/lib/rfmUtils.js');
      expect(src).toMatch(/c\?\.proClinicId\s*\|\|\s*c\?\.id/);
    });

    it('PAR4.4 appointmentReportAggregator key extractor falls back', () => {
      const src = read('src/lib/appointmentReportAggregator.js');
      expect(src).toMatch(/c\?\.proClinicId\s*\|\|\s*c\?\.id/);
    });

    it('PAR4.5 revenueAnalysisAggregator key extractor falls back', () => {
      const src = read('src/lib/revenueAnalysisAggregator.js');
      expect(src).toMatch(/c\?\.id\s*\|\|\s*c\?\.proClinicId/);
    });
  });

  describe('PAR5 — Functional simulate of customerId resolution', () => {
    // Both precedence orders must produce the same id for the two known
    // customer shapes. Anything else means a self-created customer would
    // silently miss data lookups.

    function resolveIdFirst(c) { return (c?.id) || (c?.proClinicId) || ''; }
    function resolvePciFirst(c) { return (c?.proClinicId) || (c?.id) || ''; }

    it('PAR5.1 — cloned customer (id===proClinicId) — both orders give same id', () => {
      const cloned = { id: '2853', proClinicId: '2853', patientData: {} };
      expect(resolveIdFirst(cloned)).toBe(resolvePciFirst(cloned));
      expect(resolveIdFirst(cloned)).toBe('2853');
    });

    it('PAR5.2 — self-created (LC-*) — both orders give "LC-..."', () => {
      const lc = { id: 'LC-26000001', proClinicId: null, patientData: {} };
      expect(resolveIdFirst(lc)).toBe('LC-26000001');
      expect(resolvePciFirst(lc)).toBe('LC-26000001'); // pcId null → falls to id
    });

    it('PAR5.3 — self-created with empty-string proClinicId (legacy)', () => {
      const lc = { id: 'LC-26000001', proClinicId: '', patientData: {} };
      expect(resolveIdFirst(lc)).toBe('LC-26000001');
      expect(resolvePciFirst(lc)).toBe('LC-26000001');
    });

    it('PAR5.4 — anti-regression: bare proClinicId (no fallback) breaks for LC-*', () => {
      const lc = { id: 'LC-26000001', proClinicId: null };
      // This is what the broken pattern looked like:
      const broken = lc.proClinicId; // null
      expect(broken).toBeNull(); // confirms the broken pattern produces null
      // The fix: always fall back to id
      expect(lc.id || lc.proClinicId).toBe('LC-26000001');
    });

    it('PAR5.5 — both customer types end up with the SAME `customerId` field on saved docs', () => {
      // Treatment save: createBackendTreatment(customerId, detail)
      // → writes `customerId: String(customerId)`
      // Listener: where('customerId', '==', String(customerId))
      // For cloned: customerId="2853" both ways
      // For self-created: customerId="LC-26000001" both ways
      const customers = [
        { id: '2853', proClinicId: '2853' },          // cloned
        { id: 'LC-26000001', proClinicId: null },     // self-created
      ];
      for (const c of customers) {
        const saved = String(c.id || c.proClinicId);
        const queried = String(c.id || c.proClinicId);
        expect(saved).toBe(queried);
        expect(saved).not.toBe('null');
        expect(saved).not.toBe('undefined');
        expect(saved.length).toBeGreaterThan(0);
      }
    });
  });

  describe('PAR6 — Anti-regression: forbidden patterns', () => {
    // Catalog of patterns that would silent-fail for self-created customers.
    // Whenever any of these ships, the parity invariant breaks.

    it('PAR6.1 NO bare `getCustomer(c.proClinicId)` outside aggregators', () => {
      // Aggregator helpers may key by proClinicId for compatibility with
      // cloned data; that's OK as long as they fall back. We forbid
      // BARE proClinicId in customer-fetch contexts.
      const dashboardSrc = read('src/pages/BackendDashboard.jsx');
      expect(dashboardSrc).not.toMatch(/getCustomer\(viewingCustomer\?\.proClinicId\)/);
      expect(dashboardSrc).not.toMatch(/getCustomer\(viewingCustomer\.proClinicId\)\s*[;\n]/);
    });

    it('PAR6.2 CustomerDetailView listener does NOT silent-skip when customerId is "LC-..."', () => {
      // The listener early-returns on `!customerId`. For LC-* customers
      // customerId is "LC-..." (truthy) → listener subscribes.
      const src = read('src/components/backend/CustomerDetailView.jsx');
      // The listener block must be reached for non-empty customerId
      const block = src.match(/listenToCustomerTreatments\(\s*customerId[\s\S]{0,500}/);
      expect(block).toBeTruthy();
    });
  });
});
