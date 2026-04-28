// Phase 16.5 (2026-04-29) — source-grep regression guards.
// Locks the V21-class fix shape: tab + modals + nav + render wiring +
// audit + status-fallback are present and won't drift away unnoticed.

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const TAB_SRC      = readFileSync('src/components/backend/reports/RemainingCourseTab.jsx', 'utf8');
const ROW_SRC      = readFileSync('src/components/backend/reports/RemainingCourseRow.jsx', 'utf8');
const CANCEL_MODAL = readFileSync('src/components/backend/CancelCourseModal.jsx', 'utf8');
const REFUND_MODAL = readFileSync('src/components/backend/RefundCourseModal.jsx', 'utf8');
const EXCH_MODAL   = readFileSync('src/components/backend/ExchangeCourseModal.jsx', 'utf8');
const UTILS_SRC    = readFileSync('src/lib/remainingCourseUtils.js', 'utf8');
const COURSE_EXCH  = readFileSync('src/lib/courseExchange.js', 'utf8');
const CLIENT_SRC   = readFileSync('src/lib/backendClient.js', 'utf8');
const NAV_SRC      = readFileSync('src/components/backend/nav/navConfig.js', 'utf8');
const DASH_SRC     = readFileSync('src/pages/BackendDashboard.jsx', 'utf8');

