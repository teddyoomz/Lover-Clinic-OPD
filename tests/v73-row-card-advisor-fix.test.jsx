// tests/v73-row-card-advisor-fix.test.jsx
// V73.RC1 (2026-05-18) — AppointmentHubRowCard advisor field-name fix.
//
// User report (with screenshot): Set ที่ปรึกษา = "กวางตุ้ง" in edit modal but
// card list shows ที่ปรึกษา as "-". Fix everywhere this displays incorrectly.
//
// Root cause: Field-name mismatch (V12 multi-reader-sweep family at display
// layer). RowCard line 247 read `appt.advisor` — that field name only exists
// as FORM STATE on AdminDashboard's local noDepositFormData (which maps to
// canonical `advisorId`/`advisorName` at write time via line 2884 + 3119).
// The stored Firestore doc has `advisorName` (not `advisor`), so the
// display always rendered "-".
//
// Class-of-bug expansion (Rule P Step 3): Cross-file grep for `appt.advisor`
// and `appointment.advisor` in display context returned ZERO other matches
// outside this file. Sibling fields on the same RowCard (doctor / assistant
// / room) all read the canonical `*Name` field correctly. So this is an
// ISOLATED 1-site bug.
//
// Canonical writer pattern (verified):
//   - src/components/backend/AppointmentFormModal.jsx:626 — `advisorName`
//   - src/lib/appointmentDepositBatch.js:536 — `advisorName`
//   - src/pages/AdminDashboard.jsx:3119 — `advisorName`
// Canonical reader pattern (verified — 6 sites + this one fixed):
//   - src/lib/appointmentReportAggregator.js:133 — `a.advisorName`
//   - src/lib/appointmentAnalysisAggregator.js:31,37 — `a?.advisorName`
//   - src/lib/lineBotResponder.js:425,806 — `a.advisorName`
//   - src/components/backend/reports/AppointmentReportTab.jsx:406,407,542
//   - src/components/backend/reports/AppointmentAnalysisTab.jsx:114,226,284,348,384

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const rowCard = SRC('src/components/admin/AppointmentHubRowCard.jsx');

describe('V73.RC1 — RowCard advisor reads canonical advisorName', () => {
  it('RC1.1 reads appt.advisorName (canonical Firestore field)', () => {
    expect(rowCard).toMatch(/appt\.advisorName/);
  });

  it('RC1.2 legacy appt.advisor preserved as fallback (defense-in-depth)', () => {
    expect(rowCard).toMatch(/appt\.advisorName\s*\|\|\s*appt\.advisor\s*\|\|\s*'-'/);
  });

  it('RC1.3 does NOT read appt.advisor as the SOLE source (pre-fix shape)', () => {
    // Pre-fix: `{appt.advisor || '-'}` — must NOT exist post-fix
    expect(rowCard).not.toMatch(/\{appt\.advisor\s*\|\|\s*'-'\}/);
  });

  it('RC1.4 sibling fields (doctor/room) still use canonical *Name pattern', () => {
    expect(rowCard).toMatch(/appt\.doctorName\s*\|\|\s*'-'/);
    expect(rowCard).toMatch(/appt\.roomName\s*\|\|\s*'-'/);
  });

  it('RC1.5 assistantName(s) fallback chain preserved', () => {
    expect(rowCard).toMatch(/appt\.assistantNames\s*\|\|\s*\[\]/);
  });
});

describe('V73.RC1 — class-of-bug classifier (Rule P Step 5)', () => {
  // Universal classifier: scan src/ for any appointment display surface that
  // might read `.advisor` without an `.advisorName` fallback. Lock against
  // recurrence.
  it('RC1.6 only RowCard reads .advisor pattern in display context (single site)', () => {
    // This test re-confirms the cross-file grep finding at fix time:
    // - AdminDashboard.jsx .advisor matches are FORM STATE (apptFormData.advisor
    //   / noDepositFormData.advisor) — internal field names mapped to
    //   advisorId/advisorName at write time
    // - RowCard line 247 — fixed
    // - No other display readers found
    //
    // If future code introduces a NEW appt-display reader of `.advisor`, this
    // test catches it by counting occurrences in display files. Display
    // files = `src/components/admin/Appointment*.jsx` and
    // `src/components/backend/AppointmentCalendarView.jsx`. (Reports use
    // aggregator-mapped `advisorName` already.)
    const displayFiles = [
      'src/components/admin/AppointmentHubRowCard.jsx',
      'src/components/admin/AppointmentHubView.jsx',
      'src/components/admin/AppointmentOpdStepperRow.jsx',
      'src/components/backend/AppointmentCalendarView.jsx',
    ];
    for (const file of displayFiles) {
      const src = SRC(file);
      // Each occurrence of .advisor MUST be paired with .advisorName fallback
      // OR be a comment/legacy-only reference (we look for the bug shape:
      // {appt.advisor || '-'} or similar without advisorName).
      const bugShape = /\{appt\.advisor\s*\|\|\s*['"][-—]['"]\}/g;
      const matches = src.match(bugShape) || [];
      expect(matches, `${file} contains pre-fix advisor read shape: ${JSON.stringify(matches)}`).toEqual([]);
    }
  });
});
