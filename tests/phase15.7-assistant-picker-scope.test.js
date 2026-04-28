// Phase 15.7 (2026-04-28) — assistant picker scope (show ALL, max-5 SELECT)
//
// User clarified: "ผู้ช่วยแพทย์ (สูงสุด 5 คน) หมายความว่า ให้เอาแพทย์และ
// ผู้ช่วยที่มีทั้งหมดมาให้เลือก แต่ select ได้แค่ 5 คนโว้ย".
//
// Pre-fix: AppointmentFormModal:189 + TreatmentFormPage:618-620 filtered
// the assistant picker by `position === 'ผู้ช่วยแพทย์'` — only people
// whose explicit position was "ผู้ช่วยแพทย์" appeared. Doctors couldn't
// be picked as assistants. User said this is wrong: show ALL, only the
// SELECTION is capped at 5.
//
// This test bank locks the V21 lesson — source-grep regression guards
// preventing the position filter from creeping back, plus assertions on
// the max-5 GATE-COUNT pattern.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const REPO_ROOT = path.resolve(import.meta.dirname || __dirname, '..');
const AppointmentFormModalSrc = readFileSync(path.join(REPO_ROOT, 'src/components/backend/AppointmentFormModal.jsx'), 'utf-8');
const TreatmentFormPageSrc = readFileSync(path.join(REPO_ROOT, 'src/components/TreatmentFormPage.jsx'), 'utf-8');
const DepositPanelSrc = readFileSync(path.join(REPO_ROOT, 'src/components/backend/DepositPanel.jsx'), 'utf-8');

describe('Phase 15.7 — Assistant picker scope', () => {
  describe('P1 — AppointmentFormModal picker shows ALL doctors', () => {
    it('P1.1 assistants useMemo returns the full doctors array (no filter)', () => {
      // The post-fix line: const assistants = useMemo(() => doctors, [doctors]);
      expect(AppointmentFormModalSrc).toMatch(/const\s+assistants\s*=\s*useMemo\(\s*\(\)\s*=>\s*doctors\s*,\s*\[doctors\]\s*\)/);
    });

    it('P1.2 NO position-based filter in the assistants useMemo', () => {
      // The pre-fix pattern that must not return:
      const PREVIEW_MATCH = /const\s+assistants\s*=\s*useMemo\([\s\S]{0,200}position\s*\|\|\s*''\)\.trim\(\)\s*===\s*'ผู้ช่วยแพทย์'/;
      expect(AppointmentFormModalSrc).not.toMatch(PREVIEW_MATCH);
    });

    it('P1.3 max-5 GATE-COUNT preserved (slice(0, 5) on add)', () => {
      // The check-on-add path uses slice(0, 5) — show all, gate selection.
      expect(AppointmentFormModalSrc).toMatch(/assistantIds:\s*e\.target\.checked[\s\S]{0,200}\.slice\(\s*0\s*,\s*5\s*\)/);
    });

    it('P1.4 empty-state copy no longer references position="ผู้ช่วยแพทย์"', () => {
      // Empty-state should now say "เพิ่มแพทย์/ผู้ช่วยแพทย์" without the
      // narrow "ตั้งค่าตำแหน่ง 'ผู้ช่วยแพทย์'" instruction.
      expect(AppointmentFormModalSrc).toMatch(/เพิ่มแพทย์\/ผู้ช่วยแพทย์/);
      expect(AppointmentFormModalSrc).not.toMatch(/ตั้งค่าตำแหน่ง 'ผู้ช่วยแพทย์'/);
    });
  });

  describe('P2 — TreatmentFormPage picker shows ALL doctors', () => {
    it('P2.1 backendOptions.assistants maps allDoctors directly (no .filter)', () => {
      // Post-fix shape: assistants: allDoctors.map(d => ...)
      // Pre-fix shape: assistants: allDoctors.filter(d => assistantPositionNames.includes(...)).map(...)
      expect(TreatmentFormPageSrc).toMatch(/assistants:\s*allDoctors\s*\n?\s*\.map\(d\s*=>\s*\(\{\s*id:\s*d\.id/);
    });

    it('P2.2 NO assistantPositionNames constant remaining', () => {
      // Constant was used only for the filter. It must be gone.
      expect(TreatmentFormPageSrc).not.toMatch(/assistantPositionNames/);
    });

    it('P2.3 NO doctorPositionNames constant remaining', () => {
      // Same for the doctor-position dev-only warn block — removed in lockstep.
      expect(TreatmentFormPageSrc).not.toMatch(/doctorPositionNames/);
    });

    it('P2.4 max-5 GATE-COUNT in toggleAssistant preserved', () => {
      expect(TreatmentFormPageSrc).toMatch(/if\s*\(prev\.length\s*>=\s*5\)\s*return\s+prev/);
    });
  });

  describe('P3 — DepositPanel picker (already correct, lock pattern)', () => {
    it('P3.1 doctors.map renders all doctors (no filter)', () => {
      // DepositPanel was already correct. We lock that against future drift.
      expect(DepositPanelSrc).toMatch(/doctors\.map\(d\s*=>\s*\{[\s\S]{0,400}apptAssistantIds\.includes/);
    });

    it('P3.2 max-5 GATE-COUNT preserved', () => {
      expect(DepositPanelSrc).toMatch(/setApptAssistantIds[\s\S]{0,200}\.slice\(\s*0\s*,\s*5\s*\)/);
    });
  });

  describe('P4 — Phase 15.7 institutional-memory markers', () => {
    it('P4.1 AppointmentFormModal carries Phase 15.7 marker comment', () => {
      expect(AppointmentFormModalSrc).toMatch(/Phase 15\.7/);
    });

    it('P4.2 TreatmentFormPage carries Phase 15.7 marker comment', () => {
      expect(TreatmentFormPageSrc).toMatch(/Phase 15\.7/);
    });
  });

  describe('P5 — Adversarial: ensure no other site re-introduces the filter', () => {
    it('P5.1 sweep src/components for the exact filter pattern', () => {
      // This is a global-grep style guard. We re-read the candidate files
      // and assert the OLD filter pattern is absent. (The two known sites
      // — AppointmentFormModal + TreatmentFormPage — are checked above.
      // This assertion catches any future copy-paste.)
      const ALL = AppointmentFormModalSrc + TreatmentFormPageSrc + DepositPanelSrc;
      // The key forbidden pattern: filter that NARROWS to position === 'ผู้ช่วยแพทย์'
      // for the assistants picker. Comments + audit text are fine.
      // We look for the exact regex `position .*=== 'ผู้ช่วยแพทย์'` inside a
      // .filter call — the most specific signature of the bug.
      const BUG_PATTERN = /\.filter\([^)]*position[^)]*===\s*'ผู้ช่วยแพทย์'\)/;
      expect(ALL).not.toMatch(BUG_PATTERN);
    });
  });
});
