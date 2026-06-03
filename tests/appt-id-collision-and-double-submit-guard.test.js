// tests/appt-id-collision-and-double-submit-guard.test.js
// appointment-loop R3 (2026-06-03) — two appointment-relationship bugs:
//   (1) createBackendAppointment minted `BA-${Date.now()}` with NO random suffix
//       → two DIFFERENT appointments created in the SAME millisecond (two admins)
//       mint the SAME id → the 2nd tx.set overwrites the 1st's doc + orphans its
//       slots = silent appointment loss. The deposit path already uses a crypto
//       suffix (mintPairIds); this aligns createBackendAppointment.
//   (2) TreatmentFormPage.handleSubmit had NO synchronous re-entry guard — the
//       save buttons use disabled={saving} but React state lags one render, so a
//       rapid double-click could run handleSubmit twice → two treatments + two
//       auto-sales = DOUBLE CHARGE. A useRef flips synchronously.
//
// Behaviour proof: (1) is timing-bound (same-ms across 2 machines) and (2) is
// render-timing-bound — neither is e2e-deterministic, so these are source-grep
// regression locks of the fix shape (the fix is otherwise self-evidently correct).

import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const read = (p) => readFileSync(path.resolve(process.cwd(), p), 'utf8');
const BACKEND = read('src/lib/backendClient.js');
const DEPOSIT = read('src/lib/appointmentDepositBatch.js');
const TFP = read('src/components/TreatmentFormPage.jsx');

function fnExport(src, name) {
  const m = src.match(new RegExp(`export (?:async )?function ${name}\\b`));
  if (!m) return '';
  const start = m.index;
  const rest = src.slice(start + m[0].length);
  const next = rest.search(/\nexport (?:async )?function /);
  return src.slice(start, next >= 0 ? start + m[0].length + next : src.length);
}

describe('appointment-loop R3 — appointmentId collision (crypto suffix)', () => {
  test('R3.1 createBackendAppointment mints a crypto-suffixed id (BA-{ts}-{hex}), not bare Date.now()', () => {
    const body = fnExport(BACKEND, 'createBackendAppointment');
    expect(body).toMatch(/crypto\.getRandomValues/);
    expect(body).toMatch(/const appointmentId = `BA-\$\{_baTs\}-\$\{/);
    // anti-regression: the collision-prone bare form must be gone
    expect(body).not.toMatch(/const appointmentId = `BA-\$\{Date\.now\(\)\}`;/);
  });

  test('R3.2 matches the deposit path mintPairIds shape (both produce BA-{ts}-{8hex})', () => {
    expect(DEPOSIT).toMatch(/appointmentId: `BA-\$\{ts\}-\$\{suffix\}`/);
    // the appointment id readers already handle the suffixed form (deposit appts
    // have used it in prod since Phase 21.0), so this is a consistency alignment.
  });

  test('R3.3 CLASSIFIER — bare-`PREFIX-${Date.now()}` id class in backendClient', () => {
    // appointment-loop R3: appointmentId FIXED. The SAME class (no crypto suffix
    // → cross-process same-ms collision → silent overwrite) still exists for
    // OTHER systems below — DEFERRED to a focused id-collision sweep because
    // changing their id format needs per-format reader verification (the
    // suffixed form is NOT yet in prod for these, unlike BA- which is).
    const bareIds = (BACKEND.match(/const \w+ = `[A-Z]+-\$\{Date\.now\(\)\}`/g) || [])
      .map((s) => (s.match(/`([A-Z]+)-/) || [])[1]).filter(Boolean).sort();
    // KNOWN-DEFERRED set — if a NEW bare id appears OR one of these is fixed,
    // update this list (forces the class to stay tracked).
    expect(bareIds).toEqual(['BT', 'DEP', 'MBR']);
    // the appointment id is NOT in the bare set anymore (it was fixed this round)
    expect(BACKEND).not.toMatch(/const appointmentId = `BA-\$\{Date\.now\(\)\}`/);
  });
});

describe('appointment-loop R3 — TFP double-submit guard (no double charge)', () => {
  test('R3.4 handleSubmit has a synchronous submitInFlightRef re-entry guard, released in finally', () => {
    expect(TFP).toMatch(/const submitInFlightRef = useRef\(false\)/);
    expect(TFP).toMatch(/if \(submitInFlightRef\.current\) return;/);
    expect(TFP).toMatch(/submitInFlightRef\.current = true;/);
    expect(TFP).toMatch(/submitInFlightRef\.current = false;/);  // released in the finally
  });

  test('R3.5 the guard is placed AFTER the editor-attribution suspend-return (modal re-invoke NOT blocked)', () => {
    const idxAttr = TFP.indexOf('setEditAttributionModal({ isOpen: true })');
    const idxGuard = TFP.indexOf('if (submitInFlightRef.current) return;');
    expect(idxAttr).toBeGreaterThan(0);
    expect(idxGuard).toBeGreaterThan(idxAttr);  // guard comes AFTER the suspend-return
  });
});
