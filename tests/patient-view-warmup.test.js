// patient-view warmup (2026-07-19) — perf punchlist residual closed.
//
// /api/patient-view COLD start ≈ 3.5s (admin init + first Firestore RTT) was
// the remaining ?patient= LCP floor after AV204. Vercel lambdas are
// per-function → warming must go THROUGH the real endpoint: a */5 cron
// fetches `?ping=1`, which runs getDb() + a bounded 1-doc read inside the
// patient-view container and returns only {ok:true} (no data, no writes).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const PV = readFileSync(path.resolve(process.cwd(), 'api/patient-view.js'), 'utf8');
const CRON = readFileSync(path.resolve(process.cwd(), 'api/cron/patient-view-warmup.js'), 'utf8');
const VERCEL = JSON.parse(readFileSync(path.resolve(process.cwd(), 'vercel.json'), 'utf8'));

describe('PVW — patient-view warmup contract', () => {
  it('PVW.1 ping mode exists, runs getDb + a BOUNDED read, returns no customer data', () => {
    const i = PV.indexOf("req.query.ping === '1'");
    expect(i).toBeGreaterThan(-1);
    const w = PV.slice(i, i + 600);
    expect(w).toMatch(/getDb\(\)/);
    expect(w).toMatch(/limit\(1\)\.get\(\)/);
    expect(w).toMatch(/ping: true/);
    // no customer payload leaves the ping branch (the block returns before
    // any token/customer logic — ordering locked by PVW.2)
    expect(w.slice(0, w.indexOf('const token'))).not.toMatch(/customerData/);
  });

  it('PVW.2 ping short-circuits BEFORE the token gate (no token needed, no 404 path)', () => {
    expect(PV.indexOf("req.query.ping === '1'"))
      .toBeLessThan(PV.indexOf("const token = String(req.query.token || '')"));
  });

  it('PVW.3 ping performs ZERO writes (read-only warm)', () => {
    const i = PV.indexOf("req.query.ping === '1'");
    const w = PV.slice(i, i + 600);
    expect(w).not.toMatch(/\.set\(|\.update\(|\.delete\(|\.add\(/);
  });

  it('PVW.4 cron: canonical CRON_SECRET gate (Bearer or x-cron-secret) + fetches the real endpoint', () => {
    expect(CRON).toMatch(/process\.env\.CRON_SECRET/);
    expect(CRON).toMatch(/x-cron-secret/);
    expect(CRON).toMatch(/status\(401\)/);
    expect(CRON).toMatch(/\/api\/patient-view\?ping=1/);
    // non-fatal failure semantics (a failed warm = pre-cron cold behavior)
    expect(CRON).toMatch(/ok: false, error: String\(/);
  });

  it('PVW.5 vercel.json registers the cron at */5', () => {
    const entry = (VERCEL.crons || []).find(c => c.path === '/api/cron/patient-view-warmup');
    expect(entry).toBeTruthy();
    expect(entry.schedule).toBe('*/5 * * * *');
  });
});
