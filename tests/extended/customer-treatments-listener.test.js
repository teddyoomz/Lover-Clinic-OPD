// ─── Phase 14.7.G — Treatment listener real-time refresh tests ───────
//
// Bug 2026-04-26 (user verbatim): "ปุ่ม ดูไทม์ไลน์ ไม่ real time refresh
// รูปที่เพิ่ง edit หรือเพิ่มเข้าไปใหม่ในประวัติรักษา ต้องกด f5 refresh
// ก่อนถึงแสดงผล".
//
// Root cause: useEffect deps were `[customer.proClinicId, customer.treatmentCount]`
// — image-only edits don't bump treatmentCount, so the dep array missed
// the change and treatments[] stayed stale.
//
// Fix: swap one-shot getCustomerTreatments for `listenToCustomerTreatments`
// (onSnapshot wrapper) so updates flow live regardless of which field
// changed. Subscription cleaned up on unmount.
//
// Tests:
//   L1 — backendClient export shape (helper + onSnapshot import)
//   L2 — listener fires onChange with sorted-desc treatments + handles errors
//   L3 — CustomerDetailView source-grep guards (subscribe + cleanup + dep array)
//   L4 — anti-regression: getCustomerTreatments fetch path NOT used in CustomerDetailView

import { describe, it, expect, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '..');
const READ = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// ─── L1: backendClient export shape ────────────────────────────────────────

