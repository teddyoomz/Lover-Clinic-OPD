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

    it('D1.3 — doctor-save button is always visible (Phase 27.2-bis: gate removed for re-edit)', () => {
      // Phase 27.2-bis (2026-05-14) — user directive "ทำให้ปุ่มข้อมูลซักประวัติ
      // สามารถแก้ไขได้เรื่อยๆ เหมือนปุ่มลงบันทึกแพทย์". Doctor button gate
      // (was `!isEdit || loadedTreatmentStatus === 'vitalsigns-recorded'`)
      // REMOVED so admin can re-save doctor info at any time. Each click
      // updates doctorRecordedAt to the latest save time.
      // Test inverted: assert the button block does NOT have the old gate
      // immediately above its <div> opener (sanity check the removal landed).
      const btnIdx = TFP_SOURCE.indexOf('tfp-doctor-save-btn');
      expect(btnIdx).toBeGreaterThan(-1);
      const before = TFP_SOURCE.slice(Math.max(0, btnIdx - 600), btnIdx);
      // Old conditional gate must NOT appear immediately above
      expect(before).not.toMatch(/\(\s*!isEdit\s*\|\|\s*loadedTreatmentStatus\s*===\s*['"]vitalsigns-recorded['"]\s*\)\s*&&\s*\(\s*\n\s*<div/);
      // Phase 27.2-bis marker comment present
      expect(before).toMatch(/Phase 27\.2-bis/);
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

  describe('D2 — CustomerDetailView status chip (Phase 28 fixup — moved to TreatmentLifecycleStepper)', () => {
    // Phase 28 (2026-05-14) — V21 lock-in fixup. The 290-line inline treatment-history
    // block in CustomerDetailView.jsx was extracted to <TreatmentHistoryCard /> + child
    // components. The "treatment-status-chip-doctor-recorded-*" data-testid pattern +
    // its "doctorRecordedAt OR status === doctor-recorded" gate + the Thai label
    // "แพทย์บันทึก" are no longer rendered as a sticker chip. They live in:
    //
    //   - src/components/backend/treatment-history/TreatmentLifecycleStepper.jsx
    //     → renders a 3-dot stepper with stage colors (vitals=teal, doctor=amber,
    //       completed=emerald). The "doctor-recorded" stage is represented by the
    //       amber done-state dot + the canonical Thai label from getStepLabels().
    //   - src/lib/treatmentDisplayResolvers.js — getTreatmentLifecycle reads
    //     `t.doctorRecordedAt || (t.status === 'doctor-recorded')` to build the
    //     lifecycle entries that drive the stepper.
    //
    // Sticker chip itself (treatment-status-chip-doctor-recorded-*) lives in
    // TreatmentReadOnlyPanel.jsx (read-only view, distinct surface from the row).
    //
    // The original V21 anti-regression intent (chip semantics + gate + label) is
    // preserved by asserting the contract at its new home, NOT by re-asserting
    // the old inline location.
    const PANEL_PATH = join(process.cwd(), 'src/components/backend/TreatmentReadOnlyPanel.jsx');
    const PANEL_SOURCE = readFileSync(PANEL_PATH, 'utf-8');
    const STEPPER_PATH = join(
      process.cwd(),
      'src/components/backend/treatment-history/TreatmentLifecycleStepper.jsx',
    );
    const STEPPER_SOURCE = readFileSync(STEPPER_PATH, 'utf-8');
    const RESOLVERS_PATH = join(process.cwd(), 'src/lib/treatmentDisplayResolvers.js');
    const RESOLVERS_SOURCE = readFileSync(RESOLVERS_PATH, 'utf-8');

    it('D2.1 (Phase 28 fixup) — chip data-testid pattern present in TreatmentReadOnlyPanel', () => {
      // The sticker chip's data-testid contract is preserved at the read-only-panel
      // surface, which is the canonical home for treatment status badges post-Phase-28.
      expect(PANEL_SOURCE).toMatch(/data-testid=\{\s*`treatment-status-chip-doctor-recorded-/);
    });

    it('D2.2 (Phase 28 fixup) — doctor-stage gate "doctorRecordedAt OR status === doctor-recorded" present in lifecycle resolver', () => {
      // The gate that was inline in CDV is now centralized in
      // treatmentDisplayResolvers.js — getTreatmentLifecycle uses the same
      // semantic OR-merge to add a 'doctor' entry. Asserting the resolver
      // gate locks the same contract at the canonical computation site.
      expect(RESOLVERS_SOURCE).toMatch(
        /doctorRecordedAt[\s\S]{0,200}status\s*===\s*['"]doctor-recorded['"]/,
      );
      // Stepper consumes lifecycle entries and renders the doctor stage with
      // amber done-state. Verify the stage discriminator + amber tone are
      // preserved as the visual contract for "this treatment passed doctor".
      expect(STEPPER_SOURCE).toMatch(/doctor:[\s\S]{0,400}amber-/);
    });

    it('D2.3 (Phase 28 fixup) — chip Thai label communicates "doctor recorded" semantic at the read-only-panel surface', () => {
      // Phase 27.2 (2026-05-14) reworded "แพทย์ลงบันทึก" → "แพทย์บันทึก" for the
      // CDV stacked-badge display only. That stacked-badge surface was deleted in
      // Phase 28's component split. The remaining authoritative chip surface
      // (TreatmentReadOnlyPanel) preserved the longer original label
      // "แพทย์ลงบันทึก" — same semantic ("doctor recorded the treatment"), longer
      // wording. Accepting either form locks the semantic contract without
      // forcing a label-rewording sweep that nobody asked for.
      const chipIdx = PANEL_SOURCE.indexOf('treatment-status-chip-doctor-recorded');
      expect(chipIdx).toBeGreaterThan(-1);
      const region = PANEL_SOURCE.slice(chipIdx, chipIdx + 800);
      // Match either "แพทย์บันทึก" (Phase 27.2 short form) OR "แพทย์ลงบันทึก"
      // (original long form, still live in the read-only-panel chip).
      expect(region).toMatch(/แพทย์(ลง)?บันทึก/);
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

    it('D5.2 (Phase 28 fixup) — row meta renders "· แก้ไขโดย: <name>" — moved to TreatmentHistoryRow', () => {
      // Phase 28 (2026-05-14) — V21 lock-in fixup. The "· แก้ไขโดย: <name>" row meta
      // line was extracted from CDV inline JSX into TreatmentHistoryRow.jsx as part
      // of the treatment-history component split (Task 6). The row now imports
      // ROLE_LABEL_TH from src/lib/roleLabels.js and renders the same conditional
      // span gated on `t.editedByName`. Asserting the new home preserves the V21
      // anti-regression intent (gate + label + data-testid pattern).
      const ROW_PATH = join(
        process.cwd(),
        'src/components/backend/treatment-history/TreatmentHistoryRow.jsx',
      );
      const ROW_SOURCE = readFileSync(ROW_PATH, 'utf-8');
      expect(ROW_SOURCE).toMatch(/data-testid=\{`treatment-edited-by-/);
      expect(ROW_SOURCE).toMatch(/แก้ไขโดย/);
      expect(ROW_SOURCE).toMatch(/t\.editedByName\s*&&/);
    });

    it('D5.3 (Phase 28 fixup) — ROLE_LABEL_TH constant — extracted to src/lib/roleLabels.js', () => {
      // Phase 28 (2026-05-14) — V21 lock-in fixup. ROLE_LABEL_TH was extracted
      // from CDV.jsx into src/lib/roleLabels.js (Task 4) for shared consumption
      // by treatment-history components per Rule C1 (Rule of 3). The constant
      // shape (doctor/assistant/staff → Thai labels) is preserved verbatim.
      // Asserting the new home + the consumer import locks the contract:
      //   - Constant exported from the lib with the canonical 3-key shape
      //   - TreatmentHistoryRow imports + uses it in the editedBy meta render
      const ROLE_LIB_PATH = join(process.cwd(), 'src/lib/roleLabels.js');
      const ROLE_LIB_SOURCE = readFileSync(ROLE_LIB_PATH, 'utf-8');
      expect(ROLE_LIB_SOURCE).toMatch(/export\s+const\s+ROLE_LABEL_TH\s*=\s*\{/);
      expect(ROLE_LIB_SOURCE).toMatch(/doctor:\s*['"]แพทย์['"]/);
      expect(ROLE_LIB_SOURCE).toMatch(/assistant:\s*['"]ผู้ช่วย['"]/);
      expect(ROLE_LIB_SOURCE).toMatch(/staff:\s*['"]พนักงาน['"]/);

      // Anti-regression: the row consumer must still import ROLE_LABEL_TH from
      // the canonical lib, not redefine it locally (Rule C1 lock).
      const ROW_PATH = join(
        process.cwd(),
        'src/components/backend/treatment-history/TreatmentHistoryRow.jsx',
      );
      const ROW_SOURCE = readFileSync(ROW_PATH, 'utf-8');
      expect(ROW_SOURCE).toMatch(/import\s+\{\s*ROLE_LABEL_TH\s*\}\s+from\s+['"][^'"]*roleLabels(\.js)?['"]/);
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
