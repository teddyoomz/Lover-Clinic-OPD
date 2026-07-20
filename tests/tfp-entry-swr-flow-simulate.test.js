// AV208 T5 (2026-07-18) — Rule I flow-simulate: the TFP entry SWR chain
// through the REAL swrRun (no mocks of the orchestrator itself). The mirror
// reproduces TFP's wiring semantics 1:1 — its shape is source-grep-locked by
// tests/tfp-entry-swr-contract.test.js so mirror-vs-real drift fails there.
import { describe, it, expect, vi } from 'vitest';
import { swrRun } from '../src/lib/swrRead.js';

// ── Faithful mirror of the TFP orchestration (fetch gates + once-guards +
//    chip + loading gate + save-gate handle) with injected fetchers/state ──
function makeTfpOrchestration({ isEdit = false, customerId = 'LC-1', treatmentId = null, fetchers, failCacheApply = false }) {
  const state = {
    loading: true, syncing: false, error: '', applies: [], hydrations: 0, prefills: 0,
    options: null, cancelled: false, serverFresh: Promise.resolve(), applyFailures: 0,
  };
  let hydrated = false;
  let prefilled = false;

  // R2-#2b mirror: ONE shared server point-read for both passes
  let existingPromise = null;
  const fetchExistingOnce = () => {
    if (!existingPromise) existingPromise = fetchers.getTreatment(treatmentId);
    return existingPromise;
  };

  const fetchFormData = async (source) => {
    const opts = source ? { source } : {};
    const [productItems, courseItems] = await Promise.all([
      fetchers.listProducts(opts).catch(() => []),
      fetchers.listCourses(opts).catch(() => []),
    ]);
    if (source === 'cache' && productItems.length === 0 && courseItems.length === 0) return null;
    let custData = null;
    if (customerId) {
      try { custData = await fetchers.getCustomer(customerId, opts); } catch { custData = null; }
      if (source === 'cache' && !custData) return null;
    }
    let existing = null;
    if (isEdit && treatmentId) {
      // R1-lens2-#1 + R2-#2b mirror: treatment fetched SERVER-FRESH via ONE
      // shared memoized read — hydration/snapshot must never freeze to cache.
      try { existing = await fetchExistingOnce(); }
      catch (e) { if (source !== 'cache') throw e; existing = null; }
      if (source === 'cache' && !existing) return null;
    }
    return { productItems, courseItems, custData, existing };
  };

  const applyFormData = async (bundle, { fromCache } = {}) => {
    if (state.cancelled || !bundle) return;
    if (failCacheApply && fromCache) throw new Error('cache apply exploded');
    state.syncing = !!fromCache;
    state.applies.push({ fromCache: !!fromCache, products: bundle.productItems.length });
    state.options = { products: bundle.productItems, customerCourses: bundle.custData?.courses || [] };
    if (isEdit && treatmentId && bundle.existing && !hydrated) {
      hydrated = true;
      state.hydrations += 1;
    }
    if (!prefilled) { prefilled = true; state.prefills += 1; }
    if (!isEdit || hydrated) state.loading = false;
  };

  // R1-#1 + R2-#1a fix mirror: applies serialized into a chain with PER-LINK
  // catch (a rejected cache apply must not poison the chain); save-gate +
  // loading anchored on run AND the chain (the hydration tail).
  let applyChain = Promise.resolve();
  const run = swrRun({
    cacheLoad: async () => { const b = await fetchFormData('cache'); return { hasData: !!b, data: b }; },
    serverLoad: () => fetchFormData(undefined),
    apply: (b, meta) => {
      applyChain = applyChain
        .then(() => applyFormData(b, meta))
        .catch(() => { state.applyFailures += 1; });
    },
  });
  state.serverFresh = run.then(() => applyChain).catch(() => {});
  const done = run.then(() => applyChain)
    .catch((e) => { if (!state.cancelled) { state.error = e.message; state.syncing = false; } })
    .finally(() => { if (!state.cancelled) state.loading = false; });
  return { state, done, hooks: { onHydrationTail: (fn) => { state._tailHook = fn; } } };
}

