// A1 (2026-07-07 instant cold-start, spec Q1=A) — layer 0: persistent Firestore
// cache. Source-grep locks on src/firebase.js + the storage.persist() call in
// App.jsx. Spec: docs/superpowers/specs/2026-07-07-instant-staff-app-cold-start-design.html
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';

const fb = readFileSync('src/firebase.js', 'utf8');
const app = readFileSync('src/App.jsx', 'utf8');

describe('A1 — persistentLocalCache (layer 0)', () => {
  it('A1.1 imports persistentLocalCache + persistentMultipleTabManager', () => {
    expect(fb).toMatch(/persistentLocalCache/);
    expect(fb).toMatch(/persistentMultipleTabManager/);
  });

  it('A1.2 feature-detects IndexedDB so node/vitest + private-mode fall back to memory cache (pre-A1 behavior)', () => {
    // Degradation-matrix M7 repoint (2026-07-20): the bare typeof check became
    // the idbHealthy() PRE-FLIGHT PROBE (same invariant + catches a
    // sync-THROWING IndexedDB that tripped a Firestore internal assertion and
    // crashed the app). node/vitest still → false → memory cache.
    expect(fb).toMatch(/typeof indexedDB === 'undefined'\) return false/);
    // AV212 rule-8 repoint (2026-07-20): + the slow-machine no-persist ratchet
    expect(fb).toMatch(/const canPersist = idbHealthy\(\) && !slowMachineNoPersist;/);
  });

  it('A1.3 keeps experimentalAutoDetectLongPolling (Mobile-Load Reliability 2026-06-16 — must survive A1)', () => {
    expect(fb).toMatch(/experimentalAutoDetectLongPolling: true/);
  });

  it('A1.4 multi-tab manager wired INSIDE persistentLocalCache (staff opens frontend + backend tabs together)', () => {
    // AV208 repoint (2026-07-18): the call gained cacheSizeBytes — lock the
    // INVARIANT (tabManager inside persistentLocalCache), not the full literal.
    expect(fb).toMatch(/persistentLocalCache\(\{\s*tabManager:\s*persistentMultipleTabManager\(\)/);
  });

  it('A1.5 App.jsx requests storage.persist() for staff (non-anonymous) users — best-effort, optional-chained', () => {
    expect(app).toMatch(/navigator\.storage\?\.persist\?\.\(\)/);
    // guarded to staff — anonymous customer-link visitors must not trigger it
    const idx = app.indexOf('navigator.storage?.persist?.()');
    const window = app.slice(Math.max(0, idx - 400), idx);
    expect(window).toMatch(/isAnonymous/);
  });

  it('A1.6 anti-regression: the pre-A1 "NO offline persistence" comment contract is GONE (Q1 reversed for staff)', () => {
    expect(fb).not.toMatch(/NO offline persistence/);
  });
});
