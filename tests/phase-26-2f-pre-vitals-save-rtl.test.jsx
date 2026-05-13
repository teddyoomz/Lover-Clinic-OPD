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

  // ── V2.3 — CustomerDetailView routes vitalsigns status (Phase 28 fixup) ───
  it('V2.3 (Phase 28 fixup) CustomerDetailView routes vitalsigns status through HistoryCard → resolver → stepper', () => {
    // Phase 28 (2026-05-14) — V21 lock-in fixup. The inline treatment-history
    // block in CDV (which used to reference 'vitalsigns-recorded' for the
    // chip/badge render) was extracted to <TreatmentHistoryCard /> + child
    // components. The status literal moved to the centralized resolver
    // (src/lib/treatmentDisplayResolvers.js) which TreatmentLifecycleStepper
    // consumes via getTreatmentLifecycle.
    //
    // The original V2.3 intent ("CDV surfaces vitalsigns status so RTL has a
    // target") is preserved through the wiring: CDV passes treatments[] to
    // <TreatmentHistoryCard /> which renders the row + stepper. RTL tests
    // can target the stepper's testids (treatment-lifecycle-stepper, stepper-dot)
    // instead of an inline CDV chip that no longer exists.
    const RESOLVERS = readFileSync('src/lib/treatmentDisplayResolvers.js', 'utf8');
    expect(RESOLVERS).toMatch(/status\s*===\s*['"]vitalsigns-recorded['"]/);
    expect(CDV).toMatch(/<TreatmentHistoryCard\b/);
    expect(CDV).toMatch(/treatments=\{treatments\}/);
  });
});
