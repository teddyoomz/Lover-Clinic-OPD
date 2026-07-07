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
export async function swrRun({ cacheLoad, serverLoad, apply }) {
  let paintedFromCache = false;
  try {
    const c = await cacheLoad();
    if (c && c.hasData) {
      apply(c.data, { fromCache: true });
      paintedFromCache = true;
    }
  } catch { /* cold cache / persistence unavailable — silent, server leg decides */ }
  const fresh = await serverLoad(); // throws → caller's error path
  apply(fresh, { fromCache: false });
  return { paintedFromCache };
}