describe('G1 RemainingCourseTab uses BranchContext + ReportShell + helpers', () => {
  test('G1.1 tab imports useSelectedBranch from BranchContext', () => {
    expect(TAB_SRC).toMatch(/import\s*\{\s*useSelectedBranch\s*\}\s*from\s*['"]\.\.\/\.\.\/\.\.\/lib\/BranchContext\.jsx['"]/);
  });

  test('G1.2 tab uses ReportShell as chrome', () => {
    expect(TAB_SRC).toMatch(/import ReportShell from '\.\/ReportShell\.jsx'/);
    expect(TAB_SRC).toMatch(/<ReportShell\b/);
  });

  test('G1.3 tab calls flattenCustomerCourses + filterCourses + sortCourses', () => {
    expect(TAB_SRC).toMatch(/flattenCustomerCourses\(/);
    expect(TAB_SRC).toMatch(/filterCourses\(/);
    expect(TAB_SRC).toMatch(/sortCourses\(/);
  });

  test('G1.4 tab branch filter passes branchId (shorthand) inside filterCourses call', () => {
    // Match either explicit `branchId: branchId` OR shorthand `branchId,` /
    // `branchId }` inside the filterCourses({...}) options object.
    expect(TAB_SRC).toMatch(/filterCourses\([\s\S]*?branchId\b/);
  });

  test('G1.5 Phase 16.5-ter — tab renders 2 modals (Cancel + Exchange); RefundCourseModal REMOVED', () => {
    // User directive 2026-04-29: "เอาปุ่มคืนเงินออกจากหน้า tab=reports-
    // remaining-course เรื่องแบบนี้ต้องไปทำหน้า tab=sales".
    expect(TAB_SRC).toMatch(/<CancelCourseModal\b/);
    expect(TAB_SRC).toMatch(/<ExchangeCourseModal\b/);
    expect(TAB_SRC).not.toMatch(/<RefundCourseModal\b/);
  });

  test('G1.6 tab uses BranchContext branchId NOT hardcoded "main"', () => {
    expect(TAB_SRC).not.toMatch(/branchId:\s*['"]main['"]/);
  });
});

describe('G2 modals — try/catch + V31 anti-silent-swallow', () => {
  test('G2.1 CancelCourseModal has try/catch on handleConfirm', () => {
    expect(CANCEL_MODAL).toMatch(/try\s*\{[\s\S]+?await cancelCustomerCourse[\s\S]+?\}\s*catch/);
  });

  test('G2.2 RefundCourseModal has try/catch on handleConfirm', () => {
    expect(REFUND_MODAL).toMatch(/try\s*\{[\s\S]+?await refundCustomerCourse[\s\S]+?\}\s*catch/);
  });

  test('G2.3 ExchangeCourseModal has try/catch on handleConfirm', () => {
    expect(EXCH_MODAL).toMatch(/try\s*\{[\s\S]+?await exchangeCourseProduct[\s\S]+?\}\s*catch/);
  });

  test('G2.4 all 3 modals surface error via setError + data-testid="*-error"', () => {
    expect(CANCEL_MODAL).toMatch(/data-testid="cancel-course-error"/);
    expect(REFUND_MODAL).toMatch(/data-testid="refund-course-error"/);
    expect(EXCH_MODAL).toMatch(/data-testid="exchange-course-error"/);
  });

  test('G2.5 ExchangeCourseModal uses courseIndex (not courseId) for helper signature', () => {
    expect(EXCH_MODAL).toMatch(/exchangeCourseProduct\(\s*row\.customerId\s*,\s*row\.courseIndex\s*,/);
  });
});

describe('G3 status fallback + Thai enum + audit log', () => {
  test('G3.1 flattenCustomerCourses applies status fallback via parseStatusFromCourse', () => {
    expect(UTILS_SRC).toMatch(/parseStatusFromCourse\(course\)/);
  });

  test('G3.1-bis Phase 16.5 fix: flatten emits hasRealCourseId + synthetic id-${courseIndex} fallback', () => {
    expect(UTILS_SRC).toMatch(/hasRealCourseId/);
    expect(UTILS_SRC).toMatch(/idx-\$\{courseIndex\}/);
    // Anti-regression: NO defensive courseId-required skip remains
    expect(UTILS_SRC).not.toMatch(/if \(!course\s*\|\|\s*!course\.courseId\)\s*return;/);
  });

  test('G3.1-tris cancel/refund modals pass courseIndex to backend wrapper', () => {
    expect(CANCEL_MODAL).toMatch(/courseIndex:\s*row\.courseIndex/);
    expect(REFUND_MODAL).toMatch(/courseIndex:\s*row\.courseIndex/);
    expect(CANCEL_MODAL).toMatch(/row\.hasRealCourseId/);
    expect(REFUND_MODAL).toMatch(/row\.hasRealCourseId/);
  });

  test('G3.1-quater applyCourseCancel + applyCourseRefund accept opts.courseIndex fallback', () => {
    expect(COURSE_EXCH).toMatch(/applyCourseCancel[\s\S]*?opts\.courseIndex/);
    expect(COURSE_EXCH).toMatch(/applyCourseRefund[\s\S]*?opts\.courseIndex/);
  });

  test('G7.1 Phase 16.5 fix: pagination (20/page) wired into RemainingCourseTab', () => {
    expect(TAB_SRC).toMatch(/PAGE_SIZE\s*=\s*20/);
    expect(TAB_SRC).toMatch(/data-testid="remaining-course-pagination"/);
    expect(TAB_SRC).toMatch(/data-testid="remaining-course-prev-page"/);
    expect(TAB_SRC).toMatch(/data-testid="remaining-course-next-page"/);
    expect(TAB_SRC).toMatch(/pagedRows/);
  });

  test('G7.2 Phase 16.5 fix: status filter pick wins over hasRemainingOnly for terminal statuses', () => {
    // Lock the fix shape — hasRemainingOnly only applies to active or empty status
    expect(UTILS_SRC).toMatch(/hasRemainingOnly is the DEFAULT-friendly view/);
    expect(UTILS_SRC).toMatch(/statusFilter && statusFilter !== STATUS_ACTIVE/);
  });

  test('G3.2 status enum uses Thai strings (not English)', () => {
    expect(UTILS_SRC).toMatch(/STATUS_ACTIVE\s*=\s*['"]กำลังใช้งาน['"]/);
    expect(UTILS_SRC).toMatch(/STATUS_USED\s*=\s*['"]ใช้หมดแล้ว['"]/);
    expect(UTILS_SRC).toMatch(/STATUS_REFUNDED\s*=\s*['"]คืนเงิน['"]/);
    expect(UTILS_SRC).toMatch(/STATUS_CANCELLED\s*=\s*['"]ยกเลิก['"]/);
  });

  test('G3.3 NO English status literals in 16.5 files (regression guard)', () => {
    // These exact tokens would have appeared if I drifted to English statuses.
    expect(UTILS_SRC).not.toMatch(/['"](active|cancelled|refunded|used)['"]/);
    expect(TAB_SRC).not.toMatch(/['"]status['"]:\s*['"](active|cancelled|refunded|used)['"]/);
  });

  test('G3.4 applyCourseCancel preserves audit trail (does NOT remove course from array)', () => {
    expect(COURSE_EXCH).toMatch(/applyCourseCancel/);
    // Cancel should produce nextCourses by REPLACING the course, not slicing it out.
    // Look for the pattern: prevCourses.slice(0, idx), cancelledCourse, prevCourses.slice(idx + 1)
    expect(COURSE_EXCH).toMatch(/cancelledCourse,\s*\.{3}prevCourses\.slice\(idx \+ 1\)/);
  });

  test('G3.5 cancelCustomerCourse writes to be_course_changes via courseChangeDoc', () => {
    const idx = CLIENT_SRC.indexOf('export async function cancelCustomerCourse(');
    expect(idx).toBeGreaterThan(-1);
    const slice = CLIENT_SRC.slice(idx, idx + 1500);
    expect(slice).toMatch(/tx\.set\(courseChangeDoc/);
    expect(slice).toMatch(/kind: 'cancel'/);
  });

  test('G3.6 buildChangeAuditEntry kind validation includes cancel', () => {
    expect(COURSE_EXCH).toMatch(/\['exchange', 'refund', 'cancel'\]/);
  });
});

describe('G4 nav + dashboard wiring', () => {
  test('G4.1 navConfig has reports-remaining-course entry', () => {
    expect(NAV_SRC).toMatch(/id: 'reports-remaining-course'/);
    expect(NAV_SRC).toMatch(/label: 'คอร์สคงเหลือ'/);
  });

  test('G4.2 navConfig imports Clock icon for the new entry', () => {
    expect(NAV_SRC).toMatch(/\bClock,?\s/); // Clock icon import
  });

  test('G4.3 BackendDashboard lazy-imports RemainingCourseTab', () => {
    expect(DASH_SRC).toMatch(/RemainingCourseTab\s*=\s*lazy\(\s*\(\)\s*=>\s*import\(\s*['"]\.\.\/components\/backend\/reports\/RemainingCourseTab\.jsx['"]/);
  });

  test('G4.4 BackendDashboard renders <RemainingCourseTab /> for activeTab', () => {
    expect(DASH_SRC).toMatch(/activeTab === 'reports-remaining-course'[\s\S]+?<RemainingCourseTab\b/);
  });

  test('G4.5 REPORT_LABELS includes the new entry', () => {
    expect(DASH_SRC).toMatch(/'reports-remaining-course':\s*'คอร์สคงเหลือ'/);
  });
});

describe('G5 row component contract', () => {
  test('G5.1 row imports isTerminalRow + STATUS_* enums', () => {
    expect(ROW_SRC).toMatch(/isTerminalRow/);
    expect(ROW_SRC).toMatch(/STATUS_ACTIVE/);
  });

  test('G5.2 row disables kebab when terminal', () => {
    expect(ROW_SRC).toMatch(/disabled=\{terminal\}/);
  });

  test('G5.3 Phase 16.5-ter — row exposes 2 action buttons (cancel + exchange); refund REMOVED', () => {
    expect(ROW_SRC).toMatch(/data-testid=\{[^}]*cancel-\$\{row\.courseId\}/);
    expect(ROW_SRC).toMatch(/data-testid=\{[^}]*exchange-\$\{row\.courseId\}/);
    // Refund button removed — user directive: refund flow lives in tab=sales only
    expect(ROW_SRC).not.toMatch(/data-testid=\{[^}]*refund-\$\{row\.courseId\}/);
  });

  test('G5.3-bis no Receipt icon import (was used for refund kebab item)', () => {
    expect(ROW_SRC).not.toMatch(/import\s+\{[^}]*Receipt[^}]*\}\s+from\s+['"]lucide-react/);
  });

  // ─── G8 Phase 16.5-ter — staff dropdown + sale-cancel cascade ─────────
  test('G8.1 buildChangeAuditEntry accepts staffId + staffName + writes them', () => {
    expect(COURSE_EXCH).toMatch(/staffId.*staffName/);
    expect(COURSE_EXCH).toMatch(/staffId:\s*String\(staffId/);
    expect(COURSE_EXCH).toMatch(/staffName:\s*String\(staffName/);
  });

  test('G8.2 listStaffByBranch helper exists in backendClient', () => {
    expect(CLIENT_SRC).toMatch(/export async function listStaffByBranch/);
  });

  test('G8.3 applySaleCancelToCourses helper exists + flips status (refund/cancel)', () => {
    expect(CLIENT_SRC).toMatch(/export async function applySaleCancelToCourses/);
    const idx = CLIENT_SRC.indexOf('export async function applySaleCancelToCourses');
    const slice = CLIENT_SRC.slice(idx, idx + 3000);
    expect(slice).toMatch(/kind === 'refund' \? 'คืนเงิน'/);
    expect(slice).toMatch(/'ยกเลิก'/);
    expect(slice).toMatch(/writeBatch\(db\)/);
  });

  test('G8.4 cancelBackendSale persists staffId/staffName on cancelled object', () => {
    const idx = CLIENT_SRC.indexOf('export async function cancelBackendSale');
    const slice = CLIENT_SRC.slice(idx, idx + 1500);
    expect(slice).toMatch(/staffId:\s*String\(opts\.staffId/);
    expect(slice).toMatch(/staffName:\s*String\(opts\.staffName/);
  });

  test('G8.5 CancelCourseModal + ExchangeCourseModal use ActorPicker + listStaffByBranch', () => {
    expect(CANCEL_MODAL).toMatch(/import ActorPicker/);
    expect(CANCEL_MODAL).toMatch(/listStaffByBranch/);
    expect(EXCH_MODAL).toMatch(/import ActorPicker/);
    expect(EXCH_MODAL).toMatch(/listStaffByBranch/);
  });

  test('G5.4 row uses fmtMoney for value display', () => {
    expect(ROW_SRC).toMatch(/fmtMoney\(/);
  });
});

describe('G6 Phase 16.5 marker comment present (institutional memory)', () => {
  test('G6.1 utils file marked Phase 16.5', () => {
    expect(UTILS_SRC).toMatch(/Phase 16\.5/);
  });

  test('G6.2 cancel modal marked Phase 16.5', () => {
    expect(CANCEL_MODAL).toMatch(/Phase 16\.5/);
  });

  test('G6.3 cancelCustomerCourse marked Phase 16.5', () => {
    const idx = CLIENT_SRC.indexOf('export async function cancelCustomerCourse(');
    const slice = CLIENT_SRC.slice(Math.max(0, idx - 600), idx);
    expect(slice).toMatch(/Phase 16\.5/);
  });
});
