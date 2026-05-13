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
});
