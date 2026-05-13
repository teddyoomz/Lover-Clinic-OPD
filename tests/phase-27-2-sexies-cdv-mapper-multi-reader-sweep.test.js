// V27.2-sexies regression bank — CDV in-component mapper V12 multi-reader-sweep fix.
//
// User report: "UI ที่ถูกต้องมันกระพริบขึ้นมาแปปนึง ต้องกด refresh ดูรัวๆ
// หลายๆทีถึงจะเห็น เหมือน UI ใหม่ที่สร้างยังถูกครอบด้วย UI เก่า".
//
// Root cause: CustomerDetailView.jsx:484 useMemo has 2 data sources for
// treatmentSummary. PRIMARY path maps from `treatments[]` (full treatment
// docs) via an in-component mapper. FALLBACK uses customer.treatmentSummary
// directly. When Phase 27.2 added per-stage lifecycle timestamps to
// rebuildTreatmentSummary (the Firestore writer), this LOCAL mapper was
// overlooked — it kept the old reduced field set. Result: badges flashed
// correct (initial render via fallback) then reverted (mapper strip).
//
// V12 multi-reader-sweep class round 3 on this exact file (Phase 26.0e
// missed `status`, Phase 26.1 added editor attribution, Phase 27.2 missed
// the lifecycle timestamps).
//
// Fix (Phase 27.2-sexies): mapper now mirrors rebuildTreatmentSummary's
// full field set — 9 lifecycle fields added.
//
// Regression bank locks the parity between writer and reader. Future
// rebuildTreatmentSummary changes MUST update both.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const CDV_SRC = readFileSync(
  'src/components/backend/CustomerDetailView.jsx',
  'utf-8'
);
const BC_SRC = readFileSync('src/lib/backendClient.js', 'utf-8');

// 9 lifecycle fields shared between rebuildTreatmentSummary (writer) and the
// in-component treatments → summary mapper (reader). MUST stay in sync.
const LIFECYCLE_FIELDS = [
  'vitalsignsRecordedAt',
  'vitalsignsRecordedBy',
  'doctorRecordedAt',
  'doctorRecordedBy',
  'completedAt',
  'completedBy',
  'recordedAt',
  'editedAt',
  'createdAt',
];

describe('Q6 — CDV mapper V12 multi-reader-sweep (Phase 27.2-sexies)', () => {
  it('Q6.1 — rebuildTreatmentSummary writer includes all 9 lifecycle fields', () => {
    const fnIdx = BC_SRC.indexOf('function rebuildTreatmentSummary');
    expect(fnIdx).toBeGreaterThan(0);
    const fnBody = BC_SRC.slice(fnIdx, fnIdx + 3000);
    for (const field of LIFECYCLE_FIELDS) {
      // Each field should appear with the canonical mapper pattern
      // `field: t.field || null` (or similar)
      const regex = new RegExp(`${field}:\\s*t\\.${field}`);
      expect(fnBody).toMatch(regex);
    }
  });

  it('Q6.2 — CDV in-component mapper INCLUDES all 9 lifecycle fields (V12 sweep)', () => {
    const memoIdx = CDV_SRC.indexOf('const treatmentSummary = useMemo');
    expect(memoIdx).toBeGreaterThan(0);
    const memoBody = CDV_SRC.slice(memoIdx, memoIdx + 4000);
    for (const field of LIFECYCLE_FIELDS) {
      const regex = new RegExp(`${field}:\\s*t\\.${field}`);
      expect(memoBody).toMatch(regex);
    }
  });

  it('Q6.3 — Phase 27.2-sexies marker comment present in CDV mapper', () => {
    const memoIdx = CDV_SRC.indexOf('const treatmentSummary = useMemo');
    const memoBody = CDV_SRC.slice(memoIdx, memoIdx + 4000);
    expect(memoBody).toMatch(/Phase 27\.2-sexies/);
  });

  it('Q6.4 — anti-regression: mapper preserves Phase 26.0e/26.1 fields (status + editor)', () => {
    // Don't accidentally remove pre-existing fields while adding new ones
    const memoIdx = CDV_SRC.indexOf('const treatmentSummary = useMemo');
    const memoBody = CDV_SRC.slice(memoIdx, memoIdx + 4000);
    expect(memoBody).toMatch(/status:\s*t\.status/);
    expect(memoBody).toMatch(/editedBy:\s*t\.editedBy/);
    expect(memoBody).toMatch(/editedByName:\s*t\.editedByName/);
    expect(memoBody).toMatch(/editedByRole:\s*t\.editedByRole/);
  });
});
