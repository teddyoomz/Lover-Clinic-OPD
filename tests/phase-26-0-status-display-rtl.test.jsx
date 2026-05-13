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
});
