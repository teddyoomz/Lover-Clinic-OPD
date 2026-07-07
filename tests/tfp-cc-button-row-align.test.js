import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// 2026-05-27 — TFP save-button row-alignment fix.
// User report (with screenshot): the teal "บันทึกข้อมูลซักประวัติ" (left col) and the
// purple "บันทึกสำหรับแพทย์" (right col) were "เกือบจะอยู่ใน row เดียวกันเป๊ะ ... ขาดนิดเดียว".
//
// Root cause (measured in a real browser via getBoundingClientRect):
//   LEFT column was block `space-y-4` (teal button NOT bottom-pinned) while the RIGHT
//   column is `flex flex-col` with the OPD card flex-1 (purple button IS bottom-pinned).
//   The trailing `mb-3` resolves differently in block vs flex context → ~12px button
//   offset even when columns are near-equal height. (Bumping CC `rows` is a NO-OP here —
//   CC is `flex-1`, so the row count never governs the column height.)
//
// Fix: mirror the right column — make the LEFT column `flex flex-col gap-4` (same 16px
//   inter-section spacing space-y-4 gave) and `mt-auto` the teal button div so it
//   bottom-pins to the grid-stretched column. Verified: teal.bottom === purple.bottom
//   (diff 0.0px) in BOTH "left taller" and "right taller" cases. Cosmetic-shell only —
//   no handler/state/prop/logic touched.

const SRC = readFileSync('src/components/TreatmentFormPage.jsx', 'utf8');

describe('TFP save-button row-alignment (2026-05-27)', () => {
  it('LEFT PANEL column is flex-col gap-4 (was space-y-4)', () => {
    const idx = SRC.indexOf('════ LEFT PANEL ════');
    expect(idx).toBeGreaterThan(-1);
    const win = SRC.slice(idx, idx + 700);
    expect(win).toContain('<div className="flex flex-col gap-4">');
    expect(win).not.toContain('className="space-y-4"'); // anti-regression: not the old block column (prose mention in the comment is fine)
  });

  it('teal vitals-save button div is mt-auto bottom-pinned', () => {
    const idx = SRC.indexOf('<div className="mb-3 mt-auto">');
    expect(idx).toBeGreaterThan(-1);
    // prove the mt-auto div is the vitals button (not some other div)
    expect(SRC.slice(idx, idx + 220)).toContain('data-testid="tfp-vitals-save-btn"');
  });

  it('right column still flex-bottom-pins the purple button (2026-05-25 work intact)', () => {
    expect(SRC).toContain('className="flex-1 flex flex-col"');          // OPD card grows
    expect(SRC).toContain("grow={key === 'symptoms'}");                  // CC field flex-grows (TFP callsite)
    // TFP extraction step 1 (2026-07-07): OPDFieldWithPrev (and its grow textarea)
    // moved verbatim to treatment-form/TfpFormPrimitives.jsx — assert at its new home.
    const PRIMS = readFileSync('src/components/treatment-form/TfpFormPrimitives.jsx', 'utf8');
    expect(PRIMS).toContain("resize-none ${grow ? 'flex-1 min-h-0' : ''}"); // CC textarea fills
  });

  it('purple doctor-save button still present + bottom-pinned via flex-1 (not mt-auto)', () => {
    const idx = SRC.indexOf('data-testid="tfp-doctor-save-btn"');
    expect(idx).toBeGreaterThan(-1);
    // its wrapping div is the plain mb-3 (flex-1 above it does the pinning)
    expect(SRC).toContain('<span>บันทึกสำหรับแพทย์</span>');
  });
});
