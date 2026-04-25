// ─── Audit batch fixes — 2026-04-26 ──────────────────────────────────────
//
// Fixes from docs/audit-2026-04-26-sweep.md (post-verification triage):
//   - P1 [AP1]   createBackendAppointment server-side collision check
//   - P1 [RP5]   6 TFP + 3 ChartTemplateSelector silent catches → debugLog
//   - P2 [AV3]   txId / ptxId crypto.getRandomValues hardening
//   - P2 [C3]    Lock deleteBackendTreatment design intent (no-stock-reverse
//                IS deliberate per comment block 270-281; cancel-the-sale is
//                the canonical path to release stock)
//
// Companion to audit-2026-04-26-tz1-fixes.test.js which covers the TZ1 batch.

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const READ = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ═══════════════════════════════════════════════════════════════════════
// AB1 — AP1 server-side collision guard wired in createBackendAppointment
// ═══════════════════════════════════════════════════════════════════════

describe('AB1: AP1 server-side appointment collision check', () => {
  const SRC = READ('src/lib/backendClient.js');

  it('AB1.1: createBackendAppointment reads existing appointments before write', () => {
    const fn = SRC.match(/export async function createBackendAppointment[\s\S]+?^}/m)?.[0] || '';
    expect(fn).toMatch(/getAppointmentsByDate\(targetDate\)/);
  });

  it('AB1.2: filters by doctorId AND non-cancelled status', () => {
    const fn = SRC.match(/export async function createBackendAppointment[\s\S]+?^}/m)?.[0] || '';
    expect(fn).toMatch(/otherDoctorId !== targetDoctorId/);
    expect(fn).toMatch(/a\.status === 'cancelled'/);
  });

  it('AB1.3: time-range overlap uses targetStart < otherEnd && targetEnd > otherStart', () => {
    const fn = SRC.match(/export async function createBackendAppointment[\s\S]+?^}/m)?.[0] || '';
    expect(fn).toMatch(/targetStart < otherEnd && targetEnd > otherStart/);
  });

  it('AB1.4: throws Error with code AP1_COLLISION + collision payload', () => {
    const fn = SRC.match(/export async function createBackendAppointment[\s\S]+?^}/m)?.[0] || '';
    expect(fn).toMatch(/err\.code = 'AP1_COLLISION'/);
    expect(fn).toMatch(/err\.collision = collision/);
    expect(fn).toMatch(/throw err/);
  });

  it('AB1.5: skipServerCollisionCheck flag bypass exists for legacy imports', () => {
    const fn = SRC.match(/export async function createBackendAppointment[\s\S]+?^}/m)?.[0] || '';
    expect(fn).toMatch(/skipServerCollisionCheck/);
  });

  it('AB1.6: skipServerCollisionCheck flag is STRIPPED before persisting', () => {
    const fn = SRC.match(/export async function createBackendAppointment[\s\S]+?^}/m)?.[0] || '';
    expect(fn).toMatch(/skipServerCollisionCheck:\s*_stripGate/);
    expect(fn).toMatch(/\.\.\.persistData/);
  });

  it('AB1.7: AppointmentFormModal handles AP1_COLLISION with Thai message', () => {
    const SRC2 = READ('src/components/backend/AppointmentFormModal.jsx');
    expect(SRC2).toMatch(/e\?\.code === 'AP1_COLLISION'/);
    expect(SRC2).toMatch(/ช่วงเวลานี้ถูกจองให้แพทย์ท่านนี้แล้ว/);
  });

  it('AB1.8: reads doctorId via fallback chain (data.doctorId || data.doctor?.id)', () => {
    const fn = SRC.match(/export async function createBackendAppointment[\s\S]+?^}/m)?.[0] || '';
    expect(fn).toMatch(/data\?\.doctorId\s*\|\|\s*data\?\.doctor\?\.id/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// AB2 — Pure-mirror simulation of the AP1 collision logic to verify
// the time-overlap math against adversarial inputs
// ═══════════════════════════════════════════════════════════════════════

describe('AB2: AP1 collision detection pure simulate', () => {
  function findCollision(existing, target) {
    return existing.find(a => {
      const otherDoctorId = String(a.doctorId || '').trim();
      if (otherDoctorId !== String(target.doctorId).trim()) return false;
      if (a.status === 'cancelled') return false;
      const otherStart = String(a.startTime || '').trim();
      const otherEnd = String(a.endTime || a.startTime || '').trim();
      const tStart = String(target.startTime).trim();
      const tEnd = String(target.endTime || target.startTime).trim();
      return tStart < otherEnd && tEnd > otherStart;
    });
  }

  const make = (over) => ({ doctorId: 'D1', startTime: '10:00', endTime: '11:00', status: 'confirmed', ...over });

  it('AB2.1: no overlap when target is before existing', () => {
    const c = findCollision([make()], { doctorId: 'D1', startTime: '08:00', endTime: '09:00' });
    expect(c).toBeUndefined();
  });

  it('AB2.2: no overlap when target is after existing', () => {
    const c = findCollision([make()], { doctorId: 'D1', startTime: '12:00', endTime: '13:00' });
    expect(c).toBeUndefined();
  });

  it('AB2.3: edge-touch (target.start == existing.end) is NOT a collision', () => {
    const c = findCollision([make()], { doctorId: 'D1', startTime: '11:00', endTime: '12:00' });
    expect(c).toBeUndefined();
  });

  it('AB2.4: full overlap detected', () => {
    const c = findCollision([make()], { doctorId: 'D1', startTime: '10:30', endTime: '10:45' });
    expect(c?.startTime).toBe('10:00');
  });

  it('AB2.5: partial overlap front detected', () => {
    const c = findCollision([make()], { doctorId: 'D1', startTime: '09:30', endTime: '10:30' });
    expect(c?.startTime).toBe('10:00');
  });

  it('AB2.6: partial overlap back detected', () => {
    const c = findCollision([make()], { doctorId: 'D1', startTime: '10:30', endTime: '11:30' });
    expect(c?.startTime).toBe('10:00');
  });

  it('AB2.7: enclosing overlap detected', () => {
    const c = findCollision([make()], { doctorId: 'D1', startTime: '09:30', endTime: '11:30' });
    expect(c?.startTime).toBe('10:00');
  });

  it('AB2.8: different doctor → no collision (even at same time)', () => {
    const c = findCollision([make()], { doctorId: 'D2', startTime: '10:30', endTime: '10:45' });
    expect(c).toBeUndefined();
  });

  it('AB2.9: cancelled appointment → no collision (slot is free)', () => {
    const c = findCollision([make({ status: 'cancelled' })], { doctorId: 'D1', startTime: '10:30', endTime: '10:45' });
    expect(c).toBeUndefined();
  });

  it('AB2.10: zero-duration target (start == end) at existing window → collision', () => {
    const c = findCollision([make()], { doctorId: 'D1', startTime: '10:30', endTime: '10:30' });
    // Edge: zero-duration AT 10:30 — start (10:30) < end (11:00) AND end (10:30) > start (10:00) → collision
    expect(c?.startTime).toBe('10:00');
  });

  it('AB2.11: missing endTime falls back to startTime (zero-duration)', () => {
    const c = findCollision([{ doctorId: 'D1', startTime: '10:00', status: 'confirmed' }], {
      doctorId: 'D1', startTime: '10:00', endTime: '10:00',
    });
    // existing zero-duration at 10:00 vs target zero-duration at 10:00:
    // tStart (10:00) < otherEnd (10:00) → false. No collision.
    expect(c).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// AB3 — AV3 crypto-strengthened txId + ptxId
// ═══════════════════════════════════════════════════════════════════════

describe('AB3: AV3 crypto-strengthened tx + ptx IDs', () => {
  const SRC = READ('src/lib/backendClient.js');

  it('AB3.1: txId uses crypto.getRandomValues when available', () => {
    expect(SRC).toMatch(/function txId\(\)\s*\{[\s\S]+?crypto\.getRandomValues/);
  });

  it('AB3.2: ptxId uses crypto.getRandomValues when available', () => {
    expect(SRC).toMatch(/function ptxId\(\)\s*\{[\s\S]+?crypto\.getRandomValues/);
  });

  it('AB3.3: txId falls back to Math.random when crypto unavailable (test envs)', () => {
    const fn = SRC.match(/function txId\(\)\s*\{[\s\S]+?^}/m)?.[0] || '';
    expect(fn).toMatch(/Math\.random/);
  });

  it('AB3.4: ptxId falls back to Math.random when crypto unavailable', () => {
    const fn = SRC.match(/function ptxId\(\)\s*\{[\s\S]+?^}/m)?.[0] || '';
    expect(fn).toMatch(/Math\.random/);
  });

  it('AB3.5: ID format preserves the WTX- / PTX- prefix + Date.now() core', () => {
    expect(SRC).toMatch(/return `WTX-\$\{Date\.now\(\)\}-\$\{suffix\}`/);
    expect(SRC).toMatch(/return `PTX-\$\{Date\.now\(\)\}-\$\{suffix\}`/);
  });

  it('AB3.6: suffix uses 4 bytes (8 hex chars before slice) → 4-char base36 final', () => {
    const txFn = SRC.match(/function txId\(\)\s*\{[\s\S]+?^}/m)?.[0] || '';
    expect(txFn).toMatch(/new Uint8Array\(4\)/);
    expect(txFn).toMatch(/\.slice\(0,\s*4\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// AB4 — RP5 silent-catch migrations to debugLog
// ═══════════════════════════════════════════════════════════════════════

describe('AB4: RP5 silent catches migrated to debugLog', () => {
  it('AB4.1: TreatmentFormPage imports debugLog', () => {
    const src = READ('src/components/TreatmentFormPage.jsx');
    expect(src).toMatch(/import\s*\{\s*debugLog\s*\}\s*from\s*['"]\.\.\/lib\/debugLog\.js['"]/);
  });

  it('AB4.2: TFP medication-modal load logs unexpected errors', () => {
    const src = READ('src/components/TreatmentFormPage.jsx');
    expect(src).toMatch(/debugLog\(['"]tfp-medmodal-load['"]/);
  });

  it('AB4.3: TFP medication-group modal logs unexpected errors', () => {
    const src = READ('src/components/TreatmentFormPage.jsx');
    expect(src).toMatch(/debugLog\(['"]tfp-medgroup-load['"]/);
  });

  it('AB4.4: TFP consumable modal logs unexpected errors', () => {
    const src = READ('src/components/TreatmentFormPage.jsx');
    expect(src).toMatch(/debugLog\(['"]tfp-cons-load['"]/);
  });

  it('AB4.5: TFP consumable-group modal logs unexpected errors', () => {
    const src = READ('src/components/TreatmentFormPage.jsx');
    expect(src).toMatch(/debugLog\(['"]tfp-consgroup-load['"]/);
  });

  it('AB4.6: TFP buy-modal logs unexpected errors', () => {
    const src = READ('src/components/TreatmentFormPage.jsx');
    expect(src).toMatch(/debugLog\(['"]tfp-buy-load['"]/);
  });

  it('AB4.7: ChartTemplateSelector imports debugLog', () => {
    const src = READ('src/components/ChartTemplateSelector.jsx');
    expect(src).toMatch(/import\s*\{\s*debugLog\s*\}\s*from\s*['"]\.\.\/lib\/debugLog\.js['"]/);
  });

  it('AB4.8: ChartTemplateSelector JSON.parse fallback logs', () => {
    const src = READ('src/components/ChartTemplateSelector.jsx');
    expect(src).toMatch(/debugLog\(['"]chart-template-load['"]/);
  });

  it('AB4.9: ChartTemplateSelector ProClinic chart-template fetch logs', () => {
    const src = READ('src/components/ChartTemplateSelector.jsx');
    expect(src).toMatch(/debugLog\(['"]chart-template-pc['"]/);
  });

  it('AB4.10: ANTI-REGRESSION — no naked `} catch (_) {}` in TFP outer-load functions', () => {
    const src = READ('src/components/TreatmentFormPage.jsx');
    // Pattern targets the exact 6 sites we migrated. They all had
    // `setXLoading(false)` immediately after. Now the catches log first.
    const setLoaders = ['setMedModalLoading', 'setMedGroupLoading', 'setConsModalLoading', 'setConsGroupLoading', 'setBuyLoading'];
    for (const setter of setLoaders) {
      // For each setter, find the `${setter}(false)` line and look back ~3 lines
      // for the catch shape. None should be `} catch (_) {}`.
      const re = new RegExp(`\\}\\s*catch\\s*\\(_\\)\\s*\\{\\}\\s*\\n\\s*${setter}\\(false\\)`);
      expect(src).not.toMatch(re);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// AB5 — C3 design-intent lock: deleteBackendTreatment does NOT reverse
// stock by deliberate design (cancel the linked sale to release stock).
// Audit's CRITICAL flag was a false positive — comment block 270-281
// documents the intent. Lock with regression test so future contributors
// don't "fix" by adding reverseStockForTreatment.
// ═══════════════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════════
// AB6 — RP1/AV1 IIFE JSX refactor: render-time IIFEs at TFP:3286 + 4580
// extracted to component-scope useMemo + plain conditional render. Locks
// the rule-alignment fix so future contributors don't reintroduce the
// pattern.
// ═══════════════════════════════════════════════════════════════════════

describe('AB6: RP1/AV1 IIFE JSX refactor', () => {
  const SRC = READ('src/components/TreatmentFormPage.jsx');

  it('AB6.1: dfGrandTotal extracted to component-scope useMemo', () => {
    expect(SRC).toMatch(/const dfGrandTotal = useMemo\(\(\) => \{[\s\S]+?\}, \[dfEntries, treatmentCoursesForDf\]\)/);
  });

  it('AB6.2: pickModalCourse extracted to component-scope useMemo', () => {
    expect(SRC).toMatch(/const pickModalCourse = useMemo\(\(\) => \{[\s\S]+?\}, \[pickModalCourseId, options\?\.customerCourses\]\)/);
  });

  it('AB6.3: render uses dfGrandTotal directly (no IIFE wrapper)', () => {
    expect(SRC).toMatch(/dfGrandTotal\.toLocaleString\(['"]th-TH['"]/);
  });

  it('AB6.4: render uses {pickModalCourse && (...)} pattern (no IIFE)', () => {
    expect(SRC).toMatch(/\{pickModalCourse\s*&&\s*\(\s*<PickProductsModal/);
  });

  it('AB6.5: ANTI-REGRESSION — no IIFE JSX in TFP (any `{(() =>` followed by `})()}`)', () => {
    // Pattern to catch: `{(() => { ... })()}` in JSX. Must remain ZERO
    // matches after the refactor. Future drift = test fails.
    const matches = SRC.match(/\{\s*\(\(\)\s*=>\s*\{[\s\S]+?\}\)\(\)\s*\}/g) || [];
    expect(matches).toHaveLength(0);
  });

  it('AB6.6: Esc/conditional pattern preserved (no JSX behavior regression)', () => {
    // Verify the modal still gates on pickModalCourse truthy + that the
    // grand-total still gates on dfEntries.length > 0
    expect(SRC).toMatch(/\{pickModalCourse\s*&&/);
    expect(SRC).toMatch(/\{dfEntries\.length\s*>\s*0\s*&&/);
  });
});

describe('AB5: C3 deleteBackendTreatment design-intent lock', () => {
  const SRC = READ('src/lib/backendClient.js');

  it('AB5.1: deleteBackendTreatment does NOT call reverseStockForTreatment', () => {
    const fn = SRC.match(/export async function deleteBackendTreatment[\s\S]+?^}/m)?.[0] || '';
    expect(fn).not.toMatch(/reverseStockForTreatment/);
  });

  it('AB5.2: design-intent comment block precedes the function', () => {
    // The 11-line comment at lines 270-281 explains: stock is NOT reversed
    // here on purpose; the user must cancel/delete the linked SALE to put
    // products back. Lock the comment so a future "cleanup" doesn't strip
    // the rationale.
    const before = SRC.split('export async function deleteBackendTreatment')[0] || '';
    // The last ~600 chars before the function should contain the design comment.
    const tail = before.slice(-1500);
    expect(tail).toMatch(/IS NOT REVERSED/);
    expect(tail).toMatch(/cancel\/delete the linked|cancel the linked/);
  });

  it('AB5.3: edit-treatment correctly DOES call reverseStockForTreatment (the contrast)', () => {
    // The TFP handleSubmit on edit calls reverseStockForTreatment BEFORE
    // re-deducting. Locking that contract too — these two paths are NOT
    // symmetric and the asymmetry is the design.
    const tfp = READ('src/components/TreatmentFormPage.jsx');
    expect(tfp).toMatch(/reverseStockForTreatment/);
  });
});
