import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const TFP_PATH = join(process.cwd(), 'src/components/TreatmentFormPage.jsx');
const TFP_SOURCE = readFileSync(TFP_PATH, 'utf-8');

describe('Phase 26.2 — split-screen + customer.note source-grep', () => {
  describe('Item E — customer.note display above doctor-save button', () => {
    it('Item-E.1 — customerNote state declared with useState("")', () => {
      expect(TFP_SOURCE).toMatch(/const\s+\[customerNote,\s*setCustomerNote\]\s*=\s*useState\(\s*(?:''|"")\s*\)/);
    });
    it('Item-E.2 — load useEffect stamps customerNote from custData (with legacy fallback)', () => {
      expect(TFP_SOURCE).toMatch(/setCustomerNote\([\s\S]{0,200}?custData\?\.note/);
      expect(TFP_SOURCE).toMatch(/setCustomerNote\([\s\S]{0,200}?patientData/);
    });
    it('Item-E.3 — display block has data-testid="tfp-customer-note"', () => {
      expect(TFP_SOURCE).toMatch(/data-testid="tfp-customer-note"/);
    });
    it('Item-E.4 — display gated on customerNote truthy', () => {
      const idx = TFP_SOURCE.indexOf('tfp-customer-note');
      const before = TFP_SOURCE.slice(Math.max(0, idx - 300), idx);
      expect(before).toMatch(/\{customerNote\s*&&/);
    });
    it('Item-E.5 — uses ClipboardCheck icon + "หมายเหตุทั่วไป" title', () => {
      expect(TFP_SOURCE).toMatch(/import\s+\{[^}]*ClipboardCheck[^}]*\}\s+from\s+['"]lucide-react['"]/);
      const idx = TFP_SOURCE.indexOf('tfp-customer-note');
      const region = TFP_SOURCE.slice(idx, idx + 800);
      expect(region).toMatch(/หมายเหตุทั่วไป/);
      expect(region).toMatch(/<ClipboardCheck/);
    });
    it('Item-E.6 — display block precedes doctor-save button (positional)', () => {
      const noteIdx = TFP_SOURCE.indexOf('tfp-customer-note');
      const btnIdx = TFP_SOURCE.indexOf('tfp-doctor-save-btn');
      expect(noteIdx).toBeGreaterThan(0);
      expect(btnIdx).toBeGreaterThan(0);
      expect(noteIdx).toBeLessThan(btnIdx);
    });
    it('Item-E.7 — amber styling preserved (bg-amber-950/10 + border-amber-900/40)', () => {
      const idx = TFP_SOURCE.indexOf('tfp-customer-note');
      const region = TFP_SOURCE.slice(idx, idx + 800);
      expect(region).toMatch(/bg-amber-950\/10/);
      expect(region).toMatch(/border-amber-900\/40/);
    });
  });

  describe('Item G4 — history tab strip state + fetch + JSX', () => {
    it('G4.1 — historyTreatments state declared with useState([])', () => {
      expect(TFP_SOURCE).toMatch(/const\s+\[historyTreatments,\s*setHistoryTreatments\]\s*=\s*useState\(\s*\[\s*\]\s*\)/);
    });
    it('G4.2 — selectedHistoryTreatmentId state declared with useState(null)', () => {
      expect(TFP_SOURCE).toMatch(/const\s+\[selectedHistoryTreatmentId,\s*setSelectedHistoryTreatmentId\]\s*=\s*useState\(\s*null\s*\)/);
    });
    it('G4.3 — historyFullDoc state declared with useState(null)', () => {
      expect(TFP_SOURCE).toMatch(/const\s+\[historyFullDoc,\s*setHistoryFullDoc\]\s*=\s*useState\(\s*null\s*\)/);
    });
    it('G4.4 — history fetch useEffect calls getCustomerTreatments with customerId', () => {
      expect(TFP_SOURCE).toMatch(/getCustomerTreatments\s*\(\s*customerId\s*\)/);
    });
    it('G4.5 — tab strip renders data-testid="tfp-history-tab-${id}"', () => {
      expect(TFP_SOURCE).toMatch(/data-testid=\{`tfp-history-tab-\$\{/);
    });
    it('G4.6 — handleHistoryTabClick toggles selection (re-click clears to null)', () => {
      expect(TFP_SOURCE).toMatch(/handleHistoryTabClick/);
      // toggle: re-click active tab → null
      const idx = TFP_SOURCE.indexOf('handleHistoryTabClick');
      const region = TFP_SOURCE.slice(idx, idx + 400);
      expect(region).toMatch(/null/);
    });
    it('G4.7 — split-screen outer wrapper: max-w-[2000px] lg:flex when active', () => {
      // Phase 27.1 (2026-05-14) — Task 12 added 'relative' prefix for absolute-positioned
      // LayoutSwapButton + optional 'lg:flex-row-reverse' suffix via template literal.
      // Core invariants (max-w-[2000px], lg:flex) preserved. Regex accepts both shapes.
      expect(TFP_SOURCE).toMatch(/selectedHistoryTreatmentId\s*\?\s*[`'"](?:relative\s+)?max-w-\[2000px\]\s+lg:flex/);
    });
    it('G4.8 — right panel aside: hidden lg:block (desktop-only)', () => {
      expect(TFP_SOURCE).toMatch(/<aside\s+className=[`"'][^`"']*hidden\s+lg:block/);
    });
    it('G4.9 — TreatmentReadOnlyMirror imported + used in TFP (Phase 26.2g Task 8: swapped Panel → Mirror)', () => {
      // Phase 26.2g (V26.2g, 2026-05-13) — swapped Panel → Mirror in TFP split-screen
      // TreatmentReadOnlyPanel stays for TimelineModal only (condensed shape suits per-row list)
      expect(TFP_SOURCE).toMatch(/import\s+TreatmentReadOnlyMirror\s+from\s+['"][^'"]*TreatmentReadOnlyMirror(?:\.jsx)?['"]/);
      expect(TFP_SOURCE).toMatch(/<TreatmentReadOnlyMirror/);
      // Anti-regression: Panel must NOT appear in TFP (Mirror is the split-screen component now)
      expect(TFP_SOURCE).not.toMatch(/import\s+TreatmentReadOnlyPanel\s+from/);
      expect(TFP_SOURCE).not.toMatch(/<TreatmentReadOnlyPanel/);
    });
  });
});
