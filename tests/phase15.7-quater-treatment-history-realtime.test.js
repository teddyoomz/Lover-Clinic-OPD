// Phase 15.7-quater (2026-04-28) — treatment history real-time refresh
//
// User report: "หน้าข้อมูลลูกค้า ที่สร้างโดยระบบของเราเอง เมื่อบันทึกการ
// รักษาใหม่ หรือ Edit การรักษาเดิม แล้วการรักษาใหม่ หรือการ edit นั้น
// ไม่แสดงผลแบบ real time ใน ประวัติการรักษา ของหน้าข้อมูลลูกค้า แต่
// ลูกค้าที่ดูดมาไม่เป็น".
//
// Root cause (preview_eval confirmed):
//   1. CustomerDetailView.jsx:321 derived `treatmentSummary` from
//      `customer?.treatmentSummary` (denormalized array on customer doc).
//   2. The denormalized array refreshes only when the parent
//      (BackendDashboard) re-fetches the customer doc on save.
//   3. BackendDashboard.jsx:534 used `getCustomer(viewingCustomer?.proClinicId)`
//      — for V33 self-created customers (LC-* prefix), proClinicId is null
//      → getCustomer(null) returns null → setViewingCustomer NEVER called
//      → customer.treatmentSummary stayed stale → ประวัติการรักษา showed
//      OLD entries until F5.
//   4. ProClinic-cloned customers have proClinicId set → refresh works.
//
// Two-pronged fix:
//   A. BackendDashboard.jsx:534 → `getCustomer(viewingCustomer?.id || .proClinicId)`
//      mirrors the precedence at lines 318/325.
//   B. CustomerDetailView.jsx:321 → derive treatmentSummary PRIMARILY from
//      live `treatments[]` state (already populated via listener), with
//      fallback to denormalized customer.treatmentSummary. This makes the
//      list real-time even when the parent prop is stale (e.g. another
//      tab edits the treatment).
//
// This test bank locks both fixes.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(import.meta.dirname || __dirname, '..');
const DashboardSrc = readFileSync(path.join(REPO_ROOT, 'src/pages/BackendDashboard.jsx'), 'utf-8');
const DetailSrc = readFileSync(path.join(REPO_ROOT, 'src/components/backend/CustomerDetailView.jsx'), 'utf-8');

