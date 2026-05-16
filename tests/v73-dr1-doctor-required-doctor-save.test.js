// tests/v73-dr1-doctor-required-doctor-save.test.js
// V73-DR1 (2026-05-18) — doctor field required for BOTH 'staff' AND 'doctor'
// save modes in TreatmentFormPage. Pre-fix the gate only fired for 'staff'
// (Phase 26.2f-followup decision) so the purple "บันทึกสำหรับแพทย์" button
// would save an orphan doctor-note with no doctor attribution.
//
// User curse-report: "ทำให้ปุ่ม บันทึกสำหรับแพทย์ ใน TFP บังคับให้ต้องเลือก
// หมอด้วยสิวะ เป็นบันทึกของแพทย์เสือกไม่ Required field แพทย์ด้านบนสุดได้ยังไง"
//
// Fix: gate now `saveMode !== 'vitals' && !doctorId`. Skip ONLY for vitals
// save (nurse/staff records vitals before doctor sees patient — doctor TBD).
// Doctor + staff modes both require doctor selection.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const tfp = fs.readFileSync(path.join(ROOT, 'src/components/TreatmentFormPage.jsx'), 'utf8');

describe('V73-DR1 — doctor required for "บันทึกสำหรับแพทย์" + "บันทึกสำหรับพนักงาน"', () => {
  it('DR1.1 doctor-required gate fires when saveMode !== vitals AND no doctorId', () => {
    // Post-fix shape — the only allowed bypass is 'vitals' mode
    expect(tfp).toMatch(/if\s*\(\s*saveMode\s*!==\s*['"]vitals['"]\s*&&\s*!doctorId\s*\)\s*\{\s*scrollToError\(['"]doctor['"]\s*,\s*['"]กรุณาเลือกแพทย์['"]\)/);
  });

  it('DR1.2 pre-fix shape REMOVED — gate no longer scoped to "staff" only', () => {
    // Pre-fix: `if (saveMode === 'staff' && !doctorId)` — must NOT exist
    expect(tfp).not.toMatch(/if\s*\(\s*saveMode\s*===\s*['"]staff['"]\s*&&\s*!doctorId\s*\)/);
  });

  it('DR1.3 inline comment references V73-DR1 + user request', () => {
    expect(tfp).toMatch(/V73-DR1/);
  });
});

describe('V73-DR1 — simulator logic table', () => {
  // Simulate the new gate logic
  function shouldBlockSave({ saveMode, doctorId }) {
    return saveMode !== 'vitals' && !doctorId;
  }

  it('DR1.4 staff save WITHOUT doctor → BLOCKED', () => {
    expect(shouldBlockSave({ saveMode: 'staff', doctorId: '' })).toBe(true);
  });

  it('DR1.5 staff save WITH doctor → ALLOWED', () => {
    expect(shouldBlockSave({ saveMode: 'staff', doctorId: 'DOC-1' })).toBe(false);
  });

  it('DR1.6 doctor save WITHOUT doctor → BLOCKED (V73-DR1 NEW)', () => {
    // Pre-fix: doctor save bypassed check; would have returned false here
    expect(shouldBlockSave({ saveMode: 'doctor', doctorId: '' })).toBe(true);
  });

  it('DR1.7 doctor save WITH doctor → ALLOWED', () => {
    expect(shouldBlockSave({ saveMode: 'doctor', doctorId: 'DOC-1' })).toBe(false);
  });

  it('DR1.8 vitals save WITHOUT doctor → ALLOWED (legitimate exception)', () => {
    // Nurse/staff records vitals before doctor sees patient
    expect(shouldBlockSave({ saveMode: 'vitals', doctorId: '' })).toBe(false);
  });

  it('DR1.9 vitals save WITH doctor → ALLOWED', () => {
    expect(shouldBlockSave({ saveMode: 'vitals', doctorId: 'DOC-1' })).toBe(false);
  });
});
