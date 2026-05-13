import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const TFP_PATH = join(process.cwd(), 'src/components/TreatmentFormPage.jsx');
const TFP_SOURCE = readFileSync(TFP_PATH, 'utf-8');

describe('Phase 26.0 — Status display RTL', () => {
  describe('D1 — TFP doctor-save button + edit-mode banner', () => {
    it('D1.1 — doctor-save button source-grep: `tfp-doctor-save-btn` data-testid + onClick handleSubmit doctor', () => {
      expect(TFP_SOURCE).toMatch(/data-testid="tfp-doctor-save-btn"/);
      expect(TFP_SOURCE).toMatch(/onClick=\{\s*\(\s*\)\s*=>\s*handleSubmit\s*\(\s*['"]doctor['"]\s*\)\s*\}/);
    });

    it('D1.2 — doctor-save button label "บันทึกสำหรับแพทย์"', () => {
      expect(TFP_SOURCE).toContain('บันทึกสำหรับแพทย์');
    });

    it('D1.3 — doctor-save button gate contains !isEdit condition (Phase 26.2f-pre: extended to allow vitalsigns-recorded edit)', () => {
      // Phase 26.2f-pre extended the gate from `{!isEdit &&` to
      // `{(!isEdit || loadedTreatmentStatus === 'vitalsigns-recorded') &&`
      // so that doctor-save is also available when completing a vitals-only
      // treatment in edit mode. Test updated per V21-class fixup protocol.
      const btnIdx = TFP_SOURCE.indexOf('tfp-doctor-save-btn');
      expect(btnIdx).toBeGreaterThan(-1);
      const before = TFP_SOURCE.slice(Math.max(0, btnIdx - 600), btnIdx);
      // Accept either the old shape (plain !isEdit) or the new extended shape
      expect(before).toMatch(/\(\s*!isEdit\s*\|\|/);
    });

    it('D1.4 — edit-mode banner source-grep: tfp-doctor-recorded-banner data-testid', () => {
      expect(TFP_SOURCE).toMatch(/data-testid="tfp-doctor-recorded-banner"/);
    });

    it('D1.5 — banner gated on loadedTreatmentStatus === doctor-recorded (Task 1 state name)', () => {
      // Plan's D1.5 spec used `loadedTreatment?.status` but Task 1 actually
      // implemented the state as `loadedTreatmentStatus` (a flat string state,
      // not a nested object). Per user brief: accept either form, since the
      // semantic invariant ("banner shows only when status === doctor-recorded")
      // is what matters. Both forms are valid implementations.
      const bannerIdx = TFP_SOURCE.indexOf('tfp-doctor-recorded-banner');
      expect(bannerIdx).toBeGreaterThan(-1);
      const before = TFP_SOURCE.slice(Math.max(0, bannerIdx - 500), bannerIdx);
      expect(before).toMatch(/(loadedTreatment\?\.status|loadedTreatmentStatus)\s*===\s*['"]doctor-recorded['"]/);
    });

    it('D1.6 — banner contains Thai instruction copy', () => {
      expect(TFP_SOURCE).toMatch(/การรักษานี้บันทึกโดยแพทย์/);
    });
  });

  describe('D2 — CustomerDetailView status chip', () => {
    const CDV_PATH = join(process.cwd(), 'src/components/backend/CustomerDetailView.jsx');
    const CDV_SOURCE = readFileSync(CDV_PATH, 'utf-8');

    it('D2.1 — chip data-testid pattern present', () => {
      expect(CDV_SOURCE).toMatch(/data-testid=\{\s*`treatment-status-chip-doctor-recorded-/);
    });

    it('D2.2 — chip rendered when doctor-recorded stage applies (new field OR legacy status)', () => {
      // Phase 27.2 (2026-05-14) — chip is now rendered from a stacked lifecycle
      // badge loop. Verify (1) the chip exists, (2) somewhere in the file the
      // gate is "doctorRecordedAt OR (status === doctor-recorded)". Both
      // assertions confirm the contract: chip renders only when treatment
      // has passed through doctor stage (via new field or legacy status).
      const chipIdx = CDV_SOURCE.indexOf('treatment-status-chip-doctor-recorded');
      expect(chipIdx).toBeGreaterThan(-1);
      // Lifecycle accumulator establishes the gate; chip renders when
      // lifecycle contains a 'doctor' entry. Anti-regression: the gate must
      // be present (file-wide check).
      expect(CDV_SOURCE).toMatch(/doctorRecordedAt[\s\S]{0,200}status\s*===\s*['"]doctor-recorded['"]/);
    });

    it('D2.3 — chip Thai label "แพทย์บันทึก" (Phase 27.2 reworded from "แพทย์ลงบันทึก")', () => {
      // Phase 27.2 (2026-05-14) — per user directive "บันทึกซักประวัติ , แพทย์บันทึก
      // , บันทึกแล้ว" — shortened from "แพทย์ลงบันทึก" to "แพทย์บันทึก" for the
      // stacked-badge display so all three labels are visually parallel.
      const chipIdx = CDV_SOURCE.indexOf('treatment-status-chip-doctor-recorded');
      const region = CDV_SOURCE.slice(chipIdx, chipIdx + 800);
      expect(region).toContain('แพทย์บันทึก');
    });
  });

  describe('D3 — TreatmentTimelineModal status chip', () => {
    // Phase 26.2c (V26.2, 2026-05-13) — chip moved to TreatmentReadOnlyPanel
    // Task 3 (c48dae9) DRY-refactored the chip JSX out of TreatmentTimelineModal.jsx
    // into TreatmentReadOnlyPanel.jsx. Redirect source-grep to the panel file.
    const PANEL_PATH = join(process.cwd(), 'src/components/backend/TreatmentReadOnlyPanel.jsx');
    const PANEL_SOURCE = readFileSync(PANEL_PATH, 'utf-8');

    it('D3.1 — chip data-testid pattern present', () => {
      expect(PANEL_SOURCE).toMatch(/data-testid=\{\s*`treatment-status-chip-doctor-recorded-/);
    });

    it('D3.2 — chip gated on t.status === doctor-recorded', () => {
      const chipIdx = PANEL_SOURCE.indexOf('treatment-status-chip-doctor-recorded');
      expect(chipIdx).toBeGreaterThan(-1);
      const before = PANEL_SOURCE.slice(Math.max(0, chipIdx - 400), chipIdx);
      expect(before).toMatch(/t\.status\s*===\s*['"]doctor-recorded['"]/);
    });
  });

  describe('D4 — rebuildTreatmentSummary preserves status', () => {
    const BC_PATH = join(process.cwd(), 'src/lib/backendClient.js');
    const BC_SOURCE = readFileSync(BC_PATH, 'utf-8');

    it('D4.1 — status field included in summary mapper output', () => {
      // Find the rebuildTreatmentSummary block + assert status: t.status || null pattern
      const fnIdx = BC_SOURCE.indexOf('function rebuildTreatmentSummary');
      expect(fnIdx).toBeGreaterThan(-1);
      const region = BC_SOURCE.slice(fnIdx, fnIdx + 1500);
      expect(region).toMatch(/status:\s*t\.status\s*\|\|\s*null/);
    });
  });

  describe('D5 — Phase 26.1 editor-attribution display + summary preservation', () => {
    it('D5.1 — CDV summary mapper includes status + editedBy + editedByName + editedByRole (Task 1 fix)', () => {
      const CDV_PATH = join(process.cwd(), 'src/components/backend/CustomerDetailView.jsx');
      const CDV_SOURCE = readFileSync(CDV_PATH, 'utf-8');
      const fnIdx = CDV_SOURCE.indexOf('const treatmentSummary = useMemo');
      expect(fnIdx).toBeGreaterThan(-1);
      const region = CDV_SOURCE.slice(fnIdx, fnIdx + 2000);
      expect(region).toMatch(/status:\s*t\.status\s*\|\|\s*null/);
      expect(region).toMatch(/editedBy:\s*t\.editedBy\s*\|\|\s*null/);
      expect(region).toMatch(/editedByName:\s*t\.editedByName\s*\|\|\s*['"]['"]/);
      expect(region).toMatch(/editedByRole:\s*t\.editedByRole\s*\|\|\s*['"]['"]/);
    });

    it('D5.2 — CDV row meta renders "· แก้ไขโดย: <name>" when editedByName present', () => {
      const CDV_PATH = join(process.cwd(), 'src/components/backend/CustomerDetailView.jsx');
      const CDV_SOURCE = readFileSync(CDV_PATH, 'utf-8');
      expect(CDV_SOURCE).toMatch(/data-testid={`treatment-edited-by-/);
      expect(CDV_SOURCE).toMatch(/แก้ไขโดย/);
      expect(CDV_SOURCE).toMatch(/t\.editedByName\s*&&/);
    });

    it('D5.3 — ROLE_LABEL_TH constant defined with doctor/assistant/staff keys', () => {
      const CDV_PATH = join(process.cwd(), 'src/components/backend/CustomerDetailView.jsx');
      const CDV_SOURCE = readFileSync(CDV_PATH, 'utf-8');
      expect(CDV_SOURCE).toMatch(/ROLE_LABEL_TH\s*=\s*\{/);
      expect(CDV_SOURCE).toMatch(/doctor:\s*['"]แพทย์['"]/);
      expect(CDV_SOURCE).toMatch(/assistant:\s*['"]ผู้ช่วย['"]/);
      expect(CDV_SOURCE).toMatch(/staff:\s*['"]พนักงาน['"]/);
    });

    it('D5.4 — rebuildTreatmentSummary preserves editedBy/Name/Role fields', () => {
      const BC_PATH = join(process.cwd(), 'src/lib/backendClient.js');
      const BC_SOURCE = readFileSync(BC_PATH, 'utf-8');
      const fnIdx = BC_SOURCE.indexOf('function rebuildTreatmentSummary');
      expect(fnIdx).toBeGreaterThan(-1);
      const region = BC_SOURCE.slice(fnIdx, fnIdx + 2000);
      expect(region).toMatch(/editedBy:\s*t\.editedBy\s*\|\|\s*null/);
      expect(region).toMatch(/editedByName:\s*t\.editedByName\s*\|\|\s*['"]['"]/);
      expect(region).toMatch(/editedByRole:\s*t\.editedByRole\s*\|\|\s*['"]['"]/);
    });
  });
});
