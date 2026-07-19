// ─── e2e-client-error-endpoint.mjs (2026-07-19) — Rule Q L2 ────────────────
// Invokes the REAL api/client-error.js handler (the exact code Vercel runs)
// against REAL prod Firestore with mock req/res: valid post → stored with the
// URL token value STRIPPED server-side · invalid → 400 · over-cap → 200
// dropped (no retry storm) · method gates. TEST- fixture + meta counter fully
// cleaned up (zero-orphan discipline).
//
//   node scripts/e2e-client-error-endpoint.mjs
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { getFirestore } from 'firebase-admin/firestore';

const PREFIX = 'artifacts/loverclinic-opd-4c39b/public/data';

function loadEnv() {
  if (process.env.FIREBASE_ADMIN_PRIVATE_KEY) return;
  const raw = readFileSync(new URL('../.env.local.prod', import.meta.url), 'utf8');
  for (const line of raw.split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)="?([\s\S]*?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
}

function mockRes() {
  const r = { statusCode: 0, body: null, headers: {} };
  return {
    setHeader: (k, v) => { r.headers[k] = v; },
    status: (c) => ({ json: (b) => { r.statusCode = c; r.body = b; return r; }, end: () => { r.statusCode = c; } }),
    _r: r,
  };
}

async function main() {
  loadEnv();
  const handler = (await import('../api/client-error.js')).default;
  let pass = 0, fail = 0;
  const ok = (cond, label) => { if (cond) { pass++; console.log('  ✅', label); } else { fail++; console.log('  ❌', label); } };

  // T1: valid TEST error → 200 ok + doc lands with sanitized fields
  console.log('T1 valid post → stored');
  const res1 = mockRes();
  await handler({
    method: 'POST', headers: {},
    body: {
      message: 'TEST-L2 infra-observability verify (delete me)',
      stack: 'Error: TEST-L2\n  at l2 (/scratch:1:1)',
      url: '/?patient=SHOULD_BE_STRIPPED&tab=x',
      ua: 'l2-script', surface: 'patient', clientTs: Date.now(),
    },
  }, res1);
  ok(res1._r.statusCode === 200 && res1._r.body?.ok === true && !res1._r.body?.dropped,
    `POST → 200 ok (got ${res1._r.statusCode} ${JSON.stringify(res1._r.body)})`);

  const db = getFirestore();
  const snap = await db.collection(`${PREFIX}/client_error_log`)
    .where('message', '==', 'TEST-L2 infra-observability verify (delete me)').get();
  ok(snap.docs.length === 1, `doc stored (found ${snap.docs.length})`);
  const d = snap.docs[0]?.data() || {};
  ok(d.url === '/?patient=&tab=', `URL token value STRIPPED server-side (got "${d.url}")`);
  ok(typeof d.createdAtMs === 'number' && String(d.hash || '').startsWith('e'), 'createdAtMs + hash present');

  // T2: invalid body → 400
  console.log('T2 invalid body → 400');
  const res2 = mockRes();
  await handler({ method: 'POST', headers: {}, body: { noMessage: true } }, res2);
  ok(res2._r.statusCode === 400, `400 on bad body (got ${res2._r.statusCode})`);

  // T3: daily cap → dropped:true (simulate count=500; meta restored after)
  console.log('T3 daily cap → dropped');
  const metaRef = db.doc(`${PREFIX}/client_error_log_meta/daily`);
  const metaBefore = (await metaRef.get()).data() || null;
  const dateKey = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10).replace(/-/g, '');
  await metaRef.set({ dateKey, count: 500 });
  const res3 = mockRes();
  await handler({ method: 'POST', headers: {}, body: { message: 'TEST-L2 over-cap (must be dropped)' } }, res3);
  ok(res3._r.statusCode === 200 && res3._r.body?.dropped === true,
    `over-cap → 200 dropped (got ${res3._r.statusCode} ${JSON.stringify(res3._r.body)})`);
  const overCap = await db.collection(`${PREFIX}/client_error_log`).where('message', '==', 'TEST-L2 over-cap (must be dropped)').get();
  ok(overCap.empty, 'over-cap doc NOT stored');

  // T4: method gates
  console.log('T4 method gates');
  const res4 = mockRes();
  await handler({ method: 'GET', headers: {} }, res4);
  ok(res4._r.statusCode === 405, `GET → 405 (got ${res4._r.statusCode})`);

  // cleanup: delete TEST doc + restore meta counter exactly
  for (const doc of snap.docs) await doc.ref.delete();
  if (metaBefore) await metaRef.set(metaBefore); else await metaRef.delete();
  const check = await db.collection(`${PREFIX}/client_error_log`).where('ua', '==', 'l2-script').get();
  ok(check.empty, 'cleanup: zero TEST fixtures remain');
  const metaAfter = (await metaRef.get()).data() || null;
  ok(JSON.stringify(metaAfter) === JSON.stringify(metaBefore), 'cleanup: meta counter restored');

  console.log(`\nRESULT: ${pass} pass / ${fail} fail`);
  process.exit(fail ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
}
