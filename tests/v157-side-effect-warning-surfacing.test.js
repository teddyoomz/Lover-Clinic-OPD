// V157 — surface non-fatal side-effect failures at save (deposit/wallet/course/
// promo). Pre-V157 a failed money/course side-effect in the TFP auto-sale (and
// SaleTab) was swallowed to console only → invisible to the clinic → silent
// money/inventory discrepancy (the cross-COLLECTION torn-write's SILENT aspect).
// Fix: collect failures + a non-fatal window.alert before the success screen.
// The treatment/sale still saves (deliberate non-blocking design); the admin now
// SEES what to reconcile. Additive — the catches only run on a real failure.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const TFP = readFileSync(path.resolve(process.cwd(), 'src/components/TreatmentFormPage.jsx'), 'utf8');
const SALETAB = readFileSync(path.resolve(process.cwd(), 'src/components/backend/SaleTab.jsx'), 'utf8');

describe('V157.A — TFP collects + surfaces side-effect warnings', () => {
  it('A1 declares sideEffectWarnings', () => {
    expect(TFP).toMatch(/const sideEffectWarnings = \[\]/);
  });
  it('A2 value-channel catches push (create + edit deposit/wallet/course/promo)', () => {
    const pushes = TFP.match(/sideEffectWarnings\.push\(/g) || [];
    expect(pushes.length).toBeGreaterThanOrEqual(8);
  });
  it('A3 a non-fatal alert is surfaced BEFORE the success screen', () => {
    const idx = TFP.indexOf('if (sideEffectWarnings.length)');
    expect(idx).toBeGreaterThan(0);
    const succ = TFP.indexOf('setSuccess(true)', idx);
    expect(succ).toBeGreaterThan(idx);
    expect(TFP).toMatch(/window\.alert\(/);
  });
  it('A4 anti-regression: no undefined ${walletApplied} (TFP scope uses walletAppliedValue)', () => {
    // a bare ${walletApplied} would ReferenceError when the catch fires.
    expect(TFP).not.toMatch(/\$\{walletApplied\}/);
  });
});

describe('V157.B — SaleTab surfaces silent course/promo assign failures', () => {
  it('B1 declares saleSideEffectWarnings', () => {
    expect(SALETAB).toMatch(/const saleSideEffectWarnings = \[\]/);
  });
  it('B2 course + promo catches push to it', () => {
    const pushes = SALETAB.match(/saleSideEffectWarnings\.push\(/g) || [];
    expect(pushes.length).toBeGreaterThanOrEqual(2);
  });
  it('B3 alert before setSuccess', () => {
    const idx = SALETAB.indexOf('if (saleSideEffectWarnings.length)');
    expect(idx).toBeGreaterThan(0);
    const succ = SALETAB.indexOf('setSuccess(true)', idx);
    expect(succ).toBeGreaterThan(idx);
  });
});
