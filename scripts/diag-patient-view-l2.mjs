// ─── diag-patient-view-l2.mjs — Rule Q L2 for the patient-view refactor ──────
// perf link-patient LCP (2026-07-07): api/patient-view.js branch-name gets were
// parallelized (Promise.all over unique branchIds — output must be IDENTICAL).
// This runs the LOCAL handler (new code, real admin SDK, real prod Firestore)
// and diffs its JSON against the LIVE deployed endpoint (old code until the
// next deploy; same code after). Identical modulo `fetchedAt` ⇒ refactor is
// output-preserving. READ-ONLY (Rule R standing authorization).
//
// Usage: node scripts/diag-patient-view-l2.mjs [token]
//        (token defaults to docs/perf/links.json .patient)
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

function loadEnv() {
  const envText = readFileSync('.env.local.prod', 'utf-8');
  for (const line of envText.split('\n')) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=("?)(.*)\2$/);
    if (m) process.env[m[1]] = m[3];
  }
}

function fakeRes() {
  const r = { statusCode: 0, body: null, headers: {} };
  return {
    setHeader: (k, v) => { r.headers[k] = v; },
    status: (c) => ({ json: (b) => { r.statusCode = c; r.body = b; return r; }, end: () => { r.statusCode = c; } }),
    _r: r,
  };
}

async function main() {
  loadEnv();
  const token = process.argv[2] || JSON.parse(readFileSync('docs/perf/links.json', 'utf8')).patient;
  const { default: handler } = await import('../api/patient-view.js');

  // LOCAL handler (new code) against real prod Firestore
  const res = fakeRes();
  const t0 = Date.now();
  await handler({ method: 'GET', query: { token } }, res);
  const localMs = Date.now() - t0;
  const local = res._r.body;

  // LIVE deployed endpoint
  const t1 = Date.now();
  const liveResp = await fetch(`https://lover-clinic-app.vercel.app/api/patient-view?token=${encodeURIComponent(token)}`);
  const liveMs = Date.now() - t1;
  const live = await liveResp.json();

  const strip = (o) => JSON.stringify({ ...o, fetchedAt: null });
  const identical = strip(local) === strip(live);
  console.log(`local handler: ${res._r.statusCode} in ${localMs}ms · live endpoint: ${liveResp.status} in ${liveMs}ms`);
  console.log(`payload identical (modulo fetchedAt): ${identical ? 'PASS' : 'FAIL'}`);
  if (!identical) {
    console.log('--- local ---'); console.log(strip(local).slice(0, 2000));
    console.log('--- live ----'); console.log(strip(live).slice(0, 2000));
    process.exit(1);
  }
  console.log(`appointments: ${local.appointments?.length ?? 0} · courses: ${local.courses?.length ?? 0} · expired: ${local.expiredCourses?.length ?? 0}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
