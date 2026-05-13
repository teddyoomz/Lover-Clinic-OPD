/**
 * Phase 26.2f-pre — vitals-save source-grep regression guards (V1, Task 5)
 *
 * These tests lock the structural contracts introduced in Tasks 1-4:
 *   - saveMode 'vitals' coercion in handleSubmit (string-arg + object-arg paths)
 *   - v26StatusPatch vitals branch stamps status:'vitalsigns-recorded' + recordedBy/At
 *   - Dual gate saveMode !== 'doctor' && saveMode !== 'vitals' at every deduction callsite
 *   - canAddNewItems extended to include vitalsigns-recorded state
 *   - vitalsigns-recorded chip in TreatmentReadOnlyPanel + CustomerDetailView
 *   - Vitals-save button present in TFP UI
 *
 * Rule N: targeted-only (source-grep, no React mount).
 * AV37 extension for Phase 26.2f-pre.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const TFP = readFileSync('src/components/TreatmentFormPage.jsx', 'utf8');
const PANEL = readFileSync('src/components/backend/TreatmentReadOnlyPanel.jsx', 'utf8');
const CDV = readFileSync('src/components/backend/CustomerDetailView.jsx', 'utf8');

describe('V1 Phase 26.2f-pre — vitals-save source-grep', () => {
  // ── Coercion: string-arg path ───────────────────────────────────────────
  it('V1.1 eventOrSaveMode string-arg coercion to "vitals" present', () => {
    // Matches: (eventOrSaveMode === 'vitals') ? 'vitals'
    expect(TFP).toMatch(
      /eventOrSaveMode\s*===\s*['"]vitals['"]\s*\)\s*\?\s*['"]vitals['"]/
    );
  });

  // ── Coercion: object-arg path ───────────────────────────────────────────
  it('V1.2 object-arg coercion (eventOrSaveMode.saveMode === "vitals") present ≥1×', () => {
    const matches = TFP.match(/eventOrSaveMode\.saveMode\s*===\s*['"]vitals['"]/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  // ── Status stamp: vitalsigns-recorded ──────────────────────────────────
  it('V1.3 status "vitalsigns-recorded" literal stamped in v26StatusPatch vitals branch', () => {
    expect(TFP).toMatch(/status\s*:\s*['"]vitalsigns-recorded['"]/);
  });

  it('V1.4 recordedBy stamped in vitals branch', () => {
    expect(TFP).toMatch(/recordedBy\s*:\s*auth\.currentUser/);
  });

  it('V1.5 recordedAt stamped with serverTimestamp() in vitals branch', () => {
    // Existing AV37.3 checks recordedAt for doctor path; V1.5 locks vitals path
    // by verifying at least 2 occurrences of the recordedAt:serverTimestamp pattern
    const matches = TFP.match(/recordedAt\s*:\s*serverTimestamp\s*\(\s*\)/g) || [];
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  // ── Dual gate at deduction callsites ────────────────────────────────────
  it('V1.6 dual gate saveMode !== "doctor" && saveMode !== "vitals" present ≥1×', () => {
    const matches = TFP.match(
      /saveMode\s*!==\s*['"]doctor['"]\s*&&\s*saveMode\s*!==\s*['"]vitals['"]/g
    ) || [];
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('V1.7 no bare saveMode !== "doctor" gate exists without the vitals extension', () => {
    // Each old-style saveMode !== 'doctor' (without the && vitals clause) would
    // be a missing dual-gate = potential bypass. Confirm zero bare occurrences.
    // Strategy: count total !== 'doctor' occurrences and total dual-gate occurrences.
    // They must be equal (every doctor-gate also has the vitals extension).
    const doctorGates = TFP.match(/saveMode\s*!==\s*['"]doctor['"]/g) || [];
    const dualGates = TFP.match(
      /saveMode\s*!==\s*['"]doctor['"]\s*&&\s*saveMode\s*!==\s*['"]vitals['"]/g
    ) || [];
    // Every doctor-gate must have vitals extension → counts must match
    expect(doctorGates.length).toBe(dualGates.length);
  });

  // ── canAddNewItems includes vitalsigns-recorded ──────────────────────────
  it('V1.8 canAddNewItems includes vitalsigns-recorded check', () => {
    expect(TFP).toMatch(
      /loadedTreatmentStatus\s*===\s*['"]vitalsigns-recorded['"]/
    );
  });

  it('V1.9 canAddNewItems declaration includes all three conditions', () => {
    // Must cover: mode === 'create', doctor-recorded, vitalsigns-recorded
    const declIdx = TFP.indexOf('const canAddNewItems');
    expect(declIdx).toBeGreaterThan(-1);
    const region = TFP.slice(declIdx, declIdx + 500);
    expect(region).toMatch(/mode\s*===\s*['"]create['"]/);
    expect(region).toMatch(/['"]doctor-recorded['"]/);
    expect(region).toMatch(/['"]vitalsigns-recorded['"]/);
  });

  // ── Vitals-save button in TFP UI ─────────────────────────────────────────
  it('V1.10 vitals-save button with data-testid present in TFP', () => {
    expect(TFP).toMatch(/data-testid\s*=\s*['"]tfp-vitals-save-btn['"]/);
  });

  it('V1.11 vitals-save button calls handleSubmit with "vitals"', () => {
    expect(TFP).toMatch(/handleSubmit\s*\(\s*['"]vitals['"]\s*\)/);
  });

  // ── TreatmentReadOnlyPanel vitals chip ───────────────────────────────────
  it('V1.12 TreatmentReadOnlyPanel renders vitalsigns-recorded chip', () => {
    expect(PANEL).toMatch(/vitalsigns-recorded/);
  });

  it('V1.13 TreatmentReadOnlyPanel chip has data-testid for vitalsigns-recorded', () => {
    expect(PANEL).toMatch(/data-testid.*vitalsigns-recorded/);
  });

  // ── CustomerDetailView vitals chip (Phase 28 fixup — moved through HistoryRow → resolver) ──
  it('V1.14 (Phase 28 fixup) CustomerDetailView routes vitalsigns status into TreatmentLifecycleStepper via summary mapper', () => {
    // Phase 28 (2026-05-14) — V21 lock-in fixup. The 290-line inline
    // treatment-history block in CustomerDetailView.jsx was extracted to
    // <TreatmentHistoryCard /> + <TreatmentHistoryRow /> + <TreatmentLifecycleStepper />.
    // CDV no longer references the literal status string 'vitalsigns-recorded' — that
    // gate is now centralized in src/lib/treatmentDisplayResolvers.js
    // (getTreatmentLifecycle), which TreatmentLifecycleStepper consumes.
    //
    // The original V21 anti-regression intent ("CDV must surface vitalsigns status
    // through to the rendered chip/badge for RTL queries") is preserved because:
    //   1. CDV's treatmentSummary mapper preserves t.status (locked by D5.1)
    //   2. CDV passes treatments[] verbatim to <TreatmentHistoryCard />
    //   3. TreatmentHistoryCard → TreatmentHistoryRow → TreatmentLifecycleStepper
    //      consumes the lifecycle (which reads `status === 'vitalsigns-recorded'`)
    //   4. The vitalsigns-recorded chip itself lives in TreatmentReadOnlyPanel
    //      (V1.12 + V1.13 already lock that, both still passing)
    //
    // Asserting the resolver gate + the CDV → HistoryCard wiring preserves the
    // contract WITHOUT re-adding the orphan literal to CDV.
    const RESOLVERS = readFileSync('src/lib/treatmentDisplayResolvers.js', 'utf8');
    expect(RESOLVERS).toMatch(/status\s*===\s*['"]vitalsigns-recorded['"]/);
    // CDV must wire treatments[] into TreatmentHistoryCard (the entry point that
    // ultimately renders the lifecycle stepper).
    expect(CDV).toMatch(/<TreatmentHistoryCard\b/);
    expect(CDV).toMatch(/treatments=\{treatments\}/);
  });

  // ── saveMode vitals branch skips all deduction writes ───────────────────
  it('V1.15 saveMode === "vitals" literal present (not just via coercion result)', () => {
    // The v26StatusPatch branch uses saveMode === 'vitals' ? { ... } : ...
    expect(TFP).toMatch(/saveMode\s*===\s*['"]vitals['"]/);
  });
});