describe('Phase 15.7-quater — Treatment history real-time for self-created customers', () => {
  describe('Q1 — BackendDashboard onSaved uses id || proClinicId', () => {
    it('Q1.1 onSaved getCustomer call uses id-first precedence', () => {
      // Anti-regression: pre-fix used `viewingCustomer?.proClinicId` only.
      expect(DashboardSrc).toMatch(/getCustomer\(viewingCustomer\?\.id\s*\|\|\s*viewingCustomer\?\.proClinicId\)/);
    });

    it('Q1.2 NO bare proClinicId-only fetch in TreatmentFormPage onSaved', () => {
      // Ensure the Phase 15.7-quater fix didn't get reverted
      const formBlock = DashboardSrc.match(/<TreatmentFormPage[\s\S]+?\/>/);
      expect(formBlock).toBeTruthy();
      // The onSaved callback specifically must NOT use bare proClinicId
      // (we use the id-first form now)
      expect(formBlock[0]).not.toMatch(/getCustomer\(viewingCustomer\?\.proClinicId\)\s*[;\n]/);
    });

    it('Q1.3 Phase 15.7-quater marker comment in BackendDashboard', () => {
      expect(DashboardSrc).toMatch(/Phase 15\.7-quater/);
    });
  });

  describe('Q2 — CustomerDetailView treatmentSummary derives from live treatments[]', () => {
    it('Q2.1 useMemo deps include treatments + customer?.treatmentSummary', () => {
      // The Phase 15.7-quater useMemo for treatmentSummary derives from
      // BOTH live treatments state (primary) and customer.treatmentSummary (fallback).
      const memo = DetailSrc.match(/const treatmentSummary = useMemo\([\s\S]+?\}\s*,\s*\[([^\]]+)\]\)/);
      expect(memo).toBeTruthy();
      const deps = memo[1];
      expect(deps).toMatch(/treatments/);
      expect(deps).toMatch(/customer\?\.treatmentSummary/);
    });

    it('Q2.2 derives from treatments[] when non-empty', () => {
      const memo = DetailSrc.match(/const treatmentSummary = useMemo[\s\S]+?\}\s*,\s*\[treatments/);
      expect(memo).toBeTruthy();
      // Must check Array.isArray(treatments) && treatments.length > 0
      expect(memo[0]).toMatch(/Array\.isArray\(treatments\)\s*&&\s*treatments\.length\s*>\s*0/);
    });

    it('Q2.3 maps treatments to summary shape (id/date/doctor/assistants/branch/cc/dx/createdBy)', () => {
      const memo = DetailSrc.match(/const treatmentSummary = useMemo[\s\S]+?\}\s*,\s*\[treatments/);
      expect(memo).toBeTruthy();
      const block = memo[0];
      // Verify all 8 fields written by rebuildTreatmentSummary are mirrored
      expect(block).toMatch(/id:\s*t\.treatmentId\s*\|\|\s*t\.id/);
      expect(block).toMatch(/date:\s*t\.detail\?\.treatmentDate/);
      expect(block).toMatch(/doctor:\s*t\.detail\?\.doctorName/);
      expect(block).toMatch(/assistants:/);
      expect(block).toMatch(/branch:\s*t\.detail\?\.branch/);
      expect(block).toMatch(/cc:\s*t\.detail\?\.symptoms/);
      expect(block).toMatch(/dx:\s*t\.detail\?\.diagnosis/);
      expect(block).toMatch(/createdBy:/);
    });

    it('Q2.4 falls back to denormalized customer.treatmentSummary when treatments[] empty', () => {
      const memo = DetailSrc.match(/const treatmentSummary = useMemo[\s\S]+?\}\s*,\s*\[treatments/);
      expect(memo).toBeTruthy();
      // The else branch uses customer?.treatmentSummary
      expect(memo[0]).toMatch(/list\s*=\s*\[\s*\.\.\.\(customer\?\.treatmentSummary\s*\|\|\s*\[\]\)\s*\]/);
    });

    it('Q2.5 assistants mapper handles assistantNames (denorm) + assistants (legacy) + assistantIds', () => {
      const memo = DetailSrc.match(/const treatmentSummary = useMemo[\s\S]+?\}\s*,\s*\[treatments/);
      expect(memo).toBeTruthy();
      // Phase 15.7 introduced assistantNames denorm; preserve fallback chain
      expect(memo[0]).toMatch(/t\.detail\?\.assistantNames\s*\|\|\s*t\.detail\?\.assistants\s*\|\|\s*t\.detail\?\.assistantIds/);
    });

    it('Q2.6 Phase 15.7-quater marker comment in CustomerDetailView', () => {
      expect(DetailSrc).toMatch(/Phase 15\.7-quater/);
    });
  });

  describe('Q3 — Functional simulate (matches in-component derivation logic)', () => {
    function simulate(treatments, customerSummary) {
      let list;
      if (Array.isArray(treatments) && treatments.length > 0) {
        list = treatments.map(t => ({
          id: t.treatmentId || t.id,
          date: t.detail?.treatmentDate || '',
          doctor: t.detail?.doctorName || '',
          assistants: (t.detail?.assistantNames || t.detail?.assistants || t.detail?.assistantIds || [])
            .map(a => typeof a === 'string' ? a : (a?.name || '')),
          branch: t.detail?.branch || '',
          cc: t.detail?.symptoms || '',
          dx: t.detail?.diagnosis || '',
          createdBy: t.createdBy || 'cloned',
        }));
      } else {
        list = [...(customerSummary || [])];
      }
      list.sort((a, b) => {
        const da = a?.date || '';
        const db = b?.date || '';
        if (da === db) return String(b?.id || '').localeCompare(String(a?.id || ''));
        return db.localeCompare(da);
      });
      return list;
    }

    it('Q3.1 — listener fires with new treatment → list reflects it (real-time)', () => {
      const customerSummary = [
        { id: 'BT-1', date: '2026-04-26', doctor: 'Dr. A', assistants: [], branch: '', cc: '', dx: '', createdBy: 'backend' },
      ];
      // After save, listener fires with 2 treatments
      const treatments = [
        { treatmentId: 'BT-1', detail: { treatmentDate: '2026-04-26', doctorName: 'Dr. A', branch: '', symptoms: '', diagnosis: '' }, createdBy: 'backend' },
        { treatmentId: 'BT-2', detail: { treatmentDate: '2026-04-28', doctorName: 'Dr. B', branch: '', symptoms: 'fever', diagnosis: 'flu' }, createdBy: 'backend' },
      ];
      const result = simulate(treatments, customerSummary);
      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('BT-2'); // newest first
      expect(result[0].dx).toBe('flu');
      expect(result[1].id).toBe('BT-1');
    });

    it('Q3.2 — listener empty → fallback to denormalized customer summary', () => {
      const customerSummary = [
        { id: 'BT-OLD', date: '2026-04-20', doctor: 'Dr. X', assistants: [], branch: '', cc: '', dx: '', createdBy: 'cloned' },
      ];
      const result = simulate([], customerSummary);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('BT-OLD');
    });

    it('Q3.3 — both empty → empty list', () => {
      expect(simulate([], [])).toEqual([]);
      expect(simulate(null, null)).toEqual([]);
      expect(simulate(undefined, undefined)).toEqual([]);
    });

    it('Q3.4 — assistants pulled from assistantNames (Phase 15.7 denorm) when present', () => {
      const treatments = [
        { treatmentId: 'BT-1', detail: { treatmentDate: '2026-04-28', assistantNames: ['Dr. A', 'Dr. B'], assistantIds: ['1', '2'] } },
      ];
      const result = simulate(treatments, []);
      expect(result[0].assistants).toEqual(['Dr. A', 'Dr. B']);
    });

    it('Q3.5 — assistants fallback to assistantIds when no denorm names', () => {
      const treatments = [
        { treatmentId: 'BT-1', detail: { treatmentDate: '2026-04-28', assistants: ['Dr. X'] } },
      ];
      const result = simulate(treatments, []);
      expect(result[0].assistants).toEqual(['Dr. X']);
    });

    it('Q3.6 — sort: same date ties broken by treatmentId desc (timestamp suffix)', () => {
      const treatments = [
        { treatmentId: 'BT-1777000000001', detail: { treatmentDate: '2026-04-28' } },
        { treatmentId: 'BT-1777000000002', detail: { treatmentDate: '2026-04-28' } },
        { treatmentId: 'BT-1777000000003', detail: { treatmentDate: '2026-04-28' } },
      ];
      const result = simulate(treatments, []);
      expect(result.map(r => r.id)).toEqual([
        'BT-1777000000003',
        'BT-1777000000002',
        'BT-1777000000001',
      ]);
    });

    it('Q3.7 — V33 self-created customer scenario (LC-prefix, proClinicId=null)', () => {
      // Mimics what listenToCustomerTreatments returns for LC-26000001 customer
      // (data verified via preview_eval — 3 treatments saved with customerId="LC-26000001")
      const treatments = [
        { treatmentId: 'BT-1777384024884', customerId: 'LC-26000001', detail: { treatmentDate: '2026-04-28' }, createdBy: 'backend' },
        { treatmentId: 'BT-1777387487829', customerId: 'LC-26000001', detail: { treatmentDate: '2026-04-28' }, createdBy: 'backend' },
        { treatmentId: 'BT-1777393507957', customerId: 'LC-26000001', detail: { treatmentDate: '2026-04-28' }, createdBy: 'backend' },
      ];
      // Even if customer.treatmentSummary is STALE (e.g. only has 2 entries from before),
      // the live treatments[] state has all 3 → list reflects 3.
      const staleSummary = [
        { id: 'BT-1777384024884', date: '2026-04-28', doctor: '', assistants: [], branch: '', cc: '', dx: '', createdBy: 'backend' },
      ];
      const result = simulate(treatments, staleSummary);
      expect(result).toHaveLength(3);
      // Newest first via id desc tie-break
      expect(result[0].id).toBe('BT-1777393507957');
    });
  });

  describe('Q4 — anti-regression: rebuildTreatmentSummary still writes denormalized field', () => {
    it('Q4.1 backendClient.rebuildTreatmentSummary still updates customer.treatmentSummary', () => {
      const backendSrc = readFileSync(path.join(REPO_ROOT, 'src/lib/backendClient.js'), 'utf-8');
      const fn = backendSrc.split('export async function rebuildTreatmentSummary')[1] || '';
      const next = fn.indexOf('\nexport ');
      const body = next > 0 ? fn.slice(0, next) : fn;
      expect(body).toMatch(/treatmentSummary:\s*summary/);
      expect(body).toMatch(/treatmentCount:\s*summary\.length/);
    });
  });
});
