// swrRead — stale-while-revalidate orchestrator for one-shot staff loads.
//
// B1 (2026-07-07 instant cold-start, spec Q1=A/Q2=A). With persistentLocalCache
// (firebase.js A1) listeners get SWR for free, but one-shot getDocs is ALWAYS
// server-first. Staff surfaces that mount-load via one-shot getters use this
// orchestrator: paint the last-seen data from IndexedDB instantly, then let the
// server leg correct it.
//
// Contract (locked by tests/instant-coldstart-swr-read.test.js):
//   - cache leg is BEST-EFFORT: any throw is silent (cold cache), and an EMPTY
//     cache result NEVER paints — avoids a false "ไม่มีรายการ" empty-state flash
//     on first-ever devices. cacheLoad returns { hasData, data }.
//   - server leg is the source of truth; its errors PROPAGATE to the caller's
//     existing resilient/error path (never swallowed — Rule Q-honest).
//   - apply(data, { fromCache }) is called at most twice, cache first.
//
// STAFF ONLY. Customer-facing pages use src/lib/freshGate.js (server-truth
// only). ⛔ Never feed cache-leg data into a read→decide→WRITE flow (AV206.c) —
// money/stock decisions read inside transactions (Rule T) which are server-only.
// swrList — one-line adoption for the common staff-tab shape
// `setItems(await listX(opts))`. fetchBySource(source) returns the rows;
// apply(rows, { fromCache }) sets state. Empty-array cache results never paint
// (same no-empty-flash guard as swrRun).
export async function swrList(fetchBySource, apply) {
  return swrRun({
    cacheLoad: async () => {
      const r = await fetchBySource('cache');
      const hasData = Array.isArray(r) ? r.length > 0 : !!r;
      return { hasData, data: r };
    },
    serverLoad: () => fetchBySource(undefined),
    apply,
  });
}

export async function swrRun({ cacheLoad, serverLoad, apply }) {
  // Degradation-matrix fix (2026-07-20) — legs run in PARALLEL. The original
  // sequential form (`await cacheLoad()` THEN `serverLoad()`) made a slow/hung
  // IndexedDB read DELAY the server truth on exactly the machines that can
  // least afford it (slow eMMC / corrupt-profile mini PCs). Now the server leg
  // starts immediately; the cache leg paints only while the server hasn't
  // applied yet (a late cache settle is a no-op — never stale-over-fresh).
  // Contract preserved: apply ≤2 times · cache (if painted) strictly before
  // server · server errors PROPAGATE · empty cache never paints. After a
  // server-leg ERROR a late cache settle MAY still paint (graceful
  // degradation — same data the sequential form would have painted first).
  let paintedFromCache = false;
  // AV212 hunt R1 fix (2026-07-20): guard on server SETTLED (resolve OR reject),
  // not just applied. The prior version only set the flag on RESOLVE, so when
  // the server leg REJECTED (fast: rules/auth/index errors — network-down serves
  // cache, it doesn't reject), a still-hung cacheLoad could settle LATER and
  // paint stale data as the TERMINAL state — reversing the consumer's error
  // reset and sticking its syncing chip ON forever (swrRun findings #1+#2). Now
  // once the server leg settles either way, a late cache settle is a no-op and
  // the consumer's catch owns the terminal state (restores the old sequential
  // guarantee without losing the parallel-start speed-up).
  let serverSettled = false;
  const cacheLeg = (async () => {
    try {
      const c = await cacheLoad();
      if (!serverSettled && c && c.hasData) {
        apply(c.data, { fromCache: true });
        paintedFromCache = true;
      }
    } catch { /* cold cache / persistence unavailable — silent, server leg decides */ }
  })();
  let fresh;
  try {
    fresh = await serverLoad(); // throws → caller's error path
  } catch (e) {
    serverSettled = true;       // suppress any late cache paint; caller's catch is terminal
    cacheLeg.catch(() => {});
    throw e;
  }
  serverSettled = true;
  // B1-fix (caught by the S1 Playwright spec): a network-down "server" getDocs
  // silently falls back to cache — the data layer tags such results with a
  // non-enumerable __fromCache so the syncing indicator stays HONEST.
  apply(fresh, { fromCache: _resultFromCache(fresh) });
  cacheLeg.catch(() => {}); // never an unhandled rejection (leg is self-caught)
  return { paintedFromCache };
}

// true when the server-leg result actually came from the local cache (network
// down). Checks the array itself, or — for composite results (tuple/object of
// arrays) — any member array.
export function _resultFromCache(data) {
  if (!data || typeof data !== 'object') return false;
  if (data.__fromCache === true) return true;
  if (Array.isArray(data)) return data.some((v) => v && v.__fromCache === true);
  return Object.values(data).some((v) => v && v.__fromCache === true);
}
