// VIP surface classifier (2026-07-04, spec ② — AV202). V49-CAT8 pattern:
// every surface that renders customer names is CLASSIFIED — internal surfaces
// carry VIP rendering; customer-facing surfaces MUST NOT import any vip module.
// A new file that shows customer names must be added to a list or this fails.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const read = (p) => fs.readFileSync(path.resolve(p), 'utf8');
const VIP_IMPORT = /VipBadge\.jsx|VipContext\.jsx|useIsVip|VipName|VipProvider/;

// INTERNAL (staff-only) — must render VIP (import VipName/VipBadge OR go
// through CustomerOption which does).
const INTERNAL_VIP_FILES = [
  'src/components/CustomerOption.jsx',
  'src/components/backend/CustomerCard.jsx',
  'src/components/backend/SaleTab.jsx',
  'src/components/admin/AppointmentHubRowCard.jsx',
  'src/components/backend/AppointmentCalendarView.jsx',
  'src/components/backend/AppointmentDetailBody.jsx',
  'src/pages/AdminDashboard.jsx',
  'src/components/backend/recall/RecallRow.jsx',
  'src/components/staffchat/StaffChatSystemCard.jsx',
  'src/components/backend/DepositPanel.jsx',
  'src/components/backend/QuotationTab.jsx',
  'src/components/backend/OnlineSalesTab.jsx',
  'src/components/backend/SaleInsuranceClaimsTab.jsx',
  'src/components/backend/MembershipPanel.jsx',
  'src/components/backend/MovementLogPanel.jsx',
  'src/components/backend/LinkRequestsTab.jsx',
  'src/components/backend/TreatmentTimelineModal.jsx',
  'src/components/backend/reports/AppointmentReportTab.jsx',
  'src/components/backend/reports/AppointmentAnalysisTab.jsx',
  'src/components/backend/reports/CRMInsightTab.jsx',
  'src/components/backend/reports/CustomerReportTab.jsx',
  'src/components/backend/reports/RemainingCourseRow.jsx',
  'src/components/backend/reports/SaleReportTab.jsx',
  'src/components/backend/reports/SaleDetailModal.jsx',
  'src/components/backend/reports/DepositReceiptRow.jsx',
];

// CUSTOMER-FACING (links / prints / LINE) — VIP must NEVER leak (closed list).
const CUSTOMER_FACING_FILES = [
  'src/pages/PatientForm.jsx',
  'src/pages/PatientDashboard.jsx',
  'src/pages/ClinicSchedule.jsx',
  'src/components/PrintTemplates.jsx',
  'src/components/backend/SalePrintView.jsx',
  'src/components/backend/QuotationPrintView.jsx',
  'src/lib/documentPrintEngine.js',
  'src/lib/documentTemplateValidation.js',
  'src/lib/appointmentHubPrintTemplate.js',
  'src/lib/lineBotResponder.js',
  'src/lib/lineReminderTemplate.js',
];

describe('② AV202 — internal surfaces render VIP', () => {
  for (const f of INTERNAL_VIP_FILES) {
    it(`INT: ${f}`, () => {
      expect(read(f), `${f} must import VipName/VipBadge`).toMatch(VIP_IMPORT);
    });
  }
  it('INT: CustomerDetailView carries the toggle + CustomerOption (gold via shared component)', () => {
    const s = read('src/components/backend/CustomerDetailView.jsx');
    expect(s).toMatch(/vip-toggle-btn/);
    expect(s).toMatch(/CustomerOption/);
  });
});

describe('② AV202 — customer-facing surfaces have ZERO vip imports', () => {
  for (const f of CUSTOMER_FACING_FILES) {
    it(`EXT: ${f}`, () => {
      expect(read(f), `${f} must NOT import vip modules`).not.toMatch(VIP_IMPORT);
    });
  }
  it('EXT: api/** (webhook + cron + admin) — zero vip references', () => {
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      return e.isDirectory() ? walk(p) : (/\.(js|mjs)$/.test(e.name) ? [p] : []);
    });
    for (const p of walk(path.resolve('api'))) {
      expect(fs.readFileSync(p, 'utf8'), p).not.toMatch(VIP_IMPORT);
    }
  });
  it('EXT: VipProvider mounts ONLY in the two staff-dashboard blocks of App.jsx, AFTER the public-link routes return', () => {
    const app = read('src/App.jsx');
    const occurrences = app.match(/<VipProvider>/g) || [];
    expect(occurrences.length).toBe(2);
    // public-link routes (PatientForm / PatientDashboard / ClinicSchedule) return
    // BEFORE the first VipProvider mount → anon users never construct the listener.
    const firstProvider = app.indexOf('<VipProvider>');
    for (const marker of ['<PatientDashboard', '<ClinicSchedule']) {
      const idx = app.indexOf(marker);
      if (idx !== -1) expect(idx, `${marker} must render before VipProvider`).toBeLessThan(firstProvider);
    }
  });
});