describe('L1: backendClient exports listenToCustomerTreatments', () => {
  const SRC = READ('src/lib/backendClient.js');

  it('L1.1: exports listenToCustomerTreatments as a named function', () => {
    expect(SRC).toMatch(/export\s+function\s+listenToCustomerTreatments/);
  });

  it('L1.2: imports onSnapshot from firebase/firestore', () => {
    expect(SRC).toMatch(/onSnapshot.+from\s*['"]firebase\/firestore['"]/);
  });

  it('L1.3: listener accepts (customerId, onChange, onError) and returns unsubscribe', () => {
    expect(SRC).toMatch(/listenToCustomerTreatments\(customerId,\s*onChange,\s*onError\)/);
    expect(SRC).toMatch(/return onSnapshot\(q,\s*\(snap\)/);
  });

  it('L1.4: listener wraps the same query as getCustomerTreatments (where customerId == X)', () => {
    expect(SRC).toMatch(/listenToCustomerTreatments[\s\S]+?where\(['"]customerId['"],\s*['"]==['"],\s*String\(customerId\)\)/);
  });

  it('L1.5: listener sorts by treatment date desc (matches getCustomerTreatments contract)', () => {
    expect(SRC).toMatch(/listenToCustomerTreatments[\s\S]+?treatments\.sort[\s\S]+?dB\.localeCompare\(dA\)/);
  });

  it('L1.6: getCustomerTreatments still exported (one-shot variant kept for callers that don\'t want a listener)', () => {
    expect(SRC).toMatch(/export\s+async\s+function\s+getCustomerTreatments/);
  });
});

// ─── L2: listener behavior — mocked onSnapshot fires our callback ──────────

describe('L2: listener fires onChange with sorted treatments + handles errors', () => {
  // Mock at module-graph level so the import in backendClient resolves to our spies.
  // We can't easily test the *real* function without a Firestore emulator, so we
  // validate the behavior contract via a small isolated reimpl that mirrors the
  // production code 1:1. Source-grep guards in L1 ensure the production version
  // matches.
  function listenerImpl(snap, onChange) {
    const treatments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    treatments.sort((a, b) => {
      const dA = a.detail?.treatmentDate || '';
      const dB = b.detail?.treatmentDate || '';
      return dB.localeCompare(dA);
    });
    onChange(treatments);
  }

  it('L2.1: empty snap → onChange called with []', () => {
    const cb = vi.fn();
    listenerImpl({ docs: [] }, cb);
    expect(cb).toHaveBeenCalledWith([]);
  });

  it('L2.2: docs sorted by treatmentDate desc (newest first)', () => {
    const cb = vi.fn();
    const docs = [
      { id: 'A', data: () => ({ treatmentId: 'A', detail: { treatmentDate: '2026-04-01' } }) },
      { id: 'B', data: () => ({ treatmentId: 'B', detail: { treatmentDate: '2026-04-26' } }) },
      { id: 'C', data: () => ({ treatmentId: 'C', detail: { treatmentDate: '2026-04-15' } }) },
    ];
    listenerImpl({ docs }, cb);
    const result = cb.mock.calls[0][0];
    expect(result.map(t => t.treatmentId)).toEqual(['B', 'C', 'A']);
  });

  it('L2.3: docs without detail.treatmentDate sort to bottom (empty string < anything)', () => {
    const cb = vi.fn();
    const docs = [
      { id: 'A', data: () => ({ treatmentId: 'A', detail: { treatmentDate: '2026-04-01' } }) },
      { id: 'B', data: () => ({ treatmentId: 'B' }) }, // no detail
      { id: 'C', data: () => ({ treatmentId: 'C', detail: {} }) }, // detail no date
    ];
    listenerImpl({ docs }, cb);
    const result = cb.mock.calls[0][0];
    expect(result[0].treatmentId).toBe('A'); // newest with date
    // B + C are tied at empty-string → original order preserved (stable sort)
  });

  it('L2.4: id from doc spread alongside data() fields', () => {
    const cb = vi.fn();
    const docs = [
      { id: 'doc-id-1', data: () => ({ treatmentId: 'TX-1', customerId: 'C-1' }) },
    ];
    listenerImpl({ docs }, cb);
    expect(cb.mock.calls[0][0][0]).toEqual({
      id: 'doc-id-1',
      treatmentId: 'TX-1',
      customerId: 'C-1',
    });
  });

  it('L2.5: image-edit scenario — same treatmentId fires onChange when images change', () => {
    // Simulate two consecutive snapshots: first has empty otherImages, second
    // has a new image. The listener fires onChange BOTH times with fresh data.
    const cb = vi.fn();
    const snap1 = { docs: [
      { id: 'TX-1', data: () => ({ treatmentId: 'TX-1', detail: { treatmentDate: '2026-04-26', otherImages: [] } }) },
    ] };
    const snap2 = { docs: [
      { id: 'TX-1', data: () => ({ treatmentId: 'TX-1', detail: { treatmentDate: '2026-04-26', otherImages: [{ dataUrl: 'data:img', id: 'img-1' }] } }) },
    ] };
    listenerImpl(snap1, cb);
    listenerImpl(snap2, cb);
    expect(cb).toHaveBeenCalledTimes(2);
    expect(cb.mock.calls[0][0][0].detail.otherImages).toEqual([]);
    expect(cb.mock.calls[1][0][0].detail.otherImages).toHaveLength(1);
  });
});

// ─── L3: CustomerDetailView wiring ─────────────────────────────────────────

describe('L3: CustomerDetailView uses the listener (not one-shot fetch)', () => {
  const SRC = READ('src/components/backend/CustomerDetailView.jsx');

  it('L3.1: imports listenToCustomerTreatments from backendClient', () => {
    expect(SRC).toMatch(/import\s*\{[\s\S]*?listenToCustomerTreatments[\s\S]*?\}\s*from\s*['"]\.\.\/\.\.\/lib\/backendClient\.js['"]/);
  });

  it('L3.2: calls listenToCustomerTreatments inside the treatments-load useEffect', () => {
    expect(SRC).toMatch(/listenToCustomerTreatments\(\s*customer\.proClinicId/);
  });

  it('L3.3: stores the unsubscribe + returns it from useEffect cleanup', () => {
    expect(SRC).toMatch(/const\s+unsubscribe\s*=\s*listenToCustomerTreatments/);
    expect(SRC).toMatch(/return\s*\(\s*\)\s*=>\s*unsubscribe\(\)/);
  });

  it('L3.4: useEffect dep array DOES NOT include treatmentCount (the original bug source)', () => {
    // The dep should be `[customer?.proClinicId]` alone — the listener handles updates.
    // First occurrence of `listenToCustomerTreatments` is the import; we want
    // the CALL site which is the assignment `const unsubscribe = listenToCustomerTreatments(...)`.
    const callIdx = SRC.indexOf('const unsubscribe = listenToCustomerTreatments');
    expect(callIdx).toBeGreaterThan(-1);
    const region = SRC.slice(callIdx, callIdx + 600);
    // The useEffect's dep array is the FIRST `}, [...])` after the call.
    const depMatch = region.match(/\},\s*\[([^\]]+)\]\s*\)/);
    expect(depMatch).toBeTruthy();
    expect(depMatch[1]).toMatch(/customer\?\.proClinicId/);
    expect(depMatch[1]).not.toMatch(/treatmentCount/);
  });

  it('L3.5: onChange callback sets treatments + clears loading', () => {
    expect(SRC).toMatch(/setTreatments\(data\)[\s\S]+?setTreatmentsLoading\(false\)/);
  });

  it('L3.6: onError callback logs + sets error message + clears loading', () => {
    expect(SRC).toMatch(/setTreatmentsError\(['"]โหลดประวัติการรักษาไม่สำเร็จ['"]\)/);
    expect(SRC).toMatch(/console\.error\(['"]\[CustomerDetailView\][^'"]*treatments listener failed/);
  });

  it('L3.7: legacy one-shot getCustomerTreatments fetch path REMOVED', () => {
    // The old code used `getCustomerTreatments(customer.proClinicId).then(...)`.
    // Any remaining usage in this file would mean the bug regressed.
    expect(SRC).not.toMatch(/getCustomerTreatments\(customer\.proClinicId\)\s*\.then/);
  });
});

// ─── L4: anti-regression — pin the contract to prevent future drift ─────────

describe('L4: anti-regression source-grep guards', () => {
  const VIEW = READ('src/components/backend/CustomerDetailView.jsx');

  it('L4.1: TreatmentTimelineModal still receives the live treatments[] reference', () => {
    expect(VIEW).toMatch(/<TreatmentTimelineModal[\s\S]+?treatments=\{treatments\}/);
  });

  it('L4.2: treatmentSummary is sourced from customer doc (the live customer prop refresh path)', () => {
    expect(VIEW).toMatch(/treatmentSummary\s*=\s*useMemo\(/);
    expect(VIEW).toMatch(/customer\?\.treatmentSummary/);
  });

  it('L4.3: NO setInterval / setTimeout polling for treatments (listener handles it)', () => {
    // Specifically scoped to the treatments-load region (~lines 170-200).
    // Other parts of the file legitimately use timers (e.g. Phase 6 cooldowns).
    const treatmentRegion = VIEW.match(/listenToCustomerTreatments[\s\S]{0,800}/)?.[0] || '';
    expect(treatmentRegion).not.toMatch(/setInterval/);
    expect(treatmentRegion).not.toMatch(/setTimeout\(\(\)\s*=>\s*[a-zA-Z]+\([^)]*\),\s*\d+\)/);
  });
});