const rows = (n) => Array.from({ length: n }, (_, i) => ({ id: `P${i}` }));
// settled-state probe: 'resolved' wins only if promise settles within 10ms
const gate = (promise) => Promise.race([
  promise.then(() => 'resolved'),
  new Promise((r) => setTimeout(() => r('pending'), 10)),
]);

// deferred helper
function deferred() {
  let resolve, reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

describe('AV208 F1 — cache hit paints BEFORE server; loading clears at the cache paint', () => {
  it('create mode: 2 applies (cache→server), loading false right after cache apply', async () => {
    const serverGate = deferred();
    const fetchers = {
      listProducts: async ({ source } = {}) => { if (source !== 'cache') await serverGate.promise; return rows(source === 'cache' ? 5 : 7); },
      listCourses: async () => rows(3),
      getCustomer: async () => ({ courses: [{ name: 'A' }] }),
      getTreatment: async () => null,
    };
    const { state, done } = makeTfpOrchestration({ fetchers });
    await vi.waitFor(() => expect(state.applies.length).toBe(1));
    // cache paint landed while the server leg is STILL pending:
    expect(state.applies[0].fromCache).toBe(true);
    expect(state.loading).toBe(false);   // ← the whole point of AV208
    expect(state.syncing).toBe(true);    // chip ON
    serverGate.resolve();
    await done;
    expect(state.applies.length).toBe(2);
    expect(state.applies[1].fromCache).toBe(false);
    expect(state.syncing).toBe(false);   // chip OFF on true server confirm
    expect(state.applies[1].products).toBe(7); // server data overrode
  });
});

describe('AV208 F2 — cache MISS = single (server) apply; no false paint', () => {
  for (const [name, fetchers] of [
    ['empty lists', {
      listProducts: async ({ source } = {}) => (source === 'cache' ? [] : rows(7)),
      listCourses: async ({ source } = {}) => (source === 'cache' ? [] : rows(2)),
      getCustomer: async () => ({ courses: [] }),
      getTreatment: async () => null,
    }],
    ['customer absent from cache', {
      listProducts: async () => rows(5),
      listCourses: async () => rows(3),
      getCustomer: async ({ }, { source } = {}) => { throw new Error('unused-shape'); },
      getTreatment: async () => null,
    }],
  ]) {
    it(`${name} → apply once from server, loading clears only then`, async () => {
      // customer-absent variant: throw ONLY on cache leg
      if (name === 'customer absent from cache') {
        fetchers.getCustomer = async (id, { source } = {}) => {
          if (source === 'cache') throw new Error('not in cache');
          return { courses: [] };
        };
      }
      const { state, done } = makeTfpOrchestration({ fetchers });
      await done;
      expect(state.applies.length).toBe(1);
      expect(state.applies[0].fromCache).toBe(false);
      expect(state.loading).toBe(false);
      expect(state.syncing).toBe(false);
    });
  }
});

describe('AV208 F3 — server failure', () => {
  it('lister failure on the server leg degrades to [] (pre-AV208 .catch(()=>[]) fidelity) — 2 applies, NO error', async () => {
    // NOTE (T10 bug-hunt watchlist): a failing SERVER lister overwrites a good
    // cache paint with empty lists. This mirrors the PRE-AV208 semantic (the
    // getters always carried .catch(() => []) — a lister failure showed empty
    // pickers). Real-world reach is tiny: a network-down getDocs FALLS BACK to
    // cache (doesn't throw), so a genuine throw = permission/index errors.
    // AV212 repoint (2026-07-20): swrRun legs now run in PARALLEL — the server
    // leg must be SLOWER than cache in this fixture so the cache paint
    // deterministically happens first (the scenario under test). Real machines
    // always have cache(ms) ≪ server(network).
    const slow = () => new Promise(r => setTimeout(r, 20));
    const fetchers = {
      listProducts: async ({ source } = {}) => { if (source !== 'cache') { await slow(); throw new Error('net down'); } return rows(5); },
      listCourses: async ({ source } = {}) => { if (source === 'cache') return rows(3); await slow(); return []; },
      getCustomer: async () => ({ courses: [] }),
      getTreatment: async () => null,
    };
    const { state, done } = makeTfpOrchestration({ fetchers });
    await done;
    expect(state.applies.length).toBe(2);
    expect(state.applies[0].fromCache).toBe(true);
    expect(state.error).toBe('');                  // lister failures degrade, not throw (pre-AV208 semantic)
    expect(state.loading).toBe(false);
  });

  it('edit mode, no cache: server getTreatment error PROPAGATES to setError (pre-AV208 fidelity)', async () => {
    const fetchers = {
      listProducts: async ({ source } = {}) => (source === 'cache' ? [] : rows(5)),
      listCourses: async ({ source } = {}) => (source === 'cache' ? [] : rows(2)),
      getCustomer: async () => ({ courses: [] }),
      // R1-lens2-#1: getTreatment is server-always — a throwing fetch = cache
      // leg swallows (MISS), server leg rethrows.
      getTreatment: async () => { throw new Error('perm denied'); },
    };
    const { state, done } = makeTfpOrchestration({ isEdit: true, treatmentId: 'BT-X', fetchers });
    await done;
    expect(state.error).toBe('perm denied');
    expect(state.loading).toBe(false); // finally clears — no infinite spinner
  });
});

describe('AV208 F4 — hydration + prefill run ONCE across both passes', () => {
  it('edit mode with cache: 2 applies but exactly 1 hydration + 1 prefill', async () => {
    // AV212 repoint: parallel legs — server slower so the cache pass paints
    // first (the two-apply scenario this test exists to exercise).
    const slow = () => new Promise(r => setTimeout(r, 20));
    const fetchers = {
      listProducts: async ({ source } = {}) => { if (source !== 'cache') await slow(); return rows(5); },
      listCourses: async ({ source } = {}) => { if (source !== 'cache') await slow(); return rows(3); },
      getCustomer: async () => ({ courses: [{ name: 'A' }] }),
      getTreatment: async () => ({ detail: { symptoms: 'x' } }),
    };
    const { state, done } = makeTfpOrchestration({ isEdit: true, treatmentId: 'BT-X', fetchers });
    await done;
    expect(state.applies.length).toBe(2);
    expect(state.hydrations).toBe(1);   // server pass must NOT re-hydrate (typing safe)
    expect(state.prefills).toBe(1);
  });

  it('R1-lens2-#1: the treatment is SERVER-fetched even on the cache pass — hydration is never cache-frozen', async () => {
    const treatmentCalls = [];
    // AV212 repoint: parallel legs — server slower (see above)
    const slow = () => new Promise(r => setTimeout(r, 20));
    const fetchers = {
      listProducts: async ({ source } = {}) => { if (source !== 'cache') await slow(); return rows(5); },
      listCourses: async ({ source } = {}) => { if (source !== 'cache') await slow(); return rows(3); },
      getCustomer: async () => ({ courses: [] }),
      getTreatment: async (...args) => { treatmentCalls.push(args); return { detail: { fresh: true } }; },
    };
    const { state, done } = makeTfpOrchestration({ isEdit: true, treatmentId: 'BT-X', fetchers });
    await done;
    // cache pass hydrates with the SERVER-fresh treatment (1 point-read) —
    // deliberate: stale-cache hydration caused the stock-snapshot divergence.
    expect(state.applies.length).toBe(2);
    expect(state.hydrations).toBe(1);
    expect(state.loading).toBe(false);
    // every getTreatment call carries NO source opt (server-always)
    for (const args of treatmentCalls) expect(args.length).toBe(1);
  });
});

describe('AV208 F8 — R1-#1 fix: save-gate + loading cover the HYDRATION TAIL', () => {
  it('gate stays pending until the async apply (inner awaits) fully completes', async () => {
    const tailGate = deferred();
    let tailDone = false;
    const fetchers = {
      listProducts: async () => rows(5),
      listCourses: async () => rows(3),
      getCustomer: async () => ({ courses: [] }),
      getTreatment: async () => null,
    };
    const orch = makeTfpOrchestration({ fetchers });
    // monkey-patch: extend the applyChain with a slow tail (mirrors the
    // edit-mode getSaleByTreatmentId/coupon restores inside applyFormData)
    orch.state.serverFresh = orch.state.serverFresh.then(async () => { await tailGate.promise; tailDone = true; });
    expect(await gate(orch.state.serverFresh)).toBe('pending');   // save would WAIT for the tail
    tailGate.resolve();
    await orch.done;
    expect(await gate(orch.state.serverFresh)).toBe('resolved');
    expect(tailDone).toBe(true);
  });

  it('R2-#1a: a REJECTED cache apply does NOT poison the chain — the server apply still runs', async () => {
    // AV212 repoint: parallel legs — server slower so the cache apply RUNS
    // (and explodes) before the server apply, exercising the poison guard.
    const slow = () => new Promise(r => setTimeout(r, 20));
    const fetchers = {
      listProducts: async ({ source } = {}) => { if (source !== 'cache') await slow(); return rows(5); },
      listCourses: async ({ source } = {}) => { if (source !== 'cache') await slow(); return rows(3); },
      getCustomer: async () => ({ courses: [] }),
      getTreatment: async () => null,
    };
    const { state, done } = makeTfpOrchestration({ fetchers, failCacheApply: true });
    await done;
    expect(state.applyFailures).toBe(1);                 // cache apply exploded — logged
    expect(state.applies.length).toBe(1);                // ...but the SERVER apply still landed
    expect(state.applies[0].fromCache).toBe(false);
    expect(state.error).toBe('');                        // no spurious setError from the apply
    await expect(state.serverFresh).resolves.toBeUndefined(); // gate opens (never hangs)
  });

  it('R2-#2b: the treatment is fetched EXACTLY ONCE across both passes (shared memoized read)', async () => {
    let treatmentReads = 0;
    const fetchers = {
      listProducts: async () => rows(5),
      listCourses: async () => rows(3),
      getCustomer: async () => ({ courses: [] }),
      getTreatment: async () => { treatmentReads += 1; return { detail: { fresh: true } }; },
    };
    const { state, done } = makeTfpOrchestration({ isEdit: true, treatmentId: 'BT-X', fetchers });
    await done;
    expect(treatmentReads).toBe(1);
    expect(state.hydrations).toBe(1);
  });

  it('applies are SERIALIZED — apply(server) never starts before apply(cache) finishes (no interleave)', async () => {
    const order = [];
    const applyDelay = deferred();
    // custom orchestration with an apply that suspends mid-flight on the cache pass
    let applyChain = Promise.resolve();
    const applyFormData = async (bundle, { fromCache }) => {
      order.push(`start-${fromCache ? 'cache' : 'server'}`);
      if (fromCache) await applyDelay.promise;   // cache apply suspends (like the coupon fetch)
      order.push(`end-${fromCache ? 'cache' : 'server'}`);
    };
    const run = swrRun({
      cacheLoad: async () => ({ hasData: true, data: { x: 1 } }),
      serverLoad: async () => ({ x: 2 }),
      apply: (b, meta) => { applyChain = applyChain.then(() => applyFormData(b, { fromCache: !!meta.fromCache })); },
    });
    await run;
    applyDelay.resolve();
    await applyChain;
    expect(order).toEqual(['start-cache', 'end-cache', 'start-server', 'end-server']);
  });
});

describe('AV208 F5 — save-gate (Q2=A)', () => {
  it('pending server leg → gate pending; resolves → gate opens', async () => {
    const serverGate = deferred();
    const fetchers = {
      listProducts: async ({ source } = {}) => { if (source !== 'cache') await serverGate.promise; return rows(5); },
      listCourses: async () => rows(3),
      getCustomer: async () => ({ courses: [] }),
      getTreatment: async () => null,
    };
    const { state, done } = makeTfpOrchestration({ fetchers });
    await vi.waitFor(() => expect(state.applies.length).toBe(1));
    expect(await gate(state.serverFresh)).toBe('pending');   // save would wait
    serverGate.resolve();
    await done;
    expect(await gate(state.serverFresh)).toBe('resolved');  // save proceeds
  });

  it('server leg REJECTED (getTreatment rethrow — the real rejecting path) → save-gate handle still resolves', async () => {
    const fetchers = {
      listProducts: async ({ source } = {}) => (source === 'cache' ? [] : rows(5)),
      listCourses: async ({ source } = {}) => (source === 'cache' ? [] : rows(2)),
      getCustomer: async () => ({ courses: [] }),
      getTreatment: async (id, { source } = {}) => { if (source === 'cache') throw new Error('not in cache'); throw new Error('perm denied'); },
    };
    const { state, done } = makeTfpOrchestration({ isEdit: true, treatmentId: 'BT-X', fetchers });
    await done;
    expect(state.error).toBe('perm denied');                   // run itself rejected
    await expect(state.serverFresh).resolves.toBeUndefined();  // .catch(() => {}) → never blocks a save forever
  });

  it('bounded 15s: Promise.race(gate, timeout) opens even if the leg never settles (fake timers)', async () => {
    vi.useFakeTimers();
    try {
      const never = new Promise(() => {});
      const race = Promise.race([never, new Promise((r) => setTimeout(r, 15000))]);
      let opened = false;
      race.then(() => { opened = true; });
      await vi.advanceTimersByTimeAsync(14999);
      expect(opened).toBe(false);
      await vi.advanceTimersByTimeAsync(2);
      expect(opened).toBe(true);
    } finally { vi.useRealTimers(); }
  });
});

describe('AV208 F6 — offline honesty (network-down server leg serves cache)', () => {
  it('__fromCache-tagged server result keeps the chip ON', async () => {
    const tagged = Object.defineProperty(rows(5), '__fromCache', { value: true, enumerable: false });
    const fetchers = {
      listProducts: async () => tagged,   // both legs return the tagged rows
      listCourses: async () => rows(3),
      getCustomer: async () => ({ courses: [] }),
      getTreatment: async () => null,
    };
    // mirror the REAL apply meta path: swrRun._resultFromCache inspects the
    // bundle object's member arrays for __fromCache
    const { state, done } = makeTfpOrchestration({ fetchers });
    await done;
    const last = state.applies[state.applies.length - 1];
    expect(last.fromCache).toBe(true);   // server leg reported fromCache → chip stays
    expect(state.syncing).toBe(true);
  });
});

describe('AV208 F7 — adversarial', () => {
  it('server returns EMPTY lists → still paints (server = truth; clinic with no products)', async () => {
    const fetchers = {
      listProducts: async ({ source } = {}) => (source === 'cache' ? [] : []),
      listCourses: async () => [],
      getCustomer: async () => ({ courses: [] }),
      getTreatment: async () => null,
    };
    const { state, done } = makeTfpOrchestration({ fetchers });
    await done;
    expect(state.applies.length).toBe(1);
    expect(state.loading).toBe(false);
  });

  it('cancelled mid-flight → NO state writes after cancellation', async () => {
    const serverGate = deferred();
    const fetchers = {
      listProducts: async ({ source } = {}) => { if (source !== 'cache') await serverGate.promise; return rows(5); },
      listCourses: async () => rows(3),
      getCustomer: async () => ({ courses: [] }),
      getTreatment: async () => null,
    };
    const { state, done } = makeTfpOrchestration({ fetchers });
    await vi.waitFor(() => expect(state.applies.length).toBe(1));
    state.cancelled = true;               // effect re-ran / unmounted
    serverGate.resolve();
    await done;
    expect(state.applies.length).toBe(1); // server apply suppressed
    expect(state.syncing).toBe(true);     // no post-cancel writes (stale closure discarded)
  });

  it('customer doc without courses[] → paints with empty customerCourses (no crash)', async () => {
    const fetchers = {
      listProducts: async () => rows(5),
      listCourses: async () => rows(3),
      getCustomer: async () => ({}),      // no courses field
      getTreatment: async () => null,
    };
    const { state, done } = makeTfpOrchestration({ fetchers });
    await done;
    expect(state.options.customerCourses).toEqual([]);
    expect(state.loading).toBe(false);
  });
});
