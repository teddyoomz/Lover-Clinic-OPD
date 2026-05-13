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

    it('D1.3 — doctor-save button hidden in edit mode (wrapped in {!isEdit && ...})', () => {
      // Find the button JSX block + check for {!isEdit && wrapper within 500 chars before
      const btnIdx = TFP_SOURCE.indexOf('tfp-doctor-save-btn');
      expect(btnIdx).toBeGreaterThan(-1);
      const before = TFP_SOURCE.slice(Math.max(0, btnIdx - 500), btnIdx);
      expect(before).toMatch(/\{\s*!isEdit\s*&&/);
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

    it('D2.2 — chip gated on t.status === doctor-recorded', () => {
      const chipIdx = CDV_SOURCE.indexOf('treatment-status-chip-doctor-recorded');
      expect(chipIdx).toBeGreaterThan(-1);
      const before = CDV_SOURCE.slice(Math.max(0, chipIdx - 400), chipIdx);
      expect(before).toMatch(/t\.status\s*===\s*['"]doctor-recorded['"]/);
    });

    it('D2.3 — chip Thai label "แพทย์ลงบันทึก"', () => {
      const chipIdx = CDV_SOURCE.indexOf('treatment-status-chip-doctor-recorded');
      const region = CDV_SOURCE.slice(chipIdx, chipIdx + 800);
      expect(region).toContain('แพทย์ลงบันทึก');
    });
  });

  describe('D3 — TreatmentTimelineModal status chip', () => {
    const TTM_PATH = join(process.cwd(), 'src/components/backend/TreatmentTimelineModal.jsx');
    const TTM_SOURCE = readFileSync(TTM_PATH, 'utf-8');

    it('D3.1 — chip data-testid pattern present', () => {
      expect(TTM_SOURCE).toMatch(/data-testid=\{\s*`treatment-status-chip-doctor-recorded-/);
    });

    it('D3.2 — chip gated on t.status === doctor-recorded', () => {
      const chipIdx = TTM_SOURCE.indexOf('treatment-status-chip-doctor-recorded');
      expect(chipIdx).toBeGreaterThan(-1);
      const before = TTM_SOURCE.slice(Math.max(0, chipIdx - 400), chipIdx);
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
