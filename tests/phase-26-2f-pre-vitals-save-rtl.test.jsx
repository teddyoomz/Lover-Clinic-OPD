/**
 * Phase 26.2f-pre — vitals-save RTL assertions (V2, Task 5)
 *
 * Source-grep based RTL contract verification (no React mount).
 * Verifies that the vitals-save button, chip, and CustomerDetailView
 * reference exist in the source with the correct shape for RTL tests
 * to be written against.
 *
 * Rule N: targeted-only (source-grep, no React mount).
 * AV37 extension for Phase 26.2f-pre.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const TFP = readFileSync('src/components/TreatmentFormPage.jsx', 'utf8');
const PANEL = readFileSync('src/components/backend/TreatmentReadOnlyPanel.jsx', 'utf8');
const CDV = readFileSync('src/components/backend/CustomerDetailView.jsx', 'utf8');

describe('V2 Phase 26.2f-pre — vitals-save RTL contract', () => {
  // ── V2.1 — vitals-save button is present with correct testid ────────────
  it('V2.1 TFP vitals-save button has data-testid="tfp-vitals-save-btn"', () => {
    // The button must be present for RTL render tests to query by testid
    expect(TFP).toMatch(/data-testid\s*=\s*['"]tfp-vitals-save-btn['"]/);
  });

  // ── V2.2 — TreatmentReadOnlyPanel has vitalsigns-recorded chip ───────────
  it('V2.2 TreatmentReadOnlyPanel has vitalsigns-recorded chip with data-testid', () => {
    // Chip must carry a data-testid containing "vitalsigns-recorded"
    // so RTL tests can query it via getByTestId
    expect(PANEL).toMatch(/data-testid[^>]*vitalsigns-recorded/);
  });

  // ── V2.3 — CustomerDetailView references vitalsigns-recorded status ───────
  it('V2.3 CustomerDetailView has vitalsigns-recorded status reference', () => {
    // CDV must reference the new status so the badge/chip RTL test has a target
    expect(CDV).toMatch(/vitalsigns-recorded/);
  });
});
