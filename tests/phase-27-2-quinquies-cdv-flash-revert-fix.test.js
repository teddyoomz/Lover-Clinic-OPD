// V27.2-quinquies regression bank — CustomerDetailView flash-revert fix.
// User report: "UI ใหม่ที่สร้างยังถูกครอบด้วย UI เก่า ... กระพริบ ต้องกด
// refresh ดูรัวๆหลายๆทีถึงจะเห็น".
//
// Root cause: CDV's customer-listener useEffect had `[customerId, customerProp]`
// in its dep array. Object reference identity for `customerProp` changes on
// every parent re-render, even when the underlying data is identical. This
// triggered spurious effect re-fires that called `setLiveCustomer(customerProp)`,
// overwriting fresh listener data with the stale prop. Listener then re-caught
// up — produced flash-revert UI pattern.
//
// Fix (Phase 27.2-quinquies, 2026-05-14): dep array now `[customerId]` only.
// Effect re-fires ONLY when a different customer is selected. Listener handles
// all in-place customer-doc updates.
//
// Class-of-bug grep (Rule P): single instance in src/. No other files match
// the pattern `useEffect(...) ... [<id>, <prop>]` where <prop> is an object
// reference. Classifier: isolated React state-management anti-pattern;
// no AVxx invariant added (not project-canonical).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const CDV_SRC = readFileSync(
  'src/components/backend/CustomerDetailView.jsx',
  'utf-8'
);

describe('Q5 — CustomerDetailView flash-revert fix (Phase 27.2-quinquies)', () => {
  it('Q5.1 — listenToCustomer useEffect dep array is [customerId] only (no customerProp)', () => {
    // Locate the listenToCustomer effect
    const idx = CDV_SRC.indexOf('const unsubscribe = listenToCustomer');
    expect(idx).toBeGreaterThan(0);
    // Search for the dep array closing pattern AFTER the unsubscribe return
    const afterReturn = CDV_SRC.slice(idx, idx + 800);
    // Forbidden: customerProp in deps (was the bug)
    expect(afterReturn).not.toMatch(/\[\s*customerId\s*,\s*customerProp\s*\]/);
    // Required: dep array is just [customerId]
    expect(afterReturn).toMatch(/\}\s*,\s*\[\s*customerId\s*\]\s*\)/);
  });

  it('Q5.2 — Phase 27.2-quinquies marker comment present near the effect', () => {
    expect(CDV_SRC).toMatch(/Phase 27\.2-quinquies/);
  });

  it('Q5.3 — listener still subscribes via listenToCustomer with onChange + onError', () => {
    // Anti-regression: don't accidentally remove the listener entirely
    const idx = CDV_SRC.indexOf('const unsubscribe = listenToCustomer');
    expect(idx).toBeGreaterThan(0);
    const block = CDV_SRC.slice(idx, idx + 400);
    expect(block).toMatch(/listenToCustomer\(\s*customerId\s*,/);
    expect(block).toMatch(/setLiveCustomer\(live\)/);
  });

  it('Q5.4 — setLiveCustomer(customerProp) is still called inside the effect (initial seed)', () => {
    // Verify the prop-seed line is preserved (intent: seed initial state
    // when customer changes; not the bug — the bug was the DEP ARRAY).
    const idx = CDV_SRC.indexOf('Phase 27.2-quinquies');
    expect(idx).toBeGreaterThan(0);
    const block = CDV_SRC.slice(idx, idx + 1500);
    expect(block).toMatch(/setLiveCustomer\(customerProp\)/);
  });

  it('Q5.5 — eslint-disable-next-line annotation present (intentional dep omission)', () => {
    // Document that the omission is deliberate, not an oversight.
    const idx = CDV_SRC.indexOf('Phase 27.2-quinquies');
    const block = CDV_SRC.slice(idx, idx + 1500);
    expect(block).toMatch(/eslint-disable-next-line react-hooks\/exhaustive-deps/);
  });
});
