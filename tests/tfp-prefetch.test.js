// AV208 T6 (2026-07-18) — idle prefetch warms TFP master-data at staff shells.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';

const calls = { products: 0, courses: 0, dfGroups: 0, dfRates: 0 };
let rejectAll = false;
vi.mock('../src/lib/scopedDataLayer.js', () => ({
  listProducts: vi.fn(async () => { calls.products++; if (rejectAll) throw new Error('x'); return []; }),
  listCourses: vi.fn(async () => { calls.courses++; if (rejectAll) throw new Error('x'); return []; }),
  listDfGroups: vi.fn(async () => { calls.dfGroups++; if (rejectAll) throw new Error('x'); return []; }),
  listDfStaffRates: vi.fn(async () => { calls.dfRates++; if (rejectAll) throw new Error('x'); return []; }),
}));

import { warmTfpMasterData, _resetTfpPrefetchForTests } from '../src/lib/tfpPrefetch.js';

beforeEach(() => {
  _resetTfpPrefetchForTests();
  calls.products = calls.courses = calls.dfGroups = calls.dfRates = 0;
  rejectAll = false;
  vi.useFakeTimers();
});
afterEach(() => { vi.useRealTimers(); });

describe('AV208 P — warmTfpMasterData', () => {
  it('P1 fires the 4 listers AFTER the idle delay (default 4000ms), not before', async () => {
    warmTfpMasterData();
    await vi.advanceTimersByTimeAsync(3999);
    expect(calls.products).toBe(0);
    await vi.advanceTimersByTimeAsync(2);
    await vi.waitFor(() => expect(calls.products).toBe(1));
    expect(calls.courses).toBe(1);
    expect(calls.dfGroups).toBe(1);
    expect(calls.dfRates).toBe(1);
  });

  it('P2 once per session — a second call (2nd shell mounting) is a no-op', async () => {
    warmTfpMasterData();
    warmTfpMasterData();   // AdminDashboard + BackendDashboard both mounting
    await vi.advanceTimersByTimeAsync(5000);
    await vi.waitFor(() => expect(calls.products).toBe(1));
    warmTfpMasterData();   // later remount
    await vi.advanceTimersByTimeAsync(5000);
    expect(calls.products).toBe(1);
  });

  it('P3 all 4 listers reject → swallowed (allSettled) — no unhandled rejection', async () => {
    rejectAll = true;
    warmTfpMasterData();
    await vi.advanceTimersByTimeAsync(5000);
    await vi.waitFor(() => expect(calls.products).toBe(1));
    // reaching here without an unhandled rejection = pass (vitest fails the
    // test on unhandled rejections)
  });

  it('P4 custom delayMs honored', async () => {
    warmTfpMasterData({ delayMs: 100 });
    await vi.advanceTimersByTimeAsync(99);
    expect(calls.products).toBe(0);
    await vi.advanceTimersByTimeAsync(2);
    await vi.waitFor(() => expect(calls.products).toBe(1));
  });
});

describe('AV208 P5 — staff shells mount the prefetch (source-grep)', () => {
  for (const f of ['src/pages/BackendDashboard.jsx', 'src/pages/AdminDashboard.jsx']) {
    it(`${f} calls warmTfpMasterData in a mount effect`, () => {
      const src = readFileSync(f, 'utf8');
      expect(src).toMatch(/tfpPrefetch\.js'\)\.then\(\(m\) => m\.warmTfpMasterData\(\)\)/);
    });
  }
  it('customer-facing surfaces do NOT import tfpPrefetch (PatientForm/PatientDashboard/ClinicSchedule)', () => {
    for (const f of ['src/pages/PatientForm.jsx', 'src/pages/PatientDashboard.jsx', 'src/pages/ClinicSchedule.jsx', 'src/App.jsx']) {
      expect(readFileSync(f, 'utf8')).not.toMatch(/tfpPrefetch/);
    }
  });
});
